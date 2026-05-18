import React, { useState, useEffect, useCallback } from "react";
import { Link, useNavigate } from "react-router-dom";
import MainLayout from "@/layouts/MainLayout";
import ProfileAvatar from "@/components/Shared/ProfileAvatar";
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
    ChevronLeft,
    ArrowLeft,
    PlusCircle,
    Clock,
    TrendingUp,
    CheckCircle2,
    Copy,
    RefreshCw
} from "lucide-react";
import HomeVisitPdfButton from "@/components/Pdf/HomeVisit/HomeVisitPdfButton";
import { getLevelsByRange } from "@/utils/schoolUtils";
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
    studentStatus: string;
    gender?: string;
    number?: string;
    studentNumber?: string;
}

const getStudentGender = (student: Student) => {
    if (student.gender === "ชาย" || student.gender === "หญิง") {
        return student.gender;
    }
    if (student.gender?.toLowerCase() === "male") return "ชาย";
    if (student.gender?.toLowerCase() === "female") return "หญิง";
    
    const title = student.title || "";
    if (title.includes("ด.ช.") || title.includes("นาย") || title.includes("เด็กชาย")) {
        return "ชาย";
    }
    if (title.includes("ด.ญ.") || title.includes("น.ส.") || title.includes("นาง") || title.includes("เด็กหญิง") || title.includes("นางสาว")) {
        return "หญิง";
    }
    return "ชาย";
};

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
    const [sortBy, setSortBy] = useState<'studentId' | 'number' | 'name'>('studentId');
    const [isPowerUser, setIsPowerUser] = useState(true);
    const [hasHomeroom, setHasHomeroom] = useState(true);
    const [currentPage, setCurrentPage] = useState(1);
    const studentsPerPage = 30;
    const navigate = useNavigate();


    const fetchStudents = useCallback(async (currentSchoolId: string) => {
        setIsLoading(true);
        try {
            const studentsCollection = collection(firestore, "school-settings", currentSchoolId, "students");
            const q = query(studentsCollection, orderBy("firstName", "asc"));
            const querySnapshot = await getDocs(q);
            const studentsData = querySnapshot.docs
                .map(doc => ({
                    id: doc.id,
                    ...doc.data(),
                } as Student))
                .filter(student => getStudentStatus(student) === "กำลังศึกษา");
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

                        // ตรวจสอบระดับสิทธิ์ (Role Checking)
                        const roles = Array.isArray(userData.role) ? userData.role : [userData.role || ""];
                        const isPower = roles.some((r: string) =>
                            r === 'admin' ||
                            r === 'school_admin' ||
                            r === 'super_admin' ||
                            r === 'academic' ||
                            r === 'academic_admin' ||
                            r === 'director'
                        );
                        setIsPowerUser(isPower);

                        // ดึงข้อมูลครูของผู้ใช้ปัจจุบัน เพื่อเอาคำนำหน้า และข้อมูลประจำชั้น
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

                            // ถ้าเป็นครูผู้สอนทั่วไป (ไม่มีสิทธิ์ Power User) ให้ล็อกชั้นและห้องเรียนประจำชั้นของตนเอง
                            if (!isPower) {
                                const hrGrade = tData.homeroomGrade || "";
                                const hrRoom = tData.homeroomRoom || "";
                                if (hrGrade) {
                                    setSelectedClassLevel(hrGrade);
                                    setSelectedRoom(hrRoom);
                                    setHasHomeroom(true);
                                } else {
                                    setHasHomeroom(false);
                                }
                            }
                        } else {
                            setTeacherName(userData.fullName || userData.displayName || user.displayName || "");
                            if (!isPower) {
                                setHasHomeroom(false);
                            }
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

    useEffect(() => {
        setCurrentPage(1);
    }, [searchTerm, selectedClassLevel, selectedRoom, sortBy]);

    const filteredStudents = students.filter(student =>
        `${student.firstName} ${student.lastName}`.toLowerCase().includes(searchTerm.toLowerCase()) ||
        student.studentId.includes(searchTerm)
    ).filter(student => selectedClassLevel === '' || student.classLevel === selectedClassLevel)
        .filter(student => selectedRoom === '' || student.room === selectedRoom);

    const sortedStudents = [...filteredStudents].sort((a, b) => {
        const genderA = getStudentGender(a);
        const genderB = getStudentGender(b);

        // ชาย (Male) comes before หญิง (Female)
        if (genderA !== genderB) {
            return genderA === "ชาย" ? -1 : 1;
        }

        if (sortBy === 'studentId') {
            const idA = a.studentId || "";
            const idB = b.studentId || "";
            const idComp = idA.localeCompare(idB, undefined, { numeric: true });
            if (idComp !== 0) return idComp;
        } else if (sortBy === 'number') {
            const numA = Number(a.number || a.studentNumber || 999);
            const numB = Number(b.number || b.studentNumber || 999);
            if (numA !== numB) return numA - numB;
        }

        // Secondary / Fallback: Name alphabetically
        const nameA = `${a.firstName} ${a.lastName}`;
        const nameB = `${b.firstName} ${b.lastName}`;
        return nameA.localeCompare(nameB, "th");
    });

    const indexOfLastStudent = currentPage * studentsPerPage;
    const indexOfFirstStudent = indexOfLastStudent - studentsPerPage;
    const currentStudents = sortedStudents.slice(indexOfFirstStudent, indexOfLastStudent);
    const totalPages = Math.ceil(sortedStudents.length / studentsPerPage);

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
                        <div className="flex flex-wrap gap-2">
                            <select
                                value={sortBy}
                                onChange={(e) => setSortBy(e.target.value as any)}
                                className="px-4 py-3 bg-gray-50 dark:bg-gray-800/50 border-none rounded-2xl focus:ring-2 focus:ring-pink-500/50 dark:text-white outline-none cursor-pointer font-semibold text-gray-700"
                            >
                                <option value="studentId">เรียง: เลขประจำตัว ชาย-หญิง</option>
                                <option value="number">เรียง: เลขที่ ชาย-หญิง</option>
                                <option value="name">เรียง: ตัวอักษร ชาย-หญิง</option>
                            </select>
                            <select
                                value={selectedClassLevel}
                                onChange={(e) => setSelectedClassLevel(e.target.value)}
                                disabled={!isPowerUser}
                                className={`px-4 py-3 bg-gray-50 dark:bg-gray-800/50 border-none rounded-2xl focus:ring-2 focus:ring-pink-500/50 dark:text-white outline-none cursor-pointer text-gray-700 ${!isPowerUser ? 'opacity-60 cursor-not-allowed' : ''}`}
                            >
                                <option value="">ทุกชั้น</option>
                                {availableLevels.map(level => <option key={level} value={level}>{level}</option>)}
                            </select>
                            <select
                                value={selectedRoom}
                                onChange={(e) => setSelectedRoom(e.target.value)}
                                disabled={!isPowerUser}
                                className={`px-4 py-3 bg-gray-50 dark:bg-gray-800/50 border-none rounded-2xl focus:ring-2 focus:ring-pink-500/50 dark:text-white outline-none cursor-pointer text-gray-700 ${!isPowerUser ? 'opacity-60 cursor-not-allowed' : ''}`}
                            >
                                <option value="">ทุกห้อง</option>
                                {Array.from({ length: 15 }, (_, i) => i + 1).map(r => <option key={r} value={r.toString()}>{r}</option>)}
                            </select>
                        </div>
                    </div>

                    {!isPowerUser && !hasHomeroom && (
                        <div className="bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-900/50 p-6 rounded-3xl mb-8 flex items-start gap-4 text-amber-800 dark:text-amber-300">
                            <span className="text-2xl mt-0.5">⚠️</span>
                            <div>
                                <h4 className="font-bold text-lg mb-1">ยังไม่ได้รับการกำหนดชั้นประจำหมู่เรียน (โฮมรูม)</h4>
                                <p className="text-sm opacity-90 leading-relaxed">บัญชีผู้สอนของคุณยังไม่ได้ระบุระดับชั้นและห้องเรียนที่เป็นครูประจำชั้นในฐานข้อมูล กรุณาติดต่อผู้ดูแลระบบ (Admin) หรือฝ่ายวิชาการเพื่อทำรายการข้อมูลดังกล่าว เพื่อให้สามารถใช้งานและลงบันทึกข้อมูลการเยี่ยมบ้านนักเรียนได้ครับ</p>
                            </div>
                        </div>
                    )}

                    {/* Student List (Row View) */}
                    {isLoading ? (
                        <div className="flex flex-col gap-4">
                            {[...Array(6)].map((_, i) => (
                                <div key={i} className="bg-white dark:bg-[#2a2b2f] rounded-3xl p-4 shadow-sm animate-pulse border border-gray-100 dark:border-gray-700 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                                    <div className="flex items-center gap-4 flex-1">
                                        <div className="w-14 h-14 rounded-full bg-gray-200 dark:bg-gray-700 shrink-0"></div>
                                        <div className="w-full max-w-[200px]">
                                            <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-3/4 mb-2"></div>
                                            <div className="h-3 bg-gray-200 dark:bg-gray-700 rounded w-1/2"></div>
                                        </div>
                                    </div>
                                    <div className="flex flex-wrap items-center gap-6 flex-1">
                                        <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-20"></div>
                                        <div className="h-6 bg-gray-200 dark:bg-gray-700 rounded-full w-24"></div>
                                        <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-28"></div>
                                    </div>
                                    <div className="flex items-center gap-2 w-full lg:w-auto">
                                        <div className="h-10 bg-gray-200 dark:bg-gray-700 rounded-xl w-28"></div>
                                        <div className="h-10 bg-gray-200 dark:bg-gray-700 rounded-xl w-20"></div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    ) : (
                        <div className="flex flex-col gap-4">
                            {currentStudents.map((student) => {
                                const visitInfo = visitStatuses[student.id];
                                const visited = visitInfo?.visited;
                                const visitDateLabel = visited ? formatVisitDate(visitInfo?.date) : "";

                                return (
                                    <div
                                        key={student.id}
                                        className="group relative rounded-[24px] bg-gradient-to-r from-pink-500/20 via-purple-500/10 to-blue-500/20 p-[1px] hover:shadow-lg hover:shadow-pink-500/5 transition-all duration-300"
                                    >
                                        <div className="h-full rounded-[23px] bg-white dark:bg-[#1f2024] p-4 lg:p-5 flex flex-col lg:flex-row lg:items-center justify-between gap-4 lg:gap-6">
                                            {/* Left Section: Student Profile & ID */}
                                            <div className="flex items-center gap-4 min-w-0 lg:w-[28%] shrink-0">
                                                <div className="relative shrink-0">
                                                    <Link to={`/school/${student.schoolId}/students/view/${student.id}`} className="block relative group/avatar shrink-0 active:scale-95 transition-all duration-300">
                                                        {student.profileImageUrl ? (
                                                            <ProfileAvatar
                                                                src={student.profileImageUrl}
                                                                alt={student.firstName}
                                                                className="w-14 h-14 shadow-md ring-4 ring-white/40 dark:ring-black/30 hover:ring-pink-500/50 dark:hover:ring-pink-500/40 transition-all duration-300"
                                                            />
                                                        ) : (
                                                            <div className="w-14 h-14 rounded-full bg-gradient-to-br from-emerald-400 to-green-500 text-white font-black flex items-center justify-center text-lg shadow-inner hover:from-pink-400 hover:to-pink-500 transition-all duration-300">
                                                                {getStudentInitials(student)}
                                                            </div>
                                                        )}
                                                        <div className="absolute -bottom-1 -right-1 w-6 h-6 bg-emerald-500 rounded-xl flex items-center justify-center border-2 border-white dark:border-[#1f2024]">
                                                            <User size={12} className="text-white" />
                                                        </div>
                                                    </Link>
                                                </div>
                                                <div className="min-w-0">
                                                    <Link to={`/school/${student.schoolId}/students/view/${student.id}`} className="block group/name">
                                                        <h3 className="font-bold text-gray-900 dark:text-white text-base sm:text-lg leading-tight hover:text-pink-500 dark:hover:text-pink-400 transition-colors truncate">
                                                            {`${student.title}${student.firstName} ${student.lastName}`}
                                                        </h3>
                                                    </Link>
                                                    <div className="flex flex-wrap items-center gap-x-2 gap-y-1 mt-1 text-xs text-gray-400 dark:text-gray-500 font-medium">
                                                        <span>รหัส: <span className="font-semibold text-gray-700 dark:text-gray-300">{student.studentId || "-"}</span></span>
                                                        <span>•</span>
                                                        <span>เลขที่: <span className="font-semibold text-gray-700 dark:text-gray-300">{student.number || student.studentNumber || "-"}</span></span>
                                                        <span>•</span>
                                                        <span>เพศ: <span className="font-semibold text-gray-700 dark:text-gray-300">{getStudentGender(student)}</span></span>
                                                    </div>
                                                </div>
                                            </div>

                                            {/* Middle Section: Class level & Visit status */}
                                            <div className="flex flex-wrap items-center gap-3 sm:gap-4 flex-1 text-sm min-w-0">
                                                {/* Class Level */}
                                                <div className="flex items-center gap-2 text-gray-600 dark:text-gray-400 font-semibold bg-gray-50 dark:bg-gray-800/40 px-3 py-1.5 rounded-2xl border border-gray-100 dark:border-gray-800/60 shrink-0">
                                                    <MapPin size={16} className="text-pink-500 shrink-0" />
                                                    <span>ชั้น {student.classLevel}/{student.room}</span>
                                                </div>

                                                {/* Status Badge */}
                                                <div className="shrink-0">
                                                    <div className={`flex items-center gap-2 px-3 py-1.5 rounded-full border text-xs font-semibold ${visited ? "bg-emerald-50 border-emerald-100 text-emerald-600 dark:bg-emerald-950/40 dark:border-emerald-800/60 dark:text-emerald-400" : "bg-gray-50 border-gray-100 text-gray-400 dark:bg-gray-800/40 dark:border-gray-700/60 dark:text-gray-500"}`}>
                                                        <span className={`w-2 h-2 rounded-full shrink-0 ${visited ? "bg-emerald-500 shadow-sm" : "bg-gray-400"}`}></span>
                                                        <span>{visited ? "เยี่ยมแล้ว" : "รอดำเนินการ"}</span>
                                                    </div>
                                                </div>

                                                {/* Visit Date */}
                                                <div className={`flex items-center gap-1.5 text-xs font-medium ${visited ? "text-emerald-600 dark:text-emerald-400" : "text-gray-400 dark:text-gray-500"}`}>
                                                    {visited ? (
                                                        <>
                                                            <CheckCircle2 size={15} className="shrink-0" />
                                                            <span className="truncate">{visitDateLabel ? `เมื่อ ${visitDateLabel}` : "เยี่ยมแล้ว"}</span>
                                                        </>
                                                    ) : (
                                                        <>
                                                            <Clock size={15} className="shrink-0" />
                                                            <span>ยังไม่ได้บันทึกการเยี่ยม</span>
                                                        </>
                                                    )}
                                                </div>
                                            </div>

                                            {/* Right Section: Action Buttons */}
                                            <div className="flex items-center justify-end gap-2.5 shrink-0 mt-3 lg:mt-0 flex-wrap sm:flex-nowrap">
                                                <Link
                                                    to={`/student-support/home-visit/new/${student.id}`}
                                                    className={`whitespace-nowrap flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-2xl text-xs sm:text-sm font-semibold transition-all active:scale-95 shrink-0 ${
                                                        visited
                                                            ? "border border-pink-200 dark:border-pink-900/40 text-pink-600 dark:text-pink-400 bg-pink-50/50 hover:bg-pink-100/70 hover:shadow-sm dark:bg-pink-950/20 dark:hover:bg-pink-950/40"
                                                            : "bg-gradient-to-r from-pink-600 via-rose-500 to-pink-500 hover:from-pink-500 hover:to-pink-600 text-white shadow-md shadow-pink-500/20"
                                                    }`}
                                                >
                                                    <PlusCircle size={16} />
                                                    <span>{visited ? 'บันทึกเพิ่มเติม' : 'บันทึกการเยี่ยม'}</span>
                                                </Link>

                                                {visited && (
                                                    <Link
                                                        to={`/student-support/home-visit/new/${student.id}?copy=true`}
                                                        className="whitespace-nowrap flex items-center justify-center gap-1.5 px-4 py-2.5 bg-gradient-to-r from-emerald-600 via-teal-600 to-emerald-500 hover:from-emerald-500 hover:to-emerald-600 text-white rounded-2xl text-xs sm:text-sm font-semibold transition-all active:scale-95 shadow-md shadow-emerald-500/20 shrink-0"
                                                        title="สร้างบันทึกการเยี่ยมบ้านโดยคัดลอกข้อมูลครั้งล่าสุด"
                                                    >
                                                        <Copy size={16} />
                                                        <span>ดึงข้อมูลเดิม</span>
                                                    </Link>
                                                )}

                                                {visited && schoolId && (
                                                    <div className="flex items-center shrink-0">
                                                        <HomeVisitPdfButton
                                                            student={student}
                                                            schoolId={schoolId}
                                                            teacherName={teacherName}
                                                            className="p-3 bg-slate-50 hover:bg-blue-50/70 dark:bg-[#272930] dark:hover:bg-blue-950/20 text-slate-500 hover:text-blue-600 dark:text-slate-400 dark:hover:text-blue-400 rounded-full border border-slate-200 hover:border-blue-200/60 dark:border-slate-700 dark:hover:border-blue-900/40 transition-all duration-300 flex items-center justify-center shadow-sm hover:shadow-md hover:shadow-blue-500/5 shrink-0 active:scale-90"
                                                        />
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    )}

                    {/* Pagination */}
                    {!isLoading && totalPages > 1 && (
                        <div className="flex flex-col sm:flex-row items-center justify-between gap-4 mt-8 bg-white dark:bg-[#2a2b2f] p-4 rounded-3xl shadow-sm border border-gray-100 dark:border-gray-700/50">
                            <div className="text-sm text-gray-500 dark:text-gray-400 font-medium">
                                แสดง <span className="font-semibold text-gray-800 dark:text-white">{indexOfFirstStudent + 1}</span> ถึง{" "}
                                <span className="font-semibold text-gray-800 dark:text-white">
                                    {Math.min(indexOfLastStudent, sortedStudents.length)}
                                </span>{" "}
                                จากทั้งหมด <span className="font-semibold text-gray-800 dark:text-white">{sortedStudents.length}</span> คน
                            </div>
                            <div className="flex items-center gap-1">
                                <button
                                    onClick={() => {
                                        setCurrentPage(prev => Math.max(prev - 1, 1));
                                        window.scrollTo({ top: 0, behavior: 'smooth' });
                                    }}
                                    disabled={currentPage === 1}
                                    className={`p-2 rounded-xl transition-all ${
                                        currentPage === 1
                                            ? "text-gray-300 dark:text-gray-600 cursor-not-allowed"
                                            : "text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800 hover:text-pink-500 active:scale-95"
                                    }`}
                                >
                                    <ChevronLeft size={20} />
                                </button>
                                
                                {Array.from({ length: totalPages }, (_, i) => i + 1)
                                    .filter(page => {
                                        return (
                                            page === 1 ||
                                            page === totalPages ||
                                            Math.abs(page - currentPage) <= 1
                                        );
                                    })
                                    .map((page, idx, arr) => {
                                        const showEllipsisBefore = page > 1 && arr[idx - 1] !== page - 1;
                                        return (
                                            <React.Fragment key={page}>
                                                {showEllipsisBefore && (
                                                    <span className="px-2 text-gray-400 dark:text-gray-600">...</span>
                                                )}
                                                <button
                                                    onClick={() => {
                                                        setCurrentPage(page);
                                                        window.scrollTo({ top: 0, behavior: 'smooth' });
                                                    }}
                                                    className={`w-10 h-10 rounded-xl font-bold transition-all active:scale-95 ${
                                                        currentPage === page
                                                            ? "bg-gradient-to-r from-pink-600 to-pink-500 text-white shadow-md shadow-pink-500/20"
                                                            : "text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800 hover:text-pink-500"
                                                    }`}
                                                >
                                                    {page}
                                                </button>
                                            </React.Fragment>
                                        );
                                    })}

                                <button
                                    onClick={() => {
                                        setCurrentPage(prev => Math.min(prev + 1, totalPages));
                                        window.scrollTo({ top: 0, behavior: 'smooth' });
                                    }}
                                    disabled={currentPage === totalPages}
                                    className={`p-2 rounded-xl transition-all ${
                                        currentPage === totalPages
                                            ? "text-gray-300 dark:text-gray-600 cursor-not-allowed"
                                            : "text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800 hover:text-pink-500 active:scale-95"
                                    }`}
                                >
                                    <ChevronRight size={20} />
                                </button>
                            </div>
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
