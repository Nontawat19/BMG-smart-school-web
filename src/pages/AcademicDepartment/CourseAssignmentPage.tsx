import React, { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { firestore as db } from "../../firebase";
import { motion, AnimatePresence } from "framer-motion";
import { collection, query, doc, onSnapshot, updateDoc, where, orderBy, getDoc, getDocs, setDoc, writeBatch } from "firebase/firestore";
import { useSelector, useDispatch } from "react-redux";
import { RootState } from "../../store";
import { fetchCalendar } from "@/store/slices/calendarSlice";
import { getCurrentThaiYear } from "@/utils/dateUtils";
import MainLayout from "@/layouts/MainLayout";
import {
    Users,
    MapPin,
    BookOpen,
    ChevronLeft,
    ChevronDown,
    Search,
    Check,
    Plus,
    X,
    User,
    School,
    Save,
    Trash2,
    Loader2,
    RefreshCw,
    LayoutGrid,
    ChevronRight,
    Building2,
    Monitor,
    Calendar,
    Filter,
    ChevronsLeft,
    ChevronsRight,
    Database
} from "lucide-react";
import Swal from "sweetalert2";
import Select from "react-select";
import { compareTeachersByGroupAndId, getActiveSortedTeachers } from "@/utils/teacherSortUtils";
import BackButton from "@/components/Shared/BackButton";
import { isActivityCourse, isClubCourse } from "./schedule/utils";
import { useActivityHubSettings } from "@/hooks/useActivityHubSettings";

// --- Types ---
interface GroupAssignment {
    groupNumber: number;
    room?: string;
    teacherId: string;
    teacherIds?: string[];
    teacherHours?: Record<string, number>;
    teacherPeriods?: Record<string, { start: number; end: number }>;
    roomIds: string[];
    classLevels?: string[];
}

type CourseClassId = string | string[];

interface Course {
    id: string;
    title: string;
    code: string;
    classId?: CourseClassId;
    credits?: number | string;
    hoursPerWeek?: number;
    semester?: number | string;
    type?: string; // พื้นฐาน, เพิ่มเติม, ชุมนุม, กิจกรรม
    subjectGroup?: string; // กลุ่มสาระการเรียนรู้
    teacherAssignments?: GroupAssignment[];
    isActive?: boolean;
    isElective?: boolean;
}

interface Teacher {
    id: string;
    teacherId?: string;
    name: string;
    email?: string;
    role?: string;
    subjectGroup?: string;
    status?: string;
}

const WEEKS_PER_SEMESTER = 20;
const ACTIVITY_CREDITS = 0.5; // กิจกรรมพัฒนาผู้เรียนนับ 0.5 หน่วยกิต = 1 คาบ/สัปดาห์

const getAssignmentTeacherIds = (assignment: Partial<GroupAssignment> | any): string[] => {
    const ids = Array.isArray(assignment?.teacherIds) && assignment.teacherIds.length > 0
        ? assignment.teacherIds
        : (assignment?.teacherId ? [assignment.teacherId] : []);
    return Array.from(new Set(ids.filter((id: string) => id && id !== 'pending' && !String(id).startsWith('GHOST'))));
};

const matchesCourseCategory = (course: Partial<Pick<Course, 'type' | 'isElective' | 'title'>> | null, category: string) => {
    if (!course) return false;
    if (category === "ประเภท" || category === "ทั้งหมด") return true;
    if (category === "วิชาเลือกเสรี") return course.isElective === true;

    const rawType = String(course.type || "").trim().toLowerCase();
    if (!rawType) return false;

    if (category === "ชุมนุม") return isClubCourse(course);
    if (category === "กิจกรรม") return rawType.includes("กิจกรรม");
    if (category === "พื้นฐาน") return rawType.includes("พื้นฐาน");
    if (category === "เพิ่มเติม") return rawType.includes("เพิ่มเติม");

    return rawType === category.trim().toLowerCase();
};

// ไม่มีวิชาใดในตารางสอนจริงที่ควรมีคาบ/สัปดาห์เกินค่านี้ (สัปดาห์หนึ่งมีคาบรวมทุกวิชาราว 35-40 คาบ)
// ใช้ดักข้อมูล credits ที่กรอกผิดหน่วย (เช่น กรอก "20" ทั้งที่หมายถึงชั่วโมง/ภาคเรียน ไม่ใช่หน่วยกิต)
const MAX_REASONABLE_WEEKLY_PERIODS = 10;

// ใช้ credits/hoursPerWeek ที่ตั้งไว้จริงก่อนเสมอ ไม่ว่าจะเป็นวิชาปกติหรือกิจกรรม
// จะ fallback เป็นค่ามาตรฐานกิจกรรม (0.5 หน่วยกิต = 1 คาบ/สัปดาห์) เฉพาะตอนที่ยังไม่ได้ตั้งค่าใดๆ ไว้เท่านั้น
const resolveWeeklyPeriodsFromCourse = (course: Partial<Course>): number => {
    const creditsNum = Number(course.credits || 0);
    if (creditsNum > 0 && creditsNum * 2 <= MAX_REASONABLE_WEEKLY_PERIODS) return creditsNum * 2;

    const hoursPerWeekNum = Number(course.hoursPerWeek || 0);
    if (hoursPerWeekNum > 0 && hoursPerWeekNum <= MAX_REASONABLE_WEEKLY_PERIODS) return hoursPerWeekNum;

    if (isActivityCourse(course)) return ACTIVITY_CREDITS * 2;

    // credits ผิดปกติแต่ไม่มี hoursPerWeek สำรอง: ใช้ credits ต่อแม้จะเกินเกณฑ์ ดีกว่าได้ 0 คาบ
    if (creditsNum > 0) return creditsNum * 2;
    return hoursPerWeekNum;
};

const getCourseTeachingHours = (course?: Partial<Course> | null) => {
    if (!course) return 0;
    const weeklyPeriods = resolveWeeklyPeriodsFromCourse(course);
    return Math.max(0, Math.round(weeklyPeriods * WEEKS_PER_SEMESTER));
};

const getCourseWeeklyTeachingPeriods = (course?: Partial<Course> | null) => {
    if (!course) return 0;
    const weeklyPeriods = resolveWeeklyPeriodsFromCourse(course);
    return Math.max(0, Number.isFinite(weeklyPeriods) ? weeklyPeriods : 0);
};

const formatWeeklyLoad = (load: number) => {
    if (!Number.isFinite(load)) return '0';
    const rounded = Math.round(load * 10) / 10;
    return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
};

const distributeTeacherHours = (teacherIds: string[], totalHours: number) => {
    if (teacherIds.length === 0 || totalHours <= 0) return {};
    const base = Math.floor(totalHours / teacherIds.length);
    const remainder = totalHours % teacherIds.length;

    return teacherIds.reduce((acc, id, index) => {
        acc[id] = base + (index < remainder ? 1 : 0);
        return acc;
    }, {} as Record<string, number>);
};

const resolveTeacherHours = (
    assignment: Partial<GroupAssignment> | any,
    course?: Partial<Course> | null
) => {
    const teacherIds = getAssignmentTeacherIds(assignment);
    const totalHours = getCourseTeachingHours(course);
    const periodRanges = assignment?.teacherPeriods && typeof assignment.teacherPeriods === 'object'
        ? assignment.teacherPeriods
        : {};
    if (Object.keys(periodRanges).length > 0) {
        return teacherIds.reduce((acc, id) => {
            const range = periodRanges[id];
            const start = Number(range?.start);
            const end = Number(range?.end);
            if (Number.isFinite(start) && Number.isFinite(end) && start > 0 && end >= start) {
                acc[id] = end - start + 1;
            }
            return acc;
        }, {} as Record<string, number>);
    }

    const savedHours = assignment?.teacherHours && typeof assignment.teacherHours === 'object'
        ? assignment.teacherHours
        : {};

    if (teacherIds.length >= 2 && Object.keys(savedHours).length === 0 && totalHours > 0) {
        return distributeTeacherHours(teacherIds, totalHours);
    }

    return teacherIds.reduce((acc, id) => {
        const value = Number(savedHours[id]);
        if (Number.isFinite(value) && value >= 0) acc[id] = value;
        return acc;
    }, {} as Record<string, number>);
};

const resolveTeacherPeriodRanges = (
    assignment: Partial<GroupAssignment> | any,
    course?: Partial<Course> | null
) => {
    const teacherIds = getAssignmentTeacherIds(assignment);
    const totalHours = Math.max(0, getCourseTeachingHours(course));
    const savedRanges = assignment?.teacherPeriods && typeof assignment.teacherPeriods === 'object'
        ? assignment.teacherPeriods
        : {};

    const validSaved = teacherIds.reduce((acc, id) => {
        const range = savedRanges[id];
        const start = Number(range?.start);
        const end = Number(range?.end);
        if (Number.isFinite(start) && Number.isFinite(end) && start > 0 && end >= start) {
            acc[id] = { start, end };
        }
        return acc;
    }, {} as Record<string, { start: number; end: number }>);

    if (Object.keys(validSaved).length === teacherIds.length) return validSaved;

    const teacherHours = resolveTeacherHours(assignment, course);
    let cursor = 1;
    return teacherIds.reduce((acc, id, index) => {
        const fallbackHours = teacherIds.length >= 2 && totalHours > 0
            ? distributeTeacherHours(teacherIds, totalHours)[id]
            : Number(teacherHours[id] || 0);
        const hours = Math.max(1, Math.round(Number(teacherHours[id] || fallbackHours || 1)));
        const start = cursor;
        const end = Math.min(totalHours || start + hours - 1, start + hours - 1);
        acc[id] = { start, end };
        cursor = end + 1;
        return acc;
    }, {} as Record<string, { start: number; end: number }>);
};

const escapeHtml = (value: string | number | undefined) => String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");

const removeUndefinedFields = <T,>(value: T): T => {
    if (Array.isArray(value)) {
        return value.map(item => removeUndefinedFields(item)) as T;
    }

    if (value && typeof value === 'object') {
        return Object.entries(value as Record<string, any>).reduce((acc, [key, item]) => {
            if (item !== undefined) {
                acc[key] = removeUndefinedFields(item);
            }
            return acc;
        }, {} as Record<string, any>) as T;
    }

    return value;
};

interface Room {
    id: string;
    roomName: string;
    roomCode: string;
    roomType?: string;
    building?: string;
    floor?: string;
    capacity?: number;
    isActive?: boolean;
}

// --- Components ---

// Premium Dark mode styles for react-select (Same as other pages)
const headerSelectStyles = {
    control: (base: any, state: any) => ({
        ...base,
        backgroundColor: 'transparent',
        borderColor: 'transparent',
        boxShadow: 'none',
        borderRadius: '0.5rem',
        padding: '0',
        fontSize: '14px',
        minHeight: '32px',
        height: '32px',
        '&:hover': {
            borderColor: 'transparent'
        },
        cursor: 'pointer'
    }),
    valueContainer: (base: any) => ({
        ...base,
        padding: '0 4px',
        height: '32px',
    }),
    menu: (base: any) => ({
        ...base,
        backgroundColor: 'var(--select-menu-bg, #ffffff)',
        borderRadius: '1rem',
        boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.1), 0 8px 10px -6px rgba(0, 0, 0, 0.1)',
        padding: '8px',
        border: '1px solid var(--select-border, #f3f4f6)',
        width: 'max-content',
        minWidth: '150px',
        zIndex: 99999
    }),
    menuPortal: (base: any) => ({ ...base, zIndex: 99999 }),
    option: (base: any, state: any) => ({
        ...base,
        backgroundColor: state.isSelected
            ? '#6366f1'
            : state.isFocused
                ? 'rgba(99, 102, 241, 0.1)'
                : 'transparent',
        color: state.isSelected ? '#ffffff' : 'var(--select-text, #1f2937)',
        borderRadius: '0.5rem',
        margin: '2px 0',
        cursor: 'pointer',
        fontSize: '12px',
        fontWeight: state.isSelected ? '700' : '500',
        whiteSpace: 'nowrap',
        '&:active': {
            backgroundColor: '#6366f1'
        }
    }),
    singleValue: (base: any) => ({ 
        ...base, 
        color: 'var(--select-text, #1f2937)', 
        fontWeight: '900',
        fontSize: '14px',
        whiteSpace: 'nowrap'
    }),
    menuList: (base: any) => ({
        ...base,
        maxHeight: '600px', 
        padding: '4px'
    }),
    indicatorsContainer: (base: any) => ({
        ...base,
        height: '32px',
    }),
    dropdownIndicator: (base: any) => ({
        ...base,
        padding: '0 2px',
        color: '#94a3b8'
    }),
    placeholder: (base: any) => ({
        ...base,
        color: '#94a3b8'
    }),
    input: (base: any) => ({
        ...base,
        color: 'var(--select-text, #1f2937)'
    }),
    indicatorSeparator: () => ({ display: 'none' })
};

// Compact style for course panel filters
const filterSelectStyles = {
    control: (base: any, state: any) => ({
        ...base,
        backgroundColor: 'var(--select-bg, #ffffff)',
        borderColor: state.isFocused ? '#6366f1' : 'var(--select-border, #e2e8f0)',
        boxShadow: state.isFocused ? '0 0 0 2px rgba(99, 102, 241, 0.1)' : 'none',
        borderRadius: '0.75rem',
        padding: '0',
        fontSize: '13px',
        minHeight: '34px',
        height: '34px',
        '&:hover': {
            borderColor: '#6366f1'
        },
        cursor: 'pointer'
    }),
    valueContainer: (base: any) => ({
        ...base,
        padding: '0 8px',
        height: '34px',
    }),
    menu: (base: any) => ({
        ...base,
        backgroundColor: 'var(--select-menu-bg, #ffffff)',
        borderRadius: '1rem',
        boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.1), 0 8px 10px -6px rgba(0, 0, 0, 0.1)',
        padding: '8px',
        border: '1px solid var(--select-border, #f3f4f6)',
        width: 'max-content',
        minWidth: '150px',
        zIndex: 99999
    }),
    menuPortal: (base: any) => ({ ...base, zIndex: 99999 }),
    option: (base: any, state: any) => ({
        ...base,
        backgroundColor: state.isSelected 
            ? '#6366f1' 
            : state.isFocused 
                ? 'rgba(99, 102, 241, 0.1)' 
                : 'transparent',
        color: state.isSelected ? '#ffffff' : 'var(--select-text, #475569)',
        borderRadius: '0.5rem',
        margin: '2px 0',
        cursor: 'pointer',
        fontSize: '11px',
        fontWeight: state.isSelected ? '700' : '500',
        whiteSpace: 'nowrap',
        '&:active': {
            backgroundColor: '#6366f1'
        }
    }),
    singleValue: (base: any) => ({ 
        ...base, 
        color: 'var(--select-text, #1e293b)', 
        fontWeight: '700',
        fontSize: '11px',
        whiteSpace: 'nowrap'
    }),
    menuList: (base: any) => ({
        ...base,
        maxHeight: '400px', 
        padding: '4px'
    }),
    indicatorsContainer: (base: any) => ({
        ...base,
        height: '34px',
    }),
    dropdownIndicator: (base: any) => ({
        ...base,
        padding: '0 4px',
        color: '#94a3b8'
    }),
    placeholder: (base: any) => ({
        ...base,
        color: '#94a3b8'
    }),
    input: (base: any) => ({
        ...base,
        color: 'var(--select-text, #1e293b)'
    }),
    indicatorSeparator: () => ({ display: 'none' })
};

const PanelHeader = ({ title, icon: Icon, count, compact = false, extra }: { title: string, icon: any, count?: number, compact?: boolean, extra?: React.ReactNode }) => (
    <div className={`flex items-center justify-between ${compact ? 'px-3 py-1.5' : 'px-4 py-2'} border-b border-slate-200 dark:border-white/5 bg-slate-50/50 dark:bg-white/[0.02]`}>
        <div className="flex items-center gap-2">
            <div className="flex items-center gap-2">
                <Icon size={14} className="text-indigo-600 dark:text-indigo-400" />
                <h3 className={`font-bold text-slate-800 dark:text-white tracking-wide uppercase ${compact ? 'text-[9px]' : 'text-[11px]'}`}>{title}</h3>
            </div>
            {extra}
        </div>
        {count !== undefined && (
            <span className="text-[10px] font-black text-slate-400 dark:text-slate-500">({count})</span>
        )}
    </div>
);

const FloatingButton = ({ icon: Icon, color, onClick, label, disabled = false }: { icon: any, color: string, onClick: () => void, label?: string, disabled?: boolean }) => (
    <motion.button
        whileHover={disabled ? {} : { scale: 1.1, x: 2 }}
        whileTap={disabled ? {} : { scale: 0.9 }}
        onClick={disabled ? undefined : onClick}
        title={label}
        className={`w-9 h-9 ${color} text-white rounded-xl flex items-center justify-center shadow-lg transition-all border border-white/10 ${disabled ? 'opacity-30 cursor-not-allowed' : 'cursor-pointer hover:shadow-xl hover:-translate-y-0.5'}`}
    >
        <Icon size={18} strokeWidth={2.5} />
    </motion.button>
);

const ITEMS_PER_PAGE = 500; // Increased to show virtually all items in a single scrollable view as requested

// Pagination removed in favor of single scrollable list as requested by user
const Pagination = ({ currentPage, totalPages, onPageChange }: { currentPage: number, totalPages: number, onPageChange: (p: number) => void }) => {
    return null;
};

const getSwalBg = () => document.documentElement.classList.contains('dark') ? '#161a27' : '#ffffff';
const getSwalColor = () => document.documentElement.classList.contains('dark') ? '#f8fafc' : '#0f172a';
const getSwalPeriodStyles = () => {
    const d = document.documentElement.classList.contains('dark');
    return `<style>
        .teacher-hour-split { text-align: left; display: grid; gap: 12px; margin-top: 12px; }
        .teacher-hour-total { padding: 10px 12px; border-radius: 12px; background: ${d ? '#1e3a5f' : '#eef2ff'}; color: ${d ? '#a5b4fc' : '#3730a3'}; font-size: 14px; font-weight: 800; }
        .teacher-hour-row { display: grid; grid-template-columns: minmax(0, 1fr) 180px; gap: 12px; align-items: center; }
        .teacher-hour-row > span { color: ${d ? '#f1f5f9' : '#334155'}; font-size: 14px; font-weight: 800; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .teacher-period-inputs { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
        .teacher-period-inputs label { display: grid; gap: 4px; }
        .teacher-period-inputs small { color: ${d ? '#94a3b8' : '#64748b'}; font-size: 10px; font-weight: 900; text-align: center; }
        .teacher-period-inputs select { width: 100%; border: 1px solid ${d ? '#475569' : '#cbd5e1'}; border-radius: 10px; padding: 8px 10px; font-size: 15px; font-weight: 900; text-align: center; color: ${d ? '#ffffff' : '#0f172a'}; background: ${d ? '#1e293b' : 'white'}; }
        .teacher-period-inputs select:focus { outline: none; border-color: #6366f1; box-shadow: 0 0 0 3px rgba(99, 102, 241, 0.16); }
        .teacher-hour-note { color: ${d ? '#94a3b8' : '#64748b'}; font-size: 12px; font-weight: 700; margin: 0; }
    </style>`;
};

const CourseAssignmentPage: React.FC = () => {
    const dispatch = useDispatch();
    const navigate = useNavigate();
    const { availableClassOptions, classKeys } = useSelector((state: RootState) => state.schoolSettings);
    const { schoolId: urlSchoolId } = useParams<{ schoolId?: string }>();
    const currentUser = useSelector((state: RootState) => state.auth.user);
    const schoolId = urlSchoolId || (currentUser as any)?.schoolId;

    // Data States
    const [courses, setCourses] = useState<Course[]>([]);
    const [activityCoursesWithPeriod, setActivityCoursesWithPeriod] = useState<Set<string>>(new Set());
    // A school that hasn't chosen an activityMode yet defaults to 'special-period' here,
    // matching the convention most other consumers of this setting use (this file used to
    // default to 'course-based' instead, which disagreed with every other page and made the
    // same "กิจกรรม" courses assignable here but hidden on CourseAssignmentPage2 for any
    // school that had never visited /academic/activity-settings).
    const { activityMode: rawActivityMode, clubMode } = useActivityHubSettings(schoolId);
    const activityMode = rawActivityMode ?? 'special-period';
    const [rooms, setRooms] = useState<Room[]>([]);
    const [subjectGroupsList, setSubjectGroupsList] = useState<{id: string, name: string, code: string}[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isSaving, setIsSaving] = useState(false);
    const autoSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const saveInFlightRef = useRef(false);

    // Selection States
    const [selectedCourses, setSelectedCourses] = useState<Course[]>([]);
    const [selectedTeacherIds, setSelectedTeacherIds] = useState<string[]>([]);
    const [selectedRoomId, setSelectedRoomId] = useState<string | null>(null);
    const [activeGroupNumbers, setActiveGroupNumbers] = useState<number[]>([1]);
    const [activeRoomNumber, setActiveRoomNumber] = useState<string>("");
    const [selectedAssignments, setSelectedAssignments] = useState<{ courseId: string, groupNumber: number, isPending?: boolean }[]>([]);
    const [pendingQueue, setPendingQueue] = useState<{ courseId: string, teacherId: string, teacherIds?: string[], teacherHours?: Record<string, number>, teacherPeriods?: Record<string, { start: number; end: number }>, roomIds: string[], groupNumber: number, room?: string, title: string, code: string, classId: any }[]>([]);

    // Auto-save draft to localStorage
    useEffect(() => {
        const savedDraft = localStorage.getItem(`assignment_draft_${schoolId}`);
        if (savedDraft) {
            try {
                const parsed = JSON.parse(savedDraft);
                if (Array.isArray(parsed) && parsed.length > 0) {
                    setPendingQueue(parsed);
                }
            } catch (e) {
                console.error("Failed to parse assignment draft", e);
            }
        }
    }, [schoolId]);

    useEffect(() => {
        if (pendingQueue.length > 0) {
            localStorage.setItem(`assignment_draft_${schoolId}`, JSON.stringify(pendingQueue));
        } else {
            localStorage.removeItem(`assignment_draft_${schoolId}`);
        }
    }, [pendingQueue, schoolId]);

    const academicYear = useSelector((state: RootState) => state.calendar.academicYear) || String(getCurrentThaiYear());
    const [selectedYear, setSelectedYear] = useState<string>(academicYear);
    const [selectedSemester, setSelectedSemester] = useState<string>("1");
    const [availableYears, setAvailableYears] = useState<string[]>([]);
    const [semesterAssignments, setSemesterAssignments] = useState<any[]>([]);
    const [everAssignedYearsByCourse, setEverAssignedYearsByCourse] = useState<Record<string, Set<string>>>({});

    // Search/Filter States
    const [courseSearch, setCourseSearch] = useState("");
    const [teacherSearch, setTeacherSearch] = useState("");
    const [roomSearch, setRoomSearch] = useState("");
    const [buildingFilter, setBuildingFilter] = useState("ทั้งหมด");
    const [categoryFilter, setCategoryFilter] = useState("ทั้งหมด");
    const [subjectGroupFilter, setSubjectGroupFilter] = useState("กลุ่มสาระทั้งหมด");
    const [teacherGroupFilter, setTeacherGroupFilter] = useState("ครูกลุ่มสาระ");
    const [showOnlyAssigned, setShowOnlyAssigned] = useState(false);
    // Opt-in only: courses are freshly (re-)assigned every academic year with no auto-copy from
    // the previous year, so a recurring course legitimately has zero assignment for the new year
    // until someone assigns it here. Hiding that by default would make it impossible to ever
    // assign it. This toggle only helps declutter the view of genuinely stale subjects on demand.
    const [hideStaleSubjects, setHideStaleSubjects] = useState(false);
    const [selectedLevel, setSelectedLevel] = useState("ทั้งหมด");
    const [schoolInfo, setSchoolInfo] = useState<any>(null);

    const getLevelLabel = (id: CourseClassId | undefined): string => {
        if (!id) return "";
        if (Array.isArray(id)) {
            return id.map(level => getLevelLabel(level)).filter(Boolean).join(", ");
        }

        // Normalize: if it's already Thai like 'ม.ต้น', return it. 
        // If it's English ID, map to Thai.
        const map: Record<string, string> = {
            k1: 'อนุบาล 1', k2: 'อนุบาล 2', k3: 'อนุบาล 3',
            p1: 'ป.1', p2: 'ป.2', p3: 'ป.3', p4: 'ป.4', p5: 'ป.5', p6: 'ป.6',
            m1: 'ม.1', m2: 'ม.2', m3: 'ม.3', m4: 'ม.4', m5: 'ม.5', m6: 'ม.6',
            junior_high: 'ม.ต้น', senior_high: 'ม.ปลาย',
            'ม.ต้น': 'ม.ต้น', 'ม.ปลาย': 'ม.ปลาย'
        };
        return map[id] || id;
    };

    // Pagination States
    const [coursePage, setCoursePage] = useState(1);
    const [teacherPage, setTeacherPage] = useState(1);
    const [roomPage, setRoomPage] = useState(1);
    const [assignmentPage, setAssignmentPage] = useState(1);

    const { teachers: teacherMap } = useSelector((state: RootState) => state.userMap);

    // Derived UI Props for Floating Buttons
    const assignButtonProps = useMemo(() => {
        const canAssign = selectedCourses.length > 0 && selectedTeacherIds.length > 0;
        return {
            color: canAssign ? 'bg-indigo-600' : 'bg-slate-400',
            label: selectedCourses.length > 0 ? `มอบหมายใหม่ ${selectedCourses.length} วิชา` : 'เลือกวิชาด้านซ้าย',
            disabled: !canAssign
        };
    }, [selectedCourses, selectedTeacherIds]);

    const middleButtonProps = useMemo(() => {
        const isUpdate = selectedAssignments.length > 0 && selectedTeacherIds.length > 0;
        if (isUpdate) {
            const teacherName = selectedTeacherIds
                .map(id => teacherMap?.[id]?.name || id)
                .join(", ");
            return { icon: RefreshCw, color: 'bg-amber-500', label: `เปลี่ยนครูเป็น ${teacherName} (${selectedAssignments.length} รายการ)`, action: 'update', disabled: false };
        }
        if (selectedAssignments.length > 0) {
            return { icon: User, color: 'bg-amber-500', label: `เลือกครูใหม่จากรายการครู (${selectedAssignments.length} รายการ)`, action: 'prompt', disabled: true };
        }
        return { icon: X, color: 'bg-slate-500', label: 'ล้างการเลือกทั้งหมด', action: 'reset', disabled: false };
    }, [selectedAssignments, selectedTeacherIds, teacherMap]);

    const deleteButtonProps = useMemo(() => {
        const canDelete = selectedAssignments.length > 0;
        return {
            icon: Trash2,
            color: canDelete ? 'bg-rose-500' : 'bg-slate-400',
            label: canDelete ? `ลบการมอบหมายที่เลือก (${selectedAssignments.length})` : 'เลือกรายการเพื่อลบ',
            disabled: !canDelete
        };
    }, [selectedAssignments]);

    const roomButtonProps = useMemo(() => {
        const canUpdate = selectedAssignments.length > 0 && selectedRoomId !== null;
        if (canUpdate) {
            const room = rooms.find(r => r.id === selectedRoomId);
            return {
                color: 'bg-emerald-500',
                label: `ย้ายไปห้อง ${room?.roomCode || ''} (${selectedAssignments.length} รายการ)`
            };
        }
        return {
            color: 'bg-slate-400',
            label: 'เลือกวิชาและสถานที่'
        };
    }, [selectedAssignments, selectedRoomId, rooms]);
    const teacherList = useMemo(() => getActiveSortedTeachers(Object.values(teacherMap) as Teacher[]), [teacherMap]);

    const resolveTeacherForAssignmentId = (teacherId: string) => {
        return (teacherMap?.[teacherId] as Teacher | undefined)
            || (Object.values(teacherMap || {}) as Teacher[]).find(teacher => teacher.teacherId === teacherId);
    };

    const normalizeTeacherIdForLoad = (teacherId: string) => {
        return resolveTeacherForAssignmentId(teacherId)?.id || teacherId;
    };

    const openTeacherDropdown = async (title: string, text: string, currentTeacherId?: string) => {
        const isDarkMode = document.documentElement.classList.contains('dark');
        const dropdownTeachers = teacherList.filter(teacher => String(teacher.status || '').trim() === 'อยู่');
        const selectedTeacher = dropdownTeachers.find(teacher => teacher.id === currentTeacherId);
        const initialLabel = selectedTeacher
            ? `${selectedTeacher.teacherId || "—"} - ${selectedTeacher.name}`
            : 'เลือกครูผู้สอน';
        const optionsHtml = dropdownTeachers.map(teacher => {
            const label = `${teacher.teacherId || "—"} - ${teacher.name}`;
            const isSelected = teacher.id === currentTeacherId;
            return `
                <button
                    type="button"
                    class="teacher-picker-option ${isSelected ? 'is-selected' : ''}"
                    data-teacher-id="${escapeHtml(teacher.id)}"
                    data-label="${escapeHtml(label)}"
                >
                    ${escapeHtml(label)}
                </button>
            `;
        }).join("");

        return Swal.fire({
            title,
            text,
            icon: 'question',
            html: `
                <div class="teacher-picker">
                    <input id="teacher-picker-value" type="hidden" value="${escapeHtml(currentTeacherId)}" />
                    <button id="teacher-picker-button" type="button" class="teacher-picker-button">
                        <span id="teacher-picker-label">${escapeHtml(initialLabel)}</span>
                        <span class="teacher-picker-chevron">⌄</span>
                    </button>
                    <div id="teacher-picker-menu" class="teacher-picker-menu">
                        ${optionsHtml}
                    </div>
                </div>
                <style>
                    .swal2-popup.teacher-picker-popup { overflow: visible !important; }
                    .swal2-popup.teacher-picker-popup .swal2-html-container {
                        overflow: visible !important;
                        position: relative;
                        z-index: 3;
                    }
                    .swal2-popup.teacher-picker-popup .swal2-actions {
                        position: relative;
                        z-index: 1;
                    }
                    .teacher-picker { position: relative; margin: 22px auto 0; width: min(100%, 520px); text-align: left; }
                    .teacher-picker-button {
                        width: 100%;
                        display: flex;
                        align-items: center;
                        justify-content: space-between;
                        gap: 12px;
                        padding: 14px 16px;
                        border: 2px solid #6366f1;
                        border-radius: 12px;
                        background: var(--teacher-picker-control-bg);
                        color: var(--teacher-picker-text);
                        font-size: 18px;
                        font-weight: 800;
                        cursor: pointer;
                    }
                    .teacher-picker-chevron { color: #64748b; font-size: 22px; line-height: 1; }
                    .teacher-picker-menu {
                        display: none;
                        position: absolute;
                        left: 0;
                        right: 0;
                        top: calc(100% + 6px);
                        z-index: 99999;
                        max-height: 432px;
                        overflow-y: auto;
                        overscroll-behavior: contain;
                        border: 1px solid #cbd5e1;
                        border-radius: 12px;
                        background: var(--teacher-picker-menu-bg);
                        border-color: var(--teacher-picker-border);
                        box-shadow: 0 18px 40px var(--teacher-picker-shadow);
                        padding: 6px;
                    }
                    .teacher-picker-menu::-webkit-scrollbar { width: 8px; }
                    .teacher-picker-menu::-webkit-scrollbar-track { background: transparent; }
                    .teacher-picker-menu::-webkit-scrollbar-thumb {
                        background: var(--teacher-picker-scrollbar);
                        border-radius: 999px;
                        border: 2px solid var(--teacher-picker-menu-bg);
                    }
                    .teacher-picker.is-open .teacher-picker-menu { display: block; }
                    .teacher-picker-option {
                        width: 100%;
                        height: 42px;
                        display: flex;
                        align-items: center;
                        border: 0;
                        border-radius: 9px;
                        background: transparent;
                        color: var(--teacher-picker-text);
                        text-align: left;
                        padding: 8px 12px;
                        font-size: 16px;
                        font-weight: 800;
                        cursor: pointer;
                        white-space: nowrap;
                        overflow: hidden;
                        text-overflow: ellipsis;
                    }
                    .teacher-picker-option:hover {
                        background: var(--teacher-picker-hover-bg);
                        color: var(--teacher-picker-hover-text);
                    }
                    .teacher-picker-option.is-selected {
                        background: var(--teacher-picker-selected-bg);
                        color: var(--teacher-picker-selected-text);
                    }
                    .teacher-picker-popup {
                        --teacher-picker-control-bg: #ffffff;
                        --teacher-picker-menu-bg: #ffffff;
                        --teacher-picker-text: #334155;
                        --teacher-picker-border: #cbd5e1;
                        --teacher-picker-shadow: rgba(15, 23, 42, 0.18);
                        --teacher-picker-hover-bg: #eef2ff;
                        --teacher-picker-hover-text: #3730a3;
                        --teacher-picker-selected-bg: #dbeafe;
                        --teacher-picker-selected-text: #1e3a8a;
                        --teacher-picker-scrollbar: #cbd5e1;
                    }
                    .dark .teacher-picker-popup,
                    .teacher-picker-popup.is-dark {
                        --teacher-picker-control-bg: #111827;
                        --teacher-picker-menu-bg: #111827;
                        --teacher-picker-text: #e5e7eb;
                        --teacher-picker-border: rgba(148, 163, 184, 0.35);
                        --teacher-picker-shadow: rgba(0, 0, 0, 0.45);
                        --teacher-picker-hover-bg: rgba(99, 102, 241, 0.18);
                        --teacher-picker-hover-text: #c7d2fe;
                        --teacher-picker-selected-bg: rgba(79, 70, 229, 0.35);
                        --teacher-picker-selected-text: #ffffff;
                        --teacher-picker-scrollbar: #475569;
                    }
                </style>
            `,
            customClass: {
                popup: `teacher-picker-popup ${isDarkMode ? 'is-dark' : 'is-light'}`
            },
            showCancelButton: true,
            confirmButtonColor: '#f59e0b',
            cancelButtonText: 'ยกเลิก',
            confirmButtonText: 'เปลี่ยนครู',
            background: isDarkMode ? '#2a2b2f' : '#ffffff',
            color: isDarkMode ? '#f8fafc' : '#0f172a',
            didOpen: (popup) => {
                const picker = popup.querySelector('.teacher-picker');
                const button = popup.querySelector<HTMLButtonElement>('#teacher-picker-button');
                const label = popup.querySelector<HTMLElement>('#teacher-picker-label');
                const hidden = popup.querySelector<HTMLInputElement>('#teacher-picker-value');
                const options = popup.querySelectorAll<HTMLButtonElement>('.teacher-picker-option');

                button?.addEventListener('click', () => {
                    picker?.classList.toggle('is-open');
                });

                popup.addEventListener('click', (event) => {
                    if (picker && !picker.contains(event.target as Node)) {
                        picker.classList.remove('is-open');
                    }
                });

                options.forEach(option => {
                    option.addEventListener('click', () => {
                        options.forEach(item => item.classList.remove('is-selected'));
                        option.classList.add('is-selected');
                        if (hidden) hidden.value = option.dataset.teacherId || '';
                        if (label) label.textContent = option.dataset.label || 'เลือกครูผู้สอน';
                        picker?.classList.remove('is-open');
                    });
                });
            },
            preConfirm: () => {
                const value = (document.getElementById('teacher-picker-value') as HTMLInputElement | null)?.value;
                if (!value) {
                    Swal.showValidationMessage('กรุณาเลือกครูผู้สอน');
                    return false;
                }
                return value;
            }
        });
    };

    const dynamicLevelOptions = useMemo(() => {
        const options = [{ value: 'ทั้งหมด', label: 'ชั้น ทั้งหมด' }];
        
        // Add basic levels from school settings and insert groups at correct positions
        availableClassOptions.forEach(([key, label]) => {
            options.push({ value: key, label });
            if (key === 'm3') options.push({ value: 'junior_high', label: 'ม.ต้น' });
            if (key === 'm6') options.push({ value: 'senior_high', label: 'ม.ปลาย' });
        });

        // Ensure groups are added if they were missing from the sequence (edge cases)
        const hasJunior = classKeys.some(k => ['m1', 'm2', 'm3'].includes(k));
        const hasSenior = classKeys.some(k => ['m4', 'm5', 'm6'].includes(k));

        if (hasJunior && !options.find(o => o.value === 'junior_high')) {
            options.push({ value: 'junior_high', label: 'ม.ต้น' });
        }
        if (hasSenior && !options.find(o => o.value === 'senior_high')) {
            options.push({ value: 'senior_high', label: 'ม.ปลาย' });
        }

        return options;
    }, [availableClassOptions, classKeys]);

    // Computed courses with merged assignments for the selected year/semester
    const coursesWithAssignments = useMemo(() => {
        return courses.map(course => {
            const assignment = semesterAssignments.find(a => a.courseId === course.id);
            return {
                ...course,
                // Only trust this year+semester's real course_assignments record — falling back to
                // a raw teacherAssignments field on the course doc would leak a past year's
                // assignment forward forever, since course docs are reused across years.
                teacherAssignments: assignment ? assignment.teacherAssignments : []
            };
        });
    }, [courses, semesterAssignments]);

    // --- Enterprise Feature: Teacher Load Calculation ---
    const teacherLoadMap = useMemo(() => {
        const regularLoad: Record<string, number> = {};
        const activityLoad: Record<string, number> = {};

        const addAssignmentLoad = (
            assignment: Partial<GroupAssignment> | any,
            weeklyPeriods: number,
            semesterPeriods: number,
            isActivity: boolean
        ) => {
            const normalizedTeacherIds = Array.from(new Set(
                getAssignmentTeacherIds(assignment).map(normalizeTeacherIdForLoad)
            ));
            const rawTeacherIds = getAssignmentTeacherIds(assignment);
            const teacherHours = assignment?.teacherHours || {};

            normalizedTeacherIds.forEach((teacherId, index) => {
                const rawId = rawTeacherIds[index];
                const assignedSemesterHours = Number(teacherHours[rawId] ?? teacherHours[teacherId] ?? semesterPeriods ?? 0);
                const assignedWeeklyPeriods = semesterPeriods > 0
                    ? (assignedSemesterHours / semesterPeriods) * weeklyPeriods
                    : weeklyPeriods;
                if (isActivity) {
                    activityLoad[teacherId] = (activityLoad[teacherId] || 0) + assignedWeeklyPeriods;
                } else {
                    regularLoad[teacherId] = (regularLoad[teacherId] || 0) + assignedWeeklyPeriods;
                }
            });
        };

        coursesWithAssignments.forEach(c => {
            const activity = isActivityCourse(c);
            const weeklyPeriods = getCourseWeeklyTeachingPeriods(c);
            const semesterPeriods = getCourseTeachingHours(c);
            c.teacherAssignments?.forEach((asgn: GroupAssignment) => {
                addAssignmentLoad(asgn, weeklyPeriods, semesterPeriods, activity);
            });
        });

        pendingQueue.forEach(p => {
            const course = coursesWithAssignments.find(c => c.id === p.courseId);
            if (course) {
                const activity = isActivityCourse(course);
                const weeklyPeriods = getCourseWeeklyTeachingPeriods(course);
                const semesterPeriods = getCourseTeachingHours(course);
                addAssignmentLoad(p, weeklyPeriods, semesterPeriods, activity);
            }
        });

        return { regularLoad, activityLoad };
    }, [coursesWithAssignments, pendingQueue, teacherMap]);

    const roomUsageCounts = useMemo(() => {
        const counts: Record<string, number> = {};
        semesterAssignments.forEach(a => {
            a.teacherAssignments?.forEach((ta: any) => {
                const r = String(ta.room || "");
                if (r) counts[r] = (counts[r] || 0) + 1;
            });
        });
        pendingQueue.forEach(p => {
            const r = String(p.room || "");
            if (r) counts[r] = (counts[r] || 0) + 1;
        });
        return counts;
    }, [semesterAssignments, pendingQueue]);

    const buildings = useMemo(() => {
        const unique = Array.from(new Set(rooms.map(r => r.building).filter((b): b is string => !!b)));
        return ["ทั้งหมด", ...unique.sort((a, b) => a.localeCompare(b, 'th', { numeric: true }))];
    }, [rooms]);

    const normalizeSubjectGroupValue = (value?: string) => {
        return (value || "")
            .replace(/^กลุ่มสาระการเรียนรู้\s*/u, "")
            .replace(/^กลุ่มสาระ\s*/u, "")
            .replace(/\s+/g, "")
            .trim()
            .toLowerCase();
    };

    const getSubjectGroupInfo = (value?: string) => {
        const rawValue = (value || "").trim();
        if (!rawValue) return undefined;

        const normalizedValue = normalizeSubjectGroupValue(rawValue);
        return subjectGroupsList.find(group => {
            const candidates = [group.id, group.code, group.name].filter(Boolean);
            return candidates.some(candidate =>
                candidate === rawValue ||
                normalizeSubjectGroupValue(candidate) === normalizedValue
            );
        });
    };

    const getSubjectGroupName = (value?: string) => {
        return getSubjectGroupInfo(value)?.name || value || "";
    };

    const isSubjectGroupMatch = (courseGroup?: string, selectedGroup?: string) => {
        if (!selectedGroup || selectedGroup === "กลุ่มสาระทั้งหมด") return true;
        if (!courseGroup) return false;

        const courseInfo = getSubjectGroupInfo(courseGroup);
        const selectedInfo = getSubjectGroupInfo(selectedGroup);
        const courseValues = [
            courseGroup,
            courseInfo?.id,
            courseInfo?.code,
            courseInfo?.name,
        ].filter(Boolean) as string[];
        const selectedValues = [
            selectedGroup,
            selectedInfo?.id,
            selectedInfo?.code,
            selectedInfo?.name,
        ].filter(Boolean) as string[];

        return courseValues.some(courseValue =>
            selectedValues.some(selectedValue =>
                courseValue === selectedValue ||
                normalizeSubjectGroupValue(courseValue) === normalizeSubjectGroupValue(selectedValue)
            )
        );
    };

    const calendarState = useSelector((state: RootState) => state.calendar);

    useEffect(() => {
        if (!schoolId) return;

        if (calendarState.status === 'idle') {
            dispatch(fetchCalendar(schoolId) as any);
        }

        const fetchInitialSettings = async () => {
            try {
                // Fetch School Info
                const schoolRef = doc(db, 'school-settings', schoolId);
                const schoolSnap = await getDoc(schoolRef);
                if (schoolSnap.exists()) {
                    setSchoolInfo(schoolSnap.data());
                }

                // Fetch available years for dropdown
                const calendarColRef = collection(db, 'school-settings', schoolId, 'main_calendar');
                const calendarColSnap = await getDocs(calendarColRef);
                const years = calendarColSnap.docs
                    .map(doc => doc.id)
                    .filter(id => id !== 'default')
                    .sort((a, b) => b.localeCompare(a));
                
                setAvailableYears(years);
                
                // Initialize selection from Redux if available
                if (calendarState.status === 'succeeded' && !selectedYear) {
                    setSelectedYear(calendarState.academicYear);
                    const currentTerm = calendarState.rawData?.currentTerm || "1";
                    setSelectedSemester(currentTerm);
                }
            } catch (error) {
                console.error("Error fetching initial settings:", error);
            }
        };

        fetchInitialSettings();

        const unsubCourses = onSnapshot(query(collection(db, 'school-settings', schoolId, 'courses'), orderBy('code', 'asc')), (snap) => {
            setCourses(snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as Course)).filter(c => c.isActive !== false));
            setIsLoading(false);
        });

        const unsubRooms = onSnapshot(collection(db, 'school-settings', schoolId, 'physical-rooms'), (snap) => {
            setRooms(snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as Room)));
        });

        const unsubGroups = onSnapshot(collection(db, 'school-settings', schoolId, 'subject_groups'), (snap) => {
            const data = snap.docs.map(doc => ({ id: doc.id, ...(doc.data() as { name: string, code: string }) }));
            data.sort((a, b) => (a.code || '999').localeCompare(b.code || '999', undefined, { numeric: true, sensitivity: 'base' }));
            const seenNames = new Set<string>();
            setSubjectGroupsList(data.filter(g => g.name && !seenNames.has(g.name) && seenNames.add(g.name)));
        });

        // Fetch learner-activities to know which activity courses have a special period (Mode 1)
        getDocs(collection(db, 'school-settings', schoolId, 'learner-activities')).then(snap => {
            const withPeriod = new Set<string>();
            snap.docs.forEach(d => {
                const data = d.data();
                if (data.specialPeriodId && data.courseId) withPeriod.add(data.courseId);
            });
            setActivityCoursesWithPeriod(withPeriod);
        });

        return () => {
            unsubCourses();
            unsubRooms();
            unsubGroups();
        };
    }, [schoolId]);

    // Real-time listener for semester-specific assignments
    useEffect(() => {
        if (!schoolId || !selectedYear || !selectedSemester) return;
        
        const assignmentRef = collection(db, 'school-settings', schoolId, 'course_assignments');
        const q = query(assignmentRef, 
            where('academicYear', '==', selectedYear),
            where('semester', '==', selectedSemester)
        );

        const unsub = onSnapshot(q, (snap) => {
            setSemesterAssignments(snap.docs.map(doc => ({ id: doc.id, ...doc.data() })));
        });

        return () => unsub();
    }, [schoolId, selectedYear, selectedSemester]);

    // Tracks, across ALL academic years, which years each course actually had a teacher
    // assignment. Used to hide subjects that were taught in a past year but are not part of
    // this year's offering, without ever hiding a brand-new course that has never been
    // assigned yet (it simply has no entry in this map).
    useEffect(() => {
        if (!schoolId) return;
        const assignmentRef = collection(db, 'school-settings', schoolId, 'course_assignments');
        const unsub = onSnapshot(assignmentRef, (snap) => {
            const map: Record<string, Set<string>> = {};
            snap.docs.forEach(d => {
                const data = d.data() as any;
                if (!data.courseId || !data.academicYear) return;
                if (!map[data.courseId]) map[data.courseId] = new Set();
                map[data.courseId].add(String(data.academicYear));
            });
            setEverAssignedYearsByCourse(map);
        });
        return () => unsub();
    }, [schoolId]);

    // Sync teacher assignments of club-type courses into the `clubs` collection so the
    // existing club attendance/evaluation pages (which only read `clubs/{clubId}`) stay in sync
    // whenever "ลงทะเบียนแบบรายวิชา" club mode is enabled from ActivityHubSettingsPage.
    useEffect(() => {
        if (!schoolId || clubMode !== 'course-based') return;
        semesterAssignments.forEach((a: any) => {
            const course = courses.find(c => c.id === a.courseId);
            if (!course) return;
            const isClub = isClubCourse(course);
            if (!isClub) return;
            const teacherIds = new Set<string>();
            (a.teacherAssignments || []).forEach((ta: any) => {
                (ta.teacherIds?.length ? ta.teacherIds : [ta.teacherId]).forEach((id: string) => { if (id) teacherIds.add(id); });
            });
            setDoc(doc(db, 'school-settings', schoolId, 'clubs', course.id), {
                name: course.title || course.code || '',
                responsibleTeacherIds: Array.from(teacherIds),
                linkedCourseId: course.id,
            }, { merge: true }).catch(err => console.error('Failed to sync club teacher assignment:', err));
        });
    }, [schoolId, clubMode, semesterAssignments, courses]);

    // Handlers
    const handleAddToQueue = async () => {
        if (!selectedCourses.length || selectedTeacherIds.length === 0 || !schoolId) return;

        if (!activeGroupNumbers.length) {
            Swal.fire({
                icon: 'warning',
                title: 'กรุณาเลือกกลุ่ม',
                text: 'กรุณาเลือกอย่างน้อย 1 กลุ่มเพื่อมอบหมายงาน',
                confirmButtonColor: '#3b82f6'
            });
            return;
        }

        if (!activeRoomNumber) {
            const confirmResult = await Swal.fire({
                icon: 'warning',
                title: 'ยังไม่ได้เลือกห้อง',
                text: `วิชาที่เลือกไว้ ${selectedCourses.length} รายการยังไม่ได้เลือกเลขห้อง (คอลัมน์ "ห้อง") ต้องการมอบหมายต่อโดยไม่ระบุห้องหรือไม่?`,
                showCancelButton: true,
                confirmButtonText: 'มอบหมายต่อ (ไม่ระบุห้อง)',
                cancelButtonText: 'กลับไปเลือกห้อง',
                confirmButtonColor: '#f59e0b',
                cancelButtonColor: '#64748b',
                background: getSwalBg(),
                color: getSwalColor()
            });
            if (!confirmResult.isConfirmed) return;
        }

        if (!selectedRoomId) {
            const confirmResult = await Swal.fire({
                icon: 'warning',
                title: 'ยังไม่ได้เลือกห้องเรียน',
                text: `วิชาที่เลือกไว้ ${selectedCourses.length} รายการยังไม่ได้ระบุห้องเรียน ต้องการมอบหมายต่อโดยไม่ระบุห้องหรือไม่?`,
                showCancelButton: true,
                confirmButtonText: 'มอบหมายต่อ (ไม่ระบุห้อง)',
                cancelButtonText: 'กลับไปเลือกห้อง',
                confirmButtonColor: '#f59e0b',
                cancelButtonColor: '#64748b',
                background: getSwalBg(),
                color: getSwalColor()
            });
            if (!confirmResult.isConfirmed) return;
        }

        const newItems: any[] = [];
        const baseRoomNum = parseInt(activeRoomNumber);
        const minGroupNum = activeGroupNumbers.length > 0 ? Math.min(...activeGroupNumbers) : 0;

        selectedCourses.forEach(course => {
            activeGroupNumbers.forEach(groupNum => {
                let currentRoom = activeRoomNumber;
                let currentRoomIds = selectedRoomId ? [selectedRoomId] : [];

                // If multiple groups are selected and the room is numeric, auto-increment the room
                if (!isNaN(baseRoomNum) && activeGroupNumbers.length > 1) {
                    const offset = groupNum - minGroupNum;
                    currentRoom = String(baseRoomNum + offset);
                    
                    // Try to find matching room entity for the incremented room
                    const matchedRoom = rooms.find(r => r.roomName === currentRoom || r.roomCode === currentRoom);
                    if (matchedRoom) {
                        currentRoomIds = [matchedRoom.id];
                    } else if (offset !== 0) {
                        // If it's an incremented room and we don't have an entity, clear the IDs
                        currentRoomIds = [];
                    }
                }

                newItems.push({
                    courseId: course.id,
                    teacherId: selectedTeacherIds[0],
                    teacherIds: selectedTeacherIds,
                    teacherHours: selectedTeacherIds.length >= 2
                        ? resolveTeacherHours({ teacherIds: selectedTeacherIds }, course)
                        : undefined,
                    teacherPeriods: selectedTeacherIds.length >= 2
                        ? resolveTeacherPeriodRanges({ teacherIds: selectedTeacherIds }, course)
                        : undefined,
                    roomIds: currentRoomIds,
                    groupNumber: groupNum,
                    room: currentRoom,
                    title: course.title || "",
                    code: course.code || "",
                    classId: course.classId
                });
            });
        });

        setPendingQueue(prev => [...prev, ...newItems]);
        setSelectedCourses([]);
        setSelectedTeacherIds([]);
        setSelectedRoomId(null);
        
        Swal.fire({
            icon: 'info',
            title: 'เพิ่มรายการแล้ว',
            text: `ระบบจะบันทึกอัตโนมัติในอีกสักครู่ (${newItems.length} รายการ)`,
            toast: true,
            position: 'top-end',
            timer: 1800,
            showConfirmButton: false,
            background: getSwalBg(),
            color: getSwalColor()
        });
    };

    const commitPendingQueue = useCallback(async (
        queueSnapshot = pendingQueue,
        options: { confirm?: boolean; silent?: boolean } = {}
    ) => {
        if (!queueSnapshot.length || !schoolId || saveInFlightRef.current) return;

        if (options.confirm) {
            const confirmResult = await Swal.fire({
                title: 'ยืนยันการบันทึกลงระบบ?',
                text: `คุณกำลังจะบันทึกการมอบหมายจำนวน ${queueSnapshot.length} รายการ ลงในฐานข้อมูลจริง ใช่หรือไม่?`,
                icon: 'warning',
                showCancelButton: true,
                confirmButtonColor: '#4f46e5',
                cancelButtonColor: '#64748b',
                confirmButtonText: 'ตกลง, บันทึกเลย',
                cancelButtonText: 'ตรวจสอบอีกครั้ง'
            });

            if (!confirmResult.isConfirmed) return;
        }

        saveInFlightRef.current = true;
        setIsSaving(true);
        if (!options.silent) {
            Swal.fire({ title: 'กำลังบันทึกลงฐานข้อมูล...', allowOutsideClick: false, didOpen: () => Swal.showLoading() });
        }

        try {
            // Group by courseId for batch-like updates
            const byCourse: Record<string, typeof pendingQueue> = {};
            queueSnapshot.forEach(item => {
                if (!byCourse[item.courseId]) byCourse[item.courseId] = [];
                byCourse[item.courseId].push(item);
            });

            for (const [courseId, queueItems] of Object.entries(byCourse)) {
                const assignmentId = `${courseId}_${selectedYear}_${selectedSemester}`;
                const assignmentRef = doc(db, 'school-settings', schoolId, 'course_assignments', assignmentId);
                const courseData = coursesWithAssignments.find(c => c.id === courseId);
                if (!courseData) continue;

                const currentAssignments = [...(courseData.teacherAssignments || [])];
                
                queueItems.forEach(item => {
                    const existingIdx = currentAssignments.findIndex(a => a.groupNumber === item.groupNumber);
                    const newAssign: GroupAssignment = {
                        groupNumber: item.groupNumber,
                        room: (item as any).room || "1",
                        teacherId: item.teacherId,
                        teacherIds: getAssignmentTeacherIds(item),
                        teacherHours: item.teacherHours,
                        teacherPeriods: item.teacherPeriods,
                        roomIds: item.roomIds,
                        classLevels: item.classId ? (Array.isArray(item.classId) ? item.classId : [item.classId]) : []
                    };

                    if (existingIdx !== -1) {
                        currentAssignments[existingIdx] = newAssign;
                    } else {
                        currentAssignments.push(newAssign);
                    }
                });

                await setDoc(assignmentRef, removeUndefinedFields({ 
                    courseId,
                    academicYear: selectedYear,
                    semester: selectedSemester,
                    teacherAssignments: currentAssignments 
                }), { merge: true });
            }

            if (!options.silent) {
                Swal.fire({ icon: 'success', title: 'บันทึกข้อมูลเรียบร้อย', text: 'ข้อมูลถูกเขียนลงฐานข้อมูลและพร้อมใช้งานแล้ว', timer: 2000, showConfirmButton: false });
            } else {
                Swal.fire({ icon: 'success', title: `บันทึกอัตโนมัติแล้ว (${queueSnapshot.length})`, toast: true, position: 'top-end', timer: 1300, showConfirmButton: false });
            }
            setPendingQueue(prev => prev.filter(item => !queueSnapshot.includes(item)));
            setSelectedAssignments([]);
        } catch (error) {
            console.error(error);
            Swal.fire({
                icon: 'error',
                title: options.silent ? 'บันทึกอัตโนมัติไม่สำเร็จ' : 'เกิดข้อผิดพลาด',
                text: 'ไม่สามารถบันทึกข้อมูลได้ กรุณาลองใหม่อีกครั้ง'
            });
        } finally {
            saveInFlightRef.current = false;
            setIsSaving(false);
        }
    }, [coursesWithAssignments, pendingQueue, schoolId, selectedSemester, selectedYear]);

    const handleCommitAll = useCallback(async () => {
        await commitPendingQueue(pendingQueue, { confirm: true });
    }, [commitPendingQueue, pendingQueue]);

    useEffect(() => {
        if (!pendingQueue.length || !schoolId || isLoading) return;

        if (autoSaveTimerRef.current) {
            clearTimeout(autoSaveTimerRef.current);
        }

        const queueSnapshot = [...pendingQueue];
        autoSaveTimerRef.current = setTimeout(() => {
            commitPendingQueue(queueSnapshot, { silent: true });
        }, 1800);

        return () => {
            if (autoSaveTimerRef.current) {
                clearTimeout(autoSaveTimerRef.current);
            }
        };
    }, [commitPendingQueue, isLoading, pendingQueue, schoolId]);

    const handleResetSelections = () => {
        setSelectedCourses([]);
        setSelectedTeacherIds([]);
        setSelectedRoomId(null);
        setActiveGroupNumbers([1]);
        setActiveRoomNumber("");
        setSelectedAssignments([]);
    };

    const handleUpdateTeacher = async (
        teacherIdsOverride?: string[],
        assignmentsOverride?: { courseId: string; groupNumber: number; isPending?: boolean }[],
        skipConfirm = false
    ) => {
        let targetTeacherIds = teacherIdsOverride || selectedTeacherIds;
        const targetAssignments = assignmentsOverride || selectedAssignments;
        if (!targetAssignments.length || targetTeacherIds.length === 0 || !schoolId) return;
        
        const hasPending = targetAssignments.some(a => a.isPending);
        const hasSaved = targetAssignments.some(a => !a.isPending);

        if (!skipConfirm) {
            const confirmResult = await openTeacherDropdown(
                'เปลี่ยนครูผู้สอน',
                `เลือกครูผู้สอนใหม่สำหรับ ${targetAssignments.length} รายการที่เลือก`,
                targetTeacherIds[0] || ''
            );

            if (!confirmResult.isConfirmed || !confirmResult.value) return;
            targetTeacherIds = [String(confirmResult.value)];
        }

        try {
            // 1. Update Pending Queue (Local)
            if (hasPending) {
                setPendingQueue(prev => prev.map(item => {
                    const isTarget = targetAssignments.some(a => a.isPending && a.courseId === item.courseId && a.groupNumber === item.groupNumber);
                    const course = coursesWithAssignments.find(c => c.id === item.courseId);
                    return isTarget ? {
                        ...item,
                        teacherId: targetTeacherIds[0],
                        teacherIds: targetTeacherIds,
                        teacherHours: targetTeacherIds.length >= 2
                            ? resolveTeacherHours({ teacherIds: targetTeacherIds }, course)
                            : undefined,
                        teacherPeriods: targetTeacherIds.length >= 2
                            ? resolveTeacherPeriodRanges({ teacherIds: targetTeacherIds }, course)
                            : undefined
                    } : item;
                }));
            }

            // 2. Update Firestore (Saved Items) via Batch
            if (hasSaved) {
                const batch = writeBatch(db);
                const savedTargets = targetAssignments.filter(a => !a.isPending);
                const updatedAssignmentsByCourse: Record<string, GroupAssignment[]> = {};
                
                // Group by course to avoid multiple batch writes to same doc in sequence
                const byCourse = savedTargets.reduce((acc, curr) => {
                    acc[curr.courseId] = [...(acc[curr.courseId] || []), curr.groupNumber];
                    return acc;
                }, {} as Record<string, number[]>);

                for (const [courseId, groups] of Object.entries(byCourse)) {
                    const course = coursesWithAssignments.find(c => c.id === courseId);
                    if (!course) continue;
                    const assignmentId = `${courseId}_${selectedYear}_${selectedSemester}`;
                    const assignmentRef = doc(db, 'school-settings', schoolId, 'course_assignments', assignmentId);
                    const assignments = [...(course.teacherAssignments || [])];
                    groups.forEach(num => {
                        const idx = assignments.findIndex(a => a.groupNumber === num);
                        if (idx !== -1) {
                            assignments[idx] = {
                                ...assignments[idx],
                                teacherId: targetTeacherIds[0],
                                teacherIds: targetTeacherIds,
                                teacherHours: targetTeacherIds.length >= 2
                                    ? resolveTeacherHours({ teacherIds: targetTeacherIds }, course)
                                    : undefined,
                                teacherPeriods: targetTeacherIds.length >= 2
                                    ? resolveTeacherPeriodRanges({ teacherIds: targetTeacherIds }, course)
                                    : undefined
                            };
                        }
                    });
                    updatedAssignmentsByCourse[courseId] = assignments;
                    batch.set(assignmentRef, removeUndefinedFields({ 
                        courseId,
                        academicYear: selectedYear,
                        semester: selectedSemester,
                        teacherAssignments: assignments 
                    }), { merge: true });
                }
                await batch.commit();
                setSemesterAssignments(prev => {
                    const next = [...prev];
                    Object.entries(updatedAssignmentsByCourse).forEach(([courseId, teacherAssignments]) => {
                        const idx = next.findIndex(item => item.courseId === courseId);
                        const payload = {
                            id: `${courseId}_${selectedYear}_${selectedSemester}`,
                            courseId,
                            academicYear: selectedYear,
                            semester: selectedSemester,
                            teacherAssignments
                        };
                        if (idx === -1) next.push(payload);
                        else next[idx] = { ...next[idx], ...payload };
                    });
                    return next;
                });
            }

            Swal.fire({ icon: 'success', title: 'อัปเดตครูสำเร็จ', toast: true, position: 'top-end', timer: 1500, showConfirmButton: false });
            setSelectedTeacherIds([]);
            setSelectedAssignments([]);
        } catch (error) {
            console.error(error);
            Swal.fire({ icon: 'error', title: 'เกิดข้อผิดพลาด', text: 'ไม่สามารถอัปเดตข้อมูลครูได้' });
        }
    };

    const handleStartTeacherChange = async (
        assignment: { courseId: string; groupNumber: number; isPending?: boolean },
        currentTeacherIds: string[],
        roomIds?: string[],
        room?: string
    ) => {
        setSelectedCourses([]);
        setSelectedAssignments([assignment]);
        setSelectedTeacherIds([]);
        if (roomIds && roomIds.length > 0) setSelectedRoomId(roomIds[0]);
        if (room) setActiveRoomNumber(room);

        const result = await openTeacherDropdown(
            'เปลี่ยนครูผู้สอน',
            'เลือกครูผู้สอนใหม่จากรายการด้านล่าง',
            currentTeacherIds[0] || ''
        );

        if (!result.isConfirmed || !result.value) return;
        await handleUpdateTeacher([String(result.value)], [assignment], true);
    };

    const handleConfigureTeacherHours = async (
        assignment: { courseId: string; groupNumber: number; isPending?: boolean },
        sourceAssignment: Partial<GroupAssignment> | any
    ) => {
        const teacherIds = getAssignmentTeacherIds(sourceAssignment);
        const course = coursesWithAssignments.find(c => c.id === assignment.courseId);
        const totalHours = getCourseTeachingHours(course);

        if (teacherIds.length < 2 || !course) {
            await handleStartTeacherChange(
                assignment,
                teacherIds,
                sourceAssignment.roomIds,
                sourceAssignment.room
            );
            return;
        }

        const currentRanges = resolveTeacherPeriodRanges(sourceAssignment, course);
        const teacherLabels = teacherIds.map(id => {
            const teacher = resolveTeacherForAssignmentId(id);
            return {
                id,
                label: `${teacher?.teacherId || "—"} ${teacher?.name || id}`
            };
        });

        const result = await Swal.fire({
            title: 'กำหนดช่วงคาบครูร่วมสอน',
            html: `
                <div class="teacher-hour-split">
                    <div class="teacher-hour-total">คาบรวมรายวิชาทั้งภาคเรียน: <strong>${escapeHtml(totalHours)}</strong> คาบ</div>
                    ${teacherLabels.map((teacher, index) => `
                        <div class="teacher-hour-row">
                            <span>${escapeHtml(teacher.label)}</span>
                            <div class="teacher-period-inputs">
                                <label>
                                    <small>สอนคาบ</small>
                                    <select id="teacher-period-start-${index}">
                                        ${Array.from({ length: totalHours }, (_, periodIndex) => {
                                            const period = periodIndex + 1;
                                            const selected = Number(currentRanges[teacher.id]?.start || 1) === period ? 'selected' : '';
                                            return `<option value="${period}" ${selected}>${period}</option>`;
                                        }).join("")}
                                    </select>
                                </label>
                                <label>
                                    <small>ถึงคาบ</small>
                                    <select id="teacher-period-end-${index}">
                                        ${Array.from({ length: totalHours }, (_, periodIndex) => {
                                            const period = periodIndex + 1;
                                            const selected = Number(currentRanges[teacher.id]?.end || period) === period ? 'selected' : '';
                                            return `<option value="${period}" ${selected}>${period}</option>`;
                                        }).join("")}
                                    </select>
                                </label>
                            </div>
                        </div>
                    `).join("")}
                    <p class="teacher-hour-note">กำหนดช่วงคาบของครูแต่ละคนให้ต่อเนื่องครบทั้งภาคเรียน และไม่ซ้ำกัน</p>
                </div>
                ${getSwalPeriodStyles()}
            `,
            showCancelButton: true,
            confirmButtonText: 'บันทึกช่วงคาบ',
            cancelButtonText: 'ยกเลิก',
            confirmButtonColor: '#4f46e5',
            background: getSwalBg(),
            color: getSwalColor(),
            preConfirm: () => {
                const values = teacherIds.map((id, index) => {
                    const startInput = document.getElementById(`teacher-period-start-${index}`) as HTMLSelectElement | null;
                    const endInput = document.getElementById(`teacher-period-end-${index}`) as HTMLSelectElement | null;
                    const start = Number(startInput?.value || 0);
                    const end = Number(endInput?.value || 0);
                    return { id, start, end, hours: end - start + 1 };
                });
                if (values.some(item => !Number.isFinite(item.start) || !Number.isFinite(item.end) || item.start <= 0 || item.end < item.start)) {
                    Swal.showValidationMessage('กรุณากำหนดช่วงคาบให้ถูกต้อง');
                    return false;
                }
                const coveredPeriods = new Set<number>();
                values.forEach(item => {
                    for (let period = item.start; period <= item.end; period += 1) {
                        coveredPeriods.add(period);
                    }
                });
                const sum = values.reduce((acc, item) => acc + item.hours, 0);
                if (sum !== totalHours || coveredPeriods.size !== totalHours) {
                    Swal.showValidationMessage(`ช่วงคาบต้องรวมกันครบ ${totalHours} คาบ และไม่ซ้ำกัน`);
                    return false;
                }
                return {
                    teacherHours: values.reduce((acc, item) => {
                        acc[item.id] = item.hours;
                        return acc;
                    }, {} as Record<string, number>),
                    teacherPeriods: values.reduce((acc, item) => {
                        acc[item.id] = { start: item.start, end: item.end };
                        return acc;
                    }, {} as Record<string, { start: number; end: number }>)
                };
            }
        });

        if (!result.isConfirmed || !result.value) return;

        const { teacherHours, teacherPeriods } = result.value as {
            teacherHours: Record<string, number>;
            teacherPeriods: Record<string, { start: number; end: number }>;
        };

        try {
            if (assignment.isPending) {
                setPendingQueue(prev => prev.map(item => (
                    item.courseId === assignment.courseId && item.groupNumber === assignment.groupNumber
                        ? { ...item, teacherHours, teacherPeriods }
                        : item
                )));
            } else if (schoolId) {
                const assignmentId = `${assignment.courseId}_${selectedYear}_${selectedSemester}`;
                const assignmentRef = doc(db, 'school-settings', schoolId, 'course_assignments', assignmentId);
                const updatedAssignments = [...(course.teacherAssignments || [])].map(item => (
                    item.groupNumber === assignment.groupNumber
                        ? { ...item, teacherHours, teacherPeriods }
                        : item
                ));

                await setDoc(assignmentRef, removeUndefinedFields({
                    courseId: assignment.courseId,
                    academicYear: selectedYear,
                    semester: selectedSemester,
                    teacherAssignments: updatedAssignments
                }), { merge: true });

                setSemesterAssignments(prev => {
                    const idx = prev.findIndex(item => item.courseId === assignment.courseId);
                    const payload = {
                        id: assignmentId,
                        courseId: assignment.courseId,
                        academicYear: selectedYear,
                        semester: selectedSemester,
                        teacherAssignments: updatedAssignments
                    };
                    if (idx === -1) return [...prev, payload];
                    const next = [...prev];
                    next[idx] = { ...next[idx], ...payload };
                    return next;
                });
            }

            Swal.fire({ icon: 'success', title: 'บันทึกช่วงคาบครูร่วมสอนแล้ว', toast: true, position: 'top-end', timer: 1500, showConfirmButton: false });
        } catch (error) {
            console.error(error);
            Swal.fire({ icon: 'error', title: 'เกิดข้อผิดพลาด', text: 'ไม่สามารถบันทึกช่วงคาบครูร่วมสอนได้' });
        }
    };

    const handleUpdateRoom = async () => {
        if (!selectedAssignments.length || !selectedRoomId || !schoolId) return;
        
        const room = rooms.find(r => r.id === selectedRoomId);
        const hasPending = selectedAssignments.some(a => a.isPending);
        const hasSaved = selectedAssignments.some(a => !a.isPending);

        try {
            // 1. Update Pending Queue (Local)
            if (hasPending) {
                setPendingQueue(prev => prev.map(item => {
                    const isTarget = selectedAssignments.some(a => a.isPending && a.courseId === item.courseId && a.groupNumber === item.groupNumber);
                    return isTarget ? { ...item, roomIds: [selectedRoomId] } : item;
                }));
            }

            // 2. Update Firestore (Saved Items) via Batch
            if (hasSaved) {
                const batch = writeBatch(db);
                const savedTargets = selectedAssignments.filter(a => !a.isPending);
                
                const byCourse = savedTargets.reduce((acc, curr) => {
                    acc[curr.courseId] = [...(acc[curr.courseId] || []), curr.groupNumber];
                    return acc;
                }, {} as Record<string, number[]>);

                for (const [courseId, groups] of Object.entries(byCourse)) {
                    const course = coursesWithAssignments.find(c => c.id === courseId);
                    if (!course) continue;
                    const assignmentId = `${courseId}_${selectedYear}_${selectedSemester}`;
                    const assignmentRef = doc(db, 'school-settings', schoolId, 'course_assignments', assignmentId);
                    const assignments = [...(course.teacherAssignments || [])];
                    groups.forEach(num => {
                        const idx = assignments.findIndex(a => a.groupNumber === num);
                        if (idx !== -1) assignments[idx] = { ...assignments[idx], roomIds: [selectedRoomId] };
                    });
                    batch.set(assignmentRef, removeUndefinedFields({ 
                        courseId,
                        academicYear: selectedYear,
                        semester: selectedSemester,
                        teacherAssignments: assignments 
                    }), { merge: true });
                }
                await batch.commit();
            }

            Swal.fire({ icon: 'success', title: 'ระบุสถานที่เรียบร้อย', toast: true, position: 'top-end', timer: 1500, showConfirmButton: false });
            setSelectedRoomId(null);
            setSelectedAssignments([]);
        } catch (error) {
            console.error(error);
            Swal.fire({ icon: 'error', title: 'เกิดข้อผิดพลาด', text: 'ไม่สามารถระบุสถานที่ได้' });
        }
    };

    const handleUpdateRoomNumber = async (newRoom: string) => {
        setActiveRoomNumber(newRoom);
        if (!selectedAssignments.length || !schoolId) return;

        const hasPending = selectedAssignments.some(a => a.isPending);
        const hasSaved = selectedAssignments.some(a => !a.isPending);

        try {
            if (hasPending) {
                setPendingQueue(prev => prev.map(item => {
                    const isTarget = selectedAssignments.some(a => a.isPending && a.courseId === item.courseId && a.groupNumber === item.groupNumber);
                    return isTarget ? { ...item, room: newRoom } : item;
                }));
            }

            if (hasSaved) {
                const batch = writeBatch(db);
                const savedTargets = selectedAssignments.filter(a => !a.isPending);
                
                const byCourse = savedTargets.reduce((acc, curr) => {
                    acc[curr.courseId] = [...(acc[curr.courseId] || []), curr.groupNumber];
                    return acc;
                }, {} as Record<string, number[]>);

                for (const [courseId, groups] of Object.entries(byCourse)) {
                    const course = coursesWithAssignments.find(c => c.id === courseId);
                    if (!course) continue;
                    const assignmentId = `${courseId}_${selectedYear}_${selectedSemester}`;
                    const assignmentRef = doc(db, 'school-settings', schoolId, 'course_assignments', assignmentId);
                    const assignments = [...(course.teacherAssignments || [])];
                    groups.forEach(num => {
                        const idx = assignments.findIndex(a => a.groupNumber === num);
                        if (idx !== -1) assignments[idx] = { ...assignments[idx], room: newRoom };
                    });
                    batch.set(assignmentRef, removeUndefinedFields({ 
                        courseId,
                        academicYear: selectedYear,
                        semester: selectedSemester,
                        teacherAssignments: assignments 
                    }), { merge: true });
                }
                await batch.commit();
            }
            Swal.fire({ icon: 'success', title: 'เปลี่ยนห้องเรียบร้อย', toast: true, position: 'top-end', timer: 1000, showConfirmButton: false });
        } catch (error) {
            console.error(error);
            Swal.fire({ icon: 'error', title: 'เกิดข้อผิดพลาด', text: 'ไม่สามารถเปลี่ยนห้องได้' });
        }
    };

    const handleClearRoomFromAssignment = async () => {
        if (!selectedAssignments.length || !schoolId) return;
        
        const hasPending = selectedAssignments.some(a => a.isPending);
        const hasSaved = selectedAssignments.some(a => !a.isPending);

        const confirmResult = await Swal.fire({
            title: 'ยกเลิกสถานที่สอน?',
            text: `คุณต้องการยกเลิกสถานที่สอนสำหรับ ${selectedAssignments.length} รายการที่เลือก ใช่หรือไม่?`,
            icon: 'warning',
            showCancelButton: true,
            confirmButtonColor: '#ef4444',
            cancelButtonColor: '#64748b',
            confirmButtonText: 'ยืนยันการยกเลิก',
            cancelButtonText: 'ย้อนกลับ'
        });

        if (!confirmResult.isConfirmed) return;

        try {
            // 1. Update Pending Queue (Local)
            if (hasPending) {
                setPendingQueue(prev => prev.map(item => {
                    const isTarget = selectedAssignments.some(a => a.isPending && a.courseId === item.courseId && a.groupNumber === item.groupNumber);
                    return isTarget ? { ...item, roomIds: [] } : item;
                }));
            }

            // 2. Update Firestore via Batch
            if (hasSaved) {
                const batch = writeBatch(db);
                const savedTargets = selectedAssignments.filter(a => !a.isPending);
                
                const byCourse = savedTargets.reduce((acc, curr) => {
                    acc[curr.courseId] = [...(acc[curr.courseId] || []), curr.groupNumber];
                    return acc;
                }, {} as Record<string, number[]>);

                for (const [courseId, groups] of Object.entries(byCourse)) {
                    const course = coursesWithAssignments.find(c => c.id === courseId);
                    if (!course) continue;
                    const assignmentId = `${courseId}_${selectedYear}_${selectedSemester}`;
                    const assignmentRef = doc(db, 'school-settings', schoolId, 'course_assignments', assignmentId);
                    const assignments = [...(course.teacherAssignments || [])];
                    groups.forEach(groupNum => {
                        const idx = assignments.findIndex(a => a.groupNumber === groupNum);
                        if (idx !== -1) assignments[idx] = { ...assignments[idx], roomIds: [] };
                    });
                    batch.set(assignmentRef, removeUndefinedFields({ 
                        courseId,
                        academicYear: selectedYear,
                        semester: selectedSemester,
                        teacherAssignments: assignments 
                    }), { merge: true });
                }
                await batch.commit();
            }

            Swal.fire({ icon: 'success', title: 'ยกเลิกสถานที่สำเร็จ', toast: true, position: 'top-end', timer: 1500, showConfirmButton: false });
            setSelectedAssignments([]);
        } catch (error) {
            console.error(error);
            Swal.fire({ icon: 'error', title: 'เกิดข้อผิดพลาด', text: 'ไม่สามารถยกเลิกสถานที่ได้' });
        }
    };

    const handleBulkRemoveAssignments = async () => {
        if (!selectedAssignments.length || !schoolId) return;

        const result = await Swal.fire({
            title: 'ยืนยันการลบรายการที่เลือก?',
            text: `คุณต้องการลบรายการที่เลือกจำนวน ${selectedAssignments.length} รายการ ใช่หรือไม่?`,
            icon: 'warning',
            showCancelButton: true,
            confirmButtonColor: '#ef4444',
            cancelButtonText: 'ยกเลิก'
        });

        if (!result.isConfirmed) return;

        try {
            const pendingTargets = selectedAssignments.filter(a => a.isPending);
            const savedTargets = selectedAssignments.filter(a => !a.isPending);

            // Remove from local queue
            if (pendingTargets.length > 0) {
                setPendingQueue(prev => prev.filter(item => 
                    !pendingTargets.some(p => p.courseId === item.courseId && p.groupNumber === item.groupNumber)
                ));
            }

            // Remove from Firestore
            if (savedTargets.length > 0) {
                const byCourse = savedTargets.reduce((acc, curr) => {
                    acc[curr.courseId] = [...(acc[curr.courseId] || []), curr.groupNumber];
                    return acc;
                }, {} as Record<string, number[]>);

                for (const [courseId, groups] of Object.entries(byCourse)) {
                    const course = coursesWithAssignments.find(c => c.id === courseId);
                    if (!course) continue;
                    const assignmentId = `${courseId}_${selectedYear}_${selectedSemester}`;
                    const assignmentRef = doc(db, 'school-settings', schoolId, 'course_assignments', assignmentId);
                    const updated = (course.teacherAssignments || []).filter((a: GroupAssignment) => !groups.includes(a.groupNumber));
                    await setDoc(assignmentRef, removeUndefinedFields({ 
                        courseId,
                        academicYear: selectedYear,
                        semester: selectedSemester,
                        teacherAssignments: updated 
                    }), { merge: true });
                }
            }
            
            Swal.fire({ icon: 'success', title: 'ลบรายการเรียบร้อย', toast: true, position: 'top-end', timer: 1500, showConfirmButton: false });
            setSelectedAssignments([]);
        } catch (error) {
            console.error(error);
            Swal.fire({ icon: 'error', title: 'เกิดข้อผิดพลาด' });
        }
    };

    const handleRemoveAssignment = async (courseId: string, groupNumber: number) => {
        const result = await Swal.fire({
            title: 'ยืนยันการลบ?',
            text: `คุณต้องการลบการมอบหมายของกลุ่ม ${groupNumber} ใช่หรือไม่?`,
            icon: 'warning',
            showCancelButton: true,
            confirmButtonColor: '#ef4444',
            cancelButtonColor: '#374151',
            confirmButtonText: 'ลบการมอบหมาย',
            cancelButtonText: 'ยกเลิก'
        });

        if (result.isConfirmed && schoolId) {
            try {
                const course = coursesWithAssignments.find(c => c.id === courseId);
                if (!course) return;
                const updated = (course.teacherAssignments || []).filter((a: GroupAssignment) => a.groupNumber !== groupNumber);
                const assignmentId = `${courseId}_${selectedYear}_${selectedSemester}`;
                await setDoc(doc(db, 'school-settings', schoolId, 'course_assignments', assignmentId), removeUndefinedFields({
                    courseId,
                    academicYear: selectedYear,
                    semester: selectedSemester,
                    teacherAssignments: updated
                }), { merge: true });
                Swal.fire({ icon: 'success', title: 'ลบสำเร็จ', toast: true, position: 'top-end', timer: 1500, showConfirmButton: false });
            } catch (error) {
                console.error(error);
            }
        }
    };

    // Helper for level matching - handles both IDs (m1) and Thai labels (ม.1)
    const matchesLevel = (courseClassId: CourseClassId | undefined): boolean => {
        if (selectedLevel === "ทั้งหมด") return true;
        if (!courseClassId) return false;

        if (Array.isArray(courseClassId)) {
            return courseClassId.some(level => matchesLevel(level));
        }
        
        const cid = courseClassId.toString().toLowerCase().trim();
        const sid = selectedLevel.toLowerCase().trim();

        // Exact match
        if (cid === sid) return true;

        // Common Thai mapping
        const thaiMapping: Record<string, string[]> = {
            'm1': ['ม.1'], 'm2': ['ม.2'], 'm3': ['ม.3'],
            'm4': ['ม.4'], 'm5': ['ม.5'], 'm6': ['ม.6'],
            'p1': ['ป.1'], 'p2': ['ป.2'], 'p3': ['ป.3'],
            'p4': ['ป.4'], 'p5': ['ป.5'], 'p6': ['ป.6'],
            'k1': ['อ.1', 'อนุบาล 1'], 'k2': ['อ.2', 'อนุบาล 2'], 'k3': ['อ.3', 'อนุบาล 3']
        };

        if (thaiMapping[sid]?.includes(cid)) return true;

        // Group logic for "ม.ต้น"
        if (sid === "junior_high" || sid === "ม.ต้น") {
            return ["m1", "m2", "m3", "junior_high", "ม.ต้น", "ม.1", "ม.2", "ม.3"].includes(cid);
        }
        
        // Group logic for "ม.ปลาย"
        if (sid === "senior_high" || sid === "ม.ปลาย") {
            return ["m4", "m5", "m6", "senior_high", "ม.ปลาย", "ม.4", "ม.5", "ม.6"].includes(cid);
        }
        
        return false;
    };

    // Reset pages when filters change (must be before early return)
    useEffect(() => { setCoursePage(1); setAssignmentPage(1); }, [courseSearch, selectedSemester, categoryFilter, subjectGroupFilter, selectedYear, showOnlyAssigned, hideStaleSubjects, selectedLevel]);
    useEffect(() => { setTeacherPage(1); }, [teacherSearch, teacherGroupFilter]);
    useEffect(() => { setRoomPage(1); }, [roomSearch, buildingFilter]);

    const subjectGroups = useMemo(() => {
        const names = subjectGroupsList
            .map(g => g.name)
            .filter(name => {
                // โหมดคาบเรียนพิเศษ: ซ่อนกลุ่มสาระกิจกรรมพัฒนาผู้เรียนออกจาก dropdown
                // เว้นแต่เปิดโหมดชุมนุมแบบรายวิชา ซึ่งวิชาชุมนุมยังต้องกรองด้วยกลุ่มสาระนี้ได้
                if (activityMode === 'special-period' && clubMode !== 'course-based') {
                    const lower = name.toLowerCase();
                    return !lower.includes('กิจกรรมพัฒนาผู้เรียน');
                }
                return true;
            });
        return ["กลุ่มสาระทั้งหมด", ...names];
    }, [subjectGroupsList, activityMode, clubMode]);

    if (isLoading) {
        return (
            <div className="flex flex-col items-center justify-center h-screen bg-slate-50 dark:bg-[#0b0e14]">
                <RefreshCw className="text-indigo-500 animate-spin mb-4" size={40} />
                <p className="text-slate-600 dark:text-slate-400 font-bold">กำลังเตรียมข้อมูลระบบ...</p>
            </div>
        );
    }

    // --- Senior Logic: Filtering System ---
    
    // 1. Filter for Left Panel (Source Courses)
    const filteredCourses = coursesWithAssignments.filter(c => {
        const clubCourse = isClubCourse(c);
        const activityCourse = isActivityCourse(c);
        // กิจกรรมแบบคาบพิเศษยังไปจัดการในหน้าคาบพิเศษ ไม่ควรแสดงในหน้ามอบหมายรายวิชา
        if (activityCourse && !clubCourse && activityMode === 'special-period') return false;

        // Core Logic: Checks if matches all active filters
        const matchesSearch = (c.title?.toLowerCase() || "").includes(courseSearch.toLowerCase()) || (c.code?.toLowerCase() || "").includes(courseSearch.toLowerCase());
        const matchesGroup = isSubjectGroupMatch(c.subjectGroup, subjectGroupFilter);
        const matchesType = matchesCourseCategory(c, categoryFilter);
        const matchesLevelFilter = matchesLevel(c.classId);

        let matchesSemester = true;
        if (selectedSemester !== "0") {
            const courseSem = c.semester?.toString().trim() || "0";
            matchesSemester = courseSem === selectedSemester || courseSem === "0" || courseSem === "";
        }

        if (!(matchesSearch && matchesGroup && matchesType && matchesLevelFilter && matchesSemester)) return false;

        // Opt-in: hide subjects that were taught in a past academic year but have no assignment
        // record for the currently selected year. A brand-new, never-assigned course (no entry
        // in the map) always stays visible regardless of this toggle.
        if (hideStaleSubjects) {
            const assignedYears = everAssignedYearsByCourse[c.id];
            if (assignedYears && assignedYears.size > 0 && !assignedYears.has(selectedYear)) return false;
        }

        // Status logic: Check assignment status
        const assignedInDB = (c.teacherAssignments?.length || 0);
        const assignedInQueue = pendingQueue.filter(p => p.courseId === c.id).length;
        const totalAssigned = assignedInDB + assignedInQueue;

        // Toggle logic: If showOnlyAssigned is ON, show only assigned. If OFF, show ALL but prioritize unassigned flow.
        if (showOnlyAssigned) return totalAssigned > 0;
        
        // Even if not "showOnlyAssigned", we show the course so user can add more groups
        return true; 
    }).sort((a, b) => {
        const getTypeWeight = (type?: string) => {
            const t = type?.trim() || "";
            if (t.includes("พื้นฐาน")) return 1;
            if (t.includes("เพิ่มเติม")) return 2;
            if (t.includes("ชุมนุม")) return 3;
            if (t.includes("กิจกรรม")) return 4;
            return 5;
        };
        
        const weightA = getTypeWeight(a.type);
        const weightB = getTypeWeight(b.type);
        
        if (weightA !== weightB) return weightA - weightB;

        const aGroup = getSubjectGroupInfo((a as any).subjectGroup);
        const bGroup = getSubjectGroupInfo((b as any).subjectGroup);
        if (aGroup?.code !== bGroup?.code) {
            return (aGroup?.code || '999').localeCompare(bGroup?.code || '999', undefined, { numeric: true, sensitivity: 'base' });
        }
        return (a.code || "").localeCompare(b.code || "");
    });

    // 2. Filter for Right Panel (Assigned Courses View) - "FOCUS MODE"
    const assignedCourses = coursesWithAssignments.filter(c => {
        if (!matchesLevel(c.classId)) return false;

        // Condition 1: If a teacher is selected, show ALL courses assigned to that teacher
        if (selectedTeacherIds.length > 0) {
            const matchesDB = c.teacherAssignments?.some((a: GroupAssignment) =>
                getAssignmentTeacherIds(a).some(id => selectedTeacherIds.includes(id))
            );
            const matchesQueue = pendingQueue.some(p =>
                p.courseId === c.id && getAssignmentTeacherIds(p).some(id => selectedTeacherIds.includes(id))
            );
            if (matchesDB || matchesQueue) return true;
        }

        // Condition 2: If items are in the pending queue, show them
        if (pendingQueue.some(p => p.courseId === c.id)) return true;

        // Condition 3: If an assignment is already selected for editing
        if (selectedAssignments.some(a => a.courseId === c.id)) return true;

        // Condition 4: If specifically showOnlyAssigned is on, show those with DB assignments (ONLY if a teacher is selected to avoid cluttering the view)
        if (showOnlyAssigned && selectedTeacherIds.length > 0 && c.teacherAssignments && c.teacherAssignments.length > 0) return true;

        return false;
    }).sort((a, b) => {
        const getTypeWeight = (type?: string) => {
            const t = type?.trim() || "";
            if (t.includes("พื้นฐาน")) return 1;
            if (t.includes("เพิ่มเติม")) return 2;
            if (t.includes("ชุมนุม")) return 3;
            if (t.includes("กิจกรรม")) return 4;
            return 5;
        };
        
        const weightA = getTypeWeight(a.type);
        const weightB = getTypeWeight(b.type);
        
        if (weightA !== weightB) return weightA - weightB;

        const aGroup = getSubjectGroupInfo((a as any).subjectGroup);
        const bGroup = getSubjectGroupInfo((b as any).subjectGroup);
        if (aGroup?.code !== bGroup?.code) {
            return (aGroup?.code || '999').localeCompare(bGroup?.code || '999', undefined, { numeric: true, sensitivity: 'base' });
        }
        return (a.code || "").localeCompare(b.code || "");
    });

    // Paginated data
    const courseTotalPages = Math.ceil(filteredCourses.length / ITEMS_PER_PAGE);
    const paginatedCourses = filteredCourses.slice((coursePage - 1) * ITEMS_PER_PAGE, coursePage * ITEMS_PER_PAGE);

    const filteredTeachers = teacherList.filter(t => {
        const search = teacherSearch.toLowerCase();
        const matchesSearch = (t.name || '').toLowerCase().includes(search) || String(t.teacherId || '').toLowerCase().includes(search);
        const matchesGroup = teacherGroupFilter === "ครูกลุ่มสาระ" || (t as any).subjectGroup === teacherGroupFilter || (t as any).learningArea === teacherGroupFilter;
        return matchesSearch && matchesGroup;
    }).sort((a, b) => {
        return compareTeachersByGroupAndId(a, b);
    });
    const teacherTotalPages = Math.ceil(filteredTeachers.length / ITEMS_PER_PAGE);
    const paginatedTeachers = filteredTeachers.slice((teacherPage - 1) * ITEMS_PER_PAGE, teacherPage * ITEMS_PER_PAGE);

    const filteredRooms = rooms.filter(r => (buildingFilter === "ทั้งหมด" || r.building === buildingFilter) && ((r.roomName?.toLowerCase() || "").includes(roomSearch.toLowerCase()) || (r.roomCode?.toLowerCase() || "").includes(roomSearch.toLowerCase())))
        .sort((a, b) => {
            // Sort by Building
            const buildA = a.building || "";
            const buildB = b.building || "";
            if (buildA !== buildB) return buildA.localeCompare(buildB, 'th', { numeric: true });

            // Sort by Floor
            const floorA = a.floor || "";
            const floorB = b.floor || "";
            if (floorA !== floorB) {
                const numA = parseInt(floorA);
                const numB = parseInt(floorB);
                if (!isNaN(numA) && !isNaN(numB)) return numA - numB;
                return floorA.localeCompare(floorB, 'th', { numeric: true });
            }

            // Sort by Room Code (Numeric)
            return (a.roomCode || "").localeCompare(b.roomCode || "", 'th', { numeric: true });
        });
    const roomTotalPages = Math.ceil(filteredRooms.length / ITEMS_PER_PAGE);
    const paginatedRooms = filteredRooms.slice((roomPage - 1) * ITEMS_PER_PAGE, roomPage * ITEMS_PER_PAGE);

    const assignmentTotalPages = Math.ceil(assignedCourses.length / ITEMS_PER_PAGE);
    const paginatedAssignedCourses = assignedCourses.slice((assignmentPage - 1) * ITEMS_PER_PAGE, assignmentPage * ITEMS_PER_PAGE);

    return (
        <MainLayout>
            <div className="min-h-screen bg-slate-50 dark:bg-[#0b0e14] text-slate-800 dark:text-slate-300 font-sans flex flex-col overflow-hidden h-screen select-none transition-colors duration-300">
                
                {/* --- Header --- */}
                <header className="px-6 py-3 bg-white dark:bg-[#161a27] border-b border-slate-200 dark:border-white/5 flex items-center justify-between shrink-0 shadow-sm z-30 transition-colors duration-300">
                    <div className="flex items-center gap-6 pl-12">
                        <div className="flex items-center gap-4">
                            <React.Suspense fallback={<div className="w-10 h-10 rounded-full bg-slate-200 dark:bg-white/5 animate-pulse" />}>
                                <BackButton to="/academic/hub/scheduling" />
                            </React.Suspense>
                            <div className="flex items-center gap-3">
                                <div className="p-2 bg-indigo-600 rounded-xl shadow-lg shadow-indigo-600/20">
                                    <BookOpen size={20} className="text-white" />
                                </div>
                                <div>
                                    <h1 className="text-lg font-black text-slate-900 dark:text-white leading-none">การมอบหมายงานสอน</h1>
                                    <p className="text-[9px] text-slate-500 dark:text-slate-400 font-bold mt-1 uppercase tracking-wider">กำหนดวิชาสอน ครูผู้สอน และสถานที่เรียนรายภาคเรียน</p>
                                </div>
                            </div>
                        </div>
                    </div>

                    <div className="flex items-center gap-3">
                        <div className="flex items-center gap-1 bg-slate-100 dark:bg-white/5 px-2 py-1 rounded-xl border border-slate-200 dark:border-white/5 shadow-inner">
                            <div className="flex items-center gap-1.5 border-r border-slate-200 dark:border-white/10 pr-2 ml-1">
                                <span className="text-[8px] font-bold text-slate-400 dark:text-slate-500 uppercase">ปีการศึกษา</span>
                                <select 
                                    value={selectedYear} 
                                    onChange={(e) => setSelectedYear(e.target.value)}
                                    className="bg-transparent border-none text-[11px] font-bold text-slate-900 dark:text-white outline-none cursor-pointer focus:ring-0 p-0 pr-3"
                                >
                                    {availableYears.length > 0 ? (
                                        availableYears.map(year => (
                                            <option key={year} value={year} className="bg-white dark:bg-[#161a27] text-slate-900 dark:text-white font-bold">{year}</option>
                                        ))
                                    ) : (
                                        <option value={selectedYear} className="bg-white dark:bg-[#161a27] text-slate-900 dark:text-white font-bold">{selectedYear || '—'}</option>
                                    )}
                                </select>
                            </div>
                            <div className="flex items-center gap-1.5 px-2">
                                <span className="text-[8px] font-bold text-slate-400 dark:text-slate-500 uppercase">ภาคเรียน</span>
                                <select 
                                    value={selectedSemester} 
                                    onChange={(e) => setSelectedSemester(e.target.value)}
                                    className="bg-transparent border-none text-[11px] font-bold text-slate-900 dark:text-white outline-none cursor-pointer focus:ring-0 p-0 pr-3"
                                >
                                    <option value="1" className="bg-white dark:bg-[#161a27] text-slate-900 dark:text-white font-bold">ภาคเรียนที่ 1</option>
                                    <option value="2" className="bg-white dark:bg-[#161a27] text-slate-900 dark:text-white font-bold">ภาคเรียนที่ 2</option>
                                    <option value="0" className="bg-white dark:bg-[#161a27] text-slate-900 dark:text-white font-bold">ทั้งปีการศึกษา (0)</option>
                                </select>
                            </div>
                            <div className="flex items-center gap-1.5 px-2 border-l border-slate-200 dark:border-white/10">
                                <span className="text-[8px] font-bold text-slate-400 dark:text-slate-500 uppercase">ระดับชั้น</span>
                                <div className="flex-1">
                                    <Select
                                        options={dynamicLevelOptions}
                                        value={dynamicLevelOptions.find(opt => opt.value === selectedLevel) || dynamicLevelOptions[0]}
                                        onChange={(opt: any) => setSelectedLevel(opt.value)}
                                        styles={headerSelectStyles}
                                        isSearchable={false}
                                    />
                                </div>
                            </div>
                        </div>
                        <button 
                            onClick={handleCommitAll}
                            disabled={!pendingQueue.length || isSaving}
                            className={`px-5 py-2.5 bg-indigo-600 hover:bg-indigo-500 disabled:bg-slate-300 dark:disabled:bg-white/5 disabled:text-slate-500 text-white rounded-xl font-black text-xs transition-all shadow-lg shadow-indigo-600/20 flex items-center gap-2 border border-white/10 ${isSaving ? 'opacity-70 cursor-wait' : ''}`}
                        >
                            {isSaving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
                            {pendingQueue.length > 0 ? `บันทึกตอนนี้ (${pendingQueue.length})` : 'บันทึกอัตโนมัติแล้ว'}
                        </button>
                    </div>
                </header>

                {/* --- Main Content --- */}
                <main className="flex-1 px-8 py-3 flex gap-2 overflow-hidden h-full items-stretch">
                    
                    {/* --- BLOCK 1: Courses & Teachers --- */}
                    <div className="flex-[2] min-w-0 bg-white dark:bg-[#161a27] rounded-xl border border-slate-200 dark:border-white/5 flex flex-col overflow-hidden shadow-sm dark:shadow-2xl relative transition-all duration-300">
                        <div className="flex-1 flex overflow-hidden h-full">
                            
                            <div className="flex-[1.2] min-w-0 flex flex-col border-r border-slate-200 dark:border-white/5">
                                <PanelHeader 
                                    title="รายวิชา" 
                                    icon={BookOpen} 
                                    count={filteredCourses.length} 
                                    compact 
                                    extra={
                                        <>
                                        <div
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                setShowOnlyAssigned(!showOnlyAssigned);
                                            }}
                                            className="flex items-center gap-1.5 ml-3 cursor-pointer select-none group"
                                        >
                                            <div className={`w-3.5 h-3.5 rounded border flex items-center justify-center transition-all ${showOnlyAssigned ? 'bg-indigo-500 border-indigo-500 shadow-sm' : 'bg-white dark:bg-white/5 border-slate-300 dark:border-slate-600 shadow-inner'}`}>
                                                <Check size={10} className={`text-white transition-opacity ${showOnlyAssigned ? 'opacity-100' : 'opacity-0'}`} strokeWidth={4} />
                                            </div>
                                            <span className={`text-[9px] font-bold transition-colors ${showOnlyAssigned ? 'text-indigo-600 dark:text-indigo-400' : 'text-slate-400 group-hover:text-slate-600 dark:text-slate-500 dark:group-hover:text-slate-300'}`}>
                                                วิชามอบหมายแล้ว
                                            </span>
                                        </div>
                                        <div
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                setHideStaleSubjects(!hideStaleSubjects);
                                            }}
                                            className="flex items-center gap-1.5 ml-3 cursor-pointer select-none group"
                                            title="ซ่อนวิชาที่เคยมีการมอบหมายในปีก่อนๆ แต่ไม่มีการมอบหมายในปีการศึกษาที่เลือกอยู่นี้ (วิชาใหม่ที่ยังไม่เคยมอบหมายจะยังแสดงอยู่เสมอ)"
                                        >
                                            <div className={`w-3.5 h-3.5 rounded border flex items-center justify-center transition-all ${hideStaleSubjects ? 'bg-indigo-500 border-indigo-500 shadow-sm' : 'bg-white dark:bg-white/5 border-slate-300 dark:border-slate-600 shadow-inner'}`}>
                                                <Check size={10} className={`text-white transition-opacity ${hideStaleSubjects ? 'opacity-100' : 'opacity-0'}`} strokeWidth={4} />
                                            </div>
                                            <span className={`text-[9px] font-bold transition-colors ${hideStaleSubjects ? 'text-indigo-600 dark:text-indigo-400' : 'text-slate-400 group-hover:text-slate-600 dark:text-slate-500 dark:group-hover:text-slate-300'}`}>
                                                ซ่อนวิชาที่ไม่เปิดสอนปีนี้
                                            </span>
                                        </div>
                                        </>
                                    }
                                />
                                    <div className="space-y-1 p-2">
                                        <div className="grid grid-cols-2 gap-2">
                                            <div className="flex-1">
                                                <Select
                                                    options={subjectGroups.map(g => ({ value: g, label: g }))}
                                                    value={{ value: subjectGroupFilter, label: subjectGroupFilter }}
                                                    onChange={(opt: any) => {
                                                        const val = opt.value;
                                                        setSubjectGroupFilter(val);
                                                    }}
                                                    styles={filterSelectStyles}
                                                    isSearchable={true}
                                                    placeholder="กลุ่มสาระ"
                                                />
                                            </div>

                                            <div className="flex-1">
                                                <Select
                                                    options={[
                                                        { value: 'ทั้งหมด', label: 'ทุกประเภทวิชา' },
                                                        { value: 'พื้นฐาน', label: 'พื้นฐาน' },
                                                        { value: 'เพิ่มเติม', label: 'เพิ่มเติม' },
                                                        { value: 'ชุมนุม', label: 'ชุมนุม' },
                                                        { value: 'กิจกรรม', label: 'กิจกรรม' },
                                                        { value: 'วิชาเลือกเสรี', label: 'วิชาเลือกเสรี' }
                                                    ]}
                                                    value={{ 
                                                        value: categoryFilter, 
                                                        label: categoryFilter === 'ทั้งหมด' ? 'ทุกประเภทวิชา' : categoryFilter 
                                                    }}
                                                    onChange={(opt: any) => setCategoryFilter(opt.value)}
                                                    styles={filterSelectStyles}
                                                    isSearchable={false}
                                                />
                                            </div>
                                        </div>

                                        <div className="grid grid-cols-2 gap-2">
                                            <div className="flex-1">
                                                <Select
                                                    options={dynamicLevelOptions}
                                                    value={dynamicLevelOptions.find(opt => opt.value === selectedLevel) || dynamicLevelOptions[0]}
                                                    onChange={(opt: any) => setSelectedLevel(opt.value)}
                                                    styles={filterSelectStyles}
                                                    isSearchable={false}
                                                />
                                            </div>
                                            <div className="flex-1">
                                                <Select
                                                    options={[
                                                        { value: '1', label: 'ภาคเรียน 1' },
                                                        { value: '2', label: 'ภาคเรียน 2' },
                                                        { value: '0', label: 'ทุกภาคเรียน' }
                                                    ]}
                                                    value={[
                                                        { value: '1', label: 'ภาคเรียน 1' },
                                                        { value: '2', label: 'ภาคเรียน 2' },
                                                        { value: '0', label: 'ทุกภาคเรียน' }
                                                    ].find(opt => opt.value === selectedSemester) || { value: '0', label: 'ทุกภาคเรียน' }}
                                                    onChange={(opt: any) => setSelectedSemester(opt.value)}
                                                    styles={filterSelectStyles}
                                                    isSearchable={false}
                                                />
                                            </div>
                                        </div>


                                    </div>
                                <div className="flex-1 overflow-y-auto custom-scrollbar px-1 space-y-0.5">
                                    {(() => {
                                        let lastGroup = '';
                                        return paginatedCourses.map(course => {
                                            const isSel = selectedCourses.some(c => c.id === course.id);
                                            const courseGroup = getSubjectGroupName((course as any).subjectGroup);
                                            const showHeader = courseGroup !== lastGroup;
                                            if (showHeader) lastGroup = courseGroup;
                                            const groupInfo = getSubjectGroupInfo((course as any).subjectGroup);
                                            const groupCode = groupInfo?.code || '?';
                                            return (
                                                <div key={course.id}>
                                                    <div 
                                                        onClick={() => {
                                                            setSelectedCourses(prev => {
                                                                const isAlreadySelected = prev.some(c => c.id === course.id);
                                                                if (isAlreadySelected) return prev.filter(c => c.id !== course.id);
                                                                const dbCount = course.teacherAssignments?.length || 0;
                                                                const qCount = pendingQueue.filter(p => p.courseId === course.id).length;
                                                                setActiveGroupNumbers([dbCount + qCount + 1]);
                                                                return [...prev, course];
                                                            });
                                                        }} 
                                                        className={`flex items-center gap-3 px-3 py-1.5 cursor-pointer transition-all border-b border-slate-100 dark:border-white/5 ${isSel ? 'bg-indigo-50/50 dark:bg-indigo-500/5' : 'bg-white dark:bg-transparent hover:bg-slate-50 dark:hover:bg-white/[0.02]'}`}
                                                    >
                                                        {/* Radio Style Indicator */}
                                                        <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0 transition-all ${isSel ? 'border-indigo-500 bg-white dark:bg-slate-900' : 'border-slate-300 dark:border-white/10 bg-slate-50 dark:bg-white/5'}`}>
                                                            {isSel && <div className="w-2.5 h-2.5 rounded-full bg-indigo-500 shadow-sm" />}
                                                        </div>
                                                        
                                                        {/* Course Info */}
                                                        <div className="flex items-center gap-2 text-[11px] font-medium overflow-hidden">
                                                            <span className="text-slate-400 shrink-0 w-3 text-center text-[10px]">{course.semester || '0'}</span>
                                                            <span className="text-slate-900 dark:text-white font-black shrink-0">{course.code}</span>
                                                            <span className="text-slate-600 dark:text-slate-300 truncate font-bold text-[11px] whitespace-nowrap">{course.title}</span>
                                                            {course.isElective && (
                                                                <span className="px-1.5 py-0.5 rounded text-[8px] font-bold bg-rose-100 text-rose-600 dark:bg-rose-900/30 dark:text-rose-400 shrink-0">
                                                                    วิชาเลือก
                                                                </span>
                                                            )}
                                                        </div>
                                                    </div>
                                                </div>
                                            );
                                        });
                                    })()}
                                </div>
                            </div>



                            <div className="flex-[1.1] min-w-0 flex flex-col">
                                <PanelHeader title="ครู" icon={Users} count={filteredTeachers.length} compact />
                                <div className="p-2 space-y-1.5">
                                    <div className="relative">
                                        <School className="absolute left-2 top-1/2 -translate-y-1/2 text-slate-400" size={10} />
                                        <select 
                                            value={teacherGroupFilter} 
                                            onChange={e => {
                                                const val = e.target.value;
                                                setTeacherGroupFilter(val);
                                            }} 
                                            className="w-full pl-6 pr-1 py-1.5 bg-slate-100 dark:bg-white/5 rounded-md text-[9px] font-bold outline-none border border-slate-200 dark:border-white/5 text-slate-700 dark:text-white transition-all focus:ring-2 focus:ring-indigo-500/20"
                                        >
                                            <option value="ครูกลุ่มสาระ" className="bg-white dark:bg-[#161a27] text-slate-900 dark:text-white">ครูกลุ่มสาระ</option>
                                            {subjectGroupsList.map(g => <option key={g.id} value={g.name} className="bg-white dark:bg-[#161a27] text-slate-900 dark:text-white">{g.name}</option>)}
                                        </select>
                                    </div>
                                    <div className="relative">
                                        <Search className="absolute left-2 top-1/2 -translate-y-1/2 text-slate-400" size={10} />
                                        <input type="text" placeholder="ค้นชื่อ..." value={teacherSearch} onChange={e=>setTeacherSearch(e.target.value)} className="w-full pl-6 pr-2 py-1.5 bg-slate-100 dark:bg-white/5 rounded-md text-[9px] outline-none border border-slate-200 dark:border-white/5 text-slate-900 dark:text-white shadow-inner" />
                                    </div>
                                </div>
                                <div className="flex-1 overflow-y-auto custom-scrollbar px-1 space-y-0.5">
                                    {paginatedTeachers.map(teacher => {
                                        const regularLoad = teacherLoadMap.regularLoad[teacher.id] || 0;
                                        const activityLoad = teacherLoadMap.activityLoad[teacher.id] || 0;
                                        const totalLoad = regularLoad + activityLoad;
                                        const isSelected = selectedTeacherIds.includes(teacher.id);
                                        return (
                                            <div
                                                key={teacher.id}
                                                onClick={() => setSelectedTeacherIds(prev => prev.includes(teacher.id) ? prev.filter(id => id !== teacher.id) : [...prev, teacher.id])}
                                                className={`px-3 py-1.5 rounded-xl cursor-pointer flex items-center justify-between gap-3 border transition-all ${isSelected ? 'bg-indigo-600 border-indigo-500 shadow-lg shadow-indigo-600/20' : 'border-transparent bg-slate-50 dark:bg-white/[0.02] hover:bg-slate-100 dark:hover:bg-white/[0.05]'}`}
                                            >
                                                <div className="flex items-center gap-2 min-w-0">
                                                    <div className={`w-3.5 h-3.5 rounded-md border flex items-center justify-center shrink-0 transition-all ${isSelected ? 'bg-white border-white' : 'bg-transparent border-slate-300 dark:border-white/20'}`}>
                                                        {isSelected && <Check size={10} className="text-indigo-600" strokeWidth={4} />}
                                                    </div>
                                                    <span className={`text-[9px] font-black shrink-0 px-1.5 py-0.5 rounded-md ${isSelected ? 'bg-white/20 text-white' : 'bg-slate-200 dark:bg-white/5 text-slate-500 dark:text-slate-400'}`}>
                                                        {teacher.teacherId || "—"}
                                                    </span>
                                                    <h4 className={`text-[11px] font-bold truncate whitespace-nowrap ${isSelected ? 'text-white' : 'text-slate-700 dark:text-slate-200'}`}>
                                                        {teacher.name}
                                                    </h4>
                                                </div>
                                                <span className={`text-[9px] font-black px-2 py-0.5 rounded-full shrink-0 ${isSelected ? 'bg-white/20 text-white' : (totalLoad > 25 ? 'bg-rose-500/10 text-rose-500' : 'bg-emerald-500/10 text-emerald-500')}`}>
                                                    {formatWeeklyLoad(totalLoad)} คาบ
                                                </span>
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>

                            <div className="w-16 shrink-0 flex flex-col border-l border-slate-200 dark:border-white/5 bg-slate-50/50 dark:bg-black/20">
                                <div className="py-2 text-center border-b border-slate-200 dark:border-white/5 font-black text-[9px] text-slate-400 dark:text-slate-500 uppercase tracking-tighter">ห้อง</div>
                                
                                <div className="h-[480px] flex flex-col overflow-y-auto custom-scrollbar scroll-smooth">
                                    {Array.from({ length: 20 }, (_, i) => {
                                        const num = (i + 1).toString();
                                        const count = roomUsageCounts[num] || 0;
                                        return (
                                            <button 
                                                key={num} 
                                                onClick={() => handleUpdateRoomNumber(num)} 
                                                className={`w-full py-2 shrink-0 text-[10px] font-black transition-all border-b border-slate-100 dark:border-white/5 relative group
                                                    ${activeRoomNumber === num 
                                                        ? 'bg-blue-600 text-white shadow-inner' 
                                                        : 'text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-white/5 hover:text-blue-600 dark:hover:text-blue-400'
                                                    }`}
                                            >
                                                {num}
                                                {count > 0 && activeRoomNumber !== num && (
                                                    <span className="absolute top-1 right-1 w-1.5 h-1.5 bg-blue-500 rounded-full"></span>
                                                )}
                                            </button>
                                        );
                                    })}
                                </div>

                                <div className="mt-auto border-t border-slate-200 dark:border-white/5">
                                    <button 
                                        onClick={() => handleUpdateRoomNumber('แผน')} 
                                        className={`w-full py-3 text-[10px] font-black transition-all relative
                                            ${activeRoomNumber === 'แผน' 
                                                ? 'bg-indigo-600 text-white shadow-inner' 
                                                : 'bg-slate-100/50 dark:bg-white/5 text-indigo-600 dark:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-500/10'
                                            }`}
                                    >
                                        <div className="flex flex-col items-center leading-tight">
                                            <span>แผน</span>
                                            {roomUsageCounts['แผน'] > 0 && (
                                                <span className={`text-[8px] mt-0.5 opacity-80 ${activeRoomNumber === 'แผน' ? 'text-white' : 'text-indigo-500'}`}>
                                                    {roomUsageCounts['แผน']} วิชา
                                                </span>
                                            )}
                                        </div>
                                    </button>
                                </div>
                                <div className="flex-1 bg-slate-50/30 dark:bg-black/10"></div>
                            </div>

                            <div className="w-16 shrink-0 flex flex-col border-l border-slate-200 dark:border-white/5 bg-slate-50/50 dark:bg-black/20">
                                <div className="py-2 text-center border-b border-slate-200 dark:border-white/5 font-black text-[9px] text-slate-400 dark:text-slate-500 uppercase tracking-tighter">กลุ่ม</div>
                                <div className="flex-1 flex flex-col overflow-y-auto custom-scrollbar">
                                    {Array.from({ length: 20 }, (_, i) => {
                                        const groupNum = i + 1;
                                        const isActive = activeGroupNumbers.includes(groupNum);
                                        return (
                                            <button 
                                                key={groupNum} 
                                                onClick={() => {
                                                    setActiveGroupNumbers(prev => 
                                                        prev.includes(groupNum) 
                                                            ? prev.filter(n => n !== groupNum) 
                                                            : [...prev, groupNum]
                                                    );
                                                }} 
                                                className={`flex-1 w-full py-1 text-[10px] font-black transition-all border-b border-slate-100 dark:border-white/5 
                                                    ${isActive 
                                                        ? 'bg-indigo-600 text-white shadow-inner' 
                                                        : 'text-slate-400 dark:text-slate-600 hover:bg-slate-100 dark:hover:bg-white/5 hover:text-indigo-600 dark:hover:text-indigo-400'
                                                    }`}
                                            >
                                                {groupNum}
                                            </button>
                                        );
                                    })}
                                </div>
                            </div>
                        </div>

                    </div>

                    <div className="flex flex-col justify-center gap-2 px-1 shrink-0">
                        <FloatingButton 
                            icon={ChevronRight} 
                            color={assignButtonProps.color} 
                            onClick={handleAddToQueue} 
                            label={assignButtonProps.label}
                            disabled={assignButtonProps.disabled} 
                        />
                        <FloatingButton 
                            icon={middleButtonProps.icon} 
                            color={middleButtonProps.color}
                            onClick={() => {
                                if (middleButtonProps.action === 'update') handleUpdateTeacher();
                                else handleResetSelections();
                            }}
                            label={middleButtonProps.label}
                            disabled={middleButtonProps.disabled}
                        />
                        <FloatingButton 
                            icon={deleteButtonProps.icon} 
                            color={deleteButtonProps.color}
                            onClick={handleBulkRemoveAssignments}
                            label={deleteButtonProps.label}
                            disabled={deleteButtonProps.disabled}
                        />
                    </div>
                    <div className="flex-1 min-w-0 bg-white dark:bg-[#161a27] rounded-xl border border-slate-200 dark:border-white/5 flex flex-col overflow-hidden shadow-sm dark:shadow-2xl">
                        <PanelHeader title="วิชาที่มอบหมายแล้ว" icon={LayoutGrid} count={assignedCourses.length} compact />
                        <div className="flex-1 overflow-y-auto custom-scrollbar p-2 space-y-1">
                            {assignedCourses.length || pendingQueue.length > 0 ? (
                                <>
                                    {pendingQueue.length > 0 && (
                                        <div className="mb-4">
                                            <div className="flex items-center gap-2 px-2 py-1 mb-2 bg-amber-500/10 rounded-lg">
                                                <div className="w-2 h-2 rounded-full bg-amber-500 animate-pulse" />
                                                <span className="text-[10px] font-black text-amber-600 uppercase">รอบันทึกอัตโนมัติ ({pendingQueue.length})</span>
                                            </div>
                                            <div className="space-y-1">
                                                {pendingQueue.map((item, idx) => {
                                                    const isSelected = selectedAssignments.some(a => a.courseId === item.courseId && a.groupNumber === item.groupNumber && a.isPending);
                                                    return (
                                                        <div key={`pending-${idx}`}
                                                            onClick={() => {
                                                                setSelectedAssignments(prev => {
                                                                    const exists = prev.some(a => a.courseId === item.courseId && a.groupNumber === item.groupNumber && a.isPending);
                                                                    if (exists) return prev.filter(a => !(a.courseId === item.courseId && a.groupNumber === item.groupNumber && a.isPending));
                                                                    setSelectedTeacherIds(getAssignmentTeacherIds(item));
                                                                    if (item.roomIds.length > 0) setSelectedRoomId(item.roomIds[0]);
                                                                    if (item.room) setActiveRoomNumber(item.room);
                                                                    return [...prev, { courseId: item.courseId, groupNumber: item.groupNumber, isPending: true }];
                                                                });
                                                            }}
                                                            className={`ml-2 px-2 py-1.5 rounded-xl flex items-center justify-between cursor-pointer transition-all border ${isSelected ? 'bg-amber-500/20 border-amber-500/40' : 'bg-amber-50/50 dark:bg-amber-500/5 border-amber-500/10 hover:bg-amber-100/50'}`}
                                                        >
                                                                <div className="flex items-center gap-2 min-w-0">
                                                                    <div className={`w-5 h-5 rounded-full border flex items-center justify-center shrink-0 transition-all ${isSelected ? 'border-amber-500 bg-white dark:bg-slate-900 shadow-sm' : 'border-amber-300 dark:border-white/10 bg-slate-50 dark:bg-white/5'}`}>
                                                                        {isSelected && <div className="w-2.5 h-2.5 rounded-full bg-amber-500 animate-in zoom-in-50 duration-200" />}
                                                                    </div>
                                                                    
                                                                    {/* Group Block (Matched with Enrollment Page) */}
                                                                    {(() => {
                                                                        const groupColors = [
                                                                            { bg: 'bg-blue-600', shadow: 'shadow-blue-600/40' },
                                                                            { bg: 'bg-indigo-600', shadow: 'shadow-indigo-600/40' },
                                                                            { bg: 'bg-violet-600', shadow: 'shadow-violet-600/40' },
                                                                            { bg: 'bg-purple-600', shadow: 'shadow-purple-600/40' },
                                                                            { bg: 'bg-fuchsia-600', shadow: 'shadow-fuchsia-600/40' },
                                                                            { bg: 'bg-pink-600', shadow: 'shadow-pink-600/40' },
                                                                            { bg: 'bg-rose-600', shadow: 'shadow-rose-600/40' },
                                                                        ];
                                                                        const rawNum = Number(item.groupNumber) || 1;
                                                                        const index = Math.max(0, rawNum - 1) % groupColors.length;
                                                                        const gColor = groupColors[index] || groupColors[0];
                                                                        return (
                                                                            <div className={`w-9 h-9 rounded-lg flex flex-col items-center justify-center shrink-0 border shadow-sm transition-all ${gColor.bg} text-white shadow-lg ${gColor.shadow}`}>
                                                                                <span className="text-[6px] uppercase font-black tracking-tighter mb-0.5 opacity-80">กลุ่ม</span>
                                                                                <span className="text-sm font-black leading-none">{item.groupNumber}</span>
                                                                            </div>
                                                                        );
                                                                    })()}

                                                                    <div className="flex-1 min-w-0 flex flex-col justify-center">
                                                                        <div className="flex items-center gap-2 mb-0.5">
                                                                            <span className="text-amber-600 dark:text-amber-400 font-mono text-[9px] font-black shrink-0 bg-amber-500/5 px-1.5 py-0.5 rounded border border-amber-500/10">
                                                                                {getAssignmentTeacherIds(item).map(id => teacherMap?.[id]?.teacherId || "N/A").join(", ")}
                                                                            </span>
                                                                            <h4 className="text-[11px] font-black text-slate-800 dark:text-white truncate tracking-tight">
                                                                                {getAssignmentTeacherIds(item).map(id => teacherMap?.[id]?.name || id).join(", ") || "ไม่ระบุครู"}
                                                                            </h4>
                                                                            {(() => {
                                                                                const teacherCount = getAssignmentTeacherIds(item).length;
                                                                                return (
                                                                                    <button
                                                                                        type="button"
                                                                                        onClick={(e) => {
                                                                                            e.stopPropagation();
                                                                                            handleConfigureTeacherHours(
                                                                                                { courseId: item.courseId, groupNumber: item.groupNumber, isPending: true },
                                                                                                item
                                                                                            );
                                                                                        }}
                                                                                        title={teacherCount >= 2 ? `กำหนดช่วงคาบครูร่วมสอน ${teacherCount} คน` : "เปลี่ยนครูผู้สอน"}
                                                                                        className="relative shrink-0 p-1 rounded-lg bg-amber-500/10 text-amber-600 hover:bg-amber-500 hover:text-white transition-all"
                                                                                    >
                                                                                        {teacherCount >= 2 ? <Users size={11} strokeWidth={2.8} /> : <User size={11} strokeWidth={2.8} />}
                                                                                        {teacherCount >= 2 && (
                                                                                            <span className="absolute -top-1.5 -right-1.5 min-w-4 h-4 px-1 rounded-full bg-emerald-500 text-white text-[8px] font-black leading-4 shadow-sm">
                                                                                                +{teacherCount}
                                                                                            </span>
                                                                                        )}
                                                                                    </button>
                                                                                );
                                                                            })()}
                                                                        </div>

                                                                        <div className="flex items-center gap-1.5">
                                                                            {/* Unified Class/Room Badge */}
                                                                            {(() => {
                                                                                const courseObj = courses.find(c => c.id === item.courseId);
                                                                                const label = courseObj ? getLevelLabel(courseObj.classId) : null;
                                                                                return (label || item.room) ? (
                                                                                    <div className="flex items-center bg-amber-500 text-white px-2 py-0.5 rounded-md shrink-0 shadow-sm">
                                                                                        <span className="text-[9px] font-black uppercase tracking-tighter">
                                                                                            {label}{item.room ? `/${item.room}` : ''}
                                                                                        </span>
                                                                                    </div>
                                                                                ) : null;
                                                                            })()}
                                                                            
                                                                            <div className="flex flex-wrap items-center gap-1">
                                                                                {item.roomIds?.map((rid: string) => {
                                                                                    const room = rooms.find(r => r.id === rid);
                                                                                    return room ? (
                                                                                        <div key={rid} className="flex items-center gap-1 bg-emerald-500/10 border border-emerald-500/10 px-1.5 py-0.5 rounded-md">
                                                                                            <MapPin size={9} className="text-emerald-400" />
                                                                                            <span className="text-[9px] font-black text-emerald-600 dark:text-emerald-400 whitespace-nowrap">
                                                                                                {room.roomCode}
                                                                                            </span>
                                                                                        </div>
                                                                                    ) : null;
                                                                                })}
                                                                                {(!item.roomIds || item.roomIds.length === 0) && (
                                                                                    <div className="text-[8px] font-bold text-rose-500 bg-rose-100 dark:bg-rose-500/10 px-1.5 py-0.5 rounded border border-rose-500/20">ไม่ระบุห้อง</div>
                                                                                )}
                                                                            </div>
                                                                        </div>
                                                                        
                                                                        {/* Course Subject Info (Subtle) */}
                                                                        <div className="mt-1 flex items-center gap-1.5">
                                                                            <span className="text-amber-600 font-black text-[9px] shrink-0 opacity-70">[{item.code}]</span>
                                                                            <span className="text-[10px] font-bold text-slate-500 truncate opacity-80">{item.title}</span>
                                                                            {getAssignmentTeacherIds(item).length >= 2 && (
                                                                                <span className="text-[8px] font-black text-amber-600 dark:text-amber-300 bg-amber-500/10 px-1.5 py-0.5 rounded">
                                                                                    {getAssignmentTeacherIds(item).map(id => {
                                                                                        const range = resolveTeacherPeriodRanges(item, courses.find(c => c.id === item.courseId))[id];
                                                                                        return range ? `ค${range.start}-${range.end}` : '-';
                                                                                    }).join('/')}
                                                                                </span>
                                                                            )}
                                                                        </div>
                                                                    </div>
                                                                </div>
                                                            <button onClick={(e) => { e.stopPropagation(); setPendingQueue(prev => prev.filter((_, i) => i !== idx)); }} className="p-1 text-slate-400 hover:text-red-500"><Trash2 size={14} /></button>
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                            <div className="h-px bg-slate-200 dark:bg-white/5 my-4" />
                                        </div>
                                    )}

                                    {paginatedAssignedCourses.map(course => (
                                        <div key={course.id} className="group/course">
                                            <div 
                                                onClick={() => {
                                                    const dbGroups = course.teacherAssignments || [];
                                                    const queueGroups = pendingQueue.filter(p => p.courseId === course.id);
                                                    
                                                    // Check if all (saved and pending) are selected
                                                    const areSavedSelected = dbGroups.every((g: GroupAssignment) => selectedAssignments.some(a => a.courseId === course.id && a.groupNumber === g.groupNumber && !a.isPending));
                                                    const arePendingSelected = queueGroups.every(g => selectedAssignments.some(a => a.courseId === course.id && a.groupNumber === g.groupNumber && a.isPending));
                                                    
                                                    if (areSavedSelected && arePendingSelected) {
                                                        // Deselect all for this course
                                                        setSelectedAssignments(prev => prev.filter(a => a.courseId !== course.id));
                                                    } else {
                                                        // Select all
                                                        const newSelection = [...selectedAssignments];
                                                        
                                                        dbGroups.forEach((g: GroupAssignment) => {
                                                            if (!newSelection.some(a => a.courseId === course.id && a.groupNumber === g.groupNumber && !a.isPending)) {
                                                                newSelection.push({ courseId: course.id, groupNumber: g.groupNumber });
                                                            }
                                                        });
                                                        
                                                        queueGroups.forEach(g => {
                                                            if (!newSelection.some(a => a.courseId === course.id && a.groupNumber === g.groupNumber && a.isPending)) {
                                                                newSelection.push({ courseId: course.id, groupNumber: g.groupNumber, isPending: true });
                                                            }
                                                        });
                                                        
                                                        setSelectedAssignments(newSelection);
                                                    }
                                                }}
                                                className={`flex items-center gap-1.5 px-2 py-1 rounded-lg sticky top-0 z-10 bg-white dark:bg-[#161a27] hover:bg-slate-50 dark:hover:bg-white/5 cursor-pointer transition-all border border-transparent hover:border-indigo-500/20 ${selectedAssignments.some(a => a.courseId === course.id) ? 'bg-indigo-50/50 dark:bg-indigo-500/5' : ''}`}
                                            >
                                                <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center shrink-0 transition-all ${
                                                    (() => {
                                                        const dbGroups = course.teacherAssignments || [];
                                                        const queueGroups = pendingQueue.filter(p => p.courseId === course.id);
                                                        const total = dbGroups.length + queueGroups.length;
                                                        if (total === 0) return false;
                                                        const selectedCount = selectedAssignments.filter(a => a.courseId === course.id).length;
                                                        return selectedCount === total;
                                                    })() ? 'border-indigo-500 bg-white dark:bg-slate-900 shadow-sm' : 'border-slate-300 dark:border-white/10 bg-slate-50 dark:bg-white/5'
                                                }`}>
                                                    {(() => {
                                                        const dbGroups = course.teacherAssignments || [];
                                                        const queueGroups = pendingQueue.filter(p => p.courseId === course.id);
                                                        const total = dbGroups.length + queueGroups.length;
                                                        if (total === 0) return false;
                                                        const selectedCount = selectedAssignments.filter(a => a.courseId === course.id).length;
                                                        return selectedCount === total;
                                                    })() && <div className="w-2 h-2 rounded-full bg-indigo-500 animate-in zoom-in-50 duration-200" />}
                                                </div>
                                                <div className="flex items-center gap-2 text-[11px] font-bold truncate">
                                                    <span className="text-slate-400 shrink-0 w-3 text-center text-[10px]">{course.semester || '0'}</span>
                                                    <span className="text-slate-900 dark:text-white font-black shrink-0">{course.code}</span>
                                                    <span className="text-slate-600 dark:text-slate-200 truncate">{course.title}</span>
                                                    {course.isElective && (
                                                        <span className="px-1.5 py-0.5 rounded text-[8px] font-bold bg-rose-100 text-rose-600 dark:bg-rose-900/30 dark:text-rose-400 shrink-0">
                                                            วิชาเลือก
                                                        </span>
                                                    )}
                                                </div>
                                                <span className="text-[7px] font-black text-slate-400 dark:text-slate-500 shrink-0 ml-auto">
                                                    {(() => {
                                                        const dbLen = course.teacherAssignments?.length || 0;
                                                        const qLen = pendingQueue.filter(p => p.courseId === course.id).length;
                                                        return `${dbLen + qLen} กลุ่ม`;
                                                    })()}
                                                </span>
                                            </div>
                                            {course.teacherAssignments?.sort((a: any, b: any) => a.groupNumber - b.groupNumber).map((assign: GroupAssignment, idx: number) => {
                                                const isSelected = selectedAssignments.some(a => a.courseId === course.id && a.groupNumber === assign.groupNumber && !a.isPending);
                                                return (
                                                    <div key={idx}
                                                        onClick={() => {
                                                            setSelectedAssignments(prev => {
                                                                const exists = prev.some(a => a.courseId === course.id && a.groupNumber === assign.groupNumber && !a.isPending);
                                                                if (exists) {
                                                                    const newSelection = prev.filter(a => !(a.courseId === course.id && a.groupNumber === assign.groupNumber && !a.isPending));
                                                                    if (newSelection.length === 0) {
                                                                        setSelectedTeacherIds([]);
                                                                        setSelectedRoomId(null);
                                                                    }
                                                                    return newSelection;
                                                                } else {
                                                                    setSelectedTeacherIds(getAssignmentTeacherIds(assign));
                                                                    if (assign.roomIds && assign.roomIds.length > 0) {
                                                                        setSelectedRoomId(assign.roomIds[0]);
                                                                    }
                                                                    if (assign.room) setActiveRoomNumber(assign.room);
                                                                    return [...prev, { courseId: course.id, groupNumber: assign.groupNumber }];
                                                                }
                                                            });
                                                        }}
                                                        className={`ml-2 px-2 py-1.5 rounded-xl flex items-center justify-between cursor-pointer transition-all border ${isSelected ? 'bg-indigo-600/10 dark:bg-indigo-500/10 border-indigo-500/30 shadow-sm' : 'bg-slate-50/50 dark:bg-white/[0.03] border-slate-100 dark:border-white/5 hover:bg-slate-100 dark:hover:bg-white/[0.06] shadow-sm hover:shadow-md'}`}
                                                    >
                                                        <div className="flex items-center gap-2 min-w-0">
                                                            <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0 transition-all ${isSelected ? 'border-indigo-500 bg-white dark:bg-slate-900 shadow-sm' : 'border-slate-300 dark:border-white/10 bg-slate-50 dark:bg-white/5'}`}>
                                                                {isSelected && <div className="w-2.5 h-2.5 rounded-full bg-indigo-500 animate-in zoom-in-50 duration-200" />}
                                                            </div>

                                                            {/* Group Block (Matched with Enrollment Page) */}
                                                            {(() => {
                                                                const groupColors = [
                                                                    { bg: 'bg-blue-600', shadow: 'shadow-blue-600/40' },
                                                                    { bg: 'bg-indigo-600', shadow: 'shadow-indigo-600/40' },
                                                                    { bg: 'bg-violet-600', shadow: 'shadow-violet-600/40' },
                                                                    { bg: 'bg-purple-600', shadow: 'shadow-purple-600/40' },
                                                                    { bg: 'bg-fuchsia-600', shadow: 'shadow-fuchsia-600/40' },
                                                                    { bg: 'bg-pink-600', shadow: 'shadow-pink-600/40' },
                                                                    { bg: 'bg-rose-600', shadow: 'shadow-rose-600/40' },
                                                                ];
                                                                const rawNum = Number(assign.groupNumber) || 1;
                                                                const index = Math.max(0, rawNum - 1) % groupColors.length;
                                                                const gColor = groupColors[index] || groupColors[0];
                                                                return (
                                                                    <div className={`w-9 h-9 rounded-lg flex flex-col items-center justify-center shrink-0 border shadow-sm transition-all ${isSelected ? `${gColor.bg} text-white shadow-lg ${gColor.shadow} scale-105 border-white/20` : 'bg-slate-100 dark:bg-white/[0.03] border-slate-200 dark:border-white/10 text-slate-900 dark:text-white/80'}`}>
                                                                        <span className="text-[6px] uppercase font-black tracking-tighter mb-0.5 opacity-60">กลุ่ม</span>
                                                                        <span className="text-sm font-black leading-none">{assign.groupNumber}</span>
                                                                    </div>
                                                                );
                                                            })()}

                                                            <div className="flex-1 min-w-0 flex flex-col justify-center">
                                                                <div className="flex items-center gap-2 mb-0.5">
                                                                    <span className={`font-mono text-[9px] font-black shrink-0 px-1.5 py-0.5 rounded border ${isSelected ? 'bg-white text-indigo-700 border-indigo-200 shadow-sm dark:bg-white/10 dark:text-white dark:border-white/20' : 'bg-indigo-500/5 text-indigo-600 dark:text-indigo-400 border-indigo-500/10'}`}>
                                                                        {(() => {
                                                                            return getAssignmentTeacherIds(assign).map(id => {
                                                                                const t = teacherMap?.[id] || Object.values(teacherMap || {}).find(u => u.teacherId === id);
                                                                                return t?.teacherId || "N/A";
                                                                            }).join(", ");
                                                                        })()}
                                                                    </span>
                                                                    <h4 className={`text-[11px] font-black truncate tracking-tight ${isSelected ? 'text-slate-900 dark:text-white' : 'text-slate-900 dark:text-white'}`}>
                                                                        {(() => {
                                                                            return getAssignmentTeacherIds(assign).map(id => {
                                                                                const t = teacherMap?.[id] || Object.values(teacherMap || {}).find(u => u.teacherId === id);
                                                                                return t?.name || id;
                                                                            }).join(", ") || "ไม่ระบุครู";
                                                                        })()}
                                                                    </h4>
                                                                    {(() => {
                                                                        const teacherCount = getAssignmentTeacherIds(assign).length;
                                                                        return (
                                                                            <button
                                                                                type="button"
                                                                                onClick={(e) => {
                                                                                    e.stopPropagation();
                                                                                    handleConfigureTeacherHours(
                                                                                        { courseId: course.id, groupNumber: assign.groupNumber },
                                                                                        assign
                                                                                    );
                                                                                }}
                                                                                title={teacherCount >= 2 ? `กำหนดช่วงคาบครูร่วมสอน ${teacherCount} คน` : "เปลี่ยนครูผู้สอน"}
                                                                                className={`relative shrink-0 p-1 rounded-lg transition-all ${isSelected ? 'bg-indigo-100 text-indigo-700 hover:bg-indigo-200 dark:bg-white/20 dark:text-white dark:hover:bg-white/30' : 'bg-indigo-500/10 text-indigo-600 dark:text-indigo-300 hover:bg-indigo-600 hover:text-white'}`}
                                                                            >
                                                                                {teacherCount >= 2 ? <Users size={11} strokeWidth={2.8} /> : <User size={11} strokeWidth={2.8} />}
                                                                                {teacherCount >= 2 && (
                                                                                    <span className="absolute -top-1.5 -right-1.5 min-w-4 h-4 px-1 rounded-full bg-emerald-500 text-white text-[8px] font-black leading-4 shadow-sm">
                                                                                        +{teacherCount}
                                                                                    </span>
                                                                                )}
                                                                            </button>
                                                                        );
                                                                    })()}
                                                                </div>
                                                                
                                                                <div className="flex items-center gap-1.5">
                                                                    {/* Unified Class/Room Badge */}
                                                                    {(() => {
                                                                        const label = getLevelLabel(course.classId);
                                                                        return (label || assign.room) ? (
                                                                            <div className={`flex items-center px-2 py-0.5 rounded-md shrink-0 shadow-sm ${isSelected ? 'bg-white text-indigo-600' : 'bg-indigo-600 text-white'}`}>
                                                                                <span className="text-[9px] font-black uppercase tracking-tighter">
                                                                                    {label}{assign.room ? `/${assign.room}` : ''}
                                                                                </span>
                                                                            </div>
                                                                        ) : null;
                                                                    })()}

                                                                    <div className="flex flex-wrap items-center gap-1">
                                                                        {assign.roomIds?.map((rid: string) => {
                                                                            const room = rooms.find(r => r.id === rid);
                                                                            return room ? (
                                                                                <div key={rid} className={`flex items-center gap-1 border px-1.5 py-0.5 rounded-md shadow-sm ${isSelected ? 'bg-emerald-500 border-emerald-600 text-white shadow-emerald-500/25' : 'bg-emerald-500/10 border-emerald-500/10 text-emerald-600 dark:text-emerald-400'}`}>
                                                                                    <MapPin size={9} className={isSelected ? 'text-white' : 'text-emerald-400'} strokeWidth={3} />
                                                                                    <span className="text-[9px] font-black whitespace-nowrap">
                                                                                        {room.roomCode}
                                                                                    </span>
                                                                                </div>
                                                                            ) : (
                                                                                <div key={rid} className="text-[8px] font-bold text-rose-500 bg-rose-100 dark:bg-rose-500/10 px-1.5 py-0.5 rounded border border-rose-500/20">ไม่ระบุสถานที่</div>
                                                                            );
                                                                        })}
                                                                        {(!assign.roomIds || assign.roomIds.length === 0) && (
                                                                            <div className="text-[8px] font-bold text-rose-500 bg-rose-100 dark:bg-rose-500/10 px-1.5 py-0.5 rounded border border-rose-500/20">ไม่ระบุห้อง</div>
                                                                        )}
                                                                        {getAssignmentTeacherIds(assign).length >= 2 && (
                                                                            <span className={`text-[8px] font-black px-1.5 py-0.5 rounded ${isSelected ? 'bg-white/80 text-indigo-700' : 'bg-indigo-500/10 text-indigo-600 dark:text-indigo-300'}`}>
                                                                                {getAssignmentTeacherIds(assign).map(id => {
                                                                                    const range = resolveTeacherPeriodRanges(assign, course)[id];
                                                                                    return range ? `ค${range.start}-${range.end}` : '-';
                                                                                }).join('/')}
                                                                            </span>
                                                                        )}
                                                                    </div>
                                                                </div>
                                                            </div>
                                                        </div>
                                                        <button onClick={(e) => { e.stopPropagation(); handleRemoveAssignment(course.id, assign.groupNumber); }} className="p-0.5 text-slate-400 hover:text-red-500 transition-all shrink-0"><Trash2 size={11} /></button>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    ))}
                                </>
                            ) : (
                                <div className="h-full flex flex-col items-center justify-center opacity-10 py-20">
                                    <LayoutGrid size={40} className="text-slate-400" />
                                    <p className="text-[9px] font-black mt-2 text-slate-400">ยังไม่มีการมอบหมาย</p>
                                </div>
                            )}
                        </div>
                    </div>

                    <div className="flex flex-col justify-center gap-2 px-1 shrink-0">
                        <FloatingButton 
                            icon={ChevronLeft} 
                            color={roomButtonProps.color}
                            onClick={() => {
                                if (!selectedRoomId) {
                                    Swal.fire({ icon: 'info', title: 'เลือกสถานที่ก่อน', text: 'กรุณาเลือกห้องเรียนจากรายการทางขวาสุด', toast: true, position: 'top-end', timer: 2000, showConfirmButton: false });
                                    return;
                                }
                                if (selectedAssignments.length === 0) {
                                    Swal.fire({ icon: 'info', title: 'เลือกวิชาที่มอบหมายก่อน', text: 'กรุณาเลือกวิชาที่ต้องการระบุสถานที่จากรายการ "รายวิชาที่มอบหมาย"', toast: true, position: 'top-end', timer: 3000, showConfirmButton: false });
                                    return;
                                }
                                handleUpdateRoom();
                            }}
                            label={roomButtonProps.label}
                        />
                        <FloatingButton 
                            icon={ChevronRight} 
                            color="bg-rose-500"
                            onClick={() => {
                                if (selectedAssignments.length > 0) {
                                    handleClearRoomFromAssignment();
                                } else if (selectedRoomId) {
                                    setSelectedRoomId(null);
                                    Swal.fire({ icon: 'success', title: 'ยกเลิกการเลือกห้อง', toast: true, position: 'top-end', timer: 1500, showConfirmButton: false });
                                } else {
                                    Swal.fire({ icon: 'info', title: 'ไม่มีรายการที่เลือก', text: 'กรุณาเลือกห้องหรือวิชาที่มอบหมายก่อน', toast: true, position: 'top-end', timer: 2000, showConfirmButton: false });
                                }
                            }}
                            label={selectedAssignments.length > 0 ? `ยกเลิกสถานที่ ${selectedAssignments.length} รายการ` : 'ยกเลิกการเลือก'}
                        />
                    </div>

                    <div className="flex-[0.8] min-w-0 bg-white dark:bg-[#161a27] rounded-xl border border-slate-200 dark:border-white/5 flex flex-col overflow-hidden shadow-sm dark:shadow-2xl">
                        <PanelHeader title="สถานที่เรียน" icon={MapPin} count={rooms.length} compact />
                        <div className="p-3 bg-slate-50/50 dark:bg-white/[0.02] border-b border-slate-200 dark:border-white/5">
                            <div className="grid grid-cols-2 gap-2">
                                <select value={buildingFilter} onChange={e=>setBuildingFilter(e.target.value)} className="w-full bg-white dark:bg-white/5 border border-slate-200 dark:border-white/5 rounded-xl px-3 py-2 text-[10px] font-bold text-slate-700 dark:text-white outline-none focus:ring-2 focus:ring-indigo-500/20">
                                    {buildings.map(b => <option key={b} value={b} className="bg-white dark:bg-[#161a27] text-slate-900 dark:text-white">{b}</option>)}
                                </select>
                                <div className="relative"><Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={12} /><input type="text" placeholder="ค้นห้อง..." value={roomSearch} onChange={e=>setRoomSearch(e.target.value)} className="w-full pl-9 pr-3 py-2 bg-white dark:bg-white/5 rounded-xl text-[10px] font-bold outline-none border border-slate-200 dark:border-white/5 text-slate-900 dark:text-white shadow-inner focus:ring-2 focus:ring-emerald-500/20 transition-all" /></div>
                            </div>
                        </div>
                        <div className="flex-1 overflow-y-auto custom-scrollbar px-2 py-1 space-y-1">
                            {paginatedRooms.map(room => (
                                <div key={room.id} onClick={() => setSelectedRoomId(prev => prev === room.id ? null : room.id)} className={`px-2.5 py-2 rounded-xl cursor-pointer transition-all border flex items-center gap-2 ${selectedRoomId === room.id ? 'bg-emerald-600/10 dark:bg-emerald-600/20 border-emerald-500/30' : 'border-transparent hover:bg-slate-100 dark:hover:bg-white/5'}`}>
                                    <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center shrink-0 transition-all ${selectedRoomId === room.id ? 'border-emerald-500 bg-white dark:bg-slate-900 shadow-sm' : 'border-slate-300 dark:border-white/10 bg-slate-50 dark:bg-white/5'}`}>
                                        {selectedRoomId === room.id && <div className="w-2 h-2 rounded-full bg-emerald-500 animate-in zoom-in-50 duration-200" />}
                                    </div>
                                    <span className={`text-[8px] font-black px-1.5 py-0.5 rounded shrink-0 ${selectedRoomId === room.id ? 'bg-emerald-500 text-white' : 'bg-slate-200 dark:bg-slate-800 text-slate-600 dark:text-slate-400'}`}>{room.roomCode || "—"}</span>
                                    <h4 className={`text-[10px] font-black truncate flex-1 ${selectedRoomId === room.id ? 'text-emerald-600 dark:text-white' : 'text-slate-800 dark:text-slate-200'}`}>{room.roomName}</h4>
                                    <span className="text-[7px] font-bold text-slate-400 dark:text-slate-500 shrink-0 text-right leading-tight">{room.building && `${room.building}`}{room.floor && ` ชั้น${room.floor}`}</span>
                                </div>
                            ))}
                        </div>
                    </div>

                </main>

                {/* Floating Bottom Save Bar */}
                <AnimatePresence>
                    {pendingQueue.length > 0 && (
                        <motion.div 
                            initial={{ y: 100, opacity: 0 }}
                            animate={{ y: 0, opacity: 1 }}
                            exit={{ y: 100, opacity: 0 }}
                            className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[100] w-full max-w-2xl px-4"
                        >
                            <div className="bg-slate-900/90 dark:bg-indigo-950/90 backdrop-blur-xl border border-white/10 rounded-2xl shadow-[0_20px_50px_rgba(0,0,0,0.5)] p-4 flex items-center justify-between gap-6">
                                <div className="flex items-center gap-4">
                                    <div className="w-12 h-12 rounded-xl bg-amber-500/20 flex items-center justify-center text-amber-400">
                                        <Database size={24} className="animate-pulse" />
                                    </div>
                                    <div>
                                        <h3 className="text-white font-black text-sm leading-tight">กำลังรอบันทึกอัตโนมัติ</h3>
                                        <p className="text-slate-400 text-[10px] font-bold uppercase tracking-widest mt-0.5">
                                            มี {pendingQueue.length} รายการในคิว กดบันทึกตอนนี้ได้หากต้องการส่งเข้าระบบทันที
                                        </p>
                                    </div>
                                </div>

                                <div className="flex items-center gap-3">
                                    <button 
                                        onClick={() => {
                                            Swal.fire({
                                                title: 'ล้างรายการทั้งหมด?',
                                                text: 'รายการที่เตรียมไว้ในคิวจะถูกลบออกทั้งหมด',
                                                icon: 'warning',
                                                showCancelButton: true,
                                                confirmButtonText: 'ล้างข้อมูล',
                                                cancelButtonText: 'ยกเลิก',
                                                confirmButtonColor: '#ef4444',
                                                background: getSwalBg(),
                                                color: getSwalColor()
                                            }).then(res => {
                                                if (res.isConfirmed) {
                                                    setPendingQueue([]);
                                                }
                                            });
                                        }}
                                        className="px-4 py-2 rounded-lg text-slate-400 hover:text-white hover:bg-white/5 transition-all text-[10px] font-black uppercase tracking-wider"
                                    >
                                        ล้างคิว
                                    </button>
                                    <button 
                                        onClick={handleCommitAll}
                                        disabled={isSaving}
                                        className="bg-indigo-600 hover:bg-indigo-500 text-white px-7 py-3 rounded-xl font-black text-sm transition-all shadow-lg shadow-indigo-600/20 flex items-center gap-2 hover:-translate-y-0.5 active:scale-95 disabled:opacity-50"
                                    >
                                        {isSaving ? (
                                            <RefreshCw size={18} className="animate-spin" />
                                        ) : (
                                            <Save size={18} />
                                        )}
                                        บันทึกตอนนี้
                                    </button>
                                </div>
                            </div>
                        </motion.div>
                    )}
                </AnimatePresence>

                <style>{`
                    .custom-scrollbar::-webkit-scrollbar { width: 4px; height: 4px; }
                    .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
                    .custom-scrollbar::-webkit-scrollbar-thumb { background: rgba(0,0,0,0.05); border-radius: 10px; }
                    .dark .custom-scrollbar::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.05); }
                    .custom-scrollbar::-webkit-scrollbar-thumb:hover { background: rgba(0,0,0,0.1); }
                    .dark .custom-scrollbar::-webkit-scrollbar-thumb:hover { background: rgba(255,255,255,0.1); }
                `}</style>
            </div>
        </MainLayout>
    );
};

export default CourseAssignmentPage;
