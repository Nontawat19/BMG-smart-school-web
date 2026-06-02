import React, { useState, useEffect, useCallback, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import MainLayout from "@/layouts/MainLayout";
import ProfileAvatar from "@/components/Shared/ProfileAvatar";
import { firestore, auth } from "@/firebase";
import { collection, getDocs, doc, getDoc, query, orderBy } from "firebase/firestore";
import {
    ArrowLeft,
    PieChart as PieChartIcon,
    BarChart3,
    Users,
    AlertCircle,
    CheckCircle2,
    ShieldAlert,
    TrendingUp,
    Activity,
    Filter,
    Loader2,
    Sparkles,
    Calendar,
    ChevronLeft,
    MoreVertical,
    FileText,
    Download
} from "lucide-react";
import {
    PieChart, Pie, Cell, ResponsiveContainer,
    BarChart, Bar, XAxis, YAxis, Tooltip, Legend,
    CartesianGrid, Rectangle
} from 'recharts';
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
    visitSummaryUrgentDetail?: string;
    visitSummaryPromoteDetail?: string;
    studentResponsibilities?: string[];
    bothParentsDeceased?: boolean;
    oneParentDeceased?: boolean;
    parentsSeparated?: boolean;
    notLivingWithParents?: boolean;
    schoolAssistanceNeeded?: string[];
    travelMethod?: string;
    studentNickname?: string;
}

const HomeVisitSummary: React.FC = () => {
    const navigate = useNavigate();
    const [loading, setLoading] = useState(true);
    const [students, setStudents] = useState<Student[]>([]);
    const [visits, setVisits] = useState<Visit[]>([]);
    const [schoolId, setSchoolId] = useState<string | null>(null);
    const [schoolName, setSchoolName] = useState("");
    const [teacherName, setTeacherName] = useState("");

    const fetchData = useCallback(async () => {
        setLoading(true);
        try {
            const user = auth.currentUser;
            if (!user) return;
            const userDoc = await getDoc(doc(firestore, "users", user.uid));
            const userData = userDoc.data();
            const sid = userData?.schoolId;
            const tName = userData?.displayName || user.displayName || "";
            setSchoolId(sid);
            setTeacherName(tName);

            if (sid) {
                const schoolSnap = await getDoc(doc(firestore, "school-settings", sid));
                if (schoolSnap.exists()) {
                    setSchoolName(schoolSnap.data()?.schoolName || "");
                }

                // ตรวจสอบระดับสิทธิ์ (Role Checking)
                const roles = Array.isArray(userData?.role) ? userData.role : [userData?.role || ""];
                const isPower = roles.some((r: string) =>
                    r === 'admin' ||
                    r === 'school_admin' ||
                    r === 'super_admin' ||
                    r === 'academic' ||
                    r === 'academic_admin' ||
                    r === 'director'
                );

                const studentsSnap = await getDocs(collection(firestore, "school-settings", sid, "students"));
                const allStudents = studentsSnap.docs
                    .map(d => ({ id: d.id, ...d.data() } as Student))
                    .filter(student => getStudentStatus(student) === "กำลังศึกษาอยู่");
                
                let studentsList: Student[] = [];
                if (!isPower) {
                    // จำกัดเฉพาะห้องเรียนที่ตนเองเป็นครูประจำชั้น
                    const teacherRef = doc(firestore, "school-settings", sid, "teachers", user.uid);
                    const teacherSnap = await getDoc(teacherRef);
                    if (teacherSnap.exists()) {
                        const tData = teacherSnap.data();
                        const hrGrade = tData.homeroomGrade || "";
                        const hrRoom = tData.homeroomRoom || "";
                        studentsList = allStudents.filter(student => student.classLevel === hrGrade && student.room === hrRoom);
                    }
                } else {
                    studentsList = allStudents;
                }
                setStudents(studentsList);

                const allVisits: Visit[] = [];
                await Promise.all(studentsList.map(async (student) => {
                    const visitsSnap = await getDocs(collection(firestore, "school-settings", sid, "students", student.id, "home-visits"));
                    visitsSnap.docs.forEach(d => {
                        allVisits.push({ id: d.id, ...d.data(), studentId: student.id } as Visit);
                    });
                }));
                setVisits(allVisits);
            }
        } catch (err) {
            console.error("Error fetching summary data:", err);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchData();
    }, [fetchData]);

    const stats = useMemo(() => {
        const totalStudents = students.length;
        const visitedStudentIds = new Set(visits.map(v => v.studentId));
        const visitedCount = visitedStudentIds.size;
        const notVisitedCount = totalStudents - visitedCount;

        const latestVisitsMap = new Map<string, Visit>();
        visits.forEach(v => {
            if (!latestVisitsMap.has(v.studentId) || v.visitDate > latestVisitsMap.get(v.studentId)!.visitDate) {
                latestVisitsMap.set(v.studentId, v);
            }
        });
        const latestVisits = Array.from(latestVisitsMap.values());

        const healthRisk = latestVisits.filter(v => (v.healthRisk?.length || 0) > 0).length;
        const drugRisk = latestVisits.filter(v => (v.drugRisk?.length || 0) > 0).length;
        const violenceRisk = latestVisits.filter(v => (v.violenceRisk?.length || 0) > 0).length;
        const riskTotal = latestVisits.filter(v =>
            (v.healthRisk?.length || 0) > 0 ||
            (v.drugRisk?.length || 0) > 0 ||
            (v.violenceRisk?.length || 0) > 0 ||
            (v.sexualRisk?.length || 0) > 0 ||
            (v.gameRisk?.length || 0) > 0
        ).length;

        const urgentCount = latestVisits.filter(v => v.visitSummary === "ช่วยเหลือด่วน").length;

        return {
            totalStudents,
            visitedCount,
            notVisitedCount,
            riskTotal,
            urgentCount,
            latestVisits
        };
    }, [students, visits]);

    const visitStatusData = [
        { name: 'ออกเยี่ยมแล้ว', value: stats.visitedCount, color: '#4F46E5' },
        { name: 'ยังไม่ได้เยี่ยม', value: stats.notVisitedCount, color: '#E2E8F0' },
    ];

    const CustomTooltip = ({ active, payload }: any) => {
        if (active && payload && payload.length) {
            return (
                <div className="bg-white dark:bg-gray-800 p-3 border border-gray-100 dark:border-gray-700 shadow-xl rounded-xl text-sm">
                    <p className="font-bold text-gray-900 dark:text-white mb-1">{payload[0].name}</p>
                    <p className="text-indigo-600 dark:text-indigo-400 font-black">{payload[0].value} คน</p>
                </div>
            );
        }
        return null;
    };

    if (loading) {
        return (
            <div className="flex h-screen items-center justify-center bg-gray-50 dark:bg-[#1a1b1e]">
                <div className="flex flex-col items-center gap-4">
                    <Loader2 className="w-12 h-12 text-indigo-600 animate-spin" />
                    <p className="text-gray-500 dark:text-gray-400 font-medium animate-pulse">กำลังประมวลผลข้อมูลสถิติ...</p>
                </div>
            </div>
        );
    }

    const firstStudent = students[0];

    return (
        <MainLayout>
            <div className="p-4 sm:p-6 lg:p-8 bg-gray-50 dark:bg-[#1a1b1e] min-h-screen text-gray-900 dark:text-white transition-colors duration-300">
                <div className="max-w-7xl mx-auto">

                    {/* Header Section */}
                    <div className="bg-white dark:bg-[#2a2b2f] rounded-2xl p-6 mb-8 shadow-sm border border-gray-100 dark:border-gray-700/50 transition-all">
                        <div className="flex flex-col md:flex-row justify-between items-center gap-6">
                            <div className="flex items-center gap-5 w-full md:w-auto">
                                <button
                                    onClick={() => navigate("/student-support/home-visit")}
                                    className="p-3 bg-gray-50 dark:bg-gray-800 text-gray-500 hover:text-indigo-600 dark:hover:text-indigo-400 rounded-xl transition-all active:scale-95 border border-gray-100 dark:border-gray-700"
                                >
                                    <ChevronLeft size={24} />
                                </button>
                                <div>
                                    <div className="flex items-center gap-2 mb-1">
                                        <h1 className="text-2xl font-black tracking-tight text-gray-900 dark:text-white">
                                            สรุปภาพรวมการเยี่ยมบ้าน
                                        </h1>
                                        <div className="px-2 py-0.5 bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400 rounded-lg text-[10px] font-bold uppercase tracking-wider">
                                            Real-time
                                        </div>
                                    </div>
                                    <p className="text-gray-500 dark:text-gray-400 text-sm font-medium flex items-center gap-2">
                                        <Sparkles size={14} className="text-yellow-500" />
                                        {firstStudent ? `ชั้น ${firstStudent.classLevel}/${firstStudent.room}` : "ภาพรวมของโรงเรียน / ยังไม่ได้ระบุห้องเรียน"} • {schoolName}
                                    </p>
                                </div>
                            </div>
                            <div className="flex items-center gap-3 w-full md:w-auto">
                                {schoolId && (
                                    <HomeVisitSummaryPdfButton
                                        students={students}
                                        visits={visits}
                                        schoolName={schoolName}
                                        teacherName={teacherName}
                                        schoolId={schoolId}
                                        classLevel={firstStudent?.classLevel || "ทั้งหมด"}
                                        room={firstStudent?.room || ""}
                                    />
                                )}
                            </div>
                        </div>
                    </div>

                    {/* Stats Grid */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
                        {[
                            { title: "นักเรียนทั้งหมดในห้อง", value: stats.totalStudents, icon: <Users />, color: "text-blue-600", bg: "bg-blue-50 dark:bg-blue-900/20", trend: "รายชื่อนักเรียน" },
                            { title: "ดำเนินการเยี่ยมแล้ว", value: stats.visitedCount, icon: <CheckCircle2 />, color: "text-emerald-600", bg: "bg-emerald-50 dark:bg-emerald-900/20", trend: `${((stats.visitedCount / Math.max(stats.totalStudents, 1)) * 100).toFixed(1)}% ของทั้งหมด` },
                            { title: "พบกลุ่มเสี่ยงสะสม", value: stats.riskTotal, icon: <ShieldAlert />, color: "text-amber-600", bg: "bg-amber-50 dark:bg-amber-900/20", trend: "รวมทุกประเภทความเสี่ยง" },
                            { title: "ต้องการความช่วยเหลือ", value: stats.urgentCount, icon: <AlertCircle />, color: "text-rose-600", bg: "bg-rose-50 dark:bg-rose-900/20", trend: "กลุ่มวิกฤต/เร่งด่วน" },
                        ].map((item, idx) => (
                            <motion.div
                                initial={{ opacity: 0, y: 20 }}
                                animate={{ opacity: 1, y: 0 }}
                                transition={{ delay: idx * 0.1 }}
                                key={idx}
                                className="bg-white dark:bg-[#2a2b2f] p-6 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700/50 hover:shadow-md transition-shadow"
                            >
                                <div className="flex justify-between items-start mb-4">
                                    <div className={`p-3 rounded-xl ${item.bg} ${item.color}`}>
                                        {React.cloneElement(item.icon as React.ReactElement<any>, { size: 22 })}
                                    </div>
                                    <button className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300">
                                        <MoreVertical size={18} />
                                    </button>
                                </div>
                                <h3 className="text-sm font-bold text-gray-500 dark:text-gray-400 mb-1">{item.title}</h3>
                                <div className="flex items-baseline gap-2 mb-2">
                                    <span className="text-3xl font-black text-gray-900 dark:text-white">{item.value}</span>
                                    <span className="text-sm font-bold text-gray-400">คน</span>
                                </div>
                                <p className="text-[11px] font-bold text-gray-400 border-t border-gray-50 dark:border-gray-700 pt-3 mt-1 uppercase tracking-wider">{item.trend}</p>
                            </motion.div>
                        ))}
                    </div>

                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 mb-8">
                        {/* Visit Status Chart */}
                        <div className="bg-white dark:bg-[#2a2b2f] p-8 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700/50">
                            <div className="flex items-center justify-between mb-8">
                                <h3 className="font-black text-lg text-gray-900 dark:text-white flex items-center gap-2">
                                    <PieChartIcon size={20} className="text-indigo-600" />
                                    สถานะการเยี่ยมบ้าน
                                </h3>
                            </div>
                            <div className="h-[240px] relative">
                                <ResponsiveContainer width="100%" height={240} debounce={50}>
                                    <PieChart>
                                        <Pie
                                            data={visitStatusData}
                                            innerRadius={70}
                                            outerRadius={90}
                                            paddingAngle={5}
                                            dataKey="value"
                                            stroke="none"
                                        >
                                            {visitStatusData.map((entry, index) => (
                                                <Cell key={`cell-${index}`} fill={entry.color} />
                                            ))}
                                        </Pie>
                                        <Tooltip content={<CustomTooltip />} />
                                    </PieChart>
                                </ResponsiveContainer>
                                <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-center">
                                    <p className="text-3xl font-black text-gray-900 dark:text-white">
                                        {((stats.visitedCount / Math.max(stats.totalStudents, 1)) * 100).toFixed(0)}%
                                    </p>
                                    <p className="text-[10px] font-bold text-gray-400 tracking-widest uppercase">ดำเนินงาน</p>
                                </div>
                            </div>
                            <div className="grid grid-cols-2 gap-4 mt-8 pt-8 border-t border-gray-50 dark:border-gray-700">
                                <div>
                                    <div className="flex items-center gap-2 mb-1">
                                        <div className="w-2.5 h-2.5 rounded-full bg-indigo-600"></div>
                                        <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">เรียบร้อย</span>
                                    </div>
                                    <p className="text-xl font-black text-gray-900 dark:text-white">{stats.visitedCount} คน</p>
                                </div>
                                <div>
                                    <div className="flex items-center gap-2 mb-1">
                                        <div className="w-2.5 h-2.5 rounded-full bg-gray-200"></div>
                                        <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">รอดำเนินการ</span>
                                    </div>
                                    <p className="text-xl font-black text-gray-900 dark:text-white">{stats.notVisitedCount} คน</p>
                                </div>
                            </div>
                        </div>

                        {/* Recent Activity / Table Section */}
                        <div className="lg:col-span-2 bg-white dark:bg-[#2a2b2f] rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700/50 overflow-hidden flex flex-col">
                            <div className="p-6 border-b border-gray-50 dark:border-gray-700 flex justify-between items-center">
                                <div>
                                    <h3 className="font-black text-lg text-gray-900 dark:text-white flex items-center gap-2">
                                        <Activity size={20} className="text-indigo-600" />
                                        กลุ่มนักเรียนที่ต้องการการดูแลพิเศษ
                                    </h3>
                                    <p className="text-xs font-bold text-gray-400">คัดกรองเฉพาะนักเรียนที่มีความเสี่ยงหรือวิกฤต</p>
                                </div>
                                <button className="p-2 transition-colors hover:bg-gray-50 dark:hover:bg-gray-800 rounded-lg text-gray-400">
                                    <Filter size={20} />
                                </button>
                            </div>

                            <div className="flex-1 table-responsive">
                                <table className="w-full">
                                    <thead className="bg-gray-50 dark:bg-gray-800/50">
                                        <tr>
                                            <th className="px-6 py-4 text-left text-[10px] font-black text-gray-400 uppercase tracking-widest">นักเรียน</th>
                                            <th className="px-6 py-4 text-left text-[10px] font-black text-gray-400 uppercase tracking-widest">สถานะเสี่ยง</th>
                                            <th className="px-6 py-4 text-left text-[10px] font-black text-gray-400 uppercase tracking-widest">สรุปความเห็น</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-gray-50 dark:divide-gray-700">
                                        {stats.latestVisits.filter(v => v.visitSummary !== "ปกติ").map((v) => {
                                            const student = students.find(s => s.id === v.studentId);
                                            return (
                                                <tr key={v.id} className="hover:bg-gray-50 dark:hover:bg-gray-800/30 transition-colors">
                                                    <td className="px-6 py-4">
                                                        <div className="flex items-center gap-3">
                                                            <ProfileAvatar
                                                                src={student?.profileImageUrl || `https://ui-avatars.com/api/?name=${student?.firstName}+${student?.lastName}&background=4F46E5&color=fff`}
                                                                className="w-10 h-10 border border-gray-100 dark:border-gray-700"
                                                                alt="Avatar"
                                                            />
                                                            <div className="min-w-0">
                                                                <p className="text-sm font-black text-gray-900 dark:text-white truncate">
                                                                    {student?.firstName} {student?.lastName}
                                                                </p>
                                                                <p className="text-[10px] text-gray-400 font-bold">ID: {student?.studentId}</p>
                                                            </div>
                                                        </div>
                                                    </td>
                                                    <td className="px-6 py-4">
                                                        <div className="flex flex-wrap gap-1">
                                                            {(v.healthRisk?.length || 0) > 0 && <span className="bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400 px-2 py-0.5 rounded text-[9px] font-black uppercase">สุขภาพ</span>}
                                                            {(v.drugRisk?.length || 0) > 0 && <span className="bg-rose-50 dark:bg-rose-900/20 text-rose-600 dark:text-rose-400 px-2 py-0.5 rounded text-[9px] font-black uppercase">ยาเสพติด</span>}
                                                            {(v.violenceRisk?.length || 0) > 0 && <span className="bg-purple-50 dark:bg-purple-900/20 text-purple-600 dark:text-purple-400 px-2 py-0.5 rounded text-[9px] font-black uppercase">ความรุนแรง</span>}
                                                            {(v.gameRisk?.length || 0) > 0 && <span className="bg-amber-50 dark:bg-amber-900/20 text-amber-600 dark:text-amber-400 px-2 py-0.5 rounded text-[9px] font-black uppercase">ติดเกม</span>}
                                                        </div>
                                                    </td>
                                                    <td className="px-6 py-4">
                                                        <div className={`px-3 py-1 rounded-full text-[10px] font-black inline-flex items-center gap-1.5 ${v.visitSummary === "ช่วยเหลือด่วน"
                                                            ? 'bg-rose-50 dark:bg-rose-900/30 text-rose-600 dark:text-rose-400 shadow-sm'
                                                            : 'bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400 shadow-sm'
                                                            }`}>
                                                            {v.visitSummary === "ช่วยเหลือด่วน" && <AlertCircle size={10} />}
                                                            {v.visitSummary}
                                                        </div>
                                                    </td>
                                                </tr>
                                            );
                                        })}
                                        {stats.latestVisits.filter(v => v.visitSummary !== "ปกติ").length === 0 && (
                                            <tr>
                                                <td colSpan={3} className="px-6 py-12 text-center">
                                                    <div className="flex flex-col items-center gap-3">
                                                        <FileText size={40} className="text-gray-200 dark:text-gray-700" />
                                                        <p className="text-sm font-bold text-gray-400">ยังไม่พบข้อมูลนักเรียนกลุ่มเสี่ยงในขณะนี้</p>
                                                    </div>
                                                </td>
                                            </tr>
                                        )}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            <style>{`
                @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;700;900&family=Sarabun:wght@400;700;800&display=swap');
                
                body {
                    background-color: #f9fafb !important;
                }
                .dark body {
                    background-color: #1a1b1e !important;
                }
            `}</style>
        </MainLayout>
    );
};

export default HomeVisitSummary;
