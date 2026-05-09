import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { usePermissions } from "@/hooks/usePermissions";
import { firestore, storage } from '@/firebase';
import { doc, getDoc, updateDoc, collection, getDocs, setDoc, serverTimestamp } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import MainLayout from '@/layouts/MainLayout';
import Swal from 'sweetalert2';
import { FaSave, FaTimes, FaKey, FaEnvelope, FaUser, FaShieldAlt, FaArrowLeft, FaPlus, FaCamera, FaChevronDown, FaCheck, FaUserPlus } from 'react-icons/fa';
import { compressImage } from '@/utils/imageUtils';

interface User {
  fullName: string;
  firstName?: string;
  lastName?: string;
  title?: string;
  email: string;
  role: string | string[];
  schoolId?: string;
  profileUrl?: string;
}

interface School {
  id: string;
  schoolName: string;
}

const initialTitles = ["นาย", "นาง", "นางสาว", "ครู", "อาจารย์", "ดร.", "บาทหลวง", "ซิสเตอร์", "บราเดอร์", "อื่นๆ"];

const EditUserPage: React.FC = () => {
  const { userId } = useParams<{ userId: string }>();
  const navigate = useNavigate();
  const { user: currentUser, isSchoolAdmin, isTeacher } = usePermissions();
  const [user, setUser] = useState<User | null>(null);
  const [schools, setSchools] = useState<School[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'profile' | 'security'>('profile');
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [isRoleDropdownOpen, setIsRoleDropdownOpen] = useState(false);
  const [customTitle, setCustomTitle] = useState("");
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsRoleDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
    const fetchData = async () => {
      if (!userId) {
        setError("ไม่พบ ID ของผู้ใช้");
        setIsLoading(false);
        return;
      }
      setIsLoading(true);
      try {
        // Fetch user data
        const userDocRef = doc(firestore, 'users', userId);
        const userDocSnap = await getDoc(userDocRef);

        if (!userDocSnap.exists()) {
          throw new Error("ไม่พบข้อมูลผู้ใช้");
        }
        const userData = userDocSnap.data() as User;

        // Normalize role to array if it is a string
        if (userData.role && typeof userData.role === 'string') {
          userData.role = [userData.role];
        } else if (!userData.role) {
          userData.role = [];
        }

        // Try to split fullName if firstName/lastName are missing
        if (!userData.firstName || !userData.lastName) {
            const nameParts = (userData.fullName || "").trim().split(/\s+/);
            if (nameParts.length >= 2) {
                // Check if the first part is a title
                const possibleTitle = nameParts[0];
                const matchedTitle = initialTitles.find(t => possibleTitle.startsWith(t));
                
                if (matchedTitle) {
                    userData.title = matchedTitle;
                    userData.firstName = possibleTitle.replace(matchedTitle, "").trim() || nameParts[1];
                    userData.lastName = nameParts.slice(matchedTitle === possibleTitle ? 2 : 1).join(" ");
                } else {
                    userData.firstName = nameParts[0];
                    userData.lastName = nameParts.slice(1).join(" ");
                }
            }
        }

        setUser(userData);
        
        if (userData.title && !initialTitles.includes(userData.title)) {
          setCustomTitle(userData.title);
        }

        // Security check for school admins and teachers
        if ((isSchoolAdmin || isTeacher) && userData.schoolId !== currentUser?.schoolId) {
          Swal.fire('เข้าถึงไม่ได้', 'คุณไม่มีสิทธิ์แก้ไขข้อมูลผู้ใช้นอกโรงเรียน', 'error');
          navigate('/owner/users');
          return;
        }

        if (userData.profileUrl) {
          setImagePreview(userData.profileUrl);
        }

        // Fetch schools list
        const schoolsCollection = collection(firestore, "school-settings");
        const schoolSnapshot = await getDocs(schoolsCollection);
        const schoolsData = schoolSnapshot.docs.map(doc => ({
          id: doc.id,
          schoolName: doc.data().schoolName,
        }));
        setSchools(schoolsData);

      } catch (err: any) {
        console.error("Error fetching data:", err);
        setError(err.message || "เกิดข้อผิดพลาดในการดึงข้อมูล");
      } finally {
        setIsLoading(false);
      }
    };

    fetchData();
  }, [userId]);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    if (!user) return;
    const { name, value } = e.target;
    setUser({ ...user, [name]: value });
  };

  const handleRoleToggle = (roleValue: string) => {
    if (!user) return;

    const currentRoles = Array.isArray(user.role) ? [...user.role] : [user.role];
    const updatedRoles = currentRoles.includes(roleValue)
      ? currentRoles.filter(r => r !== roleValue)
      : [...currentRoles, roleValue];

    setUser({ ...user, role: updatedRoles });
  };

  const handleImageChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      if (!file.type.startsWith('image/')) {
        Swal.fire({ icon: 'error', title: 'ไฟล์ไม่ถูกต้อง', text: 'กรุณาอัปโหลดไฟล์รูปภาพเท่านั้น', background: '#2a2b2f', color: '#ffffff' });
        return;
      }
      try {
        // Compress and convert to WebP to match standard
        const compressedFile = await compressImage(file, 800, 0.8, 'image/webp');
        setImageFile(compressedFile);
        setImagePreview(URL.createObjectURL(compressedFile));
      } catch (error) {
        console.error("Error compressing image:", error);
        setImageFile(file);
        setImagePreview(URL.createObjectURL(file));
      }
    }
  };

  const handlePasswordReset = async () => {
    if (!user || !user.email) return;

    // --- PRODUCTION NOTE ---
    // The client-side `sendPasswordResetEmail` can only be used for the currently logged-in user.
    // To allow an admin to reset another user's password, you must use the Firebase Admin SDK
    // in a secure backend environment (e.g., a Cloud Function).
    //
    // For demonstration purposes, this will show a confirmation and simulate the action.
    // In a real app, you would call your cloud function here.
    // e.g., `await functions.httpsCallable('adminResetPassword')({ email: user.email });`

    const result = await Swal.fire({
      title: 'ยืนยันการส่งอีเมลรีเซ็ตรหัสผ่าน',
      text: `คุณต้องการส่งอีเมลสำหรับรีเซ็ตรหัสผ่านไปยัง ${user.email} ใช่หรือไม่?`,
      icon: 'question',
      showCancelButton: true,
      confirmButtonText: 'ใช่, ส่งเลย',
      cancelButtonText: 'ยกเลิก',
    });

    if (result.isConfirmed) {
      Swal.fire({
        icon: 'success',
        title: 'ส่งอีเมลสำเร็จ',
        text: `ได้ส่งลิงก์สำหรับรีเซ็ตรหัสผ่านไปยัง ${user.email} แล้ว (จำลอง)`,
      });
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!userId || !user) return;


    setIsSaving(true);
    try {
      let profileUrl = user.profileUrl;
      const finalTitle = user.title === "อื่นๆ" ? customTitle : user.title;
      const fullName = `${finalTitle}${user.firstName} ${user.lastName}`.trim();

      if (imageFile) {
        // Use .webp extension to match standard
        const storageRef = ref(storage, `users/${userId}/profile_${Date.now()}.webp`);
        const snapshot = await uploadBytes(storageRef, imageFile);
        profileUrl = await getDownloadURL(snapshot.ref);
      }

      // 1. Update central 'users' collection
      const userData = {
        fullName: fullName,
        firstName: user.firstName || null,
        lastName: user.lastName || null,
        title: finalTitle || null,
        role: user.role,
        schoolId: user.schoolId || null,
        profileUrl: profileUrl || null,
        updatedAt: serverTimestamp(),
      };
      await updateDoc(doc(firestore, 'users', userId), userData);

      // 2. Update school-specific collections if applicable
      const roles = Array.isArray(user.role) ? user.role : [user.role];
      if (user.schoolId) {
        const isStaff = roles.some(r => ['teacher', 'school_admin', 'academic_admin', 'super_admin'].includes(r));
        const isStudent = roles.includes('student');

        if (isStaff) {
          const teacherDocRef = doc(firestore, "school-settings", user.schoolId, "teachers", userId);
          const teacherSnap = await getDoc(teacherDocRef);
          
          const teacherData = {
            uid: userId,
            firstName: user.firstName,
            lastName: user.lastName,
            title: finalTitle,
            email: user.email,
            role: user.role,
            schoolId: user.schoolId,
            profileImageUrl: profileUrl || null, // ProfilePage expects profileImageUrl
            updatedAt: serverTimestamp(),
            // Preserve existing teacher-specific fields if they exist, or use defaults
            position: teacherSnap.exists() ? (teacherSnap.data().position || (roles.includes('school_admin') ? "ผู้ดูแลระบบโรงเรียน" : "ครู")) : (roles.includes('school_admin') ? "ผู้ดูแลระบบโรงเรียน" : "ครู"),
            department: teacherSnap.exists() ? (teacherSnap.data().department || "งานบริหารทั่วไป") : "งานบริหารทั่วไป",
            status: teacherSnap.exists() ? (teacherSnap.data().status || "อยู่") : "อยู่",
            isHomeroomTeacher: teacherSnap.exists() ? (teacherSnap.data().isHomeroomTeacher || false) : false,
            gender: teacherSnap.exists() ? (teacherSnap.data().gender || "") : "",
            learningArea: teacherSnap.exists() ? (teacherSnap.data().learningArea || "") : "",
            subjectGroup: teacherSnap.exists() ? (teacherSnap.data().subjectGroup || "") : "",
          };
          
          await setDoc(teacherDocRef, teacherData, { merge: true });
        }

        if (isStudent) {
          const studentDocRef = doc(firestore, "school-settings", user.schoolId, "students", userId);
          const studentSnap = await getDoc(studentDocRef);

          const studentData = {
            uid: userId,
            firstName: user.firstName,
            lastName: user.lastName,
            title: finalTitle,
            email: user.email,
            role: user.role,
            schoolId: user.schoolId,
            profileImageUrl: profileUrl || null,
            updatedAt: serverTimestamp(),
            // Preserve student fields
            studentId: studentSnap.exists() ? (studentSnap.data().studentId || "") : "",
            classLevel: studentSnap.exists() ? (studentSnap.data().classLevel || "") : "",
            room: studentSnap.exists() ? (studentSnap.data().room || "") : "",
            studentStatus: studentSnap.exists() ? (studentSnap.data().studentStatus || "ปกติ") : "ปกติ",
            gender: studentSnap.exists() ? (studentSnap.data().gender || "") : "",
          };

          await setDoc(studentDocRef, studentData, { merge: true });
        }
      }

      // 📌 Update Slug for the Profile
      const slugId = `profile:${userId}`;
      await setDoc(doc(firestore, 'slugs', slugId), {
        slug: slugId,
        targetId: userId,
        targetType: 'profile',
        schoolId: user.schoolId || null,
        fullPath: '/profile',
        updatedAt: serverTimestamp()
      }, { merge: true });

      // 📌 Update specific role slugs
      // (roles already defined above)
      for (const role of roles) {
        if (['student', 'teacher'].includes(role)) {
          const roleSlugId = `${role}:${userId}`;
          await setDoc(doc(firestore, 'slugs', roleSlugId), {
            slug: roleSlugId,
            targetId: userId,
            targetType: role,
            schoolId: user.schoolId || null,
            fullPath: `/${role}`,
            updatedAt: serverTimestamp()
          }, { merge: true });
        }
      }

      Swal.fire({
        icon: 'success',
        title: 'บันทึกสำเร็จ',
        text: 'ข้อมูลผู้ใช้ถูกอัปเดตเรียบร้อยแล้ว',
        timer: 2000,
        showConfirmButton: false,
      });
      navigate('/owner/users');
    } catch (err) {
      console.error("Error updating user:", err);
      Swal.fire('เกิดข้อผิดพลาด', 'ไม่สามารถอัปเดตข้อมูลผู้ใช้ได้', 'error');
    } finally {
      setIsSaving(false);
    }
  };

  if (isLoading) {
    return (
      <MainLayout>
        <div className="p-8 text-center">กำลังโหลดข้อมูล...</div>
      </MainLayout>
    );
  }

  if (error) {
    return (
      <MainLayout>
        <div className="p-8 text-center text-red-500">{error}</div>
      </MainLayout>
    );
  }

  if (!user) {
    return (
      <MainLayout>
        <div className="p-8 text-center">ไม่พบข้อมูลผู้ใช้</div>
      </MainLayout>
    );
  }

  const userRoles = [
    { value: 'super_admin', label: 'ผู้ดูแลระบบสูงสุด (Super Admin)' },
    { value: 'school_admin', label: 'ผู้ดูแลระบบโรงเรียน (School Admin)' },
    { value: 'teacher', label: 'ครูผู้สอน (Teacher)' },
    { value: 'student', label: 'นักเรียน (Student)' },
    { value: 'school_attendance', label: 'เจ้าหน้าที่ลงเวลาครู (Teacher Attendance)' },
    { value: 'student_attendance', label: 'เจ้าหน้าที่ลงเวลา (Student Attendance)' },
    { value: 'teacher_attendance', label: 'เจ้าหน้าที่ลงเวลา (ครู/บุคลากร)' },
  ];

  return (
    <MainLayout>
      <div className="min-h-screen bg-gray-50 dark:bg-[#1e1f21] text-gray-900 dark:text-white transition-colors duration-300">
        <div className="max-w-5xl mx-auto px-3 sm:px-4 md:px-6 lg:px-8 py-4 sm:py-6 lg:py-8">
          <header className="mb-8 flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold tracking-tight">แก้ไขข้อมูลผู้ใช้</h1>
              <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                จัดการข้อมูลและบัญชีของ <span className="font-semibold text-indigo-400">{user.email}</span>
              </p>
            </div>
            <div className="flex gap-2">
              <Link to="/owner/users/add" className="inline-flex items-center gap-x-2 rounded-md bg-indigo-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-indigo-700 transition-colors">
                <FaUserPlus />
                <span>เพิ่มผู้ใช้</span>
              </Link>
              <button onClick={() => navigate('/owner/users')} className="inline-flex items-center gap-x-2 rounded-md bg-gray-600/50 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-gray-700/50 transition-colors">
                <FaArrowLeft />
                กลับ
              </button>
            </div>
          </header>

          <div className="grid grid-cols-1 md:grid-cols-12 gap-8">
            {/* --- Left Sidebar Menu --- */}
            <aside className="md:col-span-3">
              <nav className="space-y-1">
                <button
                  onClick={() => setActiveTab('profile')}
                  className={`w-full flex items-center gap-3 px-4 py-2.5 text-sm font-medium rounded-lg transition-colors ${activeTab === 'profile'
                    ? 'bg-indigo-100 dark:bg-indigo-500/20 text-indigo-700 dark:text-indigo-300'
                    : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800'
                    }`}
                >
                  <FaUser />
                  <span>ข้อมูลโปรไฟล์</span>
                </button>
                <button
                  onClick={() => setActiveTab('security')}
                  className={`w-full flex items-center gap-3 px-4 py-2.5 text-sm font-medium rounded-lg transition-colors ${activeTab === 'security'
                    ? 'bg-indigo-100 dark:bg-indigo-500/20 text-indigo-700 dark:text-indigo-300'
                    : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800'
                    }`}
                >
                  <FaShieldAlt />
                  <span>ความปลอดภัย</span>
                </button>
              </nav>
            </aside>

            {/* --- Right Content Area --- */}
            <main className="md:col-span-9">
              <form onSubmit={handleSave}>
                <div className="bg-white dark:bg-[#2a2b2f]/60 rounded-2xl shadow-lg ring-1 ring-black/5 dark:ring-white/5">
                  {/* --- Profile Tab --- */}
                  {activeTab === 'profile' && (
                    <div className="p-6 sm:p-8">
                      <h2 className="text-lg font-semibold mb-2">ข้อมูลโปรไฟล์</h2>
                      <p className="text-sm text-gray-500 dark:text-gray-400 mb-6">อัปเดตข้อมูลส่วนตัวและบทบาทของผู้ใช้</p>
                      <div className="space-y-6">
                        <div>
                          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">รูปโปรไฟล์</label>
                          <div className="flex items-center gap-4">
                            <div className="relative group">
                              <img
                                className="h-24 w-24 rounded-full object-cover border-4 border-white dark:border-gray-700 shadow-md"
                                src={imagePreview || `https://ui-avatars.com/api/?name=${user.fullName || 'User'}&background=random`}
                                alt={user.fullName || 'User'}
                              />
                              <label htmlFor="profile-upload" className="absolute bottom-0 right-0 bg-indigo-600 text-white p-2 rounded-full cursor-pointer shadow-lg hover:bg-indigo-700 transition-colors">
                                <FaCamera size={14} />
                              </label>
                              <input
                                id="profile-upload"
                                type="file"
                                className="hidden"
                                accept="image/*"
                                onChange={handleImageChange}
                              />
                            </div>
                            <div className="text-sm text-gray-500 dark:text-gray-400">
                              <p>คลิกที่ไอคอนกล้องเพื่อเปลี่ยนรูปภาพ</p>
                              <p className="text-xs">รองรับไฟล์ JPG, PNG (ระบบจะบีบอัดภาพอัตโนมัติ)</p>
                            </div>
                          </div>
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                          <div>
                            <label htmlFor="title" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">คำนำหน้า</label>
                            <select
                              id="title"
                              name="title"
                              value={user.title || ""}
                              onChange={handleInputChange}
                              className="block w-full px-4 py-2 bg-white dark:bg-[#1e1f21] border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
                              required
                            >
                              <option value="">เลือกคำนำหน้า</option>
                              {initialTitles.map((t) => (
                                <option key={t} value={t}>{t}</option>
                              ))}
                            </select>
                          </div>
                          {user.title === "อื่นๆ" && (
                            <div className="sm:col-span-1">
                              <label htmlFor="customTitle" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">ระบุคำนำหน้า</label>
                              <input
                                type="text"
                                id="customTitle"
                                value={customTitle}
                                onChange={(e) => setCustomTitle(e.target.value)}
                                placeholder="ระบุเอง..."
                                className="block w-full px-4 py-2 bg-white dark:bg-[#1e1f21] border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
                                required
                              />
                            </div>
                          )}
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                          <div>
                            <label htmlFor="firstName" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">ชื่อ</label>
                            <input
                              type="text"
                              name="firstName"
                              id="firstName"
                              value={user.firstName || ""}
                              onChange={handleInputChange}
                              className="block w-full px-4 py-2 bg-white dark:bg-[#1e1f21] border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
                              required
                            />
                          </div>
                          <div>
                            <label htmlFor="lastName" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">นามสกุล</label>
                            <input
                              type="text"
                              name="lastName"
                              id="lastName"
                              value={user.lastName || ""}
                              onChange={handleInputChange}
                              className="block w-full px-4 py-2 bg-white dark:bg-[#1e1f21] border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
                              required
                            />
                          </div>
                        </div>
                        <div className="relative" ref={dropdownRef}>
                          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">บทบาท</label>
                          <div
                            onClick={() => setIsRoleDropdownOpen(!isRoleDropdownOpen)}
                            className="flex items-center justify-between w-full px-4 py-2 bg-white dark:bg-[#1e1f21] border border-gray-300 dark:border-gray-600 rounded-md shadow-sm cursor-pointer focus:ring-2 focus:ring-indigo-500 transition-all min-h-[42px]"
                          >
                            <div className="flex flex-wrap gap-1">
                              {Array.isArray(user.role) && user.role.length > 0 ? (
                                user.role.map(r => {
                                  const roleLabel = userRoles.find(ur => ur.value === r)?.label || r;
                                  return (
                                    <span key={r} className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-medium bg-indigo-100 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800">
                                      {roleLabel}
                                    </span>
                                  );
                                })
                              ) : (
                                <span className="text-gray-500 dark:text-gray-400 text-sm">-- เลือกบทบาท --</span>
                              )}
                            </div>
                            <FaChevronDown className={`ml-2 text-gray-400 text-[10px] transition-transform duration-200 ${isRoleDropdownOpen ? 'rotate-180' : ''}`} />
                          </div>

                          {isRoleDropdownOpen && (
                            <div className="absolute z-50 mt-1 w-full bg-white dark:bg-[#2a2b2f] border border-gray-200 dark:border-gray-700 rounded-lg shadow-xl py-1 max-h-60 overflow-auto animate-in fade-in zoom-in duration-200">
                              {userRoles.filter(r => !isSchoolAdmin || r.value !== 'super_admin').map((role) => {
                                const isChecked = Array.isArray(user.role)
                                  ? user.role.includes(role.value)
                                  : user.role === role.value;

                                return (
                                  <div
                                    key={role.value}
                                    onClick={() => handleRoleToggle(role.value)}
                                    className="flex items-center px-4 py-2.5 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors cursor-pointer group"
                                  >
                                    <div className={`w-4 h-4 rounded border mr-3 flex items-center justify-center transition-all ${isChecked
                                      ? 'bg-indigo-600 border-indigo-600 text-white'
                                      : 'bg-white dark:bg-gray-800 border-gray-300 dark:border-gray-600 group-hover:border-indigo-400'
                                      }`}>
                                      {isChecked && <FaCheck size={8} />}
                                    </div>
                                    <span className={`text-sm ${isChecked ? 'font-semibold text-indigo-600 dark:text-indigo-400' : 'text-gray-700 dark:text-gray-300'}`}>
                                      {role.label}
                                    </span>
                                  </div>
                                );
                              })}
                            </div>
                          )}
                        </div>
                        <div>
                          <label htmlFor="schoolId" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">โรงเรียน</label>
                          <div className="flex gap-2">
                            <select
                              id="schoolId"
                              name="schoolId"
                              value={user.schoolId || ''}
                              onChange={handleInputChange}
                              disabled={isSchoolAdmin || isTeacher}
                              className={`block w-full px-4 py-2 bg-white dark:bg-[#1e1f21] border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm ${isSchoolAdmin || isTeacher ? 'opacity-70 cursor-not-allowed' : ''}`}
                            >
                              <option value="">-- ไม่ได้กำหนด --</option>
                              {schools.map(school => <option key={school.id} value={school.id}>{school.schoolName}</option>)}
                            </select>
                            {(!isSchoolAdmin && !isTeacher) && (
                              <Link to="/owner/school-info" className="flex-shrink-0 px-3 py-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-700 transition-colors flex items-center justify-center" title="เพิ่มโรงเรียนใหม่">
                                <FaPlus />
                              </Link>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* --- Security Tab --- */}
                  {activeTab === 'security' && (
                    <div className="p-6 sm:p-8">
                      <h2 className="text-lg font-semibold mb-2">บัญชีและความปลอดภัย</h2>
                      <p className="text-sm text-gray-500 dark:text-gray-400 mb-6">จัดการการเข้าถึงบัญชีของผู้ใช้</p>
                      <div className="space-y-6">
                        <div className="flex items-start p-4 bg-gray-50 dark:bg-gray-800/50 rounded-lg">
                          <div className="flex-shrink-0 h-6 flex items-center text-gray-400"><FaEnvelope /></div>
                          <div className="ml-3 text-sm">
                            <p className="font-medium text-gray-800 dark:text-gray-200">อีเมล</p>
                            <p className="text-gray-500 dark:text-gray-400">{user.email}</p>
                          </div>
                        </div>
                        <div className="flex items-start p-4 bg-gray-50 dark:bg-gray-800/50 rounded-lg">
                          <div className="flex-shrink-0 h-6 flex items-center text-gray-400"><FaKey /></div>
                          <div className="ml-3 text-sm">
                            <p className="font-medium text-gray-800 dark:text-gray-200">รหัสผ่าน</p>
                            <button type="button" onClick={handlePasswordReset} className="text-indigo-600 hover:text-indigo-500 dark:text-indigo-400 dark:hover:text-indigo-300 font-medium">
                              ส่งอีเมลรีเซ็ตรหัสผ่าน
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* --- Action Buttons --- */}
                  <div className="p-6 bg-gray-50 dark:bg-[#2a2b2f]/40 rounded-b-2xl flex justify-end gap-3">
                    <button
                      type="button"
                      onClick={() => navigate('/owner/users')}
                      className="px-4 py-2 bg-gray-200 text-gray-800 rounded-md hover:bg-gray-300 dark:bg-gray-700 dark:text-gray-200 dark:hover:bg-gray-600 flex items-center gap-2"
                    >
                      <FaTimes />
                      <span>ยกเลิก</span>
                    </button>
                    <button
                      type="submit"
                      disabled={isSaving}
                      className="px-4 py-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-700 disabled:bg-indigo-400 disabled:cursor-not-allowed flex items-center gap-2"
                    >
                      <FaSave />
                      <span>{isSaving ? 'กำลังบันทึก...' : 'บันทึกการเปลี่ยนแปลง'}</span>
                    </button>
                  </div>
                </div>
              </form>
            </main>
          </div>
        </div>
      </div>
    </MainLayout>
  );
};

export default EditUserPage;