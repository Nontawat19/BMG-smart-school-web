import { doc, QuerySnapshot, writeBatch } from 'firebase/firestore';
import { firestore as db } from '@/firebase';
import { getScheduleDocId } from '../../scheduleSharedUtils';
import { CourseInstance, Teacher } from '../../types';

// Deep equality check for dirty checking before writing to Firestore
const deepEqual = (obj1: unknown, obj2: unknown): boolean => {
    if (obj1 === obj2) return true;
    if (typeof obj1 !== 'object' || typeof obj2 !== 'object' || obj1 === null || obj2 === null) return false;

    const keys1 = Object.keys(obj1);
    const keys2 = Object.keys(obj2);

    if (keys1.length !== keys2.length) return false;

    for (const key of keys1) {
        if (!keys2.includes(key)) return false;
        if (!deepEqual((obj1 as Record<string, unknown>)[key], (obj2 as Record<string, unknown>)[key])) return false;
    }

    return true;
};

/** A single course-write entry for a teacher's schedule doc: a CourseInstance
 *  (what both the engine and the locked-course carry-over path produce) plus
 *  a couple of write-time-only fields. No index signature on purpose — TS
 *  requires nominal types assigned into an index-signature type to declare
 *  one explicitly too, which would break compatibility with the `Schedule`
 *  (CourseInstance[]) values callers actually pass in. */
export type WriteCourseRecord = Omit<CourseInstance, 'room'> & {
    // Collapsed to a plain string for storage when there's exactly one room (see dedup logic below).
    room?: string | string[];
    taskId?: number;
    courseId?: string;
};

export type TeacherScheduleMap = Record<string, WriteCourseRecord[]>;

export interface FirestoreWriterInput {
    schoolId: string;
    selectedYear: string;
    selectedSemester: string;
    batchUpdates: Record<string, TeacherScheduleMap>;
    existingSchedulesSnapshot: QuerySnapshot;
    scheduleDocMeta: Record<string, { teacherId: string; classId?: string | string[] }>;
    allTeachersData: Teacher[];
    normalizedTargetTeacherId?: string;
    coTeachingWriteTeacherIds: Set<string>;
    shouldHardResetSchoolWide: boolean;
}

export const writeSchedulesToFirestore = async (
    input: FirestoreWriterInput,
    onProgress: (pct: number, msg: string) => void
): Promise<{ teacherIdsToWrite: string[]; numBatches: number }> => {
    const {
        schoolId,
        selectedYear,
        selectedSemester,
        batchUpdates,
        existingSchedulesSnapshot,
        scheduleDocMeta,
        allTeachersData,
        normalizedTargetTeacherId,
        coTeachingWriteTeacherIds,
        shouldHardResetSchoolWide
    } = input;

    const teacherIdsByLength = allTeachersData.map((t) => t.id).sort((a: string, b: string) => b.length - a.length);
    const resolveTeacherId = (scheduleKey: string) => {
        const storedTeacherId = scheduleDocMeta[scheduleKey]?.teacherId;
        if (storedTeacherId) return storedTeacherId;
        return (
            teacherIdsByLength.find((tId: string) => scheduleKey === tId || scheduleKey.startsWith(`${tId}_`)) ||
            scheduleKey.split('_')[0]
        );
    };

    const allowedTeacherWriteIds = normalizedTargetTeacherId
        ? new Set([normalizedTargetTeacherId, ...coTeachingWriteTeacherIds])
        : null;

    // Build per-teacher deduplicated schedule maps
    const teacherUpdates: Record<string, TeacherScheduleMap> = {};
    Object.entries(batchUpdates).forEach(([scheduleKey, slotMap]) => {
        const tId = resolveTeacherId(scheduleKey);
        if (allowedTeacherWriteIds && !allowedTeacherWriteIds.has(tId)) return;
        if (!teacherUpdates[tId]) teacherUpdates[tId] = {};

        Object.entries(slotMap).forEach(([slotId, courses]) => {
            const courseArray = Array.isArray(courses) ? courses : (courses ? [courses] : []);
            const cleanedCourses = courseArray
                .filter((course) => !course?.isTemporarySchedule)
                .map((course) => {
                const { taskId, ...cleanCourse } = course;
                return cleanCourse;
            });
            teacherUpdates[tId][slotId] = [
                ...(teacherUpdates[tId][slotId] || []),
                ...cleanedCourses
            ];
        });
    });

    // Hard-reset: delete all matching documents before writing
    if (shouldHardResetSchoolWide) {
        const matchingDocsToDelete = existingSchedulesSnapshot.docs.filter((scheduleDoc) => {
            const data = scheduleDoc.data();
            const dataYear = String(data.academicYear || '');
            const dataSemester = String(data.semester || '');
            const targetSem = String(selectedSemester || '1');
            const targetYear = String(selectedYear || '');
            const yearMatches = !targetYear || !dataYear || dataYear === targetYear;
            const semesterMatches =
                !dataSemester ||
                dataSemester === targetSem ||
                dataSemester.startsWith(targetSem + '/') ||
                targetSem.startsWith(dataSemester + '/');
            return yearMatches && semesterMatches;
        });

        for (let i = 0; i < matchingDocsToDelete.length; i += 450) {
            const cleanupBatch = writeBatch(db);
            matchingDocsToDelete.slice(i, i + 450).forEach((scheduleDoc) => {
                cleanupBatch.delete(scheduleDoc.ref);
            });
            await cleanupBatch.commit();
        }
    }

    // Deduplicate teacher schedules per slot
    Object.keys(teacherUpdates).forEach(tId => {
        const schedule = teacherUpdates[tId];
        Object.keys(schedule).forEach(slotId => {
            const courses = schedule[slotId];
            if (!Array.isArray(courses) || courses.length <= 1) return;

            const deduped: WriteCourseRecord[] = [];
            const seen = new Map<string, WriteCourseRecord>();

            const toStringArray = (value: string | string[] | undefined): string[] =>
                (Array.isArray(value) ? value : [value]).filter((v): v is string => Boolean(v));

            courses.forEach((course) => {
                const key = `${course.id || course.courseId || ''}_${course.groupNumber || 1}`;
                const existing = seen.get(key);

                if (existing) {
                    const mergedClasses = Array.from(new Set([...toStringArray(existing.classId), ...toStringArray(course.classId)]));
                    existing.classId = mergedClasses.length === 1 ? mergedClasses[0] : mergedClasses;

                    const mergedRooms = Array.from(new Set([...toStringArray(existing.room), ...toStringArray(course.room)]))
                        .filter((r) => r.toLowerCase() !== 'all');
                    existing.room = mergedRooms.length === 0 ? ['all'] : mergedRooms;

                    const existingTeachers = existing.teacherIds ?? toStringArray(existing.teacherId || tId);
                    const newTeachers = course.teacherIds ?? toStringArray(course.teacherId);
                    existing.teacherIds = Array.from(new Set([...existingTeachers, ...newTeachers]));
                } else {
                    const clone: WriteCourseRecord = {
                        ...course,
                        classId: toStringArray(course.classId),
                        room: toStringArray(course.room),
                        teacherIds: course.teacherIds ? [...course.teacherIds] : toStringArray(course.teacherId || tId)
                    };
                    seen.set(key, clone);
                    deduped.push(clone);
                }
            });

            deduped.forEach(course => {
                if (Array.isArray(course.classId)) {
                    if (course.classId.length === 1) {
                        course.classId = course.classId[0];
                    } else if (course.classId.length === 0) {
                        course.classId = '';
                    }
                }
                if (Array.isArray(course.room)) {
                    if (course.room.length === 1) {
                        course.room = course.room[0];
                    } else if (course.room.length === 0) {
                        course.room = ['all'];
                    }
                }
            });

            if (deduped.length === 0) {
                delete schedule[slotId];
            } else {
                schedule[slotId] = deduped;
            }
        });
    });

    const teacherIdsToWrite = Object.keys(teacherUpdates);
    const affectedTeacherIds = allowedTeacherWriteIds
        ? Array.from(allowedTeacherWriteIds)
        : allTeachersData.map((t) => t.id);
    const affectedTeacherSet = new Set(affectedTeacherIds);

    const writes: Array<{ type: 'set' | 'delete'; id: string; teacherId: string }> = [];

    const existingDataMap = new Map<string, { schedule?: TeacherScheduleMap }>();
    existingSchedulesSnapshot.docs.forEach((docSnap) => {
        existingDataMap.set(docSnap.id, docSnap.data());
    });

    if (shouldHardResetSchoolWide) {
        teacherIdsToWrite.forEach(teacherId => {
            const expectedDocId = getScheduleDocId(teacherId, selectedYear, selectedSemester);
            // We write unconditionally on hard reset since we already deleted docs
            writes.push({
                type: 'set',
                id: expectedDocId,
                teacherId
            });
        });
    } else {
        affectedTeacherIds.forEach((teacherId: string) => {
            const expectedDocId = getScheduleDocId(teacherId, selectedYear, selectedSemester);
            const hasNewSchedule = teacherIdsToWrite.includes(teacherId);
            const existingData = existingDataMap.get(expectedDocId);

            if (hasNewSchedule) {
                const newSchedule = teacherUpdates[teacherId] || {};
                
                // DIRTY CHECKING: Only push to writes if there's no existing data or if the schedule actually changed
                const isDirty = !existingData || !deepEqual(existingData.schedule || {}, newSchedule);
                
                if (isDirty) {
                    writes.push({ type: 'set', id: expectedDocId, teacherId });
                }
            } else {
                // If there's no new schedule, but existing data is present (and it's not empty), we need to delete it
                // Actually, if existing data has an empty schedule {}, we can just leave it or delete it.
                // We'll delete it to clean up the DB.
                if (existingData) {
                    writes.push({ type: 'delete', id: expectedDocId, teacherId });
                }
            }
        });

        existingSchedulesSnapshot.docs.forEach((scheduleDoc) => {
            const docId = scheduleDoc.id;
            const meta = scheduleDocMeta[docId];
            if (!meta) return;

            const storedTeacherId = meta.teacherId;
            if (!storedTeacherId || !affectedTeacherSet.has(storedTeacherId)) return;

            const expectedDocId = getScheduleDocId(storedTeacherId, selectedYear, selectedSemester);
            if (docId !== expectedDocId) {
                writes.push({ type: 'delete', id: docId, teacherId: storedTeacherId });
            }
        });
    }

    const batchSize = 450;
    const numBatches = Math.max(1, Math.ceil(writes.length / batchSize));

    for (let i = 0; i < numBatches && writes.length > 0; i++) {
        const startIdx = i * batchSize;
        const endIdx = Math.min(startIdx + batchSize, writes.length);
        const batchWrites = writes.slice(startIdx, endIdx);

        const batch = writeBatch(db);
        for (const write of batchWrites) {
            const scheduleRef = doc(db, 'school-settings', schoolId, 'schedules', write.id);
            if (write.type === 'delete') {
                batch.delete(scheduleRef);
                continue;
            }

            const scheduleForTeacher = teacherUpdates[write.teacherId] || {};
            const teacherClasses = new Set<string>();
            Object.values(scheduleForTeacher).forEach((courses) => {
                courses.forEach((course) => {
                    const classIds = Array.isArray(course.classId)
                        ? course.classId
                        : [course.classId].filter(Boolean) as string[];
                    classIds.forEach((classId) => teacherClasses.add(classId));
                });
            });

            batch.set(scheduleRef, {
                schedule: scheduleForTeacher,
                teacherId: write.teacherId,
                classId: Array.from(teacherClasses),
                semester: selectedSemester,
                academicYear: selectedYear,
                totalPeriods: Object.values(scheduleForTeacher).reduce(
                    (acc, curr) => acc + (Array.isArray(curr) ? curr.length : curr ? 1 : 0),
                    0
                ),
                updatedAt: new Date()
            });
        }

        await batch.commit();
        const batchProgress = 85 + Math.round(((i + 1) / numBatches) * 10);
        onProgress(batchProgress, `กำลังบันทึกข้อมูล... (${i + 1}/${numBatches} ชุด)`);
    }

    return { teacherIdsToWrite, numBatches };
};
