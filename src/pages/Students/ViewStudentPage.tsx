import React, { useState, useEffect, useMemo, useRef } from "react";
import { useParams, useNavigate, useSearchParams, Link } from "react-router-dom";
import { useSelector, useDispatch } from "react-redux";
import { RootState } from "@/store";
import { fetchCalendar } from "@/store/slices/calendarSlice";
import MainLayout from "@/layouts/MainLayout";
import BackButton from "@/components/Shared/BackButton";
import ProfileAvatar from "@/components/Shared/ProfileAvatar";
import { firestore, auth } from "@/firebase";
import { signOut } from "firebase/auth";
import { doc, getDoc, Timestamp, collection, query, where, getDocs, documentId, runTransaction, arrayUnion, increment, arrayRemove, addDoc, serverTimestamp, deleteDoc, orderBy, onSnapshot, updateDoc, collectionGroup, writeBatch } from "firebase/firestore";
import Swal from 'sweetalert2';
import { FaPen, FaArrowLeft, FaChalkboard, FaUser, FaUsers, FaBook, FaBookOpen, FaChevronRight, FaChevronLeft, FaChevronDown, FaClock, FaFlag, FaSignOutAlt, FaSun, FaMoon, FaBars, FaTimes, FaUserPlus, FaExchangeAlt, FaHourglassHalf, FaPlane, FaIdCard, FaMapMarkerAlt, FaHeartbeat, FaBus, FaGraduationCap, FaEye, FaEyeSlash, FaFilePdf, FaCheckCircle, FaCheck, FaShieldAlt, FaBell, FaClipboardList } from "react-icons/fa";
import { pdf } from '@react-pdf/renderer';
import LeaveRequestPdfDocument from '@/components/Pdf/leave/LeaveRequestPdfDocument';
import { PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, Legend, ResponsiveContainer, LineChart, Line } from 'recharts';
import { Chart } from "react-google-charts";
import { useTheme } from "../../ThemeContext";
import OfficialTravelPdfButton from "../../components/Pdf/OfficialTravel/OfficialTravelPdfButton";
import { getCurrentThaiYear, formatNotificationTime } from "@/utils/dateUtils";
import { formatStudentBirthDateThai } from "@/utils/birthDateUtils";
import { formatClassLevelRange, isClassLevelInRange, CLASSES, getGroupPersonnel } from "@/utils/schoolUtils";
import StudentScheduleEmbed from "./StudentScheduleEmbed";
import StudentBehaviorHistoryEmbed from "./StudentBehaviorHistoryEmbed";
import StudentSDQParentEmbed from "./StudentSDQParentEmbed";

// --- Type Definition ---
interface StudentData {
  idCardNumber: string;
  title: string;
  firstName: string;
  lastName: string;
  nickname: string;
  firstNameEn?: string;
  lastNameEn?: string;
  birthDate?: string;
  gender?: string;
  religion?: string;
  ethnicity?: string;
  nationality?: string;
  bloodType?: string;
  birthProvince?: string;

  // Educational Info
  classLevel: string;
  room: string;
  studentNumber: string;
  studentId: string;
  gpa?: string;
  gpax?: string;
  enrollmentDate?: string;
  subSchoolId?: string;
  subSchoolName?: string;

  // Family Order & Details
  totalSiblings?: string;
  totalSiblingsInSchool?: string;
  studyingSiblingCount?: string;
  siblingPosition?: string;
  childOrder?: string;
  childOrderInCategory?: string;
  elderBrotherCount?: string;
  youngerBrotherCount?: string;
  elderSisterCount?: string;
  youngerSisterCount?: string;

  familyStatus?: string;
  parentsMaritalStatus?: string;

  // Parents/Guardian Details
  fatherTitle?: string; fatherFirstName?: string; fatherLastName?: string; fatherIdCard?: string; fatherOccupation?: string; fatherIncome?: string; fatherPhone?: string; fatherMonthlyIncome?: string; fatherIdNumber?: string;
  motherTitle?: string; motherFirstName?: string; motherLastName?: string; motherIdCard?: string; motherOccupation?: string; motherIncome?: string; motherPhone?: string; motherMonthlyIncome?: string; motherIdNumber?: string;
  guardianRelation?: string; guardianTitle?: string; guardianFirstName?: string; guardianLastName?: string; guardianIdCard?: string; guardianOccupation?: string; guardianPhone?: string; guardianIncome?: string; guardianRelationship?: string; guardianIdNumber?: string; guardianMonthlyIncome?: string;

  // Address
  regHouseId?: string; regHouseNumber?: string; regMoo?: string; regSoi?: string; regRoad?: string; regSubdistrict?: string; regSubDistrict?: string; regDistrict?: string; regProvince?: string; regPostalCode?: string; regZipCode?: string; regPhone?: string; regAddressNumber?: string;
  curHouseId?: string; curHouseNumber?: string; curMoo?: string; curSoi?: string; curRoad?: string; curSubdistrict?: string; curSubDistrict?: string; curDistrict?: string; curProvince?: string; curPostalCode?: string; curZipCode?: string; curPhone?: string; curAddressNumber?: string;

  // Health & Welfare
  weight?: string;
  height?: string;
  disabilityType?: string;

  disadvantageType?: string;
  staysAtSchool?: string;
  lacksUniform?: boolean;
  lacksStationery?: boolean;
  lacksTextbook?: boolean;
  lacksLunch?: boolean;

  isPoor?: string;
  isLackOfFood?: string;
  isLackOfStationery?: string;
  isLackOfUniform?: string;

  // Travel
  travelMethod?: string;
  travelDistance?: string;
  travelTime?: string;
  travelMonthlyCost?: string;
  fare?: string;
  distanceDirtRoad?: string;
  distancePavedRoad?: string;
  distanceWaterway?: string;

  guardian?: string; // Legacy
  contact?: string; // Legacy
  phoneNumber?: string;
  lineId?: string;
  studentStatus: string;
  profileImageUrl: string;
  createdAt?: Timestamp;
  updatedAt?: Timestamp;
  behaviorScore?: number;
  attendanceStats?: {
    present: number;
    late: number;
    leave: number;
    absent: number;
    early: number;
    noCheckout?: number;
    official_travel_days?: number; // Added field
  };
  flagCeremonyStats?: {
    present: number;
    late: number;
    leave: number;
    absent: number;
  };
  role?: string[];
  enrolledCourseIds?: string[];
}

interface GradeRecord {
  formative: number;
  midterm: number;
  final: number;
  total: number;
  grade: string;
}

interface CourseData {
  id: string;
  title?: string;
  courseName?: string;
  subjectName?: string;
  code?: string;
  courseCode?: string;
  gradeLevel?: string;
}

const statusColorMap: { [key: string]: string } = {
  "กำลังศึกษาอยู่": "bg-green-500/20 text-green-400 border-green-500/30",
  "พักการเรียน": "bg-yellow-500/20 text-yellow-400 border-yellow-500/30",
  "แขวนลอย": "bg-amber-500/20 text-amber-400 border-amber-500/30",
  "ย้าย": "bg-blue-500/20 text-blue-400 border-blue-500/30",
  "ลาออก": "bg-red-500/20 text-red-400 border-red-500/30",
};

// --- Reusable Components ---
const InfoCard: React.FC<{ title: string; children: React.ReactNode; className?: string }> = ({ title, children, className = "" }) => (
  <div className={`bg-white dark:bg-[#2a2b2f] p-6 rounded-2xl shadow-sm dark:shadow-none ${className}`}>
    <h2 className="text-lg font-semibold mb-4 text-gray-800 dark:text-gray-200 border-b border-gray-200 dark:border-gray-600 pb-2">{title}</h2>
    <div className="space-y-4">{children}</div>
  </div>
);

const DetailField: React.FC<{ label: string; value?: string | null }> = ({ label, value }) => (
  <div>
    <label className="block text-sm font-medium text-gray-500 dark:text-gray-400">{label}</label>
    <p className="mt-1 text-md text-gray-900 dark:text-gray-200">{value || "-"}</p>
  </div>
);

const SensitiveDetailField: React.FC<{ label: string; rawValue?: string | null }> = ({ label, rawValue }) => {
  const [show, setShow] = useState(false);
  if (!rawValue) {
    return <DetailField label={label} value="-" />;
  }

  const formatIdCard = (id: string) => {
    const cleanId = id.replace(/[^0-9]/g, "");
    if (cleanId.length === 13) {
      return `${cleanId[0]}-${cleanId.substring(1, 5)}-${cleanId.substring(5, 10)}-${cleanId.substring(10, 12)}-${cleanId[12]}`;
    }
    return id;
  };

  const masked = maskIdCardNumber(rawValue);
  const displayValue = show ? formatIdCard(rawValue) : masked;

  return (
    <div>
      <label className="block text-sm font-medium text-gray-500 dark:text-gray-400">{label}</label>
      <div className="mt-1 flex items-center gap-2">
        <span className="text-md text-gray-900 dark:text-gray-200 font-mono">{displayValue}</span>
        <button
          type="button"
          onClick={() => setShow(!show)}
          className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 focus:outline-none transition p-1"
          title={show ? "ซ่อนข้อมูล" : "แสดงข้อมูล"}
        >
          {show ? <FaEyeSlash size={16} /> : <FaEye size={16} />}
        </button>
      </div>
    </div>
  );
};

/**
 * ฟังก์ชันสำหรับปิดบังเลขบัตรประชาชน
 * @param id เลขบัตรประชาชน 13 หลัก
 * @returns เลขบัตรที่ถูกปิดบังบางส่วน (เช่น 1234-XXXXX-0123) หรือค่าเดิมหากรูปแบบไม่ถูกต้อง
 */
const maskIdCardNumber = (id?: string | null): string => {
  if (!id) return "-";
  // ลบตัวอักษรที่ไม่ใช่ตัวเลขออกก่อนเช็คความยาว
  const cleanId = id.replace(/[^0-9]/g, "");
  if (cleanId.length !== 13) {
    return id || "-";
  }
  return `${cleanId.substring(0, 4)}-XXXXX-${cleanId.substring(9, 13)}`;
};

/**
 * รวมคำนำหน้า ชื่อ และนามสกุลเข้าด้วยกันอย่างถูกต้องโดยไม่ให้เกิดคำนำหน้าซ้ำซ้อน
 */
const formatFullName = (title?: string, firstName?: string, lastName?: string, fallback?: string): string => {
  const trimmedFirstName = (firstName || "").trim();
  const trimmedLastName = (lastName || "").trim();
  const trimmedTitle = (title || "").trim();

  // ถ้าไม่มีทั้งชื่อจริงและคำนำหน้า ให้แสดงค่า fallback หรือ "-"
  if (!trimmedFirstName && !trimmedTitle) return fallback || "-";

  // รายการคำนำหน้ามาตรฐาน
  const commonTitles = ["นาย", "นาง", "นางสาว", "ด.ช.", "ด.ญ.", "น.ส.", "สามเณร", "พระ", "พระสามเณร", "พระมหา", "พระครู", "พระใบฎีกา", "หลวงพ่อ", "พระอาจารย์"];

  // ตรวจสอบว่าชื่อจริงเริ่มต้นด้วยคำนำหน้าอยู่แล้วหรือไม่ (เพื่อป้องกัน นายนาย)
  const startsWithTitle = commonTitles.some(t => trimmedFirstName.startsWith(t)) ||
    (trimmedTitle && trimmedFirstName.startsWith(trimmedTitle));

  let fullName = "";

  if (startsWithTitle) {
    // ถ้าชื่อจริงมีคำนำหน้าติดมาด้วยแล้ว (เช่น "นายสมชาย") ให้ใช้ชื่อจริงนั้นเลย
    fullName = `${trimmedFirstName} ${trimmedLastName}`;
  } else {
    // ถ้าไม่มี ให้เอาคำนำหน้ามาต่อ โดยเว้นช่องว่าง 1 เคาะเพื่อความสวยงาม
    const titlePart = trimmedTitle ? `${trimmedTitle} ` : "";
    fullName = `${titlePart}${trimmedFirstName} ${trimmedLastName}`;
  }

  // ใช้ regex จัดการช่องว่างซ้ำซ้อน และ trim หัวท้ายให้สะอาด
  return fullName.replace(/\s+/g, ' ').trim() || fallback || "-";
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

// --- Skeleton Loader Component ---
const SkeletonLoader = () => (
  <div className="min-h-screen bg-gray-50 dark:bg-[#1e1f21] text-gray-900 dark:text-white animate-pulse">
    <div className="max-w-4xl mx-auto px-3 sm:px-4 md:px-6 lg:px-8 py-4 sm:py-6 lg:py-8">
      {/* Header Skeleton */}
      <header className="mb-8">
        <div className="flex justify-between items-center">
          <div>
            <div className="h-8 w-48 bg-gray-300 dark:bg-gray-700 rounded"></div>
            <div className="mt-2 h-4 w-64 bg-gray-300 dark:bg-gray-700 rounded"></div>
          </div>
          <div className="flex items-center gap-x-4">
            <div className="h-10 w-24 bg-gray-300 dark:bg-gray-700 rounded-md"></div>
            <div className="h-10 w-32 bg-gray-300 dark:bg-gray-700 rounded-md"></div>
          </div>
        </div>
      </header>

      <div className="space-y-6">
        {/* Personal Info Skeleton */}
        <div className="bg-white dark:bg-[#2a2b2f] p-6 rounded-2xl shadow-sm">
          <div className="h-6 w-32 bg-gray-300 dark:bg-gray-700 rounded mb-4 pb-2 border-b border-gray-200 dark:border-gray-600"></div>
          <div className="flex flex-col sm:flex-row items-center sm:items-start gap-6">
            <div className="w-32 h-32 rounded-full bg-gray-300 dark:bg-gray-700 flex-shrink-0"></div>
            <div className="flex-grow space-y-4 w-full">
              <div>
                <div className="h-4 w-32 bg-gray-300 dark:bg-gray-700 rounded mb-1"></div>
                <div className="h-6 w-full bg-gray-300 dark:bg-gray-700 rounded"></div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <div className="h-4 w-16 bg-gray-300 dark:bg-gray-700 rounded mb-1"></div>
                  <div className="h-6 w-full bg-gray-300 dark:bg-gray-700 rounded"></div>
                </div>
                <div>
                  <div className="h-4 w-16 bg-gray-300 dark:bg-gray-700 rounded mb-1"></div>
                  <div className="h-6 w-full bg-gray-300 dark:bg-gray-700 rounded"></div>
                </div>
                <div>
                  <div className="h-4 w-16 bg-gray-300 dark:bg-gray-700 rounded mb-1"></div>
                  <div className="h-6 w-full bg-gray-300 dark:bg-gray-700 rounded"></div>
                </div>
              </div>
              <div>
                <div className="h-4 w-12 bg-gray-300 dark:bg-gray-700 rounded mb-1"></div>
                <div className="h-6 w-1/2 bg-gray-300 dark:bg-gray-700 rounded"></div>
              </div>
            </div>
          </div>
        </div>

        {/* Education Info Skeleton */}
        <div className="bg-white dark:bg-[#2a2b2f] p-6 rounded-2xl shadow-sm">
          <div className="h-6 w-48 bg-gray-300 dark:bg-gray-700 rounded mb-4 pb-2 border-b border-gray-200 dark:border-gray-600"></div>
          <div className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
              <div><div className="h-10 w-full bg-gray-300 dark:bg-gray-700 rounded"></div></div>
              <div><div className="h-10 w-full bg-gray-300 dark:bg-gray-700 rounded"></div></div>
              <div><div className="h-10 w-full bg-gray-300 dark:bg-gray-700 rounded"></div></div>
              <div><div className="h-10 w-full bg-gray-300 dark:bg-gray-700 rounded"></div></div>
            </div>
            <div>
              <div className="h-4 w-24 bg-gray-300 dark:bg-gray-700 rounded mb-1"></div>
              <div className="h-7 w-24 bg-gray-300 dark:bg-gray-700 rounded-md"></div>
            </div>
          </div>
        </div>

        {/* Guardian Info Skeleton */}
        <div className="bg-white dark:bg-[#2a2b2f] p-6 rounded-2xl shadow-sm">
          <div className="h-6 w-40 bg-gray-300 dark:bg-gray-700 rounded mb-4 pb-2 border-b border-gray-200 dark:border-gray-600"></div>
          <div className="space-y-4">
            <div><div className="h-10 w-full bg-gray-300 dark:bg-gray-700 rounded"></div></div>
            <div><div className="h-10 w-full bg-gray-300 dark:bg-gray-700 rounded"></div></div>
          </div>
        </div>

        {/* System Info Skeleton */}
        <div className="bg-white dark:bg-[#2a2b2f] p-6 rounded-2xl shadow-sm">
          <div className="h-6 w-24 bg-gray-300 dark:bg-gray-700 rounded mb-4 pb-2 border-b border-gray-200 dark:border-gray-600"></div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div><div className="h-10 w-full bg-gray-300 dark:bg-gray-700 rounded"></div></div>
            <div><div className="h-10 w-full bg-gray-300 dark:bg-gray-700 rounded"></div></div>
          </div>
        </div>
      </div>
    </div>
  </div>
);

export default function ViewStudentPage() {
  const { schoolId, studentId } = useParams<{ schoolId: string, studentId: string }>();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [student, setStudent] = useState<StudentData | null>(null);
  const [studentGrades, setStudentGrades] = useState<Record<string, GradeRecord>>({});
  const [courses, setCourses] = useState<CourseData[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [allClubs, setAllClubs] = useState<any[]>([]);
  const [myClub, setMyClub] = useState<any>(null);
  const [pendingRequest, setPendingRequest] = useState<any>(null);
  const [isTransferEnabled, setIsTransferEnabled] = useState(false);
  const [isClubLoading, setIsClubLoading] = useState(false);
  const [showTransferList, setShowTransferList] = useState(false);
  const completedClubRequestIdsRef = useRef<Set<string>>(new Set());
  const isSubmittingClubRequestRef = useRef(false);
  const [clubPage, setClubPage] = useState(1);
  const validTabs = ["general", "academic", "attendance", "courses", "schedule", "behavior", "official_travel", "club", "sdq"];
  const [activeTab, setActiveTab] = useState(() => {
    const t = searchParams.get("tab");
    if (t && validTabs.includes(t)) return t;
    return localStorage.getItem('currentUserType') === 'parent' ? "schedule" : "general";
  });
  const [generalStep, setGeneralStep] = useState(() => {
    const s = parseInt(searchParams.get("step") || "0", 10);
    return isNaN(s) ? 0 : Math.min(Math.max(s, 0), 4);
  });
  const handleTabChange = (tabId: string) => {
    setActiveTab(tabId);
    setSearchParams(prev => { prev.set("tab", tabId); prev.delete("step"); return prev; }, { replace: true });
  };
  const handleStepChange = (step: number) => {
    setGeneralStep(step);
    setSearchParams(prev => { prev.set("step", String(step)); return prev; }, { replace: true });
  };
  const [attendanceTrendData, setAttendanceTrendData] = useState<any[]>([]);
  const [monthlyStats, setMonthlyStats] = useState<any[]>([]);
  const dispatch = useDispatch();
  const calendarState = useSelector((state: RootState) => state.calendar);
  const academicYear = calendarState.academicYear || String(getCurrentThaiYear());

  useEffect(() => {
    if (schoolId) {
      dispatch(fetchCalendar(schoolId) as any);
    }
  }, [schoolId, dispatch]);
  const [calculatedStats, setCalculatedStats] = useState<{
    present: number; late: number; leave: number; absent: number; early: number; noCheckout: number; official_travel_days?: number;
  } | null>(null);
  const [isRegistrationEnabled, setIsRegistrationEnabled] = useState<boolean>(false);
  const [globalClubStartDate, setGlobalClubStartDate] = useState<string>('');
  const [globalClubEndDate, setGlobalClubEndDate] = useState<string>('');
  const [regStartTime, setRegStartTime] = useState<string>('');
  const [regEndTime, setRegEndTime] = useState<string>('');
  const [isStatsLoading, setIsStatsLoading] = useState(false);
  const [officialTravelRequests, setOfficialTravelRequests] = useState<any[]>([]);
  const [studentLeaveRequests, setStudentLeaveRequests] = useState<any[]>([]);
  const [exportingLeaveId, setExportingLeaveId] = useState<string | null>(null);
  const [schoolInfo, setSchoolInfo] = useState<{ schoolName: string; directorName: string; deputyName: string; personnelHeadName: string; personnelHeadRoleLabel: string; affiliation: string }>({
    schoolName: "",
    directorName: "",
    deputyName: "",
    personnelHeadName: "",
    personnelHeadRoleLabel: "",
    affiliation: ""
  });
  
  // Navigation State
  const [allStudentIds, setAllStudentIds] = useState<string[]>([]);
  const currentIndex = allStudentIds.indexOf(studentId || "");
  const nextStudentId = currentIndex < allStudentIds.length - 1 ? allStudentIds[currentIndex + 1] : null;
  const prevStudentId = currentIndex > 0 ? allStudentIds[currentIndex - 1] : null;

  useEffect(() => {
    const fetchAllIds = async () => {
      if (!schoolId || !student) return;
      if (localStorage.getItem('currentUserType') === 'parent') return; // ผู้ปกครองดูได้เฉพาะบุตรหลานตัวเอง ไม่เปิดให้เลื่อนดูนักเรียนคนอื่น
      try {
        const q = query(
          collection(firestore, "school-settings", schoolId, "students"),
          where("classLevel", "==", student.classLevel),
          where("room", "==", student.room),
          orderBy("studentNumber")
        );
        const snap = await getDocs(q);
        setAllStudentIds(snap.docs.map(d => d.id));
      } catch (err) {
        console.error("Error fetching student IDs:", err);
      }
    };
    fetchAllIds();
  }, [schoolId, student]);

  const { isDarkMode, toggleTheme } = useTheme();
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [parentChildren, setParentChildren] = useState<{ schoolId: string; studentDocId: string; name: string; classLevel: string; room: string; profileImageUrl: string }[]>([]);
  const [showChildSwitcher, setShowChildSwitcher] = useState(false);
  const profile = useSelector((state: RootState) => state.profile);
  const isParentLogin = localStorage.getItem('currentUserType') === 'parent';
  const isStudentLogin = ['student', 'parent'].includes(localStorage.getItem('currentUserType') ?? '');

  const tabs = [
    { id: "general", label: "ข้อมูลทั่วไป", icon: <FaIdCard /> },
    { id: "academic", label: "การศึกษา", icon: <FaGraduationCap /> },
    { id: "attendance", label: "สถาติการมาเรียน", icon: <FaClock /> },
    { id: "courses", label: "รายวิชาที่เรียน", icon: <FaBook /> },
    { id: "schedule", label: "ตารางเรียน", icon: <FaChalkboard /> },
    { id: "behavior", label: "คะแนนพฤติกรรม", icon: <FaShieldAlt /> },
    { id: "official_travel", label: "การลาของนักเรียน", icon: <FaHourglassHalf /> },
    { id: "club", label: "กิจกรรมชุมนุม", icon: <FaUsers /> },
    ...(isParentLogin ? [{ id: "sdq", label: "แบบประเมิน SDQ", icon: <FaClipboardList /> }] : []),
  ];

  // Notification state
  const notificationRef = useRef<HTMLDivElement>(null);
  const [isOpenNoti, setIsOpenNoti] = useState(false);
  const [studentNotifications, setStudentNotifications] = useState<{ id: string; path: string; message: string; isRead: boolean; createdAt: Timestamp; link?: string }[]>([]);
  const [isLoadingNoti, setIsLoadingNoti] = useState(false);

  const handleLogout = async () => {
    await signOut(auth);
    localStorage.removeItem('currentUserType');
    localStorage.removeItem('studentSession');
    localStorage.removeItem('parentSession');
    navigate('/login');
  };

  // Subscribe to notifications for student/parent
  useEffect(() => {
    const uid = auth.currentUser?.uid;
    if (!uid || !isStudentLogin) return;
    setIsLoadingNoti(true);
    const q = query(
      collectionGroup(firestore, 'notifications'),
      where('userId', '==', uid),
      orderBy('createdAt', 'desc')
    );
    const unsub = onSnapshot(q, (snap) => {
      setStudentNotifications(snap.docs.map(d => ({ id: d.id, path: d.ref.path, ...(d.data() as any) })));
      setIsLoadingNoti(false);
    }, () => setIsLoadingNoti(false));
    return () => unsub();
  }, [isStudentLogin]);

  // Close notification panel on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (notificationRef.current && !notificationRef.current.contains(e.target as Node)) setIsOpenNoti(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const notiUnreadCount = studentNotifications.filter(n => !n.isRead).length;

  const handleNotiReadOne = async (n: { id: string; path: string; isRead: boolean; link?: string }) => {
    if (!n.isRead && n.path) await updateDoc(doc(firestore, n.path), { isRead: true });
    if (n.link) navigate(n.link);
    setIsOpenNoti(false);
  };

  const handleNotiReadAll = async () => {
    const batch = writeBatch(firestore);
    studentNotifications.forEach(n => { if (!n.isRead && n.path) batch.update(doc(firestore, n.path), { isRead: true }); });
    await batch.commit();
  };

  const getClubStatus = (_club: any): { text: string; color: string; isOpen: boolean; } => {
    if (!isRegistrationEnabled) {
      return { text: 'ปิดรับสมัคร', color: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300', isOpen: false };
    }

    const now = new Date();
    const todayOnly = new Date(now);
    todayOnly.setHours(0, 0, 0, 0);

    if (globalClubStartDate && globalClubEndDate) {
      const start = new Date(globalClubStartDate + 'T00:00:00');
      const end = new Date(globalClubEndDate + 'T23:59:59');

      if (todayOnly < start) return { text: `เปิดวันที่ ${start.toLocaleDateString('th-TH')}`, color: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300', isOpen: false };
      if (now > end) return { text: 'ปิดรับสมัครแล้ว', color: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300', isOpen: false };
    }

    if (regStartTime && regEndTime) {
      const cur = now.getHours() * 60 + now.getMinutes();
      const [sh, sm] = regStartTime.split(':').map(Number);
      const [eh, em] = regEndTime.split(':').map(Number);
      if (cur < sh * 60 + sm || cur > eh * 60 + em) {
        return { text: `รับสมัคร ${regStartTime} - ${regEndTime} น.`, color: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300', isOpen: false };
      }
    }

    return { text: 'เปิดรับสมัคร', color: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300', isOpen: true };
  };

  const canStudentJoinClub = (club: any) => {
    return isClassLevelInRange(student?.classLevel, club.allowedClassLevelFrom, club.allowedClassLevelTo);
  };

  const pendingClubRequestStorageKey = useMemo(() => {
    return schoolId && studentId ? `pendingClubRequest:${schoolId}:${studentId}` : '';
  }, [schoolId, studentId]);

  const savePendingClubRequest = (request: any | null) => {
    if (!pendingClubRequestStorageKey) return;
    if (!request) {
      localStorage.removeItem(pendingClubRequestStorageKey);
      return;
    }
    localStorage.setItem(pendingClubRequestStorageKey, JSON.stringify({
      id: request.id,
      studentId: request.studentId,
      type: request.type,
      currentClubId: request.currentClubId || null,
      currentClubName: request.currentClubName || null,
      targetClubId: request.targetClubId,
      targetClubName: request.targetClubName,
      exitStatus: request.exitStatus,
      entryStatus: request.entryStatus,
      status: request.status || 'pending'
    }));
  };

  const restorePendingClubRequest = () => {
    if (!pendingClubRequestStorageKey) return null;
    try {
      const raw = localStorage.getItem(pendingClubRequestStorageKey);
      return raw ? JSON.parse(raw) : null;
    } catch {
      localStorage.removeItem(pendingClubRequestStorageKey);
      return null;
    }
  };
  // ตรวจสอบสิทธิ์การเข้าถึง
  useEffect(() => {
    const userType = localStorage.getItem('currentUserType');
    if (userType !== 'student' && userType !== 'parent' && !auth.currentUser) {
      navigate('/login');
    }
  }, [navigate]);

  // โหลดรายการบุตรจาก parentSession
  useEffect(() => {
    if (isParentLogin) {
      try {
        const session = localStorage.getItem('parentSession');
        if (session) setParentChildren(JSON.parse(session).children || []);
      } catch { /* session เสีย ไม่แสดง switcher */ }
    }
  }, [isParentLogin]);

  useEffect(() => {
    if (schoolId) {
      const fetchSchoolInfo = async () => {
        try {
          const schoolRef = doc(firestore, "school-settings", schoolId);
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
  }, [schoolId]);

  useEffect(() => {
    if (activeTab === 'attendance' && schoolId && studentId && academicYear) {
      const fetchStats = async () => {
        setIsStatsLoading(true);
        try {
          // 1. Get Term Dates
          let startDate = "";
          let endDate = "";

          if (calendarState.status === 'succeeded') {
            startDate = calendarState.terms[0]?.startDate || "";
            endDate = calendarState.terms[calendarState.terms.length - 1]?.endDate || calendarState.terms[0]?.endDate || "";
          } else {
            const yearDocRef = doc(firestore, "school-settings", schoolId, "main_calendar", academicYear);
            let yearSnap = await getDoc(yearDocRef);

            if (!yearSnap.exists()) {
              const defaultDocRef = doc(firestore, "school-settings", schoolId, "main_calendar", "default");
              yearSnap = await getDoc(defaultDocRef);
            }

            if (yearSnap.exists()) {
              const data = yearSnap.data();
              // ดึงช่วงเวลาทั้งปีการศึกษา (เริ่มเทอม 1 ถึง จบเทอม 2)
              startDate = data.terms?.term1?.startDate || "";
              endDate = data.terms?.term2?.endDate || data.terms?.term1?.endDate || "";
            }
          }

          if (!startDate || !endDate) {
            setCalculatedStats({ present: 0, late: 0, leave: 0, absent: 0, early: 0, noCheckout: 0 });
            setAttendanceTrendData([]);
            setMonthlyStats([]);
            setIsStatsLoading(false);
            return;
          }

          // 2. Fetch Attendance
          const attRef = collection(firestore, "school-settings", schoolId, "students", studentId, "attendance");
          const q = query(attRef, where(documentId(), ">=", startDate), where(documentId(), "<=", endDate));
          const attSnap = await getDocs(q);

          const newStats = { present: 0, late: 0, leave: 0, absent: 0, early: 0, noCheckout: 0 };
          const trendData: any[] = [];
          const thaiMonths = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'];
          const monthlyData: { [key: string]: { present: number; late: number; leave: number; absent: number; early: number; noCheckout: number; name: string; } } = {};

          attSnap.forEach(doc => {
            const data = doc.data();
            const status = data.status;

            // Stats
            if (status === 'มา' || status === 'OnTime') newStats.present++;
            else if (status === 'สาย' || status === 'Late') newStats.late++;
            else if (status === 'ลา' || status === 'Leave') newStats.leave++;
            else if (status === 'ขาด' || status === 'Absent') newStats.absent++;
            else if (status === 'กลับก่อน' || status === 'Early') newStats.early++;
            else if (status === 'ไม่ลงเวลาออก' || status === 'NoCheckout') newStats.noCheckout++;

            // Prepare Trend Data (สำหรับกราฟเส้น)
            let date = data.date;
            let time = data.time;
            let dateObject: Date | null = null;

            // กรณีไม่มี date/time โดยตรง ให้ลองดึงจาก timestamp
            if (data.timestamp && data.timestamp instanceof Timestamp) {
              const d = data.timestamp.toDate();
              dateObject = d;
              date = d.toISOString().split('T')[0]; // YYYY-MM-DD
              time = d.toTimeString().slice(0, 5);  // HH:mm
            } else if (date) {
              dateObject = new Date(date);
            }

            // เก็บข้อมูลเฉพาะวันที่มา หรือ สาย (ที่มีเวลา)
            if (date && time && (status === 'มา' || status === 'สาย')) {
              const [h, m] = time.split(':').map(Number);
              if (!isNaN(h) && !isNaN(m)) {
                trendData.push({
                  date,
                  time,
                  value: h + (m / 60), // แปลงเวลาเป็นทศนิยมสำหรับแกน Y
                  status
                });
              }
            }

            // Monthly aggregation logic
            if (dateObject) {
              const month = dateObject.getMonth(); // 0-11
              const year = dateObject.getFullYear();
              const shortYear = String(year + 543).slice(-2);
              const monthKey = `${year}-${String(month).padStart(2, '0')}`;

              if (!monthlyData[monthKey]) {
                monthlyData[monthKey] = { present: 0, late: 0, leave: 0, absent: 0, early: 0, noCheckout: 0, name: `${thaiMonths[month]}'${shortYear}` };
              }

              if (status === 'มา') monthlyData[monthKey].present++;
              else if (status === 'สาย') monthlyData[monthKey].late++;
              else if (status === 'ลา' || status === 'ล') monthlyData[monthKey].leave++;
              else if (status === 'ขาด') monthlyData[monthKey].absent++;
              else if (status === 'กลับก่อน') monthlyData[monthKey].early++;
              else if (status === 'ไม่ลงเวลาออก') monthlyData[monthKey].noCheckout++;
            }
          });

          setCalculatedStats(newStats);
          setAttendanceTrendData(trendData.sort((a, b) => a.date.localeCompare(b.date)));

          const monthlyStatsArray = Object.keys(monthlyData)
            .sort()
            .map(key => monthlyData[key]);
          setMonthlyStats(monthlyStatsArray);
        } catch (err) {
          console.error("Error fetching stats", err);
        } finally {
          setIsStatsLoading(false);
        }
      };
      fetchStats();
    }
  }, [activeTab, schoolId, studentId, academicYear]);

  useEffect(() => {
    const fetchGrades = async () => {
      if (!schoolId || !studentId || courses.length === 0) return;

      const gradesMap: Record<string, GradeRecord> = {};
      try {
        const promises = courses.map(async (course) => {
          const gradeRef = doc(firestore, "school-settings", schoolId, "courses", course.id, "grades", studentId);
          const gradeSnap = await getDoc(gradeRef);
          if (gradeSnap.exists()) {
            gradesMap[course.id] = gradeSnap.data() as GradeRecord;
          }
        });
        await Promise.all(promises);
        setStudentGrades(gradesMap);
      } catch (err) {
        console.error("Error fetching student grades:", err);
      }
    };

    if (activeTab === 'courses') {
      fetchGrades();
    }
  }, [activeTab, schoolId, studentId, courses]);

  useEffect(() => {
    const fetchClubInfo = async () => {
      if (!schoolId || !studentId || activeTab !== 'club') return;
      setIsClubLoading(true);
      try {
        const clubsRef = collection(firestore, "school-settings", schoolId, "clubs");
        const clubsSnap = await getDocs(clubsRef);
        const clubsList = clubsSnap.docs.map(clubDoc => ({ id: clubDoc.id, ...clubDoc.data() }));
        setAllClubs(clubsList);

        let foundClub = null;
        for (const club of clubsList) {
          const memberDoc = await getDoc(doc(firestore, "school-settings", schoolId, "clubs", club.id, "members", studentId));
          if (memberDoc.exists()) {
            foundClub = club;
            break;
          }
        }
        setMyClub(foundClub);

        // club settings จัดการโดย onSnapshot listener แยกต่างหาก

        try {
          const requestsRef = collection(firestore, "school-settings", schoolId, "club_requests");
          const q = query(requestsRef, where("studentId", "==", studentId), where("status", "==", "pending"));
          const reqSnap = await getDocs(q);
          if (!reqSnap.empty) {
            const request = { id: reqSnap.docs[0].id, ...reqSnap.docs[0].data() };
            setPendingRequest(request);
            savePendingClubRequest(request);
          } else {
            setPendingRequest(null);
            savePendingClubRequest(null);
          }
        } catch (requestError) {
          console.warn("Could not fetch pending club request:", requestError);
          setPendingRequest(restorePendingClubRequest());
        }
      } catch (err) {
        console.error("Error fetching club info:", err);
      } finally {
        setIsClubLoading(false);
      }
    };
    fetchClubInfo();
  }, [activeTab, schoolId, studentId]);

  // Realtime listener สำหรับการตั้งค่าระบบชุมนุม
  useEffect(() => {
    if (activeTab !== 'club' || !schoolId) return;
    const configRef = doc(firestore, "school-settings", schoolId, "configs", "club_settings");
    const unsub = onSnapshot(configRef, (snap) => {
      if (snap.exists()) {
        const data = snap.data();
        setIsRegistrationEnabled(data.registrationEnabled ?? false);
        setIsTransferEnabled(data.allowTransfer || false);
        setGlobalClubStartDate(data.registrationStartDate || '');
        setGlobalClubEndDate(data.registrationEndDate || '');
        setRegStartTime(data.registrationStartTime || '');
        setRegEndTime(data.registrationEndTime || '');
      } else {
        setIsRegistrationEnabled(false);
        setIsTransferEnabled(false);
      }
    }, (err) => {
      console.warn("Could not listen to club settings:", err);
      setIsRegistrationEnabled(false);
      setIsTransferEnabled(false);
    });
    return () => unsub();
  }, [activeTab, schoolId]);

  useEffect(() => {
    if (activeTab !== 'club' || !schoolId || !studentId || !pendingRequest?.id || !pendingRequest?.targetClubId) return;

    savePendingClubRequest(pendingRequest);
    const requestId = pendingRequest.id;
    const targetClubId = pendingRequest.targetClubId;
    const targetClub = allClubs.find(club => club.id === targetClubId) || null;
    const unsubs: Array<() => void> = [];
    let deletionTimer: ReturnType<typeof setTimeout> | null = null;

    const completeAsApproved = () => {
      if (completedClubRequestIdsRef.current.has(requestId)) return;
      completedClubRequestIdsRef.current.add(requestId);
      if (deletionTimer) clearTimeout(deletionTimer);
      if (targetClub) setMyClub(targetClub);
      setPendingRequest(null);
      savePendingClubRequest(null);
      setShowTransferList(false);
      Swal.fire({
        icon: 'success',
        title: 'คำขอชุมนุมได้รับอนุมัติแล้ว',
        text: targetClub ? `คุณอยู่ในชุมนุม "${targetClub.name}" แล้ว` : 'ระบบอัปเดตชุมนุมของคุณเรียบร้อยแล้ว',
        timer: 2200,
        showConfirmButton: false,
        background: isDarkMode ? '#2a2b2f' : '#fff',
        color: isDarkMode ? '#fff' : '#000'
      });
    };

    const completeAsClosed = () => {
      if (completedClubRequestIdsRef.current.has(requestId)) return;
      setPendingRequest((prev: any) => {
        if (prev?.id !== requestId) return prev;
        savePendingClubRequest(null);
        return null;
      });
      setShowTransferList(false);
      Swal.fire({
        icon: 'info',
        title: 'คำขอชุมนุมสิ้นสุดแล้ว',
        text: 'คำขออาจถูกปฏิเสธหรือถูกยกเลิกโดยผู้ดูแล',
        timer: 2200,
        showConfirmButton: false,
        background: isDarkMode ? '#2a2b2f' : '#fff',
        color: isDarkMode ? '#fff' : '#000'
      });
    };

    unsubs.push(onSnapshot(
      doc(firestore, "school-settings", schoolId, "clubs", targetClubId, "members", studentId),
      (memberSnap) => {
        if (memberSnap.exists()) completeAsApproved();
      },
      (error) => {
        console.warn("Could not listen to target club membership:", error);
      }
    ));

    unsubs.push(onSnapshot(
      doc(firestore, "school-settings", schoolId, "club_requests", requestId),
      (requestSnap) => {
        if (!requestSnap.exists()) {
          deletionTimer = setTimeout(() => {
            if (!completedClubRequestIdsRef.current.has(requestId)) completeAsClosed();
          }, 800);
          return;
        }

        const data = requestSnap.data();
        setPendingRequest((prev: any) => prev?.id === requestId ? { ...prev, ...data } : prev);
        if (data.status === 'rejected') completeAsClosed();
      },
      (error) => {
        console.warn("Could not listen to club request status:", error);
      }
    ));

    return () => {
      if (deletionTimer) clearTimeout(deletionTimer);
      unsubs.forEach(unsub => unsub());
    };
  }, [activeTab, schoolId, studentId, pendingRequest?.id, pendingRequest?.targetClubId, allClubs, isDarkMode]);

  useEffect(() => {
    if (!schoolId || !studentId) {
      Swal.fire({ icon: 'error', title: 'เกิดข้อผิดพลาด', text: 'ไม่พบรหัสนักเรียน', background: '#2a2b2f', color: '#ffffff' });
      navigate(-1); // Go back
      return;
    }

    // ผู้ปกครองดูข้อมูลได้เฉพาะบุตร/หลานของตัวเองเท่านั้น กันไม่ให้แก้ studentId ใน URL แล้วเห็นข้อมูลนักเรียนคนอื่น
    if (localStorage.getItem('currentUserType') === 'parent') {
      let children: { schoolId: string; studentDocId: string }[] = [];
      try {
        children = JSON.parse(localStorage.getItem('parentSession') || '{}').children || [];
      } catch { /* session เสีย ถือว่าไม่มีสิทธิ์ */ }
      const owns = children.some(c => c.studentDocId === studentId && c.schoolId === schoolId);
      if (!owns) {
        const fallback = children[0];
        Swal.fire({ icon: 'error', title: 'ไม่มีสิทธิ์เข้าถึง', text: 'คุณสามารถดูข้อมูลได้เฉพาะบุตร/หลานของตัวเองเท่านั้น', background: '#2a2b2f', color: '#ffffff' })
          .then(() => navigate(fallback ? `/school/${fallback.schoolId}/students/view/${fallback.studentDocId}` : '/login', { replace: true }));
        return;
      }
    }

    const fetchStudentData = async () => {
      setIsLoading(true);
      try {
        const docRef = doc(firestore, "school-settings", schoolId, "students", studentId);
        const docSnap = await getDoc(docRef);
        if (docSnap.exists()) {
          const studentData = docSnap.data() as StudentData;
          setStudent(studentData);

          // Fetch enrolled courses from enrolledCourseIds field on the student document
          try {
            const enrolledCourseIds: string[] = Array.isArray(studentData.enrolledCourseIds)
              ? [...new Set(studentData.enrolledCourseIds as string[])]
              : [];

            if (enrolledCourseIds.length > 0) {
              const courseDocsPromises = enrolledCourseIds.map(id =>
                getDoc(doc(firestore, "school-settings", schoolId, "courses", id))
              );
              const courseDocsSnaps = await Promise.all(courseDocsPromises);
              const coursesData = courseDocsSnaps
                .filter(snap => snap.exists())
                .map(snap => ({ id: snap.id, ...snap.data() } as CourseData));
              setCourses(coursesData);
            } else {
              setCourses([]);
            }
          } catch (err) {
            console.error("Error fetching enrolled courses:", err);
          }
        } else {
          Swal.fire({ icon: 'error', title: 'ไม่พบข้อมูล', text: 'ไม่พบข้อมูลนักเรียนที่ต้องการ', background: '#2a2b2f', color: '#ffffff' });
          navigate(-1);
        }
      } catch (error) {
        console.error("Error fetching student data:", error);
        Swal.fire({ icon: 'error', title: 'เกิดข้อผิดพลาด', text: 'เกิดข้อผิดพลาดในการดึงข้อมูล', background: '#2a2b2f', color: '#ffffff' });
      } finally {
        setIsLoading(false);
      }
    };

    fetchStudentData();
  }, [schoolId, studentId, academicYear, navigate]);

  useEffect(() => {
    if (activeTab === 'official_travel' && schoolId && studentId) {
      const fetchLeaveRequests = async () => {
        try {
          const leaveRef = collection(firestore, "school-settings", schoolId, "students", studentId, "leave_summary");
          const snapshot = await getDocs(leaveRef);
          const requests = snapshot.docs
            .map(doc => ({ id: doc.id, ...doc.data() }))
            .sort((a: any, b: any) => {
              const getTime = (v: any) => v?.toDate ? v.toDate().getTime() : new Date(v || 0).getTime();
              return getTime(b.startDate) - getTime(a.startDate);
            });
          setStudentLeaveRequests(requests);
        } catch (err) {
          console.error("Error fetching student leave requests:", err);
        }
      };
      fetchLeaveRequests();
    }
  }, [activeTab, schoolId, studentId]);

  const thaiDateStr = (ts?: any) => {
    if (!ts) return '-';
    const date = ts?.toDate ? ts.toDate() : new Date(ts);
    return date.toLocaleDateString('th-TH', { day: 'numeric', month: 'long', year: 'numeric' });
  };

  const handleLeaveExportPdf = async (req: any) => {
    if (!schoolId || !student) return;
    setExportingLeaveId(req.id);
    let guardianName = "........................................";
    let teacherName = "........................................";
    let schoolName = "........................................";
    let logoUrl = "/school-logo.png";
    try {
      const schoolDoc = await getDoc(doc(firestore, "school-settings", schoolId));
      if (schoolDoc.exists()) {
        const sd = schoolDoc.data();
        schoolName = sd.schoolName || schoolName;
        logoUrl = sd.logoUrl || logoUrl;
      }
    } catch (_) {}
    try {
      const gTitle = (student.guardianTitle || "").trim();
      const gFirst = (student.guardianFirstName || "").trim();
      const gLast = (student.guardianLastName || "").trim();
      if (gFirst) {
        const commonTitles = ["นาย", "นาง", "นางสาว", "ด.ช.", "ด.ญ.", "น.ส.", "สามเณร", "พระ", "พระสามเณร", "พระมหา", "พระครู", "พระใบฎีกา", "หลวงพ่อ", "พระอาจารย์"];
        const hasTitle = commonTitles.some(t => gFirst.startsWith(t));
        guardianName = hasTitle ? `${gFirst} ${gLast}`.trim() : `${gTitle} ${gFirst} ${gLast}`.trim();
      } else if (student.guardian) {
        guardianName = student.guardian;
      }
      const gradesToCheck = [student.classLevel, `${student.classLevel}/${student.room}`].filter(Boolean);
      if (gradesToCheck.length > 0) {
        const tSnap = await getDocs(query(
          collection(firestore, "school-settings", schoolId, "teachers"),
          where("isHomeroomTeacher", "==", true),
          where("homeroomGrade", "in", gradesToCheck)
        ));
        if (!tSnap.empty) {
          const t = tSnap.docs[0].data();
          teacherName = `${t.title || ''}${t.firstName} ${t.lastName}`;
        }
      }
    } catch (_) {}
    try {
      const today = (() => {
        const d = new Date();
        const thYear = d.getFullYear() + 543;
        return { day: d.getDate(), month: d.toLocaleDateString('th-TH', { month: 'long' }), year: thYear };
      })();
      const dataForPdf = {
        studentName: req.studentName || `${student.title || ''}${student.firstName} ${student.lastName}`,
        studentId: student.studentId,
        leaveType: req.leaveType,
        reason: req.reason,
        startDate: thaiDateStr(req.startDate),
        endDate: thaiDateStr(req.endDate),
        returnDate: thaiDateStr(req.returnDate),
        guardianName,
        teacherName,
        schoolName,
        logoUrl,
      };
      const blob = await pdf(<LeaveRequestPdfDocument data={dataForPdf} today={today} />).toBlob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `ใบลา-${dataForPdf.studentName}.pdf`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error("Failed to generate leave PDF:", err);
    } finally {
      setExportingLeaveId(null);
    }
  };

  const handleClubRequest = async (targetClub: any, type: 'apply' | 'transfer') => {
    if (!schoolId || !studentId || !student) return;

    const status = getClubStatus(targetClub);
    if (!status.isOpen) {
      Swal.fire({
        icon: 'warning',
        title: 'ยังไม่สามารถส่งคำขอได้',
        text: status.text || 'ระบบยังไม่เปิดรับสมัครชุมนุม',
        background: isDarkMode ? '#2a2b2f' : '#fff',
        color: isDarkMode ? '#fff' : '#000'
      });
      return;
    }

    if (type === 'transfer' && (!myClub || !isTransferEnabled)) {
      Swal.fire({
        icon: 'warning',
        title: 'ยังไม่เปิดให้ย้ายชุมนุม',
        text: 'ขณะนี้ฝ่ายวิชาการยังไม่อนุญาตให้นักเรียนส่งคำขอย้ายชุมนุมด้วยตนเอง',
        background: isDarkMode ? '#2a2b2f' : '#fff',
        color: isDarkMode ? '#fff' : '#000'
      });
      return;
    }

    if (!canStudentJoinClub(targetClub)) {
      Swal.fire({
        icon: 'warning',
        title: 'ไม่อยู่ในช่วงระดับชั้นที่กำหนด',
        text: `ชุมนุมนี้เปิดรับ ${formatClassLevelRange(targetClub.allowedClassLevelFrom, targetClub.allowedClassLevelTo)} เท่านั้น`,
        background: isDarkMode ? '#2a2b2f' : '#fff',
        color: isDarkMode ? '#fff' : '#000'
      });
      return;
    }

    if ((targetClub.memberCount || 0) >= (targetClub.capacity || 0)) {
      Swal.fire({
        icon: 'warning',
        title: 'ชุมนุมเต็มแล้ว',
        text: `ชุมนุม "${targetClub.name}" รับได้สูงสุด ${targetClub.capacity || 0} คน`,
        background: isDarkMode ? '#2a2b2f' : '#fff',
        color: isDarkMode ? '#fff' : '#000'
      });
      return;
    }

    const result = await Swal.fire({
      title: type === 'apply' ? 'ยืนยันการสมัครชุมนุม' : 'ยืนยันการขอย้ายชุมนุม',
      text: `คุณต้องการส่งคำขอเข้าชุมนุม "${targetClub.name}" ใช่หรือไม่?`,
      icon: 'question',
      showCancelButton: true,
      confirmButtonText: 'ส่งคำขอ',
      cancelButtonText: 'ยกเลิก',
      background: isDarkMode ? '#2a2b2f' : '#fff',
      color: isDarkMode ? '#fff' : '#000'
    });

    if (result.isConfirmed) {
      if (isSubmittingClubRequestRef.current) return;
      isSubmittingClubRequestRef.current = true;
      try {
        const requestData = {
          studentId,
          studentName: `${student.firstName} ${student.lastName}`,
          studentNumber: student.studentNumber,
          classLevel: student.classLevel,
          room: student.room,
          type,
          targetClubId: targetClub.id,
          targetClubName: targetClub.name,
          currentClubId: myClub?.id || null,
          currentClubName: myClub?.name || null,
          exitStatus: type === 'transfer' ? 'pending' : 'approved',
          entryStatus: 'pending',
          status: 'pending',
          createdAt: serverTimestamp()
        };
        const requestRef = await addDoc(collection(firestore, "school-settings", schoolId, "club_requests"), requestData);
        const localRequest = { id: requestRef.id, ...requestData, createdAt: new Date() };
        setPendingRequest(localRequest);
        savePendingClubRequest(localRequest);
        setShowTransferList(false);
        Swal.fire({ icon: 'success', title: 'ส่งคำขอสำเร็จ', text: 'กรุณารอครูผู้รับผิดชอบอนุมัติ', timer: 2000, showConfirmButton: false });
      } catch (err) {
        console.error("Error creating club request:", err);
        Swal.fire('ผิดพลาด', 'ไม่สามารถส่งคำขอได้', 'error');
      } finally {
        isSubmittingClubRequestRef.current = false;
      }
    }
  };

  const handleCancelRequest = async () => {
    if (!pendingRequest || !schoolId) return;
    const reqRef = doc(firestore, "school-settings", schoolId, "club_requests", pendingRequest.id);
    try {
      await deleteDoc(reqRef);
    } catch {
      // ถ้าลบไม่ได้ (permission) ลองอัปเดตสถานะเป็น cancelled แทน
      try {
        await updateDoc(reqRef, { status: 'cancelled', cancelledAt: serverTimestamp() });
      } catch {
        // ถ้ายังไม่ได้ ให้ยกเลิกเฉพาะ local state (document ยังอยู่ใน Firestore แต่ admin จะเห็นเป็น cancelled)
      }
    }
    setPendingRequest(null);
    savePendingClubRequest(null);
    Swal.fire({ icon: 'success', title: 'ยกเลิกคำขอแล้ว', timer: 1500, showConfirmButton: false });
  };

  if (isLoading) {
    return (
      <MainLayout>
        <SkeletonLoader />
      </MainLayout>
    );
  }

  if (!student) {
    return null; // หรือแสดงหน้าไม่พบข้อมูล
  }



  // Prepare Chart Data
  const stats = calculatedStats || { present: 0, late: 0, leave: 0, absent: 0, early: 0, noCheckout: 0 };
  const attendanceChartData = [
    { name: 'มาปกติ', value: stats.present || 0, color: '#22c55e' },
    { name: 'สาย', value: stats.late || 0, color: '#eab308' },
    { name: 'ลา', value: stats.leave || 0, color: '#3b82f6' },
    { name: 'ขาด', value: stats.absent || 0, color: '#ef4444' },
    { name: 'กลับก่อน', value: stats.early || 0, color: '#f97316' },
    { name: 'ไม่ลงเวลาออก', value: stats.noCheckout || 0, color: '#a855f7' },
  ].filter(d => d.value > 0);

  const finalFlagStats = student?.flagCeremonyStats || { present: 0, late: 0, leave: 0, absent: 0 };
  const flagChartData = [
    { name: 'มาเข้าแถว', value: finalFlagStats.present || 0, color: '#22c55e' },
    { name: 'สาย', value: finalFlagStats.late || 0, color: '#eab308' },
    { name: 'ลา', value: finalFlagStats.leave || 0, color: '#3b82f6' },
    { name: 'ขาด', value: finalFlagStats.absent || 0, color: '#ef4444' },
  ].filter(d => d.value > 0);

  // Prepare Data for Google Charts (3D Pie)
  const googleAttendanceData = [
    ["Status", "Count"],
    ...attendanceChartData.map(d => [d.name, d.value]),
  ];

  const googleFlagData = [
    ["Status", "Count"],
    ...flagChartData.map(d => [d.name, d.value]),
  ];

  const getPieOptions = (data: typeof attendanceChartData) => ({
    is3D: true,
    backgroundColor: "transparent",
    legend: { position: "bottom", textStyle: { color: isDarkMode ? "#e5e7eb" : "#374151" } },
    colors: data.map(d => d.color),
    chartArea: { width: "90%", height: "80%" },
  });

  // ถ้าเป็นนักเรียน ให้ใช้ Div ธรรมดาแทน MainLayout เพื่อซ่อน Sidebar
  const LayoutWrapper = isStudentLogin ? ({ children }: { children: React.ReactNode }) => (
    <div className="min-h-screen bg-gray-50 dark:bg-[#1e1f21] transition-colors duration-300">
      <nav className="fixed top-0 left-0 right-0 h-[60px] bg-white/90 dark:bg-[#18191a]/95 backdrop-blur-md z-50 px-4 border-b border-gray-200 dark:border-gray-800 shadow-sm flex items-center justify-between">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2 cursor-pointer">
            <FaBookOpen className="w-7 h-7 text-sky-500 dark:text-sky-400" />
            <span className="font-bold text-lg text-gray-800 dark:text-white hidden sm:block whitespace-nowrap">
              EPP.5 Online
            </span>
          </div>
        </div>

        {/* Desktop Menu */}
        <div className="hidden lg:flex items-center gap-4">
          <button onClick={toggleTheme} className="p-2 rounded-full hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-600 dark:text-yellow-400 transition-colors">
            {isDarkMode ? <FaSun size={20} /> : <FaMoon size={20} />}
          </button>

          {/* Notification Bell */}
          <div className="relative" ref={notificationRef}>
            <button
              type="button"
              onClick={() => setIsOpenNoti(p => !p)}
              className="relative p-2 rounded-full text-gray-500 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-800 transition-colors"
              aria-label={`การแจ้งเตือน${notiUnreadCount > 0 ? ` (${notiUnreadCount} รายการใหม่)` : ''}`}
              title="การแจ้งเตือน"
            >
              <FaBell size={20} />
              {notiUnreadCount > 0 && (
                <span className="absolute -top-1 -right-1 bg-red-600 text-white text-[10px] w-4 h-4 rounded-full flex items-center justify-center leading-none">
                  {notiUnreadCount > 9 ? '9+' : notiUnreadCount}
                </span>
              )}
            </button>

            {isOpenNoti && (
              <div className="absolute top-full right-0 mt-2 w-[360px] max-w-[calc(100vw-2rem)] bg-white dark:bg-[#242526] rounded-2xl shadow-2xl border border-gray-200 dark:border-gray-700/80 overflow-hidden flex flex-col z-[9999]">
                {/* Header */}
                <div className="p-4 flex justify-between items-center border-b border-gray-200 dark:border-gray-700">
                  <h3 className="font-bold text-base text-gray-900 dark:text-white">การแจ้งเตือน</h3>
                  {notiUnreadCount > 0 && (
                    <button onClick={handleNotiReadAll} className="text-sm font-medium text-indigo-600 dark:text-indigo-400 hover:underline">
                      อ่านทั้งหมด
                    </button>
                  )}
                </div>
                {/* Body */}
                <div className="max-h-[60vh] overflow-y-auto">
                  {isLoadingNoti ? (
                    <div className="p-6 text-center text-sm text-gray-500 dark:text-gray-400">กำลังโหลด...</div>
                  ) : studentNotifications.length === 0 ? (
                    <div className="text-center py-12 px-6">
                      <FaBell className="mx-auto mb-3 text-gray-300 dark:text-gray-600" size={36} />
                      <p className="text-sm font-semibold text-gray-700 dark:text-gray-300">ไม่มีการแจ้งเตือน</p>
                      <p className="text-xs text-gray-400 mt-1">ทุกอย่างเรียบร้อยดี</p>
                    </div>
                  ) : (
                    <ul className="divide-y divide-gray-100 dark:divide-gray-700">
                      {studentNotifications.map(n => (
                        <li
                          key={n.id}
                          onClick={() => handleNotiReadOne(n)}
                          className={`flex gap-3 p-4 cursor-pointer transition-colors hover:bg-gray-50 dark:hover:bg-white/5 ${!n.isRead ? 'bg-indigo-50/60 dark:bg-indigo-950/30' : ''}`}
                        >
                          <div className="flex-shrink-0 mt-1">
                            {!n.isRead
                              ? <span className="w-2.5 h-2.5 bg-indigo-500 rounded-full block" />
                              : <span className="w-2.5 h-2.5 rounded-full block" />}
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className={`text-sm leading-5 ${!n.isRead ? 'font-semibold text-gray-800 dark:text-gray-100' : 'text-gray-600 dark:text-gray-400'}`}>
                              {n.message}
                            </p>
                            <p className="mt-1 text-xs text-gray-400">
                              {n.createdAt?.toDate ? formatNotificationTime(n.createdAt.toDate()) : ''}
                            </p>
                          </div>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* นักเรียนธรรมดา: แสดงปุ่ม logout + ชื่อ + badge + avatar */}
          {!isParentLogin && (
            <>
              <button onClick={handleLogout} className="flex items-center gap-2 px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg text-sm font-medium transition-colors">
                <FaSignOutAlt /> ออกจากระบบ
              </button>
              <div className="flex items-center gap-3 pl-4 border-l border-gray-200 dark:border-gray-700 ml-2">
                <div className="text-right">
                  <p className="font-bold text-sm text-gray-800 dark:text-white truncate max-w-[180px]">
                    {student ? `${student.title}${student.firstName} ${student.lastName}` : 'Guest'}
                  </p>
                  <span className="inline-block mt-0.5 px-2 py-0.5 bg-sky-100 dark:bg-sky-900/30 text-sky-700 dark:text-sky-300 text-[10px] font-bold rounded-full tracking-wide">
                    นักเรียน
                  </span>
                </div>
                <ProfileAvatar
                  src={student?.profileImageUrl || `https://ui-avatars.com/api/?name=${student?.firstName || 'Student'}+${student?.lastName || ''}&background=random`}
                  alt="Profile"
                  className="w-10 h-10 border-2 border-sky-300 dark:border-sky-600"
                />
              </div>
            </>
          )}

          {/* ผู้ปกครอง: avatar คลิกได้ → dropdown แบบ Facebook */}
          {isParentLogin && (
            <div className="relative pl-4 border-l border-gray-200 dark:border-gray-700 ml-2">
              <button
                onClick={() => setShowChildSwitcher(!showChildSwitcher)}
                className="flex items-center gap-3 hover:opacity-80 transition-opacity"
              >
                <div className="text-right">
                  <p className="font-bold text-sm text-gray-800 dark:text-white truncate max-w-[160px]">
                    {student ? `${student.title}${student.firstName} ${student.lastName}` : 'Guest'}
                  </p>
                  <span className="inline-block mt-0.5 px-2 py-0.5 bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300 text-[10px] font-bold rounded-full tracking-wide">
                    ผู้ปกครอง
                  </span>
                </div>
                <div className="relative">
                  <ProfileAvatar
                    src={student?.profileImageUrl || `https://ui-avatars.com/api/?name=${student?.firstName || 'Student'}+${student?.lastName || ''}&background=random`}
                    alt="Profile"
                    className="w-10 h-10 border-2 border-emerald-300 dark:border-emerald-600"
                  />
                  <div className="absolute -bottom-0.5 -right-0.5 w-[18px] h-[18px] bg-white dark:bg-[#18191a] rounded-full border border-gray-300 dark:border-gray-600 flex items-center justify-center shadow-sm">
                    <FaChevronDown size={7} className="text-gray-600 dark:text-gray-400" />
                  </div>
                </div>
              </button>

              {/* Facebook-style dropdown */}
              {showChildSwitcher && (
                <>
                  <div className="fixed inset-0 z-40" onClick={() => setShowChildSwitcher(false)} />
                  <div className="absolute top-full right-0 mt-3 w-72 bg-white dark:bg-[#242526] rounded-2xl shadow-2xl border border-gray-200 dark:border-gray-700 z-50 overflow-hidden">
                    {/* Header — แสดง role ชัดเจน */}
                    <div className="px-4 pt-4 pb-3 border-b border-gray-100 dark:border-gray-700">
                      <p className="text-xs text-gray-400 dark:text-gray-500 mb-1.5">เข้าสู่ระบบในฐานะ</p>
                      <div className="flex items-center gap-2">
                        <div className="w-7 h-7 bg-emerald-100 dark:bg-emerald-900/30 rounded-full flex items-center justify-center flex-shrink-0">
                          <FaUsers size={12} className="text-emerald-600 dark:text-emerald-400" />
                        </div>
                        <span className="font-bold text-sm text-gray-800 dark:text-white">ผู้ปกครอง</span>
                        <span className="ml-auto px-2 py-0.5 bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300 text-[10px] font-bold rounded-full">
                          ผู้ปกครอง
                        </span>
                      </div>
                    </div>
                    <div className="px-4 pt-3 pb-1">
                      <p className="text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider">บุตร/หลานทั้งหมด</p>
                    </div>

                    {/* Children list */}
                    <div className="px-2 pb-2">
                      {parentChildren.map((child, idx) => {
                        const isCurrent = child.studentDocId === studentId;
                        return (
                          <button
                            key={idx}
                            onClick={() => {
                              navigate(`/school/${child.schoolId}/students/view/${child.studentDocId}`);
                              setShowChildSwitcher(false);
                            }}
                            className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-left transition-colors ${isCurrent ? 'bg-indigo-50 dark:bg-indigo-900/20' : 'hover:bg-gray-50 dark:hover:bg-[#3a3b3c]'}`}
                          >
                            <div className="relative flex-shrink-0">
                              <ProfileAvatar
                                src={child.profileImageUrl || `https://ui-avatars.com/api/?name=${child.name}&background=random`}
                                alt={child.name}
                                className="w-11 h-11"
                              />
                              {isCurrent && (
                                <div className="absolute -bottom-0.5 -right-0.5 w-5 h-5 bg-green-500 rounded-full border-2 border-white dark:border-[#242526] flex items-center justify-center">
                                  <FaCheck size={8} className="text-white" />
                                </div>
                              )}
                            </div>
                            <div className="min-w-0 flex-1">
                              <p className={`font-semibold text-sm truncate ${isCurrent ? 'text-indigo-700 dark:text-indigo-300' : 'text-gray-900 dark:text-white'}`}>
                                {child.name}
                              </p>
                              <p className="text-xs text-gray-500 dark:text-gray-400">{child.classLevel} / ห้อง {child.room}</p>
                            </div>
                          </button>
                        );
                      })}
                    </div>

                    {/* Divider + Logout */}
                    <div className="border-t border-gray-100 dark:border-gray-700 px-4 py-3">
                      <button
                        onClick={handleLogout}
                        className="w-full flex items-center justify-center gap-2 py-2.5 px-4 bg-gray-100 dark:bg-[#3a3b3c] rounded-xl text-sm font-medium text-gray-700 dark:text-gray-200 hover:bg-gray-200 dark:hover:bg-[#4a4b4c] transition-colors"
                      >
                        <FaSignOutAlt />
                        ออกจากระบบ
                      </button>
                    </div>
                  </div>
                </>
              )}
            </div>
          )}
        </div>

        {/* Mobile: Notification Bell + Hamburger */}
        <div className="lg:hidden flex items-center gap-1">
          <div className="relative">
            <button
              type="button"
              onClick={() => { setIsOpenNoti(p => !p); setIsSidebarOpen(false); }}
              className="relative p-2 text-gray-600 dark:text-gray-300 rounded-full hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
              aria-label="การแจ้งเตือน"
            >
              <FaBell size={20} />
              {notiUnreadCount > 0 && (
                <span className="absolute -top-0.5 -right-0.5 bg-red-600 text-white text-[10px] w-4 h-4 rounded-full flex items-center justify-center leading-none">
                  {notiUnreadCount > 9 ? '9+' : notiUnreadCount}
                </span>
              )}
            </button>
            {isOpenNoti && (
              <div className="fixed left-4 right-4 top-[65px] z-[9999] bg-white dark:bg-[#242526] rounded-2xl shadow-2xl border border-gray-200 dark:border-gray-700/80 overflow-hidden flex flex-col">
                <div className="p-4 flex justify-between items-center border-b border-gray-200 dark:border-gray-700">
                  <h3 className="font-bold text-base text-gray-900 dark:text-white">การแจ้งเตือน</h3>
                  {notiUnreadCount > 0 && (
                    <button onClick={handleNotiReadAll} className="text-sm font-medium text-indigo-600 dark:text-indigo-400 hover:underline">
                      อ่านทั้งหมด
                    </button>
                  )}
                </div>
                <div className="max-h-[60vh] overflow-y-auto">
                  {isLoadingNoti ? (
                    <div className="p-6 text-center text-sm text-gray-500">กำลังโหลด...</div>
                  ) : studentNotifications.length === 0 ? (
                    <div className="text-center py-10 px-6">
                      <FaBell className="mx-auto mb-3 text-gray-300 dark:text-gray-600" size={32} />
                      <p className="text-sm font-semibold text-gray-700 dark:text-gray-300">ไม่มีการแจ้งเตือน</p>
                    </div>
                  ) : (
                    <ul className="divide-y divide-gray-100 dark:divide-gray-700">
                      {studentNotifications.map(n => (
                        <li
                          key={n.id}
                          onClick={() => handleNotiReadOne(n)}
                          className={`flex gap-3 p-4 cursor-pointer transition-colors hover:bg-gray-50 dark:hover:bg-white/5 ${!n.isRead ? 'bg-indigo-50/60 dark:bg-indigo-950/30' : ''}`}
                        >
                          <div className="flex-shrink-0 mt-1">
                            {!n.isRead ? <span className="w-2.5 h-2.5 bg-indigo-500 rounded-full block" /> : <span className="w-2.5 h-2.5 rounded-full block" />}
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className={`text-sm leading-5 ${!n.isRead ? 'font-semibold text-gray-800 dark:text-gray-100' : 'text-gray-600 dark:text-gray-400'}`}>{n.message}</p>
                            <p className="mt-1 text-xs text-gray-400">{n.createdAt?.toDate ? formatNotificationTime(n.createdAt.toDate()) : ''}</p>
                          </div>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </div>
            )}
          </div>
          <button onClick={() => { setIsSidebarOpen(true); setIsOpenNoti(false); }} className="p-2 text-gray-600 dark:text-gray-300">
            <FaBars size={24} />
          </button>
        </div>
      </nav>

      {/* Mobile Sidebar (Drawer) */}
      {isSidebarOpen && (
        <div className="fixed inset-0 bg-black/50 z-[60] lg:hidden" onClick={() => setIsSidebarOpen(false)} />
      )}
      <div className={`fixed top-0 right-0 h-full w-[280px] bg-white dark:bg-[#2a2b2f] z-[70] shadow-2xl transform transition-transform duration-300 ease-in-out lg:hidden ${isSidebarOpen ? 'translate-x-0' : 'translate-x-full'}`}>
        <div className="p-6 flex flex-col h-full">
          <div className="flex justify-end mb-6">
            <button onClick={() => setIsSidebarOpen(false)} className="p-2 text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-full">
              <FaTimes size={24} />
            </button>
          </div>
          <div className="flex flex-col items-center mb-6">
            <div className="relative mb-4">
              <ProfileAvatar
                src={student?.profileImageUrl || `https://ui-avatars.com/api/?name=${student?.firstName || 'Student'}+${student?.lastName || ''}&background=random`}
                alt="Profile"
                className={`w-20 h-20 border-4 ${isParentLogin ? 'border-emerald-200 dark:border-emerald-700' : 'border-sky-200 dark:border-sky-700'}`}
              />
            </div>
            <h3 className="text-lg font-bold text-gray-900 dark:text-white text-center">
              {student ? `${student.title}${student.firstName} ${student.lastName}` : 'Guest'}
            </h3>
            <p className="text-sm text-gray-500 dark:text-gray-400 mb-2">{student?.studentId}</p>
            {/* Role badge */}
            {isParentLogin ? (
              <span className="flex items-center gap-1.5 px-3 py-1 bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300 text-xs font-bold rounded-full">
                <FaUsers size={10} /> เข้าสู่ระบบในฐานะผู้ปกครอง
              </span>
            ) : (
              <span className="flex items-center gap-1.5 px-3 py-1 bg-sky-100 dark:bg-sky-900/30 text-sky-700 dark:text-sky-300 text-xs font-bold rounded-full">
                <FaUser size={10} /> เข้าสู่ระบบในฐานะนักเรียน
              </span>
            )}
          </div>

          {/* Child Switcher สำหรับ Mobile — แสดงเสมอเมื่อเป็นผู้ปกครอง */}
          {isParentLogin && parentChildren.length > 0 && (
            <div className="mb-4">
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider px-4 mb-2">บุตร/หลานทั้งหมด</p>
              <div className="space-y-1">
                {parentChildren.map((child, idx) => {
                  const isCurrent = child.studentDocId === studentId;
                  return (
                    <button
                      key={idx}
                      onClick={() => {
                        navigate(`/school/${child.schoolId}/students/view/${child.studentDocId}`);
                        setIsSidebarOpen(false);
                      }}
                      className={`w-full flex items-center gap-3 px-4 py-2.5 rounded-xl transition-all ${isCurrent
                        ? 'bg-indigo-50 dark:bg-indigo-900/20 border border-indigo-200 dark:border-indigo-700'
                        : 'text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800'
                      }`}
                    >
                      <div className="relative flex-shrink-0">
                        <ProfileAvatar
                          src={child.profileImageUrl || `https://ui-avatars.com/api/?name=${child.name}&background=random`}
                          alt={child.name}
                          className="w-10 h-10"
                        />
                        {isCurrent && (
                          <div className="absolute -bottom-0.5 -right-0.5 w-4 h-4 bg-green-500 rounded-full border-2 border-white dark:border-[#2a2b2f] flex items-center justify-center">
                            <FaCheck size={7} className="text-white" />
                          </div>
                        )}
                      </div>
                      <div className="text-left min-w-0 flex-1">
                        <p className={`text-sm font-semibold truncate ${isCurrent ? 'text-indigo-700 dark:text-indigo-300' : 'text-gray-800 dark:text-gray-200'}`}>{child.name}</p>
                        <p className="text-xs text-gray-400">{child.classLevel} / ห้อง {child.room}</p>
                      </div>
                    </button>
                  );
                })}
              </div>
              <div className="h-px bg-gray-200 dark:bg-gray-700 mt-4 mx-4"></div>
            </div>
          )}
          <div className="space-y-3 flex-1 overflow-y-auto [&::-webkit-scrollbar]:hidden [-ms-overflow-style:'none'] [scrollbar-width:'none']">
            <div className="mb-4 space-y-2">
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider px-4">เมนูหลัก</p>
              {tabs.map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => { handleTabChange(tab.id); setIsSidebarOpen(false); }}
                  className={`w-full flex items-center justify-between gap-3 px-4 py-3 rounded-xl transition-all ${activeTab === tab.id
                    ? "bg-indigo-50 text-indigo-700 dark:bg-indigo-900/20 dark:text-indigo-300 font-semibold"
                    : "text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800"
                    }`}
                >
                  <div className="flex items-center gap-3">
                    {tab.icon}
                    <span>{tab.label}</span>
                  </div>
                  {activeTab === tab.id && <FaChevronRight className="ml-auto text-xs" />}
                </button>
              ))}
            </div>
            <div className="h-px bg-gray-200 dark:bg-gray-700 my-2 mx-4"></div>
            <button onClick={() => { toggleTheme(); setIsSidebarOpen(false); }} className="w-full flex items-center gap-3 px-4 py-3 rounded-xl bg-gray-50 dark:bg-gray-800 text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors">
              {isDarkMode ? <FaSun className="text-yellow-500" /> : <FaMoon className="text-indigo-500" />}
              <span>{isDarkMode ? 'โหมดสว่าง' : 'โหมดมืด'}</span>
            </button>
          </div>
          <div className="mt-auto">
            <button onClick={handleLogout} className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 rounded-xl hover:bg-red-100 dark:hover:bg-red-900/30 transition-colors font-medium">
              <FaSignOutAlt />
              ออกจากระบบ
            </button>
          </div>
        </div>
      </div>

      <div className="pt-[60px]">
        {children}
      </div>
    </div>
  ) : MainLayout;

  return (
    <LayoutWrapper>
      <div className="min-h-screen bg-gray-50 dark:bg-[#1e1f21] text-gray-900 dark:text-white">
        <div className="max-w-6xl mx-auto px-3 sm:px-4 md:px-6 lg:px-8 py-4 sm:py-6 lg:py-8">
          <header className="mb-8">
            <div className="flex justify-between items-center">
              <div className="flex items-center gap-4">
                {!isStudentLogin && <BackButton to="/academic/hub/students" />}
                <div>
                  <h1 className="text-3xl font-bold tracking-tight">ข้อมูลนักเรียน</h1>
                  <p className="mt-1 text-gray-500 dark:text-gray-400">
                    รายละเอียดข้อมูลของ: <span className="font-semibold text-indigo-400">{student.firstName} {student.lastName}</span>
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-x-4">
                {!isStudentLogin && (
                   <div className="flex items-center bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-100 dark:border-gray-700 p-1 mr-2">
                    <button 
                      disabled={!prevStudentId} 
                      onClick={() => navigate(`/school/${schoolId}/students/view/${prevStudentId}`)}
                      className="p-2 text-gray-500 hover:text-indigo-500 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                      title="ก่อนหน้า"
                    >
                      <FaChevronLeft size={20} />
                    </button>
                    <div className="w-px h-6 bg-gray-200 dark:bg-gray-700 mx-1"></div>
                    <button 
                      disabled={!nextStudentId} 
                      onClick={() => navigate(`/school/${schoolId}/students/view/${nextStudentId}`)}
                      className="p-2 text-gray-500 hover:text-indigo-500 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                      title="ถัดไป"
                    >
                      <FaChevronRight size={20} />
                    </button>
                  </div>
                )}
                {!isStudentLogin && (
                  <button onClick={() => navigate(-1)} className="inline-flex items-center gap-x-2 rounded-md bg-gray-600/50 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-gray-700/50 transition-colors">
                    <FaArrowLeft />
                    กลับ
                  </button>
                )}
                {!isStudentLogin && <Link to={`/school/${schoolId}/students/edit/${studentId}`} className="inline-flex items-center gap-x-2 rounded-md bg-indigo-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-indigo-700 transition-colors">
                  <FaPen />
                  แก้ไขข้อมูล
                </Link>}
              </div>
            </div>
          </header>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
            {/* Left Sidebar */}
            <aside className="lg:col-span-4 space-y-6 lg:sticky lg:top-24 self-start">
              <div className="bg-white dark:bg-[#2a2b2f] rounded-2xl p-6 shadow-sm border border-gray-100 dark:border-gray-800 text-center">
                <ProfileAvatar
                  src={student.profileImageUrl || `https://ui-avatars.com/api/?name=${student.firstName}+${student.lastName}&background=random`}
                  alt="Student profile"
                  className="w-32 h-32 border-4 border-white dark:border-gray-700 shadow-lg mx-auto mb-4"
                />
                <h2 className="text-xl font-bold text-gray-900 dark:text-white">{student.title}{student.firstName} {student.lastName}</h2>
                <p className="text-sm text-gray-500 dark:text-gray-400">รหัสนักเรียน: {student.studentId}</p>
                <div className="mt-4 flex flex-wrap justify-center gap-2">
                  <span className={`inline-flex items-center rounded-md px-3 py-1 text-sm font-medium border ${statusColorMap[student.studentStatus] || 'bg-gray-500/20 text-gray-400 border-gray-500/30'}`}>
                    {student.studentStatus}
                  </span>
                  <span className={`inline-flex items-center rounded-md px-3 py-1 text-sm font-medium border ${(student.behaviorScore ?? 100) >= 80 ? 'bg-green-500/20 text-green-400 border-green-500/30' : (student.behaviorScore ?? 100) >= 50 ? 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30' : 'bg-red-500/20 text-red-400 border-red-500/30'}`}>
                    คะแนนความประพฤติ: {student.behaviorScore ?? 100} คะแนน
                  </span>
                </div>
                <div className="mt-6 pt-6 border-t border-gray-100 dark:border-gray-700 text-xs text-gray-400 dark:text-gray-500 space-y-1">
                  <p>สร้างเมื่อ: {student.createdAt ? new Date(student.createdAt.seconds * 1000).toLocaleString('th-TH') : '-'}</p>
                  <p>แก้ไขล่าสุด: {student.updatedAt ? new Date(student.updatedAt.seconds * 1000).toLocaleString('th-TH') : '-'}</p>
                </div>
              </div>

              {/* Desktop Menu */}
              <div className="hidden lg:block space-y-2">

                {tabs.map((tab) => (
                  <button
                    key={tab.id}
                    onClick={() => {
                      handleTabChange(tab.id);
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

            {/* Right Content */}
            <main className="lg:col-span-8">
              {/* Mobile Tab Navigation (Horizontal Scroll) - Hidden on Desktop */}
              <div className="lg:hidden sticky top-[60px] z-30 -mx-4 px-4 py-4 mb-6 bg-gray-50/80 dark:bg-[#1e1f21]/80 backdrop-blur-md border-b border-gray-200 dark:border-gray-800 scrollbar-hide">
                <div className="flex flex-nowrap gap-2 table-responsive pb-1">
                  {tabs.map((tab) => (
                    <button
                      key={tab.id}
                      type="button"
                      onClick={() => {
                        handleTabChange(tab.id);
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
                  <div className="space-y-6 animate-fade-in">
                    {(() => {
                      const generalSteps = [
                        { label: "ข้อมูลส่วนตัว", icon: <FaIdCard /> },
                        { label: "ครอบครัว", icon: <FaUsers /> },
                        { label: "ที่อยู่", icon: <FaMapMarkerAlt /> },
                        { label: "สุขภาพ/สวัสดิการ", icon: <FaHeartbeat /> },
                        { label: "การเดินทาง", icon: <FaBus /> },
                      ];
                      return (
                        <>
                          <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
                            {generalSteps.map((s, i) => (
                              <button
                                key={i}
                                onClick={() => handleStepChange(i)}
                                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold whitespace-nowrap transition-all ${generalStep === i ? 'bg-indigo-600 text-white' : 'bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700'}`}
                              >
                                <span>{s.icon}</span>{s.label}
                              </button>
                            ))}
                          </div>

                          {generalStep === 0 && (
                            <InfoCard title="ข้อมูลส่วนตัว">
                              <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                                <div className="space-y-4">
                                  <DetailField label="คำนำหน้า" value={student.title} />
                                  <DetailField label="ชื่อจริง" value={student.firstName} />
                                  <DetailField label="นามสกุล" value={student.lastName} />
                                  <DetailField label="ชื่อเล่น" value={student.nickname} />
                                  <SensitiveDetailField label="เลขบัตรประจำตัวประชาชน" rawValue={student.idCardNumber} />
                                </div>
                                <div className="space-y-4">
                                  <DetailField label="ชื่อจริง (อังกฤษ)" value={student.firstNameEn} />
                                  <DetailField label="นามสกุล (อังกฤษ)" value={student.lastNameEn} />
                                  <DetailField label="วันเกิด" value={formatStudentBirthDateThai(student.birthDate)} />
                                  <div className="grid grid-cols-2 gap-4">
                                    <DetailField label="เพศ" value={student.gender} />
                                    <DetailField label="หมู่เลือด" value={student.bloodType} />
                                  </div>
                                  <DetailField label="จังหวัดเกิด" value={student.birthProvince} />
                                </div>
                              </div>
                              <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 pt-4 border-t border-gray-100 dark:border-gray-700 mt-4">
                                <DetailField label="ศาสนา" value={student.religion} />
                                <DetailField label="เชื้อชาติ" value={student.ethnicity} />
                                <DetailField label="สัญชาติ" value={student.nationality} />
                              </div>
                              <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 pt-4 border-t border-gray-100 dark:border-gray-700 mt-4">
                                <DetailField label="เบอร์โทรศัพท์นักเรียน" value={student.phoneNumber || "-"} />
                                <DetailField label="Line ID" value={student.lineId || "-"} />
                              </div>
                            </InfoCard>
                          )}

                          {generalStep === 1 && (
                            <div className="space-y-6">
                              <InfoCard title="ข้อมูลครอบครัว">
                                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                                  <DetailField label="จำนวนพี่น้องทั้งหมด" value={student.totalSiblings} />
                                  <DetailField label="กำลังศึกษาอยู่" value={student.studyingSiblingCount} />
                                  <DetailField label="เป็นบุตรคนที่" value={student.childOrder} />
                                  <DetailField label="เป็นคนเรียนคนที่" value={student.childOrderInCategory} />
                                </div>
                                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-4 text-sm text-gray-500">
                                  <DetailField label="พี่ชาย (คน)" value={student.elderBrotherCount} />
                                  <DetailField label="น้องชาย (คน)" value={student.youngerBrotherCount} />
                                  <DetailField label="พี่สาว (คน)" value={student.elderSisterCount} />
                                  <DetailField label="น้องสาว (คน)" value={student.youngerSisterCount} />
                                </div>
                                <div className="pt-4 border-t border-gray-100 dark:border-gray-700 mt-4 grid grid-cols-1 sm:grid-cols-2 gap-4">
                                  <DetailField label="สถานภาพสมรสบิดามารดา" value={student.parentsMaritalStatus} />
                                  <DetailField label="สถานภาพครอบครัว (นักเรียน)" value={student.familyStatus} />
                                </div>
                              </InfoCard>
                              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                <InfoCard title="ข้อมูลบิดา">
                                  <DetailField label="ชื่อ-สกุล" value={formatFullName(student.fatherTitle, student.fatherFirstName, student.fatherLastName)} />
                                  <SensitiveDetailField label="เลขบัตรประชาชน" rawValue={student.fatherIdNumber || student.fatherIdCard} />
                                  <div className="grid grid-cols-2 gap-4">
                                    <DetailField label="อาชีพ" value={student.fatherOccupation} />
                                    <DetailField label="รายได้ (เดือน)" value={student.fatherMonthlyIncome || student.fatherIncome} />
                                  </div>
                                  <DetailField label="เบอร์โทรศัพท์" value={student.fatherPhone} />
                                </InfoCard>
                                <InfoCard title="ข้อมูลมารดา">
                                  <DetailField label="ชื่อ-สกุล" value={formatFullName(student.motherTitle, student.motherFirstName, student.motherLastName)} />
                                  <SensitiveDetailField label="เลขบัตรประชาชน" rawValue={student.motherIdNumber || student.motherIdCard} />
                                  <div className="grid grid-cols-2 gap-4">
                                    <DetailField label="อาชีพ" value={student.motherOccupation} />
                                    <DetailField label="รายได้ (เดือน)" value={student.motherMonthlyIncome || student.motherIncome} />
                                  </div>
                                  <DetailField label="เบอร์โทรศัพท์" value={student.motherPhone} />
                                </InfoCard>
                              </div>
                              <InfoCard title="ข้อมูลผู้ปกครอง">
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                  <div className="space-y-4">
                                    <DetailField label="ความสัมพันธ์" value={student.guardianRelationship || student.guardianRelation} />
                                    <DetailField label="ชื่อ-สกุล" value={formatFullName(student.guardianTitle, student.guardianFirstName, student.guardianLastName, student.guardian)} />
                                    <SensitiveDetailField label="เลขบัตรประชาชน" rawValue={student.guardianIdNumber || student.guardianIdCard} />
                                  </div>
                                  <div className="space-y-4">
                                    <div className="grid grid-cols-2 gap-4">
                                      <DetailField label="อาชีพ" value={student.guardianOccupation} />
                                      <DetailField label="รายได้ (เดือน)" value={student.guardianMonthlyIncome || student.guardianIncome} />
                                    </div>
                                    <DetailField label="เบอร์โทรศัพท์" value={student.guardianPhone || student.contact} />
                                  </div>
                                </div>
                              </InfoCard>
                            </div>
                          )}

                          {generalStep === 2 && (
                            <div className="space-y-6">
                              <InfoCard title="ที่อยู่ตามทะเบียนบ้าน">
                                <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
                                  <div className="col-span-2"><DetailField label="รหัสประจำบ้าน" value={student.regHouseId} /></div>
                                  <DetailField label="บ้านเลขที่" value={student.regAddressNumber} />
                                  <DetailField label="หมู่ที่" value={student.regMoo} />
                                  <div className="col-span-2"><DetailField label="ถนน" value={student.regRoad} /></div>
                                  <div className="col-span-2"><DetailField label="ซอย" value={student.regSoi} /></div>
                                  <div className="col-span-2"><DetailField label="ตำบล/แขวง" value={student.regSubDistrict} /></div>
                                  <div className="col-span-2"><DetailField label="อำเภอ/เขต" value={student.regDistrict} /></div>
                                  <div className="col-span-2"><DetailField label="จังหวัด" value={student.regProvince} /></div>
                                  <div className="col-span-2"><DetailField label="รหัสไปรษณีย์" value={student.regZipCode} /></div>
                                  <div className="col-span-2"><DetailField label="โทรศัพท์บ้าน" value={student.regPhone} /></div>
                                </div>
                              </InfoCard>
                              <InfoCard title="ที่อยู่ปัจจุบัน">
                                <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
                                  <div className="col-span-2"><DetailField label="รหัสประจำบ้าน" value={student.curHouseId} /></div>
                                  <DetailField label="บ้านเลขที่" value={student.curAddressNumber} />
                                  <DetailField label="หมู่ที่" value={student.curMoo} />
                                  <div className="col-span-2"><DetailField label="ถนน" value={student.curRoad} /></div>
                                  <div className="col-span-2"><DetailField label="ซอย" value={student.curSoi} /></div>
                                  <div className="col-span-2"><DetailField label="ตำบล/แขวง" value={student.curSubDistrict} /></div>
                                  <div className="col-span-2"><DetailField label="อำเภอ/เขต" value={student.curDistrict} /></div>
                                  <div className="col-span-2"><DetailField label="จังหวัด" value={student.curProvince} /></div>
                                  <div className="col-span-2"><DetailField label="รหัสไปรษณีย์" value={student.curZipCode} /></div>
                                  <div className="col-span-2"><DetailField label="โทรศัพท์" value={student.curPhone} /></div>
                                </div>
                              </InfoCard>
                            </div>
                          )}

                          {generalStep === 3 && (
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                              <InfoCard title="ข้อมูลสุขภาพ">
                                <div className="grid grid-cols-2 gap-4">
                                  <DetailField label="น้ำหนัก (กก.)" value={student.weight} />
                                  <DetailField label="ส่วนสูง (ซม.)" value={student.height} />
                                </div>
                                <DetailField label="ประเภทความพิการ" value={student.disabilityType} />
                              </InfoCard>
                              <InfoCard title="ข้อมูลสวัสดิการ">
                                <div className="grid grid-cols-2 gap-4">
                                  <DetailField label="ความด้อยโอกาส" value={student.disadvantageType} />
                                  <DetailField label="การพักนอน" value={student.staysAtSchool} />
                                </div>
                                <div className="mt-4 space-y-2">
                                  <p className="text-sm font-bold text-gray-700 dark:text-gray-300">สิ่งที่ขาดแคลน:</p>
                                  <ul className="list-disc list-inside text-sm text-gray-600 dark:text-gray-400">
                                    {student.lacksUniform && <li>ขาดแคลนเครื่องแบบ</li>}
                                    {student.lacksStationery && <li>ขาดแคลนเครื่องเขียน</li>}
                                    {student.lacksTextbook && <li>ขาดแคลนแบบเรียน</li>}
                                    {student.lacksLunch && <li>ขาดแคลนอาหารกลางวัน</li>}
                                    {!student.lacksUniform && !student.lacksStationery && !student.lacksTextbook && !student.lacksLunch && <li>- ไม่มี -</li>}
                                  </ul>
                                </div>
                              </InfoCard>
                            </div>
                          )}

                          {generalStep === 4 && (
                            <InfoCard title="การเดินทาง">
                              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                                <DetailField label="วิธีเดินทาง" value={student.travelMethod} />
                                <DetailField label="เวลาที่ใช้ (นาที)" value={student.travelTime} />
                                <DetailField label="ค่าใช้จ่าย (เดือน)" value={student.travelMonthlyCost} />
                                <DetailField label="ระยะทางรวม (กม.)" value={student.travelDistance} />
                              </div>
                              <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 pt-4 border-t border-gray-100 dark:border-gray-700 mt-4">
                                <DetailField label="ระยะทางถนนลูกรัง" value={student.distanceDirtRoad} />
                                <DetailField label="ระยะทางถนนลาดยาง" value={student.distancePavedRoad} />
                                <DetailField label="ระยะทางทางน้ำ" value={student.distanceWaterway} />
                              </div>
                            </InfoCard>
                          )}

                          <div className="flex justify-between pt-2">
                            <button
                              onClick={() => handleStepChange(Math.max(0, generalStep - 1))}
                              disabled={generalStep === 0}
                              className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-bold bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700 disabled:opacity-30 disabled:cursor-not-allowed transition-all"
                            >
                              <FaChevronLeft /> ย้อนกลับ
                            </button>
                            <button
                              onClick={() => handleStepChange(Math.min(generalSteps.length - 1, generalStep + 1))}
                              disabled={generalStep === generalSteps.length - 1}
                              className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-bold bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-30 disabled:cursor-not-allowed transition-all"
                            >
                              ถัดไป <FaChevronRight />
                            </button>
                          </div>
                        </>
                      );
                    })()}
                  </div>
                )}

                {activeTab === "academic" && (
                  <div className="space-y-6 animate-fade-in">
                    <InfoCard title="ข้อมูลการศึกษา">
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
                        <DetailField label="โรงเรียนสาขา" value={student.subSchoolName || "-"} />
                      </div>
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
                        <DetailField label="ชั้นเรียน" value={student.classLevel} />
                        <DetailField label="ห้อง" value={student.room || "-"} />
                        <DetailField label="เลขที่" value={student.studentNumber} />
                        <DetailField label="รหัสนักเรียน" value={student.studentId} />
                      </div>
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-6 mt-4">
                        <DetailField label="เกรดเฉลี่ย (GPA)" value={student.gpa} />
                        <DetailField label="เกรดเฉลี่ยสะสม (GPAX)" value={student.gpax} />
                        <DetailField label="วันที่เข้าเรียน" value={student.enrollmentDate ? new Date(student.enrollmentDate).toLocaleDateString('th-TH', { year: 'numeric', month: 'long', day: 'numeric' }) : "-"} />
                        <DetailField label="คะแนนความประพฤติ" value={`${student.behaviorScore ?? 100} คะแนน`} />
                      </div>
                    </InfoCard>
                  </div>
                )}

                {activeTab === "courses" && (
                  <div className="animate-fade-in">
                    <InfoCard title="รายวิชาที่เรียน">
                      {courses.length > 0 ? (
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                          {courses.map((course) => {
                            const grade = studentGrades[course.id];
                            return (
                              <div key={course.id} className="p-4 rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50 flex flex-col gap-3 transition-all hover:shadow-md">
                                <div className="flex items-start">
                                  <div className="flex-shrink-0 p-2 bg-white dark:bg-gray-700 rounded-lg text-indigo-600 dark:text-indigo-400 shadow-sm">
                                    <FaChalkboard size={16} />
                                  </div>
                                  <div className="ml-3 overflow-hidden flex-1">
                                    <h4 className="text-sm font-bold text-gray-900 dark:text-white truncate" title={course.title || course.courseName || course.subjectName}>
                                      {course.title || course.courseName || course.subjectName || "N/A"}
                                    </h4>
                                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5 truncate">
                                      รหัส: {course.courseCode || course.code || "-"}
                                    </p>
                                  </div>
                                  {grade && (
                                    <div className={`flex-shrink-0 w-10 h-10 rounded-full flex items-center justify-center font-black text-white shadow-sm text-sm
                                      ${grade.grade === '4' ? 'bg-emerald-500' :
                                        grade.grade === '0' ? 'bg-red-500' : 'bg-indigo-500'}`}
                                    >
                                      {grade.grade}
                                    </div>
                                  )}
                                </div>

                                {grade ? (
                                  <div className="grid grid-cols-3 gap-2 pt-2 border-t border-gray-200 dark:border-gray-700">
                                    <div className="text-center">
                                      <p className="text-[10px] text-gray-500 uppercase font-bold">คะแนนเก็บ</p>
                                      <p className="text-xs font-bold text-gray-700 dark:text-gray-300">{grade.formative || 0}</p>
                                    </div>
                                    <div className="text-center">
                                      <p className="text-[10px] text-gray-500 uppercase font-bold">สอบ</p>
                                      <p className="text-xs font-bold text-gray-700 dark:text-gray-300">{(grade.midterm || 0) + (grade.final || 0)}</p>
                                    </div>
                                    <div className="text-center">
                                      <p className="text-[10px] text-gray-500 uppercase font-bold">รวม</p>
                                      <p className="text-xs font-bold text-indigo-600 dark:text-indigo-400">{grade.total || 0}</p>
                                    </div>
                                  </div>
                                ) : (
                                  <div className="pt-2 border-t border-gray-200 dark:border-gray-700 text-center">
                                    <p className="text-[10px] text-gray-400 italic">ยังไม่มีข้อมูลคะแนน</p>
                                  </div>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      ) : (
                        <div className="text-center py-6 text-gray-500">ยังไม่มีข้อมูลรายวิชา</div>
                      )}
                    </InfoCard>
                  </div>
                )}

                {activeTab === "schedule" && student && (
                  <div className="animate-fade-in">
                    <InfoCard title="ตารางสอนของชั้นเรียน">
                      {(() => {
                        const classKey = Object.entries(CLASSES).find(([, v]) => v === student.classLevel)?.[0] || '';
                        const term = calendarState.terms?.find((t: any) => {
                          const today = new Date().toISOString().split('T')[0];
                          return today >= (t.startDate || '') && today <= (t.endDate || '');
                        });
                        const currentTerm = term
                          ? (String(term.id || term.name).includes('2') ? '2' : '1')
                          : '1';
                        if (!classKey) return (
                          <div className="text-center py-10 text-gray-400">ไม่พบชั้นเรียน ({student.classLevel})</div>
                        );
                        return (
                          <StudentScheduleEmbed
                            schoolId={schoolId!}
                            classKey={classKey}
                            room={student.room || '1'}
                            academicYear={academicYear}
                            currentTerm={currentTerm}
                            className={student.classLevel}
                          />
                        );
                      })()}
                    </InfoCard>
                  </div>
                )}

                {activeTab === "behavior" && student && (
                  <div className="animate-fade-in">
                    <InfoCard title="ประวัติคะแนนพฤติกรรม">
                      <StudentBehaviorHistoryEmbed
                        schoolId={schoolId!}
                        studentId={studentId!}
                        studentName={`${student.firstName} ${student.lastName}`}
                        currentScore={student.behaviorScore ?? 100}
                      />
                    </InfoCard>
                  </div>
                )}

                {activeTab === "club" && (
                  <div className="animate-fade-in space-y-6">
                    <InfoCard title="กิจกรรมชุมนุม">
                      {isClubLoading ? (
                        <div className="py-10 text-center text-gray-500">กำลังโหลดข้อมูลชุมนุม...</div>
                      ) : (
                        <div className="space-y-6">
                          {/* Current Club Status */}
                          <div className="p-6 rounded-2xl bg-indigo-50 dark:bg-indigo-900/20 border border-indigo-100 dark:border-indigo-800">
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-4">
                                <div className="p-3 bg-white dark:bg-gray-800 rounded-xl text-indigo-600 shadow-sm">
                                  <FaUsers size={24} />
                                </div>
                                <div>
                                  <p className="text-xs font-bold text-indigo-500 uppercase tracking-wider">ชุมนุมปัจจุบัน</p>
                                  <h3 className="text-xl font-bold text-gray-900 dark:text-white">
                                    {myClub ? myClub.name : 'ยังไม่มีชุมนุม'}
                                  </h3>
                                </div>
                              </div>
                            </div>
                          </div>

                          {pendingRequest ? (
                            <div className="flex flex-col items-end gap-2">
                              <span className="px-3 py-1 bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300 rounded-full text-xs font-bold flex items-center gap-2">
                                <FaHourglassHalf className="animate-spin" /> รอดำเนินการ: {pendingRequest.targetClubName}
                              </span>
                              <button onClick={handleCancelRequest} className="text-xs text-red-500 hover:underline">ยกเลิกคำขอ</button>
                            </div>
                          ) : isTransferEnabled && myClub && !showTransferList ? (
                            <button
                              onClick={() => { setShowTransferList(true); setClubPage(1); }}
                              className="px-4 py-2 bg-amber-500 hover:bg-amber-600 text-white text-sm font-bold rounded-xl transition-all shadow-md hover:shadow-lg flex items-center gap-2"
                            >
                              <FaExchangeAlt size={14} /> ขอย้ายชุมนุม
                            </button>
                          ) : myClub && !isTransferEnabled ? (
                            <div className="text-xs font-semibold text-gray-500 dark:text-gray-400">
                              ระบบยังไม่เปิดให้ย้ายชุมนุมด้วยตนเอง
                            </div>
                          ) : null}
                        </div>
                      )}
                    </InfoCard>
                  </div>
                )}

                {/* Available Clubs List */}
                {activeTab === "club" && !isClubLoading && !pendingRequest && (!myClub || showTransferList) && (
                  <div>
                    <div className="flex items-center justify-between mb-4">
                      <h3 className="text-md font-bold text-gray-700 dark:text-gray-300">
                        {myClub ? 'เลือกชุมนุมที่ต้องการย้ายไป' : 'สมัครเข้าชุมนุม'}
                      </h3>
                      {myClub && (
                        <button onClick={() => setShowTransferList(false)} className="text-xs text-gray-500 hover:underline">ยกเลิก</button>
                      )}
                    </div>

                    {(() => {
                      const availableClubs = allClubs
                        .filter(c => c.id !== myClub?.id && canStudentJoinClub(c))
                        .sort((a, b) => String(a.name || '').localeCompare(String(b.name || ''), 'th'));
                      const clubsPerPage = 5;
                      const totalPages = Math.ceil(availableClubs.length / clubsPerPage);
                      const currentClubs = availableClubs.slice((clubPage - 1) * clubsPerPage, clubPage * clubsPerPage);

                      return (
                        <div className="space-y-6">
                          <div className="grid grid-cols-1 gap-4">
                            {availableClubs.length === 0 && (
                              <div className="p-6 rounded-2xl border border-dashed border-gray-200 dark:border-gray-700 text-center text-sm font-medium text-gray-500 dark:text-gray-400">
                                ไม่พบชุมนุมที่เปิดรับสำหรับระดับชั้นของคุณ
                              </div>
                            )}
                            {currentClubs.map(club => {
                              const status = getClubStatus(club);
                              const classRange = formatClassLevelRange(club.allowedClassLevelFrom, club.allowedClassLevelTo);
                              const isFull = (club.memberCount || 0) >= (club.capacity || 0);
                              const canRequest = status.isOpen && !isFull;
                              return (
                                <div key={club.id} className="p-5 rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800/50 flex flex-col gap-3 hover:shadow-lg transition-all animate-in fade-in zoom-in-95 duration-300">
                                  <div className="flex items-center justify-between gap-2">
                                    <div className="flex items-center gap-2 min-w-0">
                                      <h4 className="text-lg font-bold text-gray-900 dark:text-white truncate">{club.name}</h4>
                                      <button
                                        onClick={() => handleClubRequest(club, myClub ? 'transfer' : 'apply')}
                                        disabled={!canRequest}
                                        className={`shrink-0 px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-all disabled:bg-gray-200 dark:disabled:bg-gray-700 disabled:text-gray-400 disabled:cursor-not-allowed ${myClub
                                          ? 'bg-amber-50 text-amber-600 hover:bg-amber-600 hover:text-white border border-amber-200'
                                          : 'bg-indigo-600 text-white hover:bg-indigo-700 shadow shadow-indigo-200 dark:shadow-none'
                                          }`}
                                      >
                                        {isFull ? 'เต็มแล้ว' : myClub ? <><FaExchangeAlt /> ขอย้าย</> : <><FaUserPlus /> สมัคร</>}
                                      </button>
                                    </div>
                                    <span className={`shrink-0 text-xs font-bold px-2 py-1 rounded-full ${status.color}`}>{status.text}</span>
                                  </div>
                                  <p className="text-sm text-gray-500 dark:text-gray-400 line-clamp-2">{club.description || 'ไม่มีรายละเอียด'}</p>
                                  <div className="flex items-center gap-2">
                                    <span className={`text-xs px-2 py-1 rounded-lg font-bold ${isFull ? 'bg-red-50 text-red-600 dark:bg-red-900/20 dark:text-red-400' : 'bg-emerald-50 text-emerald-600 dark:bg-emerald-900/20 dark:text-emerald-400'}`}>
                                      สมาชิก: {club.memberCount || 0}/{club.capacity || 0} คน
                                    </span>
                                    <span className="text-xs px-2 py-1 bg-sky-50 text-sky-600 dark:bg-sky-900/20 dark:text-sky-400 rounded-lg font-bold">ระดับชั้น: {classRange}</span>
                                  </div>
                                </div>
                              )
                            })}
                          </div>

                          {/* Pagination Controls */}
                          {totalPages > 1 && (
                            <div className="flex justify-center items-center flex-wrap gap-2 mt-6">
                              {Array.from({ length: totalPages }, (_, i) => i + 1).map(p => (
                                <button
                                  key={p}
                                  onClick={() => setClubPage(p)}
                                  className={`w-9 h-9 rounded-xl text-xs font-bold transition-all border ${clubPage === p
                                    ? 'bg-indigo-600 text-white border-indigo-600 shadow-md scale-110'
                                    : 'bg-white dark:bg-gray-800 text-gray-500 border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700'
                                    }`}
                                >
                                  {p}
                                </button>
                              ))}
                            </div>
                          )}
                        </div>
                      );
                    })()}
                  </div>
                )}

                {activeTab === "attendance" && (
                  <div className="animate-fade-in space-y-6">
                    <div className="bg-white dark:bg-[#2a2b2f] rounded-2xl p-6 shadow-sm border border-gray-100 dark:border-gray-800">
                      <h2 className="text-lg font-semibold mb-6 pb-4 border-b border-gray-200 dark:border-gray-700 text-gray-800 dark:text-gray-200">สถิติการลงเวลา (ปีการศึกษา {academicYear})</h2>

                      {isStatsLoading ? (
                        <div className="py-10 text-center text-gray-500">กำลังประมวลผลข้อมูล...</div>
                      ) : (
                        <>
                          <div className="flex lg:grid lg:grid-cols-7 gap-2 sm:gap-3 table-responsive pb-4 scrollbar-hide -mx-2 px-2 lg:mx-0 lg:px-0">
                            <div className="flex-shrink-0 lg:w-full w-24 sm:w-28 min-h-[70px] sm:min-h-[85px] flex flex-col items-center justify-center p-2 bg-green-50 dark:bg-green-900/20 rounded-xl border border-green-100 dark:border-green-800">
                              <div className="text-lg sm:text-xl font-bold text-green-600 dark:text-green-400">{stats.present || 0}</div>
                              <div className="text-[9px] sm:text-[10px] text-gray-500 dark:text-gray-400 text-center leading-tight">มาปกติ</div>
                            </div>
                            <div className="flex-shrink-0 lg:w-full w-24 sm:w-28 min-h-[70px] sm:min-h-[85px] flex flex-col items-center justify-center p-2 bg-yellow-50 dark:bg-yellow-900/20 rounded-xl border border-yellow-100 dark:border-yellow-800">
                              <div className="text-lg sm:text-xl font-bold text-yellow-600 dark:text-yellow-400">{stats.late || 0}</div>
                              <div className="text-[9px] sm:text-[10px] text-gray-500 dark:text-gray-400 text-center leading-tight">สาย</div>
                            </div>
                            <div className="flex-shrink-0 lg:w-full w-24 sm:w-28 min-h-[70px] sm:min-h-[85px] flex flex-col items-center justify-center p-2 bg-blue-50 dark:bg-blue-900/20 rounded-xl border border-blue-100 dark:border-blue-800">
                              <div className="text-lg sm:text-xl font-bold text-blue-600 dark:text-blue-400">{stats.leave || 0}</div>
                              <div className="text-[9px] sm:text-[10px] text-gray-500 dark:text-gray-400 text-center leading-tight">ลา</div>
                            </div>
                            <div className="flex-shrink-0 lg:w-full w-24 sm:w-28 min-h-[70px] sm:min-h-[85px] flex flex-col items-center justify-center p-2 bg-red-50 dark:bg-red-900/20 rounded-xl border border-red-100 dark:border-red-800">
                              <div className="text-lg sm:text-xl font-bold text-red-600 dark:text-red-400">{stats.absent || 0}</div>
                              <div className="text-[9px] sm:text-[10px] text-gray-500 dark:text-gray-400 text-center leading-tight">ขาด</div>
                            </div>
                            <div className="flex-shrink-0 lg:w-full w-24 sm:w-28 min-h-[70px] sm:min-h-[85px] flex flex-col items-center justify-center p-2 bg-orange-50 dark:bg-orange-900/20 rounded-xl border border-orange-100 dark:border-orange-800">
                              <div className="text-lg sm:text-xl font-bold text-orange-600 dark:text-orange-400">{stats.early || 0}</div>
                              <div className="text-[9px] sm:text-[10px] text-gray-500 dark:text-gray-400 text-center leading-tight">กลับก่อน</div>
                            </div>
                            <div className="flex-shrink-0 lg:w-full w-24 sm:w-28 min-h-[70px] sm:min-h-[85px] flex flex-col items-center justify-center p-2 bg-purple-50 dark:bg-purple-900/20 rounded-xl border border-purple-100 dark:border-purple-800">
                              <div className="text-lg sm:text-xl font-bold text-purple-600 dark:text-purple-400">{stats.noCheckout || 0}</div>
                              <div className="text-[9px] sm:text-[10px] text-gray-500 dark:text-gray-400 text-center leading-tight">ไม่ลงเวลาออก</div>
                            </div>
                            <div className="flex-shrink-0 lg:w-full w-24 sm:w-28 min-h-[70px] sm:min-h-[85px] flex flex-col items-center justify-center p-2 bg-indigo-50 dark:bg-indigo-900/20 rounded-xl border border-indigo-100 dark:border-indigo-800">
                              <div className="text-lg sm:text-xl font-bold text-indigo-600 dark:text-indigo-400">{stats.official_travel_days || 0}</div>
                              <div className="text-[9px] sm:text-[10px] text-gray-500 dark:text-gray-400 text-center leading-tight">ไปร่วมกิจกรรม (วัน)</div>
                            </div>
                          </div>

                          {/* Charts for Attendance */}
                          {attendanceChartData.length > 0 && (
                            <div className="mt-8 grid grid-cols-1 lg:grid-cols-2 gap-6">
                              <div className="h-80 bg-gray-50 dark:bg-gray-800/50 rounded-xl p-4 border border-gray-100 dark:border-gray-700 flex flex-col items-center justify-center">
                                <h3 className="text-center text-sm font-medium mb-4 text-gray-500 dark:text-gray-400 w-full">สัดส่วนการลงเวลา</h3>
                                <Chart
                                  chartType="PieChart"
                                  data={googleAttendanceData}
                                  options={getPieOptions(attendanceChartData)}
                                  width={"100%"}
                                  height={"100%"}
                                />
                              </div>
                              <div className="h-80 bg-gray-50 dark:bg-gray-800/50 rounded-xl p-4 border border-gray-100 dark:border-gray-700">
                                <h3 className="text-center text-sm font-medium mb-4 text-gray-500 dark:text-gray-400">จำนวนครั้งการลงเวลา</h3>
                                <ResponsiveContainer width="100%" height="100%" minWidth={0} initialDimension={{ width: 1, height: 1 }}>
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

                              {/* Line Chart for Attendance Trend */}
                              {attendanceTrendData.length > 0 ? (
                                <div className="col-span-1 lg:col-span-2 h-96 mt-2 bg-gray-50 dark:bg-gray-800/50 rounded-xl p-4 border border-gray-100 dark:border-gray-700">
                                  <h3 className="text-center text-sm font-medium mb-4 text-gray-500 dark:text-gray-400">แนวโน้มเวลาการมาเรียน (30 วันล่าสุด)</h3>
                                  <ResponsiveContainer width="100%" height="100%" minWidth={0} initialDimension={{ width: 1, height: 1 }}>
                                    <LineChart data={attendanceTrendData}>
                                      <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                                      <XAxis dataKey="date" fontSize={12} tickFormatter={(val) => val.split('-').slice(1).join('/')} stroke={isDarkMode ? "#9ca3af" : "#4b5563"} />
                                      <YAxis
                                        domain={['dataMin - 0.2', 'dataMax + 0.2']}
                                        tickFormatter={(val) => {
                                          const h = Math.floor(val);
                                          const m = Math.round((val - h) * 60);
                                          return `${h}:${m.toString().padStart(2, '0')}`;
                                        }}
                                        stroke={isDarkMode ? "#9ca3af" : "#4b5563"}
                                      />
                                      <RechartsTooltip
                                        contentStyle={{ backgroundColor: isDarkMode ? '#1f2937' : '#fff', borderColor: isDarkMode ? '#374151' : '#e5e7eb', color: isDarkMode ? '#fff' : '#000' }}
                                        formatter={(value: any) => {
                                          const h = Math.floor(value);
                                          const m = Math.round((value - h) * 60);
                                          return [`${h}:${m.toString().padStart(2, '0')} น.`, "เวลาที่มา"];
                                        }}
                                        labelFormatter={(label) => `วันที่ ${label}`}
                                      />
                                      <Line type="monotone" dataKey="value" stroke="#8884d8" strokeWidth={2} dot={{ r: 4 }} activeDot={{ r: 6 }} name="เวลาที่มา" />
                                    </LineChart>
                                  </ResponsiveContainer>
                                </div>
                              ) : (
                                <div className="col-span-1 lg:col-span-2 py-8 text-center text-gray-500 dark:text-gray-400">ไม่มีข้อมูลแนวโน้มการมาเรียนในช่วงเวลานี้</div>
                              )}
                            </div>
                          )}
                        </>
                      )}
                    </div>

                    {monthlyStats.length > 0 && (
                      <InfoCard title="สถิติการมาเรียนรายเดือน">
                        <div className="h-96 w-full">
                          <ResponsiveContainer width="100%" height="100%" minWidth={0} initialDimension={{ width: 1, height: 1 }}>
                            <BarChart data={monthlyStats} margin={{ top: 5, right: 20, left: -10, bottom: 5 }}>
                              <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                              <XAxis dataKey="name" fontSize={12} stroke={isDarkMode ? "#9ca3af" : "#4b5563"} />
                              <YAxis allowDecimals={false} stroke={isDarkMode ? "#9ca3af" : "#4b5563"} />
                              <RechartsTooltip
                                cursor={{ fill: isDarkMode ? '#374151' : '#f3f4f6' }}
                                contentStyle={{ backgroundColor: isDarkMode ? '#1f2937' : '#fff', borderColor: isDarkMode ? '#374151' : '#e5e7eb', color: isDarkMode ? '#fff' : '#000' }}
                              />
                              <Legend wrapperStyle={{ fontSize: '12px', paddingTop: '10px' }} />
                              <Bar dataKey="present" stackId="a" fill="#22c55e" name="มาปกติ" />
                              <Bar dataKey="late" stackId="a" fill="#eab308" name="สาย" />
                              <Bar dataKey="leave" stackId="a" fill="#3b82f6" name="ลา" />
                              <Bar dataKey="absent" stackId="a" fill="#ef4444" name="ขาด" />
                              <Bar dataKey="early" stackId="a" fill="#f97316" name="กลับก่อน" />
                              <Bar dataKey="noCheckout" stackId="a" fill="#a855f7" name="ไม่ลงเวลาออก" />
                            </BarChart>
                          </ResponsiveContainer>
                        </div>
                      </InfoCard>
                    )}

                    <InfoCard title="สถิติการเข้าแถวหน้าเสาธง">
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-center">
                        <div className="p-4 bg-green-50 dark:bg-green-900/20 rounded-xl border border-green-100 dark:border-green-800">
                          <div className="text-2xl font-bold text-green-600 dark:text-green-400">{finalFlagStats.present || 0}</div>
                          <div className="text-sm text-gray-500 dark:text-gray-400">มาเข้าแถว</div>
                        </div>
                        <div className="p-4 bg-yellow-50 dark:bg-yellow-900/20 rounded-xl border border-yellow-100 dark:border-yellow-800">
                          <div className="text-2xl font-bold text-yellow-600 dark:text-yellow-400">{finalFlagStats.late || 0}</div>
                          <div className="text-sm text-gray-500 dark:text-gray-400">สาย</div>
                        </div>
                        <div className="p-4 bg-blue-50 dark:bg-blue-900/20 rounded-xl border border-blue-100 dark:border-blue-800">
                          <div className="text-2xl font-bold text-blue-600 dark:text-blue-400">{finalFlagStats.leave || 0}</div>
                          <div className="text-sm text-gray-500 dark:text-gray-400">ลา</div>
                        </div>
                        <div className="p-4 bg-red-50 dark:bg-red-900/20 rounded-xl border border-red-100 dark:border-red-800">
                          <div className="text-2xl font-bold text-red-600 dark:text-red-400">{finalFlagStats.absent || 0}</div>
                          <div className="text-sm text-gray-500 dark:text-gray-400">ขาด</div>
                        </div>
                      </div>

                      {/* Charts for Flag Ceremony */}
                      {flagChartData.length > 0 && (
                        <div className="mt-8 grid grid-cols-1 lg:grid-cols-2 gap-6">
                          <div className="h-80 bg-gray-50 dark:bg-gray-800/50 rounded-xl p-4 border border-gray-100 dark:border-gray-700 flex flex-col items-center justify-center">
                            <h3 className="text-center text-sm font-medium mb-4 text-gray-500 dark:text-gray-400 w-full">สัดส่วนการเข้าแถว</h3>
                            <Chart
                              chartType="PieChart"
                              data={googleFlagData}
                              options={getPieOptions(flagChartData)}
                              width={"100%"}
                              height={"100%"}
                            />
                          </div>
                          <div className="h-80 bg-gray-50 dark:bg-gray-800/50 rounded-xl p-4 border border-gray-100 dark:border-gray-700">
                            <h3 className="text-center text-sm font-medium mb-4 text-gray-500 dark:text-gray-400">จำนวนครั้งการเข้าแถว</h3>
                            <ResponsiveContainer width="100%" height="100%" minWidth={0} initialDimension={{ width: 1, height: 1 }}>
                              <BarChart data={flagChartData}>
                                <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                                <XAxis dataKey="name" fontSize={12} stroke={isDarkMode ? "#9ca3af" : "#4b5563"} />
                                <YAxis allowDecimals={false} stroke={isDarkMode ? "#9ca3af" : "#4b5563"} />
                                <RechartsTooltip
                                  cursor={{ fill: isDarkMode ? '#374151' : '#f3f4f6' }}
                                  contentStyle={{ backgroundColor: isDarkMode ? '#1f2937' : '#fff', borderColor: isDarkMode ? '#374151' : '#e5e7eb', color: isDarkMode ? '#fff' : '#000' }}
                                />
                                <Bar dataKey="value" name="จำนวนครั้ง" radius={[4, 4, 0, 0]}>
                                  {flagChartData.map((entry, index) => (
                                    <Cell key={`cell-${index}`} fill={entry.color} />
                                  ))}
                                </Bar>
                              </BarChart>
                            </ResponsiveContainer>
                          </div>
                        </div>
                      )}
                    </InfoCard>
                  </div>
                )}
                {activeTab === "official_travel" && (
                  <div className="animate-fade-in space-y-6">
                    <InfoCard title="ประวัติการลาของนักเรียน">
                      {studentLeaveRequests.length > 0 ? (
                        <div className="space-y-3">
                          {studentLeaveRequests.map((req) => {
                            const getDateStr = (v: any) => {
                              if (v?.toDate) return v.toDate().toLocaleDateString('th-TH', { year: 'numeric', month: 'short', day: 'numeric' });
                              if (typeof v === 'string') return new Date(v).toLocaleDateString('th-TH', { year: 'numeric', month: 'short', day: 'numeric' });
                              return '-';
                            };
                            const statusColor = req.status === 'approved'
                              ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-400 border border-emerald-500/20'
                              : req.status === 'rejected'
                                ? 'bg-red-100 text-red-700 dark:bg-red-500/10 dark:text-red-400 border border-red-500/20'
                                : 'bg-amber-100 text-amber-700 dark:bg-amber-500/10 dark:text-amber-400 border border-amber-500/20';
                            const statusText = req.status === 'approved' ? 'อนุมัติ' : req.status === 'rejected' ? 'ไม่อนุมัติ' : 'รอพิจารณา';
                            return (
                              <div key={req.id} className="p-4 rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50 flex flex-col sm:flex-row sm:items-center gap-3">
                                <div className="flex-shrink-0 w-10 h-10 rounded-xl bg-indigo-100 dark:bg-indigo-500/10 flex items-center justify-center text-indigo-600 dark:text-indigo-400">
                                  <FaHourglassHalf />
                                </div>
                                <div className="flex-1 min-w-0">
                                  <div className="flex items-center gap-2 flex-wrap">
                                    <span className="text-sm font-bold text-gray-900 dark:text-white">{req.leaveType || 'ลา'}</span>
                                    <span className={`text-[10px] font-black px-2 py-0.5 rounded-full ${statusColor}`}>{statusText}</span>
                                  </div>
                                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                                    {getDateStr(req.startDate)} — {getDateStr(req.endDate)}
                                  </p>
                                  {req.reason && (
                                    <p className="text-xs text-gray-600 dark:text-gray-300 mt-1 line-clamp-2">{req.reason}</p>
                                  )}
                                </div>
                                <button
                                  onClick={() => handleLeaveExportPdf(req)}
                                  disabled={exportingLeaveId === req.id}
                                  className="flex-shrink-0 flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-bold bg-red-50 text-red-600 hover:bg-red-600 hover:text-white dark:bg-red-500/10 dark:text-red-400 dark:hover:bg-red-500 dark:hover:text-white border border-red-200 dark:border-red-500/30 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
                                >
                                  {exportingLeaveId === req.id ? (
                                    <span className="w-3 h-3 border-2 border-current border-t-transparent rounded-full animate-spin" />
                                  ) : (
                                    <FaFilePdf />
                                  )}
                                  PDF
                                </button>
                              </div>
                            );
                          })}
                        </div>
                      ) : (
                        <div className="text-center py-12 text-gray-500 dark:text-gray-400">
                          <FaHourglassHalf className="mx-auto text-4xl mb-3 opacity-20" />
                          <p>ยังไม่มีประวัติการลา</p>
                        </div>
                      )}
                    </InfoCard>
                  </div>
                )}

                {activeTab === "sdq" && student && isParentLogin && (
                  <div className="animate-fade-in">
                    <InfoCard title="แบบประเมิน SDQ (มุมมองผู้ปกครอง)">
                      <StudentSDQParentEmbed
                        schoolId={schoolId!}
                        studentId={studentId!}
                        student={{
                          title: student.title,
                          firstName: student.firstName,
                          lastName: student.lastName,
                          studentNumber: student.studentNumber,
                          classLevel: student.classLevel,
                          room: student.room,
                        }}
                        academicYear={academicYear}
                        canAssess={parentChildren.some(c => c.studentDocId === studentId)}
                      />
                    </InfoCard>
                  </div>
                )}
              </div>
            </main>
          </div>
        </div>
      </div>
    </LayoutWrapper>
  );
}
