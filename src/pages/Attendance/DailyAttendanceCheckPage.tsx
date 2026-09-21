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
  const [homeroomClass, setHomeroomClass] = useState<{ grade: string; room?: string } | null>(null);
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

  // ตรวจว่าเป็นครูประจำชั้นไหม — นำระดับชั้น/ห้องมาเป็นค่าเริ่มต้น แต่ยังสามารถเลือกระดับชั้นอื่นได้
  useEffect(() => {
    const checkTeacherStatus = async () => {
      if (!user?.uid || !schoolId) return;
      try {
        const teacherRef = doc(firestore, "school-settings", schoolId, "teachers", user.uid);
        const snap = await getDoc(teacherRef);
        if (snap.exists()) {
          const data = snap.data();
          if (data.isHomeroomTeacher && data.homeroomGrade) {
            setHomeroomClass({ grade: data.homeroomGrade, room: data.homeroomRoom ? String(data.homeroomRoom) : "" });
            setSelectedClassLevel(data.homeroomGrade);
            setSelectedRoom(data.homeroomRoom ? String(data.homeroomRoom) : "");
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
    if (selectedClassLevel && selectedRoom) setSelectedClass(`${selectedClassLevel}/${selectedRoom}`);
    else if (selectedClassLevel) setSelectedClass(selectedClassLevel);
    else setSelectedClass("");
  }, [selectedClassLevel, selectedRoom]);

// ดึงระดับชั้นที่เปิดสอนตามที่ตั้งค่าไว้ในหน้าข้อมูลโรงเรียน (/owner/school-info/:schoolId)
const getLevelsFromSchoolSettings = (data?: any): string[] => {
  const levelRange = data?.opportunityExpansionLevel;
  const schoolType = data?.schoolType;

  const kindergarten = ["อ.1", "อ.2", "อ.3"];
  const primary = ["ป.1", "ป.2", "ป.3", "ป.4", "ป.5", "ป.6"];
  const junior = ["ม.1", "ม.2", "ม.3"];
  const senior = ["ม.4", "ม.5", "ม.6"];

  if (levelRange === "ป.1-ป.6") return primary;
  if (levelRange === "อ.1-ป.6") return [...kindergarten, ...primary];
  if (levelRange === "ป.1-ม.3") return [...primary, ...junior];
  if (levelRange === "อ.1-ม.3") return [...kindergarten, ...primary, ...junior];
  if (levelRange === "ป.1-ม.6") return [...primary, ...junior, ...senior];
  if (levelRange === "อ.1-ม.6") return [...kindergarten, ...primary, ...junior, ...senior];
  if (levelRange === "ม.1-ม.6") return [...junior, ...senior];

  // fallback ตามประเภทโรงเรียน (schoolType) กรณีไม่ได้ระบุ opportunityExpansionLevel
  if (schoolType === "ประถม") return primary;
  if (schoolType === "มัธยมศึกษา") return [...junior, ...senior];
  if (schoolType === "ขยายโอกาส") return [...primary, ...junior];

  return [...primary, ...junior, ...senior];
};

  useEffect(() => {
    if (!schoolId) return;

    const fetchLevels = async () => {
      try {
        const schoolSnap = await getDoc(doc(firestore, "school-settings", schoolId));
        if (schoolSnap.exists()) {
          setAvailableLevels(getLevelsFromSchoolSettings(schoolSnap.data()));
        }
      } catch (err) {
        console.error("Error fetching school levels:", err);
      }
    };
    fetchLevels();

    const unsubscribeConfig = onSnapshot(doc(firestore, "school-settings", schoolId), (snap) => {
      if (snap.exists()) {
        const data = snap.data();
        setBehaviorScoreConfig(data.behaviorScoreConfig || null);
        setAvailableLevels(getLevelsFromSchoolSettings(data));
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
        
        // รองรับชื่อระดับชั้นทั้งแบบย่อและแบบเต็ม (เช่น "อ.1", "อนุบาล 1", "อนุบาล1")
        const getClassLevelVariants = (lvl: string): string[] => {
          const raw = (lvl || "").trim();
          const variants = new Set<string>([raw]);
          const kMatch = raw.match(/^(?:อ\.|อนุบาล|k)\s*(\d+)$/i);
          if (kMatch) {
            const n = kMatch[1];
            variants.add(`อ.${n}`);
            variants.add(`อนุบาล ${n}`);
            variants.add(`อนุบาล${n}`);
            variants.add(`k${n}`);
          }
          const pMatch = raw.match(/^(?:ป\.|ประถมศึกษาปีที่|p)\s*(\d+)$/i);
          if (pMatch) {
            const n = pMatch[1];
            variants.add(`ป.${n}`);
            variants.add(`ประถมศึกษาปีที่ ${n}`);
            variants.add(`ประถมศึกษาปีที่${n}`);
            variants.add(`p${n}`);
          }
          const mMatch = raw.match(/^(?:ม\.|มัธยมศึกษาปีที่|m)\s*(\d+)$/i);
          if (mMatch) {
            const n = mMatch[1];
            variants.add(`ม.${n}`);
            variants.add(`มัธยมศึกษาปีที่ ${n}`);
            variants.add(`มัธยมศึกษาปีที่${n}`);
            variants.add(`m${n}`);
          }
          return Array.from(variants);
        };

        const variants = getClassLevelVariants(classLevel);
        const queryPromises = variants.flatMap((lvlVariant) => {
          if (!room) {
            return [
              getDocs(
                query(
                  collection(firestore, "school-settings", schoolId, "students"),
                  where("classLevel", "==", lvlVariant)
                )
              ),
            ];
          }
          const queries = [
            getDocs(
              query(
                collection(firestore, "school-settings", schoolId, "students"),
                where("classLevel", "==", lvlVariant),
                where("room", "==", room)
              )
            ),
          ];
          const numRoom = Number(room);
          if (!isNaN(numRoom) && String(numRoom) !== room) {
            queries.push(
              getDocs(
                query(
                  collection(firestore, "school-settings", schoolId, "students"),
                  where("classLevel", "==", lvlVariant),
                  where("room", "==", numRoom)
                )
              )
            );
          }
          return queries;
        });

        const snapshots = await Promise.all(queryPromises);
        const docsMap = new Map<string, any>();
        snapshots.forEach((snap) => {
          snap.docs.forEach((d) => {
            if (!docsMap.has(d.id)) {
              docsMap.set(d.id, { id: d.id, ...d.data() });
            }
          });
        });
        const activeStudents = Array.from(docsMap.values())
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

            // ค่าเริ่มต้นของการเช็คชื่อ: หากยังไม่เคยบันทึกสถานะมาก่อน ให้เป็น "ขาด" ไว้ก่อนตามที่ต้องการ
            let defaultStatus: AttendanceStatus = STATUS.ABSENT;
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

        enriched.sort((a, b) => {
          const numA = parseInt(a.number, 10);
          const numB = parseInt(b.number, 10);
          if (!isNaN(numA) && !isNaN(numB)) return numA - numB;
          return (a.studentId || "").localeCompare(b.studentId || "", "th");
        });
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

            <div className="w-full md:w-80">
              {homeroomClass && (
                <div className="flex items-center justify-between text-xs text-indigo-600 dark:text-indigo-400 font-medium px-1 mb-1.5">
                  <span>ประจำชั้น: {homeroomClass.grade}{homeroomClass.room ? `/${homeroomClass.room}` : ""}</span>
                  {(selectedClassLevel !== homeroomClass.grade || selectedRoom !== (homeroomClass.room || "")) && (
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedClassLevel(homeroomClass.grade);
                        setSelectedRoom(homeroomClass.room || "");
                      }}
                      className="underline hover:text-indigo-800 dark:hover:text-indigo-200 transition-colors cursor-pointer"
                    >
                      เลือกห้องของฉัน
                    </button>
                  )}
                </div>
              )}
              <div className="flex gap-2">
                <select
                  value={selectedClassLevel}
                  onChange={(e) => setSelectedClassLevel(e.target.value)}
                  className="w-full px-3 py-2.5 bg-white dark:bg-[#2a2b2f] border border-gray-200 dark:border-gray-700 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none text-sm text-gray-900 dark:text-white font-medium"
                >
                  <option value="">เลือกระดับชั้น</option>
                  {availableLevels.map((level) => (
                    <option key={level} value={level}>{level}</option>
                  ))}
                </select>
                <select
                  value={selectedRoom}
                  onChange={(e) => setSelectedRoom(e.target.value)}
                  className="w-full px-3 py-2.5 bg-white dark:bg-[#2a2b2f] border border-gray-200 dark:border-gray-700 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none text-sm text-gray-900 dark:text-white font-medium"
                >
                  <option value="">ทุกห้อง</option>
                  {Array.from({ length: 20 }, (_, i) => i + 1).map((r) => (
                    <option key={r} value={String(r)}>ห้อง {r}</option>
                  ))}
                </select>
              </div>
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
                      className={`relative rounded-2xl p-3.5 sm:p-4 border-2 transition-all duration-200 cursor-pointer active:scale-[0.98] min-w-0 ${
                        isSelected
                          ? "ring-2 ring-indigo-400 ring-offset-2 ring-offset-gray-50 dark:ring-offset-[#1e1f21]"
                          : "hover:shadow-lg"
                      } ${opt.cardClass}`}
                    >
                      {isSelected && (
                        <span className="absolute top-3 right-3 inline-flex items-center gap-1 rounded-full bg-indigo-600 px-2 py-0.5 text-[11px] font-bold text-white shadow-md z-10">
                          <FaCheck className="w-2.5 h-2.5" />
                          เลือกแล้ว
                        </span>
                      )}

                      <div className="flex flex-col gap-2.5 sm:gap-3">
                        {/* ส่วนหัว: รูปโปรไฟล์ + ชื่อ-นามสกุล และรหัส/เลขที่ — แสดงชื่อเต็มชัดเจน ไม่ถูกเบียดเป็น เด็... บนมือถือ */}
                        <div className="flex items-start gap-3 min-w-0 pr-16 sm:pr-20">
                          <div className="relative shrink-0">
                            <img
                              src={student.profileImageThumbUrl || student.profileImageUrl || `https://ui-avatars.com/api/?name=${encodeURIComponent(student.name)}&background=random`}
                              alt={student.name}
                              loading="lazy"
                              className="w-14 h-14 rounded-full object-cover object-[50%_18%] border-2 border-white dark:border-[#2a2b2f] shadow-sm"
                              onError={(e) => { (e.target as HTMLImageElement).src = `https://ui-avatars.com/api/?name=${encodeURIComponent(student.name)}&background=random`; }}
                            />
                            <span className={`absolute bottom-0 right-0 w-3.5 h-3.5 sm:w-4 sm:h-4 rounded-full border-2 border-white dark:border-[#2a2b2f] shadow-sm ${opt.dotClass}`} />
                          </div>
                          <div className="min-w-0 flex-1 text-left">
                            <p className="font-bold text-gray-900 dark:text-white text-sm sm:text-base leading-snug break-words" title={student.name}>
                              {student.name}
                            </p>
                            <div className="flex flex-wrap items-center gap-1.5 mt-1">
                              {student.number && (
                                <span className="inline-flex items-center px-1.5 py-0.5 rounded-md bg-black/5 dark:bg-white/10 font-mono text-[11px] text-gray-700 dark:text-gray-200 font-semibold">
                                  เลขที่ {student.number}
                                </span>
                              )}
                              <span className="inline-flex items-center px-1.5 py-0.5 rounded-md bg-black/5 dark:bg-white/10 font-mono text-[11px] text-gray-500 dark:text-gray-400">
                                รหัส {student.studentId}
                              </span>
                            </div>
                          </div>
                        </div>

                        {/* ปุ่มเช็คสถานะรายคน — เพิ่มความสูงให้กดง่ายขึ้นทั้งบนมือถือและคอม */}
                        <div className="w-full min-w-0 flex flex-col gap-2 pt-2.5 border-t border-black/5 dark:border-white/5" onClick={(e) => e.stopPropagation()}>
                          <div className="grid grid-cols-4 gap-2">
                            {STATUS_OPTIONS.filter((o) => o.value !== STATUS.ACTIVITY).map((statusOpt) => {
                              const isActive = student.status === statusOpt.value;
                              return (
                                <button
                                  key={statusOpt.value}
                                  type="button"
                                  title={statusOpt.label}
                                  onClick={() => setStudentStatus(student.id, statusOpt.value)}
                                  className={`flex min-w-0 items-center justify-center rounded-xl font-bold text-center py-3 sm:py-3.5 min-h-[44px] text-xs sm:text-sm transition-all duration-200 cursor-pointer active:scale-95 ${
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
                                className={`w-full flex min-w-0 items-center justify-center gap-2 rounded-xl font-bold py-2.5 sm:py-3 min-h-[40px] text-xs sm:text-sm transition-all duration-200 cursor-pointer active:scale-[0.99] ${
                                  isActive
                                    ? `${statusOpt.activeClass} ring-2 ring-offset-1 ring-offset-white dark:ring-offset-[#2a2b2f]`
                                    : "bg-white/50 dark:bg-black/20 text-gray-400 hover:bg-white dark:hover:bg-gray-700 hover:text-gray-600 dark:hover:text-gray-300"
                                }`}
                              >
                                <FaPlaneDeparture className="text-xs sm:text-sm shrink-0" />
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
