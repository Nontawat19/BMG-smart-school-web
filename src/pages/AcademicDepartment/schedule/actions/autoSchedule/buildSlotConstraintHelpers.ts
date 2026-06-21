import { AssignmentConstraintMap, CourseInstance, PeriodSetting, SpecialPeriod, Teacher } from '../../types';
import { EngineTask, EngineTeachingSlot } from '../../engine/schedulerEngine';
import { getTaskTeacherIds } from '../../scheduleSharedUtils';
import { checkConstraints, getPartnerIndexForPeriods } from '../../utils';

export interface SlotConstraintConfig {
    effectiveAssignmentConstraints: AssignmentConstraintMap;
    teachersMap: Record<string, Teacher>;
    periodSettings: PeriodSetting[];
    specialPeriods: SpecialPeriod[];
    dynamicUnavailableSlots: string[];
    selectedTeacher: string;
    allTeachingSlots: EngineTeachingSlot[];
}

export interface SlotConstraintHelpers {
    getConstraintMapForTask: (task: EngineTask) => AssignmentConstraintMap;
    getSoftConstraintMapForTask: (task: EngineTask) => AssignmentConstraintMap;
    buildValidSlotsForTask: (task: EngineTask, getMap: (t: EngineTask) => AssignmentConstraintMap) => Set<string>;
    teacherPrefSets: Map<string, { days: Set<string>; slots: Set<string> }>;
}

/**
 * Factory that creates memoized constraint helpers for the scheduling session.
 * Encapsulates constraint relaxation caches and teacher availability lookups.
 */
export const createSlotConstraintHelpers = (config: SlotConstraintConfig): SlotConstraintHelpers => {
    const {
        effectiveAssignmentConstraints,
        teachersMap,
        periodSettings,
        specialPeriods,
        dynamicUnavailableSlots,
        selectedTeacher,
        allTeachingSlots,
    } = config;

    const relaxedConstraintCache = new Map<string, AssignmentConstraintMap>();
    const softRelaxedConstraintCache = new Map<string, AssignmentConstraintMap>();

    const getConstraintMapForTask = (targetTask: EngineTask): AssignmentConstraintMap => {
        const constraint = effectiveAssignmentConstraints[targetTask.compositeId];
        const shouldRelax = targetTask.requiredSlot || constraint?.isLocked;
        if (!constraint || !shouldRelax) return effectiveAssignmentConstraints;

        const cacheKey = `${targetTask.compositeId}:${targetTask.requiredSlot ? 'required' : 'free'}`;
        if (!relaxedConstraintCache.has(cacheKey)) {
            relaxedConstraintCache.set(cacheKey, {
                ...effectiveAssignmentConstraints,
                [targetTask.compositeId]: {
                    ...constraint,
                    isLocked: false,
                    lockedSlots: [],
                    ...(targetTask.requiredSlot ? {
                        doublePreference: 'any' as const,
                        singlePreference: 'any' as const,
                    } : {}),
                },
            });
        }
        return relaxedConstraintCache.get(cacheKey)!;
    };

    const getSoftConstraintMapForTask = (targetTask: EngineTask): AssignmentConstraintMap => {
        const baseMap = getConstraintMapForTask(targetTask);
        const constraint = baseMap[targetTask.compositeId];
        if (!constraint) return baseMap;

        const cacheKey = `${targetTask.compositeId}:${targetTask.requiredSlot ? 'required' : 'free'}:soft`;
        if (!softRelaxedConstraintCache.has(cacheKey)) {
            softRelaxedConstraintCache.set(cacheKey, {
                ...baseMap,
                [targetTask.compositeId]: {
                    ...constraint,
                    singlePreference: 'any' as const,
                    doublePreference: 'any' as const,
                },
            });
        }
        return softRelaxedConstraintCache.get(cacheKey)!;
    };

    // Pre-build O(1) Sets for teacher unavailability lookups
    const dynamicUnavailableSlotsSet = new Set(dynamicUnavailableSlots);
    const teacherPrefSets = new Map<string, { days: Set<string>; slots: Set<string> }>();
    for (const tid of Object.keys(teachersMap)) {
        const prefs = teachersMap[tid]?.preferences;
        teacherPrefSets.set(tid, {
            days: new Set(prefs?.unavailableDays || []),
            slots: new Set(prefs?.unavailableSlots || []),
        });
    }
    // Merge dynamic UI slots for the selected teacher
    teacherPrefSets.set(selectedTeacher, {
        days: new Set(teachersMap[selectedTeacher]?.preferences?.unavailableDays || []),
        slots: dynamicUnavailableSlotsSet,
    });

    const buildValidSlotsForTask = (
        task: EngineTask,
        getMap: (targetTask: EngineTask) => AssignmentConstraintMap
    ): Set<string> => {
        const validSlots = new Set<string>();
        const taskTeacherIds = getTaskTeacherIds(task);
        const teacher = teachersMap[task.teacherId] as Teacher | undefined;
        const teacherUnavSlots = task.teacherId === selectedTeacher
            ? dynamicUnavailableSlots
            : (teacher?.preferences?.unavailableSlots || []);

        for (const slotInfo of allTeachingSlots) {
            const { slotId, dayKey, periodSetting } = slotInfo;
            const constraintMap = getMap(task);
            const isExplicitlyLocked = !!task.requiredSlot;

            const { forbidden: hardForbidden } = checkConstraints(
                { ...task.course, compositeId: task.compositeId, classId: task.targetClasses } as CourseInstance,
                slotId,
                teacher,
                periodSettings,
                specialPeriods,
                constraintMap,
                teacherUnavSlots,
                {},
                task.duration,
                [],
                isExplicitlyLocked
            );
            if (hardForbidden) continue;

            const coTeacherUnavailable = !isExplicitlyLocked && taskTeacherIds.some(teacherId => {
                const prefs = teacherPrefSets.get(teacherId);
                return prefs?.days.has(dayKey) || prefs?.slots.has(slotId);
            });
            if (coTeacherUnavailable) continue;
            if (task.requiredSlot && slotId !== task.requiredSlot) continue;

            if (task.duration > 1) {
                const pIdx = periodSettings.indexOf(periodSetting as PeriodSetting);
                const partnerIdx = getPartnerIndexForPeriods(pIdx, periodSettings);
                if (partnerIdx === -1 || partnerIdx <= pIdx) continue;

                let blockValid = true;
                for (let d = 1; d < task.duration; d++) {
                    const nextIndex = d === 1 ? partnerIdx : pIdx + d;
                    const nextSlotId = `${dayKey}-${nextIndex}`;

                    const { forbidden: nextForbidden } = checkConstraints(
                        { ...task.course, compositeId: task.compositeId, classId: task.targetClasses } as CourseInstance,
                        nextSlotId,
                        teacher,
                        periodSettings,
                        specialPeriods,
                        constraintMap,
                        teacherUnavSlots,
                        {},
                        1,
                        [],
                        isExplicitlyLocked
                    );
                    const coNext = !isExplicitlyLocked && taskTeacherIds.some(tid => {
                        const p = teacherPrefSets.get(tid);
                        return p?.days.has(dayKey) || p?.slots.has(nextSlotId);
                    });
                    if (nextForbidden || coNext) { blockValid = false; break; }
                }
                if (blockValid) validSlots.add(slotId);
            } else {
                validSlots.add(slotId);
            }
        }
        return validSlots;
    };

    return { getConstraintMapForTask, getSoftConstraintMapForTask, buildValidSlotsForTask, teacherPrefSets };
};
