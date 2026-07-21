import React, { useState, useEffect, useCallback, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import MainLayout from "@/layouts/MainLayout";
import { firestore, auth } from "@/firebase";
import { collection, getDocs, doc, getDoc } from "firebase/firestore";
import { getCurrentAcademicYear } from "@/utils/academicYearUtils";
import {
    Users,
    CheckCircle2,
    ShieldAlert,
    AlertCircle,
    ChevronLeft,
    Loader2,
    Layers,
} from "lucide-react";
import { motion } from "framer-motion";
import { getStudentStatus } from "@/utils/studentStatusUtils";
import { EDUCATION_LEVEL_GROUPS, getEducationLevelGroup } from "@/utils/schoolUtils";

interface Student {
    id: string;
    studentId: string;
    firstName: string;
    lastName: string;
    classLevel: string;
    room: string;
}

interface Visit {
    id: string;
    studentId: string;
    visitDate: string;
    healthRisk?: string[];
    drugRisk?: string[];
    violenceRisk?: string[];
    sexualRisk?: string[];
    gameRisk?: string[];
    visitSummary?: string;
}

interface GroupStat {
    key: string;
    label: string;
    total: number;
    visited: number;
    notVisited: number;
    riskCount: number;
    urgentCount: number;
    percent: number;
}

const HomeVisitSummaryLevelRange: React.FC = () => {
    const navigate = useNavigate();
    const [loading, setLoading] = useState(true);
    const [students, setStudents] = useState<Student[]>([]);
    const [visits, setVisits] = useState<Visit[]>([]);
    const [schoolName, setSchoolName] = useState("");
    const [academicYear, setAcademicYear] = useState("");
    const [semester, setSemester] = useState("");
    const [affiliation, setAffiliation] = useState("");

    const fetchData = useCallback(async () => {
        setLoading(true);
        try {
            const user = auth.currentUser;
            if (!user) return;
            const userDoc = await getDoc(doc(firestore, "users", user.uid));
            const sid = userDoc.data()?.schoolId;
            if (!sid) return;

            const [schoolSnap, academicInfo] = await Promise.all([
                getDoc(doc(firestore, "school-settings", sid)),
                getCurrentAcademicYear(firestore, sid),
            ]);
            if (schoolSnap.exists()) {
                const sd = schoolSnap.data();
                setSchoolName(sd?.schoolName || "");
                setAffiliation(sd?.affiliation || sd?.educationArea || sd?.areaOffice || "");
            }
            setAcademicYear(academicInfo.academicYear || "");
            setSemester(academicInfo.currentTerm || "");

            const studentsSnap = await getDocs(collection(firestore, "school-settings", sid, "students"));
            const studentsList = studentsSnap.docs
                .map(d => ({ id: d.id, ...d.data() } as Student))
                .filter(s => getStudentStatus(s) === "กำลังศึกษาอยู่");
            setStudents(studentsList);

            const allVisits: Visit[] = [];
            await Promise.all(studentsList.map(async (student) => {
                const visitsSnap = await getDocs(collection(firestore, "school-settings", sid, "students", student.id, "home-visits"));
                visitsSnap.docs.forEach(d => allVisits.push({ id: d.id, ...d.data(), studentId: student.id } as Visit));
            }));
            setVisits(allVisits);
        } catch (err) {
            console.error("Error fetching data:", err);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => { fetchData(); }, [fetchData]);

    const groupStats = useMemo((): GroupStat[] => {
        const latestVisitsMap = new Map<string, Visit>();
        visits.forEach(v => {
            if (!latestVisitsMap.has(v.studentId) || v.visitDate > latestVisitsMap.get(v.studentId)!.visitDate)
                latestVisitsMap.set(v.studentId, v);
        });

        return EDUCATION_LEVEL_GROUPS.map(group => {
            const groupStudents = students.filter(s => getEducationLevelGroup(s.classLevel)?.key === group.key);
            const visitedIds = new Set(groupStudents.filter(s => latestVisitsMap.has(s.id)).map(s => s.id));
            const latestVisits = groupStudents.filter(s => latestVisitsMap.has(s.id)).map(s => latestVisitsMap.get(s.id)!);
            const riskCount = latestVisits.filter(v =>
                (v.healthRisk?.length || 0) > 0 || (v.drugRisk?.length || 0) > 0 ||
                (v.violenceRisk?.length || 0) > 0 || (v.sexualRisk?.length || 0) > 0 || (v.gameRisk?.length || 0) > 0
            ).length;
            const urgentCount = latestVisits.filter(v => v.visitSummary === "ช่วยเหลือด่วน").length;
            const total = groupStudents.length;
            const visitedCount = visitedIds.size;
            return {
                key: group.key,
                label: group.label,
                total,
                visited: visitedCount,
                notVisited: total - visitedCount,
                riskCount, urgentCount,
                percent: total > 0 ? Math.round((visitedCount / total) * 100) : 0,
            };
        }).filter(g => g.total > 0);
    }, [students, visits]);

    const grandTotal = useMemo(() => ({
        total: groupStats.reduce((s, g) => s + g.total, 0),
        visited: groupStats.reduce((s, g) => s + g.visited, 0),
        risk: groupStats.reduce((s, g) => s + g.riskCount, 0),
        urgent: groupStats.reduce((s, g) => s + g.urgentCount, 0),
    }), [groupStats]);

    const getPercentColor = (pct: number) => {
        if (pct >= 80) return "bg-emerald-500";
        if (pct >= 50) return "bg-amber-400";
        return "bg-rose-500";
    };

    const getPercentTextColor = (pct: number) => {
        if (pct >= 80) return "text-emerald-600 dark:text-emerald-400";
        if (pct >= 50) return "text-amber-600 dark:text-amber-400";
        return "text-rose-600 dark:text-rose-400";
    };

    if (loading) {
        return (
            <div className="flex h-screen items-center justify-center bg-gray-50 dark:bg-[#1a1b1e]">
                <div className="flex flex-col items-center gap-3">
                    <div className="w-14 h-14 bg-gradient-to-br from-orange-500 to-amber-600 rounded-2xl flex items-center justify-center shadow-lg shadow-orange-500/30">
                        <Loader2 className="w-7 h-7 text-white animate-spin" />
                    </div>
                    <p className="text-gray-500 dark:text-gray-400 font-semibold text-sm">กำลังโหลดข้อมูลช่วงชั้น...</p>
                </div>
            </div>
        );
    }

    const grandPct = grandTotal.total > 0 ? Math.round((grandTotal.visited / grandTotal.total) * 100) : 0;

    return (
        <MainLayout>
            <div className="min-h-screen bg-gray-50 dark:bg-[#1a1b1e]">

                {/* Hero Header */}
                <div className="bg-white dark:bg-[#212326] border-b border-gray-100 dark:border-gray-800">
                    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-5">
                        <div className="flex items-center gap-4">
                            <button
                                onClick={() => navigate("/student-support/home-visit/summary")}
                                className="flex-shrink-0 p-2.5 bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-600 dark:text-gray-400 rounded-xl transition-all active:scale-95"
                            >
                                <ChevronLeft size={20} />
                            </button>
                            <div className="flex-shrink-0 w-10 h-10 bg-gradient-to-br from-orange-500 to-amber-600 rounded-xl flex items-center justify-center shadow-md shadow-orange-500/25">
                                <Layers size={18} className="text-white" />
                            </div>
                            <div className="min-w-0">
                                <h1 className="text-xl font-black text-gray-900 dark:text-white">สรุปแบบช่วงชั้น</h1>
                                <p className="text-sm text-gray-400 dark:text-gray-500 font-medium">
                                    {groupStats.length} ช่วงชั้น
                                    {academicYear && <> · ปี {academicYear}{semester ? ` เทอม ${semester}` : ""}</>}
                                </p>
                            </div>
                        </div>
                    </div>
                </div>

                <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6">

                    {/* School info */}
                    <div className="bg-white dark:bg-[#25262a] rounded-2xl border border-gray-100 dark:border-gray-800 shadow-sm p-5">
                        <div className="flex flex-wrap gap-2">
                            {schoolName && (
                                <span className="inline-flex items-center px-3 py-1.5 bg-gray-50 dark:bg-gray-800 text-gray-700 dark:text-gray-300 rounded-xl text-sm font-semibold border border-gray-100 dark:border-gray-700">
                                    {schoolName}
                                </span>
                            )}
                            {academicYear && (
                                <span className="inline-flex items-center px-3 py-1.5 bg-orange-50 dark:bg-orange-900/20 text-orange-700 dark:text-orange-300 rounded-xl text-sm font-semibold border border-orange-100 dark:border-orange-800/50">
                                    ปี {academicYear}{semester ? ` เทอม ${semester}` : ""}
                                </span>
                            )}
                            {affiliation && (
                                <span className="inline-flex items-center px-3 py-1.5 bg-gray-50 dark:bg-gray-800 text-gray-500 dark:text-gray-400 rounded-xl text-xs font-medium border border-gray-100 dark:border-gray-700">
                                    {affiliation}
                                </span>
                            )}
                        </div>
                    </div>

                    {/* Grand Total Cards */}
                    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                        {[
                            { label: "นักเรียนทั้งหมด", value: grandTotal.total, icon: <Users size={20} />, accent: "from-blue-500 to-indigo-600", text: "text-blue-600 dark:text-blue-400", sub: `${groupStats.length} ช่วงชั้น` },
                            { label: "เยี่ยมแล้วทั้งหมด", value: grandTotal.visited, icon: <CheckCircle2 size={20} />, accent: "from-emerald-500 to-teal-600", text: "text-emerald-600 dark:text-emerald-400", sub: `${grandPct}%` },
                            { label: "พบกลุ่มเสี่ยง", value: grandTotal.risk, icon: <ShieldAlert size={20} />, accent: "from-amber-500 to-orange-600", text: "text-amber-600 dark:text-amber-400", sub: "รวมทุกช่วงชั้น" },
                            { label: "ต้องการความช่วยเหลือ", value: grandTotal.urgent, icon: <AlertCircle size={20} />, accent: "from-rose-500 to-pink-600", text: "text-rose-600 dark:text-rose-400", sub: "กลุ่มวิกฤต" },
                        ].map((item, i) => (
                            <motion.div key={i} initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.07 }}
                                className="bg-white dark:bg-[#25262a] rounded-2xl border border-gray-100 dark:border-gray-800 shadow-sm overflow-hidden">
                                <div className={`h-1 bg-gradient-to-r ${item.accent}`} />
                                <div className="p-5">
                                    <div className={`inline-flex p-2.5 rounded-xl mb-3 bg-gray-50 dark:bg-gray-800/80 ${item.text}`}>{item.icon}</div>
                                    <p className="text-xs font-bold text-gray-400 mb-1">{item.label}</p>
                                    <div className="flex items-baseline gap-1.5">
                                        <span className="text-3xl font-black text-gray-900 dark:text-white">{item.value}</span>
                                        <span className="text-sm text-gray-400 font-bold">คน</span>
                                    </div>
                                    <p className={`text-[11px] font-bold mt-2 ${item.text}`}>{item.sub}</p>
                                </div>
                            </motion.div>
                        ))}
                    </div>

                    {/* Level Range Table */}
                    <div className="bg-white dark:bg-[#25262a] rounded-2xl border border-gray-100 dark:border-gray-800 shadow-sm overflow-hidden">
                        <div className="h-1 bg-gradient-to-r from-orange-500 to-amber-600" />
                        <div className="p-5 border-b border-gray-50 dark:border-gray-800 flex items-center justify-between">
                            <div>
                                <h2 className="font-black text-base text-gray-900 dark:text-white flex items-center gap-2">
                                    <Layers size={18} className="text-orange-600" />
                                    ตารางสรุปแบบช่วงชั้น
                                </h2>
                                <p className="text-xs font-medium text-gray-400 mt-0.5">รวมนักเรียนทุกห้องในช่วงชั้นเดียวกัน</p>
                            </div>
                            <span className="text-xs font-black text-gray-400 bg-gray-50 dark:bg-gray-800 px-3 py-1.5 rounded-xl border border-gray-100 dark:border-gray-700">{groupStats.length} ช่วงชั้น</span>
                        </div>

                        <div className="overflow-x-auto">
                            <table className="w-full">
                                <thead className="bg-gray-50 dark:bg-gray-800/50">
                                    <tr>
                                        <th className="px-5 py-3 text-left text-[10px] font-black text-gray-400 uppercase tracking-widest">ช่วงชั้น</th>
                                        <th className="px-5 py-3 text-center text-[10px] font-black text-gray-400 uppercase tracking-widest">นักเรียน</th>
                                        <th className="px-5 py-3 text-center text-[10px] font-black text-gray-400 uppercase tracking-widest">เยี่ยมแล้ว</th>
                                        <th className="px-5 py-3 text-center text-[10px] font-black text-gray-400 uppercase tracking-widest">ยังไม่เยี่ยม</th>
                                        <th className="px-5 py-3 text-left text-[10px] font-black text-gray-400 uppercase tracking-widest w-44">ความคืบหน้า</th>
                                        <th className="px-5 py-3 text-center text-[10px] font-black text-gray-400 uppercase tracking-widest">กลุ่มเสี่ยง</th>
                                        <th className="px-5 py-3 text-center text-[10px] font-black text-gray-400 uppercase tracking-widest">ช่วยเหลือด่วน</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-50 dark:divide-gray-800">
                                    {groupStats.map((g, i) => (
                                        <motion.tr
                                            key={g.key}
                                            initial={{ opacity: 0 }}
                                            animate={{ opacity: 1 }}
                                            transition={{ delay: i * 0.05 }}
                                        >
                                            <td className="px-5 py-4">
                                                <p className="font-bold text-gray-900 dark:text-white text-sm">{g.label}</p>
                                            </td>
                                            <td className="px-5 py-4 text-center">
                                                <span className="font-black text-gray-900 dark:text-white">{g.total}</span>
                                                <span className="text-gray-400 text-xs ml-1">คน</span>
                                            </td>
                                            <td className="px-5 py-4 text-center">
                                                <span className="font-black text-emerald-600 dark:text-emerald-400">{g.visited}</span>
                                                <span className="text-gray-400 text-xs ml-1">คน</span>
                                            </td>
                                            <td className="px-5 py-4 text-center">
                                                <span className={`font-black ${g.notVisited > 0 ? "text-rose-500 dark:text-rose-400" : "text-gray-400"}`}>{g.notVisited}</span>
                                                <span className="text-gray-400 text-xs ml-1">คน</span>
                                            </td>
                                            <td className="px-5 py-4">
                                                <div className="flex items-center gap-2">
                                                    <div className="flex-1 h-2 bg-gray-100 dark:bg-gray-700 rounded-full overflow-hidden">
                                                        <div
                                                            className={`h-full rounded-full transition-all ${getPercentColor(g.percent)}`}
                                                            style={{ width: `${g.percent}%` }}
                                                        />
                                                    </div>
                                                    <span className={`text-xs font-black w-10 text-right ${getPercentTextColor(g.percent)}`}>{g.percent}%</span>
                                                </div>
                                            </td>
                                            <td className="px-5 py-4 text-center">
                                                {g.riskCount > 0 ? (
                                                    <span className="inline-flex items-center justify-center w-7 h-7 bg-amber-50 dark:bg-amber-900/20 text-amber-600 dark:text-amber-400 rounded-lg text-xs font-black">{g.riskCount}</span>
                                                ) : (
                                                    <span className="text-gray-300 dark:text-gray-600 font-black">—</span>
                                                )}
                                            </td>
                                            <td className="px-5 py-4 text-center">
                                                {g.urgentCount > 0 ? (
                                                    <span className="inline-flex items-center justify-center w-7 h-7 bg-rose-50 dark:bg-rose-900/20 text-rose-600 dark:text-rose-400 rounded-lg text-xs font-black">{g.urgentCount}</span>
                                                ) : (
                                                    <span className="text-gray-300 dark:text-gray-600 font-black">—</span>
                                                )}
                                            </td>
                                        </motion.tr>
                                    ))}
                                </tbody>
                                <tfoot>
                                    <tr className="bg-orange-50 dark:bg-orange-900/10 border-t-2 border-orange-200 dark:border-orange-800/50">
                                        <td className="px-5 py-4">
                                            <span className="font-black text-sm text-orange-700 dark:text-orange-300">รวมทั้งหมด</span>
                                        </td>
                                        <td className="px-5 py-4 text-center">
                                            <span className="font-black text-gray-900 dark:text-white">{grandTotal.total}</span>
                                            <span className="text-gray-400 text-xs ml-1">คน</span>
                                        </td>
                                        <td className="px-5 py-4 text-center">
                                            <span className="font-black text-emerald-600 dark:text-emerald-400">{grandTotal.visited}</span>
                                            <span className="text-gray-400 text-xs ml-1">คน</span>
                                        </td>
                                        <td className="px-5 py-4 text-center">
                                            <span className={`font-black ${grandTotal.total - grandTotal.visited > 0 ? "text-rose-500" : "text-gray-400"}`}>{grandTotal.total - grandTotal.visited}</span>
                                            <span className="text-gray-400 text-xs ml-1">คน</span>
                                        </td>
                                        <td className="px-5 py-4">
                                            <div className="flex items-center gap-2">
                                                <div className="flex-1 h-2 bg-orange-100 dark:bg-orange-900/30 rounded-full overflow-hidden">
                                                    <div
                                                        className={`h-full rounded-full ${getPercentColor(grandPct)}`}
                                                        style={{ width: `${grandPct}%` }}
                                                    />
                                                </div>
                                                <span className={`text-xs font-black w-10 text-right ${getPercentTextColor(grandPct)}`}>{grandPct}%</span>
                                            </div>
                                        </td>
                                        <td className="px-5 py-4 text-center">
                                            <span className="font-black text-amber-600 dark:text-amber-400">{grandTotal.risk}</span>
                                        </td>
                                        <td className="px-5 py-4 text-center">
                                            <span className="font-black text-rose-600 dark:text-rose-400">{grandTotal.urgent}</span>
                                        </td>
                                    </tr>
                                </tfoot>
                            </table>
                        </div>
                    </div>
                </div>
            </div>
        </MainLayout>
    );
};

export default HomeVisitSummaryLevelRange;
