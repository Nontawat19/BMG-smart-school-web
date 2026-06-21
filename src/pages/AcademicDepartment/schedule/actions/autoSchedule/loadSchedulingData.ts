import { collection, doc, getDocs, getDoc, QuerySnapshot, DocumentData } from 'firebase/firestore';
import { firestore as db } from '@/firebase';
import { Course, CourseInstance, Schedule, Teacher, AssignmentConstraintMap, getAssignmentTeacherIds } from '../../types';
import { isActiveTeacher } from '@/utils/teacherSortUtils';
import { getScheduleDocId, resolveScheduleTeacherId, normalizeGroupNumber } from '../../scheduleSharedUtils';

export interface CourseAssignmentDocData {
    id: string;
    courseId: string;
    academicYear?: string;
    semester?: string;
    teacherAssignments?: Course['teacherAssignments'];
}

export interface SchedulingLoadResult {
    allCoursesData: Course[];
    allTeachersData: Teacher[];
    teachersMap: Record<string, Teacher>;
    effectiveAssignmentConstraints: AssignmentConstraintMap;
    existingSchedulesMap: Record<string, Schedule>;
    existingSchedulesSnapshot: QuerySnapshot<DocumentData>;
    lockedCoursesMap: Record<string, Schedule>;
    scheduleDocMeta: Record<string, { teacherId: string; classId?: string | string[] }>;
    protectedCoTeachingKeys: Set<string>;
    coTeachingWriteTeacherIds: Set<string>;
    assignmentByCourseId: Map<string, CourseAssignmentDocData>;
    hasUsableAssignment: (course: Course) => boolean;
    getCoTeachingKey: (courseId: string, groupNumber?: number | string, teacherIds?: string[]) => string;
}

export interface LoadSchedulingDataInput {
    schoolId: string;
    selectedYear: string;
    selectedSemester: string;
    selectedTeacher: string;
    dynamicUnavailableSlots: string[];
    normalizedTargetTeacherId: string | undefined;
    existingAssignmentConstraints: AssignmentConstraintMap;
    currentSchedule: Schedule;
    throwIfCancelled: () => void;
    updateProgress: (pct: number, msg: string) => void;
}

const mergeScheduleMaps = (base: Schedule, extra: Schedule): Schedule => {
    const next: Schedule = { ...base };
    const courseKey = (c: CourseInstance) => {
        const cId = c?.id || (c as unknown as { courseId?: string })?.courseId || '';
        const grp = normalizeGroupNumber(c?.groupNumber);
        const tIds = Array.isArray(c?.teacherIds) && c.teacherIds.length > 0
            ? c.teacherIds.map(String).sort().join('|')
            : String(c?.teacherId || '');
        const clsIds = Array.isArray(c?.classId) ? c.classId.map(String).sort().join('|') : String(c?.classId || '');
        return `${cId}__${grp}__${tIds}__${clsIds}`;
    };
    Object.entries(extra).forEach(([slotId, courses]) => {
        const existing = Array.isArray(next[slotId]) ? [...next[slotId]] : (next[slotId] ? [next[slotId]] : []);
        const seen = new Set(existing.map(courseKey));
        (Array.isArray(courses) ? courses : (courses ? [courses] : [])).forEach(c => {
            const k = courseKey(c);
            if (seen.has(k)) return;
            seen.add(k);
            existing.push(c);
        });
        if (existing.length > 0) next[slotId] = existing;
    });
    return next;
};

export const loadSchedulingData = async (input: LoadSchedulingDataInput): Promise<SchedulingLoadResult> => {
    const {
        schoolId, selectedYear, selectedSemester, selectedTeacher,
        dynamicUnavailableSlots, normalizedTargetTeacherId,
        existingAssignmentConstraints, currentSchedule,
        throwIfCancelled, updateProgress,
    } = input;

    const targetSem = String(selectedSemester || '1');
    const targetYear = String(selectedYear || '');

    // ── Courses + Assignments (parallelised) ──────────────────────────────────
    updateProgress(5, 'กำลังโหลดข้อมูลรายวิชา...');
    const [coursesSnapshot, assignmentsSnapshot] = await Promise.all([
        getDocs(collection(db, 'school-settings', schoolId, 'courses')),
        getDocs(collection(db, 'school-settings', schoolId, 'course_assignments')),
    ]);
    throwIfCancelled();

    const rawCoursesData = coursesSnapshot.docs.map(d => ({ id: d.id, ...d.data() } as Course));
    const relevantAssignments = assignmentsSnapshot.docs
        .map(d => ({ id: d.id, ...d.data() } as CourseAssignmentDocData))
        .filter(a => {
            const aSem = String(a.semester || '');
            const aYear = String(a.academicYear || '');
            const yearOk = !targetYear || !aYear || aYear === targetYear;
            const semOk = aSem === targetSem || aSem.startsWith(targetSem + '/') || targetSem.startsWith(aSem + '/');
            return yearOk && semOk;
        });

    const assignmentByCourseId = new Map(relevantAssignments.map(a => [a.courseId, a]));
    const hasUsableAssignment = (course: Course) =>
        (course.teacherAssignments || []).some(a =>
            getAssignmentTeacherIds(a).length > 0 && (a.classLevels || []).filter(Boolean).length > 0
        );

    const allCoursesData = rawCoursesData.map(course => {
        const semAssign = assignmentByCourseId.get(course.id);
        return semAssign?.teacherAssignments
            ? { ...course, teacherAssignments: semAssign.teacherAssignments }
            : { ...course, teacherAssignments: [], teacherId: undefined, teacherIds: [] };
    });

    // ── Co-teaching protection keys ───────────────────────────────────────────
    const getCoTeachingKey = (courseId: string, groupNumber?: number | string, teacherIds?: string[]) => {
        const tidPart = teacherIds?.length ? teacherIds.slice().sort().join('|') : '';
        return `${courseId}|${normalizeGroupNumber(groupNumber)}|${tidPart}`;
    };

    const protectedCoTeachingKeys = new Set<string>();
    const coTeachingWriteTeacherIds = new Set<string>();
    if (normalizedTargetTeacherId) {
        allCoursesData.forEach(course => {
            (course.teacherAssignments || []).forEach(a => {
                const tIds = getAssignmentTeacherIds(a);
                if (!tIds.includes(normalizedTargetTeacherId) || tIds.length < 2) return;
                protectedCoTeachingKeys.add(getCoTeachingKey(course.id, a.groupNumber, tIds));
                protectedCoTeachingKeys.add(`${course.id}|${normalizeGroupNumber(a.groupNumber)}`);
            });
        });
    }

    // ── Teachers ──────────────────────────────────────────────────────────────
    updateProgress(10, 'กำลังโหลดข้อมูลครู...');
    const teachersSnapshot = await getDocs(collection(db, 'school-settings', schoolId, 'teachers'));
    throwIfCancelled();
    const allTeachersData = teachersSnapshot.docs
        .map(d => ({ id: d.id, ...d.data() } as Teacher))
        .filter(isActiveTeacher);

    if (selectedTeacher) {
        const idx = allTeachersData.findIndex(t => t.id === selectedTeacher);
        if (idx !== -1) {
            allTeachersData[idx] = {
                ...allTeachersData[idx],
                preferences: { ...allTeachersData[idx].preferences, unavailableSlots: dynamicUnavailableSlots },
            };
        }
    }
    const teachersMap: Record<string, Teacher> = Object.fromEntries(allTeachersData.map(t => [t.id, t]));

    // ── Period constraints ────────────────────────────────────────────────────
    updateProgress(12, 'กำลังโหลดข้อกำหนดรายวิชา...');
    const constraintsSnap = await getDoc(doc(db, 'school-settings', schoolId, 'configs', 'period_constraints'));
    throwIfCancelled();
    const effectiveAssignmentConstraints: AssignmentConstraintMap = {
        ...existingAssignmentConstraints,
        ...(constraintsSnap.exists() ? constraintsSnap.data().mapping || {} : {}),
    };

    // ── Existing schedules + locked courses ───────────────────────────────────
    updateProgress(15, 'กำลังโหลดตารางเดิม...');
    const existingSchedulesSnapshot = await getDocs(collection(db, 'school-settings', schoolId, 'schedules'));
    throwIfCancelled();

    const existingSchedulesMap: Record<string, Schedule> = {};
    const lockedCoursesMap: Record<string, Schedule> = {};
    const scheduleDocMeta: Record<string, { teacherId: string; classId?: string | string[] }> = {};
    const knownTeacherIds = allTeachersData.map(t => t.id);

    existingSchedulesSnapshot.forEach(scheduleDoc => {
        const data = scheduleDoc.data();
        const dataYear = String(data.academicYear || '');
        const dataSem = String(data.semester || '');
        const yearOk = !targetYear || !dataYear || dataYear === targetYear;
        const semOk = !dataSem || dataSem === targetSem || dataSem.startsWith(targetSem + '/') || targetSem.startsWith(dataSem + '/');
        if (!yearOk || !semOk) return;

        const docId = scheduleDoc.id;
        const scheduleData = data.schedule as Schedule;
        existingSchedulesMap[docId] = scheduleData;
        const teacherId = resolveScheduleTeacherId(docId, data.teacherId, knownTeacherIds);
        scheduleDocMeta[docId] = { teacherId, classId: data.classId };

        const lockedSchedule: Schedule = {};
        for (const slotId in scheduleData) {
            const coursesArr = Array.isArray(scheduleData[slotId])
                ? scheduleData[slotId]
                : [scheduleData[slotId]].filter(Boolean);
            const docTeacherId = teacherId || resolveScheduleTeacherId(docId, data.teacherId, knownTeacherIds);

            const locked = coursesArr.filter(c => {
                const semStr = String(c.semester || '');
                const correctSem = !c.semester || semStr === targetSem || semStr.startsWith(targetSem + '/') || targetSem.startsWith(semStr + '/');
                if (!correctSem) return true;
                const isOtherTeacher = normalizedTargetTeacherId && docTeacherId !== normalizedTargetTeacherId;
                const cTIds: string[] = Array.isArray(c.teacherIds) && c.teacherIds.length > 0 ? c.teacherIds : (c.teacherId ? [c.teacherId] : []);
                const cId = c.id || (c as { courseId?: string }).courseId || '';
                const isProtected = normalizedTargetTeacherId && (
                    protectedCoTeachingKeys.has(getCoTeachingKey(cId, c.groupNumber, cTIds)) ||
                    (cTIds.length === 0 && protectedCoTeachingKeys.has(`${cId}|${normalizeGroupNumber(c.groupNumber)}`))
                );
                return isOtherTeacher || isProtected || c.locked;
            });
            if (locked.length > 0) lockedSchedule[slotId] = locked;
        }
        if (Object.keys(lockedSchedule).length > 0) lockedCoursesMap[docId] = lockedSchedule;
    });

    // Merge current teacher's in-memory locked courses
    if (selectedTeacher && Object.keys(currentSchedule || {}).length > 0) {
        const currentLocked: Schedule = {};
        Object.entries(currentSchedule).forEach(([slotId, courses]) => {
            const locked = (Array.isArray(courses) ? courses : (courses ? [courses] : [])).filter(c => c?.locked);
            if (locked.length > 0) currentLocked[slotId] = locked.map(c => ({ ...c }));
        });
        if (Object.keys(currentLocked).length > 0) {
            const docId = getScheduleDocId(selectedTeacher, selectedYear, selectedSemester);
            lockedCoursesMap[docId] = mergeScheduleMaps(lockedCoursesMap[docId] || {}, currentLocked);
            scheduleDocMeta[docId] = { teacherId: selectedTeacher, classId: scheduleDocMeta[docId]?.classId };
        }
    }

    return {
        allCoursesData, allTeachersData, teachersMap,
        effectiveAssignmentConstraints,
        existingSchedulesMap, existingSchedulesSnapshot,
        lockedCoursesMap, scheduleDocMeta,
        protectedCoTeachingKeys, coTeachingWriteTeacherIds,
        assignmentByCourseId, hasUsableAssignment, getCoTeachingKey,
    };
};
