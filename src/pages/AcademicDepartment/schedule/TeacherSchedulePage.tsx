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
import { CompactScheduleToolbar } from './components/CompactScheduleToolbar';
import { TeacherSelect } from './components/TeacherSelect';
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
    const [filterPhysicalRoomTeacher, setFilterPhysicalRoomTeacher] = useState<string>('all');
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

    const isCourseAllowedInScheduleViews = useCallback((courseId: string | undefined, teacherId?: string, groupNumber?: number) => {
        if (!courseId) return true;
        const courseDoc = allCourses.find(c => c.id === courseId);
        if (!courseDoc) return false;

        return (courseDoc.teacherAssignments || []).some((assignment: any) => {
            const teacherIds = getAssignmentTeacherIds(assignment);
            const groupMatches = !groupNumber || !assignment.groupNumber || Number(assignment.groupNumber) === Number(groupNumber);
            const teacherMatches = !teacherId || teacherIds.includes(teacherId);
            return groupMatches && teacherMatches && teacherIds.length > 0;
        });
    }, [allCourses]);

    const selectedTeacherPeriodProgress = useMemo(() => {
        if (!selectedTeacher || selectedTeacher === 'pending' || selectedTeacher.startsWith('GHOST')) {
            return { scheduled: 0, total: 0 };
        }

        const targetSem = String(selectedSemester || "1");
        const total = allCourses.reduce((sum, course: Course) => {
            const semStr = String(course.semester || "");
            const isCorrectSemester = !course.semester ||
                semStr === targetSem ||
                semStr.startsWith(targetSem + '/') ||
                targetSem.startsWith(semStr + '/');

            if (!isCorrectSemester || !isAcademicCourse(course)) return sum;

            const assignments = course.teacherAssignments || [];
            const relevantAssignments = assignments.filter((assignment: any) => {
                const teacherIds = getAssignmentTeacherIds(assignment);
                const groupNumber = assignment.groupNumber || 1;
                return teacherIds.includes(selectedTeacher) &&
                    isCourseAllowedInScheduleViews(course.id, selectedTeacher, groupNumber);
            });

            if (relevantAssignments.length > 0) {
                return sum + relevantAssignments.length * getRequiredWeeklyPeriods(course);
            }

            return sum;
        }, 0);

        const scheduled = Object.values(schedule).reduce((sum, coursesInSlot) => {
            const uniqueAssignmentsInSlot = new Set<string>();

            coursesInSlot.forEach(course => {
                if (!isCourseAllowedInScheduleViews(course.id, selectedTeacher, course.groupNumber)) return;
                uniqueAssignmentsInSlot.add(course.compositeId || `${course.id}_${course.groupNumber || 1}`);
            });

            return sum + uniqueAssignmentsInSlot.size;
        }, 0);

        return { scheduled, total };
    }, [selectedTeacher, selectedSemester, allCourses, schedule, isCourseAllowedInScheduleViews]);

    const selectedTeacherScheduleSubtitle = selectedTeacherData
        ? `${selectedTeacherData.name} • จัดสำเร็จ ${selectedTeacherPeriodProgress.scheduled}/${selectedTeacherPeriodProgress.total} คาบ`
        : 'กรุณาเลือกครูผู้สอน';

    const getClassFilterFromCourse = useCallback((course: CourseInstance) => {
        const classIds = Array.isArray(course.classId) ? course.classId : [course.classId].filter(Boolean) as string[];
        const preferredClassId = classIds.find(id => String(id).includes('/')) || classIds[0] || '';
        const rawClassId = String(preferredClassId || '').trim();
        const displayName = getClassDisplayName(rawClassId);
        const source = rawClassId || displayName;
        const [levelPartRaw, roomPartRaw] = source.split(/[/-]/);
        const levelPart = String(levelPartRaw || '').replace(/\s+/g, '').toLowerCase();
        const roomPart = String(roomPartRaw || '').trim();

        const classKey = Object.entries(CLASSES).find(([key, label]) => {
            const normalizedLabel = String(label).replace(/\s+/g, '').toLowerCase();
            return key === levelPart ||
                normalizedLabel === levelPart ||
                normalizedLabel.replace('.', '') === levelPart.replace('.', '') ||
                levelPart === key.replace('.', '');
        })?.[0] || (CLASSES[source as keyof typeof CLASSES] ? source : '');

        return {
            classKey,
            room: roomPart,
        };
    }, []);

    const focusPreviewFromCourse = useCallback((course: CourseInstance) => {
        const { classKey, room } = getClassFilterFromCourse(course);
        if (classKey) setFilterClass(classKey);
        setFilterRoom(room || 'all');
        setFilterGroup('all');

        const roomIds = Array.isArray(course.room) ? course.room : [];
        const firstPhysicalRoom = roomIds.find(roomId => roomId && roomId !== 'all');
        setFilterPhysicalRoom(firstPhysicalRoom || 'all');
    }, [getClassFilterFromCourse]);

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

    const getTeacherDisplayName = useCallback((teacherId: string) => {
        const teacher = teachers.find(t => t.id === teacherId || (t.teacherId && t.teacherId === teacherId));
        if (!teacher) return teacherId;
        return `${teacher.title || ''}${teacher.firstName || ''} ${teacher.lastName || teacher.name || ''}`.trim();
    }, [teachers]);

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
            const teacherOccupancies = occupancies.filter((occ: any) => {
                if (occ.teacherId === selectedTeacher) return true;
                if (Array.isArray(occ.teacherIds) && occ.teacherIds.includes(selectedTeacher)) return true;
                return false;
            });
            teacherOccupancies.forEach((teacherOcc: any) => {
                if (teacherOcc.course) {
                    const courseDoc = allCourses.find(c => c.id === teacherOcc.course?.id);
                    const groupNum = teacherOcc.course?.groupNumber || 1;
                    if (!isCourseAllowedInScheduleViews(teacherOcc.course?.id, selectedTeacher, groupNum)) return;
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
                            classId: teacherOcc.classId,
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
            
            const isGhost = !selectedTeacher || selectedTeacher === 'pending' || selectedTeacher.startsWith('GHOST');
            if (isGhost) return false;

            const semStr = String(c.semester || "");
            const targetSem = String(selectedSemester || "1");
            const isCorrectSemester = (!c.semester || semStr === targetSem || semStr.startsWith(targetSem + '/') || targetSem.startsWith(semStr + '/'));

            if (!isAssignedToTeacher || !isCorrectSemester || !isAcademicCourse(c)) return false;

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
    }, [selectedTeacher, selectedSemester, schoolId, teachers, allCourses, schoolMasterSchedule, selectedTeacherData, setSchedule, setAvailableCourseInstances, localUnavailableSlotsMap, filterClass, filterRoom, filterGroup, searchTerm, isCourseAllowedInScheduleViews]);

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
        const hasPhysicalRoomFilter = filterPhysicalRoom !== 'all';
        const hasTeacherFilter = filterPhysicalRoomTeacher !== 'all';
        const hasClassFilter = filterClass !== 'all' || filterRoom !== 'all' || filterGroup !== 'all';
        if (!hasPhysicalRoomFilter && !hasTeacherFilter && !hasClassFilter) return {};
        const filtered: Schedule = {};
        const classLabel = CLASSES[filterClass as keyof typeof CLASSES] || filterClass;
        const clean = (s: any) => String(s || '').replace(/\s+/g, '').toLowerCase();
        const normFilterClass = clean(filterClass);
        const normClassLabel = clean(classLabel);
        const normFilterRoom = clean(filterRoom);

        const hasSpecificPhysicalRoom = (roomVal: unknown) => {
            const rooms = Array.isArray(roomVal) ? roomVal : [roomVal].filter(Boolean);
            return rooms.some(roomId => roomId && String(roomId).toLowerCase() !== 'all');
        };

        const matchesSelectedTeacher = (teacherId?: string, teacherIds?: string[]) => {
            if (!hasTeacherFilter) return true;
            const ids = Array.isArray(teacherIds) && teacherIds.length > 0 ? teacherIds : [teacherId].filter(Boolean) as string[];
            return ids.includes(filterPhysicalRoomTeacher);
        };

        const matchesSelectedPhysicalRoom = (roomVal: unknown) => {
            if (!hasPhysicalRoomFilter) return true;
            const rooms = Array.isArray(roomVal) ? roomVal : [roomVal].filter(Boolean);
            return rooms.some(roomId => String(roomId) === filterPhysicalRoom);
        };

        const withRoomDisplay = (course: CourseInstance) => {
            const rooms = (Array.isArray(course.room) ? course.room : [course.room]).filter(Boolean) as string[];
            const roomDisplay = rooms.length > 0 && !rooms.includes('all')
                ? rooms.map((id: string) => roomMap[id] || id).join(', ')
                : course.roomDisplay || '';
            return { ...course, roomDisplay };
        };

        const matchesSelectedClassRoom = (targetClass: string | string[] | undefined, groupNumber?: number) => {
            const targets = Array.isArray(targetClass) ? targetClass : [targetClass].filter(Boolean) as string[];
            const matchesClass = filterClass === 'all' || targets.some(t => {
                const nt = clean(t);
                return nt === normFilterClass ||
                    nt === normClassLabel ||
                    nt.startsWith(normFilterClass + '/') ||
                    nt.startsWith(normClassLabel + '/') ||
                    nt.startsWith(normFilterClass + '-') ||
                    nt.startsWith(normClassLabel + '-');
            });
            if (!matchesClass) return false;

            const matchesRoom = filterRoom === 'all' || targets.some(t => {
                const displayName = clean(getClassDisplayName(t));
                if (displayName.endsWith('/' + normFilterRoom) || displayName.endsWith('-' + normFilterRoom) || displayName === normFilterRoom) return true;

                const nt = clean(t);
                if (nt.includes('/')) {
                    const parts = nt.split('/');
                    const lastPart = parts[parts.length - 1];
                    return lastPart === normFilterRoom || (!isNaN(Number(lastPart)) && Number(lastPart) === Number(normFilterRoom));
                }
                return nt === normFilterRoom || nt === clean(`Room_${filterRoom}`);
            });
            if (!matchesRoom) return false;

            return filterGroup === 'all' || clean(groupNumber) === clean(filterGroup) || String(groupNumber || 1) === filterGroup;
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

        Object.entries(schoolMasterSchedule).forEach(([slot, items]) => {
            items.forEach(item => {
                if (!isCourseAllowedInScheduleViews(item.course?.id, item.teacherId, item.groupNumber)) return;
                const roomVal = item.course?.room;
                if (!roomVal) return;
                if (!matchesSelectedTeacher(item.teacherId, item.course?.teacherIds)) return;
                const hasMatch = matchesSelectedPhysicalRoom(roomVal) &&
                    (hasPhysicalRoomFilter || hasTeacherFilter
                        ? hasSpecificPhysicalRoom(roomVal)
                        : hasSpecificPhysicalRoom(roomVal) && matchesSelectedClassRoom(item.classId, item.groupNumber));
                if (hasMatch && item.course) {
                    addCourseToSlot(slot, withRoomDisplay({
                        ...item.course,
                        teacherId: item.teacherId,
                        classId: item.classId,
                        instanceId: `global-${item.course.id}-${item.teacherId}-${slot}`
                    } as CourseInstance));
                }
            });
        });

        Object.entries(schedule).forEach(([slot, items]) => {
            items.forEach(item => {
                if (!isCourseAllowedInScheduleViews(item.id, item.teacherId, item.groupNumber)) return;
                const roomVal = item.room;
                if (!roomVal) return;
                if (!matchesSelectedTeacher(item.teacherId, item.teacherIds)) return;
                const hasMatch = matchesSelectedPhysicalRoom(roomVal) &&
                    (hasPhysicalRoomFilter || hasTeacherFilter
                        ? hasSpecificPhysicalRoom(roomVal)
                        : hasSpecificPhysicalRoom(roomVal) && matchesSelectedClassRoom(item.classId, item.groupNumber));
                if (hasMatch) addCourseToSlot(slot, withRoomDisplay(item));
            });
        });

        return filtered;
    }, [schoolMasterSchedule, filterPhysicalRoom, filterPhysicalRoomTeacher, filterClass, filterRoom, filterGroup, schedule, roomMap, isCourseAllowedInScheduleViews]);

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
                if (!isCourseAllowedInScheduleViews(item.course?.id, item.teacherId, item.groupNumber)) return;
                // If filtering by specific class, room, or group, show even if it's the selected teacher
                const isExplicitFilter = filterClass !== 'all' || filterRoom !== 'all' || filterGroup !== 'all';
                if (!isExplicitFilter) {
                    const isTeacherAssigned = item.teacherId === selectedTeacher || (Array.isArray(item.teacherIds) && item.teacherIds.includes(selectedTeacher));
                    if (isTeacherAssigned) return;
                }

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
                if (!isCourseAllowedInScheduleViews(item.id, item.teacherId, item.groupNumber)) return;
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
    }, [schoolMasterSchedule, filterClass, filterRoom, filterGroup, schedule, selectedTeacher, allCourses, isCourseAllowedInScheduleViews]);

    const selectedPhysicalRoomName = useMemo(() => {
        if (filterPhysicalRoom === 'all') return '';
        const room = physicalRooms.find(r => r.id === filterPhysicalRoom);
        return room ? `${room.roomName} ${room.roomCode ? `(${room.roomCode})` : ''}` : '';
    }, [filterPhysicalRoom, physicalRooms]);

    const roomScheduleSubtitle = useMemo(() => {
        const teacherName = filterPhysicalRoomTeacher !== 'all' ? getTeacherDisplayName(filterPhysicalRoomTeacher) : '';
        if (filterPhysicalRoom !== 'all' && teacherName) return `ครู: ${teacherName} • ห้อง: ${selectedPhysicalRoomName}`;
        if (teacherName) return `ครู: ${teacherName} (ทุกห้องปฏิบัติการ)`;
        if (filterPhysicalRoom !== 'all') return `ห้อง: ${selectedPhysicalRoomName}`;
        if (filterClass !== 'all') {
            return `ชั้น: ${CLASSES[filterClass as keyof typeof CLASSES] || filterClass}${filterRoom !== 'all' ? `/${filterRoom}` : ''}${filterGroup !== 'all' ? ` กลุ่ม ${filterGroup}` : ''} (ทุกสถานที่)`;
        }
        if (filterRoom !== 'all') return `ห้องเรียน: ${filterRoom} (ทุกสถานที่)`;
        return 'กรุณาเลือกครูหรือห้องปฏิบัติการ';
    }, [filterPhysicalRoom, filterPhysicalRoomTeacher, selectedPhysicalRoomName, filterClass, filterRoom, filterGroup, getTeacherDisplayName]);

    const previewSelectClassName = "appearance-none h-8 w-[90px] sm:w-[105px] md:w-[120px] rounded-xl border border-gray-200/80 bg-gray-50/50 pl-2.5 pr-6 text-[10px] sm:text-[11px] font-black text-gray-800 outline-none transition-all duration-200 hover:border-gray-300 dark:hover:border-white/20 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/10 dark:border-white/10 dark:bg-white/[0.03] dark:text-white cursor-pointer shadow-sm disabled:opacity-40 disabled:cursor-not-allowed";

    const previewSelectChevron = (
        <div className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 dark:text-gray-500 transition-colors group-hover:text-indigo-500">
            <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
            </svg>
        </div>
    );

    const classroomPreviewReady = filterClass !== 'all' && filterRoom !== 'all';
    const physicalRoomPreviewReady = filterPhysicalRoom !== 'all' || filterPhysicalRoomTeacher !== 'all';

    const classroomPreviewControls = (
        <div className="flex flex-row items-center gap-1.5 justify-end">
            <div className="relative group">
                <select
                    aria-label="เลือกชั้นเรียน"
                    className={previewSelectClassName}
                    value={filterClass}
                    onChange={(event) => {
                        const nextClass = event.target.value || 'all';
                        setFilterClass(nextClass);
                        setFilterRoom(nextClass === 'all' ? 'all' : '1');
                        setFilterGroup('all');
                    }}
                >
                    <option value="all" className="bg-white dark:bg-[#2a2b2f] text-gray-800 dark:text-white">เลือกชั้น...</option>
                    {schoolSettings.availableClasses.map((classKey) => (
                        <option key={classKey} value={classKey} className="bg-white dark:bg-[#2a2b2f] text-gray-800 dark:text-white">
                            {CLASSES[classKey as keyof typeof CLASSES] || classKey}
                        </option>
                    ))}
                </select>
                {previewSelectChevron}
            </div>

            <div className="relative group">
                <select
                    aria-label="เลือกห้องเรียน"
                    className={previewSelectClassName}
                    value={filterRoom}
                    onChange={(event) => setFilterRoom(event.target.value || 'all')}
                    disabled={filterClass === 'all'}
                >
                    <option value="all" className="bg-white dark:bg-[#2a2b2f] text-gray-800 dark:text-white">เลือกห้อง...</option>
                    {Array.from({ length: 20 }, (_, index) => {
                        const room = String(index + 1);
                        return (
                            <option key={room} value={room} className="bg-white dark:bg-[#2a2b2f] text-gray-800 dark:text-white">
                                ห้อง {room}
                            </option>
                        );
                    })}
                    <option value="แผน" className="bg-white dark:bg-[#2a2b2f] text-gray-800 dark:text-white">ห้อง แผน</option>
                </select>
                {previewSelectChevron}
            </div>

            <div className="relative group">
                <select
                    aria-label="เลือกกลุ่มเรียน"
                    className={previewSelectClassName}
                    value={filterGroup}
                    onChange={(event) => setFilterGroup(event.target.value || 'all')}
                    disabled={filterClass === 'all'}
                >
                    <option value="all" className="bg-white dark:bg-[#2a2b2f] text-gray-800 dark:text-white">ทุกกลุ่มเรียน</option>
                    {Array.from({ length: 20 }, (_, index) => {
                        const group = String(index + 1);
                        return (
                            <option key={group} value={group} className="bg-white dark:bg-[#2a2b2f] text-gray-800 dark:text-white">
                                กลุ่ม {group}
                            </option>
                        );
                    })}
                </select>
                {previewSelectChevron}
            </div>
        </div>
    );

    const physicalRoomPreviewControls = (
        <div className="flex flex-row items-center gap-1.5 justify-end">
            <div className="relative group w-[200px] sm:w-[220px] md:w-[260px]">
                <TeacherSelect
                    teachers={teachers}
                    selectedTeacher={filterPhysicalRoomTeacher === 'all' ? '' : filterPhysicalRoomTeacher}
                    setSelectedTeacher={(value) => setFilterPhysicalRoomTeacher(value || 'all')}
                    setSchedule={() => { }}
                />
            </div>

            <div className="relative group w-[130px] sm:w-[155px] md:w-[175px]">
                <select
                    aria-label="เลือกห้องปฏิบัติการ"
                    className="appearance-none h-8 w-full rounded-xl border border-gray-200/80 bg-gray-50/50 pl-2.5 pr-6 text-[10px] sm:text-[11px] font-black text-gray-800 outline-none transition-all duration-200 hover:border-gray-300 dark:hover:border-white/20 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/10 dark:border-white/10 dark:bg-white/[0.03] dark:text-white cursor-pointer shadow-sm"
                    value={filterPhysicalRoom}
                    onChange={(event) => setFilterPhysicalRoom(event.target.value || 'all')}
                >
                    <option value="all" className="bg-white dark:bg-[#2a2b2f] text-gray-800 dark:text-white">ทุกห้องปฏิบัติการ</option>
                    {physicalRooms.map((room: any) => (
                        <option key={room.id} value={room.id} className="bg-white dark:bg-[#2a2b2f] text-gray-800 dark:text-white">
                            {`${room.roomCode ? `(${room.roomCode}) ` : ''}${room.roomName}`}
                        </option>
                    ))}
                </select>
                {previewSelectChevron}
            </div>
        </div>
    );

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
                <div className="flex flex-col h-[calc(100vh-60px)] overflow-hidden bg-gray-50/50 dark:bg-[#1a1b1e] text-gray-900 dark:text-white transition-colors duration-300 font-inter select-none">

                    <TeacherScheduleHeader
                        selectedYear={selectedYear}
                        availableYears={availableYears}
                        selectedSemester={selectedSemester}
                        isSaving={isSaving}
                        isAutoScheduling={isAutoScheduling}
                        setSelectedYear={setSelectedYear}
                        setSelectedSemester={setSelectedSemester}
                        handleGenerateSchoolTimetable={handleGenerateSchoolTimetable}
                        handleClearAllSchedules={handleClearAllSchedules}
                        handleSaveSchedule={handleSaveSchedule}
                    />

                    <main className="max-w-[1600px] mx-auto w-full flex-grow flex flex-col min-h-0 px-4 pt-1 pb-2 gap-3">
                        <div className="flex-[5_5_0%] flex flex-col min-h-0 bg-white dark:bg-[#2a2b2f] border-none rounded-[24px] overflow-hidden shadow-sm">
                            <TimetableGrid
                                title="ตารางสอนครูผู้สอน"
                                subtitle={selectedTeacherScheduleSubtitle}
                                headerActions={
                                    <CompactScheduleToolbar
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
                                        isAutoScheduling={isAutoScheduling}
                                        setSearchTerm={setSearchTerm}
                                        setSelectedTeacher={setSelectedTeacher}
                                        setSchedule={setSchedule}
                                        setFilterClass={setFilterClass}
                                        setFilterRoom={setFilterRoom}
                                        setFilterGroup={setFilterGroup}
                                        setFilterPhysicalRoom={setFilterPhysicalRoom}
                                        handleClearSchedule={handleClearSchedule}
                                        handleAutoScheduleForTeacherAndClasses={handleAutoScheduleForTeacherAndClasses}
                                    />
                                }
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
                                onCourseClick={focusPreviewFromCourse}
                                selectedCourseCode={searchTerm}
                            />
                        </div>

                        <div className="flex-[4_4_0%] grid grid-cols-1 xl:grid-cols-2 gap-4 min-h-0">
                            <div className="flex flex-col min-h-0 bg-white dark:bg-[#2a2b2f] border-none rounded-[24px] overflow-hidden shadow-sm">
                                <TimetableGrid
                                    title="ตารางเรียนห้องเรียน"
                                    subtitle={filterClass !== 'all' 
                                        ? `ชั้น: ${CLASSES[filterClass as keyof typeof CLASSES] || filterClass}${filterRoom !== 'all' ? `/${filterRoom}` : ''}${filterGroup !== 'all' ? ` กลุ่ม ${filterGroup}` : ''}` 
                                        : 'กรุณาเลือกชั้นเรียน'
                                    }
                                    headerActions={classroomPreviewControls}
                                    showGrid={classroomPreviewReady}
                                    emptyMessage="กรุณาเลือกชั้นเรียนและห้องเรียนก่อนแสดงตาราง"
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
                                    hideScrollbar={true}
                                />
                            </div>
                            <div className="flex flex-col min-h-0 bg-white dark:bg-[#2a2b2f] border-none rounded-[24px] overflow-hidden shadow-sm">
                                <TimetableGrid
                                    title="ตารางการใช้งานห้องปฏิบัติการ"
                                    subtitle={roomScheduleSubtitle}
                                    headerActions={physicalRoomPreviewControls}
                                    showGrid={physicalRoomPreviewReady}
                                    emptyMessage="กรุณาเลือกครูหรือห้องปฏิบัติการก่อนแสดงตาราง"
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
                                    hideScrollbar={true}
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
