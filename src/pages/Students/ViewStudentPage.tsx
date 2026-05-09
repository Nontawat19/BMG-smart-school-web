import React, { useState, useEffect, useMemo } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { useSelector } from "react-redux";
import { RootState } from "@/store";
import MainLayout from "@/layouts/MainLayout";
import { firestore, auth } from "@/firebase";
import { signOut } from "firebase/auth";
import { doc, getDoc, Timestamp, collection, query, where, getDocs, documentId, runTransaction, arrayUnion, increment, arrayRemove, addDoc, serverTimestamp, deleteDoc, orderBy } from "firebase/firestore";
import Swal from 'sweetalert2';
import { FaPen, FaArrowLeft, FaChalkboard, FaUser, FaUsers, FaBook, FaBookOpen, FaChevronRight, FaChevronLeft, FaClock, FaFlag, FaSignOutAlt, FaSun, FaMoon, FaBars, FaTimes, FaUserPlus, FaExchangeAlt, FaHourglassHalf, FaPlane, FaIdCard, FaMapMarkerAlt, FaHeartbeat, FaBus, FaGraduationCap } from "react-icons/fa";
import { PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, Legend, ResponsiveContainer, LineChart, Line } from 'recharts';
import { Chart } from "react-google-charts";
import { useTheme } from "../../ThemeContext";
import OfficialTravelPdfButton from "../../components/Pdf/OfficialTravel/OfficialTravelPdfButton";

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
  rfid?: string;
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
  "เรียนอยู่": "bg-green-500/20 text-green-400 border-green-500/30",
  "พักการเรียน": "bg-yellow-500/20 text-yellow-400 border-yellow-500/30",
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
  const commonTitles = ["นาย", "นาง", "นางสาว", "ด.ช.", "ด.ญ.", "น.ส."];

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
  const tabs = [
    { id: "general", label: "ข้อมูลทั่วไป", icon: <FaIdCard /> },
    { id: "academic", label: "การศึกษา", icon: <FaGraduationCap /> },
    { id: "family", label: "ครอบครัว", icon: <FaUsers /> },
    { id: "address", label: "ที่อยู่", icon: <FaMapMarkerAlt /> },
    { id: "welfare", label: "สุขภาพ/สวัสดิการ", icon: <FaHeartbeat /> },
    { id: "travel", label: "การเดินทาง", icon: <FaBus /> },
    { id: "attendance", label: "สถาติการมาเรียน", icon: <FaClock /> },
    { id: "courses", label: "รายวิชาที่เรียน", icon: <FaBook /> },
    { id: "club", label: "กิจกรรมชุมนุม", icon: <FaUsers /> },
    { id: "official_travel", label: "ไปราชการ", icon: <FaPlane /> },
  ];

  const { schoolId, studentId } = useParams<{ schoolId: string, studentId: string }>();
  const navigate = useNavigate();
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
  const [clubPage, setClubPage] = useState(1);
  const [activeTab, setActiveTab] = useState("general");
  const [attendanceTrendData, setAttendanceTrendData] = useState<any[]>([]);
  const [monthlyStats, setMonthlyStats] = useState<any[]>([]);
  const [academicYear, setAcademicYear] = useState<string>("");
  const [calculatedStats, setCalculatedStats] = useState<{
    present: number; late: number; leave: number; absent: number; early: number; noCheckout: number; official_travel_days?: number;
  } | null>(null);
  const [globalClubStartDate, setGlobalClubStartDate] = useState<string>('');
  const [globalClubEndDate, setGlobalClubEndDate] = useState<string>('');
  const [isStatsLoading, setIsStatsLoading] = useState(false);
  const [officialTravelRequests, setOfficialTravelRequests] = useState<any[]>([]);
  const [schoolInfo, setSchoolInfo] = useState<{ schoolName: string; directorName: string; deputyName: string; personnelHeadName: string; affiliation: string }>({
    schoolName: "",
    directorName: "",
    deputyName: "",
    personnelHeadName: "",
    affiliation: ""
  });
  
  // Navigation State
  const [allStudentIds, setAllStudentIds] = useState<string[]>([]);
  const currentIndex = allStudentIds.indexOf(studentId || "");
  const nextStudentId = currentIndex < allStudentIds.length - 1 ? allStudentIds[currentIndex + 1] : null;
  const prevStudentId = currentIndex > 0 ? allStudentIds[currentIndex - 1] : null;

  // RFID Mapping State
  const [rfidValue, setRfidValue] = useState("");
  const [isSavingRfid, setIsSavingRfid] = useState(false);

  useEffect(() => {
    const fetchAllIds = async () => {
      if (!schoolId || !student) return;
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

  useEffect(() => {
    if (student) {
      setRfidValue(student.rfid || "");
    }
  }, [student]);

  const handleSaveRfid = async (val: string) => {
    if (!schoolId || !studentId) return;
    setIsSavingRfid(true);
    try {
      const { updateDoc, doc } = await import("firebase/firestore");
      const studentRef = doc(firestore, "school-settings", schoolId, "students", studentId);
      await updateDoc(studentRef, { rfid: val });
      
      Swal.fire({
        toast: true,
        position: 'top-end',
        icon: 'success',
        title: 'บันทึก RFID สำเร็จ',
        showConfirmButton: false,
        timer: 1000
      });

      if (nextStudentId) {
        navigate(`/school/${schoolId}/students/view/${nextStudentId}`);
      } else {
        setStudent(prev => prev ? { ...prev, rfid: val } : null);
      }
    } catch (err) {
      console.error("Error saving RFID:", err);
      Swal.fire('Error', 'ไม่สามารถบันทึก RFID ได้', 'error');
    } finally {
      setIsSavingRfid(false);
    }
  };

  const { isDarkMode, toggleTheme } = useTheme();
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const profile = useSelector((state: RootState) => state.profile);
  const isStudentLogin = localStorage.getItem('currentUserType') === 'student';

  const handleLogout = async () => {
    await signOut(auth);
    localStorage.removeItem('currentUserType');
    localStorage.removeItem('studentSession'); // 📌 เพิ่มการลบ session ของนักเรียน
    navigate('/login');
  };

  const getClubStatus = (club: any): { text: string; color: string; isOpen: boolean; } => {
    const now = new Date();
    now.setHours(0, 0, 0, 0);

    // Use global dates if available
    if (globalClubStartDate && globalClubEndDate) {
      const start = new Date(globalClubStartDate);
      const end = new Date(globalClubEndDate);
      end.setHours(23, 59, 59, 999);

      if (now >= start && now <= end) return { text: 'เปิดรับสมัคร', color: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300', isOpen: true };
      if (now < start) return { text: `เปิดวันที่ ${start.toLocaleDateString('th-TH')}`, color: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300', isOpen: false };
      return { text: 'ปิดรับสมัครแล้ว', color: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300', isOpen: false };
    }

    // Fallback: If no global dates are set, assume it's NOT open (or open? let's follow the admin page logic which says "Unspecified time" but here we should probably be safe).
    // Actually, looking at previous logic: "If no dates are set, assume it's always open" -> Let's keep it consistent with "Unspecified" but maybe allow?
    // Let's matching Admin Page logic: "ไม่ระบุเวลา"
    return { text: 'ไม่ระบุเวลา', color: 'bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300', isOpen: true }; // Allowing for now if not set, or we can close it. 
  };
  // 📌 เพิ่มการตรวจสอบสิทธิ์การเข้าถึง (เนื่องจากถอด ProtectedRoute ออกจาก App.tsx)
  useEffect(() => {
    const isStudent = localStorage.getItem('currentUserType') === 'student';
    if (!isStudent && !auth.currentUser) {
      navigate('/login');
    }
  }, [navigate]);

  useEffect(() => {
    if (schoolId) {
      const fetchSchoolInfo = async () => {
        try {
          const schoolRef = doc(firestore, "school-settings", schoolId);
          const schoolSnap = await getDoc(schoolRef);
          if (schoolSnap.exists()) {
            const sData = schoolSnap.data();
            setSchoolInfo({
              schoolName: sData.schoolName || "",
              directorName: sData.directorName || "",
              deputyName: (sData.deputyPrefix || "") + (sData.deputyName || ""),
              personnelHeadName: (sData.personnelHeadPrefix || "") + (sData.personnelHeadName || ""),
              affiliation: sData.affiliation || ""
            });
            if (sData.academicYear) {
              setAcademicYear(sData.academicYear);
            }
          }

          // Also check calendar for year (fallback)
          const calendarDocRef = doc(firestore, "school-settings", schoolId, "main_calendar", "default");
          const calendarSnap = await getDoc(calendarDocRef);
          if (calendarSnap.exists()) {
            const data = calendarSnap.data();
            if (data.academicYear && !schoolInfo.schoolName) {
              setAcademicYear(data.academicYear || "");
            }
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
        const clubsList = clubsSnap.docs.map(d => ({ id: d.id, ...d.data() }));
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

        const requestsRef = collection(firestore, "school-settings", schoolId, "club_requests");
        const q = query(requestsRef, where("studentId", "==", studentId), where("status", "==", "pending"));
        const reqSnap = await getDocs(q);
        if (!reqSnap.empty) {
          setPendingRequest({ id: reqSnap.docs[0].id, ...reqSnap.docs[0].data() });
        } else {
          setPendingRequest(null);
        }

        // ตรวจสอบการตั้งค่าการย้ายชุมนุมจากฝ่ายวิชาการ
        const configRef = doc(firestore, "school-settings", schoolId, "configs", "club_settings");
        const configSnap = await getDoc(configRef);
        if (configSnap.exists()) {
          const data = configSnap.data();
          setIsTransferEnabled(data.allowTransfer || false);
          setGlobalClubStartDate(data.registrationStartDate || '');
          setGlobalClubEndDate(data.registrationEndDate || '');
        }
      } catch (err) {
        console.error("Error fetching club info:", err);
      } finally {
        setIsClubLoading(false);
      }
    };
    fetchClubInfo();
  }, [activeTab, schoolId, studentId]);

  useEffect(() => {
    if (!schoolId || !studentId) {
      Swal.fire({ icon: 'error', title: 'เกิดข้อผิดพลาด', text: 'ไม่พบรหัสนักเรียน', background: '#2a2b2f', color: '#ffffff' });
      navigate(-1); // Go back
      return;
    }

    const fetchStudentData = async () => {
      setIsLoading(true);
      try {
        const docRef = doc(firestore, "school-settings", schoolId, "students", studentId);
        const docSnap = await getDoc(docRef);
        if (docSnap.exists()) {
          const studentData = docSnap.data() as StudentData;
          setStudent(studentData);

          // Fetch courses for the student's class
          if (studentData.classLevel) {
            try {
              const coursesRef = collection(firestore, "school-settings", schoolId, "courses");
              const q = query(coursesRef, where("classId", "==", studentData.classLevel.replace('ป.', 'p').replace('ม.', 'm')));
              const querySnapshot = await getDocs(q);
              const coursesData = querySnapshot.docs.map(doc => {
                const data = doc.data();
                return { id: doc.id, ...data } as CourseData;
              });
              setCourses(coursesData);
            } catch (err) {
              console.error("Error fetching courses:", err);
            }
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
  }, [schoolId, studentId, navigate]);

  useEffect(() => {
    if (activeTab === 'official_travel' && schoolId && studentId) {
      const fetchTravelRequests = async () => {
        try {
          const reqRef = collection(firestore, "school-settings", schoolId, "students", studentId, "travel_summary");
          const q = query(reqRef, orderBy("createdAt", "desc")); // orderBy requires index, if fails, order manually or ensure index
          const snapshot = await getDocs(q);
          const requests = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
          setOfficialTravelRequests(requests);
        } catch (err) {
          console.error("Error fetching travel requests:", err);
          // Fallback manual sort if index missing
          // ... 
        }
      };
      fetchTravelRequests();
    }
  }, [activeTab, schoolId, studentId]);

  const handleClubRequest = async (targetClub: any, type: 'apply' | 'transfer') => {
    if (!schoolId || !studentId || !student) return;

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
      try {
        await addDoc(collection(firestore, "school-settings", schoolId, "club_requests"), {
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
        });
        Swal.fire({ icon: 'success', title: 'ส่งคำขอสำเร็จ', text: 'กรุณารอครูผู้รับผิดชอบอนุมัติ', timer: 2000, showConfirmButton: false });
        setActiveTab('club'); // Refresh
      } catch (err) {
        Swal.fire('ผิดพลาด', 'ไม่สามารถส่งคำขอได้', 'error');
      }
    }
  };

  const handleCancelRequest = async () => {
    if (!pendingRequest || !schoolId) return;
    try {
      await deleteDoc(doc(firestore, "school-settings", schoolId, "club_requests", pendingRequest.id));
      setPendingRequest(null);
      Swal.fire({ icon: 'success', title: 'ยกเลิกคำขอแล้ว', timer: 1500, showConfirmButton: false });
    } catch (err) {
      Swal.fire('ผิดพลาด', 'ไม่สามารถยกเลิกได้', 'error');
    }
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
              Easy School Management
            </span>
          </div>
        </div>

        {/* Desktop Menu */}
        <div className="hidden lg:flex items-center gap-4">
          <button onClick={toggleTheme} className="p-2 rounded-full hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-600 dark:text-yellow-400 transition-colors">
            {isDarkMode ? <FaSun size={20} /> : <FaMoon size={20} />}
          </button>
          <button onClick={handleLogout} className="flex items-center gap-2 px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg text-sm font-medium transition-colors">
            <FaSignOutAlt /> ออกจากระบบ
          </button>
          <div className="flex items-center gap-3 pl-4 border-l border-gray-200 dark:border-gray-700 ml-2">
            <span className="font-bold text-sm text-gray-800 dark:text-white truncate max-w-[200px]">
              {student ? `${student.title}${student.firstName} ${student.lastName}` : 'Guest'}
            </span>
            <img
              src={student?.profileImageUrl || `https://ui-avatars.com/api/?name=${student?.firstName || 'Student'}+${student?.lastName || ''}&background=random`}
              alt="Profile"
              className="w-10 h-10 rounded-full object-cover border border-gray-200 dark:border-gray-700"
            />
          </div>
        </div>

        {/* Mobile Hamburger */}
        <div className="lg:hidden">
          <button onClick={() => setIsSidebarOpen(true)} className="p-2 text-gray-600 dark:text-gray-300">
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
          <div className="flex flex-col items-center mb-8">
            <img
              src={student?.profileImageUrl || `https://ui-avatars.com/api/?name=${student?.firstName || 'Student'}+${student?.lastName || ''}&background=random`}
              alt="Profile"
              className="w-20 h-20 rounded-full object-cover border-4 border-indigo-100 dark:border-gray-700 mb-4"
            />
            <h3 className="text-lg font-bold text-gray-900 dark:text-white text-center">
              {student ? `${student.title}${student.firstName} ${student.lastName}` : 'Guest'}
            </h3>
            <p className="text-sm text-gray-500 dark:text-gray-400">{student?.studentId}</p>
          </div>
          <div className="space-y-3 flex-1 overflow-y-auto [&::-webkit-scrollbar]:hidden [-ms-overflow-style:'none'] [scrollbar-width:'none']">
            <div className="mb-4 space-y-2">
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider px-4">เมนูหลัก</p>
              {tabs.map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => { setActiveTab(tab.id); setIsSidebarOpen(false); }}
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
              <div>
                <h1 className="text-3xl font-bold tracking-tight">ข้อมูลนักเรียน</h1>
                <p className="mt-1 text-gray-500 dark:text-gray-400">
                  รายละเอียดข้อมูลของ: <span className="font-semibold text-indigo-400">{student.firstName} {student.lastName}</span>
                </p>
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
                <img
                  src={student.profileImageUrl || `https://ui-avatars.com/api/?name=${student.firstName}+${student.lastName}&background=random`}
                  alt="Student profile"
                  className="w-32 h-32 rounded-full object-cover border-4 border-white dark:border-gray-700 shadow-lg mx-auto mb-4"
                />
                <h2 className="text-xl font-bold text-gray-900 dark:text-white">{student.title}{student.firstName} {student.lastName}</h2>
                <p className="text-sm text-gray-500 dark:text-gray-400">รหัสนักเรียน: {student.studentId}</p>
                <div className="mt-4">
                  <span className={`inline-flex items-center rounded-md px-3 py-1 text-sm font-medium border ${statusColorMap[student.studentStatus] || 'bg-gray-500/20 text-gray-400 border-gray-500/30'}`}>
                    {student.studentStatus}
                  </span>
                </div>
                <div className="mt-2 flex flex-wrap justify-center gap-1">
                  {(student.role || ["student"]).map((r, i) => (
                    <span key={i} className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold ${r === 'student' ? 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300' :
                      r === 'parent' ? 'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300' :
                        'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300'
                      }`}>
                      {r === 'student' ? 'นักเรียน' : r === 'parent' ? 'ผู้ปกครอง' : r}
                    </span>
                  ))}
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
                  <div className="space-y-6 animate-fade-in">
                    {/* RFID Mapping Card */}
                    {!isStudentLogin && (
                      <InfoCard title="การเชื่อมโยงบัตร RFID" className="border-2 border-indigo-500/20 bg-indigo-50/30 dark:bg-indigo-900/10">
                        <div className="flex flex-col sm:flex-row items-center gap-4">
                          <div className="flex-1 w-full">
                            <label className="block text-xs font-bold text-indigo-500 uppercase tracking-wider mb-2">สแกนบัตรเพื่อลงทะเบียน</label>
                            <input 
                              type="text"
                              value={rfidValue}
                              onChange={(e) => setRfidValue(e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') {
                                  handleSaveRfid(rfidValue);
                                }
                              }}
                              autoFocus
                              placeholder="วางบัตรบนเครื่องสแกน..."
                              className="w-full bg-white dark:bg-gray-700 border-2 border-indigo-200 dark:border-indigo-900/50 rounded-xl px-4 py-3 text-lg font-mono focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all shadow-inner"
                            />
                          </div>
                          <div className="flex-shrink-0 flex items-end h-full pt-6">
                            <button 
                              onClick={() => handleSaveRfid(rfidValue)}
                              disabled={isSavingRfid || !rfidValue}
                              className="px-6 py-3 bg-indigo-600 text-white rounded-xl font-bold shadow-lg shadow-indigo-200 dark:shadow-none hover:bg-indigo-700 transition-all disabled:opacity-50"
                            >
                              {isSavingRfid ? "กำลังบันทึก..." : "บันทึกและถัดไป"}
                            </button>
                          </div>
                        </div>
                        <p className="text-[10px] text-gray-400 mt-2 italic">* เมื่อสแกนบัตร ระบบจะบันทึกข้อมูลและข้ามไปยังนักเรียนคนถัดไปโดยอัตโนมัติ</p>
                      </InfoCard>
                    )}
                    <InfoCard title="ข้อมูลส่วนตัว">
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                        <div className="space-y-4">
                          <DetailField label="คำนำหน้า" value={student.title} />
                          <DetailField label="ชื่อจริง" value={student.firstName} />
                          <DetailField label="นามสกุล" value={student.lastName} />
                          <DetailField label="ชื่อเล่น" value={student.nickname} />
                          <DetailField label="เลขบัตรประจำตัวประชาชน" value={maskIdCardNumber(student.idCardNumber)} />
                        </div>
                        <div className="space-y-4">
                          <DetailField label="ชื่อจริง (อังกฤษ)" value={student.firstNameEn} />
                          <DetailField label="นามสกุล (อังกฤษ)" value={student.lastNameEn} />
                          <DetailField label="วันเกิด" value={student.birthDate ? new Date(student.birthDate).toLocaleDateString('th-TH', { year: 'numeric', month: 'long', day: 'numeric' }) : "-"} />
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
                      <div className="mt-4">
                        <span className={`inline-flex items-center rounded-md px-3 py-1 text-sm font-medium border ${statusColorMap[student.studentStatus] || 'bg-gray-500/20 text-gray-400 border-gray-500/30'}`}>
                          {student.studentStatus}
                        </span>
                      </div>
                    </InfoCard>
                  </div>
                )}

                {activeTab === "family" && (
                  <div className="space-y-6 animate-fade-in">
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
                        <DetailField label="เลขบัตรประชาชน" value={maskIdCardNumber(student.fatherIdNumber || student.fatherIdCard)} />
                        <div className="grid grid-cols-2 gap-4">
                          <DetailField label="อาชีพ" value={student.fatherOccupation} />
                          <DetailField label="รายได้ (เดือน)" value={student.fatherMonthlyIncome || student.fatherIncome} />
                        </div>
                        <DetailField label="เบอร์โทรศัพท์" value={student.fatherPhone} />
                      </InfoCard>

                      <InfoCard title="ข้อมูลมารดา">
                        <DetailField label="ชื่อ-สกุล" value={formatFullName(student.motherTitle, student.motherFirstName, student.motherLastName)} />
                        <DetailField label="เลขบัตรประชาชน" value={maskIdCardNumber(student.motherIdNumber || student.motherIdCard)} />
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
                          <DetailField label="เลขบัตรประชาชน" value={maskIdCardNumber(student.guardianIdNumber || student.guardianIdCard)} />
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

                {activeTab === "address" && (
                  <div className="space-y-6 animate-fade-in">
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

                {activeTab === "welfare" && (
                  <div className="space-y-6 animate-fade-in">
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
                  </div>
                )}

                {activeTab === "travel" && (
                  <div className="space-y-6 animate-fade-in">
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
                          ) : isTransferEnabled && myClub && !showTransferList && (
                            <button
                              onClick={() => { setShowTransferList(true); setClubPage(1); }}
                              className="px-4 py-2 bg-amber-500 hover:bg-amber-600 text-white text-sm font-bold rounded-xl transition-all shadow-md hover:shadow-lg flex items-center gap-2"
                            >
                              <FaExchangeAlt size={14} /> ขอย้ายชุมนุม
                            </button>
                          )
                          }
                        </div>
                      )}
                    </InfoCard>
                  </div>
                )}

                {/* Available Clubs List */}
                {(!pendingRequest && (!myClub || showTransferList)) && (
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
                      const availableClubs = allClubs.filter(c => c.id !== myClub?.id);
                      const clubsPerPage = 1;
                      const totalPages = Math.ceil(availableClubs.length / clubsPerPage);
                      const currentClubs = availableClubs.slice((clubPage - 1) * clubsPerPage, clubPage * clubsPerPage);

                      return (
                        <div className="space-y-6">
                          <div className="grid grid-cols-1 gap-4">
                            {currentClubs.map(club => {
                              const status = getClubStatus(club);
                              return (
                                <div key={club.id} className="p-5 rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800/50 flex flex-col gap-4 hover:shadow-lg transition-all animate-in fade-in zoom-in-95 duration-300">
                                  <div className="flex items-start gap-4">
                                    <div className="flex-1 min-w-0">
                                      <div className="flex justify-between items-start">
                                        <h4 className="text-lg font-bold text-gray-900 dark:text-white truncate pr-2">{club.name}</h4>
                                        <span className={`text-xs font-bold px-2 py-1 rounded-full ${status.color}`}>{status.text}</span>
                                      </div>
                                      <p className="text-sm text-gray-500 dark:text-gray-400 line-clamp-2 mt-1">{club.description || 'ไม่มีรายละเอียด'}</p>
                                      <div className="mt-2 flex items-center gap-2">
                                        <span className="text-xs px-2 py-1 bg-emerald-50 text-emerald-600 dark:bg-emerald-900/20 dark:text-emerald-400 rounded-lg font-bold">รับสมัคร: {club.capacity || 0} คน</span>
                                      </div>
                                    </div>
                                  </div>
                                  <button
                                    onClick={() => handleClubRequest(club, myClub ? 'transfer' : 'apply')}
                                    disabled={!status.isOpen}
                                    className={`w-full py-3 rounded-xl text-sm font-bold flex items-center justify-center gap-2 transition-all disabled:bg-gray-200 dark:disabled:bg-gray-700 disabled:text-gray-400 disabled:cursor-not-allowed ${myClub
                                      ? 'bg-amber-50 text-amber-600 hover:bg-amber-600 hover:text-white border border-amber-200'
                                      : 'bg-indigo-600 text-white hover:bg-indigo-700 shadow-lg shadow-indigo-200 dark:shadow-none'
                                      }`}
                                  >
                                    {myClub ? <><FaExchangeAlt /> ขอย้ายมาที่นี่</> : <><FaUserPlus /> สมัครเข้าชุมนุม</>}
                                  </button>
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
                      <h2 className="text-lg font-semibold mb-6 pb-4 border-b border-gray-200 dark:border-gray-700 text-gray-800 dark:text-gray-200">สถิติการลงเวลา (ปีการศึกษา {academicYear || new Date().getFullYear() + 543})</h2>

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
                              <div className="text-[9px] sm:text-[10px] text-gray-500 dark:text-gray-400 text-center leading-tight">ไปราชการ (วัน)</div>
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
                                <ResponsiveContainer width="100%" height="100%" minWidth={0}>
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
                                  <ResponsiveContainer width="100%" height="100%" minWidth={0}>
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
                          <ResponsiveContainer width="100%" height="100%" minWidth={0}>
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
                            <ResponsiveContainer width="100%" height="100%" minWidth={0}>
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
                    <InfoCard title="ประวัติการขอไปราชการ">
                      <div className="flex justify-end mb-4">
                        <button
                          onClick={() => navigate(`/school/${schoolId}/official-travel-request?type=student`)}
                          className="bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors flex items-center gap-2"
                        >
                          <FaPlane /> สร้างคำขอใหม่
                        </button>
                      </div>

                      {officialTravelRequests.length > 0 ? (
                        <div className="table-responsive -mx-6 px-6 pb-2">
                          <table className="min-w-[850px] w-full text-left">
                            <thead>
                              <tr className="bg-gray-50 dark:bg-gray-800/50 text-gray-600 dark:text-gray-300 text-xs uppercase tracking-wider font-bold">
                                <th className="px-4 py-4 rounded-l-xl w-[20%]">วันที่เดินทาง</th>
                                <th className="px-4 py-4 w-[25%]">เรื่อง</th>
                                <th className="px-4 py-4 w-[25%]">สถานที่</th>
                                <th className="px-4 py-4 text-center w-[10%]">สถานะ</th>
                                <th className="px-4 py-4 rounded-r-xl text-right w-[20%]">การจัดการ</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
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
                                      />
                                    </div>
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      ) : (
                        <div className="text-center py-12 text-gray-500 dark:text-gray-400">
                          <FaPlane className="mx-auto text-4xl mb-3 opacity-20" />
                          <p>ยังไม่มีประวัติการขอไปราชการ</p>
                        </div>
                      )}
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