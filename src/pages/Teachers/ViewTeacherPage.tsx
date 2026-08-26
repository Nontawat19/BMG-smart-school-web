import React, { useState, useEffect } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { useSelector } from "react-redux";
import { RootState } from "@/store";
import MainLayout from "@/layouts/MainLayout";
import ProfileAvatar from "@/components/Shared/ProfileAvatar";
import { firestore } from "@/firebase";
import { doc, getDoc, Timestamp, collection, collectionGroup, query, where, getDocs, orderBy, documentId } from "firebase/firestore";
import Swal from 'sweetalert2';
import { FaPen, FaArrowLeft, FaBook, FaUser, FaBriefcase, FaInfoCircle, FaChevronRight, FaChevronLeft, FaClock, FaChalkboard, FaExchangeAlt, FaPlane } from "react-icons/fa";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, Cell, ResponsiveContainer, LineChart, Line, Legend } from 'recharts';
import { Chart } from "react-google-charts";
import { useTheme } from "../../ThemeContext";
import OfficialTravelPdfButton from "../../components/Pdf/OfficialTravel/OfficialTravelPdfButton";
import { getGroupPersonnel } from "@/utils/schoolUtils";

// --- Type Definition ---
interface TeacherData {
  title: string;
  firstName: string;
  lastName: string;
  teacherId: string;
  position?: string;
  department?: string;
  subject?: string;
  dob: string;
  gender: string;
  contact: string;
  address: string;
  profileImageUrl: string;
  email?: string; // Email might not be present on all records
  createdAt?: Timestamp;
  updatedAt?: Timestamp;
  isHomeroomTeacher?: boolean;
  homeroomGrade?: string;
  academicStanding?: string;
  licenseNumber?: string;
  startDate?: string;
  educationLevel?: string;
  major?: string;
  lineId?: string;
  advisorRole?: string;
  learningArea?: string;
  isHeadOfLearningArea?: boolean;
  isHeadOfAssessment?: boolean;
  isGuidanceTeacher?: boolean;
  status?: string;
  attendanceStats?: {
    present: number;
    late: number;
    leave: number;
    absent: number;
    early: number;
    noCheckout?: number;
    official_travel_days?: number; // Added field
  };
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

interface Substitution {
  id: string;
  date: Timestamp;
  period: number;
  subjectName: string;
  classId: string;
  originalTeacherName: string;
  status?: string;
}

const formatGradeLevel = (grade?: string) => {
  if (!grade) return "";

  const upperGrade = grade.toUpperCase();

  const map: Record<string, string> = {
    "P1": "ป.1", "P2": "ป.2", "P3": "ป.3", "P4": "ป.4", "P5": "ป.5", "P6": "ป.6",
    "M1": "ม.1", "M2": "ม.2", "M3": "ม.3", "M4": "ม.4", "M5": "ม.5", "M6": "ม.6",
  };

  if (map[upperGrade]) return `ชั้น ${map[upperGrade]}`;

  // รองรับกรณีที่เป็นช่วงชั้น หรือรหัสอื่นๆ ที่ขึ้นต้นด้วย M, P, K
  if (upperGrade.startsWith("M")) return `ชั้น ม.${upperGrade.substring(1)}`;
  if (upperGrade.startsWith("P")) return `ชั้น ป.${upperGrade.substring(1)}`;

  return `ชั้น ${grade}`;
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
    <div className="max-w-6xl mx-auto px-3 sm:px-4 md:px-6 lg:px-8 py-4 sm:py-6 lg:py-8">
      {/* Header Skeleton */}
      <header className="mb-8">
        <div className="flex justify-between items-center">
          <div>
            <div className="h-8 w-48 bg-gray-300 dark:bg-gray-700 rounded"></div>
            <div className="mt-2 h-4 w-64 bg-gray-300 dark:bg-gray-700 rounded"></div>
          </div>
          <div className="h-10 w-24 bg-gray-300 dark:bg-gray-700 rounded-md"></div>
        </div>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        {/* Left Sidebar Skeleton */}
        <div className="lg:col-span-4 space-y-6">
          <div className="bg-white dark:bg-[#2a2b2f] rounded-2xl p-6 shadow-sm border border-gray-100 dark:border-gray-800 text-center">
            <div className="w-32 h-32 rounded-full bg-gray-300 dark:bg-gray-700 mx-auto mb-4"></div>
            <div className="h-6 w-3/4 bg-gray-300 dark:bg-gray-700 mx-auto rounded mb-2"></div>
            <div className="h-4 w-1/2 bg-gray-300 dark:bg-gray-700 mx-auto rounded"></div>
          </div>
          <div className="bg-white dark:bg-[#2a2b2f] rounded-2xl p-4 shadow-sm border border-gray-100 dark:border-gray-800">
            <div className="space-y-2">
              <div className="h-12 w-full bg-gray-300 dark:bg-gray-700 rounded-xl"></div>
              <div className="h-12 w-full bg-gray-200 dark:bg-gray-800 rounded-xl"></div>
              <div className="h-12 w-full bg-gray-200 dark:bg-gray-800 rounded-xl"></div>
            </div>
          </div>
        </div>

        {/* Right Content Skeleton */}
        <div className="lg:col-span-8 space-y-6">
          <div className="bg-white dark:bg-[#2a2b2f] p-6 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-800">
            <div className="h-6 w-1/3 bg-gray-300 dark:bg-gray-700 rounded mb-6"></div>
            <div className="space-y-4">
              <div className="h-10 w-full bg-gray-300 dark:bg-gray-700 rounded"></div>
              <div className="grid grid-cols-2 gap-4">
                <div className="h-10 w-full bg-gray-300 dark:bg-gray-700 rounded"></div>
                <div className="h-10 w-full bg-gray-300 dark:bg-gray-700 rounded"></div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
);

export default function ViewTeacherPage() {
  const { schoolId, teacherId } = useParams<{ schoolId: string, teacherId: string }>();
  const navigate = useNavigate();
  const [teacher, setTeacher] = useState<TeacherData | null>(null);
  const [courses, setCourses] = useState<CourseData[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [activeTab, setActiveTab] = useState("general");
  const [attendanceTrendData, setAttendanceTrendData] = useState<any[]>([]);
  const [monthlyStats, setMonthlyStats] = useState<any[]>([]);
  const [statsLoaded, setStatsLoaded] = useState(false);
  const { isDarkMode } = useTheme();
  const profile = useSelector((state: RootState) => state.profile);
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 12;
  const [substitutions, setSubstitutions] = useState<Substitution[]>([]);
  // substitution doc id -> whether the substitute teacher actually checked attendance for it.
  // See ProfilePage.tsx's identical logic for the full rationale.
  const [substitutionCompletionMap, setSubstitutionCompletionMap] = useState<Record<string, boolean>>({});
  const [substitutionsCurrentPage, setSubstitutionsCurrentPage] = useState(1);
  const [substitutionsItemsPerPage, setSubstitutionsItemsPerPage] = useState(10);
  const academicYear = useSelector((state: RootState) => state.calendar.academicYear);
  const [officialTravelRequests, setOfficialTravelRequests] = useState<any[]>([]);
  
  // Navigation State
  const [allTeacherIds, setAllTeacherIds] = useState<string[]>([]);
  const currentIndex = allTeacherIds.indexOf(teacherId || "");
  const nextTeacherId = currentIndex < allTeacherIds.length - 1 ? allTeacherIds[currentIndex + 1] : null;
  const prevTeacherId = currentIndex > 0 ? allTeacherIds[currentIndex - 1] : null;

  const [schoolInfo, setSchoolInfo] = useState<{ schoolName: string; directorName: string; deputyName: string; personnelHeadName: string; personnelHeadRoleLabel: string; affiliation: string }>({
    schoolName: "",
    directorName: "",
    deputyName: "",
    personnelHeadName: "",
    personnelHeadRoleLabel: "",
    affiliation: ""
  });

  useEffect(() => {
    const fetchAllIds = async () => {
      if (!schoolId) return;
      try {
        const q = query(collection(firestore, "school-settings", schoolId, "teachers"), orderBy("teacherId"));
        const snap = await getDocs(q);
        setAllTeacherIds(snap.docs.map(d => d.id));
      } catch (err) {
        console.error("Error fetching teacher IDs:", err);
      }
    };
    fetchAllIds();
  }, [schoolId]);

  useEffect(() => {
    if (activeTab === 'official_travel' && schoolId && teacherId) {
      const fetchTravelRequests = async () => {
        try {
          const reqRef = collection(firestore, "school-settings", schoolId, "teachers", teacherId, "travel_summary");
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
  }, [activeTab, schoolId, teacherId]);

  useEffect(() => {
    if (activeTab === 'attendance' && !statsLoaded && schoolId && teacherId) {
      const fetchStats = async () => {
        try {
          // Fetch Attendance for teachers
          // Optimization: ดึงข้อมูลเฉพาะปีปัจจุบัน (เริ่ม 1 ม.ค.) เพื่อประหยัดการอ่านฐานข้อมูล
          const currentYear = new Date().getFullYear();
          const startOfYear = `${currentYear}-01-01`;

          const attRef = collection(firestore, "school-settings", schoolId, "teachers", teacherId, "attendance");
          const q = query(attRef, where(documentId(), ">=", startOfYear));
          const attSnap = await getDocs(q);
          const trendData: any[] = [];
          const thaiMonths = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'];
          const monthlyData: { [key: string]: { present: number; late: number; leave: number; absent: number; early: number; noCheckout: number; name: string; } } = {};

          attSnap.forEach(doc => {
            const data = doc.data();
            const status = data.status;

            // Prepare Trend and Monthly Data
            const dateStr = doc.id; // YYYY-MM-DD
            let timestamp: Timestamp | null = null;
            if (data.checkinTime && data.checkinTime instanceof Timestamp) {
              timestamp = data.checkinTime;
            } else if (data.timestamp && data.timestamp instanceof Timestamp) {
              timestamp = data.timestamp;
            }

            if (timestamp) {
              const d = timestamp.toDate();
              const time = d.toTimeString().slice(0, 5);  // HH:mm

              // Trend data logic
              if (dateStr && time && (status === 'มา' || status === 'สาย')) {
                const [h, m] = time.split(':').map(Number);
                if (!isNaN(h) && !isNaN(m)) {
                  trendData.push({ date: dateStr, time, value: h + (m / 60), status });
                }
              }

              // Monthly aggregation logic
              const month = d.getMonth(); // 0-11
              const year = d.getFullYear();
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
          setAttendanceTrendData(trendData.sort((a, b) => a.date.localeCompare(b.date)).slice(-30));

          const monthlyStatsArray = Object.keys(monthlyData)
            .sort()
            .map(key => monthlyData[key]);
          setMonthlyStats(monthlyStatsArray);

          setStatsLoaded(true);
        } catch (err) {
          console.error("Error fetching teacher stats", err);
        }
      };
      fetchStats();
    }
  }, [activeTab, schoolId, teacherId, statsLoaded]);

  useEffect(() => {
    if (activeTab === 'substitution' && schoolId && teacherId) {
      const fetchSubstitutions = async () => {
        try {
          const subRef = collection(firestore, "school-settings", schoolId, "substitutions");
          const q = query(subRef, where("substituteTeacherId", "==", teacherId));
          const querySnapshot = await getDocs(q);
          const subs = querySnapshot.docs.map(doc => ({
            id: doc.id,
            ...doc.data()
          })) as Substitution[];

          subs.sort((a, b) => b.date.seconds - a.date.seconds);
          setSubstitutions(subs);
        } catch (err) {
          console.error("Error fetching substitutions:", err);
        }
      };
      fetchSubstitutions();
    }
  }, [activeTab, schoolId, teacherId]);

  useEffect(() => {
    if (activeTab !== 'substitution' || !schoolId || substitutions.length === 0) {
      if (substitutions.length === 0) setSubstitutionCompletionMap({});
      return;
    }

    const toDateObj = (value: Substitution['date']): Date | null => {
      if (!value) return null;
      if ((value as any).toDate) return (value as any).toDate();
      if ((value as any).seconds) return new Date((value as any).seconds * 1000);
      return new Date(value as any);
    };

    const fetchCompletionStatus = async () => {
      try {
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
        const CHUNK_SIZE = 10;

        for (let i = 0; i < pastSubIds.length; i += CHUNK_SIZE) {
          const chunk = pastSubIds.slice(i, i + CHUNK_SIZE);
          const q = query(
            attendanceRef,
            where('schoolId', '==', schoolId),
            where('substitutionId', 'in', chunk)
          );
          const snap = await getDocs(q);
          snap.forEach(docSnap => {
            const subId = docSnap.data().substitutionId;
            if (subId) completedIds.add(subId);
          });
        }

        const map: Record<string, boolean> = {};
        completedIds.forEach(id => { map[id] = true; });
        setSubstitutionCompletionMap(map);
      } catch (err) {
        console.error("Error fetching substitution completion status:", err);
      }
    };
    fetchCompletionStatus();
  }, [activeTab, schoolId, substitutions]);

  const getSubstitutionStatus = (sub: Substitution): 'upcoming' | 'completed' | 'missed' => {
    const d = sub.date?.toDate ? sub.date.toDate() : ((sub.date as any)?.seconds ? new Date((sub.date as any).seconds * 1000) : (sub.date ? new Date(sub.date as any) : null));
    if (!d || d > new Date()) return 'upcoming';
    return substitutionCompletionMap[sub.id] ? 'completed' : 'missed';
  };

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
          }
        } catch (err) {
          console.error("Error fetching school info:", err);
        }
      };
      fetchSchoolInfo();
    }
  }, [schoolId]);

  useEffect(() => {
    if (!schoolId || !teacherId) {
      Swal.fire({ icon: 'error', title: 'เกิดข้อผิดพลาด', text: 'ไม่พบรหัสครู', background: '#2a2b2f', color: '#ffffff' });
      navigate(-1);
      return;
    }

    const fetchTeacherData = async () => {
      setIsLoading(true);
      try {
        const docRef = doc(firestore, "school-settings", schoolId, "teachers", teacherId);
        const docSnap = await getDoc(docRef);
        let teacherData: TeacherData | null = null;

        if (docSnap.exists()) {
          teacherData = docSnap.data() as TeacherData;
        } else {
          const userDocRef = doc(firestore, "users", teacherId);
          const userSnap = await getDoc(userDocRef);
          if (userSnap.exists()) {
            const userData = userSnap.data();
            const nameParts = (userData.fullName || '').trim().split(/\s+/).filter(Boolean);
            const roles = Array.isArray(userData.role) ? userData.role : (typeof userData.role === 'string' ? [userData.role] : []);
            const isSchoolAdmin = roles.some((role: string) => role.toLowerCase() === 'school_admin');
            const isSuperAdmin = roles.some((role: string) => role.toLowerCase() === 'super_admin');

            teacherData = {
              title: userData.title || '',
              firstName: userData.firstName || nameParts[0] || userData.fullName || userData.email || 'ไม่ระบุชื่อ',
              lastName: userData.lastName || nameParts.slice(1).join(' '),
              email: userData.email || '',
              profileImageUrl: userData.profileImageUrl || userData.profileUrl || '',
              teacherId: userData.teacherId || '',
              position: userData.position || (isSuperAdmin ? 'ผู้ดูแลระบบสูงสุด' : isSchoolAdmin ? 'ผู้ดูแลระบบโรงเรียน' : 'ครู'),
              department: userData.department || 'งานบริหารทั่วไป',
              status: userData.status || 'อยู่',
              learningArea: userData.learningArea || '',
              dob: userData.dob || '',
              gender: userData.gender || '',
              contact: userData.contact || '',
              address: userData.address || '',
            } as TeacherData;
          }
        }

        if (teacherData) {
          setTeacher(teacherData);

          // Fetch courses taught by this teacher
          // 📌 แก้ไข: ใช้ teacherId (Document ID) ในการค้นหา แทน teacherData.teacherId (รหัสบุคลากร)
          if (teacherId) {
            try {
              const coursesRef = collection(firestore, "school-settings", schoolId, "courses");
              const q = query(coursesRef, where("teacherId", "==", teacherId));
              const querySnapshot = await getDocs(q);
              const coursesData = querySnapshot.docs.map(doc => {
                const data = doc.data();
                return { id: doc.id, ...data, gradeLevel: data.gradeLevel || data.classId } as CourseData;
              });
              setCourses(coursesData);
            } catch (err) {
              console.error("Error fetching courses:", err);
            }
          }
        } else {
          Swal.fire({ icon: 'error', title: 'ไม่พบข้อมูล', text: 'ไม่พบข้อมูลครูที่ต้องการ', background: '#2a2b2f', color: '#ffffff' });
          navigate(-1);
        }
      } catch (error) {
        console.error("Error fetching teacher data:", error);
        Swal.fire({ icon: 'error', title: 'เกิดข้อผิดพลาด', text: 'เกิดข้อผิดพลาดในการดึงข้อมูล', background: '#2a2b2f', color: '#ffffff' });
      } finally {
        setIsLoading(false);
      }
    };

    fetchTeacherData();
  }, [schoolId, teacherId, navigate]);

  if (isLoading) {
    return (
      <MainLayout>
        <SkeletonLoader />
      </MainLayout>
    );
  }

  if (!teacher) {
    return null;
  }

  const tabs = [
    { id: "general", label: "ข้อมูลส่วนตัว", icon: <FaUser /> },
    { id: "work", label: "ข้อมูลการทำงาน", icon: <FaBriefcase /> },
    { id: "teaching", label: "การสอน", icon: <FaBook /> },
    { id: "attendance", label: "สถิติการมาทำงาน", icon: <FaClock /> },
    { id: "substitution", label: "สถิติการสอนแทน", icon: <FaExchangeAlt /> },
    { id: "official_travel", label: "ไปราชการ", icon: <FaPlane /> },
  ];

  // Prepare Chart Data
  const stats = teacher?.attendanceStats || { present: 0, late: 0, leave: 0, absent: 0, early: 0, noCheckout: 0 };
  const attendanceChartData = [
    { name: 'มาปกติ', value: stats.present || 0, color: '#22c55e' },
    { name: 'สาย', value: stats.late || 0, color: '#eab308' },
    { name: 'ลา', value: stats.leave || 0, color: '#3b82f6' },
    { name: 'ขาด', value: stats.absent || 0, color: '#ef4444' },
    { name: 'กลับก่อน', value: stats.early || 0, color: '#f97316' },
    { name: 'ไม่ลงเวลาออก', value: stats.noCheckout || 0, color: '#a855f7' },
  ].filter(d => d.value > 0);

  const googleAttendanceData = [
    ["Status", "Count"],
    ...attendanceChartData.map(d => [d.name, d.value]),
  ];

  const getPieOptions = (data: typeof attendanceChartData) => ({
    is3D: true,
    backgroundColor: "transparent",
    legend: { position: "bottom", textStyle: { color: isDarkMode ? "#e5e7eb" : "#374151" } },
    colors: data.map(d => d.color),
    chartArea: { width: "90%", height: "80%" },
  });

  return (
    <MainLayout>
      <div className="min-h-screen bg-gray-50 dark:bg-[#1e1f21] text-gray-900 dark:text-white">
        <div className="max-w-6xl mx-auto px-3 sm:px-4 md:px-6 lg:px-8 py-4 sm:py-6 lg:py-8">
          <header className="mb-8">
            <div className="flex justify-between items-center">
              <div>
                <h1 className="text-3xl font-bold tracking-tight">ข้อมูลครู</h1>
                <p className="mt-1 text-gray-500 dark:text-gray-400">
                  รายละเอียดข้อมูลของ: <span className="font-semibold text-indigo-400">{teacher.title}{teacher.firstName} {teacher.lastName}</span>
                  {teacher.academicStanding && <span className="ml-2 text-sm text-gray-500 dark:text-gray-400">({teacher.academicStanding})</span>}
                </p>
              </div>
              <div className="flex items-center gap-x-4">
                <div className="flex items-center bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-100 dark:border-gray-700 p-1 mr-2">
                  <button 
                    disabled={!prevTeacherId} 
                    onClick={() => navigate(`/school/${schoolId}/teachers/view/${prevTeacherId}`)}
                    className="p-2 text-gray-500 hover:text-indigo-500 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                    title="ก่อนหน้า"
                  >
                    <FaChevronLeft size={20} />
                  </button>
                  <div className="w-px h-6 bg-gray-200 dark:bg-gray-700 mx-1"></div>
                  <button 
                    disabled={!nextTeacherId} 
                    onClick={() => navigate(`/school/${schoolId}/teachers/view/${nextTeacherId}`)}
                    className="p-2 text-gray-500 hover:text-indigo-500 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                    title="ถัดไป"
                  >
                    <FaChevronRight size={20} />
                  </button>
                </div>
                <button onClick={() => navigate(-1)} className="inline-flex items-center gap-x-2 rounded-md bg-gray-600/50 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-gray-700/50 transition-colors">
                  <FaArrowLeft />
                  กลับ
                </button>
                <Link to={`/school/${schoolId}/teachers/edit/${teacherId}`} className="inline-flex items-center gap-x-2 rounded-md bg-indigo-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-indigo-700 transition-colors">
                  <FaPen />
                  แก้ไขข้อมูล
                </Link>
              </div>
            </div>
          </header>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
            {/* Left Sidebar */}
            <aside className="lg:col-span-4 space-y-6 lg:sticky lg:top-24 self-start">
              <div className="bg-white dark:bg-[#2a2b2f] rounded-2xl p-6 shadow-sm border border-gray-100 dark:border-gray-800 text-center">
                <ProfileAvatar
                  src={teacher.profileImageUrl || `https://ui-avatars.com/api/?name=${teacher.firstName}+${teacher.lastName}&background=random`}
                  alt={`${teacher.firstName} ${teacher.lastName}`}
                  className="w-32 h-32 border-4 border-white dark:border-gray-700 shadow-lg mx-auto mb-4"
                />
                <h2 className="text-xl font-bold text-gray-900 dark:text-white">{teacher.title}{teacher.firstName} {teacher.lastName}</h2>
                <p className="text-sm text-gray-500 dark:text-gray-400 mb-2">{teacher.email}</p>
                
                <div className="flex justify-center mb-4">
                  {teacher.status ? (
                    <span className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-bold ${
                      teacher.status === "อยู่" ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400" :
                      teacher.status === "ย้าย" ? "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400" :
                      teacher.status === "เกษียณ" ? "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-400" :
                      teacher.status === "ลาศึกษาต่อ" ? "bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-400" :
                      teacher.status === "ช่วยราชการ" ? "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400" :
                      teacher.status === "ออก" ? "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400" :
                      teacher.status === "ถึงแก่กรรม" ? "bg-black text-white dark:bg-gray-950" :
                      "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400"
                    }`}>
                      {teacher.status === "อยู่" ? "อยู่ (ปฏิบัติหน้าที่)" :
                       teacher.status === "ออก" ? "ออก (ลาออก/พ้นสภาพ)" :
                       teacher.status}
                    </span>
                  ) : (
                    <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-bold bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400">
                      อยู่ (ปฏิบัติหน้าที่)
                    </span>
                  )}
                </div>

                <div className="mt-6 pt-6 border-t border-gray-100 dark:border-gray-700 text-xs text-gray-400 dark:text-gray-500 space-y-1">
                  <p>สร้างเมื่อ: {teacher.createdAt ? new Date(teacher.createdAt.seconds * 1000).toLocaleString('th-TH') : '-'}</p>
                  <p>แก้ไขล่าสุด: {teacher.updatedAt ? new Date(teacher.updatedAt.seconds * 1000).toLocaleString('th-TH') : 'ยังไม่มีการแก้ไข'}</p>
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
                <div className="flex flex-nowrap gap-2 table-responsive pb-1 scrollbar-hide">
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
                    <div className="bg-white dark:bg-[#2a2b2f] rounded-2xl p-6 shadow-sm border border-gray-100 dark:border-gray-800">
                      <h2 className="text-lg font-semibold mb-6 pb-4 border-b border-gray-200 dark:border-gray-700 text-gray-800 dark:text-gray-200">ข้อมูลส่วนตัวและวุฒิการศึกษา</h2>
                      <div className="space-y-4">
                        <div>
                          <DetailField label="ชื่อ-นามสกุล" value={`${teacher.title}${teacher.firstName} ${teacher.lastName}`} />
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                          <DetailField label="วันเกิด" value={teacher.dob} />
                          <DetailField label="เพศ" value={teacher.gender} />
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                          <DetailField label="เลขที่ใบประกอบวิชาชีพ" value={teacher.licenseNumber} />
                          <DetailField label="วิทยฐานะ" value={teacher.academicStanding} />
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                          <DetailField label="วันที่เริ่มงาน/บรรจุ" value={teacher.startDate} />
                          <DetailField label="วุฒิการศึกษา" value={teacher.educationLevel} />
                          <DetailField label="วิชาเอก" value={teacher.major} />
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {activeTab === "work" && (
                  <div className="bg-white dark:bg-[#2a2b2f] rounded-2xl p-6 shadow-sm border border-gray-100 dark:border-gray-800 animate-fade-in">
                    <h2 className="text-lg font-semibold mb-6 pb-4 border-b border-gray-200 dark:border-gray-700 text-gray-800 dark:text-gray-200">ข้อมูลการทำงานและติดต่อ</h2>
                    <div className="space-y-4">
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <DetailField label="รหัสครู" value={teacher.teacherId} />
                        <DetailField label="ตำแหน่ง" value={teacher.position} />
                        <DetailField label="ฝ่ายงาน" value={teacher.department} />
                        <DetailField label="กลุ่มสาระการเรียนรู้" value={teacher.learningArea} />

                        {(teacher.isHeadOfLearningArea || teacher.isHeadOfAssessment || teacher.isGuidanceTeacher) && (
                          <div>
                            <label className="block text-sm font-medium text-gray-500 dark:text-gray-400">บทบาทพิเศษ</label>
                            <div className="flex flex-wrap gap-1.5 mt-1">
                              {teacher.isHeadOfLearningArea && (
                                <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-indigo-100 text-indigo-800 dark:bg-indigo-900 dark:text-indigo-200">
                                  หัวหน้ากลุ่มสาระ
                                </span>
                              )}
                              {teacher.isHeadOfAssessment && (
                                <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200">
                                  หัวหน้างานวัดและประเมินผล
                                </span>
                              )}
                              {teacher.isGuidanceTeacher && (
                                <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-rose-100 text-rose-800 dark:bg-rose-900 dark:text-rose-200">
                                  ครูแนะแนว
                                </span>
                              )}
                            </div>
                          </div>
                        )}
                        {teacher.advisorRole ? (
                          <div>
                            <label className="block text-sm font-medium text-gray-500 dark:text-gray-400">สถานะดูแลชั้นเรียน</label>
                            <span className={`mt-1 inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${teacher.advisorRole === 'ครูสอนประจำชั้น'
                              ? 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200'
                              : 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200'
                              }`}>
                              {teacher.advisorRole}
                            </span>
                          </div>
                        ) : (
                          <DetailField label="สถานะดูแลชั้นเรียน" value="-" />
                        )}
                        {teacher.homeroomGrade && (
                          <DetailField
                            label={teacher.advisorRole === 'ครูสอนประจำชั้น' ? 'ประจำชั้น' : teacher.advisorRole === 'ครูที่ปรึกษา' ? 'ที่ปรึกษาชั้น' : 'ระดับชั้นที่ดูแล'}
                            value={teacher.homeroomGrade}
                          />
                        )}
                        <DetailField label="ข้อมูลติดต่อ" value={teacher.contact} />
                        <DetailField label="Line ID" value={teacher.lineId} />
                      </div>
                      <DetailField label="ที่อยู่" value={teacher.address} />
                    </div>
                  </div>
                )}

                {activeTab === "teaching" && (
                  <div className="bg-white dark:bg-[#2a2b2f] rounded-2xl p-6 shadow-sm border border-gray-100 dark:border-gray-800 animate-fade-in">
                    <h2 className="text-lg font-semibold mb-6 pb-4 border-b border-gray-200 dark:border-gray-700 text-gray-800 dark:text-gray-200">รายวิชาที่สอน</h2>
                    {courses.length > 0 ? (
                      <>
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                          {courses.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage).map((course) => (
                            <div key={course.id} className="flex items-start p-4 rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50 hover:shadow-md transition-all duration-200 group">
                              <div className="flex-shrink-0 p-3 bg-white dark:bg-gray-700 rounded-lg text-indigo-600 dark:text-indigo-400 shadow-sm group-hover:scale-110 transition-transform">
                                <FaBook size={20} />
                              </div>
                              <div className="ml-4 overflow-hidden">
                                <h4 className="text-sm font-bold text-gray-900 dark:text-white truncate" title={course.title || course.courseName || course.subjectName}>
                                  {course.title || course.courseName || course.subjectName || "วิชาไม่ระบุชื่อ"}
                                </h4>
                                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1 truncate">
                                  รหัสวิชา: {course.courseCode || course.code || "-"}
                                </p>
                                {course.gradeLevel && (
                                  <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-medium bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300 mt-2">
                                    {formatGradeLevel(course.gradeLevel)}
                                  </span>
                                )}
                              </div>
                            </div>
                          ))}
                        </div>

                        {courses.length > itemsPerPage && (
                          <div className="flex justify-center items-center mt-8 gap-2">
                            <button
                              onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))}
                              disabled={currentPage === 1}
                              className="px-3 py-2 text-sm font-medium rounded-lg bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                            >
                              ก่อนหน้า
                            </button>

                            <div className="flex gap-1 flex-wrap justify-center">
                              {Array.from({ length: Math.ceil(courses.length / itemsPerPage) }, (_, i) => i + 1).map((page) => (
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
                              onClick={() => setCurrentPage(prev => Math.min(prev + 1, Math.ceil(courses.length / itemsPerPage)))}
                              disabled={currentPage === Math.ceil(courses.length / itemsPerPage)}
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
                        <p className="text-sm text-gray-500 dark:text-gray-400">ยังไม่มีข้อมูลรายวิชาที่สอน</p>
                      </div>
                    )}
                  </div>
                )}

                {activeTab === "attendance" && (
                  <div className="animate-fade-in space-y-6">
                    <InfoCard title={`สถิติการลงเวลา (ปีการศึกษา ${academicYear})`}>
                      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4 text-center">
                        <div className="p-4 bg-green-50 dark:bg-green-900/20 rounded-xl border border-green-100 dark:border-green-800">
                          <div className="text-2xl font-bold text-green-600 dark:text-green-400">{stats.present || 0}</div>
                          <div className="text-sm text-gray-500 dark:text-gray-400">มาปกติ</div>
                        </div>
                        <div className="p-4 bg-yellow-50 dark:bg-yellow-900/20 rounded-xl border border-yellow-100 dark:border-yellow-800">
                          <div className="text-2xl font-bold text-yellow-600 dark:text-yellow-400">{stats.late || 0}</div>
                          <div className="text-sm text-gray-500 dark:text-gray-400">สาย</div>
                        </div>
                        <div className="p-4 bg-blue-50 dark:bg-blue-900/20 rounded-xl border border-blue-100 dark:border-blue-800">
                          <div className="text-2xl font-bold text-blue-600 dark:text-blue-400">{stats.leave || 0}</div>
                          <div className="text-sm text-gray-500 dark:text-gray-400">ลา</div>
                        </div>
                        <div className="p-4 bg-red-50 dark:bg-red-900/20 rounded-xl border border-red-100 dark:border-red-800">
                          <div className="text-2xl font-bold text-red-600 dark:text-red-400">{stats.absent || 0}</div>
                          <div className="text-sm text-gray-500 dark:text-gray-400">ขาด</div>
                        </div>
                        <div className="p-4 bg-orange-50 dark:bg-orange-900/20 rounded-xl border border-orange-100 dark:border-orange-800">
                          <div className="text-2xl font-bold text-orange-600 dark:text-orange-400">{stats.early || 0}</div>
                          <div className="text-sm text-gray-500 dark:text-gray-400">กลับก่อน</div>
                        </div>
                        <div className="p-4 bg-purple-50 dark:bg-purple-900/20 rounded-xl border border-purple-100 dark:border-purple-800">
                          <div className="text-2xl font-bold text-purple-600 dark:text-purple-400">{stats.noCheckout || 0}</div>
                          <div className="text-sm text-gray-500 dark:text-gray-400">ไม่ลงเวลาออก</div>
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
                          {attendanceTrendData.length > 0 && (
                            <div className="col-span-1 lg:col-span-2 h-96 mt-2 bg-gray-50 dark:bg-gray-800/50 rounded-xl p-4 border border-gray-100 dark:border-gray-700">
                              <h3 className="text-center text-sm font-medium mb-4 text-gray-500 dark:text-gray-400">แนวโน้มเวลาการมาทำงาน (30 วันล่าสุด)</h3>
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
                                      if (value === undefined || value === null) return ["-", "เวลาที่มา"];
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
                          )}
                        </div>
                      )}
                    </InfoCard>

                    {monthlyStats.length > 0 && (
                      <InfoCard title="สถิติการมาทำงานรายเดือน">
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
                  </div>
                )}

                {activeTab === "substitution" && (
                  <div className="bg-white dark:bg-[#2a2b2f] rounded-2xl p-6 shadow-sm border border-gray-100 dark:border-gray-800 animate-fade-in">
                    <h2 className="text-lg font-semibold mb-6 pb-4 border-b border-gray-200 dark:border-gray-700 text-gray-800 dark:text-gray-200">ประวัติการสอนแทน</h2>

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
                        <div className="table-responsive">
                          <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                            <thead className="bg-gray-50 dark:bg-gray-800">
                              <tr>
                                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">วันที่/เวลา</th>
                                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">วิชา/ชั้นเรียน</th>
                                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">สอนแทนครู</th>
                                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">สถานะ</th>
                              </tr>
                            </thead>
                            <tbody className="bg-white dark:bg-[#2a2b2f] divide-y divide-gray-200 dark:divide-gray-700">
                              {substitutions
                                .slice((substitutionsCurrentPage - 1) * substitutionsItemsPerPage, substitutionsCurrentPage * substitutionsItemsPerPage)
                                .map((sub) => {
                                  const date = sub.date.toDate();
                                  const dateStr = date.toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: '2-digit' });
                                  const subStatus = getSubstitutionStatus(sub);

                                  let statusBadge;
                                  if (subStatus === 'upcoming') {
                                    statusBadge = <span className="px-2 inline-flex text-xs leading-5 font-semibold rounded-full bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300">รอสอน</span>;
                                  } else if (subStatus === 'completed') {
                                    statusBadge = <span className="px-2 inline-flex text-xs leading-5 font-semibold rounded-full bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300">ปฏิบัติหน้าที่สำเร็จ</span>;
                                  } else {
                                    statusBadge = <span className="px-2 inline-flex text-xs leading-5 font-semibold rounded-full bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300">ไม่ได้สอน (ลา/ขาด)</span>;
                                  }

                                  return (
                                    <tr key={sub.id}>
                                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-gray-200">{dateStr} <span className="text-gray-500 text-xs ml-1">(คาบ {sub.period})</span></td>
                                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-gray-200">{sub.subjectName} <span className="text-gray-500 text-xs">({formatGradeLevel(sub.classId)})</span></td>
                                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-gray-200">{sub.originalTeacherName}</td>
                                      <td className="px-6 py-4 whitespace-nowrap">{statusBadge}</td>
                                    </tr>
                                  );
                                })}
                            </tbody>
                          </table>
                        </div>
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
                {activeTab === "official_travel" && (
                  <div className="animate-fade-in space-y-6">
                    <InfoCard title="ประวัติการขอไปราชการ">
                      <div className="flex justify-end mb-4">
                        <button
                          onClick={() => navigate(`/school/${schoolId}/official-travel-request?type=teacher`)}
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
                                <th className="px-6 py-4 rounded-l-xl w-[20%]">วันที่เดินทาง</th>
                                <th className="px-6 py-4 w-[25%]">เรื่อง</th>
                                <th className="px-6 py-4 w-[25%]">สถานที่</th>
                                <th className="px-6 py-4 text-center w-[10%]">สถานะ</th>
                                <th className="px-6 py-4 rounded-r-xl text-right w-[20%]">การจัดการ</th>
                              </tr>
                            </thead>
                             <tbody className="bg-white dark:bg-[#2a2b2f] divide-y divide-gray-200 dark:divide-gray-700">
                               {officialTravelRequests.map((req: any) => (
                                <tr key={req.id} className="group hover:bg-indigo-50/30 dark:hover:bg-indigo-500/5 transition-all">
                                  <td className="px-6 py-5 text-sm text-gray-600 dark:text-gray-400 whitespace-nowrap">
                                    <div className="flex flex-col">
                                      <span className="font-medium text-gray-900 dark:text-gray-100">{formatDate(req.startDate)}</span>
                                      <span className="text-xs opacity-60">ถึง {formatDate(req.endDate)}</span>
                                    </div>
                                  </td>
                                  <td className="px-6 py-5">
                                    <p className="text-sm text-gray-900 dark:text-gray-100 font-bold leading-relaxed line-clamp-2" title={req.subject}>
                                      {req.subject}
                                    </p>
                                  </td>
                                  <td className="px-6 py-5">
                                    <p className="text-sm text-gray-500 dark:text-gray-400 leading-relaxed line-clamp-2" title={req.location}>
                                      {req.location}
                                    </p>
                                  </td>
                                  <td className="px-6 py-5 text-center">
                                    <span className={`inline-flex px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-wider ${req.status === 'approved' ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-400 border border-emerald-500/20' :
                                      req.status === 'rejected' ? 'bg-red-100 text-red-700 dark:bg-red-500/10 dark:text-red-400 border border-red-500/20' :
                                        'bg-amber-100 text-amber-700 dark:bg-amber-500/10 dark:text-amber-400 border border-amber-500/20'
                                      }`}>
                                      {req.status === 'approved' ? 'อนุมัติ' : req.status === 'rejected' ? 'ไม่นุมัติ' : 'รอพิจารณา'}
                                    </span>
                                  </td>
                                  <td className="px-6 py-5 text-right">
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
    </MainLayout>
  );
}
