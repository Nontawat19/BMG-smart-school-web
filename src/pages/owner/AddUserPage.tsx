import React, { useState, useEffect, useRef } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { auth, firestore, storage } from '@/firebase';
import { initializeApp, deleteApp } from 'firebase/app';
import { getAuth, createUserWithEmailAndPassword } from 'firebase/auth';
import { doc, setDoc, serverTimestamp, collection, getDocs } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import MainLayout from '@/layouts/MainLayout';
import Swal from 'sweetalert2';
import { FaSave, FaTimes, FaUserPlus, FaEnvelope, FaUser, FaShieldAlt, FaArrowLeft, FaCamera, FaChevronDown, FaCheck, FaLock, FaSchool } from 'react-icons/fa';
import { compressImage } from '@/utils/imageUtils';

interface School {
    id: string;
    schoolName: string;
}

const AddUserPage = () => {
    const navigate = useNavigate();
    const [formData, setFormData] = useState({
        title: '',
        firstName: '',
        lastName: '',
        email: '',
        password: '',
        confirmPassword: '',
        role: ['teacher'] as string[],
        schoolId: '',
    });
    const [customTitle, setCustomTitle] = useState("");
    const [schools, setSchools] = useState<School[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [imageFile, setImageFile] = useState<File | null>(null);
    const [imagePreview, setImagePreview] = useState<string | null>(null);
    const [isRoleDropdownOpen, setIsRoleDropdownOpen] = useState(false);
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
        const fetchSchools = async () => {
            try {
                const schoolsCollection = collection(firestore, "school-settings");
                const schoolSnapshot = await getDocs(schoolsCollection);
                const schoolsData = schoolSnapshot.docs.map(doc => ({
                    id: doc.id,
                    schoolName: doc.data().schoolName,
                }));
                setSchools(schoolsData);
            } catch (err) {
                console.error("Error fetching schools:", err);
            }
        };
        fetchSchools();
    }, []);

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

    const handleImageChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files[0]) {
            const file = e.target.files[0];
            try {
                const compressedFile = await compressImage(file, 500, 0.8, 'image/png');
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
            if (imageFile) {
                const storageRef = ref(storage, `users/${newUser.uid}/profile_${Date.now()}.png`);
                const snapshot = await uploadBytes(storageRef, imageFile);
                profileUrl = await getDownloadURL(snapshot.ref);
            }

            const finalTitle = formData.title === "อื่นๆ" ? customTitle : formData.title;
            const fullName = `${finalTitle}${formData.firstName} ${formData.lastName}`.trim();

            await setDoc(doc(firestore, 'users', newUser.uid), {
                fullName: fullName,
                firstName: formData.firstName,
                lastName: formData.lastName,
                title: finalTitle,
                email: formData.email,
                role: formData.role,
                schoolId: formData.schoolId || null,
                profileUrl: profileUrl || null,
                createdAt: serverTimestamp(),
            });

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
        { value: 'super_admin', label: 'ผู้ดูแลสูงสุด (Super Admin)' },
        { value: 'school_admin', label: 'แอดมินโรงเรียน (School Admin)' },
        { value: 'teacher', label: 'ครูผู้สอน (Teacher)' },
        { value: 'student', label: 'นักเรียน (Student)' },
        { value: 'school_attendance', label: 'เจ้าหน้าที่ลงเวลาครู (Teacher Attendance)' },
        { value: 'student_attendance', label: 'เจ้าหน้าที่ลงเวลา (Student Attendance)' },
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
                                    <img
                                        className="relative w-full h-full rounded-full object-cover border-4 border-white dark:border-gray-800 shadow-2xl z-10"
                                        src={imagePreview || `https://ui-avatars.com/api/?name=New+User&background=4f46e5&color=fff&size=200`}
                                        alt="Preview"
                                    />
                                    <label htmlFor="profile-upload" className="absolute bottom-2 right-2 z-20 bg-indigo-600 text-white p-3.5 rounded-2xl cursor-pointer shadow-xl hover:bg-indigo-700 transition-all hover:scale-110 active:scale-90 ring-4 ring-white dark:ring-gray-800">
                                        <FaCamera size={18} />
                                    </label>
                                    <input id="profile-upload" type="file" className="hidden" accept="image/*" onChange={handleImageChange} />
                                </div>
                                <div className="mt-8 space-y-2">
                                    <h3 className="text-lg font-black text-gray-900 dark:text-white">ภาพโปรไฟล์</h3>
                                    <p className="text-xs text-gray-400 dark:text-gray-500 font-medium px-4">
                                        เลือกภาพที่ชัดเจนเพื่อระบุตัวตน (รองรับไฟล์ JPG, PNG, WebP)
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
                                                {userRoles.map((role) => {
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

                                    {/* School Select - Hide if Super Admin is selected */}
                                    {!formData.role.includes('super_admin') && (
                                        <div className="md:col-span-2 animate-in fade-in slide-in-from-top-2 duration-300">
                                            <label className={labelClasses}>สังกัดโรงเรียน (School Assignment)</label>
                                            <div className="relative group">
                                                <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none group-focus-within:text-indigo-500 transition-colors">
                                                    <FaSchool size={14} className="opacity-40" />
                                                </div>
                                                <select
                                                    name="schoolId"
                                                    value={formData.schoolId}
                                                    onChange={handleInputChange}
                                                    className="w-full pl-11 pr-10 h-[46px] bg-white dark:bg-[#1c1c24] border border-gray-200 dark:border-gray-700/50 rounded-2xl focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none transition-all text-sm appearance-none cursor-pointer shadow-sm text-gray-900 dark:text-white"
                                                >
                                                    <option value="">-- ส่วนกลาง / ยังไม่ระบุ --</option>
                                                    {schools.map(school => <option key={school.id} value={school.id}>{school.schoolName}</option>)}
                                                </select>
                                                <div className="absolute inset-y-0 right-0 pr-4 flex items-center pointer-events-none">
                                                    <FaChevronDown size={10} className="text-gray-400" />
                                                </div>
                                            </div>
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
