import { describe, it, expect } from 'vitest';
import { processTemporaryPlacements } from '../actions/autoSchedule/temporaryPlacer';
import { DAYS } from '../utils';
import type { EngineSchedule, EngineTask, EngineTeachingSlot } from '../engine/schedulerEngine';
import type { Course, PeriodSetting } from '../types';

const makeCourse = (id: string, title = id): Course => ({ id, title, code: id, credits: 1, hoursPerWeek: 1 });

const makeTask = (overrides: Partial<EngineTask> & { course: Course }): EngineTask => ({
    teacherId: 't1',
    targetClasses: ['m1'],
    targetRooms: [],
    instanceCount: 1,
    duration: 1,
    originalCourseId: overrides.course.id,
    compositeId: `${overrides.course.id}_1`,
    groupNumber: 1,
    ...overrides,
});

/** 6-period Monday with no breaks — every period in one uninterrupted teaching run. */
const makeMondaySlots = (periodCount = 6): { slots: EngineTeachingSlot[]; periodSettings: PeriodSetting[] } => {
    const periodSettings: PeriodSetting[] = Array.from({ length: periodCount }, (_, i) => ({
        id: `period-${i + 1}`,
        label: `คาบ ${i + 1}`,
        startTime: `0${8 + i}:00`,
        endTime: `0${9 + i}:00`,
        isTeachingPeriod: true,
    }));
    const slots: EngineTeachingSlot[] = periodSettings.map((ps, i) => ({
        dayKey: 'mon',
        slotId: `mon-${i}`,
        periodSetting: ps,
    }));
    return { slots, periodSettings };
};

const teacherLabel = (id: string) => `ครู-${id}`;

describe('processTemporaryPlacements', () => {
    it('places an unplaced task into a fully clean slot with no conflicts', () => {
        const { slots, periodSettings } = makeMondaySlots();
        const task = makeTask({ course: makeCourse('c1', 'คณิตศาสตร์') });

        const { summaries, temporaryPlacedPeriods } = processTemporaryPlacements({
            unplacedTasks: [task],
            schoolTimetableRecord: {},
            allTeachingSlots: slots,
            periodSettings,
            DAYS,
        }, teacherLabel);

        expect(summaries).toHaveLength(1);
        const summary = summaries[0];
        expect(summary.hasTemporarySlots).toBe(true);
        expect(summary.isForcedTemporary).toBe(false);
        expect(summary.classes).toBe('ม.1');
        expect(summary.teachers).toBe('ครู-t1');
        expect(summary.slots).toBe('จันทร์ คาบ 1'); // first slot tried, no conflict suffix
        expect(temporaryPlacedPeriods).toBe(1);
    });

    it('force-places into the slot with the fewest conflicts when every slot conflicts', () => {
        const { slots, periodSettings } = makeMondaySlots(3);
        const task = makeTask({ course: makeCourse('c1') });

        // mon-0: same teacher already booked (1 conflict).
        // mon-1: same teacher AND a room clash (2 conflicts) — should be avoided in favor of mon-0.
        // mon-2: same teacher already booked (1 conflict) too, so mon-0/mon-2 tie; first found wins.
        const schoolTimetableRecord: EngineSchedule = {
            'mon-0': [{ teacherId: 't1', classId: ['m9'], room: [], courseId: 'other', course: null, groupNumber: 1 }],
            'mon-1': [
                { teacherId: 't1', classId: ['m9'], room: [], courseId: 'other', course: null, groupNumber: 1 },
                { teacherId: 't9', classId: ['m9'], room: ['lab-1'], courseId: 'other2', course: null, groupNumber: 1 },
            ],
            'mon-2': [{ teacherId: 't1', classId: ['m9'], room: [], courseId: 'other', course: null, groupNumber: 1 }],
        };

        const { summaries } = processTemporaryPlacements({
            unplacedTasks: [task],
            schoolTimetableRecord,
            allTeachingSlots: slots,
            periodSettings,
            DAYS,
        }, teacherLabel);

        const summary = summaries[0];
        expect(summary.hasTemporarySlots).toBe(true);
        expect(summary.isForcedTemporary).toBe(true);
        expect(summary.slots).toBe('จันทร์ คาบ 1 (มีชน 1 จุด)');
    });

    it('reports no temporary slot available when every slot conflicts and none can be chosen', () => {
        const task = makeTask({ course: makeCourse('c1') });

        const { summaries, temporaryPlacedPeriods } = processTemporaryPlacements({
            unplacedTasks: [task],
            schoolTimetableRecord: {},
            allTeachingSlots: [], // no teaching slots exist at all
            periodSettings: [],
            DAYS,
        }, teacherLabel);

        const summary = summaries[0];
        expect(summary.hasTemporarySlots).toBe(false);
        expect(summary.isForcedTemporary).toBe(false);
        expect(summary.slots).toBe('ไม่มีคาบชั่วคราวที่ไม่ชนกัน');
        expect(temporaryPlacedPeriods).toBe(0);
    });

    it('marks a conflicting requiredSlot as forced temporary and reports the conflict count', () => {
        const { slots, periodSettings } = makeMondaySlots(3);
        const task = makeTask({ course: makeCourse('c1'), requiredSlot: 'mon-0' });

        const schoolTimetableRecord: EngineSchedule = {
            'mon-0': [{ teacherId: 't1', classId: ['m9'], room: [], courseId: 'other', course: null, groupNumber: 1 }],
        };

        const { summaries } = processTemporaryPlacements({
            unplacedTasks: [task],
            schoolTimetableRecord,
            allTeachingSlots: slots,
            periodSettings,
            DAYS,
        }, teacherLabel);

        const summary = summaries[0];
        expect(summary.hasTemporarySlots).toBe(true);
        expect(summary.isForcedTemporary).toBe(true);
        expect(summary.conflictCount).toBe(1);
        expect(summary.slots).toBe('จันทร์ คาบ 1 (มีชน 1 จุด)');
    });

    it('reports a failed requiredSlot placement for a double-period task with no available partner slot', () => {
        const periodSettings: PeriodSetting[] = [
            { id: 'period-1', label: 'คาบ 1', startTime: '08:00', endTime: '09:00', isTeachingPeriod: true },
        ];
        const slots: EngineTeachingSlot[] = [{ dayKey: 'mon', slotId: 'mon-0', periodSetting: periodSettings[0] }];
        const task = makeTask({ course: makeCourse('c1'), duration: 2, requiredSlot: 'mon-0' });

        const { summaries, temporaryPlacedPeriods } = processTemporaryPlacements({
            unplacedTasks: [task],
            schoolTimetableRecord: {},
            allTeachingSlots: slots,
            periodSettings,
            DAYS,
        }, teacherLabel);

        const summary = summaries[0];
        expect(summary.hasTemporarySlots).toBe(false);
        expect(summary.slots).toBe('ล็อกไว้ จันทร์ คาบ 1 แต่ลงไม่ได้');
        expect(temporaryPlacedPeriods).toBe(0);
    });

    it('sums temporaryPlacedPeriods only across tasks that were actually placed', () => {
        const { slots, periodSettings } = makeMondaySlots();
        const placed = makeTask({ course: makeCourse('c1'), compositeId: 'c1_1' });
        const failed = makeTask({ course: makeCourse('c2'), compositeId: 'c2_1', duration: 2, requiredSlot: 'mon-5' });

        const { temporaryPlacedPeriods } = processTemporaryPlacements({
            unplacedTasks: [placed, failed],
            schoolTimetableRecord: {},
            allTeachingSlots: slots,
            periodSettings,
            DAYS,
        }, teacherLabel);

        // `placed` succeeds (1 period); `failed` has no partner for period index 5
        // (last in the run), so it contributes 0.
        expect(temporaryPlacedPeriods).toBe(1);
    });
});
