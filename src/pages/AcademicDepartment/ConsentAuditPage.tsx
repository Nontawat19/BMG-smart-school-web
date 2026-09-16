import React, { useEffect, useState } from "react";
import MainLayout from "@/layouts/MainLayout";
import BackButton from "@/components/Shared/BackButton";
import { functions } from "@/firebase";
import { httpsCallable } from "firebase/functions";
import { useEffectiveSchoolId } from "@/hooks/useEffectiveSchool";
import { FaShieldAlt, FaUserTie, FaUserGraduate, FaUsers, FaRedo } from "react-icons/fa";

interface PendingPerson {
  id: string;
  name: string;
  classLevel?: string;
  room?: string;
}

interface AuditGroup {
  total: number;
  accepted: number;
  pending: PendingPerson[];
  pendingTruncated: boolean;
}

interface AuditResult {
  schoolId: string;
  teachers: AuditGroup;
  students: AuditGroup;
  parentsAcceptedCount: number;
}

const StatCard: React.FC<{ icon: React.ReactNode; label: string; accepted: number; total: number; colorClass: string }> = ({
  icon,
  label,
  accepted,
  total,
  colorClass,
}) => {
  const percent = total > 0 ? Math.round((accepted / total) * 100) : 0;
  return (
    <div className="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm dark:border-gray-800 dark:bg-[#242529]">
      <div className="flex items-center gap-3">
        <div className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${colorClass}`}>{icon}</div>
        <div className="min-w-0">
          <p className="text-xs font-bold text-gray-500 dark:text-gray-400">{label}</p>
          <p className="text-xl font-black text-gray-900 dark:text-white">
            {accepted}/{total} <span className="text-xs font-bold text-gray-400">({percent}%)</span>
          </p>
        </div>
      </div>
    </div>
  );
};

const PendingTable: React.FC<{ title: string; group: AuditGroup; showClass?: boolean }> = ({ title, group, showClass }) => (
  <div className="rounded-2xl border border-gray-100 bg-white shadow-sm dark:border-gray-800 dark:bg-[#242529]">
    <div className="flex items-center justify-between border-b border-gray-100 px-4 py-3 dark:border-gray-800">
      <p className="text-sm font-black text-gray-800 dark:text-gray-100">{title} — ยังไม่ยอมรับ ({group.pending.length}{group.pendingTruncated ? "+" : ""} คน)</p>
    </div>
    {group.pending.length === 0 ? (
      <p className="px-4 py-6 text-center text-sm text-gray-400 dark:text-gray-500">ยอมรับครบทุกคนแล้ว 🎉</p>
    ) : (
      <div className="max-h-80 overflow-y-auto">
        <table className="w-full text-left text-xs">
          <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
            {group.pending.map((p) => (
              <tr key={p.id}>
                <td className="px-4 py-2 text-gray-700 dark:text-gray-300">{p.name}</td>
                {showClass && <td className="px-4 py-2 text-gray-400 dark:text-gray-500">{p.classLevel}/{p.room}</td>}
              </tr>
            ))}
          </tbody>
        </table>
        {group.pendingTruncated && (
          <p className="px-4 py-2 text-[11px] text-gray-400 dark:text-gray-500">แสดงเฉพาะ 300 รายชื่อแรก ยังมีรายชื่ออื่นที่ยังไม่ยอมรับเพิ่มเติม</p>
        )}
      </div>
    )}
  </div>
);

const ConsentAuditPage: React.FC = () => {
  const effectiveSchoolId = useEffectiveSchoolId();
  const [data, setData] = useState<AuditResult | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchStats = async () => {
    if (!effectiveSchoolId) return;
    setIsLoading(true);
    setError(null);
    try {
      const getConsentAuditStats = httpsCallable(functions, "getConsentAuditStats");
      const result = await getConsentAuditStats({ schoolId: effectiveSchoolId });
      setData(result.data as AuditResult);
    } catch (err: any) {
      console.error("Error fetching consent audit stats:", err);
      setError(err?.message || "เกิดข้อผิดพลาดในการดึงข้อมูล");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchStats();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [effectiveSchoolId]);

  return (
    <MainLayout>
      <div className="min-h-screen bg-gray-50 px-4 py-6 dark:bg-[#15161a] sm:px-6 lg:py-8">
        <div className="mx-auto max-w-5xl space-y-6">
          <div className="flex flex-col gap-4 rounded-2xl border border-gray-100 bg-white p-5 shadow-sm dark:border-gray-800 dark:bg-[#242529] lg:flex-row lg:items-center lg:justify-between">
            <div className="flex min-w-0 flex-1 items-center gap-4">
              <BackButton to="/academic/hub/settings" />
              <div className="min-w-0">
                <h1 className="flex items-center gap-3 text-2xl font-black tracking-tight text-gray-900 dark:text-white">
                  <span className="flex h-9 w-9 items-center justify-center rounded-full bg-indigo-100 text-indigo-600 dark:bg-indigo-500/10 dark:text-indigo-300">
                    <FaShieldAlt size={16} />
                  </span>
                  สถิติการยอมรับนโยบาย
                </h1>
                <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                  ตรวจสอบว่าครู/บุคลากรและนักเรียนในโรงเรียนนี้ยอมรับนโยบายความเป็นส่วนตัวและข้อกำหนดการใช้บริการครบแล้วหรือยัง
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={fetchStats}
              disabled={isLoading}
              className="inline-flex items-center justify-center gap-2 rounded-xl border border-gray-200 bg-gray-50 px-3.5 py-2 text-xs font-bold text-gray-700 transition hover:bg-gray-100 disabled:opacity-50 dark:border-gray-700 dark:bg-[#1e1f21] dark:text-gray-300 dark:hover:bg-gray-800"
            >
              <FaRedo size={11} className={isLoading ? "animate-spin" : ""} />
              รีเฟรช
            </button>
          </div>

          {error && (
            <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700 dark:border-red-800 dark:bg-red-900/20 dark:text-red-300">
              {error}
            </div>
          )}

          {isLoading && !data ? (
            <div className="flex justify-center py-20">
              <div className="h-10 w-10 animate-spin rounded-full border-4 border-indigo-200 border-t-indigo-600" />
            </div>
          ) : data ? (
            <>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                <StatCard
                  icon={<FaUserTie className="text-indigo-600 dark:text-indigo-300" />}
                  label="ครู/บุคลากร"
                  accepted={data.teachers.accepted}
                  total={data.teachers.total}
                  colorClass="bg-indigo-100 dark:bg-indigo-500/10"
                />
                <StatCard
                  icon={<FaUserGraduate className="text-emerald-600 dark:text-emerald-300" />}
                  label="นักเรียน"
                  accepted={data.students.accepted}
                  total={data.students.total}
                  colorClass="bg-emerald-100 dark:bg-emerald-500/10"
                />
                <div className="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm dark:border-gray-800 dark:bg-[#242529]">
                  <div className="flex items-center gap-3">
                    <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-amber-100 dark:bg-amber-500/10">
                      <FaUsers className="text-amber-600 dark:text-amber-300" />
                    </div>
                    <div>
                      <p className="text-xs font-bold text-gray-500 dark:text-gray-400">ผู้ปกครอง</p>
                      <p className="text-xl font-black text-gray-900 dark:text-white">{data.parentsAcceptedCount} คน</p>
                      <p className="text-[10px] text-gray-400 dark:text-gray-500">ยอมรับแล้ว (ไม่มีตัวส่วนรวม — ผู้ปกครองไม่มีบัญชีของตัวเอง)</p>
                    </div>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                <PendingTable title="ครู/บุคลากร" group={data.teachers} />
                <PendingTable title="นักเรียน" group={data.students} showClass />
              </div>
            </>
          ) : (
            <div className="rounded-2xl border border-dashed border-gray-300 bg-white py-16 text-center text-sm text-gray-400 dark:border-gray-700 dark:bg-[#242529] dark:text-gray-500">
              ไม่พบข้อมูลโรงเรียน
            </div>
          )}
        </div>
      </div>
    </MainLayout>
  );
};

export default ConsentAuditPage;
