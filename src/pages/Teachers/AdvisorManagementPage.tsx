import React, { useState, useEffect, useCallback } from "react";
import { useSelector } from "react-redux";
import { RootState } from "@/store";
import { useParams, Link } from "react-router-dom";
import MainLayout from "@/layouts/MainLayout";
import ProfileAvatar from "@/components/Shared/ProfileAvatar";
import { firestore, auth } from "@/firebase";
import { collection, getDocs, query, where, Timestamp, doc, getDoc, setDoc, serverTimestamp } from "firebase/firestore";
import { FaSearch, FaCheck, FaTimes, FaGraduationCap, FaUserCog, FaUsers } from "react-icons/fa";
import { ArrowLeft, Loader2, Info } from "lucide-react";
import { usePermissions } from "@/hooks/usePermissions";
import { toast, ToastContainer } from "react-toastify";
import "react-toastify/dist/ReactToastify.css";

interface Teacher {
  id: string;
  profileImageUrl?: string;
  teacherId: string;
  title: string;
  firstName: string;
  lastName: string;
  department?: string;
  contact?: string;
  position?: string;
  schoolId: string;
  status?: string;
  isHomeroomTeacher: boolean;
  homeroomGrade: string;
  homeroomRoom: string;
  advisorRole: string;
  role: string | string[];
  personnelType?: 'teacher' | 'user';
}

const STAFF_ROLES = new Set([
  'teacher',
  'school_admin',
  'academic_admin',
  'super_admin',
  'admin',
  'academic',
]);

const toRoleArray = (role: unknown): string[] => {
  if (Array.isArray(role)) {
    return role.filter((item): item is string => typeof item === 'string');
  }
  return typeof role === 'string' ? [role] : [];
};

const hasStaffRole = (role: unknown) =>
  toRoleArray(role).some(roleName => STAFF_ROLES.has(roleName.toLowerCase()));

const EXCLUDED_ROLES = new Set([
  'school_attendance',
  'teacher_attendance',
  'student_attendance',
  'student',
]);

const shouldExcludeTeacher = (role: unknown, personnelType?: unknown) => {
  // "ผู้ใช้ระบบ" (non-teaching staff) must never be assignable as a homeroom advisor.
  if (personnelType === 'user') return true;
  const roles = toRoleArray(role);
  if (roles.some(r => EXCLUDED_ROLES.has(r.toLowerCase()))) return true;
  if (!roles.some(r => STAFF_ROLES.has(r.toLowerCase()))) return true;
  return false;
};

const buildFallbackTeacherFromUser = (id: string, data: any, schoolId: string): Teacher => {
  const roles = toRoleArray(data.role);
  const isSchoolAdmin = roles.some(role => role.toLowerCase() === 'school_admin');
  const isSuperAdmin = roles.some(role => role.toLowerCase() === 'super_admin');
  const nameParts = (data.fullName || '').trim().split(/\s+/).filter(Boolean);

  return {
    id,
    schoolId,
    title: data.title || '',
    firstName: data.firstName || nameParts[0] || data.fullName || data.email || 'ไม่ระบุชื่อ',
    lastName: data.lastName || nameParts.slice(1).join(' '),
    role: roles,
    profileImageUrl: data.profileImageUrl || data.profileUrl || '',
    teacherId: data.teacherId || '',
    position: data.position || (isSuperAdmin ? 'ผู้ดูแลระบบสูงสุด' : isSchoolAdmin ? 'ผู้ดูแลระบบโรงเรียน' : 'ครู'),
    department: data.department || 'งานบริหารทั่วไป',
    status: data.status || 'อยู่',
    isHomeroomTeacher: data.isHomeroomTeacher || false,
    homeroomGrade: data.homeroomGrade || '',
    homeroomRoom: data.homeroomRoom || '',
    advisorRole: data.advisorRole || '',
    personnelType: data.personnelType,
  };
};

export default function AdvisorManagementPage() {
  const { schoolId: paramSchoolId } = useParams<{ schoolId: string }>();
  const [schoolId, setSchoolId] = useState<string | null>(paramSchoolId || null);
  
  const [teachers, setTeachers] = useState<Teacher[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  // Filtering & Search
  const [searchTerm, setSearchTerm] = useState("");
  const [assignmentFilter, setAssignmentFilter] = useState<"all" | "assigned" | "unassigned">("all");
  const [gradeFilter, setGradeFilter] = useState("");

  // Loading state per teacher row during update
  const [updatingTeacherId, setUpdatingTeacherId] = useState<string | null>(null);
  const [successTeacherId, setSuccessTeacherId] = useState<string | null>(null);

  // Available grade options from Redux school settings
  const [availableLevels, setAvailableLevels] = useState<string[]>([]);
  const reduxSchoolSettings = useSelector((state: RootState) => state.schoolSettings);

  useEffect(() => {
    if (reduxSchoolSettings.status === 'succeeded' && reduxSchoolSettings.availableClassOptions.length > 0) {
      setAvailableLevels(reduxSchoolSettings.availableClassOptions.map(([_, name]: [string, string]) => name));
    }
  }, [reduxSchoolSettings.status, reduxSchoolSettings.availableClassOptions]);

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
      
      // Map teachers from subcollection
      const activeTeachers = querySnapshot.docs
        .map(doc => {
          const data = doc.data();
          const userData = usersDataMap.get(doc.id) || {};
          
          const firstName = data.firstName || userData.firstName || '';
          const lastName = data.lastName || userData.lastName || '';
          const title = data.title || userData.title || '';
          
          return {
            id: doc.id,
            schoolId: currentSchoolId,
            teacherId: data.teacherId || '',
            title,
            firstName,
            lastName,
            status: data.status || userData.status || 'อยู่',
            profileImageUrl: data.profileImageUrl || userData.profileImageUrl || userData.profileUrl || '',
            department: data.department || userData.department || 'งานบริหารทั่วไป',
            position: data.position || userData.position || 'ครู',
            isHomeroomTeacher: data.isHomeroomTeacher || userData.isHomeroomTeacher || false,
            homeroomGrade: data.homeroomGrade || userData.homeroomGrade || '',
            homeroomRoom: data.homeroomRoom || userData.homeroomRoom || '',
            advisorRole: data.advisorRole || userData.advisorRole || '',
            role: data.role || userData.role || [],
            personnelType: data.personnelType || userData.personnelType,
          } as Teacher;
        })
        .filter(t => t.status === 'อยู่' && !shouldExcludeTeacher(t.role, t.personnelType)); // ONLY display active teaching staff

      // Map users who are active but not present in subcollection yet
      const teachersById = new Map(activeTeachers.map(teacher => [teacher.id, teacher]));
      usersSnapshot.docs.forEach(userDoc => {
        if (teachersById.has(userDoc.id)) return;

        const userData = userDoc.data();
        if (userData.status !== 'อยู่') return;
        if (shouldExcludeTeacher(userData.role, userData.personnelType)) return;

        teachersById.set(userDoc.id, buildFallbackTeacherFromUser(userDoc.id, userData, currentSchoolId));
      });

      // Sort by Teacher ID (if exists, otherwise at the end), then by First Name
      const sortedTeachers = Array.from(teachersById.values()).sort((a, b) => {
        const idA = a.teacherId || "";
        const idB = b.teacherId || "";
        
        if (idA === "" && idB !== "") return 1;
        if (idA !== "" && idB === "") return -1;
        if (idA === "" && idB === "") return a.firstName.localeCompare(b.firstName, 'th');
        
        const numA = Number(idA);
        const numB = Number(idB);
        if (!isNaN(numA) && !isNaN(numB)) {
          return numA - numB;
        }
        
        return idA.localeCompare(idB, 'en', { numeric: true });
      });

      setTeachers(sortedTeachers);
    } catch (err) {
      console.error("Error fetching teachers:", err);
      setError("เกิดข้อผิดพลาดในการดึงข้อมูลครู");
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (paramSchoolId) {
      setSchoolId(paramSchoolId);
      fetchTeachers(paramSchoolId);
    } else {
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
    }
  }, [paramSchoolId, fetchTeachers]);

  const handleUpdateAdvisor = async (teacherId: string, updates: Partial<Teacher>) => {
    if (!schoolId) return;
    setUpdatingTeacherId(teacherId);
    
    try {
      const teacherDocRef = doc(firestore, "school-settings", schoolId, "teachers", teacherId);
      const teacherSnap = await getDoc(teacherDocRef);
      
      let dataToSave: any = { ...updates };
      
      if (!teacherSnap.exists()) {
        const teacherObj = teachers.find(t => t.id === teacherId);
        if (teacherObj) {
          dataToSave = {
            uid: teacherId,
            firstName: teacherObj.firstName || "",
            lastName: teacherObj.lastName || "",
            title: teacherObj.title || "",
            role: teacherObj.role || ["teacher"],
            schoolId: schoolId,
            profileImageUrl: teacherObj.profileImageUrl || "",
            teacherId: teacherObj.teacherId || "",
            position: teacherObj.position || "ครู",
            department: teacherObj.department || "งานบริหารทั่วไป",
            status: "อยู่",
            isHomeroomTeacher: updates.isHomeroomTeacher ?? false,
            homeroomGrade: updates.homeroomGrade ?? "",
            homeroomRoom: updates.homeroomRoom ?? "",
            advisorRole: updates.advisorRole ?? "",
            createdAt: serverTimestamp(),
          };
        }
      }
      
      dataToSave.updatedAt = serverTimestamp();
      
      await setDoc(teacherDocRef, dataToSave, { merge: true });
      
      // Update local state
      setTeachers(prev => prev.map(t => t.id === teacherId ? { ...t, ...updates } : t));
      
      setSuccessTeacherId(teacherId);
      setTimeout(() => {
        setSuccessTeacherId(null);
      }, 1500);
      
      toast.success("อัปเดตข้อมูลเรียบร้อยแล้ว", {
        position: "top-right",
        autoClose: 1500,
        hideProgressBar: true,
        closeOnClick: true,
        pauseOnHover: false,
        theme: "dark",
      });
    } catch (err) {
      console.error("Error updating advisor: ", err);
      toast.error("ไม่สามารถบันทึกข้อมูลได้ กรุณาลองใหม่อีกครั้ง", {
        position: "top-right",
        theme: "dark",
      });
    } finally {
      setUpdatingTeacherId(null);
    }
  };

  const handleRoleChange = (teacherId: string, value: string) => {
    const teacher = teachers.find(t => t.id === teacherId);
    if (!teacher) return;

    if (value === "") {
      // Clear advisor assignments completely
      handleUpdateAdvisor(teacherId, {
        advisorRole: "",
        homeroomGrade: "",
        homeroomRoom: "",
        isHomeroomTeacher: false,
      });
    } else {
      // Assign advisor role, keep grade/room if they already exist
      handleUpdateAdvisor(teacherId, {
        advisorRole: value,
        isHomeroomTeacher: teacher.homeroomGrade !== "",
      });
    }
  };

  const handleGradeChange = (teacherId: string, value: string) => {
    const teacher = teachers.find(t => t.id === teacherId);
    if (!teacher) return;

    if (value === "") {
      handleUpdateAdvisor(teacherId, {
        homeroomGrade: "",
        homeroomRoom: "",
        isHomeroomTeacher: false,
        advisorRole: "",
      });
    } else {
      const defaultRole = teacher.advisorRole || "ครูที่ปรึกษา";
      handleUpdateAdvisor(teacherId, {
        homeroomGrade: value,
        isHomeroomTeacher: true,
        advisorRole: defaultRole,
      });
    }
  };

  const handleRoomChange = (teacherId: string, value: string) => {
    handleUpdateAdvisor(teacherId, {
      homeroomRoom: value,
    });
  };

  // Find co-advisors assigned to the same class
  const getCoAdvisors = (teacherId: string, grade: string, room: string) => {
    if (!grade || !room) return [];
    return teachers.filter(t => 
      t.id !== teacherId && 
      t.homeroomGrade === grade && 
      t.homeroomRoom === room
    );
  };

  // Filter teachers list
  const filteredTeachers = teachers.filter(teacher => {
    // 1. Search term match
    const fullName = `${teacher.title}${teacher.firstName} ${teacher.lastName}`.toLowerCase();
    const searchMatch = 
      fullName.includes(searchTerm.toLowerCase()) || 
      teacher.teacherId.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (teacher.position || "").toLowerCase().includes(searchTerm.toLowerCase()) ||
      (teacher.department || "").toLowerCase().includes(searchTerm.toLowerCase());
      
    if (!searchMatch) return false;

    // 2. Assignment Filter
    if (assignmentFilter === "assigned") {
      if (!teacher.isHomeroomTeacher || !teacher.homeroomGrade) return false;
    } else if (assignmentFilter === "unassigned") {
      if (teacher.isHomeroomTeacher && teacher.homeroomGrade) return false;
    }

    // 3. Grade Filter
    if (gradeFilter && teacher.homeroomGrade !== gradeFilter) return false;

    return true;
  });

  return (
    <MainLayout>
      <ToastContainer />
      <div className="min-h-screen bg-gray-50 dark:bg-[#1e1f21] text-gray-900 dark:text-white transition-colors duration-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          
          {/* Header */}
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 mb-6">
            <div>
              <div className="flex items-center gap-2 mb-2 text-sm text-gray-500 dark:text-gray-400">
                <Link 
                  to={schoolId ? `/academic/hub/personnel_info` : "/"} 
                  className="flex items-center gap-1 hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors"
                >
                  <ArrowLeft size={16} /> กลับสู่เมนูหลัก
                </Link>
              </div>
              <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight bg-gradient-to-r from-indigo-500 to-purple-600 dark:from-indigo-400 dark:to-purple-500 bg-clip-text text-transparent">
                จัดการครูที่ปรึกษา / ครูประจำชั้น
              </h1>
              <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                มอบหมายห้องเรียนประจำชั้นและระดับชั้นให้กับคณะครูที่ปฏิบัติหน้าที่อยู่ ("สถานะ อยู่") ของโรงเรียน
              </p>
            </div>
          </div>

          {/* Quick Stats Panel */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
            <div className="bg-white dark:bg-[#2a2b2f] p-4 rounded-2xl shadow-sm border border-gray-200 dark:border-gray-800 flex items-center gap-4">
              <div className="p-3 bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400 rounded-xl">
                <FaUsers size={20} />
              </div>
              <div>
                <p className="text-xs text-gray-500 dark:text-gray-400 font-medium">บุคลากรที่ปฏิบัติหน้าที่ทั้งหมด</p>
                <p className="text-2xl font-bold">{teachers.length} คน</p>
              </div>
            </div>
            <div className="bg-white dark:bg-[#2a2b2f] p-4 rounded-2xl shadow-sm border border-gray-200 dark:border-gray-800 flex items-center gap-4">
              <div className="p-3 bg-emerald-50 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400 rounded-xl">
                <FaGraduationCap size={20} />
              </div>
              <div>
                <p className="text-xs text-gray-500 dark:text-gray-400 font-medium">ได้รับการมอบหมายห้องแล้ว</p>
                <p className="text-2xl font-bold text-emerald-600 dark:text-emerald-400">
                  {teachers.filter(t => t.isHomeroomTeacher && t.homeroomGrade).length} คน
                </p>
              </div>
            </div>
            <div className="bg-white dark:bg-[#2a2b2f] p-4 rounded-2xl shadow-sm border border-gray-200 dark:border-gray-800 flex items-center gap-4">
              <div className="p-3 bg-amber-50 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400 rounded-xl">
                <FaUserCog size={20} />
              </div>
              <div>
                <p className="text-xs text-gray-500 dark:text-gray-400 font-medium">ยังไม่ได้รับมอบหมายห้อง</p>
                <p className="text-2xl font-bold text-amber-600 dark:text-amber-400">
                  {teachers.filter(t => !t.isHomeroomTeacher || !t.homeroomGrade).length} คน
                </p>
              </div>
            </div>
          </div>

          {/* Filtering and Search Controls */}
          <div className="bg-white dark:bg-[#2a2b2f] p-4 sm:p-5 rounded-2xl shadow-sm border border-gray-200 dark:border-gray-800 mb-6 space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              
              {/* Search Bar */}
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-gray-400">
                  <FaSearch size={14} />
                </div>
                <input
                  type="text"
                  placeholder="ค้นหาตามชื่อครู, ตำแหน่ง, รหัส..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full bg-gray-50 dark:bg-[#1e1f21] border border-gray-200 dark:border-gray-700 rounded-xl pl-9 pr-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all text-gray-900 dark:text-white placeholder-gray-400"
                />
              </div>

              {/* Assignment Filter */}
              <div className="flex gap-1 bg-gray-100 dark:bg-[#1e1f21] p-1 rounded-xl">
                <button
                  onClick={() => setAssignmentFilter("all")}
                  className={`flex-1 py-1.5 px-3 text-xs font-semibold rounded-lg transition-all ${
                    assignmentFilter === "all"
                      ? "bg-white dark:bg-[#2a2b2f] shadow-sm text-indigo-600 dark:text-indigo-400"
                      : "text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
                  }`}
                >
                  ทั้งหมด
                </button>
                <button
                  onClick={() => setAssignmentFilter("assigned")}
                  className={`flex-1 py-1.5 px-3 text-xs font-semibold rounded-lg transition-all ${
                    assignmentFilter === "assigned"
                      ? "bg-white dark:bg-[#2a2b2f] shadow-sm text-indigo-600 dark:text-indigo-400"
                      : "text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
                  }`}
                >
                  มีห้องแล้ว
                </button>
                <button
                  onClick={() => setAssignmentFilter("unassigned")}
                  className={`flex-1 py-1.5 px-3 text-xs font-semibold rounded-lg transition-all ${
                    assignmentFilter === "unassigned"
                      ? "bg-white dark:bg-[#2a2b2f] shadow-sm text-indigo-600 dark:text-indigo-400"
                      : "text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
                  }`}
                >
                  ยังไม่มีห้อง
                </button>
              </div>

              {/* Grade Filter */}
              <div>
                <select
                  value={gradeFilter}
                  onChange={(e) => setGradeFilter(e.target.value)}
                  className="w-full bg-gray-50 dark:bg-[#1e1f21] border border-gray-200 dark:border-gray-700 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all text-gray-900 dark:text-white"
                >
                  <option value="">กรองตามระดับชั้น (ทั้งหมด)</option>
                  {availableLevels.map((lvl) => (
                    <option key={lvl} value={lvl}>{lvl}</option>
                  ))}
                </select>
              </div>

            </div>
          </div>

          {/* Main Content Area */}
          {isLoading ? (
            <div className="flex flex-col items-center justify-center py-20 bg-white dark:bg-[#2a2b2f] rounded-2xl border border-gray-200 dark:border-gray-800">
              <Loader2 className="animate-spin text-indigo-500 mb-4" size={40} />
              <p className="text-gray-500 dark:text-gray-400 text-sm">กำลังโหลดข้อมูลและโครงสร้างระดับชั้น...</p>
            </div>
          ) : error ? (
            <div className="text-center py-12 bg-white dark:bg-[#2a2b2f] rounded-2xl border border-gray-200 dark:border-gray-800">
              <p className="text-red-500 font-medium">{error}</p>
            </div>
          ) : filteredTeachers.length === 0 ? (
            <div className="text-center py-16 bg-white dark:bg-[#2a2b2f] rounded-2xl border border-gray-200 dark:border-gray-800 text-gray-500 dark:text-gray-400">
              <Info className="mx-auto mb-2 text-gray-400" size={32} />
              <p className="text-sm font-medium">ไม่พบข้อมูลครูตามตัวเลือกการค้นหาหรือคัดกรองนี้</p>
            </div>
          ) : (
            <div className="bg-white dark:bg-[#2a2b2f] rounded-2xl shadow-sm border border-gray-200 dark:border-gray-800 overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-gray-50 dark:bg-gray-800/40 border-b border-gray-200 dark:border-gray-800 text-xs font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400">
                      <th className="py-4 px-6 text-center w-16">ลำดับ</th>
                      <th className="py-4 px-4 min-w-[250px]">ครู / บุคลากร</th>
                      <th className="py-4 px-4 min-w-[180px]">ประเภทหน้าที่</th>
                      <th className="py-4 px-4 min-w-[160px]">ระดับชั้นประจำชั้น</th>
                      <th className="py-4 px-4 min-w-[120px]">ห้อง</th>
                      <th className="py-4 px-4 min-w-[200px]">ข้อมูล/เพื่อนร่วมสอนประจำชั้น</th>
                      <th className="py-4 px-6 text-center w-24">สถานะ</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100 dark:divide-gray-800 text-sm">
                    {filteredTeachers.map((teacher, index) => {
                      const coAdvisors = getCoAdvisors(teacher.id, teacher.homeroomGrade, teacher.homeroomRoom);
                      
                      return (
                        <tr 
                          key={teacher.id} 
                          className="hover:bg-gray-50/50 dark:hover:bg-gray-800/20 transition-colors duration-150"
                        >
                          {/* Row Index */}
                          <td className="py-4 px-6 text-center text-gray-500 dark:text-gray-400 font-medium">
                            {index + 1}
                          </td>

                          {/* Profile & Info */}
                          <td className="py-4 px-4">
                            <div className="flex items-center gap-3">
                              <ProfileAvatar 
                                src={teacher.profileImageUrl || `https://ui-avatars.com/api/?name=${teacher.firstName}+${teacher.lastName}&background=random`} 
                                alt={`${teacher.firstName} ${teacher.lastName}`} 
                                className="w-10 h-10 border border-gray-200 dark:border-gray-700" 
                              />
                              <div>
                                <h3 className="font-semibold text-gray-900 dark:text-white leading-tight">
                                  {teacher.teacherId && teacher.teacherId !== "ไม่มี" ? `${teacher.teacherId} ` : ""}{teacher.title}{teacher.firstName} {teacher.lastName}
                                </h3>
                              </div>
                            </div>
                          </td>

                          {/* Advisor Role */}
                          <td className="py-4 px-4">
                            <select
                              value={teacher.advisorRole || ""}
                              onChange={(e) => handleRoleChange(teacher.id, e.target.value)}
                              disabled={updatingTeacherId === teacher.id}
                              className="w-full bg-gray-50 dark:bg-[#1e1f21] border border-gray-200 dark:border-gray-700 rounded-lg px-2.5 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all text-gray-900 dark:text-white disabled:opacity-50"
                            >
                              <option value="">ไม่ได้เป็นครูประจำชั้น</option>
                              <option value="ครูที่ปรึกษา">ครูที่ปรึกษา</option>
                              <option value="ครูสอนประจำชั้น">ครูสอนประจำชั้น</option>
                            </select>
                          </td>

                          {/* Homeroom Grade */}
                          <td className="py-4 px-4">
                            <select
                              value={teacher.homeroomGrade || ""}
                              onChange={(e) => handleGradeChange(teacher.id, e.target.value)}
                              disabled={updatingTeacherId === teacher.id}
                              className="w-full bg-gray-50 dark:bg-[#1e1f21] border border-gray-200 dark:border-gray-700 rounded-lg px-2.5 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all text-gray-900 dark:text-white disabled:opacity-50"
                            >
                              <option value="">-- ไม่ระบุชั้น --</option>
                              {availableLevels.map(lvl => (
                                <option key={lvl} value={lvl}>{lvl}</option>
                              ))}
                            </select>
                          </td>

                          {/* Homeroom Room */}
                          <td className="py-4 px-4">
                            <select
                              value={teacher.homeroomRoom || ""}
                              onChange={(e) => handleRoomChange(teacher.id, e.target.value)}
                              disabled={!teacher.homeroomGrade || updatingTeacherId === teacher.id}
                              className="w-full bg-gray-50 dark:bg-[#1e1f21] border border-gray-200 dark:border-gray-700 rounded-lg px-2.5 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all text-gray-900 dark:text-white disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                              <option value="">-- เลือกห้อง --</option>
                              {Array.from({ length: 20 }, (_, i) => i + 1).map(r => (
                                <option key={r} value={String(r)}>{r}</option>
                              ))}
                            </select>
                          </td>

                          {/* Assignment Status and Co-advisors */}
                          <td className="py-4 px-4">
                            {teacher.homeroomGrade && teacher.homeroomRoom ? (
                              <div className="space-y-1">
                                <div className="text-xs text-indigo-600 dark:text-indigo-400 font-semibold flex items-center gap-1">
                                  <span>ประจำชั้น: {teacher.homeroomGrade}/{teacher.homeroomRoom}</span>
                                </div>
                                {coAdvisors.length > 0 ? (
                                  <div className="text-[10px] text-gray-500 dark:text-gray-400">
                                    <span className="font-medium text-amber-500">ดูแลร่วมกับ:</span>
                                    <div className="space-y-0.5 mt-0.5">
                                      {coAdvisors.map(co => (
                                        <div key={co.id} className="truncate">
                                          - {co.title}{co.firstName} {co.lastName} ({co.advisorRole || "ประจำชั้น"})
                                        </div>
                                      ))}
                                    </div>
                                  </div>
                                ) : (
                                  <div className="text-[10px] text-gray-400 italic">
                                    ยังไม่มีผู้ดูแลร่วม
                                  </div>
                                )}
                              </div>
                            ) : (
                              <span className="text-xs text-gray-400 italic">
                                ยังไม่ได้รับมอบหมาย
                              </span>
                            )}
                          </td>

                          {/* Auto-save Status Indicator */}
                          <td className="py-4 px-6 text-center">
                            {updatingTeacherId === teacher.id ? (
                              <Loader2 className="animate-spin text-indigo-500 mx-auto" size={16} />
                            ) : successTeacherId === teacher.id ? (
                              <div className="w-5 h-5 bg-emerald-500/10 text-emerald-500 rounded-full flex items-center justify-center mx-auto animate-bounce">
                                <FaCheck size={10} />
                              </div>
                            ) : (
                              <span className="text-[10px] text-gray-400 dark:text-gray-600">บันทึกเรียบร้อย</span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

        </div>
      </div>
    </MainLayout>
  );
}
