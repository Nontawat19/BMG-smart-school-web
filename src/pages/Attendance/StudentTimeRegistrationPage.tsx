import React, { useState, useEffect, useMemo } from "react";
import { useSelector } from "react-redux";
import { firestore } from "@/firebase";
import {
  collection,
  query,
  where,
  getDocs,
  getDoc,
  doc,
  writeBatch,
  serverTimestamp,
  Timestamp,
  increment,
  getCountFromServer,
  DocumentData,
  QueryDocumentSnapshot,
} from "firebase/firestore";
import { RootState } from "../../store";
import MainLayout from "@/layouts/MainLayout";
import BackButton from "@/components/Shared/BackButton";
import { FaUserClock, FaSave, FaUser, FaUsers, FaSchool } from "react-icons/fa";
import Swal from "sweetalert2";
import Select from "react-select";
import { useTheme } from "@/ThemeContext";
import { useEffectiveSchoolId } from "@/hooks/useEffectiveSchool";
import { isStudyingStudent, ACTIVE_STUDENT_STATUS_ALIASES } from "@/utils/studentStatusUtils";
import { getLevelsByRange, getEffectiveLevelRange } from "@/utils/schoolUtils";
import { updatePeriodSummaries } from "@/utils/periodSummaryUtils";
import { getStatusKey } from "./CheckinOutPage/utils";
import { sendLineAttendanceNotification } from "./CheckinOutPage/AttendanceLineNotify";

interface TargetStudent {
  id: string;
  name: string;
  displayId: string;
  classLevel: string;
  room: string;
  number: string;
  parentLineUserIds: string[];
  profileImageUrl: string;
  behaviorScore?: number;
  attendanceStats?: {
    present: number;
    late: number;
    leave: number;
    absent: number;
    noCheckout: number;
    officialTravel: number;
  };
}

interface StudentOption {
  value: string;
  label: string;
  data: TargetStudent;
}

type Scope = "individual" | "classroom" | "school";

const ROOM_OPTIONS = Array.from({ length: 20 }, (_, i) => String(i + 1));

const mapStudentDoc = (
  d: QueryDocumentSnapshot<DocumentData>
): TargetStudent => {
  const data: any = d.data() || {};
  return {
    id: d.id,
    name: `${data.prefix || data.title || ""}${data.firstName || ""} ${data.lastName || ""}`.trim(),
    displayId: data.studentId || data.number || d.id,
    classLevel: data.classLevel || "",
    room: data.room || "",
    number: data.number || data.studentNumber || "",
    parentLineUserIds: Array.isArray(data.parentLineUserIds) ? data.parentLineUserIds : [],
    profileImageUrl: data.profileImageUrl || "",
    behaviorScore: data.behaviorScore,
    attendanceStats: data.attendanceStats,
  };
};

const chunkArray = <T,>(arr: T[], size: number): T[][] => {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
};

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const READ_CHUNK_SIZE = 20;
const WRITE_CHUNK_SIZE = 60; // conservative: each student can touch up to ~7 writes (attendance + 4 period summaries + Todaysummary + attendanceStats)
const NOTIFY_CHUNK_SIZE = 10;

const StudentTimeRegistrationPage: React.FC = () => {
  const { user: currentUser } = useSelector((state: RootState) => state.auth);
  const schoolId = useEffectiveSchoolId();
  const { isDarkMode } = useTheme();
  const [schoolSettings, setSchoolSettings] = useState<any>(null);

  const [date, setDate] = useState(() => {
    const today = new Date();
    const year = today.getFullYear();
    const month = String(today.getMonth() + 1).padStart(2, "0");
    const day = String(today.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  });
  const [time, setTime] = useState("");
  const [note, setNote] = useState("");
  const [loading, setLoading] = useState(false);

  const [scope, setScope] = useState<Scope>("individual");

  // Individual scope
  const [students, setStudents] = useState<StudentOption[]>([]);
  const [fetchingStudents, setFetchingStudents] = useState(true);
  const [selectedStudent, setSelectedStudent] = useState<StudentOption | null>(null);

  // Classroom scope
  const [classLevel, setClassLevel] = useState("");
  const [room, setRoom] = useState("");
  const [classroomStudents, setClassroomStudents] = useState<TargetStudent[]>([]);
  const [selectedClassroomIds, setSelectedClassroomIds] = useState<Set<string>>(new Set());
  const [loadingClassroom, setLoadingClassroom] = useState(false);

  // School scope
  const [schoolStudentCount, setSchoolStudentCount] = useState<number | null>(null);
  const [loadingSchoolCount, setLoadingSchoolCount] = useState(false);

  useEffect(() => {
    if (!schoolId) return;
    const fetchInitial = async () => {
      setFetchingStudents(true);
      try {
        const [studentsSnap, configSnap] = await Promise.all([
          getDocs(collection(firestore, "school-settings", schoolId, "students")),
          getDoc(doc(firestore, "school-settings", schoolId)),
        ]);

        const options: StudentOption[] = studentsSnap.docs
          .filter((d) => isStudyingStudent(d.data()))
          .map((d) => {
            const s = mapStudentDoc(d);
            return {
              value: s.id,
              label: `${s.displayId} • ${s.name} (${s.classLevel}/${s.room})`,
              data: s,
            };
          })
          .sort((a, b) => a.label.localeCompare(b.label));
        setStudents(options);

        if (configSnap.exists()) {
          setSchoolSettings(configSnap.data());
        }
      } catch (error) {
        console.error("Error fetching students:", error);
        Swal.fire("ข้อผิดพลาด", "ไม่สามารถดึงรายชื่อนักเรียนได้", "error");
      } finally {
        setFetchingStudents(false);
      }
    };
    fetchInitial();
  }, [schoolId]);

  useEffect(() => {
    if (!schoolId || !classLevel) {
      setClassroomStudents([]);
      setSelectedClassroomIds(new Set());
      return;
    }
    const fetchClassroom = async () => {
      setLoadingClassroom(true);
      try {
        let q = query(
          collection(firestore, "school-settings", schoolId, "students"),
          where("classLevel", "==", classLevel)
        );
        if (room) q = query(q, where("room", "==", room));
        const snap = await getDocs(q);
        const list = snap.docs
          .filter((d) => isStudyingStudent(d.data()))
          .map(mapStudentDoc)
          .sort((a, b) => parseInt(a.number || "0", 10) - parseInt(b.number || "0", 10));
        setClassroomStudents(list);
        setSelectedClassroomIds(new Set(list.map((s) => s.id)));
      } catch (error) {
        console.error("Error fetching classroom students:", error);
      } finally {
        setLoadingClassroom(false);
      }
    };
    fetchClassroom();
  }, [schoolId, classLevel, room]);

  useEffect(() => {
    if (!schoolId || scope !== "school" || schoolStudentCount !== null) return;
    const fetchCount = async () => {
      setLoadingSchoolCount(true);
      try {
        const snap = await getCountFromServer(
          query(
            collection(firestore, "school-settings", schoolId, "students"),
            where("status", "in", ACTIVE_STUDENT_STATUS_ALIASES)
          )
        );
        setSchoolStudentCount(snap.data().count);
      } catch (error) {
        console.error("Error counting students:", error);
      } finally {
        setLoadingSchoolCount(false);
      }
    };
    fetchCount();
  }, [schoolId, scope, schoolStudentCount]);

  const availableClassLevels = useMemo(
    () =>
      getLevelsByRange(
        getEffectiveLevelRange(schoolSettings?.opportunityExpansionLevel, schoolSettings?.schoolType)
      ),
    [schoolSettings?.opportunityExpansionLevel, schoolSettings?.schoolType]
  );

  const toggleClassroomStudent = (id: string) => {
    setSelectedClassroomIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!schoolId) return;
    if (!date) {
      Swal.fire("กรุณาเลือกวันที่", "คุณต้องระบุวันที่", "warning");
      return;
    }
    if (!time) {
      Swal.fire("กรุณาระบุเวลา", "คุณต้องระบุเวลาที่กลับก่อน", "warning");
      return;
    }

    let targets: TargetStudent[] = [];

    if (scope === "individual") {
      if (!selectedStudent) {
        Swal.fire("กรุณาเลือกนักเรียน", "คุณต้องเลือกนักเรียนที่ต้องการบันทึก", "warning");
        return;
      }
      targets = [selectedStudent.data];
    } else if (scope === "classroom") {
      targets = classroomStudents.filter((s) => selectedClassroomIds.has(s.id));
      if (targets.length === 0) {
        Swal.fire("กรุณาเลือกนักเรียน", "คุณต้องเลือกนักเรียนอย่างน้อย 1 คน", "warning");
        return;
      }
      if (targets.length > 20) {
        const confirmResult = await Swal.fire({
          icon: "warning",
          title: `ยืนยันบันทึกให้นักเรียน ${targets.length} คน?`,
          text: `จะบันทึกสถานะ "กลับก่อน" (ไม่ตัดคะแนนพฤติกรรม) ให้นักเรียนที่เลือกทั้งหมด`,
          showCancelButton: true,
          confirmButtonText: "ดำเนินการต่อ",
          cancelButtonText: "ยกเลิก",
          confirmButtonColor: "#0d9488",
        });
        if (!confirmResult.isConfirmed) return;
      }
    } else {
      const confirmResult = await Swal.fire({
        icon: "warning",
        title: "ยืนยันบันทึกทั้งโรงเรียน?",
        text: "ระบบจะบันทึกสถานะ \"กลับก่อน\" (ไม่ตัดคะแนนพฤติกรรม) ให้นักเรียนทุกคนในโรงเรียนที่ยังไม่ได้ลงเวลาออกวันนี้ การกระทำนี้ส่งผลกว้างมาก โปรดตรวจสอบให้แน่ใจก่อนดำเนินการ",
        showCancelButton: true,
        confirmButtonText: "ดำเนินการต่อ",
        cancelButtonText: "ยกเลิก",
        confirmButtonColor: "#dc2626",
      });
      if (!confirmResult.isConfirmed) return;

      setLoading(true);
      try {
        const snap = await getDocs(collection(firestore, "school-settings", schoolId, "students"));
        targets = snap.docs.filter((d) => isStudyingStudent(d.data())).map(mapStudentDoc);
      } catch (error) {
        console.error("Error fetching school-wide students:", error);
        Swal.fire("ข้อผิดพลาด", "ไม่สามารถดึงรายชื่อนักเรียนทั้งโรงเรียนได้", "error");
        setLoading(false);
        return;
      }
    }

    setLoading(true);
    try {
      // 1. Read existing attendance docs for today to decide create/update/skip
      const readChunks = chunkArray(targets, READ_CHUNK_SIZE);
      const plans: { student: TargetStudent; action: "create" | "update" | "skip"; oldStatus: string | null }[] = [];
      for (const chunk of readChunks) {
        const results = await Promise.all(
          chunk.map(async (student) => {
            const attRef = doc(firestore, "school-settings", schoolId, "students", student.id, "attendance", date);
            const snap = await getDoc(attRef);
            if (!snap.exists()) return { student, action: "create" as const, oldStatus: null };
            const data = snap.data();
            if (data.checkoutTime) return { student, action: "skip" as const, oldStatus: data.status || null };
            return { student, action: "update" as const, oldStatus: data.status || null };
          })
        );
        plans.push(...results);
      }

      const toProcess = plans.filter((p) => p.action !== "skip");
      const skippedCount = plans.length - toProcess.length;

      // 2. Write in batches (kept well under the 500-write Firestore limit)
      const dateObj = new Date(`${date}T${time}:00`);
      const timestamp = Timestamp.fromDate(dateObj);
      const academicYear = String(new Date().getFullYear() + 543);
      const approvedBy = currentUser?.fullName || currentUser?.email || currentUser?.uid || "system";

      const writeChunks = chunkArray(toProcess, WRITE_CHUNK_SIZE);
      for (const chunk of writeChunks) {
        const batch = writeBatch(firestore);
        for (const { student, action, oldStatus } of chunk) {
          const attRef = doc(firestore, "school-settings", schoolId, "students", student.id, "attendance", date);
          if (action === "update") {
            batch.set(
              attRef,
              {
                status: "กลับก่อน",
                checkoutTime: timestamp,
                earlyLeaveApproved: true,
                approvedBy,
                approvedNote: note || null,
                updatedAt: serverTimestamp(),
              },
              { merge: true }
            );
          } else {
            batch.set(attRef, {
              schoolId,
              date,
              userType: "student",
              classLevel: student.classLevel || "",
              checkinTime: timestamp,
              checkoutTime: timestamp,
              status: "กลับก่อน",
              scanType: "manual_early_leave",
              earlyLeaveApproved: true,
              approvedBy,
              approvedNote: note || null,
              createdAt: serverTimestamp(),
              updatedAt: serverTimestamp(),
            });
          }

          updatePeriodSummaries(
            firestore,
            batch,
            schoolId,
            student.id,
            "students",
            date,
            oldStatus,
            "กลับก่อน",
            student.classLevel || "",
            academicYear
          );

          const oldKey = getStatusKey(oldStatus || "");
          const newKey = getStatusKey("กลับก่อน");
          if (oldKey !== newKey) {
            const statsUpdate: Record<string, any> = {};
            if (oldKey) statsUpdate[`attendanceStats.${oldKey}`] = increment(-1);
            if (newKey) statsUpdate[`attendanceStats.${newKey}`] = increment(1);
            if (Object.keys(statsUpdate).length > 0) {
              const studentRef = doc(firestore, "school-settings", schoolId, "students", student.id);
              batch.set(studentRef, statsUpdate, { merge: true });
            }
          }
        }
        await batch.commit();
      }

      // 3. LINE notifications to parents — throttled to avoid bursting the multicast function
      let notifiedCount = 0;
      const lineConfig = schoolSettings?.lineOASettings?.school;
      if (lineConfig?.lineChannelAccessToken && lineConfig?.enableNotification !== false) {
        const notifyChunks = chunkArray(toProcess, NOTIFY_CHUNK_SIZE);
        for (const chunk of notifyChunks) {
          const results = await Promise.allSettled(
            chunk.map(({ student }) => {
              const parentIds = (student.parentLineUserIds || []).filter(Boolean);
              if (parentIds.length === 0) return Promise.resolve();
              return sendLineAttendanceNotification(
                {
                  id: student.id,
                  type: "student",
                  name: student.name,
                  profileImageUrl: student.profileImageUrl || "",
                  displayId: student.displayId,
                  grade: student.classLevel,
                  room: student.room,
                  parentLineUserIds: student.parentLineUserIds,
                  behaviorScore: student.behaviorScore,
                  attendanceStats: student.attendanceStats,
                },
                "กลับก่อน",
                time,
                lineConfig,
                parentIds,
                "checkout"
              );
            })
          );
          notifiedCount += results.filter((r) => r.status === "fulfilled").length;
          await sleep(300);
        }
      }

      await Swal.fire({
        icon: "success",
        title: "บันทึกสำเร็จ",
        html:
          `บันทึก "กลับก่อน" ให้นักเรียน <b>${toProcess.length}</b> คน (ไม่ตัดคะแนนพฤติกรรม)<br/>` +
          (skippedCount > 0 ? `ข้าม ${skippedCount} คน (ลงเวลาออกไปแล้ว)<br/>` : "") +
          (notifiedCount > 0 ? `แจ้งเตือน LINE ผู้ปกครองสำเร็จ ${notifiedCount} คน` : ""),
      });

      setSelectedStudent(null);
      setClassroomStudents([]);
      setSelectedClassroomIds(new Set());
      setSchoolStudentCount(null);
      setNote("");
      setTime("");
    } catch (error) {
      console.error("Error saving early leave:", error);
      Swal.fire("ข้อผิดพลาด", "ไม่สามารถบันทึกข้อมูลได้ กรุณาลองใหม่อีกครั้ง", "error");
    } finally {
      setLoading(false);
    }
  };

  const selectStyles = {
    control: (base: any, state: any) => ({
      ...base,
      backgroundColor: isDarkMode ? "#1e1f21" : "#ffffff",
      borderColor: state.isFocused ? "#0d9488" : isDarkMode ? "#374151" : "#e5e7eb",
      borderRadius: "0.375rem",
      padding: "2px",
      boxShadow: "none",
      "&:hover": { borderColor: isDarkMode ? "#4b5563" : "#d1d5db" },
    }),
    menu: (base: any) => ({
      ...base,
      backgroundColor: isDarkMode ? "#2a2b2f" : "#ffffff",
      borderColor: isDarkMode ? "#374151" : "#e5e7eb",
      borderRadius: "0.375rem",
      overflow: "hidden",
      zIndex: 50,
    }),
    option: (base: any, state: any) => ({
      ...base,
      backgroundColor: state.isSelected ? "#0d9488" : state.isFocused ? (isDarkMode ? "#374151" : "#f3f4f6") : "transparent",
      color: state.isSelected ? "#ffffff" : isDarkMode ? "#e5e7eb" : "#1f2937",
      "&:active": { backgroundColor: "#0d9488" },
    }),
    singleValue: (base: any) => ({ ...base, color: isDarkMode ? "#ffffff" : "#1f2937" }),
    input: (base: any) => ({ ...base, color: isDarkMode ? "#ffffff" : "#1f2937" }),
    placeholder: (base: any) => ({ ...base, color: "#9ca3af" }),
  };

  const scopeTabs: { key: Scope; label: string; icon: React.ReactNode }[] = [
    { key: "individual", label: "รายบุคคล", icon: <FaUser /> },
    { key: "classroom", label: "รายห้อง", icon: <FaUsers /> },
    { key: "school", label: "ทั้งโรงเรียน", icon: <FaSchool /> },
  ];

  return (
    <MainLayout>
      <div className="min-h-screen bg-gray-50 dark:bg-[#1e1f21] transition-colors duration-300 p-4 sm:p-6 lg:p-8">
        <div className="max-w-4xl mx-auto">
          <div className="flex flex-col md:flex-row md:items-center gap-4 mb-6">
            <BackButton to="/academic/hub/attendance" />
            <div>
              <h1 className="text-2xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
                <FaUserClock className="text-teal-600 dark:text-teal-400" />
                อนุญาตกลับก่อน (ไม่ตัดคะแนนพฤติกรรม)
              </h1>
              <p className="text-gray-500 dark:text-gray-400 text-sm mt-1">
                บันทึกอนุญาตให้นักเรียนกลับก่อนเวลาโดยไม่ตัดคะแนนพฤติกรรม เลือกได้ทั้งรายบุคคล รายห้อง หรือทั้งโรงเรียน (เช่น กรณีหยุดครึ่งวัน)
              </p>
            </div>
          </div>

          <div className="bg-white dark:bg-[#2a2b2f] rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 overflow-hidden">
            <form onSubmit={handleSubmit} className="p-5">
              {/* Scope tabs */}
              <div className="flex gap-2 mb-5 border-b border-gray-200 dark:border-gray-700 pb-4">
                {scopeTabs.map((tab) => (
                  <button
                    key={tab.key}
                    type="button"
                    onClick={() => setScope(tab.key)}
                    className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                      scope === tab.key
                        ? "bg-teal-600 text-white shadow-sm"
                        : "bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700"
                    }`}
                  >
                    {tab.icon}
                    {tab.label}
                  </button>
                ))}
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                {scope === "individual" && (
                  <div className="col-span-1 md:col-span-2">
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">นักเรียน</label>
                    <Select
                      options={students}
                      value={selectedStudent}
                      onChange={(option) => setSelectedStudent(option as StudentOption | null)}
                      placeholder={fetchingStudents ? "กำลังโหลดรายชื่อ..." : "ใส่รหัสหรือชื่อนามสกุล"}
                      isClearable
                      isSearchable
                      isDisabled={fetchingStudents}
                      noOptionsMessage={() => "ไม่พบรายชื่อ"}
                      classNamePrefix="react-select"
                      styles={selectStyles}
                    />
                  </div>
                )}

                {scope === "classroom" && (
                  <div className="col-span-1 md:col-span-2 space-y-3">
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">ระดับชั้น</label>
                        <select
                          value={classLevel}
                          onChange={(e) => setClassLevel(e.target.value)}
                          className="w-full px-4 py-2 rounded-md border border-gray-200 dark:border-gray-700 bg-white dark:bg-[#1e1f21] text-gray-900 dark:text-white focus:ring-2 focus:ring-teal-500 outline-none"
                        >
                          <option value="">เลือก...</option>
                          {availableClassLevels.map((c) => (
                            <option key={c} value={c}>{c}</option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">ห้อง</label>
                        <select
                          value={room}
                          onChange={(e) => setRoom(e.target.value)}
                          className="w-full px-4 py-2 rounded-md border border-gray-200 dark:border-gray-700 bg-white dark:bg-[#1e1f21] text-gray-900 dark:text-white focus:ring-2 focus:ring-teal-500 outline-none"
                        >
                          <option value="">ทุกห้อง</option>
                          {ROOM_OPTIONS.map((r) => (
                            <option key={r} value={r}>ห้อง {r}</option>
                          ))}
                        </select>
                      </div>
                    </div>

                    <div className="border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden">
                      <div className="bg-gray-50 dark:bg-gray-800/50 px-3 py-2 flex justify-between items-center border-b border-gray-200 dark:border-gray-700">
                        <span className="text-xs font-bold text-gray-500 dark:text-gray-400">
                          เลือก {selectedClassroomIds.size} / {classroomStudents.length} คน
                        </span>
                        {classroomStudents.length > 0 && (
                          <label className="flex items-center gap-1 cursor-pointer text-xs text-gray-400 hover:text-teal-500 font-bold">
                            <input
                              type="checkbox"
                              checked={selectedClassroomIds.size === classroomStudents.length}
                              onChange={(e) =>
                                setSelectedClassroomIds(
                                  e.target.checked ? new Set(classroomStudents.map((s) => s.id)) : new Set()
                                )
                              }
                            />
                            ทั้งหมด
                          </label>
                        )}
                      </div>
                      <div className="max-h-56 overflow-y-auto">
                        {loadingClassroom ? (
                          <p className="text-center py-6 text-xs text-gray-400">กำลังโหลด...</p>
                        ) : classroomStudents.length === 0 ? (
                          <p className="text-center py-6 text-xs text-gray-400">
                            {classLevel ? "ไม่พบนักเรียนในห้องนี้" : "เลือกระดับชั้นก่อน"}
                          </p>
                        ) : (
                          classroomStudents.map((s) => (
                            <label
                              key={s.id}
                              className={`flex items-center gap-2.5 px-3 py-2 cursor-pointer border-b border-gray-100 dark:border-gray-800 hover:bg-gray-50 dark:hover:bg-gray-800/50 ${
                                selectedClassroomIds.has(s.id) ? "bg-teal-50 dark:bg-teal-500/10" : ""
                              }`}
                            >
                              <input
                                type="checkbox"
                                checked={selectedClassroomIds.has(s.id)}
                                onChange={() => toggleClassroomStudent(s.id)}
                              />
                              <span className="text-xs text-gray-500 w-6 shrink-0">{s.number || "-"}</span>
                              <span className="text-sm text-gray-900 dark:text-white truncate">
                                {s.name} <span className="text-xs text-gray-400">({s.displayId})</span>
                              </span>
                            </label>
                          ))
                        )}
                      </div>
                    </div>
                  </div>
                )}

                {scope === "school" && (
                  <div className="col-span-1 md:col-span-2 p-4 rounded-lg bg-amber-50 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-500/30 text-sm text-amber-800 dark:text-amber-300">
                    จะบันทึกสถานะ "กลับก่อน" ให้นักเรียน{loadingSchoolCount ? "..." : schoolStudentCount !== null ? ` ประมาณ ${schoolStudentCount} คน` : "ทุกคน"} ในโรงเรียนที่ยังไม่ได้ลงเวลาออกวันนี้ โดยไม่ตัดคะแนนพฤติกรรม ระบบจะขอให้ยืนยันอีกครั้งก่อนดำเนินการจริง
                  </div>
                )}

                <div className="col-span-1">
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">วันที่</label>
                  <input
                    type="date"
                    required
                    value={date}
                    onChange={(e) => setDate(e.target.value)}
                    className="w-full px-4 py-2 rounded-md border border-gray-200 dark:border-gray-700 bg-white dark:bg-[#1e1f21] text-gray-900 dark:text-white focus:ring-2 focus:ring-teal-500 outline-none"
                  />
                </div>

                <div className="col-span-1">
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">เวลาที่กลับก่อน</label>
                  <input
                    type="time"
                    required
                    value={time}
                    onChange={(e) => setTime(e.target.value)}
                    className="w-full px-4 py-2 rounded-md border border-gray-200 dark:border-gray-700 bg-white dark:bg-[#1e1f21] text-gray-900 dark:text-white focus:ring-2 focus:ring-teal-500 outline-none"
                  />
                </div>

                <div className="col-span-1">
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">ผู้บันทึก</label>
                  <input
                    type="text"
                    readOnly
                    value={currentUser?.fullName || currentUser?.email || "System User"}
                    className="w-full px-4 py-2 rounded-md border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-[#2a2b2f] text-gray-500 dark:text-gray-400 outline-none cursor-not-allowed"
                  />
                </div>

                <div className="col-span-1 md:col-span-2">
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">เหตุผล / หมายเหตุ</label>
                  <textarea
                    rows={2}
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                    placeholder="เช่น หยุดครึ่งวันกรณี..."
                    className="w-full px-4 py-2 rounded-md border border-gray-200 dark:border-gray-700 bg-white dark:bg-[#1e1f21] text-gray-900 dark:text-white focus:ring-2 focus:ring-teal-500 outline-none resize-none"
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

export default StudentTimeRegistrationPage;
