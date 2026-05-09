import { useState, useCallback, useEffect } from 'react';
import { collection, getDocs, doc, getDoc } from 'firebase/firestore';
import { firestore as db } from '@/firebase';
import { useDispatch, useSelector } from 'react-redux';
import { fetchTeachersMap } from '@/store/slices/userMapSlice';
import { RootState } from '@/store';
import Swal from 'sweetalert2';
import { Course, CourseInstance, Schedule, SpecialPeriod, PeriodSetting, SchoolSettings, AssignmentConstraintMap } from '../types';
import { CLASSES } from '../utils';
import { getLevelsByRange } from '@/utils/schoolUtils';

export const useScheduleData = (schoolId: string | undefined) => {
    const [availableCourseInstances, setAvailableCourseInstances] = useState<CourseInstance[]>([]);
    const [allCourses, setAllCourses] = useState<Course[]>([]);
    const [specialPeriods, setSpecialPeriods] = useState<SpecialPeriod[]>([]);
    const [periodSettings, setPeriodSettings] = useState<PeriodSetting[]>([]);
    const [schoolSettings, setSchoolSettings] = useState<SchoolSettings>({
        schoolType: '',
        opportunityExpansionLevel: '',
        availableClasses: []
    });
    const [schoolMasterSchedule, setSchoolMasterSchedule] = useState<Record<string, { teacherId: string; classId: string | string[]; course: Course | null }[]>>({});
    const [teacherMasterSchedule, setTeacherMasterSchedule] = useState<Record<string, { classId: string | string[]; course: Course | null }>>({});
    const [schedule, setSchedule] = useState<Schedule>({});
    const [academicYear, setAcademicYear] = useState<string>('');
    const [academicTerm, setAcademicTerm] = useState<string>('1');
    const [assignmentConstraints, setAssignmentConstraints] = useState<AssignmentConstraintMap>({});

    const dispatch = useDispatch();
    const { teachers: teacherMap, status: teacherMapStatus } = useSelector((state: RootState) => state.userMap);

    const loadSchoolMasterSchedule = useCallback(async (currentSchoolId: string) => {
        const masterSchedule: Record<string, { teacherId: string; classId: string | string[]; course: Course | null }[]> = {};
        const schedulesCollectionRef = collection(db, 'school-settings', currentSchoolId, 'schedules');
        const querySnapshot = await getDocs(schedulesCollectionRef);

        querySnapshot.forEach((doc) => {
            const data = doc.data();
            const teacherId = data.teacherId;
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
                        // Strict check: only include if the teacher is actually assigned
                        if (!teacherId || teacherId === 'pending' || teacherId.startsWith('GHOST')) return;

                        // Priority: course instance data > teacher-level data
                        const resolvedClassId = course.classId || data.classId;
                        const resolvedRoom = course.room || data.room || [];
                        
                        masterSchedule[slot].push({ 
                            teacherId, 
                            classId: resolvedClassId, 
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
    }, []);

    const fetchData = useCallback(async (currentSchoolId: string) => {
        const fetchCourses = async () => {
            try {
                const coursesCollectionRef = collection(db, 'school-settings', currentSchoolId, 'courses');
                const querySnapshot = await getDocs(coursesCollectionRef);
                const coursesData = querySnapshot.docs
                    .map(doc => ({ id: doc.id, ...doc.data() } as Course))
                    .filter(c => c.isActive !== false);

                setAllCourses(coursesData);
                
                // --- Flattening logic (Senior Level) ---
                const flattened: CourseInstance[] = [];
                coursesData.forEach(course => {
                    if (course.teacherAssignments && course.teacherAssignments.length > 0) {
                        course.teacherAssignments.forEach((asgn, idx) => {
                            // Filter out assignments without a valid teacher
                            if (!asgn.teacherId || asgn.teacherId === 'pending' || asgn.teacherId.startsWith('GHOST')) return;

                            flattened.push({
                                ...course,
                                instanceId: `${course.id}_${asgn.groupNumber || idx + 1}`,
                                compositeId: `${course.id}_${asgn.groupNumber || idx + 1}`,
                                groupNumber: asgn.groupNumber || idx + 1,
                                teacherId: asgn.teacherId,
                                room: asgn.roomIds || course.room,
                                classId: asgn.classLevels && asgn.classLevels.length > 0 ? asgn.classLevels : course.classId
                            } as CourseInstance);
                        });
                    } else {
                        // Fallback: only include if the course itself has a valid teacher assigned
                        const tId = course.teacherId || (course.teacherIds && course.teacherIds[0]);
                        if (tId && tId !== 'pending' && !tId.startsWith('GHOST')) {
                            flattened.push({ 
                                ...course, 
                                instanceId: course.id,
                                compositeId: course.id,
                                groupNumber: 1
                            } as CourseInstance);
                        }
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
                        setPeriodSettings(data.periods);
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
                    setPeriodSettings(defaultPeriods);
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
            try {
                const calendarRef = doc(db, 'school-settings', currentSchoolId, 'main_calendar', 'default');
                const calendarSnap = await getDoc(calendarRef);
                if (calendarSnap.exists()) {
                    const data = calendarSnap.data();
                    if (data.academicYear) {
                        setAcademicYear(data.academicYear);
                    } else {
                        const currentYear = new Date().getFullYear() + 543;
                        setAcademicYear(currentYear.toString());
                    }

                    // Determine current term based on date
                    const today = new Date().toISOString().split('T')[0];
                    const term1 = data.terms?.term1;
                    const term2 = data.terms?.term2;
                    
                    if (term1?.startDate && term1?.endDate && today >= term1.startDate && today <= term1.endDate) {
                        setAcademicTerm('1');
                    } else if (term2?.startDate && term2?.endDate && today >= term2.startDate && today <= term2.endDate) {
                        setAcademicTerm('2');
                    } else {
                        // If not in specific range, check if terms even exist
                        if (data.terms) {
                             // Maybe we are between terms? Default to the closer one or just '1'
                             setAcademicTerm('1');
                        } else {
                             setAcademicTerm('1');
                        }
                    }
                } else {
                    const currentYear = new Date().getFullYear() + 543;
                    setAcademicYear(currentYear.toString());
                    setAcademicTerm('1');
                }
            } catch (error) {
                console.error("Error fetching academic year: ", error);
            }
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
    }, [loadSchoolMasterSchedule]);

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
        academicYear, setAcademicYear,
        academicTerm, setAcademicTerm,
        loadSchoolMasterSchedule,
        fetchData
    };
};
