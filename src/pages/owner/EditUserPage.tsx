import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { usePermissions } from "@/hooks/usePermissions";
import { firestore, storage, auth } from '@/firebase';
import { sendPasswordResetEmail } from 'firebase/auth';
import { doc, getDoc, updateDoc, collection, getDocs, setDoc, serverTimestamp, deleteDoc } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { getFunctions, httpsCallable } from 'firebase/functions';
import MainLayout from '@/layouts/MainLayout';
import ProfileAvatar from '@/components/Shared/ProfileAvatar';
import Swal from 'sweetalert2';
import { FaSave, FaTimes, FaKey, FaEnvelope, FaUser, FaShieldAlt, FaArrowLeft, FaPlus, FaCamera, FaChevronDown, FaCheck, FaUserPlus } from 'react-icons/fa';
import { compressImage } from '@/utils/imageUtils';
import {
  isActiveStudentSummaryStatus,
  isActiveTeacherSummaryStatus,
  updateOwnerAndSchoolCounts,
} from '@/utils/ownerStatsUtils';
import { ROLES } from '@/constants/roles';

interface User {
  fullName: string;
  firstName?: string;
  lastName?: string;
  title?: string;
  email: string;
  role: string | string[];
  schoolId?: string;
  profileUrl?: string;
  department?: string;
}

interface School {
  id: string;
  schoolName: string;
}

const initialTitles = ["นาย", "นาง", "นางสาว", "ครู", "อาจารย์", "ดร.", "พระ", "พระสามเณร", "พระมหา", "พระครู", "พระใบฎีกา", "หลวงพ่อ", "พระอาจารย์", "บาทหลวง", "ซิสเตอร์", "บราเดอร์", "อื่นๆ"];
const departmentOptions = [
  "งานบริหารวิชาการ",
  "งานบริหารงบประมาณ",
  "งานบริหารบุคคล",
  "งานบริหารทั่วไป",
  "งานบริหารกิจการนักเรียน",
  "ฝ่ายบริหาร"
];

const STAFF_ROLES: string[] = [
  ROLES.TEACHER,
  ROLES.SCHOOL_ADMIN,
  ROLES.ACADEMIC_ADMIN,
  ROLES.STUDENT_AFFAIRS,
  ROLES.SUPER_ADMIN,
  ROLES.STUDENT_ATTENDANCE,
  ROLES.TEACHER_ATTENDANCE,
  ROLES.SCHOOL_ATTENDANCE,
];

const EditUserPage: React.FC = () => {
  const { userId } = useParams<{ userId: string }>();
  const navigate = useNavigate();
  const { user: currentUser, isSchoolAdmin, isTeacher } = usePermissions();
  const [user, setUser] = useState<User | null>(null);
  const [originalUser, setOriginalUser] = useState<User | null>(null);
  const [schools, setSchools] = useState<School[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'profile' | 'security'>('profile');
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [isRoleDropdownOpen, setIsRoleDropdownOpen] = useState(false);
  const [customTitle, setCustomTitle] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [isChangingPassword, setIsChangingPassword] = useState(false);
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

        // Fetch department from teacher document if schoolId exists
        if (userData.schoolId) {
          const roles = Array.isArray(userData.role) ? userData.role : [userData.role];
          const isStaff = roles.some(r => STAFF_ROLES.includes(r));
          if (isStaff) {
            const teacherDocRef = doc(firestore, "school-settings", userData.schoolId, "teachers", userId);
            const teacherSnap = await getDoc(teacherDocRef);
            if (teacherSnap.exists()) {
              userData.department = teacherSnap.data().department || "งานบริหารทั่วไป";
            } else {
              userData.department = "งานบริหารทั่วไป";
            }
          }
        }

        setUser(userData);
        setOriginalUser({ ...userData, role: Array.isArray(userData.role) ? [...userData.role] : userData.role });
        
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
        const compressedFile = await compressImage(file, 800, 0.8, 'image/jpeg');
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
    if (!user || !user.email) {
      Swal.fire("แจ้งเตือน", "ผู้ใช้นี้ไม่มีข้อมูลอีเมลในระบบ", "warning");
      return;
    }

    const result = await Swal.fire({
      title: 'ยืนยันการส่งอีเมลรีเซ็ตรหัสผ่าน',
      text: `คุณต้องการส่งอีเมลสำหรับรีเซ็ตรหัสผ่านไปยัง ${user.email} ใช่หรือไม่?`,
      icon: 'question',
      showCancelButton: true,
      confirmButtonText: 'ใช่, ส่งเลย',
      cancelButtonText: 'ยกเลิก',
      confirmButtonColor: '#3085d6',
      cancelButtonColor: '#d33',
    });

    if (result.isConfirmed) {
      try {
        await sendPasswordResetEmail(auth, user.email);
        Swal.fire({
          icon: 'success',
          title: 'ส่งอีเมลสำเร็จ',
          text: `ระบบได้ส่งลิงก์สำหรับตั้งรหัสผ่านใหม่ไปยังอีเมล ${user.email} เรียบร้อยแล้ว`,
        });
      } catch (error: any) {
        console.error("Error sending password reset email:", error);
        const errorMessage = error.code === 'auth/user-not-found' ? "ไม่พบผู้ใช้นี้ในระบบ Authentication" : "เกิดข้อผิดพลาดในการส่งอีเมล";
        Swal.fire('เกิดข้อผิดพลาด', errorMessage, 'error');
      }
    }
  };

  const handleDirectPasswordChange = async () => {
    if (!userId || !newPassword || newPassword.length < 6) return;

    const result = await Swal.fire({
      title: 'ยืนยันการเปลี่ยนรหัสผ่าน',
      text: `คุณแน่ใจหรือไม่ว่าต้องการเปลี่ยนรหัสผ่านของผู้ใช้นี้โดยตรง?`,
      icon: 'warning',
      showCancelButton: true,
      confirmButtonText: 'ยืนยันเปลี่ยนรหัสผ่าน',
      cancelButtonText: 'ยกเลิก',
      confirmButtonColor: '#4f46e5',
      cancelButtonColor: '#6b7280',
    });

    if (!result.isConfirmed) return;

    setIsChangingPassword(true);
    try {
      Swal.fire({
        title: 'กำลังเปลี่ยนรหัสผ่าน...',
        text: 'กรุณารอสักครู่ ระบบกำลังปรับปรุงรหัสผ่านใหม่',
        allowOutsideClick: false,
        didOpen: () => {
          Swal.showLoading();
        }
      });

      const functions = getFunctions();
      const updateUserPasswordCallable = httpsCallable(functions, 'updateUserPassword');
      await updateUserPasswordCallable({ userId: userId, password: newPassword });

      setIsChangingPassword(false);
      setNewPassword("");
      Swal.fire({
        icon: 'success',
        title: 'เปลี่ยนรหัสผ่านสำเร็จ',
        text: 'รหัสผ่านใหม่ได้รับการปรับปรุงเรียบร้อยแล้ว!',
        confirmButtonColor: '#4f46e5',
      });
    } catch (err: any) {
      console.error("Error changing password:", err);
      setIsChangingPassword(false);
      Swal.fire({
        icon: 'error',
        title: 'พบข้อผิดพลาด',
        text: err.message || 'ไม่สามารถเปลี่ยนรหัสผ่านได้ในขณะนี้',
        confirmButtonColor: '#4f46e5',
      });
    }
  };

  const hasStaffRole = (roles: string[]) => {
    return roles.some(r => STAFF_ROLES.includes(r));
  };

  const deleteTeacherDocIfActive = async (schoolId: string, uid: string) => {
    if (!schoolId || !uid) return;
    const teacherRef = doc(firestore, "school-settings", schoolId, "teachers", uid);
    const teacherSnap = await getDoc(teacherRef);
    if (!teacherSnap.exists()) return;

    const teacherData = teacherSnap.data();
    await deleteDoc(teacherRef);
    if (isActiveTeacherSummaryStatus(teacherData.status || "อยู่")) {
      await updateOwnerAndSchoolCounts(firestore, schoolId, { teachers: -1 });
    }
  };

  const deleteStaleTeacherDocs = async (uid: string, targetSchoolId: string, knownSchoolIds: string[] = []) => {
    if (!uid) return;
    const staleSchoolIds = new Set<string>();

    knownSchoolIds.forEach((schoolId) => {
      if (schoolId && schoolId !== targetSchoolId) {
        staleSchoolIds.add(schoolId);
      }
    });

    schools.forEach((school) => {
      if (school.id && school.id !== targetSchoolId) {
        staleSchoolIds.add(school.id);
      }
    });

    for (const schoolId of staleSchoolIds) {
      await deleteTeacherDocIfActive(schoolId, uid);
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!userId || !user) return;

    const result = await Swal.fire({
      title: 'ยืนยันการแก้ไขข้อมูล',
      text: "คุณต้องการบันทึกการเปลี่ยนแปลงข้อมูลผู้ใช้นี้ใช่หรือไม่?",
      icon: 'question',
      showCancelButton: true,
      confirmButtonText: 'ยืนยันการแก้ไข',
      cancelButtonText: 'ยกเลิก',
      confirmButtonColor: '#4f46e5',
      cancelButtonColor: '#6b7280',
      reverseButtons: true,
    });

    if (!result.isConfirmed) return;

    setIsSaving(true);
    try {
      // If email has changed, update it in Firebase Auth first via Cloud Function
      if (user.email !== originalUser?.email) {
        Swal.fire({
          title: 'กำลังอัปเดตอีเมล...',
          text: 'กำลังบันทึกอีเมลใหม่ใน Firebase Auth และระบบส่วนกลาง',
          allowOutsideClick: false,
          didOpen: () => {
            Swal.showLoading();
          }
        });

        const functions = getFunctions();
        const updateUserEmailCallable = httpsCallable(functions, 'updateUserEmail');
        await updateUserEmailCallable({ userId: userId, email: user.email });
      }

      let profileUrl = user.profileUrl;
      const finalTitle = user.title === "อื่นๆ" ? customTitle : user.title;
      const fullName = `${finalTitle}${user.firstName} ${user.lastName}`.trim();

      if (imageFile) {
        const storageRef = ref(storage, `users/${userId}/profile_${Date.now()}.jpg`);
        const snapshot = await uploadBytes(storageRef, imageFile);
        profileUrl = await getDownloadURL(snapshot.ref);
      }

      // 1. Update central 'users' collection
      const userData = {
        fullName: fullName,
        firstName: user.firstName || null,
        lastName: user.lastName || null,
        title: finalTitle || null,
        email: user.email,
        role: user.role,
        schoolId: user.schoolId || null,
        profileUrl: profileUrl || null,
        updatedAt: serverTimestamp(),
      };
      await updateDoc(doc(firestore, 'users', userId), userData);

      // 2. Update school-specific collections if applicable
      const roles = Array.isArray(user.role) ? user.role : [user.role];
      const previousRoles = originalUser
        ? (Array.isArray(originalUser.role) ? originalUser.role : [originalUser.role])
        : [];
      const previousSchoolId = originalUser?.schoolId || "";
      if (user.schoolId) {
        const isStaff = hasStaffRole(roles);
        const isStudent = roles.includes(ROLES.STUDENT);

        if (isStaff) {
          const teacherDocRef = doc(firestore, "school-settings", user.schoolId, "teachers", userId);
          const teacherSnap = await getDoc(teacherDocRef);
          const oldTeacherDocRef = previousSchoolId
            ? doc(firestore, "school-settings", previousSchoolId, "teachers", userId)
            : null;
          const oldTeacherSnap = oldTeacherDocRef && previousSchoolId !== user.schoolId
            ? await getDoc(oldTeacherDocRef)
            : teacherSnap;
          const sourceTeacherData = oldTeacherSnap.exists()
            ? oldTeacherSnap.data()
            : (teacherSnap.exists() ? teacherSnap.data() : {});
          
          const teacherData = {
            ...sourceTeacherData,
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
            position: sourceTeacherData.position 
              ? sourceTeacherData.position
              : (roles.includes(ROLES.SUPER_ADMIN)
                ? "ผู้ดูแลระบบสูงสุด"
                : roles.includes(ROLES.SCHOOL_ADMIN)
                  ? "ผู้ดูแลระบบโรงเรียน"
                  : roles.includes(ROLES.ACADEMIC_ADMIN)
                    ? "ผู้ดูแลระบบงานวิชาการ"
                    : roles.includes(ROLES.STUDENT_AFFAIRS)
                      ? "เจ้าหน้าที่งานกิจการนักเรียน"
                      : roles.includes(ROLES.STUDENT_ATTENDANCE)
                        ? "เจ้าหน้าที่ลงเวลานักเรียน"
                        : roles.includes(ROLES.TEACHER_ATTENDANCE)
                          ? "เจ้าหน้าที่ลงเวลาครู"
                          : roles.includes(ROLES.SCHOOL_ATTENDANCE)
                            ? "เจ้าหน้าที่ลงเวลาทั้งโรงเรียน"
                            : "ครู"),
            department: user.department || "งานบริหารทั่วไป",
            status: sourceTeacherData.status || "อยู่",
            isHomeroomTeacher: sourceTeacherData.isHomeroomTeacher || false,
            gender: sourceTeacherData.gender || "",
            learningArea: sourceTeacherData.learningArea || "",
            subjectGroup: sourceTeacherData.subjectGroup || "",
          };
          
          await setDoc(teacherDocRef, teacherData, { merge: true });
          await deleteStaleTeacherDocs(userId, user.schoolId, previousSchoolId ? [previousSchoolId] : []);
          if (!teacherSnap.exists() && isActiveTeacherSummaryStatus(teacherData.status)) {
            await updateOwnerAndSchoolCounts(firestore, user.schoolId, { teachers: 1 });
          }
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
            studentStatus: studentSnap.exists() ? (studentSnap.data().studentStatus || "กำลังศึกษาอยู่") : "กำลังศึกษาอยู่",
            gender: studentSnap.exists() ? (studentSnap.data().gender || "") : "",
          };

          await setDoc(studentDocRef, studentData, { merge: true });
          if (!studentSnap.exists() && isActiveStudentSummaryStatus(studentData.studentStatus)) {
            await updateOwnerAndSchoolCounts(firestore, user.schoolId, { students: 1 });
          }
        }
      } else if (hasStaffRole(roles)) {
        await deleteStaleTeacherDocs(userId, "", previousSchoolId ? [previousSchoolId] : []);
      }

      if (previousSchoolId && hasStaffRole(previousRoles) && !hasStaffRole(roles)) {
        await deleteStaleTeacherDocs(userId, "", [previousSchoolId]);
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
        text: 'ข้อมูลผู้ใช้ได้รับการอัปเดตเรียบร้อยแล้ว',
        timer: 2000,
        showConfirmButton: false,
      });
      navigate('/owner/users');
    } catch (err: any) {
      console.error("Error updating user:", err);
      Swal.fire({
        icon: 'error',
        title: 'พบข้อผิดพลาด',
        text: err.message || 'ไม่สามารถบันทึกข้อมูลได้ในขณะนี้',
        confirmButtonColor: '#4f46e5',
      });
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
    { value: ROLES.SUPER_ADMIN, label: 'ผู้ดูแลระบบสูงสุด (Super Admin)' },
    { value: ROLES.SCHOOL_ADMIN, label: 'ผู้ดูแลระบบโรงเรียน (School Admin)' },
    { value: ROLES.ACADEMIC_ADMIN, label: 'ผู้ดูแลระบบงานวิชาการ (Academic Admin)' },
    { value: ROLES.STUDENT_AFFAIRS, label: 'งานกิจการนักเรียน (Student Affairs)' },
    { value: ROLES.TEACHER, label: 'ครูผู้สอน (Teacher)' },
    { value: ROLES.STUDENT_ATTENDANCE, label: 'ลงเวลานักเรียน (Student Attendance)' },
    { value: ROLES.TEACHER_ATTENDANCE, label: 'ลงเวลาครู (Teacher Attendance)' },
    { value: ROLES.SCHOOL_ATTENDANCE, label: 'ลงเวลาทั้งโรงเรียน (School Attendance)' },
    { value: ROLES.STUDENT, label: 'นักเรียน (Student)' },
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
                              <ProfileAvatar
                                className="h-24 w-24 border-4 border-white dark:border-gray-700 shadow-md"
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
                                accept="image/jpeg,image/png"
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
                              {userRoles.filter(r => !isSchoolAdmin || r.value !== ROLES.SUPER_ADMIN).map((role) => {
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
                              disabled={isSchoolAdmin}
                              className={`block w-full px-4 py-2 bg-white dark:bg-[#1e1f21] border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm ${isSchoolAdmin ? 'opacity-70 cursor-not-allowed' : ''}`}
                            >
                              <option value="">-- ไม่ได้กำหนด --</option>
                              {schools.map(school => <option key={school.id} value={school.id}>{school.schoolName}</option>)}
                            </select>
                            {!isSchoolAdmin && (
                              <Link to="/owner/school-info" className="flex-shrink-0 px-3 py-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-700 transition-colors flex items-center justify-center" title="เพิ่มโรงเรียนใหม่">
                                <FaPlus />
                              </Link>
                            )}
                          </div>
                        </div>

                        {/* Department Selection */}
                        {(Array.isArray(user.role) ? user.role : [user.role]).some(r => STAFF_ROLES.includes(r)) && (
                          <div className="animate-in fade-in slide-in-from-top-2 duration-300">
                            <label htmlFor="department" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">ฝ่ายงาน</label>
                            <select
                              id="department"
                              name="department"
                              value={user.department || "งานบริหารทั่วไป"}
                              onChange={handleInputChange}
                              className="block w-full px-4 py-2 bg-white dark:bg-[#1e1f21] border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
                            >
                              {departmentOptions.map(dept => (
                                <option key={dept} value={dept}>{dept}</option>
                              ))}
                            </select>
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  {/* --- Security Tab --- */}
                  {activeTab === 'security' && (
                    <div className="p-6 sm:p-8">
                      <h2 className="text-lg font-semibold mb-2">บัญชีและความปลอดภัย</h2>
                      <p className="text-sm text-gray-500 dark:text-gray-400 mb-6">จัดการการเข้าถึงบัญชีของผู้ใช้</p>
                      <div className="space-y-6">
                        <div className="flex flex-col p-4 bg-gray-50 dark:bg-gray-800/50 rounded-lg">
                          <div className="flex items-center">
                            <div className="flex-shrink-0 h-6 flex items-center text-gray-400"><FaEnvelope /></div>
                            <div className="ml-3 text-sm flex-grow">
                              <label htmlFor="email" className="block font-medium text-gray-800 dark:text-gray-200 mb-2">อีเมล (สำหรับเข้าสู่ระบบ)</label>
                              <input
                                type="email"
                                name="email"
                                id="email"
                                value={user.email || ""}
                                onChange={handleInputChange}
                                className="block w-full max-w-md px-4 py-2 bg-white dark:bg-[#1e1f21] border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm text-gray-900 dark:text-white"
                                required
                              />
                            </div>
                          </div>
                        </div>
                        <div className="flex flex-col p-4 bg-gray-50 dark:bg-gray-800/50 rounded-lg">
                          <div className="flex items-start">
                            <div className="flex-shrink-0 h-6 flex items-center text-gray-400"><FaKey /></div>
                            <div className="ml-3 text-sm flex-grow">
                              <label className="block font-medium text-gray-800 dark:text-gray-200 mb-2">
                                ตั้งค่ารหัสผ่านใหม่โดยตรง (Direct Password Change)
                              </label>
                              <div className="flex flex-col sm:flex-row gap-2 max-w-md">
                                <input
                                  type="text"
                                  placeholder="ป้อนรหัสผ่านใหม่ (อย่างน้อย 6 ตัวอักษร)"
                                  value={newPassword}
                                  onChange={(e) => setNewPassword(e.target.value)}
                                  className="block w-full px-4 py-2 bg-white dark:bg-[#1e1f21] border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm text-gray-900 dark:text-white"
                                />
                                <button
                                  type="button"
                                  onClick={handleDirectPasswordChange}
                                  disabled={isChangingPassword || newPassword.length < 6}
                                  className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-md disabled:bg-indigo-400 disabled:dark:bg-indigo-800/50 disabled:text-gray-200 disabled:cursor-not-allowed flex items-center justify-center gap-1 font-medium whitespace-nowrap transition-colors"
                                >
                                  {isChangingPassword ? "กำลังเปลี่ยน..." : "เปลี่ยนรหัสผ่าน"}
                                </button>
                              </div>
                              <p className="mt-1.5 text-xs text-gray-500 dark:text-gray-400">
                                * รหัสผ่านใหม่จะมีผลทันทีและใช้ลงชื่อเข้าใช้งานได้โดยตรง
                              </p>
                            </div>
                          </div>
                        </div>
                        <div className="flex items-start p-4 bg-gray-50 dark:bg-gray-800/50 rounded-lg">
                          <div className="flex-shrink-0 h-6 flex items-center text-gray-400"><FaKey /></div>
                          <div className="ml-3 text-sm">
                            <p className="font-medium text-gray-800 dark:text-gray-200">ส่งลิงก์รีเซ็ตรหัสผ่านทางอีเมล</p>
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
