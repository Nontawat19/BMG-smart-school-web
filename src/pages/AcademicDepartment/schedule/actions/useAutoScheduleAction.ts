import Swal from 'sweetalert2';
import withReactContent from 'sweetalert2-react-content';
import { useEffect, useRef } from 'react';
import { collection, doc, getDoc, getDocs, setDoc } from 'firebase/firestore';
import { firestore as db } from '@/firebase';
import { Course, CourseInstance, Schedule, Teacher, PeriodSetting, SpecialPeriod, SchedulingMetrics, SchoolSettings, AssignmentConstraintMap, getAssignmentTeacherIds } from '../types';
import { runSchedulingEngine, EngineTask, SchedulingEngineInput, SchedulingEngineResult, EngineBatchUpdates, EngineSchedule } from '../engine/schedulerEngine';
import type { WorkerResponse } from '../engine/scheduler.worker';
import { calculateAverageConsecutivePeriods, calculateAverageGapsPerDay, calculateBBLCompliance } from '../scheduleMetrics';
import { showPrecheckReport, showAutoScheduleResultModal } from './autoSchedule/scheduleUiHelpers';
import { openSchedulingProgressDialog, updateSchedulingProgress } from './autoSchedule/useSchedulingProgress';
import { createSlotConstraintHelpers } from './autoSchedule/buildSlotConstraintHelpers';
import { runSchedulePrecheck } from './autoSchedule/precheck';
import { calculatePlacementRates, validatePostSchedule } from './autoSchedule/postScheduleValidator';
import { processTemporaryPlacements } from './autoSchedule/temporaryPlacer';
import { writeSchedulesToFirestore } from './autoSchedule/firestoreWriter';
import { acquireSchedulingRunLock, forceReleaseSchedulingRunLock, getActiveSchedulingLock, releaseSchedulingRunLock } from '../scheduleRunLock';
import { getAssignmentCompositeId, getScheduleDocId, getTaskTeacherIds, normalizeGroupNumber, resolveScheduleTeacherId } from '../scheduleSharedUtils';
import { buildPreferredSessionDurations, checkConstraints, DAYS, getMatchingSpecialPeriod, getPartnerIndexForPeriods, getRequiredWeeklyPeriods, isAcademicCourse, isDoubleCapableConstraint, isProtectedSpecialPeriodSetting } from '../utils';
import { isActiveTeacher } from '@/utils/teacherSortUtils';
import type { CourseAssignmentDocData } from './autoSchedule/loadSchedulingData';

const MySwal = withReactContent(Swal);

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
    const activeWorkerRef = useRef<Worker | null>(null);
    const cancelRequestedRef = useRef(false);
    const activeCancelRef = useRef<(() => void) | null>(null);
    const activeRunIdRef = useRef<string | null>(null);

    useEffect(() => {
        if (!schoolId) return;
        const handleUnload = () => {
            const runId = activeRunIdRef.current;
            if (!runId) return;
            // Best-effort synchronous release via beacon; Firestore SDK is async so we
            // fall back to a simple flag-clear and let the 15-min timeout clean up.
            releaseSchedulingRunLock(schoolId, runId).catch(() => undefined);
        };
        window.addEventListener('beforeunload', handleUnload);
        return () => window.removeEventListener('beforeunload', handleUnload);
    }, [schoolId]);

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
        const runId = `${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
        const currentUserId = (typeof window !== 'undefined' ? localStorage.getItem('uid') : '') || selectedTeacher || 'unknown';

        isSchedulingRef.current = true;
        setIsAutoScheduling(true);
        cancelRequestedRef.current = false;

        openSchedulingProgressDialog({ cancelRequestedRef, activeWorkerRef, activeCancelRef });

        try {
            const activeLock = await getActiveSchedulingLock(schoolId);
            if (activeLock && activeLock.runId !== runId) {
                MySwal.close();
                const stuckMinutes = Math.floor((Date.now() - activeLock.startedAtMs) / 60000);
                const result = await MySwal.fire({
                    icon: 'warning',
                    title: 'มีการจัดตารางอยู่แล้ว',
                    html: `<p>พบสถานะจัดตารางค้างอยู่ (${stuckMinutes} นาทีที่แล้ว)</p><p class="text-sm text-gray-500 mt-1">อาจเกิดจากการปิด browser กลางคัน</p>`,
                    showCancelButton: true,
                    confirmButtonText: 'ล้างสถานะแล้วจัดใหม่',
                    cancelButtonText: 'ตกลง',
                    confirmButtonColor: '#ef4444',
                });
                if (!result.isConfirmed) return;
                await forceReleaseSchedulingRunLock(schoolId);
            }

            await acquireSchedulingRunLock(schoolId, runId, currentUserId, normalizedTargetTeacherId);
            activeRunIdRef.current = runId;

            const startTime = Date.now();
            const throwIfCancelled = () => {
                if (cancelRequestedRef.current) {
                    throw new Error('cancelled');
                }
            };

            const updateProgress = (percentage: number, message: string) => updateSchedulingProgress(percentage, message, cancelRequestedRef);

            updateProgress(5, 'กำลังโหลดข้อมูลรายวิชา...');
            const coursesCollectionRef = collection(db, 'school-settings', schoolId, 'courses');
            const coursesSnapshot = await getDocs(coursesCollectionRef);
            throwIfCancelled();
            const rawCoursesData = coursesSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Course));
            
            const assignmentsCollectionRef = collection(db, 'school-settings', schoolId, 'course_assignments');
            const assignmentsSnapshot = await getDocs(assignmentsCollectionRef);
            throwIfCancelled();
            const assignmentsData = assignmentsSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as CourseAssignmentDocData));
            const targetSem = String(selectedSemester || "1");
            const targetYear = String(selectedYear || "");
            const relevantAssignmentsData = assignmentsData.filter((assignment) => {
                const assignmentSem = String(assignment.semester || "");
                const assignmentYear = String(assignment.academicYear || "");
                const yearMatches = !targetYear || !assignmentYear || assignmentYear === targetYear;
                const semesterMatches = assignmentSem === targetSem || assignmentSem.startsWith(targetSem + '/') || targetSem.startsWith(assignmentSem + '/');
                return yearMatches && semesterMatches;
            });
            const assignmentByCourseId = new Map(relevantAssignmentsData.map((assignment) => [assignment.courseId, assignment]));
            const hasUsableAssignment = (course: Course) => (
                (course.teacherAssignments || []).some((assignment) =>
                    getAssignmentTeacherIds(assignment).length > 0 &&
                    (assignment.classLevels || []).filter(Boolean).length > 0
                )
            );

            const allCoursesData = rawCoursesData.map(course => {
                const semesterAssignment = assignmentByCourseId.get(course.id);
                if (semesterAssignment && semesterAssignment.teacherAssignments) {
                    return { ...course, teacherAssignments: semesterAssignment.teacherAssignments };
                }
                return {
                    ...course,
                    teacherAssignments: [],
                    teacherId: undefined,
                    teacherIds: []
                };
            });

            const getCoTeachingKey = (courseId: string, groupNumber?: number | string, teacherIds?: string[]) => {
                const tidPart = teacherIds && teacherIds.length > 0
                    ? teacherIds.slice().sort().join('|')
                    : '';
                return `${courseId}|${normalizeGroupNumber(groupNumber)}|${tidPart}`;
            };
            const protectedCoTeachingKeys = new Set<string>();
            const coTeachingWriteTeacherIds = new Set<string>();
            if (normalizedTargetTeacherId) {
                allCoursesData.forEach(course => {
                    (course.teacherAssignments || []).forEach((assignment) => {
                        const teacherIds = getAssignmentTeacherIds(assignment);
                        if (!teacherIds.includes(normalizedTargetTeacherId) || teacherIds.length < 2) return;
                        protectedCoTeachingKeys.add(getCoTeachingKey(course.id, assignment.groupNumber, teacherIds));
                        // Legacy fallback: schedule entries written before teacherIds was persisted
                        // store only courseId|group (no teacher part) so old docs still get protected.
                        protectedCoTeachingKeys.add(`${course.id}|${normalizeGroupNumber(assignment.groupNumber)}`);
                    });
                });
            }

            updateProgress(10, 'กำลังโหลดข้อมูลครู...');
            const teachersCollectionRef = collection(db, 'school-settings', schoolId, 'teachers');
            const teachersSnapshot = await getDocs(teachersCollectionRef);
            throwIfCancelled();
            const allTeachersData = teachersSnapshot.docs
                .map(doc => ({ id: doc.id, ...doc.data() } as Teacher))
                .filter(isActiveTeacher);

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

            const teachersMap: Record<string, Teacher> = {};
            for (const t of allTeachersData) teachersMap[t.id] = t;

            updateProgress(12, 'กำลังโหลดข้อกำหนดรายวิชา...');
            const constraintsDocRef = doc(db, 'school-settings', schoolId, 'configs', 'period_constraints');
            const constraintsSnap = await getDoc(constraintsDocRef);
            throwIfCancelled();
            const constraintsFromFirestore = constraintsSnap.exists() ? (constraintsSnap.data().mapping || {}) : {};
            const effectiveAssignmentConstraints: AssignmentConstraintMap = {
                ...assignmentConstraints,
                ...constraintsFromFirestore
            };
            updateProgress(15, 'กำลังโหลดตารางเดิม...');
            const schedulesCollectionRef = collection(db, 'school-settings', schoolId, 'schedules');
            const existingSchedulesSnapshot = await getDocs(schedulesCollectionRef);
            throwIfCancelled();
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
                    teacherId: resolveScheduleTeacherId(docId, data.teacherId, allTeachersData.map(t => t.id)),
                    classId: data.classId
                };

                const lockedSchedule: Schedule = {};
                for (const slotId in scheduleData) {
                    const slotCourses = scheduleData[slotId];
                    const coursesArr = Array.isArray(slotCourses) ? slotCourses : (slotCourses ? [slotCourses] : []);
                    const docTeacherId = scheduleDocMeta[docId]?.teacherId || resolveScheduleTeacherId(docId, data.teacherId, allTeachersData.map(t => t.id));

                    const targetSem = String(selectedSemester || "1");

                    const lockedCoursesThisSlot = coursesArr.filter(c => {
                        const semStr = String(c.semester || "");
                        const isCorrectSemester = !c.semester || semStr === targetSem || semStr.startsWith(targetSem + '/') || targetSem.startsWith(semStr + '/');
                        // If it's a DIFFERENT semester, we "lock" it to preserve it, but we won't put it in the Timetable later.
                        if (!isCorrectSemester) return true;

                        const isOtherTeacher = normalizedTargetTeacherId && docTeacherId !== normalizedTargetTeacherId;
                        // Include teacherIds from the stored course so the key matches exactly
                        // what was registered in protectedCoTeachingKeys (prevents false-positives
                        // when two separate groups of the same course have different teacher sets).
                        const courseTeacherIds: string[] = Array.isArray(c.teacherIds) && c.teacherIds.length > 0
                            ? c.teacherIds
                            : (c.teacherId ? [c.teacherId] : []);
                        const cId = c.id || (c as { courseId?: string }).courseId || '';
                        const isProtectedCoTeachingCourse = normalizedTargetTeacherId && (
                            protectedCoTeachingKeys.has(getCoTeachingKey(cId, c.groupNumber, courseTeacherIds)) ||
                            // Legacy fallback: entry written before teacherIds field was added
                            (courseTeacherIds.length === 0 && protectedCoTeachingKeys.has(`${cId}|${normalizeGroupNumber(c.groupNumber)}`))
                        );
                        return isOtherTeacher || isProtectedCoTeachingCourse || c.locked;
                    });

                    if (lockedCoursesThisSlot.length > 0) {
                        lockedSchedule[slotId] = lockedCoursesThisSlot;
                    }
                }
                if (Object.keys(lockedSchedule).length > 0) {
                    lockedCoursesMap[docId] = lockedSchedule;
                }
            });

            const mergeScheduleMaps = (base: Schedule, extra: Schedule): Schedule => {
                const next: Schedule = { ...base };
                const courseKey = (course: CourseInstance) => {
                    const courseId = course?.id || (course as { courseId?: string })?.courseId || '';
                    const groupNumber = normalizeGroupNumber(course?.groupNumber);
                    const teacherIds = Array.isArray(course?.teacherIds) && course.teacherIds.length > 0
                        ? course.teacherIds.map(String).sort().join('|')
                        : String(course?.teacherId || '');
                    const classIds = Array.isArray(course?.classId)
                        ? course.classId.map(String).sort().join('|')
                        : String(course?.classId || '');
                    return `${courseId}__${groupNumber}__${teacherIds}__${classIds}`;
                };

                Object.entries(extra).forEach(([slotId, courses]) => {
                    const existingCourses = Array.isArray(next[slotId])
                        ? [...next[slotId]]
                        : (next[slotId] ? [next[slotId]] : []);
                    const seen = new Set(existingCourses.map(courseKey));
                    const extraCourses = Array.isArray(courses) ? courses : (courses ? [courses] : []);

                    extraCourses.forEach((course) => {
                        const key = courseKey(course);
                        if (seen.has(key)) return;
                        seen.add(key);
                        existingCourses.push(course);
                    });

                    if (existingCourses.length > 0) {
                        next[slotId] = existingCourses;
                    }
                });

                return next;
            };

            const currentTeacherLockedSchedule: Schedule = {};
            if (selectedTeacher && Object.keys(schedule || {}).length > 0) {
                Object.entries(schedule).forEach(([slotId, courses]) => {
                    const lockedCourses = (Array.isArray(courses) ? courses : (courses ? [courses] : []))
                        .filter((course) => course?.locked);
                    if (lockedCourses.length > 0) {
                        currentTeacherLockedSchedule[slotId] = lockedCourses.map(course => ({ ...course }));
                    }
                });
            }

            if (selectedTeacher && Object.keys(currentTeacherLockedSchedule).length > 0) {
                const selectedTeacherScheduleDocId = getScheduleDocId(selectedTeacher, selectedYear, selectedSemester);
                lockedCoursesMap[selectedTeacherScheduleDocId] = mergeScheduleMaps(
                    lockedCoursesMap[selectedTeacherScheduleDocId] || {},
                    currentTeacherLockedSchedule
                );
                scheduleDocMeta[selectedTeacherScheduleDocId] = {
                    teacherId: selectedTeacher,
                    classId: scheduleDocMeta[selectedTeacherScheduleDocId]?.classId
                };
            }

            updateProgress(5, 'กำลังเตรียมโครงสร้างข้อมูล...');
            const coursesForSemester = allCoursesData.filter(c => {
                if (c.isActive === false) return false;

                // Flexible semester matching (e.g. "1" matches "1/2568")
                // Semester "0" or undefined/null matches both semesters
                const semStr = String(c.semester || "0");
                const targetSem = String(selectedSemester || "1");
                const isCorrectSemester = semStr === "0" || semStr === targetSem || semStr.startsWith(targetSem + '/') || targetSem.startsWith(semStr + '/');

                if (!isCorrectSemester || !isAcademicCourse(c)) return false;
                if (!assignmentByCourseId.has(c.id) || !hasUsableAssignment(c)) return false;
                if (normalizedTargetTeacherId) {
                    return c.teacherAssignments?.some((a) => getAssignmentTeacherIds(a).includes(normalizedTargetTeacherId)) || false;
                }
                return true;
            });

            const dataReadinessWarnings: string[] = [];

            const schoolTimetable: EngineSchedule = {};
            let schoolTimetableRecord: EngineSchedule = {};

            const batchUpdates: EngineBatchUpdates = {};

            // 1. Initialization: Only carry over LOCKED entries as constraints
            for (const docId in lockedCoursesMap) {
                batchUpdates[docId] = {};
                const meta = scheduleDocMeta[docId] || {};
                const teacherId = resolveScheduleTeacherId(docId, meta.teacherId, allTeachersData.map(t => t.id));

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
                                if (!Array.isArray(existing.classId)) existing.classId = [existing.classId].filter(Boolean) as string[];
                                cleanClassIds.forEach(cleanClassId => {
                                    if (!(existing.classId as string[]).includes(cleanClassId)) (existing.classId as string[]).push(cleanClassId);
                                });
                            } else {
                                schoolTimetable[slotId].push({
                                    teacherId: cleanTeacherId,
                                    classId: cleanClassIds,
                                    room: lockedCourse.room || ['all'],
                                    courseId: lockedCourse.id,
                                    course: lockedCourse,
                                    groupNumber: Number(lockedCourse.groupNumber || 0)
                                });
                            }
                        }
                    });
                }
            }

            // 2. Prepare all possible teaching slots (using INDEX to match grid)
            const allTeachingSlots: { dayKey: string; periodSetting: PeriodSetting; slotId: string }[] = [];
            periodSettings.forEach((ps, idx) => {
                if (!ps.isTeachingPeriod || isProtectedSpecialPeriodSetting(ps)) return;
                Object.keys(DAYS).forEach((day: string) => {
                    if (getMatchingSpecialPeriod(specialPeriods, ps, day)) return;
                    allTeachingSlots.push({
                        dayKey: day,
                        periodSetting: ps,
                        slotId: `${day}-${idx}`
                    });
                });
            });

            // 3. Ensure all target keys exist in batchUpdates
            coursesForSemester.forEach(c => {
                const assignments = c.teacherAssignments || [];

                assignments.forEach((assign) => {
                    const teacherIds = getAssignmentTeacherIds(assign);
                    if (teacherIds.length === 0 || (normalizedTargetTeacherId && !teacherIds.includes(normalizedTargetTeacherId))) return;
                    const tId = normalizedTargetTeacherId || teacherIds[0];
                    
                    const cLevels = (assign.classLevels || []).filter(Boolean);
                    teacherIds.forEach(teacherId => {
                        if (normalizedTargetTeacherId && teacherId !== normalizedTargetTeacherId) return;
                        cLevels.forEach((classId: string) => {
                            const docId = `${teacherId}_${classId}`;
                            if (!batchUpdates[docId]) batchUpdates[docId] = {};
                        });
                    });
                });
            });

            for (const docId in existingSchedulesMap) {
                if (!batchUpdates[docId]) batchUpdates[docId] = {};
            }

            const tasks: EngineTask[] = [];
            const skippedCourseIssues: string[] = [];
            const createEngineTask = (
                course: Course,
                teacherId: string,
                teacherIds: string[],
                targetClasses: string[],
                targetRooms: string[],
                groupNumber: number,
                duration: number,
                requiredSlot?: string
            ): EngineTask => ({
                course,
                teacherId,
                teacherIds,
                targetClasses,
                targetRooms,
                instanceCount: 1,
                duration,
                originalCourseId: course.id,
                compositeId: `${course.id}_${groupNumber}`,
                groupNumber,
                ...(requiredSlot ? { requiredSlot } : {})
            });

            const addCarryOverCourseToSchedule = (
                slotId: string,
                course: Course,
                teacherId: string,
                teacherIds: string[],
                classId: string,
                targetClasses: string[],
                targetRooms: string[],
                groupNumber: number,
                compositeId: string
            ) => {
                const docId = `${teacherId}_${classId}`;
                if (!batchUpdates[docId]) batchUpdates[docId] = {};
                const existingItems = Array.isArray(batchUpdates[docId][slotId])
                    ? batchUpdates[docId][slotId]
                    : (batchUpdates[docId][slotId] ? [batchUpdates[docId][slotId]] : []);
                const alreadyInDoc = existingItems.some((item) =>
                    (item.id === course.id || (item as { courseId?: string }).courseId === course.id) &&
                    normalizeGroupNumber(item.groupNumber) === groupNumber
                );

                if (!alreadyInDoc) {
                    batchUpdates[docId][slotId] = [
                        ...existingItems,
                        {
                            ...course,
                            teacherId,
                            teacherIds,
                            classId,
                            room: targetRooms,
                            groupNumber,
                            compositeId,
                            instanceId: `${course.id}-${groupNumber}-${slotId}-${classId}-${teacherId}`
                        }
                    ];
                }

                if (!schoolTimetable[slotId]) schoolTimetable[slotId] = [];
                const existingOccupancy = schoolTimetable[slotId].find(o =>
                    o.teacherId === teacherId &&
                    o.courseId === course.id &&
                    Number(o.groupNumber || 0) === groupNumber
                );
                if (existingOccupancy) {
                    if (!Array.isArray(existingOccupancy.classId)) existingOccupancy.classId = [existingOccupancy.classId].filter(Boolean) as string[];
                    targetClasses.forEach(targetClass => {
                        if (!(existingOccupancy.classId as string[]).includes(targetClass)) {
                            (existingOccupancy.classId as string[]).push(targetClass);
                        }
                    });
                    return;
                }

                schoolTimetable[slotId].push({
                    teacherId,
                    classId: [...targetClasses],
                    room: targetRooms,
                    courseId: course.id,
                    course: {
                        ...course,
                        teacherId,
                        teacherIds,
                        classId: targetClasses,
                        room: targetRooms,
                        groupNumber
                    },
                    groupNumber
                });
            };

            const getExistingLockedSlotsForAssignment = (
                courseId: string,
                teacherIds: string[],
                targetClasses: string[],
                groupNumber: number
            ) => {
                const existingSlots = new Set<string>();
                const teacherSet = new Set(teacherIds);
                const normalizeClassForMatch = (value: string) => String(value || '').trim();
                const getBaseClass = (value: string) => normalizeClassForMatch(value).split('/')[0];
                const targetClassSet = new Set(targetClasses.map(normalizeClassForMatch));
                const targetBaseClassSet = new Set(targetClasses.map(getBaseClass));

                Object.entries(lockedCoursesMap).forEach(([docId, scheduleData]) => {
                    const docTeacherId = scheduleDocMeta[docId]?.teacherId || resolveScheduleTeacherId(docId, undefined, allTeachersData.map(t => t.id));
                    if (!teacherSet.has(docTeacherId)) return;

                    Object.entries(scheduleData).forEach(([slotId, courses]) => {
                        const coursesArr = Array.isArray(courses) ? courses : (courses ? [courses] : []);
                        const hasMatchingCourse = coursesArr.some((c) => {
                            const cId = c.id || (c as { courseId?: string }).courseId;
                            if (cId !== courseId) return false;
                            if (normalizeGroupNumber(c.groupNumber) !== groupNumber) return false;

                            const cClasses = Array.isArray(c.classId)
                                ? c.classId
                                : [c.classId || scheduleDocMeta[docId]?.classId].flat().filter((v): v is string => Boolean(v));
                            if (targetClassSet.size === 0 || cClasses.length === 0) return true;
                            return cClasses.some((classId) => {
                                const normalizedClassId = normalizeClassForMatch(classId);
                                return targetClassSet.has(normalizedClassId) ||
                                    targetBaseClassSet.has(getBaseClass(normalizedClassId));
                            });
                        });

                        if (hasMatchingCourse) existingSlots.add(slotId);
                    });
                });

                return existingSlots;
            };

            const getExistingSlotsForAssignment = (
                scheduleSource: Record<string, Schedule>,
                courseId: string,
                teacherIds: string[],
                targetClasses: string[],
                groupNumber: number
            ) => {
                const existingSlots = new Set<string>();
                const teacherSet = new Set(teacherIds);
                const normalizeClassForMatch = (value: string) => String(value || '').trim();
                const getBaseClass = (value: string) => normalizeClassForMatch(value).split('/')[0];
                const targetClassSet = new Set(targetClasses.map(normalizeClassForMatch));
                const targetBaseClassSet = new Set(targetClasses.map(getBaseClass));

                Object.entries(scheduleSource).forEach(([slotId, courses]) => {
                    // `courses` is nominally a `Schedule` per this function's parameter type, but at
                    // this call site it's actually keyed per-slot like a flat Schedule's values — kept
                    // as-is (pre-existing behavior) and only asserted to the shape this code already
                    // assumed under the old `any` typing.
                    const coursesArr = (Array.isArray(courses) ? courses : (courses ? [courses] : [])) as unknown as CourseInstance[];
                    const hasMatchingCourse = coursesArr.some((c) => {
                        const cId = c.id || (c as { courseId?: string }).courseId;
                        if (cId !== courseId) return false;
                        if (normalizeGroupNumber(c.groupNumber) !== groupNumber) return false;

                        const cTeacherIds = Array.isArray(c.teacherIds) && c.teacherIds.length > 0
                            ? c.teacherIds
                            : (c.teacherId ? [c.teacherId] : []);
                        if (cTeacherIds.length > 0 && !cTeacherIds.some((teacherId) => teacherSet.has(teacherId))) {
                            return false;
                        }

                        const cClasses = Array.isArray(c.classId)
                            ? c.classId
                            : [c.classId].flat().filter((v): v is string => Boolean(v));
                        if (targetClassSet.size === 0 || cClasses.length === 0) return true;
                        return cClasses.some((classId) => {
                            const normalizedClassId = normalizeClassForMatch(classId);
                            return targetClassSet.has(normalizedClassId) ||
                                targetBaseClassSet.has(getBaseClass(normalizedClassId));
                        });
                    });

                    if (hasMatchingCourse) existingSlots.add(slotId);
                });

                return existingSlots;
            };

            const removeExistingAssignmentSlot = (
                courseId: string,
                teacherIds: string[],
                groupNumber: number,
                slotId: string
            ) => {
                const teacherSet = new Set(teacherIds);

                Object.keys(batchUpdates).forEach(docId => {
                    const docTeacherId = scheduleDocMeta[docId]?.teacherId || resolveScheduleTeacherId(docId, undefined, allTeachersData.map(t => t.id));
                    if (!teacherSet.has(docTeacherId)) return;
                    const slotItems = batchUpdates[docId]?.[slotId];
                    if (!slotItems) return;

                    const items = Array.isArray(slotItems) ? slotItems : [slotItems];
                    const filtered = items.filter((item) =>
                        !((item.id === courseId || (item as { courseId?: string }).courseId === courseId) &&
                            normalizeGroupNumber(item.groupNumber) === groupNumber)
                    );

                    if (filtered.length === 0) delete batchUpdates[docId][slotId];
                    else batchUpdates[docId][slotId] = filtered;
                });

                if (schoolTimetable[slotId]) {
                    schoolTimetable[slotId] = schoolTimetable[slotId].filter(occupancy =>
                        !(teacherSet.has(occupancy.teacherId) &&
                            occupancy.courseId === courseId &&
                            normalizeGroupNumber(occupancy.groupNumber) === groupNumber)
                    );
                    if (schoolTimetable[slotId].length === 0) delete schoolTimetable[slotId];
                }
            };

            coursesForSemester.forEach(course => {
                const assignments = course.teacherAssignments || [];

                const validAssignments = assignments.filter((a) => {
                    const teacherIds = getAssignmentTeacherIds(a);
                    if (teacherIds.length === 0) return false;
                    return teacherIds.every(teacherId => {
                        const teacher = teachersMap[teacherId];
                        return !teacher || !teacher.status || teacher.status === 'อยู่';
                    });
                });
                if (validAssignments.length === 0) {
                    skippedCourseIssues.push(`${course.code || '-'} ${course.title}: ยังไม่มีครูผู้สอนที่ถูกต้อง`);
                    return;
                }

                validAssignments.forEach((assign) => {
                    const teacherIds = getAssignmentTeacherIds(assign);
                    if (teacherIds.length === 0 || (normalizedTargetTeacherId && !teacherIds.includes(normalizedTargetTeacherId))) return;
                    const tId = normalizedTargetTeacherId || teacherIds[0];
                    const groupNumber = normalizeGroupNumber(assign.groupNumber);
                    const compositeId = getAssignmentCompositeId(course.id, groupNumber);

                    const baseClassIds = (assign.classLevels && assign.classLevels.length > 0)
                        ? assign.classLevels.filter(Boolean)
                        : (Array.isArray(course.classId) ? course.classId : (course.classId ? [course.classId] : [])).filter(Boolean);

                    const groupRoom = assign.room;
                    const classIds = baseClassIds.map((id: string) => {
                        if (id.includes('/')) return id;
                        if (groupRoom && groupRoom !== 'all') return `${id}/${groupRoom}`;
                        return id;
                    });

                    if (classIds.length === 0) {
                        skippedCourseIssues.push(`${course.code || '-'} ${course.title}: ยังไม่มีระดับชั้น/กลุ่มเรียน`);
                        return;
                    }

                    const rooms = (assign.roomIds && assign.roomIds.length > 0) 
                        ? assign.roomIds 
                        : (course.room && course.room.length > 0 ? course.room : ['all']);

                    const hoursPerWeek = getRequiredWeeklyPeriods(course);

                    const lockedSlotsForThisAssignment = getExistingLockedSlotsForAssignment(
                        course.id,
                        teacherIds,
                        classIds,
                        groupNumber
                    );
                    const previousSlotsForThisAssignment = getExistingSlotsForAssignment(
                        existingSchedulesMap,
                        course.id,
                        teacherIds,
                        classIds,
                        groupNumber
                    );
                    if (normalizedTargetTeacherId && lockedSlotsForThisAssignment.size > hoursPerWeek) {
                        const sortedExistingSlots = Array.from(lockedSlotsForThisAssignment).sort((a, b) => {
                            const [dayA, periodA] = a.split('-');
                            const [dayB, periodB] = b.split('-');
                            if (dayA !== dayB) return dayA.localeCompare(dayB);
                            return Number(periodA) - Number(periodB);
                        });
                        const slotsToRemove = sortedExistingSlots.slice(hoursPerWeek);
                        slotsToRemove.forEach(slotId => {
                            lockedSlotsForThisAssignment.delete(slotId);
                            removeExistingAssignmentSlot(course.id, teacherIds, groupNumber, slotId);
                        });
                        dataReadinessWarnings.push(
                            `${course.code || '-'} ${course.title}: พบคาบเดิมเกิน ${sortedExistingSlots.length}/${hoursPerWeek} ระบบตัดคาบส่วนเกินออก ${slotsToRemove.length} คาบก่อนจัดใหม่`
                        );
                    }

                    let needed = hoursPerWeek - lockedSlotsForThisAssignment.size;
                    if (normalizedTargetTeacherId && teacherIds.length > 1) {
                        teacherIds.forEach(teacherId => coTeachingWriteTeacherIds.add(teacherId));
                        lockedSlotsForThisAssignment.forEach(slotId => {
                            teacherIds.forEach(teacherId => {
                                classIds.forEach((classId: string) => {
                                    addCarryOverCourseToSchedule(
                                        slotId,
                                        course,
                                        teacherId,
                                        teacherIds,
                                        classId,
                                        classIds,
                                        Array.isArray(rooms) ? rooms : [rooms],
                                        groupNumber,
                                        compositeId
                                    );
                                });
                            });
                        });
                    }
                    const asgnCst = effectiveAssignmentConstraints[compositeId] || { type: 'any' };
                    const normalizeLockedSlotId = (slot: string | { day: string; periodId: string }) => {
                        if (typeof slot === 'string') return slot;
                        const periodIndex = periodSettings.findIndex(p => p.id === slot.periodId);
                        return periodIndex >= 0 ? `${slot.day}-${periodIndex}` : '';
                    };

                    // --- NEW: Handle Locked Slots from Assignment Constraints ---
                    if (asgnCst.isLocked && asgnCst.lockedSlots && asgnCst.lockedSlots.length > 0) {
                        const roomArray = Array.isArray(rooms) ? rooms : [rooms];
                        const lockedSlotIds = Array.from(new Set(asgnCst.lockedSlots
                            .map(normalizeLockedSlotId)
                            .filter(Boolean)))
                            .sort((a, b) => {
                                const [dayA, periodA] = a.split('-');
                                const [dayB, periodB] = b.split('-');
                                if (dayA !== dayB) return dayA.localeCompare(dayB);
                                return Number(periodA) - Number(periodB);
                            });

                        const consumedSlots = new Set<string>();
                        lockedSlotIds.forEach(slotId => {
                            if (consumedSlots.has(slotId) || lockedSlotsForThisAssignment.has(slotId)) return;

                            const [dayKey, indexStr] = slotId.split('-');
                            const slotIndex = Number(indexStr);
                            const partnerIndex = getPartnerIndexForPeriods(slotIndex, periodSettings);
                            const partnerSlotId = partnerIndex !== -1 ? `${dayKey}-${partnerIndex}` : '';
                            const canUseLockedDouble = isDoubleCapableConstraint(asgnCst) &&
                                partnerIndex > slotIndex &&
                                lockedSlotIds.includes(partnerSlotId) &&
                                !lockedSlotsForThisAssignment.has(partnerSlotId);
                            tasks.push(createEngineTask(
                                course,
                                tId,
                                teacherIds,
                                classIds,
                                roomArray,
                                groupNumber,
                                1, // Force duration 1 for manually locked slots as requested
                                slotId
                            ));
                            consumedSlots.add(slotId);
                            needed--;
                        });
                    }

                    const remainingNeeded = Math.max(0, needed);
                    if (remainingNeeded <= 0) return;

                    const taskStartIndex = tasks.length;
                    buildPreferredSessionDurations(course, remainingNeeded, asgnCst, hoursPerWeek).forEach(duration => {
                        tasks.push(createEngineTask(
                            course,
                            tId,
                            teacherIds,
                            classIds,
                            Array.isArray(rooms) ? rooms : [rooms],
                            groupNumber,
                            duration
                        ));
                    });

                    if (previousSlotsForThisAssignment.size > 0) {
                        const previousSlots = Array.from(previousSlotsForThisAssignment);
                        for (let i = taskStartIndex; i < tasks.length; i++) {
                            tasks[i] = {
                                ...tasks[i],
                                previousSlots
                            };
                        }
                    }
                });
            });

            const totalPeriodsRequired = tasks.reduce((sum, t) => sum + t.duration, 0);
            if (tasks.length === 0) {
                console.warn("Auto-schedule: No tasks to place! Check if courses have teachers and class levels assigned.");
            }

            const teacherLabel = (teacherId: string) => {
                const teacher = teachersMap[teacherId];
                return teacher?.name || `${teacher?.title || ''}${teacher?.firstName || ''} ${teacher?.lastName || ''}`.trim() || teacherId;
            };



            if (tasks.length === 0) {
                await showPrecheckReport(
                    ['ไม่พบรายวิชาที่พร้อมจัดตารางในปี/ภาคเรียนนี้'],
                    skippedCourseIssues
                );
                return;
            }


            // 4. Pre-calculate valid slots and detect over-scheduling
            const validSlotsCache = new Map<EngineTask, Set<string>>();
            const relaxedValidSlotsCache = new Map<EngineTask, Set<string>>();
            const tasksPerClass: Record<string, number> = {};
            const tasksPerTeacher: Record<string, number> = {};
            const tasksPerRoom: Record<string, number> = {};
            const {
                getConstraintMapForTask,
                getSoftConstraintMapForTask,
                buildValidSlotsForTask,
                teacherPrefSets,
            } = createSlotConstraintHelpers({
                effectiveAssignmentConstraints,
                teachersMap,
                periodSettings,
                specialPeriods,
                dynamicUnavailableSlots,
                selectedTeacher,
                allTeachingSlots,
            });


            for (const task of tasks) {
                task.targetClasses.forEach(c => {
                    tasksPerClass[c] = (tasksPerClass[c] || 0) + task.duration;
                });
                getTaskTeacherIds(task).forEach(teacherId => {
                    tasksPerTeacher[teacherId] = (tasksPerTeacher[teacherId] || 0) + task.duration;
                });
                task.targetRooms
                    .filter(roomId => roomId && roomId.toLowerCase() !== 'all')
                    .forEach(roomId => {
                        tasksPerRoom[roomId] = (tasksPerRoom[roomId] || 0) + task.duration;
                    });

                validSlotsCache.set(task, buildValidSlotsForTask(task, getConstraintMapForTask));
                relaxedValidSlotsCache.set(task, buildValidSlotsForTask(task, getSoftConstraintMapForTask));
            }

            dataReadinessWarnings.forEach(issue => console.warn("Auto-schedule:", issue));
            Object.entries(tasksPerClass).forEach(([cls, count]) => {
                if (count > 40) {
                    console.warn(`Class ${cls} has ${count} periods requested but only ~40 slots available!`);
                }
            });

            const { fatalIssues: fatalPrecheckIssues, warningIssues: warningPrecheckIssues } = runSchedulePrecheck({
                tasks,
                allTeachingSlots,
                periodSettings,
                tasksPerClass,
                tasksPerTeacher,
                tasksPerRoom,
                teachersMap,
                dynamicUnavailableSlots,
                selectedTeacher,
                validSlotsByTask: validSlotsCache,
                dataReadinessWarnings,
                skippedCourseIssues
            });

            if (fatalPrecheckIssues.length > 0) {
                await showPrecheckReport(fatalPrecheckIssues, warningPrecheckIssues);
                return;
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
            const relaxedValidSlotsByTaskIndex = tasks.map(task => Array.from(relaxedValidSlotsCache.get(task) || []));
            const maxRuns = normalizedTargetTeacherId
                ? Math.min(30, Math.max(18, Math.ceil(tasks.length / 3)))
                : Math.min(35, Math.max(20, Math.ceil(tasks.length / 18)));
            const engineInput: SchedulingEngineInput = {
                tasks,
                initialTimetable: schoolTimetable,
                initialBatchUpdates: batchUpdates,
                allTeachingSlots,
                validSlotsByTaskIndex,
                relaxedValidSlotsByTaskIndex,
                assignmentConstraints: effectiveAssignmentConstraints,
                maxRuns,
                maxRepairAttempts: normalizedTargetTeacherId
                    ? Math.max(1800, tasks.length * 18)
                    : Math.max(1200, tasks.length * 8)
            };

            const runEngineWithWorker = async (): Promise<SchedulingEngineResult> => {
                if (typeof Worker === 'undefined') {
                    return runSchedulingEngine(engineInput, ({ percentage, message }) => updateProgress(percentage, message));
                }

                return new Promise((resolve, reject) => {
                    const worker = new Worker(new URL('../engine/scheduler.worker.ts', import.meta.url), { type: 'module' });
                    activeWorkerRef.current = worker;
                    let settled = false;

                    const settle = (fn: () => void) => {
                        if (settled) return;
                        settled = true;
                        activeWorkerRef.current = null;
                        worker.terminate();
                        fn();
                    };

                    const fallback = () => settle(() =>
                        resolve(runSchedulingEngine(engineInput, ({ percentage, message }) => updateProgress(percentage, message)))
                    );

                    worker.onmessage = (event: MessageEvent<WorkerResponse>) => {
                        const data = event.data;
                        if (!data) return;
                        if (data.type === 'progress') { updateProgress(data.payload.percentage, data.payload.message); return; }
                        if (data.type === 'success') { settle(() => resolve(data.payload)); return; }
                        if (data.type === 'error') { console.warn('Scheduler worker failed, falling back to main thread:', data.error); fallback(); }
                    };

                    worker.onerror = () => fallback();
                    activeCancelRef.current = () => settle(() => reject(new Error('cancelled')));

                    // Listen for external cancellation (e.g. user clicks ยกเลิก in the dialog)
                    worker.addEventListener('error', () => {
                        if (!settled) settle(() => reject(new Error('cancelled')));
                    });

                    worker.postMessage({ type: 'run', payload: engineInput });
                });
            };

            const engineResult = await runEngineWithWorker();
            throwIfCancelled();

            schoolTimetableRecord = engineResult.schoolTimetableRecord;
            Object.assign(batchUpdates, engineResult.batchUpdates);
            const unplacedTasks = engineResult.unplacedTasks;
            const placedPeriods = engineResult.placedPeriods;

            const { summaries: temporaryTaskSummaries, temporaryPlacedPeriods } = processTemporaryPlacements(
                {
                    unplacedTasks,
                    schoolTimetableRecord,
                    allTeachingSlots,
                    periodSettings,
                    DAYS
                },
                teacherLabel
            );



            updateProgress(80, 'กำลังเตรียมบันทึกข้อมูล...');

            const { teacherIdsToWrite, numBatches } = await writeSchedulesToFirestore(
                {
                    schoolId,
                    selectedYear,
                    selectedSemester,
                    batchUpdates,
                    existingSchedulesSnapshot,
                    scheduleDocMeta,
                    allTeachersData,
                    normalizedTargetTeacherId,
                    coTeachingWriteTeacherIds,
                    shouldHardResetSchoolWide: !normalizedTargetTeacherId
                },
                updateProgress
            );
            throwIfCancelled();


            updateProgress(100, 'เสร็จสิ้น!');

            const endTime = Date.now();
            const processingTimeMs = endTime - startTime;
            const validationResult = validatePostSchedule({ tasks, timetable: schoolTimetableRecord });
            const actualPlacedPeriods = validationResult.actualPlacedPeriods || placedPeriods;
            const { actualPlacedRate, temporaryAssistedRate } = calculatePlacementRates(
                totalPeriodsRequired,
                actualPlacedPeriods,
                temporaryPlacedPeriods
            );
            const resolvedRate = actualPlacedRate;
            const temporaryTaskCount = temporaryTaskSummaries.filter(item => item.hasTemporarySlots).length;
            const forcedTemporaryTaskCount = temporaryTaskSummaries.filter(item => item.isForcedTemporary).length;
            const unresolvedTaskCount = temporaryTaskSummaries.length - temporaryTaskCount;
            const qualityScore = Math.max(
                0,
                Math.min(
                    100,
                    100 -
                    validationResult.conflictCount * 10 -
                    validationResult.missingRequiredPeriods * 6 -
                    validationResult.lockedSlotMismatchCount * 8 -
                    forcedTemporaryTaskCount * 3 -
                    unresolvedTaskCount * 4
                )
            );
            const validationPreview = validationResult.issues.slice(0, 8);
            const schedulingScopeLabel = normalizedTargetTeacherId ? 'ครูที่เลือก' : 'ทั้งโรงเรียน';
            const completionTitle = validationResult.isValid && unplacedTasks.length === 0 && actualPlacedPeriods >= totalPeriodsRequired
                ? 'จัดตารางจริงครบ'
                : 'จัดตารางเสร็จสิ้น (ต้องตรวจทาน)';

            const metrics: SchedulingMetrics = {
                totalTasks: tasks.length,
                placedTasks: placedPeriods,
                unplacedTasks: unplacedTasks.length,
                processingTimeMs,
                averageConsecutivePeriods: calculateAverageConsecutivePeriods(schoolTimetableRecord),
                averageGapsPerDay: calculateAverageGapsPerDay(schoolTimetableRecord),
                bblComplianceRate: calculateBBLCompliance(schoolTimetableRecord, allCoursesData, periodSettings),
                actualPlacedRate,
                temporaryAssistedRate,
                temporaryPlacedPeriods,
                resolvedRate,
                validationIssueCount: validationResult.issues.length,
                conflictCount: validationResult.conflictCount,
                qualityScore
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

            await showAutoScheduleResultModal({
                completionTitle,
                schedulingScopeLabel,
                actualPlacedPeriods,
                temporaryPlacedPeriods,
                totalPeriodsRequired,
                actualPlacedRate,
                temporaryAssistedRate,
                unplacedCount: unplacedTasks.length,
                temporaryTaskCount,
                forcedTemporaryTaskCount,
                unresolvedTaskCount,
                temporaryTaskSummaries,
                validationIssueCount: validationResult.issues.length,
                validationPreview,
                onConfirm: () => {
                    setTimeout(() => {
                        if (scheduleSectionRef.current) {
                            const yOffset = -140;
                            const element = scheduleSectionRef.current;
                            const y = element.getBoundingClientRect().top + window.scrollY + yOffset;
                            window.scrollTo({ top: y, behavior: 'smooth' });
                        }
                    }, 300);
                },
            });

            if (schoolId) {
                if (!normalizedTargetTeacherId) {
                    setSchedule({});
                    setAvailableCourseInstances([]);
                }
                await fetchData(schoolId);
                if (selectedTeacher || normalizedTargetTeacherId) {
                    await loadTeacherMasterSchedule();
                }
            }

        } catch (error) {
            // User cancelled — dialog is already closed, just clean up silently
            if (error instanceof Error && error.message === 'cancelled') return;

            console.error("School-wide auto-scheduling failed: ", error);

            let errorMessage = `เกิดข้อผิดพลาดระหว่างการสร้างตารางสอน${normalizedTargetTeacherId ? 'ครูที่เลือก' : 'ทั้งโรงเรียน'}`;
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
            activeCancelRef.current = null;
            cancelRequestedRef.current = false;
            activeRunIdRef.current = null;
            await releaseSchedulingRunLock(schoolId, runId).catch(() => undefined);
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
