import React, { useState, FormEvent, useEffect, useRef } from "react";
import MainLayout from "@/layouts/MainLayout";
import ProfileAvatar from "@/components/Shared/ProfileAvatar";
import { useParams, useNavigate } from "react-router-dom";
import { auth, firestore, storage } from "@/firebase";
import {
  collection,
  addDoc,
  serverTimestamp,
  getDocs,
  query,
  orderBy,
  setDoc,
  doc,
  getDoc,
  where,
} from "firebase/firestore";
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";
import { FirebaseError } from "firebase/app";
import { createUserWithEmailAndPassword } from "firebase/auth";
import Swal from "sweetalert2";
import { compressImage } from "@/utils/imageUtils";
import { getLevelsByRange } from "@/utils/schoolUtils";
import { syncHeadOfLearningArea } from "@/utils/subjectGroupSync";
import { useSubjectGroups } from "@/hooks/useSubjectGroups";
import { useSelector } from "react-redux";
import { RootState } from "@/store";
import { FaChevronDown, FaCheck } from 'react-icons/fa';
import BackButton from "@/components/Shared/BackButton";
import { isActiveTeacherSummaryStatus, updateOwnerAndSchoolCounts } from "@/utils/ownerStatsUtils";

// Component ย่อยสำหรับ Card (ไม่มีการเปลี่ยนแปลง)
const InfoCard: React.FC<{ title: string; children: React.ReactNode }> = ({
  title,
  children,
}) => (
  <div className="bg-white dark:bg-[#2a2b2f] p-6 rounded-2xl shadow-sm dark:shadow-none">
    <h2 className="text-lg font-semibold mb-4 text-gray-800 dark:text-gray-200 border-b border-gray-200 dark:border-gray-600 pb-2">
      {title}
    </h2>
    <div className="space-y-4">{children}</div>
  </div>
);

// Component ย่อยสำหรับ Input field (ไม่มีการเปลี่ยนแปลง)
const InputField: React.FC<{
  label: string;
  name: string;
  value: string;
  onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => void;
  type?: string;
  placeholder?: string;
  required?: boolean;
}> = ({ label, name, value, onChange, type = "text", placeholder, required = false }) => (
  <div>
    <label className="block text-sm font-medium mb-1 text-gray-700 dark:text-gray-400">
      {label} {required && <span className="text-red-500">*</span>}
    </label>
    {type === "textarea" ? (
      <textarea
        name={name}
        value={value}
        onChange={onChange}
        rows={3}
        placeholder={placeholder}
        required={required}
        className="w-full bg-white dark:bg-[#1e1f21] border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500 transition text-gray-900 dark:text-white"
      />
    ) : (
      <input
        type={type}
        name={name}
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        required={required}
        className="w-full bg-white dark:bg-[#1e1f21] border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500 transition text-gray-900 dark:text-white"
      />
    )}
  </div>
);

interface School {
  id: string;
  schoolName: string;
}

const initialState = {
  title: "",
  firstName: "",
  lastName: "",
  teacherId: "",
  position: "",
  academicStanding: "",
  licenseNumber: "",
  startDate: "",
  educationLevel: "",
  major: "",
  email: "",
  password: "",
  department: "",
  dob: "",
  gender: "",
  contact: "",
  address: "",
  profileImageUrl: "",
  schoolId: "",
  homeroomGrade: "",
  homeroomRoom: "",
  learningArea: "",
  isHeadOfLearningArea: false,
  isHeadOfAssessment: false,
  isGuidanceTeacher: false,
  advisorRole: "",
  idCardNumber: "",
  lineId: "",
  role: ["teacher"] as string[],
  status: "อยู่",
};

export default function AddTeacherPage() {
  const { schoolId: urlSchoolId } = useParams<{ schoolId?: string }>();
  const navigate = useNavigate();
  const [form, setForm] = useState(initialState);
  const [isLoading, setIsLoading] = useState(false);
  const [schools, setSchools] = useState<School[]>([]);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [customTitle, setCustomTitle] = useState("");
  const [customGender, setCustomGender] = useState("");
  const [currentUserRole, setCurrentUserRole] = useState<string | null>(null);
  const [isSuperAdmin, setIsSuperAdmin] = useState(false);
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
    const currentRoles = [...form.role];
    const updatedRoles = currentRoles.includes(roleValue)
      ? currentRoles.filter(r => r !== roleValue)
      : [...currentRoles, roleValue];

    setForm(prev => ({ ...prev, role: updatedRoles }));
  };

  // ดึงข้อมูลกลุ่มสาระจาก Firebase (อ้างอิง SubjectGroupManagementPage)
  const { subjectGroups } = useSubjectGroups(form.schoolId || undefined);


  useEffect(() => {
    const fetchSchoolAndUserRole = async () => {
      const currentUser = auth.currentUser;
      if (!currentUser) {
        Swal.fire({
          icon: "warning",
          title: "ไม่ได้รับอนุญาต",
          text: "คุณต้องเข้าสู่ระบบเพื่อดำเนินการนี้",
          background: "#2a2b2f",
          color: "#ffffff",
        });
        navigate("/login");
        return;
      }

      const userDocRef = doc(firestore, "users", currentUser.uid);
      const userDocSnap = await getDoc(userDocRef);

      if (userDocSnap.exists()) {
        const userData = userDocSnap.data();
        const role = userData.role || "user";
        setCurrentUserRole(role);

        const isSA = role === "super_admin";
        setIsSuperAdmin(isSA);
        const loggedInUserSchoolId = userData.schoolId;

        if (isSA) {
          const schoolsCollection = collection(firestore, "school-settings");
          const q = query(schoolsCollection, orderBy("schoolName"));
          const schoolSnapshot = await getDocs(q);
          const schoolList = schoolSnapshot.docs.map((doc) => ({
            id: doc.id,
            schoolName: doc.data().schoolName,
          })) as School[];
          setSchools(schoolList);

          if (urlSchoolId) {
            setForm((prev) => ({ ...prev, schoolId: urlSchoolId }));
          }
        } else if (loggedInUserSchoolId) {
          const schoolDocRef = doc(firestore, "school-settings", loggedInUserSchoolId);
          const schoolDocSnap = await getDoc(schoolDocRef);
          if (schoolDocSnap.exists()) {
            const schoolData = {
              id: schoolDocSnap.id,
              schoolName: schoolDocSnap.data().schoolName,
            } as School;
            setSchools([schoolData]);
            setForm((prev) => ({ ...prev, schoolId: loggedInUserSchoolId }));
          }
        }
      } else {
        console.warn("User document not found in Firestore.");
        Swal.fire({
          icon: "error",
          title: "ข้อผิดพลาด",
          text: "ไม่พบข้อมูลผู้ใช้ กรุณาลองเข้าสู่ระบบใหม่",
          background: "#2a2b2f",
          color: "#ffffff",
        });
      }
    };

    fetchSchoolAndUserRole().catch(console.error);
  }, [urlSchoolId, navigate]);

  // ✅ ดึง availableLevels จาก Redux (แทนการ fetch school-settings ซ้ำ)
  const reduxSchoolSettings = useSelector((state: RootState) => state.schoolSettings);
  useEffect(() => {
    if (reduxSchoolSettings.status === 'succeeded' && reduxSchoolSettings.availableClassOptions.length > 0) {
      setAvailableLevels(reduxSchoolSettings.availableClassOptions.map(([_, name]) => name));
    }
  }, [reduxSchoolSettings.status, reduxSchoolSettings.availableClassOptions]);



  function handleChange(
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>
  ) {
    const target = e.target;
    const value = target.type === 'checkbox' ? (target as HTMLInputElement).checked : target.value;
    const name = target.name;

    if (name === "title" && value !== "อื่นๆ") {
      setCustomTitle("");
    }
    if (name === "gender" && value !== "อื่นๆ") {
      setCustomGender("");
    }
    if (name === "advisorRole") {
      setForm((prev) => ({ ...prev, [name]: value as string, homeroomGrade: "", homeroomRoom: "" }));
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
    setIsLoading(true);

    if (
      !form.schoolId ||
      !form.email ||
      !form.password ||
      !form.firstName ||
      !form.lastName ||
      !form.department ||
      !form.position ||
      !form.teacherId
    ) {
      Swal.fire({
        icon: 'warning',
        title: 'ข้อมูลไม่ครบ',
        text: 'กรุณากรอกข้อมูลที่มีเครื่องหมายดอกจัน (*) ให้ครบถ้วน',
        background: '#2a2b2f',
        color: '#ffffff'
      });
      setIsLoading(false);
      return;
    }

    // --- 🔍 Check for Duplicates (By teacherId or idCardNumber) ---
    const teachersRef = collection(firestore, "school-settings", form.schoolId, "teachers");
    let conflictDoc: any = null;

    // 1. Check Teacher ID
    if (form.teacherId) {
      const qId = query(teachersRef, where("teacherId", "==", form.teacherId));
      const querySnapshotId = await getDocs(qId);
      if (!querySnapshotId.empty) {
        conflictDoc = querySnapshotId.docs[0].data();
      }
    }

    // 2. Check ID Card Number (if not found by ID)
    if (!conflictDoc && form.idCardNumber) {
      const qCard = query(teachersRef, where("idCardNumber", "==", form.idCardNumber));
      const querySnapshotCard = await getDocs(qCard);
      if (!querySnapshotCard.empty) {
        conflictDoc = querySnapshotCard.docs[0].data();
      }
    }

    if (conflictDoc) {
      Swal.fire({
        icon: "warning",
        title: "พบข้อมูลซ้ำในระบบ",
        html: `
          <div class="text-left space-y-3">
            <p>พบข้อมูลครูที่มีรหัสหรือเลขบัตรประชาชนนี้อยู่แล้วในระบบ:</p>
            <div class="p-4 bg-gray-50 dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700">
              <div class="font-bold text-indigo-600 dark:text-indigo-400 text-lg">
                ${conflictDoc.title || ""}${conflictDoc.firstName} ${conflictDoc.lastName}
              </div>
              <div class="text-sm text-gray-500 mt-1">
                ฝ่ายงาน: ${conflictDoc.department || "-"} | ตำแหน่ง: ${conflictDoc.position || "-"}
              </div>
              <div class="text-xs text-gray-400 mt-1">
                รหัสครู: ${conflictDoc.teacherId || "-"} | เลขบัตร: ${conflictDoc.idCardNumber || "-"}
              </div>
            </div>
            <p class="text-xs text-red-500 font-medium">* กรุณาตรวจสอบข้อมูลอีกครั้งเพื่อป้องกันการบันทึกซ้ำ</p>
          </div>
        `,
        background: "#2a2b2f",
        color: "#ffffff",
        confirmButtonText: "รับทราบ",
        confirmButtonColor: "#4f46e5",
      });
      setIsLoading(false);
      return;
    }

    Swal.fire({
      title: "กำลังบันทึกข้อมูล...",
      text: "กรุณารอสักครู่",
      allowOutsideClick: false,
      background: "#2a2b2f",
      color: "#ffffff",
      didOpen: () => Swal.showLoading(),
    });

    try {
      const { profileImageUrl, email, password, schoolId, ...teacherData } = form;

      const userCredential = await createUserWithEmailAndPassword(auth, email, password);
      const user = userCredential.user;
      console.log("User created in Auth with UID:", user.uid);

      const finalTitle = teacherData.title === "อื่นๆ" ? customTitle : teacherData.title;
      const finalGender = teacherData.gender === "อื่นๆ" ? customGender : teacherData.gender;
      if (!finalTitle) {
        throw new Error("กรุณาระบุคำนำหน้า");
      }
      if (!finalGender) {
        throw new Error("กรุณาระบุเพศ");
      }
      if (!teacherData.idCardNumber) {
        throw new Error("กรุณาระบุเลขบัตรประชาชน");
      }

      let finalProfileImageUrl = "";
      if (imageFile) {
        const fileExtension = '.jpg';

        const imageRef = ref(storage, `school-settings/${schoolId}/teachers/${teacherData.idCardNumber}${fileExtension}`);
        const snapshot = await uploadBytes(imageRef, imageFile);
        finalProfileImageUrl = await getDownloadURL(snapshot.ref);
      }

      const dataToSave: any = {
        ...teacherData,
        title: finalTitle,
        gender: finalGender,
        learningArea: teacherData.learningArea || "",
        subjectGroup: teacherData.learningArea || "",
        schoolId: schoolId,
        email: email,
        uid: user.uid,
        role: form.role,
        profileImageUrl: finalProfileImageUrl,
        isHomeroomTeacher: form.homeroomGrade !== "",
        createdAt: serverTimestamp(),
      };

      await setDoc(
        doc(firestore, "school-settings", schoolId, "teachers", user.uid),
        dataToSave
      );
      if (isActiveTeacherSummaryStatus(form.status)) {
        await updateOwnerAndSchoolCounts(firestore, schoolId, { teachers: 1 });
      }

      await setDoc(doc(firestore, "users", user.uid), {
        fullName: `${finalTitle}${teacherData.firstName} ${teacherData.lastName}`,
        email: email,
        profileUrl: finalProfileImageUrl,
        schoolId: schoolId,
        role: form.role,
        createdAt: serverTimestamp(),
      });

      console.log("Teacher and User documents created for UID:", user.uid);

      // Sync head of learning area to subject_groups collection
      if (form.isHeadOfLearningArea && form.learningArea) {
        const fullName = `${finalTitle}${teacherData.firstName} ${teacherData.lastName}`;
        await syncHeadOfLearningArea(schoolId, user.uid, fullName, form.learningArea, true);
      }

      setForm(initialState);
      setImageFile(null);
      setImagePreview(null);
      setCustomTitle("");
      setCustomGender("");

      if (schools.length === 1) {
        setForm(prev => ({ ...prev, schoolId: schools[0].id }));
      }

      Swal.fire({
        icon: "success",
        title: "บันทึกสำเร็จ!",
        text: "ข้อมูลครูใหม่ถูกเพิ่มเข้าระบบเรียบร้อยแล้ว",
        background: "#2a2b2f",
        color: "#ffffff",
        timer: 2000,
        showConfirmButton: false,
      });
    } catch (e) {
      console.error("Error adding document: ", e);
      let errorMessage = "เกิดข้อผิดพลาดที่ไม่รู้จักในการบันทึกข้อมูล";
      if (e instanceof FirebaseError) {
        if (e.code === "auth/email-already-in-use") {
          errorMessage = "อีเมลนี้ถูกใช้งานแล้ว กรุณาใช้อีเมลอื่น";
        } else if (e.code === "auth/weak-password") {
          errorMessage = "รหัสผ่านไม่ปลอดภัย กรุณาตั้งรหัสผ่านอย่างน้อย 6 ตัวอักษร";
        } else if (e.code.startsWith("storage/")) {
          errorMessage = `เกิดข้อผิดพลาดในการอัปโหลดไฟล์: ${e.message}`;
        } else {
          errorMessage = `เกิดข้อผิดพลาด Firebase: ${e.message}`;
        }
      } else if (e instanceof Error) {
        errorMessage = `เกิดข้อผิดพลาด: ${e.message}`;
      }
      Swal.fire({
        icon: "error",
        title: "เกิดข้อผิดพลาด",
        text: errorMessage,
        background: "#2a2b2f",
        color: "#ffffff",
      });
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <MainLayout>
      <div className="min-h-screen bg-gray-50 dark:bg-[#1e1f21] text-gray-900 dark:text-white">
        <div className="max-w-4xl mx-auto px-3 sm:px-4 md:px-6 lg:px-8 py-4 sm:py-6 lg:py-8">
          <header className="mb-8 flex items-center gap-4">
            <BackButton to="/academic/hub/personnel_info" />
            <div>
              <h1 className="text-3xl font-bold tracking-tight">เพิ่มข้อมูลครูใหม่</h1>
              <p className="mt-1 text-gray-500 dark:text-gray-400">กรอกรายละเอียดข้อมูลของครูให้ครบถ้วน (เครื่องหมาย <span className="text-red-500">*</span> คือข้อมูลที่จำเป็น)</p>
            </div>
          </header>

          <form onSubmit={handleSubmit} className="space-y-6">
            <InfoCard title="ข้อมูลส่วนตัว">
              <div className="flex flex-col sm:flex-row items-center sm:items-start gap-6">
                {/* ส่วนอัปโหลดรูปภาพ (คงเดิม) */}
                <div className="flex-shrink-0">
                  <label htmlFor="profileImage" className="relative cursor-pointer group block">
                    {imagePreview ? (
                      <ProfileAvatar
                        src={imagePreview}
                        alt="Teacher profile"
                        className="w-32 h-32 border-4 border-gray-200 dark:border-gray-600"
                      />
                    ) : (
                      <div className="w-32 h-32 rounded-full border-4 border-dashed border-gray-300 dark:border-gray-600 bg-gray-100 dark:bg-gray-700/50 flex items-center justify-center">
                        <svg
                          xmlns="http://www.w3.org/2000/svg"
                          className="h-12 w-12 text-gray-500"
                          fill="none"
                          viewBox="0 0 24 24"
                          stroke="currentColor"
                          strokeWidth={1}
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
                          />
                        </svg>
                      </div>
                    )}
                    <div className="absolute bottom-0 right-0 bg-indigo-600 group-hover:bg-indigo-700 text-white rounded-full p-2 transition-all duration-200 transform group-hover:scale-110">
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        className="h-5 w-5"
                        viewBox="0 0 20 20"
                        fill="currentColor"
                      >
                        <path d="M17.414 2.586a2 2 0 00-2.828 0L7 10.172V13h2.828l7.586-7.586a2 2 0 000-2.828z" />
                        <path
                          fillRule="evenodd"
                          d="M2 6a2 2 0 012-2h4a1 1 0 010 2H4v10h10v-4a1 1 0 112 0v4a2 2 0 01-2 2H4a2 2 0 01-2-2V6z"
                          clipRule="evenodd"
                        />
                      </svg>
                    </div>
                  </label>
                  <input
                    type="file"
                    id="profileImage"
                    name="profileImage"
                    accept="image/jpeg,image/png"
                    onChange={handleImageChange}
                    className="hidden"
                  />
                </div>

                {/* ส่วนข้อมูลหลัก */}
                <div className="flex-grow space-y-4 w-full">

                  {/* 📌 แถว ชื่อ (ปรับปรุงใหม่) */}
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">

                    {/* คำนำหน้า */}
                    <div>
                      <label className="block text-sm font-medium mb-1 text-gray-700 dark:text-gray-400">คำนำหน้า <span className="text-red-500">*</span></label>
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
                              setForm(prev => ({ ...prev, title: '' })); // Reset to prompt selection
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

                    {/* ชื่อจริง */}
                    <div>
                      <InputField
                        label="ชื่อจริง"
                        name="firstName"
                        value={form.firstName}
                        onChange={handleChange}
                        required
                      />
                    </div>
                    {/* นามสกุล */}
                    <div>
                      <InputField
                        label="นามสกุล"
                        name="lastName"
                        value={form.lastName}
                        onChange={handleChange}
                        required
                      />
                    </div>
                  </div>
                  {/* 📌 สิ้นสุดแถว ชื่อ (ปรับปรุงใหม่) */}

                  {/* 📌 แถว ข้อมูลวิชาชีพ (เพิ่มใหม่) */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <InputField
                      label="เลขบัตรประชาชน"
                      name="idCardNumber"
                      value={form.idCardNumber}
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

                  {/* แถว ตำแหน่ง, ฝ่ายงาน, รหัสตำแหน่งครู, และ ครูประจำชั้น */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    {/* ตำแหน่ง */}
                    <div>
                      <label className="block text-sm font-medium mb-1 text-gray-700 dark:text-gray-400">ตำแหน่ง <span className="text-red-500">*</span></label>
                      <select
                        name="position"
                        value={form.position}
                        onChange={handleChange}
                        className="w-full bg-white dark:bg-[#1e1f21] border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500 transition text-gray-900 dark:text-white"
                        required
                      >
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

                    {/* รหัสตำแหน่งครู */}
                    <InputField
                      label="รหัสตำแหน่งครู"
                      name="teacherId"
                      value={form.teacherId}
                      onChange={handleChange}
                      placeholder="เช่น 12345"
                      required
                    />


                    {/* ฝ่ายงาน */}
                    <div>
                      <label className="block text-sm font-medium mb-1 text-gray-700 dark:text-gray-400">ฝ่ายงาน <span className="text-red-500">*</span></label>
                      <select
                        name="department"
                        value={form.department}
                        onChange={handleChange}
                        className="w-full bg-white dark:bg-[#1e1f21] border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500 transition text-gray-900 dark:text-white"
                        required
                      >
                        <option value="">เลือกฝ่ายงาน</option>
                        <option value="งานบริหารวิชาการ">งานบริหารวิชาการ</option>
                        <option value="งานบริหารงบประมาณ">งานบริหารงบประมาณ</option>
                        <option value="งานบริหารบุคคล">งานบริหารบุคคล</option>
                        <option value="งานบริหารทั่วไป">งานบริหารทั่วไป</option>
                        <option value="งานบริหารกิจการนักเรียน">งานบริหารกิจการนักเรียน</option>
                      </select>
                    </div>

                    {/* สถานะดูแลชั้นเรียน */}
                    <div>
                      <label className="block text-sm font-medium mb-1 text-gray-700 dark:text-gray-400">สถานะดูแลชั้นเรียน</label>
                      <select
                        name="advisorRole"
                        value={form.advisorRole}
                        onChange={handleChange}
                        className="w-full bg-white dark:bg-[#1e1f21] border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500 transition text-gray-900 dark:text-white"
                      >
                        <option value="">-- ระบุสถานะ --</option>
                        <option value="ครูสอนประจำชั้น">ครูสอนประจำชั้น</option>
                        <option value="ครูที่ปรึกษา">ครูที่ปรึกษา</option>
                      </select>
                    </div>

                    {/* ฟอร์ม ระดับชั้นที่ดูแล */}
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
                      <select name="homeroomRoom" value={form.homeroomRoom} onChange={handleChange} disabled={!form.homeroomGrade} className="w-full bg-white dark:bg-[#1e1f21] border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500 transition text-gray-900 dark:text-white disabled:opacity-50 disabled:cursor-not-allowed">
                        <option value="">-- เลือกห้อง --</option>
                        {Array.from({ length: 20 }, (_, i) => i + 1).map(r => (
                          <option key={r} value={r}>{r}</option>
                        ))}
                      </select>
                    </div>

                    {/* กลุ่มสาระการเรียนรู้ และ หัวหน้ากลุ่มสาระ (รวมบรรทัดเดียวกัน) */}
                    <div>
                      <label className="block text-sm font-medium mb-1 text-gray-700 dark:text-gray-400">กลุ่มสาระการเรียนรู้</label>
                      <select
                        name="learningArea"
                        value={form.learningArea}
                        onChange={handleChange}
                        className="w-full bg-white dark:bg-[#1e1f21] border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500 transition text-gray-900 dark:text-white"
                      >
                        <option value="">-- เลือกกลุ่มสาระ --</option>
                        {subjectGroups.map((group) => (
                          <option key={group.id} value={group.name}>{group.name}</option>
                        ))}
                      </select>
                    </div>
                  </div>
                  {/* บทบาทพิเศษ */}
                  <div className="sm:col-span-2">
                    <label className="block text-sm font-medium mb-2 text-gray-700 dark:text-gray-400">บทบาทพิเศษ</label>
                    <div className="flex flex-wrap gap-x-6 gap-y-2 p-4 bg-gray-50 dark:bg-gray-800/50 rounded-lg border border-gray-200 dark:border-gray-700">
                      <label className="flex items-center space-x-2 cursor-pointer">
                        <input type="checkbox" name="isHeadOfLearningArea" checked={form.isHeadOfLearningArea} onChange={handleChange} className="w-5 h-5 text-indigo-600 border-gray-300 rounded focus:ring-indigo-500 dark:bg-[#1e1f21] dark:border-gray-600" />
                        <span className="text-sm font-medium text-gray-700 dark:text-gray-300 whitespace-nowrap">เป็นหัวหน้ากลุ่มสาระ</span>
                      </label>
                      <label className="flex items-center space-x-2 cursor-pointer">
                        <input type="checkbox" name="isHeadOfAssessment" checked={form.isHeadOfAssessment} onChange={handleChange} className="w-5 h-5 text-indigo-600 border-gray-300 rounded focus:ring-indigo-500 dark:bg-[#1e1f21] dark:border-gray-600" />
                        <span className="text-sm font-medium text-gray-700 dark:text-gray-300 whitespace-nowrap">เป็นหัวหน้างานวัดและประเมินผล</span>
                      </label>
                      <label className="flex items-center space-x-2 cursor-pointer">
                        <input type="checkbox" name="isGuidanceTeacher" checked={form.isGuidanceTeacher} onChange={handleChange} className="w-5 h-5 text-indigo-600 border-gray-300 rounded focus:ring-indigo-500 dark:bg-[#1e1f21] dark:border-gray-600" />
                        <span className="text-sm font-medium text-gray-700 dark:text-gray-300 whitespace-nowrap">เป็นครูแนะแนว</span>
                      </label>
                    </div>
                  </div>
                </div>
              </div>
            </InfoCard>

            {/* InfoCard: ข้อมูลสำหรับเข้าสู่ระบบ (คงเดิม) */}
            <InfoCard title="ข้อมูลสำหรับเข้าสู่ระบบ">
              <div>
                <label className="block text-sm font-medium mb-1 text-gray-700 dark:text-gray-400">โรงเรียน <span className="text-red-500">*</span></label>
                <select name="schoolId" value={form.schoolId} onChange={handleChange} className="w-full bg-white dark:bg-[#1e1f21] border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500 transition disabled:bg-gray-200 dark:disabled:bg-gray-700 disabled:cursor-not-allowed text-gray-900 dark:text-white" required disabled={schools.length === 1}>
                  <option value="">-- เลือกโรงเรียน --</option>
                  {schools.map(school => (
                    <option key={school.id} value={school.id}>{school.schoolName}</option>
                  ))}
                </select>
              </div>
              <InputField label="อีเมล" name="email" value={form.email} onChange={handleChange} type="email" placeholder="ใช้สำหรับ Login" required />
              <InputField label="รหัสผ่าน" name="password" value={form.password} onChange={handleChange} type="password" placeholder="อย่างน้อย 6 ตัวอักษร" required />
            </InfoCard>

            {/* InfoCard: ข้อมูลเพิ่มเติม (คงเดิม) */}
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

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mt-4">
                <InputField label="วันเกิด" name="dob" value={form.dob} onChange={handleChange} type="date" />
                <div>
                  <label className="block text-sm font-medium mb-1 text-gray-700 dark:text-gray-400">เพศ <span className="text-red-500">*</span></label>
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

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-4">
                <InputField label="เบอร์ติดต่อ" name="contact" value={form.contact} onChange={handleChange} placeholder="เบอร์โทรศัพท์" />
                <InputField label="Line ID" name="lineId" value={form.lineId} onChange={handleChange} placeholder="Line ID" />
              </div>
              <InputField label="ที่อยู่" name="address" value={form.address} onChange={handleChange} type="textarea" placeholder="ที่อยู่ปัจจุบัน" />
            </InfoCard>

            <InfoCard title="บทบาทและสิทธิ์การใช้งาน">
              <div className="relative" ref={dropdownRef}>
                <label className="block text-sm font-medium mb-2 text-gray-700 dark:text-gray-400">บทบาท/สิทธิ์การใช้งานในระบบ <span className="text-red-500">*</span></label>
                <div
                  onClick={() => setIsRoleDropdownOpen(!isRoleDropdownOpen)}
                  className="flex items-center justify-between w-full px-4 py-2 bg-white dark:bg-[#1e1f21] border border-gray-300 dark:border-gray-600 rounded-lg shadow-sm cursor-pointer focus:ring-2 focus:ring-indigo-500 transition-all min-h-[42px]"
                >
                  <div className="flex flex-wrap gap-1">
                    {form.role.length > 0 ? (
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
                  <FaChevronDown className={`text-gray-400 text-[10px] transition-transform duration-200 ${isRoleDropdownOpen ? 'rotate-180' : ''}`} />
                </div>

                {isRoleDropdownOpen && (
                  <div className="absolute z-50 bottom-full mb-1 w-full bg-white dark:bg-[#2a2b2f] border border-gray-200 dark:border-gray-700 rounded-lg shadow-xl py-1 max-h-60 overflow-auto animate-in slide-in-from-bottom-2 fade-in zoom-in duration-200">
                    {userRoles.map((role) => {
                      const isChecked = form.role.includes(role.value);
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

            {/* ปุ่มบันทึก (คงเดิม) */}
            <div className="flex items-center justify-end gap-4 pt-4">
              <button
                type="submit"
                disabled={isLoading}
                className="inline-flex justify-center py-2 px-6 border border-transparent shadow-sm text-sm font-medium rounded-md text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 transition disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isLoading ? "กำลังบันทึก..." : "บันทึกข้อมูล"}
              </button>
            </div>
          </form>
        </div>
      </div>
    </MainLayout>
  );
}
