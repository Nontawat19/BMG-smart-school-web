import React, { useState, useEffect, FormEvent } from "react";
import { useParams, useNavigate } from "react-router-dom";
import MainLayout from "@/layouts/MainLayout";
import ProfileAvatar from "@/components/Shared/ProfileAvatar";
import { firestore, storage } from "@/firebase";
import { doc, getDoc, updateDoc, serverTimestamp, collection, getDocs, deleteField } from "firebase/firestore";
import { ref, uploadBytes, getDownloadURL, deleteObject } from "firebase/storage";
import Swal from 'sweetalert2';
import { compressImage } from "@/utils/imageUtils";
import { FaIdCard, FaUsers, FaMapMarkerAlt, FaHeartbeat, FaBus, FaArrowLeft, FaSave, FaGraduationCap, FaInfoCircle } from "react-icons/fa";
import { getLevelsByRange } from "@/utils/schoolUtils";
import { useSelector } from "react-redux";
import { RootState } from "@/store";
import BackButton from "@/components/Shared/BackButton";
import { isExitStudentStatus } from "@/utils/studentStatusUtils";
import { normalizeBirthDateInput, toBuddhistBirthDateForSave } from "@/utils/birthDateUtils";
import { isActiveStudentSummaryStatus, updateOwnerAndSchoolCounts } from "@/utils/ownerStatsUtils";
import { updateStudentReportSummaryForChange } from "@/utils/studentReportSummaryUtils";

// --- Reusable Components (from AddStudentPage) ---
const InfoCard: React.FC<{ title: string; children: React.ReactNode }> = ({ title, children }) => (
  <div className="bg-white dark:bg-[#2a2b2f] p-6 rounded-2xl shadow-sm dark:shadow-none">
    <h2 className="text-lg font-semibold mb-4 text-gray-800 dark:text-gray-200 border-b border-gray-200 dark:border-gray-600 pb-2">{title}</h2>
    <div className="space-y-4">{children}</div>
  </div>
);

const InputField: React.FC<{ label: string; name: string; value: string | number; onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => void; type?: string; placeholder?: string; maxLength?: number; disabled?: boolean; checked?: boolean }> = ({ label, name, value, onChange, type = "text", placeholder, maxLength, disabled, checked }) => (
  <div>
    <label htmlFor={name} className="block text-sm font-medium mb-1 text-gray-700 dark:text-gray-400">
      {label}
    </label>
    <input
      type={type}
      id={name}
      name={name}
      value={value}
      onChange={onChange}
      placeholder={placeholder}
      maxLength={maxLength}
      disabled={disabled}
      checked={checked}
      className={`w-full bg-white dark:bg-[#1e1f21] border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500 transition text-gray-900 dark:text-white ${disabled ? "bg-gray-200 dark:bg-gray-700 cursor-not-allowed" : ""}`}
    />
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

const StatusSwitch: React.FC<{ label: string; name: string; options: readonly string[]; value: string; onChange: (name: string, value: string) => void; }> = ({ label, name, options, value, onChange }) => (
  <div>
    <label className="block text-sm font-medium mb-2 text-gray-700 dark:text-gray-400">{label}</label>
    <div className="flex flex-wrap gap-2 bg-gray-100 dark:bg-[#1e1f21] border border-gray-300 dark:border-gray-600 rounded-lg p-2">
      {options.map((option) => {
        const isSelected = value === option;
        const colors = statusColorMap[option] || { bg: "bg-indigo-600", hover: "hover:bg-indigo-700", text: "text-white" };
        return (
          <button key={option} type="button" onClick={() => onChange(name, option)} className={`flex-1 text-center px-3 py-2 text-sm font-bold rounded-md transition-all duration-200 focus:outline-none ${isSelected ? `${colors.bg} ${colors.text} shadow-md scale-105` : `text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700`}`}>
            {option}
          </button>
        );
      })}
    </div>
  </div>
);

const initialState = {
  // 1. ข้อมูลระบุตัวตนนักเรียน (Student Identity)
  idCardNumber: "", title: "", firstName: "", lastName: "", nickname: "",
  firstNameEn: "", lastNameEn: "", birthDate: "", gender: "",
  religion: "", ethnicity: "", nationality: "", bloodType: "",
  birthProvince: "",

  // 2. ข้อมูลการเรียน (Educational Info)
  studentId: "", studentNumber: "", classLevel: "", room: "",
  studentStatus: "กำลังศึกษาอยู่", enrollmentDate: "",
  exitDate: "", exitReason: "", exitDestinationSchool: "",
  gpa: "", gpax: "", behaviorScore: 100,
  subSchoolId: "", subSchoolName: "",

  // 3. พี่น้อง (Siblings)
  totalSiblings: "0", totalSiblingsInSchool: "0", siblingPosition: "1",
  elderBrotherCount: "0", youngerBrotherCount: "0",
  elderSisterCount: "0", youngerSisterCount: "0",
  childOrder: "1", childOrderInCategory: "1", studyingSiblingCount: "0",

  // 4. สถานภาพครอบครัว (Family Status)
  familyStatus: "อยู่ร่วมกัน", parentsMaritalStatus: "อยู่ด้วยกัน",

  // 5. ข้อมูลบิดา (Father Info)
  fatherIdNumber: "", fatherTitle: "", fatherFirstName: "", fatherLastName: "",
  fatherOccupation: "", fatherMonthlyIncome: "", fatherPhone: "",

  // 6. ข้อมูลมารดา (Mother Info)
  motherIdNumber: "", motherTitle: "", motherFirstName: "", motherLastName: "",
  motherOccupation: "", motherMonthlyIncome: "", motherPhone: "",

  // 7. ข้อมูลผู้ปกครอง (Guardian Info)
  guardianRelationship: "เกี่ยวข้องเป็น",
  guardianIdNumber: "", guardianTitle: "", guardianFirstName: "", guardianLastName: "",
  guardianOccupation: "", guardianMonthlyIncome: "", guardianPhone: "",

  // 8. ข้อมูลที่อยู่ตามทะเบียนบ้าน
  regHouseId: "", regAddressNumber: "", regMoo: "", regRoad: "", regSoi: "",
  regSubDistrict: "", regDistrict: "", regProvince: "", regZipCode: "", regPhone: "",

  // 9. ข้อมูลที่อยู่ปัจจุบัน
  curHouseId: "", curAddressNumber: "", curMoo: "", curRoad: "", curSoi: "",
  curSubDistrict: "", curDistrict: "", curProvince: "", curZipCode: "", curPhone: "",

  // 10. ข้อมูลสุขภาพ
  weight: "", height: "", disabilityType: "ปกติ",

  // 11. ข้อมูลเศรษฐกิจและความด้อยโอกาส
  disadvantageType: "ไม่มี", staysAtSchool: "ไม่พักนอน",
  lacksUniform: false, lacksStationery: false, lacksTextbook: false, lacksLunch: false,
  isPoor: "no", isLackOfFood: "no", isLackOfStationery: "no", isLackOfUniform: "no",

  // 12. ข้อมูลการเดินทาง
  distanceDirtRoad: "0", distancePavedRoad: "0", distanceWaterway: "0",
  travelTime: "", travelMethod: "เดิน",
  travelMonthlyCost: "0",
  travelDistance: "0", fare: "0",

  profileImageUrl: "",
};

const studentStatusOptions = ["กำลังศึกษาอยู่", "พักการเรียน", "แขวนลอย", "ย้าย", "ลาออก", "จำหน่าย"] as const;

export default function EditStudentPage() {
  const { schoolId, studentId } = useParams<{ schoolId: string, studentId: string }>();
  const navigate = useNavigate();
  const [form, setForm] = useState(initialState);
  const [isLoading, setIsLoading] = useState(false);
  const [isFetching, setIsFetching] = useState(true);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [availableLevels, setAvailableLevels] = useState<string[]>([]);
  const [subSchools, setSubSchools] = useState<{ id: string, name: string }[]>([]);
  const [activeTab, setActiveTab] = useState<string>("general");
  const [originalStudentData, setOriginalStudentData] = useState<any | null>(null);
  const showExitDetails = isExitStudentStatus(form.studentStatus);
  const exitReasonLabel = `เหตุผลที่${form.studentStatus}`;

  const tabs = [
    { id: "general", label: "ข้อมูลทั่วไป", icon: <FaIdCard /> },
    { id: "academic", label: "การศึกษา", icon: <FaGraduationCap /> },
    { id: "family", label: "ครอบครัว", icon: <FaUsers /> },
    { id: "address", label: "ที่อยู่", icon: <FaMapMarkerAlt /> },
    { id: "welfare", label: "สุขภาพ/สวัสดิการ", icon: <FaHeartbeat /> },
    { id: "travel", label: "การเดินทาง", icon: <FaBus /> },
  ];

  useEffect(() => {
    if (!schoolId || !studentId) {
      Swal.fire({
        icon: 'error',
        title: 'เกิดข้อผิดพลาด',
        text: 'ไม่พบรหัสนักเรียนใน URL กรุณาลองใหม่อีกครั้ง',
        background: '#2a2b2f',
        color: '#ffffff'
      });
      navigate(-1);
      return;
    }
    const fetchStudentData = async () => {
      setIsFetching(true);
      try {
        const docRef = doc(firestore, "school-settings", schoolId, "students", studentId);
        const docSnap = await getDoc(docRef);
        if (docSnap.exists()) {
          const data = docSnap.data();
          setOriginalStudentData({ id: docSnap.id, ...data });

          const formattedBirthDate = data.birthDate ? normalizeBirthDateInput(data.birthDate) : "";

          // Merge existing data with initialState to ensure all fields exist
          setForm((prev) => ({
            ...prev,
            ...data,
            birthDate: formattedBirthDate || data.birthDate || "", // Use formatted or original
            exitDate: data.exitDetails?.exitDate || data.exitDate || "",
            exitReason: data.exitDetails?.reason || data.exitReason || "",
            exitDestinationSchool: data.exitDetails?.destinationSchool || data.exitDestinationSchool || "",
          }));
          if (data.profileImageUrl) {
            setImagePreview(data.profileImageUrl);
          }
        } else {
          Swal.fire({
            icon: 'error',
            title: 'ไม่พบข้อมูล',
            text: 'ไม่พบข้อมูลนักเรียนที่ต้องการแก้ไข',
            background: '#2a2b2f',
            color: '#ffffff'
          });
          navigate(-1);
        }
      } catch (error) {
        console.error("Error fetching student data:", error);
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
    fetchStudentData();
  }, [schoolId, studentId, navigate]);

  // ✅ ดึง availableLevels จาก Redux (แทนการ fetch school-settings ซ้ำ)
  const reduxSchoolSettings = useSelector((state: RootState) => state.schoolSettings);
  useEffect(() => {
    if (reduxSchoolSettings.status === 'succeeded' && reduxSchoolSettings.availableClassOptions.length > 0) {
      setAvailableLevels(reduxSchoolSettings.availableClassOptions.map(([_, name]: [string, string]) => name));
    }
  }, [reduxSchoolSettings.status, reduxSchoolSettings.availableClassOptions]);

  // subSchools ยังต้อง fetch เองเพราะไม่อยู่ใน Redux
  useEffect(() => {
    const fetchSubSchools = async () => {
      if (!schoolId) return;
      try {
        const schoolRef = doc(firestore, "school-settings", schoolId);
        const schoolSnap = await getDoc(schoolRef);
        if (schoolSnap.exists()) {
          const data = schoolSnap.data();
          if (data.subSchools && Array.isArray(data.subSchools)) {
            setSubSchools(data.subSchools);
          }
        }
      } catch (error) {
        console.error("Error fetching sub schools:", error);
      }
    };
    fetchSubSchools();
  }, [schoolId]);

  function handleChange(e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) {
    const { name, value, type } = e.target;
    let finalValue: any = value;

    if (type === 'checkbox') {
      finalValue = (e.target as HTMLInputElement).checked;
    } else if (name === "birthDate") {
      finalValue = normalizeBirthDateInput(value);
    } else if (name === "idCardNumber") {
      finalValue = value.replace(/[^0-9]/g, "");
    }

    setForm((prev) => {
      const newState = { ...prev, [name]: finalValue };

      // ถ้าเปลี่ยนโรงเรียนสาขา ให้อัปเดตชื่อโรงเรียนสาขา
      if (name === "subSchoolId") {
        const selectedSubSchool = subSchools.find(s => s.id === value);
        newState.subSchoolName = selectedSubSchool ? selectedSubSchool.name : "";
      }
      return newState;
    });
  }

  function handleStatusChange(name: string, value: string) {
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
    if (!schoolId || !studentId) return;

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
      let { profileImageUrl, ...studentData } = form;
      studentData.birthDate = toBuddhistBirthDateForSave(studentData.birthDate);

      // 💡 Padding Student ID: ถ้าเป็น 4 หลัก ให้เติม 0 ข้างหน้า
      if (studentData.studentId && studentData.studentId.length === 4) {
        studentData.studentId = `0${studentData.studentId}`;
      }

      const roles = ["student"];
      if (form.fatherPhone || form.motherPhone || form.guardianPhone) {
        roles.push("parent");
      }

      const dataToUpdate: any = {
        ...studentData,
        status: studentData.studentStatus,
        role: roles,
        updatedAt: serverTimestamp(),
      };

      if (isExitStudentStatus(studentData.studentStatus)) {
        dataToUpdate.exitDetails = {
          exitDate: studentData.exitDate || "",
          reason: studentData.exitReason || "",
          destinationSchool: studentData.exitDestinationSchool || "",
          status: studentData.studentStatus,
        };
      } else {
        dataToUpdate.exitDetails = deleteField();
      }

      // Handle image upload
      if (imageFile) {
        const fileExtension = '.jpg';
        let storagePath = `school-settings/${schoolId}/students/${form.classLevel}`;
        storagePath += `/${form.room}`;

        const newFileName = `${studentData.studentId}${fileExtension}`;
        const newFilePath = `${storagePath}/${newFileName}`;
        const newImageRef = ref(storage, newFilePath);

        if (form.profileImageUrl) {
          try {
            const oldImageRef = ref(storage, form.profileImageUrl);
            if (oldImageRef.fullPath !== newImageRef.fullPath) {
              await deleteObject(oldImageRef);
            }
          } catch (error) {
            console.warn("Could not check/delete old image:", error);
          }
        }

        const snapshot = await uploadBytes(newImageRef, imageFile);
        dataToUpdate.profileImageUrl = await getDownloadURL(snapshot.ref);
      }

      const docRef = doc(firestore, "school-settings", schoolId, "students", studentId);
      await updateDoc(docRef, dataToUpdate);
      const updatedStudentForSummary = {
        ...(originalStudentData || {}),
        ...dataToUpdate,
        id: studentId,
      };
      const wasActive = isActiveStudentSummaryStatus(originalStudentData?.studentStatus || originalStudentData?.status);
      const isActive = isActiveStudentSummaryStatus(updatedStudentForSummary.studentStatus || updatedStudentForSummary.status);
      if (wasActive !== isActive) {
        await updateOwnerAndSchoolCounts(firestore, schoolId, { students: isActive ? 1 : -1 });
      }
      await updateStudentReportSummaryForChange(firestore, schoolId, originalStudentData, updatedStudentForSummary);
      setOriginalStudentData(updatedStudentForSummary);

      // --- อัปเดต Lookup Table เพื่อให้ข้อมูล Login เป็นปัจจุบัน ---
      try {
        const { updateStudentLookup } = await import("@/utils/studentLookupUtils");
        await updateStudentLookup(studentData.idCardNumber, studentData.studentId, schoolId, studentId);
      } catch (lookupErr) {
        console.warn("Failed to update student lookup table:", lookupErr);
      }

      // --- START: อัปเดตข้อมูลใน localStorage ของหน้าลงเวลา ---
      try {
        const latestUsersRaw = localStorage.getItem("latestUsers");
        if (latestUsersRaw) {
          let latestUsers: any[] = JSON.parse(latestUsersRaw);
          const userIndex = latestUsers.findIndex(user => user.id === studentId && user.type === 'student');

          if (userIndex !== -1) {
            latestUsers[userIndex] = {
              ...latestUsers[userIndex],
              name: `${form.title}${form.firstName} ${form.lastName}`,
              profileImageUrl: dataToUpdate.profileImageUrl || form.profileImageUrl,
            };
            localStorage.setItem("latestUsers", JSON.stringify(latestUsers));
          }
        }
      } catch (e) {
        console.warn("Could not update latestUsers in localStorage:", e);
      }
      // --- END: อัปเดตข้อมูลใน localStorage ---

      Swal.fire({
        icon: 'success',
        title: 'อัปเดตสำเร็จ!',
        text: 'ข้อมูลนักเรียนได้รับการอัปเดตเรียบร้อยแล้ว',
        timer: 1500,
        showConfirmButton: false,
        background: '#2a2b2f',
        color: '#ffffff'
      });
      setTimeout(() => navigate(`/school/${schoolId}/students/view/${studentId}`), 1500);

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
          กำลังโหลดข้อมูลนักเรียน...
        </div>
      </MainLayout>
    );
  }

  return (
    <MainLayout>
      <div className="min-h-screen bg-gray-50 dark:bg-[#1e1f21] text-gray-900 dark:text-white">
        <div className="max-w-6xl mx-auto px-3 sm:px-4 md:px-6 lg:px-8 py-4 sm:py-6 lg:py-8">
          <header className="mb-8 flex items-center gap-4">
            <BackButton to="/academic/hub/students" />
            <div>
              <h1 className="text-3xl font-bold tracking-tight">แก้ไขข้อมูลนักเรียน</h1>
              <p className="mt-1 text-gray-500 dark:text-gray-400">
                คุณกำลังแก้ไขข้อมูลของ: <span className="font-semibold text-indigo-400">{form.firstName} {form.lastName}</span>
              </p>
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
                    <div className="flex flex-col sm:flex-row items-center sm:items-start gap-6">
                      <div className="flex-shrink-0">
                        <label htmlFor="profileImage" className="relative cursor-pointer group block">
                          {imagePreview ? (
                            <ProfileAvatar src={imagePreview} alt="Student profile" className="w-32 h-32 border-4 border-gray-200 dark:border-gray-600" />
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
                        <InputField label="เลขบัตรประจำตัวประชาชน" name="idCardNumber" value={form.idCardNumber} onChange={handleChange} maxLength={13} placeholder="กรอกเลข 13 หลัก" />
                        <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
                          <div>
                            <label className="block text-sm font-medium mb-1 text-gray-700 dark:text-gray-400">คำนำหน้า</label>
                            <select name="title" value={form.title} onChange={handleChange} className="w-full bg-white dark:bg-[#1e1f21] border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500 transition text-gray-900 dark:text-white">
                              <option value="">เลือกคำนำหน้า</option>
                              <option value="ด.ช.">เด็กชาย (ด.ช.)</option>
                              <option value="ด.ญ.">เด็กหญิง (ด.ญ.)</option>
                              <option value="นาย">นาย</option>
                              <option value="น.ส.">นางสาว</option>
                            </select>
                          </div>
                          <InputField label="ชื่อจริง" name="firstName" value={form.firstName} onChange={handleChange} />
                          <InputField label="นามสกุล" name="lastName" value={form.lastName} onChange={handleChange} />
                          <div className="max-w-[150px]">
                            <InputField label="ชื่อเล่น" name="nickname" value={form.nickname} onChange={handleChange} />
                          </div>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                          <InputField label="ชื่อจริง (อังกฤษ)" name="firstNameEn" value={form.firstNameEn} onChange={handleChange} placeholder="First Name" />
                          <InputField label="นามสกุล (อังกฤษ)" name="lastNameEn" value={form.lastNameEn} onChange={handleChange} placeholder="Last Name" />
                          <InputField label="วันเกิด (วว/ดด/ปปปป)" name="birthDate" value={form.birthDate} onChange={handleChange} type="date" />
                        </div>

                        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                          <div>
                            <label className="block text-sm font-medium mb-1 text-gray-700 dark:text-gray-400">เพศ</label>
                            <select name="gender" value={form.gender} onChange={handleChange} className="w-full bg-white dark:bg-[#1e1f21] border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500 transition text-gray-900 dark:text-white">
                              <option value="">ระบุเพศ</option>
                              <option value="ชาย">ชาย</option>
                              <option value="หญิง">หญิง</option>
                            </select>
                          </div>
                          <InputField label="หมู่เลือด" name="bloodType" value={form.bloodType} onChange={handleChange} />
                          <InputField label="ศาสนา" name="religion" value={form.religion} onChange={handleChange} />
                          <InputField label="สัญชาติ" name="nationality" value={form.nationality} onChange={handleChange} />
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                          <InputField label="จังหวัดเกิด" name="birthProvince" value={form.birthProvince} onChange={handleChange} />
                        </div>
                      </div>
                    </div>
                  </InfoCard>
                </div>
              )}

              {activeTab === "academic" && (
                <div className="space-y-6 animate-in fade-in slide-in-from-right-4 duration-500">
                  <InfoCard title="ข้อมูลการศึกษา">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
                      {subSchools.length > 0 && (
                        <div>
                          <label className="block text-sm font-medium mb-1 text-gray-700 dark:text-gray-400">โรงเรียนสาขา (ถ้ามี)</label>
                          <select name="subSchoolId" value={form.subSchoolId} onChange={handleChange} className="w-full bg-white dark:bg-[#1e1f21] border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500 transition text-gray-900 dark:text-white">
                            <option value="">-- โรงเรียนหลัก --</option>
                            {subSchools.map(sub => (
                              <option key={sub.id} value={sub.id}>{sub.name}</option>
                            ))}
                          </select>
                        </div>
                      )}
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                      <div>
                        <label className="block text-sm font-medium mb-1 text-gray-700 dark:text-gray-400">ชั้น</label>
                        <select name="classLevel" value={form.classLevel} onChange={handleChange} className="w-full bg-white dark:bg-[#1e1f21] border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500 transition text-gray-900 dark:text-white">
                          <option value="">เลือกชั้น</option>
                          {availableLevels.map(level => <option key={level} value={level}>{level}</option>)}
                        </select>
                      </div>

                      <div>
                        <label className="block text-sm font-medium mb-1 text-gray-700 dark:text-gray-400">ห้อง</label>
                        <select name="room" value={form.room} onChange={handleChange} className="w-full bg-white dark:bg-[#1e1f21] border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500 transition text-gray-900 dark:text-white">
                          <option value="">เลือกห้อง</option>
                          {Array.from({ length: 20 }, (_, i) => i + 1).map(r => <option key={r} value={r}>{r}</option>)}
                        </select>
                      </div>
                      <InputField label="เลขที่" name="studentNumber" value={form.studentNumber} onChange={handleChange} />
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mt-4">
                      <div>
                        <InputField label="รหัสนักเรียน" name="studentId" value={form.studentId} onChange={handleChange} />
                        <p className="mt-1 text-[10px] flex items-center gap-1 text-amber-600 dark:text-amber-400 font-medium">
                          <FaInfoCircle className="flex-shrink-0" />
                          ควรเป็น 5 หลัก (หากโรงเรียนมี 4 หลัก ให้เติม 0 ข้างหน้า)
                        </p>
                      </div>
                      <InputField label="เกรดเฉลี่ยเทอมล่าสุด (GPA)" name="gpa" value={form.gpa} onChange={handleChange} />
                      <InputField label="เกรดเฉลี่ยสะสม (GPAX)" name="gpax" value={form.gpax} onChange={handleChange} />
                    </div>

	                    <div className="mt-6">
	                      <StatusSwitch label="สถานะนักเรียน" name="studentStatus" options={studentStatusOptions} value={form.studentStatus} onChange={handleStatusChange} />
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
                  <InfoCard title="ข้อมูลพี่น้อง">
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
                      <InputField label="จำนวนพี่น้องทั้งหมด" name="totalSiblings" value={form.totalSiblings} onChange={handleChange} type="number" />
                      <InputField label="กำลังศึกษาอยู่" name="studyingSiblingCount" value={form.studyingSiblingCount} onChange={handleChange} type="number" />
                      <InputField label="เป็นบุตรคนที่" name="childOrder" value={form.childOrder} onChange={handleChange} type="number" />
                      <InputField label="เป็นคนเรียนคนที่" name="childOrderInCategory" value={form.childOrderInCategory} onChange={handleChange} type="number" />
                    </div>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-6 mt-4">
                      <InputField label="พี่ชาย (คน)" name="elderBrotherCount" value={form.elderBrotherCount} onChange={handleChange} type="number" />
                      <InputField label="น้องชาย (คน)" name="youngerBrotherCount" value={form.youngerBrotherCount} onChange={handleChange} type="number" />
                      <InputField label="พี่สาว (คน)" name="elderSisterCount" value={form.elderSisterCount} onChange={handleChange} type="number" />
                      <InputField label="น้องสาว (คน)" name="youngerSisterCount" value={form.youngerSisterCount} onChange={handleChange} type="number" />
                    </div>

                    <div className="mt-6 grid grid-cols-1 sm:grid-cols-2 gap-6">
                      <div>
                        <label className="block text-sm font-medium mb-1 text-gray-700 dark:text-gray-400">สถานภาพบิดามารดา</label>
                        <select name="parentsMaritalStatus" value={form.parentsMaritalStatus} onChange={handleChange} className="w-full bg-white dark:bg-[#1e1f21] border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500 transition text-gray-900 dark:text-white">
                          <option value="อยู่ด้วยกัน">อยู่ด้วยกัน</option>
                          <option value="หย่าร้าง">หย่าร้าง</option>
                          <option value="แยกกันอยู่">แยกกันอยู่</option>
                          <option value="บิดาถึงแก่กรรม">บิดาถึงแก่กรรม</option>
                          <option value="มารดาถึงแก่กรรม">มารดาถึงแก่กรรม</option>
                          <option value="บิดามารดาถึงแก่กรรม">บิดามารดาถึงแก่กรรม</option>
                        </select>
                      </div>
                      <InputField label="สถานภาพครอบครัว (นักเรียนกับผู้ปกครอง)" name="familyStatus" value={form.familyStatus} onChange={handleChange} />
                    </div>
                  </InfoCard>

                  <InfoCard title="ข้อมูลบิดา">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <InputField label="เลขบัตรประจำตัวประชาชนบิดา" name="fatherIdNumber" value={form.fatherIdNumber} onChange={handleChange} maxLength={13} />
                      <div className="grid grid-cols-3 gap-2">
                        <InputField label="คำนำหน้า" name="fatherTitle" value={form.fatherTitle} onChange={handleChange} />
                        <div className="col-span-2">
                          <InputField label="ชื่อ-นามสกุล" name="fatherFirstName" value={`${form.fatherFirstName} ${form.fatherLastName}`} onChange={(e) => {
                            const [first, ...last] = e.target.value.split(" ");
                            setForm(prev => ({ ...prev, fatherFirstName: first || "", fatherLastName: last.join(" ") }));
                          }} />
                        </div>
                      </div>
                      <InputField label="อาชีพ" name="fatherOccupation" value={form.fatherOccupation} onChange={handleChange} />
                      <InputField label="รายได้ต่อเดือน" name="fatherMonthlyIncome" value={form.fatherMonthlyIncome} onChange={handleChange} type="number" />
                    </div>
                  </InfoCard>

                  <InfoCard title="ข้อมูลมารดา">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <InputField label="เลขบัตรประจำตัวประชาชนมารดา" name="motherIdNumber" value={form.motherIdNumber} onChange={handleChange} maxLength={13} />
                      <div className="grid grid-cols-3 gap-2">
                        <InputField label="คำนำหน้า" name="motherTitle" value={form.motherTitle} onChange={handleChange} />
                        <div className="col-span-2">
                          <InputField label="ชื่อ-นามสกุล" name="motherFirstName" value={`${form.motherFirstName} ${form.motherLastName}`} onChange={(e) => {
                            const [first, ...last] = e.target.value.split(" ");
                            setForm(prev => ({ ...prev, motherFirstName: first || "", motherLastName: last.join(" ") }));
                          }} />
                        </div>
                      </div>
                      <InputField label="อาชีพ" name="motherOccupation" value={form.motherOccupation} onChange={handleChange} />
                      <InputField label="รายได้ต่อเดือน" name="motherMonthlyIncome" value={form.motherMonthlyIncome} onChange={handleChange} type="number" />
                    </div>
                  </InfoCard>

                  <InfoCard title="ข้อมูลผู้ปกครอง">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <InputField label="เกี่ยวข้องเป็น" name="guardianRelationship" value={form.guardianRelationship} onChange={handleChange} />
                      <InputField label="เลขบัตรประจำตัวประชาชนผู้ปกครอง" name="guardianIdNumber" value={form.guardianIdNumber} onChange={handleChange} maxLength={13} />
                      <div className="grid grid-cols-3 gap-2">
                        <InputField label="คำนำหน้า" name="guardianTitle" value={form.guardianTitle} onChange={handleChange} />
                        <div className="col-span-2">
                          <InputField label="ชื่อ-นามสกุล" name="guardianFirstName" value={`${form.guardianFirstName} ${form.guardianLastName}`} onChange={(e) => {
                            const [first, ...last] = e.target.value.split(" ");
                            setForm(prev => ({ ...prev, guardianFirstName: first || "", guardianLastName: last.join(" ") }));
                          }} />
                        </div>
                      </div>
                      <InputField label="อาชีพ" name="guardianOccupation" value={form.guardianOccupation} onChange={handleChange} />
                      <div className="grid grid-cols-2 gap-4">
                        <InputField label="รายได้ต่อเดือน" name="guardianMonthlyIncome" value={form.guardianMonthlyIncome} onChange={handleChange} type="number" />
                        <InputField label="เบอร์โทรศัพท์" name="guardianPhone" value={form.guardianPhone} onChange={handleChange} type="tel" />
                      </div>
                    </div>
                  </InfoCard>
                </div>
              )}

              {activeTab === "address" && (
                <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
                  <InfoCard title="ที่อยู่ตามทะเบียนบ้าน">
                    <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
                      <div className="col-span-2 md:col-span-2"><InputField label="รหัสประจำบ้าน" name="regHouseId" value={form.regHouseId} onChange={handleChange} /></div>
                      <InputField label="บ้านเลขที่" name="regAddressNumber" value={form.regAddressNumber} onChange={handleChange} />
                      <InputField label="หมู่ที่" name="regMoo" value={form.regMoo} onChange={handleChange} />
                      <div className="col-span-2"><InputField label="ถนน" name="regRoad" value={form.regRoad} onChange={handleChange} /></div>
                      <div className="col-span-2"><InputField label="ซอย" name="regSoi" value={form.regSoi} onChange={handleChange} /></div>

                      <div className="col-span-2 md:col-span-2"><InputField label="ตำบล" name="regSubDistrict" value={form.regSubDistrict} onChange={handleChange} /></div>
                      <div className="col-span-2 md:col-span-2"><InputField label="อำเภอ" name="regDistrict" value={form.regDistrict} onChange={handleChange} /></div>
                      <div className="col-span-2 md:col-span-2"><InputField label="จังหวัด" name="regProvince" value={form.regProvince} onChange={handleChange} /></div>
                      <div className="col-span-2 md:col-span-2"><InputField label="รหัสไปรษณีย์" name="regZipCode" value={form.regZipCode} onChange={handleChange} maxLength={5} /></div>
                      <div className="col-span-2 md:col-span-2"><InputField label="เบอร์โทรศัพท์บ้าน" name="regPhone" value={form.regPhone} onChange={handleChange} type="tel" /></div>
                    </div>
                  </InfoCard>

                  <InfoCard title="ที่อยู่ปัจจุบัน">
                    <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
                      <div className="col-span-2 md:col-span-2"><InputField label="รหัสประจำบ้าน" name="curHouseId" value={form.curHouseId} onChange={handleChange} /></div>
                      <InputField label="บ้านเลขที่" name="curAddressNumber" value={form.curAddressNumber} onChange={handleChange} />
                      <InputField label="หมู่ที่" name="curMoo" value={form.curMoo} onChange={handleChange} />
                      <div className="col-span-2"><InputField label="ถนน" name="curRoad" value={form.curRoad} onChange={handleChange} /></div>
                      <div className="col-span-2"><InputField label="ซอย" name="curSoi" value={form.curSoi} onChange={handleChange} /></div>

                      <div className="col-span-2 md:col-span-2"><InputField label="ตำบล" name="curSubDistrict" value={form.curSubDistrict} onChange={handleChange} /></div>
                      <div className="col-span-2 md:col-span-2"><InputField label="อำเภอ" name="curDistrict" value={form.curDistrict} onChange={handleChange} /></div>
                      <div className="col-span-2 md:col-span-2"><InputField label="จังหวัด" name="curProvince" value={form.curProvince} onChange={handleChange} /></div>
                      <div className="col-span-2 md:col-span-2"><InputField label="รหัสไปรษณีย์" name="curZipCode" value={form.curZipCode} onChange={handleChange} maxLength={5} /></div>
                      <div className="col-span-2 md:col-span-2"><InputField label="เบอร์โทรศัพท์" name="curPhone" value={form.curPhone} onChange={handleChange} type="tel" /></div>
                    </div>
                  </InfoCard>
                </div>
              )}

              {activeTab === "welfare" && (
                <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
                  <InfoCard title="ข้อมูลสุขภาพ">
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
                      <InputField label="น้ำหนัก (กก.)" name="weight" value={form.weight} onChange={handleChange} type="number" />
                      <InputField label="ส่วนสูง (ซม.)" name="height" value={form.height} onChange={handleChange} type="number" />
                      <div>
                        <label className="block text-sm font-medium mb-1 text-gray-700 dark:text-gray-400">ประเภทความพิการ</label>
                        <select name="disabilityType" value={form.disabilityType} onChange={handleChange} className="w-full bg-white dark:bg-[#1e1f21] border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500 transition text-gray-900 dark:text-white">
                          <option value="ปกติ">ปกติ</option>
                          <option value="บกพร่องทางการเรียนรู้">บกพร่องทางการเรียนรู้</option>
                          <option value="บกพร่องทางสติปัญญา">บกพร่องทางสติปัญญา</option>
                          <option value="บกพร่องทางการได้ยิน">บกพร่องทางการได้ยิน</option>
                          <option value="บกพร่องทางการมองเห็น">บกพร่องทางการมองเห็น</option>
                          <option value="อื่นๆ">อื่นๆ</option>
                        </select>
                      </div>
                    </div>
                  </InfoCard>

                  <InfoCard title="ข้อมูลความด้อยโอกาส">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      <div>
                        <label className="block text-sm font-medium mb-1 text-gray-700 dark:text-gray-400">ระดับความยากจน/ด้อยโอกาส</label>
                        <select name="disadvantageType" value={form.disadvantageType} onChange={handleChange} className="w-full bg-white dark:bg-[#1e1f21] border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500 transition text-gray-900 dark:text-white">
                          <option value="ไม่มี">ไม่มี</option>
                          <option value="ยากจน">ยากจน</option>
                          <option value="ยากจนพิเศษ">ยากจนพิเศษ (ทุนกสศ.)</option>
                          <option value="ด้อยโอกาส">ด้อยโอกาส</option>
                        </select>
                      </div>
                      <div>
                        <label className="block text-sm font-medium mb-1 text-gray-700 dark:text-gray-400">การพักนอน</label>
                        <select name="staysAtSchool" value={form.staysAtSchool} onChange={handleChange} className="w-full bg-white dark:bg-[#1e1f21] border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500 transition text-gray-900 dark:text-white">
                          <option value="ไม่พักนอน">ไม่พักนอน</option>
                          <option value="พักนอน (บ้านพักโรงเรียน)">พักนอน (บ้านพักโรงเรียน)</option>
                        </select>
                      </div>
                    </div>
                    {/* Checkboxes for Lacking specific things */}
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-4">
                      <label className="flex items-center space-x-2 p-3 bg-gray-50 dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 cursor-pointer">
                        <input type="checkbox" name="lacksUniform" checked={form.lacksUniform} onChange={handleChange} className="w-4 h-4 text-indigo-600 bg-gray-100 border-gray-300 rounded focus:ring-indigo-500 focus:ring-2" />
                        <span className="text-sm">ขาดแคลนเครื่องแบบ</span>
                      </label>
                      <label className="flex items-center space-x-2 p-3 bg-gray-50 dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 cursor-pointer">
                        <input type="checkbox" name="lacksStationery" checked={form.lacksStationery} onChange={handleChange} className="w-4 h-4 text-indigo-600 bg-gray-100 border-gray-300 rounded focus:ring-indigo-500 focus:ring-2" />
                        <span className="text-sm">ขาดแคลนเครื่องเขียน</span>
                      </label>
                      <label className="flex items-center space-x-2 p-3 bg-gray-50 dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 cursor-pointer">
                        <input type="checkbox" name="lacksTextbook" checked={form.lacksTextbook} onChange={handleChange} className="w-4 h-4 text-indigo-600 bg-gray-100 border-gray-300 rounded focus:ring-indigo-500 focus:ring-2" />
                        <span className="text-sm">ขาดแคลนแบบเรียน</span>
                      </label>
                      <label className="flex items-center space-x-2 p-3 bg-gray-50 dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 cursor-pointer">
                        <input type="checkbox" name="lacksLunch" checked={form.lacksLunch} onChange={handleChange} className="w-4 h-4 text-indigo-600 bg-gray-100 border-gray-300 rounded focus:ring-indigo-500 focus:ring-2" />
                        <span className="text-sm">ขาดแคลนอาหารกลางวัน</span>
                      </label>
                    </div>
                  </InfoCard>
                </div>
              )}

              {activeTab === "travel" && (
                <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
                  <InfoCard title="ระยะทางและวิธีการเดินทาง">
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
                      <InputField label="ระยะทางถนนลูกรัง (กม.)" name="distanceDirtRoad" value={form.distanceDirtRoad} onChange={handleChange} type="number" />
                      <InputField label="ระยะทางถนนลาดยาง (กม.)" name="distancePavedRoad" value={form.distancePavedRoad} onChange={handleChange} type="number" />
                      <InputField label="ระยะทางทางน้ำ (กม.)" name="distanceWaterway" value={form.distanceWaterway} onChange={handleChange} type="number" />
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6 pt-4">
                      <div>
                        <label className="block text-sm font-medium mb-1 text-gray-700 dark:text-gray-400">วิธีเดินทางหลัก</label>
                        <select name="travelMethod" value={form.travelMethod} onChange={handleChange} className="w-full bg-white dark:bg-[#1e1f21] border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500 transition text-gray-900 dark:text-white">
                          <option value="เดิน">เดิน</option>
                          <option value="จักรยาน">จักรยาน</option>
                          <option value="รถจักรยานยนต์">รถจักรยานยนต์</option>
                          <option value="รถยนต์ส่วนตัว">รถยนต์ส่วนตัว</option>
                          <option value="รถโดยสารประจำทาง">รถโดยสารประจำทาง</option>
                          <option value="รถรับจ้าง">รถรับจ้าง</option>
                          <option value="เรือ">เรือ</option>
                        </select>
                      </div>
                      <InputField label="เวลาเดินทาง (นาที)" name="travelTime" value={form.travelTime} onChange={handleChange} type="number" />
                      <InputField label="ค่าใช้จ่าย (เดือน)" name="travelMonthlyCost" value={form.travelMonthlyCost} onChange={handleChange} type="number" />
                    </div>
                  </InfoCard>
                </div>
              )}
            </div>

            {/* Bottom Actions - Sticky */}
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
                <button
                  type="button"
                  onClick={() => {
                    const idx = tabs.findIndex(t => t.id === activeTab);
                    if (idx > 0) {
                      setActiveTab(tabs[idx - 1].id);
                      window.scrollTo({ top: 0, behavior: 'smooth' });
                    } else {
                      navigate(-1); // If on first tab, go back to previous page
                    }
                  }}
                  className="px-6 py-2.5 rounded-xl border border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-300 font-semibold hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
                >
                  {activeTab === "general" ? "ย้อนกลับหน้าหลัก" : "ย้อนกลับ"}
                </button>

                {activeTab !== "travel" ? (
                  <button
                    type="button"
                    onClick={() => {
                      const idx = tabs.findIndex(t => t.id === activeTab);
                      if (idx < tabs.length - 1) {
                        setActiveTab(tabs[idx + 1].id);
                        window.scrollTo({ top: 0, behavior: 'smooth' });
                      }
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
                    {isLoading ? "กำลังบันทึก..." : "บันทึกข้อมูล"}
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
