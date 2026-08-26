import React, { useState, FormEvent, useEffect } from "react";
import MainLayout from "@/layouts/MainLayout";
import ProfileAvatar from "@/components/Shared/ProfileAvatar";
import { useParams, Link } from "react-router-dom";
// 💡 สำคัญ: ต้องมั่นใจว่า "@/firebase" มีการ export 'storage' และ 'firestore' อย่างถูกต้อง
import { firestore, storage, auth } from "@/firebase";
import { collection, addDoc, serverTimestamp, getDocs, query, orderBy, doc, getDoc, where } from "firebase/firestore";
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";
// 💡 Import FirebaseError และ StorageErrorCode สำหรับการจัดการข้อผิดพลาด Storage
import { FirebaseError } from "firebase/app";
import { StorageErrorCode } from "firebase/storage";
import Swal from 'sweetalert2';
import { compressImage } from "@/utils/imageUtils";
import { FaIdCard, FaUsers, FaMapMarkerAlt, FaHeartbeat, FaBus, FaGraduationCap, FaInfoCircle, FaUserPlus } from "react-icons/fa";
import { getLevelsByRange } from "@/utils/schoolUtils";
import { useSelector } from "react-redux";
import { RootState } from "@/store";
import BackButton from "@/components/Shared/BackButton";
import { buildDuplicateStudentHtml, isExitStudentStatus } from "@/utils/studentStatusUtils";
import { isValidBirthDate, normalizeBirthDateInput, toBuddhistBirthDateForSave } from "@/utils/birthDateUtils";
import { isActiveStudentSummaryStatus, updateOwnerAndSchoolCounts } from "@/utils/ownerStatsUtils";
import { updateStudentReportSummaryForChange } from "@/utils/studentReportSummaryUtils";

// Component ย่อยสำหรับ Card (ไม่มีการเปลี่ยนแปลง)
const InfoCard: React.FC<{ title: string; children: React.ReactNode }> = ({ title, children }) => (
  <div className="bg-white dark:bg-[#2a2b2f] p-6 rounded-2xl shadow-sm dark:shadow-none">
    <h2 className="text-lg font-semibold mb-4 text-gray-800 dark:text-gray-200 border-b border-gray-200 dark:border-gray-600 pb-2">{title}</h2>
    <div className="space-y-4">
      {children}
    </div>
  </div>
);

// Component ย่อยสำหรับ Input field (ไม่มีการเปลี่ยนแปลง)
const InputField: React.FC<{ label: string; name: string; value: string; onChange: (e: React.ChangeEvent<HTMLInputElement>) => void; type?: string; placeholder?: string; maxLength?: number; }> = ({ label, name, value, onChange, type = "text", placeholder, maxLength }) => (
  <div>
    <label className="block text-sm font-medium mb-1 text-gray-700 dark:text-gray-400">{label}</label>
    <input
      type={type}
      name={name}
      value={value}
      maxLength={maxLength}
      onChange={onChange}
      placeholder={placeholder}
      className="w-full bg-white dark:bg-[#1e1f21] border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500 transition text-gray-900 dark:text-white"
    />
  </div>
);

const CheckboxField: React.FC<{ label: string; name: string; checked: boolean; onChange: (e: React.ChangeEvent<HTMLInputElement>) => void; }> = ({ label, name, checked, onChange }) => (
  <div className="flex items-center space-x-3 py-2">
    <input
      type="checkbox"
      id={name}
      name={name}
      checked={checked}
      onChange={onChange}
      className="w-5 h-5 text-indigo-600 border-gray-300 rounded focus:ring-indigo-500 dark:bg-[#1e1f21] dark:border-gray-600"
    />
    <label htmlFor={name} className="text-sm font-medium text-gray-700 dark:text-gray-400 cursor-pointer">{label}</label>
  </div>
);

const statusColorMap: { [key: string]: { bg: string; hover: string; text: string } } = {
  "กำลังศึกษาอยู่": { bg: "bg-green-600", hover: "hover:bg-green-700", text: "text-white" },
  "พักการเรียน": { bg: "bg-yellow-500", hover: "hover:bg-yellow-600", text: "text-gray-900" },
  "แขวนลอย": { bg: "bg-amber-600", hover: "hover:bg-amber-700", text: "text-white" },
  "ย้าย": { bg: "bg-blue-600", hover: "hover:bg-blue-700", text: "text-white" },
  "ลาออก": { bg: "bg-red-600", hover: "hover:bg-red-700", text: "text-white" },
  "จำหน่าย": { bg: "bg-gray-600", hover: "hover:bg-gray-700", text: "text-white" },
};

// Component ย่อยสำหรับ Status Switch (ไม่มีการเปลี่ยนแปลง)
const StatusSwitch: React.FC<{
  label: string;
  name: string;
  options: readonly string[];
  value: string;
  onChange: (name: string, value: string) => void;
}> = ({ label, name, options, value, onChange }) => {
  return (
    <div>
      <label className="block text-sm font-medium mb-2 text-gray-700 dark:text-gray-400">{label}</label>
      <div className="flex bg-gray-100 dark:bg-[#1e1f21] border border-gray-300 dark:border-gray-600 rounded-lg p-1 space-x-1">
        {options.map((option) => {
          const isSelected = value === option;
          const colors = statusColorMap[option] || { bg: "bg-indigo-600", hover: "hover:bg-indigo-700", text: "text-white" };
          return (
            <button
              key={option}
              type="button"
              onClick={() => onChange(name, option)}
              className={`w-full text-center px-3 py-1.5 text-sm font-medium rounded-md transition-colors duration-200 focus:outline-none ${isSelected ? `${colors.bg} ${colors.text} shadow-sm` : `text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700`
                }`}
            >
              {option}

            </button>
          );
        })}
      </div>
    </div>
  );
};

interface School {
  id: string;
  schoolName: string;
}

const initialState = {
  // 1. ข้อมูลระบุตัวตนนักเรียน (Student Identity)
  idCardNumber: "",
  studentId: "",
  title: "",
  firstName: "",
  lastName: "",
  firstNameEn: "",
  lastNameEn: "",
  nickname: "",
  gender: "",
  birthDate: "",
  ageYear: "",
  ageMonth: "",
  bloodType: "",
  birthProvince: "",
  nationality: "ไทย",
  race: "ไทย",
  religion: "พุทธ",

  // 2. ข้อมูลด้านการเรียน (Academic Info)
  schoolId: "",
  classLevel: "",
  room: "",
  studentNumber: "",
  studentStatus: "กำลังศึกษาอยู่",
  exitDate: "",
  exitReason: "",
  exitDestinationSchool: "",
  studentType: "ปกติ",
  gpa: "",
  gpax: "",

  // 3. ข้อมูลพี่น้องและลำดับบุตร (Family Order)
  elderBrotherCount: "0",
  youngerBrotherCount: "0",
  elderSisterCount: "0",
  youngerSisterCount: "0",
  childOrder: "1",
  childOrderInCategory: "1",
  studyingSiblingCount: "0",

  // 4. สถานภาพครอบครัว (Family Status)
  parentsMaritalStatus: "อยู่ด้วยกัน",

  // 5. ข้อมูลบิดา (Father Info)
  fatherIdNumber: "",
  fatherTitle: "",
  fatherFirstName: "",
  fatherLastName: "",
  fatherOccupation: "",
  fatherMonthlyIncome: "",
  fatherPhone: "",

  // 6. ข้อมูลมารดา (Mother Info)
  motherIdNumber: "",
  motherTitle: "",
  motherFirstName: "",
  motherLastName: "",
  motherOccupation: "",
  motherMonthlyIncome: "",
  motherPhone: "",

  // 7. ข้อมูลผู้ปกครอง (Guardian Info)
  guardianRelationship: "",
  guardianIdNumber: "",
  guardianTitle: "",
  guardianFirstName: "",
  guardianLastName: "",
  guardianOccupation: "",
  guardianMonthlyIncome: "",
  guardianPhone: "",

  // 8. ข้อมูลที่อยู่ตามทะเบียนบ้าน (Registered Address)
  regHouseId: "",
  regAddressNumber: "",
  regMoo: "",
  regRoad: "",
  regSubDistrict: "",
  regDistrict: "",
  regProvince: "",
  regZipCode: "",
  regPhone: "",

  // 9. ข้อมูลที่อยู่ปัจจุบัน (Current Address)
  curHouseId: "",
  curAddressNumber: "",
  curMoo: "",
  curRoad: "",
  curSubDistrict: "",
  curDistrict: "",
  curProvince: "",
  curZipCode: "",
  curPhone: "",

  // 10. ข้อมูลสุขภาพ (Health Info)
  weight: "",
  height: "",
  disabilityType: "ปกติ",

  // 11. ข้อมูลเศรษฐกิจและความด้อยโอกาส (Welfare / Poverty)
  disadvantageType: "ไม่มี",
  staysAtSchool: "ไม่พักนอน",
  lacksUniform: false,
  lacksStationery: false,
  lacksTextbook: false,
  lacksLunch: false,

  // 12. ข้อมูลการเดินทาง (Transportation)
  distanceDirtRoad: "0",
  distancePavedRoad: "0",
  distanceWaterway: "0",
  travelTime: "",
  travelMethod: "เดิน",
  travelMonthlyCost: "0",

  profileImageUrl: "",
  behaviorScore: 100,

  // DMC Extra Fields
  subSchoolId: "",
  subSchoolName: "",
  elderBrotherCount1: "0",
  youngerBrotherCount1: "0",
  youngerBrotherCount2: "0",
  youngerSisterCount1: "0",
};

export default function AddStudentPage() {
  const { schoolId } = useParams<{ schoolId?: string }>();
  const [form, setForm] = useState(initialState);
  const [isLoading, setIsLoading] = useState(false);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [schools, setSchools] = useState<School[]>([]);
  const [availableLevels, setAvailableLevels] = useState<string[]>([]);
  const [activeTab, setActiveTab] = useState<string>("general");
  const [useRegAddress, setUseRegAddress] = useState(false);

  const tabs = [
    { id: "general", label: "ข้อมูลทั่วไป", icon: <FaIdCard /> },
    { id: "academic", label: "การศึกษา", icon: <FaGraduationCap /> },
    { id: "family", label: "ครอบครัว", icon: <FaUsers /> },
    { id: "address", label: "ที่อยู่", icon: <FaMapMarkerAlt /> },
    { id: "welfare", label: "สุขภาพ/สวัสดิการ", icon: <FaHeartbeat /> },
    { id: "travel", label: "การเดินทาง", icon: <FaBus /> },
  ];

  const studentStatusOptions = ["กำลังศึกษาอยู่", "พักการเรียน", "แขวนลอย", "ย้าย", "ลาออก", "จำหน่าย"] as const;
  const showExitDetails = isExitStudentStatus(form.studentStatus);
  const exitReasonLabel = `เหตุผลที่${form.studentStatus}`;

  useEffect(() => {
    // ถ้ามี schoolId จาก URL ให้ตั้งค่าในฟอร์มเลย
    if (schoolId) {
      setForm(prev => ({ ...prev, schoolId: schoolId }));
    }

    const fetchSchoolForCurrentUser = async () => {
      const currentUser = auth.currentUser;
      if (!currentUser) {
        console.log("No user logged in, fetching all schools.");
        const schoolsCollection = collection(firestore, "school-settings");
        const q = query(schoolsCollection, orderBy("schoolName"));
        const schoolSnapshot = await getDocs(q);
        const schoolList = schoolSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as School));
        // ถ้าไม่มี schoolId จาก URL ให้ตั้งค่ารายการโรงเรียนทั้งหมด
        if (!schoolId) {
          setSchools(schoolList);
        }
        return;
      }

      // ดึงข้อมูล schoolId จากเอกสารของผู้ใช้
      const userDocRef = doc(firestore, "users", currentUser.uid);
      const userDocSnap = await getDoc(userDocRef);

      if (userDocSnap.exists()) {
        const userData = userDocSnap.data();
        const userSchoolId = userData.schoolId;

        if (userSchoolId) {
          // ดึงข้อมูลเฉพาะโรงเรียนของผู้ใช้
          const schoolDocRef = doc(firestore, "school-settings", userSchoolId);
          const schoolDocSnap = await getDoc(schoolDocRef);
          if (schoolDocSnap.exists()) {
            const schoolData = { id: schoolDocSnap.id, ...schoolDocSnap.data() } as School;
            setSchools([schoolData]); // ตั้งค่าให้มีแค่โรงเรียนเดียวใน dropdown
            // ตั้งค่า schoolId ในฟอร์มถ้ายังไม่ได้ตั้งจาก URL หรือถ้า URL ไม่ตรงกับของผู้ใช้
            if (!schoolId || schoolId !== userSchoolId) {
              setForm(prev => ({ ...prev, schoolId: userSchoolId }));
            }
          }
        }
      } else {
        console.log("User document not found, cannot determine school.");
      }
    };

    fetchSchoolForCurrentUser().catch(console.error);
  }, [schoolId]);

  // ✅ ดึง availableLevels จาก Redux (แทนการ fetch school-settings ซ้ำ)
  const reduxSchoolSettings = useSelector((state: RootState) => state.schoolSettings);
  useEffect(() => {
    if (reduxSchoolSettings.status === 'succeeded' && reduxSchoolSettings.availableClassOptions.length > 0) {
      setAvailableLevels(reduxSchoolSettings.availableClassOptions.map(([_, name]: [string, string]) => name));
    }
  }, [reduxSchoolSettings.status, reduxSchoolSettings.availableClassOptions]);



  // ปรับปรุง: แยกฟังก์ชัน handleChange สำหรับ Input ทั่วไป
  function handleChange(e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) {
    const { name, value, type } = e.target as HTMLInputElement;
    let finalValue: any = value;

    if (type === "checkbox") {
      finalValue = (e.target as HTMLInputElement).checked;
    } else if (name === "birthDate") {
      finalValue = normalizeBirthDateInput(value);
    } else if (name.includes("IdNumber") || name === "idCardNumber" || name.includes("ZipCode") || name.includes("Phone")) {
      finalValue = value.replace(/[^0-9]/g, "");
    }

    setForm((prev) => {
      let newState = { ...prev, [name]: finalValue };



      // Logic for Address Sync
      if (useRegAddress && name.startsWith("reg")) {
        // If syncing is on and we change a reg field, update the corresponding cur field
        const curFieldName = name.replace("reg", "cur");
        newState = { ...newState, [curFieldName]: finalValue };
      }

      if (useRegAddress && name.startsWith("cur")) {
        // If syncing is on but we manually change a cur field, turn off syncing
        // unless it's an update triggered by the sync logic itself (which this handler doesn't distinguish easily without more complex logic, 
        // but typically user input triggers this). 
        // Actually, to keep it simple: if user types in cur field, disable sync.
        setUseRegAddress(false);
      }

      return newState;
    });
  }

  // Handle Sync Checkbox Toggle
  const handleAddressSyncChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const isChecked = e.target.checked;
    setUseRegAddress(isChecked);

    if (isChecked) {
      setForm(prev => ({
        ...prev,
        curHouseId: prev.regHouseId,
        curAddressNumber: prev.regAddressNumber,
        curMoo: prev.regMoo,
        curRoad: prev.regRoad,
        curSubDistrict: prev.regSubDistrict,
        curDistrict: prev.regDistrict,
        curProvince: prev.regProvince,
        curZipCode: prev.regZipCode,
        curPhone: prev.regPhone
      }));
    }
  };

  // เพิ่ม: ฟังก์ชันสำหรับจัดการการเปลี่ยนแปลงค่าจาก StatusSwitch หรือ Custom Select โดยเฉพาะ
  function handleStatusChange(name: string, value: any) {
    setForm((prev) => ({
      ...prev,
      [name]: value,
      exitDate: name === "studentStatus" && isExitStudentStatus(value) && !prev.exitDate
        ? new Date().toISOString().split('T')[0]
        : prev.exitDate,
    }));
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
        // Fallback to original file if compression fails
        setImageFile(file);
        setImagePreview(URL.createObjectURL(file));
      }
    }
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setIsLoading(true);
    Swal.fire({
      title: 'กำลังบันทึกข้อมูล...',
      text: 'กรุณารอสักครู่',
      allowOutsideClick: false,
      background: '#2a2b2f',
      color: '#ffffff',
      didOpen: () => Swal.showLoading()
    });

    try {
      let { profileImageUrl, schoolId, ...studentData } = form;
      const normalizedBirthDate = normalizeBirthDateInput(studentData.birthDate);

      if (!isValidBirthDate(normalizedBirthDate)) {
        Swal.fire({
          icon: 'warning',
          title: 'ปีเกิดไม่ถูกต้อง',
          text: 'กรุณาตรวจสอบวันเกิดนักเรียน ระบบจะแสดงในช่องวันที่เป็น ค.ศ. แต่จะบันทึกข้อมูลนักเรียนเป็น พ.ศ.',
          background: '#2a2b2f',
          color: '#ffffff'
        });
        setIsLoading(false);
        return;
      }

      studentData.birthDate = toBuddhistBirthDateForSave(normalizedBirthDate);

      // 💡 Padding Student ID: ถ้าเป็น 4 หลัก ให้เติม 0 ข้างหน้า
      if (studentData.studentId && studentData.studentId.length === 4) {
        studentData.studentId = `0${studentData.studentId}`;
      }

      if (!schoolId) {
        Swal.fire({ icon: 'warning', title: 'ข้อมูลไม่ครบ', text: 'กรุณาเลือกโรงเรียน', background: '#2a2b2f', color: '#ffffff' });
        setIsLoading(false);
        return;
      }

      // --- 🔍 Check for Duplicates (By studentId or idCardNumber) ---
      const studentsRef = collection(firestore, 'school-settings', schoolId, 'students');
      let conflictDoc: any = null;

      // 1. Check Student ID
      if (studentData.studentId) {
        const qId = query(studentsRef, where('studentId', '==', studentData.studentId));
        const snapshotId = await getDocs(qId);
        if (!snapshotId.empty) {
          conflictDoc = snapshotId.docs[0].data();
        }
      }

      // 2. Check ID Card Number (if not found by ID)
      if (!conflictDoc && studentData.idCardNumber) {
        const qCard = query(studentsRef, where('idCardNumber', '==', studentData.idCardNumber));
        const snapshotCard = await getDocs(qCard);
        if (!snapshotCard.empty) {
          conflictDoc = snapshotCard.docs[0].data();
        }
      }

      if (conflictDoc) {
        Swal.fire({
          icon: 'warning',
          title: 'พบข้อมูลซ้ำในระบบ',
          html: buildDuplicateStudentHtml(conflictDoc),
          background: '#2a2b2f',
          color: '#ffffff',
          confirmButtonText: 'รับทราบ',
          confirmButtonColor: '#4f46e5',
        });
        setIsLoading(false);
        return;
      }


      const roles = ["student"];
      if (studentData.fatherPhone || studentData.motherPhone || studentData.guardianPhone) {
        roles.push("parent");
      }

      const dataToSave: any = {
        ...studentData,
        schoolId: schoolId,
        status: studentData.studentStatus,
        role: roles,
        createdAt: serverTimestamp(),
        // DMC Extra Fields (Defaults)
        subSchoolId: studentData.subSchoolId || "",
        subSchoolName: studentData.subSchoolName || "",
        elderBrotherCount1: studentData.elderBrotherCount1 || "0",
        youngerBrotherCount1: studentData.youngerBrotherCount1 || "0",
        youngerBrotherCount2: studentData.youngerBrotherCount2 || "0",
        youngerSisterCount1: studentData.youngerSisterCount1 || "0",
      };

      if (isExitStudentStatus(studentData.studentStatus)) {
        dataToSave.exitDetails = {
          exitDate: studentData.exitDate || "",
          reason: studentData.exitReason || "",
          destinationSchool: studentData.exitDestinationSchool || "",
          status: studentData.studentStatus,
        };
      }

      // 💡 ปรับปรุง: จัดการการอัปโหลดรูปภาพแยกต่างหาก
      // เพื่อให้แม้ว่ารูปจะอัปโหลดไม่สำเร็จ แต่ข้อมูลหลักยังคงบันทึกได้
      if (imageFile) {
        try {
          const fileExtension = '.jpg'; 

          // 2. สร้าง Path: 
          // school-settings/{schoolId}/students/{classLevel}/{room}/{studentId}.jpg
          let storagePath = `school-settings/${schoolId}/students/${studentData.classLevel}`;
          storagePath += `/${studentData.room}`;

          storagePath += `/${studentData.studentId}${fileExtension}`;

          const imageRef = ref(storage, storagePath);
          const snapshot = await uploadBytes(imageRef, imageFile);
          dataToSave.profileImageUrl = await getDownloadURL(snapshot.ref);

          // รูปธัมบ์ (ขนาดเล็กสำหรับ avatar) — อัปโหลดแยกจากรูปเต็ม ถ้าล้มเหลวไม่กระทบรูปเต็มที่อัปโหลดสำเร็จแล้ว
          try {
            const thumbPath = storagePath.replace(/(\.[^./]+)$/, '_thumb$1');
            const thumbFile = await compressImage(imageFile, 128, 0.6, 'image/jpeg');
            const thumbSnapshot = await uploadBytes(ref(storage, thumbPath), thumbFile);
            dataToSave.profileImageThumbUrl = await getDownloadURL(thumbSnapshot.ref);
          } catch (thumbError) {
            console.error("Thumbnail upload failed:", thumbError);
          }
        } catch (uploadError) {
          console.error("Image upload failed:", uploadError);
          // ตั้งค่าข้อความเตือน แต่ไม่หยุดการทำงาน
          Swal.fire({
            icon: 'warning',
            title: 'อัปโหลดรูปภาพล้มเหลว',
            text: 'แต่จะพยายามบันทึกข้อมูลส่วนอื่นต่อไป',
            background: '#2a2b2f',
            color: '#ffffff'
          });
          // ตั้งค่า URL รูปภาพเป็นค่าว่างเพื่อให้ข้อมูลส่วนอื่นบันทึกได้
          dataToSave.profileImageUrl = "";
        }
      }

      // บันทึกข้อมูลนักเรียน (พร้อม profileImageUrl หากมีการอัปโหลดรูป) ลงใน Firestore
      const docRef = await addDoc(collection(firestore, "school-settings", schoolId, "students"), dataToSave);
      if (isActiveStudentSummaryStatus(studentData.studentStatus)) {
        await updateOwnerAndSchoolCounts(firestore, schoolId, { students: 1 });
      }
      await updateStudentReportSummaryForChange(firestore, schoolId, null, dataToSave);

      // --- อัปเดต Lookup Table สำหรับการ Login ที่รวดเร็ว ---
      try {
        const { updateStudentLookup } = await import("@/utils/studentLookupUtils");
        await updateStudentLookup(studentData.idCardNumber, studentData.studentId, schoolId, docRef.id);
      } catch (lookupErr) {
        console.warn("Failed to update student lookup table:", lookupErr);
      }

      console.log("Document written with ID: ", docRef.id);

      // รีเซ็ตฟอร์มและรูปภาพ
      setForm(prev => ({
        ...initialState,
        // ถ้ามีโรงเรียนแค่แห่งเดียว (ถูกจำกัดโดยผู้ใช้) ให้คง schoolId เดิมไว้
        // ถ้ามีหลายโรงเรียน (แอดมินสูงสุด) ให้เคลียร์ค่าเพื่อให้เลือกใหม่
        schoolId: schools.length === 1 ? prev.schoolId : ""
      }));
      setImageFile(null);
      setImagePreview(null);

      Swal.fire({
        icon: 'success',
        title: 'บันทึกสำเร็จ!',
        text: 'ข้อมูลนักเรียนใหม่ถูกเพิ่มเข้าระบบเรียบร้อยแล้ว',
        background: '#2a2b2f',
        color: '#ffffff',
        timer: 2000,
        showConfirmButton: false,
      });

    } catch (e) {
      console.error("Error adding document: ", e);
      Swal.fire({
        icon: 'error',
        title: 'เกิดข้อผิดพลาด',
        text: 'ไม่สามารถบันทึกข้อมูลได้ กรุณาลองใหม่อีกครั้ง',
        background: '#2a2b2f',
        color: '#ffffff'
      });
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <MainLayout>
      <div className="min-h-screen bg-gray-50 dark:bg-[#1e1f21] text-gray-900 dark:text-white">
        <div className="max-w-6xl mx-auto px-3 sm:px-4 md:px-6 lg:px-8 py-4 sm:py-6 lg:py-8">
          <header className="mb-8 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex items-center gap-4">
              <BackButton to="/academic/hub/students" />
              <div>
                <h1 className="text-3xl font-bold tracking-tight">เพิ่มข้อมูลนักเรียนใหม่</h1>
                <p className="mt-1 text-gray-500 dark:text-gray-400">กรอกรายละเอียดข้อมูลของนักเรียนให้ครบถ้วน</p>
              </div>
            </div>
            <div className="flex flex-col sm:flex-row gap-3">
              <Link
                to="/academic/alumni-management"
                className="flex items-center justify-center gap-2 px-6 py-3 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-2xl shadow-lg shadow-indigo-200 dark:shadow-none transition-all hover:scale-105"
              >
                <FaGraduationCap />
                รับจากศิษย์เก่า
              </Link>
              <Link
                to={`/school/${schoolId}/students/quick-add`}
                className="flex items-center justify-center gap-2 px-6 py-3 bg-amber-500 hover:bg-amber-600 text-white font-bold rounded-2xl shadow-lg shadow-amber-200 dark:shadow-none transition-all hover:scale-105"
              >
                <FaUserPlus />
                เพิ่มนักเรียนด่วน
              </Link>
            </div>
          </header>

          <form onSubmit={handleSubmit} className="space-y-6">
            {/* Tab Navigation - Sticky on Mobile & Desktop */}
            <div className="sticky top-[60px] lg:top-[70px] z-30 -mx-4 px-4 py-4 mb-6 bg-gray-50/80 dark:bg-[#1e1f21]/80 backdrop-blur-md border-b border-gray-200 dark:border-gray-800">
              <div className="max-w-6xl mx-auto">
                <div className="flex flex-nowrap gap-2 table-responsive pb-1 scrollbar-hide">
                  {tabs.map((tab) => (
                    <button
                      key={tab.id}
                      type="button"
                      onClick={() => {
                        setActiveTab(tab.id);
                        window.scrollTo({ top: 0, behavior: 'smooth' });
                      }}
                      className={`flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold transition-all duration-300 whitespace-nowrap ${activeTab === tab.id
                        ? "bg-indigo-600 text-white shadow-lg shadow-indigo-200 dark:shadow-indigo-900/20 scale-105"
                        : "bg-white dark:bg-[#2a2b2f] text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700/50 shadow-sm border border-gray-100 dark:border-gray-700"
                        }`}
                    >
                      <span className="text-lg">{tab.icon}</span>
                      {tab.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Tab Content */}
            <div className="transition-all duration-500 ease-in-out">
              {activeTab === "general" && (
                <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
                  <InfoCard title="ข้อมูลส่วนตัว">
                    {/* ส่วนสำหรับอัปโหลดและพรีวิวรูปภาพ (ไม่มีการเปลี่ยนแปลง) */}
                    <div className="flex flex-col sm:flex-row items-center sm:items-start gap-6">
                      <div className="flex-shrink-0">
                        <label htmlFor="profileImage" className="relative cursor-pointer group block">
                          {imagePreview ? (
                            <ProfileAvatar
                              src={imagePreview}
                              alt="Student profile"
                              className="w-32 h-32 border-4 border-gray-200 dark:border-gray-600"
                            />
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
                        <input
                          type="file"
                          id="profileImage"
                          name="profileImage"
                          accept="image/jpeg,image/png"
                          onChange={handleImageChange}
                          className="hidden"
                        />
                      </div>

                      <div className="flex-grow space-y-4 w-full">
                        <InputField
                          label="เลขบัตรประจำตัวประชาชน"
                          name="idCardNumber"
                          value={form.idCardNumber}
                          onChange={handleChange}
                          maxLength={13}
                          placeholder="กรอกเลข 13 หลัก"
                        />
                        <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
                          <div>
                            <label className="block text-sm font-medium mb-1 text-gray-700 dark:text-gray-400">คำนำหน้า</label>
                            <select
                              name="title"
                              value={form.title}
                              onChange={handleChange}
                              className="w-full bg-white dark:bg-[#1e1f21] border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500 transition text-gray-900 dark:text-white"
                            >
                              <option value="">เลือกคำนำหน้า</option>
                              <option value="ด.ช.">เด็กชาย (ด.ช.)</option>
                              <option value="ด.ญ.">เด็กหญิง (ด.ญ.)</option>
                              <option value="นาย">นาย</option>
                              <option value="น.ส.">นางสาว</option>
                              <option value="สามเณร">สามเณร</option>
                            </select>
                          </div>
                          <InputField
                            label="ชื่อจริง"
                            name="firstName"
                            value={form.firstName}
                            onChange={handleChange}
                          />
                          <InputField
                            label="นามสกุล"
                            name="lastName"
                            value={form.lastName}
                            onChange={handleChange}
                          />
                          <div className="sm:col-span-1 max-w-[150px]">
                            <InputField
                              label="ชื่อเล่น"
                              name="nickname"
                              value={form.nickname}
                              onChange={handleChange}
                            />
                          </div>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                          <InputField label="ชื่อจริง (อังกฤษ)" name="firstNameEn" value={form.firstNameEn} onChange={handleChange} />
                          <InputField label="นามสกุล (อังกฤษ)" name="lastNameEn" value={form.lastNameEn} onChange={handleChange} />
                          <div>
                            <label className="block text-sm font-medium mb-1 text-gray-700 dark:text-gray-400">เพศ</label>
                            <select name="gender" value={form.gender} onChange={handleChange} className="w-full bg-white dark:bg-[#1e1f21] border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 text-gray-900 dark:text-white">
                              <option value="">เลือกเพศ</option>
                              <option value="ชาย">ชาย</option>
                              <option value="หญิง">หญิง</option>
                            </select>
                          </div>
                          <InputField label="วันเกิด" name="birthDate" type="date" value={form.birthDate} onChange={handleChange} />
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-3 lg:grid-cols-5 gap-4">
                          <InputField label="อายุ (ปี)" name="ageYear" value={form.ageYear} onChange={handleChange} type="number" />
                          <InputField label="อายุ (เดือน)" name="ageMonth" value={form.ageMonth} onChange={handleChange} type="number" />
                          <div>
                            <label className="block text-sm font-medium mb-1 text-gray-700 dark:text-gray-400">หมู่โลหิต</label>
                            <select name="bloodType" value={form.bloodType} onChange={handleChange} className="w-full bg-white dark:bg-[#1e1f21] border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 text-gray-900 dark:text-white">
                              <option value="">เลือกหมู่โลหิต</option>
                              <option value="A">A</option>
                              <option value="B">B</option>
                              <option value="O">O</option>
                              <option value="AB">AB</option>
                            </select>
                          </div>
                          <InputField label="จังหวัดที่เกิด" name="birthProvince" value={form.birthProvince} onChange={handleChange} />
                          <InputField label="สัญชาติ" name="nationality" value={form.nationality} onChange={handleChange} />
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                          <InputField label="เชื้อชาติ" name="race" value={form.race} onChange={handleChange} />
                          <InputField label="ศาสนา" name="religion" value={form.religion} onChange={handleChange} />
                        </div>
                      </div>
                    </div>
                  </InfoCard>
                </div>
              )}

              {activeTab === "academic" && (
                <div className="space-y-6 animate-in fade-in slide-in-from-right-4 duration-500">
                  <InfoCard title="ข้อมูลการศึกษา">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm font-medium mb-1 text-gray-700 dark:text-gray-400">โรงเรียนหลัก</label>
                        <select name="schoolId" value={form.schoolId} onChange={handleChange} className="w-full bg-white dark:bg-[#1e1f21] border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500 transition disabled:bg-gray-200 dark:disabled:bg-gray-700 disabled:cursor-not-allowed text-gray-900 dark:text-white" required disabled={schools.length === 1}>
                          <option value="">-- เลือกโรงเรียน --</option>
                          {schools.map(school => (
                            <option key={school.id} value={school.id}>{school.schoolName}</option>
                          ))}
                        </select>
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <InputField label="รหัสโรงเรียนสาขา" name="subSchoolId" value={form.subSchoolId} onChange={handleChange} />
                        <InputField label="ชื่อโรงเรียนสาขา" name="subSchoolName" value={form.subSchoolName} onChange={handleChange} />
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4 mt-4">
                      <div>
                        <label className="block text-sm font-medium mb-1 text-gray-700 dark:text-gray-400">ชั้น</label>
                        <select
                          name="classLevel"
                          value={form.classLevel}
                          onChange={handleChange}
                          className="w-full bg-white dark:bg-[#1e1f21] border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500 transition text-gray-900 dark:text-white"
                        >
                          <option value="">เลือกชั้น</option>
                          {availableLevels.map(level => <option key={level} value={level}>{level}</option>)}
                        </select>
                      </div>

                      <div>
                        <label className="block text-sm font-medium mb-1 text-gray-700 dark:text-gray-400">ห้อง</label>
                        <select
                          name="room"
                          value={form.room}
                          onChange={handleChange}
                          className="w-full bg-white dark:bg-[#1e1f21] border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500 transition text-gray-900 dark:text-white"
                        >
                          <option value="">เลือกห้อง</option>
                          {Array.from({ length: 20 }, (_, i) => i + 1).map(r => (
                            <option key={r} value={r}>{r}</option>
                          ))}
                        </select>
                      </div>
                      <InputField
                        label="เลขที่"
                        name="studentNumber"
                        value={form.studentNumber}
                        onChange={handleChange}
                      />
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4 mt-4">
                      <div>
                        <InputField
                          label="รหัสนักเรียน"
                          name="studentId"
                          value={form.studentId}
                          onChange={handleChange}
                        />
                        <p className="mt-1 text-[10px] flex items-center gap-1 text-amber-600 dark:text-amber-400 font-medium">
                          <FaInfoCircle className="flex-shrink-0" />
                          ควรเป็น 5 หลัก (หากโรงเรียนมี 4 หลัก ให้เติม 0 ข้างหน้า)
                        </p>
                      </div>
                      <div>
                        <label className="block text-sm font-medium mb-1 text-gray-700 dark:text-gray-400">ประเภทนักเรียน</label>
                        <select name="studentType" value={form.studentType} onChange={handleChange} className="w-full bg-white dark:bg-[#1e1f21] border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 text-gray-900 dark:text-white">
                          <option value="ปกติ">ปกติ</option>
                          <option value="ยากจน">ยากจน</option>
                          <option value="พิการ">พิการ</option>
                          <option value="อื่นๆ">อื่นๆ</option>
                        </select>
                      </div>
                      <InputField label="GPA" name="gpa" value={form.gpa} onChange={handleChange} />
                      <InputField label="GPAX" name="gpax" value={form.gpax} onChange={handleChange} />
                    </div>

                    <div className="mt-4">
	                      <StatusSwitch
	                        label="สถานะนักเรียน"
	                        name="studentStatus"
	                        options={studentStatusOptions}
	                        value={form.studentStatus}
	                        onChange={handleStatusChange}
	                      />
	                    </div>

	                    {showExitDetails && (
	                      <div className="mt-4 rounded-2xl border border-amber-200 dark:border-amber-500/20 bg-amber-50 dark:bg-amber-500/10 p-4">
	                        <div className="mb-3 text-sm font-semibold text-amber-800 dark:text-amber-300">
	                          รายละเอียดกรณี {form.studentStatus}
	                        </div>
	                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
	                          <InputField label="วันที่ออก/ย้าย" name="exitDate" type="date" value={form.exitDate} onChange={handleChange} />
	                          <InputField label={exitReasonLabel} name="exitReason" value={form.exitReason} onChange={handleChange} placeholder={`ระบุ${exitReasonLabel}`} />
	                          <InputField label="โรงเรียนปลายทาง/หมายเหตุ" name="exitDestinationSchool" value={form.exitDestinationSchool} onChange={handleChange} placeholder="ระบุถ้ามี" />
	                        </div>
	                      </div>
	                    )}
	                  </InfoCard>
	                </div>
	              )}

              {activeTab === "family" && (
                <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
                  <InfoCard title="ข้อมูลพี่น้องและลำดับบุตร">
                    <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
                      <InputField label="จำนวนพี่ชาย" name="elderBrotherCount" value={form.elderBrotherCount} onChange={handleChange} type="number" />
                      <InputField label="จำนวนพี่ชาย.1" name="elderBrotherCount1" value={form.elderBrotherCount1} onChange={handleChange} type="number" />
                      <InputField label="จำนวนน้องชาย" name="youngerBrotherCount" value={form.youngerBrotherCount} onChange={handleChange} type="number" />
                      <InputField label="น้องชาย.1" name="youngerBrotherCount1" value={form.youngerBrotherCount1} onChange={handleChange} type="number" />
                      <InputField label="น้องชาย.2" name="youngerBrotherCount2" value={form.youngerBrotherCount2} onChange={handleChange} type="number" />
                      <InputField label="จำนวนพี่สาว" name="elderSisterCount" value={form.elderSisterCount} onChange={handleChange} type="number" />
                      <InputField label="จำนวนน้องสาว" name="youngerSisterCount" value={form.youngerSisterCount} onChange={handleChange} type="number" />
                      <InputField label="น้องสาว.1" name="youngerSisterCount1" value={form.youngerSisterCount1} onChange={handleChange} type="number" />
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mt-6 pt-6 border-t border-gray-100 dark:border-gray-800">
                      <InputField label="เป็นบุตรคนที่" name="childOrder" value={form.childOrder} onChange={handleChange} type="number" />
                      <InputField label="บุตรลำดับที่ (ในหมวดหมู่)" name="childOrderInCategory" value={form.childOrderInCategory} onChange={handleChange} type="number" />
                      <InputField label="จำนวนพี่น้องที่ศึกษาอยู่" name="studyingSiblingCount" value={form.studyingSiblingCount} onChange={handleChange} type="number" />
                    </div>
                  </InfoCard>

                  <InfoCard title="สถานภาพครอบครัว">
                    <div>
                      <label className="block text-sm font-medium mb-2 text-gray-700 dark:text-gray-400">สถานภาพสมรสของบิดามารดา</label>
                      <select name="parentsMaritalStatus" value={form.parentsMaritalStatus} onChange={handleChange} className="w-full bg-white dark:bg-[#1e1f21] border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 text-gray-900 dark:text-white">
                        <option value="อยู่ด้วยกัน">อยู่ด้วยกัน</option>
                        <option value="แยกกันอยู่">แยกกันอยู่</option>
                        <option value="หย่าร้าง">หย่าร้าง</option>
                        <option value="บิดาถึงแก่กรรม">บิดาถึงแก่กรรม</option>
                        <option value="มารดาถึงแก่กรรม">มารดาถึงแก่กรรม</option>
                        <option value="ถึงแก่กรรมทั้งคู่">ถึงแก่กรรมทั้งคู่</option>
                      </select>
                    </div>
                  </InfoCard>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <InfoCard title="ข้อมูลบิดา">
                      <div className="space-y-4">
                        <InputField label="หมายเลขบัตรประชาชนบิดา" name="fatherIdNumber" value={form.fatherIdNumber} onChange={handleChange} maxLength={13} />
                        <div className="grid grid-cols-3 gap-2">
                          <div className="col-span-1">
                            <label className="block text-sm font-medium mb-1">คำนำหน้า</label>
                            <select name="fatherTitle" value={form.fatherTitle} onChange={handleChange} className="w-full bg-white dark:bg-[#1e1f21] border border-gray-300 rounded-lg px-2 py-2">
                              <option value="">เลือก</option>
                              <option value="นาย">นาย</option>
                            </select>
                          </div>
                          <div className="col-span-1">
                            <InputField label="ชื่อบิดา" name="fatherFirstName" value={form.fatherFirstName} onChange={handleChange} />
                          </div>
                          <div className="col-span-1">
                            <InputField label="นามสกุลบิดา" name="fatherLastName" value={form.fatherLastName} onChange={handleChange} />
                          </div>
                        </div>
                        <InputField label="อาชีพบิดา" name="fatherOccupation" value={form.fatherOccupation} onChange={handleChange} />
                        <InputField label="รายได้ต่อเดือน" name="fatherMonthlyIncome" value={form.fatherMonthlyIncome} onChange={handleChange} type="number" />
                        <InputField label="เบอร์โทรศัพท์บิดา" name="fatherPhone" value={form.fatherPhone} onChange={handleChange} type="tel" />
                      </div>
                    </InfoCard>

                    <InfoCard title="ข้อมูลมารดา">
                      <div className="space-y-4">
                        <InputField label="หมายเลขบัตรประชาชนมารดา" name="motherIdNumber" value={form.motherIdNumber} onChange={handleChange} maxLength={13} />
                        <div className="grid grid-cols-3 gap-2">
                          <div className="col-span-1">
                            <label className="block text-sm font-medium mb-1">คำนำหน้า</label>
                            <select name="motherTitle" value={form.motherTitle} onChange={handleChange} className="w-full bg-white dark:bg-[#1e1f21] border border-gray-300 rounded-lg px-2 py-2">
                              <option value="">เลือก</option>
                              <option value="นาง">นาง</option>
                              <option value="น.ส.">น.ส.</option>
                            </select>
                          </div>
                          <div className="col-span-1">
                            <InputField label="ชื่อมารดา" name="motherFirstName" value={form.motherFirstName} onChange={handleChange} />
                          </div>
                          <div className="col-span-1">
                            <InputField label="นามสกุลมารดา" name="motherLastName" value={form.motherLastName} onChange={handleChange} />
                          </div>
                        </div>
                        <InputField label="อาชีพมารดา" name="motherOccupation" value={form.motherOccupation} onChange={handleChange} />
                        <InputField label="รายได้ต่อเดือน" name="motherMonthlyIncome" value={form.motherMonthlyIncome} onChange={handleChange} type="number" />
                        <InputField label="เบอร์โทรศัพท์มารดา" name="motherPhone" value={form.motherPhone} onChange={handleChange} type="tel" />
                      </div>
                    </InfoCard>
                  </div>

                  <InfoCard title="ข้อมูลผู้ปกครอง (กรณีไม่ได้อยู่กับบิดามารดา)">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <InputField label="ความเกี่ยวข้องกับนักเรียน" name="guardianRelationship" value={form.guardianRelationship} onChange={handleChange} placeholder="เช่น ปู่, ย่า, ตา, ยาย" />
                      <InputField label="หมายเลขบัตรประชาชนผู้ปกครอง" name="guardianIdNumber" value={form.guardianIdNumber} onChange={handleChange} maxLength={13} />
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mt-4">
                      <div>
                        <label className="block text-sm font-medium mb-1">คำนำหน้า</label>
                        <select name="guardianTitle" value={form.guardianTitle} onChange={handleChange} className="w-full bg-white dark:bg-[#1e1f21] border border-gray-300 rounded-lg px-3 py-2">
                          <option value="">เลือก</option>
                          <option value="นาย">นาย</option>
                          <option value="นาง">นาง</option>
                          <option value="น.ส.">น.ส.</option>
                        </select>
                      </div>
                      <InputField label="ชื่อผู้ปกครอง" name="guardianFirstName" value={form.guardianFirstName} onChange={handleChange} />
                      <InputField label="นามสกุลผู้ปกครอง" name="guardianLastName" value={form.guardianLastName} onChange={handleChange} />
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mt-4">
                      <InputField label="อาชีพผู้ปกครอง" name="guardianOccupation" value={form.guardianOccupation} onChange={handleChange} />
                      <InputField label="รายได้ต่อเดือน" name="guardianMonthlyIncome" value={form.guardianMonthlyIncome} onChange={handleChange} type="number" />
                      <InputField label="เบอร์โทรศัพท์ผู้ปกครอง" name="guardianPhone" value={form.guardianPhone} onChange={handleChange} type="tel" />
                    </div>
                  </InfoCard>
                </div>
              )}

              {activeTab === "address" && (
                <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <InfoCard title="ข้อมูลที่อยู่ตามทะเบียนบ้าน">
                      <div className="space-y-4">
                        <InputField label="รหัสประจำบ้าน" name="regHouseId" value={form.regHouseId} onChange={handleChange} />
                        <div className="grid grid-cols-2 gap-4">
                          <InputField label="เลขที่บ้าน" name="regAddressNumber" value={form.regAddressNumber} onChange={handleChange} />
                          <InputField label="หมู่" name="regMoo" value={form.regMoo} onChange={handleChange} />
                        </div>
                        <InputField label="ถนน" name="regRoad" value={form.regRoad} onChange={handleChange} />
                        <div className="grid grid-cols-2 gap-4">
                          <InputField label="ตำบล" name="regSubDistrict" value={form.regSubDistrict} onChange={handleChange} />
                          <InputField label="อำเภอ" name="regDistrict" value={form.regDistrict} onChange={handleChange} />
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                          <InputField label="จังหวัด" name="regProvince" value={form.regProvince} onChange={handleChange} />
                          <InputField label="รหัสไปรษณีย์" name="regZipCode" value={form.regZipCode} onChange={handleChange} maxLength={5} />
                        </div>
                        <InputField label="เบอร์โทรศัพท์บ้าน" name="regPhone" value={form.regPhone} onChange={handleChange} type="tel" />
                      </div>
                    </InfoCard>

                    <InfoCard title="ข้อมูลที่อยู่ปัจจุบัน">
                      <div className="mb-4 bg-indigo-50 dark:bg-indigo-900/20 p-3 rounded-lg border border-indigo-100 dark:border-indigo-800">
                        <CheckboxField
                          label="ใช้ข้อมูลเดียวกับที่อยู่ตามทะเบียนบ้าน"
                          name="useRegAddress"
                          checked={useRegAddress}
                          onChange={handleAddressSyncChange}
                        />
                      </div>
                      <div className="space-y-4">
                        <InputField label="รหัสประจำบ้าน" name="curHouseId" value={form.curHouseId} onChange={handleChange} />
                        <div className="grid grid-cols-2 gap-4">
                          <InputField label="เลขที่บ้าน" name="curAddressNumber" value={form.curAddressNumber} onChange={handleChange} />
                          <InputField label="หมู่" name="curMoo" value={form.curMoo} onChange={handleChange} />
                        </div>
                        <InputField label="ถนน" name="curRoad" value={form.curRoad} onChange={handleChange} />
                        <div className="grid grid-cols-2 gap-4">
                          <InputField label="ตำบล" name="curSubDistrict" value={form.curSubDistrict} onChange={handleChange} />
                          <InputField label="อำเภอ" name="curDistrict" value={form.curDistrict} onChange={handleChange} />
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                          <InputField label="จังหวัด" name="curProvince" value={form.curProvince} onChange={handleChange} />
                          <InputField label="รหัสไปรษณีย์" name="curZipCode" value={form.curZipCode} onChange={handleChange} maxLength={5} />
                        </div>
                        <InputField label="เบอร์โทรศัพท์" name="curPhone" value={form.curPhone} onChange={handleChange} type="tel" />
                      </div>
                    </InfoCard>
                  </div>
                </div>
              )}

              {activeTab === "welfare" && (
                <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
                  <InfoCard title="ข้อมูลสุขภาพและสวัสดิการ">
                    <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
                      <InputField label="น้ำหนัก (กม.)" name="weight" value={form.weight} onChange={handleChange} type="number" />
                      <InputField label="ส่วนสูง (ซม.)" name="height" value={form.height} onChange={handleChange} type="number" />
                      <div>
                        <label className="block text-sm font-medium mb-1">ความพิการ</label>
                        <select name="disabilityType" value={form.disabilityType} onChange={handleChange} className="w-full bg-white dark:bg-[#1e1f21] border border-gray-300 rounded-lg px-3 py-2 text-gray-900 dark:text-white">
                          <option value="ปกติ">ปกติ</option>
                          <option value="การเห็น">การเห็น</option>
                          <option value="การได้ยิน">การได้ยิน</option>
                          <option value="สติปัญญา">สติปัญญา</option>
                          <option value="ร่างกายหรือสุขภาพ">ร่างกายหรือสุขภาพ</option>
                          <option value="การเรียนรู้">การเรียนรู้</option>
                          <option value="การพูดและภาษา">การพูดและภาษา</option>
                          <option value="พฤติกรรมหรืออารมณ์">พฤติกรรมหรืออารมณ์</option>
                          <option value="ออทิสติก">ออทิสติก</option>
                          <option value="ซ้อน">ซ้อน</option>
                        </select>
                      </div>
                      <div>
                        <label className="block text-sm font-medium mb-1">ความด้อยโอกาส</label>
                        <select name="disadvantageType" value={form.disadvantageType} onChange={handleChange} className="w-full bg-white dark:bg-[#1e1f21] border border-gray-300 rounded-lg px-3 py-2 text-gray-900 dark:text-white">
                          <option value="ไม่มี">ไม่มี</option>
                          <option value="ยากจน">ยากจน</option>
                          <option value="ยากจนพิเศษ">ยากจนพิเศษ</option>
                          <option value="ถูกทอดทิ้ง">ถูกทอดทิ้ง</option>
                          <option value="เด็กเร่ร่อน">เด็กเร่ร่อน</option>
                          <option value="แรงงานเด็ก">แรงงานเด็ก</option>
                          <option value="อยู่ในสถานพินิจ">อยู่ในสถานพินิจ</option>
                          <option value="ลูกกะเหรี่ยง">ลูกกะเหรี่ยง</option>
                        </select>
                      </div>
                    </div>
                  </InfoCard>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <InfoCard title="การพักนอนสวัสดิการ">
                      <div className="space-y-4">
                        <div>
                          <label className="block text-sm font-medium mb-1">การพักนอน</label>
                          <select name="staysAtSchool" value={form.staysAtSchool} onChange={handleChange} className="w-full bg-white dark:bg-[#1e1f21] border border-gray-300 rounded-lg px-3 py-2 text-gray-900 dark:text-white">
                            <option value="ไม่พักนอน">ไม่พักนอน</option>
                            <option value="พักนอน">พักนอน</option>
                          </select>
                        </div>
                        <div className="bg-gray-50 dark:bg-gray-800/50 p-4 rounded-xl space-y-2 border border-blue-100 dark:border-blue-900/30">
                          <h4 className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-3">รายการที่ขาดแคลน</h4>
                          <div className="grid grid-cols-2 gap-2">
                            <CheckboxField label="ขาดแคลนเครื่องแบบ" name="lacksUniform" checked={form.lacksUniform} onChange={handleChange} />
                            <CheckboxField label="ขาดแคลนแบบเรียน" name="lacksTextbook" checked={form.lacksTextbook} onChange={handleChange} />
                            <CheckboxField label="ขาดแคลนเครื่องเขียน" name="lacksStationery" checked={form.lacksStationery} onChange={handleChange} />
                            <CheckboxField label="ขาดแคลนอาหารกลางวัน" name="lacksLunch" checked={form.lacksLunch} onChange={handleChange} />
                          </div>
                        </div>
                      </div>
                    </InfoCard>
                  </div>
                </div>
              )}
              {activeTab === "travel" && (
                <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
                  <InfoCard title="ข้อมูลการเดินทาง">
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                      <div className="bg-gray-50 dark:bg-gray-800/50 p-6 rounded-2xl border border-gray-100 dark:border-gray-700/50">
                        <label className="block text-sm font-black mb-4 text-gray-400 uppercase tracking-widest">ระยะทาง (กม.)</label>
                        <div className="space-y-4">
                          <InputField label="ทางลูกรัง" name="distanceDirtRoad" value={form.distanceDirtRoad} onChange={handleChange} type="number" />
                          <InputField label="ทางลาดยาง/คอนกรีต" name="distancePavedRoad" value={form.distancePavedRoad} onChange={handleChange} type="number" />
                          <InputField label="ทางน้ำ" name="distanceWaterway" value={form.distanceWaterway} onChange={handleChange} type="number" />
                        </div>
                      </div>

                      <div className="md:col-span-2 space-y-6">
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                          <InputField label="เวลาเดินทางปกติ (นาที)" name="travelTime" value={form.travelTime} onChange={handleChange} type="number" />
                          <InputField label="ค่าใช้จ่ายเดินทาง ต่อเดือน" name="travelMonthlyCost" value={form.travelMonthlyCost} onChange={handleChange} type="number" />
                        </div>
                        <div>
                          <label className="block text-sm font-medium mb-2 text-gray-700 dark:text-gray-400">ลักษณะการเดินทาง</label>
                          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                            {["เดิน", "พาหนะส่วนตัว", "รถเมล์สาธารณะ", "รถไฟ", "จักรยานยืมเรียน", "รถรับส่งนักเรียน"].map(method => (
                              <button
                                key={method}
                                type="button"
                                onClick={() => handleStatusChange("travelMethod", method)}
                                className={`px-4 py-3 rounded-xl text-sm font-bold transition-all border ${form.travelMethod === method
                                  ? "bg-indigo-600 text-white border-indigo-600 shadow-lg shadow-indigo-200 dark:shadow-none"
                                  : "bg-white dark:bg-[#1e1f21] text-gray-600 dark:text-gray-400 border-gray-200 dark:border-gray-700 hover:border-indigo-300"
                                  }`}
                              >
                                {method}
                              </button>
                            ))}
                          </div>
                        </div>
                      </div>
                    </div>
                  </InfoCard>
                </div>
              )}
            </div>

            {/* Submit & Navigation Buttons */}
            <div className="flex flex-col sm:flex-row items-center justify-between gap-4 pt-8 border-t border-gray-200 dark:border-gray-700">
              <div className="flex gap-2">
                {tabs.map((tab, idx) => (
                  <div
                    key={tab.id}
                    className={`h-1.5 w-8 rounded-full transition-all duration-300 ${tabs.findIndex(t => t.id === activeTab) >= idx
                      ? "bg-indigo-600"
                      : "bg-gray-200 dark:bg-gray-700"
                      }`}
                  />
                ))}
              </div>
              <div className="flex gap-4">
                {activeTab !== "general" && (
                  <button
                    type="button"
                    onClick={() => {
                      const idx = tabs.findIndex(t => t.id === activeTab);
                      if (idx > 0) setActiveTab(tabs[idx - 1].id);
                    }}
                    className="px-6 py-2.5 rounded-xl border border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-300 font-semibold hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
                  >
                    ย้อนกลับ
                  </button>
                )}
                {activeTab !== "travel" ? (
                  <button
                    type="button"
                    onClick={() => {
                      const idx = tabs.findIndex(t => t.id === activeTab);
                      if (idx < tabs.length - 1) setActiveTab(tabs[idx + 1].id);
                    }}
                    className="px-8 py-2.5 rounded-xl bg-gray-900 dark:bg-white text-white dark:text-gray-900 font-semibold hover:opacity-90 transition-opacity shadow-lg"
                  >
                    ถัดไป
                  </button>
                ) : (
                  <button
                    type="submit"
                    disabled={isLoading}
                    className="px-10 py-2.5 rounded-xl bg-indigo-600 text-white font-bold hover:bg-indigo-700 transition-all shadow-lg shadow-indigo-200 dark:shadow-indigo-900/20 disabled:opacity-50"
                  >
                    {isLoading ? "กำลังบันทึก..." : "ยืนยันการบันทึกข้อมูล"}
                  </button>
                )}
              </div>
            </div>
          </form>
        </div>
      </div>
    </MainLayout>
  );
}
