import React, { useEffect, useState, useMemo } from "react";
import { collectionGroup, query, where, getDocs, orderBy, limit, collection, Timestamp, doc, getDoc, documentId, updateDoc } from "firebase/firestore";
import { firestore } from "@/firebase";
import { ToastContainer, toast } from "react-toastify";
import { useNavigate } from "react-router-dom";
import { useSelector } from "react-redux";
import { RootState } from "@/store";
import { fetchTeachersMap } from '@/store/slices/userMapSlice';
import MainLayout from "@/layouts/MainLayout";
import LogoutButton from "@/components/LogoutButton";
import { FaPen, FaSun, FaMoon, FaBook, FaUser, FaBriefcase, FaChalkboard, FaChevronRight, FaClock, FaExchangeAlt, FaPlane, FaIdCard, FaUsers, FaMapMarkerAlt, FaHeartbeat, FaSearch, FaEdit, FaChevronDown, FaChevronUp } from "react-icons/fa";
import { useTheme } from "../../ThemeContext";
import SkeletonLoader from "@/components/SkeletonLoader";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, Cell, ResponsiveContainer, LineChart, Line, Legend } from 'recharts';
import { Chart } from "react-google-charts";
import OfficialTravelPdfButton from "../../components/Pdf/OfficialTravel/OfficialTravelPdfButton";
import { ViewCourseDetailModal } from "./components/ViewCourseDetailModal";
import { EditCourseModal } from "./components/EditCourseModal";
import { useDispatch } from "react-redux";
import Swal from 'sweetalert2';

import "react-toastify/dist/ReactToastify.css";

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

  // 2. รวม State ให้จัดการง่ายขึ้น
  const [profile, setProfile] = useState<any | null>(null);
  const [userRole, setUserRole] = useState<'teacher' | 'student' | null>(null);
  const [isFetching, setIsFetching] = useState(true);
  const [courses, setCourses] = useState<CourseData[]>([]);
  const [activeTab, setActiveTab] = useState("general");
  const [coursesFetched, setCoursesFetched] = useState(false);
  const dispatch = useDispatch();
  const { teachers: teacherMap } = useSelector((state: RootState) => state.userMap);
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
    return list;
  }, [teacherMap, profile]);
  const [substitutions, setSubstitutions] = useState<Substitution[]>([]);
  const { isDarkMode, toggleTheme } = useTheme(); // เก็บ toggleTheme ไว้ใช้กับปุ่ม
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 12;
  const [substitutionsCurrentPage, setSubstitutionsCurrentPage] = useState(1);
  const [substitutionsItemsPerPage, setSubstitutionsItemsPerPage] = useState(10);
  const [expandedTeacherCourses, setExpandedTeacherCourses] = useState<string[]>([]);

  const toggleTeacherExpand = (courseId: string) => {
    setExpandedTeacherCourses(prev =>
      prev.includes(courseId) ? prev.filter(id => id !== courseId) : [...prev, courseId]
    );
  };

  const [teachingSemester, setTeachingSemester] = useState<string>("ทั้งหมด");

  const filteredTeachingCourses = useMemo(() => {
    if (teachingSemester === "ทั้งหมด") return courses;
    return courses.filter(c => c.semester === teachingSemester || c.semester === Number(teachingSemester).toString());
  }, [courses, teachingSemester]);
  const [academicYear, setAcademicYear] = useState<string>("");
  const [attendanceRecords, setAttendanceRecords] = useState<any[]>([]);
  const [selectedStatus, setSelectedStatus] = useState<string | null>(null);
  const [isAttendanceLoading, setIsAttendanceLoading] = useState(false);
  const [attendanceCurrentPage, setAttendanceCurrentPage] = useState(1);
  const [attendanceItemsPerPage, setAttendanceItemsPerPage] = useState(10);
  const [officialTravelRequests, setOfficialTravelRequests] = useState<any[]>([]);
  const [schoolInfo, setSchoolInfo] = useState<{ schoolName: string; directorName: string; deputyName: string; personnelHeadName: string; affiliation: string }>({
    schoolName: "",
    directorName: "",
    deputyName: "",
    personnelHeadName: "",
    affiliation: ""
  });

  // State for Course Edit Modal
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [isViewModalOpen, setIsViewModalOpen] = useState(false);
  const [editingCourse, setEditingCourse] = useState<CourseData | null>(null);
  const [periodSettings, setPeriodSettings] = useState<any[]>([]);
  const [availableClassOptions, setAvailableClassOptions] = useState<[string, string][]>([]);

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

  useEffect(() => {
    let isMounted = true;


    const fetchProfile = async () => {
      if (!currentUser?.uid) {
        setIsFetching(false);
        return;
      }

      try {
        setIsFetching(true);

        // ใช้ collectionGroup query เพื่อค้นหาครูจาก uid
        const teachersRef = collectionGroup(firestore, "teachers");
        const q = query(
          teachersRef,
          where("uid", "==", currentUser.uid),
          orderBy("createdAt", "desc"),
          limit(1)
        );
        const querySnapshot = await getDocs(q);

        if (!querySnapshot.empty && isMounted) {
          const teacherDoc = querySnapshot.docs[0];
          const data = teacherDoc.data();
          const schoolId = teacherDoc.ref.parent.parent?.id;

          setProfile({
            ...(data as any),
            schoolId: schoolId || "",
            docId: teacherDoc.id,
          });
          setUserRole('teacher');
        } else if (isMounted) {
          // If not a teacher, check if student
          const studentsRef = collectionGroup(firestore, "students");
          const qStudent = query(
            studentsRef,
            where("uid", "==", currentUser.uid),
            limit(1)
          );
          const studentSnapshot = await getDocs(qStudent);

          if (!studentSnapshot.empty && isMounted) {
            const studentDoc = studentSnapshot.docs[0];
            const data = studentDoc.data();
            const schoolId = studentDoc.ref.parent.parent?.id;

            setProfile({
              ...data,
              schoolId: schoolId || "",
              docId: studentDoc.id,
            });
            setUserRole('student');
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
    };
  }, [currentUser?.uid]);

  useEffect(() => {
    if (profile?.schoolId) {
      dispatch(fetchTeachersMap(profile.schoolId) as any);
    }
  }, [profile?.schoolId, dispatch]);

  useEffect(() => {
    if (profile?.schoolId && profile?.docId && activeTab === "teaching" && !coursesFetched) {
      const fetchCourses = async () => {
        try {
          const coursesRef = collection(firestore, "school-settings", profile.schoolId, "courses");
          const enrollmentsRef = collection(firestore, "school-settings", profile.schoolId, "enrollments");

          // Get all courses and check enrollments
          const [coursesSnap, enrollmentsSnap] = await Promise.all([
            getDocs(query(coursesRef)),
            getDocs(query(enrollmentsRef))
          ]);

          // Get set of courses that HAVE students enrolled
          const enrolledCourseIds = new Set(enrollmentsSnap.docs.map(doc => doc.data().courseId).filter(Boolean));

          const coursesData = coursesSnap.docs
            .map(doc => {
              const data = doc.data();
              return { id: doc.id, ...data, gradeLevel: data.gradeLevel || data.classId } as CourseData;
            })
            .filter(course => {
              // 1. ต้องเป็นวิชาที่มีนักเรียน enrolled แล้ว
              if (!enrolledCourseIds.has(course.id)) return false;

              // 2. เป็นของครูคนนี้ (ของใครของมัน)
              // เป็นครูหลัก
              if (course.teacherId === profile.docId) return true;
              // อยู่ในรายชื่อครูสอน (teacherIds)
              if (course.teacherIds?.includes(profile.docId)) return true;
              // มีการรับมอบหมาย (teacherAssignments)
              if (course.teacherAssignments?.some(a => a.teacherId === profile.docId)) return true;

              return false;
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
  }, [profile, activeTab, coursesFetched]);

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

  useEffect(() => {
    if (profile?.schoolId) {
      const fetchSchoolInfo = async () => {
        try {
          const schoolRef = doc(firestore, "school-settings", profile.schoolId);
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
          const calendarDocRef = doc(firestore, "school-settings", profile.schoolId, "main_calendar", "default");
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
  }, [profile?.schoolId]);

  useEffect(() => {
    if (activeTab === 'attendance' && profile?.schoolId && profile?.docId && academicYear) {
      const fetchAttendance = async () => {
        setIsAttendanceLoading(true);
        try {
          let startDate = "";
          let endDate = "";

          const yearDocRef = doc(firestore, "school-settings", profile.schoolId, "main_calendar", academicYear);
          let yearSnap = await getDoc(yearDocRef);

          if (!yearSnap.exists()) {
            const defaultDocRef = doc(firestore, "school-settings", profile.schoolId, "main_calendar", "default");
            yearSnap = await getDoc(defaultDocRef);
          }

          if (yearSnap.exists()) {
            const data = yearSnap.data();
            startDate = data.terms?.term1?.startDate || "";
            endDate = data.terms?.term2?.endDate || data.terms?.term1?.endDate || "";
          }

          const attRef = collection(firestore, "school-settings", profile.schoolId, "teachers", profile.docId, "attendance");
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
          const leaveRef = collection(firestore, "school-settings", profile.schoolId, "teachers", profile.docId, "leave_summary");
          const leaveQ = query(leaveRef, where("teacherId", "==", profile.docId));
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
        }
      };
      fetchAttendance();
    }
  }, [activeTab, profile, academicYear]);

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
  }, [activeTab, profile]);

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
    { id: "attendance", label: "สถิติการมาเรียน", icon: <FaClock /> },
    { id: "official_travel", label: "ไปราชการ", icon: <FaPlane /> },
  ] : [
    { id: "general", label: "ข้อมูลส่วนตัว", icon: <FaIdCard /> },
    { id: "work", label: "ข้อมูลการทำงาน", icon: <FaBriefcase /> },
    { id: "teaching", label: "การสอน", icon: <FaBook /> },
    { id: "attendance", label: "สถิติการมาทำงาน", icon: <FaClock /> },
    { id: "substitution", label: "สถิติการสอนแทน", icon: <FaExchangeAlt /> },
    { id: "official_travel", label: "ไปราชการ", icon: <FaPlane /> },
  ];

  // Prepare Chart Data
  // ใช้ข้อมูลจาก Aggregation ในโปรไฟล์โดยตรง
  const stats = profile?.attendanceStats || { present: 0, late: 0, leave: 0, absent: 0, early: 0, noCheckout: 0 };
  const attendanceChartData = [
    { name: 'มาปกติ', value: stats.present || 0, color: '#22c55e' },
    { name: 'สาย', value: stats.late || 0, color: '#eab308' },
    { name: 'ลา', value: stats.leave || 0, color: '#3b82f6' },
    { name: 'ขาด', value: stats.absent || 0, color: '#ef4444' },
    { name: 'กลับก่อน', value: stats.early || 0, color: '#f97316' },
    { name: 'ไม่ลงเวลาออก', value: stats.noCheckout || 0, color: '#a855f7' },
    { name: 'ไปราชการ', value: stats.official_travel_days || 0, color: '#6366f1' },
  ];

  const googleAttendanceData = [
    ["Status", "Count"],
    ...attendanceChartData.map(d => [d.name, d.value]),
  ];

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
      'noCheckout': ['ไม่ลงเวลาออก', 'NoCheckout']
    };

    const targetStatuses = statusMap[selectedStatus] || [];
    return attendanceRecords.filter(r => targetStatuses.includes(r.status));
  };

  const filteredRecords = getFilteredAttendance();

  return (
    <MainLayout>
      <ToastContainer theme={isDarkMode ? "dark" : "light"} autoClose={2000} />

      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-10 text-gray-900 dark:text-white">
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
              <img
                src={
                  profile.profileImageUrl ||
                  `https://ui-avatars.com/api/?name=${profile.firstName}+${profile.lastName}&background=random`
                }
                alt="Profile"
                className="w-32 h-32 rounded-full object-cover border-4 border-white dark:border-gray-700 shadow-lg mx-auto mb-4"
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
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                          <DetailField label="ชื่อ-นามสกุล" value={`${profile.title}${profile.firstName} ${profile.lastName}`} />
                          <DetailField label="ชื่อเล่น" value={profile.nickname} />
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                          <DetailField label="เลขประจำตัวประชาชน" value={profile.idCardNumber} />
                          <DetailField label="รหัสนักเรียน" value={profile.studentId} />
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                          <DetailField label="ชั้น/ห้อง" value={`${profile.classLevel}/${profile.room}`} />
                          <DetailField label="เลขที่" value={profile.studentNumber} />
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
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
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                          <DetailField label="วันเกิด" value={profile.dob} />
                          <DetailField label="เพศ" value={profile.gender} />
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                          <DetailField label="เลขที่ใบประกอบวิชาชีพ" value={profile.licenseNumber} />
                          <DetailField label="วิทยฐานะ" value={profile.academicStanding} />
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                          <DetailField label="วันที่เริ่มงาน/บรรจุ" value={profile.startDate} />
                          <DetailField label="วุฒิการศึกษา" value={profile.educationLevel} />
                          <DetailField label="วิชาเอก" value={profile.major} />
                        </div>
                      </>
                    )}
                  </div>
                </div>
              )}

              {activeTab === "work" && userRole === 'teacher' && (
                <div className="bg-white dark:bg-[#2a2b2f] rounded-2xl p-6 shadow-sm border border-gray-100 dark:border-gray-800 animate-fade-in">
                  <h2 className="text-lg font-semibold mb-6 pb-4 border-b border-gray-200 dark:border-gray-700 text-gray-800 dark:text-gray-200">ข้อมูลการทำงานและติดต่อ</h2>
                  <div className="space-y-4">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <DetailField label="รหัสครู" value={profile.teacherId} />
                      <DetailField label="ตำแหน่ง" value={profile.position} />
                      <DetailField label="ฝ่ายงาน" value={profile.department} />
                      <DetailField label="กลุ่มสาระการเรียนรู้" value={profile.learningArea} />

                      <DetailField label="ที่ปรึกษา" value={profile.advisorRole || (profile.isHomeroomTeacher ? "ครูประจำชั้น" : "-")} />
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
                      {profile.isHeadOfLearningArea && (
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
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
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
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
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
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
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

              {activeTab === "teaching" && userRole === 'teacher' && (
                <div className="bg-white dark:bg-[#2a2b2f] rounded-2xl p-6 shadow-sm border border-gray-100 dark:border-gray-800 animate-fade-in">
                  <div className="flex justify-between items-center mb-6 pb-4 border-b border-gray-200 dark:border-gray-700">
                    <h2 className="text-lg font-semibold text-gray-800 dark:text-gray-200">รายวิชาที่สอน</h2>
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
                  {filteredTeachingCourses.length > 0 ? (
                    <>
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

                                                    <div className="flex flex-wrap items-center gap-1 pl-3">
                                                      {(() => {
                                                        const cls = assign.classLevels || [];
                                                        const rms = assign.roomIds || [];
                                                        let badges: string[] = [];

                                                        if (cls.length > 0 && rms.length > 0) {
                                                          cls.forEach(cl => {
                                                            const className = availableClassOptions.find(opt => String(opt[0]) === String(cl))?.[1] || cl;
                                                            rms.forEach(r => {
                                                              badges.push(`${className}/${r}`);
                                                            });
                                                          });
                                                        }

                                                        if (badges.length > 0) {
                                                          return (
                                                            <>
                                                              <span className="text-[8px] font-bold px-1.5 py-0.5 rounded bg-indigo-600 text-white leading-none">
                                                                {badges[0]}
                                                              </span>
                                                              {badges.length > 1 && (
                                                                <span className="text-[8px] font-medium text-gray-500 dark:text-gray-400 italic">
                                                                  +{badges.length - 1} ห้อง
                                                                </span>
                                                              )}
                                                            </>
                                                          );
                                                        }

                                                        return (
                                                          <>
                                                            {cls.slice(0, 1).map(cl => (
                                                              <span key={cl} className="text-[8px] font-medium px-1.5 py-0.5 rounded bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-300 border border-gray-100 dark:border-gray-700 leading-none">
                                                                {availableClassOptions.find(opt => String(opt[0]) === String(cl))?.[1] || cl}
                                                              </span>
                                                            ))}
                                                            {rms.slice(0, 1).map(r => (
                                                              <span key={r} className="text-[8px] font-bold px-1.5 py-0.5 rounded bg-indigo-600 text-white leading-none">
                                                                ห.{r}
                                                              </span>
                                                            ))}
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

              {activeTab === "official_travel" && (
                <div className="bg-white dark:bg-[#2a2b2f] rounded-2xl p-6 shadow-sm border border-gray-100 dark:border-gray-800 animate-fade-in">
                  <div className="flex justify-between items-center mb-6 pb-4 border-b border-gray-200 dark:border-gray-700">
                    <h2 className="text-lg font-semibold text-gray-800 dark:text-gray-200">ประวัติการขอไปราชการ</h2>
                    <button
                      onClick={() => navigate(`/school/${profile.schoolId}/official-travel-request?type=${userRole === 'student' ? 'student' : 'teacher'}`)}
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
                </div>
              )}

              {activeTab === "attendance" && userRole === 'teacher' && (
                <div className="animate-fade-in space-y-6">
                  <InfoCard title={`สถิติการลงเวลา (ปีการศึกษา ${academicYear || new Date().getFullYear() + 543})`}>
                    <div className="flex lg:grid lg:grid-cols-7 gap-2 sm:gap-3 table-responsive pb-4 scrollbar-hide -mx-2 px-2 lg:mx-0 lg:px-0">
                      <div className="flex-shrink-0 lg:w-full w-24 sm:w-28 min-h-[70px] sm:min-h-[85px] flex flex-col items-center justify-center p-2 bg-green-50 dark:bg-green-900/20 rounded-xl border border-green-100 dark:border-green-800">
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
                        onClick={() => { setSelectedStatus(selectedStatus === 'early' ? null : 'early'); setAttendanceCurrentPage(1); }}
                        className={`flex-shrink-0 lg:w-full w-24 sm:w-28 min-h-[70px] sm:min-h-[85px] flex flex-col items-center justify-center p-2 rounded-xl border cursor-pointer transition-all ${selectedStatus === 'early' ? 'ring-2 ring-orange-500 bg-orange-100 dark:bg-orange-900/40 border-orange-500' : 'bg-orange-50 dark:bg-orange-900/20 border-orange-100 dark:border-orange-800 hover:bg-orange-100 dark:hover:bg-orange-900/30'}`}
                      >
                        <div className="text-lg sm:text-xl font-bold text-orange-600 dark:text-orange-400">{stats.early || 0}</div>
                        <div className="text-[9px] sm:text-[10px] text-gray-500 dark:text-gray-400 text-center leading-tight">กลับก่อน</div>
                      </div>
                      <div
                        onClick={() => { setSelectedStatus(selectedStatus === 'noCheckout' ? null : 'noCheckout'); setAttendanceCurrentPage(1); }}
                        className={`flex-shrink-0 lg:w-full w-24 sm:w-28 min-h-[70px] sm:min-h-[85px] flex flex-col items-center justify-center p-2 rounded-xl border cursor-pointer transition-all ${selectedStatus === 'noCheckout' ? 'ring-2 ring-purple-500 bg-purple-100 dark:bg-purple-900/40 border-purple-500' : 'bg-purple-50 dark:bg-purple-900/20 border-purple-100 dark:border-purple-800 hover:bg-purple-100 dark:hover:bg-purple-900/30'}`}
                      >
                        <div className="text-lg sm:text-xl font-bold text-purple-600 dark:text-purple-400">{stats.noCheckout || 0}</div>
                        <div className="text-[9px] sm:text-[10px] text-gray-500 dark:text-gray-400 text-center leading-tight">ไม่ลงเวลาออก</div>
                      </div>
                      <div
                        className="flex-shrink-0 lg:w-full w-24 sm:w-28 min-h-[70px] sm:min-h-[85px] flex flex-col items-center justify-center p-2 rounded-xl border bg-indigo-50 dark:bg-indigo-900/20 border-indigo-100 dark:border-indigo-800"
                      >
                        <div className="text-lg sm:text-xl font-bold text-indigo-600 dark:text-indigo-400">{stats.official_travel_days || 0}</div>
                        <div className="text-[9px] sm:text-[10px] text-gray-500 dark:text-gray-400 text-center leading-tight">ไปราชการ</div>
                      </div>
                    </div>
                  </InfoCard>

                  {attendanceChartData.length > 0 && (
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
                        <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={250}>
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
                                    'ไม่ลงเวลาออก'
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

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
                    <div className="p-4 bg-indigo-50 dark:bg-indigo-900/20 rounded-xl border border-indigo-100 dark:border-indigo-800 text-center">
                      <div className="text-2xl font-bold text-indigo-600 dark:text-indigo-400">{substitutions.length}</div>
                      <div className="text-sm text-gray-500 dark:text-gray-400">จำนวนครั้งที่ได้รับมอบหมาย</div>
                    </div>
                    <div className="p-4 bg-green-50 dark:bg-green-900/20 rounded-xl border border-green-100 dark:border-green-800 text-center">
                      <div className="text-2xl font-bold text-green-600 dark:text-green-400">
                        {/* Placeholder or new logic needed */}
                      </div>
                      <div className="text-sm text-gray-500 dark:text-gray-400">ปฏิบัติหน้าที่สำเร็จ</div>
                    </div>
                    <div className="p-4 bg-red-50 dark:bg-red-900/20 rounded-xl border border-red-100 dark:border-red-800 text-center">
                      <div className="text-2xl font-bold text-red-600 dark:text-red-400">
                        {/* Placeholder or new logic needed */}
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
                                let dateObj: Date | null = null;
                                if (sub.date?.toDate) {
                                  dateObj = sub.date.toDate();
                                } else if (sub.date?.seconds) {
                                  dateObj = new Date(sub.date.seconds * 1000);
                                } else if (sub.date) {
                                  dateObj = new Date(sub.date as any);
                                }

                                const dateStr = dateObj ? dateObj.toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: '2-digit' }) : "-";
                                const isFuture = dateObj ? dateObj > new Date() : false;

                                let statusBadge;
                                if (isFuture) {
                                  statusBadge = <span className="px-2 inline-flex text-xs leading-5 font-semibold rounded-full bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300">รอสอน</span>;
                                } else {
                                  statusBadge = <span className="px-2 inline-flex text-xs leading-5 font-semibold rounded-full bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300">ไม่ระบุ</span>;
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
            </div >
          </main >
        </div >
      </div >
    </MainLayout >
  );
};

export default ProfilePage;
