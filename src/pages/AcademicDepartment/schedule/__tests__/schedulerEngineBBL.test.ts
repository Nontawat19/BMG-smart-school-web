import { describe, it, expect } from 'vitest';
import { runSchedulingEngine } from '../engine/schedulerEngine';
import type { EngineTask, EngineTeachingSlot } from '../engine/schedulerEngine';
import { calculateBBLCompliance } from '../scheduleMetrics';
import type { Course, PeriodSetting } from '../types';

// ─── synthetic timetable: 5 days × 6 periods (3 morning + 3 afternoon) ──────

const DAY_KEYS = ['mon', 'tue', 'wed', 'thu', 'fri'];
const PERIOD_TIMES = ['08:00', '09:00', '10:00', '13:00', '14:00', '15:00']; // idx 0-2 morning, 3-5 afternoon

const periodSettings: PeriodSetting[] = PERIOD_TIMES.map((startTime, idx) => ({
    id: String(idx),
    label: `คาบ ${idx + 1}`,
    startTime,
    endTime: startTime,
    isTeachingPeriod: true,
}));

const allTeachingSlots: EngineTeachingSlot[] = DAY_KEYS.flatMap(dayKey =>
    PERIOD_TIMES.map((startTime, idx) => ({
        dayKey,
        slotId: `${dayKey}-${idx}`,
        periodSetting: { id: String(idx), label: `คาบ ${idx + 1}`, startTime, endTime: startTime, isTeachingPeriod: true },
    }))
);
const allSlotIds = allTeachingSlots.map(s => s.slotId);

const makeCourse = (id: string, title: string): Course =>
    ({ id, title, code: id, credits: 1, hoursPerWeek: 1 } as Course);

// 4 core (BBL-measured) subjects, each needs only 1 period — light demand.
const CORE_TITLES = ['ภาษาไทย', 'คณิตศาสตร์', 'วิทยาศาสตร์', 'สังคมศึกษา'];
// Non-core "ACADEMIC" competitors (English counts as ACADEMIC in getSubjectCategory
// but is NOT one of the 4 core BBL subjects) — heavy demand so morning slots are scarce.
const NON_CORE_TITLES = Array.from({ length: 10 }, (_, i) => `ภาษาอังกฤษ ${i + 1}`);

const makeTask = (course: Course, teacherId: string, groupNumber: number): EngineTask => ({
    course,
    teacherId,
    targetClasses: ['m1'],
    targetRooms: [],
    instanceCount: 1,
    duration: 1,
    originalCourseId: course.id,
    compositeId: `${course.id}_${groupNumber}`,
    groupNumber,
});

describe('runSchedulingEngine — BBL core-subject morning placement', () => {
    it('places the large majority of core subjects in the morning even when non-core academic subjects compete for the same slots', () => {
        const coreTasks = CORE_TITLES.map((title, i) => makeTask(makeCourse(`core-${i}`, title), `core-teacher-${i}`, 1));
        const nonCoreTasks = NON_CORE_TITLES.map((title, i) => makeTask(makeCourse(`nc-${i}`, title), `nc-teacher-${i}`, 1));
        const tasks = [...coreTasks, ...nonCoreTasks];

        const validSlotsByTaskIndex = tasks.map(() => allSlotIds);
        const allCoursesData = tasks.map(t => t.course);

        const result = runSchedulingEngine({
            tasks,
            initialTimetable: {},
            initialBatchUpdates: {},
            allTeachingSlots,
            validSlotsByTaskIndex,
            assignmentConstraints: {},
            maxRuns: 10,
        });

        expect(result.unplacedTasks.length).toBe(0);

        const bblRate = calculateBBLCompliance(result.schoolTimetableRecord, allCoursesData, periodSettings);
        // Generous-but-meaningful threshold: before wiring isCoreAcademicCourseTitle
        // into engine scoring, core subjects competed on equal footing with the 10
        // non-core academic tasks for the 15 morning slots and compliance regularly
        // landed well under 50%. The dedicated CORE_SUBJECT_MORNING_BONUS should push
        // this close to 100% (4 light single-period core tasks vs. 15 morning slots).
        expect(bblRate).toBeGreaterThanOrEqual(75);
    });
});
