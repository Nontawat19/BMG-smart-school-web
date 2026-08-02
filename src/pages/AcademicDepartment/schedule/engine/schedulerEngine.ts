import { AssignmentConstraintMap, Course, CourseInstance } from '../types';
import { getRequiredWeeklyPeriods, haveDistinctSpecificRooms } from '../utils';
import { getTaskTeacherIds } from '../scheduleSharedUtils';
import { isCoreAcademicCourseTitle } from '../scheduleMetrics';
import {
    SCORE_BASE, SCORE_PREF_MATCH_BONUS, SCORE_PREF_MISMATCH_PENALTY, SCORE_CATEGORY_HALF_BONUS,
    TEACHER_HEAVY_DAY_LOAD, TEACHER_HEAVY_DAY_PENALTY, TEACHER_MODERATE_DAY_LOAD, TEACHER_MODERATE_DAY_PENALTY,
    TEACHER_LIGHT_DAY_LOAD, TEACHER_LIGHT_DAY_BONUS,
    CLASS_VERY_HEAVY_DAY_LOAD, CLASS_VERY_HEAVY_DAY_PENALTY, CLASS_HEAVY_DAY_LOAD, CLASS_HEAVY_DAY_PENALTY,
    CLASS_MODERATE_DAY_LOAD, CLASS_MODERATE_DAY_PENALTY, CLASS_LIGHT_DAY_LOAD, CLASS_LIGHT_DAY_BONUS,
    HALF_DAY_BALANCE_WEIGHT, HALF_DAY_IMBALANCE_THRESHOLD, HALF_DAY_IMBALANCE_PENALTY,
    PREV_SLOT_PENALTY_DOUBLE, PREV_SLOT_PENALTY_SINGLE,
    GAP_WEIGHT_PER_PERIOD, CONSECUTIVE_VERY_HIGH_THRESHOLD, CONSECUTIVE_VERY_HIGH_PENALTY,
    CONSECUTIVE_HIGH_THRESHOLD, CONSECUTIVE_HIGH_PENALTY,
    ROOM_HEAVY_DAY_LOAD, ROOM_HEAVY_DAY_PENALTY, ROOM_MODERATE_DAY_LOAD, ROOM_MODERATE_DAY_PENALTY,
    ROOM_LIGHT_DAY_LOAD, ROOM_LIGHT_DAY_BONUS,
    CLASS_PERIOD_LOAD_WEIGHT, TEACHER_PERIOD_LOAD_WEIGHT,
    LAST_MORNING_PERIOD_BONUS,
    TEACHER_STREAM_HEAVY_THRESHOLD, TEACHER_STREAM_HEAVY_PENALTY,
    TEACHER_STREAM_MODERATE_THRESHOLD, TEACHER_STREAM_MODERATE_PENALTY,
    CONTINUITY_BONUS, GAP_AVOIDANCE_PENALTY, FRAGMENTATION_PENALTY,
    SUBJECT_REPEAT_PENALTY_HIGH_FREQ, SUBJECT_REPEAT_PENALTY_LOW_FREQ, NEW_DAY_BONUS, REPEAT_HALF_DAY_NUDGE,
    CATEGORY_TIME_BONUS, CATEGORY_TIME_WEAK_BONUS, JITTER_RANGE,
    CORE_SUBJECT_MORNING_BONUS, CORE_SUBJECT_AFTERNOON_PENALTY,
    QUALITY_PLACED_WEIGHT, QUALITY_UNPLACED_PENALTY,
    QUALITY_TEACHER_BALANCE_WEIGHT, QUALITY_TEACHER_HALF_BALANCE_WEIGHT,
    QUALITY_CLASS_BALANCE_WEIGHT, QUALITY_CLASS_GAP_WEIGHT,
    QUALITY_CLASS_CONSECUTIVE_THRESHOLD, QUALITY_CLASS_CONSECUTIVE_WEIGHT,
    QUALITY_CLASS_HALF_BALANCE_WEIGHT, QUALITY_ROOM_BALANCE_WEIGHT,
    QUALITY_SUBJECT_OVER_REPEAT_PENALTY, QUALITY_SUBJECT_BALANCED_BONUS,
    QUALITY_BBL_COMPLIANCE_WEIGHT,
    REPAIR_STRICT_PHASE_RATIO, MAX_EJECT_BLOCKERS, EJECT_DOUBLE_BLOCKER_WEIGHT, MAX_BACKTRACK_DEPTH, MAX_BACKTRACK_BRANCHES,
} from './engineConstants';

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

/** A single per-teacher-per-class Firestore write payload item: a CourseInstance
 *  plus the engine's own placement bookkeeping (`taskId`). Existing/carried-over
 *  entries seeded by the caller are plain CourseInstance values without a taskId. */
export type EngineBatchWriteItem = CourseInstance & { taskId?: number };
export type EngineBatchUpdates = Record<string, Record<string, EngineBatchWriteItem[]>>;

/** Bookkeeping used by the backtracking repair phase to undo/redo an ejected task's placement. */
type RemovedOccupancy = { slotId: string; occupancy: TimetableOccupancy };
type RemovedUpdate = { docId: string; sId: string; items: EngineBatchWriteItem[] };

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
    previousSlots?: string[];
    instanceCount: number;
    duration: number;
    originalCourseId: string;
    compositeId: string;
    groupNumber: number;
    requiredSlot?: string;
};

type ClassSlotOccupant = { courseId: string; groupNumber: number; room: string[] };

export type RuntimeConflictIndex = {
    teacherSlots: Map<string, Set<string>>;
    classSlots: Map<string, Map<string, Map<string, ClassSlotOccupant>>>; // classId -> slotId -> placementKey -> occupant summary
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
    /** Maximum allowed consecutive same-subject periods per class per day (default: 3) */
    maxConsecutivePeriodsPerDay?: number;
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

const clone = <T,>(value: T): T =>
    typeof structuredClone === 'function'
        ? structuredClone(value)
        : (JSON.parse(JSON.stringify(value)) as T);

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

// Whether this task is one of the 4 core subjects that `calculateBBLCompliance`
// (scheduleMetrics.ts) measures — kept in sync with that function so the engine
// optimizes for the same metric that gets reported to users.
const isCoreSubjectTask = (task: Pick<EngineTask, 'course'>) => isCoreAcademicCourseTitle(task.course.title || '');

export const createRuntimeConflictIndex = (): RuntimeConflictIndex => ({
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

/** Insert `value` into a sorted numeric array without a full re-sort (O(n) vs O(n log n)). */
const insertSorted = (arr: number[], value: number): void => {
    let lo = 0;
    let hi = arr.length;
    while (lo < hi) {
        const mid = (lo + hi) >>> 1;
        if (arr[mid] < value) lo = mid + 1;
        else hi = mid;
    }
    arr.splice(lo, 0, value);
};

const deleteSetValue = (map: Map<string, Set<string>>, key: string, value: string) => {
    const set = map.get(key);
    if (!set) return;
    set.delete(value);
    if (set.size === 0) map.delete(key);
};

const normalizeClassIds = (classId: string | string[] | undefined) => {
    return Array.from(new Set((Array.isArray(classId) ? classId : [classId]).filter(Boolean))) as string[];
};

const normalizeSpecificRooms = (rooms: string | string[] | undefined) => {
    const list = Array.isArray(rooms) ? rooms : (rooms ? [rooms] : []);
    return list.filter(room => room && room.toLowerCase() !== 'all');
};

const getClassPlacementKey = (occupancy: Pick<TimetableOccupancy, 'courseId' | 'groupNumber'>) => (
    `${occupancy.courseId}|${occupancy.groupNumber || 0}`
);


export const addOccupancyToIndex = (index: RuntimeConflictIndex, slotId: string, occupancy: TimetableOccupancy) => {
    const [dayKey, pStr] = slotId.split('-');
    const periodIdx = parseInt(pStr);
    
    addSetValue(index.teacherSlots, occupancy.teacherId, slotId);
    const teacherDayKey = `${occupancy.teacherId}|${dayKey}`;
    index.teacherDayLoad.set(teacherDayKey, (index.teacherDayLoad.get(teacherDayKey) || 0) + 1);
    const teacherPeriodKey = `${occupancy.teacherId}|${periodIdx}`;
    index.teacherPeriodLoad.set(teacherPeriodKey, (index.teacherPeriodLoad.get(teacherPeriodKey) || 0) + 1);
    
    const daySched = index.teacherDailySchedule.get(teacherDayKey) || [];
    insertSorted(daySched, periodIdx);
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
            insertSorted(classDaySched, periodIdx);
            index.classDailySchedule.set(classDayKey, classDaySched);

            if (!index.classSlots.has(classId)) index.classSlots.set(classId, new Map());
            const slotMap = index.classSlots.get(classId)!;
            if (!slotMap.has(slotId)) slotMap.set(slotId, new Map());
            slotMap.get(slotId)!.set(getClassPlacementKey(occupancy), {
                courseId: occupancy.courseId,
                groupNumber: occupancy.groupNumber || 0,
                room: normalizeSpecificRooms(occupancy.room)
            });

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
                const occupants = slotMap.get(slotId);
                if (occupants) {
                    occupants.delete(getClassPlacementKey(occupancy));
                    if (occupants.size === 0) slotMap.delete(slotId);
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

// Two DIFFERENT courses that only share a coarse grade-level classId (e.g. "m3" — elective/
// rotation-group courses aren't tied to a single classroom, see CLASS_MAPPING in
// schoolUtils.ts) are NOT a real conflict when they're the same course split into parallel
// groups, or when each has its own specific, non-overlapping room — see haveDistinctSpecificRooms
// in utils.ts, which this mirrors for the same reason (a manual-drag/UI-side counterpart of
// this exact check already applies that exemption).
const hasClassConflict = (
    index: RuntimeConflictIndex,
    classId: string,
    slotId: string,
    requesting: ClassSlotOccupant
) => {
    const slotMap = index.classSlots.get(classId);
    if (!slotMap) return false;
    const occupants = slotMap.get(slotId);
    if (!occupants || occupants.size === 0) return false;

    for (const occupant of occupants.values()) {
        const isParallelGroupSameCourse = occupant.courseId === requesting.courseId &&
            occupant.groupNumber > 0 &&
            requesting.groupNumber > 0 &&
            occupant.groupNumber !== requesting.groupNumber;
        if (isParallelGroupSameCourse) continue;

        if (occupant.courseId !== requesting.courseId && haveDistinctSpecificRooms(occupant.room, requesting.room)) continue;

        return true;
    }
    return false;
};

export const countGaps = (periods: number[]) => {
    if (periods.length <= 1) return 0;
    const sorted = [...periods].sort((a, b) => a - b);
    let gaps = 0;
    for (let i = 0; i < sorted.length - 1; i++) {
        const gap = sorted[i + 1] - sorted[i] - 1;
        if (gap > 0) gaps += gap;
    }
    return gaps;
};

export const getMaxConsecutive = (periods: number[]) => {
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

export const getBalancePenalty = (loadsByDay: number[]) => {
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

export const getSessionSlotsForStart = (
    startSlotId: string,
    duration: number,
    slots: EngineTeachingSlot[]
) => {
    if (duration <= 1) {
        return slots.some(slot => slot.slotId === startSlotId) ? [startSlotId] : [];
    }

    const [dayKey, pStr] = startSlotId.split('-');
    const startIndex = parseInt(pStr);
    
    const session = [];
    for (let i = 0; i < duration; i++) {
        const nextId = `${dayKey}-${startIndex + i}`;
        if (slots.some(slot => slot.slotId === nextId)) {
            session.push(nextId);
        } else {
            return [];
        }
    }
    return session;
};

const hasPlacementPreference = (task: EngineTask, assignmentConstraints: AssignmentConstraintMap) => {
    const constraint = assignmentConstraints[task.compositeId];
    const preference = task.duration > 1 ? constraint?.doublePreference : constraint?.singlePreference;
    return Boolean(preference && preference !== 'any');
};

const getTaskPriority = (task: EngineTask, assignmentConstraints: AssignmentConstraintMap) => {
    if (task.duration > 1 && task.requiredSlot) return 0;
    if (task.duration > 1) return 1;
    if (task.requiredSlot) return 2;
    if (hasPlacementPreference(task, assignmentConstraints)) return 3;
    // Let core (BBL) subjects claim their preferred morning slots before the
    // generic ACADEMIC/ACTIVITY pool competes for the same slots.
    if (isCoreSubjectTask(task)) return 4;
    return 5;
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
    pressureByTaskKey: Map<string, number>,
    assignmentConstraints: AssignmentConstraintMap
) => {
    const taskIndexByRef = new Map<EngineTask, number>();
    tasks.forEach((task, index) => taskIndexByRef.set(task, index));

    return [...tasks].sort((a, b) => {
        const priorityDelta = getTaskPriority(a, assignmentConstraints) - getTaskPriority(b, assignmentConstraints);
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

export const canPlaceWithIndex = (task: EngineTask, sessionSlots: string[], index: RuntimeConflictIndex, assignmentConstraints?: AssignmentConstraintMap, maxConsecutivePeriodsPerDay = 2) => {
    const requestedRooms = normalizeSpecificRooms(task.targetRooms);
    const teacherIds = getTaskTeacherIds(task);
    const isDoubleSession = task.duration > 1;
    const allowSameDaySingleRepeat = task.duration === 1 && getRequiredWeeklyPeriods(task.course) > 6;

    const requestingOccupant: ClassSlotOccupant = {
        courseId: task.course.id,
        groupNumber: task.groupNumber || 0,
        room: requestedRooms
    };

    for (const slotId of sessionSlots) {
        if (teacherIds.some(teacherId => hasSlot(index.teacherSlots, teacherId, slotId))) return false;
        if (task.targetClasses.some(classId => hasClassConflict(index, classId, slotId, requestingOccupant))) return false;
        if (requestedRooms.some(roomId => hasSlot(index.roomSlots, roomId, slotId))) return false;
    }

    if (task.requiredSlot) return true;

    if (sessionSlots.length > 0) {
        const [dayKey] = sessionSlots[0].split('-');

        const asgnCst = assignmentConstraints?.[task.compositeId];
        if (asgnCst?.excludedDays?.includes(dayKey)) return false;
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

            if (maxConsecutive >= maxConsecutivePeriodsPerDay) {
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
    _validSlotsByTaskIndex: string[][],
    _taskIndex: number,
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
    const maxPeriodsPerDayForAssignment = canRepeatOnSomeDays ? 2 : Math.max(1, task.duration);
    const getMaxSubjectCountForDay = (dayKey: string) => {
        let maxSubjectInDay = 0;
        task.targetClasses.forEach(classId => {
            const courseDayKey = `${classId}|${task.course.id}|${dayKey}`;
            const count = conflictIndex.classCourseDayCount.get(courseDayKey) || 0;
            if (count > maxSubjectInDay) maxSubjectInDay = count;
        });
        return maxSubjectInDay;
    };

    const NOON = '12:00';

    // Cache morning period indices and half-day boundary per dayKey — computed once, not per-slot
    const morningPIdxsByDay = new Map<string, number[]>();
    const halfBoundaryByDay = new Map<string, number>();
    for (const s of availableSlots) {
        if (!morningPIdxsByDay.has(s.dayKey)) {
            const dayMorningPIdxs = slots
                .filter(d => d.dayKey === s.dayKey && d.periodSetting.isTeachingPeriod && d.periodSetting.startTime < NOON)
                .map(d => parseInt(d.slotId.split('-')[1]));
            morningPIdxsByDay.set(s.dayKey, dayMorningPIdxs);
            const boundary = dayMorningPIdxs.length > 0
                ? Math.max(...dayMorningPIdxs) + 1
                : Math.max(1, Math.floor(slots.filter(d => d.dayKey === s.dayKey && d.periodSetting.isTeachingPeriod).length / 2));
            halfBoundaryByDay.set(s.dayKey, boundary);
        }
    }

    const scoredSlots = availableSlots.filter(slot => {
        if (task.duration <= 1) return true;
        return getSessionSlotsForStart(slot.slotId, task.duration, slots).length === task.duration;
    }).filter(slot => {
        if (task.requiredSlot) return true;

        // HARD CONSTRAINT: Teacher Overload
        const teacherIds = getTaskTeacherIds(task);
        const currentLoad = Math.max(...teacherIds.map(teacherId => conflictIndex.teacherDayLoad.get(`${teacherId}|${slot.dayKey}`) || 0));

        const taskTeacherKey = teacherIds.join('+');
        const sameTeacherTasks = allTasks.filter(t => getTaskTeacherIds(t).join('+') === taskTeacherKey);
        const totalWeeklyTeacherLoad = sameTeacherTasks.reduce((sum, t) => sum + t.duration, 0);
        const maxExpectedDailyLoad = Math.max(TEACHER_HEAVY_DAY_LOAD, Math.ceil(totalWeeklyTeacherLoad / 5) + 1);

        if (currentLoad + task.duration > maxExpectedDailyLoad) {
            return false;
        }

        if (ignorePrefs) return true;
        const currentSubjectCount = getMaxSubjectCountForDay(slot.dayKey);
        return currentSubjectCount + task.duration <= maxPeriodsPerDayForAssignment;
    }).map(slot => {
        let score = SCORE_BASE;
        const { dayKey, periodSetting } = slot;
        const pIdx = parseInt(slot.slotId.split('-')[1]);

        const isMorning = periodSetting.startTime < NOON;
        const asgnCst = assignmentConstraints[task.compositeId];
        const halfBoundary = halfBoundaryByDay.get(dayKey) ?? 0;
        const countHalfLoad = (periods: number[], preferMorning: boolean) => (
            periods.filter(period => preferMorning ? period < halfBoundary : period >= halfBoundary).length
        );

        // 1. Mandatory / Preferences Logic
        const prefMultiplier = ignorePrefs ? 0.2 : 1;

        if (asgnCst) {
            const pref = task.duration >= 2 ? asgnCst.doublePreference : asgnCst.singlePreference;
            if (pref === 'morning' && isMorning) score += SCORE_PREF_MATCH_BONUS * prefMultiplier;
            else if (pref === 'afternoon' && !isMorning) score += SCORE_PREF_MATCH_BONUS * prefMultiplier;
            else if (pref && pref !== 'any') score -= SCORE_PREF_MISMATCH_PENALTY * prefMultiplier;
        } else if (isCoreSubjectTask(task)) {
            // Core subjects (Thai/Math/Science/Social) drive the BBL compliance metric —
            // give them a much stronger morning pull than the generic ACADEMIC bonus below,
            // since that one is shared with every academic-tagged subject and gets diluted.
            if (isMorning) score += CORE_SUBJECT_MORNING_BONUS * prefMultiplier;
            else score -= CORE_SUBJECT_AFTERNOON_PENALTY * prefMultiplier;
        } else {
            if (category === 'ACADEMIC' && isMorning) score += SCORE_CATEGORY_HALF_BONUS * prefMultiplier;
            else if (category === 'ACTIVITY' && !isMorning) score += SCORE_CATEGORY_HALF_BONUS * prefMultiplier;
        }

        // 2. Teacher Load & Balancing
        const teacherIds = getTaskTeacherIds(task);
        const primaryTeacherDayKey = `${task.teacherId}|${dayKey}`;
        const currentLoad = Math.max(...teacherIds.map(teacherId => conflictIndex.teacherDayLoad.get(`${teacherId}|${dayKey}`) || 0));
        const teacherMorningLoad = Math.max(...teacherIds.map(teacherId => countHalfLoad(conflictIndex.teacherDailySchedule.get(`${teacherId}|${dayKey}`) || [], true)));
        const teacherAfternoonLoad = Math.max(...teacherIds.map(teacherId => countHalfLoad(conflictIndex.teacherDailySchedule.get(`${teacherId}|${dayKey}`) || [], false)));

        if (currentLoad >= TEACHER_HEAVY_DAY_LOAD) score -= TEACHER_HEAVY_DAY_PENALTY;
        else if (currentLoad >= TEACHER_MODERATE_DAY_LOAD) score -= TEACHER_MODERATE_DAY_PENALTY;
        else if (currentLoad <= TEACHER_LIGHT_DAY_LOAD) score += TEACHER_LIGHT_DAY_BONUS;

        let maxClassLoadForDay = 0;
        let maxClassMorningLoad = 0;
        let maxClassAfternoonLoad = 0;
        task.targetClasses.forEach(classId => {
            const classDayLoad = conflictIndex.classDayLoad.get(`${classId}|${dayKey}`) || 0;
            if (classDayLoad > maxClassLoadForDay) maxClassLoadForDay = classDayLoad;
            const classPeriods = conflictIndex.classDailySchedule.get(`${classId}|${dayKey}`) || [];
            maxClassMorningLoad = Math.max(maxClassMorningLoad, countHalfLoad(classPeriods, true));
            maxClassAfternoonLoad = Math.max(maxClassAfternoonLoad, countHalfLoad(classPeriods, false));
        });
        if (maxClassLoadForDay >= CLASS_VERY_HEAVY_DAY_LOAD) score -= CLASS_VERY_HEAVY_DAY_PENALTY;
        else if (maxClassLoadForDay >= CLASS_HEAVY_DAY_LOAD) score -= CLASS_HEAVY_DAY_PENALTY;
        else if (maxClassLoadForDay >= CLASS_MODERATE_DAY_LOAD) score -= CLASS_MODERATE_DAY_PENALTY;
        else if (maxClassLoadForDay <= CLASS_LIGHT_DAY_LOAD) score += CLASS_LIGHT_DAY_BONUS;

        const currentHalfLoad = isMorning
            ? Math.max(teacherMorningLoad, maxClassMorningLoad)
            : Math.max(teacherAfternoonLoad, maxClassAfternoonLoad);
        const oppositeHalfLoad = isMorning
            ? Math.max(teacherAfternoonLoad, maxClassAfternoonLoad)
            : Math.max(teacherMorningLoad, maxClassMorningLoad);
        score += (oppositeHalfLoad - currentHalfLoad) * HALF_DAY_BALANCE_WEIGHT;

        if (task.previousSlots?.includes(slot.slotId)) {
            score -= task.duration > 1 ? PREV_SLOT_PENALTY_DOUBLE : PREV_SLOT_PENALTY_SINGLE;
        }

        if (isMorning && teacherMorningLoad >= teacherAfternoonLoad + HALF_DAY_IMBALANCE_THRESHOLD) {
            score -= HALF_DAY_IMBALANCE_PENALTY;
        }
        if (!isMorning && teacherAfternoonLoad >= teacherMorningLoad + HALF_DAY_IMBALANCE_THRESHOLD) {
            score -= HALF_DAY_IMBALANCE_PENALTY;
        }

        const daySched = conflictIndex.teacherDailySchedule.get(primaryTeacherDayKey) || [];
        let maxClassGapsAfterPlacement = 0;
        let maxClassConsecutiveAfterPlacement = 0;
        task.targetClasses.forEach(classId => {
            const classDayKey = `${classId}|${dayKey}`;
            const classPeriods = conflictIndex.classDailySchedule.get(classDayKey) || [];
            const sessionSlots = getSessionSlotsForStart(slot.slotId, task.duration, slots);
            const sessionPeriods = sessionSlots.length === task.duration
                ? sessionSlots.map(sessionSlot => parseInt(sessionSlot.split('-')[1]))
                : Array.from({ length: task.duration }, (_, offset) => pIdx + offset);
            const nextClassPeriods = [...classPeriods, ...sessionPeriods];
            maxClassGapsAfterPlacement = Math.max(maxClassGapsAfterPlacement, countGaps(nextClassPeriods));
            maxClassConsecutiveAfterPlacement = Math.max(maxClassConsecutiveAfterPlacement, getMaxConsecutive(nextClassPeriods));
        });
        score -= maxClassGapsAfterPlacement * GAP_WEIGHT_PER_PERIOD;
        if (maxClassConsecutiveAfterPlacement > CONSECUTIVE_VERY_HIGH_THRESHOLD) score -= CONSECUTIVE_VERY_HIGH_PENALTY;
        else if (maxClassConsecutiveAfterPlacement > CONSECUTIVE_HIGH_THRESHOLD) score -= CONSECUTIVE_HIGH_PENALTY;

        const requestedRooms = normalizeSpecificRooms(task.targetRooms);
        if (requestedRooms.length > 0) {
            const maxRoomLoadForDay = Math.max(...requestedRooms.map(roomId => conflictIndex.roomDayLoad.get(`${roomId}|${dayKey}`) || 0));
            if (maxRoomLoadForDay >= ROOM_HEAVY_DAY_LOAD) score -= ROOM_HEAVY_DAY_PENALTY;
            else if (maxRoomLoadForDay >= ROOM_MODERATE_DAY_LOAD) score -= ROOM_MODERATE_DAY_PENALTY;
            else if (maxRoomLoadForDay <= ROOM_LIGHT_DAY_LOAD) score += ROOM_LIGHT_DAY_BONUS;
        }

        const classPeriodLoad = getPeriodLoad(conflictIndex.classPeriodLoad, task.targetClasses, pIdx, task.duration);
        const teacherPeriodLoad = getPeriodLoad(conflictIndex.teacherPeriodLoad, teacherIds, pIdx, task.duration);
        score -= classPeriodLoad * CLASS_PERIOD_LOAD_WEIGHT;
        score -= teacherPeriodLoad * TEACHER_PERIOD_LOAD_WEIGHT;

        const teachingPeriodSlots = slots.filter(s => s.dayKey === dayKey && s.periodSetting.isTeachingPeriod);
        const lastMorningTeachingSlot = [...teachingPeriodSlots]
            .filter(s => s.periodSetting.startTime < NOON)
            .sort((a, b) => parseInt(b.slotId.split('-')[1]) - parseInt(a.slotId.split('-')[1]))[0];
        const isLastMorningPeriod = lastMorningTeachingSlot?.slotId === slot.slotId;
        if (isLastMorningPeriod && classPeriodLoad <= 1) {
            score += LAST_MORNING_PERIOD_BONUS;
        }

        let consecutiveCount = 0;
        let i = pIdx - 1;
        while (daySched.includes(i)) { consecutiveCount++; i--; }
        i = pIdx + task.duration;
        while (daySched.includes(i)) { consecutiveCount++; i++; }

        const totalConsecutive = consecutiveCount + task.duration;
        if (totalConsecutive > TEACHER_STREAM_HEAVY_THRESHOLD) score -= TEACHER_STREAM_HEAVY_PENALTY;
        else if (totalConsecutive > TEACHER_STREAM_MODERATE_THRESHOLD) score -= TEACHER_STREAM_MODERATE_PENALTY;

        // 3. Gap Penalty & Continuous Reward
        const prevP = pIdx - 1;
        const nextP = pIdx + task.duration;
        const hasPrev = daySched.includes(prevP);
        const hasNext = daySched.includes(nextP);

        if (hasPrev || hasNext) score += CONTINUITY_BONUS;

        const hasBeforeGap = daySched.includes(prevP - 1) && !hasPrev;
        const hasAfterGap = daySched.includes(nextP + 1) && !hasNext;
        if (hasBeforeGap) score -= GAP_AVOIDANCE_PENALTY;
        if (hasAfterGap) score -= GAP_AVOIDANCE_PENALTY;

        if (!hasPrev && !hasNext && daySched.length > 0) score -= FRAGMENTATION_PENALTY;

        // 4. Class Subject Spreading
        const maxSubjectInDay = getMaxSubjectCountForDay(dayKey);
        if (maxSubjectInDay > 0) {
            const dayRepeatPenalty = canRepeatOnSomeDays ? SUBJECT_REPEAT_PENALTY_HIGH_FREQ : SUBJECT_REPEAT_PENALTY_LOW_FREQ;
            score -= maxSubjectInDay * dayRepeatPenalty;
            if (isMorning) score -= REPEAT_HALF_DAY_NUDGE;
            else score += REPEAT_HALF_DAY_NUDGE;
        } else {
            score += NEW_DAY_BONUS;
        }

        // 5. Time Slot Specific
        if (category === 'ACADEMIC' && !isMorning) score += CATEGORY_TIME_BONUS;
        else if (category === 'ACADEMIC' && isMorning) score += CATEGORY_TIME_WEAK_BONUS;
        if (category === 'ACTIVITY' && !isMorning) score += CATEGORY_TIME_BONUS;
        else if (category === 'ACTIVITY' && isMorning) score += CATEGORY_TIME_WEAK_BONUS;

        score += Math.random() * JITTER_RANGE;
        return { slot, score };
    });

    scoredSlots.sort((a, b) => b.score - a.score);
    return scoredSlots.map(s => s.slot.slotId);
};

/**
 * Computes a quality score [0, ~1] for a candidate schedule.
 * Higher is better. Factors: placement rate, teacher/class distribution balance,
 * gap penalties, consecutive-period overrun penalties, and BBL morning compliance.
 */
const evaluateScheduleQuality = (
    timetable: EngineSchedule,
    allTeachingSlots: EngineTeachingSlot[],
    unplacedCount: number,
    placedPeriods: number
) => {
    const index = buildRuntimeConflictIndex(timetable);
    const dayKeys = Array.from(new Set(allTeachingSlots.map(slot => slot.dayKey)));
    let score = placedPeriods * QUALITY_PLACED_WEIGHT - unplacedCount * QUALITY_UNPLACED_PENALTY;

    const teacherIds = Array.from(new Set(Array.from(index.teacherDayLoad.keys()).map(key => key.split('|')[0])));
    const classIds = Array.from(new Set(Array.from(index.classDayLoad.keys()).map(key => key.split('|')[0])));
    const roomIds = Array.from(new Set(Array.from(index.roomDayLoad.keys()).map(key => key.split('|')[0])));

    teacherIds.forEach(teacherId => {
        const loads = dayKeys.map(dayKey => index.teacherDayLoad.get(`${teacherId}|${dayKey}`) || 0);
        score -= getBalancePenalty(loads) * QUALITY_TEACHER_BALANCE_WEIGHT;

        dayKeys.forEach(dayKey => {
            const periods = index.teacherDailySchedule.get(`${teacherId}|${dayKey}`) || [];
            const morning = periods.filter(period => period < 5).length;
            const afternoon = periods.length - morning;
            score -= Math.abs(morning - afternoon) * QUALITY_TEACHER_HALF_BALANCE_WEIGHT;
        });
    });

    classIds.forEach(classId => {
        const loads = dayKeys.map(dayKey => index.classDayLoad.get(`${classId}|${dayKey}`) || 0);
        score -= getBalancePenalty(loads) * QUALITY_CLASS_BALANCE_WEIGHT;

        dayKeys.forEach(dayKey => {
            const periods = index.classDailySchedule.get(`${classId}|${dayKey}`) || [];
            score -= countGaps(periods) * QUALITY_CLASS_GAP_WEIGHT;
            const maxConsecutive = getMaxConsecutive(periods);
            if (maxConsecutive > QUALITY_CLASS_CONSECUTIVE_THRESHOLD) {
                score -= (maxConsecutive - QUALITY_CLASS_CONSECUTIVE_THRESHOLD) * QUALITY_CLASS_CONSECUTIVE_WEIGHT;
            }
            const morning = periods.filter(period => period < 5).length;
            const afternoon = periods.length - morning;
            score -= Math.abs(morning - afternoon) * QUALITY_CLASS_HALF_BALANCE_WEIGHT;
        });
    });

    roomIds.forEach(roomId => {
        const loads = dayKeys.map(dayKey => index.roomDayLoad.get(`${roomId}|${dayKey}`) || 0);
        score -= getBalancePenalty(loads) * QUALITY_ROOM_BALANCE_WEIGHT;
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
        if (count > maxPerDay) score -= (count - maxPerDay) * QUALITY_SUBJECT_OVER_REPEAT_PENALTY;
        else if (count === maxPerDay && expectedWeeklyPeriods > 5) score += QUALITY_SUBJECT_BALANCED_BONUS;
    });

    // BBL compliance: reward the run with the highest share of core-subject
    // (Thai/Math/Science/Social) placements in the morning, mirroring
    // `calculateBBLCompliance` (scheduleMetrics.ts) so multi-run selection
    // actually optimizes for the metric reported back to users.
    const isMorningBySlotId = new Map(allTeachingSlots.map(slot => [slot.slotId, slot.periodSetting.startTime < '12:00']));
    let totalCoreSlots = 0;
    let morningCoreSlots = 0;
    Object.entries(timetable).forEach(([slotId, occupancies]) => {
        const processedInSlot = new Set<string>();
        occupancies.forEach(occupancy => {
            const placementKey = occupancy.taskId !== undefined
                ? `task-${occupancy.taskId}`
                : `course-${occupancy.courseId}-${occupancy.groupNumber}`;
            if (processedInSlot.has(placementKey)) return;
            processedInSlot.add(placementKey);

            if (!isCoreAcademicCourseTitle(occupancy.course?.title || '')) return;
            totalCoreSlots++;
            if (isMorningBySlotId.get(slotId)) morningCoreSlots++;
        });
    });
    if (totalCoreSlots > 0) {
        score += (morningCoreSlots / totalCoreSlots) * QUALITY_BBL_COMPLIANCE_WEIGHT;
    }

    return score;
};

/**
 * Multi-run CSP scheduling engine.
 * Runs up to `maxRuns` independent attempts, keeping the solution with the
 * highest quality score (placement rate + BBL compliance + gap/consecutive penalties).
 * Each run uses backtracking with an ejection/restoration repair step.
 */
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
        maxRepairAttempts = 1000,
        maxConsecutivePeriodsPerDay = 2
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
    // Pre-build Set versions for O(1) slot lookups throughout all runs
    const validSlotsByTaskIndexSets = validSlotsByTaskIndex.map(slots => new Set(slots));
    const emergencySlotPoolByTaskIndexSets = emergencySlotPoolByTaskIndex.map(slots => new Set(slots));

    for (let run = 1; run <= maxRuns; run++) {
        const currentTimetable: EngineSchedule = clone(initialTimetable);
        const currentBatchUpdates: EngineBatchUpdates = clone(initialBatchUpdates);
        const currentConflictIndex = buildRuntimeConflictIndex(currentTimetable);
        const currentUnplacedTasks: EngineTask[] = [];
        let currentPlacedPeriods = 0;
        // Per-run circuit breaker: `maxRepairAttempts` was previously accepted as an
        // input but never actually consulted anywhere, so a pathological mix of
        // hard-to-place tasks had no upper bound on backtracking work within a run.
        // Once the budget is spent, remaining tasks fall back to a direct (non-
        // backtracking) placement attempt for the rest of this run only — every
        // other run still gets its own full budget, so this can only help worst-case
        // runs finish in bounded time and never makes an already-successful run worse.
        let repairAttemptsUsed = 0;

        onProgress?.({
            percentage: 35 + (run / maxRuns) * 30,
            message: `กำลังประมวลผลรอบที่ ${run}/${maxRuns}... (ดีที่สุด: เหลือ ${minUnplacedCount === Infinity ? '?' : minUnplacedCount})`
        });

        const orderedTasks = orderTasksForRun(tasks, validSlotsByTaskIndex, run, pressureByTaskKey, assignmentConstraints);

        const tryPlaceInRun = (
            task: EngineTask,
            ignorePrefs: boolean,
            timetable: EngineSchedule,
            updates: EngineBatchUpdates,
            conflictIndex: RuntimeConflictIndex,
            slotPoolByTaskIndex: string[][] = validSlotsByTaskIndex
        ) => {
            const taskIndex = taskIndexByRef.get(task) ?? tasks.indexOf(task);
            // Reuse pre-built Sets for the two common pool cases; only allocate for custom pools
            const slotPoolSet: Set<string> =
                slotPoolByTaskIndex === validSlotsByTaskIndex
                    ? (validSlotsByTaskIndexSets[taskIndex] ?? new Set())
                    : slotPoolByTaskIndex === emergencySlotPoolByTaskIndex
                        ? (emergencySlotPoolByTaskIndexSets[taskIndex] ?? new Set())
                        : new Set(slotPoolByTaskIndex[taskIndex] || []);
            let potentialSlots = getWeightedSlots(
                task,
                allTeachingSlots,
                slotPoolSet,
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
                const sessionSlots = getSessionSlotsForStart(startSlotId, task.duration, allTeachingSlots);
                if (sessionSlots.length !== task.duration) continue;

                if (canPlaceWithIndex(task, sessionSlots, conflictIndex, assignmentConstraints, maxConsecutivePeriodsPerDay)) {
                    const teacherIds = getTaskTeacherIds(task);
                    const isRelaxedPlacement = !(validSlotsByTaskIndexSets[taskIndex]?.has(startSlotId));

                    sessionSlots.forEach(slotId => {
                        teacherIds.forEach(teacherId => {
                            const occupancy: TimetableOccupancy = {
                                teacherId,
                                teacherIds,
                                classId: task.targetClasses,
                                room: task.targetRooms,
                                courseId: task.course.id,
                                course: isRelaxedPlacement ? {
                                    ...task.course,
                                    isRelaxedSchedule: true,
                                    scheduleWarning: `จัดลงช่วงเวลาที่ไม่ได้กำหนด (เงื่อนไขไม่ตรง)`
                                } : task.course,
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
                                        ...(isRelaxedPlacement ? {
                                            isRelaxedSchedule: true,
                                            scheduleWarning: `จัดลงช่วงเวลาที่ไม่ได้กำหนด (เงื่อนไขไม่ตรง)`
                                        } : {}),
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

        const removeTaskFromTimetable = (tId: number, ttt: EngineSchedule, upd: EngineBatchUpdates, idx: RuntimeConflictIndex) => {
            const removedOccs: RemovedOccupancy[] = [];
            for (const sId in ttt) {
                const removed = ttt[sId].filter(o => o.taskId === tId);
                removed.forEach(occupancy => {
                    removeOccupancyFromIndex(idx, sId, occupancy);
                    removedOccs.push({slotId: sId, occupancy});
                });
                ttt[sId] = ttt[sId].filter(o => o.taskId !== tId);
            }
            const bTask = tasks[tId];
            const removedUpdates: RemovedUpdate[] = [];
            if (bTask) {
                getTaskTeacherIds(bTask).forEach(teacherId => {
                    bTask.targetClasses.forEach(cId => {
                        const docId = `${teacherId}_${cId}`;
                        if (upd[docId]) {
                            for (const sId in upd[docId]) {
                                const items = upd[docId][sId];
                                const removing = items.filter(it => it.taskId === tId);
                                if (removing.length > 0) {
                                    removedUpdates.push({ docId, sId, items: removing });
                                }
                                upd[docId][sId] = items.filter(it => it.taskId !== tId);
                                if (upd[docId][sId].length === 0) delete upd[docId][sId];
                            }
                        }
                    });
                });
            }
            return { removedOccs, removedUpdates };
        };

        const restoreTaskToTimetable = (removedOccs: RemovedOccupancy[], removedUpdates: RemovedUpdate[], ttt: EngineSchedule, upd: EngineBatchUpdates, idx: RuntimeConflictIndex) => {
            removedOccs.forEach(({slotId, occupancy}) => {
                if (!ttt[slotId]) ttt[slotId] = [];
                ttt[slotId].push(occupancy);
                addOccupancyToIndex(idx, slotId, occupancy);
            });
            removedUpdates.forEach(({docId, sId, items}) => {
                if (!upd[docId]) upd[docId] = {};
                upd[docId][sId] = [...(upd[docId][sId] || []), ...items];
            });
        };

        const tryPlaceWithBacktracking = (
            task: EngineTask,
            depth: number,
            timetable: EngineSchedule,
            updates: EngineBatchUpdates,
            conflictIndex: RuntimeConflictIndex
        ): boolean => {
            if (tryPlaceInRun(task, depth > 0, timetable, updates, conflictIndex)) return true;
            if (depth >= MAX_BACKTRACK_DEPTH) return false;
            if (repairAttemptsUsed >= maxRepairAttempts) return false;
            repairAttemptsUsed++;

            const taskIndex = taskIndexByRef.get(task) ?? tasks.indexOf(task);
            const repairSlotPool = depth > 0 ? emergencySlotPoolByTaskIndex : validSlotsByTaskIndex;
            
            const potentialSlots = getWeightedSlots(
                task,
                allTeachingSlots,
                new Set(repairSlotPool[taskIndex] || []),
                repairSlotPool,
                taskIndex,
                assignmentConstraints,
                depth > 0,
                conflictIndex,
                tasks
            );

            const repairSearchLimit = Math.min(potentialSlots.length, MAX_BACKTRACK_BRANCHES);
            const repairTaskTeacherIdSet = new Set(getTaskTeacherIds(task));
            const repairRequestedRooms = normalizeSpecificRooms(task.targetRooms);
            const repairGroupNumber = Number(task.groupNumber || 0);

            for (const slotId of potentialSlots.slice(0, repairSearchLimit)) {
                const sessionSlots = getSessionSlotsForStart(slotId, task.duration, allTeachingSlots);
                if (sessionSlots.length !== task.duration) continue;

                const blockers: TimetableOccupancy[] = [];
                let fatalConflict = false;

                for (const sId of sessionSlots) {
                    const occs = timetable[sId] || [];
                    const localBlockers = occs.filter(o => {
                        const occClasses: string[] = Array.isArray(o.classId) ? o.classId : (o.classId ? [o.classId] : []);
                        const occRooms = normalizeSpecificRooms(o.room);
                        const occGroup = Number(o.groupNumber || 0);
                        const sameAssignment = o.courseId === task.course.id && occGroup === repairGroupNumber;
                        return repairTaskTeacherIdSet.has(o.teacherId) ||
                            (task.targetClasses.some(c => occClasses.includes(c)) && !sameAssignment) ||
                            repairRequestedRooms.some(roomId => occRooms.includes(roomId));
                    });
                    if (localBlockers.some(o => {
                        if (o.taskId === undefined) return true;
                        const t = tasks[o.taskId];
                        return Boolean(t?.requiredSlot) || t.duration > task.duration;
                    })) {
                        fatalConflict = true;
                        break;
                    }
                    blockers.push(...localBlockers);
                }

                if (fatalConflict) continue;

                const uniqueBlockers = Array.from(new Map(blockers.map(b => [b.taskId, b])).values());
                if (uniqueBlockers.length === 0 || uniqueBlockers.length > MAX_EJECT_BLOCKERS) continue;

                // Attempt Ejection
                const rollbacks: { tId: number; removedOccs: RemovedOccupancy[]; removedUpdates: RemovedUpdate[]; task: EngineTask }[] = [];
                let allEjected = true;

                for (const b of uniqueBlockers) {
                    if (b.taskId === undefined) { allEjected = false; break; }
                    const bTask = tasks[b.taskId];
                    const { removedOccs, removedUpdates } = removeTaskFromTimetable(b.taskId, timetable, updates, conflictIndex);
                    rollbacks.push({ tId: b.taskId, removedOccs, removedUpdates, task: bTask });
                }

                if (allEjected) {
                    const tempPool: string[][] = [];
                    tempPool[taskIndex] = [slotId];
                    if (tryPlaceInRun(task, true, timetable, updates, conflictIndex, tempPool)) {
                        // Recursively try to place ejected tasks
                        let allReplaced = true;
                        let placedCount = 0;
                        for (const r of rollbacks) {
                            if (!tryPlaceWithBacktracking(r.task, depth + 1, timetable, updates, conflictIndex)) {
                                allReplaced = false;
                                break;
                            }
                            placedCount++;
                        }

                        if (allReplaced) {
                            return true; // Success!
                        } else {
                            // Rollback the successfully replaced tasks in reverse order
                            // Use pre-stored tId (task array index) to avoid O(n) indexOf scan
                            for (let i = placedCount - 1; i >= 0; i--) {
                                removeTaskFromTimetable(rollbacks[i].tId, timetable, updates, conflictIndex);
                            }
                            // Rollback the task we just placed
                            removeTaskFromTimetable(taskIndex, timetable, updates, conflictIndex);
                        }
                    }
                }

                // Restore ejections (Rollback the blockers that were removed)
                rollbacks.forEach(r => restoreTaskToTimetable(r.removedOccs, r.removedUpdates, timetable, updates, conflictIndex));
            }
            return false;
        };

        for (const task of orderedTasks) {
            if (tryPlaceWithBacktracking(task, 0, currentTimetable, currentBatchUpdates, currentConflictIndex)) {
                currentPlacedPeriods += task.duration;
            } else {
                currentUnplacedTasks.push(task);
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

        // Perfect result: all tasks placed — skip remaining runs
        if (minUnplacedCount === 0 && run >= 2) break;
    }

    return {
        schoolTimetableRecord: bestSchoolTimetable,
        batchUpdates: bestBatchUpdates,
        unplacedTasks: finalUnplacedTasks,
        placedPeriods: totalPlacedPeriods
    };
};
