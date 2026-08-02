import { describe, it, expect } from 'vitest';
import {
    addOccupancyToIndex,
    canPlaceWithIndex,
    createRuntimeConflictIndex,
    countGaps,
    getBalancePenalty,
    getMaxConsecutive,
    getSessionSlotsForStart,
    runSchedulingEngine,
} from '../engine/schedulerEngine';
import type { EngineTask, EngineTeachingSlot, TimetableOccupancy } from '../engine/schedulerEngine';
import type { Course } from '../types';

// ─── countGaps ────────────────────────────────────────────────────────────

describe('countGaps', () => {
    it('returns 0 for empty or single-period input', () => {
        expect(countGaps([])).toBe(0);
        expect(countGaps([3])).toBe(0);
    });

    it('returns 0 for fully consecutive periods', () => {
        expect(countGaps([1, 2, 3])).toBe(0);
    });

    it('counts total missing periods between the given periods', () => {
        expect(countGaps([1, 4])).toBe(2); // missing 2, 3
        expect(countGaps([1, 3, 6])).toBe(3); // missing 2, then 4,5
    });

    it('is order-independent', () => {
        expect(countGaps([6, 1, 3])).toBe(3);
    });
});

// ─── getMaxConsecutive ───────────────────────────────────────────────────

describe('getMaxConsecutive', () => {
    it('returns 0 for empty input', () => {
        expect(getMaxConsecutive([])).toBe(0);
    });

    it('returns 1 for a single period or all-scattered periods', () => {
        expect(getMaxConsecutive([5])).toBe(1);
        expect(getMaxConsecutive([1, 5, 9])).toBe(1);
    });

    it('finds the longest consecutive run regardless of input order', () => {
        expect(getMaxConsecutive([5, 1, 2, 3, 9])).toBe(3);
        expect(getMaxConsecutive([1, 2, 3, 4, 5])).toBe(5);
    });
});

// ─── getBalancePenalty ───────────────────────────────────────────────────

describe('getBalancePenalty', () => {
    it('returns 0 when loads are already balanced', () => {
        expect(getBalancePenalty([3, 3, 3])).toBe(0);
        expect(getBalancePenalty([])).toBe(0);
        expect(getBalancePenalty([7])).toBe(0);
    });

    it('grows with the variance between days', () => {
        const evenly = getBalancePenalty([4, 4, 4, 4]);
        const lopsided = getBalancePenalty([8, 0, 8, 0]);
        expect(lopsided).toBeGreaterThan(evenly);
    });
});

// ─── getSessionSlotsForStart ─────────────────────────────────────────────

const makeSlots = (dayKey: string, count: number): EngineTeachingSlot[] =>
    Array.from({ length: count }, (_, i) => ({
        dayKey,
        slotId: `${dayKey}-${i}`,
        periodSetting: { id: String(i), label: `คาบ ${i + 1}`, startTime: '08:00', endTime: '08:50', isTeachingPeriod: true },
    }));

describe('getSessionSlotsForStart', () => {
    const slots = makeSlots('mon', 6);

    it('returns the single slot when duration is 1 and the slot exists', () => {
        expect(getSessionSlotsForStart('mon-2', 1, slots)).toEqual(['mon-2']);
    });

    it('returns an empty array when the single slot does not exist', () => {
        expect(getSessionSlotsForStart('mon-99', 1, slots)).toEqual([]);
    });

    it('returns the consecutive run for a double session when all slots exist', () => {
        expect(getSessionSlotsForStart('mon-2', 2, slots)).toEqual(['mon-2', 'mon-3']);
    });

    it('returns an empty array when the session would run past the last slot', () => {
        expect(getSessionSlotsForStart('mon-5', 2, slots)).toEqual([]);
    });
});

// ─── addOccupancyToIndex + canPlaceWithIndex ─────────────────────────────

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

const occupy = (index: ReturnType<typeof createRuntimeConflictIndex>, slotId: string, occupancy: Partial<TimetableOccupancy> & { teacherId: string; courseId: string }) => {
    addOccupancyToIndex(index, slotId, {
        classId: [],
        room: [],
        groupNumber: 1,
        course: null,
        ...occupancy,
    });
};

describe('canPlaceWithIndex', () => {
    it('allows placement into a clean slot', () => {
        const index = createRuntimeConflictIndex();
        const task = makeTask({ course: makeCourse('c1') });
        expect(canPlaceWithIndex(task, ['mon-0'], index)).toBe(true);
    });

    it('rejects placement when the same teacher is already booked in that slot', () => {
        const index = createRuntimeConflictIndex();
        occupy(index, 'mon-0', { teacherId: 't1', courseId: 'other', classId: ['m2'] });
        const task = makeTask({ course: makeCourse('c1') });
        expect(canPlaceWithIndex(task, ['mon-0'], index)).toBe(false);
    });

    it('rejects placement when the target class already has another course in that slot', () => {
        const index = createRuntimeConflictIndex();
        occupy(index, 'mon-0', { teacherId: 'other-teacher', courseId: 'other', classId: ['m1'] });
        const task = makeTask({ course: makeCourse('c1'), targetClasses: ['m1'] });
        expect(canPlaceWithIndex(task, ['mon-0'], index)).toBe(false);
    });

    it('rejects placement when a requested specific room is already occupied', () => {
        const index = createRuntimeConflictIndex();
        occupy(index, 'mon-0', { teacherId: 'other-teacher', courseId: 'other', classId: ['m2'], room: ['lab-1'] });
        const task = makeTask({ course: makeCourse('c1'), targetClasses: ['m3'], targetRooms: ['lab-1'] });
        expect(canPlaceWithIndex(task, ['mon-0'], index)).toBe(false);
    });

    // Regression coverage: elective/rotation-group courses (e.g. ทัศนศิลป์, สุขศึกษา) share a
    // coarse, grade-level-only classId (no per-room granularity), so the auto-scheduler used to
    // refuse to place a DIFFERENT course into a slot already used by another course under the
    // same classId even when each has its own specific, non-overlapping room.
    it('allows a different course sharing a coarse classId when each has a distinct specific room', () => {
        const index = createRuntimeConflictIndex();
        occupy(index, 'mon-0', { teacherId: 'other-teacher', courseId: 'health', classId: ['m3'], room: ['room-117'], groupNumber: 2 });
        const task = makeTask({ course: makeCourse('art'), teacherId: 't1', targetClasses: ['m3'], targetRooms: ['room-313'], groupNumber: 1 });
        expect(canPlaceWithIndex(task, ['mon-0'], index)).toBe(true);
    });

    it('still rejects a different course sharing a coarse classId when rooms overlap or are unspecified', () => {
        const index = createRuntimeConflictIndex();
        occupy(index, 'mon-0', { teacherId: 'other-teacher', courseId: 'health', classId: ['m3'], groupNumber: 2 });
        const task = makeTask({ course: makeCourse('art'), teacherId: 't1', targetClasses: ['m3'], groupNumber: 1 });
        expect(canPlaceWithIndex(task, ['mon-0'], index)).toBe(false);
    });

    // Before this fix, hasClassConflict blocked ANY two occupants sharing a classId+slot with
    // zero awareness of groupNumber, so even the same course split into parallel groups (e.g.
    // English group 1 vs group 2, taught to different students at the same time) was wrongly
    // rejected by the raw engine index whenever their classId collided.
    it('allows the SAME course split into parallel groups sharing a coarse classId', () => {
        const index = createRuntimeConflictIndex();
        occupy(index, 'mon-0', { teacherId: 'other-teacher', courseId: 'english', classId: ['p3'], groupNumber: 2 });
        const task = makeTask({ course: makeCourse('english'), teacherId: 't1', targetClasses: ['p3'], groupNumber: 1 });
        expect(canPlaceWithIndex(task, ['mon-0'], index)).toBe(true);
    });

    it('does not block on rooms marked "all"', () => {
        const index = createRuntimeConflictIndex();
        occupy(index, 'mon-0', { teacherId: 'other-teacher', courseId: 'other', classId: ['m2'], room: ['all'] });
        const task = makeTask({ course: makeCourse('c1'), targetClasses: ['m3'], targetRooms: ['all'] });
        expect(canPlaceWithIndex(task, ['mon-0'], index)).toBe(true);
    });

    it('bypasses the same-day max-consecutive check for tasks with a requiredSlot', () => {
        const index = createRuntimeConflictIndex();
        const course = makeCourse('c1');
        // Pre-fill periods 0,1,2 for the same class+course so a 4th period would
        // normally exceed maxConsecutivePeriodsPerDay (default 3).
        [0, 1, 2].forEach(p => occupy(index, `mon-${p}`, { teacherId: 't1', courseId: 'c1', classId: ['m1'], groupNumber: 1 }));
        const task = makeTask({ course, targetClasses: ['m1'], requiredSlot: 'mon-3' });
        expect(canPlaceWithIndex(task, ['mon-3'], index)).toBe(true);
    });

    it('enforces the max-consecutive-periods-per-day limit when there is no requiredSlot', () => {
        const index = createRuntimeConflictIndex();
        [0, 1, 2].forEach(p => occupy(index, `mon-${p}`, { teacherId: 't2', courseId: 'c1', classId: ['m1'], groupNumber: 1 }));
        const task = makeTask({ course: makeCourse('c1'), teacherId: 't2', targetClasses: ['m1'] });
        expect(canPlaceWithIndex(task, ['mon-3'], index, undefined, 3)).toBe(false);
    });
});

// ─── runSchedulingEngine ──────────────────────────────────────────────────

describe('runSchedulingEngine', () => {
    const allTeachingSlots = makeSlots('mon', 4).concat(makeSlots('tue', 4));

    it('places independent single-period tasks for different teachers/classes with no conflicts', () => {
        const tasks: EngineTask[] = [
            makeTask({ course: makeCourse('c1'), teacherId: 't1', targetClasses: ['m1'] }),
            makeTask({ course: makeCourse('c2'), teacherId: 't2', targetClasses: ['m2'], compositeId: 'c2_1' }),
        ];
        const allSlotIds = allTeachingSlots.map(s => s.slotId);

        const result = runSchedulingEngine({
            tasks,
            initialTimetable: {},
            initialBatchUpdates: {},
            allTeachingSlots,
            validSlotsByTaskIndex: tasks.map(() => allSlotIds),
            assignmentConstraints: {},
            maxRuns: 3,
        });

        expect(result.unplacedTasks.length).toBe(0);
        expect(result.placedPeriods).toBe(2);
    });

    it('leaves a task unplaced when two tasks are both forced (via requiredSlot) into the same teacher+slot', () => {
        const tasks: EngineTask[] = [
            makeTask({ course: makeCourse('c1'), teacherId: 't1', targetClasses: ['m1'], requiredSlot: 'mon-0' }),
            makeTask({ course: makeCourse('c2'), teacherId: 't1', targetClasses: ['m2'], compositeId: 'c2_1', requiredSlot: 'mon-0' }),
        ];
        const allSlotIds = allTeachingSlots.map(s => s.slotId);

        const result = runSchedulingEngine({
            tasks,
            initialTimetable: {},
            initialBatchUpdates: {},
            allTeachingSlots,
            validSlotsByTaskIndex: tasks.map(() => allSlotIds),
            assignmentConstraints: {},
            maxRuns: 3,
        });

        // Both tasks demand the exact same teacher+slot, so exactly one must lose out.
        expect(result.unplacedTasks.length).toBe(1);
        expect(result.placedPeriods).toBe(1);
    });

    it('does not crash and still returns a valid result when maxRepairAttempts is exhausted (backtracking circuit breaker)', () => {
        // `maxRepairAttempts` previously had no effect at all — this exercises the
        // budget-exhausted code path (tryPlaceWithBacktracking bailing out early)
        // to guard against regressions in that early-return.
        const tasks: EngineTask[] = [
            makeTask({ course: makeCourse('c1'), teacherId: 't1', targetClasses: ['m1'], requiredSlot: 'mon-0' }),
            makeTask({ course: makeCourse('c2'), teacherId: 't1', targetClasses: ['m2'], compositeId: 'c2_1', requiredSlot: 'mon-0' }),
            makeTask({ course: makeCourse('c3'), teacherId: 't2', targetClasses: ['m1'], compositeId: 'c3_1' }),
        ];
        const allSlotIds = allTeachingSlots.map(s => s.slotId);

        const result = runSchedulingEngine({
            tasks,
            initialTimetable: {},
            initialBatchUpdates: {},
            allTeachingSlots,
            validSlotsByTaskIndex: tasks.map(() => allSlotIds),
            assignmentConstraints: {},
            maxRuns: 3,
            maxRepairAttempts: 0,
        });

        // All 3 tasks are duration-1, so placed periods + unplaced tasks must
        // account for every task exactly, regardless of how the conflicts resolved.
        expect(result.placedPeriods + result.unplacedTasks.length).toBe(tasks.length);
        expect(result.placedPeriods).toBeGreaterThan(0);
    });
});
