import { EngineSchedule, EngineTask } from '../../engine/schedulerEngine';
import { getTaskTeacherIds, normalizeClassIds, normalizeRooms } from '../../scheduleSharedUtils';
import { getClassDisplayName } from '../../utils';

export type ScheduleValidationIssueType =
    | 'teacher_conflict'
    | 'class_conflict'
    | 'room_conflict'
    | 'missing_required_period'
    | 'locked_slot_mismatch';

export interface ScheduleValidationIssue {
    type: ScheduleValidationIssueType;
    severity: 'error' | 'warning';
    message: string;
    recommendation: string;
    slotId?: string;
    taskIndex?: number;
}

export interface PostScheduleValidationInput {
    tasks: EngineTask[];
    timetable: EngineSchedule;
}

export interface PostScheduleValidationResult {
    issues: ScheduleValidationIssue[];
    conflictCount: number;
    missingRequiredPeriods: number;
    lockedSlotMismatchCount: number;
    actualPlacedPeriods: number;
    isValid: boolean;
}

const getPlacementKey = (taskId: number | undefined, courseId: string, groupNumber: number | undefined) =>
    taskId === undefined ? `${courseId}|${groupNumber || 0}` : `task-${taskId}`;

const pushConflictIssue = (
    issues: ScheduleValidationIssue[],
    type: Extract<ScheduleValidationIssueType, 'teacher_conflict' | 'class_conflict' | 'room_conflict'>,
    slotId: string,
    label: string,
    count: number
) => {
    const noun = type === 'teacher_conflict'
        ? 'ครู'
        : type === 'class_conflict'
        ? 'ชั้น/ห้อง'
        : 'ห้อง/สถานที่';
    issues.push({
        type,
        severity: 'error',
        slotId,
        message: `${noun} ${label} มีรายการชนกัน ${count} รายการในคาบ ${slotId}`,
        recommendation: `ตรวจคาบ ${slotId} แล้วปลดล็อกหรือย้ายหนึ่งในรายการของ ${label}`
    });
};

export const validatePostSchedule = ({
    tasks,
    timetable
}: PostScheduleValidationInput): PostScheduleValidationResult => {
    const issues: ScheduleValidationIssue[] = [];
    const placedSlotsByTask = new Map<number, Set<string>>();

    Object.entries(timetable).forEach(([slotId, occupancies]) => {
        const teacherPlacements = new Map<string, Set<string>>();
        const classPlacements = new Map<string, Set<string>>();
        const roomPlacements = new Map<string, Set<string>>();

        occupancies.forEach((occupancy) => {
            const placementKey = getPlacementKey(occupancy.taskId, occupancy.courseId, occupancy.groupNumber);
            if (occupancy.taskId !== undefined) {
                if (!placedSlotsByTask.has(occupancy.taskId)) placedSlotsByTask.set(occupancy.taskId, new Set());
                placedSlotsByTask.get(occupancy.taskId)!.add(slotId);
            }

            if (!teacherPlacements.has(occupancy.teacherId)) teacherPlacements.set(occupancy.teacherId, new Set());
            teacherPlacements.get(occupancy.teacherId)!.add(placementKey);

            normalizeClassIds(occupancy.classId).forEach(classId => {
                if (!classPlacements.has(classId)) classPlacements.set(classId, new Set());
                classPlacements.get(classId)!.add(placementKey);
            });

            normalizeRooms(occupancy.room).forEach(roomId => {
                if (!roomPlacements.has(roomId)) roomPlacements.set(roomId, new Set());
                roomPlacements.get(roomId)!.add(placementKey);
            });
        });

        teacherPlacements.forEach((placements, teacherId) => {
            if (placements.size > 1) pushConflictIssue(issues, 'teacher_conflict', slotId, teacherId, placements.size);
        });
        classPlacements.forEach((placements, classId) => {
            if (placements.size > 1) pushConflictIssue(issues, 'class_conflict', slotId, getClassDisplayName(classId), placements.size);
        });
        roomPlacements.forEach((placements, roomId) => {
            if (placements.size > 1) pushConflictIssue(issues, 'room_conflict', slotId, roomId, placements.size);
        });
    });

    let actualPlacedPeriods = 0;
    let missingRequiredPeriods = 0;
    let lockedSlotMismatchCount = 0;

    tasks.forEach((task, taskIndex) => {
        const placedSlots = placedSlotsByTask.get(taskIndex) || new Set<string>();
        const placedCount = placedSlots.size;
        actualPlacedPeriods += Math.min(placedCount, task.duration);

        if (placedCount < task.duration) {
            const missing = task.duration - placedCount;
            missingRequiredPeriods += missing;
            const teachers = getTaskTeacherIds(task).join(', ') || task.teacherId;
            issues.push({
                type: 'missing_required_period',
                severity: 'error',
                taskIndex,
                message: `${task.course.code || '-'} ${task.course.title || '-'} ยังขาด ${missing} คาบ (${teachers})`,
                recommendation: 'ลดเงื่อนไขคาบ/ครู/ห้อง หรือเพิ่มช่องสอนที่ไม่ชนก่อนจัดใหม่'
            });
        }

        if (task.requiredSlot && placedCount > 0 && !placedSlots.has(task.requiredSlot)) {
            lockedSlotMismatchCount += 1;
            issues.push({
                type: 'locked_slot_mismatch',
                severity: 'error',
                taskIndex,
                slotId: task.requiredSlot,
                message: `${task.course.code || '-'} ${task.course.title || '-'} ไม่ได้อยู่ในคาบล็อก ${task.requiredSlot}`,
                recommendation: 'ตรวจการล็อกคาบรายวิชานี้ หรือปลดล็อกก่อนจัดใหม่'
            });
        }
    });

    const conflictCount = issues.filter(issue =>
        issue.type === 'teacher_conflict' ||
        issue.type === 'class_conflict' ||
        issue.type === 'room_conflict'
    ).length;

    return {
        issues,
        conflictCount,
        missingRequiredPeriods,
        lockedSlotMismatchCount,
        actualPlacedPeriods,
        isValid: issues.length === 0
    };
};

export const calculatePlacementRates = (
    totalPeriodsRequired: number,
    actualPlacedPeriods: number,
    temporaryPlacedPeriods: number
) => {
    const pct = (value: number) => totalPeriodsRequired > 0
        ? Math.min(100, Math.round((value / totalPeriodsRequired) * 100))
        : 0;
    const temporaryAssistedPeriods = Math.min(totalPeriodsRequired, actualPlacedPeriods + temporaryPlacedPeriods);
    return {
        actualPlacedRate: pct(actualPlacedPeriods),
        temporaryAssistedRate: pct(temporaryAssistedPeriods),
        unresolvedRate: pct(Math.max(0, totalPeriodsRequired - temporaryAssistedPeriods))
    };
};
