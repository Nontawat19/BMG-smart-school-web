import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { usePermissions } from "@/hooks/usePermissions";
import { auth, firestore, storage } from '@/firebase';
import { initializeApp, deleteApp } from 'firebase/app';
import { getAuth, createUserWithEmailAndPassword } from 'firebase/auth';
import { doc, setDoc, serverTimestamp, collection, getDocs } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import MainLayout from '@/layouts/MainLayout';
import ProfileAvatar from '@/components/Shared/ProfileAvatar';
import Swal from 'sweetalert2';
import { FaSave, FaTimes, FaUserPlus, FaEnvelope, FaUser, FaShieldAlt, FaArrowLeft, FaCamera, FaChevronDown, FaCheck, FaLock, FaSchool, FaSearch } from 'react-icons/fa';
import { compressImage } from '@/utils/imageUtils';
import {
    isActiveStudentSummaryStatus,
    isActiveTeacherSummaryStatus,
    updateOwnerAndSchoolCounts,
} from '@/utils/ownerStatsUtils';
import { ROLES } from '@/constants/roles';

interface School {
    id: string;
    schoolName: string;
    schoolCode?: string;
}

const departmentOptions = [
    "งานบริหารวิชาการ",
    "งานบริหารงบประมาณ",
    "งานบริหารบุคคล",
    "งานบริหารทั่วไป",
    "งานบริหารกิจการนักเรียน"
];

const STAFF_ROLES: string[] = [
    ROLES.TEACHER,
    ROLES.SCHOOL_ADMIN,
    ROLES.ACADEMIC_ADMIN,
    ROLES.SUPER_ADMIN,
    ROLES.STUDENT_ATTENDANCE,
    ROLES.TEACHER_ATTENDANCE,
    ROLES.SCHOOL_ATTENDANCE,
];

const AddUserPage = () => {
    const navigate = useNavigate();
    const { user: currentUser, isSchoolAdmin, isTeacher } = usePermissions();
    const [formData, setFormData] = useState({
        title: '',
        firstName: '',
        lastName: '',
        email: '',
        password: '',
        confirmPassword: '',
        role: ['teacher'] as string[],
        schoolId: '',
        department: 'งานบริหารทั่วไป',
    });
    const [customTitle, setCustomTitle] = useState("");
    const [schools, setSchools] = useState<School[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [imageFile, setImageFile] = useState<File | null>(null);
    const [imagePreview, setImagePreview] = useState<string | null>(null);
    const [isRoleDropdownOpen, setIsRoleDropdownOpen] = useState(false);
    const [isSchoolDropdownOpen, setIsSchoolDropdownOpen] = useState(false);
    const [schoolSearchTerm, setSchoolSearchTerm] = useState('');
    const [schoolPage, setSchoolPage] = useState(1);
    const [schoolDropdownPlacement, setSchoolDropdownPlacement] = useState<'bottom' | 'top'>('bottom');
    const [schoolDropdownMaxHeight, setSchoolDropdownMaxHeight] = useState(520);
    const dropdownRef = useRef<HTMLDivElement>(null);
    const schoolDropdownRef = useRef<HTMLDivElement>(null);
    const schoolMenuRef = useRef<HTMLDivElement>(null);
    const schoolsPerPage = 10;

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
                setIsRoleDropdownOpen(false);
            }
            if (schoolDropdownRef.current && !schoolDropdownRef.current.contains(event.target as Node)) {
                setIsSchoolDropdownOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    useEffect(() => {
        const fetchSchools = async () => {
            try {
                const schoolsCollection = collection(firestore, "school-settings");
                const schoolSnapshot = await getDocs(schoolsCollection);
                const schoolsData = schoolSnapshot.docs.map(doc => ({
                    id: doc.id,
                    schoolName: doc.data().schoolName,
                    schoolCode: doc.data().schoolCode || doc.data().schoolId || doc.data().code || doc.id,
                })).sort((a, b) => (a.schoolName || '').localeCompare(b.schoolName || '', 'th'));
                setSchools(schoolsData);
            } catch (err) {
                console.error("Error fetching schools:", err);
            }
        };
        fetchSchools();
    }, []);

    useEffect(() => {
        if ((isSchoolAdmin || isTeacher) && currentUser?.schoolId) {
            setFormData(prev => ({ ...prev, schoolId: currentUser.schoolId || '' }));
        }
    }, [isSchoolAdmin, isTeacher, currentUser]);

    const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
        const { name, value } = e.target;
        if (name === "title" && value !== "อื่นๆ") {
            setCustomTitle("");
        }
        setFormData({ ...formData, [name]: value });
    };

    const handleRoleToggle = (roleValue: string) => {
        const currentRoles = [...formData.role];
        const updatedRoles = currentRoles.includes(roleValue)
            ? currentRoles.filter(r => r !== roleValue)
            : [...currentRoles, roleValue];
        setFormData({ ...formData, role: updatedRoles });
    };

    const selectedSchool = useMemo(() => {
        return schools.find(school => school.id === formData.schoolId);
    }, [schools, formData.schoolId]);

    const getSchoolCode = (school: School) => school.schoolCode || school.id;
    const formatSchoolNameWithCode = (school: School) => `${getSchoolCode(school)} - ${school.schoolName || 'ไม่ระบุชื่อโรงเรียน'}`;

    const filteredSchools = useMemo(() => {
        const keyword = schoolSearchTerm.trim().toLowerCase();
        if (!keyword) return schools;

        return schools.filter(school => {
            const name = (school.schoolName || '').toLowerCase();
            const code = (school.schoolCode || '').toLowerCase();
            const id = (school.id || '').toLowerCase();
            return name.includes(keyword) || code.includes(keyword) || id.includes(keyword);
        });
    }, [schools, schoolSearchTerm]);

    const schoolTotalPages = Math.max(1, Math.ceil(filteredSchools.length / schoolsPerPage));
    const currentSchoolPage = Math.min(schoolPage, schoolTotalPages);
    const paginatedSchools = filteredSchools.slice(
        (currentSchoolPage - 1) * schoolsPerPage,
        currentSchoolPage * schoolsPerPage
    );

    useEffect(() => {
        setSchoolPage(1);
    }, [schoolSearchTerm]);

    useEffect(() => {
        if (schoolPage > schoolTotalPages) {
            setSchoolPage(schoolTotalPages);
        }
    }, [schoolPage, schoolTotalPages]);

    useEffect(() => {
        if (!isSchoolDropdownOpen) return;

        const updateSchoolDropdownPosition = () => {
            const wrapper = schoolDropdownRef.current;
            if (!wrapper) return;

            const rect = wrapper.getBoundingClientRect();
            const viewportHeight = window.innerHeight;
            const gap = 12;
            const spaceBelow = viewportHeight - rect.bottom - gap;
            const spaceAbove = rect.top - gap;
            const shouldOpenUp = spaceBelow < 460 && spaceAbove > spaceBelow;
            const availableSpace = shouldOpenUp ? spaceAbove : spaceBelow;

            setSchoolDropdownPlacement(shouldOpenUp ? 'top' : 'bottom');
            setSchoolDropdownMaxHeight(Math.max(220, Math.min(520, Math.floor(availableSpace))));
        };

        const frame = window.requestAnimationFrame(updateSchoolDropdownPosition);
        window.addEventListener('resize', updateSchoolDropdownPosition);
        window.addEventListener('scroll', updateSchoolDropdownPosition, true);

        return () => {
            window.cancelAnimationFrame(frame);
            window.removeEventListener('resize', updateSchoolDropdownPosition);
            window.removeEventListener('scroll', updateSchoolDropdownPosition, true);
        };
    }, [isSchoolDropdownOpen, schoolSearchTerm, currentSchoolPage, schoolTotalPages]);

    const visibleSchoolPages = useMemo(() => {
        const maxVisible = 5;
        const half = Math.floor(maxVisible / 2);
        let start = Math.max(1, currentSchoolPage - half);
        const end = Math.min(schoolTotalPages, start + maxVisible - 1);
        start = Math.max(1, end - maxVisible + 1);

        return Array.from({ length: end - start + 1 }, (_, index) => start + index);
    }, [currentSchoolPage, schoolTotalPages]);

    const handleSchoolSelect = (schoolId: string) => {
        setFormData(prev => ({ ...prev, schoolId }));
        setIsSchoolDropdownOpen(false);
    };

    const handleImageChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files[0]) {
            const file = e.target.files[0];
            try {
                const compressedFile = await compressImage(file, 800, 0.8, 'image/jpeg');
                setImageFile(compressedFile);
                setImagePreview(URL.createObjectURL(compressedFile));
            } catch (error) {
                setImageFile(file);
                setImagePreview(URL.createObjectURL(file));
            }
        }
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (formData.password !== formData.confirmPassword) {
            Swal.fire({
                icon: 'error',
                title: 'รหัสผ่านไม่ตรงกัน',
                text: 'กรุณาตรวจสอบและกรอกรหัสผ่านให้ตรงกันอีกครั้ง',
                confirmButtonColor: '#4f46e5',
            });
            return;
        }

        const result = await Swal.fire({
            title: 'ยืนยันการเพิ่มผู้ใช้',
            text: "ระบบจะทำการลงทะเบียนผู้ใช้ใหม่เข้าสู่ฐานข้อมูล ต้องการดำเนินการต่อหรือไม่?",
            icon: 'question',
            showCancelButton: true,
            confirmButtonText: 'ยืนยันและเพิ่มข้อมูล',
            cancelButtonText: 'ตั้งหลักก่อน',
            confirmButtonColor: '#4f46e5',
            cancelButtonColor: '#6b7280',
            reverseButtons: true,
            customClass: {
                popup: 'rounded-2xl',
                confirmButton: 'rounded-xl px-6 py-2.5 font-bold',
                cancelButton: 'rounded-xl px-6 py-2.5 font-bold'
            }
        });

        if (!result.isConfirmed) return;

        setIsLoading(true);
        const secondaryApp = initializeApp(auth.app.options, `AddUser-${Date.now()}`);

        try {
            const secondaryAuth = getAuth(secondaryApp);
            const userCredential = await createUserWithEmailAndPassword(secondaryAuth, formData.email, formData.password);
            const newUser = userCredential.user;

            let profileUrl = '';
            const finalTitle = formData.title === "อื่นๆ" ? customTitle : formData.title;
            const fullName = `${finalTitle}${formData.firstName} ${formData.lastName}`.trim();

            if (imageFile) {
                const storageRef = ref(storage, `users/${newUser.uid}/profile_${Date.now()}.jpg`);
                const snapshot = await uploadBytes(storageRef, imageFile);
                profileUrl = await getDownloadURL(snapshot.ref);
            }

            // 1. Write to central 'users' collection
            const userData = {
                uid: newUser.uid,
                fullName: fullName,
                firstName: formData.firstName,
                lastName: formData.lastName,
                title: finalTitle,
                email: formData.email,
                role: formData.role,
                schoolId: formData.schoolId || null,
                profileUrl: profileUrl || null,
                createdAt: serverTimestamp(),
            };
            await setDoc(doc(firestore, 'users', newUser.uid), userData);

            // 2. Write to school-specific collections if applicable
            if (formData.schoolId) {
                const roles = formData.role;
                const isStaff = roles.some(r => STAFF_ROLES.includes(r));
                const isStudent = roles.includes(ROLES.STUDENT);

                // Sync to Teachers collection
                if (isStaff) {
                    const teacherData = {
                        uid: newUser.uid,
                        firstName: formData.firstName,
                        lastName: formData.lastName,
                        title: finalTitle,
                        email: formData.email,
                        role: formData.role,
                        schoolId: formData.schoolId,
                        profileImageUrl: profileUrl || null, // ProfilePage expects profileImageUrl
                        teacherId: "", // Default empty
                        position: roles.includes(ROLES.SUPER_ADMIN)
                            ? "ผู้ดูแลระบบสูงสุด"
                            : roles.includes(ROLES.SCHOOL_ADMIN)
                                ? "ผู้ดูแลระบบโรงเรียน"
                                : roles.includes(ROLES.ACADEMIC_ADMIN)
                                    ? "ผู้ดูแลระบบงานวิชาการ"
                                    : roles.includes(ROLES.STUDENT_ATTENDANCE)
                                        ? "เจ้าหน้าที่ลงเวลานักเรียน"
                                        : roles.includes(ROLES.TEACHER_ATTENDANCE)
                                            ? "เจ้าหน้าที่ลงเวลาครู"
                                            : roles.includes(ROLES.SCHOOL_ATTENDANCE)
                                                ? "เจ้าหน้าที่ลงเวลาทั้งโรงเรียน"
                                                : "ครู",
                        department: formData.department || "งานบริหารทั่วไป",
                        status: "อยู่",
                        gender: "", // Basic info
                        learningArea: "",
                        subjectGroup: "",
                        isHomeroomTeacher: false,
                        createdAt: serverTimestamp(),
                    };
                    await setDoc(doc(firestore, "school-settings", formData.schoolId, "teachers", newUser.uid), teacherData);
                    if (isActiveTeacherSummaryStatus(teacherData.status)) {
                        await updateOwnerAndSchoolCounts(firestore, formData.schoolId, { teachers: 1 });
                    }
                }

                // Sync to Students collection
                if (isStudent) {
                    const studentData = {
                        uid: newUser.uid,
                        firstName: formData.firstName,
                        lastName: formData.lastName,
                        title: finalTitle,
                        email: formData.email,
                        role: formData.role,
                        schoolId: formData.schoolId,
                        profileImageUrl: profileUrl || null,
                        studentId: "", // Default empty
                        classLevel: "",
                        room: "",
                        studentStatus: "ปกติ",
                        gender: "",
                        createdAt: serverTimestamp(),
                    };
                    await setDoc(doc(firestore, "school-settings", formData.schoolId, "students", newUser.uid), studentData);
                    if (isActiveStudentSummaryStatus(studentData.studentStatus)) {
                        await updateOwnerAndSchoolCounts(firestore, formData.schoolId, { students: 1 });
                    }
                }
            }

            // 📌 Create Slug for the Profile
            const slugId = `profile:${newUser.uid}`;
            await setDoc(doc(firestore, 'slugs', slugId), {
                slug: slugId,
                targetId: newUser.uid,
                targetType: 'profile',
                schoolId: formData.schoolId || null,
                fullPath: '/profile',
                updatedAt: serverTimestamp()
            }, { merge: true });

            // 📌 Optional: Create specific role slugs (student/teacher) if needed
            for (const role of formData.role) {
                if (['student', 'teacher'].includes(role)) {
                    const roleSlugId = `${role}:${newUser.uid}`;
                    await setDoc(doc(firestore, 'slugs', roleSlugId), {
                        slug: roleSlugId,
                        targetId: newUser.uid,
                        targetType: role,
                        schoolId: formData.schoolId || null,
                        fullPath: `/${role}`,
                        updatedAt: serverTimestamp()
                    }, { merge: true });
                }
            }

            await Swal.fire({
                icon: 'success',
                title: 'สร้างบัญชีผู้ใช้สำเร็จ',
                text: 'บัญชีผู้ใช้ใหม่ถูกสร้างและพร้อมใช้งานเรียบร้อยแล้ว',
                confirmButtonColor: '#4f46e5',
            });

            navigate('/owner/users');
        } catch (err: any) {
            console.error("Error creating user:", err);
            Swal.fire({
                icon: 'error',
                title: 'พบข้อผิดพลาด',
                text: err.message || 'ไม่สามารถสร้างบัญชีผู้ใช้ได้ในขณะนี้',
                confirmButtonColor: '#4f46e5',
            });
        } finally {
            await deleteApp(secondaryApp);
            setIsLoading(false);
        }
    };

    const userRoles = [
        { value: ROLES.SUPER_ADMIN, label: 'ผู้ดูแลสูงสุด (Super Admin)' },
        { value: ROLES.SCHOOL_ADMIN, label: 'แอดมินโรงเรียน (School Admin)' },
        { value: ROLES.ACADEMIC_ADMIN, label: 'ผู้ดูแลระบบงานวิชาการ (Academic Admin)' },
        { value: ROLES.TEACHER, label: 'ครูผู้สอน (Teacher)' },
        { value: ROLES.STUDENT_ATTENDANCE, label: 'ลงเวลานักเรียน (Student Attendance)' },
        { value: ROLES.TEACHER_ATTENDANCE, label: 'ลงเวลาครู (Teacher Attendance)' },
        { value: ROLES.SCHOOL_ATTENDANCE, label: 'ลงเวลาทั้งโรงเรียน (School Attendance)' },
        { value: ROLES.STUDENT, label: 'นักเรียน (Student)' },
    ];

    const inputClasses = "w-full pl-11 pr-4 h-[46px] bg-white dark:bg-[#1c1c24] border border-gray-200 dark:border-gray-700/50 rounded-2xl focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none transition-all text-sm text-gray-900 dark:text-white placeholder:text-gray-400 dark:placeholder:text-gray-600 shadow-sm dark:autofill:shadow-[0_0_0_30px_#1c1c24_inset]";
    const labelClasses = "block text-xs font-black text-gray-500 dark:text-gray-400 uppercase tracking-widest mb-2 ml-1";

    return (
        <MainLayout>
            <div className="min-h-screen bg-gray-50/50 dark:bg-[#14141b] text-gray-900 dark:text-white transition-colors duration-300 pb-12">
                <div className="max-w-5xl mx-auto px-4 py-8">
                    {/* Header Section */}
                    <div className="relative overflow-hidden bg-white dark:bg-[#1c1c24] rounded-2xl p-6 sm:p-10 mb-8 border border-white dark:border-white/5 shadow-xl shadow-gray-200/50 dark:shadow-none transition-all">
                        <div className="absolute top-0 right-0 w-64 h-64 bg-indigo-500/5 blur-[80px] rounded-full -mr-20 -mt-20"></div>
                        <div className="absolute bottom-0 left-0 w-48 h-48 bg-sky-500/5 blur-[60px] rounded-full -ml-16 -mb-16"></div>

                        <div className="relative flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
                            <div className="space-y-2">
                                <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-indigo-50 dark:bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 text-[10px] font-black uppercase tracking-widest">
                                    <FaUserPlus size={10} />
                                    Account Creation
                                </div>
                                <h1 className="text-3xl sm:text-4xl font-black tracking-tight text-gray-900 dark:text-white">
                                    เพิ่มผู้ใช้ <span className="text-indigo-500">ใหม่</span>
                                </h1>
                                <p className="text-sm text-gray-500 dark:text-gray-400 max-w-md font-medium">
                                    สร้างบัญชีผู้ใช้งานระบบ พร้อมกำหนดบทบาทและสิทธิ์การเข้าถึงอย่างแม่นยำ
                                </p>
                            </div>
                            <Link
                                to="/owner/users"
                                className="group inline-flex items-center gap-2.5 px-6 py-3 rounded-2xl bg-gray-100 dark:bg-white/5 text-gray-700 dark:text-gray-300 text-sm font-black transition-all hover:bg-gray-200 dark:hover:bg-white/10 active:scale-95 border border-transparent dark:border-white/5"
                            >
                                <FaArrowLeft className="text-[10px] transition-transform group-hover:-translate-x-1" />
                                กลับหน้ารายการ
                            </Link>
                        </div>
                    </div>

                    <form onSubmit={handleSubmit} className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
                        {/* Profile Card */}
                        <div className="lg:col-span-4 space-y-6 lg:sticky lg:top-24">
                            <div className="bg-white dark:bg-[#1c1c24] rounded-3xl p-8 border border-white dark:border-white/5 shadow-xl shadow-gray-200/50 dark:shadow-none text-center">
                                <div className="relative w-40 h-40 mx-auto group">
                                    <div className="absolute inset-0 bg-indigo-500 rounded-full blur-[20px] opacity-20 group-hover:opacity-40 transition-opacity"></div>
                                    <ProfileAvatar
                                        className="relative w-full h-full border-4 border-white dark:border-gray-800 shadow-2xl z-10"
                                        src={imagePreview || `https://ui-avatars.com/api/?name=New+User&background=4f46e5&color=fff&size=200`}
                                        alt="Preview"
                                    />
                                    <label htmlFor="profile-upload" className="absolute bottom-2 right-2 z-20 bg-indigo-600 text-white p-3.5 rounded-2xl cursor-pointer shadow-xl hover:bg-indigo-700 transition-all hover:scale-110 active:scale-90 ring-4 ring-white dark:ring-gray-800">
                                        <FaCamera size={18} />
                                    </label>
                                    <input id="profile-upload" type="file" className="hidden" accept="image/jpeg,image/png" onChange={handleImageChange} />
                                </div>
                                <div className="mt-8 space-y-2">
                                    <h3 className="text-lg font-black text-gray-900 dark:text-white">ภาพโปรไฟล์</h3>
                                    <p className="text-xs text-gray-400 dark:text-gray-500 font-medium px-4">
                                        เลือกภาพที่ชัดเจนเพื่อระบุตัวตน (รองรับไฟล์ JPG, PNG)
                                    </p>
                                </div>
                            </div>

                            {/* Info Box */}
                            <div className="bg-amber-50 dark:bg-amber-900/10 rounded-2xl p-6 border border-amber-100 dark:border-amber-900/20 space-y-3">
                                <h4 className="inline-flex items-center gap-2 text-xs font-black text-amber-900 dark:text-amber-400 uppercase tracking-widest">
                                    <FaShieldAlt /> ความปลอดภัย
                                </h4>
                                <p className="text-xs text-amber-800/70 dark:text-amber-200/40 leading-relaxed font-medium">
                                    ผู้ดูแลระบบต้องยืนยันข้อมูลให้ถูกต้องก่อนการบันทึก เนื่องจากการลบหรือแก้ไขข้อมูลภายหลังอาจส่งผลต่อการเข้าถึงระบบของผู้ใช้
                                </p>
                            </div>
                        </div>

                        {/* Form Card */}
                        <div className="lg:col-span-8 space-y-8">
                            <div className="bg-white dark:bg-[#1c1c24] rounded-3xl p-8 sm:p-10 border border-white dark:border-white/5 shadow-xl shadow-gray-200/50 dark:shadow-none">
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                                    {/* Name Row */}
                                    <div className="md:col-span-2 grid grid-cols-1 md:grid-cols-4 gap-4">
                                        {/* Title */}
                                        <div>
                                            <label className={labelClasses}>คำนำหน้า <span className="text-red-500">*</span></label>
                                            {formData.title === 'อื่นๆ' ? (
                                                <div className="relative group">
                                                    <input
                                                        type="text"
                                                        value={customTitle}
                                                        onChange={(e) => setCustomTitle(e.target.value)}
                                                        className={inputClasses.replace('pl-11', 'pl-4')}
                                                        placeholder="ระบุ..."
                                                        required
                                                    />
                                                    <button
                                                        type="button"
                                                        onClick={() => {
                                                            setFormData(prev => ({ ...prev, title: '' }));
                                                            setCustomTitle('');
                                                        }}
                                                        className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-red-500 transition-colors"
                                                    >
                                                        <FaTimes size={12} />
                                                    </button>
                                                </div>
                                            ) : (
                                                <div className="relative">
                                                    <select
                                                        name="title"
                                                        value={formData.title}
                                                        onChange={handleInputChange}
                                                        className={inputClasses.replace('pl-11', 'pl-4') + " appearance-none"}
                                                        required
                                                    >
                                                        <option value="">เลือก...</option>
                                                        <option value="นาย">นาย</option>
                                                        <option value="นาง">นาง</option>
                                                        <option value="น.ส.">น.ส.</option>
                                                        <option value="อื่นๆ">อื่นๆ</option>
                                                    </select>
                                                    <div className="absolute inset-y-0 right-0 pr-4 flex items-center pointer-events-none">
                                                        <FaChevronDown size={10} className="text-gray-400" />
                                                    </div>
                                                </div>
                                            )}
                                        </div>

                                        {/* First Name */}
                                        <div className="md:col-span-2">
                                            <label className={labelClasses}>ชื่อจริง <span className="text-red-500">*</span></label>
                                            <div className="relative group">
                                                <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none group-focus-within:text-indigo-500 transition-colors">
                                                    <FaUser size={14} className="opacity-40" />
                                                </div>
                                                <input
                                                    type="text"
                                                    name="firstName"
                                                    value={formData.firstName}
                                                    onChange={handleInputChange}
                                                    className={inputClasses}
                                                    placeholder="ชื่อจริง"
                                                    required
                                                />
                                            </div>
                                        </div>

                                        {/* Last Name */}
                                        <div>
                                            <label className={labelClasses}>นามสกุล <span className="text-red-500">*</span></label>
                                            <div className="relative group">
                                                <input
                                                    type="text"
                                                    name="lastName"
                                                    value={formData.lastName}
                                                    onChange={handleInputChange}
                                                    className={inputClasses.replace('pl-11', 'pl-4')}
                                                    placeholder="นามสกุล"
                                                    required
                                                />
                                            </div>
                                        </div>
                                    </div>

                                    {/* Email */}
                                    <div className="md:col-span-2">
                                        <label className={labelClasses}>ที่อยู่อีเมล <span className="text-red-500">*</span></label>
                                        <div className="relative group">
                                            <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none group-focus-within:text-indigo-500 transition-colors">
                                                <FaEnvelope size={14} className="opacity-40" />
                                            </div>
                                            <input
                                                type="email"
                                                name="email"
                                                value={formData.email}
                                                onChange={handleInputChange}
                                                className={inputClasses}
                                                placeholder="example@yourdomain.com"
                                                required
                                            />
                                        </div>
                                    </div>

                                    {/* Password */}
                                    <div className="space-y-1">
                                        <label className={labelClasses}>รหัสผ่าน <span className="text-red-500">*</span></label>
                                        <div className="relative group">
                                            <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none group-focus-within:text-indigo-500 transition-colors">
                                                <FaLock size={14} className="opacity-40" />
                                            </div>
                                            <input
                                                type="password"
                                                name="password"
                                                value={formData.password}
                                                onChange={handleInputChange}
                                                className={inputClasses}
                                                placeholder="กำหนดอย่างน้อย 6 ตัวอักษร"
                                                required
                                            />
                                        </div>
                                    </div>

                                    {/* Confirm Password */}
                                    <div className="space-y-1">
                                        <label className={labelClasses}>ยืนยันรหัสผ่าน <span className="text-red-500">*</span></label>
                                        <div className="relative group">
                                            <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none group-focus-within:text-indigo-500 transition-colors">
                                                <FaLock size={14} className="opacity-40" />
                                            </div>
                                            <input
                                                type="password"
                                                name="confirmPassword"
                                                value={formData.confirmPassword}
                                                onChange={handleInputChange}
                                                className={inputClasses}
                                                placeholder="กรอกรหัสผ่านอีกครั้ง"
                                                required
                                            />
                                        </div>
                                    </div>

                                    {/* Role Select */}
                                    <div className="md:col-span-2 relative" ref={dropdownRef}>
                                        <label className={labelClasses}>บทบาทและสิทธิ์การเข้าถึง <span className="text-red-500">*</span></label>
                                        <div
                                            onClick={() => setIsRoleDropdownOpen(!isRoleDropdownOpen)}
                                            className={`flex items-center justify-between w-full px-4 h-[46px] bg-white dark:bg-[#1c1c24] border border-gray-200 dark:border-gray-700/50 rounded-2xl cursor-pointer transition-all shadow-sm ${isRoleDropdownOpen ? 'ring-2 ring-indigo-500/20 border-indigo-500' : ''}`}
                                        >
                                            <div className="flex flex-wrap gap-2 overflow-hidden">
                                                {formData.role.length > 0 ? (
                                                    formData.role.map(r => {
                                                        const roleLabel = userRoles.find(ur => ur.value === r)?.label || r;
                                                        return (
                                                            <span key={r} className="inline-flex items-center px-2.5 py-1 rounded-xl text-[10px] font-black bg-indigo-50 dark:bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border border-indigo-100 dark:border-indigo-500/20">
                                                                {roleLabel}
                                                            </span>
                                                        );
                                                    })
                                                ) : (
                                                    <span className="text-gray-400 dark:text-gray-600 text-sm">-- เลือกบทบาทพื้นฐาน --</span>
                                                )}
                                            </div>
                                            <FaChevronDown className={`ml-3 text-gray-400 text-xs transition-transform duration-300 ${isRoleDropdownOpen ? 'rotate-180' : ''}`} />
                                        </div>

                                        {isRoleDropdownOpen && (
                                            <div className="absolute z-50 mt-2 w-full bg-white dark:bg-[#1c1c24] border border-gray-100 dark:border-white/5 rounded-2xl shadow-2xl py-2 max-h-64 overflow-auto animate-in fade-in slide-in-from-top-2 duration-300 backdrop-blur-xl">
                                                {userRoles.filter(r => !isSchoolAdmin || r.value !== ROLES.SUPER_ADMIN).map((role) => {
                                                    const isChecked = formData.role.includes(role.value);
                                                    return (
                                                        <div
                                                            key={role.value}
                                                            onClick={() => handleRoleToggle(role.value)}
                                                            className="flex items-center px-5 py-3.5 hover:bg-indigo-50 dark:hover:bg-indigo-500/10 transition-colors cursor-pointer group"
                                                        >
                                                            <div className={`w-5 h-5 rounded-lg border-2 mr-4 flex items-center justify-center transition-all ${isChecked
                                                                ? 'bg-indigo-600 border-indigo-600 text-white shadow-lg shadow-indigo-600/20'
                                                                : 'bg-transparent border-gray-300 dark:border-gray-700 group-hover:border-indigo-500/50'
                                                                }`}>
                                                                {isChecked && <FaCheck size={10} />}
                                                            </div>
                                                            <span className={`text-sm ${isChecked ? 'font-black text-indigo-600 dark:text-indigo-400' : 'text-gray-600 dark:text-gray-400 font-bold'}`}>
                                                                {role.label}
                                                            </span>
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                        )}
                                    </div>

                                    {/* School Select */}
                                        <div className="md:col-span-2 animate-in fade-in slide-in-from-top-2 duration-300">
                                            <label className={labelClasses}>สังกัดโรงเรียน (School Assignment)</label>
                                            <div className="relative" ref={schoolDropdownRef}>
                                                <button
                                                    type="button"
                                                    onClick={() => {
                                                        if (!isSchoolAdmin) setIsSchoolDropdownOpen(prev => !prev);
                                                    }}
                                                    disabled={isSchoolAdmin}
                                                    className={`w-full pl-11 pr-10 h-[46px] bg-white dark:bg-[#1c1c24] border border-gray-200 dark:border-gray-700/50 rounded-2xl focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none transition-all text-sm shadow-sm text-left text-gray-900 dark:text-white ${isSchoolAdmin ? 'opacity-70 cursor-not-allowed' : 'cursor-pointer hover:border-indigo-300 dark:hover:border-indigo-500/50'} ${isSchoolDropdownOpen ? 'ring-2 ring-indigo-500/20 border-indigo-500' : ''}`}
                                                >
                                                    <span className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                                                        <FaSchool size={14} className="opacity-40" />
                                                    </span>
	                                                    <span className={`block truncate ${selectedSchool ? '' : 'text-gray-400 dark:text-gray-600'}`}>
	                                                        {selectedSchool
	                                                            ? formatSchoolNameWithCode(selectedSchool)
	                                                            : '-- ส่วนกลาง / ยังไม่ระบุ --'}
	                                                    </span>
                                                    <span className="absolute inset-y-0 right-0 pr-4 flex items-center pointer-events-none">
                                                        <FaChevronDown size={10} className={`text-gray-400 transition-transform ${isSchoolDropdownOpen ? 'rotate-180' : ''}`} />
                                                    </span>
                                                </button>

                                                {isSchoolDropdownOpen && (
                                                    <div
                                                        ref={schoolMenuRef}
                                                        style={{ maxHeight: `${schoolDropdownMaxHeight}px` }}
                                                        className={`absolute z-50 w-full overflow-hidden rounded-2xl border border-gray-200 dark:border-gray-700/50 bg-white dark:bg-[#1c1c24] shadow-2xl animate-in fade-in duration-300 flex flex-col ${schoolDropdownPlacement === 'top' ? 'bottom-full mb-2 slide-in-from-bottom-2' : 'top-full mt-2 slide-in-from-top-2'}`}
                                                    >
                                                        <div className="flex flex-col sm:flex-row gap-2 p-3 border-b border-gray-100 dark:border-white/5">
	                                                            <div className="relative min-w-0 flex-1">
	                                                                <span className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-gray-400 dark:text-gray-600">
	                                                                    <FaSearch size={13} />
	                                                                </span>
	                                                                <input
	                                                                    type="text"
	                                                                    value={schoolSearchTerm}
	                                                                    onChange={(e) => setSchoolSearchTerm(e.target.value)}
	                                                                    placeholder="ค้นหาชื่อโรงเรียน หรือรหัสโรงเรียน..."
	                                                                    className="w-full h-10 pl-10 pr-4 rounded-xl bg-gray-50 dark:bg-[#14141b] border border-gray-200 dark:border-gray-700/50 text-sm text-gray-900 dark:text-white placeholder:text-gray-400 dark:placeholder:text-gray-600 outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20"
	                                                                    autoFocus
	                                                                />
	                                                            </div>
                                                            <button
                                                                type="button"
                                                                onClick={() => handleSchoolSelect('')}
                                                                className={`h-10 px-4 rounded-xl text-xs font-black border transition-colors whitespace-nowrap ${!formData.schoolId ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-gray-50 dark:bg-white/5 text-gray-600 dark:text-gray-300 border-gray-200 dark:border-gray-700/50 hover:border-indigo-400'}`}
                                                            >
                                                                ส่วนกลาง
                                                            </button>
                                                        </div>

                                                        <div className="min-h-0 flex-1 overflow-y-auto">
                                                            {paginatedSchools.length > 0 ? (
                                                                paginatedSchools.map((school) => {
                                                                    const isSelected = formData.schoolId === school.id;
                                                                    return (
                                                                        <button
                                                                            type="button"
                                                                            key={school.id}
                                                                            onClick={() => handleSchoolSelect(school.id)}
                                                                            className={`w-full min-h-10 flex items-center gap-3 px-4 py-2 text-left border-b border-gray-100 last:border-b-0 dark:border-white/5 transition-colors hover:bg-indigo-50 dark:hover:bg-indigo-500/10 ${isSelected ? 'bg-indigo-50/80 dark:bg-indigo-500/10' : ''}`}
                                                                        >
                                                                            <span className={`w-4 h-4 rounded-md border-2 flex-shrink-0 flex items-center justify-center ${isSelected ? 'bg-indigo-600 border-indigo-600 text-white' : 'border-gray-300 dark:border-gray-700'}`}>
                                                                                {isSelected && <FaCheck size={10} />}
                                                                            </span>
                                                                            <span className="min-w-0">
	                                                                                <span className={`block truncate text-sm leading-5 ${isSelected ? 'font-black text-indigo-600 dark:text-indigo-400' : 'font-bold text-gray-700 dark:text-gray-300'}`}>
	                                                                                    {formatSchoolNameWithCode(school)}
	                                                                                </span>
	                                                                                <span className="block truncate text-[11px] leading-4 font-bold text-gray-400 dark:text-gray-600">
	                                                                                    ชื่อโรงเรียน: {school.schoolName || '-'}
	                                                                                </span>
                                                                            </span>
                                                                        </button>
                                                                    );
                                                                })
                                                            ) : (
                                                                <div className="px-5 py-8 text-center text-sm font-bold text-gray-400 dark:text-gray-600">
                                                                    ไม่พบโรงเรียนที่ตรงกับคำค้นหา
                                                                </div>
                                                            )}
                                                        </div>

                                                        <div className="flex flex-col gap-2 border-t border-gray-100 dark:border-white/5 bg-gray-50/80 dark:bg-[#181820] p-3">
                                                            <div className="text-center text-[11px] font-black text-gray-400 dark:text-gray-600">
                                                                แสดง {paginatedSchools.length} จาก {filteredSchools.length} รายการ | หน้า {currentSchoolPage} / {schoolTotalPages}
                                                            </div>
                                                            <div className="flex flex-wrap items-center justify-center gap-1">
                                                                <button type="button" onClick={() => setSchoolPage(1)} disabled={currentSchoolPage === 1} className="px-2.5 h-8 rounded-lg text-[11px] font-black bg-gray-100 dark:bg-white/5 text-gray-600 dark:text-gray-300 disabled:opacity-40 disabled:cursor-not-allowed hover:bg-indigo-50 dark:hover:bg-indigo-500/10">หน้าแรก</button>
                                                                <button type="button" onClick={() => setSchoolPage(page => Math.max(1, page - 1))} disabled={currentSchoolPage === 1} className="px-2.5 h-8 rounded-lg text-[11px] font-black bg-gray-100 dark:bg-white/5 text-gray-600 dark:text-gray-300 disabled:opacity-40 disabled:cursor-not-allowed hover:bg-indigo-50 dark:hover:bg-indigo-500/10">ย้อนกลับ</button>
                                                                {visibleSchoolPages.map(page => (
                                                                    <button
                                                                        type="button"
                                                                        key={page}
                                                                        onClick={() => setSchoolPage(page)}
                                                                        className={`min-w-8 h-8 rounded-lg text-[11px] font-black transition-colors ${page === currentSchoolPage ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-600/20' : 'bg-gray-100 dark:bg-white/5 text-gray-600 dark:text-gray-300 hover:bg-indigo-50 dark:hover:bg-indigo-500/10'}`}
                                                                    >
                                                                        {page}
                                                                    </button>
                                                                ))}
                                                                <button type="button" onClick={() => setSchoolPage(page => Math.min(schoolTotalPages, page + 1))} disabled={currentSchoolPage === schoolTotalPages} className="px-2.5 h-8 rounded-lg text-[11px] font-black bg-gray-100 dark:bg-white/5 text-gray-600 dark:text-gray-300 disabled:opacity-40 disabled:cursor-not-allowed hover:bg-indigo-50 dark:hover:bg-indigo-500/10">ถัดไป</button>
                                                                <button type="button" onClick={() => setSchoolPage(schoolTotalPages)} disabled={currentSchoolPage === schoolTotalPages} className="px-2.5 h-8 rounded-lg text-[11px] font-black bg-gray-100 dark:bg-white/5 text-gray-600 dark:text-gray-300 disabled:opacity-40 disabled:cursor-not-allowed hover:bg-indigo-50 dark:hover:bg-indigo-500/10">หน้าสุดท้าย</button>
                                                            </div>
                                                        </div>
                                                    </div>
                                                )}
                                            </div>
                                        </div>

                                    {/* Department Select - Show if teacher or school admin role is selected */}
                                    {formData.role.some(r => STAFF_ROLES.includes(r)) && (
                                        <div className="md:col-span-2 animate-in fade-in slide-in-from-top-2 duration-300">
                                            <label className={labelClasses}>ฝ่ายงาน (Department)</label>
                                            <select
                                                name="department"
                                                value={formData.department}
                                                onChange={handleInputChange}
                                                className="w-full px-4 h-[46px] bg-white dark:bg-[#1c1c24] border border-gray-200 dark:border-gray-700/50 rounded-2xl focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none transition-all text-sm text-gray-900 dark:text-white"
                                            >
                                                {departmentOptions.map(dept => (
                                                    <option key={dept} value={dept}>{dept}</option>
                                                ))}
                                            </select>
                                        </div>
                                    )}
                                </div>

                                {/* Form Actions */}
                                <div className="mt-12 pt-8 border-t border-gray-100 dark:border-white/5 flex flex-col sm:flex-row justify-end gap-4">
                                    <button
                                        type="button"
                                        onClick={() => navigate('/owner/users')}
                                        className="inline-flex items-center justify-center px-8 h-[52px] text-sm font-black text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-white transition-colors uppercase tracking-widest"
                                    >
                                        ยกเลิกรายการ
                                    </button>
                                    <button
                                        type="submit"
                                        disabled={isLoading}
                                        className={`relative overflow-hidden inline-flex items-center justify-center gap-3 px-10 h-[52px] bg-indigo-600 text-white text-sm font-black rounded-2xl transition-all shadow-xl shadow-indigo-500/25 active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed group`}
                                    >
                                        <div className="absolute inset-0 bg-gradient-to-r from-indigo-600 to-indigo-500 opacity-0 group-hover:opacity-100 transition-opacity"></div>
                                        <div className="relative flex items-center gap-3">
                                            {isLoading ? (
                                                <>
                                                    <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                                                    <span>กำลังสร้างบัญชี...</span>
                                                </>
                                            ) : (
                                                <>
                                                    <FaUserPlus className="text-lg" />
                                                    <span>บันทึกข้อมูลและสร้างผู้ใช้</span>
                                                </>
                                            )}
                                        </div>
                                    </button>
                                </div>
                            </div>
                        </div>
                    </form>
                </div>
            </div>
        </MainLayout>
    );
};

export default AddUserPage;
