import { describe, it, expect } from 'vitest';
import { runSchedulePrecheck } from '../actions/autoSchedule/precheck';
import type { EngineTask, EngineTeachingSlot } from '../engine/schedulerEngine';
import type { AssignmentConstraintMap, Course, PeriodSetting, Teacher } from '../types';

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

const baseArgs = (overrides: Partial<Parameters<typeof runSchedulePrecheck>[0]> = {}): Parameters<typeof runSchedulePrecheck>[0] => {
    const { slots, periodSettings } = makeMondaySlots();
    return {
        tasks: [],
        allTeachingSlots: slots,
        periodSettings,
        tasksPerClass: {},
        tasksPerTeacher: {},
        tasksPerRoom: {},
        teachersMap: {},
        dynamicUnavailableSlots: [],
        selectedTeacher: '',
        assignmentConstraints: {},
        validSlotsByTask: new Map(),
        dataReadinessWarnings: [],
        skippedCourseIssues: [],
        ...overrides,
    };
};

describe('runSchedulePrecheck', () => {
    it('reports no fatal issues for a perfectly schedulable input', () => {
        const task = makeTask({ course: makeCourse('c1') });
        const result = runSchedulePrecheck(baseArgs({
            tasks: [task],
            tasksPerClass: { m1: 1 },
            tasksPerTeacher: { t1: 1 },
            validSlotsByTask: new Map([[task, new Set(['mon-0', 'mon-1', 'mon-2'])]]),
        }));

        expect(result.fatalIssues).toHaveLength(0);
    });

    it('flags a class that needs more periods than there are teaching slots in the week', () => {
        const result = runSchedulePrecheck(baseArgs({
            tasksPerClass: { m1: 100 }, // only 6 slots exist (makeMondaySlots default)
        }));

        expect(result.fatalIssues.some(issue => issue.includes('100'))).toBe(true);
    });

    it('flags a teacher assigned more periods than their available (non-unavailable) slots', () => {
        const teacher: Teacher = { id: 't1', name: 'ครูสมชาย', preferences: { unavailableSlots: ['mon-0', 'mon-1', 'mon-2', 'mon-3', 'mon-4'] } };
        // Only mon-5 remains available for t1, but they're assigned 2 periods.
        const result = runSchedulePrecheck(baseArgs({
            tasksPerTeacher: { t1: 2 },
            teachersMap: { t1: teacher },
        }));

        expect(result.fatalIssues.some(issue => issue.includes('ครูสมชาย'))).toBe(true);
    });

    it('flags a room booked beyond the weekly teaching slot capacity', () => {
        const result = runSchedulePrecheck(baseArgs({
            tasksPerRoom: { 'lab-1': 100 },
        }));

        expect(result.fatalIssues.some(issue => issue.includes('lab-1'))).toBe(true);
    });

    it('flags a requiredSlot that no longer exists in the current teaching-period layout', () => {
        const task = makeTask({ course: makeCourse('c1'), requiredSlot: 'mon-99' });
        const result = runSchedulePrecheck(baseArgs({ tasks: [task] }));

        expect(result.fatalIssues.some(issue => issue.includes('mon-99'))).toBe(true);
    });

    it('flags a double-period requiredSlot with no pairable partner slot', () => {
        // Single-period layout — period index 5 (last) has no period 6 to pair with.
        const { slots, periodSettings } = makeMondaySlots(6);
        const task = makeTask({ course: makeCourse('c1'), duration: 2, requiredSlot: 'mon-5' });
        const result = runSchedulePrecheck(baseArgs({ tasks: [task], allTeachingSlots: slots, periodSettings }));

        expect(result.fatalIssues.some(issue => issue.includes('คาบคู่'))).toBe(true);
    });

    it('flags two different tasks locked to the same teacher+slot', () => {
        const taskA = makeTask({ course: makeCourse('c1'), teacherId: 't1', requiredSlot: 'mon-0' });
        const taskB = makeTask({ course: makeCourse('c2'), teacherId: 't1', compositeId: 'c2_1', requiredSlot: 'mon-0' });
        const result = runSchedulePrecheck(baseArgs({ tasks: [taskA, taskB] }));

        expect(result.fatalIssues.some(issue => issue.includes('ล็อกคาบชนกัน') && issue.includes('ครู'))).toBe(true);
    });

    it('flags two different tasks locked to the same class+slot', () => {
        const taskA = makeTask({ course: makeCourse('c1'), teacherId: 't1', targetClasses: ['m1'], requiredSlot: 'mon-0' });
        const taskB = makeTask({ course: makeCourse('c2'), teacherId: 't2', targetClasses: ['m1'], compositeId: 'c2_1', requiredSlot: 'mon-0' });
        const result = runSchedulePrecheck(baseArgs({ tasks: [taskA, taskB] }));

        expect(result.fatalIssues.some(issue => issue.includes('ล็อกคาบชนกัน') && issue.includes('ชั้น'))).toBe(true);
    });

    it('flags two different tasks locked to the same specific room+slot', () => {
        const taskA = makeTask({ course: makeCourse('c1'), teacherId: 't1', targetRooms: ['lab-1'], requiredSlot: 'mon-0' });
        const taskB = makeTask({ course: makeCourse('c2'), teacherId: 't2', targetRooms: ['lab-1'], compositeId: 'c2_1', requiredSlot: 'mon-0' });
        const result = runSchedulePrecheck(baseArgs({ tasks: [taskA, taskB] }));

        expect(result.fatalIssues.some(issue => issue.includes('ล็อกคาบชนกัน') && issue.includes('ห้อง'))).toBe(true);
    });

    // Regression coverage: elective/rotation-group courses (e.g. ทัศนศิลป์, สุขศึกษา) share a
    // coarse, grade-level-only classId (per CLASS_MAPPING — no per-room granularity), so two
    // DIFFERENT locked courses in different rooms used to be wrongly reported as a fatal
    // "ล็อกคาบชนกัน" (locked-slot conflict) that blocked the entire auto-schedule run.
    it('does not treat two different locked tasks sharing a coarse classId as conflicting when their rooms are distinct', () => {
        const taskA = makeTask({ course: makeCourse('art'), teacherId: 't1', targetClasses: ['m3'], targetRooms: ['room-313'], requiredSlot: 'mon-0' });
        const taskB = makeTask({ course: makeCourse('health'), teacherId: 't2', targetClasses: ['m3'], targetRooms: ['room-117'], compositeId: 'health_1', requiredSlot: 'mon-0' });
        const result = runSchedulePrecheck(baseArgs({ tasks: [taskA, taskB] }));

        expect(result.fatalIssues.some(issue => issue.includes('ล็อกคาบชนกัน') && issue.includes('ชั้น'))).toBe(false);
    });

    it('still flags two different locked tasks sharing a coarse classId when rooms overlap or are unspecified', () => {
        const taskA = makeTask({ course: makeCourse('art'), teacherId: 't1', targetClasses: ['m3'], targetRooms: ['room-313'], requiredSlot: 'mon-0' });
        const taskB = makeTask({ course: makeCourse('health'), teacherId: 't2', targetClasses: ['m3'], targetRooms: ['room-313'], compositeId: 'health_1', requiredSlot: 'mon-0' });
        const result = runSchedulePrecheck(baseArgs({ tasks: [taskA, taskB] }));

        expect(result.fatalIssues.some(issue => issue.includes('ล็อกคาบชนกัน') && issue.includes('ชั้น'))).toBe(true);
    });

    it('does not treat two tasks sharing a requiredSlot as conflicting when rooms are both "all"', () => {
        const taskA = makeTask({ course: makeCourse('c1'), teacherId: 't1', targetClasses: ['m1'], targetRooms: ['all'], requiredSlot: 'mon-0' });
        const taskB = makeTask({ course: makeCourse('c2'), teacherId: 't2', targetClasses: ['m2'], targetRooms: ['all'], compositeId: 'c2_1', requiredSlot: 'mon-1' });
        const result = runSchedulePrecheck(baseArgs({ tasks: [taskA, taskB] }));

        expect(result.fatalIssues).toHaveLength(0);
    });

    it('adds a warning (not fatal) when a task has zero or very few valid slots', () => {
        const task = makeTask({ course: makeCourse('c1') });
        const result = runSchedulePrecheck(baseArgs({
            tasks: [task],
            validSlotsByTask: new Map([[task, new Set<string>()]]),
        }));

        expect(result.fatalIssues).toHaveLength(0);
        expect(result.warningIssues.some(issue => issue.includes('ไม่มีช่องที่ผ่านเงื่อนไขปกติ'))).toBe(true);
    });

    it('attributes a low valid-slot-count warning to a period lock set on the Period Constraints page', () => {
        const task = makeTask({ course: makeCourse('c1') });
        const assignmentConstraints: AssignmentConstraintMap = {
            [task.compositeId]: { isLocked: true, lockedSlots: ['mon-2'] },
        };
        const result = runSchedulePrecheck(baseArgs({
            tasks: [task],
            assignmentConstraints,
            validSlotsByTask: new Map([[task, new Set(['mon-2'])]]),
        }));

        expect(result.fatalIssues).toHaveLength(0);
        expect(result.warningIssues.some(issue => issue.includes('ถูกล็อกคาบไว้ที่') && issue.includes('หน้าล็อกคาบสอน'))).toBe(true);
    });

    it('falls back to a generic low valid-slot-count warning when no constraint explains it', () => {
        const task = makeTask({ course: makeCourse('c1') });
        const result = runSchedulePrecheck(baseArgs({
            tasks: [task],
            validSlotsByTask: new Map([[task, new Set(['mon-2'])]]),
        }));

        expect(result.warningIssues.some(issue => issue.includes('มีช่องที่เป็นไปได้เพียง 1 ช่อง') && issue.includes('ตารางครู/ห้องเรียนที่แน่น'))).toBe(true);
    });

    it('passes through dataReadinessWarnings and skippedCourseIssues into warningIssues untouched', () => {
        const result = runSchedulePrecheck(baseArgs({
            dataReadinessWarnings: ['คำเตือนจากการโหลดข้อมูล'],
            skippedCourseIssues: ['วิชา X ถูกข้ามเพราะยังไม่มีครู'],
        }));

        expect(result.warningIssues).toContain('คำเตือนจากการโหลดข้อมูล');
        expect(result.warningIssues).toContain('วิชา X ถูกข้ามเพราะยังไม่มีครู');
    });
});
