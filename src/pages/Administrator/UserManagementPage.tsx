import React, { useState, useEffect, useMemo } from 'react';
import { useSelector } from 'react-redux';
import { RootState } from '@/store';
import { Link } from 'react-router-dom';
import { firestore } from '@/firebase';
import { collection, getDocs, query, orderBy, where, Timestamp } from 'firebase/firestore';
import { getFunctions, httpsCallable } from 'firebase/functions';
import Swal from 'sweetalert2';
import { FaSearch, FaShieldAlt, FaSchool, FaChalkboardTeacher, FaUserGraduate, FaPencilAlt, FaTrash, FaBriefcase, FaUserPlus } from 'react-icons/fa';
import MainLayout from "@/layouts/MainLayout";
import BackButton from "@/components/Shared/BackButton";
import { ROLE_LABELS, ROLES } from '@/constants/roles';

// --- Type Definitions ---
interface User {
  id: string;
  fullName: string;
  email: string;
  role: string[];
  schoolId?: string;
  profileUrl?: string;
  createdAt: Timestamp;
  position?: string;
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
const RoleBadges: React.FC<{ roles: string[] }> = ({ roles }) => {
  const roleStyles: { [key: string]: { icon: React.ReactNode, text: string, className: string } } = {
    [ROLES.SUPER_ADMIN]: { icon: <FaShieldAlt />, text: ROLE_LABELS[ROLES.SUPER_ADMIN], className: 'bg-red-50 text-red-600 border-red-100 dark:bg-red-500/10 dark:text-red-400 dark:border-red-500/20' },
    [ROLES.SCHOOL_ADMIN]: { icon: <FaSchool />, text: ROLE_LABELS[ROLES.SCHOOL_ADMIN], className: 'bg-blue-50 text-blue-600 border-blue-100 dark:bg-blue-500/10 dark:text-blue-400 dark:border-blue-500/20' },
    [ROLES.TEACHER]: { icon: <FaChalkboardTeacher />, text: ROLE_LABELS[ROLES.TEACHER], className: 'bg-emerald-50 text-emerald-600 border-emerald-100 dark:bg-emerald-500/10 dark:text-emerald-400 dark:border-emerald-500/20' },
    [ROLES.STUDENT]: { icon: <FaUserGraduate />, text: ROLE_LABELS[ROLES.STUDENT], className: 'bg-indigo-50 text-indigo-600 border-indigo-100 dark:bg-indigo-500/10 dark:text-indigo-400 dark:border-indigo-500/20' },
    [ROLES.SCHOOL_ATTENDANCE]: { icon: <FaSchool />, text: ROLE_LABELS[ROLES.SCHOOL_ATTENDANCE], className: 'bg-orange-50 text-orange-600 border-orange-100 dark:bg-orange-500/10 dark:text-orange-400 dark:border-orange-500/20' },
  };

  const safeRoles = (Array.isArray(roles) ? roles : [roles])
    .filter(r => roleStyles[r]);

  if (safeRoles.length === 0) return null;

  return (
    <div className="flex flex-wrap gap-2 items-center">
      {safeRoles.map(role => (
        <Badge
          key={role}
          icon={roleStyles[role]?.icon || <FaUserGraduate />}
          text={roleStyles[role]?.text || role}
          className={roleStyles[role]?.className || 'bg-gray-500/20 text-gray-400 border-gray-500/30'}
        />
      ))}
    </div>
  );
};

const UserManagementPage: React.FC = () => {
  const [users, setUsers] = useState<User[]>([]);
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [roleFilter, setRoleFilter] = useState<string>('all');
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const currentUser = useSelector((state: RootState) => state.auth.user);
  const schoolId = currentUser?.schoolId;
  const functions = getFunctions();

  useEffect(() => {
    const fetchData = async () => {
      if (!schoolId) {
          setIsLoading(false);
          return;
      }
      setIsLoading(true);
      setError(null);
      try {
        const usersCollection = collection(firestore, "users");
        const q = query(
            usersCollection, 
            where("schoolId", "==", schoolId),
            orderBy("fullName", "asc")
        );
        const userSnapshot = await getDocs(q);

        const usersData = userSnapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data(),
        }) as User);

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
  }, [schoolId]);

  const filteredUsers = useMemo(() => {
    return users.filter(user => {
      const userRoles = Array.isArray(user.role) ? user.role : [user.role];
      const matchesRole = roleFilter === 'all' || userRoles.includes(roleFilter);
      const matchesSearch = searchTerm === '' ||
        (user.fullName || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
        (user.email || '').toLowerCase().includes(searchTerm.toLowerCase());
      return matchesRole && matchesSearch;
    });
  }, [users, searchTerm, roleFilter]);

  const handleDeleteUser = async (userId: string, userFullName: string) => {
    const result = await Swal.fire({
      title: 'ยืนยันการลบผู้ใช้',
      html: `คุณต้องการลบผู้ใช้ <b>${userFullName}</b> ใช่หรือไม่?<br/><strong class="text-red-500">การกระทำนี้ไม่สามารถย้อนกลับได้</strong>`,
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
        allowOutsideClick: false,
        didOpen: () => {
          Swal.showLoading();
        },
      });

      try {
        const deleteUserCallable = httpsCallable(functions, 'deleteUser');
        await deleteUserCallable({ userId: userId });
        setUsers(currentUsers => currentUsers.filter(user => user.id !== userId));
        Swal.fire('ลบสำเร็จ!', `ผู้ใช้ ${userFullName} ถูกลบออกจากระบบแล้ว`, 'success');
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
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
        {filteredUsers.map((user) => (
          <div key={user.id} className="bg-white dark:bg-[#2a2b2f] rounded-2xl p-5 shadow-lg border border-gray-100 dark:border-gray-700/50 hover:border-indigo-500/30 hover:shadow-indigo-500/10 transition-all duration-300 flex flex-col">
            <div className="flex items-start gap-4">
              <img
                className="h-16 w-16 rounded-full object-cover border-2 border-gray-200 dark:border-gray-600"
                src={user.profileUrl || `https://ui-avatars.com/api/?name=${user.fullName}&background=random`}
                alt={user.fullName}
              />
              <div className="flex-1 min-w-0">
                <h3 className="font-bold text-lg text-gray-900 dark:text-white truncate" title={user.fullName}>{user.fullName || 'N/A'}</h3>
                <p className="text-sm text-gray-500 dark:text-gray-400 truncate" title={user.email}>{user.email}</p>
                <div className="mt-2">
                  <RoleBadges roles={user.role} />
                </div>
              </div>
            </div>

            <div className="mt-4 pt-4 border-t border-gray-100 dark:border-gray-700/50 space-y-2 text-sm">
              {user.position && (
                <div className="flex items-center gap-2 text-gray-600 dark:text-gray-400">
                  <FaBriefcase className="flex-shrink-0 text-indigo-400" />
                  <span>{user.position}</span>
                </div>
              )}
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
                <h1 className="text-3xl font-bold tracking-tight">จัดการผู้ใช้งานในโรงเรียน</h1>
              </div>
              <p className="mt-1 text-gray-500 dark:text-gray-400">
                จัดการสิทธิ์และข้อมูลผู้ใช้งานภายในโรงเรียนของคุณ
              </p>
            </div>
            <div className="flex flex-col sm:flex-row gap-3 w-full md:w-auto">
              <div className="relative w-full sm:w-64">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <FaSearch className="text-gray-400" />
                </div>
                <input
                  type="text"
                  placeholder="ค้นหาชื่อ, อีเมล..."
                  className="pl-10 pr-4 py-2.5 w-full bg-white dark:bg-[#2a2b2f] border border-gray-200 dark:border-gray-700 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none transition-all shadow-sm text-sm"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                />
              </div>
              <div className="relative w-full sm:w-48">
                <select
                  value={roleFilter}
                  onChange={(e) => setRoleFilter(e.target.value)}
                  className="w-full pl-4 pr-10 py-2.5 bg-white dark:bg-[#2a2b2f] border border-gray-200 dark:border-gray-700 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none transition-all shadow-sm text-sm"
                >
                  <option value="all">ทุกบทบาท</option>
                  <option value={ROLES.TEACHER}>ครู (Teacher)</option>
                  <option value={ROLES.SCHOOL_ADMIN}>ผู้ดูแลโรงเรียน (School Admin)</option>
                  <option value={ROLES.SCHOOL_ATTENDANCE}>เจ้าหน้าที่ลงเวลาครู</option>
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

export default UserManagementPage;
