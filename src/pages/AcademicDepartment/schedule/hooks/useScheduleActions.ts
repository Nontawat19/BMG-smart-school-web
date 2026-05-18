<<<<<<< HEAD
import Swal from 'sweetalert2';
import withReactContent from 'sweetalert2-react-content';
import { collection, doc, getDocs, writeBatch } from 'firebase/firestore';
import { firestore as db } from '@/firebase';
import { Course, CourseInstance, Schedule, Teacher, PeriodSetting, SpecialPeriod, SchedulingMetrics, SchoolSettings, AssignmentConstraintMap } from '../types';
import { useAutoScheduleAction } from '../actions/useAutoScheduleAction';

const MySwal = withReactContent(Swal);

const getScheduleDocId = (teacherId: string, academicYear: string, semester: string) => {
    return `${teacherId}__${academicYear || 'unknown'}__${semester || '1'}`;
};

interface UseScheduleActionsProps {
    schoolId: string | undefined;
    selectedTeacher: string;
    selectedYear: string;
=======
import { useState } from 'react';
import Swal from 'sweetalert2';
import withReactContent from 'sweetalert2-react-content';
import { collection, doc, getDocs, writeBatch, setDoc, getDoc } from 'firebase/firestore';
import { firestore as db } from '@/firebase';
import { Course, CourseInstance, Schedule, Teacher, PeriodSetting, SpecialPeriod, SchedulingMetrics, SchoolSettings, AssignmentConstraintMap } from '../types';
import { checkConstraints, getClassDisplayName, IndexedTimetable, DAYS, isAcademicCourse } from '../utils';

const MySwal = withReactContent(Swal);

interface UseScheduleActionsProps {
    schoolId: string | undefined;
    selectedTeacher: string;
>>>>>>> 5f8c7e1 (feat: optimize auto-scheduler and update UI labels)
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

export const useScheduleActions = ({
    schoolId,
    selectedTeacher,
<<<<<<< HEAD
    selectedYear,
=======
>>>>>>> 5f8c7e1 (feat: optimize auto-scheduler and update UI labels)
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
}: UseScheduleActionsProps) => {

    const handleSaveSchedule = async () => {
        if (!selectedTeacher || !schoolId) {
            MySwal.fire({ icon: 'warning', title: 'ข้อมูลไม่ครบถ้วน', text: 'กรุณาเลือกครูผู้สอนก่อนบันทึก' });
            return;
        }
        setIsSaving(true);
        try {
            const batch = writeBatch(db);

            // 1. Prepare the consolidated schedule to save
            // We save the entire schedule in one document per teacher to ensure consistency and avoid duplication.
            const scheduleToSave: Record<string, any> = {};
            
            Object.entries(schedule).forEach(([slotId, courses]) => {
                if (courses && courses.length > 0) {
                    scheduleToSave[slotId] = courses.map(course => {
                        const { instanceId, className, locked, ...courseData } = course;
                        return courseData;
                    });
                }
            });

            const teacherClasses = new Set<string>();
            Object.values(schedule).forEach(courses => {
                courses.forEach(c => {
                    const ids = Array.isArray(c.classId) ? c.classId : [c.classId].filter(Boolean) as string[];
                    ids.forEach(id => teacherClasses.add(id));
                });
            });

            // 2. Save to Firestore
<<<<<<< HEAD
            const scheduleDocId = getScheduleDocId(selectedTeacher, selectedYear, selectedSemester);
            const scheduleRef = doc(db, "school-settings", schoolId, "schedules", scheduleDocId);
            batch.set(scheduleRef, {
                teacherId: selectedTeacher,
                academicYear: selectedYear,
=======
            const scheduleRef = doc(db, "school-settings", schoolId, "schedules", selectedTeacher);
            batch.set(scheduleRef, {
                teacherId: selectedTeacher,
>>>>>>> 5f8c7e1 (feat: optimize auto-scheduler and update UI labels)
                semester: selectedSemester,
                schedule: scheduleToSave,
                updatedAt: new Date(),
                classId: Array.from(teacherClasses), 
            });

            const teacherRef = doc(db, 'school-settings', schoolId, 'teachers', selectedTeacher);
            batch.set(teacherRef, {
                preferences: { unavailableSlots: dynamicUnavailableSlots }
            }, { merge: true });

            await batch.commit();

            MySwal.fire({
                toast: true,
                position: 'top-end',
                icon: 'success',
                title: 'บันทึกตารางสอนสำเร็จ!',
                showConfirmButton: false,
                timer: 3000,
                timerProgressBar: true,
            });
            await loadTeacherMasterSchedule();
            await fetchData(schoolId);
        } catch (error) {
            console.error("Error saving schedule: ", error);
            MySwal.fire({ icon: 'error', title: 'เกิดข้อผิดพลาด', text: 'เกิดข้อผิดพลาดในการบันทึกตารางสอน' });
        } finally {
            setIsSaving(false);
        }
    };

    const handleClearSchedule = async () => {
        if (!selectedTeacher || !schoolId) {
            MySwal.fire({ icon: 'warning', title: 'ข้อมูลไม่ครบถ้วน', text: 'กรุณาเลือกครูที่ต้องการล้างตารางสอน' });
            return;
        }

        const result = await MySwal.fire({
            title: 'ยืนยันการล้างตารางสอน',
            text: `คุณแน่ใจหรือไม่ว่าต้องการล้างตารางสอนทั้งหมดของครูท่านนี้?`,
            icon: 'warning',
            showCancelButton: true,
            confirmButtonColor: '#d33',
            cancelButtonColor: '#3085d6',
            confirmButtonText: 'ใช่, ล้างข้อมูล',
            cancelButtonText: 'ยกเลิก'
        });

        if (result.isConfirmed) {
            setSchedule({});
            MySwal.fire(
                'ล้างข้อมูลแล้ว!',
                'ตารางสอนของครูท่านนี้ถูกล้างแล้ว',
                'success'
            );
        }
    };
<<<<<<< HEAD
    const { handleGenerateSchoolTimetable, handleAutoScheduleForTeacherAndClasses } = useAutoScheduleAction({
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
    });
=======

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
        if (!schoolId) {
            MySwal.fire({ icon: 'warning', title: 'ข้อมูลไม่ครบถ้วน', text: 'ไม่พบรหัสโรงเรียน ไม่สามารถสร้างตารางสอนได้' });
            return;
        }

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
            const allCoursesData = coursesSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Course));
            console.log("Auto-schedule: Total courses in DB:", allCoursesData.length);
            console.log("Auto-schedule: Current Semester:", selectedSemester);

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
            const assignmentConstraints = constraintsSnap.exists() ? (constraintsSnap.data().mapping || {}) : {};

            updateProgress(15, 'กำลังโหลดตารางเดิม...');
            const schedulesCollectionRef = collection(db, 'school-settings', schoolId, 'schedules');
            const existingSchedulesSnapshot = await getDocs(schedulesCollectionRef);
            const existingSchedulesMap: Record<string, Schedule> = {};
            const lockedCoursesMap: Record<string, Schedule> = {};

            existingSchedulesSnapshot.forEach(doc => {
                const docId = doc.id;
                const scheduleData = doc.data().schedule as Schedule;
                existingSchedulesMap[docId] = scheduleData;

                const lockedSchedule: Schedule = {};
                for (const slotId in scheduleData) {
                    const slotCourses = scheduleData[slotId];
                    const coursesArr = Array.isArray(slotCourses) ? slotCourses : (slotCourses ? [slotCourses] : []);
                    const [docTeacherId] = docId.split('_');

                    const targetSem = String(selectedSemester || "1");

                    const lockedCoursesThisSlot = coursesArr.filter(c => {
                        const semStr = String(c.semester || "");
                        const isCorrectSemester = !c.semester || semStr === targetSem || semStr.startsWith(targetSem + '/') || targetSem.startsWith(semStr + '/');
                        // If it's a DIFFERENT semester, we "lock" it to preserve it, but we won't put it in the Timetable later.
                        if (!isCorrectSemester) return true;

                        const isOtherTeacher = targetTeacherId && docTeacherId !== targetTeacherId;
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
                if (targetTeacherId) {
                    const hasTeacher = c.teacherId === targetTeacherId ||
                        c.teacherIds?.includes(targetTeacherId) ||
                        c.teacherAssignments?.some(a => a.teacherId === targetTeacherId);
                    return hasTeacher;
                }
                return true;
            });

            console.log(`Auto-schedule: found ${coursesForSemester.length} courses for semester ${selectedSemester}${targetTeacherId ? ` and teacher ${targetTeacherId}` : ''}`);

            const schoolTimetable: Record<string, { teacherId: string; classId: string[]; room: string[]; courseId: string; course: Course | null; taskId?: number }[]> = {};
            let schoolTimetableRecord: Record<string, any> = {};

            const batchUpdates: Record<string, Schedule> = {};

            // 1. Initialization: Only carry over LOCKED entries as constraints
            for (const docId in lockedCoursesMap) {
                batchUpdates[docId] = {};
                const [teacherId, classId] = docId.split('_');

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

                            const cleanTeacherId = teacherId || `GHOST_T_${lockedCourse.id}`;
                            const cleanClassId = classId || `GHOST_C_${lockedCourse.id}`;

                            const existing = schoolTimetable[slotId].find(o => o.teacherId === cleanTeacherId && o.courseId === lockedCourse.id);

                            if (existing) {
                                if (!existing.classId.includes(cleanClassId)) {
                                    existing.classId.push(cleanClassId);
                                }
                            } else {
                                schoolTimetable[slotId].push({
                                    teacherId: cleanTeacherId,
                                    classId: [cleanClassId],
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

                assignments.forEach(assign => {
                    const tId = assign.teacherId;
                    if (!tId || (targetTeacherId && tId !== targetTeacherId)) return;
                    
                    const cLevels = (assign.classLevels || []).filter(Boolean);
                    cLevels.forEach(classId => {
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
                requiredSlot?: string;
            }

            const tasks: SchedulingTask[] = [];

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
                        // If no valid teacher is found, skip this course for auto-scheduling
                        return;
                    }
                }

                // Filter assignments to only include those with valid teachers
                const validAssignments = assignments.filter(a => a.teacherId && a.teacherId !== 'pending' && !a.teacherId.startsWith('GHOST'));
                if (validAssignments.length === 0) return;

                validAssignments.forEach(assign => {
                    const tId = assign.teacherId;
                    if (!tId || (targetTeacherId && tId !== targetTeacherId)) return;

                    const classIds = (assign.classLevels && assign.classLevels.length > 0)
                        ? assign.classLevels.filter(Boolean)
                        : (Array.isArray(course.classId) ? course.classId : (course.classId ? [course.classId] : [])).filter(Boolean);

                    if (classIds.length === 0) return;

                    const rooms = (assign.roomIds && assign.roomIds.length > 0) 
                        ? assign.roomIds 
                        : (course.room && course.room.length > 0 ? course.room : ['all']);

                    const totalCredits = Number(course.credits) || 0;
                    const standardPeriods = Math.round(totalCredits * 2);
                    // Strictly prioritize credits if available, fallback to hoursPerWeek only if credits is 0
                    const hoursPerWeek = standardPeriods > 0 ? standardPeriods : (course.hoursPerWeek || 1);

                    // Calculate already scheduled LOCKED slots
                    const lockedSlotsForThisAssignment = new Set<string>();
                    classIds.forEach(cId => {
                        const docId = `${tId}_${cId}`;
                        const existing = lockedCoursesMap[docId] || {};
                        Object.entries(existing).forEach(([slotId, courses]) => {
                            const coursesArr = Array.isArray(courses) ? courses : [courses];
                            const occ = coursesArr.find((c: any) => c.courseId === course.id && (Number(c.groupNumber) || 1) === (Number(assign.groupNumber) || 1));
                            if (occ) lockedSlotsForThisAssignment.add(slotId);
                        });
                    });

                    let needed = hoursPerWeek - lockedSlotsForThisAssignment.size;
                    const asgnCst = assignmentConstraints[`${course.id}_${assign.groupNumber || 1}`] || { type: 'any' };

                    // --- NEW: Handle Locked Slots from Assignment Constraints ---
                    if (asgnCst.isLocked && asgnCst.lockedSlots && asgnCst.lockedSlots.length > 0) {
                        asgnCst.lockedSlots.forEach((slotId: string) => {
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
                                compositeId: `${course.id}_${assign.groupNumber || 1}`
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
                                compositeId: `${course.id}_${assign.groupNumber || 1}`
                            });
                        }
                    } else if (asgnCst.type === 'mixed' && remainingNeeded >= 3) {
                        tasks.push({
                            course,
                            teacherId: tId,
                            targetClasses: classIds,
                            targetRooms: Array.isArray(rooms) ? rooms : [rooms],
                            instanceCount: 1,
                            duration: 2,
                            originalCourseId: course.id,
                            compositeId: `${course.id}_${assign.groupNumber || 1}`
                        });
                        // Unroll remaining single periods
                        for (let i = 0; i < (remainingNeeded - 2); i++) {
                            tasks.push({
                                course,
                                teacherId: tId,
                                targetClasses: classIds,
                                targetRooms: Array.isArray(rooms) ? rooms : [rooms],
                                instanceCount: 1,
                                duration: 1,
                                originalCourseId: course.id,
                                compositeId: `${course.id}_${assign.groupNumber || 1}`
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
                                compositeId: `${course.id}_${assign.groupNumber || 1}`
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


            // 4. Pre-calculate valid slots and detect over-scheduling
            const validSlotsCache = new Map<SchedulingTask, Set<string>>();
            const tasksPerClass: Record<string, number> = {};

            for (const task of tasks) {
                task.targetClasses.forEach(c => {
                    tasksPerClass[c] = (tasksPerClass[c] || 0) + task.duration;
                });

                const validSlots = new Set<string>();
                const teacher = teachersMap[task.teacherId];
                const asgnCst = assignmentConstraints[task.compositeId];

                for (const slotInfo of allTeachingSlots) {
                    const { slotId, dayKey, periodSetting } = slotInfo;
                    const periodId = periodSetting.id;
                    
                    // Basic constraint check for the start slot
                    const { forbidden: hardForbidden } = checkConstraints(
                        { ...task.course, compositeId: task.compositeId, classId: task.targetClasses } as CourseInstance,
                        slotId,
                        teacher,
                        periodSettings,
                        specialPeriods,
                        assignmentConstraints,
                        dynamicUnavailableSlots,
                        schoolTimetable,
                        task.duration
                    );

                    if (!hardForbidden) {
                        // Check if this specific task has a requiredSlot restriction
                        if (task.requiredSlot && slotId !== task.requiredSlot) continue;

                        // Check assignment-specific locked slots
                        if (asgnCst?.isLocked && asgnCst.lockedSlots && asgnCst.lockedSlots.length > 0) {
                            const isThisSlotLocked = asgnCst.lockedSlots.some((s: any) => {
                                if (typeof s === 'string') return s === slotId;
                                return s.day === dayKey && s.periodId === periodId;
                            });
                            if (!isThisSlotLocked) continue;
                        }

                        // For multi-period tasks, we also need to check the next slots
                        if (task.duration > 1) {
                            let blockValid = true;
                            const pIdx = periodSettings.indexOf(periodSetting);
                            
                            for (let d = 1; d < task.duration; d++) {
                                const nextSlotId = `${dayKey}-${pIdx + d}`;
                                const { forbidden: nextForbidden } = checkConstraints(
                                    { ...task.course, compositeId: task.compositeId, classId: task.targetClasses } as CourseInstance,
                                    nextSlotId,
                                    teacher,
                                    periodSettings,
                                    specialPeriods,
                                    assignmentConstraints,
                                    dynamicUnavailableSlots
                                );
                                if (nextForbidden) {
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
            Object.entries(tasksPerClass).forEach(([cls, count]) => {
                if (count > 40) {
                    console.warn(`Class ${cls} has ${count} periods requested but only ~40 slots available!`);
                }
            });

            // --- IMPROVED SORTING: Most Constrained First ---
            tasks.sort((a, b) => {
                // 1. Required (Locked) slots always go first
                if (a.requiredSlot && !b.requiredSlot) return -1;
                if (!a.requiredSlot && b.requiredSlot) return 1;

                // 2. Longer durations (Double periods) go before shorter ones
                if (a.duration !== b.duration) return b.duration - a.duration;

                // 3. Explicit preferences (Morning/Afternoon) go before no preference
                const asgnA = assignmentConstraints[a.compositeId];
                const asgnB = assignmentConstraints[b.compositeId];
                const hasPrefA = asgnA && (a.duration >= 2 ? asgnA.doublePreference : asgnA.singlePreference) !== 'none';
                const hasPrefB = asgnB && (b.duration >= 2 ? asgnB.doublePreference : asgnB.singlePreference) !== 'none';
                if (hasPrefA && !hasPrefB) return -1;
                if (!hasPrefA && hasPrefB) return 1;

                // 4. Finally, sort by number of available valid slots (Constraint Density)
                return (validSlotsCache.get(a)?.size || 999) - (validSlotsCache.get(b)?.size || 999);
            });
            schoolTimetableRecord = {};
            let tasksProcessed = 0;
            const unplacedTasks: SchedulingTask[] = [];

            updateProgress(35, `กำลังจัดตาราง ${tasks.length} งาน...`);

            const getSubjectCategory = (course: Course): 'ACADEMIC' | 'ACTIVITY' | 'GENERAL' => {
                // If subjectGroup is explicitly defined, try to use it
                if (course.subjectGroup === 'ACADEMIC' || course.subjectGroup === 'ACTIVITY' || course.subjectGroup === 'GENERAL') {
                    return course.subjectGroup as 'ACADEMIC' | 'ACTIVITY' | 'GENERAL';
                }

                // Fallback to keyword matching based on title
                const lowerTitle = course.title.toLowerCase();
                const academicKeywords = ['คณิต', 'วิทย์', 'วิทยาศาสตร์', 'ฟิสิกส์', 'เคมี', 'ชีวะ', 'ชีววิทยา', 'ไทย', 'ภาษาไทย', 'อังกฤษ', 'สังคม', 'ประวัติ', 'ภูมิศาสตร์', 'ศาสนา', 'math', 'science', 'physics', 'chem', 'bio', 'eng'];
                const activityKeywords = ['พละ', 'สุขศึกษา', 'ศิลปะ', 'ดนตรี', 'นาฏศิลป์', 'การงาน', 'อาชีพ', 'แนะแนว', 'ลูกเสือ', 'เนตรนารี', 'ยุวกาชาด', 'ชุมนุม', 'pe', 'art', 'music', 'guidance', 'scout', 'club'];

                if (academicKeywords.some(k => lowerTitle.includes(k))) return 'ACADEMIC';
                if (activityKeywords.some(k => lowerTitle.includes(k))) return 'ACTIVITY';
                return 'GENERAL';
            };

            const getWeightedSlots = (
                task: SchedulingTask,
                slots: typeof allTeachingSlots,
                validSlots: Set<string>,
                ignorePrefs: boolean = false
            ) => {
                const category = getSubjectCategory(task.course);
                const availableSlots = slots.filter(slot => validSlots.has(slot.slotId));

                const periodsPerDay: Record<string, number> = {};
                Object.keys(DAYS).forEach(d => periodsPerDay[d] = 0);

                for (const slotId in schoolTimetable) {
                    const [d] = slotId.split('-');
                    if (schoolTimetable[slotId]?.some(o => o.teacherId === task.teacherId)) {
                        periodsPerDay[d] = (periodsPerDay[d] || 0) + 1;
                    }
                }

                const totalPeriods = Object.values(periodsPerDay).reduce((a, b) => a + b, 0);
                const averageLoad = totalPeriods / 5;

                const scoredSlots = availableSlots.filter(slot => {
                    // PRE-FILTER: Ensure enough consecutive slots for duration
                    if (task.duration <= 1) return true;
                    
                    const { dayKey, periodSetting } = slot;
                    const pNum = parseInt(periodSetting.id.replace('period-', ''));
                    const nextSlotId = `${dayKey}-${pNum + 1}`;
                    
                    // Check if next slot exists in teaching slots and is valid for this task
                    const nextSlotInfo = allTeachingSlots.find(s => s.slotId === nextSlotId);
                    if (!nextSlotInfo) return false;
                    
                    const isValidCached = validSlotsCache.get(task)?.has(nextSlotId);
                    return isValidCached;
                }).map(slot => {
                    let score = 50;
                    const { dayKey, periodSetting, slotId } = slot;
                    const periodNumber = parseInt(periodSetting.id.replace('period-', '')) || 0;
                    const isMorning = periodNumber <= 4;
                    const asgnCst = assignmentConstraints[task.compositeId];

                    if (!ignorePrefs) {
                        // --- ENHANCED PREFERENCE SCORING ---
                        if (asgnCst) {
                            const pref = task.duration >= 2 ? asgnCst.doublePreference : asgnCst.singlePreference;
                            if (pref === 'morning' && isMorning) score += 150;
                            if (pref === 'afternoon' && !isMorning) score += 150;
                            if (pref === 'morning' && !isMorning) score -= 100;
                            if (pref === 'afternoon' && isMorning) score -= 100;
                        } else {
                            if (category === 'ACADEMIC') {
                                if (isMorning) score += 40;
                                else score -= 30;
                            } else if (category === 'ACTIVITY') {
                                if (!isMorning) score += 40;
                                else score -= 20;
                            }
                        }
                    }

                    const currentLoad = periodsPerDay[dayKey] || 0;
                    if (currentLoad > averageLoad + 1) {
                        score -= 20;
                    } else if (currentLoad < averageLoad) {
                        score += 10;
                    }

                    // For multi-period tasks, we check load and adjacency for the block
                    let hasAdjacent = false;
                    let createsGap = false;
                    let consecutiveCount = task.duration;

                    for (let i = periodNumber - 1; i >= 1; i--) {
                        const checkSlot = `${dayKey}-${i}`;
                        const isOccupied = schoolTimetable[checkSlot]?.some(o => o.teacherId === task.teacherId);
                        if (isOccupied) {
                            if (i === periodNumber - 1) hasAdjacent = true;
                            consecutiveCount++;
                        } else {
                            if (periodNumber - i > 1) createsGap = true;
                            break;
                        }
                    }

                    const endPeriod = periodNumber + task.duration - 1;
                    for (let i = endPeriod + 1; i <= 8; i++) {
                        const checkSlot = `${dayKey}-${i}`;
                        const isOccupied = schoolTimetable[checkSlot]?.some(o => o.teacherId === task.teacherId);
                        if (isOccupied) {
                            if (i === endPeriod + 1) hasAdjacent = true;
                            consecutiveCount++;
                        } else {
                            if (i - endPeriod > 1) createsGap = true;
                            break;
                        }
                    }

                    if (hasAdjacent) {
                        if (asgnCst?.layoutPreference !== 'single_only') score += 25;
                        else score -= 40;
                    } else {
                        if (asgnCst?.layoutPreference === 'single_only') score += 20;
                    }

                    if (createsGap) score -= 15;
                    if (consecutiveCount > 4) score -= 1000;

                    let subjectInDayCount = 0;
                    let teamTeachScoreBonus = 0;
                    for (let i = 1; i <= 8; i++) {
                        const checkSlotId = `${dayKey}-${i}`;
                        const occupancies = schoolTimetable[checkSlotId] || [];
                        occupancies.forEach(o => {
                            if (o.courseId !== task.course.id) return;
                            const occClasses = Array.isArray(o.classId) ? o.classId : [o.classId];
                            if (task.targetClasses.some(cId => occClasses.includes(cId))) {
                                // If it's exactly the starting slot of a multi-period session, don't count it as "subject in day" penalty
                                // if we are just checking co-teacher alignment
                                if (checkSlotId === slotId) {
                                    teamTeachScoreBonus += 5000; 
                                } else {
                                    subjectInDayCount++;
                                }
                            }
                        });
                    }
                    if (subjectInDayCount > 0) score -= 70;
                    score += teamTeachScoreBonus;

                    score += Math.random() * 20;

                    return { slot, score };
                });

                scoredSlots.sort((a, b) => b.score - a.score);

                return scoredSlots.map(s => (s.slot as any).slotId as string);
            };

            let placedPeriods = 0;

            const tryPlaceTask = (task: SchedulingTask, ignorePrefs: boolean) => {
                // ... (rest of the function stays same)
                let potentialSlots = [];

                if (!ignorePrefs) {
                    const cached = validSlotsCache.get(task);
                    potentialSlots = getWeightedSlots(task, allTeachingSlots, cached || new Set(), false);
                    
                    // If task has a requiredSlot, strictly filter to ONLY that slot
                    if (task.requiredSlot) {
                        potentialSlots = potentialSlots.filter(sId => sId === task.requiredSlot);
                    }
                } else {
                    const validHardSlots = new Set<string>();
                    allTeachingSlots.forEach(slotInfo => {
                        const { dayKey, periodSetting, slotId } = slotInfo;

                        if (task.requiredSlot && slotId !== task.requiredSlot) return;
                        if (task.course.constraints?.disallowedDays?.includes(dayKey)) return;
                        if (task.course.title.includes('พละ') && dayKey === 'wed') return;
                        const specialPeriod = specialPeriods.find(sp =>
                            sp.startTime === periodSetting.startTime &&
                            sp.endTime === periodSetting.endTime &&
                            (!sp.day || sp.day === 'all' || sp.day === dayKey)
                        );
                        if (specialPeriod) return;

                        validHardSlots.add(slotId);
                    });

                    potentialSlots = getWeightedSlots(task, allTeachingSlots, validHardSlots, true);
                }

                for (const startSlotId of potentialSlots) {
                    const [dayKey, pStr] = startSlotId.split('-');
                    const startPeriodNumber = parseInt(pStr);
                    
                    const sessionSlots: string[] = [];
                    for (let d = 0; d < task.duration; d++) {
                        sessionSlots.push(`${dayKey}-${startPeriodNumber + d}`);
                    }

                    // 1. Validate the entire block
                    let blockConflict = false;
                    for (const slotId of sessionSlots) {
                        const occupancies = schoolTimetable[slotId] || [];

                        // Teacher Conflict
                        if (occupancies.some(o => o.teacherId === task.teacherId)) {
                            blockConflict = true;
                            failureReasons['teacher_conflict'] = (failureReasons['teacher_conflict'] || 0) + 1;
                            break;
                        }

                        // Class Conflict
                        let classBusy = false;
                        for (const targetClass of task.targetClasses) {
                            if (occupancies.some(o => {
                                const occClasses = Array.isArray(o.classId) ? o.classId : [o.classId];
                                if (o.courseId === task.course.id) return false;
                                return occClasses.includes(targetClass);
                            })) {
                                classBusy = true;
                                break;
                            }
                        }
                        if (classBusy) {
                            blockConflict = true;
                            failureReasons['class_conflict'] = (failureReasons['class_conflict'] || 0) + 1;
                            break;
                        }

                        // Room Conflict
                        const requestedRooms = task.targetRooms.filter(r => r && r.toLowerCase() !== 'all');
                        if (requestedRooms.length > 0) {
                            if (occupancies.some(occ => {
                                const occRooms = (occ.room || []).filter(r => r && r.toLowerCase() !== 'all');
                                return requestedRooms.some(r => occRooms.includes(r));
                            })) {
                                blockConflict = true;
                                failureReasons['room_conflict'] = (failureReasons['room_conflict'] || 0) + 1;
                                break;
                            }
                        }
                    }

                    if (blockConflict) continue;

                    // 2. All slots in block are valid, Place them!
                    sessionSlots.forEach(slotId => {
                        const occupancy = {
                            teacherId: task.teacherId,
                            classId: task.targetClasses,
                            room: task.targetRooms,
                            courseId: task.course.id,
                            course: task.course,
                            taskId: tasks.indexOf(task)
                        };

                        if (!schoolTimetable[slotId]) schoolTimetable[slotId] = [];
                        schoolTimetable[slotId].push(occupancy);

                        if (!schoolTimetableRecord[slotId]) schoolTimetableRecord[slotId] = [];
                        schoolTimetableRecord[slotId].push(occupancy);

                        task.targetClasses.forEach(cId => {
                            const docId = `${task.teacherId}_${cId}`;
                            if (!batchUpdates[docId]) batchUpdates[docId] = {};

                            const newInstance = {
                                ...task.course,
                                instanceId: `${task.course.id}-${slotId}-${cId}`,
                            };

                            const existing = batchUpdates[docId][slotId];
                            const items = Array.isArray(existing) ? existing : (existing ? [existing] : []);
                            batchUpdates[docId][slotId] = [...items, newInstance] as any;
                        });
                    });

                    return true;
                }
                return false;
            };

            const failureReasons: Record<string, number> = {};

            for (const task of tasks) {
                if (tryPlaceTask(task, false)) {
                    placedPeriods += task.duration;
                } else {
                    unplacedTasks.push(task);
                }

                tasksProcessed++;
                if (tasksProcessed % 50 === 0) updateProgress(35 + (tasksProcessed / tasks.length) * 10, `กำลังจัดตาราง... (${tasksProcessed}/${tasks.length} งาน)`);
            }

            console.log(`Auto-schedule: Initial phase complete. Placed: ${placedPeriods} periods, Unplaced tasks: ${unplacedTasks.length}`);
            if (unplacedTasks.length > 0) {
                console.log("Auto-schedule: Unplaced tasks details:");
                unplacedTasks.forEach(t => {
                    const asgnCst = assignmentConstraints[t.compositeId];
                    const lockedInfo = asgnCst?.isLocked ? `Locked to: ${JSON.stringify(asgnCst.lockedSlots)}` : 'No locks';
                    console.log(`- Task: ${t.course.title} (Grp ${t.course.groupNumber || 1}), Duration: ${t.duration}, ${lockedInfo}`);
                });
                console.log("Auto-schedule failures summary: ", failureReasons);
            }

            if (unplacedTasks.length > 0) {
                updateProgress(45, `กำลังพยายามจัด ${unplacedTasks.length} งานที่เหลือ...`);
                const retryList = [...unplacedTasks];
                unplacedTasks.length = 0;

                for (const task of retryList) {
                    if (tryPlaceTask(task, true)) {
                        placedPeriods += task.duration;
                    } else {
                        unplacedTasks.push(task);
                    }
                }
            }

            if (unplacedTasks.length > 0) {
                updateProgress(60, `พยายามแก้ไขจุดชนกันของงานที่เหลือ...`);
                const repairList = [...unplacedTasks];
                unplacedTasks.length = 0;

                let safetyCounter = 0;
                const MAX_REPAIR_ATTEMPTS = 500; // Safety limit

                for (const task of repairList) {
                    safetyCounter++;
                    if (safetyCounter > MAX_REPAIR_ATTEMPTS) {
                        console.warn("Auto-schedule: Reached max repair attempts, skipping remaining tasks for safety.");
                        unplacedTasks.push(task);
                        continue;
                    }

                    let repaired = false;
                    const validHardSlots = new Set<string>();
                    allTeachingSlots.forEach(s => validHardSlots.add(s.slotId));

                    const potentialSlots = getWeightedSlots(task, allTeachingSlots, validHardSlots, true);

                    for (const slotId of potentialSlots.slice(0, 15)) {
                        const currentOccupancies = schoolTimetable[slotId] || [];


                        const blockers = currentOccupancies.filter((occ: any) => {
                            const occClasses = Array.isArray(occ.classId) ? occ.classId : [occ.classId];
                            const sameClass = task.targetClasses.some((cId: string) => occClasses.includes(cId));
                            const sameTeacher = occ.teacherId === task.teacherId;

                            // ถือเป็น blocker ถ้ายึด class เดียวกัน หรือ ถ้ายึดเวลาของครูคนเดียวกันไปแล้ว
                            return sameClass || sameTeacher;
                        });


                        if (blockers.length === 1) {
                            const blockerOcc = blockers[0];
                            const blockerTask = tasks[blockerOcc.taskId as number];

                            if (blockerTask && !blockerTask.course.constraints?.lockedSlots?.length) {
                                const blockerValidSlots = validSlotsCache.get(blockerTask) || new Set<string>();

                                const blockerMoveCandidates = getWeightedSlots(blockerTask, allTeachingSlots, blockerValidSlots, true)
                                    .filter((sId: string) => sId !== slotId);

                                for (const moveSlotId of blockerMoveCandidates.slice(0, 5)) {
                                    const moveSlotOccs = schoolTimetable[moveSlotId] || [];
                                    const isMoveSlotFree = !moveSlotOccs.some((o: any) => {
                                        const sameTeacherConflict = o.teacherId === blockerTask.teacherId;

                                        const occClasses = Array.isArray(o.classId) ? o.classId : [o.classId];
                                        const sameClass = blockerTask.targetClasses.some((c: string) => occClasses.includes(c));

                                        const occRooms = (o.room || []).filter((r: string) => r && r.toLowerCase() !== 'all');
                                        const blockerRooms = blockerTask.targetRooms.filter(r => r && r.toLowerCase() !== 'all');
                                        const sameRoom = blockerRooms.length > 0 && occRooms.some((r: string) => blockerRooms.includes(r));

                                        return sameTeacherConflict || sameClass || sameRoom;
                                    });
                                    if (isMoveSlotFree) {
                                        schoolTimetable[slotId] = schoolTimetable[slotId].filter(o => o !== blockerOcc);

                                        blockerTask.targetClasses.forEach((cId: string) => {
                                            const bDocId = `${blockerTask.teacherId}_${cId}`;
                                            if (batchUpdates[bDocId] && batchUpdates[bDocId][slotId]) {
                                                const items = Array.isArray(batchUpdates[bDocId][slotId])
                                                    ? batchUpdates[bDocId][slotId] as any[]
                                                    : [batchUpdates[bDocId][slotId]];
                                                const filtered = items.filter((it: any) => it.id !== blockerTask.course.id);
                                                if (filtered.length === 0) delete batchUpdates[bDocId][slotId];
                                                else batchUpdates[bDocId][slotId] = filtered as any;
                                            }
                                        });

                                        const newBlockerOcc = { ...blockerOcc };
                                        if (!schoolTimetable[moveSlotId]) schoolTimetable[moveSlotId] = [];
                                        schoolTimetable[moveSlotId].push(newBlockerOcc);
                                        blockerTask.targetClasses.forEach((cId: string) => {
                                            const bDocId = `${blockerTask.teacherId}_${cId}`;
                                            if (!batchUpdates[bDocId]) batchUpdates[bDocId] = {};
                                            const moveInstanceCode = `${blockerTask.course.id}-${moveSlotId}-${cId}`;
                                            const moveInstance = { ...blockerTask.course, instanceId: moveInstanceCode };
                                            batchUpdates[bDocId][moveSlotId] = [
                                                ...(Array.isArray(batchUpdates[bDocId][moveSlotId])
                                                    ? batchUpdates[bDocId][moveSlotId] as any[]
                                                    : (batchUpdates[bDocId][moveSlotId] ? [batchUpdates[bDocId][moveSlotId]] : [])),
                                                moveInstance
                                            ] as any;
                                        });

                                        if (tryPlaceTask(task, true)) {
                                            placedPeriods += task.duration;
                                            repaired = true;
                                            break;
                                        }
                                    }
                                }
                            }
                        }
                        if (repaired) break;
                    }

                    if (!repaired) {
                        // FINAL ATTEMPT: Relax subject-per-day constraints and try again
                        const validHardSlots = new Set<string>();
                        allTeachingSlots.forEach(s => validHardSlots.add(s.slotId));
                        
                        // Use a version of weighted slots that ignores the "subject already in day" penalty
                        const relaxedSlots = getWeightedSlots(task, allTeachingSlots, validHardSlots, true);
                        
                        for (const startSlotId of relaxedSlots) {
                            const [dayKey, pStr] = startSlotId.split('-');
                            const startPeriodNumber = parseInt(pStr);
                            const sessionSlots: string[] = [];
                            for (let d = 0; d < task.duration; d++) {
                                sessionSlots.push(`${dayKey}-${startPeriodNumber + d}`);
                            }

                            let canPlace = true;
                            for (const slotId of sessionSlots) {
                                const occupancies = schoolTimetable[slotId] || [];
                                // ONLY absolute hard constraints: Teacher/Class/Room/SpecialPeriod
                                if (occupancies.some(o => o.teacherId === task.teacherId)) { canPlace = false; break; }
                                let classBusy = false;
                                for (const targetClass of task.targetClasses) {
                                    if (occupancies.some(o => {
                                        const occClasses = Array.isArray(o.classId) ? o.classId : [o.classId];
                                        return occClasses.includes(targetClass);
                                    })) { classBusy = true; break; }
                                }
                                if (classBusy) { canPlace = false; break; }
                            }

                            if (canPlace) {
                                // Place it!
                                sessionSlots.forEach(slotId => {
                                    const occupancy = {
                                        teacherId: task.teacherId,
                                        classId: task.targetClasses,
                                        room: task.targetRooms,
                                        courseId: task.course.id,
                                        course: task.course,
                                        taskId: tasks.indexOf(task)
                                    };
                                    if (!schoolTimetable[slotId]) schoolTimetable[slotId] = [];
                                    schoolTimetable[slotId].push(occupancy);
                                    
                                    task.targetClasses.forEach(cId => {
                                        const docId = `${task.teacherId}_${cId}`;
                                        if (!batchUpdates[docId]) batchUpdates[docId] = {};
                                        batchUpdates[docId][slotId] = [...(Array.isArray(batchUpdates[docId][slotId]) ? batchUpdates[docId][slotId] as any[] : []), { ...task.course, instanceId: `${task.course.id}-${slotId}-${cId}` }] as any;
                                    });
                                });
                                placedPeriods += task.duration;
                                repaired = true;
                                break;
                            }
                        }
                    }

                    if (!repaired) {
                        unplacedTasks.push(task);
                    }
                }
            }

            updateProgress(80, 'กำลังเตรียมบันทึกข้อมูล...');
            updateProgress(85, 'กำลังบันทึกข้อมูล...');

            const docIds = Object.keys(batchUpdates).filter(id => {
                if (!targetTeacherId) return true;
                return id.startsWith(`${targetTeacherId}_`);
            });
            const batchSize = 500;
            const numBatches = Math.ceil(docIds.length / batchSize);

            for (let i = 0; i < numBatches; i++) {
                const startIdx = i * batchSize;
                const endIdx = Math.min(startIdx + batchSize, docIds.length);
                const batchDocIds = docIds.slice(startIdx, endIdx);

                const batch = writeBatch(db);
                for (const docId of batchDocIds) {
                    const [tId, cId] = docId.split('_');
                    batch.set(doc(db, 'school-settings', schoolId!, 'schedules', docId), {
                        schedule: batchUpdates[docId],
                        teacherId: tId,
                        classId: cId,
                        totalPeriods: Object.values(batchUpdates[docId]).reduce((acc, curr) => acc + (Array.isArray(curr) ? curr.length : (curr ? 1 : 0)), 0),
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
               <span>${docIds.length} ตารางสอน (${numBatches} batches)</span>
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
                if (selectedTeacher || targetTeacherId) {
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
>>>>>>> 5f8c7e1 (feat: optimize auto-scheduler and update UI labels)

    const handleClearAllTeachersSchedules = async () => {
        if (!schoolId) return;

        const result = await MySwal.fire({
            title: 'ล้างตารางสอนทั้งโรงเรียน?',
            text: "คุณแน่ใจหรือไม่ที่จะล้างข้อมูลตารางสอนทั้งหมด? การกระทำนี้ไม่สามารถย้อนกลับได้",
            icon: 'warning',
            showCancelButton: true,
            confirmButtonColor: '#d33',
            confirmButtonText: 'ล้างข้อมูลทั้งหมด',
            cancelButtonText: 'ยกเลิก'
        });

        if (result.isConfirmed) {
            setIsSaving(true);
            try {
                const schedulesRef = collection(db, 'school-settings', schoolId, 'schedules');
                const snapshot = await getDocs(schedulesRef);
                const batch = writeBatch(db);

<<<<<<< HEAD
                snapshot.docs.forEach(scheduleDoc => {
                    const data = scheduleDoc.data();
                    const dataYear = String(data.academicYear || "");
                    const dataSemester = String(data.semester || "");
                    const yearMatches = !selectedYear || !dataYear || dataYear === selectedYear;
                    const semesterMatches = !dataSemester || dataSemester === selectedSemester || dataSemester.startsWith(selectedSemester + '/') || selectedSemester.startsWith(dataSemester + '/');
                    if (yearMatches && semesterMatches) {
                        batch.delete(scheduleDoc.ref);
                    }
=======
                snapshot.docs.forEach(doc => {
                    batch.delete(doc.ref);
>>>>>>> 5f8c7e1 (feat: optimize auto-scheduler and update UI labels)
                });

                await batch.commit();

                MySwal.fire('สำเร็จ', 'ล้างข้อมูลเรียบร้อยแล้ว', 'success');
                setSchedule({});
                await fetchData(schoolId);

            } catch (error) {
                console.error(error);
                MySwal.fire('Error', 'Failed to clear schedules', 'error');
            } finally {
                setIsSaving(false);
            }
        }
    };

    return {
        handleSaveSchedule,
        handleClearSchedule,
        handleGenerateSchoolTimetable,
        handleAutoScheduleForTeacherAndClasses,
        handleClearAllTeachersSchedules
    };
};
