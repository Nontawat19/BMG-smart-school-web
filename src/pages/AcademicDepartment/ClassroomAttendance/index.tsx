import React, { useState, useEffect, useMemo } from 'react';
import { useSelector, useDispatch } from 'react-redux';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { RootState } from '@/store';
import MainLayout from "@/layouts/MainLayout";
import { firestore as db } from '@/firebase';
import { doc, getDoc, collection, query, where, getDocs, Timestamp, writeBatch, runTransaction } from 'firebase/firestore';
import Swal from 'sweetalert2';
import { Calendar } from 'lucide-react';
import { fetchTeachersMap } from '@/store/slices/userMapSlice';
import { fetchCalendar } from '@/store/slices/calendarSlice';
import { isNonOfficialHoliday } from '@/utils/calendarUtils';
import { CLASSES } from '@/utils/schoolUtils';
import { getCurrentThaiYear } from '@/utils/dateUtils';
import { isStudyingStudent } from '@/utils/studentStatusUtils';
import { useResponsivePwaMode as usePwaMode } from '@/hooks/useResponsivePwaMode';

// Sub-components and Utilities from the same folder
import { Student, CourseSchedule } from './types';
import { DAYS, PERIOD_TIMES } from './constants';
import AttendanceHeader from './components/AttendanceHeader';
import HolidayView from './components/HolidayView';
import ScheduleListView from './components/ScheduleListView';
import AttendanceCheckView from './components/AttendanceCheckView';
import { calculateClassroomBehaviorScoreChange } from '@/utils/behaviorScoreUtils';
import { invalidateStaleResolvedRequests } from '@/utils/remediationUtils';
import {
    getClassVariants,
    matchesClassValue,
    matchesClassValueStrict,
    formatClassDisplay,
    getStableClassKey,
    hasRoomSpecificClass,
} from '@/utils/attendanceClassMatching';
import {
    isPrimaryClassValue,
    computeCourseAttendanceEligibilityForRoster,
} from '@/utils/attendanceEligibilityFirestore';

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

const toDateKey = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

const parseTimeParts = (time: string) => {
    const [hour, minute] = String(time || '').replace('.', ':').split(':').map(Number);
    return {
        hour: Number.isFinite(hour) ? hour : 0,
        minute: Number.isFinite(minute) ? minute : 0,
    };
};

const ClassroomAttendancePage: React.FC = () => {
    const isPwaMode = usePwaMode();
    const navigate = useNavigate();
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
    const [originalAttendance, setOriginalAttendance] = useState<Record<string, 'present' | 'absent' | 'late' | 'leave' | 'escape'>>({});
    const [studentLeaves, setStudentLeaves] = useState<Record<string, boolean>>({});
    const [isSubmitted, setIsSubmitted] = useState(false);
    const [isSaving, setIsSaving] = useState(false);
    const [loading, setLoading] = useState(true);
    const [studentsLoading, setStudentsLoading] = useState(false);
    const [behaviorConfig, setBehaviorConfig] = useState<any>(null);
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
                const isTeachingSlot =
                    setting.isTeachingPeriod === true ||
                    setting.isTeaching === true ||
                    String(setting.id || '').startsWith('period-');
                if (!isTeachingSlot) {
                    // The numeric suffix may be a period NUMBER stored in old schedule format
                    // (before a non-teaching slot was inserted, shifting array indices).
                    // Try to find the corresponding period-N entry by id.
                    const candidate = `period-${index}`;
                    const alt = activePeriods.find((p: any) => p.id === candidate);
                    if (alt && alt.isTeachingPeriod !== false && alt.isTeaching !== false) {
                        return index;
                    }
                    return null;
                }
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

    // --- 1.1 Fetch Behavior Score Config ---
    useEffect(() => {
        const fetchBehaviorConfig = async () => {
            if (!schoolId) return;
            try {
                const schoolRef = doc(db, 'school-settings', schoolId);
                const snap = await getDoc(schoolRef);
                if (snap.exists() && snap.data().behaviorScoreConfig) {
                    setBehaviorConfig(snap.data().behaviorScoreConfig);
                }
            } catch (err) {
                console.error("Error fetching behavior config:", err);
            }
        };
        fetchBehaviorConfig();
    }, [schoolId]);

    // --- 1.2 Fetch Courses to find inactive ones ---
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

    // --- 1.3 Fetch Physical Rooms for mapping ---
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

    // --- 1.4 Fetch Period Settings for accurate period times ---
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

    // --- 2. Check for Holidays ---
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

            // Track holiday status in a local variable through this effect run — the
            // `isHoliday` state var only reflects the previous render (React state updates
            // don't apply synchronously), so checks below must not read it mid-effect.
            let holidayDetected = false;

            // 2. Term Boundaries: Check if within any term period
            const isWithinTerm = calendarState.terms.some(t =>
                t.startDate && t.endDate && dateStr >= t.startDate && dateStr <= t.endDate
            );

            if (!isWithinTerm) {
                holidayDetected = true;
                setIsHoliday(true);
                setHolidayName('อยู่นอกภาคเรียน (ไม่อยู่ในช่วงวันเรียน 100 วัน)');
            }

            // 3. Regular Weekend: Saturday (6) and Sunday (0) are non-school days unless schoolDay
            const dayOfWeek = currentDate.getDay();
            if (dayOfWeek === 0 || dayOfWeek === 6) {
                if (!holidayDetected) {
                    holidayDetected = true;
                    setIsHoliday(true);
                    setHolidayName(dayOfWeek === 0 ? 'วันอาทิตย์' : 'วันเสาร์');
                }
            }

            // 4. Calendar Events: Specific holidays or special closures
            if (event) {
                if (event.type === 'holiday' || event.type === 'specialHoliday') {
                    holidayDetected = true;
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
                                // ต้องกรองด้วย groupNumber ของสล็อตนี้ด้วย ไม่ใช่แค่ teacherId — ถ้าครูคนเดียวกัน
                                // สอนวิชานี้หลายกลุ่ม (เช่น กลุ่ม 1 และกลุ่ม 2) การ find แค่ teacherId จะได้ assignment
                                // ของกลุ่มแรกที่เจอเสมอ ทำให้ classLevels/room ผิดกลุ่มเมื่อแสดงตารางของกลุ่มอื่น
                                const slotGroupNumber = Number(course.groupNumber || course.group || 1) || 1;
                                const myAssignment = assignments.find((assignment: any) =>
                                    getAssignmentTeacherIds(assignment).includes(String((currentTeacher as any).id)) &&
                                    (assignment.groupNumber === undefined || assignment.groupNumber === null || Number(assignment.groupNumber) === slotGroupNumber)
                                ) || assignments.find((assignment: any) =>
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
                                    const groupNumber = slotGroupNumber;
                                    // ห้องเรียน (ม.X/Y) — เลขต่อท้ายต้องเป็นเลขห้อง/แผนก (assignment.room เช่น "1" ของ
                                    // ม.1/1) ไม่ใช่เลขกลุ่มสอน (groupNumber เช่น "กลุ่ม 2") ซึ่งเป็นคนละความหมายกัน
                                    // (ดูรูปแบบเดียวกันที่ CourseEnrollmentPage.tsx ใช้: `${label}/${a.room}`)
                                    const classRoomSuffix = myAssignment?.room || groupNumber;
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
                                            if (CLASSES[classIdStr]) return `${CLASSES[classIdStr]}${classRoomSuffix ? `/${classRoomSuffix}` : ''}`;
                                            if (classIdStr.includes('/')) {
                                                const parts = classIdStr.split('/');
                                                const levelKey = parts[0];
                                                const roomNum = parts[parts.length - 1];
                                                if (CLASSES[levelKey]) return `${CLASSES[levelKey]}/${roomNum}`;
                                            }
                                            return `${levelName}${classRoomSuffix ? `/${classRoomSuffix}` : ''}`;
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

                        // Resolve groupNumber: use explicit value from Firestore only — never
                        // fall back to subRoom (a display string) or default 1, because defaulting
                        // to group 1 would incorrectly filter out students in other groups.
                        const subGroupNumber = data.groupNumber != null
                            ? (Number(data.groupNumber) || undefined)
                            : undefined;

                        // classId may be null (unknown), string, or string[] — all handled correctly
                        // by matchesClassValueStrict (null→match all enrolled, []→no match via safety fix)
                        const subClassId = data.classId ?? null;
                        const subClassIdStr = Array.isArray(subClassId)
                            ? subClassId[0] || ''
                            : String(subClassId || '');

                        dailySchedules.push({
                            id: `sub-${doc.id}`,
                            substitutionId: doc.id,
                            courseId: data.courseId || data.originalCourseId || '',
                            subjectCode: data.subjectCode || "",
                            subjectName: data.subjectName || "สอนแทน",
                            period: periodNumber,
                            startTime: formatDisplayTime(data.startTime) || timeInfo.startTime,
                            endTime: formatDisplayTime(data.endTime) || timeInfo.endTime,
                            classId: subClassId ?? '',
                            className: (() => {
                                if (CLASSES[subClassIdStr]) return `${CLASSES[subClassIdStr]}${subGroupNumber ? `/${subGroupNumber}` : ''}`;
                                if (subClassIdStr.includes('/')) {
                                    const parts = subClassIdStr.split('/');
                                    const levelKey = parts[0];
                                    const roomNum = parts[parts.length - 1];
                                    if (CLASSES[levelKey]) return `${CLASSES[levelKey]}/${roomNum}`;
                                    return subClassIdStr;
                                }
                                const displayLevel = CLASSES[subClassIdStr] || subClassIdStr || "ไม่ระบุชั้น";
                                return `${displayLevel}${subGroupNumber ? `/${subGroupNumber}` : ''}`;
                            })(),
                            room: subRoom,
                            groupNumber: subGroupNumber,
                            day: dayKey,
                            isChecked: false,
                            isSubstitute: true,
                            date: toDateKey(subDate),
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
                const groupNumber = (() => {
                    if (selectedClass.groupNumber) return selectedClass.groupNumber;
                    if (selectedClass.isSubstitute) {
                        // Derive room from className (e.g., "ม.4/1" → 1) when groupNumber not stored
                        const clsName = selectedClass.className || '';
                        if (clsName.includes('/')) {
                            const part = clsName.split('/').pop();
                            const num = Number(part);
                            if (Number.isFinite(num) && num > 0) return num;
                            if (part && part.toLowerCase() !== 'all') return part;
                        }
                        const classIdStr = Array.isArray(selectedClass.classId)
                            ? (selectedClass.classId[0] || '')
                            : String(selectedClass.classId || '');
                        if (classIdStr.includes('/')) {
                            const part = classIdStr.split('/').pop();
                            const num = Number(part);
                            if (Number.isFinite(num) && num > 0) return num;
                            if (part && part.toLowerCase() !== 'all') return part;
                        }
                        return undefined;
                    }
                    return Number(selectedClass.room) || 1;
                })();
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

                if (selectedClass.isSubstitute) {
                    console.log('[DEBUG substitute]', {
                        classId: selectedClass.classId,
                        className: selectedClass.className,
                        groupNumber: selectedClass.groupNumber,
                        courseId: selectedClass.courseId,
                        subjectCode: selectedClass.subjectCode,
                        enrollmentCount: enrollmentDocs.length,
                        sampleEnrollments: enrollmentDocs.slice(0, 5).map(d => {
                            const dd = d.data();
                            return { classLevel: dd.classLevel, room: dd.room, groupName: dd.groupName, studentId: dd.studentId };
                        }),
                    });
                }

                if (enrollmentDocs.length > 0) {
                    // Enrollment records store grade and room separately (classLevel="m4", room="1").
                    // When substitution's classId has a room component (e.g. "m4/1"), we must also
                    // attempt a composite match on the two separate fields — otherwise strict matching
                    // against classLevel alone always fails and falls through to the last-resort
                    // which returns ALL enrolled students across every room.
                    const compositeMatchesSubstituteClass = (data: any): boolean => {
                        const classIds = Array.isArray(selectedClass.classId)
                            ? selectedClass.classId.filter(Boolean).map(String)
                            : [selectedClass.classId].filter(Boolean).map(String);
                        for (const cid of classIds) {
                            if (!cid.includes('/')) continue;
                            const slashIdx = cid.indexOf('/');
                            const levelPart = cid.substring(0, slashIdx);
                            const roomPart = cid.substring(slashIdx + 1);
                            if (!levelPart || !roomPart || roomPart.toLowerCase() === 'all') continue;
                            const levelVariants = getClassVariants(levelPart)
                                .map(v => v.toLowerCase().replace(/\s/g, ''));
                            const normalizedLevel = String(data.classLevel || '').toLowerCase().replace(/\s/g, '');
                            if (!levelVariants.some(v => v === normalizedLevel)) continue;
                            // Grade part matches — verify room from enrollment's room or groupName
                            if (normalizeRoom(data.room) === normalizeRoom(roomPart)) return true;
                            const gName = String(data.groupName || '')
                                .replace(/^กลุ่ม\s*/i, '').replace(/^ก\.\s*/i, '');
                            if (normalizeRoom(gName) === normalizeRoom(roomPart)) return true;
                        }
                        return false;
                    };

                    const classFilter = (data: any) => {
                        if (!data.classLevel) return true;
                        if (!selectedClass.isSubstitute) {
                            return matchesClassValue(data.classLevel, selectedClass.classId) ||
                                matchesClassValue(data.classLevel, selectedClass.className);
                        }
                        // 1. Strict class match (both sides store class the same way)
                        if (matchesClassValueStrict(data.classLevel, selectedClass.classId)) return true;
                        if (selectedClass.className &&
                            matchesClassValueStrict(data.classLevel, selectedClass.className)) return true;
                        // 2. Composite match: classId="m4/1" but enrollment stores classLevel="m4" + room="1"
                        if (compositeMatchesSubstituteClass(data)) return true;
                        return false;
                    };

                    let filteredDocs = enrollmentDocs.filter(d => {
                        const data = d.data();
                        return matchesEnrollmentGroup(data, groupNumber) && classFilter(data);
                    });

                    if (filteredDocs.length === 0) {
                        // Retry without group filter (class filter only)
                        filteredDocs = enrollmentDocs.filter(d => classFilter(d.data()));
                    }

                    if (filteredDocs.length === 0 && selectedClass.isSubstitute) {
                        const canRelaxClassMatch = !groupNumber && !hasRoomSpecificClass(selectedClass.classId);
                        if (canRelaxClassMatch) {
                            // Some substitute records are saved with grade-level classId such as "m1"
                            // while enrollments store room-level values such as "m1/1". In that case
                            // the strict matcher returns zero students even though the course enrollment
                            // is valid, so relax to the normal matcher as a fallback.
                            filteredDocs = enrollmentDocs.filter(d => {
                                const data = d.data();
                                return !data.classLevel ||
                                    matchesClassValue(data.classLevel, selectedClass.classId) ||
                                    matchesClassValue(data.classLevel, selectedClass.className);
                            });
                        }
                    }

                    if (filteredDocs.length === 0 && selectedClass.isSubstitute) {
                        // Last resort for substitute classes: apply at least the group filter to
                        // avoid returning students from unrelated rooms. Only fall back to all
                        // enrolled students if there is genuinely no group/room info available.
                        if (groupNumber) {
                            filteredDocs = enrollmentDocs.filter(d =>
                                matchesEnrollmentGroup(d.data(), groupNumber)
                            );
                        }
                        if (filteredDocs.length === 0) {
                            filteredDocs = enrollmentDocs;
                        }
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
                                profileImageThumbUrl: data.profileImageThumbUrl || '',
                                nickname: data.nickname || '',
                                status: data.status || '',
                                studentStatus: data.studentStatus || '',
                                behaviorScore: data.behaviorScore,
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
                                profileImageThumbUrl: data.profileImageThumbUrl || '',
                                nickname: data.nickname || '',
                                status: data.status || '',
                                studentStatus: data.studentStatus || '',
                            } as Student);
                        }
                    });
                    studentList = Array.from(studentMap.values()).filter(isStudyingStudent);
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
                      .filter(isStudyingStudent);
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

                        // ห้ามใช้ .toISOString() หลัง setHours(0,0,0,0) — setHours ตั้งเวลาเที่ยงคืนตาม
                        // timezone เครื่อง (ไทย = UTC+7) แต่ toISOString() แปลงกลับเป็น UTC ทำให้ได้วันที่
                        // ย้อนหลังไป 1 วันเสมอ (เที่ยงคืนไทยของวันที่ X = 17:00 UTC ของวันที่ X-1) ต้องอ่าน
                        // ปี/เดือน/วัน แบบ local ตรงๆ แทน เพื่อให้ได้ค่าเป็นวันที่ตามปฏิทินจริงที่ครูเห็นบนจอ
                        const todayStr = `${currentDate.getFullYear()}-${String(currentDate.getMonth() + 1).padStart(2, '0')}-${String(currentDate.getDate()).padStart(2, '0')}`;

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
                setOriginalAttendance(hasRecord ? { ...loadedAttendance } : {});

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

    // เช็คเวลาเรียนสะสมของวิชานี้ (ไม่ใช่แค่วันนี้) แล้วบังคับติด "มส" ทันทีให้นักเรียนที่เวลาเรียน
    // ต่ำกว่าร้อยละ 80 — ใช้ตรรกะเดียวกับที่หน้าปพ.5 ใช้ (src/utils/attendanceEligibility.ts) เพื่อไม่ให้
    // ผลลัพธ์ทั้งสองหน้าขัดแย้งกัน ครูจึงไม่ต้องเปิดปพ.5 อีกต่อไปเพื่อให้ มส ติดอัตโนมัติ
    // Returns false (and never throws) if this best-effort check itself fails — attendance
    // is already durably saved by the caller before this runs, so a failure here must not
    // roll back or block the attendance-save success flow, only surface a separate warning.
    const applyAttendanceEligibilityFlags = async (courseId: string | undefined, rosterStudents: Student[]): Promise<boolean> => {
        if (!schoolId || !courseId || !selectedClass || rosterStudents.length === 0) return true;
        try {
            const courseSnap = await getDoc(doc(db, 'school-settings', schoolId, 'courses', courseId));
            const courseData = courseSnap.exists() ? { id: courseSnap.id, ...courseSnap.data() } as any : null;

            // Same threshold calculation ปพ.5 uses ('elapsed' = sessions up to today only) via
            // the shared helper — fetches this course/room-group's weekly schedule + full
            // attendance history, then computes each student's cumulative attendance %.
            const msSemester = isPrimaryClassValue(selectedClass.classId) ? 'annual' : semester;
            const msCalendarData = { ...(calendarState.rawData || {}), events: calendarEvents };
            const { eligibility, dailyStatus } = await computeCourseAttendanceEligibilityForRoster(
                db,
                schoolId,
                academicYear,
                {
                    courseId,
                    classId: selectedClass.classId,
                    className: selectedClass.className,
                    subjectCode: selectedClass.subjectCode,
                    courseCode: courseData?.code,
                    teacherAssignments: courseData?.teacherAssignments,
                    selectedRoomForMatch: (selectedClass.roomIds && selectedClass.roomIds[0]) || selectedClass.room,
                },
                rosterStudents,
                msCalendarData,
                msSemester
            );

            const belowThresholdStudents = rosterStudents.filter(s => eligibility[s.id]?.belowThreshold);
            if (belowThresholdStudents.length === 0) return true;

            // เวลาเรียนสะสม "elapsed" นับตั้งแต่ต้นภาค/ปี จึงมักยังต่ำกว่า 80% ต่อไปอีกนานแม้แก้ มส สำเร็จ
            // แล้ว (การแก้ มส แก้ที่เกรด ไม่ได้ย้อนแก้เวลาเรียนที่ขาดไปแล้วในอดีต) — ถ้าไม่กันจุดนี้ไว้ การเช็คชื่อ
            // ครั้งถัดไปครั้งใดก็ตาม (แม้แค่วันเดียวหลังแก้ มส สำเร็จ) จะเขียนสถานะ มส ทับผลที่แก้ไขไปแล้วทันที ทำให้
            // ฟีเจอร์แก้ มส ใช้งานจริงไม่ได้เลย จึงต้องข้ามคนที่มีคำร้องแก้ตัว "resolved" อยู่แล้วสำหรับวิชา/ปี/เทอมนี้
            // ไปก่อน เว้นแต่จะมีวันขาดเรียนใหม่ (absent/escape) เกิดขึ้น "หลัง" วันที่แก้ตัวสำเร็จจริง ๆ ซึ่งแปลว่า
            // ปัญหายังเกิดต่อเนื่องอยู่จริงไม่ใช่แค่ผลสะสมเก่าที่ค้างมาจากก่อนแก้
            const resolvedByStudentId: Record<string, Date | null> = {};
            const idsToCheck = belowThresholdStudents.map(s => s.id);
            for (let i = 0; i < idsToCheck.length; i += 30) {
                const idChunk = idsToCheck.slice(i, i + 30);
                const resolvedSnap = await getDocs(query(
                    collection(db, 'school-settings', schoolId, 'remediation_requests'),
                    where('studentId', 'in', idChunk),
                    where('flagType', '==', 'course'),
                    where('courseId', '==', courseId),
                    where('academicYear', '==', academicYear),
                    where('semester', '==', msSemester),
                    where('status', '==', 'resolved'),
                ));
                resolvedSnap.forEach(d => {
                    const data = d.data() as any;
                    const resolvedAt = data.resolvedAt?.toDate ? data.resolvedAt.toDate() : null;
                    resolvedByStudentId[data.studentId] = resolvedAt;
                });
            }

            const toDateKeyLocal = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
            const studentsToReFlag = belowThresholdStudents.filter(student => {
                if (!(student.id in resolvedByStudentId)) return true; // ไม่เคยแก้ตัวมาก่อน — ทำงานตามปกติ
                const resolvedAt = resolvedByStudentId[student.id];
                if (!resolvedAt) return true; // ไม่มีวันที่แก้ตัวให้เทียบ — เผื่อไว้ก่อน ทำงานตามปกติ
                const resolvedDateKey = toDateKeyLocal(resolvedAt);
                const statusMap = dailyStatus[student.id] || {};
                return Object.entries(statusMap).some(([dateKey, status]) =>
                    dateKey > resolvedDateKey && (status === 'absent' || status === 'escape')
                );
            });

            if (studentsToReFlag.length === 0) return true;

            // Overwrite status/grade -> 'มส' exactly like useGradeBookActions.ts's handleSave —
            // same remark text, same merge-preserving-scores behavior — so both save paths agree.
            const existingSnaps = await Promise.all(
                studentsToReFlag.map(student => getDoc(doc(db, 'school-settings', schoolId, 'courses', courseId, 'grades', student.id)))
            );

            const msBatch = writeBatch(db);
            const changedStudentIds: string[] = [];
            studentsToReFlag.forEach((student, idx) => {
                const info = eligibility[student.id];
                const existingSnap = existingSnaps[idx];
                const existingData = existingSnap.exists() ? existingSnap.data() as any : null;
                const newRemark = `เวลาเรียนไม่ถึงร้อยละ 80 (${info.presentHours}/${info.totalHours} คาบ = ${info.percentage.toFixed(1)}%)`;

                // Skip if already correctly flagged with the same numbers — teachers may save
                // attendance many times a day across periods, and re-writing an unchanged มส
                // record on every save would be pure waste.
                if (existingData?.status === 'มส' && existingData?.remark === newRemark) return;

                const baseRecord = existingData || { formative: 0, midterm: 0, final: 0, total: 0, grade: '0' };
                const gradeRef = doc(db, 'school-settings', schoolId, 'courses', courseId, 'grades', student.id);
                msBatch.set(gradeRef, {
                    ...baseRecord,
                    status: 'มส',
                    grade: 'มส',
                    remark: newRemark,
                    updatedAt: Timestamp.now(),
                }, { merge: true });
                changedStudentIds.push(student.id);
            });

            if (changedStudentIds.length > 0) await msBatch.commit();

            // เวลาเรียนยังไม่ถึงเกณฑ์ซ้ำอีกครั้งในภาคเรียนเดียวกัน (เช่น เคยแก้ มส สำเร็จไปแล้วแต่ขาดเรียนใหม่ต่อ
            // หลังแก้ตัว) — ยกเลิกคำร้องแก้ตัวเดิมที่ resolved ไปแล้ว กันไม่ให้สถานะ "แก้ตัวสำเร็จ" ค้างแสดงทั้งที่
            // ผลจริงกลับไปติด มส ใหม่แล้ว เช็คเฉพาะกลุ่ม studentsToReFlag ที่ยืนยันแล้วว่ามีวันขาดเรียนใหม่จริง
            // (ไม่ใช่ belowThresholdStudents ทั้งหมด — คนที่แก้ตัวสำเร็จแล้วและไม่มีวันขาดใหม่ต้องไม่ถูกยกเลิกคำร้อง)
            await Promise.all(studentsToReFlag.map(student => invalidateStaleResolvedRequests(
                schoolId, student.id, 'course', courseId, academicYear, msSemester,
            )));
            return true;
        } catch (err) {
            console.error('Error applying attendance-eligibility (มส) flags:', err);
            return false;
        }
    };

    const handleSaveAttendance = async () => {
        if (!schoolId || !selectedClass || isSaving) return;

        setIsSaving(true);
        try {
            // For substitute-teaching sessions, always save under the substitution's own
            // scheduled date (selectedClass.date), never the page's currentDate navigator —
            // currentDate can drift away from the substitution's real date (arrow buttons,
            // or reopening the same check-in link on a later day to back-fill a missed
            // session), which previously produced a second, wrongly-dated duplicate of the
            // same attendance instead of correctly overwriting the original day's record.
            const effectiveDate = (selectedClass.isSubstitute && selectedClass.date)
                ? (() => {
                    const [y, m, d] = selectedClass.date!.split('-').map(Number);
                    return new Date(y, m - 1, d);
                })()
                : currentDate;

            const year = effectiveDate.getFullYear();
            const dateStr = `${String(effectiveDate.getDate()).padStart(2, '0')}-${String(effectiveDate.getMonth() + 1).padStart(2, '0')}-${year}`;
            // Match Historical Attendance Page: 12:00:00 for the date
            const normalizedDateObj = new Date(year, effectiveDate.getMonth(), effectiveDate.getDate(), 12, 0, 0);

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

            // Firestore batches cap at 500 ops. Rosters for elective/whole-grade courses can
            // exceed that after set+delete ops, so spread writes across multiple batches.
            const MAX_OPS_PER_BATCH = 450;
            const batches: ReturnType<typeof writeBatch>[] = [writeBatch(db)];
            let opsInCurrentBatch = 0;
            const nextBatch = () => {
                if (opsInCurrentBatch >= MAX_OPS_PER_BATCH) {
                    batches.push(writeBatch(db));
                    opsInCurrentBatch = 0;
                }
                opsInCurrentBatch++;
                return batches[batches.length - 1];
            };

            const scoreChanges: { studentId: string; oldStatus: string; newStatus: string }[] = [];

            students.forEach(student => {
                periodsToSave.forEach((pNum: number) => {
                    const attendanceId = `${dateStr}_${stableSubjectCode}_${classKey}_P${pNum}`.replace(/\//g, '-');
                    const studentRef = doc(db, 'school-settings', schoolId, 'students', student.id, 'ClassroomAttendance', attendanceId);

                    nextBatch().set(studentRef, {
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

                // Apply behavior score if changed (once per student, not once per period —
                // the status is the same across periodsToSave for a given save action).
                // The score transactions themselves only run after the attendance batches
                // commit successfully (see below), so a failed attendance save never leaves
                // an orphaned score change with no matching record.
                const newStatus = `class:${attendance[student.id] || 'present'}`;
                const originalStatusStr = originalAttendance[student.id];
                const oldStatus = originalStatusStr ? `class:${originalStatusStr}` : "class:present";

                if (newStatus !== oldStatus && behaviorConfig) {
                    scoreChanges.push({ studentId: student.id, oldStatus, newStatus });
                }

                // Deletes for legacy format or older periods in case they exist
                periodsToSave.forEach((pNum: number) => {
                    const legacyRoomRef = roomKey
                        ? doc(db, 'school-settings', schoolId, 'students', student.id, 'ClassroomAttendance', `${dateStr}_${stableSubjectCode}_${classKey}_${roomKey}_P${pNum}`.replace(/\//g, '-'))
                        : null;
                    if (legacyRoomRef) nextBatch().delete(legacyRoomRef);
                });

                const oldRef = doc(db, 'school-settings', schoolId, 'students', student.id, 'ClassroomAttendance', `${dateStr}_${stableSubjectCode}_${classKey}`.replace(/\//g, '-'));
                nextBatch().delete(oldRef);

                const legacyRoomOldRef = roomKey
                    ? doc(db, 'school-settings', schoolId, 'students', student.id, 'ClassroomAttendance', `${dateStr}_${stableSubjectCode}_${classKey}_${roomKey}`.replace(/\//g, '-'))
                    : null;
                if (legacyRoomOldRef) nextBatch().delete(legacyRoomOldRef);
            });

            // Commit attendance first — the source of truth — before touching behavior scores.
            for (const b of batches) {
                await b.commit();
            }

            // Check cumulative attendance % against the 80% threshold right here, so a student
            // who just fell below it gets มส immediately — no need for anyone to separately
            // open ปพ.5 to trigger this. Best-effort like the behavior score adjustments below:
            // attendance is already durably saved above, so a failure here is only surfaced as
            // a warning, never rolled back.
            const msFlagUpdateOk = await applyAttendanceEligibilityFlags(selectedClass.courseId, students);

            // Behavior score adjustments are best-effort follow-ups: the attendance record
            // is already durably saved above, so a failure here is logged but doesn't block
            // the success flow. It also can't be silently retried by re-saving — once
            // attendance is saved, the next save's oldStatus === newStatus so no score change
            // gets queued again — so a failure here must be surfaced to the user rather than
            // shown as a plain, misleading "success" message.
            let scoreUpdateFailed = false;
            if (scoreChanges.length > 0) {
                try {
                    await Promise.all(scoreChanges.map(({ studentId, oldStatus, newStatus }) => {
                        const student = students.find(s => s.id === studentId);
                        const studentMainRef = doc(db, 'school-settings', schoolId, 'students', studentId);
                        // Read the live score fresh inside a transaction so a concurrent write
                        // (gate check-in, manual adjustment, flag ceremony, etc.) can never be
                        // silently overwritten by this classroom attendance save.
                        return runTransaction(db, async (transaction) => {
                            const studentSnap = await transaction.get(studentMainRef);
                            const freshScore = studentSnap.exists() ? Number(studentSnap.data().behaviorScore ?? student?.behaviorScore ?? 100) : (student?.behaviorScore ?? 100);
                            const result = calculateClassroomBehaviorScoreChange({
                                currentScore: freshScore,
                                oldStatus,
                                newStatus,
                                config: behaviorConfig,
                            });
                            if (result) {
                                transaction.set(studentMainRef, result.update, { merge: true });
                            }
                        });
                    }));
                } catch (scoreError) {
                    console.error("Error applying behavior score changes:", scoreError);
                    scoreUpdateFailed = true;
                }
            }

            if (scoreUpdateFailed || !msFlagUpdateOk) {
                const failureParts = [
                    scoreUpdateFailed ? 'ปรับคะแนนพฤติกรรมไม่สำเร็จ' : null,
                    !msFlagUpdateOk ? 'ตรวจสอบเวลาเรียน (มส) ไม่สำเร็จ' : null,
                ].filter(Boolean).join(' และ');
                Swal.fire({
                    icon: 'warning',
                    title: 'บันทึกการเช็คชื่อสำเร็จ',
                    text: `แต่${failureParts} กรุณาตรวจสอบด้วยตนเอง`,
                    timer: 3500,
                    showConfirmButton: false,
                });
            } else {
                Swal.fire({ icon: 'success', title: 'บันทึกสำเร็จ', text: 'บันทึกการเช็คชื่อเรียบร้อยแล้ว', timer: 1500, showConfirmButton: false });
            }
            setIsSubmitted(true);
            setSelectedClass(null);
            sessionStorage.removeItem('attendance_selected_class');
        } catch (error: any) {
            console.error("Error saving attendance:", error);
            Swal.fire('เกิดข้อผิดพลาด', 'ไม่สามารถบันทึกข้อมูลได้', 'error');
        } finally {
            setIsSaving(false);
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
                    <AttendanceHeader
                        teacherName={(currentTeacher as any)?.name || ''}
                        currentDate={currentDate}
                        academicYear={academicYear}
                        semester={semester}
                        onDateChange={setCurrentDate}
                        locked={!!selectedClass}
                        onBack={() => {
                            if (selectedClass) {
                                setSelectedClass(null);
                                sessionStorage.removeItem('attendance_selected_class');
                            } else {
                                navigate('/academic/hub/attendance');
                            }
                        }}
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
                            isSaving={isSaving}
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
