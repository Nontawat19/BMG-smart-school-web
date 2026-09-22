import React, { useState, useEffect } from "react";
import { useSelector } from "react-redux";
import { firestore } from "@/firebase";
import { doc, getDoc, setDoc, collection, getDocs } from "firebase/firestore";
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
import { useEffectiveSchoolId } from "@/hooks/useEffectiveSchool";
import SkeletonLoader from "@/components/SkeletonLoader";
import { processDailyAttendanceGroup, getDailySummaryTotal } from "@/utils/attendanceDayProcessing";

// ประมวลผลย้อนหลังได้ครั้งละไม่เกินกี่วัน (แต่ละวันอ่านเอกสารลงเวลาของทุกคน — จำกัดไว้กันใช้เวลา/ค่าอ่านมากเกินไป)
const MAX_BACKFILL_DAYS = 31;

const TimeFieldSkeleton: React.FC = () => (
  <div className="space-y-1.5">
    <SkeletonLoader className="h-3.5 w-24 rounded" />
    <SkeletonLoader className="h-12 w-full rounded-xl" />
  </div>
);

const AttendanceConfigPageSkeleton: React.FC = () => (
  <MainLayout>
    <div className="min-h-screen bg-gray-50 dark:bg-[#1e1f21] transition-colors duration-300 p-4 sm:p-6 lg:p-8">
      <div className="max-w-4xl mx-auto bg-white dark:bg-[#2a2b2f] rounded-2xl shadow-sm p-8 animate-pulse">
        {/* Header */}
        <div className="flex items-center gap-4 mb-6 border-b border-gray-200 dark:border-gray-700 pb-4">
          <SkeletonLoader className="w-10 h-10 rounded-full shrink-0" />
          <SkeletonLoader className="w-12 h-12 rounded-full shrink-0" />
          <div className="flex-1 space-y-2">
            <SkeletonLoader className="h-6 w-48 rounded" />
            <SkeletonLoader className="h-4 w-72 rounded" />
          </div>
        </div>

        <div className="space-y-8">
          {/* Student / Teacher time cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {[...Array(2)].map((_, cardIdx) => (
              <div key={cardIdx} className="bg-indigo-50/50 dark:bg-indigo-900/10 p-6 rounded-2xl border border-indigo-100 dark:border-indigo-800/30 space-y-6">
                <div className="flex items-center gap-3">
                  <SkeletonLoader className="w-10 h-10 rounded-lg" />
                  <SkeletonLoader className="h-5 w-28 rounded" />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  {[...Array(4)].map((_, fieldIdx) => (
                    <TimeFieldSkeleton key={fieldIdx} />
                  ))}
                </div>
              </div>
            ))}
          </div>

          {/* Toggle row (e.g. ระบบอ่านออกเสียง) */}
          <div className="flex items-center justify-between bg-gray-50 dark:bg-[#2a2b2f]/40 p-4 rounded-2xl border border-gray-100 dark:border-gray-700">
            <div className="flex items-center gap-3">
              <SkeletonLoader className="w-10 h-10 rounded-lg" />
              <div className="space-y-2">
                <SkeletonLoader className="h-4 w-40 rounded" />
                <SkeletonLoader className="h-3 w-56 rounded" />
              </div>
            </div>
            <SkeletonLoader className="w-11 h-6 rounded-full" />
          </div>

          {/* Sync button */}
          <div className="flex justify-end">
            <SkeletonLoader className="h-10 w-48 rounded-lg" />
          </div>

          {/* Action buttons */}
          <div className="pt-4 flex justify-end gap-4">
            <SkeletonLoader className="h-12 w-36 rounded-xl" />
          </div>
        </div>
      </div>
    </div>
  </MainLayout>
);

const AttendanceConfigPage: React.FC = () => {
  const { user: currentUser } = useSelector((state: RootState) => state.auth);
  const schoolId = useEffectiveSchoolId();

  const [isLoading, setIsLoading] = useState(false);
  // ช่วงวันที่ที่จะให้ "ประมวลผลประจำวัน" — ค่าเริ่มต้นคือวันนี้วันเดียว เลือกย้อนหลังเป็นช่วงได้
  // (เช่น วันที่ไม่มีใครเปิดหน้าลงเวลาค้างไว้ตอนตัดรอบ หรือก่อนที่ระบบตัดขาดอัตโนมัติของครูจะเริ่มทำงาน)
  const [processFrom, setProcessFrom] = useState<string>(() => new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Bangkok" }));
  const [processTo, setProcessTo] = useState<string>(() => new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Bangkok" }));
  // ปรับคนที่สแกนเข้าแต่ไม่สแกนออกเป็น "ไม่ลงเวลาออก" ด้วยหรือไม่ — ปิดไว้เป็นค่าเริ่มต้น (ตัดเฉพาะ "ขาด")
  const [includeNoCheckout, setIncludeNoCheckout] = useState(false);
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
  // ตัดขาดอัตโนมัติฝั่งเซิร์ฟเวอร์ (Cloud Function autoMarkAbsences) — ปิดไว้เป็นค่าเริ่มต้น ต้องเปิดเองที่หน้านี้
  const [autoMarkAbsent, setAutoMarkAbsent] = useState(false);
  // ผลการตัดขาดอัตโนมัติของวันนี้ (school-settings/{id}/attendance_auto_runs/{date})
  const [autoRunToday, setAutoRunToday] = useState<any>(null);
  const [currentAcademicYear, setCurrentAcademicYear] = useState<string>("");
  const [behaviorScoreConfig, setBehaviorScoreConfig] = useState<any>(null);

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
            setAutoMarkAbsent(data.attendanceConfig.autoMarkAbsent === true);
          }
          setBehaviorScoreConfig(data.behaviorScoreConfig || null);
        }

        try {
          const todayKey = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Bangkok" });
          const runSnap = await getDoc(doc(firestore, "school-settings", schoolId, "attendance_auto_runs", todayKey));
          setAutoRunToday(runSnap.exists() ? runSnap.data() : null);
        } catch (error) {
          console.error("Error loading auto absence run:", error); // ไม่บล็อกหน้าตั้งค่า
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

    const realTodayStr = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Bangkok" });
    // ช่วงวันที่ที่เลือก (ห้ามเป็นอนาคต; ถ้าเลือกวันเดียวคือ "ประมวลผลของวันนั้น" เหมือนเดิม)
    let rangeEnd = processTo && processTo <= realTodayStr ? processTo : realTodayStr;
    let rangeStart = processFrom && processFrom <= rangeEnd ? processFrom : rangeEnd;
    if (rangeStart > rangeEnd) rangeStart = rangeEnd;
    const isRange = rangeStart !== rangeEnd;

    // รายการวันที่ในช่วง (เป็นสตริงล้วน ไม่ผูกกับ timezone เครื่อง)
    const allDates: string[] = [];
    for (let cur = new Date(`${rangeStart}T00:00:00Z`), last = new Date(`${rangeEnd}T00:00:00Z`); cur <= last; cur.setUTCDate(cur.getUTCDate() + 1)) {
      allDates.push(cur.toISOString().slice(0, 10));
    }
    if (allDates.length > MAX_BACKFILL_DAYS) {
      await Swal.fire({
        title: 'ช่วงวันที่ยาวเกินไป',
        text: `ประมวลผลย้อนหลังได้ครั้งละไม่เกิน ${MAX_BACKFILL_DAYS} วัน (เลือกมา ${allDates.length} วัน) กรุณาแบ่งเป็นหลายรอบ`,
        icon: 'warning',
        confirmButtonText: 'ตกลง'
      });
      return;
    }

    // 1. ตรวจสอบวันหยุด/วันสอนชดเชย/ช่วงภาคเรียนจากปฏิทินโรงเรียน
    setIsLoading(true);
    let events: Record<string, any> = {};
    let terms: any = null;
    try {
      const calendarSnap = await getDoc(doc(firestore, "school-settings", schoolId, "main_calendar", "default"));
      if (calendarSnap.exists()) {
        events = calendarSnap.data().events || {};
        terms = calendarSnap.data().terms || null;
      }
    } catch (error) {
      console.error("Error checking calendar:", error);
    } finally {
      setIsLoading(false);
    }

    const termRanges = [terms?.term1, terms?.term2].filter((t) => t?.startDate && t?.endDate);
    const isInTerm = (dateStr: string) =>
      termRanges.length === 0 || termRanges.some((t: any) => dateStr >= t.startDate && dateStr <= t.endDate);

    const eligibleDates: string[] = [];
    const skippedDates: { date: string; reason: string }[] = [];
    for (const dateStr of allDates) {
      const event = events[dateStr];
      const weekday = new Date(`${dateStr}T12:00:00+07:00`).toLocaleString('en-US', { timeZone: 'Asia/Bangkok', weekday: 'short' });
      const isWeekend = weekday === 'Sat' || weekday === 'Sun';
      let reason = '';
      if (event?.type === 'holiday' || event?.type === 'specialHoliday') {
        reason = `${event.type === 'holiday' ? 'วันหยุดราชการ' : 'วันหยุดกรณีพิเศษ'} (${event.description || '-'})`;
      } else if (!event && isWeekend) {
        reason = `วันหยุดประจำสัปดาห์ (${weekday === 'Sat' ? 'วันเสาร์' : 'วันอาทิตย์'})`;
      } else if (isRange && event?.type !== 'schoolDay' && !isInTerm(dateStr)) {
        // เฉพาะตอนประมวลผลหลายวัน: ข้ามช่วงปิดภาคเรียน ไม่ให้ตัดขาดทั้งโรงเรียนในวันที่ไม่มีการเรียนการสอน
        reason = 'อยู่นอกช่วงภาคเรียน';
      }
      if (reason) skippedDates.push({ date: dateStr, reason });
      else eligibleDates.push(dateStr);
    }

    if (eligibleDates.length === 0) {
      await Swal.fire({
        title: 'ไม่สามารถประมวลผลได้',
        html: `ไม่มีวันที่ประมวลผลได้ในช่วงที่เลือก<br/><small>${skippedDates.map((d) => `${d.date}: ${d.reason}`).join('<br/>')}</small><br/>ระบบไม่อนุญาตให้ประมวลผลการขาดในวันหยุด (ยกเว้นมีการกำหนดเป็นวันเรียนชดเชย)`,
        icon: 'error',
        confirmButtonText: 'ตกลง'
      });
      return;
    }

    const rangeLabel = isRange ? `${rangeStart} ถึง ${rangeEnd} (${eligibleDates.length} วันเรียน)` : rangeEnd;

    // วันเดียว: ถ้ากลุ่มไหนไม่มีการลงเวลาเลยทั้งวัน (เช่น ไฟดับ/ระบบใช้ไม่ได้) การตัดขาดจะโดนทุกคนในกลุ่ม (และนักเรียนถูกหักคะแนน
    // พฤติกรรมตามที่ตั้งไว้) จึงเตือนและให้เลือกว่าจะตัดต่อหรือข้ามกลุ่มนั้น — หลายวันจะข้ามกลุ่มแบบนี้ให้อัตโนมัติอยู่แล้ว
    const emptyGroupNames = new Set<string>();
    if (!isRange && eligibleDates.length === 1) {
      try {
        const [studentActivity, teacherActivity] = await Promise.all([
          getDailySummaryTotal(schoolId, 'students', eligibleDates[0]),
          getDailySummaryTotal(schoolId, 'teachers', eligibleDates[0]),
        ]);
        if (studentActivity <= 0) emptyGroupNames.add('students');
        if (teacherActivity <= 0) emptyGroupNames.add('teachers');
      } catch (error) {
        console.error("Error checking daily activity:", error);
      }
    }
    const emptyGroupLabels = [emptyGroupNames.has('students') ? 'นักเรียน' : '', emptyGroupNames.has('teachers') ? 'ครู' : ''].filter(Boolean).join(' และ ');

    const result = await Swal.fire({
      title: 'ประมวลผลการขาด?',
      html: `ระบบจะตรวจสอบของวันที่ <b>${rangeLabel}</b><br/>ผู้ที่ยังไม่ลงเวลาเลย (ตัดเป็น <b>ขาด</b>)${includeNoCheckout ? ' และผู้ที่สแกนเข้าแต่ไม่สแกนออก (ปรับเป็น <b>ไม่ลงเวลาออก</b>)' : ''} ทั้งนักเรียนและครู` +
        (isRange
          ? `<br/><small>* ข้ามวันหยุด/นอกภาคเรียน และวันที่ไม่มีการลงเวลาของกลุ่มนั้นเลย, ไม่นับวันก่อนที่บุคคลนั้นเริ่มอยู่ในระบบ (วันที่เริ่มงาน/สร้างบัญชี)</small>`
          : '') +
        (emptyGroupLabels
          ? `<br/><br/><b style="color:#ef4444">⚠️ วันที่ ${eligibleDates[0]} ไม่มีการลงเวลาของ${emptyGroupLabels}เลย</b><br/><small>(เช่น ไฟดับ/ระบบใช้ไม่ได้) ถ้าตัดต่อ จะตัดขาด<b>ทุกคน</b>ในกลุ่มนั้น (นักเรียนถูกหักคะแนนพฤติกรรมตามที่ตั้งไว้)</small>`
          : ''),
      icon: 'warning',
      showCancelButton: true,
      showDenyButton: emptyGroupNames.size > 0,
      confirmButtonColor: '#ef4444',
      denyButtonColor: '#6b7280',
      cancelButtonColor: '#3085d6',
      confirmButtonText: emptyGroupNames.size > 0 ? 'ตัดขาดทุกคน' : 'ยืนยัน, ประมวลผล',
      denyButtonText: 'ข้ามกลุ่มที่ไม่มีการลงเวลา',
      cancelButtonText: 'ยกเลิก'
    });

    if (!result.isConfirmed && !result.isDenied) return;
    const skipEmptyGroups = result.isDenied;

    setIsLoading(true);
    Swal.fire({
      title: 'กำลังประมวลผล...',
      html: '<div id="attendance-process-progress"></div>',
      allowOutsideClick: false,
      showConfirmButton: false,
      didOpen: () => Swal.showLoading(),
    });
    const setProgress = (text: string) => {
      const el = document.getElementById('attendance-process-progress');
      if (el) el.textContent = text;
    };

    try {
      // เดิมฟังก์ชันนี้อ่านสถานะทุกคนก่อน แล้วค่อย commit batch เดียวรวมท้ายสุด — ถ้ามีนักเรียน/ครูสแกน
      // เข้า-ออกจริงระหว่างที่ปุ่มนี้กำลังประมวลผลอยู่ ตอน commit ท้ายสุดจะเขียนทับข้อมูลที่เพิ่งสแกนจริงกลับเป็น
      // "ขาด"/"ไม่ลงเวลาออก" ได้ (TOCTOU) และถ้ากดซ้ำหรือกดพร้อมระบบสแกนหน้าประตู ก็จะบวกตัวนับซ้ำ
      // จึงประมวลผลเป็นทรานแซกชันต่อคน (ดู processDailyAttendanceGroup) ไม่ว่าจะกดกี่ครั้งผลก็เหมือนกัน (idempotent)
      const groups: { name: 'students' | 'teachers'; label: string; users: any[] }[] = [
        { name: 'students', label: 'นักเรียน', users: (await getDocs(collection(firestore, "school-settings", schoolId, "students"))).docs },
        { name: 'teachers', label: 'ครู', users: (await getDocs(collection(firestore, "school-settings", schoolId, "teachers"))).docs },
      ];

      const perDay: { date: string; parts: string[] }[] = [];
      let totalCount = 0;

      for (let i = 0; i < eligibleDates.length; i++) {
        const dateStr = eligibleDates[i];
        const parts: string[] = [];
        // ปีการศึกษา: ใช้ปีปัจจุบันเมื่อวันนั้นอยู่ในช่วงภาคเรียนของปฏิทินปัจจุบัน ไม่งั้นให้ระบบคำนวณจากวันที่เอง
        const academicYearForDay = isInTerm(dateStr) ? currentAcademicYear : undefined;

        for (const group of groups) {
          setProgress(`${dateStr} (${i + 1}/${eligibleDates.length}) — ${group.label}`);
          if (skipEmptyGroups && emptyGroupNames.has(group.name)) {
            parts.push(`${group.label}: ข้าม (วันนั้นไม่มีการลงเวลาเลย — ตามที่เลือกให้ข้าม)`);
            continue;
          }
          // วันนี้: ต้องรอให้สิ้นสุดเวลาลงเวลาออกของกลุ่มนั้นก่อน ไม่งั้นคนที่ยังอยู่ระหว่างวันจะถูกตัดขาด/ไม่ลงเวลาออกก่อนเวลา
          if (dateStr === realTodayStr) {
            const cutoff = group.name === 'students' ? studentCheckoutEnd : teacherCheckoutEnd;
            const nowHm = new Date().toLocaleTimeString('en-GB', { timeZone: 'Asia/Bangkok', hour: '2-digit', minute: '2-digit' });
            if (cutoff && nowHm < cutoff) {
              parts.push(`${group.label}: ข้าม (วันนี้ยังไม่สิ้นสุดเวลาลงเวลาออก ${cutoff})`);
              continue;
            }
          }
          if (isRange) {
            // ย้อนหลังหลายวัน: ถ้าวันนั้นไม่มีการลงเวลาของกลุ่มนี้เลย (เช่น ยังไม่ได้ใช้ระบบ/ไม่มีใครสแกน) จะไม่ตัดขาดทั้งกลุ่ม
            const total = await getDailySummaryTotal(schoolId, group.name, dateStr);
            if (total <= 0) {
              parts.push(`${group.label}: ข้าม (ไม่มีข้อมูลลงเวลาของวันนั้น)`);
              continue;
            }
          }
          const res = await processDailyAttendanceGroup({
            schoolId,
            dateStr,
            collectionName: group.name,
            users: group.users,
            behaviorScoreConfig,
            academicYear: academicYearForDay,
            skipBeforeJoinDate: isRange,
            includeNoCheckout,
          });
          const changed = res.absent + res.noCheckout;
          totalCount += changed;
          // วันเดียว: แสดงรายละเอียดเสมอ (ตรวจกี่คน มีบันทึกแล้วกี่คน ใครถูกข้ามเพราะอะไร) จะได้ไล่สาเหตุได้ว่าทำไมบางคนไม่ถูกตัดขาด
          // หลายวัน: แสดงเฉพาะวันที่มีการเปลี่ยนแปลง เพื่อไม่ให้ยาวเกินไป
          if (changed > 0 || !isRange) {
            const existingTotal = Object.values(res.existingByStatus).reduce((a, b) => a + b, 0);
            const existingText = Object.entries(res.existingByStatus).map(([k, v]) => `${k} ${v}`).join(', ');
            const namesText = res.absentNames.length > 0
              ? ` [${res.absentNames.slice(0, 8).join(', ')}${res.absentNames.length > 8 ? ` และอีก ${res.absentNames.length - 8} คน` : ''}]`
              : '';
            const filteredText = res.filteredOut.length > 0
              ? ` · ข้าม ${res.filteredOut.length} คน (${res.filteredOut.slice(0, 5).map((f) => `${f.name}: ${f.reason}`).join('; ')}${res.filteredOut.length > 5 ? ' …' : ''})`
              : '';
            parts.push(
              `${group.label}: ตรวจ ${res.checked} คน · มีบันทึกแล้ว ${existingTotal}${existingText ? ` (${existingText})` : ''} · ตัดขาดใหม่ ${res.absent}${namesText}` +
              `${res.noCheckout ? ` · ไม่ลงเวลาออก ${res.noCheckout}` : ''}${filteredText}`
            );
          }
        }
        if (parts.length > 0) perDay.push({ date: dateStr, parts });
      }

      const skippedHtml = skippedDates.length > 0
        ? `<div style="margin-top:8px;font-size:12px;color:#888">ข้าม: ${skippedDates.map((d) => `${d.date} (${d.reason})`).join(', ')}</div>`
        : '';
      const detailHtml = perDay.length > 0
        ? `<div style="text-align:left;font-size:13px;max-height:240px;overflow:auto">${perDay.map((d) => `<div><b>${d.date}</b> — ${d.parts.join(' | ')}</div>`).join('')}</div>`
        : '';

      if (totalCount > 0) {
        Swal.fire({ title: 'สำเร็จ', html: `ประมวลผลข้อมูล (ขาด/ไม่ลงเวลาออก) จำนวน <b>${totalCount}</b> รายการ${detailHtml}${skippedHtml}`, icon: 'success' });
      } else {
        Swal.fire({ title: 'ไม่พบผู้ที่ต้องตัดขาด', html: `ไม่พบผู้ที่ยังไม่ลงเวลาในช่วงที่เลือก${detailHtml}${skippedHtml}`, icon: 'info' });
      }
    } catch (error) {
      console.error("Error processing absences:", error);
      Swal.fire("Error", "เกิดข้อผิดพลาดในการประมวลผล", "error");
    } finally {
      setIsLoading(false);
    }
  };

  if (isLoading) {
    return <AttendanceConfigPageSkeleton />;
  }

  return (
    <MainLayout>
      <div className="min-h-screen bg-gray-50 dark:bg-[#1e1f21] transition-colors duration-300 p-4 sm:p-6 lg:p-8">
        <div className="max-w-4xl mx-auto space-y-6">
          <header>
            <div className="flex flex-col gap-4 rounded-2xl border border-gray-100 bg-white p-5 shadow-sm dark:border-gray-800 dark:bg-[#2a2b2f] lg:flex-row lg:items-center">
              <BackButton to="/academic/hub/settings" />
              <div className="flex items-center gap-4 min-w-0">
                <div className="p-3 bg-blue-100 dark:bg-blue-900/30 rounded-full shrink-0">
                  <Clock className="w-6 h-6 text-blue-600 dark:text-blue-400" />
                </div>
                <div className="min-w-0">
                  <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-gray-900 dark:text-white">ตั้งค่าเวลาลงเวลา</h1>
                  <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">กำหนดเวลาเส้นตายสำหรับการเช็คชื่อ (หากมาหลังเวลานี้จะถือว่า "สาย")</p>
                </div>
              </div>
            </div>
          </header>

          <div className="bg-white dark:bg-[#2a2b2f] rounded-2xl shadow-sm p-8">
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
                      className={`w-full px-4 py-2.5 rounded-xl border border-gray-200 dark:border-gray-600 bg-white dark:bg-[#1e1f21] text-gray-900 dark:text-white focus:ring-2 focus:ring-indigo-500 outline-none transition-all ${!isEditing ? 'opacity-60 cursor-not-allowed bg-gray-50 dark:bg-[#2a2b2f]' : ''}`}
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
                      className={`w-full px-4 py-2.5 rounded-xl border border-gray-200 dark:border-gray-600 bg-white dark:bg-[#1e1f21] text-gray-900 dark:text-white focus:ring-2 focus:ring-indigo-500 outline-none transition-all ${!isEditing ? 'opacity-60 cursor-not-allowed bg-gray-50 dark:bg-[#2a2b2f]' : ''}`}
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
                      className={`w-full px-4 py-2.5 rounded-xl border border-gray-200 dark:border-gray-600 bg-white dark:bg-[#1e1f21] text-gray-900 dark:text-white focus:ring-2 focus:ring-emerald-500 outline-none transition-all ${!isEditing ? 'opacity-60 cursor-not-allowed bg-gray-50 dark:bg-[#2a2b2f]' : ''}`}
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
                      className={`w-full px-4 py-2.5 rounded-xl border border-gray-200 dark:border-gray-600 bg-white dark:bg-[#1e1f21] text-gray-900 dark:text-white focus:ring-2 focus:ring-emerald-500 outline-none transition-all ${!isEditing ? 'opacity-60 cursor-not-allowed bg-gray-50 dark:bg-[#2a2b2f]' : ''}`}
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

          <div className="mt-8 border-t border-gray-200 dark:border-gray-700 pt-8 space-y-6">
            {/* ตัดขาดอัตโนมัติ (ฝั่งเซิร์ฟเวอร์) */}
            <div className="bg-emerald-50 dark:bg-emerald-900/10 p-6 rounded-2xl border border-emerald-100 dark:border-emerald-800/30">
              <div className="flex items-start justify-between gap-4">
                <div className="flex items-start gap-3">
                  <div className="p-2 bg-emerald-100 dark:bg-emerald-900/50 rounded-lg">
                    <UserX className="w-6 h-6 text-emerald-600 dark:text-emerald-400" />
                  </div>
                  <div>
                    <h2 className="text-xl font-bold text-gray-800 dark:text-gray-200">ตัดขาดอัตโนมัติ</h2>
                    <p className="text-sm text-gray-500 dark:text-gray-400">
                      ระบบตรวจและตัดสถานะ "ขาด" ให้เองทุกวัน ไม่ต้องกดปุ่มหรือเปิดหน้าลงเวลาค้างไว้
                    </p>
                  </div>
                </div>
                <label className="relative inline-flex items-center cursor-pointer shrink-0">
                  <input
                    type="checkbox"
                    checked={autoMarkAbsent}
                    onChange={async (e) => {
                      const newValue = e.target.checked;
                      setAutoMarkAbsent(newValue);
                      if (!schoolId) return;
                      try {
                        await setDoc(doc(firestore, "school-settings", schoolId), {
                          attendanceConfig: { autoMarkAbsent: newValue }
                        }, { merge: true });
                        Swal.fire({
                          icon: 'success',
                          title: newValue ? 'เปิดตัดขาดอัตโนมัติแล้ว' : 'ปิดตัดขาดอัตโนมัติแล้ว',
                          toast: true,
                          position: 'top-end',
                          showConfirmButton: false,
                          timer: 2000
                        });
                      } catch (err) {
                        console.error("Error toggling auto absence:", err);
                        setAutoMarkAbsent(!newValue); // Rollback on error
                      }
                    }}
                    className="sr-only peer"
                  />
                  <div className="w-14 h-7 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-emerald-300 dark:peer-focus:ring-emerald-800 rounded-full peer dark:bg-gray-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-0.5 after:left-[4px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-6 after:w-6 after:transition-all dark:border-gray-600 peer-checked:bg-emerald-600"></div>
                </label>
              </div>
              <ul className="mt-4 list-disc list-inside space-y-1 text-sm text-gray-600 dark:text-gray-300">
                <li>คำนวณ<strong>ครั้งเดียวต่อวัน</strong> หลังสิ้นสุดการลงเวลาออกของทั้งนักเรียน ({studentCheckoutEnd}) และครู ({teacherCheckoutEnd}) — คือหลังเวลา <strong>{studentCheckoutEnd > teacherCheckoutEnd ? studentCheckoutEnd : teacherCheckoutEnd}</strong></li>
                <li><strong>นักเรียนและครู</strong> ที่ไม่ลงเวลาทั้งเข้าและออกเลย → ตัดเป็น "ขาด"</li>
                <li>ข้ามวันหยุด เสาร์-อาทิตย์ (ยกเว้นวันสอนชดเชย) และช่วงปิดภาคเรียนตามปฏิทินโรงเรียน</li>
                <li>ข้ามกลุ่มที่ <strong>ทั้งวันไม่มีใครสแกนเลย</strong> (เช่น ไฟดับ/ระบบใช้ไม่ได้) เพื่อไม่ให้ตัดขาดทั้งโรงเรียนโดยไม่ตั้งใจ</li>
                <li>คนที่ลา/ไปราชการที่อนุมัติแล้วจะไม่ถูกตัดขาดซ้ำ · ระบบเช็คทุก 15 นาทีหลัง 12:00 แต่ตัดรอบจริงวันละครั้ง</li>
              </ul>
              {autoMarkAbsent && (
                <div className="mt-4 rounded-xl bg-white/70 dark:bg-black/20 px-4 py-3 text-sm text-gray-700 dark:text-gray-200">
                  <p className="font-semibold mb-1">ผลของวันนี้</p>
                  {autoRunToday ? (
                    <ul className="space-y-0.5">
                      {([['students', 'นักเรียน'], ['teachers', 'ครู']] as const).map(([key, label]) => {
                        const g = autoRunToday[key];
                        return (
                          <li key={key}>
                            {label}: {!g ? 'ยังไม่ถึงเวลา' : g.skipped ? `ข้าม — ${g.skipped}` : `ตรวจ ${g.checked ?? 0} คน · ตัดขาด ${g.marked ?? 0} คน`}
                          </li>
                        );
                      })}
                    </ul>
                  ) : (
                    <p className="text-gray-500 dark:text-gray-400">ยังไม่มีการประมวลผลของวันนี้ (ระบบจะทำงานเมื่อถึงเวลาตัดรอบ)</p>
                  )}
                </div>
              )}
            </div>

            {/* เครื่องมือผู้ดูแล: ประมวลผลย้อนหลังด้วยมือ (ปกติไม่ต้องใช้) */}
            <details className="group">
              <summary className="cursor-pointer text-sm font-semibold text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200">
                เครื่องมือผู้ดูแล: ประมวลผลย้อนหลังด้วยมือ (ปกติไม่ต้องใช้)
              </summary>
            <div className="mt-4 bg-red-50 dark:bg-red-900/10 p-6 rounded-2xl border border-red-100 dark:border-red-800/30">
              <div className="flex items-center gap-3 mb-4">
                <div className="p-2 bg-red-100 dark:bg-red-900/50 rounded-lg">
                  <UserX className="w-6 h-6 text-red-600 dark:text-red-400" />
                </div>
                <div>
                  <h2 className="text-xl font-bold text-gray-800 dark:text-gray-200">ประมวลผลประจำวัน (Manual)</h2>
                  <p className="text-sm text-gray-500 dark:text-gray-400">ตรวจสอบผู้ที่ "ขาด" และผู้ที่ "ไม่ลงเวลาออก" (ควรทำหลังสิ้นสุดเวลาลงเวลาออก) — เลือกช่วงวันที่ย้อนหลังได้ (ครั้งละไม่เกิน 31 วัน) กรณีวันที่ระบบอัตโนมัติไม่ได้ทำงาน</p>
                </div>
              </div>
              <div className="flex flex-col items-end gap-2">
                <div className="flex flex-wrap items-center justify-end gap-2 text-sm text-gray-600 dark:text-gray-300">
                  <span>ประมวลผลตั้งแต่วันที่</span>
                  <input
                    type="date"
                    value={processFrom}
                    max={processTo || undefined}
                    onChange={(e) => {
                      setProcessFrom(e.target.value);
                      if (e.target.value > processTo) setProcessTo(e.target.value);
                    }}
                    className="rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-[#1e1f21] px-3 py-1.5 text-sm text-gray-800 dark:text-gray-100"
                  />
                  <span>ถึง</span>
                  <input
                    type="date"
                    value={processTo}
                    min={processFrom || undefined}
                    max={new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Bangkok" })}
                    onChange={(e) => {
                      setProcessTo(e.target.value);
                      if (e.target.value < processFrom) setProcessFrom(e.target.value);
                    }}
                    className="rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-[#1e1f21] px-3 py-1.5 text-sm text-gray-800 dark:text-gray-100"
                  />
                </div>
                <label className="flex items-center gap-2 text-xs text-gray-600 dark:text-gray-300 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={includeNoCheckout}
                    onChange={(e) => setIncludeNoCheckout(e.target.checked)}
                    className="h-4 w-4 rounded border-gray-300"
                  />
                  ปรับคนที่สแกนเข้าแต่ไม่สแกนออกเป็น "ไม่ลงเวลาออก" ด้วย (ปกติไม่ต้องติ๊ก — จะเปลี่ยนสถานะมา/สายเดิมของบันทึกที่มีอยู่)
                </label>
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
                  * ใช้กรณีต้องการตัดขาดย้อนหลังในวันที่ระบบอัตโนมัติไม่ได้ทำงาน (เช่น ก่อนเปิดใช้ หรือระบบขัดข้อง)
                </p>
              </div>
            </div>
            </details>
          </div>
          </div>
        </div>
      </div>
    </MainLayout>
  );
};

export default AttendanceConfigPage;
