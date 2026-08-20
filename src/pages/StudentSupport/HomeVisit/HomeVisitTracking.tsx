import React, { useState, useEffect, useCallback, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import MainLayout from "@/layouts/MainLayout";
import { firestore, auth } from "@/firebase";
import { collection, getDocs, doc, getDoc } from "firebase/firestore";
import { getCurrentAcademicYear } from "@/utils/academicYearUtils";
import {
    TrendingUp,
    ChevronLeft,
    CheckCircle2,
    Clock,
    AlertCircle,
    School,
} from "lucide-react";
import {
    BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell, CartesianGrid,
} from "recharts";
import { motion } from "framer-motion";
import { getStudentStatus } from "@/utils/studentStatusUtils";

interface Student {
    id: string;
    classLevel: string;
    room: string;
}

interface Visit {
    id: string;
    studentId: string;
    visitDate: string;
}

interface RoomProgress {
    key: string;
    classLevel: string;
    room: string;
    label: string;
    total: number;
    visited: number;
    percent: number;
}

const HomeVisitTracking: React.FC = () => {
    const navigate = useNavigate();
    const [loading, setLoading] = useState(true);
    const [students, setStudents] = useState<Student[]>([]);
    const [visits, setVisits] = useState<Visit[]>([]);
    const [schoolName, setSchoolName] = useState("");
    const [academicYear, setAcademicYear] = useState("");
    const [semester, setSemester] = useState("");
    const [directorName, setDirectorName] = useState("");
    const [directorPrefix, setDirectorPrefix] = useState("");
    const [affiliation, setAffiliation] = useState("");
    const [viewMode, setViewMode] = useState<"bar" | "list">("list");

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
                setDirectorName(sd?.directorName || "");
                setDirectorPrefix(sd?.directorPrefix || "");
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
                if (!visitsSnap.empty) {
                    visitsSnap.docs.forEach(d => allVisits.push({ id: d.id, ...d.data(), studentId: student.id } as Visit));
                }
            }));
            setVisits(allVisits);
        } catch (err) {
            console.error("Error fetching tracking data:", err);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => { fetchData(); }, [fetchData]);

    const roomProgress = useMemo((): RoomProgress[] => {
        const roomMap = new Map<string, Student[]>();
        students.forEach(s => {
            const key = `${s.classLevel}|${s.room}`;
            if (!roomMap.has(key)) roomMap.set(key, []);
            roomMap.get(key)!.push(s);
        });

        const visitedStudentIds = new Set(visits.map(v => v.studentId));

        const result: RoomProgress[] = [];
        roomMap.forEach((roomStudents, key) => {
            const [classLevel, room] = key.split("|");
            const visited = roomStudents.filter(s => visitedStudentIds.has(s.id)).length;
            const total = roomStudents.length;
            result.push({
                key, classLevel, room,
                label: `${classLevel}/${room}`,
                total, visited,
                percent: total > 0 ? Math.round((visited / total) * 100) : 0,
            });
        });

        return result.sort((a, b) => a.classLevel.localeCompare(b.classLevel) || parseInt(a.room) - parseInt(b.room));
    }, [students, visits]);

    const schoolOverall = useMemo(() => {
        const total = roomProgress.reduce((s, r) => s + r.total, 0);
        const visited = roomProgress.reduce((s, r) => s + r.visited, 0);
        return { total, visited, percent: total > 0 ? Math.round((visited / total) * 100) : 0 };
    }, [roomProgress]);

    const getBarColor = (pct: number) => {
        if (pct >= 80) return "#10b981";
        if (pct >= 50) return "#f59e0b";
        return "#f43f5e";
    };

    const getProgressColor = (pct: number) => {
        if (pct >= 80) return "bg-emerald-500";
        if (pct >= 50) return "bg-amber-400";
        return "bg-rose-500";
    };

    const getProgressTextColor = (pct: number) => {
        if (pct >= 80) return "text-emerald-600 dark:text-emerald-400";
        if (pct >= 50) return "text-amber-600 dark:text-amber-400";
        return "text-rose-600 dark:text-rose-400";
    };

    const getBadge = (pct: number) => {
        if (pct === 100) return { label: "ครบ 100%", color: "bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400" };
        if (pct >= 80) return { label: "เกือบครบ", color: "bg-teal-100 dark:bg-teal-900/30 text-teal-700 dark:text-teal-400" };
        if (pct >= 50) return { label: "กำลังดำเนินการ", color: "bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400" };
        return { label: "ต้องเร่งดำเนินการ", color: "bg-rose-100 dark:bg-rose-900/30 text-rose-700 dark:text-rose-400" };
    };

    if (loading) {
        return (
            <div className="min-h-screen bg-gray-50 dark:bg-[#1a1b1e] p-4 sm:p-6">
                <div className="max-w-6xl w-full mx-auto space-y-6">
                    <div className="h-10 w-64 rounded-lg bg-gray-200 dark:bg-gray-700 animate-pulse"></div>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                        {[...Array(4)].map((_, i) => (
                            <div key={`skeleton-stat-${i}`} className="h-24 rounded-2xl bg-gray-200 dark:bg-gray-700 animate-pulse"></div>
                        ))}
                    </div>
                    <div className="h-72 w-full rounded-2xl bg-gray-200 dark:bg-gray-700 animate-pulse"></div>
                </div>
            </div>
        );
    }

    return (
        <MainLayout>
            <div className="min-h-screen bg-gray-50 dark:bg-[#1a1b1e]">

                {/* Hero Header */}
                <div className="bg-white dark:bg-[#212326] border-b border-gray-100 dark:border-gray-800">
                    <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-5">
                        <div className="flex items-center justify-between gap-4 flex-wrap">
                            <div className="flex items-center gap-4">
                                <button
                                    onClick={() => navigate("/student-support/home-visit/summary")}
                                    className="flex-shrink-0 p-2.5 bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-600 dark:text-gray-400 rounded-xl transition-all active:scale-95"
                                >
                                    <ChevronLeft size={20} />
                                </button>
                                <div className="flex-shrink-0 w-10 h-10 bg-gradient-to-br from-rose-500 to-pink-600 rounded-xl flex items-center justify-center shadow-md shadow-rose-500/25">
                                    <TrendingUp size={18} className="text-white" />
                                </div>
                                <div className="min-w-0">
                                    <h1 className="text-xl font-black text-gray-900 dark:text-white">ติดตามการเยี่ยมบ้าน</h1>
                                    <p className="text-sm text-gray-400 dark:text-gray-500 font-medium">
                                        {roomProgress.length} ห้องเรียน
                                        {academicYear && <> · ปี {academicYear}{semester ? ` เทอม ${semester}` : ""}</>}
                                    </p>
                                </div>
                            </div>

                            {/* View toggle */}
                            <div className="flex items-center gap-1 bg-gray-100 dark:bg-gray-800 p-1 rounded-xl">
                                <button
                                    onClick={() => setViewMode("list")}
                                    className={`px-4 py-2 rounded-lg text-sm font-bold transition-all ${viewMode === "list" ? "bg-white dark:bg-[#25262a] shadow-sm text-gray-900 dark:text-white" : "text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"}`}
                                >
                                    แถบความคืบหน้า
                                </button>
                                <button
                                    onClick={() => setViewMode("bar")}
                                    className={`px-4 py-2 rounded-lg text-sm font-bold transition-all ${viewMode === "bar" ? "bg-white dark:bg-[#25262a] shadow-sm text-gray-900 dark:text-white" : "text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"}`}
                                >
                                    กราฟแท่ง
                                </button>
                            </div>
                        </div>
                    </div>
                </div>

                <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-5">

                    {/* School info pills */}
                    {(schoolName || affiliation || directorName) && (
                        <div className="flex flex-wrap gap-2">
                            {schoolName && (
                                <span className="inline-flex items-center px-3 py-1.5 bg-white dark:bg-[#25262a] text-gray-700 dark:text-gray-300 rounded-xl text-sm font-semibold border border-gray-100 dark:border-gray-800 shadow-sm">
                                    {schoolName}
                                </span>
                            )}
                            {affiliation && (
                                <span className="inline-flex items-center px-3 py-1.5 bg-white dark:bg-[#25262a] text-gray-500 dark:text-gray-400 rounded-xl text-xs font-medium border border-gray-100 dark:border-gray-800 shadow-sm">
                                    {affiliation}
                                </span>
                            )}
                            {(directorPrefix || directorName) && (
                                <span className="inline-flex items-center px-3 py-1.5 bg-white dark:bg-[#25262a] text-gray-500 dark:text-gray-400 rounded-xl text-xs font-medium border border-gray-100 dark:border-gray-800 shadow-sm">
                                    ผอ. {directorPrefix}{directorName}
                                </span>
                            )}
                        </div>
                    )}

                    {/* School Overall Progress */}
                    <motion.div
                        initial={{ opacity: 0, y: 12 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="bg-white dark:bg-[#25262a] rounded-2xl border border-gray-100 dark:border-gray-800 shadow-sm overflow-hidden"
                    >
                        <div className="h-1 bg-gradient-to-r from-rose-500 to-pink-600" />
                        <div className="p-6">
                            <div className="flex items-start justify-between mb-5">
                                <div className="flex items-center gap-3">
                                    <div className="p-2.5 bg-rose-50 dark:bg-rose-900/20 rounded-xl">
                                        <School size={20} className="text-rose-500" />
                                    </div>
                                    <div>
                                        <h2 className="font-black text-gray-900 dark:text-white">ภาพรวมทั้งโรงเรียน</h2>
                                        <p className="text-xs text-gray-400 font-medium mt-0.5">{schoolOverall.visited} จาก {schoolOverall.total} คน</p>
                                    </div>
                                </div>
                                <span className={`text-4xl font-black tabular-nums ${getProgressTextColor(schoolOverall.percent)}`}>
                                    {schoolOverall.percent}%
                                </span>
                            </div>
                            <div className="h-4 bg-gray-100 dark:bg-gray-700 rounded-full overflow-hidden">
                                <motion.div
                                    initial={{ width: 0 }}
                                    animate={{ width: `${schoolOverall.percent}%` }}
                                    transition={{ duration: 0.8, ease: "easeOut" }}
                                    className={`h-full rounded-full ${getProgressColor(schoolOverall.percent)}`}
                                />
                            </div>
                            <div className="flex justify-between mt-3">
                                <div className="flex items-center gap-1.5 text-xs font-bold text-gray-500 dark:text-gray-400">
                                    <CheckCircle2 size={12} className="text-emerald-500" />
                                    เยี่ยมแล้ว {schoolOverall.visited} คน
                                </div>
                                <div className="flex items-center gap-1.5 text-xs font-bold text-gray-400">
                                    <Clock size={12} />
                                    รอดำเนินการ {schoolOverall.total - schoolOverall.visited} คน
                                </div>
                            </div>
                        </div>
                    </motion.div>

                    {/* Summary badges */}
                    <div className="grid grid-cols-3 gap-3">
                        {[
                            { label: "ครบ 100%", count: roomProgress.filter(r => r.percent === 100).length, text: "text-emerald-600 dark:text-emerald-400", accent: "from-emerald-500 to-teal-600", icon: <CheckCircle2 size={18} /> },
                            { label: "อยู่ระหว่างดำเนินการ", count: roomProgress.filter(r => r.percent > 0 && r.percent < 100).length, text: "text-amber-600 dark:text-amber-400", accent: "from-amber-400 to-orange-500", icon: <Clock size={18} /> },
                            { label: "ยังไม่เริ่ม (0%)", count: roomProgress.filter(r => r.percent === 0).length, text: "text-rose-600 dark:text-rose-400", accent: "from-rose-500 to-pink-600", icon: <AlertCircle size={18} /> },
                        ].map((item, i) => (
                            <motion.div key={i} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.06 }}
                                className="bg-white dark:bg-[#25262a] rounded-2xl border border-gray-100 dark:border-gray-800 shadow-sm overflow-hidden">
                                <div className={`h-1 bg-gradient-to-r ${item.accent}`} />
                                <div className="p-4">
                                    <div className={`mb-2 ${item.text}`}>{item.icon}</div>
                                    <p className={`text-2xl font-black ${item.text}`}>{item.count}</p>
                                    <p className="text-[10px] font-bold text-gray-400 mt-0.5 leading-tight">{item.label}</p>
                                </div>
                            </motion.div>
                        ))}
                    </div>

                    {viewMode === "list" ? (
                        <div className="bg-white dark:bg-[#25262a] rounded-2xl border border-gray-100 dark:border-gray-800 shadow-sm overflow-hidden">
                            <div className="h-1 bg-gradient-to-r from-rose-500 to-pink-600" />
                            <div className="p-5 border-b border-gray-50 dark:border-gray-800">
                                <h2 className="font-black text-base text-gray-900 dark:text-white">ความคืบหน้ารายห้อง</h2>
                                <p className="text-xs text-gray-400 font-medium mt-0.5">{roomProgress.length} ห้องเรียน</p>
                            </div>
                            <div className="p-5 space-y-4">
                                {roomProgress.map((r, i) => {
                                    const badge = getBadge(r.percent);
                                    return (
                                        <motion.div
                                            key={r.key}
                                            initial={{ opacity: 0, x: -10 }}
                                            animate={{ opacity: 1, x: 0 }}
                                            transition={{ delay: i * 0.04 }}
                                        >
                                            <div className="flex items-center justify-between mb-1.5">
                                                <div className="flex items-center gap-2">
                                                    <span className="font-black text-sm text-gray-900 dark:text-white">ชั้น {r.classLevel}/{r.room}</span>
                                                    <span className={`text-[9px] font-black px-2 py-0.5 rounded-full ${badge.color}`}>{badge.label}</span>
                                                </div>
                                                <div className="flex items-center gap-3 text-xs font-bold text-gray-400">
                                                    <span>{r.visited}/{r.total} คน</span>
                                                    <span className={`font-black ${getProgressTextColor(r.percent)}`}>{r.percent}%</span>
                                                </div>
                                            </div>
                                            <div className="h-2.5 bg-gray-100 dark:bg-gray-700/70 rounded-full overflow-hidden">
                                                <motion.div
                                                    initial={{ width: 0 }}
                                                    animate={{ width: `${r.percent}%` }}
                                                    transition={{ duration: 0.6, delay: i * 0.04, ease: "easeOut" }}
                                                    className={`h-full rounded-full ${getProgressColor(r.percent)}`}
                                                />
                                            </div>
                                        </motion.div>
                                    );
                                })}
                            </div>
                        </div>
                    ) : (
                        <div className="bg-white dark:bg-[#25262a] rounded-2xl border border-gray-100 dark:border-gray-800 shadow-sm overflow-hidden">
                            <div className="h-1 bg-gradient-to-r from-rose-500 to-pink-600" />
                            <div className="p-6">
                                <h2 className="font-black text-base text-gray-900 dark:text-white mb-1">กราฟแท่งความคืบหน้ารายห้อง</h2>
                                <p className="text-xs text-gray-400 font-medium mb-6">แสดงเป็นเปอร์เซ็นต์</p>
                                <ResponsiveContainer width="100%" height={Math.max(300, roomProgress.length * 36)}>
                                    <BarChart
                                        data={roomProgress.map(r => ({ name: r.label, percent: r.percent }))}
                                        layout="vertical"
                                        margin={{ top: 0, right: 44, left: 20, bottom: 0 }}
                                    >
                                        <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#f0f0f0" />
                                        <XAxis type="number" domain={[0, 100]} tick={{ fontSize: 11 }} tickFormatter={v => `${v}%`} />
                                        <YAxis type="category" dataKey="name" tick={{ fontSize: 11, fontWeight: 700 }} width={60} />
                                        <Tooltip
                                            formatter={(value: any) => [`${value}%`, "ความคืบหน้า"]}
                                            contentStyle={{ borderRadius: "12px", border: "none", boxShadow: "0 10px 40px rgba(0,0,0,0.12)" }}
                                        />
                                        <Bar dataKey="percent" radius={[0, 6, 6, 0]} label={{ position: "right", formatter: (v: any) => `${v}%`, fontSize: 11, fontWeight: 700 }}>
                                            {roomProgress.map((r, i) => (
                                                <Cell key={i} fill={getBarColor(r.percent)} />
                                            ))}
                                        </Bar>
                                    </BarChart>
                                </ResponsiveContainer>
                                <div className="flex items-center gap-5 mt-5 justify-center flex-wrap">
                                    {[
                                        { color: "bg-emerald-500", label: "≥ 80% (ดี)" },
                                        { color: "bg-amber-400", label: "50–79% (กำลังดำเนินการ)" },
                                        { color: "bg-rose-500", label: "< 50% (ต้องเร่ง)" },
                                    ].map((item, i) => (
                                        <div key={i} className="flex items-center gap-2">
                                            <div className={`w-3 h-3 rounded-sm ${item.color}`} />
                                            <span className="text-xs font-bold text-gray-500 dark:text-gray-400">{item.label}</span>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </MainLayout>
    );
};

export default HomeVisitTracking;
