// TEMPORARY diagnostic page — helps trace why a มส flag written to courses/{courseId}/grades
// doesn't show up in the enrollment-driven fetchFlaggedStudents (remediationUtils.ts) used by
// the profile page / /my-grade-flags, and now also re-runs the live attendance-eligibility
// calculation (schedule matching + history) to see exactly why a percentage came out wrong.
// Safe to delete once the root cause is confirmed and fixed.
import React, { useState } from 'react';
import { useSelector } from 'react-redux';
import { RootState } from '@/store';
import MainLayout from '@/layouts/MainLayout';
import { firestore as db } from '@/firebase';
import { collection, doc, getDoc, getDocs, query, where } from 'firebase/firestore';
import {
    computeCourseAttendanceEligibilityForRoster,
    fetchCourseWeeklySchedule,
    isPrimaryClassValue,
} from '@/utils/attendanceEligibilityFirestore';

const MsFlagDiagnosticPage: React.FC = () => {
    const currentUser = useSelector((state: RootState) => state.auth.user);
    const schoolId = (currentUser as any)?.schoolId;

    const [courseId, setCourseId] = useState('2w1u7HqiqiPuYBWDldd3');
    const [academicYear, setAcademicYear] = useState('2569');
    const [semester, setSemester] = useState('1');
    const [roomId, setRoomId] = useState('1');
    const [loading, setLoading] = useState(false);
    const [result, setResult] = useState<any>(null);
    const [error, setError] = useState('');

    const runCheck = async () => {
        if (!schoolId || !courseId) return;
        setLoading(true);
        setError('');
        setResult(null);
        try {
            const courseSnap = await getDoc(doc(db, 'school-settings', schoolId, 'courses', courseId));
            const courseData = courseSnap.exists() ? courseSnap.data() : null;
            const courseCode = courseData?.code || '';

            const [enrollByCourseIdSnap, gradesSnap, duplicateCourseSnap, calendarSnap] = await Promise.all([
                getDocs(query(collection(db, 'school-settings', schoolId, 'enrollments'), where('courseId', '==', courseId))),
                getDocs(collection(db, 'school-settings', schoolId, 'courses', courseId, 'grades')),
                courseCode
                    ? getDocs(query(collection(db, 'school-settings', schoolId, 'courses'), where('code', '==', courseCode)))
                    : Promise.resolve(null as any),
                getDoc(doc(db, 'school-settings', schoolId, 'main_calendar', 'default')),
            ]);

            const enrollments = enrollByCourseIdSnap.docs.map(d => ({ id: d.id, ...d.data() } as any));

            // เรียกฟังก์ชันคำนวณ มส. ตัวเดียวกับที่ ClassroomAttendance ใช้จริง (ไม่ใช่จำลอง) เพื่อดูว่า
            // scheduleMap (ตารางที่จับคู่ได้) กับ dailyStatus (ประวัติเช็คชื่อที่ดึงมาได้) หน้าตาเป็นยังไง —
            // ถ้า scheduleMap ว่างหรือ dailyStatus ไม่มีวัน "present" เลยทั้งที่ควรจะมี แปลว่าจับคู่ผิดจุดไหนจุดหนึ่ง
            let liveScheduleMap: any = null;
            let liveEligibility: any = null;
            let liveDailyStatus: any = null;
            let liveError = '';
            if (courseData) {
                try {
                    const identity = {
                        courseId,
                        classId: courseData.classId,
                        subjectCode: courseData.code,
                        courseCode: courseData.code,
                        teacherAssignments: courseData.teacherAssignments,
                        selectedRoomForMatch: roomId,
                    };
                    liveScheduleMap = await fetchCourseWeeklySchedule(db, schoolId, academicYear, identity);
                    const calendarData = calendarSnap.exists() ? calendarSnap.data() : {};
                    const scope = isPrimaryClassValue(courseData.classId) ? 'annual' : semester;
                    const roster = enrollments.map(e => ({ id: e.studentId }));
                    const { eligibility, dailyStatus } = await computeCourseAttendanceEligibilityForRoster(
                        db, schoolId, academicYear, identity, roster, calendarData, scope
                    );
                    liveEligibility = eligibility;
                    liveDailyStatus = dailyStatus;
                } catch (e: any) {
                    liveError = e?.message || String(e);
                }
            }

            setResult({
                schoolId,
                courseId,
                courseExists: courseSnap.exists(),
                courseData,
                enrollmentsByCourseId: enrollments,
                grades: gradesSnap.docs.map(d => ({ id: d.id, ...d.data() })),
                duplicateCourseDocsWithSameCode: duplicateCourseSnap
                    ? duplicateCourseSnap.docs.map((d: any) => ({ id: d.id, code: d.data().code, title: d.data().title }))
                    : [],
                liveCalculation: {
                    academicYear, semester, roomId,
                    scheduleMap: liveScheduleMap,
                    dailyStatus: liveDailyStatus,
                    eligibility: liveEligibility,
                    error: liveError || undefined,
                },
            });
        } catch (err: any) {
            console.error(err);
            setError(err.message || String(err));
        } finally {
            setLoading(false);
        }
    };

    return (
        <MainLayout>
            <div className="max-w-5xl mx-auto p-6">
                <h1 className="text-xl font-bold mb-4 text-gray-800 dark:text-gray-100">ตรวจสอบ Enrollment/Grades/คำนวณ มส. สด (ชั่วคราว)</h1>
                <div className="flex flex-wrap gap-2 mb-4">
                    <input
                        value={courseId}
                        onChange={e => setCourseId(e.target.value)}
                        className="border rounded-lg px-3 py-2 flex-1 min-w-[200px] bg-white dark:bg-gray-800 text-gray-800 dark:text-gray-100"
                        placeholder="courseId"
                    />
                    <input
                        value={academicYear}
                        onChange={e => setAcademicYear(e.target.value)}
                        className="border rounded-lg px-3 py-2 w-28 bg-white dark:bg-gray-800 text-gray-800 dark:text-gray-100"
                        placeholder="ปีการศึกษา"
                    />
                    <input
                        value={semester}
                        onChange={e => setSemester(e.target.value)}
                        className="border rounded-lg px-3 py-2 w-20 bg-white dark:bg-gray-800 text-gray-800 dark:text-gray-100"
                        placeholder="เทอม"
                    />
                    <input
                        value={roomId}
                        onChange={e => setRoomId(e.target.value)}
                        className="border rounded-lg px-3 py-2 w-24 bg-white dark:bg-gray-800 text-gray-800 dark:text-gray-100"
                        placeholder="ห้อง"
                    />
                    <button onClick={runCheck} disabled={loading} className="bg-indigo-600 text-white px-4 py-2 rounded-lg disabled:opacity-50">
                        {loading ? 'กำลังตรวจสอบ...' : 'ตรวจสอบ'}
                    </button>
                </div>
                {error && <p className="text-red-600 mb-4">{error}</p>}
                {result && (
                    <pre className="bg-gray-900 text-green-300 text-xs p-4 rounded-lg overflow-x-auto whitespace-pre-wrap">
                        {JSON.stringify(result, null, 2)}
                    </pre>
                )}
            </div>
        </MainLayout>
    );
};

export default MsFlagDiagnosticPage;
