import React, { useState, useEffect, useCallback, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import MainLayout from "@/layouts/MainLayout";
import { firestore, auth } from "@/firebase";
import { collection, getDocs, doc, getDoc, query, where } from "firebase/firestore";
import { getCurrentAcademicYear } from "@/utils/academicYearUtils";
import {
    FileText,
    ChevronLeft,
    Users,
    CheckCircle2,
    XCircle,
    ShieldAlert,
    Filter,
    Sparkles,
    Download,
} from "lucide-react";
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
}

interface Visit {
    id: string;
    studentId: string;
    visitDate: string;
    healthRisk?: string[];
    welfareRisk?: string[];
    drugRisk?: string[];
    violenceRisk?: string[];
    sexualRisk?: string[];
    gameRisk?: string[];
    visitSummary?: string;
    visitType?: string;
    bothParentsDeceased?: boolean;
    oneParentDeceased?: boolean;
    parentsSeparated?: boolean;
    notLivingWithParents?: boolean;
    schoolAssistanceNeeded?: string[];
    travelMethod?: string;
}

// ตรงกับตัวเลือกจริงในฟอร์มบันทึกเยี่ยมบ้าน (ข้อ "สิ่งที่ผู้ปกครองต้องการให้โรงเรียนช่วยเหลือ")
const OBEC_ASSISTANCE = ["ด้านการเรียน", "ด้านพฤติกรรม", "ด้านเศรษฐกิจ (เช่น ขอรับทุน)", "อื่นๆ"];

const HomeVisitSummaryOBEC: React.FC = () => {
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

    const availableLevels = useMemo(() => {
        const lvlSet = new Set<string>();
        allStudents.forEach(s => lvlSet.add(s.classLevel));
        return Array.from(lvlSet).sort((a, b) => a.localeCompare(b));
    }, [allStudents]);

    const availableRooms = useMemo(() => {
        const roomSet = new Set<string>();
        allStudents.filter(s => s.classLevel === selectedLevel).forEach(s => roomSet.add(s.room));
        return Array.from(roomSet).sort((a, b) => parseInt(a) - parseInt(b));
    }, [allStudents, selectedLevel]);

    const students = useMemo(
        () => allStudents.filter(s => s.classLevel === selectedLevel && s.room === selectedRoom),
        [allStudents, selectedLevel, selectedRoom]
    );

    const filteredVisits = useMemo(
        () => visits.filter(v => students.some(s => s.id === v.studentId)),
        [visits, students]
    );

    const latestVisitsMap = useMemo(() => {
        const map = new Map<string, Visit>();
        filteredVisits.forEach(v => {
            if (!map.has(v.studentId) || v.visitDate > map.get(v.studentId)!.visitDate)
                map.set(v.studentId, v);
        });
        return map;
    }, [filteredVisits]);

    const stats = useMemo(() => {
        const total = students.length;
        const visited = latestVisitsMap.size;
        const notVisited = total - visited;
        const latestVisits = Array.from(latestVisitsMap.values());

        const familySituation = {
            bothParentsDeceased: latestVisits.filter(v => v.bothParentsDeceased).length,
            oneParentDeceased: latestVisits.filter(v => v.oneParentDeceased).length,
            parentsSeparated: latestVisits.filter(v => v.parentsSeparated).length,
            notLivingWithParents: latestVisits.filter(v => v.notLivingWithParents).length,
        };

        // ฟอร์มมี 2 จุดที่พิมพ์ตัวเลือก "ด้านเศรษฐกิจ" ต่างกัน (มี/ไม่มีช่องว่างก่อนวงเล็บ) จึง normalize ให้เป็นคีย์เดียวกัน
        const normalizeAssistance = (a: string) => a.startsWith('ด้านเศรษฐกิจ') ? 'ด้านเศรษฐกิจ (เช่น ขอรับทุน)' : a;
        const assistanceCounts: Record<string, number> = {};
        latestVisits.forEach(v => {
            (v.schoolAssistanceNeeded || []).forEach(a => {
                const key = normalizeAssistance(a);
                assistanceCounts[key] = (assistanceCounts[key] || 0) + 1;
            });
        });

        const riskCount = latestVisits.filter(v =>
            (v.healthRisk?.length || 0) > 0 || (v.drugRisk?.length || 0) > 0 ||
            (v.violenceRisk?.length || 0) > 0 || (v.sexualRisk?.length || 0) > 0 || (v.gameRisk?.length || 0) > 0
        ).length;

        return { total, visited, notVisited, familySituation, assistanceCounts, riskCount, latestVisits };
    }, [students, latestVisitsMap]);

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

    const hasData = selectedLevel && selectedRoom;

    return (
        <MainLayout>
            <div className="min-h-screen bg-gray-50 dark:bg-[#1a1b1e]">

                {/* Hero Header */}
                <div className="bg-white dark:bg-[#212326] border-b border-gray-100 dark:border-gray-800">
                    <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-5">
                        <div className="flex items-center gap-4">
                            <button
                                onClick={() => navigate("/student-support/home-visit/summary")}
                                className="flex-shrink-0 p-2.5 bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-600 dark:text-gray-400 rounded-xl transition-all active:scale-95"
                            >
                                <ChevronLeft size={20} />
                            </button>
                            <div className="flex-shrink-0 w-10 h-10 bg-gradient-to-br from-emerald-500 to-teal-600 rounded-xl flex items-center justify-center shadow-md shadow-emerald-500/25">
                                <FileText size={18} className="text-white" />
                            </div>
                            <div className="min-w-0">
                                <div className="flex items-center gap-2">
                                    <h1 className="text-xl font-black text-gray-900 dark:text-white">สรุป สพฐ.</h1>
                                    <span className="px-2 py-0.5 bg-emerald-50 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400 rounded-lg text-[10px] font-bold uppercase tracking-wider">OBEC Format</span>
                                </div>
                                <p className="text-sm text-gray-400 dark:text-gray-500 font-medium">
                                    {hasData ? `ห้อง ${selectedLevel}/${selectedRoom}` : "เลือกห้องเรียนเพื่อสร้างรายงาน"}
                                </p>
                            </div>
                        </div>
                    </div>
                </div>

                <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-5">

                    {/* Info + Filter card */}
                    <div className="bg-white dark:bg-[#25262a] rounded-2xl border border-gray-100 dark:border-gray-800 shadow-sm overflow-hidden">
                        <div className="p-5 flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between">
                            <div className="flex flex-wrap gap-2">
                                {schoolName && (
                                    <span className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-gray-50 dark:bg-gray-800 text-gray-700 dark:text-gray-300 rounded-xl text-sm font-semibold border border-gray-100 dark:border-gray-700">
                                        <Sparkles size={12} className="text-emerald-400" />
                                        {schoolName}
                                    </span>
                                )}
                                {academicYear && (
                                    <span className="inline-flex items-center px-3 py-1.5 bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-300 rounded-xl text-sm font-semibold border border-emerald-100 dark:border-emerald-800/50">
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

                            {isPowerUser && (
                                <div className="flex items-center gap-2 flex-shrink-0">
                                    <select
                                        value={selectedLevel}
                                        onChange={e => { setSelectedLevel(e.target.value); setSelectedRoom(""); }}
                                        className="px-3 py-2 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl text-sm font-semibold text-gray-700 dark:text-gray-200 outline-none focus:ring-2 focus:ring-emerald-400 min-w-[120px]"
                                    >
                                        <option value="">ระดับชั้น</option>
                                        {availableLevels.map(l => <option key={l} value={l}>{l}</option>)}
                                    </select>
                                    <select
                                        value={selectedRoom}
                                        onChange={e => setSelectedRoom(e.target.value)}
                                        disabled={!selectedLevel}
                                        className="px-3 py-2 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl text-sm font-semibold text-gray-700 dark:text-gray-200 outline-none focus:ring-2 focus:ring-emerald-400 disabled:opacity-40 min-w-[100px]"
                                    >
                                        <option value="">ห้อง</option>
                                        {availableRooms.map(r => <option key={r} value={r}>ห้อง {r}</option>)}
                                    </select>
                                </div>
                            )}
                        </div>

                        {homeroomTeachers.length > 0 && (
                            <div className="border-t border-gray-50 dark:border-gray-800 px-5 py-3 flex flex-wrap gap-2">
                                {homeroomTeachers.map((t, i) => (
                                    <span key={i} className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-400 rounded-xl text-xs font-bold border border-emerald-100 dark:border-emerald-800/50">
                                        <Users size={11} />
                                        ครูที่ปรึกษา: {t.title || ""}{t.firstName || ""} {t.lastName || ""}
                                        {t.position ? ` · ${t.position}` : ""}
                                    </span>
                                ))}
                            </div>
                        )}
                    </div>

                    {!hasData ? (
                        <div className="bg-white dark:bg-[#25262a] rounded-2xl py-20 text-center border border-gray-100 dark:border-gray-800 shadow-sm">
                            <div className="w-14 h-14 bg-gray-50 dark:bg-gray-800 rounded-2xl flex items-center justify-center mx-auto mb-4">
                                <Filter size={24} className="text-gray-300 dark:text-gray-600" />
                            </div>
                            <p className="text-gray-500 dark:text-gray-400 font-bold">กรุณาเลือกระดับชั้นและห้องเรียน</p>
                            <p className="text-gray-400 dark:text-gray-600 text-sm mt-1">ใช้ตัวกรองด้านบนเพื่อเลือกห้องเรียน</p>
                        </div>
                    ) : (
                        <>
                            {/* PDF Export Card */}
                            <motion.div
                                initial={{ opacity: 0, y: 12 }}
                                animate={{ opacity: 1, y: 0 }}
                                className="relative bg-gradient-to-br from-emerald-500 to-teal-600 rounded-2xl p-6 shadow-lg shadow-emerald-500/20 overflow-hidden"
                            >
                                <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,_rgba(255,255,255,0.12),_transparent_60%)]" />
                                <div className="relative flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                                    <div className="text-white">
                                        <div className="flex items-center gap-2 mb-1">
                                            <Download size={18} />
                                            <h2 className="font-black text-lg">ส่งออก PDF แบบฟอร์ม สพฐ.</h2>
                                        </div>
                                        <p className="text-emerald-100 text-sm">
                                            ชั้น {selectedLevel}/{selectedRoom} · เยี่ยมแล้ว {stats.visited}/{stats.total} คน ({stats.total > 0 ? Math.round((stats.visited / stats.total) * 100) : 0}%)
                                        </p>
                                    </div>
                                    {schoolId && (
                                        <div className="shrink-0">
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
                                        </div>
                                    )}
                                </div>
                            </motion.div>

                            {/* Stats Grid */}
                            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                                {[
                                    { label: "นักเรียนทั้งหมด", value: stats.total, icon: <Users size={20} />, accent: "from-blue-500 to-indigo-600", text: "text-blue-600 dark:text-blue-400", sub: "ในห้องเรียน" },
                                    { label: "ออกเยี่ยมบ้านแล้ว", value: stats.visited, icon: <CheckCircle2 size={20} />, accent: "from-emerald-500 to-teal-600", text: "text-emerald-600 dark:text-emerald-400", sub: `${stats.total > 0 ? Math.round((stats.visited / stats.total) * 100) : 0}% ของห้อง` },
                                    { label: "ยังไม่ได้ออกเยี่ยม", value: stats.notVisited, icon: <XCircle size={20} />, accent: "from-rose-500 to-pink-600", text: "text-rose-600 dark:text-rose-400", sub: "รอดำเนินการ" },
                                ].map((item, i) => (
                                    <motion.div key={i} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.08 }}
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

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                                {/* Family Situation */}
                                <div className="bg-white dark:bg-[#25262a] rounded-2xl border border-gray-100 dark:border-gray-800 shadow-sm overflow-hidden">
                                    <div className="h-1 bg-gradient-to-r from-emerald-500 to-teal-600" />
                                    <div className="p-5">
                                        <h3 className="font-black text-base text-gray-900 dark:text-white flex items-center gap-2 mb-4">
                                            <Users size={16} className="text-emerald-600" />
                                            สภาพครอบครัว (สพฐ.)
                                        </h3>
                                        <div className="space-y-2">
                                            {[
                                                { label: "บิดามารดาเสียชีวิตทั้งคู่", value: stats.familySituation.bothParentsDeceased },
                                                { label: "บิดาหรือมารดาเสียชีวิต", value: stats.familySituation.oneParentDeceased },
                                                { label: "บิดามารดาแยกทาง/หย่าร้าง", value: stats.familySituation.parentsSeparated },
                                                { label: "ไม่ได้อาศัยกับบิดามารดา", value: stats.familySituation.notLivingWithParents },
                                            ].map((item, i) => (
                                                <div key={i} className="flex items-center justify-between py-2.5 border-b border-gray-50 dark:border-gray-800 last:border-0">
                                                    <span className="text-sm text-gray-600 dark:text-gray-400">{item.label}</span>
                                                    <span className={`font-black text-sm px-2.5 py-1 rounded-lg ${item.value > 0 ? "bg-rose-50 dark:bg-rose-900/20 text-rose-600 dark:text-rose-400" : "bg-gray-50 dark:bg-gray-800 text-gray-300 dark:text-gray-600"}`}>
                                                        {item.value} คน
                                                    </span>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                </div>

                                {/* School Assistance */}
                                <div className="bg-white dark:bg-[#25262a] rounded-2xl border border-gray-100 dark:border-gray-800 shadow-sm overflow-hidden">
                                    <div className="h-1 bg-gradient-to-r from-emerald-500 to-teal-600" />
                                    <div className="p-5">
                                        <h3 className="font-black text-base text-gray-900 dark:text-white flex items-center gap-2 mb-4">
                                            <ShieldAlert size={16} className="text-emerald-600" />
                                            ความต้องการความช่วยเหลือจากโรงเรียน
                                        </h3>
                                        <div className="space-y-3">
                                            {OBEC_ASSISTANCE.map((item) => {
                                                const count = stats.assistanceCounts[item] || 0;
                                                const pct = stats.visited > 0 ? Math.round((count / stats.visited) * 100) : 0;
                                                return (
                                                    <div key={item}>
                                                        <div className="flex items-center justify-between mb-1">
                                                            <span className="text-xs font-medium text-gray-600 dark:text-gray-400">{item}</span>
                                                            <span className={`text-xs font-black ${count > 0 ? "text-emerald-600 dark:text-emerald-400" : "text-gray-300 dark:text-gray-600"}`}>{count} คน</span>
                                                        </div>
                                                        <div className="h-1.5 bg-gray-100 dark:bg-gray-700 rounded-full overflow-hidden">
                                                            <div className="h-full bg-gradient-to-r from-emerald-400 to-teal-500 rounded-full transition-all" style={{ width: `${pct}%` }} />
                                                        </div>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    </div>
                                </div>
                            </div>

                            {/* Info Card */}
                            <div className="bg-white dark:bg-[#25262a] rounded-2xl border border-gray-100 dark:border-gray-800 shadow-sm overflow-hidden">
                                <div className="h-1 bg-gradient-to-r from-emerald-500 to-teal-600" />
                                <div className="p-5">
                                    <h3 className="font-black text-base text-gray-900 dark:text-white flex items-center gap-2 mb-4">
                                        <FileText size={16} className="text-emerald-600" />
                                        ข้อมูลสำหรับแบบรายงาน สพฐ.
                                    </h3>
                                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                                        {[
                                            { label: "โรงเรียน", value: schoolName },
                                            { label: "สังกัด", value: affiliation || "–" },
                                            { label: "ปีการศึกษา", value: academicYear ? `${academicYear}${semester ? ` ภาคเรียนที่ ${semester}` : ""}` : "–" },
                                            { label: "ระดับชั้น / ห้อง", value: selectedLevel && selectedRoom ? `${selectedLevel}/${selectedRoom}` : "–" },
                                            { label: "ผู้อำนวยการโรงเรียน", value: (directorPrefix || directorName) ? `${directorPrefix || ""}${directorName}` : "–" },
                                            { label: "ครูที่ปรึกษา", value: homeroomTeachers.length > 0 ? homeroomTeachers.map(t => `${t.title || ""}${t.firstName || ""} ${t.lastName || ""}`.trim()).join(" / ") : teacherName || "–" },
                                        ].map((item, i) => (
                                            <div key={i} className="bg-gray-50 dark:bg-gray-800/50 rounded-xl p-3.5 border border-gray-100 dark:border-gray-700/50">
                                                <p className="text-[10px] font-black text-gray-400 uppercase tracking-wider mb-1.5">{item.label}</p>
                                                <p className="text-sm font-bold text-gray-900 dark:text-white">{item.value}</p>
                                            </div>
                                        ))}
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

export default HomeVisitSummaryOBEC;
