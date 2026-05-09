import Swal from 'sweetalert2';
import withReactContent from 'sweetalert2-react-content';
import { useRef } from 'react';
import { collection, doc, getDocs, writeBatch, setDoc, getDoc } from 'firebase/firestore';
import { firestore as db } from '@/firebase';
import { Course, CourseInstance, Schedule, Teacher, PeriodSetting, SpecialPeriod, SchedulingMetrics, SchoolSettings, AssignmentConstraintMap } from '../types';
import { checkConstraints, getClassDisplayName, IndexedTimetable, DAYS, isAcademicCourse, isDoublePeriodStart } from '../utils';
import { runSchedulingEngine, SchedulingEngineInput, SchedulingEngineResult } from '../engine/schedulerEngine';

const MySwal = withReactContent(Swal);

const getScheduleDocId = (teacherId: string, academicYear: string, semester: string) => {
    return `${teacherId}__${academicYear || 'unknown'}__${semester || '1'}`;
};

const getRequiredWeeklyPeriods = (course: Pick<Course, 'credits' | 'hoursPerWeek'>) => {
    const hours = Number(course.hoursPerWeek || 0);
    if (hours > 0) return Math.round(hours);
    const credits = Number(course.credits || 0);
    return credits > 0 ? Math.round(credits * 2) : 1;
};

interface UseAutoScheduleActionProps {
    schoolId: string | undefined;
    selectedTeacher: string;
    selectedYear: string;
    selectedSemester: string;
    teachers: Teacher[];
    allCourses: Course[];
    schedule: Schedule;
    setSchedule: React.Dispatch<React.SetStateAction<Schedule>>;
    setAvailableCourseInstances: React.Dispatch<React.SetStateAction<CourseInstance[]>>;
    setIsSaving: (isSaving: boolean) => void;
    setIsAutoScheduling: (isAutoScheduling: boolean) => void;
    setSchedulingMetrics: (metrics: SchedulingMetrics | null) => void;
    periodSettings: PeriodSetting[];
    specialPeriods: SpecialPeriod[];
    dynamicUnavailableSlots: string[];
    fetchData: (schoolId: string) => Promise<void>;
    loadTeacherMasterSchedule: () => Promise<void>;
    schoolSettings: SchoolSettings;
    scheduleSectionRef: React.RefObject<HTMLDivElement | null>;
    assignmentConstraints: AssignmentConstraintMap;
}

export const useAutoScheduleAction = ({
    schoolId,
    selectedTeacher,
    selectedYear,
    selectedSemester,
    teachers,
    allCourses,
    schedule,
    setSchedule,
    setAvailableCourseInstances,
    setIsSaving,
    setIsAutoScheduling,
    setSchedulingMetrics,
    periodSettings,
    specialPeriods,
    dynamicUnavailableSlots,
    fetchData,
    loadTeacherMasterSchedule,
    schoolSettings,
    scheduleSectionRef,
    assignmentConstraints
}: UseAutoScheduleActionProps) => {
    const isSchedulingRef = useRef(false);
    const calculateAverageConsecutivePeriods = (
        timetable: Record<string, { teacherId: string; classId: string | string[]; room: string[]; courseId: string; taskId?: number }[]>
    ): number => {
        const teacherStats: Record<string, number[]> = {};

        Object.entries(timetable).forEach(([slot, occupancies]) => {
            const [day] = slot.split('-');
            occupancies.forEach(occ => {
                const key = `${occ.teacherId}_${day}`;
                if (!teacherStats[key]) teacherStats[key] = [];
                teacherStats[key].push(parseInt(slot.split('-')[1]));
            });
        });

        const consecutiveCounts: number[] = [];
        Object.values(teacherStats).forEach(periods => {
            periods.sort((a, b) => a - b);
            let maxConsecutive = 1;
            let currentConsecutive = 1;

            for (let i = 1; i < periods.length; i++) {
                if (periods[i] === periods[i - 1] + 1) {
                    currentConsecutive++;
                    maxConsecutive = Math.max(maxConsecutive, currentConsecutive);
                } else {
                    currentConsecutive = 1;
                }
            }
            consecutiveCounts.push(maxConsecutive);
        });

        return consecutiveCounts.length > 0
            ? consecutiveCounts.reduce((a, b) => a + b, 0) / consecutiveCounts.length
            : 0;
    };

    const calculateAverageGapsPerDay = (
        timetable: Record<string, { teacherId: string; classId: string | string[]; room: string[]; courseId: string; taskId?: number }[]>
    ): number => {
        const teacherDayGaps: Record<string, number> = {};

        const teacherDaySchedules: Record<string, number[]> = {};
        Object.entries(timetable).forEach(([slot, occupancies]) => {
            const [day, period] = slot.split('-');
            occupancies.forEach(occ => {
                const key = `${occ.teacherId}_${day}`;
                if (!teacherDaySchedules[key]) teacherDaySchedules[key] = [];
                teacherDaySchedules[key].push(parseInt(period));
            });
        });

        Object.entries(teacherDaySchedules).forEach(([key, periods]) => {
            periods.sort((a, b) => a - b);
            let gaps = 0;
            for (let i = 0; i < periods.length - 1; i++) {
                const gap = periods[i + 1] - periods[i] - 1;
                if (gap > 0) gaps += gap;
            }
            teacherDayGaps[key] = gaps;
        });

        const gapValues = Object.values(teacherDayGaps);
        return gapValues.length > 0
            ? gapValues.reduce((a, b) => a + b, 0) / gapValues.length
            : 0;
    };

    const calculateBBLCompliance = (
        timetable: Record<string, { teacherId: string; classId: string | string[]; room: string[]; courseId: string; taskId?: number }[]>,
        allCoursesData: Course[]
    ): number => {
        const coreSubjects = [
            'ภาษาไทย',
            'คณิตศาสตร์',
            'วิทยาศาสตร์และเทคโนโลยี',
            'สังคมศึกษา ศาสนา และวัฒนธรรม'
        ];

        let totalCoreSlots = 0;
        let morningCoreSlots = 0;

        Object.entries(timetable).forEach(([slot, occupancies]) => {
            const [, period] = slot.split('-');
            const periodNum = parseInt(period);

            occupancies.forEach(occ => {
                const course = allCoursesData.find(c => c.id === occ.courseId);
                if (course && coreSubjects.includes(course.title)) {
                    totalCoreSlots++;
                    if (periodNum >= 1 && periodNum <= 4) {
                        morningCoreSlots++;
                    }
                }
            });
        });

        return totalCoreSlots > 0 ? (morningCoreSlots / totalCoreSlots) * 100 : 0;
    };

    const handleGenerateSchoolTimetable = async (targetTeacherId?: string) => {
        if (isSchedulingRef.current) {
            MySwal.fire({
                icon: 'info',
                title: 'กำลังจัดตารางอยู่',
                text: 'กรุณารอให้การจัดตารางรอบปัจจุบันเสร็จก่อน',
                timer: 1800,
                showConfirmButton: false
            });
            return;
        }

        if (!schoolId) {
            MySwal.fire({ icon: 'warning', title: 'ข้อมูลไม่ครบถ้วน', text: 'ไม่พบรหัสโรงเรียน ไม่สามารถสร้างตารางสอนได้' });
            return;
        }

        const normalizedTargetTeacherId = typeof targetTeacherId === 'string' ? targetTeacherId : undefined;

        isSchedulingRef.current = true;
        setIsAutoScheduling(true);

        MySwal.fire({
            title: 'กำลังเตรียมข้อมูล...',
            html: `
        <div class="space-y-3">
          <div id="progress-message" class="text-sm text-gray-600 dark:text-gray-300">กำลังโหลดข้อมูลครูและรายวิชา...</div>
          <div class="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2.5 overflow-hidden">
            <div id="progress-bar" class="bg-blue-600 dark:bg-blue-400 h-2.5 rounded-full transition-all duration-300" style="width: 0%"></div>
          </div>
          <div id="progress-text" class="text-xs text-gray-500 dark:text-gray-400">0%</div>
        </div>
      `,
            allowOutsideClick: false,
            showConfirmButton: false,
            didOpen: () => {
                MySwal.showLoading();
            },
        });

        try {
            const startTime = Date.now();
            let placedCount = 0;

            const updateProgress = (percentage: number, message: string) => {
                const progressBar = document.getElementById('progress-bar');
                const progressText = document.getElementById('progress-text');
                const messageEl = document.getElementById('progress-message');

                if (progressBar) progressBar.style.width = `${percentage}%`;
                if (progressText) progressText.textContent = `${percentage}%`;
                if (messageEl) messageEl.textContent = message;
            };

            updateProgress(5, 'กำลังโหลดข้อมูลรายวิชา...');
            const coursesCollectionRef = collection(db, 'school-settings', schoolId, 'courses');
            const coursesSnapshot = await getDocs(coursesCollectionRef);
            const rawCoursesData = coursesSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Course));
            
            const assignmentsCollectionRef = collection(db, 'school-settings', schoolId, 'course_assignments');
            const assignmentsSnapshot = await getDocs(assignmentsCollectionRef);
            const assignmentsData = assignmentsSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as any));
            const targetSem = String(selectedSemester || "1");
            const targetYear = String(selectedYear || "");
            const relevantAssignmentsData = assignmentsData.filter((assignment: any) => {
                const assignmentSem = String(assignment.semester || "");
                const assignmentYear = String(assignment.academicYear || "");
                const yearMatches = !targetYear || !assignmentYear || assignmentYear === targetYear;
                const semesterMatches = assignmentSem === targetSem || assignmentSem.startsWith(targetSem + '/') || targetSem.startsWith(assignmentSem + '/');
                return yearMatches && semesterMatches;
            });
            const assignmentByCourseId = new Map(relevantAssignmentsData.map((assignment: any) => [assignment.courseId, assignment]));

            const allCoursesData = rawCoursesData.map(course => {
                const semesterAssignment = assignmentByCourseId.get(course.id) as any;
                if (semesterAssignment && semesterAssignment.teacherAssignments) {
                    return { ...course, teacherAssignments: semesterAssignment.teacherAssignments };
                }
                return course;
            });

            console.log("Auto-schedule: Total courses in DB:", allCoursesData.length);
            console.log("Auto-schedule: Current Semester:", selectedSemester);
            console.log("Auto-schedule: course assignment docs for selected year/semester:", relevantAssignmentsData.length, "of", assignmentsData.length);

            updateProgress(10, 'กำลังโหลดข้อมูลครู...');
            const teachersCollectionRef = collection(db, 'school-settings', schoolId, 'teachers');
            const teachersSnapshot = await getDocs(teachersCollectionRef);
            const allTeachersData = teachersSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Teacher));

            if (selectedTeacher) {
                const currentTeacherIndex = allTeachersData.findIndex(t => t.id === selectedTeacher);
                if (currentTeacherIndex !== -1) {
                    allTeachersData[currentTeacherIndex] = {
                        ...allTeachersData[currentTeacherIndex],
                        preferences: {
                            ...allTeachersData[currentTeacherIndex].preferences,
                            unavailableSlots: dynamicUnavailableSlots
                        }
                    };
                }
            }

            const teachersMap: Record<string, Teacher> = allTeachersData.reduce((acc, t) => ({ ...acc, [t.id]: t }), {});

            updateProgress(12, 'กำลังโหลดข้อกำหนดรายวิชา...');
            const constraintsDocRef = doc(db, 'school-settings', schoolId, 'configs', 'period_constraints');
            const constraintsSnap = await getDoc(constraintsDocRef);
            const constraintsFromFirestore = constraintsSnap.exists() ? (constraintsSnap.data().mapping || {}) : {};
            const effectiveAssignmentConstraints: AssignmentConstraintMap = {
                ...assignmentConstraints,
                ...constraintsFromFirestore
            };
            console.log("Auto-schedule: loaded course assignment docs:", relevantAssignmentsData.length);
            console.log("Auto-schedule: loaded period constraints:", Object.keys(effectiveAssignmentConstraints).length);

            updateProgress(15, 'กำลังโหลดตารางเดิม...');
            const schedulesCollectionRef = collection(db, 'school-settings', schoolId, 'schedules');
            const existingSchedulesSnapshot = await getDocs(schedulesCollectionRef);
            const existingSchedulesMap: Record<string, Schedule> = {};
            const lockedCoursesMap: Record<string, Schedule> = {};
            const scheduleDocMeta: Record<string, { teacherId: string; classId?: string | string[] }> = {};

            existingSchedulesSnapshot.forEach(doc => {
                const docId = doc.id;
                const data = doc.data();
                const dataYear = String(data.academicYear || "");
                const dataSemester = String(data.semester || "");
                const targetSem = String(selectedSemester || "1");
                const targetYear = String(selectedYear || "");
                const yearMatches = !targetYear || !dataYear || dataYear === targetYear;
                const semesterMatches = !dataSemester || dataSemester === targetSem || dataSemester.startsWith(targetSem + '/') || targetSem.startsWith(dataSemester + '/');
                if (!yearMatches || !semesterMatches) return;
                const scheduleData = data.schedule as Schedule;
                existingSchedulesMap[docId] = scheduleData;
                scheduleDocMeta[docId] = {
                    teacherId: data.teacherId || docId.split('__')[0],
                    classId: data.classId
                };

                const lockedSchedule: Schedule = {};
                for (const slotId in scheduleData) {
                    const slotCourses = scheduleData[slotId];
                    const coursesArr = Array.isArray(slotCourses) ? slotCourses : (slotCourses ? [slotCourses] : []);
                    const docTeacherId = scheduleDocMeta[docId]?.teacherId || docId.split('__')[0];

                    const targetSem = String(selectedSemester || "1");

                    const lockedCoursesThisSlot = coursesArr.filter(c => {
                        const semStr = String(c.semester || "");
                        const isCorrectSemester = !c.semester || semStr === targetSem || semStr.startsWith(targetSem + '/') || targetSem.startsWith(semStr + '/');
                        // If it's a DIFFERENT semester, we "lock" it to preserve it, but we won't put it in the Timetable later.
                        if (!isCorrectSemester) return true;

                        const isOtherTeacher = normalizedTargetTeacherId && docTeacherId !== normalizedTargetTeacherId;
                        return isOtherTeacher || c.locked;
                    });

                    if (lockedCoursesThisSlot.length > 0) {
                        lockedSchedule[slotId] = lockedCoursesThisSlot as any;
                    }
                }
                if (Object.keys(lockedSchedule).length > 0) {
                    lockedCoursesMap[docId] = lockedSchedule;
                }
            });

            updateProgress(5, 'กำลังเตรียมโครงสร้างข้อมูล...');
            console.log(`Auto-schedule: found ${allCoursesData.length} total courses from DB`);
            const coursesForSemester = allCoursesData.filter(c => {
                if (c.isActive === false) return false;

                // Flexible semester matching (e.g. "1" matches "1/2568")
                // Semester "0" or undefined/null matches both semesters
                const semStr = String(c.semester || "0");
                const targetSem = String(selectedSemester || "1");
                const isCorrectSemester = semStr === "0" || semStr === targetSem || semStr.startsWith(targetSem + '/') || targetSem.startsWith(semStr + '/');

                if (!isCorrectSemester || !isAcademicCourse(c)) return false;
                if (normalizedTargetTeacherId) {
                    const hasTeacher = c.teacherId === normalizedTargetTeacherId ||
                        c.teacherIds?.includes(normalizedTargetTeacherId) ||
                        c.teacherAssignments?.some((a: any) => a.teacherId === normalizedTargetTeacherId);
                    return hasTeacher;
                }
                return true;
            });

            console.log(`Auto-schedule: found ${coursesForSemester.length} courses for semester ${selectedSemester}${normalizedTargetTeacherId ? ` and teacher ${normalizedTargetTeacherId}` : ''}`);
            const coursesWithAssignmentDocs = coursesForSemester.filter(course => assignmentByCourseId.has(course.id)).length;
            const coursesWithUsableAssignments = coursesForSemester.filter(course =>
                (course.teacherAssignments || []).some((assignment: any) =>
                    assignment.teacherId &&
                    assignment.teacherId !== 'pending' &&
                    !String(assignment.teacherId).startsWith('GHOST') &&
                    (assignment.classLevels || []).filter(Boolean).length > 0
                )
            ).length;
            const dataReadinessWarnings: string[] = [];
            if (coursesForSemester.length > 0 && coursesWithAssignmentDocs === 0) {
                dataReadinessWarnings.push(`ยังไม่มีข้อมูลมอบหมายครู/ชั้นในปี ${selectedYear || '-'} เทอม ${selectedSemester} จากหน้า "มอบหมายครูประจำรายวิชา"`);
            } else if (coursesForSemester.length > 0 && coursesWithUsableAssignments < coursesForSemester.length) {
                dataReadinessWarnings.push(`ปี ${selectedYear || '-'} เทอม ${selectedSemester}: พบรายวิชา ${coursesForSemester.length} วิชา แต่มีข้อมูลมอบหมายที่พร้อมจัดตาราง ${coursesWithUsableAssignments} วิชา`);
            }
            console.log("Auto-schedule: assignment readiness:", {
                coursesForSemester: coursesForSemester.length,
                courseAssignmentDocs: coursesWithAssignmentDocs,
                coursesWithUsableAssignments
            });

            const schoolTimetable: Record<string, { teacherId: string; classId: string[]; room: string[]; courseId: string; course: Course | null; taskId?: number }[]> = {};
            let schoolTimetableRecord: Record<string, any> = {};

            const batchUpdates: Record<string, Schedule> = {};

            // 1. Initialization: Only carry over LOCKED entries as constraints
            for (const docId in lockedCoursesMap) {
                batchUpdates[docId] = {};
                const meta = scheduleDocMeta[docId] || {};
                const teacherId = meta.teacherId || docId.split('__')[0];

                for (const slotId in lockedCoursesMap[docId]) {
                    const slotData = lockedCoursesMap[docId][slotId];
                    const coursesArr = Array.isArray(slotData) ? slotData : (slotData ? [slotData] : []);

                    batchUpdates[docId][slotId] = coursesArr;

                    coursesArr.forEach(lockedCourse => {
                        const targetSem = String(selectedSemester || "1");
                        const semStr = String(lockedCourse.semester || "0");
                        // Semester 0 (All year) is ALWAYS relevant
                        const isCorrectSemester = semStr === "0" || semStr === targetSem || semStr.startsWith(targetSem + '/') || targetSem.startsWith(semStr + '/');

                        if (isCorrectSemester) {
                            if (!schoolTimetable[slotId]) schoolTimetable[slotId] = [];

                            const cleanTeacherId = teacherId || lockedCourse.teacherId || `GHOST_T_${lockedCourse.id}`;
                            const classValue = lockedCourse.classId || meta.classId || `GHOST_C_${lockedCourse.id}`;
                            const cleanClassIds = (Array.isArray(classValue) ? classValue : [classValue]).filter(Boolean) as string[];

                            const existing = schoolTimetable[slotId].find(o => o.teacherId === cleanTeacherId && o.courseId === lockedCourse.id);

                            if (existing) {
                                cleanClassIds.forEach(cleanClassId => {
                                    if (!existing.classId.includes(cleanClassId)) existing.classId.push(cleanClassId);
                                });
                            } else {
                                schoolTimetable[slotId].push({
                                    teacherId: cleanTeacherId,
                                    classId: cleanClassIds,
                                    room: lockedCourse.room || ['all'],
                                    courseId: lockedCourse.id,
                                    course: lockedCourse
                                });
                            }
                        }
                    });
                }
            }

            // 2. Prepare all possible teaching slots (using INDEX to match grid)
            const allTeachingSlots: { dayKey: string; periodSetting: PeriodSetting; slotId: string }[] = [];
            periodSettings.forEach((ps, idx) => {
                if (!ps.isTeachingPeriod) return;
                Object.keys(DAYS).forEach((day: string) => {
                    allTeachingSlots.push({
                        dayKey: day,
                        periodSetting: ps,
                        slotId: `${day}-${idx}`
                    });
                });
            });

            console.log(`Auto-schedule: Prepared ${allTeachingSlots.length} teaching slots using indices`);

            // 3. Ensure all target keys exist in batchUpdates
            coursesForSemester.forEach(c => {
                const assignments = c.teacherAssignments && c.teacherAssignments.length > 0
                    ? c.teacherAssignments
                    : [{ 
                        teacherId: c.teacherId || (c.teacherIds && c.teacherIds[0]) || `GHOST_T_${c.id}`, 
                        classLevels: Array.isArray(c.classId) ? c.classId : (c.classId ? [c.classId] : []) 
                      }];

                assignments.forEach((assign: any) => {
                    const tId = assign.teacherId;
                    if (!tId || (normalizedTargetTeacherId && tId !== normalizedTargetTeacherId)) return;
                    
                    const cLevels = (assign.classLevels || []).filter(Boolean);
                    cLevels.forEach((classId: string) => {
                        const docId = `${tId}_${classId}`;
                        if (!batchUpdates[docId]) batchUpdates[docId] = {};
                    });
                });
            });

            for (const docId in existingSchedulesMap) {
                if (!batchUpdates[docId]) batchUpdates[docId] = {};
            }

            interface SchedulingTask {
                course: Course;
                teacherId: string;
                targetClasses: string[];
                targetRooms: string[];
                instanceCount: number;
                duration: number;
                originalCourseId: string;
                compositeId: string;
                groupNumber: number;
                requiredSlot?: string;
            }

            const tasks: SchedulingTask[] = [];
            const skippedCourseIssues: string[] = [];

            coursesForSemester.forEach(course => {
                let assignments = course.teacherAssignments || [];

                if (assignments.length === 0) {
                    const cIds = (Array.isArray(course.classId) ? course.classId : (course.classId ? [course.classId] : [])).filter(Boolean);
                    const allTIds: string[] = [];
                    if (course.teacherId && course.teacherId !== 'pending' && !course.teacherId.startsWith('GHOST')) allTIds.push(course.teacherId);
                    if (course.teacherIds && Array.isArray(course.teacherIds)) {
                        course.teacherIds.forEach(id => { 
                            if (id && id !== 'pending' && !id.startsWith('GHOST') && !allTIds.includes(id)) allTIds.push(id) 
                        });
                    }

                    if (cIds.length > 0 && allTIds.length > 0) {
                        assignments = allTIds.map(tId => ({
                            teacherId: tId,
                            classLevels: cIds,
                            roomIds: course.room && course.room.length > 0 ? course.room : ['all']
                        }));
                    } else {
                        skippedCourseIssues.push(`${course.code || '-'} ${course.title}: ยังไม่มีครูหรือชั้นเรียนที่ใช้จัดตาราง`);
                        return;
                    }
                }

                const validAssignments = assignments.filter((a: any) => a.teacherId && a.teacherId !== 'pending' && !a.teacherId.startsWith('GHOST'));
                if (validAssignments.length === 0) {
                    skippedCourseIssues.push(`${course.code || '-'} ${course.title}: ยังไม่มีครูผู้สอนที่ถูกต้อง`);
                    return;
                }

                validAssignments.forEach((assign: any) => {
                    const tId = assign.teacherId;
                    if (!tId || (normalizedTargetTeacherId && tId !== normalizedTargetTeacherId)) return;

                    const classIds = (assign.classLevels && assign.classLevels.length > 0)
                        ? assign.classLevels.filter(Boolean)
                        : (Array.isArray(course.classId) ? course.classId : (course.classId ? [course.classId] : [])).filter(Boolean);

                    if (classIds.length === 0) {
                        skippedCourseIssues.push(`${course.code || '-'} ${course.title}: ยังไม่มีระดับชั้น/กลุ่มเรียน`);
                        return;
                    }

                    const rooms = (assign.roomIds && assign.roomIds.length > 0) 
                        ? assign.roomIds 
                        : (course.room && course.room.length > 0 ? course.room : ['all']);

                    const hoursPerWeek = getRequiredWeeklyPeriods(course);

                    const lockedSlotsForThisAssignment = new Set<string>();
                    classIds.forEach((cId: string) => {
                        const docId = `${tId}_${cId}`;
                        const existing = lockedCoursesMap[docId] || {};
                        Object.entries(existing).forEach(([slotId, courses]) => {
                            const coursesArr = Array.isArray(courses) ? courses : [courses];
                            const occ = coursesArr.find((c: any) => (c.id === course.id || c.courseId === course.id) && (Number(c.groupNumber) || 1) === (Number(assign.groupNumber) || 1));
                            if (occ) lockedSlotsForThisAssignment.add(slotId);
                        });
                    });

                    let needed = hoursPerWeek - lockedSlotsForThisAssignment.size;
                    if (needed <= 0) {
                        console.log(`Skipping ${course.title} (Teacher: ${tId}): Already scheduled (${lockedSlotsForThisAssignment.size}/${hoursPerWeek} periods)`);
                    }
                    const asgnCst = effectiveAssignmentConstraints[`${course.id}_${assign.groupNumber || 1}`] || { type: 'any' };
                    const normalizeLockedSlotId = (slot: string | { day: string; periodId: string }) => {
                        if (typeof slot === 'string') return slot;
                        const periodIndex = periodSettings.findIndex(p => p.id === slot.periodId);
                        return periodIndex >= 0 ? `${slot.day}-${periodIndex}` : '';
                    };

                    // --- NEW: Handle Locked Slots from Assignment Constraints ---
                    if (asgnCst.isLocked && asgnCst.lockedSlots && asgnCst.lockedSlots.length > 0) {
                        asgnCst.lockedSlots.forEach((lockedSlot) => {
                            const slotId = normalizeLockedSlotId(lockedSlot);
                            if (!slotId) return;
                            // Check if this slot is already physically placed (in lockedSlotsForThisAssignment)
                            // If NOT placed yet, we create a MANDATORY task for it
                            if (!lockedSlotsForThisAssignment.has(slotId)) {
                                tasks.push({
                                    course,
                                    teacherId: tId,
                                    targetClasses: classIds,
                                    targetRooms: Array.isArray(rooms) ? rooms : [rooms],
                                    instanceCount: 1,
                                    duration: 1,
                                    originalCourseId: course.id,
                                    compositeId: `${course.id}_${assign.groupNumber || 1}`,
                                    groupNumber: assign.groupNumber || 1,
                                    requiredSlot: slotId // This will force placement to this exact slot
                                });
                                // One less period to generate freely
                                needed--;
                            }
                        });
                    }

                    const remainingNeeded = Math.max(0, needed);
                    if (remainingNeeded <= 0) return;
                    
                    if (asgnCst.type === 'double' && remainingNeeded >= 2) {
                        const doubleCount = Math.floor(remainingNeeded / 2);
                        const remainder = remainingNeeded % 2;
                        for (let i = 0; i < doubleCount; i++) {
                            tasks.push({
                                course,
                                teacherId: tId,
                                targetClasses: classIds,
                                targetRooms: Array.isArray(rooms) ? rooms : [rooms],
                                instanceCount: 1,
                                duration: 2,
                                originalCourseId: course.id,
                                compositeId: `${course.id}_${assign.groupNumber || 1}`,
                                groupNumber: assign.groupNumber || 1
                            });
                        }
                        if (remainder > 0) {
                            tasks.push({
                                course,
                                teacherId: tId,
                                targetClasses: classIds,
                                targetRooms: Array.isArray(rooms) ? rooms : [rooms],
                                instanceCount: remainder,
                                duration: 1,
                                originalCourseId: course.id,
                                compositeId: `${course.id}_${assign.groupNumber || 1}`,
                                groupNumber: assign.groupNumber || 1
                            });
                        }
                    } else if (asgnCst.type === 'mixed') {
                        let remainingMixed = remainingNeeded;
                        if (remainingMixed >= 2) {
                            tasks.push({
                                course,
                                teacherId: tId,
                                targetClasses: classIds,
                                targetRooms: Array.isArray(rooms) ? rooms : [rooms],
                                instanceCount: 1,
                                duration: 2,
                                originalCourseId: course.id,
                                compositeId: `${course.id}_${assign.groupNumber || 1}`,
                                groupNumber: assign.groupNumber || 1
                            });
                            remainingMixed -= 2;
                        }

                        for (let i = 0; i < remainingMixed; i++) {
                            tasks.push({
                                course,
                                teacherId: tId,
                                targetClasses: classIds,
                                targetRooms: Array.isArray(rooms) ? rooms : [rooms],
                                instanceCount: 1,
                                duration: 1,
                                originalCourseId: course.id,
                                compositeId: `${course.id}_${assign.groupNumber || 1}`,
                                groupNumber: assign.groupNumber || 1
                            });
                        }
                    } else {
                        for (let i = 0; i < remainingNeeded; i++) {
                            tasks.push({
                                course,
                                teacherId: tId,
                                targetClasses: classIds,
                                targetRooms: Array.isArray(rooms) ? rooms : [rooms],
                                instanceCount: 1,
                                duration: 1,
                                originalCourseId: course.id,
                                compositeId: `${course.id}_${assign.groupNumber || 1}`,
                                groupNumber: assign.groupNumber || 1
                            });
                        }
                    }
                });
            });

            console.log("Auto-schedule: Total tasks generated:", tasks.length);
            const totalPeriodsRequired = tasks.reduce((sum, t) => sum + t.duration, 0);
            if (tasks.length === 0) {
                console.warn("Auto-schedule: No tasks to place! Check if courses have teachers and class levels assigned.");
            }

            console.log(`Auto-schedule: created ${tasks.length} total tasks (${totalPeriodsRequired} periods) to be placed`);

            const teacherLabel = (teacherId: string) => {
                const teacher = teachersMap[teacherId];
                return teacher?.name || `${teacher?.title || ''}${teacher?.firstName || ''} ${teacher?.lastName || ''}`.trim() || teacherId;
            };

            const taskLabel = (task: SchedulingTask) => {
                const classes = task.targetClasses.map(getClassDisplayName).join(', ');
                return `${task.course.code || '-'} ${task.course.title} (${teacherLabel(task.teacherId)} / ${classes || '-'})`;
            };

            const showPrecheckReport = async (fatalIssues: string[], warningIssues: string[]) => {
                const escapeHtml = (value: string) => value
                    .replace(/&/g, '&amp;')
                    .replace(/</g, '&lt;')
                    .replace(/>/g, '&gt;')
                    .replace(/"/g, '&quot;')
                    .replace(/'/g, '&#039;');

                const listHtml = (items: string[], tone: 'red' | 'amber') => items.length > 0
                    ? `
                        <div class="text-left mb-4">
                            <p class="text-xs font-black uppercase tracking-widest ${tone === 'red' ? 'text-red-600' : 'text-amber-600'} mb-2">
                                ${tone === 'red' ? 'ต้องแก้ก่อนจัดตาราง' : 'ควรตรวจสอบ'}
                            </p>
                            <div class="max-h-52 overflow-auto rounded-xl border ${tone === 'red' ? 'border-red-100 bg-red-50' : 'border-amber-100 bg-amber-50'} p-3">
                                <ul class="list-disc pl-5 space-y-1 text-xs ${tone === 'red' ? 'text-red-800' : 'text-amber-800'}">
                                    ${items.slice(0, 20).map(item => `<li>${escapeHtml(item)}</li>`).join('')}
                                    ${items.length > 20 ? `<li>และอีก ${items.length - 20} รายการ...</li>` : ''}
                                </ul>
                            </div>
                        </div>
                    `
                    : '';

                await MySwal.fire({
                    icon: fatalIssues.length > 0 ? 'error' : 'warning',
                    title: fatalIssues.length > 0 ? 'ข้อมูลยังจัดตารางไม่ได้' : 'พบข้อมูลที่ควรตรวจสอบ',
                    html: `
                        <div class="font-sans">
                            <p class="text-sm text-gray-600 mb-4">
                                ระบบตรวจข้อมูลก่อนเริ่มจัดตาราง เพื่อป้องกันการคำนวณนานโดยไม่มีทางสำเร็จ
                            </p>
                            ${listHtml(fatalIssues, 'red')}
                            ${listHtml(warningIssues, 'amber')}
                        </div>
                    `,
                    width: '640px',
                    confirmButtonText: 'รับทราบ',
                    confirmButtonColor: fatalIssues.length > 0 ? '#ef4444' : '#f59e0b'
                });
            };

            const escapePrecheckHtml = (value: string) => value
                .replace(/&/g, '&amp;')
                .replace(/</g, '&lt;')
                .replace(/>/g, '&gt;')
                .replace(/"/g, '&quot;')
                .replace(/'/g, '&#039;');

            if (tasks.length === 0) {
                await showPrecheckReport(
                    ['ไม่พบรายวิชาที่พร้อมจัดตารางในปี/ภาคเรียนนี้'],
                    skippedCourseIssues
                );
                return;
            }


            // 4. Pre-calculate valid slots and detect over-scheduling
            const validSlotsCache = new Map<SchedulingTask, Set<string>>();
            const tasksPerClass: Record<string, number> = {};
            const tasksPerTeacher: Record<string, number> = {};
            const tasksPerRoom: Record<string, number> = {};
            const relaxedConstraintCache = new Map<string, AssignmentConstraintMap>();
            const getConstraintMapForTask = (targetTask: SchedulingTask) => {
                const constraint = effectiveAssignmentConstraints[targetTask.compositeId];
                const shouldRelax = targetTask.requiredSlot || constraint?.isLocked;
                if (!constraint || !shouldRelax) return effectiveAssignmentConstraints;

                const cacheKey = `${targetTask.compositeId}:${targetTask.requiredSlot ? 'required' : 'free'}`;
                if (!relaxedConstraintCache.has(cacheKey)) {
                    relaxedConstraintCache.set(cacheKey, {
                        ...effectiveAssignmentConstraints,
                        [targetTask.compositeId]: {
                            ...constraint,
                            isLocked: false,
                            lockedSlots: [],
                            ...(targetTask.requiredSlot ? {
                                doublePreference: 'any' as const,
                                singlePreference: 'any' as const
                            } : {})
                        }
                    });
                }
                return relaxedConstraintCache.get(cacheKey)!;
            };

            for (const task of tasks) {
                task.targetClasses.forEach(c => {
                    tasksPerClass[c] = (tasksPerClass[c] || 0) + task.duration;
                });
                tasksPerTeacher[task.teacherId] = (tasksPerTeacher[task.teacherId] || 0) + task.duration;
                task.targetRooms
                    .filter(roomId => roomId && roomId.toLowerCase() !== 'all')
                    .forEach(roomId => {
                        tasksPerRoom[roomId] = (tasksPerRoom[roomId] || 0) + task.duration;
                    });

                const validSlots = new Set<string>();
                const teacher = teachersMap[task.teacherId];

                for (const slotInfo of allTeachingSlots) {
                    const { slotId, dayKey, periodSetting } = slotInfo;
                    const { forbidden: hardForbidden } = checkConstraints(
                        { ...task.course, compositeId: task.compositeId, classId: task.targetClasses } as CourseInstance,
                        slotId,
                        teacher,
                        periodSettings,
                        specialPeriods,
                        getConstraintMapForTask(task),
                        dynamicUnavailableSlots,
                        schoolTimetable,
                        task.duration
                    );

                    if (!hardForbidden) {
                        if (task.requiredSlot && slotId !== task.requiredSlot) continue;

                        if (task.duration > 1) {
                            let blockValid = true;
                            const pIdx = periodSettings.indexOf(periodSetting);
                            if (!isDoublePeriodStart(pIdx)) continue;
                            const taskConstraints = getConstraintMapForTask(task)[task.compositeId];
                            
                            for (let d = 1; d < task.duration; d++) {
                                const nextSlotId = `${dayKey}-${pIdx + d}`;
                                const nextPeriod = periodSettings[pIdx + d];
                                const isTeacherUnavailable = teacher?.preferences?.unavailableDays?.includes(dayKey) ||
                                    teacher?.preferences?.unavailableSlots?.includes(nextSlotId) ||
                                    (selectedTeacher === task.teacherId && dynamicUnavailableSlots.includes(nextSlotId));
                                const isDayExcluded = taskConstraints?.excludedDays?.includes(dayKey);
                                if (!nextPeriod?.isTeachingPeriod || isTeacherUnavailable || isDayExcluded) {
                                    blockValid = false;
                                    break;
                                }
                            }
                            if (blockValid) validSlots.add(slotId);
                        } else {
                            validSlots.add(slotId);
                        }
                    }
                }
                validSlotsCache.set(task, validSlots);
            }

            console.log("Auto-schedule: Tasks per class analysis:", tasksPerClass);
            dataReadinessWarnings.forEach(issue => console.warn("Auto-schedule:", issue));
            Object.entries(tasksPerClass).forEach(([cls, count]) => {
                if (count > 40) {
                    console.warn(`Class ${cls} has ${count} periods requested but only ~40 slots available!`);
                }
            });

            const fatalPrecheckIssues: string[] = [];
            const warningPrecheckIssues: string[] = [...dataReadinessWarnings, ...skippedCourseIssues];
            const teachingSlotCapacity = allTeachingSlots.length;

            Object.entries(tasksPerClass).forEach(([classId, count]) => {
                if (count > teachingSlotCapacity) {
                    fatalPrecheckIssues.push(`ชั้น ${getClassDisplayName(classId)} มี ${count} คาบ แต่มีช่องสอนได้สูงสุด ${teachingSlotCapacity} คาบ/สัปดาห์`);
                }
            });

            Object.entries(tasksPerTeacher).forEach(([teacherId, count]) => {
                const teacher = teachersMap[teacherId];
                const availableForTeacher = allTeachingSlots.filter(({ dayKey, slotId }) => {
                    if (teacher?.preferences?.unavailableDays?.includes(dayKey)) return false;
                    if (teacher?.preferences?.unavailableSlots?.includes(slotId)) return false;
                    if (selectedTeacher === teacherId && dynamicUnavailableSlots.includes(slotId)) return false;
                    return true;
                }).length;

                if (count > availableForTeacher) {
                    fatalPrecheckIssues.push(`ครู ${teacherLabel(teacherId)} ถูกมอบหมาย ${count} คาบ แต่มีเวลาว่างสำหรับสอนได้ประมาณ ${availableForTeacher} คาบ`);
                }
            });

            Object.entries(tasksPerRoom).forEach(([roomId, count]) => {
                if (count > teachingSlotCapacity) {
                    fatalPrecheckIssues.push(`ห้อง/สถานที่ ${roomId} ถูกใช้ ${count} คาบ แต่มีช่องใช้งานสูงสุด ${teachingSlotCapacity} คาบ/สัปดาห์`);
                }
            });

            const requiredTeacherSlot = new Map<string, SchedulingTask[]>();
            const requiredClassSlot = new Map<string, SchedulingTask[]>();
            const requiredRoomSlot = new Map<string, SchedulingTask[]>();

            tasks.filter(task => task.requiredSlot).forEach(task => {
                const slotId = task.requiredSlot!;
                const teacherKey = `${task.teacherId}|${slotId}`;
                requiredTeacherSlot.set(teacherKey, [...(requiredTeacherSlot.get(teacherKey) || []), task]);

                task.targetClasses.forEach(classId => {
                    const classKey = `${classId}|${slotId}`;
                    requiredClassSlot.set(classKey, [...(requiredClassSlot.get(classKey) || []), task]);
                });

                task.targetRooms
                    .filter(roomId => roomId && roomId.toLowerCase() !== 'all')
                    .forEach(roomId => {
                        const roomKey = `${roomId}|${slotId}`;
                        requiredRoomSlot.set(roomKey, [...(requiredRoomSlot.get(roomKey) || []), task]);
                    });
            });

            requiredTeacherSlot.forEach((slotTasks, key) => {
                if (slotTasks.length <= 1) return;
                const [teacherId, slotId] = key.split('|');
                fatalPrecheckIssues.push(`ล็อกคาบชนกัน: ครู ${teacherLabel(teacherId)} ถูกล็อก ${slotTasks.length} รายวิชาในคาบ ${slotId}`);
            });

            requiredClassSlot.forEach((slotTasks, key) => {
                if (slotTasks.length <= 1) return;
                const [classId, slotId] = key.split('|');
                fatalPrecheckIssues.push(`ล็อกคาบชนกัน: ชั้น ${getClassDisplayName(classId)} ถูกล็อก ${slotTasks.length} รายวิชาในคาบ ${slotId}`);
            });

            requiredRoomSlot.forEach((slotTasks, key) => {
                if (slotTasks.length <= 1) return;
                const [roomId, slotId] = key.split('|');
                fatalPrecheckIssues.push(`ล็อกคาบชนกัน: ห้อง/สถานที่ ${roomId} ถูกล็อก ${slotTasks.length} รายวิชาในคาบ ${slotId}`);
            });

            tasks.forEach(task => {
                const validSlotCount = validSlotsCache.get(task)?.size || 0;
                if (validSlotCount === 0) {
                    fatalPrecheckIssues.push(`${taskLabel(task)} ไม่มีช่องว่างที่ผ่านเงื่อนไขสำหรับจัดตาราง`);
                } else if (validSlotCount <= 2) {
                    warningPrecheckIssues.push(`${taskLabel(task)} มีช่องที่เป็นไปได้เพียง ${validSlotCount} ช่อง`);
                }
            });

            if (fatalPrecheckIssues.length > 0) {
                await showPrecheckReport(fatalPrecheckIssues, warningPrecheckIssues);
                return;
            }

            if (warningPrecheckIssues.length > 0) {
                const proceed = await MySwal.fire({
                    icon: 'warning',
                    title: 'พบข้อมูลที่ควรตรวจสอบ',
                    html: `
                        <div class="text-left font-sans">
                            <p class="text-sm text-gray-600 mb-3">ระบบยังสามารถลองจัดตารางต่อได้ แต่มีข้อมูลบางส่วนที่อาจทำให้จัดไม่ครบ</p>
                            <div class="max-h-52 overflow-auto rounded-xl border border-amber-100 bg-amber-50 p-3">
                                <ul class="list-disc pl-5 space-y-1 text-xs text-amber-800">
                                    ${warningPrecheckIssues.slice(0, 20).map(item => `<li>${escapePrecheckHtml(item)}</li>`).join('')}
                                    ${warningPrecheckIssues.length > 20 ? `<li>และอีก ${warningPrecheckIssues.length - 20} รายการ...</li>` : ''}
                                </ul>
                            </div>
                        </div>
                    `,
                    showCancelButton: true,
                    confirmButtonText: 'จัดตารางต่อ',
                    cancelButtonText: 'กลับไปแก้ข้อมูล',
                    confirmButtonColor: '#4f46e5',
                    cancelButtonColor: '#64748b',
                    width: '620px'
                });

                if (!proceed.isConfirmed) return;
            }

            // --- IMPROVED SORTING: Most Constrained First ---
            tasks.sort((a, b) => {
                if (a.requiredSlot && !b.requiredSlot) return -1;
                if (!a.requiredSlot && b.requiredSlot) return 1;
                if (a.duration !== b.duration) return b.duration - a.duration;

	                const asgnA = effectiveAssignmentConstraints[a.compositeId];
	                const asgnB = effectiveAssignmentConstraints[b.compositeId];
                const prefA = a.duration >= 2 ? asgnA?.doublePreference : asgnA?.singlePreference;
                const prefB = b.duration >= 2 ? asgnB?.doublePreference : asgnB?.singlePreference;
                const hasPrefA = !!prefA && prefA !== 'any';
                const hasPrefB = !!prefB && prefB !== 'any';
                if (hasPrefA && !hasPrefB) return -1;
                if (!hasPrefA && hasPrefB) return 1;

                return (validSlotsCache.get(a)?.size || 999) - (validSlotsCache.get(b)?.size || 999);
            });

            const validSlotsByTaskIndex = tasks.map(task => Array.from(validSlotsCache.get(task) || []));
            const maxRuns = normalizedTargetTeacherId ? 5 : 15;
            const engineInput: SchedulingEngineInput = {
                tasks,
                initialTimetable: schoolTimetable,
                initialBatchUpdates: batchUpdates,
                allTeachingSlots,
                validSlotsByTaskIndex,
	                assignmentConstraints: effectiveAssignmentConstraints,
                maxRuns,
                maxRepairAttempts: 1000
            };

            const runEngineWithWorker = async (): Promise<SchedulingEngineResult> => {
                if (typeof Worker === 'undefined') {
                    return runSchedulingEngine(engineInput, ({ percentage, message }) => updateProgress(percentage, message));
                }

                return new Promise((resolve) => {
                    const worker = new Worker(new URL('../engine/scheduler.worker.ts', import.meta.url), { type: 'module' });
                    let settled = false;

                    const fallback = () => {
                        if (settled) return;
                        settled = true;
                        worker.terminate();
                        resolve(runSchedulingEngine(engineInput, ({ percentage, message }) => updateProgress(percentage, message)));
                    };

                    worker.onmessage = (event: MessageEvent<any>) => {
                        const { type, payload, error } = event.data || {};
                        if (type === 'progress') {
                            updateProgress(payload.percentage, payload.message);
                            return;
                        }
                        if (type === 'success') {
                            settled = true;
                            worker.terminate();
                            resolve(payload);
                            return;
                        }
                        if (type === 'error') {
                            console.warn('Scheduler worker failed, falling back to main thread:', error);
                            fallback();
                        }
                    };

                    worker.onerror = () => fallback();
                    worker.postMessage({ type: 'run', payload: engineInput });
                });
            };

            const engineResult = await runEngineWithWorker();

            schoolTimetableRecord = engineResult.schoolTimetableRecord as any;
            Object.assign(batchUpdates, engineResult.batchUpdates as any);
            const unplacedTasks = engineResult.unplacedTasks as SchedulingTask[];
            const placedPeriods = engineResult.placedPeriods;

            updateProgress(80, 'กำลังเตรียมบันทึกข้อมูล...');
            updateProgress(85, 'กำลังบันทึกข้อมูล...');

            const teacherIdsByLength = allTeachersData.map(t => t.id).sort((a, b) => b.length - a.length);
            const resolveTeacherId = (scheduleKey: string) => {
                const storedTeacherId = scheduleDocMeta[scheduleKey]?.teacherId;
                if (storedTeacherId) return storedTeacherId;
                return teacherIdsByLength.find(tId => scheduleKey === tId || scheduleKey.startsWith(`${tId}_`)) || scheduleKey.split('_')[0];
            };

            const teacherUpdates: Record<string, Schedule> = {};
            Object.entries(batchUpdates).forEach(([scheduleKey, slotMap]) => {
                const tId = resolveTeacherId(scheduleKey);
                if (normalizedTargetTeacherId && tId !== normalizedTargetTeacherId) return;
                if (!teacherUpdates[tId]) teacherUpdates[tId] = {};

                Object.entries(slotMap).forEach(([slotId, courses]) => {
                    const courseArray = Array.isArray(courses) ? courses : (courses ? [courses] : []);
                    const cleanedCourses = courseArray.map((course: any) => {
                        const { taskId, ...cleanCourse } = course;
                        return cleanCourse;
                    });
                    teacherUpdates[tId][slotId] = [
                        ...(teacherUpdates[tId][slotId] || []),
                        ...cleanedCourses
                    ] as any;
                });
            });

            const teacherIdsToWrite = Object.keys(teacherUpdates);
            const legacyDocsToDelete = existingSchedulesSnapshot.docs.filter(scheduleDoc => {
                const storedTeacherId = scheduleDocMeta[scheduleDoc.id]?.teacherId;
                if (!storedTeacherId || !teacherIdsToWrite.includes(storedTeacherId)) return false;
                const expectedDocId = getScheduleDocId(storedTeacherId, selectedYear, selectedSemester);
                return scheduleDoc.id !== expectedDocId;
            });

            const writes = [
                ...teacherIdsToWrite.map(teacherId => ({
                    type: 'set' as const,
                    id: getScheduleDocId(teacherId, selectedYear, selectedSemester),
                    teacherId
                })),
                ...legacyDocsToDelete.map(scheduleDoc => ({ type: 'delete' as const, id: scheduleDoc.id, teacherId: scheduleDocMeta[scheduleDoc.id]?.teacherId || '' }))
            ];
            const batchSize = 450;
            const numBatches = Math.max(1, Math.ceil(writes.length / batchSize));

            for (let i = 0; i < numBatches && writes.length > 0; i++) {
                const startIdx = i * batchSize;
                const endIdx = Math.min(startIdx + batchSize, writes.length);
                const batchWrites = writes.slice(startIdx, endIdx);

                const batch = writeBatch(db);
                for (const write of batchWrites) {
                    const scheduleRef = doc(db, 'school-settings', schoolId!, 'schedules', write.id);
                    if (write.type === 'delete') {
                        batch.delete(scheduleRef);
                        continue;
                    }

                    const scheduleForTeacher = teacherUpdates[write.teacherId] || {};
                    const teacherClasses = new Set<string>();
                    Object.values(scheduleForTeacher).forEach(courses => {
                        courses.forEach((course: any) => {
                            const classIds = Array.isArray(course.classId) ? course.classId : [course.classId].filter(Boolean);
                            classIds.forEach((classId: string) => teacherClasses.add(classId));
                        });
                    });

                    batch.set(scheduleRef, {
                        schedule: scheduleForTeacher,
                        teacherId: write.teacherId,
                        classId: Array.from(teacherClasses),
                        semester: selectedSemester,
                        academicYear: selectedYear,
                        totalPeriods: Object.values(scheduleForTeacher).reduce((acc, curr) => acc + (Array.isArray(curr) ? curr.length : (curr ? 1 : 0)), 0),
                        updatedAt: new Date(),
                    });
                }

                await batch.commit();
                const batchProgress = 85 + Math.round(((i + 1) / numBatches) * 10);
                updateProgress(batchProgress, `กำลังบันทึกข้อมูล... (${i + 1}/${numBatches} ชุด)`);
            }

            updateProgress(100, 'เสร็จสิ้น!');

            const endTime = Date.now();
            const processingTimeMs = endTime - startTime;
            const successRate = totalPeriodsRequired > 0 ? Math.round((placedPeriods / totalPeriodsRequired) * 100) : 0;

            const metrics: SchedulingMetrics = {
                totalTasks: tasks.length,
                placedTasks: placedPeriods,
                unplacedTasks: unplacedTasks.length,
                processingTimeMs,
                averageConsecutivePeriods: calculateAverageConsecutivePeriods(schoolTimetableRecord),
                averageGapsPerDay: calculateAverageGapsPerDay(schoolTimetableRecord),
                bblComplianceRate: calculateBBLCompliance(schoolTimetableRecord, allCoursesData)
            };

            setSchedulingMetrics(metrics);

            try {
                await setDoc(
                    doc(db, 'school-settings', schoolId, 'metrics', 'latest_scheduling'),
                    {
                        ...metrics,
                        timestamp: new Date(),
                        schoolType: schoolSettings.schoolType,
                        teacherCount: allTeachersData.length
                    }
                );
            } catch (metricsError) {
                console.warn('Failed to save metrics:', metricsError);
            }

            MySwal.fire({
                icon: undefined,
                title: undefined,
                html: `
          <div class="text-center font-sans px-2">
            
            <div class="mb-5">
              <div class="w-20 h-20 bg-emerald-100 text-emerald-500 rounded-full flex items-center justify-center mx-auto mb-4 animate-bounce-slow">
                <svg xmlns="http://www.w3.org/2000/svg" class="h-10 w-10" viewBox="0 0 20 20" fill="currentColor">
                  <path fill-rule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clip-rule="evenodd" />
                </svg>
              </div>
              <h2 class="text-2xl font-extrabold text-gray-900 dark:text-white mb-1">${successRate === 100 ? 'สร้างตารางสอนสำเร็จ!' : 'จัดตารางเสร็จสิ้น (ไม่สมบูรณ์)'}</h2>
              <p class="text-sm text-gray-500 dark:text-gray-400">ระบบได้ทำการประมวลผลและจัดตารางสอนทั้งโรงเรียนเรียบร้อยแล้ว</p>
            </div>

            <!-- Stats Grid -->
            <div class="grid grid-cols-3 gap-3 mb-6">
              <div class="p-3 bg-blue-50 dark:bg-blue-900/20 rounded-xl border border-blue-100 dark:border-blue-800/30">
                <p class="text-[10px] uppercase tracking-wider text-blue-600 dark:text-blue-400 font-bold mb-1">จัดได้แล้ว</p>
                <p class="text-2xl font-black text-blue-700 dark:text-blue-300 pointer-events-none">${placedPeriods}</p>
              </div>
               <div class="p-3 bg-indigo-50 dark:bg-indigo-900/20 rounded-xl border border-indigo-100 dark:border-indigo-800/30">
                <p class="text-[10px] uppercase tracking-wider text-indigo-600 dark:text-indigo-400 font-bold mb-1">จากทั้งหมด</p>
                <p class="text-2xl font-black text-indigo-700 dark:text-indigo-300 pointer-events-none">${totalPeriodsRequired}</p>
              </div>
              <div class="p-3 bg-emerald-50 dark:bg-emerald-900/20 rounded-xl border border-emerald-100 dark:border-emerald-800/30">
                <p class="text-[10px] uppercase tracking-wider text-emerald-600 dark:text-emerald-400 font-bold mb-1">ความสำเร็จ</p>
                <p class="text-2xl font-black text-emerald-700 dark:text-emerald-300 pointer-events-none">${successRate}%</p>
              </div>
            </div>

            <!-- Alerts -->
            ${unplacedTasks.length > 0 ? `
              <div class="bg-amber-50 dark:bg-amber-900/20 p-3 rounded-xl border border-amber-200 dark:border-amber-700/50 flex items-start gap-3 text-left mb-4">
                 <div class="mt-0.5 text-amber-500 shrink-0">⚠️</div>
                 <div>
                    <p class="text-sm font-bold text-amber-800 dark:text-amber-200">ยังเหลืออีก ${unplacedTasks.length} รายวิชา</p>
                    <p class="text-xs text-amber-600 dark:text-amber-400 mt-0.5 leading-relaxed">ระบบไม่เติมลงตารางได้เนื่องจากข้อจำกัดที่ขัดแย้งกัน กรุณาตรวจสอบและจัดวางด้วยตนเอง</p>
                 </div>
              </div>
            ` : ''}

            <!-- Footer Info -->
            <div class="text-[10px] text-gray-400 flex items-center justify-center gap-1">
               <span>💾 บันทึกอัตโนมัติ 100%:</span>
               <span>${teacherIdsToWrite.length} ตารางสอน (${numBatches} batches)</span>
            </div>

          </div>
        `,
                showConfirmButton: true,
                confirmButtonText: 'รับทราบ',
                confirmButtonColor: '#10b981',
                buttonsStyling: true,
                customClass: {
                    popup: 'rounded-3xl shadow-2xl overflow-hidden dark:bg-[#2a2b2f]',
                    confirmButton: 'rounded-xl px-6 py-2.5 font-bold shadow-lg shadow-emerald-500/20 text-sm'
                },
                width: '550px',
                padding: '0'
            }).then(() => {
                setTimeout(() => {
                    if (scheduleSectionRef.current) {
                        const yOffset = -140;
                        const element = scheduleSectionRef.current;
                        const y = element.getBoundingClientRect().top + window.scrollY + yOffset;
                        window.scrollTo({ top: y, behavior: 'smooth' });
                    }
                }, 300);
            });

            if (schoolId) {
                await fetchData(schoolId);
                if (selectedTeacher || normalizedTargetTeacherId) {
                    await loadTeacherMasterSchedule();
                }
            }

        } catch (error) {
            console.error("School-wide auto-scheduling failed: ", error);

            let errorMessage = 'เกิดข้อผิดพลาดระหว่างการสร้างตารางสอนทั้งโรงเรียน';
            let errorDetails = '';

            if (error instanceof Error) {
                errorDetails = error.message;

                if (errorDetails.includes('permission')) {
                    errorMessage = 'ไม่มีสิทธิ์เข้าถึงข้อมูล กรุณาตรวจสอบการเข้าสู่ระบบ';
                } else if (errorDetails.includes('quota')) {
                    errorMessage = 'เกินโควต้าการใช้งาน Firestore กรุณาลองใหม่ภายหลัง';
                } else if (errorDetails.includes('network')) {
                    errorMessage = 'เกิดปัญหาการเชื่อมต่ออินเทอร์เน็ต กรุณาตรวจสอบการเชื่อมต่อ';
                }
            }

            MySwal.fire({
                icon: 'error',
                title: 'เกิดข้อผิดพลาด',
                html: `
          <div class="text-left">
            <p class="font-bold text-lg mb-2 text-red-600">${errorMessage}</p>
            <div class="bg-gray-100 p-3 rounded text-xs overflow-auto max-h-32 text-gray-700 font-mono">
              ${errorDetails || 'Unknown error occurred'}
            </div>
            <p class="text-xs text-gray-500 mt-2">กรุณาลองใหม่อีกครั้ง หรือติดต่อผู้ดูแลระบบ</p>
          </div>
        `
            });
        } finally {
            isSchedulingRef.current = false;
            setIsAutoScheduling(false);
        }
    };

    const handleAutoScheduleForTeacherAndClasses = async () => {
        if (!selectedTeacher) {
            MySwal.fire({ icon: 'warning', title: 'ยังไม่ได้เลือกครู', text: 'กรุณาเลือกครูผู้สอนก่อนจัดตารางอัตโนมัติ' });
            return;
        }
        await handleGenerateSchoolTimetable(selectedTeacher);
    };

    return {
        handleGenerateSchoolTimetable,
        handleAutoScheduleForTeacherAndClasses
    };
};
