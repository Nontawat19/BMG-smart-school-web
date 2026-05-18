import { useMemo, useCallback } from 'react';
import Swal from 'sweetalert2';
<<<<<<< HEAD
import { Student, GradeRecord, CharacteristicCriteria, ReadingWritingCriteria, Course } from '../types';
=======
import { Student, GradeRecord, CharacteristicCriteria, ReadingWritingCriteria } from '../types';
>>>>>>> 5f8c7e1 (feat: optimize auto-scheduler and update UI labels)

const THAI_MONTHS_SHORT = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'];
const THAI_WEEKDAYS_SHORT = ['อา', 'จ', 'อ', 'พ', 'พฤ', 'ศ', 'ส'];
const DAY_KEY_MAP = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
<<<<<<< HEAD
const getAssessmentKey = (assessment: { id?: string; name?: string }) => assessment.id || assessment.name || '';
const isFilledScore = (value: unknown) => value !== undefined && value !== null && value !== '';
=======
>>>>>>> 5f8c7e1 (feat: optimize auto-scheduler and update UI labels)

export const useGradeBookAttendance = (
    calendarData: any,
    courseSchedule: Record<string, number[]>,
    selectedSemester: string,
    selectedClass: string,
    students: Student[],
    selectedCourse: string,
<<<<<<< HEAD
    currentCourse: Course | undefined,
    maxScores: { formative: number; midterm: number; final: number },
=======
>>>>>>> 5f8c7e1 (feat: optimize auto-scheduler and update UI labels)
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

<<<<<<< HEAD
        const termsToProcess =
            selectedSemester === '2'
                ? ['term2']
                : selectedSemester === '1'
                    ? ['term1']
                    : ['term1', 'term2'];
=======
        const termsToProcess = selectedSemester === '2' ? ['term2'] : ['term1', 'term2'];
>>>>>>> 5f8c7e1 (feat: optimize auto-scheduler and update UI labels)

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
<<<<<<< HEAD
                // Allow sessions even outside term boundaries or on holidays IF there is an actual attendance record
                const isSession = (!isActuallyHoliday && periodsToday.length > 0) || hasAttendanceRecord;
=======
                const isSession = !isBeforeTerm && ((!isActuallyHoliday && periodsToday.length > 0) || hasAttendanceRecord);
>>>>>>> 5f8c7e1 (feat: optimize auto-scheduler and update UI labels)

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
<<<<<<< HEAD
                        // Number the visible 7-day blocks sequentially. The first block may begin
                        // before the official term start so the calendar aligns to Sunday.
                        weeks.push(Math.floor(i / 7) + wIdx + 1);
=======
                        const firstDate = weekChunk[0].date;
                        const weekNum = Math.floor((firstDate.getTime() - termStartDate.getTime()) / (7 * 86400000)) + 1;
                        weeks.push(weekCounter + weekNum - 1);
>>>>>>> 5f8c7e1 (feat: optimize auto-scheduler and update UI labels)

                        const firstMonth = weekChunk[0].monthIndex;
                        const lastMonth = weekChunk[weekChunk.length - 1].monthIndex;
                        months.push(firstMonth === lastMonth ? THAI_MONTHS_SHORT[firstMonth] : `${THAI_MONTHS_SHORT[firstMonth]}-${THAI_MONTHS_SHORT[lastMonth]}`);
                    } else {
<<<<<<< HEAD
                        weeks.push(i / 7 + 1); // Fallback to sequential numbering if chunk is empty
=======
                        weeks.push(0);
>>>>>>> 5f8c7e1 (feat: optimize auto-scheduler and update UI labels)
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

<<<<<<< HEAD
        const formativeAssessments = (currentCourse?.formativeAssessments || []).filter(a => (Number(a.maxScore) || 0) > 0);
        const gradeRequirements = [
            ...(formativeAssessments.length > 0
                ? formativeAssessments.map(assessment => ({ type: 'formativeDetail' as const, key: getAssessmentKey(assessment) }))
                : maxScores.formative > 0
                    ? [{ type: 'field' as const, key: 'formative' }]
                    : []),
            ...(maxScores.midterm > 0 ? [{ type: 'field' as const, key: 'midterm' }] : []),
            ...(maxScores.final > 0 ? [{ type: 'field' as const, key: 'final' }] : []),
        ];

        // 1. Grades Progress: every configured score field per student
        const totalGradesFields = students.length * gradeRequirements.length;
=======
        // 1. Grades Progress: formative, midterm, final (3 fields per student)
        const totalGradesFields = students.length * 3;
>>>>>>> 5f8c7e1 (feat: optimize auto-scheduler and update UI labels)
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

<<<<<<< HEAD
            gradeRequirements.forEach(requirement => {
                const val = requirement.type === 'formativeDetail'
                    ? record.formativeDetails?.[requirement.key]
                    : (record as any)[requirement.key];
                if (isFilledScore(val)) filledGradesFields++;
            });
=======
            // Grades Check - use typeof to be safe with numbers including 0
            if (record.formative !== undefined && record.formative !== null && record.formative !== ('' as any)) filledGradesFields++;
            if (record.midterm !== undefined && record.midterm !== null && record.midterm !== ('' as any)) filledGradesFields++;
            if (record.final !== undefined && record.final !== null && record.final !== ('' as any)) filledGradesFields++;
>>>>>>> 5f8c7e1 (feat: optimize auto-scheduler and update UI labels)

            // Characteristics Check (Strict per Criteria)
            characteristicsCriteria.forEach(c => {
                (c.indicators || []).forEach((_, iIdx) => {
                    const val = record.characteristicsScores?.[`${c.id}_${iIdx}`];
<<<<<<< HEAD
                    if (isFilledScore(val)) filledCharFields++;
=======
                    if (val !== undefined && val !== null && val !== ('' as any)) filledCharFields++;
>>>>>>> 5f8c7e1 (feat: optimize auto-scheduler and update UI labels)
                });
            });

            // RW Check (Strict per Criteria)
            readingWritingCriteria.forEach(c => {
                (c.indicators || []).forEach((_, iIdx) => {
                    const val = record.readingWritingScores?.[`${c.id}_${iIdx}`];
<<<<<<< HEAD
                    if (isFilledScore(val)) filledRWFields++;
=======
                    if (val !== undefined && val !== null && val !== ('' as any)) filledRWFields++;
>>>>>>> 5f8c7e1 (feat: optimize auto-scheduler and update UI labels)
                });
            });
        });

        const percentGrades = totalGradesFields > 0 ? Math.round((filledGradesFields / totalGradesFields) * 100) : 0;
        const percentChar = totalCharFields > 0 ? Math.round((filledCharFields / totalCharFields) * 100) : 0;
        const percentRW = totalRWFields > 0 ? Math.round((filledRWFields / totalRWFields) * 100) : 0;

<<<<<<< HEAD
        // Attendance Stats: every student must have a recorded status for every course session.
        const sessionDays = attendancePages.flatMap(page => (page.days || []).filter((day: any) => day && day.isSession));
        const totalAttendanceFields = students.length * sessionDays.length;
        let filledAttendanceFields = 0;
        let fullyRecordedSessionsCount = 0;

        sessionDays.forEach((day: any) => {
            let isSessionComplete = students.length > 0;
            students.forEach(student => {
                const status = studentCourseDailyStatus?.[student.id]?.[day.dateStr];
                if (isFilledScore(status)) {
                    filledAttendanceFields++;
                } else {
                    isSessionComplete = false;
                }
            });
            if (isSessionComplete) fullyRecordedSessionsCount++;
        });

        const missingSessionsByMonth: Record<string, string[]> = {};
        attendancePages.forEach(page => {
            page.days.forEach((day: any) => {
                if (day && day.isSession && students.some(student => !isFilledScore(studentCourseDailyStatus?.[student.id]?.[day.dateStr]))) {
=======
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
>>>>>>> 5f8c7e1 (feat: optimize auto-scheduler and update UI labels)
                    const parts = day.dateStr.split('-');
                    const monthKey = `${parts[1]}-${parts[0]}`;
                    if (!missingSessionsByMonth[monthKey]) missingSessionsByMonth[monthKey] = [];
                    missingSessionsByMonth[monthKey].push(`${day.dateStr} (คาบที่ ${day.hourLabel})`);
                }
            });
        });

        const missingSessionsCount = Object.values(missingSessionsByMonth).reduce((acc, list) => acc + list.length, 0);
<<<<<<< HEAD
        const missingAttendanceFields = totalAttendanceFields - filledAttendanceFields;
        const percentAttendance = totalAttendanceFields > 0 ? Math.round((filledAttendanceFields / totalAttendanceFields) * 100) : 0;
        const total = totalGradesFields + totalCharFields + totalRWFields + totalAttendanceFields;
        const filled = filledGradesFields + filledCharFields + filledRWFields + filledAttendanceFields;

        const sectionPercentages = [
            totalGradesFields > 0 ? percentGrades : null,
            totalCharFields > 0 ? percentChar : null,
            totalRWFields > 0 ? percentRW : null,
            totalAttendanceFields > 0 ? percentAttendance : null,
        ].filter((value): value is number => value !== null);
        const percentage = sectionPercentages.length > 0
            ? Math.round(sectionPercentages.reduce((sum, value) => sum + value, 0) / sectionPercentages.length)
            : 0;

        // Readiness check
        const isReadyForPdf = students.length > 0
            && percentGrades >= 100
            && percentChar >= 100
            && percentRW >= 100
            && percentAttendance >= 100;
=======

        // Readiness check
        const isReadyForPdf = (percentChar >= 100) && (percentRW >= 100) && (recordedSessionsCount >= 1) && (students.length > 0);
>>>>>>> 5f8c7e1 (feat: optimize auto-scheduler and update UI labels)

        return {
            total,
            filled,
            percentage,
            percentGrades,
            percentChar,
            percentRW,
<<<<<<< HEAD
            percentAttendance,
            isComplete: isReadyForPdf,
=======
            isComplete: percentage === 100 && missingSessionsCount === 0,
>>>>>>> 5f8c7e1 (feat: optimize auto-scheduler and update UI labels)
            isReadyForPdf,
            missingGrades: totalGradesFields - filledGradesFields,
            missingChar: totalCharFields - filledCharFields,
            missingRW: totalRWFields - filledRWFields,
            missingAttendanceDays: missingSessionsCount,
<<<<<<< HEAD
            missingAttendanceFields,
            missingDatesByMonth: missingSessionsByMonth,
            recordedDaysCount: fullyRecordedSessionsCount,
            totalAttendance: totalAttendanceFields,
            filledAttendance: filledAttendanceFields,
=======
            missingDatesByMonth: missingSessionsByMonth,
            recordedDaysCount: recordedSessionsCount,
>>>>>>> 5f8c7e1 (feat: optimize auto-scheduler and update UI labels)
            totalGrades: totalGradesFields,
            filledGrades: filledGradesFields,
            totalChar: totalCharFields,
            filledChar: filledCharFields,
            totalRW: totalRWFields,
            filledRW: filledRWFields
        };
<<<<<<< HEAD
    }, [students, grades, characteristicsCriteria, readingWritingCriteria, selectedCourse, currentCourse, maxScores, studentCourseDailyStatus, attendancePages]);
=======
    }, [students, grades, characteristicsCriteria, readingWritingCriteria, selectedCourse, studentCourseDailyStatus, attendancePages]);
>>>>>>> 5f8c7e1 (feat: optimize auto-scheduler and update UI labels)

    const validateDataCompleteness = useCallback(() => {
        if (!students.length) {
            Swal.fire('ไม่พบข้อมูลนักเรียน', 'กรุณาตรวจสอบการเลือกชั้นเรียนและห้องเรียน', 'warning');
            return false;
        }

        const missingData: string[] = [];
<<<<<<< HEAD
        const formativeAssessments = (currentCourse?.formativeAssessments || []).filter(a => (Number(a.maxScore) || 0) > 0);
        const gradeRequirements = [
            ...(formativeAssessments.length > 0
                ? formativeAssessments.map(assessment => ({
                    type: 'formativeDetail' as const,
                    key: getAssessmentKey(assessment),
                    label: assessment.name || getAssessmentKey(assessment) || 'คะแนนเก็บย่อย'
                }))
                : maxScores.formative > 0
                    ? [{ type: 'field' as const, key: 'formative', label: 'คะแนนเก็บ' }]
                    : []),
            ...(maxScores.midterm > 0 ? [{ type: 'field' as const, key: 'midterm', label: 'กลางภาค' }] : []),
            ...(maxScores.final > 0 ? [{ type: 'field' as const, key: 'final', label: 'ปลายภาค' }] : []),
        ];

=======
>>>>>>> 5f8c7e1 (feat: optimize auto-scheduler and update UI labels)
        students.forEach(student => {
            const record = grades[student.id];
            const name = `${student.firstName} ${student.lastName}`;

            if (!record) {
                missingData.push(`${student.studentNumber}: ${name} (ไม่มีข้อมูลคะแนน)`);
                return;
            }

<<<<<<< HEAD
            gradeRequirements.forEach(requirement => {
                const val = requirement.type === 'formativeDetail'
                    ? record.formativeDetails?.[requirement.key]
                    : (record as any)[requirement.key];
                if (!isFilledScore(val)) {
                    missingData.push(`${student.studentNumber}: ${name} (ขาดคะแนน: ${requirement.label})`);
                }
            });

            characteristicsCriteria.forEach(c => {
                (c.indicators || []).forEach((_, iIdx) => {
                    const val = record.characteristicsScores?.[`${c.id}_${iIdx}`];
                    if (!isFilledScore(val)) {
=======
            characteristicsCriteria.forEach(c => {
                (c.indicators || []).forEach((_, iIdx) => {
                    const val = record.characteristicsScores?.[`${c.id}_${iIdx}`];
                    if (val === undefined || val === null || val === ('' as any)) {
>>>>>>> 5f8c7e1 (feat: optimize auto-scheduler and update UI labels)
                        missingData.push(`${student.studentNumber}: ${name} (ขาดคะแนนคุณลักษณะฯ: ${c.title})`);
                    }
                });
            });

            readingWritingCriteria.forEach(c => {
                (c.indicators || []).forEach((_, iIdx) => {
                    const val = record.readingWritingScores?.[`${c.id}_${iIdx}`];
<<<<<<< HEAD
                    if (!isFilledScore(val)) {
=======
                    if (val === undefined || val === null || val === ('' as any)) {
>>>>>>> 5f8c7e1 (feat: optimize auto-scheduler and update UI labels)
                        missingData.push(`${student.studentNumber}: ${name} (ขาดคะแนนอ่าน/คิด/เขียน: ${c.standard})`);
                    }
                });
            });
        });

<<<<<<< HEAD
        const missingSessions: string[] = [];
        let missingAttendancePoints = 0;
        attendancePages.forEach(page => {
            page.days.forEach((day: any) => {
                if (!day || !day.isSession) return;

                let sessionHasMissingStudent = false;
                students.forEach(student => {
                    if (!isFilledScore(studentCourseDailyStatus?.[student.id]?.[day.dateStr])) {
                        missingAttendancePoints++;
                        sessionHasMissingStudent = true;
                    }
                });

                if (sessionHasMissingStudent) {
=======
        const recordedDatesSet = new Set<string>();
        Object.values(studentCourseDailyStatus || {}).forEach(dates => {
            Object.keys(dates).forEach(d => recordedDatesSet.add(d));
        });

        const missingSessions: string[] = [];
        attendancePages.forEach(page => {
            page.days.forEach((day: any) => {
                if (day && day.isSession && !recordedDatesSet.has(day.dateStr)) {
>>>>>>> 5f8c7e1 (feat: optimize auto-scheduler and update UI labels)
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

<<<<<<< HEAD
            missingData.push(`ขาดการเช็คชื่อรวม ${missingSessions.length} คาบ / ${missingAttendancePoints.toLocaleString()} รายการนักเรียน${breakdown ? `: ${breakdown}` : ''}`);
        }

        if (missingData.length > 0) {
            const completeness = Math.max(0, Math.min(99, completenessStats?.percentage || 0));
=======
            missingData.push(`ขาดการเช็คชื่อรวม ${missingSessions.length} คาบ${breakdown ? `: ${breakdown}` : ''}`);
        }

        if (missingData.length > 0) {
            const totalChar = characteristicsCriteria.reduce((sum, c) => sum + (c.indicators?.length || 0), 0);
            const totalRW = readingWritingCriteria.reduce((sum, c) => sum + (c.indicators?.length || 0), 0);
            const totalPointsPerStudent = totalChar + totalRW;
            const totalPointsPossible = students.length * totalPointsPerStudent;
            const completeness = Math.max(0, Math.min(99, Math.round(((totalPointsPossible - missingData.length) / totalPointsPossible) * 100)));
>>>>>>> 5f8c7e1 (feat: optimize auto-scheduler and update UI labels)

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
<<<<<<< HEAD
    }, [students, grades, currentCourse, maxScores, characteristicsCriteria, readingWritingCriteria, studentCourseDailyStatus, attendancePages, completenessStats]);
=======
    }, [students, grades, characteristicsCriteria, readingWritingCriteria, studentCourseDailyStatus, attendancePages]);
>>>>>>> 5f8c7e1 (feat: optimize auto-scheduler and update UI labels)

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
