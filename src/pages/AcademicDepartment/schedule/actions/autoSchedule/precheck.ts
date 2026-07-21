import { EngineTask, EngineTeachingSlot } from '../../engine/schedulerEngine';
import { getTaskTeacherIds } from '../../scheduleSharedUtils';
import { DAYS, getClassDisplayName, getPartnerIndexForPeriods } from '../../utils';
import { AssignmentConstraintMap, PeriodSetting, Teacher } from '../../types';

export interface PrecheckInput {
    tasks: EngineTask[];
    allTeachingSlots: EngineTeachingSlot[];
    periodSettings: PeriodSetting[];
    tasksPerClass: Record<string, number>;
    tasksPerTeacher: Record<string, number>;
    tasksPerRoom: Record<string, number>;
    teachersMap: Record<string, Teacher>;
    dynamicUnavailableSlots: string[];
    selectedTeacher: string;
    assignmentConstraints: AssignmentConstraintMap;
    /** Per-task set of slot IDs that pass the normal (non-relaxed) placement constraints. */
    validSlotsByTask: Map<EngineTask, Set<string>>;
    dataReadinessWarnings: string[];
    skippedCourseIssues: string[];
}

export interface PrecheckResult {
    fatalIssues: string[];
    warningIssues: string[];
}

/**
 * Pure data-validation pass run before the (expensive) scheduling engine: catches
 * conflicts and over-commitments that are mathematically guaranteed to make full
 * placement impossible, so the user gets actionable feedback immediately instead
 * of waiting for a slow run that was always going to fail.
 */
export const runSchedulePrecheck = (input: PrecheckInput): PrecheckResult => {
    const {
        tasks,
        allTeachingSlots,
        periodSettings,
        tasksPerClass,
        tasksPerTeacher,
        tasksPerRoom,
        teachersMap,
        dynamicUnavailableSlots,
        selectedTeacher,
        assignmentConstraints,
        validSlotsByTask,
        dataReadinessWarnings,
        skippedCourseIssues
    } = input;

    const teacherLabel = (teacherId: string) => {
        const teacher = teachersMap[teacherId];
        return teacher?.name || `${teacher?.title || ''}${teacher?.firstName || ''} ${teacher?.lastName || ''}`.trim() || teacherId;
    };

    const taskLabel = (task: EngineTask) => {
        const classes = task.targetClasses.map(getClassDisplayName).join(', ');
        const teacherNames = getTaskTeacherIds(task).map(teacherLabel).join(', ');
        return `${task.course.code || '-'} ${task.course.title} (${teacherNames} / ${classes || '-'})`;
    };

    const getTaskSessionSlots = (task: EngineTask) => {
        if (!task.requiredSlot) return [];
        if (task.duration <= 1) return [task.requiredSlot];

        const [dayKey, indexStr] = task.requiredSlot.split('-');
        const startIndex = Number(indexStr);
        const partnerIndex = getPartnerIndexForPeriods(startIndex, periodSettings);
        if (partnerIndex === -1 || partnerIndex <= startIndex) return [task.requiredSlot];

        const partnerSlotId = `${dayKey}-${partnerIndex}`;
        const partnerSlot = allTeachingSlots.find(slot => slot.slotId === partnerSlotId);
        return partnerSlot?.periodSetting.isTeachingPeriod
            ? [task.requiredSlot, partnerSlotId]
            : [task.requiredSlot];
    };

    const lockedSlotLabel = (slot: { day: string; periodId: string } | string): string => {
        if (typeof slot !== 'string') {
            return `วัน${DAYS[slot.day as keyof typeof DAYS] || slot.day} คาบ ${slot.periodId}`;
        }
        const [dayKey, periodIndex] = slot.split('-');
        if (!periodIndex) return slot;
        return `วัน${DAYS[dayKey as keyof typeof DAYS] || dayKey} คาบ ${periodIndex}`;
    };

    /** Explains *why* a task ended up with very few valid slots, when the cause traces back
     * to a lock/preference set on the Period Constraints page, so the warning tells the user
     * where to go fix it instead of just reporting the symptom. */
    const describeLowSlotCause = (task: EngineTask): string | null => {
        const constraint = assignmentConstraints[task.compositeId];
        if (!constraint) return null;

        const causes: string[] = [];

        if (constraint.isLocked && constraint.lockedSlots?.length) {
            causes.push(`ถูกล็อกคาบไว้ที่ ${constraint.lockedSlots.map(lockedSlotLabel).join(', ')}`);
        }
        if (constraint.excludedDays?.length) {
            causes.push(`ถูกยกเว้นวัน${constraint.excludedDays.map(d => DAYS[d as keyof typeof DAYS] || d).join(', ')}`);
        }
        const timePreference = task.duration >= 2 ? constraint.doublePreference : constraint.singlePreference;
        if (timePreference && timePreference !== 'any') {
            causes.push(`ถูกกำหนดให้ลงได้เฉพาะช่วง${timePreference === 'morning' ? 'เช้า' : 'บ่าย'}`);
        }
        if (constraint.layoutPreference && constraint.layoutPreference !== 'any') {
            const layoutLabel = {
                double_only: 'ต้องเป็นคาบคู่เท่านั้น',
                single_only: 'ต้องเป็นคาบเดี่ยวเท่านั้น',
                mixed: 'รูปแบบผสม',
            }[constraint.layoutPreference];
            if (layoutLabel) causes.push(layoutLabel);
        }

        if (causes.length === 0) return null;
        return `${causes.join(' และ')} (ตั้งค่าไว้ที่หน้าล็อกคาบสอน)`;
    };

    const fatalIssues: string[] = [];
    const warningIssues: string[] = [...dataReadinessWarnings, ...skippedCourseIssues];
    const teachingSlotCapacity = allTeachingSlots.length;

    Object.entries(tasksPerClass).forEach(([classId, count]) => {
        if (count > teachingSlotCapacity) {
            fatalIssues.push(`ชั้น ${getClassDisplayName(classId)} มี ${count} คาบ แต่มีช่องสอนได้สูงสุด ${teachingSlotCapacity} คาบ/สัปดาห์`);
        }
    });

    Object.entries(tasksPerTeacher).forEach(([teacherId, count]) => {
        const teacher = teachersMap[teacherId];
        const availableForTeacher = allTeachingSlots.filter(({ dayKey, slotId }) => {
            if (teacher?.preferences?.unavailableDays?.includes(dayKey)) return false;
            if (teacher?.preferences?.unavailableSlots?.includes(slotId)) return false;
            if (selectedTeacher === teacherId && dynamicUnavailableSlots.includes(slotId)) return false;
            return true;
        }).length;

        if (count > availableForTeacher) {
            fatalIssues.push(`ครู ${teacherLabel(teacherId)} ถูกมอบหมาย ${count} คาบ แต่มีเวลาว่างสำหรับสอนได้ประมาณ ${availableForTeacher} คาบ`);
        }
    });

    Object.entries(tasksPerRoom).forEach(([roomId, count]) => {
        if (count > teachingSlotCapacity) {
            fatalIssues.push(`ห้อง/สถานที่ ${roomId} ถูกใช้ ${count} คาบ แต่มีช่องใช้งานสูงสุด ${teachingSlotCapacity} คาบ/สัปดาห์`);
        }
    });

    const requiredTeacherSlot = new Map<string, EngineTask[]>();
    const requiredClassSlot = new Map<string, EngineTask[]>();
    const requiredRoomSlot = new Map<string, EngineTask[]>();

    tasks.filter(task => task.requiredSlot).forEach(task => {
        const sessionSlots = getTaskSessionSlots(task);
        const requiredSlotExists = allTeachingSlots.some(slot => slot.slotId === task.requiredSlot);
        if (!requiredSlotExists) {
            // The locked slot ID doesn't match any current teaching period — most likely the
            // period settings were changed/removed after this lock was saved. Without this
            // check the task would silently never be placeable and only surface as a vague
            // "unplaced" result after the (slow) scheduling run.
            fatalIssues.push(`${taskLabel(task)} ถูกล็อกไว้ที่คาบ ${task.requiredSlot} ซึ่งไม่มีอยู่ในตารางคาบสอนปัจจุบัน (อาจเป็นคาบที่ถูกลบหรือเปลี่ยนแปลงไปแล้ว) กรุณาแก้ไขการล็อกคาบของรายวิชานี้ก่อนจัดตาราง`);
        } else if (task.duration > 1 && sessionSlots.length !== task.duration) {
            fatalIssues.push(`${taskLabel(task)} ถูกกำหนดเป็นคาบคู่ แต่คาบล็อค ${task.requiredSlot} ไม่สามารถจับคู่เป็นบล็อกคาบคู่ได้`);
        }

        sessionSlots.forEach(slotId => {
            getTaskTeacherIds(task).forEach(teacherId => {
                const teacherKey = `${teacherId}|${slotId}`;
                requiredTeacherSlot.set(teacherKey, [...(requiredTeacherSlot.get(teacherKey) || []), task]);
            });

            task.targetClasses.forEach(classId => {
                const classKey = `${classId}|${slotId}`;
                requiredClassSlot.set(classKey, [...(requiredClassSlot.get(classKey) || []), task]);
            });

            task.targetRooms
                .filter(roomId => roomId && roomId.toLowerCase() !== 'all')
                .forEach(roomId => {
                    const roomKey = `${roomId}|${slotId}`;
                    requiredRoomSlot.set(roomKey, [...(requiredRoomSlot.get(roomKey) || []), task]);
                });
        });
    });

    requiredTeacherSlot.forEach((slotTasks, key) => {
        if (slotTasks.length <= 1) return;
        const [teacherId, slotId] = key.split('|');
        fatalIssues.push(`ล็อกคาบชนกัน: ครู ${teacherLabel(teacherId)} ถูกล็อก ${slotTasks.length} รายวิชาในคาบ ${slotId}`);
    });

    requiredClassSlot.forEach((slotTasks, key) => {
        if (slotTasks.length <= 1) return;
        const [classId, slotId] = key.split('|');
        fatalIssues.push(`ล็อกคาบชนกัน: ชั้น ${getClassDisplayName(classId)} ถูกล็อก ${slotTasks.length} รายวิชาในคาบ ${slotId}`);
    });

    requiredRoomSlot.forEach((slotTasks, key) => {
        if (slotTasks.length <= 1) return;
        const [roomId, slotId] = key.split('|');
        fatalIssues.push(`ล็อกคาบชนกัน: ห้อง/สถานที่ ${roomId} ถูกล็อก ${slotTasks.length} รายวิชาในคาบ ${slotId}`);
    });

    tasks.forEach(task => {
        const validSlotCount = validSlotsByTask.get(task)?.size || 0;
        if (validSlotCount > 2) return;

        const lockCause = describeLowSlotCause(task);
        if (validSlotCount === 0) {
            warningIssues.push(
                lockCause
                    ? `${taskLabel(task)} ไม่มีช่องที่ผ่านเงื่อนไขปกติ เนื่องจาก${lockCause} ระบบจะลองวางในช่องสอนว่างที่ไม่ชนกันเป็นทางเลือกสุดท้าย`
                    : `${taskLabel(task)} ไม่มีช่องที่ผ่านเงื่อนไขปกติ ระบบจะลองวางในช่องสอนว่างที่ไม่ชนกันเป็นทางเลือกสุดท้าย`
            );
        } else {
            warningIssues.push(
                lockCause
                    ? `${taskLabel(task)} มีช่องที่เป็นไปได้เพียง ${validSlotCount} ช่อง เนื่องจาก${lockCause}`
                    : `${taskLabel(task)} มีช่องที่เป็นไปได้เพียง ${validSlotCount} ช่อง (สาเหตุอาจมาจากตารางครู/ห้องเรียนที่แน่นอยู่แล้วในช่วงที่เหลือ)`
            );
        }
    });

    return { fatalIssues, warningIssues };
};
