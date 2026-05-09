import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { DndContext, DragEndEvent, DragOverlay, DragStartEvent, PointerSensor, useSensor, useSensors, closestCorners } from '@dnd-kit/core';
import { SortableContext, useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { collection, getDocs, doc, getDoc, setDoc, query, where, writeBatch } from 'firebase/firestore';
import { firestore as db } from '../../firebase';
import { Link } from 'react-router-dom';
import Swal from 'sweetalert2';
import { useSelector, useDispatch } from 'react-redux';
import { RootState } from '../../store';
import withReactContent from 'sweetalert2-react-content';
import { ArrowLeft, BookOpen, Calendar, Check, Clock, Cpu, Grid, Lock, Save, Search, Trash2, User, Users, X, Zap, Unlock, Ban, Filter, Home } from 'lucide-react';
import MainLayout from "@/layouts/MainLayout";
import Select from 'react-select';
import { fetchTeachersMap } from '@/store/slices/userMapSlice';

// --- Types ---
interface Teacher {
  id: string;
  teacherId?: string;
  name: string;
  firstName?: string;
  lastName?: string;
  title?: string;
  homeroomGrade?: string;
  position?: string;
  department?: string;
  email?: string;
  phone?: string;
  role?: string;
  profileImageUrl?: string;
  avatar?: string;
  preferences?: {
    unavailableSlots?: string[];
    unavailableDays?: string[];
  };
}

// --- Types ---
interface Course {
  id: string;
  title: string;
  code: string;
  classId?: string | string[];
  room?: string[];
  hoursPerWeek?: number;
  teacherId?: string;
  teacherIds?: string[];
  type?: 'พื้นฐาน' | 'เพิ่มเติม';
  formativeWeight?: number;
  midtermWeight?: number;
  indicators?: string[];
  expectedOutcomes?: string[];
  constraints?: {
    disallowedDays?: string[];
    lockedSlots?: { day: string; periodId: string }[];
  };
  subjectGroup?: string;
  isSpecialProgram?: boolean;
  specialProgramType?: string;
  semester?: string;
  isCombined?: boolean;
  locked?: boolean;
  teacherAssignments?: {
    teacherId: string;
    roomIds: string[];
    classLevels: string[];
    groupNumber?: number
  }[];
  isActive?: boolean;
}

interface SpecialPeriod {
  id: string;
  title: string;
  startTime: string;
  endTime: string;
  day?: string;
  linkedPeriodId?: string;
}

interface PeriodSetting {
  id: string; // e.g., 'homeroom', 'period-1', 'lunch'
  label: string;
  startTime: string;
  endTime: string;
  isTeachingPeriod: boolean;
}

interface SchoolSettings {
  schoolType: string;
  opportunityExpansionLevel: string;
  availableClasses: string[];
}

interface SchedulingMetrics {
  totalTasks: number;
  placedTasks: number;
  unplacedTasks: number;
  processingTimeMs: number;
  averageConsecutivePeriods: number;
  averageGapsPerDay: number;
  bblComplianceRate: number;
}

interface CourseInstance extends Course {
  instanceId: string;
  locked?: boolean;
  className?: string;
  room?: string[];
}

// Helper to get display name for class(es)
const getClassDisplayName = (classId?: string | string[]): string => {
  if (!classId) return '';
  if (Array.isArray(classId)) {
    return classId.map(id => CLASSES[id as ClassKey] || id).join(', ');
  }
  return CLASSES[classId as ClassKey] || classId;
};

type Schedule = Record<string, CourseInstance | null>; // Key: "day-period", e.g., "mon-1"

// --- Constants ---
const DAYS = { mon: 'จันทร์', tue: 'อังคาร', wed: 'พุธ', thu: 'พฤหัสบดี', fri: 'ศุกร์' };
const CLASSES = {
  k1: 'อ.1', k2: 'อ.2', k3: 'อ.3',
  p1: 'ป.1', p2: 'ป.2', p3: 'ป.3',
  p4: 'ป.4', p5: 'ป.5', p6: 'ป.6',
  m1: 'ม.1', m2: 'ม.2', m3: 'ม.3',
  m4: 'ม.4', m5: 'ม.5', m6: 'ม.6',
};




type ClassKey = keyof typeof CLASSES;

// --- Performance Optimization Classes ---

/**
 * Indexed Timetable for O(1) lookups
 * Maintains multiple indexes for fast queries
 */
class IndexedTimetable {
  private bySlot = new Map<string, Array<{ teacherId: string; classId: string; room: string[]; courseId: string; taskId?: number }>>();
  private byTeacher = new Map<string, Set<string>>();
  private byClass = new Map<string, Set<string>>();

  add(slot: string, occupancy: { teacherId: string; classId: string; room: string[]; courseId: string; taskId?: number }) {
    // Update slot index
    if (!this.bySlot.has(slot)) {
      this.bySlot.set(slot, []);
    }
    this.bySlot.get(slot)!.push(occupancy);

    // Update teacher index
    if (!this.byTeacher.has(occupancy.teacherId)) {
      this.byTeacher.set(occupancy.teacherId, new Set());
    }
    this.byTeacher.get(occupancy.teacherId)!.add(slot);

    // Update class index
    if (!this.byClass.has(occupancy.classId)) {
      this.byClass.set(occupancy.classId, new Set());
    }
    this.byClass.get(occupancy.classId)!.add(slot);
  }

  getSlotOccupancies(slot: string) {
    return this.bySlot.get(slot) || [];
  }

  getTeacherSlots(teacherId: string): Set<string> {
    return this.byTeacher.get(teacherId) || new Set();
  }

  getClassSlots(classId: string): Set<string> {
    return this.byClass.get(classId) || new Set();
  }

  toRecord(): Record<string, Array<{ teacherId: string; classId: string; room: string[]; courseId: string; taskId?: number }>> {
    const record: Record<string, Array<{ teacherId: string; classId: string; room: string[]; courseId: string; taskId?: number }>> = {};
    this.bySlot.forEach((occupancies, slot) => {
      record[slot] = occupancies;
    });
    return record;
  }
}

// Performance constants
const PERFORMANCE_CONFIG = {
  BATCH_SIZE: 50, // Process tasks in batches
  TOP_SLOTS_LIMIT: 15, // Only try top N slots per task
  PROGRESS_UPDATE_INTERVAL: 25, // Update UI every N tasks
  ENABLE_PARALLEL: true, // Enable parallel processing
};


// --- Components ---

// Helper to format combined classes like "ม.1,2,3"
const formatClassDisplay = (classIds: string[]) => {
  const groups: Record<string, number[]> = {};
  const others: string[] = [];

  classIds.forEach(id => {
    const name = CLASSES[id as ClassKey] || id;
    const parts = name.split('.'); // Split "ม.1" -> ["ม", "1"]
    if (parts.length === 2 && !isNaN(Number(parts[1]))) {
      const prefix = parts[0] + '.';
      const num = Number(parts[1]);
      if (!groups[prefix]) groups[prefix] = [];
      groups[prefix].push(num);
    } else {
      others.push(name);
    }
  });

  const formattedGroups = Object.entries(groups).map(([prefix, nums]) => {
    nums.sort((a, b) => a - b);
    return `${prefix}${nums.join(',')}`;
  });

  return [...formattedGroups, ...others];
};

const CourseCard: React.FC<{ course: CourseInstance, isOverlay?: boolean }> = ({ course, isOverlay }) => {
  const isCombined = course.isCombined;

  return (
    <div className={`h-full w-full p-2 rounded-xl text-white shadow-sm flex flex-col items-center justify-center transition-all duration-300 relative overflow-hidden group border border-white/10 ${isOverlay
      ? 'cursor-grabbing bg-indigo-600 ring-4 ring-indigo-200 shadow-2xl scale-105 z-50'
      : 'cursor-grab bg-gradient-to-br from-indigo-500 to-indigo-600 hover:from-indigo-400 hover:to-indigo-500 hover:shadow-lg hover:scale-105 hover:z-20'
      }`}>

      {/* Glossy Overlay */}
      <div className="absolute inset-0 bg-gradient-to-tr from-white/10 to-transparent opacity-30 group-hover:opacity-50 transition-opacity pointer-events-none" />

      {/* Texture Layer */}
      <div className="absolute inset-0 opacity-[0.03] bg-[url('https://www.transparenttextures.com/patterns/carbon-fibre.png')] pointer-events-none group-hover:opacity-[0.05]" />

      {/* Combined Badge (Corner) */}
      {isCombined && (
        <div className="absolute -top-4 -right-4 bg-yellow-400 text-yellow-900 text-[8px] font-black uppercase tracking-tighter w-10 h-10 flex items-end justify-center pb-1 rotate-45 shadow-sm">
          สอนรวม
        </div>
      )}

      {/* Content Container */}
      <div className="relative z-10 text-center w-full overflow-hidden flex flex-col gap-1">

        {/* Title (Top) */}
        <p className="font-extrabold text-[12px] leading-tight px-1 text-white drop-shadow-md tracking-tight">
          {course.title}
        </p>

        {/* Course Code / ID Pill (Middle) */}
        <div className="flex justify-center flex-wrap gap-1">
          <span className="text-[9px] font-mono bg-black/30 px-1.5 py-0.5 rounded-md text-indigo-50 leading-none backdrop-blur-md border border-white/10">
            {course.code}
          </span>

        </div>

        {/* Class Info (Bottom) */}
        {!Array.isArray(course.classId) && (
          <p className="text-[10px] mt-0.5 truncate text-indigo-50 font-semibold drop-shadow-sm flex items-center justify-center gap-1">
            <Users size={10} className="opacity-70" />
            <span>{course.className}</span>
            {course.room && course.room.length > 0 && !course.room.includes('all') && (
              <span className="bg-white/20 px-1 rounded text-[8px]">H: {course.room[0]}</span>
            )}
          </p>
        )}

        {/* Grouped Class Tags (Combined View) */}
        {Array.isArray(course.classId) && (
          <div className="flex flex-wrap gap-1 justify-center mt-0.5">
            {formatClassDisplay(course.classId).map((label, idx) => (
              <span key={idx} className="text-[10px] text-indigo-50 font-bold leading-none bg-white/10 px-1 py-0.5 rounded flex items-center gap-0.5">
                <Users size={8} />
                {label}
              </span>
            ))}
          </div>
        )}
      </div>

      {/* Multi-Teacher Indicator */}
      {course.teacherAssignments && course.teacherAssignments.length > 1 && (
        <div className="absolute bottom-2 right-2 opacity-30 group-hover:opacity-100 transition-opacity">
          <User size={10} className="text-white" />
        </div>
      )}

      {/* Locked Indicator (Elegant bottom accent) */}
      {(course.locked || (course.constraints?.lockedSlots && course.constraints.lockedSlots.length > 0)) && (
        <div className="absolute top-1.5 right-1.5 p-0.5 bg-emerald-400 text-emerald-900 rounded shadow-sm">
          <Lock size={10} />
        </div>
      )}
    </div>
  );
};

const DraggableCourse: React.FC<{ course: CourseInstance; onRemove?: () => void; showRemove?: boolean; onLockToggle?: (courseId: string) => void }> = ({ course, onRemove, showRemove, onLockToggle }) => {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: course.instanceId,
    disabled: course.locked
  });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    zIndex: isDragging ? 100 : 10,
  };
  return (
    <div ref={setNodeRef} style={style} {...attributes} className="h-full w-full relative">
      <div {...listeners} className="h-full w-full">
        <CourseCard course={course} />
      </div>
      {/* X button in top-right corner - Premium Style */}
      {showRemove && onRemove && !course.locked && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            e.preventDefault();
            onRemove();
          }}
          className="absolute -top-1 -right-1 bg-white text-red-500 hover:bg-red-50 hover:text-red-600 rounded-full p-0.5 shadow-sm border border-red-100 z-50 transition-all opacity-0 group-hover:opacity-100 scale-90 hover:scale-100"
          title="ระเบิดตัวเอง (ลบวิชา)"
        >
          <X size={12} strokeWidth={3} />
        </button>
      )}
    </div>
  );
};

// Droppable wrapper for Course Bank
const DroppableCourseBank: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { setNodeRef, isOver } = useSortable({ id: 'course-bank' });
  return (
    <div
      ref={setNodeRef}
      className={`h-full transition-all ${isOver ? 'ring-2 ring-indigo-500 ring-inset' : ''}`}
    >
      {children}
    </div>
  );
};

const DroppableCell: React.FC<{
  id: string;
  course: CourseInstance | null;
  isTeacherPermanentUnavailable: boolean; // Teacher's permanent unavailability from preferences
  isCourseDisallowedDay: boolean; // Course's disallowed day constraint
  isDynamicUnavailable: boolean; // User-marked unavailable
  isSpecialPeriod: boolean; // Homeroom or Lunch break
  specialPeriodTitle: string | null; // Other special periods
  isOccupiedByOtherClass: boolean; // Slot occupied by this teacher in another class
  occupiedByOtherClassInfo: { classId: string | string[]; courseTitle: string } | null; // Info about the conflicting class
  occupiedByAnotherTeacherInfo: { classId: string; courseTitle: string; teacherName: string; isLocked: boolean; } | null; // Info about conflict with another teacher
  onClick: () => void; // For toggling dynamic unavailable
  onLockToggle: (slotId: string) => void;
  isDraggingOver: boolean;
  isDropForbidden: boolean;
  handleRemoveCourse?: (slotId: string) => void;
  isFilteredOut?: boolean; // New Prop
}> = ({
  id,
  course,
  isTeacherPermanentUnavailable,
  isCourseDisallowedDay,
  isDynamicUnavailable,
  isSpecialPeriod,
  specialPeriodTitle,
  isOccupiedByOtherClass,
  occupiedByOtherClassInfo,
  occupiedByAnotherTeacherInfo,
  onClick,
  onLockToggle,
  isDraggingOver,
  isDropForbidden,
  handleRemoveCourse,
  isFilteredOut, // Destructure
}) => {
    const { setNodeRef } = useSortable({ id, disabled: !!course?.locked });

    let cellClass = 'bg-white dark:bg-[#2a2b2f]';
    let content = null;
    let tooltip = '';

    // Handle Filtered Out State FIRST (Highest Priority for Visualization)
    if (isFilteredOut && course) {
      cellClass = 'bg-gray-50 dark:bg-gray-800/50 opacity-50'; // Faded out
      content = (
        <div className="h-full w-full p-1 rounded-lg flex flex-col items-center justify-center pointer-events-none select-none transition-opacity duration-300">
          <div className="text-center w-full overflow-hidden px-1 text-gray-400 dark:text-gray-500 opacity-60">
            <p className="font-bold text-[10px] leading-tight truncate">{course.title}</p>
            <p className="text-[9px] mt-0.5 truncate">{course.className}</p>
          </div>
        </div>
      );
      tooltip = 'วิชานี้ถูกซ่อนตามตัวกรอง';
    } else if (isDraggingOver) {
      if (isDropForbidden) {
        cellClass = 'bg-red-200 dark:bg-red-900/40'; // Forbidden drop target
        content = <X className="text-red-500 mx-auto" />;
        tooltip = 'ไม่สามารถวางได้';
      } else {
        cellClass = 'bg-green-200 dark:bg-green-900/40'; // Valid drop target
        content = <Check className="text-green-500 mx-auto" />;
        tooltip = 'วางได้';
      }
    } else if (course) { // If there's a course in the cell
      content = <DraggableCourse course={course as CourseInstance} showRemove={true} onRemove={() => handleRemoveCourse?.(id)} onLockToggle={(courseId) => onLockToggle(id)} />;
      tooltip = course.title;
    } else if (isTeacherPermanentUnavailable) {
      cellClass = 'bg-gray-100 dark:bg-gray-800/50 text-gray-400 dark:text-gray-500 cursor-not-allowed'; // Keep as is, this is for permanent unavailability
      content = <div className="text-xs flex flex-col items-center justify-center h-full gap-1 p-1 select-none"><Ban size={14} /><span>ไม่สะดวก</span></div>; // Keep as is
      tooltip = 'ครูไม่สะดวกสอนในวันนี้ตามการตั้งค่า'; // Keep as is
    } else if (isCourseDisallowedDay) {
      cellClass = 'bg-gray-100 dark:bg-gray-800/50 text-gray-400 dark:text-gray-500';
      content = <div className="text-xs flex flex-col items-center justify-center h-full gap-1 p-1"><Lock size={14} /><span>วิชาห้ามสอนวันนี้</span></div>;
      tooltip = 'วิชานี้ไม่สามารถสอนในวันนี้ได้';
    } else if (isOccupiedByOtherClass) {
      cellClass = 'bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400';
      content = (
        <div className="text-xs flex flex-col items-center justify-center h-full gap-1 p-1 overflow-hidden">
          <Lock size={14} />
          <p className="font-bold truncate w-full text-center">
            {getClassDisplayName(occupiedByOtherClassInfo?.classId)}
          </p>
        </div>
      );
      tooltip = `ครูมีสอนชั้น ${getClassDisplayName(occupiedByOtherClassInfo?.classId)} วิชา ${occupiedByOtherClassInfo?.courseTitle} ในเวลานี้แล้ว`;
    } else if (occupiedByAnotherTeacherInfo) {
      if (occupiedByAnotherTeacherInfo.isLocked) {
        cellClass = 'bg-gray-100 dark:bg-gray-800/50 text-gray-400 dark:text-gray-500';
        content = <div className="text-xs flex flex-col items-center justify-center h-full gap-1 p-1"><Lock size={14} /><span>ล็อคโดยครูอื่น</span></div>;
        tooltip = `คาบนี้ถูกล็อคโดยครู ${occupiedByAnotherTeacherInfo.teacherName}`;
      } else {
        cellClass = 'bg-yellow-50 dark:bg-yellow-900/20 text-yellow-700 dark:text-yellow-400 opacity-70 hover:opacity-100 transition-opacity';
        content = <div className="text-[10px] p-1 text-center">สอนโดย<br /><span className="font-bold">{occupiedByAnotherTeacherInfo.teacherName}</span></div>;
        tooltip = `คาบนี้มีสอนโดยครูท่านอื่น แต่สามารถวางทับได้`;
      }
    } else if (isDynamicUnavailable) {
      cellClass = 'bg-yellow-50 dark:bg-yellow-900/20 text-yellow-700 dark:text-yellow-400 border border-yellow-100 dark:border-yellow-900/30'; // Changed to yellow theme
      content = (
        <div className="text-xs flex flex-col items-center justify-center h-full gap-1 p-1 font-bold select-none">
          <Lock size={18} /> {/* Changed icon to Lock */}
          <span>คาบว่าง</span> {/* Text remains "คาบว่าง" */}
        </div>
      );
      tooltip = 'คาบนี้ถูกกำหนดให้เป็นคาบว่าง (ห้ามจัดสอน)';
    } else if (isSpecialPeriod) {
      cellClass = 'bg-gray-100 dark:bg-gray-800/50 text-gray-500 dark:text-gray-400';
      content = <div className="text-[10px] flex items-center justify-center h-full p-1">{specialPeriodTitle}</div>;
      tooltip = specialPeriodTitle || 'คาบพิเศษ';
    }

    const isClickableForDynamicUnavailable = !course && !isTeacherPermanentUnavailable && !isCourseDisallowedDay && !occupiedByOtherClassInfo && !occupiedByAnotherTeacherInfo && !isSpecialPeriod && !isDropForbidden;

    return (
      <td
        ref={setNodeRef}
        onClick={isClickableForDynamicUnavailable ? onClick : undefined}
        className={`border border-gray-200 dark:border-gray-700 h-auto p-0 align-top text-center transition-all duration-200 relative group ${cellClass} ${isClickableForDynamicUnavailable ? 'cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800' : 'cursor-default'}`}
        title={tooltip}
      >
        {content}
        {course && (
          <button
            onClick={(e) => { e.stopPropagation(); onLockToggle(id); }}
            className="absolute top-1 left-1 p-1.5 rounded-full bg-black/20 hover:bg-black/40 text-white opacity-0 group-hover:opacity-100 transition-opacity z-20"
            title={course.locked ? "ปลดล็อควิชา" : "ล็อควิชา"}
          >
            {course.locked ? <Lock size={12} /> : <Unlock size={12} />}
          </button>
        )}
        {isClickableForDynamicUnavailable && !isDraggingOver && !isDropForbidden && !isDynamicUnavailable && (
          <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
            <Ban size={16} className="text-gray-300 dark:text-gray-600" />
          </div>
        )}
      </td>
    );
  };

const MySwal = withReactContent(Swal);

// Add to global window object for SweetAlert2 HTML callbacks
declare global {
  interface Window {
    handleSmartMove: (overId: string, targetSlotId: string, conflictingTeacherId: string, targetCourseId: string) => void;
  }
}

export const TeacherSchedulePage: React.FC = () => {
  const [availableCourseInstances, setAvailableCourseInstances] = useState<CourseInstance[]>([]);
  const [allCourses, setAllCourses] = useState<Course[]>([]); // Store all courses for resetting
  const [schedule, setSchedule] = useState<Schedule>({});
  const [activeDragItem, setActiveDragItem] = useState<CourseInstance | null>(null);
  const [selectedTeacher, setSelectedTeacher] = useState<string>('');
  const [selectedSemester, setSelectedSemester] = useState<string>("1"); // Added semester state
  const scheduleSectionRef = useRef<HTMLDivElement>(null);
  const [teacherMasterSchedule, setTeacherMasterSchedule] = useState<Record<string, { classId: string | string[]; course: Course | null }>>({}); // Tracks all slots for a teacher, e.g. {"mon-1": { classId: "p1", course: { ... } }}
  const [schoolMasterSchedule, setSchoolMasterSchedule] = useState<Record<string, { teacherId: string; classId: string | string[]; course: Course | null }[]>>({});
  const [isSaving, setIsSaving] = useState(false);
  const [isAutoScheduling, setIsAutoScheduling] = useState(false);
  const [dynamicUnavailableSlots, setDynamicUnavailableSlots] = useState<string[]>([]);
  const [specialPeriods, setSpecialPeriods] = useState<SpecialPeriod[]>([]);
  const [periodSettings, setPeriodSettings] = useState<PeriodSetting[]>([]);
  const [schoolSettings, setSchoolSettings] = useState<SchoolSettings>({
    schoolType: '',
    opportunityExpansionLevel: '',
    availableClasses: []
  });
  const [filterSubjectGroup, setFilterSubjectGroup] = useState<string>('all');
  const [filterGroup, setFilterGroup] = useState<string>('all');
  const [subjectGroups, setSubjectGroups] = useState<string[]>([]);
  const [physicalRooms, setPhysicalRooms] = useState<any[]>([]);
  const [schedulingMetrics, setSchedulingMetrics] = useState<SchedulingMetrics | null>(null);
  const currentUser = useSelector((state: RootState) => state.auth.user);
  const { teachers: teacherMap, status: teacherMapStatus } = useSelector((state: RootState) => state.userMap);
  const teachers = useMemo<Teacher[]>(() => Object.values(teacherMap || {}) as Teacher[], [teacherMap]);
  const schoolId = (currentUser as any)?.schoolId;
  const dispatch = useDispatch();

  // ============================================
  // SMART MOVE HANDLER (Attached to Window for Swal)
  // ============================================
  // ============================================
  // SMART MOVE HANDLER (Attached to Window for Swal)
  // ============================================
  useEffect(() => {
    // @ts-ignore
    window.handleSmartMove = async (overId, targetSlotId, conflictingTeacherId, targetCourseId, activeInstanceId, activeClassIdsStr, conflictClassIdsStr) => {
      const activeClassIds = activeClassIdsStr.split(',');
      const conflictClassIds = conflictClassIdsStr.split(',');

      MySwal.close(); // Close dialog first

      const result = await MySwal.fire({
        title: 'ยืนยันการย้ายอัจฉริยะ (Smart Move)',
        text: `ระบบจะย้ายวิชาของครูท่านอื่นไปที่ช่องว่าง และนำวิชาของคุณมาลงแทนที่เดิม ตกลงหรือไม่?`,
        icon: 'question',
        showCancelButton: true,
        confirmButtonText: 'ตกลง ย้ายเลย',
        cancelButtonText: 'ยกเลิก',
        confirmButtonColor: '#4f46e5',
        showLoaderOnConfirm: true,
        preConfirm: async () => {
          try {
            const batch = writeBatch(db);

            // 1. Update Conflicting Teacher's Schedule
            // We need to fetch the current schedule of the conflicting teacher for these classes
            for (const cId of conflictClassIds) {
              const docId = `${conflictingTeacherId}_${cId}`;
              const docRef = doc(db, 'school-settings', schoolId!, 'schedules', docId);
              const docSnap = await getDoc(docRef);

              if (docSnap.exists()) {
                const currentData = docSnap.data();
                const currentSchedule = currentData.schedule || {};

                // Find the course to move
                const courseToMove = currentSchedule[overId];
                if (courseToMove && courseToMove.id === targetCourseId) {
                  const updatedSchedule = { ...currentSchedule };
                  delete updatedSchedule[overId]; // Remove from old slot
                  updatedSchedule[targetSlotId] = { ...courseToMove, instanceId: `${targetCourseId}-${targetSlotId}-${cId}` }; // Move to new slot

                  batch.update(docRef, {
                    schedule: updatedSchedule,
                    totalPeriods: Object.values(updatedSchedule).filter(Boolean).length
                  });
                }
              }
            }

            // 2. Update My Schedule
            // Since we are in the middle of a drag result, we want to save our move too.
            // activeInstanceId is the course we are dragging.
            const movingCourse = availableCourseInstances.find(c => c.instanceId === activeInstanceId);
            if (movingCourse) {
              for (const cId of activeClassIds) {
                const myDocId = `${selectedTeacher}_${cId}`;
                const myDocRef = doc(db, 'school-settings', schoolId!, 'schedules', myDocId);

                // Fetch current local schedule for this class (from Firestore or state)
                // Using state 'schedule' is safer for the current editing teacher
                const currentMySchedule = { ...schedule }; // This might be for a specific class if not filtered
                // NOTE: If selectedTeacher manages multiple classes, 'schedule' state in this component 
                // typically reflects the MERGED view. 
                // The handleSaveSchedule logic handles separating it by class.
                // For simplicity here, we'll update ALL classes this course belongs to.

                const updatedMySchedule = { ...currentMySchedule };
                // Remove from original position (where it was dragged from)
                // We don't necessarily know the original slot in this callback easily, 
                // but we know we want it at 'overId'.
                // Cleaning up other slots for this instanceId:
                Object.keys(updatedMySchedule).forEach(slot => {
                  if (updatedMySchedule[slot]?.instanceId === activeInstanceId) {
                    delete updatedMySchedule[slot];
                  }
                });

                updatedMySchedule[overId] = { ...movingCourse };

                batch.set(myDocRef, {
                  schedule: updatedMySchedule,
                  teacherId: selectedTeacher,
                  classId: cId,
                  totalPeriods: Object.values(updatedMySchedule).filter(Boolean).length
                }, { merge: true });
              }
            }

            await batch.commit();
            return true;
          } catch (error) {
            console.error("Smart move failed", error);
            MySwal.showValidationMessage(`เกิดข้อผิดพลาด: ${error}`);
          }
        }
      });

      if (result.isConfirmed) {
        MySwal.fire('สำเร็จ', 'ย้ายตารางเรียบร้อยแล้ว', 'success');
        // Refresh everything
        if (schoolId) {
          fetchData(schoolId);
          loadTeacherMasterSchedule();
        }
      }
    };

    return () => {
      // @ts-ignore
      window.handleSmartMove = undefined;
    };
  }, [schoolId, selectedTeacher, schedule, availableCourseInstances]);

  const loadSchoolMasterSchedule = useCallback(async (currentSchoolId: string) => {
    // Collect ALL occupancies per slot.
    // Key: slotId (e.g., "mon-1")
    // Value: Array of { teacherId, classId, course }
    const masterSchedule: Record<string, { teacherId: string; classId: string | string[]; course: Course | null }[]> = {};

    const schedulesCollectionRef = collection(db, 'school-settings', currentSchoolId, 'schedules');
    const querySnapshot = await getDocs(schedulesCollectionRef);

    querySnapshot.forEach((doc) => {
      const data = doc.data();
      const teacherId = data.teacherId;
      const classId = data.classId; // Can be string or string[]
      const scheduleData = data.schedule as Schedule;

      for (const slot in scheduleData) {
        if (scheduleData[slot]) {
          if (!masterSchedule[slot]) {
            masterSchedule[slot] = [];
          }
          masterSchedule[slot].push({ teacherId, classId, course: scheduleData[slot] });
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
        setAvailableCourseInstances(coursesData.map(course => ({ ...course, instanceId: course.id })));
      } catch (error) {
        console.error("Error fetching courses: ", error);
        MySwal.fire({ icon: 'error', title: 'เกิดข้อผิดพลาด', text: 'ไม่สามารถดึงข้อมูลรายวิชาได้' });
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
          const defaultPeriods: PeriodSetting[] = [{ id: 'homeroom', label: 'โฮมรูม', startTime: '08:30', endTime: '08:40', isTeachingPeriod: false }, { id: 'period-1', label: 'คาบที่ 1', startTime: '08:40', endTime: '09:30', isTeachingPeriod: true }, { id: 'period-2', label: 'คาบที่ 2', startTime: '09:30', endTime: '10:20', isTeachingPeriod: true }, { id: 'period-3', label: 'คาบที่ 3', startTime: '10:20', endTime: '11:10', isTeachingPeriod: true }, { id: 'period-4', label: 'คาบที่ 4', startTime: '11:10', endTime: '12:00', isTeachingPeriod: true }, { id: 'lunch', label: 'พักกลางวัน', startTime: '12:00', endTime: '13:00', isTeachingPeriod: false }, { id: 'period-5', label: 'คาบที่ 5', startTime: '13:00', endTime: '13:50', isTeachingPeriod: true }, { id: 'period-6', label: 'คาบที่ 6', startTime: '13:50', endTime: '14:40', isTeachingPeriod: true }, { id: 'period-7', label: 'คาบที่ 7', startTime: '14:40', endTime: '15:30', isTeachingPeriod: true }, { id: 'period-8', label: 'คาบที่ 8', startTime: '15:30', endTime: '16:00', isTeachingPeriod: true },];
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

        if (schoolSnap.exists()) {
          const data = schoolSnap.data();
          const levelRange = data.opportunityExpansionLevel;
          const allLevels = Object.entries(CLASSES);
          let filteredLevels = allLevels;

          if (levelRange === 'ป.1-ป.6') {
            filteredLevels = allLevels.filter(([key]) => key.startsWith('p'));
          } else if (levelRange === 'อ.1-ป.6') {
            filteredLevels = allLevels.filter(([key]) => key.startsWith('p') || key.startsWith('k'));
          } else if (levelRange === 'ม.1-ม.6') {
            filteredLevels = allLevels.filter(([key]) => key.startsWith('m'));
          } else if (levelRange === 'ป.1-ม.3') {
            filteredLevels = allLevels.filter(([key]) => key.startsWith('p') || ['m1', 'm2', 'm3'].includes(key));
          } else if (levelRange === 'อ.1-ม.3') {
            filteredLevels = allLevels.filter(([key]) => key.startsWith('p') || key.startsWith('k') || ['m1', 'm2', 'm3'].includes(key));
          } else if (levelRange === 'ป.1-ม.6') {
            filteredLevels = allLevels.filter(([key]) => !key.startsWith('k'));
          } else if (levelRange === 'อ.1-ม.6') {
            filteredLevels = allLevels;
          }

          setSchoolSettings({
            schoolType: data.schoolType || '',
            opportunityExpansionLevel: levelRange || '',
            availableClasses: filteredLevels.map(([key]) => key)
          });
        }
      } catch (error) {
        console.error("Error fetching school settings: ", error);
      }
    };

    if (teacherMapStatus === 'idle' && currentSchoolId) {
      dispatch(fetchTeachersMap(currentSchoolId) as any);
    }

    const fetchCalendarSettings = async () => {
      try {
        const calendarDocRef = doc(db, 'school-settings', currentSchoolId, 'main_calendar', 'default');
        const docSnap = await getDoc(calendarDocRef);
        if (docSnap.exists()) {
          const data = docSnap.data();
          const today = new Date().toISOString().split('T')[0];
          const term1 = data.terms?.term1;
          const term2 = data.terms?.term2;

          if (term1?.startDate && term1?.endDate && today >= term1.startDate && today <= term1.endDate) {
            setSelectedSemester('1');
          } else if (term2?.startDate && term2?.endDate && today >= term2.startDate && today <= term2.endDate) {
            setSelectedSemester('2');
          }
        }
      } catch (error) {
        console.error("Error fetching calendar settings:", error);
      }
    };

    const fetchSubjectGroups = async () => {
      try {
        const sgRef = collection(db, 'school-settings', currentSchoolId, 'subject_groups');
        const sgSnap = await getDocs(sgRef);
        const sgData = sgSnap.docs.map(d => d.data().name as string);
        setSubjectGroups(['all', ...sgData.filter(Boolean)]);
      } catch (error) {
        console.error("Error fetching subject groups: ", error);
      }
    };

    const fetchPhysicalRooms = async () => {
      try {
        const roomsRef = collection(db, 'school-settings', currentSchoolId, 'physical-rooms');
        const roomsSnap = await getDocs(roomsRef);
        const roomsData = roomsSnap.docs.map(d => ({ id: d.id, ...d.data() }));
        setPhysicalRooms(roomsData);
      } catch (error) {
        console.error("Error fetching physical rooms: ", error);
      }
    };

    await Promise.all([
      fetchCourses(),
      fetchSpecialPeriods(),
      fetchScheduleSettings(),
      fetchSchoolSettings(),
      fetchCalendarSettings(),
      fetchSubjectGroups(),
      fetchPhysicalRooms()
    ]);
  }, [dispatch, teacherMapStatus]);

  useEffect(() => { // Initial data fetch
    if (schoolId) {
      loadSchoolMasterSchedule(schoolId);
      fetchData(schoolId);
    }
  }, [schoolId, fetchData, loadSchoolMasterSchedule]);


  // Effect to load ALL schedules for a selected teacher to prevent conflicts
  useEffect(() => {
    loadTeacherMasterSchedule();
  }, [selectedTeacher, schoolId]); // Re-run if schoolId changes

  const loadTeacherMasterSchedule = useCallback(async () => {
    if (!selectedTeacher || !schoolId) {
      setTeacherMasterSchedule({});
      return;
    }
    const masterSchedule: Record<string, { classId: string | string[]; course: Course | null }> = {};
    const schedulesCollectionRef = collection(db, 'school-settings', schoolId, 'schedules');
    const q = query(schedulesCollectionRef, where('teacherId', '==', selectedTeacher));
    const querySnapshot = await getDocs(q);
    querySnapshot.forEach((doc) => {
      const data = doc.data();
      const classId = data.classId;
      const scheduleData = data.schedule as Schedule;
      for (const slot in scheduleData) { // Use for...in for objects
        if (scheduleData[slot]) {
          // If the slot is not already taken by another class for this teacher, add it.
          // This prevents overwriting and correctly identifies that the slot is busy.
          if (!masterSchedule[slot]) {
            masterSchedule[slot] = { classId, course: scheduleData[slot] };
          }
        }
      }
    });
    setTeacherMasterSchedule(masterSchedule);
  }, [selectedTeacher, schoolId]);

  useEffect(() => {
    const loadTeacherData = async () => {
      if (!selectedTeacher || !schoolId) {
        setDynamicUnavailableSlots([]);
        return;
      }
      // Load master schedule for the teacher (existing function)
      loadTeacherMasterSchedule();

      // Directly fetch teacher's preferences to ensure data is fresh
      try {
        const teacherRef = doc(db, 'school-settings', schoolId, 'teachers', selectedTeacher);
        const teacherSnap = await getDoc(teacherRef);
        const teacherData = teacherSnap.data() as Teacher | undefined;
        setDynamicUnavailableSlots(teacherData?.preferences?.unavailableSlots || []);
      } catch (error) {
        console.error("Error fetching teacher preferences directly:", error);
        setDynamicUnavailableSlots([]);
      }
    };

    loadTeacherData();
  }, [selectedTeacher, schoolId, loadTeacherMasterSchedule]);
  useEffect(() => {
    // 1. Populate the schedule grid from the master schedule
    const newSchedule: Schedule = {};

    // Helper for semester matching
    const isCorrectSemester = (c: Course) => {
      const semStr = String(c.semester || "");
      const targetSem = String(selectedSemester || "1");
      return !c.semester || semStr === targetSem || semStr.startsWith(targetSem + '/') || targetSem.startsWith(semStr + '/');
    };

    // Helper for teacher assignment check
    const getTeacherAssignments = (c: Course) => {
      const explicit = c.teacherAssignments?.filter(a => a.teacherId === selectedTeacher) || [];
      if (explicit.length > 0) return explicit;

      if (c.teacherId === selectedTeacher || c.teacherIds?.includes(selectedTeacher)) {
        return [{
          teacherId: selectedTeacher,
          classLevels: Array.isArray(c.classId) ? c.classId : [c.classId || ''],
          roomIds: c.room || []
        }];
      }
      return [];
    };

    Object.entries(teacherMasterSchedule).forEach(([slotId, entry]) => {
      if (entry.course && isCorrectSemester(entry.course)) {
        const courseDoc = allCourses.find(c => c.id === entry.course!.id);
        const assignments = courseDoc ? getTeacherAssignments(courseDoc) : [];

        if (assignments.length > 0) {
          newSchedule[slotId] = {
            ...(entry.course as Course),
            instanceId: `${entry.course!.id}-${slotId}`, // Make it unique for dnd
            className: getClassDisplayName(entry.classId),
            locked: entry.course.locked || courseDoc?.locked || false,
          };
        }
      }
    });
    setSchedule(newSchedule);

    // 2. Populate the course bank with remaining courses
    const remainingInstances: CourseInstance[] = [];

    allCourses.filter(c => isCorrectSemester(c) && getTeacherAssignments(c).length > 0)
      .forEach(course => {
        const assignments = getTeacherAssignments(course);
        const totalHours = course.hoursPerWeek || 1;

        assignments.forEach((assign) => {
          // Count how many of THIS specific assignment (group) are already on the schedule
          // We identify by course ID AND the group number (stored in 'room')
          const scheduledSlots = Object.values(newSchedule).filter(s => 
            s?.id === course.id && 
            (s.room?.includes(String(assign.groupNumber || 1)) || (!s.room && assign.groupNumber === 1))
          ).length;

          const remainingSlots = Math.max(0, totalHours - scheduledSlots);
          for (let i = 0; i < remainingSlots; i++) {
            remainingInstances.push({
              ...course,
              instanceId: `${course.id}-group${assign.groupNumber || 1}-bank-${i}-${Date.now()}`,
              className: `${getClassDisplayName(assign.classLevels)}${assign.groupNumber ? `/${assign.groupNumber}` : ''}`,
              room: [String(assign.groupNumber || '1')], // Store group number in room property
              locked: false
            });
          }
        });
      });

    setAvailableCourseInstances(remainingInstances);
  }, [selectedTeacher, teacherMasterSchedule, allCourses, selectedSemester]); // Add selectedSemester dependency

  const checkConstraints = useCallback((course: CourseInstance, targetSlotId: string, currentTeacherData: Teacher | undefined, currentDynamicUnavailableSlots: string[]) => {
    const [dayKey, periodNumberStr] = targetSlotId.split('-');
    const periodSetting = periodSettings.find(p => p.id === `period-${periodNumberStr}`);

    // Constraint 1: Non-teaching periods
    if (!periodSetting || !periodSetting.isTeachingPeriod) {
      return { forbidden: true, message: `ไม่สามารถวางรายวิชาในคาบ '${periodSetting?.label || 'พิเศษ'}' ได้` };
    }

    // Constraint 2: Teacher's permanent unavailability
    if (currentTeacherData?.preferences?.unavailableDays?.includes(dayKey)) {
      return { forbidden: true, message: `ครู ${currentTeacherData.name} ไม่สะดวกสอนในวัน${DAYS[dayKey as keyof typeof DAYS]}` };
    }
    if (currentTeacherData?.preferences?.unavailableSlots?.includes(targetSlotId)) {
      return { forbidden: true, message: `ครู ${currentTeacherData.name} ไม่สะดวกสอนในคาบนี้` };
    }

    // Constraint 3: Course's disallowed days
    if (course.constraints?.disallowedDays?.includes(dayKey)) {
      return { forbidden: true, message: `รายวิชา '${course.title}' ไม่สามารถจัดสอนในวัน${DAYS[dayKey as keyof typeof DAYS]}ได้` };
    }

    // Constraint 3.1: Course's locked slots
    if (course.constraints?.lockedSlots && course.constraints.lockedSlots.length > 0) {
      const isThisSlotLocked = course.constraints.lockedSlots.some(s => s.day === dayKey && s.periodId === `period-${periodNumberStr}`);
      if (!isThisSlotLocked) {
        return { forbidden: true, message: `รายวิชานี้ถูกล็อคให้สอนในคาบเฉพาะเจาะจงเท่านั้น` };
      }
    }

    // Constraint 4: PE courses on Wednesday
    if (course.title.includes('พละ') && dayKey === 'wed') {
      return { forbidden: true, message: 'ไม่สามารถจัดสอนวิชาพละในวันพุธได้' };
    }

    // Constraint 5: Dynamically marked unavailable slot
    if (currentDynamicUnavailableSlots.includes(targetSlotId)) {
      return { forbidden: true, message: 'คาบนี้ถูกกำหนดให้เป็นคาบว่างชั่วคราว' };
    }

    // Constraint 6: Special Period (Activity)
    if (periodSetting) {
      const specialPeriod = specialPeriods.find(sp =>
        (sp.linkedPeriodId === periodSetting.id && (!sp.day || sp.day === 'all' || sp.day === dayKey)) ||
        (sp.startTime === periodSetting.startTime && sp.endTime === periodSetting.endTime && (!sp.day || sp.day === 'all' || sp.day === dayKey))
      );
      if (specialPeriod) {
        return { forbidden: true, message: `ไม่สามารถวางในคาบ '${specialPeriod.title}' ได้` };
      }
    }

    return { forbidden: false, message: '' };
  }, [periodSettings, teachers, specialPeriods]);


  const handleToggleDynamicUnavailable = (slotId: string) => {
    // Prevent toggling if a course is in the slot, or it's occupied by another class, or permanently unavailable
    if (schedule[slotId] || teacherMasterSchedule[slotId]) return;

    const [, periodId] = slotId.split('-');
    const periodSetting = periodSettings.find(p => p.id === `period-${periodId}`);
    // Cannot lock non-teaching periods (which won't be found in the check above) or special periods
    if (!periodSetting || !periodSetting.isTeachingPeriod) return;

    const teacher = teachers.find(t => t.id === selectedTeacher);
    const [dayKey, periodNumberStr] = slotId.split('-');

    // Allow toggling even if it was previously saved as unavailable (so user can uncheck it)
    // But still respect unavailableDays which are likely set elsewhere or should be immutable here?
    // For now, let's assume unavailableDays are fixed constraints, but unavailableSlots are toggleable here.

    setDynamicUnavailableSlots(prev =>
      prev.includes(slotId)
        ? prev.filter(s => s !== slotId)
        : [...prev, slotId]
    );
  };

  const handleToggleCourseLock = (slotId: string) => {
    setSchedule(prev => {
      const course = prev[slotId];
      if (!course) return prev;

      const newSchedule = { ...prev };
      newSchedule[slotId] = { ...course, locked: !course.locked };
      return newSchedule;
    });
  };

  const sensors = useSensors(useSensor(PointerSensor));

  const findItemById = (id: string) => {
    // Find in available instances first
    const instance = availableCourseInstances.find(item => item.instanceId === id);
    if (instance) return instance;
    // If not found, it must be an item already on the schedule.
    const courseOnSchedule = Object.values(schedule).find(c => c?.instanceId === id);
    return courseOnSchedule || null;
  };

  const handleDragStart = (event: DragStartEvent) => {
    const item = findItemById(String(event.active.id));
    if (item) setActiveDragItem(item);
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    setActiveDragItem(null);

    if (!over) return;

    const activeId = String(active.id);
    const overId = String(over.id);

    if (activeId === overId) return;

    const activeItem = findItemById(activeId);
    if (!activeItem) return;

    const originalCellKey = Object.keys(schedule).find(key => schedule[key]?.instanceId === activeId);
    const isFromBank = !originalCellKey;
    const targetItemInCurrentSchedule = schedule[overId];
    const targetItemInSchoolSchedule = schoolMasterSchedule[overId];

    // --- Universal Checks ---
    // Check if target is locked in the current teacher's schedule
    if (targetItemInCurrentSchedule?.locked) {
      MySwal.fire({ icon: 'error', title: 'ไม่สามารถย้ายได้', text: 'ไม่สามารถวางทับหรือสลับกับคาบที่ถูกล็อคได้' });
      return;
    }
    // Check if the target slot is occupied by another teacher AND that course is locked.
    // Iterate through all occupancies at this slot
    const targetOccupancies = schoolMasterSchedule[overId] || [];
    const lockedConflict = targetOccupancies.find(occ =>
      occ.teacherId !== selectedTeacher && occ.course?.locked
    );

    if (lockedConflict) {
      MySwal.fire({ icon: 'error', title: 'ไม่สามารถย้ายได้', text: `คาบนี้ถูกล็อคโดยครูท่านอื่น (${teacherMap[lockedConflict.teacherId]?.name || 'N/A'})` });
      return;
    }

    // Check base constraints for the item being dragged
    const { forbidden: activeForbidden, message: activeMessage } = checkConstraints(activeItem, overId, selectedTeacherData, dynamicUnavailableSlots);
    if (activeForbidden) {
      MySwal.fire({ icon: 'warning', title: 'ไม่สามารถย้ายได้', text: activeMessage });
      return;
    }

    // --- CONFLICT CHECKS ---

    // --- CONFLICT CHECKS ---

    // 1. Check for CLASS conflict: Is ANY of the target classes occupied by another teacher?
    const activeClasses = Array.isArray(activeItem.classId) ? activeItem.classId : [activeItem.classId || '']; // Handle undefined gracefully
    const occupancies = schoolMasterSchedule[overId] || [];

    // Find if any class in the active item is already occupied in this slot by another teacher
    const conflict = occupancies.find(occ => {
      const occupiedClassId = occ.classId;
      const occupiedClasses = Array.isArray(occupiedClassId) ? occupiedClassId : [occupiedClassId];

      // Class Intersection Check
      const classIntersect = activeClasses.some(cls => cls && occupiedClasses.includes(cls));
      if (!classIntersect) return false;

      // Room Intersection Check (ONLY if classes intersect)
      // If either course has no room or "all" or empty room array, it affects the WHOLE class -> Conflict
      // If both have specific rooms, check intersection.

      const activeRooms = activeItem.room && activeItem.room.length > 0 ? activeItem.room : ['all'];
      const occupiedCourse = occ.course;
      const occupiedRooms = occupiedCourse?.room && occupiedCourse.room.length > 0 ? occupiedCourse.room : ['all'];

      const isActiveAll = activeRooms.includes('all');
      const isOccupiedAll = occupiedRooms.includes('all');

      let roomIntersect = false;
      if (isActiveAll || isOccupiedAll) {
        roomIntersect = true;
      } else {
        roomIntersect = activeRooms.some(r => occupiedRooms.includes(r));
      }

      // It's a conflict if classes intersect AND rooms intersect AND it's not the same teacher
      return roomIntersect && occ.teacherId !== selectedTeacher;
    });

    if (conflict) {
      const conflictClassId = conflict.classId;
      const displayClass = getClassDisplayName(conflictClassId);

      // SMART SWAP: Calculate options
      const targetCourse = conflict.course; // The course currently occupying the slot

      // Safety check
      if (!targetCourse) {
        MySwal.fire({
          icon: 'error',
          title: 'ตารางเรียนทับซ้อน',
          text: `ชั้น ${displayClass} มีคาบสอนของครู ${teacherMap[conflict.teacherId]?.name || 'อื่น'} ในเวลานี้แล้ว`
        });
        return;
      }

      const movingCourse = activeItem;      // The course we are trying to place
      const conflictingTeacherId = conflict.teacherId;
      const conflictingTeacherName = teacherMap[conflictingTeacherId]?.name || 'อื่น';

      // 1. Find valid slots for the CONFLICTING course to move to
      // Cast targetCourse to CourseInstance temporarily for the helper (we assume it acts like one for constraints)
      const targetCourseInstance = { ...targetCourse, instanceId: `temp-${targetCourse.id}` } as CourseInstance;

      const alternativesForConflict = findValidSlots(
        targetCourseInstance,
        conflictingTeacherId,
        {}, // No local schedule for other teacher
        schoolMasterSchedule,
        teacherMap[conflictingTeacherId] || { id: conflictingTeacherId, name: 'Unknown' } as Teacher
      );

      // 2. Find valid slots for MY course (Alternative Suggestions)
      const alternativesForMe = findValidSlots(
        movingCourse,
        selectedTeacher,
        schedule,
        schoolMasterSchedule,
        selectedTeacherData || { id: selectedTeacher, name: 'Current Teacher' } as Teacher
      );

      let htmlContent = `
        <div class="text-left space-y-4">
          <div class="bg-red-50 dark:bg-red-900/20 p-3 rounded-lg border border-red-200 dark:border-red-800">
            <h3 class="font-bold text-red-800 dark:text-red-300 flex items-center gap-2">
              ⚠️ ตารางชนกัน!
            </h3>
            <p class="text-sm text-red-700 dark:text-red-400 mt-1">
              ชั้น <b>${displayClass}</b> มีเรียนวิชา <b>${targetCourse.title}</b> กับครู <b>${conflictingTeacherName}</b> แล้ว
            </p>
          </div>
          
          <!-- Option A: Suggest slots for ME -->
          <div>
            <p class="font-semibold text-gray-700 dark:text-gray-300 mb-2 text-sm">💡 ทางเลือกสำหรับวิชาของคุณ:</p>
            ${alternativesForMe.length > 0 ? `
              <div class="space-y-2 max-h-40 overflow-y-auto pr-1 custom-scrollbar">
                ${alternativesForMe.slice(0, 3).map(slot => {
        const [d, p] = slot.split('-');
        const dayName = DAYS[d as keyof typeof DAYS];
        return `
                    <div class="w-full text-left p-2 bg-blue-50 dark:bg-blue-900/20 rounded border border-blue-100 dark:border-blue-800 flex justify-between items-center text-sm">
                      <span class="text-gray-800 dark:text-gray-200">ลงที่ <b>${dayName} คาบ ${p}</b> แทน</span>
                      <span class="text-xs bg-blue-100 dark:bg-blue-800 text-blue-700 dark:text-blue-300 px-1.5 py-0.5 rounded">ว่าง</span>
                    </div>
                  `;
      }).join('')}
              </div>
            ` : `<p class="text-sm text-gray-500 italic">ไม่พบช่วงเวลาอื่นที่เหมาะสม</p>`}
          </div>

          <!-- Option B: Move Conflict -->
          ${alternativesForConflict.length > 0 ? `
            <div>
              <p class="font-semibold text-gray-700 dark:text-gray-300 mb-2 text-sm">↩️ หรือย้ายวิชาของครู ${conflictingTeacherName} ไปที่:</p>
              <div class="space-y-2">
                ${alternativesForConflict.slice(0, 3).map(slot => {
        const [d, p] = slot.split('-');
        const dayName = DAYS[d as keyof typeof DAYS];
        const myClassIdsStr = (Array.isArray(activeItem.classId) ? activeItem.classId : [activeItem.classId || '']).join(',');
        const conflictClassIdsStr = (Array.isArray(conflict.classId) ? conflict.classId : [conflict.classId || '']).join(',');

        return `
                    <button class="w-full text-left p-2 hover:bg-orange-50 dark:hover:bg-orange-900/30 border border-gray-200 dark:border-gray-700 rounded flex justify-between items-center group transition-all" onclick="window.handleSmartMove('${overId}', '${slot}', '${conflictingTeacherId}', '${targetCourse.id}', '${activeItem.instanceId}', '${myClassIdsStr}', '${conflictClassIdsStr}')">
                      <span class="text-sm text-gray-700 dark:text-gray-300">ย้ายไป <b>${dayName} คาบ ${p}</b></span>
                      <span class="text-xs text-orange-600 dark:text-orange-400 opacity-0 group-hover:opacity-100 font-semibold transition-opacity">เลือก</span>
                    </button>
                  `;
      }).join('')}
              </div>
            </div>
          ` : ''}
        </div>
      `;

      MySwal.fire({
        title: '',
        html: htmlContent,
        showConfirmButton: false,
        showCloseButton: true,
        width: '500px',
        customClass: {
          popup: 'rounded-xl shadow-xl'
        }
      });
      return;
    }

    // 2. Check for TEACHER conflict: Is this teacher already scheduled to teach another class at the target time?
    // This checks the master schedule for conflicts not visible in the current draft (i.e., when moving to a visually empty slot).
    const teacherMasterConflict = teacherMasterSchedule[overId];
    if (teacherMasterConflict && !schedule[overId]) { // If the slot is busy in the master but empty in the current draft
      // Check if the "conflict" is actually the same course we are moving (e.g., moving back to original spot)
      const conflictClassId = teacherMasterConflict.classId;
      const activeClassIds = Array.isArray(activeItem.classId) ? activeItem.classId : [activeItem.classId];
      const conflictClassIds = Array.isArray(conflictClassId) ? conflictClassId : [conflictClassId];

      const isSameClass = activeClassIds.some(id => id && conflictClassIds.includes(id));
      const isSameCourse = teacherMasterConflict.course?.id === activeItem.id;

      if (!isSameClass || !isSameCourse) {
        MySwal.fire({
          icon: 'error',
          title: 'เวลาสอนทับซ้อน',
          text: `ครู ${teacherMap[selectedTeacher]?.name} มีสอนวิชา "${teacherMasterConflict.course?.title}" ของชั้น ${getClassDisplayName(teacherMasterConflict.classId)} ในเวลานี้แล้ว`
        });
        return;
      }
    }

    // --- Logic Split ---
    if (isFromBank) {
      // Case 1: From Bank. Target must be empty.
      if (targetItemInCurrentSchedule) {
        // Check if the target is occupied by a course from the same class
        // Simply block any overwrite for now to be safe, or allow if purely swapping (but this is bank->grid, so no swap)
        MySwal.fire({ icon: 'error', title: 'คาบเรียนไม่ว่าง', text: 'ไม่สามารถวางทับวิชาที่มีอยู่แล้วได้' });
        return;
      }
      // Move from bank to empty slot
      setSchedule(prev => {
        const newSchedule = { ...prev };
        newSchedule[overId] = { ...activeItem, instanceId: `${activeItem.id}-${overId}`, locked: false };
        setAvailableCourseInstances(current => current.filter(c => c.instanceId !== activeId));
        return newSchedule;
      });
    } else {
      // From Grid
      if (overId === 'course-bank') {
        // Case 2: From Grid to Bank
        setSchedule(prev => {
          const newSchedule = { ...prev };
          newSchedule[originalCellKey!] = null;
          setAvailableCourseInstances(current => [...current, { ...activeItem, instanceId: `${activeItem.id}-bank-${Date.now()}` }]);
          return newSchedule;
        });
      } else if (targetItemInCurrentSchedule) {
        // Prevent swapping if both courses belong to the same class (or intersecting classes).
        // Simple check: if either is an array or string, just block swap if they share ANY class.
        // Ideally we just block overwrites/swaps that cause conflicts.
        // For simplicity in this complex scenario: ALLOW swap if no other hard constraints are violated.

        // But let's check class intersection to be safe?
        // Actually, the teacher is the same (selectedTeacher). So a SWAP is always safe for the teacher's time.
        // The only issue is if the NEW time for the displaced item causes a conflict for the CLASS.

        // Check constraints for the item being swapped back (targetItemInCurrentSchedule moving to originalCellKey)
        const { forbidden: targetForbidden, message: targetMessage } = checkConstraints(targetItemInCurrentSchedule, originalCellKey!, selectedTeacherData, dynamicUnavailableSlots);
        if (targetForbidden) {
          MySwal.fire({ icon: 'warning', title: 'ไม่สามารถสลับได้', text: `วิชา "${targetItemInCurrentSchedule.title}" ไม่สามารถย้ายไปที่ช่องเดิมได้: ${targetMessage}` });
          return;
        }

        // Also need to check if the 'originalCellKey' is free for the class of 'targetItemInCurrentSchedule' (in case another teacher has that class then)
        // But wait, 'originalCellKey' was occupied by 'activeItem' just now. So this teacher was teaching 'activeItem'.
        // If 'activeItem' and 'targetItem' are for different classes, we need to check if 'targetItem's class is free at 'originalCellKey'.

        const targetClasses = Array.isArray(targetItemInCurrentSchedule.classId) ? targetItemInCurrentSchedule.classId : [targetItemInCurrentSchedule.classId!];
        const originalSlotOccupancies = schoolMasterSchedule[originalCellKey!] || [];
        const swapBackConflict = originalSlotOccupancies.find(occ => {
          const occupiedClasses = Array.isArray(occ.classId) ? occ.classId : [occ.classId];
          const classIntersect = targetClasses.some(cls => occupiedClasses.includes(cls));
          if (!classIntersect) return false;

          const targetRooms = targetItemInCurrentSchedule.room && targetItemInCurrentSchedule.room.length > 0 ? targetItemInCurrentSchedule.room : ['all'];
          const occupiedRooms = occ.course?.room && occ.course.room.length > 0 ? occ.course.room : ['all'];

          const isTargetAll = targetRooms.includes('all');
          const isOccupiedAll = occupiedRooms.includes('all');

          let roomIntersect = false;
          if (isTargetAll || isOccupiedAll) {
            roomIntersect = true;
          } else {
            roomIntersect = targetRooms.some(r => occupiedRooms.includes(r));
          }

          return roomIntersect && occ.teacherId !== selectedTeacher;
        });

        if (swapBackConflict) {
          MySwal.fire({
            icon: 'error',
            title: 'ไม่สามารถสลับได้',
            text: `ชั้น ${getClassDisplayName(swapBackConflict.classId)} มีคาบสอนของครูอื่นที่ช่องเดิมแล้ว`
          });
          return;
        }
        // Perform swap
        setSchedule(prev => {
          const newSchedule = { ...prev };
          newSchedule[overId] = { ...activeItem, locked: false };
          newSchedule[originalCellKey!] = { ...targetItemInCurrentSchedule, locked: false };
          return newSchedule;
        });
      } else {
        // Case 4: MOVE from Grid to empty Grid slot
        setSchedule(prev => {
          const newSchedule = { ...prev };
          newSchedule[overId] = { ...activeItem, locked: false };
          newSchedule[originalCellKey!] = null;
          return newSchedule;
        });
      }
    }
  };

  const handleSaveSchedule = async () => {
    if (!selectedTeacher || !schoolId) {
      MySwal.fire({ icon: 'warning', title: 'ข้อมูลไม่ครบถ้วน', text: 'กรุณาเลือกครูผู้สอนก่อนบันทึก' });
      return;
    }
    setIsSaving(true);
    try {
      const batch = writeBatch(db);
      const schedulesByClass: Record<string, Record<string, Course | null>> = {}; // Use Course | null for saving

      // 1. Group the current displayed schedule by classId


      // 2. Get all classes this teacher teaches to handle empty schedules
      // Flatten the class IDs if they are arrays
      const teacherClasses = new Set<string>();
      allCourses.filter(c => {
        const isCorrectSem = !c.semester || String(c.semester).startsWith(selectedSemester);
        const isAssigned = c.teacherId === selectedTeacher ||
          c.teacherIds?.includes(selectedTeacher) ||
          c.teacherAssignments?.some(a => a.teacherId === selectedTeacher);
        return isCorrectSem && isAssigned;
      }).forEach(c => {
        const assignments = c.teacherAssignments?.filter(a => a.teacherId === selectedTeacher) || [];
        if (assignments.length > 0) {
          assignments.forEach(a => {
            a.classLevels?.forEach(id => teacherClasses.add(id));
          });
        } else {
          if (Array.isArray(c.classId)) {
            c.classId.forEach(id => teacherClasses.add(id));
          } else if (c.classId) {
            teacherClasses.add(c.classId);
          }
        }
      });

      // 3. For each class, prepare a save operation
      // We need to reconstruct the schedule for EACH class individually.
      // If a course is for ["p1", "p2"], it must appear in the schedule for p1 AND p2.

      const schedulesByClassId: Record<string, Record<string, Course | null>> = {};

      // Initialize for all classes
      teacherClasses.forEach(cId => {
        schedulesByClassId[cId] = {};
      });

      // Populate
      Object.entries(schedule).forEach(([slotId, course]) => {
        if (course && course.classId) {
          const { instanceId, className, locked, ...courseToSave } = course;
          const classIds = Array.isArray(course.classId) ? course.classId : [course.classId];

          classIds.forEach(cId => {
            if (!schedulesByClassId[cId]) schedulesByClassId[cId] = {};
            schedulesByClassId[cId][slotId] = courseToSave;
          });
        }
      });

      // Writes
      for (const classId of Array.from(teacherClasses)) {
        if (!classId) continue;
        const scheduleId = `${selectedTeacher}_${classId}`;
        const scheduleRef = doc(db, "school-settings", schoolId, "schedules", scheduleId);
        const finalScheduleForClass = schedulesByClassId[classId] || {};

        batch.set(scheduleRef, {
          schedule: finalScheduleForClass,
          teacherId: selectedTeacher,
          classId: classId,
          totalPeriods: Object.values(finalScheduleForClass).filter(Boolean).length,
        });
      }

      // 4. Save dynamicUnavailableSlots to teacher's preferences
      const teacherRef = doc(db, 'school-settings', schoolId, 'teachers', selectedTeacher);
      batch.update(teacherRef, {
        'preferences.unavailableSlots': dynamicUnavailableSlots,
      });

      await batch.commit();

      MySwal.fire({
        toast: true,
        position: 'top-end',
        icon: 'success',
        title: 'บันทึกตารางสอนสำเร็จ!',
        showConfirmButton: false,
        timer: 3000,
        timerProgressBar: true,
      });
      await loadTeacherMasterSchedule(); // Refresh master schedule after saving (for local display)
      // Re-fetch teacher map to ensure preferences are up-to-date in Redux state
      dispatch(fetchTeachersMap(schoolId) as any);
    } catch (error) {
      console.error("Error saving schedule: ", error);
      MySwal.fire({ icon: 'error', title: 'เกิดข้อผิดพลาด', text: 'เกิดข้อผิดพลาดในการบันทึกตารางสอน' });
    } finally {
      setIsSaving(false);
    }
  };

  const handleClearSchedule = async () => {
    if (!selectedTeacher || !schoolId) {
      MySwal.fire({ icon: 'warning', title: 'ข้อมูลไม่ครบถ้วน', text: 'กรุณาเลือกครูที่ต้องการล้างตารางสอน' });
      return;
    }

    const result = await MySwal.fire({
      title: 'ยืนยันการล้างตารางสอน',
      text: `คุณแน่ใจหรือไม่ว่าต้องการล้างตารางสอนทั้งหมดของครูท่านนี้?`,
      icon: 'warning',
      showCancelButton: true,
      confirmButtonColor: '#d33',
      cancelButtonColor: '#3085d6',
      confirmButtonText: 'ใช่, ล้างข้อมูล',
      cancelButtonText: 'ยกเลิก'
    });

    if (result.isConfirmed) {
      setSchedule({});
      MySwal.fire(
        'ล้างข้อมูลแล้ว!',
        'ตารางสอนของครูท่านนี้ถูกล้างแล้ว',
        'success'
      );
    }
  };

  const handleAutoScheduleForTeacherAndClasses = async () => {
    if (!selectedTeacher || !schoolId) {
      MySwal.fire({ icon: 'warning', title: 'ข้อมูลไม่ครบถ้วน', text: 'กรุณาเลือกครูเพื่อเริ่มการจัดตารางอัตโนมัติ' });
      return;
    }

    setIsAutoScheduling(true);
    try {
      const teacherCourses = allCourses.filter(c =>
        c.teacherId === selectedTeacher ||
        c.teacherIds?.includes(selectedTeacher) ||
        c.teacherAssignments?.some(a => a.teacherId === selectedTeacher)
      );

      if (teacherCourses.length === 0) {
        MySwal.fire({ icon: 'info', title: 'ไม่พบข้อมูล', text: 'ไม่พบรายวิชาที่ผูกกับครูท่านนี้' });
        return;
      }

      // 2. Fetch all existing schedules (GLOBAL) to build a master view of occupied slots
      // Ensure we treat masterSchedule as Multi-Occupancy
      const schedulesCollectionRef = collection(db, 'school-settings', schoolId, 'schedules');
      const schedulesSnapshot = await getDocs(schedulesCollectionRef);
      const masterSchedule: Record<string, { teacherId: string, classId: string | string[], courseId?: string, room?: string[] }[]> = {};

      const teacherCurrentSchedules: Record<string, Schedule> = {}; // Store existing schedules to preserve locked items

      schedulesSnapshot.forEach(doc => {
        const data = doc.data();
        const docId = doc.id;

        // If this is OUR schedule, save it to preserve locks, but don't add to masterSchedule checks for SELF (we will overwrite)
        const isMySchedule = data.teacherId === selectedTeacher;
        if (isMySchedule) {
          const classId = docId.split('_')[1]; // Extract classId from "teacherId_classId" (approximate)
          if (data.classId) {
            // We might need to map correctly if doc ID format varies, but usually we use data.classId
            // Store strictly for keeping locks
            teacherCurrentSchedules[data.classId as string] = data.schedule as Schedule;
          }
        }

        Object.keys(data.schedule || {}).forEach(slot => {
          if (data.schedule[slot]) {
            if (!masterSchedule[slot]) masterSchedule[slot] = [];
            // Add to master schedule
            masterSchedule[slot].push({
              teacherId: data.teacherId,
              classId: data.classId,
              courseId: data.schedule[slot].id,
              room: data.schedule[slot].room
            });
          }
        });
      });

      // Get teacher data for constraint checking
      const teacher = teachers.find((t: Teacher) => t.id === selectedTeacher);

      // 3. Prepare All Tasks (Flattened)
      // We need to schedule EVERYTHING for this teacher.
      // Locked items stay fixed. Everything else is re-placed.

      interface SchedulingTask {
        course: CourseInstance;
        classId: string;
        requiredSlot?: string;
      }

      let allTasks: SchedulingTask[] = [];
      const lockedSlots = new Set<string>();
      const finalScheduleByClass: Record<string, Schedule> = {};

      // Initialize finalScheduleByClass with Locked Items Only
      teacherCourses.forEach(course => {
        const classIds = Array.isArray(course.classId) ? course.classId : [course.classId || ''];
        classIds.forEach(cId => {
          if (!cId) return;
          if (!finalScheduleByClass[cId]) finalScheduleByClass[cId] = {};

          // Check existing schedule for locks
          // Note: This logic assumes if we re-run auto-schedule, we KEEP locked items from previous run
          // AND we must ensure we don't double-schedule them in `allTasks`
        });
      });

      // Scan existing schedules for locked items and populate finalSchedule
      Object.entries(teacherCurrentSchedules).forEach(([cId, schedule]) => {
        if (!finalScheduleByClass[cId]) finalScheduleByClass[cId] = {};

        Object.entries(schedule).forEach(([slot, instance]) => {
          if (instance?.locked) {
            finalScheduleByClass[cId][slot] = instance;
            lockedSlots.add(slot);
          }
        });
      });

      teacherCourses.forEach(course => {
        const classIds = Array.isArray(course.classId) ? course.classId : [course.classId || ''];
        classIds.forEach(cId => {
          if (!cId) return;

          const needed = course.hoursPerWeek || 1;
          let lockedCount = 0;
          const existing = teacherCurrentSchedules[cId] || {};
          Object.values(existing).forEach(inst => {
            if (inst && inst.id === course.id && inst.locked) lockedCount++;
          });

          const toSchedule = Math.max(0, needed - lockedCount);

          const courseLockedSlots = course.constraints?.lockedSlots || [];
          const unassignedLockedSlots = courseLockedSlots
            .map(ls => `${ls.day}-${parseInt(ls.periodId.replace('period-', ''))}`)
            .filter(slotId => !lockedSlots.has(slotId));

          if (course.isCombined !== false) {
            for (let i = 0; i < toSchedule; i++) {
              const requiredSlot = unassignedLockedSlots[i];
              const taskCourse = requiredSlot ? course : { ...course, constraints: { ...course.constraints, lockedSlots: [] } };
              allTasks.push({
                course: { ...taskCourse, instanceId: `${course.id}-auto-${Date.now()}-${i}`, className: getClassDisplayName(cId) },
                classId: cId,
                requiredSlot
              });
            }
          } else {
            const targetRooms = course.room && course.room.length > 0 && !course.room.includes('all')
              ? course.room
              : ['1'];

            targetRooms.forEach(room => {
              for (let i = 0; i < toSchedule; i++) {
                const requiredSlot = unassignedLockedSlots[i];
                const taskCourse = requiredSlot ? course : { ...course, constraints: { ...course.constraints, lockedSlots: [] } };
                allTasks.push({
                  course: { ...taskCourse, room: [room], instanceId: `${course.id}-auto-${room}-${Date.now()}-${i}`, className: getClassDisplayName(cId) },
                  classId: cId,
                  requiredSlot
                });
              }
            });
          }
        });
      });

      // 4. HEURISTIC SORTING: Most Allowable Slots First (MCF - variant)
      // Actually, standard is "Least Constrained Value" or "Most Constrained Variable".
      // We want to place the HARD parts first. Hard = Fewest valid slots.
      // So we calculate "Domain Size" for each task.

      const tasksWithDomainSize = allTasks.map(task => {
        // check how many slots are valid for this task
        let validCount = 0;
        // We do a "Dry Run" check against static constraints (we ignore dynamic placement of other tasks here for speed, or we could include?)
        // Including dynamic is hard because it changes.
        // Just check static constraints + master schedule conflicts.

        for (const day of Object.keys(DAYS)) {
          for (const periodSetting of periodSettings) {
            if (!periodSetting.isTeachingPeriod) continue;
            const p = parseInt(periodSetting.id.replace('period-', ''));
            const slot = `${day}-${p}`;

            if (lockedSlots.has(slot)) continue;
            if (task.requiredSlot && slot !== task.requiredSlot) continue;

            // Simulate check (FAST version)
            // 1. Teacher Constraints
            const { forbidden } = checkConstraints(task.course, slot, teacher, dynamicUnavailableSlots);
            if (forbidden) continue;

            // 2. Master Schedule (Teacher Busy Elsewhere?)
            const teacherBusy = (masterSchedule[slot] || []).some(o => o.teacherId === selectedTeacher);
            // Note: The masterSchedule includes OLD data of this teacher.
            // But we are rebuilding. So we should technically IGNORE our own old data in masterSchedule?
            // YES. We should ignore our own old entries.
            // Updated check:
            const teacherReallyBusy = (masterSchedule[slot] || []).some(o => o.teacherId === selectedTeacher && !Object.keys(teacherCurrentSchedules).includes(o.classId as string));
            // Wait, simply: We are rebuilding THIS teacher's schedule. So "Teacher Busy" corresponds to "Locked Slots" or "Placed Tasks".
            // We shouldn't check masterSchedule for THIS teacher, because we are clearing/overwriting it (except locks).
            // But we MUST check if OTHER teachers occupy the CLASS.

            // 3. Class Conflict (Other teachers teaching this class)
            const classOccupied = (masterSchedule[slot] || []).some(o => {
              if (o.teacherId === selectedTeacher) return false; // Ignore self
              const occClass = Array.isArray(o.classId) ? o.classId : [o.classId];
              return occClass.includes(task.classId);
            });

            if (classOccupied) continue;

            validCount++;
          }
        }
        return { ...task, domainSize: validCount };
      });

      // Sort: Smallest Domain First (Hardest tasks first)
      tasksWithDomainSize.sort((a, b) => a.domainSize - b.domainSize);


      // 5. Placement Loop with Distribution Logic
      const newTeacherScheduleForTracking: Record<string, boolean> = {}; // slot -> true
      lockedSlots.forEach(s => newTeacherScheduleForTracking[s] = true);

      const teacherPeriodsPerDay: Record<string, number> = {};
      Object.keys(DAYS).forEach(d => teacherPeriodsPerDay[d] = 0);

      // Initialize workload from locked slots
      lockedSlots.forEach(s => {
        const [d] = s.split('-');
        teacherPeriodsPerDay[d] = (teacherPeriodsPerDay[d] || 0) + 1;
      });

      let failCount = 0;

      for (const task of tasksWithDomainSize) {
        let bestSlot = null;
        let bestScore = -Infinity;

        // Find all valid slots and score them
        for (const day of Object.keys(DAYS)) {
          for (const periodSetting of periodSettings) {
            if (!periodSetting.isTeachingPeriod) continue;
            const p = parseInt(periodSetting.id.replace('period-', ''));
            const slotId = `${day}-${p}`;

            if (newTeacherScheduleForTracking[slotId]) continue; // Busy
            if (task.requiredSlot && slotId !== task.requiredSlot) continue;

            // Constraints Check
            const { forbidden } = checkConstraints(task.course, slotId, teacher, dynamicUnavailableSlots);
            if (forbidden) continue;

            // External Conflict Check
            const classOccupied = (masterSchedule[slotId] || []).some(o => {
              if (o.teacherId === selectedTeacher) return false;
              const occClass = Array.isArray(o.classId) ? o.classId : [o.classId];
              return occClass.includes(task.classId);
            });
            if (classOccupied) continue;

            // --- SCORING LOGIC (Matching Global Scheduler) ---
            let score = 50;

            // 0. Subject Category Categories (BBL)
            const getSubjectCategoryRaw = (title: string): 'ACADEMIC' | 'ACTIVITY' | 'GENERAL' => {
              const lowerTitle = title.toLowerCase();
              const academicKeywords = ['คณิต', 'วิทย์', 'วิทยาศาสตร์', 'ฟิสิกส์', 'เคมี', 'ชีวะ', 'ชีววิทยา', 'ไทย', 'ภาษาไทย', 'อังกฤษ', 'สังคม', 'ประวัติ', 'ภูมิศาสตร์', 'ศาสนา', 'math', 'science', 'physics', 'chem', 'bio', 'eng'];
              const activityKeywords = ['พละ', 'สุขศึกษา', 'ศิลปะ', 'ดนตรี', 'นาฏศิลป์', 'การงาน', 'อาชีพ', 'แนะแนว', 'ลูกเสือ', 'เนตรนารี', 'ยุวกาชาด', 'ชุมนุม', 'pe', 'art', 'music', 'guidance', 'scout', 'club'];
              if (academicKeywords.some(k => lowerTitle.includes(k))) return 'ACADEMIC';
              if (activityKeywords.some(k => lowerTitle.includes(k))) return 'ACTIVITY';
              return 'GENERAL';
            };

            const category = getSubjectCategoryRaw(task.course.title);
            const isMorning = p <= 4;

            if (category === 'ACADEMIC') {
              if (isMorning) score += 40; // High preference for morning
              else score -= 30;
            } else if (category === 'ACTIVITY') {
              if (!isMorning) score += 40; // High preference for afternoon
              else score -= 20;
            }

            // 1. Distribution: Penalize overloaded days
            const currentLoad = teacherPeriodsPerDay[day] || 0;
            const avgLoad = 20 / 5; // Approx baseline (or calculated dynamically)
            // Use dynamic if possible, but localized `allTasks.length / 5` is better?
            // Let's use simpler relative check:
            const dynamicAvg = allTasks.length / 5;
            if (currentLoad > dynamicAvg + 1) score -= 20;
            else if (currentLoad < dynamicAvg) score += 10;

            // 2. Gap & Consecutive Check (Clustering)
            let consecutiveCount = 1;
            let hasAdjacent = false;
            let createsGap = false;

            // Check Left
            for (let i = p - 1; i >= 1; i--) {
              if (newTeacherScheduleForTracking[`${day}-${i}`]) {
                if (i === p - 1) hasAdjacent = true;
                consecutiveCount++;
              } else {
                if (p - i > 1) createsGap = true;
                break;
              }
            }
            // Check Right
            for (let i = p + 1; i <= 8; i++) {
              if (newTeacherScheduleForTracking[`${day}-${i}`]) {
                if (i === p + 1) hasAdjacent = true;
                consecutiveCount++;
              } else break;
            }

            if (hasAdjacent) score += 15; // Encourages clustering
            if (createsGap) score -= 5;   // Slight penalty for gap

            if (consecutiveCount > 3) {
              // Hard penalty for >3 consecutive (Matches Global)
              score -= 1000;
            }

            // 3. Max Gap Check
            const existingSlots = [];
            for (let i = 1; i <= 8; i++) {
              if (newTeacherScheduleForTracking[`${day}-${i}`]) existingSlots.push(i);
            }
            existingSlots.push(p);
            existingSlots.sort((a, b) => a - b);

            let maxGap = 0;
            for (let i = 0; i < existingSlots.length - 1; i++) {
              const g = existingSlots[i + 1] - existingSlots[i] - 1;
              if (g > maxGap) maxGap = g;
            }

            if (maxGap > 3) score -= 50;

            // 4. Subject Spacing (New Improvement)
            // Penalty if the same course ID is already in this day for the target class
            const existingInDayCount = Object.entries(finalScheduleByClass[task.classId] || {})
              .filter(([s, inst]) => s.startsWith(`${day}-`) && inst && inst.id === task.course.id).length;
            if (existingInDayCount > 0) {
              score -= 60; // Strong penalty for stacking same subject in one day
            }

            // 5. Random Factor
            score += Math.random() * 20;

            if (score > bestScore) {
              bestScore = score;
              bestSlot = slotId;
            }
          }
        }

        if (bestSlot && bestScore > -200) { // Threshold to avoid really bad slots
          const [d] = bestSlot.split('-');
          if (!finalScheduleByClass[task.classId]) finalScheduleByClass[task.classId] = {};
          finalScheduleByClass[task.classId][bestSlot] = task.course;
          newTeacherScheduleForTracking[bestSlot] = true;
          teacherPeriodsPerDay[d]++;
        } else {
          failCount++;
        }
      }

      // 6. Write to DB
      const batch = writeBatch(db);

      // Get list of ALL classes we touched or need to clear
      const allClasses = new Set([...Object.keys(finalScheduleByClass), ...Object.keys(teacherCurrentSchedules)]);

      allClasses.forEach(cId => {
        const scheduleRef = doc(db, 'school-settings', schoolId!, 'schedules', `${selectedTeacher}_${cId}`);
        const scheduleData = finalScheduleByClass[cId] || {}; // If empty, it means we cleared it/calculated nothing
        batch.set(scheduleRef, {
          schedule: scheduleData,
          teacherId: selectedTeacher,
          classId: cId
        });
      });

      await batch.commit();

      // Refresh
      await fetchData(schoolId);
      await loadTeacherMasterSchedule();

      setSchedulingMetrics({
        totalTasks: allTasks.length,
        placedTasks: allTasks.length - failCount,
        unplacedTasks: failCount,
        processingTimeMs: 0,
        averageConsecutivePeriods: 0,
        averageGapsPerDay: 0,
        bblComplianceRate: 0
      });

      MySwal.fire({
        icon: undefined,
        title: undefined,
        html: `
          <div class="text-center font-sans px-2">
            
            <h2 class="text-2xl font-bold bg-gradient-to-r from-emerald-600 to-teal-500 bg-clip-text text-transparent mb-2 animate-pulse">
              ${failCount === 0 ? 'จัดตารางสำเร็จ! 🎉' : 'จัดตารางสำเร็จพร้อมข้อจำกัด ⚠️'}
            </h2>
            <p class="text-gray-500 dark:text-gray-400 mb-6 text-sm">
              ${failCount === 0
            ? 'ระบบได้จัดตารางสอนให้ครูท่านนี้เรียบร้อยแล้ว'
            : `ไม่สามารถลงวิชาได้ ${failCount} รายการเนื่องจากเงื่อนไขแน่นเกินไป`}
            </p>

            <!-- Stats Grid -->
            <div class="grid grid-cols-3 gap-3 mb-6">
              <div class="bg-blue-50 dark:bg-blue-900/20 p-3 rounded-2xl border border-blue-100 dark:border-blue-800">
                <p class="text-xs text-blue-600 dark:text-blue-400 font-semibold uppercase tracking-wider mb-1">วิชาทั้งหมด</p>
                <p class="text-2xl font-bold text-gray-800 dark:text-white">${allTasks.length}</p>
              </div>
              <div class="bg-emerald-50 dark:bg-emerald-900/20 p-3 rounded-2xl border border-emerald-100 dark:border-emerald-800">
                <p class="text-xs text-emerald-600 dark:text-emerald-400 font-semibold uppercase tracking-wider mb-1">สำเร็จ</p>
                <p class="text-2xl font-bold text-gray-800 dark:text-white">${allTasks.length - failCount}</p>
              </div>
              <div class="${failCount > 0 ? 'bg-red-50 dark:bg-red-900/20 border-red-100 dark:border-red-800' : 'bg-gray-50 dark:bg-gray-800/30 border-gray-100 dark:border-gray-700'} p-3 rounded-2xl border">
                <p class="text-xs ${failCount > 0 ? 'text-red-600 dark:text-red-400' : 'text-gray-500 dark:text-gray-400'} font-semibold uppercase tracking-wider mb-1">ไม่ลงตัว</p>
                <p class="text-2xl font-bold text-gray-800 dark:text-white">${failCount}</p>
              </div>
            </div>

          </div>
        `,
        showConfirmButton: true,
        confirmButtonText: 'รับทราบ',
        confirmButtonColor: '#10b981', // Emerald-500
        width: '500px',
        padding: '2rem',
        customClass: {
          popup: 'rounded-3xl shadow-2xl border border-gray-100 dark:border-gray-800',
          confirmButton: 'rounded-xl px-6 py-2.5 font-bold shadow-lg shadow-emerald-500/30'
        },
        backdrop: `
          rgba(0,0,0,0.4)
          url("data:image/svg+xml,%3Csvg width='20' height='20' viewBox='0 0 20 20' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='%239C92AC' fill-opacity='0.05' fill-rule='evenodd'%3E%3Ccircle cx='3' cy='3' r='3'/%3E%3Ccircle cx='13' cy='13' r='3'/%3E%3C/g%3E%3C/svg%3E") 
        `
      });

    } catch (error) {
      console.error("Auto-scheduling failed: ", error);
      MySwal.fire({ icon: 'error', title: 'เกิดข้อผิดพลาด', text: 'ไม่สามารถจัดตารางอัตโนมัติได้' });
    } finally {
      setIsAutoScheduling(false);
    }
  };

  // ============================================
  // SMART MANUAL EDITING HELPERS
  // ============================================

  /**
   * Find all valid slots for a specific course across the week
   * Checks teacher constraints, course constraints, and standard conflicts
   */
  const findValidSlots = (
    course: CourseInstance,
    currentTeacherId: string,
    currentSchedule: Schedule,
    masterSchedule: Record<string, { teacherId: string; classId: string | string[]; course: Course | null }[]>,
    teacherData: Teacher
  ): string[] => {
    const validSlots: string[] = [];
    const days = ['mon', 'tue', 'wed', 'thu', 'fri'];

    for (const day of days) {
      for (let period = 1; period <= 8; period++) {
        const slotId = `${day}-${period}`;

        // Skip if already occupied in CURRENT schedule (unless it's the course itself)
        if (currentSchedule[slotId] && currentSchedule[slotId]?.instanceId !== course.instanceId) continue;

        // 1. Basic Constraints
        const { forbidden } = checkConstraints(course, slotId, teacherData, dynamicUnavailableSlots);
        if (forbidden) continue;

        // 2. Master Schedule Conflicts
        const occupancies = masterSchedule[slotId] || [];

        // 2.1 Teacher Conflict (Is this teacher busy elsewhere?)
        const teacherBusyElsewhere = occupancies.some(o =>
          o.teacherId === currentTeacherId &&
          o.course?.id !== course.id // Different course
        );
        if (teacherBusyElsewhere) continue;

        // 2.2 Class Conflict
        const targetClasses = Array.isArray(course.classId) ? course.classId : [course.classId || ''];
        let classConflict = false;

        for (const targetClass of targetClasses) {
          if (!targetClass) continue;

          for (const occ of occupancies) {
            if (occ.teacherId === currentTeacherId) continue; // Ignore self (handled above)

            const occClasses = Array.isArray(occ.classId) ? occ.classId : [occ.classId];
            if (occClasses.includes(targetClass)) {
              // Room Check
              const taskRooms = course.room && course.room.length > 0 ? course.room : ['all'];
              const occRooms = occ.course?.room && occ.course.room.length > 0 ? occ.course.room : ['all'];

              const isTaskAll = taskRooms.includes('all');
              const isOccAll = occRooms.includes('all');

              if (isTaskAll || isOccAll || taskRooms.some(r => occRooms.includes(r))) {
                classConflict = true;
                break;
              }
            }
          }
          if (classConflict) break;
        }

        if (classConflict) continue;

        // If passed all checks
        validSlots.push(slotId);
      }
    }
    return validSlots;
  };

  // ============================================
  // HELPER FUNCTIONS FOR SCHEDULING QUALITY
  // ============================================

  /**
   * Check if placing a course would exceed maximum consecutive periods for a teacher
   */
  const checkConsecutivePeriods = (
    teacherId: string,
    slotId: string,
    timetable: IndexedTimetable | Record<string, { teacherId: string; classId: string; room: string[]; courseId: string; taskId?: number }[]>,
    maxConsecutive: number = 4
  ): boolean => {
    const [day, period] = slotId.split('-');
    const periodNum = parseInt(period);

    let consecutiveCount = 1;

    // Count periods before
    for (let i = periodNum - 1; i >= 1; i--) {
      const prevSlot = `${day}-${i}`;
      const occupancies = timetable instanceof IndexedTimetable
        ? timetable.getSlotOccupancies(prevSlot)
        : (timetable[prevSlot] || []);
      if (occupancies.some(occ => occ.teacherId === teacherId)) {
        consecutiveCount++;
      } else break;
    }

    // Count periods after
    for (let i = periodNum + 1; i <= 8; i++) {
      const nextSlot = `${day}-${i}`;
      const occupancies = timetable instanceof IndexedTimetable
        ? timetable.getSlotOccupancies(nextSlot)
        : (timetable[nextSlot] || []);
      if (occupancies.some(occ => occ.teacherId === teacherId)) {
        consecutiveCount++;
      } else break;
    }

    return consecutiveCount <= maxConsecutive;
  };

  /**
   * Calculate gap penalty for a teacher on a specific day
   */
  const calculateGapPenalty = (
    teacherId: string,
    day: string,
    periodNum: number,
    timetable: IndexedTimetable | Record<string, { teacherId: string; classId: string; room: string[]; courseId: string; taskId?: number }[]>
  ): number => {
    // Find all periods where teacher is teaching on this day
    const teacherDaySchedule = [];

    for (let i = 1; i <= 8; i++) {
      const slot = `${day}-${i}`;
      const occupancies = timetable instanceof IndexedTimetable
        ? timetable.getSlotOccupancies(slot)
        : (timetable[slot] || []);

      if (occupancies.some(occ => occ.teacherId === teacherId)) {
        teacherDaySchedule.push(i);
      }
    }

    teacherDaySchedule.sort((a, b) => a - b);

    if (teacherDaySchedule.length === 0) return 0;

    // Count gaps
    let gaps = 0;
    for (let i = 0; i < teacherDaySchedule.length - 1; i++) {
      const gap = teacherDaySchedule[i + 1] - teacherDaySchedule[i] - 1;
      if (gap > 0) gaps += gap;
    }

    return gaps * 10; // Penalty for each gap
  };

  /**
   * Calculate average consecutive periods for all teachers
   */
  const calculateAverageConsecutivePeriods = (
    timetable: Record<string, { teacherId: string; classId: string; room: string[]; courseId: string; taskId?: number }[]>
  ): number => {
    const teacherStats: Record<string, number[]> = {};

    // Group by teacher and day
    Object.entries(timetable).forEach(([slot, occupancies]) => {
      const [day] = slot.split('-');
      occupancies.forEach(occ => {
        const key = `${occ.teacherId}_${day}`;
        if (!teacherStats[key]) teacherStats[key] = [];
        teacherStats[key].push(parseInt(slot.split('-')[1]));
      });
    });

    // Calculate max consecutive for each teacher-day
    const consecutiveCounts: number[] = [];
    Object.values(teacherStats).forEach(periods => {
      periods.sort((a, b) => a - b);
      let maxConsecutive = 1;
      let currentConsecutive = 1;

      for (let i = 1; i < periods.length; i++) {
        if (periods[i] === periods[i - 1] + 1) {
          currentConsecutive++;
          maxConsecutive = Math.max(maxConsecutive, currentConsecutive);
        } else {
          currentConsecutive = 1;
        }
      }
      consecutiveCounts.push(maxConsecutive);
    });

    return consecutiveCounts.length > 0
      ? consecutiveCounts.reduce((a, b) => a + b, 0) / consecutiveCounts.length
      : 0;
  };

  /**
   * Calculate average gaps per day for all teachers
   */
  const calculateAverageGapsPerDay = (
    timetable: Record<string, { teacherId: string; classId: string; room: string[]; courseId: string; taskId?: number }[]>
  ): number => {
    const teacherDayGaps: Record<string, number> = {};

    // Group by teacher and day
    const teacherDaySchedules: Record<string, number[]> = {};
    Object.entries(timetable).forEach(([slot, occupancies]) => {
      const [day, period] = slot.split('-');
      occupancies.forEach(occ => {
        const key = `${occ.teacherId}_${day}`;
        if (!teacherDaySchedules[key]) teacherDaySchedules[key] = [];
        teacherDaySchedules[key].push(parseInt(period));
      });
    });

    // Calculate gaps for each teacher-day
    Object.entries(teacherDaySchedules).forEach(([key, periods]) => {
      periods.sort((a, b) => a - b);
      let gaps = 0;
      for (let i = 0; i < periods.length - 1; i++) {
        const gap = periods[i + 1] - periods[i] - 1;
        if (gap > 0) gaps += gap;
      }
      teacherDayGaps[key] = gaps;
    });

    const gapValues = Object.values(teacherDayGaps);
    return gapValues.length > 0
      ? gapValues.reduce((a, b) => a + b, 0) / gapValues.length
      : 0;
  };

  /**
   * Calculate BBL compliance rate (core subjects in morning periods 1-4)
   */
  const calculateBBLCompliance = (
    timetable: Record<string, { teacherId: string; classId: string; room: string[]; courseId: string; taskId?: number }[]>,
    allCoursesData: Course[]
  ): number => {
    const coreSubjects = [
      'ภาษาไทย',
      'คณิตศาสตร์',
      'วิทยาศาสตร์และเทคโนโลยี',
      'สังคมศึกษา ศาสนา และวัฒนธรรม'
    ];

    let totalCoreSlots = 0;
    let morningCoreSlots = 0;

    Object.entries(timetable).forEach(([slot, occupancies]) => {
      const [, period] = slot.split('-');
      const periodNum = parseInt(period);

      occupancies.forEach(occ => {
        const course = allCoursesData.find(c => c.id === occ.courseId);
        if (course && coreSubjects.includes(course.title)) {
          totalCoreSlots++;
          if (periodNum >= 1 && periodNum <= 4) {
            morningCoreSlots++;
          }
        }
      });
    });

    return totalCoreSlots > 0 ? (morningCoreSlots / totalCoreSlots) * 100 : 0;
  };

  const handleGenerateSchoolTimetable = async () => {
    if (!schoolId) {
      MySwal.fire({ icon: 'warning', title: 'ข้อมูลไม่ครบถ้วน', text: 'ไม่พบรหัสโรงเรียน ไม่สามารถสร้างตารางสอนได้' });
      return;
    }

    setIsAutoScheduling(true);

    // Show initial loading dialog with progress bar
    MySwal.fire({
      title: 'กำลังเตรียมข้อมูล...',
      html: `
        <div class="space-y-3">
          <div id="progress-message" class="text-sm text-gray-600">กำลังโหลดข้อมูลครูและรายวิชา...</div>
          <div class="w-full bg-gray-200 rounded-full h-2.5">
            <div id="progress-bar" class="bg-blue-600 h-2.5 rounded-full transition-all duration-300" style="width: 0%"></div>
          </div>
          <div id="progress-text" class="text-xs text-gray-500">0%</div>
        </div>
      `,
      allowOutsideClick: false,
      showConfirmButton: false,
      didOpen: () => {
        MySwal.showLoading();
      },
    });

    try {
      // Progress tracking variables
      const startTime = Date.now();
      let placedCount = 0;

      // Helper function to update progress
      const updateProgress = (percentage: number, message: string) => {
        const progressBar = document.getElementById('progress-bar');
        const progressText = document.getElementById('progress-text');
        const messageEl = document.getElementById('progress-message');

        if (progressBar) progressBar.style.width = `${percentage}%`;
        if (progressText) progressText.textContent = `${percentage}%`;
        if (messageEl) messageEl.textContent = message;
      };

      // 1. Fetch all necessary data
      updateProgress(5, 'กำลังโหลดข้อมูลรายวิชา...');
      const coursesCollectionRef = collection(db, 'school-settings', schoolId, 'courses');
      const coursesSnapshot = await getDocs(coursesCollectionRef);
      const allCoursesData = coursesSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Course));

      updateProgress(10, 'กำลังโหลดข้อมูลครู...');
      const teachersCollectionRef = collection(db, 'school-settings', schoolId, 'teachers');
      const teachersSnapshot = await getDocs(teachersCollectionRef);
      const allTeachersData = teachersSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Teacher));

      // Override current teacher's preferences with local state if selected
      if (selectedTeacher) {
        const currentTeacherIndex = allTeachersData.findIndex(t => t.id === selectedTeacher);
        if (currentTeacherIndex !== -1) {
          allTeachersData[currentTeacherIndex] = {
            ...allTeachersData[currentTeacherIndex],
            preferences: {
              ...allTeachersData[currentTeacherIndex].preferences,
              unavailableSlots: dynamicUnavailableSlots
            }
          };
        }
      }

      const teachersMap: Record<string, Teacher> = allTeachersData.reduce((acc, t) => ({ ...acc, [t.id]: t }), {});

      updateProgress(15, 'กำลังโหลดตารางเดิม...');
      // Load existing schedules to preserve locked courses
      const schedulesCollectionRef = collection(db, 'school-settings', schoolId, 'schedules');
      const existingSchedulesSnapshot = await getDocs(schedulesCollectionRef);
      const existingSchedulesMap: Record<string, Schedule> = {};
      const lockedCoursesMap: Record<string, Schedule> = {}; // Store locked courses per docId

      existingSchedulesSnapshot.forEach(doc => {
        const docId = doc.id;
        const scheduleData = doc.data().schedule as Schedule;
        existingSchedulesMap[docId] = scheduleData;

        // Extract locked courses
        const lockedSchedule: Schedule = {};
        for (const slotId in scheduleData) {
          if (scheduleData[slotId]?.locked) {
            lockedSchedule[slotId] = scheduleData[slotId];
          }
        }
        if (Object.keys(lockedSchedule).length > 0) {
          lockedCoursesMap[docId] = lockedSchedule;
        }
      });

      // Global Timetable to track occupancy
      // Key: slotId (e.g., "mon-1")
      // Value: Array of occupancies { teacherId, classId, room[], courseId }
      const schoolTimetable: Record<string, { teacherId: string; classId: string; room: string[]; courseId: string; taskId?: number }[]> = {};

      // Optimized timetable record for metrics (will be populated later)
      let schoolTimetableRecord: Record<string, { teacherId: string; classId: string; room: string[]; courseId: string; taskId?: number }[]> = {};

      // Performance tracking
      const performanceStats = {
        cacheHits: 0,
        slotsEvaluated: 0
      };

      // Populate timetable with locked courses first
      for (const docId in lockedCoursesMap) {
        const [teacherId, classId] = docId.split('_');
        for (const slotId in lockedCoursesMap[docId]) {
          const course = lockedCoursesMap[docId][slotId];
          if (course) {
            if (!schoolTimetable[slotId]) schoolTimetable[slotId] = [];
            schoolTimetable[slotId].push({
              teacherId,
              classId,
              room: course.room || ['all'],
              courseId: course.id
            });
          }
        }
      }

      const batchUpdates: Record<string, Schedule> = {}; // Key: teacherId_classId

      // Initialize batchUpdates with locked courses
      for (const docId in lockedCoursesMap) {
        batchUpdates[docId] = { ...lockedCoursesMap[docId] };
      }

      // CRITICAL FIX: Ensure all other existing schedules are cleared (set to empty) if they don't have locks
      // matches user expectation of "Reschedule All"
      for (const docId in existingSchedulesMap) {
        if (!batchUpdates[docId]) {
          batchUpdates[docId] = {};
        }
      }

      // 2. Create Scheduling Tasks
      interface SchedulingTask {
        course: Course;
        teacherId: string;
        targetClasses: string[];
        targetRooms: string[];
        instanceCount: number;
        originalCourseId: string;
        requiredSlot?: string;
      }

      const tasks: SchedulingTask[] = [];

      updateProgress(25, 'กำลังกรองรายวิชาตามเทอมและสร้างรายการงาน...');
      const coursesForSemester = allCoursesData.filter(c => !c.semester || c.semester === selectedSemester);

      coursesForSemester.forEach(course => {
        if ((!course.teacherId && (!course.teacherIds || course.teacherIds.length === 0)) || !course.classId) return;
        const classIds = Array.isArray(course.classId) ? course.classId : [course.classId];
        const rooms = course.room && course.room.length > 0 ? course.room : ['all'];

        // Count how many instances of this course are already LOCKED
        let lockedCount = 0;
        // lockedCoursesMap is Key: teacherId_classId -> Schedule
        // We need to scan all schedules for this course ID?
        // Or specific teacher/class?
        // Locked map is per-doc (teacher_class).
        // Iterate relevant schedule docs to count locks for THIS course.

        classIds.forEach(cId => {
          const docId = `${course.teacherId}_${cId}`;
          const lockedSchedule = lockedCoursesMap[docId];
          if (lockedSchedule) {
            Object.values(lockedSchedule).forEach(inst => {
              if (inst && inst.id === course.id) lockedCount++;
            });
          }
        });

        // For joint classes, lockedCount is tricky.
        // If it's a joint class (e.g. A and B), a lock in A implies a lock in B usually (if data integrity is good).
        // But simply, if we find a lock in A, that is "one instance" of the course. 
        // Note: Joint classes should be defined as "1 course doc" but "classId: [A, B]".
        // Schedules are separate: "T_A", "T_B".
        // If I lock "T_A at Mon-1" and "T_B at Mon-1", is that 1 locked instance or 2?
        // Logic: 1 Instance of the course covers ALL target classes.
        // So we should count unique time-slots locked?
        // Yes. If Mon-1 is locked for this course in ANY target class, that counts as 1.

        const lockedSlotsForThisCourse = new Set<string>();
        classIds.forEach(cId => {
          const docId = `${course.teacherId}_${cId}`;
          const lockedSchedule = lockedCoursesMap[docId];
          if (lockedSchedule) {
            Object.entries(lockedSchedule).forEach(([slot, inst]) => {
              if (inst && inst.id === course.id) {
                lockedSlotsForThisCourse.add(slot);
              }
            });
          }
        });

        const alreadyScheduledCount = lockedSlotsForThisCourse.size;
        const totalHours = course.hoursPerWeek || 1;
        const needed = Math.max(0, totalHours - alreadyScheduledCount);

        const courseLockedSlots = course.constraints?.lockedSlots || [];
        const unassignedLockedSlots = courseLockedSlots
          .map(ls => `${ls.day}-${parseInt(ls.periodId.replace('period-', ''))}`)
          .filter(slotId => !lockedSlotsForThisCourse.has(slotId));

        for (let i = 0; i < needed; i++) {
          tasks.push({
            course,
            teacherId: (course.teacherId || course.teacherIds?.[0] || 'unassigned'),
            targetClasses: classIds,
            targetRooms: rooms,
            instanceCount: i,
            originalCourseId: course.id,
            requiredSlot: unassignedLockedSlots[i]
          });
        }
      });

      // Helper for Subject Classification (Defined early for sorting)
      const getSubjectCategoryRaw = (title: string): number => {
        const lowerTitle = title.toLowerCase();
        const academicKeywords = ['คณิต', 'วิทย์', 'วิทยาศาสตร์', 'ฟิสิกส์', 'เคมี', 'ชีว', 'ไทย', 'อังกฤษ', 'สังคม', 'ประวัติ', 'ศาสนา', 'math', 'sci', 'phy', 'chem', 'bio', 'eng'];
        if (academicKeywords.some(k => lowerTitle.includes(k))) return 2; // Academic = Highest Priority
        return 1; // Others
      };

      // Sort tasks: Locked slots first, Joint classes, then Academic subjects, then by constraints
      tasks.sort((a, b) => {
        // 0. Locked slots -> ABSOLUTE PRIORITY
        const aHasLocks = a.course.constraints?.lockedSlots && a.course.constraints.lockedSlots.length > 0;
        const bHasLocks = b.course.constraints?.lockedSlots && b.course.constraints.lockedSlots.length > 0;
        if (aHasLocks && !bHasLocks) return -1;
        if (!aHasLocks && bHasLocks) return 1;

        // 1. Joint classes (more targets)
        if (a.targetClasses.length !== b.targetClasses.length) {
          return b.targetClasses.length - a.targetClasses.length;
        }

        // 2. Academic Subjects
        const catA = getSubjectCategoryRaw(a.course.title);
        const catB = getSubjectCategoryRaw(b.course.title);
        if (catA !== catB) return catB - catA;

        // 3. Specific rooms
        const aSpecific = a.targetRooms.includes('all') ? 0 : 1;
        const bSpecific = b.targetRooms.includes('all') ? 0 : 1;
        if (aSpecific !== bSpecific) return bSpecific - aSpecific;

        return 0;
      });

      const unplacedTasks: SchedulingTask[] = [];

      updateProgress(30, `กำลังจัดตารางสอน... (0/${tasks.length})`);

      // Pre-calculate all valid teaching slots
      const allTeachingSlots: { dayKey: string; periodSetting: PeriodSetting; slotId: string, periodNumber: number }[] = [];
      for (const dayKey of Object.keys(DAYS)) {
        for (const periodSetting of periodSettings) {
          if (periodSetting.isTeachingPeriod) {
            const periodNumber = parseInt(periodSetting.id.replace('period-', ''));
            allTeachingSlots.push({
              dayKey,
              periodSetting,
              slotId: `${dayKey}-${periodNumber}`,
              periodNumber
            });
          }
        }
      }

      // ============================================
      // PERFORMANCE OPTIMIZATION: Pre-compute Valid Slots Cache
      // ============================================
      updateProgress(25, 'กำลังคำนวณช่องว่างที่เป็นไปได้...');
      const validSlotsCache = new Map<SchedulingTask, Set<string>>();

      for (const task of tasks) {
        const validSlots = new Set<string>();
        const teacher = teachersMap[task.teacherId];

        for (const slotInfo of allTeachingSlots) {
          const { dayKey, periodSetting, slotId } = slotInfo;

          // 1. Required Slot Check (HARD)
          if (task.requiredSlot && slotId !== task.requiredSlot) {
            continue;
          }

          // FIX: Check if slot is already occupied by a LOCKED course (Global Constraint)
          if (schoolTimetable[slotId]?.some(occ => occ.teacherId === task.teacherId)) {
            continue;
          }

          // Quick constraint checks
          let forbidden = false;

          // Teacher constraints
          if (teacher?.preferences?.unavailableDays?.includes(dayKey) ||
            teacher?.preferences?.unavailableSlots?.includes(slotId)) {
            forbidden = true;
          }

          // Course constraints
          if (task.course.constraints?.disallowedDays?.includes(dayKey)) {
            forbidden = true;
          }

          // Special periods
          const specialPeriod = specialPeriods.find(sp =>
            sp.startTime === periodSetting.startTime &&
            sp.endTime === periodSetting.endTime &&
            (!sp.day || sp.day === 'all' || sp.day === dayKey)
          );
          if (specialPeriod) {
            forbidden = true;
          }

          if (!forbidden) {
            validSlots.add(slotId);
          }
        }

        validSlotsCache.set(task, validSlots);
      }

      // ============================================
      // OPTIMIZED TIMETABLE with Multi-Index Support
      // ============================================
      const indexedTimetable = new IndexedTimetable();
      schoolTimetableRecord = {}; // Reset for this run

      // Reset performance tracking
      performanceStats.cacheHits = 0;
      performanceStats.slotsEvaluated = 0;
      let tasksProcessed = 0;

      // ============================================
      // TASK PREPARATION: Sort by constraint (MCV Heuristic)
      // ============================================
      updateProgress(30, 'กำลังจัดเรียงงานตามความซับซ้อน...');

      // Most Constrained Variable: Place hardest tasks first
      tasks.sort((a, b) => {
        const aSlots = validSlotsCache.get(a)?.size || 0;
        const bSlots = validSlotsCache.get(b)?.size || 0;
        return aSlots - bSlots; // Fewer valid slots = higher priority
      });

      updateProgress(35, `กำลังจัดตาราง ${tasks.length} งาน...`);

      // BBL: Subject Classification Helper
      const getSubjectCategory = (title: string): 'ACADEMIC' | 'ACTIVITY' | 'GENERAL' => {
        const lowerTitle = title.toLowerCase();
        const academicKeywords = ['คณิต', 'วิทย์', 'วิทยาศาสตร์', 'ฟิสิกส์', 'เคมี', 'ชีวะ', 'ชีววิทยา', 'ไทย', 'ภาษาไทย', 'อังกฤษ', 'สังคม', 'ประวัติ', 'ภูมิศาสตร์', 'ศาสนา', 'math', 'science', 'physics', 'chem', 'bio', 'eng'];
        const activityKeywords = ['พละ', 'สุขศึกษา', 'ศิลปะ', 'ดนตรี', 'นาฏศิลป์', 'การงาน', 'อาชีพ', 'แนะแนว', 'ลูกเสือ', 'เนตรนารี', 'ยุวกาชาด', 'ชุมนุม', 'pe', 'art', 'music', 'guidance', 'scout', 'club'];

        if (academicKeywords.some(k => lowerTitle.includes(k))) return 'ACADEMIC';
        if (activityKeywords.some(k => lowerTitle.includes(k))) return 'ACTIVITY';
        return 'GENERAL';
      };

      // BBL: Weighted Shuffling based on Subject Category + Quality Checks + Distribution Logic
      const getWeightedSlots = (
        task: SchedulingTask,
        slots: typeof allTeachingSlots,
        validSlots: Set<string>,
        ignorePrefs: boolean = false
      ) => {
        const category = getSubjectCategory(task.course.title);

        // Filter to only valid slots
        const availableSlots = slots.filter(slot => validSlots.has(slot.slotId));

        // Helper to count periods per day for this teacher
        const periodsPerDay: Record<string, number> = {};
        Object.keys(DAYS).forEach(d => periodsPerDay[d] = 0);

        // Scan current teacher schedule to populate periodsPerDay
        // This is expensive if done every time. We can optimize by passing it or only checking relevant days.
        // For 500 tasks, this is acceptable.
        for (const slotId in schoolTimetable) {
          const [d] = slotId.split('-');
          if (schoolTimetable[slotId]?.some(o => o.teacherId === task.teacherId)) {
            periodsPerDay[d] = (periodsPerDay[d] || 0) + 1;
          }
        }

        // Find average load
        const totalPeriods = Object.values(periodsPerDay).reduce((a, b) => a + b, 0);
        const averageLoad = totalPeriods / 5;

        // Calculate score for each slot
        const scoredSlots = availableSlots.map(slot => {
          let score = 50; // Base score
          const { dayKey, periodNumber, slotId } = slot;

          // Morning periods (1-4) vs Afternoon (5+)
          const isMorning = periodNumber <= 4;

          if (!ignorePrefs) {
            if (category === 'ACADEMIC') {
              if (isMorning) score += 40; // High preference for morning
              else score -= 30; // Avoid afternoon if possible
            } else if (category === 'ACTIVITY') {
              if (!isMorning) score += 40; // High preference for afternoon
              else score -= 20;
            }
          }

          // --- 1. Workload Balancing (Distribution) ---
          // Penalize days that are already above average or full
          const currentLoad = periodsPerDay[dayKey] || 0;
          if (currentLoad > averageLoad + 1) {
            score -= 20; // Penalize overloaded days
          } else if (currentLoad < averageLoad) {
            score += 10; // Encourage underloaded days
          }

          // --- 2. Gap & Consecutive Optimization ---
          // We check the "Neighborhood" of this slot for this teacher
          // To see if it helps fill a gap or create a nice cluster
          let hasAdjacent = false;
          let createsGap = false;
          let consecutiveCount = 1; // Self

          // Check Left
          for (let i = periodNumber - 1; i >= 1; i--) {
            const checkSlot = `${dayKey}-${i}`;
            const isOccupied = schoolTimetable[checkSlot]?.some(o => o.teacherId === task.teacherId);
            if (isOccupied) {
              if (i === periodNumber - 1) hasAdjacent = true;
              consecutiveCount++;
            } else {
              // Empty slot found
              if (periodNumber - i > 1) createsGap = true; // Gap of size 1+
              break; // Stop counting consecutive
            }
          }

          // Check Right
          for (let i = periodNumber + 1; i <= 8; i++) {
            const checkSlot = `${dayKey}-${i}`;
            const isOccupied = schoolTimetable[checkSlot]?.some(o => o.teacherId === task.teacherId);
            if (isOccupied) {
              if (i === periodNumber + 1) hasAdjacent = true;
              consecutiveCount++;
            } else {
              if (i - periodNumber > 1) createsGap = true;
              break;
            }
          }

          // Heuristic: Prefer loose clusters (not isolated, not too tight)
          if (hasAdjacent) score += 15; // Like clustering
          if (createsGap) score -= 5;   // Dislike small gaps (1-2 periods) usually? 
          // Actually user said: "Spread out" (กระจาย) but "Don't be empty confirmed > 3" (Max Gap 3)

          // --- 3. Strict Max Consecutive Teaching Check (Soft Penalty here) ---
          if (consecutiveCount > 3) {
            score -= 1000; // Strong penalty! Avoid > 3 periods in a row
          }

          // --- 4. Max Gap Check (Soft Penalty) ---
          // If placing here creates a distance > 3 from nearest neighbor?
          // Hard to calculate exact gap without full day context, but if we are placing 'far' from others, score down.
          const daySlots = [];
          for (let i = 1; i <= 8; i++) {
            if (i === periodNumber) { daySlots.push(i); continue; }
            const s = `${dayKey}-${i}`;
            if (schoolTimetable[s]?.some(o => o.teacherId === task.teacherId)) daySlots.push(i);
          }
          daySlots.sort((a, b) => a - b);

          // Check gaps in this hypothetical arrangement
          let maxGap = 0;
          for (let i = 0; i < daySlots.length - 1; i++) {
            const g = daySlots[i + 1] - daySlots[i] - 1;
            if (g > maxGap) maxGap = g;
          }

          if (maxGap > 3) {
            score -= 50; // Penalize large gaps heavily
          }

          // --- 5. Subject Spacing (New Improvement) ---
          // Penalty if the same subject is already taught to this class on this day
          let subjectInDayCount = 0;
          for (let i = 1; i <= 8; i++) {
            const checkSlotId = `${dayKey}-${i}`;
            const occupancies = schoolTimetable[checkSlotId] || [];
            if (occupancies.some(o => o.courseId === task.course.id && task.targetClasses.includes(o.classId))) {
              subjectInDayCount++;
            }
          }
          if (subjectInDayCount > 0) {
            score -= 70; // High penalty to ensure subjects are spread across the week
          }

          // Random factor to prevent deterministic gridlock
          score += Math.random() * 20;

          return { slot, score };
        });

        // Sort by score descending
        scoredSlots.sort((a, b) => b.score - a.score);

        return scoredSlots.map(s => s.slot);
      };

      const tryPlaceTask = (task: SchedulingTask, ignorePrefs: boolean) => {
        const teacher = teachersMap[task.teacherId];
        // Re-calculate valid slots if ignoring prefs (since cache was strict)
        // Actually cache was built with STRICT prefs.
        // If ignorePrefs is true, we must NOT use cache filtering for Teacher Prefs.

        let potentialSlots = [];

        if (!ignorePrefs) {
          const cached = validSlotsCache.get(task);
          potentialSlots = getWeightedSlots(task, allTeachingSlots, cached || new Set(), false);
        } else {
          // Relaxed Mode: Iterate all slots and check only HARD constraints
          // For relaxed mode, we still want to use weighted logic to prefer good slots!
          // So we build a "Valid Set" of ALL hard-valid slots, then use getWeightedSlots.

          const validHardSlots = new Set<string>();
          allTeachingSlots.forEach(slotInfo => {
            const { dayKey, periodSetting, slotId } = slotInfo;

            // 0. Required Slot Check (HARD)
            if (task.requiredSlot && slotId !== task.requiredSlot) return;

            // 1. Global Lock Check
            if (schoolTimetable[slotId]?.some(occ => occ.teacherId === task.teacherId)) return;
            // 2. Course Constraints
            if (task.course.constraints?.disallowedDays?.includes(dayKey)) return;
            // 3. Special Period
            const specialPeriod = specialPeriods.find(sp =>
              sp.startTime === periodSetting.startTime &&
              sp.endTime === periodSetting.endTime &&
              (!sp.day || sp.day === 'all' || sp.day === dayKey)
            );
            if (specialPeriod) return;

            validHardSlots.add(slotId);
          });

          potentialSlots = getWeightedSlots(task, allTeachingSlots, validHardSlots, true);
        }

        for (const slot of potentialSlots) {
          const slotId = slot.slotId;

          // 1. Teacher Busy Check (In-Flight) - Redundant if getWeightedSlots handles it via schoolTimetable check?
          // No, getWeightedSlots checks LOAD, but not specific slot occupancy in the 'availableSlots' filter?
          // 'availableSlots' comes from 'allTeachingSlots' filtered by 'validSlots' (cache).
          // Cache does NOT check schoolTimetable dynamic updates.
          // So we MUST check here.
          const occupancies = schoolTimetable[slotId] || [];
          if (occupancies.some(o => o.teacherId === task.teacherId)) continue;

          // **CRITICAL**: Final Consecutive/Gap Check (Hard Constraint?)
          // If score was low, we might still try it. Should we enforce HARD limit > 3?
          // User said "Should not match > 3". Let's try to enforce it if possible.
          // Check Consecutive
          let consecutiveCount = 1;
          const [dayKey, pStr] = slotId.split('-');
          const periodNumber = parseInt(pStr);

          // Check Left
          for (let i = periodNumber - 1; i >= 1; i--) {
            if (schoolTimetable[`${dayKey}-${i}`]?.some(o => o.teacherId === task.teacherId)) consecutiveCount++;
            else break;
          }
          // Check Right
          for (let i = periodNumber + 1; i <= 8; i++) {
            if (schoolTimetable[`${dayKey}-${i}`]?.some(o => o.teacherId === task.teacherId)) consecutiveCount++;
            else break;
          }

          if (consecutiveCount > 4) { // Allow max 4? User said "ไม่ควรว่างติดกันเกิน 3" (Gap). But implicitly teaching >4 is bad too. Let's stick to 4 max teaching.
            continue; // Skip this slot
          }

          // 2. Class Busy Check
          let classBusy = false;
          for (const targetClass of task.targetClasses) {
            if (occupancies.some(o => {
              if (o.teacherId === task.teacherId) return false;
              const occClasses = Array.isArray(o.classId) ? o.classId : [o.classId];
              return occClasses.includes(targetClass); // Simple intersection
            })) {
              classBusy = true;
              break;
            }
          }
          if (classBusy) continue;

          // 3. Room Check
          let roomBusy = false;
          const requestedRooms = task.targetRooms.filter(r => r && r.toLowerCase() !== 'all');
          if (requestedRooms.length > 0) {
            for (const occ of occupancies) {
              const occRooms = (occ.room || []).filter(r => r && r.toLowerCase() !== 'all');
              if (requestedRooms.some(r => occRooms.includes(r))) {
                roomBusy = true;
                break;
              }
            }
          }
          if (roomBusy) continue;

          // Registered Occupancy
          const occupancy = {
            teacherId: task.teacherId,
            classId: task.targetClasses[0],
            room: task.targetRooms,
            courseId: task.course.id,
            taskId: tasks.indexOf(task) // Track task index for repair/swap logic
          };

          if (!schoolTimetable[slotId]) schoolTimetable[slotId] = [];
          schoolTimetable[slotId].push(occupancy);

          // Populate schoolTimetableRecord for metrics
          if (!schoolTimetableRecord[slotId]) schoolTimetableRecord[slotId] = [];
          schoolTimetableRecord[slotId].push(occupancy);

          // Add to Batch
          task.targetClasses.forEach(cId => {
            const docId = `${task.teacherId}_${cId}`;
            if (!batchUpdates[docId]) batchUpdates[docId] = {};

            const instanceCode = `${task.course.id}-${slotId}-${cId}`;
            batchUpdates[docId][slotId] = {
              ...task.course,
              instanceId: instanceCode,
              // Ensure optional fields are handled if needed, 
              // but CourseInstance extends Course so spread is mostly fine.
              // Just need instanceId.
              // Note: The UI might expect 'room' as array? task.course has 'room'.
            } as any; // Cast to avoid strict type checks if Course vs CourseInstance has minor mismatches
          });

          return true;
        }
        return false;
      };

      // PASS 1: Strict Placement
      for (const task of tasks) {
        if (tryPlaceTask(task, false)) {
          placedCount++;
        } else {
          unplacedTasks.push(task);
        }

        // Update progress occasionally
        tasksProcessed++;
        if (tasksProcessed % 50 === 0) updateProgress(35 + (tasksProcessed / tasks.length) * 10, `กำลังจัดตาราง... (${tasksProcessed}/${tasks.length})`);
      }

      // PASS 2: Relaxed Placement (Retry Unplaced)
      if (unplacedTasks.length > 0) {
        updateProgress(45, `กำลังพยายามจัด ${unplacedTasks.length} วิชาที่เหลือ (โหมดผ่อนปรน)...`);
        const retryList = [...unplacedTasks];
        unplacedTasks.length = 0; // Clear

        for (const task of retryList) {
          if (tryPlaceTask(task, true)) { // Ignore prefs
            placedCount++;
          } else {
            unplacedTasks.push(task);
          }
        }
      }

      // PASS 3: Limited Backtracking / Swap Repair (New Improvement)
      if (unplacedTasks.length > 0) {
        updateProgress(60, `พยายามแก้ไขจุดชนกันของวิชาที่เหลือ (${unplacedTasks.length} วิชา)...`);
        const repairList = [...unplacedTasks];
        unplacedTasks.length = 0;

        for (const task of repairList) {
          let repaired = false;
          // Look for a slot that has ONLY ONE blocking task, and try to move that blocker
          const teacher = teachersMap[task.teacherId];
          const validHardSlots = new Set<string>();
          allTeachingSlots.forEach(s => validHardSlots.add(s.slotId)); // Check all teaching slots

          const potentialSlots = getWeightedSlots(task, allTeachingSlots, validHardSlots, true);

          for (const slot of potentialSlots.slice(0, 15)) { // Check top 15 candidate slots
            const slotId = slot.slotId;
            const currentOccupancies = schoolTimetable[slotId] || [];

            // Find tasks blocking this one
            const blockers = currentOccupancies.filter(occ => {
              if (occ.teacherId === task.teacherId) return true; // Teacher Busy
              const occClasses = Array.isArray(occ.classId) ? occ.classId : [occ.classId];
              return task.targetClasses.some(cId => occClasses.includes(cId)); // Class Busy
            });

            // If exactly one blocker and it's not from a locked course
            if (blockers.length === 1) {
              const blockerOcc = blockers[0];
              const blockerTask = tasks[blockerOcc.taskId as number];

              if (blockerTask && !blockerTask.course.constraints?.lockedSlots?.length) {
                // Try to move the blocker to a DIFFERENT slot (one that isn't this slotId)
                const blockerTeacher = teachersMap[blockerTask.teacherId];
                const blockerValidSlots = validSlotsCache.get(blockerTask) || new Set<string>();

                const blockerMoveCandidates = getWeightedSlots(blockerTask, allTeachingSlots, blockerValidSlots, true)
                  .filter(s => s.slotId !== slotId);

                for (const moveSlot of blockerMoveCandidates.slice(0, 5)) {
                  const moveSlotId = moveSlot.slotId;

                  // Check if moveSlot is free for blocker
                  const moveSlotOccs = schoolTimetable[moveSlotId] || [];
                  const isMoveSlotFree = !moveSlotOccs.some(o =>
                    o.teacherId === blockerTask.teacherId ||
                    (Array.isArray(o.classId) ? o.classId : [o.classId]).some(c => blockerTask.targetClasses.includes(c as string))
                  );

                  if (isMoveSlotFree) {
                    // PERFORM SWAP/REPAIR
                    // 1. Remove blocker from current slot
                    schoolTimetable[slotId] = schoolTimetable[slotId].filter(o => o !== blockerOcc);

                    // 2. Clear blocker from batchUpdates
                    blockerTask.targetClasses.forEach(cId => {
                      const bDocId = `${blockerTask.teacherId}_${cId}`;
                      if (batchUpdates[bDocId]) delete batchUpdates[bDocId][slotId];
                    });

                    // 3. Place blocker in NEW slot
                    const newBlockerOcc = { ...blockerOcc };
                    if (!schoolTimetable[moveSlotId]) schoolTimetable[moveSlotId] = [];
                    schoolTimetable[moveSlotId].push(newBlockerOcc);
                    blockerTask.targetClasses.forEach(cId => {
                      const bDocId = `${blockerTask.teacherId}_${cId}`;
                      if (!batchUpdates[bDocId]) batchUpdates[bDocId] = {};
                      batchUpdates[bDocId][moveSlotId] = { ...blockerTask.course, instanceId: `${blockerTask.course.id}-${moveSlotId}` } as any;
                    });

                    // 4. Place CURRENT task in the freed slot
                    if (tryPlaceTask(task, true)) {
                      placedCount++;
                      repaired = true;
                      break;
                    }
                  }
                }
              }
            }
            if (repaired) break;
          }

          if (!repaired) {
            unplacedTasks.push(task);
          }
        }
      }

      // End of Placement Phases

      // Update progress before saving
      updateProgress(80, 'กำลังเตรียมบันทึกข้อมูล...');

      updateProgress(85, 'กำลังบันทึกข้อมูล...');

      // 4. Batch Commit with 500-operation limit
      const docIds = Object.keys(batchUpdates);
      const batchSize = 500;
      const numBatches = Math.ceil(docIds.length / batchSize);

      for (let i = 0; i < numBatches; i++) {
        const startIdx = i * batchSize;
        const endIdx = Math.min(startIdx + batchSize, docIds.length);
        const batchDocIds = docIds.slice(startIdx, endIdx);

        const batch = writeBatch(db);
        for (const docId of batchDocIds) {
          const [tId, cId] = docId.split('_');
          batch.set(doc(db, 'school-settings', schoolId!, 'schedules', docId), {
            schedule: batchUpdates[docId],
            teacherId: tId,
            classId: cId,
            totalPeriods: Object.values(batchUpdates[docId]).filter(Boolean).length,
          });
        }

        await batch.commit();

        // Update progress during batch commits
        const batchProgress = 85 + Math.round(((i + 1) / numBatches) * 10); // 85-95%
        updateProgress(batchProgress, `กำลังบันทึกข้อมูล... (${i + 1}/${numBatches} ชุด)`);
      }

      updateProgress(100, 'เสร็จสิ้น!');

      // ============================================
      // CALCULATE SCHEDULING METRICS
      // ============================================
      const endTime = Date.now();
      const processingTimeMs = endTime - startTime;

      const metrics: SchedulingMetrics = {
        totalTasks: tasks.length,
        placedTasks: placedCount,
        unplacedTasks: unplacedTasks.length,
        processingTimeMs,
        averageConsecutivePeriods: calculateAverageConsecutivePeriods(schoolTimetableRecord),
        averageGapsPerDay: calculateAverageGapsPerDay(schoolTimetableRecord),
        bblComplianceRate: calculateBBLCompliance(schoolTimetableRecord, allCoursesData)
      };

      setSchedulingMetrics(metrics);

      // Performance stats
      console.log('🚀 Performance Stats:', {
        ...performanceStats,
        processingTimeMs,
        tasksPerSecond: (tasks.length / (processingTimeMs / 1000)).toFixed(2)
      });

      // Save metrics to Firestore
      try {
        await setDoc(
          doc(db, 'school-settings', schoolId, 'metrics', 'latest_scheduling'),
          {
            ...metrics,
            timestamp: new Date(),
            schoolType: schoolSettings.schoolType,
            teacherCount: allTeachersData.length
          }
        );
      } catch (metricsError) {
        console.warn('Failed to save metrics:', metricsError);
      }

      MySwal.fire({
        icon: undefined, // Disable default icon to use custom layout
        title: undefined,
        html: `
          <div class="text-center font-sans px-2">
            
            <div class="mb-5">
              <div class="w-20 h-20 bg-emerald-100 text-emerald-500 rounded-full flex items-center justify-center mx-auto mb-4 animate-bounce-slow">
                <svg xmlns="http://www.w3.org/2000/svg" class="h-10 w-10" viewBox="0 0 20 20" fill="currentColor">
                  <path fill-rule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clip-rule="evenodd" />
                </svg>
              </div>
              <h2 class="text-2xl font-extrabold text-gray-900 dark:text-white mb-1">สร้างตารางสอนสำเร็จ!</h2>
              <p class="text-sm text-gray-500 dark:text-gray-400">ระบบได้ทำการประมวลผลและจัดตารางสอนทั้งโรงเรียนเรียบร้อยแล้ว</p>
            </div>

            <!-- Stats Grid -->
            <div class="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
              <div class="p-3 bg-blue-50 dark:bg-blue-900/20 rounded-xl border border-blue-100 dark:border-blue-800/30">
                <p class="text-[10px] uppercase tracking-wider text-blue-600 dark:text-blue-400 font-bold mb-1">จัดได้แล้ว</p>
                <p class="text-2xl font-black text-blue-700 dark:text-blue-300 pointer-events-none">${placedCount}</p>
              </div>
               <div class="p-3 bg-indigo-50 dark:bg-indigo-900/20 rounded-xl border border-indigo-100 dark:border-indigo-800/30">
                <p class="text-[10px] uppercase tracking-wider text-indigo-600 dark:text-indigo-400 font-bold mb-1">จากทั้งหมด</p>
                <p class="text-2xl font-black text-indigo-700 dark:text-indigo-300 pointer-events-none">${tasks.length}</p>
              </div>
              <div class="p-3 bg-emerald-50 dark:bg-emerald-900/20 rounded-xl border border-emerald-100 dark:border-emerald-800/30">
                <p class="text-[10px] uppercase tracking-wider text-emerald-600 dark:text-emerald-400 font-bold mb-1">ความสำเร็จ</p>
                <p class="text-2xl font-black text-emerald-700 dark:text-emerald-300 pointer-events-none">${((placedCount / tasks.length) * 100).toFixed(0)}%</p>
              </div>
              <div class="p-3 bg-gray-50 dark:bg-gray-800/50 rounded-xl border border-gray-100 dark:border-gray-700">
                <p class="text-[10px] uppercase tracking-wider text-gray-500 dark:text-gray-400 font-bold mb-1">เวลา</p>
                <p class="text-2xl font-black text-gray-700 dark:text-gray-300 pointer-events-none">${(processingTimeMs / 1000).toFixed(1)}s</p>
              </div>
            </div>

            <!-- Alerts -->
            ${unplacedTasks.length > 0 ? `
              <div class="bg-amber-50 dark:bg-amber-900/20 p-3 rounded-xl border border-amber-200 dark:border-amber-700/50 flex items-start gap-3 text-left mb-4">
                 <div class="mt-0.5 text-amber-500 shrink-0">⚠️</div>
                 <div>
                    <p class="text-sm font-bold text-amber-800 dark:text-amber-200">ยังเหลืออีก ${unplacedTasks.length} รายวิชา</p>
                    <p class="text-xs text-amber-600 dark:text-amber-400 mt-0.5 leading-relaxed">ระบบไม่เติมลงตารางได้เนื่องจากข้อจำกัดที่ขัดแย้งกัน กรุณาตรวจสอบและจัดวางด้วยตนเอง</p>
                 </div>
              </div>
            ` : ''}

            <!-- Footer Info -->
            <div class="text-[10px] text-gray-400 flex items-center justify-center gap-1">
               <span>💾 บันทึกอัตโนมัติ 100%:</span>
               <span>${docIds.length} ตารางสอน (${numBatches} batches)</span>
            </div>

          </div>
        `,
        showConfirmButton: true,
        confirmButtonText: 'รับทราบ',
        confirmButtonColor: '#10b981', // Emerald 500
        buttonsStyling: true,
        customClass: {
          popup: 'rounded-3xl shadow-2xl overflow-hidden dark:bg-[#2a2b2f]',
          confirmButton: 'rounded-xl px-6 py-2.5 font-bold shadow-lg shadow-emerald-500/20 text-sm'
        },
        width: '550px',
        padding: '0'
      }).then(() => {
        // Auto scroll to schedule section after dialog closes
        setTimeout(() => {
          if (scheduleSectionRef.current) {
            const yOffset = -140; // Increased offset for more breathing room
            const element = scheduleSectionRef.current;
            const y = element.getBoundingClientRect().top + window.scrollY + yOffset;
            window.scrollTo({ top: y, behavior: 'smooth' });
          }
        }, 300);
      });

      if (selectedTeacher) {
        loadTeacherMasterSchedule();
      }

    } catch (error) {
      console.error("School-wide auto-scheduling failed: ", error);

      let errorMessage = 'เกิดข้อผิดพลาดระหว่างการสร้างตารางสอนทั้งโรงเรียน';
      let errorDetails = '';

      if (error instanceof Error) {
        errorDetails = error.message;

        // Provide specific error messages for common issues
        if (errorDetails.includes('permission')) {
          errorMessage = 'ไม่มีสิทธิ์เข้าถึงข้อมูล กรุณาตรวจสอบการเข้าสู่ระบบ';
        } else if (errorDetails.includes('quota')) {
          errorMessage = 'เกินโควต้าการใช้งาน Firestore กรุณาลองใหม่ภายหลัง';
        } else if (errorDetails.includes('network')) {
          errorMessage = 'เกิดปัญหาการเชื่อมต่ออินเทอร์เน็ต กรุณาตรวจสอบการเชื่อมต่อ';
        }
      }

      MySwal.fire({
        icon: 'error',
        title: 'เกิดข้อผิดพลาด',
        html: `
          <div class="text-left space-y-2">
            <p>${errorMessage}</p>
            ${errorDetails ? `<p class="text-sm text-gray-500 mt-2">รายละเอียด: ${errorDetails}</p>` : ''}
            <p class="text-sm text-blue-600 mt-3">💡 คำแนะนำ: ลองรีเฟรชหน้าเว็บและทำใหม่อีกครั้ง</p>
          </div>
        `
      });
    } finally {
      setIsAutoScheduling(false);
    }
  };

  const handleClearAllTeachersSchedules = async () => {
    if (!schoolId) return;

    MySwal.fire({
      title: 'ยืนยันการล้างข้อมูล?',
      text: "คุณต้องการล้างตารางสอนของครู \"ทุกคน\" ใช่หรือไม่? การกระทำนี้ไม่สามารถย้อนกลับได้",
      icon: 'warning',
      showCancelButton: true,
      confirmButtonColor: '#d33',
      cancelButtonColor: '#3085d6',
      confirmButtonText: 'ยืนยัน ลบทั้งหมด',
      cancelButtonText: 'ยกเลิก'
    }).then(async (result) => {
      if (result.isConfirmed) {
        setIsSaving(true);
        try {
          const schedulesCollectionRef = collection(db, 'school-settings', schoolId, 'schedules');
          const snapshot = await getDocs(schedulesCollectionRef);

          if (snapshot.empty) {
            MySwal.fire('ว่างเปล่า', 'ไม่มีข้อมูลตารางสอนให้ลบ', 'info');
            setIsSaving(false);
            return;
          }

          const batch = writeBatch(db);
          snapshot.docs.forEach((doc) => {
            batch.delete(doc.ref);
          });

          await batch.commit();

          // Reset local visible state
          setSchedule({});
          setTeacherMasterSchedule({});
          setSchoolMasterSchedule({});

          // Reset Bank for all courses
          setAvailableCourseInstances(allCourses.map(c => ({ ...c, instanceId: c.id })));

          MySwal.fire(
            'ลบเรียบร้อย!',
            'ล้างตารางสอนของครูทุกคนเรียบร้อยแล้ว',
            'success'
          );

        } catch (error) {
          console.error("Error clearing all schedules:", error);
          MySwal.fire('Error', 'ไม่สามารถล้างข้อมูลได้', 'error');
        } finally {
          setIsSaving(false);
        }
      }
    });
  };

  const allDroppableIds = useMemo(() => {
    const periodIds = Object.keys(DAYS).flatMap(day => periodSettings.filter(p => p.isTeachingPeriod).map(p => `${day}-${p.id.replace('period-', '')}`));
    const bankIds = availableCourseInstances.map(c => c.instanceId);
    const scheduleIds = Object.values(schedule).filter(Boolean).map(c => c!.instanceId);
    return ['course-bank', ...periodIds, ...bankIds, ...scheduleIds];
  }, [availableCourseInstances, schedule]);

  const handleRemoveCourse = useCallback((slotId: string) => {
    const courseToRemove = schedule[slotId];
    if (!courseToRemove) return;

    setSchedule(prev => {
      const newSchedule = { ...prev };
      newSchedule[slotId] = null;
      return newSchedule;
    });

    setAvailableCourseInstances(current => [
      ...current,
      { ...courseToRemove, instanceId: `${courseToRemove.id}-bank-${Date.now()}` }
    ]);
  }, [schedule]);

  const selectedTeacherData = teachers.find((t: Teacher) => t.id === selectedTeacher);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterClass, setFilterClass] = useState<string>('all');
  const [filterRoom, setFilterRoom] = useState<string>('all');

  // Helper for Class Sorting (K -> P -> M)
  const getClassWeight = (c: string) => {
    const clean = c.toLowerCase().trim();
    if (clean.startsWith('k')) return 10 + (parseInt(clean.replace('k', '')) || 0); // K1-3
    if (clean.startsWith('p')) return 20 + (parseInt(clean.replace('p', '')) || 0); // P1-6
    if (clean.startsWith('m')) return 30 + (parseInt(clean.replace('m', '')) || 0); // M1-6
    return 99; // Others
  };

  // Extract Unique Classes and Rooms for Filters from ALL courses (Global)
  const { uniqueClasses, uniqueRooms } = useMemo(() => {
    const classes = new Set<string>();
    const rooms = new Set<string>();

    allCourses.forEach(c => {
      // 1. Classes - include both single and combined from top-level and assignments
      const cIds = Array.isArray(c.classId) ? c.classId : (c.classId ? [c.classId] : []);
      cIds.forEach(id => { if (id) classes.add(id); });

      c.teacherAssignments?.forEach(asgn => {
        asgn.classLevels?.forEach(lvl => { if (lvl) classes.add(lvl); });
      });

      // 2. Rooms - include from top-level and assignments
      if (c.room) {
        c.room.forEach(r => {
          if (r && r.toLowerCase() !== 'all') rooms.add(r);
        });
      }
      c.teacherAssignments?.forEach(asgn => {
        asgn.roomIds?.forEach(rId => {
          if (rId) {
            const roomObj = physicalRooms.find(pr => pr.id === rId || pr.roomName === rId);
            rooms.add(roomObj ? roomObj.roomName : rId);
          }
        });
      });
    });

    return {
      uniqueClasses: Array.from(classes).sort((a, b) => getClassWeight(a) - getClassWeight(b)),
      uniqueRooms: Array.from(rooms).sort()
    };
  }, [allCourses, physicalRooms]);

  // Group instances by Class for the Bank UI
  const groupedCourses = useMemo(() => {
    const groups: Record<string, typeof availableCourseInstances> = {};

    // Filter first
    const filtered = availableCourseInstances.filter(c => {
      // 1. Semester Filter
      const semStr = String(c.semester || "");
      const targetSem = String(selectedSemester || "1");
      const isCorrectSemester = !c.semester || semStr === targetSem || semStr.startsWith(targetSem + '/') || targetSem.startsWith(semStr + '/');
      if (!isCorrectSemester) return false;

      // 2. Search Term Filter
      const matchSearch = c.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
        c.code.toLowerCase().includes(searchTerm.toLowerCase());
      if (!matchSearch) return false;

      // 3. Class Filter
      if (filterClass !== 'all') {
        const cIds = Array.isArray(c.classId) ? c.classId : [c.classId || ''];
        const asgnClasses = c.teacherAssignments?.flatMap(a => a.classLevels || []) || [];
        const allAssociatedClasses = [...cIds, ...asgnClasses];
        const isMatch = allAssociatedClasses.some(id => id === filterClass || id.startsWith(filterClass + '/'));
        if (!isMatch) return false;
      }

      // 4. Room Filter
      if (filterRoom !== 'all') {
        const rooms = c.room || [];
        const asgnRoomIds = c.teacherAssignments?.flatMap(a => a.roomIds || []) || [];

        const matchRoom = rooms.includes(filterRoom) ||
          asgnRoomIds.some(rId => {
            const roomObj = physicalRooms.find(pr => pr.id === rId || pr.roomName === rId);
            return roomObj && roomObj.roomName === filterRoom;
          });
        if (!matchRoom) return false;
      }

      // 5. Subject Group Filter
      if (filterSubjectGroup !== 'all') {
        if (c.subjectGroup !== filterSubjectGroup) return false;
      }

      // 6. Group Number Filter
      if (filterGroup !== 'all') {
        const groups = c.teacherAssignments?.map(a => String(a.groupNumber || "")) || [];
        if (!groups.includes(filterGroup)) return false;
      }

      return true;
    });

    filtered.forEach(course => {
      // Determine Group Name (e.g. from ClassId)
      let groupName = 'อื่นๆ';
      const cIds = Array.isArray(course.classId) ? course.classId : [course.classId || 'Unassigned'];

      // Try to extract level from the first classId (assuming format like p1, m1, etc. or using display name)
      // We can use the logic from earlier or just first char? 
      // Let's use getDisplayName logic but simpler grouping.
      // If combined, maybe "Combined Classes"? Or "P.1 & P.2"?

      // Let's try to group by "Level" if possible. 
      // If classId is 'p1', 'p2' -> Group 'Prathom' ?
      // Simple approach: Group by the Display Name of the class(es)
      groupName = getClassDisplayName(cIds);

      // Or maybe group by Subject Category if we had it? NO, class is better for scheduling.

      if (!groups[groupName]) groups[groupName] = [];
      groups[groupName].push(course);
    });

    // Sort groups alphanumerically
    return Object.fromEntries(
      Object.entries(groups).sort(([a], [b]) => a.localeCompare(b))
    );
  }, [availableCourseInstances, searchTerm]);

  return (
    <DndContext sensors={sensors} onDragStart={handleDragStart} onDragEnd={handleDragEnd} collisionDetection={closestCorners}>
      <MainLayout>
        <div className="p-4 sm:p-6 min-h-screen text-gray-900 dark:text-white transition-colors duration-300">
          <div className="max-w-screen-2xl mx-auto">
            <div className="mb-6">
              <Link to="/academic-admin" className="inline-flex items-center text-indigo-600 dark:text-indigo-400 hover:underline">
                <ArrowLeft size={18} className="mr-1" /> กลับหน้าบริหารงานวิชาการ
              </Link>
            </div>

            {/* Premium Control Deck */}
            <div className="bg-white dark:bg-[#2a2b2f] rounded-3xl p-1.5 mb-8 shadow-xl shadow-indigo-100/50 dark:shadow-none border border-gray-100 dark:border-gray-800 transition-all hover:shadow-2xl hover:shadow-indigo-100/30">

              {/* Row 1: Global Command Strip */}
              <div className="flex flex-col xl:flex-row items-center justify-between p-4 gap-4">

                {/* Left: Title & Branding */}
                <div className="flex items-center gap-4 w-full xl:w-auto">
                  <div className="hidden sm:flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-indigo-500 to-violet-600 text-white shadow-lg shadow-indigo-500/30">
                    <Grid size={24} />
                  </div>
                  <div>
                    <h1 className="text-xl font-bold text-gray-900 dark:text-white leading-tight">จัดตารางสอน</h1>
                    <p className="text-xs text-gray-500 dark:text-gray-400 font-medium">ระบบบริหารจัดการตารางเรียนอัจฉริยะ</p>
                  </div>


                </div>

                {/* Right: The 'Action Island' */}
                <div className="flex items-center gap-1.5 bg-gray-50 dark:bg-[#1e1f21] p-1.5 rounded-2xl border border-gray-100 dark:border-gray-700/50 w-full xl:w-auto overflow-x-auto">

                  {/* Clear Button (Destructive) */}
                  <button
                    onClick={handleClearAllTeachersSchedules}
                    className="flex items-center justify-center w-10 h-10 rounded-xl text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 transition-all"
                    title="ล้างข้อมูลตารางสอนของครูทุกคน"
                  >
                    <Trash2 size={18} />
                  </button>

                  <div className="w-px h-6 bg-gray-200 dark:bg-gray-700 mx-1"></div>

                  {/* Auto Schedule (Primary Action) */}
                  <button
                    onClick={handleGenerateSchoolTimetable}
                    disabled={isAutoScheduling}
                    className="whitespace-nowrap flex items-center gap-2 bg-white dark:bg-gray-800 text-indigo-600 dark:text-indigo-400 font-semibold text-sm py-2 px-4 rounded-xl border border-gray-100 dark:border-gray-700 hover:border-indigo-200 hover:shadow-sm transition-all disabled:opacity-50 disabled:grayscale"
                  >
                    <Cpu size={16} />
                    {isAutoScheduling ? 'ประมวลผล...' : 'จัดตารางอัตโนมัติ'}
                  </button>

                  {/* Save (Success Action) */}
                  <button
                    onClick={handleSaveSchedule}
                    disabled={isSaving || !selectedTeacher}
                    className="whitespace-nowrap flex items-center gap-2 bg-gray-900 dark:bg-indigo-600 text-white font-bold text-sm py-2 px-5 rounded-xl shadow-lg shadow-gray-200 dark:shadow-none hover:bg-black dark:hover:bg-indigo-500 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <Save size={16} />
                    {isSaving ? 'บันทึก...' : 'บันทึกข้อมูล'}
                  </button>
                </div>
              </div>


            </div>

            {/* Row 2: Context Bar (Filters & Selection) */}
            <div className="bg-gray-50/50 dark:bg-[#1e1f21]/50 rounded-2xl p-3 border border-gray-100 dark:border-gray-800/50 flex flex-col lg:flex-row gap-4">

              {/* Semester Selector (Primary Filter) */}
              <div className="relative min-w-[160px] z-20">
                <div className="relative group">
                  <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 text-indigo-500" size={18} />
                  <select
                    value={selectedSemester}
                    onChange={(e) => setSelectedSemester(e.target.value)}
                    className="w-full pl-10 pr-8 py-3 bg-white dark:bg-[#2a2b2f] border border-gray-200 dark:border-gray-700 rounded-xl text-sm font-bold text-indigo-900 dark:text-indigo-300 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all shadow-sm appearance-none cursor-pointer hover:border-indigo-300"
                  >
                    <option value="1">ภาคเรียนที่ 1</option>
                    <option value="2">ภาคเรียนที่ 2</option>
                  </select>
                  <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-indigo-400">
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
                  </div>
                </div>
              </div>

              {/* Teacher Selector (Hero Input) */}
              <div className="relative flex-grow lg:flex-grow-0 lg:w-1/2 z-20">
                <div className="relative group">
                  <Select
                    value={teachers.find(t => t.id === selectedTeacher) ? (() => {
                      const t = teachers.find(t => t.id === selectedTeacher)!;
                      return {
                        value: selectedTeacher,
                        label: t.name,
                        teacher: t
                      };
                    })() : null}
                    onChange={(option: any) => {
                      const val = option?.value || '';
                      setSelectedTeacher(val);
                      if (val) {
                        setTimeout(() => {
                          loadTeacherMasterSchedule();
                        }, 100);
                      } else {
                        setSchedule({});
                        setTeacherMasterSchedule({});
                      }
                    }}
                    options={teachers.map(teacher => ({
                      value: teacher.id,
                      label: teacher.name,
                      teacher: teacher
                    }))}
                    placeholder="-- เลือกครูผู้สอน --"
                    isClearable
                    className="react-select-container"
                    classNamePrefix="react-select"
                    formatOptionLabel={(data: any) => (
                      <div className="flex items-center gap-3 py-1.5 px-0.5 group">
                        <div className="w-8 h-8 rounded-full bg-gradient-to-br from-indigo-500 via-indigo-600 to-violet-700 flex items-center justify-center text-white text-[10px] font-bold overflow-hidden shadow-md shadow-indigo-500/20 border border-white/20 flex-shrink-0 transition-all duration-300 group-hover:scale-110">
                          {data.teacher?.profileImageUrl ? (
                            <img src={data.teacher.profileImageUrl} alt="" className="w-full h-full object-cover" />
                          ) : (
                            <span className="text-xs tracking-tighter uppercase">{data.teacher?.firstName?.substring(0, 1)}{data.teacher?.lastName?.substring(0, 1) || data.teacher?.name?.substring(0, 1)}</span>
                          )}
                        </div>
                        <div className="flex flex-col min-w-0 flex-grow">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-[10px] font-black bg-indigo-50 dark:bg-indigo-900/40 text-indigo-600 dark:text-indigo-400 px-2 py-0.5 rounded-lg font-mono border border-indigo-100 dark:border-indigo-800/40 shadow-sm uppercase tracking-wider">
                              {data.teacher?.teacherId || 'N/A'}
                            </span>
                            <span className="text-[15px] font-bold text-gray-800 dark:text-gray-100 truncate flex-grow">
                              {(data.teacher?.firstName || data.teacher?.lastName)
                                ? `${data.teacher?.title || ''}${data.teacher?.firstName || ''} ${data.teacher?.lastName || ''}`
                                : data.teacher?.name}
                            </span>
                          </div>
                        </div>
                      </div>
                    )}
                    styles={{
                      control: (base, state) => ({
                        ...base,
                        paddingLeft: '32px',
                        borderRadius: '20px',
                        borderColor: state.isFocused ? '#6366f1' : 'transparent',
                        boxShadow: state.isFocused
                          ? '0 0 0 4px rgba(99, 101, 241, 0.1), 0 10px 15px -3px rgba(99, 101, 241, 0.1)'
                          : 'none',
                        '&:hover': {
                          borderColor: '#6366f1'
                        },
                        backgroundColor: document.documentElement.classList.contains('dark') ? '#2a2b2f' : 'white',
                        paddingTop: '8px',
                        paddingBottom: '8px',
                        transition: 'all 0.4s cubic-bezier(0.175, 0.885, 0.32, 1.275)',
                        borderWidth: '2px',
                      }),
                      option: (base, state) => ({
                        ...base,
                        backgroundColor: state.isSelected
                          ? '#6366f1'
                          : state.isFocused
                            ? (document.documentElement.classList.contains('dark') ? 'rgba(99,101,241,0.2)' : '#f0f3ff')
                            : 'transparent',
                        color: state.isSelected ? 'white' : 'inherit',
                        padding: '4px 10px',
                        cursor: 'pointer',
                        borderRadius: '16px',
                        margin: '3px 8px',
                        width: 'calc(100% - 16px)',
                        transition: 'all 0.2s ease',
                        '&:active': {
                          transform: 'scale(0.98)',
                        }
                      }),
                      menu: (base) => ({
                        ...base,
                        backgroundColor: document.documentElement.classList.contains('dark') ? 'rgba(30, 31, 33, 0.95)' : 'rgba(255, 255, 255, 0.98)',
                        borderRadius: '28px',
                        overflow: 'hidden',
                        boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.3)',
                        border: '1px solid',
                        borderColor: document.documentElement.classList.contains('dark') ? '#3f3f46' : '#e2e8f0',
                        padding: '10px 4px',
                        zIndex: 100,
                        backdropFilter: 'blur(16px)',
                        marginTop: '8px',
                        animation: 'slideUp 0.3s ease-out',
                      }),
                      valueContainer: (base) => ({
                        ...base,
                        padding: '0 10px',
                      }),
                      singleValue: (base) => ({
                        ...base,
                        color: 'inherit',
                        fontWeight: '700',
                        fontSize: '15px'
                      }),
                      placeholder: (base) => ({
                        ...base,
                        color: '#94a3b8',
                        fontSize: '15px',
                        fontWeight: '500'
                      }),
                      menuList: (base) => ({
                        ...base,
                        padding: '0',
                        '&::-webkit-scrollbar': { width: '6px' },
                        '&::-webkit-scrollbar-track': { background: 'transparent' },
                        '&::-webkit-scrollbar-thumb': { background: '#cbd5e1', borderRadius: '10px' },
                        '&::-webkit-scrollbar-thumb:hover': { background: '#94a3b8' },
                      }),
                      dropdownIndicator: (base) => ({
                        ...base,
                        color: '#6366f1',
                        '&:hover': { color: '#4f46e5' }
                      }),
                      clearIndicator: (base) => ({
                        ...base,
                        color: '#94a3b8',
                        '&:hover': { color: '#ef4444' }
                      }),
                      indicatorSeparator: () => ({ display: 'none' }),
                    }}
                  />
                  <User className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none group-focus-within:text-indigo-500 transition-colors z-10" size={18} />
                </div>
              </div>

              <div className="w-px h-auto bg-gray-200 dark:bg-gray-700 hidden lg:block mx-2"></div>

              {/* Filters */}
              <div className="flex flex-grow items-center gap-3 overflow-x-auto pb-1 sm:pb-0">

                {/* Class Filter */}
                <div className="relative min-w-[140px]">
                  <Users className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={16} />
                  <select
                    value={filterClass}
                    onChange={(e) => setFilterClass(e.target.value)}
                    className="w-full pl-9 pr-8 py-2.5 bg-white dark:bg-[#2a2b2f] border border-gray-200 dark:border-gray-700 rounded-lg text-xs font-medium focus:ring-2 focus:ring-indigo-500/10 focus:border-indigo-500 appearance-none"
                  >
                    <option value="all">ทุกชั้นเรียน</option>
                    {uniqueClasses.map(cls => (
                      <option key={cls} value={cls}>{getClassDisplayName(cls)}</option>
                    ))}
                  </select>
                  <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none">
                    <svg className="w-3 h-3 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
                  </div>
                </div>

                {/* Room Filter */}
                <div className="relative min-w-[140px]">
                  <Home className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={16} />
                  <select
                    value={filterRoom}
                    onChange={(e) => setFilterRoom(e.target.value)}
                    className="w-full pl-9 pr-8 py-2.5 bg-white dark:bg-[#2a2b2f] border border-gray-200 dark:border-gray-700 rounded-lg text-xs font-medium focus:ring-2 focus:ring-indigo-500/10 focus:border-indigo-500 appearance-none"
                  >
                    <option value="all">ทุกห้องเรียน</option>
                    {uniqueRooms.map(room => (
                      <option key={room} value={room}>{room !== 'all' ? `ห้อง ${room}` : 'ไม่ระบุห้อง'}</option>
                    ))}
                  </select>
                  <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none">
                    <svg className="w-3 h-3 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
                  </div>
                </div>

                {/* Subject Group Filter */}
                <div className="relative min-w-[140px]">
                  <BookOpen className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={16} />
                  <select
                    value={filterSubjectGroup}
                    onChange={(e) => setFilterSubjectGroup(e.target.value)}
                    className="w-full pl-9 pr-8 py-2.5 bg-white dark:bg-[#2a2b2f] border border-gray-200 dark:border-gray-700 rounded-lg text-xs font-medium focus:ring-2 focus:ring-indigo-500/10 focus:border-indigo-500 appearance-none transition-all"
                  >
                    <option value="all">ทุกกลุ่มสาระฯ</option>
                    {subjectGroups.filter(g => g !== 'all').map(group => (
                      <option key={group} value={group}>{group}</option>
                    ))}
                  </select>
                  <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none">
                    <svg className="w-3 h-3 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
                  </div>
                </div>

                {/* Group Filter */}
                <div className="relative min-w-[100px]">
                  <Grid className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={16} />
                  <select
                    value={filterGroup}
                    onChange={(e) => setFilterGroup(e.target.value)}
                    className="w-full pl-9 pr-8 py-2.5 bg-white dark:bg-[#2a2b2f] border border-gray-200 dark:border-gray-700 rounded-lg text-xs font-medium focus:ring-2 focus:ring-indigo-500/10 focus:border-indigo-500 appearance-none transition-all"
                  >
                    <option value="all">ทุกกลุ่ม</option>
                    {Array.from({ length: 20 }, (_, i) => String(i + 1)).map(num => (
                      <option key={num} value={num}>กลุ่ม {num}</option>
                    ))}
                  </select>
                  <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none">
                    <svg className="w-3 h-3 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
                  </div>
                </div>

                {/* Manual Auto-Schedule (Single Teacher) */}
                {selectedTeacher && (
                  <div className="ml-auto pl-2 border-l border-gray-200 dark:border-gray-700">
                    <button
                      onClick={() => handleAutoScheduleForTeacherAndClasses()}
                      disabled={isAutoScheduling}
                      className="flex items-center gap-1.5 text-xs font-bold text-indigo-600 dark:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-900/20 px-3 py-2 rounded-lg transition-colors border border-dashed border-indigo-200 dark:border-indigo-800"
                    >
                      <Zap size={14} />
                      <span>จัดตารางสอนเฉพาะคนนี้</span>
                    </button>
                  </div>
                )}
              </div>
            </div>

            {/* Stats Footer (Optional) - Only if teacher selected */}
            {selectedTeacher && (
              <div className="mt-2 px-4 py-2 flex items-center justify-between text-[11px] text-gray-400 border-t border-gray-50 dark:border-gray-800/50">
                <div className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-green-400"></span>
                  <span>สถานะ: {schedule ? 'กำลังแก้ไข' : 'พร้อม'}</span>
                </div>
                <div className="flex gap-4">
                  <span>ลงแล้ว: <b className="text-gray-600 dark:text-gray-300">{Object.values(schedule).filter(Boolean).length}</b> คาบ</span>
                  <span>รวมทั้งโรงเรียน: <b>{Object.keys(schoolMasterSchedule).length}</b> คาบ</span>
                </div>
              </div>
            )}

          </div>

          {(!selectedTeacher) ? (
            <div className="text-center py-20 bg-white dark:bg-[#2a2b2f] rounded-2xl border-2 border-dashed border-gray-200 dark:border-gray-700">
              <Grid size={48} className="mx-auto text-gray-300 dark:text-gray-600 mb-4" />
              <h3 className="text-xl font-bold text-gray-500 dark:text-gray-400">กรุณาเลือกครู</h3>
              <p className="text-gray-400 dark:text-gray-500 mt-1">เพื่อเริ่มจัดตารางสอน</p>
            </div>
          ) : (
            <div ref={scheduleSectionRef} className="grid grid-cols-1 xl:grid-cols-4 gap-6 h-[calc(100vh-120px)]" style={{ userSelect: 'none' }}>
              <SortableContext items={[...availableCourseInstances.map(c => c.instanceId), 'course-bank']}>
                <div id="course-bank" className="xl:col-span-1 bg-white dark:bg-[#2a2b2f] rounded-2xl p-4 shadow-sm border border-gray-100 dark:border-gray-700 overflow-hidden flex flex-col h-full">
                  <div className="flex items-center justify-between mb-4 flex-shrink-0">
                    <h2 className="text-lg font-bold text-gray-900 dark:text-white flex items-center gap-2">
                      <BookOpen size={20} className="text-indigo-600 dark:text-indigo-400" />
                      คลังรายวิชา
                    </h2>
                    <span className="text-xs font-medium bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400 px-2 py-1 rounded-full">
                      {availableCourseInstances.length} วิชา
                    </span>
                  </div>

                  {/* Search Bar */}
                  <div className="relative mb-4 flex-shrink-0">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={16} />
                    <input
                      type="text"
                      placeholder="ค้นหาวิชา..."
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      className="w-full pl-9 pr-4 py-2 bg-gray-50 dark:bg-[#1e1f21] border border-gray-200 dark:border-gray-600 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 text-gray-900 dark:text-white transition-all"
                    />
                  </div>

                  <div className="space-y-4 overflow-y-auto p-1 flex-grow scrollbar-thin scrollbar-thumb-gray-200 dark:scrollbar-thumb-gray-700">
                    {Object.keys(groupedCourses).length > 0 ? (
                      Object.entries(groupedCourses).map(([groupName, courses]) => (
                        <div key={groupName} className="bg-gray-50 dark:bg-[#1e1f21]/50 rounded-xl p-3 border border-gray-100 dark:border-gray-800">
                          <h3 className="text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2 flex items-center justify-between">
                            {groupName}
                            <span className="bg-gray-200 dark:bg-gray-700 text-gray-600 dark:text-gray-300 px-1.5 py-0.5 rounded text-[10px] min-w-[20px] text-center">
                              {courses.length}
                            </span>
                          </h3>
                          <div className="grid grid-cols-2 gap-2">
                            {courses.map(courseInstance => (
                              <div key={courseInstance.instanceId} className="h-16">
                                <DraggableCourse course={courseInstance} />
                              </div>
                            ))}
                          </div>
                        </div>
                      ))
                    ) : (
                      <div className="text-center py-10 flex flex-col items-center justify-center text-gray-400 dark:text-gray-500">
                        <Search size={32} className="mb-2 opacity-50" />
                        <p className="text-sm">ไม่พบรายวิชา</p>
                      </div>
                    )}
                  </div>
                </div>
              </SortableContext>

              <div className="xl:col-span-3 bg-white dark:bg-[#2a2b2f] p-4 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 h-full flex flex-col">
                <SortableContext items={allDroppableIds}>
                  <table className="w-full border-collapse text-center table-fixed h-full flex-grow">
                    <thead>
                      <tr>
                        <th className="p-2 w-[12%] sm:w-[10%]"></th>
                        {periodSettings.map((period, index) => {
                          const widthPercentage = 90 / periodSettings.length;
                          return (
                            <th
                              key={period.id}
                              className={`p-2 text-xs font-semibold text-gray-500 dark:text-gray-400`}
                              style={{ width: `${widthPercentage}%` }}
                            >
                              <p>{period.label}</p>
                              <p className="font-normal">{period.startTime} - {period.endTime}</p>
                            </th>
                          );
                        })}
                      </tr>
                    </thead>
                    <tbody>
                      {Object.entries(DAYS).map(([dayKey, dayName]) => (
                        <tr key={dayKey}>
                          <td className="p-2 font-bold text-gray-900 dark:text-white">{dayName}</td>
                          {periodSettings.map((period, index) => {
                            const teachingPeriodNumber = period.isTeachingPeriod ? parseInt(period.id.replace('period-', '')) : null;
                            const cellId = teachingPeriodNumber !== null ? `${dayKey}-${teachingPeriodNumber}` : `${dayKey}-special-${index}`;

                            // Check for special period from database
                            const specialPeriod = specialPeriods.find(sp =>
                              (sp.linkedPeriodId === period.id && (!sp.day || sp.day === 'all' || sp.day === dayKey)) ||
                              (sp.startTime === period.startTime && sp.endTime === period.endTime && (!sp.day || sp.day === 'all' || sp.day === dayKey))
                            );

                            if (!period.isTeachingPeriod || specialPeriod) {
                              // Use special period title if available, otherwise default label
                              const displayLabel = specialPeriod ? specialPeriod.title : (period.id === 'lunch' ? 'พักเที่ยง' : period.label);
                              return (
                                <td key={cellId} className="border border-gray-200 dark:border-gray-700 h-auto p-1 align-middle text-center bg-gray-100 dark:bg-gray-800/50 text-gray-500 dark:text-gray-400 cursor-not-allowed overflow-hidden">
                                  <div className="text-[10px] flex flex-col items-center justify-center h-full">
                                    <span>{displayLabel}</span>
                                    {period.id === 'homeroom' && selectedTeacherData?.homeroomGrade && (
                                      <span className="text-xs text-gray-400 dark:text-gray-500 mt-1">({selectedTeacherData.homeroomGrade})</span>
                                    )}
                                  </div>
                                </td>
                              );
                            }

                            const courseInCell = schedule[cellId];

                            // Filter Logic Implementation
                            let isFilteredOut = false;
                            if (filterClass !== 'all' || filterRoom !== 'all') {
                              if (courseInCell) {
                                // Filter by Class
                                if (filterClass !== 'all') {
                                  const cIds = Array.isArray(courseInCell.classId) ? courseInCell.classId : [courseInCell.classId];
                                  const isMatch = cIds.some(id => id === filterClass || (typeof id === 'string' && id.startsWith(filterClass + '/')));
                                  if (!isMatch) isFilteredOut = true;
                                }
                                // Filter by Room
                                if (!isFilteredOut && filterRoom !== 'all') {
                                  const rooms = courseInCell.room || [];
                                  if (!rooms.includes(filterRoom)) isFilteredOut = true;
                                }
                              } else {
                                // For empty cells, if filtered by class/room, we might want to check school-wide occupancy
                                isFilteredOut = true; // Default to faded if no course matches the specific filter
                              }
                            }

                            const schoolOccupiedInfo = schoolMasterSchedule[cellId] || [];
                            const teacher = teachers.find(t => t.id === selectedTeacher);

                            // Check teacher's permanent unavailability
                            const isTeacherPermanentUnavailable = (teacher?.preferences?.unavailableDays?.includes(dayKey) ?? false);

                            // Check if this slot is occupied by this teacher in another class
                            const isOccupiedBySameTeacherBase = teacherMasterSchedule[cellId] && (!courseInCell || teacherMasterSchedule[cellId].classId !== courseInCell.classId);

                            // --- ENHANCED OCCUPANCY TRACKING ---
                            // Find if someone else is teaching the filtered CLASS or using the filtered ROOM
                            let occupiedByAnotherTeacherInfo = null;

                            // 1. If filtering by class, find who else is teaching this class in this slot
                            if (filterClass !== 'all') {
                              const classConflict = schoolOccupiedInfo.find(occ => {
                                if (occ.teacherId === selectedTeacher) return false;
                                const occClasses = Array.isArray(occ.classId) ? occ.classId : [occ.classId];
                                return occClasses.some(id => id === filterClass || (typeof id === 'string' && id.startsWith(filterClass + '/')));
                              });

                              if (classConflict) {
                                isFilteredOut = false; // Show it even if it's another teacher's course, because it matches the filter!
                                occupiedByAnotherTeacherInfo = {
                                  classId: filterClass,
                                  courseTitle: classConflict.course?.title || 'วิขาอื่น',
                                  teacherName: teachers.find(t => t.id === classConflict.teacherId)?.name || 'ครูท่านอื่น',
                                  isLocked: classConflict.course?.locked || false
                                };
                              }
                            }

                            // 2. If filtering by room, find who else is using this room in this slot
                            if (!occupiedByAnotherTeacherInfo && filterRoom !== 'all') {
                              const roomConflict = schoolOccupiedInfo.find(occ => {
                                if (occ.teacherId === selectedTeacher) return false;
                                const occRooms = occ.course?.room || [];
                                return occRooms.includes(filterRoom);
                              });

                              if (roomConflict) {
                                isFilteredOut = false; // Show it
                                occupiedByAnotherTeacherInfo = {
                                  classId: Array.isArray(roomConflict.classId) ? roomConflict.classId[0] : roomConflict.classId,
                                  courseTitle: roomConflict.course?.title || 'วิชาอื่น',
                                  teacherName: teachers.find(t => t.id === roomConflict.teacherId)?.name || 'ครูท่านอื่น',
                                  isLocked: roomConflict.course?.locked || false
                                };
                              }
                            }

                            // 3. Fallback: General occupancy check if NOT filtering (or filter didn't catch anything yet)
                            if (!occupiedByAnotherTeacherInfo && filterClass === 'all' && filterRoom === 'all') {
                              // If looking at a general teacher view, show if they have a conflict? 
                              // (Already handled by isOccupiedBySameTeacherBase for the SAME teacher)
                            }

                            // Check course's disallowed days (only relevant if a course is being dragged)
                            const isCourseDisallowedDay = activeDragItem?.constraints?.disallowedDays?.includes(dayKey) ?? false;

                            // Check dynamic unavailable slots
                            const isDynamicUnavailable = dynamicUnavailableSlots.includes(cellId);

                            // Determine if it is a special period (activity)
                            const isSpecialActivity = false;
                            const specialActivityTitle = null;

                            // Determine if dropping is forbidden for the active drag item
                            let isDropForbidden = false;
                            if (activeDragItem) {
                              const { forbidden: baseForbidden } = checkConstraints(activeDragItem, cellId, selectedTeacherData, dynamicUnavailableSlots);
                              const isTargetLockedByCurrentTeacher = !!schedule[cellId]?.locked;
                              const isTargetLockedByAnotherTeacher = false;

                              const isFromBank = !Object.values(schedule).some(c => c?.instanceId === activeDragItem.instanceId);
                              const targetCourse = schedule[cellId];
                              const isTargetOccupied = !!targetCourse;

                              const isForbiddenFromBank = isFromBank && isTargetOccupied;
                              const isForbiddenFromGridSwap = !isFromBank && isTargetOccupied && targetCourse.classId === activeDragItem.classId;

                              // Block drop if special activity exists
                              const isForbiddenSpecialActivity = isSpecialActivity;
                              isDropForbidden = baseForbidden || isTargetLockedByCurrentTeacher || isTargetLockedByAnotherTeacher || isForbiddenFromBank || isForbiddenFromGridSwap || isForbiddenSpecialActivity;
                            }

                            return (
                              <DroppableCell
                                key={cellId}
                                id={cellId}
                                course={courseInCell || null}
                                isTeacherPermanentUnavailable={isTeacherPermanentUnavailable}
                                isCourseDisallowedDay={isCourseDisallowedDay}
                                isDynamicUnavailable={isDynamicUnavailable}
                                isSpecialPeriod={isSpecialActivity}
                                specialPeriodTitle={specialActivityTitle}
                                isOccupiedByOtherClass={isOccupiedBySameTeacherBase}
                                occupiedByOtherClassInfo={isOccupiedBySameTeacherBase
                                  ? { classId: teacherMasterSchedule[cellId].classId, courseTitle: teacherMasterSchedule[cellId].course?.title || 'วิชา' }
                                  : null}
                                occupiedByAnotherTeacherInfo={occupiedByAnotherTeacherInfo}
                                onClick={() => handleToggleDynamicUnavailable(cellId)}
                                onLockToggle={handleToggleCourseLock}
                                isDraggingOver={activeDragItem !== null}
                                isDropForbidden={false} // Recalculate inside DroppableCell if needed or pass full flags
                                handleRemoveCourse={handleRemoveCourse}
                                isFilteredOut={isFilteredOut} // Pass new prop!
                              />
                            );
                          })}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {/* Note for schedule issues - Moved inside overflow to align with table width if needed, or just below */}
                  <div className="mt-2 p-3 bg-yellow-50 dark:bg-yellow-900/10 rounded-b-lg border-t-0 border border-yellow-200 dark:border-yellow-800/30 text-xs text-yellow-800 dark:text-yellow-200">
                    <div className="flex items-start gap-2">
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 mt-0.5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                      <div>
                        <p className="font-semibold mb-1">ตำแหน่งคาบเรียนพิเศษไม่ถูกต้อง?</p>
                        <p>
                          ตรวจสอบการตั้งค่า:
                          <Link to="/academic/period-settings" className="mx-1 underline hover:text-yellow-900 dark:hover:text-yellow-100 font-medium">ตั้งค่าคาบเรียน</Link>
                          หรือ
                          <Link to="/academic/special-periods" className="mx-1 underline hover:text-yellow-900 dark:hover:text-yellow-100 font-medium">จัดการคาบเรียนพิเศษ</Link>
                        </p>
                      </div>
                    </div>
                  </div>
                </SortableContext>
              </div>

            </div>
          )}
        </div>
        <DragOverlay>
          {activeDragItem ? <CourseCard course={activeDragItem as CourseInstance} isOverlay /> : null}
        </DragOverlay>
      </MainLayout>
    </DndContext >
  );
};

export default TeacherSchedulePage;