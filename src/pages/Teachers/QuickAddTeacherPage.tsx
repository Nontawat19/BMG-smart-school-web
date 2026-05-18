import React, { useState, FormEvent, useEffect } from "react";
import MainLayout from "@/layouts/MainLayout";
import { useParams, useNavigate } from "react-router-dom";
import { auth, firestore, storage } from "@/firebase";
import {
  collection,
  doc,
  setDoc,
  serverTimestamp,
  getDocs,
  query,
  where,
} from "firebase/firestore";
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";
import { createUserWithEmailAndPassword } from "firebase/auth";
import { FaUserPlus, FaIdCard, FaEnvelope, FaLock, FaUserTie, FaArrowLeft } from "react-icons/fa";
import Swal from "sweetalert2";
import { compressImage } from "@/utils/imageUtils";
import { useSubjectGroups } from "@/hooks/useSubjectGroups";

const InfoCard: React.FC<{ title: string; children: React.ReactNode }> = ({ title, children }) => (
  <div className="bg-white dark:bg-[#2a2b2f] p-5 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-800">
    <h2 className="text-sm font-black mb-4 text-gray-400 dark:text-gray-500 uppercase tracking-widest flex items-center gap-2">
      <div className="w-1.5 h-1.5 rounded-full bg-indigo-500"></div>
      {title}
    </h2>
    <div className="space-y-4">{children}</div>
  </div>
);

const InputField: React.FC<{
  label: string;
  name: string;
  value: string;
  onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => void;
  type?: string;
  placeholder?: string;
  required?: boolean;
  icon?: React.ReactNode;
}> = ({ label, name, value, onChange, type = "text", placeholder, required = false, icon }) => (
  <div className="relative">
    <label className="block text-[10px] font-bold mb-1 text-gray-400 uppercase tracking-tighter ml-1">
      {label} {required && <span className="text-red-500">*</span>}
    </label>
    <div className="relative">
      {icon && (
        <div className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400">
          {icon}
        </div>
      )}
      <input
        type={type}
        name={name}
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        required={required}
        className={`w-full bg-gray-50 dark:bg-[#1e1f21] border border-gray-100 dark:border-gray-700 rounded-xl ${icon ? 'pl-10' : 'px-4'} py-2.5 text-sm focus:ring-2 focus:ring-indigo-500 outline-none transition-all text-gray-900 dark:text-white placeholder-gray-300`}
      />
    </div>
  </div>
);

const initialState = {
  title: "",
  firstName: "",
  lastName: "",
  idCardNumber: "",
  position: "",
  learningArea: "",
  email: "",
  password: "",
  teacherId: "", // Staff ID
};

export default function QuickAddTeacherPage() {
  const { schoolId } = useParams<{ schoolId: string }>();
  const navigate = useNavigate();
  const [form, setForm] = useState(initialState);
  const [isLoading, setIsLoading] = useState(false);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [customTitle, setCustomTitle] = useState("");
  
  const { subjectGroups } = useSubjectGroups(schoolId);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setForm((prev) => ({ ...prev, [name]: value }));
  };

  const handleImageChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      try {
        const compressed = await compressImage(file, 400, 0.7, 'image/webp');
        setImageFile(compressed);
        setImagePreview(URL.createObjectURL(compressed));
      } catch (err) {
        setImageFile(file);
        setImagePreview(URL.createObjectURL(file));
      }
    }
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!schoolId) return;

    if (!/^\d{13}$/.test(form.idCardNumber)) {
        Swal.fire("ข้อมูลไม่ถูกต้อง", "เลขบัตรประชาชนต้องเป็นตัวเลข 13 หลัก", "warning");
        return;
    }

    setIsLoading(true);
    Swal.fire({
      title: "กำลังบันทึก...",
      text: "กรุณารอสักครู่",
      allowOutsideClick: false,
      background: "#2a2b2f",
      color: "#ffffff",
      didOpen: () => Swal.showLoading(),
    });

    try {
      // 1. Check for existing ID Card or Email
      const teachersRef = collection(firestore, "school-settings", schoolId, "teachers");
      const qIdCard = query(teachersRef, where("idCardNumber", "==", form.idCardNumber));
      const idCardSnap = await getDocs(qIdCard);
      
      if (!idCardSnap.empty) {
        throw new Error("เลขบัตรประชาชนนี้มีอยู่ในระบบแล้ว");
      }

      // 2. Create Auth User
      const userCredential = await createUserWithEmailAndPassword(auth, form.email, form.password);
      const user = userCredential.user;

      // 3. Upload Image
      let profileImageUrl = "";
      if (imageFile) {
        const imageRef = ref(storage, `school-settings/${schoolId}/teachers/${form.idCardNumber}.webp`);
        const snapshot = await uploadBytes(imageRef, imageFile);
        profileImageUrl = await getDownloadURL(snapshot.ref);
      }

      const finalTitle = form.title === "อื่นๆ" ? customTitle : form.title;
      if (!finalTitle) throw new Error("กรุณาระบุคำนำหน้า");

      // 4. Save Teacher Doc
      const teacherData = {
        ...form,
        title: finalTitle,
<<<<<<< HEAD
        learningArea: form.learningArea || "",
        subjectGroup: form.learningArea || "",
=======
>>>>>>> 5f8c7e1 (feat: optimize auto-scheduler and update UI labels)
        profileImageUrl,
        schoolId,
        uid: user.uid,
        role: ["teacher"],
        createdAt: serverTimestamp(),
      };
      
      await setDoc(doc(firestore, "school-settings", schoolId, "teachers", user.uid), teacherData);

      // 5. Save User Doc
      await setDoc(doc(firestore, "users", user.uid), {
        fullName: `${form.title === "อื่นๆ" ? customTitle : form.title}${form.firstName} ${form.lastName}`,
        email: form.email,
        profileUrl: profileImageUrl,
        schoolId: schoolId,
        role: ["teacher"],
        createdAt: serverTimestamp(),
      });

      Swal.fire({
        icon: "success",
        title: "เพิ่มครูสำเร็จ",
        timer: 1500,
        showConfirmButton: false,
        background: "#2a2b2f",
        color: "#ffffff",
      });
      
      navigate(`/school/${schoolId}/teachers`);
    } catch (error: any) {
      console.error("Error adding teacher:", error);
      Swal.fire({
        icon: "error",
        title: "เกิดข้อผิดพลาด",
        text: error.message || "ไม่สามารถเพิ่มข้อมูลได้",
        background: "#2a2b2f",
        color: "#ffffff",
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <MainLayout>
      <div className="h-[calc(100vh-64px)] bg-gray-50 dark:bg-[#1e1f21] flex items-center justify-center p-2 sm:p-4 overflow-hidden">
        <div className="w-full max-w-3xl bg-white dark:bg-[#2a2b2f] rounded-2xl shadow-xl overflow-hidden flex flex-col max-h-full">
          
          {/* Compact Header */}
          <div className="px-4 py-3 border-b border-gray-100 dark:border-gray-700 flex items-center justify-between bg-gray-50/50 dark:bg-gray-800/50">
            <div className="flex items-center gap-3">
              <button onClick={() => navigate(-1)} className="p-1.5 hover:bg-gray-200 dark:hover:bg-gray-700 rounded-full transition-colors">
                <FaArrowLeft className="text-gray-500" size={14} />
              </button>
              <h1 className="text-lg font-bold text-gray-800 dark:text-white flex items-center gap-2">
                <FaUserPlus className="text-indigo-600" size={18} />
                เพิ่มครูด่วน
              </h1>
            </div>
            <p className="text-[10px] text-gray-400 font-medium hidden sm:block italic">กรอกเฉพาะข้อมูลที่จำเป็นเพื่อประหยัดเวลา</p>
          </div>

          <form onSubmit={handleSubmit} className="flex-grow overflow-hidden flex flex-col">
            <div className="p-4 sm:p-6 space-y-5 flex-grow overflow-y-auto scrollbar-hide">
              
              {/* Top Row: Image and Identity */}
              <div className="flex flex-col md:flex-row gap-6">
                {/* Image Section */}
                <div className="flex flex-col items-center flex-shrink-0">
                  <label htmlFor="profileImage" className="relative cursor-pointer group">
                    <div className="w-28 h-28 rounded-full overflow-hidden border-2 border-gray-200 dark:border-gray-600 bg-gray-100 dark:bg-gray-700 flex items-center justify-center shadow-inner">
                      {imagePreview ? <img src={imagePreview} className="w-full h-full object-cover" /> : <FaUserTie className="text-4xl text-gray-400" />}
                    </div>
                    <div className="absolute bottom-0 right-0 bg-indigo-600 text-white p-2 rounded-full shadow-lg border-2 border-white dark:border-[#2a2b2f]">
                      <FaUserPlus size={12} />
                    </div>
                  </label>
                  <input type="file" id="profileImage" onChange={handleImageChange} className="hidden" accept="image/*" />
                  <span className="mt-1.5 text-[9px] font-bold text-gray-400 uppercase tracking-tighter">คลิกเพื่ออัปโหลด</span>
                </div>

                {/* Identity Grid */}
                <div className="flex-grow space-y-3">
                  <InputField 
                      label="เลขบัตรประจำตัวประชาชน" 
                      name="idCardNumber" 
                      value={form.idCardNumber} 
                      onChange={handleChange} 
                      placeholder="13 หลัก" 
                      required 
                      icon={<FaIdCard size={14} />}
                  />
                  <div className="grid grid-cols-1 sm:grid-cols-5 gap-3">
                    <div className="sm:col-span-1">
                      <label className="block text-[11px] font-bold mb-0.5 text-gray-500 dark:text-gray-400 uppercase tracking-tight">คำนำหน้า *</label>
                      <div className="h-[38px]"> {/* Fixed height to prevent jumping */}
                        {form.title === 'อื่นๆ' ? (
                          <div className="flex items-center gap-1">
                            <input
                              type="text"
                              value={customTitle}
                              onChange={(e) => setCustomTitle(e.target.value)}
                              placeholder="ระบุ..."
                              required
                              autoFocus
                              className="w-full bg-white dark:bg-[#1e1f21] border border-indigo-500 rounded-lg px-2.5 py-1.5 text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                            />
                            <button
                              type="button"
                              onClick={() => {
                                setForm(prev => ({ ...prev, title: '' }));
                                setCustomTitle('');
                              }}
                              className="p-1 text-gray-400 hover:text-red-500 transition-colors"
                            >
                              <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                              </svg>
                            </button>
                          </div>
                        ) : (
                          <select name="title" value={form.title} onChange={handleChange} required className="w-full bg-white dark:bg-[#1e1f21] border border-gray-300 dark:border-gray-600 rounded-lg px-2.5 py-1.5 text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500">
                            <option value="">เลือก</option>
                            <option value="นาย">นาย</option>
                            <option value="นาง">นาง</option>
                            <option value="น.ส.">น.ส.</option>
                            <option value="อื่นๆ">อื่นๆ</option>
                          </select>
                        )}
                      </div>
                    </div>
                    <div className="sm:col-span-2"><InputField label="ชื่อจริง" name="firstName" value={form.firstName} onChange={handleChange} required /></div>
                    <div className="sm:col-span-2"><InputField label="นามสกุล" name="lastName" value={form.lastName} onChange={handleChange} required /></div>
                  </div>
                </div>
              </div>

              {/* Middle Row: Work Info */}
              <div className="grid grid-cols-2 md:grid-cols-3 gap-4 pt-2 border-t border-gray-50 dark:border-gray-700/50">
                <div>
                  <label className="block text-[11px] font-bold mb-0.5 text-gray-500 dark:text-gray-400 uppercase tracking-tight">กลุ่มสาระฯ *</label>
                  <select name="learningArea" value={form.learningArea} onChange={handleChange} required className="w-full bg-white dark:bg-[#1e1f21] border border-gray-300 dark:border-gray-600 rounded-lg px-2.5 py-1.5 text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500">
                    <option value="">เลือกกลุ่มสาระ</option>
                    {subjectGroups.map(g => (
                      <option key={g.id} value={g.name}>{g.name}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-[11px] font-bold mb-0.5 text-gray-500 dark:text-gray-400 uppercase tracking-tight">ตำแหน่ง *</label>
                  <select name="position" value={form.position} onChange={handleChange} required className="w-full bg-white dark:bg-[#1e1f21] border border-gray-300 dark:border-gray-600 rounded-lg px-2.5 py-1.5 text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500">
                    <option value="">เลือกตำแหน่ง</option>
                    <option value="ครู">ครู</option>
                    <option value="ครูผู้ช่วย">ครูผู้ช่วย</option>
                    <option value="ผู้อำนวยการ">ผู้อำนวยการ</option>
                    <option value="รองผู้อำนวยการ">รองผู้อำนวยการ</option>
                  </select>
                </div>
                <div className="col-span-2 md:col-span-1">
                  <InputField label="รหัสประจำตัวบุคลากร" name="teacherId" value={form.teacherId} onChange={handleChange} placeholder="ระบุรหัส (ถ้ามี)" />
                </div>
              </div>

              {/* Bottom Row: Auth Info */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2 border-t border-gray-50 dark:border-gray-700/50">
                <InputField label="อีเมล (สำหรับเข้าใช้งาน)" name="email" value={form.email} onChange={handleChange} type="email" placeholder="email@school.com" required icon={<FaEnvelope size={14} />} />
                <InputField label="รหัสผ่าน (Password)" name="password" value={form.password} onChange={handleChange} type="password" placeholder="อย่างน้อย 6 ตัวอักษร" required icon={<FaLock size={14} />} />
              </div>

            </div>

            {/* Compact Footer */}
            <div className="p-4 sm:p-6 bg-gray-50 dark:bg-gray-800/30 border-t border-gray-100 dark:border-gray-700 flex justify-end items-center gap-4">
              <button type="button" onClick={() => navigate(-1)} className="text-sm font-bold text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 transition-colors uppercase tracking-widest">
                ยกเลิก
              </button>
              <button type="submit" disabled={isLoading} className="px-10 py-4 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-black rounded-2xl shadow-xl shadow-indigo-200 dark:shadow-none transition-all hover:scale-105 active:scale-95 flex items-center gap-3 disabled:opacity-50 uppercase tracking-widest">
                {isLoading ? "กำลังบันทึก..." : <><FaUserPlus size={18} /> ยืนยันบันทึกข้อมูล</>}
              </button>
            </div>
          </form>
        </div>
      </div>
    </MainLayout>
  );
}
