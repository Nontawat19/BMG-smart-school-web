import React, { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { useParams } from "react-router-dom";
import { firestore as db } from "../../firebase";
import { motion, AnimatePresence } from "framer-motion";
import { collection, query, doc, onSnapshot, where, orderBy, getDocs, setDoc } from "firebase/firestore";
import { useSelector, useDispatch } from "react-redux";
import { RootState } from "../../store";
import { fetchCalendar } from "@/store/slices/calendarSlice";
import { getCurrentThaiYear } from "@/utils/dateUtils";
import MainLayout from "@/layouts/MainLayout";
import {
    Users,
    MapPin,
    BookOpen,
    Search,
    Plus,
    X,
    Save,
    Trash2,
    Loader2,
    RefreshCw,
    Edit2,
    GripVertical,
    ChevronDown,
    ChevronUp,
    Scissors,
    Clock
} from "lucide-react";
import Swal from "sweetalert2";
import Select from "react-select";
import { getActiveSortedTeachers } from "@/utils/teacherSortUtils";
import BackButton from "@/components/Shared/BackButton";

import {
    DndContext,
    DragOverlay,
    PointerSensor,
    useSensor,
    useSensors,
    DragStartEvent,
    DragEndEvent,
    useDraggable,
    useDroppable,
    defaultDropAnimationSideEffects
} from "@dnd-kit/core";
import { CSS } from "@dnd-kit/utilities";

// --- DND Components ---
const DraggableCourseCard = ({ course }: { course: Course }) => {
    const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
        id: `course-${course.id}`,
        data: { type: 'course', course }
    });
    return (
        <div 
            ref={setNodeRef} 
            {...listeners} 
            {...attributes} 
            className={`flex flex-col w-[160px] h-[90px] p-3 bg-white dark:bg-[#161a27] border ${isDragging ? 'border-indigo-500 opacity-50' : 'border-slate-200 dark:border-white/10'} rounded-xl shadow-sm cursor-grab active:cursor-grabbing hover:border-indigo-400 dark:hover:border-indigo-500 transition-colors touch-none z-50 relative`}
        >
            <div className="font-black text-indigo-600 dark:text-indigo-400 text-sm mb-1 truncate">{course.code || 'ไม่มีรหัส'}</div>
            <div className="text-[11px] font-bold text-slate-700 dark:text-slate-300 line-clamp-2 leading-tight flex-1">{course.title || 'ไม่มีชื่อ'}</div>
            <div className="mt-1 text-[10px] text-slate-500 font-bold self-start truncate w-full">
                {course.credits ? `${course.credits} นก.` : '0 นก.'} {course.hoursPerWeek ? `(${course.hoursPerWeek} คาบ)` : ''}
            </div>
        </div>
    );
};

const DragHandle = ({ id, data }: { id: string, data: any }) => {
    const { attributes, listeners, setNodeRef } = useDraggable({
        id,
        data
    });
    return (
        <button
            ref={setNodeRef}
            {...listeners}
            {...attributes}
            className="px-1.5 py-1 text-slate-400 hover:text-rose-500 dark:hover:text-rose-400 cursor-grab active:cursor-grabbing touch-none transition-colors h-full flex items-center justify-center bg-slate-50 hover:bg-rose-50 dark:bg-white/5 dark:hover:bg-rose-500/10"
            title="ลากออกเพื่อลบ"
        >
            <GripVertical size={12} />
        </button>
    );
};

const TeacherDroppableTbody = ({ teacher, children }: { teacher: Teacher, children: React.ReactNode }) => {
    const { isOver, setNodeRef } = useDroppable({
        id: `teacher-${teacher.id}`,
        data: { type: 'teacher', teacherId: teacher.id }
    });

    return (
        <tbody 
            ref={setNodeRef} 
            className={`${isOver ? 'bg-indigo-50/80 dark:bg-indigo-500/10 ring-2 ring-indigo-500 ring-inset relative z-10' : ''}`}
        >
            {children}
        </tbody>
    );
};
// ----------------------


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
    profileImageUrl?: string;
}

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

interface TeacherSelectOption {
    value: string;
    label: string;
    teacherCode: string;
    teacherName: string;
    profileImageUrl?: string;
    subjectGroup?: string;
    initial?: string;
}

const WEEKS_PER_SEMESTER = 20;

const getCourseWeeks = (course?: Pick<Course, 'semester'> | null): number =>
    Number(course?.semester) === 0 ? WEEKS_PER_SEMESTER * 2 : WEEKS_PER_SEMESTER;

const getAssignmentTeacherIds = (assignment: Partial<GroupAssignment> | any): string[] => {
    const ids = Array.isArray(assignment?.teacherIds) && assignment.teacherIds.length > 0
        ? assignment.teacherIds
        : (assignment?.teacherId ? [assignment.teacherId] : []);
    return Array.from(new Set(ids.filter((id: string) => id && id !== 'pending' && !String(id).startsWith('GHOST'))));
};

const getCourseTeachingHours = (course?: Pick<Course, 'credits' | 'hoursPerWeek' | 'semester'> | null) => {
    if (!course) return 0;
    const creditsNum = Number(course.credits || 0);
    const weeklyPeriods = creditsNum > 0 ? Math.round(creditsNum * 2) : Number(course.hoursPerWeek || 0);
    return Math.max(0, Math.round(weeklyPeriods * getCourseWeeks(course)));
};

const getCourseWeeklyTeachingPeriods = (course?: Pick<Course, 'credits' | 'hoursPerWeek'> | null) => {
    if (!course) return 0;
    const creditsNum = Number(course.credits || 0);
    const weeklyPeriods = creditsNum > 0 ? Math.round(creditsNum * 2) : Number(course.hoursPerWeek || 0);
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
    course?: Pick<Course, 'credits' | 'hoursPerWeek'> | null
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
    course?: Pick<Course, 'credits' | 'hoursPerWeek'> | null
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
    const distributed = teacherIds.length >= 2 && totalHours > 0
        ? distributeTeacherHours(teacherIds, totalHours)
        : {};
    let cursor = 1;
    return teacherIds.reduce((acc, id) => {
        const fallbackHours = distributed[id] ?? Number(teacherHours[id] || 0);
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

// Premium select styles
const filterSelectStyles = {
    control: (base: any, state: any) => ({
        ...base,
        backgroundColor: 'var(--select-bg, #ffffff)',
        borderColor: state.isFocused ? '#6366f1' : 'var(--select-border, #e2e8f0)',
        boxShadow: state.isFocused ? '0 0 0 2px rgba(99, 102, 241, 0.1)' : 'none',
        borderRadius: '0.75rem',
        padding: '0',
        fontSize: '13px',
        minHeight: '38px',
        height: '38px',
        '&:hover': {
            borderColor: '#6366f1'
        },
        cursor: 'pointer'
    }),
    valueContainer: (base: any) => ({
        ...base,
        padding: '0 12px',
        height: '38px',
    }),
    menu: (base: any) => ({
        ...base,
        backgroundColor: 'var(--select-menu-bg, #ffffff)',
        borderRadius: '1rem',
        boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.1), 0 8px 10px -6px rgba(0, 0, 0, 0.1)',
        padding: '8px',
        border: '1px solid var(--select-border, #f3f4f6)',
        width: 'max-content',
        minWidth: '200px',
        zIndex: 99999
    }),
    menuPortal: (base: any) => ({
        ...base,
        zIndex: 99999
    }),
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
        fontSize: '12px',
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
        fontSize: '13px',
        whiteSpace: 'nowrap'
    }),
    indicatorSeparator: () => ({ display: 'none' })
};

const miniSelectStyles = {
    control: (base: any, state: any) => ({
        ...base,
        backgroundColor: 'var(--select-bg, #ffffff)',
        borderColor: state.isFocused ? '#6366f1' : 'var(--select-border, #cbd5e1)',
        boxShadow: state.isFocused ? '0 0 0 2px rgba(99, 102, 241, 0.1)' : 'none',
        borderRadius: '0.375rem',
        padding: '0',
        fontSize: '11px',
        minHeight: '26px',
        height: '26px',
        '&:hover': {
            borderColor: '#6366f1'
        },
        cursor: 'pointer'
    }),
    valueContainer: (base: any) => ({
        ...base,
        padding: '0 6px',
        height: '26px',
    }),
    menu: (base: any) => ({
        ...base,
        backgroundColor: 'var(--select-menu-bg, #ffffff)',
        borderRadius: '0.5rem',
        boxShadow: '0 4px 12px -2px rgba(0, 0, 0, 0.12)',
        padding: '4px',
        border: '1px solid var(--select-border, #e2e8f0)',
        width: '240px',
        zIndex: 99999
    }),
    menuPortal: (base: any) => ({
        ...base,
        zIndex: 99999
    }),
    option: (base: any, state: any) => ({
        ...base,
        backgroundColor: state.isSelected 
            ? '#6366f1' 
            : state.isFocused 
                ? 'rgba(99, 102, 241, 0.08)' 
                : 'transparent',
        color: state.isSelected ? '#ffffff' : 'var(--select-text, #334155)',
        borderRadius: '0.25rem',
        margin: '1px 0',
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
        fontSize: '11px'
    }),
    indicatorSeparator: () => ({ display: 'none' }),
    dropdownIndicator: (base: any) => ({
        ...base,
        padding: '2px',
        svg: { width: '12px', height: '12px' }
    }),
    clearIndicator: (base: any) => ({
        ...base,
        padding: '2px',
        svg: { width: '12px', height: '12px' }
    })
};

// Premium Teacher select styles
const teacherSelectStyles = {
    ...filterSelectStyles,
    valueContainer: (base: any) => ({
        ...base,
        padding: '0 12px',
        height: '38px',
        display: 'flex',
        alignItems: 'center'
    }),
    menu: (base: any) => ({
        ...base,
        backgroundColor: 'var(--select-menu-bg, #ffffff)',
        borderRadius: '1rem',
        boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.1), 0 8px 10px -6px rgba(0, 0, 0, 0.1)',
        padding: '8px',
        border: '1px solid var(--select-border, #f3f4f6)',
        width: '100%',
        minWidth: '280px',
        zIndex: 100
    }),
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
        fontSize: '12px',
        fontWeight: state.isSelected ? '700' : '500',
        '&:active': {
            backgroundColor: '#6366f1'
        }
    }),
    singleValue: (base: any) => ({ 
        ...base, 
        color: 'var(--select-text, #1e293b)', 
        fontWeight: '700',
        fontSize: '13px'
    })
};

const formatTeacherOptionLabel = (option: any, { context }: { context: 'menu' | 'value' }) => {
    const isMenu = context === 'menu';
    if (option.value === 'ทั้งหมด') {
        return (
            <div className="flex items-center gap-2 py-0.5">
                <div className={`${isMenu ? 'w-8 h-8' : 'w-6 h-6 text-[10px]'} rounded-full bg-indigo-100 dark:bg-indigo-500/20 text-indigo-600 dark:text-indigo-400 flex items-center justify-center font-bold text-xs shrink-0`}>
                    ALL
                </div>
                <div className="flex flex-col min-w-0">
                    <span className="font-bold text-slate-800 dark:text-slate-200 text-xs truncate">ครูทุกคน</span>
                    {isMenu && (
                        <span className="text-[10px] text-slate-400 dark:text-slate-500 truncate">แสดงผลรวมของครูทุกคน</span>
                    )}
                </div>
            </div>
        );
    }

    return (
        <div className="flex items-center gap-2 py-0.5">
            {option.profileImageUrl ? (
                <img 
                    src={option.profileImageUrl} 
                    alt={option.label} 
                    className={`${isMenu ? 'w-8 h-8' : 'w-6 h-6'} rounded-full object-cover border border-slate-200 dark:border-white/10 shrink-0`}
                    onError={(e) => {
                        (e.target as HTMLElement).style.display = 'none';
                    }}
                />
            ) : (
                <div className={`${isMenu ? 'w-8 h-8' : 'w-6 h-6 text-[10px]'} rounded-full bg-indigo-50 dark:bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 flex items-center justify-center font-bold text-xs border border-indigo-100/50 dark:border-white/5 shrink-0`}>
                    {option.label.charAt(0)}
                </div>
            )}
            <div className="flex flex-col min-w-0">
                <span className="font-bold text-slate-800 dark:text-slate-200 text-xs leading-tight truncate">{option.label}</span>
                {isMenu && (
                    <span className="text-[10px] text-slate-400 dark:text-slate-500 leading-none truncate">
                        {option.teacherId ? `รหัส: ${option.teacherId}` : ''} {option.subjectGroup ? `• ${option.subjectGroup}` : ''}
                    </span>
                )}
            </div>
        </div>
    );
};

const multiSelectStyles = {
    ...filterSelectStyles,
    control: (base: any, state: any) => ({
        ...base,
        backgroundColor: 'var(--select-bg, #ffffff)',
        borderColor: state.isFocused ? '#6366f1' : 'var(--select-border, #e2e8f0)',
        boxShadow: state.isFocused ? '0 0 0 2px rgba(99, 102, 241, 0.1)' : 'none',
        borderRadius: '0.75rem',
        padding: '2px',
        fontSize: '13px',
        minHeight: '38px',
        '&:hover': {
            borderColor: '#6366f1'
        },
        cursor: 'pointer'
    }),
    valueContainer: (base: any) => ({
        ...base,
        padding: '0 8px',
    }),
    multiValue: (base: any) => ({
        ...base,
        backgroundColor: 'rgba(99, 102, 241, 0.15)',
        borderRadius: '0.625rem',
        margin: '2px',
        border: '1px solid rgba(99, 102, 241, 0.2)',
    }),
    multiValueLabel: (base: any) => ({
        ...base,
        color: '#6366f1',
        fontWeight: '700',
        fontSize: '11px',
        padding: '2px 6px',
    }),
    multiValueRemove: (base: any) => ({
        ...base,
        color: '#6366f1',
        borderRadius: '0 0.5rem 0.5rem 0',
        ':hover': {
            backgroundColor: 'rgba(99, 102, 241, 0.25)',
            color: '#4f46e5',
        },
    }),
};

const coTeacherMultiSelectStyles = {
    ...multiSelectStyles,
    menu: (base: any) => ({
        ...base,
        backgroundColor: 'var(--select-menu-bg, #ffffff)',
        borderRadius: '1rem',
        boxShadow: '0 16px 32px -14px rgba(15, 23, 42, 0.24)',
        padding: '8px',
        border: '1px solid var(--select-border, #334155)',
        width: '100%',
        minWidth: '320px',
        zIndex: 99999
    }),
    menuList: (base: any) => ({
        ...base,
        display: 'block',
        padding: 0,
        maxHeight: '240px',
    }),
    option: (base: any, state: any) => ({
        ...base,
        backgroundColor: state.isSelected
            ? 'rgba(99, 102, 241, 0.16)'
            : state.isFocused
                ? 'rgba(99, 102, 241, 0.08)'
                : 'var(--select-bg, #ffffff)',
        color: 'var(--select-text, #334155)',
        borderRadius: '0.875rem',
        margin: '0 0 5px 0',
        minHeight: '42px',
        padding: '7px 10px',
        border: state.isSelected
            ? '1px solid rgba(129, 140, 248, 0.55)'
            : '1px solid rgba(148, 163, 184, 0.18)',
        cursor: 'pointer',
        boxShadow: state.isSelected
            ? '0 8px 20px -14px rgba(99, 102, 241, 0.45), inset 0 0 0 1px rgba(129, 140, 248, 0.15)'
            : 'inset 0 1px 0 rgba(255,255,255,0.02)',
        transition: 'all 140ms ease',
        '&:active': {
            backgroundColor: 'rgba(99, 102, 241, 0.12)'
        }
    }),
};

const renderCoTeacherOptionLabel = (
    option: TeacherSelectOption,
    context: 'menu' | 'value',
    selectedValues: TeacherSelectOption[]
) => {
    if (context === 'value') {
        return `${option.teacherCode} ${option.teacherName}`;
    }

    const checked = selectedValues.some(item => item.value === option.value);
    return (
        <div className="flex items-center gap-3 min-w-0 w-full">
            <span className="flex h-5 w-5 shrink-0 items-center justify-center">
                <input
                    type="checkbox"
                    checked={checked}
                    readOnly
                    tabIndex={-1}
                    className="h-4 w-4 cursor-pointer rounded border border-slate-400/60 bg-slate-100 text-indigo-500 accent-indigo-500 pointer-events-none"
                    aria-hidden="true"
                />
            </span>
            <span className="relative flex h-8 w-8 shrink-0 items-center justify-center">
                {option.profileImageUrl ? (
                    <img
                        src={option.profileImageUrl}
                        alt={option.teacherName}
                        className="h-8 w-8 rounded-full object-cover border border-slate-500/30 shadow-sm"
                    />
                ) : (
                    <span className="flex h-8 w-8 items-center justify-center rounded-full border border-slate-500/35 bg-slate-600/35 text-[11px] font-black text-slate-200 shadow-inner">
                        {option.initial || option.teacherName.charAt(0)}
                    </span>
                )}
                <span className="absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-[#243146] bg-emerald-400 shadow-sm" />
            </span>
            <span className="min-w-0 flex-1 truncate text-[13px] font-semibold text-slate-200 dark:text-slate-200">
                <span
                    className={`mr-2.5 inline-flex min-w-[68px] items-center justify-center rounded-lg border px-2 py-0.5 text-[10px] font-black font-mono tracking-[0.04em] ${
                        checked
                            ? 'border-amber-400/35 bg-amber-400/12 text-amber-300'
                            : 'border-amber-500/25 bg-amber-400/8 text-amber-300/95'
                    }`}
                >
                    {option.teacherCode}
                </span>
                <span className={`align-middle ${checked ? 'text-white' : 'text-slate-200'}`}>
                    {option.teacherName}
                </span>
            </span>
        </div>
    );
};


const getSwalBg = () => document.documentElement.classList.contains('dark') ? '#161a27' : '#ffffff';
const getSwalColor = () => document.documentElement.classList.contains('dark') ? '#f8fafc' : '#0f172a';
const getSwalPeriodStyles = () => {
    const d = document.documentElement.classList.contains('dark');
    return `<style>
        .teacher-hour-split { text-align: left; display: grid; gap: 12px; margin-top: 12px; }
        .teacher-hour-total { padding: 10px 12px; border-radius: 12px; background: ${d ? '#1e3a5f' : '#eef2ff'}; color: ${d ? '#a5b4fc' : '#3730a3'}; font-size: 14px; font-weight: 800; }
        .teacher-hour-row { display: grid; grid-template-columns: minmax(0, 1fr) 180px; gap: 12px; align-items: center; }
        .teacher-label-text { color: ${d ? '#f1f5f9' : '#1e293b'} !important; font-size: 14px; font-weight: 800; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .teacher-period-inputs { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
        .teacher-period-inputs label { display: grid; gap: 4px; }
        .teacher-period-inputs small { color: ${d ? '#94a3b8' : '#64748b'}; font-size: 10px; font-weight: 900; text-align: center; }
        .teacher-period-inputs select { width: 100%; border: 1px solid ${d ? '#475569' : '#cbd5e1'}; border-radius: 10px; padding: 8px 10px; font-size: 15px; font-weight: 900; text-align: center; color: ${d ? '#ffffff' : '#1e293b'}; background: ${d ? '#1e293b' : '#f1f5f9'}; }
        .teacher-period-inputs select:focus { outline: none; border-color: #6366f1; box-shadow: 0 0 0 3px rgba(99, 102, 241, 0.16); }
        .teacher-hour-note { color: ${d ? '#94a3b8' : '#64748b'}; font-size: 12px; font-weight: 700; margin: 0; }
    </style>`;
};

const CourseAssignmentPage2: React.FC = () => {
    const dispatch = useDispatch();
    const { availableClassOptions, classKeys } = useSelector((state: RootState) => state.schoolSettings);
    const { schoolId: urlSchoolId } = useParams<{ schoolId?: string }>();
    const currentUser = useSelector((state: RootState) => state.auth.user);
    const schoolId = urlSchoolId || (currentUser as any)?.schoolId;

    // Data States
    const [courses, setCourses] = useState<Course[]>([]);
    const [rooms, setRooms] = useState<Room[]>([]);
    const [subjectGroupsList, setSubjectGroupsList] = useState<{id: string, name: string, code: string}[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isSaving, setIsSaving] = useState(false);
    const autoSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const saveInFlightRef = useRef(false);

    // Selection States
    const [pendingQueue, setPendingQueue] = useState<{ courseId: string, teacherId: string, teacherIds?: string[], teacherHours?: Record<string, number>, teacherPeriods?: Record<string, { start: number; end: number }>, roomIds: string[], groupNumber: number, room?: string, title: string, code: string, classId: any }[]>([]);

    const academicYear = useSelector((state: RootState) => state.calendar.academicYear) || String(getCurrentThaiYear());
    const [selectedYear, setSelectedYear] = useState<string>(academicYear);
    const [selectedSemester, setSelectedSemester] = useState<string>("1");
    const [availableYears, setAvailableYears] = useState<string[]>([]);
    const [semesterAssignments, setSemesterAssignments] = useState<any[]>([]);

    // Search/Filter States
    const [teacherSearch, setTeacherSearch] = useState("");
    const [selectedTeacherId, setSelectedTeacherId] = useState("ทั้งหมด");
    const [courseSearch, setCourseSearch] = useState("");
    const [subjectGroupFilter, setSubjectGroupFilter] = useState("กลุ่มสาระทั้งหมด");
    const [categoryFilter, setCategoryFilter] = useState("ทั้งหมด");
    const [selectedLevel, setSelectedLevel] = useState("ทั้งหมด");
    const [showOnlyAssignedTeachers, setShowOnlyAssignedTeachers] = useState(false);

    // Inline assignment form states
    const [assignTeacherId, setAssignTeacherId] = useState<string | null>(null);
    const [assignCourseId, setAssignCourseId] = useState<string>("");
    const [assignGroupNumber, setAssignGroupNumber] = useState<number>(1);
    const [assignRoomSuffix, setAssignRoomSuffix] = useState<string>("1");
    const [assignPhysicalRoomId, setAssignPhysicalRoomId] = useState<string>("");
    const [assignCoTeacherIds, setAssignCoTeacherIds] = useState<string[]>([]);

    // --- DND States & Handlers ---
    const [activeDragItem, setActiveDragItem] = useState<any>(null);
    const sensors = useSensors(
        useSensor(PointerSensor, { activationConstraint: { distance: 5 } })
    );

    const handleDragStart = (event: DragStartEvent) => {
        setActiveDragItem(event.active.data.current);
    };

    const handleRemoveGroupInModalForDrag = async (courseId: string, groupNumber: number, isPending: boolean) => {
        if (isPending) {
            setPendingQueue(prev => prev.filter(p => !(p.courseId === courseId && p.groupNumber === groupNumber)));
            Swal.fire({ icon: 'success', title: 'ลบวิชาร่างเรียบร้อย', toast: true, position: 'top-end', timer: 1500, showConfirmButton: false });
        } else {
            if (schoolId) {
                try {
                    const courseObj = coursesWithAssignments.find(c => c.id === courseId);
                    if (!courseObj) return;

                    const updated = (courseObj.teacherAssignments || []).filter((a: any) => a.groupNumber !== groupNumber);
                    const assignmentId = `${courseId}_${selectedYear}_${selectedSemester}`;
                    
                    await setDoc(doc(db, 'school-settings', schoolId, 'course_assignments', assignmentId), removeUndefinedFields({
                        courseId: courseId,
                        academicYear: selectedYear,
                        semester: selectedSemester,
                        teacherAssignments: updated
                    }), { merge: true });

                    setSemesterAssignments(prev => {
                        const idx = prev.findIndex(item => item.courseId === courseId);
                        const next = [...prev];
                        if (idx !== -1) {
                            next[idx] = { ...next[idx], teacherAssignments: updated };
                        }
                        return next;
                    });

                    Swal.fire({ icon: 'success', title: 'ลบข้อมูลจริงสำเร็จ', toast: true, position: 'top-end', timer: 1500, showConfirmButton: false });
                } catch (error) {
                    console.error("Failed to delete group assignment:", error);
                    Swal.fire({ icon: 'error', title: 'เกิดข้อผิดพลาดในการลบ' });
                }
            }
        }
    };

    const handleDragEnd = async (event: DragEndEvent) => {
        setActiveDragItem(null);
        const { active, over } = event;

        if (!over && active.data.current?.type === 'assigned-group') {
            const { courseId, groupNumber, isPending } = active.data.current;
            const result = await Swal.fire({
                title: 'ลบรายวิชานี้?',
                text: `ต้องการลบกลุ่มที่ ${groupNumber} ออกจากครูผู้สอนใช่หรือไม่?`,
                icon: 'warning',
                showCancelButton: true,
                confirmButtonColor: '#ef4444',
                confirmButtonText: 'ลบออก',
                cancelButtonText: 'ยกเลิก',
                background: getSwalBg(),
                color: getSwalColor()
            });
            if (result.isConfirmed) {
                 handleRemoveGroupInModalForDrag(courseId, groupNumber, isPending);
            }
            return;
        }

        if (!over) return;

        if (active.data.current?.type === 'course' && over.data.current?.type === 'teacher') {
            const course = active.data.current.course;
            const teacherId = over.data.current.teacherId;
            
            const dbGroupsCount = course.teacherAssignments?.length || 0;
            const draftGroupsCount = pendingQueue.filter(p => p.courseId === course.id).length;
            const nextGroupNum = dbGroupsCount + draftGroupsCount + 1;
            
            const isAlreadyAssigned = (course.teacherAssignments || []).some((a: any) => a.groupNumber === nextGroupNum) ||
                                      pendingQueue.some(p => p.courseId === course.id && p.groupNumber === nextGroupNum);

            if (isAlreadyAssigned) {
                 Swal.fire({ icon: "warning", title: "กลุ่มการเรียนซ้ำซ้อน", text: `วิชานี้ถูกมอบหมายไปแล้ว โปรดจัดการในโหมดปกติ`, background: getSwalBg(), color: getSwalColor() });
                 return;
            }

            const newDraftItem = {
                courseId: course.id,
                teacherId: teacherId,
                teacherIds: [teacherId],
                roomIds: [],
                groupNumber: nextGroupNum,
                room: String(nextGroupNum),
                title: course.title,
                code: course.code,
                classId: course.classId || "m1",
            };

            setPendingQueue(prev => [...prev, newDraftItem]);
            Swal.fire({
                icon: 'success',
                title: 'มอบหมายสำเร็จ',
                text: `มอบหมายวิชา ${course.code} ให้ครูเรียบร้อย (ฉบับร่าง)`,
                toast: true,
                position: 'top-end',
                timer: 1500,
                showConfirmButton: false,
                background: getSwalBg(),
                color: getSwalColor()
            });
        }
    };


    const [isManageModalOpen, setIsManageModalOpen] = useState(false);
    const [manageTeacherId, setManageTeacherId] = useState<string | null>(null);
    const [manageCourseId, setManageCourseId] = useState<string | null>(null);
    const [collapsedTeachers, setCollapsedTeachers] = useState<Record<string, boolean>>({});
    const [editingRoomKey, setEditingRoomKey] = useState<string | null>(null);

    const toggleTeacherCollapse = (teacherId: string) => {
        setCollapsedTeachers(prev => ({
            ...prev,
            [teacherId]: !prev[teacherId]
        }));
    };
    const [editingGroups, setEditingGroups] = useState<{
        groupNumber: number;
        room: string;
        roomIds: string[];
        isPending: boolean;
        coTeacherIds: string[];
        teacherHours?: Record<string, number>;
        teacherPeriods?: Record<string, { start: number; end: number }>;
    }[]>([]);

    const { teachers: teacherMap } = useSelector((state: RootState) => state.userMap);

    // Auto-save draft to localStorage
    useEffect(() => {
        const savedDraft = localStorage.getItem(`assignment_draft_v2_${schoolId}`);
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
            localStorage.setItem(`assignment_draft_v2_${schoolId}`, JSON.stringify(pendingQueue));
        } else {
            localStorage.removeItem(`assignment_draft_v2_${schoolId}`);
        }
    }, [pendingQueue, schoolId]);

    const getLevelLabel = (id: CourseClassId | undefined): string => {
        if (!id) return "";
        if (Array.isArray(id)) {
            return id.map(level => getLevelLabel(level)).filter(Boolean).join(", ");
        }

        const map: Record<string, string> = {
            k1: 'อนุบาล 1', k2: 'อนุบาล 2', k3: 'อนุบาล 3',
            p1: 'ป.1', p2: 'ป.2', p3: 'ป.3', p4: 'ป.4', p5: 'ป.5', p6: 'ป.6',
            m1: 'ม.1', m2: 'ม.2', m3: 'ม.3', m4: 'ม.4', m5: 'ม.5', m6: 'ม.6',
            junior_high: 'ม.ต้น', senior_high: 'ม.ปลาย',
            'ม.ต้น': 'ม.ต้น', 'ม.ปลาย': 'ม.ปลาย'
        };
        return map[id] || id;
    };

    const teacherList = useMemo(() => getActiveSortedTeachers(Object.values(teacherMap) as Teacher[]), [teacherMap]);

    const teacherOptions = useMemo(() => {
        const options = [
            { value: 'ทั้งหมด', label: 'ครูทุกคน', profileImageUrl: '', teacherId: '', subjectGroup: 'แสดงครูทุกคน' }
        ];
        teacherList.forEach(t => {
            options.push({
                value: t.id,
                label: t.name,
                profileImageUrl: t.profileImageUrl || '',
                teacherId: t.teacherId || '',
                subjectGroup: t.subjectGroup || 'ไม่มีกลุ่มสาระ'
            });
        });
        return options;
    }, [teacherList]);

    const customTeacherFilterOption = (option: any, rawInput: string) => {
        const input = rawInput.toLowerCase().trim();
        if (!input) return true;
        if (option.value === 'ทั้งหมด') return false;

        const nameMatch = (option.data.label || '').toLowerCase().includes(input);
        const idMatch = (option.data.teacherId || '').toLowerCase().includes(input);
        const groupMatch = (option.data.subjectGroup || '').toLowerCase().includes(input);
        return nameMatch || idMatch || groupMatch;
    };

    const resolveTeacherForAssignmentId = (teacherId: string) => {
        return (teacherMap?.[teacherId] as Teacher | undefined)
            || (Object.values(teacherMap || {}) as Teacher[]).find(teacher => teacher.teacherId === teacherId);
    };

    const normalizeTeacherIdForLoad = (teacherId: string) => {
        return resolveTeacherForAssignmentId(teacherId)?.id || teacherId;
    };

    const dynamicLevelOptions = useMemo(() => {
        const options = [{ value: 'ทั้งหมด', label: 'ระดับชั้น ทั้งหมด' }];
        availableClassOptions.forEach(([key, label]) => {
            options.push({ value: key, label });
            if (key === 'm3') options.push({ value: 'junior_high', label: 'ม.ต้น' });
            if (key === 'm6') options.push({ value: 'senior_high', label: 'ม.ปลาย' });
        });

        const hasJunior = classKeys.some(k => ['m1', 'm2', 'm3'].includes(k));
        const hasSenior = classKeys.some(k => ['m4', 'm5', 'm6'].includes(k));
        if (hasJunior && !options.find(option => option.value === 'junior_high')) {
            options.push({ value: 'junior_high', label: 'ม.ต้น' });
        }
        if (hasSenior && !options.find(option => option.value === 'senior_high')) {
            options.push({ value: 'senior_high', label: 'ม.ปลาย' });
        }

        return options;
    }, [availableClassOptions, classKeys]);

    const coursesWithAssignments = useMemo(() => {
        return courses.map(course => {
            const assignment = semesterAssignments.find(a => a.courseId === course.id);
            return {
                ...course,
                teacherAssignments: assignment ? assignment.teacherAssignments : (course.teacherAssignments || [])
            };
        });
    }, [courses, semesterAssignments]);

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

    const isSubjectGroupMatch = (courseGroup?: string, selectedGroup?: string) => {
        if (!selectedGroup || selectedGroup === "กลุ่มสาระทั้งหมด") return true;
        if (!courseGroup) return false;

        const courseInfo = getSubjectGroupInfo(courseGroup);
        const selectedInfo = getSubjectGroupInfo(selectedGroup);
        const courseValues = [courseGroup, courseInfo?.id, courseInfo?.code, courseInfo?.name].filter(Boolean) as string[];
        const selectedValues = [selectedGroup, selectedInfo?.id, selectedInfo?.code, selectedInfo?.name].filter(Boolean) as string[];

        return courseValues.some(courseValue =>
            selectedValues.some(selectedValue =>
                courseValue === selectedValue ||
                normalizeSubjectGroupValue(courseValue) === normalizeSubjectGroupValue(selectedValue)
            )
        );
    };

    const matchesCourseType = (course: Course) => {
        if (categoryFilter === "ทั้งหมด") return true;
        if (categoryFilter === "วิชาเลือกเสรี") return course.isElective === true;
        return String(course.type || "").trim().toLowerCase() === categoryFilter.trim().toLowerCase();
    };

    const matchesCourseSemester = (course: Course) => {
        if (selectedSemester === "0") return true;
        const courseSem = String(course.semester || "0").trim();
        return courseSem === selectedSemester || courseSem === "0" || courseSem === "";
    };

    const matchesLevel = (courseClassId: CourseClassId | undefined): boolean => {
        if (selectedLevel === "ทั้งหมด") return true;
        if (!courseClassId) return false;

        if (Array.isArray(courseClassId)) {
            return courseClassId.some(level => matchesLevel(level));
        }
        
        const cid = courseClassId.toString().toLowerCase().trim();
        const sid = selectedLevel.toLowerCase().trim();

        if (cid === sid) return true;

        const thaiMapping: Record<string, string[]> = {
            'm1': ['ม.1'], 'm2': ['ม.2'], 'm3': ['ม.3'],
            'm4': ['ม.4'], 'm5': ['ม.5'], 'm6': ['ม.6'],
            'p1': ['ป.1'], 'p2': ['ป.2'], 'p3': ['ป.3'],
            'p4': ['ป.4'], 'p5': ['ป.5'], 'p6': ['ป.6'],
            'k1': ['อ.1', 'อนุบาล 1'], 'k2': ['อ.2', 'อนุบาล 2'], 'k3': ['อ.3', 'อนุบาล 3']
        };

        if (thaiMapping[sid]?.includes(cid)) return true;

        if (sid === "junior_high" || sid === "ม.ต้น") {
            return ["m1", "m2", "m3", "junior_high", "ม.ต้น", "ม.1", "ม.2", "ม.3"].includes(cid);
        }
        if (sid === "senior_high" || sid === "ม.ปลาย") {
            return ["m4", "m5", "m6", "senior_high", "ม.ปลาย", "ม.4", "ม.5", "ม.6"].includes(cid);
        }
        return false;
    };

    const courseMatchesActiveFilters = (course: Course) => {
        const matchesSearch = !courseSearch ||
            (course.title?.toLowerCase() || "").includes(courseSearch.toLowerCase()) ||
            (course.code?.toLowerCase() || "").includes(courseSearch.toLowerCase());
        const matchesGroup = isSubjectGroupMatch(course.subjectGroup, subjectGroupFilter);
        const matchesLevelFilter = matchesLevel(course.classId);
        const matchesType = matchesCourseType(course);
        const matchesSemester = matchesCourseSemester(course);

        return matchesSearch && matchesGroup && matchesLevelFilter && matchesType && matchesSemester;
    };

    const getTeacherWeeklyLoadForAssignment = (assignment: Partial<GroupAssignment> | any, course: Course, teacherId: string) => {
        const weeklyPeriods = getCourseWeeklyTeachingPeriods(course);
        const semesterPeriods = getCourseTeachingHours(course);
        if (weeklyPeriods <= 0) return 0;

        const rawTeacherIds = getAssignmentTeacherIds(assignment);
        const matchedRawId = rawTeacherIds.find(id => normalizeTeacherIdForLoad(id) === teacherId || id === teacherId);
        if (!matchedRawId) return 0;

        const teacherHours = resolveTeacherHours(assignment, course);
        const assignedSemesterHours = Number(teacherHours[matchedRawId] ?? teacherHours[teacherId] ?? semesterPeriods ?? 0);
        return semesterPeriods > 0
            ? (assignedSemesterHours / semesterPeriods) * weeklyPeriods
            : weeklyPeriods;
    };

    const calendarState = useSelector((state: RootState) => state.calendar);

    // Initial configuration & listeners
    useEffect(() => {
        if (!schoolId) return;

        if (calendarState.status === 'idle') {
            dispatch(fetchCalendar(schoolId) as any);
        }

        const fetchInitialSettings = async () => {
            try {
                const calendarColRef = collection(db, 'school-settings', schoolId, 'main_calendar');
                const calendarColSnap = await getDocs(calendarColRef);
                const years = calendarColSnap.docs
                    .map(doc => doc.id)
                    .filter(id => id !== 'default')
                    .sort((a, b) => b.localeCompare(a));
                
                setAvailableYears(years);
                
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
            setSubjectGroupsList(data);
        });

        return () => {
            unsubCourses();
            unsubRooms();
            unsubGroups();
        };
    }, [schoolId]);

    // Listener for semester assignments
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

    // Aggregate teaching hours and courses by teacher
    const teachersData = useMemo(() => {
        return teacherList.map(teacher => {
            // Find assignments in database
            const dbAssignments: { course: Course, group: GroupAssignment }[] = [];
            coursesWithAssignments.forEach(course => {
                course.teacherAssignments?.forEach((ta: any) => {
                    const ids = getAssignmentTeacherIds(ta);
                    if (ids.some(id => normalizeTeacherIdForLoad(id) === teacher.id) || normalizeTeacherIdForLoad(ta.teacherId) === teacher.id) {
                        dbAssignments.push({ course, group: ta });
                    }
                });
            });

            // Find assignments in local pending queue
            const localAssignments: { course: Course, group: any }[] = [];
            pendingQueue.forEach(item => {
                const ids = getAssignmentTeacherIds(item);
                if (ids.some(id => normalizeTeacherIdForLoad(id) === teacher.id) || normalizeTeacherIdForLoad(item.teacherId) === teacher.id) {
                    const course = coursesWithAssignments.find(c => c.id === item.courseId);
                    if (course) {
                        localAssignments.push({
                            course,
                            group: {
                                groupNumber: item.groupNumber,
                                room: item.room,
                                teacherId: item.teacherId,
                                teacherIds: item.teacherIds,
                                teacherHours: item.teacherHours,
                                teacherPeriods: item.teacherPeriods,
                                roomIds: item.roomIds,
                                isPending: true
                            }
                        });
                    }
                }
            });

            // Combine both sources
            const allItems = [...dbAssignments.map(d => ({ ...d, isPending: false })), ...localAssignments.map(l => ({ ...l, isPending: true }))];

            // Group by Course ID
            const courseGroupMap: Record<string, {
                course: Course;
                groups: {
                    groupNumber: number;
                    room: string;
                    roomIds: string[];
                    isPending: boolean;
                    coTeacherIds: string[];
                    teacherLoad: number;
                    periodLabel?: string;
                    teacherHours?: Record<string, number>;
                    teacherPeriods?: Record<string, { start: number; end: number }>;
                }[]
            }> = {};

            allItems.forEach(item => {
                if (!courseGroupMap[item.course.id]) {
                    courseGroupMap[item.course.id] = {
                        course: item.course,
                        groups: []
                    };
                }
                const ids = getAssignmentTeacherIds(item.group);
                const coTeachers = ids.filter(id => normalizeTeacherIdForLoad(id) !== teacher.id);
                const teacherLoad = getTeacherWeeklyLoadForAssignment(item.group, item.course, teacher.id);
                const ranges = resolveTeacherPeriodRanges(item.group, item.course);
                const teacherRange = ranges[teacher.id] || ranges[ids.find(id => normalizeTeacherIdForLoad(id) === teacher.id) || ""];

                courseGroupMap[item.course.id].groups.push({
                    groupNumber: item.group.groupNumber,
                    room: item.group.room || "",
                    roomIds: item.group.roomIds || [],
                    isPending: item.isPending,
                    coTeacherIds: coTeachers,
                    teacherLoad,
                    periodLabel: coTeachers.length > 0 && teacherRange ? `ค${teacherRange.start}-${teacherRange.end}` : undefined,
                    teacherHours: item.group.teacherHours,
                    teacherPeriods: item.group.teacherPeriods
                });
            });

            const aggregatedRows = Object.values(courseGroupMap).map(({ course, groups }) => {
                // Sort groups by groupNumber
                groups.sort((a, b) => a.groupNumber - b.groupNumber);

                const weeklyPeriods = getCourseWeeklyTeachingPeriods(course);
                const totalPeriodsTaught = groups.reduce((sum, group) => sum + group.teacherLoad, 0);
                const weeks = getCourseWeeks(course);
                const totalSemesterHours = Math.round(totalPeriodsTaught * weeks);
                const isFullYear = Number(course.semester) === 0;

                return {
                    course,
                    groups,
                    weeklyPeriods,
                    totalPeriodsTaught,
                    totalSemesterHours,
                    isFullYear
                };
            });

            // Compute total weekly load (periods/week) — used for load color threshold
            const totalLoad = aggregatedRows.reduce((acc, row) => acc + row.totalPeriodsTaught, 0);
            // Compute total semester/year hours across all courses
            const totalSemesterLoad = aggregatedRows.reduce((acc, row) => acc + row.totalSemesterHours, 0);

            return {
                teacher,
                assignedCourses: aggregatedRows,
                totalLoad,
                totalSemesterLoad
            };
        });
    }, [teacherList, coursesWithAssignments, pendingQueue, courses, teacherMap]);

    // Filtering teachers and courses
    const filteredTeachersData = useMemo(() => {
        return teachersData.reduce<typeof teachersData>((acc, { teacher, assignedCourses, totalLoad, totalSemesterLoad }) => {
            // Match teacher selected dropdown
            if (selectedTeacherId !== "ทั้งหมด" && teacher.id !== selectedTeacherId) {
                return acc;
            }

            // Match teacher search
            const matchTeacher = (teacher.name || '').toLowerCase().includes(teacherSearch.toLowerCase()) ||
                                 String(teacher.teacherId || '').toLowerCase().includes(teacherSearch.toLowerCase());
            if (!matchTeacher) return acc;

            const visibleAssignments = assignedCourses.filter(({ course }) => courseMatchesActiveFilters(course));
            const hasCourseFilters = Boolean(courseSearch) ||
                selectedLevel !== "ทั้งหมด" ||
                subjectGroupFilter !== "กลุ่มสาระทั้งหมด" ||
                categoryFilter !== "ทั้งหมด";

            if (hasCourseFilters && visibleAssignments.length === 0) {
                return acc;
            }

            // Match assignment check
            const visibleLoad = visibleAssignments.reduce((sum, row) => sum + row.totalPeriodsTaught, 0);
            const nextLoad = hasCourseFilters ? visibleLoad : totalLoad;
            const nextSemesterLoad = hasCourseFilters
                ? visibleAssignments.reduce((sum, row) => sum + row.totalSemesterHours, 0)
                : totalSemesterLoad;
            if (showOnlyAssignedTeachers && nextLoad === 0) return acc;

            acc.push({
                teacher,
                assignedCourses: hasCourseFilters ? visibleAssignments : assignedCourses,
                totalLoad: nextLoad,
                totalSemesterLoad: nextSemesterLoad
            });
            return acc;
        }, []);
    }, [teachersData, teacherSearch, selectedTeacherId, subjectGroupFilter, categoryFilter, courseSearch, selectedLevel, showOnlyAssignedTeachers]);

    const assignmentSummary = useMemo(() => {
        const assignedTeachers = teachersData.filter(item => item.totalLoad > 0).length;
        const assignedCourses = teachersData.reduce((sum, item) => sum + item.assignedCourses.length, 0);
        const assignedGroups = teachersData.reduce((sum, item) =>
            sum + item.assignedCourses.reduce((courseSum, row) => courseSum + row.groups.length, 0), 0);
        const visibleLoad = filteredTeachersData.reduce((sum, item) => sum + item.totalLoad, 0);

        return {
            assignedTeachers,
            assignedCourses,
            assignedGroups,
            visibleLoad
        };
    }, [teachersData, filteredTeachersData]);

    const assignableCourses = useMemo(() => {
        const excludedTypes = ['กิจกรรม', 'ชุมนุม'];
        return coursesWithAssignments
            .filter(course => {
                const t = String(course.type || '').trim();
                return !excludedTypes.includes(t) && courseMatchesActiveFilters(course);
            })
            .sort((a, b) => (a.code || "").localeCompare(b.code || "", "th", { numeric: true }));
    }, [coursesWithAssignments, courseSearch, subjectGroupFilter, categoryFilter, selectedLevel, selectedSemester, subjectGroupsList]);

    const getCoTeacherOptions = useCallback((excludedTeacherId?: string): TeacherSelectOption[] => {
        return teacherList
            .filter(t => t.id !== excludedTeacherId)
            .map(t => ({
                value: t.id,
                label: `${t.teacherId || "—"} ${t.name}`,
                teacherCode: t.teacherId || "—",
                teacherName: t.name,
                profileImageUrl: t.profileImageUrl || '',
                subjectGroup: t.subjectGroup || '',
                initial: t.name?.charAt(0) || '?'
            }));
    }, [teacherList]);

    // Handle adding a course assignment
    const handleOpenAssignModal = (teacherId: string) => {
        setAssignTeacherId(teacherId);
        setAssignCourseId("");
        setAssignGroupNumber(1);
        setAssignRoomSuffix("1");
        setAssignPhysicalRoomId("");
        setAssignCoTeacherIds([]);
    };

    const handleCloseAssignPanel = () => {
        setAssignTeacherId(null);
        setAssignCourseId("");
        setAssignGroupNumber(1);
        setAssignRoomSuffix("1");
        setAssignPhysicalRoomId("");
        setAssignCoTeacherIds([]);
    };

    // Triggered when selected course changes in assign modal to auto-suggest next group number
    useEffect(() => {
        if (!assignCourseId) return;
        const selectedCourseObj = coursesWithAssignments.find(c => c.id === assignCourseId);
        if (!selectedCourseObj) return;

        // Count existing groups in db and draft
        const dbGroupsCount = selectedCourseObj.teacherAssignments?.length || 0;
        const draftGroupsCount = pendingQueue.filter(p => p.courseId === assignCourseId).length;
        const nextGroupNum = dbGroupsCount + draftGroupsCount + 1;
        setAssignGroupNumber(nextGroupNum);
        setAssignRoomSuffix(String(nextGroupNum));
    }, [assignCourseId, coursesWithAssignments, pendingQueue]);

    const handleAddAssignmentToQueue = () => {
        if (!assignTeacherId || !assignCourseId) {
            Swal.fire({ icon: "warning", title: "ข้อมูลไม่ครบ", text: "กรุณาเลือกวิชาที่ต้องการมอบหมาย" });
            return;
        }

        if (!assignPhysicalRoomId) {
            Swal.fire({
                icon: "warning",
                title: "กรุณาเลือกสถานที่เรียน",
                text: "ข้อมูลสถานที่เรียนเป็นข้อมูลบังคับของระบบสถานที่สอน"
            });
            return;
        }

        const course = coursesWithAssignments.find(c => c.id === assignCourseId);
        if (!course) return;

        const teacherIds = [assignTeacherId, ...assignCoTeacherIds.filter(id => id !== assignTeacherId)];

        const newDraftItem = {
            courseId: assignCourseId,
            teacherId: assignTeacherId,
            teacherIds,
            roomIds: assignPhysicalRoomId ? [assignPhysicalRoomId] : [],
            groupNumber: assignGroupNumber,
            room: assignRoomSuffix,
            title: course.title,
            code: course.code,
            classId: course.classId || "m1",
            teacherHours: teacherIds.length >= 2
                ? resolveTeacherHours({ teacherIds }, course)
                : undefined,
            teacherPeriods: teacherIds.length >= 2
                ? resolveTeacherPeriodRanges({ teacherIds }, course)
                : undefined
        };

        // Check if group is already assigned locally or in Firestore
        const isAlreadyAssigned = (course.teacherAssignments || []).some((a: GroupAssignment) => a.groupNumber === assignGroupNumber) ||
                                  pendingQueue.some(p => p.courseId === assignCourseId && p.groupNumber === assignGroupNumber);

        if (isAlreadyAssigned) {
            Swal.fire({
                icon: "warning",
                title: "กลุ่มการเรียนซ้ำซ้อน",
                text: `กลุ่มที่ ${assignGroupNumber} ของรายวิชานี้ได้รับการมอบหมายไปแล้ว`
            });
            return;
        }

        setPendingQueue(prev => [...prev, newDraftItem]);
        handleCloseAssignPanel();

        Swal.fire({
            icon: 'info',
            title: 'เพิ่มเข้าแบบร่างสำเร็จ',
            text: `ระบบเตรียมบันทึกกลุ่มที่ ${assignGroupNumber} ของวิชา ${course.code}`,
            toast: true,
            position: 'top-end',
            timer: 2000,
            showConfirmButton: false,
            background: getSwalBg(),
            color: getSwalColor()
        });
    };

    // Open management modal for a course under a teacher
    const handleOpenManageModal = (teacherId: string, courseId: string) => {
        const teacher = teacherList.find(t => t.id === teacherId);
        const teacherAssoc = teachersData.find(t => t.teacher.id === teacherId);
        const courseAssoc = teacherAssoc?.assignedCourses.find(c => c.course.id === courseId);

        if (!teacher || !courseAssoc) return;

        setManageTeacherId(teacherId);
        setManageCourseId(courseId);
        setEditingGroups(courseAssoc.groups.map(g => ({ ...g })));
        setIsManageModalOpen(true);
    };

    // Update group detail inside Management Modal
    const handleUpdateGroupInModal = (index: number, field: string, value: any) => {
        setEditingGroups(prev => {
            const next = [...prev];
            next[index] = {
                ...next[index],
                [field]: value
            };
            return next;
        });
    };

    const handleConfigurePeriodsInModal = async (index: number) => {
        if (!manageCourseId || !manageTeacherId) return;
        const group = editingGroups[index];
        const teacherIds = [manageTeacherId, ...group.coTeacherIds];
        const course = coursesWithAssignments.find(c => c.id === manageCourseId);
        const totalHours = getCourseTeachingHours(course);

        if (teacherIds.length < 2 || !course) return;

        const currentRanges = resolveTeacherPeriodRanges({ teacherIds, teacherPeriods: group.teacherPeriods }, course);
        const teacherLabels = teacherIds.map(id => {
            const teacher = teacherList.find(t => t.id === id);
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
                    ${teacherLabels.map((teacher, idx) => `
                        <div class="teacher-hour-row">
                            <span class="teacher-label-text">${escapeHtml(teacher.label)}</span>
                            <div class="teacher-period-inputs">
                                <label>
                                    <small>สอนคาบ</small>
                                    <select id="teacher-period-start-${idx}">
                                        ${Array.from({ length: totalHours }, (_, periodIndex) => {
                                            const period = periodIndex + 1;
                                            const selected = Number(currentRanges[teacher.id]?.start || 1) === period ? 'selected' : '';
                                            return `<option value="${period}" ${selected}>${period}</option>`;
                                        }).join("")}
                                    </select>
                                </label>
                                <label>
                                    <small>ถึงคาบ</small>
                                    <select id="teacher-period-end-${idx}">
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
                    <p class="teacher-hour-note">ตัวอย่าง: ครูคนที่ 1 สอนคาบ 1 ถึง 10, ครูคนที่ 2 สอนคาบ 11 ถึง 20</p>
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
                const values = teacherIds.map((id, idx) => {
                    const startInput = document.getElementById(`teacher-period-start-${idx}`) as HTMLSelectElement | null;
                    const endInput = document.getElementById(`teacher-period-end-${idx}`) as HTMLSelectElement | null;
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
                    for (let p = item.start; p <= item.end; p += 1) {
                        coveredPeriods.add(p);
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

        if (result.isConfirmed && result.value) {
            const { teacherHours, teacherPeriods } = result.value;
            handleUpdateGroupInModal(index, 'teacherHours', teacherHours);
            handleUpdateGroupInModal(index, 'teacherPeriods', teacherPeriods);
        }
    };

    const handleConfigurePeriodsDirect = async (
        courseId: string,
        groupNumber: number,
        isPending: boolean,
        allTeacherIds: string[],
        currentPeriods?: Record<string, { start: number; end: number }>
    ) => {
        const course = coursesWithAssignments.find(c => c.id === courseId);
        if (!course || allTeacherIds.length < 2 || !schoolId) return;

        const totalHours = getCourseTeachingHours(course);
        if (totalHours <= 0) {
            Swal.fire({ icon: 'warning', title: 'ไม่สามารถกำหนดช่วงคาบได้', text: 'รายวิชานี้ไม่มีข้อมูลจำนวนคาบ กรุณาตรวจสอบหน่วยกิต/คาบ/สัปดาห์' });
            return;
        }

        const currentRanges = resolveTeacherPeriodRanges(
            { teacherIds: allTeacherIds, teacherPeriods: currentPeriods },
            course
        );
        const teacherLabels = allTeacherIds.map(id => {
            const t = teacherList.find(t => t.id === id);
            return { id, label: `${t?.teacherId || "—"} ${t?.name || id}` };
        });

        const result = await Swal.fire({
            title: 'กำหนดช่วงคาบครูร่วมสอน',
            html: `
                <div class="teacher-hour-split">
                    <div class="teacher-hour-total">คาบรวมรายวิชาทั้งภาคเรียน: <strong>${escapeHtml(totalHours)}</strong> คาบ</div>
                    ${teacherLabels.map((teacher, idx) => `
                        <div class="teacher-hour-row">
                            <span class="teacher-label-text">${escapeHtml(teacher.label)}</span>
                            <div class="teacher-period-inputs">
                                <label>
                                    <small>สอนคาบ</small>
                                    <select id="tpd-start-${idx}">
                                        ${Array.from({ length: totalHours }, (_, i) => {
                                            const p = i + 1;
                                            const sel = Number(currentRanges[teacher.id]?.start || 1) === p ? 'selected' : '';
                                            return `<option value="${p}" ${sel}>${p}</option>`;
                                        }).join("")}
                                    </select>
                                </label>
                                <label>
                                    <small>ถึงคาบ</small>
                                    <select id="tpd-end-${idx}">
                                        ${Array.from({ length: totalHours }, (_, i) => {
                                            const p = i + 1;
                                            const defEnd = currentRanges[teacher.id]?.end ?? p;
                                            const sel = Number(defEnd) === p ? 'selected' : '';
                                            return `<option value="${p}" ${sel}>${p}</option>`;
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
                const values = allTeacherIds.map((id, idx) => {
                    const startEl = document.getElementById(`tpd-start-${idx}`) as HTMLSelectElement | null;
                    const endEl = document.getElementById(`tpd-end-${idx}`) as HTMLSelectElement | null;
                    const start = Number(startEl?.value || 0);
                    const end = Number(endEl?.value || 0);
                    return { id, start, end, hours: end - start + 1 };
                });
                if (values.some(v => !Number.isFinite(v.start) || !Number.isFinite(v.end) || v.start <= 0 || v.end < v.start)) {
                    Swal.showValidationMessage('กรุณากำหนดช่วงคาบให้ถูกต้อง');
                    return false;
                }
                const covered = new Set<number>();
                values.forEach(v => { for (let p = v.start; p <= v.end; p++) covered.add(p); });
                const sum = values.reduce((acc, v) => acc + v.hours, 0);
                if (sum !== totalHours || covered.size !== totalHours) {
                    Swal.showValidationMessage(`ช่วงคาบต้องรวมกันครบ ${totalHours} คาบ และไม่ซ้ำกัน`);
                    return false;
                }
                return {
                    teacherHours: values.reduce((acc, v) => { acc[v.id] = v.hours; return acc; }, {} as Record<string, number>),
                    teacherPeriods: values.reduce((acc, v) => { acc[v.id] = { start: v.start, end: v.end }; return acc; }, {} as Record<string, { start: number; end: number }>)
                };
            }
        });

        if (!result.isConfirmed || !result.value) return;
        const { teacherHours, teacherPeriods } = result.value;

        try {
            if (isPending) {
                setPendingQueue(prev => prev.map(item =>
                    item.courseId === courseId && item.groupNumber === groupNumber
                        ? { ...item, teacherHours, teacherPeriods }
                        : item
                ));
            } else {
                const assignmentId = `${courseId}_${selectedYear}_${selectedSemester}`;
                const courseObj = coursesWithAssignments.find(c => c.id === courseId);
                if (!courseObj) return;
                const updatedAssignments = (courseObj.teacherAssignments || []).map((a: any) =>
                    a.groupNumber === groupNumber ? { ...a, teacherHours, teacherPeriods } : a
                );
                await setDoc(
                    doc(db, 'school-settings', schoolId, 'course_assignments', assignmentId),
                    removeUndefinedFields({ courseId, academicYear: selectedYear, semester: selectedSemester, teacherAssignments: updatedAssignments }),
                    { merge: true }
                );
                setSemesterAssignments(prev => {
                    const idx = prev.findIndex(item => item.courseId === courseId);
                    const next = [...prev];
                    if (idx !== -1) next[idx] = { ...next[idx], teacherAssignments: updatedAssignments };
                    return next;
                });
            }
            Swal.fire({ icon: 'success', title: 'บันทึกช่วงคาบสำเร็จ', toast: true, position: 'top-end', timer: 1500, showConfirmButton: false });
        } catch (error) {
            console.error(error);
            Swal.fire({ icon: 'error', title: 'เกิดข้อผิดพลาด', text: 'ไม่สามารถบันทึกช่วงคาบได้' });
        }
    };

    const handleUpdateRoomInline = async (
        teacherId: string,
        courseId: string,
        groupNumber: number,
        isPending: boolean,
        newRoomIds: string[]
    ) => {
        if (isPending) {
            setPendingQueue(prev => prev.map(item => {
                if (item.courseId === courseId && item.groupNumber === groupNumber) {
                    return {
                        ...item,
                        roomIds: newRoomIds
                    };
                }
                return item;
            }));
            Swal.fire({ icon: 'success', title: 'อัปเดตสถานที่สอนในแบบร่างแล้ว', toast: true, position: 'top-end', timer: 1500, showConfirmButton: false });
        } else {
            if (!schoolId) return;
            try {
                const courseObj = coursesWithAssignments.find(c => c.id === courseId);
                if (!courseObj) return;

                const currentAssignments = [...(courseObj.teacherAssignments || [])];
                const idx = currentAssignments.findIndex(a => a.groupNumber === groupNumber);
                if (idx !== -1) {
                    currentAssignments[idx] = {
                        ...currentAssignments[idx],
                        roomIds: newRoomIds
                    };
                }

                const assignmentId = `${courseId}_${selectedYear}_${selectedSemester}`;
                await setDoc(doc(db, 'school-settings', schoolId, 'course_assignments', assignmentId), removeUndefinedFields({
                    courseId: courseId,
                    academicYear: selectedYear,
                    semester: selectedSemester,
                    teacherAssignments: currentAssignments
                }), { merge: true });

                setSemesterAssignments(prev => {
                    const idx = prev.findIndex(item => item.courseId === courseId);
                    const next = [...prev];
                    if (idx !== -1) {
                        next[idx] = {
                            ...next[idx],
                            teacherAssignments: currentAssignments
                        };
                    }
                    return next;
                });
                Swal.fire({ icon: 'success', title: 'บันทึกสถานที่สอนเรียบร้อยแล้ว', toast: true, position: 'top-end', timer: 1500, showConfirmButton: false });
            } catch (error) {
                console.error("Failed to update room:", error);
                Swal.fire({ icon: 'error', title: 'เกิดข้อผิดพลาดในการบันทึกสถานที่สอน' });
            }
        }
        setEditingRoomKey(null);
    };

    const handleDeleteCourseAssignment = async (teacherId: string, courseId: string, groups: any[]) => {
        const result = await Swal.fire({
            title: 'ลบวิชานี้ทั้งหมด?',
            text: `ต้องการลบการมอบหมายวิชานี้ทุกกลุ่มเรียนออกจากการสอนของครูใช่หรือไม่?`,
            icon: 'warning',
            showCancelButton: true,
            confirmButtonColor: '#ef4444',
            confirmButtonText: 'ลบออก',
            cancelButtonText: 'ยกเลิก',
            background: getSwalBg(),
            color: getSwalColor()
        });

        if (!result.isConfirmed) return;

        const groupNumbers = groups.map(g => g.groupNumber);
        const pendingGroups = groups.filter(g => g.isPending);
        const realGroups = groups.filter(g => !g.isPending);

        // 1. Remove pending groups from pendingQueue
        if (pendingGroups.length > 0) {
            setPendingQueue(prev => prev.filter(p => !(p.courseId === courseId && p.teacherId === teacherId && groupNumbers.includes(p.groupNumber))));
        }

        // 2. Remove real groups from Firestore
        if (realGroups.length > 0 && schoolId) {
            try {
                const courseObj = coursesWithAssignments.find(c => c.id === courseId);
                if (courseObj) {
                    const updated = (courseObj.teacherAssignments || []).filter((a: any) => !groupNumbers.includes(a.groupNumber));

                    const assignmentId = `${courseId}_${selectedYear}_${selectedSemester}`;
                    
                    await setDoc(doc(db, 'school-settings', schoolId, 'course_assignments', assignmentId), removeUndefinedFields({
                        courseId: courseId,
                        academicYear: selectedYear,
                        semester: selectedSemester,
                        teacherAssignments: updated
                    }), { merge: true });

                    setSemesterAssignments(prev => {
                        const idx = prev.findIndex(item => item.courseId === courseId);
                        const next = [...prev];
                        if (idx !== -1) {
                            next[idx] = { ...next[idx], teacherAssignments: updated };
                        }
                        return next;
                    });
                }
            } catch (error) {
                console.error("Failed to delete course assignment:", error);
                Swal.fire({ icon: 'error', title: 'เกิดข้อผิดพลาดในการลบ' });
                return;
            }
        }
        Swal.fire({ icon: 'success', title: 'ลบวิชานี้เรียบร้อย', toast: true, position: 'top-end', timer: 1500, showConfirmButton: false });
    };

    // Remove a group from within management modal
    const handleRemoveGroupInModal = async (groupNumber: number, isPending: boolean) => {
        if (isPending) {
            // Delete from pendingQueue immediately
            setPendingQueue(prev => prev.filter(p => !(p.courseId === manageCourseId && p.groupNumber === groupNumber)));
            setEditingGroups(prev => prev.filter(g => g.groupNumber !== groupNumber));
            Swal.fire({ icon: 'success', title: 'ลบวิชาร่างเรียบร้อย', toast: true, position: 'top-end', timer: 1500, showConfirmButton: false });
        } else {
            // Delete from Firestore immediately
            const result = await Swal.fire({
                title: 'ยืนยันการลบ?',
                text: `ต้องการลบการมอบหมายกลุ่มที่ ${groupNumber} จริงหรือไม่?`,
                icon: 'warning',
                showCancelButton: true,
                confirmButtonColor: '#ef4444',
                confirmButtonText: 'ลบ',
                cancelButtonText: 'ยกเลิก'
            });

            if (result.isConfirmed && schoolId && manageCourseId) {
                try {
                    const courseObj = coursesWithAssignments.find(c => c.id === manageCourseId);
                    if (!courseObj) return;

                    const updated = (courseObj.teacherAssignments || []).filter((a: any) => a.groupNumber !== groupNumber);
                    const assignmentId = `${manageCourseId}_${selectedYear}_${selectedSemester}`;
                    
                    await setDoc(doc(db, 'school-settings', schoolId, 'course_assignments', assignmentId), removeUndefinedFields({
                        courseId: manageCourseId,
                        academicYear: selectedYear,
                        semester: selectedSemester,
                        teacherAssignments: updated
                    }), { merge: true });

                    setSemesterAssignments(prev => {
                        const idx = prev.findIndex(item => item.courseId === manageCourseId);
                        const next = [...prev];
                        if (idx !== -1) {
                            next[idx] = {
                                ...next[idx],
                                teacherAssignments: updated
                            };
                        }
                        return next;
                    });

                    setEditingGroups(prev => prev.filter(g => g.groupNumber !== groupNumber));
                    Swal.fire({ icon: 'success', title: 'ลบข้อมูลจริงสำเร็จ', toast: true, position: 'top-end', timer: 1500, showConfirmButton: false });
                } catch (error) {
                    console.error("Failed to delete group assignment:", error);
                    Swal.fire({ icon: 'error', title: 'เกิดข้อผิดพลาดในการลบ' });
                }
            }
        }
    };

    // Save changes from Management Modal
    const handleSaveChangesFromModal = async () => {
        if (!schoolId || !manageCourseId || !manageTeacherId) return;

        const missingRoomGroup = editingGroups.find(group => !Array.isArray(group.roomIds) || group.roomIds.length === 0);
        if (missingRoomGroup) {
            Swal.fire({
                icon: 'warning',
                title: 'กรุณาระบุสถานที่เรียนให้ครบ',
                text: `กลุ่มที่ ${missingRoomGroup.groupNumber} ยังไม่ได้เลือกสถานที่เรียน`
            });
            return;
        }

        try {
            // 1. Separate pending items and saved items
            const pendingEdits = editingGroups.filter(g => g.isPending);
            const savedEdits = editingGroups.filter(g => !g.isPending);

            // 2. Update local pending queue
            if (pendingEdits.length > 0) {
                setPendingQueue(prev => prev.map(item => {
                    if (item.courseId === manageCourseId) {
                        const editMatch = pendingEdits.find(e => e.groupNumber === item.groupNumber);
                        if (editMatch) {
                            const newTeacherIds = [manageTeacherId, ...editMatch.coTeacherIds];
                            const courseObj = coursesWithAssignments.find(c => c.id === manageCourseId);
                            const origTeacherIds = getAssignmentTeacherIds(item);
                            const coTeachersChanged = !editMatch.coTeacherIds.every(id => origTeacherIds.includes(id)) || editMatch.coTeacherIds.length !== (item.teacherIds?.length || 1) - 1;

                            return {
                                ...item,
                                room: editMatch.room,
                                roomIds: editMatch.roomIds,
                                teacherIds: newTeacherIds,
                                teacherId: manageTeacherId,
                                teacherHours: newTeacherIds.length === 2
                                    ? (coTeachersChanged ? resolveTeacherHours({ teacherIds: newTeacherIds }, courseObj) : (editMatch.teacherHours || item.teacherHours || resolveTeacherHours({ teacherIds: newTeacherIds }, courseObj)))
                                    : undefined,
                                teacherPeriods: newTeacherIds.length === 2
                                    ? (coTeachersChanged ? resolveTeacherPeriodRanges({ teacherIds: newTeacherIds }, courseObj) : (editMatch.teacherPeriods || item.teacherPeriods || resolveTeacherPeriodRanges({ teacherIds: newTeacherIds }, courseObj)))
                                    : undefined
                            };
                        }
                    }
                    return item;
                }));
            }

            // 3. Update Firestore immediately for saved assignments
            if (savedEdits.length > 0 && schoolId) {
                const courseObj = coursesWithAssignments.find(c => c.id === manageCourseId);
                if (courseObj) {
                    const currentAssignments = [...(courseObj.teacherAssignments || [])];
                    
                    savedEdits.forEach(edit => {
                        const idx = currentAssignments.findIndex(a => a.groupNumber === edit.groupNumber);
                        if (idx !== -1) {
                            const newTeacherIds = [manageTeacherId, ...edit.coTeacherIds];
                            const origAssign = currentAssignments[idx];
                            const origTeacherIds = getAssignmentTeacherIds(origAssign);
                            const coTeachersChanged = !edit.coTeacherIds.every(id => origTeacherIds.includes(id)) || edit.coTeacherIds.length !== origTeacherIds.length - 1;

                            currentAssignments[idx] = {
                                ...currentAssignments[idx],
                                room: edit.room,
                                roomIds: edit.roomIds,
                                teacherId: manageTeacherId,
                                teacherIds: newTeacherIds,
                                teacherHours: newTeacherIds.length === 2
                                    ? (coTeachersChanged ? resolveTeacherHours({ teacherIds: newTeacherIds }, courseObj) : (edit.teacherHours || origAssign.teacherHours || resolveTeacherHours({ teacherIds: newTeacherIds }, courseObj)))
                                    : undefined,
                                teacherPeriods: newTeacherIds.length === 2
                                    ? (coTeachersChanged ? resolveTeacherPeriodRanges({ teacherIds: newTeacherIds }, courseObj) : (edit.teacherPeriods || origAssign.teacherPeriods || resolveTeacherPeriodRanges({ teacherIds: newTeacherIds }, courseObj)))
                                    : undefined
                            };
                        }
                    });

                    const assignmentId = `${manageCourseId}_${selectedYear}_${selectedSemester}`;
                    await setDoc(doc(db, 'school-settings', schoolId, 'course_assignments', assignmentId), removeUndefinedFields({
                        courseId: manageCourseId,
                        academicYear: selectedYear,
                        semester: selectedSemester,
                        teacherAssignments: currentAssignments
                    }), { merge: true });

                    setSemesterAssignments(prev => {
                        const idx = prev.findIndex(item => item.courseId === manageCourseId);
                        const next = [...prev];
                        if (idx !== -1) {
                            next[idx] = {
                                ...next[idx],
                                teacherAssignments: currentAssignments
                            };
                        }
                        return next;
                    });
                }
            }

            setIsManageModalOpen(false);
            Swal.fire({ icon: 'success', title: 'บันทึกการแก้ไขแล้ว', toast: true, position: 'top-end', timer: 1500, showConfirmButton: false });
        } catch (error) {
            console.error("Error saving group modifications:", error);
            Swal.fire({ icon: 'error', title: 'เกิดข้อผิดพลาด', text: 'ไม่สามารถบันทึกการเปลี่ยนแปลงได้' });
        }
    };

    // Commit draft queue to Firestore (supports both manual confirm and silent auto-save)
    const commitPendingQueue = useCallback(async (
        queueSnapshot = pendingQueue,
        options: { confirm?: boolean; silent?: boolean } = {}
    ) => {
        if (!queueSnapshot.length || !schoolId || saveInFlightRef.current) return;

        if (options.confirm) {
            const confirmResult = await Swal.fire({
                title: 'บันทึกลงฐานข้อมูลจริง?',
                text: `ยืนยันการมอบหมายรายวิชาทั้งหมด จำนวน ${queueSnapshot.length} รายการ ลงในระบบตารางเรียนจริง?`,
                icon: 'question',
                showCancelButton: true,
                confirmButtonColor: '#10b981',
                cancelButtonColor: '#64748b',
                confirmButtonText: 'บันทึกข้อมูล',
                cancelButtonText: 'ยกเลิก'
            });
            if (!confirmResult.isConfirmed) return;
        }

        saveInFlightRef.current = true;
        setIsSaving(true);
        if (!options.silent) {
            Swal.fire({ title: 'กำลังบันทึกลงระบบ...', allowOutsideClick: false, didOpen: () => Swal.showLoading() });
        }

        try {
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
                        room: item.room || "1",
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
                Swal.fire({ icon: 'success', title: 'บันทึกตารางเรียนสำเร็จ', text: 'ตารางการมอบหมายทั้งหมดบันทึกเรียบร้อย', timer: 2000, showConfirmButton: false });
            } else {
                Swal.fire({ icon: 'success', title: `บันทึกอัตโนมัติแล้ว (${queueSnapshot.length})`, toast: true, position: 'top-end', timer: 1300, showConfirmButton: false });
            }
            setPendingQueue(prev => prev.filter(item => !queueSnapshot.includes(item)));
        } catch (error) {
            console.error("Error committing drafts:", error);
            Swal.fire({
                icon: 'error',
                title: options.silent ? 'บันทึกอัตโนมัติไม่สำเร็จ' : 'เกิดข้อผิดพลาด',
                text: 'ไม่สามารถบันทึกข้อมูลตารางเรียนได้'
            });
        } finally {
            saveInFlightRef.current = false;
            setIsSaving(false);
        }
    }, [coursesWithAssignments, pendingQueue, schoolId, selectedSemester, selectedYear]);

    const handleCommitAllDrafts = useCallback(async () => {
        await commitPendingQueue(pendingQueue, { confirm: true });
    }, [commitPendingQueue, pendingQueue]);

    // Auto-save: fires 1800ms after last queue change (same as Page 1)
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

    if (isLoading) {
        return (
            <div className="flex flex-col items-center justify-center h-screen bg-slate-50 dark:bg-[#0b0e14]">
                <RefreshCw className="text-indigo-500 animate-spin mb-4" size={40} />
                <p className="text-slate-600 dark:text-slate-400 font-black">กำลังดาวน์โหลดข้อมูลการมอบหมาย...</p>
            </div>
        );
    }

    return (
        
        <DndContext sensors={sensors} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
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
                                <div className="p-2 bg-emerald-600 rounded-xl shadow-lg shadow-emerald-600/20">
                                    <Users size={20} className="text-white" />
                                </div>
                                <div>
                                    <h1 className="text-lg font-black text-slate-900 dark:text-white leading-none">เปิดสอนรายวิชา</h1>
                                    <p className="text-[9px] text-slate-500 dark:text-slate-400 font-bold mt-1 uppercase tracking-wider">กำหนดรายวิชาที่เปิดสอน พร้อมครูผู้สอนและห้องเรียนแบบตาราง</p>
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
                        </div>

                        <button 
                            onClick={handleCommitAllDrafts}
                            disabled={!pendingQueue.length || isSaving}
                            className={`px-5 py-2.5 bg-emerald-600 hover:bg-emerald-500 disabled:bg-slate-300 dark:disabled:bg-white/5 disabled:text-slate-500 text-white rounded-xl font-black text-xs transition-all shadow-lg shadow-emerald-600/20 flex items-center gap-2 border border-white/10 ${isSaving ? 'opacity-70 cursor-wait' : ''}`}
                        >
                            {isSaving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
                            {pendingQueue.length > 0 ? `บันทึกข้อมูลระบบ (${pendingQueue.length})` : 'ไม่มีวิชาร่างค้างบันทึก'}
                        </button>
                    </div>
                </header>

                {/* --- Filters Area --- */}
                <section className="px-6 lg:px-8 py-4 bg-slate-100/60 dark:bg-white/[0.02] border-b border-slate-200 dark:border-white/5 shrink-0">
                    <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-4">
                        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-5 gap-3 flex-1 min-w-0">
                            <Select
                                options={teacherOptions}
                                value={teacherOptions.find(opt => opt.value === selectedTeacherId) || teacherOptions[0]}
                                onChange={(opt: any) => setSelectedTeacherId(opt ? opt.value : 'ทั้งหมด')}
                                styles={teacherSelectStyles}
                                isSearchable={true}
                                filterOption={customTeacherFilterOption}
                                formatOptionLabel={formatTeacherOptionLabel}
                                maxMenuHeight={400}
                                placeholder="เลือกครูผู้สอน..."
                            />

                            <div className="relative">
                                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
                                <input
                                    type="text"
                                    placeholder="ค้นหารายวิชา (รหัส/ชื่อ)..."
                                    value={courseSearch}
                                    onChange={e => setCourseSearch(e.target.value)}
                                    className="w-full h-[38px] pl-9 pr-8 bg-white dark:bg-[#161a27] rounded-xl text-xs outline-none border border-slate-200 dark:border-white/5 text-slate-950 dark:text-white shadow-sm focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/10 transition-all font-bold"
                                />
                                {courseSearch && (
                                    <button onClick={() => setCourseSearch("")} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
                                        <X size={14} />
                                    </button>
                                )}
                            </div>

                            <Select
                                options={["กลุ่มสาระทั้งหมด", ...subjectGroupsList.map(g => g.name)].map(g => ({ value: g, label: g }))}
                                value={{ value: subjectGroupFilter, label: subjectGroupFilter }}
                                onChange={(opt: any) => setSubjectGroupFilter(opt.value)}
                                styles={filterSelectStyles}
                                isSearchable={true}
                                placeholder="เลือกกลุ่มสาระ"
                            />

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

                            <Select
                                options={dynamicLevelOptions}
                                value={dynamicLevelOptions.find(opt => opt.value === selectedLevel) || dynamicLevelOptions[0]}
                                onChange={(opt: any) => setSelectedLevel(opt.value)}
                                styles={filterSelectStyles}
                                isSearchable={false}
                            />
                        </div>

                        <div className="flex flex-wrap items-center justify-end gap-3 shrink-0">
                            <label className="flex items-center gap-2 cursor-pointer select-none px-3 h-[38px] bg-white dark:bg-[#161a27] rounded-xl border border-slate-200 dark:border-white/5 shadow-sm">
                                <input
                                    type="checkbox"
                                    checked={showOnlyAssignedTeachers}
                                    onChange={(e) => setShowOnlyAssignedTeachers(e.target.checked)}
                                    className="w-4 h-4 rounded text-indigo-600 border-slate-300 focus:ring-indigo-500 focus:ring-offset-0 focus:outline-none"
                                />
                                <span className="text-xs font-black text-slate-600 dark:text-slate-400">เฉพาะครูที่มีรายวิชา</span>
                            </label>

                            <div className="h-[38px] px-3 rounded-xl bg-indigo-50 dark:bg-indigo-950/20 border border-indigo-100 dark:border-indigo-900/30 text-xs font-bold text-indigo-700 dark:text-indigo-400 flex items-center gap-2">
                                <span>แสดง</span>
                                <span className="bg-indigo-600 text-white px-2 py-0.5 rounded-md text-[10px] font-black">{filteredTeachersData.length} คน</span>
                            </div>
                        </div>
                    </div>

                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-4">
                        {[
                            { label: "ครูที่มีรายวิชา", value: `${assignmentSummary.assignedTeachers}/${teacherList.length}`, tone: "indigo" },
                            { label: "รายวิชาที่ผูกครู", value: assignmentSummary.assignedCourses, tone: "emerald" },
                            { label: "กลุ่มสอนทั้งหมด", value: assignmentSummary.assignedGroups, tone: "amber" },
                            { label: "คาบที่แสดง", value: formatWeeklyLoad(assignmentSummary.visibleLoad), tone: "rose" }
                        ].map(item => (
                            <div key={item.label} className="bg-white dark:bg-[#161a27] rounded-xl border border-slate-200 dark:border-white/5 px-4 py-3 shadow-sm">
                                <div className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-wide">{item.label}</div>
                                <div className={`mt-1 text-lg font-black ${
                                    item.tone === "emerald" ? "text-emerald-600 dark:text-emerald-400" :
                                    item.tone === "amber" ? "text-amber-600 dark:text-amber-400" :
                                    item.tone === "rose" ? "text-rose-600 dark:text-rose-400" :
                                    "text-indigo-600 dark:text-indigo-400"
                                }`}>
                                    {item.value}
                                </div>
                            </div>
                        ))}
                    </div>
                </section>

                <main className="flex-1 px-4 lg:px-6 py-4 overflow-auto custom-scrollbar bg-slate-50 dark:bg-[#0b0e14]">

                    {/* Course Palette for Drag & Drop */}
                    <div className="mb-4 bg-white dark:bg-[#161a27] border border-slate-300 dark:border-white/10 rounded-xl p-4 shadow-sm">
                        <div className="flex items-center justify-between mb-3">
                            <h3 className="text-sm font-black text-slate-800 dark:text-white flex items-center gap-2">
                                <BookOpen size={16} className="text-indigo-500" />
                                รายวิชาที่สามารถมอบหมายได้ (ลากบล็อครายวิชาไปวางที่ครูผู้สอน)
                            </h3>
                            <span className="text-[10px] font-bold text-slate-500 bg-slate-100 dark:bg-white/5 px-2 py-1 rounded-md">
                                {assignableCourses.length} วิชา
                            </span>
                        </div>
                        {assignableCourses.length > 0 ? (
                            <div className="flex gap-3 overflow-x-auto pb-2 custom-scrollbar snap-x">
                                {assignableCourses.map(course => (
                                    <div key={course.id} className="snap-start shrink-0">
                                        <DraggableCourseCard course={course} />
                                    </div>
                                ))}
                            </div>
                        ) : (
                            <div className="text-center py-6 text-slate-400 dark:text-slate-500 text-xs font-bold bg-slate-50 dark:bg-white/[0.02] rounded-lg border border-dashed border-slate-200 dark:border-white/10">
                                ไม่พบรายวิชาตามเงื่อนไขที่เลือก กรุณาเปลี่ยนตัวกรองด้านบน
                            </div>
                        )}
                    </div>

                    <div className="min-w-[1180px] bg-white dark:bg-[#161a27] border border-slate-300 dark:border-white/10 shadow-sm rounded-xl overflow-hidden">
                        <div className="px-5 py-4 border-b border-slate-300 dark:border-white/10 bg-white dark:bg-[#161a27] text-center">
                            <h2 className="text-base font-black text-slate-900 dark:text-white">
                                แผนการเปิดการจัดการเรียนการสอน
                            </h2>
                            <div className="mt-1 text-xs font-bold text-slate-500 dark:text-slate-400">
                                กลุ่มสาระการเรียนรู้ {subjectGroupFilter === "กลุ่มสาระทั้งหมด" ? "ทั้งหมด" : subjectGroupFilter}
                                <span className="mx-2">•</span>
                                ภาคเรียนที่ {selectedSemester === "0" ? "ทั้งปี" : selectedSemester}
                                <span className="mx-2">•</span>
                                ปีการศึกษา {selectedYear}
                            </div>
                        </div>

                        <table className="w-full border-collapse text-[12px]">
                            <thead>
                                <tr className="bg-slate-100 dark:bg-white/[0.04] text-slate-700 dark:text-slate-200">
                                    <th className="border border-slate-300 dark:border-white/10 px-2 py-2 w-[76px] text-center font-black">รหัสครู<br />ผู้สอน</th>
                                    <th className="border border-slate-300 dark:border-white/10 px-3 py-2 w-[220px] text-left font-black">ชื่อ-สกุล (ครูผู้สอน)</th>
                                    <th className="border border-slate-300 dark:border-white/10 px-3 py-2 text-left font-black">รายวิชา</th>
                                    <th className="border border-slate-300 dark:border-white/10 px-2 py-2 w-[110px] text-center font-black">รหัสวิชา</th>
                                    <th className="border border-slate-300 dark:border-white/10 px-2 py-2 w-[110px] text-center font-black">ชั้น/กลุ่ม</th>
                                    <th className="border border-slate-300 dark:border-white/10 px-2 py-2 w-[86px] text-center font-black">หน่วยกิต</th>
                                    <th className="border border-slate-300 dark:border-white/10 px-2 py-2 w-[94px] text-center font-black">คาบ/<br />สัปดาห์</th>
                                    <th className="border border-slate-300 dark:border-white/10 px-2 py-2 w-[86px] text-center font-black">จำนวน<br />ห้อง</th>
                                    <th className="border border-slate-300 dark:border-white/10 px-2 py-2 w-[96px] text-center font-black">รวมคาบ<br />ที่สอน</th>
                                    <th className="border border-slate-300 dark:border-white/10 px-2 py-2 w-[140px] text-center font-black">สถานที่สอน</th>
                                    <th className="border border-slate-300 dark:border-white/10 px-2 py-2 w-[90px] text-center font-black">จัดการ</th>
                                </tr>
                            </thead>
                                {filteredTeachersData.length === 0 ? (
                                    <tbody>
                                        <tr>
                                            <td colSpan={11} className="border border-slate-300 dark:border-white/10 py-14 text-center">
                                                <BookOpen size={24} className="mx-auto text-slate-300 dark:text-slate-600 mb-2" />
                                                <div className="text-sm font-black text-slate-500 dark:text-slate-400">ไม่พบข้อมูลตามเงื่อนไขที่เลือก</div>
                                                <div className="text-xs font-bold text-slate-400 dark:text-slate-500 mt-1">ลองล้างคำค้น หรือเปลี่ยนตัวกรองด้านบน</div>
                                            </td>
                                        </tr>
                                    </tbody>
                                ) : (
                                    filteredTeachersData.map(({ teacher, assignedCourses, totalLoad, totalSemesterLoad }) => {
                                        const rows = assignedCourses.length > 0 ? assignedCourses : [null];
                                        const canCollapse = assignedCourses.length > 1;
                                        const isCollapsed = canCollapse && collapsedTeachers[teacher.id];
                                        const visibleRows = isCollapsed ? rows.slice(0, 1) : rows;
                                        const rowSpan = visibleRows.length + 1;
                                        const teacherGroupCount = assignedCourses.reduce((sum, row) => sum + row.groups.length, 0);
                                        const loadColor = totalLoad > 22
                                            ? "text-rose-600 dark:text-rose-400"
                                            : totalLoad > 18
                                                ? "text-amber-600 dark:text-amber-400"
                                                : "text-emerald-600 dark:text-emerald-400";

                                        return (
                                            <TeacherDroppableTbody key={teacher.id} teacher={teacher}>
                                                {visibleRows.map((row, rowIndex) => {
                                                    const roomCodes = row
                                                        ? Array.from(new Set(row.groups.flatMap(group => group.roomIds)))
                                                            .map(roomId => rooms.find(room => room.id === roomId)?.roomCode)
                                                            .filter(Boolean)
                                                        : [];
                                                    const hasPending = Boolean(row?.groups.some(group => group.isPending));

                                                    return (
                                                        <tr key={`${teacher.id}-${row?.course.id || "empty"}-${rowIndex}`} className="hover:bg-indigo-50/40 dark:hover:bg-white/[0.03] transition-colors">
                                                            {rowIndex === 0 && (
                                                                <>
                                                                    <td rowSpan={rowSpan} className="border border-slate-300 dark:border-white/10 px-2 py-2 align-top text-center bg-slate-50 dark:bg-white/[0.02]">
                                                                        <div className="inline-flex min-w-12 justify-center rounded-md border border-slate-300 dark:border-white/10 bg-white dark:bg-white/5 px-2 py-1 font-black text-slate-700 dark:text-slate-200">
                                                                            {teacher.teacherId || "—"}
                                                                        </div>
                                                                    </td>
                                                                    <td rowSpan={rowSpan} className="border border-slate-300 dark:border-white/10 px-3 py-2 align-top bg-slate-50 dark:bg-white/[0.02]">
                                                                        <div className="font-black text-slate-900 dark:text-white leading-6">{teacher.name}</div>
                                                                        <div className="text-[11px] font-bold text-slate-500 dark:text-slate-400 mt-1">{teacher.subjectGroup || "ไม่มีกลุ่มสาระ"}</div>
                                                                        <div className="mt-3 flex flex-wrap gap-1.5">
                                                                            <span className={`px-2 py-1 rounded-md bg-white dark:bg-white/5 border border-slate-300 dark:border-white/10 font-black ${loadColor}`}>
                                                                                รวม {formatWeeklyLoad(totalLoad)} คาบ
                                                                            </span>
                                                                            <button
                                                                                onClick={() => handleOpenAssignModal(teacher.id)}
                                                                                className="px-2 py-1 rounded-md bg-indigo-600 hover:bg-indigo-500 text-white font-black inline-flex items-center gap-1"
                                                                            >
                                                                                <Plus size={11} strokeWidth={3} />
                                                                                เพิ่มวิชา
                                                                            </button>
                                                                        </div>
                                                                    </td>
                                                                </>
                                                            )}

                                                            {row ? (
                                                                <>
                                                                    <td className="border border-slate-300 dark:border-white/10 px-3 py-2 align-top">
                                                                        <div className="font-black text-slate-900 dark:text-white leading-5">{row.course.title || "—"}</div>
                                                                        <div className="mt-1 flex flex-wrap gap-1">
                                                                            <span className="px-1.5 py-0.5 rounded bg-slate-100 dark:bg-white/5 text-[10px] font-bold text-slate-500 dark:text-slate-400">
                                                                                {row.course.type || "ไม่ระบุประเภท"}
                                                                            </span>
                                                                            {row.course.isElective && (
                                                                                <span className="px-1.5 py-0.5 rounded bg-rose-500/10 text-[10px] font-bold text-rose-600 dark:text-rose-400">วิชาเลือก</span>
                                                                            )}
                                                                            {hasPending && (
                                                                                <span className="px-1.5 py-0.5 rounded bg-amber-500/10 text-[10px] font-bold text-amber-600 dark:text-amber-400">แบบร่าง</span>
                                                                            )}
                                                                        </div>
                                                                    </td>
                                                                    <td className="border border-slate-300 dark:border-white/10 px-2 py-2 text-center align-top font-black font-mono text-indigo-600 dark:text-indigo-300">
                                                                        {row.course.code || "—"}
                                                                    </td>
                                                                    <td className="border border-slate-300 dark:border-white/10 px-2 py-2 align-top">
                                                                        <div className="flex flex-col gap-1">
                                                                            {row.groups.map(group => (
                                                                                <div key={`${row.course.id}-${group.groupNumber}-${group.room}`} className="flex flex-col bg-white dark:bg-[#0b0e14] border border-slate-200 dark:border-white/10 rounded overflow-hidden group/pill shadow-sm">
                                                                                    <div className="flex items-stretch justify-between">
                                                                                        <span className="px-1.5 py-1 text-center font-black text-slate-700 dark:text-slate-200 text-[10px] flex-1 flex items-center justify-center">
                                                                                            {getLevelLabel(row.course.classId)}{group.room ? `/${group.room}` : ` ก.${group.groupNumber}`}
                                                                                        </span>
                                                                                        <div className="border-l border-slate-200 dark:border-white/10 shrink-0">
                                                                                            <DragHandle 
                                                                                                id={`assigned-${row.course.id}-${group.groupNumber}`} 
                                                                                                data={{ type: 'assigned-group', courseId: row.course.id, groupNumber: group.groupNumber, isPending: group.isPending }} 
                                                                                            />
                                                                                        </div>
                                                                                    </div>
                                                                                    {group.coTeacherIds.length > 0 && (
                                                                                        <button
                                                                                            onClick={() => handleConfigurePeriodsDirect(
                                                                                                row.course.id,
                                                                                                group.groupNumber,
                                                                                                group.isPending,
                                                                                                [teacher.id, ...group.coTeacherIds],
                                                                                                group.teacherPeriods
                                                                                            )}
                                                                                            className="w-full border-t border-dashed border-slate-200 dark:border-white/10 group/period-btn"
                                                                                            title="คลิกเพื่อแบ่งช่วงคาบสอนระหว่างครูร่วมสอน"
                                                                                        >
                                                                                            {/* Action header row */}
                                                                                            <div className={`flex items-center justify-between gap-1 px-1.5 py-[3px] transition-colors ${group.periodLabel ? 'bg-indigo-500/10 group-hover/period-btn:bg-indigo-500/20' : 'bg-amber-400/10 group-hover/period-btn:bg-amber-400/20'}`}>
                                                                                                <div className="flex items-center gap-1 min-w-0">
                                                                                                    <Scissors size={8} className={`shrink-0 ${group.periodLabel ? 'text-indigo-500 dark:text-indigo-400' : 'text-amber-500 dark:text-amber-400'}`} />
                                                                                                    <span className={`text-[8px] font-black tracking-wide whitespace-nowrap ${group.periodLabel ? 'text-indigo-600 dark:text-indigo-400' : 'text-amber-600 dark:text-amber-400'}`}>
                                                                                                        แบ่งคาบสอน
                                                                                                    </span>
                                                                                                </div>
                                                                                                <div className="flex items-center gap-0.5 shrink-0">
                                                                                                    {group.periodLabel ? (
                                                                                                        <span className="flex items-center gap-0.5 bg-indigo-500 text-white text-[8px] font-black px-1 py-px rounded-sm font-mono">
                                                                                                            <Clock size={7} />
                                                                                                            {group.periodLabel}
                                                                                                        </span>
                                                                                                    ) : (
                                                                                                        <span className="text-[8px] font-black text-amber-500 dark:text-amber-400 opacity-80">ยังไม่กำหนด</span>
                                                                                                    )}
                                                                                                    <Edit2 size={8} className={`ml-0.5 transition-opacity opacity-40 group-hover/period-btn:opacity-100 ${group.periodLabel ? 'text-indigo-400 dark:text-indigo-400' : 'text-amber-400 dark:text-amber-400'}`} />
                                                                                                </div>
                                                                                            </div>
                                                                                            {/* Co-teacher names — single truncated line */}
                                                                                            <div className="px-1.5 py-[3px] flex items-center gap-0.5 overflow-hidden">
                                                                                                <Users size={7} className="shrink-0 text-slate-400 dark:text-slate-500" />
                                                                                                <span className="text-[8px] font-bold text-slate-500 dark:text-slate-400 truncate">
                                                                                                    {group.coTeacherIds.map(coId => {
                                                                                                        const coTeacher = teacherList.find(t => t.id === coId);
                                                                                                        return `+${coTeacher?.name?.split(" ")[0] || coId}`;
                                                                                                    }).join(" ")}
                                                                                                </span>
                                                                                            </div>
                                                                                        </button>
                                                                                    )}
                                                                                </div>
                                                                            ))}
                                                                        </div>
                                                                    </td>
                                                                    <td className="border border-slate-300 dark:border-white/10 px-2 py-2 text-center align-top font-black text-slate-700 dark:text-slate-200">
                                                                        {row.course.credits || "—"}
                                                                    </td>
                                                                    <td className="border border-slate-300 dark:border-white/10 px-2 py-2 text-center align-top font-black text-slate-700 dark:text-slate-200">
                                                                        {row.weeklyPeriods}
                                                                    </td>
                                                                    <td className="border border-slate-300 dark:border-white/10 px-2 py-2 text-center align-top font-black text-slate-700 dark:text-slate-200">
                                                                        {row.groups.length}
                                                                    </td>
                                                                    <td className="border border-slate-300 dark:border-white/10 px-2 py-2 text-center align-top">
                                                                        <div className="font-black text-slate-900 dark:text-white text-sm">{row.totalSemesterHours}</div>
                                                                        <div className="text-[9px] font-bold text-slate-400 dark:text-slate-500 mt-0.5">{row.isFullYear ? 'คาบ/ปี' : 'คาบ/ภาค'}</div>
                                                                    </td>
                                                                    <td className="border border-slate-300 dark:border-white/10 px-2 py-2 align-top">
                                                                        <div className="flex flex-col gap-1">
                                                                            {row.groups.map(group => {
                                                                                const roomId = group.roomIds?.[0] || "";
                                                                                const roomObj = rooms.find(r => r.id === roomId);
                                                                                const roomCode = roomObj?.roomCode || "—";
                                                                                const key = `${teacher.id}-${row.course.id}-${group.groupNumber}`;
                                                                                const isEditing = editingRoomKey === key;
                                                                                const hasExtraInfo = group.coTeacherIds.length > 0 || group.periodLabel;
                                                                                
                                                                                return (
                                                                                    <div 
                                                                                        key={key} 
                                                                                        className="flex flex-col justify-center bg-white dark:bg-[#0b0e14] border border-slate-200 dark:border-white/10 rounded overflow-hidden shadow-sm"
                                                                                        style={{ minHeight: hasExtraInfo ? '42px' : '26px' }}
                                                                                    >
                                                                                        {isEditing ? (
                                                                                            <div className="px-1 py-0.5 text-left" onClick={(e) => e.stopPropagation()}>
                                                                                                <Select
                                                                                                    autoFocus
                                                                                                    menuIsOpen={true}
                                                                                                    options={rooms.map(room => ({
                                                                                                        value: room.id,
                                                                                                        label: `${room.roomCode} - ${room.roomName}`
                                                                                                    }))}
                                                                                                    value={roomObj ? {
                                                                                                        value: roomId,
                                                                                                        label: roomCode
                                                                                                    } : null}
                                                                                                    onChange={(opt: any) => handleUpdateRoomInline(
                                                                                                        teacher.id,
                                                                                                        row.course.id,
                                                                                                        group.groupNumber,
                                                                                                        group.isPending,
                                                                                                        opt ? [opt.value] : []
                                                                                                    )}
                                                                                                    onBlur={() => setEditingRoomKey(null)}
                                                                                                    styles={miniSelectStyles}
                                                                                                    isClearable={true}
                                                                                                    isSearchable={true}
                                                                                                    placeholder="เลือกสถานที่..."
                                                                                                    menuPortalTarget={document.body}
                                                                                                    menuPosition="fixed"
                                                                                                />
                                                                                            </div>
                                                                                        ) : (
                                                                                            <button
                                                                                                onClick={() => setEditingRoomKey(key)}
                                                                                                className="group/room-btn flex items-center justify-between w-full h-full px-2 py-1 hover:bg-indigo-50/40 dark:hover:bg-indigo-950/10 text-slate-700 dark:text-slate-300 font-bold transition-all text-xs"
                                                                                            >
                                                                                                {roomCode !== "—" ? (
                                                                                                    <span className="text-emerald-600 dark:text-emerald-400 font-black text-[10px]">{roomCode}</span>
                                                                                                ) : (
                                                                                                    <span className="text-slate-400 dark:text-slate-500 font-medium text-[9px]">ระบุสถานที่...</span>
                                                                                                )}
                                                                                                <Edit2 size={9} className="opacity-0 group-hover/room-btn:opacity-100 transition-opacity text-slate-400 dark:text-slate-500 ml-1 shrink-0" />
                                                                                            </button>
                                                                                        )}
                                                                                        {hasExtraInfo && (
                                                                                            <div className="bg-slate-50 dark:bg-white/[0.02] px-2 py-0.5 border-t border-slate-100 dark:border-white/5 text-[8px] text-slate-400 dark:text-slate-500 font-semibold text-center select-none truncate">
                                                                                                {roomObj?.building || "—"}
                                                                                            </div>
                                                                                        )}
                                                                                    </div>
                                                                                );
                                                                            })}
                                                                        </div>
                                                                    </td>
                                                                    <td className="border border-slate-300 dark:border-white/10 px-2 py-2 text-center align-top">
                                                                        <div className="flex items-center justify-center gap-1">
                                                                            <button
                                                                                onClick={() => handleOpenManageModal(teacher.id, row.course.id)}
                                                                                className="inline-flex items-center justify-center w-8 h-8 rounded-lg bg-slate-50 hover:bg-indigo-50 dark:bg-white/5 dark:hover:bg-indigo-500/15 text-slate-500 hover:text-indigo-600 dark:hover:text-indigo-400 border border-slate-300 dark:border-white/10 transition-all"
                                                                                title="แก้ไขข้อมูลกลุ่ม/ห้อง/ครูร่วม"
                                                                            >
                                                                                <Edit2 size={14} strokeWidth={2.5} />
                                                                            </button>
                                                                            <button
                                                                                onClick={() => handleDeleteCourseAssignment(teacher.id, row.course.id, row.groups)}
                                                                                className="inline-flex items-center justify-center w-8 h-8 rounded-lg bg-rose-50 hover:bg-rose-100 dark:bg-rose-500/10 dark:hover:bg-rose-500/25 text-rose-500 hover:text-rose-600 dark:text-rose-400 border border-rose-200 dark:border-rose-500/20 transition-all"
                                                                                title="ลบรายวิชานี้ทั้งหมดของครูท่านนี้"
                                                                            >
                                                                                <Trash2 size={14} strokeWidth={2.5} />
                                                                            </button>
                                                                        </div>
                                                                    </td>
                                                                </>
                                                            ) : (
                                                                <td colSpan={9} className="border border-slate-300 dark:border-white/10 px-3 py-8 text-center">
                                                                    <div className="text-xs font-black text-slate-400 dark:text-slate-500">ยังไม่มีรายวิชาที่ได้รับมอบหมาย</div>
                                                                    <button
                                                                        onClick={() => handleOpenAssignModal(teacher.id)}
                                                                        className="mt-2 px-3 py-1.5 rounded-lg bg-indigo-50 hover:bg-indigo-100 dark:bg-indigo-500/10 dark:hover:bg-indigo-500/20 text-indigo-600 dark:text-indigo-300 text-xs font-black border border-indigo-100 dark:border-indigo-500/20"
                                                                    >
                                                                        มอบหมายวิชาแรก
                                                                    </button>
                                                                </td>
                                                            )}
                                                        </tr>
                                                    );
                                                })}

                                                <tr className="bg-slate-100/70 dark:bg-white/[0.04]">
                                                    <td colSpan={6} className="border border-slate-300 dark:border-white/10 px-3 py-2 text-right text-[11px] font-black text-slate-500 dark:text-slate-400">
                                                        <div className="flex items-center justify-end gap-2">
                                                            <span>รวมภาระงานครู {teacher.name} ({teacherGroupCount} ห้อง/กลุ่ม)</span>
                                                            {canCollapse && (
                                                                <button
                                                                    type="button"
                                                                    onClick={() => toggleTeacherCollapse(teacher.id)}
                                                                    className="group inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[10px] font-bold transition-all duration-200 cursor-pointer select-none bg-indigo-50/60 hover:bg-indigo-100/80 text-indigo-600 border border-indigo-100/50 hover:border-indigo-200 dark:bg-indigo-500/10 dark:hover:bg-indigo-500/20 dark:text-indigo-400 dark:border-indigo-500/20 dark:hover:border-indigo-500/30 shadow-sm"
                                                                >
                                                                    {isCollapsed ? (
                                                                        <>
                                                                            <ChevronDown size={11} className="transition-transform duration-200 group-hover:translate-y-0.5" strokeWidth={3} />
                                                                            <span>แสดงทั้งหมด ({assignedCourses.length})</span>
                                                                        </>
                                                                    ) : (
                                                                        <>
                                                                            <ChevronUp size={11} className="transition-transform duration-200 group-hover:-translate-y-0.5" strokeWidth={3} />
                                                                            <span>ยุบวิชา</span>
                                                                        </>
                                                                    )}
                                                                </button>
                                                            )}
                                                        </div>
                                                    </td>
                                                    <td className={`border border-slate-300 dark:border-white/10 px-2 py-2 text-center`}>
                                                        <div className={`font-black text-sm ${loadColor}`}>{totalSemesterLoad}</div>
                                                        <div className="text-[9px] font-bold text-slate-400 dark:text-slate-500 mt-0.5">คาบรวม</div>
                                                    </td>
                                                    <td colSpan={2} className="border border-slate-300 dark:border-white/10 px-2 py-2 text-center text-[10px] font-bold text-slate-400 dark:text-slate-500">
                                                        {formatWeeklyLoad(totalLoad)} คาบ/สัปดาห์
                                                    </td>
                                                </tr>
                                            </TeacherDroppableTbody>
                                        );
                                    })
                                )}
                        </table>
                    </div>
                </main>

                {/* --- MODAL: Add Course Assignment --- */}
                <AnimatePresence>
                    {assignTeacherId && (() => {
                        const assignTeacher = teacherList.find(t => t.id === assignTeacherId);
                        return (
                            <div className="fixed inset-0 z-[9998] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm" onClick={handleCloseAssignPanel}>
                                <motion.div
                                    initial={{ opacity: 0, scale: 0.96, y: 16 }}
                                    animate={{ opacity: 1, scale: 1, y: 0 }}
                                    exit={{ opacity: 0, scale: 0.96, y: 16 }}
                                    transition={{ duration: 0.16 }}
                                    className="w-full max-w-2xl bg-white dark:bg-[#161a27] rounded-2xl border border-slate-200 dark:border-white/10 shadow-2xl overflow-visible"
                                    onClick={e => e.stopPropagation()}
                                >
                                    {/* Header */}
                                    <div className="px-6 py-4 bg-gradient-to-r from-indigo-600 to-indigo-700 rounded-t-2xl flex items-center justify-between">
                                        <div className="flex items-center gap-3 min-w-0">
                                            <div className="w-9 h-9 rounded-xl bg-white/20 flex items-center justify-center shrink-0">
                                                <BookOpen size={18} className="text-white" />
                                            </div>
                                            <div className="min-w-0">
                                                <h3 className="text-sm font-black text-white">มอบหมายรายวิชาใหม่</h3>
                                                <p className="text-[11px] font-bold text-indigo-200 truncate">
                                                    ครู: {assignTeacher?.teacherId || "—"} {assignTeacher?.name || ""}
                                                </p>
                                            </div>
                                        </div>
                                        <button onClick={handleCloseAssignPanel} className="p-2 rounded-lg text-white/70 hover:text-white hover:bg-white/10 transition-colors">
                                            <X size={18} />
                                        </button>
                                    </div>

                                    {/* Body */}
                                    <div className="p-5 grid grid-cols-12 gap-4 overflow-visible">
                                        {/* Course selector - full width */}
                                        <div className="col-span-12">
                                            <label className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase block mb-1.5">เลือกรายวิชา <span className="text-rose-500">*</span></label>
                                            <Select
                                                options={assignableCourses.map(course => ({
                                                    value: course.id,
                                                    label: `[${course.code}] ${course.title} (${getLevelLabel(course.classId)})`
                                                }))}
                                                value={courses.find(c => c.id === assignCourseId) ? {
                                                    value: assignCourseId,
                                                    label: `[${courses.find(c => c.id === assignCourseId)?.code}] ${courses.find(c => c.id === assignCourseId)?.title}`
                                                } : null}
                                                onChange={(opt: any) => setAssignCourseId(opt?.value || "")}
                                                styles={filterSelectStyles}
                                                isSearchable
                                                autoFocus
                                                placeholder="พิมพ์เพื่อค้นหารหัสหรือชื่อวิชา..."
                                                menuPortalTarget={document.body}
                                                menuPosition="fixed"
                                            />
                                        </div>

                                        {/* Group + Room suffix */}
                                        <div className="col-span-6">
                                            <label className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase block mb-1.5">กลุ่มที่</label>
                                            <input
                                                type="number"
                                                min={1} max={30}
                                                value={assignGroupNumber}
                                                onChange={(e) => {
                                                    const val = Number(e.target.value);
                                                    setAssignGroupNumber(val);
                                                    setAssignRoomSuffix(String(val));
                                                }}
                                                className="w-full h-[38px] px-3 rounded-xl text-sm font-black bg-slate-50 dark:bg-white/5 border border-slate-200 dark:border-white/10 text-slate-900 dark:text-white outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/10"
                                            />
                                        </div>
                                        <div className="col-span-6">
                                            <label className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase block mb-1.5">ห้อง/ทับ</label>
                                            <input
                                                type="text"
                                                value={assignRoomSuffix}
                                                onChange={(e) => setAssignRoomSuffix(e.target.value)}
                                                placeholder="1"
                                                className="w-full h-[38px] px-3 rounded-xl text-sm font-black bg-slate-50 dark:bg-white/5 border border-slate-200 dark:border-white/10 text-slate-900 dark:text-white outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/10"
                                            />
                                        </div>

                                        {/* Room */}
                                        <div className="col-span-6">
                                            <label className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase block mb-1.5">สถานที่เรียน <span className="text-rose-500">*</span></label>
                                            <Select
                                                options={rooms.map(room => ({
                                                    value: room.id,
                                                    label: `${room.roomCode} – ${room.roomName}${room.building ? ` (${room.building})` : ''}`
                                                }))}
                                                value={rooms.find(r => r.id === assignPhysicalRoomId) ? {
                                                    value: assignPhysicalRoomId,
                                                    label: rooms.find(r => r.id === assignPhysicalRoomId)?.roomCode || ""
                                                } : null}
                                                onChange={(opt: any) => setAssignPhysicalRoomId(opt ? opt.value : "")}
                                                styles={filterSelectStyles}
                                                isSearchable
                                                placeholder="เลือกสถานที่เรียน"
                                                menuPortalTarget={document.body}
                                                menuPosition="fixed"
                                            />
                                        </div>
                                        <div className="col-span-6">
                                            <div className="flex items-center justify-between mb-1.5">
                                                <label className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase">
                                                    ครูร่วมสอน
                                                    {assignCoTeacherIds.length > 0 && (
                                                        <span className="ml-2 px-1.5 py-0.5 rounded-full bg-indigo-100 dark:bg-indigo-900/40 text-indigo-600 dark:text-indigo-400 text-[9px] font-black normal-case">
                                                            เลือกแล้ว {assignCoTeacherIds.length} คน
                                                        </span>
                                                    )}
                                                </label>
                                                {assignCoTeacherIds.length > 0 && (
                                                    <button type="button" onClick={() => setAssignCoTeacherIds([])} className="text-[10px] font-black text-rose-400 hover:text-rose-500 transition-colors">
                                                        ล้างทั้งหมด
                                                    </button>
                                                )}
                                            </div>
                                            <Select
                                                options={getCoTeacherOptions(assignTeacherId || undefined)}
                                                value={getCoTeacherOptions(assignTeacherId || undefined).filter(opt => assignCoTeacherIds.includes(opt.value))}
                                                onChange={(opts: any) => setAssignCoTeacherIds(Array.isArray(opts) ? opts.map((o: TeacherSelectOption) => o.value) : [])}
                                                styles={coTeacherMultiSelectStyles}
                                                isMulti={true}
                                                isClearable={true}
                                                isSearchable={true}
                                                closeMenuOnSelect={false}
                                                hideSelectedOptions={false}
                                                blurInputOnSelect={false}
                                                placeholder="ค้นหาชื่อหรือรหัสครู..."
                                                menuPortalTarget={document.body}
                                                menuPosition="fixed"
                                                noOptionsMessage={() => "ไม่พบครูที่ค้นหา"}
                                                formatOptionLabel={(option: TeacherSelectOption, meta: any) =>
                                                    renderCoTeacherOptionLabel(option, meta.context, meta.selectValue || [])
                                                }
                                            />
                                        </div>

                                        {/* Actions */}
                                        <div className="col-span-12 flex gap-3 pt-1">
                                            <button
                                                onClick={handleCloseAssignPanel}
                                                className="flex-1 h-10 rounded-xl border border-slate-200 dark:border-white/10 text-sm font-black text-slate-500 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-white/5 transition-colors"
                                            >
                                                ยกเลิก
                                            </button>
                                            <button
                                                onClick={handleAddAssignmentToQueue}
                                                className="flex-[2] h-10 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-black shadow-sm shadow-indigo-600/20 transition-colors flex items-center justify-center gap-2"
                                            >
                                                <Plus size={15} strokeWidth={3} />
                                                เพิ่มเข้าร่าง
                                            </button>
                                        </div>
                                    </div>
                                </motion.div>
                            </div>
                        );
                    })()}
                </AnimatePresence>

                {/* --- MODAL: Manage Course Groups --- */}
                <AnimatePresence>
                    {isManageModalOpen && (
                        <div className="fixed inset-0 z-[9998] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
                            <motion.div
                                initial={{ opacity: 0, scale: 0.97, y: 16 }}
                                animate={{ opacity: 1, scale: 1, y: 0 }}
                                exit={{ opacity: 0, scale: 0.97, y: 16 }}
                                transition={{ duration: 0.18 }}
                                className="w-full max-w-3xl bg-white dark:bg-[#161a27] rounded-2xl border border-slate-200 dark:border-white/10 shadow-2xl text-slate-800 dark:text-slate-200 flex flex-col"
                                style={{ maxHeight: 'calc(100vh - 64px)' }}
                            >
                                {/* Header */}
                                <div className="px-6 py-4 bg-gradient-to-r from-indigo-600 to-indigo-700 rounded-t-2xl flex items-center justify-between shrink-0">
                                    <div className="flex items-center gap-3">
                                        <div className="w-8 h-8 rounded-lg bg-white/15 flex items-center justify-center">
                                            <Edit2 size={16} className="text-white" />
                                        </div>
                                        <div>
                                            <h3 className="font-black text-sm text-white leading-none">
                                                จัดการกลุ่มการเรียน
                                            </h3>
                                            <p className="text-[11px] text-indigo-200 font-bold mt-0.5">
                                                วิชา {courses.find(c => c.id === manageCourseId)?.code} — {courses.find(c => c.id === manageCourseId)?.title}
                                            </p>
                                        </div>
                                    </div>
                                    <button
                                        onClick={() => setIsManageModalOpen(false)}
                                        className="w-8 h-8 flex items-center justify-center text-white/70 hover:text-white hover:bg-white/15 rounded-lg transition-colors"
                                    >
                                        <X size={18} />
                                    </button>
                                </div>

                                {/* Teacher info strip */}
                                <div className="px-6 py-3 border-b border-slate-100 dark:border-white/5 bg-slate-50/80 dark:bg-white/[0.02] shrink-0 flex items-center gap-3">
                                    <div className="w-7 h-7 rounded-full bg-indigo-100 dark:bg-indigo-500/20 flex items-center justify-center text-indigo-600 dark:text-indigo-400 text-[10px] font-black shrink-0">
                                        {teacherList.find(t => t.id === manageTeacherId)?.name?.charAt(0) || "?"}
                                    </div>
                                    <div>
                                        <span className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wide">ครูผู้สอนหลัก</span>
                                        <p className="text-sm font-black text-slate-800 dark:text-white leading-tight">{teacherList.find(t => t.id === manageTeacherId)?.name || "—"}</p>
                                    </div>
                                    <div className="ml-auto px-3 py-1 bg-indigo-50 dark:bg-indigo-500/10 rounded-full border border-indigo-100 dark:border-indigo-500/20">
                                        <span className="text-[11px] font-black text-indigo-600 dark:text-indigo-400">{editingGroups.length} กลุ่ม</span>
                                    </div>
                                </div>

                                {/* Groups list */}
                                <div className="flex-1 overflow-y-auto custom-scrollbar p-5 space-y-3">
                                    {editingGroups.length === 0 ? (
                                        <div className="text-center py-12 text-slate-400 font-bold text-sm">
                                            <div className="w-12 h-12 rounded-full bg-slate-100 dark:bg-white/5 flex items-center justify-center mx-auto mb-3">
                                                <BookOpen size={20} className="text-slate-300 dark:text-slate-600" />
                                            </div>
                                            ไม่มีกลุ่มการเรียนที่เปิดอยู่
                                        </div>
                                    ) : (
                                        editingGroups.map((group, index) => (
                                            <div
                                                key={group.groupNumber}
                                                className="rounded-xl border border-slate-200 dark:border-white/8 bg-white dark:bg-[#0e1120] shadow-sm overflow-visible"
                                            >
                                                {/* Group header bar */}
                                                <div className="flex items-center justify-between px-4 py-2.5 bg-slate-50 dark:bg-white/[0.03] border-b border-slate-100 dark:border-white/5 rounded-t-xl">
                                                    <div className="flex items-center gap-2.5">
                                                        <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-indigo-600 text-white font-black text-sm shadow-sm shadow-indigo-600/30">
                                                            {group.groupNumber}
                                                        </div>
                                                        <span className="text-xs font-black text-slate-600 dark:text-slate-300">กลุ่มที่ {group.groupNumber}</span>
                                                        {group.isPending && (
                                                            <span className="px-2 py-0.5 bg-amber-400/15 text-amber-600 dark:text-amber-400 border border-amber-400/30 rounded-full text-[9px] font-black">
                                                                ● แบบร่าง
                                                            </span>
                                                        )}
                                                    </div>
                                                    <button
                                                        onClick={() => handleRemoveGroupInModal(group.groupNumber, group.isPending)}
                                                        className="w-7 h-7 flex items-center justify-center hover:bg-rose-50 dark:hover:bg-rose-500/10 text-slate-300 dark:text-slate-600 hover:text-rose-500 dark:hover:text-rose-400 rounded-lg transition-colors"
                                                        title="ลบกลุ่มนี้"
                                                    >
                                                        <Trash2 size={13} />
                                                    </button>
                                                </div>

                                                {/* Group fields */}
                                                <div className="p-4 grid grid-cols-12 gap-3">
                                                    {/* Room suffix */}
                                                    <div className="col-span-2">
                                                        <label className="text-[9px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-wide block mb-1.5">ทับ/ห้อง</label>
                                                        <input
                                                            type="text"
                                                            value={group.room}
                                                            onChange={(e) => handleUpdateGroupInModal(index, "room", e.target.value)}
                                                            className="w-full h-[38px] px-3 rounded-xl text-sm font-black bg-slate-50 dark:bg-white/5 border border-slate-200 dark:border-white/8 text-slate-900 dark:text-white outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/10 transition-all text-center"
                                                        />
                                                    </div>

                                                    {/* Physical room */}
                                                    <div className="col-span-4">
                                                        <label className="text-[9px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-wide block mb-1.5">สถานที่เรียน <span className="text-rose-500">*</span></label>
                                                        <Select
                                                            options={rooms.map(room => ({
                                                                value: room.id,
                                                                label: `${room.roomCode} — ${room.roomName}`,
                                                                sublabel: room.building || "ไม่มีอาคาร"
                                                            }))}
                                                            value={rooms.find(r => r.id === group.roomIds[0]) ? {
                                                                value: group.roomIds[0],
                                                                label: (() => {
                                                                    const r = rooms.find(rm => rm.id === group.roomIds[0]);
                                                                    return r ? `${r.roomCode} — ${r.roomName}` : "";
                                                                })()
                                                            } : null}
                                                            onChange={(opt: any) => handleUpdateGroupInModal(index, "roomIds", opt ? [opt.value] : [])}
                                                            styles={filterSelectStyles}
                                                            isSearchable={true}
                                                            placeholder="เลือกสถานที่เรียน"
                                                            menuPortalTarget={document.body}
                                                            menuPosition="fixed"
                                                        />
                                                    </div>

                                                    {/* Co-teacher */}
                                                    <div className="col-span-6">
                                                        <div className="flex items-center justify-between mb-1.5">
                                                            <label className="text-[9px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-wide">ครูร่วมสอน</label>
                                                            {group.coTeacherIds.length >= 1 && (
                                                                <button
                                                                    type="button"
                                                                    onClick={() => handleConfigurePeriodsInModal(index)}
                                                                    className="text-[9px] font-black text-indigo-500 dark:text-indigo-400 hover:text-indigo-600 dark:hover:text-indigo-300 flex items-center gap-1"
                                                                >
                                                                    ⚙ กำหนดช่วงคาบ ({group.coTeacherIds.length + 1} คน)
                                                                </button>
                                                            )}
                                                        </div>
                                                        <Select
                                                            options={getCoTeacherOptions(manageTeacherId || undefined)}
                                                            value={getCoTeacherOptions(manageTeacherId || undefined).filter(opt => group.coTeacherIds.includes(opt.value))}
                                                            onChange={(opts: any) => handleUpdateGroupInModal(
                                                                index,
                                                                "coTeacherIds",
                                                                Array.isArray(opts) ? opts.map((o: TeacherSelectOption) => o.value) : []
                                                            )}
                                                            styles={coTeacherMultiSelectStyles}
                                                            isMulti={true}
                                                            isClearable={true}
                                                            isSearchable={true}
                                                            closeMenuOnSelect={false}
                                                            hideSelectedOptions={false}
                                                            blurInputOnSelect={false}
                                                            placeholder="ค้นหาชื่อหรือรหัสครู..."
                                                            menuPortalTarget={document.body}
                                                            menuPosition="fixed"
                                                            noOptionsMessage={() => "ไม่พบครูที่ค้นหา"}
                                                            formatOptionLabel={(option: TeacherSelectOption, meta: any) =>
                                                                renderCoTeacherOptionLabel(option, meta.context, meta.selectValue || [])
                                                            }
                                                        />
                                                    </div>
                                                </div>
                                            </div>
                                        ))
                                    )}
                                </div>

                                {/* Footer */}
                                <div className="px-6 py-4 border-t border-slate-100 dark:border-white/5 bg-slate-50/80 dark:bg-white/[0.02] rounded-b-2xl flex items-center justify-between gap-3 shrink-0">
                                    <p className="text-[10px] font-bold text-slate-400 dark:text-slate-500">
                                        * ข้อมูลจริงจะบันทึกลงฐานข้อมูลทันทีเมื่อกด <strong>ตกลงบันทึก</strong>
                                    </p>
                                    <div className="flex gap-2">
                                        <button
                                            onClick={() => setIsManageModalOpen(false)}
                                            className="px-4 py-2 text-xs font-bold text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-white/5 rounded-xl transition-colors border border-transparent hover:border-slate-200 dark:hover:border-white/10"
                                        >
                                            ยกเลิก
                                        </button>
                                        <button
                                            onClick={handleSaveChangesFromModal}
                                            className="px-5 py-2 text-xs font-black text-white bg-indigo-600 hover:bg-indigo-500 rounded-xl transition-colors shadow-sm shadow-indigo-600/20"
                                        >
                                            ตกลงบันทึก
                                        </button>
                                    </div>
                                </div>
                            </motion.div>
                        </div>
                    )}
                </AnimatePresence>
            </div>
        
            </MainLayout>
            <DragOverlay dropAnimation={{ sideEffects: defaultDropAnimationSideEffects({ styles: { active: { opacity: '0.4' } } }) }}>
                {activeDragItem?.type === 'course' ? (
                    <DraggableCourseCard course={activeDragItem.course} />
                ) : activeDragItem?.type === 'assigned-group' ? (
                    <div className="bg-white dark:bg-[#161a27] p-3 rounded-lg shadow-2xl border-2 border-rose-500 font-black text-xs flex items-center gap-2 text-rose-600 dark:text-rose-400 z-[9999]">
                        <Trash2 size={16} />
                        ปล่อยเพื่อลบกลุ่ม {activeDragItem.groupNumber}
                    </div>
                ) : null}
            </DragOverlay>
        </DndContext>

    );
};

export default CourseAssignmentPage2;
