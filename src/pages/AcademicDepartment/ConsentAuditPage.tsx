import React, { useEffect, useState, useMemo } from "react";
import MainLayout from "@/layouts/MainLayout";
import BackButton from "@/components/Shared/BackButton";
import { functions, firestore } from "@/firebase";
import { httpsCallable } from "firebase/functions";
import { collection, getDocs, query, where } from "firebase/firestore";
import { useSchoolScope } from "@/hooks/useEffectiveSchool";
import { useSelector } from "react-redux";
import { RootState } from "@/store";
import {
  FaShieldAlt,
  FaUserTie,
  FaUserGraduate,
  FaUsers,
  FaRedo,
  FaSearch,
  FaCheckCircle,
  FaTimesCircle,
  FaExclamationCircle,
  FaClock,
} from "react-icons/fa";

interface AuditPerson {
  id: string;
  name: string;
  classLevel?: string;
  room?: string;
  studentId?: string;
  idCardNumber?: string;
  acceptedAt?: string | null;
}

interface AuditGroup {
  total: number;
  accepted: number;
  acceptedList?: AuditPerson[];
  pending: AuditPerson[];
  acceptedTruncated?: boolean;
  pendingTruncated?: boolean;
}

interface AuditResult {
  schoolId: string;
  teachers: AuditGroup;
  students: AuditGroup;
  parentsAcceptedCount: number;
}

type ViewFilter = "accepted" | "pending" | "all";

const StatCard: React.FC<{
  icon: React.ReactNode;
  label: string;
  accepted: number;
  total: number;
  colorClass: string;
  barColor: string;
}> = ({ icon, label, accepted, total, colorClass, barColor }) => {
  const percent = total > 0 ? Math.round((accepted / total) * 100) : 0;
  const pendingCount = Math.max(0, total - accepted);

  return (
    <div className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm transition hover:shadow-md dark:border-gray-800 dark:bg-[#242529]">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-xl ${colorClass}`}>
            {icon}
          </div>
          <div className="min-w-0">
            <p className="text-xs font-bold text-gray-500 dark:text-gray-400">{label}</p>
            <p className="text-2xl font-black text-gray-900 dark:text-white">
              {accepted.toLocaleString()}/{total.toLocaleString()}{" "}
              <span className="text-sm font-bold text-gray-400 dark:text-gray-500">
                ({percent}%)
              </span>
            </p>
          </div>
        </div>
        <div
          className={`flex h-8 items-center gap-1 rounded-full px-2.5 text-xs font-black ${
            percent === 100
              ? "bg-emerald-50 text-emerald-600 dark:bg-emerald-500/10 dark:text-emerald-400"
              : percent > 50
              ? "bg-blue-50 text-blue-600 dark:bg-blue-500/10 dark:text-blue-400"
              : "bg-amber-50 text-amber-600 dark:bg-amber-500/10 dark:text-amber-400"
          }`}
        >
          {percent === 100 ? (
            <>
              <FaCheckCircle size={12} /> ครบ 100%
            </>
          ) : (
            `${percent}%`
          )}
        </div>
      </div>

      <div className="mt-4 h-2 w-full overflow-hidden rounded-full bg-gray-100 dark:bg-gray-800">
        <div
          className={`h-full rounded-full transition-all duration-700 ${barColor}`}
          style={{ width: `${Math.min(100, Math.max(0, percent))}%` }}
        />
      </div>

      <div className="mt-2 flex items-center justify-between text-[11px] font-medium text-gray-400 dark:text-gray-500">
        <span className="font-bold text-emerald-600 dark:text-emerald-400">
          ยอมรับแล้ว {accepted.toLocaleString()} คน
        </span>
        <span className="text-gray-400 dark:text-gray-500">
          ยังไม่ยอมรับ {pendingCount.toLocaleString()} คน
        </span>
      </div>
    </div>
  );
};

const PersonTable: React.FC<{
  title: string;
  icon: React.ReactNode;
  group: AuditGroup;
  viewFilter: ViewFilter;
  showClass?: boolean;
}> = ({ title, icon, group, viewFilter, showClass }) => {
  const [searchTerm, setSearchTerm] = useState("");

  const acceptedList = useMemo(() => group.acceptedList || [], [group.acceptedList]);
  const pendingList = useMemo(() => group.pending || [], [group.pending]);

  const displayedList = useMemo(() => {
    let list: (AuditPerson & { isAccepted: boolean })[] = [];
    if (viewFilter === "accepted") {
      list = acceptedList.map((p) => ({ ...p, isAccepted: true }));
    } else if (viewFilter === "pending") {
      list = pendingList.map((p) => ({ ...p, isAccepted: false }));
    } else {
      list = [
        ...acceptedList.map((p) => ({ ...p, isAccepted: true })),
        ...pendingList.map((p) => ({ ...p, isAccepted: false })),
      ];
    }

    if (!searchTerm.trim()) return list;
    const q = searchTerm.toLowerCase().trim();
    return list.filter((p) => {
      const nameMatch = p.name.toLowerCase().includes(q);
      const classMatch = showClass && `${p.classLevel}/${p.room}`.toLowerCase().includes(q);
      const idMatch =
        p.studentId?.toLowerCase().includes(q) ||
        p.idCardNumber?.toLowerCase().includes(q);
      return nameMatch || classMatch || idMatch;
    });
  }, [acceptedList, pendingList, viewFilter, searchTerm, showClass]);

  const formatAcceptedDate = (dateStr?: string | null) => {
    if (!dateStr) return null;
    try {
      const d = new Date(dateStr);
      return d.toLocaleDateString("th-TH", {
        year: "numeric",
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      });
    } catch {
      return null;
    }
  };

  return (
    <div className="flex flex-col rounded-2xl border border-gray-100 bg-white shadow-sm dark:border-gray-800 dark:bg-[#242529]">
      <div className="flex flex-col gap-3 border-b border-gray-100 p-4 sm:flex-row sm:items-center sm:justify-between dark:border-gray-800">
        <div className="flex items-center gap-2">
          {icon}
          <div>
            <h2 className="text-sm font-black text-gray-800 dark:text-gray-100">
              {title} — {viewFilter === "accepted" ? "ยอมรับแล้ว" : viewFilter === "pending" ? "ยังไม่ยอมรับ" : "รายชื่อทั้งหมด"}
            </h2>
            <p className="text-[11px] text-gray-400 dark:text-gray-500">
              {displayedList.length.toLocaleString()} รายการ
              {viewFilter === "accepted" && group.acceptedTruncated ? " (แสดงสูงสุด 500 รายชื่อ)" : ""}
              {viewFilter === "pending" && group.pendingTruncated ? " (แสดงสูงสุด 500 รายชื่อ)" : ""}
            </p>
          </div>
        </div>

        <div className="relative min-w-[200px]">
          <FaSearch
            size={12}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 dark:text-gray-500"
          />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="ค้นหาชื่อ, ชั้น..."
            className="w-full rounded-xl border border-gray-200 bg-gray-50 py-1.5 pl-8 pr-7 text-xs text-gray-900 placeholder-gray-400 transition focus:border-indigo-500 focus:bg-white focus:outline-none dark:border-gray-700 dark:bg-[#1e1f21] dark:text-white dark:placeholder-gray-500 dark:focus:border-indigo-400 dark:focus:bg-[#1a1b1e]"
          />
          {searchTerm && (
            <button
              type="button"
              onClick={() => setSearchTerm("")}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
            >
              <FaTimesCircle size={12} />
            </button>
          )}
        </div>
      </div>

      {displayedList.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-12 text-center">
          {viewFilter === "accepted" ? (
            <>
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-gray-100 text-gray-400 dark:bg-gray-800 dark:text-gray-500">
                <FaClock size={20} />
              </div>
              <p className="mt-3 text-sm font-bold text-gray-750 dark:text-gray-300">
                ยังไม่มีผู้กดยอมรับนโยบาย
              </p>
              <p className="mt-1 text-xs text-gray-400 dark:text-gray-500">
                เมื่อมีผู้กดยอมรับในระบบ รายชื่อจะปรากฏในตารางนี้
              </p>
            </>
          ) : viewFilter === "pending" ? (
            <>
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-emerald-50 text-emerald-500 dark:bg-emerald-500/10 dark:text-emerald-400">
                <FaCheckCircle size={22} />
              </div>
              <p className="mt-3 text-sm font-bold text-gray-700 dark:text-gray-200">
                ยอมรับครบทุกคนแล้ว 🎉
              </p>
              <p className="mt-1 text-xs text-gray-400 dark:text-gray-500">
                ไม่มีรายชื่อค้างที่ยังไม่ยอมรับนโยบาย
              </p>
            </>
          ) : (
            <p className="text-xs text-gray-400 dark:text-gray-500">
              ไม่พบรายชื่อที่ตรงกับคำค้นหา "{searchTerm}"
            </p>
          )}
        </div>
      ) : (
        <div className="max-h-96 overflow-y-auto">
          <table className="w-full text-left text-xs">
            <thead className="sticky top-0 z-10 bg-gray-50/95 backdrop-blur-sm dark:bg-[#1e1f21]/95">
              <tr className="border-b border-gray-100 text-gray-500 dark:border-gray-800 dark:text-gray-400">
                <th className="w-12 px-4 py-2.5 font-bold">#</th>
                <th className="px-4 py-2.5 font-bold">ชื่อ - นามสกุล</th>
                {showClass && <th className="px-4 py-2.5 font-bold">ระดับชั้น/ห้อง</th>}
                <th className="px-4 py-2.5 font-bold">สถานะ</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
              {displayedList.map((p, idx) => {
                const dateText = formatAcceptedDate(p.acceptedAt);
                return (
                  <tr
                    key={p.id || idx}
                    className="transition hover:bg-gray-50/80 dark:hover:bg-white/[0.02]"
                  >
                    <td className="px-4 py-2.5 text-gray-400 dark:text-gray-500">{idx + 1}</td>
                    <td className="px-4 py-2.5 font-medium text-gray-850 dark:text-gray-200">
                      <div className="flex flex-col">
                        <span>{p.name}</span>
                        {dateText && (
                          <span className="text-[10px] text-gray-400 dark:text-gray-500">
                            ยอมรับเมื่อ {dateText}
                          </span>
                        )}
                      </div>
                    </td>
                    {showClass && (
                      <td className="px-4 py-2.5">
                        {p.classLevel ? (
                          <span className="inline-flex items-center rounded-lg bg-indigo-50 px-2 py-0.5 text-[11px] font-bold text-indigo-600 dark:bg-indigo-500/10 dark:text-indigo-400">
                            {p.classLevel}{p.room ? `/${p.room}` : ""}
                          </span>
                        ) : (
                          <span className="text-gray-400 dark:text-gray-500">-</span>
                        )}
                      </td>
                    )}
                    <td className="px-4 py-2.5">
                      {p.isAccepted ? (
                        <span className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-50 px-2.5 py-1 text-[11px] font-bold text-emerald-600 dark:bg-emerald-500/10 dark:text-emerald-400">
                          <FaCheckCircle size={10} /> ยอมรับแล้ว
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1.5 rounded-lg bg-amber-50 px-2.5 py-1 text-[11px] font-bold text-amber-600 dark:bg-amber-500/10 dark:text-amber-400">
                          <FaClock size={10} /> ยังไม่ยอมรับ
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

// ฟังก์ชันดึงข้อมูลตรงจาก Firestore สำหรับกรณี Cloud Functions ล้มเหลวหรือช้า
const fetchStatsDirectly = async (schoolId: string): Promise<AuditResult> => {
  const [teachersSnap, studentsSnap, consentsSnap] = await Promise.all([
    getDocs(collection(firestore, "school-settings", schoolId, "teachers")),
    getDocs(collection(firestore, "school-settings", schoolId, "students")),
    getDocs(query(collection(firestore, "consents"), where("schoolId", "==", schoolId))),
  ]);

  const consentById = new Set<string>();
  const consentByKey = new Map<string, any>();
  consentsSnap.docs.forEach((d) => {
    const c = d.data();
    if (d.id) consentById.add(d.id);
    if (c.refId) consentById.add(String(c.refId));
    if (c.userType && c.refId) consentByKey.set(`${c.userType}_${c.refId}`, c);
    if (c.userType && d.id) consentByKey.set(`${c.userType}_${d.id}`, c);
  });

  const MAX_LISTED = 500;

  const teacherRows = teachersSnap.docs.map((d) => {
    const t = d.data();
    return {
      id: d.id,
      uid: t.uid || null,
      userId: t.userId || null,
      teacherId: t.teacherId || null,
      name: `${t.title || ""}${t.firstName || ""} ${t.lastName || ""}`.trim() || d.id,
    };
  });

  const teacherAccepted: AuditPerson[] = [];
  const teacherPending: AuditPerson[] = [];

  teacherRows.forEach((t) => {
    const keys = [
      t.id && `teacher_${t.id}`,
      t.uid && `teacher_${t.uid}`,
      t.userId && `teacher_${t.userId}`,
      t.teacherId && `teacher_${t.teacherId}`,
    ].filter(Boolean) as string[];

    const consentDoc = keys.map((k) => consentByKey.get(k)).find(Boolean);
    const hasId =
      (t.id && consentById.has(t.id)) ||
      (t.uid && consentById.has(t.uid)) ||
      (t.userId && consentById.has(t.userId)) ||
      (t.teacherId && consentById.has(t.teacherId));

    if (consentDoc || hasId) {
      teacherAccepted.push({
        id: t.id,
        name: t.name,
        acceptedAt: consentDoc?.acceptedAt
          ? (consentDoc.acceptedAt.toDate ? consentDoc.acceptedAt.toDate().toISOString() : String(consentDoc.acceptedAt))
          : null,
      });
    } else {
      teacherPending.push({ id: t.id, name: t.name });
    }
  });

  const inactiveStatuses = [
    "graduated",
    "transferred",
    "dropped",
    "dismissed",
    "ลาออก",
    "จบการศึกษา",
    "ย้ายโรงเรียน",
    "พ้นสภาพ",
    "จำหน่าย",
    "จำหน่ายชื่อออก",
  ];

  const studentRows = studentsSnap.docs
    .map((d) => ({ id: d.id, ...d.data() } as any))
    .filter(
      (s) =>
        !inactiveStatuses.includes(
          String(s.status || s.studentStatus || "").toLowerCase().trim()
        )
    )
    .map((s) => ({
      id: s.id,
      studentId: s.studentId || null,
      idCardNumber: s.idCardNumber || null,
      name: `${s.title || ""}${s.firstName || ""} ${s.lastName || ""}`.trim() || s.id,
      classLevel: s.classLevel || s.level || "",
      room: s.room || s.roomNumber || "",
    }));

  const studentAccepted: AuditPerson[] = [];
  const studentPending: AuditPerson[] = [];

  studentRows.forEach((s) => {
    const keys = [
      s.id && `student_${s.id}`,
      s.studentId && `student_${s.studentId}`,
      s.idCardNumber && `student_${s.idCardNumber}`,
    ].filter(Boolean) as string[];

    const consentDoc = keys.map((k) => consentByKey.get(k)).find(Boolean);
    const hasId =
      (s.id && consentById.has(s.id)) ||
      (s.studentId && consentById.has(s.studentId)) ||
      (s.idCardNumber && consentById.has(s.idCardNumber));

    if (consentDoc || hasId) {
      studentAccepted.push({
        id: s.id,
        name: s.name,
        classLevel: s.classLevel,
        room: s.room,
        acceptedAt: consentDoc?.acceptedAt
          ? (consentDoc.acceptedAt.toDate ? consentDoc.acceptedAt.toDate().toISOString() : String(consentDoc.acceptedAt))
          : null,
      });
    } else {
      studentPending.push({
        id: s.id,
        name: s.name,
        classLevel: s.classLevel,
        room: s.room,
      });
    }
  });

  return {
    schoolId,
    teachers: {
      total: teacherRows.length,
      accepted: teacherAccepted.length,
      acceptedList: teacherAccepted.slice(0, MAX_LISTED),
      pending: teacherPending.slice(0, MAX_LISTED),
      acceptedTruncated: teacherAccepted.length > MAX_LISTED,
      pendingTruncated: teacherPending.length > MAX_LISTED,
    },
    students: {
      total: studentRows.length,
      accepted: studentAccepted.length,
      acceptedList: studentAccepted.slice(0, MAX_LISTED),
      pending: studentPending.slice(0, MAX_LISTED),
      acceptedTruncated: studentAccepted.length > MAX_LISTED,
      pendingTruncated: studentPending.length > MAX_LISTED,
    },
    parentsAcceptedCount: consentsSnap.docs.filter(
      (d) => d.data().userType === "parent"
    ).length,
  };
};

const ConsentAuditPage: React.FC = () => {
  const { effectiveSchoolId, activeSchoolName } = useSchoolScope();
  const authUser = useSelector((state: RootState) => state.auth.user);
  const isAuthLoading = useSelector((state: RootState) => state.auth.loading);

  const [data, setData] = useState<AuditResult | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // สลับการแสดงผลระหว่าง "คนที่ยอมรับแล้ว" (ค่าเริ่มต้น), "คนที่ยังไม่ยอมรับ", "ทั้งหมด"
  const [viewFilter, setViewFilter] = useState<ViewFilter>("accepted");

  const fetchStats = async () => {
    let targetSchoolId = effectiveSchoolId || authUser?.homeSchoolId || authUser?.schoolId;
    if (!targetSchoolId) {
      try {
        const schoolsSnap = await getDocs(collection(firestore, "school-settings"));
        if (!schoolsSnap.empty) {
          targetSchoolId = schoolsSnap.docs[0].id;
        }
      } catch (e) {
        console.warn("Cannot find default school:", e);
      }
    }
    if (!targetSchoolId) return;

    setIsLoading(true);
    setError(null);

    // ลำดับที่ 1: เรียก Cloud Function getConsentAuditStats
    try {
      const getConsentAuditStats = httpsCallable(functions, "getConsentAuditStats");
      const result = await getConsentAuditStats({ schoolId: targetSchoolId });
      if (result.data) {
        setData(result.data as AuditResult);
        setIsLoading(false);
        return;
      }
    } catch (fnErr: any) {
      console.warn("Cloud function getConsentAuditStats failed, falling back to direct Firestore fetch:", fnErr);
    }

    // ลำดับที่ 2: ถ้า Cloud Function ยังไม่พร้อม ให้ fallback อ่านจาก Firestore ตรง
    try {
      const directResult = await fetchStatsDirectly(targetSchoolId);
      setData(directResult);
    } catch (directErr: any) {
      console.error("Direct fetch also failed:", directErr);
      setError(directErr?.message || "เกิดข้อผิดพลาดในการดึงข้อมูลสถิติ");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (!isAuthLoading) {
      fetchStats();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [effectiveSchoolId, authUser?.homeSchoolId, authUser?.schoolId, isAuthLoading]);

  return (
    <MainLayout>
      <div className="min-h-screen bg-gray-50 px-4 py-6 dark:bg-[#15161a] sm:px-6 lg:py-8">
        <div className="mx-auto max-w-5xl space-y-6">
          {/* Header */}
          <div className="flex flex-col gap-4 rounded-2xl border border-gray-100 bg-white p-5 shadow-sm dark:border-gray-800 dark:bg-[#242529] lg:flex-row lg:items-center lg:justify-between">
            <div className="flex min-w-0 flex-1 items-center gap-4">
              <BackButton to="/academic/hub/settings" />
              <div className="min-w-0">
                <h1 className="flex items-center gap-3 text-2xl font-black tracking-tight text-gray-900 dark:text-white">
                  <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-100 text-indigo-600 dark:bg-indigo-500/10 dark:text-indigo-300">
                    <FaShieldAlt size={18} />
                  </span>
                  สถิติการยอมรับนโยบาย
                </h1>
                <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                  {activeSchoolName ? (
                    <span className="mr-1.5 font-bold text-indigo-600 dark:text-indigo-400">
                      [{activeSchoolName}]
                    </span>
                  ) : null}
                  ตรวจสอบว่าครู/บุคลากรและนักเรียนในโรงเรียนยอมรับนโยบายความเป็นส่วนตัวและข้อกำหนดการใช้บริการครบแล้วหรือยัง
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={fetchStats}
              disabled={isLoading}
              className="inline-flex items-center justify-center gap-2 rounded-xl border border-gray-200 bg-gray-50 px-4 py-2.5 text-xs font-bold text-gray-700 transition hover:bg-gray-100 disabled:opacity-50 dark:border-gray-700 dark:bg-[#1e1f21] dark:text-gray-300 dark:hover:bg-gray-800"
            >
              <FaRedo size={12} className={isLoading ? "animate-spin" : ""} />
              รีเฟรชข้อมูล
            </button>
          </div>

          {/* Error Notice */}
          {error && (
            <div className="flex items-start gap-3 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700 dark:border-red-800/60 dark:bg-red-950/20 dark:text-red-300">
              <FaExclamationCircle size={18} className="mt-0.5 shrink-0 text-red-500" />
              <div>
                <p className="font-bold">ไม่สามารถดึงข้อมูลได้</p>
                <p className="text-xs opacity-90">{error}</p>
              </div>
            </div>
          )}

          {/* Loading or Data */}
          {isLoading && !data ? (
            <div className="flex flex-col items-center justify-center py-24">
              <div className="h-10 w-10 animate-spin rounded-full border-4 border-indigo-200 border-t-indigo-600" />
              <p className="mt-4 text-xs font-medium text-gray-400 dark:text-gray-500">
                กำลังประมวลผลข้อมูลการยอมรับนโยบาย...
              </p>
            </div>
          ) : data ? (
            <>
              {/* Stat Cards */}
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                <StatCard
                  icon={<FaUserTie className="text-indigo-600 dark:text-indigo-300" size={20} />}
                  label="ครู / บุคลากร"
                  accepted={data.teachers.accepted}
                  total={data.teachers.total}
                  colorClass="bg-indigo-100 dark:bg-indigo-500/10"
                  barColor="bg-indigo-600 dark:bg-indigo-500"
                />
                <StatCard
                  icon={<FaUserGraduate className="text-emerald-600 dark:text-emerald-300" size={20} />}
                  label="นักเรียน (ปัจจุบัน)"
                  accepted={data.students.accepted}
                  total={data.students.total}
                  colorClass="bg-emerald-100 dark:bg-emerald-500/10"
                  barColor="bg-emerald-500 dark:bg-emerald-400"
                />
                <div className="flex flex-col justify-between rounded-2xl border border-gray-100 bg-white p-5 shadow-sm transition hover:shadow-md dark:border-gray-800 dark:bg-[#242529]">
                  <div className="flex items-center gap-3">
                    <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-amber-100 dark:bg-amber-500/10">
                      <FaUsers className="text-amber-600 dark:text-amber-300" size={22} />
                    </div>
                    <div>
                      <p className="text-xs font-bold text-gray-500 dark:text-gray-400">ผู้ปกครอง</p>
                      <p className="text-2xl font-black text-gray-900 dark:text-white">
                        {data.parentsAcceptedCount.toLocaleString()}{" "}
                        <span className="text-sm font-bold text-gray-400 dark:text-gray-500">คน</span>
                      </p>
                    </div>
                  </div>
                  <div className="mt-4 rounded-xl bg-amber-50/60 p-2.5 text-[11px] font-medium text-amber-700 dark:bg-amber-500/5 dark:text-amber-300/80">
                    บันทึกตามจำนวนการกดยอมรับจริง (ผู้ปกครองเข้าใช้งานผ่านข้อมูลบุตร)
                  </div>
                </div>
              </div>

              {/* View Switcher Tabs */}
              <div className="flex flex-col gap-3 rounded-2xl border border-gray-100 bg-white p-4 shadow-sm dark:border-gray-800 dark:bg-[#242529] sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold text-gray-500 dark:text-gray-400">
                    ตารางแสดงผล:
                  </span>
                  <div className="inline-flex rounded-xl bg-gray-100 p-1 dark:bg-[#1a1b1e]">
                    <button
                      type="button"
                      onClick={() => setViewFilter("accepted")}
                      className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-black transition ${
                        viewFilter === "accepted"
                          ? "bg-white text-emerald-600 shadow-sm dark:bg-[#242529] dark:text-emerald-400"
                          : "text-gray-500 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white"
                      }`}
                    >
                      <FaCheckCircle size={11} />
                      คนที่ยอมรับแล้ว
                      <span className="ml-1 rounded-full bg-emerald-100 px-1.5 py-0.2 text-[10px] font-bold text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-300">
                        {(data.teachers.accepted + data.students.accepted).toLocaleString()}
                      </span>
                    </button>

                    <button
                      type="button"
                      onClick={() => setViewFilter("pending")}
                      className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-black transition ${
                        viewFilter === "pending"
                          ? "bg-white text-amber-600 shadow-sm dark:bg-[#242529] dark:text-amber-400"
                          : "text-gray-500 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white"
                      }`}
                    >
                      <FaClock size={11} />
                      คนที่ยังไม่ยอมรับ
                      <span className="ml-1 rounded-full bg-amber-100 px-1.5 py-0.2 text-[10px] font-bold text-amber-700 dark:bg-amber-500/20 dark:text-amber-300">
                        {Math.max(
                          0,
                          data.teachers.total - data.teachers.accepted + data.students.total - data.students.accepted
                        ).toLocaleString()}
                      </span>
                    </button>

                    <button
                      type="button"
                      onClick={() => setViewFilter("all")}
                      className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-black transition ${
                        viewFilter === "all"
                          ? "bg-white text-indigo-600 shadow-sm dark:bg-[#242529] dark:text-indigo-400"
                          : "text-gray-500 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white"
                      }`}
                    >
                      ทั้งหมด
                    </button>
                  </div>
                </div>

                <div className="text-xs text-gray-400 dark:text-gray-500">
                  {viewFilter === "accepted"
                    ? "✨ แสดงเฉพาะรายชื่อผู้ที่ได้กดยอมรับนโยบายแล้ว"
                    : viewFilter === "pending"
                    ? "⏳ แสดงเฉพาะรายชื่อที่ยังรอการกดยอมรับนโยบาย"
                    : "📋 แสดงรายชื่อผู้ใช้งานทั้งหมด"}
                </div>
              </div>

              {/* People Tables */}
              <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
                <PersonTable
                  title="ครู / บุคลากร"
                  icon={<FaUserTie className="text-indigo-500" size={15} />}
                  group={data.teachers}
                  viewFilter={viewFilter}
                />
                <PersonTable
                  title="นักเรียน"
                  icon={<FaUserGraduate className="text-emerald-500" size={15} />}
                  group={data.students}
                  viewFilter={viewFilter}
                  showClass
                />
              </div>
            </>
          ) : isAuthLoading ? (
            <div className="flex flex-col items-center justify-center py-24">
              <div className="h-10 w-10 animate-spin rounded-full border-4 border-indigo-200 border-t-indigo-600" />
              <p className="mt-4 text-xs font-medium text-gray-400 dark:text-gray-500">
                กำลังยืนยันสิทธิ์ผู้ใช้งาน...
              </p>
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-gray-300 bg-white py-16 text-center dark:border-gray-700 dark:bg-[#242529]">
              <p className="text-sm font-bold text-gray-500 dark:text-gray-400">
                ไม่พบข้อมูลโรงเรียนสำหรับแสดงผล
              </p>
              <p className="mt-1 text-xs text-gray-400 dark:text-gray-500">
                กรุณาตรวจสอบว่าบัญชีผู้ใช้ของคุณสังกัดโรงเรียน หรือเลือกโรงเรียนที่ต้องการจากแถบด้านบน
              </p>
            </div>
          )}
        </div>
      </div>
    </MainLayout>
  );
};

export default ConsentAuditPage;
