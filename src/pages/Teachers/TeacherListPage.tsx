import React, { useState, useEffect, useCallback } from "react";
import { useSelector } from "react-redux";
import { RootState } from "@/store";
import { Link, useParams } from "react-router-dom";
import MainLayout from "@/layouts/MainLayout";
import BackButton from "@/components/Shared/BackButton";
import ProfileAvatar from "@/components/Shared/ProfileAvatar";
import { firestore, storage, auth } from "@/firebase";
import { collection, getDocs, query, where, Timestamp, doc, deleteDoc, getDoc, updateDoc, setDoc } from "firebase/firestore";
import { getFunctions, httpsCallable } from 'firebase/functions';
import { ref, deleteObject } from "firebase/storage";
import { FaPlus, FaUserEdit, FaTrashAlt, FaSearch, FaUserPlus, FaCloudUploadAlt, FaFileExcel, FaCheck, FaTimes, FaIdCard } from "react-icons/fa";
import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, MoreVertical, ChevronDown } from "lucide-react";
import { syncHeadOfLearningArea } from "@/utils/subjectGroupSync";
import Swal from 'sweetalert2';
import CanAccess from "@/components/AccessControl/CanAccess";
import { usePermissions } from "@/hooks/usePermissions";
import { useTheme } from "@/ThemeContext";
import { useSubjectGroups } from "@/hooks/useSubjectGroups";
import Select, { StylesConfig, components } from "react-select";
import { toast, ToastContainer } from "react-toastify";
import "react-toastify/dist/ReactToastify.css";
import { isActiveTeacherSummaryStatus, updateOwnerAndSchoolCounts } from "@/utils/ownerStatsUtils";
import { isAttendanceEntryOnly } from "@/utils/attendanceRoles";

// กำหนด Type สำหรับข้อมูลครู
interface Teacher {
  id: string;
  profileImageUrl?: string;
  teacherId: string;
  idCardNumber?: string;
  rfid?: string;
  title: string;
  firstName: string;
  lastName: string;
  department?: string;
  contact?: string;
  schoolId: string;
  createdAt: Timestamp;
  subject?: string;
  subjects?: string[];
  academicStanding?: string;
  status?: string;
  isHeadOfLearningArea?: boolean;
  learningArea?: string;
  subjectGroup?: string;
  role?: string | string[];
  personnelType?: 'teacher' | 'user';
}

const STAFF_ROLES = new Set([
  'teacher',
  'school_admin',
  'general_user',
  'academic_admin',
  'super_admin',
  'admin',
  'academic',
  'student_attendance',
  'teacher_attendance',
  'school_attendance',
  'student_affairs',
]);

const toRoleArray = (role: unknown): string[] => {
  if (Array.isArray(role)) {
    return role.filter((item): item is string => typeof item === 'string');
  }
  return typeof role === 'string' ? [role] : [];
};

const hasStaffRole = (role: unknown) =>
  toRoleArray(role).some(roleName => STAFF_ROLES.has(roleName.toLowerCase()));

const resolvePersonnelType = (data: any): 'teacher' | 'user' => {
  if (data.personnelType === 'teacher' || data.personnelType === 'user') {
    return data.personnelType;
  }
  const roles = toRoleArray(data.role);
  if (!roles.some(role => role.toLowerCase() === 'teacher')) return 'user';
  if (isAttendanceEntryOnly(roles)) return 'user';
  return 'teacher';
};

const isAttendanceOnlyAccount = (role: unknown) => {
  const roles = toRoleArray(role).map(item => item.toLowerCase());
  return roles.length > 0 && isAttendanceEntryOnly(roles);
};

const buildFallbackTeacherFromUser = (id: string, data: any, schoolId: string): Teacher => {
  const roles = toRoleArray(data.role);
  const isSchoolAdmin = roles.some(role => role.toLowerCase() === 'school_admin');
  const isSuperAdmin = roles.some(role => role.toLowerCase() === 'super_admin');
  const nameParts = (data.fullName || '').trim().split(/\s+/).filter(Boolean);

  return {
    id,
    uid: data.uid || id,
    schoolId,
    title: data.title || '',
    firstName: data.firstName || nameParts[0] || data.fullName || data.email || 'ไม่ระบุชื่อ',
    lastName: data.lastName || nameParts.slice(1).join(' '),
    email: data.email || '',
    role: roles,
    profileImageUrl: data.profileImageUrl || data.profileUrl || '',
    teacherId: data.teacherId || '',
    idCardNumber: data.idCardNumber || '',
    rfid: data.rfid || '',
    position: data.position || (isSuperAdmin ? 'ผู้ดูแลระบบสูงสุด' : isSchoolAdmin ? 'ผู้ดูแลระบบโรงเรียน' : 'ครู'),
    department: data.department || 'งานบริหารทั่วไป',
    status: data.status || 'อยู่',
    learningArea: data.learningArea || '',
    subjectGroup: data.subjectGroup || '',
    createdAt: data.createdAt || data.updatedAt || Timestamp.fromMillis(0),
  } as Teacher;
};


// --- Skeleton Loader Component ---
const SkeletonLoader = () => (
  <div className="table-responsive animate-pulse">
    <table className="min-w-full divide-y divide-gray-700">
      <thead className="bg-gray-100 dark:bg-[#2a2b2f]">
        <tr>
          <th scope="col" className="py-3.5 pl-4 pr-3 text-left text-sm font-semibold text-gray-600 dark:text-gray-300 sm:pl-6 w-16">ลำดับ</th>
          <th scope="col" className="py-3.5 pl-4 pr-3 text-left text-sm font-semibold text-gray-600 dark:text-gray-300 sm:pl-6">ชื่อ-สกุล</th>
          <th scope="col" className="px-3 py-3.5 text-left text-sm font-semibold text-gray-600 dark:text-gray-300">วิทยฐานะ</th>
          <th scope="col" className="px-3 py-3.5 text-left text-sm font-semibold text-gray-600 dark:text-gray-300">รหัสครู</th>
          <th scope="col" className="px-3 py-3.5 text-left text-sm font-semibold text-gray-600 dark:text-gray-300">กลุ่มสาระ</th>
          <th scope="col" className="px-3 py-3.5 text-left text-sm font-semibold text-gray-600 dark:text-gray-300">เบอร์ติดต่อ</th>
          <th scope="col" className="relative py-3.5 pl-3 pr-4 sm:pr-6"><span className="sr-only">Actions</span></th>
        </tr>
      </thead>
      <tbody className="divide-y divide-gray-200 dark:divide-gray-800 bg-white dark:bg-[#1e1f21]">
        {[...Array(8)].map((_, i) => (
          <tr key={i}>
            <td className="whitespace-nowrap py-4 pl-4 pr-3 text-sm text-center sm:pl-6"><div className="h-4 w-4 mx-auto rounded bg-gray-300 dark:bg-gray-700"></div></td>
            <td className="whitespace-nowrap py-4 pl-4 pr-3 text-sm sm:pl-6">
              <div className="flex items-center">
                <div className="h-10 w-10 rounded-full bg-gray-300 dark:bg-gray-700"></div>
                <div className="ml-4 h-4 w-32 rounded bg-gray-300 dark:bg-gray-700"></div>
              </div>
            </td>
            <td className="whitespace-nowrap px-3 py-4 text-sm"><div className="h-4 w-24 rounded bg-gray-300 dark:bg-gray-700"></div></td>
            <td className="whitespace-nowrap px-3 py-4 text-sm"><div className="h-4 w-20 rounded bg-gray-300 dark:bg-gray-700"></div></td>
            <td className="whitespace-nowrap px-3 py-4 text-sm"><div className="h-4 w-24 rounded bg-gray-300 dark:bg-gray-700"></div></td>
            <td className="whitespace-nowrap px-3 py-4 text-sm"><div className="h-4 w-24 rounded bg-gray-300 dark:bg-gray-700"></div></td>
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
export default function TeacherListPage() {
  const [teachers, setTeachers] = useState<Teacher[]>([]);
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [schoolId, setSchoolId] = useState<string | null>(null);
  const { schoolId: paramSchoolId } = useParams<{ schoolId?: string }>();
  const { ADMIN_ACCESS } = usePermissions();
  const profile = useSelector((state: RootState) => state.profile);

  // Pagination State
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage] = useState(20);

  const [activeTab, setActiveTab] = useState<'all' | 'teacher' | 'user'>('all');
  const [editingTeacherId, setEditingTeacherId] = useState<string | null>(null);
  const [tempTeacherId, setTempTeacherId] = useState("");
  const [isUpdating, setIsUpdating] = useState<string | null>(null);

  const { subjectGroups } = useSubjectGroups(schoolId || undefined);

  const statusOptions = [
    { value: 'อยู่', label: 'อยู่' },
    { value: 'ย้าย', label: 'ย้าย' },
    { value: 'เกษียณ', label: 'เกษียณ' },
    { value: 'ศึกษาต่อ', label: 'ศึกษาต่อ' },
    { value: 'ช่วยราชการ', label: 'ช่วยราชการ' },
    { value: 'ออก', label: 'ออก' },
    { value: 'ถึงแก่กรรม', label: 'ถึงแก่กรรม' },
  ];

  const departmentOptions = [
    { value: '', label: 'ไม่ระบุ' },
    { value: 'งานบริหารวิชาการ', label: 'งานบริหารวิชาการ' },
    { value: 'งานบริหารงบประมาณ', label: 'งานบริหารงบประมาณ' },
    { value: 'งานบริหารบุคคล', label: 'งานบริหารบุคคล' },
    { value: 'งานบริหารทั่วไป', label: 'งานบริหารทั่วไป' },
    { value: 'งานบริหารกิจการนักเรียน', label: 'งานบริหารกิจการนักเรียน' },
    { value: 'ฝ่ายบริหาร', label: 'ฝ่ายบริหาร' },
  ];

  const getStatusStyles = (status: string) => {
    switch (status) {
      case 'ย้าย': return 'bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-300';
      case 'เกษียณ': return 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-300';
      case 'ศึกษาต่อ': 
      case 'ลาศึกษาต่อ': return 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300';
      case 'ช่วยราชการ': return 'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300';
      case 'ออก': return 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300';
      case 'ถึงแก่กรรม': return 'bg-black text-white';
      default: return 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300';
    }
  };

  const { isDarkMode } = useTheme();

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
      overflow: 'visible',
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
    indicatorSeparator: () => ({
      display: 'none',
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
      overflow: 'visible',
      whiteSpace: 'nowrap',
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

  const handleUpdateField = async (teacherId: string, updates: Record<string, any>) => {
    if (!schoolId) return;
    setIsUpdating(teacherId);
    try {
      const teacherDocRef = doc(firestore, "school-settings", schoolId, "teachers", teacherId);
      const teacherSnap = await getDoc(teacherDocRef);
      const teacherObj = teachers.find(t => t.id === teacherId);
      const previousStatus = teacherSnap.exists()
        ? String(teacherSnap.data().status || teacherObj?.status || "อยู่").trim()
        : String(teacherObj?.status || "อยู่").trim();
      const nextStatus = String(updates.status || previousStatus).trim();
      
      let dataToSave = { ...updates };
      
      if (!teacherSnap.exists()) {
        if (teacherObj) {
          dataToSave = {
            uid: teacherId,
            firstName: teacherObj.firstName || "",
            lastName: teacherObj.lastName || "",
            title: teacherObj.title || "",
            email: (teacherObj as any).email || "",
            role: (teacherObj as any).role || ["teacher"],
            schoolId: schoolId,
            profileImageUrl: teacherObj.profileImageUrl || "",
            teacherId: teacherObj.teacherId || "",
            position: (teacherObj as any).position || "ครู",
            department: teacherObj.department || "งานบริหารทั่วไป",
            status: teacherObj.status || "อยู่",
            isHomeroomTeacher: (teacherObj as any).isHomeroomTeacher || false,
            gender: (teacherObj as any).gender || "",
            learningArea: teacherObj.learningArea || "",
            subjectGroup: teacherObj.subjectGroup || "",
            createdAt: teacherObj.createdAt || Timestamp.now(),
            ...updates,
          };
        }
      }
      
      await setDoc(teacherDocRef, dataToSave, { merge: true });
      const wasActive = isActiveTeacherSummaryStatus(previousStatus);
      const isActive = isActiveTeacherSummaryStatus(nextStatus);
      if (wasActive !== isActive) {
        await updateOwnerAndSchoolCounts(firestore, schoolId, { teachers: isActive ? 1 : -1 });
      }
      setTeachers(prev => prev.map(t => t.id === teacherId ? { ...t, ...updates } : t));
      toast.success("อัปเดตข้อมูลเรียบร้อยแล้ว", {
        position: "top-right",
        autoClose: 2000,
        hideProgressBar: true,
        closeOnClick: true,
        pauseOnHover: true,
        draggable: true,
        theme: "dark",
      });
    } catch (err) {
      console.error("Error updating teacher field: ", err);
      toast.error("ไม่สามารถอัปเดตข้อมูลได้", {
        position: "top-right",
        theme: "dark",
      });
    } finally {
      setIsUpdating(null);
    }
  };

  const handleIdUpdate = (teacherId: string) => {
    const newId = tempTeacherId.trim();
    if (!newId) {
      setEditingTeacherId(null);
      return;
    }

    // Check if duplicate
    const isDuplicate = teachers.some(t => t.teacherId === newId && t.id !== teacherId);
    if (isDuplicate) {
      toast.error(`รหัสครู "${newId}" มีอยู่ในระบบแล้ว`, {
        position: "top-center",
        theme: isDarkMode ? "dark" : "light",
      });
      return;
    }

    const currentTeacher = teachers.find(t => t.id === teacherId);
    if (currentTeacher && newId !== currentTeacher.teacherId) {
      handleUpdateField(teacherId, { teacherId: newId });
    }
    setEditingTeacherId(null);
  };

  const functions = getFunctions();

  const handleDelete = async (teacher: Teacher) => {
    Swal.fire({
      title: 'ยืนยันการลบ',
      text: `คุณแน่ใจหรือไม่ว่าต้องการลบข้อมูลของ ${teacher.firstName} ${teacher.lastName}? การกระทำนี้ไม่สามารถย้อนกลับได้`,
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
          didOpen: () => Swal.showLoading()
        });

        try {
          // 1. Delete User Account and Users collection (via Cloud Function)
          try {
            const deleteUserCallable = httpsCallable(functions, 'deleteUser');
            await deleteUserCallable({ userId: teacher.id });
          } catch (error) {
            console.warn("Could not delete teacher user account (might not exist):", error);
            // If the user doc exists but the callable failed, try deleting the user doc manually
            // although the callable is preferred as it handles Auth too.
          }

          // 2. Clear Head of Learning Area if applicable
          if (teacher.isHeadOfLearningArea && teacher.learningArea) {
            try {
              await syncHeadOfLearningArea(teacher.schoolId, teacher.id, '', teacher.learningArea, false);
            } catch (error) {
              console.warn("Could not clear head of learning area:", error);
            }
          }

          // 3. Delete teacher doc
          await deleteDoc(doc(firestore, "school-settings", teacher.schoolId, "teachers", teacher.id));
          if (isActiveTeacherSummaryStatus(teacher.status || "อยู่")) {
            await updateOwnerAndSchoolCounts(firestore, teacher.schoolId, { teachers: -1 });
          }

          // 4. Delete from Storage if image exists
          if (teacher.profileImageUrl) {
            const imageRef = ref(storage, teacher.profileImageUrl);
            await deleteObject(imageRef);
          }
          setTeachers(prevTeachers => prevTeachers.filter(t => t.id !== teacher.id));
          Swal.fire({ title: 'ลบสำเร็จ!', text: 'ข้อมูลครูถูกลบเรียบร้อยแล้ว', icon: 'success', background: '#2a2b2f', color: '#ffffff' });
        } catch (err) {
          console.error("Error deleting teacher: ", err);
          Swal.fire({ title: 'เกิดข้อผิดพลาด!', text: 'ไม่สามารถลบข้อมูลครูได้', icon: 'error', background: '#2a2b2f', color: '#ffffff' });
        }
      }
    });
  };

  const fetchTeachers = useCallback(async (currentSchoolId: string) => {
    setIsLoading(true);
    setError(null);
    try {
      const teachersCollection = collection(firestore, "school-settings", currentSchoolId, "teachers");
      const usersCollection = collection(firestore, "users");
      const usersQuery = query(usersCollection, where("schoolId", "==", currentSchoolId));
      const [querySnapshot, usersSnapshot] = await Promise.all([
        getDocs(teachersCollection),
        getDocs(usersQuery),
      ]);

      const usersDataMap = new Map(usersSnapshot.docs.map(doc => [doc.id, doc.data()]));
      const teachersData = querySnapshot.docs.map(doc => {
        const data = doc.data();
        const userData = usersDataMap.get(doc.id) || {};

        const firstName = data.firstName || userData.firstName || '';
        const lastName = data.lastName || userData.lastName || '';
        const title = data.title || userData.title || '';

        const merged = {
          id: doc.id,
          schoolId: currentSchoolId,
          teacherId: data.teacherId || '',
          idCardNumber: data.idCardNumber || userData.idCardNumber || '',
          rfid: data.rfid || userData.rfid || '',
          title,
          firstName,
          lastName,
          status: data.status || userData.status || 'อยู่',
          profileImageUrl: data.profileImageUrl || userData.profileImageUrl || userData.profileUrl || '',
          department: data.department || userData.department || 'งานบริหารทั่วไป',
          contact: data.contact || userData.contact || '',
          isHeadOfLearningArea: data.isHeadOfLearningArea || userData.isHeadOfLearningArea || false,
          learningArea: data.learningArea || data.subjectGroup || userData.learningArea || userData.subjectGroup || '',
          subjectGroup: data.subjectGroup || data.learningArea || userData.subjectGroup || userData.learningArea || '',
          isHomeroomTeacher: data.isHomeroomTeacher || userData.isHomeroomTeacher || false,
          homeroomGrade: data.homeroomGrade || userData.homeroomGrade || '',
          homeroomRoom: data.homeroomRoom || userData.homeroomRoom || '',
          createdAt: data.createdAt || userData.createdAt || Timestamp.fromMillis(0),
          role: data.role || userData.role || [],
          ...data,
        };
        return { ...merged, personnelType: resolvePersonnelType(merged) } as Teacher;
      });

      const teachersById = new Map(teachersData.map(teacher => [teacher.id, teacher]));
      usersSnapshot.docs.forEach(userDoc => {
        if (teachersById.has(userDoc.id)) return;

        const userData = userDoc.data();
        if (!hasStaffRole(userData.role)) return;

          const fallback = buildFallbackTeacherFromUser(userDoc.id, userData, currentSchoolId);
        teachersById.set(userDoc.id, { ...fallback, personnelType: resolvePersonnelType(userData) });
      });

      // เรียงลำดับ: "อยู่" มาก่อนสถานะอื่น และเรียงตามวันที่สร้างล่าสุดในแต่ละกลุ่ม
      const sortedTeachers = Array.from(teachersById.values())
        .sort((a, b) => {
          const statusA = a.status || 'อยู่';
          const statusB = b.status || 'อยู่';

          if (statusA === 'อยู่' && statusB !== 'อยู่') return -1;
          if (statusA !== 'อยู่' && statusB === 'อยู่') return 1;

          // ถ้าสถานะเหมือนกัน (หรือเป็นกลุ่มสถานะอื่นเหมือนกัน) ให้เรียงตามวันที่สร้างล่าสุด
          const dateA = a.createdAt?.toMillis() || 0;
          const dateB = b.createdAt?.toMillis() || 0;
          return dateB - dateA;
        });

      setTeachers(sortedTeachers);
    } catch (err) {
      console.error("Error fetching teachers: ", err);
      setError("เกิดข้อผิดพลาดในการดึงข้อมูลครูของโรงเรียนนี้");
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    // A schoolId in the URL (e.g. an owner/super_admin browsing a specific school)
    // takes priority over the logged-in user's own school.
    if (paramSchoolId) {
      setSchoolId(paramSchoolId);
      fetchTeachers(paramSchoolId);
      return;
    }

    const unsub = auth.onAuthStateChanged(async (user) => {
      if (user) {
        const userDocRef = doc(firestore, "users", user.uid);
        const userDocSnap = await getDoc(userDocRef);
        if (userDocSnap.exists()) {
          const userSchoolId = userDocSnap.data().schoolId;
          if (userSchoolId) {
            setSchoolId(userSchoolId);
            fetchTeachers(userSchoolId);


          } else {
            setError("ไม่พบข้อมูลโรงเรียนสำหรับบัญชีของคุณ");
            setIsLoading(false);
          }
        }
      }
    });
    return () => unsub();
  }, [paramSchoolId, fetchTeachers]);

  // Reset pagination when search term changes
  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm]);

  const renderContent = () => {
    if (isLoading) {
      return <SkeletonLoader />;
    }

    if (error) {
      return <div className="text-center py-10 text-red-400">{error}</div>;
    }

    if (!isLoading && teachers.length === 0) {
      return <div className="text-center py-10 text-gray-500">ไม่พบข้อมูลครู</div>;
    }

    const filteredTeachers = teachers.filter(teacher => {
      const matchesSearch = `${teacher.title}${teacher.firstName} ${teacher.lastName}`.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (teacher.teacherId || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
        (teacher.idCardNumber || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
        (teacher.rfid || '').toLowerCase().includes(searchTerm.toLowerCase());
      const matchesTab =
        activeTab === 'all' ? !isAttendanceOnlyAccount(teacher.role) :
        activeTab === 'teacher' ? (!teacher.personnelType || teacher.personnelType === 'teacher') :
        teacher.personnelType === 'user';
      return matchesSearch && matchesTab;
    });

    // Pagination Logic
    const totalPages = Math.ceil(filteredTeachers.length / itemsPerPage);
    const indexOfLastItem = currentPage * itemsPerPage;
    const indexOfFirstItem = indexOfLastItem - itemsPerPage;
    const currentTeachers = filteredTeachers.slice(indexOfFirstItem, indexOfLastItem);
    return (
      <div className="table-responsive">
        <table className="min-w-full divide-y divide-gray-700">
          <thead className="bg-gray-100 dark:bg-[#2a2b2f]">
            <tr>
              <th scope="col" className="py-3 px-2 text-xs font-semibold text-gray-600 dark:text-gray-300 w-12 text-center">ลำดับ</th>
              <th scope="col" className="px-2 py-3 text-left text-xs font-semibold text-gray-600 dark:text-gray-300">รหัสครู</th>
              <th scope="col" className="py-3 px-2 text-left text-xs font-semibold text-gray-600 dark:text-gray-300">ชื่อ-สกุล</th>
              <th scope="col" className="hidden lg:table-cell px-2 py-3 text-left text-xs font-semibold text-gray-600 dark:text-gray-300">เลขบัตรประชาชน / RFID</th>
              <th scope="col" className="hidden lg:table-cell px-2 py-3 text-left text-xs font-semibold text-gray-600 dark:text-gray-300">วิทยฐานะ</th>
              <th scope="col" className="px-2 py-3 text-left text-xs font-semibold text-gray-600 dark:text-gray-300">กลุ่มสาระ</th>
              <th scope="col" className="hidden md:table-cell px-2 py-3 text-left text-xs font-semibold text-gray-600 dark:text-gray-300">ฝ่ายงาน</th>
              <th scope="col" className="hidden xl:table-cell px-2 py-3 text-left text-xs font-semibold text-gray-600 dark:text-gray-300">เบอร์ติดต่อ</th>
              <th scope="col" className="px-2 py-3 text-left text-xs font-semibold text-gray-600 dark:text-gray-300">สถานะ</th>
              <CanAccess roles={ADMIN_ACCESS}>
                <th scope="col" className="py-3 pl-3 pr-4 sm:pr-6 text-right text-xs font-semibold text-gray-600 dark:text-gray-300">
                  ดำเนินการ
                </th>
              </CanAccess>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200 dark:divide-gray-800 bg-white dark:bg-[#1e1f21]">
            {currentTeachers.map((teacher, index) => (
              <tr key={teacher.id} className="hover:bg-gray-50 dark:hover:bg-[#2a2b2f]/50 transition-colors">
                <td className="whitespace-nowrap py-3 px-2 text-xs text-center font-medium text-gray-500 dark:text-gray-400">{indexOfFirstItem + index + 1}</td>
                <td className="whitespace-nowrap px-2 py-3 text-xs text-gray-500 dark:text-gray-400 font-medium">
                  <CanAccess roles={ADMIN_ACCESS} fallback={<span>{teacher.teacherId}</span>}>
                    {editingTeacherId === teacher.id ? (
                      <div className="flex items-center gap-1">
                        <input
                          autoFocus
                          type="text"
                          className="w-20 px-2 py-1 bg-gray-50 dark:bg-white/5 border border-indigo-500 rounded-lg outline-none text-xs"
                          value={tempTeacherId}
                          onChange={(e) => setTempTeacherId(e.target.value)}
                          onBlur={() => handleIdUpdate(teacher.id)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') handleIdUpdate(teacher.id);
                            if (e.key === 'Escape') setEditingTeacherId(null);
                          }}
                        />
                      </div>
                    ) : (
                        <button
                          onClick={() => {
                            setEditingTeacherId(teacher.id);
                            setTempTeacherId(teacher.teacherId);
                          }}
                          className="flex items-center gap-1 hover:text-indigo-500 hover:bg-indigo-500/10 px-2 py-1 rounded transition-colors group"
                          title="คลิกเพื่อแก้ไขรหัส"
                        >
                          <span>{teacher.teacherId}</span>
                          <ChevronDown size={10} className="opacity-0 group-hover:opacity-100 transition-opacity" />
                        </button>
                    )}
                  </CanAccess>
                </td>
                <td className="whitespace-nowrap py-3 px-2 text-xs">
                  <Link to={`/school/${teacher.schoolId}/teachers/view/${teacher.id}`} className="flex items-center group">
                    <ProfileAvatar
                      className="h-8 w-8 shadow-sm border border-gray-200 dark:border-white/10"
                      src={teacher.profileImageUrl || `https://ui-avatars.com/api/?name=${teacher.firstName}+${teacher.lastName}&background=random`}
                      alt={`${teacher.firstName} ${teacher.lastName}`}
                    />
                      <div className="ml-3 font-medium text-gray-900 dark:text-gray-200 group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition-colors">
                        {`${teacher.title || ''}${teacher.firstName} ${teacher.lastName}`}
                      </div>
                  </Link>
                </td>
                <td className="hidden lg:table-cell whitespace-nowrap px-2 py-3 text-xs text-gray-500 dark:text-gray-400">
                  {(teacher.idCardNumber || teacher.rfid) ? (
                    <ul className="list-disc list-inside space-y-0.5 font-mono">
                      {teacher.idCardNumber && <li>{teacher.idCardNumber}</li>}
                      {teacher.rfid && <li>{teacher.rfid}</li>}
                    </ul>
                  ) : (
                    "-"
                  )}
                </td>
                <td className="hidden lg:table-cell whitespace-nowrap px-2 py-3 text-xs text-gray-500 dark:text-gray-400">{teacher.academicStanding || '-'}</td>
                <td className="whitespace-nowrap px-2 py-3 text-xs">
                  <CanAccess roles={ADMIN_ACCESS} fallback={
                    <span className="text-gray-500 dark:text-gray-400">
                      {teacher.learningArea || teacher.subjectGroup || '-'}
                    </span>
                  }>
                    <div className={`inline-flex items-center px-2 py-0.5 rounded-lg text-[11px] transition-all bg-gray-100 dark:bg-white/5 border border-transparent ${isUpdating === teacher.id ? 'opacity-50 pointer-events-none' : 'hover:border-indigo-500/50'} group cursor-pointer w-fit min-w-[210px]`}>
                      <Select
                        className="w-full"
                        options={[
                          { value: '', label: 'ไม่ระบุ' },
                          ...subjectGroups.map(g => ({ value: g.name, label: g.name }))
                        ]}
                        styles={selectStyles}
                        components={{ DropdownIndicator: CustomDropdownIndicator }}
                        value={teacher.learningArea || teacher.subjectGroup ? { value: teacher.learningArea || teacher.subjectGroup, label: teacher.learningArea || teacher.subjectGroup } : { value: '', label: 'ไม่ระบุ' }}
                        onChange={(newValue: any) => {
                          handleUpdateField(teacher.id, {
                            learningArea: newValue.value,
                            subjectGroup: newValue.value
                          });
                        }}
                        placeholder="เลือกกลุ่มสาระ"
                        isSearchable={true}
                        menuPortalTarget={document.body}
                        classNamePrefix="learning-area-select"
                      />
                    </div>
                  </CanAccess>
                </td>
                <td className="hidden md:table-cell whitespace-nowrap px-2 py-3 text-xs">
                  <CanAccess roles={ADMIN_ACCESS} fallback={
                    <span className="text-gray-500 dark:text-gray-400">
                      {teacher.department || '-'}
                    </span>
                  }>
                    <div className={`inline-flex items-center px-2 py-0.5 rounded-lg text-[11px] transition-all bg-gray-100 dark:bg-white/5 border border-transparent ${isUpdating === teacher.id ? 'opacity-50 pointer-events-none' : 'hover:border-indigo-500/50'} group cursor-pointer w-fit min-w-[185px]`}>
                      <Select
                        className="w-full"
                        options={departmentOptions}
                        styles={selectStyles}
                        components={{ DropdownIndicator: CustomDropdownIndicator }}
                        value={teacher.department ? departmentOptions.find(opt => opt.value === teacher.department) : { value: '', label: 'ไม่ระบุ' }}
                        onChange={(newValue: any) => handleUpdateField(teacher.id, { department: newValue.value })}
                        placeholder="เลือกฝ่ายงาน"
                        isSearchable={false}
                        menuPortalTarget={document.body}
                        classNamePrefix="department-select"
                      />
                    </div>
                  </CanAccess>
                </td>
                <td className="hidden xl:table-cell whitespace-nowrap px-2 py-3 text-xs text-gray-500 dark:text-gray-400">{teacher.contact}</td>
                <td className="whitespace-nowrap px-2 py-3 text-xs">
                    <CanAccess roles={ADMIN_ACCESS} fallback={
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium ${getStatusStyles(teacher.status || 'อยู่')}`}>
                        {teacher.status || 'อยู่'}
                      </span>
                    }>
                      <div className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium transition-all ${getStatusStyles(teacher.status || 'อยู่')} ${isUpdating === teacher.id ? 'opacity-50 pointer-events-none' : 'hover:ring-1 hover:ring-indigo-500'} group cursor-pointer min-w-[100px] justify-between`}>
                        <Select
                          className="w-full"
                          options={statusOptions}
                          styles={selectStyles}
                          components={{ DropdownIndicator: CustomDropdownIndicator }}
                          value={statusOptions.find(opt => opt.value === (teacher.status || 'อยู่'))}
                          onChange={(newValue: any) => handleUpdateField(teacher.id, { status: newValue.value })}
                          isSearchable={false}
                          menuPortalTarget={document.body}
                          classNamePrefix="status-select"
                        />
                      </div>
                    </CanAccess>
                  </td>
                  <CanAccess roles={ADMIN_ACCESS}>
                  <td className="relative whitespace-nowrap py-3 pl-3 pr-4 text-right text-xs font-medium sm:pr-6">
                    <div className="flex justify-end items-center gap-x-3">
                      <Link to={`/school/${teacher.schoolId}/teachers/edit/${teacher.id}`} className="text-indigo-400 hover:text-indigo-300 transition-colors" title="แก้ไข">
                        <FaUserEdit size={14} />
                      </Link>
                      <button onClick={() => handleDelete(teacher)} className="text-red-500 hover:text-red-400 transition-colors" title="ลบ">
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
                แสดง {indexOfFirstItem + 1} ถึง {Math.min(indexOfLastItem, filteredTeachers.length)} จาก {filteredTeachers.length} รายการ
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
                  <BackButton to="/academic/hub/personnel_info" />
                  <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">ข้อมูลครูทั้งหมด</h1>
                </div>
                <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                  แสดง, จัดการ, และเพิ่มข้อมูลครูในระบบ
                </p>
              </div>
            </div>

            {/* Tab bar แยกประเภทบุคลากร */}
            <div className="flex gap-1 p-1 bg-white dark:bg-[#2a2b2f]/80 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700/50 w-fit">
              {([
                { key: 'all', label: 'บุคลากรทั้งหมด' },
                { key: 'teacher', label: 'ครู' },
                { key: 'user', label: 'ผู้ใช้' },
              ] as const).map(tab => (
                <button
                  key={tab.key}
                  onClick={() => { setActiveTab(tab.key); setCurrentPage(1); }}
                  className={`px-4 py-2 rounded-xl text-xs font-semibold transition-all ${
                    activeTab === tab.key
                      ? tab.key === 'user'
                        ? 'bg-emerald-600 text-white shadow-sm'
                        : 'bg-indigo-600 text-white shadow-sm'
                      : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-white/5'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            <div className="flex flex-wrap items-center gap-3 p-4 bg-white dark:bg-[#2a2b2f]/80 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700/50 backdrop-blur-sm">
              <div className="relative flex-grow min-w-[240px] max-w-md">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <FaSearch className="text-gray-400 text-sm" />
                </div>
                <input
                  type="text"
                  placeholder="ค้นหาชื่อ, รหัสครู..."
                  className="pl-9 pr-4 py-2 w-full bg-gray-50 dark:bg-[#1e1f21] border border-gray-200 dark:border-gray-700 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none transition-all text-xs text-gray-900 dark:text-white"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                />
              </div>

              <div className="flex flex-wrap gap-2 ml-auto">
                <CanAccess roles={ADMIN_ACCESS}>
                  <Link
                    to={schoolId ? `/school/${schoolId}/map-rfid/teachers` : '#'}
                    className="flex items-center justify-center gap-2 bg-purple-600 hover:bg-purple-700 text-white px-4 py-2 rounded-xl font-medium transition-all shadow-sm active:scale-95 text-xs whitespace-nowrap animate-pulse"
                  >
                    <FaIdCard size={12} />
                    <span>จับคู่ RFID</span>
                  </Link>
                  <Link
                    to={schoolId ? `/school/${schoolId}/teachers/add` : '#'}
                    className="flex items-center justify-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-xl font-medium transition-all shadow-sm active:scale-95 text-xs whitespace-nowrap"
                  >
                    <FaPlus size={12} />
                    <span>เพิ่มครู</span>
                  </Link>
                  <Link
                    to={schoolId ? `/school/${schoolId}/teachers/quick-add` : '#'}
                    className="flex items-center justify-center gap-2 bg-amber-500 hover:bg-amber-600 text-white px-4 py-2 rounded-xl font-medium transition-all shadow-sm active:scale-95 text-xs whitespace-nowrap"
                  >
                    <FaUserPlus size={12} />
                    <span>เพิ่มด่วน</span>
                  </Link>
                  <Link
                    to={schoolId ? `/school/${schoolId}/teachers/import` : '#'}
                    className="flex items-center justify-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2 rounded-xl font-medium transition-all shadow-sm active:scale-95 text-xs whitespace-nowrap"
                  >
                    <FaFileExcel size={12} />
                    <span>นำเข้า Excel</span>
                  </Link>
                  <Link
                    to={schoolId ? `/school/${schoolId}/teachers/bulk-upload-images` : '#'}
                    className="hidden md:flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-xl font-medium transition-all shadow-sm active:scale-95 text-xs whitespace-nowrap"
                  >
                    <FaCloudUploadAlt size={14} />
                    <span>อัปโหลดรูป</span>
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
