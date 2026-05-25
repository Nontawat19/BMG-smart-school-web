import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { useSelector, useDispatch } from 'react-redux';
import { fetchCalendar } from '@/store/slices/calendarSlice';
import { fetchTeachersMap } from '@/store/slices/userMapSlice';
import { RootState } from '@/store';
import { firestore as db } from '@/firebase';
import { doc, getDoc, setDoc, collection, onSnapshot, getDocs, serverTimestamp, query, where } from 'firebase/firestore';
import { Save, Zap, Search, ChevronDown, Lock, Unlock, Settings, Filter, Info, BookOpen, X, Check, Book, CalendarX, ChevronLeft, ChevronRight, User, Users, AlertTriangle, Ban } from 'lucide-react';
import MainLayout from "@/layouts/MainLayout";
import BackButton from '@/components/Shared/BackButton';
import Swal from 'sweetalert2';
import { useTheme } from '@/ThemeContext';
import { isAcademicCourse, getPartnerIndexForPeriods, getRequiredWeeklyPeriods as getScheduleRequiredWeeklyPeriods, parseScheduleNumber } from './utils';
import { getCurrentThaiYear } from '@/utils/dateUtils';
import { getEffectivePeriodEnd, getTimetableDisplayPeriods, normalizePeriodSettings } from '@/utils/scheduleDisplayUtils';

interface TeacherAssignment {
    groupNumber: number;
    teacherId: string;
    teacherIds?: string[];
    roomIds: string[];
    classLevels?: string[];
    room?: string;
}

interface CourseAssignmentDoc {
    id: string;
    courseId: string;
    academicYear: string;
    semester: string;
    teacherAssignments: TeacherAssignment[];
}

interface Course {
    id: string;
    code: string;
    title: string;
    classId: string;
    room?: string;
    subjectGroup?: string;
    semester?: string | number;
    hoursPerWeek?: number;
    credits?: number | string;
    type?: string;
}

interface Teacher {
    id: string;
    teacherId?: string;
    name: string;
    title?: string;
    firstName?: string;
    lastName?: string;
    displayName?: string;
    preferences?: {
        unavailableSlots?: string[];
    };
}

interface AssignmentRow extends Course {
    assignment: TeacherAssignment;
    academicYear: string;
    semester: string;
    compositeId: string; // courseId + "_" + groupNumber
}

interface PeriodConstraint {
    type: 'any' | 'single' | 'double' | 'mixed';
    isLocked: boolean;
    lockedSlots?: string[];
    doublePreference?: 'any' | 'morning' | 'afternoon';
    singlePreference?: 'any' | 'morning' | 'afternoon';
    excludedDays?: string[];
}

interface PeriodSettingItem {
    id: string; label: string; startTime: string; endTime: string; isTeachingPeriod: boolean; isFixed?: boolean;
}

interface SpecialPeriodItem {
    id: string; title: string; startTime: string; endTime: string; day?: string; linkedPeriodId?: string;
}

interface ScheduledOccupancy {
    teacherId: string;
    classId: string | string[];
    groupNumber: number;
    course: (Omit<Course, 'room' | 'classId'> & {
        groupNumber?: number;
        teacherId?: string;
        teacherIds?: string[];
        room?: string | string[];
        classId?: string | string[];
    }) | null;
}

const DAYS = [
    { key: 'mon', label: 'จันทร์' },
    { key: 'tue', label: 'อังคาร' },
    { key: 'wed', label: 'พุธ' },
    { key: 'thu', label: 'พฤหัสบดี' },
    { key: 'fri', label: 'ศุกร์' },
];

const DEFAULT_PERIODS: PeriodSettingItem[] = [
    { id: 'homeroom', label: 'โฮมรูม', startTime: '08.30', endTime: '08.40', isTeachingPeriod: false, isFixed: true },
    { id: 'period-1', label: 'คาบที่ 1', startTime: '08.40', endTime: '09.30', isTeachingPeriod: true },
    { id: 'period-2', label: 'คาบที่ 2', startTime: '09.30', endTime: '10.20', isTeachingPeriod: true },
    { id: 'period-3', label: 'คาบที่ 3', startTime: '10.20', endTime: '11.10', isTeachingPeriod: true },
    { id: 'period-4', label: 'คาบที่ 4', startTime: '11.10', endTime: '12.00', isTeachingPeriod: true },
    { id: 'lunch', label: 'พักกลางวัน', startTime: '12.00', endTime: '13.00', isTeachingPeriod: false, isFixed: true },
    { id: 'period-5', label: 'คาบที่ 5', startTime: '13.00', endTime: '13.50', isTeachingPeriod: true },
    { id: 'period-6', label: 'คาบที่ 6', startTime: '13.50', endTime: '14.40', isTeachingPeriod: true },
    { id: 'period-7', label: 'คาบที่ 7', startTime: '14.40', endTime: '15.30', isTeachingPeriod: true },
    { id: 'period-8', label: 'คาบที่ 8', startTime: '15.30', endTime: '16.00', isTeachingPeriod: true },
];

const getRequiredWeeklyPeriods = (course: Pick<Course, 'credits' | 'hoursPerWeek'>) => {
    return getScheduleRequiredWeeklyPeriods(course, 0);
};

const normalizeGroupNumber = (groupNumber?: number | string) => {
    const normalized = Number(groupNumber || 1);
    return Number.isFinite(normalized) && normalized > 0 ? normalized : 1;
};

const getAssignmentCompositeId = (courseId: string, groupNumber?: number | string) => {
    return `${courseId}_${normalizeGroupNumber(groupNumber)}`;
};

const getAssignmentTeacherIds = (assignment?: { teacherId?: string; teacherIds?: string[] } | null): string[] => {
    const ids = Array.isArray(assignment?.teacherIds) && assignment.teacherIds.length > 0
        ? assignment.teacherIds
        : (assignment?.teacherId ? [assignment.teacherId] : []);
    return Array.from(new Set(ids.filter(Boolean)));
};

const normalizeClassList = (value: unknown): string[] => {
    const list = Array.isArray(value) ? value : [value];
    return list
        .filter(Boolean)
        .map(item => String(item).trim())
        .filter(Boolean);
};

const getAssignmentClassIds = (assignment: AssignmentRow): string[] => {
    const courseClassIds = normalizeClassList(assignment.classId);
    const assignmentClassIds = normalizeClassList(assignment.assignment.classLevels);
    const classIds = assignmentClassIds.length > 0 ? assignmentClassIds : courseClassIds;
    const groupRoom = assignment.assignment.room;

    return Array.from(new Set(classIds.map(classId => {
        if (classId.includes('/')) return classId;
        if (groupRoom && groupRoom !== 'all') return `${classId}/${groupRoom}`;
        return classId;
    })));
};

const toArray = <T,>(value: T | T[] | undefined | null): T[] => {
    if (Array.isArray(value)) return value.filter(Boolean);
    return value ? [value] : [];
};

const getPhysicalRoomSortValue = (room: any) => {
    const candidates = [room?.roomCode, room?.roomName, room?.id].map(value => String(value || ''));
    for (const value of candidates) {
        const parenthesizedCode = value.match(/\((\d+)\)/)?.[1];
        const numberLike = parenthesizedCode || value.match(/\d+/)?.[0];
        if (numberLike) return Number(numberLike);
    }
    return Number.MAX_SAFE_INTEGER;
};

const sortPhysicalRooms = (rooms: any[]) => {
    return [...rooms].sort((first, second) => {
        const firstValue = getPhysicalRoomSortValue(first);
        const secondValue = getPhysicalRoomSortValue(second);
        if (firstValue !== secondValue) return firstValue - secondValue;

        const firstName = `${first?.roomName || ''} ${first?.roomCode || ''}`.trim();
        const secondName = `${second?.roomName || ''} ${second?.roomCode || ''}`.trim();
        return firstName.localeCompare(secondName, 'th');
    });
};

const getSpecificRoomIds = (assignment: AssignmentRow): string[] => (
    (assignment.assignment.roomIds || [])
        .filter(roomId => roomId && roomId.toLowerCase() !== 'all')
);

const classGroupsOverlap = (first: AssignmentRow, second: AssignmentRow): boolean => {
    const firstClasses = getAssignmentClassIds(first);
    const secondClasses = getAssignmentClassIds(second);
    const firstGroup = normalizeGroupNumber(first.assignment.groupNumber);
    const secondGroup = normalizeGroupNumber(second.assignment.groupNumber);

    return firstClasses.some(firstClassId => {
        const firstLevel = firstClassId.split('/')[0];
        return secondClasses.some(secondClassId => {
            const secondLevel = secondClassId.split('/')[0];
            const sameClassRoom = firstClassId === secondClassId;
            const sameLevelWholeClass = !firstClassId.includes('/') && !secondClassId.includes('/') && firstLevel === secondLevel;
            const sameStudentGroup = firstGroup === secondGroup || firstGroup === 0 || secondGroup === 0;
            return (sameClassRoom || sameLevelWholeClass) && sameStudentGroup;
        });
    });
};

const physicalRoomsOverlap = (first: AssignmentRow, second: AssignmentRow): boolean => {
    const firstRooms = getSpecificRoomIds(first);
    const secondRooms = getSpecificRoomIds(second);
    return firstRooms.length > 0 && secondRooms.length > 0 && firstRooms.some(roomId => secondRooms.includes(roomId));
};

const getAssignmentConflict = (
    current: AssignmentRow,
    other: AssignmentRow,
    currentTeacherIds: string[],
    otherTeacherIds: string[]
) => {
    const sameTeacherId = currentTeacherIds.find(id => otherTeacherIds.includes(id));
    if (sameTeacherId) return { type: 'teacher' as const, teacherId: sameTeacherId };
    if (classGroupsOverlap(current, other)) return { type: 'class' as const };
    if (physicalRoomsOverlap(current, other)) return { type: 'room' as const };
    return null;
};

const hasThreeConsecutivePeriods = (slots: string[]): boolean => {
    const daySlots: Record<string, number[]> = {};
    slots.forEach(slotId => {
        const [dayKey, indexStr] = slotId.split('-');
        if (dayKey && indexStr) {
            const idx = parseInt(indexStr);
            if (!isNaN(idx)) {
                if (!daySlots[dayKey]) {
                    daySlots[dayKey] = [];
                }
                daySlots[dayKey].push(idx);
            }
        }
    });

    for (const day in daySlots) {
        const indices = daySlots[day].sort((a, b) => a - b);
        for (let i = 0; i < indices.length - 2; i++) {
            if (indices[i + 1] === indices[i] + 1 && indices[i + 2] === indices[i] + 2) {
                return true;
            }
        }
    }
    return false;
};

const PeriodConstraintPage: React.FC = () => {
    const { isDarkMode } = useTheme();
    const currentUser = useSelector((state: RootState) => state.auth.user);
    const schoolId = (currentUser as any)?.schoolId;
    const dispatch = useDispatch();
    const { academicYear: calYear, terms: calTerms, status: calendarStatus } = useSelector((state: RootState) => state.calendar);

    const [courses, setCourses] = useState<Course[]>([]);
    const [constraints, setConstraints] = useState<Record<string, PeriodConstraint>>({});
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [isLoading, setIsLoading] = useState(true);
    const [openExcludedMenu, setOpenExcludedMenu] = useState<string | null>(null);
    const [slotModalCourse, setSlotModalCourse] = useState<AssignmentRow | null>(null);
    const [periodSettings, setPeriodSettings] = useState<PeriodSettingItem[]>(DEFAULT_PERIODS);
    const [specialPeriods, setSpecialPeriods] = useState<SpecialPeriodItem[]>([]);
    
    // Filters
    const [searchTerm, setSearchTerm] = useState('');
    const [selectedYear, setSelectedYear] = useState<string>(localStorage.getItem('porbor_active_year') || "");
    const [filterSemester, setFilterSemester] = useState(localStorage.getItem('porbor_active_semester') || '1');
    const [courseAssignments, setCourseAssignments] = useState<CourseAssignmentDoc[]>([]);
    const [filterClass, setFilterClass] = useState('all');
    const [filterRoom, setFilterRoom] = useState('all');
    const [filterGroup, setFilterGroup] = useState('all');
    const [filterSubjectGroup, setFilterSubjectGroup] = useState('all');
    const [filterPhysicalRoom, setFilterPhysicalRoom] = useState('all'); // NEW
    const [physicalRooms, setPhysicalRooms] = useState<any[]>([]); // NEW
    const [schoolMasterSchedule, setSchoolMasterSchedule] = useState<Record<string, ScheduledOccupancy[]>>({});
    const [showActivityCourses, setShowActivityCourses] = useState(true);
    const [currentPage, setCurrentPage] = useState(1);
    const pageSize = 20;

    // Persist filters to localStorage
    useEffect(() => {
        if (selectedYear) localStorage.setItem('porbor_active_year', selectedYear);
    }, [selectedYear]);

    useEffect(() => {
        if (filterSemester) localStorage.setItem('porbor_active_semester', filterSemester);
    }, [filterSemester]);

    // Metadata for filters
    const [subjectGroups, setSubjectGroups] = useState<string[]>([]);

    // Dynamic class list from school settings
    const [availableClasses, setAvailableClasses] = useState<{key: string; label: string}[]>([]);

    // Full class mapping for display
    const ALL_CLASSES: Record<string, string> = {
        'k1': 'อ.1', 'k2': 'อ.2', 'k3': 'อ.3',
        'p1': 'ป.1', 'p2': 'ป.2', 'p3': 'ป.3',
        'p4': 'ป.4', 'p5': 'ป.5', 'p6': 'ป.6',
        'm1': 'ม.1', 'm2': 'ม.2', 'm3': 'ม.3',
        'lower_secondary': 'ม.ต้น',
        'junior_high': 'ม.ต้น',
        'JUNIOR_HIGH': 'ม.ต้น',
        'm4': 'ม.4', 'm5': 'ม.5', 'm6': 'ม.6',
        'upper_secondary': 'ม.ปลาย',
        'senior_high': 'ม.ปลาย',
        'SENIOR_HIGH': 'ม.ปลาย',
    };

    useEffect(() => {
        if (schoolId) {
            if (calendarStatus === 'idle') {
                dispatch(fetchCalendar(schoolId) as any);
            }
            dispatch(fetchTeachersMap(schoolId) as any);
        }
    }, [schoolId, calendarStatus, dispatch]);

    useEffect(() => {
        if (calYear && !selectedYear) {
            const savedYear = localStorage.getItem('porbor_active_year');
            setSelectedYear(savedYear || calYear);
        }
        if (calTerms && calTerms.length > 0 && filterSemester === '1') {
            const savedTerm = localStorage.getItem('porbor_active_semester');
            if (savedTerm) {
                setFilterSemester(savedTerm);
            } else {
                const today = new Date().toISOString().split('T')[0];
                const found = calTerms.find(t => today >= t.startDate && today <= t.endDate);
                if (found) {
                    const termId = found.name.includes('2') ? '2' : '1';
                    setFilterSemester(termId);
                }
            }
        }
    }, [calYear, calTerms, selectedYear, filterSemester]);
    const buildClassList = (levelRange: string) => {
        const allKeys = ['k1','k2','k3','p1','p2','p3','p4','p5','p6','m1','m2','m3','m4','m5','m6'];
        const labelToKey: Record<string, string> = {};
        for (const [k, v] of Object.entries(ALL_CLASSES)) {
            if (!['lower_secondary','upper_secondary'].includes(k)) labelToKey[v] = k;
        }
        if (!levelRange) return allKeys.map(k => ({ key: k, label: ALL_CLASSES[k] }));
        const parts = levelRange.split('-');
        if (parts.length !== 2) return allKeys.map(k => ({ key: k, label: ALL_CLASSES[k] }));
        const startKey = labelToKey[parts[0].trim()];
        const endKey = labelToKey[parts[1].trim()];
        if (!startKey || !endKey) return allKeys.map(k => ({ key: k, label: ALL_CLASSES[k] }));
        const startIdx = allKeys.indexOf(startKey);
        const endIdx = allKeys.indexOf(endKey);
        if (startIdx === -1 || endIdx === -1) return allKeys.map(k => ({ key: k, label: ALL_CLASSES[k] }));
        const selectedKeys = allKeys.slice(startIdx, endIdx + 1);
        const result: {key: string; label: string}[] = [];
        for (const k of selectedKeys) {
            result.push({ key: k, label: ALL_CLASSES[k] });
            if (k === 'm3' && selectedKeys.includes('m1')) {
                result.push({ key: 'lower_secondary', label: 'ม.ต้น' });
            }
            if (k === 'm6' && selectedKeys.includes('m4')) {
                result.push({ key: 'upper_secondary', label: 'ม.ปลาย' });
            }
        }
        return result;
    };

    const { teachers: teacherMap } = useSelector((state: RootState) => state.userMap);

    const formatTeacherDisplayName = useCallback((teacherId: string) => {
        const teacher = teacherMap[teacherId] as Teacher | undefined;
        if (!teacher) return teacherId || 'ไม่ระบุครู';
        const fullName = teacher.displayName || teacher.name || `${teacher.title || ''}${teacher.firstName || ''} ${teacher.lastName || ''}`.trim();
        return fullName || teacherId || 'ไม่ระบุครู';
    }, [teacherMap]);

    const getTeacherCode = useCallback((teacherId: string) => {
        const teacher = teacherMap[teacherId] as Teacher | undefined;
        return teacher?.teacherId || teacherId?.slice(-4) || '-';
    }, [teacherMap]);

    const getTeacherSummaries = useCallback((assignment: TeacherAssignment) => {
        const ids = getAssignmentTeacherIds(assignment);
        return ids.map(id => ({
            id,
            code: getTeacherCode(id),
            name: formatTeacherDisplayName(id),
            teacher: teacherMap[id] as Teacher | undefined,
        }));
    }, [formatTeacherDisplayName, getTeacherCode, teacherMap]);

    const formatClassDisplayName = useCallback((classId: string | string[] | undefined | null) => {
        const values = toArray(classId);
        if (values.length === 0) return '-';

        return values.map(raw => {
            const text = String(raw || '').trim();
            if (!text) return '-';
            const [level, room] = text.split('/');
            const levelLabel = ALL_CLASSES[level] || level;
            return room ? `${levelLabel}/${room}` : levelLabel;
        }).join(', ');
    }, []);

    const getScheduledOccupancyConflict = useCallback((
        current: AssignmentRow,
        occupancy: ScheduledOccupancy,
        currentTeacherIds: string[]
    ) => {
        const scheduledCourse = occupancy.course;
        if (!scheduledCourse?.id) return null;

        const currentGroupNumber = normalizeGroupNumber(current.assignment.groupNumber);
        const scheduledGroupNumber = normalizeGroupNumber(occupancy.groupNumber || scheduledCourse.groupNumber);
        if (scheduledCourse.id === current.id && scheduledGroupNumber === currentGroupNumber) return null;

        const scheduledTeacherIds = Array.from(new Set([
            occupancy.teacherId,
            ...getAssignmentTeacherIds(scheduledCourse),
        ].filter(Boolean)));

        const scheduledRow = {
            ...scheduledCourse,
            classId: occupancy.classId || scheduledCourse.classId || '',
            assignment: {
                groupNumber: scheduledGroupNumber,
                teacherId: occupancy.teacherId,
                teacherIds: scheduledTeacherIds,
                roomIds: toArray(scheduledCourse.room).map(String),
                classLevels: toArray(occupancy.classId || scheduledCourse.classId).map(String),
                room: ''
            },
            academicYear: selectedYear,
            semester: filterSemester,
            compositeId: getAssignmentCompositeId(scheduledCourse.id, scheduledGroupNumber)
        } as AssignmentRow;

        return getAssignmentConflict(current, scheduledRow, currentTeacherIds, scheduledTeacherIds);
    }, [filterSemester, selectedYear]);

    // Create a flattened list of all assignments (rows)
    const allAssignments = useMemo(() => {
        return courseAssignments.flatMap(courseDoc => {
            const course = courses.find(c => c.id === courseDoc.courseId);
            if (!course) return [];
            
            return (courseDoc.teacherAssignments || []).map(asgn => ({
                ...course,
                academicYear: courseDoc.academicYear,
                semester: courseDoc.semester,
                assignment: asgn,
                compositeId: getAssignmentCompositeId(courseDoc.courseId, asgn.groupNumber)
            } as AssignmentRow));
        });
    }, [courses, courseAssignments]);

    useEffect(() => {
        const loadData = async () => {
            if (!schoolId) return;
            setIsLoading(true);
            try {
                // 0. Load School Info for class levels
                const schoolRef = doc(db, 'school-settings', schoolId);
                const schoolSnap = await getDoc(schoolRef);
                if (schoolSnap.exists()) {
                    const levelRange = schoolSnap.data().opportunityExpansionLevel || '';
                    setAvailableClasses(buildClassList(levelRange));
                }

                // 1. Load Courses
                const coursesRef = collection(db, 'school-settings', schoolId, 'courses');
                const coursesSnap = await getDocs(coursesRef);
                const coursesData = coursesSnap.docs.map((doc: any) => ({ id: doc.id, ...doc.data() } as Course));
                setCourses(coursesData);

                // 1.1 Load Course Assignments (Filtered by year and semester)
                const assignmentsRef = collection(db, 'school-settings', schoolId, 'course_assignments');
                const q = query(assignmentsRef, 
                    where('academicYear', '==', selectedYear),
                    where('semester', '==', filterSemester)
                );
                const assignmentsSnap = await getDocs(q);
                const assignmentsData = assignmentsSnap.docs.map(doc => ({ id: doc.id, ...doc.data() } as CourseAssignmentDoc));
                setCourseAssignments(assignmentsData);

                // 2. Load Existing Constraints
                const constraintDocRef = doc(db, 'school-settings', schoolId, 'configs', 'period_constraints');
                const constraintSnap = await getDoc(constraintDocRef);
                if (constraintSnap.exists()) {
                    setConstraints(constraintSnap.data().mapping || {});
                }

                // 3. Load Subject Groups from Firestore
                const sgRef = collection(db, 'school-settings', schoolId, 'subject_groups');
                const sgSnap = await getDocs(sgRef);
                const sgData = sgSnap.docs.map((d: any) => ({ name: d.data().name as string, code: d.data().code as string }));
                // Sort by code, but put กิจกรรมพัฒนาผู้เรียน at the end
                const sorted = sgData
                    .filter((g: any) => g.name !== 'กิจกรรมพัฒนาผู้เรียน')
                    .sort((a: any, b: any) => parseInt(a.code || '999') - parseInt(b.code || '999'));
                const activity = sgData.find((g: any) => g.name === 'กิจกรรมพัฒนาผู้เรียน');
                const groupNames = sorted.map((g: any) => g.name);
                if (activity) groupNames.push(activity.name);
                setSubjectGroups(groupNames);

                // 4. Load Period Settings
                const settingsRef = doc(db, 'school-settings', schoolId, 'configs', 'schedule_settings');
                const settingsSnap = await getDoc(settingsRef);
                if (settingsSnap.exists() && settingsSnap.data().periods) {
                    setPeriodSettings(normalizePeriodSettings(settingsSnap.data().periods));
                } else {
                    setPeriodSettings(normalizePeriodSettings(DEFAULT_PERIODS));
                }

                // 5. Load Special Periods
                const spRef = collection(db, 'school-settings', schoolId, 'special-periods');
                const spSnap = await getDocs(spRef);
                const spData = spSnap.docs.map((d: any) => ({ id: d.id, ...d.data() } as SpecialPeriodItem));
                setSpecialPeriods(spData);

                // 6. Load Physical Rooms
                const roomsRef = collection(db, 'school-settings', schoolId, 'physical-rooms');
                const roomsSnap = await getDocs(roomsRef);
                setPhysicalRooms(sortPhysicalRooms(roomsSnap.docs.map(d => ({ id: d.id, ...d.data() }))));

                // 7. Load the existing school timetable so locked-period choices show real teaching periods.
                const scheduleMatchesFilter = (data: any) => {
                    const dataYear = String(data.academicYear || '');
                    const dataSemester = String(data.semester || '');
                    const yearMatches = !selectedYear || !dataYear || dataYear === selectedYear;
                    const semesterMatches = !dataSemester ||
                        dataSemester === filterSemester ||
                        dataSemester.startsWith(`${filterSemester}/`) ||
                        filterSemester.startsWith(`${dataSemester}/`);
                    return yearMatches && semesterMatches;
                };
                const scheduleDocId = (teacherId: string, year: string, semester: string) => `${teacherId}__${year || 'unknown'}__${semester || '1'}`;
                const schedulesRef = collection(db, 'school-settings', schoolId, 'schedules');
                const schedulesSnap = await getDocs(schedulesRef);
                const matchingSchedules = schedulesSnap.docs
                    .map(scheduleDoc => {
                        const data = scheduleDoc.data();
                        if (!scheduleMatchesFilter(data)) return null;
                        const teacherId = data.teacherId || scheduleDoc.id.split('__')[0];
                        const canonicalId = scheduleDocId(teacherId, String(data.academicYear || selectedYear || ''), String(data.semester || filterSemester || '1'));
                        return {
                            id: scheduleDoc.id,
                            data,
                            teacherId,
                            isCanonical: scheduleDoc.id === canonicalId || scheduleDoc.id.includes('__')
                        };
                    })
                    .filter(Boolean) as Array<{ id: string; data: any; teacherId: string; isCanonical: boolean }>;

                const teachersWithCanonicalDocs = new Set(
                    matchingSchedules.filter(item => item.isCanonical).map(item => item.teacherId)
                );
                const masterSchedule: Record<string, ScheduledOccupancy[]> = {};
                matchingSchedules.forEach(scheduleDoc => {
                    if (!scheduleDoc.isCanonical && teachersWithCanonicalDocs.has(scheduleDoc.teacherId)) return;

                    Object.entries(scheduleDoc.data.schedule || {}).forEach(([slotId, slotData]) => {
                        const coursesInSlot = Array.isArray(slotData) ? slotData : [slotData];
                        coursesInSlot.filter(Boolean).forEach((course: any) => {
                            const resolvedClassId = course.classId || scheduleDoc.data.classId;
                            const resolvedRoom = course.room || scheduleDoc.data.room || [];

                            if (!masterSchedule[slotId]) masterSchedule[slotId] = [];
                            masterSchedule[slotId].push({
                                teacherId: scheduleDoc.teacherId,
                                classId: resolvedClassId,
                                groupNumber: normalizeGroupNumber(course.groupNumber || 1),
                                course: {
                                    ...course,
                                    classId: resolvedClassId,
                                    room: resolvedRoom,
                                    groupNumber: normalizeGroupNumber(course.groupNumber || 1)
                                }
                            });
                        });
                    });
                });
                setSchoolMasterSchedule(masterSchedule);

            } catch (error) {
                console.error("Error loading constraints:", error);
                Swal.fire('เกิดข้อผิดพลาด', 'ไม่สามารถโหลดข้อมูลได้', 'error');
            } finally {
                setIsLoading(false);
            }
        };
        loadData();
    }, [schoolId, selectedYear, filterSemester]);

    const showLimitWarning = (title: string, text: string) => {
        Swal.fire({
            icon: 'warning',
            title,
            text,
            confirmButtonText: 'รับทราบ',
            confirmButtonColor: '#f59e0b',
            background: isDarkMode ? '#1a1b1e' : '#ffffff',
            color: isDarkMode ? '#ffffff' : '#000000',
            didOpen: () => {
                const container = Swal.getContainer();
                if (container) {
                    container.style.zIndex = '10000';
                }
            }
        });
    };

    const handleConstraintChange = (assignmentId: string, type: 'any' | 'single' | 'double' | 'mixed') => {
        const assignment = allAssignments.find(item => item.compositeId === assignmentId);
        const requiredPeriods = assignment ? getRequiredWeeklyPeriods(assignment) : 0;
        const current = constraints[assignmentId];
        const lockedSlots = current?.lockedSlots || [];

        if (requiredPeriods > 0 && lockedSlots.length > requiredPeriods) {
            showLimitWarning(
                'จำนวนคาบที่ล็อกไว้เกินกำหนด',
                `รายวิชานี้กำหนดได้สูงสุด ${requiredPeriods} คาบ/สัปดาห์ กรุณาลดจำนวนคาบที่ล็อกไว้ก่อนเปลี่ยนรูปแบบ`
            );
            return;
        }

        setConstraints(prev => ({
            ...prev,
            [assignmentId]: {
                ...(prev[assignmentId] || { isLocked: false, doublePreference: 'any', singlePreference: 'any', excludedDays: [] }),
                type,
                doublePreference: type === 'single' ? 'any' : (prev[assignmentId]?.doublePreference || 'any'),
                singlePreference: type === 'double' ? 'any' : (prev[assignmentId]?.singlePreference || 'any'),
            }
        }));
    };

    const handlePreferenceChange = (assignmentId: string, field: 'doublePreference' | 'singlePreference', val: 'any' | 'morning' | 'afternoon') => {
        setConstraints(prev => ({
            ...prev,
            [assignmentId]: {
                ...(prev[assignmentId] || { type: 'any', isLocked: false, excludedDays: [] }),
                [field]: val
            }
        }));
    };

    const handleExcludedDayToggle = (assignmentId: string, dayKey: string) => {
        setConstraints(prev => {
            const current = prev[assignmentId] || { type: 'any', isLocked: false, excludedDays: [] };
            const days = current.excludedDays || [];
            const newDays = days.includes(dayKey) 
                ? days.filter(d => d !== dayKey)
                : [...days, dayKey];
            
            return {
                ...prev,
                [assignmentId]: { ...current, excludedDays: newDays }
            };
        });
    };

    const handleAutoConfigureConstraints = async () => {
        if (allAssignments.length === 0) {
            showLimitWarning('ยังไม่มีข้อมูลรายวิชา', 'ไม่พบรายการมอบหมายรายวิชาสำหรับปี/ภาคเรียนที่เลือก');
            return;
        }

        const result = await Swal.fire({
            icon: 'question',
            title: 'กำหนดรูปแบบคาบอัตโนมัติ?',
            text: 'ระบบจะเลือกคาบเดี่ยว/คาบคู่ตามจำนวนคาบต่อสัปดาห์ โดยยังคงคาบที่ล็อกและวันยกเว้นเดิมไว้',
            showCancelButton: true,
            confirmButtonText: 'กำหนดอัตโนมัติ',
            cancelButtonText: 'ยกเลิก',
            confirmButtonColor: '#4f46e5',
            background: isDarkMode ? '#1a1b1e' : '#ffffff',
            color: isDarkMode ? '#ffffff' : '#000000',
        });

        if (!result.isConfirmed) return;

        setConstraints(prev => {
            const next = { ...prev };
            allAssignments.forEach(asgn => {
                const requiredPeriods = getRequiredWeeklyPeriods(asgn);
                const current = prev[asgn.compositeId] || { isLocked: false, excludedDays: [] };
                const title = `${asgn.title || ''} ${asgn.subjectGroup || ''}`.toLowerCase();
                const isActivity = title.includes('แนะแนว') ||
                    title.includes('ลูกเสือ') ||
                    title.includes('ชุมนุม') ||
                    title.includes('กิจกรรมพัฒนาผู้เรียน') ||
                    title.includes('scout') ||
                    title.includes('club');

                let type: PeriodConstraint['type'] = 'any';
                if (requiredPeriods <= 0) type = 'any';
                else if (requiredPeriods === 1) type = 'single';
                else if (requiredPeriods === 2) type = 'double';
                else if (requiredPeriods === 3) type = 'mixed';
                else if (requiredPeriods === 4) type = 'double';
                else type = 'mixed';

                next[asgn.compositeId] = {
                    ...current,
                    type,
                    singlePreference: type === 'double' ? 'any' : (current.singlePreference || 'any'),
                    doublePreference: type === 'single' ? 'any' : (current.doublePreference || (isActivity ? 'afternoon' : 'morning')),
                    excludedDays: current.excludedDays || [],
                    isLocked: Boolean(current.lockedSlots?.length || current.isLocked),
                };
            });
            return next;
        });

        Swal.fire({
            icon: 'success',
            title: 'กำหนดรูปแบบคาบแล้ว',
            text: 'กรุณาตรวจสอบรายการที่ล็อกคาบไว้ แล้วกดบันทึกข้อมูล',
            timer: 1800,
            showConfirmButton: false,
            background: isDarkMode ? '#1a1b1e' : '#ffffff',
            color: isDarkMode ? '#ffffff' : '#000000',
        });
    };

    const toggleLock = (assignmentId: string) => {
        setConstraints(prev => ({
            ...prev,
            [assignmentId]: {
                ...(prev[assignmentId] || { type: 'any' }),
                isLocked: !(prev[assignmentId]?.isLocked || false)
            }
        }));
    };

    const toggleSlot = useCallback((assignmentId: string, slotId: string, totalPeriods: number, totalHoursNeeded: number) => {
        const c = allAssignments.find(a => a.compositeId === assignmentId);
        if (!c) return;

        const existing = constraints[assignmentId] || { type: 'any' as const, isLocked: false, lockedSlots: [] };
        const slots = existing.lockedSlots || [];
        const type = existing.type || 'any';
        const requiredPeriods = Math.max(0, Math.round(totalHoursNeeded || 0));
        
        const [dayKey, indexStr] = slotId.split('-');
        const index = parseInt(indexStr);
        const isRemoving = slots.includes(slotId);

        let targets = [slotId];
        
        // Check for conflicts if adding
        if (!isRemoving) {
            const teacherIds = getAssignmentTeacherIds(c.assignment);
            const unavailableTeacher = teacherIds
                .map(id => ({ id, teacher: teacherMap[id] as Teacher | undefined }))
                .find(item => item.teacher?.preferences?.unavailableSlots?.includes(slotId));
            
            // 1. Teacher Unavailable
            if (unavailableTeacher) {
                showLimitWarning('คาบนี้ถูกล็อคว่างไว้', `ครู ${formatTeacherDisplayName(unavailableTeacher.id)} ถูกกำหนดให้ว่างในคาบนี้`);
                return;
            }

            // 2. Overlap with other subjects
            const overlap = allAssignments.find(a => {
                if (a.compositeId === assignmentId) return false;
                const cst = constraints[a.compositeId];
                if (!cst?.isLocked || !cst.lockedSlots?.includes(slotId)) return false;
                
                const otherTeacherIds = getAssignmentTeacherIds(a.assignment);
                return Boolean(getAssignmentConflict(c, a, teacherIds, otherTeacherIds));
            });

            if (overlap) {
                const overlapTeacherIds = getAssignmentTeacherIds(overlap.assignment);
                const conflict = getAssignmentConflict(c, overlap, teacherIds, overlapTeacherIds);
                const msg = conflict?.type === 'teacher'
                    ? `ครู ${formatTeacherDisplayName(conflict.teacherId)} ติดสอนวิชา ${overlap.code} ในคาบนี้`
                    : conflict?.type === 'room'
                        ? `สถานที่สอนถูกใช้กับวิชา ${overlap.code} ในคาบนี้`
                        : `ชั้น/ห้องเดียวกันมีเรียนวิชา ${overlap.code} ในคาบนี้`;
                showLimitWarning('คาบนี้ถูกล็อคไว้แล้ว', msg);
                return;
            }

            // 3. Overlap with subjects already placed in the school timetable.
            const scheduledOverlap = (schoolMasterSchedule[slotId] || []).find(occupancy =>
                Boolean(getScheduledOccupancyConflict(c, occupancy, teacherIds))
            );

            if (scheduledOverlap?.course) {
                const conflict = getScheduledOccupancyConflict(c, scheduledOverlap, teacherIds);
                const scheduledClass = formatClassDisplayName(scheduledOverlap.classId || scheduledOverlap.course.classId);
                const msg = conflict?.type === 'teacher'
                    ? `ครู ${formatTeacherDisplayName(conflict.teacherId)} มีสอนวิชา ${scheduledOverlap.course.code || ''} ${scheduledClass} ในคาบนี้`
                    : conflict?.type === 'room'
                        ? `สถานที่สอนถูกใช้กับวิชา ${scheduledOverlap.course.code || ''} ${scheduledClass} ในคาบนี้`
                        : `ชั้น/ห้องเดียวกันมีเรียนวิชา ${scheduledOverlap.course.code || ''} ${scheduledClass} ในคาบนี้`;
                showLimitWarning('คาบนี้มีวิชาสอนอยู่แล้ว', msg);
                return;
            }
        }

        if (!isRemoving && (type === 'double' || type === 'mixed')) {
            const remaining = requiredPeriods - slots.length;
            const shouldPair = remaining >= 2 && (type === 'double' || (type === 'mixed' && remaining >= 2));

            if (shouldPair) {
                const partnerIndex = getPartnerIndexForPeriods(index, periodSettings);
                const partnerId = `${dayKey}-${partnerIndex}`;
                const partnerSetting = periodSettings[partnerIndex];

                if (partnerIndex === -1 || partnerIndex >= totalPeriods || !partnerSetting?.isTeachingPeriod) {
                    showLimitWarning('เลือกคาบคู่ไม่ได้', 'คาบนี้ไม่มีคาบคู่มาตรฐานที่ติดกัน กรุณาเลือกคาบในบล็อกคู่ เช่น 1-2, 3-4, 6-7 หรือ 8-9');
                    return;
                }

                if (slots.includes(partnerId)) {
                    showLimitWarning('คาบคู่ถูกเลือกไว้แล้ว', 'คาบที่เป็นคู่กับช่องนี้ถูกล็อกไว้แล้ว กรุณาเลือกคู่อื่นหรือยกเลิกคาบเดิมก่อน');
                    return;
                }

                // Check conflicts for partner too
                const teacherIds = getAssignmentTeacherIds(c.assignment);
                const unavailableTeacher = teacherIds
                    .map(id => ({ id, teacher: teacherMap[id] as Teacher | undefined }))
                    .find(item => item.teacher?.preferences?.unavailableSlots?.includes(partnerId));
                if (unavailableTeacher) {
                    showLimitWarning('คาบคู่ติดคาบว่าง', `คู่ของคาบนี้ (${partnerSetting.label}) ถูกล็อคว่างไว้สำหรับครู ${formatTeacherDisplayName(unavailableTeacher.id)}`);
                    return;
                }

                const partnerOverlap = allAssignments.find(a => {
                    if (a.compositeId === assignmentId) return false;
                    const cst = constraints[a.compositeId];
                    if (!cst?.isLocked || !cst.lockedSlots?.includes(partnerId)) return false;
                    const otherTeacherIds = getAssignmentTeacherIds(a.assignment);
                    return Boolean(getAssignmentConflict(c, a, teacherIds, otherTeacherIds));
                });

                if (partnerOverlap) {
                    const overlapTeacherIds = getAssignmentTeacherIds(partnerOverlap.assignment);
                    const conflict = getAssignmentConflict(c, partnerOverlap, teacherIds, overlapTeacherIds);
                    const reason = conflict?.type === 'teacher'
                        ? `ครู ${formatTeacherDisplayName(conflict.teacherId)} ติดสอน`
                        : conflict?.type === 'room'
                            ? 'สถานที่สอนถูกใช้แล้ว'
                            : 'ชั้น/ห้องเดียวกันมีเรียนแล้ว';
                    showLimitWarning('คาบคู่ติดวิชาอื่น', `คู่ของคาบนี้ (${partnerSetting.label}) ${reason}: ${partnerOverlap.code}`);
                    return;
                }

                const scheduledPartnerOverlap = (schoolMasterSchedule[partnerId] || []).find(occupancy =>
                    Boolean(getScheduledOccupancyConflict(c, occupancy, teacherIds))
                );

                if (scheduledPartnerOverlap?.course) {
                    const conflict = getScheduledOccupancyConflict(c, scheduledPartnerOverlap, teacherIds);
                    const scheduledClass = formatClassDisplayName(scheduledPartnerOverlap.classId || scheduledPartnerOverlap.course.classId);
                    const reason = conflict?.type === 'teacher'
                        ? `ครู ${formatTeacherDisplayName(conflict.teacherId)} มีสอน`
                        : conflict?.type === 'room'
                            ? 'สถานที่สอนถูกใช้แล้ว'
                            : 'ชั้น/ห้องเดียวกันมีเรียนแล้ว';
                    showLimitWarning('คาบคู่ติดวิชาสอน', `คู่ของคาบนี้ (${partnerSetting.label}) ${reason}: ${scheduledPartnerOverlap.course.code || ''} ${scheduledClass}`);
                    return;
                }

                targets.push(partnerId);
            }
        } else if (isRemoving) {
            const partnerIndex = getPartnerIndexForPeriods(index, periodSettings);
            if (partnerIndex !== -1) {
                const partnerId = `${dayKey}-${partnerIndex}`;
                if (slots.includes(partnerId) && (type === 'double' || type === 'mixed')) {
                    targets.push(partnerId);
                }
            }
        }

        const uniqueTargets = Array.from(new Set(targets));
        let newSlots = [...slots];
        if (isRemoving) {
            newSlots = newSlots.filter(s => !uniqueTargets.includes(s));
        } else {
            const slotsToAdd = uniqueTargets.filter(t => !newSlots.includes(t));

            if (requiredPeriods <= 0) {
                showLimitWarning('ยังไม่มีจำนวนคาบต่อสัปดาห์', 'กรุณากำหนดหน่วยกิตหรือคาบต่อสัปดาห์ของรายวิชานี้ก่อนล็อกคาบ');
                return;
            }

            if (newSlots.length + slotsToAdd.length > requiredPeriods) {
                showLimitWarning(
                    'เลือกคาบเกินจำนวนที่กำหนด',
                    `รายวิชานี้กำหนดได้สูงสุด ${requiredPeriods} คาบ/สัปดาห์ ตอนนี้ล็อกไว้แล้ว ${newSlots.length} คาบ`
                );
                return;
            }

            newSlots = [...newSlots, ...slotsToAdd];

            if (hasThreeConsecutivePeriods(newSlots)) {
                showLimitWarning(
                    'ไม่สามารถล็อกคาบนี้ได้',
                    'ไม่อนุญาตให้ล็อกสามคาบติดกันขึ้นไป สามารถล็อกได้สูงสุดสองคาบติดกันเท่านั้น'
                );
                return;
            }
        }

        setConstraints(prev => ({
            ...prev,
            [assignmentId]: { ...existing, isLocked: newSlots.length > 0, lockedSlots: newSlots }
        }));
    }, [constraints, isDarkMode, periodSettings, allAssignments, teacherMap, formatTeacherDisplayName, schoolMasterSchedule, getScheduledOccupancyConflict, formatClassDisplayName]);

    const handleSave = async () => {
        if (!schoolId) return;

        const invalidLockedAssignments = allAssignments.filter(asgn => {
            const requiredPeriods = getRequiredWeeklyPeriods(asgn);
            const lockedCount = constraints[asgn.compositeId]?.lockedSlots?.length || 0;
            return requiredPeriods > 0 && lockedCount > requiredPeriods;
        });

        if (invalidLockedAssignments.length > 0) {
            const first = invalidLockedAssignments[0];
            const requiredPeriods = getRequiredWeeklyPeriods(first);
            const lockedCount = constraints[first.compositeId]?.lockedSlots?.length || 0;
            showLimitWarning(
                'ยังบันทึกไม่ได้',
                `${first.code} ${first.title} ล็อกไว้ ${lockedCount} คาบ แต่กำหนดได้สูงสุด ${requiredPeriods} คาบ/สัปดาห์`
            );
            return;
        }

        const assignmentsWithThreeConsecutive = allAssignments.filter(asgn => {
            const lockedSlots = constraints[asgn.compositeId]?.lockedSlots || [];
            return hasThreeConsecutivePeriods(lockedSlots);
        });

        if (assignmentsWithThreeConsecutive.length > 0) {
            const first = assignmentsWithThreeConsecutive[0];
            showLimitWarning(
                'ยังบันทึกไม่ได้',
                `วิชา ${first.code} ${first.title} มีการล็อกสามคาบติดกันขึ้นไป ซึ่งไม่ได้รับอนุญาต`
            );
            return;
        }

        const lockedSlotConflicts: string[] = [];
        for (let i = 0; i < allAssignments.length; i++) {
            const first = allAssignments[i];
            const firstSlots = constraints[first.compositeId]?.lockedSlots || [];
            if (firstSlots.length === 0) continue;
            const firstTeacherIds = getAssignmentTeacherIds(first.assignment);

            for (let j = i + 1; j < allAssignments.length; j++) {
                const second = allAssignments[j];
                const secondSlots = constraints[second.compositeId]?.lockedSlots || [];
                if (secondSlots.length === 0) continue;

                const sharedSlots = firstSlots.filter(slotId => secondSlots.includes(slotId));
                if (sharedSlots.length === 0) continue;

                const secondTeacherIds = getAssignmentTeacherIds(second.assignment);
                const conflict = getAssignmentConflict(first, second, firstTeacherIds, secondTeacherIds);
                if (!conflict) continue;

                const reason = conflict.type === 'teacher'
                    ? `ครู ${formatTeacherDisplayName(conflict.teacherId)}`
                    : conflict.type === 'room'
                        ? 'สถานที่สอนเดียวกัน'
                        : 'ชั้น/ห้อง/กลุ่มเดียวกัน';
                lockedSlotConflicts.push(`${sharedSlots[0]}: ${first.code} ชนกับ ${second.code} (${reason})`);
            }
        }

        if (lockedSlotConflicts.length > 0) {
            showLimitWarning(
                'ยังบันทึกไม่ได้',
                `พบคาบล็อกชนกัน: ${lockedSlotConflicts.slice(0, 3).join(' / ')}${lockedSlotConflicts.length > 3 ? ` และอีก ${lockedSlotConflicts.length - 3} รายการ` : ''}`
            );
            return;
        }

        setIsSubmitting(true);
        try {
            const constraintDocRef = doc(db, 'school-settings', schoolId, 'configs', 'period_constraints');
            await setDoc(constraintDocRef, {
                mapping: constraints,
                updatedAt: serverTimestamp(),
                updatedBy: currentUser?.uid
            });
            Swal.fire({
                icon: 'success',
                title: 'บันทึกสำเร็จ',
                text: 'การตั้งค่ารูปแบบคาบเรียนถูกบันทึกเรียบร้อยแล้ว',
                timer: 2000,
                showConfirmButton: false,
                background: isDarkMode ? '#1a1b1e' : '#ffffff',
                color: isDarkMode ? '#ffffff' : '#000000',
            });
        } catch (error) {
            console.error("Error saving constraints:", error);
            Swal.fire('เกิดข้อผิดพลาด', 'ไม่สามารถบันทึกข้อมูลได้', 'error');
        } finally {
            setIsSubmitting(false);
        }
    };

    const filteredAssignments = useMemo(() => {
        return allAssignments.filter(asgn => {
            const matchesSearch = (asgn.title?.toLowerCase().includes(searchTerm.toLowerCase()) || 
                                  asgn.code?.toLowerCase().includes(searchTerm.toLowerCase()));
            
            const matchesSemester = filterSemester === '0' 
                                    ? String(asgn.semester) === '0'
                                    : (!asgn.semester || String(asgn.semester) === '0' || String(asgn.semester) === filterSemester);

            const matchesClass = (() => {
                if (filterClass === 'all') return true;
                const lowerSecondaryKeys = ['lower_secondary', 'junior_high', 'JUNIOR_HIGH', 'ม.ต้น'];
                const upperSecondaryKeys = ['upper_secondary', 'senior_high', 'SENIOR_HIGH', 'ม.ปลาย'];
                
                // Prioritize assignment-specific classLevels
                const classIds = asgn.assignment.classLevels || (Array.isArray(asgn.classId) ? asgn.classId : [asgn.classId]);

                const isLower = filterClass === 'lower_secondary';
                const isUpper = filterClass === 'upper_secondary';

                const classLabel = ALL_CLASSES[filterClass] || filterClass;

                return classIds.some(id => {
                    const level = id.split('/')[0];
                    if (isLower) return lowerSecondaryKeys.includes(level) || lowerSecondaryKeys.includes(id);
                    if (isUpper) return upperSecondaryKeys.includes(level) || upperSecondaryKeys.includes(id);
                    // Match if level (ม.1) or ID (ม.1/1) matches filter (m1) or label (ม.1)
                    return level === filterClass || level === classLabel || id === filterClass || id === classLabel;
                });
            })();

            const matchesRoomValue = (() => {
                if (filterRoom === 'all') return true;
                
                // Prioritize assignment-specific classLevels and room
                const classIds = asgn.assignment.classLevels || (Array.isArray(asgn.classId) ? asgn.classId : [asgn.classId]);
                const groupRoom = asgn.assignment.room;

                return classIds.some(id => {
                    const parts = id.split('/');
                    // Room could be in the ID (m1/1) or in the room field
                    const roomPart = (parts.length >= 2 ? parts[1].trim() : groupRoom)?.toString().trim();
                    if (!roomPart) return false;
                    
                    if (filterRoom === 'แผน') return roomPart === 'แผน';
                    return Number(roomPart) === Number(filterRoom);
                });
            })();

            const matchesGroupValue = filterGroup === 'all' || String(asgn.assignment.groupNumber) === filterGroup;
            const matchesSubjectGroup = filterSubjectGroup === 'all' || asgn.subjectGroup === filterSubjectGroup;
            const matchesActivity = showActivityCourses ? true : isAcademicCourse(asgn);

            const matchesPhysicalRoom = (() => {
                if (filterPhysicalRoom === 'all') return true;
                const roomIds = asgn.assignment.roomIds || [];
                // Check by roomName (matching the dropdown value) or roomCode
                return roomIds.some(rId => {
                    const roomObj = physicalRooms.find(pr => pr.id === rId);
                    return roomObj && roomObj.roomName === filterPhysicalRoom;
                });
            })();

            return matchesSearch && matchesSemester && matchesClass && matchesRoomValue && matchesGroupValue && matchesSubjectGroup && matchesActivity && matchesPhysicalRoom;
        });
    }, [allAssignments, searchTerm, filterSemester, filterClass, filterRoom, filterGroup, filterSubjectGroup, showActivityCourses, filterPhysicalRoom, physicalRooms]);

    // Pagination Logic
    const totalPages = Math.ceil(filteredAssignments.length / pageSize);
    const paginatedAssignments = useMemo(() => {
        const start = (currentPage - 1) * pageSize;
        return filteredAssignments.slice(start, start + pageSize);
    }, [filteredAssignments, currentPage, pageSize]);

    // Reset to page 1 when filters change
    useEffect(() => {
        setCurrentPage(1);
    }, [searchTerm, filterSemester, filterClass, filterGroup, filterSubjectGroup, showActivityCourses, filterPhysicalRoom]);

    return (
        <MainLayout>
            <div className="flex flex-col text-slate-900 dark:text-white transition-colors duration-300 font-inter select-none">
                
                {/* 1. TOP HEADER SECTION */}
                <header className="sticky top-[60px] z-[44] bg-white/95 dark:bg-[#2a2b2f]/95 backdrop-blur-2xl border-b border-slate-200 dark:border-white/[0.03] shadow-lg px-6 py-5">
                    <div className="max-w-[1600px] mx-auto flex items-center justify-between">
                        <div className="flex items-center gap-5">
                            <div className="ml-12 mr-2"> {/* Added margin to clear the sidebar collapse button */}
                                <BackButton to="/academic/teacher-schedule" />
                            </div>
                            <div className="flex flex-col">
                                <h1 className="text-2xl font-black text-slate-900 dark:text-white uppercase leading-none">จัดการรูปแบบคาบเรียน</h1>
                                <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] mt-2">กำหนดเงื่อนไขและรูปแบบคาบคู่/เดี่ยว</p>
                            </div>
                        </div>

                        <div className="flex items-center gap-4">
                            {/* Academic Year Selector Moved Here */}
                            <div className="flex items-center gap-3 px-4 py-2 bg-slate-100 dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-xl">
                                <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest whitespace-nowrap">ปีการศึกษา</label>
                                <div className="relative flex items-center group">
                                    <select 
                                        value={selectedYear}
                                        onChange={(e) => setSelectedYear(e.target.value)}
                                        className="bg-transparent text-xs font-black text-slate-700 dark:text-slate-200 appearance-none cursor-pointer focus:outline-none pr-6"
                                    >
                                        {[0, -1, -2].map(offset => {
                                            const year = (getCurrentThaiYear() + offset).toString();
                                            return <option key={year} value={year} className="bg-white dark:bg-[#2a2b2f] text-slate-700 dark:text-slate-200">ปี {year}</option>;
                                        })}
                                    </select>
                                    <ChevronDown size={12} className="absolute right-0 text-slate-400 pointer-events-none group-hover:text-indigo-500 transition-colors" />
                                </div>
                            </div>

                            <div className="h-8 w-px bg-slate-200 dark:bg-white/10 mx-1"></div>

                            <button
                                onClick={handleAutoConfigureConstraints}
                                disabled={isLoading || allAssignments.length === 0}
                                className="flex items-center gap-2 px-6 py-3.5 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-500 hover:bg-amber-500/20 transition-all text-[11px] font-black uppercase tracking-widest shadow-lg disabled:opacity-40 disabled:cursor-not-allowed"
                            >
                                <Zap size={16} />
                                <span>กำหนดรูปแบบคาบอัตโนมัติ</span>
                            </button>
                            <button 
                                onClick={handleSave}
                                disabled={isSubmitting}
                                className={`flex items-center gap-2 px-8 py-3.5 rounded-xl bg-indigo-600 text-white text-[11px] font-black uppercase tracking-widest shadow-[0_15px_30px_rgba(79,70,229,0.4)] hover:bg-indigo-500 transition-all active:scale-95 ${isSubmitting ? 'opacity-50' : ''}`}
                            >
                                <Save size={16} />
                                <span>{isSubmitting ? 'กำลังบันทึก...' : 'บันทึกข้อมูล'}</span>
                            </button>
                        </div>
                    </div>
                </header>

                <main className="max-w-[1600px] mx-auto w-full px-6 py-5">
                    
                    {/* 2. FILTER BAR SECTION */}
                    <section className="relative z-10 bg-white dark:bg-[#2a2b2f] border border-slate-200 dark:border-white/5 rounded-2xl p-5 shadow-lg mb-5">
                        <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-7 gap-4 items-end">

                            {/* Search */}
                            <div className="space-y-1.5">
                                <label className="text-[10px] font-black text-slate-400 uppercase tracking-normal ml-1">ค้นหา</label>
                                <div className="relative group">
                                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-indigo-500 transition-colors" size={15} />
                                    <input 
                                        type="text" 
                                        value={searchTerm}
                                        onChange={(e) => setSearchTerm(e.target.value)}
                                        placeholder="รหัส, ชื่อวิชา..."
                                        className="w-full h-10 pl-9 pr-3 bg-slate-50 dark:bg-white/[0.02] border border-slate-200 dark:border-white/5 rounded-lg text-xs font-bold focus:outline-none focus:border-indigo-500/50 transition-all"
                                    />
                                </div>
                            </div>

                            {/* Semester */}
                            <div className="space-y-1.5">
                                <label className="text-[10px] font-black text-slate-400 uppercase tracking-normal ml-1">ภาคเรียน</label>
                                <div className="relative group">
                                    <select 
                                        value={filterSemester}
                                        onChange={(e) => setFilterSemester(e.target.value)}
                                        className="w-full h-10 px-4 pr-9 bg-slate-50 dark:bg-white/[0.02] border border-slate-200 dark:border-white/5 rounded-lg text-xs font-bold text-slate-700 dark:text-slate-200 appearance-none cursor-pointer focus:outline-none focus:border-indigo-500/50 transition-all"
                                    >
                                        <option value="1" className="bg-white dark:bg-[#2a2b2f] text-slate-700 dark:text-slate-200">ภาคเรียนที่ 1</option>
                                        <option value="2" className="bg-white dark:bg-[#2a2b2f] text-slate-700 dark:text-slate-200">ภาคเรียนที่ 2</option>
                                    </select>
                                    <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none group-hover:text-indigo-500 transition-colors" />
                                </div>
                            </div>

                            {/* Class Level */}
                            <div className="space-y-1.5">
                                <label className="text-[10px] font-black text-slate-400 uppercase tracking-normal ml-1">ระดับชั้น</label>
                                <div className="relative group">
                                    <select 
                                        value={filterClass}
                                        onChange={(e) => setFilterClass(e.target.value)}
                                        className="w-full h-10 px-4 pr-9 bg-slate-50 dark:bg-white/[0.02] border border-slate-200 dark:border-white/5 rounded-lg text-xs font-bold text-slate-700 dark:text-slate-200 appearance-none cursor-pointer focus:outline-none focus:border-indigo-500/50 transition-all"
                                    >
                                        <option value="all" className="bg-white dark:bg-[#2a2b2f] text-slate-700 dark:text-slate-200">ทุกระดับชั้น</option>
                                        {availableClasses.map(c => (
                                            <option key={c.key} value={c.key} className="bg-white dark:bg-[#2a2b2f] text-slate-700 dark:text-slate-200">{c.label}</option>
                                        ))}
                                    </select>
                                    <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none group-hover:text-indigo-500 transition-colors" />
                                </div>
                            </div>

                            {/* Room */}
                            <div className="space-y-1.5">
                                <label className="text-[10px] font-black text-slate-400 uppercase tracking-normal ml-1">ห้อง</label>
                                <div className="relative group">
                                    <select 
                                        value={filterRoom}
                                        onChange={(e) => setFilterRoom(e.target.value)}
                                        className="w-full h-10 px-4 pr-9 bg-slate-50 dark:bg-white/[0.02] border border-slate-200 dark:border-white/5 rounded-lg text-xs font-bold text-slate-700 dark:text-slate-200 appearance-none cursor-pointer focus:outline-none focus:border-indigo-500/50 transition-all"
                                    >
                                        <option value="all" className="bg-white dark:bg-[#2a2b2f] text-slate-700 dark:text-slate-200">ทุกห้อง</option>
                                        {Array.from({ length: 20 }, (_, i) => {
                                            const num = (i + 1).toString();
                                            return <option key={num} value={num} className="bg-white dark:bg-[#2a2b2f] text-slate-700 dark:text-slate-200">ห้อง {num}</option>;
                                        })}
                                        <option value="แผน" className="bg-white dark:bg-[#2a2b2f] text-slate-700 dark:text-slate-200">ห้อง แผน</option>
                                    </select>
                                    <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none group-hover:text-indigo-500 transition-colors" />
                                </div>
                            </div>

                            {/* Group */}
                            <div className="space-y-1.5">
                                <label className="text-[10px] font-black text-slate-400 uppercase tracking-normal ml-1">กลุ่มเรียน</label>
                                <div className="relative group">
                                    <select 
                                        value={filterGroup}
                                        onChange={(e) => setFilterGroup(e.target.value)}
                                        className="w-full h-10 px-4 pr-9 bg-slate-50 dark:bg-white/[0.02] border border-slate-200 dark:border-white/5 rounded-lg text-xs font-bold text-slate-700 dark:text-slate-200 appearance-none cursor-pointer focus:outline-none focus:border-indigo-500/50 transition-all"
                                    >
                                        <option value="all" className="bg-white dark:bg-[#2a2b2f] text-slate-700 dark:text-slate-200">ทุกกลุ่มเรียน</option>
                                        {Array.from({ length: 20 }, (_, i) => i + 1).map(num => <option key={num} value={String(num)} className="bg-white dark:bg-[#2a2b2f] text-slate-700 dark:text-slate-200">กลุ่ม {num}</option>)}
                                    </select>
                                    <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none group-hover:text-indigo-500 transition-colors" />
                                </div>
                            </div>

                            {/* Subject Group */}
                            <div className="space-y-1.5">
                                <label className="text-[10px] font-black text-slate-400 uppercase tracking-normal ml-1">กลุ่มสาระฯ</label>
                                <div className="relative group">
                                    <select 
                                        value={filterSubjectGroup}
                                        onChange={(e) => setFilterSubjectGroup(e.target.value)}
                                        className="w-full h-10 px-4 pr-9 bg-slate-50 dark:bg-white/[0.02] border border-slate-200 dark:border-white/5 rounded-lg text-xs font-bold text-slate-700 dark:text-slate-200 appearance-none cursor-pointer focus:outline-none focus:border-indigo-500/50 transition-all"
                                    >
                                        <option value="all" className="bg-white dark:bg-[#2a2b2f] text-slate-700 dark:text-slate-200">ทุกกลุ่มสาระฯ</option>
                                        {subjectGroups.map(group => <option key={group} value={group} className="bg-white dark:bg-[#2a2b2f] text-slate-700 dark:text-slate-200">{group}</option>)}
                                    </select>
                                    <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none group-hover:text-indigo-500 transition-colors" />
                                </div>
                            </div>

                            {/* Physical Room */}
                            <div className="space-y-1.5">
                                <label className="text-[10px] font-black text-slate-400 uppercase tracking-normal ml-1">สถานที่</label>
                                <div className="relative group">
                                    <select 
                                        value={filterPhysicalRoom}
                                        onChange={(e) => setFilterPhysicalRoom(e.target.value)}
                                        className="w-full h-10 px-4 pr-9 bg-slate-50 dark:bg-white/[0.02] border border-slate-200 dark:border-white/5 rounded-lg text-xs font-bold text-slate-700 dark:text-slate-200 appearance-none cursor-pointer focus:outline-none focus:border-indigo-500/50 transition-all"
                                    >
                                        <option value="all" className="bg-white dark:bg-[#2a2b2f] text-slate-700 dark:text-slate-200">ทุกสถานที่</option>
                                        {physicalRooms.map(room => (
                                            <option key={room.id} value={room.roomName} className="bg-white dark:bg-[#2a2b2f] text-slate-700 dark:text-slate-200">
                                                {room.roomName} ({room.roomCode})
                                            </option>
                                        ))}
                                    </select>
                                    <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none group-hover:text-indigo-500 transition-colors" />
                                </div>
                            </div>

                        </div>

                        <div className="mt-4 pt-3 border-t border-slate-100 dark:border-white/5 flex flex-wrap items-center justify-between gap-3">
                            <div className="flex items-center gap-4">
                                <div className="flex items-center gap-2.5">
                                    <button 
                                        onClick={() => setShowActivityCourses(!showActivityCourses)}
                                        className={`w-9 h-5 rounded-full transition-all relative ${showActivityCourses ? 'bg-indigo-600' : 'bg-slate-300 dark:bg-white/10'}`}
                                    >
                                        <div className={`absolute top-1 w-3 h-3 rounded-full bg-white transition-all ${showActivityCourses ? 'left-5' : 'left-1'}`}></div>
                                    </button>
                                    <span className="text-[11px] font-black text-slate-600 dark:text-slate-400 uppercase tracking-normal">แสดงวิชากิจกรรมพัฒนาผู้เรียน</span>
                                </div>
                            </div>

                            <div className="flex items-center gap-3 text-[10px] font-black text-slate-400 uppercase tracking-normal italic">
                                <span>*คาบคู่ = (2), คาบเดี่ยว = (1), ผสม = (2+1)</span>
                            </div>
                        </div>
                    </section>

                    {/* 3. DATA TABLE SECTION */}
                    <div className="bg-white dark:bg-[#2a2b2f] border border-slate-200 dark:border-white/5 rounded-2xl overflow-visible shadow-2xl">
                        <table className="w-full text-left border-collapse">
                            <thead>
                                <tr className="bg-slate-100 dark:bg-white/[0.02] border-b border-slate-200 dark:border-white/[0.05]">
                                    <th className="px-2 py-4 text-[12px] font-black text-slate-500 uppercase tracking-normal text-center">ชั้นเรียน</th>
                                    <th className="px-2 py-4 text-[12px] font-black text-slate-500 uppercase tracking-normal text-center">สถานที่สอน</th>
                                    <th className="px-2 py-4 text-[12px] font-black text-slate-500 uppercase tracking-normal text-center">รหัส/ชื่อวิชา</th>
                                    <th className="px-2 py-4 text-[12px] font-black text-slate-500 uppercase tracking-normal text-center">กลุ่ม</th>
                                    <th className="px-2 py-4 text-[12px] font-black text-slate-500 uppercase tracking-normal text-center">ครูผู้สอน</th>
                                    <th className="px-2 py-4 text-[12px] font-black text-slate-500 uppercase tracking-normal text-center">หน่วยกิต</th>
                                    <th className="px-2 py-4 text-[12px] font-black text-slate-500 uppercase tracking-normal text-center">คาบ/สัปดาห์</th>
                                    <th className="px-2 py-4 text-[12px] font-black text-slate-500 uppercase tracking-normal text-center">รูปแบบคาบ</th>
                                    <th className="px-2 py-4 text-[12px] font-black text-slate-500 uppercase tracking-normal text-center">ล็อกคาบสอน</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100 dark:divide-white/5">
                                {isLoading ? (
                                    Array.from({ length: 8 }).map((_, i) => (
                                        <tr key={i} className="animate-pulse">
                                            <td colSpan={9} className="px-8 py-6 h-20 bg-slate-50/50 dark:bg-white/[0.01]"></td>
                                        </tr>
                                    ))
                                ) : paginatedAssignments.length > 0 ? (
                                    paginatedAssignments.map(asgn => {
                                        const current = constraints[asgn.compositeId] || { type: 'any', isLocked: false };
                                        const teacherSummaries = getTeacherSummaries(asgn.assignment);
                                        const primaryTeacher = teacherSummaries[0];
                                        const teacherCount = teacherSummaries.length;
                                        const requiredPeriods = getRequiredWeeklyPeriods(asgn);
                                        const lockedCount = current.lockedSlots?.length || 0;
                                        const isOverLocked = requiredPeriods > 0 && lockedCount > requiredPeriods;

                                        // Group Colors
                                        const groupColors = [
                                            { bg: 'bg-blue-600', shadow: 'shadow-blue-600/40' },
                                            { bg: 'bg-indigo-600', shadow: 'shadow-indigo-600/40' },
                                            { bg: 'bg-violet-600', shadow: 'shadow-violet-600/40' },
                                            { bg: 'bg-purple-600', shadow: 'shadow-purple-600/40' },
                                            { bg: 'bg-fuchsia-600', shadow: 'shadow-fuchsia-600/40' },
                                            { bg: 'bg-pink-600', shadow: 'shadow-pink-600/40' },
                                            { bg: 'bg-rose-600', shadow: 'shadow-rose-600/40' },
                                        ];
                                        const groupNumber = normalizeGroupNumber(asgn.assignment.groupNumber);
                                        const gColor = groupColors[(groupNumber - 1) % groupColors.length];

                                        return (
                                            <tr key={asgn.compositeId} className={`group hover:bg-slate-50 dark:hover:bg-white/[0.02] transition-colors border-b border-slate-100 dark:border-white/5 last:border-0 ${openExcludedMenu === asgn.compositeId ? 'relative z-50' : ''}`}>
                                                <td className="px-2 py-3.5 text-center">
                                                    <div className="flex flex-wrap justify-center gap-1.5">
                                                        {(() => {
                                                            const classLevels = asgn.assignment.classLevels || (Array.isArray(asgn.classId) ? asgn.classId : [asgn.classId]);
                                                            const roomNumber = asgn.assignment.room;
                                                            return classLevels.map((id, idx) => {
                                                                const parts = id.split('/');
                                                                const levelKey = parts[0];
                                                                const room = parts[1] || roomNumber;
                                                                const label = `${ALL_CLASSES[levelKey] || levelKey}${room ? `/${room}` : ''}`;
                                                                return (
                                                                    <span key={idx} className="text-[13px] font-black text-slate-900 dark:text-white whitespace-nowrap">
                                                                        {label}
                                                                    </span>
                                                                );
                                                            });
                                                        })()}
                                                    </div>
                                                </td>
                                                <td className="px-2 py-3.5 text-center">
                                                    <div className="flex flex-wrap justify-center gap-1.5">
                                                        {asgn.assignment.roomIds && asgn.assignment.roomIds.map(roomId => {
                                                            const room = physicalRooms.find(r => r.id === roomId);
                                                            if (!room) return null;
                                                            return (
                                                                <span key={roomId} className="text-[11px] font-black text-slate-600 dark:text-slate-400">
                                                                    {room.roomCode || room.roomName}
                                                                </span>
                                                            );
                                                        })}
                                                    </div>
                                                </td>
                                                <td className="px-2 py-3.5 text-center">
                                                    <div className="flex items-center justify-center gap-1.5 overflow-hidden">
                                                        <span className="text-[11px] font-black text-indigo-600 dark:text-indigo-400 uppercase tracking-wider shrink-0">{asgn.code}</span>
                                                        <span className="text-[12px] font-bold text-slate-900 dark:text-white truncate max-w-[130px]" title={asgn.title}>{asgn.title}</span>
                                                    </div>
                                                </td>
                                                <td className="px-2 py-3.5 text-center">
                                                    <span className="text-xs font-black text-slate-700 dark:text-slate-300">
                                                        {groupNumber}
                                                    </span>
                                                </td>
                                                <td className="px-2 py-3.5 text-center">
                                                    <div className="relative group/teachers flex items-center justify-center gap-1.5">
                                                        <span className="text-[10px] font-black text-slate-400 shrink-0">
                                                            {primaryTeacher?.code || '-'}
                                                        </span>
                                                        <span className="text-[12px] font-bold text-slate-700 dark:text-slate-200 truncate max-w-[110px]">
                                                            {primaryTeacher?.name || 'ไม่ระบุครู'}
                                                        </span>
                                                        {teacherCount > 1 && (
                                                            <span className="inline-flex items-center gap-0.5 rounded-full border border-indigo-200 dark:border-indigo-500/30 bg-indigo-50 dark:bg-indigo-500/10 px-1.5 py-0.5 text-[9px] font-black text-indigo-600 dark:text-indigo-300 shadow-sm">
                                                                <Users size={10} strokeWidth={3} />
                                                                +{teacherCount - 1}
                                                            </span>
                                                        )}
                                                        {teacherCount > 0 && (
                                                            <div className="pointer-events-none absolute left-1/2 top-full z-[80] mt-2 hidden w-72 -translate-x-1/2 rounded-xl border border-slate-200 bg-white p-3 text-left shadow-2xl group-hover/teachers:block dark:border-white/10 dark:bg-[#2a2b2f]">
                                                                <div className="mb-2 flex items-center gap-2 border-b border-slate-100 pb-2 dark:border-white/5">
                                                                    <Users size={14} className="text-indigo-500" />
                                                                    <span className="text-[11px] font-black uppercase tracking-widest text-slate-500 dark:text-slate-400">
                                                                        ครูผู้สอนทั้งหมด {teacherCount} คน
                                                                    </span>
                                                                </div>
                                                                <div className="space-y-1.5">
                                                                    {teacherSummaries.map(item => (
                                                                        <div key={item.id} className="flex items-start gap-2 rounded-lg bg-slate-50 px-2.5 py-2 dark:bg-white/[0.03]">
                                                                            <span className="min-w-12 text-[11px] font-black text-indigo-600 dark:text-indigo-300">
                                                                                {item.code}
                                                                            </span>
                                                                            <span className="text-[12px] font-bold leading-snug text-slate-700 dark:text-slate-100">
                                                                                {item.name}
                                                                            </span>
                                                                        </div>
                                                                    ))}
                                                                </div>
                                                            </div>
                                                        )}
                                                    </div>
                                                </td>
                                                <td className="px-2 py-3.5 text-center">
                                                    <span className="text-xs font-black text-indigo-600 dark:text-indigo-400">
                                                        {asgn.credits !== undefined ? asgn.credits : (asgn.hoursPerWeek ? (asgn.hoursPerWeek / 2) : 0)}
                                                    </span>
                                                </td>
                                                <td className="px-2 py-3.5 text-center">
                                                    <div className="flex flex-col items-center">
                                                        <span className={`text-xs font-black ${isOverLocked || (asgn.credits && asgn.hoursPerWeek && Math.round(parseScheduleNumber(asgn.hoursPerWeek)) !== Math.round(parseScheduleNumber(asgn.credits) * 2)) ? 'text-red-500' : 'text-slate-900 dark:text-white'}`}>
                                                            {requiredPeriods}
                                                        </span>
                                                        {lockedCount > 0 && (
                                                            <span className={`text-[9px] font-black uppercase mt-0.5 ${isOverLocked ? 'text-red-500' : 'text-amber-500'}`}>
                                                                ล็อก {lockedCount}/{requiredPeriods || '-'}
                                                            </span>
                                                        )}
                                                    </div>
                                                </td>
                                                <td className="px-2 py-3.5 text-center">
                                                    <div className="flex flex-col gap-1.5 items-center justify-center">
                                                        <div className="relative w-full min-w-[130px] max-w-[140px]">
                                                            <select 
                                                                value={current.type}
                                                                onChange={(e) => handleConstraintChange(asgn.compositeId, e.target.value as any)}
                                                                className={`w-full h-9 pl-3 pr-8 rounded-xl text-[12px] font-black appearance-none cursor-pointer focus:outline-none focus:ring-2 transition-all shadow-sm border ${
                                                                    current.type === 'double' ? 'bg-indigo-50 dark:bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border-indigo-200 dark:border-indigo-500/30 focus:ring-indigo-500/20' :
                                                                    current.type === 'single' ? 'bg-emerald-50 dark:bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-200 dark:border-emerald-500/30 focus:ring-emerald-500/20' :
                                                                    current.type === 'mixed' ? 'bg-amber-50 dark:bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-200 dark:border-amber-500/30 focus:ring-amber-500/20' :
                                                                    'bg-slate-50 dark:bg-white/5 text-slate-600 dark:text-slate-400 border-slate-200 dark:border-white/10 focus:ring-slate-500/20'
                                                                }`}
                                                            >
                                                                <option value="any" className="bg-white dark:bg-[#2a2b2f]">รูปแบบ (อัตโนมัติ)</option>
                                                                {(() => {
                                                                    const h = getRequiredWeeklyPeriods(asgn);
                                                                    if (h === 1) return (
                                                                        <option value="single" className="bg-white dark:bg-[#2a2b2f]">คาบเดี่ยว (1)</option>
                                                                    );
                                                                    if (h === 2) return (
                                                                        <>
                                                                            <option value="single" className="bg-white dark:bg-[#2a2b2f]">คาบเดี่ยว (1+1)</option>
                                                                            <option value="double" className="bg-white dark:bg-[#2a2b2f]">คาบคู่ (2)</option>
                                                                        </>
                                                                    );
                                                                    if (h === 3) return (
                                                                        <>
                                                                            <option value="single" className="bg-white dark:bg-[#2a2b2f]">คาบเดี่ยว (1+1+1)</option>
                                                                            <option value="mixed" className="bg-white dark:bg-[#2a2b2f]">คู่+เดี่ยว (2+1)</option>
                                                                        </>
                                                                    );
                                                                    if (h === 4) return (
                                                                        <>
                                                                            <option value="single" className="bg-white dark:bg-[#2a2b2f]">คาบเดี่ยว (1*4)</option>
                                                                            <option value="double" className="bg-white dark:bg-[#2a2b2f]">คาบคู่ x2 (2+2)</option>
                                                                            <option value="mixed" className="bg-white dark:bg-[#2a2b2f]">ผสม (2+1+1)</option>
                                                                        </>
                                                                    );
                                                                    return (
                                                                        <>
                                                                            <option value="single" className="bg-white dark:bg-[#2a2b2f]">เดี่ยวทั้งหมด (1*{h})</option>
                                                                            <option value="double" className="bg-white dark:bg-[#2a2b2f]">เน้นคู่ (2+2+...)</option>
                                                                            <option value="mixed" className="bg-white dark:bg-[#2a2b2f]">ผสม (2+1+...)</option>
                                                                        </>
                                                                    );
                                                                })()}
                                                            </select>
                                                            <ChevronDown size={12} className={`absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none ${
                                                                current.type === 'double' ? 'text-indigo-400' :
                                                                current.type === 'single' ? 'text-emerald-400' :
                                                                current.type === 'mixed' ? 'text-amber-400' :
                                                                'text-slate-400'
                                                            }`} />
                                                        </div>
                                                        
                                                        <div className="flex items-center justify-center gap-1.5 w-full">
                                                            {/* Preference for Double Part */}
                                                            {(current.type === 'double' || current.type === 'mixed') && (
                                                                <div className="relative min-w-[75px] animate-in fade-in zoom-in-95 duration-200">
                                                                    <select 
                                                                        value={current.doublePreference || 'any'}
                                                                        onChange={(e) => handlePreferenceChange(asgn.compositeId, 'doublePreference', e.target.value as any)}
                                                                        className="w-full h-8 px-2 bg-indigo-500/5 dark:bg-indigo-500/10 border border-indigo-500/20 rounded-lg text-[10px] font-black text-indigo-700 dark:text-indigo-300 appearance-none cursor-pointer focus:outline-none focus:ring-1 focus:ring-indigo-500/30 transition-all"
                                                                    >
                                                                        <option value="any" className="bg-white dark:bg-[#2a2b2f]">คู่: อัตโนมัติ</option>
                                                                        <option value="morning" className="bg-white dark:bg-[#2a2b2f]">คู่: เช้า</option>
                                                                        <option value="afternoon" className="bg-white dark:bg-[#2a2b2f]">คู่: บ่าย</option>
                                                                    </select>
                                                                </div>
                                                            )}

                                                            {/* Preference for Single Part */}
                                                            {(current.type === 'single' || current.type === 'mixed') && (
                                                                <div className="relative min-w-[75px] animate-in fade-in zoom-in-95 duration-200">
                                                                    <select 
                                                                        value={current.singlePreference || 'any'}
                                                                        onChange={(e) => handlePreferenceChange(asgn.compositeId, 'singlePreference', e.target.value as any)}
                                                                        className="w-full h-8 px-2 bg-emerald-500/5 dark:bg-emerald-500/10 border border-emerald-500/20 rounded-lg text-[10px] font-black text-emerald-700 dark:text-emerald-300 appearance-none cursor-pointer focus:outline-none focus:ring-1 focus:ring-emerald-500/30 transition-all"
                                                                    >
                                                                        <option value="any" className="bg-white dark:bg-[#2a2b2f]">เดี่ยว: อัตโนมัติ</option>
                                                                        <option value="morning" className="bg-white dark:bg-[#2a2b2f]">เดี่ยว: เช้า</option>
                                                                        <option value="afternoon" className="bg-white dark:bg-[#2a2b2f]">เดี่ยว: บ่าย</option>
                                                                    </select>
                                                                </div>
                                                            )}

                                                            {/* Excluded Days Selector */}
                                                            <div className="relative">
                                                                <button 
                                                                    onClick={(e) => {
                                                                        e.stopPropagation();
                                                                        setOpenExcludedMenu(openExcludedMenu === asgn.compositeId ? null : asgn.compositeId);
                                                                    }}
                                                                    className={`w-8 h-8 rounded-lg flex items-center justify-center transition-all ${current.excludedDays?.length ? 'bg-red-500/10 text-red-500 border border-red-500/20 shadow-[0_0_10px_rgba(239,68,68,0.1)]' : 'bg-slate-100 dark:bg-white/5 text-slate-400 border border-transparent hover:border-red-500/30 hover:text-red-500'}`}
                                                                >
                                                                    <CalendarX size={14} />
                                                                    {current.excludedDays && current.excludedDays.length > 0 && (
                                                                        <span className="absolute -top-1 -right-1 w-3.5 h-3.5 bg-red-500 text-white text-[8px] font-black rounded-full flex items-center justify-center border-2 border-white dark:border-[#2a2b2f]">
                                                                            {current.excludedDays.length}
                                                                        </span>
                                                                    )}
                                                                </button>

                                                                {openExcludedMenu === asgn.compositeId && (
                                                                    <>
                                                                        <div className="fixed inset-0 z-40" onClick={() => setOpenExcludedMenu(null)} />
                                                                        <div className="absolute right-0 top-full mt-2 z-50 bg-white dark:bg-[#2a2b2f] border border-slate-200 dark:border-white/10 rounded-xl shadow-2xl p-2 min-w-[140px] animate-in fade-in slide-in-from-top-2 duration-200">
                                                                            <div className="px-2 py-1.5 mb-1 border-b border-slate-100 dark:border-white/5">
                                                                                <span className="text-[12px] font-black text-slate-400 uppercase tracking-widest">ยกเว้นวันสอน:</span>
                                                                            </div>
                                                                            <div className="space-y-1">
                                                                                {DAYS.map(day => {
                                                                                    const isExcluded = current.excludedDays?.includes(day.key);
                                                                                    return (
                                                                                        <button
                                                                                            key={day.key}
                                                                                            onClick={() => handleExcludedDayToggle(asgn.compositeId, day.key)}
                                                                                            className={`w-full flex items-center justify-between px-2 py-1.5 rounded-lg transition-all ${isExcluded ? 'bg-red-500/10 text-red-600 dark:text-red-400 font-bold' : 'text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-white/5'}`}
                                                                                        >
                                                                                            <span className="text-[13px]">{day.label}</span>
                                                                                            {isExcluded && <Check size={10} strokeWidth={3} />}
                                                                                        </button>
                                                                                    );
                                                                                })}
                                                                            </div>
                                                                        </div>
                                                                    </>
                                                                )}
                                                            </div>
                                                        </div>
                                                    </div>
                                                </td>
                                                <td className="px-2 py-3.5 text-center">
                                                    <button 
                                                        onClick={() => setSlotModalCourse(asgn)}
                                                        className={`w-9 h-9 rounded-xl flex items-center justify-center mx-auto transition-all duration-300 shadow-sm ${current.isLocked ? 'bg-amber-500 text-white shadow-amber-500/20 scale-110' : 'bg-slate-100 dark:bg-white/[0.03] text-slate-400 dark:text-slate-600 border border-transparent hover:border-amber-500/30 hover:text-amber-500 hover:scale-110'}`}
                                                    >
                                                        {current.isLocked ? <Lock size={16} className="drop-shadow-[0_0_8px_rgba(255,255,255,0.5)]" /> : <Unlock size={16} />}
                                                    </button>
                                                </td>
                                            </tr>
                                        );
                                    })
                                ) : (
                                    <tr>
                                        <td colSpan={9} className="px-8 py-20 text-center">
                                            <div className="flex flex-col items-center">
                                                <BookOpen size={48} className="text-slate-200 dark:text-white/5 mb-4" />
                                                <span className="text-sm font-black text-slate-400 uppercase tracking-widest">ไม่พบข้อมูลรายวิชา</span>
                                            </div>
                                        </td>
                                    </tr>
                                )}
                            </tbody>
                        </table>

                        {/* Pagination Footer */}
                        {totalPages > 1 && (
                            <div className="px-8 py-6 border-t border-slate-100 dark:border-white/[0.03] flex items-center justify-between bg-slate-50/50 dark:bg-white/[0.01]">
                                <div className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
                                    แสดง {Math.min(filteredAssignments.length, (currentPage - 1) * pageSize + 1)} - {Math.min(filteredAssignments.length, currentPage * pageSize)} จากทั้งหมด {filteredAssignments.length} รายการ
                                </div>
                                <div className="flex items-center gap-2">
                                    <button 
                                        onClick={() => setCurrentPage(1)}
                                        disabled={currentPage === 1}
                                        className="px-4 py-2 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all hover:bg-slate-100 dark:hover:bg-white/5 disabled:opacity-30 text-slate-500"
                                    >
                                        หน้าแรก
                                    </button>
                                    <button 
                                        onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                                        disabled={currentPage === 1}
                                        className="w-10 h-10 rounded-lg flex items-center justify-center transition-all hover:bg-slate-100 dark:hover:bg-white/5 disabled:opacity-30 text-slate-500"
                                    >
                                        <ChevronLeft size={16} />
                                    </button>

                                    <div className="flex items-center gap-1 mx-2">
                                        {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                                            let pageNum;
                                            if (totalPages <= 5) pageNum = i + 1;
                                            else if (currentPage <= 3) pageNum = i + 1;
                                            else if (currentPage >= totalPages - 2) pageNum = totalPages - 4 + i;
                                            else pageNum = currentPage - 2 + i;

                                            return (
                                                <button
                                                    key={pageNum}
                                                    onClick={() => setCurrentPage(pageNum)}
                                                    className={`w-10 h-10 rounded-lg text-xs font-black transition-all ${currentPage === pageNum ? 'bg-indigo-600 text-white shadow-lg' : 'text-slate-500 hover:bg-slate-100 dark:hover:bg-white/5'}`}
                                                >
                                                    {pageNum}
                                                </button>
                                            );
                                        })}
                                    </div>

                                    <button 
                                        onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                                        disabled={currentPage === totalPages}
                                        className="w-10 h-10 rounded-lg flex items-center justify-center transition-all hover:bg-slate-100 dark:hover:bg-white/5 disabled:opacity-30 text-slate-500"
                                    >
                                        <ChevronRight size={16} />
                                    </button>
                                    <button 
                                        onClick={() => setCurrentPage(totalPages)}
                                        disabled={currentPage === totalPages}
                                        className="px-4 py-2 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all hover:bg-slate-100 dark:hover:bg-white/5 disabled:opacity-30 text-slate-500"
                                    >
                                        หน้าสุดท้าย
                                    </button>
                                </div>
                            </div>
                        )}
                    </div>
                </main>
            </div>

            {/* SLOT PICKER MODAL */}
            {slotModalCourse && (() => {
                const c = slotModalCourse;
                const cst = constraints[c.compositeId] || { type: 'any', isLocked: false, lockedSlots: [] };
                const locked = cst.lockedSlots || [];
                const normalizedPeriodSettings = normalizePeriodSettings(periodSettings);
                const displayPeriods = getTimetableDisplayPeriods(normalizedPeriodSettings).filter(p => p.isTeachingPeriod || p.id === 'lunch');
                const classLabel = ALL_CLASSES[c.classId] || c.classId;
                const totalHours = getRequiredWeeklyPeriods(c);
                const hasReachedLimit = totalHours > 0 && locked.length >= totalHours;
                const isOverLimit = totalHours > 0 && locked.length > totalHours;
                const currentClassLabel = getAssignmentClassIds(c).map(id => formatClassDisplayName(id)).join(', ');

                // Build merged columns: teaching periods + special periods mapped by position
                // Special periods that match a teaching period's time slot get overlaid
                const getSpecialForDayAndPeriod = (dayKey: string, periodId: string) => {
                    return specialPeriods.find(sp => {
                        const matchDay = !sp.day || sp.day === 'all' || sp.day === dayKey;
                        const matchPeriod = sp.linkedPeriodId === periodId;
                        return matchDay && matchPeriod;
                    });
                };

                const teacherIds = getAssignmentTeacherIds(c.assignment);
                const teacherSummaries = getTeacherSummaries(c.assignment);
                const unavailableSlotTeachers = (slotId: string) => teacherIds
                    .map(id => ({ id, teacher: teacherMap[id] as Teacher | undefined }))
                    .filter(item => item.teacher?.preferences?.unavailableSlots?.includes(slotId));

                // Pre-calculate subjects that would make this slot unavailable:
                // existing timetable entries first, then manual period locks.
                const otherLockedMap = Object.entries(schoolMasterSchedule).reduce((acc, [slotId, occupancies]) => {
                    occupancies.forEach(occupancy => {
                        const conflict = getScheduledOccupancyConflict(c, occupancy, teacherIds);
                        if (!conflict || !occupancy.course) return;

                        if (!acc[slotId]) acc[slotId] = [];
                        acc[slotId].push({
                            type: conflict.type,
                            code: occupancy.course.code || '-',
                            title: occupancy.course.title || 'ไม่ระบุชื่อวิชา',
                            classLabel: formatClassDisplayName(occupancy.classId || occupancy.course.classId),
                            teacherNames: conflict.type === 'teacher' && conflict.teacherId ? [formatTeacherDisplayName(conflict.teacherId)] : [],
                            source: 'schedule'
                        });
                    });
                    return acc;
                }, {} as Record<string, any[]>);

                allAssignments.forEach(a => {
                    if (a.compositeId === c.compositeId) return;
                    const cst = constraints[a.compositeId];
                    if (cst?.isLocked && cst.lockedSlots) {
                        const otherTeacherIds = getAssignmentTeacherIds(a.assignment);
                        const conflict = getAssignmentConflict(c, a, teacherIds, otherTeacherIds);
                        
                        if (conflict) {
                            cst.lockedSlots.forEach(slotId => {
                                if (!otherLockedMap[slotId]) otherLockedMap[slotId] = [];
                                otherLockedMap[slotId].push({
                                    type: conflict.type,
                                    code: a.code,
                                    title: a.title,
                                    classLabel: getAssignmentClassIds(a).map(id => formatClassDisplayName(id)).join(', '),
                                    teacherNames: conflict.type === 'teacher' && conflict.teacherId ? [formatTeacherDisplayName(conflict.teacherId)] : [],
                                    source: 'constraint'
                                });
                            });
                        }
                    }
                });

                return (
                    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={() => setSlotModalCourse(null)}>
                        <div className="bg-white dark:bg-[#2a2b2f] rounded-2xl w-[810px] max-w-[95vw] shadow-2xl border border-slate-200 dark:border-white/10" onClick={e => e.stopPropagation()}>
                            {/* Header */}
                            <div className="flex items-center justify-between px-6 py-3 border-b border-slate-100 dark:border-white/5">
                                <div className="flex items-center gap-3 flex-wrap">
                                    <Lock size={18} className="text-amber-500" />
                                    <h3 className="text-base font-black text-slate-900 dark:text-white">กำหนดล็อกคาบ</h3>
                                    <span className="px-2.5 py-1 rounded-lg bg-indigo-500 text-white text-[11px] font-black">{classLabel}</span>
                                    <span className="text-xs font-bold text-slate-400">•</span>
                                    <span className="text-xs font-black text-amber-500">{c.code}</span>
                                    <span className="text-xs font-bold text-slate-500 dark:text-slate-300">{c.title}</span>
                                    <span className="text-xs font-bold text-slate-400">•</span>
                                    <span className={`text-xs font-bold ${isOverLimit ? 'text-red-500' : 'text-slate-500 dark:text-slate-400'}`}>{locked.length}/{totalHours || '-'} คาบ</span>
                                    {teacherSummaries.length > 0 && (
                                        <>
                                            <span className="text-xs font-bold text-slate-400">•</span>
                                            <span className="inline-flex items-center gap-1.5 text-[11px] font-black text-slate-500 dark:text-slate-300">
                                                <Users size={13} className="text-indigo-500" />
                                                {teacherSummaries[0].name}
                                                {teacherSummaries.length > 1 && <span className="text-indigo-500">+{teacherSummaries.length - 1}</span>}
                                            </span>
                                        </>
                                    )}
                                </div>
                                <button onClick={() => setSlotModalCourse(null)} className="w-7 h-7 rounded-full bg-slate-100 dark:bg-white/5 flex items-center justify-center text-slate-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-500/10 transition-all shrink-0">
                                    <X size={14} />
                                </button>
                            </div>

                            {/* Grid */}
                            <div className="px-5 py-3 overflow-x-auto">
                                <table className="w-full border-collapse">
                                    <thead>
                                        <tr className="border-b border-slate-100 dark:border-white/5">
                                            <th className="px-2 py-2 text-[11px] font-black text-slate-400 uppercase text-left w-20">วัน/คาบ</th>
                                            {displayPeriods.map((p, idx) => (
                                                <th key={p.id} className={`px-0.5 py-2 text-center ${p.id === 'lunch' ? 'w-10 opacity-40' : ''}`}>
                                                    <div className="text-[11px] font-black text-slate-700 dark:text-slate-200">{p.label}</div>
                                                    <div className="text-[9px] font-bold text-slate-400 mt-0.5">{p.startTime}-{getEffectivePeriodEnd(displayPeriods, p, idx)}</div>
                                                </th>
                                            ))}
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {DAYS.map(day => (
                                            <tr key={day.key} className="border-b border-slate-50 dark:border-white/[0.03]">
                                                <td className="px-2 py-2 text-[12px] font-black text-slate-600 dark:text-slate-300">{day.label}</td>
                                                {displayPeriods.map((p) => {
                                                    if (p.id === 'lunch') {
                                                        return (
                                                            <td key={p.id} className="px-0.5 py-1.5">
                                                                <div className="w-full h-9 rounded-lg bg-slate-100 dark:bg-white/5 border border-dashed border-slate-200 dark:border-white/10 flex items-center justify-center opacity-40">
                                                                    <span className="text-[8px] font-black text-slate-400 uppercase vertical-text">พัก</span>
                                                                </div>
                                                            </td>
                                                        );
                                                    }

                                                    const originalIndex = p.index ?? normalizedPeriodSettings.findIndex(period => period.id === p.id);
                                                    const slotId = `${day.key}-${originalIndex}`;
                                                    const isSelected = locked.includes(slotId);
                                                    const sp = getSpecialForDayAndPeriod(day.key, p.id);
                                                    const isDayExcluded = cst.excludedDays?.includes(day.key);
                                                    const isDisabledByLimit = hasReachedLimit && !isSelected;
                                                    const otherLocked = otherLockedMap[slotId];
                                                    const unavailableTeachers = unavailableSlotTeachers(slotId);
                                                    const isUnavailable = unavailableTeachers.length > 0;
                                                    
                                                    if (sp) {
                                                        return (
                                                            <td key={p.id} className="px-0.5 py-1.5">
                                                                <div className="w-full h-9 rounded-lg bg-violet-100 dark:bg-violet-500/10 border border-violet-200 dark:border-violet-500/20 flex items-center justify-center">
                                                                    <span className="text-[8px] font-black text-violet-600 dark:text-violet-400 truncate px-0.5">{sp.title}</span>
                                                                </div>
                                                            </td>
                                                        );
                                                    }

                                                    if (isDayExcluded) {
                                                        return (
                                                            <td key={p.id} className="px-0.5 py-1.5">
                                                                <div className="w-full h-9 rounded-lg bg-red-100/50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/20 flex items-center justify-center cursor-not-allowed shadow-inner" title="ห้ามสอนในวันนี้">
                                                                    <X size={14} strokeWidth={3} className="text-red-500 dark:text-red-400" />
                                                                </div>
                                                            </td>
                                                        );
                                                    }

                                                    if (isUnavailable) {
                                                        return (
                                                            <td key={p.id} className="px-0.5 py-1.5">
                                                                <div 
                                                                    className="relative w-full h-9 rounded-lg bg-amber-50 dark:bg-amber-500/[0.03] border border-amber-200/50 dark:border-amber-500/20 flex flex-col items-center justify-center cursor-not-allowed overflow-hidden shadow-sm transition-all duration-300"
                                                                    title={`ครู ${unavailableTeachers.map(item => formatTeacherDisplayName(item.id)).join(', ')} ล็อคคาบว่าง`}
                                                                >
                                                                    {/* Red Corner Badge with Lock - Premium Style */}
                                                                    <div className="absolute top-0 left-0 w-3.5 h-3.5 bg-rose-500 dark:bg-rose-600 rounded-br-lg flex items-center justify-center shadow-sm z-10">
                                                                        <Lock size={6} className="text-white" strokeWidth={3} />
                                                                    </div>
                                                                    
                                                                    {/* "ว่าง" Text Content - Consistent with DroppableCell */}
                                                                    <div className="flex flex-col items-center justify-center gap-0.5 mt-0.5">
                                                                        <span className="text-[10px] font-black text-amber-600 dark:text-amber-500 tracking-tight leading-none uppercase">ว่าง</span>
                                                                        {/* Glowing Dot indicator */}
                                                                        <div className="w-1.5 h-1.5 rounded-full bg-amber-400 dark:bg-amber-600 shadow-[0_0_8px_rgba(245,158,11,0.5)] animate-pulse" />
                                                                    </div>

                                                                    {/* Glassy overlay for premium feel */}
                                                                    <div className="absolute inset-0 bg-gradient-to-br from-white/20 to-transparent dark:from-white/[0.02] pointer-events-none" />
                                                                </div>
                                                            </td>
                                                        );
                                                    }

                                                    if (otherLocked && otherLocked.length > 0) {
                                                        const first = otherLocked[0];
                                                        const isTeacherOverlap = otherLocked.some(o => o.type === 'teacher');
                                                        const sourceLabel = first.source === 'schedule' ? 'ตารางสอน' : 'ล็อกคาบ';
                                                        return (
                                                            <td key={p.id} className="px-0.5 py-1.5">
                                                                <div 
                                                                    className={`relative w-full h-9 rounded-lg border flex flex-col items-center justify-center cursor-not-allowed overflow-hidden shadow-inner ${
                                                                        isTeacherOverlap 
                                                                            ? 'bg-[#2a2b2f] border-rose-900/30' 
                                                                            : 'bg-indigo-950/30 border-indigo-500/20'
                                                                    }`}
                                                                    title={`${sourceLabel} • ${isTeacherOverlap ? `ครู ${(first.teacherNames || []).join(', ')} ติดสอน` : `ห้อง ${first.classLabel} มีเรียน`}: ${first.code} ${first.title}`}
                                                                >
                                                                    {/* Top-Left Badge for Teacher Overlap */}
                                                                    {isTeacherOverlap && (
                                                                        <div className="absolute top-0 left-0 w-3.5 h-3 bg-rose-800 rounded-br-md flex items-center justify-center shadow-sm">
                                                                            <Lock size={6} className="text-white" strokeWidth={3} />
                                                                        </div>
                                                                    )}

                                                                    <span className={`text-[8px] font-black truncate px-1 uppercase leading-none ${isTeacherOverlap ? 'text-rose-500' : 'text-indigo-400'}`}>
                                                                        {first.code}
                                                                    </span>
                                                                    <span className={`max-w-full truncate px-1 text-[7px] font-black leading-none mt-0.5 ${isTeacherOverlap ? 'text-rose-300/80' : 'text-indigo-200/80'}`}>
                                                                        {first.classLabel}
                                                                    </span>
                                                                    {/* Bottom Status Dot */}
                                                                    <div className={`w-1 h-1 rounded-full mt-0.5 ${isTeacherOverlap ? 'bg-rose-600' : 'bg-indigo-500'}`} />
                                                                </div>
                                                            </td>
                                                        );
                                                    }

                                                    return (
                                                        <td key={p.id} className="px-0.5 py-1.5">
                                                            <button
                                                                onClick={() => toggleSlot(c.compositeId, slotId, periodSettings.length, totalHours)}
                                                                disabled={isDisabledByLimit}
                                                                title={isDisabledByLimit ? `เลือกครบ ${totalHours} คาบ/สัปดาห์แล้ว` : undefined}
                                                                className={`w-full h-9 rounded-lg border transition-all flex items-center justify-center ${
                                                                    isSelected
                                                                        ? 'bg-amber-500 border-amber-400 text-white shadow-md shadow-amber-500/20'
                                                                        : isDisabledByLimit
                                                                            ? 'bg-slate-100 dark:bg-white/[0.02] border-slate-200 dark:border-white/5 opacity-35 cursor-not-allowed'
                                                                        : 'bg-slate-50 dark:bg-white/[0.02] border-slate-200 dark:border-white/5 hover:border-amber-400/50 hover:bg-amber-50 dark:hover:bg-amber-500/5'
                                                                }`}
                                                            >
                                                                {isSelected ? (
                                                                    <span className="flex max-w-full flex-col items-center justify-center leading-none">
                                                                        <span className="max-w-full truncate px-1 text-[8px] font-black uppercase">{c.code}</span>
                                                                        <span className="max-w-full truncate px-1 text-[7px] font-black text-white/80 mt-0.5">{currentClassLabel}</span>
                                                                    </span>
                                                                ) : null}
                                                            </button>
                                                        </td>
                                                    );
                                                })}
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>

                            {/* Footer */}
                            <div className="flex items-center justify-between px-6 py-4 border-t border-slate-100 dark:border-white/5 bg-slate-50/50 dark:bg-white/[0.02] shrink-0">
                                <div className="flex flex-col">
                                    <span className="text-xs font-bold text-slate-500 dark:text-slate-400">
                                        คาบที่ล็อกไว้: <span className={isOverLimit ? 'text-red-500 font-black' : 'text-amber-500 font-black'}>{locked.length}</span>
                                        <span className="mx-1">/</span>
                                        <span className="font-black">{totalHours || '-'}</span> คาบ
                                    </span>
                                    {hasReachedLimit && !isOverLimit && (
                                        <span className="text-[10px] font-bold text-emerald-500 mt-1">เลือกครบตามจำนวนคาบต่อสัปดาห์แล้ว</span>
                                    )}
                                    {isOverLimit && (
                                        <span className="text-[10px] font-bold text-red-500 mt-1">จำนวนคาบที่ล็อกไว้เกินกว่าที่กำหนด กรุณาลดคาบก่อนบันทึก</span>
                                    )}
                                </div>
                                <div className="flex items-center gap-3">
                                    <button 
                                        onClick={() => { setConstraints(prev => ({ ...prev, [c.compositeId]: { ...cst, lockedSlots: [], isLocked: false } })); }}
                                        className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-slate-100 dark:bg-white/5 border border-slate-200 dark:border-white/10 text-slate-600 dark:text-slate-300 text-[11px] font-black hover:bg-red-500/10 hover:text-red-500 hover:border-red-500/20 transition-all"
                                    >
                                        <Unlock size={14} />
                                        <span>ล้างคาบที่ล็อกไว้</span>
                                    </button>
                                    <button 
                                        onClick={() => setSlotModalCourse(null)} 
                                        className="px-8 py-2.5 rounded-xl bg-indigo-600 text-white text-[11px] font-black shadow-lg hover:bg-indigo-500 transition-all"
                                    >
                                        เสร็จสิ้น
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>
                );
            })()}
        </MainLayout>
    );
};

export default PeriodConstraintPage;
