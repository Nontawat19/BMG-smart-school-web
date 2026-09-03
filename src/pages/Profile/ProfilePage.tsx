import React, { useEffect, useState, useMemo } from "react";
import { query, where, getDocs, orderBy, limit, collection, collectionGroup, Timestamp, doc, getDoc, documentId, updateDoc, onSnapshot, DocumentSnapshot } from "firebase/firestore";
import { firestore } from "@/firebase";
import { ToastContainer, toast } from "react-toastify";
import { useNavigate } from "react-router-dom";
import { useSelector } from "react-redux";
import { RootState } from "@/store";
import { fetchTeachersMap } from '@/store/slices/userMapSlice';
import MainLayout from "@/layouts/MainLayout";
import LogoutButton from "@/components/LogoutButton";
import ProfileAvatar from "@/components/Shared/ProfileAvatar";
import { FaPen, FaSun, FaMoon, FaBook, FaUser, FaBriefcase, FaChalkboard, FaChevronRight, FaClock, FaExchangeAlt, FaPlane, FaIdCard, FaUsers, FaMapMarkerAlt, FaHeartbeat, FaSearch, FaEdit, FaChevronDown, FaChevronUp, FaThLarge, FaList, FaQrcode, FaLine, FaCopy, FaExternalLinkAlt, FaEye, FaEyeSlash, FaExclamationTriangle } from "react-icons/fa";
import { useTheme } from "../../ThemeContext";
import SkeletonLoader from "@/components/SkeletonLoader";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, Cell, ResponsiveContainer, LineChart, Line, Legend, AreaChart, Area, ComposedChart } from 'recharts';
import { Chart } from "react-google-charts";
import QRCode from "react-qr-code";
import OfficialTravelPdfButton from "../../components/Pdf/OfficialTravel/OfficialTravelPdfButton";
import { ViewCourseDetailModal } from "./components/ViewCourseDetailModal";
import { EditCourseModal } from "./components/EditCourseModal";
import { useDispatch } from "react-redux";
import Swal from 'sweetalert2';

import "react-toastify/dist/ReactToastify.css";
import { getCurrentThaiYear } from "@/utils/dateUtils";
import { fetchCalendar } from "@/store/slices/calendarSlice";
import { getActiveSortedTeachers } from "@/utils/teacherSortUtils";
import { CLASSES, getGroupPersonnel } from "@/utils/schoolUtils";
import { getEffectivePeriodEnd, getScheduleSlotCandidates, getTimetableDisplayPeriods, normalizePeriodSettings } from "@/utils/scheduleDisplayUtils";
import {
    FlaggedCourse, StudentFlagRow, RemediationWindowConfig,
    fetchFlaggedStudents, isRemediationWindowOpen,
} from '@/utils/remediationUtils';
import { AlertTriangle as LucideAlertTriangle, Clock, CheckCircle2, XCircle, RefreshCw, Send, ClipboardList, AlertCircle } from 'lucide-react';

// 1. สร้าง Interface สำหรับข้อมูลโปรไฟล์
interface TeacherProfile {
  title: string;
  firstName: string;
  lastName: string;
  email: string;
  teacherId: string; // รหัสครู (จากฟอร์ม)
  department: string;
  contact: string;
  address: string;
  profileImageUrl: string;
  schoolId: string; // ID ของโรงเรียน
  docId: string; // Document ID ของครูใน Firestore
  isHomeroomTeacher: boolean; // เป็นครูประจำชั้นหรือไม่
  homeroomGrade: string; // ชั้นที่ประจำ
  room?: string; // ห้อง
  position?: string;
  academicStanding?: string;
  licenseNumber?: string;
  startDate?: string;
  educationLevel?: string;
  major?: string;
  dob?: string;
  gender?: string;
  lineId?: string;
  createdAt?: Timestamp;
  updatedAt?: Timestamp;
  advisorRole?: string;
  learningArea?: string;
  isHeadOfLearningArea?: boolean;
  attendanceStats?: {
    present: number;
    late: number;
    leave: number;
    absent: number;
    early: number;
    noCheckout?: number;
    official_travel_days?: number; // Added field
  };
  personnelType?: 'teacher' | 'user';
}

interface CourseData {
  id: string;
  title?: string;
  courseName?: string;
  subjectName?: string;
  code?: string;
  courseCode?: string;
  gradeLevel?: string;
  // Fields for EditCourseModal
  classId?: string | string[];
  room?: string[];
  hoursPerWeek?: number;
  teacherId?: string;
  teacherIds?: string[];
  credits?: number;
  semester?: string;
  isCombined?: boolean;
  teacherAssignments?: {
    teacherId: string;
    classLevels: string[];
    roomIds: string[];
  }[];
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
}

interface Substitution {
  id: string;
  date: Timestamp;
  period: number;
  subjectName: string;
  classId: string;
  originalTeacherName: string;
  status?: string;
}

const DAYS: Record<string, string> = {
  mon: 'จันทร์',
  tue: 'อังคาร',
  wed: 'พุธ',
  thu: 'พฤหัสบดี',
  fri: 'ศุกร์',
};

const DAY_SHORT_LABELS: Record<string, string> = {
  mon: 'จ',
  tue: 'อ',
  wed: 'พ',
  thu: 'พฤ',
  fri: 'ศ',
};

const DEFAULT_PERIODS = [
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

const getAssignmentTeacherIds = (assignment: any): string[] => {
  const ids = Array.isArray(assignment?.teacherIds) && assignment.teacherIds.length > 0
    ? assignment.teacherIds
    : (assignment?.teacherId ? [assignment.teacherId] : []);
  return Array.from(new Set(ids.filter(Boolean)));
};

const assignmentIncludesTeacher = (assignment: any, teacherId: string) => {
  const ids = getAssignmentTeacherIds(assignment);
  return ids.length === 0 || ids.includes(teacherId);
};

const matchesScheduleYearTerm = (data: any, year: string, term: string) => {
  const dataYear = String(data.academicYear || '');
  const dataTerm = String(data.semester || '');
  const yearMatches = !year || !dataYear || dataYear === String(year);
  const termMatches = !term || !dataTerm || dataTerm === String(term) || dataTerm.startsWith(`${term}/`) || String(term).startsWith(`${dataTerm}/`);
  return yearMatches && termMatches;
};

const formatGradeLevel = (grade?: any) => {
  if (!grade) return "";

  // แปลงเป็น string ก่อนเผื่อกรณีข้อมูลเป็นตัวเลข
  const gradeStr = String(grade);
  const upperGrade = gradeStr.toUpperCase();

  const map: Record<string, string> = {
    "P1": "ป.1", "P2": "ป.2", "P3": "ป.3", "P4": "ป.4", "P5": "ป.5", "P6": "ป.6",
    "M1": "ม.1", "M2": "ม.2", "M3": "ม.3", "M4": "ม.4", "M5": "ม.5", "M6": "ม.6",
  };

  if (map[upperGrade]) return `ชั้น ${map[upperGrade]}`;

  if (upperGrade.startsWith("M")) return `ชั้น ม.${upperGrade.substring(1)}`;
  if (upperGrade.startsWith("P")) return `ชั้น ป.${upperGrade.substring(1)}`;

  return `ชั้น ${gradeStr}`;
};

const formatDate = (date: any) => {
  if (!date) return "-";
  let d: Date;
  if (date.toDate && typeof date.toDate === 'function') {
    d = date.toDate();
  } else {
    d = new Date(date);
  }

  if (isNaN(d.getTime())) return "วันที่ไม่ถูกต้อง";

  return d.toLocaleDateString('th-TH', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
};

const DetailField: React.FC<{ label: string; value?: any }> = ({
  label,
  value,
}) => (
  <div>
    <label className="block text-sm font-medium text-gray-500 dark:text-gray-400">{label}</label>
    <p className="mt-1 text-md text-gray-900 dark:text-gray-200 font-semibold">
      {value !== undefined && value !== null && value !== ""
        ? (Array.isArray(value) ? value.join(', ') : String(value))
        : "-"}
    </p>
  </div>
);

const InfoCard: React.FC<{ title: string; children: React.ReactNode }> = ({ title, children }) => (
  <div className="bg-white dark:bg-[#2a2b2f] p-6 rounded-2xl shadow-sm dark:shadow-none">
    <h2 className="text-lg font-semibold mb-4 text-gray-800 dark:text-gray-200 border-b border-gray-200 dark:border-gray-600 pb-2">{title}</h2>
    <div className="space-y-4">{children}</div>
  </div>
);

const MONTHLY_STAT_LEGEND: { key: string; label: string; color: string }[] = [
  { key: 'present', label: 'มาปกติ', color: '#22c55e' },
  { key: 'late', label: 'สาย', color: '#eab308' },
  { key: 'leave', label: 'ลา', color: '#3b82f6' },
  { key: 'absent', label: 'ขาด', color: '#ef4444' },
  { key: 'early', label: 'กลับก่อน', color: '#f97316' },
  { key: 'noCheckout', label: 'ไม่ลงเวลาออก', color: '#a855f7' },
];

const ProfilePageSkeleton: React.FC = () => {
  return (
    <MainLayout>
      <div className="max-w-4xl mx-auto px-3 sm:px-4 md:px-6 lg:px-8 py-4 sm:py-6 lg:py-8">
        <header className="mb-8">
          <div className="flex justify-between items-center">
            <div className="space-y-3">
              <SkeletonLoader className="h-10 w-52 rounded-md" />
              <SkeletonLoader className="h-6 w-72 rounded-md" />
            </div>
            <div className="flex items-center gap-3">
              <SkeletonLoader className="h-11 w-11 rounded-md" />
              <SkeletonLoader className="h-11 w-40 rounded-md" />
            </div>
          </div>
        </header>

        <div className="space-y-6">
          {/* Card ข้อมูลส่วนตัว */}
          <div className="p-6 rounded-2xl bg-white dark:bg-[#2a2b2f] shadow-sm dark:shadow-none">
            <SkeletonLoader className="h-8 w-1/3 mb-6 pb-3 border-b border-gray-200 dark:border-gray-600" />
            <div className="flex flex-col sm:flex-row items-center sm:items-start gap-8 pt-4">
              <div className="flex-shrink-0">
                <SkeletonLoader className="w-40 h-40 rounded-full" />
              </div>
              <div className="flex-grow space-y-6 w-full mt-2">
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
                  <div className="space-y-2">
                    <SkeletonLoader className="h-5 w-24 rounded-md" />
                    <SkeletonLoader className="h-6 w-32 rounded-md" />
                  </div>
                  <div className="space-y-2">
                    <SkeletonLoader className="h-5 w-20 rounded-md" />
                    <SkeletonLoader className="h-6 w-36 rounded-md" />
                  </div>
                  <div className="space-y-2">
                    <SkeletonLoader className="h-5 w-24 rounded-md" />
                    <SkeletonLoader className="h-6 w-36 rounded-md" />
                  </div>
                </div>
                <div className="space-y-2 pt-2">
                  <SkeletonLoader className="h-5 w-16 rounded-md" />
                  <SkeletonLoader className="h-6 w-64 rounded-md" />
                </div>
              </div>
            </div>
          </div>

          {/* Card ข้อมูลการทำงาน */}
          <div className="p-6 rounded-2xl bg-white dark:bg-[#2a2b2f] shadow-sm dark:shadow-none">
            <SkeletonLoader className="h-8 w-1/3 mb-6 pb-3 border-b border-gray-200 dark:border-gray-600" />
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 pt-4">
              <div className="space-y-2">
                <SkeletonLoader className="h-5 w-20 rounded-md" />
                <SkeletonLoader className="h-6 w-32 rounded-md" />
              </div>
              <div className="space-y-2">
                <SkeletonLoader className="h-5 w-20 rounded-md" />
                <SkeletonLoader className="h-6 w-32 rounded-md" />
              </div>
            </div>
            <div className="mt-6 space-y-2">
              <SkeletonLoader className="h-5 w-16 rounded-md" />
              <SkeletonLoader className="h-6 w-[80%] rounded-md" />
            </div>
          </div>

          {/* Card การตั้งค่าบัญชี */}
          <div className="p-6 rounded-2xl bg-white dark:bg-[#2a2b2f] shadow-sm dark:shadow-none flex justify-between items-center">
            <div className="w-1/2 space-y-3">
              <SkeletonLoader className="h-7 w-40 rounded-md" />
              <SkeletonLoader className="h-5 w-56 rounded-md" />
            </div>
            <SkeletonLoader className="h-11 w-32 rounded-md" />
          </div>
        </div>
      </div>
    </MainLayout>
  );
};

const ProfilePage: React.FC = () => {
  const navigate = useNavigate();
  const currentUser = useSelector((state: RootState) => state.auth.user);
  const appProfile = useSelector((state: RootState) => state.profile);

  const getLevelLabel = (id: string | undefined) => {
    if (!id) return "";
    const map: Record<string, string> = {
      k1: 'อนุบาล 1', k2: 'อนุบาล 2', k3: 'อนุบาล 3',
      p1: 'ป.1', p2: 'ป.2', p3: 'ป.3', p4: 'ป.4', p5: 'ป.5', p6: 'ป.6',
      m1: 'ม.1', m2: 'ม.2', m3: 'ม.3', m4: 'ม.4', m5: 'ม.5', m6: 'ม.6',
      junior_high: 'ม.ต้น', senior_high: 'ม.ปลาย',
      'ม.ต้น': 'ม.ต้น', 'ม.ปลาย': 'ม.ปลาย'
    };
    return map[id] || id;
  };

  // 2. รวม State ให้จัดการง่ายขึ้น
  const [profile, setProfile] = useState<any | null>(null);
  const [userRole, setUserRole] = useState<'teacher' | 'student' | 'user' | null>(null);
  const [isFetching, setIsFetching] = useState(true);
  const [courses, setCourses] = useState<CourseData[]>([]);
  const [rooms, setRooms] = useState<any[]>([]);
  const [activeTab, setActiveTab] = useState("general");
  const [isLiffIdVisible, setIsLiffIdVisible] = useState(false);
  const [coursesFetched, setCoursesFetched] = useState(false);
  const dispatch = useDispatch();
  const { teachers: teacherMap, status: teacherMapStatus } = useSelector((state: RootState) => state.userMap);
  const teachersList = useMemo(() => {
    const list = [...Object.values(teacherMap)];
    if (profile && profile.docId) {
      const index = list.findIndex(t => t.id === profile.docId);
      const profileTeacher = {
        id: profile.docId,
        teacherId: profile.teacherId || '',
        name: `${profile.title || ''}${profile.firstName || ''} ${profile.lastName || ''}`.trim(),
        subjectGroup: profile.learningArea || profile.subjectGroup || ''
      };
      if (index >= 0) {
        list[index] = { ...list[index], ...profileTeacher };
      } else {
        list.push(profileTeacher as any);
      }
    }
    return getActiveSortedTeachers(list);
  }, [teacherMap, profile]);
  const [substitutions, setSubstitutions] = useState<Substitution[]>([]);
  // substitution doc id -> whether the substitute teacher actually checked attendance for it
  // (a ClassroomAttendance record with matching substitutionId exists). Used to derive the
  // "ปฏิบัติหน้าที่สำเร็จ" / "ไม่ได้สอน (ลา/ขาด)" stats and per-row status.
  const [substitutionCompletionMap, setSubstitutionCompletionMap] = useState<Record<string, boolean>>({});
  // true if the Firestore query that checks completion (below) errored out — most likely a
  // missing composite index for the collectionGroup('ClassroomAttendance') query on
  // (schoolId ==, substitutionId in). When this happens we must NOT report "ไม่ได้สอน (ลา/ขาด)"
  // for every substitution, since that would falsely accuse a teacher who actually did check in.
  const [substitutionCompletionCheckFailed, setSubstitutionCompletionCheckFailed] = useState(false);
  const { isDarkMode, toggleTheme } = useTheme(); // เก็บ toggleTheme ไว้ใช้กับปุ่ม
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 12;
  const [substitutionsCurrentPage, setSubstitutionsCurrentPage] = useState(1);
  const [substitutionsItemsPerPage, setSubstitutionsItemsPerPage] = useState(10);
  const [expandedTeacherCourses, setExpandedTeacherCourses] = useState<string[]>([]);

  const [schedule, setSchedule] = useState<Record<string, any>>({});
  const [scheduleSpecialPeriods, setScheduleSpecialPeriods] = useState<any[]>([]);
  const [schedulePeriodSettings, setSchedulePeriodSettings] = useState<any[]>(DEFAULT_PERIODS);
  const [scheduleRoomsMap, setScheduleRoomsMap] = useState<Record<string, string>>({});
  const [scheduleCoursesMap, setScheduleCoursesMap] = useState<Record<string, any>>({});
  const [scheduleClubs, setScheduleClubs] = useState<any[]>([]);
  const [isScheduleLoading, setIsScheduleLoading] = useState(false);
  const [scheduleAcademicYear, setScheduleAcademicYear] = useState('');
  const [scheduleCurrentTerm, setScheduleCurrentTerm] = useState('1');

  const toggleTeacherExpand = (courseId: string) => {
    setExpandedTeacherCourses(prev =>
      prev.includes(courseId) ? prev.filter(id => id !== courseId) : [...prev, courseId]
    );
  };

  const [teachingSemester, setTeachingSemester] = useState<string>("ทั้งหมด");
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('list');

  const filteredTeachingCourses = useMemo(() => {
    if (teachingSemester === "ทั้งหมด") return courses;
    return courses.filter(c => c.semester === teachingSemester || c.semester === Number(teachingSemester).toString());
  }, [courses, teachingSemester]);
  const academicYear = useSelector((state: RootState) => state.calendar.academicYear);
  const [attendanceRecords, setAttendanceRecords] = useState<any[]>([]);
  const [attendanceFetched, setAttendanceFetched] = useState(false);
  // สถิติสรุปที่การ์ด/กราฟวงกลม/แท่งด้านบนใช้แสดง — ดึงจากเอกสารสรุปยอด Yearsummary เอกสารเดียวกับที่
  // ใช้คำนวณตัวเลขที่ส่งแจ้งเตือนทาง LINE (ดู sendTeacherLineNotification ใน CheckinOutPage/index.tsx)
  // เพื่อให้ตัวเลขตรงกันเป๊ะ ไม่ใช่นับสดจาก attendanceRecords ซึ่งมีคนละช่วงเวลา/คนละการจัดกลุ่มสถานะ
  // (เช่น "กลับก่อน" ถูกนับรวมเป็น "มาปกติ" ในเอกสารสรุปยอด — ดู getPeriodStatusMapping ใน periodSummaryUtils.ts)
  const [yearSummaryStats, setYearSummaryStats] = useState<{
    present: number; late: number; leave: number; absent: number; noCheckout: number; officialTravel: number;
  } | null>(null);
  const [yearSummaryFetched, setYearSummaryFetched] = useState(false);
  const [trendMonthFilter, setTrendMonthFilter] = useState<string>('all');
  const [selectedStatus, setSelectedStatus] = useState<string | null>(null);
  const [isAttendanceLoading, setIsAttendanceLoading] = useState(false);
  const [attendanceCurrentPage, setAttendanceCurrentPage] = useState(1);
  const [attendanceItemsPerPage, setAttendanceItemsPerPage] = useState(10);
  const [officialTravelRequests, setOfficialTravelRequests] = useState<any[]>([]);
  const [schoolInfo, setSchoolInfo] = useState<{ schoolName: string; directorName: string; deputyName: string; personnelHeadName: string; personnelHeadRoleLabel: string; affiliation: string }>({
    schoolName: "",
    directorName: "",
    deputyName: "",
    personnelHeadName: "",
    personnelHeadRoleLabel: "",
    affiliation: ""
  });

  // State for Course Edit Modal
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [isViewModalOpen, setIsViewModalOpen] = useState(false);
  const [editingCourse, setEditingCourse] = useState<CourseData | null>(null);
  const [periodSettings, setPeriodSettings] = useState<any[]>([]);
  const [availableClassOptions, setAvailableClassOptions] = useState<[string, string][]>([]);
  const [remediationEnabled, setRemediationEnabled] = useState<boolean>(true);

  // ── Grade Flags (0/ร/มส/มผ) inline data ──
  const [gradeFlags, setGradeFlags] = useState<StudentFlagRow | null>(null);
  const [gradeFlagsLoading, setGradeFlagsLoading] = useState(false);
  const [gradeFlagsError, setGradeFlagsError] = useState<string | null>(null);
  const [gradeFlagsWindowConfig, setGradeFlagsWindowConfig] = useState<RemediationWindowConfig | null>(null);
  const [gradeFlagsRequests, setGradeFlagsRequests] = useState<Record<string, { id: string; status: string; newResult?: string }>>({});
  const [gradeFlagsFetched, setGradeFlagsFetched] = useState(false);

  // ✅ ดึง periodSettings และ availableClassOptions จาก Redux (แทนการ fetch ซ้ำ)
  const reduxPeriodSettings = useSelector((state: RootState) => state.periodSettings);
  const reduxSchoolSettings = useSelector((state: RootState) => state.schoolSettings);

  useEffect(() => {
    if (reduxPeriodSettings.status === 'succeeded') {
      const teaching = reduxPeriodSettings.periods.filter((p: any) => p.isTeaching || p.isTeachingPeriod);
      setPeriodSettings(teaching.length > 0 ? teaching : reduxPeriodSettings.periods);
    }
  }, [reduxPeriodSettings.status, reduxPeriodSettings.periods]);

  useEffect(() => {
    if (reduxSchoolSettings.status === 'succeeded' && reduxSchoolSettings.availableClassOptions.length > 0) {
      setAvailableClassOptions(reduxSchoolSettings.availableClassOptions);
    }
  }, [reduxSchoolSettings.status, reduxSchoolSettings.availableClassOptions]);

  const calendarState = useSelector((state: RootState) => state.calendar);
  const reduxTerms = calendarState.terms;

  useEffect(() => {
    if (profile?.schoolId) {
      dispatch(fetchCalendar(profile.schoolId) as any);
    }
  }, [profile?.schoolId, dispatch]);

  useEffect(() => {
    if (!profile?.schoolId) return;
    const unsub = onSnapshot(doc(firestore, 'school-settings', profile.schoolId, 'configs', 'remediation_settings'), (snap) => {
      if (snap.exists()) {
        const data = snap.data();
        setRemediationEnabled(data.enabled !== false);
      } else {
        setRemediationEnabled(true);
      }
    });
    return () => unsub();
  }, [profile?.schoolId]);

  useEffect(() => {
    if (!remediationEnabled && activeTab === 'grade_flags') {
      setActiveTab('general');
    }
  }, [remediationEnabled, activeTab]);

  // ── Fetch grade flags data when profile is ready ──
  // ต้องรอ teacherMap โหลดเสร็จ (สำเร็จหรือพัง ก็ถือว่า "เสร็จ") ก่อนเรียก fetchFlaggedStudents เสมอ
  // เพราะ fetchGradeFlags ผูก gradeFlagsFetched ไว้ไม่ให้รันซ้ำ — ถ้ายิงตอน teacherMap ยัง idle/loading
  // (เช่น dispatch(fetchTeachersMap) ใน useEffect ข้างล่างยังไม่ resolve) ชื่อครูจะกลายเป็น "-" ค้างตลอด
  // ไปโดยไม่มีทางรีเฟรชใหม่อีกเลยนอกจากโหลดหน้าใหม่ทั้งหมด (เจอเป็นบั๊กจริงจาก race condition นี้)
  useEffect(() => {
    if (!profile?.schoolId || !profile?.docId || userRole !== 'student' || gradeFlagsFetched) return;
    if (teacherMapStatus === 'idle' || teacherMapStatus === 'loading') return;
    const fetchGradeFlags = async () => {
      setGradeFlagsLoading(true);
      setGradeFlagsError(null);
      try {
        const schoolId = profile.schoolId;
        const sid = profile.docId;

        const [rows, configSnap, requestSnap] = await Promise.all([
          fetchFlaggedStudents(schoolId, teacherMap, { studentIds: [sid] }),
          getDoc(doc(firestore, 'school-settings', schoolId, 'configs', 'remediation_settings')),
          getDocs(query(collection(firestore, 'school-settings', schoolId, 'remediation_requests'), where('studentId', '==', sid))),
        ]);

        setGradeFlags(rows[0] || null);
        setGradeFlagsWindowConfig(configSnap.exists() ? (configSnap.data() as RemediationWindowConfig) : null);

        const map: Record<string, { id: string; status: string; newResult?: string }> = {};
        requestSnap.docs.forEach(d => {
          const data: any = d.data();
          if (data.status === 'cancelled') return;
          const key = `${data.flagType}|${data.courseId || data.activityId}|${data.academicYear}|${data.semester}`;
          if (!map[key] || data.status === 'resolved') {
            map[key] = { id: d.id, status: data.status, newResult: data.newResult };
          }
        });
        setGradeFlagsRequests(map);
        setGradeFlagsFetched(true);
      } catch (err) {
        console.error('Error fetching grade flags:', err);
        setGradeFlagsError('เกิดข้อผิดพลาดในการโหลดข้อมูลผลการเรียน');
      } finally {
        setGradeFlagsLoading(false);
      }
    };
    fetchGradeFlags();
  }, [profile?.schoolId, profile?.docId, userRole, gradeFlagsFetched, teacherMapStatus]);

  useEffect(() => {
    let isMounted = true;
    let unsubscribeProfile: (() => void) | null = null;

    const fetchProfile = async () => {
      if (!currentUser?.uid) {
        setIsFetching(false);
        return;
      }

      try {
        setIsFetching(true);
        setProfile(null);
        setUserRole(null);

        const currentUserType = localStorage.getItem('currentUserType');
        let schoolId = "";
        let studentDocId = "";

        if (currentUserType === 'student') {
          try {
            const studentSessionRaw = localStorage.getItem('studentSession');
            if (studentSessionRaw) {
              const session = JSON.parse(studentSessionRaw);
              schoolId = session.schoolId || "";
              studentDocId = session.studentId || "";
            }
          } catch (_) {}
        } else if (currentUserType === 'parent') {
          try {
            const parentSessionRaw = localStorage.getItem('parentSession');
            if (parentSessionRaw) {
              const session = JSON.parse(parentSessionRaw);
              if (session && session.children && session.children.length > 0) {
                schoolId = session.children[0].schoolId || "";
                studentDocId = session.children[0].studentDocId || "";
              }
            }
          } catch (_) {}
        }

        let userDocSnap = null;
        let userData: any = {};

        if (!currentUserType && currentUser) {
          try {
            userDocSnap = await getDoc(doc(firestore, "users", currentUser.uid));
            userData = userDocSnap.exists() ? userDocSnap.data() : {};
          } catch (err) {
            console.warn("Could not fetch user doc:", err);
          }
        }

        if (!schoolId) {
          schoolId = String((currentUser as any)?.schoolId || userData.schoolId || "").trim();
        }

        if (!schoolId) {
          if (isMounted) toast.error("ไม่พบรหัสโรงเรียนของบัญชีผู้ใช้");
          return;
        }

        const subscribeProfileDoc = (profileDoc: any, role: 'teacher' | 'student' | 'user') => {
          unsubscribeProfile?.();
          unsubscribeProfile = onSnapshot(profileDoc.ref, (docSnap: DocumentSnapshot) => {
            if (!docSnap.exists() || !isMounted) return;
            setProfile({
              ...(docSnap.data() as any),
              schoolId,
              docId: docSnap.id,
            });
            setUserRole(role);
          });
        };

        if (currentUserType === 'student' || currentUserType === 'parent') {
          if (studentDocId) {
            const studentDocRef = doc(firestore, "school-settings", schoolId, "students", studentDocId);
            const studentDocSnap = await getDoc(studentDocRef);
            if (studentDocSnap.exists() && isMounted) {
              subscribeProfileDoc(studentDocSnap, (currentUserType === 'student' || currentUserType === 'parent') ? 'student' : 'user');
            } else if (isMounted) {
              toast.error("ไม่พบข้อมูลนักเรียน");
            }
          } else if (isMounted) {
            toast.error("ไม่พบข้อมูลนักเรียนในเซสชัน");
          }
        } else {
          const findProfileDoc = async (collectionName: "teachers" | "students") => {
            const baseRef = collection(firestore, "school-settings", schoolId, collectionName);

            const directSnap = await getDoc(doc(firestore, "school-settings", schoolId, collectionName, currentUser.uid));
            if (directSnap.exists()) return directSnap;

            const byUidSnap = await getDocs(query(baseRef, where("uid", "==", currentUser.uid), limit(1)));
            if (!byUidSnap.empty) return byUidSnap.docs[0];

            if (currentUser.email) {
              const byEmailSnap = await getDocs(query(baseRef, where("email", "==", currentUser.email), limit(1)));
              if (!byEmailSnap.empty) return byEmailSnap.docs[0];
            }

            const lookupId = collectionName === "teachers"
              ? userData.teacherId
              : userData.studentId;
            if (lookupId) {
              const idField = collectionName === "teachers" ? "teacherId" : "studentId";
              const byCodeSnap = await getDocs(query(baseRef, where(idField, "==", lookupId), limit(1)));
              if (!byCodeSnap.empty) return byCodeSnap.docs[0];
            }

            return null;
          };

          const teacherDoc = await findProfileDoc("teachers");
          if (teacherDoc && isMounted) {
            subscribeProfileDoc(teacherDoc, 'teacher');
          } else if (isMounted) {
            const studentDoc = await findProfileDoc("students");
            if (studentDoc && isMounted) {
              subscribeProfileDoc(studentDoc, 'student');
            } else if (userDocSnap && userDocSnap.exists()) {
              const rawRoles = Array.isArray(userData.role) ? userData.role : (userData.role ? [userData.role] : []);
              const normalizedRoles = rawRoles.map((role: string) => String(role).toLowerCase());
              const fallbackPosition = userData.position
                || (normalizedRoles.includes('super_admin')
                  ? 'ผู้ดูแลระบบสูงสุด'
                  : normalizedRoles.includes('school_admin')
                    ? 'ผู้ดูแลระบบโรงเรียน'
                    : normalizedRoles.includes('academic_admin')
                      ? 'ผู้ดูแลระบบงานวิชาการ'
                      : normalizedRoles.includes('student_affairs')
                        ? 'เจ้าหน้าที่งานกิจการนักเรียน'
                        : normalizedRoles.includes('general_user')
                          ? 'ผู้ใช้ทั่วไป'
                          : 'บุคลากร');

              setProfile({
                ...(userData as any),
                title: userData.title || '',
                firstName: userData.firstName || '',
                lastName: userData.lastName || '',
                email: userData.email || currentUser.email || '',
                profileImageUrl: userData.profileImageUrl || userData.profileUrl || '',
                schoolId,
                docId: currentUser.uid,
                teacherId: userData.teacherId || '',
                department: userData.department || 'งานบริหารทั่วไป',
                contact: userData.contact || '',
                address: userData.address || '',
                position: fallbackPosition,
                personnelType: userData.personnelType || 'user',
                createdAt: userData.createdAt,
                updatedAt: userData.updatedAt,
              });
              setUserRole('user');
            }
          }
        }
      } catch (error) {
        console.error(error);
        if (isMounted) toast.error("โหลดข้อมูลไม่สำเร็จ");
      } finally {
        if (isMounted) setIsFetching(false);
      }
    };

    fetchProfile();

    return () => {
      isMounted = false;
      unsubscribeProfile?.();
    };
  }, [currentUser?.uid, currentUser?.email, (currentUser as any)?.schoolId]);

  // เดิม skip การโหลด teacherMap ตอนเป็นนักเรียน/ผู้ปกครอง ทำให้ทุกจุดที่ต้องใช้ teacherMap
  // (เช่น ชื่อครูผู้สอนในแท็บ "ผลการเรียน 0/ร/มส/มผ" ผ่าน fetchFlaggedStudents) หาชื่อไม่เจอเสมอ
  // ทั้งที่ข้อมูลมอบหมายครูถูกต้อง — teachers/{teacherId} เปิด read ให้ทุกคนอยู่แล้ว (firestore.rules)
  // จึงไม่มีเหตุผลด้านสิทธิ์ที่ต้องกันนักเรียน/ผู้ปกครองออกจากการโหลดนี้
  useEffect(() => {
    if (profile?.schoolId) {
      dispatch(fetchTeachersMap(profile.schoolId) as any);
    }
  }, [profile?.schoolId, dispatch]);

  // Reset courses fetch status when academicYear changes so it re-fetches with correct year data
  useEffect(() => {
    setCoursesFetched(false);
  }, [academicYear]);

  useEffect(() => {
    if (profile?.schoolId && profile?.docId && activeTab === "teaching" && !coursesFetched) {
      const fetchCourses = async () => {
        try {
          const coursesRef = collection(firestore, "school-settings", profile.schoolId, "courses");
          const assignmentsRef = collection(firestore, "school-settings", profile.schoolId, "course_assignments");
          const roomsRef = collection(firestore, "school-settings", profile.schoolId, "physical-rooms");

          // Query course assignments for this academic year (if set)
          let assignmentsQuery = query(assignmentsRef);
          if (academicYear) {
            assignmentsQuery = query(assignmentsRef, where("academicYear", "==", academicYear));
          }

          // Fetch all courses, assignments, and physical rooms in parallel
          const [coursesSnap, assignmentsSnap, roomsSnap] = await Promise.all([
            getDocs(query(coursesRef)),
            getDocs(assignmentsQuery),
            getDocs(query(roomsRef))
          ]);

          const assignmentsData = assignmentsSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
          const roomsData = roomsSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
          setRooms(roomsData);

          const coursesData = coursesSnap.docs
            .map(doc => {
              const data = doc.data();
              // Find the assignment for this course and semester
              const courseAssignmentsForSemester = assignmentsData.filter(
                (a: any) => a.courseId === doc.id && String(a.semester) === String(data.semester)
              );
              
              // Merge teacher assignments
              const teacherAssignments = courseAssignmentsForSemester.flatMap((a: any) => a.teacherAssignments || []);
              
              return { 
                id: doc.id, 
                ...data, 
                gradeLevel: data.gradeLevel || data.classId,
                teacherAssignments: teacherAssignments.length > 0 ? teacherAssignments : (data.teacherAssignments || [])
              } as CourseData;
            })
            .filter(course => {
              // 1. Must be assigned to this teacher (either via new course assignment, main teacher, teacherIds or legacy)
              const isAssigned = course.teacherAssignments?.some(a => a.teacherId === profile.docId) || 
                                 course.teacherId === profile.docId || 
                                 course.teacherIds?.includes(profile.docId);
              return isAssigned;
            });

          setCourses(coursesData);
        } catch (err) {
          console.error("Error fetching courses:", err);
        } finally {
          setCoursesFetched(true);
        }
      };
      fetchCourses();
    }
  }, [profile, activeTab, coursesFetched, academicYear]);

  useEffect(() => {
    if (activeTab === 'substitution' && profile?.schoolId && profile?.docId) {
      const fetchSubstitutions = async () => {
        try {
          const subRef = collection(firestore, "school-settings", profile.schoolId, "substitutions");
          // แก้ไข: ลบ orderBy ออกเพื่อป้องกันปัญหา Missing Index และเรียงลำดับใน Client แทน
          const q = query(subRef, where("substituteTeacherId", "==", profile.docId));
          const querySnapshot = await getDocs(q);
          const subs = querySnapshot.docs.map(doc => ({
            id: doc.id,
            ...doc.data()
          })) as Substitution[];

          // เรียงลำดับข้อมูลตามวันที่ล่าสุด (Client-side sorting) อย่างปลอดภัย
          subs.sort((a, b) => {
            const dateA = a.date?.seconds || 0;
            const dateB = b.date?.seconds || 0;
            return dateB - dateA;
          });
          setSubstitutions(subs);
        } catch (err) {
          console.error("Error fetching substitutions:", err);
        }
      };
      fetchSubstitutions();
    }
  }, [activeTab, profile]);

  // A substitution has no "status" field of its own (cancelled assignments are deleted
  // outright — see SubstituteManagementPage.tsx's handleAssignSubstitute), so whether the
  // substitute teacher actually taught it can only be determined by checking whether a
  // ClassroomAttendance record was ever saved for it. The live check-in page tags every
  // attendance record it writes for a substitute session with `substitutionId` set to the
  // substitution doc's own id (ClassroomAttendance/index.tsx's save payload), so a matching
  // record's existence is a reliable "did they actually check in and teach" signal.
  useEffect(() => {
    if (activeTab !== 'substitution' || !profile?.schoolId || substitutions.length === 0) {
      if (substitutions.length === 0) {
        setSubstitutionCompletionMap({});
        setSubstitutionCompletionCheckFailed(false);
      }
      return;
    }

    const toDateObj = (value: Substitution['date']): Date | null => {
      if (!value) return null;
      if ((value as any).toDate) return (value as any).toDate();
      if ((value as any).seconds) return new Date((value as any).seconds * 1000);
      return new Date(value as any);
    };

    const fetchCompletionStatus = async () => {
      setSubstitutionCompletionCheckFailed(false);
      const now = new Date();
      const pastSubIds = substitutions
        .filter(s => {
          const d = toDateObj(s.date);
          return d ? d <= now : false;
        })
        .map(s => s.id);

      if (pastSubIds.length === 0) {
        setSubstitutionCompletionMap({});
        return;
      }

      const attendanceRef = collectionGroup(firestore, 'ClassroomAttendance');
      const completedIds = new Set<string>();
      const CHUNK_SIZE = 10; // Firestore 'in' query limit safety margin
      let anyChunkFailed = false;

      // Run each chunk's query independently — a missing composite index (or any other
      // per-query error) throws on that ONE query, and a single try/catch around the whole
      // loop would otherwise abandon every remaining chunk too, wiping out completion data
      // for substitutions that had nothing to do with the failing chunk.
      for (let i = 0; i < pastSubIds.length; i += CHUNK_SIZE) {
        const chunk = pastSubIds.slice(i, i + CHUNK_SIZE);
        try {
          const q = query(
            attendanceRef,
            where('schoolId', '==', profile.schoolId),
            where('substitutionId', 'in', chunk)
          );
          const snap = await getDocs(q);
          snap.forEach(docSnap => {
            const subId = docSnap.data().substitutionId;
            if (subId) completedIds.add(subId);
          });
        } catch (err) {
          console.error("Error fetching substitution completion status (chunk):", err);
          anyChunkFailed = true;
        }
      }

      const map: Record<string, boolean> = {};
      completedIds.forEach(id => { map[id] = true; });
      setSubstitutionCompletionMap(map);
      setSubstitutionCompletionCheckFailed(anyChunkFailed);
    };
    fetchCompletionStatus();
  }, [activeTab, profile?.schoolId, substitutions]);

  // 'upcoming' = date hasn't happened yet; 'completed' = an attendance record exists for it;
  // 'missed' = the date has passed with no matching attendance record (teacher never checked
  // in — most likely on leave/absent that day); 'unknown' = the completion-check query itself
  // failed (e.g. a missing Firestore index), so we genuinely don't know — must NOT be shown or
  // counted as "ไม่ได้สอน (ลา/ขาด)" since that would falsely accuse a teacher who did check in.
  const getSubstitutionStatus = (sub: Substitution): 'upcoming' | 'completed' | 'missed' | 'unknown' => {
    const d = sub.date?.toDate ? sub.date.toDate() : ((sub.date as any)?.seconds ? new Date((sub.date as any).seconds * 1000) : (sub.date ? new Date(sub.date as any) : null));
    if (!d || d > new Date()) return 'upcoming';
    if (substitutionCompletionMap[sub.id]) return 'completed';
    return substitutionCompletionCheckFailed ? 'unknown' : 'missed';
  };

  useEffect(() => {
    if (profile?.schoolId) {
      const fetchSchoolInfo = async () => {
        try {
          const schoolRef = doc(firestore, "school-settings", profile.schoolId);
          const schoolSnap = await getDoc(schoolRef);
          if (schoolSnap.exists()) {
            const sData = schoolSnap.data();
            const personnelPersonnel = getGroupPersonnel(sData, 'personnel');
            setSchoolInfo({
              schoolName: sData.schoolName || "",
              directorName: sData.directorName || "",
              deputyName: (sData.deputyPrefix || "") + (sData.deputyName || ""),
              personnelHeadName: personnelPersonnel.name,
              personnelHeadRoleLabel: personnelPersonnel.label,
              affiliation: sData.affiliation || ""
            });
            // Logic handled by calendarSlice
          }
        } catch (err) {
          console.error("Error fetching school info:", err);
        }
      };
      fetchSchoolInfo();
    }
  }, [profile?.schoolId]);

  useEffect(() => {
    if (activeTab === 'attendance' && profile?.schoolId && profile?.docId && academicYear) {
      const fetchAttendance = async () => {
        setIsAttendanceLoading(true);
        try {
          let startDate = "";
          let endDate = "";

          if (calendarState.status === 'succeeded' && reduxTerms.length > 0) {
            const term1 = reduxTerms.find(t => t.id === 'term1' || t.name.includes('1'));
            const term2 = reduxTerms.find(t => t.id === 'term2' || t.name.includes('2'));
            startDate = term1?.startDate || "";
            endDate = term2?.endDate || term1?.endDate || "";
          } else {
            // Fallback to manual fetch only if Redux not ready (should rarely happen with fetchCalendar above)
            const defaultDocRef = doc(firestore, "school-settings", profile.schoolId, "main_calendar", "default");
            const yearSnap = await getDoc(defaultDocRef);
            if (yearSnap.exists()) {
              const data = yearSnap.data();
              startDate = data.terms?.term1?.startDate || "";
              endDate = data.terms?.term2?.endDate || data.terms?.term1?.endDate || "";
            }
          }

          const collectionName = userRole === 'student' ? 'students' : 'teachers';
          const attRef = collection(firestore, "school-settings", profile.schoolId, collectionName, profile.docId, "attendance");
          let q;
          if (startDate && endDate) {
            q = query(attRef, where(documentId(), ">=", startDate), where(documentId(), "<=", endDate));
          } else {
            q = query(attRef);
          }

          const querySnapshot = await getDocs(q);
          const records = querySnapshot.docs.map(doc => {
            const data = doc.data();
            return {
              id: doc.id,
              date: doc.id,
              ...data
            } as any;
          });

          // Fetch leave requests to map leaveType
          const leaveRef = collection(firestore, "school-settings", profile.schoolId, collectionName, profile.docId, "leave_summary");
          const idField = userRole === 'student' ? 'studentId' : 'teacherId';
          const leaveQ = query(leaveRef, where(idField, "==", profile.docId));
          const leaveSnapshot = await getDocs(leaveQ);
          const leaveRequests = leaveSnapshot.docs.map(doc => doc.data());

          const mergedRecords = records.map(record => {
            if (['ลา', 'Leave', 'ล'].includes(record.status)) {
              const recDate = new Date(record.date);
              recDate.setHours(0, 0, 0, 0);

              const match = leaveRequests.find(req => {
                let start = req.startDate;
                let end = req.endDate;

                if (start?.seconds) start = new Date(start.seconds * 1000);
                else if (typeof start === 'string') start = new Date(start);

                if (end?.seconds) end = new Date(end.seconds * 1000);
                else if (typeof end === 'string') end = new Date(end);

                if (start instanceof Date) start.setHours(0, 0, 0, 0);
                if (end instanceof Date) end.setHours(0, 0, 0, 0);

                return start && end && recDate >= start && recDate <= end;
              });

              if (match?.leaveType) {
                return { ...record, leaveType: match.leaveType };
              }
            }
            return record;
          });

          mergedRecords.sort((a, b) => b.date.localeCompare(a.date));
          setAttendanceRecords(mergedRecords);
        } catch (err) {
          console.error("Error fetching attendance records:", err);
        } finally {
          setIsAttendanceLoading(false);
          setAttendanceFetched(true);
        }
      };
      fetchAttendance();
    }
  }, [activeTab, profile, academicYear, userRole]);

  useEffect(() => {
    if (activeTab === 'attendance' && profile?.schoolId && profile?.docId && academicYear) {
      const fetchYearSummary = async () => {
        try {
          const collectionName = userRole === 'student' ? 'students' : 'teachers';
          const summaryRef = doc(firestore, "school-settings", profile.schoolId, collectionName, profile.docId, "Yearsummary", String(academicYear));
          const summarySnap = await getDoc(summaryRef);
          if (summarySnap.exists()) {
            const data = summarySnap.data();
            setYearSummaryStats({
              present: data.present || 0,
              late: data.late || 0,
              leave: data.leave || 0,
              absent: data.absent || 0,
              noCheckout: data.noCheckout || 0,
              officialTravel: data.officialTravel || 0,
            });
          } else {
            setYearSummaryStats({ present: 0, late: 0, leave: 0, absent: 0, noCheckout: 0, officialTravel: 0 });
          }
        } catch (err) {
          console.error("Error fetching year summary:", err);
        } finally {
          setYearSummaryFetched(true);
        }
      };
      fetchYearSummary();
    }
  }, [activeTab, profile, academicYear, userRole]);

  useEffect(() => {
    if (activeTab === 'official_travel' && profile?.schoolId && profile?.docId) {
      const fetchTravelRequests = async () => {
        try {
          const collectionName = userRole === 'student' ? 'students' : 'teachers';
          const reqRef = collection(firestore, "school-settings", profile.schoolId, collectionName, profile.docId, "travel_summary");
          const q = query(reqRef, orderBy("createdAt", "desc"));
          const snapshot = await getDocs(q);
          const requests = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
          setOfficialTravelRequests(requests);
        } catch (err) {
          console.error("Error fetching travel requests:", err);
        }
      };
      fetchTravelRequests();
    }
  }, [activeTab, profile, userRole]);

  useEffect(() => {
    if (activeTab === 'schedule' && profile?.schoolId && profile?.docId) {
      const fetchScheduleData = async () => {
        setIsScheduleLoading(true);
        try {
          const schoolId = profile.schoolId;
          const teacherId = profile.docId;

          // Determine Year & Term
          let acadYear = academicYear || "";
          let currTerm = "1";
          
          if (calendarState.status === 'succeeded' && calendarState.academicYear) {
            acadYear = calendarState.academicYear;
            const terms = calendarState.terms;
            if (terms && terms.length > 0) {
              const today = new Date().toISOString().split('T')[0];
              const found = terms.find((t: any) => today >= t.startDate && today <= t.endDate);
              if (found) {
                currTerm = found.name.includes('2') ? '2' : '1';
              }
            }
          }
          setScheduleAcademicYear(acadYear);
          setScheduleCurrentTerm(currTerm);

          // 1. Fetch configurations
          const configRef = doc(firestore, 'school-settings', schoolId, 'configs', 'schedule_settings');
          const configSnap = await getDoc(configRef);
          let periods = DEFAULT_PERIODS;
          if (configSnap.exists() && configSnap.data().periods) {
            periods = normalizePeriodSettings(configSnap.data().periods);
          }
          setSchedulePeriodSettings(normalizePeriodSettings(periods));

          // 2. Fetch special periods
          const spCollectionRef = collection(firestore, 'school-settings', schoolId, 'special-periods');
          const spSnap = await getDocs(spCollectionRef);
          const spList = spSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
          setScheduleSpecialPeriods(spList);

          // 3. Fetch rooms map
          const roomsCollectionRef = collection(firestore, 'school-settings', schoolId, 'physical-rooms');
          const roomsSnap = await getDocs(roomsCollectionRef);
          const roomsMap: Record<string, string> = {};
          roomsSnap.forEach(d => {
            const rData = d.data();
            roomsMap[d.id] = rData.roomCode || rData.roomName || d.id;
          });
          setScheduleRoomsMap(roomsMap);

          // 4. Fetch courses map
          const coursesCollectionRef = collection(firestore, 'school-settings', schoolId, 'courses');
          const coursesSnap = await getDocs(coursesCollectionRef);
          const coursesMap: Record<string, any> = {};
          coursesSnap.forEach(d => {
            coursesMap[d.id] = { id: d.id, ...d.data() };
          });
          setScheduleCoursesMap(coursesMap);

          // 5. Fetch clubs
          const clubsCollectionRef = collection(firestore, 'school-settings', schoolId, 'clubs');
          const clubsSnap = await getDocs(clubsCollectionRef);
          const clubsList = clubsSnap.docs.map(d => ({ id: d.id, ...d.data() }));
          setScheduleClubs(clubsList);

          // 6. Fetch course assignments
          const assignmentsQuery = query(
            collection(firestore, 'school-settings', schoolId, 'course_assignments'),
            where('academicYear', '==', acadYear),
            where('semester', '==', currTerm)
          );
          const assignmentsSnap = await getDocs(assignmentsQuery);
          const assignmentsMap: Record<string, any> = {};
          assignmentsSnap.forEach(d => {
            const data = d.data();
            if (data.courseId) {
              assignmentsMap[data.courseId] = data;
            }
          });

          // Helpers
          const formatClassNamesLocal = (classIds: any, groupNum?: number, roomNum?: string | number): string => {
            const ids = Array.isArray(classIds) ? classIds : [classIds].filter(Boolean);
            const roomSuffix = roomNum ? `/${roomNum}` : '';
            return ids.map(c => {
              const baseName = CLASSES[c as keyof typeof CLASSES] || c;
              return `${baseName}${roomSuffix}`;
            }).join(', ');
          };

          const findAssignmentLocal = (course: any, tId: string, groupNum: number) => {
            const semesterAssignment = assignmentsMap[course.id]?.teacherAssignments || [];
            const courseAssignment = coursesMap[course.id]?.teacherAssignments || [];
            return [...semesterAssignment, ...courseAssignment].find((a: any) =>
              assignmentIncludesTeacher(a, tId) && Number(a.groupNumber || 1) === Number(groupNum)
            );
          };

          // 7. Fetch schedule entries for the current teacher
          const scheduleQuery = query(
            collection(firestore, 'school-settings', schoolId, 'schedules'),
            where('teacherId', '==', teacherId)
          );
          const scheduleSnap = await getDocs(scheduleQuery);
          const merged: Record<string, any> = {};

          scheduleSnap.forEach(d => {
            const data = d.data();
            if (!matchesScheduleYearTerm(data, acadYear, currTerm)) return;

            const sch = data.schedule || {};
            Object.entries(sch).forEach(([slot, courseData]) => {
              if (courseData) {
                const coursesArray = Array.isArray(courseData) ? courseData : [courseData];
                coursesArray.forEach((course: any) => {
                  if (!course) return;

                  const groupNum = course.groupNumber || 1;
                  const assignment = findAssignmentLocal(course, teacherId, groupNum);
                  const courseWithGroup = { ...course, groupNumber: groupNum };

                  const roomIds = assignment?.roomIds || course.room || [];
                  let roomDisplay = roomIds.length > 0 && !roomIds.includes('all')
                    ? roomIds.map((id: string) => roomsMap[id] || id).join(', ')
                    : '';

                  if (!roomDisplay && groupNum) {
                    roomDisplay = String(groupNum);
                  }

                  const displayClassName = assignment?.classLevels?.length
                    ? formatClassNamesLocal(assignment.classLevels, groupNum, assignment.room)
                    : formatClassNamesLocal(data.classId, groupNum, course.room);

                  if (merged[slot] && merged[slot].course.id === course.id && merged[slot].course.groupNumber === groupNum) {
                    const existingClass = merged[slot].className;
                    if (!existingClass.includes(displayClassName)) {
                      merged[slot].className = `${existingClass}, ${displayClassName}`;
                    }
                  } else {
                    merged[slot] = { course: courseWithGroup, className: displayClassName, roomDisplay };
                  }
                });
              }
            });
          });

          setSchedule(merged);
        } catch (err) {
          console.error("Error fetching teacher own schedule:", err);
          toast.error("ไม่สามารถดึงข้อมูลตารางสอนได้");
        } finally {
          setIsScheduleLoading(false);
        }
      };

      fetchScheduleData();
    }
  }, [activeTab, profile, academicYear, calendarState]);

  // 4. สร้างฟังก์ชันสำหรับนำทางไปหน้าแก้ไข Profile
  const handleEdit = () => {
    if (profile?.schoolId && profile?.docId) {
      const path = userRole === 'student'
        ? `/school/${profile.schoolId}/students/edit/${profile.docId}`
        : `/school/${profile.schoolId}/teachers/edit/${profile.docId}`;
      navigate(path);
    } else {
      toast.error("ไม่สามารถระบุข้อมูลสำหรับหน้าแก้ไขได้ โปรดลองอีกครั้ง");
    }
  };

  // Course Edit Handlers
  const handleEditCourseClick = (course: CourseData) => {
    setEditingCourse(course);
    setIsEditModalOpen(true);
  };

  const handleViewCourseClick = (course: CourseData) => {
    setEditingCourse(course);
    setIsViewModalOpen(true);
  };

  const handleSaveCourse = async (updatedCourseResult: any) => {
    if (!profile?.schoolId || !editingCourse?.id) return;

    try {
      const courseRef = doc(firestore, 'school-settings', profile.schoolId, 'courses', editingCourse.id);

      // Remove ID from data to be updated
      const { id, ...dataToUpdate } = updatedCourseResult;

      await updateDoc(courseRef, dataToUpdate);

      // Update local state
      setCourses(prev => prev.map(c => c.id === editingCourse.id ? { ...c, ...dataToUpdate } : c));

      setIsEditModalOpen(false);
      setEditingCourse(null);

      Swal.fire({
        icon: 'success',
        title: 'บันทึกสำเร็จ',
        text: 'แก้ไขข้อมูลรายวิชาเรียบร้อยแล้ว',
        timer: 1500,
        showConfirmButton: false
      });

    } catch (error) {
      console.error("Error updating course:", error);
      Swal.fire('เกิดข้อผิดพลาด', 'ไม่สามารถบันทึกข้อมูลได้', 'error');
    }
  };

  const scheduleSummary = useMemo(() => {
    const summaryMap: Record<string, any> = {};

    Object.values(schedule).forEach((entry: any) => {
      if (!entry) return;
      const { course, className } = entry;
      const groupNumber = course.groupNumber || 1;
      const courseCode = course.code || course.courseCode || course.subjectCode || "";
      const courseTitle = course.title || course.courseName || course.subjectName || "วิชาไม่ระบุชื่อ";
      const key = `${course.id || `${courseCode}-${courseTitle}`}-${groupNumber}`;

      if (!summaryMap[key]) {
        summaryMap[key] = {
          code: courseCode,
          title: courseTitle,
          classes: [],
          periods: 0,
          credits: 0
        };
      }

      const classList = className.split(',').map((s: string) => s.trim());
      classList.forEach((cls: string) => {
        if (cls) {
          const cleanClsName = cls.split(' (กลุ่ม')[0];
          if (!summaryMap[key].classes.includes(cleanClsName)) {
            summaryMap[key].classes.push(cleanClsName);
          }
        }
      });

      summaryMap[key].periods += 1;
    });

    const summaryList = Object.values(summaryMap).map((item: any) => ({
      ...item,
      classes: item.classes.sort(),
      credits: item.periods / 2 
    })).sort((a: any, b: any) => String(a.code || '').localeCompare(String(b.code || '')));

    // Special Periods that count as teaching load
    if (scheduleSpecialPeriods.length > 0 && schedulePeriodSettings.length > 0) {
      const specialLoadMap: Record<string, number> = {};
      const days = ['mon', 'tue', 'wed', 'thu', 'fri'];
      
      days.forEach(day => {
        schedulePeriodSettings.forEach(p => {
          const special = scheduleSpecialPeriods.find(sp => 
            sp.isTeachingLoad && 
            (sp.linkedPeriodId === p.id || (!p.id.startsWith('period') && sp.id === p.id)) && 
            (!sp.day || sp.day === day || sp.day === 'all')
          );
          
          if (special) {
            specialLoadMap[special.title] = (specialLoadMap[special.title] || 0) + 1;
          }
        });
      });

      Object.entries(specialLoadMap).forEach(([title, count]) => {
        summaryList.push({
          code: 'กิจกรรม',
          title: title,
          classes: ['-'],
          periods: count,
          credits: 0
        });
      });
    }

    return summaryList;
  }, [schedule, scheduleSpecialPeriods, schedulePeriodSettings]);

  if (isFetching) {
    return <ProfilePageSkeleton />;
  }

  // หากดึงข้อมูลเสร็จแล้ว แต่ไม่พบโปรไฟล์
  if (!profile) {
    return (
      <MainLayout>
        <ToastContainer theme={isDarkMode ? "dark" : "light"} autoClose={2000} />
        <div className="max-w-4xl mx-auto px-3 sm:px-4 md:px-6 lg:px-8 py-4 sm:py-6 lg:py-8 text-center text-gray-900 dark:text-white">
          <h1 className="text-2xl font-bold tracking-tight mb-2">ไม่พบข้อมูลโปรไฟล์</h1>
          <p className="text-gray-500 dark:text-gray-400">
            เราไม่พบข้อมูลโปรไฟล์ครูที่เชื่อมโยงกับบัญชีของคุณในระบบ
            <br />
            กรุณาติดต่อผู้ดูแลระบบเพื่อดำเนินการเพิ่มข้อมูล
          </p>
          <LogoutButton className="mt-6 bg-red-600 px-6 py-2 rounded-md hover:bg-red-700 text-white" />
        </div>
      </MainLayout>
    );
  }

  const tabs = userRole === 'student' ? [
    { id: "general", label: "ข้อมูลทั่วไป", icon: <FaIdCard /> },
    { id: "family", label: "ครอบครัว", icon: <FaUsers /> },
    { id: "address", label: "ที่อยู่", icon: <FaMapMarkerAlt /> },
    { id: "health_welfare", label: "สุขภาพ/สวัสดิการ", icon: <FaHeartbeat /> },
    ...(remediationEnabled ? [{ id: "grade_flags", label: "ผลการเรียน (0/ร/มส/มผ)", icon: <FaExclamationTriangle /> }] : []),
    { id: "attendance", label: "สถิติการมาเรียน", icon: <FaClock /> },
    { id: "official_travel", label: "ไปร่วมกิจกรรม", icon: <FaPlane /> },
  ] : userRole === 'user' ? [
    { id: "general", label: "ข้อมูลส่วนตัว", icon: <FaIdCard /> },
    { id: "work", label: "ข้อมูลการทำงาน", icon: <FaBriefcase /> },
    ...(remediationEnabled ? [{ id: "grade_flags", label: "ผลการเรียน (0/ร/มส/มผ)", icon: <FaExclamationTriangle /> }] : []),
  ] : [
    { id: "general", label: "ข้อมูลส่วนตัว", icon: <FaIdCard /> },
    { id: "work", label: "ข้อมูลการทำงาน", icon: <FaBriefcase /> },
    { id: "schedule", label: "ตารางสอน", icon: <FaChalkboard /> },
    { id: "teaching", label: "การสอน", icon: <FaBook /> },
    { id: "line", label: "LINE", icon: <FaLine /> },
    { id: "attendance", label: "สถิติการมาทำงาน", icon: <FaClock /> },
    { id: "substitution", label: "สถิติการสอนแทน", icon: <FaExchangeAlt /> },
    { id: "official_travel", label: "ไปราชการ", icon: <FaPlane /> },
  ];

  // นักเรียนไม่ใช่ข้าราชการ จึงใช้คำว่า "ไปร่วมกิจกรรม" แทน "ไปราชการ" ที่ใช้กับครู/บุคลากร
  const officialTravelLabel = userRole === 'student' ? 'ไปร่วมกิจกรรม' : 'ไปราชการ';

  // Prepare Chart Data
  // ใช้ตัวเลขจากเอกสารสรุปยอด Yearsummary (yearSummaryStats) — เอกสารเดียวกับระบบที่ใช้คำนวณตัวเลขส่งแจ้งเตือน
  // ทาง LINE (sendTeacherLineNotification) เพื่อให้ตัวเลขตรงกันเสมอ ไม่นับสดจาก attendanceRecords อีกต่อไป
  // (การนับสดแยก "กลับก่อน" เป็นหมวดของตัวเอง แต่เอกสารสรุปยอดพับรวมเป็น "มาปกติ" ทำให้ตัวเลขไม่ตรงกับ LINE)
  const stats = (() => {
    // clamp เป็น 0 กันค่าติดลบ — ตัวนับสะสมในเอกสารสรุปยอดเป็น increment/decrement สะสม ถ้ามีบั๊คที่จุดใด
    // จุดหนึ่งเคยหักซ้ำ/หักผิดสถานะ ค่าอาจติดลบได้ ซึ่งไม่มีความหมายสำหรับแสดงผล (และทำให้ pie chart พังด้วย)
    if (yearSummaryStats) {
      return {
        present: Math.max(0, yearSummaryStats.present),
        late: Math.max(0, yearSummaryStats.late),
        leave: Math.max(0, yearSummaryStats.leave),
        absent: Math.max(0, yearSummaryStats.absent),
        noCheckout: Math.max(0, yearSummaryStats.noCheckout),
        official_travel_days: Math.max(0, yearSummaryStats.officialTravel),
      };
    }
    const p = (profile?.attendanceStats || {}) as any;
    return {
      present: Math.max(0, p.present || 0),
      late: Math.max(0, p.late || 0),
      leave: Math.max(0, p.leave || 0),
      absent: Math.max(0, p.absent || 0),
      noCheckout: Math.max(0, p.noCheckout || 0),
      official_travel_days: Math.max(0, p.official_travel_days || 0),
    };
  })();
  const attendanceChartData = [
    { name: 'มาปกติ', value: stats.present || 0, color: '#22c55e' },
    { name: 'สาย', value: stats.late || 0, color: '#eab308' },
    { name: 'ลา', value: stats.leave || 0, color: '#3b82f6' },
    { name: 'ขาด', value: stats.absent || 0, color: '#ef4444' },
    { name: 'ไม่ลงเวลาออก', value: stats.noCheckout || 0, color: '#a855f7' },
    { name: officialTravelLabel, value: stats.official_travel_days || 0, color: '#6366f1' },
  ];

  const googleAttendanceData = [
    ["Status", "Count"],
    ...attendanceChartData.map(d => [d.name, d.value]),
  ];

  // Trend (line chart: check-in time per day, last 30 records) and monthly breakdown —
  // same derivation ViewTeacherPage.tsx uses for a teacher's attendance tab, just sourced
  // from attendanceRecords (already fetched above) instead of a separate Firestore query.
  const { attendanceTrendData, monthlyStats, trendMonths } = (() => {
    const trendData: { date: string; time: string; checkinValue: number; checkoutValue?: number; status: string }[] = [];
    const thaiMonthsShort = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'];
    const monthlyData: Record<string, { present: number; late: number; leave: number; absent: number; early: number; noCheckout: number; name: string }> = {};

    for (const record of attendanceRecords) {
      const status = record.status;
      const dateStr: string | undefined = record.date || record.id;
      const timestamp = record.checkinTime?.toDate ? record.checkinTime : (record.timestamp?.toDate ? record.timestamp : null);
      if (!timestamp || !dateStr) continue;

      const d = timestamp.toDate();

      if (status === 'มา' || status === 'OnTime' || status === 'สาย' || status === 'Late') {
        const h = d.getHours();
        const m = d.getMinutes();
        const checkoutDate = record.checkoutTime?.toDate ? record.checkoutTime.toDate() : null;
        trendData.push({
          date: dateStr,
          time: `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`,
          checkinValue: h + m / 60,
          checkoutValue: checkoutDate ? checkoutDate.getHours() + checkoutDate.getMinutes() / 60 : undefined,
          status,
        });
      }

      const month = d.getMonth();
      const year = d.getFullYear();
      const shortYear = String(year + 543).slice(-2);
      const monthKey = `${year}-${String(month).padStart(2, '0')}`;
      if (!monthlyData[monthKey]) {
        monthlyData[monthKey] = { present: 0, late: 0, leave: 0, absent: 0, early: 0, noCheckout: 0, name: `${thaiMonthsShort[month]}'${shortYear}` };
      }
      if (status === 'มา' || status === 'OnTime') monthlyData[monthKey].present++;
      else if (status === 'สาย' || status === 'Late') monthlyData[monthKey].late++;
      else if (status === 'ลา' || status === 'Leave' || status === 'ล') monthlyData[monthKey].leave++;
      else if (status === 'ขาด' || status === 'Absent') monthlyData[monthKey].absent++;
      else if (status === 'กลับก่อน' || status === 'Early') monthlyData[monthKey].early++;
      else if (status === 'ไม่ลงเวลาออก' || status === 'NoCheckout') monthlyData[monthKey].noCheckout++;
    }

    const sortedTrend = trendData.sort((a, b) => a.date.localeCompare(b.date));

    const trendMonthKeys = new Set<string>();
    sortedTrend.forEach(t => trendMonthKeys.add(t.date.slice(0, 7)));
    const trendMonths = Array.from(trendMonthKeys).sort().reverse().map(key => {
      const [y, m] = key.split('-').map(Number);
      const shortYear = String(y + 543).slice(-2);
      return { key, label: `${thaiMonthsShort[m - 1] || key} '${shortYear}` };
    });

    return {
      attendanceTrendData: trendMonthFilter === 'all' ? sortedTrend.slice(-30) : sortedTrend.filter(t => t.date.startsWith(trendMonthFilter)),
      monthlyStats: Object.keys(monthlyData).sort().map(key => monthlyData[key]),
      trendMonths,
    };
  })();

  const getPieOptions = (data: typeof attendanceChartData) => ({
    is3D: true,
    backgroundColor: "transparent",
    legend: 'none',
    colors: data.map(d => d.color),
    chartArea: { width: "90%", height: "80%" },
  });

  const getFilteredAttendance = () => {
    if (!selectedStatus) return [];

    const statusMap: Record<string, string[]> = {
      'present': ['มา', 'OnTime'],
      'late': ['สาย', 'Late'],
      'leave': ['ลา', 'Leave', 'ล'],
      'absent': ['ขาด', 'Absent'],
      'early': ['กลับก่อน', 'Early'],
      'noCheckout': ['ไม่ลงเวลาออก', 'NoCheckout'],
      'officialTravel': ['ไปราชการ', 'OfficialTravel'],
    };

    const targetStatuses = statusMap[selectedStatus] || [];
    return attendanceRecords.filter(r => targetStatuses.includes(r.status));
  };

  const filteredRecords = getFilteredAttendance();

  const getCourseTitle = (course: any) => course?.title || course?.courseName || course?.subjectName || "วิชาไม่ระบุชื่อ";
  const getCourseCode = (course: any) => course?.code || course?.courseCode || course?.subjectCode || "";
  const stripGroupLabel = (value: string = "") => value.replace(/\s*\(กลุ่ม\s*\d+\)/g, '').trim();

  const getScheduleEntryForPeriod = (dayKey: string, period: any, periodIndex: number) => {
    const candidates = getScheduleSlotCandidates(dayKey, period, periodIndex);
    const slotKey = candidates.find(key => schedule[key]);
    return {
      slotKey: slotKey || candidates[0] || `${dayKey}-${periodIndex}`,
      entry: slotKey ? schedule[slotKey] : undefined
    };
  };

  const getDayCells = (dayKey: string) => {
    const cells: any[] = [];
    const periods = getTimetableDisplayPeriods(schedulePeriodSettings);
    let i = 0;
    while (i < periods.length) {
      const p = periods[i];
      
      if (p.id === 'lunch') {
        cells.push({
          type: 'lunch',
          period: p,
          colSpan: 1
        });
        i++;
        continue;
      }
      
      const { slotKey, entry } = getScheduleEntryForPeriod(dayKey, p, i);
      
      const special = scheduleSpecialPeriods.find(sp => 
        (sp.linkedPeriodId === p.id || (!p.id.startsWith('period') && sp.id === p.id)) && 
        (!sp.day || sp.day === dayKey || sp.day === 'all')
      );
      
      const club = scheduleClubs.find(c => 
        c.responsibleTeacherIds?.includes(profile?.docId) &&
        c.scheduleSlot === slotKey
      );

      if (special) {
        cells.push({
          type: 'special',
          special,
          period: p,
          colSpan: 1
        });
        i++;
        continue;
      }

      if (club) {
        cells.push({
          type: 'club',
          club,
          period: p,
          colSpan: 1
        });
        i++;
        continue;
      }

      if (!entry) {
        cells.push({
          type: 'empty',
          period: p,
          colSpan: 1
        });
        i++;
        continue;
      }

      let colSpan = 1;
      let nextIndex = i + 1;
      while (nextIndex < periods.length) {
        const nextPeriod = periods[nextIndex];
        if (nextPeriod.id === 'lunch') break;
        
        const { slotKey: nextSlotKey, entry: nextEntry } = getScheduleEntryForPeriod(dayKey, nextPeriod, nextIndex);
        
        const nextSpecial = scheduleSpecialPeriods.find(sp => 
          (sp.linkedPeriodId === nextPeriod.id || (!nextPeriod.id.startsWith('period') && sp.id === nextPeriod.id)) && 
          (!sp.day || sp.day === dayKey || sp.day === 'all')
        );
        const nextClub = scheduleClubs.find(c => 
          c.responsibleTeacherIds?.includes(profile?.docId) &&
          c.scheduleSlot === nextSlotKey
        );

        if (nextSpecial || nextClub) break;

        if (nextEntry && 
            nextEntry.course.id === entry.course.id && 
            Number(nextEntry.course.groupNumber || 1) === Number(entry.course.groupNumber || 1)) {
          colSpan++;
          nextIndex++;
        } else {
          break;
        }
      }

      cells.push({
        type: 'course',
        entry,
        period: p,
        colSpan
      });
      i += colSpan;
    }
    return cells;
  };

  const getCourseColors = (code: string) => {
    const colors = [
      { bg: 'bg-indigo-50 dark:bg-indigo-950/40', text: 'text-indigo-800 dark:text-indigo-300', border: 'border-t-indigo-100 border-b-indigo-100 dark:border-t-indigo-900/50 dark:border-b-indigo-900/50' },
      { bg: 'bg-teal-50 dark:bg-teal-950/40', text: 'text-teal-800 dark:text-teal-300', border: 'border-t-teal-100 border-b-teal-100 dark:border-t-teal-900/50 dark:border-b-teal-900/50' },
      { bg: 'bg-violet-50 dark:bg-violet-950/40', text: 'text-violet-800 dark:text-violet-300', border: 'border-t-violet-100 border-b-violet-100 dark:border-t-violet-900/50 dark:border-b-violet-900/50' },
      { bg: 'bg-sky-50 dark:bg-sky-950/40', text: 'text-sky-800 dark:text-sky-300', border: 'border-t-sky-100 border-b-sky-100 dark:border-t-sky-900/50 dark:border-b-sky-900/50' },
      { bg: 'bg-rose-50 dark:bg-rose-950/40', text: 'text-rose-800 dark:text-rose-300', border: 'border-t-rose-100 border-b-rose-100 dark:border-t-rose-900/50 dark:border-b-rose-900/50' },
      { bg: 'bg-amber-50 dark:bg-amber-950/40', text: 'text-amber-800 dark:text-amber-300', border: 'border-t-amber-100 border-b-amber-100 dark:border-t-amber-900/50 dark:border-b-amber-900/50' },
      { bg: 'bg-fuchsia-50 dark:bg-fuchsia-950/40', text: 'text-fuchsia-800 dark:text-fuchsia-300', border: 'border-t-fuchsia-100 border-b-fuchsia-100 dark:border-t-fuchsia-900/50 dark:border-b-fuchsia-900/50' },
    ];
    
    let hash = 0;
    for (let i = 0; i < code.length; i++) {
      hash = code.charCodeAt(i) + ((hash << 5) - hash);
    }
    const index = Math.abs(hash) % colors.length;
    return colors[index];
  };

  const homeroomGradeValue = String(profile?.homeroomGrade || "").trim();
  const homeroomGradeParts = homeroomGradeValue.split("/").map((part) => part.trim()).filter(Boolean);
  const homeroomClassLevel = homeroomGradeParts[0] || homeroomGradeValue;
  const homeroomRoomValue = [
    homeroomGradeParts[1],
    profile?.room,
    (profile as any)?.roomNumber,
    (profile as any)?.classroom,
    (profile as any)?.homeroomRoom,
    (profile as any)?.section,
  ].find((value) => value !== undefined && value !== null && String(value).trim() !== "");
  const homeroomRoom = homeroomRoomValue ? String(homeroomRoomValue).trim() : "";
  const homeroomLabel = homeroomClassLevel
    ? `${homeroomClassLevel}${homeroomRoom ? `/${homeroomRoom}` : ""}`
    : "-";
  const lineOABasicId = String(profile?.lineOABasicId || "").trim();
  const lineLiffId = String(profile?.liffId || "").trim();
  const lineAddFriendUrl = lineOABasicId
    ? `https://line.me/R/ti/p/${encodeURIComponent(lineOABasicId)}`
    : "";
  const parentRegisterUrl = profile?.schoolId
    ? `${window.location.origin}/line/register-parent?${new URLSearchParams({
        schoolId: String(profile.schoolId),
        ...(lineLiffId ? { liffId: lineLiffId } : {}),
        ...(profile.docId ? { teacherId: String(profile.docId) } : {}),
        ...(homeroomClassLevel ? { classLevel: homeroomClassLevel } : {}),
        ...(homeroomRoom ? { room: homeroomRoom } : {}),
      }).toString()}`
    : "";
  const hasLineClassConfig = Boolean(lineLiffId || lineOABasicId);
  const maskSensitiveValue = (value: string) => {
    if (!value) return "-";
    if (value.length <= 8) return `${value.slice(0, 2)}***${value.slice(-2)}`;
    return `${value.slice(0, 6)}***${value.slice(-4)}`;
  };
  const displayedLiffId = isLiffIdVisible ? lineLiffId : maskSensitiveValue(lineLiffId);

  const copyToClipboard = async (value: string, successMessage: string) => {
    try {
      await navigator.clipboard.writeText(value);
      toast.success(successMessage);
    } catch (error) {
      console.error("Copy to clipboard failed:", error);
      toast.error("คัดลอกลิงก์ไม่สำเร็จ");
    }
  };

  return (
    <MainLayout>
      <ToastContainer theme={isDarkMode ? "dark" : "light"} autoClose={2000} />

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10 text-gray-900 dark:text-white">
        <header className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 dark:text-white tracking-tight">
              โปรไฟล์ของฉัน
            </h1>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
              จัดการข้อมูลส่วนตัวและการตั้งค่าบัญชีของคุณ
            </p>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={toggleTheme}
              className="p-2.5 rounded-lg transition-colors bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-600 dark:text-yellow-400"
              title={isDarkMode ? "สลับเป็นโหมดสว่าง" : "สลับเป็นโหมดมืด"}
            >
              {isDarkMode ? <FaSun /> : <FaMoon />}
            </button>
            <button
              type="button"
              onClick={handleEdit}
              className="inline-flex items-center gap-2 bg-indigo-600 px-4 py-2 rounded-lg hover:bg-indigo-700 text-white font-medium text-sm transition-all shadow-sm"
            >
              <FaPen /> แก้ไขข้อมูล
            </button>
            <LogoutButton className="bg-red-600 px-4 py-2 rounded-lg hover:bg-red-700 text-white text-sm" />
          </div>
        </header>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
          {/* Left Sidebar */}
          <aside className="lg:col-span-4 space-y-6 lg:sticky lg:top-24 self-start">
            {/* Profile Card */}
            <div className="bg-white dark:bg-[#2a2b2f] rounded-2xl p-6 shadow-sm border border-gray-100 dark:border-gray-800 text-center">
              <ProfileAvatar
                src={
                  profile.profileImageUrl ||
                  `https://ui-avatars.com/api/?name=${profile.firstName}+${profile.lastName}&background=random`
                }
                alt="Profile"
                className="w-32 h-32 border-4 border-white dark:border-gray-700 shadow-lg mx-auto mb-4"
              />
              <h2 className="text-xl font-bold text-gray-900 dark:text-white">{profile.title}{profile.firstName} {profile.lastName}</h2>
              <p className="text-sm text-gray-500 dark:text-gray-400">{profile.email}</p>

              <div className="mt-6 pt-6 border-t border-gray-100 dark:border-gray-700 text-xs text-gray-400 dark:text-gray-500 space-y-1">
                <p>สร้างเมื่อ: {profile.createdAt ? new Date(profile.createdAt.seconds * 1000).toLocaleString('th-TH') : '-'}</p>
                <p>แก้ไขล่าสุด: {profile.updatedAt ? new Date(profile.updatedAt.seconds * 1000).toLocaleString('th-TH') : 'ยังไม่มีการแก้ไข'}</p>
              </div>
            </div>

            {/* Desktop Menu */}
            <div className="hidden lg:block space-y-2">
              {tabs.map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => {
                    setActiveTab(tab.id);
                    window.scrollTo({ top: 0, behavior: 'smooth' });
                  }}
                  className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-semibold transition-all duration-200 ${activeTab === tab.id
                    ? "bg-indigo-600 text-white shadow-md cursor-default"
                    : "bg-white dark:bg-[#2a2b2f] text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700/50 border border-transparent shadow-sm"
                    }`}
                >
                  <span className="text-lg">{tab.icon}</span>
                  {tab.label}
                </button>
              ))}
            </div>
          </aside>

          {/* Right Content Area */}
          <main className="lg:col-span-8">
            {/* Mobile Tab Navigation (Horizontal Scroll) */}
            <div className="lg:hidden sticky top-[60px] z-30 -mx-4 px-4 py-4 mb-6 bg-gray-50/80 dark:bg-[#1e1f21]/80 backdrop-blur-md border-b border-gray-200 dark:border-gray-800 scrollbar-hide">
              <div className="flex flex-nowrap gap-2 table-responsive pb-1">
                {tabs.map((tab) => (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => {
                      setActiveTab(tab.id);
                      window.scrollTo({ top: 0, behavior: 'smooth' });
                    }}
                    className={`flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold transition-all duration-300 whitespace-nowrap ${activeTab === tab.id
                      ? "bg-indigo-600 text-white shadow-lg shadow-indigo-200 dark:shadow-indigo-900/20"
                      : "bg-white dark:bg-[#2a2b2f] text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700/50 shadow-sm border border-gray-100 dark:border-gray-700"
                      }`}
                  >
                    <span className="text-lg">{tab.icon}</span>
                    {tab.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-6">
              {activeTab === "general" && (
                <div className="bg-white dark:bg-[#2a2b2f] rounded-2xl p-6 shadow-sm border border-gray-100 dark:border-gray-800 animate-fade-in">
                  <h2 className="text-lg font-semibold mb-6 pb-4 border-b border-gray-200 dark:border-gray-700 text-gray-800 dark:text-gray-200">
                    {userRole === 'student' ? 'ข้อมูลส่วนตัว (นักเรียน)' : 'ข้อมูลส่วนตัวและวุฒิการศึกษา'}
                  </h2>
                  <div className="space-y-4">
                    {userRole === 'student' ? (
                      <>
                        <div>
                          <DetailField label="ชื่อ-นามสกุล" value={`${profile.title}${profile.firstName} ${profile.lastName}`} />
                        </div>
                        {/* รวมทุกฟิลด์ที่เหลือไว้ในกริดเดียว แทนที่จะแยกเป็นกริดย่อยทีละ 2-3 ช่อง — ทำให้
                            ใช้พื้นที่แนวนอนของการ์ดเต็มที่บนจอกว้าง ไม่เหลือพื้นที่ว่างด้านขวาเหมือนเดิม */}
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                          <DetailField label="ชื่อเล่น" value={profile.nickname} />
                          <DetailField label="เลขประจำตัวประชาชน" value={profile.idCardNumber} />
                          <DetailField label="รหัสนักเรียน" value={profile.studentId} />
                          <DetailField label="ชั้น/ห้อง" value={`${profile.classLevel}/${profile.room}`} />
                          <DetailField label="เลขที่" value={profile.studentNumber} />
                          <DetailField label="คะแนนความประพฤติ" value={`${profile.behaviorScore ?? 100} คะแนน`} />
                          <DetailField label="วันเกิด" value={profile.birthDate} />
                          <DetailField label="เพศ" value={profile.gender} />
                          <DetailField label="ศาสนา" value={profile.religion} />
                        </div>
                      </>
                    ) : (
                      <>
                        <div>
                          <DetailField label="ชื่อ-นามสกุล" value={`${profile.title}${profile.firstName} ${profile.lastName}`} />
                        </div>
                        {/* รวมทุกฟิลด์ที่เหลือไว้ในกริดเดียว แทนที่จะแยกเป็นกริดย่อยทีละ 2-3 ช่อง — ทำให้
                            ใช้พื้นที่แนวนอนของการ์ดเต็มที่บนจอกว้าง ไม่เหลือพื้นที่ว่างด้านขวาเหมือนเดิม */}
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                          <DetailField label="วันเกิด" value={profile.dob} />
                          <DetailField label="เพศ" value={profile.gender} />
                          <DetailField label="เลขที่ใบประกอบวิชาชีพ" value={profile.licenseNumber} />
                          <DetailField label="วิทยฐานะ" value={profile.academicStanding} />
                          <DetailField label="วันที่เริ่มงาน/บรรจุ" value={profile.startDate} />
                          <DetailField label="วุฒิการศึกษา" value={profile.educationLevel} />
                          <DetailField label="วิชาเอก" value={profile.major} />
                        </div>
                      </>
                    )}
                  </div>
                </div>
              )}

              {activeTab === "work" && userRole !== 'student' && (
                <div className="bg-white dark:bg-[#2a2b2f] rounded-2xl p-6 shadow-sm border border-gray-100 dark:border-gray-800 animate-fade-in">
                  <h2 className="text-lg font-semibold mb-6 pb-4 border-b border-gray-200 dark:border-gray-700 text-gray-800 dark:text-gray-200">ข้อมูลการทำงานและติดต่อ</h2>
                  <div className="space-y-4">
                    {/* กริดเดียวรวมทุกฟิลด์ (แทนกริด 2 คอลัมน์แคบๆ เดิม) — เพิ่ม lg:grid-cols-3 ให้ใช้พื้นที่
                        แนวนอนของการ์ดเต็มที่บนจอกว้าง ไม่เหลือพื้นที่ว่างด้านขวาเหมือนเดิม */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                      <DetailField label={userRole === 'teacher' ? "รหัสครู" : "รหัสบุคลากร"} value={profile.teacherId} />
                      <DetailField label="ตำแหน่ง" value={profile.position} />
                      <DetailField label="ฝ่ายงาน" value={profile.department} />
                      {userRole === 'teacher' && <DetailField label="กลุ่มสาระการเรียนรู้" value={profile.learningArea} />}

                      {userRole === 'teacher' && <DetailField label="ที่ปรึกษา" value={profile.advisorRole || (profile.isHomeroomTeacher ? "ครูประจำชั้น" : "-")} />}
                      {userRole === 'teacher' && (
                        <div className="grid grid-cols-2 gap-4">
                          <DetailField label="ชั้น" value={profile.homeroomGrade?.toString().split('/')[0]?.trim() || profile.homeroomGrade} />
                          <DetailField
                            label="ห้อง"
                            value={
                              [
                                profile.room,
                                (profile as any).roomNumber,
                                (profile as any).classroom,
                                (profile as any).homeroomRoom,
                                (profile as any).section,
                                profile.homeroomGrade?.toString().includes('/') ? profile.homeroomGrade.split('/')[1].trim() : null
                              ].find(v => v !== undefined && v !== null && v !== "") ?? null
                            }
                          />
                        </div>
                      )}
                      {userRole === 'teacher' && profile.isHeadOfLearningArea && (
                        <div>
                          <label className="block text-sm font-medium text-gray-500 dark:text-gray-400">บทบาทพิเศษ</label>
                          <span className="mt-1 inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-indigo-100 text-indigo-800 dark:bg-indigo-900 dark:text-indigo-200">
                            หัวหน้ากลุ่มสาระ
                          </span>
                        </div>
                      )}
                      <DetailField label="ข้อมูลติดต่อ" value={profile.contact} />
                      <DetailField label="Line ID" value={profile.lineId} />
                    </div>
                    <DetailField label="ที่อยู่" value={profile.address} />
                  </div>
                </div>
              )}

              {activeTab === "line" && userRole === 'teacher' && (
                <div className="bg-white dark:bg-[#2a2b2f] rounded-2xl p-6 shadow-sm border border-gray-100 dark:border-gray-800 animate-fade-in">
                  <div className="flex flex-col gap-4 border-b border-gray-200 pb-5 dark:border-gray-700 sm:flex-row sm:items-start sm:justify-between">
                    <div>
                      <h2 className="flex items-center gap-2 text-lg font-bold text-gray-800 dark:text-gray-200">
                        <FaLine className="text-green-500" /> LINE สำหรับห้องประจำชั้น
                      </h2>
                      <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                        QR สำหรับให้ผู้ปกครองสแกนลงทะเบียนรับแจ้งเตือนของห้อง {homeroomLabel}
                      </p>
                    </div>
                    <div className="inline-flex items-center gap-2 rounded-lg border border-green-100 bg-green-50 px-3 py-2 text-sm font-bold text-green-700 dark:border-green-900/50 dark:bg-green-950/30 dark:text-green-300">
                      <FaQrcode /> {homeroomLabel}
                    </div>
                  </div>

                  {!profile.isHomeroomTeacher ? (
                    <div className="mt-6 rounded-xl border border-amber-200 bg-amber-50 p-5 text-sm text-amber-800 dark:border-amber-900/40 dark:bg-amber-950/20 dark:text-amber-300">
                      บัญชีนี้ยังไม่ได้ถูกกำหนดเป็นครูประจำชั้น จึงยังไม่มี QR สำหรับห้องเรียน
                    </div>
                  ) : !hasLineClassConfig ? (
                    <div className="mt-6 rounded-xl border border-gray-200 bg-gray-50 p-5 text-sm text-gray-600 dark:border-gray-700 dark:bg-gray-800/40 dark:text-gray-300">
                      ยังไม่ได้ตั้งค่า LINE OA/LIFF สำหรับห้อง {homeroomLabel} กรุณาให้ผู้ดูแลตั้งค่าที่หน้า “จัดการ LINE OA”
                    </div>
                  ) : (
                    <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_240px]">
                      <div className="space-y-4">
                        {/* lg:grid-cols-4 ให้ทั้ง 4 ฟิลด์อยู่แถวเดียวบนจอกว้าง แทนที่จะเหลือแค่ 2 คอลัมน์
                            ซึ่งทิ้งพื้นที่ว่างไว้ในคอลัมน์ minmax(0,1fr) ด้านซ้ายของ QR code */}
                        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
                          <DetailField label="ชั้น/ห้อง" value={homeroomLabel} />
                          <DetailField label="LINE OA Basic ID" value={lineOABasicId || "-"} />
                          <div>
                            <label className="block text-sm font-medium text-gray-500 dark:text-gray-400">LIFF ID</label>
                            <div className="mt-1 flex min-w-0 items-center gap-2">
                              <p className="min-w-0 flex-1 break-all font-mono text-md font-semibold text-gray-900 dark:text-gray-200">
                                {displayedLiffId}
                              </p>
                              {lineLiffId && (
                                <button
                                  type="button"
                                  onClick={() => setIsLiffIdVisible((value) => !value)}
                                  className="inline-flex shrink-0 items-center justify-center p-1 text-gray-500 transition hover:text-indigo-600 dark:text-gray-400 dark:hover:text-indigo-300"
                                  title={isLiffIdVisible ? "ซ่อน LIFF ID" : "แสดง LIFF ID"}
                                >
                                  {isLiffIdVisible ? <FaEyeSlash /> : <FaEye />}
                                </button>
                              )}
                            </div>
                          </div>
                          <DetailField label="ครูประจำชั้น" value={`${profile.title || ""}${profile.firstName || ""} ${profile.lastName || ""}`} />
                        </div>

                        <div className="rounded-xl border border-gray-200 bg-gray-50 p-4 dark:border-gray-700 dark:bg-[#1e1f21]">
                          <label className="mb-2 block text-xs font-bold uppercase text-gray-400 dark:text-gray-500">
                            ลิงก์ลงทะเบียนผู้ปกครอง
                          </label>
                          <div className="flex flex-col gap-2 sm:flex-row">
                            <input
                              readOnly
                              value={parentRegisterUrl}
                              className="min-w-0 flex-1 rounded-lg border border-gray-200 bg-white px-3 py-2 text-xs text-gray-700 outline-none dark:border-gray-700 dark:bg-[#2a2b2f] dark:text-gray-200"
                            />
                            <button
                              type="button"
                              onClick={() => copyToClipboard(parentRegisterUrl, "คัดลอกลิงก์ลงทะเบียนแล้ว")}
                              className="inline-flex items-center justify-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-indigo-700"
                            >
                              <FaCopy /> คัดลอก
                            </button>
                          </div>
                        </div>

                        <div className="flex flex-col gap-3 sm:flex-row">
                          <a
                            href={parentRegisterUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center justify-center gap-2 rounded-lg bg-green-600 px-4 py-2.5 text-sm font-bold text-white transition hover:bg-green-700"
                          >
                            <FaExternalLinkAlt /> เปิดหน้าลงทะเบียน
                          </a>
                          {lineAddFriendUrl && (
                            <a
                              href={lineAddFriendUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center justify-center gap-2 rounded-lg border border-green-200 bg-white px-4 py-2.5 text-sm font-bold text-green-700 transition hover:bg-green-50 dark:border-green-900/50 dark:bg-[#1e1f21] dark:text-green-300 dark:hover:bg-green-950/20"
                            >
                              <FaLine /> เพิ่มเพื่อน LINE OA
                            </a>
                          )}
                        </div>
                      </div>

                      <div className="flex flex-col items-center justify-center rounded-xl border border-gray-200 bg-white p-5 text-center shadow-sm dark:border-gray-700 dark:bg-[#1e1f21]">
                        <div className="rounded-xl bg-white p-3">
                          <QRCode value={parentRegisterUrl} size={184} level="M" />
                        </div>
                        <p className="mt-4 text-sm font-bold text-gray-800 dark:text-gray-200">
                          QR ห้อง {homeroomLabel}
                        </p>
                        <p className="mt-1 text-xs leading-5 text-gray-500 dark:text-gray-400">
                          ให้ผู้ปกครองสแกนเพื่อผูกบัญชี LINE กับนักเรียนในระบบ
                        </p>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {activeTab === "family" && userRole === 'student' && (
                <div className="bg-white dark:bg-[#2a2b2f] rounded-2xl p-6 shadow-sm border border-gray-100 dark:border-gray-800 animate-fade-in space-y-8">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                    <div>
                      <h3 className="text-md font-bold mb-4 text-indigo-600 dark:text-indigo-400 flex items-center gap-2">
                        <FaUsers /> ข้อมูลบิดา
                      </h3>
                      <div className="space-y-3">
                        <DetailField label="ชื่อ-นามสกุล บิดา" value={`${profile.fatherTitle || ''}${profile.fatherFirstName || ''} ${profile.fatherLastName || ''}`} />
                        <DetailField label="อาชีพ" value={profile.fatherOccupation} />
                        <DetailField label="รายได้ต่อเดือน" value={profile.fatherMonthlyIncome} />
                      </div>
                    </div>
                    <div>
                      <h3 className="text-md font-bold mb-4 text-indigo-600 dark:text-indigo-400 flex items-center gap-2">
                        <FaUsers /> ข้อมูลมารดา
                      </h3>
                      <div className="space-y-3">
                        <DetailField label="ชื่อ-นามสกุล มารดา" value={`${profile.motherTitle || ''}${profile.motherFirstName || ''} ${profile.motherLastName || ''}`} />
                        <DetailField label="อาชีพ" value={profile.motherOccupation} />
                        <DetailField label="รายได้ต่อเดือน" value={profile.motherMonthlyIncome} />
                      </div>
                    </div>
                  </div>
                  <div className="pt-6 border-t border-gray-100 dark:border-gray-700">
                    <h3 className="text-md font-bold mb-4 text-indigo-600 dark:text-indigo-400 flex items-center gap-2">
                      <FaUser /> ข้อมูลผู้ปกครอง
                    </h3>
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                      <DetailField label="เกี่ยวข้องเป็น" value={profile.guardianRelationship} />
                      <DetailField label="ชื่อ-นามสกุล ผู้ปกครอง" value={`${profile.guardianTitle || ''}${profile.guardianFirstName || ''} ${profile.guardianLastName || ''}`} />
                      <DetailField label="เบอร์โทรศัพท์ผู้ปกครอง" value={profile.guardianPhone} />
                    </div>
                  </div>
                </div>
              )}

              {activeTab === "address" && userRole === 'student' && (
                <div className="bg-white dark:bg-[#2a2b2f] rounded-2xl p-6 shadow-sm border border-gray-100 dark:border-gray-800 animate-fade-in space-y-8">
                  <div>
                    <h3 className="text-md font-bold mb-4 text-indigo-600 dark:text-indigo-400">ที่อยู่ตามทะเบียนบ้าน</h3>
                    <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-4">
                      <DetailField label="บ้านเลขที่" value={profile.regAddressNumber} />
                      <DetailField label="หมู่ที่" value={profile.regMoo} />
                      <DetailField label="ตำบล" value={profile.regSubDistrict} />
                      <DetailField label="อำเภอ" value={profile.regDistrict} />
                      <DetailField label="จังหวัด" value={profile.regProvince} />
                      <DetailField label="รหัสไปรษณีย์" value={profile.regZipCode} />
                    </div>
                  </div>
                  <div className="pt-6 border-t border-gray-100 dark:border-gray-700">
                    <h3 className="text-md font-bold mb-4 text-indigo-600 dark:text-indigo-400">ที่อยู่ปัจจุบัน</h3>
                    <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-4">
                      <DetailField label="บ้านเลขที่" value={profile.curAddressNumber} />
                      <DetailField label="หมู่ที่" value={profile.curMoo} />
                      <DetailField label="ตำบล" value={profile.curSubDistrict} />
                      <DetailField label="อำเภอ" value={profile.curDistrict} />
                      <DetailField label="จังหวัด" value={profile.curProvince} />
                      <DetailField label="รหัสไปรษณีย์" value={profile.curZipCode} />
                    </div>
                  </div>
                </div>
              )}

              {activeTab === "schedule" && userRole === 'teacher' && (
                <div className="bg-white dark:bg-[#2a2b2f] rounded-2xl p-6 shadow-sm border border-gray-100 dark:border-gray-800 animate-fade-in space-y-6">
                  <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center pb-4 border-b border-gray-200 dark:border-gray-700 gap-4">
                    <div>
                      <h2 className="text-lg font-bold text-gray-800 dark:text-gray-200 flex items-center gap-2">
                        <FaChalkboard className="text-indigo-500" /> ตารางสอนของฉัน
                      </h2>
                      <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                        {scheduleAcademicYear ? `ภาคเรียนที่ ${scheduleCurrentTerm} ปีการศึกษา ${scheduleAcademicYear}` : 'กำลังระบุปีการศึกษา...'}
                      </p>
                    </div>
                    <div className="flex items-center gap-2 text-xs bg-indigo-50 dark:bg-indigo-950/40 text-indigo-700 dark:text-indigo-300 px-3 py-1.5 rounded-xl border border-indigo-100 dark:border-indigo-900/50">
                      <span>ตารางสอนจริงอิงตามระบบจัดตารางกลางของกลุ่มวิชาการ</span>
                    </div>
                  </div>

                  {isScheduleLoading ? (
                    <div className="flex flex-col justify-center items-center py-12">
                      <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-indigo-600 mb-3"></div>
                      <p className="text-gray-500 dark:text-gray-400 text-sm">กำลังโหลดข้อมูลตารางสอน...</p>
                    </div>
                  ) : Object.keys(schedule).length === 0 ? (
                    <div className="flex flex-col justify-center items-center py-16 text-center">
                      <div className="w-16 h-16 bg-gray-100 dark:bg-gray-800 rounded-full flex items-center justify-center mb-4 text-gray-450">
                        <FaChalkboard size={32} />
                      </div>
                      <h3 className="text-base font-bold text-gray-750 dark:text-gray-200 mb-1">ไม่พบข้อมูลตารางสอน</h3>
                      <p className="text-xs text-gray-500 dark:text-gray-400 max-w-sm">
                        ยังไม่มีการกำหนดหรือนำเข้าข้อมูลตารางสอนสำหรับท่านในภาคเรียนนี้
                      </p>
                    </div>
                  ) : (
                    <div className="space-y-6">
                      {/* Table Container - overflow-x-hidden to fully satisfy user constraint of NO bottom scrollbar */}
                      <div className="w-full overflow-x-hidden border border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-[#1a1b1e] shadow-sm">
                        <table className="w-full table-fixed border-collapse text-[10px] sm:text-xs">
                          <thead>
                            <tr className="bg-gray-50 dark:bg-[#202125]/50 border-b border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300">
                              {/* Day/Period Column Header */}
                              <th className="p-1.5 text-center font-bold border-r border-gray-200 dark:border-gray-700" style={{ width: '8%' }}>
                                วัน / คาบ
                              </th>
                              {getTimetableDisplayPeriods(schedulePeriodSettings).map((p, index) => {
                                const isLunch = p.id === 'lunch';
                                const displayPeriods = getTimetableDisplayPeriods(schedulePeriodSettings);
                                const teachingCount = Math.max(1, displayPeriods.filter(period => period.id !== 'lunch').length);
                                const w = isLunch ? '6%' : `${86 / teachingCount}%`;
                                const effectiveEnd = getEffectivePeriodEnd(displayPeriods, p, index);
                                return (
                                  <th key={p.id} className="p-1 text-center font-bold border-r last:border-none border-gray-200 dark:border-gray-700 leading-tight" style={{ width: w }}>
                                    <div className="font-semibold text-[8px] sm:text-[10px] truncate">{isLunch ? 'พัก' : p.label}</div>
                                    <div className="text-[7px] sm:text-[8px] text-gray-400 dark:text-gray-500 font-normal mt-0.5 whitespace-normal">{p.startTime} - {effectiveEnd}</div>
                                  </th>
                                );
                              })}
                            </tr>
                          </thead>
                          <tbody>
                            {Object.entries(DAYS).map(([dayKey, dayName]) => {
                              const dayBorder = {
                                mon: 'border-l-4 border-l-[#eedc32] bg-yellow-50/5 dark:bg-yellow-950/5',
                                tue: 'border-l-4 border-l-[#ea77bb] bg-pink-50/5 dark:bg-pink-950/5',
                                wed: 'border-l-4 border-l-[#4fb56a] bg-green-50/5 dark:bg-green-950/5',
                                thu: 'border-l-4 border-l-[#f47c24] bg-orange-50/5 dark:bg-orange-950/5',
                                fri: 'border-l-4 border-l-[#4e9beb] bg-sky-50/5 dark:bg-sky-950/5',
                              }[dayKey] || '';

                              const dayLabelBg = {
                                mon: 'bg-yellow-500 text-white',
                                tue: 'bg-pink-500 text-white',
                                wed: 'bg-green-500 text-white',
                                thu: 'bg-orange-500 text-white',
                                fri: 'bg-sky-500 text-white',
                              }[dayKey] || 'bg-gray-500 text-white';

                              // Call helper to get cells for this day
                              const cells = getDayCells(dayKey);

                              return (
                                <tr key={dayKey} className="h-20 border-b border-gray-200 dark:border-gray-700 hover:bg-gray-50/50 dark:hover:bg-gray-800/10 transition-colors">
                                  {/* Day Name Column */}
                                  <td className={`p-1.5 font-bold border-r border-gray-200 dark:border-gray-700 text-center align-middle ${dayBorder}`}>
                                    <span className={`inline-flex items-center justify-center px-2 py-0.5 rounded-md text-[9px] sm:text-[10px] font-bold shadow-sm ${dayLabelBg}`}>
                                      {DAY_SHORT_LABELS[dayKey] || dayName.substring(0, 1)}
                                    </span>
                                  </td>
                                  
                                  {/* Period Cells */}
                                  {cells.map((cell, idx) => {
                                    if (cell.type === 'lunch') {
                                      return (
                                        <td key={`lunch-${dayKey}`} className="border-r last:border-none border-gray-200 dark:border-gray-700 bg-gray-50/60 dark:bg-gray-800/20 text-gray-400 dark:text-gray-500 font-bold select-none p-1 text-center align-middle" colSpan={cell.colSpan}>
                                          <div className="flex h-full min-h-[72px] flex-col items-center justify-center gap-0.5 text-[7px] sm:text-[8px] leading-none font-bold select-none opacity-75">
                                            <span className="whitespace-nowrap">พัก</span>
                                            <span className="whitespace-nowrap">กลางวัน</span>
                                          </div>
                                        </td>
                                      );
                                    }

                                    if (cell.type === 'empty') {
                                      return (
                                        <td key={`empty-${dayKey}-${idx}`} className="border-r last:border-none border-gray-200 dark:border-gray-700 bg-gray-50/20 dark:bg-[#202125]/10 text-gray-300 dark:text-gray-700 text-center align-middle p-1" colSpan={cell.colSpan}>
                                          <span className="text-[7px] sm:text-[9px] select-none font-medium opacity-35">-</span>
                                        </td>
                                      );
                                    }

                                    if (cell.type === 'special') {
                                      return (
                                        <td key={`special-${dayKey}-${idx}`} className="border-r last:border-none border-r-gray-200 dark:border-r-gray-700 bg-emerald-50 dark:bg-emerald-950/20 text-emerald-800 dark:text-emerald-300 text-center align-middle p-1 border-t border-b border-t-emerald-100 border-b-emerald-100 dark:border-t-emerald-900/50 dark:border-b-emerald-900/50" colSpan={cell.colSpan}>
                                          <div className="flex min-h-[72px] flex-col items-center justify-center">
                                          <div className="font-bold text-[8px] sm:text-[9px] leading-tight truncate">{cell.special.title}</div>
                                          {cell.special.description && (
                                            <div className="text-[6px] sm:text-[7px] text-emerald-600 dark:text-emerald-400 mt-0.5 truncate">{cell.special.description}</div>
                                          )}
                                          </div>
                                        </td>
                                      );
                                    }

                                    if (cell.type === 'club') {
                                      return (
                                        <td key={`club-${dayKey}-${idx}`} className="border-r last:border-none border-r-gray-200 dark:border-r-gray-700 bg-teal-50 dark:bg-teal-950/20 text-teal-800 dark:text-teal-300 text-center align-middle p-1 border-t border-b border-t-teal-100 border-b-teal-100 dark:border-t-teal-900/50 dark:border-b-teal-900/50" colSpan={cell.colSpan}>
                                          <div className="flex min-h-[72px] flex-col items-center justify-center">
                                            <div className="font-bold text-[8px] sm:text-[9px] leading-tight truncate">{cell.club.clubName}</div>
                                            <div className="text-[7px] sm:text-[8px] text-teal-600 dark:text-teal-400 mt-0.5 truncate">กิจกรรมชุมนุม</div>
                                          </div>
                                        </td>
                                      );
                                    }

                                    // Active course cell
                                    const courseTitle = getCourseTitle(cell.entry.course);
                                    const courseCode = getCourseCode(cell.entry.course);
                                    const className = stripGroupLabel(cell.entry.className);
                                    const colors = getCourseColors(courseCode);
                                    return (
                                      <td key={`course-${dayKey}-${idx}`} className={`border-r last:border-none border-r-gray-200 dark:border-r-gray-700 text-center align-middle p-0 cursor-default border-t border-b ${colors.bg} ${colors.text} ${colors.border}`} colSpan={cell.colSpan}>
                                        <div className="flex min-h-[72px] flex-col items-center justify-center gap-0.5 px-1.5 py-1.5">
                                          {/* Course name */}
                                          <div className="max-w-full font-black text-[8px] sm:text-[10px] md:text-[11px] leading-tight line-clamp-2" title={courseTitle}>
                                            {courseTitle}
                                          </div>
                                          {/* Course code */}
                                          <div className="max-w-full text-[7px] sm:text-[8px] font-semibold opacity-70 truncate">
                                            {courseCode}
                                          </div>
                                          {/* Class name / Group */}
                                          <div className="max-w-full text-[7px] sm:text-[8px] font-bold text-gray-750 dark:text-gray-300 truncate">
                                            {className}
                                          </div>
                                          {/* Physical teaching room */}
                                          {cell.entry.roomDisplay && (
                                            <div className="mt-0.5 inline-flex max-w-full items-center justify-center gap-1 rounded-full bg-white/55 dark:bg-black/15 px-1.5 py-0.5 text-[7px] sm:text-[8px] font-black text-emerald-600 dark:text-emerald-400">
                                              <span className="h-1 w-1 shrink-0 rounded-full bg-emerald-400"></span>
                                              <span className="truncate">{cell.entry.roomDisplay}</span>
                                            </div>
                                          )}
                                        </div>
                                      </td>
                                    );
                                  })}
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>

                      {/* Teaching Workload Summary Table */}
                      <div className="bg-gray-50 dark:bg-gray-800/30 rounded-xl p-5 border border-gray-150 dark:border-gray-750 space-y-4">
                        <div className="flex items-center justify-between pb-3 border-b border-gray-200 dark:border-gray-700">
                          <h3 className="text-sm font-bold text-gray-800 dark:text-gray-200 flex items-center gap-2">
                            <FaBook className="text-indigo-500" /> สรุปภาระงานสอน
                          </h3>
                          <span className="text-xs text-gray-500 dark:text-gray-400">
                            รวมภาระงานสอนทั้งหมด:{' '}
                            <strong className="text-indigo-650 dark:text-indigo-400 text-sm">
                              {scheduleSummary.reduce((sum, item) => sum + item.periods, 0)} คาบ
                            </strong>
                          </span>
                        </div>
                        
                        <div className="w-full overflow-x-hidden">
                          <table className="w-full table-fixed border-collapse text-xs">
                            <thead>
                              <tr className="bg-gray-100 dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400">
                                <th className="p-2 text-left font-bold" style={{ width: '8%' }}>ที่</th>
                                <th className="p-2 text-left font-bold" style={{ width: '45%' }}>ชื่อรายวิชา / กิจกรรม</th>
                                <th className="p-2 text-left font-bold" style={{ width: '17%' }}>รหัสวิชา</th>
                                <th className="p-2 text-center font-bold" style={{ width: '15%' }}>ระดับชั้น</th>
                                <th className="p-2 text-center font-bold" style={{ width: '15%' }}>จำนวนคาบ</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                              {scheduleSummary.map((item, idx) => (
                                <tr key={idx} className="hover:bg-gray-100/50 dark:hover:bg-gray-800/30 transition-colors">
                                  <td className="p-2 font-medium text-gray-600 dark:text-gray-400">{idx + 1}</td>
                                  <td className="p-2 font-semibold text-gray-800 dark:text-gray-200 truncate">{item.title}</td>
                                  <td className="p-2 font-medium text-gray-600 dark:text-gray-400">{item.code}</td>
                                  <td className="p-2 text-center font-medium text-gray-600 dark:text-gray-400 truncate">{item.classes.join(', ')}</td>
                                  <td className="p-2 text-center font-bold text-indigo-600 dark:text-indigo-400">{item.periods} คาบ</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {activeTab === "teaching" && userRole === 'teacher' && (
                <div className="bg-white dark:bg-[#2a2b2f] rounded-2xl p-6 shadow-sm border border-gray-100 dark:border-gray-800 animate-fade-in">
                  <div className="flex justify-between items-center mb-6 pb-4 border-b border-gray-200 dark:border-gray-700">
                    <h2 className="text-lg font-semibold text-gray-800 dark:text-gray-200">รายวิชาที่สอน</h2>
                    <div className="flex items-center gap-3">
                      {/* View Mode Toggle */}
                      <div className="flex items-center bg-gray-100 dark:bg-gray-800 rounded-lg p-0.5 border border-gray-200 dark:border-gray-700">
                        <button
                          onClick={() => setViewMode('list')}
                          className={`p-1.5 rounded-md transition-all ${viewMode === 'list' ? 'bg-white dark:bg-gray-700 text-indigo-600 dark:text-indigo-400 shadow-sm font-bold' : 'text-gray-400 hover:text-gray-600 dark:hover:text-gray-300'}`}
                          title="แสดงผลแบบรายการ (List)"
                        >
                          <FaList size={13} />
                        </button>
                        <button
                          onClick={() => setViewMode('grid')}
                          className={`p-1.5 rounded-md transition-all ${viewMode === 'grid' ? 'bg-white dark:bg-gray-700 text-indigo-600 dark:text-indigo-400 shadow-sm font-bold' : 'text-gray-400 hover:text-gray-600 dark:hover:text-gray-300'}`}
                          title="แสดงผลแบบการ์ด (Grid)"
                        >
                          <FaThLarge size={13} />
                        </button>
                      </div>

                      <select
                        value={teachingSemester}
                        onChange={(e) => {
                          setTeachingSemester(e.target.value);
                          setCurrentPage(1);
                        }}
                        className="px-3 py-1.5 text-sm bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg text-gray-700 dark:text-gray-200 focus:outline-none focus:ring-2 focus:ring-indigo-500 cursor-pointer transition-colors"
                      >
                        <option value="ทั้งหมด">ภาคเรียนทั้งหมด</option>
                        <option value="1">ภาคเรียนที่ 1</option>
                        <option value="2">ภาคเรียนที่ 2</option>
                      </select>
                    </div>
                  </div>
                  {filteredTeachingCourses.length > 0 ? (
                    <>
                      {viewMode === 'list' ? (
                        <div className="space-y-4">
                          {filteredTeachingCourses.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage).map((course) => {
                            const allAssignments = course.teacherAssignments || [];
                            return (
                              <div key={course.id} className="group relative flex flex-col md:flex-row md:items-center justify-between p-5 bg-white dark:bg-[#1e1f21] rounded-2xl border border-gray-100 dark:border-gray-800 shadow-sm hover:shadow-xl hover:border-indigo-500/30 transition-all duration-300 gap-4 overflow-hidden">
                                
                                {/* Hover Gradient Accent Line */}
                                <div className="absolute top-0 left-0 h-full w-1 bg-gradient-to-b from-indigo-500 to-purple-600 opacity-0 group-hover:opacity-100 transition-opacity" />

                                {/* Left Column: Subject Info */}
                                <div className="flex items-start gap-4 min-w-0 md:w-5/12">
                                  <div className="flex-shrink-0 w-12 h-12 flex items-center justify-center bg-indigo-50 dark:bg-indigo-500/10 rounded-xl text-indigo-600 dark:text-indigo-400 group-hover:scale-110 transition-transform duration-300">
                                    <FaBook size={22} />
                                  </div>
                                  <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-2">
                                      <span className="text-[10px] font-mono font-bold px-1.5 py-0.5 rounded bg-gray-150 dark:bg-gray-800 text-gray-650 dark:text-gray-400">
                                        {course.courseCode || course.code || "-"}
                                      </span>
                                      {course.semester && (
                                        <span className="text-[9px] font-bold px-1.5 py-0.2 rounded bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/10">
                                          เทอม {course.semester}
                                        </span>
                                      )}
                                    </div>
                                    <h4 className="text-base font-bold text-gray-900 dark:text-white truncate mt-1" title={course.title || course.courseName || course.subjectName}>
                                      {course.title || course.courseName || course.subjectName || "วิชาไม่ระบุชื่อ"}
                                    </h4>
                                    <div className="flex flex-wrap gap-1.5 mt-2">
                                      {course.type && (
                                        <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-medium bg-purple-50 text-purple-700 dark:bg-purple-500/10 dark:text-purple-400">
                                          {course.type}
                                        </span>
                                      )}
                                      {course.gradeLevel && (
                                        <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-medium bg-blue-50 text-blue-700 dark:bg-blue-500/10 dark:text-blue-400">
                                          {formatGradeLevel(course.gradeLevel)}
                                        </span>
                                      )}
                                    </div>
                                  </div>
                                </div>

                                {/* Middle Column: Teachers & Rooms list */}
                                <div className="flex-1 min-w-0 md:w-4/12 border-t md:border-t-0 md:border-l border-gray-150 dark:border-gray-800 pt-3 md:pt-0 md:pl-4">
                                  <p className="text-[11px] font-bold text-gray-400 dark:text-gray-500 uppercase tracking-wider mb-2">ผู้สอนและห้องเรียน</p>
                                  <div className="space-y-1.5">
                                    {allAssignments.length > 0 ? (
                                      allAssignments.map((assign, idx) => {
                                        let teacherInfo = teacherMap?.[assign.teacherId];
                                        if (!teacherInfo && profile && assign.teacherId === profile.docId) {
                                          teacherInfo = {
                                            id: profile.docId,
                                            teacherId: profile.teacherId || '',
                                            name: `${profile.title || ''}${profile.firstName || ''} ${profile.lastName || ''}`.trim()
                                          } as any;
                                        }
                                        const isMe = assign.teacherId === profile?.docId;
                                        const firstClassId = Array.isArray(course.classId) ? course.classId[0] : course.classId;
                                        const levelLabel = getLevelLabel(firstClassId || course.gradeLevel || (assign as any).classLevels?.[0]);
                                        const classGroupName = levelLabel ? `${levelLabel}/${(assign as any).room || "1"}` : ((assign as any).room || "1");

                                        return (
                                          <div key={idx} className="flex flex-wrap items-center gap-2 text-xs">
                                            <span className={`font-bold ${isMe ? 'text-indigo-650 dark:text-indigo-400' : 'text-gray-600 dark:text-gray-400'}`}>
                                              • {teacherInfo?.name || "ไม่พบข้อมูล"}
                                            </span>
                                            <span className="inline-flex items-center justify-center text-[9px] font-bold px-1.5 py-0.2 rounded bg-indigo-100 dark:bg-indigo-950 text-indigo-700 dark:text-indigo-300">
                                              ห้อง {classGroupName}
                                            </span>
                                            {assign.roomIds?.map((rid) => {
                                              const room = rooms.find(r => r.id === rid);
                                              return room ? (
                                                <span key={rid} className="inline-flex items-center gap-1 text-[9px] font-medium px-1.5 py-0.2 rounded bg-emerald-500/10 text-emerald-650 dark:text-emerald-400">
                                                  <FaMapMarkerAlt size={8} />
                                                  {room.roomCode || room.roomName}
                                                </span>
                                              ) : null;
                                            })}
                                          </div>
                                        );
                                      })
                                    ) : (
                                      <span className="text-xs text-gray-400 italic">ไม่มีข้อมูลผู้สอน</span>
                                    )}
                                  </div>
                                </div>

                                {/* Right Column: Stats & Actions */}
                                <div className="flex flex-row md:flex-col items-center md:items-end justify-between md:justify-center gap-3 border-t md:border-t-0 md:border-l border-gray-150 dark:border-gray-800 pt-3 md:pt-0 md:pl-4 md:w-3/12 shrink-0">
                                  {/* Pill Stats */}
                                  <div className="flex flex-wrap md:flex-col gap-1.5 md:items-end">
                                    <span className="inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full bg-gray-50 dark:bg-gray-800 text-gray-650 dark:text-gray-300 border border-gray-200/50 dark:border-gray-700/50">
                                      <span className="w-1.5 h-1.5 rounded-full bg-indigo-500" />
                                      {(course.credits && Number(course.credits) > 0) ? course.credits : (course.hoursPerWeek && Number(course.hoursPerWeek) > 0 ? (course.hoursPerWeek / 2) : 0)} หน่วยกิต
                                    </span>
                                    <span className="inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full bg-gray-50 dark:bg-gray-800 text-gray-650 dark:text-gray-300 border border-gray-200/50 dark:border-gray-700/50">
                                      <span className="w-1.5 h-1.5 rounded-full bg-purple-500" />
                                      {(course.hoursPerWeek && Number(course.hoursPerWeek) > 0) ? course.hoursPerWeek : (course.credits && Number(course.credits) > 0 ? Math.round(parseFloat(String(course.credits)) * 2) : 0)} คาบ / สัปดาห์
                                    </span>
                                  </div>

                                  {/* Buttons */}
                                  <div className="flex gap-1">
                                    <button
                                      onClick={() => handleViewCourseClick(course)}
                                      className="p-2 text-gray-400 hover:text-indigo-650 dark:text-gray-500 dark:hover:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-500/10 rounded-xl transition-all"
                                      title="รายละเอียด"
                                    >
                                      <FaSearch size={14} />
                                    </button>
                                    <button
                                      onClick={() => handleEditCourseClick(course)}
                                      className="p-2 text-gray-400 hover:text-amber-600 dark:text-gray-500 dark:hover:text-amber-400 hover:bg-amber-50 dark:hover:bg-amber-500/10 rounded-xl transition-all"
                                      title="แก้ไข"
                                    >
                                      <FaEdit size={14} />
                                    </button>
                                  </div>
                                </div>

                              </div>
                            );
                          })}
                        </div>                      ) : (
                        <div className="grid grid-cols-1 md:grid-cols-2 2xl:grid-cols-3 gap-6">
                        {filteredTeachingCourses.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage).map((course) => (
                          <div key={course.id} className="group relative flex flex-col bg-white dark:bg-[#1e1f21] rounded-2xl border border-gray-100 dark:border-gray-800 shadow-sm hover:shadow-xl hover:border-indigo-500/30 transition-all duration-300 overflow-hidden">

                            {/* Card Header with Gradient Accent */}
                            <div className="absolute top-0 left-0 w-1 h-full bg-gradient-to-b from-indigo-500 to-purple-600 opacity-0 group-hover:opacity-100 transition-opacity" />

                            <div className="p-4 flex flex-col h-full">
                              {/* Top Section: Title & Actions */}
                              <div className="flex items-start justify-between mb-2">
                                <div className="flex items-center gap-3 flex-1 min-w-0">
                                  <div className="flex-shrink-0 w-10 h-10 flex items-center justify-center bg-indigo-50 dark:bg-indigo-500/10 rounded-xl text-indigo-600 dark:text-indigo-400 group-hover:scale-110 transition-transform duration-300">
                                    <FaBook size={20} />
                                  </div>
                                  <div className="flex-1 min-w-0">
                                    <p className="text-[10px] font-mono font-bold text-gray-400 dark:text-gray-500 mb-0.5">
                                      {course.courseCode || course.code || "-"}
                                    </p>
                                    <h4 className="text-sm font-bold text-gray-900 dark:text-white truncate leading-tight" title={course.title || course.courseName || course.subjectName}>
                                      {course.title || course.courseName || course.subjectName || "วิชาไม่ระบุชื่อ"}
                                    </h4>
                                  </div>
                                </div>

                                <div className="flex gap-1 ml-2">
                                  <button
                                    onClick={() => handleViewCourseClick(course)}
                                    className="p-1.5 text-gray-400 hover:text-indigo-600 dark:text-gray-500 dark:hover:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-500/10 rounded-lg transition-all"
                                    title="รายละเอียด"
                                  >
                                    <FaSearch size={12} />
                                  </button>
                                  <button
                                    onClick={() => handleEditCourseClick(course)}
                                    className="p-1.5 text-gray-400 hover:text-amber-600 dark:text-gray-500 dark:hover:text-amber-400 hover:bg-amber-50 dark:hover:bg-amber-500/10 rounded-lg transition-all"
                                    title="แก้ไข"
                                  >
                                    <FaEdit size={12} />
                                  </button>
                                </div>
                              </div>

                              {/* Badges Section - More Compact */}
                              <div className="flex flex-wrap gap-1 mb-3">
                                {course.semester && (
                                  <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-bold bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-400 border border-emerald-100 dark:border-emerald-500/20">
                                    เทอม {course.semester}
                                  </span>
                                )}
                                {course.type && (
                                  <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-bold bg-purple-50 text-purple-700 dark:bg-purple-500/10 dark:text-purple-400 border border-purple-100 dark:border-purple-500/20">
                                    {course.type}
                                  </span>
                                )}
                                {course.gradeLevel && (
                                  <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-bold bg-blue-50 text-blue-700 dark:bg-blue-500/10 dark:text-blue-400 border border-blue-100 dark:border-blue-500/20">
                                    {formatGradeLevel(course.gradeLevel)}
                                  </span>
                                )}
                              </div>

                              {/* Assignment Section - Extremely Compact */}
                              <div className="flex-1">
                                <h5 className="text-[10px] font-bold text-gray-400 dark:text-gray-500 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                                  <FaUsers className="text-indigo-400/50" /> ผู้สอน
                                </h5>

                                <div className="space-y-1.5">
                                  {course.teacherAssignments && course.teacherAssignments.length > 0 ? (
                                    (() => {
                                      const allAssignments = course.teacherAssignments;
                                      const isExpanded = expandedTeacherCourses.includes(course.id);
                                      const showTruncated = allAssignments.length > 1 && !isExpanded;
                                      const displayedAssignments = showTruncated ? allAssignments.slice(0, 1) : allAssignments;

                                      return (
                                        <>
                                          <div className="space-y-1.5">
                                            {displayedAssignments.map((assign, idx) => {
                                              let teacherInfo = teacherMap?.[assign.teacherId];
                                              if (!teacherInfo && profile && assign.teacherId === profile.docId) {
                                                teacherInfo = {
                                                  id: profile.docId,
                                                  teacherId: profile.teacherId || '',
                                                  name: `${profile.title || ''}${profile.firstName || ''} ${profile.lastName || ''}`.trim()
                                                } as any;
                                              }
                                              const isMe = assign.teacherId === profile?.docId;

                                              return (
                                                <div key={idx} className={`p-2 rounded-lg border transition-all ${isMe ? 'bg-indigo-500/5 border-indigo-200 dark:border-indigo-500/20' : 'bg-gray-50/50 dark:bg-white/5 border-transparent'}`}>
                                                  <div className="flex flex-col gap-1">
                                                    <div className="flex items-center justify-between gap-2">
                                                      <div className="flex items-center gap-1.5 min-w-0">
                                                        <div className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${isMe ? 'bg-indigo-500 shadow-[0_0_5px_rgba(99,102,241,0.5)]' : 'bg-gray-300 dark:bg-gray-600'}`} />
                                                        <span className="text-[11px] font-bold text-gray-800 dark:text-gray-200 truncate">
                                                          {teacherInfo?.name || "ไม่พบข้อมูล"}
                                                        </span>
                                                      </div>
                                                      <span className="text-[8px] font-mono text-gray-400 dark:text-gray-500">
                                                        {teacherInfo?.teacherId || assign.teacherId}
                                                      </span>
                                                    </div>

                                                    <div className="flex flex-wrap items-center gap-1.5 pl-3">
  {(() => {
    const firstClassId = Array.isArray(course.classId) ? course.classId[0] : course.classId;
    const levelLabel = getLevelLabel(firstClassId || course.gradeLevel || (assign as any).classLevels?.[0]);
    const classGroupName = levelLabel ? `${levelLabel}/${(assign as any).room || "1"}` : ((assign as any).room || "1");

    return (
      <>
        <span className="text-[9.5px] font-black px-2 py-0.5 rounded bg-indigo-600 dark:bg-indigo-500 text-white leading-none shadow-sm flex items-center shrink-0">
          {classGroupName}
        </span>

        {assign.roomIds?.map((rid: string) => {
          const room = rooms.find(r => r.id === rid);
          return room ? (
            <span key={rid} className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-emerald-500/10 dark:bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 border border-emerald-500/10 dark:border-emerald-500/20 leading-none flex items-center gap-1 shrink-0">
              <FaMapMarkerAlt size={8} className="text-emerald-500" />
              {room.roomCode || room.roomName}
            </span>
          ) : null;
        })}
      </>
    );
  })()}
</div>
                                                  </div>
                                                </div>
                                              );
                                            })}
                                          </div>
                                          {allAssignments.length > 1 && (
                                            <button
                                              onClick={() => toggleTeacherExpand(course.id)}
                                              className="mt-1.5 w-full flex items-center justify-center gap-1 py-1 text-[9.5px] font-bold text-indigo-600 dark:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-500/10 rounded-md transition-colors border border-dashed border-indigo-200 dark:border-indigo-500/30"
                                            >
                                              {isExpanded ? (
                                                <>แสดงน้อยลง <FaChevronUp size={8} /></>
                                              ) : (
                                                <>ครูท่านอื่นอีก {allAssignments.length - 1} ท่าน <FaChevronDown size={8} /></>
                                              )}
                                            </button>
                                          )}
                                        </>
                                      );
                                    })()
                                  ) : (
                                    <div className="text-center py-2 bg-gray-50/50 dark:bg-white/5 rounded-lg border border-dashed border-gray-200 dark:border-gray-700">
                                      <p className="text-[9px] text-gray-400 italic">ไม่มีข้อมูล</p>
                                    </div>
                                  )}
                                </div>
                              </div>

                              {/* Bottom Stats Badge - Integrated */}
                              <div className="mt-3 pt-2 border-t border-gray-50 dark:border-gray-800 flex justify-between items-center text-[9.5px]">
                                <div className="flex gap-2.5 text-gray-500">
                                  <span><b className="text-gray-700 dark:text-gray-300">{(course.credits && Number(course.credits) > 0) ? course.credits : (course.hoursPerWeek && Number(course.hoursPerWeek) > 0 ? (course.hoursPerWeek / 2) : 0)}</b> นก.</span>
                                  <span><b className="text-gray-700 dark:text-gray-300">{(course.hoursPerWeek && Number(course.hoursPerWeek) > 0) ? course.hoursPerWeek : (course.credits && Number(course.credits) > 0 ? Math.round(parseFloat(String(course.credits)) * 2) : 0)}</b> คาบ</span>
                                </div>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                      )}

                      {filteredTeachingCourses.length > itemsPerPage && (
                        <div className="flex justify-center items-center mt-8 gap-2">
                          <button
                            onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))}
                            disabled={currentPage === 1}
                            className="px-3 py-2 text-sm font-medium rounded-lg bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                          >
                            ก่อนหน้า
                          </button>

                          <div className="flex gap-1 flex-wrap justify-center">
                            {Array.from({ length: Math.ceil(filteredTeachingCourses.length / itemsPerPage) }, (_, i) => i + 1).map((page) => (
                              <button
                                key={page}
                                onClick={() => setCurrentPage(page)}
                                className={`w-8 h-8 sm:w-10 sm:h-10 flex items-center justify-center text-sm font-medium rounded-lg transition-colors ${currentPage === page
                                  ? 'bg-indigo-600 text-white shadow-sm'
                                  : 'bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700'
                                  }`}
                              >
                                {page}
                              </button>
                            ))}
                          </div>

                          <button
                            onClick={() => setCurrentPage(prev => Math.min(prev + 1, Math.ceil(filteredTeachingCourses.length / itemsPerPage)))}
                            disabled={currentPage === Math.ceil(filteredTeachingCourses.length / itemsPerPage)}
                            className="px-3 py-2 text-sm font-medium rounded-lg bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                          >
                            ถัดไป
                          </button>
                        </div>
                      )}
                    </>
                  ) : (
                    <div className="text-center py-8 bg-gray-50 dark:bg-gray-800/30 rounded-xl border border-dashed border-gray-300 dark:border-gray-700">
                      <FaChalkboard className="mx-auto h-10 w-10 text-gray-400 dark:text-gray-600 mb-2" />
                      <p className="text-sm text-gray-500 dark:text-gray-400">ยังไม่มีข้อมูลรายวิชาที่สอน{teachingSemester === "ทั้งหมด" ? "" : ` สำหรับภาคเรียนที่ ${teachingSemester}`}</p>
                    </div>
                  )}

                  {/* View Course Detail Modal */}
                  {isViewModalOpen && (
                    <ViewCourseDetailModal
                      isOpen={isViewModalOpen}
                      onClose={() => setIsViewModalOpen(false)}
                      course={editingCourse as any}
                      teachers={teachersList}
                      periodSettings={periodSettings}
                      availableClassOptions={availableClassOptions}
                      schoolId={profile?.schoolId}
                    />
                  )}

                  {/* Edit Course Modal */}
                  {isEditModalOpen && (
                    <EditCourseModal
                      isOpen={isEditModalOpen}
                      onClose={() => setIsEditModalOpen(false)}
                      course={editingCourse as any}
                      onSave={handleSaveCourse}
                      teachers={teachersList}
                      periodSettings={periodSettings}
                      availableClassOptions={availableClassOptions}
                      schoolId={profile?.schoolId}
                    />
                  )}
                </div>
              )}

              {activeTab === "health_welfare" && userRole === 'student' && (
                <div className="bg-white dark:bg-[#2a2b2f] rounded-2xl p-6 shadow-sm border border-gray-100 dark:border-gray-800 animate-fade-in space-y-8">
                  <div>
                    <h3 className="text-md font-bold mb-4 text-indigo-600 dark:text-indigo-400 flex items-center gap-2">
                      <FaHeartbeat /> ข้อมูลสุขภาพ
                    </h3>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                      <DetailField label="น้ำหนัก" value={`${profile.weight || '-'} กก.`} />
                      <DetailField label="ส่วนสูง" value={`${profile.height || '-'} ซม.`} />
                      <DetailField label="ประเภทความพิการ" value={profile.disabilityType} />
                    </div>
                  </div>
                  <div className="pt-6 border-t border-gray-100 dark:border-gray-700">
                    <h3 className="text-md font-bold mb-4 text-indigo-600 dark:text-indigo-400">สวัสดิการและความด้อยโอกาส</h3>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <DetailField label="ระดับความยากจน" value={profile.disadvantageType} />
                      <DetailField label="การพักนอน" value={profile.staysAtSchool} />
                    </div>
                  </div>
                </div>
              )}

              {activeTab === "grade_flags" && (userRole === 'student' || userRole === 'user') && (() => {
                const flagKeyId = (flag: FlaggedCourse) => flag.flagKind === 'course' ? flag.courseId : (flag.activityDocId || flag.courseId);
                const requestDedupKey = (flagKind: string, idValue: string, academicYear: string, semester: string) =>
                  `${flagKind}|${idValue}|${academicYear}|${semester}`;
                const total = gradeFlags?.flags?.length || 0;
                const resolvedCount = gradeFlags?.flags?.filter(flag => {
                  const key = requestDedupKey(flag.flagKind, flagKeyId(flag), flag.academicYear, flag.semester);
                  return gradeFlagsRequests[key]?.status === 'resolved';
                }).length || 0;
                const pendingCount = gradeFlags?.flags?.filter(flag => {
                  const key = requestDedupKey(flag.flagKind, flagKeyId(flag), flag.academicYear, flag.semester);
                  return gradeFlagsRequests[key]?.status === 'pending';
                }).length || 0;
                const windowOpen = isRemediationWindowOpen(gradeFlagsWindowConfig);

                return (
                  <div className="space-y-4 animate-fade-in">
                    {/* Header */}
                    <div className="bg-white dark:bg-[#2a2b2f] rounded-2xl p-5 shadow-sm border border-gray-100 dark:border-gray-800">
                      <div className="flex items-center justify-between mb-4">
                        <div className="flex items-center gap-2 text-indigo-600 dark:text-indigo-400">
                          <LucideAlertTriangle size={20} />
                          <h3 className="text-md font-bold">ผลการเรียนที่ติด 0/ร/มส/มผ</h3>
                      </div>
                      {localStorage.getItem('currentUserType') !== 'parent' && (
                        <button
                          onClick={() => navigate('/my-grade-flags')}
                          className="text-xs font-bold text-indigo-600 dark:text-indigo-400 hover:underline flex items-center gap-1"
                        >
                          ไปยื่นคำร้องแก้ตัว <FaChevronRight size={10} />
                        </button>
                      )}
                      </div>

                      {/* Summary Stats */}
                      <div className="grid grid-cols-3 gap-3">
                        <div className="rounded-xl bg-slate-50 dark:bg-[#202124] border border-slate-200 dark:border-slate-800 p-3 flex items-center gap-3">
                          <div className="w-8 h-8 rounded-lg bg-red-50 dark:bg-red-500/10 flex items-center justify-center shrink-0">
                            <LucideAlertTriangle size={16} className="text-red-600 dark:text-red-400" />
                          </div>
                          <div>
                            <p className="text-[9px] font-bold text-slate-400 uppercase">ทั้งหมด</p>
                            <p className="text-xl font-black text-slate-800 dark:text-white leading-none mt-0.5">{total}</p>
                          </div>
                        </div>
                        <div className="rounded-xl bg-slate-50 dark:bg-[#202124] border border-slate-200 dark:border-slate-800 p-3 flex items-center gap-3">
                          <div className="w-8 h-8 rounded-lg bg-amber-50 dark:bg-amber-500/10 flex items-center justify-center shrink-0">
                            <Clock size={16} className="text-amber-600 dark:text-amber-400" />
                          </div>
                          <div>
                            <p className="text-[9px] font-bold text-slate-400 uppercase">รอดำเนินการ</p>
                            <p className="text-xl font-black text-amber-600 dark:text-amber-400 leading-none mt-0.5">{pendingCount}</p>
                          </div>
                        </div>
                        <div className="rounded-xl bg-slate-50 dark:bg-[#202124] border border-slate-200 dark:border-slate-800 p-3 flex items-center gap-3">
                          <div className="w-8 h-8 rounded-lg bg-emerald-50 dark:bg-emerald-500/10 flex items-center justify-center shrink-0">
                            <CheckCircle2 size={16} className="text-emerald-600 dark:text-emerald-400" />
                          </div>
                          <div>
                            <p className="text-[9px] font-bold text-slate-400 uppercase">แก้ตัวสำเร็จ</p>
                            <p className="text-xl font-black text-emerald-600 dark:text-emerald-400 leading-none mt-0.5">{resolvedCount}</p>
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Window Closed Warning */}
                    {!windowOpen && (
                      <div className="bg-amber-50 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-500/20 rounded-xl p-4 flex items-start gap-3 text-amber-800 dark:text-amber-400">
                        <AlertCircle className="h-5 w-5 text-amber-500 shrink-0 mt-0.5" />
                        <div>
                          <h3 className="font-black text-sm">ขณะนี้ระบบปิดรับคำร้องขอแก้ตัว</h3>
                          <p className="text-xs font-semibold mt-0.5 opacity-90">คุณยังดูรายการผลการเรียนที่ต้องแก้ไขได้ แต่จะไม่สามารถยื่นส่งคำร้องใหม่ในเวลานี้</p>
                        </div>
                      </div>
                    )}

                    {/* Flag List */}
                    <div className="bg-white dark:bg-[#2a2b2f] rounded-2xl shadow-sm border border-gray-100 dark:border-gray-800 overflow-hidden">
                      {gradeFlagsLoading ? (
                        <div className="p-8 flex flex-col items-center justify-center space-y-3">
                          <RefreshCw size={24} className="animate-spin text-indigo-500" />
                          <p className="text-slate-400 text-xs font-black">กำลังโหลดข้อมูลผลการเรียน...</p>
                        </div>
                      ) : gradeFlagsError ? (
                        <div className="p-4 flex items-start gap-3 text-rose-800 dark:text-rose-400">
                          <XCircle className="h-5 w-5 text-rose-500 shrink-0 mt-0.5" />
                          <div>
                            <h3 className="font-black text-sm">พบข้อผิดพลาด</h3>
                            <p className="text-xs font-semibold mt-0.5">{gradeFlagsError}</p>
                          </div>
                        </div>
                      ) : !gradeFlags || gradeFlags.flags.length === 0 ? (
                        <div className="p-12 flex flex-col items-center justify-center text-center">
                          <div className="w-14 h-14 rounded-full bg-emerald-50 dark:bg-emerald-500/10 flex items-center justify-center mb-3">
                            <CheckCircle2 size={26} className="text-emerald-500" />
                          </div>
                          <h3 className="font-black text-slate-800 dark:text-white text-sm">ไม่พบผลการเรียนที่ต้องแก้ไข</h3>
                          <p className="text-slate-400/80 text-xs mt-1 max-w-sm">
                            ยินดีด้วย! ไม่มีผลการเรียนที่ติด 0, ร, มส, หรือ มผ ในระบบในขณะนี้
                          </p>
                        </div>
                      ) : (
                        <>
                          {/* Table header */}
                          <div className="flex items-center justify-between px-5 py-3 border-b border-slate-200 dark:border-slate-700 bg-slate-50/50 dark:bg-white/[0.02]">
                            <div className="flex items-center gap-2 text-xs font-black text-slate-500 dark:text-slate-400">
                              <ClipboardList size={15} className="text-indigo-500" />
                              <span>วิชา / กิจกรรมที่ต้องแก้ไข</span>
                            </div>
                            <span className="text-[10px] font-black px-2.5 py-1 rounded-lg bg-indigo-50 dark:bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border border-indigo-100 dark:border-indigo-500/20">
                              {total} รายการ
                            </span>
                          </div>

                          {/* Rows */}
                          <div className="divide-y divide-slate-200 dark:divide-slate-700">
                            {gradeFlags.flags.map((flag, idx) => {
                              const key = requestDedupKey(flag.flagKind, flagKeyId(flag), flag.academicYear, flag.semester);
                              const req = gradeFlagsRequests[key];
                              const rowBg = req?.status === 'resolved'
                                ? 'border-l-4 border-l-emerald-500 bg-emerald-50/10 dark:bg-emerald-500/[0.01]'
                                : req?.status === 'pending'
                                  ? 'border-l-4 border-l-amber-500 bg-amber-50/10 dark:bg-amber-500/[0.01]'
                                  : 'border-l-4 border-l-slate-200 dark:border-l-slate-700';

                              return (
                                <div
                                  key={`${key}-${idx}`}
                                  className={`px-4 py-3.5 transition-colors ${rowBg} hover:bg-slate-50/60 dark:hover:bg-white/[0.02]`}
                                >
                                  <div className="flex items-start justify-between gap-3">
                                    <div className="min-w-0 flex-1">
                                      <p className="font-black text-sm text-slate-900 dark:text-white leading-tight">
                                        {flag.courseTitle || flag.courseCode}
                                      </p>
                                      <div className="flex flex-wrap items-center gap-1.5 mt-1.5">
                                        <span className="inline-flex items-center px-2 py-0.5 rounded-md bg-indigo-50 dark:bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border border-indigo-100 dark:border-indigo-500/20 text-[10px] font-black">
                                          {flag.courseCode}
                                        </span>
                                        <span className="inline-flex items-center px-2 py-0.5 rounded-md bg-slate-100 dark:bg-slate-700/60 text-slate-500 dark:text-slate-400 text-[10px] font-bold">
                                          ปีการศึกษา {flag.academicYear}/{flag.semester}
                                        </span>
                                        {flag.teacherName && flag.teacherName !== '-' && (
                                          <span className="inline-flex items-center px-2 py-0.5 rounded-md bg-slate-100 dark:bg-slate-700/60 text-slate-500 dark:text-slate-400 text-[10px] font-bold">
                                            {flag.teacherName}
                                          </span>
                                        )}
                                      </div>
                                    </div>
                                    <div className="flex items-center gap-2 shrink-0">
                                      <span className="inline-flex items-center justify-center px-2.5 py-1 rounded-lg bg-red-50 dark:bg-red-500/10 text-red-600 dark:text-red-400 border border-red-100 dark:border-red-500/20 text-xs font-black">
                                        {flag.grade}
                                      </span>
                                      {req ? (
                                        req.status === 'resolved' ? (
                                          <span className="inline-flex items-center gap-1 text-[11px] font-black px-3 py-1.5 rounded-xl bg-emerald-500/10 text-emerald-600 dark:bg-emerald-500/20 dark:text-emerald-400">
                                            <CheckCircle2 size={12} /> แก้ตัวสำเร็จ{req.newResult ? ` (${req.newResult})` : ''}
                                          </span>
                                        ) : (
                                          <span className="inline-flex items-center gap-1 text-[11px] font-black px-3 py-1.5 rounded-xl bg-amber-500/10 text-amber-600 dark:bg-amber-500/20 dark:text-amber-400">
                                            <Clock size={12} /> รอครูบันทึกผล
                                          </span>
                                        )
                                      ) : (
                                        <span className="text-[11px] font-bold text-slate-400">
                                          {windowOpen ? 'ยังไม่ยื่น' : 'ปิดรับคำร้อง'}
                                        </span>
                                      )}
                                    </div>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </>
                      )}
                    </div>

                    {/* Link to full page */}
                    {localStorage.getItem('currentUserType') !== 'parent' && (
                      <div className="text-center">
                        <button
                          onClick={() => navigate('/my-grade-flags')}
                          className="bg-indigo-600 hover:bg-indigo-700 text-white px-5 py-2.5 rounded-xl text-sm font-bold transition-colors inline-flex items-center gap-2"
                        >
                          ไปที่หน้ายื่นคำร้องขอแก้ตัว <FaChevronRight size={12} />
                        </button>
                      </div>
                    )}
                  </div>
                );
              })()}

              {activeTab === "official_travel" && (
                <div className="bg-white dark:bg-[#2a2b2f] rounded-2xl p-6 shadow-sm border border-gray-100 dark:border-gray-800 animate-fade-in">
                  <div className="flex justify-between items-center mb-6 pb-4 border-b border-gray-200 dark:border-gray-700">
                    <h2 className="text-lg font-semibold text-gray-800 dark:text-gray-200">ประวัติการขอ{officialTravelLabel}</h2>
                    <button
                      onClick={() => navigate(`/school/${profile.schoolId}/official-travel-request?type=${userRole === 'student' ? 'student' : 'teacher'}`)}
                      className="bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors flex items-center gap-2"
                    >
                      <FaPlane /> สร้างคำขอใหม่
                    </button>
                  </div>

                  {officialTravelRequests.length > 0 ? (
                    <>
                      {/* Mobile: การ์ดเรียงลง ไม่ต้องเลื่อนแนวนอน */}
                      <div className="sm:hidden space-y-3">
                        {officialTravelRequests.map((req) => (
                          <div key={req.id} className="rounded-xl border border-gray-100 dark:border-gray-800 bg-gray-50 dark:bg-gray-800/50 p-4">
                            <div className="flex items-start justify-between gap-2 mb-2">
                              <div className="flex flex-col">
                                <span className="text-sm font-medium text-gray-900 dark:text-gray-100">{formatDate(req.startDate)}</span>
                                <span className="text-xs text-gray-500 dark:text-gray-400">ถึง {formatDate(req.endDate)}</span>
                              </div>
                              <span className={`inline-flex shrink-0 px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-wider ${req.status === 'approved' ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-400 border border-emerald-500/20' :
                                req.status === 'rejected' ? 'bg-red-100 text-red-700 dark:bg-red-500/10 dark:text-red-400 border border-red-500/20' :
                                  'bg-amber-100 text-amber-700 dark:bg-amber-500/10 dark:text-amber-400 border border-amber-500/20'
                                }`}>
                                {req.status === 'approved' ? 'อนุมัติ' : req.status === 'rejected' ? 'ไม่อนุมัติ' : 'รอพิจารณา'}
                              </span>
                            </div>
                            <p className="text-sm text-gray-900 dark:text-gray-100 font-bold">{req.subject}</p>
                            <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">{req.location}</p>
                            <div className="flex justify-end mt-3">
                              <OfficialTravelPdfButton
                                data={req}
                                schoolName={schoolInfo.schoolName}
                                schoolAffiliation={schoolInfo.affiliation}
                                directorName={schoolInfo.directorName}
                                deputyName={schoolInfo.deputyName}
                                personnelHeadName={schoolInfo.personnelHeadName}
                                personnelHeadRoleLabel={schoolInfo.personnelHeadRoleLabel}
                              />
                            </div>
                          </div>
                        ))}
                      </div>

                      {/* Desktop: ตาราง */}
                      <div className="hidden sm:block overflow-x-auto">
                        <table className="w-full text-left">
                          <thead>
                            <tr className="bg-gray-50 dark:bg-gray-800/50 text-gray-600 dark:text-gray-300 text-xs uppercase tracking-wider font-bold">
                              <th className="px-4 py-4 rounded-l-xl w-[20%]">วันที่เดินทาง</th>
                              <th className="px-4 py-4 w-[25%]">เรื่อง</th>
                              <th className="px-4 py-4 w-[25%]">สถานที่</th>
                              <th className="px-4 py-4 text-center w-[10%]">สถานะ</th>
                              <th className="px-4 py-4 rounded-r-xl text-right w-[20%]">การจัดการ</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                            {officialTravelRequests.map((req) => (
                              <tr key={req.id} className="group hover:bg-indigo-50/30 dark:hover:bg-indigo-500/5 transition-all">
                                <td className="px-4 py-5 text-sm text-gray-600 dark:text-gray-400 whitespace-nowrap">
                                  <div className="flex flex-col">
                                    <span className="font-medium text-gray-900 dark:text-gray-100">{formatDate(req.startDate)}</span>
                                    <span className="text-xs opacity-60">ถึง {formatDate(req.endDate)}</span>
                                  </div>
                                </td>
                                <td className="px-4 py-5">
                                  <p className="text-sm text-gray-900 dark:text-gray-100 font-bold leading-relaxed line-clamp-2" title={req.subject}>
                                    {req.subject}
                                  </p>
                                </td>
                                <td className="px-4 py-5">
                                  <p className="text-sm text-gray-500 dark:text-gray-400 leading-relaxed line-clamp-2" title={req.location}>
                                    {req.location}
                                  </p>
                                </td>
                                <td className="px-4 py-5 text-center">
                                  <span className={`inline-flex px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-wider ${req.status === 'approved' ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-400 border border-emerald-500/20' :
                                    req.status === 'rejected' ? 'bg-red-100 text-red-700 dark:bg-red-500/10 dark:text-red-400 border border-red-500/20' :
                                      'bg-amber-100 text-amber-700 dark:bg-amber-500/10 dark:text-amber-400 border border-amber-500/20'
                                    }`}>
                                    {req.status === 'approved' ? 'อนุมัติ' : req.status === 'rejected' ? 'ไม่อนุมัติ' : 'รอพิจารณา'}
                                  </span>
                                </td>
                                <td className="px-4 py-5 text-right">
                                  <div className="flex justify-end opacity-80 group-hover:opacity-100 transition-opacity">
                                    <OfficialTravelPdfButton
                                      data={req}
                                      schoolName={schoolInfo.schoolName}
                                      schoolAffiliation={schoolInfo.affiliation}
                                      directorName={schoolInfo.directorName}
                                      deputyName={schoolInfo.deputyName}
                                      personnelHeadName={schoolInfo.personnelHeadName}
                                      personnelHeadRoleLabel={schoolInfo.personnelHeadRoleLabel}
                                    />
                                  </div>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </>
                  ) : (
                    <div className="text-center py-12 text-gray-500 dark:text-gray-400">
                      <FaPlane className="mx-auto text-4xl mb-3 opacity-20" />
                      <p>ยังไม่มีประวัติการขอ{officialTravelLabel}</p>
                    </div>
                  )}
                </div>
              )}

              {activeTab === "attendance" && (userRole === 'teacher' || userRole === 'student') && (
                <div className="animate-fade-in space-y-6">
                  <InfoCard title={`สถิติการลงเวลา (ปีการศึกษา ${academicYear || getCurrentThaiYear()})`}>
                    {yearSummaryFetched && (
                      <div className="flex items-center gap-2 mb-3 text-xs text-gray-500 dark:text-gray-400">
                        <span className="inline-flex items-center gap-1 px-2 py-1 bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-400 rounded-lg border border-green-100 dark:border-green-800 font-medium">
                          ✓ ข้อมูลชุดเดียวกับที่แจ้งเตือนทาง LINE
                        </span>
                      </div>
                    )}
                    {!yearSummaryFetched ? (
                      <div className="flex lg:grid lg:grid-cols-6 gap-2 sm:gap-3 pb-4">
                        {Array.from({ length: 6 }).map((_, i) => (
                          <div key={i} className="flex-shrink-0 lg:w-full w-24 sm:w-28 min-h-[70px] sm:min-h-[85px] rounded-xl border border-gray-100 dark:border-gray-700 bg-gray-100 dark:bg-gray-800 animate-pulse" />
                        ))}
                      </div>
                    ) : (
                    <div className="flex lg:grid lg:grid-cols-6 gap-2 sm:gap-3 table-responsive pb-4 scrollbar-hide -mx-2 px-2 lg:mx-0 lg:px-0">
                      <div
                        onClick={() => { setSelectedStatus(selectedStatus === 'present' ? null : 'present'); setAttendanceCurrentPage(1); }}
                        className={`flex-shrink-0 lg:w-full w-24 sm:w-28 min-h-[70px] sm:min-h-[85px] flex flex-col items-center justify-center p-2 rounded-xl border cursor-pointer transition-all ${selectedStatus === 'present' ? 'ring-2 ring-green-500 bg-green-100 dark:bg-green-900/40 border-green-500' : 'bg-green-50 dark:bg-green-900/20 border-green-100 dark:border-green-800 hover:bg-green-100 dark:hover:bg-green-900/30'}`}
                      >
                        <div className="text-lg sm:text-xl font-bold text-green-600 dark:text-green-400">{stats.present || 0}</div>
                        <div className="text-[9px] sm:text-[10px] text-gray-500 dark:text-gray-400 text-center leading-tight">มาปกติ</div>
                      </div>
                      <div
                        onClick={() => { setSelectedStatus(selectedStatus === 'late' ? null : 'late'); setAttendanceCurrentPage(1); }}
                        className={`flex-shrink-0 lg:w-full w-24 sm:w-28 min-h-[70px] sm:min-h-[85px] flex flex-col items-center justify-center p-2 rounded-xl border cursor-pointer transition-all ${selectedStatus === 'late' ? 'ring-2 ring-yellow-500 bg-yellow-100 dark:bg-yellow-900/40 border-yellow-500' : 'bg-yellow-50 dark:bg-yellow-900/20 border-yellow-100 dark:border-yellow-800 hover:bg-yellow-100 dark:hover:bg-yellow-900/30'}`}
                      >
                        <div className="text-lg sm:text-xl font-bold text-yellow-600 dark:text-yellow-400">{stats.late || 0}</div>
                        <div className="text-[9px] sm:text-[10px] text-gray-500 dark:text-gray-400 text-center leading-tight">สาย</div>
                      </div>
                      <div
                        onClick={() => { setSelectedStatus(selectedStatus === 'leave' ? null : 'leave'); setAttendanceCurrentPage(1); }}
                        className={`flex-shrink-0 lg:w-full w-24 sm:w-28 min-h-[70px] sm:min-h-[85px] flex flex-col items-center justify-center p-2 rounded-xl border cursor-pointer transition-all ${selectedStatus === 'leave' ? 'ring-2 ring-blue-500 bg-blue-100 dark:bg-blue-900/40 border-blue-500' : 'bg-blue-50 dark:bg-blue-900/20 border-blue-100 dark:border-blue-800 hover:bg-blue-100 dark:hover:bg-blue-900/30'}`}
                      >
                        <div className="text-lg sm:text-xl font-bold text-blue-600 dark:text-blue-400">{stats.leave || 0}</div>
                        <div className="text-[9px] sm:text-[10px] text-gray-500 dark:text-gray-400 text-center leading-tight">ลา</div>
                      </div>
                      <div
                        onClick={() => { setSelectedStatus(selectedStatus === 'absent' ? null : 'absent'); setAttendanceCurrentPage(1); }}
                        className={`flex-shrink-0 lg:w-full w-24 sm:w-28 min-h-[70px] sm:min-h-[85px] flex flex-col items-center justify-center p-2 rounded-xl border cursor-pointer transition-all ${selectedStatus === 'absent' ? 'ring-2 ring-red-500 bg-red-100 dark:bg-red-900/40 border-red-500' : 'bg-red-50 dark:bg-red-900/20 border-red-100 dark:border-red-800 hover:bg-red-100 dark:hover:bg-red-900/30'}`}
                      >
                        <div className="text-lg sm:text-xl font-bold text-red-600 dark:text-red-400">{stats.absent || 0}</div>
                        <div className="text-[9px] sm:text-[10px] text-gray-500 dark:text-gray-400 text-center leading-tight">ขาด</div>
                      </div>
                      <div
                        onClick={() => { setSelectedStatus(selectedStatus === 'noCheckout' ? null : 'noCheckout'); setAttendanceCurrentPage(1); }}
                        className={`flex-shrink-0 lg:w-full w-24 sm:w-28 min-h-[70px] sm:min-h-[85px] flex flex-col items-center justify-center p-2 rounded-xl border cursor-pointer transition-all ${selectedStatus === 'noCheckout' ? 'ring-2 ring-purple-500 bg-purple-100 dark:bg-purple-900/40 border-purple-500' : 'bg-purple-50 dark:bg-purple-900/20 border-purple-100 dark:border-purple-800 hover:bg-purple-100 dark:hover:bg-purple-900/30'}`}
                      >
                        <div className="text-lg sm:text-xl font-bold text-purple-600 dark:text-purple-400">{stats.noCheckout || 0}</div>
                        <div className="text-[9px] sm:text-[10px] text-gray-500 dark:text-gray-400 text-center leading-tight">ไม่ลงเวลาออก</div>
                      </div>
                      <div
                        onClick={() => { setSelectedStatus(selectedStatus === 'officialTravel' ? null : 'officialTravel'); setAttendanceCurrentPage(1); }}
                        className={`flex-shrink-0 lg:w-full w-24 sm:w-28 min-h-[70px] sm:min-h-[85px] flex flex-col items-center justify-center p-2 rounded-xl border cursor-pointer transition-all ${selectedStatus === 'officialTravel' ? 'ring-2 ring-indigo-500 bg-indigo-100 dark:bg-indigo-900/40 border-indigo-500' : 'bg-indigo-50 dark:bg-indigo-900/20 border-indigo-100 dark:border-indigo-800 hover:bg-indigo-100 dark:hover:bg-indigo-900/30'}`}
                      >
                        <div className="text-lg sm:text-xl font-bold text-indigo-600 dark:text-indigo-400">{stats.official_travel_days || 0}</div>
                        <div className="text-[9px] sm:text-[10px] text-gray-500 dark:text-gray-400 text-center leading-tight">{officialTravelLabel}</div>
                      </div>
                    </div>
                    )}
                  </InfoCard>

                  {yearSummaryFetched && attendanceChartData.some(d => d.value > 0) && (
                    <div className="mt-8 grid grid-cols-1 lg:grid-cols-2 gap-6">
                      <div className="h-80 bg-gray-50 dark:bg-gray-800/50 rounded-xl p-4 border border-gray-100 dark:border-gray-700 flex flex-col items-center justify-center overflow-hidden">
                        <h3 className="text-center text-sm font-medium mb-4 text-gray-500 dark:text-gray-400 w-full">สัดส่วนการลงเวลา</h3>
                        <Chart
                          chartType="PieChart"
                          data={googleAttendanceData}
                          options={getPieOptions(attendanceChartData)}
                          width={"100%"}
                          height={"100%"}
                        />
                        <div className="mt-4 flex flex-wrap justify-center gap-x-4 gap-y-2 px-2">
                          {attendanceChartData.map((item, index) => (
                            <div key={index} className="flex items-center gap-1.5">
                              <span className="flex-shrink-0 w-3 h-3 rounded-full shadow-sm" style={{ backgroundColor: item.color }}></span>
                              <span className="text-xs font-medium text-gray-600 dark:text-gray-300">{item.name}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                      <div className="h-80 bg-gray-50 dark:bg-gray-800/50 rounded-xl p-4 border border-gray-100 dark:border-gray-700">
                        <h3 className="text-center text-sm font-medium mb-4 text-gray-500 dark:text-gray-400">จำนวนครั้งการลงเวลา</h3>
                        <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={250} initialDimension={{ width: 1, height: 1 }}>
                          <BarChart data={attendanceChartData}>
                            <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                            <XAxis dataKey="name" fontSize={12} stroke={isDarkMode ? "#9ca3af" : "#4b5563"} />
                            <YAxis allowDecimals={false} stroke={isDarkMode ? "#9ca3af" : "#4b5563"} />
                            <RechartsTooltip
                              cursor={{ fill: isDarkMode ? '#374151' : '#f3f4f6' }}
                              contentStyle={{ backgroundColor: isDarkMode ? '#1f2937' : '#fff', borderColor: isDarkMode ? '#374151' : '#e5e7eb', color: isDarkMode ? '#fff' : '#000' }}
                            />
                            <Bar dataKey="value" name="จำนวนครั้ง" radius={[4, 4, 0, 0]}>
                              {attendanceChartData.map((entry, index) => (
                                <Cell key={`cell-${index}`} fill={entry.color} />
                              ))}
                            </Bar>
                          </BarChart>
                        </ResponsiveContainer>
                      </div>

                      {attendanceTrendData.length > 0 && (
                        <div className="col-span-1 lg:col-span-2 mt-2 bg-white dark:bg-[#2a2b2f] rounded-2xl p-5 sm:p-6 shadow-sm dark:shadow-none border border-gray-100 dark:border-gray-800">
                          <div className="flex items-center justify-between gap-3 mb-5 flex-wrap">
                            <div className="flex items-center gap-3">
                              <span className="w-1.5 h-6 rounded-full bg-gradient-to-b from-indigo-500 to-purple-500" />
                              <div>
                                <h3 className="text-base font-semibold text-gray-800 dark:text-gray-100">แนวโน้มเวลาการมาทำงาน</h3>
                                <p className="text-xs text-gray-400 dark:text-gray-500">
                                  {trendMonthFilter === 'all' ? '30 วันล่าสุด' : (trendMonths.find(m => m.key === trendMonthFilter)?.label || trendMonthFilter)}
                                </p>
                              </div>
                            </div>
                            <div className="flex items-center gap-4 pl-4">
                              <div className="flex items-center gap-1.5">
                                <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: '#6366f1' }} />
                                <span className="text-xs font-medium text-gray-500 dark:text-gray-400">เวลามา</span>
                              </div>
                              <div className="flex items-center gap-1.5">
                                <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: '#f59e0b' }} />
                                <span className="text-xs font-medium text-gray-500 dark:text-gray-400">เวลากลับ</span>
                              </div>
                              <select
                                value={trendMonthFilter}
                                onChange={(e) => setTrendMonthFilter(e.target.value)}
                                className="text-xs font-medium bg-gray-50 dark:bg-gray-800 text-gray-600 dark:text-gray-300 border border-gray-200 dark:border-gray-700 rounded-lg px-2 py-1 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                              >
                                <option value="all">30 วันล่าสุด</option>
                                {trendMonths.map(m => (
                                  <option key={m.key} value={m.key}>{m.label}</option>
                                ))}
                              </select>
                            </div>
                          </div>
                          <div className="h-80 w-full">
                            <ResponsiveContainer width="100%" height="100%" minWidth={0} initialDimension={{ width: 1, height: 1 }}>
                              <ComposedChart data={attendanceTrendData} margin={{ top: 5, right: 10, left: -10, bottom: 0 }}>
                                <defs>
                                  <linearGradient id="attendanceTrendGradient" x1="0" y1="0" x2="0" y2="1">
                                    <stop offset="5%" stopColor="#6366f1" stopOpacity={0.35} />
                                    <stop offset="95%" stopColor="#6366f1" stopOpacity={0} />
                                  </linearGradient>
                                </defs>
                                <CartesianGrid strokeDasharray="3 3" opacity={0.2} vertical={false} />
                                <XAxis dataKey="date" fontSize={12} tickFormatter={(val) => val.split('-').slice(1).join('/')} stroke={isDarkMode ? "#9ca3af" : "#4b5563"} axisLine={false} tickLine={false} />
                                <YAxis
                                  domain={['dataMin - 0.2', 'dataMax + 0.2']}
                                  tickFormatter={(val) => {
                                    const h = Math.floor(val);
                                    const m = Math.round((val - h) * 60);
                                    return `${h}:${m.toString().padStart(2, '0')}`;
                                  }}
                                  stroke={isDarkMode ? "#9ca3af" : "#4b5563"}
                                  axisLine={false}
                                  tickLine={false}
                                  width={50}
                                />
                                <RechartsTooltip
                                  contentStyle={{ backgroundColor: isDarkMode ? '#1f2937' : '#fff', borderColor: isDarkMode ? '#374151' : '#e5e7eb', color: isDarkMode ? '#fff' : '#000', borderRadius: '12px', border: '1px solid', boxShadow: '0 4px 12px rgba(0,0,0,0.12)' }}
                                  formatter={(value: any, name: any) => {
                                    if (value === undefined || value === null) return ["-", name];
                                    const h = Math.floor(value);
                                    const m = Math.round((value - h) * 60);
                                    return [`${h}:${m.toString().padStart(2, '0')} น.`, name];
                                  }}
                                  labelFormatter={(label) => `วันที่ ${label}`}
                                />
                                <Area type="monotone" dataKey="checkinValue" stroke="#6366f1" strokeWidth={2.5} fill="url(#attendanceTrendGradient)" dot={{ r: 3, fill: '#6366f1', strokeWidth: 0 }} activeDot={{ r: 6, fill: '#6366f1', stroke: isDarkMode ? '#1f2937' : '#fff', strokeWidth: 2 }} name="เวลามา" connectNulls />
                                <Line type="monotone" dataKey="checkoutValue" stroke="#f59e0b" strokeWidth={2.5} dot={{ r: 3, fill: '#f59e0b', strokeWidth: 0 }} activeDot={{ r: 6, fill: '#f59e0b', stroke: isDarkMode ? '#1f2937' : '#fff', strokeWidth: 2 }} name="เวลากลับ" connectNulls />
                              </ComposedChart>
                            </ResponsiveContainer>
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  {monthlyStats.length > 0 && (
                    <div className="bg-white dark:bg-[#2a2b2f] p-5 sm:p-6 rounded-2xl shadow-sm dark:shadow-none border border-gray-100 dark:border-gray-800">
                      <div className="flex items-center gap-3 mb-2">
                        <span className="w-1.5 h-6 rounded-full bg-gradient-to-b from-emerald-500 to-teal-500" />
                        <h3 className="text-base font-semibold text-gray-800 dark:text-gray-100">สถิติการมาทำงานรายเดือน</h3>
                      </div>
                      <div className="flex flex-wrap gap-x-4 gap-y-1.5 mb-4 pl-4">
                        {MONTHLY_STAT_LEGEND.map((item) => (
                          <div key={item.key} className="flex items-center gap-1.5">
                            <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: item.color }} />
                            <span className="text-xs font-medium text-gray-500 dark:text-gray-400">{item.label}</span>
                          </div>
                        ))}
                      </div>
                      <div className="h-80 w-full">
                        <ResponsiveContainer width="100%" height="100%" minWidth={0} initialDimension={{ width: 1, height: 1 }}>
                          <BarChart data={monthlyStats} margin={{ top: 5, right: 10, left: -10, bottom: 5 }} barCategoryGap="30%">
                            <CartesianGrid strokeDasharray="3 3" opacity={0.2} vertical={false} />
                            <XAxis dataKey="name" fontSize={12} stroke={isDarkMode ? "#9ca3af" : "#4b5563"} axisLine={false} tickLine={false} />
                            <YAxis allowDecimals={false} stroke={isDarkMode ? "#9ca3af" : "#4b5563"} axisLine={false} tickLine={false} width={30} />
                            <RechartsTooltip
                              cursor={{ fill: isDarkMode ? '#374151' : '#f3f4f6' }}
                              contentStyle={{ backgroundColor: isDarkMode ? '#1f2937' : '#fff', borderColor: isDarkMode ? '#374151' : '#e5e7eb', color: isDarkMode ? '#fff' : '#000', borderRadius: '12px', border: '1px solid', boxShadow: '0 4px 12px rgba(0,0,0,0.12)' }}
                            />
                            {MONTHLY_STAT_LEGEND.map((item, idx) => (
                              <Bar
                                key={item.key}
                                dataKey={item.key}
                                stackId="a"
                                fill={item.color}
                                name={item.label}
                                radius={idx === MONTHLY_STAT_LEGEND.length - 1 ? [4, 4, 0, 0] : undefined}
                              />
                            ))}
                          </BarChart>
                        </ResponsiveContainer>
                      </div>
                    </div>
                  )}

                  {selectedStatus && (
                    <div className="mt-8 bg-white dark:bg-[#2a2b2f] rounded-2xl p-6 shadow-sm border border-gray-100 dark:border-gray-800 animate-fade-in">
                      <h3 className="text-lg font-semibold mb-4 text-gray-800 dark:text-gray-200">
                        รายละเอียด: {
                          selectedStatus === 'present' ? 'มาปกติ' :
                            selectedStatus === 'late' ? 'สาย' :
                              selectedStatus === 'leave' ? 'ลา' :
                                selectedStatus === 'absent' ? 'ขาด' :
                                  selectedStatus === 'early' ? 'กลับก่อน' :
                                    selectedStatus === 'noCheckout' ? 'ไม่ลงเวลาออก' :
                                      officialTravelLabel
                        }
                      </h3>

                      {isAttendanceLoading ? (
                        <div className="text-center py-8 text-gray-500">กำลังโหลดข้อมูล...</div>
                      ) : filteredRecords.length > 0 ? (
                        <div className="table-responsive">
                          <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                            <thead className="bg-gray-50 dark:bg-gray-800">
                              <tr>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">วันที่</th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">สถานะ</th>
                              </tr>
                            </thead>
                            <tbody className="bg-white dark:bg-[#2a2b2f] divide-y divide-gray-200 dark:divide-gray-700">
                              {filteredRecords.slice((attendanceCurrentPage - 1) * attendanceItemsPerPage, attendanceCurrentPage * attendanceItemsPerPage).map((record) => (
                                <tr key={record.id}>
                                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-gray-200">
                                    {new Date(record.date).toLocaleDateString('th-TH', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
                                  </td>
                                  <td className="px-6 py-4 whitespace-nowrap">
                                    <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full 
                                                                ${record.status === 'มา' || record.status === 'OnTime' ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300' :
                                        record.status === 'สาย' || record.status === 'Late' ? 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300' :
                                          record.status === 'ลา' || record.status === 'Leave' || record.status === 'ล' ? 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300' :
                                            record.status === 'ขาด' || record.status === 'Absent' ? 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300' :
                                              'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300'}`}>
                                      {record.status}
                                    </span>
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                          {filteredRecords.length > attendanceItemsPerPage && (
                            <div className="flex flex-col sm:flex-row justify-between items-center mt-4 gap-4 px-2">
                              <div className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400">
                                <span>แสดง</span>
                                <select
                                  value={attendanceItemsPerPage}
                                  onChange={(e) => {
                                    setAttendanceItemsPerPage(Number(e.target.value));
                                    setAttendanceCurrentPage(1);
                                  }}
                                  className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-md px-2 py-1 focus:ring-2 focus:ring-indigo-500"
                                >
                                  <option value={10}>10</option>
                                  <option value={20}>20</option>
                                  <option value={50}>50</option>
                                </select>
                                <span>รายการ</span>
                              </div>
                              <div className="flex justify-center items-center gap-2">
                                <button
                                  onClick={() => setAttendanceCurrentPage(prev => Math.max(prev - 1, 1))}
                                  disabled={attendanceCurrentPage === 1}
                                  className="px-3 py-2 text-sm font-medium rounded-lg bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                                >
                                  ก่อนหน้า
                                </button>
                                <div className="flex gap-1 flex-wrap justify-center">
                                  {Array.from({ length: Math.ceil(filteredRecords.length / attendanceItemsPerPage) }, (_, i) => i + 1).map((page) => (
                                    <button
                                      key={page}
                                      onClick={() => setAttendanceCurrentPage(page)}
                                      className={`w-8 h-8 flex items-center justify-center text-sm font-medium rounded-lg transition-colors ${attendanceCurrentPage === page ? 'bg-indigo-600 text-white shadow-sm' : 'bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700'}`}
                                    >
                                      {page}
                                    </button>
                                  ))}
                                </div>
                                <button
                                  onClick={() => setAttendanceCurrentPage(prev => Math.min(prev + 1, Math.ceil(filteredRecords.length / attendanceItemsPerPage)))}
                                  disabled={attendanceCurrentPage === Math.ceil(filteredRecords.length / attendanceItemsPerPage)}
                                  className="px-3 py-2 text-sm font-medium rounded-lg bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                                >
                                  ถัดไป
                                </button>
                              </div>
                            </div>
                          )}
                        </div>
                      ) : (
                        <div className="text-center py-8 text-gray-500 dark:text-gray-400">ไม่พบข้อมูล</div>
                      )}
                    </div>
                  )}
                </div>
              )}

              {activeTab === "substitution" && (
                <div className="bg-white dark:bg-[#2a2b2f] rounded-2xl p-6 shadow-sm border border-gray-100 dark:border-gray-800 animate-fade-in">
                  <h2 className="text-lg font-semibold mb-6 pb-4 border-b border-gray-200 dark:border-gray-700 text-gray-800 dark:text-gray-200">ประวัติการสอนแทน</h2>

                  {substitutionCompletionCheckFailed && (
                    <div className="mb-4 rounded-xl border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-900/20 px-4 py-3 text-xs font-bold text-amber-700 dark:text-amber-300">
                      ระบบตรวจสอบสถานะการเช็คชื่อไม่สำเร็จบางส่วน (อาจเป็นปัญหาชั่วคราวของระบบ) รายการที่ขึ้น "ยังไม่ยืนยันสถานะ" ด้านล่างอาจสอนแล้วจริงแต่ตรวจสอบไม่ได้ในขณะนี้ ไม่ควรถือเป็นการขาด/ลา
                    </div>
                  )}

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
                    <div className="p-4 bg-indigo-50 dark:bg-indigo-900/20 rounded-xl border border-indigo-100 dark:border-indigo-800 text-center">
                      <div className="text-2xl font-bold text-indigo-600 dark:text-indigo-400">{substitutions.length}</div>
                      <div className="text-sm text-gray-500 dark:text-gray-400">จำนวนครั้งที่ได้รับมอบหมาย</div>
                    </div>
                    <div className="p-4 bg-green-50 dark:bg-green-900/20 rounded-xl border border-green-100 dark:border-green-800 text-center">
                      <div className="text-2xl font-bold text-green-600 dark:text-green-400">
                        {substitutions.filter(s => getSubstitutionStatus(s) === 'completed').length}
                      </div>
                      <div className="text-sm text-gray-500 dark:text-gray-400">ปฏิบัติหน้าที่สำเร็จ</div>
                    </div>
                    <div className="p-4 bg-red-50 dark:bg-red-900/20 rounded-xl border border-red-100 dark:border-red-800 text-center">
                      <div className="text-2xl font-bold text-red-600 dark:text-red-400">
                        {substitutions.filter(s => getSubstitutionStatus(s) === 'missed').length}
                      </div>
                      <div className="text-sm text-gray-500 dark:text-gray-400">ไม่ได้สอน (ลา/ขาด)</div>
                    </div>
                  </div>

                  {substitutions.length > 0 ? (
                    <>
                      {(() => {
                        const pageRows = substitutions
                          .slice((substitutionsCurrentPage - 1) * substitutionsItemsPerPage, substitutionsCurrentPage * substitutionsItemsPerPage)
                          .map((sub) => {
                            let dateObj: Date | null = null;
                            if (sub.date?.toDate) {
                              dateObj = sub.date.toDate();
                            } else if (sub.date?.seconds) {
                              dateObj = new Date(sub.date.seconds * 1000);
                            } else if (sub.date) {
                              dateObj = new Date(sub.date as any);
                            }

                            const dateStr = dateObj ? dateObj.toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: '2-digit' }) : "-";
                            const subStatus = getSubstitutionStatus(sub);

                            let statusBadge;
                            if (subStatus === 'upcoming') {
                              statusBadge = <span className="px-2 inline-flex text-xs leading-5 font-semibold rounded-full bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300">รอสอน</span>;
                            } else if (subStatus === 'completed') {
                              statusBadge = <span className="px-2 inline-flex text-xs leading-5 font-semibold rounded-full bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300">ปฏิบัติหน้าที่สำเร็จ</span>;
                            } else if (subStatus === 'unknown') {
                              statusBadge = <span className="px-2 inline-flex text-xs leading-5 font-semibold rounded-full bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300">ยังไม่ยืนยันสถานะ</span>;
                            } else {
                              statusBadge = <span className="px-2 inline-flex text-xs leading-5 font-semibold rounded-full bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300">ไม่ได้สอน (ลา/ขาด)</span>;
                            }

                            return { sub, dateStr, statusBadge };
                          });

                        return (
                          <>
                            {/* Mobile: การ์ดเรียงลง ไม่ต้องเลื่อนแนวนอน */}
                            <div className="sm:hidden space-y-3">
                              {pageRows.map(({ sub, dateStr, statusBadge }) => (
                                <div key={sub.id} className="rounded-xl border border-gray-100 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50 p-4">
                                  <div className="flex items-start justify-between gap-2 mb-2">
                                    <span className="text-sm font-medium text-gray-900 dark:text-gray-200">
                                      {dateStr} <span className="text-gray-500 text-xs">(คาบ {sub.period})</span>
                                    </span>
                                    {statusBadge}
                                  </div>
                                  <div className="text-sm text-gray-700 dark:text-gray-300">
                                    {sub.subjectName} <span className="text-gray-500 text-xs">({formatGradeLevel(sub.classId)})</span>
                                  </div>
                                  <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">สอนแทน: {sub.originalTeacherName}</div>
                                </div>
                              ))}
                            </div>

                            {/* Desktop: ตาราง — คอลัมน์ปรับความกว้างตามเนื้อหา ให้ข้อความอยู่บรรทัดเดียว
                                (overflow-x-auto เป็นทางสำรองเผื่อจอแคบมากจริงๆ เท่านั้น ปกติไม่ควรต้องเลื่อน) */}
                            <div className="hidden sm:block overflow-x-auto">
                              <table className="w-full divide-y divide-gray-200 dark:divide-gray-700">
                                <thead className="bg-gray-50 dark:bg-gray-800">
                                  <tr>
                                    <th scope="col" className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider whitespace-nowrap">วันที่/เวลา</th>
                                    <th scope="col" className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider whitespace-nowrap">วิชา/ชั้นเรียน</th>
                                    <th scope="col" className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider whitespace-nowrap">สอนแทนครู</th>
                                    <th scope="col" className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider whitespace-nowrap">สถานะ</th>
                                  </tr>
                                </thead>
                                <tbody className="bg-white dark:bg-[#2a2b2f] divide-y divide-gray-200 dark:divide-gray-700">
                                  {pageRows.map(({ sub, dateStr, statusBadge }) => (
                                    <tr key={sub.id}>
                                      <td className="px-4 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-gray-200">{dateStr} <span className="text-gray-500 text-xs">(คาบ {sub.period})</span></td>
                                      <td className="px-4 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-gray-200">{sub.subjectName} <span className="text-gray-500 text-xs">({formatGradeLevel(sub.classId)})</span></td>
                                      <td className="px-4 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-gray-200">{sub.originalTeacherName}</td>
                                      <td className="px-4 py-4 whitespace-nowrap">{statusBadge}</td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          </>
                        );
                      })()}
                      {substitutions.length > substitutionsItemsPerPage && (
                        <div className="flex flex-col sm:flex-row justify-between items-center mt-8 gap-4">
                          <div className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400">
                            <span>แสดง</span>
                            <select
                              value={substitutionsItemsPerPage}
                              onChange={(e) => {
                                setSubstitutionsItemsPerPage(Number(e.target.value));
                                setSubstitutionsCurrentPage(1); // Reset to first page
                              }}
                              className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-md px-2 py-1 focus:ring-2 focus:ring-indigo-500"
                            >
                              <option value={10}>10</option>
                              <option value={20}>20</option>
                              <option value={50}>50</option>
                            </select>
                            <span>รายการ</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <button
                              onClick={() => setSubstitutionsCurrentPage(prev => Math.max(prev - 1, 1))}
                              disabled={substitutionsCurrentPage === 1}
                              className="px-3 py-2 text-sm font-medium rounded-lg bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                            >
                              ก่อนหน้า
                            </button>
                            <span className="text-sm text-gray-700 dark:text-gray-300">
                              หน้า {substitutionsCurrentPage} / {Math.ceil(substitutions.length / substitutionsItemsPerPage)}
                            </span>
                            <button
                              onClick={() => setSubstitutionsCurrentPage(prev => Math.min(prev + 1, Math.ceil(substitutions.length / substitutionsItemsPerPage)))}
                              disabled={substitutionsCurrentPage === Math.ceil(substitutions.length / substitutionsItemsPerPage)}
                              className="px-3 py-2 text-sm font-medium rounded-lg bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                            >
                              ถัดไป
                            </button>
                          </div>
                        </div>
                      )}
                    </>
                  ) : (
                    <div className="text-center py-8 text-gray-500 dark:text-gray-400">ยังไม่มีประวัติการสอนแทน</div>
                  )}
                </div>
              )}
            </div >
          </main >
        </div >
      </div >
    </MainLayout >
  );
};

export default ProfilePage;
