// Firestore-backed helpers built on top of the pure calculation in attendanceEligibility.ts.
// Shared by every place that needs to know "is this student's attendance below 80% for this
// course" from live Firestore data: the per-subject attendance-taking page (live save-time
// check), and the มส backfill tool (batch check over every course/group already in the system).
import { collection, collectionGroup, getDocs, query, where, Firestore } from 'firebase/firestore';
import { getStableClassKey, matchesAssignmentGroupRoom } from './attendanceClassMatching';
import { CLASSES } from './schoolUtils';
import {
    AttendanceStatus,
    AttendanceEligibilityStudent,
    AttendanceEligibilityResult,
    buildAttendancePages,
    buildStudentAttendanceSummaries,
    computeAttendanceEligibility,
    checkIsHolidayLocal,
} from './attendanceEligibility';

const MS_STATUS_SEVERITY: Record<string, number> = { absent: 4, escape: 4, leave: 3, late: 2, present: 1 };
const toDateKey = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

// Primary (ประถม) classes are graded on an annual basis rather than per-semester — mirrors the
// same one-line check duplicated in GradeBookPage.tsx/HistoricalClassroomAttendancePage.tsx.
export const isPrimaryClassValue = (classValue: unknown) => {
    const raw = Array.isArray(classValue) ? classValue[0] : classValue;
    const value = String(raw || '').trim().toLowerCase();
    const label = CLASSES[value] || value;
    return /^p[1-6]$/.test(value) || label.includes('ป.') || label.includes('ประถม');
};

export interface CourseGroupIdentity {
    courseId: string;
    classId: unknown;
    className?: string;
    subjectCode?: string;
    courseCode?: string;
    teacherAssignments?: any[];
    selectedRoomForMatch?: unknown;
    semester?: string;
}

// Builds the day-of-week -> period-numbers map for one course+room/group, scanning every
// `schedules` doc for the academic year — the same matching approach GradeBookPage.tsx's
// fetchSchedule uses, generalized so it can run for any course/group, not just the one a
// specific teacher's page happens to have open.
export const fetchCourseWeeklySchedule = async (
    db: Firestore,
    schoolId: string,
    academicYear: string,
    identity: CourseGroupIdentity,
    semesterScope?: string
): Promise<Record<string, number[]>> => {
    const scheduleMap: Record<string, number[]> = { sun: [], mon: [], tue: [], wed: [], thu: [], fri: [], sat: [] };
    const addPeriod = (key: string, period: number) => {
        if (!scheduleMap[key]) scheduleMap[key] = [];
        if (!scheduleMap[key].includes(period)) scheduleMap[key].push(period);
    };

    const targetSemester = semesterScope || identity.semester;
    let resolvedAssignments = identity.teacherAssignments || [];
    if (resolvedAssignments.length === 0 && identity.courseId) {
        try {
            const caSnap = await getDocs(query(
                collection(db, 'school-settings', schoolId, 'course_assignments'),
                where('courseId', '==', identity.courseId),
                where('academicYear', '==', String(academicYear))
            ));
            caSnap.forEach(doc => {
                const data = doc.data();
                const assignments = data.teacherAssignments;
                if (Array.isArray(assignments) && assignments.length > 0) {
                    if (!targetSemester || targetSemester === 'annual' || String(data.semester || '') === String(targetSemester)) {
                        resolvedAssignments = assignments;
                    }
                }
            });
        } catch (err) {
            console.warn('[attendanceEligibilityFirestore] Error fetching fallback course_assignments:', err);
        }
    }

    const classKey = getStableClassKey(identity.classId);
    const classTitle = CLASSES[classKey] || identity.className || '';
    const targetCode = (identity.subjectCode || identity.courseCode || '').replace(/\s/g, '');
    const classCandidates = new Set([classKey, classTitle].filter(Boolean));

    const scheduleConstraints = [
        where('academicYear', '==', String(academicYear)),
        ...(targetSemester && targetSemester !== 'annual' ? [where('semester', '==', String(targetSemester))] : [])
    ];
    let schedulesSnap;
    try {
        schedulesSnap = await getDocs(query(
            collection(db, 'school-settings', schoolId, 'schedules'),
            ...scheduleConstraints
        ));
    } catch {
        // Fallback without semester query constraint if composite index is missing
        schedulesSnap = await getDocs(query(
            collection(db, 'school-settings', schoolId, 'schedules'),
            where('academicYear', '==', String(academicYear))
        ));
    }

    schedulesSnap.forEach(scheduleDoc => {
        const data = scheduleDoc.data();
        const dataSemester = String(data.semester || data.term || '');
        if (targetSemester && targetSemester !== 'annual') {
            const matchesSemester = !dataSemester || dataSemester === targetSemester || dataSemester.startsWith(`${targetSemester}/`) || targetSemester.startsWith(`${dataSemester}/`) || dataSemester.includes(targetSemester);
            if (!matchesSemester) return;
        }

        const classIds = Array.isArray(data.classId) ? data.classId : [data.classId];
        const matchesClass = classIds.some((id: string) => classCandidates.has(String(id))) || (classTitle && String(data.className || '').includes(classTitle));
        if (!matchesClass) return;

        Object.entries(data.schedule || {}).forEach(([key, val]: [string, any]) => {
            const coursesInSlot = Array.isArray(val) ? val : [val];
            coursesInSlot.forEach((c: any) => {
                if (!c) return;
                const cCode = (c.code || '').replace(/\s/g, '');
                const matchesCourse = (c.id === identity.courseId) || (cCode === targetCode);
                if (!matchesCourse) return;

                const effectiveAssignments = (resolvedAssignments.length > 0)
                    ? resolvedAssignments
                    : (c.teacherAssignments && Array.isArray(c.teacherAssignments) && c.teacherAssignments.length > 0)
                        ? c.teacherAssignments
                        : [];

                const matchesGroup = matchesAssignmentGroupRoom(effectiveAssignments, c?.groupNumber, identity.selectedRoomForMatch);
                if (!matchesGroup) return;

                const [day, periodStr] = key.split('-');
                const period = parseInt(periodStr, 10);
                if (scheduleMap[day] && !isNaN(period)) {
                    addPeriod(day, period);
                    if (targetSemester === 'annual') {
                        addPeriod(`${dataSemester || 'all'}:${day}`, period);
                    }
                }
            });
        });
    });

    return scheduleMap;
};

// Pulls the FULL attendance history for a course (every ClassroomAttendance record recorded
// under any student for this subjectCode/academicYear, not scoped to a single day) and merges
// same-day/multi-period records with "worst status wins", matching useGradeBookData.ts.
export const fetchCourseAttendanceHistory = async (
    db: Firestore,
    schoolId: string,
    academicYear: string,
    subjectCodeCandidates: string[]
): Promise<Record<string, Record<string, AttendanceStatus>>> => {
    const dailyStatus: Record<string, Record<string, AttendanceStatus>> = {};
    const candidates = Array.from(new Set(subjectCodeCandidates.filter(Boolean))).slice(0, 10);
    if (candidates.length === 0) return dailyStatus;

    const attendanceSnap = await getDocs(query(
        collectionGroup(db, 'ClassroomAttendance'),
        where('schoolId', '==', schoolId),
        where('subjectCode', 'in', candidates),
        where('academicYear', '==', academicYear)
    ));

    attendanceSnap.forEach(recordDoc => {
        const rec = recordDoc.data() as any;
        const studentId = rec.studentId;
        const dateVal = rec.date?.toDate ? rec.date.toDate() : null;
        if (!studentId || !dateVal) return;
        const dateStr = toDateKey(dateVal);
        const status = rec.status as AttendanceStatus;
        if (!dailyStatus[studentId]) dailyStatus[studentId] = {};
        const current = dailyStatus[studentId][dateStr];
        if (!current || (MS_STATUS_SEVERITY[status] ?? 0) >= (MS_STATUS_SEVERITY[current] ?? 0)) {
            dailyStatus[studentId][dateStr] = status;
        }
    });

    return dailyStatus;
};

export interface CourseGroupEligibilityResult {
    eligibility: Record<string, AttendanceEligibilityResult>;
    dailyStatus: Record<string, Record<string, AttendanceStatus>>;
}

// End-to-end: fetch schedule + history for one course/room-group, then compute per-student
// attendance eligibility for the given roster, scoped to sessions up to today ("elapsed" — see
// attendanceEligibility.ts). This is correct for both a live check on an in-progress term
// (excludes still-untaught future sessions) and a backfill over an already-concluded term
// (every session date is already on/before today, so elapsed naturally covers the whole term).
export const computeCourseAttendanceEligibilityForRoster = async (
    db: Firestore,
    schoolId: string,
    academicYear: string,
    identity: CourseGroupIdentity,
    rosterStudents: AttendanceEligibilityStudent[],
    calendarData: any,
    semesterScope: string,
    subjectCodeCandidatesOverride?: string[]
): Promise<CourseGroupEligibilityResult> => {
    const scheduleMap = await fetchCourseWeeklySchedule(db, schoolId, academicYear, identity, semesterScope);
    const subjectCodeCandidates = subjectCodeCandidatesOverride || ([identity.subjectCode, identity.courseId, identity.courseCode].filter(Boolean) as string[]);
    const dailyStatus = await fetchCourseAttendanceHistory(db, schoolId, academicYear, subjectCodeCandidates);

    // CRITICAL: Scope dailyStatus passed to buildAttendancePages to ONLY the rosterStudents of this group/room!
    // If dailyStatus contains attendance records from students in OTHER rooms (e.g. Room 2 taught on Thursday),
    // buildAttendancePages's hasAttendanceRecord check would mark Thursday as a session for Room 1 students as well,
    // falsely counting Room 1 students as absent every Thursday and inflating total possible hours to 32+!
    const rosterIdSet = new Set(rosterStudents.map(s => s.id));
    const scopedDailyStatus: Record<string, Record<string, AttendanceStatus>> = {};
    Object.entries(dailyStatus).forEach(([sid, dates]) => {
        if (rosterIdSet.has(sid)) {
            scopedDailyStatus[sid] = dates;
        }
    });

    const classKey = getStableClassKey(identity.classId) || identity.courseId;
    const attendancePages = buildAttendancePages(calendarData, scheduleMap, semesterScope, classKey, scopedDailyStatus, checkIsHolidayLocal);
    const summaries = buildStudentAttendanceSummaries(rosterStudents, attendancePages, dailyStatus);
    const eligibility = computeAttendanceEligibility(summaries);

    return { eligibility, dailyStatus };
};
