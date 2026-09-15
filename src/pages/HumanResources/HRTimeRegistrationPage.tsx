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
  department?: string;
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
  const [selectedTeachers, setSelectedTeachers] = useState<TeacherOption[]>([]);
  
  // Registration options
  const [status, setStatus] = useState("มา");
  const [time, setTime] = useState("");
  const [note, setNote] = useState("");
  const [loading, setLoading] = useState(false);
  const [savingProgress, setSavingProgress] = useState({ current: 0, total: 0 });
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
              department: (data.department || "").trim(),
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

  const departments = React.useMemo(() => {
    const depts = new Set<string>();
    teachers.forEach((t) => {
      if (t.department) depts.add(t.department);
    });
    return Array.from(depts).sort((a, b) => a.localeCompare(b));
  }, [teachers]);

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
    if (selectedTeachers.length === 0) {
      Swal.fire("กรุณาเลือกบุคลากร", "คุณต้องเลือกบุคลากรที่ต้องการลงเวลาอย่างน้อย 1 คน", "warning");
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
    setSavingProgress({ current: 0, total: selectedTeachers.length });
    let successCount = 0;
    let failCount = 0;

    try {
      const [hour, minute] = time ? time.split(':') : ["00", "00"];
      const dateObj = new Date(date);
      dateObj.setHours(parseInt(hour, 10));
      dateObj.setMinutes(parseInt(minute, 10));
      dateObj.setSeconds(0);

      const academicYear = String(new Date().getFullYear() + 543);

      for (let i = 0; i < selectedTeachers.length; i++) {
        const teacher = selectedTeachers[i];
        setSavingProgress({ current: i + 1, total: selectedTeachers.length });

        try {
          const attendanceRef = doc(firestore, "school-settings", schoolId, "teachers", teacher.value, "attendance", date);

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
            if (status === "กลับก่อน") {
              updateData.checkoutTime = dateObj;
              if (!isExisting) {
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
              teacher.value,
              "teachers",
              date,
              oldStatus,
              status,
              undefined,
              academicYear
            );
          });
          successCount++;
        } catch (err) {
          console.error(`Error saving attendance for ${teacher.label}:`, err);
          failCount++;
        }
      }

      if (failCount === 0) {
        Swal.fire({
          icon: "success",
          title: "บันทึกสำเร็จ",
          text: selectedTeachers.length === 1 
            ? `ลงเวลาให้ ${selectedTeachers[0].label} เรียบร้อยแล้ว`
            : `ลงเวลาให้บุคลากรสำเร็จทั้งหมด ${successCount} คนเรียบร้อยแล้ว`,
          timer: 2000,
          showConfirmButton: false,
        });
      } else {
        Swal.fire({
          icon: "warning",
          title: "บันทึกเสร็จสิ้นบางส่วน",
          text: `บันทึกสำเร็จ ${successCount} คน, ไม่สำเร็จ ${failCount} คน`,
        });
      }

      // Reset form
      setSelectedTeachers([]);
      setStatus("มา");
      setTime("");
      setNote("");
    } catch (error) {
      console.error("Error saving attendance:", error);
      Swal.fire("ข้อผิดพลาด", "ไม่สามารถบันทึกข้อมูลได้ กรุณาลองใหม่อีกครั้ง", "error");
    } finally {
      setLoading(false);
      setSavingProgress({ current: 0, total: 0 });
    }
  };

  return (
    <MainLayout>
      <div className="min-h-screen bg-gray-50 dark:bg-[#1e1f21] transition-colors duration-300 p-4 sm:p-6 lg:p-8">
        <div className="max-w-4xl mx-auto">
          <div className="mb-6 flex flex-col gap-4 rounded-2xl border border-gray-100 bg-white p-5 shadow-sm dark:border-gray-800 dark:bg-[#2a2b2f] lg:flex-row lg:items-center">
            <div className="flex min-w-0 flex-1 items-center gap-4">
              <BackButton to="/academic/hub/personnel_info" />
              <div className="min-w-0">
                <h1 className="text-2xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
                  <FaUserClock className="text-teal-600 dark:text-teal-400" />
                  บันทึกเวลาเข้า-ออก / ขออนุญาตเข้าสาย
                </h1>
                <p className="text-gray-500 dark:text-gray-400 text-sm mt-1">
                  บันทึกเวลาเข้า-ออก หรือบันทึกขออนุญาตเข้าสายสำหรับครูและบุคลากร
                </p>
              </div>
            </div>
          </div>

          <div className="bg-white dark:bg-[#2a2b2f] rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 overflow-hidden">
            <form onSubmit={handleSubmit} className="p-5">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                
                {/* Personnel Selection */}
                <div className="col-span-1 md:col-span-2">
                  <div className="flex flex-wrap items-center justify-between gap-2 mb-1.5">
                    <div className="flex items-center gap-2">
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                        บุคลากร
                      </label>
                      {selectedTeachers.length > 0 && (
                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-teal-100 text-teal-800 dark:bg-teal-900/50 dark:text-teal-300">
                          เลือกแล้ว {selectedTeachers.length} คน
                        </span>
                      )}
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                      {departments.length > 0 && (
                        <select
                          value=""
                          onChange={(e) => {
                            const dept = e.target.value;
                            if (!dept) return;
                            const inDept = teachers.filter(t => t.department === dept);
                            setSelectedTeachers(prev => {
                              const prevMap = new Map(prev.map(p => [p.value, p]));
                              inDept.forEach(t => prevMap.set(t.value, t));
                              return Array.from(prevMap.values());
                            });
                          }}
                          className="px-2.5 py-1 text-xs bg-gray-100 dark:bg-[#1e1f21] hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-md border border-gray-300 dark:border-gray-600 transition-colors outline-none cursor-pointer"
                        >
                          <option value="" disabled>+ เพิ่มตามกลุ่มสาระ/ฝ่าย</option>
                          {departments.map(d => (
                            <option key={d} value={d}>{d}</option>
                          ))}
                        </select>
                      )}

                      <button
                        type="button"
                        onClick={() => setSelectedTeachers([...teachers])}
                        disabled={fetchingTeachers || teachers.length === 0}
                        className="px-2.5 py-1 text-xs font-medium bg-indigo-50 dark:bg-indigo-950/50 text-indigo-600 dark:text-indigo-400 hover:bg-indigo-100 dark:hover:bg-indigo-900/70 rounded-md border border-indigo-200 dark:border-indigo-800 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        เลือกทั้งหมด ({teachers.length})
                      </button>

                      {selectedTeachers.length > 0 && (
                        <button
                          type="button"
                          onClick={() => setSelectedTeachers([])}
                          className="px-2.5 py-1 text-xs font-medium bg-red-50 dark:bg-red-950/50 text-red-600 dark:text-red-400 hover:bg-red-100 dark:hover:bg-red-900/70 rounded-md border border-red-200 dark:border-red-800 transition-colors"
                        >
                          ล้างที่เลือก
                        </button>
                      )}
                    </div>
                  </div>

                  <Select<TeacherOption, true>
                    isMulti
                    options={teachers}
                    value={selectedTeachers}
                    onChange={(options) => setSelectedTeachers(options ? Array.from(options) : [])}
                    placeholder={fetchingTeachers ? "กำลังโหลดรายชื่อ..." : "ใส่รหัสหรือชื่อนามสกุล (เลือกได้หลายคน)"}
                    isClearable
                    isSearchable
                    closeMenuOnSelect={false}
                    blurInputOnSelect={false}
                    isDisabled={fetchingTeachers}
                    filterOption={(option, rawInput) => {
                      const input = rawInput.toLowerCase().trim();
                      if (!input) return true;
                      const data = option.data as TeacherOption;
                      const nameMatch = (data.label || "").toLowerCase().includes(input);
                      const idMatch = (data.teacherId || "").toLowerCase().includes(input);
                      const deptMatch = (data.department || "").toLowerCase().includes(input);
                      return nameMatch || idMatch || deptMatch;
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
                        minHeight: '42px',
                        '&:hover': {
                          borderColor: isDarkMode ? "#4b5563" : "#d1d5db"
                        }
                      }),
                      valueContainer: (base) => ({
                        ...base,
                        maxHeight: '160px',
                        overflowY: 'auto',
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
                      multiValue: (base) => ({
                        ...base,
                        backgroundColor: isDarkMode ? "#374151" : "#e0e7ff",
                        borderRadius: '0.375rem',
                      }),
                      multiValueLabel: (base) => ({
                        ...base,
                        color: isDarkMode ? "#f3f4f6" : "#3730a3",
                        fontSize: '0.85rem',
                        fontWeight: 500,
                        padding: '2px 6px',
                      }),
                      multiValueRemove: (base) => ({
                        ...base,
                        color: isDarkMode ? "#9ca3af" : "#4338ca",
                        borderRadius: '0 0.375rem 0.375rem 0',
                        ':hover': {
                          backgroundColor: isDarkMode ? "#ef4444" : "#f87171",
                          color: "#ffffff",
                        },
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
                  disabled={loading || selectedTeachers.length === 0}
                  className="flex items-center gap-2 px-6 py-2.5 bg-teal-600 hover:bg-teal-700 disabled:bg-teal-400 disabled:cursor-not-allowed text-white font-medium rounded-lg shadow-sm hover:shadow-md transition-all focus:ring-2 focus:ring-teal-500 focus:ring-offset-2"
                >
                  {loading ? (
                    <span className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></span>
                  ) : (
                    <FaSave />
                  )}
                  {loading
                    ? savingProgress.total > 0
                      ? `กำลังบันทึก (${savingProgress.current}/${savingProgress.total})...`
                      : "กำลังบันทึก..."
                    : selectedTeachers.length > 1
                      ? `บันทึกข้อมูล (${selectedTeachers.length} คน)`
                      : selectedTeachers.length === 1
                        ? "บันทึกข้อมูล (1 คน)"
                        : "บันทึกข้อมูล"}
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
