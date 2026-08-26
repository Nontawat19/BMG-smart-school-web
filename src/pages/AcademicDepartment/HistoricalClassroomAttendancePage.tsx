import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useSelector, useDispatch } from 'react-redux';
import { RootState } from '@/store';
import MainLayout from "@/layouts/MainLayout";
import BackButton from '@/components/Shared/BackButton';
import { firestore as db } from '@/firebase';
import { collection, query, where, getDocs, doc, getDoc, collectionGroup, writeBatch, Timestamp, runTransaction } from 'firebase/firestore';
import Swal from 'sweetalert2';
import {
    CheckSquare,
    X,
    Users,
    Search,
    Save,
    FileSpreadsheet,
    ChevronLeft,
    ChevronRight,
    ChevronDown,
    Filter,
    BarChart3,
    AlertCircle,
    AlertTriangle,
    CheckCircle,
    Calendar
} from 'lucide-react';
import { FaLock } from "react-icons/fa";
import { Link, useSearchParams } from 'react-router-dom';
import { fetchTeachersMap } from '@/store/slices/userMapSlice';
import * as XLSX from 'xlsx';
import { isNonOfficialHoliday } from '@/utils/calendarUtils';
import { CLASSES } from '@/utils/schoolUtils';
import Select from 'react-select';
import { fetchCalendar } from '@/store/slices/calendarSlice';
import { getCurrentThaiYear } from '@/utils/dateUtils';
import { ACADEMIC_MANAGEMENT } from '@/constants/permissions';
import { getClassVariants, matchesClassValue, getStableClassKey, matchesAssignmentGroupRoom } from '@/utils/attendanceClassMatching';
import { calculateClassroomBehaviorScoreChange } from '@/utils/behaviorScoreUtils';

// --- Interfaces ---
interface Student {
    id: string;
    firstName: string;
    lastName: string;
    number: string;
    studentNumber?: string;
    gender?: string;
    prefix?: string;
    profileImageUrl?: string;
    nickname?: string;
    room?: string;
    groupName?: string;
    classLevel?: string;
}

interface Course {
    id: string;
    code: string;
    title: string;
    classId: string | string[];
    credits?: string | number;
    hoursPerWeek?: number;
    teacherAssignments?: any[];
    teacherId?: string;
    teacherIds?: string[];
}

interface CalendarEvent {
    type: 'schoolDay' | 'holiday' | 'specialHoliday';
    description?: string;
    scheduleDay?: string;
}

interface Term {
    startDate: string | null;
    endDate: string | null;
}

interface LeaveRecord {
    type: string; // 'sick', 'personal', 'activity', etc.
    description: string;
}

interface PeriodSetting {
    id: string;
    label?: string;
    startTime: string;
    endTime: string;
    isTeachingPeriod?: boolean;
    isTeaching?: boolean;
}

type DateReason = 'holiday' | 'special_holiday' | 'weekend' | 'term_break' | 'schoolDay' | 'historical_locked' | 'not_scheduled' | 'specialHoliday';

interface DateMetadata {
    isCheckable: boolean;
    isRelevant?: boolean;
    reason?: DateReason;
    description?: string;
    periodCount?: number;
    periodNumber?: number;
    displayDate?: string;
}


const TERMS = ['1', '2'];

const DAY_KEY_MAP: Record<number, string> = {
    0: 'sun', 1: 'mon', 2: 'tue', 3: 'wed', 4: 'thu', 5: 'fri', 6: 'sat'
};

const THAI_DAY_NAMES = ['วันอาทิตย์', 'วันจันทร์', 'วันอังคาร', 'วันพุธ', 'วันพฤหัสบดี', 'วันศุกร์', 'วันเสาร์'];

const normalizeRoom = (value: unknown) => {
    const raw = String(value ?? '').trim();
    if (!raw) return '';
    const numeric = Number(raw);
    return Number.isFinite(numeric) ? String(numeric) : raw.toLowerCase();
};


const getAssignmentTeacherIds = (assignment: any): string[] => {
    const ids = Array.isArray(assignment?.teacherIds) && assignment.teacherIds.length > 0
        ? assignment.teacherIds
        : (assignment?.teacherId ? [assignment.teacherId] : []);
    return Array.from(new Set(ids.filter((id: string) => id && id !== 'pending' && !String(id).startsWith('GHOST'))));
};

// Whether a teacher is allowed to view/edit this course's history — either as the
// course's sole/primary teacher, one of its listed co-teachers, or assigned to it
// via a group teacherAssignments entry (co-teaching / grouped sections).
const isCourseOwnedByTeacher = (course: Course, teacherId?: string): boolean => {
    if (!teacherId) return false;
    if (String(course.teacherId || '') === String(teacherId)) return true;
    if (Array.isArray(course.teacherIds) && course.teacherIds.map(String).includes(String(teacherId))) return true;
    return (course.teacherAssignments || []).some(a => getAssignmentTeacherIds(a).includes(String(teacherId)));
};

const getDateDisplayPart = (slotKey: string) => slotKey.split('_')[0];
const displayDateToISO = (displayDate: string) => {
    const [dd, mm, yy] = displayDate.split('-');
    return `${yy}-${mm}-${dd}`;
};

// Dark mode styles for react-select
const selectStyles = {
    control: (base: any, state: any) => ({
        ...base,
        backgroundColor: 'var(--select-bg)',
        borderColor: state.isFocused ? '#6366f1' : 'var(--select-border)',
        boxShadow: state.isFocused ? '0 0 0 3px rgba(99, 102, 241, 0.18)' : 'none',
        '&:hover': {
            borderColor: state.isFocused ? '#6366f1' : 'var(--select-border-hover)'
        },
        borderRadius: '0.75rem',
        fontSize: '0.875rem',
        minHeight: '46px',
        transition: 'all 160ms ease',
    }),
    valueContainer: (base: any) => ({
        ...base,
        padding: '0 12px',
        minWidth: 0,
        flexWrap: 'nowrap',
    }),
    menu: (base: any) => ({
        ...base,
        backgroundColor: 'var(--select-menu-bg)',
        border: '1px solid var(--select-border)',
        borderRadius: '0.75rem',
        overflow: 'hidden',
        zIndex: 100
    }),
    menuPortal: (base: any) => ({ ...base, zIndex: 9999 }),
    option: (base: any, state: any) => ({
        ...base,
        backgroundColor: state.isSelected ? '#6366f1' : state.isFocused ? 'var(--select-option-hover)' : 'transparent',
        color: state.isSelected ? 'white' : 'var(--select-text)',
        padding: '10px 12px',
        fontSize: '0.8125rem',
        cursor: 'pointer',
    }),
    singleValue: (base: any) => ({
        ...base,
        color: 'var(--select-text)',
        overflow: 'hidden',
        textOverflow: 'ellipsis',
        whiteSpace: 'nowrap',
        maxWidth: '100%',
    }),
    input: (base: any) => ({
        ...base,
        color: 'var(--select-text)'
    }),
    placeholder: (base: any) => ({
        ...base,
        color: '#9ca3af'
    }),
    indicatorsContainer: (base: any) => ({
        ...base,
        paddingRight: 6,
    }),
    clearIndicator: (base: any) => ({
        ...base,
        padding: 6,
    }),
    dropdownIndicator: (base: any) => ({
        ...base,
        padding: 6,
    }),
    indicatorSeparator: (base: any) => ({
        ...base,
        backgroundColor: 'var(--select-border)',
        marginTop: 10,
        marginBottom: 10,
    }),
};

// Helper to check if a record matches the selected room/group precisely (consistent across modules)
const matchesRoomGroup = (data: any, selectedRoom: string): boolean => {
    if (!selectedRoom) return true;
    const normalizedSelected = normalizeRoom(selectedRoom);
    // A record's own room/roomNumber/roomIds fields — always populated on modern attendance
    // records (see ClassroomAttendance/index.tsx's save payload: room/roomIds are set from
    // the schedule slot's own room, not the group index).
    const roomCandidates = [
        data.room,
        data.roomNumber,
        ...(Array.isArray(data.roomIds) ? data.roomIds : [])
    ].map(normalizeRoom).filter(Boolean);
    const groupName = String(data.groupName || '').trim();
    const className = String(data.className || '').trim();
    const classId = String(data.classId || '').trim();

    const matchesExact = roomCandidates.includes(normalizedSelected) || roomCandidates.includes('all');
    const matchesGroup = normalizeRoom(groupName.replace(/^กลุ่ม\s*/i, '').replace(/^ก\.\s*/i, '')) === normalizedSelected;
    const matchesClassNameSuffix = className.endsWith('/' + selectedRoom) || className.endsWith('/' + normalizedSelected);
    const matchesClassIdSuffix = classId.endsWith('_' + selectedRoom) || classId.endsWith('_' + normalizedSelected);

    if (matchesExact || matchesGroup || matchesClassNameSuffix || matchesClassIdSuffix) return true;

    // Last-resort fallback ONLY when the record has no real room field to check against at
    // all. `groupNumber`/`group` is a sequential group INDEX, not a room label — comparing it
    // directly to selectedRoom (as this function used to do unconditionally) is a coincidence
    // match, not identity, and was pulling a *different* room/group's attendance records
    // (and their periods) into this room's history grid whenever their groupNumber happened
    // to equal the room number being viewed (e.g. viewing room "1" incorrectly matching a
    // different room's record whose groupNumber is 1) — producing extra, wrongly-dated
    // checkable columns in the date grid built from these records.
    if (roomCandidates.length === 0) {
        const legacyGroupCandidates = [data.groupNumber, data.group].map(normalizeRoom).filter(Boolean);
        if (legacyGroupCandidates.includes(normalizedSelected)) return true;
    }

    return false;
};

// Calculate Calendar Year based on Academic Year + Semester + Month + Terms Data
const calculateCalendarYear = (acadYearStr: string, semester: string, monthIdx: number, terms?: any): number => {
    const acadYearBE = parseInt(acadYearStr);
    const acadYearAD = !isNaN(acadYearBE) ? acadYearBE - 543 : new Date().getFullYear();

    // 1. Try to use explicit terms data if available
    const termKey = semester === '2' ? 'term2' : 'term1';
    const termData = terms?.[termKey];

    if (termData?.startDate) {
        const start = new Date(termData.startDate);
        const startYear = start.getFullYear();
        const startMonth = start.getMonth();

        if (termData.endDate) {
            const end = new Date(termData.endDate);
            const endYear = end.getFullYear();
            const endMonth = end.getMonth();

            // Case 1: Term stays within one calendar year
            if (startYear === endYear) {
                return startYear;
            }

            // Case 2: Term spans across Jan 1st (e.g. Nov 2025 - Mar 2026)
            // If month is >= startMonth (e.g. 10, 11), use startYear
            // If month is <= endMonth (e.g. 0, 1, 2), use endYear
            if (monthIdx >= startMonth) return startYear;
            if (monthIdx <= endMonth) return endYear;
            
            // If month is in between (e.g. gap months), return closest
            return (monthIdx < startMonth && monthIdx > endMonth) ? startYear : endYear;
        }
        
        // If only start date is known
        if (semester === '2' && monthIdx >= 0 && monthIdx <= 3 && startMonth > 3) {
            return startYear + 1;
        }
        return startYear;
    }

    // 2. Fallback to existing heuristic logic
    // Semester 1 (usually May-Oct) is always in the base AD year
    if (semester === '1') return acadYearAD;
    
    // Semester 2 (usually Nov-Mar) starts in Year X and ends in Year X+1
    // Jan(0) to Apr(3) are in the following AD year
    if (monthIdx >= 0 && monthIdx <= 3) {
        return acadYearAD + 1;
    } else {
        return acadYearAD;
    }
};

const isPrimaryClassValue = (classValue: string) => {
    const value = String(classValue || '').trim().toLowerCase();
    const variants = getClassVariants(classValue).map(v => v.toLowerCase());
    return /^p[1-6]$/.test(value) || variants.some(v => v.includes('ป.') || v.includes('ประถม'));
};

const getTermKeyForISODate = (dateStr: string, terms?: any, fallbackSemester = '1'): 'term1' | 'term2' => {
    const term1 = terms?.term1;
    const term2 = terms?.term2;
    if (term1?.startDate && term1?.endDate && dateStr >= term1.startDate && dateStr <= term1.endDate) return 'term1';
    if (term2?.startDate && term2?.endDate && dateStr >= term2.startDate && dateStr <= term2.endDate) return 'term2';

    const monthIdx = new Date(dateStr).getMonth();
    if (monthIdx >= 10 || monthIdx <= 3) return 'term2';
    if (monthIdx >= 4 && monthIdx <= 9) return 'term1';
    return fallbackSemester === '2' ? 'term2' : 'term1';
};

const getSemesterForISODate = (dateStr: string, terms?: any, fallbackSemester = '1') => {
    return getTermKeyForISODate(dateStr, terms, fallbackSemester) === 'term2' ? '2' : '1';
};

const calculateAnnualCalendarYear = (acadYearStr: string, monthIdx: number, terms?: any): number => {
    const acadYearBE = parseInt(acadYearStr);
    const acadYearAD = !isNaN(acadYearBE) ? acadYearBE - 543 : new Date().getFullYear();

    const allTerms = [terms?.term1, terms?.term2].filter(t => t?.startDate && t?.endDate);
    for (const term of allTerms) {
        const start = new Date(term.startDate);
        const end = new Date(term.endDate);
        const startMonth = start.getMonth();
        const endMonth = end.getMonth();
        const inTerm = startMonth <= endMonth
            ? monthIdx >= startMonth && monthIdx <= endMonth
            : monthIdx >= startMonth || monthIdx <= endMonth;
        if (!inTerm) continue;
        return startMonth <= endMonth || monthIdx >= startMonth ? start.getFullYear() : end.getFullYear();
    }

    return monthIdx >= 0 && monthIdx <= 3 ? acadYearAD + 1 : acadYearAD;
};

const getMonthsInWrappedRange = (startMonth: number, endMonth: number) => {
    if (startMonth <= endMonth) {
        return Array.from({ length: endMonth - startMonth + 1 }, (_, index) => startMonth + index);
    }

    return [
        ...Array.from({ length: 12 - startMonth }, (_, index) => startMonth + index),
        ...Array.from({ length: endMonth + 1 }, (_, index) => index)
    ];
};

const getAllowedMonthsForSelection = (
    semesterValue: string,
    isPrimaryAnnualMode: boolean,
    terms?: { term1?: Term; term2?: Term }
) => {
    const monthSet = new Set<number>();

    if (isPrimaryAnnualMode) {
        (['term1', 'term2'] as const).forEach(termKey => {
            const termData = terms?.[termKey];
            if (!termData?.startDate || !termData?.endDate) return;

            const startMonth = new Date(termData.startDate).getMonth();
            const endMonth = new Date(termData.endDate).getMonth();
            getMonthsInWrappedRange(startMonth, endMonth).forEach(month => monthSet.add(month));
        });

        if (monthSet.size > 0) {
            return Array.from(monthSet).sort((a, b) => a - b);
        }

        return Array.from({ length: 12 }, (_, index) => index);
    }

    const termKey = semesterValue === '2' ? 'term2' : 'term1';
    const termData = terms?.[termKey];

    if (termData?.startDate && termData?.endDate) {
        const startMonth = new Date(termData.startDate).getMonth();
        const endMonth = new Date(termData.endDate).getMonth();
        return getMonthsInWrappedRange(startMonth, endMonth);
    }

    return semesterValue === '2'
        ? [10, 11, 0, 1, 2, 3]
        : [4, 5, 6, 7, 8, 9];
};

const HistoricalClassroomAttendancePage: React.FC = () => {
    const [searchParams] = useSearchParams();

    // Core Filters
    const [academicYear, setAcademicYear] = useState<string>(''); // e.g. "2567"
    const [semester, setSemester] = useState<string>(''); // e.g. "2"

    // Calendar Data
    const [calendarEvents, setCalendarEvents] = useState<Record<string, CalendarEvent>>({});
    const [terms, setTerms] = useState<{ term1: Term; term2: Term }>({
        term1: { startDate: null, endDate: null },
        term2: { startDate: null, endDate: null }
    });

    // Selection State
    const [selectedClass, setSelectedClass] = useState<string>('');
    const [selectedRoomNumber, setSelectedRoomNumber] = useState<string>('');
    const [selectedCourse, setSelectedCourse] = useState<string>('');
    const [selectedMonth, setSelectedMonth] = useState<number>(new Date().getMonth());

    // Effect to handle initial parameters from URL
    useEffect(() => {
        const yearParam = searchParams.get('year');
        const semesterParam = searchParams.get('semester');
        const classParam = searchParams.get('classId');
        const roomParam = searchParams.get('roomNumber') || searchParams.get('room');
        const courseParam = searchParams.get('courseId');

        if (yearParam) setAcademicYear(yearParam);
        if (semesterParam) setSemester(semesterParam);
        if (classParam) setSelectedClass(classParam);
        if (roomParam) setSelectedRoomNumber(roomParam);
        if (courseParam) setSelectedCourse(courseParam);
    }, [searchParams]);

    const [courses, setCourses] = useState<Course[]>([]);
    const [students, setStudents] = useState<Student[]>([]);
    const [attendanceData, setAttendanceData] = useState<Record<string, Record<string, string>>>({}); // studentId -> { dateStr -> status }
    const [initialAttendanceData, setInitialAttendanceData] = useState<Record<string, Record<string, string>>>({});
    const [studentLeaves, setStudentLeaves] = useState<Record<string, Record<string, LeaveRecord>>>({}); // studentId -> { dateStr -> LeaveRecord }

    const [loading, setLoading] = useState(false);
    // Dedicated flag for handleSave — kept separate from `loading` (used by the unrelated
    // course/date data-fetch effect) so switching course/date doesn't spuriously disable the
    // Save button / show "กำลังบันทึก..." while no save is actually in progress.
    const [isSaving, setIsSaving] = useState(false);
    const [dates, setDates] = useState<string[]>([]);
    const [dateMetadata, setDateMetadata] = useState<Record<string, DateMetadata>>({});
    const [courseSchedule, setCourseSchedule] = useState<Record<string, any>>({});
    const [isModified, setIsModified] = useState(false);

    // Bulk Selection State
    const [selectedCells, setSelectedCells] = useState<Set<string>>(new Set());
    const [academicSettings, setAcademicSettings] = useState<any>(null);
    const [behaviorConfig, setBehaviorConfig] = useState<any>(null);
    const [lastSelectedCell, setLastSelectedCell] = useState<string | null>(null);
    const [activeStatus, setActiveStatus] = useState<string | null>(null);
    const [isMonthPickerOpen, setIsMonthPickerOpen] = useState(false);
    const [annualRecordedDays, setAnnualRecordedDays] = useState<number>(0);

    const isPrimaryAnnualMode = useMemo(() => isPrimaryClassValue(selectedClass), [selectedClass]);

    const calculatedYearAD = useMemo(() => {
        return isPrimaryAnnualMode
            ? calculateAnnualCalendarYear(academicYear, selectedMonth, terms)
            : calculateCalendarYear(academicYear, semester, selectedMonth, terms);
    }, [academicYear, semester, selectedMonth, terms, isPrimaryAnnualMode]);

    const allowedMonths = useMemo(() => {
        return getAllowedMonthsForSelection(semester, isPrimaryAnnualMode, terms);
    }, [semester, isPrimaryAnnualMode, terms]);

    const previousAllowedMonth = useMemo(() => {
        if (allowedMonths.length === 0) return selectedMonth;
        const currentIndex = allowedMonths.indexOf(selectedMonth);
        if (currentIndex === -1) return allowedMonths[allowedMonths.length - 1];
        return allowedMonths[(currentIndex - 1 + allowedMonths.length) % allowedMonths.length];
    }, [allowedMonths, selectedMonth]);

    const nextAllowedMonth = useMemo(() => {
        if (allowedMonths.length === 0) return selectedMonth;
        const currentIndex = allowedMonths.indexOf(selectedMonth);
        if (currentIndex === -1) return allowedMonths[0];
        return allowedMonths[(currentIndex + 1) % allowedMonths.length];
    }, [allowedMonths, selectedMonth]);

    const dispatch = useDispatch();
    const currentUser = useSelector((state: RootState) => state.auth.user);
    const { teachers: teacherMap } = useSelector((state: RootState) => state.userMap);
    const { availableClassOptions } = useSelector((state: RootState) => state.schoolSettings);
    
    // Redux Calendar State
    const calendarState = useSelector((state: RootState) => state.calendar);
    const reduxAcademicYear = calendarState.academicYear || String(getCurrentThaiYear());
    const reduxTerms = calendarState.terms;
    const reduxRawData = calendarState.rawData;

    const schoolId = (currentUser as any)?.schoolId;

    // Period settings — needed to normalize raw schedule slot indices (which include
    // non-teaching slots like homeroom/lunch as array positions) into the same real
    // period-N numbers that saved attendance records use. Without this, a course
    // scheduled after a non-teaching slot shows up as two mismatched period columns.
    const [periodSettings, setPeriodSettings] = useState<PeriodSetting[]>([]);
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

    const getPeriodNumberFromSlotKey = (periodStr: string): number | null => {
        if (periodStr === 'homeroom' || periodStr === 'lunch') return null;
        if (periodStr.startsWith('period-')) {
            return Number(periodStr.replace('period-', '')) || null;
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

        const index = Number(periodStr);
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

        const parsed = Number(periodStr);
        if (Number.isFinite(parsed)) {
            return parsed === 0 ? 1 : parsed;
        }
        return null;
    };

    const classOptions = useMemo(() => {
        return availableClassOptions.map(([val, label]) => ({ value: val, label }));
    }, [availableClassOptions]);

    const roomOptions = useMemo(() => {
        return Array.from({ length: 24 }, (_, i) => ({ value: (i + 1).toString(), label: `ห้อง ${(i + 1)}` }));
    }, []);

    const currentTeacher = useMemo(() => {
        return Object.values(teacherMap || {}).find((t: any) => t.uid === (currentUser as any)?.uid || t.id === (currentUser as any)?.uid);
    }, [teacherMap, currentUser]);

    // Academic management roles (school admin/director/dept head/academic admin) can edit
    // history for any course; a plain teacher may only edit courses they're assigned to.
    const isAcademicManager = useMemo(() => {
        const rawRoles = Array.isArray((currentUser as any)?.role) ? (currentUser as any).role : [(currentUser as any)?.role];
        const userRoles = rawRoles.map((r: any) => String(r || '').toLowerCase());
        return ACADEMIC_MANAGEMENT.some(r => userRoles.includes(r));
    }, [currentUser]);

    useEffect(() => {
        if (allowedMonths.length === 0) return;
        if (!allowedMonths.includes(selectedMonth)) {
            setSelectedMonth(allowedMonths[0]);
        }
    }, [allowedMonths, selectedMonth]);

    useEffect(() => {
        const fetchAnnualAttendanceCount = async () => {
            if (!schoolId || !selectedClass || !selectedCourse) {
                setAnnualRecordedDays(0);
                return;
            }
            try {
                const currentCourse = courses.find(c => c.id === selectedCourse || c.code === selectedCourse);

                // Identify target codes (ID, Code, and Title for max robustness)
                const targetCodes = new Set<string>();
                if (selectedCourse) targetCodes.add(selectedCourse);
                if (currentCourse?.id) targetCodes.add(currentCourse.id);
                if (currentCourse?.code) targetCodes.add(currentCourse.code);
                if (currentCourse?.code) targetCodes.add(currentCourse.code.replace(/\s/g, ''));

                const attendanceRef = collectionGroup(db, 'ClassroomAttendance');
                const constraints = [
                    where('schoolId', '==', schoolId),
                    // Remove strict academicYear filter for robustness
                    where('subjectCode', 'in', Array.from(targetCodes).filter(Boolean) as string[])
                ];

                const q = query(attendanceRef, ...constraints);
                const snap = await getDocs(q);
                const uniqueDates = new Set<string>();

                snap.forEach(doc => {
                    const data = doc.data();
                    const matchesClass = matchesClassValue(data.classId, selectedClass) ||
                        matchesClassValue(data.className, selectedClass);

                    const matchesRoom = matchesRoomGroup(data, selectedRoomNumber);

                    if (matchesClass && matchesRoom) {
                        const dateObj = data.date?.toDate();
                        if (dateObj) {
                            const y = dateObj.getFullYear();
                            const m = String(dateObj.getMonth() + 1).padStart(2, '0');
                            const d = String(dateObj.getDate()).padStart(2, '0');
                            const isoStr = `${y}-${m}-${d}`;

                            const classLabel = CLASSES[selectedClass] || selectedClass;
                            const isPrimary = classLabel.includes('ป.') || selectedClass.toLowerCase().startsWith('p');
                            const termKeys: ('term1' | 'term2')[] = isPrimary ? ['term1', 'term2'] : [semester === '1' ? 'term1' : 'term2'];
                            const hasTermBounds = termKeys.some(key => terms[key]?.startDate && terms[key]?.endDate);
                            const isWithinTargetTerms = !hasTermBounds || termKeys.some(key => {
                                const termData = terms[key];
                                return termData?.startDate && termData?.endDate && isoStr >= termData.startDate && isoStr <= termData.endDate;
                            });

                            if (isWithinTargetTerms) uniqueDates.add(isoStr);
                        }
                    }
                });

                // Calculate stats for warning
                const totalDays = uniqueDates.size;
                const classLabel = CLASSES[selectedClass] || selectedClass;
                const isPrimary = classLabel.includes('ป.') || selectedClass.toLowerCase().startsWith('p');
                const courseAny = currentCourse as any;
                const credits = courseAny?.credits ? Number(courseAny.credits) : 1;

                setAnnualRecordedDays(totalDays);
            } catch (error) {
                console.error("Error fetching annual attendance count:", error);
            }
        };
        fetchAnnualAttendanceCount();
    }, [schoolId, selectedClass, selectedRoomNumber, selectedCourse, academicYear, semester, terms, courses, isModified]);
    // Refresh when isModified becomes false (usually after save) ou trigger it manually

    const months = [
        'มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน',
        'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม'
    ];

    useEffect(() => {
        if (schoolId) {
            dispatch(fetchTeachersMap(schoolId) as any);
            dispatch(fetchCalendar(schoolId) as any);
            fetchSchoolSettings();
        }
    }, [schoolId, dispatch]);

    // Sync from Redux Calendar
    useEffect(() => {
        if (calendarState.status === 'succeeded') {
            if (!academicYear) setAcademicYear(reduxAcademicYear);
            
            if (reduxRawData.events) setCalendarEvents(reduxRawData.events);
            
            // Map Redux terms to local format
            if (reduxTerms.length > 0) {
                const term1 = reduxTerms.find(t => t.id === 'term1' || t.name.includes('1'));
                const term2 = reduxTerms.find(t => t.id === 'term2' || t.name.includes('2'));
                
                setTerms({
                    term1: { startDate: term1?.startDate || null, endDate: term1?.endDate || null },
                    term2: { startDate: term2?.startDate || null, endDate: term2?.endDate || null }
                });

                // Auto-set semester if not provided
                const semParam = searchParams.get('semester');
                if (!semParam && !semester) {
                    const today = new Date().toISOString().split('T')[0];
                    if (term2?.startDate && today >= term2.startDate) {
                        setSemester('2');
                    } else {
                        setSemester('1');
                    }
                }
            }
        }
    }, [calendarState.status, reduxAcademicYear, reduxTerms, reduxRawData, searchParams]);

    const monthPickerRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (monthPickerRef.current && !monthPickerRef.current.contains(event.target as Node)) {
                setIsMonthPickerOpen(false);
            }
        };
        if (isMonthPickerOpen) {
            document.addEventListener('mousedown', handleClickOutside);
        }
        return () => {
            document.removeEventListener('mousedown', handleClickOutside);
        };
    }, [isMonthPickerOpen]);

    useEffect(() => {
        // Set initial values from URL if parameters are available
        const urlClass = searchParams.get('classId');
        const urlCourse = searchParams.get('courseId');
        const urlRoom = searchParams.get('room');
        const urlSem = searchParams.get('semester');

        if (urlClass) {
            setSelectedClass(urlClass);
        }
        if (urlRoom) {
            setSelectedRoomNumber(urlRoom);
        }

        if (urlSem) {
            setSemester(urlSem);
        }

        if (urlCourse) {
            // Check if it's already a code or needs resolution ID -> code
            const found = courses.find(c => c.id === urlCourse);
            setSelectedCourse(found?.code || urlCourse);
        }
    }, [searchParams, courses]);

    const fetchSchoolSettings = async () => {
        if (!schoolId) return;
        try {
            // Fetch root settings for feature toggles (academicSettings)
            const schoolSnap = await getDoc(doc(db, 'school-settings', schoolId));
            if (schoolSnap.exists()) {
                const data = schoolSnap.data();
                if (data.academicSettings) {
                    setAcademicSettings(data.academicSettings);
                }
                if (data.behaviorScoreConfig) {
                    setBehaviorConfig(data.behaviorScoreConfig);
                }
            }
        } catch (error) {
            console.error("Error fetching school settings:", error);
        }
    };

    // Fetch Courses
    useEffect(() => {
        const fetchCourses = async () => {
            if (!schoolId) return;
            try {
                const q = query(collection(db, 'school-settings', schoolId, 'courses'));
                const snap = await getDocs(q);
                const list = snap.docs.map(doc => ({ 
                    id: doc.id, 
                    ...doc.data(),
                    // Ensure teacherAssignments is present
                    teacherAssignments: doc.data().teacherAssignments || []
                } as Course));
                setCourses(list);
            } catch (error) {
                console.error("Error fetching courses:", error);
            }
        };
        fetchCourses();
    }, [schoolId]);



    // Fetch Course Schedule with robust matching
    useEffect(() => {
        const fetchSchedule = async () => {
            if (!schoolId || !selectedCourse) {
                setCourseSchedule({});
                return;
            }
            try {
                const cObj = courses.find(c => c.id === selectedCourse || c.code === selectedCourse);
                const targetId = cObj?.id || selectedCourse;
                const targetCode = (cObj?.code || selectedCourse || "").replace(/\s/g, '').toLowerCase();

                const schedulesRef = collection(db, 'school-settings', schoolId, 'schedules');
                const q = query(schedulesRef);
                const snap = await getDocs(q);

                const scheduleMap: Record<string, number[]> = {
                    sun: [], mon: [], tue: [], wed: [], thu: [], fri: [], sat: []
                };
                const addPeriodToScheduleMap = (key: string, period: number) => {
                    if (!scheduleMap[key]) scheduleMap[key] = [];
                    if (!scheduleMap[key].includes(period)) scheduleMap[key].push(period);
                };

                const matchesYearSemester = (data: any) => {
                    const dataYear = String(data.academicYear || "");
                    const dataSemester = String(data.semester || "");
                    const yearMatches = !academicYear || !dataYear || dataYear === academicYear;
                    const semesterMatches = isPrimaryAnnualMode || !semester || !dataSemester || dataSemester === semester || dataSemester.startsWith(`${semester}/`) || semester.startsWith(`${dataSemester}/`);
                    return yearMatches && semesterMatches;
                };

                snap.forEach(doc => {
                    const data = doc.data();
                    if (!matchesYearSemester(data)) return;
                    const dataSemester = String(data.semester || "");

                    const docClassId = data.classId;

                    // Robust class matching
                    const matchesClass = matchesClassValue(docClassId, selectedClass) ||
                        matchesClassValue(data.className, selectedClass);

                    if (!matchesClass) return;

                    const sch = data.schedule || {};
                    Object.entries(sch).forEach(([slotKey, val]: [string, any]) => {
                        if (!val) return;
                        const coursesInSlot = Array.isArray(val) ? val : [val];
                        const isTarget = coursesInSlot.some(c => {
                            if (!c) return false;
                            const sid = c.id || c.courseId;
                            const scode = (c.code || c.subjectCode || "").replace(/\s/g, '').toLowerCase();
                            const matchesId = sid === targetId || (scode && targetCode && scode === targetCode);
                            if (!matchesId) return false;

                            if (!selectedRoomNumber) return true;

                            // Robust Room/Group matching matching StudentSchedulePage.tsx logic
                            const latestCourse = courses.find(course =>
                                course.id === sid ||
                                (course.code && scode && course.code.replace(/\s/g, '').toLowerCase() === scode)
                            );
                            const hasAssignments = latestCourse?.teacherAssignments && latestCourse.teacherAssignments.length > 0;

                            const rawCourseRooms = c.room || c.roomIds || c.roomNumber || [];
                            const courseRoom = (Array.isArray(rawCourseRooms) ? rawCourseRooms : [rawCourseRooms])
                                .map((r: any) => normalizeRoom(r))
                                .filter(Boolean);
                            const selectedRoom = normalizeRoom(selectedRoomNumber);
                            const docRoom = normalizeRoom(data.room || data.roomNumber || '');
                            // groupNumber is a sequential group INDEX (1, 2, 3...), not a room label —
                            // it must never be compared directly against selectedRoom (a room label that
                            // often happens to share the same small-integer range, e.g. "2" == "2" by pure
                            // coincidence). It's only used below to look up *this specific slot's* group
                            // assignment, whose own `room` field is then compared instead.
                            const slotGroupNumber = c.groupNumber ?? c.group;
                            const hasSlotGroup = slotGroupNumber !== undefined && slotGroupNumber !== null && slotGroupNumber !== '';

                            // Class-wide schedule entries often only live inside a teacher document,
                            // so they do not have a top-level room to match against.
                            const isCommon = courseRoom.includes('all') || (!hasAssignments && courseRoom.length === 0 && !hasSlotGroup && !docRoom);

                            if (isCommon) return true;
                            if (docRoom === selectedRoom || docRoom === 'all') return true;
                            if (courseRoom.some((r: string) => r === selectedRoom)) return true;

                            if (hasAssignments) {
                                if (hasSlotGroup) {
                                    // Correlate THIS slot instance's own group to its matching
                                    // teacherAssignments entry, then check that group's room — never
                                    // treat "the course has some group assigned to selectedRoom" as a
                                    // match for every group's slot (that made the room filter a no-op
                                    // for combined courses, pulling every group's periods together).
                                    // Shared with GradeBookPage.tsx so this rule can't silently drift.
                                    return matchesAssignmentGroupRoom(latestCourse!.teacherAssignments, slotGroupNumber, selectedRoomNumber);
                                }
                                // No group info on this slot at all — can't disambiguate further.
                                // (Deliberately NOT falling back to a.groupNumber here — comparing a
                                // group index against a room label is exactly the conflation bug this
                                // logic was rewritten to avoid.)
                                return latestCourse!.teacherAssignments!.some((a: any) =>
                                    normalizeRoom(a.room || a.roomNumber || (Array.isArray(a.roomIds) ? a.roomIds[0] : a.roomIds) || '') === selectedRoom &&
                                    (String(a.teacherId || '') === String(data.teacherId) || !data.teacherId)
                                );
                            }

                            return false;
                        });

                        if (isTarget) {
                            const [day, periodStr] = slotKey.split('-');
                            // Normalize the raw schedule slot index (which counts non-teaching slots like
                            // homeroom/lunch as array positions) into the real period-N number that saved
                            // attendance records use — otherwise this shows up as an extra, mismatched
                            // period column next to the real one.
                            const period = getPeriodNumberFromSlotKey(periodStr);
                            if (scheduleMap[day] !== undefined && period !== null) {
                                addPeriodToScheduleMap(day, period);
                                if (isPrimaryAnnualMode) {
                                    addPeriodToScheduleMap(`${dataSemester || 'all'}:${day}`, period);
                                }
                            }
                        }
                    });
                });

                setCourseSchedule(scheduleMap);
            } catch (error) {
                console.error("Error fetching course schedule:", error);
            }
        };
        fetchSchedule();
    }, [schoolId, selectedCourse, selectedClass, selectedRoomNumber, academicYear, semester, courses, isPrimaryAnnualMode, periodSettings]);

    // Generate valid dates
    const generateDates = React.useCallback((acadYearStr: string, monthIdx: number, hasDataDates?: Set<string>) => {
        const year = isPrimaryAnnualMode
            ? calculateAnnualCalendarYear(acadYearStr, monthIdx, terms)
            : calculateCalendarYear(acadYearStr, semester, monthIdx, terms);
        const dates: string[] = [];
        const metadata: Record<string, DateMetadata> = {};

        const daysInMonth = new Date(year, monthIdx + 1, 0).getDate();
        const todayStrLookup = new Date().toISOString().split('T')[0];

        // ช่วงวันที่ใน /academic/settings คือ "ช่วงเวลาปัจจุบัน (วันนี้) ที่อนุญาตให้เข้าไปแก้ไขข้อมูลย้อนหลังได้"
        // ไม่ใช่ช่วงของวันที่เช็คชื่อ (คอลัมน์ในตาราง) ที่แก้ไขได้ — เทียบกับ "วันนี้" ครั้งเดียว ไม่ใช่เทียบกับ
        // วันที่ของแต่ละคาบที่แสดงในตาราง
        const historicalToggle = academicSettings?.allowHistoricalAttendance;
        const isHistoricalWindowOpen = historicalToggle === undefined
            ? true // โรงเรียนยังไม่เคยตั้งค่านี้เลย ถือว่าไม่จำกัด (พฤติกรรมเดิมก่อนมีฟีเจอร์นี้)
            : historicalToggle === false
                ? false // ปิดสวิตช์ทั้งหมด
                : (
                    (!academicSettings.historicalAttendanceStartDate || todayStrLookup >= academicSettings.historicalAttendanceStartDate) &&
                    (!academicSettings.historicalAttendanceEndDate || todayStrLookup <= academicSettings.historicalAttendanceEndDate)
                );

        // Determine Term Info
        const currentTermKey = semester === '1' ? 'term1' : 'term2';
        const termData = terms[currentTermKey];
        const hasTermData = isPrimaryAnnualMode
            ? Boolean((terms.term1?.startDate && terms.term1?.endDate) || (terms.term2?.startDate && terms.term2?.endDate))
            : Boolean(termData && termData.startDate && termData.endDate);

        for (let day = 1; day <= daysInMonth; day++) {
            const date = new Date(year, monthIdx, day);
            const d = String(day).padStart(2, '0');
            const m = String(monthIdx + 1).padStart(2, '0');
            const y = year;

            const dateStrLookup = `${y}-${m}-${d}`;
            const dateStrDisplay = `${d}-${m}-${y}`;

            const event = calendarEvents[dateStrLookup];
            const dayOfWeek = date.getDay();
            const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;

            let isCheckable = true;
            let reason: DateReason | undefined = undefined;
            const description = event?.description;

            // 1. Determine Day Type & Checkability
            if (event?.type === 'schoolDay') {
                isCheckable = true;
                reason = 'schoolDay';
            } else if (event?.type === 'holiday' || event?.type === 'specialHoliday') {
                const desc = event.description || 'วันหยุด';
                if (isNonOfficialHoliday(desc)) {
                    isCheckable = true;
                } else {
                    isCheckable = false;
                    reason = event.type === 'holiday' ? 'holiday' : 'special_holiday';
                }
            } else if (isWeekend) {
                isCheckable = false;
                reason = 'weekend';
            } else {
                isCheckable = true;
            }

            // 2. Determine Relevance & Periods
            let dayKey = DAY_KEY_MAP[dayOfWeek];
            if (event?.type === 'schoolDay' && event?.scheduleDay) {
                dayKey = event.scheduleDay;
            }
            
            const dateSemester = getSemesterForISODate(dateStrLookup, terms, semester);
            const scheduledPeriods: number[] = isPrimaryAnnualMode
                ? (courseSchedule[`${dateSemester}:${dayKey}`] || courseSchedule[`all:${dayKey}`] || [])
                : (courseSchedule[dayKey] || []);
            
            // Collect all periods for this day (Scheduled + DB)
            const allPeriodsForToday = new Set<number>(scheduledPeriods);
            if (event?.type === 'schoolDay' && allPeriodsForToday.size === 0) {
                allPeriodsForToday.add(0);
            }
            
            // Also check hasDataDates for extra periods
            if (hasDataDates) {
                hasDataDates.forEach(slot => {
                    if (slot.startsWith(dateStrDisplay + '_P')) {
                        const pNum = parseInt(slot.split('_P')[1]);
                        if (!isNaN(pNum)) allPeriodsForToday.add(pNum);
                    } else if (slot === dateStrDisplay) {
                        allPeriodsForToday.add(0);
                    }
                });
            }

            if (allPeriodsForToday.size > 0) {
                const sortedPeriods = Array.from(allPeriodsForToday).sort((a, b) => a - b);
                sortedPeriods.forEach(periodNum => {
                    const slotKey = periodNum === 0 && !hasDataDates?.has(`${dateStrDisplay}_P0`) && !hasDataDates?.has(dateStrDisplay)
                                    ? dateStrDisplay 
                                    : `${dateStrDisplay}_P${periodNum}`;
                    
                    let isCheckableLocal = isCheckable;
                    let reasonLocal: DateReason | undefined = reason;
                    const isScheduled = scheduledPeriods.includes(periodNum);
                    const hasData = hasDataDates?.has(slotKey) || (periodNum === 0 && hasDataDates?.has(dateStrDisplay));

                    // If there is existing data, it MUST be checkable/visible regardless of calendar
                    if (hasData) {
                        isCheckableLocal = true;
                    }

                    // Apply Term Boundaries to the slot
                    if (hasTermData) {
                        const currentStr = dateStrLookup;
                        const activeTermData = isPrimaryAnnualMode
                            ? terms[getTermKeyForISODate(currentStr, terms, semester)]
                            : termData;
                        if (activeTermData?.startDate && activeTermData?.endDate && (currentStr < activeTermData.startDate || currentStr > activeTermData.endDate)) {
                            // Explicit makeup school days are allowed even when they extend the 100-day range.
                            if (!hasData && event?.type !== 'schoolDay') {
                                isCheckableLocal = false;
                                if (!reasonLocal) reasonLocal = 'term_break';
                            }
                        }
                    }

                    // Historical Settings — ล็อกวันที่ผ่านมาแล้วทั้งหมด (ไม่แตะวันนี้/อนาคต) เมื่อ "หน้าต่างเวลา
                    // ที่อนุญาตให้แก้ย้อนหลัง" ปิดอยู่ ไม่ว่าจะเป็นเพราะปิดสวิตช์ทั้งหมด หรือเปิดสวิตช์แต่ตอนนี้
                    // อยู่นอกช่วงวันที่กำหนดไว้ก็ตาม
                    if (isCheckableLocal && dateStrLookup < todayStrLookup && !isHistoricalWindowOpen) {
                        isCheckableLocal = false;
                        reasonLocal = 'historical_locked';
                    }

                    dates.push(slotKey);
                    metadata[slotKey] = {
                        isCheckable: isCheckableLocal,
                        isRelevant: isScheduled,
                        reason: reasonLocal,
                        description,
                        periodCount: allPeriodsForToday.size,
                        periodNumber: periodNum,
                        displayDate: dateStrDisplay
                    };
                });
            } else {
                // If no periods scheduled, still show the day as not relevant/locked
                dates.push(dateStrDisplay);
                metadata[dateStrDisplay] = {
                    isCheckable: false,
                    isRelevant: false,
                    reason: reason || 'not_scheduled',
                    description,
                    periodCount: 0,
                    displayDate: dateStrDisplay
                };
            }
        }
        return { dates, metadata };
    }, [semester, terms, calendarEvents, courseSchedule, academicSettings, isPrimaryAnnualMode]);

    // Filter Courses based on Selected Class
    const filteredCourses = useMemo(() => {
        if (!selectedClass) return [];

        return courses.filter(c => {
            // Handle both string and array formats for classId
            const matchesClass = matchesClassValue(c.classId, selectedClass);

            if (!matchesClass) return false;

            // Restrict to courses the current teacher actually teaches — academic
            // management roles (admin/director/dept head/academic admin) can still see
            // and correct history for every course.
            if (!isAcademicManager && !isCourseOwnedByTeacher(c, currentTeacher?.id)) return false;

            // If a room is selected, we want to filter courses that belong to that group
            // but also show general courses that might not have specific group assignments.
            if (selectedRoomNumber) {
                const assignments = c.teacherAssignments || [];
                if (assignments.length > 0) {
                    const selectedRoom = normalizeRoom(selectedRoomNumber);
                    return assignments.some((a: any) => {
                        const candidates = [
                            a.groupNumber,
                            a.room,
                            a.roomNumber,
                            a.group,
                            ...(Array.isArray(a.roomIds) ? a.roomIds : [])
                        ].map(normalizeRoom).filter(Boolean);
                        return candidates.includes(selectedRoom) || candidates.includes('all');
                    });
                }
            }

            return true;
        });
    }, [courses, selectedClass, selectedRoomNumber, isAcademicManager, currentTeacher]);

    // Auto-select course if only one option available
    useEffect(() => {
        if (selectedCourse && filteredCourses.length > 0 && !filteredCourses.some(c => c.code === selectedCourse || c.id === selectedCourse)) {
            setSelectedCourse('');
            return;
        }

        if (filteredCourses.length === 1) {
            setSelectedCourse(filteredCourses[0].code);
        }
    }, [filteredCourses, selectedCourse]);

    // Fetch Data
    const handleFetchData = React.useCallback(async () => {
        if (!schoolId || !selectedClass || !selectedCourse || !academicYear || !semester) {
            return;
        }

        setLoading(true);
        setIsModified(false);

        try {
            // 1. Calculate Year & Dates
            const yearAD = isPrimaryAnnualMode
                ? calculateAnnualCalendarYear(academicYear, selectedMonth, terms)
                : calculateCalendarYear(academicYear, semester, selectedMonth, terms);
            const { dates: generatedDates, metadata } = generateDates(academicYear, selectedMonth);
            setDates(generatedDates);
            setDateMetadata(metadata);

            // 2. Fetch Students using robust logic from ClassroomAttendancePage
            const courseObj = courses.find(c => c.id === selectedCourse || c.code === selectedCourse);
            const subjectCode = courseObj?.code || selectedCourse;
            const targetCodes = new Set<string>();
            if (subjectCode) {
                targetCodes.add(subjectCode);
                targetCodes.add(subjectCode.replace(/\s/g, ''));
            }
            if (courseObj?.id) targetCodes.add(courseObj.id);
            if (courseObj?.code) {
                targetCodes.add(courseObj.code);
                targetCodes.add(courseObj.code.replace(/\s/g, ''));
            }
            const finalSubjectCodes = Array.from(targetCodes).filter(Boolean) as string[];
            // Class identifiers for lookup
            const currentClassKey = Object.keys(CLASSES).find(key => CLASSES[key] === selectedClass) || selectedClass;
            const currentClassTitle = (CLASSES[selectedClass] || selectedClass);
            const currentClassVariants = getClassVariants(selectedClass);

            console.log("[HistoricalAttendance] Fetching codes:", finalSubjectCodes, "Class:", currentClassKey, "Room:", selectedRoomNumber);

            let studentList: Student[] = [];

            // Attempt to fetch from Enrollments first
            const courseId = courseObj?.id || selectedCourse;
            
            // 1. Primary Query: Try fetching by courseId (most accurate for CourseEnrollmentPage)
            let enrollConstraints = [
                where('courseId', '==', courseId),
                where('academicYear', '==', academicYear),
                ...(isPrimaryAnnualMode ? [] : [where('semester', '==', semester)])
            ];
            
            let enrollQ = query(collection(db, 'school-settings', schoolId, 'enrollments'), ...enrollConstraints);
            let enrollSnap = await getDocs(enrollQ);

            // Annual/legacy enrollment records may not store semester, or may store "annual"/"1-2".
            if (enrollSnap.empty) {
                enrollQ = query(
                    collection(db, 'school-settings', schoolId, 'enrollments'),
                    where('courseId', '==', courseId),
                    where('academicYear', '==', academicYear)
                );
                enrollSnap = await getDocs(enrollQ);
            }

            // 2. Fallback Query: Try fetching by courseCode if ID search yielded nothing
            if (enrollSnap.empty && subjectCode) {
                const codeConstraints = [
                    where('courseCode', '==', subjectCode),
                    where('academicYear', '==', academicYear),
                    ...(isPrimaryAnnualMode ? [] : [where('semester', '==', semester)])
                ];
                enrollQ = query(collection(db, 'school-settings', schoolId, 'enrollments'), ...codeConstraints);
                enrollSnap = await getDocs(enrollQ);
            }

            if (enrollSnap.empty && subjectCode) {
                enrollQ = query(
                    collection(db, 'school-settings', schoolId, 'enrollments'),
                    where('courseCode', '==', subjectCode),
                    where('academicYear', '==', academicYear)
                );
                enrollSnap = await getDocs(enrollQ);
            }

            let filteredEnrollDocs = enrollSnap.docs;
            
            // In-memory filter for room/group and class
            if (selectedRoomNumber) {
                filteredEnrollDocs = filteredEnrollDocs.filter((d: any) => matchesRoomGroup(d.data(), selectedRoomNumber));
            }
            if (selectedClass) {
                filteredEnrollDocs = filteredEnrollDocs.filter(doc => {
                    const data = doc.data();
                    if (!data.classLevel) return true; 
                    return matchesClassValue(data.classLevel, selectedClass);
                });
            }

            if (filteredEnrollDocs.length > 0) {
                const enrolledStudentIds = Array.from(new Set(filteredEnrollDocs.map(d => d.data().studentId).filter(Boolean)));
                
                const studentsRef = collection(db, 'school-settings', schoolId, 'students');
                const batchSize = 30;
                const studentDetails: Student[] = [];

                for (let i = 0; i < enrolledStudentIds.length; i += batchSize) {
                    const batchIds = enrolledStudentIds.slice(i, i + batchSize);
                    const qBatch = query(studentsRef, where('__name__', 'in', batchIds));
                    const batchSnap = await getDocs(qBatch);
                    batchSnap.forEach(snap => {
                        const data = snap.data();
                        studentDetails.push({
                            id: snap.id,
                            firstName: data.firstName || '',
                            lastName: data.lastName || '',
                            number: data.studentNumber || data.number || '',
                            studentNumber: data.studentId || '',
                            gender: data.gender || '',
                            prefix: data.title || data.prefix || '',
                            profileImageUrl: data.profileImageUrl || '',
                            room: data.room || data.roomNumber || '',
                            groupName: data.groupName || '',
                            classLevel: data.classLevel || ''
                        } as Student);
                    });
                }
                studentList = studentDetails;
            } else {
                // Fallback to Class Level
                const classLevelValues = currentClassVariants.length > 0 ? currentClassVariants : [currentClassKey, currentClassTitle].filter(Boolean);
                const studentConstraints = [
                    where('classLevel', 'in', classLevelValues.slice(0, 30))
                ];

                const studentQ = query(
                    collection(db, 'school-settings', schoolId, 'students'),
                    ...studentConstraints
                );
                const sSnap = await getDocs(studentQ);

                studentList = sSnap.docs
                    .map(d => {
                        const data = d.data();
                        return {
                            id: d.id,
                            firstName: data.firstName || '',
                            lastName: data.lastName || '',
                            number: data.studentNumber || data.number || '', // DB studentNumber is Class No
                            studentNumber: data.studentId || '', // DB studentId is Student ID
                            gender: data.gender || '',
                            prefix: data.title || data.prefix || '',
                            profileImageUrl: data.profileImageUrl || '',
                            roomNumber: data.room || data.roomNumber || '',
                            room: data.room || data.roomNumber || '',
                            groupName: data.groupName || '',
                            classLevel: data.classLevel || ''
                        } as Student & { roomNumber: string };
                    })
                    .filter(s => matchesClassValue((s as any).classLevel || currentClassKey, selectedClass))
                    .filter(s => !selectedRoomNumber || normalizeRoom((s as any).room || (s as any).roomNumber) === normalizeRoom(selectedRoomNumber));
            }

            studentList.sort((a, b) => {
                const numA = a.number ? parseInt(a.number, 10) : 9999;
                const numB = b.number ? parseInt(b.number, 10) : 9999;
                if (numA !== numB) return numA - numB;

                const roomA = parseInt(a.room || "0", 10) || 0;
                const roomB = parseInt(b.room || "0", 10) || 0;
                if (roomA !== roomB) return roomA - roomB;

                return (a.firstName || "").localeCompare(b.firstName || "", 'th');
            });
            setStudents(studentList);

            // 3. Fetch Leaves (Activity/Sick/etc.)
            // We need to check if any student has approved leave on generatedDates
            const leavesMap: Record<string, Record<string, LeaveRecord>> = {}; // studentId -> dateStr -> info

            // Optimization: Fetch leaves for all students in parallel or batch if possible
            // Since Firestore doesn't support "OR" across many students well, we fetch per student
            // but we can limit to approved status.
            await Promise.all(studentList.map(async (st) => {
                const leaveRef = collection(db, 'school-settings', schoolId, 'students', st.id, 'leave_summary');
                const leaveQ = query(leaveRef, where('status', '==', 'approved'));
                const leaveSnap = await getDocs(leaveQ);

                leaveSnap.forEach(lDoc => {
                    const lData = lDoc.data();
                    const startDate = lData.startDate?.toDate ? lData.startDate.toDate() : new Date(lData.startDate);
                    const endDate = lData.endDate?.toDate ? lData.endDate.toDate() : new Date(lData.endDate);

                    // Normalize to YYYY-MM-DD
                    const startStr = startDate.toISOString().split('T')[0];
                    const endStr = endDate.toISOString().split('T')[0];

                    // Check intersection with generatedDates (which are DD-MM-YYYY)
                    // We need to convert generatedDates to YYYY-MM-DD for comparison
                    generatedDates.forEach(slotKey => {
                        const datePart = getDateDisplayPart(slotKey);
                        const dISO = displayDateToISO(datePart);

                        if (dISO >= startStr && dISO <= endStr) {
                            if (!leavesMap[st.id]) leavesMap[st.id] = {};
                            leavesMap[st.id][datePart] = {
                                type: lData.leaveType,
                                description: lData.reason || lData.leaveType
                            };
                        }
                    });
                });
            }));
            setStudentLeaves(leavesMap);

            // 4. Fetch Attendance using robust matching (consistent with fetchAnnualAttendanceCount)
            const attRef = collectionGroup(db, 'ClassroomAttendance');
            const attendanceConstraints = [
                where('schoolId', '==', schoolId),
                where('subjectCode', 'in', finalSubjectCodes),
                where('academicYear', '==', academicYear),
                ...(isPrimaryAnnualMode ? [] : [where('semester', '==', semester)])
            ];
            const q = query(
                attRef,
                ...attendanceConstraints
            );

            let attSnap = await getDocs(q);
            if (attSnap.empty) {
                const fallbackQ = query(
                    attRef,
                    where('schoolId', '==', schoolId),
                    where('subjectCode', 'in', finalSubjectCodes)
                );
                attSnap = await getDocs(fallbackQ);
            }
            const rawAttendanceDocs: any[] = [];
            const foundDataSlots = new Set<string>();

            console.log(`[HistoricalAttendance] Querying ${finalSubjectCodes.length} codes for Year: ${academicYear}, Sem: ${semester}. Found ${attSnap.size} total docs.`);

            attSnap.docs.forEach(doc => {
                const d = doc.data();
                const docDate = d.date?.toDate ? d.date.toDate() : null;
                
                // Robust class matching (expanded)
                const matchesClass = matchesClassValue(d.classId, selectedClass) ||
                    matchesClassValue(d.className, selectedClass);

                const matchesRoom = matchesRoomGroup(d, selectedRoomNumber);

                if (!matchesClass || !matchesRoom) {
                    // console.log("[HistoricalAttendance] Skip doc due to mismatch:", d.studentId, d.classId, d.className, "Room:", d.room);
                    return;
                }

                let dateStrDisplay = '';
                if (docDate) {
                    if (docDate.getMonth() === selectedMonth && docDate.getFullYear() === yearAD) {
                        const day = String(docDate.getDate()).padStart(2, '0');
                        const month = String(docDate.getMonth() + 1).padStart(2, '0');
                        const year = docDate.getFullYear();
                        dateStrDisplay = `${day}-${month}-${year}`;
                        console.log("[HistoricalAttendance] Match found:", d.studentId, dateStrDisplay, "P" + (d.period || 0));
                    }
                }

                if (dateStrDisplay) {
                    const periodNum = d.period !== undefined ? d.period : 0;
                    const slotKey = `${dateStrDisplay}_P${periodNum}`;
                    const isLegacyRoomRecord = Boolean(
                        selectedRoomNumber &&
                        typeof d.classId === 'string' &&
                        d.classId.endsWith(`_${selectedRoomNumber}`)
                    );
                    foundDataSlots.add(slotKey);
                    rawAttendanceDocs.push({ ...d, slotKey, isLegacyRoomRecord });
                }
            });

            // 5. Generate dates based on Schedule + Found Data Slots
            const { dates: finalDates, metadata: finalMetadata } = generateDates(academicYear, selectedMonth, foundDataSlots);
            setDates(finalDates);
            setDateMetadata(finalMetadata);

            // 6. Map Attendance Data to Slots
            const dataMap: Record<string, Record<string, string>> = {};
            const mappedRecordPreference: Record<string, boolean> = {};
            rawAttendanceDocs.forEach(d => {
                const mapKey = `${d.studentId}:${d.slotKey}`;
                if (mappedRecordPreference[mapKey] === false && d.isLegacyRoomRecord) {
                    return;
                }

                // If the slot is in our final list, map it
                if (finalDates.includes(d.slotKey)) {
                    if (!dataMap[d.studentId]) dataMap[d.studentId] = {};
                    dataMap[d.studentId][d.slotKey] = d.status;
                    mappedRecordPreference[mapKey] = d.isLegacyRoomRecord;
                } else {
                    // Fallback to day-only if slotKey not found (legacy)
                    const dayOnly = d.slotKey.split('_')[0];
                    if (finalDates.includes(dayOnly)) {
                        if (!dataMap[d.studentId]) dataMap[d.studentId] = {};
                        dataMap[d.studentId][dayOnly] = d.status;
                        mappedRecordPreference[`${d.studentId}:${dayOnly}`] = d.isLegacyRoomRecord;
                    }
                }
            });
            setDates(finalDates);
            setDateMetadata(finalMetadata);

            // 6. Merge Leaves into Attendance Data (if no existing attendance)
            // If there is a leave record, and NO attendance record, set it.
            // If there IS attendance record, we keep it (user manual override).
            // BUT, for the UI, we might want to show the 'default' as leave if undefined.

            // Set initial data to raw DB state so changes (virtual leaves) are detected
            setInitialAttendanceData(JSON.parse(JSON.stringify(dataMap)));

            const mergedData = JSON.parse(JSON.stringify(dataMap));

            studentList.forEach(st => {
                finalDates.forEach(date => {
                    const leaveRec = leavesMap[st.id]?.[date] || leavesMap[st.id]?.[getDateDisplayPart(date)];
                    if (leaveRec) {
                        if (!mergedData[st.id]) mergedData[st.id] = {};

                        // If data exists, keep it. If not, inject leave status.
                        if (!mergedData[st.id][date]) {
                            if (leaveRec.type === 'ไปราชการ/กิจกรรม') {
                                mergedData[st.id][date] = 'present';
                            } else {
                                mergedData[st.id][date] = 'leave';
                            }
                        }
                    }
                });
            });

            setAttendanceData(mergedData);

        } catch (error) {
            console.error("Error fetching historical data:", error);
            Swal.fire('เกิดข้อผิดพลาด', 'ไม่สามารถดึงข้อมูลประวัติการเช็คชื่อได้', 'error');
        } finally {
            setLoading(false);
        }
    }, [schoolId, selectedClass, selectedRoomNumber, selectedCourse, academicYear, semester, selectedMonth, courses, generateDates, isPrimaryAnnualMode]);

    // Auto-Fetch Effect
    useEffect(() => {
        if (schoolId && selectedClass && selectedCourse && academicYear && semester) {
            handleFetchData();
        }
    }, [schoolId, selectedClass, selectedRoomNumber, selectedCourse, academicYear, semester, selectedMonth, handleFetchData]);

    const getReasonText = (reason?: string) => {
        switch (reason) {
            case 'holiday': return 'วันนี้เป็นวันหยุด';
            case 'weekend': return 'วันนี้เป็นวันเสาร์-อาทิตย์';
            case 'term_break': return 'อยู่นอกภาคเรียน';
            case 'historical_locked': return 'อยู่นอกช่วงเวลาที่อนุญาตให้เช็คชื่อย้อนหลัง';
            case 'not_scheduled': return 'ยังไม่ทำการเช็คเวลาเรียน ในวันนี้ (ไม่มีการสอน)';
            default: return 'ไม่สามารถเช็คชื่อได้';
        }
    };

    const handleCellClick = (studentId: string, date: string, multiSelect: boolean = false) => {
        const meta = dateMetadata[date];

        // Calendar metadata is the source of truth, so makeup school days can override weekends/holidays.
        const isLocked = meta && !meta.isCheckable;

        if (isLocked) {
            // Only show warning if trying to interact directly
            // For drag/multi-select we might silently ignore
            if (!multiSelect) {
                Swal.fire({
                    icon: 'warning',
                    title: 'ไม่สามารถเช็คชื่อได้',
                    text: getReasonText(meta?.reason),
                    timer: 1500,
                    showConfirmButton: false,
                    toast: true,
                    position: 'top-end'
                });
            }
            return;
        }

        // New Logic: Feature Toggle Check
        if (academicSettings?.allowHistoricalAttendance === false) {
            Swal.fire({
                icon: 'error',
                title: 'ระบบเช็คชื่อย้อนหลังถูกปิดใช้งาน',
                text: 'ผู้ดูแลระบบได้สั่งปิดการใช้งานฟีเจอร์นี้ กรุณาติดต่อฝ่ายวิชาการ',
                confirmButtonText: 'รับทราบ',
                confirmButtonColor: '#4f46e5'
            });
            return;
        }

        const cellKey = `${studentId}:${date}`;

        // --- Pencil Mode Logic ---
        if (activeStatus) {
            if (activeStatus === 'clear') {
                setAttendanceData(prev => {
                    const newData = { ...prev };
                    if (newData[studentId]) {
                        const updatedRecord = { ...newData[studentId] };
                        delete updatedRecord[date];
                        newData[studentId] = updatedRecord;
                    }
                    return newData;
                });
            } else {
                setAttendanceData(prev => {
                    const newData = { ...prev };
                    if (!newData[studentId]) newData[studentId] = {};
                    newData[studentId] = { ...newData[studentId], [date]: activeStatus };
                    return newData;
                });
            }
            setIsModified(true);
            return;
        }

        setSelectedCells(prev => {
            const newSet = new Set(prev);
            if (newSet.has(cellKey)) {
                newSet.delete(cellKey);
            } else {
                newSet.add(cellKey);
            }
            return newSet;
        });
    };

    const handleColumnSelect = (date: string) => {
        const meta = dateMetadata[date];
        // Check if locked
        if (!meta?.isCheckable && meta?.reason !== 'schoolDay') return;

        const cellsInColumn = students.map(s => `${s.id}:${date}`);
        const allSelected = cellsInColumn.every(key => selectedCells.has(key));

        setSelectedCells(prev => {
            const newSet = new Set(prev);
            if (allSelected) {
                cellsInColumn.forEach(key => newSet.delete(key));
            } else {
                cellsInColumn.forEach(key => newSet.add(key));
            }
            return newSet;
        });
    };

    const handleBulkStatusUpdate = (status: string) => {
        // Toggle active status for "Pencil Mode"
        setActiveStatus(prev => prev === status ? null : status);

        // New Logic: Feature Toggle Check
        if (status !== null && academicSettings?.allowHistoricalAttendance === false) {
            Swal.fire({
                icon: 'error',
                title: 'ระบบเช็คชื่อย้อนหลังถูกปิดใช้งาน',
                text: 'ผู้ดูแลระบบได้สั่งปิดการใช้งานฟีเจอร์นี้ กรุณาติดต่อฝ่ายวิชาการ',
                confirmButtonText: 'รับทราบ',
                confirmButtonColor: '#4f46e5'
            });
            setActiveStatus(null);
            return;
        }

        if (selectedCells.size === 0) return;

        setAttendanceData(prev => {
            const newData = { ...prev };

            selectedCells.forEach(key => {
                const [studentId, date] = key.split(':');

                // Double check lock status just in case
                const meta = dateMetadata[date];
                if ((meta && !meta.isCheckable)) return;

                if (!newData[studentId]) newData[studentId] = {};

                if (status === 'clear') {
                    // logic to clear? or just delete key?
                    // If we want to 'reset' to default, we might need to check logic.
                    // But usually 'clear' means remove manual override or set to empty?
                    // For now, let's treat 'clear' as removing the entry (making it empty/dash)
                    delete newData[studentId][date];
                } else {
                    newData[studentId][date] = status;
                }
            });

            return newData;
        });

        setIsModified(true);
        // Optional: Clear selection after apply?
        // setSelectedCells(new Set()); 
        // User might want to keep selection to correct mistakes, but usually clearing is better feedback.
        // Let's keep selection for now as it allows rapid switching if they clicked wrong one.
    };

    // Filter logic:
    // ALWAYS SHOW ALL DAYS in the month to ensure clarity.
    // Weekends and Holidays will be rendered as locked.

    const handleSelectAll = () => {
        const allCheckableCells: string[] = [];
        dates.forEach(date => {
            const meta = dateMetadata[date];
            if (meta?.isCheckable) {
                students.forEach(s => {
                    allCheckableCells.push(`${s.id}:${date}`);
                });
            }
        });

        if (allCheckableCells.every(c => selectedCells.has(c))) {
            setSelectedCells(new Set());
        } else {
            setSelectedCells(new Set(allCheckableCells));
        }
    };


    const handleSave = async () => {
        if (!schoolId || !selectedClass || !selectedCourse || isSaving) return;

        const courseObj = courses.find(c => c.id === selectedCourse || c.code === selectedCourse);
        const subjectCode = courseObj?.code || selectedCourse;
        const subjectName = courseObj?.title || '';
        // Derive the classKey from the course's own classId (which may be an array for a
        // combined-class course) so the docId matches exactly what the live check-in page
        // (ClassroomAttendance/index.tsx) would produce for the same course — falling back
        // to the selected class label only when the course record has no classId.
        const fallbackClassKey = Object.keys(CLASSES).find(key => CLASSES[key] === selectedClass) || selectedClass;
        const classKey = courseObj?.classId ? getStableClassKey(courseObj.classId) : fallbackClassKey;

        // Dry-run pass: collect every changed cell and its doc refs first, so we can (a) warn
        // about cells that fall on an approved leave day before writing anything, and (b) know
        // upfront how many Firestore ops we'll need for batch chunking.
        const pendingChanges: {
            studentId: string;
            dateStr: string;
            newVal?: string;
            oldVal?: string;
            ref: ReturnType<typeof doc>;
            oldRef: ReturnType<typeof doc>;
            legacyRoomRef: ReturnType<typeof doc> | null;
            legacyRoomOldRef: ReturnType<typeof doc> | null;
        }[] = [];
        const leaveConflicts: string[] = [];

        students.forEach(student => {
            dates.forEach(dateStr => {
                const newVal = attendanceData[student.id]?.[dateStr];
                const oldVal = initialAttendanceData[student.id]?.[dateStr];
                if (newVal === oldVal) return;

                const periodNum = dateMetadata[dateStr]?.periodNumber || 0;
                const datePartForId = dateStr.split('_')[0];
                const attendanceId = `${datePartForId}_${subjectCode}_${classKey}_P${periodNum}`.replace(/\//g, '-');
                const oldAttendanceId = `${datePartForId}_${subjectCode}_${classKey}`.replace(/\//g, '-');
                const legacyRoomAttendanceId = selectedRoomNumber ? `${datePartForId}_${subjectCode}_${classKey}_${selectedRoomNumber}_P${periodNum}`.replace(/\//g, '-') : '';
                const legacyRoomOldAttendanceId = selectedRoomNumber ? `${datePartForId}_${subjectCode}_${classKey}_${selectedRoomNumber}`.replace(/\//g, '-') : '';

                const ref = doc(db, 'school-settings', schoolId, 'students', student.id, 'ClassroomAttendance', attendanceId);
                const oldRef = doc(db, 'school-settings', schoolId, 'students', student.id, 'ClassroomAttendance', oldAttendanceId);
                const legacyRoomRef = legacyRoomAttendanceId
                    ? doc(db, 'school-settings', schoolId, 'students', student.id, 'ClassroomAttendance', legacyRoomAttendanceId)
                    : null;
                const legacyRoomOldRef = legacyRoomOldAttendanceId
                    ? doc(db, 'school-settings', schoolId, 'students', student.id, 'ClassroomAttendance', legacyRoomOldAttendanceId)
                    : null;

                pendingChanges.push({ studentId: student.id, dateStr, newVal, oldVal, ref, oldRef, legacyRoomRef, legacyRoomOldRef });

                if (newVal) {
                    const leaveRec = studentLeaves[student.id]?.[dateStr] || studentLeaves[student.id]?.[getDateDisplayPart(dateStr)];
                    if (leaveRec) {
                        leaveConflicts.push(`${student.firstName} ${student.lastName} — ${getDateDisplayPart(dateStr)} (${leaveRec.description || leaveRec.type || 'ลา'})`);
                    }
                }
            });
        });

        if (pendingChanges.length === 0) {
            Swal.fire({
                title: 'ไม่มีการเปลี่ยนแปลง',
                text: 'ข้อมูลยังเหมือนเดิม',
                icon: 'info',
                timer: 1500,
                showConfirmButton: false,
                position: 'top-end',
                toast: true
            });
            return;
        }

        // Unlike the live check-in page (which blocks editing a day the student is on
        // approved leave outright), this history editor is explicitly a correction tool
        // used in bulk/drag-select — blocking every cell individually would make that
        // workflow unusable. Instead, surface every conflicting cell once and require an
        // explicit confirmation before overwriting any approved leave day.
        if (leaveConflicts.length > 0) {
            const shown = leaveConflicts.slice(0, 15);
            const remaining = leaveConflicts.length - shown.length;
            const confirmResult = await Swal.fire({
                icon: 'warning',
                title: 'พบรายการที่ทับวันลาที่อนุมัติแล้ว',
                html: `
                    <div class="text-left text-sm">
                        <p class="mb-2">การแก้ไข ${leaveConflicts.length} รายการต่อไปนี้จะบันทึกทับสถานะของวันที่นักเรียนมีการลาที่อนุมัติแล้ว:</p>
                        <ul class="list-disc pl-5 space-y-1 max-h-[35vh] overflow-y-auto">
                            ${shown.map(l => `<li>${l}</li>`).join('')}
                        </ul>
                        ${remaining > 0 ? `<p class="mt-2 italic text-gray-400">...และอีก ${remaining} รายการ</p>` : ''}
                    </div>
                `,
                showCancelButton: true,
                confirmButtonText: `ยืนยันบันทึกทับ (${leaveConflicts.length} รายการ)`,
                cancelButtonText: 'ยกเลิก',
                confirmButtonColor: '#dc2626',
            });
            if (!confirmResult.isConfirmed) return;
        }

        setIsSaving(true);
        try {
            // Firestore batches cap at 500 ops — spread writes across multiple batches for
            // large bulk-select edits (e.g. a whole class over a whole month).
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

            pendingChanges.forEach(({ studentId, dateStr, newVal, oldVal, ref, oldRef, legacyRoomRef, legacyRoomOldRef }) => {
                if (!newVal) {
                    nextBatch().delete(ref);
                    nextBatch().delete(oldRef); // Clean up old format too
                    if (legacyRoomRef) nextBatch().delete(legacyRoomRef);
                    if (legacyRoomOldRef) nextBatch().delete(legacyRoomOldRef);
                } else {
                    const datePart = dateStr.split('_')[0];
                    const [d, m, y] = datePart.split('-').map(Number);
                    const dateObj = new Date(y, m - 1, d, 12, 0, 0);
                    const recordISODate = `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
                    const recordSemester = isPrimaryAnnualMode
                        ? getSemesterForISODate(recordISODate, terms, semester)
                        : semester;

                    const derivedClassName = CLASSES[classKey] || classKey || "ไม่ระบุ";
                    const periodNum = dateMetadata[dateStr]?.periodNumber || 0;
                    // A record previously existed for this cell (oldVal was loaded from
                    // Firestore) — this is an edit of someone else's original entry, not a
                    // brand-new record, so preserve who first recorded it.
                    const isEditOfExistingRecord = oldVal !== undefined && oldVal !== null && oldVal !== '';

                    const attendancePayload: Record<string, unknown> = {
                        schoolId,
                        studentId,
                        date: Timestamp.fromDate(dateObj),
                        classId: classKey,
                        className: derivedClassName,
                        room: selectedRoomNumber || null,
                        period: periodNum,
                        subjectName,
                        subjectCode,
                        courseId: courseObj?.id || null,
                        status: newVal,
                        academicYear,
                        semester: recordSemester,
                        updatedAt: Timestamp.now()
                    };

                    if (isEditOfExistingRecord) {
                        // merge:true leaves the existing teacherId/teacherName (the original
                        // recorder) untouched — we only layer the edit-audit trail on top.
                        attendancePayload.previousStatus = oldVal;
                        attendancePayload.lastEditedBy = currentTeacher?.id || (currentUser as any)?.uid || 'unknown';
                        attendancePayload.lastEditedByName = currentTeacher?.name || (currentUser as any)?.displayName || '';
                        attendancePayload.lastEditedAt = Timestamp.now();
                    } else {
                        attendancePayload.teacherId = currentTeacher?.id || (currentUser as any)?.uid || 'unknown';
                        attendancePayload.teacherName = currentTeacher?.name || (currentUser as any)?.displayName || '';
                    }

                    nextBatch().set(ref, attendancePayload, { merge: true });
                    nextBatch().delete(oldRef);
                    if (legacyRoomRef) nextBatch().delete(legacyRoomRef);
                    if (legacyRoomOldRef) nextBatch().delete(legacyRoomOldRef);

                    if (behaviorConfig) {
                        const oldStatus = `class:${oldVal || 'present'}`;
                        const newStatus = `class:${newVal}`;
                        if (oldStatus !== newStatus) {
                            scoreChanges.push({ studentId, oldStatus, newStatus });
                        }
                    }
                }
            });

            // Commit attendance first — the source of truth — before touching behavior scores.
            for (const b of batches) {
                await b.commit();
            }

            setInitialAttendanceData(JSON.parse(JSON.stringify(attendanceData)));
            setIsModified(false);

            // Behavior score adjustments are best-effort follow-ups: the attendance records
            // are already durably saved above, so a failure here is logged but doesn't block
            // the success flow. It also can't be silently retried by re-saving — once saved,
            // the next save's oldStatus === newStatus so no score change gets queued again —
            // so a failure here must be surfaced rather than shown as a plain "success".
            let scoreUpdateFailed = false;
            if (scoreChanges.length > 0) {
                try {
                    await Promise.all(scoreChanges.map(({ studentId, oldStatus, newStatus }) => {
                        const studentMainRef = doc(db, 'school-settings', schoolId, 'students', studentId);
                        return runTransaction(db, async (transaction) => {
                            const studentSnap = await transaction.get(studentMainRef);
                            const freshScore = studentSnap.exists() ? Number(studentSnap.data().behaviorScore ?? 100) : 100;
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

            Swal.fire({
                title: scoreUpdateFailed ? 'บันทึกการเช็คชื่อสำเร็จ' : 'บันทึกสำเร็จ',
                text: scoreUpdateFailed
                    ? `อัปเดตข้อมูล ${pendingChanges.length} รายการแล้ว แต่ปรับคะแนนพฤติกรรมไม่สำเร็จ กรุณาตรวจสอบด้วยตนเอง`
                    : `อัปเดตข้อมูล ${pendingChanges.length} รายการเรียบร้อยแล้ว`,
                icon: scoreUpdateFailed ? 'warning' : 'success',
                timer: scoreUpdateFailed ? 3500 : 2000,
                showConfirmButton: false,
                position: 'top-end',
                toast: true
            });
        } catch (error) {
            console.error("Error saving:", error);
            Swal.fire('บันทึกไม่สำเร็จ', 'เกิดข้อผิดพลาดในการบันทึกข้อมูล', 'error');
        } finally {
            setIsSaving(false);
        }
    };

    const exportToExcel = () => {
        if (students.length === 0 || dates.length === 0) return;

        const wb = XLSX.utils.book_new();
        const wsData = [];

        const excelHeaders = dates.map(d => {
            const meta = dateMetadata[d];
            const day = d.split('-')[0];
            return meta?.periodNumber ? `${day} (ค.${meta.periodNumber})` : day;
        });
        const header = ['เลขที่', 'รหัสนักเรียน', 'ชื่อ - นามสกุล', ...excelHeaders, 'มา', 'สาย', 'ลา', 'ขาด', 'หนีเรียน', 'ร้อยละการมาเรียน'];
        wsData.push(header);

        students.forEach(s => {
            const row: any[] = [s.number, s.studentNumber, `${s.firstName} ${s.lastName}`];
            let p = 0, l = 0, v = 0, a = 0, esc = 0;
            let totalPossible = 0;

            dates.forEach(date => {
                const status = attendanceData[s.id]?.[date];
                const meta = dateMetadata[date];
                const isCheckable = meta?.isCheckable ?? true;

                if (isCheckable) totalPossible++; // Only count in denominator if checkable

                if (!isCheckable) {
                    row.push(meta?.reason ? `(${meta.reason})` : '-');
                } else if (status === 'present') { row.push('มา'); p++; }
                else if (status === 'late') { row.push('สาย'); l++; }
                else if (status === 'leave') { row.push('ลา'); v++; }
                else if (status === 'absent') { row.push('ขาด'); a++; }
                else if (status === 'escape') { row.push('หนีเรียน'); esc++; }
                else row.push('-');
            });

            const percentage = totalPossible > 0 ? ((p + l) / totalPossible * 100).toFixed(2) : '0.00';
            row.push(p, l, v, a, esc, percentage + '%');
            wsData.push(row);
        });

        const ws = XLSX.utils.aoa_to_sheet(wsData);
        XLSX.utils.book_append_sheet(wb, ws, 'Attendance');
        XLSX.writeFile(wb, `Attendance_${selectedClass}_${selectedCourse}_${months[selectedMonth]}_${academicYear}_${semester}.xlsx`);
    };

    const getStatusBadge = (studentId: string, date: string, status?: string, isCheckable: boolean = true, tooltip?: string, reason?: string) => {
        // Handle locked records (leaves) regardless of date checkability
        const leaveRec = studentLeaves[studentId]?.[date] || studentLeaves[studentId]?.[getDateDisplayPart(date)];
        const isLockedRecord = !!leaveRec;

        let content;
        if (!isCheckable) {
            if (reason === 'not_scheduled') {
                content = (
                    <div className="mx-auto w-[16px] h-[16px] rounded-sm bg-transparent border border-black/10 dark:border-white/10 text-black/20 dark:text-white/20 flex items-center justify-center text-[7px] font-light">
                        -
                    </div>
                );
            } else {
                content = (
                    <div className="w-[10px] h-[10px] rounded-[2px] bg-gray-100/20 dark:bg-gray-800/20 flex items-center justify-center text-gray-500/70 dark:text-gray-300/75 transition-all border border-gray-400/50 dark:border-white/55">
                        <FaLock size={6} />
                    </div>
                );
            }
        } else {
            switch (status) {
                case 'present':
                    content = (
                        <div className={`
                            mx-auto w-[16px] h-[16px] rounded-sm flex items-center justify-center text-[7px] font-bold transition-all
                            ${isLockedRecord ? 'bg-green-600 text-white' : 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 hover:bg-green-200 dark:hover:bg-green-900/50'}
                        `}>
                            /
                        </div>
                    );
                    break;
                case 'late':
                    content = (
                        <div className={`
                            mx-auto w-[16px] h-[16px] rounded-sm flex items-center justify-center text-[7px] font-bold transition-all
                            ${isLockedRecord ? 'bg-yellow-500 text-white' : 'bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-400 hover:bg-yellow-200 dark:hover:bg-yellow-900/50'}
                        `}>
                            ส
                        </div>
                    );
                    break;
                case 'leave':
                    content = (
                        <div className={`
                            mx-auto w-[16px] h-[16px] rounded-sm flex items-center justify-center text-[7px] font-bold transition-all
                            ${isLockedRecord ? 'bg-blue-600 text-white' : 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 hover:bg-blue-200 dark:hover:bg-blue-900/50'}
                        `}>
                            ล
                        </div>
                    );
                    break;
                case 'absent':
                    content = (
                        <div className={`
                            mx-auto w-[16px] h-[16px] rounded-sm flex items-center justify-center text-[7px] font-bold transition-all
                            ${isLockedRecord ? 'bg-red-600 text-white' : 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400 hover:bg-red-200 dark:hover:bg-red-900/50'}
                        `}>
                            ข
                        </div>
                    );
                    break;
                case 'escape':
                    content = (
                        <div className={`
                            mx-auto w-[16px] h-[16px] rounded-sm flex items-center justify-center text-[7px] font-bold transition-all
                            ${isLockedRecord ? 'bg-orange-600 text-white' : 'bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-400 hover:bg-orange-200 dark:hover:bg-orange-900/50'}
                        `}>
                            น
                        </div>
                    );
                    break;
                default:
                    content = (
                        <div className="mx-auto w-[16px] h-[16px] rounded-sm bg-transparent border border-black/10 dark:border-white/10 text-black/20 dark:text-white/20 flex items-center justify-center text-[7px] hover:bg-black/5 dark:hover:bg-white/5 transition-all font-light">
                            -
                        </div>
                    );
            }
        }

        return (
            <div className="flex items-center justify-center w-full py-0.5 group/cell relative">
                <div className="relative">
                    {content}
                    {isLockedRecord && (
                        <div className="absolute -top-1 -right-1 bg-white dark:bg-gray-800 rounded-full shadow-sm p-[1px] border border-gray-100 dark:border-gray-700 z-10">
                            <FaLock size={6} className="text-indigo-500" />
                        </div>
                    )}
                </div>
                {tooltip && (
                    <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-2 py-1 bg-gray-800 dark:bg-gray-700 text-white text-[9px] rounded shadow-xl opacity-0 group-hover/cell:opacity-100 transition-opacity pointer-events-none whitespace-nowrap z-50 border border-gray-600">
                        {tooltip}
                        <div className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-gray-800 dark:border-t-[#1a1b1e]"></div>
                    </div>
                )}
            </div>
        );
    };



    // --- Statistics Helpers ---
    const calculateTotalStat = (statusKey: string) => {
        let count = 0;
        students.forEach(s => dates.forEach(d => {
            // Only count if day is checkable AND matches status
            if (dateMetadata[d]?.isCheckable && attendanceData[s.id]?.[d] === statusKey) {
                count++;
            }
        }));
        return count;
    };

    const calculateAverageAttendance = () => {
        if (students.length === 0 || dates.length === 0) return '0.00';
        let presentCount = 0;
        let totalRecorded = 0;

        students.forEach(s => dates.forEach(d => {
            const meta = dateMetadata[d];
            // Only calculate rate from checkable days (Mon-Fri + Compensation, excluding Holidays/Weekends)
            if (meta?.isCheckable) {
                const st = attendanceData[s.id]?.[d];
                // Only include in calculation if mass attendance has actually been recorded for this student/date
                if (st && ['present', 'late', 'leave', 'absent', 'escape'].sort().includes(st)) {
                    totalRecorded++;
                    // "Present" and "Late" are counted as attending
                    if (st === 'present' || st === 'late') presentCount++;
                }
            }
        }));

        if (totalRecorded === 0) return '100.0'; // Default to 100% if no data yet to avoid showing 0% error
        return ((presentCount / totalRecorded) * 100).toFixed(1);
    };

    const getDateCheckProgress = (date: string) => {
        const meta = dateMetadata[date];
        if (!meta?.isCheckable || students.length === 0) {
            return { checked: 0, total: students.length, percent: 0 };
        }

        const checked = students.reduce((count, student) => {
            const status = attendanceData[student.id]?.[date];
            return typeof status === 'string' && ['present', 'late', 'leave', 'absent', 'escape'].includes(status) ? count + 1 : count;
        }, 0);

        return {
            checked,
            total: students.length,
            percent: Math.round((checked / students.length) * 100)
        };
    };

    // Resolve back to IDs for the navigation link
    const backNavParams = useMemo(() => {
        const foundCourse = courses.find(c => c.code === selectedCourse || c.id === selectedCourse);
        const levelID = Object.keys(CLASSES).find(key => CLASSES[key] === selectedClass) || selectedClass;

        return {
            levelID,
            room: selectedRoomNumber,
            groupId: selectedRoomNumber ? `กลุ่ม ${selectedRoomNumber}` : '',
            courseId: foundCourse?.id || selectedCourse,
            semester: semester,
            year: academicYear
        };
    }, [selectedClass, selectedRoomNumber, selectedCourse, semester, academicYear, courses]);

    return (
        <MainLayout>
            <div className="p-4 md:p-6 lg:p-8 bg-gray-50 dark:bg-gray-900 min-h-screen text-gray-900 dark:text-white transition-colors overflow-x-hidden">
                <div className="w-full mx-auto space-y-1">

                    {/* Header */}
                    <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-2 gap-4 bg-white dark:bg-[#2a2b2f]/60 backdrop-blur-sm p-5 rounded-[1.5rem] border border-gray-200/50 dark:border-white/5 transition-all duration-300">
                        <div className="space-y-1 text-left">
                            <div className="flex items-center gap-3">
                                <BackButton to={searchParams.get('courseId') ? `/academic/grade-book?classId=${backNavParams.levelID}&courseId=${backNavParams.courseId}&semester=${backNavParams.semester}&room=${backNavParams.room}&groupId=${backNavParams.groupId}&year=${backNavParams.year}` : '/academic/hub/attendance'} />
                                <div className="p-2.5 bg-indigo-50 dark:bg-indigo-500/10 rounded-2xl shadow-sm border border-indigo-100 dark:border-indigo-500/20">
                                    <Users className="text-indigo-600 dark:text-indigo-400" size={24} />
                                </div>
                                <div>
                                    <h1 className="text-2xl font-black text-gray-900 dark:text-white leading-tight tracking-tight">
                                        เช็คชื่อรายวิชาย้อนหลัง
                                    </h1>
                                    <p className="text-gray-500 dark:text-gray-400 text-xs font-bold flex items-center gap-1.5 pt-0.5">
                                        <span className="opacity-60">ปีการศึกษา {academicYear || '...'}</span>
                                        <span className="opacity-30">·</span>
                                        <span className="text-indigo-600 dark:text-indigo-400 font-extrabold">
                                            {isPrimaryAnnualMode ? 'รายปี (ประถม)' : `ภาคเรียนที่ ${semester || '...'}`}
                                        </span>
                                    </p>
                                </div>
                            </div>
                        </div>
                        <div className="flex items-center gap-2">
                            {students.length > 0 && (
                                <button onClick={exportToExcel} className="flex items-center gap-2 text-green-600 hover:text-green-700 border border-green-200 dark:border-green-800 bg-white dark:bg-gray-800 px-4 py-2 rounded-xl shadow-sm font-bold text-sm transition-colors">
                                    <FileSpreadsheet size={16} /> Export Excel
                                </button>
                            )}
                            {isModified && (
                                <button
                                    onClick={handleSave}
                                    disabled={isSaving}
                                    className={`flex items-center gap-2 text-white px-4 py-2 rounded-xl shadow-md font-bold text-sm transition-all ${isSaving ? 'bg-gray-400 cursor-not-allowed' : 'bg-indigo-600 hover:bg-indigo-700 animate-pulse'}`}
                                >
                                    <Save size={16} /> {isSaving ? 'กำลังบันทึก...' : 'บันทึกการเปลี่ยนแปลง'}
                                </button>
                            )}
                        </div>
                    </div>

                    {/* Feature Locked Alert */}
                    {(academicSettings?.allowHistoricalAttendance === false ||
                        (academicSettings?.allowHistoricalAttendance === true && (academicSettings.historicalAttendanceStartDate || academicSettings.historicalAttendanceEndDate))) && (
                            <div className="bg-rose-50 dark:bg-rose-500/10 border border-rose-200 dark:border-rose-500/20 rounded-xl p-3 flex items-center gap-4 text-rose-700 dark:text-rose-400 animate-in fade-in zoom-in duration-300">
                                <AlertCircle size={20} className="shrink-0" />
                                <div className="flex-1">
                                    <p className="text-sm font-bold leading-none">
                                        {academicSettings?.allowHistoricalAttendance === false
                                            ? 'ระบบเช็คชื่อย้อนหลังถูกปิดใช้งานโดยผู้ดูแลระบบ'
                                            : 'ระบบเช็คชื่อย้อนหลังถูกจำกัดช่วงเวลา'}
                                    </p>
                                    <p className="text-[10px] mt-1 opacity-80">
                                        {academicSettings?.allowHistoricalAttendance === false
                                            ? 'คุณสามารถดูข้อมูลได้แต่อย่างเดียว แต่ไม่สามารถแก้ไขหรือบันทึกข้อมูลใหม่ได้'
                                            : `คุณสามารถบันทึกข้อมูลได้เฉพาะช่วงวันที่ ${academicSettings.historicalAttendanceStartDate ? new Date(academicSettings.historicalAttendanceStartDate).toLocaleDateString('th-TH') : '...'} ถึง ${academicSettings.historicalAttendanceEndDate ? new Date(academicSettings.historicalAttendanceEndDate).toLocaleDateString('th-TH') : '...'}`}
                                    </p>
                                </div>
                            </div>
                        )}

                    {/* Term Range & Attendance Count Alerts */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-2 mb-2 animate-in slide-in-from-left duration-700">
                        {/* Term Dates Info */}
                        <div className="bg-white/50 dark:bg-[#1a1b1e]/50 backdrop-blur-sm border border-indigo-100 dark:border-indigo-900/30 rounded-xl p-3 flex items-center gap-4 text-indigo-700 dark:text-indigo-400 shadow-sm">
                            <div className="p-2 bg-indigo-500/10 rounded-lg">
                                <Calendar size={20} className="shrink-0" />
                            </div>
                            <div className="flex-1">
                                <p className="text-[11px] font-black uppercase tracking-wider opacity-60 leading-none mb-2">ช่วงเวลาภาคเรียน</p>
                                <div className="flex gap-4 text-[10px]">
                                    <div className="flex flex-col gap-0.5">
                                        <span className="opacity-70 font-bold">ภาคเรียนที่ 1</span>
                                        <span className="font-black text-gray-900 dark:text-gray-100">{terms.term1.startDate ? new Date(terms.term1.startDate).toLocaleDateString('th-TH') : 'ยังไม่กำหนด'} - {terms.term1.endDate ? new Date(terms.term1.endDate).toLocaleDateString('th-TH') : 'ยังไม่กำหนด'}</span>
                                    </div>
                                    <div className="w-px h-6 bg-gray-200 dark:bg-gray-700 my-auto"></div>
                                    <div className="flex flex-col gap-0.5">
                                        <span className="opacity-70 font-bold">ภาคเรียนที่ 2</span>
                                        <span className="font-black text-gray-900 dark:text-gray-100">{terms.term2.startDate ? new Date(terms.term2.startDate).toLocaleDateString('th-TH') : 'ยังไม่กำหนด'} - {terms.term2.endDate ? new Date(terms.term2.endDate).toLocaleDateString('th-TH') : 'ยังไม่กำหนด'}</span>
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* Attendance Warning Logic Based on Level */}
                        {(() => {
                            const classLabel = CLASSES[selectedClass] || selectedClass;
                            const isPrimary = classLabel.includes('ป.') || selectedClass.toLowerCase().startsWith('p');
                            const credits = filteredCourses.find(c => c.code === selectedCourse || c.id === selectedCourse)?.credits;
                            const hoursPerWeek = filteredCourses.find(c => c.code === selectedCourse || c.id === selectedCourse)?.hoursPerWeek || (Number(credits) * 2);

                            // Semester threshold for Secondary, Annual for Primary
                            const threshold = isPrimary ? 200 : (Number(credits) >= 1 ? 80 : 40);
                            const limitLabel = isPrimary ? 'ปีการศึกษา' : 'ภาคเรียน';

                            if (annualRecordedDays > threshold) {
                                return (
                                    <div className="bg-orange-50 dark:bg-orange-500/10 border border-orange-200 dark:border-orange-500/20 rounded-xl p-3 flex items-center gap-4 text-orange-700 dark:text-orange-400 animate-pulse-slow">
                                        <div className="p-2 bg-orange-500/10 rounded-lg">
                                            <AlertTriangle size={20} className="shrink-0" />
                                        </div>
                                        <div className="flex-1">
                                            <p className="text-[11px] font-black uppercase tracking-wider leading-none mb-1">แจ้งเตือน: จำนวนวันเกินกำหนด</p>
                                            <p className="text-[10px] mt-1 font-medium italic">
                                                วิชานี้บันทึกไปแล้วรวม <span className="font-black text-xs underline decoration-2">{annualRecordedDays}</span> วัน (เกินเกณฑ์ปกติต่อ{limitLabel})
                                                {hoursPerWeek > 0 && <span className="ml-1 opacity-70">| ตารางสอน {hoursPerWeek} คาบ/สัปดาห์</span>}
                                            </p>
                                        </div>
                                    </div>
                                );
                            } else if (selectedCourse && annualRecordedDays > 0) {
                                return (
                                    <div className="bg-emerald-50 dark:bg-emerald-500/10 border border-emerald-200 dark:border-emerald-500/20 rounded-xl p-3 flex items-center gap-4 text-emerald-700 dark:text-emerald-400 shadow-sm">
                                        <div className="p-2 bg-emerald-500/10 rounded-lg">
                                            <CheckCircle size={20} className="shrink-0" />
                                        </div>
                                        <div className="flex-1">
                                            <p className="text-[11px] font-black uppercase tracking-wider leading-none mb-1">สถิติจำนวนวันเช็คชื่อ</p>
                                            <p className="text-[10px] mt-1 font-medium">
                                                บันทึกข้อมูลแล้วทั้งหมด <span className="font-black">{annualRecordedDays}</span> วัน (นับตาม{limitLabel})
                                                {hoursPerWeek > 0 && <span className="ml-1 opacity-70 font-bold">| {hoursPerWeek} คาบต่อสัปดาห์</span>}
                                            </p>
                                        </div>
                                    </div>
                                );
                            }
                            return (
                                <div className="bg-gray-50/50 dark:bg-gray-800/20 border border-dashed border-gray-200 dark:border-gray-700/50 rounded-xl p-3 flex items-center gap-4 text-gray-400">
                                    <div className="p-2 bg-gray-500/5 rounded-lg">
                                        <Search size={20} className="shrink-0 opacity-30" />
                                    </div>
                                    <p className="text-[10px] font-medium italic">เลือกวิชาเพื่อดูสรุปสถิติจำนวนวัน</p>
                                </div>
                            );
                        })()}
                    </div>


                    {/* Filters & Controls */}
                    <div className="bg-white dark:bg-[#1a1b1e] p-4 rounded-2xl shadow-sm border border-gray-100 dark:border-white/5 animate-in slide-in-from-top-4 duration-500">
                        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-[minmax(120px,0.75fr)_minmax(140px,0.9fr)_minmax(130px,0.8fr)_minmax(260px,1.65fr)_minmax(220px,1fr)_48px] 2xl:grid-cols-[minmax(130px,160px)_minmax(150px,180px)_minmax(140px,170px)_minmax(300px,1fr)_minmax(240px,280px)_52px] gap-3 xl:gap-4 items-end min-w-0">
                            {/* Term Selector */}
                            <div className="space-y-1.5 min-w-0">
                                <label className="text-[11px] font-bold text-gray-400 uppercase tracking-wider flex items-center gap-1.5">
                                    <Filter size={10} /> ภาคเรียน
                                </label>
                                <div className="relative">
                                    <select value={semester} onChange={e => setSemester(e.target.value)} className="w-full h-[46px] pl-3 pr-9 bg-gray-50 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-xl focus:ring-4 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all outline-none appearance-none font-bold text-sm text-gray-700 dark:text-gray-200">
                                        {TERMS.map(t => <option key={t} value={t}>เทอม {t}</option>)}
                                    </select>
                                    <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-gray-400">
                                        <ChevronDown size={14} />
                                    </div>
                                </div>
                            </div>

                            {/* Class Selector */}
                            <div className="space-y-1.5 min-w-0">
                                <label className="text-[11px] font-bold text-gray-400 uppercase tracking-wider">ระดับชั้น</label>
                                <Select
                                    options={classOptions}
                                    isClearable
                                    placeholder="เลือกชั้น..."
                                    value={classOptions.find(opt => opt.value === selectedClass || opt.label === selectedClass)}
                                    onChange={(val) => setSelectedClass(val ? val.value : '')}
                                    styles={selectStyles}
                                    menuPortalTarget={document.body}
                                    menuPosition="fixed"
                                />
                            </div>

                            {/* Room Selector */}
                            <div className="space-y-1.5 min-w-0">
                                <label className="text-[11px] font-bold text-gray-400 uppercase tracking-wider">ห้อง</label>
                                <Select
                                    options={roomOptions}
                                    isClearable
                                    placeholder="เลือกห้อง..."
                                    value={roomOptions.find(opt => opt.value === selectedRoomNumber)}
                                    onChange={(val) => setSelectedRoomNumber(val ? val.value : '')}
                                    styles={selectStyles}
                                    menuPortalTarget={document.body}
                                    menuPosition="fixed"
                                />
                            </div>

                            {/* Course Selector */}
                            <div className="space-y-1.5 min-w-0 sm:col-span-2 xl:col-span-1">
                                <label className="text-[11px] font-bold text-gray-400 uppercase tracking-wider">รายวิชา</label>
                                <Select
                                    options={filteredCourses.map(c => ({ value: c.code, label: `${c.code} - ${c.title}` }))}
                                    isClearable
                                    placeholder={selectedClass ? 'เลือกรายวิชา...' : 'กรุณาเลือกชั้นเรียนก่อน'}
                                    isDisabled={!selectedClass}
                                    value={filteredCourses.map(c => ({ value: c.code, label: `${c.code} - ${c.title}` })).find(opt => opt.value === selectedCourse)}
                                    onChange={(val) => setSelectedCourse(val ? val.value : '')}
                                    styles={selectStyles}
                                    menuPortalTarget={document.body}
                                    menuPosition="fixed"
                                />
                            </div>

                            {/* Month Navigation with Grid Picker */}
                            <div className="space-y-1.5 min-w-0 sm:col-span-2 xl:col-span-1">
                                <label className="text-[11px] font-bold text-gray-400 uppercase tracking-wider">เดือนที่แสดง</label>
                                <div className="relative min-w-0" ref={monthPickerRef}>
                                    <div className="flex items-center gap-2 bg-gray-50 dark:bg-gray-700/50 p-1 rounded-xl border border-gray-100 dark:border-gray-700 w-full">
                                        <button
                                            onClick={() => setSelectedMonth(previousAllowedMonth)}
                                            className="h-9 w-9 flex items-center justify-center hover:bg-white dark:hover:bg-gray-600 rounded-lg shadow-sm transition-all text-gray-500 hover:text-indigo-600 active:scale-95 shrink-0"
                                            title="เดือนก่อนหน้า"
                                        >
                                            <ChevronLeft size={17} />
                                        </button>

                                        <button
                                            onClick={() => setIsMonthPickerOpen(!isMonthPickerOpen)}
                                            className={`flex-1 min-w-0 h-9 flex flex-col items-center justify-center px-2 hover:bg-white dark:hover:bg-gray-600 rounded-lg transition-all ${isMonthPickerOpen ? 'bg-white dark:bg-gray-600 ring-2 ring-indigo-500/20' : ''}`}
                                        >
                                            <div className="flex items-center justify-center gap-1.5 min-w-0 w-full">
                                                <span className="font-black text-sm text-gray-800 dark:text-gray-100 truncate">{months[selectedMonth]}</span>
                                                <ChevronDown size={12} className={`text-gray-400 transition-transform duration-300 shrink-0 ${isMonthPickerOpen ? 'rotate-180' : ''}`} />
                                            </div>
                                            <span className="text-[9px] uppercase font-black text-indigo-500 tracking-wider leading-none">ปี พ.ศ. {calculatedYearAD + 543}</span>
                                        </button>

                                        <button
                                            onClick={() => setSelectedMonth(nextAllowedMonth)}
                                            className="h-9 w-9 flex items-center justify-center hover:bg-white dark:hover:bg-gray-600 rounded-lg shadow-sm transition-all text-gray-500 hover:text-indigo-600 active:scale-95 shrink-0"
                                            title="เดือนถัดไป"
                                        >
                                            <ChevronRight size={17} />
                                        </button>
                                    </div>

                            {/* Month Grid Picker Dropdown */}
                            {isMonthPickerOpen && (
                                <div className="absolute top-full left-0 sm:left-1/2 sm:-translate-x-1/2 xl:left-auto xl:right-0 xl:translate-x-0 2xl:left-1/2 2xl:right-auto 2xl:-translate-x-1/2 mt-2 w-72 max-w-[calc(100vw-2rem)] bg-white dark:bg-[#1a1b1e] rounded-2xl shadow-2xl border border-gray-100 dark:border-white/5 p-4 z-[100] animate-in fade-in zoom-in duration-200">
                                    <div className="grid grid-cols-3 gap-2">
                                        {months.map((month, idx) => {
                                            const isSelected = selectedMonth === idx;
                                            const isMonthInTerm = allowedMonths.includes(idx);

                                            return (
                                                <button
                                                    key={month}
                                                    onClick={() => {
                                                        if (!isMonthInTerm) return;
                                                        setSelectedMonth(idx);
                                                        setIsMonthPickerOpen(false);
                                                    }}
                                                    disabled={!isMonthInTerm}
                                                    className={`
                                                        py-3 rounded-xl text-sm font-semibold transition-all relative
                                                        ${isSelected
                                                            ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-200 dark:shadow-none'
                                                            : isMonthInTerm
                                                                ? 'bg-indigo-50/50 dark:bg-indigo-900/20 text-indigo-700 dark:text-indigo-300 border border-indigo-100 dark:border-indigo-800/50 hover:bg-indigo-100 dark:hover:bg-indigo-900/40'
                                                                : 'text-gray-300 dark:text-gray-700 cursor-not-allowed bg-gray-50 dark:bg-gray-900/40'}
                                                    `}
                                                    title={isMonthInTerm ? month : 'เดือนนี้อยู่นอกภาคเรียนที่เลือก'}
                                                >
                                                    {month.substring(0, 3)}
                                                    {/* Term Indicator Dot */}
                                                    {isMonthInTerm && (
                                                        <div className="absolute top-1 right-1 w-1 h-1 rounded-full bg-indigo-500" />
                                                    )}
                                                </button>
                                            );
                                        })}
                                    </div>
                                </div>
                            )}
                                </div>
                            </div>

                            <button
                                onClick={handleFetchData}
                                disabled={loading || !selectedCourse}
                                className={`
                                    h-[46px] w-full sm:col-span-2 xl:col-span-1 rounded-xl font-bold text-white shadow-md transition-all flex items-center justify-center self-end
                                    ${loading ? 'bg-indigo-400 cursor-not-allowed' : 'bg-indigo-600 hover:bg-indigo-700 active:scale-95 shadow-indigo-500/20'}
                                `}
                                title="รีเฟรชข้อมูล"
                            >
                                {loading ? <div className="animate-spin rounded-full h-4 w-4 border-2 border-white/30 border-b-white"></div> : <Search size={20} />}
                            </button>
                        </div>
                    </div>


                    {/* Modern Summary Bar */}
                    {students.length > 0 && dates.length > 0 && (
                        <div className="bg-white/80 dark:bg-[#1a1b1e]/80 backdrop-blur-md p-2 rounded-xl border border-gray-200 dark:border-white/5 shadow-sm flex items-center divide-x divide-gray-100 dark:divide-gray-700">
                            {[
                                { label: 'อัตราการมาเรียน', value: `${calculateAverageAttendance()}%`, color: 'text-emerald-500', icon: BarChart3, bg: 'bg-emerald-500/10' },
                                { label: 'ขาดเรียนรวม', value: `${calculateTotalStat('absent')}`, suffix: 'ครั้ง', color: 'text-rose-500', icon: Users, bg: 'bg-rose-500/10' },
                                { label: 'ลาป่วย/กิจ', value: `${calculateTotalStat('leave')}`, suffix: 'ครั้ง', color: 'text-sky-500', icon: FileSpreadsheet, bg: 'bg-sky-500/10' },
                                { label: 'มาสาย', value: `${calculateTotalStat('late')}`, suffix: 'ครั้ง', color: 'text-amber-500', icon: BarChart3, bg: 'bg-amber-500/10' },
                            ].map((stat, i) => (
                                <div key={i} className="flex-1 px-4 flex items-center justify-between group">
                                    <div className="flex items-center gap-3">
                                        <div className={`p-2 rounded-lg ${stat.bg} ${stat.color} transition-transform group-hover:scale-110`}>
                                            <stat.icon size={16} />
                                        </div>
                                        <div>
                                            <p className="text-[9px] font-bold text-gray-400 uppercase tracking-widest">{stat.label}</p>
                                            <div className="flex items-baseline gap-1">
                                                <span className={`text-lg font-black tracking-tight ${stat.color}`}>{stat.value}</span>
                                                {stat.suffix && <span className="text-[9px] text-gray-400 font-medium">{stat.suffix}</span>}
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}

                    {/* Quick Legend (Collapsible or simpler) */}
                    <div className="flex flex-wrap items-center gap-4 text-[10px] bg-white dark:bg-[#1a1b1e] p-2 rounded-lg border border-gray-200 dark:border-white/5 shadow-sm">
                        <span className="font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wide">สัญลักษณ์:</span>
                        <div className="flex items-center gap-1.5 px-1.5 py-0.5 bg-green-50 dark:bg-green-900/20 rounded-md border border-green-100 dark:border-green-800/30">
                            <div className="w-1.5 h-1.5 rounded-full bg-green-500"></div> <span className="text-green-700 dark:text-green-400 font-medium">มา</span>
                        </div>
                        <div className="flex items-center gap-1.5 px-1.5 py-0.5 bg-yellow-50 dark:bg-yellow-900/20 rounded-md border border-yellow-100 dark:border-yellow-800/30">
                            <div className="w-1.5 h-1.5 rounded-full bg-yellow-500"></div> <span className="text-yellow-700 dark:text-yellow-400 font-medium">สาย</span>
                        </div>
                        <div className="flex items-center gap-1.5 px-1.5 py-0.5 bg-blue-50 dark:bg-blue-900/20 rounded-md border border-blue-100 dark:border-blue-800/30">
                            <div className="w-1.5 h-1.5 rounded-full bg-blue-500"></div> <span className="text-blue-700 dark:text-blue-400 font-medium">ลา</span>
                        </div>
                        <div className="flex items-center gap-1.5 px-1.5 py-0.5 bg-red-50 dark:bg-red-900/20 rounded-md border border-red-100 dark:border-red-800/30">
                            <div className="w-1.5 h-1.5 rounded-full bg-red-500"></div> <span className="text-red-700 dark:text-red-400 font-medium">ขาด</span>
                        </div>

                        <div className="ml-auto text-gray-400 flex items-center gap-1 bg-indigo-50 dark:bg-indigo-900/20 px-2 py-1 rounded text-[9px] border border-indigo-100 dark:border-indigo-800">
                            <CheckSquare size={10} className="text-indigo-500" />
                            <span className="text-indigo-600 dark:text-indigo-300">คลิกที่ช่อง หรือ วันที่ เพื่อเลือกหลายรายการ</span>
                        </div>
                    </div>

                    {/* Layout Optimization: Flexbox Container for Table */}
                    <div className="bg-white dark:bg-[#1a1b1e] rounded-xl shadow-xl shadow-indigo-500/5 border border-gray-100 dark:border-white/5 overflow-hidden flex flex-col h-[calc(100vh-320px)] border-b-0">

                        <div className="overflow-auto flex-1 scrollbar-thin scrollbar-thumb-gray-200 dark:scrollbar-thumb-gray-700">
                            <table
                                className="w-full text-left border-collapse table-fixed"
                                style={{ zoom: 1.5 } as React.CSSProperties}
                            >
                                <thead className="bg-[#f8fafc] dark:bg-[#1e1f21] text-gray-600 dark:text-gray-300 sticky top-0 z-20 shadow-sm border-b border-gray-100 dark:border-white/5">
                                    <tr className="h-12">
                                        <th style={{ left: 0, width: '18px', minWidth: '18px' }} className="p-0 text-center sticky bg-[#f8fafc] dark:bg-[#1e1f21] z-30 border-r border-gray-100 dark:border-white/5 text-[8px] font-bold">#</th>
                                        <th style={{ left: '18px', width: '42px', minWidth: '42px' }} className="p-0 text-left sticky bg-[#f8fafc] dark:bg-[#1e1f21] z-30 border-r border-gray-100 dark:border-white/5 text-[7px] font-bold pl-1">รหัส</th>
                                        <th style={{ left: '60px', width: '70px', minWidth: '70px' }} className="p-0 sticky bg-[#f8fafc] dark:bg-[#1e1f21] z-30 border-r border-gray-200 dark:border-white/5 shadow-[1px_0_2px_-1px_rgba(0,0,0,0.1)] text-[8px] font-bold text-center">ชื่อ</th>
                                        {dates.map(date => {
                                            const meta = dateMetadata[date];
                                            const displayDate = meta?.displayDate || date;
                                            const [dayNum, monthNum, yearNum] = displayDate.split('-');
                                            const dayIndex = new Date(parseInt(yearNum), parseInt(monthNum) - 1, parseInt(dayNum)).getDay();
                                            const dayName = (['อา', 'จ', 'อ', 'พ', 'พฤ', 'ศ', 'ส'])[dayIndex];
                                            const isWeekend = dayIndex === 0 || dayIndex === 6;
                                            const periodNum = meta?.periodNumber;

                                            const isCheckable = meta?.isCheckable;
                                            const isRelevant = meta?.isRelevant;
                                            const reason = meta?.reason;
                                            const isTeachingDate = Boolean(isCheckable && (isRelevant || periodNum !== undefined));
                                            const checkProgress = getDateCheckProgress(date);
                                            const progressColorClass = 'bg-emerald-400';

                                            // Determine Header Style
                                            let bgClass = 'bg-white dark:bg-gray-900';
                                            let textClass = 'text-gray-400 dark:text-gray-500';

                                            if (!isCheckable) {
                                                if (reason === 'weekend') bgClass = 'bg-gray-50 dark:bg-gray-800/50';
                                                else if (reason === 'holiday' || reason === 'special_holiday') bgClass = 'bg-rose-50/50 dark:bg-rose-900/10';
                                                else if (reason === 'term_break') bgClass = 'bg-gray-100 dark:bg-gray-800';
                                                else if (reason === 'not_scheduled') bgClass = 'bg-gray-50/20 dark:bg-gray-800/10';
                                            } else if (isTeachingDate) {
                                                bgClass = 'bg-white dark:bg-gray-900';
                                                textClass = 'text-gray-600 dark:text-gray-300';
                                            } else if (reason === 'schoolDay') {
                                                bgClass = 'bg-indigo-50/50 dark:bg-indigo-900/10';
                                                textClass = 'text-indigo-500';
                                            }

                                            // If it's a school day but subject is NOT taught, make it dimmer
                                            const opacityClass = (isCheckable && !isTeachingDate) ? 'opacity-30 grayscale' : '';

                                            // Tooltip Content Resolution
                                            const event = calendarEvents[yearNum + '-' + monthNum + '-' + dayNum];
                                            const scheduleLabel = event?.scheduleDay ? ` (ตาราง${THAI_DAY_NAMES[Object.values(DAY_KEY_MAP).indexOf(event.scheduleDay)]})` : '';

                                            const tooltipText = meta?.description ? `${meta.description}${scheduleLabel}` : (
                                                reason === 'schoolDay' ? `สอนชดเชย${scheduleLabel}` :
                                                    reason === 'holiday' ? 'วันหยุด' :
                                                        reason === 'special_holiday' ? 'วันหยุดกรณีพิเศษ' :
                                                            reason === 'weekend' ? 'วันเสาร์-อาทิตย์' :
                                                                reason === 'term_break' ? 'อยู่นอกภาคเรียน' :
                                                                    reason === 'historical_locked' ? 'อยู่นอกช่วงเวลาที่อนุญาตให้เช็คชื่อย้อนหลัง' :
                                                                        reason === 'not_scheduled' ? 'ยังไม่ได้เช็คชื่อ' :
                                                                            ''
                                            );

                                            const fullTooltip = tooltipText + (meta?.periodCount ? (tooltipText ? ` (สอน ${meta.periodCount} คาบ)` : `สอน ${meta.periodCount} คาบ`) : '');

                                            const isColumnSelected = students.length > 0 && students.every(s => selectedCells.has(`${s.id}:${date}`));

                                            return (
                                                <th
                                                    key={date}
                                                    onClick={() => handleColumnSelect(date)}
                                                    className={`
                                                        group relative p-0 text-center min-w-[22px] w-[22px] border-r border-gray-200 dark:border-gray-600/50 last:border-r-0 
                                                        transition-all cursor-pointer select-none
                                                        ${bgClass} hover:bg-opacity-90
                                                        ${opacityClass}
                                                        ${isColumnSelected ? 'ring-2 ring-indigo-500 z-10' : ''}
                                                    `}
                                                >
                                                    <div className={`flex flex-col items-center justify-center h-full ${textClass} scale-90 pt-1 pb-1.5`}>
                                                        <span className="text-[7px] opacity-70 leading-none">{dayName}</span>
                                                        <span className={`text-[11px] font-black leading-none ${isTeachingDate ? 'text-gray-900 dark:text-white' : ''}`}>{dayNum}</span>
                                                        {periodNum !== undefined && (
                                                            <span className={`text-[7px] font-black mt-0.5 leading-none ${isTeachingDate ? 'text-emerald-500 dark:text-emerald-300' : 'text-indigo-500'}`}>P{periodNum}</span>
                                                        )}
                                                        {!isTeachingDate && isCheckable && <div className="w-1 h-1 bg-gray-300 dark:bg-gray-600 rounded-full mt-0.5"></div>}
                                                    </div>

                                                    {isTeachingDate && (
                                                        <div
                                                            className="absolute top-1 right-1 h-1.5 w-1.5 rounded-full bg-emerald-400 ring-1 ring-white dark:ring-gray-900 shadow-sm"
                                                            title="วันที่สอน"
                                                        />
                                                    )}

                                                    {isCheckable && (
                                                        <div
                                                            className="absolute bottom-1 left-1/2 h-1 w-3.5 -translate-x-1/2 overflow-hidden rounded-full bg-emerald-500/25 ring-1 ring-emerald-300/40"
                                                            title={`เช็คแล้ว ${checkProgress.checked}/${checkProgress.total} คน`}
                                                        >
                                                            <div
                                                                className={`h-full rounded-full transition-all duration-300 ${progressColorClass}`}
                                                                style={{ width: `${isTeachingDate ? Math.max(checkProgress.percent, 18) : checkProgress.percent}%` }}
                                                            />
                                                        </div>
                                                    )}

                                                    {/* Selection Indicator */}
                                                    {isColumnSelected && <div className="absolute inset-0 rounded-[2px] ring-2 ring-indigo-500 pointer-events-none"></div>}

                                                    {/* Custom Tooltip on Hover */}
                                                    {fullTooltip && (
                                                        <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-2 py-1 bg-gray-800 dark:bg-gray-700 text-white text-[10px] rounded shadow-lg opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none whitespace-nowrap z-50 border border-gray-600">
                                                            {fullTooltip}
                                                            <div className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-gray-800 dark:border-t-gray-700"></div>
                                                        </div>
                                                    )}
                                                </th>
                                            );
                                        })}
                                        <th className="p-0 text-center bg-emerald-50/50 dark:bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 min-w-[22px] w-[22px] border-l border-gray-100 dark:border-gray-700 text-[7px] font-black uppercase tracking-tighter">มา</th>
                                        <th className="p-0 text-center bg-amber-50/50 dark:bg-amber-500/10 text-amber-600 dark:text-amber-400 min-w-[22px] w-[22px] text-[7px] font-black uppercase tracking-tighter">สาย</th>
                                        <th className="p-0 text-center bg-sky-50/50 dark:bg-sky-500/10 text-sky-600 dark:text-sky-400 min-w-[22px] w-[22px] text-[7px] font-black uppercase tracking-tighter">ลา</th>
                                        <th className="p-0 text-center bg-rose-50/50 dark:bg-rose-500/10 text-rose-600 dark:text-rose-400 min-w-[22px] w-[22px] text-[7px] font-black uppercase tracking-tighter">ขาด</th>
                                        <th className="p-0 text-center bg-orange-50/50 dark:bg-orange-500/10 text-orange-600 dark:text-orange-400 min-w-[22px] w-[22px] text-[7px] font-black uppercase tracking-tighter">หนี</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-100 dark:divide-gray-700/50">
                                    {students.length === 0 ? (
                                        <tr>
                                            <td colSpan={dates.length + 8} className="p-20 text-center text-gray-400">
                                                {loading ? (
                                                    <div className="flex flex-col items-center gap-2 w-full max-w-md mx-auto">
                                                        {[...Array(6)].map((_, i) => (
                                                            <div key={`skeleton-${i}`} className="h-4 w-full rounded bg-gray-200 dark:bg-gray-700 animate-pulse"></div>
                                                        ))}
                                                    </div>
                                                ) : (
                                                    <div className="flex flex-col items-center justify-center gap-3 opacity-60">
                                                        <div className="w-16 h-16 bg-gray-100 dark:bg-gray-700 rounded-full flex items-center justify-center text-gray-400">
                                                            <Search size={24} />
                                                        </div>
                                                        <span>ไม่พบข้อมูล</span>
                                                    </div>
                                                )}
                                            </td>
                                        </tr>
                                    ) : (
                                        students.map((student, idx) => {
                                            const stats = { present: 0, late: 0, leave: 0, absent: 0, escape: 0 };
                                            dates.forEach(d => {
                                                const s = attendanceData[student.id]?.[d];
                                                if (s === 'present') stats.present++;
                                                else if (s === 'late') stats.late++;
                                                else if (s === 'leave') stats.leave++;
                                                else if (s === 'absent') stats.absent++;
                                                else if (s === 'escape') stats.escape++;
                                            });

                                            return (
                                                <tr key={student.id} className="group hover:bg-slate-50 dark:hover:bg-white/5 transition-colors">
                                                    <td style={{ left: 0, width: '18px', minWidth: '18px' }} className="p-0 sticky bg-white dark:bg-[#1a1b1e] group-hover:bg-indigo-50/30 dark:group-hover:bg-indigo-500/5 z-10 border-r border-gray-100 dark:border-white/5 text-center text-gray-500 dark:text-gray-400 text-[8px] font-medium font-mono transition-colors">
                                                        {student.number}
                                                    </td>
                                                    <td style={{ left: '18px', width: '42px', minWidth: '42px' }} className="p-0 sticky bg-white dark:bg-[#1a1b1e] group-hover:bg-indigo-50/30 dark:group-hover:bg-indigo-500/5 z-10 border-r border-gray-100 dark:border-white/5 text-gray-700 dark:text-gray-300 truncate text-[7px] font-mono pl-1 transition-colors">
                                                        {student.studentNumber}
                                                    </td>
                                                    <td style={{ left: '60px', width: '70px', minWidth: '70px' }} className="p-0 sticky bg-white dark:bg-[#1a1b1e] group-hover:bg-indigo-50/30 dark:group-hover:bg-indigo-500/5 z-10 border-r border-gray-100 dark:border-white/5 shadow-[1px_0_2px_-1px_rgba(0,0,0,0.1)] transition-colors">
                                                        <div className="flex items-center h-full px-1">
                                                            <div className="min-w-0">
                                                                <div className="font-bold text-gray-900 dark:text-white truncate leading-none text-[8px]" title={`${student.prefix}${student.firstName} ${student.lastName}`}>
                                                                    {student.prefix}{student.firstName} {student.lastName}
                                                                </div>
                                                            </div>
                                                        </div>
                                                    </td>
                                                    {dates.map(date => {
                                                        const meta = dateMetadata[date];
                                                        const isCheckable = meta?.isCheckable ?? true;
                                                        const reason = meta?.reason;

                                                        const rawTooltip = (meta?.description || (
                                                            reason === 'schoolDay' ? 'วันสอนชดเชย' :
                                                                reason === 'holiday' ? 'วันหยุด' :
                                                                    reason === 'special_holiday' ? 'วันหยุดกรณีพิเศษ' :
                                                                        reason === 'weekend' ? 'วันเสาร์-อาทิตย์' :
                                                                            reason === 'term_break' ? 'อยู่นอกภาคเรียน' :
                                                                                reason === 'historical_locked' ? 'อยู่นอกช่วงเวลาที่อนุญาตให้เช็คชื่อย้อนหลัง' :
                                                                                    reason === 'not_scheduled' ? 'ยังไม่ได้เช็คชื่อ' :
                                                                                        ''
                                                        ));
                                                        const tooltipText = rawTooltip + (meta?.periodCount ? (rawTooltip ? ` (สอน ${meta.periodCount} คาบ)` : `สอน ${meta.periodCount} คาบ`) : '');

                                                        const isSelected = selectedCells.has(`${student.id}:${date}`);

                                                        return (
                                                            <td
                                                                key={date}
                                                                onClick={() => handleCellClick(student.id, date)}
                                                                className={`
                                                                    p-0 text-center border-r border-gray-100 dark:border-gray-800/50 last:border-r-0 select-none transition-all duration-75 min-w-[22px] w-[22px]
                                                                    ${isCheckable ? 'cursor-pointer hover:bg-slate-100/50 dark:hover:bg-slate-800/50' : 'cursor-not-allowed bg-gray-50/30 dark:bg-gray-800/20'}
                                                                    ${isSelected ? 'bg-indigo-100/30 dark:bg-indigo-900/30 ring-inset ring-1 ring-indigo-500/50 z-10' : ''}
                                                                `}
                                                            >
                                                                {getStatusBadge(student.id, date, attendanceData[student.id]?.[date], isCheckable, tooltipText, reason)}
                                                            </td>
                                                        );
                                                    })}
                                                    <td className="p-0 text-center bg-emerald-50/20 dark:bg-emerald-900/5 text-emerald-600 dark:text-emerald-400 font-black border-l border-gray-100 dark:border-gray-800 text-[8px] w-[22px]">{stats.present}</td>
                                                    <td className="p-0 text-center bg-amber-50/20 dark:bg-amber-900/5 text-amber-600 dark:text-amber-400 font-black text-[8px] w-[22px]">{stats.late}</td>
                                                    <td className="p-0 text-center bg-sky-50/20 dark:bg-sky-900/5 text-sky-600 dark:text-sky-400 font-black text-[8px] w-[22px]">{stats.leave}</td>
                                                    <td className="p-0 text-center bg-rose-50/20 dark:bg-rose-900/5 text-rose-600 dark:text-rose-400 font-black text-[8px] w-[22px]">{stats.absent}</td>
                                                    <td className="p-0 text-center bg-orange-50/20 dark:bg-orange-900/5 text-orange-600 dark:text-orange-400 font-black text-[8px] w-[22px]">{stats.escape}</td>
                                                </tr>
                                            );
                                        })
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>

                {/* Floating Action Toolbar */}
                <div className={`fixed bottom-6 left-1/2 -translate-x-1/2 bg-white dark:bg-gray-800 p-2 md:p-3 rounded-2xl shadow-2xl border border-gray-200 dark:border-gray-700 flex items-center gap-2 md:gap-4 transition-all duration-500 z-50 ${selectedCells.size > 0 || activeStatus ? 'translate-y-0 opacity-100' : 'translate-y-[150%] opacity-0'}`}>
                    <div className="flex items-center gap-2 pr-4 border-r border-gray-200 dark:border-gray-700">
                        <div className="bg-indigo-100 dark:bg-indigo-900/50 text-indigo-600 dark:text-indigo-400 font-bold px-3 py-1 rounded-lg text-sm min-w-[32px] text-center">
                            {selectedCells.size}
                        </div>
                        <div className="flex flex-col">
                            <span className="text-[10px] font-bold text-gray-400 uppercase tracking-tighter leading-none">รายการที่เลือก</span>
                            {activeStatus && (
                                <span className="text-[9px] text-indigo-500 font-bold animate-pulse">โหมดคลิกเพื่อเช็ค</span>
                            )}
                        </div>
                    </div>

                    <div className="flex items-center gap-1 md:gap-2">
                        {[
                            { id: 'present', label: 'มา', char: '/', color: 'bg-green-500', hover: 'hover:bg-green-50 dark:hover:bg-green-900/20', text: 'text-green-600' },
                            { id: 'late', label: 'สาย', char: 'ส', color: 'bg-yellow-500', hover: 'hover:bg-yellow-50 dark:hover:bg-yellow-900/20', text: 'text-yellow-600' },
                            { id: 'leave', label: 'ลา', char: 'ล', color: 'bg-blue-500', hover: 'hover:bg-blue-50 dark:hover:bg-blue-900/20', text: 'text-blue-600' },
                            { id: 'absent', label: 'ขาด', char: 'ข', color: 'bg-red-500', hover: 'hover:bg-red-50 dark:hover:bg-red-900/20', text: 'text-red-600' },
                            { id: 'escape', label: 'หนีเรียน', char: 'น', color: 'bg-orange-500', hover: 'hover:bg-orange-50 dark:hover:bg-orange-900/20', text: 'text-orange-600' },
                        ].map((btn) => (
                            <button
                                key={btn.id}
                                onClick={() => handleBulkStatusUpdate(btn.id)}
                                className={`flex flex-col items-center gap-1 p-2 rounded-lg transition-all duration-200 ${btn.text} ${activeStatus === btn.id ? 'bg-indigo-50 dark:bg-indigo-900/40 ring-2 ring-indigo-500 ring-offset-2 dark:ring-offset-gray-800 scale-110 shadow-lg' : btn.hover}`}
                                title={btn.label}
                            >
                                <div className={`w-6 h-6 rounded-full ${btn.color} text-white flex items-center justify-center shadow-sm font-bold text-xs`}>{btn.char}</div>
                                <span className="text-[10px] font-bold">{btn.label}</span>
                            </button>
                        ))}

                        <div className="w-px h-8 bg-gray-200 dark:bg-gray-700 mx-1"></div>

                        <button
                            onClick={() => handleBulkStatusUpdate('clear')}
                            className={`flex flex-col items-center gap-1 p-2 rounded-lg transition-all duration-200 text-gray-500 ${activeStatus === 'clear' ? 'bg-gray-100 dark:bg-gray-700 ring-2 ring-gray-400 scale-110 shadow-lg' : 'hover:bg-gray-100 dark:hover:bg-gray-700'}`}
                            title="ล้าง"
                        >
                            <div className="w-6 h-6 rounded-full border-2 border-gray-300 text-gray-300 flex items-center justify-center shadow-sm font-bold text-xs"><X size={14} /></div>
                            <span className="text-[10px] font-bold">ล้าง</span>
                        </button>
                    </div>

                    <div className="pl-2 border-l border-gray-200 dark:border-gray-700 flex items-center gap-1">
                        <button
                            onClick={() => {
                                setSelectedCells(new Set());
                                setActiveStatus(null);
                            }}
                            className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg text-gray-500 transition-colors"
                            title="ปิด"
                        >
                            <X size={20} />
                        </button>
                    </div>
                </div>
            </div>
        </MainLayout>
    );
};

export default HistoricalClassroomAttendancePage;
