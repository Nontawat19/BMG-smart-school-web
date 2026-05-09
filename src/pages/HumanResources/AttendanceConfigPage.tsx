import React, { useState, useEffect } from "react";
import { useSelector } from "react-redux";
import { firestore } from "@/firebase";
import { doc, getDoc, setDoc, collection, getDocs, writeBatch, Timestamp, increment, serverTimestamp } from "firebase/firestore";
import { updatePeriodSummaries, getStatusKey as getPeriodStatusKey } from "@/utils/periodSummaryUtils";
import Swal from "sweetalert2";
import { RootState } from "../../store";
import { Clock, Save, School, UserCheck, LogIn, LogOut, AlertCircle, Edit, UserX } from "lucide-react";
import Navbar from "../../components/Navbar/Navbar";
import LeftSidebar from "../../components/Sidebar/LeftSidebar";
import { isNonOfficialHoliday } from "../../utils/calendarUtils";
import { syncDailySummary } from "@/utils/periodSummaryUtils";
import { getTodayString } from "@/utils/dateUtils";
import MainLayout from "@/layouts/MainLayout";
import BackButton from "@/components/Shared/BackButton";

// Helper สำหรับแปลงสถานะเพื่ออัปเดตสถิติ
// Helper สำหรับอัปเดต dyasummary (นักเรียน)
// ใช้ getPeriodStatusKey จาก utils แทน getSummaryKey เดิมเพื่อลดความซ้ำซ้อน

const getStatusKey = (status: string) => {
  switch (status) {
    case 'มา': return 'present';
    case 'สาย': return 'late';
    case 'ลา': return 'leave';
    case 'ขาด': return 'absent';
    case 'กลับก่อน': return 'early';
    case 'ไม่ลงเวลาออก': return 'noCheckout';
    default: return null;
  }
};

const AttendanceConfigPage: React.FC = () => {
  const { user: currentUser } = useSelector((state: RootState) => state.auth);
  const schoolId = currentUser?.schoolId;

  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isEditing, setIsEditing] = useState(false);

  // ค่าเริ่มต้น (Default)
  const [studentLateTime, setStudentLateTime] = useState("07:50");
  const [teacherLateTime, setTeacherLateTime] = useState("08:40");
  const [studentCheckoutTime, setStudentCheckoutTime] = useState("15:30");
  const [teacherCheckoutTime, setTeacherCheckoutTime] = useState("16:30");

  // เพิ่ม State สำหรับช่วงเวลาที่อนุญาตให้ลงเวลา (Window)
  const [studentCheckinStart, setStudentCheckinStart] = useState("06:00");
  const [studentCheckinEnd, setStudentCheckinEnd] = useState("11:00");
  const [studentCheckoutStart, setStudentCheckoutStart] = useState("14:00");
  const [studentCheckoutEnd, setStudentCheckoutEnd] = useState("18:00");

  const [teacherCheckinStart, setTeacherCheckinStart] = useState("06:00");
  const [teacherCheckinEnd, setTeacherCheckinEnd] = useState("11:00");
  const [teacherCheckoutStart, setTeacherCheckoutStart] = useState("14:00");
  const [teacherCheckoutEnd, setTeacherCheckoutEnd] = useState("18:00");

  const [enableSpeech, setEnableSpeech] = useState(true);
  const [currentAcademicYear, setCurrentAcademicYear] = useState<string>("");

  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const handleResize = () => {
      setIsMobile(window.innerWidth < 768);
    };
    handleResize();
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  useEffect(() => {
    const fetchConfig = async () => {
      if (!schoolId) return;
      setIsLoading(true);
      try {
        const docRef = doc(firestore, "school-settings", schoolId);
        const docSnap = await getDoc(docRef);

        if (docSnap.exists()) {
          const data = docSnap.data();
          if (data.attendanceConfig) {
            setStudentLateTime(data.attendanceConfig.studentLateTime || "07:50");
            setTeacherLateTime(data.attendanceConfig.teacherLateTime || "08:40");
            setStudentCheckoutTime(data.attendanceConfig.studentCheckoutTime || "15:30");
            setTeacherCheckoutTime(data.attendanceConfig.teacherCheckoutTime || "16:30");

            // Load Window Config
            setStudentCheckinStart(data.attendanceConfig.studentCheckinStart || "06:00");
            setStudentCheckinEnd(data.attendanceConfig.studentCheckinEnd || "11:00");
            setStudentCheckoutStart(data.attendanceConfig.studentCheckoutStart || "14:00");
            setStudentCheckoutEnd(data.attendanceConfig.studentCheckoutEnd || "18:00");
            setTeacherCheckinStart(data.attendanceConfig.teacherCheckinStart || "06:00");
            setTeacherCheckinEnd(data.attendanceConfig.teacherCheckinEnd || "11:00");
            setTeacherCheckoutStart(data.attendanceConfig.teacherCheckoutStart || "14:00");
            setTeacherCheckoutEnd(data.attendanceConfig.teacherCheckoutEnd || "18:00");
            setEnableSpeech(data.attendanceConfig.enableSpeech !== false); // Default to true
          }
        }

        // Fetch current academic year from calendar settings
        const calendarRef = doc(firestore, "school-settings", schoolId, "main_calendar", "default");
        const calendarSnap = await getDoc(calendarRef);
        if (calendarSnap.exists()) {
          const calData = calendarSnap.data();
          if (calData.academicYear) {
            setCurrentAcademicYear(calData.academicYear);
          }
        }
      } catch (error) {
        console.error("Error fetching config:", error);
        Swal.fire("Error", "ไม่สามารถโหลดข้อมูลการตั้งค่าได้", "error");
      } finally {
        setIsLoading(false);
      }
    };

    fetchConfig();
  }, [schoolId]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!schoolId) return;

    setIsSaving(true);
    try {
      const docRef = doc(firestore, "school-settings", schoolId);

      // บันทึกแบบ merge เพื่อไม่ให้ข้อมูลอื่น (เช่น schoolName) หาย
      await setDoc(docRef, {
        attendanceConfig: {
          studentLateTime,
          teacherLateTime,
          studentCheckoutTime,
          teacherCheckoutTime,
          studentCheckinStart,
          studentCheckinEnd,
          studentCheckoutStart,
          studentCheckoutEnd,
          teacherCheckinStart,
          teacherCheckinEnd,
          teacherCheckoutStart,
          teacherCheckoutEnd,
          enableSpeech
        }
      }, { merge: true });

      Swal.fire({
        icon: 'success',
        title: 'บันทึกสำเร็จ',
        text: 'อัปเดตเวลาเข้าเรียน/เข้างานเรียบร้อยแล้ว ระบบจะเริ่มใช้ค่าใหม่ทันที',
        timer: 2000,
        showConfirmButton: false
      });
      setIsEditing(false);
    } catch (error) {
      console.error("Error saving config:", error);
      Swal.fire("Error", "เกิดข้อผิดพลาดในการบันทึก", "error");
    } finally {
      setIsSaving(false);
    }
  };

  const handleProcessAbsences = async () => {
    if (!schoolId) return;

    // 1. ตรวจสอบวันหยุดและวันสอนชดเชยก่อน
    setIsLoading(true);
    let isHoliday = false;
    let holidayMessage = "";
    const todayStr = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Bangkok" });

    try {
      const calendarDocRef = doc(firestore, "school-settings", schoolId, "main_calendar", "default");
      const calendarSnap = await getDoc(calendarDocRef);
      let events: Record<string, any> = {};
      if (calendarSnap.exists()) {
        events = calendarSnap.data().events || {};
      }

      const todayEvent = events[todayStr];
      const dayOfWeek = new Date().toLocaleString('en-US', { timeZone: 'Asia/Bangkok', weekday: 'short' });
      const isWeekend = dayOfWeek === 'Sat' || dayOfWeek === 'Sun';

      // ตรวจสอบวันหยุด (รองรับการสอนชดเชย: type = 'schoolDay')
      if (todayEvent) {
        if (todayEvent.type === 'holiday' || todayEvent.type === 'specialHoliday') {
          isHoliday = true;
          holidayMessage = `วันนี้เป็น${todayEvent.type === 'holiday' ? 'วันหยุดราชการ' : 'วันหยุดกรณีพิเศษ'} (${todayEvent.description || '-'})`;
        } else if (todayEvent.type === 'schoolDay') {
          isHoliday = false; // เป็นวันสอนชดเชย หรือกิจกรรม
        }
      } else {
        if (isWeekend) {
          isHoliday = true;
          holidayMessage = `วันนี้เป็นวันหยุดประจำสัปดาห์ (${dayOfWeek === 'Sat' ? 'วันเสาร์' : 'วันอาทิตย์'})`;
        }
      }
    } catch (error) {
      console.error("Error checking calendar:", error);
    } finally {
      setIsLoading(false);
    }

    if (isHoliday) {
      await Swal.fire({
        title: 'ไม่สามารถประมวลผลได้',
        text: `${holidayMessage}\nระบบไม่อนุญาตให้ประมวลผลการขาดในวันหยุด (ยกเว้นมีการกำหนดเป็นวันเรียนชดเชย)`,
        icon: 'error',
        confirmButtonText: 'ตกลง'
      });
      return;
    }

    const result = await Swal.fire({
      title: 'ประมวลผลการขาด?',
      text: "ระบบจะตรวจสอบผู้ที่ยังไม่ลงเวลา (ขาด) และผู้ที่ลืมลงเวลาออก (ปรับเป็นไม่ลงเวลาออก) ทันที",
      icon: 'warning',
      showCancelButton: true,
      confirmButtonColor: '#ef4444',
      cancelButtonColor: '#3085d6',
      confirmButtonText: 'ยืนยัน, ประมวลผล',
      cancelButtonText: 'ยกเลิก'
    });

    if (!result.isConfirmed) return;

    setIsLoading(true);
    try {
      const batch = writeBatch(firestore);
      let count = 0;

      // ฟังก์ชันสำหรับประมวลผลรายกลุ่ม (นักเรียน/ครู)
      const processGroup = async (collectionName: "students" | "teachers") => {
        const usersRef = collection(firestore, "school-settings", schoolId, collectionName);
        const usersSnap = await getDocs(usersRef);
        const summaryRef = doc(firestore, "school-settings", schoolId, "students", "Attendance", "dyasummary", todayStr);

        for (const docSnap of usersSnap.docs) {
          const data = docSnap.data();
          // หมายเหตุ: ลบการข้าม (continue) ออก เพื่อให้ตรวจสอบคนที่ลงเวลาเข้าแล้วแต่ยังไม่ลงเวลาออกด้วย
          // if (data.lastAttendanceDate === todayStr) continue;

          // ตรวจสอบเอกสารการลงเวลาของวันนี้ (Path: .../{collectionName}/{id}/attendance/{date})
          const attendanceRef = doc(firestore, "school-settings", schoolId, collectionName, docSnap.id, "attendance", todayStr);
          const attendanceSnap = await getDoc(attendanceRef);

          if (!attendanceSnap.exists()) {
            // ถ้าไม่มีเอกสาร ให้สร้างสถานะ "ขาด"
            batch.set(attendanceRef, {
              status: "ขาด",
              checkinTime: null,
              checkoutTime: null,
              timestamp: Timestamp.now(),
              remark: "Auto-Absent by Admin"
            });

            // อัปเดต dyasummary (เฉพาะนักเรียน)
            if (collectionName === "students") {
              const classKey = data.classLevel?.trim() || "ไม่ระบุชั้น";
              batch.set(summaryRef, {
                absent: increment(1),
                [`classes.${classKey}.absent`]: increment(1),
                updatedAt: serverTimestamp()
              }, { merge: true });
            }

            // Update Period Summaries (Week, Month, Year, Semester)
            // Previous status was likely null or undefined (since no attendance doc)
            updatePeriodSummaries(firestore, batch, schoolId, docSnap.id, collectionName, todayStr, null, "ขาด", collectionName === 'students' ? (data.classLevel?.trim() || "ไม่ระบุชั้น") : undefined, currentAcademicYear);

            count++;
          } else {
            // กรณีมีเอกสารการลงเวลาแล้ว ตรวจสอบว่าลืมลงเวลาออกหรือไม่
            const attData = attendanceSnap.data();
            // เงื่อนไข: มีเวลาเข้า + ไม่มีเวลาออก + สถานะไม่ใช่ 'ลา', 'ขาด', หรือ 'ไม่ลงเวลาออก' อยู่แล้ว
            if (attData.checkinTime && !attData.checkoutTime && attData.status !== "ลา" && attData.status !== "ขาด" && attData.status !== "ไม่ลงเวลาออก") {
              const oldStatus = attData.status;
              const newStatus = "ไม่ลงเวลาออก";

              // อัปเดตสถานะเป็น "ไม่ลงเวลาออก"
              batch.update(attendanceRef, {
                status: newStatus,
                remark: "Auto-update: ไม่ลงเวลาออก"
              });

              // อัปเดตสถิติ (ลบสถานะเดิม บวกสถานะใหม่)
              const userRef = doc(firestore, "school-settings", schoolId, collectionName, docSnap.id);
              const oldKey = getStatusKey(oldStatus);
              const newKey = getStatusKey(newStatus);

              const statsUpdate: any = {};
              if (oldKey) statsUpdate[`attendanceStats.${oldKey}`] = increment(-1);
              if (newKey) statsUpdate[`attendanceStats.${newKey}`] = increment(1);

              if (Object.keys(statsUpdate).length > 0) {
                batch.update(userRef, statsUpdate);
              }

              // อัปเดต dyasummary (เฉพาะนักเรียน)
              if (collectionName === "students") {
                const classKey = data.classLevel?.trim() || "ไม่ระบุชั้น";
                const oldSummaryKey = getPeriodStatusKey(oldStatus);
                const newSummaryKey = getPeriodStatusKey(newStatus);
                if (oldSummaryKey !== newSummaryKey) {
                  const summaryUpdates: any = { updatedAt: serverTimestamp() };
                  if (oldSummaryKey) {
                    summaryUpdates[oldSummaryKey] = increment(-1);
                    summaryUpdates[`classes.${classKey}.${oldSummaryKey}`] = increment(-1);
                  }
                  if (newSummaryKey) {
                    summaryUpdates[newSummaryKey] = increment(1);
                    summaryUpdates[`classes.${classKey}.${newSummaryKey}`] = increment(1);
                  }
                  batch.set(summaryRef, summaryUpdates, { merge: true });
                }
              }

              // Update Period Summaries (Week, Month, Year, Semester)
              updatePeriodSummaries(firestore, batch, schoolId, docSnap.id, collectionName, todayStr, oldStatus, newStatus, collectionName === 'students' ? (data.classLevel?.trim() || "ไม่ระบุชั้น") : undefined, currentAcademicYear);

              count++;
            }
          }
        }
      };

      // ประมวลผลทั้งนักเรียนและครู
      await processGroup("students");
      await processGroup("teachers");

      if (count > 0) {
        await batch.commit();
        Swal.fire("สำเร็จ", `ประมวลผลข้อมูล (ขาด/ไม่ลงเวลาออก) จำนวน ${count} รายการ`, "success");
      } else {
        Swal.fire("ข้อมูลครบถ้วน", "ไม่พบผู้ที่ยังไม่ลงเวลาในวันนี้", "info");
      }

    } catch (error) {
      console.error("Error processing absences:", error);
      Swal.fire("Error", "เกิดข้อผิดพลาดในการประมวลผล", "error");
    } finally {
      setIsLoading(false);
    }
  };

  if (isLoading) {
    return <div className="p-8 text-center text-gray-500">กำลังโหลดข้อมูล...</div>;
  }

  return (
    <MainLayout>
      <div className="min-h-screen bg-gray-50 dark:bg-[#1e1f21] transition-colors duration-300 p-4 sm:p-6 lg:p-8">
        <div className="max-w-4xl mx-auto bg-white dark:bg-[#2a2b2f] rounded-2xl shadow-sm p-8">
          <div className="flex items-center gap-4 mb-6 border-b border-gray-200 dark:border-gray-700 pb-4">
            <BackButton to="/human-resources/hub" />
            <div className="p-3 bg-blue-100 dark:bg-blue-900/30 rounded-full">
              <Clock className="w-6 h-6 text-blue-600 dark:text-blue-400" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-gray-900 dark:text-white">ตั้งค่าเวลาลงเวลา</h1>
              <p className="text-gray-500 dark:text-gray-400 text-sm">กำหนดเวลาเส้นตายสำหรับการเช็คชื่อ (หากมาหลังเวลานี้จะถือว่า "สาย")</p>
            </div>
          </div>

          <form onSubmit={handleSave} className="space-y-8">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* ส่วนของนักเรียน */}
              <div className="bg-indigo-50/50 dark:bg-indigo-900/10 p-6 rounded-2xl border border-indigo-100 dark:border-indigo-800/30 hover:shadow-md transition-shadow">
                <div className="flex items-center gap-3 mb-6">
                  <div className="p-2 bg-indigo-100 dark:bg-indigo-900/50 rounded-lg">
                    <School className="w-6 h-6 text-indigo-600 dark:text-indigo-400" />
                  </div>
                  <h2 className="text-xl font-bold text-gray-800 dark:text-gray-200">นักเรียน</h2>
                </div>

                <div className="space-y-5">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">
                        เริ่มให้ลงเวลาเข้า
                      </label>
                      <input
                        type="time"
                        value={studentCheckinStart}
                        onChange={(e) => setStudentCheckinStart(e.target.value)}
                        className={`w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-600 bg-white dark:bg-[#1e1f21] text-gray-900 dark:text-white focus:ring-2 focus:ring-indigo-500 outline-none ${!isEditing ? 'opacity-60 cursor-not-allowed' : ''}`}
                        disabled={!isEditing}
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">
                        สิ้นสุดการลงเวลาเข้า
                      </label>
                      <input
                        type="time"
                        value={studentCheckinEnd}
                        onChange={(e) => setStudentCheckinEnd(e.target.value)}
                        className={`w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-600 bg-white dark:bg-[#1e1f21] text-gray-900 dark:text-white focus:ring-2 focus:ring-indigo-500 outline-none ${!isEditing ? 'opacity-60 cursor-not-allowed' : ''}`}
                        disabled={!isEditing}
                      />
                    </div>
                  </div>
                  <div>
                    <label className="flex items-center gap-2 text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                      <LogIn className="w-4 h-4 text-green-500" /> เวลาเข้าเรียน (สายหลังเวลา)
                    </label>
                    <input
                      type="time"
                      value={studentLateTime}
                      onChange={(e) => setStudentLateTime(e.target.value)}
                      className={`w-full px-4 py-2.5 rounded-xl border border-gray-200 dark:border-gray-600 bg-white dark:bg-[#1e1f21] text-gray-900 dark:text-white focus:ring-2 focus:ring-indigo-500 outline-none transition-all ${!isEditing ? 'opacity-60 cursor-not-allowed bg-gray-50 dark:bg-gray-800' : ''}`}
                      disabled={!isEditing}
                      required
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">
                        เริ่มให้ลงเวลาออก
                      </label>
                      <input
                        type="time"
                        value={studentCheckoutStart}
                        onChange={(e) => setStudentCheckoutStart(e.target.value)}
                        className={`w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-600 bg-white dark:bg-[#1e1f21] text-gray-900 dark:text-white focus:ring-2 focus:ring-indigo-500 outline-none ${!isEditing ? 'opacity-60 cursor-not-allowed' : ''}`}
                        disabled={!isEditing}
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">
                        สิ้นสุดการลงเวลาออก
                      </label>
                      <input
                        type="time"
                        value={studentCheckoutEnd}
                        onChange={(e) => setStudentCheckoutEnd(e.target.value)}
                        className={`w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-600 bg-white dark:bg-[#1e1f21] text-gray-900 dark:text-white focus:ring-2 focus:ring-indigo-500 outline-none ${!isEditing ? 'opacity-60 cursor-not-allowed' : ''}`}
                        disabled={!isEditing}
                      />
                    </div>
                  </div>
                  <div>
                    <label className="flex items-center gap-2 text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                      <LogOut className="w-4 h-4 text-orange-500" /> เวลาเลิกเรียน (กลับก่อนเวลา)
                    </label>
                    <input
                      type="time"
                      value={studentCheckoutTime}
                      onChange={(e) => setStudentCheckoutTime(e.target.value)}
                      className={`w-full px-4 py-2.5 rounded-xl border border-gray-200 dark:border-gray-600 bg-white dark:bg-[#1e1f21] text-gray-900 dark:text-white focus:ring-2 focus:ring-indigo-500 outline-none transition-all ${!isEditing ? 'opacity-60 cursor-not-allowed bg-gray-50 dark:bg-gray-800' : ''}`}
                      disabled={!isEditing}
                      required
                    />
                  </div>
                </div>
              </div>

              {/* ส่วนของครู */}
              <div className="bg-emerald-50/50 dark:bg-emerald-900/10 p-6 rounded-2xl border border-emerald-100 dark:border-emerald-800/30 hover:shadow-md transition-shadow">
                <div className="flex items-center gap-3 mb-6">
                  <div className="p-2 bg-emerald-100 dark:bg-emerald-900/50 rounded-lg">
                    <UserCheck className="w-6 h-6 text-emerald-600 dark:text-emerald-400" />
                  </div>
                  <h2 className="text-xl font-bold text-gray-800 dark:text-gray-200">ครู/บุคลากร</h2>
                </div>

                <div className="space-y-5">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">
                        เริ่มให้ลงเวลาเข้า
                      </label>
                      <input
                        type="time"
                        value={teacherCheckinStart}
                        onChange={(e) => setTeacherCheckinStart(e.target.value)}
                        className={`w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-600 bg-white dark:bg-[#1e1f21] text-gray-900 dark:text-white focus:ring-2 focus:ring-emerald-500 outline-none ${!isEditing ? 'opacity-60 cursor-not-allowed' : ''}`}
                        disabled={!isEditing}
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">
                        สิ้นสุดการลงเวลาเข้า
                      </label>
                      <input
                        type="time"
                        value={teacherCheckinEnd}
                        onChange={(e) => setTeacherCheckinEnd(e.target.value)}
                        className={`w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-600 bg-white dark:bg-[#1e1f21] text-gray-900 dark:text-white focus:ring-2 focus:ring-emerald-500 outline-none ${!isEditing ? 'opacity-60 cursor-not-allowed' : ''}`}
                        disabled={!isEditing}
                      />
                    </div>
                  </div>
                  <div>
                    <label className="flex items-center gap-2 text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                      <LogIn className="w-4 h-4 text-green-500" /> เวลาเข้างาน (สายหลังเวลา)
                    </label>
                    <input
                      type="time"
                      value={teacherLateTime}
                      onChange={(e) => setTeacherLateTime(e.target.value)}
                      className={`w-full px-4 py-2.5 rounded-xl border border-gray-200 dark:border-gray-600 bg-white dark:bg-[#1e1f21] text-gray-900 dark:text-white focus:ring-2 focus:ring-emerald-500 outline-none transition-all ${!isEditing ? 'opacity-60 cursor-not-allowed bg-gray-50 dark:bg-gray-800' : ''}`}
                      disabled={!isEditing}
                      required
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">
                        เริ่มให้ลงเวลาออก
                      </label>
                      <input
                        type="time"
                        value={teacherCheckoutStart}
                        onChange={(e) => setTeacherCheckoutStart(e.target.value)}
                        className={`w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-600 bg-white dark:bg-[#1e1f21] text-gray-900 dark:text-white focus:ring-2 focus:ring-emerald-500 outline-none ${!isEditing ? 'opacity-60 cursor-not-allowed' : ''}`}
                        disabled={!isEditing}
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">
                        สิ้นสุดการลงเวลาออก
                      </label>
                      <input
                        type="time"
                        value={teacherCheckoutEnd}
                        onChange={(e) => setTeacherCheckoutEnd(e.target.value)}
                        className={`w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-600 bg-white dark:bg-[#1e1f21] text-gray-900 dark:text-white focus:ring-2 focus:ring-emerald-500 outline-none ${!isEditing ? 'opacity-60 cursor-not-allowed' : ''}`}
                        disabled={!isEditing}
                      />
                    </div>
                  </div>
                  <div>
                    <label className="flex items-center gap-2 text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                      <LogOut className="w-4 h-4 text-orange-500" /> เวลาเลิกงาน (กลับก่อนเวลา)
                    </label>
                    <input
                      type="time"
                      value={teacherCheckoutTime}
                      onChange={(e) => setTeacherCheckoutTime(e.target.value)}
                      className={`w-full px-4 py-2.5 rounded-xl border border-gray-200 dark:border-gray-600 bg-white dark:bg-[#1e1f21] text-gray-900 dark:text-white focus:ring-2 focus:ring-emerald-500 outline-none transition-all ${!isEditing ? 'opacity-60 cursor-not-allowed bg-gray-50 dark:bg-gray-800' : ''}`}
                      disabled={!isEditing}
                      required
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* การตั้งค่าระบบเสียง */}
            <div className="bg-blue-50/50 dark:bg-blue-900/10 p-6 rounded-2xl border border-blue-100 dark:border-blue-800/30 hover:shadow-md transition-shadow mt-6">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-blue-100 dark:bg-blue-900/50 rounded-lg">
                    <svg xmlns="http://www.w3.org/2000/svg" className="w-6 h-6 text-blue-600 dark:text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
                    </svg>
                  </div>
                  <div>
                    <h2 className="text-xl font-bold text-gray-800 dark:text-gray-200">ระบบอ่านออกเสียง (Greeting Speech)</h2>
                    <p className="text-sm text-gray-500 dark:text-gray-400">เปิด-ปิดระบบทักทายอัตโนมัติเมื่อลงเวลาสำเร็จ</p>
                  </div>
                </div>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    checked={enableSpeech}
                    onChange={async (e) => {
                      const newValue = e.target.checked;
                      setEnableSpeech(newValue);
                      if (schoolId) {
                        try {
                          const docRef = doc(firestore, "school-settings", schoolId);
                          await setDoc(docRef, {
                            attendanceConfig: { enableSpeech: newValue }
                          }, { merge: true });
                          Swal.fire({
                            icon: 'success',
                            title: newValue ? 'เปิดระบบเสียงแล้ว' : 'ปิดระบบเสียงแล้ว',
                            toast: true,
                            position: 'top-end',
                            showConfirmButton: false,
                            timer: 2000
                          });
                        } catch (err) {
                          console.error("Error toggling speech:", err);
                          setEnableSpeech(!newValue); // Rollback on error
                        }
                      }
                    }}
                    className="sr-only peer"
                  />
                  <div className={`w-14 h-7 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 dark:peer-focus:ring-blue-800 rounded-full peer dark:bg-gray-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-0.5 after:left-[4px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-6 after:w-6 after:transition-all dark:border-gray-600 peer-checked:bg-blue-600`}></div>
                </label>
              </div>
            </div>

            <div className="bg-yellow-50 dark:bg-yellow-900/10 p-4 rounded-xl flex items-start gap-3 text-sm text-yellow-800 dark:text-yellow-200">
              <AlertCircle className="w-5 h-5 flex-shrink-0 mt-0.5" />
              <div>
                <p className="font-semibold">เงื่อนไขการบันทึกสถานะ:</p>
                <ul className="list-disc list-inside mt-1 space-y-1 opacity-90">
                  <li>ระบบจะอนุญาตให้ลงเวลา <strong>ภายในช่วงเวลาที่กำหนด</strong> เท่านั้น (เริ่ม-สิ้นสุด) หากนอกเหนือเวลาจะไม่สามารถลงเวลาได้</li>
                  <li>หากสแกนเข้า <strong>หลัง</strong> เวลาที่กำหนด ระบบจะบันทึกสถานะเป็น <span className="text-red-600 dark:text-red-400 font-bold">"สาย"</span></li>
                  <li>หากสแกนออก <strong>ก่อน</strong> เวลาที่กำหนด ระบบจะบันทึกสถานะเป็น <span className="text-orange-600 dark:text-orange-400 font-bold">"กลับก่อน"</span></li>
                </ul>
              </div>
            </div>

            {/* Sync Daily Summary Button */}
            <div className="mt-6 flex justify-end">
              <button
                onClick={async () => {
                  try {
                    const result = await Swal.fire({
                      title: `ยืนยันการคำนวณสถิติใหม่?`,
                      text: "ระบบจะดึงข้อมูลการลงเวลาทั้งหมดของวันนี้ มาคำนวณยอดสรุปประจำวันใหม่ (ใช้สำหรับกรณีข้อมูลไม่ตรงกัน)",
                      icon: 'warning',
                      showCancelButton: true,
                      confirmButtonColor: '#3085d6',
                      cancelButtonColor: '#d33',
                      confirmButtonText: 'ยืนยัน, คำนวณใหม่',
                      cancelButtonText: 'ยกเลิก'
                    });

                    if (result.isConfirmed) {
                      Swal.fire({
                        title: 'กำลังคำนวณ...',
                        text: 'กรุณารอสักครู่ ห้ามปิดหน้าจอ',
                        allowOutsideClick: false,
                        didOpen: () => {
                          Swal.showLoading();
                        }
                      });


                      if (!schoolId) {
                        Swal.close();
                        return;
                      }

                      const todayStr = getTodayString();
                      await syncDailySummary(firestore, schoolId, todayStr);

                      Swal.fire({
                        icon: 'success',
                        title: 'คำนวณเสร็จสิ้น',
                        text: 'ข้อมูลสถิติประจำวันถูกอัปเดตแล้ว',
                        timer: 2000
                      });
                    }
                  } catch (err) {
                    console.error(err);
                    Swal.fire({
                      icon: 'error',
                      title: 'เกิดข้อผิดพลาด',
                      text: 'ไม่สามารถคำนวณสถิติได้ กรุณาลองใหม่อีกครั้ง'
                    });
                  }
                }}
                className="flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg transition-colors shadow-sm"
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
                ซิงค์ข้อมูลประจำวัน (Sync Today)
              </button>
            </div>

            <div className="pt-4 flex justify-end gap-4">
              {!isEditing ? (
                <button
                  type="button"
                  onClick={() => setIsEditing(true)}
                  className="flex items-center gap-2 px-6 py-3 bg-amber-500 hover:bg-amber-600 text-white font-medium rounded-xl shadow-lg shadow-amber-500/30 transition-all transform hover:scale-105"
                >
                  <Edit className="w-5 h-5" />
                  แก้ไขข้อมูล
                </button>
              ) : (
                <>
                  <button
                    type="button"
                    onClick={() => setIsEditing(false)}
                    className="px-6 py-3 bg-gray-200 hover:bg-gray-300 dark:bg-gray-700 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-200 font-medium rounded-xl transition-all"
                  >
                    ยกเลิก
                  </button>
                  <button
                    type="submit"
                    disabled={isSaving}
                    className="flex items-center gap-2 px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-xl shadow-lg shadow-blue-500/30 transition-all transform hover:scale-105 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <Save className="w-5 h-5" />
                    {isSaving ? "กำลังบันทึก..." : "บันทึกการตั้งค่า"}
                  </button>
                </>
              )}
            </div>
          </form>

          <div className="mt-8 border-t border-gray-200 dark:border-gray-700 pt-8">
            <div className="bg-red-50 dark:bg-red-900/10 p-6 rounded-2xl border border-red-100 dark:border-red-800/30">
              <div className="flex items-center gap-3 mb-4">
                <div className="p-2 bg-red-100 dark:bg-red-900/50 rounded-lg">
                  <UserX className="w-6 h-6 text-red-600 dark:text-red-400" />
                </div>
                <div>
                  <h2 className="text-xl font-bold text-gray-800 dark:text-gray-200">ประมวลผลประจำวัน (Manual)</h2>
                  <p className="text-sm text-gray-500 dark:text-gray-400">ตรวจสอบผู้ที่ "ขาด" และผู้ที่ "ไม่ลงเวลาออก" ในวันนี้ (ควรทำหลังสิ้นสุดเวลาลงเวลาออก)</p>
                </div>
              </div>
              <div className="flex flex-col items-end gap-2">
                <button
                  type="button"
                  onClick={handleProcessAbsences}
                  disabled={isLoading}
                  className="flex items-center gap-2 px-6 py-3 bg-red-600 hover:bg-red-700 text-white font-medium rounded-xl shadow-lg shadow-red-500/30 transition-all transform hover:scale-105 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <UserX className="w-5 h-5" />
                  {isLoading ? "กำลังประมวลผล..." : "ประมวลผลทันที"}
                </button>
                <p className="text-xs text-gray-500 dark:text-gray-400 text-right">
                  * ระบบมีฟังก์ชันประมวลผลอัตโนมัติเมื่อถึงเวลา {studentCheckoutEnd} (นักเรียน) และ {teacherCheckoutEnd} (ครู) <br />
                  โดยต้องเปิดหน้าจอ "ลงเวลาเข้า-ออก" (Check-in/Out) ทิ้งไว้
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </MainLayout>
  );
};

export default AttendanceConfigPage;