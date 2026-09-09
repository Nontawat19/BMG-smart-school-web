import { useMemo, useCallback } from 'react';
import Swal from 'sweetalert2';
import { Student, GradeRecord, CharacteristicCriteria, ReadingWritingCriteria, Course } from '../types';
import {
    isStudentEnrolledOnDay,
    buildAttendancePages,
    buildStudentAttendanceSummaries,
    computeAttendanceEligibility,
} from '../../../../utils/attendanceEligibility';

const THAI_MONTHS_SHORT = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'];
const getAssessmentKey = (assessment: { id?: string; name?: string }) => assessment.id || assessment.name || '';
const isFilledScore = (value: unknown) => value !== undefined && value !== null && value !== '';

export const useGradeBookAttendance = (
    calendarData: any,
    courseSchedule: Record<string, number[]>,
    selectedSemester: string,
    selectedClass: string,
    students: Student[],
    selectedCourse: string,
    currentCourse: Course | undefined,
    maxScores: { formative: number; midterm: number; final: number },
    characteristicsCriteria: CharacteristicCriteria[],
    readingWritingCriteria: ReadingWritingCriteria[],
    grades: Record<string, GradeRecord>,
    studentCourseDailyStatus: Record<string, Record<string, 'present' | 'absent' | 'late' | 'leave' | 'escape'>>,
    checkIsHolidayLocal: (dateStr: string, events: Record<string, any>) => { isHoliday: boolean; description: string }
) => {
    const attendancePages = useMemo(() => buildAttendancePages(
        calendarData,
        courseSchedule,
        selectedSemester,
        selectedClass,
        studentCourseDailyStatus,
        checkIsHolidayLocal
    ), [calendarData, courseSchedule, selectedSemester, selectedClass, studentCourseDailyStatus, checkIsHolidayLocal]);

    const completenessStats = useMemo(() => {
        if (!students.length || !selectedCourse) return null;

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

            gradeRequirements.forEach(requirement => {
                const val = requirement.type === 'formativeDetail'
                    ? record.formativeDetails?.[requirement.key]
                    : (record as any)[requirement.key];
                if (isFilledScore(val)) filledGradesFields++;
            });

            // Characteristics Check (Strict per Criteria)
            characteristicsCriteria.forEach(c => {
                (c.indicators || []).forEach((_, iIdx) => {
                    const val = record.characteristicsScores?.[`${c.id}_${iIdx}`];
                    if (isFilledScore(val)) filledCharFields++;
                });
            });

            // RW Check (Strict per Criteria)
            readingWritingCriteria.forEach(c => {
                (c.indicators || []).forEach((_, iIdx) => {
                    const val = record.readingWritingScores?.[`${c.id}_${iIdx}`];
                    if (isFilledScore(val)) filledRWFields++;
                });
            });
        });

        const percentGrades = totalGradesFields > 0 ? Math.round((filledGradesFields / totalGradesFields) * 100) : 0;
        const percentChar = totalCharFields > 0 ? Math.round((filledCharFields / totalCharFields) * 100) : 0;
        const percentRW = totalRWFields > 0 ? Math.round((filledRWFields / totalRWFields) * 100) : 0;

        // Attendance Stats: every enrolled student must have a recorded status for every
        // course session that falls on/after the day they enrolled (see isStudentEnrolledOnDay).
        const sessionDays = attendancePages.flatMap(page => (page.days || []).filter((day: any) => day && day.isSession));
        let totalAttendanceFields = 0;
        let filledAttendanceFields = 0;
        let fullyRecordedSessionsCount = 0;

        sessionDays.forEach((day: any) => {
            const eligibleStudents = students.filter(student => isStudentEnrolledOnDay(student, day.dateStr));
            if (eligibleStudents.length === 0) return;
            let isSessionComplete = true;
            eligibleStudents.forEach(student => {
                totalAttendanceFields++;
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
                if (!day || !day.isSession) return;
                const hasMissingEnrolledStudent = students.some(student =>
                    isStudentEnrolledOnDay(student, day.dateStr) && !isFilledScore(studentCourseDailyStatus?.[student.id]?.[day.dateStr])
                );
                if (hasMissingEnrolledStudent) {
                    const parts = day.dateStr.split('-');
                    const monthKey = `${parts[1]}-${parts[0]}`;
                    if (!missingSessionsByMonth[monthKey]) missingSessionsByMonth[monthKey] = [];
                    missingSessionsByMonth[monthKey].push(`${day.dateStr} (คาบที่ ${day.hourLabel})`);
                }
            });
        });

        const missingSessionsCount = Object.values(missingSessionsByMonth).reduce((acc, list) => acc + list.length, 0);
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

        return {
            total,
            filled,
            percentage,
            percentGrades,
            percentChar,
            percentRW,
            percentAttendance,
            isComplete: isReadyForPdf,
            isReadyForPdf,
            missingGrades: totalGradesFields - filledGradesFields,
            missingChar: totalCharFields - filledCharFields,
            missingRW: totalRWFields - filledRWFields,
            missingAttendanceDays: missingSessionsCount,
            missingAttendanceFields,
            missingDatesByMonth: missingSessionsByMonth,
            recordedDaysCount: fullyRecordedSessionsCount,
            totalAttendance: totalAttendanceFields,
            filledAttendance: filledAttendanceFields,
            totalGrades: totalGradesFields,
            filledGrades: filledGradesFields,
            totalChar: totalCharFields,
            filledChar: filledCharFields,
            totalRW: totalRWFields,
            filledRW: filledRWFields
        };
    }, [students, grades, characteristicsCriteria, readingWritingCriteria, selectedCourse, currentCourse, maxScores, studentCourseDailyStatus, attendancePages]);

    const validateDataCompleteness = useCallback(() => {
        if (!students.length) {
            Swal.fire('ไม่พบข้อมูลนักเรียน', 'กรุณาตรวจสอบการเลือกชั้นเรียนและห้องเรียน', 'warning');
            return false;
        }

        const missingData: string[] = [];
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

        students.forEach(student => {
            const record = grades[student.id];
            const name = `${student.firstName} ${student.lastName}`;

            if (!record) {
                missingData.push(`${student.studentNumber}: ${name} (ไม่มีข้อมูลคะแนน)`);
                return;
            }

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
                        missingData.push(`${student.studentNumber}: ${name} (ขาดคะแนนคุณลักษณะฯ: ${c.title})`);
                    }
                });
            });

            readingWritingCriteria.forEach(c => {
                (c.indicators || []).forEach((_, iIdx) => {
                    const val = record.readingWritingScores?.[`${c.id}_${iIdx}`];
                    if (!isFilledScore(val)) {
                        missingData.push(`${student.studentNumber}: ${name} (ขาดคะแนนอ่าน/คิด/เขียน: ${c.standard})`);
                    }
                });
            });
        });

        const missingSessions: string[] = [];
        let missingAttendancePoints = 0;
        attendancePages.forEach(page => {
            page.days.forEach((day: any) => {
                if (!day || !day.isSession) return;

                let sessionHasMissingStudent = false;
                students.forEach(student => {
                    if (!isStudentEnrolledOnDay(student, day.dateStr)) return;
                    if (!isFilledScore(studentCourseDailyStatus?.[student.id]?.[day.dateStr])) {
                        missingAttendancePoints++;
                        sessionHasMissingStudent = true;
                    }
                });

                if (sessionHasMissingStudent) {
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

            missingData.push(`ขาดการเช็คชื่อรวม ${missingSessions.length} คาบ / ${missingAttendancePoints.toLocaleString()} รายการนักเรียน${breakdown ? `: ${breakdown}` : ''}`);
        }

        if (missingData.length > 0) {
            const completeness = Math.max(0, Math.min(99, completenessStats?.percentage || 0));

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
    }, [students, grades, currentCourse, maxScores, characteristicsCriteria, readingWritingCriteria, studentCourseDailyStatus, attendancePages, completenessStats]);

    const studentAttendanceSummaries = useMemo(
        () => buildStudentAttendanceSummaries(students, attendancePages, studentCourseDailyStatus),
        [students, attendancePages, studentCourseDailyStatus]
    );

    // Per-student "เวลาเรียนไม่ถึงร้อยละ 80" check for the current course/term scope (whichever
    // term(s) selectedSemester/effectiveSemester put into attendancePages — annual for primary
    // classes forced onto 'annual' upstream, a single semester for secondary). Based on elapsed
    // sessions only (see attendanceEligibility.ts for the 'elapsed' vs 'annual' modes).
    const attendanceEligibility = useMemo(
        () => computeAttendanceEligibility(studentAttendanceSummaries),
        [studentAttendanceSummaries]
    );

    return { attendancePages, completenessStats, validateDataCompleteness, studentAttendanceSummaries, attendanceEligibility };
};
