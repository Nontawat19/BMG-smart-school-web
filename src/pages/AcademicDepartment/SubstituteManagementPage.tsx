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
} from "firebase/firestore";
import Swal from "sweetalert2";
import { useSearchParams } from "react-router-dom";
import { useSelector, useDispatch } from "react-redux";
import { RootState } from "@/store";
import { Users, Calendar, AlertTriangle, CheckCircle, Clock, Search, MapPin } from "lucide-react";
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
}


interface PeriodSetting {
  id: string; // e.g., 'homeroom', 'period-1', 'lunch'
  label: string;
  startTime: string;
  endTime: string;
  isTeachingPeriod: boolean;
}

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
            : displayName.replace(/^(นาย|นางสาว|นาง|ครู|ผอ\.|ดร\.|ว่าที่\s*ร\.ต\.)\s*/, '').substring(0, 1);

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
  const [calendarEvents, setCalendarEvents] = useState<Record<string, any>>({});
  const [periodSettings, setPeriodSettings] = useState<PeriodSetting[]>([]);
  const [roomMap, setRoomMap] = useState<Record<string, string>>({}); // 📌 สำหรับเก็บข้อมูลห้องเรียน
  const currentUser = useSelector((state: RootState) => state.auth.user);
  const { teachers: teacherMap, status: teacherMapStatus } = useSelector((state: RootState) => state.userMap);
  const calendarState = useSelector((state: RootState) => state.calendar);
  const calendarRawData = calendarState.rawData;
  const teachers = useMemo(() => getActiveSortedTeachers(Object.values(teacherMap || {})).map((t: any) => ({
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
  const dispatch = useDispatch();

  const getScheduleYearTerm = (date?: Date) => {
    const targetDate = date || new Date();
    const targetDateString = formatDateKey(targetDate);
    const matchedTerm = calendarState.terms.find(term =>
      term.startDate && term.endDate && targetDateString >= term.startDate && targetDateString <= term.endDate
    );

    let semester: string;
    if (matchedTerm) {
      // ตรวจสอบเฉพาะ "ที่ 2" เพื่อป้องกัน false-positive จากเลขปี เช่น "ปี 2568"
      const isSemester2 =
        /ที่\s*2(?!\d)/.test(matchedTerm.name) ||
        matchedTerm.id === '2' ||
        /[_\-]2$/.test(matchedTerm.id);
      semester = isSemester2 ? '2' : '1';
    } else {
      semester = String(calendarRawData?.currentTerm || '1');
    }

    return {
      academicYear: String(calendarState.academicYear || getCurrentThaiYear()),
      semester,
    };
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
      const allLeaves = results.flat();

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
          collection: data.collection, // 📌 เก็บชื่อ collection ไว้เพื่อใช้อัปเดตสถานะ
          substituteStatus: data.status === "substitution_assigned" ? "completed" : "pending",
        } as any;
      });

      // เรียงลำดับ
      if (filter === 'upcoming') {
        requests.sort((a, b) => a.startDate.toMillis() - b.startDate.toMillis()); // เร็วๆนี้ขึ้นก่อน
      } else {
        requests.sort((a, b) => b.startDate.toMillis() - a.startDate.toMillis()); // ล่าสุดขึ้นก่อน
      }

      setLeaveRequests(requests);
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

  const handleSelectLeave = async (leave: LeaveRequest) => {
    setSelectedLeave(leave);
    setSchedules([]);
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

      // 2.1 ดึงข้อมูลการสอนแทนที่ถูกบันทึกไว้แล้วสำหรับใบลาใบนี้
      const substitutionQuery = query(
        collection(firestore, "school-settings", schoolId, "substitutions"),
        where("leaveRequestId", "==", leave.id)
      );
      const substitutionSnapshot = await getDocs(substitutionQuery);
      const existingSubstitutions = new Map<string, any>();
      substitutionSnapshot.forEach(subDoc => {
        const subData = subDoc.data();
        const subDateObj = toSafeDate(subData.date);
        const dateString = formatDateKey(subDateObj);
        const key = `${dateString}-${normalizeTeachingPeriod(subData.period)}`;
        existingSubstitutions.set(key, { id: subDoc.id, ...subData });
      });

      // Pre-compute teacher loads and busy-slot map จาก termScheduleDocs ครั้งเดียว
      // เพื่อหลีกเลี่ยง O(ครู × schedules × slots) ต่อคาบ
      const preComputedDayLoads: Record<string, Record<string, number>> = {};
      const preComputedWeekLoad: Record<string, number> = {};
      const slotBusyMap: Record<string, Set<string>> = {};
      // ป้องกัน double-count เมื่อครูปรากฏใน docs หลายใบสำหรับ slot เดียวกัน
      const seenTeacherSlots = new Set<string>();

      termScheduleDocs.forEach((classScheduleDoc: any) => {
        const schedule = classScheduleDoc.schedule || {};
        Object.keys(schedule).forEach(slotKey => {
          const rawCourse = schedule[slotKey];
          if (!rawCourse) return;
          const coursesArr = Array.isArray(rawCourse) ? rawCourse : [rawCourse];
          const dayKey = slotKey.split('-')[0];
          const teacherIds = new Set<string>();
          if (classScheduleDoc.teacherId) teacherIds.add(classScheduleDoc.teacherId);
          coursesArr.forEach((c: any) => { if (c?.teacherId) teacherIds.add(c.teacherId); });
          if (!slotBusyMap[slotKey]) slotBusyMap[slotKey] = new Set();
          teacherIds.forEach(tid => {
            slotBusyMap[slotKey].add(tid);
            const dedupKey = `${tid}-${slotKey}`;
            if (!seenTeacherSlots.has(dedupKey)) {
              seenTeacherSlots.add(dedupKey);
              preComputedWeekLoad[tid] = (preComputedWeekLoad[tid] || 0) + 1;
              if (!preComputedDayLoads[dayKey]) preComputedDayLoads[dayKey] = {};
              preComputedDayLoads[dayKey][tid] = (preComputedDayLoads[dayKey][tid] || 0) + 1;
            }
          });
        });
      });

      const findAvailableTeachers = (date: Date, periodIndex: number) => {
        const checkDayKey = getEffectiveScheduleDay(date).scheduleDayKey;
        const checkSlotKey = `${checkDayKey}-${periodIndex}`;
        const busyTeacherIds = slotBusyMap[checkSlotKey] || new Set<string>();

        return teachers
          .filter(t => {
            if (busyTeacherIds.has(t.value)) return false;
            if (t.value === leave.teacherDocId) return false;
            const prefs = (t as any).preferences;
            if (prefs?.unavailableDays?.includes(checkDayKey)) return false;
            if (prefs?.unavailableSlots?.includes(checkSlotKey)) return false;
            return true;
          })
          .map(t => ({
            ...t,
            loadDay: preComputedDayLoads[checkDayKey]?.[t.value] || 0,
            loadWeek: preComputedWeekLoad[t.value] || 0,
          }));
      };

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
              const pIdxMatch = slot.match(/(\d+)$/);
              const pIdx = pIdxMatch ? parseInt(pIdxMatch[1]) : -1;
              const setting = periodSettings[pIdx];
              
              if (!setting) continue;

              // Parse actual period number from ID (e.g., 'period-1' -> 1)
              const periodNumber = normalizeTeachingPeriod(parseInt(setting.id.replace('period-', '')), pIdx + 1);
              const substitutionKey = `${dateString}-${periodNumber}`;
              const existingSub = existingSubstitutions.get(substitutionKey);

              const rawCourse = classSchedule[slot];
              const coursesArray = Array.isArray(rawCourse) ? rawCourse : [rawCourse];
              const coursesForTeacher = coursesArray.filter((course: any) => !course?.teacherId || course.teacherId === leave.teacherDocId);

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
                  availableTeachers: findAvailableTeachers(currentDate, pIdx),
                  roomName: (Array.isArray(course?.room) ? course.room : (course?.room ? [course.room] : (scheduleData.roomIds || [])))
                    .map((id: string) => roomMap[id] || id)
                    .join(', ') || 'ไม่ระบุสถานที่',
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

  const handleAssignSubstitute = async (scheduleEntry: ScheduleEntry, substituteTeacherId: string) => {
    const substitute = teachers.find((t: { value: string; }) => t.value === substituteTeacherId);
    if (!substitute || !selectedLeave || !schoolId) return;

    // 📌 เพิ่ม: ดึงข้อมูลครูที่ถูกสอนแทนคนเก่า (ถ้ามี) เพื่อส่งแจ้งเตือนยกเลิก
    const oldSubstituteId = scheduleEntry.substituteTeacherId;
    const oldSubstitute = oldSubstituteId ? teachers.find((t: { value: string; }) => t.value === oldSubstituteId) : null;

    try {
      let substitutionDocId = scheduleEntry.substitutionDocId;
      const substitutionsCollectionRef = collection(firestore, "school-settings", schoolId, "substitutions");
      // 📌 ตรวจสอบว่าเคยมีการมอบหมายคาบนี้แล้วหรือยัง
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
        // ถ้ายังไม่มี ให้สร้าง document ใหม่
        const substitutionRef = doc(substitutionsCollectionRef);
        substitutionDocId = substitutionRef.id; // เก็บ ID ที่สร้างใหม่
        await setDoc(substitutionRef, {
          id: substitutionRef.id,
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
          createdAt: Timestamp.now(),
        });
      }

      // 📌 เพิ่ม: สร้างการแจ้งเตือนสำหรับครูที่ได้รับมอบหมาย
      const substitutionDate = scheduleEntry.originalDate.toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: 'numeric' });
      const newTeacherNotificationMessage = `คุณได้รับมอบหมายให้สอนแทนวิชา ${scheduleEntry.subjectName} (${scheduleEntry.className}) ในวันที่ ${substitutionDate} คาบที่ ${scheduleEntry.period} เนื่องจากคุณครู ${selectedLeave.teacherName} ${selectedLeave.leaveType}`;

      const dateYear = scheduleEntry.originalDate.getFullYear();
      const dateMonth = String(scheduleEntry.originalDate.getMonth() + 1).padStart(2, '0');
      const dateDay = String(scheduleEntry.originalDate.getDate()).padStart(2, '0');
      const dateStr = `${dateYear}-${dateMonth}-${dateDay}`;

      await addDoc(collection(firestore, "school-settings", schoolId, "notifications"), {
        userId: substitute.uid, // 📌 แก้ไข: ใช้ uid ของครูเพื่อให้ Navbar ดึงข้อมูลเจอ
        message: newTeacherNotificationMessage,
        createdAt: Timestamp.now(),
        isRead: false,
        link: `/academic/classroom-attendance?date=${dateStr}&selectSub=${substitutionDocId}`, // นำทางไปยังหน้าเช็คชื่อ
      });


      // 📌 เพิ่ม: หากมีการเปลี่ยนแปลงครูสอนแทน (ไม่ใช่การมอบหมายครั้งแรก และครูคนใหม่ไม่ซ้ำคนเก่า) ให้ส่งแจ้งเตือนไปหาครูคนเก่าด้วย
      if (oldSubstitute && oldSubstitute.uid !== substitute.uid) {
        const oldTeacherNotificationMessage = `การสอนแทนวิชา ${scheduleEntry.subjectName} (${scheduleEntry.className}) ในวันที่ ${substitutionDate} คาบที่ ${scheduleEntry.period} ของคุณได้ถูกเปลี่ยนแปลง/ยกเลิก`;
        await addDoc(collection(firestore, "school-settings", schoolId, "notifications"), {
          userId: oldSubstitute.uid,
          message: oldTeacherNotificationMessage,
          createdAt: Timestamp.now(),
          isRead: false,
          link: `/academic/classroom-attendance?date=${dateStr}`,
        });
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
        // อัปเดตสถานะของใบลาเป็น 'substitution_assigned'
        // 📌 แก้ไข: ใช้ collection ที่ถูกต้อง (leave_summary หรือ travel_summary)
        const collectionName = (selectedLeave as any).collection || "leave_summary";
        const leaveRequestRef = doc(firestore, "school-settings", schoolId, "teachers", selectedLeave.teacherDocId, collectionName, selectedLeave.id);
        await updateDoc(leaveRequestRef, { status: "substitution_assigned" });

        // อัปเดตสถานะใน UI ทั้งหมดในครั้งเดียว
        setSelectedLeave({ ...selectedLeave, status: "substitution_assigned", substituteStatus: "completed" });
        setLeaveRequests(currentRequests => currentRequests.map(lr => lr.id === selectedLeave.id ? { ...lr, status: "substitution_assigned", substituteStatus: "completed" } : lr));
      }
    } catch (error) {
      console.error("Error assigning substitute:", error);
      Swal.fire("เกิดข้อผิดพลาด", "ไม่สามารถบันทึกข้อมูลการสอนแทนได้", "error");
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
              <div className="space-y-3 max-h-[60vh] overflow-y-auto">
                {isLoading && <p>กำลังโหลด...</p>}
                {!isLoading && leaveRequests.length === 0 && <p className="text-gray-500 dark:text-gray-400">ไม่มีคำขอลาที่ต้องการสอนแทน</p>}
                {leaveRequests.map((leave) => (
                  <div key={leave.id} onClick={() => handleSelectLeave(leave)}
                    className={`p-3 rounded-lg cursor-pointer transition-all ${selectedLeave?.id === leave.id ? 'bg-indigo-600 shadow-lg text-white' : 'bg-gray-50 dark:bg-[#1e1f21] hover:bg-gray-100 dark:hover:bg-indigo-500/20'}`}>
                    <div className="flex justify-between items-start">
                      <p className={`font-bold ${selectedLeave?.id === leave.id ? 'text-white' : 'text-gray-900 dark:text-white'}`}>{leave.teacherName}</p>
                      <div className="flex items-center gap-1.5">
                        {!leave.approvedBy && (leave.status === "pending" || leave.status === "substitution_assigned") && (
                          <span className={`text-[10px] px-1.5 py-0.5 rounded font-black ${selectedLeave?.id === leave.id ? 'bg-white/20 text-white animate-pulse' : 'bg-amber-500/15 text-amber-500 border border-amber-500/20'}`}>
                            รออนุมัติ
                          </span>
                        )}
                        {leave.substituteStatus === 'completed' ? <CheckCircle size={18} className="text-green-400" /> : <AlertTriangle size={18} className="text-yellow-400" />}
                      </div>
                    </div>
                    <p className={`text-sm ${selectedLeave?.id === leave.id ? 'text-indigo-100' : 'text-gray-600 dark:text-gray-300'}`}>{leave.leaveType}</p>
                    <p className={`text-xs ${selectedLeave?.id === leave.id ? 'text-indigo-200' : 'text-gray-500 dark:text-gray-400'}`}>{leave.startDateString} - {leave.endDateString}</p>
                  </div>
                ))}
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
                  {schedules.map((schedule) => (
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
                            {periodSettings[schedule.periodIndex]?.startTime || '--:--'} - {periodSettings[schedule.periodIndex]?.endTime || '--:--'}
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
                          <div className="mt-2 flex items-center text-xs font-bold text-green-500 bg-green-500/10 w-fit px-2 py-1 rounded-lg">
                            <CheckCircle size={12} className="mr-1" /> สอนแทนโดย: {schedule.substituteTeacherName?.replace(/^\[.*?\]\s*/, '') || schedule.substituteTeacherName}
                          </div>
                        )}
                      </div>
                      <div className="flex flex-col gap-2 w-full md:w-[320px] lg:w-[380px] flex-shrink-0">
                        <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">มอบหมายครูสอนแทน</label>
                        <SubstituteTeacherSelect
                          value={schedule.substituteTeacherId || ""}
                          onChange={(teacherId: string) => handleAssignSubstitute(schedule, teacherId)}
                          options={getProcessedTeachers(schedule.availableTeachers).map((teacher: any) => {
                            const isSameArea = teacher.learningArea === (teacherMap[selectedLeave.teacherDocId] as any)?.learningArea;

                            let suffix = "";
                            if (isSameArea) suffix += " (กลุ่มสาระเดียวกัน)";
                            suffix += ` [วัน:${teacher.loadDay}/วีค:${teacher.loadWeek}]`;

                            return {
                              ...teacher,
                              teacherId: teacher.teacherId || (teacherMap[teacher.value] as any)?.teacherId || 'N/A',
                              profileImageUrl: (teacherMap[teacher.value] as any)?.profileImageUrl || (teacherMap[teacher.value] as any)?.profileImage || '',
                              firstName: (teacherMap[teacher.value] as any)?.firstName || '',
                              lastName: (teacherMap[teacher.value] as any)?.lastName || '',
                              displayLabel: `${teacher.label}${suffix}`,
                              metaLabel: `${teacher.learningArea || 'ไม่ระบุกลุ่มสาระ'}${teacher.homeroomGrade ? ` • ประจำชั้น ${teacher.homeroomGrade}` : ''} • วัน:${teacher.loadDay}/วีค:${teacher.loadWeek}${isSameArea ? ' • กลุ่มสาระเดียวกัน' : ''}`,
                            };
                          })}
                        />
                      </div>
                    </div>
                  ))}
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
