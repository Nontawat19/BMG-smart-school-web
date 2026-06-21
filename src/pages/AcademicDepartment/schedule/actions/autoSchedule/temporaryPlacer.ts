import { PeriodSetting } from '../../types';
import { EngineSchedule, EngineTask, EngineTeachingSlot } from '../../engine/schedulerEngine';
import { getTaskTeacherIds } from '../../scheduleSharedUtils';
import { getPartnerIndexForPeriods, DAYS, getClassDisplayName } from '../../utils';

export interface TemporaryPlacerInput {
    unplacedTasks: EngineTask[];
    schoolTimetableRecord: EngineSchedule;
    allTeachingSlots: EngineTeachingSlot[];
    periodSettings: PeriodSetting[];
    DAYS: Record<string, string>;
}

export interface TemporaryTaskSummary {
    code: string;
    title: string;
    classes: string;
    teachers: string;
    hasTemporarySlots: boolean;
    isForcedTemporary: boolean;
    conflictCount: number;
    slots: string;
}

const getSpecificRooms = (rooms?: string | string[]): string[] => {
    const list = Array.isArray(rooms) ? rooms : (rooms ? [rooms] : []);
    return list.filter(roomId => roomId && roomId.toLowerCase() !== 'all');
};

const getTemporaryPlacementConflicts = (
    task: EngineTask,
    slotId: string,
    schoolTimetableRecord: EngineSchedule
) => {
    const teacherIds = getTaskTeacherIds(task);
    const taskRooms = getSpecificRooms(task.targetRooms);
    const taskGroup = Number(task.groupNumber || 0);
    const occupancies = schoolTimetableRecord[slotId] || [];

    return occupancies.filter((occupancy) => {
        if (teacherIds.includes(occupancy.teacherId)) return true;

        const occupancyClasses = Array.isArray(occupancy.classId)
            ? occupancy.classId
            : [occupancy.classId].filter(Boolean);
        const hasSharedClass = task.targetClasses.some(classId => occupancyClasses.includes(classId));
        if (hasSharedClass) {
            const occupancyGroup = Number(occupancy.groupNumber || occupancy.course?.groupNumber || 0);
            if (occupancyGroup === 0 || taskGroup === 0 || occupancyGroup === taskGroup) return true;
        }

        const occupancyRooms = getSpecificRooms(occupancy.room || occupancy.course?.room || []);
        return taskRooms.some(roomId => occupancyRooms.includes(roomId));
    });
};

const hasTemporaryPlacementConflict = (
    task: EngineTask,
    slotId: string,
    schoolTimetableRecord: EngineSchedule
): boolean =>
    getTemporaryPlacementConflicts(task, slotId, schoolTimetableRecord).length > 0;

const getTemporarySessionSlots = (
    task: EngineTask,
    startSlotId: string,
    periodSettings: PeriodSetting[],
    allTeachingSlots: EngineTeachingSlot[]
): string[] => {
    if (task.duration <= 1) return [startSlotId];

    const [dayKey, indexStr] = startSlotId.split('-');
    const startIdx = parseInt(indexStr);
    const partnerIdx = getPartnerIndexForPeriods(startIdx, periodSettings);
    if (partnerIdx === -1 || partnerIdx <= startIdx) return [];

    const partnerSlotId = `${dayKey}-${partnerIdx}`;
    const partner = allTeachingSlots.find(s => s.slotId === partnerSlotId);
    return partner?.periodSetting.isTeachingPeriod ? [startSlotId, partnerSlotId] : [];
};

const formatSlotLabel = (slotId: string, periodSettings: PeriodSetting[]): string => {
    const [dayKey, indexStr] = slotId.split('-');
    const periodIndex = Number(indexStr);
    const dayLabel = DAYS[dayKey as keyof typeof DAYS] || dayKey;
    const periodLabel = periodSettings[periodIndex]?.label || `คาบ ${periodIndex}`;
    return `${dayLabel} ${periodLabel}`;
};

const formatSlotList = (slotIds: string[], periodSettings: PeriodSetting[]): string =>
    slotIds.map(id => formatSlotLabel(id, periodSettings)).join(' + ');

const findTemporarySlots = (
    task: EngineTask,
    allTeachingSlots: EngineTeachingSlot[],
    periodSettings: PeriodSetting[],
    schoolTimetableRecord: EngineSchedule
): string[] => {
    if (task.requiredSlot) {
        const sessionSlots = getTemporarySessionSlots(task, task.requiredSlot, periodSettings, allTeachingSlots);
        if (sessionSlots.length !== task.duration) return [];
        return sessionSlots.every(slotId => !hasTemporaryPlacementConflict(task, slotId, schoolTimetableRecord))
            ? sessionSlots
            : [];
    }
    for (const slot of allTeachingSlots) {
        const sessionSlots = getTemporarySessionSlots(task, slot.slotId, periodSettings, allTeachingSlots);
        if (sessionSlots.length === 0) continue;
        if (sessionSlots.every(slotId => !hasTemporaryPlacementConflict(task, slotId, schoolTimetableRecord))) {
            return sessionSlots;
        }
    }
    return [];
};

const findForcedTemporarySlots = (
    task: EngineTask,
    allTeachingSlots: EngineTeachingSlot[],
    periodSettings: PeriodSetting[],
    schoolTimetableRecord: EngineSchedule
): string[] => {
    const candidateStarts = task.requiredSlot
        ? allTeachingSlots.filter(slot => slot.slotId === task.requiredSlot)
        : allTeachingSlots;
    let best: { slots: string[]; conflictCount: number } | null = null;

    for (const slot of candidateStarts) {
        const sessionSlots = getTemporarySessionSlots(task, slot.slotId, periodSettings, allTeachingSlots);
        if (sessionSlots.length !== task.duration) continue;
        const conflictCount = sessionSlots.reduce(
            (sum, slotId) => sum + getTemporaryPlacementConflicts(task, slotId, schoolTimetableRecord).length,
            0
        );

        if (!best || conflictCount < best.conflictCount) {
            best = { slots: sessionSlots, conflictCount };
        }
    }

    return best?.slots || [];
};

export const processTemporaryPlacements = (
    input: TemporaryPlacerInput,
    teacherLabel: (id: string) => string
): { summaries: TemporaryTaskSummary[]; temporaryPlacedPeriods: number } => {
    const { unplacedTasks, schoolTimetableRecord, allTeachingSlots, periodSettings } = input;

    let temporaryPlacedPeriods = 0;

    const summaries: TemporaryTaskSummary[] = unplacedTasks.map(task => {
        const cleanSlotIds = findTemporarySlots(task, allTeachingSlots, periodSettings, schoolTimetableRecord);
        const slotIds = cleanSlotIds.length === task.duration
            ? cleanSlotIds
            : findForcedTemporarySlots(task, allTeachingSlots, periodSettings, schoolTimetableRecord);
        const teacherIds = getTaskTeacherIds(task);
        const classes = task.targetClasses.map(getClassDisplayName).join(', ');
        const hasTemporarySlots = slotIds.length === task.duration;
        const isForcedTemporary = hasTemporarySlots && cleanSlotIds.length !== task.duration;
        const conflictCount = hasTemporarySlots
            ? slotIds.reduce((sum, slotId) => sum + getTemporaryPlacementConflicts(task, slotId, schoolTimetableRecord).length, 0)
            : 0;
        const warning = task.requiredSlot
            ? `คาบที่ล็อกไว้ลงไม่ได้: ${task.course.code || '-'} ${task.course.title || '-'} / ${classes || '-'} / คาบล็อก ${task.requiredSlot} กรุณาตรวจสอบครู ห้องเรียน หรือคาบที่ชนกัน`
            : isForcedTemporary
            ? `บังคับวางชั่วคราวในคาบที่ชนน้อยที่สุด: ${task.course.code || '-'} ${task.course.title || '-'} / ${classes || '-'} มีรายการชน ${conflictCount} จุด กรุณาตรวจสอบและย้าย/สลับคาบ`
            : hasTemporarySlots
            ? `จัดลงตารางจริงไม่ได้: ${task.course.code || '-'} ${task.course.title || '-'} / ${classes || '-'} กรุณาตรวจสอบเงื่อนไขครู ห้องเรียน หรือคาบว่าง`
            : `จัดลงตารางจริงไม่ได้ และไม่มีคาบชั่วคราวที่ไม่ชนกัน: ${task.course.code || '-'} ${task.course.title || '-'} / ${classes || '-'} กรุณาตรวจสอบเงื่อนไขครู ห้องเรียน หรือคาบว่าง`;

        if (hasTemporarySlots) temporaryPlacedPeriods += task.duration;

        return {
            code: task.course.code || '-',
            title: task.course.title || '-',
            classes: classes || '-',
            teachers: teacherIds.map(teacherLabel).join(', ') || '-',
            hasTemporarySlots,
            isForcedTemporary,
            conflictCount,
            slots: hasTemporarySlots
                ? `${formatSlotList(slotIds, periodSettings)}${isForcedTemporary ? ` (มีชน ${conflictCount} จุด)` : ''}`
                : (task.requiredSlot
                    ? `ล็อกไว้ ${formatSlotLabel(task.requiredSlot, periodSettings)} แต่ลงไม่ได้`
                    : 'ไม่มีคาบชั่วคราวที่ไม่ชนกัน')
        };
    });

    return { summaries, temporaryPlacedPeriods };
};
