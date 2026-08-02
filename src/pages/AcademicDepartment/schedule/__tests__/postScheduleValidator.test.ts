import { describe, expect, it } from 'vitest';
import {
    calculatePlacementRates,
    validatePostSchedule,
} from '../actions/autoSchedule/postScheduleValidator';
import type { EngineSchedule, EngineTask } from '../engine/schedulerEngine';
import type { Course } from '../types';

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

describe('validatePostSchedule', () => {
    it('passes a clean schedule and counts unique task periods once for co-teaching', () => {
        const task = makeTask({ course: makeCourse('c1'), teacherIds: ['t1', 't2'] });
        const timetable: EngineSchedule = {
            'mon-0': [
                { teacherId: 't1', teacherIds: ['t1', 't2'], classId: ['m1'], room: ['lab-1'], courseId: 'c1', course: task.course, taskId: 0, groupNumber: 1 },
                { teacherId: 't2', teacherIds: ['t1', 't2'], classId: ['m1'], room: ['lab-1'], courseId: 'c1', course: task.course, taskId: 0, groupNumber: 1 },
            ],
        };

        const result = validatePostSchedule({ tasks: [task], timetable });

        expect(result.isValid).toBe(true);
        expect(result.actualPlacedPeriods).toBe(1);
        expect(result.conflictCount).toBe(0);
    });

    it('detects teacher, class, and room conflicts between different placements in the same slot', () => {
        const taskA = makeTask({ course: makeCourse('c1'), teacherId: 't1', targetRooms: ['lab-1'] });
        const taskB = makeTask({ course: makeCourse('c2'), teacherId: 't1', targetClasses: ['m1'], targetRooms: ['lab-1'], compositeId: 'c2_1' });
        const timetable: EngineSchedule = {
            'mon-0': [
                { teacherId: 't1', classId: ['m1'], room: ['lab-1'], courseId: 'c1', course: taskA.course, taskId: 0, groupNumber: 1 },
                { teacherId: 't1', classId: ['m1'], room: ['lab-1'], courseId: 'c2', course: taskB.course, taskId: 1, groupNumber: 1 },
            ],
        };

        const result = validatePostSchedule({ tasks: [taskA, taskB], timetable });

        expect(result.isValid).toBe(false);
        expect(result.issues.map(issue => issue.type)).toContain('teacher_conflict');
        expect(result.issues.map(issue => issue.type)).toContain('class_conflict');
        expect(result.issues.map(issue => issue.type)).toContain('room_conflict');
        expect(result.conflictCount).toBe(3);
    });

    // Regression coverage: elective/rotation-group courses (e.g. ทัศนศิลป์, สุขศึกษา) share a
    // coarse, grade-level-only classId (per CLASS_MAPPING — no per-room granularity), so a
    // schedule with two DIFFERENT courses/teachers/rooms placed in parallel under that same
    // classId used to be wrongly reported as a class_conflict error even though it's valid.
    it('does not report a class_conflict for two different courses sharing a coarse classId in different rooms', () => {
        const taskA = makeTask({ course: makeCourse('art'), teacherId: 't1', targetClasses: ['m3'], targetRooms: ['room-313'] });
        const taskB = makeTask({ course: makeCourse('health'), teacherId: 't2', targetClasses: ['m3'], targetRooms: ['room-117'], compositeId: 'health_1' });
        const timetable: EngineSchedule = {
            'mon-0': [
                { teacherId: 't1', classId: ['m3'], room: ['room-313'], courseId: 'art', course: taskA.course, taskId: 0, groupNumber: 1 },
                { teacherId: 't2', classId: ['m3'], room: ['room-117'], courseId: 'health', course: taskB.course, taskId: 1, groupNumber: 1 },
            ],
        };

        const result = validatePostSchedule({ tasks: [taskA, taskB], timetable });

        expect(result.issues.map(issue => issue.type)).not.toContain('class_conflict');
        expect(result.isValid).toBe(true);
    });

    it('still reports a class_conflict for two different courses sharing a coarse classId when rooms overlap or are unspecified', () => {
        const taskA = makeTask({ course: makeCourse('art'), teacherId: 't1', targetClasses: ['m3'] });
        const taskB = makeTask({ course: makeCourse('health'), teacherId: 't2', targetClasses: ['m3'], compositeId: 'health_1' });
        const timetable: EngineSchedule = {
            'mon-0': [
                { teacherId: 't1', classId: ['m3'], room: [], courseId: 'art', course: taskA.course, taskId: 0, groupNumber: 1 },
                { teacherId: 't2', classId: ['m3'], room: [], courseId: 'health', course: taskB.course, taskId: 1, groupNumber: 1 },
            ],
        };

        const result = validatePostSchedule({ tasks: [taskA, taskB], timetable });

        expect(result.issues.map(issue => issue.type)).toContain('class_conflict');
        expect(result.isValid).toBe(false);
    });

    it('reports missing required periods and locked-slot mismatches', () => {
        const locked = makeTask({ course: makeCourse('c1'), duration: 2, requiredSlot: 'mon-0' });
        const timetable: EngineSchedule = {
            'tue-0': [
                { teacherId: 't1', classId: ['m1'], room: [], courseId: 'c1', course: locked.course, taskId: 0, groupNumber: 1 },
            ],
        };

        const result = validatePostSchedule({ tasks: [locked], timetable });

        expect(result.missingRequiredPeriods).toBe(1);
        expect(result.lockedSlotMismatchCount).toBe(1);
        expect(result.issues.map(issue => issue.type)).toContain('missing_required_period');
        expect(result.issues.map(issue => issue.type)).toContain('locked_slot_mismatch');
    });
});

describe('calculatePlacementRates', () => {
    it('keeps actual placement separate from temporary assistance', () => {
        const rates = calculatePlacementRates(10, 7, 2);

        expect(rates.actualPlacedRate).toBe(70);
        expect(rates.temporaryAssistedRate).toBe(90);
        expect(rates.unresolvedRate).toBe(10);
    });

    it('caps temporary assistance at 100 percent', () => {
        const rates = calculatePlacementRates(10, 9, 5);

        expect(rates.actualPlacedRate).toBe(90);
        expect(rates.temporaryAssistedRate).toBe(100);
        expect(rates.unresolvedRate).toBe(0);
    });
});
