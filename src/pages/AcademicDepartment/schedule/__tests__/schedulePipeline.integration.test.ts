import { describe, expect, it } from 'vitest';
import { runSchedulingEngine } from '../engine/schedulerEngine';
import type { EngineTask, EngineTeachingSlot } from '../engine/schedulerEngine';
import { processTemporaryPlacements } from '../actions/autoSchedule/temporaryPlacer';
import { calculatePlacementRates, validatePostSchedule } from '../actions/autoSchedule/postScheduleValidator';
import { calculateBBLCompliance } from '../scheduleMetrics';
import { DAYS } from '../utils';
import type { Course, PeriodSetting } from '../types';

const dayKeys = ['mon', 'tue', 'wed', 'thu', 'fri'];
const periodTimes = ['08:20', '09:10', '10:10', '11:00', '13:00', '13:50'];

const periodSettings: PeriodSetting[] = periodTimes.map((startTime, index) => ({
    id: `period-${index + 1}`,
    label: `คาบ ${index + 1}`,
    startTime,
    endTime: startTime,
    isTeachingPeriod: true,
}));

const teachingSlots: EngineTeachingSlot[] = dayKeys.flatMap(dayKey =>
    periodSettings.map((periodSetting, index) => ({
        dayKey,
        periodSetting,
        slotId: `${dayKey}-${index}`,
    }))
);

const allSlotIds = teachingSlots.map(slot => slot.slotId);

const course = (id: string, title: string): Course => ({
    id,
    title,
    code: id.toUpperCase(),
    credits: 1,
    hoursPerWeek: 1,
});

const task = (
    courseData: Course,
    teacherId: string,
    classId: string,
    index: number,
    overrides: Partial<EngineTask> = {}
): EngineTask => ({
    course: courseData,
    teacherId,
    targetClasses: [classId],
    targetRooms: overrides.targetRooms || ['all'],
    instanceCount: 1,
    duration: overrides.duration || 1,
    originalCourseId: courseData.id,
    compositeId: `${courseData.id}_${index}`,
    groupNumber: index,
    ...overrides,
});

describe('school-wide scheduling pipeline integration', () => {
    it('places a realistic school dataset, validates the result, and reports honest rates', () => {
        const tasks: EngineTask[] = [
            task(course('thai-m1', 'ภาษาไทย'), 'teacher-thai', 'm1', 1),
            task(course('math-m1', 'คณิตศาสตร์'), 'teacher-math', 'm1', 1),
            task(course('science-m1', 'วิทยาศาสตร์'), 'teacher-science', 'm1', 1, { duration: 2 }),
            task(course('social-m1', 'สังคมศึกษา'), 'teacher-social', 'm1', 1),
            task(course('art-m1', 'ศิลปะ'), 'teacher-art', 'm1', 1),
            task(course('thai-m2', 'ภาษาไทย'), 'teacher-thai', 'm2', 1),
            task(course('math-m2', 'คณิตศาสตร์'), 'teacher-math', 'm2', 1),
            task(course('science-m2', 'วิทยาศาสตร์'), 'teacher-science', 'm2', 1, { duration: 2 }),
            task(course('social-m2', 'สังคมศึกษา'), 'teacher-social', 'm2', 1),
            task(course('pe-m2', 'พละศึกษา'), 'teacher-pe', 'm2', 1),
        ];

        const result = runSchedulingEngine({
            tasks,
            initialTimetable: {},
            initialBatchUpdates: {},
            allTeachingSlots: teachingSlots,
            validSlotsByTaskIndex: tasks.map(() => allSlotIds),
            assignmentConstraints: {},
            maxRuns: 15,
            maxRepairAttempts: 300,
        });

        const temporary = processTemporaryPlacements({
            unplacedTasks: result.unplacedTasks,
            schoolTimetableRecord: result.schoolTimetableRecord,
            allTeachingSlots: teachingSlots,
            periodSettings,
            DAYS,
        }, teacherId => teacherId);
        const validation = validatePostSchedule({ tasks, timetable: result.schoolTimetableRecord });
        const totalRequired = tasks.reduce((sum, item) => sum + item.duration, 0);
        const rates = calculatePlacementRates(totalRequired, validation.actualPlacedPeriods, temporary.temporaryPlacedPeriods);
        const bblRate = calculateBBLCompliance(result.schoolTimetableRecord, tasks.map(item => item.course), periodSettings);

        expect(result.unplacedTasks).toHaveLength(0);
        expect(validation.isValid).toBe(true);
        expect(validation.actualPlacedPeriods).toBe(totalRequired);
        expect(rates.actualPlacedRate).toBe(100);
        expect(rates.temporaryAssistedRate).toBe(100);
        expect(temporary.temporaryPlacedPeriods).toBe(0);
        expect(bblRate).toBeGreaterThanOrEqual(75);
    });

    it('surfaces temporary assistance without inflating the actual placement rate', () => {
        const lockedA = task(course('locked-a', 'ภาษาไทย'), 'teacher-a', 'm1', 1, { requiredSlot: 'mon-0' });
        const lockedB = task(course('locked-b', 'คณิตศาสตร์'), 'teacher-a', 'm2', 1, { compositeId: 'locked-b_1', requiredSlot: 'mon-0' });
        const result = runSchedulingEngine({
            tasks: [lockedA, lockedB],
            initialTimetable: {},
            initialBatchUpdates: {},
            allTeachingSlots: teachingSlots,
            validSlotsByTaskIndex: [allSlotIds, allSlotIds],
            assignmentConstraints: {},
            maxRuns: 5,
            maxRepairAttempts: 20,
        });

        const temporary = processTemporaryPlacements({
            unplacedTasks: result.unplacedTasks,
            schoolTimetableRecord: result.schoolTimetableRecord,
            allTeachingSlots: teachingSlots,
            periodSettings,
            DAYS,
        }, teacherId => teacherId);
        const validation = validatePostSchedule({ tasks: [lockedA, lockedB], timetable: result.schoolTimetableRecord });
        const rates = calculatePlacementRates(2, validation.actualPlacedPeriods, temporary.temporaryPlacedPeriods);

        expect(result.unplacedTasks).toHaveLength(1);
        expect(validation.actualPlacedPeriods).toBe(1);
        expect(temporary.temporaryPlacedPeriods).toBe(1);
        expect(temporary.summaries[0].isForcedTemporary).toBe(true);
        expect(rates.actualPlacedRate).toBe(50);
        expect(rates.temporaryAssistedRate).toBe(100);
    });
});
