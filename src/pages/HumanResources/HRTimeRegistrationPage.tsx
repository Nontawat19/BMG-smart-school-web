import React, { useState, useEffect } from "react";
import { useSelector } from "react-redux";
import { firestore } from "@/firebase";
import { collection, query, where, getDocs, doc, runTransaction, serverTimestamp, getDoc } from "firebase/firestore";
import { RootState } from "../../store";
import MainLayout from "@/layouts/MainLayout";
import BackButton from "@/components/Shared/BackButton";
import { FaUserClock, FaSave, FaCalendarAlt, FaUserTie } from "react-icons/fa";
import Swal from "sweetalert2";
import Select from "react-select";
import { isAttendanceEntryOnly } from "@/utils/attendanceRoles";
import { useTheme } from "@/ThemeContext";
import { useEffectiveSchoolId } from "@/hooks/useEffectiveSchool";
import { updatePeriodSummaries } from "@/utils/periodSummaryUtils";

interface TeacherOption {
  value: string;
  label: string;
  teacherId: string;
}

const HRTimeRegistrationPage: React.FC = () => {
  const { user: currentUser } = useSelector((state: RootState) => state.auth);
  const schoolId = useEffectiveSchoolId();
  const { isDarkMode } = useTheme();

  const [date, setDate] = useState(() => {
    const today = new Date();
    const year = today.getFullYear();
    const month = String(today.getMonth() + 1).padStart(2, '0');
    const day = String(today.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  });
  const [teachers, setTeachers] = useState<TeacherOption[]>([]);
  const [selectedTeacher, setSelectedTeacher] = useState<TeacherOption | null>(null);
  
  // Registration options
  const [status, setStatus] = useState("มา");
  const [time, setTime] = useState("");
  const [note, setNote] = useState("");
  const [loading, setLoading] = useState(false);
  const [fetchingTeachers, setFetchingTeachers] = useState(true);
  const [attendanceConfig, setAttendanceConfig] = useState<any>(null);

  const statusOptions = [
    { value: 'มา', label: 'มา (ปกติ)' },
    { value: 'สาย', label: 'สาย' },
    { value: 'ลา', label: 'ลา' },
    { value: 'ขาด', label: 'ขาด' },
    { value: 'ไปราชการ', label: 'ไปราชการ' },
    { value: 'กลับก่อน', label: 'กลับก่อนเวลา' },
  ];

  useEffect(() => {
    const fetchTeachers = async () => {
      if (!schoolId) return;
      setFetchingTeachers(true);
      try {
        const teachersQuery = query(
          collection(firestore, "school-settings", schoolId, "teachers"),
          where("status", "==", "อยู่")
        );
        const teachersSnap = await getDocs(teachersQuery);

        const configSnap = await getDoc(doc(firestore, "school-settings", schoolId));
        if (configSnap.exists()) {
          setAttendanceConfig(configSnap.data().attendanceConfig || null);
        }
        
        const teacherOptions: TeacherOption[] = [];
        teachersSnap.docs.forEach((docSnap) => {
          const data = docSnap.data();
          if (!isAttendanceEntryOnly(data.role)) {
            const fullName = `${data.title || ''}${data.firstName} ${data.lastName}`.trim();
            teacherOptions.push({
              value: docSnap.id,
              label: data.teacherId ? `${data.teacherId} - ${fullName}` : fullName,
              teacherId: data.teacherId || "",
            });
          }
        });
        
        // Sort alphabetically
        teacherOptions.sort((a, b) => a.label.localeCompare(b.label));
        setTeachers(teacherOptions);
      } catch (error) {
        console.error("Error fetching teachers:", error);
        Swal.fire("ข้อผิดพลาด", "ไม่สามารถดึงรายชื่อบุคลากรได้", "error");
      } finally {
        setFetchingTeachers(false);
      }
    };

    fetchTeachers();
  }, [schoolId]);

  // Auto-calculate status based on time and attendance config
  useEffect(() => {
    if (time && attendanceConfig && (status === "มา" || status === "สาย")) {
      const lateTime = attendanceConfig.teacherLateTime || "08:40";
      // ถ้าเวลาลงเกินหรือเท่ากับเวลาสาย (เช่น >= 07:50) จะถือว่าสาย
      if (time >= lateTime) {
        setStatus("สาย");
      } else {
        setStatus("มา");
      }
    }
  }, [time, attendanceConfig]);

  const handleStatusChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const newStatus = e.target.value;
    setStatus(newStatus);

    const addMinutes = (timeStr: string, mins: number) => {
      if (!timeStr) return "00:00";
      const [h, m] = timeStr.split(":").map(Number);
      const date = new Date();
      date.setHours(h, m + mins);
      return `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
    };

    if (attendanceConfig) {
      if (newStatus === "มา") {
        const lateTime = attendanceConfig.teacherLateTime || "08:40";
        setTime(addMinutes(lateTime, -1));
      } else if (newStatus === "สาย") {
        const lateTime = attendanceConfig.teacherLateTime || "08:40";
        setTime(addMinutes(lateTime, 1));
      } else if (newStatus === "กลับก่อน") {
        const checkoutTime = attendanceConfig.teacherCheckoutTime || "16:30";
        setTime(addMinutes(checkoutTime, -1));
      } else {
        setTime("");
      }
    } else {
      if (newStatus === "มา") setTime("08:39");
      else if (newStatus === "สาย") setTime("08:41");
      else if (newStatus === "กลับก่อน") setTime("16:29");
      else setTime("");
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!schoolId) return;
    if (!selectedTeacher) {
      Swal.fire("กรุณาเลือกบุคลากร", "คุณต้องเลือกบุคลากรที่ต้องการลงเวลา", "warning");
      return;
    }
    if (!date) {
      Swal.fire("กรุณาเลือกวันที่", "คุณต้องระบุวันที่ลงเวลา", "warning");
      return;
    }
    
    if (["มา", "สาย", "กลับก่อน"].includes(status) && !time) {
      Swal.fire("กรุณาระบุเวลา", "การลงเวลาประเภทนี้จำเป็นต้องระบุเวลา", "warning");
      return;
    }

    setLoading(true);
    try {
      const attendanceRef = doc(firestore, "school-settings", schoolId, "teachers", selectedTeacher.value, "attendance", date);

      const [hour, minute] = time ? time.split(':') : ["00", "00"];
      const dateObj = new Date(date);
      dateObj.setHours(parseInt(hour, 10));
      dateObj.setMinutes(parseInt(minute, 10));
      dateObj.setSeconds(0);

      const academicYear = String(new Date().getFullYear() + 543);

      await runTransaction(firestore, async (transaction) => {
        // อ่านสถานะสดในทรานแซกชันเดียวกับตอนเขียนเสมอ — จุดนี้เดิม getDoc() นอกทรานแซกชัน แล้วไม่เคยอ่าน
        // oldStatus ไปใช้เลยด้วยซ้ำ (ไม่เคยเรียก updatePeriodSummaries) ทำให้ทุกครั้งที่แอดมินลงเวลาให้ครู
        // ผ่านหน้านี้ ตัวนับสรุปยอด (Todaysummary/Week/Month/Year/Semester) ไม่เคยขยับตามเลย
        const freshSnap = await transaction.get(attendanceRef);
        const freshData = freshSnap.exists() ? freshSnap.data() : null;
        const isExisting = Boolean(freshData);
        const oldStatus = freshData?.status || null;

        const updateData: any = {
          updatedAt: serverTimestamp(),
          updatedBy: currentUser?.uid || "system",
        };

        if (!isExisting) {
          updateData.createdAt = serverTimestamp();
          updateData.scanType = "manual_hr";
          updateData.date = date;
          updateData.schoolId = schoolId;
          updateData.userType = "teacher";
        }

        updateData.status = status;

        // "กลับก่อน" (กลับก่อนเวลา) คือเหตุการณ์ "ออก" ไม่ใช่ "เข้า" — ต้องบันทึกลง checkoutTime
        // เดิมโค้ดเขียนลง checkinTime เหมือนสถานะอื่นทั้งหมด ทำให้ (ก) ถ้าสร้างใหม่ เวลาที่โชว์เป็น "เวลาเข้า"
        // กลายเป็นเวลาที่ควรจะเป็น "เวลาออก" และ (ข) ถ้าครูคนนั้นสแกนเข้าจริงที่ประตูมาก่อนแล้ว การลงเวลานี้
        // จะเขียนทับเวลาเข้าจริงด้วยเวลา "กลับก่อน" ที่ผิด แล้วก็ยังไม่มีเวลาออกบันทึกอยู่ดี
        if (status === "กลับก่อน") {
          updateData.checkoutTime = dateObj;
          if (!isExisting) {
            // ไม่มีบันทึกเดิมเลย (ไม่เคยสแกนเข้า) — ใส่เวลาเข้าเป็นค่าเดียวกันไว้เป็นค่าเริ่มต้นที่สมเหตุสมผล
            updateData.checkinTime = dateObj;
          }
        } else {
          updateData.checkinTime = dateObj;
          if (["ลากิจ", "ลาป่วย", "ไปราชการ"].includes(status)) {
            updateData.leaveType = status;
          } else {
            updateData.leaveType = null;
          }
        }

        if (note) {
          updateData.note = note;
        }

        transaction.set(attendanceRef, updateData, { merge: true });

        updatePeriodSummaries(
          firestore,
          transaction,
          schoolId,
          selectedTeacher.value,
          "teachers",
          date,
          oldStatus,
          status,
          undefined,
          academicYear
        );
      });

      Swal.fire({
        icon: "success",
        title: "บันทึกสำเร็จ",
        text: `ลงเวลาให้ ${selectedTeacher.label} เรียบร้อยแล้ว`,
        timer: 2000,
        showConfirmButton: false,
      });

      // Reset form
      setSelectedTeacher(null);
      setStatus("มา");
      setTime("");
      setNote("");
    } catch (error) {
      console.error("Error saving attendance:", error);
      Swal.fire("ข้อผิดพลาด", "ไม่สามารถบันทึกข้อมูลได้ กรุณาลองใหม่อีกครั้ง", "error");
    } finally {
      setLoading(false);
    }
  };

  return (
    <MainLayout>
      <div className="min-h-screen bg-gray-50 dark:bg-[#1e1f21] transition-colors duration-300 p-4 sm:p-6 lg:p-8">
        <div className="max-w-4xl mx-auto">
          <div className="flex flex-col md:flex-row md:items-center gap-4 mb-6">
            <BackButton to="/academic/hub/personnel_info" />
            <div>
              <h1 className="text-2xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
                <FaUserClock className="text-teal-600 dark:text-teal-400" />
                ลงเวลาเข้า-ออก / ขออนุญาตเข้าสาย
              </h1>
              <p className="text-gray-500 dark:text-gray-400 text-sm mt-1">
                บันทึกเวลาเข้า-ออก หรือบันทึกขออนุญาตเข้าสายสำหรับครูและบุคลากร
              </p>
            </div>
          </div>

          <div className="bg-white dark:bg-[#2a2b2f] rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 overflow-hidden">
            <form onSubmit={handleSubmit} className="p-5">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                
                {/* Personnel Selection */}
                <div className="col-span-1 md:col-span-2">
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    บุคลากร
                  </label>
                  <Select
                    options={teachers}
                    value={selectedTeacher}
                    onChange={(option) => setSelectedTeacher(option)}
                    placeholder={fetchingTeachers ? "กำลังโหลดรายชื่อ..." : "ใส่รหัสหรือชื่อนามสกุล"}
                    isClearable
                    isSearchable
                    isDisabled={fetchingTeachers}
                    // react-select ค่าเริ่มต้นจะค้นหาจาก label (ชื่อ) เท่านั้น ไม่ค้นจาก teacherId เลย
                    // ทั้งที่ placeholder บอกว่า "ใส่รหัสหรือชื่อนามสกุล" ได้ — พิมพ์รหัสแล้วไม่เจอผลลัพธ์เลย
                    // (เหมือนพิมพ์ไม่ได้) ต้องใส่ filterOption เองให้ค้นจากทั้งชื่อและรหัส เหมือนหน้าอื่นที่ทำถูกแล้ว
                    filterOption={(option, rawInput) => {
                      const input = rawInput.toLowerCase().trim();
                      if (!input) return true;
                      const data = option.data as TeacherOption;
                      const nameMatch = (data.label || "").toLowerCase().includes(input);
                      const idMatch = (data.teacherId || "").toLowerCase().includes(input);
                      return nameMatch || idMatch;
                    }}
                    noOptionsMessage={() => "ไม่พบรายชื่อ"}
                    classNamePrefix="react-select"
                    styles={{
                      control: (base, state) => ({
                        ...base,
                        backgroundColor: isDarkMode ? "#1e1f21" : "#ffffff",
                        borderColor: state.isFocused ? "#4f46e5" : isDarkMode ? "#374151" : "#e5e7eb",
                        borderRadius: '0.375rem',
                        padding: '2px',
                        boxShadow: 'none',
                        '&:hover': {
                          borderColor: isDarkMode ? "#4b5563" : "#d1d5db"
                        }
                      }),
                      menu: (base) => ({
                        ...base,
                        backgroundColor: isDarkMode ? "#2a2b2f" : "#ffffff",
                        borderColor: isDarkMode ? "#374151" : "#e5e7eb",
                        borderRadius: '0.375rem',
                        overflow: 'hidden',
                        zIndex: 50
                      }),
                      option: (base, state) => ({
                        ...base,
                        backgroundColor: state.isSelected
                          ? "#4f46e5"
                          : state.isFocused ? (isDarkMode ? "#374151" : "#f3f4f6") : "transparent",
                        color: state.isSelected ? "#ffffff" : (isDarkMode ? "#e5e7eb" : "#1f2937"),
                        '&:active': {
                          backgroundColor: "#4f46e5"
                        }
                      }),
                      singleValue: (base) => ({
                        ...base,
                        color: isDarkMode ? "#ffffff" : "#1f2937"
                      }),
                      input: (base) => ({
                        ...base,
                        color: isDarkMode ? "#ffffff" : "#1f2937"
                      }),
                      placeholder: (base) => ({
                        ...base,
                        color: isDarkMode ? "#9ca3af" : "#9ca3af"
                      })
                    }}
                  />
                </div>

                {/* Date Selection */}
                <div className="col-span-1">
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    วันที่ต้องการ
                  </label>
                  <input
                    type="date"
                    required
                    value={date}
                    onChange={(e) => setDate(e.target.value)}
                    className="w-full px-4 py-2 rounded-md border border-gray-200 dark:border-gray-700 bg-white dark:bg-[#1e1f21] text-gray-900 dark:text-white focus:ring-2 focus:ring-indigo-500 outline-none transition-all"
                  />
                </div>

                {/* Status Selection */}
                <div className="col-span-1">
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    ประเภทการลงเวลา
                  </label>
                  <select
                    value={status}
                    onChange={handleStatusChange}
                    className="w-full px-4 py-2 rounded-md border border-gray-200 dark:border-gray-700 bg-white dark:bg-[#1e1f21] text-gray-900 dark:text-white focus:ring-2 focus:ring-indigo-500 outline-none transition-all"
                  >
                    {statusOptions.map(opt => (
                      <option key={opt.value} value={opt.value}>{opt.label}</option>
                    ))}
                  </select>
                </div>

                {/* Time Input */}
                <div className="col-span-1">
                  <div className="flex justify-between items-center mb-1">
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                      เวลาที่ต้องการบันทึก
                    </label>
                  </div>
                  <input
                    type="time"
                    value={time}
                    onChange={(e) => setTime(e.target.value)}
                    required={["มา", "สาย", "กลับก่อน"].includes(status)}
                    className="w-full px-4 py-2 rounded-md border border-gray-200 dark:border-gray-700 bg-white dark:bg-[#1e1f21] text-gray-900 dark:text-white focus:ring-2 focus:ring-indigo-500 outline-none transition-all"
                  />
                  <p className="text-[11px] text-gray-500 mt-1">
                    {status === "กลับก่อน" ? "จะบันทึกเป็นเวลาออก (checkout)" : "จะบันทึกเป็นเวลาเข้า (checkin)"}
                  </p>
                </div>

                {/* Recorder (ผู้บันทึก) */}
                <div className="col-span-1">
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    ผู้บันทึก
                  </label>
                  <input
                    type="text"
                    readOnly
                    value={currentUser?.fullName || currentUser?.email || "System User"}
                    className="w-full px-4 py-2 rounded-md border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-[#2a2b2f] text-gray-500 dark:text-gray-400 outline-none cursor-not-allowed"
                  />
                </div>

                {/* Note */}
                <div className="col-span-1 md:col-span-2">
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    หมายเหตุ
                  </label>
                  <textarea
                    rows={1}
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                    placeholder="Enter ..."
                    className="w-full px-4 py-2 rounded-md border border-gray-200 dark:border-gray-700 bg-white dark:bg-[#1e1f21] text-gray-900 dark:text-white focus:ring-2 focus:ring-indigo-500 outline-none transition-all resize-none"
                  />
                </div>
              </div>

              <div className="mt-6 flex justify-end">
                <button
                  type="submit"
                  disabled={loading}
                  className="flex items-center gap-2 px-6 py-2.5 bg-teal-600 hover:bg-teal-700 disabled:bg-teal-400 text-white font-medium rounded-lg shadow-sm hover:shadow-md transition-all focus:ring-2 focus:ring-teal-500 focus:ring-offset-2"
                >
                  {loading ? (
                    <span className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></span>
                  ) : (
                    <FaSave />
                  )}
                  {loading ? "กำลังบันทึก..." : "บันทึกข้อมูล"}
                </button>
              </div>
            </form>
          </div>
        </div>
      </div>
    </MainLayout>
  );
};

export default HRTimeRegistrationPage;
