import React, { useState, useEffect, useMemo } from "react";
import { firestore } from "@/firebase";
import {
  collection,
  query,
  where,
  getDocs,
  getDoc,
  doc,
  Timestamp,
  updateDoc,
  setDoc,
  addDoc,
  deleteDoc,
  writeBatch,
} from "firebase/firestore";
import { getFunctions, httpsCallable } from "firebase/functions";
import Swal from "sweetalert2";
import { useSearchParams } from "react-router-dom";
import { useSelector, useDispatch } from "react-redux";
import { RootState } from "@/store";
import { Users, Calendar, AlertTriangle, CheckCircle, Clock, Search, MapPin, Plus, X, UserPlus, Trash2, Info } from "lucide-react";
import MainLayout from "@/layouts/MainLayout";
import BackButton from "@/components/Shared/BackButton";
import Select from "react-select";
import { isNonOfficialHoliday } from "../../utils/calendarUtils";
import { fetchTeachersMap } from "@/store/slices/userMapSlice";
import { fetchCalendar } from "@/store/slices/calendarSlice";
import { getCurrentThaiYear } from "@/utils/dateUtils";
import { getActiveSortedTeachers } from "@/utils/teacherSortUtils";

interface LeaveRequest {
  id: string;
  teacherName: string;
  teacherDocId: string;
  startDate: Timestamp;
  endDate: Timestamp;
  startDateString: string;
  endDateString: string;
  status: "pending" | "approved" | "substitution_assigned";
  approvedBy?: string | null;
  leaveType: string;
  reason: string;
  substituteStatus?: "pending" | "completed"; // UI state, not from DB
  collection?: string; // 'leave_summary' | 'travel_summary'
  isManual?: boolean; // เพิ่มด้วยตนเอง (ไม่มีใบลา/ไปราชการ)
  dayPortion?: "full" | "morning" | "afternoon"; // ช่วงเวลาที่ต้องจัดสอนแทน (เต็มวัน/เช้า/บ่าย)
}

interface ScheduleEntry {
  id: string; // schedule document id
  day: string;
  period: number;
  periodIndex: number; // Index in periodSettings array
  periodLabel: string; // Human readable label (e.g. คาบที่ 1)
  startTime?: string;
  endTime?: string;
  subjectName: string;
  className: string;
  classId: string | string[] | null;
  groupNumber?: number;
  courseId?: string;
  originalDate: Date;
  substituteTeacherId?: string; // นี่คือ document ID
  substituteTeacherName?: string;
  substitutionDocId?: string; // ID ของ document ใน collection 'substitutions'
  availableTeachers?: { value: string; label: string }[]; // ครูที่ว่างในคาบนั้น
  subjectCode?: string; // รหัสวิชา (สำคัญสำหรับ Enrollment)
  roomName?: string; // สถานที่สอน
  isCoTeaching?: boolean;
  coTeacherIds?: string[];
  allCoTeachersAbsent?: boolean;
  autoHandledByTeacherId?: string;
  autoHandledByTeacherName?: string;
  absentCoTeacherIds?: string[]; // ครูสอนร่วมที่ลา/ไปราชการในวันนั้น
}


interface PeriodSetting {
  id: string; // e.g., 'homeroom', 'period-1', 'lunch'
  label: string;
  startTime: string;
  endTime: string;
  isTeachingPeriod: boolean;
}

const EXCLUDED_POSITIONS = ['ผู้อำนวยการ', 'รองผู้อำนวยการ', 'ผู้ช่วยผู้อำนวยการ'];

const DAY_KEYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
const THAI_DAYS = ["อาทิตย์", "จันทร์", "อังคาร", "พุธ", "พฤหัสบดี", "ศุกร์", "เสาร์"];
const THAI_DAY_BY_KEY: Record<string, string> = {
  sun: 'อาทิตย์',
  mon: 'จันทร์',
  tue: 'อังคาร',
  wed: 'พุธ',
  thu: 'พฤหัสบดี',
  fri: 'ศุกร์',
  sat: 'เสาร์',
};

const formatDateKey = (date: Date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const normalizeTeachingPeriod = (period: unknown, fallback = 1) => {
  const parsed = Number(period);
  if (!Number.isFinite(parsed)) return fallback;
  return parsed === 0 ? 1 : parsed;
};

// Resolve a schedule slot key to its teaching period number (1-based).
// Returns null for non-teaching slots (homeroom, lunch).
// Handles 3 formats: numeric index ('mon-6'), named period ('mon-period-5'), named slot ('mon-lunch').
const resolveSlotPeriod = (
  slot: string,
  dayKey: string,
  periods: PeriodSetting[]
): { periodNumber: number; pIdx: number; setting: PeriodSetting } | null => {
  const suffix = slot.startsWith(`${dayKey}-`) ? slot.slice(dayKey.length + 1) : slot;

  // Named non-teaching slots
  if (suffix === 'homeroom' || suffix === 'lunch') return null;

  // Named period id like 'period-5'
  if (suffix.startsWith('period-')) {
    const num = Number(suffix.replace('period-', ''));
    if (!Number.isFinite(num) || num <= 0) return null;
    const pIdx = periods.findIndex(p => p.id === suffix);
    if (pIdx >= 0) {
      const setting = periods[pIdx];
      if (setting.isTeachingPeriod === false) return null;
      return { periodNumber: num, pIdx, setting };
    }
    // Setting not found but id is valid
    return { periodNumber: num, pIdx: -1, setting: { id: suffix, label: `คาบที่ ${num}`, startTime: '', endTime: '', isTeachingPeriod: true } };
  }

  // Numeric suffix — treat as array index into periodSettings
  const index = Number(suffix);
  if (!Number.isFinite(index) || index < 0) return null;

  const setting = periods[index];
  if (!setting) return null;

  // If array index points to a non-teaching slot (lunch/homeroom),
  // the slot key may have been saved using period NUMBER as the key
  // (older schedule format, before lunch was inserted into periodSettings).
  // Try to find the matching period-X entry by id.
  if (setting.id === 'homeroom' || setting.id === 'lunch' || setting.isTeachingPeriod === false) {
    const periodIdCandidate = `period-${index}`;
    const altIdx = periods.findIndex(p => p.id === periodIdCandidate);
    if (altIdx >= 0 && periods[altIdx].isTeachingPeriod !== false) {
      return { periodNumber: index, pIdx: altIdx, setting: periods[altIdx] };
    }
    return null;
  }

  const match = String(setting.id || '').match(/^period-(\d+)$/);
  if (match) {
    return { periodNumber: Number(match[1]), pIdx: index, setting };
  }

  // Fallback: use index as period number
  const periodNumber = index === 0 ? 1 : index;
  return { periodNumber, pIdx: index, setting };
};


const selectStyles = (isDarkMode: boolean) => ({
  control: (base: any, state: any) => ({
    ...base,
    minHeight: '36px',
    height: '36px',
    borderRadius: '12px',
    backgroundColor: isDarkMode ? 'rgba(30, 41, 59, 0.7)' : 'white',
    borderColor: state.isFocused ? '#6366f1' : (isDarkMode ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)'),
    boxShadow: 'none',
    fontWeight: '800',
    fontSize: '11px',
    transition: 'all 0.2s ease',
    paddingLeft: '6px',
    '&:hover': {
      borderColor: state.isFocused ? '#6366f1' : (isDarkMode ? 'rgba(255,255,255,0.2)' : 'rgba(0,0,0,0.2)'),
    }
  }),
  menu: (base: any) => ({
    ...base,
    backgroundColor: isDarkMode ? '#1e293b' : '#ffffff',
    borderRadius: '14px',
    boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.3)',
    border: isDarkMode ? '1px solid rgba(255,255,255,0.1)' : '1px solid rgba(0,0,0,0.05)',
    marginTop: '4px',
    overflowX: 'hidden',
    zIndex: 9999
  }),
  option: (base: any, state: any) => ({
    ...base,
    backgroundColor: state.isSelected 
      ? (isDarkMode ? 'rgba(99, 102, 241, 0.2)' : 'rgba(99, 102, 241, 0.1)')
      : state.isFocused 
        ? (isDarkMode ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.02)') 
        : 'transparent',
    color: state.isSelected ? '#6366f1' : (isDarkMode ? '#cbd5e1' : '#334155'),
    cursor: 'pointer',
    padding: '6px 12px',
    margin: '1px 8px',
    borderRadius: '8px',
    width: 'calc(100% - 16px)',
    fontSize: '11px',
    fontWeight: '700',
    '&:active': {
      backgroundColor: 'rgba(99, 102, 241, 0.3)'
    }
  }),
  singleValue: (base: any) => ({
    ...base,
    color: isDarkMode ? 'white' : '#1e293b',
    fontWeight: '800',
    fontSize: '11px',
    margin: 0,
    padding: 0,
  }),
  placeholder: (base: any) => ({
    ...base,
    color: isDarkMode ? 'rgba(255,255,255,0.4)' : '#94a3b8',
    fontSize: '11px',
    fontWeight: '700'
  }),
  input: (base: any) => ({
    ...base,
    color: isDarkMode ? 'white' : '#1e293b',
    margin: 0,
    padding: 0,
    fontSize: '11px',
  }),
  indicatorSeparator: () => ({ display: 'none' }),
  dropdownIndicator: (base: any) => ({
    ...base,
    color: isDarkMode ? '#64748b' : '#94a3b8',
    padding: '0 8px',
    '&:hover': { color: '#6366f1' }
  }),
  clearIndicator: (base: any) => ({
    ...base,
    color: isDarkMode ? '#64748b' : '#94a3b8',
    padding: '0 4px',
    '&:hover': { color: '#ef4444' }
  }),
  indicatorsContainer: (base: any) => ({
    ...base,
    height: '34px',
  }),
  valueContainer: (base: any) => ({
    ...base,
    padding: '0 4px',
    display: 'flex',
    alignItems: 'center',
    flexWrap: 'nowrap',
  }),
  menuList: (base: any) => ({
    ...base,
    maxHeight: '350px',
    padding: 0,
  })
});

const CustomSelect = ({ label, value, options, onChange, placeholder = "เลือก..." }: any) => {
  const isDarkMode = document.documentElement.classList.contains('dark');
  const selectedOption = options.find((opt: any) => opt.value === value);

  return (
    <div className="flex flex-col gap-1.5 w-full">
      {label && <label className="text-[10px] font-black text-gray-400 uppercase tracking-wider ml-1">{label}</label>}
      <Select
        value={selectedOption}
        onChange={(opt: any) => onChange(opt?.value)}
        options={options}
        placeholder={placeholder}
        isSearchable={false}
        styles={selectStyles(isDarkMode)}
      />
    </div>
  );
};

const SubstituteTeacherSelect = ({ value, options, onChange, placeholder = "--- เลือกครูสอนแทน ---" }: any) => {
  const isDarkMode = document.documentElement.classList.contains('dark');
  const [isFocused, setIsFocused] = useState(false);
  const selectedOption = options.find((option: any) => option.value === value);
  const getTeacherDisplayName = (option: any) => (
    option.displayName ||
    option.name ||
    option.label?.replace(/^\[.*?\]\s*/, '') ||
    ''
  );

  return (
    <div className="relative group w-full">
      <div className="absolute left-3 top-1/2 -translate-y-1/2 z-10 text-slate-400 pointer-events-none group-focus-within:text-indigo-500 transition-colors">
        <Search size={14} />
      </div>
      <Select
        value={selectedOption}
        onChange={(opt: any) => onChange(opt?.value)}
        options={options}
        placeholder={isFocused ? "" : placeholder}
        onFocus={() => setIsFocused(true)}
        onBlur={() => setIsFocused(false)}
        isSearchable
        isClearable
        menuPortalTarget={document.body}
        styles={{
          ...selectStyles(isDarkMode),
          control: (base: any, state: any) => ({
            ...selectStyles(isDarkMode).control(base, state),
            minHeight: '36px',
            height: '36px',
            borderRadius: '12px',
            paddingLeft: '28px',
            paddingRight: '2px',
            backgroundColor: isDarkMode ? 'rgba(15, 23, 42, 0.72)' : '#ffffff',
            borderColor: state.isFocused ? '#4f46e5' : (isDarkMode ? 'rgba(148, 163, 184, 0.22)' : '#d8dee8'),
            boxShadow: 'none',
            '&:hover': {
              borderColor: state.isFocused ? '#4f46e5' : (isDarkMode ? 'rgba(148, 163, 184, 0.36)' : '#b7c0ce'),
            }
          }),
          valueContainer: (base: any) => ({
            ...base,
            height: '34px',
            padding: '0 4px',
            overflow: 'hidden',
            alignItems: 'center',
            flexWrap: 'nowrap',
          }),
          indicatorsContainer: (base: any) => ({
            ...base,
            height: '34px',
          }),
          singleValue: (base: any) => ({
            ...base,
            width: '100%',
            maxWidth: '100%',
            margin: 0,
            overflow: 'visible',
          }),
          input: (base: any) => ({
            ...base,
            color: isDarkMode ? 'white' : '#1e293b',
            fontSize: '11px',
            fontWeight: 700,
          }),
          placeholder: (base: any) => ({
            ...base,
            color: isDarkMode ? 'rgba(203, 213, 225, 0.58)' : '#64748b',
            fontSize: '11px',
            fontWeight: 800,
          }),
          option: (base: any, state: any) => ({
            ...selectStyles(isDarkMode).option(base, state),
            padding: '4px 12px',
            margin: '1px 8px',
            borderRadius: '8px',
          }),
          menu: (base: any) => ({
            ...selectStyles(isDarkMode).menu(base),
            borderRadius: '14px',
          })
        }}
        className="react-select-container"
        classNamePrefix="react-select"
        formatOptionLabel={(option: any, { context }: any) => {
          const displayName = getTeacherDisplayName(option);
          const initials = option.firstName && option.lastName
            ? `${option.firstName.charAt(0)}${option.lastName.charAt(0)}`
            : displayName.replace(/^(พระสามเณร|พระมหา|พระครู|พระใบฎีกา|หลวงพ่อ|พระอาจารย์|พระ|สามเณร|นาย|นางสาว|นาง|ครู|ผอ\.|ดร\.|ว่าที่\s*ร\.ต\.)\s*/, '').substring(0, 1);

          return (
            <div className="flex w-full min-w-0 items-center gap-3 py-1">
              <div className="relative flex-shrink-0">
                <div className="h-6 w-6 overflow-hidden rounded-full bg-slate-100 text-slate-500 ring-1 ring-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:ring-slate-700 flex items-center justify-center text-[8px] font-black shadow-sm">
                  {option.profileImageUrl ? (
                    <img src={option.profileImageUrl} alt="" className="h-full w-full object-cover" />
                  ) : (
                    <span className="uppercase">{initials}</span>
                  )}
                </div>
                <div className="absolute -bottom-0.5 -right-0.5 h-2 w-2 rounded-full border border-white bg-emerald-500 dark:border-slate-900"></div>
              </div>

              <div className="flex min-w-0 flex-1 items-center gap-2 text-left">
                <span className="shrink-0 rounded-md border border-indigo-200 bg-indigo-50 px-1.5 py-0.5 text-[8px] font-black leading-none text-indigo-700 dark:border-indigo-500/30 dark:bg-indigo-500/10 dark:text-indigo-300">
                  {option.teacherId || 'N/A'}
                </span>
                <span className={`min-w-0 truncate font-extrabold text-slate-800 dark:text-slate-100 ${context === 'value' ? 'text-[11px]' : 'text-[11px]'}`}>
                  {displayName}
                </span>
              </div>
            </div>
          );
        }}
      />
    </div>
  );
};

const SubstituteManagementPage: React.FC = () => {
  const [leaveRequests, setLeaveRequests] = useState<LeaveRequest[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedLeave, setSelectedLeave] = useState<LeaveRequest | null>(null);
  const [schedules, setSchedules] = useState<ScheduleEntry[]>([]);
  const [allClassSchedules, setAllClassSchedules] = useState<any[]>([]); // 📌 State ใหม่สำหรับเก็บตารางสอนทั้งหมด
  const [isScheduleLoading, setIsScheduleLoading] = useState(false);
  const [hasAutoAssigned, setHasAutoAssigned] = useState(false);
  const [calendarEvents, setCalendarEvents] = useState<Record<string, any>>({});
  const [periodSettings, setPeriodSettings] = useState<PeriodSetting[]>([]);
  const [roomMap, setRoomMap] = useState<Record<string, string>>({}); // 📌 สำหรับเก็บข้อมูลห้องเรียน
  const [dayPortion, setDayPortion] = useState<'full' | 'morning' | 'afternoon'>('full'); // ช่วงเวลาที่กำลังจัดสอนแทนอยู่ (ของ selectedLeave)
  const lunchIdx = useMemo(() => periodSettings.findIndex(p => p.id === 'lunch'), [periodSettings]);
  const canFilterByPortion = lunchIdx >= 0; // ต้องมีคาบ 'lunch' ตั้งค่าไว้ ถึงจะรู้ว่าคาบไหนเป็นเช้า/บ่าย
  const currentUser = useSelector((state: RootState) => state.auth.user);
  const { teachers: teacherMap, status: teacherMapStatus } = useSelector((state: RootState) => state.userMap);
  const calendarState = useSelector((state: RootState) => state.calendar);
  const calendarRawData = calendarState.rawData;
  const teachers = useMemo(() => getActiveSortedTeachers(Object.values(teacherMap || {}))
    .filter((t: any) => !EXCLUDED_POSITIONS.some(pos => (t.position || '').startsWith(pos)))
    .map((t: any) => ({
      value: t.id,
      label: `[${t.teacherId || 'N/A'}] ${t.name}`,
      teacherId: t.teacherId || 'N/A',
      profileImageUrl: t.profileImageUrl || t.profileImage || '',
      firstName: t.firstName || '',
      lastName: t.lastName || '',
      uid: t.uid || '',
      learningArea: t.learningArea || '',
      homeroomGrade: t.homeroomGrade || '',
      preferences: t.preferences || {}
    })), [teacherMap]);
  // Map of dateKey → Set<teacherDocId> for ALL absent teachers across all leave requests.
  // Used to cross-filter the substitute picker so absent teachers are never selectable.
  const absentTeacherIdsByDate = useMemo(() => {
    const map = new Map<string, Set<string>>();
    leaveRequests.forEach(lr => {
      try {
        const startMs = (lr.startDate as any)?.toDate ? (lr.startDate as any).toDate().getTime() : new Date(lr.startDate as any).getTime();
        const endMs = (lr.endDate as any)?.toDate ? (lr.endDate as any).toDate().getTime() : new Date(lr.endDate as any).getTime();
        let cur = new Date(startMs);
        cur.setHours(0, 0, 0, 0);
        const endDay = new Date(endMs);
        endDay.setHours(0, 0, 0, 0);
        while (cur <= endDay) {
          const dk = formatDateKey(cur);
          if (!map.has(dk)) map.set(dk, new Set());
          map.get(dk)!.add(lr.teacherDocId);
          cur.setDate(cur.getDate() + 1);
        }
      } catch {}
    });
    return map;
  }, [leaveRequests]);

  const schoolId = (currentUser as any)?.schoolId;
  const [searchParams, setSearchParams] = useSearchParams();
  const filter = searchParams.get('filter') || 'current'; // 'current', 'upcoming', 'past'
  const [filterLearningArea, setFilterLearningArea] = useState<string>('all');
  const [filterGrade, setFilterGrade] = useState<string>('all');
  const [filterLoadDay, setFilterLoadDay] = useState<string>('all');
  const [filterLoadWeek, setFilterLoadWeek] = useState<string>('all');
  const [filterMissing, setFilterMissing] = useState<string>('all');
  const [sortCondition, setSortCondition] = useState<'recommended' | 'workload_day' | 'workload_week' | 'missing_stats'>('recommended');
  const [teacherAbsenceCounts, setTeacherAbsenceCounts] = useState<Record<string, number>>({});
  // Period conflict maps — populated when a leave is selected
  const [busyMap, setBusyMap] = useState<Record<string, Set<string>>>({});
  const [dayLoadMap, setDayLoadMap] = useState<Record<string, Record<string, number>>>({});
  const [weekLoadMap, setWeekLoadMap] = useState<Record<string, number>>({});
  // Entry IDs that the arranger has unlocked for force (unchecked) selection
  const [forceSelectEntries, setForceSelectEntries] = useState<Set<string>>(new Set());
  const [showManualAddForm, setShowManualAddForm] = useState(false);
  const [manualTeacherId, setManualTeacherId] = useState('');
  const [manualStartDate, setManualStartDate] = useState('');
  const [manualEndDate, setManualEndDate] = useState('');
  const [manualLeaveType, setManualLeaveType] = useState<'ลา' | 'ไปราชการ'>('ลา');
  const [manualDayPortion, setManualDayPortion] = useState<'full' | 'morning' | 'afternoon'>('full');
  const dispatch = useDispatch();

  const getScheduleYearTerm = (date?: Date) => {
    const targetDate = date || new Date();
    const targetDateString = formatDateKey(targetDate);
    const matchedTerm = calendarState.terms.find(term =>
      term.startDate && term.endDate && targetDateString >= term.startDate && targetDateString <= term.endDate
    );

    let semester: string;
    let academicYear: string;

    if (matchedTerm) {
      // วันที่อยู่ในภาคเรียนของปีการศึกษาปัจจุบัน
      academicYear = String(calendarState.academicYear || getCurrentThaiYear());
      const isSemester2 =
        /ที่\s*2(?!\d)/.test(matchedTerm.name) ||
        matchedTerm.id === '2' ||
        /[_\-]2$/.test(matchedTerm.id);
      semester = isSemester2 ? '2' : '1';
    } else {
      // วันที่อยู่นอกภาคเรียนปัจจุบัน — คำนวณจากวันที่จริง
      // ปีการศึกษาไทยเริ่มเดือนพฤษภาคม (5) ถึงเมษายน (4) ของปีถัดไป
      const buddhistYear = targetDate.getFullYear() + 543;
      const month = targetDate.getMonth() + 1; // 1–12
      academicYear = String(month >= 5 ? buddhistYear : buddhistYear - 1);
      semester = month >= 5 && month <= 10 ? '1' : '2';
    }

    return { academicYear, semester };
  };

  const matchesScheduleYearTerm = (data: any, year: string, semester: string) => {
    return String(data.academicYear || '') === String(year) && String(data.semester || '') === String(semester);
  };

  const fetchScheduleDocs = async (currentSchoolId: string, year: string, semester: string, teacherId?: string) => {
    const baseConstraints = [
      where("academicYear", "==", year),
      where("semester", "==", semester),
    ];
    const schedulesRef = collection(firestore, "school-settings", currentSchoolId, "schedules");
    const scheduleQuery = teacherId
      ? query(schedulesRef, where("teacherId", "==", teacherId), ...baseConstraints)
      : query(schedulesRef, ...baseConstraints);
    const scheduleSnapshot = await getDocs(scheduleQuery);
    return scheduleSnapshot.docs.map(scheduleDoc => ({ id: scheduleDoc.id, ...scheduleDoc.data() }));
  };

  useEffect(() => {
    if (schoolId) {
      fetchLeaveRequests();
      if (teacherMapStatus === 'idle') {
        dispatch(fetchTeachersMap(schoolId) as any);
      }
      fetchAllSchedules(schoolId);
      fetchPeriodSettings(schoolId);
      fetchPhysicalRooms(schoolId);
      fetchTeacherAbsenceCounts(schoolId);
      dispatch(fetchCalendar(schoolId) as any);
    }
  }, [filter, schoolId, dispatch, teacherMapStatus, calendarState.academicYear, calendarRawData?.currentTerm]);

  const fetchPeriodSettings = async (currentSchoolId: string) => {
    try {
      const docRef = doc(firestore, 'school-settings', currentSchoolId, 'configs', 'schedule_settings');
      const docSnap = await getDoc(docRef);
      if (docSnap.exists()) {
        const data = docSnap.data();
        if (data.periods) {
          setPeriodSettings(data.periods);
        }
      } else {
        const defaultPeriods: PeriodSetting[] = [{ id: 'homeroom', label: 'โฮมรูม', startTime: '08:30', endTime: '08:40', isTeachingPeriod: false }, { id: 'period-1', label: 'คาบที่ 1', startTime: '08:40', endTime: '09:30', isTeachingPeriod: true }, { id: 'period-2', label: 'คาบที่ 2', startTime: '09:30', endTime: '10:20', isTeachingPeriod: true }, { id: 'period-3', label: 'คาบที่ 3', startTime: '10:20', endTime: '11:10', isTeachingPeriod: true }, { id: 'period-4', label: 'คาบที่ 4', startTime: '11:10', endTime: '12:00', isTeachingPeriod: true }, { id: 'lunch', label: 'พักกลางวัน', startTime: '12:00', endTime: '13:00', isTeachingPeriod: false }, { id: 'period-5', label: 'คาบที่ 5', startTime: '13:00', endTime: '13:50', isTeachingPeriod: true }, { id: 'period-6', label: 'คาบที่ 6', startTime: '13:50', endTime: '14:40', isTeachingPeriod: true }, { id: 'period-7', label: 'คาบที่ 7', startTime: '14:40', endTime: '15:30', isTeachingPeriod: true }, { id: 'period-8', label: 'คาบที่ 8', startTime: '15:30', endTime: '16:00', isTeachingPeriod: true }];
        setPeriodSettings(defaultPeriods);
      }
    } catch (error) {
      console.error("Error fetching period settings: ", error);
    }
  };

  const fetchPhysicalRooms = async (currentSchoolId: string) => {
    try {
      const q = query(collection(firestore, 'school-settings', currentSchoolId, 'physical-rooms'));
      const snap = await getDocs(q);
      const map: Record<string, string> = {};
      snap.forEach(doc => {
        const data = doc.data();
        map[doc.id] = data.roomCode || data.roomName || doc.id;
      });
      setRoomMap(map);
    } catch (error) {
      console.error("Error fetching physical rooms:", error);
    }
  };

  const fetchTeacherAbsenceCounts = async (currentSchoolId: string) => {
    const year = String(calendarState.academicYear || '');
    try {
      const subsRef = collection(firestore, 'school-settings', currentSchoolId, 'substitutions');
      const snap = await getDocs(
        year ? query(subsRef, where('academicYear', '==', year)) : subsRef
      );
      const counts: Record<string, number> = {};
      snap.forEach(subDoc => {
        const data = subDoc.data();
        if (data.originalTeacherId) {
          counts[data.originalTeacherId] = (counts[data.originalTeacherId] || 0) + 1;
        }
      });
      setTeacherAbsenceCounts(counts);
    } catch (error) {
      console.error("Error fetching teacher absence counts:", error);
    }
  };

  useEffect(() => {
    if (calendarRawData.events) {
      setCalendarEvents(calendarRawData.events);
    } else if (schoolId) {
      // Fallback: Fetch from Google Calendar API if Redux is empty/missing
      const apiKey = import.meta.env.VITE_GOOGLE_CALENDAR_API_KEY;
      if (apiKey) {
        fetchGoogleCalendar(apiKey);
      }
    }
  }, [calendarRawData, schoolId]);

  const fetchGoogleCalendar = async (apiKey: string) => {
    try {
      const year = new Date().getFullYear();
      const calendarId = 'th.th#holiday@group.v.calendar.google.com';
      const timeMin = `${year}-01-01T00:00:00Z`;
      const timeMax = `${year}-12-31T23:59:59Z`;

      const response = await fetch(
        `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events?key=${apiKey}&timeMin=${timeMin}&timeMax=${timeMax}&singleEvents=true&orderBy=startTime`
      );

      if (response.ok) {
        const data = await response.json();
        const apiEvents: Record<string, any> = {};
        data.items?.forEach((item: any) => {
          if (item.start?.date && !isNonOfficialHoliday(item.summary)) {
            apiEvents[item.start.date] = { type: 'holiday', description: item.summary };
          }
        });
        setCalendarEvents(prev => ({ ...prev, ...apiEvents }));
      }
    } catch (error) {
      console.error("Error fetching Google Calendar API:", error);
    }
  };

  const fetchLeaveRequests = async () => {
    if (!schoolId) return;
    setIsLoading(true);
    setSelectedLeave(null); // 📌 Reset selection when filter changes
    setSchedules([]);
    try {
      const now = Timestamp.now();
      const nowMillis = now.toMillis();

      // 📌 วิธีใหม่: ดึงข้อมูลแบบ Iteration เพื่อเลี่ยงปัญหา Index
      const teachersRef = collection(firestore, 'school-settings', schoolId, 'teachers');
      const teachersSnap = await getDocs(teachersRef);

      const promises = teachersSnap.docs.map(async (teacherDoc) => {
        // Fetch Leave Requests
        const leavesRef = collection(firestore, 'school-settings', schoolId, 'teachers', teacherDoc.id, 'leave_summary');
        const leavesSnap = await getDocs(leavesRef);
        const leavesData = leavesSnap.docs.map(doc => ({ id: doc.id, teacherDocId: teacherDoc.id, collection: 'leave_summary', ...doc.data() } as any));

        // Fetch Official Travel Requests
        const travelsRef = collection(firestore, 'school-settings', schoolId, 'teachers', teacherDoc.id, 'travel_summary');
        const travelsSnap = await getDocs(travelsRef);
        const travelsData = travelsSnap.docs.map(doc => ({ id: doc.id, teacherDocId: teacherDoc.id, collection: 'travel_summary', ...doc.data() } as any));

        return [...leavesData, ...travelsData];
      });

      const results = await Promise.all(promises);

      // ดึง manual substitute requests (เพิ่มด้วยตนเอง ไม่มีใบลา)
      const manualSnap = await getDocs(collection(firestore, 'school-settings', schoolId, 'manual_substitute_requests'));
      const manualLeaves = manualSnap.docs.map(d => ({
        ...d.data(),
        id: d.id,
        collection: undefined,
        isManual: true,
        requiresSubstitute: true,
      } as any));

      const allLeaves = [...results.flat(), ...manualLeaves];

      // 📌 กรองข้อมูลใน Memory (Client-side filtering)
      const filteredDocs = allLeaves.filter(data => {
        // กรองเงื่อนไขพื้นฐาน
        if (data.requiresSubstitute !== true || !["pending", "approved", "substitution_assigned"].includes(data.status)) {
          return false;
        }

        const startDateObj = data.startDate.toDate ? data.startDate.toDate() : new Date(data.startDate);
        const endDateObj = data.endDate.toDate ? data.endDate.toDate() : new Date(data.endDate);

        const startDay = new Date(startDateObj.getFullYear(), startDateObj.getMonth(), startDateObj.getDate()).getTime();
        const endDay = new Date(endDateObj.getFullYear(), endDateObj.getMonth(), endDateObj.getDate(), 23, 59, 59, 999).getTime();

        if (filter === 'upcoming') {
          return startDay > nowMillis;
        } else if (filter === 'past') {
          return endDay < nowMillis;
        } else { // current
          return nowMillis >= startDay && nowMillis <= endDay;
        }
      });

      const requests: LeaveRequest[] = filteredDocs.map((data) => {
        const safeFormatDate = (d: any) => {
          if (!d) return "ไม่ระบุวันที่";
          try {
            const dateObj = d.toDate ? d.toDate() : new Date(d);
            if (isNaN(dateObj.getTime())) return "วันที่ไม่ถูกต้อง";
            return dateObj.toLocaleDateString("th-TH", { day: 'numeric', month: 'short', year: 'numeric' });
          } catch (e) {
            return "วันที่ไม่ถูกต้อง";
          }
        };

        return {
          id: data.id,
          teacherName: data.teacherName || data.requesterName || "ไม่ระบุชื่อ",
          teacherDocId: data.teacherDocId,
          startDate: data.startDate,
          endDate: data.endDate,
          startDateString: safeFormatDate(data.startDate),
          endDateString: safeFormatDate(data.endDate),
          status: data.status,
          approvedBy: data.approvedBy || null,
          leaveType: data.leaveType || (data.collection === 'travel_summary' ? 'ไปราชการ' : 'ลา'),
          reason: data.reason,
          collection: data.collection,
          isManual: data.isManual || false,
          dayPortion: data.dayPortion || 'full',
          substituteStatus: data.status === "substitution_assigned" ? "completed" : "pending",
        } as any;
      });

      // เรียงลำดับ
      if (filter === 'upcoming') {
        requests.sort((a, b) => a.startDate.toMillis() - b.startDate.toMillis()); // เร็วๆนี้ขึ้นก่อน
      } else {
        requests.sort((a, b) => b.startDate.toMillis() - a.startDate.toMillis()); // ล่าสุดขึ้นก่อน
      }

      // Dedup: ถ้าครูคนเดียวมีทั้งรายการจากระบบ (leave/travel) และ "ด้วยตนเอง" ในช่วงวันที่ทับซ้อนกัน
      // ให้แสดงเพียงรายการเดียว โดยใช้สถานะที่จัดสอนแทนเสร็จแล้ว (ไม่ต้องจัดซ้ำ)
      const toDateOnlyMs = (d: any): number => {
        const dt = d?.toDate ? d.toDate() : new Date(d);
        return new Date(dt.getFullYear(), dt.getMonth(), dt.getDate()).getTime();
      };
      const dedupedRequests: LeaveRequest[] = [];
      for (const req of requests) {
        const reqStart = toDateOnlyMs(req.startDate);
        const reqEnd = toDateOnlyMs(req.endDate);
        const overlapIdx = dedupedRequests.findIndex(ex => {
          if (ex.teacherDocId !== req.teacherDocId) return false;
          const exStart = toDateOnlyMs(ex.startDate);
          const exEnd = toDateOnlyMs(ex.endDate);
          return reqStart <= exEnd && exStart <= reqEnd; // มีช่วงวันที่ทับซ้อนกัน
        });
        if (overlapIdx !== -1) {
          // มีรายการที่ซ้อนทับอยู่แล้ว — รวม status และเลือกรายการที่ดีกว่า
          const existing = dedupedRequests[overlapIdx];
          const eitherAssigned = req.status === 'substitution_assigned' || existing.status === 'substitution_assigned';
          const mergedStatus = eitherAssigned ? 'substitution_assigned' : (existing.status || req.status);
          const mergedSubStatus: 'completed' | 'pending' = eitherAssigned ? 'completed' : 'pending';
          // เลือกรายการที่มาจากระบบ (ไม่ใช่ด้วยตนเอง) เป็น base; ถ้าทั้งคู่เป็น/ไม่เป็น manual → เลือกอันที่จัดเสร็จแล้ว
          let keepBase: LeaveRequest;
          if (!existing.isManual && req.isManual) keepBase = existing;
          else if (existing.isManual && !req.isManual) keepBase = req;
          else if (existing.substituteStatus === 'completed') keepBase = existing;
          else keepBase = req;
          dedupedRequests[overlapIdx] = { ...keepBase, status: mergedStatus, substituteStatus: mergedSubStatus };
        } else {
          dedupedRequests.push(req);
        }
      }

      // ตรวจสอบ substitutions ที่มีอยู่ในฐานข้อมูลเพื่อแสดงไอคอน ✓ ที่ถูกต้องตั้งแต่โหลดหน้า
      // (กรณีข้อมูลเก่าที่สถานะ leave doc ยังไม่ถูก update หรือ manual entry ที่จัดแล้วแต่ยังไม่ได้คลิก)
      const subsCheckSnap = await getDocs(collection(firestore, 'school-settings', schoolId, 'substitutions'));
      const teacherSubDays = new Map<string, Set<string>>();
      subsCheckSnap.docs.forEach(sd => {
        const d = sd.data();
        if (!d.originalTeacherId || !d.date) return;
        const dt: Date = d.date?.toDate ? d.date.toDate() : new Date(d.date.seconds * 1000);
        const dk = `${dt.getFullYear()}-${String(dt.getMonth()+1).padStart(2,'0')}-${String(dt.getDate()).padStart(2,'0')}`;
        if (!teacherSubDays.has(d.originalTeacherId)) teacherSubDays.set(d.originalTeacherId, new Set());
        teacherSubDays.get(d.originalTeacherId)!.add(dk);
      });
      for (const req of dedupedRequests) {
        if (req.substituteStatus === 'completed') continue;
        const subDays = teacherSubDays.get(req.teacherDocId);
        if (!subDays) continue;
        const rStart = toDateOnlyMs(req.startDate);
        const rEnd = toDateOnlyMs(req.endDate);
        for (let ms = rStart; ms <= rEnd; ms += 86400000) {
          const d = new Date(ms);
          if (d.getDay() === 0 || d.getDay() === 6) continue; // ข้ามเสาร์-อาทิตย์
          const dk = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
          if (subDays.has(dk)) {
            req.substituteStatus = 'completed';
            req.status = 'substitution_assigned';
            break;
          }
        }
      }

      setLeaveRequests(dedupedRequests);
    } catch (error) {
      console.error("Error fetching leave requests:", error);
      Swal.fire("Error", "ไม่สามารถโหลดข้อมูลการลาได้", "error");
    } finally {
      setIsLoading(false);
    }
  };

  // 📌 ฟังก์ชันใหม่: ดึงตารางสอนของทุกห้องเรียนมาเก็บไว้
  const fetchAllSchedules = async (currentSchoolId: string) => {
    try {
      const { academicYear, semester } = getScheduleYearTerm();
      const allSchedulesData = await fetchScheduleDocs(currentSchoolId, academicYear, semester);
      setAllClassSchedules(allSchedulesData);
    } catch (error) {
      console.error("Error fetching all schedules:", error);
      // อาจจะแสดง alert หรือไม่ก็ได้ แล้วแต่การออกแบบ
    }
  };

  const checkIsHoliday = (dateStr: string) => {
    if (!dateStr) return { isHoliday: false, description: '' };
    const event = calendarEvents[dateStr];
    const d = new Date(dateStr);
    const dayOfWeek = d.getUTCDay();

    // Check weekend
    if (dayOfWeek === 0 || dayOfWeek === 6) {
      // Check if it's a schoolDay override
      if (event?.type === 'schoolDay') return { isHoliday: false, description: event.description || 'วันเรียนชดเชย' };
      // If it's a holiday event on weekend, it's still a holiday
      if (event?.type === 'holiday') return { isHoliday: true, description: event.description || 'วันหยุดราชการ' };
      if (event?.type === 'specialHoliday') return { isHoliday: true, description: event.description || 'วันหยุดกรณีพิเศษ' };

      return { isHoliday: true, description: 'วันหยุดเสาร์-อาทิตย์' };
    }

    // Check calendar events for weekdays
    if (event) {
      if (event.type === 'holiday') return { isHoliday: true, description: event.description || 'วันหยุดราชการ' };
      if (event.type === 'specialHoliday') return { isHoliday: true, description: event.description || 'วันหยุดกรณีพิเศษ' };
      if (event.type === 'schoolDay') return { isHoliday: false, description: event.description || 'วันเรียนชดเชย/กิจกรรม' };
    }

    return { isHoliday: false, description: '' };
  };

  const getEffectiveScheduleDay = (date: Date) => {
    const dateString = formatDateKey(date);
    const event = calendarEvents[dateString];
    const actualDayKey = DAY_KEYS[date.getDay()];

    if (event?.type === 'schoolDay' && event.scheduleDay && DAY_KEYS.includes(event.scheduleDay)) {
      return {
        actualDayKey,
        scheduleDayKey: event.scheduleDay,
        actualDayName: THAI_DAYS[date.getDay()],
        scheduleDayName: THAI_DAY_BY_KEY[event.scheduleDay] || THAI_DAYS[date.getDay()],
        description: event.description || 'สอนชดเชย',
        isMakeupDay: event.scheduleDay !== actualDayKey,
      };
    }

    return {
      actualDayKey,
      scheduleDayKey: actualDayKey,
      actualDayName: THAI_DAYS[date.getDay()],
      scheduleDayName: THAI_DAYS[date.getDay()],
      description: event?.description || '',
      isMakeupDay: false,
    };
  };

  const toSafeDate = (d: any): Date => {
    if (!d) return new Date();
    if (d.toDate && typeof d.toDate === 'function') return d.toDate();
    return new Date(d);
  };

  const formatClassName = (classId: any): string => {
    const classNames: { [key: string]: string } = {
      k1: 'อ.1', k2: 'อ.2', k3: 'อ.3',
      p1: 'ป.1', p2: 'ป.2', p3: 'ป.3', p4: 'ป.4', p5: 'ป.5', p6: 'ป.6',
      m1: 'ม.1', m2: 'ม.2', m3: 'ม.3', m4: 'ม.4', m5: 'ม.5', m6: 'ม.6'
    };

    const ids = Array.isArray(classId) ? classId : [classId].filter(Boolean);
    return ids.map((id: string) => {
      const [lvl, rm] = String(id).split('/');
      return classNames[lvl] ? `${classNames[lvl]}${rm ? `/${rm}` : ''}` : String(id);
    }).join(', ');
  };

  const handleSelectLeave = async (leave: LeaveRequest, portionOverride?: 'full' | 'morning' | 'afternoon') => {
    // ช่วงเวลาที่จะจัดสอนแทน: ใช้ค่าที่ผู้ใช้เพิ่งเลือก > ค่าที่บันทึกไว้กับใบลานี้ (เช่น รายการเพิ่มด้วยตนเอง) > เต็มวัน
    const portion = portionOverride ?? (leave.dayPortion || 'full');
    setDayPortion(portion);
    setSelectedLeave(leave);
    setSchedules([]);
    setForceSelectEntries(new Set());
    setHasAutoAssigned(false);
    setIsScheduleLoading(true);
    if (!schoolId) {
      setIsScheduleLoading(false);
      return;
    }

    try {
      const allSchedules: ScheduleEntry[] = [];

      // 2. วนลูปตามช่วงวันที่ลา
      const leaveStartDate = toSafeDate(leave.startDate);
      const leaveEndDate = toSafeDate(leave.endDate);
      const { academicYear, semester } = getScheduleYearTerm(leaveStartDate);

      // 1. ดึงตารางสอนรายครูของปี/เทอมเดียวกับวันที่ลา
      const teacherScheduleDocs = await fetchScheduleDocs(schoolId, academicYear, semester, leave.teacherDocId);
      const termScheduleDocs = allClassSchedules.some((item: any) => matchesScheduleYearTerm(item, academicYear, semester))
        ? allClassSchedules.filter((item: any) => matchesScheduleYearTerm(item, academicYear, semester))
        : await fetchScheduleDocs(schoolId, academicYear, semester);
      if (!allClassSchedules.some((item: any) => matchesScheduleYearTerm(item, academicYear, semester))) {
        setAllClassSchedules(termScheduleDocs);
      }

      // 2.1 ดึงข้อมูลการสอนแทนที่บันทึกไว้แล้ว
      // Query ทั้ง 2 แบบเพื่อรองรับ record เก่า (leaveRequestId) และ record ใหม่ (deterministic ID)
      const existingSubstitutions = new Map<string, any>();
      const addToExistingMap = (subDoc: any) => {
        const subData = subDoc.data();
        const subDateObj = toSafeDate(subData.date);
        const dateString = formatDateKey(subDateObj);
        const key = `${dateString}-${normalizeTeachingPeriod(subData.period)}`;
        // ให้ leaveRequestId ตรงกันมี priority สูงกว่า (เขียนทับ fallback)
        if (!existingSubstitutions.has(key) || subData.leaveRequestId === leave.id) {
          existingSubstitutions.set(key, { id: subDoc.id, ...subData });
        }
      };
      // Fallback: ดึงตาม originalTeacherId + กรอง date ฝั่ง client (จับ record เก่าที่ leaveRequestId ต่างกัน)
      const byTeacherSnap = await getDocs(query(
        collection(firestore, "school-settings", schoolId, "substitutions"),
        where("originalTeacherId", "==", leave.teacherDocId)
      ));
      byTeacherSnap.forEach(subDoc => {
        const subData = subDoc.data();
        const subDateObj = toSafeDate(subData.date);
        const dk = formatDateKey(subDateObj);
        if (dk >= formatDateKey(leaveStartDate) && dk <= formatDateKey(leaveEndDate)) addToExistingMap(subDoc);
      });
      // Primary: ตาม leaveRequestId (เขียนทับ fallback ถ้าตรงกัน)
      const byLeaveSnap = await getDocs(query(
        collection(firestore, "school-settings", schoolId, "substitutions"),
        where("leaveRequestId", "==", leave.id)
      ));
      byLeaveSnap.forEach(addToExistingMap);

      // ตรวจสอบว่าครูสอนร่วมแต่ละคนลา/ไปราชการอยู่หรือไม่
      // ดึงจาก Firestore โดยตรง (ไม่ใช้ leaveRequests ที่กรองตาม tab) เพื่อความแม่นยำ

      // ขั้น 1: รวบรวม co-teacher IDs ทั้งหมดจากตารางสอนของครูที่ลา
      // รองรับทั้ง teacherId (single) และ teacherIds (array จาก CourseAssignmentPage)
      const coTeacherIdSet = new Set<string>();
      teacherScheduleDocs.forEach((sd: any) => {
        Object.values(sd.schedule || {}).forEach((rawCourse: any) => {
          if (!rawCourse) return;
          (Array.isArray(rawCourse) ? rawCourse : [rawCourse]).forEach((c: any) => {
            if (typeof c === 'string') return;
            const ids = Array.isArray(c?.teacherIds) && c.teacherIds.length > 0
              ? c.teacherIds
              : (c?.teacherId ? [c.teacherId] : []);
            ids.forEach((tid: string) => { if (tid && tid !== leave.teacherDocId) coTeacherIdSet.add(tid); });
          });
        });
      });

      // ขั้น 2: สร้าง map (วันที่ → Set ของครูที่ลา/ไปราชการ)
      const comprehensiveAbsentByDate = new Map<string, Set<string>>();
      const _markAbsent = (ds: string, tid: string) => {
        if (!comprehensiveAbsentByDate.has(ds)) comprehensiveAbsentByDate.set(ds, new Set());
        comprehensiveAbsentByDate.get(ds)!.add(tid);
      };
      // ครูหลักที่กำลังลา → ลาทุกวันในช่วงที่เลือก
      {
        let _d = new Date(leaveStartDate);
        while (_d <= leaveEndDate) { _markAbsent(formatDateKey(_d), leave.teacherDocId); _d.setDate(_d.getDate() + 1); }
      }
      // ดึงการลา/ไปราชการของครูสอนร่วมจาก Firestore (fetch เฉพาะครูที่สอนร่วมเท่านั้น)
      if (coTeacherIdSet.size > 0) {
        await Promise.all([...coTeacherIdSet].map(async (ctId) => {
          try {
            const [lSnap, tSnap] = await Promise.all([
              getDocs(collection(firestore, 'school-settings', schoolId!, 'teachers', ctId, 'leave_summary')),
              getDocs(collection(firestore, 'school-settings', schoolId!, 'teachers', ctId, 'travel_summary')),
            ]);
            [...lSnap.docs, ...tSnap.docs].forEach(absDoc => {
              const absData = absDoc.data();
              if (!absData.startDate || !absData.endDate) return;
              if (!['pending', 'approved', 'substitution_assigned'].includes(absData.status || '')) return;
              const absS = toSafeDate(absData.startDate);
              const absE = toSafeDate(absData.endDate);
              const s0 = new Date(absS.getFullYear(), absS.getMonth(), absS.getDate());
              const e0 = new Date(absE.getFullYear(), absE.getMonth(), absE.getDate());
              let cur = new Date(leaveStartDate);
              while (cur <= leaveEndDate) {
                const d0 = new Date(cur.getFullYear(), cur.getMonth(), cur.getDate());
                if (d0 >= s0 && d0 <= e0) _markAbsent(formatDateKey(cur), ctId);
                cur.setDate(cur.getDate() + 1);
              }
            });
          } catch (e) {
            console.error(`[SubstituteManagement] ดึงข้อมูลการลาของครูสอนร่วม ${ctId} ไม่สำเร็จ:`, e);
          }
        }));
      }

      // Pre-compute teacher loads and busy-period map จาก termScheduleDocs ครั้งเดียว
      // Normalize ด้วย period number (1-based) เพื่อรองรับทั้ง slot format เก่า (mon-5) และใหม่ (mon-6, mon-period-5)
      const preComputedDayLoads: Record<string, Record<string, number>> = {};
      const preComputedWeekLoad: Record<string, number> = {};
      // keyed by `${dayKey}-${periodNumber}` (normalized)
      const periodBusyMap: Record<string, Set<string>> = {};
      // ป้องกัน double-count: tid-dayKey-periodNumber
      const seenTeacherPeriods = new Set<string>();

      termScheduleDocs.forEach((classScheduleDoc: any) => {
        const schedule = classScheduleDoc.schedule || {};
        Object.keys(schedule).forEach(slotKey => {
          const rawCourse = schedule[slotKey];
          if (!rawCourse) return;
          const slotDayKey = slotKey.split('-')[0];
          const resolved = resolveSlotPeriod(slotKey, slotDayKey, periodSettings);
          if (!resolved) return; // skip non-teaching periods

          const { periodNumber } = resolved;
          const normalizedKey = `${slotDayKey}-${periodNumber}`;

          const coursesArr = Array.isArray(rawCourse) ? rawCourse : [rawCourse];
          const teacherIds = new Set<string>();
          if (classScheduleDoc.teacherId) teacherIds.add(classScheduleDoc.teacherId);
          // รองรับทั้ง teacherId (single) และ teacherIds (array จาก CourseAssignmentPage)
          coursesArr.forEach((c: any) => {
            if (typeof c === 'string') return;
            if (Array.isArray(c?.teacherIds) && c.teacherIds.length > 0) {
              c.teacherIds.forEach((tid: string) => { if (tid) teacherIds.add(tid); });
            } else if (c?.teacherId) {
              teacherIds.add(c.teacherId);
            }
          });

          if (!periodBusyMap[normalizedKey]) periodBusyMap[normalizedKey] = new Set();
          teacherIds.forEach(tid => {
            periodBusyMap[normalizedKey].add(tid);
            const dedupKey = `${tid}-${normalizedKey}`;
            if (!seenTeacherPeriods.has(dedupKey)) {
              seenTeacherPeriods.add(dedupKey);
              preComputedWeekLoad[tid] = (preComputedWeekLoad[tid] || 0) + 1;
              if (!preComputedDayLoads[slotDayKey]) preComputedDayLoads[slotDayKey] = {};
              preComputedDayLoads[slotDayKey][tid] = (preComputedDayLoads[slotDayKey][tid] || 0) + 1;
            }
          });
        });
      });

      // ── Critical: augment periodBusyMap with already-saved substitute assignments in the
      // date range. This prevents double-booking the same substitute across multiple absent
      // teachers (e.g. Teacher X assigned period 3 for Teacher A must not appear as available
      // for Teacher B's period 3 when the arranger switches cards).
      try {
        const rangeStart = Timestamp.fromDate(
          new Date(leaveStartDate.getFullYear(), leaveStartDate.getMonth(), leaveStartDate.getDate())
        );
        const rangeEnd = Timestamp.fromDate(
          new Date(leaveEndDate.getFullYear(), leaveEndDate.getMonth(), leaveEndDate.getDate(), 23, 59, 59)
        );
        const savedSubsSnap = await getDocs(query(
          collection(firestore, "school-settings", schoolId, "substitutions"),
          where("date", ">=", rangeStart),
          where("date", "<=", rangeEnd)
        ));
        savedSubsSnap.forEach(subDoc => {
          const subData = subDoc.data();
          if (!subData.substituteTeacherId || !subData.period) return;
          const subDate = toSafeDate(subData.date);
          const subDayKey = getEffectiveScheduleDay(subDate).scheduleDayKey;
          const nKey = `${subDayKey}-${subData.period}`;
          if (!periodBusyMap[nKey]) periodBusyMap[nKey] = new Set();
          periodBusyMap[nKey].add(subData.substituteTeacherId);
        });
      } catch (e) {
        console.warn('[SubstituteManagement] โหลด substitutions สำหรับตรวจคาบชนไม่สำเร็จ:', e);
      }

      // Snapshot computed maps into state so the dynamic teacher lookup can read them after render
      setBusyMap({ ...periodBusyMap });
      setDayLoadMap({ ...preComputedDayLoads });
      setWeekLoadMap({ ...preComputedWeekLoad });

      let currentDate = new Date(leaveStartDate);
      while (currentDate <= leaveEndDate) {
        const dateString = formatDateKey(currentDate);

        // 📌 ตรวจสอบวันหยุด ถ้าเป็นวันหยุดให้ข้ามไป
        const { isHoliday } = checkIsHoliday(dateString);
        if (isHoliday) {
          currentDate.setDate(currentDate.getDate() + 1);
          continue;
        }

        const effectiveDay = getEffectiveScheduleDay(currentDate);
        const dayKey = effectiveDay.scheduleDayKey;

        // 3. ตรวจสอบตารางสอนในแต่ละวัน
        teacherScheduleDocs.forEach((scheduleData: any) => {
          const classSchedule = scheduleData.schedule;

          for (const slot in classSchedule) {
            if (slot.startsWith(dayKey) && classSchedule[slot]) {
              // Resolve period using robust multi-format helper (handles 'mon-6', 'mon-period-5', 'mon-5')
              const resolved = resolveSlotPeriod(slot, dayKey, periodSettings);
              if (!resolved) continue; // skip homeroom, lunch, and unknown slots

              const { periodNumber, pIdx, setting } = resolved;

              // กรองตามช่วงเวลาที่เลือก (เต็มวัน/เช้า/บ่าย) โดยใช้ตำแหน่งคาบ 'lunch' เป็นจุดแบ่ง
              if (portion !== 'full' && lunchIdx >= 0 && pIdx >= 0) {
                const isMorningPeriod = pIdx < lunchIdx;
                if (portion === 'morning' && !isMorningPeriod) continue;
                if (portion === 'afternoon' && isMorningPeriod) continue;
              }

              const substitutionKey = `${dateString}-${periodNumber}`;
              const existingSub = existingSubstitutions.get(substitutionKey);

              const rawCourse = classSchedule[slot];
              const coursesArray = Array.isArray(rawCourse) ? rawCourse : [rawCourse];
              const coursesForTeacher = coursesArray.filter((course: any) => !course?.teacherId || course.teacherId === leave.teacherDocId);

              // ตรวจสอบการสอนร่วม: ครูคนอื่นในคาบเดียวกัน
              // รองรับทั้ง teacherId (single) และ teacherIds (array จาก CourseAssignmentPage) พร้อมรักษาลำดับ
              const absentOnDate = comprehensiveAbsentByDate.get(dateString) ?? new Set<string>([leave.teacherDocId]);
              const otherTeacherIds = [...new Set(
                coursesArray.flatMap((c: any) => {
                  if (typeof c === 'string') return [];
                  if (Array.isArray(c?.teacherIds) && c.teacherIds.length > 0) {
                    return c.teacherIds.filter((tid: string) => tid && tid !== leave.teacherDocId);
                  }
                  return c?.teacherId && c.teacherId !== leave.teacherDocId ? [c.teacherId] : [];
                })
              )] as string[];
              // presentCoTeacherId เลือกตามลำดับ: ครูคนที่ 1 → 2 → 3 (เฉพาะที่ไม่ลา/ไปราชการ)
              const isCoTeaching = otherTeacherIds.length > 0;
              // หาครูที่ยังอยู่ตามลำดับในอาร์เรย์ (คนหลักก่อน รองลงมา)
              const presentCoTeacherId = isCoTeaching
                ? otherTeacherIds.find(tid => !absentOnDate.has(tid))
                : undefined;
              const allCoTeachersAbsent = isCoTeaching && !presentCoTeacherId;
              const autoHandledByTeacherId = presentCoTeacherId;
              const autoHandledByTeacherName = presentCoTeacherId
                ? ((teacherMap[presentCoTeacherId] as any)?.name ||
                   teachers.find(t => t.value === presentCoTeacherId)?.label?.replace(/^\[.*?\]\s*/, '') || '')
                : undefined;

              coursesForTeacher.forEach((course: any, courseIndex: number) => {
                const subjectNameDisplay = !course || typeof course === 'string' ? "ไม่ระบุวิชา" : (course?.title || course?.subjectName || "ไม่ระบุวิชา");
                const subjectCodeDisplay = !course || typeof course === 'string' ? "" : (course?.code || course?.subjectCode || "");

                // สร้าง ID ที่ไม่ซ้ำกันสำหรับแต่ละคาบที่ต้องสอนแทน
                const courseKey = typeof course === 'string' ? courseIndex : (course?.instanceId || course?.id || courseIndex);
                const uniqueScheduleId = `${scheduleData.id}-${dateString}-${slot}-${courseKey}`;

                // Resolve classId: prefer course-level classId (most specific), then fall back
                // to scheduleData.classId (string or multi-array). Never save [] — use null
                // instead so matchesClassValueStrict returns true (shows all enrolled students)
                // which is safer than [] which now returns false (shows no students).
                const _rawCourseClassId = typeof course !== 'string' ? course?.classId : undefined;
                const _hasValidCourseClassId = _rawCourseClassId !== undefined && _rawCourseClassId !== null &&
                  !(Array.isArray(_rawCourseClassId) && _rawCourseClassId.length === 0);
                const resolvedClassId: string | string[] | null = _hasValidCourseClassId
                  ? _rawCourseClassId
                  : (Array.isArray(scheduleData.classId)
                      ? (scheduleData.classId.length > 0 ? scheduleData.classId : null)
                      : (typeof scheduleData.classId === 'string' && scheduleData.classId
                          ? scheduleData.classId
                          : null));

                // Resolve groupNumber: from course data (matches ClassroomAttendancePage logic)
                const resolvedGroupNumber = typeof course !== 'string'
                  ? (Number(course?.groupNumber || course?.group || 0) || undefined)
                  : undefined;

                // Resolve courseId for enrollment lookup
                const resolvedCourseId = typeof course !== 'string'
                  ? (course?.id || course?.courseId || scheduleData.courseId || '')
                  : '';

                allSchedules.push({
                  id: uniqueScheduleId,
                  day: effectiveDay.isMakeupDay
                    ? `${effectiveDay.actualDayName} (ใช้ตาราง${effectiveDay.scheduleDayName})`
                    : effectiveDay.actualDayName,
                  period: periodNumber,
                  periodIndex: pIdx,
                  periodLabel: setting.label,
                  startTime: setting.startTime,
                  endTime: setting.endTime,
                  subjectName: subjectNameDisplay,
                  subjectCode: subjectCodeDisplay,
                  className: formatClassName(resolvedClassId),
                  classId: resolvedClassId,
                  groupNumber: resolvedGroupNumber,
                  courseId: resolvedCourseId,
                  originalDate: new Date(currentDate),
                  substituteTeacherId: existingSub?.substituteTeacherId,
                  substituteTeacherName: existingSub?.substituteTeacherName,
                  substitutionDocId: existingSub?.id,
                  roomName: (Array.isArray(course?.room) ? course.room : (course?.room ? [course.room] : (scheduleData.roomIds || [])))
                    .map((id: string) => roomMap[id] || id)
                    .join(', ') || 'ไม่ระบุสถานที่',
                  isCoTeaching,
                  coTeacherIds: otherTeacherIds,
                  allCoTeachersAbsent,
                  autoHandledByTeacherId,
                  autoHandledByTeacherName,
                  absentCoTeacherIds: otherTeacherIds.filter(tid => absentOnDate.has(tid)),
                });
              });
            }
          }
        });
        // ไปยังวันถัดไป
        currentDate.setDate(currentDate.getDate() + 1);
      }

      // เรียงลำดับตามวันที่และคาบเรียน
      allSchedules.sort((a, b) => {
        if (a.originalDate.getTime() !== b.originalDate.getTime()) {
          return a.originalDate.getTime() - b.originalDate.getTime();
        }
        return a.period - b.period;
      });

      // Auto-save สำหรับคาบสอนร่วมที่ยังมีครูอยู่ (ใช้ Deterministic ID เพื่อป้องกัน duplicate)
      const autoHandledPending = allSchedules.filter(s => s.autoHandledByTeacherId && !s.substitutionDocId);
      if (autoHandledPending.length > 0) {
        const subsCollRef = collection(firestore, "school-settings", schoolId, "substitutions");
        await Promise.all(autoHandledPending.map(async (entry) => {
          // Deterministic ID: originalTeacherId_dateKey_period → setDoc เขียนทับถ้ามีอยู่แล้ว
          const deterministicId = `${leave.teacherDocId}_${formatDateKey(entry.originalDate)}_${entry.period}`;
          const subRef = doc(subsCollRef, deterministicId);
          await setDoc(subRef, {
            id: deterministicId,
            originalTeacherId: leave.teacherDocId,
            originalTeacherName: leave.teacherName,
            substituteTeacherId: entry.autoHandledByTeacherId!,
            substituteTeacherName: entry.autoHandledByTeacherName || '',
            date: Timestamp.fromDate(entry.originalDate),
            academicYear: getScheduleYearTerm(entry.originalDate).academicYear,
            period: entry.period,
            classId: entry.classId ?? null,
            groupNumber: entry.groupNumber ?? null,
            courseId: entry.courseId || null,
            subjectName: entry.subjectName,
            subjectCode: entry.subjectCode || '',
            roomName: entry.roomName || '',
            startTime: entry.startTime || '',
            endTime: entry.endTime || '',
            leaveRequestId: leave.id,
            isAutoAssigned: true,
            isCoTeaching: true,
            dayPortion: portion,
            createdAt: Timestamp.now(),
          });
          entry.substitutionDocId = subRef.id;
          entry.substituteTeacherId = entry.autoHandledByTeacherId;
          entry.substituteTeacherName = entry.autoHandledByTeacherName;
          sendSubstituteStudentNotifications(
            entry.classId, entry.period, entry.subjectName, entry.subjectCode,
            entry.originalDate, entry.autoHandledByTeacherName || '', leave.teacherName,
          );
        }));
      }

      // Auto-assign: สำหรับคาบที่ยังไม่มีครูสอนแทน ให้ระบบเลือกครูที่เหมาะสมที่สุดอัตโนมัติ
      const unassignedEntries = allSchedules.filter(s => !s.substituteTeacherId && (!s.isCoTeaching || s.allCoTeachersAbsent));
      if (unassignedEntries.length > 0) {
        const autoSubsCollRef = collection(firestore, "school-settings", schoolId, "substitutions");
        const tentativeSlotMap = new Map<string, string>(); // normalizedKey → teacherId (prevent double-booking within this batch)

        for (const entry of unassignedEntries) {
          const effectiveDay = getEffectiveScheduleDay(entry.originalDate);
          const checkDayKey = effectiveDay.scheduleDayKey;
          const normalizedKey = `${checkDayKey}-${entry.period}`;
          const dateKey = formatDateKey(entry.originalDate);
          const busyTeacherIds = periodBusyMap[normalizedKey] || new Set<string>();
          const absentOnDate = absentTeacherIdsByDate.get(dateKey) || new Set<string>();

          const available = teachers
            .filter(t => {
              if (busyTeacherIds.has(t.value)) return false;
              if (absentOnDate.has(t.value)) return false;
              if (tentativeSlotMap.get(normalizedKey) === t.value) return false;
              const prefs = (t as any).preferences;
              if (prefs?.unavailableDays?.includes(checkDayKey)) return false;
              if (prefs?.unavailableSlots?.includes(normalizedKey)) return false;
              return true;
            })
            .map(t => ({
              ...t,
              loadDay: preComputedDayLoads[checkDayKey]?.[t.value] || 0,
              loadWeek: preComputedWeekLoad[t.value] || 0,
            }))
            .sort((a: any, b: any) => a.loadDay - b.loadDay || a.loadWeek - b.loadWeek);

          if (available.length === 0) continue;

          const best = available[0] as any;
          const deterministicId = `${leave.teacherDocId}_${formatDateKey(entry.originalDate)}_${entry.period}`;

          tentativeSlotMap.set(normalizedKey, best.value);
          if (!periodBusyMap[normalizedKey]) periodBusyMap[normalizedKey] = new Set();
          periodBusyMap[normalizedKey].add(best.value);

          entry.substituteTeacherId = best.value;
          entry.substituteTeacherName = best.label.replace(/^\[.*?\]\s*/, '');
          entry.substitutionDocId = deterministicId;

          try {
            await setDoc(doc(autoSubsCollRef, deterministicId), {
              id: deterministicId,
              originalTeacherId: leave.teacherDocId,
              originalTeacherName: leave.teacherName,
              substituteTeacherId: best.value,
              substituteTeacherName: best.label.replace(/^\[.*?\]\s*/, ''),
              date: Timestamp.fromDate(entry.originalDate),
              academicYear: getScheduleYearTerm(entry.originalDate).academicYear,
              period: entry.period,
              classId: entry.classId ?? null,
              groupNumber: entry.groupNumber ?? null,
              courseId: entry.courseId || null,
              subjectName: entry.subjectName,
              subjectCode: entry.subjectCode || '',
              roomName: entry.roomName || '',
              startTime: entry.startTime || '',
              endTime: entry.endTime || '',
              leaveRequestId: leave.id,
              isAutoAssigned: true,
              dayPortion: portion,
              createdAt: Timestamp.now(),
            });
            sendSubstituteStudentNotifications(
              entry.classId, entry.period, entry.subjectName, entry.subjectCode,
              entry.originalDate, best.label.replace(/^\[.*?\]\s*/, ''), leave.teacherName,
            );
          } catch (autoErr) {
            console.warn('[autoAssign] บันทึกคาบ', entry.period, 'ไม่สำเร็จ:', autoErr);
            entry.substituteTeacherId = undefined;
            entry.substituteTeacherName = undefined;
            entry.substitutionDocId = undefined;
          }
        }
        // Update busyMap state to reflect auto-assigned teachers
        setBusyMap({ ...periodBusyMap });
        setHasAutoAssigned(true);
      }

      // ถ้าทุกคาบมีครูสอนแทนแล้ว (รวม auto-assign จากครูสอนร่วม) → อัปเดตสถานะให้แสดง ✓ ในแผงซ้าย
      const allSchedulesCovered = allSchedules.length > 0 && allSchedules.every((s: ScheduleEntry) => !!s.substituteTeacherId);
      if (allSchedulesCovered) {
        try {
          if (leave.isManual) {
            await updateDoc(doc(firestore, "school-settings", schoolId, "manual_substitute_requests", leave.id), { status: "substitution_assigned" });
          } else {
            const collectionName = (leave as any).collection || "leave_summary";
            await updateDoc(doc(firestore, "school-settings", schoolId, "teachers", leave.teacherDocId, collectionName, leave.id), { status: "substitution_assigned" });
          }
          setSelectedLeave(prev => prev ? { ...prev, status: "substitution_assigned", substituteStatus: "completed" } : prev);
          setLeaveRequests(prev => prev.map(lr => lr.id === leave.id ? { ...lr, status: "substitution_assigned", substituteStatus: "completed" } : lr));
        } catch (statusErr) {
          console.warn("[handleSelectLeave] ไม่สามารถอัปเดตสถานะหลัง auto-assign:", statusErr);
        }
      }

      setSchedules(allSchedules);
    } catch (error) {
      console.error("Error fetching schedules:", error);
      Swal.fire("เกิดข้อผิดพลาด", "ไม่สามารถโหลดตารางสอนของครูได้", "error");
    } finally {
      setIsScheduleLoading(false);
    }
  };

  // 📌 ฟังก์ชันสำหรับดัดแปลงรายการครูตามเงื่อนไขที่เลือก (Advanced Filter)
  const getProcessedTeachers = (availableTeachers: any[] | undefined) => {
    if (!availableTeachers || !selectedLeave) return [];

    let processed = [...availableTeachers];
    const leaveTeacher = teacherMap[selectedLeave.teacherDocId];
    const leaveLearningArea = (leaveTeacher as any)?.learningArea || '';

    // 1. Filter by Learning Area
    if (filterLearningArea !== 'all') {
      processed = processed.filter(t => t.learningArea === filterLearningArea);
    }

    // 2. Filter by Grade Level
    if (filterGrade !== 'all') {
      processed = processed.filter(t => t.homeroomGrade === filterGrade);
    }

    // 3. Filter by Load
    if (filterLoadDay !== 'all') {
      const maxLoad = parseInt(filterLoadDay);
      processed = processed.filter(t => t.loadDay <= maxLoad);
    }
    if (filterLoadWeek !== 'all') {
      const maxLoad = parseInt(filterLoadWeek);
      processed = processed.filter(t => t.loadWeek <= maxLoad);
    }

    // 4. Filter by absence history (จำนวนครั้งที่ครูคนนั้นเคยลาจนต้องหาคนสอนแทน)
    if (filterMissing !== 'all') {
      processed = processed.filter(t => {
        const count = teacherAbsenceCounts[t.value] || 0;
        if (filterMissing === 'high') return count > 10;
        if (filterMissing === 'medium') return count >= 4 && count <= 10;
        if (filterMissing === 'low') return count < 4;
        return true;
      });
    }

    // 5. Sort
    if (sortCondition === 'recommended') {
      processed.sort((a, b) => {
        // Priority 1: Same Learning Area
        const aGroup = a.learningArea === leaveLearningArea ? 1 : 0;
        const bGroup = b.learningArea === leaveLearningArea ? 1 : 0;
        if (aGroup !== bGroup) return bGroup - aGroup;
        // Priority 2: Workload Day (Lower is better)
        return a.loadDay - b.loadDay;
      });
    } else if (sortCondition === 'workload_day') {
      processed.sort((a, b) => a.loadDay - b.loadDay);
    } else if (sortCondition === 'workload_week') {
      processed.sort((a, b) => a.loadWeek - b.loadWeek);
    } else if (sortCondition === 'missing_stats') {
      // เรียงจากมาก → น้อย (ครูที่เคยลาบ่อยขึ้นก่อน เพื่อให้รู้ว่าควรเลี่ยง)
      processed.sort((a, b) => (teacherAbsenceCounts[b.value] || 0) - (teacherAbsenceCounts[a.value] || 0));
    }

    return processed;
  };

  // Dynamic available-teacher list for a single schedule entry.
  // Re-evaluates on every render so cross-slot assignments are always reflected.
  const getAvailableTeachersForEntry = (entry: ScheduleEntry): any[] => {
    const dateKey = formatDateKey(entry.originalDate);
    const effectiveDay = getEffectiveScheduleDay(entry.originalDate);
    const checkDayKey = effectiveDay.scheduleDayKey;
    const normalizedKey = `${checkDayKey}-${entry.period}`;
    const busyTeacherIds = busyMap[normalizedKey] || new Set<string>();

    // Substitutes already assigned to the SAME slot (same date + period) in other entries
    const alreadyAssignedSameSlot = new Set<string>();
    schedules.forEach(s => {
      if (
        s.id !== entry.id &&
        formatDateKey(s.originalDate) === dateKey &&
        s.period === entry.period &&
        s.substituteTeacherId
      ) {
        alreadyAssignedSameSlot.add(s.substituteTeacherId);
      }
    });

    // ALL absent teachers on this date (covers every leave request, not just the selected one)
    const absentOnDate = absentTeacherIdsByDate.get(dateKey) || new Set<string>();

    return teachers
      .filter(t => {
        if (busyTeacherIds.has(t.value)) return false;      // has a regular class this slot
        if (absentOnDate.has(t.value)) return false;         // is absent today
        if (alreadyAssignedSameSlot.has(t.value)) return false; // already subbing same slot
        const prefs = (t as any).preferences;
        if (prefs?.unavailableDays?.includes(checkDayKey)) return false;
        if (prefs?.unavailableSlots?.includes(normalizedKey)) return false;
        return true;
      })
      .map(t => ({
        ...t,
        loadDay: dayLoadMap[checkDayKey]?.[t.value] || 0,
        loadWeek: weekLoadMap[t.value] || 0,
      }));
  };

  // Force-mode: all teachers without restrictions (emergency / no-one-available scenario).
  // Returns conflict flags so the UI can show annotations.
  const getAllTeachersUnrestricted = (entry: ScheduleEntry): any[] => {
    const dateKey = formatDateKey(entry.originalDate);
    const effectiveDay = getEffectiveScheduleDay(entry.originalDate);
    const checkDayKey = effectiveDay.scheduleDayKey;
    const normalizedKey = `${checkDayKey}-${entry.period}`;
    const busyTeacherIds = busyMap[normalizedKey] || new Set<string>();

    const alreadyAssignedSameSlot = new Set<string>();
    schedules.forEach(s => {
      if (
        s.id !== entry.id &&
        formatDateKey(s.originalDate) === dateKey &&
        s.period === entry.period &&
        s.substituteTeacherId
      ) {
        alreadyAssignedSameSlot.add(s.substituteTeacherId);
      }
    });

    const absentOnDate = absentTeacherIdsByDate.get(dateKey) || new Set<string>();

    return teachers.map(t => ({
      ...t,
      loadDay: dayLoadMap[checkDayKey]?.[t.value] || 0,
      loadWeek: weekLoadMap[t.value] || 0,
      _isAbsent: absentOnDate.has(t.value),
      _isBusy: busyTeacherIds.has(t.value),
      _hasConflict: alreadyAssignedSameSlot.has(t.value),
    }));
  };

  const handleAssignSubstitute = async (scheduleEntry: ScheduleEntry, substituteTeacherId: string | undefined) => {
    if (!selectedLeave || !schoolId) return;

    const substitutionsCollectionRef = collection(firestore, "school-settings", schoolId, "substitutions");
    const oldSubstituteId = scheduleEntry.substituteTeacherId;
    const oldSubstitute = oldSubstituteId ? teachers.find((t: { value: string; }) => t.value === oldSubstituteId) : null;

    // กรณีกด X ยกเลิกการมอบหมาย
    if (!substituteTeacherId) {
      if (!scheduleEntry.substitutionDocId) return;
      try {
        await deleteDoc(doc(substitutionsCollectionRef, scheduleEntry.substitutionDocId));
        // ส่งแจ้งเตือนยกเลิกให้ครูคนเดิม
        if (oldSubstitute && (oldSubstitute as any).uid) {
          const dateStr = formatDateKey(scheduleEntry.originalDate);
          const cancelMsg = `การสอนแทนวิชา ${scheduleEntry.subjectName} (${scheduleEntry.className}) ในวันที่ ${scheduleEntry.originalDate.toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: 'numeric' })} คาบที่ ${scheduleEntry.period} ของคุณได้ถูกยกเลิก`;
          const cancelNotiRef = await addDoc(collection(firestore, "school-settings", schoolId, "notifications"), {
            userId: (oldSubstitute as any).uid,
            message: cancelMsg,
            createdAt: Timestamp.now(),
            isRead: false,
            link: `/academic/classroom-attendance?date=${dateStr}`,
          });
          try {
            const processPushNotification = httpsCallable(getFunctions(), "processPushNotification");
            await processPushNotification({ userId: (oldSubstitute as any).uid, message: cancelMsg, link: `/academic/classroom-attendance?date=${dateStr}`, source: "substitute", schoolId, notificationId: cancelNotiRef.id });
          } catch (pushErr) { console.error("Error sending cancellation push:", pushErr); }
        }
        const updatedSchedules = schedules.map(s =>
          s.id === scheduleEntry.id ? { ...s, substituteTeacherId: undefined, substituteTeacherName: undefined, substitutionDocId: undefined } : s
        );
        setSchedules(updatedSchedules);
        Swal.fire({ icon: 'info', title: 'ยกเลิกการมอบหมายแล้ว', timer: 1500, showConfirmButton: false, background: '#2a2b2f', color: '#ffffff' });
      } catch (error) {
        console.error("Error removing substitute:", error);
        Swal.fire("เกิดข้อผิดพลาด", "ไม่สามารถยกเลิกการมอบหมายได้", "error");
      }
      return;
    }

    const substitute = teachers.find((t: { value: string; }) => t.value === substituteTeacherId);
    if (!substitute) return;

    try {
      let substitutionDocId = scheduleEntry.substitutionDocId;
      // ตรวจสอบว่าเคยมีการมอบหมายคาบนี้แล้วหรือยัง
      if (scheduleEntry.substitutionDocId) {
        // ถ้ามีแล้ว ให้อัปเดต document เดิม
        const substitutionRef = doc(substitutionsCollectionRef, scheduleEntry.substitutionDocId);
        await updateDoc(substitutionRef, {
          substituteTeacherId: substitute.value,
          substituteTeacherName: substitute.label.replace(/^\[.*?\]\s*/, ''),
          roomName: scheduleEntry.roomName || "",
          startTime: scheduleEntry.startTime || "",
          endTime: scheduleEntry.endTime || "",
          updatedAt: Timestamp.now(),
        });
      } else {
        // ถ้ายังไม่มี ให้สร้าง document ใหม่ด้วย Deterministic ID เพื่อป้องกัน duplicate
        const deterministicId = `${selectedLeave.teacherDocId}_${formatDateKey(scheduleEntry.originalDate)}_${scheduleEntry.period}`;
        const substitutionRef = doc(substitutionsCollectionRef, deterministicId);
        substitutionDocId = deterministicId;
        await setDoc(substitutionRef, {
          id: deterministicId,
          originalTeacherId: selectedLeave.teacherDocId,
          originalTeacherName: selectedLeave.teacherName,
          substituteTeacherId: substitute.value,
          substituteTeacherName: substitute.label.replace(/^\[.*?\]\s*/, ''),
          date: Timestamp.fromDate(scheduleEntry.originalDate),
          academicYear: getScheduleYearTerm(scheduleEntry.originalDate).academicYear,
          period: scheduleEntry.period,
          classId: scheduleEntry.classId ?? null,
          groupNumber: scheduleEntry.groupNumber ?? null,
          courseId: scheduleEntry.courseId || null,
          subjectName: scheduleEntry.subjectName,
          subjectCode: scheduleEntry.subjectCode || "",
          roomName: scheduleEntry.roomName || "",
          startTime: scheduleEntry.startTime || "",
          endTime: scheduleEntry.endTime || "",
          leaveRequestId: selectedLeave.id,
          dayPortion,
          createdAt: Timestamp.now(),
        });
      }

      // แจ้งเตือนนักเรียนในชั้นที่ได้รับผลกระทบ (fire-and-forget)
      sendSubstituteStudentNotifications(
        scheduleEntry.classId, scheduleEntry.period, scheduleEntry.subjectName, scheduleEntry.subjectCode,
        scheduleEntry.originalDate, substitute.label.replace(/^\[.*?\]\s*/, ''), selectedLeave.teacherName,
      );

      // 📌 เพิ่ม: สร้างการแจ้งเตือนสำหรับครูที่ได้รับมอบหมาย
      const substitutionDate = scheduleEntry.originalDate.toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: 'numeric' });

      // Check if this teacher is already handling other substitute slots the same day
      const dateKey = formatDateKey(scheduleEntry.originalDate);
      const existingSubsForTeacher = schedules.filter(s =>
        s.id !== scheduleEntry.id &&
        s.substituteTeacherId === substituteTeacherId &&
        formatDateKey(s.originalDate) === dateKey
      );
      const multiSubNote = existingSubsForTeacher.length > 0
        ? ` (หมายเหตุ: คุณมีการสอนแทนอีก ${existingSubsForTeacher.length} วิชาในวันเดียวกัน ได้แก่ ${existingSubsForTeacher.map(s => `${s.subjectName} คาบ${s.period}`).join(', ')})`
        : '';

      const newTeacherNotificationMessage = `คุณได้รับมอบหมายให้สอนแทนวิชา ${scheduleEntry.subjectName} (${scheduleEntry.className}) ในวันที่ ${substitutionDate} คาบที่ ${scheduleEntry.period} เนื่องจากคุณครู ${selectedLeave.teacherName} ${selectedLeave.leaveType}${multiSubNote}`;

      const dateYear = scheduleEntry.originalDate.getFullYear();
      const dateMonth = String(scheduleEntry.originalDate.getMonth() + 1).padStart(2, '0');
      const dateDay = String(scheduleEntry.originalDate.getDate()).padStart(2, '0');
      const dateStr = `${dateYear}-${dateMonth}-${dateDay}`;

      const notificationDocRef = await addDoc(collection(firestore, "school-settings", schoolId, "notifications"), {
        userId: substitute.uid, // 📌 แก้ไข: ใช้ uid ของครูเพื่อให้ Navbar ดึงข้อมูลเจอ
        message: newTeacherNotificationMessage,
        createdAt: Timestamp.now(),
        isRead: false,
        link: `/academic/classroom-attendance?date=${dateStr}&selectSub=${substitutionDocId}`, // นำทางไปยังหน้าเช็คชื่อ
      });

      // 📌 ส่ง Push Notification ผ่าน Callable Function
      try {
        const functions = getFunctions();
        const processPushNotification = httpsCallable(functions, "processPushNotification");
        const response = await processPushNotification({
          userId: substitute.uid,
          message: newTeacherNotificationMessage,
          link: `/academic/classroom-attendance?date=${dateStr}&selectSub=${substitutionDocId}`,
          source: "substitute",
          schoolId: schoolId,
          notificationId: notificationDocRef.id
        });
        console.log("✅ ส่งแจ้งเตือน Push Notification สำเร็จ:", response.data);
      } catch (pushErr) {
        console.error("Error calling push notification function:", pushErr);
      }


      // 📌 เพิ่ม: หากมีการเปลี่ยนแปลงครูสอนแทน (ไม่ใช่การมอบหมายครั้งแรก และครูคนใหม่ไม่ซ้ำคนเก่า) ให้ส่งแจ้งเตือนไปหาครูคนเก่าด้วย
      if (oldSubstitute && oldSubstitute.uid !== substitute.uid) {
        const oldTeacherNotificationMessage = `การสอนแทนวิชา ${scheduleEntry.subjectName} (${scheduleEntry.className}) ในวันที่ ${substitutionDate} คาบที่ ${scheduleEntry.period} ของคุณได้ถูกเปลี่ยนแปลง/ยกเลิก`;
        const oldNotiDocRef = await addDoc(collection(firestore, "school-settings", schoolId, "notifications"), {
          userId: oldSubstitute.uid,
          message: oldTeacherNotificationMessage,
          createdAt: Timestamp.now(),
          isRead: false,
          link: `/academic/classroom-attendance?date=${dateStr}`,
        });

        // 📌 ส่ง Push Notification ยกเลิกงาน ผ่าน Callable Function
        try {
          const functions = getFunctions();
          const processPushNotification = httpsCallable(functions, "processPushNotification");
          const response = await processPushNotification({
            userId: oldSubstitute.uid,
            message: oldTeacherNotificationMessage,
            link: `/academic/classroom-attendance?date=${dateStr}`,
            source: "substitute",
            schoolId: schoolId,
            notificationId: oldNotiDocRef.id
          });
          console.log("✅ ส่งแจ้งเตือน Push Notification (ยกเลิก) สำเร็จ:", response.data);
        } catch (pushErr) {
          console.error("Error calling push notification function:", pushErr);
        }
      }

      // สร้างข้อมูล schedule ที่อัปเดตแล้ว
      const updatedSchedules = schedules.map(s =>
        s.id === scheduleEntry.id
          ? {
            ...s,
            substituteTeacherId: substitute.value,
            substituteTeacherName: substitute.label.replace(/^\[.*?\]\s*/, ''),
            substitutionDocId: substitutionDocId // 📌 อัปเดต ID ของ substitution doc ด้วย
          }
          : s
      );

      Swal.fire({
        icon: 'success',
        title: 'มอบหมายสำเร็จ',
        text: `ได้มอบหมายให้ ${substitute.label.replace(/^\[.*?\]\s*/, '')} สอนแทนเรียบร้อยแล้ว`,
        background: "#2a2b2f",
        color: "#ffffff",
        timer: 2000,
        showConfirmButton: false,
      });

      // อัปเดต state ของ schedules
      setSchedules(updatedSchedules);

      // ตรวจสอบว่าได้มอบหมายครบทุกคาบหรือยัง
      const allAssigned = updatedSchedules.every(s => s.substituteTeacherId);

      if (allAssigned) {
        if (selectedLeave.isManual) {
          // อัปเดตสถานะใน manual_substitute_requests
          await updateDoc(doc(firestore, "school-settings", schoolId, "manual_substitute_requests", selectedLeave.id), { status: "substitution_assigned" });
        } else {
          // อัปเดตสถานะของใบลาจริงใน leave_summary / travel_summary
          const collectionName = (selectedLeave as any).collection || "leave_summary";
          const leaveRequestRef = doc(firestore, "school-settings", schoolId, "teachers", selectedLeave.teacherDocId, collectionName, selectedLeave.id);
          await updateDoc(leaveRequestRef, { status: "substitution_assigned" });
        }
        // อัปเดตสถานะใน UI
        setSelectedLeave({ ...selectedLeave, status: "substitution_assigned", substituteStatus: "completed" });
        setLeaveRequests(currentRequests => currentRequests.map(lr => lr.id === selectedLeave.id ? { ...lr, status: "substitution_assigned", substituteStatus: "completed" } : lr));
      }
    } catch (error) {
      console.error("Error assigning substitute:", error);
      Swal.fire("เกิดข้อผิดพลาด", "ไม่สามารถบันทึกข้อมูลการสอนแทนได้", "error");
    }
  };

  const handleRemoveManual = async (leaveId: string) => {
    if (schoolId) {
      try {
        await deleteDoc(doc(firestore, 'school-settings', schoolId, 'manual_substitute_requests', leaveId));
      } catch (e) {
        console.error('[ManualSubstitute] ลบรายการล้มเหลว:', e);
      }
    }
    setLeaveRequests(prev => prev.filter(lr => lr.id !== leaveId));
    if (selectedLeave?.id === leaveId) {
      setSelectedLeave(null);
      setSchedules([]);
    }
  };

  const handleAddManual = async () => {
    if (!manualTeacherId || !manualStartDate || !manualEndDate || !schoolId) return;
    if (manualStartDate > manualEndDate) {
      Swal.fire({ icon: 'warning', title: 'วันที่ไม่ถูกต้อง', text: 'วันที่เริ่มต้องไม่เกินวันที่สิ้นสุด', background: '#2a2b2f', color: '#fff', timer: 2000, showConfirmButton: false });
      return;
    }

    const teacher = teacherMap[manualTeacherId];
    const teacherName = (teacher as any)?.name || teachers.find(t => t.value === manualTeacherId)?.label?.replace(/^\[.*?\]\s*/, '') || 'ไม่ระบุชื่อ';
    const startDateObj = new Date(manualStartDate + 'T00:00:00');
    const endDateObj = new Date(manualEndDate + 'T23:59:59');

    // บันทึกลง Firestore เพื่อให้ข้อมูลคงอยู่หลัง refresh
    const manualColRef = collection(firestore, 'school-settings', schoolId, 'manual_substitute_requests');
    const manualDocRef = doc(manualColRef);
    await setDoc(manualDocRef, {
      teacherName,
      teacherDocId: manualTeacherId,
      startDate: Timestamp.fromDate(startDateObj),
      endDate: Timestamp.fromDate(endDateObj),
      leaveType: manualLeaveType,
      status: 'approved',
      requiresSubstitute: true,
      isManual: true,
      dayPortion: manualDayPortion,
      reason: '',
      createdAt: Timestamp.now(),
    });

    const syntheticLeave: LeaveRequest = {
      id: manualDocRef.id,
      teacherName,
      teacherDocId: manualTeacherId,
      startDate: Timestamp.fromDate(startDateObj),
      endDate: Timestamp.fromDate(endDateObj),
      startDateString: startDateObj.toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: 'numeric' }),
      endDateString: endDateObj.toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: 'numeric' }),
      status: 'approved',
      leaveType: manualLeaveType,
      reason: '',
      substituteStatus: 'pending',
      isManual: true,
      collection: undefined,
      dayPortion: manualDayPortion,
    };

    // เพิ่มเข้าลิสต์ รอให้ผู้ใช้คลิกเลือกเองเพื่อจัดสอนแทน (เหมือนครูที่ยื่นผ่านระบบ)
    setLeaveRequests(prev => [syntheticLeave, ...prev.filter(lr => !(lr.isManual && lr.teacherDocId === manualTeacherId))]);
    setShowManualAddForm(false);
    setManualTeacherId('');
    setManualStartDate('');
    setManualEndDate('');
    setManualLeaveType('ลา');
    setManualDayPortion('full');
  };

  // ส่งแจ้งเตือนไปยังนักเรียนในชั้น/ห้องที่ได้รับผลกระทบจากการจัดสอนแทน
  const sendSubstituteStudentNotifications = async (
    classId: string | string[] | null,
    period: number,
    subjectName: string,
    subjectCode: string | undefined,
    originalDate: Date,
    substituteTeacherName: string,
    originalTeacherName: string,
  ) => {
    if (!schoolId || !classId) return;
    const classIds = (Array.isArray(classId) ? classId : [classId]).filter(Boolean) as string[];
    if (classIds.length === 0) return;

    const dateStr = originalDate.toLocaleDateString('th-TH', { day: 'numeric', month: 'long', year: 'numeric' });
    const cleanSubName = substituteTeacherName.replace(/^\[.*?\]\s*/, '');
    const message = `คาบที่ ${period} วิชา ${subjectName}${subjectCode ? ` (${subjectCode})` : ''} วันที่ ${dateStr} สอนแทนโดย ${cleanSubName} (แทน ${originalTeacherName})`;

    try {
      const studentsRef = collection(firestore, 'school-settings', schoolId, 'students');
      const notifsRef = collection(firestore, 'school-settings', schoolId, 'notifications');
      const seen = new Set<string>();
      const uids: string[] = [];

      for (const cid of classIds) {
        const slashIdx = cid.indexOf('/');
        const level = slashIdx >= 0 ? cid.substring(0, slashIdx) : cid;
        const room = slashIdx >= 0 ? cid.substring(slashIdx + 1) : null;

        const studentSnap = await getDocs(query(studentsRef, where('classLevel', '==', level)));
        studentSnap.forEach(studentDoc => {
          const data = studentDoc.data();
          if (!data.uid || seen.has(data.uid)) return;
          if (room && String(data.room ?? '') !== room) return;
          seen.add(data.uid);
          uids.push(data.uid);
        });
      }

      for (let i = 0; i < uids.length; i += 490) {
        const batch = writeBatch(firestore);
        uids.slice(i, i + 490).forEach(uid => {
          batch.set(doc(notifsRef), {
            userId: uid,
            message,
            createdAt: Timestamp.now(),
            isRead: false,
            source: 'substitute',
          });
        });
        await batch.commit();
      }
    } catch (e) {
      console.warn('[SubstituteManagement] ส่งแจ้งเตือนนักเรียนไม่สำเร็จ:', e);
    }
  };

  return (
    <MainLayout>
      <div className="p-4 sm:p-6 text-gray-900 dark:text-white transition-colors duration-300">
        <div className="max-w-6xl mx-auto">
          <div className="flex justify-between items-center mb-6">
            <div className="bg-white dark:bg-[#2a2b2f] rounded-2xl p-6 text-gray-900 dark:text-white flex-grow shadow-sm dark:shadow-none flex items-center gap-4">
              <BackButton to="/academic/hub/scheduling" />
              <div>
                <h1 className="text-3xl font-bold mb-2 text-gray-900 dark:text-white">จัดการสอนแทน</h1>
                <p className="text-gray-500 dark:text-gray-400">
                  มอบหมายครูสอนแทนสำหรับคาบเรียนที่ว่างลงเนื่องจากการลา
                </p>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Left Panel: Leave Requests */}
            <div className="lg:col-span-1 bg-white dark:bg-[#2a2b2f] rounded-2xl p-4 shadow-sm dark:shadow-none">
              <h2 className="text-xl font-bold mb-4 flex items-center text-gray-900 dark:text-white"><Users className="mr-2" /> ครูที่ลาและต้องการสอนแทน</h2>
              {/* 📌 เพิ่ม Filter Buttons */}
              <div className="flex items-center space-x-2 mb-4 bg-gray-100 dark:bg-[#1e1f21] p-1 rounded-lg">
                <button
                  onClick={() => setSearchParams({ filter: 'current' })}
                  className={`w-full py-2 text-sm rounded-md transition ${filter === 'current' ? 'bg-indigo-600 text-white' : 'text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-white/10'}`}
                >ปัจจุบัน</button>
                <button
                  onClick={() => setSearchParams({ filter: 'upcoming' })}
                  className={`w-full py-2 text-sm rounded-md transition ${filter === 'upcoming' ? 'bg-indigo-600 text-white' : 'text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-white/10'}`}
                >ล่วงหน้า</button>
                <button
                  onClick={() => setSearchParams({ filter: 'past' })}
                  className={`w-full py-2 text-sm rounded-md transition ${filter === 'past' ? 'bg-indigo-600 text-white' : 'text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-white/10'}`}
                >ที่ผ่านมา</button>
              </div>
              <div className="space-y-3 max-h-[50vh] overflow-y-auto">
                {isLoading && <p>กำลังโหลด...</p>}
                {!isLoading && leaveRequests.length === 0 && <p className="text-gray-500 dark:text-gray-400">ไม่มีคำขอลาที่ต้องการสอนแทน</p>}
                {leaveRequests.map((leave) => (
                  <div key={leave.id} onClick={() => handleSelectLeave(leave)}
                    className={`p-3 rounded-lg cursor-pointer transition-all ${selectedLeave?.id === leave.id ? 'bg-indigo-600 shadow-lg text-white' : 'bg-gray-50 dark:bg-[#1e1f21] hover:bg-gray-100 dark:hover:bg-indigo-500/20'}`}>
                    <div className="flex justify-between items-start">
                      <p className={`font-bold ${selectedLeave?.id === leave.id ? 'text-white' : 'text-gray-900 dark:text-white'}`}>{leave.teacherName}</p>
                      <div className="flex items-center gap-1.5">
                        {leave.isManual && (
                          <span className={`text-[10px] px-1.5 py-0.5 rounded font-black ${selectedLeave?.id === leave.id ? 'bg-white/20 text-white' : 'bg-purple-500/15 text-purple-400 border border-purple-500/20'}`}>
                            ด้วยตนเอง
                          </span>
                        )}
                        {leave.dayPortion && leave.dayPortion !== 'full' && (
                          <span className={`text-[10px] px-1.5 py-0.5 rounded font-black ${selectedLeave?.id === leave.id ? 'bg-white/20 text-white' : 'bg-sky-500/15 text-sky-500 border border-sky-500/20'}`}>
                            {leave.dayPortion === 'morning' ? '🌅 เช้า' : '🌇 บ่าย'}
                          </span>
                        )}
                        {!leave.isManual && !leave.approvedBy && (leave.status === "pending" || leave.status === "substitution_assigned") && (
                          <span className={`text-[10px] px-1.5 py-0.5 rounded font-black ${selectedLeave?.id === leave.id ? 'bg-white/20 text-white animate-pulse' : 'bg-amber-500/15 text-amber-500 border border-amber-500/20'}`}>
                            รออนุมัติ
                          </span>
                        )}
                        <div title={leave.substituteStatus === 'completed' ? 'จัดสอนแทนครบแล้ว' : 'ยังไม่ได้จัดสอนแทน'}>
                          {leave.substituteStatus === 'completed'
                            ? <CheckCircle size={18} className="text-green-400" />
                            : <AlertTriangle size={18} className="text-yellow-400" />}
                        </div>
                      </div>
                    </div>
                    <p className={`text-sm ${selectedLeave?.id === leave.id ? 'text-indigo-100' : 'text-gray-600 dark:text-gray-300'}`}>{leave.leaveType}</p>
                    <p className={`text-xs ${selectedLeave?.id === leave.id ? 'text-indigo-200' : 'text-gray-500 dark:text-gray-400'}`}>{leave.startDateString} - {leave.endDateString}</p>
                    {leave.isManual && (
                      <div className="relative group/del mt-1.5 w-fit">
                        <button
                          onClick={(e) => { e.stopPropagation(); handleRemoveManual(leave.id); }}
                          className={`flex items-center justify-center w-6 h-6 rounded-lg transition-all ${selectedLeave?.id === leave.id ? 'text-white/60 hover:text-white hover:bg-red-500/40' : 'text-red-400/60 hover:text-red-400 hover:bg-red-500/15'}`}
                        >
                          <Trash2 size={13} />
                        </button>
                        <div className="pointer-events-none absolute left-8 top-1/2 -translate-y-1/2 z-50 whitespace-nowrap rounded-lg bg-gray-900 px-2 py-1 text-[10px] font-black text-white opacity-0 group-hover/del:opacity-100 transition-opacity shadow-xl">
                          ยกเลิกจัดสอนแทน
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>

              {/* เพิ่มการสอนแทนด้วยตนเอง */}
              <div className="mt-3 pt-3 border-t border-gray-200 dark:border-gray-700">
                {!showManualAddForm ? (
                  <button
                    onClick={() => setShowManualAddForm(true)}
                    className="w-full flex items-center justify-center gap-2 py-2 text-sm font-bold text-indigo-500 hover:bg-indigo-500/10 rounded-xl transition-all border border-dashed border-indigo-400/40 hover:border-indigo-500/70"
                  >
                    <UserPlus size={15} />
                    เพิ่มครูที่ต้องการสอนแทน (ไม่มีใบลา)
                  </button>
                ) : (
                  <div className="bg-indigo-500/5 border border-indigo-500/20 rounded-xl p-3 space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] font-black text-indigo-400 uppercase tracking-wider flex items-center gap-1.5">
                        <Plus size={11} /> เพิ่มด้วยตนเอง
                      </span>
                      <button
                        onClick={() => { setShowManualAddForm(false); setManualTeacherId(''); setManualStartDate(''); setManualEndDate(''); setManualLeaveType('ลา'); setManualDayPortion('full'); }}
                        className="text-gray-400 hover:text-red-400 transition p-0.5 rounded"
                      >
                        <X size={14} />
                      </button>
                    </div>

                    {/* Teacher selector */}
                    <div>
                      <label className="text-[10px] font-black text-gray-400 uppercase tracking-wider ml-1">ครูที่ต้องการสอนแทน</label>
                      <div className="mt-1">
                        <SubstituteTeacherSelect
                          value={manualTeacherId}
                          onChange={setManualTeacherId}
                          options={teachers}
                          placeholder="ค้นหาชื่อครู..."
                        />
                      </div>
                    </div>

                    {/* Leave type toggle */}
                    <div>
                      <label className="text-[10px] font-black text-gray-400 uppercase tracking-wider ml-1">ประเภท</label>
                      <div className="mt-1 flex gap-2">
                        {(['ลา', 'ไปราชการ'] as const).map(type => (
                          <button
                            key={type}
                            onClick={() => setManualLeaveType(type)}
                            className={`flex-1 py-1.5 rounded-xl text-xs font-black transition-all border ${manualLeaveType === type ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-white dark:bg-[#1e1f21] text-gray-500 dark:text-gray-400 border-gray-200 dark:border-gray-700 hover:border-indigo-400'}`}
                          >
                            {type === 'ลา' ? '🏥 ลา' : '✈️ ไปราชการ'}
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Day portion toggle */}
                    <div>
                      <label className="text-[10px] font-black text-gray-400 uppercase tracking-wider ml-1">ช่วงเวลาที่ต้องจัดสอนแทน</label>
                      <div className="mt-1 flex gap-2">
                        {([
                          { value: 'full', label: '🗓️ เต็มวัน' },
                          { value: 'morning', label: '🌅 เช้า' },
                          { value: 'afternoon', label: '🌇 บ่าย' },
                        ] as const).map(opt => (
                          <button
                            key={opt.value}
                            onClick={() => setManualDayPortion(opt.value)}
                            disabled={opt.value !== 'full' && !canFilterByPortion}
                            title={opt.value !== 'full' && !canFilterByPortion ? 'ต้องตั้งค่าคาบพักเที่ยงในหน้าตั้งค่าคาบเรียนก่อน จึงจะแบ่งเช้า/บ่ายได้' : undefined}
                            className={`flex-1 py-1.5 rounded-xl text-xs font-black transition-all border disabled:opacity-30 disabled:cursor-not-allowed ${manualDayPortion === opt.value ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-white dark:bg-[#1e1f21] text-gray-500 dark:text-gray-400 border-gray-200 dark:border-gray-700 hover:border-indigo-400'}`}
                          >
                            {opt.label}
                          </button>
                        ))}
                      </div>
                      {!canFilterByPortion && (
                        <p className="text-[10px] text-amber-500 mt-1 ml-1">ยังไม่ได้ตั้งค่า "คาบพักเที่ยง" ในหน้าตั้งค่าคาบเรียน จึงเลือกได้เฉพาะเต็มวัน</p>
                      )}
                    </div>

                    {/* Date range */}
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="text-[10px] font-black text-gray-400 uppercase tracking-wider ml-1">วันที่เริ่ม</label>
                        <input
                          type="date"
                          value={manualStartDate}
                          onChange={e => { setManualStartDate(e.target.value); if (manualEndDate && e.target.value > manualEndDate) setManualEndDate(e.target.value); }}
                          className="mt-1 w-full px-2.5 py-1.5 rounded-xl text-xs font-bold bg-white dark:bg-[#1e1f21] border border-gray-200 dark:border-gray-700 text-gray-900 dark:text-white focus:outline-none focus:border-indigo-500 transition"
                        />
                      </div>
                      <div>
                        <label className="text-[10px] font-black text-gray-400 uppercase tracking-wider ml-1">วันที่สิ้นสุด</label>
                        <input
                          type="date"
                          value={manualEndDate}
                          min={manualStartDate}
                          onChange={e => setManualEndDate(e.target.value)}
                          className="mt-1 w-full px-2.5 py-1.5 rounded-xl text-xs font-bold bg-white dark:bg-[#1e1f21] border border-gray-200 dark:border-gray-700 text-gray-900 dark:text-white focus:outline-none focus:border-indigo-500 transition"
                        />
                      </div>
                    </div>

                    <button
                      onClick={handleAddManual}
                      disabled={!manualTeacherId || !manualStartDate || !manualEndDate}
                      className="w-full py-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-40 disabled:cursor-not-allowed text-white text-xs font-black rounded-xl transition-all flex items-center justify-center gap-2"
                    >
                      <UserPlus size={13} />
                      เพิ่มในรายการ (แล้วคลิกเพื่อจัดสอนแทน)
                    </button>
                  </div>
                )}
              </div>
            </div>

            {/* Right Panel: Schedules */}
            <div className="lg:col-span-2 bg-white dark:bg-[#2a2b2f] rounded-2xl p-6 shadow-sm dark:shadow-none">
              <div className="flex flex-col mb-4 gap-4">
                <div className="flex items-center justify-between">
                  <h2 className="text-xl font-bold flex items-center text-gray-900 dark:text-white">
                    <Calendar className="mr-2" /> ตารางสอนที่ต้องจัดหาครูสอนแทน
                  </h2>
                </div>

                {/* Stats bar — fixed at top, not inside scrollable area */}
                {selectedLeave && schedules.length > 0 && !isScheduleLoading && (() => {
                  const manualEntries = schedules.filter(s => !s.isCoTeaching || s.allCoTeachersAbsent);
                  const totalNeedSub = manualEntries.length;
                  const assigned = manualEntries.filter(s => !!s.substituteTeacherId).length;
                  const autoHandled = schedules.filter(s => s.isCoTeaching && !s.allCoTeachersAbsent).length;
                  const remaining = totalNeedSub - assigned;
                  const coverable = manualEntries.filter(s => getAvailableTeachersForEntry(s).length > 0 || !!s.substituteTeacherId).length;
                  const notCoverable = totalNeedSub - coverable;
                  const assignedPct = totalNeedSub > 0 ? Math.round((assigned / totalNeedSub) * 100) : 0;
                  return (
                    <div className="rounded-xl border border-indigo-100/60 dark:border-indigo-900/40 overflow-hidden">
                      <div className="flex items-center gap-3 px-3 py-2 bg-indigo-50/80 dark:bg-indigo-950/30">
                        <span className="text-[9px] font-black text-indigo-400 uppercase tracking-wider shrink-0">สอนแทน</span>
                        <div className="flex-1 h-1.5 rounded-full bg-indigo-100 dark:bg-indigo-900/60 overflow-hidden">
                          <div className={`h-full rounded-full transition-all duration-700 ${assignedPct === 100 ? 'bg-emerald-400' : assignedPct > 50 ? 'bg-indigo-400' : 'bg-amber-400'}`}
                            style={{ width: `${assignedPct}%` }} />
                        </div>
                        <div className="flex items-center gap-2 text-[10px] font-black shrink-0">
                          <span className="text-indigo-500 dark:text-indigo-300">{totalNeedSub} คาบ</span>
                          <span className="text-emerald-500">{assigned} จัดแล้ว</span>
                          {remaining > 0 && <span className="text-amber-500">{remaining} รอ</span>}
                          {notCoverable > 0 && <span className="text-rose-500">{notCoverable} ไม่มีครู</span>}
                          {autoHandled > 0 && <span className="text-blue-400">{autoHandled} auto</span>}
                          <span className={`font-black ${assignedPct === 100 ? 'text-emerald-500' : assignedPct > 50 ? 'text-indigo-400' : 'text-amber-500'}`}>{assignedPct}%</span>
                        </div>
                      </div>
                    </div>
                  );
                })()}

                {/* Auto-assign status banner */}
                {hasAutoAssigned && !isScheduleLoading && schedules.length > 0 && (
                  <div className="flex items-start gap-3 px-4 py-3 rounded-xl bg-sky-50 dark:bg-sky-950/40 border border-sky-200 dark:border-sky-800/60">
                    <Info size={15} className="shrink-0 mt-0.5 text-sky-500 dark:text-sky-400" />
                    <div className="flex flex-col gap-0.5">
                      <span className="text-[11px] font-black text-sky-700 dark:text-sky-300">จัดสอนแทนอัตโนมัติแล้ว</span>
                      <span className="text-[10px] font-medium text-sky-600/80 dark:text-sky-400/80 leading-relaxed">
                        ระบบเลือกครูที่มีภาระน้อยที่สุดให้เบื้องต้น — สามารถเปลี่ยนแปลงได้ตามความเหมาะสม
                      </span>
                    </div>
                  </div>
                )}

                {selectedLeave && (
                  <div className="bg-white dark:bg-[#1e1f21] p-5 rounded-2xl shadow-sm border border-gray-200 dark:border-gray-800 relative group z-10">
                    <div className="absolute top-0 left-0 w-1 h-full bg-indigo-500 rounded-l-2xl"></div>
                    <div className="flex flex-col gap-4">

                      <div className="flex items-center justify-between">
                        <h3 className="font-bold text-gray-800 dark:text-gray-200 flex items-center gap-2 text-sm uppercase tracking-wider">
                          <Calendar size={18} className="text-indigo-500" />
                          ตัวกรองการค้นหา
                        </h3>
                      </div>

                      {/* ช่วงเวลาที่ต้องจัดสอนแทน (เต็มวัน/เช้า/บ่าย) */}
                      <div className="flex flex-col gap-1.5">
                        <label className="text-[10px] font-black text-gray-400 uppercase tracking-wider ml-1">ช่วงเวลาที่ต้องจัดสอนแทน</label>
                        <div className="flex gap-2">
                          {([
                            { value: 'full', label: '🗓️ เต็มวัน' },
                            { value: 'morning', label: '🌅 เฉพาะเช้า' },
                            { value: 'afternoon', label: '🌇 เฉพาะบ่าย' },
                          ] as const).map(opt => (
                            <button
                              key={opt.value}
                              onClick={() => selectedLeave && dayPortion !== opt.value && handleSelectLeave(selectedLeave, opt.value)}
                              disabled={opt.value !== 'full' && !canFilterByPortion}
                              title={opt.value !== 'full' && !canFilterByPortion ? 'ต้องตั้งค่าคาบพักเที่ยงในหน้าตั้งค่าคาบเรียนก่อน จึงจะแบ่งเช้า/บ่ายได้' : undefined}
                              className={`flex-1 py-2 rounded-xl text-xs font-black transition-all border disabled:opacity-30 disabled:cursor-not-allowed ${dayPortion === opt.value ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-white dark:bg-[#1e1f21] text-gray-500 dark:text-gray-400 border-gray-200 dark:border-gray-700 hover:border-indigo-400'}`}
                            >
                              {opt.label}
                            </button>
                          ))}
                        </div>
                        {dayPortion !== 'full' && (
                          <p className="text-[10px] text-sky-500 ml-1">แสดงและจัดสอนแทนเฉพาะคาบช่วง{dayPortion === 'morning' ? 'เช้า (ก่อนพักเที่ยง)' : 'บ่าย (หลังพักเที่ยง)'}เท่านั้น</p>
                        )}
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                        {/* 1. Sort Condition */}
                        <div className="md:col-span-1 lg:col-span-2">
                          <CustomSelect
                            label="เรียงลำดับตาม"
                            value={sortCondition}
                            onChange={setSortCondition}
                            options={[
                              { value: 'recommended', label: '✨ แนะนำ (เหมาะสมที่สุด)' },
                              { value: 'workload_day', label: '📊 ภาระงานต่อวัน (น้อย ➔ มาก)' },
                              { value: 'workload_week', label: '📅 ภาระงานต่อสัปดาห์ (น้อย ➔ มาก)' },
                              { value: 'missing_stats', label: '📉 ประวัติการลา/ขาด (มาก ➔ น้อย)' }
                            ]}
                          />
                        </div>

                        {/* 2. Group Filter */}
                        <CustomSelect
                          label="กลุ่มสาระ"
                          value={filterLearningArea}
                          onChange={setFilterLearningArea}
                          options={[
                            { value: 'all', label: 'ทั้งหมด' },
                            ...Array.from(new Set(teachers.map((t: any) => t.learningArea).filter(Boolean))).map((area: any) => ({
                              value: area, label: area
                            }))
                          ]}
                        />

                        {/* 3. Grade Filter */}
                        <CustomSelect
                          label="ระดับชั้น"
                          value={filterGrade}
                          onChange={setFilterGrade}
                          options={[
                            { value: 'all', label: 'ทั้งหมด' },
                            ...Array.from(new Set(teachers.map((t: any) => t.homeroomGrade).filter(Boolean))).map((grade: any) => ({
                              value: grade, label: grade
                            }))
                          ]}
                        />

                        {/* 4. Load Day */}
                        <CustomSelect
                          label="คาบต่อวัน &le;"
                          value={filterLoadDay}
                          onChange={setFilterLoadDay}
                          options={[
                            { value: 'all', label: 'ไม่จำกัด' },
                            { value: '0', label: '0 (ว่างทั้งวัน)' },
                            { value: '1', label: '1 คาบ' },
                            { value: '2', label: '2 คาบ' },
                            { value: '3', label: '3 คาบ' },
                            { value: '4', label: '4 คาบ' }
                          ]}
                        />

                        {/* 5. Load Week */}
                        <CustomSelect
                          label="คาบต่อสัปดาห์ &le;"
                          value={filterLoadWeek}
                          onChange={setFilterLoadWeek}
                          options={[
                            { value: 'all', label: 'ไม่จำกัด' },
                            { value: '10', label: '10 คาบ' },
                            { value: '15', label: '15 คาบ' },
                            { value: '20', label: '20 คาบ' }
                          ]}
                        />

                        {/* 6. Missing Stats */}
                        <CustomSelect
                          label="ประวัติการลา"
                          value={filterMissing}
                          onChange={setFilterMissing}
                          options={[
                            { value: 'all', label: 'ทั้งหมด' },
                            { value: 'high', label: 'ขาดบ่อย (สูง)' },
                            { value: 'medium', label: 'ปานกลาง' },
                            { value: 'low', label: 'ขาดน้อย (ต่ำ)' }
                          ]}
                        />

                      </div>
                    </div>
                  </div>
                )}
              </div>

              {!selectedLeave ? (
                <div className="flex flex-col items-center justify-center h-[40vh] text-gray-400">
                  <Calendar size={48} className="mb-4 opacity-20" />
                  <p>กรุณาเลือกครูที่ลาจากด้านซ้ายเพื่อดูตารางสอน</p>
                </div>
              ) : (
                <div className="space-y-4 max-h-[60vh] overflow-y-auto pr-2 custom-scrollbar">
                  {isScheduleLoading && <p className="text-center py-10 text-gray-500">กำลังโหลดตารางสอน...</p>}
                  {!isScheduleLoading && schedules.length === 0 && <p className="text-center py-10 text-gray-500">ไม่พบตารางสอนสำหรับครูท่านนี้ในช่วงเวลาที่ลา</p>}


                  {schedules.map((schedule) => {
                    // Compute available teachers dynamically (reflects cross-slot assignments)
                    const dynamicAvailable = getAvailableTeachersForEntry(schedule);
                    const isForceMode = forceSelectEntries.has(schedule.id);
                    let teacherPool = isForceMode ? getAllTeachersUnrestricted(schedule) : dynamicAvailable;

                    // Ensure the currently-assigned substitute is always in the pool so the
                    // dropdown can display the selected value even if they're now "busy"
                    if (schedule.substituteTeacherId && !teacherPool.find((t: any) => t.value === schedule.substituteTeacherId)) {
                      const currentSub = teachers.find(t => t.value === schedule.substituteTeacherId);
                      if (currentSub) teacherPool = [{ ...currentSub, loadDay: 0, loadWeek: 0 }, ...teacherPool];
                    }

                    const leaveLearningArea = (teacherMap[selectedLeave.teacherDocId] as any)?.learningArea || '';

                    const buildOptions = (pool: any[]) => pool.map((teacher: any) => {
                      const isSameArea = teacher.learningArea === leaveLearningArea;
                      const conflictTag = teacher._isAbsent ? ' ⚠️ลา/ไปราชการ' : teacher._hasConflict ? ' 🔄สอนแทนคาบนี้อยู่' : teacher._isBusy ? ' 📚มีคาบสอน' : '';
                      let suffix = conflictTag;
                      if (!conflictTag && isSameArea) suffix += ' (กลุ่มสาระเดียวกัน)';
                      suffix += ` [วัน:${teacher.loadDay}/วีค:${teacher.loadWeek}]`;
                      return {
                        ...teacher,
                        teacherId: teacher.teacherId || (teacherMap[teacher.value] as any)?.teacherId || 'N/A',
                        profileImageUrl: (teacherMap[teacher.value] as any)?.profileImageUrl || (teacherMap[teacher.value] as any)?.profileImage || '',
                        firstName: (teacherMap[teacher.value] as any)?.firstName || '',
                        lastName: (teacherMap[teacher.value] as any)?.lastName || '',
                        displayLabel: `${teacher.label}${suffix}`,
                        metaLabel: `${teacher.learningArea || 'ไม่ระบุกลุ่มสาระ'}${teacher.homeroomGrade ? ` • ประจำชั้น ${teacher.homeroomGrade}` : ''} • วัน:${teacher.loadDay}/วีค:${teacher.loadWeek}${isSameArea && !conflictTag ? ' • กลุ่มสาระเดียวกัน' : ''}`,
                      };
                    });

                    return (
                      <div key={schedule.id} className="bg-gray-50 dark:bg-[#1e1f21] p-5 rounded-2xl flex flex-col md:flex-row md:items-center justify-between border border-gray-100 dark:border-gray-800 hover:border-indigo-500/30 transition-all group">
                        <div className="mb-4 md:mb-0">
                          <div className="flex items-center gap-2 mb-1 flex-wrap">
                            <span className="text-[10px] font-black uppercase px-2 py-0.5 rounded bg-indigo-100 dark:bg-indigo-500/20 text-indigo-600 dark:text-indigo-400 flex items-center gap-1">
                              <Clock size={10} />
                              {schedule.periodLabel}
                            </span>
                            <span className="text-[10px] font-black uppercase px-2 py-0.5 rounded bg-gray-200 dark:bg-white/10 text-gray-600 dark:text-gray-400">
                              {schedule.day}
                            </span>
                            <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-amber-100 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400 flex items-center gap-1">
                              <Clock size={10} />
                              {schedule.startTime || '--:--'} - {schedule.endTime || '--:--'}
                            </span>
                            <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 flex items-center gap-1">
                              <MapPin size={10} />
                              สถานที่: {schedule.roomName}
                            </span>
                          </div>
                          <p className="font-bold text-lg text-gray-900 dark:text-white">
                            {schedule.subjectName} {schedule.subjectCode ? <span className="text-xs font-normal text-gray-400">({schedule.subjectCode})</span> : null}
                          </p>
                          <p className="text-sm text-indigo-500 font-medium">ชั้น {schedule.className}</p>
                          <div className="flex items-center gap-3 mt-1">
                            <p className="text-xs text-gray-500">
                              {schedule.originalDate.toLocaleDateString('th-TH', { day: 'numeric', month: 'long', year: 'numeric' })}
                            </p>
                          </div>
                          {schedule.substituteTeacherName && (
                            <div className={`mt-2 flex items-center text-xs font-bold w-fit px-2 py-1 rounded-lg ${schedule.isCoTeaching && !schedule.allCoTeachersAbsent ? 'text-blue-400 bg-blue-500/10' : 'text-green-500 bg-green-500/10'}`}>
                              {schedule.isCoTeaching && !schedule.allCoTeachersAbsent
                                ? <Users size={12} className="mr-1" />
                                : <CheckCircle size={12} className="mr-1" />}
                              {schedule.isCoTeaching && !schedule.allCoTeachersAbsent ? 'สอนร่วม (ดูแลแทนอัตโนมัติ): ' : 'สอนแทนโดย: '}
                              {schedule.substituteTeacherName?.replace(/^\[.*?\]\s*/, '') || schedule.substituteTeacherName}
                            </div>
                          )}
                        </div>
                        <div className="flex flex-col gap-2 w-full md:w-[320px] lg:w-[380px] flex-shrink-0">
                          {schedule.isCoTeaching && !schedule.allCoTeachersAbsent ? (
                            <div className="flex items-start gap-2 text-xs font-bold text-blue-400 bg-blue-500/10 px-3 py-2.5 rounded-xl border border-blue-500/20">
                              <Users size={14} className="shrink-0 mt-0.5" />
                              <div className="flex flex-col gap-0.5">
                                <div className="text-[10px] font-black uppercase tracking-wider">มอบหมายอัตโนมัติ (สอนร่วม)</div>
                                <div className="text-blue-200 font-black">{schedule.autoHandledByTeacherName} รับช่วงต่อ</div>
                                {(schedule.absentCoTeacherIds?.length ?? 0) > 0 && (
                                  <div className="text-[10px] text-amber-400/90 mt-0.5">
                                    ครูสอนร่วมที่ลา/ไปราชการ: {schedule.absentCoTeacherIds!.map(id => (teacherMap[id] as any)?.name || id).join(', ')}
                                  </div>
                                )}
                                <div className="text-[10px] text-blue-400/60">
                                  ไล่ลำดับอัตโนมัติ ({(schedule.absentCoTeacherIds?.length ?? 0) + 1}/{(schedule.coTeacherIds?.length ?? 0) + 1} คนลา)
                                </div>
                              </div>
                            </div>
                          ) : (
                            <>
                              {schedule.isCoTeaching && schedule.allCoTeachersAbsent && (
                                <div className="flex items-center gap-1.5 text-[10px] font-black text-red-400 bg-red-500/10 px-2.5 py-1.5 rounded-lg border border-red-500/20">
                                  <AlertTriangle size={10} />
                                  ครูสอนร่วมทุกคนลา/ไปราชการ ({(schedule.coTeacherIds?.length ?? 0) + 1}/{(schedule.coTeacherIds?.length ?? 0) + 1} คน) — ต้องหาครูสอนแทนจากภายนอก
                                </div>
                              )}

                              {/* No available teachers → show warning + force-select button */}
                              {dynamicAvailable.length === 0 && !isForceMode && !schedule.substituteTeacherId && (
                                <div className="flex flex-col gap-2 p-3 rounded-xl bg-rose-500/10 border border-rose-500/30">
                                  <div className="flex items-center gap-2 text-[11px] font-black text-rose-400">
                                    <AlertTriangle size={13} />
                                    ไม่มีครูว่างในคาบนี้ (ครูทุกคนติดคาบหรือลา)
                                  </div>
                                  <p className="text-[10px] text-rose-300/80 leading-relaxed">
                                    ผู้จัดสามารถเลือกครูฉุกเฉินได้โดยไม่ตรวจสอบเงื่อนไข รวมถึงครูที่รับสอนแทนอยู่แล้วหรือจัดตัวเองได้
                                  </p>
                                  <button
                                    onClick={() => setForceSelectEntries(prev => new Set([...prev, schedule.id]))}
                                    className="flex items-center justify-center gap-1.5 py-1.5 rounded-lg bg-rose-500 hover:bg-rose-600 text-white text-[11px] font-black transition-all"
                                  >
                                    <UserPlus size={12} />
                                    เลือกครูฉุกเฉิน (ไม่ตรวจเงื่อนไข)
                                  </button>
                                </div>
                              )}

                              {/* Force-mode banner */}
                              {isForceMode && (
                                <div className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg bg-amber-500/10 border border-amber-500/30 text-[10px] font-black text-amber-400">
                                  <AlertTriangle size={11} />
                                  โหมดฉุกเฉิน — แสดงครูทั้งหมด (⚠️=ลา, 🔄=สอนแทนคาบนี้อยู่, 📚=มีคาบ)
                                  <button onClick={() => setForceSelectEntries(prev => { const n = new Set(prev); n.delete(schedule.id); return n; })} className="ml-auto text-gray-400 hover:text-red-400 transition"><X size={11} /></button>
                                </div>
                              )}

                              {(dynamicAvailable.length > 0 || isForceMode || !!schedule.substituteTeacherId) && (
                                <>
                                  <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">มอบหมายครูสอนแทน</label>
                                  <SubstituteTeacherSelect
                                    value={schedule.substituteTeacherId || ""}
                                    onChange={(teacherId: string) => handleAssignSubstitute(schedule, teacherId)}
                                    options={buildOptions(isForceMode ? teacherPool : getProcessedTeachers(teacherPool))}
                                  />
                                </>
                              )}
                            </>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </MainLayout>
  );
};


export default SubstituteManagementPage;
