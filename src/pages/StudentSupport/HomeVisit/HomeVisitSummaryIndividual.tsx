import React, { useState, useEffect, useCallback, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import MainLayout from "@/layouts/MainLayout";
import ProfileAvatar from "@/components/Shared/ProfileAvatar";
import { firestore, auth } from "@/firebase";
import { collection, getDocs, query, orderBy, doc, getDoc } from "firebase/firestore";
import {
    Search,
    ChevronLeft,
    User,
    CheckCircle2,
    Clock,
    MapPin,
    Filter,
} from "lucide-react";
import { motion } from "framer-motion";
import HomeVisitPdfButton from "@/components/Pdf/HomeVisit/HomeVisitPdfButton";
import { getStudentStatus } from "@/utils/studentStatusUtils";

interface Student {
    id: string;
    profileImageUrl?: string;
    studentId: string;
    title: string;
    firstName: string;
    lastName: string;
    classLevel: string;
    room: string;
    schoolId: string;
}

const formatVisitDate = (dateString?: string) => {
    if (!dateString) return "";
    try {
        return new Date(dateString).toLocaleDateString("th-TH", { day: "2-digit", month: "short", year: "numeric" });
    } catch {
        return dateString;
    }
};

const HomeVisitSummaryIndividual: React.FC = () => {
    const navigate = useNavigate();
    const [loading, setLoading] = useState(true);
    const [schoolId, setSchoolId] = useState<string | null>(null);
    const [students, setStudents] = useState<Student[]>([]);
    const [visitStatuses, setVisitStatuses] = useState<Record<string, { visited: boolean; date?: string }>>({});
    const [teacherName, setTeacherName] = useState("");
    const [teacherPosition, setTeacherPosition] = useState("");
    const [searchTerm, setSearchTerm] = useState("");
    const [selectedLevel, setSelectedLevel] = useState("");
    const [selectedRoom, setSelectedRoom] = useState("");
    const [currentPage, setCurrentPage] = useState(1);
    const studentsPerPage = 20;

    const fetchData = useCallback(async () => {
        setLoading(true);
        try {
            const user = auth.currentUser;
            if (!user) return;
            const userDoc = await getDoc(doc(firestore, "users", user.uid));
            const userData = userDoc.data();
            const sid = userData?.schoolId;
            setSchoolId(sid);
            if (!sid) return;

            const teacherSnap = await getDoc(doc(firestore, "school-settings", sid, "teachers", user.uid));
            if (teacherSnap.exists()) {
                const tData = teacherSnap.data();
                const titleMap: Record<string, string> = { 'ด.ช.': 'เด็กชาย', 'ด.ญ.': 'เด็กหญิง', 'น.ส.': 'นางสาว' };
                const fullTitle = titleMap[tData.title] || tData.title || "";
                setTeacherName(`${fullTitle}${tData.firstName || ""} ${tData.lastName || ""}`.trim());
                setTeacherPosition(tData.position || "ครู");
            } else {
                setTeacherName(userData?.displayName || user.displayName || "");
            }

            const studentsCollection = collection(firestore, "school-settings", sid, "students");
            const q = query(studentsCollection, orderBy("firstName", "asc"));
            const studentsSnap = await getDocs(q);
            const studentsList = studentsSnap.docs
                .map(d => ({ id: d.id, ...d.data() } as Student))
                .filter(s => getStudentStatus(s) === "กำลังศึกษาอยู่");
            setStudents(studentsList);

            const statuses: Record<string, { visited: boolean; date?: string }> = {};
            await Promise.all(studentsList.map(async (student) => {
                const visitsSnap = await getDocs(query(collection(firestore, "school-settings", sid, "students", student.id, "home-visits"), orderBy("visitDate", "desc")));
                statuses[student.id] = visitsSnap.empty
                    ? { visited: false }
                    : { visited: true, date: visitsSnap.docs[0].data().visitDate };
            }));
            setVisitStatuses(statuses);
        } catch (err) {
            console.error("Error fetching data:", err);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => { fetchData(); }, [fetchData]);

    useEffect(() => { setCurrentPage(1); }, [searchTerm, selectedLevel, selectedRoom]);

    const availableLevels = useMemo(() => {
        const set = new Set<string>();
        students.forEach(s => set.add(s.classLevel));
        return Array.from(set).sort((a, b) => a.localeCompare(b));
    }, [students]);

    const availableRooms = useMemo(() => {
        const set = new Set<string>();
        students.filter(s => s.classLevel === selectedLevel).forEach(s => set.add(s.room));
        return Array.from(set).sort((a, b) => parseInt(a) - parseInt(b));
    }, [students, selectedLevel]);

    const filteredStudents = useMemo(() => students
        .filter(s => `${s.firstName} ${s.lastName}`.toLowerCase().includes(searchTerm.toLowerCase()) || s.studentId.includes(searchTerm))
        .filter(s => !selectedLevel || s.classLevel === selectedLevel)
        .filter(s => !selectedRoom || s.room === selectedRoom)
        .sort((a, b) => a.classLevel.localeCompare(b.classLevel) || parseInt(a.room) - parseInt(b.room) || `${a.firstName}${a.lastName}`.localeCompare(`${b.firstName}${b.lastName}`, "th")),
        [students, searchTerm, selectedLevel, selectedRoom]);

    const totalPages = Math.ceil(filteredStudents.length / studentsPerPage);
    const currentStudents = filteredStudents.slice((currentPage - 1) * studentsPerPage, currentPage * studentsPerPage);

    if (loading) {
        return (
            <div className="min-h-screen bg-gray-50 dark:bg-[#1a1b1e] p-4 sm:p-6">
                <div className="max-w-5xl w-full mx-auto space-y-4">
                    <div className="h-10 w-64 rounded-lg bg-gray-200 dark:bg-gray-700 animate-pulse"></div>
                    {[...Array(6)].map((_, i) => (
                        <div key={`skeleton-${i}`} className="flex items-center gap-4 bg-white dark:bg-[#2a2b2f] rounded-2xl p-4 border border-gray-100 dark:border-gray-700">
                            <div className="h-12 w-12 rounded-full bg-gray-200 dark:bg-gray-700 animate-pulse shrink-0"></div>
                            <div className="flex-1 space-y-2">
                                <div className="h-3.5 w-1/3 rounded bg-gray-200 dark:bg-gray-700 animate-pulse"></div>
                                <div className="h-3 w-1/4 rounded bg-gray-200 dark:bg-gray-700 animate-pulse"></div>
                            </div>
                        </div>
                    ))}
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
                        <div className="flex items-center gap-4">
                            <button
                                onClick={() => navigate("/student-support/home-visit/summary")}
                                className="flex-shrink-0 p-2.5 bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-600 dark:text-gray-400 rounded-xl transition-all active:scale-95"
                            >
                                <ChevronLeft size={20} />
                            </button>
                            <div className="flex-shrink-0 w-10 h-10 bg-gradient-to-br from-cyan-500 to-sky-600 rounded-xl flex items-center justify-center shadow-md shadow-cyan-500/25">
                                <User size={18} className="text-white" />
                            </div>
                            <div className="min-w-0">
                                <h1 className="text-xl font-black text-gray-900 dark:text-white">รายงานรายคน</h1>
                                <p className="text-sm text-gray-400 dark:text-gray-500 font-medium">{filteredStudents.length} คน · เลือกนักเรียนเพื่อพิมพ์แบบฟอร์มรายบุคคล</p>
                            </div>
                        </div>
                    </div>
                </div>

                <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-5">

                    {/* Filter card */}
                    <div className="bg-white dark:bg-[#25262a] rounded-2xl border border-gray-100 dark:border-gray-800 shadow-sm p-5 flex flex-col lg:flex-row gap-3">
                        <div className="relative flex-grow">
                            <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
                            <input
                                type="text"
                                placeholder="ค้นหาชื่อนักเรียน หรือรหัสประจำตัว..."
                                className="w-full pl-11 pr-4 py-2.5 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl focus:ring-2 focus:ring-cyan-400 dark:text-white transition-all outline-none text-sm"
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                            />
                        </div>
                        <div className="flex gap-2 flex-wrap">
                            <select
                                value={selectedLevel}
                                onChange={(e) => { setSelectedLevel(e.target.value); setSelectedRoom(""); }}
                                className="px-3 py-2.5 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl text-sm font-semibold text-gray-700 dark:text-gray-200 outline-none focus:ring-2 focus:ring-cyan-400 min-w-[110px]"
                            >
                                <option value="">ทุกชั้น</option>
                                {availableLevels.map(l => <option key={l} value={l}>{l}</option>)}
                            </select>
                            <select
                                value={selectedRoom}
                                onChange={(e) => setSelectedRoom(e.target.value)}
                                disabled={!selectedLevel}
                                className="px-3 py-2.5 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl text-sm font-semibold text-gray-700 dark:text-gray-200 outline-none focus:ring-2 focus:ring-cyan-400 disabled:opacity-40 min-w-[90px]"
                            >
                                <option value="">ทุกห้อง</option>
                                {availableRooms.map(r => <option key={r} value={r}>ห้อง {r}</option>)}
                            </select>
                        </div>
                    </div>

                    {/* Student list */}
                    {filteredStudents.length === 0 ? (
                        <div className="bg-white dark:bg-[#25262a] rounded-2xl py-20 text-center border border-gray-100 dark:border-gray-800 shadow-sm">
                            <div className="w-14 h-14 bg-gray-50 dark:bg-gray-800 rounded-2xl flex items-center justify-center mx-auto mb-4">
                                <Filter size={24} className="text-gray-300 dark:text-gray-600" />
                            </div>
                            <p className="text-gray-500 dark:text-gray-400 font-bold">ไม่พบนักเรียนตามเงื่อนไขที่เลือก</p>
                        </div>
                    ) : (
                        <div className="bg-white dark:bg-[#25262a] rounded-2xl border border-gray-100 dark:border-gray-800 shadow-sm divide-y divide-gray-50 dark:divide-gray-800 overflow-hidden">
                            {currentStudents.map((student, idx) => {
                                const info = visitStatuses[student.id];
                                const visited = info?.visited;
                                return (
                                    <motion.div
                                        key={student.id}
                                        initial={{ opacity: 0 }}
                                        animate={{ opacity: 1 }}
                                        transition={{ delay: idx * 0.02 }}
                                        className="flex items-center gap-4 p-4 hover:bg-gray-50 dark:hover:bg-gray-800/30 transition-colors"
                                    >
                                        <ProfileAvatar
                                            src={student.profileImageUrl || `https://ui-avatars.com/api/?name=${student.firstName}+${student.lastName}&background=0891B2&color=fff`}
                                            className="w-11 h-11 border border-gray-100 dark:border-gray-700 shrink-0"
                                            alt="Avatar"
                                        />
                                        <div className="min-w-0 flex-1">
                                            <p className="font-bold text-gray-900 dark:text-white text-sm truncate">{student.title}{student.firstName} {student.lastName}</p>
                                            <div className="flex flex-wrap items-center gap-x-2 gap-y-1 mt-0.5 text-xs text-gray-400">
                                                <span className="inline-flex items-center gap-1"><MapPin size={11} /> ชั้น {student.classLevel}/{student.room}</span>
                                                <span>•</span>
                                                <span>รหัส: {student.studentId}</span>
                                            </div>
                                        </div>
                                        <div className={`hidden sm:flex items-center gap-1.5 px-3 py-1.5 rounded-full border text-xs font-semibold shrink-0 ${visited ? "bg-emerald-50 border-emerald-100 text-emerald-600 dark:bg-emerald-950/40 dark:border-emerald-800/60 dark:text-emerald-400" : "bg-gray-50 border-gray-100 text-gray-400 dark:bg-gray-800/40 dark:border-gray-700/60 dark:text-gray-500"}`}>
                                            {visited ? <CheckCircle2 size={13} /> : <Clock size={13} />}
                                            <span>{visited ? formatVisitDate(info?.date) : "ยังไม่ได้เยี่ยม"}</span>
                                        </div>
                                        {visited && schoolId && (
                                            <HomeVisitPdfButton
                                                student={student}
                                                schoolId={schoolId}
                                                teacherName={teacherName}
                                                teacherPosition={teacherPosition}
                                                className="p-2.5 bg-cyan-50 hover:bg-cyan-100 dark:bg-cyan-950/20 dark:hover:bg-cyan-950/40 text-cyan-600 dark:text-cyan-400 rounded-full border border-cyan-100 dark:border-cyan-900/30 transition-all active:scale-90 shrink-0"
                                            />
                                        )}
                                    </motion.div>
                                );
                            })}
                        </div>
                    )}

                    {/* Pagination */}
                    {totalPages > 1 && (
                        <div className="flex items-center justify-between gap-4 bg-white dark:bg-[#25262a] p-4 rounded-2xl border border-gray-100 dark:border-gray-800 shadow-sm">
                            <p className="text-xs text-gray-400 font-medium">หน้า {currentPage} จาก {totalPages}</p>
                            <div className="flex items-center gap-1">
                                <button
                                    onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                                    disabled={currentPage === 1}
                                    className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-gray-50 dark:bg-gray-800 text-gray-600 dark:text-gray-300 disabled:opacity-40"
                                >
                                    ก่อนหน้า
                                </button>
                                <button
                                    onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                                    disabled={currentPage === totalPages}
                                    className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-gray-50 dark:bg-gray-800 text-gray-600 dark:text-gray-300 disabled:opacity-40"
                                >
                                    ถัดไป
                                </button>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </MainLayout>
    );
};

export default HomeVisitSummaryIndividual;
