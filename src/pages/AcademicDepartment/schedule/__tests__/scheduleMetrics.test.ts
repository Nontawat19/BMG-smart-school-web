import { describe, it, expect } from 'vitest';
import {
    calculateAverageConsecutivePeriods,
    calculateAverageGapsPerDay,
    calculateBBLCompliance,
} from '../scheduleMetrics';
import type { Course, PeriodSetting } from '../types';

// ─── helpers ────────────────────────────────────────────────────────────────

type Slot = Record<string, { teacherId: string; classId: string | string[]; room: string[]; courseId: string }[]>;

const makeSlot = (
    slot: string,
    teacherId: string,
    courseId = 'c1',
): Slot[string][number] => ({ teacherId, classId: 'm1', room: [], courseId });

const makeCourse = (id: string, title: string): Course =>
    ({ id, title, code: id, credits: 1, hoursPerWeek: 1 } as unknown as Course);

/** Build a minimal PeriodSetting for testing. */
const makePeriodSetting = (id: string, startTime: string, endTime: string): PeriodSetting => ({
    id,
    label: id,
    startTime,
    endTime,
    isTeachingPeriod: true,
});

// ─── calculateAverageConsecutivePeriods ──────────────────────────────────────

describe('calculateAverageConsecutivePeriods', () => {
    it('returns 0 for empty timetable', () => {
        expect(calculateAverageConsecutivePeriods({})).toBe(0);
    });

    it('returns 1 for a single period', () => {
        const timetable: Slot = { 'mon-1': [makeSlot('mon-1', 'teacher1')] };
        expect(calculateAverageConsecutivePeriods(timetable)).toBe(1);
    });

    it('returns 2 for two consecutive periods on the same day', () => {
        const timetable: Slot = {
            'mon-1': [makeSlot('mon-1', 'teacher1')],
            'mon-2': [makeSlot('mon-2', 'teacher1')],
        };
        expect(calculateAverageConsecutivePeriods(timetable)).toBe(2);
    });

    it('returns 1 for two non-consecutive periods on the same day', () => {
        const timetable: Slot = {
            'mon-1': [makeSlot('mon-1', 'teacher1')],
            'mon-3': [makeSlot('mon-3', 'teacher1')],
        };
        expect(calculateAverageConsecutivePeriods(timetable)).toBe(1);
    });

    it('handles multiple teachers independently', () => {
        // teacher1: periods 1,2,3 → max=3; teacher2: period 1 only → max=1
        const timetable: Slot = {
            'mon-1': [makeSlot('mon-1', 'teacher1'), makeSlot('mon-1', 'teacher2')],
            'mon-2': [makeSlot('mon-2', 'teacher1')],
            'mon-3': [makeSlot('mon-3', 'teacher1')],
        };
        const avg = calculateAverageConsecutivePeriods(timetable);
        expect(avg).toBe(2); // (3 + 1) / 2
    });

    it('treats different days as separate runs', () => {
        // teacher1: mon-1,mon-2 (run=2) and tue-3 (run=1) → average=1.5
        const timetable: Slot = {
            'mon-1': [makeSlot('mon-1', 'teacher1')],
            'mon-2': [makeSlot('mon-2', 'teacher1')],
            'tue-3': [makeSlot('tue-3', 'teacher1')],
        };
        const avg = calculateAverageConsecutivePeriods(timetable);
        expect(avg).toBe(1.5); // (2 + 1) / 2
    });
});

// ─── calculateAverageGapsPerDay ──────────────────────────────────────────────

describe('calculateAverageGapsPerDay', () => {
    it('returns 0 for empty timetable', () => {
        expect(calculateAverageGapsPerDay({})).toBe(0);
    });

    it('returns 0 for a single period', () => {
        const timetable: Slot = { 'mon-1': [makeSlot('mon-1', 'teacher1')] };
        expect(calculateAverageGapsPerDay(timetable)).toBe(0);
    });

    it('returns 0 for consecutive periods', () => {
        const timetable: Slot = {
            'mon-1': [makeSlot('mon-1', 'teacher1')],
            'mon-2': [makeSlot('mon-2', 'teacher1')],
            'mon-3': [makeSlot('mon-3', 'teacher1')],
        };
        expect(calculateAverageGapsPerDay(timetable)).toBe(0);
    });

    it('counts a gap of 1 between periods 1 and 3', () => {
        const timetable: Slot = {
            'mon-1': [makeSlot('mon-1', 'teacher1')],
            'mon-3': [makeSlot('mon-3', 'teacher1')],
        };
        expect(calculateAverageGapsPerDay(timetable)).toBe(1);
    });

    it('counts wider gaps correctly', () => {
        // periods 1 and 5 → gap = 3
        const timetable: Slot = {
            'mon-1': [makeSlot('mon-1', 'teacher1')],
            'mon-5': [makeSlot('mon-5', 'teacher1')],
        };
        expect(calculateAverageGapsPerDay(timetable)).toBe(3);
    });

    it('averages across multiple teacher-day combinations', () => {
        // teacher1/mon: 1,3 → gap=1; teacher2/mon: 1,2 → gap=0
        const timetable: Slot = {
            'mon-1': [makeSlot('mon-1', 'teacher1'), makeSlot('mon-1', 'teacher2')],
            'mon-2': [makeSlot('mon-2', 'teacher2')],
            'mon-3': [makeSlot('mon-3', 'teacher1')],
        };
        expect(calculateAverageGapsPerDay(timetable)).toBe(0.5); // (1 + 0) / 2
    });
});

// ─── calculateBBLCompliance ───────────────────────────────────────────────────

describe('calculateBBLCompliance', () => {
    const thaiCourse = makeCourse('thai', 'ภาษาไทย');
    const mathCourse = makeCourse('math', 'คณิตศาสตร์');
    const artCourse = makeCourse('art', 'ศิลปะ');

    // ── without periodSettings (heuristic fallback: index 1-4 = morning) ──

    it('returns 0 for empty timetable', () => {
        expect(calculateBBLCompliance({}, [])).toBe(0);
    });

    it('returns 100 when all core subjects are in the morning (periods 1-4)', () => {
        const timetable: Slot = {
            'mon-1': [{ teacherId: 't1', classId: 'm1', room: [], courseId: 'thai' }],
            'mon-2': [{ teacherId: 't1', classId: 'm1', room: [], courseId: 'math' }],
        };
        expect(calculateBBLCompliance(timetable, [thaiCourse, mathCourse, artCourse])).toBe(100);
    });

    it('returns 0 when all core subjects are in the afternoon (periods 5+)', () => {
        const timetable: Slot = {
            'mon-5': [{ teacherId: 't1', classId: 'm1', room: [], courseId: 'thai' }],
            'mon-6': [{ teacherId: 't1', classId: 'm1', room: [], courseId: 'math' }],
        };
        expect(calculateBBLCompliance(timetable, [thaiCourse, mathCourse, artCourse])).toBe(0);
    });

    it('returns 50 when half core subjects are in the morning', () => {
        const timetable: Slot = {
            'mon-1': [{ teacherId: 't1', classId: 'm1', room: [], courseId: 'thai' }],
            'mon-5': [{ teacherId: 't1', classId: 'm1', room: [], courseId: 'math' }],
        };
        expect(calculateBBLCompliance(timetable, [thaiCourse, mathCourse, artCourse])).toBe(50);
    });

    it('ignores non-core subjects', () => {
        const timetable: Slot = {
            'mon-1': [{ teacherId: 't1', classId: 'm1', room: [], courseId: 'art' }],
        };
        expect(calculateBBLCompliance(timetable, [thaiCourse, mathCourse, artCourse])).toBe(0);
    });

    // ── with periodSettings (time-based: startTime < 12:00 = morning) ──────

    it('uses periodSettings startTime to detect morning when provided', () => {
        // index 5 has startTime 09:00 → morning; index 6 has startTime 13:00 → afternoon
        const periodSettings: PeriodSetting[] = [
            makePeriodSetting('p0', '07:30', '08:30'),
            makePeriodSetting('p1', '08:30', '09:30'),
            makePeriodSetting('p2', '09:30', '10:30'),
            makePeriodSetting('p3', '10:30', '11:30'),
            makePeriodSetting('p4', '11:30', '12:30'),
            makePeriodSetting('p5', '09:00', '10:00'), // morning by time
            makePeriodSetting('p6', '13:00', '14:00'), // afternoon by time
        ];
        const timetable: Slot = {
            'mon-5': [{ teacherId: 't1', classId: 'm1', room: [], courseId: 'thai' }], // morning (09:00)
            'mon-6': [{ teacherId: 't1', classId: 'm1', room: [], courseId: 'math' }], // afternoon (13:00)
        };
        // Without periodSettings: index 5 > 4 → afternoon, index 6 > 4 → afternoon → 0%
        expect(calculateBBLCompliance(timetable, [thaiCourse, mathCourse, artCourse])).toBe(0);
        // With periodSettings: index 5 startTime=09:00 < 12:00 → morning → 50%
        expect(calculateBBLCompliance(timetable, [thaiCourse, mathCourse, artCourse], periodSettings)).toBe(50);
    });

    it('returns 100 when all core subjects fall before noon per periodSettings', () => {
        const periodSettings: PeriodSetting[] = Array.from({ length: 10 }, (_, i) =>
            makePeriodSetting(`p${i}`, `${8 + i}:00`, `${9 + i}:00`)
        );
        // Periods 1-3 have startTime 09:00, 10:00, 11:00 — all before noon
        const timetable: Slot = {
            'mon-1': [{ teacherId: 't1', classId: 'm1', room: [], courseId: 'thai' }],
            'mon-2': [{ teacherId: 't1', classId: 'm1', room: [], courseId: 'math' }],
        };
        expect(calculateBBLCompliance(timetable, [thaiCourse, mathCourse], periodSettings)).toBe(100);
    });

    it('uses courseMap for O(1) lookups (correctness with many courses)', () => {
        const extraCourses = Array.from({ length: 100 }, (_, i) => makeCourse(`extra${i}`, `Extra ${i}`));
        const allCourses = [...extraCourses, thaiCourse, mathCourse];
        const timetable: Slot = {
            'mon-1': [{ teacherId: 't1', classId: 'm1', room: [], courseId: 'thai' }],
        };
        expect(calculateBBLCompliance(timetable, allCourses)).toBe(100);
    });

    it('matches common core-subject title variations instead of exact names only', () => {
        const socialCourse = makeCourse('social', 'สังคมศึกษา ศาสนา และวัฒนธรรม ม.1');
        const scienceCourse = makeCourse('science', 'วิทย์พื้นฐาน');
        const timetable: Slot = {
            'mon-1': [{ teacherId: 't1', classId: 'm1', room: [], courseId: 'social' }],
            'mon-5': [{ teacherId: 't1', classId: 'm1', room: [], courseId: 'science' }],
        };
        expect(calculateBBLCompliance(timetable, [socialCourse, scienceCourse])).toBe(50);
    });
});
