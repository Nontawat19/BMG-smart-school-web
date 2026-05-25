import React, { useState, useEffect } from "react";
import { useSelector } from "react-redux";
import { Link } from "react-router-dom";
import { firestore } from "@/firebase";
import { getLevelsByRange } from "@/utils/schoolUtils";
import { getAuth, sendPasswordResetEmail } from "firebase/auth";
import {
  collection,
  getDocs,
  getDoc,
  addDoc,
  updateDoc,
  deleteDoc,
  doc,
  query,
  where,
  collectionGroup,
} from "firebase/firestore";
import Swal from "sweetalert2";
import { RootState } from "../../store";
import MainLayout from "../../layouts/MainLayout";
import ProfileAvatar from "@/components/Shared/ProfileAvatar";
import { ROLES } from "@/constants/roles";
import { updateOwnerAndSchoolCounts } from "@/utils/ownerStatsUtils";
import {
  Users,
  UserPlus,
  Edit,
  Trash2,
  Search,
  Save,
  X,
  Shield,
  Briefcase,
  School,
  Key,
  Home,
} from "lucide-react";
import ProfilePlaceholder from "../../assets/profile.png";

// Interface for User (Teacher/Staff)
interface SchoolUser {
  id: string;
  teacherId: string; // ID Card / Staff ID
  title: string;
  firstName: string;
  lastName: string;
  position: string; // e.g., Director, Teacher
  role: string; // e.g., admin, user, attendance
  email?: string;
  phoneNumber?: string;
  schoolId?: string; // เพิ่ม schoolId เพื่อระบุสังกัด
  schoolName?: string; // ชื่อโรงเรียน (สำหรับแสดงผล)
  department?: string;
  homeroomGrade?: string;
  homeroomRoom?: string; // เพิ่มห้อง
  profileImageUrl?: string;
}

interface SchoolData {
  id: string;
  schoolName: string;
}

const UserManagementPage: React.FC = () => {
  const { user: currentUser } = useSelector((state: RootState) => state.auth);
  const currentSchoolId = currentUser?.schoolId;
  const auth = getAuth();

  const [users, setUsers] = useState<SchoolUser[]>([]);
  const [schools, setSchools] = useState<SchoolData[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedSchoolFilter, setSelectedSchoolFilter] = useState<string>(""); // Filter by school

  // Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<SchoolUser | null>(null);
  const [availableLevels, setAvailableLevels] = useState<string[]>([]);

  // Form State
  const [formData, setFormData] = useState<Partial<SchoolUser>>({
    teacherId: "",
    title: "นาย",
    firstName: "",
    lastName: "",
    position: "ครู",
    role: "teacher",
    email: "",
    phoneNumber: "",
    schoolId: "",
    department: "",
    homeroomGrade: "",
    homeroomRoom: "",
  });

  // Fetch Schools List
  useEffect(() => {
    const fetchSchools = async () => {
      try {
        const q = query(collection(firestore, "school-settings"));
        const snapshot = await getDocs(q);
        const schoolList = snapshot.docs.map(doc => ({
          id: doc.id,
          schoolName: doc.data().schoolName || "ไม่ระบุชื่อโรงเรียน"
        }));
        setSchools(schoolList);
      } catch (error) {
        console.error("Error fetching schools:", error);
      }
    };
    fetchSchools();
  }, []);

  const fetchUsers = async () => {
    setIsLoading(true);
    try {
      let q;
      const targetSchoolId = currentSchoolId || selectedSchoolFilter;

      if (targetSchoolId) {
        // ถ้ามี schoolId (จาก Login หรือ Filter) ให้ดึงเฉพาะโรงเรียนนั้น
        q = query(collection(firestore, "school-settings", targetSchoolId, "teachers"));
      } else {
        // ถ้าไม่มี (Super Admin และยังไม่เลือกโรงเรียน) ให้ดึงทั้งหมด
        q = query(collectionGroup(firestore, "teachers"));
      }

      const querySnapshot = await getDocs(q);
      const fetchedUsers: SchoolUser[] = querySnapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
        // ดึง schoolId จาก path ของ document (school-settings/{schoolId}/teachers/{teacherId})
        schoolId: doc.ref.path.split('/')[1]
      })) as SchoolUser[];
      setUsers(fetchedUsers);
    } catch (error) {
      console.error("Error fetching users:", error);
      Swal.fire("Error", "ไม่สามารถโหลดข้อมูลผู้ใช้ได้", "error");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchUsers();
  }, [selectedSchoolFilter, currentSchoolId]); // Re-fetch when filter changes

  const handleOpenModal = async (user: SchoolUser) => {
    setEditingUser(user);
    setFormData(user);

    // Fetch available levels for the user's school
    if (user.schoolId) {
      try {
        const schoolRef = doc(firestore, "school-settings", user.schoolId);
        const schoolSnap = await getDoc(schoolRef);
        if (schoolSnap.exists()) {
          const data = schoolSnap.data();
          const levels = getLevelsByRange(data.opportunityExpansionLevel || "");
          setAvailableLevels(levels);
        }
      } catch (error) {
        console.error("Error fetching school levels for modal:", error);
        setAvailableLevels([]); // Reset on error
      }
    }

    setIsModalOpen(true);
  };

  const handleCloseModal = () => {
    setIsModalOpen(false);
    setEditingUser(null);
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setFormData((prev) => {
      const newData = { ...prev, [name]: value };
      if (name === "position") {
        if (value === "ผู้อำนวยการ") newData.role = "director";
        else if (value === "ครู") newData.role = "teacher";
        else if (value === "ฝ่ายวิชาการ") newData.role = "academic_admin";
      }
      if (name === "homeroomGrade" && value === "") {
        newData.homeroomRoom = "";
      }
      return newData;
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const targetSchoolId = currentSchoolId || formData.schoolId;

    if (!targetSchoolId) {
      Swal.fire("Error", "กรุณาเลือกโรงเรียน", "error");
      return;
    }

    try {
      if (editingUser) {
        // Update
        const userRef = doc(firestore, "school-settings", targetSchoolId, "teachers", editingUser.id);
        await updateDoc(userRef, formData);
        Swal.fire("Success", "อัปเดตข้อมูลสำเร็จ", "success");
      } else {
        // Add New
        const colRef = collection(firestore, "school-settings", targetSchoolId, "teachers");
        await addDoc(colRef, formData);
        await updateOwnerAndSchoolCounts(firestore, targetSchoolId, { teachers: 1 });
        Swal.fire("Success", "เพิ่มผู้ใช้ใหม่สำเร็จ", "success");
      }
      handleCloseModal();
      fetchUsers();
    } catch (error) {
      console.error("Error saving user:", error);
      Swal.fire("Error", "เกิดข้อผิดพลาดในการบันทึก", "error");
    }
  };

  const handleDelete = async (userId: string, userSchoolId?: string) => {
    const result = await Swal.fire({
      title: "ยืนยันการลบ?",
      text: "คุณต้องการลบผู้ใช้นี้ใช่หรือไม่? การกระทำนี้ไม่สามารถย้อนกลับได้",
      icon: "warning",
      showCancelButton: true,
      confirmButtonColor: "#d33",
      cancelButtonColor: "#3085d6",
      confirmButtonText: "ลบ",
      cancelButtonText: "ยกเลิก",
    });

    if (result.isConfirmed) {
      try {
        if (!userSchoolId) return;
        // Security check: prevent deleting users from other schools if logged in as school admin
        if (currentSchoolId && userSchoolId !== currentSchoolId) {
          Swal.fire("Error", "คุณไม่มีสิทธิ์ลบผู้ใช้นอกโรงเรียนของคุณ", "error");
          return;
        }
        await deleteDoc(doc(firestore, "school-settings", userSchoolId, "teachers", userId));
        await updateOwnerAndSchoolCounts(firestore, userSchoolId, { teachers: -1 });
        Swal.fire("Deleted!", "ลบผู้ใช้เรียบร้อยแล้ว", "success");
        fetchUsers();
      } catch (error) {
        console.error("Error deleting user:", error);
        Swal.fire("Error", "เกิดข้อผิดพลาดในการลบ", "error");
      }
    }
  };

  const handleResetPassword = async (email?: string) => {
    if (!email) {
      Swal.fire("แจ้งเตือน", "ผู้ใช้นี้ไม่มีข้อมูลอีเมลในระบบ", "warning");
      return;
    }

    const result = await Swal.fire({
      title: 'ยืนยันการรีเซ็ตรหัสผ่าน',
      text: `ระบบจะส่งลิงก์สำหรับตั้งรหัสผ่านใหม่ไปยัง ${email}`,
      icon: 'question',
      showCancelButton: true,
      confirmButtonColor: '#3085d6',
      cancelButtonColor: '#d33',
      confirmButtonText: 'ส่งอีเมล',
      cancelButtonText: 'ยกเลิก'
    });

    if (result.isConfirmed) {
      try {
        await sendPasswordResetEmail(auth, email);
        Swal.fire(
          'ส่งอีเมลสำเร็จ',
          'ระบบได้ส่งลิงก์สำหรับตั้งรหัสผ่านใหม่ไปยังอีเมลของผู้ใช้แล้ว',
          'success'
        );
      } catch (error: any) {
        console.error("Error sending password reset email:", error);
        const errorMessage = error.code === 'auth/user-not-found' ? "ไม่พบผู้ใช้นี้ในระบบ Authentication" : "เกิดข้อผิดพลาดในการส่งอีเมล";
        Swal.fire('เกิดข้อผิดพลาด', errorMessage, 'error');
      }
    }
  };

  // Helper to get school name
  const getSchoolName = (sId?: string) => {
    return schools.find(s => s.id === sId)?.schoolName || "ไม่ระบุ";
  };

  // Helper to get role name in Thai
  const getRoleName = (role: string) => {
    switch (role) {
      case ROLES.SUPER_ADMIN: return 'ผู้ดูแลระบบสูงสุด (Super Admin)';
      case ROLES.SCHOOL_ADMIN: return 'ผู้ดูแลระบบโรงเรียน (School Admin)';
      case 'admin': return 'ผู้ดูแลระบบโรงเรียน (Admin)';
      case 'director': return 'ผู้อำนวยการ (Director)';
      case ROLES.TEACHER: return 'ครู (Teacher)';
      case ROLES.ACADEMIC_ADMIN: return 'ฝ่ายวิชาการ (Academic)';
      default: return role;
    }
  };

  const filteredUsers = users.filter((user) =>
    `${user.firstName} ${user.lastName} ${user.teacherId} ${user.position} ${getSchoolName(user.schoolId)}`
      .toLowerCase()
      .includes(searchTerm.toLowerCase())
  );


  return (
    <MainLayout>
      <main className="p-6">
        <div className="max-w-7xl mx-auto">
          <div className="flex flex-col md:flex-row justify-between items-center mb-6 gap-4">
            <div>
              <h1 className="text-2xl font-bold text-gray-900 dark:text-white flex items-center gap-4">
                <Link 
                  to="/home"
                  className="w-10 h-10 rounded-full bg-white dark:bg-white/[0.03] border border-gray-200 dark:border-white/5 flex items-center justify-center text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-white/[0.08] hover:text-gray-900 dark:hover:text-white transition-all shadow-sm"
                >
                  <Home size={20} />
                </Link>
                <Users className="w-8 h-8 text-indigo-600" />
                {currentSchoolId ? `จัดการผู้ใช้งาน (${getSchoolName(currentSchoolId)})` : 'จัดการผู้ใช้งาน (ทุกโรงเรียน)'}
              </h1>
              <p className="text-gray-500 dark:text-gray-400 text-sm mt-1">
                {currentSchoolId ? 'บริหารจัดการข้อมูลครูและบุคลากรภายในโรงเรียน' : 'บริหารจัดการข้อมูลครูและบุคลากรจากโรงเรียนทั้งหมดในระบบ'}
              </p>
            </div>
          </div>

          {/* Filters & Search */}
          <div className="bg-white dark:bg-[#2a2b2f] p-4 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 mb-6 flex flex-col md:flex-row gap-4">
            <div className="w-full md:w-64">
              {currentSchoolId ? (
                <div className="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-600 bg-gray-100 dark:bg-[#1e1f21] text-gray-500 dark:text-gray-400 cursor-not-allowed">
                  {getSchoolName(currentSchoolId)}
                </div>
              ) : (
                <select
                  value={selectedSchoolFilter}
                  onChange={(e) => setSelectedSchoolFilter(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-[#1e1f21] text-gray-900 dark:text-white outline-none focus:ring-2 focus:ring-indigo-500"
                >
                  <option value="">ทั้งหมด (ทุกโรงเรียน)</option>
                  {schools.map(school => (
                    <option key={school.id} value={school.id}>
                      {school.schoolName}
                    </option>
                  ))}
                </select>
              )}
            </div>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 w-5 h-5" />
              <input
                type="text"
                placeholder="ค้นหาชื่อ, รหัส, หรือตำแหน่ง..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-10 pr-4 py-2 rounded-lg border border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-[#1e1f21] text-gray-900 dark:text-white focus:ring-2 focus:ring-indigo-500 outline-none"
              />
            </div>
          </div>

          {/* Users Table */}
          <div className="bg-white dark:bg-[#2a2b2f] rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 overflow-hidden">
            <div className="table-responsive">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-gray-50 dark:bg-[#323338] border-b border-gray-200 dark:border-gray-700">
                    <th className="px-6 py-4 text-sm font-semibold text-gray-600 dark:text-gray-300 text-center">ลำดับ</th>
                    <th className="px-6 py-4 text-sm font-semibold text-gray-600 dark:text-gray-300">ชื่อ - นามสกุล</th>
                    <th className="px-6 py-4 text-sm font-semibold text-gray-600 dark:text-gray-300">รหัส</th>
                    <th className="px-6 py-4 text-sm font-semibold text-gray-600 dark:text-gray-300">ตำแหน่ง</th>
                    <th className="px-6 py-4 text-sm font-semibold text-gray-600 dark:text-gray-300">สิทธิ์ (Role)</th>
                    <th className="px-6 py-4 text-sm font-semibold text-gray-600 dark:text-gray-300 text-center">จัดการ</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                  {isLoading ? (
                    <tr>
                      <td colSpan={6} className="px-6 py-8 text-center text-gray-500">กำลังโหลดข้อมูล...</td>
                    </tr>
                  ) : filteredUsers.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="px-6 py-8 text-center text-gray-500">ไม่พบข้อมูล</td>
                    </tr>
                  ) : (
                    filteredUsers.map((user, index) => (
                      <tr key={user.id} className="hover:bg-gray-50 dark:hover:bg-[#323338]/50 transition-colors">
                        <td className="px-6 py-4 text-gray-900 dark:text-white text-sm text-center">{index + 1}</td>
                        <td className="px-6 py-4 text-gray-900 dark:text-white font-medium">
                          <div className="flex items-center gap-3">
                            <ProfileAvatar
                              src={user.profileImageUrl || ProfilePlaceholder}
                              alt="Profile"
                              className="w-10 h-10 border border-gray-200 dark:border-gray-600"
                            />
                            <span>{user.title}{user.firstName} {user.lastName}</span>
                          </div>
                        </td>
                        <td className="px-6 py-4 text-gray-900 dark:text-white font-mono text-sm">{user.teacherId}</td>
                        <td className="px-6 py-4 text-gray-600 dark:text-gray-300">
                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300">
                            <Briefcase className="w-3 h-3" /> {user.position}
                          </span>
                        </td>
                        <td className="px-6 py-4">
                          <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium ${(user.role === ROLES.SUPER_ADMIN || user.role === ROLES.SCHOOL_ADMIN || user.role === 'admin') ? 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300' :
                            user.role === 'director' ? 'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300' :
                              user.role === ROLES.TEACHER ? 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300' :
                                user.role === ROLES.ACADEMIC_ADMIN ? 'bg-indigo-100 text-indigo-800 dark:bg-indigo-900/30 dark:text-indigo-300' :
                                  'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300'
                            }`}>
                            <Shield className="w-3 h-3" /> {getRoleName(user.role)}
                          </span>
                        </td>
                        <td className="px-6 py-4 text-center">
                          <div className="flex items-center justify-center gap-2">
                            <button
                              onClick={() => handleResetPassword(user.email)}
                              className="p-2 text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded-lg transition-colors"
                              title="รีเซ็ตรหัสผ่าน (ส่งอีเมล)"
                            >
                              <Key className="w-4 h-4" />
                            </button>
                            <button
                              onClick={() => handleOpenModal(user)}
                              className="p-2 text-amber-600 hover:bg-amber-50 dark:hover:bg-amber-900/20 rounded-lg transition-colors"
                              title="แก้ไข"
                            >
                              <Edit className="w-4 h-4" />
                            </button>
                            <button
                              onClick={() => handleDelete(user.id, user.schoolId)}
                              className="p-2 text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors"
                              title="ลบ"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {/* Modal */}
        {isModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
            <div className="bg-white dark:bg-[#2a2b2f] rounded-2xl shadow-xl w-full max-w-lg overflow-hidden">
              <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700 flex justify-between items-center">
                <h3 className="text-lg font-bold text-gray-900 dark:text-white">
                  แก้ไขข้อมูลผู้ใช้
                </h3>
                <button onClick={handleCloseModal} className="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200">
                  <X className="w-5 h-5" />
                </button>
              </div>

              <form onSubmit={handleSubmit} className="p-6 space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">สังกัดโรงเรียน</label>
                  {currentSchoolId ? (
                    <input
                      type="text"
                      value={getSchoolName(currentSchoolId)}
                      disabled
                      className="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-600 bg-gray-100 dark:bg-[#1e1f21] text-gray-500 dark:text-gray-400 outline-none cursor-not-allowed"
                    />
                  ) : (
                    <select
                      name="schoolId"
                      value={formData.schoolId}
                      onChange={handleInputChange}
                      required
                      disabled={true} // ห้ามย้ายโรงเรียนตอนแก้ไข (เพื่อความปลอดภัยของ path)
                      className="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-[#1e1f21] text-gray-900 dark:text-white outline-none focus:ring-2 focus:ring-indigo-500 disabled:opacity-60"
                    >
                      <option value="">-- เลือกโรงเรียน --</option>
                      {schools.map(school => (
                        <option key={school.id} value={school.id}>{school.schoolName}</option>
                      ))}
                    </select>
                  )}
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">คำนำหน้า</label>
                    <select
                      name="title"
                      value={formData.title}
                      onChange={handleInputChange}
                      className="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-[#1e1f21] text-gray-900 dark:text-white outline-none focus:ring-2 focus:ring-indigo-500"
                    >
                      <option value="นาย">นาย</option>
                      <option value="นาง">นาง</option>
                      <option value="นางสาว">นางสาว</option>
                      <option value="ว่าที่ร.ต.">ว่าที่ร.ต.</option>
                      <option value="ดร.">ดร.</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">รหัสบุคลากร</label>
                    <input
                      type="text"
                      name="teacherId"
                      value={formData.teacherId}
                      onChange={handleInputChange}
                      required
                      className="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-[#1e1f21] text-gray-900 dark:text-white outline-none focus:ring-2 focus:ring-indigo-500"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">ชื่อ</label>
                    <input
                      type="text"
                      name="firstName"
                      value={formData.firstName}
                      onChange={handleInputChange}
                      required
                      className="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-[#1e1f21] text-gray-900 dark:text-white outline-none focus:ring-2 focus:ring-indigo-500"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">นามสกุล</label>
                    <input
                      type="text"
                      name="lastName"
                      value={formData.lastName}
                      onChange={handleInputChange}
                      required
                      className="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-[#1e1f21] text-gray-900 dark:text-white outline-none focus:ring-2 focus:ring-indigo-500"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">ตำแหน่ง</label>
                    <select
                      name="position"
                      value={formData.position}
                      onChange={handleInputChange}
                      className="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-[#1e1f21] text-gray-900 dark:text-white outline-none focus:ring-2 focus:ring-indigo-500"
                    >
                      <option value="ผู้อำนวยการ">ผู้อำนวยการ</option>
                      <option value="ครู">ครู</option>
                      <option value="ฝ่ายวิชาการ">ฝ่ายวิชาการ</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">สิทธิ์การใช้งาน (Role)</label>
                    <select
                      name="role"
                      value={formData.role}
                      onChange={handleInputChange}
                      className="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-[#1e1f21] text-gray-900 dark:text-white outline-none focus:ring-2 focus:ring-indigo-500"
                    >
                      <option value={ROLES.TEACHER}>ครู (Teacher)</option>
                      <option value={ROLES.ACADEMIC_ADMIN}>ฝ่ายวิชาการ (Academic)</option>
                      <option value={ROLES.SCHOOL_ADMIN}>ผู้ดูแลระบบโรงเรียน (School Admin)</option>
                      <option value="director">ผู้อำนวยการ (Director)</option>
                      {currentUser?.role?.includes(ROLES.SUPER_ADMIN) && (
                        <option value={ROLES.SUPER_ADMIN}>ผู้ดูแลระบบสูงสุด (Super Admin)</option>
                      )}
                    </select>
                  </div>
                </div>

                {formData.position === 'ครู' && (
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">ฝ่ายงาน</label>
                      <select
                        name="department"
                        value={formData.department || ""}
                        onChange={handleInputChange}
                        className="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-[#1e1f21] text-gray-900 dark:text-white outline-none focus:ring-2 focus:ring-indigo-500"
                      >
                        <option value="">เลือกฝ่ายงาน</option>
                        <option value="งานบริหารวิชาการ">งานบริหารวิชาการ</option>
                        <option value="งานบริหารงบประมาณ">งานบริหารงบประมาณ</option>
                        <option value="งานบริหารบุคคล">งานบริหารบุคคล</option>
                        <option value="งานบริหารทั่วไป">งานบริหารทั่วไป</option>
                        <option value="งานบริหารกิจการนักเรียน">งานบริหารกิจการนักเรียน</option>
                        <option value="ฝ่ายบริหาร">ฝ่ายบริหาร</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">ครูประจำชั้น</label>
                      <select
                        name="homeroomGrade"
                        value={formData.homeroomGrade || ""}
                        onChange={handleInputChange}
                        className="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-[#1e1f21] text-gray-900 dark:text-white outline-none focus:ring-2 focus:ring-indigo-500"
                      >
                        <option value="">-- ไม่ระบุ --</option>
                        {availableLevels.map(level => (
                          <option key={level} value={level}>{level}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">ห้อง</label>
                      <select
                        name="homeroomRoom"
                        value={formData.homeroomRoom || ""}
                        onChange={handleInputChange}
                        disabled={!formData.homeroomGrade}
                        className="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-[#1e1f21] text-gray-900 dark:text-white outline-none focus:ring-2 focus:ring-indigo-500 disabled:opacity-50"
                      >
                        <option value="">-- ไม่ระบุ --</option>
                        {Array.from({ length: 20 }, (_, i) => i + 1).map(r => (
                          <option key={r} value={r}>{r}</option>
                        ))}
                      </select>
                    </div>
                  </div>
                )}

                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">อีเมล</label>
                  <input
                    type="email"
                    name="email"
                    value={formData.email}
                    onChange={handleInputChange}
                    required
                    className="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-[#1e1f21] text-gray-900 dark:text-white outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>

                <div className="pt-4 flex justify-end gap-3">
                  <button
                    type="button"
                    onClick={handleCloseModal}
                    className="px-4 py-2 bg-gray-200 hover:bg-gray-300 dark:bg-gray-700 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-200 rounded-lg transition-colors"
                  >
                    ยกเลิก
                  </button>
                  <button
                    type="submit"
                    className="flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg shadow-md transition-colors"
                  >
                    <Save className="w-4 h-4" />
                    บันทึก
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
      </main>
    </MainLayout>
  );
};

export default UserManagementPage;
