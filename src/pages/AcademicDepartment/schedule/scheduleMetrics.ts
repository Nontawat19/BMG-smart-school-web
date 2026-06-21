import { Course, PeriodSetting } from './types';

type TimetableSlot = Record<string, { teacherId: string; classId: string | string[]; room: string[]; courseId: string; taskId?: number }[]>;

const isMorningPeriod = (periodIdx: number, periodSettings?: PeriodSetting[]): boolean => {
    if (periodSettings && periodSettings[periodIdx]) {
        const [hours] = periodSettings[periodIdx].startTime.split(':').map(Number);
        return hours < 12;
    }
    // Fallback heuristic when period settings are unavailable
    return periodIdx >= 1 && periodIdx <= 4;
};

const normalizeCourseTitle = (title: string): string =>
    String(title || '')
        .trim()
        .toLowerCase()
        .replace(/\s+/g, '')
        .replace(/และ/g, '')
        .replace(/[()\-_,.]/g, '');

const CORE_SUBJECT_PATTERNS = [
    ['ภาษาไทย', 'thai'],
    ['คณิตศาสตร์', 'คณิต', 'mathematics', 'math'],
    ['วิทยาศาสตร์และเทคโนโลยี', 'วิทยาศาสตร์', 'วิทย์', 'science', 'stem'],
    ['สังคมศึกษาศาสนาและวัฒนธรรม', 'สังคมศึกษา', 'สังคม', 'socialstudies', 'socialstudy']
].map(patterns => patterns.map(normalizeCourseTitle));

export const isCoreAcademicCourseTitle = (title: string): boolean => {
    const normalized = normalizeCourseTitle(title);
    return CORE_SUBJECT_PATTERNS.some(patterns => patterns.some(pattern => normalized.includes(pattern)));
};

export const calculateAverageConsecutivePeriods = (timetable: TimetableSlot): number => {
    const teacherDayPeriods: Record<string, number[]> = {};

    Object.entries(timetable).forEach(([slot, occupancies]) => {
        const [day] = slot.split('-');
        occupancies.forEach(occ => {
            const key = `${occ.teacherId}_${day}`;
            if (!teacherDayPeriods[key]) teacherDayPeriods[key] = [];
            teacherDayPeriods[key].push(parseInt(slot.split('-')[1]));
        });
    });

    const consecutiveCounts = Object.values(teacherDayPeriods).map(periods => {
        periods.sort((a, b) => a - b);
        let max = 1;
        let current = 1;
        for (let i = 1; i < periods.length; i++) {
            current = periods[i] === periods[i - 1] + 1 ? current + 1 : 1;
            if (current > max) max = current;
        }
        return max;
    });

    return consecutiveCounts.length > 0
        ? consecutiveCounts.reduce((a, b) => a + b, 0) / consecutiveCounts.length
        : 0;
};

export const calculateAverageGapsPerDay = (timetable: TimetableSlot): number => {
    const teacherDaySchedules: Record<string, number[]> = {};

    Object.entries(timetable).forEach(([slot, occupancies]) => {
        const [day, period] = slot.split('-');
        occupancies.forEach(occ => {
            const key = `${occ.teacherId}_${day}`;
            if (!teacherDaySchedules[key]) teacherDaySchedules[key] = [];
            teacherDaySchedules[key].push(parseInt(period));
        });
    });

    const gapValues = Object.values(teacherDaySchedules).map(periods => {
        periods.sort((a, b) => a - b);
        let gaps = 0;
        for (let i = 0; i < periods.length - 1; i++) {
            const gap = periods[i + 1] - periods[i] - 1;
            if (gap > 0) gaps += gap;
        }
        return gaps;
    });

    return gapValues.length > 0
        ? gapValues.reduce((a, b) => a + b, 0) / gapValues.length
        : 0;
};

/**
 * Calculates the percentage of core academic subjects placed in morning periods.
 * When `periodSettings` is provided, morning is determined by `startTime < '12:00'`.
 * Falls back to a heuristic (period index 1-4) when settings are absent.
 */
export const calculateBBLCompliance = (
    timetable: TimetableSlot,
    allCoursesData: Course[],
    periodSettings?: PeriodSetting[]
): number => {
    const courseMap = new Map(allCoursesData.map(c => [c.id, c]));

    let totalCoreSlots = 0;
    let morningCoreSlots = 0;

    Object.entries(timetable).forEach(([slot, occupancies]) => {
        const periodIdx = parseInt(slot.split('-')[1]);
        occupancies.forEach(occ => {
            const course = courseMap.get(occ.courseId);
            if (course && isCoreAcademicCourseTitle(course.title)) {
                totalCoreSlots++;
                if (isMorningPeriod(periodIdx, periodSettings)) morningCoreSlots++;
            }
        });
    });

    return totalCoreSlots > 0 ? (morningCoreSlots / totalCoreSlots) * 100 : 0;
};
