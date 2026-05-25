import { AssignmentConstraintMap, Course } from '../types';
import { getRequiredWeeklyPeriods } from '../utils';

export type TimetableOccupancy = {
    teacherId: string;
    teacherIds?: string[];
    classId: string | string[];
    room: string[];
    courseId: string;
    course: Course | null;
    taskId?: number;
    groupNumber: number;
};

export type EngineSchedule = Record<string, TimetableOccupancy[]>;
export type EngineBatchUpdates = Record<string, Record<string, any[]>>;

export type EngineTeachingSlot = {
    dayKey: string;
    periodSetting: {
        id: string;
        label: string;
        startTime: string;
        endTime: string;
        isTeachingPeriod: boolean;
    };
    slotId: string;
};

export type EngineTask = {
    course: Course;
    teacherId: string;
    teacherIds?: string[];
    targetClasses: string[];
    targetRooms: string[];
    instanceCount: number;
    duration: number;
    originalCourseId: string;
    compositeId: string;
    groupNumber: number;
    requiredSlot?: string;
};

type RuntimeConflictIndex = {
    teacherSlots: Map<string, Set<string>>;
    classSlots: Map<string, Map<string, Set<number>>>; // classId -> slotId -> Set of groupNumbers (0 = all groups)
    roomSlots: Map<string, Set<string>>;
    teacherDayLoad: Map<string, number>;
    classDayLoad: Map<string, number>;
    roomDayLoad: Map<string, number>;
    classCourseDayCount: Map<string, number>;
    teacherClassCourseDayCount: Map<string, number>;
    classCourseSlots: Map<string, { periodIdx: number; groupNumber: number }[]>; // key: classId|courseId|dayKey
    teacherDailySchedule: Map<string, number[]>; // key: teacherId|dayKey, value: sorted array of period indices
    classDailySchedule: Map<string, number[]>; // key: classId|dayKey, value: sorted array of period indices
    teacherPeriodLoad: Map<string, number>;
    classPeriodLoad: Map<string, number>;
    processedPlacements: Map<string, Set<string>>;
};

export type SchedulingEngineInput = {
    tasks: EngineTask[];
    initialTimetable: EngineSchedule;
    initialBatchUpdates: EngineBatchUpdates;
    allTeachingSlots: EngineTeachingSlot[];
    validSlotsByTaskIndex: string[][];
    relaxedValidSlotsByTaskIndex?: string[][];
    assignmentConstraints: AssignmentConstraintMap;
    maxRuns: number;
    maxRepairAttempts?: number;
};

export type SchedulingEngineProgress = {
    percentage: number;
    message: string;
};

export type SchedulingEngineResult = {
    schoolTimetableRecord: EngineSchedule;
    batchUpdates: EngineBatchUpdates;
    unplacedTasks: EngineTask[];
    placedPeriods: number;
};

const clone = <T,>(value: T): T => JSON.parse(JSON.stringify(value));

const getSubjectCategory = (course: Course): 'ACADEMIC' | 'ACTIVITY' | 'GENERAL' => {
    if (course.subjectGroup === 'ACADEMIC' || course.subjectGroup === 'ACTIVITY' || course.subjectGroup === 'GENERAL') {
        return course.subjectGroup as 'ACADEMIC' | 'ACTIVITY' | 'GENERAL';
    }
    const lowerTitle = (course.title || '').toLowerCase();
    const academicKeywords = ['คณิต', 'วิทย์', 'วิทยาศาสตร์', 'ฟิสิกส์', 'เคมี', 'ชีวะ', 'ชีววิทยา', 'ไทย', 'ภาษาไทย', 'อังกฤษ', 'สังคม', 'ประวัติ', 'ภูมิศาสตร์', 'ศาสนา', 'math', 'science', 'physics', 'chem', 'bio', 'eng'];
    const activityKeywords = ['พละ', 'สุขศึกษา', 'ศิลปะ', 'ดนตรี', 'นาฏศิลป์', 'การงาน', 'อาชีพ', 'แนะแนว', 'ลูกเสือ', 'เนตรนารี', 'ยุวกาชาด', 'ชุมนุม', 'pe', 'art', 'music', 'guidance', 'scout', 'club'];
    if (academicKeywords.some(k => lowerTitle.includes(k))) return 'ACADEMIC';
    if (activityKeywords.some(k => lowerTitle.includes(k))) return 'ACTIVITY';
    return 'GENERAL';
};

const createRuntimeConflictIndex = (): RuntimeConflictIndex => ({
    teacherSlots: new Map(),
    classSlots: new Map(),
    roomSlots: new Map(),
    teacherDayLoad: new Map(),
    classDayLoad: new Map(),
    roomDayLoad: new Map(),
    classCourseDayCount: new Map(),
    teacherClassCourseDayCount: new Map(),
    classCourseSlots: new Map(),
    teacherDailySchedule: new Map(),
    classDailySchedule: new Map(),
    teacherPeriodLoad: new Map(),
    classPeriodLoad: new Map(),
    processedPlacements: new Map()
});

const addSetValue = (map: Map<string, Set<string>>, key: string, value: string) => {
    if (!map.has(key)) map.set(key, new Set());
    map.get(key)!.add(value);
};

const deleteSetValue = (map: Map<string, Set<string>>, key: string, value: string) => {
    const set = map.get(key);
    if (!set) return;
    set.delete(value);
    if (set.size === 0) map.delete(key);
};

const normalizeClassIds = (classId: string | string[] | undefined) => {
    return (Array.isArray(classId) ? classId : [classId]).filter(Boolean) as string[];
};

const normalizeSpecificRooms = (rooms: string[] | undefined) => {
    return (rooms || []).filter(room => room && room.toLowerCase() !== 'all');
};

const getTaskTeacherIds = (task: Pick<EngineTask, 'teacherId' | 'teacherIds'>) => (
    Array.from(new Set((task.teacherIds && task.teacherIds.length > 0 ? task.teacherIds : [task.teacherId]).filter(Boolean)))
);

const addOccupancyToIndex = (index: RuntimeConflictIndex, slotId: string, occupancy: TimetableOccupancy) => {
    const [dayKey, pStr] = slotId.split('-');
    const periodIdx = parseInt(pStr);
    
    addSetValue(index.teacherSlots, occupancy.teacherId, slotId);
    const teacherDayKey = `${occupancy.teacherId}|${dayKey}`;
    index.teacherDayLoad.set(teacherDayKey, (index.teacherDayLoad.get(teacherDayKey) || 0) + 1);
    const teacherPeriodKey = `${occupancy.teacherId}|${periodIdx}`;
    index.teacherPeriodLoad.set(teacherPeriodKey, (index.teacherPeriodLoad.get(teacherPeriodKey) || 0) + 1);
    
    const daySched = index.teacherDailySchedule.get(teacherDayKey) || [];
    daySched.push(periodIdx);
    daySched.sort((a, b) => a - b);
    index.teacherDailySchedule.set(teacherDayKey, daySched);

    const placementKey = occupancy.taskId !== undefined 
        ? `task-${occupancy.taskId}` 
        : `course-${occupancy.courseId}-${occupancy.groupNumber}`;

    if (!index.processedPlacements.has(slotId)) {
        index.processedPlacements.set(slotId, new Set());
    }
    const slotPlacements = index.processedPlacements.get(slotId)!;

    if (!slotPlacements.has(placementKey)) {
        slotPlacements.add(placementKey);

        normalizeClassIds(occupancy.classId).forEach(classId => {
            const classDayKey = `${classId}|${dayKey}`;
            index.classDayLoad.set(classDayKey, (index.classDayLoad.get(classDayKey) || 0) + 1);
            const classPeriodKey = `${classId}|${periodIdx}`;
            index.classPeriodLoad.set(classPeriodKey, (index.classPeriodLoad.get(classPeriodKey) || 0) + 1);

            const classDaySched = index.classDailySchedule.get(classDayKey) || [];
            classDaySched.push(periodIdx);
            classDaySched.sort((a, b) => a - b);
            index.classDailySchedule.set(classDayKey, classDaySched);

            if (!index.classSlots.has(classId)) index.classSlots.set(classId, new Map());
            const slotMap = index.classSlots.get(classId)!;
            if (!slotMap.has(slotId)) slotMap.set(slotId, new Set());
            const gNum = (occupancy as any).groupNumber || 0;
            slotMap.get(slotId)!.add(gNum);

            const courseDayKey = `${classId}|${occupancy.courseId}|${dayKey}`;
            index.classCourseDayCount.set(courseDayKey, (index.classCourseDayCount.get(courseDayKey) || 0) + 1);

            if (!index.classCourseSlots.has(courseDayKey)) {
                index.classCourseSlots.set(courseDayKey, []);
            }
            index.classCourseSlots.get(courseDayKey)!.push({
                periodIdx,
                groupNumber: occupancy.groupNumber || 0
            });
        });

        normalizeSpecificRooms(occupancy.room).forEach(roomId => {
            addSetValue(index.roomSlots, roomId, slotId);
            const roomDayKey = `${roomId}|${dayKey}`;
            index.roomDayLoad.set(roomDayKey, (index.roomDayLoad.get(roomDayKey) || 0) + 1);
        });
    }

    normalizeClassIds(occupancy.classId).forEach(classId => {
        const teacherClassCourseDayKey = `${occupancy.teacherId}|${classId}|${occupancy.courseId}|${dayKey}`;
        index.teacherClassCourseDayCount.set(teacherClassCourseDayKey, (index.teacherClassCourseDayCount.get(teacherClassCourseDayKey) || 0) + 1);
    });
};

const removeOccupancyFromIndex = (index: RuntimeConflictIndex, slotId: string, occupancy: TimetableOccupancy) => {
    const [dayKey, pStr] = slotId.split('-');
    const periodIdx = parseInt(pStr);
    
    deleteSetValue(index.teacherSlots, occupancy.teacherId, slotId);

    const teacherDayKey = `${occupancy.teacherId}|${dayKey}`;
    const nextTeacherLoad = (index.teacherDayLoad.get(teacherDayKey) || 1) - 1;
    if (nextTeacherLoad <= 0) index.teacherDayLoad.delete(teacherDayKey);
    else index.teacherDayLoad.set(teacherDayKey, nextTeacherLoad);

    const teacherPeriodKey = `${occupancy.teacherId}|${periodIdx}`;
    const nextTeacherPeriodLoad = (index.teacherPeriodLoad.get(teacherPeriodKey) || 1) - 1;
    if (nextTeacherPeriodLoad <= 0) index.teacherPeriodLoad.delete(teacherPeriodKey);
    else index.teacherPeriodLoad.set(teacherPeriodKey, nextTeacherPeriodLoad);

    const daySched = index.teacherDailySchedule.get(teacherDayKey);
    if (daySched) {
        const idx = daySched.indexOf(periodIdx);
        if (idx !== -1) daySched.splice(idx, 1);
        if (daySched.length === 0) index.teacherDailySchedule.delete(teacherDayKey);
    }

    const placementKey = occupancy.taskId !== undefined 
        ? `task-${occupancy.taskId}` 
        : `course-${occupancy.courseId}-${occupancy.groupNumber}`;

    const slotPlacements = index.processedPlacements.get(slotId);

    if (slotPlacements && slotPlacements.has(placementKey)) {
        slotPlacements.delete(placementKey);
        if (slotPlacements.size === 0) {
            index.processedPlacements.delete(slotId);
        }

        normalizeClassIds(occupancy.classId).forEach(classId => {
            const classDayKey = `${classId}|${dayKey}`;
            const nextClassLoad = (index.classDayLoad.get(classDayKey) || 1) - 1;
            if (nextClassLoad <= 0) index.classDayLoad.delete(classDayKey);
            else index.classDayLoad.set(classDayKey, nextClassLoad);

            const classPeriodKey = `${classId}|${periodIdx}`;
            const nextClassPeriodLoad = (index.classPeriodLoad.get(classPeriodKey) || 1) - 1;
            if (nextClassPeriodLoad <= 0) index.classPeriodLoad.delete(classPeriodKey);
            else index.classPeriodLoad.set(classPeriodKey, nextClassPeriodLoad);

            const classDaySched = index.classDailySchedule.get(classDayKey);
            if (classDaySched) {
                const idx = classDaySched.indexOf(periodIdx);
                if (idx !== -1) classDaySched.splice(idx, 1);
                if (classDaySched.length === 0) index.classDailySchedule.delete(classDayKey);
            }

            const slotMap = index.classSlots.get(classId);
            if (slotMap) {
                const groupSet = slotMap.get(slotId);
                if (groupSet) {
                    const gNum = (occupancy as any).groupNumber || 0;
                    groupSet.delete(gNum);
                    if (groupSet.size === 0) slotMap.delete(slotId);
                }
                if (slotMap.size === 0) index.classSlots.delete(classId);
            }

            const courseDayKey = `${classId}|${occupancy.courseId}|${dayKey}`;
            const nextCount = (index.classCourseDayCount.get(courseDayKey) || 1) - 1;
            if (nextCount <= 0) index.classCourseDayCount.delete(courseDayKey);
            else index.classCourseDayCount.set(courseDayKey, nextCount);

            const courseSlots = index.classCourseSlots.get(courseDayKey);
            if (courseSlots) {
                const idx = courseSlots.findIndex(s => s.periodIdx === periodIdx && s.groupNumber === (occupancy.groupNumber || 0));
                if (idx !== -1) courseSlots.splice(idx, 1);
                if (courseSlots.length === 0) index.classCourseSlots.delete(courseDayKey);
            }
        });

        normalizeSpecificRooms(occupancy.room).forEach(roomId => {
            deleteSetValue(index.roomSlots, roomId, slotId);
            const roomDayKey = `${roomId}|${dayKey}`;
            const nextRoomLoad = (index.roomDayLoad.get(roomDayKey) || 1) - 1;
            if (nextRoomLoad <= 0) index.roomDayLoad.delete(roomDayKey);
            else index.roomDayLoad.set(roomDayKey, nextRoomLoad);
        });
    }

    normalizeClassIds(occupancy.classId).forEach(classId => {
        const teacherClassCourseDayKey = `${occupancy.teacherId}|${classId}|${occupancy.courseId}|${dayKey}`;
        const nextTeacherClassCount = (index.teacherClassCourseDayCount.get(teacherClassCourseDayKey) || 1) - 1;
        if (nextTeacherClassCount <= 0) index.teacherClassCourseDayCount.delete(teacherClassCourseDayKey);
        else index.teacherClassCourseDayCount.set(teacherClassCourseDayKey, nextTeacherClassCount);
    });
};

const buildRuntimeConflictIndex = (timetable: EngineSchedule) => {
    const index = createRuntimeConflictIndex();
    Object.entries(timetable).forEach(([slotId, occupancies]) => {
        occupancies.forEach(occupancy => addOccupancyToIndex(index, slotId, occupancy));
    });
    return index;
};

const hasSlot = (map: Map<string, Set<string>>, key: string, slotId: string) => {
    return map.get(key)?.has(slotId) || false;
};

const hasClassConflict = (index: RuntimeConflictIndex, classId: string, slotId: string, groupNumber: number) => {
    const slotMap = index.classSlots.get(classId);
    if (!slotMap) return false;
    const occupiedGroups = slotMap.get(slotId);
    if (!occupiedGroups) return false;

    // If already occupied by 'all groups' (0), any new group conflicts
    if (occupiedGroups.has(0)) return true;
    // If new task is 'all groups' (0), and slot is occupied by ANY group, conflict
    if (groupNumber === 0 && occupiedGroups.size > 0) return true;
    // Otherwise, only conflict if the SAME group number is already there
    return occupiedGroups.has(groupNumber);
};

const countGaps = (periods: number[]) => {
    if (periods.length <= 1) return 0;
    const sorted = [...periods].sort((a, b) => a - b);
    let gaps = 0;
    for (let i = 0; i < sorted.length - 1; i++) {
        const gap = sorted[i + 1] - sorted[i] - 1;
        if (gap > 0) gaps += gap;
    }
    return gaps;
};

const getMaxConsecutive = (periods: number[]) => {
    if (periods.length === 0) return 0;
    const sorted = [...periods].sort((a, b) => a - b);
    let max = 1;
    let current = 1;
    for (let i = 1; i < sorted.length; i++) {
        if (sorted[i] === sorted[i - 1] + 1) {
            current++;
            max = Math.max(max, current);
        } else {
            current = 1;
        }
    }
    return max;
};

const getBalancePenalty = (loadsByDay: number[]) => {
    if (loadsByDay.length <= 1) return 0;
    const total = loadsByDay.reduce((sum, load) => sum + load, 0);
    const average = total / loadsByDay.length;
    return loadsByDay.reduce((penalty, load) => penalty + Math.pow(load - average, 2), 0);
};

const getPeriodLoad = (map: Map<string, number>, ownerIds: string[], periodIndex: number, duration: number) => {
    let maxLoad = 0;
    ownerIds.forEach(ownerId => {
        for (let offset = 0; offset < duration; offset++) {
            maxLoad = Math.max(maxLoad, map.get(`${ownerId}|${periodIndex + offset}`) || 0);
        }
    });
    return maxLoad;
};

const getTaskPriority = (task: EngineTask) => {
    if (task.requiredSlot) return 0;
    if (task.duration > 1) return 1;
    return 2;
};

const getTaskPressureKey = (task: EngineTask) => `${getTaskTeacherIds(task).join('+')}|${task.compositeId}|${task.targetClasses.join(',')}`;

const buildTaskPressureMap = (tasks: EngineTask[]) => {
    const pressure = new Map<string, number>();
    tasks.forEach(task => {
        const key = getTaskPressureKey(task);
        pressure.set(key, (pressure.get(key) || 0) + task.duration);
    });
    return pressure;
};

const orderTasksForRun = (
    tasks: EngineTask[],
    validSlotsByTaskIndex: string[][],
    run: number,
    pressureByTaskKey: Map<string, number>
) => {
    const taskIndexByRef = new Map<EngineTask, number>();
    tasks.forEach((task, index) => taskIndexByRef.set(task, index));

    return [...tasks].sort((a, b) => {
        const priorityDelta = getTaskPriority(a) - getTaskPriority(b);
        if (priorityDelta !== 0) return priorityDelta;

        const aIndex = taskIndexByRef.get(a) ?? 0;
        const bIndex = taskIndexByRef.get(b) ?? 0;
        const validDelta = (validSlotsByTaskIndex[aIndex]?.length || 0) - (validSlotsByTaskIndex[bIndex]?.length || 0);
        if (validDelta !== 0) return validDelta;

        const durationDelta = b.duration - a.duration;
        if (durationDelta !== 0) return durationDelta;

        const pressureDelta = (pressureByTaskKey.get(getTaskPressureKey(b)) || 0) - (pressureByTaskKey.get(getTaskPressureKey(a)) || 0);
        if (pressureDelta !== 0) return pressureDelta;

        const classDelta = b.targetClasses.length - a.targetClasses.length;
        if (classDelta !== 0) return classDelta;

        // Keep each run able to explore tie cases without losing the constrained-first ordering.
        return Math.sin((aIndex + 1) * (run + 17)) - Math.sin((bIndex + 1) * (run + 17));
    });
};

const canPlaceWithIndex = (task: EngineTask, sessionSlots: string[], index: RuntimeConflictIndex) => {
    const requestedRooms = normalizeSpecificRooms(task.targetRooms);
    const teacherIds = getTaskTeacherIds(task);
    const isDoubleSession = task.duration > 1;
    const allowSameDaySingleRepeat = task.duration === 1 && getRequiredWeeklyPeriods(task.course) > 6;

    for (const slotId of sessionSlots) {
        if (teacherIds.some(teacherId => hasSlot(index.teacherSlots, teacherId, slotId))) return false;
        if (task.targetClasses.some(classId => hasClassConflict(index, classId, slotId, task.groupNumber))) return false;
        if (requestedRooms.some(roomId => hasSlot(index.roomSlots, roomId, slotId))) return false;
    }

    if (task.requiredSlot) return true;

    if (sessionSlots.length > 0) {
        const [dayKey] = sessionSlots[0].split('-');
        const newPeriods = sessionSlots.map(s => parseInt(s.split('-')[1]));
        const currentGroup = task.groupNumber || 0;

        for (const classId of task.targetClasses) {
            if (!isDoubleSession && !allowSameDaySingleRepeat) {
                const alreadySameTeacherClassDay = teacherIds.some(teacherId =>
                    (index.teacherClassCourseDayCount.get(`${teacherId}|${classId}|${task.course.id}|${dayKey}`) || 0) > 0
                );
                if (alreadySameTeacherClassDay) {
                    return false;
                }
            }

            const courseDayKey = `${classId}|${task.course.id}|${dayKey}`;
            const existingSlots = index.classCourseSlots?.get(courseDayKey) || [];

            // Filter to those that share the same students:
            // either same group, or one of them is 0 (whole class)
            const relevantPeriods = existingSlots
                .filter(s => s.groupNumber === currentGroup || s.groupNumber === 0 || currentGroup === 0)
                .map(s => s.periodIdx);

            const combinedPeriods = Array.from(new Set([...relevantPeriods, ...newPeriods])).sort((a, b) => a - b);

            let maxConsecutive = 0;
            if (combinedPeriods.length > 0) {
                let currentConsecutive = 1;
                maxConsecutive = 1;
                for (let i = 1; i < combinedPeriods.length; i++) {
                    if (combinedPeriods[i] === combinedPeriods[i - 1] + 1) {
                        currentConsecutive++;
                        maxConsecutive = Math.max(maxConsecutive, currentConsecutive);
                    } else {
                        currentConsecutive = 1;
                    }
                }
            }

            if (maxConsecutive >= 3) {
                return false;
            }
        }
    }

    return true;
};

const getWeightedSlots = (
    task: EngineTask,
    slots: EngineTeachingSlot[],
    validSlots: Set<string>,
    validSlotsByTaskIndex: string[][],
    taskIndex: number,
    assignmentConstraints: AssignmentConstraintMap,
    ignorePrefs: boolean,
    conflictIndex: RuntimeConflictIndex,
    allTasks: EngineTask[]
) => {
    const category = getSubjectCategory(task.course);
    const availableSlots = slots.filter(slot => validSlots.has(slot.slotId));

    // Calculate total periods for this specific assignment across all tasks
    const taskTeacherKey = getTaskTeacherIds(task).join('+');
    const sameAssignmentTasks = allTasks.filter(t => t.compositeId === task.compositeId && getTaskTeacherIds(t).join('+') === taskTeacherKey);
    const totalPeriodsForAssignment = sameAssignmentTasks.reduce((sum, t) => sum + t.duration, 0);
    const expectedWeeklyPeriods = Math.max(totalPeriodsForAssignment, getRequiredWeeklyPeriods(task.course));
    const canRepeatOnSomeDays = expectedWeeklyPeriods >= 5;
    const maxPeriodsPerDayForAssignment = canRepeatOnSomeDays ? 2 : 1;
    const getMaxSubjectCountForDay = (dayKey: string) => {
        let maxSubjectInDay = 0;
        task.targetClasses.forEach(classId => {
            const courseDayKey = `${classId}|${task.course.id}|${dayKey}`;
            const count = conflictIndex.classCourseDayCount.get(courseDayKey) || 0;
            if (count > maxSubjectInDay) maxSubjectInDay = count;
        });
        return maxSubjectInDay;
    };

    const scoredSlots = availableSlots.filter(slot => {
        if (task.duration <= 1) return true;
        const { dayKey } = slot;
        const slotIndex = parseInt(slot.slotId.split('-')[1]);
        const nextSlotId = `${dayKey}-${slotIndex + 1}`;
        const nextSlotInfo = slots.find(s => s.slotId === nextSlotId);
        return Boolean(nextSlotInfo?.periodSetting.isTeachingPeriod);
    }).filter(slot => {
        if (task.requiredSlot) return true;
        if (ignorePrefs) return true;
        const currentSubjectCount = getMaxSubjectCountForDay(slot.dayKey);
        return currentSubjectCount + task.duration <= maxPeriodsPerDayForAssignment;
    }).map(slot => {
        let score = 500; 
        const { dayKey, periodSetting } = slot;
        const pIdx = parseInt(slot.slotId.split('-')[1]);
        
        const periodNumber = parseInt(periodSetting.id.replace('period-', '')) || 0;
        const lunchIdx = slots.findIndex(s => s.periodSetting.id === 'lunch');
        const isMorning = lunchIdx !== -1 ? pIdx < lunchIdx : periodNumber <= 4;
        const asgnCst = assignmentConstraints[task.compositeId];

        // 1. Mandatory / Preferences Logic
        if (!ignorePrefs) {
            if (asgnCst) {
                const pref = task.duration >= 2 ? asgnCst.doublePreference : asgnCst.singlePreference;
                if (pref === 'morning' && isMorning) score += 2000;
                else if (pref === 'afternoon' && !isMorning) score += 2000;
                else if (pref && pref !== 'any') score -= 500; 
            } else {
                if (category === 'ACADEMIC' && isMorning) score += 300;
                else if (category === 'ACTIVITY' && !isMorning) score += 300;
            }
        }

        // 2. Teacher Load & Balancing (Spread workload across the week)
        const teacherIds = getTaskTeacherIds(task);
        const primaryTeacherDayKey = `${task.teacherId}|${dayKey}`;
        const currentLoad = Math.max(...teacherIds.map(teacherId => conflictIndex.teacherDayLoad.get(`${teacherId}|${dayKey}`) || 0));
        
        // Dynamic penalty for load imbalance
        if (currentLoad >= 6) score -= 800; // Increased penalty for heavy days
        else if (currentLoad >= 4) score -= 200;
        else if (currentLoad <= 2) score += 300; // Bonus for light days

        let maxClassLoadForDay = 0;
        task.targetClasses.forEach(classId => {
            const classDayLoad = conflictIndex.classDayLoad.get(`${classId}|${dayKey}`) || 0;
            if (classDayLoad > maxClassLoadForDay) maxClassLoadForDay = classDayLoad;
        });
        if (maxClassLoadForDay >= 7) score -= 1200;
        else if (maxClassLoadForDay >= 6) score -= 700;
        else if (maxClassLoadForDay >= 5) score -= 300;
        else if (maxClassLoadForDay <= 3) score += 250;

        const daySched = conflictIndex.teacherDailySchedule.get(primaryTeacherDayKey) || [];
        let maxClassGapsAfterPlacement = 0;
        let maxClassConsecutiveAfterPlacement = 0;
        task.targetClasses.forEach(classId => {
            const classDayKey = `${classId}|${dayKey}`;
            const classPeriods = conflictIndex.classDailySchedule.get(classDayKey) || [];
            const nextClassPeriods = [
                ...classPeriods,
                ...Array.from({ length: task.duration }, (_, offset) => pIdx + offset)
            ];
            maxClassGapsAfterPlacement = Math.max(maxClassGapsAfterPlacement, countGaps(nextClassPeriods));
            maxClassConsecutiveAfterPlacement = Math.max(maxClassConsecutiveAfterPlacement, getMaxConsecutive(nextClassPeriods));
        });
        score -= maxClassGapsAfterPlacement * 180;
        if (maxClassConsecutiveAfterPlacement > 6) score -= 800;
        else if (maxClassConsecutiveAfterPlacement > 5) score -= 400;

        const requestedRooms = normalizeSpecificRooms(task.targetRooms);
        if (requestedRooms.length > 0) {
            const maxRoomLoadForDay = Math.max(...requestedRooms.map(roomId => conflictIndex.roomDayLoad.get(`${roomId}|${dayKey}`) || 0));
            if (maxRoomLoadForDay >= 6) score -= 500;
            else if (maxRoomLoadForDay >= 4) score -= 200;
            else if (maxRoomLoadForDay <= 1) score += 150;
        }

        const classPeriodLoad = getPeriodLoad(conflictIndex.classPeriodLoad, task.targetClasses, pIdx, task.duration);
        const teacherPeriodLoad = getPeriodLoad(conflictIndex.teacherPeriodLoad, teacherIds, pIdx, task.duration);
        score -= classPeriodLoad * 260;
        score -= teacherPeriodLoad * 80;

        const teachingPeriodSlots = slots.filter(s => s.dayKey === dayKey && s.periodSetting.isTeachingPeriod);
        const lastMorningTeachingSlot = [...teachingPeriodSlots]
            .filter(s => {
                const idx = parseInt(s.slotId.split('-')[1]);
                return idx < lunchIdx;
            })
            .sort((a, b) => parseInt(b.slotId.split('-')[1]) - parseInt(a.slotId.split('-')[1]))[0];
        const isLastMorningPeriod = lastMorningTeachingSlot?.slotId === slot.slotId;
        if (isLastMorningPeriod && classPeriodLoad <= 1) {
            score += 260;
        }

        let consecutiveCount = 0;
        
        let i = pIdx - 1;
        while (daySched.includes(i)) {
            consecutiveCount++;
            i--;
        }
        i = pIdx + task.duration;
        while (daySched.includes(i)) {
            consecutiveCount++;
            i++;
        }
        
        const totalConsecutive = consecutiveCount + task.duration;
        if (totalConsecutive > 3) score -= 1500; 
        else if (totalConsecutive > 2) score -= 300;

        // 3. Gap Penalty
        const prevP = pIdx - 1;
        const nextP = pIdx + task.duration;
        const hasBefore = daySched.includes(prevP - 1); 
        const hasAfter = daySched.includes(nextP + 1);  
        
        if (hasBefore && !daySched.includes(prevP)) score -= 200; 
        if (hasAfter && !daySched.includes(nextP)) score -= 200;  

        // 4. Class Subject Spreading (Crucial for User Request)
        let maxSubjectInDay = 0;
        let hasMorning = false;
        let hasAfternoon = false;

        maxSubjectInDay = getMaxSubjectCountForDay(dayKey);

        if (maxSubjectInDay > 0) {
            // Strong penalty for repeating subject on same day
            // High-load subjects (5+ periods/week) may need one double day to fit cleanly.
            const dayRepeatPenalty = canRepeatOnSomeDays ? 1500 : 3000;
            score -= (maxSubjectInDay * dayRepeatPenalty);

            // Half-day balancing logic: If we MUST repeat, prefer the other half
            // We search the timetable for existing instances of this course for these classes on this day
            let existingInMorning = false;
            let existingInAfternoon = false;
            
            // Heuristic check using teacher's schedule (usually same since teacher + class are linked in tasks)
            daySched.forEach(idx => {
                const occs = conflictIndex.teacherSlots.get(task.teacherId); // Not quite right, need to check if it's the SAME course
                // For performance, we'll use a simpler check: if we already have one today, 
                // we just try to be in the other half regardless of where the first one was, 
                // assuming the first one took its preferred half.
                // Or better: we look at morning vs afternoon load for this class/course.
            });
            
            // Simple logic: if repeating, give a small nudge to the "other" half
            // (Morning courses prefer afternoon for 2nd period, and vice-versa)
            if (isMorning) score -= 200; 
            else score += 200;
        } else {
            // Bonus for spreading to a new day
            score += 1000;
        }

        // 5. Time Slot Specific
        if (category === 'ACADEMIC' && periodNumber <= 2) score += 100;

        score += Math.random() * 50; 
        return { slot, score };
    });

    scoredSlots.sort((a, b) => b.score - a.score);
    return scoredSlots.map(s => s.slot.slotId);
};

const evaluateScheduleQuality = (
    timetable: EngineSchedule,
    allTeachingSlots: EngineTeachingSlot[],
    unplacedCount: number,
    placedPeriods: number
) => {
    const index = buildRuntimeConflictIndex(timetable);
    const dayKeys = Array.from(new Set(allTeachingSlots.map(slot => slot.dayKey)));
    let score = placedPeriods * 10000 - unplacedCount * 1000000;

    const teacherIds = Array.from(new Set(Array.from(index.teacherDayLoad.keys()).map(key => key.split('|')[0])));
    const classIds = Array.from(new Set(Array.from(index.classDayLoad.keys()).map(key => key.split('|')[0])));
    const roomIds = Array.from(new Set(Array.from(index.roomDayLoad.keys()).map(key => key.split('|')[0])));

    teacherIds.forEach(teacherId => {
        const loads = dayKeys.map(dayKey => index.teacherDayLoad.get(`${teacherId}|${dayKey}`) || 0);
        score -= getBalancePenalty(loads) * 220;
    });

    classIds.forEach(classId => {
        const loads = dayKeys.map(dayKey => index.classDayLoad.get(`${classId}|${dayKey}`) || 0);
        score -= getBalancePenalty(loads) * 420;

        dayKeys.forEach(dayKey => {
            const periods = index.classDailySchedule.get(`${classId}|${dayKey}`) || [];
            score -= countGaps(periods) * 260;
            const maxConsecutive = getMaxConsecutive(periods);
            if (maxConsecutive > 6) score -= (maxConsecutive - 6) * 900;
        });
    });

    roomIds.forEach(roomId => {
        const loads = dayKeys.map(dayKey => index.roomDayLoad.get(`${roomId}|${dayKey}`) || 0);
        score -= getBalancePenalty(loads) * 120;
    });

    const classCourseDay = new Map<string, { count: number; course: Course | null }>();
    Object.entries(timetable).forEach(([slotId, occupancies]) => {
        const [dayKey] = slotId.split('-');
        const processedInSlot = new Set<string>();
        occupancies.forEach(occupancy => {
            const placementKey = occupancy.taskId !== undefined 
                ? `task-${occupancy.taskId}` 
                : `course-${occupancy.courseId}-${occupancy.groupNumber}`;
            if (processedInSlot.has(placementKey)) return;
            processedInSlot.add(placementKey);

            normalizeClassIds(occupancy.classId).forEach(classId => {
                const key = `${classId}|${occupancy.courseId}|${dayKey}`;
                const current = classCourseDay.get(key) || { count: 0, course: occupancy.course };
                classCourseDay.set(key, { count: current.count + 1, course: current.course || occupancy.course });
            });
        });
    });

    classCourseDay.forEach(({ count, course }) => {
        const expectedWeeklyPeriods = course ? getRequiredWeeklyPeriods(course) : 1;
        const maxPerDay = expectedWeeklyPeriods >= 5 ? 2 : 1;
        if (count > maxPerDay) score -= (count - maxPerDay) * 5000;
        else if (count === maxPerDay && expectedWeeklyPeriods > 5) score += 250;
    });

    return score;
};

export const runSchedulingEngine = (
    input: SchedulingEngineInput,
    onProgress?: (progress: SchedulingEngineProgress) => void
): SchedulingEngineResult => {
    const {
        tasks,
        initialTimetable,
        initialBatchUpdates,
        allTeachingSlots,
        validSlotsByTaskIndex,
        relaxedValidSlotsByTaskIndex,
        assignmentConstraints,
        maxRuns,
        maxRepairAttempts = 1000
    } = input;

    let bestSchoolTimetable: EngineSchedule = {};
    let bestBatchUpdates: EngineBatchUpdates = {};
    let minUnplacedCount = Infinity;
    let bestQualityScore = -Infinity;
    let finalUnplacedTasks: EngineTask[] = [];
    let totalPlacedPeriods = 0;

    const taskIndexByRef = new Map<EngineTask, number>();
    tasks.forEach((task, index) => taskIndexByRef.set(task, index));
    const pressureByTaskKey = buildTaskPressureMap(tasks);
    const emergencySlotPoolByTaskIndex = tasks.map((task, index) =>
        task.requiredSlot
            ? [task.requiredSlot]
            : (relaxedValidSlotsByTaskIndex?.[index]?.length ? relaxedValidSlotsByTaskIndex[index] : (validSlotsByTaskIndex[index] || []))
    );

    for (let run = 1; run <= maxRuns; run++) {
        const currentTimetable: EngineSchedule = clone(initialTimetable);
        const currentBatchUpdates: EngineBatchUpdates = clone(initialBatchUpdates);
        const currentConflictIndex = buildRuntimeConflictIndex(currentTimetable);
        const currentUnplacedTasks: EngineTask[] = [];
        let currentPlacedPeriods = 0;

        onProgress?.({
            percentage: 35 + (run / maxRuns) * 30,
            message: `กำลังประมวลผลรอบที่ ${run}/${maxRuns}... (ดีที่สุด: เหลือ ${minUnplacedCount === Infinity ? '?' : minUnplacedCount})`
        });

        const orderedTasks = orderTasksForRun(tasks, validSlotsByTaskIndex, run, pressureByTaskKey);

        const tryPlaceInRun = (
            task: EngineTask,
            ignorePrefs: boolean,
            timetable: EngineSchedule,
            updates: EngineBatchUpdates,
            conflictIndex: RuntimeConflictIndex,
            slotPoolByTaskIndex: string[][] = validSlotsByTaskIndex
        ) => {
            const taskIndex = taskIndexByRef.get(task) ?? tasks.indexOf(task);
            let potentialSlots = getWeightedSlots(
                task,
                allTeachingSlots,
                new Set(slotPoolByTaskIndex[taskIndex] || []),
                slotPoolByTaskIndex,
                taskIndex,
                assignmentConstraints,
                ignorePrefs,
                conflictIndex,
                tasks
            );

            if (task.requiredSlot) {
                potentialSlots = potentialSlots.filter(sId => sId === task.requiredSlot);
            }

            if (potentialSlots.length > 3) {
                const top = potentialSlots.slice(0, 3);
                const rest = potentialSlots.slice(3);
                for (let i = top.length - 1; i > 0; i--) {
                    const j = Math.floor(Math.random() * (i + 1));
                    [top[i], top[j]] = [top[j], top[i]];
                }
                potentialSlots = [...top, ...rest];
            }

            for (const startSlotId of potentialSlots) {
                const [dayKey, pStr] = startSlotId.split('-');
                const startPeriodNumber = parseInt(pStr);
                const sessionSlots = Array.from({ length: task.duration }, (_, i) => `${dayKey}-${startPeriodNumber + i}`);

                if (canPlaceWithIndex(task, sessionSlots, conflictIndex)) {
                    const teacherIds = getTaskTeacherIds(task);
                    sessionSlots.forEach(slotId => {
                        teacherIds.forEach(teacherId => {
                            const occupancy: TimetableOccupancy = {
                                teacherId,
                                teacherIds,
                                classId: task.targetClasses,
                                room: task.targetRooms,
                                courseId: task.course.id,
                                course: task.course,
                                taskId: taskIndex,
                                groupNumber: task.groupNumber
                            };
                            if (!timetable[slotId]) timetable[slotId] = [];
                            timetable[slotId].push(occupancy);
                            addOccupancyToIndex(conflictIndex, slotId, occupancy);

                            task.targetClasses.forEach(cId => {
                                const docId = `${teacherId}_${cId}`;
                                if (!updates[docId]) updates[docId] = {};
                                const items = updates[docId][slotId] || [];
                                updates[docId][slotId] = [
                                    ...(Array.isArray(items) ? items : [items]),
                                    {
                                        ...task.course,
                                        teacherId,
                                        teacherIds,
                                        classId: cId,
                                        room: task.targetRooms,
                                        groupNumber: task.groupNumber,
                                        compositeId: task.compositeId,
                                        taskId: taskIndex,
                                        instanceId: `${task.course.id}-${task.groupNumber}-${slotId}-${cId}-${teacherId}`
                                    }
                                ];
                            });
                        });
                    });
                    return true;
                }
            }
            return false;
        };

        for (const task of orderedTasks) {
            if (tryPlaceInRun(task, false, currentTimetable, currentBatchUpdates, currentConflictIndex)) {
                currentPlacedPeriods += task.duration;
            } else if (relaxedValidSlotsByTaskIndex && tryPlaceInRun(task, true, currentTimetable, currentBatchUpdates, currentConflictIndex, relaxedValidSlotsByTaskIndex)) {
                currentPlacedPeriods += task.duration;
            } else if (tryPlaceInRun(task, true, currentTimetable, currentBatchUpdates, currentConflictIndex, emergencySlotPoolByTaskIndex)) {
                currentPlacedPeriods += task.duration;
            } else {
                currentUnplacedTasks.push(task);
            }
        }

        if (currentUnplacedTasks.length > 0) {
            let repairCount = 0;

            while (currentUnplacedTasks.length > 0 && repairCount < maxRepairAttempts) {
                repairCount++;
                const task = currentUnplacedTasks.shift()!;
                const taskIndex = taskIndexByRef.get(task) ?? tasks.indexOf(task);
                let repaired = false;
                const repairSlotPool = emergencySlotPoolByTaskIndex;
                const potentialSlots = getWeightedSlots(
                    task,
                    allTeachingSlots,
                    new Set(repairSlotPool[taskIndex] || []),
                    repairSlotPool,
                    taskIndex,
                    assignmentConstraints,
                    true,
                    currentConflictIndex,
                    tasks
                );

                const repairSearchLimit = Math.min(
                    potentialSlots.length,
                    Math.max(30, Math.ceil(allTeachingSlots.length * 0.75))
                );

                for (const slotId of potentialSlots.slice(0, repairSearchLimit)) {
                    const [dayKey, pStr] = slotId.split('-');
                    const startP = parseInt(pStr);
                    const sessionSlots = Array.from({ length: task.duration }, (_, i) => `${dayKey}-${startP + i}`);

                    const blockers: TimetableOccupancy[] = [];
                    let fatalConflict = false;
                    const requestedRooms = normalizeSpecificRooms(task.targetRooms);

                    for (const sId of sessionSlots) {
                        const occs = currentTimetable[sId] || [];
                        const localBlockers = occs.filter(o => {
                            const occClasses = normalizeClassIds(o.classId);
                            const occRooms = normalizeSpecificRooms(o.room);
                            const occGNum = (o as any).groupNumber || 0;
                            
                            const taskTeacherIds = getTaskTeacherIds(task);
                            return taskTeacherIds.includes(o.teacherId) ||
                                task.targetClasses.some(c => {
                                    if (!occClasses.includes(c)) return false;
                                    // Split class logic for blockers
                                    if (occGNum === 0 || task.groupNumber === 0) return true;
                                    return occGNum === task.groupNumber;
                                }) ||
                                requestedRooms.some(roomId => occRooms.includes(roomId));
                        });
                        if (localBlockers.some(o => {
                            if (o.taskId === undefined) return true;
                            const t = tasks[o.taskId];
                            return Boolean(t?.requiredSlot);
                        })) {
                            fatalConflict = true;
                            break;
                        }
                        blockers.push(...localBlockers);
                    }

                    const uniqueBlockers = Array.from(new Map(blockers.map(b => [b.taskId, b])).values());

                    if (!fatalConflict && uniqueBlockers.length > 0 && uniqueBlockers.length <= 2) {
                        uniqueBlockers.forEach(b => {
                            if (b.taskId === undefined) return;
                            for (const sId in currentTimetable) {
                                const removed = currentTimetable[sId].filter(o => o.taskId === b.taskId);
                                removed.forEach(occupancy => removeOccupancyFromIndex(currentConflictIndex, sId, occupancy));
                                currentTimetable[sId] = currentTimetable[sId].filter(o => o.taskId !== b.taskId);
                            }
                            const bTask = tasks[b.taskId];
                            if (bTask) {
                                getTaskTeacherIds(bTask).forEach(teacherId => {
                                    bTask.targetClasses.forEach(cId => {
                                        const docId = `${teacherId}_${cId}`;
                                        if (currentBatchUpdates[docId]) {
                                            for (const sId in currentBatchUpdates[docId]) {
                                                const items = currentBatchUpdates[docId][sId] as any[];
                                                currentBatchUpdates[docId][sId] = items.filter(it => it.taskId !== b.taskId);
                                                if (currentBatchUpdates[docId][sId].length === 0) delete currentBatchUpdates[docId][sId];
                                            }
                                        }
                                    });
                                });
                                currentUnplacedTasks.push(bTask);
                                currentPlacedPeriods -= bTask.duration;
                            }
                        });

                        if (tryPlaceInRun(task, true, currentTimetable, currentBatchUpdates, currentConflictIndex, repairSlotPool)) {
                            currentPlacedPeriods += task.duration;
                            repaired = true;
                            break;
                        }
                    }
                }

                if (!repaired) {
                    currentUnplacedTasks.push(task);
                }
            }
        }

        const qualityScore = evaluateScheduleQuality(
            currentTimetable,
            allTeachingSlots,
            currentUnplacedTasks.length,
            currentPlacedPeriods
        );

        if (
            currentUnplacedTasks.length < minUnplacedCount ||
            (currentUnplacedTasks.length === minUnplacedCount && qualityScore > bestQualityScore)
        ) {
            minUnplacedCount = currentUnplacedTasks.length;
            bestQualityScore = qualityScore;
            bestSchoolTimetable = clone(currentTimetable);
            bestBatchUpdates = clone(currentBatchUpdates);
            finalUnplacedTasks = [...currentUnplacedTasks];
            totalPlacedPeriods = currentPlacedPeriods;
        }
    }

    return {
        schoolTimetableRecord: bestSchoolTimetable,
        batchUpdates: bestBatchUpdates,
        unplacedTasks: finalUnplacedTasks,
        placedPeriods: totalPlacedPeriods
    };
};
