import React, { useState, useEffect, useMemo } from 'react';
import { useSelector, useDispatch } from 'react-redux';
import { useSearchParams } from 'react-router-dom';
import BackButton from "@/components/Shared/BackButton";
import { RootState } from '@/store';
import MainLayout from "@/layouts/MainLayout";
import { firestore as db } from '@/firebase';
import { doc, getDoc, collection, query, where, getDocs, Timestamp, writeBatch } from 'firebase/firestore';
import Swal from 'sweetalert2';
import { Calendar } from 'lucide-react';
import { fetchTeachersMap } from '@/store/slices/userMapSlice';
import { fetchCalendar } from '@/store/slices/calendarSlice';
import { isNonOfficialHoliday } from '@/utils/calendarUtils';
import { CLASSES } from '@/utils/schoolUtils';
import { getCurrentThaiYear } from '@/utils/dateUtils';
import { isCurrentStudent } from '@/utils/studentStatusUtils';
import { useResponsivePwaMode as usePwaMode } from '@/hooks/useResponsivePwaMode';

// Sub-components and Utilities from the same folder
import { Student, CourseSchedule } from './types';
import { DAYS, PERIOD_TIMES } from './constants';
import AttendanceHeader from './components/AttendanceHeader';
import HolidayView from './components/HolidayView';
import ScheduleListView from './components/ScheduleListView';
import AttendanceCheckView from './components/AttendanceCheckView';

interface PeriodSetting {
    id: string;
    label?: string;
    startTime: string;
    endTime: string;
    isTeachingPeriod?: boolean;
    isTeaching?: boolean;
}

interface CalendarEvent {
    type?: string;
    description?: string;
    scheduleDay?: string;
}

const normalizeRoom = (value: unknown) => {
    const raw = String(value ?? '').trim();
    if (!raw) return '';
    const numeric = Number(raw);
    return Number.isFinite(numeric) ? String(numeric) : raw.toLowerCase();
};

const getClassVariants = (classValue: unknown): string[] => {
    if (Array.isArray(classValue)) {
        return Array.from(new Set(classValue.flatMap(getClassVariants)));
    }

    const value = String(classValue || '').trim();
    if (!value) return [];

    const fromLabel = Object.entries(CLASSES).find(([, label]) => label === value)?.[0];
    const classKey = fromLabel || value;

    return Array.from(new Set([
        classKey,
        CLASSES[classKey],
        value
    ].filter(Boolean).map(String)));
};

const matchesClassValue = (recordClass: unknown, selectedClass: unknown): boolean => {
    if (!selectedClass) return true;
    if (!recordClass) return false;

    if (Array.isArray(recordClass)) {
        return recordClass.some(item => matchesClassValue(item, selectedClass));
    }

    const variants = getClassVariants(selectedClass);
    const normalizedVariants = variants.map(v => v.toLowerCase().replace(/\s/g, ''));
    const raw = String(recordClass || '').trim();
    const normalized = raw.toLowerCase().replace(/\s/g, '');

    return normalizedVariants.includes(normalized) ||
        normalizedVariants.some(v => normalized.startsWith(`${v}_`) || normalized.startsWith(`${v}/`)) ||
        normalizedVariants.some(v => normalized.includes(v) || v.includes(normalized));
};

// Strict class matching used specifically for substitute classes.
// Unlike matchesClassValue, this does NOT allow a grade-only variant (e.g. "m1") to match
// room-specific students (e.g. "m1/1", "m1/2"), preventing multi-room pull when the
// substitution classId has no room number or was set to the teacher's full class list.
const matchesClassValueStrict = (recordClass: unknown, classId: unknown): boolean => {
    if (!classId) return true;
    const ids = (Array.isArray(classId) ? classId : [classId]).filter(Boolean).map(String);
    if (ids.length === 0) return true;

    if (Array.isArray(recordClass)) {
        return (recordClass as unknown[]).some(item => matchesClassValueStrict(item, classId));
    }

    const allVariants = Array.from(new Set(ids.flatMap(id => getClassVariants(id))))
        .map(v => v.toLowerCase().replace(/\s/g, ''));
    const normalized = String(recordClass || '').toLowerCase().replace(/\s/g, '');

    return allVariants.some(v =>
        v === normalized ||
        normalized.startsWith(`${v}_`) ||
        // Only allow prefix matching when the variant itself has a room number (e.g. "m1/1")
        // — this prevents grade-only "m1" from matching "m1/1" or "m1/2"
        (v.includes('/') && normalized.startsWith(`${v}/`))
    );
};

const matchesEnrollmentGroup = (data: any, groupNumber?: number | string): boolean => {
    if (!groupNumber) return true;
    const normalizedSelected = normalizeRoom(groupNumber);
    const groupName = String(data.groupName || '').trim();
    const plainGroup = groupName.replace(/^กลุ่ม\s*/i, '').replace(/^ก\.\s*/i, '');
    const roomStr = normalizeRoom(data.room || data.roomNumber || data.groupNumber || data.group || '');

    return normalizeRoom(plainGroup) === normalizedSelected ||
        roomStr === normalizedSelected ||
        groupName === `กลุ่ม ${groupNumber}` ||
        groupName === `ก.${groupNumber}`;
};

const formatClassDisplay = (value: unknown) => {
    const values = Array.isArray(value) ? value : [value];
    const labels = values
        .flatMap(getClassVariants)
        .filter(Boolean)
        .map(v => CLASSES[v] || v);

    return Array.from(new Set(labels)).join(', ') || 'ไม่ระบุชั้น';
};

const getStableClassKey = (value: unknown) => {
    if (Array.isArray(value)) return value.map(String).filter(Boolean).join('-');
    return String(value || '');
};

const normalizeRoomIds = (value: unknown): string[] => {
    const values = Array.isArray(value) ? value : [value];
    return values
        .map(v => String(v ?? '').trim())
        .filter(v => v && v.toLowerCase() !== 'all');
};

const normalizeTeachingPeriod = (period: unknown) => {
    const parsed = Number(period);
    return Number.isFinite(parsed) ? parsed : 0;
};

const getCourseCode = (course: any) => course?.code || course?.courseCode || course?.subjectCode || '';

const getAssignmentTeacherIds = (assignment: any): string[] => {
    const ids = Array.isArray(assignment?.teacherIds) && assignment.teacherIds.length > 0
        ? assignment.teacherIds
        : (assignment?.teacherId ? [assignment.teacherId] : []);
    return Array.from(new Set(ids.filter((id: string) => id && id !== 'pending' && !String(id).startsWith('GHOST'))));
};

const semesterMatchesValue = (dataSemester: unknown, targetSemester: unknown) => {
    const dataSem = String(dataSemester || "");
    const targetSem = String(targetSemester || "");
    return !targetSem || !dataSem || dataSem === targetSem || dataSem.startsWith(`${targetSem}/`) || targetSem.startsWith(`${dataSem}/`) || dataSem.includes(targetSem);
};

const formatDisplayTime = (time?: string) => String(time || '').replace(':', '.');

const parseTimeParts = (time: string) => {
    const [hour, minute] = String(time || '').replace('.', ':').split(':').map(Number);
    return {
        hour: Number.isFinite(hour) ? hour : 0,
        minute: Number.isFinite(minute) ? minute : 0,
    };
};

const ClassroomAttendancePage: React.FC = () => {
    const isPwaMode = usePwaMode();
    const [searchParams] = useSearchParams();
    const [currentDate, setCurrentDate] = useState(() => {
        const dateParam = searchParams.get('date');
        if (dateParam) {
            const parsedDate = new Date(dateParam);
            if (Number.isFinite(parsedDate.getTime())) {
                return parsedDate;
            }
        }
        return new Date();
    });

    useEffect(() => {
        const dateParam = searchParams.get('date');
        if (dateParam) {
            const parsedDate = new Date(dateParam);
            if (Number.isFinite(parsedDate.getTime())) {
                setCurrentDate(parsedDate);
            }
        }
    }, [searchParams]);
    const [schedules, setSchedules] = useState<CourseSchedule[]>([]);
    const [inactiveCourseIds, setInactiveCourseIds] = useState<Set<string>>(new Set());
    const [selectedClass, setSelectedClass] = useState<CourseSchedule | null>(() => {
        try {
            const saved = sessionStorage.getItem('attendance_selected_class');
            if (saved) {
                const parsed = JSON.parse(saved);
                // Basic validation: ensure it's an object and has required fields
                if (parsed && typeof parsed === 'object' && (parsed.courseId || parsed.subjectCode || parsed.isSubstitute)) {
                    return parsed;
                }
            }
        } catch (e) {
            console.error("Error restoring selected class from sessionStorage:", e);
        }
        return null;
    });
    const [students, setStudents] = useState<Student[]>([]);
    const [attendance, setAttendance] = useState<Record<string, 'present' | 'absent' | 'late' | 'leave' | 'escape'>>({});
    const [isSubmitted, setIsSubmitted] = useState(false);
    const [studentLeaves, setStudentLeaves] = useState<Record<string, boolean>>({});
    const [loading, setLoading] = useState(true);
    const [studentsLoading, setStudentsLoading] = useState(false);
    const [isHoliday, setIsHoliday] = useState(false);
    const [holidayName, setHolidayName] = useState('');
    const [scheduleDayOverride, setScheduleDayOverride] = useState<string | null>(null);
    const reduxAcademicYear = useSelector((state: RootState) => state.calendar.academicYear) || String(getCurrentThaiYear());
    const [academicYear, setAcademicYear] = useState<string>(reduxAcademicYear);
    const [semester, setSemester] = useState<string>("");
    const [physicalRooms, setPhysicalRooms] = useState<any[]>([]);
    const [periodSettings, setPeriodSettings] = useState<PeriodSetting[]>([]);
    const [calendarEvents, setCalendarEvents] = useState<Record<string, CalendarEvent>>({});

    const roomMap = useMemo(() => {
        const map: Record<string, string> = {};
        physicalRooms.forEach(r => {
            const name = r.name || r.roomName || r.id;
            const code = r.roomCode || '';
            
            if (code && code.length >= 3) {
                // Parse 3-digit code: [Building][Floor][Room]
                const b = code.charAt(0);
                const f = code.charAt(1);
                const rNum = code.substring(2);
                map[r.id] = `อาคาร ${b} ชั้น ${f} ห้อง ${rNum}`;
            } else {
                map[r.id] = name;
            }
        });
        return map;
    }, [physicalRooms]);

    const dispatch = useDispatch();
    const currentUser = useSelector((state: RootState) => state.auth.user);
    const { teachers: teacherMap, status: teacherMapStatus } = useSelector((state: RootState) => state.userMap);
    const schoolId = (currentUser as any)?.schoolId;

    // --- 0. Sync selection to sessionStorage ---
    useEffect(() => {
        if (selectedClass) {
            sessionStorage.setItem('attendance_selected_class', JSON.stringify(selectedClass));
        } else {
            sessionStorage.removeItem('attendance_selected_class');
        }
    }, [selectedClass]);

    // --- 0.1 Auto select class from 'selectSub' query parameter ---
    useEffect(() => {
        const selectSubParam = searchParams.get('selectSub');
        if (selectSubParam && schedules.length > 0) {
            if (!selectedClass || selectedClass.substitutionId !== selectSubParam) {
                const targetSchedule = schedules.find(s => 
                    s.substitutionId === selectSubParam || 
                    s.id.includes(selectSubParam)
                );
                if (targetSchedule) {
                    setSelectedClass(targetSchedule);
                }
            }
        }
    }, [schedules, searchParams, selectedClass]);

    // Find current teacher ID from Redux map
    const currentTeacher = useMemo(() => {
        const teachersArr = Object.values(teacherMap || {}) as any[];
        return teachersArr.find((t: any) => t.uid === (currentUser as any)?.uid || t.id === (currentUser as any)?.uid);
    }, [teacherMap, currentUser]);

    const periodInfoByNumber = useMemo(() => {
        const map = new Map<number, { startTime: string; endTime: string }>();
        periodSettings.forEach((period, index) => {
            const idNumber = String(period.id || '').startsWith('period-')
                ? Number(String(period.id).replace('period-', ''))
                : NaN;
            const periodNumber = Number.isFinite(idNumber) && idNumber > 0 ? idNumber : index;
            if (periodNumber > 0) {
                map.set(periodNumber, {
                    startTime: formatDisplayTime(period.startTime),
                    endTime: formatDisplayTime(period.endTime),
                });
            }
        });

        PERIOD_TIMES.forEach(period => {
            if (!map.has(period.period)) {
                map.set(period.period, {
                    startTime: formatDisplayTime(period.start),
                    endTime: formatDisplayTime(period.end),
                });
            }
        });

        return map;
    }, [periodSettings]);

    const teachingPeriodNumbers = useMemo(() => {
        const configured = periodSettings
            .filter(period => period.isTeachingPeriod === true || period.isTeaching === true || String(period.id || '').startsWith('period-'))
            .map((period, index) => {
                const idNumber = String(period.id || '').startsWith('period-')
                    ? Number(String(period.id).replace('period-', ''))
                    : NaN;
                return Number.isFinite(idNumber) && idNumber > 0 ? idNumber : index;
            })
            .filter(periodNumber => periodNumber > 0);

        return configured.length > 0
            ? Array.from(new Set(configured)).sort((a, b) => a - b)
            : PERIOD_TIMES.map(period => period.period);
    }, [periodSettings]);

    const getPeriodInfo = (periodNumber: number) => {
        return periodInfoByNumber.get(periodNumber) || {
            startTime: '',
            endTime: '',
        };
    };

    const getPeriodNumberFromSlotKey = (slotKey: string, dayKey: string) => {
        const periodId = slotKey.replace(`${dayKey}-`, '');
        if (periodId === 'homeroom' || periodId === 'lunch') return null;
        if (periodId.startsWith('period-')) {
            return Number(periodId.replace('period-', '')) || null;
        }

        const rawPeriods = periodSettings.length > 0 ? periodSettings : [
            { id: 'homeroom', label: 'โฮมรูม', startTime: '08:30', endTime: '08:40', isTeachingPeriod: false },
            { id: 'period-1', label: 'คาบที่ 1', startTime: '08:40', endTime: '09:30', isTeachingPeriod: true },
            { id: 'period-2', label: 'คาบที่ 2', startTime: '09:30', endTime: '10:20', isTeachingPeriod: true },
            { id: 'period-3', label: 'คาบที่ 3', startTime: '10:20', endTime: '11:10', isTeachingPeriod: true },
            { id: 'period-4', label: 'คาบที่ 4', startTime: '11:10', endTime: '12:00', isTeachingPeriod: true },
            { id: 'lunch', label: 'พักกลางวัน', startTime: '12:00', endTime: '13:00', isTeachingPeriod: false },
            { id: 'period-5', label: 'คาบที่ 5', startTime: '13:00', endTime: '13:50', isTeachingPeriod: true },
            { id: 'period-6', label: 'คาบที่ 6', startTime: '13:50', endTime: '14:40', isTeachingPeriod: true },
            { id: 'period-7', label: 'คาบที่ 7', startTime: '14:40', endTime: '15:30', isTeachingPeriod: true },
            { id: 'period-8', label: 'คาบที่ 8', startTime: '15:30', endTime: '16:00', isTeachingPeriod: true }
        ];

        // Normalize indices to make it robust and match school-settings layout perfectly
        const activePeriods = rawPeriods.map((p: any, arrIdx: number) => {
            const stableIndex = typeof p.index !== 'undefined'
                ? p.index
                : (typeof p.order !== 'undefined' ? p.order : arrIdx);
            return {
                ...p,
                index: stableIndex,
            };
        }).sort((a: any, b: any) => (a.index ?? 0) - (b.index ?? 0));

        const index = Number(periodId);
        if (Number.isFinite(index) && activePeriods.length > 0) {
            const setting = activePeriods.find((p: any) => p.index === index);
            if (setting) {
                if (setting.id === 'homeroom' || setting.id === 'lunch') return null;
                const match = String(setting.id || '').match(/^period-(\d+)$/);
                if (match) return Number(match[1]);
            }
        }

        const parsed = Number(periodId);
        if (Number.isFinite(parsed)) {
            return parsed === 0 ? 1 : parsed;
        }
        return null;
    };

    useEffect(() => {
        if (schoolId && teacherMapStatus === 'idle') {
            dispatch(fetchTeachersMap(schoolId) as any);
        }
    }, [schoolId, teacherMapStatus, dispatch]);

    const calendarState = useSelector((state: RootState) => state.calendar);

    // --- 1. Fetch Current Settings (Academic Year) ---
    useEffect(() => {
        if (schoolId && calendarState.status === 'idle') {
            dispatch(fetchCalendar(schoolId) as any);
        }
    }, [schoolId, calendarState.status, dispatch]);

    useEffect(() => {
        if (calendarState.status === 'succeeded') {
            setAcademicYear(calendarState.academicYear);
        } else if (!academicYear) {
            setAcademicYear(reduxAcademicYear);
        }
    }, [calendarState.status, calendarState.academicYear, reduxAcademicYear]);

    useEffect(() => {
        if (!schoolId || calendarState.status === 'loading') return;

        const fetchCalendarEvents = async () => {
            const defaultEvents = (calendarState.rawData?.events || {}) as Record<string, CalendarEvent>;
            const activeAcademicYear = calendarState.academicYear || calendarState.rawData?.academicYear || academicYear;

            if (!activeAcademicYear) {
                setCalendarEvents(defaultEvents);
                return;
            }

            try {
                const yearDocRef = doc(db, 'school-settings', schoolId, 'main_calendar', String(activeAcademicYear));
                const yearDocSnap = await getDoc(yearDocRef);
                const yearEvents = yearDocSnap.exists()
                    ? ((yearDocSnap.data().events || {}) as Record<string, CalendarEvent>)
                    : {};

                setCalendarEvents({ ...defaultEvents, ...yearEvents });
            } catch (error) {
                console.error("Error fetching academic year calendar events:", error);
                setCalendarEvents(defaultEvents);
            }
        };

        fetchCalendarEvents();
    }, [schoolId, calendarState.status, calendarState.academicYear, calendarState.rawData, academicYear]);

    // --- 1.1 Fetch Courses to find inactive ones ---
    useEffect(() => {
        const fetchCourses = async () => {
            if (!schoolId) return;
            try {
                const coursesRef = collection(db, 'school-settings', schoolId, 'courses');
                const q = query(coursesRef, where('status', '==', 'inactive'));
                const querySnapshot = await getDocs(q);
                const inactiveIds = new Set<string>();
                querySnapshot.forEach(doc => inactiveIds.add(doc.id));
                setInactiveCourseIds(inactiveIds);
            } catch (error) {
                console.error("Error fetching inactive courses:", error);
            }
        };
        fetchCourses();
    }, [schoolId]);

    // --- 1.2 Fetch Physical Rooms for mapping ---
    useEffect(() => {
        const fetchRooms = async () => {
            if (!schoolId) return;
            try {
                const roomsRef = collection(db, 'school-settings', schoolId, 'physical-rooms');
                const snap = await getDocs(roomsRef);
                setPhysicalRooms(snap.docs.map(doc => ({ id: doc.id, ...doc.data() })));
            } catch (error) {
                console.error("Error fetching rooms:", error);
            }
        };
        fetchRooms();
    }, [schoolId]);

    // --- 1.3 Fetch Period Settings for accurate period times ---
    useEffect(() => {
        const fetchPeriodSettings = async () => {
            if (!schoolId) return;
            try {
                const settingsRef = doc(db, 'school-settings', schoolId, 'configs', 'schedule_settings');
                const settingsSnap = await getDoc(settingsRef);
                const periods = settingsSnap.exists() ? settingsSnap.data().periods : [];
                setPeriodSettings(Array.isArray(periods) ? periods : []);
            } catch (error) {
                console.error("Error fetching period settings:", error);
                setPeriodSettings([]);
            }
        };
        fetchPeriodSettings();
    }, [schoolId]);

    // --- 1.3 Check for Holidays ---
    useEffect(() => {
        if (!schoolId) return;
        setIsHoliday(false);
        setHolidayName('');
        setScheduleDayOverride(null);

        const year = currentDate.getFullYear();
        const month = String(currentDate.getMonth() + 1).padStart(2, '0');
        const day = String(currentDate.getDate()).padStart(2, '0');
        const dateStr = `${year}-${month}-${day}`;

        if (calendarState.status === 'succeeded') {
            const event = calendarEvents[dateStr];

            // 1. Determine local semester for this calculation
            const currentTerm = calendarState.terms.find(t => 
                t.startDate && t.endDate && dateStr >= t.startDate && dateStr <= t.endDate
            ) || calendarState.terms[0]; // Fallback to term1 if not found in any term

            const localSemester = currentTerm?.id === 'term2' ? "2" : "1";
            setSemester(localSemester);

            // 1. Priority: Check if it's a Makeup School Day (Overrides everything)
            if (event && event.type === 'schoolDay') {
                if (event.scheduleDay) setScheduleDayOverride(event.scheduleDay);
                return;
            }

            // 2. Term Boundaries: Check if within any term period
            const isWithinTerm = calendarState.terms.some(t => 
                t.startDate && t.endDate && dateStr >= t.startDate && dateStr <= t.endDate
            );

            if (!isWithinTerm) {
                setIsHoliday(true);
                setHolidayName('อยู่นอกภาคเรียน (ไม่อยู่ในช่วงวันเรียน 100 วัน)');
            }

            // 3. Regular Weekend: Saturday (6) and Sunday (0) are non-school days unless schoolDay
            const dayOfWeek = currentDate.getDay();
            if (dayOfWeek === 0 || dayOfWeek === 6) {
                if (!isHoliday) {
                    setIsHoliday(true);
                    setHolidayName(dayOfWeek === 0 ? 'วันอาทิตย์' : 'วันเสาร์');
                }
            }

            // 4. Calendar Events: Specific holidays or special closures
            if (event) {
                if (event.type === 'holiday' || event.type === 'specialHoliday') {
                    setIsHoliday(true);
                    setHolidayName(event.description || 'วันหยุดโรงเรียน');
                }
            }
        }
    }, [currentDate, schoolId, calendarState.status, calendarState.terms, calendarEvents]);

    // Fallback Google Calendar API (kept as is but optional)
    useEffect(() => {
        const checkGoogleHoliday = async () => {
            if (!schoolId || isHoliday) return;
            const year = currentDate.getFullYear();
            const month = String(currentDate.getMonth() + 1).padStart(2, '0');
            const day = String(currentDate.getDate()).padStart(2, '0');
            const dateStr = `${year}-${month}-${day}`;

            const apiKey = import.meta.env.VITE_GOOGLE_CALENDAR_API_KEY;
            if (apiKey) {
                try {
                    const calendarId = 'th.th#holiday@group.v.calendar.google.com';
                    const timeMin = `${dateStr}T00:00:00Z`;
                    const timeMax = `${dateStr}T23:59:59Z`;

                    const response = await fetch(
                        `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events?key=${apiKey}&timeMin=${timeMin}&timeMax=${timeMax}&singleEvents=true`
                    );

                    if (response.ok) {
                        const data = await response.json();
                        if (data.items && data.items.length > 0) {
                            const event = data.items[0];
                            const summary = event.summary;
                            if (!isNonOfficialHoliday(summary)) {
                                setIsHoliday(true);
                                setHolidayName(summary);
                            }
                        }
                    }
                } catch (error) {
                    console.error("Error fetching Google Calendar API:", error);
                }
            }
        };
        checkGoogleHoliday();
    }, [currentDate, schoolId, isHoliday]);

    // --- 2. Fetch Teacher's Schedule for the Day ---
    useEffect(() => {
        const fetchSchedule = async () => {
            if (!schoolId || !currentTeacher) return;
            setLoading(true);
            setSchedules([]);

            try {
                const dayKey = scheduleDayOverride || DAYS[currentDate.getDay()];
                const schedulesRef = collection(db, 'school-settings', schoolId, 'schedules');
                let q = query(schedulesRef);
                if (academicYear) q = query(q, where("academicYear", "==", academicYear));
                const [querySnapshot, coursesSnap, assignmentSnap] = await Promise.all([
                    getDocs(q),
                    getDocs(collection(db, 'school-settings', schoolId, 'courses')),
                    getDocs(collection(db, 'school-settings', schoolId, 'course_assignments')),
                ]);

                const courseDataMap: Record<string, any> = {};
                coursesSnap.forEach(courseDoc => {
                    const data = { id: courseDoc.id, ...courseDoc.data() } as any;
                    courseDataMap[courseDoc.id] = data;
                    const code = getCourseCode(data);
                    if (code) courseDataMap[code] = data;
                });

                const assignmentMap: Record<string, any> = {};
                assignmentSnap.forEach(assignmentDoc => {
                    const data = assignmentDoc.data();
                    const courseId = String(data.courseId || '').trim();
                    if (!courseId) return;
                    const yearMatches = !academicYear || !data.academicYear || String(data.academicYear) === String(academicYear);
                    if (yearMatches && semesterMatchesValue(data.semester, semester)) {
                        assignmentMap[courseId] = data;
                    }
                });

                const dailySchedules: CourseSchedule[] = [];

                querySnapshot.forEach(doc => {
                    const data = doc.data();
                    const dataYear = String(data.academicYear || "");
                    const dataSemester = String(data.semester || data.term || "");
                    const yearMatches = !academicYear || !dataYear || dataYear === academicYear;
                    const semesterMatches = !semester || !dataSemester || dataSemester === semester || dataSemester.startsWith(`${semester}/`) || semester.startsWith(`${dataSemester}/`) || dataSemester.includes(semester);
                    if (!yearMatches || !semesterMatches) return;

                    const docTeacherId = data.teacherId || doc.id.split('__')[0];
                    if (String(docTeacherId) !== String((currentTeacher as any).id)) return;

                    const scheduleMap = data.schedule || {};

                    Object.keys(scheduleMap)
                        .filter(slotKey => slotKey.startsWith(`${dayKey}-`) && scheduleMap[slotKey])
                        .forEach(slotKey => {
                            const i = getPeriodNumberFromSlotKey(slotKey, dayKey);
                            if (!i) return;

                            const slotContent = scheduleMap[slotKey];
                            const coursesArr = Array.isArray(slotContent) ? slotContent : [slotContent];

                            coursesArr.forEach((course: any) => {
                                if (!course || course === '-') return;

                                const courseId = course.id || course.courseId || '';
                                const subjectCode = getCourseCode(course);
                                const fullCourseData = courseId ? courseDataMap[courseId] : (subjectCode ? courseDataMap[subjectCode] : null);
                                const semesterAssignments = courseId ? (assignmentMap[courseId]?.teacherAssignments || []) : [];
                                const courseAssignments = fullCourseData?.teacherAssignments || [];
                                const inlineAssignments = course.teacherAssignments || [];
                                const assignments = [
                                    ...(Array.isArray(semesterAssignments) ? semesterAssignments : []),
                                    ...(Array.isArray(courseAssignments) ? courseAssignments : []),
                                    ...(Array.isArray(inlineAssignments) ? inlineAssignments : []),
                                ];
                                const myAssignment = assignments.find((assignment: any) =>
                                    getAssignmentTeacherIds(assignment).includes(String((currentTeacher as any).id))
                                );
                                const isMyCourse = String(course.teacherId) === String((currentTeacher as any).id) ||
                                    String(data.teacherId) === String((currentTeacher as any).id) ||
                                    (course.teacherIds && Array.isArray(course.teacherIds) && course.teacherIds.map(String).includes(String((currentTeacher as any).id))) ||
                                    Boolean(myAssignment);

                                if (isMyCourse) {
                                    const timeInfo = getPeriodInfo(i);
                                    const courseClassId = (myAssignment?.classLevels && myAssignment.classLevels.length > 0)
                                        ? myAssignment.classLevels
                                        : (course.classId || fullCourseData?.classId || data.classId);
                                    const groupNumber = Number(course.groupNumber || course.group || 1) || 1;
                                    const roomIds = normalizeRoomIds(myAssignment?.roomIds || course.room || course.roomIds || course.roomNumber || data.room || data.roomNumber);
                                    const displayRoom = roomIds.length > 0 && !roomIds.includes('all')
                                        ? roomIds.map((id: string) => roomMap[id] || id).join(', ')
                                        : String(groupNumber);
                                    const levelName = formatClassDisplay(courseClassId);

                                    dailySchedules.push({
                                        id: `${doc.id}-${slotKey}-${courseId || subjectCode || 'course'}-${groupNumber}`,
                                        courseId,
                                        subjectCode,
                                        subjectName: course.title || course.subjectName || fullCourseData?.title || fullCourseData?.subjectName || "ไม่ระบุชื่อวิชา",
                                        period: i,
                                        startTime: timeInfo.startTime,
                                        endTime: timeInfo.endTime,
                                        classId: courseClassId,
                                        className: (() => {
                                            const classIdStr = String(Array.isArray(courseClassId) ? courseClassId[0] : courseClassId);
                                            if (CLASSES[classIdStr]) return `${CLASSES[classIdStr]}${groupNumber ? `/${groupNumber}` : ''}`;
                                            if (classIdStr.includes('/')) {
                                                const parts = classIdStr.split('/');
                                                const levelKey = parts[0];
                                                const roomNum = parts[parts.length - 1];
                                                if (CLASSES[levelKey]) return `${CLASSES[levelKey]}/${roomNum}`;
                                            }
                                            return `${levelName}${groupNumber ? `/${groupNumber}` : ''}`;
                                        })(),
                                        room: displayRoom,
                                        roomIds,
                                        groupNumber,
                                        day: dayKey,
                                        isChecked: false
                                    });
                                }
                            });
                        });
                });

                // --- 2.1 Fetch Substitutions ---
                const startOfDay = new Date(currentDate); startOfDay.setHours(0, 0, 0, 0);
                const endOfDay = new Date(currentDate); endOfDay.setHours(23, 59, 59, 999);

                const subRef = collection(db, 'school-settings', schoolId, 'substitutions');
                const subQ = query(
                    subRef,
                    where('substituteTeacherId', '==', (currentTeacher as any).id ? String((currentTeacher as any).id) : "")
                );

                const subSnap = await getDocs(subQ);

                subSnap.forEach(doc => {
                    const data = doc.data();
                    const subDate = data.date ? (data.date.toDate ? data.date.toDate() : new Date(data.date)) : null;

                    if (subDate && subDate >= startOfDay && subDate <= endOfDay) {
                        const periodNumber = normalizeTeachingPeriod(data.period);
                        const timeInfo = getPeriodInfo(periodNumber);
                        const subLevelName = CLASSES[data.classId] || data.classId || "ไม่ระบุชั้น";
                        const rawSubRoom = data.roomName || data.room || data.roomIds || data.classroom || "";
                        let subRoom = "";

                        if (typeof rawSubRoom === 'string' && rawSubRoom.trim()) {
                            subRoom = rawSubRoom;
                        } else if (Array.isArray(rawSubRoom)) {
                            const firstValid = rawSubRoom.find(r => r && String(r).toLowerCase() !== 'all');
                            subRoom = firstValid ? (roomMap[String(firstValid)] || String(firstValid)) : "";
                        } else if (rawSubRoom && String(rawSubRoom).toLowerCase() !== 'all') {
                            subRoom = roomMap[String(rawSubRoom)] || String(rawSubRoom);
                        }

                        dailySchedules.push({
                            id: `sub-${doc.id}`,
                            substitutionId: doc.id,
                            courseId: data.courseId || data.originalCourseId,
                            subjectCode: data.subjectCode || "",
                            subjectName: data.subjectName || "สอนแทน",
                            period: periodNumber,
                            startTime: formatDisplayTime(data.startTime) || timeInfo.startTime,
                            endTime: formatDisplayTime(data.endTime) || timeInfo.endTime,
                            classId: data.classId,
                            className: (() => {
                                const classIdStr = String(data.classId);
                                if (CLASSES[classIdStr]) return `${CLASSES[classIdStr]}${data.groupNumber ? `/${data.groupNumber}` : ''}`;
                                if (classIdStr.includes('/')) {
                                    const parts = classIdStr.split('/');
                                    const levelKey = parts[0];
                                    const roomNum = parts[parts.length - 1];
                                    if (CLASSES[levelKey]) return `${CLASSES[levelKey]}/${roomNum}`;
                                }
                                return `${subLevelName}${data.groupNumber ? `/${data.groupNumber}` : ''}`;
                            })(),
                            room: subRoom,
                            groupNumber: Number(data.groupNumber || data.group || subRoom || 1) || 1,
                            day: dayKey,
                            isChecked: false,
                            isSubstitute: true,
                            originalTeacherId: data.originalTeacherId || "",
                            originalTeacherName: teacherMap[data.originalTeacherId]?.firstName 
                                ? `${teacherMap[data.originalTeacherId].title || ''}${teacherMap[data.originalTeacherId].firstName} ${teacherMap[data.originalTeacherId].lastName}`
                                : (data.originalTeacherName || "ไม่ระบุ")
                        });
                    }
                });

                // Deduplicate schedules to prevent duplicate entries for the same slot
                const uniqueSchedulesMap = new Map<string, CourseSchedule>();
                dailySchedules.forEach(item => {
                    const periodKey = item.period ? `period-${item.period}` : 'unknown';
                    const classKey = Array.isArray(item.classId) ? item.classId.join('-') : String(item.classId || '');
                    const courseKey = item.courseId || item.subjectCode || item.subjectName || '';
                    const subKey = item.isSubstitute ? `sub-${item.substitutionId}` : 'normal';
                    const key = `${periodKey}-${classKey}-${courseKey}-${subKey}`;
                    uniqueSchedulesMap.set(key, item);
                });
                const deduplicatedSchedules = Array.from(uniqueSchedulesMap.values());

                // Sort based on course identity fields first to keep consecutive periods of the same class/course adjacent
                deduplicatedSchedules.sort((a, b) => {
                    const aClassKey = getStableClassKey(a.classId);
                    const bClassKey = getStableClassKey(b.classId);
                    if (aClassKey !== bClassKey) return aClassKey.localeCompare(bClassKey);
                    
                    const aCourse = a.courseId || a.subjectCode || '';
                    const bCourse = b.courseId || b.subjectCode || '';
                    if (aCourse !== bCourse) return aCourse.localeCompare(bCourse);
                    
                    if (a.groupNumber !== b.groupNumber) return (a.groupNumber || 0) - (b.groupNumber || 0);
                    
                    const aRoom = a.room || '';
                    const bRoom = b.room || '';
                    if (aRoom !== bRoom) return aRoom.localeCompare(bRoom);
                    
                    if (a.isSubstitute !== b.isSubstitute) return (a.isSubstitute ? 1 : 0) - (b.isSubstitute ? 1 : 0);
                    
                    const aOrig = a.originalTeacherId || '';
                    const bOrig = b.originalTeacherId || '';
                    if (aOrig !== bOrig) return aOrig.localeCompare(bOrig);
                    
                    return a.period - b.period;
                });

                // Group consecutive double/multiple periods (คาบคู่/คาบติดต่อกัน)
                const groupedSchedules: CourseSchedule[] = [];
                for (let i = 0; i < deduplicatedSchedules.length; i++) {
                    const current = { ...deduplicatedSchedules[i] };
                    const periods = [current.period];
                    let currentEndTime = current.endTime;

                    while (i + 1 < deduplicatedSchedules.length) {
                        const next = deduplicatedSchedules[i + 1];

                        const isConsecutive = next.period === current.period + periods.length;
                        const sameCourse = next.courseId === current.courseId && next.subjectCode === current.subjectCode;
                        const sameClass = getStableClassKey(next.classId) === getStableClassKey(current.classId) && next.className === current.className;
                        const sameGroup = next.groupNumber === current.groupNumber;
                        const sameRoom = next.room === current.room;
                        const sameSub = next.isSubstitute === current.isSubstitute && next.originalTeacherId === current.originalTeacherId;

                        if (isConsecutive && sameCourse && sameClass && sameGroup && sameSub && sameRoom) {
                            periods.push(next.period);
                            currentEndTime = next.endTime;
                            i++;
                        } else {
                            break;
                        }
                    }

                    if (periods.length > 1) {
                        current.isDoublePeriod = true;
                        current.periods = periods;
                        current.endTime = currentEndTime;
                    }
                    groupedSchedules.push(current);
                }

                // Sort grouped schedules back to chronological order
                groupedSchedules.sort((a, b) => {
                    const aIdx = a.isDoublePeriod && a.periods ? a.periods[0] : a.period;
                    const bIdx = b.isDoublePeriod && b.periods ? b.periods[0] : b.period;
                    return aIdx - bIdx;
                });

                setSchedules(groupedSchedules);

            } catch (error: any) {
                console.error("Error fetching schedules:", error);
                if (error.code === 'unavailable' || error.message?.includes('offline')) {
                    Swal.fire('การเชื่อมต่อขัดข้อง', 'ไม่สามารถโหลดข้อมูลได้ กรุณาตรวจสอบอินเทอร์เน็ต', 'warning');
                } else {
                    Swal.fire('เกิดข้อผิดพลาด', 'ไม่สามารถดึงข้อมูลตารางสอนได้', 'error');
                }
            } finally {
                setLoading(false);
            }
        };

        fetchSchedule();
    }, [currentDate, schoolId, currentTeacher, scheduleDayOverride, academicYear, semester, roomMap, teacherMap, teachingPeriodNumbers, periodInfoByNumber]);

    const isCurrentPeriod = (start: string, end: string) => {
        const now = new Date();
        const { hour: startH, minute: startM } = parseTimeParts(start);
        const { hour: endH, minute: endM } = parseTimeParts(end);
        const startTime = new Date(now); startTime.setHours(startH, startM, 0);
        const endTime = new Date(now); endTime.setHours(endH, endM, 0);
        return now >= startTime && now <= endTime;
    };

    // --- 3. Fetch Students when Class Selected ---
    useEffect(() => {
        const fetchStudents = async () => {
            if (!schoolId || !selectedClass) return;
            setStudentsLoading(true);
            setIsSubmitted(false);

            try {
                const enrollmentsRef = collection(db, 'school-settings', schoolId, 'enrollments');
                const groupNumber = selectedClass.groupNumber || (!selectedClass.isSubstitute ? (Number(selectedClass.room) || 1) : undefined);
                const enrollmentQueries = [];
                const subjectCodeVariants = Array.from(new Set([
                    selectedClass.subjectCode,
                    selectedClass.subjectCode?.replace(/\s/g, ''),
                    selectedClass.subjectCode?.toUpperCase?.(),
                    selectedClass.subjectCode?.replace(/\s/g, '').toUpperCase?.(),
                ].filter(Boolean).map(String)));
                const shouldUseEnrollmentOnly = Boolean(selectedClass.courseId || subjectCodeVariants.length > 0);

                if (selectedClass.courseId) {
                    if (academicYear && semester) {
                        enrollmentQueries.push(query(enrollmentsRef, where('courseId', '==', selectedClass.courseId), where('academicYear', '==', academicYear), where('semester', '==', semester)));
                    }
                    if (academicYear) {
                        enrollmentQueries.push(query(enrollmentsRef, where('courseId', '==', selectedClass.courseId), where('academicYear', '==', academicYear)));
                    }
                    enrollmentQueries.push(query(enrollmentsRef, where('courseId', '==', selectedClass.courseId)));
                }

                if (subjectCodeVariants.length > 0) {
                    ['courseCode', 'subjectCode', 'code'].forEach(field => {
                        subjectCodeVariants.forEach(code => {
                            if (academicYear && semester) {
                                enrollmentQueries.push(query(enrollmentsRef, where(field, '==', code), where('academicYear', '==', academicYear), where('semester', '==', semester)));
                            }
                            if (academicYear) {
                                enrollmentQueries.push(query(enrollmentsRef, where(field, '==', code), where('academicYear', '==', academicYear)));
                            }
                            enrollmentQueries.push(query(enrollmentsRef, where(field, '==', code)));
                        });
                    });
                }

                const enrollmentDocMap = new Map<string, any>();
                for (const enrollmentQ of enrollmentQueries) {
                    const snap = await getDocs(enrollmentQ);
                    snap.docs.forEach(enrollDoc => enrollmentDocMap.set(enrollDoc.id, enrollDoc));
                }

                let studentList: Student[] = [];
                const enrollmentDocs = Array.from(enrollmentDocMap.values());

                if (enrollmentDocs.length > 0) {
                    // Substitute classes use strict matching to avoid pulling students from
                    // multiple rooms when classId is a broad grade-level or multi-room array.
                    const classFilter = (data: any) =>
                        !data.classLevel || (
                            selectedClass.isSubstitute
                                ? matchesClassValueStrict(data.classLevel, selectedClass.classId)
                                : (matchesClassValue(data.classLevel, selectedClass.classId) || matchesClassValue(data.classLevel, selectedClass.className))
                        );

                    let filteredDocs = enrollmentDocs.filter(d => {
                        const data = d.data();
                        return matchesEnrollmentGroup(data, groupNumber) && classFilter(data);
                    });

                    if (filteredDocs.length === 0) {
                        // Retry without group filter (class filter only)
                        filteredDocs = enrollmentDocs.filter(d => classFilter(d.data()));
                    }

                    // For non-substitute: additional fallbacks to avoid empty list
                    if (filteredDocs.length === 0 && !selectedClass.isSubstitute) {
                        filteredDocs = enrollmentDocs.filter(d => matchesEnrollmentGroup(d.data(), groupNumber));
                    }

                    if (filteredDocs.length === 0 && !selectedClass.isSubstitute) {
                        filteredDocs = enrollmentDocs;
                    }

                    const enrolledStudentIds = Array.from(new Set(filteredDocs.map(d => d.data().studentId).filter(Boolean).map(String)));
                    const studentsRef = collection(db, 'school-settings', schoolId, 'students');
                    const studentMap = new Map<string, Student>();

                    for (let i = 0; i < enrolledStudentIds.length; i += 30) {
                        const batchIds = enrolledStudentIds.slice(i, i + 30);
                        const studentSnap = await getDocs(query(studentsRef, where('__name__', 'in', batchIds)));
                        studentSnap.forEach(snap => {
                            const data = snap.data() as any;
                            studentMap.set(snap.id, {
                                id: snap.id,
                                firstName: data.firstName || '',
                                lastName: data.lastName || '',
                                number: data.studentNumber || data.number || '',
                                studentNumber: data.studentId || '',
                                studentId: data.studentId || '',
                                gender: data.gender || '',
                                prefix: data.title || data.prefix || '',
                                profileImageUrl: data.profileImageUrl || '',
                                nickname: data.nickname || '',
                                status: data.status || '',
                                studentStatus: data.studentStatus || '',
                            } as Student);
                        });
                    }

                    filteredDocs.forEach(enrollDoc => {
                        const data = enrollDoc.data();
                        const sId = String(data.studentId || enrollDoc.id);
                        if (!studentMap.has(sId)) {
                            const nameParts = String(data.studentName || '').trim().split(/\s+/);
                            studentMap.set(sId, {
                                id: sId,
                                firstName: data.firstName || nameParts[0] || '',
                                lastName: data.lastName || nameParts.slice(1).join(' ') || '',
                                number: data.number || data.studentNumber || '',
                                studentNumber: data.studentCode || data.studentId || '',
                                studentId: data.studentId || data.studentCode || '',
                                gender: data.gender || '',
                                prefix: data.prefix || data.title || '',
                                profileImageUrl: data.profileImageUrl || '',
                                nickname: data.nickname || '',
                                status: data.status || '',
                                studentStatus: data.studentStatus || '',
                            } as Student);
                        }
                    });
                    studentList = Array.from(studentMap.values()).filter(isCurrentStudent);
                } else if (shouldUseEnrollmentOnly) {
                    studentList = [];
                } else {
                    const studentsRef = collection(db, 'school-settings', schoolId, 'students');
                    const classVariants = getClassVariants(selectedClass.classId);
                    const snapshot = classVariants.length > 0
                        ? await getDocs(query(studentsRef, where('classLevel', 'in', classVariants.slice(0, 30))))
                        : await getDocs(query(studentsRef, where('classLevel', '==', selectedClass.className)));

                    studentList = snapshot.docs.map(doc => {
                        const data = doc.data() as any;
                        return {
                            id: doc.id,
                            ...data,
                            number: data.studentNumber || data.number || "",
                            studentId: data.studentId || "",
                            studentNumber: data.studentId || "",
                            prefix: data.title || data.prefix || "",
                            nickname: data.nickname || ""
                        } as Student;
                    }).filter(student => matchesClassValue((student as any).classLevel || selectedClass.className, selectedClass.classId))
                      .filter(isCurrentStudent);
                }

                studentList.sort((a, b) => {
                    const numA = parseInt(a.number || '0', 10);
                    const numB = parseInt(b.number || '0', 10);
                    return (isNaN(numA) ? 0 : numA) - (isNaN(numB) ? 0 : numB);
                });
                setStudents(studentList);

                const initialAttendance: Record<string, any> = {};
                const initialLeaves: Record<string, boolean> = {};
                studentList.forEach(s => initialAttendance[s.id] = 'present');

                // Check for Leave Records
                const leavePromises = studentList.map(async (student) => {
                    try {
                        const leavesRef = collection(db, 'school-settings', schoolId, 'students', student.id, 'leave_summary');
                        const q = query(leavesRef, where('status', '==', 'approved'));
                        const snap = await getDocs(q);

                        const today = new Date(currentDate); today.setHours(0, 0, 0, 0);
                        const todayStr = today.toISOString().split('T')[0];

                        const validLeave = snap.docs.find(doc => {
                            const data = doc.data();
                            const getDateStr = (val: any) => {
                                if (val?.toDate) return val.toDate().toISOString().split('T')[0];
                                if (typeof val === 'string') return val;
                                return '';
                            };
                            const s = getDateStr(data.startDate);
                            const e = getDateStr(data.endDate);
                            return s && e && s <= todayStr && e >= todayStr;
                        });

                        if (validLeave) {
                            return { id: student.id, isLeave: true, leaveType: validLeave.data().leaveType };
                        }
                    } catch (err) {
                        console.error("Error checking leave", err);
                    }
                    return null;
                });

                const leaveResults = await Promise.all(leavePromises);
                leaveResults.forEach(res => {
                    if (res && res.isLeave) {
                        if (res.leaveType === 'ไปราชการ/กิจกรรม') {
                            initialAttendance[res.id] = 'present';
                        } else {
                            initialAttendance[res.id] = 'leave';
                        }
                        initialLeaves[res.id] = true;
                    }
                });

                setAttendance(initialAttendance);
                setStudentLeaves(initialLeaves);

                // Check if attendance already exists
                const dateStr = `${String(currentDate.getDate()).padStart(2, '0')}-${String(currentDate.getMonth() + 1).padStart(2, '0')}-${currentDate.getFullYear()}`;
                const attendancePromises = studentList.map(async (student) => {
                    const stableSubjectCode = selectedClass.subjectCode || selectedClass.courseId || (selectedClass.isSubstitute ? (selectedClass.substitutionId || selectedClass.id) : '');
                    const classKey = getStableClassKey(selectedClass.classId);
                    const periodNum = selectedClass.isSubstitute ? normalizeTeachingPeriod(selectedClass.period) : (selectedClass.period || 0);
                    const roomKey = selectedClass.room && selectedClass.room !== 'all' ? String(selectedClass.room) : '';
                    
                    const periodsToCheck = selectedClass.isDoublePeriod && selectedClass.periods
                        ? selectedClass.periods
                        : [periodNum];

                    for (const pNum of periodsToCheck) {
                        // Try new format first (with period)
                        const newId = `${dateStr}_${stableSubjectCode}_${classKey}_P${pNum}`.replace(/\//g, '-');
                        const newRef = doc(db, 'school-settings', schoolId, 'students', student.id, 'ClassroomAttendance', newId);
                        const newSnap = await getDoc(newRef);
                        
                        if (newSnap.exists()) return { id: student.id, status: newSnap.data().status };

                        // Fallback to legacy historical format where room was embedded in classId/document id
                        if (roomKey) {
                            const legacyRoomId = `${dateStr}_${stableSubjectCode}_${classKey}_${roomKey}_P${pNum}`.replace(/\//g, '-');
                            const legacyRoomRef = doc(db, 'school-settings', schoolId, 'students', student.id, 'ClassroomAttendance', legacyRoomId);
                            const legacyRoomSnap = await getDoc(legacyRoomRef);

                            if (legacyRoomSnap.exists()) return { id: student.id, status: legacyRoomSnap.data().status };
                        }
                    }
                    
                    // Fallback to old format (no period)
                    const oldId = `${dateStr}_${stableSubjectCode}_${classKey}`.replace(/\//g, '-');
                    const oldRef = doc(db, 'school-settings', schoolId, 'students', student.id, 'ClassroomAttendance', oldId);
                    const oldSnap = await getDoc(oldRef);

                    if (oldSnap.exists()) return { id: student.id, status: oldSnap.data().status };

                    if (roomKey) {
                        const legacyRoomOldId = `${dateStr}_${stableSubjectCode}_${classKey}_${roomKey}`.replace(/\//g, '-');
                        const legacyRoomOldRef = doc(db, 'school-settings', schoolId, 'students', student.id, 'ClassroomAttendance', legacyRoomOldId);
                        const legacyRoomOldSnap = await getDoc(legacyRoomOldRef);

                        if (legacyRoomOldSnap.exists()) return { id: student.id, status: legacyRoomOldSnap.data().status };
                    }

                    return null;
                });

                const results = await Promise.all(attendancePromises);
                const loadedAttendance = { ...initialAttendance };
                let hasRecord = false;
                results.forEach(res => {
                    if (res) {
                        loadedAttendance[res.id] = res.status;
                        hasRecord = true;
                    }
                });
                setAttendance(loadedAttendance);

                if (hasRecord) {
                    setIsSubmitted(true);
                    Swal.fire({ icon: 'info', title: 'มีการบันทึกแล้ว', text: 'สามารถกดปุ่ม "แก้ไข" เพื่อเปลี่ยนแปลงข้อมูลได้', timer: 1500, showConfirmButton: false });
                }

            } catch (error: any) {
                console.error("Error fetching students:", error);
            } finally {
                setStudentsLoading(false);
            }
        };

        if (selectedClass) fetchStudents();
    }, [selectedClass, schoolId, currentDate, academicYear, semester]);

    // --- ปิดระบบ Auto-Refresh เมื่อสลับแท็บตามที่ผู้ใช้แจ้ง (ลดภาระการโหลดซ้ำ) ---
    /*
    useEffect(() => {
        const handleFocus = () => setRefreshTick(t => t + 1);
        const handleVisibility = () => { if (document.visibilityState === 'visible') setRefreshTick(t => t + 1); };
        window.addEventListener('focus', handleFocus);
        document.addEventListener('visibilitychange', handleVisibility);
        return () => {
            window.removeEventListener('focus', handleFocus);
            document.removeEventListener('visibilitychange', handleVisibility);
        };
    }, []);
    */

    const handleSaveAttendance = async () => {
        if (!schoolId || !selectedClass) return;

        try {
            const year = currentDate.getFullYear();
            const dateStr = `${String(currentDate.getDate()).padStart(2, '0')}-${String(currentDate.getMonth() + 1).padStart(2, '0')}-${year}`;
            // Match Historical Attendance Page: 12:00:00 for the date
            const normalizedDateObj = new Date(year, currentDate.getMonth(), currentDate.getDate(), 12, 0, 0);

            // Generate stable subject code and class key
            const stableSubjectCode = selectedClass.subjectCode || selectedClass.courseId || (selectedClass.isSubstitute ? (selectedClass.substitutionId || selectedClass.id) : '');
            const classKey = getStableClassKey(selectedClass.classId);
            const periodNum = selectedClass.isSubstitute ? normalizeTeachingPeriod(selectedClass.period) : (selectedClass.period || 0);
            const selectedRoomIds = normalizeRoomIds(selectedClass.roomIds && selectedClass.roomIds.length > 0 ? selectedClass.roomIds : selectedClass.room);
            const roomKey = selectedRoomIds[0] || '';

            const derivedClassName = selectedClass.className || CLASSES[classKey] || formatClassDisplay(selectedClass.classId);

            const periodsToSave = selectedClass.isDoublePeriod && selectedClass.periods
                ? selectedClass.periods
                : [periodNum];

            const batch = writeBatch(db);
            students.forEach(student => {
                periodsToSave.forEach((pNum: number) => {
                    const attendanceId = `${dateStr}_${stableSubjectCode}_${classKey}_P${pNum}`.replace(/\//g, '-');
                    const studentRef = doc(db, 'school-settings', schoolId, 'students', student.id, 'ClassroomAttendance', attendanceId);
                    
                    batch.set(studentRef, {
                        schoolId,
                        studentId: student.id,
                        date: Timestamp.fromDate(normalizedDateObj),
                        classId: classKey,
                        className: derivedClassName,
                        room: roomKey || null,
                        roomIds: selectedRoomIds,
                        groupNumber: selectedClass.groupNumber || null,
                        period: pNum,
                        subjectName: selectedClass.subjectName,
                        subjectCode: selectedClass.subjectCode || '',
                        courseId: selectedClass.courseId || null,
                        isSubstitute: selectedClass.isSubstitute || false,
                        substitutionId: selectedClass.substitutionId || null,
                        originalTeacherId: selectedClass.originalTeacherId || null,
                        originalTeacherName: selectedClass.originalTeacherName || null,
                        teacherId: (currentTeacher as any)?.id || (currentUser as any)?.uid || 'unknown',
                        teacherName: (currentTeacher as any)?.name || (currentUser as any)?.displayName || '',
                        status: attendance[student.id] || 'present',
                        academicYear,
                        semester,
                        updatedAt: Timestamp.now(),
                    }, { merge: true });
                });

                // Deletes for legacy format or older periods in case they exist
                periodsToSave.forEach((pNum: number) => {
                    const legacyRoomRef = roomKey
                        ? doc(db, 'school-settings', schoolId, 'students', student.id, 'ClassroomAttendance', `${dateStr}_${stableSubjectCode}_${classKey}_${roomKey}_P${pNum}`.replace(/\//g, '-'))
                        : null;
                    if (legacyRoomRef) batch.delete(legacyRoomRef);
                });

                const oldRef = doc(db, 'school-settings', schoolId, 'students', student.id, 'ClassroomAttendance', `${dateStr}_${stableSubjectCode}_${classKey}`.replace(/\//g, '-'));
                batch.delete(oldRef);

                const legacyRoomOldRef = roomKey
                    ? doc(db, 'school-settings', schoolId, 'students', student.id, 'ClassroomAttendance', `${dateStr}_${stableSubjectCode}_${classKey}_${roomKey}`.replace(/\//g, '-'))
                    : null;
                if (legacyRoomOldRef) batch.delete(legacyRoomOldRef);
            });

            await batch.commit();

            Swal.fire({ icon: 'success', title: 'บันทึกสำเร็จ', text: 'บันทึกการเช็คชื่อเรียบร้อยแล้ว', timer: 1500, showConfirmButton: false });
            setIsSubmitted(true);
            setSelectedClass(null);
            sessionStorage.removeItem('attendance_selected_class');
        } catch (error: any) {
            console.error("Error saving attendance:", error);
            Swal.fire('เกิดข้อผิดพลาด', 'ไม่สามารถบันทึกข้อมูลได้', 'error');
        }
    };

    const toggleStatus = (studentId: string, status: 'present' | 'absent' | 'late' | 'leave' | 'escape') => {
        if (isSubmitted || isHoliday || studentLeaves[studentId]) return;
        setAttendance(prev => ({ ...prev, [studentId]: status }));
    };

    const attendanceSummary = useMemo(() => {
        return students.reduce(
            (acc, student) => {
                const status = attendance[student.id] || 'present';
                const key = status === 'present' ? 'มา' : status === 'late' ? 'สาย' : status === 'leave' ? 'ลา' : status === 'escape' ? 'หนีเรียน' : 'ขาด';
                acc[key as keyof typeof acc]++;
                return acc;
            },
            { "มา": 0, "สาย": 0, "ลา": 0, "ขาด": 0, "หนีเรียน": 0 }
        );
    }, [students, attendance]);

    return (
        <MainLayout>
            <div className={`text-gray-900 dark:text-white transition-colors duration-300 min-h-screen overflow-x-hidden ${isPwaMode ? 'px-2.5 py-3 pb-6' : 'p-4 sm:p-6'}`}>
                <div className={`${isPwaMode ? 'max-w-full' : 'max-w-5xl'} mx-auto min-w-0`}>
                    {!isPwaMode && <BackButton to="/academic/hub/attendance" className="mb-4" />}
                    <AttendanceHeader
                        teacherName={(currentTeacher as any)?.name || ''}
                        currentDate={currentDate}
                        academicYear={academicYear}
                        semester={semester}
                        onDateChange={setCurrentDate}
                        title="ระบบเช็คชื่อเข้าเรียน"
                    />

                    {isHoliday && schedules.length === 0 ? (
                        <HolidayView holidayName={holidayName} />
                    ) : !selectedClass ? (
                        <div className="space-y-4">
                            {isHoliday && schedules.length > 0 && (
                                <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 p-4 rounded-2xl flex items-center gap-3 text-amber-700 dark:text-amber-400 mb-4">
                                    <div className="bg-amber-100 dark:bg-amber-900/40 p-2 rounded-full">
                                        <Calendar size={20} />
                                    </div>
                                    <div>
                                        <p className="font-bold">หมายเหตุ: วันนี้เป็นวันหยุด ({holidayName})</p>
                                        <p className="text-sm">แต่คุณมีคาบสอนในระบบ จึงสามารถเช็คชื่อได้ตามปกติ</p>
                                    </div>
                                </div>
                            )}
                            <ScheduleListView
                                schedules={schedules}
                                loading={loading}
                                onSelectClass={setSelectedClass}
                                inactiveCourseIds={inactiveCourseIds}
                                isCurrentPeriod={isCurrentPeriod}
                                currentDate={currentDate}
                            />
                        </div>
                    ) : (
                        <AttendanceCheckView
                            selectedClass={selectedClass}
                            students={students}
                            attendance={attendance}
                            studentLeaves={studentLeaves}
                            isSubmitted={isSubmitted}
                            isHoliday={isHoliday}
                            studentsLoading={studentsLoading}
                            schoolId={schoolId}
                            onBack={() => {
                                setSelectedClass(null);
                                sessionStorage.removeItem('attendance_selected_class');
                            }}
                            onEdit={() => setIsSubmitted(false)}
                            onSave={handleSaveAttendance}
                            onToggleStatus={toggleStatus}
                            attendanceSummary={attendanceSummary}
                        />
                    )}
                </div>
            </div>
        </MainLayout>
    );
};

export default ClassroomAttendancePage;
