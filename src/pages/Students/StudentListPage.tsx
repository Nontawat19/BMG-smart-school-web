import React, { useState, useEffect, useCallback } from "react";
import { Link, useParams } from "react-router-dom";
import MainLayout from "@/layouts/MainLayout";
import BackButton from "@/components/Shared/BackButton";
import ProfileAvatar from "@/components/Shared/ProfileAvatar";
import { firestore, storage, auth } from "@/firebase";
import { collection, getDocs, query, orderBy, Timestamp, doc, deleteDoc, getDoc, where, updateDoc, addDoc, serverTimestamp } from "firebase/firestore";
import { ref, deleteObject } from "firebase/storage";
import { FaPlus, FaUserEdit, FaTrashAlt, FaSearch, FaUserPlus, FaFileImport, FaFileExcel, FaFilter, FaSortNumericDown, FaIdCard } from "react-icons/fa";
import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, History, ChevronDown } from "lucide-react";
import { deleteStudentLookup } from "@/utils/studentLookupUtils";
import Swal from 'sweetalert2';
import { getLevelsByRange } from "@/utils/schoolUtils";
import CanAccess from "@/components/AccessControl/CanAccess";
import { usePermissions } from "@/hooks/usePermissions";
import { getCurrentThaiYear } from "@/utils/dateUtils";
import { getStudentStatus, isCurrentStudent } from "@/utils/studentStatusUtils";
import Select, { StylesConfig, components } from "react-select";
import { useTheme } from "@/ThemeContext";
import { toast, ToastContainer } from "react-toastify";
import "react-toastify/dist/ReactToastify.css";
import { isActiveStudentSummaryStatus, updateOwnerAndSchoolCounts } from "@/utils/ownerStatsUtils";
import { updateStudentReportSummaryForChange } from "@/utils/studentReportSummaryUtils";

// กำหนด Type สำหรับข้อมูลนักเรียน
interface Student {
  id: string;
  profileImageUrl?: string;
  studentId: string;
  idCardNumber?: string;
  rfid?: string;
  gender?: string;
  title: string;
  firstName: string;
  lastName: string;
  classLevel: string;
  room: string;
  schoolId: string; // เพิ่ม schoolId
  status?: string;
  studentStatus: string;
  contact?: string;
  phoneNumber?: string;
  fatherPhone?: string;
  motherPhone?: string;
  guardianPhone?: string;
  lineId?: string;
  createdAt: Timestamp;
  behaviorScore?: number;
  role?: string[];
  studentNumber?: string;
}

const statusColorMap: { [key: string]: string } = {
  "กำลังศึกษา": "bg-green-500/20 text-green-400 border-green-500/30",
  "ปกติ": "bg-green-500/20 text-green-400 border-green-500/30",
  "พักการเรียน": "bg-yellow-500/20 text-yellow-400 border-yellow-500/30",
  "แขวนลอย": "bg-amber-500/20 text-amber-400 border-amber-500/30",
  "ย้าย": "bg-blue-500/20 text-blue-400 border-blue-500/30",
  "ลาออก": "bg-red-500/20 text-red-400 border-red-500/30",
  "จำหน่าย": "bg-orange-500/20 text-orange-400 border-orange-500/30",
  "สำเร็จการศึกษา": "bg-purple-500/20 text-purple-400 border-purple-500/30",
};

const statusOptions = [
  { value: 'กำลังศึกษา', label: 'กำลังศึกษา' },
  { value: 'พักการเรียน', label: 'พักการเรียน' },
  { value: 'แขวนลอย', label: 'แขวนลอย' },
  { value: 'ย้าย', label: 'ย้าย' },
  { value: 'ลาออก', label: 'ลาออก' },
  { value: 'จำหน่าย', label: 'จำหน่าย' },
  { value: 'สำเร็จการศึกษา', label: 'สำเร็จการศึกษา' },
];

// --- Skeleton Loader Component ---
const SkeletonLoader = () => (
  <div className="table-responsive animate-pulse">
    <table className="min-w-full divide-y divide-gray-700">
      <thead className="bg-gray-100 dark:bg-[#2a2b2f]">
        <tr>
          <th scope="col" className="py-3.5 pl-4 pr-3 text-left text-sm font-semibold text-gray-600 dark:text-gray-300 sm:pl-6 w-16">ลำดับ</th>
          <th scope="col" className="py-3.5 pr-3 text-left text-sm font-semibold text-gray-600 dark:text-gray-300">ชื่อ-สกุล</th>
          <th scope="col" className="px-3 py-3.5 text-left text-sm font-semibold text-gray-600 dark:text-gray-300">รหัสนักเรียน</th>
          <th scope="col" className="px-3 py-3.5 text-left text-sm font-semibold text-gray-600 dark:text-gray-300">ชั้น/ห้อง</th>
          <th scope="col" className="px-3 py-3.5 text-left text-sm font-semibold text-gray-600 dark:text-gray-300">เลขประจำตัวประชาชน</th>
          <th scope="col" className="px-3 py-3.5 text-left text-sm font-semibold text-gray-600 dark:text-gray-300">เบอร์ติดต่อผู้ปกครอง</th>
          <th scope="col" className="px-3 py-3.5 text-left text-sm font-semibold text-gray-600 dark:text-gray-300">สถานะ</th>
          <th scope="col" className="relative py-3.5 pl-3 pr-4 sm:pr-6"><span className="sr-only">Actions</span></th>
        </tr>
      </thead>
      <tbody className="divide-y divide-gray-200 dark:divide-gray-800 bg-white dark:bg-[#1e1f21]">
        {[...Array(8)].map((_, i) => (
          <tr key={i}>
            <td className="whitespace-nowrap py-4 pl-4 pr-3 text-sm text-center sm:pl-6"><div className="h-4 w-4 mx-auto rounded bg-gray-300 dark:bg-gray-700"></div></td>
            <td className="whitespace-nowrap py-4 pr-3 text-sm">
              <div className="flex items-center">
                <div className="h-10 w-10 rounded-full bg-gray-300 dark:bg-gray-700"></div>
                <div className="ml-4 h-4 w-32 rounded bg-gray-300 dark:bg-gray-700"></div>
              </div>
            </td>
            <td className="whitespace-nowrap px-3 py-4 text-sm"><div className="h-4 w-20 rounded bg-gray-300 dark:bg-gray-700"></div></td>
            <td className="whitespace-nowrap px-3 py-4 text-sm"><div className="h-4 w-12 rounded bg-gray-300 dark:bg-gray-700"></div></td>
            <td className="whitespace-nowrap px-3 py-4 text-sm"><div className="h-4 w-28 rounded bg-gray-300 dark:bg-gray-700"></div></td>
            <td className="whitespace-nowrap px-3 py-4 text-sm"><div className="h-4 w-24 rounded bg-gray-300 dark:bg-gray-700"></div></td>
            <td className="whitespace-nowrap px-3 py-4 text-sm"><div className="h-5 w-16 rounded-md bg-gray-300 dark:bg-gray-700"></div></td>
            <td className="whitespace-nowrap px-3 py-4 text-sm"><div className="h-6 w-32 rounded-md bg-gray-300 dark:bg-gray-700"></div></td>
            <td className="relative whitespace-nowrap py-4 pl-3 pr-4 text-right text-sm font-medium sm:pr-6">
              <div className="flex justify-end items-center gap-x-4">
                <div className="h-4 w-4 rounded bg-gray-300 dark:bg-gray-700"></div>
                <div className="h-4 w-4 rounded bg-gray-300 dark:bg-gray-700"></div>
              </div>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  </div>
);

export default function StudentListPage() {
  const { ACADEMIC_ACCESS } = usePermissions();
  const [students, setStudents] = useState<Student[]>([]);
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [schoolId, setSchoolId] = useState<string | null>(null);
  const [selectedClassLevel, setSelectedClassLevel] = useState<string>('');
  const [selectedRoom, setSelectedRoom] = useState<string>('');
  const [availableLevels, setAvailableLevels] = useState<string[]>([]);
  const [isUpdating, setIsUpdating] = useState<string | null>(null);
  const { isDarkMode } = useTheme();

  // Pagination State
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage] = useState(20);
  const [sortBy, setSortBy] = useState<'studentNumber' | 'studentId' | 'latest'>('studentNumber');
  const [editingStudentNumberId, setEditingStudentNumberId] = useState<string | null>(null);
  const [editingBehaviorScoreId, setEditingBehaviorScoreId] = useState<string | null>(null);

  const selectStyles: StylesConfig<any, false> = {
    control: (provided) => ({
      ...provided,
      backgroundColor: 'transparent',
      border: 'none',
      boxShadow: 'none',
      minHeight: 'unset',
      cursor: 'pointer',
      padding: 0,
      margin: 0,
      width: '100%',
      display: 'flex',
      justifyContent: 'space-between',
    }),
    valueContainer: (provided) => ({
      ...provided,
      padding: 0,
      flex: 1,
      display: 'flex',
    }),
    input: (provided) => ({
      ...provided,
      margin: 0,
      padding: 0,
      color: isDarkMode ? '#fff' : '#374151',
    }),
    indicatorsContainer: (provided) => ({
      ...provided,
      padding: 0,
      marginLeft: 'auto',
    }),
    dropdownIndicator: (provided) => ({
      ...provided,
      padding: '0 0 0 4px',
      color: 'inherit',
      '&:hover': {
        color: 'inherit',
      },
    }),
    menu: (provided) => ({
      ...provided,
      backgroundColor: isDarkMode ? '#2a2b2f' : '#ffffff',
      border: isDarkMode ? '1px solid rgba(255,255,255,0.1)' : '1px solid rgba(0,0,0,0.1)',
      borderRadius: '12px',
      overflow: 'hidden',
      zIndex: 50,
      width: 'max-content',
      minWidth: '160px',
      boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05)',
    }),
    option: (provided, state) => ({
      ...provided,
      backgroundColor: state.isSelected ? '#4f46e5' : state.isFocused ? (isDarkMode ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)') : 'transparent',
      color: state.isSelected ? '#fff' : isDarkMode ? '#fff' : '#374151',
      cursor: 'pointer',
      fontSize: '12px',
      padding: '8px 12px',
      '&:active': {
        backgroundColor: '#4f46e5',
      },
    }),
    singleValue: (provided) => ({
      ...provided,
      color: 'inherit',
      margin: 0,
    }),
    menuList: (provided) => ({
      ...provided,
      maxHeight: 'none',
      padding: 0,
      '&::-webkit-scrollbar': {
        width: '0px',
        display: 'none',
      },
      scrollbarWidth: 'none',
      msOverflowStyle: 'none',
    }),
  };

  const CustomDropdownIndicator = (props: any) => {
    return (
      <components.DropdownIndicator {...props}>
        <ChevronDown size={8} className="opacity-60 group-hover:opacity-100 transition-opacity" />
      </components.DropdownIndicator>
    );
  };

  const handleUpdateField = async (studentId: string, updates: Record<string, any>) => {
    if (!schoolId) return;
    setIsUpdating(studentId);
    try {
      const studentDocRef = doc(firestore, "school-settings", schoolId, "students", studentId);
      const currentStudent = students.find(s => s.id === studentId);
      const previousStatus = getStudentStatus(currentStudent);
      const nextStatus = String(updates.status || updates.studentStatus || previousStatus).trim();

      // If updating behaviorScore, write a history log entry
      if (updates.behaviorScore !== undefined) {
        const prevScore = currentStudent?.behaviorScore ?? 100;
        const nextScore = updates.behaviorScore;
        const logsRef = collection(firestore, "school-settings", schoolId, "students", studentId, "behavior_logs");
        await addDoc(logsRef, {
          type: "direct_edit",
          title: "ปรับปรุงคะแนนโดยผู้ดูแลระบบ",
          category: "ระบบ",
          action: "overwrite",
          points: nextScore - prevScore,
          previousScore: prevScore,
          nextScore: nextScore,
          notes: "แก้ไขคะแนนความประพฤติโดยตรงจากหน้าต่างรายชื่อนักเรียน",
          createdBy: auth.currentUser?.email || auth.currentUser?.displayName || "ผู้ดูแลระบบ",
          createdAt: serverTimestamp(),
          academicYear: String(getCurrentThaiYear()),
        });
      }

      await updateDoc(studentDocRef, updates);
      const wasActive = isActiveStudentSummaryStatus(previousStatus);
      const isActive = isActiveStudentSummaryStatus(nextStatus);
      if (wasActive !== isActive) {
        await updateOwnerAndSchoolCounts(firestore, schoolId, { students: isActive ? 1 : -1 });
      }
      const nextStudentForSummary = {
        ...(currentStudent || {}),
        ...updates,
        ...(updates.status && !updates.studentStatus ? { studentStatus: updates.status } : {}),
        ...(updates.studentStatus ? { status: updates.studentStatus } : {}),
      };
      await updateStudentReportSummaryForChange(firestore, schoolId, currentStudent, nextStudentForSummary);
      setStudents(prev => prev.map(s => s.id === studentId ? { ...s, ...updates } : s));

      let successMessage = "อัปเดตข้อมูลเรียบร้อยแล้ว";
      if (updates.status || updates.studentStatus) {
        successMessage = "อัปเดตสถานะเรียบร้อยแล้ว";
      } else if (updates.behaviorScore !== undefined) {
        successMessage = "อัปเดตคะแนนพฤติกรรมเรียบร้อยแล้ว";
      } else if (updates.studentNumber !== undefined) {
        successMessage = "อัปเดตเลขที่เรียบร้อยแล้ว";
      }

      toast.success(successMessage, {
        position: "top-right",
        autoClose: 2000,
        hideProgressBar: true,
        closeOnClick: true,
        pauseOnHover: true,
        draggable: true,
        theme: "dark",
      });
    } catch (err) {
      console.error("Error updating student field: ", err);
      toast.error("ไม่สามารถอัปเดตข้อมูลได้", {
        position: "top-right",
        theme: "dark",
      });
    } finally {
      setIsUpdating(null);
    }
  };

  const handleDelete = async (student: Student) => {
    Swal.fire({
      title: 'ยืนยันการลบ',
      text: `คุณแน่ใจหรือไม่ว่าต้องการลบข้อมูลของ ${student.firstName} ${student.lastName}? การกระทำนี้ไม่สามารถย้อนกลับได้`,
      icon: 'warning',
      showCancelButton: true,
      confirmButtonColor: '#d33',
      cancelButtonColor: '#3085d6',
      confirmButtonText: 'ใช่, ลบเลย!',
      cancelButtonText: 'ยกเลิก',
      background: '#2a2b2f',
      color: '#ffffff'
    }).then(async (result) => {
      if (result.isConfirmed) {
        Swal.fire({
          title: 'กำลังลบข้อมูล...',
          text: 'กรุณารอสักครู่',
          allowOutsideClick: false,
          background: '#2a2b2f',
          color: '#ffffff',
          didOpen: () => {
            Swal.showLoading();
          }
        });

        try {
          // 1. Delete lookup data if exists
          if (student.idCardNumber && student.studentId) {
            try {
              await deleteStudentLookup(student.idCardNumber, student.studentId);
            } catch (error) {
              console.warn("Could not delete student lookup:", error);
            }
          }

          // 2. Delete student doc
          await deleteDoc(doc(firestore, "school-settings", student.schoolId, "students", student.id));
          if (isActiveStudentSummaryStatus(getStudentStatus(student))) {
            await updateOwnerAndSchoolCounts(firestore, student.schoolId, { students: -1 });
          }
          await updateStudentReportSummaryForChange(firestore, student.schoolId, student, null);

          // 3. Delete from Storage if image exists
          if (student.profileImageUrl) {
            const imageRef = ref(storage, student.profileImageUrl);
            await deleteObject(imageRef);
          }
          setStudents(prevStudents => prevStudents.filter(s => s.id !== student.id));
          Swal.fire({ title: 'ลบสำเร็จ!', text: 'ข้อมูลนักเรียนถูกลบเรียบร้อยแล้ว', icon: 'success', background: '#2a2b2f', color: '#ffffff' });
        } catch (err) {
          console.error("Error deleting student: ", err);
          Swal.fire({ title: 'เกิดข้อผิดพลาด!', text: 'ไม่สามารถลบข้อมูลนักเรียนได้', icon: 'error', background: '#2a2b2f', color: '#ffffff' });
        }
      }
    });
  };

  const handleBulkAssignNumbers = async () => {
    if (!schoolId) return;

    let targetStudents: Student[] = [];
    let titleText = "";

    if (selectedClassLevel) {
      if (selectedRoom) {
        // เฉพาะห้องเรียนที่เลือก (เช่น ม.1/1)
        targetStudents = students.filter(s => s.classLevel === selectedClassLevel && s.room === selectedRoom);
        titleText = `จัดเลขที่ห้อง ${selectedClassLevel}/${selectedRoom}`;
      } else {
        // ทั้งระดับชั้น ทุกห้องเรียน (เช่น ม.1 ทุกห้อง)
        targetStudents = students.filter(s => s.classLevel === selectedClassLevel && s.room);
        titleText = `จัดเลขที่ชั้น ${selectedClassLevel} ทุกห้องเรียน`;
      }
    } else {
      // ทั้งโรงเรียน ทุกชั้นและทุกห้องเรียน
      targetStudents = students.filter(s => s.classLevel && s.room);
      titleText = "จัดเลขที่ทั้งโรงเรียน";
    }

    if (targetStudents.length === 0) {
      Swal.fire({
        title: "ไม่พบนักเรียน",
        text: "ไม่พบรายชื่อนักเรียนที่มีการระบุระดับชั้นและห้องเรียนตามขอบเขตที่เลือก",
        icon: "warning",
        confirmButtonText: "ตกลง",
        background: '#2a2b2f',
        color: '#ffffff'
      });
      return;
    }

    const sortResult = await Swal.fire({
      title: titleText,
      text: "โปรดเลือกรูปแบบการจัดลำดับเลขที่ (แยกชายนำหน้า - หญิงตามหลัง และเริ่มต้นนับเลขที่ 1 ใหม่ในแต่ละห้องเรียน):",
      icon: "question",
      showCancelButton: true,
      confirmButtonText: "เรียงตาม รหัสนักเรียน ก-ฮ (ชาย-หญิง)",
      cancelButtonText: "ยกเลิก",
      confirmButtonColor: "#4f46e5",
      cancelButtonColor: "#ef4444",
      background: '#2a2b2f',
      color: '#ffffff',
      customClass: {
        confirmButton: "mx-1 my-1 px-4 py-2 rounded-xl text-xs font-bold text-white shadow-md transition-all active:scale-95",
        cancelButton: "mx-1 my-1 px-4 py-2 rounded-xl text-xs font-bold text-white shadow-md transition-all active:scale-95"
      }
    });

    if (sortResult.isDismissed) return;

    Swal.fire({
      title: 'กำลังจัดลำดับเลขที่...',
      text: 'กรุณารอสักครู่ ระบบกำลังบันทึกข้อมูลลงฐานข้อมูล',
      allowOutsideClick: false,
      background: '#2a2b2f',
      color: '#ffffff',
      didOpen: () => {
        Swal.showLoading();
      }
    });

    try {
      const isMale = (s: Student) => {
        const title = (s.title || "").trim();
        const gender = (s.gender || "").trim();
        return ["นาย", "ด.ช.", "เด็กชาย"].includes(title) || ["ชาย", "male", "m"].includes(gender.toLowerCase());
      };

      const sortFn = (a: Student, b: Student) => {
        // เรียงตาม ก-ฮ (ชื่อ)
        const nameCompare = a.firstName.localeCompare(b.firstName, 'th');
        if (nameCompare !== 0) return nameCompare;
        return a.lastName.localeCompare(b.lastName, 'th');
      };

      // จัดกลุ่มนักเรียนแยกตามระดับชั้นเรียนและห้องเรียน เพื่อเริ่มต้นนับ 1 ใหม่ในแต่ละห้อง
      const groups: Record<string, Student[]> = {};
      targetStudents.forEach(student => {
        const key = `${student.classLevel}_${student.room}`;
        if (!groups[key]) {
          groups[key] = [];
        }
        groups[key].push(student);
      });

      const updatePromises: Promise<void>[] = [];
      const localUpdatesMap: Record<string, string> = {};

      Object.keys(groups).forEach(key => {
        const groupStudents = groups[key];
        const males = groupStudents.filter(isMale);
        const females = groupStudents.filter(s => !isMale(s));

        males.sort(sortFn);
        females.sort(sortFn);

        const sortedGroup = [...males, ...females];
        sortedGroup.forEach((student, idx) => {
          const numStr = String(idx + 1); // เริ่มนับจากเลขที่ 1 ใหม่ในแต่ละห้องเรียนเสมอ
          localUpdatesMap[student.id] = numStr;

          const studentDocRef = doc(firestore, "school-settings", schoolId, "students", student.id);
          updatePromises.push(updateDoc(studentDocRef, { studentNumber: numStr }));
        });
      });

      await Promise.all(updatePromises);

      // อัปเดตข้อมูล State ในหน้าเว็บ
      setStudents(prev => prev.map(s => {
        if (localUpdatesMap[s.id] !== undefined) {
          return { ...s, studentNumber: localUpdatesMap[s.id] };
        }
        return s;
      }));

      Swal.fire({
        title: 'สำเร็จ!',
        text: `จัดเลขที่นักเรียนจำนวน ${targetStudents.length} คน เรียบร้อยแล้ว (โดยแยกห้องและนับเลขที่ 1 ใหม่ในแต่ละห้องเรียนเรียบร้อย)`,
        icon: 'success',
        background: '#2a2b2f',
        color: '#ffffff'
      });
    } catch (err) {
      console.error("Error bulk assigning student numbers: ", err);
      Swal.fire({
        title: 'เกิดข้อผิดพลาด!',
        text: 'ไม่สามารถบันทึกข้อมูลจัดลำดับเลขที่ได้',
        icon: 'error',
        background: '#2a2b2f',
        color: '#ffffff'
      });
    }
  };

  const fetchStudents = useCallback(async (currentSchoolId: string) => {
    setIsLoading(true);
    setError(null);
    try {
      const studentsCollection = collection(firestore, "school-settings", currentSchoolId, "students");
      // เรียงข้อมูลตามวันที่สร้างล่าสุดมาไว้บนสุด
      const q = query(studentsCollection, orderBy("createdAt", "desc"));
      const querySnapshot = await getDocs(q);
      const studentsData = querySnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data(),
      } as Student)).filter(isCurrentStudent);
      setStudents(studentsData);
    } catch (err) {
      console.error("Error fetching students: ", err);
      setError("เกิดข้อผิดพลาดในการดึงข้อมูลนักเรียน");
    } finally {
      setIsLoading(false);
    }
  }, []);



  useEffect(() => {
    const fetchLevels = async () => {
      if (!schoolId) return;
      try {
        const schoolRef = doc(firestore, "school-settings", schoolId);
        const schoolSnap = await getDoc(schoolRef);
        if (schoolSnap.exists()) {
          const data = schoolSnap.data();
          const levels = getLevelsByRange(data.opportunityExpansionLevel);
          setAvailableLevels(levels);
        }
      } catch (error) {
        console.error("Error fetching school levels:", error);
      }
    };
    fetchLevels();
  }, [schoolId]);

  // Reset pagination when filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, selectedClassLevel, selectedRoom]);

  useEffect(() => {
    const unsub = auth.onAuthStateChanged(async (user) => {
      if (user) {
        const userDocRef = doc(firestore, "users", user.uid);
        const userDocSnap = await getDoc(userDocRef);
        if (userDocSnap.exists()) {
          const schoolId = userDocSnap.data().schoolId;
          if (schoolId) {
            setSchoolId(schoolId);
            fetchStudents(schoolId);
          } else {
            setError("ไม่พบข้อมูลโรงเรียนสำหรับบัญชีของคุณ");
            setIsLoading(false);
          }
        }
      }
    });
    return () => unsub();
  }, []);

  const renderContent = () => {
    if (isLoading) {
      return <SkeletonLoader />;
    }

    if (error) {
      return <div className="text-center py-10 text-red-400">{error}</div>;
    }

    if (!selectedClassLevel) {
      return (
        <div className="flex flex-col items-center justify-center py-20 px-4 text-center">
          <div className="w-20 h-20 bg-indigo-100 dark:bg-indigo-900/30 rounded-full flex items-center justify-center mb-4">
            <FaFilter className="text-indigo-600 dark:text-indigo-400 text-3xl" />
          </div>
          <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-2">กรุณาเลือกชั้นเรียน</h3>
          <p className="text-gray-500 dark:text-gray-400 max-w-sm">
            โปรดเลือกชั้นเรียนจากเมนูเลือกด้านบน เพื่อแสดงรายชื่อนักเรียนในชั้นเรียนนั้นๆ
          </p>
        </div>
      );
    }

    const filteredStudents = students.filter(student =>
      `${student.title}${student.firstName} ${student.lastName}`.toLowerCase().includes(searchTerm.toLowerCase()) ||
      student.studentId.toLowerCase().includes(searchTerm.toLowerCase())
    ).filter(student => {
      if (selectedClassLevel === 'ม.ต้น') return ['ม.1', 'ม.2', 'ม.3'].includes(student.classLevel);
      if (selectedClassLevel === 'ม.ปลาย') return ['ม.4', 'ม.5', 'ม.6'].includes(student.classLevel);
      return student.classLevel === selectedClassLevel;
    })
      .filter(student => selectedRoom === '' || student.room === selectedRoom);

    // Sorting Logic
    const isMaleStudent = (s: Student) => {
      const title = (s.title || "").trim();
      const gender = (s.gender || "").trim();
      return ["นาย", "ด.ช.", "เด็กชาย"].includes(title) || ["ชาย", "male", "m"].includes(gender.toLowerCase());
    };

    const sortedStudents = [...filteredStudents].sort((a, b) => {
      if (sortBy === 'latest') {
        const timeA = a.createdAt?.seconds || 0;
        const timeB = b.createdAt?.seconds || 0;
        return timeB - timeA;
      }

      if (sortBy === 'studentNumber') {
        const hasA = !!a.studentNumber;
        const hasB = !!b.studentNumber;
        if (hasA !== hasB) return hasA ? -1 : 1;
        if (hasA && hasB) {
          const numA = parseInt(a.studentNumber || '0', 10);
          const numB = parseInt(b.studentNumber || '0', 10);
          if (numA !== numB) return numA - numB;
        }
        // Fallback to gender (male first) if numbers are missing/equal
        const aIsMale = isMaleStudent(a);
        const bIsMale = isMaleStudent(b);
        if (aIsMale !== bIsMale) return aIsMale ? -1 : 1;
        
        const idA = a.studentId || a.idCardNumber || "";
        const idB = b.studentId || b.idCardNumber || "";
        return idA.localeCompare(idB, undefined, { numeric: true, sensitivity: 'base' });
      }

      // Default (sortBy === 'studentId' or fallback) - sort by gender first (male first, female second), then by studentId
      const aIsMale = isMaleStudent(a);
      const bIsMale = isMaleStudent(b);
      if (aIsMale !== bIsMale) return aIsMale ? -1 : 1;
      
      const idA = a.studentId || a.idCardNumber || "";
      const idB = b.studentId || b.idCardNumber || "";
      return idA.localeCompare(idB, undefined, { numeric: true, sensitivity: 'base' });
    });

    // Pagination Logic
    const totalPages = Math.ceil(sortedStudents.length / itemsPerPage);
    const indexOfLastItem = currentPage * itemsPerPage;
    const indexOfFirstItem = indexOfLastItem - itemsPerPage;
    const currentStudents = sortedStudents.slice(indexOfFirstItem, indexOfLastItem);

    if (sortedStudents.length === 0) {
      return (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <div className="w-16 h-16 bg-gray-100 dark:bg-gray-800 rounded-full flex items-center justify-center mb-4">
            <FaSearch className="text-gray-400 dark:text-gray-500 text-2xl" />
          </div>
          <p className="text-gray-500 dark:text-gray-400 font-medium">ไม่พบข้อมูลนักเรียนในชั้นเรียนนี้</p>
          {searchTerm && <p className="text-sm text-gray-400 dark:text-gray-500 mt-1">สำหรับการค้นหา: "{searchTerm}"</p>}
        </div>
      );
    }


    return (
      <div className="table-responsive">
        <table className="min-w-full divide-y divide-gray-700">
          <thead className="bg-gray-100 dark:bg-[#2a2b2f]">
            <tr>
              <th scope="col" className="py-3 px-2 text-left text-xs font-semibold text-gray-600 dark:text-gray-300 w-12">ลำดับ</th>
              <th scope="col" className="py-3 px-2 text-left text-xs font-semibold text-gray-600 dark:text-gray-300 w-16">เลขที่</th>
              <th scope="col" className="py-3 px-2 text-left text-xs font-semibold text-gray-600 dark:text-gray-300">ชื่อ-สกุล</th>
              <th scope="col" className="px-2 py-3 text-left text-xs font-semibold text-gray-600 dark:text-gray-300">รหัสนักเรียน</th>
              <th scope="col" className="px-2 py-3 text-left text-xs font-semibold text-gray-600 dark:text-gray-300">ชั้น/ห้อง</th>
              <th scope="col" className="hidden lg:table-cell px-2 py-3 text-left text-xs font-semibold text-gray-600 dark:text-gray-300">เลขบัตรประชาชน / RFID</th>
              <th scope="col" className="hidden lg:table-cell px-2 py-3 text-left text-xs font-semibold text-gray-600 dark:text-gray-300">เบอร์โทรผู้ปกครอง</th>
              <th scope="col" className="hidden md:table-cell px-2 py-3 text-left text-xs font-semibold text-gray-600 dark:text-gray-300">สิทธิ์ (Role)</th>
              <th scope="col" className="hidden xl:table-cell px-2 py-3 text-left text-xs font-semibold text-gray-600 dark:text-gray-300">คะแนนความประพฤติ</th>
              <th scope="col" className="px-2 py-3 text-left text-xs font-semibold text-gray-600 dark:text-gray-300">สถานะ</th>
              <CanAccess roles={ACADEMIC_ACCESS}>
                <th scope="col" className="py-3 pl-3 pr-4 sm:pr-6 text-right text-xs font-semibold text-gray-600 dark:text-gray-300">
                  ดำเนินการ
                </th>
              </CanAccess>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200 dark:divide-gray-800 bg-white dark:bg-[#1e1f21]">
            {currentStudents.map((student, index) => (
              <tr key={student.id} className="hover:bg-gray-50 dark:hover:bg-[#2a2b2f]/50 transition-colors">
                <td className="whitespace-nowrap py-3 px-2 text-xs text-center font-medium text-gray-500 dark:text-gray-400">{indexOfFirstItem + index + 1}</td>
                <td className="whitespace-nowrap px-2 py-3 text-xs w-20">
                  <CanAccess roles={ACADEMIC_ACCESS} fallback={
                    <span className="font-bold text-gray-700 dark:text-gray-300 pl-2">
                      {student.studentNumber || "-"}
                    </span>
                  }>
                    {student.studentNumber && editingStudentNumberId !== student.id ? (
                      <div 
                        className="w-12 text-center py-1 px-1 font-bold text-gray-700 dark:text-gray-300 rounded-md cursor-pointer hover:bg-gray-100 dark:hover:bg-[#2a2b2f]/80 hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors"
                        onClick={() => setEditingStudentNumberId(student.id)}
                        title="คลิกเพื่อแก้ไขเลขที่"
                      >
                        {student.studentNumber}
                      </div>
                    ) : (
                      <input
                        type="text"
                        className="w-12 text-center py-1 px-1 bg-gray-50 dark:bg-zinc-800/80 border border-gray-200 dark:border-gray-700 rounded-md focus:ring-1 focus:ring-indigo-500 outline-none text-xs font-black text-slate-800 dark:text-white"
                        value={student.studentNumber || ""}
                        autoFocus={editingStudentNumberId === student.id}
                        onChange={(e) => {
                          const val = e.target.value;
                          setStudents(prev => prev.map(s => s.id === student.id ? { ...s, studentNumber: val } : s));
                        }}
                        onBlur={(e) => {
                          handleUpdateField(student.id, { studentNumber: e.target.value });
                          setEditingStudentNumberId(null);
                        }}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            (e.target as HTMLInputElement).blur();
                          }
                        }}
                        placeholder="-"
                      />
                    )}
                  </CanAccess>
                </td>
                <td className="whitespace-nowrap py-3 px-2 text-xs">
                  <Link to={`/school/${student.schoolId}/students/view/${student.id}`} className="flex items-center group">
                    <ProfileAvatar
                      className="h-8 w-8"
                      src={student.profileImageUrl || `https://ui-avatars.com/api/?name=${student.firstName}+${student.lastName}&background=random`}
                      alt={`${student.firstName} ${student.lastName}`}
                    />
                    <div className="ml-3">
                      <div className="font-medium text-gray-900 dark:text-gray-200 group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition-colors">{`${student.title}${student.firstName} ${student.lastName}`}</div>
                    </div>
                  </Link>
                </td>
                <td className="whitespace-nowrap px-2 py-3 text-xs text-gray-500 dark:text-gray-400">{student.studentId}</td>
                <td className="whitespace-nowrap px-2 py-3 text-xs text-gray-500 dark:text-gray-400">
                  {`${student.classLevel}/${student.room}`}
                </td>
                <td className="hidden lg:table-cell whitespace-nowrap px-2 py-3 text-xs text-gray-500 dark:text-gray-400">
                  {(student.idCardNumber || student.rfid) ? (
                    <ul className="list-disc list-inside space-y-0.5 font-mono">
                      {student.idCardNumber && <li>{student.idCardNumber}</li>}
                      {student.rfid && <li>{student.rfid}</li>}
                    </ul>
                  ) : (
                    "-"
                  )}
                </td>
                <td className="hidden lg:table-cell whitespace-nowrap px-2 py-3 text-xs text-gray-500 dark:text-gray-400">{student.guardianPhone || student.motherPhone || student.fatherPhone || student.phoneNumber || student.contact || '-'}</td>
                <td className="hidden md:table-cell whitespace-nowrap px-2 py-3 text-xs">
                  <div className="flex flex-wrap gap-1">
                    {(student.role || ["student"]).map((r, i) => (
                      <span key={i} className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold ${r === 'student' ? 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300' :
                        r === 'parent' ? 'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300' :
                          'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300'
                        }`}>
                        {r === 'student' ? 'นักเรียน' : r === 'parent' ? 'ผู้ปกครอง' : r}
                      </span>
                    ))}
                  </div>
                </td>
                <td className="hidden xl:table-cell whitespace-nowrap px-2 py-3 text-xs">
                  <CanAccess roles={ACADEMIC_ACCESS} fallback={
                    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium ${(student.behaviorScore ?? 100) >= 50 ? 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200' : 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200'}`}>
                      {student.behaviorScore ?? 100}
                    </span>
                  }>
                    {editingBehaviorScoreId !== student.id ? (
                      <span
                        className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium cursor-pointer hover:ring-2 hover:ring-indigo-500 transition-all ${(student.behaviorScore ?? 100) >= 50 ? 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200' : 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200'}`}
                        onClick={() => setEditingBehaviorScoreId(student.id)}
                        title="คลิกเพื่อแก้ไขคะแนนพฤติกรรม"
                      >
                        {student.behaviorScore ?? 100}
                      </span>
                    ) : (
                      <input
                        type="number"
                        className="w-16 text-center border border-gray-300 dark:border-gray-700 dark:bg-[#1e1f21] rounded px-1.5 py-0.5 text-xs font-semibold focus:outline-none focus:ring-1 focus:ring-indigo-500 text-gray-900 dark:text-white"
                        value={student.behaviorScore ?? 100}
                        autoFocus={editingBehaviorScoreId === student.id}
                        onChange={(e) => {
                          const val = e.target.value === "" ? 0 : Number(e.target.value);
                          setStudents(prev => prev.map(s => s.id === student.id ? { ...s, behaviorScore: val } : s));
                        }}
                        onBlur={(e) => {
                          const val = e.target.value === "" ? 100 : Number(e.target.value);
                          handleUpdateField(student.id, { behaviorScore: val });
                          setEditingBehaviorScoreId(null);
                        }}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            (e.target as HTMLInputElement).blur();
                          } else if (e.key === 'Escape') {
                            setEditingBehaviorScoreId(null);
                          }
                        }}
                        min="0"
                        max="100"
                      />
                    )}
                  </CanAccess>
                </td>
                <td className="whitespace-nowrap px-2 py-3 text-xs">
                  <CanAccess roles={ACADEMIC_ACCESS} fallback={
                    <span className={`inline-flex items-center rounded-md px-2 py-0.5 text-[10px] font-medium border ${statusColorMap[getStudentStatus(student)] || 'bg-gray-500/20 text-gray-400 border-gray-500/30'}`}>
                      {getStudentStatus(student)}
                    </span>
                  }>
                    <div className={`inline-flex items-center px-2 py-0.5 rounded-lg text-[10px] font-medium transition-all border ${statusColorMap[getStudentStatus(student)] || 'bg-gray-500/20 text-gray-400 border-gray-500/30'} ${isUpdating === student.id ? 'opacity-50 pointer-events-none' : 'hover:ring-1 hover:ring-indigo-500'} group cursor-pointer min-w-[120px] justify-between`}>
                      <Select
                        className="w-full"
                        options={statusOptions}
                        styles={selectStyles}
                        components={{ DropdownIndicator: CustomDropdownIndicator }}
                        value={statusOptions.find(opt => opt.value === getStudentStatus(student)) || { value: getStudentStatus(student), label: getStudentStatus(student) }}
                        onChange={(newValue: any) => handleUpdateField(student.id, { status: newValue.value, studentStatus: newValue.value })}
                        isSearchable={false}
                        menuPortalTarget={document.body}
                        classNamePrefix="status-select"
                      />
                    </div>
                  </CanAccess>
                </td>
                <CanAccess roles={ACADEMIC_ACCESS}>
                  <td className="relative whitespace-nowrap py-3 pl-3 pr-4 text-right text-xs font-medium sm:pr-6">
                    <div className="flex justify-end items-center gap-x-3">
                      <Link to={`/school/${student.schoolId}/students/edit/${student.id}`} className="text-indigo-400 hover:text-indigo-300 transition-colors" title="แก้ไข">
                        <FaUserEdit size={14} />
                      </Link>
                      <button onClick={() => handleDelete(student)} className="text-red-500 hover:text-red-400 transition-colors" title="ลบ">
                        <FaTrashAlt size={13} />
                      </button>
                    </div>
                  </td>
                </CanAccess>
              </tr>
            ))}
          </tbody>
        </table>

        {/* Pagination UI */}
        {totalPages > 1 && (
          <div className="px-6 py-4 bg-gray-50 dark:bg-white/5 border-t border-gray-200 dark:border-gray-800">
            <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
              <div className="text-xs text-gray-500 dark:text-gray-400">
                แสดง {indexOfFirstItem + 1} ถึง {Math.min(indexOfLastItem, sortedStudents.length)} จาก {sortedStudents.length} รายการ
              </div>
              <div className="flex flex-wrap items-center justify-center gap-1.5 p-1 bg-gray-50/50 dark:bg-black/20 rounded-xl border border-gray-200/50 dark:border-white/5">
                <button
                  onClick={() => setCurrentPage(1)}
                  disabled={currentPage === 1}
                  className="px-2.5 py-1.5 rounded-lg border border-transparent hover:border-gray-200 dark:hover:border-white/10 hover:bg-white dark:hover:bg-white/5 disabled:opacity-30 disabled:cursor-not-allowed transition-all text-[10px] font-bold text-gray-600 dark:text-gray-400 flex items-center gap-1"
                  title="หน้าแรก"
                >
                  <ChevronsLeft size={14} />
                  <span className="hidden sm:inline text-[9px] uppercase tracking-wider">หน้าแรก</span>
                </button>
                
                <button
                  onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))}
                  disabled={currentPage === 1}
                  className="px-2.5 py-1.5 rounded-lg border border-transparent hover:border-gray-200 dark:hover:border-white/10 hover:bg-white dark:hover:bg-white/5 disabled:opacity-30 disabled:cursor-not-allowed transition-all text-[10px] font-bold text-gray-600 dark:text-gray-400 flex items-center gap-1"
                  title="ย้อนกลับ"
                >
                  <ChevronLeft size={14} />
                  <span className="hidden sm:inline text-[9px] uppercase tracking-wider">ย้อนกลับ</span>
                </button>

                <div className="h-4 w-[1px] bg-gray-200 dark:bg-white/10 mx-1" />

                <div className="flex items-center gap-1">
                  {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                    let pageNum = i + 1;
                    if (totalPages > 5) {
                      const start = Math.max(1, Math.min(currentPage - 2, totalPages - 4));
                      pageNum = start + i;
                    }
                    return (
                      <button
                        key={pageNum}
                        onClick={() => setCurrentPage(pageNum)}
                        className={`w-8 h-8 flex items-center justify-center rounded-lg text-xs font-bold transition-all ${currentPage === pageNum
                          ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-600/20 scale-105'
                          : 'hover:bg-white dark:hover:bg-white/5 text-gray-600 dark:text-gray-400'
                          }`}
                      >
                        {pageNum}
                      </button>
                    );
                  })}
                </div>

                <div className="h-4 w-[1px] bg-gray-200 dark:bg-white/10 mx-1" />

                <button
                  onClick={() => setCurrentPage(prev => Math.min(prev + 1, totalPages))}
                  disabled={currentPage === totalPages}
                  className="px-2.5 py-1.5 rounded-lg border border-transparent hover:border-gray-200 dark:hover:border-white/10 hover:bg-white dark:hover:bg-white/5 disabled:opacity-30 disabled:cursor-not-allowed transition-all text-[10px] font-bold text-gray-600 dark:text-gray-400 flex items-center gap-1"
                  title="ถัดไป"
                >
                  <span className="hidden sm:inline text-[9px] uppercase tracking-wider">ถัดไป</span>
                  <ChevronRight size={14} />
                </button>

                <button
                  onClick={() => setCurrentPage(totalPages)}
                  disabled={currentPage === totalPages}
                  className="px-2.5 py-1.5 rounded-lg border border-transparent hover:border-gray-200 dark:hover:border-white/10 hover:bg-white dark:hover:bg-white/5 disabled:opacity-30 disabled:cursor-not-allowed transition-all text-[10px] font-bold text-gray-600 dark:text-gray-400 flex items-center gap-1"
                  title="หน้าสุดท้าย"
                >
                  <span className="hidden sm:inline text-[9px] uppercase tracking-wider">หน้าสุดท้าย</span>
                  <ChevronsRight size={14} />
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  };

  return (
    <MainLayout>
      <div className="min-h-screen bg-gray-50 dark:bg-[#1e1f21] text-gray-900 dark:text-white overflow-x-hidden">
        <div className="w-full pl-12 pr-2 sm:pl-14 sm:pr-4 md:pl-16 md:pr-6 py-4 sm:py-6 lg:py-8">
          <header className="mb-6 space-y-4">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2">
              <div>
                <div className="flex items-center gap-4">
                  <BackButton to="/academic/hub/students" />
                  <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">ข้อมูลนักเรียนทั้งหมด</h1>
                </div>
                <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                  แสดง, จัดการ, และเพิ่มข้อมูลนักเรียนในระบบ
                </p>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-3 p-4 bg-white dark:bg-[#2a2b2f]/80 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700/50 backdrop-blur-sm">
              <div className="relative w-44 sm:w-48 md:w-52 flex-shrink-0">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <FaSearch className="text-gray-400 text-xs" />
                </div>
                <input
                  type="text"
                  placeholder="ค้นหาชื่อ, รหัสนักเรียน..."
                  className="pl-8 pr-4 py-2 w-full bg-gray-50 dark:bg-[#1e1f21] border border-gray-200 dark:border-gray-700 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none transition-all text-xs text-gray-900 dark:text-white"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                />
              </div>

              <select
                value={selectedClassLevel}
                onChange={(e) => setSelectedClassLevel(e.target.value)}
                className="pl-3 pr-8 py-2 bg-gray-50 dark:bg-[#1e1f21] border border-gray-200 dark:border-gray-700 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none text-xs text-gray-900 dark:text-white font-bold"
              >
                <option value="">ทุกชั้น</option>
                {availableLevels.map(level => <option key={level} value={level}>{level}</option>)}
              </select>
              <select
                value={selectedRoom}
                onChange={(e) => setSelectedRoom(e.target.value)}
                className="pl-3 pr-8 py-2 bg-gray-50 dark:bg-[#1e1f21] border border-gray-200 dark:border-gray-700 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none text-xs text-gray-900 dark:text-white font-bold"
              >
                <option value="">ทุกห้อง</option>
                {Array.from({ length: 20 }, (_, i) => i + 1).map(r => <option key={r} value={r}>{r}</option>)}
              </select>


              <div className="flex flex-wrap items-center gap-2 ml-auto">
                <CanAccess roles={ACADEMIC_ACCESS}>
                  {/* ปุ่มอัพเดทเลขที่ */}
                  <button
                    type="button"
                    onClick={handleBulkAssignNumbers}
                    className="flex items-center justify-center gap-2 bg-gradient-to-r from-pink-500 to-rose-500 hover:from-pink-600 hover:to-rose-600 text-white px-4 py-2 rounded-xl font-bold transition-all shadow-sm active:scale-95 text-xs whitespace-nowrap border border-pink-400 dark:border-pink-500"
                  >
                    <FaSortNumericDown size={12} />
                    <span>อัพเดทเลขที่</span>
                  </button>

                  <Link
                    to={schoolId ? `/school/${schoolId}/map-rfid/students` : '#'}
                    className="flex items-center justify-center gap-2 bg-purple-600 hover:bg-purple-700 text-white px-4 py-2 rounded-xl font-medium transition-all shadow-sm active:scale-95 text-xs whitespace-nowrap animate-pulse"
                  >
                    <FaIdCard size={12} />
                    <span>จับคู่ RFID</span>
                  </Link>

                  <Link
                    to={schoolId ? `/school/${schoolId}/students/quick-add` : '#'}
                    className="flex items-center justify-center gap-2 bg-amber-600 hover:bg-amber-700 text-white px-4 py-2 rounded-xl font-medium transition-all shadow-sm active:scale-95 text-xs whitespace-nowrap"
                  >
                    <FaUserPlus size={12} />
                    <span>เพิ่มนักเรียนด่วน</span>
                  </Link>
                  <Link
                    to={schoolId ? `/school/${schoolId}/students/add` : '#'}
                    className="flex items-center justify-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-xl font-medium transition-all shadow-sm active:scale-95 text-xs whitespace-nowrap"
                  >
                    <FaPlus size={12} />
                    <span>เพิ่มนักเรียนใหม่</span>
                  </Link>
                  <Link
                    to={schoolId ? `/school/${schoolId}/students/import-dmc` : '#'}
                    className="hidden md:flex items-center justify-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2 rounded-xl font-medium transition-all shadow-sm active:scale-95 text-xs whitespace-nowrap"
                  >
                    <FaFileExcel size={12} />
                    <span>นำเข้า DMC</span>
                  </Link>
                  <Link
                    to="/academic/alumni-management"
                    className="flex items-center justify-center gap-2 bg-slate-600 hover:bg-slate-700 text-white px-4 py-2 rounded-xl font-medium transition-all shadow-sm active:scale-95 text-xs whitespace-nowrap"
                  >
                    <History size={12} />
                    <span>ประวัติศิษย์เก่า</span>
                  </Link>
                </CanAccess>
              </div>
            </div>
          </header>

          <main>
            <div className="bg-white dark:bg-[#2a2b2f]/60 rounded-2xl shadow-lg ring-1 ring-black/5 dark:ring-white/5">
              {renderContent()}
            </div>
            <ToastContainer />
          </main>
        </div>
      </div>
    </MainLayout>
  );
}
