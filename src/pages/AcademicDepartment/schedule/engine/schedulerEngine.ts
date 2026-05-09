import { AssignmentConstraintMap, Course } from '../types';

export type TimetableOccupancy = {
    teacherId: string;
    classId: string | string[];
    room: string[];
    courseId: string;
    course: Course | null;
    taskId?: number;
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
    classSlots: Map<string, Set<string>>;
    roomSlots: Map<string, Set<string>>;
    teacherDayLoad: Map<string, number>;
    classCourseDayCount: Map<string, number>;
};

export type SchedulingEngineInput = {
    tasks: EngineTask[];
    initialTimetable: EngineSchedule;
    initialBatchUpdates: EngineBatchUpdates;
    allTeachingSlots: EngineTeachingSlot[];
    validSlotsByTaskIndex: string[][];
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
    classCourseDayCount: new Map()
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

const addOccupancyToIndex = (index: RuntimeConflictIndex, slotId: string, occupancy: TimetableOccupancy) => {
    const [dayKey] = slotId.split('-');
    addSetValue(index.teacherSlots, occupancy.teacherId, slotId);
    index.teacherDayLoad.set(`${occupancy.teacherId}|${dayKey}`, (index.teacherDayLoad.get(`${occupancy.teacherId}|${dayKey}`) || 0) + 1);

    normalizeClassIds(occupancy.classId).forEach(classId => {
        addSetValue(index.classSlots, classId, slotId);
        const courseDayKey = `${classId}|${occupancy.courseId}|${dayKey}`;
        index.classCourseDayCount.set(courseDayKey, (index.classCourseDayCount.get(courseDayKey) || 0) + 1);
    });

    normalizeSpecificRooms(occupancy.room).forEach(roomId => {
        addSetValue(index.roomSlots, roomId, slotId);
    });
};

const removeOccupancyFromIndex = (index: RuntimeConflictIndex, slotId: string, occupancy: TimetableOccupancy) => {
    const [dayKey] = slotId.split('-');
    deleteSetValue(index.teacherSlots, occupancy.teacherId, slotId);

    const teacherDayKey = `${occupancy.teacherId}|${dayKey}`;
    const nextTeacherLoad = (index.teacherDayLoad.get(teacherDayKey) || 1) - 1;
    if (nextTeacherLoad <= 0) index.teacherDayLoad.delete(teacherDayKey);
    else index.teacherDayLoad.set(teacherDayKey, nextTeacherLoad);

    normalizeClassIds(occupancy.classId).forEach(classId => {
        deleteSetValue(index.classSlots, classId, slotId);
        const courseDayKey = `${classId}|${occupancy.courseId}|${dayKey}`;
        const nextCount = (index.classCourseDayCount.get(courseDayKey) || 1) - 1;
        if (nextCount <= 0) index.classCourseDayCount.delete(courseDayKey);
        else index.classCourseDayCount.set(courseDayKey, nextCount);
    });

    normalizeSpecificRooms(occupancy.room).forEach(roomId => {
        deleteSetValue(index.roomSlots, roomId, slotId);
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

const canPlaceWithIndex = (task: EngineTask, sessionSlots: string[], index: RuntimeConflictIndex) => {
    const requestedRooms = normalizeSpecificRooms(task.targetRooms);

    for (const slotId of sessionSlots) {
        if (hasSlot(index.teacherSlots, task.teacherId, slotId)) return false;
        if (task.targetClasses.some(classId => hasSlot(index.classSlots, classId, slotId))) return false;
        if (requestedRooms.some(roomId => hasSlot(index.roomSlots, roomId, slotId))) return false;
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
    conflictIndex: RuntimeConflictIndex
) => {
    const category = getSubjectCategory(task.course);
    const availableSlots = slots.filter(slot => validSlots.has(slot.slotId));

    const scoredSlots = availableSlots.filter(slot => {
        if (task.duration <= 1) return true;
        const { dayKey, periodSetting } = slot;
        const slotIndex = parseInt(slot.slotId.split('-')[1]);
        const nextSlotId = `${dayKey}-${slotIndex + 1}`;
        const nextSlotInfo = slots.find(s => s.slotId === nextSlotId);
        return Boolean(nextSlotInfo?.periodSetting.isTeachingPeriod);
    }).map(slot => {
        let score = 50;
        const { dayKey, periodSetting } = slot;
        const periodNumber = parseInt(periodSetting.id.replace('period-', '')) || 0;
        const isMorning = periodNumber <= 4;
        const asgnCst = assignmentConstraints[task.compositeId];

        if (!ignorePrefs) {
            if (asgnCst) {
                const pref = task.duration >= 2 ? asgnCst.doublePreference : asgnCst.singlePreference;
                if (pref === 'morning' && isMorning) score += 150;
                if (pref === 'afternoon' && !isMorning) score += 150;
            } else {
                if (category === 'ACADEMIC' && isMorning) score += 40;
                else if (category === 'ACTIVITY' && !isMorning) score += 40;
            }
        }

        const currentLoad = conflictIndex.teacherDayLoad.get(`${task.teacherId}|${dayKey}`) || 0;
        if (currentLoad > 6) score -= 50;

        const subjectInDayCount = Math.max(
            0,
            ...task.targetClasses.map(classId => conflictIndex.classCourseDayCount.get(`${classId}|${task.course.id}|${dayKey}`) || 0)
        );
        if (subjectInDayCount > 0) score -= 100;

        score += Math.random() * 20;
        return { slot, score };
    });

    scoredSlots.sort((a, b) => b.score - a.score);
    return scoredSlots.map(s => s.slot.slotId);
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
        assignmentConstraints,
        maxRuns,
        maxRepairAttempts = 1000
    } = input;

    let bestSchoolTimetable: EngineSchedule = {};
    let bestBatchUpdates: EngineBatchUpdates = {};
    let minUnplacedCount = Infinity;
    let finalUnplacedTasks: EngineTask[] = [];
    let totalPlacedPeriods = 0;

    const taskIndexByRef = new Map<EngineTask, number>();
    tasks.forEach((task, index) => taskIndexByRef.set(task, index));

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

        const groupedTasks: Record<number, EngineTask[]> = {};
        tasks.forEach(t => {
            const priority = t.requiredSlot ? 0 : (t.duration === 2 ? 1 : 2);
            if (!groupedTasks[priority]) groupedTasks[priority] = [];
            groupedTasks[priority].push(t);
        });

        const shuffledTasks: EngineTask[] = [];
        [0, 1, 2].forEach(p => {
            if (groupedTasks[p]) {
                const group = groupedTasks[p];
                for (let i = group.length - 1; i > 0; i--) {
                    const j = Math.floor(Math.random() * (i + 1));
                    [group[i], group[j]] = [group[j], group[i]];
                }
                shuffledTasks.push(...group);
            }
        });

        const tryPlaceInRun = (
            task: EngineTask,
            ignorePrefs: boolean,
            timetable: EngineSchedule,
            updates: EngineBatchUpdates,
            conflictIndex: RuntimeConflictIndex
        ) => {
            const taskIndex = taskIndexByRef.get(task) ?? tasks.indexOf(task);
            let potentialSlots = getWeightedSlots(
                task,
                allTeachingSlots,
                new Set(validSlotsByTaskIndex[taskIndex] || []),
                validSlotsByTaskIndex,
                taskIndex,
                assignmentConstraints,
                ignorePrefs,
                conflictIndex
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
                    sessionSlots.forEach(slotId => {
                        const occupancy: TimetableOccupancy = {
                            teacherId: task.teacherId,
                            classId: task.targetClasses,
                            room: task.targetRooms,
                            courseId: task.course.id,
                            course: task.course,
                            taskId: taskIndex
                        };
                        if (!timetable[slotId]) timetable[slotId] = [];
                        timetable[slotId].push(occupancy);
                        addOccupancyToIndex(conflictIndex, slotId, occupancy);

                        task.targetClasses.forEach(cId => {
                            const docId = `${task.teacherId}_${cId}`;
                            if (!updates[docId]) updates[docId] = {};
                            const items = updates[docId][slotId] || [];
                            updates[docId][slotId] = [
                                ...(Array.isArray(items) ? items : [items]),
                                {
                                    ...task.course,
                                    teacherId: task.teacherId,
                                    classId: cId,
                                    room: task.targetRooms,
                                    groupNumber: task.groupNumber,
                                    compositeId: task.compositeId,
                                    taskId: taskIndex,
                                    instanceId: `${task.course.id}-${task.groupNumber}-${slotId}-${cId}`
                                }
                            ];
                        });
                    });
                    return true;
                }
            }
            return false;
        };

        for (const task of shuffledTasks) {
            if (tryPlaceInRun(task, false, currentTimetable, currentBatchUpdates, currentConflictIndex)) {
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
                const validHardSlots = new Set(allTeachingSlots.map(s => s.slotId));
                const potentialSlots = getWeightedSlots(
                    task,
                    allTeachingSlots,
                    validHardSlots,
                    validSlotsByTaskIndex,
                    taskIndex,
                    assignmentConstraints,
                    true,
                    currentConflictIndex
                );

                for (const slotId of potentialSlots.slice(0, 20)) {
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
                            return o.teacherId === task.teacherId ||
                                task.targetClasses.some(c => occClasses.includes(c)) ||
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
                                bTask.targetClasses.forEach(cId => {
                                    const docId = `${bTask.teacherId}_${cId}`;
                                    if (currentBatchUpdates[docId]) {
                                        for (const sId in currentBatchUpdates[docId]) {
                                            const items = currentBatchUpdates[docId][sId] as any[];
                                            currentBatchUpdates[docId][sId] = items.filter(it => it.taskId !== b.taskId);
                                            if (currentBatchUpdates[docId][sId].length === 0) delete currentBatchUpdates[docId][sId];
                                        }
                                    }
                                });
                                currentUnplacedTasks.push(bTask);
                                currentPlacedPeriods -= bTask.duration;
                            }
                        });

                        if (tryPlaceInRun(task, true, currentTimetable, currentBatchUpdates, currentConflictIndex)) {
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

        if (currentUnplacedTasks.length < minUnplacedCount) {
            minUnplacedCount = currentUnplacedTasks.length;
            bestSchoolTimetable = clone(currentTimetable);
            bestBatchUpdates = clone(currentBatchUpdates);
            finalUnplacedTasks = [...currentUnplacedTasks];
            totalPlacedPeriods = currentPlacedPeriods;

            if (minUnplacedCount === 0) break;
        }
    }

    return {
        schoolTimetableRecord: bestSchoolTimetable,
        batchUpdates: bestBatchUpdates,
        unplacedTasks: finalUnplacedTasks,
        placedPeriods: totalPlacedPeriods
    };
};
