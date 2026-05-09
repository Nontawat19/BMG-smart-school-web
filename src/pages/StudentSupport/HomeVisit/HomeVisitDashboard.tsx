import React, { useState, useEffect, useCallback } from "react";
import { Link, useNavigate } from "react-router-dom";
import MainLayout from "@/layouts/MainLayout";
import { firestore, auth } from "@/firebase";
import { collection, getDocs, query, orderBy, doc, getDoc } from "firebase/firestore";
import {
    Search,
    Filter,
    Home,
    User,
    Calendar,
    MapPin,
    ChevronRight,
    ArrowLeft,
    PlusCircle,
    Clock,
    TrendingUp,
    CheckCircle2
} from "lucide-react";
import HomeVisitPdfButton from "@/components/Pdf/HomeVisit/HomeVisitPdfButton";
import { getLevelsByRange } from "@/utils/schoolUtils";


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
    studentStatus: string;
}

const getStudentInitials = (student: Student) => {
    const first = student.firstName?.charAt(0) ?? "";
    const last = student.lastName?.charAt(0) ?? "";
    return `${first}${last}`.toUpperCase();
};

const formatVisitDate = (dateString?: string) => {
    if (!dateString) return "";
    try {
        return new Date(dateString).toLocaleDateString("th-TH", {
            day: "2-digit",
            month: "short",
            year: "numeric"
        });
    } catch (error) {
        return dateString;
    }
};

const HomeVisitDashboard: React.FC = () => {
    const [students, setStudents] = useState<Student[]>([]);
    const [searchTerm, setSearchTerm] = useState("");
    const [isLoading, setIsLoading] = useState(true);
    const [schoolId, setSchoolId] = useState<string | null>(null);
    const [selectedClassLevel, setSelectedClassLevel] = useState("");
    const [selectedRoom, setSelectedRoom] = useState("");
    const [availableLevels, setAvailableLevels] = useState<string[]>([]);
    const [visitStatuses, setVisitStatuses] = useState<Record<string, { visited: boolean, date?: string }>>({});
    const [teacherName, setTeacherName] = useState("");
    const navigate = useNavigate();


    const fetchStudents = useCallback(async (currentSchoolId: string) => {
        setIsLoading(true);
        try {
            const studentsCollection = collection(firestore, "school-settings", currentSchoolId, "students");
            const q = query(studentsCollection, orderBy("firstName", "asc"));
            const querySnapshot = await getDocs(q);
            const studentsData = querySnapshot.docs.map(doc => ({
                id: doc.id,
                ...doc.data(),
            } as Student));
            setStudents(studentsData);

            // ดึงสถานะการเยี่ยมบ้านสำหรับนักเรียนที่โหลดมา
            const statuses: Record<string, { visited: boolean, date?: string }> = {};
            await Promise.all(studentsData.map(async (student) => {
                const visitsCol = collection(firestore, "school-settings", currentSchoolId, "students", student.id, "home-visits");
                const visitsSnap = await getDocs(query(visitsCol, orderBy("visitDate", "desc")));

                if (!visitsSnap.empty) {
                    const latestVisit = visitsSnap.docs[0].data();
                    statuses[student.id] = {
                        visited: true,
                        date: latestVisit.visitDate
                    };
                } else {
                    statuses[student.id] = { visited: false };
                }
            }));
            setVisitStatuses(statuses);
        } catch (err) {
            console.error("Error fetching students: ", err);
        } finally {
            setIsLoading(false);
        }
    }, []);

    useEffect(() => {
        const unsub = auth.onAuthStateChanged(async (user) => {
            if (user) {
                const userDocRef = doc(firestore, "users", user.uid);
                const userDocSnap = await getDoc(userDocRef);
                if (userDocSnap.exists()) {
                    const userData = userDocSnap.data();
                    const sid = userData.schoolId;
                    if (sid) {
                        setSchoolId(sid);

                        // ดึงข้อมูลครูของผู้ใช้ปัจจุบัน เพื่อเอาคำนำหน้า
                        const teacherRef = doc(firestore, "school-settings", sid, "teachers", user.uid);
                        const teacherSnap = await getDoc(teacherRef);
                        if (teacherSnap.exists()) {
                            const tData = teacherSnap.data();
                            // ขยายคำนำหน้าให้เต็ม (เช่น ด.ช. -> เด็กชาย)
                            const map: Record<string, string> = {
                                'ด.ช.': 'เด็กชาย',
                                'ด.ญ.': 'เด็กหญิง',
                                'น.ส.': 'นางสาว',
                                'นาย': 'นาย',
                                'นาง': 'นาง',
                            };
                            const fullTitle = map[tData.title] || tData.title || "";
                            setTeacherName(`${fullTitle}${tData.firstName} ${tData.lastName}`);
                        } else {
                            setTeacherName(userData.fullName || userData.displayName || user.displayName || "");
                        }

                        fetchStudents(sid);


                        // ดึงข้อมูลระดับชั้นของโรงเรียน
                        const schoolRef = doc(firestore, "school-settings", sid);
                        const schoolSnap = await getDoc(schoolRef);
                        if (schoolSnap.exists()) {
                            const data = schoolSnap.data();
                            const levels = getLevelsByRange(data.opportunityExpansionLevel || "");
                            setAvailableLevels(levels);
                        }
                    }
                }
            }
        });
        return () => unsub();
    }, [fetchStudents]);

    const filteredStudents = students.filter(student =>
        `${student.firstName} ${student.lastName}`.toLowerCase().includes(searchTerm.toLowerCase()) ||
        student.studentId.includes(searchTerm)
    ).filter(student => selectedClassLevel === '' || student.classLevel === selectedClassLevel)
        .filter(student => selectedRoom === '' || student.room === selectedRoom);

    return (
        <MainLayout>
            <div className="px-3 sm:px-4 md:px-6 lg:px-8 py-4 sm:py-6 lg:py-8 min-h-screen bg-slate-50 dark:bg-[#1a1b1e] transition-colors duration-300">
                <div className="max-w-7xl mx-auto">
                    {/* Header */}
                    <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-8 gap-4">
                        <div className="flex items-center gap-4">
                            <button
                                onClick={() => navigate("/student-support")}
                                className="p-2 bg-white dark:bg-[#2a2b2f] rounded-xl shadow-sm text-gray-600 dark:text-gray-400 hover:text-pink-600 dark:hover:text-pink-400 transition-all border border-gray-100 dark:border-gray-700"
                            >
                                <ArrowLeft size={24} />
                            </button>
                            <div>
                                <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 dark:text-white flex items-center gap-3">
                                    <Home className="text-pink-600 dark:text-pink-400" size={32} />
                                    ระบบเยี่ยมบ้านนักเรียน
                                </h1>
                                <p className="text-gray-500 dark:text-gray-400">เลือกนักเรียนที่ต้องการบันทึกข้อมูลการเยี่ยมบ้าน</p>
                            </div>
                        </div>
                        <div className="flex gap-2">
                            <Link
                                to="/student-support/home-visit/summary"
                                className="flex items-center gap-2 px-6 py-3 bg-pink-600 text-white rounded-2xl font-bold shadow-lg shadow-pink-500/20 hover:bg-pink-700 transition-all active:scale-95"
                            >
                                <TrendingUp size={20} />
                                <span>สรุปภาพรวมห้องเรียน</span>
                            </Link>
                        </div>
                    </div>

                    {/* Filters & Search */}
                    <div className="bg-white dark:bg-[#2a2b2f] p-4 rounded-3xl shadow-sm border border-gray-100 dark:border-gray-700 mb-8 flex flex-col lg:flex-row gap-4">
                        <div className="relative flex-grow">
                            <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" size={20} />
                            <input
                                type="text"
                                placeholder="ค้นหาชื่อนักเรียน หรือรหัสประจำตัว..."
                                className="w-full pl-12 pr-4 py-3 bg-gray-50 dark:bg-gray-800/50 border-none rounded-2xl focus:ring-2 focus:ring-pink-500/50 dark:text-white transition-all outline-none"
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                            />
                        </div>
                        <div className="flex gap-2">
                            <select
                                value={selectedClassLevel}
                                onChange={(e) => setSelectedClassLevel(e.target.value)}
                                className="px-4 py-3 bg-gray-50 dark:bg-gray-800/50 border-none rounded-2xl focus:ring-2 focus:ring-pink-500/50 dark:text-white outline-none cursor-pointer"
                            >
                                <option value="">ทุกชั้น</option>
                                {availableLevels.map(level => <option key={level} value={level}>{level}</option>)}
                            </select>
                            <select
                                value={selectedRoom}
                                onChange={(e) => setSelectedRoom(e.target.value)}
                                className="px-4 py-3 bg-gray-50 dark:bg-gray-800/50 border-none rounded-2xl focus:ring-2 focus:ring-pink-500/50 dark:text-white outline-none cursor-pointer"
                            >
                                <option value="">ทุกห้อง</option>
                                {Array.from({ length: 15 }, (_, i) => i + 1).map(r => <option key={r} value={r.toString()}>{r}</option>)}
                            </select>
                        </div>
                    </div>

                    {/* Student Grid */}
                    {isLoading ? (
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-3 gap-6">
                            {[...Array(8)].map((_, i) => (
                                <div key={i} className="bg-white dark:bg-[#2a2b2f] rounded-3xl p-6 shadow-sm animate-pulse border border-gray-100 dark:border-gray-700">
                                    <div className="flex items-center gap-4 mb-4">
                                        <div className="w-16 h-16 rounded-full bg-gray-200 dark:bg-gray-700"></div>
                                        <div className="flex-grow">
                                            <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-3/4 mb-2"></div>
                                            <div className="h-3 bg-gray-200 dark:bg-gray-700 rounded w-1/2"></div>
                                        </div>
                                    </div>
                                    <div className="h-10 bg-gray-200 dark:bg-gray-700 rounded-xl w-full"></div>
                                </div>
                            ))}
                        </div>
                    ) : (
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-3 gap-6">
                            {filteredStudents.map((student) => {
                                const visitInfo = visitStatuses[student.id];
                                const visited = visitInfo?.visited;
                                const visitDateLabel = visited ? formatVisitDate(visitInfo?.date) : "";

                                return (
                                    <div
                                        key={student.id}
                                        className="group relative rounded-[32px] bg-gradient-to-br from-pink-500/20 via-purple-500/10 to-blue-500/20 p-[1px] hover:shadow-pink-500/30 transition-all duration-300"
                                    >
                                        <div className="h-full rounded-[30px] bg-white dark:bg-[#1f2024] p-5 flex flex-col gap-5">
                                            <div className="flex items-start gap-4">
                                                <div className="relative">
                                                    {student.profileImageUrl ? (
                                                        <img
                                                            src={student.profileImageUrl}
                                                            alt={student.firstName}
                                                            className="w-16 h-16 rounded-full object-cover shadow-lg ring-4 ring-white/40 dark:ring-black/30"
                                                        />
                                                    ) : (
                                                        <div className="w-16 h-16 rounded-full bg-gradient-to-br from-emerald-400 to-green-500 text-white font-black flex items-center justify-center text-xl shadow-inner">
                                                            {getStudentInitials(student)}
                                                        </div>
                                                    )}
                                                    <div className="absolute -bottom-1 -right-1 w-7 h-7 bg-emerald-500 rounded-xl flex items-center justify-center border-2 border-white dark:border-[#1f2024]">
                                                        <User size={14} className="text-white" />
                                                    </div>
                                                </div>
                                                <div className="flex-1 min-w-0 space-y-2">
                                                    <div className="flex items-start justify-between gap-2">
                                                        <h3 className="font-bold text-gray-900 dark:text-white text-lg leading-tight group-hover:text-pink-500 whitespace-nowrap truncate">
                                                            {`${student.title}${student.firstName} ${student.lastName}`}
                                                        </h3>
                                                    </div>
                                                    <div className="flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400">
                                                        <MapPin size={14} className="text-pink-500" />
                                                        <span>ชั้น {student.classLevel}/{student.room}</span>
                                                    </div>
                                                </div>
                                            </div>

                                            <div className="grid grid-cols-2 gap-3 text-sm text-gray-600 dark:text-gray-300">
                                                <div className="p-3 rounded-2xl bg-gray-50 dark:bg-gray-800/60 border border-gray-100 dark:border-gray-700/60">
                                                    <p className="text-xs text-gray-400 dark:text-gray-500">รหัสนักเรียน</p>
                                                    <p className="font-semibold text-gray-900 dark:text-white truncate">{student.studentId}</p>
                                                </div>
                                                <div className="p-3 rounded-2xl bg-gray-50 dark:bg-gray-800/60 border border-gray-100 dark:border-gray-700/60">
                                                    <p className="text-xs text-gray-400 dark:text-gray-500">สถานะการเยี่ยม</p>
                                                    <p className={`font-semibold ${visited ? "text-emerald-500" : "text-gray-400"}`}>
                                                        {visited ? "เยี่ยมแล้ว" : "รอดำเนินการ"}
                                                    </p>
                                                </div>
                                            </div>

                                            <div className={`flex items-center gap-2 text-sm px-4 py-2 rounded-2xl border font-medium ${visited ? "bg-emerald-50 border-emerald-100 text-emerald-600 dark:bg-emerald-900/30 dark:border-emerald-800 dark:text-emerald-200" : "bg-gray-100 border-gray-100 text-gray-500 dark:bg-gray-800/60 dark:border-gray-700 dark:text-gray-300"}`}>
                                                {visited ? (
                                                    <>
                                                        <CheckCircle2 size={16} />
                                                        <span>เยี่ยมแล้ว {visitDateLabel && `(${visitDateLabel})`}</span>
                                                    </>
                                                ) : (
                                                    <>
                                                        <Clock size={16} />
                                                        <span>ยังไม่ได้บันทึกการเยี่ยม</span>
                                                    </>
                                                )}
                                            </div>

                                            <div className="flex flex-wrap gap-2 mt-auto">
                                                <Link
                                                    to={`/student-support/home-visit/new/${student.id}`}
                                                    className="flex-1 min-w-[180px] flex items-center justify-center gap-2 bg-gradient-to-r from-pink-600 to-pink-500 hover:from-pink-500 hover:to-pink-600 text-white py-3 rounded-2xl font-semibold shadow-lg shadow-pink-500/30 transition-all active:scale-95"
                                                >
                                                    <PlusCircle size={18} />
                                                    <span>{visited ? 'บันทึกเพิ่มเติม' : 'บันทึกการเยี่ยม'}</span>
                                                </Link>

                                                {visited && schoolId && (
                                                    <div className="flex items-center">
                                                        <HomeVisitPdfButton
                                                            student={student}
                                                            schoolId={schoolId}
                                                            teacherName={teacherName}
                                                        />
                                                    </div>
                                                )}

                                                <button
                                                    onClick={() => navigate(`/school/${student.schoolId}/students/view/${student.id}`)}
                                                    className="px-4 py-3 border border-gray-200 dark:border-gray-700 rounded-2xl text-gray-600 dark:text-gray-300 hover:text-pink-500 hover:border-pink-400 dark:hover:text-pink-300 dark:hover:border-pink-500 transition-all flex items-center gap-2"
                                                    title="ดูรายละเอียดข้อมูลนักเรียน"
                                                >
                                                    <span className="text-sm font-medium">ดูข้อมูล</span>
                                                    <ChevronRight size={18} />
                                                </button>
                                            </div>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    )}

                    {!isLoading && filteredStudents.length === 0 && (
                        <div className="flex flex-col items-center justify-center py-20 bg-white dark:bg-[#2a2b2f] rounded-3xl shadow-sm border border-dashed border-gray-200 dark:border-gray-700">
                            <div className="w-20 h-20 bg-gray-100 dark:bg-gray-800 rounded-full flex items-center justify-center mb-4">
                                <Search size={40} className="text-gray-400" />
                            </div>
                            <p className="text-gray-500 dark:text-gray-400 text-lg font-medium">ไม่พบข้อมูลนักเรียนที่คุณค้นหา</p>
                            <button
                                onClick={() => { setSearchTerm(""); setSelectedClassLevel(""); setSelectedRoom(""); }}
                                className="mt-4 text-pink-600 dark:text-pink-400 font-semibold hover:underline"
                            >
                                ล้างการค้นหาทั้งหมด
                            </button>
                        </div>
                    )}
                </div>
            </div>
        </MainLayout>
    );
};

export default HomeVisitDashboard;
