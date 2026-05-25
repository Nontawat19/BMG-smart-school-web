import React, { useState, useEffect, useMemo } from 'react';
import { useSelector } from 'react-redux';
import { RootState } from '@/store';
import { usePermissions } from '@/hooks/usePermissions';
import { Link } from 'react-router-dom';
import { firestore } from '@/firebase';
import { collection, getDocs, query, orderBy, Timestamp, doc, deleteDoc, collectionGroup, getDoc } from 'firebase/firestore';
import { getFunctions, httpsCallable } from 'firebase/functions';
import Swal from 'sweetalert2';
import { FaSearch, FaShieldAlt, FaSchool, FaChalkboardTeacher, FaUserGraduate, FaPencilAlt, FaTrash, FaBriefcase, FaIdBadge, FaUserPlus, FaChevronDown } from 'react-icons/fa';
import MainLayout from "@/layouts/MainLayout";
import BackButton from "@/components/Shared/BackButton";
import ProfileAvatar from "@/components/Shared/ProfileAvatar";
import {
  isActiveStudentSummaryStatus,
  isActiveTeacherSummaryStatus,
  updateOwnerAndSchoolCounts,
} from "@/utils/ownerStatsUtils";
import { ROLES } from "@/constants/roles";

// --- Type Definitions ---
interface User {
  id: string;
  fullName: string;
  email: string;
  role: string[];
  schoolId?: string;
  schoolName?: string;
  profileUrl?: string;
  createdAt: Timestamp;
  position?: string;
  teacherRole?: string;
}

// --- Skeleton Loader ---
const SkeletonLoader: React.FC = () => (
  <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6 animate-pulse">
    {[...Array(6)].map((_, i) => (
      <div key={i} className="bg-white dark:bg-[#2a2b2f] rounded-2xl p-5 shadow-lg border border-gray-100 dark:border-gray-700/50">
        <div className="flex items-start gap-4">
          <div className="h-16 w-16 rounded-full bg-gray-300 dark:bg-gray-700"></div>
          <div className="flex-1 space-y-2">
            <div className="h-5 w-3/4 bg-gray-300 dark:bg-gray-700 rounded"></div>
            <div className="h-4 w-full bg-gray-300 dark:bg-gray-700 rounded"></div>
            <div className="h-6 w-24 bg-gray-300 dark:bg-gray-700 rounded-md mt-2"></div>
          </div>
        </div>
        <div className="mt-4 pt-4 border-t border-gray-100 dark:border-gray-700/50 space-y-3">
          <div className="h-4 w-5/6 bg-gray-300 dark:bg-gray-700 rounded"></div>
          <div className="h-3 w-1/2 bg-gray-300 dark:bg-gray-700 rounded"></div>
        </div>
        <div className="mt-4 pt-4 flex justify-end gap-3">
          <div className="h-8 w-20 bg-gray-300 dark:bg-gray-700 rounded-md"></div>
          <div className="h-8 w-20 bg-gray-300 dark:bg-gray-700 rounded-md"></div>
        </div>
      </div>
    ))}
  </div>
);

// --- Generic Badge Component ---
const Badge: React.FC<{ icon: React.ReactNode; text: string; className: string }> = ({ icon, text, className }) => (
  <span className={`inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs font-medium border whitespace-nowrap ${className}`}>
    {icon}
    {text}
  </span>
);

// --- Role Badge Component ---
const RoleBadges: React.FC<{ roles: string[]; email: string }> = ({ roles, email }) => {
  const roleHierarchy: { [key: string]: number } = {
    [ROLES.SUPER_ADMIN]: 100,
    [ROLES.SCHOOL_ADMIN]: 80,
    [ROLES.STUDENT_AFFAIRS]: 60,
    [ROLES.TEACHER_ATTENDANCE]: 55,
    [ROLES.STUDENT_ATTENDANCE]: 50,
    [ROLES.SCHOOL_ATTENDANCE]: 50,
    [ROLES.TEACHER]: 40,
    [ROLES.STUDENT]: 20,
  };

  const roleStyles: { [key: string]: { icon: React.ReactNode, text: string, className: string } } = {
    [ROLES.SUPER_ADMIN]: { icon: <FaShieldAlt />, text: 'ผู้ดูแลสูงสุด (Super Admin)', className: 'bg-red-50 text-red-600 border-red-100 dark:bg-red-500/10 dark:text-red-400 dark:border-red-500/20' },
    [ROLES.SCHOOL_ADMIN]: { icon: <FaSchool />, text: 'ผู้ดูแลโรงเรียน (School Admin)', className: 'bg-blue-50 text-blue-600 border-blue-100 dark:bg-blue-500/10 dark:text-blue-400 dark:border-blue-500/20' },
    [ROLES.STUDENT_AFFAIRS]: { icon: <FaUserGraduate />, text: 'งานกิจการนักเรียน', className: 'bg-rose-50 text-rose-700 border-rose-100 dark:bg-rose-500/10 dark:text-rose-300 dark:border-rose-500/20' },
    [ROLES.TEACHER]: { icon: <FaChalkboardTeacher />, text: 'ครู (Teacher)', className: 'bg-emerald-50 text-emerald-600 border-emerald-100 dark:bg-emerald-500/10 dark:text-emerald-400 dark:border-emerald-500/20' },
    [ROLES.STUDENT_ATTENDANCE]: { icon: <FaIdBadge />, text: 'ลงเวลานักเรียน', className: 'bg-cyan-50 text-cyan-700 border-cyan-100 dark:bg-cyan-500/10 dark:text-cyan-300 dark:border-cyan-500/20' },
    [ROLES.TEACHER_ATTENDANCE]: { icon: <FaBriefcase />, text: 'ลงเวลาครู', className: 'bg-amber-50 text-amber-700 border-amber-100 dark:bg-amber-500/10 dark:text-amber-300 dark:border-amber-500/20' },
    [ROLES.SCHOOL_ATTENDANCE]: { icon: <FaIdBadge />, text: 'ลงเวลาทั้งโรงเรียน', className: 'bg-violet-50 text-violet-700 border-violet-100 dark:bg-violet-500/10 dark:text-violet-300 dark:border-violet-500/20' },
    [ROLES.STUDENT]: { icon: <FaUserGraduate />, text: 'นักเรียน (Student)', className: 'bg-indigo-50 text-indigo-600 border-indigo-100 dark:bg-indigo-500/10 dark:text-indigo-400 dark:border-indigo-500/20' },
  };

  const safeRoles = (Array.isArray(roles) ? roles : [roles])
    .filter(r => roleStyles[r])
    .sort((a, b) => (roleHierarchy[b] || 0) - (roleHierarchy[a] || 0));

  const isOwner = email === 'teachernontawat@gmail.com';

  if (safeRoles.length === 0 && !isOwner) return null;

  const topRole = safeRoles[0];
  const otherRoles = safeRoles.slice(1);

  return (
    <div className="flex flex-wrap gap-2 items-center">
      {isOwner && (
        <Badge
          icon={<FaShieldAlt />}
          text="เจ้าของระบบ"
          className="bg-amber-500/20 text-amber-500 border-amber-500/30"
        />
      )}

      {topRole && (
        <Badge
          icon={roleStyles[topRole]?.icon || <FaUserGraduate />}
          text={roleStyles[topRole]?.text || topRole}
          className={roleStyles[topRole]?.className || 'bg-gray-500/20 text-gray-400 border-gray-500/30'}
        />
      )}

      {otherRoles.length > 0 && (
        <div className="relative group/tooltip">
          <span className="inline-flex items-center px-2 py-1 rounded-md text-[10px] font-bold bg-gray-100 dark:bg-white/5 text-gray-500 dark:text-gray-400 border border-gray-200 dark:border-white/10 cursor-help transition-colors hover:bg-indigo-50 dark:hover:bg-indigo-500/10 hover:text-indigo-600 dark:hover:text-indigo-400">
            +{otherRoles.length}
          </span>
          
          <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-48 p-2 bg-white dark:bg-[#1c1c24] rounded-xl shadow-2xl border border-gray-100 dark:border-white/10 opacity-0 invisible group-hover/tooltip:opacity-100 group-hover/tooltip:visible transition-all duration-200 z-[100] scale-90 group-hover/tooltip:scale-100 pointer-events-none">
            <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-2 px-1">สิทธิ์เพิ่มเติม</p>
            <div className="space-y-1">
              {otherRoles.map((role, idx) => (
                <div key={idx} className="flex items-center gap-2 px-2 py-1.5 rounded-lg bg-gray-50 dark:bg-white/5">
                  <span className="text-indigo-500">{roleStyles[role]?.icon}</span>
                  <span className="text-[11px] font-medium text-gray-700 dark:text-gray-300">{roleStyles[role]?.text || role}</span>
                </div>
              ))}
            </div>
            <div className="absolute top-full left-1/2 -translate-x-1/2 border-8 border-transparent border-t-white dark:border-t-[#1c1c24]"></div>
          </div>
        </div>
      )}
    </div>
  );
};

const UserListPage: React.FC = () => {
  const { user: currentUser, isSchoolAdmin, isTeacher } = usePermissions();
  const [users, setUsers] = useState<User[]>([]);
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [roleFilter, setRoleFilter] = useState<string>('all');
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // --- Pagination State ---
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 21;

  const functions = getFunctions();

  useEffect(() => {
    const fetchData = async () => {
      setIsLoading(true);
      setError(null);
      try {
        const schoolsCollection = collection(firestore, "school-settings");
        const schoolSnapshot = await getDocs(schoolsCollection);
        const schoolMap = new Map<string, string>();
        schoolSnapshot.forEach(doc => {
          schoolMap.set(doc.id, doc.data().schoolName);
        });

        const usersCollection = collection(firestore, "users");
        const q = query(usersCollection, orderBy("createdAt", "desc"));
        const userSnapshot = await getDocs(q);

        const usersData = userSnapshot.docs.map(doc => {
          const data = doc.data();
          return {
            id: doc.id,
            schoolName: data.schoolId ? schoolMap.get(data.schoolId) || 'N/A' : 'N/A',
            ...data,
          } as User;
        });

        setUsers(usersData);
      } catch (err) {
        console.error("Error fetching users:", err);
        setError("เกิดข้อผิดพลาดในการดึงข้อมูลผู้ใช้");
        Swal.fire('เกิดข้อผิดพลาด', 'ไม่สามารถดึงรายการผู้ใช้ได้', 'error');
      } finally {
        setIsLoading(false);
      }
    };

    fetchData();
  }, []);

  const filteredUsers = useMemo(() => {
    return users.filter(user => {
      // Security: School admin or Teacher only sees users in their school
      if ((isSchoolAdmin || isTeacher) && user.schoolId !== currentUser?.schoolId) {
        return false;
      }

      const userRoles = Array.isArray(user.role) ? user.role : [user.role];
      const matchesRole = roleFilter === 'all' || userRoles.includes(roleFilter);
      const matchesSearch = searchTerm === '' ||
        (user.fullName || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
        (user.email || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
        (user.schoolName || '').toLowerCase().includes(searchTerm.toLowerCase());
      return matchesRole && matchesSearch;
    });
  }, [users, searchTerm, roleFilter, isSchoolAdmin, isTeacher, currentUser]);

  // --- Pagination Logic ---
  const totalPages = Math.ceil(filteredUsers.length / itemsPerPage);
  const currentItems = filteredUsers.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);

  // Reset to page 1 when filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, roleFilter]);

  const handleDeleteUser = async (userId: string, userFullName: string) => {
    const result = await Swal.fire({
      title: 'ยืนยันการลบผู้ใช้อย่างถาวร',
      html: `คุณต้องการลบผู้ใช้ <b>${userFullName}</b> ออกจากระบบใช่หรือไม่?<br/><strong class="text-red-500">การกระทำนี้ไม่สามารถย้อนกลับได้</strong> และจะลบบัญชีผู้ใช้ออกจากระบบยืนยันตัวตน (Authentication) รวมถึงข้อมูลทั้งหมดที่เกี่ยวข้อง`,
      icon: 'warning',
      showCancelButton: true,
      confirmButtonColor: '#d33',
      cancelButtonColor: '#6b7280',
      confirmButtonText: 'ยืนยันการลบ',
      cancelButtonText: 'ยกเลิก'
    });

    if (result.isConfirmed) {
      Swal.fire({
        title: 'กำลังลบผู้ใช้...',
        text: `กำลังดำเนินการลบ ${userFullName} ออกจากระบบ`,
        allowOutsideClick: false,
        didOpen: () => {
          Swal.showLoading();
        },
      });

      try {
        const deleteUserCallable = httpsCallable(functions, 'deleteUser');
        await deleteUserCallable({ userId: userId });

        // Cascading Deletion for Teacher Record if applicable
        const userToDelete = users.find(u => u.id === userId);
        if (userToDelete?.schoolId && userToDelete.role.includes('teacher')) {
          try {
            const teacherRef = doc(firestore, "school-settings", userToDelete.schoolId, "teachers", userId);
            const teacherSnap = await getDoc(teacherRef);
            await deleteDoc(teacherRef);
            if (!teacherSnap.exists() || isActiveTeacherSummaryStatus(teacherSnap.data().status || 'อยู่')) {
              await updateOwnerAndSchoolCounts(firestore, userToDelete.schoolId, { teachers: -1 });
            }
          } catch (e) {
            console.warn("Could not delete associated teacher record:", e);
          }
        }
        if (userToDelete?.schoolId && userToDelete.role.includes('student')) {
          try {
            const studentRef = doc(firestore, "school-settings", userToDelete.schoolId, "students", userId);
            const studentSnap = await getDoc(studentRef);
            await deleteDoc(studentRef);
            const data = studentSnap.data();
            if (!studentSnap.exists() || isActiveStudentSummaryStatus(data?.status || data?.studentStatus)) {
              await updateOwnerAndSchoolCounts(firestore, userToDelete.schoolId, { students: -1 });
            }
          } catch (e) {
            console.warn("Could not delete associated student record:", e);
          }
        }

        setUsers(currentUsers => currentUsers.filter(user => user.id !== userId));
        Swal.fire('ลบสำเร็จ!', `ผู้ใช้ ${userFullName} ถูกลบออกจากระบบโดยสมบูรณ์แล้ว`, 'success');
      } catch (error) {
        console.error("Error deleting user: ", error);
        Swal.fire('เกิดข้อผิดพลาด!', 'ไม่สามารถลบข้อมูลผู้ใช้ได้', 'error');
      }
    }
  };

  const renderContent = () => {
    if (isLoading) {
      return <SkeletonLoader />;
    }
    if (error) {
      return <div className="text-center py-10 text-red-400">{error}</div>;
    }
    if (filteredUsers.length === 0) {
      return <div className="text-center py-10 text-gray-500">ไม่พบข้อมูลผู้ใช้</div>;
    }

    return (
      <div className="space-y-8">
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
          {currentItems.map((user) => (
            <div key={user.id} className="bg-white dark:bg-[#2a2b2f] rounded-2xl p-5 shadow-lg border border-gray-100 dark:border-gray-700/50 hover:border-indigo-500/30 hover:shadow-indigo-500/10 transition-all duration-300 flex flex-col">
              <div className="flex items-start gap-4">
                <ProfileAvatar
                  className="h-16 w-16 border-2 border-gray-200 dark:border-gray-600"
                  src={user.profileUrl || `https://ui-avatars.com/api/?name=${user.fullName}&background=random`}
                  alt={user.fullName}
                />
                <div className="flex-1 min-w-0">
                  <h3 className="font-bold text-lg text-gray-900 dark:text-white truncate" title={user.fullName}>{user.fullName || 'N/A'}</h3>
                  <p className="text-sm text-gray-500 dark:text-gray-400 truncate" title={user.email}>{user.email}</p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {user.position && (
                      <Badge
                        icon={<FaBriefcase />}
                        text={user.position}
                        className="bg-purple-50 text-purple-600 border-purple-100 dark:bg-purple-500/10 dark:text-purple-400 dark:border-purple-500/20"
                      />
                    )}
                    <RoleBadges roles={user.role} email={user.email} />
                  </div>
                </div>
              </div>

              <div className="mt-4 pt-4 border-t border-gray-100 dark:border-gray-700/50 space-y-2 text-sm">
                <div className="flex items-center gap-2 text-gray-600 dark:text-gray-400">
                  {user.role.includes('super_admin') ? (
                    <>
                      <FaShieldAlt className="flex-shrink-0 text-red-500 dark:text-red-400" />
                      <span className="font-extrabold text-red-600 dark:text-red-400 whitespace-nowrap">ผู้ดูแลระบบสูงสุด</span>
                    </>
                  ) : (
                    <>
                      <FaSchool className="flex-shrink-0 text-indigo-400 dark:text-gray-400" />
                      {user.schoolId ? (
                        <Link to={`/owner/schools/${user.schoolId}`} className="truncate font-semibold text-indigo-700/80 dark:text-indigo-400 hover:text-indigo-800 dark:hover:text-indigo-300 transition-colors">
                          {user.schoolName || 'ไม่ได้กำหนดโรงเรียน'}
                        </Link>
                      ) : (
                        <span className="truncate font-semibold text-gray-600 dark:text-gray-400">{user.schoolName || 'ไม่ได้กำหนดโรงเรียน'}</span>
                      )}
                    </>
                  )}
                </div>
                <div className="flex items-center gap-2 text-gray-500 dark:text-gray-400">
                  <span className="text-xs">สร้างเมื่อ: {user.createdAt ? new Date(user.createdAt.seconds * 1000).toLocaleDateString('th-TH') : '-'}</span>
                </div>
              </div>

              <div className="mt-auto pt-4 flex items-center justify-end gap-2">
                <Link to={`/owner/users/edit/${user.id}`} className="flex items-center gap-2 text-xs font-black text-amber-600 dark:text-amber-400 hover:bg-amber-50 dark:hover:bg-amber-400/10 py-2 px-4 rounded-xl transition-all active:scale-95 border border-transparent hover:border-amber-100 dark:hover:border-amber-400/20">
                  <FaPencilAlt size={11} />
                  <span>แก้ไข</span>
                </Link>
                <button onClick={() => handleDeleteUser(user.id, user.fullName)} className="flex items-center gap-2 text-xs font-black text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-400/10 py-2 px-4 rounded-xl transition-all active:scale-95 border border-transparent hover:border-rose-100 dark:hover:border-rose-400/20">
                  <FaTrash size={11} />
                  <span>ลบ</span>
                </button>
              </div>
            </div>
          ))}
        </div>

        {/* --- Pagination Footer --- */}
        {totalPages > 1 && (
          <div className="mt-12 flex flex-col sm:flex-row items-center justify-between gap-4 bg-white dark:bg-[#2a2b2f] p-4 rounded-2xl border border-gray-100 dark:border-gray-700/50 shadow-lg">
            <div className="text-sm text-gray-500 dark:text-gray-400">
              แสดงรายการที่ <span className="font-bold text-indigo-600 dark:text-indigo-400">{(currentPage - 1) * itemsPerPage + 1}</span> ถึง <span className="font-bold text-indigo-600 dark:text-indigo-400">{Math.min(currentPage * itemsPerPage, filteredUsers.length)}</span> จากทั้งหมด <span className="font-bold text-gray-900 dark:text-white">{filteredUsers.length}</span> รายการ
            </div>
            
            <div className="flex items-center gap-1">
              <button 
                onClick={() => setCurrentPage(1)} 
                disabled={currentPage === 1}
                className="px-3 py-1.5 rounded-lg text-xs font-bold transition-all disabled:opacity-30 disabled:cursor-not-allowed hover:bg-gray-100 dark:hover:bg-white/10"
              >
                หน้าแรก
              </button>
              <button 
                onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))} 
                disabled={currentPage === 1}
                className="px-3 py-1.5 rounded-lg text-xs font-bold transition-all disabled:opacity-30 disabled:cursor-not-allowed hover:bg-gray-100 dark:hover:bg-white/10"
              >
                ย้อนกลับ
              </button>
              
              <div className="flex items-center gap-1 mx-2">
                {[...Array(totalPages)].map((_, i) => {
                  const pageNum = i + 1;
                  // Show only current, first, last, and pages around current
                  if (pageNum === 1 || pageNum === totalPages || (pageNum >= currentPage - 2 && pageNum <= currentPage + 2)) {
                    return (
                      <button
                        key={pageNum}
                        onClick={() => setCurrentPage(pageNum)}
                        className={`w-8 h-8 rounded-lg text-xs font-bold transition-all ${currentPage === pageNum 
                          ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-500/30' 
                          : 'hover:bg-gray-100 dark:hover:bg-white/10 text-gray-600 dark:text-gray-400'}`}
                      >
                        {pageNum}
                      </button>
                    );
                  }
                  if (pageNum === currentPage - 3 || pageNum === currentPage + 3) {
                    return <span key={pageNum} className="text-gray-400">...</span>;
                  }
                  return null;
                })}
              </div>

              <button 
                onClick={() => setCurrentPage(prev => Math.min(prev + 1, totalPages))} 
                disabled={currentPage === totalPages}
                className="px-3 py-1.5 rounded-lg text-xs font-bold transition-all disabled:opacity-30 disabled:cursor-not-allowed hover:bg-gray-100 dark:hover:bg-white/10"
              >
                ถัดไป
              </button>
              <button 
                onClick={() => setCurrentPage(totalPages)} 
                disabled={currentPage === totalPages}
                className="px-3 py-1.5 rounded-lg text-xs font-bold transition-all disabled:opacity-30 disabled:cursor-not-allowed hover:bg-gray-100 dark:hover:bg-white/10"
              >
                หน้าสุดท้าย
              </button>
            </div>
          </div>
        )}
      </div>
    );
  };

  return (
    <MainLayout>
      <div className="min-h-screen bg-gray-50 dark:bg-[#1e1f21] p-4 sm:p-6 text-gray-900 dark:text-white transition-colors duration-300">
        <div className="max-w-7xl mx-auto">
          <header className="flex flex-col md:flex-row justify-between items-start md:items-center mb-8 gap-4">
            <div>
            <div className="flex items-center gap-4">
              <BackButton />
              <h1 className="text-3xl font-bold tracking-tight">ผู้ใช้ทั้งหมดในระบบ</h1>
            </div>
              <p className="mt-1 text-gray-500 dark:text-gray-400">
                จัดการและตรวจสอบข้อมูลผู้ใช้ทั้งหมด
              </p>
            </div>
            <div className="flex flex-col sm:flex-row gap-3 w-full md:w-auto">
              <div className="relative w-full sm:w-64">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <FaSearch className="text-gray-400" />
                </div>
                <input
                  type="text"
                  placeholder="ค้นหาชื่อ, อีเมล, โรงเรียน..."
                  className="pl-10 pr-4 py-2.5 w-full bg-white dark:bg-[#2a2b2f] border border-gray-200 dark:border-gray-700 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none transition-all shadow-sm text-sm text-gray-900 dark:text-white placeholder-gray-400"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                />
              </div>
              <div className="relative w-full sm:w-48">
                <select
                  value={roleFilter}
                  onChange={(e) => setRoleFilter(e.target.value)}
                  className="w-full pl-4 pr-10 py-2.5 bg-white dark:bg-[#2a2b2f] border border-gray-200 dark:border-gray-700 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none transition-all shadow-sm text-sm text-gray-900 dark:text-white"
                >
                  <option value="all">ทุกบทบาท</option>
                  <option value={ROLES.SUPER_ADMIN}>ผู้ดูแลระบบสูงสุด (Super Admin)</option>
                  <option value={ROLES.SCHOOL_ADMIN}>ผู้ดูแลระบบโรงเรียน (School Admin)</option>
                  <option value={ROLES.STUDENT_AFFAIRS}>งานกิจการนักเรียน (Student Affairs)</option>
                  <option value={ROLES.TEACHER}>ครู (Teacher)</option>
                  <option value={ROLES.STUDENT_ATTENDANCE}>ลงเวลานักเรียน (Student Attendance)</option>
                  <option value={ROLES.TEACHER_ATTENDANCE}>ลงเวลาครู (Teacher Attendance)</option>
                  <option value={ROLES.STUDENT}>นักเรียน (Student)</option>
                </select>
              </div>
              <Link
                to="/owner/users/add"
                className="flex items-center justify-center gap-2 px-6 py-2.5 bg-indigo-600 text-white text-sm font-bold rounded-xl hover:bg-indigo-700 active:scale-95 transition-all shadow-lg shadow-indigo-500/25 whitespace-nowrap"
              >
                <FaUserPlus />
                <span>เพิ่มผู้ใช้</span>
              </Link>
            </div>
          </header>

          {renderContent()}
        </div>
      </div>
    </MainLayout>
  );
};

export default UserListPage;
