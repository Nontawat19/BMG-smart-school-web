import React, { useEffect, useState } from 'react';
import { useSelector } from 'react-redux';
import { RootState } from '@/store';
import MainLayout from '@/layouts/MainLayout';
import BackButton from '@/components/Shared/BackButton';
import { firestore as db } from '@/firebase';
import { collection, doc, getDoc, getDocs, query, where, writeBatch, Timestamp } from 'firebase/firestore';
import Swal from 'sweetalert2';
import { AlertTriangle, PlayCircle, CheckCircle2, Loader2 } from 'lucide-react';
import { isStudyingStudent } from '@/utils/studentStatusUtils';
import {
    isPrimaryClassValue,
    computeCourseAttendanceEligibilityForRoster,
} from '@/utils/attendanceEligibilityFirestore';
import type { AttendanceEligibilityResult } from '@/utils/attendanceEligibility';

interface RosterStudent {
    id: string;
    enrolledAt?: string;
    name: string;
    studentNumber: string;
}

interface RecoveredStudent {
    id: string;
    name: string;
    studentNumber: string;
    percentage: number;
}

interface CourseGroupResult {
    courseId: string;
    courseTitle: string;
    classDisplay: string;
    room: string;
    roster: RosterStudent[];
    eligibility: Record<string, AttendanceEligibilityResult>;
    flaggedIds: string[];
    alreadyFlaggedCount: number;
    // เวลาเรียนกลับมาครบ 80% แล้ว แต่ยังติด มส. ค้างอยู่จากการติดครั้งก่อน — เครื่องมือนี้ไม่เขียนแก้ให้
    // อัตโนมัติโดยตั้งใจ (ต่างกับการ "จะติด มส" ด้านบนซึ่งเขียนทับได้เพราะไม่กระทบคะแนนที่ครูให้ไว้) เพราะการ
    // ถอน มส. ต้องคืนเป็นเกรดจริงจากคะแนนของนักเรียนคนนั้น ซึ่งควรให้ครูประจำวิชาเป็นคนตรวจสอบและกดบันทึก
    // เองที่หน้า ปพ.5 ของวิชานั้น (ระบบจะถอน มส. ให้อัตโนมัติทันทีที่ครูกดบันทึกที่หน้านั้น) ทีละคนแทน
    recoveredStudents: RecoveredStudent[];
}

// A "course" doc's own `semester` field decides its grading scope — undefined/'1-2'/'annual'/'0'
// means the whole year, otherwise it's a single-semester ('1' or '2') course. Mirrors the same
// helper already duplicated in ScoreConfigurationPage.tsx.
const isAnnualCourseSemester = (semester?: string) =>
    !semester || semester === '1-2' || semester === 'annual' || semester === '0' || semester === 'ปีการศึกษา';

const chunkArray = <T,>(arr: T[], size: number): T[][] => {
    const out: T[][] = [];
    for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
    return out;
};

const AttendanceMsBackfillPage: React.FC = () => {
    const currentUser = useSelector((state: RootState) => state.auth.user);
    const schoolId = (currentUser as any)?.schoolId;
    const calendarState = useSelector((state: RootState) => state.calendar);

    const [academicYear, setAcademicYear] = useState<string>('');
    const [calendarEvents, setCalendarEvents] = useState<Record<string, any>>({});
    const [phase, setPhase] = useState<'idle' | 'scanning' | 'reviewed' | 'applying' | 'applied'>('idle');
    const [progressLabel, setProgressLabel] = useState('');
    const [results, setResults] = useState<CourseGroupResult[]>([]);
    const [scanError, setScanError] = useState('');

    useEffect(() => {
        if (calendarState.academicYear && !academicYear) {
            setAcademicYear(calendarState.academicYear);
        }
    }, [calendarState.academicYear, academicYear]);

    useEffect(() => {
        if (!schoolId || !academicYear) return;
        (async () => {
            try {
                const yearDocSnap = await getDoc(doc(db, 'school-settings', schoolId, 'main_calendar', String(academicYear)));
                const defaultEvents = (calendarState.rawData?.events || {}) as Record<string, any>;
                const yearEvents = yearDocSnap.exists() ? ((yearDocSnap.data().events || {}) as Record<string, any>) : {};
                setCalendarEvents({ ...defaultEvents, ...yearEvents });
            } catch (err) {
                console.error('Error fetching calendar events for มส backfill:', err);
            }
        })();
    }, [schoolId, academicYear, calendarState.rawData]);

    const totalFlagged = results.reduce((sum, r) => sum + r.flaggedIds.length, 0);
    const totalRecovered = results.reduce((sum, r) => sum + r.recoveredStudents.length, 0);
    const recoveredGroups = results.filter(r => r.recoveredStudents.length > 0);

    const runScan = async () => {
        if (!schoolId || !academicYear) return;
        setPhase('scanning');
        setScanError('');
        setResults([]);

        try {
            const msCalendarData = { ...(calendarState.rawData || {}), events: calendarEvents };

            const coursesSnap = await getDocs(collection(db, 'school-settings', schoolId, 'courses'));
            const courses = coursesSnap.docs.map(d => ({ id: d.id, ...d.data() } as any));

            const collected: CourseGroupResult[] = [];

            for (let i = 0; i < courses.length; i++) {
                const course = courses[i];
                setProgressLabel(`กำลังตรวจสอบ ${i + 1}/${courses.length}: ${course.title || course.code || course.id}`);

                const enrollmentsSnap = await getDocs(query(
                    collection(db, 'school-settings', schoolId, 'enrollments'),
                    where('courseId', '==', course.id)
                ));
                if (enrollmentsSnap.empty) continue;

                // Group enrollments by (classLevel, room) — a course can be taught to several
                // rooms/groups on different weekly schedules, so each group needs its own
                // schedule-derived session count (same reasoning as GradeBookPage/ClassroomAttendance).
                const groups = new Map<string, { classLevel: string; room: string; studentIds: Set<string> }>();
                enrollmentsSnap.forEach(enrollDoc => {
                    const data = enrollDoc.data() as any;
                    const studentId = String(data.studentId || '');
                    if (!studentId) return;
                    const classLevel = String(data.classLevel || '');
                    const room = String(data.room || data.groupName || '');
                    const key = `${classLevel}__${room}`;
                    if (!groups.has(key)) groups.set(key, { classLevel, room, studentIds: new Set() });
                    groups.get(key)!.studentIds.add(studentId);
                });

                const semesterScope = (isAnnualCourseSemester(course.semester) || isPrimaryClassValue(course.classId))
                    ? 'annual'
                    : String(course.semester);

                for (const { classLevel, room, studentIds } of groups.values()) {
                    const ids = Array.from(studentIds);
                    if (ids.length === 0) continue;

                    const studentsRef = collection(db, 'school-settings', schoolId, 'students');
                    const roster: RosterStudent[] = [];
                    for (const idChunk of chunkArray(ids, 30)) {
                        const studentSnap = await getDocs(query(studentsRef, where('__name__', 'in', idChunk)));
                        studentSnap.forEach(snap => {
                            const data = snap.data() as any;
                            if (!isStudyingStudent(data)) return;
                            roster.push({
                                id: snap.id,
                                enrolledAt: typeof data.enrolledAt === 'string' ? data.enrolledAt : undefined,
                                name: `${data.title || data.prefix || ''}${data.firstName || ''} ${data.lastName || ''}`.trim(),
                                studentNumber: data.studentId || data.studentNumber || '',
                            });
                        });
                    }
                    if (roster.length === 0) continue;

                    const { eligibility } = await computeCourseAttendanceEligibilityForRoster(
                        db,
                        schoolId,
                        academicYear,
                        {
                            courseId: course.id,
                            classId: classLevel,
                            subjectCode: course.code,
                            courseCode: course.code,
                            teacherAssignments: course.teacherAssignments,
                            selectedRoomForMatch: room,
                        },
                        roster,
                        msCalendarData,
                        semesterScope
                    );

                    const flaggedIds = roster.filter(s => eligibility[s.id]?.belowThreshold).map(s => s.id);
                    const recoveredCandidates = roster.filter(s => !eligibility[s.id]?.belowThreshold);
                    if (flaggedIds.length === 0 && recoveredCandidates.length === 0) continue;

                    // Check which of the flagged students are already correctly marked มส with
                    // the same remark — same "skip unchanged" guard as the live attendance-save
                    // path, so a re-run of this scan doesn't keep reporting the same students.
                    const existingSnaps = await Promise.all(
                        flaggedIds.map(id => getDoc(doc(db, 'school-settings', schoolId, 'courses', course.id, 'grades', id)))
                    );
                    let alreadyFlaggedCount = 0;
                    existingSnaps.forEach((snap, idx) => {
                        const info = eligibility[flaggedIds[idx]];
                        const expectedRemark = `เวลาเรียนไม่ถึงร้อยละ 80 (${info.presentHours}/${info.totalHours} คาบ = ${info.percentage.toFixed(1)}%)`;
                        const existingData = snap.exists() ? snap.data() as any : null;
                        if (existingData?.status === 'มส' && existingData?.remark === expectedRemark) alreadyFlaggedCount++;
                    });

                    // เวลาเรียนไม่ต่ำกว่า 80% แล้วในการคำนวณสดตอนนี้ — เช็คว่าใครยังติด มส. ค้างจากการติด
                    // อัตโนมัติครั้งก่อน (ไม่แตะคนที่ครูตั้งใจกด มส. เองด้วยเหตุผลอื่น) เพื่อรายงานให้ครูประจำวิชา
                    // ไปกดบันทึกที่หน้า ปพ.5 เอง — ดูคอมเมนต์ที่ recoveredStudents ด้านบนว่าทำไมไม่เขียนแก้ที่นี่
                    const recoveredSnaps = recoveredCandidates.length > 0
                        ? await Promise.all(
                            recoveredCandidates.map(s => getDoc(doc(db, 'school-settings', schoolId, 'courses', course.id, 'grades', s.id)))
                        )
                        : [];
                    const recoveredStudents: RecoveredStudent[] = [];
                    recoveredSnaps.forEach((snap, idx) => {
                        const existingData = snap.exists() ? snap.data() as any : null;
                        const isStaleAutoMs = existingData?.status === 'มส' && typeof existingData?.remark === 'string' && existingData.remark.startsWith('เวลาเรียนไม่ถึงร้อยละ 80');
                        if (!isStaleAutoMs) return;
                        const s = recoveredCandidates[idx];
                        recoveredStudents.push({
                            id: s.id,
                            name: s.name,
                            studentNumber: s.studentNumber,
                            percentage: eligibility[s.id]?.percentage ?? 0,
                        });
                    });

                    if (flaggedIds.length === 0 && recoveredStudents.length === 0) continue;

                    collected.push({
                        courseId: course.id,
                        courseTitle: course.title || course.code || course.id,
                        classDisplay: classLevel || '-',
                        room: room || '-',
                        roster,
                        eligibility,
                        flaggedIds,
                        alreadyFlaggedCount,
                        recoveredStudents,
                    });
                }
            }

            setResults(collected);
            setPhase('reviewed');
            setProgressLabel('');
        } catch (err) {
            console.error('Error scanning for มส backfill:', err);
            setScanError('เกิดข้อผิดพลาดระหว่างตรวจสอบข้อมูล กรุณาลองใหม่อีกครั้ง');
            setPhase('idle');
        }
    };

    const applyBackfill = async () => {
        if (!schoolId || results.length === 0) return;

        const confirm = await Swal.fire({
            icon: 'warning',
            title: 'ยืนยันการบันทึก มส. ย้อนหลัง',
            html: `ระบบจะเขียนสถานะ/เกรด "มส" ทับข้อมูลเดิมของนักเรียนที่เวลาเรียนต่ำกว่าร้อยละ 80 ทั้งหมด <b>${totalFlagged}</b> รายการ (รวมทุกวิชา)<br/>การทับนี้จะเขียนทับเกรด/สถานะที่ครูเคยกรอกไว้เองสำหรับนักเรียนกลุ่มนี้ด้วย<br/><br/>ต้องการดำเนินการต่อหรือไม่?`,
            showCancelButton: true,
            confirmButtonText: 'ยืนยัน บันทึกจริง',
            cancelButtonText: 'ยกเลิก',
            confirmButtonColor: '#dc2626',
        });
        if (!confirm.isConfirmed) return;

        setPhase('applying');
        try {
            let writesQueued = 0;
            let batch = writeBatch(db);
            const commits: Promise<void>[] = [];
            const commitIfNeeded = async () => {
                if (writesQueued >= 400) {
                    const toCommit = batch;
                    commits.push(toCommit.commit());
                    batch = writeBatch(db);
                    writesQueued = 0;
                }
            };

            for (const group of results) {
                const existingSnaps = await Promise.all(
                    group.flaggedIds.map(id => getDoc(doc(db, 'school-settings', schoolId, 'courses', group.courseId, 'grades', id)))
                );
                group.flaggedIds.forEach((studentId, idx) => {
                    const info = group.eligibility[studentId];
                    const existingSnap = existingSnaps[idx];
                    const existingData = existingSnap.exists() ? existingSnap.data() as any : null;
                    const newRemark = `เวลาเรียนไม่ถึงร้อยละ 80 (${info.presentHours}/${info.totalHours} คาบ = ${info.percentage.toFixed(1)}%)`;
                    if (existingData?.status === 'มส' && existingData?.remark === newRemark) return;

                    const baseRecord = existingData || { formative: 0, midterm: 0, final: 0, total: 0, grade: '0' };
                    const gradeRef = doc(db, 'school-settings', schoolId, 'courses', group.courseId, 'grades', studentId);
                    batch.set(gradeRef, {
                        ...baseRecord,
                        status: 'มส',
                        grade: 'มส',
                        remark: newRemark,
                        updatedAt: Timestamp.now(),
                    }, { merge: true });
                    writesQueued++;
                });
                await commitIfNeeded();
            }
            if (writesQueued > 0) commits.push(batch.commit());
            await Promise.all(commits);

            setPhase('applied');
            Swal.fire({ icon: 'success', title: 'บันทึกสำเร็จ', text: 'บันทึกสถานะ มส ย้อนหลังเรียบร้อยแล้ว', timer: 2000, showConfirmButton: false });
        } catch (err) {
            console.error('Error applying มส backfill:', err);
            Swal.fire('เกิดข้อผิดพลาด', 'ไม่สามารถบันทึกข้อมูลได้ กรุณาลองใหม่อีกครั้ง', 'error');
            setPhase('reviewed');
        }
    };

    return (
        <MainLayout>
            <div className="max-w-5xl mx-auto p-4 md:p-6">
                <BackButton />
                <h1 className="text-2xl font-bold mt-2 mb-1 text-gray-800 dark:text-gray-100">ตรวจสอบ มส. ย้อนหลัง (เวลาเรียนไม่ถึงร้อยละ 80)</h1>
                <p className="text-sm text-gray-500 dark:text-gray-400 mb-6">
                    เครื่องมือนี้จะสแกนข้อมูลเช็คชื่อของทุกวิชาในระบบ แล้วตรวจสอบว่านักเรียนคนใดมีเวลาเรียนสะสมต่ำกว่าร้อยละ 80 —
                    ใช้ตรรกะเดียวกับที่หน้าปพ.5 และหน้าเช็คชื่อรายวิชาใช้ เพื่อจับเคสที่เวลาเรียนต่ำกว่าเกณฑ์อยู่แล้วแต่ยังไม่เคยถูกบันทึก มส
                    (กดยืนยันด้านล่างเพื่อบันทึกได้เลย) และจะรายงาน (ไม่บันทึกให้อัตโนมัติ) รายชื่อนักเรียนที่เวลาเรียนฟื้นกลับมาครบแล้วแต่ยังติด มส.
                    ค้างอยู่ ให้ครูประจำวิชาไปตรวจสอบและกดบันทึกทีละคนที่หน้า ปพ.5 เอง
                </p>

                <div className="bg-white dark:bg-gray-800 rounded-xl shadow p-4 md:p-6 mb-6 flex flex-wrap items-end gap-4">
                    <div>
                        <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">ปีการศึกษา</label>
                        <input
                            type="text"
                            value={academicYear}
                            onChange={e => setAcademicYear(e.target.value)}
                            disabled={phase === 'scanning' || phase === 'applying'}
                            className="border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 w-32 bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-100"
                        />
                    </div>
                    <button
                        onClick={runScan}
                        disabled={!schoolId || !academicYear || phase === 'scanning' || phase === 'applying'}
                        className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white font-medium px-4 py-2 rounded-lg"
                    >
                        {phase === 'scanning' ? <Loader2 className="w-4 h-4 animate-spin" /> : <PlayCircle className="w-4 h-4" />}
                        เริ่มตรวจสอบ (Dry Run)
                    </button>
                    {phase === 'scanning' && progressLabel && (
                        <span className="text-sm text-gray-500 dark:text-gray-400">{progressLabel}</span>
                    )}
                </div>

                {scanError && (
                    <div className="mb-6 flex items-center gap-2 bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-300 px-4 py-3 rounded-lg text-sm">
                        <AlertTriangle className="w-4 h-4 shrink-0" /> {scanError}
                    </div>
                )}

                {(phase === 'reviewed' || phase === 'applying' || phase === 'applied') && (
                    <div className="bg-white dark:bg-gray-800 rounded-xl shadow p-4 md:p-6">
                        <div className="flex flex-wrap items-center justify-between gap-4 mb-4">
                            <div>
                                <p className="text-lg font-semibold text-gray-800 dark:text-gray-100">
                                    พบนักเรียนเวลาเรียนไม่ถึงร้อยละ 80 ทั้งหมด {totalFlagged} รายการ ใน {results.length} กลุ่มวิชา/ห้อง
                                </p>
                                <p className="text-xs text-gray-500 dark:text-gray-400">
                                    การกดยืนยันจะเขียนทับสถานะ/เกรดเป็น "มส" ให้ทุกรายการด้านล่าง (ยกเว้นรายการที่ติด มส ด้วยตัวเลขเดียวกันอยู่แล้ว)
                                </p>
                            </div>
                            {phase === 'reviewed' && totalFlagged > 0 && (
                                <button
                                    onClick={applyBackfill}
                                    className="flex items-center gap-2 bg-red-600 hover:bg-red-700 text-white font-medium px-4 py-2 rounded-lg"
                                >
                                    <CheckCircle2 className="w-4 h-4" /> ยืนยันบันทึก มส ({totalFlagged} รายการ)
                                </button>
                            )}
                            {phase === 'applying' && (
                                <span className="flex items-center gap-2 text-gray-600 dark:text-gray-300 text-sm">
                                    <Loader2 className="w-4 h-4 animate-spin" /> กำลังบันทึก...
                                </span>
                            )}
                            {phase === 'applied' && (
                                <span className="flex items-center gap-2 text-green-600 dark:text-green-400 text-sm font-medium">
                                    <CheckCircle2 className="w-4 h-4" /> บันทึกเสร็จสิ้นแล้ว
                                </span>
                            )}
                        </div>

                        {totalFlagged === 0 ? (
                            <p className="text-sm text-gray-500 dark:text-gray-400">ไม่พบนักเรียนที่เวลาเรียนต่ำกว่าเกณฑ์ในระบบขณะนี้</p>
                        ) : (
                            <div className="overflow-x-auto">
                                <table className="w-full text-sm">
                                    <thead>
                                        <tr className="text-left border-b border-gray-200 dark:border-gray-700 text-gray-500 dark:text-gray-400">
                                            <th className="py-2 pr-4">วิชา</th>
                                            <th className="py-2 pr-4">ชั้น/กลุ่ม</th>
                                            <th className="py-2 pr-4">นักเรียนทั้งหมด</th>
                                            <th className="py-2 pr-4">จะติด มส</th>
                                            <th className="py-2 pr-4">ติด มส อยู่แล้ว (ไม่ต้องแก้)</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {results.map(group => (
                                            <tr key={`${group.courseId}-${group.classDisplay}-${group.room}`} className="border-b border-gray-100 dark:border-gray-700/50">
                                                <td className="py-2 pr-4 text-gray-800 dark:text-gray-100">{group.courseTitle}</td>
                                                <td className="py-2 pr-4 text-gray-600 dark:text-gray-300">{group.classDisplay} / {group.room}</td>
                                                <td className="py-2 pr-4 text-gray-600 dark:text-gray-300">{group.roster.length}</td>
                                                <td className="py-2 pr-4 font-semibold text-red-600 dark:text-red-400">{group.flaggedIds.length}</td>
                                                <td className="py-2 pr-4 text-gray-500 dark:text-gray-400">{group.alreadyFlaggedCount}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </div>
                )}

                {(phase === 'reviewed' || phase === 'applying' || phase === 'applied') && totalRecovered > 0 && (
                    <div className="bg-white dark:bg-gray-800 rounded-xl shadow p-4 md:p-6 mt-6">
                        <p className="text-lg font-semibold text-gray-800 dark:text-gray-100 mb-1">
                            เวลาเรียนฟื้นกลับมาครบร้อยละ 80 แล้ว แต่ยังติด มส. ค้างอยู่ {totalRecovered} รายการ
                        </p>
                        <p className="text-xs text-gray-500 dark:text-gray-400 mb-4">
                            เครื่องมือนี้<b>จะไม่เขียนแก้ให้อัตโนมัติ</b> เพราะการถอน มส. ต้องคืนเป็นเกรดจริงจากคะแนนที่ครูให้ไว้ ซึ่งครูประจำวิชาควรเป็นคนตรวจสอบและกดบันทึกเองทีละคนที่หน้า ปพ.5 ของวิชานั้น — พอกดบันทึกที่หน้านั้น ระบบจะถอน มส. คืนเป็นเกรดจริงให้อัตโนมัติทันที
                        </p>
                        <div className="overflow-x-auto">
                            <table className="w-full text-sm">
                                <thead>
                                    <tr className="text-left border-b border-gray-200 dark:border-gray-700 text-gray-500 dark:text-gray-400">
                                        <th className="py-2 pr-4">วิชา</th>
                                        <th className="py-2 pr-4">ชั้น/กลุ่ม</th>
                                        <th className="py-2 pr-4">นักเรียน</th>
                                        <th className="py-2 pr-4">เลขที่</th>
                                        <th className="py-2 pr-4">เวลาเรียนล่าสุด</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {recoveredGroups.flatMap(group => group.recoveredStudents.map(s => (
                                        <tr key={`${group.courseId}-${s.id}`} className="border-b border-gray-100 dark:border-gray-700/50">
                                            <td className="py-2 pr-4 text-gray-800 dark:text-gray-100">{group.courseTitle}</td>
                                            <td className="py-2 pr-4 text-gray-600 dark:text-gray-300">{group.classDisplay} / {group.room}</td>
                                            <td className="py-2 pr-4 text-gray-800 dark:text-gray-100">{s.name}</td>
                                            <td className="py-2 pr-4 text-gray-600 dark:text-gray-300">{s.studentNumber}</td>
                                            <td className="py-2 pr-4 font-semibold text-emerald-600 dark:text-emerald-400">{s.percentage.toFixed(1)}%</td>
                                        </tr>
                                    )))}
                                </tbody>
                            </table>
                        </div>
                    </div>
                )}
            </div>
        </MainLayout>
    );
};

export default AttendanceMsBackfillPage;
