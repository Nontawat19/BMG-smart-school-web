import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useSelector } from 'react-redux';
import { RootState } from '@/store';
import MainLayout from '@/layouts/MainLayout';
import BackButton from '@/components/Shared/BackButton';
import { firestore as db } from '@/firebase';
import {
    collection, doc, getDoc, getDocs, addDoc, updateDoc, setDoc, serverTimestamp, deleteField,
} from 'firebase/firestore';
import Swal from 'sweetalert2';
import { usePermissions } from '@/hooks/usePermissions';
import { FaSave, FaTimes, FaPrint } from 'react-icons/fa';
import {
    RefreshCw, CheckCircle2, AlertCircle,
} from 'lucide-react';
import { useResponsivePwaMode as usePwaMode } from '@/hooks/useResponsivePwaMode';
import {
    FlaggedCourse, fetchFlaggedStudents, matchesClassLevel, isActivityCourseCode,
} from '@/utils/remediationUtils';

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

const requestDedupKey = (studentId: string, activityId: string, academicYear: string, semester: string) =>
    `${studentId}|${activityId}|${academicYear}|${semester}`;

const SUBJECT_GROUPS = [
    'ทั้งหมด',
    'กิจกรรมพัฒนาผู้เรียน',
    'ภาษาไทย',
    'คณิตศาสตร์',
    'วิทยาศาสตร์และเทคโนโลยี',
    'สังคมศึกษา ศาสนา และวัฒนธรรม',
    'สุขศึกษาและพลศึกษา',
    'ศิลปะ',
    'การงานอาชีพ',
    'ภาษาต่างประเทศ',
];

const CLASS_LEVELS = [
    { value: 'all', label: 'ทั้งหมด' },
    { value: 'ม.1', label: 'ม.1' },
    { value: 'ม.2', label: 'ม.2' },
    { value: 'ม.3', label: 'ม.3' },
    { value: 'ม.4', label: 'ม.4' },
    { value: 'ม.5', label: 'ม.5' },
    { value: 'ม.6', label: 'ม.6' },
    { value: 'ป.1', label: 'ป.1' },
    { value: 'ป.2', label: 'ป.2' },
    { value: 'ป.3', label: 'ป.3' },
    { value: 'ป.4', label: 'ป.4' },
    { value: 'ป.5', label: 'ป.5' },
    { value: 'ป.6', label: 'ป.6' },
];

const RemediationRecordPage: React.FC = () => {
    const { user: currentUser, hasRole, ACADEMIC_MANAGEMENT } = usePermissions();
    const teacherMap = useSelector((state: RootState) => (state as any).userMap?.teachers || {});
    const schoolId = (currentUser as any)?.schoolId;
    const isAcademicManagement = hasRole(ACADEMIC_MANAGEMENT);
    const calendarAcademicYear = useSelector((state: RootState) => state.calendar.academicYear);
    const isPwaMode = usePwaMode();

    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [rows, setRows] = useState<FlagRowWithStudent[]>([]);

    // Search and filter states (matching SGS style)
    const [searchStudent, setSearchStudent] = useState('');
    const [searchCourse, setSearchCourse] = useState('');
    const [activeCourseSearch, setActiveCourseSearch] = useState('');

    const [termYear, setTermYear] = useState<string>(() => sessionStorage.getItem('rmrec_termYear') || 'ทั้งหมด');
    const [termSemester, setTermSemester] = useState<string>(() => sessionStorage.getItem('rmrec_termSemester') || 'ทั้งหมด');
    const [filterSubjectGroup, setFilterSubjectGroup] = useState<string>('ทั้งหมด');
    const [filterClassLevel, setFilterClassLevel] = useState<string>('all');

    // Inline edit states
    const [remedValues, setRemedValues] = useState<Record<string, string>>({});
    const [repeatValues, setRepeatValues] = useState<Record<string, string>>({});
    const [remarkValues, setRemarkValues] = useState<Record<string, string>>({});
    const [selectedRowKeys, setSelectedRowKeys] = useState<Record<string, boolean>>({});

    // Pagination
    const [currentPage, setCurrentPage] = useState(1);
    const [pageSize, setPageSize] = useState(10);

    useEffect(() => {
        sessionStorage.setItem('rmrec_termYear', termYear);
        sessionStorage.setItem('rmrec_termSemester', termSemester);
    }, [termYear, termSemester]);

    useEffect(() => {
        if (sessionStorage.getItem('rmrec_termYear') === null && calendarAcademicYear) {
            setTermYear(calendarAcademicYear);
        }
    }, [calendarAcademicYear]);

    const academicYearOptions = useMemo(() => {
        const base = calendarAcademicYear ? Number(calendarAcademicYear) : (new Date().getFullYear() + 543);
        const list = [base + 1, base, base - 1, base - 2, 2569, 2568, 2567];
        return Array.from(new Set(list.map(String))).sort((a, b) => b.localeCompare(a));
    }, [calendarAcademicYear]);

    const loadData = useCallback(async () => {
        if (!schoolId) return;
        setLoading(true);
        try {
            const [flagRows, requestSnap] = await Promise.all([
                fetchFlaggedStudents(schoolId, teacherMap, {
                    classLevelFilter: 'all',
                    academicYear: (termYear && termYear !== 'ทั้งหมด') ? termYear : undefined,
                    semester: (termSemester && termSemester !== 'ทั้งหมด') ? termSemester : undefined,
                }),
                getDocs(collection(db, 'school-settings', schoolId, 'remediation_requests')),
            ]);

            const requestMap: Record<string, { id: string; status: string; newResult?: string }> = {};
            requestSnap.docs.forEach(d => {
                const data: any = d.data();
                if (data.status === 'cancelled') return;
                const idValue = data.flagType === 'course' ? data.courseId : data.activityId;
                const key = requestDedupKey(data.studentId, idValue, data.academicYear, data.semester);
                if (!requestMap[key] || data.status === 'resolved') {
                    requestMap[key] = { id: d.id, status: data.status, newResult: data.newResult };
                }
            });

            const merged: FlagRowWithStudent[] = [];
            flagRows.forEach(sr => {
                sr.flags.forEach((flag, idx) => {
                    if (!isAcademicManagement && !flag.responsibleTeacherIds?.includes(currentUser?.uid || '')) return;

                    const idForKey = flag.flagKind === 'course' ? flag.courseId : flag.activityDocId;
                    if (!idForKey) return;
                    const key = requestDedupKey(sr.id, idForKey, flag.academicYear, flag.semester);
                    const req = requestMap[key];
                    const requestStatus = req ? (req.status as 'pending' | 'resolved') : 'no_request';

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
            console.error('Error loading remediation records:', err);
            Swal.fire('ผิดพลาด', 'ไม่สามารถโหลดข้อมูลได้', 'error');
        } finally {
            setLoading(false);
        }
    }, [schoolId, teacherMap, isAcademicManagement, currentUser?.uid, termYear, termSemester]);

    useEffect(() => {
        loadData();
    }, [loadData]);

    const handleSearchClick = () => {
        setActiveCourseSearch(searchCourse);
        setCurrentPage(1);
    };

    const handleCourseKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
        if (e.key === 'Enter') {
            handleSearchClick();
        }
    };

    const filteredRows = useMemo(() => {
        const studentKw = searchStudent.trim().toLowerCase();
        const courseKw = (searchCourse || activeCourseSearch).trim().toLowerCase();

        return rows.filter(r => {
            // ปีการศึกษา
            if (termYear && termYear !== 'ทั้งหมด' && r.flag.academicYear && r.flag.academicYear !== termYear) return false;

            // ภาคเรียน
            if (termSemester && termSemester !== 'ทั้งหมด' && r.flag.semester && r.flag.semester !== termSemester) return false;

            // ระดับชั้น
            if (filterClassLevel && filterClassLevel !== 'all' && filterClassLevel !== 'ทั้งหมด') {
                if (!matchesClassLevel(r.classLevel, filterClassLevel)) return false;
            }

            // กลุ่มสาระวิชา
            if (filterSubjectGroup && filterSubjectGroup !== 'ทั้งหมด') {
                if (filterSubjectGroup === 'กิจกรรมพัฒนาผู้เรียน') {
                    const isAct = r.flag.flagKind !== 'course' ||
                        isActivityCourseCode(r.flag.courseCode) ||
                        (r.flag.subjectGroup && r.flag.subjectGroup.includes('กิจกรรม'));
                    if (!isAct) return false;
                } else {
                    const matchGroup = (r.flag.subjectGroup || '').includes(filterSubjectGroup);
                    const matchTitle = (r.flag.courseTitle || '').includes(filterSubjectGroup);
                    if (!matchGroup && !matchTitle) return false;
                }
            }

            // รหัส ชื่อ นักเรียน
            if (studentKw) {
                const matchCode = (r.studentCode || '').toLowerCase().includes(studentKw);
                const matchName = (r.studentName || '').toLowerCase().includes(studentKw);
                if (!matchCode && !matchName) return false;
            }

            // รหัสวิชา / ชื่อวิชา
            if (courseKw) {
                const matchCourseCode = (r.flag.courseCode || '').toLowerCase().includes(courseKw);
                const matchCourseTitle = (r.flag.courseTitle || '').toLowerCase().includes(courseKw);
                if (!matchCourseCode && !matchCourseTitle) return false;
            }

            return true;
        });
    }, [rows, termYear, termSemester, filterClassLevel, filterSubjectGroup, searchStudent, activeCourseSearch, searchCourse]);

    useEffect(() => {
        setCurrentPage(1);
    }, [termYear, termSemester, filterClassLevel, filterSubjectGroup, searchStudent, activeCourseSearch, pageSize]);

    const totalPages = Math.max(1, Math.ceil(filteredRows.length / pageSize));
    const pagedRows = useMemo(
        () => filteredRows.slice((currentPage - 1) * pageSize, currentPage * pageSize),
        [filteredRows, currentPage, pageSize]
    );

    // Row selection and inline editing handlers
    const isAllSelected = pagedRows.length > 0 && pagedRows.every(r => selectedRowKeys[r.key]);

    const toggleSelectAll = () => {
        if (isAllSelected) {
            setSelectedRowKeys(prev => {
                const next = { ...prev };
                pagedRows.forEach(r => delete next[r.key]);
                return next;
            });
        } else {
            setSelectedRowKeys(prev => {
                const next = { ...prev };
                pagedRows.forEach(r => { next[r.key] = true; });
                return next;
            });
        }
    };

    const toggleSelectRow = (key: string) => {
        setSelectedRowKeys(prev => ({ ...prev, [key]: !prev[key] }));
    };

    const handleRemedChange = (rowKey: string, val: string) => {
        setRemedValues(prev => ({ ...prev, [rowKey]: val }));
        setSelectedRowKeys(prev => ({ ...prev, [rowKey]: true }));
    };

    const handleRepeatChange = (rowKey: string, val: string) => {
        setRepeatValues(prev => ({ ...prev, [rowKey]: val }));
        setSelectedRowKeys(prev => ({ ...prev, [rowKey]: true }));
    };

    const handleRemarkChange = (rowKey: string, val: string) => {
        setRemarkValues(prev => ({ ...prev, [rowKey]: val }));
        setSelectedRowKeys(prev => ({ ...prev, [rowKey]: true }));
    };

    const handleClearRow = (key: string) => {
        setRemedValues(prev => { const n = { ...prev }; delete n[key]; return n; });
        setRepeatValues(prev => { const n = { ...prev }; delete n[key]; return n; });
        setRemarkValues(prev => { const n = { ...prev }; delete n[key]; return n; });
        setSelectedRowKeys(prev => { const n = { ...prev }; delete n[key]; return n; });
    };

    const handleResetEdits = () => {
        setRemedValues({});
        setRepeatValues({});
        setRemarkValues({});
        setSelectedRowKeys({});
    };

    // Save batch function (Floppy disk button)
    const handleSaveAll = async () => {
        const rowsToSave = filteredRows.filter(r =>
            (remedValues[r.key] !== undefined && remedValues[r.key] !== '') ||
            (repeatValues[r.key] !== undefined && repeatValues[r.key] !== '') ||
            (remarkValues[r.key] !== undefined && remarkValues[r.key] !== (r.flag.remark || '')) ||
            (selectedRowKeys[r.key] && (remedValues[r.key] || repeatValues[r.key] || remarkValues[r.key]))
        );

        if (rowsToSave.length === 0) {
            Swal.fire({
                icon: 'info',
                title: 'ไม่มีข้อมูลที่ต้องบันทึก',
                text: 'กรุณากรอกข้อมูลในช่อง แก้ตัว, เรียนซ้ำ หรือ Remark ก่อนกดบันทึก',
                timer: 2000,
                showConfirmButton: false,
            });
            return;
        }

        const confirm = await Swal.fire({
            icon: 'question',
            title: 'ยืนยันการบันทึกผลการเรียน',
            text: `ต้องการบันทึกข้อมูลผลการเรียนที่แก้ไขจำนวน ${rowsToSave.length} รายการ หรือไม่?`,
            showCancelButton: true,
            confirmButtonText: 'บันทึก',
            cancelButtonText: 'ยกเลิก',
            confirmButtonColor: '#17a2b8',
        });

        if (!confirm.isConfirmed) return;

        setSaving(true);
        try {
            for (const row of rowsToSave) {
                const isCourse = row.flag.flagKind === 'course';
                const remedVal = remedValues[row.key]?.trim();
                const repeatVal = repeatValues[row.key]?.trim();
                const remarkVal = remarkValues[row.key]?.trim();

                if (isCourse) {
                    const updateData: Record<string, any> = {};
                    let displayVal = '';

                    if (remedVal) {
                        updateData.grade = remedVal;
                        updateData.status = deleteField();
                        updateData.originalGrade = row.flag.grade;
                        if (remarkVal) {
                            updateData.remark = remarkVal;
                        } else {
                            updateData.remark = deleteField();
                        }
                        displayVal = remedVal;
                    } else if (repeatVal) {
                        displayVal = 'เรียนซ้ำ';
                        if (remarkVal) updateData.remark = remarkVal;
                    } else if (remarkVal !== undefined) {
                        if (remarkVal) {
                            updateData.remark = remarkVal;
                        } else {
                            updateData.remark = deleteField();
                        }
                    }

                    if (Object.keys(updateData).length > 0) {
                        await setDoc(
                            doc(db, 'school-settings', schoolId, 'courses', row.flag.courseId, 'grades', row.studentId),
                            updateData,
                            { merge: true }
                        );
                    }

                    if (displayVal) {
                        if (row.requestId) {
                            await updateDoc(doc(db, 'school-settings', schoolId, 'remediation_requests', row.requestId), {
                                status: 'resolved',
                                resolvedAt: serverTimestamp(),
                                resolvedBy: currentUser?.uid || '',
                                resolvedByName: (currentUser as any)?.fullName || '',
                                newResult: displayVal,
                            });
                        } else {
                            await addDoc(collection(db, 'school-settings', schoolId, 'remediation_requests'), {
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
                                requestNote: 'บันทึกโดยฝ่ายวิชาการผ่านระบบบันทึกแก้ไขผลการเรียน',
                                resolvedAt: serverTimestamp(),
                                resolvedBy: currentUser?.uid || '',
                                resolvedByName: (currentUser as any)?.fullName || '',
                                courseId: row.flag.courseId,
                                courseCode: row.flag.courseCode,
                                courseTitle: row.flag.courseTitle,
                                newResult: displayVal,
                            });
                        }
                    }
                } else {
                    // กิจกรรมพัฒนาผู้เรียน (guidance, clubs, learner activities)
                    let newStatus: 'passed' | 'failed' | undefined;
                    let displayVal = '';

                    if (remedVal) {
                        newStatus = (remedVal === 'ผ' || remedVal === 'passed') ? 'passed' : 'failed';
                        displayVal = remedVal;
                    } else if (repeatVal) {
                        newStatus = 'failed';
                        displayVal = 'ไม่ผ่าน (เรียนซ้ำ)';
                    }

                    const evalRef = row.flag.activityCollectionName === 'guidance-evaluations'
                        ? doc(db, 'school-settings', schoolId, 'guidance-evaluations', row.flag.evalDocId!)
                        : doc(db, 'school-settings', schoolId, row.flag.activityCollectionName!, row.flag.activityDocId!, 'evaluations', row.flag.evalDocId!);

                    const evalSnap = await getDoc(evalRef);
                    const data: any = evalSnap.exists() ? evalSnap.data() : {};
                    const results: Record<string, any> = { ...(data.results || {}) };
                    const currentStudentRes = results[row.studentId] || {};

                    if (newStatus) {
                        currentStudentRes.status = newStatus;
                        currentStudentRes.result = remedVal || (newStatus === 'passed' ? 'ผ' : 'มผ');
                    }
                    if (remarkVal !== undefined) {
                        currentStudentRes.remark = remarkVal;
                    }
                    results[row.studentId] = currentStudentRes;

                    const summary = Object.values(results).reduce((acc: any, r: any) => {
                        const s = r?.status || 'pending';
                        acc[s] = (acc[s] || 0) + 1;
                        return acc;
                    }, { pending: 0, passed: 0, failed: 0 });

                    await setDoc(evalRef, {
                        results,
                        summary,
                        updatedAt: serverTimestamp(),
                        updatedBy: currentUser?.uid || '',
                    }, { merge: true });

                    if (displayVal) {
                        if (row.requestId) {
                            await updateDoc(doc(db, 'school-settings', schoolId, 'remediation_requests', row.requestId), {
                                status: 'resolved',
                                resolvedAt: serverTimestamp(),
                                resolvedBy: currentUser?.uid || '',
                                resolvedByName: (currentUser as any)?.fullName || '',
                                newResult: displayVal,
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
                                requestNote: 'บันทึกโดยฝ่ายวิชาการผ่านระบบบันทึกแก้ไขผลการเรียน',
                                resolvedAt: serverTimestamp(),
                                resolvedBy: currentUser?.uid || '',
                                resolvedByName: (currentUser as any)?.fullName || '',
                                activityId: row.flag.activityDocId,
                                activityName: row.flag.courseTitle || row.flag.courseCode,
                                evalDocId: row.flag.evalDocId,
                                newResult: displayVal,
                            };
                            if (row.flag.teacherScopeKey) payload.teacherScopeKey = row.flag.teacherScopeKey;
                            await addDoc(collection(db, 'school-settings', schoolId, 'remediation_requests'), payload);
                        }
                    }
                }
            }

            Swal.fire({
                icon: 'success',
                title: 'บันทึกข้อมูลเรียบร้อยแล้ว',
                timer: 1500,
                showConfirmButton: false,
            });

            setRemedValues({});
            setRepeatValues({});
            setRemarkValues({});
            setSelectedRowKeys({});
            await loadData();
        } catch (err) {
            console.error('Error saving remediation batch:', err);
            Swal.fire('ผิดพลาด', 'ไม่สามารถบันทึกข้อมูลได้', 'error');
        } finally {
            setSaving(false);
        }
    };

    return (
        <MainLayout>
            <div className={`text-gray-900 dark:text-white transition-colors duration-300 min-h-screen ${isPwaMode ? 'px-2 py-3 pb-6' : 'p-4 sm:p-6 space-y-4'}`}>
                <div className="max-w-7xl mx-auto space-y-4">

                    {/* Back button */}
                    <div className="flex items-center gap-2">
                        <BackButton to="/academic/hub/zero-r-ms" />
                        <span className="text-xs font-bold text-gray-500">กลับไปยังรายงาน 0 ร มส</span>
                    </div>

                    {/* Main SGS-Style Top Panel: "บันทึก แก้ไข ผลการเรียน" */}
                    <div className="border border-[#17a2b8]/60 rounded-md overflow-hidden bg-white dark:bg-[#1a1c22] shadow-sm">
                        {/* Gradient Header */}
                        <div className="bg-gradient-to-r from-[#17a2b8] via-[#20b2aa] to-[#138496] px-3 py-1.5 flex items-center justify-between">
                            <h2 className="text-white font-bold text-sm tracking-wide">
                                บันทึก แก้ไข ผลการเรียน
                            </h2>
                        </div>

                        {/* Filter Form Body */}
                        <div className="p-3 sm:p-4 text-xs font-medium space-y-2.5">
                            {/* Row 1: Search Student */}
                            <div className="flex flex-col sm:flex-row sm:items-center gap-1.5 sm:gap-3">
                                <label className="w-20 sm:text-right font-bold text-gray-700 dark:text-gray-300 shrink-0">
                                    ค้นหาจาก
                                </label>
                                <div className="flex-1 max-w-sm">
                                    <input
                                        type="text"
                                        placeholder="รหัส ชื่อ นักเรียน"
                                        value={searchStudent}
                                        onChange={(e) => setSearchStudent(e.target.value)}
                                        className="w-full h-7 px-2 border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-[#121316] text-xs font-medium focus:ring-1 focus:ring-teal-500 outline-none"
                                    />
                                </div>
                            </div>

                            {/* Row 2: Search Course + Button */}
                            <div className="flex flex-col sm:flex-row sm:items-center gap-1.5 sm:gap-3">
                                <label className="w-20 sm:text-right font-bold text-gray-700 dark:text-gray-300 shrink-0">
                                    ค้นหาจาก
                                </label>
                                <div className="flex items-center gap-2 flex-1 max-w-md">
                                    <input
                                        type="text"
                                        placeholder="รหัสวิชา"
                                        value={searchCourse}
                                        onChange={(e) => {
                                            setSearchCourse(e.target.value);
                                            setActiveCourseSearch(e.target.value);
                                        }}
                                        onKeyDown={handleCourseKeyDown}
                                        className="flex-1 max-w-sm h-7 px-2 border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-[#121316] text-xs font-medium focus:ring-1 focus:ring-teal-500 outline-none"
                                    />
                                    <button
                                        type="button"
                                        onClick={handleSearchClick}
                                        className="h-7 px-3 bg-[#5dbcb6] hover:bg-[#4aa8a1] text-white rounded font-bold text-xs flex items-center gap-1 shadow-sm transition shrink-0"
                                    >
                                        <span>&gt;</span> ไป
                                    </button>
                                </div>
                            </div>

                            {/* Row 3: Academic Year & Semester */}
                            <div className="flex flex-col sm:flex-row sm:items-center gap-1.5 sm:gap-3">
                                <label className="w-20 sm:text-right font-bold text-gray-700 dark:text-gray-300 shrink-0">
                                    ปีการศึกษา
                                </label>
                                <div className="flex items-center gap-3">
                                    <select
                                        value={termYear}
                                        onChange={(e) => setTermYear(e.target.value)}
                                        className="h-7 px-2 border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-[#121316] text-xs font-medium focus:ring-1 focus:ring-teal-500 outline-none min-w-[90px]"
                                    >
                                        <option value="ทั้งหมด">ทั้งหมด</option>
                                        {academicYearOptions.map(yr => (
                                            <option key={yr} value={yr}>{yr}</option>
                                        ))}
                                    </select>

                                    <span className="font-bold text-gray-700 dark:text-gray-300">ภาคเรียน</span>
                                    <select
                                        value={termSemester}
                                        onChange={(e) => setTermSemester(e.target.value)}
                                        className="h-7 px-2 border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-[#121316] text-xs font-medium focus:ring-1 focus:ring-teal-500 outline-none min-w-[70px]"
                                    >
                                        <option value="ทั้งหมด">ทั้งหมด</option>
                                        <option value="1">1</option>
                                        <option value="2">2</option>
                                    </select>
                                </div>
                            </div>

                            {/* Row 4: Subject Group */}
                            <div className="flex flex-col sm:flex-row sm:items-center gap-1.5 sm:gap-3">
                                <label className="w-20 sm:text-right font-bold text-gray-700 dark:text-gray-300 shrink-0">
                                    กลุ่มสาระวิชา
                                </label>
                                <div className="flex-1 max-w-xs">
                                    <select
                                        value={filterSubjectGroup}
                                        onChange={(e) => setFilterSubjectGroup(e.target.value)}
                                        className="w-full h-7 px-2 border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-[#121316] text-xs font-medium focus:ring-1 focus:ring-teal-500 outline-none"
                                    >
                                        {SUBJECT_GROUPS.map(grp => (
                                            <option key={grp} value={grp}>{grp}</option>
                                        ))}
                                    </select>
                                </div>
                            </div>

                            {/* Row 5: Class Level + Transfer student note */}
                            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                                <div className="flex items-center gap-3">
                                    <label className="w-20 sm:text-right font-bold text-gray-700 dark:text-gray-300 shrink-0">
                                        ระดับชั้น
                                    </label>
                                    <select
                                        value={filterClassLevel}
                                        onChange={(e) => setFilterClassLevel(e.target.value)}
                                        className="h-7 px-2 border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-[#121316] text-xs font-medium focus:ring-1 focus:ring-teal-500 outline-none min-w-[90px]"
                                    >
                                        {CLASS_LEVELS.map(cl => (
                                            <option key={cl.value} value={cl.value}>{cl.label}</option>
                                        ))}
                                    </select>
                                </div>

                                {/* Red SGS Transfer Student Notice */}
                                <div className="text-right text-rose-600 font-bold text-xs sm:text-[13px] pt-1 sm:pt-0">
                                    บันทึกผลการเรียน นักเรียนโอนย้าย ให้กรอกเกรด ในช่องRemark
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Action Toolbar (Above Table) */}
                    <div className="bg-[#d2efec] dark:bg-[#1a2f2e] border border-[#a4ded9] dark:border-teal-900/50 rounded-md px-3 py-1.5 flex flex-wrap items-center justify-between gap-2 shadow-sm">
                        {/* Left Action Buttons */}
                        <div className="flex items-center gap-2">
                            <button
                                type="button"
                                onClick={handleResetEdits}
                                title="ล้างการแก้ไขที่ยังไม่ได้บันทึก"
                                className="w-7 h-7 flex items-center justify-center rounded hover:bg-white/60 dark:hover:bg-black/20 text-rose-600 transition shadow-xs"
                            >
                                <FaTimes size={15} />
                            </button>

                            <button
                                type="button"
                                onClick={handleSaveAll}
                                disabled={saving}
                                title="บันทึกผลการเรียน (บันทึกแถวที่มีการแก้ไข)"
                                className="w-7 h-7 flex items-center justify-center rounded hover:bg-white/60 dark:hover:bg-black/20 text-blue-700 dark:text-blue-400 transition shadow-xs disabled:opacity-50"
                            >
                                {saving ? <RefreshCw size={14} className="animate-spin" /> : <FaSave size={15} />}
                            </button>

                            <button
                                type="button"
                                onClick={() => window.print()}
                                title="พิมพ์"
                                className="w-7 h-7 flex items-center justify-center rounded hover:bg-white/60 dark:hover:bg-black/20 text-teal-800 dark:text-teal-300 transition shadow-xs"
                            >
                                <FaPrint size={14} />
                            </button>

                            <button
                                type="button"
                                onClick={loadData}
                                disabled={loading}
                                title="รีเฟรชข้อมูล"
                                className="w-7 h-7 flex items-center justify-center rounded hover:bg-white/60 dark:hover:bg-black/20 text-teal-700 dark:text-teal-400 transition shadow-xs"
                            >
                                <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
                            </button>
                        </div>

                        {/* Right Pagination Controls (matching pill/capsule style in screenshot) */}
                        <div className="flex items-center gap-1.5 bg-[#64bdb7] text-white px-2.5 py-1 rounded-md text-xs font-bold shadow-xs">
                            <button
                                type="button"
                                onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                                disabled={currentPage <= 1}
                                className="hover:text-gray-200 disabled:opacity-40 px-0.5"
                                title="ก่อนหน้า"
                            >
                                ◀
                            </button>

                            <input
                                type="number"
                                min={1}
                                max={totalPages}
                                value={currentPage}
                                onChange={(e) => {
                                    const p = Number(e.target.value);
                                    if (p >= 1 && p <= totalPages) setCurrentPage(p);
                                }}
                                className="w-9 h-5 text-center text-xs font-bold rounded bg-white text-gray-800 border-none outline-none"
                            />

                            <span className="whitespace-nowrap">ของ {totalPages}</span>

                            <button
                                type="button"
                                onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                                disabled={currentPage >= totalPages}
                                className="hover:text-gray-200 disabled:opacity-40 px-0.5"
                                title="ถัดไป"
                            >
                                ▶
                            </button>

                            <select
                                value={pageSize}
                                onChange={(e) => setPageSize(Number(e.target.value))}
                                className="h-5 px-1 text-xs font-bold rounded bg-white text-gray-800 border-none outline-none ml-1"
                            >
                                <option value={10}>10</option>
                                <option value={20}>20</option>
                                <option value={50}>50</option>
                                <option value={100}>100</option>
                            </select>

                            <span className="whitespace-nowrap">/ หน้า</span>
                        </div>
                    </div>

                    {/* Table Container */}
                    <div className="border border-gray-300 dark:border-gray-700 rounded-md overflow-x-auto bg-white dark:bg-[#1a1c22] shadow-sm">
                        {loading ? (
                            <div className="flex flex-col items-center justify-center py-20 text-gray-400 gap-2">
                                <RefreshCw size={24} className="animate-spin text-teal-600" />
                                <span className="text-xs font-bold">กำลังโหลดข้อมูล...</span>
                            </div>
                        ) : filteredRows.length === 0 ? (
                            <div className="flex flex-col items-center justify-center py-20 text-gray-400 gap-2">
                                <CheckCircle2 size={36} className="text-emerald-500" />
                                <span className="text-sm font-bold">ไม่พบข้อมูลผลการเรียนที่ต้องแก้ไขตามเงื่อนไขที่เลือก</span>
                            </div>
                        ) : (
                            <table className="w-full border-collapse text-xs text-left">
                                <thead>
                                    <tr className="bg-[#dcf1ef] dark:bg-[#1c3332] text-gray-700 dark:text-gray-200 border-b border-gray-300 dark:border-gray-700 select-none">
                                        <th className="p-2 text-center w-12 border-r border-gray-300 dark:border-gray-700">
                                            <input
                                                type="checkbox"
                                                checked={isAllSelected}
                                                onChange={toggleSelectAll}
                                                className="rounded border-gray-300 text-teal-600 focus:ring-teal-500 cursor-pointer"
                                            />
                                        </th>
                                        <th className="p-2 text-center border-r border-gray-300 dark:border-gray-700 font-bold whitespace-nowrap">ปีการศึกษา</th>
                                        <th className="p-2 text-center border-r border-gray-300 dark:border-gray-700 font-bold whitespace-nowrap">ภาคเรียน</th>
                                        <th className="p-2 text-center border-r border-gray-300 dark:border-gray-700 font-bold whitespace-nowrap">ระดับชั้น</th>
                                        <th className="p-2 border-r border-gray-300 dark:border-gray-700 font-bold whitespace-nowrap">วิชา</th>
                                        <th className="p-2 text-center border-r border-gray-300 dark:border-gray-700 font-bold whitespace-nowrap">นก.</th>
                                        <th className="p-2 text-center border-r border-gray-300 dark:border-gray-700 font-bold whitespace-nowrap">เลขประจำตัว</th>
                                        <th className="p-2 border-r border-gray-300 dark:border-gray-700 font-bold whitespace-nowrap">ชื่อ-นามสกุล</th>
                                        <th className="p-2 text-center border-r border-gray-300 dark:border-gray-700 font-bold whitespace-nowrap">ปกติ</th>
                                        <th className="p-2 text-center border-r border-gray-300 dark:border-gray-700 font-bold whitespace-nowrap">Grade</th>
                                        <th className="p-2 text-center border-r border-gray-300 dark:border-gray-700 font-bold whitespace-nowrap">แก้ตัว</th>
                                        <th className="p-2 text-center border-r border-gray-300 dark:border-gray-700 font-bold whitespace-nowrap">เรียนซ้ำ</th>
                                        <th className="p-2 text-center font-bold whitespace-nowrap">Remark</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-200 dark:divide-gray-800 text-gray-800 dark:text-gray-200">
                                    {pagedRows.map(row => {
                                        const isChecked = !!selectedRowKeys[row.key];
                                        const currentRemed = remedValues[row.key] ?? '';
                                        const currentRepeat = repeatValues[row.key] ?? '';
                                        const currentRemark = remarkValues[row.key] ?? (row.flag.remark || '');

                                        return (
                                            <tr
                                                key={row.key}
                                                className={`hover:bg-[#f3faf9] dark:hover:bg-white/[0.02] transition ${isChecked ? 'bg-[#f0f9f8] dark:bg-teal-950/20' : ''}`}
                                            >
                                                {/* Checkbox with Red X indicator */}
                                                <td className="p-2 text-center border-r border-gray-200 dark:border-gray-800 whitespace-nowrap">
                                                    <div className="flex items-center justify-center gap-1">
                                                        <span
                                                            onClick={() => handleClearRow(row.key)}
                                                            title="ล้างค่าที่กรอกในแถวนี้"
                                                            className="text-rose-500 font-black text-xs cursor-pointer select-none hover:scale-125 transition"
                                                        >
                                                            ✕
                                                        </span>
                                                        <input
                                                            type="checkbox"
                                                            checked={isChecked}
                                                            onChange={() => toggleSelectRow(row.key)}
                                                            className="rounded border-gray-300 text-teal-600 focus:ring-teal-500 cursor-pointer"
                                                        />
                                                    </div>
                                                </td>

                                                {/* Academic Year */}
                                                <td className="p-2 text-center border-r border-gray-200 dark:border-gray-800 font-medium whitespace-nowrap">
                                                    {row.flag.academicYear || termYear || '-'}
                                                </td>

                                                {/* Semester */}
                                                <td className="p-2 text-center border-r border-gray-200 dark:border-gray-800 font-medium whitespace-nowrap">
                                                    {row.flag.semester || termSemester || '-'}
                                                </td>

                                                {/* Class Level */}
                                                <td className="p-2 text-center border-r border-gray-200 dark:border-gray-800 font-medium whitespace-nowrap">
                                                    {row.classLevel || '-'}
                                                </td>

                                                {/* Course Code & Title */}
                                                <td className="p-2 border-r border-gray-200 dark:border-gray-800 font-medium max-w-[200px] truncate" title={`${row.flag.courseCode} ${row.flag.courseTitle}`}>
                                                    {row.flag.courseCode} {row.flag.courseTitle}
                                                </td>

                                                {/* Credits (นก.) */}
                                                <td className="p-2 text-center border-r border-gray-200 dark:border-gray-800 font-medium whitespace-nowrap">
                                                    {row.flag.credits !== undefined && row.flag.credits !== null
                                                        ? Number(row.flag.credits).toFixed(1)
                                                        : '-'}
                                                </td>

                                                {/* Student Code */}
                                                <td className="p-2 text-center border-r border-gray-200 dark:border-gray-800 font-bold whitespace-nowrap">
                                                    {row.studentCode || '-'}
                                                </td>

                                                {/* Student Name */}
                                                <td className="p-2 border-r border-gray-200 dark:border-gray-800 font-medium max-w-[150px] truncate" title={row.studentName}>
                                                    {row.studentName}
                                                </td>

                                                {/* ปกติ (Original Flag Grade) */}
                                                <td className="p-2 text-center border-r border-gray-200 dark:border-gray-800 font-bold text-rose-600 whitespace-nowrap">
                                                    {row.flag.grade}
                                                </td>

                                                {/* Grade (Current Evaluated or Remediated Grade) */}
                                                <td className="p-2 text-center border-r border-gray-200 dark:border-gray-800 font-bold text-emerald-600 dark:text-emerald-400 whitespace-nowrap">
                                                    {row.requestStatus === 'resolved'
                                                        ? (currentRemed || 'ผ')
                                                        : (currentRemed || row.flag.grade)}
                                                </td>

                                                {/* แก้ตัว (Editable Input) */}
                                                <td className="p-1.5 text-center border-r border-gray-200 dark:border-gray-800 whitespace-nowrap">
                                                    <input
                                                        type="text"
                                                        value={currentRemed}
                                                        onChange={(e) => handleRemedChange(row.key, e.target.value)}
                                                        className="w-12 h-6 text-center text-xs font-bold border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-[#121316] text-gray-900 dark:text-white focus:border-teal-500 focus:ring-1 focus:ring-teal-500 outline-none transition"
                                                    />
                                                </td>

                                                {/* เรียนซ้ำ (Editable Input) */}
                                                <td className="p-1.5 text-center border-r border-gray-200 dark:border-gray-800 whitespace-nowrap">
                                                    <input
                                                        type="text"
                                                        value={currentRepeat}
                                                        onChange={(e) => handleRepeatChange(row.key, e.target.value)}
                                                        className="w-12 h-6 text-center text-xs font-bold border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-[#121316] text-gray-900 dark:text-white focus:border-teal-500 focus:ring-1 focus:ring-teal-500 outline-none transition"
                                                    />
                                                </td>

                                                {/* Remark (Editable Input) */}
                                                <td className="p-1.5 text-center whitespace-nowrap">
                                                    <input
                                                        type="text"
                                                        value={currentRemark}
                                                        onChange={(e) => handleRemarkChange(row.key, e.target.value)}
                                                        className="w-24 h-6 px-1.5 text-xs border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-[#121316] text-gray-900 dark:text-white focus:border-teal-500 focus:ring-1 focus:ring-teal-500 outline-none transition"
                                                    />
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        )}
                    </div>

                    {/* Footer / Summary Information */}
                    {!loading && filteredRows.length > 0 && (
                        <div className="flex items-center justify-between text-xs text-gray-500 dark:text-gray-400 px-1 font-medium">
                            <div>
                                แสดงรายการที่ {((currentPage - 1) * pageSize) + 1} ถึง {Math.min(currentPage * pageSize, filteredRows.length)} จากทั้งหมด {filteredRows.length} รายการ
                            </div>
                            {Object.keys(selectedRowKeys).length > 0 && (
                                <div className="text-teal-600 dark:text-teal-400 font-bold">
                                    เลือกอยู่ {Object.values(selectedRowKeys).filter(Boolean).length} รายการ
                                </div>
                            )}
                        </div>
                    )}
                </div>
            </div>
        </MainLayout>
    );
};

export default RemediationRecordPage;
