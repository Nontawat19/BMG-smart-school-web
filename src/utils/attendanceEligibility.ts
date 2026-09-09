// Shared, framework-free calculation of course attendance % and the "เวลาเรียนไม่ถึงร้อยละ 80"
// (มส) eligibility check. This is the single source of truth for that calculation — it was
// originally embedded only in the ปพ.5 gradebook page (useGradeBookAttendance.ts) and is now
// also consumed from the per-subject attendance-taking page and the มส backfill tool, so any
// future fix to the date-walking/threshold logic only needs to happen here.

const THAI_MONTHS_SHORT = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'];
const THAI_WEEKDAYS_SHORT = ['อา', 'จ', 'อ', 'พ', 'พฤ', 'ศ', 'ส'];
const DAY_KEY_MAP = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
const SESSIONS_PER_PAGE = 28;

export type AttendanceStatus = 'present' | 'absent' | 'late' | 'leave' | 'escape';

export interface AttendanceEligibilityStudent {
    id: string;
    enrolledAt?: string;
}

// A student is only responsible for attendance on/after the day they enrolled in this
// course — e.g. a student who transfers in mid-term shouldn't have days before they even
// existed in the class counted as "absent" or "missing". Students with no enrolledAt
// (legacy enrollments predating this field) are treated as enrolled for the whole term,
// matching the previous behavior.
export const isStudentEnrolledOnDay = (student: AttendanceEligibilityStudent, dateStr: string) => {
    // Defensive: enrolledAt is normalized to an ISO string where it's populated
    // (useGradeBookData.ts), but guard the type here too rather than trust every call
    // site — a non-string value must never crash the whole attendance calculation.
    if (!student.enrolledAt || typeof student.enrolledAt !== 'string') return true;
    const enrolledDateStr = student.enrolledAt.slice(0, 10);
    return dateStr >= enrolledDateStr;
};

export const checkIsHolidayLocal = (dateStr: string, events: Record<string, any>): { isHoliday: boolean; description: string } => {
    if (!dateStr || !events) return { isHoliday: false, description: '' };
    const event = events[dateStr];
    const d = new Date(dateStr);
    const dayOfWeek = d.getUTCDay();
    if (event) {
        if (event.type === 'holiday') return { isHoliday: true, description: event.description || 'วันหยุดราชการ' };
        if (event.type === 'specialHoliday') return { isHoliday: true, description: event.description || 'วันหยุดกรณีพิเศษ' };
        if (event.type === 'schoolDay') return { isHoliday: false, description: event.description || 'วันเรียนชดเชย' };
    }
    if (dayOfWeek === 0 || dayOfWeek === 6) return { isHoliday: true, description: 'วันหยุดเสาร์-อาทิตย์' };
    return { isHoliday: false, description: '' };
};

export const buildAttendancePages = (
    calendarData: any,
    courseSchedule: Record<string, number[]>,
    selectedSemester: string,
    selectedClass: string,
    studentCourseDailyStatus: Record<string, Record<string, AttendanceStatus>>,
    checkIsHoliday: (dateStr: string, events: Record<string, any>) => { isHoliday: boolean; description: string } = checkIsHolidayLocal
): any[] => {
    if (!calendarData?.terms || !selectedClass) return [];

    const allPages: any[] = [];
    let annualHourCounter = 0;

    const termsToProcess =
        selectedSemester === '2'
            ? ['term2']
            : selectedSemester === '1'
                ? ['term1']
                : ['term1', 'term2'];

    for (const termKey of termsToProcess) {
        const termData = calendarData.terms[termKey];
        if (!termData?.startDate || !termData?.endDate) continue;

        let termSessionBuffer: any[] = [];
        let termHourCounter = 0;
        const events = calendarData.events || {};

        const termStartDate = new Date(termData.startDate);
        const termEndDate = new Date(termData.endDate);

        let currentDay = new Date(termStartDate);
        const startDayOffset = currentDay.getDay();
        if (startDayOffset > 0) {
            currentDay.setUTCDate(currentDay.getUTCDate() - startDayOffset);
        }

        while (currentDay <= termEndDate) {
            const y = currentDay.getFullYear();
            const m = String(currentDay.getMonth() + 1).padStart(2, '0');
            const d = String(currentDay.getDate()).padStart(2, '0');
            const dateStr = `${y}-${m}-${d}`;

            const { isHoliday, description } = checkIsHoliday(dateStr, events);
            const dayOfWeekIndex = currentDay.getDay();
            let dayKey = DAY_KEY_MAP[dayOfWeekIndex];
            const event = events[dateStr];
            if (event?.type === 'schoolDay' && event?.scheduleDay) {
                dayKey = event.scheduleDay;
            }

            const termSemester = termKey === 'term1' ? '1' : '2';
            const periodsToday = selectedSemester === 'annual'
                ? (courseSchedule[`${termSemester}:${dayKey}`] || courseSchedule[`all:${dayKey}`] || [])
                : (courseSchedule[dayKey] || []);
            const hasAttendanceRecord = Object.values(studentCourseDailyStatus || {}).some(dates => dates && dates[dateStr]);

            const isActuallyHoliday = isHoliday;
            // Allow sessions even outside term boundaries or on holidays IF there is an actual attendance record
            const isSession = (!isActuallyHoliday && periodsToday.length > 0) || hasAttendanceRecord;

            if (isSession) {
                const periodsToSession = periodsToday.length > 0 ? periodsToday : [0];

                periodsToSession.forEach((p, pIdx) => {
                    if (pIdx === 0) {
                        annualHourCounter++;
                        termHourCounter++;

                        termSessionBuffer.push({
                            date: new Date(currentDay),
                            dateStr,
                            dayOfMonth: currentDay.getDate(),
                            monthIndex: currentDay.getMonth(),
                            weekdayLabel: THAI_WEEKDAYS_SHORT[dayOfWeekIndex],
                            isHoliday: false,
                            hourLabel: String(annualHourCounter),
                            period: p,
                            isSession: true,
                            eventType: event?.type || 'normal'
                        });
                    }
                });
            } else {
                termSessionBuffer.push({
                    date: new Date(currentDay),
                    dateStr,
                    dayOfMonth: currentDay.getDate(),
                    monthIndex: currentDay.getMonth(),
                    weekdayLabel: THAI_WEEKDAYS_SHORT[dayOfWeekIndex],
                    isHoliday: isActuallyHoliday,
                    holidayName: description || (dayOfWeekIndex === 0 || dayOfWeekIndex === 6 ? 'วันหยุดเสาร์-อาทิตย์' : ''),
                    hourLabel: '',
                    isSession: false,
                    eventType: (event?.type || (isActuallyHoliday ? 'holiday' : 'normal'))
                });
            }

            currentDay.setUTCDate(currentDay.getUTCDate() + 1);
        }

        for (let i = 0; i < termSessionBuffer.length; i += SESSIONS_PER_PAGE) {
            const chunk = termSessionBuffer.slice(i, i + SESSIONS_PER_PAGE) as any[];
            const isLastPageOfTerm = (i + SESSIONS_PER_PAGE) >= termSessionBuffer.length;

            while (chunk.length < SESSIONS_PER_PAGE) {
                chunk.push(null);
            }

            const weeks: number[] = [];
            const months: string[] = [];

            for (let wIdx = 0; wIdx < 4; wIdx++) {
                const weekChunk = chunk.slice(wIdx * 7, (wIdx + 1) * 7).filter(s => s);
                if (weekChunk.length > 0) {
                    // Number the visible 7-day blocks sequentially. The first block may begin
                    // before the official term start so the calendar aligns to Sunday.
                    weeks.push(Math.floor(i / 7) + wIdx + 1);

                    const firstMonth = weekChunk[0].monthIndex;
                    const lastMonth = weekChunk[weekChunk.length - 1].monthIndex;
                    months.push(firstMonth === lastMonth ? THAI_MONTHS_SHORT[firstMonth] : `${THAI_MONTHS_SHORT[firstMonth]}-${THAI_MONTHS_SHORT[lastMonth]}`);
                } else {
                    weeks.push(i / 7 + 1); // Fallback to sequential numbering if chunk is empty
                    months.push('');
                }
            }

            allPages.push({
                weeks,
                months,
                days: chunk,
                term: termKey === 'term1' ? '1' : '2',
                termTotalHours: termHourCounter,
                isLastPageOfTerm,
            });
        }
    }

    return allPages;
};

export interface AttendanceBucket {
    present: number;
    absent: number;
    late: number;
    leave: number;
    totalPossibleHours: number;
    percentage: number;
}

export interface StudentAttendanceSummary {
    term1: Omit<AttendanceBucket, 'percentage'>;
    term2: Omit<AttendanceBucket, 'percentage'>;
    annual: AttendanceBucket & { evaluation: string };
    elapsed: AttendanceBucket;
}

// "Elapsed" = sessions on/before today — used for the 80%-attendance "มส" check so a
// term that hasn't finished yet doesn't have its still-untaught future sessions counted
// as absences (the annual/term buckets cover the WHOLE term, appropriate once every
// session is already in the past — e.g. a completed-term backfill).
export const buildStudentAttendanceSummaries = (
    students: AttendanceEligibilityStudent[],
    attendancePages: any[],
    studentCourseDailyStatus: Record<string, Record<string, AttendanceStatus>>
): Record<string, StudentAttendanceSummary> => {
    const summaries: Record<string, StudentAttendanceSummary> = {};
    if (!students.length || !attendancePages.length) return summaries;

    const now = new Date();
    const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;

    students.forEach(student => {
        const statusMap = studentCourseDailyStatus[student.id] || {};
        const summary: StudentAttendanceSummary = {
            term1: { present: 0, absent: 0, late: 0, leave: 0, totalPossibleHours: 0 },
            term2: { present: 0, absent: 0, late: 0, leave: 0, totalPossibleHours: 0 },
            annual: { present: 0, absent: 0, late: 0, leave: 0, totalPossibleHours: 0, percentage: 0, evaluation: 'ปรับปรุง' },
            elapsed: { present: 0, absent: 0, late: 0, leave: 0, totalPossibleHours: 0, percentage: 0 }
        };

        attendancePages.forEach(page => {
            const termKey: 'term1' | 'term2' = page.term === '1' ? 'term1' : 'term2';
            page.days.forEach((day: any) => {
                if (day && day.isSession) {
                    // Days before this student enrolled in the course don't count toward
                    // either their totalPossibleHours or any status bucket.
                    if (!isStudentEnrolledOnDay(student, day.dateStr)) return;

                    summary[termKey].totalPossibleHours++;
                    summary.annual.totalPossibleHours++;
                    const status = statusMap[day.dateStr];
                    const isElapsed = day.dateStr <= todayStr;
                    if (isElapsed) summary.elapsed.totalPossibleHours++;
                    if (status === 'present') {
                        summary[termKey].present++; summary.annual.present++;
                        if (isElapsed) summary.elapsed.present++;
                    } else if (status === 'late') {
                        summary[termKey].late++; summary.annual.late++;
                        if (isElapsed) summary.elapsed.late++;
                    } else if (status === 'leave') {
                        summary[termKey].leave++; summary.annual.leave++;
                        if (isElapsed) summary.elapsed.leave++;
                    } else {
                        // 'escape' (truancy) and any other/unrecorded status count as absent.
                        summary[termKey].absent++; summary.annual.absent++;
                        if (isElapsed) summary.elapsed.absent++;
                    }
                }
            });
        });

        const { present, late, leave, totalPossibleHours } = summary.annual;
        summary.annual.percentage = totalPossibleHours > 0 ? ((present + late + leave) / totalPossibleHours) * 100 : 0;
        summary.annual.evaluation = summary.annual.percentage >= 80 ? 'ดีเยี่ยม' : summary.annual.percentage >= 60 ? 'ดี' : summary.annual.percentage >= 50 ? 'ผ่าน' : 'ปรับปรุง';

        const elapsedTotal = summary.elapsed.totalPossibleHours;
        summary.elapsed.percentage = elapsedTotal > 0
            ? ((summary.elapsed.present + summary.elapsed.late + summary.elapsed.leave) / elapsedTotal) * 100
            : 0;

        summaries[student.id] = summary;
    });
    return summaries;
};

export interface AttendanceEligibilityResult {
    percentage: number;
    presentHours: number;
    totalHours: number;
    belowThreshold: boolean;
}

// Per-student "เวลาเรียนไม่ถึงร้อยละ 80" check, scoped to sessions on/before today
// ("elapsed") — used for every eligibility check (ปพ.5 save, attendance-page save, the มส
// backfill tool) so a term that hasn't finished yet never has its still-untaught future
// sessions counted as absences. For a term that HAS already concluded, every session date is
// on/before today anyway, so elapsed naturally covers the whole term — there is no separate
// "annual/full-term" mode to choose here.
//
// A student with zero possible hours in the chosen scope (no ตารางสอน assigned yet, so the
// system has no periods to check attendance against at all) counts as failing the 80%
// requirement too — 0% is not ≥80% — rather than silently treating them as passing, which
// would hide the real problem (the course was never scheduled) behind a clean bill of health.
export const computeAttendanceEligibility = (
    studentAttendanceSummaries: Record<string, StudentAttendanceSummary>
): Record<string, AttendanceEligibilityResult> => {
    const result: Record<string, AttendanceEligibilityResult> = {};
    Object.entries(studentAttendanceSummaries).forEach(([studentId, summary]) => {
        const bucket = summary.elapsed;
        const presentHours = bucket.present + bucket.late + bucket.leave;
        result[studentId] = {
            percentage: bucket.percentage,
            presentHours,
            totalHours: bucket.totalPossibleHours,
            belowThreshold: bucket.percentage < 80
        };
    });
    return result;
};
