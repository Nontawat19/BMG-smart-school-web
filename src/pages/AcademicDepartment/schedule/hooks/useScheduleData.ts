import { useState, useCallback, useEffect } from 'react';
import { collection, getDocs, doc, getDoc } from 'firebase/firestore';
import { firestore as db } from '@/firebase';
import { useDispatch, useSelector } from 'react-redux';
import { fetchTeachersMap } from '@/store/slices/userMapSlice';
import { RootState } from '@/store';
import Swal from 'sweetalert2';
import { Course, CourseInstance, Schedule, SpecialPeriod, PeriodSetting, SchoolSettings, AssignmentConstraintMap, getAssignmentTeacherIds } from '../types';
import { CLASSES } from '../utils';
import { getLevelsByRange } from '@/utils/schoolUtils';
import { normalizePeriodSettings } from '@/utils/scheduleDisplayUtils';
import { isActiveTeacher } from '@/utils/teacherSortUtils';

type MasterScheduleEntry = {
    teacherId: string;
    teacherIds?: string[];
    classId: string | string[];
    room?: string[];
    courseId?: string;
    course: Course | null;
    groupNumber: number;
};

const getScheduleDocId = (teacherId: string, academicYear: string, semester: string) => {
    return `${teacherId}__${academicYear || 'unknown'}__${semester || '1'}`;
};

const resolveScheduleTeacherId = (
    scheduleKey: string,
    storedTeacherId: string | undefined,
    knownTeacherIds: string[]
) => {
    if (storedTeacherId && knownTeacherIds.includes(storedTeacherId)) return storedTeacherId;
    const byPattern = knownTeacherIds.find(tId =>
        scheduleKey === tId ||
        scheduleKey.startsWith(`${tId}__`) ||
        scheduleKey.startsWith(`${tId}_`)
    );
    return byPattern || storedTeacherId || scheduleKey.split('__')[0] || scheduleKey.split('_')[0];
};

export const useScheduleData = (
    schoolId: string | undefined,
    selectedYear?: string,
    selectedSemester: string = "1"
) => {
    const [availableCourseInstances, setAvailableCourseInstances] = useState<CourseInstance[]>([]);
    const [allCourses, setAllCourses] = useState<Course[]>([]);
    const [specialPeriods, setSpecialPeriods] = useState<SpecialPeriod[]>([]);
    const [periodSettings, setPeriodSettings] = useState<PeriodSetting[]>([]);
    const [schoolSettings, setSchoolSettings] = useState<SchoolSettings>({
        schoolType: '',
        opportunityExpansionLevel: '',
        availableClasses: []
    });
    const [schoolMasterSchedule, setSchoolMasterSchedule] = useState<Record<string, MasterScheduleEntry[]>>({});
    const [teacherMasterSchedule, setTeacherMasterSchedule] = useState<Record<string, { classId: string | string[]; course: Course | null }>>({});
    const [schedule, setSchedule] = useState<Schedule>({});
    const academicYear = useSelector((state: RootState) => state.calendar.academicYear);
    const academicTerm = useSelector((state: RootState) => state.calendar.rawData?.currentTerm || "1");
    const [assignmentConstraints, setAssignmentConstraints] = useState<AssignmentConstraintMap>({});

    const dispatch = useDispatch();
    const { teachers: teacherMap, status: teacherMapStatus } = useSelector((state: RootState) => state.userMap);

    const loadSchoolMasterSchedule = useCallback(async (currentSchoolId: string) => {
        const targetYear = String(selectedYear || academicYear || "");
        const targetSemester = String(selectedSemester || academicTerm || "1");
        const matchesYearSemester = (data: any) => {
            const dataYear = String(data.academicYear || "");
            const dataSemester = String(data.semester || "");
            const yearMatches = !targetYear || !dataYear || dataYear === targetYear;
            const semesterMatches = !dataSemester || dataSemester === targetSemester || dataSemester.startsWith(targetSemester + '/') || targetSemester.startsWith(dataSemester + '/');
            return yearMatches && semesterMatches;
        };

        const masterSchedule: Record<string, MasterScheduleEntry[]> = {};
        const knownTeacherIds = Object.keys(teacherMap || {});
        const schedulesCollectionRef = collection(db, 'school-settings', currentSchoolId, 'schedules');
        const querySnapshot = await getDocs(schedulesCollectionRef);
        const matchingScheduleDocs = querySnapshot.docs
            .map(scheduleDoc => {
                const data = scheduleDoc.data();
                if (!matchesYearSemester(data)) return null;
                const teacherId = resolveScheduleTeacherId(scheduleDoc.id, data.teacherId, knownTeacherIds);
                const dataYear = String(data.academicYear || targetYear || "");
                const dataSemester = String(data.semester || targetSemester || "1");
                const canonicalDocId = getScheduleDocId(teacherId, dataYear, dataSemester);

                return {
                    id: scheduleDoc.id,
                    data,
                    teacherId,
                    isCanonical: scheduleDoc.id === canonicalDocId || scheduleDoc.id.includes('__')
                };
            })
            .filter(Boolean) as Array<{ id: string; data: any; teacherId: string; isCanonical: boolean }>;

        const teachersWithCanonicalDocs = new Set(
            matchingScheduleDocs
                .filter(scheduleDoc => scheduleDoc.isCanonical)
                .map(scheduleDoc => scheduleDoc.teacherId)
        );

        matchingScheduleDocs.forEach((scheduleDoc) => {
            if (!scheduleDoc.isCanonical && teachersWithCanonicalDocs.has(scheduleDoc.teacherId)) return;

            const data = scheduleDoc.data;
            const teacherId = scheduleDoc.teacherId;
            const classId = data.classId;
            const scheduleData = data.schedule as Schedule;

            for (const slot in scheduleData) {
                const slotData = scheduleData[slot];
                if (slotData) {
                    if (!masterSchedule[slot]) {
                        masterSchedule[slot] = [];
                    }
                    const coursesArr = Array.isArray(slotData) ? slotData : [slotData];
                    coursesArr.forEach(course => {
                        // Strict check: only include if the teacher is actually assigned and active
                        if (!teacherId || teacherId === 'pending' || teacherId.startsWith('GHOST')) return;
                        const teacher = teacherMap[teacherId];
                        if (teacher && teacher.status && teacher.status !== 'อยู่') return;

                        // Priority: course instance data > teacher-level data
                        const resolvedClassId = course.classId || data.classId;
                        const resolvedRoom = course.room || data.room || [];
                        
                        masterSchedule[slot].push({ 
                            teacherId, 
                            classId: resolvedClassId, 
                            room: resolvedRoom,
                            courseId: course.id,
                            teacherIds: course.teacherIds,
                            groupNumber: course.groupNumber || 1,
                            course: {
                                ...course,
                                groupNumber: course.groupNumber || 1,
                                classId: resolvedClassId,
                                room: resolvedRoom
                            }
                        });
                    });
                }
            }
        });
        setSchoolMasterSchedule(masterSchedule);
    }, [academicTerm, academicYear, selectedSemester, selectedYear]);

    const fetchData = useCallback(async (currentSchoolId: string) => {
        const fetchCourses = async () => {
            try {
                const coursesCollectionRef = collection(db, 'school-settings', currentSchoolId, 'courses');
                const querySnapshot = await getDocs(coursesCollectionRef);
                const rawCoursesData = querySnapshot.docs
                    .map(doc => ({ id: doc.id, ...doc.data() } as Course))
                    .filter(c => c.isActive !== false);

                const assignmentsCollectionRef = collection(db, 'school-settings', currentSchoolId, 'course_assignments');
                const assignmentsSnap = await getDocs(assignmentsCollectionRef);
                const assignmentsData = assignmentsSnap.docs.map(doc => ({ id: doc.id, ...doc.data() } as any));

                const coursesData = rawCoursesData.map(course => {
                    const targetSem = String(selectedSemester || academicTerm || "1");
                    const targetYear = String(selectedYear || academicYear || "");
                    const semesterAssignment = assignmentsData.find((a: any) => {
                        const aSem = String(a.semester || "");
                        const aYear = String(a.academicYear || "");
                        const yearMatches = !targetYear || !aYear || aYear === targetYear;
                        return a.courseId === course.id && yearMatches && (aSem === targetSem || aSem.startsWith(targetSem + '/') || targetSem.startsWith(aSem + '/'));
                    });
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

                setAllCourses(coursesData);
                
                // --- Flattening logic (Senior Level) ---
                const flattened: CourseInstance[] = [];
                coursesData.forEach(course => {
                    if (course.teacherAssignments && course.teacherAssignments.length > 0) {
                        course.teacherAssignments.forEach((asgn: any, idx: number) => {
                            // Filter out assignments without a valid teacher or inactive teachers
                            const teacherIds = getAssignmentTeacherIds(asgn);
                            teacherIds.forEach(teacherId => {
                                const teacher = teacherMap[teacherId];
                                if (teacher && !isActiveTeacher(teacher)) return;

                                flattened.push({
                                    ...course,
                                    instanceId: `${course.id}_${asgn.groupNumber || idx + 1}_${teacherId}`,
                                    compositeId: `${course.id}_${asgn.groupNumber || idx + 1}`,
                                    groupNumber: asgn.groupNumber || idx + 1,
                                    teacherId,
                                    teacherIds,
                                    room: asgn.roomIds || course.room,
                                    classId: asgn.classLevels && asgn.classLevels.length > 0 ? asgn.classLevels : course.classId
                                } as CourseInstance);
                            });
                        });
                    }
                });
                setAvailableCourseInstances(flattened);
            } catch (error) {
                console.error("Error fetching courses: ", error);
                Swal.fire({ icon: 'error', title: 'เกิดข้อผิดพลาด', text: 'ไม่สามารถดึงข้อมูลรายวิชาได้' });
            }
        };

        const fetchAssignmentConstraints = async () => {
            try {
                const docRef = doc(db, 'school-settings', currentSchoolId, 'configs', 'period_constraints');
                const docSnap = await getDoc(docRef);
                if (docSnap.exists()) {
                    setAssignmentConstraints(docSnap.data().mapping || {});
                }
            } catch (error) {
                console.error("Error fetching assignment constraints: ", error);
            }
        };

        const fetchSpecialPeriods = async () => {
            try {
                const periodsCollectionRef = collection(db, 'school-settings', currentSchoolId, 'special-periods');
                const querySnapshot = await getDocs(periodsCollectionRef);
                const periodsData = querySnapshot.docs.map(doc => ({
                    id: doc.id,
                    ...doc.data()
                } as SpecialPeriod));
                setSpecialPeriods(periodsData);
            } catch (error) {
                console.error("Error fetching special periods: ", error);
            }
        };

        const fetchScheduleSettings = async () => {
            try {
                const docRef = doc(db, 'school-settings', currentSchoolId, 'configs', 'schedule_settings');
                const docSnap = await getDoc(docRef);
                if (docSnap.exists()) {
                    const data = docSnap.data();
                    if (data.periods) {
                        setPeriodSettings(normalizePeriodSettings(data.periods));
                    }
                } else {
                    const defaultPeriods: PeriodSetting[] = [
                        { id: 'homeroom', label: 'โฮมรูม', startTime: '08:30', endTime: '08:40', isTeachingPeriod: false },
                        { id: 'period-1', label: 'คาบที่ 1', startTime: '08:40', endTime: '09:30', isTeachingPeriod: true },
                        { id: 'period-2', label: 'คาบที่ 2', startTime: '09:30', endTime: '10:20', isTeachingPeriod: true },
                        { id: 'period-3', label: 'คาบที่ 3', startTime: '10:20', endTime: '11:10', isTeachingPeriod: true },
                        { id: 'period-4', label: 'คาบที่ 4', startTime: '11:10', endTime: '12:00', isTeachingPeriod: true },
                        { id: 'lunch', label: 'พักกลางวัน', startTime: '12:00', endTime: '13:00', isTeachingPeriod: false },
                        { id: 'period-5', label: 'คาบที่ 5', startTime: '13:00', endTime: '13:50', isTeachingPeriod: true },
                        { id: 'period-6', label: 'คาบที่ 6', startTime: '13:50', endTime: '14:40', isTeachingPeriod: true },
                        { id: 'period-7', label: 'คาบที่ 7', startTime: '14:40', endTime: '15:30', isTeachingPeriod: true },
                        { id: 'period-8', label: 'คาบที่ 8', startTime: '15:30', endTime: '16:00', isTeachingPeriod: true },
                    ];
                    setPeriodSettings(normalizePeriodSettings(defaultPeriods));
                }
            } catch (error) {
                console.error("Error fetching period settings: ", error);
            }
        };

        const fetchSchoolSettings = async () => {
            try {
                const schoolRef = doc(db, 'school-settings', currentSchoolId);
                const schoolSnap = await getDoc(schoolRef);

                let availableClasses: string[] = Object.keys(CLASSES);
                let opportunityExpansionLevel = '';
                let schoolType = '';

                if (schoolSnap.exists()) {
                    const data = schoolSnap.data();
                    opportunityExpansionLevel = data.opportunityExpansionLevel;
                    schoolType = data.schoolType;

                    // --- Smart Defaults based on User Request ---
                    let effectiveRange = opportunityExpansionLevel;
                    if (!effectiveRange && schoolType) {
                        if (schoolType === 'ประถม') effectiveRange = 'อ.1-ป.6';
                        else if (schoolType === 'ขยายโอกาส') effectiveRange = 'อ.1-ม.3';
                        else if (schoolType === 'มัธยมศึกษา') effectiveRange = 'ม.1-ม.6';
                    }

                    const levels = getLevelsByRange(effectiveRange || "");
                    const filteredLevels = Object.entries(CLASSES).filter(([_, val]) => levels.includes(val));

                    availableClasses = filteredLevels.map(([key]) => key);
                }

                setSchoolSettings({
                    schoolType,
                    opportunityExpansionLevel,
                    availableClasses
                });

            } catch (error) {
                console.error("Error fetching school settings: ", error);
                setSchoolSettings({
                    schoolType: '',
                    opportunityExpansionLevel: '',
                    availableClasses: Object.keys(CLASSES)
                });
            }
        };

        const fetchDefaultCalendar = async () => {
            // Logic moved to calendarSlice and consumed via useSelector
            // This function is kept for backward compatibility if other parts of fetchData need it
            // but it no longer sets local state
        };

        if (currentSchoolId) {
            await Promise.all([
                fetchCourses(),
                fetchAssignmentConstraints(),
                fetchSpecialPeriods(),
                fetchScheduleSettings(),
                fetchSchoolSettings(),
                fetchDefaultCalendar(),
                loadSchoolMasterSchedule(currentSchoolId)
            ]);
        }
    }, [loadSchoolMasterSchedule, academicTerm, academicYear, selectedSemester, selectedYear]);

    useEffect(() => {
        if (teacherMapStatus === 'idle' && schoolId) {
            dispatch(fetchTeachersMap(schoolId) as any);
        }
    }, [dispatch, teacherMapStatus, schoolId]);

    useEffect(() => {
        if (schoolId) {
            fetchData(schoolId);
        }
    }, [schoolId, fetchData]);

    return {
        availableCourseInstances, setAvailableCourseInstances,
        assignmentConstraints,
        allCourses, setAllCourses,
        specialPeriods, setSpecialPeriods,
        periodSettings, setPeriodSettings,
        schoolSettings, setSchoolSettings,
        schoolMasterSchedule, setSchoolMasterSchedule,
        teacherMasterSchedule, setTeacherMasterSchedule,
        schedule, setSchedule,
        academicYear,
        academicTerm,
        loadSchoolMasterSchedule,
        fetchData
    };
};
