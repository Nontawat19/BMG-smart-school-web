import { Course, CourseInstance, PeriodSetting, SpecialPeriod, AssignmentConstraintMap, getAssignmentTeacherIds } from '../../types';
import {
    DAYS, buildPreferredSessionDurations, checkConstraints,
    getMatchingSpecialPeriod, isAcademicCourse, getPartnerIndexForPeriods,
    getRequiredWeeklyPeriods, isDoubleCapableConstraint, isProtectedSpecialPeriodSetting,
} from '../../utils';
import { EngineTask, EngineTeachingSlot, EngineSchedule, EngineBatchUpdates } from '../../engine/schedulerEngine';
import { normalizeGroupNumber, getAssignmentCompositeId, getTaskTeacherIds } from '../../scheduleSharedUtils';
import type { SchedulingLoadResult } from './loadSchedulingData';

export interface BuildTaskPipelineInput {
    loadResult: SchedulingLoadResult;
    periodSettings: PeriodSetting[];
    specialPeriods: SpecialPeriod[];
    selectedYear: string;
    selectedSemester: string;
    selectedTeacher: string;
    normalizedTargetTeacherId: string | undefined;
    dynamicUnavailableSlots: string[];
}

export interface TaskPipelineResult {
    schoolTimetable: EngineSchedule;
    batchUpdates: EngineBatchUpdates;
    allTeachingSlots: EngineTeachingSlot[];
    tasks: EngineTask[];
    skippedCourseIssues: string[];
    dataReadinessWarnings: string[];
    coursesForSemester: Course[];
    validSlotsByTaskIndex: string[][];
    relaxedValidSlotsByTaskIndex: string[][];
    tasksPerClass: Record<string, number>;
    tasksPerTeacher: Record<string, number>;
    tasksPerRoom: Record<string, number>;
    totalPeriodsRequired: number;
}

// ── Engine task factory ───────────────────────────────────────────────────────
const createEngineTask = (
    course: Course,
    teacherId: string,
    teacherIds: string[],
    targetClasses: string[],
    targetRooms: string[],
    groupNumber: number,
    duration: number,
    requiredSlot?: string,
): EngineTask => ({
    course, teacherId, teacherIds, targetClasses, targetRooms,
    instanceCount: 1, duration,
    originalCourseId: course.id,
    compositeId: `${course.id}_${groupNumber}`,
    groupNumber,
    ...(requiredSlot ? { requiredSlot } : {}),
});

// ── Carry-over a locked course into both the timetable and batchUpdates ───────
const addCarryOverCourse = (
    slotId: string,
    course: Course,
    teacherId: string,
    teacherIds: string[],
    classId: string,
    targetClasses: string[],
    targetRooms: string[],
    groupNumber: number,
    compositeId: string,
    schoolTimetable: EngineSchedule,
    batchUpdates: EngineBatchUpdates,
) => {
    const docId = `${teacherId}_${classId}`;
    if (!batchUpdates[docId]) batchUpdates[docId] = {};
    const existingItems = Array.isArray(batchUpdates[docId][slotId])
        ? batchUpdates[docId][slotId]
        : (batchUpdates[docId][slotId] ? [batchUpdates[docId][slotId]] : []);
    const alreadyIn = existingItems.some(item =>
        (item.id === course.id || (item as { courseId?: string }).courseId === course.id) &&
        normalizeGroupNumber(item.groupNumber) === groupNumber
    );
    if (!alreadyIn) {
        batchUpdates[docId][slotId] = [
            ...existingItems,
            { ...course, teacherId, teacherIds, classId, room: targetRooms, groupNumber, compositeId,
              instanceId: `${course.id}-${groupNumber}-${slotId}-${classId}-${teacherId}` },
        ];
    }

    if (!schoolTimetable[slotId]) schoolTimetable[slotId] = [];
    const existing = schoolTimetable[slotId].find(o =>
        o.teacherId === teacherId && o.courseId === course.id && Number(o.groupNumber || 0) === groupNumber
    );
    if (existing) {
        if (!Array.isArray(existing.classId)) existing.classId = [existing.classId].filter(Boolean) as string[];
        targetClasses.forEach(tc => { if (!(existing.classId as string[]).includes(tc)) (existing.classId as string[]).push(tc); });
        return;
    }
    schoolTimetable[slotId].push({
        teacherId, classId: [...targetClasses], room: targetRooms,
        courseId: course.id,
        course: { ...course, teacherId, teacherIds, classId: targetClasses, room: targetRooms, groupNumber },
        groupNumber,
    });
};

// ── Find which slots already hold a given assignment (from locked map) ────────
const getLockedSlotsForAssignment = (
    courseId: string,
    teacherIds: string[],
    targetClasses: string[],
    groupNumber: number,
    lockedCoursesMap: SchedulingLoadResult['lockedCoursesMap'],
    scheduleDocMeta: SchedulingLoadResult['scheduleDocMeta'],
    knownTeacherIds: string[],
): Set<string> => {
    const slots = new Set<string>();
    const teacherSet = new Set(teacherIds);
    const norm = (v: string) => String(v || '').trim();
    const base = (v: string) => norm(v).split('/')[0];
    const targetSet = new Set(targetClasses.map(norm));
    const baseSet = new Set(targetClasses.map(base));

    Object.entries(lockedCoursesMap).forEach(([docId, scheduleData]) => {
        const { resolveScheduleTeacherId } = require('../../scheduleSharedUtils');
        const docTeacherId = scheduleDocMeta[docId]?.teacherId || resolveScheduleTeacherId(docId, undefined, knownTeacherIds);
        if (!teacherSet.has(docTeacherId)) return;
        Object.entries(scheduleData).forEach(([slotId, courses]) => {
            const arr = Array.isArray(courses) ? courses : (courses ? [courses] : []);
            const hit = arr.some(c => {
                const cId = c.id || (c as { courseId?: string }).courseId;
                if (cId !== courseId || normalizeGroupNumber(c.groupNumber) !== groupNumber) return false;
                const cCls = Array.isArray(c.classId) ? c.classId : [c.classId || scheduleDocMeta[docId]?.classId].flat().filter((v): v is string => Boolean(v));
                if (targetSet.size === 0 || cCls.length === 0) return true;
                return cCls.some(id => targetSet.has(norm(id)) || baseSet.has(base(norm(id))));
            });
            if (hit) slots.add(slotId);
        });
    });
    return slots;
};

// ── Find previously placed slots (non-locked) for diversity nudge ─────────────
const getPreviousSlotsForAssignment = (
    existingSchedulesMap: Record<string, { [slotId: string]: CourseInstance[] | CourseInstance }>,
    courseId: string,
    teacherIds: string[],
    targetClasses: string[],
    groupNumber: number,
): Set<string> => {
    const slots = new Set<string>();
    const teacherSet = new Set(teacherIds);
    const norm = (v: string) => String(v || '').trim();
    const base = (v: string) => norm(v).split('/')[0];
    const targetSet = new Set(targetClasses.map(norm));
    const baseSet = new Set(targetClasses.map(base));

    Object.entries(existingSchedulesMap).forEach(([_docId, scheduleData]) => {
        Object.entries(scheduleData).forEach(([slotId, courses]) => {
            const arr = (Array.isArray(courses) ? courses : (courses ? [courses] : [])) as unknown as CourseInstance[];
            const hit = arr.some(c => {
                const cId = c.id || (c as { courseId?: string }).courseId;
                if (cId !== courseId || normalizeGroupNumber(c.groupNumber) !== groupNumber) return false;
                const cTIds = Array.isArray(c.teacherIds) && c.teacherIds.length > 0 ? c.teacherIds : (c.teacherId ? [c.teacherId] : []);
                if (cTIds.length > 0 && !cTIds.some(t => teacherSet.has(t))) return false;
                const cCls = Array.isArray(c.classId) ? c.classId : [c.classId].flat().filter((v): v is string => Boolean(v));
                if (targetSet.size === 0 || cCls.length === 0) return true;
                return cCls.some(id => targetSet.has(norm(id)) || baseSet.has(base(norm(id))));
            });
            if (hit) slots.add(slotId);
        });
    });
    return slots;
};

// ── Remove a wrongly-excess slot from both timetable and batchUpdates ─────────
const removeExcessSlot = (
    courseId: string,
    teacherIds: string[],
    groupNumber: number,
    slotId: string,
    scheduleDocMeta: SchedulingLoadResult['scheduleDocMeta'],
    knownTeacherIds: string[],
    schoolTimetable: EngineSchedule,
    batchUpdates: EngineBatchUpdates,
) => {
    const teacherSet = new Set(teacherIds);
    const { resolveScheduleTeacherId } = require('../../scheduleSharedUtils');

    Object.keys(batchUpdates).forEach(docId => {
        const docTeacherId = scheduleDocMeta[docId]?.teacherId || resolveScheduleTeacherId(docId, undefined, knownTeacherIds);
        if (!teacherSet.has(docTeacherId)) return;
        const items = batchUpdates[docId]?.[slotId];
        if (!items) return;
        const filtered = (Array.isArray(items) ? items : [items]).filter(item =>
            !((item.id === courseId || (item as { courseId?: string }).courseId === courseId) &&
              normalizeGroupNumber(item.groupNumber) === groupNumber)
        );
        if (filtered.length === 0) delete batchUpdates[docId][slotId];
        else batchUpdates[docId][slotId] = filtered;
    });

    if (schoolTimetable[slotId]) {
        schoolTimetable[slotId] = schoolTimetable[slotId].filter(o =>
            !(teacherSet.has(o.teacherId) && o.courseId === courseId && normalizeGroupNumber(o.groupNumber) === groupNumber)
        );
        if (schoolTimetable[slotId].length === 0) delete schoolTimetable[slotId];
    }
};

// ── Build valid slot set for one task ─────────────────────────────────────────
const buildValidSlotsForTask = (
    task: EngineTask,
    allTeachingSlots: EngineTeachingSlot[],
    periodSettings: PeriodSetting[],
    specialPeriods: SpecialPeriod[],
    teachersMap: SchedulingLoadResult['teachersMap'],
    selectedTeacher: string,
    dynamicUnavailableSlots: string[],
    teacherPrefSets: Map<string, { days: Set<string>; slots: Set<string> }>,
    getMap: (t: EngineTask) => AssignmentConstraintMap,
): Set<string> => {
    const validSlots = new Set<string>();
    const teacher = teachersMap[task.teacherId];
    const teacherUnavSlots = task.teacherId === selectedTeacher
        ? dynamicUnavailableSlots
        : (teacher?.preferences?.unavailableSlots || []);
    const taskTeacherIds = getTaskTeacherIds(task);
    const isExplicitlyLocked = !!task.requiredSlot;

    for (const slotInfo of allTeachingSlots) {
        const { slotId, dayKey, periodSetting } = slotInfo;
        const constraintMap = getMap(task);

        const { forbidden } = checkConstraints(
            { ...task.course, compositeId: task.compositeId, classId: task.targetClasses } as CourseInstance,
            slotId, teacher, periodSettings, specialPeriods,
            constraintMap, teacherUnavSlots, {}, task.duration, [], isExplicitlyLocked,
        );
        if (forbidden) continue;

        const coTeacherUnavail = !isExplicitlyLocked && taskTeacherIds.some(tid => {
            const p = teacherPrefSets.get(tid);
            return p?.days.has(dayKey) || p?.slots.has(slotId);
        });
        if (coTeacherUnavail) continue;
        if (task.requiredSlot && slotId !== task.requiredSlot) continue;

        if (task.duration > 1) {
            const pIdx = periodSettings.indexOf(periodSetting);
            const partnerIdx = getPartnerIndexForPeriods(pIdx, periodSettings);
            if (partnerIdx === -1 || partnerIdx <= pIdx) continue;

            let blockValid = true;
            for (let d = 1; d < task.duration; d++) {
                const nextIdx = d === 1 ? partnerIdx : pIdx + d;
                const nextSlotId = `${dayKey}-${nextIdx}`;
                const { forbidden: nextForbidden } = checkConstraints(
                    { ...task.course, compositeId: task.compositeId, classId: task.targetClasses } as CourseInstance,
                    nextSlotId, teacher, periodSettings, specialPeriods,
                    constraintMap, teacherUnavSlots, {}, 1, [], isExplicitlyLocked,
                );
                const nextCoUnavail = !isExplicitlyLocked && taskTeacherIds.some(tid => {
                    const p = teacherPrefSets.get(tid);
                    return p?.days.has(dayKey) || p?.slots.has(nextSlotId);
                });
                if (nextForbidden || nextCoUnavail) { blockValid = false; break; }
            }
            if (blockValid) validSlots.add(slotId);
        } else {
            validSlots.add(slotId);
        }
    }
    return validSlots;
};

// ── Main pipeline ─────────────────────────────────────────────────────────────
export const buildTaskPipeline = (input: BuildTaskPipelineInput): TaskPipelineResult => {
    const {
        loadResult, periodSettings, specialPeriods,
        selectedYear, selectedSemester, selectedTeacher,
        normalizedTargetTeacherId, dynamicUnavailableSlots,
    } = input;
    const {
        allCoursesData, allTeachersData, teachersMap,
        effectiveAssignmentConstraints, existingSchedulesMap,
        lockedCoursesMap, scheduleDocMeta,
        assignmentByCourseId, hasUsableAssignment, getCoTeachingKey,
        coTeachingWriteTeacherIds,
    } = loadResult;

    const targetSem = String(selectedSemester || '1');
    const knownTeacherIds = allTeachersData.map(t => t.id);

    // ── 1. Build all valid teaching slots ─────────────────────────────────────
    const allTeachingSlots: EngineTeachingSlot[] = [];
    periodSettings.forEach((ps, idx) => {
        if (!ps.isTeachingPeriod || isProtectedSpecialPeriodSetting(ps)) return;
        Object.keys(DAYS).forEach(day => {
            if (getMatchingSpecialPeriod(specialPeriods, ps, day)) return;
            allTeachingSlots.push({ dayKey: day, periodSetting: ps, slotId: `${day}-${idx}` });
        });
    });

    // ── 2. Initialise timetable + batchUpdates from locked courses ────────────
    const schoolTimetable: EngineSchedule = {};
    const batchUpdates: EngineBatchUpdates = {};

    for (const docId in lockedCoursesMap) {
        batchUpdates[docId] = {};
        const { resolveScheduleTeacherId } = require('../../scheduleSharedUtils');
        const meta = scheduleDocMeta[docId] || {};
        const teacherId = resolveScheduleTeacherId(docId, meta.teacherId, knownTeacherIds);

        for (const slotId in lockedCoursesMap[docId]) {
            const coursesArr = Array.isArray(lockedCoursesMap[docId][slotId])
                ? lockedCoursesMap[docId][slotId]
                : [lockedCoursesMap[docId][slotId]].filter(Boolean);
            batchUpdates[docId][slotId] = coursesArr;

            coursesArr.forEach(lockedCourse => {
                const semStr = String(lockedCourse.semester || '0');
                const correctSem = semStr === '0' || semStr === targetSem || semStr.startsWith(targetSem + '/') || targetSem.startsWith(semStr + '/');
                if (!correctSem) return;

                if (!schoolTimetable[slotId]) schoolTimetable[slotId] = [];
                const cleanTeacherId = teacherId || lockedCourse.teacherId || `GHOST_T_${lockedCourse.id}`;
                const classValue = lockedCourse.classId || meta.classId || `GHOST_C_${lockedCourse.id}`;
                const cleanClassIds = (Array.isArray(classValue) ? classValue : [classValue]).filter(Boolean) as string[];
                const existing = schoolTimetable[slotId].find(o => o.teacherId === cleanTeacherId && o.courseId === lockedCourse.id);
                if (existing) {
                    if (!Array.isArray(existing.classId)) existing.classId = [existing.classId].filter(Boolean) as string[];
                    cleanClassIds.forEach(c => { if (!(existing.classId as string[]).includes(c)) (existing.classId as string[]).push(c); });
                } else {
                    schoolTimetable[slotId].push({
                        teacherId: cleanTeacherId, classId: cleanClassIds,
                        room: lockedCourse.room || ['all'],
                        courseId: lockedCourse.id, course: lockedCourse,
                        groupNumber: Number(lockedCourse.groupNumber || 0),
                    });
                }
            });
        }
    }

    // ── 3. Filter courses for this semester ───────────────────────────────────
    const coursesForSemester = allCoursesData.filter(c => {
        if (c.isActive === false) return false;
        const semStr = String(c.semester || '0');
        const correctSem = semStr === '0' || semStr === targetSem || semStr.startsWith(targetSem + '/') || targetSem.startsWith(semStr + '/');
        if (!correctSem || !isAcademicCourse(c)) return false;
        if (!assignmentByCourseId.has(c.id) || !hasUsableAssignment(c)) return false;
        if (normalizedTargetTeacherId) {
            return c.teacherAssignments?.some(a => getAssignmentTeacherIds(a).includes(normalizedTargetTeacherId)) || false;
        }
        return true;
    });

    // ── 4. Ensure target doc keys exist in batchUpdates ──────────────────────
    coursesForSemester.forEach(c => {
        (c.teacherAssignments || []).forEach(assign => {
            const tIds = getAssignmentTeacherIds(assign);
            if (tIds.length === 0 || (normalizedTargetTeacherId && !tIds.includes(normalizedTargetTeacherId))) return;
            tIds.forEach(tid => {
                if (normalizedTargetTeacherId && tid !== normalizedTargetTeacherId) return;
                (assign.classLevels || []).filter(Boolean).forEach(classId => {
                    const docId = `${tid}_${classId}`;
                    if (!batchUpdates[docId]) batchUpdates[docId] = {};
                });
            });
        });
    });
    for (const docId in existingSchedulesMap) {
        if (!batchUpdates[docId]) batchUpdates[docId] = {};
    }

    // ── 5. Build engine tasks ─────────────────────────────────────────────────
    const tasks: EngineTask[] = [];
    const skippedCourseIssues: string[] = [];
    const dataReadinessWarnings: string[] = [];

    const normalizeLockedSlotId = (slot: string | { day: string; periodId: string }): string => {
        if (typeof slot === 'string') return slot;
        const idx = periodSettings.findIndex(p => p.id === slot.periodId);
        return idx >= 0 ? `${slot.day}-${idx}` : '';
    };

    coursesForSemester.forEach(course => {
        const validAssignments = (course.teacherAssignments || []).filter(a => {
            const tIds = getAssignmentTeacherIds(a);
            if (tIds.length === 0) return false;
            return tIds.every(tid => {
                const t = teachersMap[tid];
                return !t || !t.status || t.status === 'อยู่';
            });
        });
        if (validAssignments.length === 0) {
            skippedCourseIssues.push(`${course.code || '-'} ${course.title}: ยังไม่มีครูผู้สอนที่ถูกต้อง`);
            return;
        }

        validAssignments.forEach(assign => {
            const teacherIds = getAssignmentTeacherIds(assign);
            if (teacherIds.length === 0 || (normalizedTargetTeacherId && !teacherIds.includes(normalizedTargetTeacherId))) return;

            const tId = normalizedTargetTeacherId || teacherIds[0];
            const groupNumber = normalizeGroupNumber(assign.groupNumber);
            const compositeId = getAssignmentCompositeId(course.id, groupNumber);

            const baseClassIds = (assign.classLevels?.length ? assign.classLevels : (Array.isArray(course.classId) ? course.classId : (course.classId ? [course.classId] : []))).filter(Boolean);
            const groupRoom = assign.room;
            const classIds = baseClassIds.map((id: string) => (id.includes('/') || !groupRoom || groupRoom === 'all') ? id : `${id}/${groupRoom}`);

            if (classIds.length === 0) {
                skippedCourseIssues.push(`${course.code || '-'} ${course.title}: ยังไม่มีระดับชั้น/กลุ่มเรียน`);
                return;
            }

            const rooms = assign.roomIds?.length ? assign.roomIds : (course.room?.length ? course.room : ['all']);
            const hoursPerWeek = getRequiredWeeklyPeriods(course);
            const asgnCst = effectiveAssignmentConstraints[compositeId] || { type: 'any' };

            const lockedSlots = getLockedSlotsForAssignment(course.id, teacherIds, classIds, groupNumber, lockedCoursesMap, scheduleDocMeta, knownTeacherIds);
            const previousSlots = getPreviousSlotsForAssignment(existingSchedulesMap as never, course.id, teacherIds, classIds, groupNumber);

            // Trim excess locked slots
            if (normalizedTargetTeacherId && lockedSlots.size > hoursPerWeek) {
                const sorted = Array.from(lockedSlots).sort((a, b) => {
                    const [da, pa] = a.split('-'); const [db, pb] = b.split('-');
                    return da !== db ? da.localeCompare(db) : Number(pa) - Number(pb);
                });
                sorted.slice(hoursPerWeek).forEach(slotId => {
                    lockedSlots.delete(slotId);
                    removeExcessSlot(course.id, teacherIds, groupNumber, slotId, scheduleDocMeta, knownTeacherIds, schoolTimetable, batchUpdates);
                });
                dataReadinessWarnings.push(`${course.code || '-'} ${course.title}: พบคาบเดิมเกิน ${sorted.length}/${hoursPerWeek} ระบบตัดคาบส่วนเกินออก ${sorted.length - hoursPerWeek} คาบก่อนจัดใหม่`);
            }

            let needed = hoursPerWeek - lockedSlots.size;

            // Co-teaching carry-over
            if (normalizedTargetTeacherId && teacherIds.length > 1) {
                teacherIds.forEach(tid => coTeachingWriteTeacherIds.add(tid));
                lockedSlots.forEach(slotId => {
                    teacherIds.forEach(tid => {
                        classIds.forEach(classId => {
                            addCarryOverCourse(slotId, course, tid, teacherIds, classId, classIds, Array.isArray(rooms) ? rooms : [rooms], groupNumber, compositeId, schoolTimetable, batchUpdates);
                        });
                    });
                });
            }

            // Locked slot tasks
            if (asgnCst.isLocked && asgnCst.lockedSlots?.length) {
                const roomArray = Array.isArray(rooms) ? rooms : [rooms];
                const lockedSlotIds = Array.from(new Set(asgnCst.lockedSlots.map(normalizeLockedSlotId).filter(Boolean))).sort((a, b) => {
                    const [da, pa] = a.split('-'); const [db, pb] = b.split('-');
                    return da !== db ? da.localeCompare(db) : Number(pa) - Number(pb);
                });
                const consumed = new Set<string>();
                lockedSlotIds.forEach(slotId => {
                    if (consumed.has(slotId) || lockedSlots.has(slotId)) return;
                    const [dayKey, idxStr] = slotId.split('-');
                    const slotIndex = Number(idxStr);
                    const partnerIndex = getPartnerIndexForPeriods(slotIndex, periodSettings);
                    const partnerSlotId = partnerIndex !== -1 ? `${dayKey}-${partnerIndex}` : '';
                    const useDouble = isDoubleCapableConstraint(asgnCst) && partnerIndex > slotIndex && lockedSlotIds.includes(partnerSlotId) && !lockedSlots.has(partnerSlotId);
                    tasks.push(createEngineTask(course, tId, teacherIds, classIds, roomArray, groupNumber, useDouble ? 2 : 1, slotId));
                    consumed.add(slotId);
                    needed--;
                    if (useDouble) { consumed.add(partnerSlotId); needed--; }
                });
            }

            const remainingNeeded = Math.max(0, needed);
            if (remainingNeeded <= 0) return;

            const taskStartIndex = tasks.length;
            buildPreferredSessionDurations(course, remainingNeeded, asgnCst, hoursPerWeek).forEach(duration => {
                tasks.push(createEngineTask(course, tId, teacherIds, classIds, Array.isArray(rooms) ? rooms : [rooms], groupNumber, duration));
            });

            if (previousSlots.size > 0) {
                const prevArr = Array.from(previousSlots);
                for (let i = taskStartIndex; i < tasks.length; i++) {
                    tasks[i] = { ...tasks[i], previousSlots: prevArr };
                }
            }
        });
    });

    // ── 6. Capacity accounting ────────────────────────────────────────────────
    const tasksPerClass: Record<string, number> = {};
    const tasksPerTeacher: Record<string, number> = {};
    const tasksPerRoom: Record<string, number> = {};

    tasks.forEach(task => {
        task.targetClasses.forEach(c => { tasksPerClass[c] = (tasksPerClass[c] || 0) + task.duration; });
        getTaskTeacherIds(task).forEach(tid => { tasksPerTeacher[tid] = (tasksPerTeacher[tid] || 0) + task.duration; });
        task.targetRooms.filter(r => r && r.toLowerCase() !== 'all').forEach(r => { tasksPerRoom[r] = (tasksPerRoom[r] || 0) + task.duration; });
    });

    // ── 7. Build valid slot sets per task ─────────────────────────────────────
    const dynamicUnavailableSlotsSet = new Set(dynamicUnavailableSlots);
    const teacherPrefSets = new Map<string, { days: Set<string>; slots: Set<string> }>();
    for (const tid of Object.keys(teachersMap)) {
        const prefs = teachersMap[tid]?.preferences;
        teacherPrefSets.set(tid, { days: new Set(prefs?.unavailableDays || []), slots: new Set(prefs?.unavailableSlots || []) });
    }
    teacherPrefSets.set(selectedTeacher, {
        days: new Set(teachersMap[selectedTeacher]?.preferences?.unavailableDays || []),
        slots: dynamicUnavailableSlotsSet,
    });

    const relaxedConstraintCache = new Map<string, AssignmentConstraintMap>();
    const softRelaxedConstraintCache = new Map<string, AssignmentConstraintMap>();

    const getConstraintMapForTask = (task: EngineTask): AssignmentConstraintMap => {
        const constraint = effectiveAssignmentConstraints[task.compositeId];
        if (!constraint || !(task.requiredSlot || constraint.isLocked)) return effectiveAssignmentConstraints;
        const cacheKey = `${task.compositeId}:${task.requiredSlot ? 'required' : 'free'}`;
        if (!relaxedConstraintCache.has(cacheKey)) {
            relaxedConstraintCache.set(cacheKey, {
                ...effectiveAssignmentConstraints,
                [task.compositeId]: {
                    ...constraint, isLocked: false, lockedSlots: [],
                    ...(task.requiredSlot ? { doublePreference: 'any' as const, singlePreference: 'any' as const } : {}),
                },
            });
        }
        return relaxedConstraintCache.get(cacheKey)!;
    };

    const getSoftConstraintMapForTask = (task: EngineTask): AssignmentConstraintMap => {
        const base = getConstraintMapForTask(task);
        const constraint = base[task.compositeId];
        if (!constraint) return base;
        const cacheKey = `${task.compositeId}:${task.requiredSlot ? 'required' : 'free'}:soft`;
        if (!softRelaxedConstraintCache.has(cacheKey)) {
            softRelaxedConstraintCache.set(cacheKey, {
                ...base,
                [task.compositeId]: { ...constraint, singlePreference: 'any' as const, doublePreference: 'any' as const },
            });
        }
        return softRelaxedConstraintCache.get(cacheKey)!;
    };

    const validSlotsCache = new Map<EngineTask, Set<string>>();
    const relaxedValidSlotsCache = new Map<EngineTask, Set<string>>();

    tasks.forEach(task => {
        validSlotsCache.set(task, buildValidSlotsForTask(task, allTeachingSlots, periodSettings, specialPeriods, teachersMap, selectedTeacher, dynamicUnavailableSlots, teacherPrefSets, getConstraintMapForTask));
        relaxedValidSlotsCache.set(task, buildValidSlotsForTask(task, allTeachingSlots, periodSettings, specialPeriods, teachersMap, selectedTeacher, dynamicUnavailableSlots, teacherPrefSets, getSoftConstraintMapForTask));
    });

    // ── 8. Sort tasks: most constrained first ─────────────────────────────────
    tasks.sort((a, b) => {
        if (a.requiredSlot && !b.requiredSlot) return -1;
        if (!a.requiredSlot && b.requiredSlot) return 1;
        if (a.duration !== b.duration) return b.duration - a.duration;
        const asgnA = effectiveAssignmentConstraints[a.compositeId];
        const asgnB = effectiveAssignmentConstraints[b.compositeId];
        const prefA = a.duration >= 2 ? asgnA?.doublePreference : asgnA?.singlePreference;
        const prefB = b.duration >= 2 ? asgnB?.doublePreference : asgnB?.singlePreference;
        const hasPrefA = !!prefA && prefA !== 'any';
        const hasPrefB = !!prefB && prefB !== 'any';
        if (hasPrefA && !hasPrefB) return -1;
        if (!hasPrefA && hasPrefB) return 1;
        return (validSlotsCache.get(a)?.size || 999) - (validSlotsCache.get(b)?.size || 999);
    });

    dataReadinessWarnings.forEach(w => console.warn('Auto-schedule:', w));
    Object.entries(tasksPerClass).forEach(([cls, count]) => {
        if (count > 40) console.warn(`Class ${cls} has ${count} periods requested but only ~40 slots available!`);
    });

    return {
        schoolTimetable, batchUpdates, allTeachingSlots, tasks,
        skippedCourseIssues, dataReadinessWarnings, coursesForSemester,
        validSlotsByTaskIndex: tasks.map(t => Array.from(validSlotsCache.get(t) || [])),
        relaxedValidSlotsByTaskIndex: tasks.map(t => Array.from(relaxedValidSlotsCache.get(t) || [])),
        tasksPerClass, tasksPerTeacher, tasksPerRoom,
        totalPeriodsRequired: tasks.reduce((s, t) => s + t.duration, 0),
    };
};
