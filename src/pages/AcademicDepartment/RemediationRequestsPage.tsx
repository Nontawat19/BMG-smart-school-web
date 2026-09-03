import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useSelector, useDispatch } from 'react-redux';
import { RootState } from '@/store';
import MainLayout from '@/layouts/MainLayout';
import BackButton from '@/components/Shared/BackButton';
import ProfileAvatar from '@/components/Shared/ProfileAvatar';
import AcademicYearSemesterFilter from '@/components/Shared/AcademicYearSemesterFilter';
import { firestore as db } from '@/firebase';
import {
    collection, doc, getDoc, getDocs, addDoc, setDoc, updateDoc, query, where, serverTimestamp,
} from 'firebase/firestore';
import Swal from 'sweetalert2';
import { usePermissions } from '@/hooks/usePermissions';
import { ClipboardCheck, RefreshCw, Clock, Search, AlertCircle, Printer, FileDown, X, Loader2, UserPlus, Ban } from 'lucide-react';
import { useResponsivePwaMode as usePwaMode } from '@/hooks/useResponsivePwaMode';
import {
    matchesAcademicTerm, matchesClassLevel, getTeacherDisplayName, fetchStudentTranscript,
    fetchFlaggedStudents, FlaggedCourse, getMinistryRemediationGradeOptions,
} from '@/utils/remediationUtils';
import { fetchTeachersMap } from '@/store/slices/userMapSlice';
import { pdf, PDFViewer } from '@react-pdf/renderer';
import { saveAs } from 'file-saver';
import { RemediationRequestPdfDocument, RemediationRequestPdfBulkDocument } from '@/components/Pdf/remediation';
import { getThaiYear } from '@/utils/dateUtils';

interface RemediationRequest {
    id: string;
    studentId: string;
    studentCode: string;
    studentName: string;
    classLevel: string;
    room: string;
    flagType: 'course' | 'club' | 'learner-activity' | 'guidance';
    originalGrade: string;
    academicYear: string;
    semester: string;
    courseId?: string;
    courseCode?: string;
    courseTitle?: string;
    activityId?: string;
    activityName?: string;
    evalDocId?: string;
    responsibleTeacherIds: string[];
    responsibleTeacherNames: string[];
    status: 'pending' | 'resolved' | 'cancelled';
    requestNote?: string;
    newResult?: string;
    resolvedByName?: string;
}

const RemediationRequestsPage: React.FC = () => {
    const { user: currentUser, hasRole, ACADEMIC_MANAGEMENT } = usePermissions();
    const schoolId = (currentUser as any)?.schoolId;
    const isAcademicManagement = hasRole(ACADEMIC_MANAGEMENT);
    const isPwaMode = usePwaMode();
    const calendarAcademicYear = useSelector((state: RootState) => state.calendar.academicYear);
    const dispatch = useDispatch();
    const { teachers: teacherMap, status: teacherMapStatus } = useSelector((state: RootState) => state.userMap);

    const [loading, setLoading] = useState(true);
    const [requests, setRequests] = useState<RemediationRequest[]>([]);
    const [activeTab, setActiveTab] = useState<'pending' | 'resolved'>('pending');
    const [resolvingId, setResolvingId] = useState<string | null>(null);
    const [studentSearch, setStudentSearch] = useState('');

    const [schoolInfo, setSchoolInfo] = useState<any>(null);
    const [pdfPreview, setPdfPreview] = useState<{ document: React.ReactNode; fileName: string } | null>(null);
    const [isDownloadingPreviewPdf, setIsDownloadingPreviewPdf] = useState(false);
    const [printingId, setPrintingId] = useState<string | null>(null);
    const [printingBulk, setPrintingBulk] = useState(false);
    const [cancellingId, setCancellingId] = useState<string | null>(null);

    // ยื่นคำร้องแทนนักเรียน (ฝ่ายวิชาการ/แอดมินโรงเรียน) — สำหรับกรณีนักเรียนเข้าไม่ถึงระบบหรือยังไม่ได้ยื่นเอง
    const [showSubmitModal, setShowSubmitModal] = useState(false);
    const [loadingFlagged, setLoadingFlagged] = useState(false);
    const [flaggedForSubmission, setFlaggedForSubmission] = useState<Array<{
        key: string; studentId: string; studentCode: string; studentName: string;
        classLevel: string; room: string; flag: FlaggedCourse;
    }>>([]);
    const [submitSearch, setSubmitSearch] = useState('');
    const [submittingKey, setSubmittingKey] = useState<string | null>(null);

    useEffect(() => {
        if (schoolId && teacherMapStatus === 'idle') dispatch(fetchTeachersMap(schoolId) as any);
    }, [schoolId, teacherMapStatus, dispatch]);

    useEffect(() => {
        const loadSchoolInfo = async () => {
            if (!schoolId) return;
            const snap = await getDoc(doc(db, 'school-settings', schoolId));
            if (snap.exists()) setSchoolInfo(snap.data());
        };
        loadSchoolInfo();
    }, [schoolId]);

    // ปีการศึกษา/ภาคเรียนที่ต้องการย้อนดู — อ้างอิงรายชื่อปีการศึกษาจาก /academic/school-calendar
    const [termYear, setTermYear] = useState<string>(() => sessionStorage.getItem('rmr_termYear') ?? '');
    const [termSemester, setTermSemester] = useState<string>(() => sessionStorage.getItem('rmr_termSemester') || '');

    useEffect(() => {
        sessionStorage.setItem('rmr_termYear', termYear);
        sessionStorage.setItem('rmr_termSemester', termSemester);
    }, [termYear, termSemester]);

    useEffect(() => {
        if (sessionStorage.getItem('rmr_termYear') === null && calendarAcademicYear) {
            setTermYear(calendarAcademicYear);
        }
    }, [calendarAcademicYear]);

    const loadData = useCallback(async () => {
        if (!schoolId || !currentUser?.uid) return;
        setLoading(true);
        try {
            const baseRef = collection(db, 'school-settings', schoolId, 'remediation_requests');
            // งานวัดผลประเมินผล/ฝ่ายวิชาการ เห็นคำร้องทั้งโรงเรียน — ครูทั่วไปเห็นเฉพาะคำร้องของวิชา/กิจกรรมที่ตัวเองรับผิดชอบ
            const snap = isAcademicManagement
                ? await getDocs(baseRef)
                : await getDocs(query(baseRef, where('responsibleTeacherIds', 'array-contains', currentUser.uid)));
            const list = snap.docs.map(d => ({ id: d.id, ...(d.data() as any) })) as RemediationRequest[];
            list.sort((a: any, b: any) => (b.requestedAt?.seconds || 0) - (a.requestedAt?.seconds || 0));
            setRequests(list);
        } catch (err: any) {
            console.error('Error loading remediation requests:', err);
            Swal.fire('ผิดพลาด', `ไม่สามารถโหลดคำร้องได้: ${err?.code || err?.message || 'unknown error'}`, 'error');
        } finally {
            setLoading(false);
        }
    }, [schoolId, currentUser?.uid, isAcademicManagement]);

    useEffect(() => { loadData(); }, [loadData]);

    const handleResolve = async (req: RemediationRequest) => {
        if (!schoolId) return;

        let newValue: string | undefined;
        if (req.flagType === 'course') {
            // ตามระเบียบ ศธ./สพฐ.: แก้ตัวจาก "0" หรือ "มส" ได้เกรดสูงสุดไม่เกิน "1" — ใช้ตัวเลือกเดียวกับ
            // หน้า "บันทึก 0 ร มส" (RemediationRecordPage) เพื่อไม่ให้สองหน้านี้บังคับใช้กฎไม่ตรงกัน
            const gradeOptions = getMinistryRemediationGradeOptions(req.originalGrade);
            const { value } = await Swal.fire({
                title: 'บันทึกผลแก้ตัว',
                html: `<div style="text-align:left;font-size:13px;margin-bottom:8px">
                    ${req.studentName} (${req.studentCode})<br/>
                    วิชา: <b>${req.courseTitle || req.courseCode}</b> — ผลเดิม: <b>${req.originalGrade}</b>
                </div>`,
                input: 'select',
                inputOptions: gradeOptions,
                inputPlaceholder: 'เลือกผลการเรียนใหม่',
                showCancelButton: true,
                confirmButtonText: 'บันทึก',
                cancelButtonText: 'ยกเลิก',
                confirmButtonColor: '#4f46e5',
            });
            if (!value) return;
            newValue = value;
        } else {
            const { value } = await Swal.fire({
                title: 'บันทึกผลแก้ตัว',
                html: `<div style="text-align:left;font-size:13px;margin-bottom:8px">
                    ${req.studentName} (${req.studentCode})<br/>
                    กิจกรรม: <b>${req.activityName}</b> — ผลเดิม: <b>มผ</b>
                </div>`,
                input: 'select',
                inputOptions: { passed: 'ผ่าน', failed: 'ไม่ผ่าน' },
                inputPlaceholder: 'เลือกผลการประเมินใหม่',
                showCancelButton: true,
                confirmButtonText: 'บันทึก',
                cancelButtonText: 'ยกเลิก',
                confirmButtonColor: '#4f46e5',
            });
            if (!value) return;
            newValue = value;
        }

        setResolvingId(req.id);
        try {
            if (req.flagType === 'course') {
                await setDoc(
                    doc(db, 'school-settings', schoolId, 'courses', req.courseId!, 'grades', req.studentId),
                    { grade: newValue },
                    { merge: true }
                );
            } else {
                // guidance-evaluations เป็น collection ระดับบนสุด (ไม่ใช่ subcollection ของ activityId เหมือน clubs/learner-activities)
                const evalRef = req.flagType === 'guidance'
                    ? doc(db, 'school-settings', schoolId, 'guidance-evaluations', req.evalDocId!)
                    : doc(db, 'school-settings', schoolId, req.flagType === 'club' ? 'clubs' : 'learner-activities', req.activityId!, 'evaluations', req.evalDocId!);
                const evalSnap = await getDoc(evalRef);
                const data: any = evalSnap.exists() ? evalSnap.data() : {};
                const results: Record<string, any> = { ...(data.results || {}) };
                results[req.studentId] = { ...(results[req.studentId] || {}), status: newValue };
                const summary = Object.values(results).reduce((acc: any, r: any) => {
                    const s = r?.status || 'pending';
                    acc[s] = (acc[s] || 0) + 1;
                    return acc;
                }, { pending: 0, passed: 0, failed: 0 });
                await setDoc(evalRef, {
                    results, summary, updatedAt: serverTimestamp(), updatedBy: currentUser?.uid || '',
                }, { merge: true });
            }

            await updateDoc(doc(db, 'school-settings', schoolId, 'remediation_requests', req.id), {
                status: 'resolved',
                resolvedAt: serverTimestamp(),
                resolvedBy: currentUser?.uid || '',
                resolvedByName: (currentUser as any)?.fullName || '',
                newResult: req.flagType === 'course' ? newValue : (newValue === 'passed' ? 'ผ่าน' : 'ไม่ผ่าน'),
            });

            Swal.fire({ icon: 'success', title: 'บันทึกผลสำเร็จ', timer: 1500, showConfirmButton: false });
            await loadData();
        } catch (err) {
            console.error('Error resolving remediation request:', err);
            Swal.fire('ผิดพลาด', 'ไม่สามารถบันทึกผลได้', 'error');
        } finally {
            setResolvingId(null);
        }
    };

    // ยกเลิกคำร้อง (เช่น ยื่นผิด/ซ้ำ/เป็นข้อมูลทดสอบ) — soft-delete ด้วย status:'cancelled' ไม่ลบเอกสารจริง
    // เพื่อให้ dedup-check ของหน้าอื่นๆ (MyGradeFlagsPage, RemediationRecordPage) ยังทำงานถูกต้อง
    const handleCancelRequest = async (req: RemediationRequest) => {
        const confirm = await Swal.fire({
            icon: 'warning',
            title: 'ยืนยันยกเลิกคำร้อง',
            html: `<div style="text-align:left;font-size:13px">${req.studentName} (${req.studentCode})<br/>วิชา/กิจกรรม: <b>${req.courseTitle || req.activityName}</b></div>`,
            showCancelButton: true,
            confirmButtonText: 'ยกเลิกคำร้อง',
            cancelButtonText: 'ปิด',
            confirmButtonColor: '#dc2626',
        });
        if (!confirm.isConfirmed) return;

        setCancellingId(req.id);
        try {
            await updateDoc(doc(db, 'school-settings', schoolId, 'remediation_requests', req.id), {
                status: 'cancelled',
                cancelledAt: serverTimestamp(),
                cancelledBy: currentUser?.uid || '',
            });
            Swal.fire({ icon: 'success', title: 'ยกเลิกคำร้องแล้ว', timer: 1200, showConfirmButton: false });
            await loadData();
        } catch (err) {
            console.error('Error cancelling remediation request:', err);
            Swal.fire('ผิดพลาด', 'ไม่สามารถยกเลิกคำร้องได้', 'error');
        } finally {
            setCancellingId(null);
        }
    };

    const requestDedupKey = (studentId: string, idValue: string, academicYear: string, semester: string) =>
        `${studentId}|${idValue}|${academicYear}|${semester}`;

    // โหลดรายชื่อนักเรียนที่ติด 0/ร/มส/มผ อยู่จริงตอนนี้ (แหล่งข้อมูลเดียวกับ remediation-record) แล้วตัดคน
    // ที่มีคำร้อง (ไม่ว่าจะ pending หรือ resolved) อยู่แล้วออก — เหลือเฉพาะรายการที่ยังไม่เคยมีคำร้องให้เลือกยื่นแทน
    const loadFlaggedForSubmission = useCallback(async () => {
        if (!schoolId) return;
        setLoadingFlagged(true);
        try {
            const flagRows = await fetchFlaggedStudents(schoolId, teacherMap, { classLevelFilter: 'all' });
            const existingKeys = new Set(
                requests.filter(r => r.status !== 'cancelled').map(r => {
                    const idValue = r.flagType === 'course' ? r.courseId : r.activityId;
                    return requestDedupKey(r.studentId, idValue || '', r.academicYear, r.semester);
                })
            );
            const list: Array<{ key: string; studentId: string; studentCode: string; studentName: string; classLevel: string; room: string; flag: FlaggedCourse }> = [];
            flagRows.forEach(sr => {
                sr.flags.forEach((flag, idx) => {
                    const idValue = flag.flagKind === 'course' ? flag.courseId : (flag.activityDocId || flag.courseId);
                    const key = requestDedupKey(sr.id, idValue, flag.academicYear, flag.semester);
                    if (existingKeys.has(key)) return;
                    list.push({
                        key: `${key}|${idx}`, studentId: sr.id, studentCode: sr.studentCode, studentName: sr.name,
                        classLevel: sr.classLevel, room: sr.room, flag,
                    });
                });
            });
            setFlaggedForSubmission(list);
        } catch (err) {
            console.error('Error loading flagged students for submission:', err);
            Swal.fire('ผิดพลาด', 'ไม่สามารถโหลดรายชื่อนักเรียนที่ติดผลได้', 'error');
        } finally {
            setLoadingFlagged(false);
        }
    }, [schoolId, teacherMap, requests]);

    const handleOpenSubmitModal = () => {
        setShowSubmitModal(true);
        loadFlaggedForSubmission();
    };

    // ยื่นคำร้องแทนนักเรียน — payload เหมือน MyGradeFlagsPage ทุกประการ ต่างแค่ requestedBy เป็นผู้ยื่นแทน (staff)
    const handleSubmitOnBehalf = async (row: { key: string; studentId: string; studentCode: string; studentName: string; classLevel: string; room: string; flag: FlaggedCourse }) => {
        setSubmittingKey(row.key);
        try {
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
                status: 'pending',
                requestedAt: serverTimestamp(),
                requestedBy: currentUser?.uid || '',
                requestNote: `ยื่นแทนนักเรียนโดย${isAcademicManagement ? 'ฝ่ายวิชาการ/แอดมินโรงเรียน' : 'ครูผู้สอน'}`,
            };
            if (row.flag.flagKind === 'course') {
                payload.courseId = row.flag.courseId;
                payload.courseCode = row.flag.courseCode;
                payload.courseTitle = row.flag.courseTitle;
            } else {
                payload.activityId = row.flag.activityDocId;
                payload.activityName = row.flag.courseTitle || row.flag.courseCode;
                payload.evalDocId = row.flag.evalDocId;
                if (row.flag.teacherScopeKey) payload.teacherScopeKey = row.flag.teacherScopeKey;
            }
            await addDoc(collection(db, 'school-settings', schoolId, 'remediation_requests'), payload);
            Swal.fire({ icon: 'success', title: 'ยื่นคำร้องสำเร็จ', timer: 1200, showConfirmButton: false });
            setFlaggedForSubmission(prev => prev.filter(r => r.key !== row.key));
            await loadData();
        } catch (err) {
            console.error('Error submitting remediation request on behalf of student:', err);
            Swal.fire('ผิดพลาด', 'ไม่สามารถยื่นคำร้องได้', 'error');
        } finally {
            setSubmittingKey(null);
        }
    };

    const termFilteredRequests = useMemo(
        () => requests.filter(r => matchesAcademicTerm(r.academicYear, r.semester, termYear, termSemester)),
        [requests, termYear, termSemester]
    );

    const filtered = useMemo(() => {
        const kw = studentSearch.trim().toLowerCase();
        return termFilteredRequests.filter(r => {
            if (activeTab === 'pending' && r.status !== 'pending') return false;
            if (activeTab === 'resolved' && r.status !== 'resolved') return false;
            if (!kw) return true;
            return `${r.studentName} ${r.studentCode} ${r.courseTitle || ''} ${r.courseCode || ''} ${r.activityName || ''}`.toLowerCase().includes(kw);
        });
    }, [termFilteredRequests, activeTab, studentSearch]);

    // สร้างข้อมูลสำหรับ 1 หน้า/นักเรียน 1 คน — ดึงประวัติผลการเรียนทั้งหมด (ไม่ใช่แค่วิชาที่ยื่นคำร้อง)
    // แล้วให้ fetchStudentTranscript ทำเครื่องหมายแก้ตัว/เรียนซ้ำเองตามคำร้องจริงที่มีอยู่ในระบบ
    const buildPdfEntry = useCallback(async (req: RemediationRequest) => {
        const [rows, studentSnap] = await Promise.all([
            fetchStudentTranscript(schoolId, teacherMap, req.studentId, req.classLevel),
            getDoc(doc(db, 'school-settings', schoolId, 'students', req.studentId)),
        ]);
        const sData: any = studentSnap.exists() ? studentSnap.data() : {};
        const studentNumber = String(sData.studentNumber || sData.number || sData.no || sData['เลขที่'] || '').trim();
        const advisorTeachers = Object.values(teacherMap || {}).filter((t: any) =>
            matchesClassLevel(t.homeroomGrade, req.classLevel) && String(t.homeroomRoom || '') === String(req.room || '')
        ) as any[];
        const advisorNames = advisorTeachers.map((t: any) => getTeacherDisplayName(teacherMap, t.id)).filter(n => n !== '-');
        const today = new Date();
        return {
            student: { name: req.studentName, code: req.studentCode, classLevel: req.classLevel, room: req.room, number: studentNumber },
            schoolInfo,
            requestDate: { day: String(today.getDate()), month: today.toLocaleDateString('th-TH', { month: 'long' }), year: String(getThaiYear(today)) },
            requestAcademicYear: req.academicYear,
            requestSemester: req.semester,
            rows,
            advisorNames,
            directorName: [schoolInfo?.directorPrefix, schoolInfo?.directorName].filter(Boolean).join(' '),
            principalPosition: schoolInfo?.principalPosition || 'ผู้อำนวยการโรงเรียน',
        };
    }, [schoolId, teacherMap, schoolInfo]);

    const handlePrintRequest = async (req: RemediationRequest) => {
        if (!schoolId || !schoolInfo) {
            Swal.fire('ไม่พบข้อมูลโรงเรียน', 'กรุณาตรวจสอบการตั้งค่าข้อมูลโรงเรียนก่อนออกเอกสาร', 'warning');
            return;
        }
        setPrintingId(req.id);
        try {
            const entry = await buildPdfEntry(req);
            const docToRender = <RemediationRequestPdfDocument {...entry} />;
            setPdfPreview({ document: docToRender, fileName: `คำร้องขอสอบแก้ตัว_${req.studentCode}_${req.studentName}.pdf` });
        } catch (err) {
            console.error('Error building remediation PDF:', err);
            Swal.fire('ผิดพลาด', 'ไม่สามารถสร้างไฟล์ PDF ได้', 'error');
        } finally {
            setPrintingId(null);
        }
    };

    const handlePrintBulk = async () => {
        if (!schoolId || !schoolInfo) {
            Swal.fire('ไม่พบข้อมูลโรงเรียน', 'กรุณาตรวจสอบการตั้งค่าข้อมูลโรงเรียนก่อนออกเอกสาร', 'warning');
            return;
        }
        if (filtered.length === 0) {
            Swal.fire('ไม่มีคำร้อง', 'ไม่มีคำร้องที่ตรงกับเงื่อนไขปัจจุบันให้พิมพ์', 'info');
            return;
        }
        setPrintingBulk(true);
        try {
            // พิมพ์ 1 ใบ/นักเรียน 1 คน — ถ้านักเรียนคนเดียวกันมีหลายคำร้องพร้อมกัน รวมเป็นใบเดียว (unique studentId)
            const uniqueByStudent = new Map<string, RemediationRequest>();
            filtered.forEach(r => { if (!uniqueByStudent.has(r.studentId)) uniqueByStudent.set(r.studentId, r); });
            const entries = await Promise.all(Array.from(uniqueByStudent.values()).map(r => buildPdfEntry(r)));
            const docToRender = <RemediationRequestPdfBulkDocument entries={entries} />;
            setPdfPreview({ document: docToRender, fileName: `คำร้องขอสอบแก้ตัว_รวม_${entries.length}คน.pdf` });
        } catch (err) {
            console.error('Error building bulk remediation PDF:', err);
            Swal.fire('ผิดพลาด', 'ไม่สามารถสร้างไฟล์ PDF ได้', 'error');
        } finally {
            setPrintingBulk(false);
        }
    };

    const downloadPreviewPdf = async () => {
        if (!pdfPreview) return;
        setIsDownloadingPreviewPdf(true);
        try {
            const blob = await pdf(pdfPreview.document as any).toBlob();
            saveAs(blob, pdfPreview.fileName);
        } finally {
            setIsDownloadingPreviewPdf(false);
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
                                    <ClipboardCheck className="text-indigo-600 dark:text-indigo-400" size={14} />
                                </div>
                                <div className="min-w-0 flex-1">
                                    <p className="text-[11px] font-black text-gray-900 dark:text-white leading-none truncate">คำร้องขอแก้ตัว 0/ร/มส/มผ</p>
                                    <p className="text-[9px] text-indigo-500 dark:text-indigo-400 font-semibold truncate mt-0.5">
                                        {isAcademicManagement ? 'คำร้องทั้งหมดในโรงเรียน' : 'คำร้องของวิชา/กิจกรรมที่ท่านรับผิดชอบ'}
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
                                        <ClipboardCheck className="text-indigo-600 dark:text-indigo-400" size={24} />
                                    </div>
                                    <div>
                                        <h1 className="text-2xl font-black text-gray-900 dark:text-white leading-tight tracking-tight">
                                            คำร้องขอแก้ตัว 0/ร/มส/มผ
                                        </h1>
                                        <p className="text-gray-500 dark:text-gray-400 text-xs font-bold flex items-center gap-1.5 pt-0.5">
                                            <span className="text-indigo-600 dark:text-indigo-400 font-extrabold">
                                                {isAcademicManagement ? 'คำร้องทั้งหมดในโรงเรียน' : 'คำร้องของวิชา/กิจกรรมที่ท่านรับผิดชอบ'}
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
                            <span className="block text-[10px] sm:text-xs font-black text-amber-600 dark:text-amber-400 tracking-wider">รอดำเนินการ</span>
                            <span className="block text-2xl sm:text-3xl font-black text-amber-700 dark:text-amber-300 mt-1">
                                {termFilteredRequests.filter(r => r.status === 'pending').length}
                            </span>
                        </div>
                        <div className="bg-emerald-50 dark:bg-emerald-500/10 border border-emerald-100 dark:border-emerald-500/20 rounded-2xl text-center transition-all duration-300 p-3 sm:p-4">
                            <span className="block text-[10px] sm:text-xs font-black text-emerald-600 dark:text-emerald-400 tracking-wider">เสร็จแล้ว</span>
                            <span className="block text-2xl sm:text-3xl font-black text-emerald-700 dark:text-emerald-300 mt-1">
                                {termFilteredRequests.filter(r => r.status === 'resolved').length}
                            </span>
                        </div>
                        <div className="bg-gray-50 dark:bg-white/5 border border-gray-200 dark:border-gray-800 rounded-2xl text-center transition-all duration-300 p-3 sm:p-4">
                            <span className="block text-[10px] sm:text-xs font-black text-gray-500 dark:text-gray-400 tracking-wider">ทั้งหมด</span>
                            <span className="block text-2xl sm:text-3xl font-black text-gray-700 dark:text-gray-200 mt-1">
                                {termFilteredRequests.length}
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

                        {/* Header Panel */}
                        <div className={`border-b border-gray-100 dark:border-gray-800 bg-gray-50/50 dark:bg-white/[0.02] flex flex-col sm:flex-row justify-between gap-4 items-center ${isPwaMode ? 'p-2.5 bg-transparent dark:bg-transparent border-none' : 'p-5'}`}>
                            <div className="relative w-full sm:w-80">
                                <span className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-gray-400">
                                    <Search size={18} />
                                </span>
                                <input
                                    type="text"
                                    value={studentSearch}
                                    onChange={(e) => setStudentSearch(e.target.value)}
                                    placeholder="ค้นหาชื่อ รหัสประจำตัว หรือวิชา..."
                                    className="w-full h-10 pl-10 pr-4 rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-[#151619] text-gray-800 dark:text-gray-200 placeholder-gray-400 focus:ring-2 focus:ring-indigo-500 outline-none text-sm font-bold transition"
                                />
                            </div>

                            <div className="flex gap-1.5 bg-gray-100 dark:bg-gray-800 rounded-xl p-1 w-full sm:w-auto">
                                <button
                                    onClick={() => setActiveTab('pending')}
                                    className={`flex-1 sm:flex-none px-4 py-1.5 rounded-lg text-xs font-black transition-all ${
                                        activeTab === 'pending'
                                            ? 'bg-white dark:bg-gray-700 shadow-sm text-indigo-600 dark:text-indigo-300'
                                            : 'text-gray-400 hover:text-gray-600 dark:hover:text-gray-200'
                                    }`}
                                >
                                    รอดำเนินการ
                                </button>
                                <button
                                    onClick={() => setActiveTab('resolved')}
                                    className={`flex-1 sm:flex-none px-4 py-1.5 rounded-lg text-xs font-black transition-all ${
                                        activeTab === 'resolved'
                                            ? 'bg-white dark:bg-gray-700 shadow-sm text-indigo-600 dark:text-indigo-300'
                                            : 'text-gray-400 hover:text-gray-600 dark:hover:text-gray-200'
                                    }`}
                                >
                                    เสร็จแล้ว
                                </button>
                            </div>

                            {isAcademicManagement && (
                                <button
                                    onClick={handleOpenSubmitModal}
                                    title="ยื่นคำร้องขอแก้ตัวแทนนักเรียน (สำหรับฝ่ายวิชาการ/แอดมินโรงเรียน)"
                                    className="w-full sm:w-auto inline-flex items-center justify-center gap-1.5 h-10 px-4 rounded-xl bg-emerald-50 hover:bg-emerald-100 dark:bg-emerald-500/10 dark:hover:bg-emerald-500/20 text-emerald-600 dark:text-emerald-300 border border-emerald-100 dark:border-emerald-500/20 text-xs font-black transition shrink-0"
                                >
                                    <UserPlus size={14} />
                                    ยื่นคำร้องแทนนักเรียน
                                </button>
                            )}

                            <button
                                onClick={handlePrintBulk}
                                disabled={printingBulk || filtered.length === 0}
                                title="พิมพ์คำร้องขอสอบแก้ตัวรวมทุกคนที่กำลังแสดงอยู่"
                                className="w-full sm:w-auto inline-flex items-center justify-center gap-1.5 h-10 px-4 rounded-xl bg-indigo-50 hover:bg-indigo-100 dark:bg-indigo-500/10 dark:hover:bg-indigo-500/20 text-indigo-600 dark:text-indigo-300 border border-indigo-100 dark:border-indigo-500/20 text-xs font-black transition disabled:opacity-40 disabled:pointer-events-none shrink-0"
                            >
                                {printingBulk ? <RefreshCw size={14} className="animate-spin" /> : <Printer size={14} />}
                                พิมพ์รวม ({filtered.length})
                            </button>
                        </div>

                        {/* Roster Listing */}
                        {loading ? (
                            <div className="flex flex-col items-center justify-center py-20 space-y-3">
                                <div className="animate-spin rounded-full h-10 w-10 border-t-2 border-b-2 border-indigo-500"></div>
                                <p className="text-gray-400 dark:text-gray-500 text-sm font-bold">กำลังโหลดข้อมูลคำร้อง...</p>
                            </div>
                        ) : filtered.length === 0 ? (
                            <div className="flex flex-col items-center justify-center py-20 text-center px-4 bg-white dark:bg-[#1e1f21] rounded-3xl border border-gray-100 dark:border-gray-800">
                                <AlertCircle className="h-14 w-14 text-gray-300 dark:text-gray-700 mb-3" />
                                <h3 className="font-extrabold text-gray-700 dark:text-gray-300 text-lg">ไม่พบข้อมูลคำร้อง</h3>
                                <p className="text-gray-400 dark:text-gray-500 text-sm mt-1 max-w-sm">
                                    {studentSearch ? 'ไม่มีคำร้องที่ตรงกับข้อความที่พิมพ์ค้นหา' : 'ไม่มีคำร้องแก้ตัวในสถานะนี้'}
                                </p>
                            </div>
                        ) : (
                            <div className="border border-gray-100 dark:border-gray-800 rounded-xl overflow-hidden bg-white dark:bg-[#1e1f21] shadow-sm">
                                <div className="divide-y divide-gray-100 dark:divide-gray-800 bg-white dark:bg-[#1e1f21]">
                                    {filtered.map((req) => (
                                        <div
                                            key={req.id}
                                            className="p-4 sm:p-5 flex flex-col sm:flex-row justify-between sm:items-center gap-4 hover:bg-gray-50/50 dark:hover:bg-white/[0.01] transition-all"
                                        >
                                            <div className="flex items-center gap-3.5">
                                                <ProfileAvatar
                                                    src={`https://ui-avatars.com/api/?name=${req.studentName}&background=random`}
                                                    alt={req.studentName}
                                                    className="h-10 w-10 border border-gray-100 dark:border-gray-800 shrink-0"
                                                />
                                                <div>
                                                    <h4 className="font-bold text-gray-800 dark:text-gray-200 text-sm sm:text-base flex items-center gap-2 flex-wrap">
                                                        {req.studentName}
                                                        <span className="text-[10px] font-black px-2 py-0.5 rounded-full bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-300">
                                                            ผลเดิม: {req.originalGrade}
                                                        </span>
                                                    </h4>
                                                    <p className="text-gray-400 text-[11px] font-medium mt-0.5">
                                                        รหัสประจำตัว: {req.studentCode} · ชั้น {req.classLevel}/{req.room} · ปี {req.academicYear}/{req.semester}
                                                    </p>
                                                    <p className="text-indigo-600 dark:text-indigo-400 text-xs font-black mt-1">
                                                        วิชา/กิจกรรม: {req.courseTitle || req.activityName} {req.courseCode ? `(${req.courseCode})` : ''}
                                                    </p>
                                                    {req.requestNote && (
                                                        <p className="text-gray-500 dark:text-gray-400 text-[11px] mt-1 bg-gray-50 dark:bg-white/5 px-2.5 py-1 rounded-lg border border-gray-200/50 dark:border-gray-800 w-fit">
                                                            หมายเหตุ: {req.requestNote}
                                                        </p>
                                                    )}
                                                    {req.status === 'resolved' && (
                                                        <div className="flex flex-wrap items-center gap-2 mt-1.5">
                                                            <span className="inline-flex items-center gap-1 bg-emerald-500/10 text-emerald-500 dark:bg-emerald-500/20 text-[10px] px-2.5 py-0.5 rounded-full border border-emerald-500/20 font-black">
                                                                ผลใหม่: {req.newResult} {req.resolvedByName ? `(โดย ${req.resolvedByName})` : ''}
                                                            </span>
                                                        </div>
                                                    )}
                                                </div>
                                            </div>

                                            <div className="flex gap-1.5 w-full sm:w-auto shrink-0 select-none items-center justify-end">
                                                <button
                                                    onClick={() => handlePrintRequest(req)}
                                                    disabled={printingId === req.id}
                                                    title="พิมพ์คำร้องขอสอบแก้ตัว"
                                                    className="w-10 h-10 shrink-0 rounded-xl bg-gray-100 hover:bg-gray-200 dark:bg-gray-800 dark:hover:bg-gray-700 text-gray-600 dark:text-gray-300 shadow-sm transition active:scale-95 disabled:opacity-50 disabled:pointer-events-none flex items-center justify-center"
                                                >
                                                    {printingId === req.id ? <RefreshCw size={14} className="animate-spin" /> : <Printer size={14} />}
                                                </button>
                                                {req.status === 'pending' ? (
                                                    <>
                                                        {isAcademicManagement && (
                                                            <button
                                                                onClick={() => handleCancelRequest(req)}
                                                                disabled={cancellingId === req.id}
                                                                title="ยกเลิกคำร้อง"
                                                                className="w-10 h-10 shrink-0 rounded-xl bg-red-50 hover:bg-red-100 dark:bg-red-500/10 dark:hover:bg-red-500/20 text-red-600 dark:text-red-400 shadow-sm transition active:scale-95 disabled:opacity-50 disabled:pointer-events-none flex items-center justify-center"
                                                            >
                                                                {cancellingId === req.id ? <RefreshCw size={14} className="animate-spin" /> : <Ban size={14} />}
                                                            </button>
                                                        )}
                                                        <button
                                                            onClick={() => handleResolve(req)}
                                                            disabled={resolvingId === req.id}
                                                            className="w-full sm:w-auto px-4 h-10 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-black shadow-md transition active:scale-95 disabled:opacity-50 disabled:pointer-events-none flex items-center justify-center gap-1.5"
                                                        >
                                                            {resolvingId === req.id ? <RefreshCw size={12} className="animate-spin" /> : <ClipboardCheck size={14} />}
                                                            บันทึกผลแก้ตัว
                                                        </button>
                                                    </>
                                                ) : (
                                                    <span className="inline-flex items-center gap-1 text-[11px] font-black px-3.5 py-2 rounded-xl bg-emerald-500/10 text-emerald-600 dark:bg-emerald-500/20 dark:text-emerald-400">
                                                        <Clock size={12} /> แก้ไขเสร็จสิ้น
                                                    </span>
                                                )}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {pdfPreview && (
                <div
                    className="fixed inset-0 top-[60px] z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
                    onClick={() => setPdfPreview(null)}
                >
                    <div
                        className="flex h-[calc(100vh-100px)] w-full max-w-5xl flex-col rounded-2xl bg-white shadow-2xl dark:bg-[#1e1f21]"
                        onClick={(e) => e.stopPropagation()}
                    >
                        <div className="flex items-center justify-between border-b border-gray-200 px-5 py-4 dark:border-white/10">
                            <h2 className="text-base font-bold text-gray-900 dark:text-white truncate pr-4">
                                ตัวอย่างเอกสาร — {pdfPreview.fileName}
                            </h2>
                            <div className="flex items-center gap-2 shrink-0">
                                <button
                                    type="button"
                                    onClick={downloadPreviewPdf}
                                    disabled={isDownloadingPreviewPdf}
                                    className="inline-flex h-9 items-center justify-center gap-2 rounded-lg bg-indigo-600 px-4 text-sm font-bold text-white shadow-sm transition hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50"
                                >
                                    {isDownloadingPreviewPdf ? <Loader2 size={16} className="animate-spin" /> : <FileDown size={16} />}
                                    {isDownloadingPreviewPdf ? 'กำลังบันทึก...' : 'ดาวน์โหลด'}
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setPdfPreview(null)}
                                    className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-gray-500 transition hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-white/10"
                                    title="ปิด"
                                >
                                    <X size={18} />
                                </button>
                            </div>
                        </div>
                        <div className="flex-1 overflow-hidden rounded-b-2xl bg-gray-100 dark:bg-gray-900">
                            <PDFViewer width="100%" height="100%" className="h-full w-full border-none" showToolbar={true}>
                                {pdfPreview.document as any}
                            </PDFViewer>
                        </div>
                    </div>
                </div>
            )}

            {showSubmitModal && (
                <div
                    className="fixed inset-0 top-[60px] z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
                    onClick={() => setShowSubmitModal(false)}
                >
                    <div
                        className="flex h-[calc(100vh-100px)] w-full max-w-2xl flex-col rounded-2xl bg-white shadow-2xl dark:bg-[#1e1f21]"
                        onClick={(e) => e.stopPropagation()}
                    >
                        <div className="flex items-center justify-between border-b border-gray-200 px-5 py-4 dark:border-white/10">
                            <h2 className="text-base font-bold text-gray-900 dark:text-white">ยื่นคำร้องขอแก้ตัวแทนนักเรียน</h2>
                            <button
                                type="button"
                                onClick={() => setShowSubmitModal(false)}
                                className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-gray-500 transition hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-white/10"
                                title="ปิด"
                            >
                                <X size={18} />
                            </button>
                        </div>

                        <div className="px-5 py-3 border-b border-gray-100 dark:border-white/10">
                            <div className="relative">
                                <span className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-gray-400">
                                    <Search size={14} />
                                </span>
                                <input
                                    value={submitSearch}
                                    onChange={(e) => setSubmitSearch(e.target.value)}
                                    placeholder="ค้นหาชื่อ รหัสประจำตัว หรือวิชา/กิจกรรม..."
                                    className="w-full h-9 pl-8 pr-3 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-[#151619] outline-none focus:ring-2 focus:ring-indigo-500 text-xs font-bold transition"
                                />
                            </div>
                            <p className="text-[11px] text-gray-400 mt-1.5">
                                รายชื่อด้านล่างคือนักเรียนที่ติด 0/ร/มส/มผ อยู่จริงตอนนี้ และยังไม่มีคำร้องมาก่อน (ข้อมูลเดียวกับหน้า "บันทึก 0 ร มส")
                            </p>
                        </div>

                        <div className="flex-1 overflow-y-auto">
                            {loadingFlagged ? (
                                <div className="flex items-center justify-center py-16 text-gray-400">
                                    <RefreshCw size={20} className="animate-spin" />
                                </div>
                            ) : (() => {
                                const kw = submitSearch.trim().toLowerCase();
                                const list = flaggedForSubmission.filter(r =>
                                    !kw || `${r.studentName} ${r.studentCode} ${r.flag.courseTitle} ${r.flag.courseCode}`.toLowerCase().includes(kw)
                                );
                                if (list.length === 0) {
                                    return (
                                        <div className="flex flex-col items-center justify-center py-16 text-gray-400 gap-2">
                                            <AlertCircle size={28} />
                                            <p className="text-sm font-bold">
                                                {submitSearch ? 'ไม่พบรายการที่ตรงกับการค้นหา' : 'ไม่มีนักเรียนที่ติดผลรออยู่ (ทุกคนมีคำร้องแล้ว)'}
                                            </p>
                                        </div>
                                    );
                                }
                                return (
                                    <div className="divide-y divide-gray-100 dark:divide-gray-800">
                                        {list.map(row => (
                                            <div key={row.key} className="flex items-center justify-between gap-3 px-5 py-3">
                                                <div className="min-w-0">
                                                    <p className="font-bold text-sm text-gray-800 dark:text-gray-100 truncate">
                                                        {row.studentName}
                                                        <span className="ml-2 text-[10px] font-black px-1.5 py-0.5 rounded-full bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-300">
                                                            {row.flag.grade}
                                                        </span>
                                                    </p>
                                                    <p className="text-[11px] text-gray-400">
                                                        {row.studentCode} · ชั้น {row.classLevel}/{row.room} · ปี {row.flag.academicYear}/{row.flag.semester}
                                                    </p>
                                                    <p className="text-[11px] text-indigo-600 dark:text-indigo-400 font-bold truncate">
                                                        {row.flag.courseTitle || row.flag.courseCode}
                                                    </p>
                                                </div>
                                                <button
                                                    onClick={() => handleSubmitOnBehalf(row)}
                                                    disabled={submittingKey === row.key}
                                                    className="shrink-0 inline-flex items-center gap-1.5 h-9 px-3.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-black transition active:scale-95 disabled:opacity-50 disabled:pointer-events-none"
                                                >
                                                    {submittingKey === row.key ? <RefreshCw size={12} className="animate-spin" /> : <UserPlus size={12} />}
                                                    ยื่นคำร้อง
                                                </button>
                                            </div>
                                        ))}
                                    </div>
                                );
                            })()}
                        </div>
                    </div>
                </div>
            )}
        </MainLayout>
    );
};

export default RemediationRequestsPage;
