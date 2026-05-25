import React, { useState, useEffect, FormEvent, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import MainLayout from "@/layouts/MainLayout";
import ProfileAvatar from "@/components/Shared/ProfileAvatar";
import { firestore, storage } from "@/firebase";
import { doc, getDoc, updateDoc, serverTimestamp, collection, getDocs, setDoc } from "firebase/firestore";
import { ref, uploadBytes, getDownloadURL, deleteObject } from "firebase/storage";
import Swal from 'sweetalert2';
import { compressImage } from "@/utils/imageUtils";
import { getLevelsByRange } from "@/utils/schoolUtils";
import { syncHeadOfLearningArea } from "@/utils/subjectGroupSync";
import { useSubjectGroups } from "@/hooks/useSubjectGroups";
import { useSelector } from "react-redux";
import { RootState } from "@/store";
import { FaChevronDown, FaCheck, FaCamera } from 'react-icons/fa';
import { usePermissions } from "@/hooks/usePermissions";

// --- Interface สำหรับ Teacher Form State (Type Safety) ---
interface TeacherFormState {
    title: string;
    firstName: string;
    lastName: string;
    teacherId: string; // รหัสบุคลากร
    position: string; // เพิ่มตำแหน่ง
    subject: string;
    department: string;
    gender: string;
    lineId?: string;
    contact: string;
    address: string;
    profileImageUrl: string;
    homeroomGrade: string;
    homeroomRoom?: string;
    isHomeroomTeacher: boolean;
    advisorRole?: string;
    academicStanding: string;
    learningArea?: string;
    isHeadOfLearningArea?: boolean;
    isHeadOfAssessment?: boolean;
    isGuidanceTeacher?: boolean;
    licenseNumber: string;
    startDate: string;
    educationLevel: string;
    major: string;
    idCardNumber?: string;
    role: string[];
    status: string;
}

// --- Reusable Components ---
const InfoCard: React.FC<{ title: string; children: React.ReactNode }> = ({ title, children }) => (
    <div className="bg-white dark:bg-[#2a2b2f] p-6 rounded-2xl shadow-sm dark:shadow-none">
        <h2 className="text-lg font-semibold mb-4 text-gray-800 dark:text-gray-200 border-b border-gray-200 dark:border-gray-600 pb-2">{title}</h2>
        <div className="space-y-4">{children}</div>
    </div>
);

const InputField: React.FC<{ label: string; name: string; value: string; onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => void; type?: string; placeholder?: string; required?: boolean }> = ({ label, name, value, onChange, type = "text", placeholder, required }) => (
    <div>
        <label className="block text-sm font-medium mb-1 text-gray-700 dark:text-gray-400">{label} {required && <span className="text-red-500">*</span>}</label>
        <input type={type} name={name} value={value} onChange={onChange} placeholder={placeholder} className="w-full bg-white dark:bg-[#1e1f21] border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500 transition text-gray-900 dark:text-white" />
    </div>
);

const TextAreaField: React.FC<{ label: string; name: string; value: string; onChange: (e: React.ChangeEvent<HTMLTextAreaElement>) => void; placeholder?: string; }> = ({ label, name, value, onChange, placeholder }) => (
    <div>
        <label className="block text-sm font-medium mb-1 text-gray-700 dark:text-gray-400">{label}</label>
        <textarea name={name} value={value} onChange={onChange} placeholder={placeholder} rows={3} className="w-full bg-white dark:bg-[#1e1f21] border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500 transition resize-none text-gray-900 dark:text-white"></textarea>
    </div>
);

const initialState: TeacherFormState = {
    title: "",
    firstName: "",
    lastName: "",
    teacherId: "",
    position: "",
    subject: "",
    department: "",
    gender: "",
    contact: "",
    address: "",
    profileImageUrl: "",
    homeroomGrade: "",
    homeroomRoom: "",
    isHomeroomTeacher: false,
    advisorRole: "",
    learningArea: "",
    isHeadOfAssessment: false,
    isHeadOfLearningArea: false,
    isGuidanceTeacher: false,
    academicStanding: "",
    licenseNumber: "",
    startDate: "",
    educationLevel: "",
    major: "",
    lineId: "",
    idCardNumber: "",
    role: ["teacher"],
    status: "อยู่",
};

export default function EditTeacherPage() {
    const { schoolId, teacherId } = useParams<{ schoolId: string, teacherId: string }>();
    const navigate = useNavigate();
    const { user: currentUser, isSchoolAdmin, isSuperAdmin } = usePermissions();
    const isEditingSelf = currentUser?.uid === teacherId;
    const canEditSpecialRoles = !isEditingSelf || isSchoolAdmin || isSuperAdmin;
    const [form, setForm] = useState<TeacherFormState>(initialState);
    const [isLoading, setIsLoading] = useState(false);
    const [isFetching, setIsFetching] = useState(true);
    const [imageFile, setImageFile] = useState<File | null>(null);
    const [imagePreview, setImagePreview] = useState<string | null>(null);
    const [customGender, setCustomGender] = useState("");
    const [customTitle, setCustomTitle] = useState("");
    const [availableLevels, setAvailableLevels] = useState<string[]>([]);
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

    const userRoles = [
        { value: 'school_admin', label: 'ผู้ดูแลระบบโรงเรียน (School Admin)' },
        { value: 'academic_admin', label: 'ฝ่ายวิชาการ (Academic Admin)' },
        { value: 'teacher', label: 'ครูผู้สอน (Teacher)' },
    ];

    const handleRoleToggle = (roleValue: string) => {
        const currentRoles = Array.isArray(form.role) ? [...form.role] : [form.role];
        const updatedRoles = currentRoles.includes(roleValue)
            ? currentRoles.filter(r => r !== roleValue)
            : [...currentRoles, roleValue];

        setForm(prev => ({ ...prev, role: updatedRoles }));
    };

    // ดึงข้อมูลกลุ่มสาระจาก Firebase (อ้างอิง SubjectGroupManagementPage)
    const { subjectGroups } = useSubjectGroups(schoolId);

    useEffect(() => {
        if (!schoolId || !teacherId) {
            Swal.fire({
                icon: 'error',
                title: 'เกิดข้อผิดพลาด',
                text: 'ไม่พบรหัสครูใน URL กรุณาลองใหม่อีกครั้ง',
                background: '#2a2b2f',
                color: '#ffffff'
            });
            navigate(-1);
            return;
        }
        const fetchTeacherData = async () => {
            setIsFetching(true);
            try {
                const docRef = doc(firestore, "school-settings", schoolId, "teachers", teacherId);
                const docSnap = await getDoc(docRef);
                let data: any = null;
                
                if (docSnap.exists()) {
                    data = docSnap.data();
                } else {
                    const userDocRef = doc(firestore, "users", teacherId);
                    const userSnap = await getDoc(userDocRef);
                    if (userSnap.exists()) {
                        const userData = userSnap.data();
                        const nameParts = (userData.fullName || '').trim().split(/\s+/).filter(Boolean);
                        const roles = Array.isArray(userData.role) ? userData.role : (typeof userData.role === 'string' ? [userData.role] : []);
                        const isSchoolAdmin = roles.some((role: string) => role.toLowerCase() === 'school_admin');
                        const isSuperAdmin = roles.some((role: string) => role.toLowerCase() === 'super_admin');
                        
                        data = {
                            id: teacherId,
                            uid: userData.uid || teacherId,
                            schoolId,
                            title: userData.title || '',
                            firstName: userData.firstName || nameParts[0] || userData.fullName || userData.email || 'ไม่ระบุชื่อ',
                            lastName: userData.lastName || nameParts.slice(1).join(' '),
                            email: userData.email || '',
                            role: roles,
                            profileImageUrl: userData.profileImageUrl || userData.profileUrl || '',
                            teacherId: userData.teacherId || '',
                            position: userData.position || (isSuperAdmin ? 'ผู้ดูแลระบบสูงสุด' : isSchoolAdmin ? 'ผู้ดูแลระบบโรงเรียน' : 'ครู'),
                            department: userData.department || 'งานบริหารทั่วไป',
                            status: userData.status || 'อยู่',
                            learningArea: userData.learningArea || '',
                            subjectGroup: userData.subjectGroup || '',
                        };
                    }
                }

                if (data) {
                    // --- ตรวจสอบเพศที่กำหนดเอง ---
                    const standardGenders = ["ชาย", "หญิง", ""];
                    if (data.gender && !standardGenders.includes(data.gender)) {
                        setCustomGender(data.gender);
                        data.gender = "อื่นๆ";
                    }

                    // --- ตรวจสอบคำนำหน้าที่กำหนดเอง ---
                    const standardTitles = ["นาย", "นาง", "น.ส.", ""];
                    if (data.title && !standardTitles.includes(data.title)) {
                        setCustomTitle(data.title);
                        data.title = "อื่นๆ";
                    }

                    // Normalize role to array if it is a string
                    if (data.role && typeof data.role === 'string') {
                        data.role = [data.role];
                    } else if (!data.role) {
                        data.role = ["teacher"];
                    }

                    // --- ส่วนที่แก้ไข Type Error Code 2322 ---
                    // ผสานข้อมูลที่ได้จาก Firestore เข้ากับ initialState 
                    // และยืนยัน Type ให้ถูกต้อง
                    const mergedData = {
                        ...initialState,
                        ...data,
                        learningArea: data.learningArea || data.subjectGroup || "",
                    } as TeacherFormState;

                    setForm(mergedData);

                    if (mergedData.profileImageUrl) {
                        setImagePreview(mergedData.profileImageUrl);
                    }
                } else {
                    Swal.fire({
                        icon: 'error',
                        title: 'ไม่พบข้อมูล',
                        text: 'ไม่พบข้อมูลครูที่ต้องการแก้ไข',
                        background: '#2a2b2f',
                        color: '#ffffff'
                    });
                    navigate(-1);
                }
            } catch (error) {
                console.error("Error fetching teacher data:", error);
                Swal.fire({
                    icon: 'error',
                    title: 'เกิดข้อผิดพลาด',
                    text: 'เกิดข้อผิดพลาดในการดึงข้อมูล',
                    background: '#2a2b2f',
                    color: '#ffffff'
                });
            } finally {
                setIsFetching(false);
            }
        };
        fetchTeacherData();
    }, [schoolId, teacherId, navigate]);

    // ✅ ดึง availableLevels จาก Redux (แทนการ fetch school-settings ซ้ำ)
    const reduxSchoolSettings = useSelector((state: RootState) => state.schoolSettings);
    useEffect(() => {
        if (reduxSchoolSettings.status === 'succeeded' && reduxSchoolSettings.availableClassOptions.length > 0) {
            setAvailableLevels(reduxSchoolSettings.availableClassOptions.map(([_, name]: [string, string]) => name));
        }
    }, [reduxSchoolSettings.status, reduxSchoolSettings.availableClassOptions]);



    function handleChange(e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) {
        const target = e.target;
        const value = target.type === 'checkbox' ? (target as HTMLInputElement).checked : target.value;
        const name = target.name;

        if (name === 'title' && value !== 'อื่นๆ') {
            setCustomTitle('');
        }

        if (name === 'gender' && value !== 'อื่นๆ') {
            setCustomGender('');
        }

        // Custom logic for homeroomGrade to update isHomeroomTeacher
        if (name === 'homeroomGrade') {
            setForm((prev) => ({
                ...prev,
                [name]: value as string,
                isHomeroomTeacher: value !== "",
                homeroomRoom: value === "" ? "" : prev.homeroomRoom
            }));
        } else {
            setForm((prev) => ({ ...prev, [name]: value }));
        }
    }

    async function handleImageChange(e: React.ChangeEvent<HTMLInputElement>) {
        if (e.target.files && e.target.files[0]) {
            const file = e.target.files[0];

            // ตรวจสอบประเภทไฟล์
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
    }

    async function handleSubmit(e: FormEvent) {
        e.preventDefault();
        if (!schoolId || !teacherId) return;

        if (!form.teacherId) {
            Swal.fire({
                icon: 'warning',
                title: 'ข้อมูลไม่ครบ',
                text: 'กรุณาระบุรหัสครู',
                background: '#2a2b2f',
                color: '#ffffff'
            });
            return;
        }

        setIsLoading(true);
        Swal.fire({
            title: 'กำลังอัปเดตข้อมูล...',
            text: 'กรุณารอสักครู่',
            allowOutsideClick: false,
            background: '#2a2b2f',
            color: '#ffffff',
            didOpen: () => Swal.showLoading()
        });

        try {
            const { profileImageUrl, homeroomGrade, ...teacherDataWithoutImageAndGrade } = form;

            const finalTitle = form.title === 'อื่นๆ' ? customTitle : form.title;
            const finalGender = form.gender === 'อื่นๆ' ? customGender : form.gender;

            const dataToUpdate: any = {
                ...teacherDataWithoutImageAndGrade,
                title: finalTitle,
                gender: finalGender,
                learningArea: form.learningArea || "",
                subjectGroup: form.learningArea || "",
                homeroomGrade: homeroomGrade,
                updatedAt: serverTimestamp(),
                isHomeroomTeacher: homeroomGrade !== "",
            };

            // 1. จัดการรูปภาพใหม่
            if (imageFile) {
                // ถ้ามีรูปภาพเก่า (URL) ให้พยายามลบ
                if (form.profileImageUrl) {
                    try {
                        // การลบรูปภาพเก่าจาก Storage 
                        // Note: ต้องมั่นใจว่า form.profileImageUrl คือ storage path หรือ download URL ที่ถูกต้อง
                        const oldImageRef = ref(storage, form.profileImageUrl);
                        await deleteObject(oldImageRef).catch(e => {
                            console.warn("Could not delete old image, it might not exist or invalid path:", e);
                        });
                    } catch (error) {
                        console.warn("Could not delete old image:", error);
                    }
                }

                // อัปโหลดรูปภาพใหม่
                const fileExtension = '.jpg';

                if (!form.idCardNumber) {
                    throw new Error("กรุณาระบุเลขบัตรประชาชนก่อนอัปโหลดรูปภาพ");
                }

                // ใช้ form.idCardNumber เป็นชื่อไฟล์ (ตาม Requirement)
                const newImageRef = ref(storage, `school-settings/${schoolId}/teachers/${form.idCardNumber}${fileExtension}`);

                const snapshot = await uploadBytes(newImageRef, imageFile);
                dataToUpdate.profileImageUrl = await getDownloadURL(snapshot.ref);
            }
            // 2. หากผู้ใช้ไม่ได้อัปโหลดรูปภาพใหม่ แต่มีรูปภาพเดิมอยู่
            else if (form.profileImageUrl) {
                dataToUpdate.profileImageUrl = form.profileImageUrl;
            } else {
                // หากไม่มีรูปภาพใดๆ (ถ้าต้องการล้าง)
                dataToUpdate.profileImageUrl = "";
            }

            // อัปเดตข้อมูลใน Firestore (Teacher Collection)
            const docRef = doc(firestore, "school-settings", schoolId, "teachers", teacherId);
            await setDoc(docRef, dataToUpdate, { merge: true });

            // อัปเดตข้อมูลใน Firestore (User Collection)
            const userDocRef = doc(firestore, "users", teacherId);
            await updateDoc(userDocRef, {
                fullName: `${finalTitle}${form.firstName} ${form.lastName}`,
                profileUrl: dataToUpdate.profileImageUrl || form.profileImageUrl,
                role: form.role,
            });

            // Sync head of learning area to subject_groups collection
            if (form.learningArea) {
                const fullName = `${finalTitle}${form.firstName} ${form.lastName}`;
                await syncHeadOfLearningArea(
                    schoolId,
                    teacherId,
                    fullName,
                    form.learningArea,
                    !!form.isHeadOfLearningArea
                );
            }

            // อัปเดต Local Storage (ตามโค้ดเดิม)
            try {
                const latestUsersRaw = localStorage.getItem("latestUsers");
                if (latestUsersRaw) {
                    let latestUsers: any[] = JSON.parse(latestUsersRaw);
                    const userIndex = latestUsers.findIndex(user => user.id === teacherId && user.type === 'teacher');

                    if (userIndex !== -1) {
                        latestUsers[userIndex] = {
                            ...latestUsers[userIndex],
                            name: `${finalTitle}${form.firstName} ${form.lastName}`,
                            profileImageUrl: dataToUpdate.profileImageUrl || form.profileImageUrl,
                        };
                        localStorage.setItem("latestUsers", JSON.stringify(latestUsers));
                    }
                }
            } catch (e) {
                console.warn("Could not update latestUsers in localStorage:", e);
            }

            // แสดงผลสำเร็จ
            Swal.fire({
                icon: 'success',
                title: 'อัปเดตสำเร็จ!',
                text: 'ข้อมูลครูได้รับการอัปเดตเรียบร้อยแล้ว',
                timer: 1500,
                showConfirmButton: false,
                background: '#2a2b2f',
                color: '#ffffff'
            });
            setTimeout(() => navigate(`/school/${schoolId}/teachers/view/${teacherId}`), 1500);

        } catch (error) {
            console.error("Error updating document: ", error);
            Swal.fire({
                icon: 'error',
                title: 'เกิดข้อผิดพลาด',
                text: 'ไม่สามารถอัปเดตข้อมูลได้',
                background: '#2a2b2f',
                color: '#ffffff'
            });
        } finally {
            setIsLoading(false);
        }
    }

    if (isFetching) {
        return (
            <MainLayout>
                <div className="flex justify-center items-center min-h-screen bg-gray-50 dark:bg-[#1e1f21] text-gray-900 dark:text-white">
                    กำลังโหลดข้อมูลครู...
                </div>
            </MainLayout>
        );
    }

    return (
        <MainLayout>
            <div className="min-h-screen bg-gray-50 dark:bg-[#1e1f21] text-gray-900 dark:text-white">
                <div className="max-w-4xl mx-auto px-3 sm:px-4 md:px-6 lg:px-8 py-4 sm:py-6 lg:py-8">
                    <header className="mb-8">
                        <h1 className="text-3xl font-bold tracking-tight">แก้ไขข้อมูลครู</h1>
                        <p className="mt-1 text-gray-500 dark:text-gray-400">
                            คุณกำลังแก้ไขข้อมูลของ: <span className="font-semibold text-indigo-400">{form.title}{form.firstName} {form.lastName}</span>
                            {form.academicStanding && <span className="ml-2 text-sm text-gray-500 dark:text-gray-400">({form.academicStanding})</span>}
                        </p>
                    </header>

                    <form onSubmit={handleSubmit} className="space-y-6">
                        <InfoCard title="ข้อมูลส่วนตัว">
                            <div className="flex flex-col sm:flex-row items-center sm:items-start gap-6">
                                <div className="flex-shrink-0">
                                    <label htmlFor="profileImage" className="relative cursor-pointer group block">
                                        {imagePreview ? (
                                            <ProfileAvatar src={imagePreview} alt="Teacher profile" className="w-32 h-32 border-4 border-gray-200 dark:border-gray-600" />
                                        ) : (
                                            <div className="w-32 h-32 rounded-full border-4 border-dashed border-gray-300 dark:border-gray-600 bg-gray-100 dark:bg-gray-700/50 flex items-center justify-center">
                                                <svg xmlns="http://www.w3.org/2000/svg" className="h-12 w-12 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1}>
                                                    <path strokeLinecap="round" strokeLinejoin="round" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                                                </svg>
                                            </div>
                                        )}
                                        <div className="absolute bottom-0 right-0 bg-indigo-600 group-hover:bg-indigo-700 text-white rounded-full p-2 transition-all duration-200 transform group-hover:scale-110">
                                            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                                                <path d="M17.414 2.586a2 2 0 00-2.828 0L7 10.172V13h2.828l7.586-7.586a2 2 0 000-2.828z" />
                                                <path fillRule="evenodd" d="M2 6a2 2 0 012-2h4a1 1 0 010 2H4v10h10v-4a1 1 0 112 0v4a2 2 0 01-2 2H4a2 2 0 01-2-2V6z" clipRule="evenodd" />
                                            </svg>
                                        </div>
                                    </label>
                                    <input type="file" id="profileImage" name="profileImage" accept="image/jpeg,image/png" onChange={handleImageChange} className="hidden" />
                                </div>

                                <div className="flex-grow space-y-4 w-full">
                                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                                        <div>
                                            <label className="block text-sm font-medium mb-1 text-gray-700 dark:text-gray-400">คำนำหน้า</label>
                                            {form.title === 'อื่นๆ' ? (
                                                <div className="flex items-center gap-1">
                                                    <input
                                                        type="text"
                                                        name="customTitle"
                                                        value={customTitle}
                                                        onChange={(e) => setCustomTitle(e.target.value)}
                                                        placeholder="ระบุ..."
                                                        required
                                                        autoFocus
                                                        className="w-full bg-white dark:bg-[#1e1f21] border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500 transition text-gray-900 dark:text-white"
                                                    />
                                                    <button
                                                        type="button"
                                                        onClick={() => {
                                                            setForm(prev => ({ ...prev, title: '' }));
                                                            setCustomTitle('');
                                                        }}
                                                        className="p-2 text-gray-400 hover:text-red-500 rounded-full hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                                                        title="ยกเลิกการระบุเอง"
                                                    >
                                                        <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                                            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                                                        </svg>
                                                    </button>
                                                </div>
                                            ) : (
                                                <select name="title" value={form.title} onChange={handleChange} className="w-full bg-white dark:bg-[#1e1f21] border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500 transition text-gray-900 dark:text-white" required>
                                                    <option value="">เลือกคำนำหน้า</option>
                                                    <option value="นาย">นาย</option>
                                                    <option value="นาง">นาง</option>
                                                    <option value="น.ส.">นางสาว</option>
                                                    <option value="อื่นๆ">อื่นๆ</option>
                                                </select>
                                            )}
                                        </div>
                                        <InputField label="ชื่อจริง" name="firstName" value={form.firstName} onChange={handleChange} />
                                        <InputField label="นามสกุล" name="lastName" value={form.lastName} onChange={handleChange} />
                                    </div>
                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                        {/* 📌 แถว ข้อมูลวิชาชีพ (เพิ่มใหม่) */}
                                        <InputField
                                            label="เลขบัตรประชาชน"
                                            name="idCardNumber"
                                            value={form.idCardNumber || ""}
                                            onChange={handleChange}
                                            placeholder="ระบุเลขบัตรประชาชน 13 หลัก"
                                            required
                                        />
                                        <InputField
                                            label="เลขที่ใบประกอบวิชาชีพ"
                                            name="licenseNumber"
                                            value={form.licenseNumber}
                                            onChange={handleChange}
                                            placeholder="ระบุเลขที่ใบอนุญาต"
                                        />
                                    </div>
                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                        <div>
                                            <label className="block text-sm font-medium mb-1 text-gray-700 dark:text-gray-400">วิทยฐานะ</label>
                                            <select name="academicStanding" value={form.academicStanding} onChange={handleChange} className="w-full bg-white dark:bg-[#1e1f21] border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500 transition text-gray-900 dark:text-white">
                                                <option value="">-- ไม่มี/ไม่ระบุ --</option>
                                                <option value="ชำนาญการ (คศ.2)">ชำนาญการ (คศ.2)</option>
                                                <option value="ชำนาญการพิเศษ (คศ.3)">ชำนาญการพิเศษ (คศ.3)</option>
                                                <option value="เชี่ยวชาญ (คศ.4)">เชี่ยวชาญ (คศ.4)</option>
                                                <option value="เชี่ยวชาญพิเศษ (คศ.5)">เชี่ยวชาญพิเศษ (คศ.5)</option>
                                            </select>
                                        </div>
                                    </div>


                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                        <div>
                                            <label className="block text-sm font-medium mb-1 text-gray-700 dark:text-gray-400">ฝ่ายงาน</label>
                                            <select name="department" value={form.department} onChange={handleChange} className="w-full bg-white dark:bg-[#1e1f21] border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500 transition text-gray-900 dark:text-white">
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
                                            <label className="block text-sm font-medium mb-1 text-gray-700 dark:text-gray-400">เพศ</label>
                                            <div className={form.gender === 'อื่นๆ' ? "flex gap-2" : ""}>
                                                <select name="gender" value={form.gender} onChange={handleChange} className={`bg-white dark:bg-[#1e1f21] border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500 transition text-gray-900 dark:text-white ${form.gender === 'อื่นๆ' ? "w-1/3" : "w-full"}`} required>
                                                    <option value="">เลือกเพศ</option>
                                                    <option value="ชาย">ชาย</option>
                                                    <option value="หญิง">หญิง</option>
                                                    <option value="อื่นๆ">อื่นๆ</option>
                                                </select>
                                                {form.gender === 'อื่นๆ' && (
                                                    <input
                                                        type="text"
                                                        value={customGender}
                                                        onChange={(e) => setCustomGender(e.target.value)}
                                                        className="w-2/3 bg-white dark:bg-[#1e1f21] border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500 transition text-gray-900 dark:text-white"
                                                        placeholder="ระบุเพศ..."
                                                        required
                                                    />
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                                        <div>
                                            <label className="block text-sm font-medium mb-1 text-gray-700 dark:text-gray-400">สถานะดูแลชั้นเรียน</label>
                                            <select name="advisorRole" value={form.advisorRole || ""} onChange={handleChange} className="w-full bg-white dark:bg-[#1e1f21] border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500 transition text-gray-900 dark:text-white">
                                                <option value="">-- ระบุสถานะ --</option>
                                                <option value="ครูสอนประจำชั้น">ครูสอนประจำชั้น</option>
                                                <option value="ครูที่ปรึกษา">ครูที่ปรึกษา</option>
                                            </select>
                                        </div>
                                        <div>
                                            <label className="block text-sm font-medium mb-1 text-gray-700 dark:text-gray-400">ระดับชั้นที่ดูแล</label>
                                            <select name="homeroomGrade" value={form.homeroomGrade} onChange={handleChange} className="w-full bg-white dark:bg-[#1e1f21] border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500 transition text-gray-900 dark:text-white">
                                                <option value="">-- ไม่ได้เป็นครูประจำชั้น --</option>
                                                {availableLevels.map(level => (
                                                    <option key={level} value={level}>{level}</option>
                                                ))}
                                            </select>
                                        </div>

                                        <div>
                                            <label className="block text-sm font-medium mb-1 text-gray-700 dark:text-gray-400">ห้องประจำชั้น</label>
                                            <select name="homeroomRoom" value={form.homeroomRoom || ""} onChange={handleChange} disabled={!form.homeroomGrade} className="w-full bg-white dark:bg-[#1e1f21] border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500 transition text-gray-900 dark:text-white disabled:opacity-50 disabled:cursor-not-allowed">
                                                <option value="">-- เลือกห้อง --</option>
                                                {Array.from({ length: 20 }, (_, i) => i + 1).map(r => (
                                                    <option key={r} value={r}>{r}</option>
                                                ))}
                                            </select>
                                        </div>
                                    </div>

                                    {/* กลุ่มสาระการเรียนรู้ และ หัวหน้ากลุ่มสาระ */}
                                    <div>
                                        <label className="block text-sm font-medium mb-1 text-gray-700 dark:text-gray-400">กลุ่มสาระการเรียนรู้</label>
                                        <select
                                            name="learningArea"
                                            value={form.learningArea || ""}
                                            onChange={handleChange}
                                            className="w-full bg-white dark:bg-[#1e1f21] border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500 transition text-gray-900 dark:text-white"
                                        >
                                            <option value="">-- เลือกกลุ่มสาระ --</option>
                                            {subjectGroups.map((group) => (
                                                <option key={group.id} value={group.name}>{group.name}</option>
                                            ))}
                                        </select>
                                    </div>
                                    <div className="sm:col-span-2">
                                        <label className="block text-sm font-medium mb-2 text-gray-700 dark:text-gray-400">
                                            บทบาทพิเศษ
                                            {isEditingSelf && !canEditSpecialRoles && <span className="ml-2 text-[10px] text-amber-500 font-normal">(คุณไม่สามารถแก้ไขบทบาทพิเศษของตัวเองได้)</span>}
                                        </label>
                                        <div className={`flex flex-wrap gap-x-6 gap-y-2 p-4 bg-gray-50 dark:bg-gray-800/50 rounded-lg border border-gray-200 dark:border-gray-700`}>
                                            <label className={`flex items-center space-x-2 ${!canEditSpecialRoles ? 'cursor-not-allowed opacity-80' : 'cursor-pointer'}`}>
                                                <input
                                                    type="checkbox"
                                                    name="isHeadOfLearningArea"
                                                    checked={form.isHeadOfLearningArea || false}
                                                    onChange={!canEditSpecialRoles ? () => {} : handleChange}
                                                    onClick={(e) => !canEditSpecialRoles && e.preventDefault()}
                                                    className={`w-5 h-5 text-indigo-600 border-gray-300 rounded focus:ring-indigo-500 dark:bg-[#1e1f21] dark:border-gray-600 ${!canEditSpecialRoles ? 'pointer-events-none' : ''}`}
                                                />
                                                <span className="text-sm font-medium text-gray-700 dark:text-gray-300 whitespace-nowrap">เป็นหัวหน้ากลุ่มสาระ</span>
                                            </label>
                                            <label className={`flex items-center space-x-2 ${!canEditSpecialRoles ? 'cursor-not-allowed opacity-80' : 'cursor-pointer'}`}>
                                                <input
                                                    type="checkbox"
                                                    name="isHeadOfAssessment"
                                                    checked={form.isHeadOfAssessment || false}
                                                    onChange={!canEditSpecialRoles ? () => {} : handleChange}
                                                    onClick={(e) => !canEditSpecialRoles && e.preventDefault()}
                                                    className={`w-5 h-5 text-indigo-600 border-gray-300 rounded focus:ring-indigo-500 dark:bg-[#1e1f21] dark:border-gray-600 ${!canEditSpecialRoles ? 'pointer-events-none' : ''}`}
                                                />
                                                <span className="text-sm font-medium text-gray-700 dark:text-gray-300 whitespace-nowrap">เป็นหัวหน้างานวัดและประเมินผล</span>
                                            </label>
                                            <label className={`flex items-center space-x-2 ${!canEditSpecialRoles ? 'cursor-not-allowed opacity-80' : 'cursor-pointer'}`}>
                                                <input
                                                    type="checkbox"
                                                    name="isGuidanceTeacher"
                                                    checked={form.isGuidanceTeacher || false}
                                                    onChange={!canEditSpecialRoles ? () => {} : handleChange}
                                                    onClick={(e) => !canEditSpecialRoles && e.preventDefault()}
                                                    className={`w-5 h-5 text-indigo-600 border-gray-300 rounded focus:ring-indigo-500 dark:bg-[#1e1f21] dark:border-gray-600 ${!canEditSpecialRoles ? 'pointer-events-none' : ''}`}
                                                />
                                                <span className="text-sm font-medium text-gray-700 dark:text-gray-300 whitespace-nowrap">เป็นครูแนะแนว</span>
                                            </label>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </InfoCard>

                        <InfoCard title="ข้อมูลการทำงาน">
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                <InputField label="รหัสครู" name="teacherId" value={form.teacherId} onChange={handleChange} required />
                                <div>
                                    <label className="block text-sm font-medium mb-1 text-gray-700 dark:text-gray-400">ตำแหน่ง</label>
                                    <select name="position" value={form.position} onChange={handleChange} className="w-full bg-white dark:bg-[#1e1f21] border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500 transition text-gray-900 dark:text-white">
                                        <option value="">เลือกตำแหน่ง</option>
                                        <option value="ผู้อำนวยการ">ผู้อำนวยการโรงเรียน</option>
                                        <option value="รองผู้อำนวยการ">รองผู้อำนวยการโรงเรียน</option>
                                        <option value="ครู">ครู</option>
                                        <option value="ครูผู้ช่วย">ครูผู้ช่วย</option>
                                        <option value="ครูอัตราจ้าง">ครูอัตราจ้าง</option>
                                        <option value="พนักงานราชการ">พนักงานราชการ</option>
                                        <option value="บุคลากรทางการศึกษา">บุคลากรทางการศึกษา</option>
                                        <option value="เจ้าหน้าที่ธุรการ">เจ้าหน้าที่ธุรการ</option>
                                        <option value="นักการภารโรง">นักการภารโรง</option>
                                        <option value="แม่บ้าน">แม่บ้าน</option>
                                        <option value="ยาม">ยาม/รปภ.</option>
                                        <option value="พี่เลี้ยงเด็กพิการ">พี่เลี้ยงเด็กพิการ</option>
                                        <option value="วิทยากรพิเศษ">วิทยากรพิเศษ</option>
                                        <option value="อื่นๆ">อื่นๆ</option>
                                    </select>
                                </div>
                                <div>
                                    <label className="block text-sm font-medium mb-1 text-gray-700 dark:text-gray-400">สถานะครู <span className="text-red-500">*</span></label>
                                    <select name="status" value={form.status} onChange={handleChange} className="w-full bg-white dark:bg-[#1e1f21] border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500 transition text-gray-900 dark:text-white" required>
                                        <option value="อยู่">อยู่ (ปฏิบัติหน้าที่)</option>
                                        <option value="ย้าย">ย้าย</option>
                                        <option value="เกษียณ">เกษียณ</option>
                                        <option value="ลาศึกษาต่อ">ลาศึกษาต่อ</option>
                                        <option value="ช่วยราชการ">ช่วยราชการ</option>
                                        <option value="ออก">ออก (ลาออก/พ้นสภาพ)</option>
                                        <option value="ถึงแก่กรรม">ถึงแก่กรรม</option>
                                    </select>
                                </div>
                            </div>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-4">
                                <InputField label="วิชาที่สอนหลัก" name="subject" value={form.subject} onChange={handleChange} placeholder="เช่น คณิตศาสตร์, ภาษาไทย" />
                            </div>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                <InputField label="เบอร์ติดต่อ" name="contact" value={form.contact} onChange={handleChange} type="tel" placeholder="08x-xxxx-xxxx" />
                                <InputField label="Line ID" name="lineId" value={form.lineId || ''} onChange={handleChange} placeholder="Line ID" />
                            </div>
                        </InfoCard>

                        <InfoCard title="ข้อมูลเพิ่มเติม">
                            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                                <InputField label="วันที่เริ่มงาน/บรรจุ" name="startDate" value={form.startDate} onChange={handleChange} type="date" />
                                <div>
                                    <label className="block text-sm font-medium mb-1 text-gray-700 dark:text-gray-400">วุฒิการศึกษา</label>
                                    <select name="educationLevel" value={form.educationLevel} onChange={handleChange} className="w-full bg-white dark:bg-[#1e1f21] border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500 transition text-gray-900 dark:text-white">
                                        <option value="">เลือกวุฒิการศึกษา</option>
                                        <option value="ต่ำกว่าปริญญาตรี">ต่ำกว่าปริญญาตรี</option>
                                        <option value="ปริญญาตรี">ปริญญาตรี</option>
                                        <option value="ปริญญาโท">ปริญญาโท</option>
                                        <option value="ปริญญาเอก">ปริญญาเอก</option>
                                    </select>
                                </div>
                                <InputField label="วิชาเอก" name="major" value={form.major} onChange={handleChange} placeholder="เช่น คณิตศาสตร์" />
                            </div>
                        </InfoCard>

                        <InfoCard title="ที่อยู่">
                            <TextAreaField label="ที่อยู่ปัจจุบัน" name="address" value={form.address} onChange={handleChange as (e: React.ChangeEvent<HTMLTextAreaElement>) => void} placeholder="บ้านเลขที่, ถนน, ตำบล, อำเภอ" />
                        </InfoCard>

                        <InfoCard title="บทบาทและสิทธิ์การใช้งาน">
                            <div className="relative" ref={dropdownRef}>
                                <label className="block text-sm font-medium mb-2 text-gray-700 dark:text-gray-400">
                                    สิทธิ์การใช้งานในระบบ <span className="text-red-500">*</span>
                                    {isEditingSelf && <span className="ml-2 text-[10px] text-amber-500 font-normal">(คุณไม่สามารถแก้ไขสิทธิ์ของตัวเองได้)</span>}
                                </label>
                                <div
                                    onClick={() => !isEditingSelf && setIsRoleDropdownOpen(!isRoleDropdownOpen)}
                                    className={`flex items-center justify-between w-full px-4 py-2 bg-white dark:bg-[#1e1f21] border border-gray-300 dark:border-gray-600 rounded-lg shadow-sm transition-all min-h-[42px] ${isEditingSelf ? 'cursor-not-allowed bg-gray-50 dark:bg-gray-800/50' : 'cursor-pointer focus:ring-2 focus:ring-indigo-500'}`}
                                >
                                    <div className="flex flex-wrap gap-1">
                                        {Array.isArray(form.role) && form.role.length > 0 ? (
                                            form.role.map(r => {
                                                const roleLabel = userRoles.find(ur => ur.value === r)?.label ?? r;
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
                                    {!isEditingSelf && <FaChevronDown className={`text-gray-400 text-[10px] transition-transform duration-200 ${isRoleDropdownOpen ? 'rotate-180' : ''}`} />}
                                </div>

                                {isRoleDropdownOpen && !isEditingSelf && (
                                    <div className="absolute z-50 bottom-full mb-1 w-full bg-white dark:bg-[#2a2b2f] border border-gray-200 dark:border-gray-700 rounded-lg shadow-xl py-1 max-h-60 overflow-auto animate-in slide-in-from-bottom-2 fade-in zoom-in duration-200">
                                        {userRoles.map((role) => {
                                            const isChecked = Array.isArray(form.role) && form.role.includes(role.value);
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
                        </InfoCard>

                        <div className="flex justify-end gap-3 pt-4">
                            <button
                                type="button"
                                onClick={() => navigate(-1)}
                                className="px-6 py-2 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition duration-200 focus:outline-none focus:ring-2 focus:ring-gray-500"
                            >
                                ยกเลิก
                            </button>
                            <button
                                type="submit"
                                disabled={isLoading}
                                className={`px-8 py-2 rounded-lg font-semibold text-white transition duration-200 
                                    ${isLoading
                                        ? 'bg-indigo-400 cursor-not-allowed'
                                        : 'bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-4 focus:ring-indigo-500 focus:ring-opacity-50'
                                    }`}
                            >
                                {isLoading ? 'กำลังบันทึก...' : 'บันทึกการแก้ไข'}
                            </button>
                        </div>
                    </form>
                </div>
            </div>
        </MainLayout >
    );
}
