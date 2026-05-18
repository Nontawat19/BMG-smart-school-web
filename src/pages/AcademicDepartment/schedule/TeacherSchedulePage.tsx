import React, { useState, useMemo, useRef, useCallback, useEffect } from 'react';
import { collection, getDocs, onSnapshot, query, orderBy } from 'firebase/firestore';
import { firestore as db } from '@/firebase';
import { DndContext, DragOverlay, PointerSensor, TouchSensor, useSensor, useSensors, closestCenter, defaultDropAnimationSideEffects } from '@dnd-kit/core';
import { restrictToWindowEdges } from '@dnd-kit/modifiers';
<<<<<<< HEAD
import { useDispatch, useSelector } from 'react-redux';
import { RootState, AppDispatch } from '@/store';
import { useTheme } from '@/ThemeContext';
import { fetchCalendar } from '@/store/slices/calendarSlice';
import Swal from 'sweetalert2';
import MainLayout from "@/layouts/MainLayout";
=======
import { Link } from 'react-router-dom';
import { useSelector } from 'react-redux';
import { RootState } from '@/store';
import { useTheme } from '@/ThemeContext';
import { Cpu, X, Zap, ChevronDown, Trash2, ArrowLeft, Calendar, Settings, Lock, BookOpen, ChevronLeft, ChevronRight, Layers, Save, Loader2 } from 'lucide-react';
import Select from 'react-select';
import Swal from 'sweetalert2';
import MainLayout from "@/layouts/MainLayout";
import { TeacherSelect } from './components/TeacherSelect';
>>>>>>> 5f8c7e1 (feat: optimize auto-scheduler and update UI labels)
import { Course, CourseInstance, Schedule, Teacher } from './types';
import { CLASSES, getClassDisplayName, isAcademicCourse } from './utils';
import { CourseCard } from './components/CourseCard';
import { TimetableGrid } from './components/TimetableGrid';
<<<<<<< HEAD
import { TeacherScheduleHeader } from './components/TeacherScheduleHeader';
import { TeacherScheduleControlPanel } from './components/TeacherScheduleControlPanel';
import { SchedulePreviewActions } from './components/SchedulePreviewActions';
import { HoveredSlotTooltip } from './components/HoveredSlotTooltip';
=======
import { DraggableCourse } from './components/DraggableCourse';

// Hooks
>>>>>>> 5f8c7e1 (feat: optimize auto-scheduler and update UI labels)
import { useScheduleData } from './hooks/useScheduleData';
import { useSmartMove } from './hooks/useSmartMove';
import { useScheduleActions } from './hooks/useScheduleActions';
import { useDragAndDrop } from './hooks/useDragAndDrop';
<<<<<<< HEAD
import { getCurrentThaiYear } from '@/utils/dateUtils';

const getRequiredWeeklyPeriods = (course: Pick<Course, 'credits' | 'hoursPerWeek'>) => {
    const hours = Number(course.hoursPerWeek || 0);
    if (hours > 0) return Math.round(hours);
    const credits = Number(course.credits || 0);
    return credits > 0 ? Math.round(credits * 2) : 1;
};

const TeacherSchedulePage: React.FC = () => {
    const { isDarkMode } = useTheme();
    const dispatch = useDispatch<AppDispatch>();
    const currentUser = useSelector((state: RootState) => state.auth.user);
    const schoolId = (currentUser as any)?.schoolId;
    const calendarState = useSelector((state: RootState) => state.calendar);
    const { teachers: teacherMap } = useSelector((state: RootState) => state.userMap);
    const teachers = useMemo<Teacher[]>(() => {
        return (Object.values(teacherMap || {}) as Teacher[]).sort((a, b) => {
            const nameA = `${a.title || ''}${a.firstName || ''} ${a.lastName || ''}`.trim();
            const nameB = `${b.title || ''}${b.firstName || ''} ${b.lastName || ''}`.trim();
            return nameA.localeCompare(nameB, 'th');
        });
    }, [teacherMap]);

=======

const TeacherSchedulePage: React.FC = () => {
    const { isDarkMode } = useTheme();
    const currentUser = useSelector((state: RootState) => state.auth.user);
    const schoolId = (currentUser as any)?.schoolId;
    const { teachers: teacherMap } = useSelector((state: RootState) => state.userMap);
    const teachers = useMemo<Teacher[]>(() => Object.values(teacherMap || {}) as Teacher[], [teacherMap]);

    // Local UI State
>>>>>>> 5f8c7e1 (feat: optimize auto-scheduler and update UI labels)
    const [selectedTeacher, setSelectedTeacher] = useState<string>('');
    const [selectedYear, setSelectedYear] = useState<string>('');
    const [selectedSemester, setSelectedSemester] = useState<string>("1");
    const [availableYears, setAvailableYears] = useState<string[]>([]);
    const [filterClass, setFilterClass] = useState<string>('all');
    const [filterRoom, setFilterRoom] = useState<string>('all'); // Group
    const [filterPhysicalRoom, setFilterPhysicalRoom] = useState<string>('all');
    const [physicalRooms, setPhysicalRooms] = useState<any[]>([]);
    const [searchTerm, setSearchTerm] = useState<string>('');
    const [activeDragItem, setActiveDragItem] = useState<CourseInstance | null>(null);
    const [isSaving, setIsSaving] = useState(false);
    const [isAutoScheduling, setIsAutoScheduling] = useState(false);
    const [, setSchedulingMetrics] = useState<any>(null);
    const [dynamicUnavailableSlots, setDynamicUnavailableSlots] = useState<string[]>([]);
    const [localUnavailableSlotsMap, setLocalUnavailableSlotsMap] = useState<Record<string, string[]>>({});
    const [hoveredSlot, setHoveredSlot] = useState<any>(null);
    const scheduleSectionRef = useRef<HTMLDivElement>(null);

<<<<<<< HEAD
=======
    // Custom Hooks
>>>>>>> 5f8c7e1 (feat: optimize auto-scheduler and update UI labels)
    const {
        availableCourseInstances, setAvailableCourseInstances,
        allCourses,
        specialPeriods,
        periodSettings,
        schoolSettings,
        schoolMasterSchedule,
        fetchData,
        schedule, setSchedule,
        academicYear, academicTerm,
        loadSchoolMasterSchedule,
        assignmentConstraints
<<<<<<< HEAD
    } = useScheduleData(schoolId, selectedYear, selectedSemester);
=======
    } = useScheduleData(schoolId);
>>>>>>> 5f8c7e1 (feat: optimize auto-scheduler and update UI labels)

    const hasSetDefaults = useRef(false);

    useEffect(() => {
<<<<<<< HEAD
        if (schoolId && calendarState.status === 'idle') {
            dispatch(fetchCalendar(schoolId));
        }
    }, [schoolId, calendarState.status, dispatch]);

    useEffect(() => {
        const fetchYears = async () => {
            if (!schoolId) return;
            try {
                if (calendarState.status === 'succeeded') {
                    const currentYear = calendarState.academicYear;
                    const currentTerm = calendarState.rawData?.currentTerm || "1";

                    if (!hasSetDefaults.current) {
                        setSelectedYear(currentYear);
                        setSelectedSemester(currentTerm);
                        hasSetDefaults.current = true;
                    }
                }

=======
        const fetchYears = async () => {
            if (!schoolId) return;
            try {
>>>>>>> 5f8c7e1 (feat: optimize auto-scheduler and update UI labels)
                const calendarRef = collection(db, 'school-settings', schoolId, 'main_calendar');
                const querySnapshot = await getDocs(calendarRef);
                const years = querySnapshot.docs
                    .map(doc => doc.id)
                    .filter(id => id !== 'default')
                    .sort((a, b) => parseInt(b) - parseInt(a));

<<<<<<< HEAD
                let finalYears = years;
                if (finalYears.length === 0) {
                    const current = getCurrentThaiYear();
=======
                // If no years found, generate some defaults
                let finalYears = years;
                if (finalYears.length === 0) {
                    const current = new Date().getFullYear() + 543;
>>>>>>> 5f8c7e1 (feat: optimize auto-scheduler and update UI labels)
                    finalYears = [];
                    for (let i = 0; i < 5; i++) {
                        finalYears.push((current - i).toString());
                    }
                }
                
<<<<<<< HEAD
                if (calendarState.academicYear && !finalYears.includes(calendarState.academicYear)) {
                    finalYears.push(calendarState.academicYear);
=======
                // Add academicYear if not in list
                if (academicYear && !finalYears.includes(academicYear)) {
                    finalYears.push(academicYear);
>>>>>>> 5f8c7e1 (feat: optimize auto-scheduler and update UI labels)
                    finalYears.sort((a, b) => parseInt(b) - parseInt(a));
                }

                setAvailableYears(finalYears);
<<<<<<< HEAD
=======
                
                // Apply defaults only once when data is ready
                if (!hasSetDefaults.current && (academicYear !== '' || academicTerm !== '')) {
                    if (academicYear !== '') {
                        setSelectedYear(academicYear);
                    } else if (finalYears.length > 0) {
                        setSelectedYear(finalYears[0]);
                    }
                    
                    if (academicTerm !== '') {
                        setSelectedSemester(academicTerm);
                    }
                    
                    // Only lock the defaults if we actually had a real value to set
                    if (academicYear !== '') {
                        hasSetDefaults.current = true;
                    }
                }
>>>>>>> 5f8c7e1 (feat: optimize auto-scheduler and update UI labels)
            } catch (error) {
                console.error("Error fetching years:", error);
            }
        };
        fetchYears();
<<<<<<< HEAD
    }, [schoolId, calendarState.status, calendarState.academicYear, calendarState.rawData]);
=======
    }, [schoolId, academicYear, academicTerm]);
>>>>>>> 5f8c7e1 (feat: optimize auto-scheduler and update UI labels)

    useEffect(() => {
        if (!schoolId) return;
        const q = query(collection(db, 'school-settings', schoolId, 'physical-rooms'), orderBy('roomName', 'asc'));
        const unsubscribe = onSnapshot(q, (snapshot) => {
            setPhysicalRooms(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
        });
        return () => unsubscribe();
    }, [schoolId]);

    const {
        handleSaveSchedule,
        handleGenerateSchoolTimetable,
        handleAutoScheduleForTeacherAndClasses,
        handleClearAllTeachersSchedules
    } = useScheduleActions({
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
        loadTeacherMasterSchedule: async () => { if (schoolId) await fetchData(schoolId); },
        schoolSettings,
        scheduleSectionRef,
        assignmentConstraints
    });

    useSmartMove({
        schoolId,
        selectedTeacher,
        schedule,
        availableCourseInstances,
        fetchData,
        loadTeacherMasterSchedule: () => fetchData(schoolId!)
    });

    const selectedTeacherData = teachers.find((t: Teacher) => t.id === selectedTeacher);

    const {
        handleDragStart,
        handleDragEnd, 
        toggleLock, 
        handleRemoveCourse,
        handleManualAdd
    } = useDragAndDrop({
        schedule,
        setSchedule,
        availableCourseInstances,
        setAvailableCourseInstances,
        schoolMasterSchedule,
        selectedTeacher,
        selectedTeacherData,
        teacherMap,
        selectedSemester,
        periodSettings,
        specialPeriods,
        dynamicUnavailableSlots,
        setActiveDragItem,
        assignmentConstraints
    });

    const roomMap = useMemo(() => {
        const map: Record<string, string> = {};
        physicalRooms.forEach(r => {
            map[r.id] = r.roomName;
        });
        return map;
    }, [physicalRooms]);

<<<<<<< HEAD
=======
    // Sync Schedule when teacher changes
>>>>>>> 5f8c7e1 (feat: optimize auto-scheduler and update UI labels)
    useEffect(() => {
        if (!selectedTeacher || !schoolId) {
            setSchedule({});
            setAvailableCourseInstances([]);
            setDynamicUnavailableSlots([]);
            return;
        }

        const cachedSlots = localUnavailableSlotsMap[selectedTeacher];
        if (cachedSlots) {
            setDynamicUnavailableSlots(cachedSlots);
        } else if (selectedTeacherData?.preferences?.unavailableSlots) {
            setDynamicUnavailableSlots(selectedTeacherData.preferences.unavailableSlots);
        } else {
            setDynamicUnavailableSlots([]);
        }

        const consolidatedSchedule: Schedule = {};
        Object.entries(schoolMasterSchedule).forEach(([slotId, occupancies]: [string, any[]]) => {
            const teacherOccupancies = occupancies.filter((occ: any) => occ.teacherId === selectedTeacher);
            teacherOccupancies.forEach((teacherOcc: any) => {
                if (teacherOcc.course) {
                    const courseDoc = allCourses.find(c => c.id === teacherOcc.course?.id);
                    const groupNum = teacherOcc.course?.groupNumber || 1;
                    const assign = courseDoc?.teacherAssignments?.find(a => a.teacherId === selectedTeacher && a.groupNumber === groupNum);

                    const courseData = {
                        ...(courseDoc || {}),
                        ...(teacherOcc.course || {}),
                        room: (assign?.roomIds && assign.roomIds.length > 0) ? assign.roomIds : (teacherOcc.course?.room || courseDoc?.room || []),
                        locked: teacherOcc.course.locked || courseDoc?.locked || false
                    } as Course;

                    const roomIds = courseData.room || [];
                    const roomDisplay = roomIds.length > 0 && !roomIds.includes('all')
                        ? roomIds.map((id: string) => roomMap[id] || id).join(', ')
                        : '';

                    const existing = (consolidatedSchedule[slotId] || []).find(inst => inst.id === courseData.id && inst.groupNumber === groupNum);
                    if (existing) {
                        const existingClasses = Array.isArray(existing.classId) ? existing.classId : [existing.classId].filter(Boolean) as string[];
                        const newClassId = teacherOcc.classId;
                        const classesToAdd = Array.isArray(newClassId) ? newClassId : [newClassId].filter(Boolean) as string[];
                        classesToAdd.forEach(id => { if (!existingClasses.includes(id)) existingClasses.push(id); });
                        existing.classId = existingClasses;
                        existing.className = existingClasses.map(getClassDisplayName).join(' + ');
                    } else {
                        const resolvedTeacherId = assign?.teacherId || teacherOcc.teacherId;
                        const newInstance: CourseInstance = {
                            ...courseData,
                            teacherId: resolvedTeacherId,
                            instanceId: `${courseData.id}-${slotId}`,
                            compositeId: `${courseData.id}_${groupNum}`,
                            groupNumber: groupNum,
                            roomDisplay,
                            className: Array.isArray(teacherOcc.classId)
                                ? teacherOcc.classId.map(getClassDisplayName).join(' + ')
                                : getClassDisplayName(teacherOcc.classId as string)
                        };
                        if (!consolidatedSchedule[slotId]) consolidatedSchedule[slotId] = [];
                        consolidatedSchedule[slotId].push(newInstance);
                    }
                }
            });
        });

        setSchedule(consolidatedSchedule);

        const teacherCourses = allCourses.filter((c: Course) => {
            const isAssignedToTeacher = c.teacherAssignments?.some((a: any) => a.teacherId === selectedTeacher);
            const hasLegacyTeacher = c.teacherId === selectedTeacher || c.teacherIds?.includes(selectedTeacher);
            const hasTeacher = isAssignedToTeacher || (c.teacherAssignments?.length === 0 && hasLegacyTeacher);
            
<<<<<<< HEAD
=======
            // Strict check: selectedTeacher must be a valid ID and must be the one assigned
>>>>>>> 5f8c7e1 (feat: optimize auto-scheduler and update UI labels)
            const isGhost = !selectedTeacher || selectedTeacher === 'pending' || selectedTeacher.startsWith('GHOST');
            if (isGhost) return false;

            const semStr = String(c.semester || "");
            const targetSem = String(selectedSemester || "1");
            const isCorrectSemester = (!c.semester || semStr === targetSem || semStr.startsWith(targetSem + '/') || targetSem.startsWith(semStr + '/'));

            if (!hasTeacher || !isCorrectSemester || !isAcademicCourse(c)) return false;

            if (filterClass !== 'all') {
                const classIds = Array.isArray(c.classId) ? c.classId : [c.classId].filter(Boolean) as string[];
                const assignedClasses = c.teacherAssignments?.filter(a => a.teacherId === selectedTeacher).flatMap(a => a.classLevels || []) || [];
                const allAssociatedClasses = [...classIds, ...assignedClasses];
                const isMatch = allAssociatedClasses.some(id => id === filterClass || id.startsWith(filterClass + '/'));
                if (!isMatch) return false;
            }

            if (filterRoom !== 'all') {
                const groups = c.teacherAssignments?.filter(a => a.teacherId === selectedTeacher).map(a => String(a.groupNumber)) || [];
                if (!groups.includes(filterRoom)) return false;
            }

            if (searchTerm) {
                const searchLower = searchTerm.toLowerCase();
                const match = (c.code || "").toLowerCase().includes(searchLower) || (c.title || "").toLowerCase().includes(searchLower);
                if (!match) return false;
            }

            return true;
        });

        const bank: CourseInstance[] = [];
        teacherCourses.forEach((course: Course) => {
<<<<<<< HEAD
            const totalHours = getRequiredWeeklyPeriods(course);
=======
            // Standard Thai Education: 0.5 credits = 1 period, 1.0 credits = 2 periods...
            // Standard formula: periods = credits * 2
            const standardPeriods = course.credits ? Math.round(Number(course.credits) * 2) : 0;
            const totalHours = Math.max(course.hoursPerWeek || 0, standardPeriods) || 1;
>>>>>>> 5f8c7e1 (feat: optimize auto-scheduler and update UI labels)
            const relevantAssignments = course.teacherAssignments?.filter((a: any) => a.teacherId === selectedTeacher) || [];

            if (relevantAssignments.length === 0 && (course.teacherId === selectedTeacher || course.teacherIds?.includes(selectedTeacher))) {
                relevantAssignments.push({
                    groupNumber: 1,
                    teacherId: selectedTeacher,
                    roomIds: [],
                    classLevels: []
                });
            }

            relevantAssignments.forEach((assign: any) => {
                const groupNum = assign.groupNumber || 1;
                if (filterRoom !== 'all' && String(groupNum) !== filterRoom) return;

                let scheduledCount = 0;
                // Use the current local schedule if it's already loaded for this teacher
                const targetSchedule = (Object.keys(schedule).length > 0) ? schedule : consolidatedSchedule;
                Object.values(targetSchedule).forEach(slots => {
                    scheduledCount += slots.filter(inst => inst.id === course.id && inst.groupNumber === groupNum).length;
                });

                const roomIds = (assign.roomIds && assign.roomIds.length > 0) ? assign.roomIds : (course.room || []);
                const roomDisplay = roomIds.length > 0 && !roomIds.includes('all')
                    ? roomIds.map((id: string) => roomMap[id] || id).join(', ')
                    : '';

<<<<<<< HEAD
                const totalHours = getRequiredWeeklyPeriods(course);
=======
                const standardPeriods = course.credits ? Math.round(Number(course.credits) * 2) : 0;
                const totalHours = standardPeriods > 0 ? standardPeriods : (course.hoursPerWeek || 1);
>>>>>>> 5f8c7e1 (feat: optimize auto-scheduler and update UI labels)

                const remaining = Math.max(0, totalHours - scheduledCount);
                for (let i = 0; i < remaining; i++) {
                    bank.push({
                        ...course,
<<<<<<< HEAD
                        teacherId: selectedTeacher,
=======
                        teacherId: selectedTeacher, // Ensure teacherId is set correctly
>>>>>>> 5f8c7e1 (feat: optimize auto-scheduler and update UI labels)
                        room: roomIds,
                        roomDisplay,
                        instanceId: `${course.id}-bank-${groupNum}-${Date.now()}-${i}`,
                        compositeId: `${course.id}_${groupNum}`,
                        groupNumber: groupNum,
                        locked: false
                    } as CourseInstance);
                }
            });
        });
        setAvailableCourseInstances(bank);
    }, [selectedTeacher, selectedSemester, schoolId, teachers, allCourses, schoolMasterSchedule, selectedTeacherData, setSchedule, setAvailableCourseInstances, localUnavailableSlotsMap, filterClass, filterRoom, searchTerm]);

    const saveTeacherUnavailableSlots = useCallback(async (teacherId: string, slots: string[]) => {
        if (!schoolId || !teacherId) return;
        try {
            const { doc, setDoc } = await import('firebase/firestore');
            const teacherRef = doc(db, 'school-settings', schoolId, 'teachers', teacherId);
            await setDoc(teacherRef, {
                preferences: { unavailableSlots: slots }
            }, { merge: true });
        } catch (error) {
            console.error("Error saving teacher preferences:", error);
        }
    }, [schoolId]);

    const roomSchedule = useMemo(() => {
        if (filterPhysicalRoom === 'all') return {};
        const filtered: Schedule = {};

        const addCourseToSlot = (slot: string, course: CourseInstance) => {
            if (!filtered[slot]) filtered[slot] = [];
            const existing = filtered[slot].find(c => c.id === course.id && c.teacherId === course.teacherId && c.groupNumber === course.groupNumber);
            if (existing) {
                const existingClasses = Array.isArray(existing.classId) ? existing.classId : [existing.classId].filter(Boolean) as string[];
                const newClasses = Array.isArray(course.classId) ? course.classId : [course.classId].filter(Boolean) as string[];
                newClasses.forEach(id => { if (!existingClasses.includes(id)) existingClasses.push(id); });
                existing.classId = existingClasses;
                existing.className = existingClasses.map(getClassDisplayName).join(' + ');
            } else {
                filtered[slot].push({ ...course });
            }
        };

<<<<<<< HEAD
=======
        // 1. Static occupancy from other teachers
>>>>>>> 5f8c7e1 (feat: optimize auto-scheduler and update UI labels)
        Object.entries(schoolMasterSchedule).forEach(([slot, items]) => {
            items.forEach(item => {
                if (item.teacherId === selectedTeacher) return;
                const roomVal = item.course?.room;
                if (!roomVal) return;
                const hasMatch = Array.isArray(roomVal) ? roomVal.includes(filterPhysicalRoom) : String(roomVal) === filterPhysicalRoom;
                if (hasMatch && item.course) {
                    addCourseToSlot(slot, {
                        ...item.course,
                        teacherId: item.teacherId,
                        classId: item.classId,
                        instanceId: `global-${item.course.id}-${item.teacherId}-${slot}`
                    } as CourseInstance);
                }
            });
        });

<<<<<<< HEAD
=======
        // 2. Live occupancy from current teacher's local moves
>>>>>>> 5f8c7e1 (feat: optimize auto-scheduler and update UI labels)
        Object.entries(schedule).forEach(([slot, items]) => {
            items.forEach(item => {
                const roomVal = item.room;
                if (!roomVal) return;
                const hasMatch = Array.isArray(roomVal) ? roomVal.includes(filterPhysicalRoom) : String(roomVal) === filterPhysicalRoom;
                if (hasMatch) addCourseToSlot(slot, item);
            });
        });

        return filtered;
    }, [schoolMasterSchedule, filterPhysicalRoom, schedule, selectedTeacher]);

    const classSchedule = useMemo(() => {
        if (filterClass === 'all') return {};
        const filtered: Schedule = {};

        const isMatch = (targetClass: string | string[] | undefined) => {
            if (!targetClass) return false;
            const targets = Array.isArray(targetClass) ? targetClass : [targetClass];
            return targets.some(t => t === filterClass || t.startsWith(filterClass + '/'));
        };

        const addCourseToSlot = (slot: string, course: CourseInstance) => {
            if (!filtered[slot]) filtered[slot] = [];
            const existing = filtered[slot].find(c => c.id === course.id && c.teacherId === course.teacherId && c.groupNumber === course.groupNumber);
            if (existing) {
                const existingClasses = Array.isArray(existing.classId) ? existing.classId : [existing.classId].filter(Boolean) as string[];
                const newClasses = Array.isArray(course.classId) ? course.classId : [course.classId].filter(Boolean) as string[];
                newClasses.forEach(id => { if (!existingClasses.includes(id)) existingClasses.push(id); });
                existing.classId = existingClasses;
                existing.className = existingClasses.map(getClassDisplayName).join(' + ');
            } else {
                filtered[slot].push({ ...course });
            }
        };

<<<<<<< HEAD
=======
        // 1. Static occupancy from other teachers
>>>>>>> 5f8c7e1 (feat: optimize auto-scheduler and update UI labels)
        Object.entries(schoolMasterSchedule).forEach(([slot, items]) => {
            items.forEach(item => {
                if (item.teacherId === selectedTeacher) return;
                const matchesGroup = filterRoom === 'all' || String(item.course?.groupNumber || 1) === filterRoom;
                if (isMatch(item.classId) && item.course && matchesGroup) {
                    const groupNumber = item.course.groupNumber || 1;
                    const courseDoc = allCourses.find(c => c.id === item.course?.id);
                    const currentAssign = courseDoc?.teacherAssignments?.find(a => a.groupNumber === groupNumber);
                    const resolvedTeacherId = currentAssign?.teacherId || item.teacherId;

                    addCourseToSlot(slot, {
                        ...item.course,
                        teacherId: resolvedTeacherId,
                        classId: item.classId,
                        groupNumber: groupNumber,
                        instanceId: `global-${item.course.id}-${item.teacherId}-${slot}`
                    } as CourseInstance);
                }
            });
        });

<<<<<<< HEAD
=======
        // 2. Live occupancy from current teacher's local moves
>>>>>>> 5f8c7e1 (feat: optimize auto-scheduler and update UI labels)
        Object.entries(schedule).forEach(([slot, items]) => {
            items.forEach(item => {
                const matchesGroup = filterRoom === 'all' || String(item.groupNumber || 1) === filterRoom;
                if (isMatch(item.classId) && matchesGroup) addCourseToSlot(slot, item);
            });
        });

        return filtered;
    }, [schoolMasterSchedule, filterClass, filterRoom, schedule, selectedTeacher]);

    const selectedPhysicalRoomName = useMemo(() => {
        if (filterPhysicalRoom === 'all') return '';
        const room = physicalRooms.find(r => r.id === filterPhysicalRoom);
        return room ? `${room.roomName} ${room.roomCode ? `(${room.roomCode})` : ''}` : '';
    }, [filterPhysicalRoom, physicalRooms]);

    const sensors = useSensors(
        useSensor(PointerSensor, { activationConstraint: { distance: 3 } }),
        useSensor(TouchSensor, { activationConstraint: { delay: 250, tolerance: 8 } })
    );


    const allDroppableIds = useMemo(() => {
        const ids: string[] = [];
        ['mon', 'tue', 'wed', 'thu', 'fri'].forEach(d => {
            for (let i = 0; i < 10; i++) ids.push(`${d}-${i}`);
        });
        return ids;
    }, []);

    const handleClearAllSchedules = () => {
        handleClearAllTeachersSchedules();
    };

    return (
        <DndContext
            sensors={sensors}
            onDragStart={handleDragStart}
            onDragEnd={handleDragEnd}
            collisionDetection={closestCenter}
            modifiers={[restrictToWindowEdges]}
        >
            <MainLayout>
                <div className="flex flex-col bg-gray-50/50 dark:bg-[#1a1b1e] text-gray-900 dark:text-white transition-colors duration-300 font-inter select-none custom-scrollbar">

<<<<<<< HEAD
                    <TeacherScheduleHeader
                        selectedYear={selectedYear}
                        availableYears={availableYears}
                        selectedSemester={selectedSemester}
                        isSaving={isSaving}
                        setSelectedYear={setSelectedYear}
                        setSelectedSemester={setSelectedSemester}
                        handleSaveSchedule={handleSaveSchedule}
                    />

                    <main className="max-w-[1600px] mx-auto w-full px-6 pt-2 pb-6 space-y-6">
                        <TeacherScheduleControlPanel
                            isDarkMode={isDarkMode}
                            allCourses={allCourses}
                            availableCourseInstances={availableCourseInstances}
                            teachers={teachers}
                            selectedTeacher={selectedTeacher}
                            selectedSemester={selectedSemester}
                            filterClass={filterClass}
                            filterRoom={filterRoom}
                            filterPhysicalRoom={filterPhysicalRoom}
                            physicalRooms={physicalRooms}
                            searchTerm={searchTerm}
                            schoolSettings={schoolSettings}
                            setSearchTerm={setSearchTerm}
                            setSelectedTeacher={setSelectedTeacher}
                            setSchedule={setSchedule}
                            setFilterClass={setFilterClass}
                            setFilterRoom={setFilterRoom}
                            setFilterPhysicalRoom={setFilterPhysicalRoom}
                        />

                        <SchedulePreviewActions
                            selectedTeacher={selectedTeacher}
                            isAutoScheduling={isAutoScheduling}
                            handleRemoveCourse={handleRemoveCourse}
                            handleClearAllSchedules={handleClearAllSchedules}
                            handleAutoScheduleForTeacherAndClasses={handleAutoScheduleForTeacherAndClasses}
                            handleGenerateSchoolTimetable={handleGenerateSchoolTimetable}
                        />
=======
                    <header className="sticky top-[60px] z-40 bg-white/80 dark:bg-[#2a2b2f]/80 backdrop-blur-2xl border-b border-gray-100 dark:border-white/5 shadow-sm px-6 py-2 transition-all">
                        <div className="max-w-[1600px] mx-auto flex items-center justify-between">
                            <div className="flex items-center gap-6">
                                <div className="flex items-center gap-4">
                                    <Link to="/academic-department" className="w-10 h-10 rounded-full bg-gray-100 dark:bg-white/[0.03] border border-gray-200 dark:border-white/5 flex items-center justify-center text-gray-500 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-white/[0.08] hover:text-gray-900 dark:hover:text-white transition-all">
                                        <ArrowLeft size={20} />
                                    </Link>
                                    <div className="flex items-center gap-3 group cursor-pointer">
                                        <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-indigo-600 to-violet-700 flex items-center justify-center shadow-[0_0_20px_rgba(79,70,229,0.4)] border border-white/10 group-hover:rotate-6 transition-transform">
                                            <Calendar size={22} className="text-white" />
                                        </div>
                                        <div className="flex flex-col">
                                            <h1 className="text-xl font-black tracking-tight text-gray-900 dark:text-white uppercase leading-none">ระบบจัดตารางสอนอัจฉริยะ</h1>
                                            <div className="flex items-center gap-2 mt-1.5">
                                                <span className="text-[10px] font-black text-gray-700 dark:text-gray-400 uppercase tracking-[0.25em]">Academic Management Console</span>
                                                <span className="w-1 h-1 rounded-full bg-gray-700"></span>
                                                <div className="flex items-center gap-1.5">
                                                    <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></div>
                                                    <span className="text-[9px] font-black text-emerald-500 uppercase tracking-widest leading-none">System Operational</span>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            <div className="flex items-center gap-4">
                                <div className="flex items-center gap-4 bg-gray-50/80 dark:bg-white/[0.03] backdrop-blur-xl border border-gray-100 dark:border-white/5 rounded-[16px] px-4 py-1 shadow-sm">
                                    <div className="flex items-center gap-3">
                                        <div className="flex flex-col">
                                            <span className="text-[8px] font-black text-gray-400 dark:text-gray-500 uppercase tracking-[0.2em] leading-none mb-0.5">ปีการศึกษา</span>
                                            <div className="relative group min-w-[80px]">
                                                <select
                                                    value={selectedYear}
                                                    onChange={(e) => setSelectedYear(e.target.value)}
                                                    className="bg-transparent text-xs font-black text-gray-900 dark:text-white focus:outline-none cursor-pointer appearance-none pr-6 w-full"
                                                >
                                                    {availableYears.map(year => (
                                                        <option key={year} value={year} className="bg-white dark:bg-[#2a2b2f] text-gray-900 dark:text-white py-2">
                                                            ปี {year}
                                                        </option>
                                                    ))}
                                                </select>
                                                <ChevronDown size={12} className="absolute right-0 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
                                            </div>
                                        </div>
                                    </div>
                                    <div className="w-[1px] h-7 bg-gray-100 dark:bg-white/5 mx-1"></div>
                                    <div className="flex items-center gap-3">
                                        <div className="flex flex-col">
                                            <span className="text-[8px] font-black text-gray-400 dark:text-gray-500 uppercase tracking-[0.2em] leading-none mb-0.5">ภาคเรียน</span>
                                            <div className="relative group min-w-[90px]">
                                                <select
                                                    value={selectedSemester}
                                                    onChange={(e) => setSelectedSemester(e.target.value)}
                                                    className="bg-transparent text-xs font-black text-gray-900 dark:text-white focus:outline-none cursor-pointer appearance-none pr-6 w-full"
                                                >
                                                    <option value="1" className="bg-white dark:bg-[#2a2b2f] text-gray-900 dark:text-white">เทอม 1</option>
                                                    <option value="2" className="bg-white dark:bg-[#2a2b2f] text-gray-900 dark:text-white">เทอม 2</option>
                                                </select>
                                                <ChevronDown size={12} className="absolute right-0 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
                                            </div>
                                        </div>
                                    </div>
                                </div>
                                <Link to="/academic/period-constraints" className="flex items-center gap-3 px-6 py-2.5 rounded-2xl bg-gray-100 dark:bg-white/[0.03] border border-gray-200 dark:border-white/5 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-white/[0.08] transition-all text-[10px] font-black uppercase tracking-widest h-[44px]">
                                    <Settings size={16} />
                                    <span>ตั้งค่าคาบคู่ / เดี่ยว</span>
                                </Link>

                                <button 
                                    onClick={handleSaveSchedule}
                                    disabled={isSaving}
                                    className="flex items-center gap-3 px-8 py-2.5 rounded-2xl bg-gradient-to-r from-indigo-600 via-violet-600 to-indigo-600 bg-[length:200%_auto] hover:bg-right transition-all duration-500 text-white shadow-[0_10px_25px_-5px_rgba(79,70,229,0.5)] hover:shadow-[0_15px_35px_-5px_rgba(79,70,229,0.6)] text-[11px] font-black uppercase tracking-[0.15em] group h-[44px] border border-white/20 active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed"
                                >
                                    {isSaving ? <Loader2 size={18} className="animate-spin" /> : <Save size={18} />}
                                    <span className="relative z-10 drop-shadow-[0_2px_4px_rgba(0,0,0,0.3)]">บันทึกตารางสอน</span>
                                </button>
                            </div>
                        </div>
                    </header>

                    <main className="max-w-[1600px] mx-auto w-full px-6 pt-2 pb-6 space-y-6">
                            <section className="bg-white dark:bg-[#2a2b2f] border-none rounded-[24px] p-5 shadow-sm relative overflow-hidden group transition-colors">
                                <div className="absolute top-0 left-0 w-full h-[1px] bg-gradient-to-r from-transparent via-indigo-500/20 to-transparent"></div>
                                <div className="flex items-center justify-between mb-4">
                                    <div className="flex items-center gap-3">
                                        <div className="w-1 h-5 rounded-full bg-indigo-600"></div>
                                        <h2 className="text-[10px] font-black text-gray-600 dark:text-gray-400 uppercase tracking-[0.2em]">แผงควบคุมการเลือกวิชา</h2>
                                    </div>
                                </div>
                                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
                                <div className="space-y-1.5">
                                    <div className="flex items-center gap-2">
                                        <span className="flex items-center justify-center w-5 h-5 rounded-lg bg-indigo-500/20 text-indigo-400 text-[10px] font-black border border-indigo-500/30">1</span>
                                        <label className="text-[10px] font-black text-gray-600 dark:text-gray-400 uppercase tracking-widest">รายวิชา</label>
                                    </div>
                                    <div className="relative group/input">
                                        <Select
                                            menuPortalTarget={document.body}
                                            value={searchTerm ? { value: searchTerm, label: allCourses.find(c => c.code === searchTerm)?.title || searchTerm, course: allCourses.find(c => c.code === searchTerm) } : null}
                                            onChange={(option: any) => setSearchTerm(option?.value || '')}
                                            options={[
                                                { value: '', label: 'ทุกรายวิชา...' },
                                                ...allCourses
                                                    .filter(c => {
                                                        const semStr = String(c.semester || "");
                                                        const targetSem = String(selectedSemester || "1");
                                                        const isCorrectSemester = !c.semester || semStr === targetSem || semStr.startsWith(targetSem + '/') || targetSem.startsWith(semStr + '/');
                                                        if (!isCorrectSemester) return false;
                                                        
                                                        const hasAssignments = (c.teacherAssignments?.length || 0) > 0;
                                                        const isForSelectedTeacher = !selectedTeacher || c.teacherAssignments?.some(a => a.teacherId === selectedTeacher);
                                                        
                                                        const classIds = Array.isArray(c.classId) ? c.classId : [c.classId].filter(Boolean) as string[];
                                                        const assignedClasses = c.teacherAssignments?.filter(a => !selectedTeacher || a.teacherId === selectedTeacher).flatMap(a => a.classLevels || []) || [];
                                                        const allAssociatedClasses = [...classIds, ...assignedClasses];
                                                        const isForSelectedClass = filterClass === 'all' || allAssociatedClasses.some(id => id === filterClass || id.startsWith(filterClass + '/'));
                                                        
                                                        if (!hasAssignments || !isForSelectedTeacher || !isForSelectedClass) return false;

                                                        // Only show if there are remaining instances in the bank
                                                        const remainingCount = availableCourseInstances.filter(inst => inst.code === c.code).length;
                                                        return remainingCount > 0;
                                                    })
                                                    .sort((a, b) => a.code.localeCompare(b.code))
                                                    .map(course => {
                                                        const remainingCount = availableCourseInstances.filter(inst => inst.code === course.code).length;
                                                        const displayCredits = course.credits !== undefined ? course.credits : (course.hoursPerWeek ? (course.hoursPerWeek / 2) : 0);
                                                        const standardPeriods = course.credits ? Math.round(Number(course.credits) * 2) : 0;
                                                        const totalPeriods = standardPeriods > 0 ? standardPeriods : (course.hoursPerWeek || 1);
                                                        const hasMismatch = course.credits && course.hoursPerWeek !== standardPeriods;
                                                        
                                                        return { 
                                                            value: course.code, 
                                                            label: `${course.code} - ${course.title} [${displayCredits} นก.] (เหลือ ${remainingCount}/${totalPeriods} คาบ)${hasMismatch ? ' ⚠️ ข้อมูลไม่ตรงมาตรฐาน' : ''}`, 
                                                            course 
                                                        };
                                                    })
                                            ]}
                                            placeholder="เลือกรายวิชา..."
                                            isClearable
                                            className="react-select-container text-xs font-black"
                                            classNamePrefix="react-select"
                                            styles={{
                                                control: (base) => ({
                                                    ...base, minHeight: '36px', height: '36px', borderRadius: '12px',
                                                    backgroundColor: isDarkMode ? 'rgba(255,255,255,0.03)' : 'rgba(249, 250, 251, 0.8)',
                                                    borderColor: isDarkMode ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)',
                                                    fontWeight: '800'
                                                }),
                                                menu: (base) => ({
                                                    ...base,
                                                    backgroundColor: isDarkMode ? '#1a1b1e' : 'white',
                                                    border: isDarkMode ? '1px solid rgba(255,255,255,0.1)' : '1px solid rgba(0,0,0,0.1)',
                                                    borderRadius: '16px',
                                                    overflow: 'hidden',
                                                    boxShadow: '0 10px 30px rgba(0,0,0,0.2)'
                                                }),
                                                option: (base, { isFocused, isSelected }) => ({
                                                    ...base,
                                                    backgroundColor: isSelected
                                                        ? '#4f46e5'
                                                        : isFocused
                                                            ? isDarkMode ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)'
                                                            : 'transparent',
                                                    color: isDarkMode ? 'white' : 'black',
                                                    cursor: 'pointer',
                                                    fontSize: '11px',
                                                    fontWeight: '700'
                                                }),
                                                valueContainer: (base) => ({ ...base, padding: '0 8px' }),
                                                indicatorsContainer: (base) => ({ ...base, height: '36px' }),
                                                menuPortal: (base) => ({ ...base, zIndex: 9999 }),
                                                singleValue: (base) => ({ ...base, color: isDarkMode ? 'white' : 'black' }),
                                                input: (base) => ({ ...base, color: isDarkMode ? 'white' : 'black', margin: 0, padding: 0 }),
                                                placeholder: (base) => ({ ...base, color: isDarkMode ? 'rgba(255,255,255,0.4)' : 'rgba(0,0,0,0.4)' })
                                            }}
                                        />
                                    </div>
                                </div>

                                <div className="space-y-1.5">
                                    <div className="flex items-center gap-2">
                                        <span className="flex items-center justify-center w-5 h-5 rounded-lg bg-amber-500/20 text-amber-400 text-[10px] font-black border border-amber-500/30">2</span>
                                        <label className="text-[10px] font-black text-gray-600 dark:text-gray-400 uppercase tracking-widest">ครูผู้สอน</label>
                                    </div>
                                    <TeacherSelect teachers={teachers} selectedTeacher={selectedTeacher} setSelectedTeacher={setSelectedTeacher} setSchedule={setSchedule} />
                                </div>

                                <div className="space-y-1.5">
                                    <div className="flex items-center gap-2">
                                        <span className="flex items-center justify-center w-5 h-5 rounded-lg bg-emerald-500/20 text-emerald-400 text-[10px] font-black border border-emerald-500/30">3</span>
                                        <label className="text-[10px] font-black text-gray-600 dark:text-gray-400 uppercase tracking-widest">ระดับชั้น</label>
                                    </div>
                                    <div className="relative group/input">
                                        <select
                                            value={filterClass}
                                            onChange={(e) => setFilterClass(e.target.value)}
                                            className="w-full h-9 px-4 bg-gray-50/80 dark:bg-[#1a1b1e] border border-gray-100 dark:border-white/5 rounded-[12px] text-xs font-bold appearance-none cursor-pointer focus:outline-none dark:text-white"
                                        >
                                            <option value="all" className="dark:bg-[#1a1b1e] dark:text-white">เลือกชั้น...</option>
                                            {schoolSettings.availableClasses.map((k) => (
                                                <option key={k} value={k} className="dark:bg-[#1a1b1e] dark:text-white">
                                                    {CLASSES[k as keyof typeof CLASSES]}
                                                </option>
                                            ))}
                                        </select>
                                        <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
                                    </div>
                                </div>

                                <div className="space-y-3">
                                    <div className="flex items-center gap-2">
                                        <span className="flex items-center justify-center w-5 h-5 rounded-lg bg-blue-500/20 text-blue-400 text-[10px] font-black border border-blue-500/30">4</span>
                                        <label className="text-[10px] font-black text-gray-600 dark:text-gray-400 uppercase tracking-widest">กลุ่ม</label>
                                    </div>
                                    <div className="relative group/input">
                                        <select
                                            value={filterRoom}
                                            onChange={(e) => setFilterRoom(e.target.value)}
                                            className="w-full h-9 px-4 bg-gray-50/80 dark:bg-[#1a1b1e] border border-gray-100 dark:border-white/5 rounded-[12px] text-xs font-bold appearance-none cursor-pointer focus:outline-none dark:text-white"
                                        >
                                            <option value="all" className="dark:bg-[#1a1b1e] dark:text-white">ทุกกลุ่ม...</option>
                                            {Array.from({ length: 20 }, (_, i) => i + 1).map(num => (
                                                <option key={num} value={String(num)} className="dark:bg-[#1a1b1e] dark:text-white">
                                                    กลุ่ม {num}
                                                </option>
                                            ))}
                                        </select>
                                        <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
                                    </div>
                                </div>

                                <div className="space-y-1.5">
                                    <div className="flex items-center gap-2">
                                        <span className="flex items-center justify-center w-5 h-5 rounded-lg bg-violet-500/20 text-violet-400 text-[10px] font-black border border-violet-500/30">5</span>
                                        <label className="text-[10px] font-black text-gray-600 dark:text-gray-400 uppercase tracking-widest">สถานที่</label>
                                    </div>
                                    <div className="relative group/input">
                                        <select
                                            value={filterPhysicalRoom}
                                            onChange={(e) => setFilterPhysicalRoom(e.target.value)}
                                            className="w-full h-9 px-4 bg-gray-50/80 dark:bg-[#1a1b1e] border border-gray-100 dark:border-white/5 rounded-[12px] text-xs font-bold appearance-none cursor-pointer focus:outline-none dark:text-white"
                                        >
                                            <option value="all" className="dark:bg-[#1a1b1e] dark:text-white">ทุกสถานที่...</option>
                                            {physicalRooms.map((room: any) => (
                                                <option key={room.id} value={room.id} className="dark:bg-[#1a1b1e] dark:text-white">
                                                    {room.roomCode ? `(${room.roomCode}) ` : ''}{room.roomName}
                                                </option>
                                            ))}
                                        </select>
                                        <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
                                    </div>
                                </div>
                            </div>
                        </section>

                        <section className="flex flex-col lg:flex-row lg:items-center justify-between gap-6 px-2">
                            <div className="flex items-center gap-3">
                                <div className="w-1.5 h-6 rounded-full bg-emerald-600"></div>
                                <h2 className="text-xs font-black uppercase tracking-[0.3em]">พรีวิวก่อนลงตาราง</h2>
                            </div>
                            <div className="flex flex-wrap items-center gap-3">
                                {selectedTeacher && (
                                    <button onClick={() => handleRemoveCourse(selectedTeacher, "")} className="flex items-center gap-2 px-5 py-3 rounded-2xl border border-rose-500/10 bg-rose-500/5 text-rose-500 hover:bg-rose-500/10 transition-all text-[10px] font-black uppercase tracking-widest shadow-lg">
                                        <Trash2 size={16} /> <span>ลบตารางเฉพาะคนนี้</span>
                                    </button>
                                )}
                                <button onClick={handleClearAllSchedules} className="flex items-center gap-2 px-5 py-3 rounded-2xl border border-rose-600/10 bg-rose-600/5 text-rose-600 hover:bg-rose-600/10 transition-all text-[10px] font-black uppercase tracking-widest shadow-lg">
                                    <X size={16} /> <span>ลบตารางทั้งหมด</span>
                                </button>
                                <div className="h-6 w-[1px] bg-white/10 mx-2"></div>
                                <div className="flex items-center gap-2 px-4 py-2 rounded-xl bg-emerald-500/5 border border-emerald-500/10">
                                    <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></div>
                                    <span className="text-[10px] font-black text-emerald-500 uppercase tracking-widest">Live Preview</span>
                                </div>
                                {selectedTeacher && (
                                    <button onClick={() => handleAutoScheduleForTeacherAndClasses()} className="flex items-center gap-2 px-6 py-3.5 rounded-2xl bg-amber-500/10 border border-amber-500/20 text-amber-500 hover:bg-amber-500/20 transition-all text-[10px] font-black uppercase tracking-widest shadow-lg">
                                        <Zap size={16} /> <span>AI: จัดเฉพาะครูคนนี้</span>
                                    </button>
                                )}
                                <button onClick={() => handleGenerateSchoolTimetable()} className="flex items-center gap-3 px-8 py-4 rounded-2xl bg-indigo-600 text-white text-[11px] font-black uppercase tracking-widest shadow-lg hover:bg-indigo-500 hover:scale-[1.02] transition-all group">
                                    <Cpu size={18} /> <span>จัดตารางอัตโนมัติ (ทั้งโรงเรียน)</span>
                                </button>
                            </div>
                        </section>
>>>>>>> 5f8c7e1 (feat: optimize auto-scheduler and update UI labels)

                        <div className="grid grid-cols-1 xl:grid-cols-2 gap-6 h-auto">
                            <div className="bg-white dark:bg-[#2a2b2f] border-none rounded-[24px] overflow-hidden shadow-sm h-auto">
                                <TimetableGrid
                                    title="ตารางเรียนห้องเรียน"
                                    subtitle={filterClass !== 'all' 
                                        ? `ชั้น: ${CLASSES[filterClass as keyof typeof CLASSES] || filterClass}${filterRoom !== 'all' ? `/${filterRoom}` : ''}` 
                                        : 'กรุณาเลือกชั้นเรียน'
                                    }
                                    type="class"
                                    allDroppableIds={allDroppableIds}
                                    periodSettings={periodSettings}
                                    specialPeriods={specialPeriods}
                                    teachers={teachers}
                                    selectedTeacher={selectedTeacher}
                                    selectedSemester={selectedSemester}
                                    schedule={classSchedule}
                                    setSchedule={setSchedule}
                                    filterClass={filterClass}
                                    filterRoom={filterRoom}
                                    schoolMasterSchedule={schoolMasterSchedule}
                                    activeDragItem={activeDragItem}
                                    dynamicUnavailableSlots={[]}
                                    setDynamicUnavailableSlots={() => { }}
                                    setAvailableCourseInstances={setAvailableCourseInstances}
                                    onCellHover={setHoveredSlot}
                                    onLockToggle={toggleLock}
                                    handleRemoveCourse={handleRemoveCourse}
                                    assignmentConstraints={assignmentConstraints}
                                    selectedTeacherData={selectedTeacherData}
                                    onCellClick={(slotId) => handleManualAdd(slotId, searchTerm)}
                                    selectedCourseCode={searchTerm}
                                />
                            </div>
                            <div className="bg-white dark:bg-[#2a2b2f] border-none rounded-[24px] overflow-hidden shadow-sm h-auto">
                                <TimetableGrid
                                    title="ตารางสอนครูผู้สอน"
                                    subtitle={selectedTeacherData ? selectedTeacherData.name : 'กรุณาเลือกครูผู้สอน'}
                                    type="teacher"
                                    allDroppableIds={allDroppableIds}
                                    periodSettings={periodSettings}
                                    specialPeriods={specialPeriods}
                                    teachers={teachers}
                                    selectedTeacher={selectedTeacher}
                                    selectedSemester={selectedSemester}
                                    schedule={schedule}
                                    setSchedule={setSchedule}
                                    filterClass={filterClass}
                                    filterRoom={filterRoom}
                                    schoolMasterSchedule={schoolMasterSchedule}
                                    activeDragItem={activeDragItem}
                                    dynamicUnavailableSlots={dynamicUnavailableSlots}
                                    setDynamicUnavailableSlots={(newSlots) => {
                                        if (typeof newSlots === 'function') {
                                            setDynamicUnavailableSlots(prev => {
                                                const updated = (newSlots as any)(prev);
                                                setLocalUnavailableSlotsMap(prevMap => ({ ...prevMap, [selectedTeacher]: updated }));
                                                saveTeacherUnavailableSlots(selectedTeacher, updated);
                                                return updated;
                                            });
                                        } else {
                                            setDynamicUnavailableSlots(newSlots);
                                            setLocalUnavailableSlotsMap(prev => ({ ...prev, [selectedTeacher]: newSlots }));
                                            saveTeacherUnavailableSlots(selectedTeacher, newSlots);
                                        }
                                    }}
                                    setAvailableCourseInstances={setAvailableCourseInstances}
                                    onCellHover={setHoveredSlot}
                                    onLockToggle={toggleLock}
                                    handleRemoveCourse={handleRemoveCourse}
                                    assignmentConstraints={assignmentConstraints}
                                    selectedTeacherData={selectedTeacherData}
                                    onCellClick={(slotId) => handleManualAdd(slotId, searchTerm)}
                                    selectedCourseCode={searchTerm}
                                />
                            </div>
                        </div>

                        <div className="bg-white dark:bg-[#2a2b2f]/50 border border-gray-200 dark:border-white/[0.03] rounded-xl overflow-hidden shadow-lg mb-1 h-auto">
                            <TimetableGrid
                                title="ตารางการใช้งานห้องปฏิบัติการ"
                                subtitle={filterPhysicalRoom !== 'all' ? `ห้อง: ${selectedPhysicalRoomName}` : 'กรุณาเลือกสถานที่'}
                                type="room"
                                allDroppableIds={allDroppableIds}
                                periodSettings={periodSettings}
                                specialPeriods={specialPeriods}
                                teachers={teachers}
                                selectedTeacher={selectedTeacher}
                                selectedSemester={selectedSemester}
                                schedule={roomSchedule}
                                setSchedule={() => { }}
                                filterClass={filterClass}
                                filterRoom={filterPhysicalRoom}
                                schoolMasterSchedule={schoolMasterSchedule}
                                activeDragItem={activeDragItem}
                                dynamicUnavailableSlots={[]}
                                setDynamicUnavailableSlots={() => { }}
                                setAvailableCourseInstances={setAvailableCourseInstances}
                                onCellHover={setHoveredSlot}
                                onLockToggle={toggleLock}
                                handleRemoveCourse={handleRemoveCourse}
                                assignmentConstraints={assignmentConstraints}
                                selectedTeacherData={selectedTeacherData}
                                onCellClick={(slotId) => handleManualAdd(slotId, searchTerm)}
                                selectedCourseCode={searchTerm}
                            />
                        </div>
                    </main>

                    <DragOverlay
                        dropAnimation={{
                            duration: 400,
                            easing: 'cubic-bezier(0.18, 0.67, 0.6, 1.22)',
                            sideEffects: defaultDropAnimationSideEffects({
                                styles: {
                                    active: {
                                        opacity: '0.5',
                                    },
                                },
                            }),
                        }}
                        zIndex={9999}
                    >
                        {activeDragItem ? (
                            <div className="pointer-events-none shadow-[0_20px_50px_rgba(0,0,0,0.3)] rounded-xl overflow-hidden ring-2 ring-white/20 backdrop-blur-md w-[100px] h-[40px] scale-90 rotate-2 transition-transform duration-200 ease-out border border-white/30">
                                <CourseCard course={activeDragItem} isOverlay />
                            </div>
                        ) : null}
                    </DragOverlay>

<<<<<<< HEAD
                    <HoveredSlotTooltip
                        hoveredSlot={hoveredSlot}
                        allCourses={allCourses}
                        teachers={teachers}
                        physicalRooms={physicalRooms}
                    />
=======
                    {hoveredSlot && (
                        <div
                            className="fixed z-[9999] pointer-events-none transition-all duration-150 animate-in fade-in zoom-in-95"
                            style={{
                                top: hoveredSlot.rect.top - 210 > 0 ? hoveredSlot.rect.top - 210 : hoveredSlot.rect.bottom + 10,
                                left: Math.max(10, Math.min(window.innerWidth - 250, hoveredSlot.rect.left + (hoveredSlot.rect.width / 2) - 120))
                            }}
                        >
                            <div className="relative w-[240px] p-4 bg-[#1a1b1e] border border-white/10 rounded-[24px] shadow-2xl">
                                <div className="flex items-center justify-between mb-3 px-1 text-indigo-400 font-black text-[10px] uppercase">รายละเอียดวิชา</div>
                                <div className="h-[1px] w-full bg-white/5 mb-4"></div>
                                <div className="space-y-2.5 px-1 text-[11px] font-black text-white">
                                    <div className="flex"><span className="w-20 text-gray-500">รหัสวิชา:</span><span className="flex-1 truncate">{hoveredSlot.isDynamicUnavailable ? 'LOCK' : (hoveredSlot.courses[0]?.code || '-')}</span></div>
                                    <div className="flex"><span className="w-20 text-gray-500">ชื่อวิชา:</span><span className="flex-1 leading-tight">{hoveredSlot.isDynamicUnavailable ? 'คาบล็อครายบุคคล' : (hoveredSlot.courses[0]?.title || 'ไม่มีข้อมูล')}</span></div>
                                    <div className="flex"><span className="w-20 text-gray-500">ครูผู้สอน:</span><span className="flex-1 truncate">
                                        {(() => {
                                            if (hoveredSlot.isDynamicUnavailable) return '(คาบล็อค)';
                                            const c = hoveredSlot.courses[0];
                                            if (!c) return '(ไม่ระบุ)';
                                            
                                            // Resolve teacherId dynamically if it's pending/ghost
                                            let tId = c.teacherId;
                                            if (!tId || tId === 'pending' || tId.startsWith('GHOST')) {
                                                const courseDoc = allCourses.find(doc => doc.id === c.id);
                                                const assign = courseDoc?.teacherAssignments?.find(a => a.groupNumber === c.groupNumber);
                                                if (assign?.teacherId) tId = assign.teacherId;
                                            }

                                            const t = teachers?.find(t => t.id === tId || t.teacherId === tId);
                                            if (t) {
                                                const fullName = `${t.title || 'ครู'}${t.firstName || ''} ${t.lastName || ''}`.trim();
                                                return fullName.replace(/\$$/, '') || t.name?.replace(/\$$/, '') || '(ไม่ระบุ)';
                                            }
                                            return (tId === 'pending' || tId?.startsWith('GHOST') ? 'รอระบุครู' : (tId?.replace(/\$$/, '') || '(ไม่ระบุ)'));
                                        })()}
                                    </span></div>
                                    <div className="flex"><span className="w-20 text-gray-500">ชั้น:</span><span className="flex-1">{hoveredSlot.isDynamicUnavailable ? 'global' : getClassDisplayName(hoveredSlot.courses[0]?.classId)}</span></div>
                                    <div className="flex"><span className="w-20 text-gray-500">สถานที่:</span><span className="flex-1 text-[#4ade80]">
                                        {(() => {
                                            if (hoveredSlot.isDynamicUnavailable) return '(คาบว่าง)';
                                            const c = hoveredSlot.courses[0];
                                            if (!c) return '(ไม่ระบุ)';
                                            const rIds = c.room || [];
                                            if (rIds.length === 0 || (rIds.length === 1 && rIds[0] === 'all')) return 'ห้องเรียนปกติ';
                                            return rIds.map((id: string) => physicalRooms.find((pr: any) => pr.id === id)?.roomName || id).join(', ');
                                        })()}
                                    </span></div>
                                </div>
                            </div>
                        </div>
                    )}
>>>>>>> 5f8c7e1 (feat: optimize auto-scheduler and update UI labels)
                </div>
            </MainLayout>
        </DndContext>
    );
};

<<<<<<< HEAD
export default TeacherSchedulePage;
=======
export default TeacherSchedulePage;
>>>>>>> 5f8c7e1 (feat: optimize auto-scheduler and update UI labels)
