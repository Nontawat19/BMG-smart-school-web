import React, { useState, useEffect, useCallback, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import MainLayout from "@/layouts/MainLayout";
import ProfileAvatar from "@/components/Shared/ProfileAvatar";
import { firestore, auth } from "@/firebase";
import { collection, getDocs, doc, getDoc, query, where } from "firebase/firestore";
import { getCurrentAcademicYear } from "@/utils/academicYearUtils";
import {
    PieChart as PieChartIcon,
    Users,
    AlertCircle,
    CheckCircle2,
    ShieldAlert,
    Activity,
    Filter,
    Loader2,
    Sparkles,
    ChevronLeft,
    BarChart3,
} from "lucide-react";
import {
    PieChart, Pie, Cell, ResponsiveContainer, Tooltip,
} from "recharts";
import { motion } from "framer-motion";
import HomeVisitSummaryPdfButton from "@/components/Pdf/HomeVisit/HomeVisitSummaryPdfButton";
import { getStudentStatus } from "@/utils/studentStatusUtils";

interface Student {
    id: string;
    studentId: string;
    title: string;
    firstName: string;
    lastName: string;
    classLevel: string;
    room: string;
    schoolId: string;
    profileImageUrl?: string;
    nickname?: string;
}

interface Visit {
    id: string;
    studentId: string;
    visitDate: string;
    familyAtmosphere?: string;
    healthRisk?: string[];
    welfareRisk?: string[];
    drugRisk?: string[];
    violenceRisk?: string[];
    sexualRisk?: string[];
    gameRisk?: string[];
    visitSummary?: string;
    schoolAssistanceNeeded?: string[];
}

const HomeVisitSummaryClassroom: React.FC = () => {
    const navigate = useNavigate();
    const [loading, setLoading] = useState(true);
    const [allStudents, setAllStudents] = useState<Student[]>([]);
    const [visits, setVisits] = useState<Visit[]>([]);
    const [schoolId, setSchoolId] = useState<string | null>(null);
    const [schoolName, setSchoolName] = useState("");
    const [teacherName, setTeacherName] = useState("");
    const [isPowerUser, setIsPowerUser] = useState(false);
    const [selectedLevel, setSelectedLevel] = useState("");
    const [selectedRoom, setSelectedRoom] = useState("");
    const [academicYear, setAcademicYear] = useState("");
    const [semester, setSemester] = useState("");
    const [directorName, setDirectorName] = useState("");
    const [directorPrefix, setDirectorPrefix] = useState("");
    const [affiliation, setAffiliation] = useState("");
    const [homeroomTeachers, setHomeroomTeachers] = useState<any[]>([]);

    const fetchData = useCallback(async () => {
        setLoading(true);
        try {
            const user = auth.currentUser;
            if (!user) return;
            const userDoc = await getDoc(doc(firestore, "users", user.uid));
            const userData = userDoc.data();
            const sid = userData?.schoolId;
            setSchoolId(sid);

            if (sid) {
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

                const roles = Array.isArray(userData?.role) ? userData.role : [userData?.role || ""];
                const isPower = roles.some((r: string) =>
                    ["admin", "school_admin", "super_admin", "academic", "academic_admin", "director", "student_affairs"].includes(r)
                );
                setIsPowerUser(isPower);

                const teacherSnap = await getDoc(doc(firestore, "school-settings", sid, "teachers", user.uid));
                if (teacherSnap.exists()) {
                    const tData = teacherSnap.data();
                    const titleMap: Record<string, string> = { 'ด.ช.': 'เด็กชาย', 'ด.ญ.': 'เด็กหญิง', 'น.ส.': 'นางสาว' };
                    const fullTitle = titleMap[tData.title] || tData.title || "";
                    setTeacherName(`${fullTitle}${tData.firstName || ""} ${tData.lastName || ""}`.trim());
                    if (!isPower) {
                        setSelectedLevel(tData.homeroomGrade || "");
                        setSelectedRoom(tData.homeroomRoom || "");
                    }
                } else {
                    setTeacherName(userData?.displayName || user.displayName || "");
                }

                const studentsSnap = await getDocs(collection(firestore, "school-settings", sid, "students"));
                const studentsList = studentsSnap.docs
                    .map(d => ({ id: d.id, ...d.data() } as Student))
                    .filter(s => getStudentStatus(s) === "กำลังศึกษาอยู่");
                setAllStudents(studentsList);

                if (isPower) {
                    const sorted = [...studentsList].sort((a, b) => a.classLevel.localeCompare(b.classLevel) || a.room.localeCompare(b.room));
                    if (sorted.length > 0) {
                        setSelectedLevel(sorted[0].classLevel);
                        setSelectedRoom(sorted[0].room);
                    }
                }

                const allVisits: Visit[] = [];
                await Promise.all(studentsList.map(async (student) => {
                    const visitsSnap = await getDocs(collection(firestore, "school-settings", sid, "students", student.id, "home-visits"));
                    visitsSnap.docs.forEach(d => allVisits.push({ id: d.id, ...d.data(), studentId: student.id } as Visit));
                }));
                setVisits(allVisits);
            }
        } catch (err) {
            console.error("Error fetching data:", err);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => { fetchData(); }, [fetchData]);

    useEffect(() => {
        if (!schoolId || !selectedLevel || !selectedRoom) { setHomeroomTeachers([]); return; }
        const fetchTeachers = async () => {
            try {
                const snap = await getDocs(
                    query(collection(firestore, "school-settings", schoolId, "teachers"),
                        where("isHomeroomTeacher", "==", true))
                );
                const list = snap.docs
                    .map(d => ({ id: d.id, ...d.data() } as any))
                    .filter(t => t.homeroomGrade?.toString().trim() === selectedLevel.toString().trim()
                        && t.homeroomRoom?.toString().trim() === selectedRoom.toString().trim())
                    .slice(0, 2);
                setHomeroomTeachers(list);
            } catch { setHomeroomTeachers([]); }
        };
        fetchTeachers();
    }, [schoolId, selectedLevel, selectedRoom]);

    const availableRooms = useMemo(() => {
        const roomSet = new Set<string>();
        allStudents.filter(s => s.classLevel === selectedLevel).forEach(s => roomSet.add(s.room));
        return Array.from(roomSet).sort((a, b) => parseInt(a) - parseInt(b));
    }, [allStudents, selectedLevel]);

    const availableLevels = useMemo(() => {
        const lvlSet = new Set<string>();
        allStudents.forEach(s => lvlSet.add(s.classLevel));
        return Array.from(lvlSet).sort((a, b) => a.localeCompare(b));
    }, [allStudents]);

    const students = useMemo(
        () => allStudents.filter(s => s.classLevel === selectedLevel && s.room === selectedRoom),
        [allStudents, selectedLevel, selectedRoom]
    );

    const filteredVisits = useMemo(
        () => visits.filter(v => students.some(s => s.id === v.studentId)),
        [visits, students]
    );

    const stats = useMemo(() => {
        const totalStudents = students.length;
        const visitedStudentIds = new Set(filteredVisits.map(v => v.studentId));
        const visitedCount = visitedStudentIds.size;
        const notVisitedCount = totalStudents - visitedCount;

        const latestVisitsMap = new Map<string, Visit>();
        filteredVisits.forEach(v => {
            if (!latestVisitsMap.has(v.studentId) || v.visitDate > latestVisitsMap.get(v.studentId)!.visitDate)
                latestVisitsMap.set(v.studentId, v);
        });
        const latestVisits = Array.from(latestVisitsMap.values());
        const riskTotal = latestVisits.filter(v =>
            (v.healthRisk?.length || 0) > 0 || (v.drugRisk?.length || 0) > 0 ||
            (v.violenceRisk?.length || 0) > 0 || (v.sexualRisk?.length || 0) > 0 || (v.gameRisk?.length || 0) > 0
        ).length;
        const urgentCount = latestVisits.filter(v => v.visitSummary === "ช่วยเหลือด่วน").length;
        return { totalStudents, visitedCount, notVisitedCount, riskTotal, urgentCount, latestVisits };
    }, [students, filteredVisits]);

    const visitStatusData = [
        { name: "ออกเยี่ยมแล้ว", value: stats.visitedCount, color: "#4F46E5" },
        { name: "ยังไม่ได้เยี่ยม", value: stats.notVisitedCount, color: "#E2E8F0" },
    ];

    const CustomTooltip = ({ active, payload }: any) => {
        if (active && payload?.length)
            return (
                <div className="bg-white dark:bg-gray-800 p-3 border border-gray-100 dark:border-gray-700 shadow-xl rounded-xl text-sm">
                    <p className="font-bold text-gray-900 dark:text-white mb-1">{payload[0].name}</p>
                    <p className="text-indigo-600 dark:text-indigo-400 font-black">{payload[0].value} คน</p>
                </div>
            );
        return null;
    };

    if (loading) {
        return (
            <div className="flex h-screen items-center justify-center bg-gray-50 dark:bg-[#1a1b1e]">
                <div className="flex flex-col items-center gap-3">
                    <div className="w-14 h-14 bg-gradient-to-br from-indigo-500 to-blue-600 rounded-2xl flex items-center justify-center shadow-lg shadow-indigo-500/30">
                        <Loader2 className="w-7 h-7 text-white animate-spin" />
                    </div>
                    <p className="text-gray-500 dark:text-gray-400 font-semibold text-sm">กำลังโหลดข้อมูลห้องเรียน...</p>
                </div>
            </div>
        );
    }

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
                            <div className="flex-shrink-0 w-10 h-10 bg-gradient-to-br from-indigo-500 to-blue-600 rounded-xl flex items-center justify-center shadow-md shadow-indigo-500/25">
                                <BarChart3 size={18} className="text-white" />
                            </div>
                            <div className="min-w-0">
                                <div className="flex items-center gap-2">
                                    <h1 className="text-xl font-black text-gray-900 dark:text-white">สรุปรายห้อง</h1>
                                    <span className="px-2 py-0.5 bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400 rounded-lg text-[10px] font-bold uppercase tracking-wider">Real-time</span>
                                </div>
                                <p className="text-sm text-gray-400 dark:text-gray-500 font-medium">
                                    {selectedLevel && selectedRoom ? `ห้อง ${selectedLevel}/${selectedRoom}` : "เลือกห้องเรียนเพื่อดูสถิติ"}
                                </p>
                            </div>
                        </div>
                    </div>
                </div>

                <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6">

                    {/* Info + Filter card */}
                    <div className="bg-white dark:bg-[#25262a] rounded-2xl border border-gray-100 dark:border-gray-800 shadow-sm overflow-hidden">
                        <div className="p-5 flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between">
                            <div className="flex flex-wrap gap-2">
                                {schoolName && (
                                    <span className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-gray-50 dark:bg-gray-800 text-gray-700 dark:text-gray-300 rounded-xl text-sm font-semibold border border-gray-100 dark:border-gray-700">
                                        <Sparkles size={12} className="text-indigo-400" />
                                        {schoolName}
                                    </span>
                                )}
                                {academicYear && (
                                    <span className="inline-flex items-center px-3 py-1.5 bg-indigo-50 dark:bg-indigo-900/20 text-indigo-700 dark:text-indigo-300 rounded-xl text-sm font-semibold border border-indigo-100 dark:border-indigo-800/50">
                                        ปี {academicYear}{semester ? ` เทอม ${semester}` : ""}
                                    </span>
                                )}
                                {affiliation && (
                                    <span className="inline-flex items-center px-3 py-1.5 bg-gray-50 dark:bg-gray-800 text-gray-500 dark:text-gray-400 rounded-xl text-xs font-medium border border-gray-100 dark:border-gray-700">
                                        {affiliation}
                                    </span>
                                )}
                                {(directorPrefix || directorName) && (
                                    <span className="inline-flex items-center px-3 py-1.5 bg-gray-50 dark:bg-gray-800 text-gray-500 dark:text-gray-400 rounded-xl text-xs font-medium border border-gray-100 dark:border-gray-700">
                                        ผอ. {directorPrefix}{directorName}
                                    </span>
                                )}
                            </div>

                            <div className="flex items-center gap-2 flex-shrink-0 flex-wrap">
                                {isPowerUser && (
                                    <>
                                        <select
                                            value={selectedLevel}
                                            onChange={e => { setSelectedLevel(e.target.value); setSelectedRoom(""); }}
                                            className="px-3 py-2 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl text-sm font-semibold text-gray-700 dark:text-gray-200 outline-none focus:ring-2 focus:ring-indigo-400 min-w-[120px]"
                                        >
                                            <option value="">ระดับชั้น</option>
                                            {availableLevels.map(l => <option key={l} value={l}>{l}</option>)}
                                        </select>
                                        <select
                                            value={selectedRoom}
                                            onChange={e => setSelectedRoom(e.target.value)}
                                            disabled={!selectedLevel}
                                            className="px-3 py-2 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl text-sm font-semibold text-gray-700 dark:text-gray-200 outline-none focus:ring-2 focus:ring-indigo-400 disabled:opacity-40 min-w-[100px]"
                                        >
                                            <option value="">ห้อง</option>
                                            {availableRooms.map(r => <option key={r} value={r}>ห้อง {r}</option>)}
                                        </select>
                                    </>
                                )}
                                {schoolId && selectedLevel && selectedRoom && (
                                    <HomeVisitSummaryPdfButton
                                        students={students}
                                        visits={filteredVisits}
                                        schoolName={schoolName}
                                        teacherName={teacherName}
                                        schoolId={schoolId}
                                        academicYear={academicYear}
                                        semester={semester}
                                        classLevel={selectedLevel}
                                        room={selectedRoom}
                                    />
                                )}
                            </div>
                        </div>

                        {homeroomTeachers.length > 0 && (
                            <div className="border-t border-gray-50 dark:border-gray-800 px-5 py-3 flex flex-wrap gap-2">
                                {homeroomTeachers.map((t, i) => (
                                    <span key={i} className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-indigo-50 dark:bg-indigo-900/20 text-indigo-700 dark:text-indigo-400 rounded-xl text-xs font-bold border border-indigo-100 dark:border-indigo-800/50">
                                        <Users size={11} />
                                        ครูที่ปรึกษา: {t.title || ""}{t.firstName || ""} {t.lastName || ""}
                                        {t.position ? ` · ${t.position}` : ""}
                                    </span>
                                ))}
                            </div>
                        )}
                    </div>

                    {(!selectedLevel || !selectedRoom) ? (
                        <div className="bg-white dark:bg-[#25262a] rounded-2xl py-20 text-center border border-gray-100 dark:border-gray-800 shadow-sm">
                            <div className="w-14 h-14 bg-gray-50 dark:bg-gray-800 rounded-2xl flex items-center justify-center mx-auto mb-4">
                                <Filter size={24} className="text-gray-300 dark:text-gray-600" />
                            </div>
                            <p className="text-gray-500 dark:text-gray-400 font-bold">กรุณาเลือกระดับชั้นและห้องเรียน</p>
                            <p className="text-gray-400 dark:text-gray-600 text-sm mt-1">ใช้ตัวกรองด้านบนเพื่อเลือกห้องเรียน</p>
                        </div>
                    ) : (
                        <>
                            {/* Stats Grid */}
                            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                                {[
                                    { title: "นักเรียนในห้อง", value: stats.totalStudents, icon: <Users size={20} />, accent: "from-blue-500 to-indigo-600", text: "text-blue-600 dark:text-blue-400", sub: "รายชื่อทั้งหมด" },
                                    { title: "ดำเนินการเยี่ยมแล้ว", value: stats.visitedCount, icon: <CheckCircle2 size={20} />, accent: "from-emerald-500 to-teal-600", text: "text-emerald-600 dark:text-emerald-400", sub: `${((stats.visitedCount / Math.max(stats.totalStudents, 1)) * 100).toFixed(1)}% ของห้อง` },
                                    { title: "พบกลุ่มเสี่ยง", value: stats.riskTotal, icon: <ShieldAlert size={20} />, accent: "from-amber-500 to-orange-600", text: "text-amber-600 dark:text-amber-400", sub: "รวมทุกประเภท" },
                                    { title: "ต้องการความช่วยเหลือด่วน", value: stats.urgentCount, icon: <AlertCircle size={20} />, accent: "from-rose-500 to-pink-600", text: "text-rose-600 dark:text-rose-400", sub: "กลุ่มวิกฤต" },
                                ].map((item, idx) => (
                                    <motion.div
                                        key={idx}
                                        initial={{ opacity: 0, y: 16 }}
                                        animate={{ opacity: 1, y: 0 }}
                                        transition={{ delay: idx * 0.07 }}
                                        className="bg-white dark:bg-[#25262a] rounded-2xl border border-gray-100 dark:border-gray-800 shadow-sm overflow-hidden"
                                    >
                                        <div className={`h-1 bg-gradient-to-r ${item.accent}`} />
                                        <div className="p-5">
                                            <div className={`inline-flex p-2.5 rounded-xl mb-3 bg-gray-50 dark:bg-gray-800/80 ${item.text}`}>
                                                {item.icon}
                                            </div>
                                            <p className="text-xs font-bold text-gray-400 mb-1">{item.title}</p>
                                            <div className="flex items-baseline gap-1.5">
                                                <span className="text-3xl font-black text-gray-900 dark:text-white">{item.value}</span>
                                                <span className="text-sm font-bold text-gray-400">คน</span>
                                            </div>
                                            <p className={`text-[11px] font-bold mt-2 ${item.text}`}>{item.sub}</p>
                                        </div>
                                    </motion.div>
                                ))}
                            </div>

                            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                                {/* Pie Chart */}
                                <div className="bg-white dark:bg-[#25262a] rounded-2xl border border-gray-100 dark:border-gray-800 shadow-sm overflow-hidden">
                                    <div className="h-1 bg-gradient-to-r from-indigo-500 to-blue-600" />
                                    <div className="p-6">
                                        <h3 className="font-black text-base text-gray-900 dark:text-white flex items-center gap-2 mb-6">
                                            <PieChartIcon size={18} className="text-indigo-500" />
                                            สถานะการเยี่ยมบ้าน
                                        </h3>
                                        <div className="relative h-[200px]">
                                            <ResponsiveContainer width="100%" height={200} debounce={50}>
                                                <PieChart>
                                                    <Pie data={visitStatusData} innerRadius={65} outerRadius={85} paddingAngle={4} dataKey="value" stroke="none">
                                                        {visitStatusData.map((entry, index) => <Cell key={index} fill={entry.color} />)}
                                                    </Pie>
                                                    <Tooltip content={<CustomTooltip />} />
                                                </PieChart>
                                            </ResponsiveContainer>
                                            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-center pointer-events-none">
                                                <p className="text-3xl font-black text-gray-900 dark:text-white">
                                                    {((stats.visitedCount / Math.max(stats.totalStudents, 1)) * 100).toFixed(0)}%
                                                </p>
                                                <p className="text-[9px] font-bold text-gray-400 tracking-widest uppercase">ดำเนินงาน</p>
                                            </div>
                                        </div>
                                        <div className="grid grid-cols-2 gap-3 mt-4 pt-4 border-t border-gray-50 dark:border-gray-800">
                                            <div className="bg-indigo-50 dark:bg-indigo-900/20 rounded-xl p-3 text-center">
                                                <div className="flex items-center justify-center gap-1.5 mb-1">
                                                    <div className="w-2 h-2 rounded-full bg-indigo-600" />
                                                    <span className="text-[10px] font-black text-indigo-600 dark:text-indigo-400 uppercase tracking-wider">เรียบร้อย</span>
                                                </div>
                                                <p className="text-xl font-black text-gray-900 dark:text-white">{stats.visitedCount}</p>
                                                <p className="text-[10px] text-gray-400 font-bold">คน</p>
                                            </div>
                                            <div className="bg-gray-50 dark:bg-gray-800/50 rounded-xl p-3 text-center">
                                                <div className="flex items-center justify-center gap-1.5 mb-1">
                                                    <div className="w-2 h-2 rounded-full bg-gray-300 dark:bg-gray-600" />
                                                    <span className="text-[10px] font-black text-gray-400 uppercase tracking-wider">รอดำเนิน</span>
                                                </div>
                                                <p className="text-xl font-black text-gray-900 dark:text-white">{stats.notVisitedCount}</p>
                                                <p className="text-[10px] text-gray-400 font-bold">คน</p>
                                            </div>
                                        </div>
                                    </div>
                                </div>

                                {/* Risk Students Table */}
                                <div className="lg:col-span-2 bg-white dark:bg-[#25262a] rounded-2xl border border-gray-100 dark:border-gray-800 shadow-sm overflow-hidden flex flex-col">
                                    <div className="h-1 bg-gradient-to-r from-rose-500 to-pink-600" />
                                    <div className="p-5 border-b border-gray-50 dark:border-gray-800">
                                        <h3 className="font-black text-base text-gray-900 dark:text-white flex items-center gap-2">
                                            <Activity size={18} className="text-rose-500" />
                                            กลุ่มนักเรียนที่ต้องการดูแลพิเศษ
                                        </h3>
                                        <p className="text-xs font-medium text-gray-400 mt-0.5">คัดกรองเฉพาะนักเรียนที่มีความเสี่ยง</p>
                                    </div>
                                    <div className="flex-1 overflow-auto">
                                        <table className="w-full">
                                            <thead className="bg-gray-50 dark:bg-gray-800/50">
                                                <tr>
                                                    <th className="px-5 py-3 text-left text-[10px] font-black text-gray-400 uppercase tracking-widest">นักเรียน</th>
                                                    <th className="px-5 py-3 text-left text-[10px] font-black text-gray-400 uppercase tracking-widest">ความเสี่ยง</th>
                                                    <th className="px-5 py-3 text-left text-[10px] font-black text-gray-400 uppercase tracking-widest">สรุปผล</th>
                                                </tr>
                                            </thead>
                                            <tbody className="divide-y divide-gray-50 dark:divide-gray-800">
                                                {stats.latestVisits.filter(v => v.visitSummary !== "ปกติ").map(v => {
                                                    const student = students.find(s => s.id === v.studentId);
                                                    return (
                                                        <tr key={v.id} className="hover:bg-gray-50 dark:hover:bg-gray-800/20 transition-colors">
                                                            <td className="px-5 py-3">
                                                                <div className="flex items-center gap-3">
                                                                    <ProfileAvatar
                                                                        src={student?.profileImageUrl || `https://ui-avatars.com/api/?name=${student?.firstName}+${student?.lastName}&background=4F46E5&color=fff`}
                                                                        className="w-9 h-9 border border-gray-100 dark:border-gray-700 flex-shrink-0"
                                                                        alt="Avatar"
                                                                    />
                                                                    <div>
                                                                        <p className="text-sm font-bold text-gray-900 dark:text-white leading-tight">{student?.firstName} {student?.lastName}</p>
                                                                        <p className="text-[10px] text-gray-400">เลขที่: {student?.studentId}</p>
                                                                    </div>
                                                                </div>
                                                            </td>
                                                            <td className="px-5 py-3">
                                                                <div className="flex flex-wrap gap-1">
                                                                    {(v.healthRisk?.length || 0) > 0 && <span className="bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400 px-1.5 py-0.5 rounded text-[9px] font-black">สุขภาพ</span>}
                                                                    {(v.drugRisk?.length || 0) > 0 && <span className="bg-rose-50 dark:bg-rose-900/20 text-rose-600 dark:text-rose-400 px-1.5 py-0.5 rounded text-[9px] font-black">ยาเสพติด</span>}
                                                                    {(v.violenceRisk?.length || 0) > 0 && <span className="bg-purple-50 dark:bg-purple-900/20 text-purple-600 dark:text-purple-400 px-1.5 py-0.5 rounded text-[9px] font-black">ความรุนแรง</span>}
                                                                    {(v.gameRisk?.length || 0) > 0 && <span className="bg-amber-50 dark:bg-amber-900/20 text-amber-600 dark:text-amber-400 px-1.5 py-0.5 rounded text-[9px] font-black">ติดเกม</span>}
                                                                    {(v.sexualRisk?.length || 0) > 0 && <span className="bg-pink-50 dark:bg-pink-900/20 text-pink-600 dark:text-pink-400 px-1.5 py-0.5 rounded text-[9px] font-black">เพศ</span>}
                                                                </div>
                                                            </td>
                                                            <td className="px-5 py-3">
                                                                <span className={`px-2.5 py-1 rounded-full text-[10px] font-black inline-flex items-center gap-1 ${v.visitSummary === "ช่วยเหลือด่วน" ? "bg-rose-50 dark:bg-rose-900/20 text-rose-600 dark:text-rose-400" : "bg-indigo-50 dark:bg-indigo-900/20 text-indigo-600 dark:text-indigo-400"}`}>
                                                                    {v.visitSummary === "ช่วยเหลือด่วน" && <AlertCircle size={9} />}
                                                                    {v.visitSummary}
                                                                </span>
                                                            </td>
                                                        </tr>
                                                    );
                                                })}
                                                {stats.latestVisits.filter(v => v.visitSummary !== "ปกติ").length === 0 && (
                                                    <tr>
                                                        <td colSpan={3} className="px-5 py-14 text-center">
                                                            <div className="w-12 h-12 bg-gray-50 dark:bg-gray-800 rounded-2xl flex items-center justify-center mx-auto mb-3">
                                                                <CheckCircle2 size={22} className="text-emerald-400" />
                                                            </div>
                                                            <p className="text-sm font-bold text-gray-400">ไม่พบนักเรียนกลุ่มเสี่ยงในห้องนี้</p>
                                                        </td>
                                                    </tr>
                                                )}
                                            </tbody>
                                        </table>
                                    </div>
                                </div>
                            </div>
                        </>
                    )}
                </div>
            </div>
        </MainLayout>
    );
};

export default HomeVisitSummaryClassroom;
