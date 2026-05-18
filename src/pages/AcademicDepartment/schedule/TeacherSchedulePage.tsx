import React, { useState, useMemo, useRef, useCallback, useEffect } from 'react';
import { collection, getDocs, onSnapshot, query, orderBy } from 'firebase/firestore';
import { firestore as db } from '@/firebase';
import { DndContext, DragOverlay, PointerSensor, TouchSensor, useSensor, useSensors, closestCenter, defaultDropAnimationSideEffects } from '@dnd-kit/core';
import { restrictToWindowEdges } from '@dnd-kit/modifiers';
import { useDispatch, useSelector } from 'react-redux';
import { RootState, AppDispatch } from '@/store';
import { useTheme } from '@/ThemeContext';
import { fetchCalendar } from '@/store/slices/calendarSlice';
import Swal from 'sweetalert2';
import MainLayout from "@/layouts/MainLayout";
import { Course, CourseInstance, Schedule, Teacher, getAssignmentTeacherIds } from './types';
import { CLASSES, getClassDisplayName, isAcademicCourse, getRequiredWeeklyPeriods } from './utils';
import { CourseCard } from './components/CourseCard';
import { TimetableGrid } from './components/TimetableGrid';
import { TeacherScheduleHeader } from './components/TeacherScheduleHeader';
import { TeacherScheduleControlPanel } from './components/TeacherScheduleControlPanel';
import { SchedulePreviewActions } from './components/SchedulePreviewActions';
import { HoveredSlotTooltip } from './components/HoveredSlotTooltip';
import { useScheduleData } from './hooks/useScheduleData';
import { useSmartMove } from './hooks/useSmartMove';
import { useScheduleActions } from './hooks/useScheduleActions';
import { useDragAndDrop } from './hooks/useDragAndDrop';
import { getCurrentThaiYear } from '@/utils/dateUtils';
import { getActiveSortedTeachers } from '@/utils/teacherSortUtils';

const TeacherSchedulePage: React.FC = () => {
    const { isDarkMode } = useTheme();
    const dispatch = useDispatch<AppDispatch>();
    const currentUser = useSelector((state: RootState) => state.auth.user);
    const schoolId = (currentUser as any)?.schoolId;
    const calendarState = useSelector((state: RootState) => state.calendar);
    const { teachers: teacherMap } = useSelector((state: RootState) => state.userMap);
    const teachers = useMemo<Teacher[]>(() => {
        return getActiveSortedTeachers(Object.values(teacherMap || {}) as Teacher[]);
    }, [teacherMap]);

    const [selectedTeacher, setSelectedTeacher] = useState<string>('');
    const [selectedYear, setSelectedYear] = useState<string>(localStorage.getItem('porbor_active_year') || '');
    const [selectedSemester, setSelectedSemester] = useState<string>(localStorage.getItem('porbor_active_semester') || "1");
    const [availableYears, setAvailableYears] = useState<string[]>([]);
    const [filterClass, setFilterClass] = useState<string>('all');
    const [filterRoom, setFilterRoom] = useState<string>('all');
    const [filterGroup, setFilterGroup] = useState<string>('all');
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

    const {
        availableCourseInstances, setAvailableCourseInstances,
        allCourses,
        specialPeriods,
        periodSettings,
        schoolSettings,
        schoolMasterSchedule, setSchoolMasterSchedule,
        fetchData,
        schedule, setSchedule,
        academicYear, academicTerm,
        loadSchoolMasterSchedule,
        assignmentConstraints
    } = useScheduleData(schoolId, selectedYear, selectedSemester);

    const hasSetDefaults = useRef(false);

    useEffect(() => {
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
                        const savedYear = localStorage.getItem('porbor_active_year');
                        const savedTerm = localStorage.getItem('porbor_active_semester');
                        
                        setSelectedYear(savedYear || currentYear);
                        setSelectedSemester(savedTerm || currentTerm);
                        hasSetDefaults.current = true;
                    }
                }

                const calendarRef = collection(db, 'school-settings', schoolId, 'main_calendar');
                const querySnapshot = await getDocs(calendarRef);
                const years = querySnapshot.docs
                    .map(doc => doc.id)
                    .filter(id => id !== 'default')
                    .sort((a, b) => parseInt(b) - parseInt(a));

                let finalYears = years;
                if (finalYears.length === 0) {
                    const current = getCurrentThaiYear();
                    finalYears = [];
                    for (let i = 0; i < 5; i++) {
                        finalYears.push((current - i).toString());
                    }
                }
                
                if (calendarState.academicYear && !finalYears.includes(calendarState.academicYear)) {
                    finalYears.push(calendarState.academicYear);
                    finalYears.sort((a, b) => parseInt(b) - parseInt(a));
                }

                setAvailableYears(finalYears);
            } catch (error) {
                console.error("Error fetching years:", error);
            }
        };
        fetchYears();
    }, [schoolId, calendarState.status, calendarState.academicYear, calendarState.rawData]);

    useEffect(() => {
        if (!schoolId) return;
        const q = query(collection(db, 'school-settings', schoolId, 'physical-rooms'), orderBy('roomName', 'asc'));
        const unsubscribe = onSnapshot(q, (snapshot) => {
            setPhysicalRooms(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
        });
        return () => unsubscribe();
    }, [schoolId]);

    // Persist filters to localStorage
    useEffect(() => {
        if (selectedYear) localStorage.setItem('porbor_active_year', selectedYear);
    }, [selectedYear]);

    useEffect(() => {
        if (selectedSemester) localStorage.setItem('porbor_active_semester', selectedSemester);
    }, [selectedSemester]);

    const {
        handleSaveSchedule,
        handleClearSchedule,
        handleGenerateSchoolTimetable,
        handleAutoScheduleForTeacherAndClasses,
        handleClearAllTeachersSchedules
    } = useScheduleActions({
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
        setSchoolMasterSchedule,
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
                    const assign = courseDoc?.teacherAssignments?.find(a => getAssignmentTeacherIds(a).includes(selectedTeacher) && a.groupNumber === groupNum);

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
                        const newInstance: CourseInstance = {
                            ...courseData,
                            teacherId: selectedTeacher,
                            teacherIds: assign ? getAssignmentTeacherIds(assign) : [selectedTeacher],
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
            const isAssignedToTeacher = c.teacherAssignments?.some((a: any) => getAssignmentTeacherIds(a).includes(selectedTeacher));
            const hasLegacyTeacher = c.teacherId === selectedTeacher || c.teacherIds?.includes(selectedTeacher);
            const hasTeacher = isAssignedToTeacher || (c.teacherAssignments?.length === 0 && hasLegacyTeacher);
            
            const isGhost = !selectedTeacher || selectedTeacher === 'pending' || selectedTeacher.startsWith('GHOST');
            if (isGhost) return false;

            const semStr = String(c.semester || "");
            const targetSem = String(selectedSemester || "1");
            const isCorrectSemester = (!c.semester || semStr === targetSem || semStr.startsWith(targetSem + '/') || targetSem.startsWith(semStr + '/'));

            if (!hasTeacher || !isCorrectSemester || !isAcademicCourse(c)) return false;

            if (filterClass !== 'all') {
                const classIds = Array.isArray(c.classId) ? c.classId : [c.classId].filter(Boolean) as string[];
                const assignedClasses = c.teacherAssignments?.filter(a => getAssignmentTeacherIds(a).includes(selectedTeacher)).flatMap(a => a.classLevels || []) || [];
                const allAssociatedClasses = [...classIds, ...assignedClasses];
                const isMatch = allAssociatedClasses.some(id => id === filterClass || id.startsWith(filterClass + '/'));
                if (!isMatch) return false;
            }

            if (filterRoom !== 'all') {
                const classIds = Array.isArray(c.classId) ? c.classId : [c.classId].filter(Boolean) as string[];
                const hasRoomMatch = classIds.some(id => {
                    const parts = id.split('/');
                    if (parts.length < 2) return false;
                    const roomPart = parts[1].trim();
                    if (filterRoom === 'แผน') return roomPart === 'แผน';
                    return Number(roomPart) === Number(filterRoom);
                });
                if (!hasRoomMatch) return false;
            }

            if (filterGroup !== 'all') {
                const groups = c.teacherAssignments?.filter(a => getAssignmentTeacherIds(a).includes(selectedTeacher)).map(a => String(a.groupNumber)) || [];
                if (!groups.includes(filterGroup)) return false;
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
            const totalHours = getRequiredWeeklyPeriods(course);
            const relevantAssignments = course.teacherAssignments?.filter((a: any) => getAssignmentTeacherIds(a).includes(selectedTeacher)) || [];

            if (relevantAssignments.length === 0 && (course.teacherId === selectedTeacher || course.teacherIds?.includes(selectedTeacher))) {
                relevantAssignments.push({
                    groupNumber: 1,
                    teacherId: selectedTeacher,
                    teacherIds: [selectedTeacher],
                    roomIds: [],
                    classLevels: []
                });
            }

            relevantAssignments.forEach((assign: any) => {
                const groupNum = assign.groupNumber || 1;
                if (filterGroup !== 'all' && String(groupNum) !== filterGroup) return;

                if (filterRoom !== 'all') {
                    const classIds = Array.isArray(course.classId) ? course.classId : [course.classId].filter(Boolean) as string[];
                    const assignedClasses = assign.classLevels || [];
                    const allAssociatedClasses = [...classIds, ...assignedClasses];
                    const hasRoomMatch = allAssociatedClasses.some(id => {
                        const parts = id.split('/');
                        if (parts.length < 2) return false;
                        const roomPart = parts[1].trim();
                        if (filterRoom === 'แผน') return roomPart === 'แผน';
                        return Number(roomPart) === Number(filterRoom);
                    });
                    if (!hasRoomMatch) return;
                }

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

                const totalHours = getRequiredWeeklyPeriods(course);

                const remaining = Math.max(0, totalHours - scheduledCount);
                for (let i = 0; i < remaining; i++) {
                    bank.push({
                        ...course,
                        teacherId: selectedTeacher,
                        teacherIds: getAssignmentTeacherIds(assign),
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
    }, [selectedTeacher, selectedSemester, schoolId, teachers, allCourses, schoolMasterSchedule, selectedTeacherData, setSchedule, setAvailableCourseInstances, localUnavailableSlotsMap, filterClass, filterRoom, filterGroup, searchTerm]);

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
        if (filterClass === 'all' && filterRoom === 'all' && filterGroup === 'all') return {};
        const filtered: Schedule = {};
        const classLabel = CLASSES[filterClass as keyof typeof CLASSES] || filterClass;
        
        // Helper to clean strings for robust matching
        const clean = (s: any) => String(s || '').replace(/\s+/g, '').toLowerCase();
        const normFilterClass = clean(filterClass);
        const normClassLabel = clean(classLabel);
        const normFilterRoom = clean(filterRoom);

        const isMatch = (targetClass: string | string[] | undefined) => {
            if (filterClass === 'all') return true;
            if (!targetClass) return false;
            const targets = Array.isArray(targetClass) ? targetClass : [targetClass];
            
            return targets.some(t => {
                const nt = clean(t);
                return nt === normFilterClass || 
                       nt === normClassLabel || 
                       nt.startsWith(normFilterClass + '/') || 
                       nt.startsWith(normClassLabel + '/') ||
                       nt.startsWith(normFilterClass + '-') || 
                       nt.startsWith(normClassLabel + '-');
            });
        };

        const addCourseToSlot = (slot: string, course: CourseInstance) => {
            if (!filtered[slot]) filtered[slot] = [];
            const existing = filtered[slot].find((c: CourseInstance) => c.id === course.id && c.teacherId === course.teacherId && c.groupNumber === course.groupNumber);
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

        Object.entries(schoolMasterSchedule).forEach(([slot, items]) => {
            items.forEach(item => {
                // If filtering by specific class, room, or group, show even if it's the selected teacher
                const isExplicitFilter = filterClass !== 'all' || filterRoom !== 'all' || filterGroup !== 'all';
                if (!isExplicitFilter && item.teacherId === selectedTeacher) return;

                const matchesRoom = filterRoom === 'all' || (() => {
                    const displayName = clean(getClassDisplayName(item.classId));
                    if (displayName.endsWith('/' + normFilterRoom) || displayName.endsWith('-' + normFilterRoom) || displayName === normFilterRoom) return true;

                    const classIds = Array.isArray(item.classId) ? item.classId : [item.classId].filter(Boolean) as string[];
                    const roomMatch = classIds.some(id => {
                        const nt = clean(id);
                        if (nt.includes('/')) {
                            const parts = nt.split('/');
                            const lastPart = parts[parts.length - 1];
                            return lastPart === normFilterRoom || (!isNaN(Number(lastPart)) && Number(lastPart) === Number(normFilterRoom));
                        }
                        return nt === normFilterRoom || nt === clean(`Room_${filterRoom}`);
                    });
                    if (roomMatch) return true;

                    const rooms = (item as any).room || (item as any).course?.room || [];
                    return rooms.some((r: any) => {
                        const nr = clean(r);
                        return nr === normFilterRoom || nr === clean(`Room_${filterRoom}`) || (!isNaN(Number(nr)) && Number(nr) === Number(normFilterRoom));
                    });
                })();
                const matchesGroup = filterGroup === 'all' || clean(item.groupNumber) === clean(filterGroup) || String(item.groupNumber || 1) === filterGroup;
                
                if (isMatch(item.classId) && item.course && matchesRoom && matchesGroup) {
                    const groupNumber = item.groupNumber || 1;
                    const courseDoc = allCourses.find(c => c.id === item.course?.id);
                    const currentAssign = courseDoc?.teacherAssignments?.find(a => a.groupNumber === groupNumber && getAssignmentTeacherIds(a).includes(item.teacherId));
                    const resolvedTeacherId = item.teacherId;

                    addCourseToSlot(slot, {
                        ...item.course,
                        teacherId: resolvedTeacherId,
                        teacherIds: currentAssign ? getAssignmentTeacherIds(currentAssign) : [item.teacherId],
                        classId: item.classId,
                        groupNumber: groupNumber,
                        instanceId: `global-${item.course.id}-${item.teacherId}-${slot}-${groupNumber}`
                    } as CourseInstance);
                }
            });
        });

        Object.entries(schedule).forEach(([slot, items]) => {
            items.forEach(item => {
                const matchesRoom = filterRoom === 'all' || (() => {
                    const displayName = clean(getClassDisplayName(item.classId));
                    if (displayName.endsWith('/' + normFilterRoom) || displayName.endsWith('-' + normFilterRoom) || displayName === normFilterRoom) return true;

                    const classIds = Array.isArray(item.classId) ? item.classId : [item.classId].filter(Boolean) as string[];
                    const roomMatch = classIds.some(id => {
                        const nt = clean(id);
                        if (nt.includes('/')) {
                            const parts = nt.split('/');
                            const lastPart = parts[parts.length - 1];
                            return lastPart === normFilterRoom || (!isNaN(Number(lastPart)) && Number(lastPart) === Number(normFilterRoom));
                        }
                        return nt === normFilterRoom || nt === clean(`Room_${filterRoom}`);
                    });
                    if (roomMatch) return true;

                    const rooms = (item as any).room || (item as any).course?.room || [];
                    return rooms.some((r: any) => {
                        const nr = clean(r);
                        return nr === normFilterRoom || nr === clean(`Room_${filterRoom}`) || (!isNaN(Number(nr)) && Number(nr) === Number(normFilterRoom));
                    });
                })();
                const matchesGroup = filterGroup === 'all' || clean(item.groupNumber) === clean(filterGroup) || String(item.groupNumber || 1) === filterGroup;
                if (isMatch(item.classId) && matchesRoom && matchesGroup) addCourseToSlot(slot, item);
            });
        });

        return filtered;
    }, [schoolMasterSchedule, filterClass, filterRoom, filterGroup, schedule, selectedTeacher, allCourses]);

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
                            filterGroup={filterGroup}
                            filterPhysicalRoom={filterPhysicalRoom}
                            physicalRooms={physicalRooms}
                            searchTerm={searchTerm}
                            schoolSettings={schoolSettings}
                            setSearchTerm={setSearchTerm}
                            setSelectedTeacher={setSelectedTeacher}
                            setSchedule={setSchedule}
                            setFilterClass={setFilterClass}
                            setFilterRoom={setFilterRoom}
                            setFilterGroup={setFilterGroup}
                            setFilterPhysicalRoom={setFilterPhysicalRoom}
                        />

                        <SchedulePreviewActions
                            selectedTeacher={selectedTeacher}
                            isAutoScheduling={isAutoScheduling}
                            handleClearSchedule={handleClearSchedule}
                            handleClearAllSchedules={handleClearAllSchedules}
                            handleAutoScheduleForTeacherAndClasses={handleAutoScheduleForTeacherAndClasses}
                            handleGenerateSchoolTimetable={handleGenerateSchoolTimetable}
                        />

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

                        <div className="grid grid-cols-1 xl:grid-cols-2 gap-6 h-auto">
                            <div className="bg-white dark:bg-[#2a2b2f] border-none rounded-[24px] overflow-hidden shadow-sm h-auto">
                                <TimetableGrid
                                    title="ตารางเรียนห้องเรียน"
                                    subtitle={filterClass !== 'all' 
                                        ? `ชั้น: ${CLASSES[filterClass as keyof typeof CLASSES] || filterClass}${filterRoom !== 'all' ? `/${filterRoom}` : ''}${filterGroup !== 'all' ? ` กลุ่ม ${filterGroup}` : ''}` 
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

                    <HoveredSlotTooltip
                        hoveredSlot={hoveredSlot}
                        allCourses={allCourses}
                        teachers={teachers}
                        physicalRooms={physicalRooms}
                    />
                </div>
            </MainLayout>
        </DndContext>
    );
};

export default TeacherSchedulePage;
