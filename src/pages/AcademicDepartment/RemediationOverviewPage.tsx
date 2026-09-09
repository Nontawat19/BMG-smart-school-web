import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useSelector } from 'react-redux';
import { RootState } from '@/store';
import MainLayout from '@/layouts/MainLayout';
import BackButton from '@/components/Shared/BackButton';
import AcademicYearSemesterFilter from '@/components/Shared/AcademicYearSemesterFilter';
import { firestore as db } from '@/firebase';
import {
    collection, doc, getDoc, getDocs, addDoc, updateDoc, setDoc, deleteDoc, serverTimestamp, deleteField,
} from 'firebase/firestore';
import Swal from 'sweetalert2';
import * as XLSX from 'xlsx';
import { usePermissions } from '@/hooks/usePermissions';
import {
    LayoutDashboard, RefreshCw, Search, Pencil, RotateCcw, CheckCircle2, AlertCircle, FileSpreadsheet, ChevronLeft, ChevronRight, Trash2,
} from 'lucide-react';
import { FullRosterRow, fetchFullRoster, getMinistryRemediationGradeOptions, calculateRemediationGrade } from '@/utils/remediationUtils';
import { showChoiceDialog } from '@/utils/swalChoiceDialog';
import { useResponsivePwaMode as usePwaMode } from '@/hooks/useResponsivePwaMode';

const PAGE_SIZE_OPTIONS = [10, 25, 50, 100];

interface RequestInfo {
    id: string;
    status: 'pending' | 'resolved' | 'cancelled';
    newResult?: string;
    resolvedByName?: string;
    resolvedAt?: any;
    requestedAt?: any;
    originalGrade?: string;
}

type ResultFilter = '' | '0' | 'ร' | 'มส' | 'มผ' | 'normal' | 'none';

// รวมคะแนนดิบของนักเรียนคนหนึ่งในวิชาปกติ (คะแนนเก็บทุกรายการที่ตั้งค่าไว้จริงใน formativeAssessments +
// กลางภาค + ปลายภาค) จากเอกสาร courses/{courseId} (การตั้งค่า) และ courses/{courseId}/grades/{studentId}
// (คะแนนดิบ) สดตอนนั้นเลย — ก็อปปี้จาก RemediationRecordPage.tsx/RemediationRequestsPage.tsx ตามธรรมเนียมเดิม
// ของโปรเจกต์ (ไม่รวมศูนย์เป็นจุดเดียว) ใช้คำนวณเกรดจริงตอนแก้ "ร" ให้ตรงกับที่ GradeBook จะแสดง
const fetchLiveCourseTotal = async (schoolId: string, courseId: string, studentId: string): Promise<number> => {
    const [courseSnap, gradeSnap] = await Promise.all([
        getDoc(doc(db, 'school-settings', schoolId, 'courses', courseId)),
        getDoc(doc(db, 'school-settings', schoolId, 'courses', courseId, 'grades', studentId)),
    ]);
    const courseData: any = courseSnap.exists() ? courseSnap.data() : {};
    const record: any = gradeSnap.exists() ? gradeSnap.data() : {};

    if (typeof record.total === 'number' && !isNaN(record.total) && record.total > 0) {
        return record.total;
    }

    const details = record.formativeDetails || {};
    const formativeTotal = (courseData.formativeAssessments || []).reduce((sum: number, a: any) => {
        const key = a.id || a.name;
        if (!key) return sum;
        const raw = details[key];
        return sum + (raw === undefined || raw === '' ? 0 : Number(raw) || 0);
    }, 0);
    const midterm = Number(record.midterm) || 0;
    const final = Number(record.final) || 0;
    return formativeTotal + midterm + final;
};

// หน้าตรวจสอบผลการเรียน 0/ร/มส/มผ และไม่มีผลการเรียน — ตารางเต็มรูปแบบ SGS ครอบคลุมทุก enrollment
// ทั้งโรงเรียน (ไม่ใช่แค่รายชื่อที่ติด) พร้อมกดแก้ตัว/เรียนซ้ำ ได้ตรงจากตาราง เก็บเข้าระบบคำร้องขอแก้ตัว
// เดิมเสมอ (status: 'resolved' ทันที) เหมือนหน้า zero-r-ms-report
const RemediationOverviewPage: React.FC = () => {
    const { user: currentUser, isSuperAdmin } = usePermissions();
    const teacherMap = useSelector((state: RootState) => (state as any).userMap?.teachers || {});
    const schoolId = (currentUser as any)?.schoolId;
    const isPwaMode = usePwaMode();
    const calendarAcademicYear = useSelector((state: RootState) => state.calendar.academicYear);

    const [loading, setLoading] = useState(true);
    const [rows, setRows] = useState<FullRosterRow[]>([]);
    const [requestsByKey, setRequestsByKey] = useState<Record<string, RequestInfo>>({});
    const [resultFilter, setResultFilter] = useState<ResultFilter>('');
    const [search, setSearch] = useState('');
    const [correctingKey, setCorrectingKey] = useState<string | null>(null);
    const [currentPage, setCurrentPage] = useState(1);
    const [pageSize, setPageSize] = useState(10);

    const [termYear, setTermYear] = useState<string>(() => sessionStorage.getItem('rmo_termYear') ?? '');
    const [termSemester, setTermSemester] = useState<string>(() => sessionStorage.getItem('rmo_termSemester') || '');

    useEffect(() => {
        sessionStorage.setItem('rmo_termYear', termYear);
        sessionStorage.setItem('rmo_termSemester', termSemester);
    }, [termYear, termSemester]);

    useEffect(() => {
        if (sessionStorage.getItem('rmo_termYear') === null && calendarAcademicYear) {
            setTermYear(calendarAcademicYear);
        }
    }, [calendarAcademicYear]);

    const loadData = useCallback(async () => {
        if (!schoolId) return;
        setLoading(true);
        try {
            const [fullRows, requestSnap] = await Promise.all([
                fetchFullRoster(schoolId, teacherMap, {
                    academicYear: termYear || undefined,
                    semester: termSemester || undefined,
                }),
                getDocs(collection(db, 'school-settings', schoolId, 'remediation_requests')),
            ]);

            const requestMap: Record<string, RequestInfo> = {};
            requestSnap.forEach(d => {
                const data: any = d.data();
                if (data.status === 'cancelled') return;
                const idValue = data.flagType === 'course' ? data.courseId : data.activityId;
                const key = `${data.studentId}|${idValue}|${data.academicYear}|${data.semester}`;
                if (!requestMap[key] || data.status === 'resolved') {
                    requestMap[key] = {
                        id: d.id, status: data.status, newResult: data.newResult,
                        resolvedByName: data.resolvedByName, resolvedAt: data.resolvedAt,
                        requestedAt: data.requestedAt, originalGrade: data.originalGrade,
                    };
                }
            });

            setRows(fullRows);
            setRequestsByKey(requestMap);
            setCurrentPage(1);
        } catch (err: any) {
            console.error('Error loading remediation overview:', err);
            Swal.fire('ผิดพลาด', `ไม่สามารถโหลดข้อมูลภาพรวมได้: ${err?.code || err?.message || 'unknown error'}`, 'error');
        } finally {
            setLoading(false);
        }
    }, [schoolId, teacherMap, termYear, termSemester]);

    useEffect(() => { loadData(); }, [loadData]);

    const filteredRows = useMemo(() => {
        const kw = search.trim().toLowerCase();
        return rows.filter(r => {
            if (resultFilter === 'normal' && r.status !== 'normal') return false;
            else if (resultFilter === 'none' && r.status !== 'none') return false;
            else if (resultFilter && resultFilter !== 'normal' && resultFilter !== 'none' && r.grade !== resultFilter) return false;
            if (!kw) return true;
            return `${r.name} ${r.studentCode} ${r.courseTitle} ${r.courseCode}`.toLowerCase().includes(kw);
        });
    }, [rows, resultFilter, search]);

    useEffect(() => { setCurrentPage(1); }, [resultFilter, search, pageSize]);

    const totalPages = Math.max(1, Math.ceil(filteredRows.length / pageSize));
    const pagedRows = useMemo(
        () => filteredRows.slice((currentPage - 1) * pageSize, currentPage * pageSize),
        [filteredRows, currentPage, pageSize]
    );

    const summary = useMemo(() => ({
        total: rows.length,
        flagged: rows.filter(r => r.status === 'flag').length,
        normal: rows.filter(r => r.status === 'normal').length,
        none: rows.filter(r => r.status === 'none').length,
    }), [rows]);

    const handleCorrect = async (row: FullRosterRow, mode: 'pass' | 'repeat') => {
        if (row.status !== 'flag') return;

        // ต้องมีคำร้องขอแก้ตัวที่นักเรียนยื่นมาก่อนเสมอ (สถานะ pending) ห้ามให้ฝ่ายวิชาการบันทึกผลแก้ตัวข้าม
        // ขั้นตอนคำร้องอีกต่อไป — ให้ไปอนุมัติที่หน้า "คำร้องขอแก้ตัว" (/academic/remediation-requests) แทน
        if (requestsByKey[row.key]?.status !== 'pending') {
            Swal.fire({
                icon: 'warning',
                title: 'ยังไม่มีคำร้องขอแก้ตัว',
                html: `${row.name} (${row.studentCode}) ยังไม่ได้ยื่นคำร้องขอแก้ตัววิชา <b>${row.courseTitle || row.courseCode}</b><br/><br/>ต้องให้นักเรียนยื่นคำร้องที่หน้าโปรไฟล์ก่อน (หรือครูยื่นแทนได้) แล้วจึงอนุมัติที่หน้า "คำร้องขอแก้ตัว"`,
            });
            return;
        }

        let newValue: string | undefined;
        let displayValue: string;

        if (mode === 'repeat') {
            const confirm = await Swal.fire({
                icon: 'warning',
                title: 'ยืนยันให้เรียนซ้ำ',
                html: `<div style="text-align:left;font-size:13px">${row.name} (${row.studentCode})<br/>วิชา: <b>${row.courseTitle || row.courseCode}</b><br/><br/>จะบันทึกสถานะเป็น "เรียนซ้ำ" ในระบบคำร้อง โดย<b>ไม่เปลี่ยนแปลงเกรดเดิม</b>ในฐานข้อมูล</div>`,
                showCancelButton: true,
                confirmButtonText: 'ยืนยัน',
                cancelButtonText: 'ยกเลิก',
                confirmButtonColor: '#f59e0b',
            });
            if (!confirm.isConfirmed) return;
            displayValue = 'เรียนซ้ำ';
        } else if (row.flagKind === 'course' && row.grade === 'ร') {
            // ติด "ร" แก้ตามคะแนนรวมสะสมจริงเสมอ (ไม่ให้เลือกเกรดเองอิสระ) — เหมือน RemediationRequestsPage/
            // RemediationRecordPage
            const freshTotal = await fetchLiveCourseTotal(schoolId, row.courseId, row.studentId);
            const resolvedGrade = calculateRemediationGrade(row.grade, freshTotal);
            const confirm = await Swal.fire({
                icon: 'question',
                title: `แก้ไข ร ของ${row.name}`,
                html: `<div style="text-align:left;font-size:14px;line-height:1.6;margin-top:8px">
                    นักเรียน: <b>${row.name}</b> (${row.studentCode})<br/>
                    วิชา: <b>${row.courseTitle || row.courseCode}</b><br/>
                    คะแนนรวมในสมุดคะแนน (TOTAL): <b style="color:#4f46e5">${freshTotal} คะแนน</b><br/>
                    เกรดสุทธิที่จะได้รับจาก GradeBook: <b style="color:#16a34a;font-size:17px">${resolvedGrade}</b>
                </div>`,
                showCancelButton: true,
                confirmButtonText: `บันทึกเกรด (${resolvedGrade})`,
                cancelButtonText: 'ยกเลิก',
                confirmButtonColor: '#4f46e5',
            });
            if (!confirm.isConfirmed) return;
            newValue = resolvedGrade;
            displayValue = resolvedGrade;
        } else if (row.flagKind === 'course') {
            // ตามระเบียบ ศธ./สพฐ.: แก้ตัวจาก "0" หรือ "มส" ได้เกรดสูงสุดไม่เกิน "1" — ต้องใช้ตัวเลือกเดียวกับ
            // RemediationRequestsPage/RemediationRecordPage ห้ามให้เลือกเกรดอิสระ 0-4 เหมือนเดิม (ผิดระเบียบ)
            const gradeOptions = getMinistryRemediationGradeOptions(row.grade);
            const { value } = await showChoiceDialog({
                title: 'บันทึกผลแก้ตัว',
                html: `<div style="text-align:left;font-size:13px;margin-bottom:8px">${row.name} (${row.studentCode})<br/>วิชา: <b>${row.courseTitle || row.courseCode}</b> — ผลเดิม: <b>${row.grade}</b></div>`,
                options: gradeOptions,
                placeholder: 'เลือกผลการเรียนใหม่',
                confirmButtonText: 'บันทึก',
                cancelButtonText: 'ยกเลิก',
                confirmButtonColor: '#4f46e5',
            });
            if (!value) return;
            newValue = value;
            displayValue = value;
        } else {
            newValue = 'passed';
            displayValue = 'ผ่าน';
        }

        setCorrectingKey(row.key);
        try {
            if (mode === 'pass') {
                if (row.flagKind === 'course') {
                    // ล้าง remark เดิม (หมายเหตุประกอบผล 0/ร/มส) กับ status เดิม (มส) ทิ้งตอนแก้ตัวสำเร็จ — ให้
                    // ตรงกับ RemediationRequestsPage/RemediationRecordPage ไม่งั้น GradeBookPage จะยังบังคับ
                    // แสดง "มส"/ยังดูเหมือนติดค้างอยู่ ทั้งที่เกรดใหม่บันทึกไปแล้ว
                    await setDoc(doc(db, 'school-settings', schoolId, 'courses', row.courseId, 'grades', row.studentId), { grade: newValue, remark: deleteField(), status: deleteField() }, { merge: true });
                } else {
                    // guidance-evaluations เป็น collection ระดับบนสุด (ไม่ใช่ subcollection ของ activityDocId เหมือน clubs/learner-activities)
                    const evalRef = row.activityCollectionName === 'guidance-evaluations'
                        ? doc(db, 'school-settings', schoolId, 'guidance-evaluations', row.evalDocId!)
                        : doc(db, 'school-settings', schoolId, row.activityCollectionName!, row.activityDocId!, 'evaluations', row.evalDocId!);
                    const evalSnap = await getDoc(evalRef);
                    const data: any = evalSnap.exists() ? evalSnap.data() : {};
                    const results: Record<string, any> = { ...(data.results || {}) };
                    results[row.studentId] = { ...(results[row.studentId] || {}), status: newValue };
                    const summaryCount = Object.values(results).reduce((acc: any, r: any) => {
                        const s = r?.status || 'pending';
                        acc[s] = (acc[s] || 0) + 1;
                        return acc;
                    }, { pending: 0, passed: 0, failed: 0 });
                    await setDoc(evalRef, { results, summary: summaryCount, updatedAt: serverTimestamp(), updatedBy: currentUser?.uid || '' }, { merge: true });
                }
            }

            const existing = requestsByKey[row.key];
            if (existing) {
                await updateDoc(doc(db, 'school-settings', schoolId, 'remediation_requests', existing.id), {
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
                    studentName: row.name,
                    classLevel: row.classLevel,
                    room: row.room,
                    flagType: row.flagKind,
                    originalGrade: row.grade,
                    academicYear: row.academicYear,
                    semester: row.semester,
                    responsibleTeacherIds: row.responsibleTeacherIds || [],
                    responsibleTeacherNames: row.teacherName ? [row.teacherName] : [],
                    status: 'resolved',
                    requestedAt: serverTimestamp(),
                    requestedBy: currentUser?.uid || '',
                    requestNote: mode === 'repeat' ? 'บันทึกเป็นเรียนซ้ำ (ไม่เปลี่ยนเกรด) โดยฝ่ายวิชาการ' : 'บันทึกโดยฝ่ายวิชาการ (ไม่ผ่านขั้นตอนคำร้อง)',
                    resolvedAt: serverTimestamp(),
                    resolvedBy: currentUser?.uid || '',
                    resolvedByName: (currentUser as any)?.fullName || '',
                    newResult: displayValue,
                };
                if (row.flagKind === 'course') {
                    payload.courseId = row.courseId;
                    payload.courseCode = row.courseCode;
                    payload.courseTitle = row.courseTitle;
                } else {
                    payload.activityId = row.activityDocId;
                    payload.activityName = row.courseTitle || row.courseCode;
                    payload.evalDocId = row.evalDocId;
                    if (row.teacherScopeKey) payload.teacherScopeKey = row.teacherScopeKey;
                }
                await addDoc(collection(db, 'school-settings', schoolId, 'remediation_requests'), payload);
            }

            Swal.fire({ icon: 'success', title: 'บันทึกผลสำเร็จ', timer: 1500, showConfirmButton: false });
            await loadData();
        } catch (err) {
            console.error('Error correcting grade:', err);
            Swal.fire('ผิดพลาด', 'ไม่สามารถบันทึกผลได้', 'error');
        } finally {
            setCorrectingKey(null);
        }
    };

    // ── Super Admin เท่านั้น: ลบคำร้อง/ผลการแก้ตัวที่บันทึกผิดพลาด (ทดสอบ/กรอกพลาด) แล้วคืนผลการเรียน
    // กลับไปเป็นค่าติดเดิม — ต่างจาก remark ที่แค่ซ่อนการแสดงผล นี่คือการย้อนกลับข้อมูลจริงในฐานข้อมูล
    const handleDeleteRequest = async (row: FullRosterRow, req: RequestInfo) => {
        if (!schoolId || !isSuperAdmin) return;
        const isRepeat = req.newResult === 'เรียนซ้ำ';
        const res = await Swal.fire({
            title: 'ลบคำร้อง/ผลการแก้ตัว?',
            html: `<div style="text-align:left;font-size:13px;line-height:1.6">
                <p><b>${row.name}</b> (${row.studentCode})</p>
                <p>วิชา/กิจกรรม: <b>${row.courseTitle || row.courseCode}</b></p>
                <p style="margin-top:8px;color:#ef4444;font-weight:600">
                    ${isRepeat
                        ? 'จะลบประวัติคำร้องนี้ทิ้ง (ไม่กระทบเกรด เพราะ "เรียนซ้ำ" ไม่ได้แก้ไขเกรดเดิม)'
                        : `จะลบประวัติคำร้องนี้ทิ้ง และคืนผลการเรียนกลับเป็น "${req.originalGrade || row.grade}" ทันที`}
                </p>
                <p style="margin-top:4px;font-size:12px;color:#9ca3af">ใช้เฉพาะกรณีบันทึกผิดพลาดหรือทดสอบเท่านั้น — การลบนี้ไม่สามารถย้อนกลับได้</p>
            </div>`,
            icon: 'warning', showCancelButton: true,
            confirmButtonText: 'ลบและคืนค่าเดิม', cancelButtonText: 'ยกเลิก', confirmButtonColor: '#ef4444',
        });
        if (!res.isConfirmed) return;

        try {
            if (!isRepeat) {
                if (row.flagKind === 'course') {
                    const originalGrade = req.originalGrade || row.grade;
                    await setDoc(doc(db, 'school-settings', schoolId, 'courses', row.courseId, 'grades', row.studentId), {
                        grade: originalGrade,
                    }, { merge: true });
                } else {
                    const evalRef = row.activityCollectionName === 'guidance-evaluations'
                        ? doc(db, 'school-settings', schoolId, 'guidance-evaluations', row.evalDocId!)
                        : doc(db, 'school-settings', schoolId, row.activityCollectionName!, row.activityDocId!, 'evaluations', row.evalDocId!);
                    const evalSnap = await getDoc(evalRef);
                    const data: any = evalSnap.exists() ? evalSnap.data() : {};
                    const results: Record<string, any> = { ...(data.results || {}) };
                    results[row.studentId] = { ...(results[row.studentId] || {}), status: 'failed' };
                    const summaryCount = Object.values(results).reduce((acc: any, r: any) => {
                        const s = r?.status || 'pending';
                        acc[s] = (acc[s] || 0) + 1;
                        return acc;
                    }, { pending: 0, passed: 0, failed: 0 });
                    await setDoc(evalRef, { results, summary: summaryCount, updatedAt: serverTimestamp(), updatedBy: currentUser?.uid || '' }, { merge: true });
                }
            }
            await deleteDoc(doc(db, 'school-settings', schoolId, 'remediation_requests', req.id));
            Swal.fire({ icon: 'success', title: 'ลบและคืนค่าเดิมแล้ว', timer: 1500, showConfirmButton: false });
            await loadData();
        } catch (err) {
            console.error('Error deleting remediation request:', err);
            Swal.fire('ผิดพลาด', 'ไม่สามารถลบคำร้องได้', 'error');
        }
    };

    const formatDateTime = (ts: any) => {
        if (!ts?.seconds) return '-';
        const d = new Date(ts.seconds * 1000);
        return `${d.getDate()} ${['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'][d.getMonth()]} ${d.getFullYear() + 543} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
    };

    const handleExportExcel = () => {
        const header = ['ปีการศึกษา', 'ภาคเรียน', 'ระดับชั้น', 'กลุ่มสาระ', 'วิชา', 'กลุ่ม', 'ห้อง', 'ผู้สอน', 'เลขที่', 'เลขประจำตัว', 'ชื่อ-นามสกุล', '%', 'ปกติ', 'Grade', 'แก้ตัว', 'เรียนซ้ำ', 'วันที่ยื่นคำร้อง', 'ผู้บันทึก', 'วันบันทึกผล'];
        const data = filteredRows.map(r => {
            const req = requestsByKey[r.key];
            const isRepeat = req?.status === 'resolved' && req.newResult === 'เรียนซ้ำ';
            const isPass = req?.status === 'resolved' && !isRepeat;
            return [
                r.academicYear, r.semester, r.classLevel, r.subjectGroup || '', `${r.courseCode} ${r.courseTitle}`, r.groupName, r.room,
                r.teacherName, r.number, r.studentCode, r.name,
                r.percent ?? '', r.status === 'normal' ? 'ปกติ' : '', r.grade,
                isPass ? req?.newResult || '' : '', isRepeat ? 'เรียนซ้ำ' : '',
                formatDateTime(req?.requestedAt),
                req?.resolvedByName || '', formatDateTime(req?.resolvedAt),
            ];
        });
        const ws = XLSX.utils.aoa_to_sheet([header, ...data]);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, 'ภาพรวม');
        XLSX.writeFile(wb, `ผลการเรียน_0_ร_มส_มผ_และไม่มีผลการเรียน.xlsx`);
    };

    return (
        <MainLayout>
            <div className={`text-gray-900 dark:text-white transition-colors duration-300 min-h-screen overflow-x-hidden ${isPwaMode ? 'px-2.5 py-3 pb-6' : 'p-4 sm:p-6 space-y-6'}`}>
                <div className={`${isPwaMode ? 'max-w-full' : 'max-w-[1800px]'} mx-auto min-w-0 ${isPwaMode ? 'space-y-4' : 'space-y-6'}`}>

                    {isPwaMode ? (
                        <div className="mb-3 space-y-1.5">
                            <div className="flex items-center gap-2 bg-white dark:bg-[#2a2b2f]/60 backdrop-blur-sm px-3 py-2 rounded-xl border border-gray-200/50 dark:border-white/5">
                                <BackButton to="/academic/hub/zero-r-ms" />
                                <div className="p-1 bg-indigo-50 dark:bg-indigo-500/10 rounded-lg shrink-0">
                                    <LayoutDashboard className="text-indigo-600 dark:text-indigo-400" size={14} />
                                </div>
                                <div className="min-w-0 flex-1">
                                    <p className="text-[11px] font-black text-gray-900 dark:text-white leading-none truncate">ผลการเรียน 0 ร มส มผ และไม่มีผลการเรียน</p>
                                </div>
                            </div>
                        </div>
                    ) : (
                        <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-2 gap-4 bg-white dark:bg-[#2a2b2f]/60 backdrop-blur-sm p-5 rounded-[1.5rem] border border-gray-200/50 dark:border-white/5 transition-all duration-300">
                            <div className="space-y-1 text-left">
                                <div className="flex items-center gap-3">
                                    <BackButton to="/academic/hub/zero-r-ms" />
                                    <div className="p-2.5 bg-indigo-50 dark:bg-indigo-500/10 rounded-2xl shadow-sm border border-indigo-100 dark:border-indigo-500/20">
                                        <LayoutDashboard className="text-indigo-600 dark:text-indigo-400" size={24} />
                                    </div>
                                    <div>
                                        <h1 className="text-2xl font-black text-gray-900 dark:text-white leading-tight tracking-tight">
                                            ผลการเรียน 0 ร มส มผ และไม่มีผลการเรียน
                                        </h1>
                                        <p className="text-gray-500 dark:text-gray-400 text-xs font-bold pt-0.5">ตรวจสอบผล / สรุปผล ทุกวิชาทั้งโรงเรียน</p>
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}

                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                        <button onClick={() => setResultFilter('')} className={`p-3 rounded-2xl border transition-all text-center ${resultFilter === '' ? 'bg-indigo-50 border-indigo-200 dark:bg-indigo-900/20 dark:border-indigo-800/40 text-indigo-700 dark:text-indigo-300' : 'bg-white dark:bg-[#1e1f23] border-gray-100 dark:border-gray-800 text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-white/5'}`}>
                            <span className="block text-[10px] font-black uppercase tracking-wider">ทั้งหมด</span>
                            <span className="block text-2xl font-black mt-1">{summary.total}</span>
                        </button>
                        <button onClick={() => setResultFilter('normal')} className={`p-3 rounded-2xl border transition-all text-center ${resultFilter === 'normal' ? 'bg-emerald-50 border-emerald-200 dark:bg-emerald-900/20 dark:border-emerald-800/40 text-emerald-700 dark:text-emerald-300' : 'bg-white dark:bg-[#1e1f23] border-gray-100 dark:border-gray-800 text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-white/5'}`}>
                            <span className="block text-[10px] font-black uppercase tracking-wider">ผลปกติ</span>
                            <span className="block text-2xl font-black mt-1">{summary.normal}</span>
                        </button>
                        <button onClick={() => setResultFilter('มส')} className={`p-3 rounded-2xl border transition-all text-center ${resultFilter && resultFilter !== 'normal' && resultFilter !== 'none' ? 'bg-rose-50 border-rose-200 dark:bg-rose-900/20 dark:border-rose-800/40 text-rose-700 dark:text-rose-300' : 'bg-white dark:bg-[#1e1f23] border-gray-100 dark:border-gray-800 text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-white/5'}`}>
                            <span className="block text-[10px] font-black uppercase tracking-wider">ติดผลการเรียน</span>
                            <span className="block text-2xl font-black mt-1">{summary.flagged}</span>
                        </button>
                        <button onClick={() => setResultFilter('none')} className={`p-3 rounded-2xl border transition-all text-center ${resultFilter === 'none' ? 'bg-gray-100 border-gray-300 dark:bg-gray-800 dark:border-gray-700 text-gray-700 dark:text-gray-300' : 'bg-white dark:bg-[#1e1f23] border-gray-100 dark:border-gray-800 text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-white/5'}`}>
                            <span className="block text-[10px] font-black uppercase tracking-wider">ไม่มีผลการเรียน</span>
                            <span className="block text-2xl font-black mt-1">{summary.none}</span>
                        </button>
                    </div>

                    <div className="bg-white dark:bg-[#1e1f23] rounded-3xl shadow-md border border-gray-100 dark:border-gray-800 overflow-hidden">
                        <div className="border-b border-gray-100 dark:border-gray-800 bg-gray-50/50 dark:bg-white/[0.02] p-4 space-y-3">
                            <AcademicYearSemesterFilter
                                schoolId={schoolId}
                                academicYear={termYear}
                                onAcademicYearChange={setTermYear}
                                semester={termSemester}
                                onSemesterChange={setTermSemester}
                            />
                            <div className="flex flex-col sm:flex-row gap-3">
                                <div className="relative flex-1">
                                    <span className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-gray-400">
                                        <Search size={16} />
                                    </span>
                                    <input
                                        type="text"
                                        value={search}
                                        onChange={(e) => setSearch(e.target.value)}
                                        onKeyDown={(e) => { if (e.key === 'Enter') setCurrentPage(1); }}
                                        placeholder="ค้นหาจาก เลขประจำตัว ชื่อ นามสกุล"
                                        className="w-full h-10 pl-9 pr-4 rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-[#151619] text-gray-800 dark:text-gray-200 placeholder-gray-400 focus:ring-2 focus:ring-indigo-500 outline-none text-xs font-bold transition"
                                    />
                                </div>
                                <button
                                    onClick={() => setCurrentPage(1)}
                                    title="ค้นหา"
                                    className="h-10 px-4 rounded-xl bg-teal-500 hover:bg-teal-600 text-white flex items-center justify-center gap-1.5 font-black text-xs shadow-sm transition"
                                >
                                    <Search size={13} /> ไป
                                </button>
                                <select
                                    value={resultFilter}
                                    onChange={(e) => setResultFilter(e.target.value as ResultFilter)}
                                    className="h-10 px-3 rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-[#151619] text-xs font-bold outline-none focus:ring-2 focus:ring-indigo-500"
                                >
                                    <option value="">ผลการเรียน: ทั้งหมด</option>
                                    <option value="0">ติด 0</option>
                                    <option value="ร">ติด ร</option>
                                    <option value="มส">ติด มส</option>
                                    <option value="มผ">ติด มผ</option>
                                    <option value="normal">ปกติ</option>
                                    <option value="none">ไม่มีผลการเรียน</option>
                                </select>
                            </div>
                        </div>

                        {!loading && filteredRows.length > 0 && (
                            <div className="flex flex-col sm:flex-row items-center justify-between gap-3 px-4 py-3 border-b border-gray-100 dark:border-gray-800">
                                <div className="flex items-center gap-2">
                                    <button
                                        onClick={loadData}
                                        disabled={loading}
                                        title="รีเฟรชข้อมูล"
                                        className="flex items-center justify-center w-9 h-9 rounded-xl bg-rose-50 dark:bg-rose-950/40 text-rose-500 dark:text-rose-400 border border-rose-100 dark:border-rose-900/50 hover:bg-rose-100 dark:hover:bg-rose-950/80 shadow-sm transition disabled:opacity-60"
                                    >
                                        <RefreshCw size={15} className={loading ? 'animate-spin' : ''} />
                                    </button>
                                    <button
                                        onClick={handleExportExcel}
                                        title="ส่งออก Excel"
                                        className="flex items-center justify-center w-9 h-9 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white shadow-sm transition"
                                    >
                                        <FileSpreadsheet size={15} />
                                    </button>
                                </div>
                                <div className="flex items-center gap-2">
                                    <button
                                        onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                                        disabled={currentPage <= 1}
                                        className="w-8 h-8 flex items-center justify-center rounded-lg border border-gray-200 dark:border-gray-700 text-gray-500 disabled:opacity-30"
                                    >
                                        <ChevronLeft size={14} />
                                    </button>
                                    <span className="text-xs font-bold text-gray-600 dark:text-gray-300 whitespace-nowrap">หน้า {currentPage} ของ {totalPages} ({filteredRows.length} รายการ)</span>
                                    <button
                                        onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                                        disabled={currentPage >= totalPages}
                                        className="w-8 h-8 flex items-center justify-center rounded-lg border border-gray-200 dark:border-gray-700 text-gray-500 disabled:opacity-30"
                                    >
                                        <ChevronRight size={14} />
                                    </button>
                                    <select
                                        value={pageSize}
                                        onChange={(e) => setPageSize(Number(e.target.value))}
                                        className="h-8 px-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-[#151619] text-xs font-bold outline-none"
                                    >
                                        {PAGE_SIZE_OPTIONS.map(n => <option key={n} value={n}>{n} / หน้า</option>)}
                                    </select>
                                </div>
                            </div>
                        )}

                        {loading ? (
                            <div className="flex flex-col items-center justify-center py-20 space-y-3">
                                <div className="animate-spin rounded-full h-10 w-10 border-t-2 border-b-2 border-indigo-500"></div>
                                <p className="text-gray-400 dark:text-gray-500 text-sm font-bold">กำลังโหลดข้อมูลภาพรวม...</p>
                            </div>
                        ) : filteredRows.length === 0 ? (
                            <div className="flex flex-col items-center justify-center py-20 text-center px-4">
                                <AlertCircle className="h-14 w-14 text-gray-300 dark:text-gray-700 mb-3" />
                                <h3 className="font-extrabold text-gray-700 dark:text-gray-300 text-lg">ไม่พบข้อมูลตามเงื่อนไข</h3>
                            </div>
                        ) : (
                            <>
                                <div>
                                    <table className="w-full table-fixed text-left border-collapse">
                                        <thead>
                                            <tr className="bg-gray-50/50 dark:bg-white/[0.02] border-b border-gray-100 dark:border-gray-800">
                                                <th className="px-2 py-4 text-xs font-black text-gray-500 dark:text-gray-400 uppercase tracking-wider text-center w-[7%]">ปี/เทอม</th>
                                                <th className="px-2 py-4 text-xs font-black text-gray-500 dark:text-gray-400 uppercase tracking-wider text-center w-[9%]">ชั้น/ห้อง/กลุ่ม</th>
                                                <th className="px-2 py-4 text-xs font-black text-gray-500 dark:text-gray-400 uppercase tracking-wider w-[20%]">กลุ่มสาระ / วิชา / ผู้สอน</th>
                                                <th className="px-2 py-4 text-xs font-black text-gray-500 dark:text-gray-400 uppercase tracking-wider text-center w-[7%]">เลขที่ / รหัส</th>
                                                <th className="px-2 py-4 text-xs font-black text-gray-500 dark:text-gray-400 uppercase tracking-wider w-[14%]">ชื่อ-นามสกุล</th>
                                                <th className="px-2 py-4 text-xs font-black text-gray-500 dark:text-gray-400 uppercase tracking-wider text-center w-[6%]">%</th>
                                                <th className="px-2 py-4 text-xs font-black text-gray-500 dark:text-gray-400 uppercase tracking-wider text-center w-[6%]">ปกติ</th>
                                                <th className="px-2 py-4 text-xs font-black text-gray-500 dark:text-gray-400 uppercase tracking-wider text-center w-[6%]">Grade</th>
                                                <th className="px-2 py-4 text-xs font-black text-gray-500 dark:text-gray-400 uppercase tracking-wider text-center w-[13%]">แก้ตัว / เรียนซ้ำ</th>
                                                <th className="px-2 py-4 text-xs font-black text-gray-500 dark:text-gray-400 uppercase tracking-wider w-[12%]">ยื่นคำร้อง / บันทึกผล</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-gray-50 dark:divide-gray-800/50">
                                            {pagedRows.map(r => {
                                                const req = requestsByKey[r.key];
                                                const isResolved = req?.status === 'resolved';
                                                const isRepeatResolved = isResolved && req?.newResult === 'เรียนซ้ำ';
                                                const isPassResolved = isResolved && !isRepeatResolved;
                                                return (
                                                    <tr key={r.key} className={`hover:bg-gray-50/50 dark:hover:bg-white/[0.02] transition-colors ${r.status === 'flag' ? 'bg-rose-50/30 dark:bg-rose-500/[0.03]' : ''}`}>
                                                        <td className="px-2 py-3.5 text-center">
                                                            <span className="text-sm font-bold text-gray-600 dark:text-gray-300">{r.academicYear}/{r.semester}</span>
                                                        </td>
                                                        <td className="px-2 py-3.5 text-center">
                                                            <span className="text-sm font-bold text-gray-600 dark:text-gray-300">{r.classLevel}/{r.room || '-'}</span>
                                                            <p className="text-xs text-gray-400 dark:text-gray-500">กลุ่ม {r.groupName}</p>
                                                        </td>
                                                        <td className="px-2 py-3.5">
                                                            {r.subjectGroup && (
                                                                <p className="text-[10px] font-bold text-indigo-500 dark:text-indigo-400 truncate uppercase tracking-wide">{r.subjectGroup}</p>
                                                            )}
                                                            <p className="text-sm font-bold truncate text-gray-900 dark:text-white">{r.courseCode} {r.courseTitle}</p>
                                                            <p className="text-xs text-gray-400 dark:text-gray-500 truncate">{r.teacherName}</p>
                                                        </td>
                                                        <td className="px-2 py-3.5 text-center">
                                                            <span className="text-sm font-bold text-gray-600 dark:text-gray-300">{r.number || '-'}</span>
                                                            <p className="text-xs text-gray-400 dark:text-gray-500">{r.studentCode}</p>
                                                        </td>
                                                        <td className="px-2 py-3.5"><p className="text-sm font-bold truncate text-gray-900 dark:text-white">{r.name}</p></td>
                                                        <td className="px-2 py-3.5 text-center"><span className="text-sm font-bold tabular-nums text-gray-700 dark:text-gray-300">{r.percent ?? '-'}</span></td>
                                                        <td className="px-2 py-3.5 text-center"><span className="text-sm font-bold text-emerald-600 dark:text-emerald-400">{r.status === 'normal' ? 'ปกติ' : '-'}</span></td>
                                                        <td className="px-2 py-3.5 text-center">
                                                            <span className={`inline-flex px-2.5 py-1 rounded-md text-sm font-black border ${r.status === 'flag' ? 'bg-rose-50 text-rose-600 border-rose-200 dark:bg-rose-500/10 dark:text-rose-400 dark:border-rose-500/20' : 'bg-slate-50 text-slate-500 border-slate-200 dark:bg-slate-500/10 dark:text-slate-400 dark:border-slate-500/20'}`}>
                                                                {r.grade}
                                                            </span>
                                                        </td>
                                                        <td className="px-2 py-3.5 text-center">
                                                            {r.status !== 'flag' ? (
                                                                <span className="text-sm text-gray-300 dark:text-gray-700">-</span>
                                                            ) : isPassResolved ? (
                                                                <span className="inline-flex items-center gap-1 text-xs font-black px-2.5 py-1.5 rounded-lg bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300">
                                                                    <CheckCircle2 size={13} /> {req?.newResult}
                                                                </span>
                                                            ) : isRepeatResolved ? (
                                                                <span className="inline-flex items-center gap-1 text-xs font-black px-2.5 py-1.5 rounded-lg bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300">
                                                                    <CheckCircle2 size={13} /> เรียนซ้ำ
                                                                </span>
                                                            ) : (
                                                                <div className="flex items-center justify-center gap-1.5">
                                                                    <button
                                                                        onClick={() => handleCorrect(r, 'pass')}
                                                                        disabled={correctingKey === r.key}
                                                                        title="แก้ตัว"
                                                                        className="inline-flex items-center justify-center w-8 h-8 rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 transition-all disabled:opacity-50"
                                                                    >
                                                                        {correctingKey === r.key ? <RefreshCw size={14} className="animate-spin" /> : <Pencil size={14} />}
                                                                    </button>
                                                                    <button
                                                                        onClick={() => handleCorrect(r, 'repeat')}
                                                                        disabled={correctingKey === r.key}
                                                                        title="เรียนซ้ำ"
                                                                        className="inline-flex items-center justify-center w-8 h-8 rounded-lg bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300 hover:bg-amber-200 dark:hover:bg-amber-900/50 transition-all disabled:opacity-50"
                                                                    >
                                                                        {correctingKey === r.key ? <RefreshCw size={14} className="animate-spin" /> : <RotateCcw size={14} />}
                                                                    </button>
                                                                </div>
                                                            )}
                                                        </td>
                                                        <td className="px-2 py-3.5">
                                                            <div className="flex items-start justify-between gap-1.5">
                                                                <div className="min-w-0">
                                                                    {req?.requestedAt && (
                                                                        <p className="text-[11px] text-sky-500 dark:text-sky-400 whitespace-nowrap">ยื่น: {formatDateTime(req.requestedAt)}</p>
                                                                    )}
                                                                    <p className="text-xs font-bold text-gray-500 dark:text-gray-400 truncate">{req?.resolvedByName || '-'}</p>
                                                                    <p className="text-[11px] text-gray-400 dark:text-gray-500 whitespace-nowrap">{req?.resolvedAt ? `บันทึก: ${formatDateTime(req.resolvedAt)}` : ''}</p>
                                                                </div>
                                                                {isSuperAdmin && req?.status === 'resolved' && (
                                                                    <button
                                                                        onClick={() => handleDeleteRequest(r, req)}
                                                                        title="ลบคำร้อง/คืนผลการเรียนเดิม (Super Admin)"
                                                                        className="shrink-0 inline-flex items-center justify-center w-6 h-6 rounded-md text-gray-300 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-500/10 transition-colors"
                                                                    >
                                                                        <Trash2 size={12} />
                                                                    </button>
                                                                )}
                                                            </div>
                                                        </td>
                                                    </tr>
                                                );
                                            })}
                                        </tbody>
                                    </table>
                                </div>
                            </>
                        )}
                    </div>
                </div>
            </div>
        </MainLayout>
    );
};

export default RemediationOverviewPage;
