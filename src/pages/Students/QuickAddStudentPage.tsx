import React, { useState, FormEvent, useEffect } from "react";
import MainLayout from "@/layouts/MainLayout";
import { useParams, useNavigate } from "react-router-dom";
import { firestore, storage, auth } from "@/firebase";
import { collection, addDoc, serverTimestamp, getDocs, query, doc, getDoc, where } from "firebase/firestore";
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";
import Swal from 'sweetalert2';
import { compressImage } from "@/utils/imageUtils";
import { FaIdCard, FaInfoCircle, FaUserPlus, FaArrowLeft } from "react-icons/fa";
import { getLevelsByRange } from "@/utils/schoolUtils";
import BackButton from "@/components/Shared/BackButton";
import { buildDuplicateStudentHtml, isExitStudentStatus } from "@/utils/studentStatusUtils";
import { isActiveStudentSummaryStatus, updateOwnerAndSchoolCounts } from "@/utils/ownerStatsUtils";

const InputField: React.FC<{ label: string; name: string; value: string; onChange: (e: React.ChangeEvent<HTMLInputElement>) => void; type?: string; placeholder?: string; maxLength?: number; required?: boolean }> = ({ label, name, value, onChange, type = "text", placeholder, maxLength, required }) => (
  <div>
    <label className="block text-[11px] font-bold mb-0.5 text-gray-500 dark:text-gray-400 uppercase tracking-tight">{label} {required && <span className="text-red-500">*</span>}</label>
    <input
      type={type}
      name={name}
      value={value}
      maxLength={maxLength}
      onChange={onChange}
      placeholder={placeholder}
      required={required}
      className="w-full bg-white dark:bg-[#1e1f21] border border-gray-300 dark:border-gray-600 rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-2 focus:ring-indigo-500 transition text-sm text-gray-900 dark:text-white"
    />
  </div>
);

const statusColorMap: { [key: string]: { bg: string; text: string } } = {
  "กำลังศึกษา": { bg: "bg-green-600", text: "text-white" },
  "พักการเรียน": { bg: "bg-yellow-500", text: "text-gray-900" },
  "แขวนลอย": { bg: "bg-amber-600", text: "text-white" },
  "ย้าย": { bg: "bg-blue-600", text: "text-white" },
  "ลาออก": { bg: "bg-red-600", text: "text-white" },
  "จำหน่าย": { bg: "bg-gray-600", text: "text-white" },
};

const StatusSwitch: React.FC<{
  label: string;
  name: string;
  options: readonly string[];
  value: string;
  onChange: (name: string, value: string) => void;
}> = ({ label, name, options, value, onChange }) => (
  <div>
    <label className="block text-[11px] font-bold mb-1 text-gray-500 dark:text-gray-400 uppercase tracking-tight">{label}</label>
    <div className="flex bg-gray-100 dark:bg-[#1e1f21] border border-gray-300 dark:border-gray-600 rounded-lg p-0.5 space-x-0.5">
      {options.map((option) => {
        const isSelected = value === option;
        const colors = statusColorMap[option] || { bg: "bg-indigo-600", text: "text-white" };
        return (
          <button
            key={option}
            type="button"
            onClick={() => onChange(name, option)}
            className={`w-full text-center py-1 text-[11px] font-bold rounded-md transition-all ${isSelected ? `${colors.bg} ${colors.text} shadow-sm` : `text-gray-500 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700`}`}
          >
            {option}
          </button>
        );
      })}
    </div>
  </div>
);

const initialState = {
  idCardNumber: "", studentId: "", title: "", firstName: "", lastName: "",
  firstNameEn: "", lastNameEn: "", nickname: "", gender: "", birthDate: "",
  ageYear: "", ageMonth: "", bloodType: "", birthProvince: "", nationality: "ไทย",
  race: "ไทย", religion: "พุทธ", schoolId: "", classLevel: "", room: "",
  studentNumber: "", studentStatus: "กำลังศึกษา", studentType: "ปกติ", gpa: "", gpax: "",
  exitDate: "", exitReason: "", exitDestinationSchool: "",
  elderBrotherCount: "0", youngerBrotherCount: "0", elderSisterCount: "0", youngerSisterCount: "0",
  childOrder: "1", childOrderInCategory: "1", studyingSiblingCount: "0",
  parentsMaritalStatus: "อยู่ด้วยกัน", fatherIdNumber: "", fatherTitle: "", fatherFirstName: "",
  fatherLastName: "", fatherOccupation: "", fatherMonthlyIncome: "", fatherPhone: "",
  motherIdNumber: "", motherTitle: "", motherFirstName: "", motherLastName: "",
  motherOccupation: "", motherMonthlyIncome: "", motherPhone: "",
  guardianRelationship: "", guardianIdNumber: "", guardianTitle: "", guardianFirstName: "",
  guardianLastName: "", guardianOccupation: "", guardianMonthlyIncome: "", guardianPhone: "",
  regHouseId: "", regAddressNumber: "", regMoo: "", regRoad: "", regSubDistrict: "",
  regDistrict: "", regProvince: "", regZipCode: "", regPhone: "",
  curHouseId: "", curAddressNumber: "", curMoo: "", curRoad: "", curSubDistrict: "",
  curDistrict: "", curProvince: "", curZipCode: "", curPhone: "",
  weight: "", height: "", disabilityType: "ปกติ", disadvantageType: "ไม่มี",
  staysAtSchool: "ไม่พักนอน", lacksUniform: false, lacksStationery: false, lacksTextbook: false,
  lacksLunch: false, distanceDirtRoad: "0", distancePavedRoad: "0", distanceWaterway: "0",
  travelTime: "", travelMethod: "เดิน", travelMonthlyCost: "0",
  profileImageUrl: "", behaviorScore: 100, subSchoolId: "", subSchoolName: "",
  elderBrotherCount1: "0", youngerBrotherCount1: "0", youngerBrotherCount2: "0", youngerSisterCount1: "0",
};

export default function QuickAddStudentPage() {
  const { schoolId } = useParams<{ schoolId?: string }>();
  const navigate = useNavigate();
  const [form, setForm] = useState(initialState);
  const [isLoading, setIsLoading] = useState(false);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [availableLevels, setAvailableLevels] = useState<string[]>([]);

  const studentStatusOptions = ["กำลังศึกษา", "พักการเรียน", "แขวนลอย", "ย้าย", "ลาออก", "จำหน่าย"] as const;
  const showExitDetails = isExitStudentStatus(form.studentStatus);
  const exitReasonLabel = `เหตุผลที่${form.studentStatus}`;

  useEffect(() => {
    if (schoolId) setForm(prev => ({ ...prev, schoolId: schoolId }));
    const fetchInitialData = async () => {
      const currentUser = auth.currentUser;
      if (!currentUser) return;
      const userDocSnap = await getDoc(doc(firestore, "users", currentUser.uid));
      if (userDocSnap.exists()) {
        const userSchoolId = userDocSnap.data().schoolId;
        if (userSchoolId) {
          const schoolDocSnap = await getDoc(doc(firestore, "school-settings", userSchoolId));
          if (schoolDocSnap.exists()) {
            if (!schoolId) setForm(prev => ({ ...prev, schoolId: userSchoolId }));
            setAvailableLevels(getLevelsByRange(schoolDocSnap.data().opportunityExpansionLevel || ""));
          }
        }
      }
    };
    fetchInitialData().catch(console.error);
  }, [schoolId]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setForm(prev => ({ ...prev, [name]: value }));
  };

  const handleStatusChange = (name: string, value: string) => {
    setForm(prev => ({
      ...prev,
      [name]: value,
      exitDate: name === "studentStatus" && isExitStudentStatus(value) && !prev.exitDate
        ? new Date().toISOString().split('T')[0]
        : prev.exitDate,
    }));
  };

  const handleImageChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      try {
        const compressedFile = await compressImage(file, 400, 0.7, 'image/jpeg');
        setImageFile(compressedFile);
        setImagePreview(URL.createObjectURL(compressedFile));
      } catch (error) {
        setImageFile(file);
        setImagePreview(URL.createObjectURL(file));
      }
    }
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    Swal.fire({ title: 'กำลังบันทึก...', allowOutsideClick: false, background: '#2a2b2f', color: '#ffffff', didOpen: () => Swal.showLoading() });
    try {
      let { profileImageUrl, schoolId: formSchoolId, ...studentData } = form;
      if (studentData.studentId && studentData.studentId.length === 4) studentData.studentId = `0${studentData.studentId}`;
      if (!formSchoolId) {
        Swal.fire({ icon: 'warning', title: 'กรุณาเลือกโรงเรียน', background: '#2a2b2f', color: '#ffffff' });
        setIsLoading(false);
        return;
      }

      const studentsRef = collection(firestore, 'school-settings', formSchoolId, 'students');
      let conflictDoc: any = null;

      if (studentData.studentId) {
        const snapshotId = await getDocs(query(studentsRef, where('studentId', '==', studentData.studentId)));
        if (!snapshotId.empty) conflictDoc = snapshotId.docs[0].data();
      }

      if (!conflictDoc && studentData.idCardNumber) {
        const snapshotCard = await getDocs(query(studentsRef, where('idCardNumber', '==', studentData.idCardNumber)));
        if (!snapshotCard.empty) conflictDoc = snapshotCard.docs[0].data();
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

      const dataToSave: any = { ...studentData, schoolId: formSchoolId, status: studentData.studentStatus, role: ["student"], createdAt: serverTimestamp() };
      if (isExitStudentStatus(studentData.studentStatus)) {
        dataToSave.exitDetails = {
          exitDate: studentData.exitDate || "",
          reason: studentData.exitReason || "",
          destinationSchool: studentData.exitDestinationSchool || "",
          status: studentData.studentStatus,
        };
      }
      if (imageFile) {
        const fileExtension = '.jpg';
        let storagePath = `school-settings/${formSchoolId}/students/${studentData.classLevel}/${studentData.room}/${studentData.studentId}${fileExtension}`;
        const imageRef = ref(storage, storagePath);
        const snapshot = await uploadBytes(imageRef, imageFile);
        dataToSave.profileImageUrl = await getDownloadURL(snapshot.ref);
      }
      const docRef = await addDoc(collection(firestore, "school-settings", formSchoolId, "students"), dataToSave);
      if (isActiveStudentSummaryStatus(studentData.studentStatus)) {
        await updateOwnerAndSchoolCounts(firestore, formSchoolId, { students: 1 });
      }
      const { updateStudentLookup } = await import("@/utils/studentLookupUtils");
      await updateStudentLookup(studentData.idCardNumber, studentData.studentId, formSchoolId, docRef.id);
      Swal.fire({ icon: 'success', title: 'บันทึกสำเร็จ!', timer: 1500, showConfirmButton: false, background: '#2a2b2f', color: '#ffffff' });
      navigate(`/school/${formSchoolId}/students/view/${docRef.id}`);
    } catch (error) {
      console.error(error);
      Swal.fire({ icon: 'error', title: 'เกิดข้อผิดพลาด', background: '#2a2b2f', color: '#ffffff' });
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
              <BackButton to="/academic/hub/students" />
              <h1 className="text-lg font-bold text-gray-800 dark:text-white flex items-center gap-2">
                <FaUserPlus className="text-indigo-600" size={18} />
                เพิ่มนักเรียนด่วน
              </h1>
            </div>
            <p className="text-[10px] text-gray-400 font-medium hidden sm:block italic">กรอกเฉพาะข้อมูลที่จำเป็นเพื่อประหยัดเวลา</p>
          </div>

          <form onSubmit={handleSubmit} className="flex-grow overflow-hidden flex flex-col">
            <div className="p-4 sm:p-6 space-y-5 flex-grow overflow-y-auto scrollbar-hide">
              
              <div className="flex flex-col md:flex-row gap-6">
                {/* Image Section */}
                <div className="flex flex-col items-center flex-shrink-0">
                  <label htmlFor="profileImage" className="relative cursor-pointer group">
                    <div className="w-28 h-28 rounded-full overflow-hidden border-2 border-gray-200 dark:border-gray-600 bg-gray-100 dark:bg-gray-700 flex items-center justify-center shadow-inner">
                      {imagePreview ? <img src={imagePreview} className="w-full h-full object-cover object-[center_20%]" alt="Student profile preview" /> : <FaIdCard className="text-4xl text-gray-400" />}
                    </div>
                    <div className="absolute bottom-0 right-0 bg-indigo-600 text-white p-2 rounded-full shadow-lg border-2 border-white dark:border-[#2a2b2f]">
                      <FaUserPlus size={12} />
                    </div>
                  </label>
                  <input type="file" id="profileImage" onChange={handleImageChange} className="hidden" accept="image/jpeg,image/png" />
                  <span className="mt-1.5 text-[9px] font-bold text-gray-400 uppercase tracking-tighter">คลิกเพื่ออัปโหลด</span>
                </div>

                {/* Identity Grid */}
                <div className="flex-grow space-y-3">
                  <InputField label="เลขบัตรประจำตัวประชาชน" name="idCardNumber" value={form.idCardNumber} onChange={handleChange} maxLength={13} required placeholder="13 หลัก" />
                  <div className="grid grid-cols-1 sm:grid-cols-5 gap-3">
                    <div className="sm:col-span-1">
                      <label className="block text-[11px] font-bold mb-0.5 text-gray-500 dark:text-gray-400 uppercase tracking-tight">คำนำหน้า *</label>
                      <select name="title" value={form.title} onChange={handleChange} required className="w-full bg-white dark:bg-[#1e1f21] border border-gray-300 dark:border-gray-600 rounded-lg px-2.5 py-1.5 text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500">
                        <option value="">เลือก</option>
                        <option value="ด.ช.">ด.ช.</option>
                        <option value="ด.ญ.">ด.ญ.</option>
                        <option value="นาย">นาย</option>
                        <option value="น.ส.">น.ส.</option>
                      </select>
                    </div>
                    <div className="sm:col-span-2"><InputField label="ชื่อจริง" name="firstName" value={form.firstName} onChange={handleChange} required /></div>
                    <div className="sm:col-span-2"><InputField label="นามสกุล" name="lastName" value={form.lastName} onChange={handleChange} required /></div>
                  </div>
                </div>
              </div>

              {/* Academic Grid */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 pt-2 border-t border-gray-50 dark:border-gray-700/50">
                <div>
                  <label className="block text-[11px] font-bold mb-0.5 text-gray-500 dark:text-gray-400 uppercase tracking-tight">ชั้น *</label>
                  <select name="classLevel" value={form.classLevel} onChange={handleChange} required className="w-full bg-white dark:bg-[#1e1f21] border border-gray-300 dark:border-gray-600 rounded-lg px-2.5 py-1.5 text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500">
                    <option value="">เลือกชั้น</option>
                    {availableLevels.map(l => <option key={l} value={l}>{l}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-[11px] font-bold mb-0.5 text-gray-500 dark:text-gray-400 uppercase tracking-tight">ห้อง *</label>
                  <select name="room" value={form.room} onChange={handleChange} required className="w-full bg-white dark:bg-[#1e1f21] border border-gray-300 dark:border-gray-600 rounded-lg px-2.5 py-1.5 text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500">
                    <option value="">เลือกห้อง</option>
                    {Array.from({ length: 20 }, (_, i) => i + 1).map(r => <option key={r} value={r}>{r}</option>)}
                  </select>
                </div>
                <div className="col-span-1">
                  <InputField label="รหัสนักเรียน" name="studentId" value={form.studentId} onChange={handleChange} required />
                  <p className="mt-0.5 text-[9px] text-amber-500 font-bold uppercase leading-none">เติม 0 ถ้ามี 4 หลัก</p>
                </div>
                <div>
                  <label className="block text-[11px] font-bold mb-0.5 text-gray-500 dark:text-gray-400 uppercase tracking-tight">ประเภทนักเรียน</label>
                  <select name="studentType" value={form.studentType} onChange={handleChange} className="w-full bg-white dark:bg-[#1e1f21] border border-gray-300 dark:border-gray-600 rounded-lg px-2.5 py-1.5 text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500">
                    <option value="ปกติ">ปกติ</option>
                    <option value="ยากจน">ยากจน</option>
                    <option value="พิการ">พิการ</option>
                    <option value="อื่นๆ">อื่นๆ</option>
                  </select>
                </div>
              </div>

	              <div className="pt-2">
	                <StatusSwitch label="สถานะนักเรียน" name="studentStatus" options={studentStatusOptions} value={form.studentStatus} onChange={handleStatusChange} />
	              </div>

	              {showExitDetails && (
	                <div className="rounded-2xl border border-amber-200 dark:border-amber-500/20 bg-amber-50 dark:bg-amber-500/10 p-4">
	                  <div className="mb-3 text-xs font-black text-amber-800 dark:text-amber-300 uppercase tracking-widest">
	                    รายละเอียดกรณี {form.studentStatus}
	                  </div>
	                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
	                    <InputField label="วันที่ออก/ย้าย" name="exitDate" type="date" value={form.exitDate} onChange={handleChange} />
		                    <InputField label={exitReasonLabel} name="exitReason" value={form.exitReason} onChange={handleChange} placeholder={`ระบุ${exitReasonLabel}`} />
	                    <InputField label="ปลายทาง/หมายเหตุ" name="exitDestinationSchool" value={form.exitDestinationSchool} onChange={handleChange} placeholder="ระบุถ้ามี" />
	                  </div>
	                </div>
	              )}

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
