import React, { useEffect, useMemo, useState } from "react";
import { useSelector } from "react-redux";
import { useNavigate } from "react-router-dom";
import { firestore } from "@/firebase";
import { RootState } from "@/store";
import {
  collection,
  query,
  where,
  getDocs,
  doc,
  getDoc,
  onSnapshot,
  serverTimestamp,
  runTransaction,
  Timestamp,
} from "firebase/firestore";
import { updatePeriodSummaries } from "@/utils/periodSummaryUtils";
import { getRulePoints } from "@/utils/behaviorScoreUtils";
import Swal from "sweetalert2";
import { FaCheck, FaClock, FaUserGraduate, FaPlaneDeparture } from "react-icons/fa";
import { ArrowLeft } from "lucide-react";
import MainLayout from "@/layouts/MainLayout";
import SkeletonLoader from "@/components/SkeletonLoader";
import { getStudentStatus } from "@/utils/studentStatusUtils";
import { isActiveStudentSummaryStatus } from "@/utils/ownerStatsUtils";
import { usePwaMode } from "@/hooks/usePwaMode";

// สถานะที่ใช้ในหน้านี้ต้องตรงกับที่ระบบ Attendance หลักใช้ (students/{id}/attendance/{date} +
// Todaysummary — ดู getStatusKey/getDailySummaryField ใน periodSummaryUtils.ts) ห้ามเพิ่ม/เปลี่ยนค่าตรงนี้
// โดยไม่เช็คว่ายังตรงกับ mapping ฝั่งนั้นอยู่ — "ไปราชการ" คือ key จริงที่เขียนลง DB ส่วน
// "ไปร่วมกิจกรรม" เป็นแค่ label ที่โชว์ในหน้านี้ (ให้สอดคล้องกับ context นักเรียน เหมือนที่ FlagCeremonyPage ทำ)
const STATUS = {
  PRESENT: "มา",
  LATE: "สาย",
  LEAVE: "ลา",
  ACTIVITY: "ไปราชการ",
  ABSENT: "ขาด",
} as const;

type AttendanceStatus = (typeof STATUS)[keyof typeof STATUS];

// สไตล์ปุ่ม/การ์ดเลียนแบบหน้าเช็คขาดคาบ (ClassroomAttendance/StudentGrid.tsx) ตามที่ขอ — ปุ่มตัวหนังสือ
// แบนๆ ไม่มีไอคอนวงกลม, active = พื้นขาว + ตัวอักษรสี + ring บางๆ สีเดียวกับสถานะ
const STATUS_OPTIONS: {
  value: AttendanceStatus;
  label: string;
  dotClass: string;
  activeClass: string;
  cardClass: string;
}[] = [
  { value: STATUS.PRESENT, label: "มา", dotClass: "bg-green-500", activeClass: "bg-white dark:bg-gray-700 text-green-600 dark:text-green-400 shadow-sm ring-1 ring-green-200 dark:ring-green-800", cardClass: "border-green-200 dark:border-green-900 bg-green-50/30 dark:bg-green-900/5" },
  { value: STATUS.LATE, label: "สาย", dotClass: "bg-yellow-500", activeClass: "bg-white dark:bg-gray-700 text-yellow-600 dark:text-yellow-400 shadow-sm ring-1 ring-yellow-200 dark:ring-yellow-800", cardClass: "border-yellow-200 dark:border-yellow-900 bg-yellow-50/30 dark:bg-yellow-900/5" },
  { value: STATUS.LEAVE, label: "ลา", dotClass: "bg-blue-500", activeClass: "bg-white dark:bg-gray-700 text-blue-600 dark:text-blue-400 shadow-sm ring-1 ring-blue-200 dark:ring-blue-800", cardClass: "border-blue-200 dark:border-blue-900 bg-blue-50/30 dark:bg-blue-900/5" },
  { value: STATUS.ACTIVITY, label: "ไปร่วมกิจกรรม", dotClass: "bg-violet-500", activeClass: "bg-white dark:bg-gray-700 text-violet-600 dark:text-violet-400 shadow-sm ring-1 ring-violet-200 dark:ring-violet-800", cardClass: "border-violet-200 dark:border-violet-900 bg-violet-50/30 dark:bg-violet-900/5" },
  { value: STATUS.ABSENT, label: "ขาด", dotClass: "bg-red-500", activeClass: "bg-white dark:bg-gray-700 text-red-600 dark:text-red-400 shadow-sm ring-1 ring-red-200 dark:ring-red-800", cardClass: "border-red-200 dark:border-red-900 bg-red-50/30 dark:bg-red-900/5" },
];

interface RosterStudent {
  id: string;
  studentId: string;
  number: string;
  name: string;
  profileImageUrl: string;
  profileImageThumbUrl?: string;
  classLevel: string;
  room: string;
  status: AttendanceStatus;
  // สถานะที่เคยถูกบันทึกไว้แล้วสำหรับวันนี้ (จากแหล่งไหนก็ได้ ไม่จำกัดว่าต้องมาจากหน้านี้) — ใช้เป็น
  // oldStatus ตอนคำนวณ delta ให้ updatePeriodSummaries/คะแนนพฤติกรรม ไม่ใช่ baseline ที่ต้องรีเซ็ตทุกครั้ง
  existingStatus: AttendanceStatus | null;
}

const getTodayString = () => new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Bangkok" });

const StudentCardSkeleton: React.FC = () => (
  <div className="rounded-2xl p-4 border-2 border-gray-200 dark:border-gray-700 bg-white dark:bg-[#2a2b2f] animate-pulse">
    <div className="flex items-center gap-3">
      <SkeletonLoader className="w-14 h-14 rounded-full shrink-0" />
      <div className="flex-1 space-y-2">
        <SkeletonLoader className="h-4 w-3/4 rounded" />
        <SkeletonLoader className="h-3 w-1/2 rounded" />
      </div>
    </div>
    <div className="grid grid-cols-5 gap-1.5 mt-4">
      {[...Array(5)].map((_, i) => <SkeletonLoader key={i} className="h-9 rounded-lg" />)}
    </div>
  </div>
);

const DailyAttendanceCheckPage: React.FC = () => {
  const navigate = useNavigate();
  const isPwaMode = usePwaMode();
  const { user } = useSelector((state: RootState) => state.auth);
  const schoolId = user?.schoolId;
  const todayStr = getTodayString();

  const [isHomeroom, setIsHomeroom] = useState(false);
  const [selectedClass, setSelectedClass] = useState("");
  const [availableLevels, setAvailableLevels] = useState<string[]>([]);
  const [selectedClassLevel, setSelectedClassLevel] = useState("");
  const [selectedRoom, setSelectedRoom] = useState("");

  const [students, setStudents] = useState<RosterStudent[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // เลือกจาก dropdown ก่อนแค่ "ตั้งเป้าหมาย" ไว้ ยังไม่กระทบนักเรียนคนไหนทั้งนั้น จนกว่าจะคลิกการ์ด
  // นักเรียนทีละคน (หรือกด "ใช้กับทุกคน") — เหมือนพฤติกรรมของหน้าเช็คแถว (FlagCeremonyPage)
  const [pendingStatus, setPendingStatus] = useState<AttendanceStatus | "">("");
  const [selectedStudentIds, setSelectedStudentIds] = useState<Set<string>>(new Set());
  // เก็บสถานะเดิมก่อนถูกคลิกไว้ต่อคน เพื่อคลิกซ้ำแล้ว "ยกเลิก/คืนค่าเดิม" ได้
  const [selectionSnapshots, setSelectionSnapshots] = useState<Map<string, AttendanceStatus>>(new Map());
  const [currentAcademicYear, setCurrentAcademicYear] = useState<string>("");
  const [behaviorScoreConfig, setBehaviorScoreConfig] = useState<any>(null);

  // ตรวจว่าเป็นครูประจำชั้นไหม — auto-select ชั้น/ห้องให้เลย (เหมือน FlagCeremonyPage)
  useEffect(() => {
    const checkTeacherStatus = async () => {
      if (!user?.uid || !schoolId) return;
      try {
        const teacherRef = doc(firestore, "school-settings", schoolId, "teachers", user.uid);
        const snap = await getDoc(teacherRef);
        if (snap.exists()) {
          const data = snap.data();
          if (data.isHomeroomTeacher && data.homeroomGrade) {
            setSelectedClass(data.homeroomRoom ? `${data.homeroomGrade}/${data.homeroomRoom}` : data.homeroomGrade);
            setIsHomeroom(true);
          }
        }
      } catch (err) {
        console.error("Error checking teacher status:", err);
      }
    };
    checkTeacherStatus();
  }, [user, schoolId]);

  useEffect(() => {
    if (isHomeroom) return;
    if (selectedClassLevel && selectedRoom) setSelectedClass(`${selectedClassLevel}/${selectedRoom}`);
    else if (selectedClassLevel) setSelectedClass(selectedClassLevel);
    else setSelectedClass("");
  }, [selectedClassLevel, selectedRoom, isHomeroom]);

  useEffect(() => {
    if (!schoolId) return;

    const fetchLevels = async () => {
      try {
        const schoolSnap = await getDoc(doc(firestore, "school-settings", schoolId));
        if (schoolSnap.exists()) {
          const levelRange = schoolSnap.data().opportunityExpansionLevel;
          const primary = ["ป.1", "ป.2", "ป.3", "ป.4", "ป.5", "ป.6"];
          const junior = ["ม.1", "ม.2", "ม.3"];
          const senior = ["ม.4", "ม.5", "ม.6"];
          let levels: string[] = [...primary, ...junior, ...senior];
          if (levelRange === "ป.1-ป.6") levels = primary;
          else if (levelRange === "ม.1-ม.6") levels = [...junior, ...senior];
          else if (levelRange === "ป.1-ม.3") levels = [...primary, ...junior];
          else if (levelRange === "ป.1-ม.6") levels = [...primary, ...junior, ...senior];
          setAvailableLevels(levels);
        }
      } catch (err) {
        console.error("Error fetching school levels:", err);
      }
    };
    fetchLevels();

    const unsubscribeConfig = onSnapshot(doc(firestore, "school-settings", schoolId), (snap) => {
      if (snap.exists()) {
        setBehaviorScoreConfig(snap.data().behaviorScoreConfig || null);
      }
    });
    const unsubscribeCalendar = onSnapshot(doc(firestore, "school-settings", schoolId, "main_calendar", "default"), (snap) => {
      if (snap.exists() && snap.data().academicYear) {
        setCurrentAcademicYear(snap.data().academicYear);
      }
    });

    return () => {
      unsubscribeConfig();
      unsubscribeCalendar();
    };
  }, [schoolId]);

  useEffect(() => {
    if (!selectedClass || !schoolId) {
      setStudents([]);
      setSelectedStudentIds(new Set());
      setSelectionSnapshots(new Map());
      return;
    }

    const fetchRoster = async () => {
      setIsLoading(true);
      setError(null);
      setSelectedStudentIds(new Set());
      setSelectionSnapshots(new Map());
      try {
        const [classLevel, room] = selectedClass.split("/");
        const studentsQuery = room
          ? query(
              collection(firestore, "school-settings", schoolId, "students"),
              where("classLevel", "==", classLevel),
              where("room", "==", room)
            )
          : query(
              collection(firestore, "school-settings", schoolId, "students"),
              where("classLevel", "==", classLevel)
            );

        const snapshot = await getDocs(studentsQuery);
        const activeStudents = snapshot.docs
          .map((d) => ({ id: d.id, ...d.data() } as any))
          .filter((s) => isActiveStudentSummaryStatus(getStudentStatus(s)));

        const enriched = await Promise.all(
          activeStudents.map(async (s: any) => {
            const attendanceRef = doc(firestore, "school-settings", schoolId, "students", s.id, "attendance", todayStr);
            const leaveQuery = query(
              collection(firestore, "school-settings", schoolId, "students", s.id, "leave_summary"),
              where("status", "==", "approved")
            );

            const [attendanceSnap, leaveSnap] = await Promise.all([getDoc(attendanceRef), getDocs(leaveQuery)]);

            let existingStatus: AttendanceStatus | null = null;
            if (attendanceSnap.exists()) {
              const st = attendanceSnap.data().status;
              if (Object.values(STATUS).includes(st)) existingStatus = st;
            }

            let defaultStatus: AttendanceStatus = STATUS.PRESENT;
            if (existingStatus) {
              defaultStatus = existingStatus;
            } else {
              const approvedLeave = leaveSnap.docs.find((d) => {
                const data = d.data();
                const toDateStr = (val: any) => (val?.toDate ? val.toDate().toISOString().split("T")[0] : typeof val === "string" ? val : "");
                const start = toDateStr(data.startDate);
                const end = toDateStr(data.endDate);
                return start && end && start <= todayStr && end >= todayStr;
              });
              if (approvedLeave) {
                defaultStatus = approvedLeave.data().leaveType === "ไปราชการ/กิจกรรม" ? STATUS.ACTIVITY : STATUS.LEAVE;
              }
            }

            const student: RosterStudent = {
              id: s.id,
              studentId: s.studentId,
              number: s.number || "",
              name: `${s.title || ""}${s.firstName} ${s.lastName}`.trim(),
              profileImageUrl: s.profileImageUrl || "",
              profileImageThumbUrl: s.profileImageThumbUrl || "",
              classLevel: s.classLevel,
              room: s.room,
              status: defaultStatus,
              existingStatus,
            };
            return student;
          })
        );

        enriched.sort((a, b) => (a.studentId || "").localeCompare(b.studentId || "", "th"));
        setStudents(enriched);
      } catch (err: any) {
        console.error("Error fetching roster:", err);
        setError(
          err.message?.includes("requires an index")
            ? "ระบบต้องการ Index สำหรับการค้นหาข้อมูล กรุณาเปิด Console (F12) และคลิกลิงก์ที่ Firebase แจ้งเตือนเพื่อสร้าง Index"
            : "เกิดข้อผิดพลาดในการโหลดข้อมูลนักเรียน"
        );
      } finally {
        setIsLoading(false);
      }
    };

    fetchRoster();
  }, [selectedClass, schoolId, todayStr]);

  const summary = useMemo(() => {
    const counts: Record<AttendanceStatus, number> = {
      [STATUS.PRESENT]: 0,
      [STATUS.LATE]: 0,
      [STATUS.LEAVE]: 0,
      [STATUS.ACTIVITY]: 0,
      [STATUS.ABSENT]: 0,
    };
    students.forEach((s) => { counts[s.status] += 1; });
    return counts;
  }, [students]);

  const attendingCount = summary[STATUS.PRESENT] + summary[STATUS.LATE] + summary[STATUS.ACTIVITY];

  // ปุ่มเช็คสถานะรายคนใต้โปรไฟล์: ตั้งสถานะของคนนั้นตรงๆ ทันที ไม่ต้องเลือก dropdown ก่อน
  // และไม่ไปยุ่งกับ selectedStudentIds/snapshot ของกลไกคลิกทั้งการ์ด (คนละกลไกกัน ใช้คู่กันได้)
  const setStudentStatus = (studentId: string, status: AttendanceStatus) => {
    setStudents((prev) => prev.map((s) => (s.id === studentId ? { ...s, status } : s)));
  };

  // คลิกการ์ดนักเรียน: ถ้ายังไม่ถูกเลือก ให้ "จับคู่" สถานะที่เลือกไว้ใน dropdown เข้ากับคนนั้น
  // (ต้องเลือก dropdown ก่อนเสมอ กันคลิกพลาดโดยไม่ตั้งใจ) ถ้าคลิกซ้ำคนที่เลือกไว้แล้ว = ยกเลิก คืนค่าเดิม
  const toggleStudentSelection = (studentId: string) => {
    const current = students.find((s) => s.id === studentId);
    if (!current) return;

    if (selectedStudentIds.has(studentId)) {
      const snapshot = selectionSnapshots.get(studentId);
      setSelectedStudentIds((prev) => {
        const next = new Set(prev);
        next.delete(studentId);
        return next;
      });
      setSelectionSnapshots((prev) => {
        const next = new Map(prev);
        next.delete(studentId);
        return next;
      });
      if (snapshot) {
        setStudents((prev) => prev.map((s) => (s.id === studentId ? { ...s, status: snapshot } : s)));
      }
      return;
    }

    if (!pendingStatus) {
      Swal.fire({
        icon: "warning",
        title: "กรุณาเลือกสถานะก่อน",
        text: 'เลือกคำสั่งจากดรอปดาวน์ "คำสั่งรวมทั้งชั้น" ด้านบนก่อน แล้วค่อยคลิกการ์ดนักเรียน',
      });
      return;
    }

    setSelectionSnapshots((prev) => {
      const next = new Map(prev);
      next.set(studentId, current.status);
      return next;
    });
    setSelectedStudentIds((prev) => new Set(prev).add(studentId));
    setStudents((prev) => prev.map((s) => (s.id === studentId ? { ...s, status: pendingStatus } : s)));
  };

  const applyPendingToAll = () => {
    if (!pendingStatus || students.length === 0) return;

    setSelectionSnapshots((prev) => {
      const next = new Map(prev);
      students.forEach((s) => {
        if (!selectedStudentIds.has(s.id)) next.set(s.id, s.status);
      });
      return next;
    });
    setSelectedStudentIds((prev) => {
      const next = new Set(prev);
      students.forEach((s) => next.add(s.id));
      return next;
    });
    setStudents((prev) => prev.map((s) => ({ ...s, status: pendingStatus })));
  };

  const handleSaveAll = async () => {
    if (!schoolId || students.length === 0) {
      Swal.fire({ icon: "warning", title: "ไม่พบนักเรียน", text: "ไม่มีนักเรียนในชั้นเรียนนี้ให้บันทึก" });
      return;
    }

    setIsSaving(true);
    try {
      const classLevelOnly = selectedClass.split("/")[0]?.trim() || undefined;

      await Promise.all(
        students.map(async (student) => {
          const attendanceRef = doc(firestore, "school-settings", schoolId, "students", student.id, "attendance", todayStr);
          const studentRef = doc(firestore, "school-settings", schoolId, "students", student.id);

          await runTransaction(firestore, async (transaction) => {
            const [freshAttendanceSnap, freshStudentSnap] = await Promise.all([
              transaction.get(attendanceRef),
              transaction.get(studentRef),
            ]);

            const freshOldStatus: string | null = freshAttendanceSnap.exists() ? (freshAttendanceSnap.data().status || null) : null;
            const newStatus = student.status;

            transaction.set(
              attendanceRef,
              {
                schoolId,
                date: todayStr,
                userType: "student",
                classLevel: `${student.classLevel}/${student.room}`,
                status: newStatus,
                checkinTime: newStatus === STATUS.LEAVE || newStatus === STATUS.ABSENT ? null : Timestamp.now(),
                updatedAt: serverTimestamp(),
                metadata: {
                  source: "daily_attendance_check",
                  recordedBy: user?.uid || null,
                  recordedByName: user?.fullName || "",
                },
              },
              { merge: true }
            );

            updatePeriodSummaries(firestore, transaction, schoolId, student.id, "students", todayStr, freshOldStatus, newStatus, classLevelOnly, currentAcademicYear);

            const oldPenalty = getRulePoints(behaviorScoreConfig, freshOldStatus);
            const newPenalty = getRulePoints(behaviorScoreConfig, newStatus);
            const penaltyDelta = oldPenalty - newPenalty;
            if (penaltyDelta !== 0) {
              const currentScore = Number(freshStudentSnap.data()?.behaviorScore ?? 100);
              transaction.set(
                studentRef,
                {
                  behaviorScore: currentScore + penaltyDelta,
                  behaviorScoreUpdatedAt: serverTimestamp(),
                  lastBehaviorScoreChange: {
                    delta: penaltyDelta,
                    oldStatus: freshOldStatus,
                    newStatus,
                    updatedAt: serverTimestamp(),
                    source: "attendance",
                  },
                },
                { merge: true }
              );
            }
          });
        })
      );

      setStudents((prev) => prev.map((s) => ({ ...s, existingStatus: s.status })));
      Swal.fire({ icon: "success", title: "บันทึกสำเร็จ", timer: 1500, showConfirmButton: false });
    } catch (err) {
      console.error("Error saving attendance:", err);
      Swal.fire({ icon: "error", title: "บันทึกไม่สำเร็จ", text: "เกิดข้อผิดพลาด กรุณาลองใหม่อีกครั้ง" });
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <MainLayout>
      <div className={`min-h-screen bg-gray-50/50 dark:bg-[#1e1f21] transition-colors duration-300 ${isPwaMode ? "px-2.5 py-3 pb-6" : "p-4 sm:p-6"}`}>
        <div className={`${isPwaMode ? "max-w-full space-y-4" : "max-w-7xl space-y-6"} mx-auto min-w-0`}>
          {/* Header */}
          <div className={`flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white dark:bg-[#2a2b2f] rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 ${isPwaMode ? "p-4" : "p-6"}`}>
            <div className="flex items-center gap-3">
              <button
                onClick={() => navigate("/academic/hub/attendance")}
                className="w-10 h-10 rounded-full bg-gray-100 dark:bg-[#26282d] border border-gray-200 dark:border-white/10 flex items-center justify-center text-gray-600 dark:text-[#a9aebb] hover:bg-gray-200 dark:hover:bg-[#2d3036] hover:text-gray-900 dark:hover:text-white active:scale-95 transition-all shrink-0"
              >
                <ArrowLeft size={20} strokeWidth={2.2} />
              </button>
              <div>
                <h1 className={`${isPwaMode ? "text-xl" : "text-2xl sm:text-3xl"} font-bold bg-clip-text text-transparent bg-gradient-to-r from-indigo-600 to-violet-600 dark:from-indigo-400 dark:to-violet-400`}>
                  เช็คชื่อมาเรียน (ไม่ใช้สแกน)
                </h1>
                <div className={`${isPwaMode ? "text-xs" : ""} flex items-center gap-2 mt-2 text-gray-500 dark:text-gray-400`}>
                  <FaClock className="text-indigo-500" />
                  <span>{new Date().toLocaleDateString("th-TH", { dateStyle: "long" })}</span>
                </div>
              </div>
            </div>

            <div className="w-full md:w-72">
              {isHomeroom ? (
                <div className="w-full bg-indigo-50 dark:bg-indigo-900/20 border border-indigo-200 dark:border-indigo-800 rounded-xl px-4 py-2.5 text-indigo-900 dark:text-indigo-100 font-semibold text-center">
                  ชั้น {selectedClass}
                </div>
              ) : (
                <div className="flex gap-2">
                  <select
                    value={selectedClassLevel}
                    onChange={(e) => setSelectedClassLevel(e.target.value)}
                    className="w-full px-3 py-2.5 bg-white dark:bg-[#2a2b2f] border border-gray-200 dark:border-gray-700 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none text-sm text-gray-900 dark:text-white"
                  >
                    <option value="">ชั้น</option>
                    {availableLevels.map((level) => (
                      <option key={level} value={level}>{level}</option>
                    ))}
                  </select>
                  <select
                    value={selectedRoom}
                    onChange={(e) => setSelectedRoom(e.target.value)}
                    className="w-full px-3 py-2.5 bg-white dark:bg-[#2a2b2f] border border-gray-200 dark:border-gray-700 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none text-sm text-gray-900 dark:text-white"
                  >
                    <option value="">ห้อง</option>
                    {Array.from({ length: 20 }, (_, i) => i + 1).map((r) => (
                      <option key={r} value={r}>{r}</option>
                    ))}
                  </select>
                </div>
              )}
            </div>
          </div>

          {error && (
            <div className="rounded-xl bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 p-4 text-red-700 dark:text-red-300 text-sm">
              {error}
            </div>
          )}

          {isLoading && selectedClass && (
            <div className={isPwaMode ? "grid grid-cols-1 gap-3" : "grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4"}>
              {[...Array(8)].map((_, i) => <StudentCardSkeleton key={i} />)}
            </div>
          )}

          {!isLoading && selectedClass && students.length > 0 && (
            <>
              {/* Summary Cards — เหมือนการ์ด "มาเรียนวันนี้" ที่หน้า Home */}
              <div className="bg-white dark:bg-[#2a2b2f] rounded-2xl border border-gray-100 dark:border-gray-700 shadow-sm p-5 sm:p-6">
                <div className="flex items-center justify-between mb-4">
                  <p className="text-sm font-medium text-gray-500 dark:text-gray-400">มาเรียนวันนี้</p>
                </div>
                <p className="text-4xl font-extrabold text-gray-900 dark:text-white mb-4">
                  {attendingCount}/{students.length}
                </p>
                <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
                  {STATUS_OPTIONS.map((opt) => (
                    <div key={opt.value} className="rounded-2xl bg-gray-50 dark:bg-[#1e1f21] px-3 py-3 text-center">
                      <p className="text-xs text-gray-500 dark:text-gray-400">{opt.label}</p>
                      <p className={`text-xl font-bold mt-1 ${opt.value === STATUS.ABSENT ? "text-red-600 dark:text-red-400" : "text-gray-900 dark:text-white"}`}>
                        {summary[opt.value]}
                      </p>
                    </div>
                  ))}
                </div>
              </div>

              {/* Sticky action bar */}
              <div className={`bg-white/90 dark:bg-[#2a2b2f]/90 backdrop-blur-md rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 sticky top-[70px] z-10 ${isPwaMode ? "p-3" : "p-4"}`}>
                <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-4">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-3">
                      <div className="bg-indigo-100 dark:bg-indigo-900/30 p-2 rounded-lg text-indigo-600 dark:text-indigo-400">
                        <FaUserGraduate />
                      </div>
                      <span className="text-gray-600 dark:text-gray-300 font-medium">
                        นักเรียนทั้งหมด <span className="text-indigo-600 dark:text-indigo-400 font-bold text-lg">{students.length}</span> คน
                      </span>
                    </div>
                    <label className="block text-sm font-semibold text-gray-500 dark:text-gray-400 mb-2">คำสั่งรวมทั้งชั้น</label>
                    <div className="flex gap-2 w-full lg:max-w-xl">
                      <select
                        value={pendingStatus}
                        onChange={(e) => setPendingStatus(e.target.value as AttendanceStatus | "")}
                        className="flex-1 min-w-0 bg-white dark:bg-[#1e1f21] border border-gray-200 dark:border-gray-700 rounded-xl px-4 py-3 focus:ring-2 focus:ring-indigo-500 outline-none font-bold text-gray-900 dark:text-white"
                      >
                        <option value="" disabled>กรุณาเลือกสถานะ</option>
                        {STATUS_OPTIONS.map((opt) => (
                          <option key={opt.value} value={opt.value}>{opt.label}</option>
                        ))}
                      </select>
                      <button
                        type="button"
                        onClick={applyPendingToAll}
                        disabled={!pendingStatus}
                        className="shrink-0 rounded-xl bg-indigo-100 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-300 font-bold px-4 py-3 text-sm hover:bg-indigo-200 dark:hover:bg-indigo-900/50 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        ใช้กับทุกคน
                      </button>
                    </div>
                    <p className="text-xs text-gray-400 dark:text-gray-500 mt-2">
                      เลือกคำสั่งด้านบนจะใช้กับนักเรียนทั้งชั้นทันที หรือคลิกการ์ดนักเรียนเป็นรายคนเพื่อปรับเฉพาะคนนั้น (คลิกซ้ำเพื่อยกเลิก)
                    </p>
                  </div>

                  <button
                    onClick={handleSaveAll}
                    disabled={isSaving}
                    className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-xl shadow-lg shadow-indigo-500/30 hover:shadow-indigo-500/50 transition-all flex items-center justify-center gap-2 disabled:bg-gray-400 disabled:shadow-none py-3 px-6"
                  >
                    <FaCheck /> {isSaving ? "กำลังบันทึก..." : "บันทึกข้อมูล"}
                  </button>
                </div>
              </div>

              {/* Student grid — คลิกการ์ดเพื่อจับคู่กับสถานะที่เลือกไว้ใน dropdown ด้านบน (เหมือนหน้าเช็คแถว) */}
              <div className={isPwaMode ? "grid grid-cols-1 gap-3" : "grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4"}>
                {students.map((student) => {
                  const opt = STATUS_OPTIONS.find((o) => o.value === student.status)!;
                  const isSelected = selectedStudentIds.has(student.id);
                  return (
                    <div
                      key={student.id}
                      role="button"
                      tabIndex={0}
                      onClick={() => toggleStudentSelection(student.id)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          toggleStudentSelection(student.id);
                        }
                      }}
                      className={`relative rounded-2xl p-4 border-2 transition-all duration-200 cursor-pointer active:scale-[0.98] min-w-0 ${
                        isSelected
                          ? "ring-2 ring-indigo-400 ring-offset-2 ring-offset-gray-50 dark:ring-offset-[#1e1f21]"
                          : "hover:shadow-lg"
                      } ${opt.cardClass}`}
                    >
                      {isSelected && (
                        <span className="absolute top-3 right-3 inline-flex items-center gap-1 rounded-full bg-indigo-600 px-2 py-1 text-[11px] font-bold text-white shadow-lg z-10">
                          <FaCheck className="w-2.5 h-2.5" />
                          เลือกแล้ว
                        </span>
                      )}

                      {/* Layout: มือถือ/PWA เรียงแนวนอน (รูป+ชื่อ) แล้วปุ่มเต็มความกว้างด้านล่าง
                          จอกว้าง (sm ขึ้นไป) จัดกึ่งกลางแนวตั้งแทน (รูปใหญ่ขึ้น กลางจอ, ชื่อกึ่งกลางใต้รูป,
                          ปุ่มเต็มความกว้างด้านล่างสุด) — ตำแหน่ง/สไตล์ปุ่มแบบเดียวกับหน้าเช็คขาดคาบ
                          (ClassroomAttendance/StudentGrid.tsx) ตามที่ขอ */}
                      <div className={isPwaMode ? "flex flex-col gap-3" : "flex flex-row sm:flex-col items-center gap-4"}>
                        <div className={isPwaMode ? "flex items-center gap-3 min-w-0 pr-16" : "flex items-center gap-3 min-w-0 pr-16 sm:pr-0 sm:contents"}>
                          <div className="relative shrink-0">
                            <img
                              src={student.profileImageThumbUrl || student.profileImageUrl || `https://ui-avatars.com/api/?name=${encodeURIComponent(student.name)}&background=random`}
                              alt={student.name}
                              loading="lazy"
                              // object-[50%_18%]: รูปนักเรียนมักเว้นพื้นหลังเหนือศีรษะไว้เยอะ ถ้าใช้ object-center
                              // (ค่า default) เฟรมกลมจะครอปเอาคางลงมาแทนหน้าผาก/หูด้านบน ขยับจุดโฟกัสขึ้นไปที่ 18%
                              // จากขอบบน (แทน 50%) ให้ตา-หู-จมูก-ปากอยู่กลางเฟรมพอดีโดยไม่ตัดศีรษะ — ค่าเดียวกับที่
                              // ใช้ในหน้าเช็คแถว (FlagCeremonyPage)
                              className={`rounded-full object-cover object-[50%_18%] border-4 border-white dark:border-[#2a2b2f] shadow-sm ${isPwaMode ? "w-14 h-14" : "w-16 h-16 sm:w-24 sm:h-24"}`}
                              onError={(e) => { (e.target as HTMLImageElement).src = `https://ui-avatars.com/api/?name=${encodeURIComponent(student.name)}&background=random`; }}
                            />
                            <span className={`absolute bottom-0 right-0 sm:bottom-1 sm:right-1 w-5 h-5 sm:w-6 sm:h-6 rounded-full border-2 sm:border-4 border-white dark:border-[#2a2b2f] shadow-sm ${opt.dotClass}`} />
                          </div>
                          <div className={`min-w-0 ${isPwaMode ? "text-left" : "text-left sm:text-center"}`}>
                            <p className="font-bold text-gray-900 dark:text-white truncate">{student.name}</p>
                            <span className="inline-block max-w-full bg-white/50 dark:bg-black/20 px-2 py-0.5 rounded-md font-mono truncate text-[11px] text-gray-500 dark:text-gray-400 mt-0.5">
                              รหัส {student.studentId} | เลขที่ {student.number || "-"}
                            </span>
                          </div>
                        </div>

                        {/* ปุ่มเช็คสถานะรายคน — คลิกตรงๆ ได้เลยไม่ต้องผ่าน dropdown, stopPropagation กันไม่ให้
                            ไปสั่ง toggleStudentSelection ของทั้งการ์ดซ้อนกัน — "ไปร่วมกิจกรรม" แยกลงมาเป็น
                            แถวเต็มความกว้างด้านล่างต่างหาก แบบเดียวกับปุ่ม "หนีเรียน" ในหน้าเช็คขาดคาบ เพราะ
                            label ยาวกว่าสถานะอื่นมาก ใส่รวมแถวเดียวกัน 5 ช่องแล้วอ่านลำบาก */}
                        <div className={`w-full min-w-0 flex flex-col gap-1.5 ${isPwaMode ? "mt-0" : "mt-4 sm:mt-2"}`} onClick={(e) => e.stopPropagation()}>
                          <div className="grid grid-cols-4 gap-1.5">
                            {STATUS_OPTIONS.filter((o) => o.value !== STATUS.ACTIVITY).map((statusOpt) => {
                              const isActive = student.status === statusOpt.value;
                              return (
                                <button
                                  key={statusOpt.value}
                                  type="button"
                                  title={statusOpt.label}
                                  onClick={() => setStudentStatus(student.id, statusOpt.value)}
                                  className={`flex min-w-0 items-center justify-center rounded-xl font-bold text-center py-2 text-xs transition-all duration-200 ${
                                    isActive
                                      ? `${statusOpt.activeClass} ring-2 ring-offset-1 ring-offset-white dark:ring-offset-[#2a2b2f]`
                                      : "bg-white/50 dark:bg-black/20 text-gray-400 hover:bg-white dark:hover:bg-gray-700 hover:text-gray-600 dark:hover:text-gray-300"
                                  }`}
                                >
                                  <span className="truncate">{statusOpt.label}</span>
                                </button>
                              );
                            })}
                          </div>
                          {STATUS_OPTIONS.filter((o) => o.value === STATUS.ACTIVITY).map((statusOpt) => {
                            const isActive = student.status === statusOpt.value;
                            return (
                              <button
                                key={statusOpt.value}
                                type="button"
                                title={statusOpt.label}
                                onClick={() => setStudentStatus(student.id, statusOpt.value)}
                                className={`w-full flex min-w-0 items-center justify-center gap-1.5 rounded-xl font-bold py-1.5 text-xs transition-all duration-200 ${
                                  isActive
                                    ? `${statusOpt.activeClass} ring-2 ring-offset-1 ring-offset-white dark:ring-offset-[#2a2b2f]`
                                    : "bg-white/50 dark:bg-black/20 text-gray-400 hover:bg-white dark:hover:bg-gray-700 hover:text-gray-600 dark:hover:text-gray-300"
                                }`}
                              >
                                <FaPlaneDeparture className="text-xs shrink-0" />
                                <span className="truncate">{statusOpt.label}</span>
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </>
          )}

          {!isLoading && selectedClass && students.length === 0 && !error && (
            <div className="text-center py-20 bg-white dark:bg-[#2a2b2f] rounded-2xl shadow-sm border border-dashed border-gray-300 dark:border-gray-700">
              <p className="text-gray-400 dark:text-gray-500">ไม่พบนักเรียนในชั้นเรียนนี้</p>
            </div>
          )}

          {!selectedClass && (
            <div className="text-center py-20 bg-white dark:bg-[#2a2b2f] rounded-2xl shadow-sm border border-dashed border-gray-300 dark:border-gray-700">
              <p className="text-gray-400 dark:text-gray-500">กรุณาเลือกชั้นเรียนเพื่อเริ่มเช็คชื่อ</p>
            </div>
          )}
        </div>
      </div>
    </MainLayout>
  );
};

export default DailyAttendanceCheckPage;
