import { useMemo, useCallback } from 'react';
import Swal from 'sweetalert2';
import { Student, GradeRecord, CharacteristicCriteria, ReadingWritingCriteria } from '../types';

const THAI_MONTHS_SHORT = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'];
const THAI_WEEKDAYS_SHORT = ['อา', 'จ', 'อ', 'พ', 'พฤ', 'ศ', 'ส'];
const DAY_KEY_MAP = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];

export const useGradeBookAttendance = (
    calendarData: any,
    courseSchedule: Record<string, number[]>,
    selectedSemester: string,
    selectedClass: string,
    students: Student[],
    selectedCourse: string,
    characteristicsCriteria: CharacteristicCriteria[],
    readingWritingCriteria: ReadingWritingCriteria[],
    grades: Record<string, GradeRecord>,
    studentCourseDailyStatus: Record<string, Record<string, 'present' | 'absent' | 'late' | 'leave'>>,
    checkIsHolidayLocal: (dateStr: string, events: Record<string, any>) => { isHoliday: boolean; description: string }
) => {
    const SESSIONS_PER_PAGE = 28;

    const attendancePages = useMemo(() => {
        if (!calendarData?.terms || !selectedClass) return [];

        const allPages: any[] = [];
        let annualHourCounter = 0;
        let weekCounter = 1;

        const termsToProcess = selectedSemester === '2' ? ['term2'] : ['term1', 'term2'];

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
                const isBeforeTerm = currentDay < termStartDate;

                const { isHoliday, description } = checkIsHolidayLocal(dateStr, events);
                const dayOfWeekIndex = currentDay.getDay();
                let dayKey = DAY_KEY_MAP[dayOfWeekIndex];
                const event = events[dateStr];
                if (event?.type === 'schoolDay' && event?.scheduleDay) {
                    dayKey = event.scheduleDay;
                }

                const periodsToday = courseSchedule[dayKey] || [];
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
                        const firstDate = weekChunk[0].date;
                        // Calculate week number relative to term start, ensuring it starts at 1
                        const diffDays = (firstDate.getTime() - termStartDate.getTime()) / (7 * 86400000);
                        const weekNum = Math.max(1, Math.floor(diffDays) + 1);
                        weeks.push(weekNum);

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
            weekCounter += 20;
        }

        return allPages;
    }, [calendarData, courseSchedule, selectedSemester, selectedClass, studentCourseDailyStatus, checkIsHolidayLocal]);

    const completenessStats = useMemo(() => {
        if (!students.length || !selectedCourse) return null;

        // 1. Grades Progress: formative, midterm, final (3 fields per student)
        const totalGradesFields = students.length * 3;
        let filledGradesFields = 0;

        // 2. Characteristics Progress
        const charIndicatorCount = characteristicsCriteria.reduce((acc, c) => acc + (c.indicators?.length || 0), 0);
        const totalCharFields = students.length * charIndicatorCount;
        let filledCharFields = 0;

        // 3. Reading/Writing Progress
        const rwIndicatorCount = readingWritingCriteria.reduce((acc, c) => acc + (c.indicators?.length || 0), 0);
        const totalRWFields = students.length * rwIndicatorCount;
        let filledRWFields = 0;

        students.forEach(student => {
            const record = grades[student.id];
            if (!record) return;

            // Grades Check - use typeof to be safe with numbers including 0
            if (record.formative !== undefined && record.formative !== null && record.formative !== ('' as any)) filledGradesFields++;
            if (record.midterm !== undefined && record.midterm !== null && record.midterm !== ('' as any)) filledGradesFields++;
            if (record.final !== undefined && record.final !== null && record.final !== ('' as any)) filledGradesFields++;

            // Characteristics Check (Strict per Criteria)
            characteristicsCriteria.forEach(c => {
                (c.indicators || []).forEach((_, iIdx) => {
                    const val = record.characteristicsScores?.[`${c.id}_${iIdx}`];
                    if (val !== undefined && val !== null && val !== ('' as any)) filledCharFields++;
                });
            });

            // RW Check (Strict per Criteria)
            readingWritingCriteria.forEach(c => {
                (c.indicators || []).forEach((_, iIdx) => {
                    const val = record.readingWritingScores?.[`${c.id}_${iIdx}`];
                    if (val !== undefined && val !== null && val !== ('' as any)) filledRWFields++;
                });
            });
        });

        const percentGrades = totalGradesFields > 0 ? Math.round((filledGradesFields / totalGradesFields) * 100) : 0;
        const percentChar = totalCharFields > 0 ? Math.round((filledCharFields / totalCharFields) * 100) : 0;
        const percentRW = totalRWFields > 0 ? Math.round((filledRWFields / totalRWFields) * 100) : 0;

        const total = totalGradesFields + totalCharFields + totalRWFields;
        const filled = filledGradesFields + filledCharFields + filledRWFields;
        const percentage = total > 0 ? Math.round((filled / total) * 100) : 0;

        // Attendance Stats
        const recordedDatesMap = new Set<string>();
        Object.values(studentCourseDailyStatus || {}).forEach(dates => {
            Object.keys(dates).forEach(d => recordedDatesMap.add(d));
        });

        const recordedSessionsCount = Array.from(recordedDatesMap).reduce((acc, dStr) => {
            let sessionsOnThisDate = 0;
            attendancePages.forEach(p => {
                p.days.forEach((day: any) => {
                    if (day && day.dateStr === dStr && day.isSession) sessionsOnThisDate++;
                });
            });
            return acc + (sessionsOnThisDate || 1);
        }, 0);

        const missingSessionsByMonth: Record<string, string[]> = {};
        attendancePages.forEach(page => {
            page.days.forEach((day: any) => {
                if (day && day.isSession && !recordedDatesMap.has(day.dateStr)) {
                    const parts = day.dateStr.split('-');
                    const monthKey = `${parts[1]}-${parts[0]}`;
                    if (!missingSessionsByMonth[monthKey]) missingSessionsByMonth[monthKey] = [];
                    missingSessionsByMonth[monthKey].push(`${day.dateStr} (คาบที่ ${day.hourLabel})`);
                }
            });
        });

        const missingSessionsCount = Object.values(missingSessionsByMonth).reduce((acc, list) => acc + list.length, 0);

        // Readiness check
        const isReadyForPdf = (percentChar >= 100) && (percentRW >= 100) && (recordedSessionsCount >= 1) && (students.length > 0);

        return {
            total,
            filled,
            percentage,
            percentGrades,
            percentChar,
            percentRW,
            isComplete: percentage === 100 && missingSessionsCount === 0,
            isReadyForPdf,
            missingGrades: totalGradesFields - filledGradesFields,
            missingChar: totalCharFields - filledCharFields,
            missingRW: totalRWFields - filledRWFields,
            missingAttendanceDays: missingSessionsCount,
            missingDatesByMonth: missingSessionsByMonth,
            recordedDaysCount: recordedSessionsCount,
            totalGrades: totalGradesFields,
            filledGrades: filledGradesFields,
            totalChar: totalCharFields,
            filledChar: filledCharFields,
            totalRW: totalRWFields,
            filledRW: filledRWFields
        };
    }, [students, grades, characteristicsCriteria, readingWritingCriteria, selectedCourse, studentCourseDailyStatus, attendancePages]);

    const validateDataCompleteness = useCallback(() => {
        if (!students.length) {
            Swal.fire('ไม่พบข้อมูลนักเรียน', 'กรุณาตรวจสอบการเลือกชั้นเรียนและห้องเรียน', 'warning');
            return false;
        }

        const missingData: string[] = [];
        students.forEach(student => {
            const record = grades[student.id];
            const name = `${student.firstName} ${student.lastName}`;

            if (!record) {
                missingData.push(`${student.studentNumber}: ${name} (ไม่มีข้อมูลคะแนน)`);
                return;
            }

            characteristicsCriteria.forEach(c => {
                (c.indicators || []).forEach((_, iIdx) => {
                    const val = record.characteristicsScores?.[`${c.id}_${iIdx}`];
                    if (val === undefined || val === null || val === ('' as any)) {
                        missingData.push(`${student.studentNumber}: ${name} (ขาดคะแนนคุณลักษณะฯ: ${c.title})`);
                    }
                });
            });

            readingWritingCriteria.forEach(c => {
                (c.indicators || []).forEach((_, iIdx) => {
                    const val = record.readingWritingScores?.[`${c.id}_${iIdx}`];
                    if (val === undefined || val === null || val === ('' as any)) {
                        missingData.push(`${student.studentNumber}: ${name} (ขาดคะแนนอ่าน/คิด/เขียน: ${c.standard})`);
                    }
                });
            });
        });

        const recordedDatesSet = new Set<string>();
        Object.values(studentCourseDailyStatus || {}).forEach(dates => {
            Object.keys(dates).forEach(d => recordedDatesSet.add(d));
        });

        const missingSessions: string[] = [];
        attendancePages.forEach(page => {
            page.days.forEach((day: any) => {
                if (day && day.isSession && !recordedDatesSet.has(day.dateStr)) {
                    missingSessions.push(`${day.dateStr} (คาบที่ ${day.hourLabel})`);
                }
            });
        });

        if (missingSessions.length > 0) {
            const monthlyMissingCount: Record<string, number> = {};
            missingSessions.forEach(sessionInfo => {
                const dStr = sessionInfo.split(' ')[0];
                const [y, m, d] = dStr.split('-').map(Number);
                const key = `${THAI_MONTHS_SHORT[m - 1]} ${y + 543}`;
                monthlyMissingCount[key] = (monthlyMissingCount[key] || 0) + 1;
            });

            const breakdown = Object.entries(monthlyMissingCount)
                .map(([name, count]) => `${name} (${count} คาบ)`)
                .join(', ');

            missingData.push(`ขาดการเช็คชื่อรวม ${missingSessions.length} คาบ${breakdown ? `: ${breakdown}` : ''}`);
        }

        if (missingData.length > 0) {
            const totalChar = characteristicsCriteria.reduce((sum, c) => sum + (c.indicators?.length || 0), 0);
            const totalRW = readingWritingCriteria.reduce((sum, c) => sum + (c.indicators?.length || 0), 0);
            const totalPointsPerStudent = totalChar + totalRW;
            const totalPointsPossible = students.length * totalPointsPerStudent;
            const completeness = Math.max(0, Math.min(99, Math.round(((totalPointsPossible - missingData.length) / totalPointsPossible) * 100)));

            Swal.fire({
                title: 'ข้อมูลยังไม่ครบถ้วน',
                html: `
                    <div class="text-left text-sm relative pt-2">
                        <div class="absolute -top-12 right-0 bg-orange-500 text-white px-3 py-1 rounded-full text-[11px] font-bold shadow-sm">
                            ${completeness}% เสร็จสมบูรณ์
                        </div>
                        <p class="mb-3 font-bold text-red-500">พบจุดที่ยังไม่ได้ระบุข้อมูล ${missingData.length.toLocaleString()} จุด:</p>
                        <ul class="list-disc pl-5 space-y-1.5 max-h-[40vh] overflow-y-auto text-gray-600 dark:text-gray-300">
                            ${missingData.slice(0, 10).map(m => `<li>${m}</li>`).join('')}
                        </ul>
                        ${missingData.length > 10 ? `<p class="mt-3 text-gray-400 italic text-[11px]">... และอีก ${(missingData.length - 10).toLocaleString()} จุด</p>` : ''}
                        <div class="mt-5 p-3 bg-gray-50 dark:bg-gray-800/50 rounded-xl border border-gray-100 dark:border-gray-700">
                            <p class="text-[11px] text-gray-500 leading-relaxed">
                                <strong class="text-indigo-600 dark:text-indigo-400">หมายเหตุ:</strong> ข้อมูลส่วนการประเมินคุณลักษณะฯ การอ่าน/คิด/เขียน และการเช็คชื่อต้องครบถ้วน
                            </p>
                        </div>
                    </div>
                `,
                icon: 'error',
                width: '550px',
                confirmButtonText: 'ตกลง',
                confirmButtonColor: '#4f46e5',
                background: document.documentElement.classList.contains('dark') ? '#2a2b2f' : '#ffffff',
                color: document.documentElement.classList.contains('dark') ? '#ffffff' : '#1f2937',
            });
            return false;
        }

        return true;
    }, [students, grades, characteristicsCriteria, readingWritingCriteria, studentCourseDailyStatus, attendancePages]);

    const studentAttendanceSummaries = useMemo(() => {
        const summaries: Record<string, any> = {};
        if (!students.length || !attendancePages.length) return summaries;

        students.forEach(student => {
            const statusMap = studentCourseDailyStatus[student.id] || {};
            const summary = {
                term1: { present: 0, absent: 0, late: 0, leave: 0, totalPossibleHours: 0 },
                term2: { present: 0, absent: 0, late: 0, leave: 0, totalPossibleHours: 0 },
                annual: { present: 0, absent: 0, late: 0, leave: 0, totalPossibleHours: 0, percentage: 0, evaluation: 'ปรับปรุง' }
            };

            attendancePages.forEach(page => {
                const termKey = page.term === '1' ? 'term1' : 'term2';
                page.days.forEach((day: any) => {
                    if (day && day.isSession) {
                        summary[termKey].totalPossibleHours++;
                        summary.annual.totalPossibleHours++;
                        const status = statusMap[day.dateStr];
                        if (status === 'present') { summary[termKey].present++; summary.annual.present++; }
                        else if (status === 'absent') { summary[termKey].absent++; summary.annual.absent++; }
                        else if (status === 'late') { summary[termKey].late++; summary.annual.late++; }
                        else if (status === 'leave') { summary[termKey].leave++; summary.annual.leave++; }
                        else { summary[termKey].absent++; summary.annual.absent++; }
                    }
                });
            });

            const { present, late, leave, totalPossibleHours } = summary.annual;
            summary.annual.percentage = totalPossibleHours > 0 ? ((present + late + leave) / totalPossibleHours) * 100 : 0;
            summary.annual.evaluation = summary.annual.percentage >= 80 ? 'ดีเยี่ยม' : summary.annual.percentage >= 60 ? 'ดี' : summary.annual.percentage >= 50 ? 'ผ่าน' : 'ปรับปรุง';
            summaries[student.id] = summary;
        });
        return summaries;
    }, [students, attendancePages, studentCourseDailyStatus]);

    return { attendancePages, completenessStats, validateDataCompleteness, studentAttendanceSummaries };
};
