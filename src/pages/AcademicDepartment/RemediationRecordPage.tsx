import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useSelector } from 'react-redux';
import { RootState } from '@/store';
import MainLayout from '@/layouts/MainLayout';
import BackButton from '@/components/Shared/BackButton';
import AcademicYearSemesterFilter from '@/components/Shared/AcademicYearSemesterFilter';
import { firestore as db } from '@/firebase';
import {
    collection, doc, getDoc, getDocs, addDoc, updateDoc, setDoc, serverTimestamp,
} from 'firebase/firestore';
import Swal from 'sweetalert2';
import { usePermissions } from '@/hooks/usePermissions';
import {
    RefreshCw, Search, CheckCircle2, Clock, ClipboardEdit, AlertCircle, Pencil, RotateCcw, ChevronLeft, ChevronRight,
} from 'lucide-react';
import { useResponsivePwaMode as usePwaMode } from '@/hooks/useResponsivePwaMode';
import { FlaggedCourse, fetchFlaggedStudents } from '@/utils/remediationUtils';

// หน้า "บันทึก 0 ร มส" (เมนูข้อ 4) — ให้เลือกได้ทั้ง "รายวิชา" (0/ร/มส) และ "กิจกรรม" (มผ ของกิจกรรม
// พัฒนาผู้เรียน รหัสขึ้นต้นด้วย "ก": ชุมนุม, ลูกเสือ-เนตรนารี, รด., แนะแนว ฯลฯ) จาก dropdown เดียว แบ่งกลุ่ม
// ด้วย optgroup — ออกแบบให้เหมือนหน้า "คำร้องขอแก้ตัว" (RemediationRequestsPage)
// ทุกครั้งที่บันทึก: เขียนผลใหม่ลง grades/evaluations doc ตรงๆ พร้อมสร้าง/ปิดคำร้องใน remediation_requests
// ควบคู่กันเสมอ (status: 'resolved') เพื่อเก็บประวัติ — ไม่รอให้มีคำร้อง pending มาก่อนเหมือนหน้า "คำร้องขอแก้ตัว"
// "เรียนซ้ำ" ที่นี่เขียน status:'failed' ลง evaluations จริง เพราะวิชากิจกรรมมีค่า "ไม่ผ่าน" เป็นสถานะที่
// เก็บได้จริงในระบบ (ไม่เหมือนวิชาปกติที่ไม่มีเกรด "เรียนซ้ำ")

interface FlagRowWithStudent {
    key: string;
    studentId: string;
    studentCode: string;
    studentName: string;
    classLevel: string;
    room: string;
    number: string;
    flag: FlaggedCourse;
    requestId?: string;
    requestStatus: 'no_request' | 'pending' | 'resolved';
}

const GRADE_OPTIONS = ['4', '3.5', '3', '2.5', '2', '1.5', '1', '0'];
const PAGE_SIZE_OPTIONS = [10, 25, 50, 100];

const requestDedupKey = (studentId: string, activityId: string, academicYear: string, semester: string) =>
    `${studentId}|${activityId}|${academicYear}|${semester}`;

const RemediationRecordPage: React.FC = () => {
    const { user: currentUser, hasRole, ACADEMIC_MANAGEMENT } = usePermissions();
    const teacherMap = useSelector((state: RootState) => (state as any).userMap?.teachers || {});
    const schoolId = (currentUser as any)?.schoolId;
    const isAcademicManagement = hasRole(ACADEMIC_MANAGEMENT);
    const calendarAcademicYear = useSelector((state: RootState) => state.calendar.academicYear);
    const isPwaMode = usePwaMode();

    const [loading, setLoading] = useState(true);
    const [rows, setRows] = useState<FlagRowWithStudent[]>([]);
    const [selectedCourseKey, setSelectedCourseKey] = useState<string>('');
    const [search, setSearch] = useState('');
    const [correctingKey, setCorrectingKey] = useState<string | null>(null);
    const [remarkSavingKey, setRemarkSavingKey] = useState<string | null>(null);
    const [currentPage, setCurrentPage] = useState(1);
    const [pageSize, setPageSize] = useState(10);

    // ปีการศึกษา/ภาคเรียนที่ต้องการย้อนดู — อ้างอิงรายชื่อปีการศึกษาจาก /academic/school-calendar
    const [termYear, setTermYear] = useState<string>(() => sessionStorage.getItem('rmrec_termYear') ?? '');
    const [termSemester, setTermSemester] = useState<string>(() => sessionStorage.getItem('rmrec_termSemester') || '');

    useEffect(() => {
        sessionStorage.setItem('rmrec_termYear', termYear);
        sessionStorage.setItem('rmrec_termSemester', termSemester);
    }, [termYear, termSemester]);

    useEffect(() => {
        if (sessionStorage.getItem('rmrec_termYear') === null && calendarAcademicYear) {
            setTermYear(calendarAcademicYear);
        }
    }, [calendarAcademicYear]);

    const loadData = useCallback(async () => {
        if (!schoolId) return;
        setLoading(true);
        try {
            const [flagRows, requestSnap] = await Promise.all([
                fetchFlaggedStudents(schoolId, teacherMap, {
                    classLevelFilter: 'all',
                    academicYear: termYear || undefined,
                    semester: termSemester || undefined,
                }),
                getDocs(collection(db, 'school-settings', schoolId, 'remediation_requests')),
            ]);

            const requestMap: Record<string, { id: string; status: string }> = {};
            requestSnap.docs.forEach(d => {
                const data: any = d.data();
                if (data.status === 'cancelled') return;
                const idValue = data.flagType === 'course' ? data.courseId : data.activityId;
                const key = requestDedupKey(data.studentId, idValue, data.academicYear, data.semester);
                if (!requestMap[key] || data.status === 'resolved') {
                    requestMap[key] = { id: d.id, status: data.status };
                }
            });

            const merged: FlagRowWithStudent[] = [];
            flagRows.forEach(sr => {
                sr.flags.forEach((flag, idx) => {
                    // ครูทั่วไปเห็นเฉพาะวิชา/กิจกรรมที่ตัวเองรับผิดชอบ — ฝ่ายวิชาการเห็นทั้งโรงเรียน
                    if (!isAcademicManagement && !flag.responsibleTeacherIds?.includes(currentUser?.uid || '')) return;

                    const idForKey = flag.flagKind === 'course' ? flag.courseId : flag.activityDocId;
                    if (!idForKey) return;
                    const key = requestDedupKey(sr.id, idForKey, flag.academicYear, flag.semester);
                    const req = requestMap[key];
                    const requestStatus = req ? (req.status as 'pending' | 'resolved') : 'no_request';
                    // หมายเหตุ: ตั้งใจ "ไม่" ซ่อนแถวที่มีคำร้อง resolved อยู่แล้ว — fetchFlaggedStudents คืนเฉพาะ
                    // นักเรียนที่ "ยังติดผลจริงอยู่ตอนนี้" เท่านั้น (อ่านจากเกรด/ผลประเมินสดๆ) ถ้าเคย resolved แล้ว
                    // แต่ผลจริงกลับมาติดอีก (เช่น มีคนบันทึกทับข้อมูลเดิมซ้ำ หรือแก้ผิดคน) ต้องยังโผล่ให้แก้ไขใหม่ได้
                    // เสมอ ไม่งั้นจะซ่อนถาวรทั้งที่ยังไม่ได้แก้จริง — ใช้ requestStatus แค่โชว์ป้ายบอกประวัติเท่านั้น

                    merged.push({
                        key: `${key}|${idx}`,
                        studentId: sr.id,
                        studentCode: sr.studentCode,
                        studentName: sr.name,
                        classLevel: sr.classLevel,
                        room: sr.room,
                        number: sr.number,
                        flag,
                        requestId: req?.id,
                        requestStatus,
                    });
                });
            });
            setRows(merged);
        } catch (err) {
            console.error('Error loading activity remediation records:', err);
            Swal.fire('ผิดพลาด', 'ไม่สามารถโหลดข้อมูลได้', 'error');
        } finally {
            setLoading(false);
        }
    }, [schoolId, teacherMap, isAcademicManagement, currentUser?.uid, termYear, termSemester]);

    useEffect(() => { loadData(); }, [loadData]);

    const courseOptions = useMemo(() => {
        const map = new Map<string, { key: string; label: string; count: number; isActivity: boolean }>();
        rows.forEach(r => {
            const key = `${r.flag.courseId}|${r.flag.academicYear}|${r.flag.semester}`;
            const label = `${r.flag.courseCode} ${r.flag.courseTitle} (ปี ${r.flag.academicYear}/${r.flag.semester})`;
            if (!map.has(key)) map.set(key, { key, label, count: 0, isActivity: r.flag.flagKind !== 'course' });
            map.get(key)!.count += 1;
        });
        return Array.from(map.values()).sort((a, b) => a.label.localeCompare(b.label, 'th'));
    }, [rows]);

    const subjectOptions = useMemo(() => courseOptions.filter(o => !o.isActivity), [courseOptions]);
    const activityOptions = useMemo(() => courseOptions.filter(o => o.isActivity), [courseOptions]);

    useEffect(() => {
        // เลือกวิชาแรกอัตโนมัติเมื่อยังไม่เคยเลือก หรือวิชาที่เลือกไว้ไม่มีในตัวเลือกแล้ว (เช่น เปลี่ยนปี/ภาคเรียน)
        if (courseOptions.length === 0) return;
        if (!selectedCourseKey || !courseOptions.some(o => o.key === selectedCourseKey)) {
            setSelectedCourseKey(courseOptions[0].key);
        }
    }, [courseOptions, selectedCourseKey]);

    const filteredRows = useMemo(() => {
        const kw = search.trim().toLowerCase();
        return rows.filter(r => {
            const courseKey = `${r.flag.courseId}|${r.flag.academicYear}|${r.flag.semester}`;
            if (courseKey !== selectedCourseKey) return false;
            if (!kw) return true;
            return `${r.studentName} ${r.studentCode}`.toLowerCase().includes(kw);
        });
    }, [rows, selectedCourseKey, search]);

    const stats = useMemo(() => ({
        pendingInCourse: filteredRows.length,
        withRequest: filteredRows.filter(r => r.requestStatus === 'pending').length,
        courseCount: courseOptions.length,
    }), [filteredRows, courseOptions]);

    useEffect(() => { setCurrentPage(1); }, [selectedCourseKey, search, pageSize]);

    const totalPages = Math.max(1, Math.ceil(filteredRows.length / pageSize));
    const pagedRows = useMemo(
        () => filteredRows.slice((currentPage - 1) * pageSize, currentPage * pageSize),
        [filteredRows, currentPage, pageSize]
    );

    const handleCorrect = async (row: FlagRowWithStudent, mode: 'pass' | 'repeat') => {
        const isCourse = row.flag.flagKind === 'course';
        let displayValue: string;
        let newGradeValue: string | undefined;

        if (isCourse) {
            if (mode === 'pass') {
                const { value } = await Swal.fire({
                    title: 'บันทึกผลแก้ตัว',
                    html: `<div style="text-align:left;font-size:13px;margin-bottom:8px">${row.studentName} (${row.studentCode})<br/>วิชา: <b>${row.flag.courseTitle || row.flag.courseCode}</b> — ผลเดิม: <b>${row.flag.grade}</b></div>`,
                    input: 'select',
                    inputOptions: GRADE_OPTIONS.reduce((acc: any, g) => { acc[g] = g; return acc; }, {}),
                    inputPlaceholder: 'เลือกผลการเรียนใหม่',
                    showCancelButton: true,
                    confirmButtonText: 'บันทึก',
                    cancelButtonText: 'ยกเลิก',
                    confirmButtonColor: '#4f46e5',
                });
                if (!value) return;
                newGradeValue = value;
                displayValue = value;
            } else {
                const confirm = await Swal.fire({
                    icon: 'warning',
                    title: 'ยืนยันให้เรียนซ้ำ',
                    html: `<div style="text-align:left;font-size:13px">${row.studentName} (${row.studentCode})<br/>วิชา: <b>${row.flag.courseTitle || row.flag.courseCode}</b><br/><br/>จะบันทึกสถานะเป็น "เรียนซ้ำ" ในระบบคำร้อง โดย<b>ไม่เปลี่ยนแปลงเกรดเดิม</b>ในฐานข้อมูล</div>`,
                    showCancelButton: true,
                    confirmButtonText: 'ยืนยัน',
                    cancelButtonText: 'ยกเลิก',
                    confirmButtonColor: '#f59e0b',
                });
                if (!confirm.isConfirmed) return;
                displayValue = 'เรียนซ้ำ';
            }
        } else {
            const confirm = mode === 'repeat'
                ? await Swal.fire({
                    icon: 'warning',
                    title: 'ยืนยันให้เรียนซ้ำ',
                    html: `<div style="text-align:left;font-size:13px">${row.studentName} (${row.studentCode})<br/>กิจกรรม: <b>${row.flag.courseTitle || row.flag.courseCode}</b></div><div style="text-align:center;font-size:14px;margin-top:10px">ผลเดิม: <b style="color:#ef4444">มผ (ไม่ผ่าน)</b> → ผลใหม่: <b style="color:#ef4444">มผ (ไม่ผ่าน / เรียนซ้ำ)</b></div>`,
                    showCancelButton: true,
                    confirmButtonText: 'ยืนยัน',
                    cancelButtonText: 'ยกเลิก',
                    confirmButtonColor: '#f59e0b',
                })
                : await Swal.fire({
                    icon: 'question',
                    title: 'ยืนยันบันทึกแก้ตัวสำเร็จ',
                    html: `<div style="text-align:left;font-size:13px">${row.studentName} (${row.studentCode})<br/>กิจกรรม: <b>${row.flag.courseTitle || row.flag.courseCode}</b></div><div style="text-align:center;font-size:14px;margin-top:10px">ผลเดิม: <b style="color:#ef4444">มผ (ไม่ผ่าน)</b> → ผลใหม่: <b style="color:#22c55e">ผ (ผ่าน)</b></div>`,
                    showCancelButton: true,
                    confirmButtonText: 'บันทึก',
                    cancelButtonText: 'ยกเลิก',
                    confirmButtonColor: '#4f46e5',
                });
            if (!confirm.isConfirmed) return;
            displayValue = mode === 'pass' ? 'ผ่าน (แก้ตัวสำเร็จ)' : 'ไม่ผ่าน (เรียนซ้ำ)';
        }

        setCorrectingKey(row.key);
        try {
            if (isCourse) {
                if (mode === 'pass') {
                    await setDoc(doc(db, 'school-settings', schoolId, 'courses', row.flag.courseId, 'grades', row.studentId), { grade: newGradeValue }, { merge: true });
                }
                // mode === 'repeat' สำหรับวิชาปกติ: ไม่มีค่าเกรด "เรียนซ้ำ" ในระบบ จึงบันทึกเป็นหมายเหตุ
                // ในคำร้องเท่านั้น ไม่แตะเกรดเดิมในฐานข้อมูล (เหมือนหน้าภาพรวม/zero-r-ms-report)
            } else {
                const newResult: 'passed' | 'failed' = mode === 'pass' ? 'passed' : 'failed';
                // guidance-evaluations เป็น collection ระดับบนสุด (ไม่ใช่ subcollection ของ activityDocId เหมือน clubs/learner-activities)
                const evalRef = row.flag.activityCollectionName === 'guidance-evaluations'
                    ? doc(db, 'school-settings', schoolId, 'guidance-evaluations', row.flag.evalDocId!)
                    : doc(db, 'school-settings', schoolId, row.flag.activityCollectionName!, row.flag.activityDocId!, 'evaluations', row.flag.evalDocId!);
                const evalSnap = await getDoc(evalRef);
                const data: any = evalSnap.exists() ? evalSnap.data() : {};
                const results: Record<string, any> = { ...(data.results || {}) };
                results[row.studentId] = { ...(results[row.studentId] || {}), status: newResult };
                const summary = Object.values(results).reduce((acc: any, r: any) => {
                    const s = r?.status || 'pending';
                    acc[s] = (acc[s] || 0) + 1;
                    return acc;
                }, { pending: 0, passed: 0, failed: 0 });
                await setDoc(evalRef, {
                    results, summary, updatedAt: serverTimestamp(), updatedBy: currentUser?.uid || '',
                }, { merge: true });
            }

            if (row.requestId) {
                await updateDoc(doc(db, 'school-settings', schoolId, 'remediation_requests', row.requestId), {
                    status: 'resolved',
                    resolvedAt: serverTimestamp(),
                    resolvedBy: currentUser?.uid || '',
                    resolvedByName: (currentUser as any)?.fullName || '',
                    newResult: displayValue,
                });
            } else {
                const payload: Record<string, any> = {
                    studentId: row.studentId,
                    studentCode: row.studentCode,
                    studentName: row.studentName,
                    classLevel: row.classLevel,
                    room: row.room,
                    flagType: row.flag.flagKind,
                    originalGrade: row.flag.grade,
                    academicYear: row.flag.academicYear,
                    semester: row.flag.semester,
                    responsibleTeacherIds: row.flag.responsibleTeacherIds || [],
                    responsibleTeacherNames: row.flag.teacherName ? [row.flag.teacherName] : [],
                    status: 'resolved',
                    requestedAt: serverTimestamp(),
                    requestedBy: currentUser?.uid || '',
                    requestNote: 'บันทึกโดยครู/ฝ่ายวิชาการผ่านหน้าบันทึก 0 ร มส',
                    resolvedAt: serverTimestamp(),
                    resolvedBy: currentUser?.uid || '',
                    resolvedByName: (currentUser as any)?.fullName || '',
                };
                if (isCourse) {
                    payload.courseId = row.flag.courseId;
                    payload.courseCode = row.flag.courseCode;
                    payload.courseTitle = row.flag.courseTitle;
                } else {
                    payload.activityId = row.flag.activityDocId;
                    payload.activityName = row.flag.courseTitle || row.flag.courseCode;
                    payload.evalDocId = row.flag.evalDocId;
                    if (row.flag.teacherScopeKey) payload.teacherScopeKey = row.flag.teacherScopeKey;
                }
                await addDoc(collection(db, 'school-settings', schoolId, 'remediation_requests'), {
                    ...payload,
                    newResult: displayValue,
                });
            }

            Swal.fire({ icon: 'success', title: 'บันทึกผลสำเร็จ', timer: 1200, showConfirmButton: false });
            await loadData();
        } catch (err) {
            console.error('Error saving activity remediation result:', err);
            Swal.fire('ผิดพลาด', 'ไม่สามารถบันทึกผลได้', 'error');
        } finally {
            setCorrectingKey(null);
        }
    };

    // ── Remark ประกอบผล มส/ร/มผ — ตราบใดที่มีข้อความอยู่ในหมายเหตุ จะไม่แสดงเกรดในตาราง (คอลัมน์ Grade)
    // จนกว่าจะลบหมายเหตุออก (ลบข้อความให้ว่างแล้วออกจากช่อง) เกรดถึงจะกลับมาแสดงตามปกติ — ไม่กระทบสถานะ
    // "ติดผลการเรียน"/จำนวนใดๆ เป็นแค่การแสดงผลในตารางเท่านั้น
    const handleSaveRemark = async (row: FlagRowWithStudent, rawValue: string) => {
        const value = rawValue.trim();
        if (value === (row.flag.remark || '')) return;

        setRemarkSavingKey(row.key);
        try {
            if (row.flag.flagKind === 'course') {
                await setDoc(doc(db, 'school-settings', schoolId, 'courses', row.flag.courseId, 'grades', row.studentId), { remark: value }, { merge: true });
            } else {
                const evalRef = row.flag.activityCollectionName === 'guidance-evaluations'
                    ? doc(db, 'school-settings', schoolId, 'guidance-evaluations', row.flag.evalDocId!)
                    : doc(db, 'school-settings', schoolId, row.flag.activityCollectionName!, row.flag.activityDocId!, 'evaluations', row.flag.evalDocId!);
                const evalSnap = await getDoc(evalRef);
                const data: any = evalSnap.exists() ? evalSnap.data() : {};
                const results: Record<string, any> = { ...(data.results || {}) };
                results[row.studentId] = { ...(results[row.studentId] || {}), remark: value };
                await setDoc(evalRef, { results }, { merge: true });
            }
            setRows(prev => prev.map(r => (r.key === row.key ? { ...r, flag: { ...r.flag, remark: value } } : r)));
        } catch (err) {
            console.error('Error saving remark:', err);
            Swal.fire('ผิดพลาด', 'ไม่สามารถบันทึก Remark ได้', 'error');
        } finally {
            setRemarkSavingKey(null);
        }
    };

    return (
        <MainLayout>
            <div className={`text-gray-900 dark:text-white transition-colors duration-300 min-h-screen overflow-x-hidden ${isPwaMode ? 'px-2.5 py-3 pb-6' : 'p-4 sm:p-6 space-y-6'}`}>
                <div className={`${isPwaMode ? 'max-w-full' : 'max-w-7xl'} mx-auto min-w-0 ${isPwaMode ? 'space-y-4' : 'space-y-6'}`}>

                    {/* Top Header Card */}
                    {isPwaMode ? (
                        <div className="mb-3 space-y-1.5">
                            <div className="flex items-center gap-2 bg-white dark:bg-[#2a2b2f]/60 backdrop-blur-sm px-3 py-2 rounded-xl border border-gray-200/50 dark:border-white/5">
                                <BackButton to="/academic/hub/zero-r-ms" />
                                <div className="p-1 bg-indigo-50 dark:bg-indigo-500/10 rounded-lg shrink-0">
                                    <ClipboardEdit className="text-indigo-600 dark:text-indigo-400" size={14} />
                                </div>
                                <div className="min-w-0 flex-1">
                                    <p className="text-[11px] font-black text-gray-900 dark:text-white leading-none truncate">บันทึก 0 ร มส</p>
                                    <p className="text-[9px] text-indigo-500 dark:text-indigo-400 font-semibold truncate mt-0.5">
                                        แก้ "มผ" ของวิชากิจกรรมพัฒนาผู้เรียน
                                    </p>
                                </div>
                            </div>
                        </div>
                    ) : (
                        <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-2 gap-4 bg-white dark:bg-[#2a2b2f]/60 backdrop-blur-sm p-5 rounded-[1.5rem] border border-gray-200/50 dark:border-white/5 transition-all duration-300">
                            <div className="space-y-1 text-left">
                                <div className="flex items-center gap-3">
                                    <BackButton to="/academic/hub/zero-r-ms" />
                                    <div className="p-2.5 bg-indigo-50 dark:bg-indigo-500/10 rounded-2xl shadow-sm border border-indigo-100 dark:border-indigo-500/20">
                                        <ClipboardEdit className="text-indigo-600 dark:text-indigo-400" size={24} />
                                    </div>
                                    <div>
                                        <h1 className="text-2xl font-black text-gray-900 dark:text-white leading-tight tracking-tight">
                                            บันทึก 0 ร มส
                                        </h1>
                                        <p className="text-gray-500 dark:text-gray-400 text-xs font-bold flex items-center gap-1.5 pt-0.5">
                                            <span className="text-indigo-600 dark:text-indigo-400 font-extrabold">
                                                สำหรับแก้ "มผ" ของวิชากิจกรรมพัฒนาผู้เรียน (ชุมนุม / ลูกเสือ-เนตรนารี / รด. ฯลฯ)
                                            </span>
                                        </p>
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Stats Summary Cards */}
                    <div className="grid grid-cols-3 gap-3">
                        <div className="bg-amber-50 dark:bg-amber-500/10 border border-amber-100 dark:border-amber-500/20 rounded-2xl text-center transition-all duration-300 p-3 sm:p-4">
                            <span className="block text-[10px] sm:text-xs font-black text-amber-600 dark:text-amber-400 tracking-wider">รอบันทึกผล (วิชานี้)</span>
                            <span className="block text-2xl sm:text-3xl font-black text-amber-700 dark:text-amber-300 mt-1">
                                {stats.pendingInCourse}
                            </span>
                        </div>
                        <div className="bg-indigo-50 dark:bg-indigo-500/10 border border-indigo-100 dark:border-indigo-500/20 rounded-2xl text-center transition-all duration-300 p-3 sm:p-4">
                            <span className="block text-[10px] sm:text-xs font-black text-indigo-600 dark:text-indigo-400 tracking-wider">มีคำร้องขอแก้ตัว</span>
                            <span className="block text-2xl sm:text-3xl font-black text-indigo-700 dark:text-indigo-300 mt-1">
                                {stats.withRequest}
                            </span>
                        </div>
                        <div className="bg-gray-50 dark:bg-white/5 border border-gray-200 dark:border-gray-800 rounded-2xl text-center transition-all duration-300 p-3 sm:p-4">
                            <span className="block text-[10px] sm:text-xs font-black text-gray-500 dark:text-gray-400 tracking-wider">วิชาที่ติด มผ</span>
                            <span className="block text-2xl sm:text-3xl font-black text-gray-700 dark:text-gray-200 mt-1">
                                {stats.courseCount}
                            </span>
                        </div>
                    </div>

                    {/* Main Container Card */}
                    <div className={`bg-white dark:bg-[#1e1f23] rounded-3xl shadow-md border border-gray-100 dark:border-gray-800 overflow-hidden ${isPwaMode ? 'p-0 bg-transparent dark:bg-transparent border-none shadow-none' : ''}`}>

                        {/* Term Filter Row */}
                        <div className={`border-b border-gray-100 dark:border-gray-800 bg-gray-50/50 dark:bg-white/[0.02] ${isPwaMode ? 'px-2.5 py-2 bg-transparent dark:bg-transparent border-none' : 'px-5 py-3'}`}>
                            <AcademicYearSemesterFilter
                                schoolId={schoolId}
                                academicYear={termYear}
                                onAcademicYearChange={setTermYear}
                                semester={termSemester}
                                onSemesterChange={setTermSemester}
                            />
                        </div>

                        {/* Search + Course select — รวมเป็นแถวเดียวกันทั้งหมด ต่อหลังแถวปีการศึกษา/ภาคเรียนทันที */}
                        <div className={`border-b border-gray-100 dark:border-gray-800 flex flex-row flex-wrap lg:flex-nowrap items-center gap-2 ${isPwaMode ? 'px-2.5 py-2' : 'px-5 py-3'}`}>
                            <label className="shrink-0 text-xs font-bold text-gray-500 dark:text-gray-400">ค้นหาจาก</label>
                            <div className="relative flex-1 min-w-[160px]">
                                <span className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-gray-400">
                                    <Search size={14} />
                                </span>
                                <input
                                    value={search}
                                    onChange={(e) => setSearch(e.target.value)}
                                    placeholder="เลขประจำตัว ชื่อ นามสกุล"
                                    className="w-full h-9 pl-8 pr-3 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-[#151619] outline-none focus:ring-2 focus:ring-indigo-500 text-xs font-bold transition"
                                />
                            </div>
                            <button
                                onClick={() => setCurrentPage(1)}
                                className="h-9 px-4 rounded-lg bg-teal-500 hover:bg-teal-600 text-white flex items-center justify-center gap-1.5 font-black text-xs shadow-sm transition shrink-0"
                            >
                                <Search size={12} /> ไป
                            </button>
                            <label className="shrink-0 text-xs font-bold text-gray-500 dark:text-gray-400 lg:ml-4">รายวิชา</label>
                            <select
                                value={selectedCourseKey}
                                onChange={(e) => setSelectedCourseKey(e.target.value)}
                                className="flex-1 min-w-[200px] h-9 px-3 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-[#151619] outline-none focus:ring-2 focus:ring-indigo-500 text-xs font-bold transition"
                            >
                                {courseOptions.length === 0 && <option value="">ไม่มีวิชา/กิจกรรมที่ต้องบันทึก</option>}
                                {subjectOptions.length > 0 && (
                                    <optgroup label="รายวิชา">
                                        {subjectOptions.map(opt => (
                                            <option key={opt.key} value={opt.key}>{opt.label} — {opt.count} คน</option>
                                        ))}
                                    </optgroup>
                                )}
                                {activityOptions.length > 0 && (
                                    <optgroup label="กิจกรรม">
                                        {activityOptions.map(opt => (
                                            <option key={opt.key} value={opt.key}>{opt.label} — {opt.count} คน</option>
                                        ))}
                                    </optgroup>
                                )}
                            </select>
                        </div>

                        {/* Toolbar: refresh + pagination — วางแถวเดียวเสมอ (ไม่ตกบรรทัด) ให้ตำแหน่งตรงตามภาพอ้างอิง */}
                        {!loading && filteredRows.length > 0 && (
                            <div className="flex flex-row items-center justify-between gap-2 px-3 py-2 border-b border-gray-100 dark:border-gray-800 overflow-x-auto">
                                <button
                                    onClick={loadData}
                                    disabled={loading}
                                    title="รีเฟรชข้อมูล"
                                    className="flex items-center justify-center w-8 h-8 rounded-lg bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400 border border-emerald-100 dark:border-emerald-900/50 hover:bg-emerald-100 dark:hover:bg-emerald-950/80 shadow-sm transition disabled:opacity-60 shrink-0"
                                >
                                    <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
                                </button>
                                <div className="flex flex-row items-center gap-1.5 shrink-0">
                                    <button
                                        onClick={() => setCurrentPage(1)}
                                        disabled={currentPage <= 1}
                                        title="หน้าแรก"
                                        className="w-7 h-7 flex items-center justify-center rounded-lg border border-gray-200 dark:border-gray-700 text-gray-500 disabled:opacity-30 shrink-0"
                                    >
                                        <ChevronLeft size={12} />
                                    </button>
                                    <button
                                        onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                                        disabled={currentPage <= 1}
                                        title="ก่อนหน้า"
                                        className="w-7 h-7 flex items-center justify-center rounded-lg border border-gray-200 dark:border-gray-700 text-gray-500 disabled:opacity-30 shrink-0"
                                    >
                                        <ChevronLeft size={12} />
                                    </button>
                                    <span className="text-xs font-bold text-gray-600 dark:text-gray-300 whitespace-nowrap px-1">
                                        หน้า {currentPage} ของ {totalPages} ({filteredRows.length} รายการ)
                                    </span>
                                    <button
                                        onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                                        disabled={currentPage >= totalPages}
                                        title="ถัดไป"
                                        className="w-7 h-7 flex items-center justify-center rounded-lg border border-gray-200 dark:border-gray-700 text-gray-500 disabled:opacity-30 shrink-0"
                                    >
                                        <ChevronRight size={12} />
                                    </button>
                                    <button
                                        onClick={() => setCurrentPage(totalPages)}
                                        disabled={currentPage >= totalPages}
                                        title="หน้าสุดท้าย"
                                        className="w-7 h-7 flex items-center justify-center rounded-lg border border-gray-200 dark:border-gray-700 text-gray-500 disabled:opacity-30 shrink-0"
                                    >
                                        <ChevronRight size={12} />
                                    </button>
                                    <select
                                        value={pageSize}
                                        onChange={(e) => setPageSize(Number(e.target.value))}
                                        className="h-7 px-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-[#151619] text-xs font-bold outline-none shrink-0"
                                    >
                                        {PAGE_SIZE_OPTIONS.map(n => <option key={n} value={n}>{n} / หน้า</option>)}
                                    </select>
                                </div>
                            </div>
                        )}

                        {/* Roster Table */}
                        {loading ? (
                            <div className="flex items-center justify-center py-16 text-gray-400">
                                <RefreshCw size={20} className="animate-spin" />
                            </div>
                        ) : filteredRows.length === 0 ? (
                            <div className="flex flex-col items-center justify-center py-16 text-gray-400 gap-2">
                                {courseOptions.length === 0 ? <CheckCircle2 size={32} className="text-emerald-400" /> : <AlertCircle size={32} />}
                                <p className="text-sm font-bold">{courseOptions.length === 0 ? 'ไม่มีนักเรียนที่ติด 0/ร/มส/มผ รอบันทึกผล' : 'ไม่มีรายการตรงกับการค้นหา'}</p>
                            </div>
                        ) : (
                            <div>
                                <table className="w-full table-fixed text-left border-collapse text-xs">
                                    <thead>
                                        <tr className="bg-gray-50/50 dark:bg-white/[0.02] border-b border-gray-100 dark:border-gray-800">
                                            <th className="px-2 py-3 font-black text-gray-400 dark:text-gray-500 uppercase tracking-wider w-[14%]">วิชา</th>
                                            <th className="px-2 py-3 text-center font-black text-gray-400 dark:text-gray-500 uppercase tracking-wider w-[7%]">ห้อง</th>
                                            <th className="px-2 py-3 text-center font-black text-gray-400 dark:text-gray-500 uppercase tracking-wider w-[7%]">เลขที่</th>
                                            <th className="px-2 py-3 text-center font-black text-gray-400 dark:text-gray-500 uppercase tracking-wider w-[10%]">เลขประจำตัว</th>
                                            <th className="px-2 py-3 font-black text-gray-400 dark:text-gray-500 uppercase tracking-wider w-[14%]">ชื่อ-นามสกุล</th>
                                            <th className="px-2 py-3 text-center font-black text-gray-400 dark:text-gray-500 uppercase tracking-wider w-[5%]">%</th>
                                            <th className="px-2 py-3 text-center font-black text-gray-400 dark:text-gray-500 uppercase tracking-wider w-[5%]">ปกติ</th>
                                            <th className="px-2 py-3 text-center font-black text-gray-400 dark:text-gray-500 uppercase tracking-wider w-[6%]">Grade</th>
                                            <th className="px-2 py-3 text-center font-black text-gray-400 dark:text-gray-500 uppercase tracking-wider w-[9%]">แก้ตัว</th>
                                            <th className="px-2 py-3 text-center font-black text-gray-400 dark:text-gray-500 uppercase tracking-wider w-[9%]">เรียนซ้ำ</th>
                                            <th className="px-2 py-3 text-center font-black text-gray-400 dark:text-gray-500 uppercase tracking-wider w-[14%]">Remark</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                                        {pagedRows.map(row => (
                                            <tr key={row.key} className="hover:bg-gray-50/60 dark:hover:bg-white/[0.02]">
                                                <td className="px-2 py-3">
                                                    <p className="font-bold truncate text-gray-900 dark:text-white">{row.flag.courseCode} {row.flag.courseTitle}</p>
                                                    <div className="flex items-center gap-1.5 flex-wrap">
                                                        <p className="text-[10px] text-gray-400 dark:text-gray-500">{row.flag.flagKind === 'course' ? 'รายวิชา' : 'กิจกรรม'}</p>
                                                        {row.requestStatus === 'resolved' && (
                                                            <span title="เคยมีคำร้องแก้ไขแล้วครั้งหนึ่ง แต่ตอนนี้กลับมาติดผลอีก — ตรวจสอบก่อนแก้ไขซ้ำ" className="inline-flex items-center gap-1 text-[9px] font-black px-1.5 py-0.5 rounded-full bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300">
                                                                <AlertCircle size={9} /> เคยแก้ไขแล้ว
                                                            </span>
                                                        )}
                                                    </div>
                                                </td>
                                                <td className="px-2 py-3 text-center text-gray-500 dark:text-gray-400">{row.room || '-'}</td>
                                                <td className="px-2 py-3 text-center text-gray-500 dark:text-gray-400">{row.number || '-'}</td>
                                                <td className="px-2 py-3 text-center font-bold">{row.studentCode}</td>
                                                <td className="px-2 py-3"><p className="font-bold truncate">{row.studentName}</p></td>
                                                <td className="px-2 py-3 text-center text-gray-400">-</td>
                                                <td className="px-2 py-3 text-center text-gray-400">-</td>
                                                <td className="px-2 py-3 text-center">
                                                    <span
                                                        className={`inline-flex items-center justify-center px-2 py-0.5 rounded-md font-black border ${row.flag.remark ? 'bg-gray-50 dark:bg-gray-800 text-gray-400 dark:text-gray-500 border-gray-200 dark:border-gray-700' : 'bg-red-50 dark:bg-red-500/10 text-red-600 dark:text-red-400 border-red-100 dark:border-red-500/20'}`}
                                                        title={row.flag.remark ? `มี Remark กำกับอยู่ — ซ่อนเกรดจนกว่าจะลบ Remark ออก: ${row.flag.remark}` : undefined}
                                                    >
                                                        {row.flag.remark ? '-' : row.flag.grade}
                                                    </span>
                                                </td>
                                                <td className="px-2 py-3 text-center">
                                                    <button
                                                        onClick={() => handleCorrect(row, 'pass')}
                                                        disabled={correctingKey === row.key}
                                                        title="แก้ตัว"
                                                        className="inline-flex items-center justify-center w-8 h-8 rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 transition-all disabled:opacity-50"
                                                    >
                                                        {correctingKey === row.key ? <RefreshCw size={13} className="animate-spin" /> : <Pencil size={13} />}
                                                    </button>
                                                </td>
                                                <td className="px-2 py-3 text-center">
                                                    <div className="flex items-center justify-center gap-1.5">
                                                        {row.requestStatus === 'pending' && (
                                                            <span title="มีคำร้องรอดำเนินการ" className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300">
                                                                <Clock size={11} />
                                                            </span>
                                                        )}
                                                        <button
                                                            onClick={() => handleCorrect(row, 'repeat')}
                                                            disabled={correctingKey === row.key}
                                                            title="เรียนซ้ำ"
                                                            className="inline-flex items-center justify-center w-8 h-8 rounded-lg bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300 hover:bg-amber-200 dark:hover:bg-amber-900/50 transition-all disabled:opacity-50"
                                                        >
                                                            {correctingKey === row.key ? <RefreshCw size={13} className="animate-spin" /> : <RotateCcw size={13} />}
                                                        </button>
                                                    </div>
                                                </td>
                                                <td className="px-2 py-3 text-center">
                                                    <input
                                                        type="text"
                                                        defaultValue={row.flag.remark || ''}
                                                        onBlur={(e) => handleSaveRemark(row, e.target.value)}
                                                        disabled={remarkSavingKey === row.key}
                                                        placeholder="หมายเหตุ"
                                                        className="w-full h-8 px-2 rounded-md border border-gray-200 dark:border-gray-700 bg-white dark:bg-[#151619] text-[11px] font-bold outline-none focus:ring-2 focus:ring-indigo-500 disabled:opacity-50"
                                                    />
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </MainLayout>
    );
};

export default RemediationRecordPage;
