import React, { useState, useEffect } from "react";
import { useSelector } from "react-redux";
import { firestore } from "@/firebase";
import { RootState } from "../../store";
import {
  collection,
  query,
  where,
  getDocs,
  doc,
  setDoc,
  getDoc,
  Timestamp,
  writeBatch,
  onSnapshot,
  collectionGroup,
  increment,
  serverTimestamp,
  runTransaction,
  DocumentReference,
} from "firebase/firestore";
import { updatePeriodSummaries } from "@/utils/periodSummaryUtils";
import { getRulePoints } from "@/utils/behaviorScoreUtils";
import {
  calculateAttendanceStatus,
  GateRecord,
  FlagRecord,
  LeaveRecord,
  TravelRecord
} from "@/utils/attendanceLogic";
import Swal from "sweetalert2";
import { FaCheck, FaTimes, FaClock, FaUserSlash, FaUserGraduate } from "react-icons/fa";
import { CalendarOff, Sparkles, School, ArrowLeft } from "lucide-react";
import { useNavigate } from "react-router-dom";
import MainLayout from "@/layouts/MainLayout";
import SkeletonLoader from "@/components/SkeletonLoader";
import { isNonOfficialHoliday } from "../../utils/calendarUtils";
import { getStudentStatus } from "@/utils/studentStatusUtils";
import { isActiveStudentSummaryStatus } from "@/utils/ownerStatsUtils";
import { normalizeLineRegistrationValue } from "@/utils/lineRegistrationUtils";
import { usePwaMode } from "@/hooks/usePwaMode";

interface Student {
  id: string;
  name: string;
  profileImageUrl: string;
  profileImageThumbUrl?: string;
  studentId: string;
  class: string;
  attendanceStatus?: "มา" | "สาย" | "ลา" | "ขาด";
  isLeave: boolean; // 📌 เพิ่ม: property สำหรับตรวจสอบว่านักเรียนลาหรือไม่
  parentLineUserIds?: string[]; // 📌 เพิ่ม: เก็บ ID ผู้ปกครองเพื่อลดการ Query ซ้ำ
  parentLineRegistrationContexts?: Record<string, { liffId?: string; classLevel?: string; room?: string }>;
  lineRegistrationReviewRequired?: boolean;
  behaviorScore?: number;
  flagAction?: FlagAction;
  existingDailyStatus?: string | null;
  existingBehaviorScoreStatus?: string | null;
  existingFlagBehaviorScoreStatus?: string | null;
  status?: string;
  studentStatus?: string;
  _flagSavedToday?: boolean;
}

interface FoundUser {
  id: string;
  type: "student" | "teacher";
  name: string;
  profileImageUrl: string;
  displayId: string;
  latestActionTime?: string;
  status?: string;
  grade?: string;
}

const ATTENDANCE_STATUS = {
  PRESENT: "มา",
  LATE: "สาย",
  LEAVE: "ลา",
  ABSENT: "ขาด",
} as const;

type AttendanceStatus = (typeof ATTENDANCE_STATUS)[keyof typeof ATTENDANCE_STATUS];

type FlagAction =
  | "normal"
  | "sickLeave"
  | "personalLeave"
  | "cancelFlag"
  | "noScanPresentNoDeduct"
  | "noScanPresentDeduct"
  | "scannedAbsentDeduct"
  | "cancelFlagKeepGate";

type SelectionSnapshot = {
  flagAction?: FlagAction;
  attendanceStatus?: AttendanceStatus;
};

const FLAG_ACTION_OPTIONS: { value: FlagAction; label: string }[] = [
  { value: "normal", label: "เข้าแถวปกติ" },
  { value: "sickLeave", label: "ลาป่วย" },
  { value: "personalLeave", label: "ลากิจ" },
  { value: "cancelFlag", label: "ยกเลิกการเช็คแถว" },
  { value: "noScanPresentNoDeduct", label: "ไม่สแกนแต่มาเข้าแถวไม่หักคะแนน (ลงเวลาปกติ)" },
  { value: "noScanPresentDeduct", label: "ไม่สแกนแต่มาเข้าแถวและหักคะแนน (ไม่ลงเวลา บัตร Lock)" },
  { value: "scannedAbsentDeduct", label: "สแกนแต่ไม่มาเข้าแถวหักคะแนน" },
  { value: "cancelFlagKeepGate", label: "ยกเลิกการเช็คแถว และเวลาสแกนเข้า" },
];

const getDefaultFlagAction = (status?: AttendanceStatus): FlagAction => {
  if (status === ATTENDANCE_STATUS.LEAVE) return "sickLeave";
  return "normal";
};

const getFlagActionLabel = (action?: FlagAction) => (
  FLAG_ACTION_OPTIONS.find(option => option.value === action)?.label || ""
);

const getFlagActionTone = (action?: FlagAction | null, fallbackStatus?: AttendanceStatus | null) => {
  switch (action) {
    case "sickLeave":
    case "personalLeave":
      return {
        card: "border-blue-500/50 bg-blue-50/50 dark:bg-blue-500/10 shadow-[0_0_15px_rgba(59,130,246,0.1)]",
        badge: "bg-blue-100 text-blue-700 dark:bg-blue-500/20 dark:text-blue-300",
        dot: "bg-blue-500",
      };
    case "noScanPresentDeduct":
    case "scannedAbsentDeduct":
      return {
        card: "border-amber-500/50 bg-amber-50/50 dark:bg-amber-500/10 shadow-[0_0_15px_rgba(245,158,11,0.1)]",
        badge: "bg-amber-100 text-amber-700 dark:bg-amber-500/20 dark:text-amber-300",
        dot: "bg-amber-500",
      };
    case "cancelFlag":
    case "cancelFlagKeepGate":
      return {
        card: "border-slate-400/50 bg-slate-50/70 dark:bg-slate-500/10",
        badge: "bg-slate-100 text-slate-700 dark:bg-slate-500/20 dark:text-slate-200",
        dot: "bg-slate-400",
      };
    case "noScanPresentNoDeduct":
      return {
        card: "border-emerald-500/50 bg-emerald-50/50 dark:bg-emerald-500/10 shadow-[0_0_15px_rgba(16,185,129,0.1)]",
        badge: "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-300",
        dot: "bg-green-500",
      };
    default:
      if (fallbackStatus === ATTENDANCE_STATUS.LATE) {
        return {
          card: "border-amber-500/50 bg-amber-50/50 dark:bg-amber-500/10 shadow-[0_0_15px_rgba(245,158,11,0.1)]",
          badge: "bg-amber-100 text-amber-700 dark:bg-amber-500/20 dark:text-amber-300",
          dot: "bg-yellow-500",
        };
      }
      if (fallbackStatus === ATTENDANCE_STATUS.LEAVE) {
        return {
          card: "border-blue-500/50 bg-blue-50/50 dark:bg-blue-500/10 shadow-[0_0_15px_rgba(59,130,246,0.1)]",
          badge: "bg-blue-100 text-blue-700 dark:bg-blue-500/20 dark:text-blue-300",
          dot: "bg-blue-500",
        };
      }
      if (fallbackStatus === ATTENDANCE_STATUS.ABSENT) {
        return {
          card: "border-rose-500/50 bg-rose-50/50 dark:bg-rose-500/10 shadow-[0_0_15px_rgba(244,63,94,0.1)]",
          badge: "bg-rose-100 text-rose-700 dark:bg-rose-500/20 dark:text-rose-300",
          dot: "bg-red-500",
        };
      }
      return {
        card: "border-emerald-500/50 bg-emerald-50/50 dark:bg-emerald-500/10 shadow-[0_0_15px_rgba(16,185,129,0.1)]",
        badge: "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-300",
        dot: "bg-green-500",
      };
  }
};

const getFlagDisplayLabel = (action?: FlagAction | null, status?: AttendanceStatus | null) => (
  action && action !== "normal" ? getFlagActionLabel(action) : (status || ATTENDANCE_STATUS.ABSENT)
);

const getStatusFromAction = (action: FlagAction, student?: any): AttendanceStatus => {
  switch (action) {
    case "sickLeave":
    case "personalLeave":
      return ATTENDANCE_STATUS.LEAVE;
    case "noScanPresentDeduct":
    case "scannedAbsentDeduct":
      return ATTENDANCE_STATUS.LATE;
    case "cancelFlag": {
      // ต้องตรงกับ resolveFlagActionResult: ถ้ามีสแกนบัตรที่ประตูอยู่แล้วให้คงสถานะ มา/สาย
      // ตามประตูไว้ ถ้าไม่มีเลยถือว่า "ขาด" เพราะไม่เหลือหลักฐานการมาเรียนวันนี้จากกลไกนี้
      const gateData = student?._gateData;
      if (gateData?.checkinTime) {
        return gateData.status === "สาย" || gateData.status === "late"
          ? ATTENDANCE_STATUS.LATE
          : ATTENDANCE_STATUS.PRESENT;
      }
      return ATTENDANCE_STATUS.ABSENT;
    }
    case "cancelFlagKeepGate":
      // ลบทั้งการเช็คแถวและเวลาสแกนเข้าออกทิ้งทั้งหมด ไม่เหลือหลักฐานการมาเรียนวันนี้เลย
      // (ตรงกับ resolveFlagActionResult ที่ finalStatusKey เป็น null) ตัวสรุปด้านบนจึงต้องนับเป็น "ขาด"
      // ไม่ใช่ "มา" ไม่งั้นยอดสรุปหน้าจอจะไม่ตรงกับข้อมูลจริงหลังบันทึก
      return ATTENDANCE_STATUS.ABSENT;
    case "normal": {
      // ครูเลือก "เข้าแถวปกติ" แปลว่าไม่มีอะไรผิดปกติ ให้ยึดหลักฐานจริงที่มี:
      // - มีสแกนบัตรที่ประตู -> ใช้สถานะตามประตู (สาย ก็ยังต้องเป็น "สาย" ห้ามฟอกเป็น "มา"
      //   ไม่งั้นคะแนนที่หักไปตอนเช้าจะถูกคืนโดยไม่ตั้งใจทั้งที่นักเรียนมาสายจริง)
      // - ไม่มีสแกนบัตรเลย -> ครูยืนยันด้วยสายตาว่ามาจริง นับเป็น "มา" (ไม่ใช่ "ขาด")
      const gateData = student?._gateData;
      if (gateData?.checkinTime) {
        return gateData.status === "สาย" || gateData.status === "late"
          ? ATTENDANCE_STATUS.LATE
          : ATTENDANCE_STATUS.PRESENT;
      }
      return ATTENDANCE_STATUS.PRESENT;
    }
    default:
      return ATTENDANCE_STATUS.PRESENT;
  }
};

const toThaiAttendanceStatus = (statusKey?: string | null) => {
  switch (statusKey) {
    case "present": return ATTENDANCE_STATUS.PRESENT;
    case "late": return ATTENDANCE_STATUS.LATE;
    case "leave": return ATTENDANCE_STATUS.LEAVE;
    case "officialTravel": return "ไปร่วมกิจกรรม";
    default: return ATTENDANCE_STATUS.ABSENT;
  }
};

const getFlagBehaviorStatus = (action?: FlagAction | null) => (
  action ? `flag:${action}` : null
);

const isFlagDeductionAction = (action?: FlagAction | null) => (
  !!action && action !== "cancelFlag" && action !== "cancelFlagKeepGate"
);

const getDynamicFlagActionLabel = (action: FlagAction, config: any) => {
  const baseLabel = getFlagActionLabel(action);
  if (!config) return baseLabel;

  const flagBehaviorStatus = getFlagBehaviorStatus(action);
  if (!flagBehaviorStatus) return baseLabel;

  const points = getRulePoints(config, flagBehaviorStatus);
  if (points > 0) {
    return `${baseLabel} (หัก ${points} คะแนน)`;
  }
  return baseLabel;
};

// Helper: แปลงสถานะเป็น Key ภาษาอังกฤษสำหรับ Aggregation
const getFlagStatusKey = (status?: AttendanceStatus | null) => {
  if (!status) return null;
  switch (status) {
    case ATTENDANCE_STATUS.PRESENT: return 'present';
    case ATTENDANCE_STATUS.LATE: return 'late';
    case ATTENDANCE_STATUS.LEAVE: return 'leave';
    case ATTENDANCE_STATUS.ABSENT: return 'absent';
    default: return null;
  }
};

const StudentCardSkeleton: React.FC = () => (
  <div className="relative group rounded-2xl p-4 sm:p-6 border-2 border-gray-200 dark:border-gray-700 bg-white dark:bg-[#2a2b2f]">
    <div className="flex flex-row sm:flex-col items-center gap-4 animate-pulse">
      <div className="relative flex-shrink-0">
        <SkeletonLoader className="w-16 h-16 sm:w-24 sm:h-24 rounded-full" />
      </div>
      <div className="flex-grow min-w-0 w-full text-left sm:text-center space-y-2 sm:mt-2">
        <SkeletonLoader className="h-5 w-3/4 mx-auto rounded-md" />
        <SkeletonLoader className="h-4 w-1/2 mx-auto rounded-md" />
      </div>
      <div className="w-full grid grid-cols-4 gap-2 mt-4 sm:mt-2">
        <SkeletonLoader className="h-9 rounded-xl" />
        <SkeletonLoader className="h-9 rounded-xl" />
        <SkeletonLoader className="h-9 rounded-xl" />
        <SkeletonLoader className="h-9 rounded-xl" />
      </div>
    </div>
  </div>
);

const FlagCeremonyPageSkeleton: React.FC = () => (
  <>
    {/* Summary Cards Skeleton */}
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
      {[...Array(4)].map((_, i) => (
        <div key={i} className="bg-white dark:bg-[#2a2b2f] rounded-2xl p-4 border border-gray-100 dark:border-gray-700 shadow-sm flex items-center justify-between animate-pulse">
          <div className="space-y-2">
            <SkeletonLoader className="h-4 w-16 rounded" />
            <SkeletonLoader className="h-8 w-10 rounded" />
          </div>
          <SkeletonLoader className="w-12 h-12 rounded-xl" />
        </div>
      ))}
    </div>

    {/* Sticky Action Bar Skeleton */}
    <div className="flex justify-between items-center bg-white dark:bg-[#2a2b2f] p-4 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 sticky top-[70px] z-10 animate-pulse">
      <div className="flex items-center gap-2">
        <SkeletonLoader className="w-10 h-10 rounded-lg" />
        <SkeletonLoader className="h-6 w-40 rounded-md" />
      </div>
      <SkeletonLoader className="h-11 w-36 rounded-xl" />
    </div>

    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 sm:gap-6">
      {[...Array(8)].map((_, i) => <StudentCardSkeleton key={i} />)}
    </div>
  </>
);

const FlagCeremonyPage: React.FC = () => {
  const navigate = useNavigate();
  const isPwaStandaloneMode = usePwaMode();
  const [isMobileScreen, setIsMobileScreen] = useState(false);

  useEffect(() => {
    const handleResize = () => {
      setIsMobileScreen(window.innerWidth < 768);
    };
    handleResize();
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  const isPwaMode = isPwaStandaloneMode || isMobileScreen;
  const { user } = useSelector((state: RootState) => state.auth);
  const schoolId = user?.schoolId;
  const [selectedClass, setSelectedClass] = useState<string>("");
  const [students, setStudents] = useState<Student[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isAlreadySaved, setIsAlreadySaved] = useState(false); // 📌 เพิ่ม: state สำหรับตรวจสอบว่าบันทึกข้อมูลไปแล้วหรือยัง
  const [originalAttendanceMap, setOriginalAttendanceMap] = useState<Map<string, AttendanceStatus>>(new Map());
  const [isHomeroom, setIsHomeroom] = useState(false);
  const [calendarEvents, setCalendarEvents] = useState<Record<string, any>>({});
  const getTodayString = () => new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Bangkok" });
  const [availableLevels, setAvailableLevels] = useState<string[]>([]);
  const [selectedClassLevel, setSelectedClassLevel] = useState<string>('');
  const [selectedRoom, setSelectedRoom] = useState<string>('');
  const todayStr = getTodayString();
  const todayEvent = calendarEvents[todayStr];
  const [studentCheckinEnd, setStudentCheckinEnd] = useState("08:00"); // Default fallback
  const [currentAcademicYear, setCurrentAcademicYear] = useState<string>("");
  const [behaviorScoreConfig, setBehaviorScoreConfig] = useState<any>(null);
  // เริ่มต้นเป็นค่าว่าง (ยังไม่ได้เลือก) โดยตั้งใจ — บังคับให้ครูต้องเลือกสถานะเองก่อนเสมอ
  // ไม่ให้มี action ที่ถูกเลือกไว้ล่วงหน้าแบบไม่ตั้งใจ (เช่นคลิกการ์ดนักเรียนโดยไม่ทันสังเกตว่า
  // ดรอปดาวน์รวมยังเป็น "เข้าแถวปกติ" ค้างอยู่ ทำให้เผลอบันทึกสถานะผิดโดยไม่รู้ตัว)
  const [selectedFlagAction, setSelectedFlagAction] = useState<FlagAction | "">("");
  const [selectedStudentIds, setSelectedStudentIds] = useState<Set<string>>(new Set());
  const [selectionSnapshots, setSelectionSnapshots] = useState<Map<string, SelectionSnapshot>>(new Map());

  const dayOfWeek = new Date().toLocaleString('en-US', { timeZone: 'Asia/Bangkok', weekday: 'short' });
  const isWeekend = dayOfWeek === 'Sat' || dayOfWeek === 'Sun';

  let isHoliday = false;
  let holidayDescription = "";

  if (todayEvent?.type === 'schoolDay') {
    isHoliday = false; // มีการเรียนการสอน (เช่น ชดเชย)
  } else if (todayEvent?.type === 'holiday') {
    isHoliday = true;
    holidayDescription = todayEvent.description || "วันหยุดราชการ";
  } else if (todayEvent?.type === 'specialHoliday') {
    isHoliday = true;
    holidayDescription = todayEvent.description || "วันหยุดกรณีพิเศษ";
  } else if (isWeekend) {
    isHoliday = true;
    holidayDescription = "วันหยุดประจำสัปดาห์";
  }

  // ตรวจสอบว่าเป็นครูประจำชั้นหรือไม่
  useEffect(() => {
    const checkTeacherStatus = async () => {
      if (user?.uid && schoolId) {
        try {
          const teacherRef = doc(firestore, "school-settings", schoolId, "teachers", user.uid);
          const snap = await getDoc(teacherRef);
          if (snap.exists()) {
            const data = snap.data();
            if (data.isHomeroomTeacher && data.homeroomGrade) {
              if (data.homeroomRoom) {
                setSelectedClass(`${data.homeroomGrade}/${data.homeroomRoom}`);
              } else {
                setSelectedClass(data.homeroomGrade);
              }
              setIsHomeroom(true);
            }
          }
        } catch (error) {
          console.error("Error checking teacher status:", error);
        }
      }
    };
    checkTeacherStatus();
  }, [user, schoolId]);

  // Synchronize manual class level and room selectors with selectedClass
  useEffect(() => {
    if (!isHomeroom) {
      if (selectedClassLevel && selectedRoom) {
        setSelectedClass(`${selectedClassLevel}/${selectedRoom}`);
      } else if (selectedClassLevel) {
        setSelectedClass(selectedClassLevel);
      } else {
        setSelectedClass("");
      }
    }
  }, [selectedClassLevel, selectedRoom, isHomeroom]);


  useEffect(() => {
    const fetchLevels = async () => {
      if (!schoolId) return;
      try {
        const schoolRef = doc(firestore, "school-settings", schoolId);
        const schoolSnap = await getDoc(schoolRef);
        if (schoolSnap.exists()) {
          const data = schoolSnap.data();
          const levelRange = data.opportunityExpansionLevel;

          const primary = ["ป.1", "ป.2", "ป.3", "ป.4", "ป.5", "ป.6"];
          const junior = ["ม.1", "ม.2", "ม.3"];
          const senior = ["ม.4", "ม.5", "ม.6"];

          let levels: string[] = [];
          if (levelRange === 'ป.1-ป.6') levels = primary;
          else if (levelRange === 'ม.1-ม.6') levels = [...junior, ...senior];
          else if (levelRange === 'ป.1-ม.3') levels = [...primary, ...junior];
          else if (levelRange === 'ป.1-ม.6') levels = [...primary, ...junior, ...senior];
          else {
            levels = [...primary, ...junior, ...senior];
          }
          setAvailableLevels(levels);
        }
      } catch (error) {
        console.error("Error fetching school levels:", error);
      }
    };
    fetchLevels();
    if (!schoolId) return;
    const calendarRef = doc(firestore, "school-settings", schoolId as string, "main_calendar", "default");
    const unsubscribeCalendar = onSnapshot(calendarRef, (docSnap) => {
      if (docSnap.exists()) {
        const data = docSnap.data();
        setCalendarEvents(data.events || {});
        if (data.academicYear) {
          setCurrentAcademicYear(data.academicYear);
        }
      }
    });

    const configRef = doc(firestore, "school-settings", schoolId as string);
    const unsubscribeConfig = onSnapshot(configRef, (docSnap) => {
      if (docSnap.exists()) {
        const data = docSnap.data();
        if (data.attendanceConfig?.studentLateTime) {
          setStudentCheckinEnd(data.attendanceConfig.studentLateTime);
        }
        setBehaviorScoreConfig(data.behaviorScoreConfig || null);
      }
    });

    return () => {
      unsubscribeCalendar();
      unsubscribeConfig();
    };
  }, [schoolId]);

  useEffect(() => {
    if (!schoolId) return;

    const fetchCalendarData = async () => {
      // 1. Real-time listener for Firestore (School Settings)
      const docRef = doc(firestore, 'school-settings', schoolId, 'main_calendar', 'default');

      const unsubscribe = onSnapshot(docRef, (docSnap) => {
        if (docSnap.exists()) {
          const data = docSnap.data();
          if (data.events) {
            setCalendarEvents(data.events);
            return;
          }
        }

        // 2. Fallback: Fetch from Google Calendar API if Firestore is empty/missing
        const apiKey = import.meta.env.VITE_GOOGLE_CALENDAR_API_KEY;
        if (apiKey) {
          fetchGoogleCalendar(apiKey);
        }
      }, (error) => {
        console.error("Error listening to calendar:", error);
      });

      return () => unsubscribe();
    };

    fetchCalendarData();
  }, [schoolId]);

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

  useEffect(() => {
    if (!selectedClass || !schoolId) {
      setStudents([]);
      setSelectedStudentIds(new Set());
      setIsAlreadySaved(false);
      return;
    }

    const fetchClassData = async () => {
      setIsLoading(true);
      setError(null);
      setIsAlreadySaved(false);
      setSelectedStudentIds(new Set());
      setOriginalAttendanceMap(new Map());
      try {
        // 1. ดึงข้อมูลนักเรียนเฉพาะห้องที่เลือก (ยังคงจำเป็นเพื่อแสดงรายชื่อทั้งหมด)
        // 1. ดึงข้อมูลนักเรียน
        let studentsQuery;
        const primaryLevels = ["ป.1", "ป.2", "ป.3", "ป.4", "ป.5", "ป.6"];
        const juniorLevels = ["ม.1", "ม.2", "ม.3"];
        const seniorLevels = ["ม.4", "ม.5", "ม.6"];

        if (selectedClass.includes('/')) {
          const [classLevel, room] = selectedClass.split('/');
          studentsQuery = query(
            collection(firestore, "school-settings", schoolId, "students"),
            where("classLevel", "==", classLevel),
            where("room", "==", room)
          );
        } else if (selectedClass === "ประถมศึกษา" || selectedClass === "ชั้นประถมศึกษา") {
          studentsQuery = query(
            collection(firestore, "school-settings", schoolId, "students"),
            where("classLevel", "in", primaryLevels)
          );
        } else if (selectedClass === "มัธยมศึกษาตอนต้น" || selectedClass === "ชั้นมัธยมศึกษาตอนต้น") {
          studentsQuery = query(
            collection(firestore, "school-settings", schoolId, "students"),
            where("classLevel", "in", juniorLevels)
          );
        } else if (selectedClass === "มัธยมศึกษาตอนปลาย" || selectedClass === "ชั้นมัธยมศึกษาตอนปลาย") {
          studentsQuery = query(
            collection(firestore, "school-settings", schoolId, "students"),
            where("classLevel", "in", seniorLevels)
          );
        } else {
          studentsQuery = query(
            collection(firestore, "school-settings", schoolId, "students"),
            where("classLevel", "==", selectedClass)
          );
        }

        const studentsSnapshot = await getDocs(studentsQuery);
        const classStudents: Student[] = studentsSnapshot.docs
          .map((studentDoc) => ({ id: studentDoc.id, ...studentDoc.data() }))
          .filter((studentData) => isActiveStudentSummaryStatus(getStudentStatus(studentData)))
          .map((studentData: any) => ({
            id: studentData.id,
            name: `${studentData.title || ''}${studentData.firstName} ${studentData.lastName}`.trim(),
            profileImageUrl: studentData.profileImageUrl || "",
            profileImageThumbUrl: studentData.profileImageThumbUrl || "",
            studentId: studentData.studentId,
            class: `${studentData.classLevel}/${studentData.room}`,
            attendanceStatus: ATTENDANCE_STATUS.PRESENT,
            isLeave: false,
            parentLineUserIds: studentData.parentLineUserIds || [],
            parentLineRegistrationContexts: studentData.parentLineRegistrationContexts || {},
            lineRegistrationReviewRequired: Boolean(studentData.lineRegistrationReviewRequired),
            behaviorScore: studentData.behaviorScore ?? 100,
            flagAction: "normal",
            existingDailyStatus: null,
            existingBehaviorScoreStatus: null,
            status: studentData.status,
            studentStatus: studentData.studentStatus,
          }));

        // 2. เสริมข้อมูลสถานะเช็คแถว/สแกนประตู/ใบลา ของนักเรียนแต่ละคน — ยิง 3 คำขอต่อคนแบบขนานกัน
        // (เดิมอ่านทีละอย่างเรียงต่อกัน ทำให้รอ latency สะสม และมีการอ่าน flag_ceremony_summary ซ้ำ 2 รอบ)
        const paramDate = todayStr;
        let anyAlreadySaved = false;
        const newOriginalAttendanceMap = new Map<string, AttendanceStatus>();

        const enrichedStudents = await Promise.all(classStudents.map(async (student) => {
          const flagRef = doc(firestore, "school-settings", schoolId, "students", student.id, "flag_ceremony_summary", todayStr);
          const gateRef = doc(firestore, "school-settings", schoolId, "students", student.id, "attendance", paramDate);
          // 📌 Query STUDENT's sub-collection, not the global one — this ensures we find the data
          // saved by LeaveRequestPage (which saves to sub-collection).
          const leaveQuery = query(
            collection(firestore, "school-settings", schoolId, "students", student.id, "leave_summary"),
            where("status", "==", "approved")
          );

          const [flagSnap, gateSnap, leaveSnap] = await Promise.all([
            getDoc(flagRef),
            getDoc(gateRef),
            getDocs(leaveQuery),
          ]);

          // 1. Flag Status (Existing)
          let flagRecord: FlagRecord | null = null;
          let originalStatus = undefined;
          let originalAction: FlagAction | undefined;
          const isFlagSaved = flagSnap.exists();
          if (isFlagSaved) {
            const flagData = flagSnap.data();
            flagRecord = { status: flagData.status };
            originalStatus = flagData.status;
            originalAction = flagData.action;
          }

          // 2. Gate Attendance
          let gateRecord: GateRecord | null = null;
          let existingDailyStatus: string | null = null;
          let existingBehaviorScoreStatus: string | null = null;
          let existingFlagBehaviorScoreStatus: string | null = null;
          if (gateSnap.exists()) {
            const d = gateSnap.data();
            const checkinSource = d.checkinTime || d.time || null;
            const checkinTime = checkinSource?.toDate
              ? checkinSource.toDate().toLocaleTimeString("th-TH", { hour: "2-digit", minute: "2-digit" })
              : typeof checkinSource === "string"
                ? checkinSource
                : "";
            gateRecord = { checkinTime, status: d.status };
            (gateRecord as any).rawCheckinTime = checkinSource;
            existingDailyStatus = d.status || null;
            const legacyBehaviorScoreStatus = d.metadata?.behaviorScoreStatus || d.behaviorScoreStatus || null;
            existingBehaviorScoreStatus = d.metadata?.attendanceBehaviorScoreStatus
              || (String(legacyBehaviorScoreStatus || "").startsWith("flag:") ? d.status : legacyBehaviorScoreStatus)
              || d.status
              || null;
            existingFlagBehaviorScoreStatus = d.metadata?.flagBehaviorScoreStatus
              || (String(legacyBehaviorScoreStatus || "").startsWith("flag:") ? legacyBehaviorScoreStatus : null)
              || null;
          }

          // 3. Leave Data — Manual Filter for Date Range (Firestore requires index for multiple fields)
          let leaveRecord: LeaveRecord | null = null;
          const validLeaveDoc = leaveSnap.docs.find(doc => {
            const data = doc.data();
            const getDateStr = (val: any) => {
              if (val?.toDate) return val.toDate().toISOString().split('T')[0];
              if (typeof val === 'string') return val;
              return '';
            };
            const s = getDateStr(data.startDate);
            const e = getDateStr(data.endDate);
            return s && e && s <= paramDate && e >= paramDate;
          });

          if (validLeaveDoc) {
            leaveRecord = { type: validLeaveDoc.data().leaveType, id: validLeaveDoc.id };
          }

          // Calculate Initial Status for Display — ถ้าเคยบันทึกเช็คแถวไว้แล้วให้ใช้ค่านั้น
          // ถ้ายังไม่เคยบันทึกให้ auto-suggest จากข้อมูลสแกนประตู/ใบลา
          let displayStatus = originalStatus || ATTENDANCE_STATUS.PRESENT;

          // 📌 Force Status to LEAVE if leave request exists (Overwrite original status)
          if (leaveRecord) {
            if (leaveRecord.type === 'ไปราชการ/กิจกรรม') {
              displayStatus = ATTENDANCE_STATUS.PRESENT;
            } else {
              displayStatus = ATTENDANCE_STATUS.LEAVE;
            }
          } else if (!originalStatus) {
            const suggestion = calculateAttendanceStatus(gateRecord, null, leaveRecord, null, { studentLateTime: studentCheckinEnd });
            // Map suggestion back to Thai status for Dropdown
            if (suggestion.finalStatus === 'present') displayStatus = ATTENDANCE_STATUS.PRESENT;
            else if (suggestion.finalStatus === 'late') displayStatus = ATTENDANCE_STATUS.LATE;
            else if (suggestion.finalStatus === 'leave') displayStatus = ATTENDANCE_STATUS.LEAVE;
            else if (suggestion.finalStatus === 'officialTravel') displayStatus = ATTENDANCE_STATUS.PRESENT;
            else displayStatus = ATTENDANCE_STATUS.ABSENT; // 📌 หากไม่มีการลงเวลา ให้เริ่มต้นแสดง ขาด เพื่อให้สอดคล้องกับสถานะจริง
          }

          if (originalStatus) {
            newOriginalAttendanceMap.set(student.id, originalStatus);
            anyAlreadySaved = true;
          }

          return {
            ...student,
            attendanceStatus: displayStatus,
            // ไม่ auto-fill flagAction ให้เป็น "เข้าแถวปกติ"/"ลาป่วย" ล่วงหน้าอีกต่อไป (ปล่อยว่างไว้ถ้ายังไม่เคย
            // บันทึกจริง) ให้ดรอปดาวน์รายบุคคลขึ้น "กรุณาเลือกสถานะ" สอดคล้องกับดรอปดาวน์รวมด้านบนเสมอ
            // จนกว่าครูจะเลือกเอง — ตอนบันทึกจริง resolveFlagActionResult จะ fallback ไป
            // getDefaultFlagAction(attendanceStatus) ให้เองถ้ายังไม่ได้เลือก จึงไม่กระทบผลการบันทึก
            flagAction: originalAction,
            existingDailyStatus,
            existingBehaviorScoreStatus,
            existingFlagBehaviorScoreStatus,
            _flagSavedToday: isFlagSaved,
            // Attach extra data for Save Logic
            _gateData: gateRecord,
            _leaveData: leaveRecord,
            _travelData: null,
            isLeave: !!leaveRecord // 📌 Critical: Pass this flag to UI to lock buttons
          };
        }));

        setStudents(enrichedStudents);
        if (anyAlreadySaved) {
          setOriginalAttendanceMap(newOriginalAttendanceMap);
          setIsAlreadySaved(true);
        }

      } catch (err: any) {
        console.error("Error fetching students:", err);
        let errorMessage = "เกิดข้อผิดพลาดในการโหลดข้อมูลนักเรียน";
        if (err.message?.includes('requires an index')) {
          errorMessage = "ระบบต้องการ Index สำหรับการค้นหาข้อมูล กรุณาเปิด Console (F12) และคลิกลิงก์ที่ Firebase แจ้งเตือนเพื่อสร้าง Index";
        }
        setError(errorMessage);
      } finally {
        setIsLoading(false);
      }
    };

    fetchClassData();
  }, [selectedClass, todayStr, schoolId]);

  // 📌 เพิ่ม: ฟังก์ชันสำหรับส่งแจ้งเตือน LINE OA (คัดลอกจาก CheckinOutPage.tsx)
  // 📌 ปรับปรุง: รับ teacherConfig และ parentUserIds เข้ามาโดยตรง เพื่อไม่ต้อง Query Firestore ซ้ำ
  const getEligibleFlagParentRecipients = (student: Student, teacherConfig: any) => {
    const parentIds = Array.from(new Set((student.parentLineUserIds || []).filter(Boolean)));
    const [classLevel = "", room = ""] = String(student.class || "").split("/");
    const contexts = student.parentLineRegistrationContexts || {};

    const eligibleIds = parentIds.filter((lineUserId) => {
      const context = contexts[lineUserId];
      if (!context) return false;
      if (teacherConfig?.liffId && context.liffId && String(teacherConfig.liffId).trim() !== String(context.liffId).trim()) return false;
      return normalizeLineRegistrationValue(context.classLevel) === normalizeLineRegistrationValue(classLevel) &&
        normalizeLineRegistrationValue(context.room) === normalizeLineRegistrationValue(room);
    });

    if (eligibleIds.length < parentIds.length) {
      console.warn("[LINE] Flag ceremony parent recipients skipped because classroom registration needs refresh:", {
        studentId: student.studentId,
        classLevel,
        room,
        originalParentRecipientCount: parentIds.length,
        eligibleParentRecipientCount: eligibleIds.length,
        reviewRequired: Boolean(student.lineRegistrationReviewRequired),
      });
    }

    return eligibleIds;
  };

  const sendLineNotification = async (
    user: FoundUser,
    status: string,
    time: string,
    teacherConfig: any,
    parentUserIds: string[]
  ) => {
    console.log("🚀 เริ่มต้นกระบวนการส่ง LINE Notify สำหรับการเข้าแถว");

    if (!teacherConfig) {
      console.warn("❌ ไม่พบข้อมูลการตั้งค่า LINE OA ของครูประจำชั้น");
      return;
    }

    const { lineChannelAccessToken, enableNotification } = teacherConfig;
    const isEnabled = enableNotification === undefined ? true : enableNotification;

    if (!isEnabled || !lineChannelAccessToken) {
      console.warn("❌ ระบบแจ้งเตือน LINE ถูกปิดอยู่ หรือไม่มี Access Token");
      return;
    }

    try {
      console.log("📤 กำลังส่ง Request ไปยัง LINE API...");

      // สร้างเนื้อหา Flex Message
      const flexContents: any[] = [
        {
          type: "box",
          layout: "baseline",
          spacing: "sm",
          contents: [
            { type: "text", text: "ชื่อ", color: "#aaaaaa", size: "sm", flex: 1 },
            { type: "text", text: user.name, wrap: true, color: "#666666", size: "sm", flex: 4 }
          ]
        },
        {
          type: "box",
          layout: "baseline",
          spacing: "sm",
          contents: [
            { type: "text", text: "ชั้น", color: "#aaaaaa", size: "sm", flex: 1 },
            { type: "text", text: user.grade || "-", wrap: true, color: "#666666", size: "sm", flex: 4 }
          ]
        },
        {
          type: "box",
          layout: "baseline",
          spacing: "sm",
          contents: [
            { type: "text", text: "สถานะ", color: "#aaaaaa", size: "sm", flex: 1 },
            { type: "text", text: status, wrap: true, color: status === 'มา' ? '#1DB446' : '#FF5722', weight: "bold", size: "sm", flex: 4 }
          ]
        },
        {
          type: "box",
          layout: "baseline",
          spacing: "sm",
          contents: [
            { type: "text", text: "เวลา", color: "#aaaaaa", size: "sm", flex: 1 },
            { type: "text", text: time, wrap: true, color: "#666666", size: "sm", flex: 4 }
          ]
        }
      ];

      const flexMessage = {
        type: "flex",
        altText: `แจ้งเตือนกิจกรรมเข้าแถว: ${user.name}`,
        contents: {
          type: "bubble",
          hero: user.profileImageUrl ? {
            type: "image",
            url: user.profileImageUrl,
            size: "full",
            aspectRatio: "20:13",
            aspectMode: "cover",
          } : undefined,
          body: {
            type: "box",
            layout: "vertical",
            contents: [
              {
                type: "text",
                text: "🔔 แจ้งเตือนกิจกรรมเข้าแถว",
                weight: "bold",
                size: "lg",
                color: "#1DB446"
              },
              {
                type: "box",
                layout: "vertical",
                margin: "lg",
                spacing: "sm",
                contents: flexContents
              }
            ]
          }
        }
      };

      const isLocalhost = window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1";

      if (parentUserIds.length === 0) {
        console.warn("⚠️ ไม่มีรายชื่อผู้รับ LINE User ID สำหรับนักเรียนคนนี้ - ยกเลิกการส่งเพื่อป้องกัน broadcast ข้อมูลรายบุคคล");
        return;
      }

      const targetUrl = "https://api.line.me/v2/bot/message/multicast";
      const bodyPayload: any = {
        to: parentUserIds,
        messages: [flexMessage]
      };
      console.log(`🎯 ส่งข้อความแบบ Multicast ไปยังผู้ปกครอง ${parentUserIds.length} ท่าน`);

      const url = isLocalhost ? `https://corsproxy.io/?${encodeURIComponent(targetUrl)}` : targetUrl;

      const response = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${lineChannelAccessToken}`
        },
        body: JSON.stringify(bodyPayload)
      });

      if (response.ok) {
        console.log("✅ ส่งข้อความ LINE สำเร็จ!");
      } else {
        const errorText = await response.text();
        console.error("❌ ส่งข้อความ LINE ไม่สำเร็จ:", response.status, errorText);
      }
    } catch (error: any) {
      console.error("Error sending LINE notification:", error);
    }
  };

  const getNormalCheckinTimestamp = () => {
    const timeStr = studentCheckinEnd || "07:50";
    const [h, m] = timeStr.split(":").map(Number);
    const date = new Date();
    // 📌 Set time to 15 minutes before the late cutoff to ensure it's a completely normal/on-time checkin
    const cutoffMinutes = (h || 7) * 60 + (m || 50);
    const normalMinutes = cutoffMinutes - 15;
    const normalH = Math.floor(normalMinutes / 60);
    const normalM = normalMinutes % 60;
    date.setHours(normalH, normalM, 0, 0);
    return Timestamp.fromDate(date);
  };

  const toggleSelectedActionForStudent = (studentId: string) => {
    const currentStudent = students.find((student) => student.id === studentId);
    if (!currentStudent) return;

    if (selectedStudentIds.has(studentId)) {
      const snapshot = selectionSnapshots.get(studentId);
      setSelectedStudentIds((prev) => {
        const next = new Set(prev);
        next.delete(studentId);
        return next;
      });
      setSelectionSnapshots((prev) => {
        const next = new Map(prev);
        next.delete(studentId);
        return next;
      });
      if (snapshot) {
        setStudents((prevStudents) =>
          prevStudents.map((student) =>
            student.id === studentId
              ? {
                ...student,
                flagAction: snapshot.flagAction,
                attendanceStatus: snapshot.attendanceStatus,
              }
              : student
          )
        );
      }
      return;
    }

    // บังคับให้ต้องเลือกสถานะจากดรอปดาวน์รวมด้านบนก่อนเสมอ กันไม่ให้เผลอคลิกการ์ดนักเรียน
    // แล้วโดนใช้ค่าที่ไม่ได้ตั้งใจเลือกไปบันทึกโดยไม่รู้ตัว
    if (!selectedFlagAction) {
      Swal.fire({
        icon: 'warning',
        title: 'กรุณาเลือกสถานะก่อน',
        text: 'เลือกคำสั่งจากดรอปดาวน์ "คำสั่งรวมสำหรับเช็คแถว" ด้านบนก่อน แล้วค่อยคลิกการ์ดนักเรียน',
        background: '#2a2b2f',
        color: '#ffffff',
      });
      return;
    }

    setSelectionSnapshots((prev) => {
      const next = new Map(prev);
      next.set(studentId, {
        flagAction: currentStudent.flagAction,
        attendanceStatus: currentStudent.attendanceStatus,
      });
      return next;
    });
    setSelectedStudentIds((prev) => new Set(prev).add(studentId));
    setStudents((prevStudents) =>
      prevStudents.map((student) => {
        if (student.id !== studentId) return student;

        const gateData = (student as any)._gateData;
        const hasGateScan = !!(gateData?.checkinTime);
        const isNoScanAction = selectedFlagAction === "noScanPresentNoDeduct" || selectedFlagAction === "noScanPresentDeduct";

        // หากนักเรียนมีการสแกนบัตรที่ประตูแล้ว จะไม่สามารถใช้คำสั่งช่วยเหลือแบบไม่สแกนบัตรได้ ให้เป็น เข้าแถวปกติ แทน
        const targetAction = (hasGateScan && isNoScanAction) ? "normal" : selectedFlagAction;

        return {
          ...student,
          flagAction: targetAction,
          attendanceStatus: getStatusFromAction(targetAction, student),
        };
      })
    );
  };

  const applyActionToAllStudents = (action: FlagAction | "" = selectedFlagAction) => {
    if (students.length === 0 || !action) return;

    setSelectionSnapshots((prev) => {
      const next = new Map(prev);
      students.forEach((student) => {
        if (!selectedStudentIds.has(student.id)) {
          next.set(student.id, {
            flagAction: student.flagAction,
            attendanceStatus: student.attendanceStatus,
          });
        }
      });
      return next;
    });
    setSelectedStudentIds((prev) => {
      const next = new Set(prev);
      students.forEach((student) => next.add(student.id));
      return next;
    });
    setStudents((prevStudents) =>
      prevStudents.map((student) => {
        const gateData = (student as any)._gateData;
        const hasGateScan = !!(gateData?.checkinTime);
        const isNoScanAction = action === "noScanPresentNoDeduct" || action === "noScanPresentDeduct";

        // หากนักเรียนมีการสแกนบัตรที่ประตูแล้ว จะไม่สามารถใช้คำสั่งช่วยเหลือแบบไม่สแกนบัตรได้ ให้เป็น เข้าแถวปกติ แทน
        const targetAction = (hasGateScan && isNoScanAction) ? "normal" : action;

        return {
          ...student,
          flagAction: targetAction,
          attendanceStatus: getStatusFromAction(targetAction, student),
        };
      })
    );
  };

  const handleIndividualActionChange = (studentId: string, action: FlagAction) => {
    const currentStudent = students.find((student) => student.id === studentId);
    if (!currentStudent) return;

    const gateData = (currentStudent as any)._gateData;
    const hasGateScan = !!(gateData?.checkinTime);
    const isNoScanAction = action === "noScanPresentNoDeduct" || action === "noScanPresentDeduct";
    const targetAction = (hasGateScan && isNoScanAction) ? "normal" : action;

    // Save snapshot if not already in selectedStudentIds
    if (!selectedStudentIds.has(studentId)) {
      setSelectionSnapshots((prev) => {
        const next = new Map(prev);
        next.set(studentId, {
          flagAction: currentStudent.flagAction,
          attendanceStatus: currentStudent.attendanceStatus,
        });
        return next;
      });
      setSelectedStudentIds((prev) => new Set(prev).add(studentId));
    }

    // Update student's action and status
    setStudents((prevStudents) =>
      prevStudents.map((student) =>
        student.id === studentId
          ? {
              ...student,
              flagAction: targetAction,
              attendanceStatus: getStatusFromAction(targetAction, student),
            }
          : student
      )
    );
  };

  const resolveFlagActionResult = (
    student: Student,
    gateData: GateRecord | null,
    leaveData: LeaveRecord | null,
    travelData: TravelRecord | null
  ) => {
    const action = student.flagAction || getDefaultFlagAction(student.attendanceStatus);
    const rawGateCheckinTime = (gateData as any)?.rawCheckinTime || null;

    if (action === "cancelFlag") {
      // 1. "ยกเลิกการเช็คแถว" (Cancel flag ceremony check ONLY, keep gate check-in time if any)
      // ถ้าไม่มีสแกนประตูเลย = ไม่เหลือหลักฐานการมาเรียนวันนี้จากกลไกนี้อีกต่อไป ต้องลบ record
      // ที่เคยเขียนไว้ (เช่น "ขาด" จากการบันทึกครั้งก่อน) และคืนคะแนนพฤติกรรมที่เคยหักไปด้วย
      // ไม่ใช่ปล่อยค้าง — ก่อนหน้านี้ shouldDeleteDaily เป็น false เสมอ ทำให้กรณีไม่มีสแกนประตู
      // ไม่เข้าทั้งสาขา shouldDeleteDaily และ shouldWriteDaily เลย จึงไม่มีการคืนคะแนนเกิดขึ้น
      const gateStatus = gateData?.status === "สาย" || gateData?.status === "late" ? "late" : "present";
      return {
        action,
        shouldDeleteFlag: true,
        shouldDeleteDaily: !gateData?.checkinTime,
        shouldWriteDaily: !!gateData?.checkinTime,
        shouldNotify: false,
        flagStatus: null as AttendanceStatus | null,
        finalStatusKey: gateData?.checkinTime ? gateStatus : "absent",
        dailyStatus: gateData?.checkinTime
          ? toThaiAttendanceStatus(gateStatus)
          : ATTENDANCE_STATUS.ABSENT,
        behaviorStatus: gateData?.checkinTime
          ? toThaiAttendanceStatus(gateStatus)
          : ATTENDANCE_STATUS.ABSENT,
        checkinTime: rawGateCheckinTime || null,
        checkinDevice: undefined as string | undefined,
        description: getFlagActionLabel(action),
      };
    }

    if (action === "cancelFlagKeepGate") {
      // 2. "ยกเลิกการเช็คแถว และเวลาสแกนเข้า" (Cancel BOTH flag ceremony and gate check-in time completely)
      return {
        action,
        shouldDeleteFlag: true,
        shouldDeleteDaily: true,
        shouldWriteDaily: false,
        shouldNotify: false,
        flagStatus: null as AttendanceStatus | null,
        finalStatusKey: null as string | null,
        dailyStatus: null as string | null,
        behaviorStatus: null as string | null,
        checkinTime: null as any,
        checkinDevice: undefined as string | undefined,
        description: getFlagActionLabel(action),
      };
    }

    if (action === "sickLeave" || action === "personalLeave") {
      return {
        action,
        shouldDeleteFlag: false,
        shouldWriteDaily: true,
        shouldNotify: true,
        flagStatus: ATTENDANCE_STATUS.LEAVE,
        finalStatusKey: "leave",
        dailyStatus: ATTENDANCE_STATUS.LEAVE,
        behaviorStatus: ATTENDANCE_STATUS.LEAVE,
        checkinTime: null,
        checkinDevice: undefined as string | undefined,
        description: getFlagActionLabel(action),
      };
    }

    if (action === "noScanPresentNoDeduct") {
      const normalTimestamp = getNormalCheckinTimestamp();
      return {
        action,
        shouldDeleteFlag: false,
        shouldWriteDaily: true,
        shouldNotify: true,
        flagStatus: ATTENDANCE_STATUS.PRESENT,
        finalStatusKey: "present",
        dailyStatus: ATTENDANCE_STATUS.PRESENT,
        behaviorStatus: ATTENDANCE_STATUS.PRESENT,
        checkinTime: rawGateCheckinTime || normalTimestamp,
        checkinDevice: rawGateCheckinTime ? undefined : "FlagCeremony",
        description: getFlagActionLabel(action),
      };
    }

    if (action === "noScanPresentDeduct") {
      return {
        action,
        shouldDeleteFlag: false,
        shouldWriteDaily: true,
        shouldNotify: true,
        flagStatus: ATTENDANCE_STATUS.PRESENT,
        finalStatusKey: "late",
        dailyStatus: ATTENDANCE_STATUS.LATE,
        behaviorStatus: "flag:noScanPresentDeduct",
        checkinTime: null,
        checkinDevice: undefined as string | undefined,
        description: getFlagActionLabel(action),
      };
    }

    if (action === "scannedAbsentDeduct") {
      return {
        action,
        shouldDeleteFlag: false,
        shouldWriteDaily: true,
        shouldNotify: !gateData?.checkinTime,
        flagStatus: ATTENDANCE_STATUS.ABSENT,
        finalStatusKey: "late",
        dailyStatus: ATTENDANCE_STATUS.LATE,
        behaviorStatus: "flag:scannedAbsentDeduct",
        checkinTime: rawGateCheckinTime || getNormalCheckinTimestamp(),
        checkinDevice: undefined as string | undefined,
        description: getFlagActionLabel(action),
      };
    }

    const dailyStatus = student.attendanceStatus || ATTENDANCE_STATUS.PRESENT;
    const behaviorStatus = dailyStatus;
    const finalStatusKey = dailyStatus === ATTENDANCE_STATUS.PRESENT ? "present" : (dailyStatus === ATTENDANCE_STATUS.LATE ? "late" : "absent");

    return {
      action,
      shouldDeleteFlag: false,
      shouldWriteDaily: true,
      shouldNotify: !gateData?.checkinTime,
      flagStatus: student.attendanceStatus || ATTENDANCE_STATUS.PRESENT,
      finalStatusKey,
      dailyStatus,
      behaviorStatus,
      checkinTime: rawGateCheckinTime || (
        finalStatusKey === "present"
          ? getNormalCheckinTimestamp()
          : finalStatusKey === "late"
            ? Timestamp.now()
            : null
      ),
      checkinDevice: rawGateCheckinTime ? undefined : "FlagCeremony",
      description: "เข้าแถวปกติ",
    };
  };

  // Sum of the penalty already applied TODAY specifically by this mechanism
  // (gate attendance + flag ceremony), so callers can apply just the delta
  // between old and new penalty on top of the live score, instead of
  // reconstructing a "yesterday baseline" and recomputing from scratch.
  const getTodayAppliedPenalty = (student: Student) => {
    const isFlagSavedToday = !!student._flagSavedToday;
    const hasGateCheckin = !!(student as any)._gateData?.checkinTime;

    // หากระบบเช็คแถวเสาธงในวันนี้ยังไม่ได้บันทึก และนักเรียนคนนี้ไม่มีการสแกนบัตรที่ประตู (Gate) ในช่วงเช้าเลย
    // แสดงว่าคะแนนพฤติกรรมใน DB (student.behaviorScore) จะยังไม่มีการหักคะแนนใดๆ ของวันนี้เกิดขึ้น
    // ดังนั้นจึงไม่ต้องนับว่ามีคะแนนของสถานะเดิม (เช่น ขาด) ถูกหักไปแล้ว
    const oldAttendancePenalty = (isFlagSavedToday || hasGateCheckin)
      ? getRulePoints(behaviorScoreConfig, student.existingBehaviorScoreStatus || student.existingDailyStatus)
      : 0;

    // คะแนนจากการเช็คแถวเสาธงจะเกิดขึ้นเมื่อเซฟแล้วเท่านั้น
    const oldFlagCeremonyPenalty = isFlagSavedToday
      ? getRulePoints(behaviorScoreConfig, student.existingFlagBehaviorScoreStatus)
      : 0;

    return oldAttendancePenalty + oldFlagCeremonyPenalty;
  };

  const getBehaviorScorePreview = (student: Student) => {
    if (!selectedStudentIds.has(student.id)) return null;

    const gateData = (student as any)._gateData;
    const leaveData = (student as any)._leaveData;
    const travelData = (student as any)._travelData;
    const resolved = resolveFlagActionResult(student, gateData, leaveData, travelData);
    if (!resolved.shouldWriteDaily && !resolved.shouldDeleteDaily) return null;

    const todayAppliedPenalty = getTodayAppliedPenalty(student);

    // shouldDeleteDaily = ลบ record วันนี้ทั้งหมด (ไม่มีหลักฐานการมาเรียนจากกลไกนี้เหลืออยู่)
    // ต้องคืนคะแนนที่เคยหักไปทั้งหมด เหมือนที่ handleSaveAll ทำจริงตอนบันทึก (refundDelta = todayAppliedPenalty)
    // ไม่ใช่คำนวณ delta จาก resolved.behaviorStatus เพราะบาง action (เช่น cancelFlag ไม่มีสแกนประตู)
    // behaviorStatus ยังเป็น "ขาด" อยู่ทั้งที่จริงแล้วจะถูกลบทิ้ง ทำให้พรีวิวคำนวณผิดถ้าใช้สูตรเดียวกับ shouldWriteDaily
    if (resolved.shouldDeleteDaily) {
      const currentScore = student.behaviorScore ?? 100;
      const nextScore = currentScore + todayAppliedPenalty;
      const netDelta = nextScore - currentScore;
      if (netDelta === 0) return null;
      return {
        yesterdayScore: currentScore,
        nextScore,
        delta: netDelta,
      };
    }

    const newAttendanceStatus = resolved.action === "noScanPresentDeduct"
      ? ATTENDANCE_STATUS.PRESENT
      : resolved.action === "scannedAbsentDeduct"
        ? (
            (!student.existingBehaviorScoreStatus && !student.existingDailyStatus) ||
            student.existingBehaviorScoreStatus === ATTENDANCE_STATUS.ABSENT ||
            student.existingDailyStatus === ATTENDANCE_STATUS.ABSENT
              ? ATTENDANCE_STATUS.PRESENT
              : (student.existingBehaviorScoreStatus || student.existingDailyStatus)
          )
        : resolved.behaviorStatus;

    const nextFlagBehaviorStatus = isFlagDeductionAction(resolved.action)
      ? getFlagBehaviorStatus(resolved.action)
      : null;

    const newAttendancePenalty = getRulePoints(behaviorScoreConfig, newAttendanceStatus);
    const newFlagPenalty = getRulePoints(behaviorScoreConfig, nextFlagBehaviorStatus);

    const totalPenalty = newAttendancePenalty + newFlagPenalty;
    const penaltyDelta = todayAppliedPenalty - totalPenalty;

    const currentScore = student.behaviorScore ?? 100;
    // ไม่จำกัดทั้งเพดานบนและเพดานล่าง — คะแนนสะท้อนผลรวมจริงเสมอ
    const nextScore = currentScore + penaltyDelta;
    const netDelta = nextScore - currentScore;

    // หากไม่มีความเปลี่ยนแปลงของคะแนนพฤติกรรมในเซสชันนี้ ไม่ต้องแสดง Preview การคำนวณคะแนนพฤติกรรม
    if (netDelta === 0) return null;

    return {
      yesterdayScore: currentScore,
      nextScore,
      delta: netDelta,
    };
  };

  // 📌 เพิ่ม: ฟังก์ชันสำหรับบันทึกข้อมูลทั้งหมด
  const handleSaveAll = async () => {
    if (!schoolId) return;
    const studentsToSave = students;
    if (studentsToSave.length === 0) {
      Swal.fire({
        icon: 'warning',
        title: 'ไม่พบนักเรียน',
        text: 'ไม่สามารถบันทึกข้อมูลเนื่องจากไม่มีนักเรียนในชั้นเรียนนี้',
        background: '#2a2b2f',
        color: '#ffffff',
      });
      return;
    }

    setIsLoading(true);
    try {
      const batch = writeBatch(firestore);
      // 📌 เพิ่ม: สร้าง list ของนักเรียนที่ต้องแจ้งเตือน
      const studentsToNotify: { student: Student, status: AttendanceStatus }[] = [];
      const behaviorScoreUpdates = new Map<string, number>();

      // Applies only the NET CHANGE (delta) in today's attendance/flag-ceremony
      // penalty on top of whatever the live score is at write time — read fresh
      // inside a transaction. This is deliberately NOT "reconstruct yesterday's
      // baseline and recompute from scratch": that approach would silently wipe
      // out any other same-day change (a manual adjustment, classroom deduction,
      // etc.) applied between page load and save, since it assumed the entire
      // gap between the live score and the reconstructed baseline belonged to
      // this mechanism alone. Using a delta on the fresh live score preserves
      // whatever else has happened to the score in the meantime.
      const applyBehaviorScoreChange = async (
        studentRef: DocumentReference,
        studentId: string,
        penaltyDelta: number,
        oldStatus: string | null,
        newStatus: string | null,
      ) => {
        if (penaltyDelta === 0) return;

        const nextScore = await runTransaction(firestore, async (transaction) => {
          const snap = await transaction.get(studentRef);
          const currentScore = Number(snap.data()?.behaviorScore ?? 100);
          // ไม่จำกัดทั้งเพดานบนและเพดานล่าง — คะแนนสะท้อนผลรวมจริงเสมอ
          const computedNextScore = currentScore + penaltyDelta;
          if (computedNextScore === currentScore) return null;

          transaction.set(studentRef, {
            behaviorScore: computedNextScore,
            behaviorScoreUpdatedAt: serverTimestamp(),
            lastBehaviorScoreChange: {
              delta: computedNextScore - currentScore,
              oldStatus: oldStatus || null,
              newStatus: newStatus || null,
              updatedAt: serverTimestamp(),
              source: "attendance",
            },
          }, { merge: true });
          return computedNextScore;
        });

        if (nextScore !== null) {
          behaviorScoreUpdates.set(studentId, nextScore);
        }
      };

      const savedStatusUpdates = new Map<string, {
        flagStatus: AttendanceStatus | null;
        dailyStatus: string | null | undefined;
        attendanceBehaviorStatus: string | null;
        flagBehaviorStatus: string | null;
        checkinTime?: any;
        shouldDeleteDaily?: boolean;
        shouldDeleteFlag?: boolean;
      }>();

      // 📌 เพิ่ม: ดึงข้อมูลครูประจำชั้น (LINE Config) เพียงครั้งเดียว
      let teacherConfig = null;
      try {
        // 1. ลองดึงจาก User ปัจจุบันก่อน (แม่นยำที่สุดสำหรับครูที่ login อยู่)
        if (user?.uid) {
          const currentUserRef = doc(firestore, "school-settings", schoolId, "teachers", user.uid);
          const currentUserSnap = await getDoc(currentUserRef);
          if (currentUserSnap.exists()) {
            teacherConfig = currentUserSnap.data();
          }
        }

        // 2. ถ้าไม่พบ (เช่น Admin ทำแทน) ให้ค้นหาจากชั้น/ห้อง
        if (!teacherConfig) {
          const teachersRef = collection(firestore, "school-settings", schoolId, "teachers");
          let q = query(teachersRef, where("homeroomGrade", "==", selectedClass));
          let snapshot = await getDocs(q);

          if (snapshot.empty && selectedClass.includes('/')) {
            const [level, room] = selectedClass.split('/');
            q = query(teachersRef, where("homeroomGrade", "==", level), where("homeroomRoom", "==", room));
            snapshot = await getDocs(q);
          }

          if (!snapshot.empty) {
            teacherConfig = snapshot.docs[0].data();
          }
        }
      } catch (e) {
        console.error("Error fetching teacher config:", e);
      }

      // 📌 Prepare Loop for Async Operations
      const promises = studentsToSave.map(async (student) => {

        // 1. Calculate Logic-based Status
        const gateData = (student as any)._gateData;
        const leaveData = (student as any)._leaveData;
        const travelData = (student as any)._travelData;

        const resolved = resolveFlagActionResult(student, gateData, leaveData, travelData);
        const finalStatusKey = resolved.finalStatusKey; // 'present' | 'late' | 'leave' | ...
        savedStatusUpdates.set(student.id, {
          flagStatus: resolved.flagStatus,
          dailyStatus: resolved.dailyStatus,
          attendanceBehaviorStatus: resolved.action === "noScanPresentDeduct"
            ? ATTENDANCE_STATUS.PRESENT
            : resolved.action === "scannedAbsentDeduct"
              ? (student.existingBehaviorScoreStatus || student.existingDailyStatus || null)
              : resolved.behaviorStatus,
          flagBehaviorStatus: isFlagDeductionAction(resolved.action) ? getFlagBehaviorStatus(resolved.action) : null,
          checkinTime: resolved.checkinTime,
          shouldDeleteDaily: resolved.shouldDeleteDaily,
          shouldDeleteFlag: resolved.shouldDeleteFlag,
        });

        // 2. Save Flag Ceremony Record (What the teacher selected)
        // 📌 Path: students/{id}/flag_ceremony_summary/{date} 
        const attendanceRef = doc(
          firestore,
          "school-settings",
          schoolId,
          "students",
          student.id,
          "flag_ceremony_summary",
          todayStr
        );
        if (resolved.shouldDeleteFlag) {
          batch.delete(attendanceRef);
        } else {
          const attendanceData = {
            studentId: student.studentId,
            studentDocId: student.id,
            status: resolved.flagStatus, // Keep what teacher explicitly selected
            action: resolved.action,
            actionLabel: getFlagActionLabel(resolved.action),
            date: todayStr,
            timestamp: Timestamp.now(),
          };
          batch.set(attendanceRef, attendanceData, { merge: true });
        }

        // --- START: Aggregation Logic ---
        const studentRef = doc(firestore, "school-settings", schoolId, "students", student.id);
        const studentRefUpdates: Record<string, any> = {};

        // 1. Update Flag Ceremony Stats on Student Document
        const oldFlagStatus = originalAttendanceMap.get(student.id) || null;
        const newFlagStatus = resolved.shouldDeleteFlag ? null : (resolved.flagStatus || null);

        if (oldFlagStatus !== newFlagStatus) {
          const oldFlagKey = getFlagStatusKey(oldFlagStatus);
          const newFlagKey = getFlagStatusKey(newFlagStatus);
          const statsUpdate: Record<string, any> = {};

          if (oldFlagKey) {
            statsUpdate[`flagCeremonyStats.${oldFlagKey}`] = increment(-1);
          }
          if (newFlagKey) {
            statsUpdate[`flagCeremonyStats.${newFlagKey}`] = increment(1);
          }

          if (Object.keys(statsUpdate).length > 0) {
            Object.assign(studentRefUpdates, statsUpdate);
          }
        }

        // classId ต้องเป็น "ระดับชั้นล้วนๆ" (เช่น "ม.3") ให้ตรงกับทุกจุดอื่นที่เรียก updatePeriodSummaries
        // (CheckinOutPage, AttendanceConfigPage, LeaveRequestPage ฯลฯ) ห้ามใส่ห้อง (เช่น "ม.3/1") เด็ดขาด
        // เพราะ field key ที่ build จาก classId แบบ string ("classes.${classId}.${field}") จะกลายเป็นคนละ field
        // กันไปเลยถ้า classId มาคนละรูปแบบ ทำให้ยอดรวมต่อห้อง/ต่อชั้นเพี้ยนไม่ตรงกับยอดรวมบนสุด
        const classLevelOnly = (student.class || "").split("/")[0]?.trim() || undefined;
        // --- END: Aggregation Logic (ส่วนนับสถิติเช็คแถวบน studentRef ด้านบน — ไม่กระทบตัวนับ Todaysummary) ---

        // 📌 เพิ่ม: เก็บข้อมูลนักเรียนที่ต้องแจ้งเตือน
        // Logic ใหม่:
        // 1. ถ้าลงเวลาที่ประตูแล้ว (gateData.checkinTime มีค่า) -> ไม่ต้องแจ้งเตือนซ้ำ (ถือว่าแจ้งตอนเช้าแล้ว)
        // 2. ถ้ายังไม่ลงเวลาที่ประตู -> ให้แจ้งเตือนสถานะจากหน้าเสาธง (มา/สาย/ลา/ขาด)
        // - ครั้งแรกที่บันทึก (!isAlreadySaved) ส่งเฉพาะคนที่มีสถานะไม่ปกติ หรือ ถูกเลือก
        // - การอัปเดตครั้งถัดไป (isAlreadySaved) ส่งเฉพาะคนที่ถูกเลือกในเซสชันนี้เท่านั้นเพื่อไม่ให้ส่งสแปม
        const isExplicitlySelected = selectedStudentIds.has(student.id);
        const isAbnormalStatus = resolved.flagStatus !== ATTENDANCE_STATUS.PRESENT;
        const shouldTriggerNotification = !isAlreadySaved
          ? (isExplicitlySelected || isAbnormalStatus)
          : isExplicitlySelected;

        if (resolved.shouldNotify && resolved.flagStatus && shouldTriggerNotification) {
          studentsToNotify.push({ student, status: resolved.flagStatus });
        }

        // 📌 Create/Update Daily Attendance (Unified Record)
        const dailyAttendanceRef = doc(firestore, "school-settings", schoolId, "students", student.id, "attendance", todayStr);
        if (resolved.shouldDeleteDaily) {
          // Refund whatever this mechanism (gate attendance + flag ceremony) had
          // already deducted today for this student — expressed as a delta on
          // the live score, not a reconstructed absolute baseline.
          const refundDelta = getTodayAppliedPenalty(student);

          await applyBehaviorScoreChange(studentRef, student.id, refundDelta, student.existingDailyStatus || null, null);

          // เดิมจุดนี้ใช้ student.existingDailyStatus (ค้างจากตอนโหลดหน้า) เป็น oldStatus ตอนอัปเดตตัวนับ
          // Todaysummary — ถ้าระหว่างที่ครูเปิดหน้าเช็คแถวค้างไว้ มีการสแกนบัตรจริงที่ประตูเกิดขึ้นสำหรับ
          // นักเรียนคนเดียวกัน (เช่น มาสายแล้วมาสแกนตอนครูกำลังเช็คแถวพอดี) การ "ยกเลิกเช็คแถว+เวลาสแกน"
          // ตรงนี้จะไปลบตัวนับผิดสถานะ (ลบจากสถานะเก่าที่ค้างในเครื่อง ไม่ใช่สถานะจริงล่าสุดใน Firestore)
          // ย้ายมาอ่านสถานะสดในทรานแซกชันเดียวกับตอนลบเอกสารเสมอ ปิดช่องว่างนี้ทั้งหมด
          await runTransaction(firestore, async (transaction) => {
            const freshDailySnap = await transaction.get(dailyAttendanceRef);
            const freshOldStatus = freshDailySnap.exists() ? (freshDailySnap.data().status || null) : null;
            transaction.delete(dailyAttendanceRef);
            updatePeriodSummaries(firestore, transaction, schoolId, student.id, 'students', todayStr, freshOldStatus, null, classLevelOnly, currentAcademicYear);
          });
        } else if (resolved.shouldWriteDaily && resolved.dailyStatus) {
          const dailyAttendanceData: Record<string, any> = {
            schoolId,
            date: todayStr,
            userType: 'student',
            classLevel: student.class || "",
            status: resolved.dailyStatus,
            checkinTime: resolved.checkinTime,
            updatedAt: serverTimestamp(),
            metadata: {
              gate: gateData?.status || 'none',
              flag: resolved.flagStatus,
              action: resolved.action,
              actionLabel: getFlagActionLabel(resolved.action),
              leave: leaveData?.type || 'none',
              description: resolved.description,
              behaviorScoreStatus: resolved.behaviorStatus,
              attendanceBehaviorScoreStatus: resolved.action === "noScanPresentDeduct"
                ? ATTENDANCE_STATUS.PRESENT
                : resolved.action === "scannedAbsentDeduct"
                  ? (
                      (!student.existingBehaviorScoreStatus && !student.existingDailyStatus) ||
                      student.existingBehaviorScoreStatus === ATTENDANCE_STATUS.ABSENT ||
                      student.existingDailyStatus === ATTENDANCE_STATUS.ABSENT
                        ? ATTENDANCE_STATUS.PRESENT
                        : (student.existingBehaviorScoreStatus || student.existingDailyStatus || null)
                    )
                  : resolved.behaviorStatus,
              flagBehaviorScoreStatus: getFlagBehaviorStatus(resolved.action),
            }
          };

          if (resolved.checkinDevice) {
            dailyAttendanceData.checkinDevice = resolved.checkinDevice;
          }

          // Unified behavior score calculation — delta between what was already
          // applied today for this student and what should apply now.
          const todayAppliedPenalty = getTodayAppliedPenalty(student);

          const newAttendanceStatus = resolved.action === "noScanPresentDeduct"
            ? ATTENDANCE_STATUS.PRESENT
            : resolved.action === "scannedAbsentDeduct"
              ? (
                  (!student.existingBehaviorScoreStatus && !student.existingDailyStatus) ||
                  student.existingBehaviorScoreStatus === ATTENDANCE_STATUS.ABSENT ||
                  student.existingDailyStatus === ATTENDANCE_STATUS.ABSENT
                    ? ATTENDANCE_STATUS.PRESENT
                    : (student.existingBehaviorScoreStatus || student.existingDailyStatus)
                )
              : resolved.behaviorStatus;

          const nextFlagBehaviorStatus = isFlagDeductionAction(resolved.action)
            ? getFlagBehaviorStatus(resolved.action)
            : null;

          const newAttendancePenalty = getRulePoints(behaviorScoreConfig, newAttendanceStatus);
          const newFlagPenalty = getRulePoints(behaviorScoreConfig, nextFlagBehaviorStatus);

          const totalPenalty = newAttendancePenalty + newFlagPenalty;
          const penaltyDelta = todayAppliedPenalty - totalPenalty;

          await applyBehaviorScoreChange(
            studentRef,
            student.id,
            penaltyDelta,
            student.existingDailyStatus || null,
            nextFlagBehaviorStatus || newAttendanceStatus || null,
          );

          // เช่นเดียวกับสาขา shouldDeleteDaily ด้านบน: ต้องอ่านสถานะสดของ attendance/{date} ในทรานแซกชัน
          // เดียวกับตอนเขียน แล้วใช้ค่านั้นเป็น oldStatus ให้ updatePeriodSummaries เสมอ ไม่ใช้
          // student.existingDailyStatus ที่ค้างจากตอนโหลดหน้า — กันนับซ้ำ/นับพลาดถ้ามีการสแกนบัตรจริง
          // แทรกเข้ามาระหว่างที่ครูเปิดหน้าเช็คแถวค้างไว้ก่อนกดบันทึก
          await runTransaction(firestore, async (transaction) => {
            const freshDailySnap = await transaction.get(dailyAttendanceRef);
            const freshOldStatus = freshDailySnap.exists() ? (freshDailySnap.data().status || null) : null;
            transaction.set(dailyAttendanceRef, dailyAttendanceData, { merge: true });
            updatePeriodSummaries(firestore, transaction, schoolId, student.id, 'students', todayStr, freshOldStatus, resolved.dailyStatus, classLevelOnly, currentAcademicYear);
          });
        }

        // Commit all student updates in a single write operation per student
        if (Object.keys(studentRefUpdates).length > 0) {
          batch.set(studentRef, studentRefUpdates, { merge: true });
        }

      });

      await Promise.all(promises);
      await batch.commit();

      // หมายเหตุ: ไม่เรียก syncDailySummary() อัตโนมัติที่นี่แล้ว — ตัวนับ Todaysummary
      // ถูกอัปเดตแบบ atomic increment ผ่าน updatePeriodSummaries ใน transaction ของแต่ละคนอยู่แล้ว
      // การ scan ทั้งโรงเรียนซ้ำทุกครั้งที่บันทึกจะยิ่งช้าลงและเสี่ยงชนกันเมื่อมีคนบันทึกพร้อมกันหลายคน
      // ถ้าต้องการซ่อมข้อมูลที่คลาดเคลื่อน ให้ใช้ปุ่ม "คำนวณใหม่" ในหน้าตั้งค่าการเช็คชื่อแทน (แบบ manual)

      setStudents((prevStudents) =>
        prevStudents.map((student) => {
          const savedStatus = savedStatusUpdates.get(student.id);
          let localGateData = (student as any)._gateData;
          if (savedStatus && savedStatus.shouldDeleteDaily) {
            localGateData = null;
          } else if (savedStatus && savedStatus.checkinTime !== undefined) {
            const rawTime = savedStatus.checkinTime;
            let formattedTime = "";
            if (rawTime) {
              if (rawTime.toDate) {
                formattedTime = rawTime.toDate().toLocaleTimeString("th-TH", { hour: "2-digit", minute: "2-digit" });
              } else if (rawTime instanceof Date) {
                formattedTime = rawTime.toLocaleTimeString("th-TH", { hour: "2-digit", minute: "2-digit" });
              } else if (typeof rawTime === "string") {
                formattedTime = rawTime;
              }
            }
            localGateData = rawTime ? {
              checkinTime: formattedTime,
              status: savedStatus.dailyStatus || "มา",
              rawCheckinTime: rawTime,
            } : null;
          }

          return {
            ...student,
            behaviorScore: behaviorScoreUpdates.get(student.id) ?? student.behaviorScore,
            existingDailyStatus: savedStatus?.dailyStatus ?? student.existingDailyStatus,
            existingBehaviorScoreStatus: savedStatus?.attendanceBehaviorStatus ?? student.existingBehaviorScoreStatus,
            existingFlagBehaviorScoreStatus: savedStatus?.flagBehaviorStatus ?? null,
            _gateData: localGateData,
            // 📌 ต้องอัปเดตด้วย ไม่งั้นถ้าครูแก้ไข/บันทึกซ้ำในเซสชันเดียวกันโดยไม่รีโหลดหน้า
            // _flagSavedToday จะค้างค่าเก่า ทำให้ getTodayAppliedPenalty คำนวณคะแนนที่ต้องคืนผิด
            // (เข้าใจผิดว่ายังไม่เคยบันทึกเช็คแถววันนี้ ทั้งที่เพิ่งบันทึกไปเมื่อกี้)
            _flagSavedToday: savedStatus ? !savedStatus.shouldDeleteFlag : (student as any)._flagSavedToday,
          };
        })
      );

      // 📌 เพิ่ม: ส่งแจ้งเตือนหลังจากบันทึกข้อมูลสำเร็จ
      const notificationPromises = studentsToNotify.map(item => {
        const now = new Date();
        const timeStr = now.toLocaleTimeString("th-TH", { hour: '2-digit', minute: '2-digit' });

        let notificationStatus: string = item.status;
        if (item.status === ATTENDANCE_STATUS.ABSENT) { notificationStatus = 'ขาดเรียน(ไม่ลงเวลา,ไม่มาเข้าแถวเคารพธงชาติ)'; }

        const userForNotification: FoundUser = {
          id: item.student.id,
          type: "student",
          name: item.student.name,
          profileImageUrl: item.student.profileImageUrl,
          displayId: item.student.studentId,
          grade: item.student.class,
        };

        return sendLineNotification(
          userForNotification,
          notificationStatus,
          timeStr,
          teacherConfig,
          getEligibleFlagParentRecipients(item.student, teacherConfig)
        );
      });

      // รอให้การแจ้งเตือนทั้งหมดถูกส่ง (ไม่ต้องบล็อก UI หลัก)
      Promise.all(notificationPromises).catch(err => console.error("Error sending notifications:", err));

      Swal.fire({
        icon: 'success',
        title: 'บันทึกข้อมูลสำเร็จ',
        text: `ระบบได้บันทึกข้อมูลการเข้าแถวของนักเรียนทั้งหมด ${studentsToSave.length} คนแล้ว`,
        background: '#2a2b2f',
        color: '#ffffff',
        timer: 2000,
        showConfirmButton: false,
      });
      setIsAlreadySaved(true);
      setOriginalAttendanceMap((prev) => {
        const next = new Map(prev);
        savedStatusUpdates.forEach((value, studentId) => {
          if (value.flagStatus) {
            next.set(studentId, value.flagStatus);
          } else {
            next.delete(studentId);
          }
        });
        return next;
      });
      setSelectedStudentIds(new Set());
      setSelectionSnapshots(new Map());
    } catch (error) {
      console.error("Error saving all attendance:", error);
      Swal.fire({
        icon: 'error',
        title: 'เกิดข้อผิดพลาด',
        text: 'ไม่สามารถบันทึกข้อมูลทั้งหมดได้',
        background: '#2a2b2f',
        color: '#ffffff'
      });
    } finally {
      setIsLoading(false);
    }
  };

  const attendanceSummary = students.reduce(
    (acc, student) => {
      acc[student.attendanceStatus || ATTENDANCE_STATUS.ABSENT]++;
      return acc;
    },
    { "มา": 0, "สาย": 0, "ลา": 0, "ขาด": 0 } as Record<AttendanceStatus, number>
  );

  const getStatusStyle = (status?: AttendanceStatus) => {
    switch (status) {
      case ATTENDANCE_STATUS.PRESENT: return 'border-emerald-500/50 bg-emerald-50/50 dark:bg-emerald-500/10 shadow-[0_0_15px_rgba(16,185,129,0.1)]';
      case ATTENDANCE_STATUS.LATE: return 'border-amber-500/50 bg-amber-50/50 dark:bg-amber-500/10 shadow-[0_0_15px_rgba(245,158,11,0.1)]';
      case ATTENDANCE_STATUS.LEAVE: return 'border-blue-500/50 bg-blue-50/50 dark:bg-blue-500/10 shadow-[0_0_15px_rgba(59,130,246,0.1)]';
      case ATTENDANCE_STATUS.ABSENT: return 'border-rose-500/50 bg-rose-50/50 dark:bg-rose-500/10 shadow-[0_0_15px_rgba(244,63,94,0.1)]';
      default: return 'border-gray-200 dark:border-gray-700 bg-white dark:bg-[#2a2b2f]';
    }
  };

  return (
    <MainLayout>
      <div className={`min-h-screen bg-gray-50/50 dark:bg-[#1e1f21] transition-colors duration-300 overflow-x-hidden ${isPwaMode ? 'px-2.5 py-3 pb-6' : 'p-4 sm:p-6'}`}>
        <div className={`${isPwaMode ? 'max-w-full space-y-4' : 'max-w-7xl space-y-6'} mx-auto min-w-0`}>

          {/* Header Section */}
          <div className={`flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white dark:bg-[#2a2b2f] rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 ${isPwaMode ? 'p-4' : 'p-6'}`}>
            <div className="flex items-center gap-3">
              <button
                onClick={() => navigate('/academic/hub/attendance')}
                className="w-10 h-10 rounded-full bg-[#26282d] border border-white/10 flex items-center justify-center text-[#a9aebb] hover:bg-[#2d3036] hover:text-white active:scale-95 transition-all shadow-[0_6px_18px_rgba(0,0,0,0.16)] shrink-0"
              >
                <ArrowLeft size={20} strokeWidth={2.2} />
              </button>
              <div>
                <h1 className={`${isPwaMode ? 'text-xl' : 'text-2xl sm:text-3xl'} font-bold bg-clip-text text-transparent bg-gradient-to-r from-indigo-600 to-violet-600 dark:from-indigo-400 dark:to-violet-400`}>
                  เช็คชื่อกิจกรรมเข้าแถว
                </h1>
              <div className={`${isPwaMode ? 'text-xs' : ''} flex items-center gap-2 mt-2 text-gray-500 dark:text-gray-400`}>
                <FaClock className="text-indigo-500" />
                <span>{new Date().toLocaleDateString("th-TH", { dateStyle: 'long' })}</span>
              </div>
            </div>
          </div>


            <div className="w-full md:w-72">
              {isHomeroom ? (
                <div className="w-full bg-indigo-50 dark:bg-indigo-900/20 border border-indigo-200 dark:border-indigo-800 rounded-xl px-4 py-2.5 text-indigo-900 dark:text-indigo-100 font-semibold text-center">
                  ชั้น {selectedClass}
                </div>
              ) : (
                <div className="flex gap-2">
                  <select
                    value={selectedClassLevel}
                    onChange={(e) => setSelectedClassLevel(e.target.value)}
                    className="w-full px-3 py-2.5 bg-white dark:bg-[#2a2b2f] border border-gray-200 dark:border-gray-700 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none text-sm text-gray-900 dark:text-white"
                  >
                    <option value="">ชั้น</option>
                    {availableLevels.map(level => <option key={level} value={level}>{level}</option>)}
                  </select>
                  <select
                    value={selectedRoom}
                    onChange={(e) => setSelectedRoom(e.target.value)}
                    className="w-full px-3 py-2.5 bg-white dark:bg-[#2a2b2f] border border-gray-200 dark:border-gray-700 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none text-sm text-gray-900 dark:text-white"
                  >
                    <option value="">ห้อง</option>
                    {Array.from({ length: 20 }, (_, i) => i + 1).map(r => <option key={r} value={r}>{r}</option>)}
                  </select>
                </div>
              )}
            </div>
          </div>

          {/* แสดงแถบแจ้งเตือนวันหยุดกรณีพิเศษ / วันหยุดราชการ / วันเรียนชดเชย */}
          {(() => {
            if (!todayEvent) return null;

            if (todayEvent.type === 'specialHoliday') {
              return (
                <div className="relative overflow-hidden rounded-xl bg-gradient-to-r from-amber-500/90 to-orange-500/90 p-1 shadow-lg backdrop-blur-sm transform transition-all hover:scale-[1.01]">
                  <div className="absolute top-0 right-0 -mt-8 -mr-8 w-32 h-32 bg-white opacity-10 rounded-full blur-xl"></div>
                  <div className="relative bg-black/10 rounded-lg p-4 flex items-center gap-4">
                    <div className="flex-shrink-0">
                      <Sparkles className="w-6 h-6 text-white opacity-90" />
                    </div>
                    <div className="flex-grow">
                      <h3 className="text-lg font-bold text-white leading-tight drop-shadow">
                        {todayEvent.description}
                      </h3>
                      <p className="text-amber-100 text-sm font-medium opacity-90">วันหยุดกรณีพิเศษ</p>
                    </div>
                  </div>
                </div>
              );
            } else if (todayEvent.type === 'holiday') {
              return (
                <div className="relative overflow-hidden rounded-xl bg-gradient-to-r from-red-500/90 to-rose-500/90 p-1 shadow-lg backdrop-blur-sm transform transition-all hover:scale-[1.01]">
                  <div className="absolute top-0 right-0 -mt-8 -mr-8 w-32 h-32 bg-white opacity-10 rounded-full blur-xl"></div>
                  <div className="relative bg-black/10 rounded-lg p-4 flex items-center gap-4">
                    <div className="flex-shrink-0">
                      <CalendarOff className="w-6 h-6 text-white opacity-90" />
                    </div>
                    <div className="flex-grow">
                      <h3 className="text-lg font-bold text-white leading-tight drop-shadow">
                        {todayEvent.description}
                      </h3>
                      <p className="text-red-100 text-sm font-medium opacity-90">วันหยุดราชการ</p>
                    </div>
                  </div>
                </div>
              );
            } else if (todayEvent.type === 'schoolDay' && todayEvent.description) {
              return (
                <div className="relative overflow-hidden rounded-xl bg-gradient-to-r from-blue-500/90 to-indigo-500/90 p-1 shadow-lg backdrop-blur-sm transform transition-all hover:scale-[1.01]">
                  <div className="absolute top-0 right-0 -mt-8 -mr-8 w-32 h-32 bg-white opacity-10 rounded-full blur-xl"></div>
                  <div className="relative bg-black/10 rounded-lg p-4 flex items-center gap-4">
                    <div className="flex-shrink-0">
                      <School className="w-6 h-6 text-white opacity-90" />
                    </div>
                    <div className="flex-grow">
                      <h3 className="text-lg font-bold text-white leading-tight drop-shadow">
                        {todayEvent.description}
                      </h3>
                      <p className="text-blue-100 text-sm font-medium opacity-90">กิจกรรม / เรียนชดเชย</p>
                    </div>
                  </div>
                </div>
              );
            }
            return null;
          })()}

          {isHoliday ? (
            <div className="text-center py-20 bg-white dark:bg-[#2a2b2f] rounded-2xl shadow-sm dark:shadow-none border border-dashed border-gray-300 dark:border-gray-700">
              <h2 className="text-2xl font-bold text-gray-400 dark:text-gray-500">วันนี้เป็นวันหยุด</h2>
              <p className="text-xl text-indigo-500 dark:text-indigo-400 mt-2 font-semibold">{holidayDescription}</p>
              <p className="text-gray-400 dark:text-gray-500 mt-2">งดการตรวจเช็คกิจกรรมเข้าแถว</p>
            </div>
          ) : (
            <>
              {isLoading && selectedClass && <FlagCeremonyPageSkeleton />}

              {!isLoading && selectedClass && (
                <>
                  {/* Summary Cards */}
                  <div className={isPwaMode ? "grid grid-cols-2 gap-3" : "grid grid-cols-2 lg:grid-cols-4 gap-4"}>
                    <div className={`bg-white dark:bg-[#2a2b2f] rounded-2xl border border-gray-100 dark:border-gray-700 shadow-sm flex items-center justify-between relative group min-w-0 ${isPwaMode ? 'p-3' : 'p-4'}`}>

                      <div>
                        <p className={`${isPwaMode ? 'text-xs' : 'text-sm'} font-medium text-gray-500 dark:text-gray-400`}>มาเรียน</p>
                        <p className={`${isPwaMode ? 'text-2xl' : 'text-3xl'} font-bold text-gray-900 dark:text-white mt-1`}>{attendanceSummary.มา}</p>
                      </div>
                      <div className={`${isPwaMode ? 'w-10 h-10' : 'w-12 h-12'} rounded-xl bg-green-100 dark:bg-green-500/20 flex items-center justify-center text-green-600 dark:text-green-400 shrink-0`}>
                        <FaCheck className={isPwaMode ? "text-lg" : "text-xl"} />
                      </div>
                    </div>

                    <div className={`bg-white dark:bg-[#2a2b2f] rounded-2xl border border-gray-100 dark:border-gray-700 shadow-sm flex items-center justify-between relative group min-w-0 ${isPwaMode ? 'p-3' : 'p-4'}`}>

                      <div>
                        <p className={`${isPwaMode ? 'text-xs' : 'text-sm'} font-medium text-gray-500 dark:text-gray-400`}>มาสาย</p>
                        <p className={`${isPwaMode ? 'text-2xl' : 'text-3xl'} font-bold text-gray-900 dark:text-white mt-1`}>{attendanceSummary.สาย}</p>
                      </div>
                      <div className={`${isPwaMode ? 'w-10 h-10' : 'w-12 h-12'} rounded-xl bg-yellow-100 dark:bg-yellow-500/20 flex items-center justify-center text-yellow-600 dark:text-yellow-400 shrink-0`}>
                        <FaClock className={isPwaMode ? "text-lg" : "text-xl"} />
                      </div>
                    </div>

                    <div className={`bg-white dark:bg-[#2a2b2f] rounded-2xl border border-gray-100 dark:border-gray-700 shadow-sm flex items-center justify-between relative group min-w-0 ${isPwaMode ? 'p-3' : 'p-4'}`}>

                      <div>
                        <p className={`${isPwaMode ? 'text-xs' : 'text-sm'} font-medium text-gray-500 dark:text-gray-400`}>ลา</p>
                        <p className={`${isPwaMode ? 'text-2xl' : 'text-3xl'} font-bold text-gray-900 dark:text-white mt-1`}>{attendanceSummary.ลา}</p>
                      </div>
                      <div className={`${isPwaMode ? 'w-10 h-10' : 'w-12 h-12'} rounded-xl bg-blue-100 dark:bg-blue-500/20 flex items-center justify-center text-blue-600 dark:text-blue-400 shrink-0`}>
                        <FaUserSlash className={isPwaMode ? "text-lg" : "text-xl"} />
                      </div>
                    </div>

                    <div className={`bg-white dark:bg-[#2a2b2f] rounded-2xl border border-gray-100 dark:border-gray-700 shadow-sm flex items-center justify-between relative group min-w-0 ${isPwaMode ? 'p-3' : 'p-4'}`}>
                      <div className="absolute right-0 top-0 w-24 h-24 bg-red-500/5 rounded-full -mr-6 -mt-6 transition-transform group-hover:scale-110"></div>
                      <div>
                        <p className={`${isPwaMode ? 'text-xs' : 'text-sm'} font-medium text-gray-500 dark:text-gray-400`}>ขาดเรียน</p>
                        <p className={`${isPwaMode ? 'text-2xl' : 'text-3xl'} font-bold text-gray-900 dark:text-white mt-1`}>{attendanceSummary.ขาด}</p>
                      </div>
                      <div className={`${isPwaMode ? 'w-10 h-10' : 'w-12 h-12'} rounded-xl bg-red-100 dark:bg-red-500/20 flex items-center justify-center text-red-600 dark:text-red-400 shrink-0`}>
                        <FaTimes className={isPwaMode ? "text-lg" : "text-xl"} />
                      </div>
                    </div>
                  </div>

                  {/* Sticky Action Bar */}
                  <div className={`bg-white dark:bg-[#2a2b2f] rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 sticky top-[70px] z-10 backdrop-blur-md bg-white/90 dark:bg-[#2a2b2f]/90 ${isPwaMode ? 'p-3' : 'p-4'}`}>
                    <div className={`flex flex-col lg:flex-row lg:items-end justify-between ${isPwaMode ? 'gap-3' : 'gap-4'}`}>
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-3">
                          <div className="bg-indigo-100 dark:bg-indigo-900/30 p-2 rounded-lg text-indigo-600 dark:text-indigo-400">
                            <FaUserGraduate />
                          </div>
                          <span className={`${isPwaMode ? 'text-sm' : ''} text-gray-600 dark:text-gray-300 font-medium`}>
                            นักเรียนทั้งหมด <span className="text-indigo-600 dark:text-indigo-400 font-bold text-lg">{students.length}</span> คน
                          </span>
                        </div>

                        <label className={`block font-semibold text-gray-500 dark:text-gray-400 mb-2 ${isPwaMode ? 'text-xs' : 'text-sm'}`}>
                          คำสั่งรวมสำหรับเช็คแถว
                        </label>
                        <div className="flex gap-2 w-full lg:max-w-2xl">
                          <select
                            value={selectedFlagAction}
                            onChange={(e) => {
                              // แค่ตั้งค่า "แม่แบบ" ที่จะใช้ตอนคลิกการ์ดนักเรียนทีละคน — ไม่ใช้กับทุกคน
                              // ทันทีที่เลือก ต้องกดปุ่ม "ใช้กับทุกคน" เองถึงจะใช้กับทุกคนจริงๆ
                              const value = e.target.value as FlagAction | "";
                              setSelectedFlagAction(value);
                            }}
                            className={`flex-1 min-w-0 bg-white dark:bg-[#1e1f21] border border-gray-200 dark:border-gray-700 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none font-bold text-gray-900 dark:text-white ${isPwaMode ? 'px-3 py-3 text-sm' : 'px-4 py-3 text-base'}`}
                          >
                            <option value="" disabled className="text-gray-500 dark:text-gray-300">กรุณาเลือกสถานะ</option>
                            {FLAG_ACTION_OPTIONS.map(option => (
                              <option key={option.value} value={option.value} className="text-gray-900 dark:text-white">
                                {getDynamicFlagActionLabel(option.value, behaviorScoreConfig)}
                              </option>
                            ))}
                          </select>
                          <button
                            type="button"
                            onClick={() => applyActionToAllStudents()}
                            disabled={!selectedFlagAction}
                            className={`shrink-0 rounded-xl bg-indigo-100 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-300 font-bold hover:bg-indigo-200 dark:hover:bg-indigo-900/50 transition-all disabled:opacity-50 disabled:cursor-not-allowed ${isPwaMode ? 'px-3 py-3 text-xs' : 'px-4 py-3 text-sm'}`}
                          >
                            ใช้กับทุกคน
                          </button>
                        </div>
                        <p className={`${isPwaMode ? 'text-[11px]' : 'text-xs'} text-gray-400 dark:text-gray-500 mt-2`}>
                          เลือกคำสั่งด้านบนจะใช้กับนักเรียนทั้งชั้นทันที หรือคลิกการ์ดนักเรียนเป็นรายคนเพื่อปรับเฉพาะคนนั้น
                        </p>
                      </div>

                      <button
                        onClick={handleSaveAll}
                        disabled={isLoading}
                        className={`bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-xl shadow-lg shadow-indigo-500/30 hover:shadow-indigo-500/50 transition-all duration-200 flex items-center justify-center gap-2 disabled:bg-gray-400 disabled:shadow-none transform active:scale-95 ${isPwaMode ? 'py-3 px-4 text-sm' : 'py-3 px-6'}`}
                      >
                        <FaCheck /> {isAlreadySaved ? 'อัปเดตข้อมูล' : 'บันทึกข้อมูล'}
                      </button>
                    </div>
                  </div>

                  {/* Student Grid */}
                  {/* items-start กันไม่ให้การ์ดในแถวเดียวกันถูกยืด (stretch) สูงตามการ์ดที่สูงที่สุด
                      เวลาการ์ดใดการ์ดหนึ่งเปลี่ยนเนื้อหาแล้วสูงขึ้นชั่วขณะ จะได้ไม่ลากการ์ดข้างๆ เด้งตามไปด้วย */}
                  <div className={isPwaMode ? "grid grid-cols-1 gap-3 items-start" : "grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 sm:gap-6 items-start"}>
                    {students.map((student) => {
                      const actionTone = getFlagActionTone(student.flagAction, student.attendanceStatus);
                      const actionLabel = getFlagDisplayLabel(student.flagAction, student.attendanceStatus);
                      const gateData = (student as any)._gateData;
                      const leaveData = (student as any)._leaveData;
                      const hasGateScan = !!(gateData?.checkinTime);
                      const isLeaveStudent = !!(leaveData) || student.flagAction === "sickLeave" || student.flagAction === "personalLeave" || student.attendanceStatus === ATTENDANCE_STATUS.LEAVE;
                      const canSelectCard = true;

                      return (
                      <div
                        key={student.id}
                        role="button"
                        tabIndex={0}
                        onClick={() => {
                          if (!canSelectCard) return;
                          toggleSelectedActionForStudent(student.id);
                        }}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" || e.key === " ") {
                            e.preventDefault();
                            if (!canSelectCard) return;
                            toggleSelectedActionForStudent(student.id);
                          }
                        }}
                        className={`relative group rounded-2xl border-2 transition-all duration-300 hover:shadow-lg min-w-0 overflow-hidden ${isPwaMode ? 'p-3' : 'p-4 sm:p-6'} ${canSelectCard ? 'cursor-pointer active:scale-[0.98]' : 'cursor-not-allowed opacity-80'} ${selectedStudentIds.has(student.id) ? "ring-2 ring-indigo-400 ring-offset-2 ring-offset-gray-50 dark:ring-offset-[#1e1f21]" : ""} ${actionTone.card}`}
                      >
                        {selectedStudentIds.has(student.id) && (
                          <div className={`absolute top-3 right-3 inline-flex items-center gap-1 rounded-full bg-indigo-600 px-2 py-1 font-bold text-white shadow-lg ${isPwaMode ? 'text-[11px]' : 'text-xs'}`}>
                            <FaCheck className="w-3 h-3" />
                            เลือกแล้ว
                          </div>
                        )}
                        {!canSelectCard && !selectedStudentIds.has(student.id) && (
                          <div className={`absolute top-3 right-3 inline-flex items-center gap-1 rounded-full bg-rose-500 px-2 py-1 font-bold text-white shadow-lg ${isPwaMode ? 'text-[11px]' : 'text-xs'}`}>
                            <FaTimes className="w-3 h-3" />
                            ดำเนินการ
                          </div>
                        )}
                        <div className={isPwaMode ? "flex flex-col gap-3" : "flex flex-col gap-3 sm:flex-col sm:items-center sm:gap-4"}>
                          <div className={isPwaMode ? "flex items-center gap-3 min-w-0 pr-20" : "flex items-center gap-3 min-w-0 pr-20 sm:pr-0 sm:contents"}>
                          {/* Avatar with Status Dot or X mark */}
                          <div className="relative flex-shrink-0">
                            <div className="block relative">
                              <div className="absolute -inset-1 bg-gradient-to-br from-indigo-500 to-purple-500 rounded-full opacity-0 group-hover:opacity-20 transition-opacity blur"></div>
                              <img
                                src={student.profileImageThumbUrl || student.profileImageUrl || `https://ui-avatars.com/api/?name=${student.name}&background=random`}
                                alt={student.name}
                                loading="lazy"
                                // object-top (0%) ครอปชิดขอบบนสุดของรูปต้นฉบับพอดี ทำให้เหลือพื้นที่ว่าง
                                // เหนือศีรษะเยอะเกินไปเพราะรูปนักเรียนมักมีพื้นหลังเว้นด้านบนอยู่แล้ว จึงขยับ
                                // เป็น 18% (ค่อนไปทางบนแต่ไม่ชิดขอบเป๊ะ) ให้ใบหน้าเต็มกรอบขึ้นแต่ยังเว้นพื้นที่นิดหน่อย
                                className={`relative rounded-full object-cover object-[50%_18%] border-4 border-white dark:border-[#2a2b2f] shadow-sm transition-transform group-hover:scale-105 ${isPwaMode ? 'w-14 h-14' : 'w-16 h-16 sm:w-24 sm:h-24'}`}
                              />
                            </div>
                            {student.attendanceStatus !== ATTENDANCE_STATUS.ABSENT || hasGateScan || isLeaveStudent ? (
                              <div className={`absolute bottom-0 right-0 sm:bottom-1 sm:right-1 w-5 h-5 sm:w-6 sm:h-6 rounded-full border-2 sm:border-4 border-white dark:border-[#2a2b2f] shadow-sm ${actionTone.dot}`}></div>
                            ) : (
                              <div className="absolute bottom-0 right-0 sm:bottom-1 sm:right-1 w-5 h-5 sm:w-6 sm:h-6 rounded-full border-2 sm:border-4 border-white dark:border-[#2a2b2f] shadow-sm bg-rose-500 flex items-center justify-center">
                                <FaTimes className="w-2.5 h-2.5 sm:w-3 sm:h-3 text-white" />
                              </div>
                            )}
                          </div>

                          {/* Info */}
                          <div className={`flex-grow min-w-0 ${isPwaMode ? 'text-left' : 'text-left sm:text-center'}`}>
                            <h3 className={`font-bold text-gray-900 dark:text-white truncate ${isPwaMode ? 'text-base' : 'text-lg sm:text-xl'}`} title={student.name}>
                              {student.name}
                            </h3>
                            {/* min-h กันไม่ให้การ์ดเปลี่ยนความสูงตอนสลับ badge (เช่น "เวลาสแกนเข้า: HH:MM น." ↔ "ไม่ลงเวลา")
                                ซึ่งยาวไม่เท่ากันจนทำให้ขึ้น-ลง 1/2 บรรทัดต่างกัน แล้วไปดันทั้งแถวในกริดให้เด้ง/สะดุ้ง */}
                            <p className={`${isPwaMode ? 'text-xs min-h-[34px]' : 'text-sm min-h-[42px]'} text-gray-500 dark:text-gray-400 mt-0.5 sm:mt-2 flex flex-wrap gap-1 items-center content-start justify-start sm:justify-center`}>
                              <span className={`inline-block bg-white/50 dark:bg-black/20 px-2 py-0.5 rounded-md font-mono truncate ${isPwaMode ? 'text-[11px]' : 'text-xs sm:text-sm'}`}>
                                {student.studentId}
                              </span>

                              {gateData?.checkinTime && student.flagAction !== "cancelFlagKeepGate" ? (
                                <span className="inline-flex items-center gap-1 rounded bg-emerald-100 text-emerald-800 dark:bg-emerald-500/20 dark:text-emerald-300 px-1.5 py-0.5 text-[10px] font-bold">
                                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
                                  เวลาสแกนเข้า: {gateData.checkinTime} น.
                                </span>
                              ) : (
                                student.attendanceStatus === ATTENDANCE_STATUS.ABSENT && (
                                  <span className="inline-flex items-center gap-1 rounded bg-rose-100 text-rose-800 dark:bg-rose-500/20 dark:text-rose-300 px-1.5 py-0.5 text-[10px] font-bold">
                                    <span className="w-1.5 h-1.5 rounded-full bg-rose-500"></span>
                                    ไม่ลงเวลา
                                  </span>
                                )
                              )}

                              {/* แสดงส่วนลงลา */}
                              {leaveData && (
                                <span className="inline-flex items-center gap-1 rounded bg-amber-100 text-amber-800 dark:bg-amber-500/20 dark:text-amber-300 px-1.5 py-0.5 text-[10px] font-bold">
                                  <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse"></span>
                                  ลา: {leaveData.type}
                                </span>
                              )}
                            </p>
                          </div>
                          </div>

                          <div
                            onClick={(e) => e.stopPropagation()}
                            className={`w-full min-w-0 rounded-xl bg-white/95 dark:bg-black/40 border border-gray-200 dark:border-gray-700 px-3 py-2 transition-all ${isPwaMode ? 'mt-0' : 'mt-0 sm:mt-2'}`}
                          >
                            <div className="flex items-center gap-2 min-w-0 justify-between">
                              <span className={`shrink-0 inline-flex min-w-10 max-w-[65%] items-center justify-center rounded-lg px-2 py-1 font-extrabold ${isPwaMode ? 'text-xs' : 'text-sm'} ${actionTone.badge}`}>
                                <span className="truncate">{actionLabel}</span>
                              </span>
                              <select
                                value={student.flagAction || ""}
                                onChange={(e) => {
                                  e.stopPropagation();
                                  handleIndividualActionChange(student.id, e.target.value as FlagAction);
                                }}
                                className={`flex-1 min-w-0 bg-transparent border-0 font-bold p-0 text-gray-900 dark:text-white focus:ring-0 cursor-pointer outline-none focus:outline-none ${isPwaMode ? 'text-xs' : 'text-sm'}`}
                              >
                                <option value="" disabled className="text-gray-500 dark:text-gray-300">กรุณาเลือกสถานะ</option>
                                {FLAG_ACTION_OPTIONS.filter(option => {
                                  if (hasGateScan) {
                                    return option.value !== "noScanPresentNoDeduct" && option.value !== "noScanPresentDeduct";
                                  }
                                  return true;
                                }).map(option => (
                                  <option key={option.value} value={option.value} className="bg-white dark:bg-[#1e1f21] text-gray-900 dark:text-white font-bold">
                                    {getDynamicFlagActionLabel(option.value, behaviorScoreConfig)}
                                  </option>
                                ))}
                              </select>
                            </div>
                          </div>

                          <div className={`w-full flex items-center justify-between gap-2 text-gray-500 dark:text-gray-400 px-1 min-w-0 ${isPwaMode ? 'mt-0 text-[11px]' : 'mt-0 sm:mt-1.5 text-xs'}`}>
                            <span className="min-w-0 truncate">คะแนนความประพฤติ</span>
                            {(() => {
                              const preview = getBehaviorScorePreview(student);
                              const yesterdayScore = preview ? preview.yesterdayScore : (student.behaviorScore ?? 100);
                              const nextScore = preview ? preview.nextScore : (student.behaviorScore ?? 100);
                              const delta = preview ? preview.delta : 0;
                              return (
                                <span className={`flex shrink-0 items-center font-bold ${isPwaMode ? 'gap-1.5' : 'gap-2'}`}>
                                  <span className="text-emerald-600 dark:text-emerald-400">{yesterdayScore}</span>
                                  {preview && (
                                    <>
                                      <span className="text-gray-400 dark:text-gray-500">→</span>
                                      <span className={delta < 0 ? "text-rose-500 dark:text-rose-400" : "text-emerald-600 dark:text-emerald-400"}>
                                        {nextScore}
                                      </span>
                                      <span className={`rounded-full px-2 py-0.5 text-[10px] ${delta < 0
                                        ? "bg-rose-100 text-rose-700 dark:bg-rose-500/20 dark:text-rose-300"
                                        : "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-300"
                                        }`}>
                                        {delta > 0 ? "+" : ""}{delta}
                                      </span>
                                    </>
                                  )}
                                </span>
                              );
                            })()}
                          </div>
                        </div>
                      </div>
                      );
                    })}
                  </div>
                </>
              )}

              {error && (
                <div className="text-center py-10 bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500 rounded-xl">
                  <p className="text-lg text-red-400">{error}</p>
                </div>
              )}

              {!selectedClass && !isLoading && (
                <div className="text-center py-20 bg-white dark:bg-[#2a2b2f] rounded-2xl shadow-sm dark:shadow-none border border-dashed border-gray-300 dark:border-gray-700">
                  <h2 className="text-2xl font-bold text-gray-400 dark:text-gray-500">กรุณาเลือกห้องเรียน</h2>
                  <p className="text-gray-400 dark:text-gray-500 mt-2">เพื่อเริ่มการเช็คชื่อกิจกรรมเข้าแถว</p>
                </div>
              )}
            </>
          )}

        </div>
      </div>
    </MainLayout>
  );
};

export default FlagCeremonyPage;
