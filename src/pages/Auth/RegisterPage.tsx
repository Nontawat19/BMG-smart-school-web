import React, { useState, useEffect } from 'react';
import { useNavigate } from "react-router-dom";
import { auth, firestore, storage } from "../../firebase";
import { createUserWithEmailAndPassword, signOut, User } from "firebase/auth";
import { doc, setDoc, serverTimestamp, collection, addDoc, getDocs, query, orderBy } from "firebase/firestore";
import { ref as storageRef, uploadBytes, getDownloadURL } from "firebase/storage";
import { ToastContainer, toast } from "react-toastify";
import ToastContent from "../../components/ToastContent";
import ProfilePlaceholder from "../../assets/profile.png";
import { showFirebaseError } from "../../utils/showFirebaseError";
import { FaBookOpen } from "react-icons/fa";
<<<<<<< HEAD
import BackButton from "../../components/Shared/BackButton";
=======
>>>>>>> 5f8c7e1 (feat: optimize auto-scheduler and update UI labels)

import "react-toastify/dist/ReactToastify.css";
import { FirebaseError } from 'firebase/app';
import { compressImage } from "../../utils/imageUtils";

interface School {
    id: string;
    schoolName: string;
}

// 📌 1. เพิ่ม homeroomGrade ใน initialState
const initialState = {
    title: "",
    firstName: "",
    lastName: "",
    teacherId: "",
    email: "",
    password: "",
    confirmPassword: "",
    department: "",
    dob: "",
    gender: "",
    contact: "",
    address: "",
    schoolId: "",
    homeroomGrade: "", // เพิ่ม homeroomGrade
    idCardNumber: "", // เพิ่มเลขบัตรประชาชน
};

const RegisterPage: React.FC = () => {
    const navigate = useNavigate();
    const [form, setForm] = useState(initialState);
    const [customTitle, setCustomTitle] = useState("");
    const [schools, setSchools] = useState<School[]>([]);
    const [previewImage, setPreviewImage] = useState<string | null>(null);
    const [selectedFile, setSelectedFile] = useState<File | null>(null);
    const [isLoading, setIsLoading] = useState(false);

    useEffect(() => {
        const fetchSchools = async () => {
            const schoolsCollection = collection(firestore, "school-settings");
            const q = query(schoolsCollection, orderBy("schoolName"));
            const schoolSnapshot = await getDocs(q);
            const schoolList = schoolSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as School));
            setSchools(schoolList);
        };
        fetchSchools().catch(console.error);
    }, []);



    const handleImageChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) {
            // ตรวจสอบประเภทไฟล์
            if (!file.type.startsWith('image/')) {
                toast.error(<ToastContent title="ไฟล์ไม่ถูกต้อง" message="กรุณาเลือกไฟล์รูปภาพเท่านั้น" />);
                return;
            }

            try {
                // Compress and convert to WebP
                const compressedFile = await compressImage(file, 800, 0.8, 'image/webp');
                setSelectedFile(compressedFile);
                setPreviewImage(URL.createObjectURL(compressedFile));
            } catch (error) {
                console.error("Error compressing image:", error);

                // Fallback
                setSelectedFile(file);
                const reader = new FileReader();
                reader.onloadend = () => {
                    setPreviewImage(reader.result as string);
                };
                reader.readAsDataURL(file);
            }
        }
    };

    function handleChange(e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) {
        const { name, value } = e.target;
        setForm(prev => ({ ...prev, [name]: value }));
    }

    const handleRegister = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsLoading(true);

        if (!selectedFile) {
            toast.warn(<ToastContent title="ยังไม่เลือกรูปโปรไฟล์" message="กรุณาเลือกรูปภาพก่อนสมัครสมาชิก" />);
            setIsLoading(false);
            return;
        }

        const { email, password, confirmPassword, firstName, lastName, title, schoolId, idCardNumber } = form;

        if (!firstName || !lastName || !email || !password || !confirmPassword || !title || !schoolId || !idCardNumber) {
            toast.warn(<ToastContent title="ข้อมูลไม่ครบ" message="กรุณากรอกข้อมูลให้ครบทุกช่อง รวมถึงเลขบัตรประชาชน" />);
            setIsLoading(false);
            return;
        }

        if (password.length < 6) {
            toast.warn(<ToastContent title="รหัสผ่านสั้นเกินไป" message="รหัสผ่านต้องมีอย่างน้อย 6 ตัวอักษร" />);
            setIsLoading(false);
            return;
        }

        if (password !== confirmPassword) {
            toast.error(<ToastContent title="รหัสผ่านไม่ตรงกัน" message="กรุณายืนยันรหัสผ่านอีกครั้ง" />);
            setIsLoading(false);
            return;
        }

        let tempAuth: User | null = null;

        try {
            // 1. สร้างผู้ใช้ใน Firebase Authentication
            const userCredential = await createUserWithEmailAndPassword(auth, email, password);
            tempAuth = userCredential.user;

            // หากเลือก "อื่นๆ" ให้ใช้ค่าจาก customTitle
            const finalTitle = title === 'อื่นๆ' ? customTitle : title;

            // 2. เตรียมข้อมูลสำหรับบันทึกลง Firestore
            const { password: p, confirmPassword: cp, homeroomGrade, ...teacherData } = form; // Destructure

            // 📌 3. อัปเดต dataToSave เพื่อรวม homeroomGrade และสถานะ isHomeroomTeacher
            const dataToSave: any = {
                ...teacherData,
                title: finalTitle,
                uid: tempAuth.uid,
                homeroomGrade: homeroomGrade, // บันทึกข้อมูล homeroomGrade
                isHomeroomTeacher: homeroomGrade !== "", // กำหนดสถานะ
                createdAt: serverTimestamp(),
                profileImageUrl: "",
            };

            if (selectedFile) {
                // Path ใหม่: school-settings/{schoolId}/teachers/{idCardNumber}.{ext}
                const result = selectedFile.name.substring(selectedFile.name.lastIndexOf('.'));
                const fileExtension = result || '.jpg';

                const imageRef = storageRef(storage, `school-settings/${schoolId}/teachers/${idCardNumber}${fileExtension}`);
                const snapshot = await uploadBytes(imageRef, selectedFile);
                dataToSave.profileImageUrl = await getDownloadURL(snapshot.ref);
            }

            // 4. บันทึกข้อมูลครูลงใน subcollection 'teachers' ของโรงเรียนที่เลือก
            await addDoc(collection(firestore, "school-settings", schoolId, "teachers"), dataToSave);

            // 5. สร้างเอกสารใน collection 'users'
            await setDoc(doc(firestore, "users", tempAuth.uid), {
                fullName: `${finalTitle}${firstName} ${lastName}`,
                email: email,
                profileUrl: dataToSave.profileImageUrl,
                schoolId: schoolId,
                role: 'teacher',
                createdAt: serverTimestamp(),
            });

            await signOut(auth);

            toast.success(<ToastContent title="ลงทะเบียนสำเร็จ" message="ระบบกำลังออกจากระบบ กรุณาเข้าสู่ระบบด้วยบัญชี Admin ของคุณอีกครั้ง" />);
            setTimeout(() => navigate("/login"), 3000);
        } catch (error: any) {
            if (tempAuth) {
                await tempAuth.delete();
            }
            console.error(error);
            if (error instanceof FirebaseError) {
                if (error.code === 'auth/email-already-in-use') {
                    toast.error(<ToastContent title="อีเมลถูกใช้งานแล้ว" message="กรุณาใช้อีเมลอื่น" />);
                } else {
                    showFirebaseError(error);
                }
            }
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-blue-100 dark:from-gray-900 dark:to-gray-800 px-4 py-10 transition-colors duration-300 relative">
            <ToastContainer position="top-center" autoClose={3000} hideProgressBar />

<<<<<<< HEAD
            <div className="w-full max-w-md bg-white dark:bg-[#2a2b2f] rounded-2xl shadow-lg p-8 space-y-6 animate-fadeIn transition-colors duration-300 relative">
                {/* Back Button */}
                <div className="absolute top-4 left-4">
                    <BackButton to="/login" />
                </div>
=======
            <div className="w-full max-w-md bg-white dark:bg-[#2a2b2f] rounded-2xl shadow-lg p-8 space-y-6 animate-fadeIn transition-colors duration-300">
>>>>>>> 5f8c7e1 (feat: optimize auto-scheduler and update UI labels)
                <div className="flex flex-col items-center justify-center mb-4 gap-2">
                    <FaBookOpen className="w-12 h-12 text-sky-500 dark:text-sky-400" />
                    <h1 className="text-2xl font-bold text-gray-800 dark:text-white text-center">Easy School Management</h1>
                </div>
                <h2 className="text-2xl font-bold text-center text-gray-800 dark:text-white">ลงทะเบียนครูใหม่ (สำหรับ Super Admin)</h2>

                <div className="flex justify-center">
                    <label htmlFor="profileUpload" className="cursor-pointer">
                        {previewImage ? (
                            <img src={previewImage} alt="Profile" className="w-24 h-24 rounded-full object-cover border" />
                        ) : (
                            <div
                                className="w-24 h-24 rounded-full border bg-center bg-cover bg-no-repeat"
                                style={{ backgroundImage: `url(${ProfilePlaceholder})` }}
                            />
                        )}
                    </label>
                    <input id="profileUpload" type="file" accept="image/*" onChange={handleImageChange} className="hidden" />
                </div>

                <form onSubmit={handleRegister} className="space-y-4">
                    {/* เลือกโรงเรียน */}
                    <div>
                        <select name="schoolId" value={form.schoolId} onChange={handleChange} className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white dark:bg-[#1e1f21] text-gray-900 dark:text-white" required>
                            <option value="">-- เลือกโรงเรียน --</option>
                            {schools.map(school => (
                                <option key={school.id} value={school.id}>{school.schoolName}</option>
                            ))}
                        </select>
                    </div>

                    {/* คำนำหน้า ชื่อ นามสกุล */}
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                        {form.title === 'อื่นๆ' ? (
                            <div className="sm:col-span-1">
                                <input type="text" name="customTitle" placeholder="ระบุคำนำหน้า..." value={customTitle} onChange={(e) => setCustomTitle(e.target.value)} className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white dark:bg-[#1e1f21] text-gray-900 dark:text-white" required />
                            </div>
                        ) : (
                            <div className="sm:col-span-1">
                                <select name="title" value={form.title} onChange={handleChange} className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white dark:bg-[#1e1f21] text-gray-900 dark:text-white" required>
                                    <option value="">เลือกคำนำหน้า</option>
                                    <option value="นาย">นาย</option>
                                    <option value="นาง">นาง</option>
                                    <option value="น.ส.">นางสาว</option>
                                    <option value="อื่นๆ">อื่นๆ</option>
                                </select>
                            </div>
                        )}
                        <div className="sm:col-span-1"><input type="text" placeholder="ชื่อจริง" name="firstName" value={form.firstName} onChange={handleChange} className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white dark:bg-[#1e1f21] text-gray-900 dark:text-white" required /></div>
                        <div className="sm:col-span-1"><input type="text" placeholder="นามสกุล" name="lastName" value={form.lastName} onChange={handleChange} className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white dark:bg-[#1e1f21] text-gray-900 dark:text-white" required /></div>
                    </div>

                    {/* 📌 แถว: ฝ่ายงาน, รหัสตำแหน่งครู, ครูประจำชั้น (เปลี่ยนจาก 2 คอลัมน์ เป็น 3 คอลัมน์) */}
                    {/* 📌 แถว: เลขบัตรประชาชน, ฝ่ายงาน */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <input
                            type="text"
                            placeholder="เลขบัตรประชาชน (13 หลัก)"
                            name="idCardNumber"
                            value={form.idCardNumber}
                            onChange={handleChange}
                            className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white dark:bg-[#1e1f21] text-gray-900 dark:text-white"
                            required
                        />
                        <select name="department" value={form.department} onChange={handleChange} className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white dark:bg-[#1e1f21] text-gray-900 dark:text-white">
                            <option value="">เลือกฝ่ายงาน (ถ้ามี)</option>
                            <option value="งานบริหารวิชาการ">งานบริหารวิชาการ</option>
                            <option value="งานบริหารงบประมาณ">งานบริหารงบประมาณ</option>
                            <option value="งานบริหารบุคคล">งานบริหารบุคคล</option>
                            <option value="งานบริหารทั่วไป">งานบริหารทั่วไป</option>
                        </select>
                    </div>

                    {/* 📌 แถว: รหัสตำแหน่งครู, ครูประจำชั้น */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        {/* รหัสตำแหน่งครู */}
                        <input type="text" placeholder="รหัสตำแหน่งครู (ถ้ามี)" name="teacherId" value={form.teacherId} onChange={handleChange} className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white dark:bg-[#1e1f21] text-gray-900 dark:text-white" />

                        {/* ครูประจำชั้น */}
                        <div>
                            <select name="homeroomGrade" value={form.homeroomGrade} onChange={handleChange} className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white dark:bg-[#1e1f21] text-gray-900 dark:text-white">
                                <option value="">-- ไม่ได้เป็นครูประจำชั้น --</option>
                                <option value="ป.1">ป.1</option>
                                <option value="ป.2">ป.2</option>
                                <option value="ป.3">ป.3</option>
                                <option value="ป.4">ป.4</option>
                                <option value="ป.5">ป.5</option>
                                <option value="ป.6">ป.6</option>
                                <option value="ม.1">ม.1</option>
                                <option value="ม.2">ม.2</option>
                                <option value="ม.3">ม.3</option>
                            </select>
                        </div>
                    </div>



                    {/* อีเมล, รหัสผ่าน, ยืนยันรหัสผ่าน (คงเดิม) */}
                    <input
                        type="email"
                        placeholder="อีเมล"
                        name="email"
                        value={form.email}
                        onChange={handleChange}
                        className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white dark:bg-[#1e1f21] text-gray-900 dark:text-white"
                        required
                    />
                    <div className="flex gap-3">
                        <input
                            type="password"
                            placeholder="รหัสผ่าน"
                            name="password"
                            value={form.password}
                            onChange={handleChange}
                            className="w-1/2 px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white dark:bg-[#1e1f21] text-gray-900 dark:text-white"
                            required
                        />
                        <input
                            type="password"
                            placeholder="ยืนยันรหัสผ่าน"
                            name="confirmPassword"
                            value={form.confirmPassword}
                            onChange={handleChange}
                            className="w-1/2 px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white dark:bg-[#1e1f21] text-gray-900 dark:text-white"
                            required
                        />
                    </div>

                    {/* เบอร์ติดต่อ, เพศ (คงเดิม) */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <input type="text" placeholder="เบอร์ติดต่อ" name="contact" value={form.contact} onChange={handleChange} className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white dark:bg-[#1e1f21] text-gray-900 dark:text-white" />
                        <select name="gender" value={form.gender} onChange={handleChange} className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white dark:bg-[#1e1f21] text-gray-900 dark:text-white">
                            <option value="">เลือกเพศ</option>
                            <option value="ชาย">ชาย</option>
                            <option value="หญิง">หญิง</option>
                            <option value="อื่นๆ">อื่นๆ</option>
                        </select>
                    </div>

                    {/* วันเกิด, ที่อยู่ (คงเดิม) */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div>
                            <label className="text-xs text-gray-500 dark:text-gray-400 ml-1">วันเกิด (ถ้ามี)</label>
                            <input type="date" name="dob" value={form.dob} onChange={handleChange} className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white dark:bg-[#1e1f21] text-gray-900 dark:text-white" />
                        </div>
                        <textarea
                            name="address"
                            placeholder="ที่อยู่ (ถ้ามี)"
                            value={form.address}
                            onChange={handleChange}
                            rows={1}
                            className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white dark:bg-[#1e1f21] text-gray-900 dark:text-white"
                        />
                    </div>

                    <button
                        type="submit"
                        disabled={isLoading}
                        className="w-full py-3 bg-blue-600 text-white font-semibold rounded-lg hover:bg-blue-700 transition duration-200 disabled:bg-blue-400 disabled:cursor-not-allowed"
                    >
                        {isLoading ? 'กำลังลงทะเบียน...' : 'ลงทะเบียนครู'}
                    </button>
                </form>

                <p
                    className="text-center text-sm text-blue-600 font-medium cursor-pointer hover:underline"
                    onClick={() => navigate("/home")}
                >
                    กลับสู่หน้าหลัก
                </p>
            </div>
        </div>
    );
};

export default RegisterPage;