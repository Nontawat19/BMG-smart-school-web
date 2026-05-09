import React, { useEffect, useState, useRef } from "react";
import { useSelector } from "react-redux";
import { useNavigate } from "react-router-dom";
import { RootState } from "@/store";
import MainLayout from "@/layouts/MainLayout";
import SkeletonLoader from "@/components/SkeletonLoader";
import { collection, limit, orderBy, query, where, getDocs, doc, onSnapshot, collectionGroup, Timestamp, getDoc, updateDoc, increment } from 'firebase/firestore';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, Legend, ResponsiveContainer, PieChart, Pie, Cell, Rectangle, Sector } from 'recharts';
import { firestore as db } from "../../firebase";

import { X, ChevronLeft, ChevronRight, Award, CalendarX, RefreshCw, CalendarCheck, Table as TableIcon, BarChart3, Users, GraduationCap, BookOpen, ClipboardList, FileText, Clock, TrendingUp, Activity, Check, CheckCircle, MapPin, Briefcase } from "lucide-react";

const thaiMonths = ['มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน', 'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม'];
const DAY_MAP: Record<string, string> = { mon: 'จันทร์', tue: 'อังคาร', wed: 'พุธ', thu: 'พฤหัส', fri: 'ศุกร์' };
import { CLASSES } from "@/utils/schoolUtils";
import CanAccess from "@/components/AccessControl/CanAccess";
import { usePermissions } from "@/hooks/usePermissions";

interface CalendarEvent { type?: string; description?: string; scheduleDay?: string; }
interface AttendanceItem { name: string; present?: number; late?: number; leave?: number; absent?: number; earlyReturn?: number; noCheckout?: number; officialTravel?: number; }
interface StatItem { title: string; value: string; change: any; color: string; }
interface NewsItem { id: string; title?: string; content?: string; imageUrl?: string; linkUrl?: string; linkText?: string; isActive?: boolean; createdAt?: any; viewCount?: number; }
interface ActivityItem { id: string; name: string; date: string; }
interface ScheduleItem { period: string; subject: string; class: string; room: string; startTime?: string; endTime?: string; subjectCode?: string; }

const checkIsWorkingDay = (dateStr: string, events: Record<string, CalendarEvent>) => {
    const event = events[dateStr];
    const [y, m, d] = dateStr.split('-').map(Number);
    const dateObj = new Date(y, m - 1, d);
    const dayOfWeek = dateObj.getDay();
    if (event) {
        if (event.type === 'schoolDay') return { isWorking: true, reason: event.description || '' };
        if (event.type === 'holiday') return { isWorking: false, reason: event.description || 'วันหยุดราชการ' };
        if (event.type === 'specialHoliday') return { isWorking: false, reason: event.description || 'วันหยุดพิเศษ' };
    }
    if (dayOfWeek === 0) return { isWorking: false, reason: 'วันอาทิตย์' };
    if (dayOfWeek === 6) return { isWorking: false, reason: 'วันเสาร์' };
    return { isWorking: true, reason: '' };
};

const MiniCalendar: React.FC<{ events: Record<string, CalendarEvent> }> = ({ events }) => {
    const [viewDate, setViewDate] = useState(new Date());
    const changeMonth = (delta: number) => setViewDate(new Date(viewDate.getFullYear(), viewDate.getMonth() + delta, 1));
    const renderDays = () => {
        const year = viewDate.getFullYear(), month = viewDate.getMonth();
        const daysInMonth = new Date(year, month + 1, 0).getDate();
        const firstDayOfWeek = new Date(year, month, 1).getDay();
        const days: React.ReactElement[] = Array.from({ length: firstDayOfWeek }, (_, i) => <div key={`empty-${i}`} />);
        for (let d = 1; d <= daysInMonth; d++) {
            const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
            const isToday = new Date().toDateString() === new Date(year, month, d).toDateString();
            const event = events?.[dateStr];
            const dayOfWeek = new Date(year, month, d).getDay();
            const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
            let title = event?.description || '';
            if (event?.scheduleDay) { const dayName = DAY_MAP[event.scheduleDay] || event.scheduleDay; title = title ? `${title}\n(เรียนชดเชยตารางวัน${dayName})` : `เรียนชดเชยตารางวัน${dayName}`; }
            let icon: React.ReactElement | null = null;
            if (event?.type === 'specialHoliday') icon = <Award size={10} className="absolute bottom-0.5 right-0.5 text-yellow-600 dark:text-yellow-500" />;
            else if (event?.type === 'holiday') icon = <CalendarX size={10} className="absolute bottom-0.5 right-0.5 text-red-500" />;
            else if (event?.scheduleDay) icon = <RefreshCw size={10} className="absolute bottom-0.5 right-0.5 text-purple-500" />;
            else if (event?.description?.includes('กิจกรรม:')) icon = <CalendarCheck size={10} className="absolute bottom-0.5 right-0.5 text-green-600 dark:text-green-500" />;
            let cellClass = 'text-gray-700 dark:text-gray-300';
            if (isToday) cellClass = 'bg-indigo-600 text-white font-bold';
            else if (event?.type === 'holiday' || event?.type === 'specialHoliday') { cellClass = 'bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400'; if (event.type === 'specialHoliday') title = `วันหยุดพิเศษ: ${title}`; }
            else if (event?.type === 'schoolDay' && (event.description || event.scheduleDay)) cellClass = 'bg-blue-100 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400 font-semibold';
            else if (isWeekend && !event) cellClass = 'text-red-400 dark:text-red-500';
            days.push(<div key={d} className={`relative w-8 h-8 rounded-full flex items-center justify-center text-sm transition-colors cursor-default ${cellClass}`} title={title}>{d}{icon}</div>);
        }
        return days;
    };
    return (
        <div className="bg-white dark:bg-[#2a2b2f] rounded-xl shadow-sm p-5 border-none outline-none ring-0">
            <div className="flex justify-between items-center mb-4">
                <h3 className="text-lg font-semibold">{thaiMonths[viewDate.getMonth()]} {viewDate.getFullYear() + 543}</h3>
                <div className="flex gap-1">
                    <button onClick={() => changeMonth(-1)} className="p-1.5 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-md text-gray-500 dark:text-gray-400"><ChevronLeft size={18} /></button>
                    <button onClick={() => changeMonth(1)} className="p-1.5 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-md text-gray-500 dark:text-gray-400"><ChevronRight size={18} /></button>
                </div>
            </div>
            <div className="grid grid-cols-7 gap-1 mb-2 text-center">{['อา', 'จ', 'อ', 'พ', 'พฤ', 'ศ', 'ส'].map(d => <span key={d} className="text-xs font-semibold text-gray-400">{d}</span>)}</div>
            <div className="grid grid-cols-7 gap-y-1 place-items-center">{renderDays()}</div>
        </div>
    );
};








// --- Custom Tooltip for Chart ---
const CustomTooltip = ({ active, payload, isPie }: any) => {
    if (active && payload && payload.length) {
        if (isPie) {
            const data = payload[0].payload;
            return (
                <div className="relative group">
                    <div className="absolute -inset-1 bg-gradient-to-r from-white/20 to-transparent blur-xl opacity-50 group-hover:opacity-100 transition-opacity" />
                    <div className="relative bg-white/95 dark:bg-gray-900/95 backdrop-blur-2xl p-4 border border-white/20 dark:border-white/5 shadow-[0_20px_50px_-10px_rgba(0,0,0,0.5)] rounded-2xl text-sm z-50 min-w-[200px] ring-1 ring-black/5 dark:ring-white/10 overflow-hidden">
                        <div className="absolute top-0 left-0 w-full h-1/2 bg-gradient-to-b from-white/10 to-transparent pointer-events-none" />
                        <div className="flex items-center gap-3 mb-3 pb-2 border-b border-gray-100 dark:border-white/5">
                            <div className="w-4 h-4 rounded-full" style={{ background: `radial-gradient(circle at 30% 30%, white, ${data.actualColor})`, boxShadow: `0 4px 12px ${data.actualColor}44, inset -2px -2px 4px rgba(0,0,0,0.2)` }} />
                            <p className="font-black text-gray-900 dark:text-white text-lg tracking-tight">{data.name}</p>
                        </div>
                        <div className="space-y-3">
                            <div className="flex justify-between items-end">
                                <span className="text-gray-400 dark:text-gray-500 font-bold uppercase text-[9px] tracking-widest pb-0.5">Quantity</span>
                                <span className="font-black text-gray-900 dark:text-white text-2xl leading-none">{data.value}<span className="text-[10px] ml-1 font-bold opacity-40">PERS</span></span>
                            </div>
                            <div className="h-2 bg-gray-100 dark:bg-white/5 rounded-full overflow-hidden p-[1px]"><div className="h-full rounded-full transition-all duration-1000" style={{ width: `${data.percent}%`, backgroundColor: data.actualColor }} /></div>
                            <div className="flex justify-center"><span className="text-transparent bg-clip-text bg-gradient-to-r from-indigo-500 to-cyan-400 font-black text-3xl italic tracking-tighter">{data.percent}%</span></div>
                        </div>
                    </div>
                </div>
            );
        }
    }
    return null;
};

// --- Custom Active Shape for Pie ---
const renderActiveShape = (props: any) => {
    const { cx, cy, innerRadius, outerRadius, startAngle, endAngle, fill } = props;
    return (
        <g>
            <filter id="shadow-active" height="200%" width="200%" x="-50%" y="-50%"><feGaussianBlur in="SourceAlpha" stdDeviation="3" result="blur" /><feOffset in="blur" dx="2" dy="2" result="offsetBlur" /><feComposite in="SourceGraphic" in2="offsetBlur" operator="over" /></filter>
            <Sector cx={cx} cy={cy} innerRadius={innerRadius} outerRadius={outerRadius + 8} startAngle={startAngle} endAngle={endAngle} fill={fill} style={{ filter: 'url(#shadow-active)' }} />
            <Sector cx={cx} cy={cy} startAngle={startAngle} endAngle={endAngle} innerRadius={outerRadius + 12} outerRadius={outerRadius + 15} fill={fill} />
        </g>
    );
};

// ==================== MAIN COMPONENT ====================
const HomePage = () => {
    const { user: currentUser, ACADEMIC_ACCESS, isSuperAdmin } = usePermissions();
    const navigate = useNavigate();
    const [userProfile, setUserProfile] = useState<any>(null);

    useEffect(() => {
        if (isSuperAdmin) {
            navigate("/owner/hub", { replace: true });
        } else {
            const userRoles = Array.isArray(currentUser?.role) ? currentUser.role : [currentUser?.role];
            const attendanceRoles = ['school_attendance', 'student_attendance', 'teacher_attendance'];
            
            if (userRoles.some(role => attendanceRoles.includes(role as string))) {
                // หากมีสิทธิ์กลุ่มลงเวลา ให้ส่งไปหน้าลงเวลาเท่านั้น
                navigate("/attendance/checkin-out", { replace: true });
            }
        }
    }, [isSuperAdmin, currentUser, navigate]);

    useEffect(() => {
        const fetchProfile = async () => {
            const uid = currentUser?.uid;
            if (!uid) return;
            try {
                const userDocRef = doc(db, "users", uid);
                const userDocSnap = await getDoc(userDocRef);
                if (userDocSnap.exists()) {
                    const userData = userDocSnap.data();
                    const schoolId = userData.schoolId || currentUser?.schoolId;
                    if (schoolId) {
                        const teacherDocRef = doc(db, "school-settings", schoolId, "teachers", uid);
                        const teacherDocSnap = await getDoc(teacherDocRef);
                        if (teacherDocSnap.exists()) { setUserProfile({ ...userData, ...teacherDocSnap.data() }); return; }
                    }
                    setUserProfile(userData);
                }
            } catch (error) { console.error("Error fetching user profile:", error); }
        };
        if (!currentUser?.fullName) fetchProfile();
    }, [currentUser]);

    const user = userProfile || currentUser;
    let userName = user?.displayName || user?.email || "User";

    if (user?.firstName && user?.lastName) {
        const userRoles = Array.isArray(user.role) ? user.role : [user.role];
        const isDirector = userRoles.includes('director') || user.position === 'ผู้อำนวยการโรงเรียน';
        userName = isDirector ? `ท่าน ผอ.${user.firstName} ${user.lastName}` : `คุณครู${user.firstName} ${user.lastName}`;
    }

    const systemMenus = [
        { title: "บริหารวิชาการ", desc: "หลักสูตร, ตารางสอน, วัดผล", path: "/academic-admin", icon: "📚", color: "bg-blue-50 text-blue-600 dark:bg-blue-900/20 dark:text-blue-400" },
        { title: "บริหารบุคคล", desc: "ข้อมูลครู, การลา, มาสาย", path: "/human-resources", icon: "👥", color: "bg-green-50 text-green-600 dark:bg-green-900/20 dark:text-green-400" },
        { title: "บริหารทั่วไป", desc: "อาคารสถานที่, งานสารบรรณ", path: "/general-affairs", icon: "🏢", color: "bg-purple-50 text-purple-600 dark:bg-purple-900/20 dark:text-purple-400" },
        { title: "กิจการนักเรียน", desc: "ความประพฤติ, ทุนการศึกษา", path: "/student-support", icon: "🎓", color: "bg-pink-50 text-pink-600 dark:bg-pink-900/20 dark:text-pink-400" },
        { title: "ลงเวลาทำงาน", desc: "เช็คชื่อเข้า-ออกงาน", path: "/attendance/checkin-out", icon: "⏰", color: "bg-indigo-50 text-indigo-600 dark:bg-indigo-900/20 dark:text-indigo-400" },
    ];


    const [activities, setActivities] = useState<ActivityItem[]>([]);
    const [newsList, setNewsList] = useState<NewsItem[]>([]);
    const [currentNewsIndex, setCurrentNewsIndex] = useState(0);
    const [showNewsModal, setShowNewsModal] = useState(false);
    const [calendarEvents, setCalendarEvents] = useState<Record<string, CalendarEvent>>({});
    const [isTodayWorkingDay, setIsTodayWorkingDay] = useState<boolean | null>(null);
    const [holidayReason, setHolidayReason] = useState('');
    const viewedNewsIds = useRef(new Set<string>());

    const [isLoading, setIsLoading] = useState(true);
    const [reportLoading, setReportLoading] = useState(true);
    const [studentReport, setStudentReport] = useState<any>({ total: 0, active: 0, paused: 0, transferred: 0, resigned: 0, byLevel: {} });
    const [teacherReport, setTeacherReport] = useState<any>({ total: 0, byDepartment: {} });
    const [leaveReport, setLeaveReport] = useState<any>({ studentLeaves: 0, teacherLeaves: 0, studentSick: 0, studentPersonal: 0, teacherSick: 0, teacherPersonal: 0, recentLeaves: [] });
    const [academicReport, setAcademicReport] = useState<any>({ totalCourses: 0, totalClubs: 0, totalEnrollments: 0, todaySchedules: [] });
    const [attendanceData, setAttendanceData] = useState<any[]>([]);
    const [attendanceLoading, setAttendanceLoading] = useState(true);

    const [todayTeacherLeaves, setTodayTeacherLeaves] = useState<any[]>([]);
    const [todayTeacherLeavesLoading, setTodayTeacherLeavesLoading] = useState(true);

    // --- Dashboard Real-time Logic ---
    const [stats, setStats] = useState<StatItem[]>([
        { title: "มาเรียนวันนี้", value: "...", change: "กำลังโหลด...", color: "bg-blue-500" },
        { title: "ครูปฏิบัติงาน", value: "...", change: "วันนี้", color: "bg-green-500" },
        { title: "รอการอนุมัติ", value: "...", change: "กำลังโหลด...", color: "bg-yellow-500" },
    ]);

    const [activePieIndex, setActivePieIndex] = useState<number | undefined>(undefined);
    const [activeBarIndex, setActiveBarIndex] = useState<number | undefined>(undefined);
    const [attendanceView, setAttendanceView] = useState<'chart' | 'table'>('chart');

    const renderStudentStats = (s: any) => (
        <div className="grid grid-cols-5 gap-0.5 mt-2.5">
            {[
                { label: "มา", val: s.present, text: "text-emerald-600 dark:text-emerald-400", bg: "bg-emerald-500/10" },
                { label: "สาย", val: s.late, text: "text-amber-600 dark:text-amber-400", bg: "bg-amber-500/10" },
                { label: "ลา", val: s.leave, text: "text-purple-600 dark:text-purple-400", bg: "bg-purple-500/10" },
                { label: "ไปราชการ", val: s.officialTravel, text: "text-indigo-600 dark:text-indigo-400", bg: "bg-indigo-500/10" },
                { label: "ขาด", val: s.absent, text: "text-red-600 dark:text-red-400", bg: "bg-red-500/10" }
            ].map(i => (
                <div key={i.label} className={`flex flex-col items-center py-1 rounded-md ${i.bg} border border-white/5 shadow-sm`}>
                    <span className={`${i.label === 'ไปราชการ' ? 'text-[5px]' : 'text-[6px]'} sm:text-[8px] font-bold text-gray-500 dark:text-gray-400 uppercase leading-none mb-0.5`}>{i.label}</span>
                    <span className={`text-[9px] sm:text-[11px] font-black ${i.text} leading-none`}>{i.val}</span>
                </div>
            ))}
        </div>
    );

    const renderTeacherStats = (s: any) => (
        <div className="grid grid-cols-5 gap-0.5 mt-2.5">
            {[
                { label: "มา", val: s.present, text: "text-emerald-600 dark:text-emerald-400", bg: "bg-emerald-500/10" },
                { label: "สาย", val: s.late, text: "text-amber-600 dark:text-amber-400", bg: "bg-amber-500/10" },
                { label: "ลา", val: s.leave, text: "text-purple-600 dark:text-purple-400", bg: "bg-purple-500/10" },
                { label: "ไปราชการ", val: s.officialTravel, text: "text-indigo-600 dark:text-indigo-400", bg: "bg-indigo-500/10" },
                { label: "ขาด", val: s.absent, text: "text-red-600 dark:text-red-400", bg: "bg-red-500/10" }
            ].map(i => (
                <div key={i.label} className={`flex flex-col items-center py-1 rounded-md ${i.bg} border border-white/5 shadow-sm`}>
                    <span className={`${i.label === 'ไปราชการ' ? 'text-[5px]' : 'text-[6px]'} sm:text-[8px] font-bold text-gray-500 dark:text-gray-400 uppercase leading-none mb-0.5`}>{i.label}</span>
                    <span className={`text-[9px] sm:text-[11px] font-black ${i.text} leading-none`}>{i.val}</span>
                </div>
            ))}
        </div>
    );

    const renderPendingDocs = (u: any) => (
        <div className="grid grid-cols-4 gap-0.5 mt-2.5">
            {[
                { label: "ปกติ", val: u.normal, text: "text-gray-600 dark:text-gray-400", bg: "bg-gray-500/10" },
                { label: "ด่วน", val: u.urgent, text: "text-blue-600 dark:text-blue-400", bg: "bg-blue-500/10" },
                { label: "มาก", val: u.very_urgent, text: "text-amber-600 dark:text-amber-400", bg: "bg-amber-500/10" },
                { label: "ที่สุด", val: u.most_urgent, text: "text-red-600 dark:text-red-400", bg: "bg-red-500/10" }
            ].map(i => (
                <div key={i.label} className={`flex flex-col items-center py-1 rounded-md ${i.bg} border border-white/5 shadow-sm`}>
                    <span className="text-[6px] sm:text-[8px] font-bold text-gray-500 dark:text-gray-400 uppercase leading-none mb-0.5">{i.label}</span>
                    <span className={`text-[9px] sm:text-[11px] font-black ${i.text} leading-none`}>{i.val}</span>
                </div>
            ))}
        </div>
    );

    // 1. Real-time Summary Listeners
    useEffect(() => {
        const schoolId = currentUser?.schoolId;
        if (!schoolId) return;

        const todayStr = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Bangkok" });

        // A. Student Summary
        const studentSummaryRef = doc(db, "school-settings", schoolId, "Todaysummary", `students_${todayStr}`);
        const unsubStudentSummary = onSnapshot(studentSummaryRef, async (snap) => {
            const summaryData = snap.exists() ? snap.data() : {};
            const classes = summaryData.classes || {};

            const sortOrder: Record<string, number> = { 'เตรียมอนุบาล': 0, 'อ.1': 1, 'อ.2': 2, 'อ.3': 3, 'ป.1': 11, 'ป.2': 12, 'ป.3': 13, 'ป.4': 14, 'ป.5': 15, 'ป.6': 16, 'ม.1': 21, 'ม.2': 22, 'ม.3': 23, 'ม.4': 24, 'ม.5': 25, 'ม.6': 26 };
            const attendanceArr = Object.keys(classes)
                .sort((a, b) => (sortOrder[a] || 900) - (sortOrder[b] || 900) || a.localeCompare(b, 'th'))
                .map(cls => ({ name: cls, ...classes[cls] }));

            setAttendanceData(attendanceArr);

            // Get total student count
            const countSnap = await getDocs(query(collection(db, "school-settings", schoolId, "students")));
            const totalCount = countSnap.size;

            const studentStats = {
                present: summaryData.present || 0,
                late: summaryData.late || 0,
                leave: summaryData.leave || 0,
                officialTravel: summaryData.officialTravel || 0,
                absent: summaryData.absent || 0,
            };

            const presentCount = studentStats.present + studentStats.late + studentStats.officialTravel;

            setStats(prev => {
                const ns = [...prev];
                ns[0] = { title: "มาเรียนวันนี้", value: `${presentCount}/${totalCount}`, change: renderStudentStats(studentStats), color: "bg-blue-500" };
                return ns;
            });
            setAttendanceLoading(false);
        });

        // B. Teacher Summary
        const teacherSummaryRef = doc(db, "school-settings", schoolId, "Todaysummary", `teachers_${todayStr}`);
        const unsubTeacherSummary = onSnapshot(teacherSummaryRef, async (snap) => {
            const summaryData = snap.exists() ? snap.data() : { present: 0, late: 0, leave: 0, officialTravel: 0, absent: 0 };
            const teachersSnap = await getDocs(collection(db, "school-settings", schoolId, "teachers"));
            const totalTeachers = teachersSnap.size;

            const teacherStats = {
                present: summaryData.present || 0,
                late: summaryData.late || 0,
                leave: summaryData.leave || 0,
                officialTravel: summaryData.officialTravel || 0,
                absent: Math.max(0, totalTeachers - (summaryData.present || 0) - (summaryData.late || 0) - (summaryData.leave || 0) - (summaryData.officialTravel || 0))
            };

            const presentCount = teacherStats.present + teacherStats.late + teacherStats.officialTravel;

            setStats(prev => {
                const ns = [...prev];
                ns[1] = { title: "ครูปฏิบัติงาน", value: `${presentCount}/${totalTeachers}`, change: renderTeacherStats(teacherStats), color: "bg-green-500" };
                return ns;
            });
        });

        // C. Pending Documents
        const pendingQuery = query(collection(db, "school-settings", schoolId, "stampedDocuments"), where("status", "==", "pending_approval"));
        const unsubDocs = onSnapshot(pendingQuery, (snap) => {
            const ucounts = { normal: 0, urgent: 0, very_urgent: 0, most_urgent: 0 };
            snap.forEach(d => { const u = d.data().urgency || 'normal'; if (ucounts[u as keyof typeof ucounts] !== undefined) ucounts[u as keyof typeof ucounts]++; });
            setStats(prev => {
                const ns = [...prev];
                ns[2] = { title: "รอการอนุมัติ", value: snap.size.toString(), change: renderPendingDocs(ucounts), color: "bg-yellow-500" };
                return ns;
            });
        });

        return () => { unsubStudentSummary(); unsubTeacherSummary(); unsubDocs(); };
    }, [currentUser]);



    // === EFFECT 1: Fetch Calendar & Activities ===
    useEffect(() => {
        const schoolId = currentUser?.schoolId;
        if (!schoolId) return;
        const fetchData = async () => {
            setIsLoading(true);
            try {
                const now = new Date();
                const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
                let baseEvents: Record<string, CalendarEvent> = {};
                const calendarSnap = await getDoc(doc(db, 'school-settings', schoolId, 'main_calendar', 'default'));
                if (calendarSnap.exists()) baseEvents = calendarSnap.data().events || {};
                const activitiesSnapshot = await getDocs(query(collection(db, 'school-settings', schoolId, 'activities')));
                const activityEvents: Record<string, CalendarEvent> = {};
                activitiesSnapshot.forEach(d => { const act = d.data(); if (act.date) activityEvents[act.date] = { type: 'schoolDay', description: `กิจกรรม: ${act.name}` }; });
                const mergedEvents = { ...baseEvents, ...activityEvents };
                setCalendarEvents(mergedEvents);
                const { isWorking, reason } = checkIsWorkingDay(todayStr, mergedEvents);
                setIsTodayWorkingDay(isWorking);
                setHolidayReason(reason);
            } catch (error) { console.error("Error fetching calendar data:", error); }
            finally { setIsLoading(false); }
        };
        fetchData();
        const today = new Date().toISOString().split('T')[0];
        const q = query(collection(db, "school-settings", schoolId, "activities"), where("date", ">=", today), orderBy("date", "asc"), limit(5));
        const unsubActivities = onSnapshot(q, (snapshot) => {
            const upcoming = snapshot.docs.map(d => ({ id: d.id, ...d.data() } as ActivityItem));
            if (upcoming.length > 0) setActivities(upcoming);
            else setActivities([{ id: 'demo1', name: "วันไหว้ครู", date: "2024-06-13" }, { id: 'demo2', name: "สอบกลางภาคเรียนที่ 1", date: "2024-07-20" }, { id: 'demo3', name: "กิจกรรมวันแม่แห่งชาติ", date: "2024-08-11" }]);
        });
        return () => unsubActivities();
    }, [currentUser]);



    // === EFFECT 3: News Popup ===
    useEffect(() => {
        const schoolId = currentUser?.schoolId;
        if (!schoolId) return;
        const q = query(collection(db, "school-settings", schoolId, "news"), where("isActive", "==", true), orderBy("createdAt", "desc"), limit(5));
        const unsub = onSnapshot(q, (snapshot) => {
            const newsData = snapshot.docs.map(d => ({ id: d.id, ...d.data() } as NewsItem));
            const unseenNews = newsData.filter(news => !sessionStorage.getItem(`seen_news_${news.id}`));
            setNewsList(newsData);
            if (unseenNews.length > 0) setShowNewsModal(true);
        }, (error) => console.error("Error fetching news:", error));
        return () => unsub();
    }, [currentUser]);

    // === EFFECT 4: System Report ===
    useEffect(() => {
        const schoolId = currentUser?.schoolId;
        if (!schoolId) return;
        const fetchReportData = async () => {
            setReportLoading(true);
            try {
                const studentsSnap = await getDocs(collection(db, "school-settings", schoolId, "students"));
                const studentsList = studentsSnap.docs.map(d => ({ id: d.id, ...d.data() }));
                const byLevel: Record<string, number> = {};
                let active = 0, paused = 0, transferred = 0, resigned = 0;
                studentsList.forEach((s: any) => {
                    const status = s.studentStatus || 'เรียนอยู่';
                    if (status === 'เรียนอยู่') active++; else if (status === 'พักการเรียน') paused++; else if (status === 'ย้าย') transferred++; else if (status === 'ลาออก') resigned++;
                    const lvl = s.classLevel || 'ไม่ระบุ';
                    byLevel[lvl] = (byLevel[lvl] || 0) + 1;
                });
                setStudentReport({ total: studentsList.length, active, paused, transferred, resigned, byLevel });
                const teachersSnap = await getDocs(collection(db, "school-settings", schoolId, "teachers"));
                const teachersList = teachersSnap.docs.map(d => ({ id: d.id, ...d.data() }));
                const byDept: Record<string, number> = {};
                teachersList.forEach((t: any) => { const dept = t.department || 'ไม่ระบุ'; byDept[dept] = (byDept[dept] || 0) + 1; });
                setTeacherReport({ total: teachersList.length, byDepartment: byDept });
                try {
                    const studentLeaveSnap = await getDocs(query(collection(db, "school-settings", schoolId, "leave_summary"), orderBy("createdAt", "desc"), limit(50)));
                    const studentLeaveList = studentLeaveSnap.docs.map(d => ({ id: d.id, ...d.data() }));
                    let studentSick = 0, studentPersonal = 0;
                    studentLeaveList.forEach((l: any) => { if (l.leaveType === 'ลาป่วย') studentSick++; else studentPersonal++; });
                    let teacherSick = 0, teacherPersonal = 0;
                    const teacherLeavePromises = teachersList.slice(0, 20).map(async (t: any) => {
                        const lSnap = await getDocs(query(collection(db, "school-settings", schoolId, "teachers", t.id, "leave_summary"), orderBy("createdAt", "desc"), limit(10)));
                        lSnap.forEach(d => { const data = d.data(); if (data.leaveType === 'ลาป่วย') teacherSick++; else teacherPersonal++; });
                    });
                    await Promise.all(teacherLeavePromises);
                    setLeaveReport({ studentLeaves: studentLeaveList.length, teacherLeaves: teacherSick + teacherPersonal, studentSick, studentPersonal, teacherSick, teacherPersonal, recentLeaves: studentLeaveList.slice(0, 5) });
                } catch (e) { console.warn("Leave report fetch (partial):", e); }
                try {
                    const [coursesSnap, clubsSnap, enrollmentsSnap] = await Promise.all([getDocs(collection(db, "school-settings", schoolId, "courses")), getDocs(collection(db, "school-settings", schoolId, "clubs")), getDocs(collection(db, "school-settings", schoolId, "enrollments"))]);
                    let todaySchedules: ScheduleItem[] = [];
                    const uid = currentUser?.uid;
                    if (uid) {
                        // 1. Determine standard Day Key
                        const dayNames = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
                        const now = new Date();
                        let dayKey = dayNames[now.getDay()];

                        // 2. Check for "Compensation Day" Override
                        // We fetch the calendar doc to check if today has a specific schedule override
                        try {
                            const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
                            const calDocRef = doc(db, 'school-settings', schoolId, 'main_calendar', 'default');
                            const calDocSnap = await getDoc(calDocRef);

                            if (calDocSnap.exists()) {
                                const calData = calDocSnap.data();
                                const todayEvent = calData.events?.[todayStr];
                                // If today is marked as a school day AND has a specific scheduleDay override (e.g., 'mon')
                                if (todayEvent?.type === 'schoolDay' && todayEvent?.scheduleDay) {
                                    dayKey = todayEvent.scheduleDay;
                                    console.log(`[Schedule Override] Using ${dayKey} schedule for ${todayStr}`);
                                }
                            }
                        } catch (err) {
                            console.error("Error checking schedule override:", err);
                        }

                        const teacherQ = query(collection(db, "school-settings", schoolId, "teachers"), where("uid", "==", uid));
                        const teacherSnap = await getDocs(teacherQ);
                        if (!teacherSnap.empty) {
                            const teacherDocId = teacherSnap.docs[0].id;

                            // 3. Fetch period settings & courses & rooms to enrich schedule data
                            let periodSettings: Record<string, { startTime: string, endTime: string }> = {};
                            const [periodSnap, coursesSnap, roomsSnap] = await Promise.all([
                                getDoc(doc(db, 'school-settings', schoolId, 'configs', 'schedule_settings')),
                                getDocs(collection(db, 'school-settings', schoolId, 'courses')),
                                getDocs(collection(db, 'school-settings', schoolId, 'physical-rooms'))
                            ]);

                            // 3.1 Map Periods
                            if (periodSnap.exists()) {
                                const data = periodSnap.data();
                                if (data.periods && Array.isArray(data.periods)) {
                                    data.periods.forEach((p: any) => {
                                        periodSettings[p.id] = { startTime: p.startTime, endTime: p.endTime };
                                        if (p.id.startsWith('period-')) {
                                            const num = p.id.replace('period-', '');
                                            periodSettings[num] = { startTime: p.startTime, endTime: p.endTime };
                                        }
                                    });
                                }
                            }

                            // 3.2 Map Courses for Assignments
                            const courseDataMap: Record<string, any> = {};
                            coursesSnap.forEach(cdoc => {
                                courseDataMap[cdoc.id] = cdoc.data();
                                // Also map by code for easier lookup
                                if (cdoc.data().code) courseDataMap[cdoc.data().code] = cdoc.data();
                            });

                            // 3.3 Map Rooms for Display Names
                            // 3.3 Map Rooms for Display Names & Codes
                            const roomDataMap: Record<string, { name: string, code: string }> = {};
                            roomsSnap.forEach(rdoc => {
                                const rdata = rdoc.data();
                                roomDataMap[rdoc.id] = {
                                    name: rdata.name || rdata.roomName || rdoc.id,
                                    code: rdata.roomCode || ''
                                };
                            });

                            const schedSnap = await getDocs(query(collection(db, "school-settings", schoolId, "schedules"), where("teacherId", "==", teacherDocId)));
                            schedSnap.forEach(sdoc => {
                                const data = sdoc.data();
                                const sch = data.schedule || {};
                                const classId = Array.isArray(data.classId) ? data.classId[0] : data.classId;
                                const baseClassName = CLASSES[classId] || classId || "ไม่ระบุชั้น";
                                Object.keys(sch).forEach(key => {
                                    // Key format is typically "day-periodId" (e.g., "mon-period-1", "mon-homeroom")
                                    if (key.startsWith(dayKey + '-') && sch[key]) {
                                        const periodId = key.replace(dayKey + '-', ''); // e.g., "period-1", "homeroom"

                                        let displayPeriod = periodId;
                                        let sortIndex = 999;

                                        // Find matching period time
                                        const pTime = periodSettings[periodId];
                                        const startTime = pTime?.startTime || '';
                                        const endTime = pTime?.endTime || '';

                                        if (periodId === 'homeroom') {
                                            displayPeriod = 'โฮมรูม';
                                            sortIndex = 0;
                                        } else if (periodId === 'lunch') {
                                            return; // Skip lunch period
                                        } else if (periodId.startsWith('period-')) {
                                            const num = parseInt(periodId.split('-')[1]);
                                            displayPeriod = `คาบ ${num}`;
                                            sortIndex = num;
                                        } else if (!isNaN(parseInt(periodId))) {
                                            const num = parseInt(periodId);
                                            displayPeriod = `คาบ ${num}`;
                                            sortIndex = num;
                                        }

                                        const rawCourse = sch[key];
                                        const coursesArray = Array.isArray(rawCourse) ? rawCourse : [rawCourse];
                                        const course = coursesArray[0];

                                        if (!course || course === '-') return; // Skip free periods

                                        const subjectName = typeof course === 'string' ? '-' : (course?.title || course?.subjectName || course?.name || '-');
                                        if (subjectName === '-') return; // Double check for empty subjects

                                        const subjectCode = typeof course === 'string' ? '' : (course?.code || course?.subjectCode || '');
                                        const courseId = typeof course === 'string' ? null : (course?.id || course?.courseId);

                                        // --- Advanced Logic for Class/Room based on Teacher Assignments ---
                                        let finalClassName = baseClassName;
                                        let finalRoom = course?.room || data.room || '-';

                                        // Lookup Course Document to find Assignments
                                        const fullCourseData = courseId ? courseDataMap[courseId] : (subjectCode ? courseDataMap[subjectCode] : null);

                                        if (fullCourseData && fullCourseData.teacherAssignments) {
                                            // Find the assignment for THIS teacher
                                            const myAssignment = fullCourseData.teacherAssignments.find((a: any) =>
                                                String(a.teacherId) === String(teacherDocId)
                                            );

                                            if (myAssignment) {
                                                // 1. Format Class Name (e.g., ม.1/1)
                                                if (myAssignment.groupNumber) {
                                                    finalClassName = `${baseClassName}/${myAssignment.groupNumber}`;
                                                }

                                                // 2. Format Room Name (from Physical Rooms map)
                                                if (myAssignment.roomIds && myAssignment.roomIds.length > 0) {
                                                    const roomDisplays = myAssignment.roomIds.map((rid: string) => {
                                                        const r = roomDataMap[rid];
                                                        if (!r) return rid;
                                                        return r.code ? `${r.name} (${r.code})` : r.name;
                                                    });
                                                    finalRoom = roomDisplays.join(', ');
                                                }
                                            }
                                        } else if (course?.groupName) {
                                            // Fallback to groupName in schedule if available
                                            const groupNum = course.groupName.match(/\d+/);
                                            if (groupNum) finalClassName = `${baseClassName}/${groupNum[0]}`;
                                        }

                                        todaySchedules.push({
                                            period: displayPeriod,
                                            subject: subjectName,
                                            subjectCode: subjectCode,
                                            class: finalClassName,
                                            room: finalRoom,
                                            startTime,
                                            endTime,
                                            _sortIndex: sortIndex
                                        } as any);
                                    }
                                });
                            });
                            // Sort based on the calculated sortIndex
                            todaySchedules.sort((a: any, b: any) => a._sortIndex - b._sortIndex);
                        }
                    }
                    setAcademicReport({ totalCourses: coursesSnap.size, totalClubs: clubsSnap.size, totalEnrollments: enrollmentsSnap.size, todaySchedules });
                } catch (e) { console.warn("Academic report fetch:", e); }
            } catch (error) { console.error("Error fetching report data:", error); }
            finally { setReportLoading(false); }
        };
        fetchReportData();
    }, [currentUser]);

    // --- News handlers ---
    const closeNewsPopup = () => { newsList.forEach(news => sessionStorage.setItem(`seen_news_${news.id}`, 'true')); setShowNewsModal(false); };
    const handleNextNews = () => setCurrentNewsIndex(prev => (prev + 1) % newsList.length);
    const handlePrevNews = () => setCurrentNewsIndex(prev => (prev - 1 + newsList.length) % newsList.length);
    useEffect(() => { if (!showNewsModal || newsList.length <= 1) return; const iv = setInterval(() => setCurrentNewsIndex(prev => (prev + 1) % newsList.length), 5000); return () => clearInterval(iv); }, [showNewsModal, newsList.length]);
    const currentNews = newsList[currentNewsIndex];
    const incrementViewCount = async (id: string) => { const schoolId = currentUser?.schoolId; if (!schoolId || !id) return; try { await updateDoc(doc(db, "school-settings", schoolId, "news", id), { viewCount: increment(1) }); } catch (error) { console.error("Error incrementing view count:", error); } };
    useEffect(() => { if (showNewsModal && currentNews && !viewedNewsIds.current.has(currentNews.id)) { incrementViewCount(currentNews.id); viewedNewsIds.current.add(currentNews.id); } }, [currentNews, showNewsModal]);



    return (
        <MainLayout>
            <div className="px-3 sm:px-4 md:px-6 lg:px-8 py-4 sm:py-6 text-gray-900 dark:text-white transition-colors duration-300">
                <div className="max-w-7xl mx-auto w-full">
                    {/* NEWS MODAL */}
                    {showNewsModal && currentNews && (
                        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm transition-opacity">
                            <div className="bg-white dark:bg-[#2a2b2f] rounded-2xl shadow-2xl w-full sm:max-w-xl md:max-w-3xl lg:max-w-4xl overflow-hidden flex flex-col max-h-[85vh] relative">
                                <div className="flex justify-between items-center p-4 md:p-5 border-b border-gray-100 dark:border-gray-700">
                                    <h2 className="text-lg md:text-2xl font-bold truncate pr-4">{currentNews.title}</h2>
                                    <button onClick={closeNewsPopup} className="p-2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 rounded-full hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"><X size={24} /></button>
                                </div>
                                <div className="overflow-y-auto" style={{ scrollbarWidth: 'none' }}>
                                    {currentNews.imageUrl && <div className="w-full bg-gray-100 dark:bg-gray-800"><img src={currentNews.imageUrl} alt={currentNews.title} className="w-full h-auto max-h-[35vh] sm:max-h-[45vh] object-contain mx-auto" /></div>}
                                    <div className="p-6 md:p-8 lg:p-10"><p className="text-base md:text-lg text-gray-600 dark:text-gray-300 whitespace-pre-line leading-relaxed">{currentNews.content}</p></div>
                                </div>
                                {newsList.length > 1 && (<><button onClick={handlePrevNews} className="absolute left-2 top-1/2 -translate-y-1/2 p-2 bg-black/20 hover:bg-black/40 text-white rounded-full transition-colors z-10"><ChevronLeft size={32} /></button><button onClick={handleNextNews} className="absolute right-2 top-1/2 -translate-y-1/2 p-2 bg-black/20 hover:bg-black/40 text-white rounded-full transition-colors z-10"><ChevronRight size={32} /></button></>)}
                                {(newsList.length > 1 || currentNews.linkUrl) && (
                                    <div className="p-4 md:p-6 border-t border-gray-100 dark:border-gray-700 bg-gray-50 dark:bg-[#2a2b2f]/50 flex flex-col sm:flex-row justify-between items-center gap-4">
                                        {newsList.length > 1 ? <div className="flex gap-2">{newsList.map((_, idx) => <button key={idx} onClick={() => setCurrentNewsIndex(idx)} className={`w-2.5 h-2.5 rounded-full transition-all ${idx === currentNewsIndex ? 'bg-indigo-600 w-6' : 'bg-gray-300 dark:bg-gray-600 hover:bg-gray-400'}`} />)}</div> : <div />}
                                        {currentNews.linkUrl && <a href={currentNews.linkUrl} target="_blank" rel="noreferrer" className="w-full sm:w-auto py-2.5 px-6 bg-indigo-600 hover:bg-indigo-700 text-white text-center font-medium rounded-xl transition-colors shadow-sm ml-auto">{currentNews.linkText || 'ดูรายละเอียด'}</a>}
                                    </div>
                                )}
                            </div>
                        </div>
                    )}

                    {/* ENHANCED PREMIUM HEADER - SINGLE ROW */}
                    <div className="bg-white dark:bg-[#2a2b2f] rounded-[24px] p-4 sm:p-5 mb-8 border-none shadow-sm dark:shadow-[0_8px_30px_rgb(0,0,0,0.12)] transition-all duration-300 relative overflow-hidden group">
                        {/* Decorative Background Elements */}
                        <div className="absolute top-0 right-0 w-48 h-48 bg-indigo-500/5 rounded-full -mr-24 -mt-24 blur-3xl pointer-events-none"></div>

                        <div className="relative flex flex-row justify-between items-center gap-3 sm:gap-6">
                            {/* Left Side: Welcome Info */}
                            <div className="flex flex-col min-w-0 flex-1">
                                <div className="flex items-center gap-1.5 text-[9px] sm:text-xs font-black uppercase tracking-wider text-gray-800 dark:text-white mb-1">
                                    <Activity size={12} className="animate-pulse flex-shrink-0 text-indigo-500 dark:text-indigo-400" />
                                    <span className="truncate">ยินดีต้อนรับ</span>
                                </div>
                                <h1 className="text-lg sm:text-2xl font-black text-gray-900 dark:text-white flex items-center gap-2 min-w-0">
                                    <span className="opacity-90 flex-shrink-0 hidden xs:inline">สวัสดี,</span>
                                    <span className="truncate">
                                        {user?.fullName || userName}
                                    </span>
                                    <span className="hover:rotate-12 transition-transform cursor-default flex-shrink-0 font-normal">👋</span>
                                </h1>
                                <div className="mt-1 flex items-center gap-1.5">
                                    <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse flex-shrink-0"></div>
                                    <span className="text-[10px] sm:text-xs font-bold text-gray-700 dark:text-gray-200 truncate">ระบบ ปพ.5 ออนไลน์</span>
                                </div>
                            </div>

                            {/* Right Side: Compact Premium Date Badge */}
                            <div className="flex-shrink-0">
                                <div className="flex items-center gap-2 sm:gap-4 px-3 sm:px-4 py-2 sm:py-2.5 bg-gray-50/80 dark:bg-white/[0.03] rounded-[18px] border border-gray-100 dark:border-white/5 shadow-inner backdrop-blur-sm">
                                    <div className="hidden sm:block text-right">
                                        <p className="text-[9px] text-gray-400 dark:text-gray-500 font-bold uppercase tracking-wider leading-none mb-1">
                                            วันที่ปัจจุบัน
                                        </p>
                                        <p className="text-xs sm:text-sm font-black text-gray-800 dark:text-gray-100 whitespace-nowrap">
                                            {new Date().toLocaleDateString('th-TH', {
                                                day: 'numeric',
                                                month: 'long',
                                                year: 'numeric'
                                            })}
                                        </p>
                                    </div>
                                    <div className="p-1.5 sm:p-2 bg-gradient-to-tr from-indigo-500 to-indigo-600 rounded-xl text-white shadow-lg shadow-indigo-500/20 group-hover:scale-105 transition-transform">
                                        <CalendarCheck size={18} className="sm:w-5 sm:h-5" strokeWidth={2.5} />
                                    </div>
                                    {/* Mobile/Small Screen compact date */}
                                    <div className="sm:hidden text-right leading-tight">
                                        <p className="text-[11px] font-black text-gray-800 dark:text-gray-100">
                                            {new Date().getDate()} {thaiMonths[new Date().getMonth()]}
                                        </p>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>







                    {/* SYSTEM REPORT - Only for Admin/Academic */}
                    <CanAccess roles={ACADEMIC_ACCESS}>
                        <div className="mb-8">
                            <div className="flex items-center gap-2 mb-5"><div className="w-1 h-6 bg-gradient-to-b from-indigo-500 to-purple-500 rounded-full" /><h2 className="text-lg font-bold tracking-tight">สรุปรายงานระบบ</h2><span className="text-xs px-2 py-0.5 bg-indigo-100 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400 rounded-full font-semibold">Real-time</span></div>
                            {
                                        reportLoading ? <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">{Array.from({ length: 3 }).map((_, i) => <div key={i} className="bg-white dark:bg-[#2a2b2f] rounded-2xl p-5 shadow-sm"><SkeletonLoader height="120px" className="rounded-xl" /></div>)}</div> : (<>
                            <div className="grid grid-cols-3 gap-2 mb-6">
                                {isLoading ? (
                                    Array.from({ length: 3 }).map((_, i) => (
                                        <div key={i} className="bg-white dark:bg-[#2a2b2f] p-2 sm:p-5 rounded-xl sm:rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700">
                                            <div className="flex items-center justify-between mb-4"><SkeletonLoader width="100px" height="14px" /><SkeletonLoader width="12px" height="12px" variant="circle" /></div>
                                            <SkeletonLoader width="60px" height="32px" className="mb-4" />
                                            <SkeletonLoader width="100%" height="40px" className="rounded-xl" />
                                        </div>
                                    ))
                                ) : (
                                    stats.map((s, i) => (
                                        <div key={i} className="bg-white dark:bg-[#2a2b2f] p-2.5 sm:p-5 rounded-xl sm:rounded-2xl shadow-sm hover:shadow-md transition-all duration-300 border-none outline-none ring-0 flex flex-col justify-between">
                                            <div className="flex items-center justify-between mb-4">
                                                <h3 className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">{s.title}</h3>
                                                <div className={`w-2 h-2 rounded-full ${s.color} shadow-sm`}></div>
                                            </div>
                                            <div className="flex flex-col">
                                                <span className="text-lg sm:text-2xl font-black tracking-tight">{s.value}</span>
                                                <div className="mt-1">{typeof s.change === 'string' ? <span className="text-[10px] font-medium text-gray-400">{s.change}</span> : s.change}</div>
                                            </div>
                                        </div>
                                    ))
                                )}
                            </div></>)}
                        </div>
                    </CanAccess>

                    <CanAccess roles={ACADEMIC_ACCESS}>
                        <div className="bg-white dark:bg-[#2a2b2f] p-6 rounded-2xl shadow-sm border-none outline-none ring-0 mb-8">
                            <div className="flex justify-between items-center mb-6">
                                <div>
                                    <div className="flex items-center gap-2 mb-1">
                                        <div className="w-1 h-6 bg-indigo-500 rounded-full"></div>
                                        <h3 className="text-lg font-bold tracking-tight">สถิติการมาเรียนรายชั้น</h3>
                                    </div>
                                    <p className="text-xs font-medium text-gray-400 ml-3">ข้อมูลประจำวันที่ {new Date().toLocaleDateString('th-TH', { day: 'numeric', month: 'long', year: 'numeric' })}</p>
                                </div>
                                <div className="flex bg-gray-50 dark:bg-gray-800/50 rounded-xl p-1 border border-gray-100 dark:border-gray-700">
                                    <button onClick={() => setAttendanceView('chart')} className={`p-2 rounded-lg transition-all ${attendanceView === 'chart' ? 'bg-white dark:bg-gray-700 shadow-sm text-indigo-600 dark:text-indigo-400' : 'text-gray-400 hover:text-gray-600 dark:hover:text-gray-200'}`}><BarChart3 size={18} /></button>
                                    <button onClick={() => setAttendanceView('table')} className={`p-2 rounded-lg transition-all ${attendanceView === 'table' ? 'bg-white dark:bg-gray-700 shadow-sm text-indigo-600 dark:text-indigo-400' : 'text-gray-400 hover:text-gray-600 dark:hover:text-gray-200'}`}><TableIcon size={18} /></button>
                                </div>
                            </div>
                            <div className="h-72 w-full mt-4 min-w-0">
                                {attendanceLoading ? <SkeletonLoader height="100%" className="rounded-xl" /> : (attendanceData?.length ?? 0) > 0 ? (
                                    attendanceView === 'chart' ? (
                                        <>
                                            <ResponsiveContainer width="100%" height="85%" minWidth={0}>
                                                <PieChart>
                                                    <defs>
                                                        <linearGradient id="3dSidePresent" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#065F46" /><stop offset="100%" stopColor="#047857" /></linearGradient>
                                                        <linearGradient id="3dSideLate" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#92400E" /><stop offset="100%" stopColor="#B45309" /></linearGradient>
                                                        <linearGradient id="3dSideLeave" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#1E40AF" /><stop offset="100%" stopColor="#1D4ED8" /></linearGradient>
                                                        <linearGradient id="3dSideAbsent" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#991B1B" /><stop offset="100%" stopColor="#B91C1C" /></linearGradient>
                                                        <linearGradient id="3dSideOfficial" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#312E81" /><stop offset="100%" stopColor="#4338CA" /></linearGradient>
                                                    </defs>
                                                    <Pie data={[
                                                        { name: "มาปกติ", value: attendanceData.reduce((acc, c) => acc + (c.present || 0), 0), fill: "url(#3dSidePresent)" },
                                                        { name: "สาย", value: attendanceData.reduce((acc, c) => acc + (c.late || 0), 0), fill: "url(#3dSideLate)" },
                                                        { name: "ลา", value: attendanceData.reduce((acc, c) => acc + (c.leave || 0), 0), fill: "url(#3dSideLeave)" },
                                                        { name: "ไปราชการ", value: attendanceData.reduce((acc, c) => acc + (c.officialTravel || 0), 0), fill: "url(#3dSideOfficial)" },
                                                        { name: "ขาด", value: attendanceData.reduce((acc, c) => acc + (c.absent || 0), 0), fill: "url(#3dSideAbsent)" }
                                                    ].filter(d => d.value > 0)} cx="50%" cy="53%" innerRadius={0} outerRadius={90} dataKey="value" stroke="none" isAnimationActive={false} />
                                                    {(Pie as any) && (
                                                        <Pie
                                                            data={[
                                                                { name: "มาปกติ", value: attendanceData.reduce((acc, c) => acc + (c.present || 0), 0), fill: "#10B981", actualColor: "#10B981" },
                                                                { name: "สาย", value: attendanceData.reduce((acc, c) => acc + (c.late || 0), 0), fill: "#F59E0B", actualColor: "#F59E0B" },
                                                                { name: "ลา", value: attendanceData.reduce((acc, c) => acc + (c.leave || 0), 0), fill: "#3B82F6", actualColor: "#3B82F6" },
                                                                { name: "ไปราชการ", value: attendanceData.reduce((acc, c) => acc + (c.officialTravel || 0), 0), fill: "#6366F1", actualColor: "#6366F1" },
                                                                { name: "ขาด", value: attendanceData.reduce((acc, c) => acc + (c.absent || 0), 0), fill: "#EF4444", actualColor: "#EF4444" }
                                                            ].filter(d => d.value > 0).map((d: any) => {
                                                                const total = attendanceData.reduce((acc, c) => acc + (c.present || 0) + (c.late || 0) + (c.leave || 0) + (c.absent || 0) + (c.officialTravel || 0), 0);
                                                                return { ...d, percent: total > 0 ? ((d.value / total) * 100).toFixed(1) : "0.0" };
                                                            })}
                                                            cx="50%"
                                                            cy="50%"
                                                            innerRadius={0}
                                                            outerRadius={90}
                                                            dataKey="value"
                                                            stroke="none"
                                                            {...({
                                                                activeShape: renderActiveShape,
                                                                activeIndex: activeBarIndex
                                                            } as any)}
                                                            onMouseEnter={(_, idx) => setActiveBarIndex(idx)}
                                                            onMouseLeave={() => setActiveBarIndex(undefined)}
                                                            labelLine={false}
                                                            label={({ cx, cy, midAngle, innerRadius, outerRadius, percent }) => {
                                                                if (!percent || percent < 0.05) return null;
                                                                const RADIAN = Math.PI / 180;
                                                                const r = (innerRadius || 0) + ((outerRadius || 0) - (innerRadius || 0)) * 0.6;
                                                                const x = (cx || 0) + r * Math.cos(-(midAngle || 0) * RADIAN);
                                                                const y = (cy || 0) + r * Math.sin(-(midAngle || 0) * RADIAN);
                                                                return (
                                                                    <text x={x} y={y} fill="white" textAnchor="middle" dominantBaseline="central" className="text-[10px] font-bold pointer-events-none">
                                                                        {`${((percent || 0) * 100).toFixed(1)}%`}
                                                                    </text>
                                                                );
                                                            }}
                                                        >
                                                            {attendanceData.map((_, i) => (
                                                                <Cell key={i} fillOpacity={activeBarIndex === undefined || activeBarIndex === i ? 1 : 0.8} className="cursor-pointer" />
                                                            ))}
                                                        </Pie>
                                                    )}
                                                    <RechartsTooltip content={<CustomTooltip isPie={true} />} />
                                                </PieChart>
                                            </ResponsiveContainer>
                                            <div className="flex flex-wrap justify-center gap-x-4 gap-y-2 mt-2">
                                                {[
                                                    { label: "มาปกติ", color: "#10B981" }, { label: "สาย", color: "#F59E0B" }, { label: "ลา", color: "#3B82F6" }, { label: "ไปราชการ", color: "#6366F1" }, { label: "ขาด", color: "#EF4444" }
                                                ].map((item, idx) => (
                                                    <div key={idx} className="flex items-center gap-1.5"><div className="w-2 h-2 rounded-full" style={{ backgroundColor: item.color }} /><span className="text-[10px] font-bold text-gray-400">{item.label}</span></div>
                                                ))}
                                            </div>
                                        </>
                                    ) : (
                                        <div className="h-full overflow-auto custom-scrollbar">
                                            <table className="w-full text-[10px] text-left">
                                                <thead className="text-gray-400 uppercase bg-gray-50 dark:bg-gray-800/50 sticky top-0">
                                                    <tr>
                                                        <th className="px-2 py-1">ชั้น</th><th className="px-2 py-1">มา</th><th className="px-2 py-1">สาย</th><th className="px-2 py-1">ลา</th><th className="px-2 py-1">ขาด</th><th className="px-2 py-1">รวม</th>
                                                    </tr>
                                                </thead>
                                                <tbody>
                                                    {attendanceData.map((item, idx) => (
                                                        <tr key={idx} className="border-b dark:border-gray-800">
                                                            <td className="px-2 py-1 font-bold">{item.name}</td>
                                                            <td className="px-2 py-1 text-emerald-500">{item.present}</td>
                                                            <td className="px-2 py-1 text-amber-500">{item.late || '-'}</td>
                                                            <td className="px-2 py-1 text-purple-500">{item.leave || '-'}</td>
                                                            <td className="px-2 py-1 text-red-500">{item.absent || '-'}</td>
                                                            <td className="px-2 py-1 font-black">{(item.present || 0) + (item.late || 0) + (item.leave || 0) + (item.absent || 0)}</td>
                                                        </tr>
                                                    ))}
                                                </tbody>
                                            </table>
                                        </div>
                                    )
                                ) : (
                                    <div className="p-12 text-center bg-white dark:bg-[#2a2b2f] rounded-3xl border border-gray-100 dark:border-gray-800 shadow-sm h-full flex flex-col items-center justify-center">
                                        <div className="w-16 h-16 bg-gray-50 dark:bg-gray-700/50 rounded-full flex items-center justify-center mx-auto mb-4"><CalendarX className="w-8 h-8 text-gray-400" /></div>
                                        <h3 className="text-lg font-bold text-gray-900 dark:text-white">ยังไม่มีข้อมูลการเช็คชื่อวันนี้</h3>
                                        <p className="text-gray-500 dark:text-gray-400 text-sm mt-1 max-w-xs mx-auto">เมื่อคุณครูเริ่มเช็คชื่อ ข้อมูลสถิติจะปรากฏที่นี่โดยอัตโนมัติ</p>
                                    </div>
                                )}
                            </div>
                        </div>
                    </CanAccess>


                    {/* Secondary Stats Section */}
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
                        {/* Student by Level */}
                        <div className="bg-white dark:bg-[#2a2b2f] rounded-2xl p-6 shadow-sm border border-gray-100 dark:border-gray-800">
                            <div className="flex items-center gap-3 mb-5">
                                <div className="p-2 bg-blue-100 dark:bg-blue-900/20 rounded-lg text-blue-600 dark:text-blue-400">
                                    <Activity size={18} />
                                </div>
                                <h3 className="text-base font-bold text-gray-900 dark:text-white">จำนวนนักเรียนแยกตามชั้น</h3>
                            </div>
                            <div className="space-y-3">
                                {Object.keys(studentReport.byLevel).length > 0 ? (
                                    Object.entries(studentReport.byLevel)
                                        .sort(([a]: any, [b]: any) => {
                                            const o: Record<string, number> = { 'อ.1': 1, 'อ.2': 2, 'อ.3': 3, 'ป.1': 11, 'ป.2': 12, 'ป.3': 13, 'ป.4': 14, 'ป.5': 15, 'ป.6': 16, 'ม.1': 21, 'ม.2': 22, 'ม.3': 23, 'ม.4': 24, 'ม.5': 25, 'ม.6': 26 };
                                            return (o[a] || 999) - (o[b] || 999);
                                        })
                                        .map(([level, count]: any) => {
                                            const mx = Math.max(...Object.values(studentReport.byLevel) as number[]);
                                            const pct = mx > 0 ? (count / mx) * 100 : 0;
                                            return (
                                                <div key={level} className="flex items-center gap-3 group">
                                                    <span className="text-xs font-bold text-gray-500 dark:text-gray-400 w-8 shrink-0">{level}</span>
                                                    <div className="flex-1 h-2.5 bg-gray-100 dark:bg-gray-800 rounded-full overflow-hidden">
                                                        <div className="h-full bg-gradient-to-r from-blue-500 to-indigo-500 rounded-full transition-all duration-1000 ease-out flex items-center relative group-hover:from-blue-400 group-hover:to-indigo-400" style={{ width: `${Math.max(pct, 5)}%` }}>
                                                        </div>
                                                    </div>
                                                    <span className="text-xs font-bold text-gray-700 dark:text-gray-300 w-8 text-right">{count}</span>
                                                </div>
                                            );
                                        })
                                ) : (
                                    <div className="text-center text-gray-400 text-sm py-8">ยังไม่มีข้อมูลนักเรียน</div>
                                )}
                            </div>
                        </div>

                        {/* Today Schedule */}
                        <div className="bg-white dark:bg-[#2a2b2f] rounded-2xl p-6 shadow-sm border border-gray-100 dark:border-gray-800 flex flex-col">
                            <div className="flex items-center justify-between mb-5">
                                <div className="flex items-center gap-3">
                                    <div className="p-2 bg-indigo-100 dark:bg-indigo-900/20 rounded-lg text-indigo-600 dark:text-indigo-400">
                                        <Clock size={18} />
                                    </div>
                                    <h3 className="text-base font-bold text-gray-900 dark:text-white">ตารางสอนวันนี้</h3>
                                </div>
                                <span className="text-[10px] font-bold px-3 py-1 bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400 rounded-full">
                                    {new Date().toLocaleDateString('th-TH', { weekday: 'long' })}
                                </span>
                            </div>

                            <div className="flex-1 overflow-y-auto max-h-[300px] pr-1 custom-scrollbar">
                                {academicReport.todaySchedules.length > 0 ? (
                                    <div className="space-y-4">
                                        {academicReport.todaySchedules.map((s: ScheduleItem, idx: number) => (
                                            <div key={idx} className="relative flex items-center gap-1.5 py-1 px-2 rounded-md bg-white dark:bg-[#1e1f21] border border-gray-100 dark:border-gray-800/60 shadow-sm hover:bg-gray-50 dark:hover:bg-[#252629] transition-all duration-200 group overflow-hidden">
                                                <div className="absolute left-0 top-0 bottom-0 w-0.5 bg-indigo-500 opacity-0 group-hover:opacity-100 transition-opacity"></div>

                                                <div className="w-7 flex flex-col items-center justify-center shrink-0 border-r border-gray-100 dark:border-gray-800/80 pr-1.5">
                                                    <span className="text-[12px] font-black text-gray-800 dark:text-gray-100 leading-none">{s.period.replace('คาบ ', '')}</span>
                                                </div>

                                                <div className="flex-1 min-w-0 flex items-center justify-between gap-1.5">
                                                    <div className="min-w-0 flex-1">
                                                        <div className="flex items-center gap-1">
                                                            <span className="text-[12px] font-bold text-gray-900 dark:text-white truncate" title={s.subject}>{s.subject}</span>
                                                            {s.subjectCode && <span className="text-[8px] font-medium text-gray-400 dark:text-gray-500 truncate">({s.subjectCode})</span>}
                                                        </div>
                                                        <div className="flex items-center gap-1.5 mt-0">
                                                            <span className="text-[8px] font-semibold text-blue-600 dark:text-blue-400 bg-blue-50/50 dark:bg-blue-900/10 px-1 py-0 rounded border border-blue-100/20 dark:border-blue-800/10">{s.class}</span>
                                                            {s.room !== '-' && (
                                                                <span className="text-[8px] font-semibold text-emerald-600 dark:text-emerald-400 bg-emerald-50/50 dark:bg-emerald-900/10 px-1 py-0 rounded border border-emerald-100/20 dark:border-emerald-800/10">{s.room}</span>
                                                            )}
                                                            {(s.startTime || s.endTime) && (
                                                                <span className="text-[8px] font-medium text-gray-500 dark:text-gray-400">{s.startTime || '-'}-{s.endTime || '-'}</span>
                                                            )}
                                                        </div>
                                                    </div>

                                                    <button onClick={() => navigate('/academic/classroom-attendance')} className="shrink-0 px-3 py-1 bg-indigo-600 text-white text-[10px] font-bold rounded-md hover:bg-indigo-700 transition-colors shadow-sm shadow-indigo-500/20 flex items-center gap-1.5">
                                                        <CheckCircle size={12} /> เช็คชื่อ
                                                    </button>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                ) : (
                                    <div className="h-full flex flex-col items-center justify-center text-gray-400 py-10">
                                        <div className="w-12 h-12 rounded-full bg-gray-50 dark:bg-gray-800 flex items-center justify-center mb-3">
                                            <CalendarX size={20} className="opacity-50" />
                                        </div>
                                        <span className="text-sm font-medium">ไม่มีคาบสอนสำหรับวันนี้</span>
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>

                    {/* Row 3: Recent Leave & Summary */}
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
                        {/* Recent Leave */}
                        <div className="bg-white dark:bg-[#2a2b2f] rounded-2xl p-6 shadow-sm border border-gray-100 dark:border-gray-800">
                            <div className="flex items-center justify-between mb-5">
                                <div className="flex items-center gap-3">
                                    <div className="p-2 bg-purple-100 dark:bg-purple-900/20 rounded-lg text-purple-600 dark:text-purple-400">
                                        <ClipboardList size={18} />
                                    </div>
                                    <h3 className="text-base font-bold text-gray-900 dark:text-white">ใบลาล่าสุด (นักเรียน)</h3>
                                </div>
                                <button onClick={() => navigate('/attendance/leave-history')} className="text-xs text-indigo-600 dark:text-indigo-400 hover:underline font-bold">
                                    ดูทั้งหมด
                                </button>
                            </div>

                            <div className="space-y-3">
                                {leaveReport.recentLeaves.length > 0 ? (
                                    leaveReport.recentLeaves.map((leave: any, idx: number) => {
                                        const ds = leave.startDate?.toDate
                                            ? leave.startDate.toDate().toLocaleDateString('th-TH', { day: 'numeric', month: 'short' })
                                            : (typeof leave.startDate === 'string' ? new Date(leave.startDate).toLocaleDateString('th-TH', { day: 'numeric', month: 'short' }) : '-');

                                        const isSick = leave.leaveType === 'ลาป่วย';

                                        return (
                                            <div key={idx} className="flex items-center gap-3 p-3 rounded-xl bg-gray-50 dark:bg-gray-800/30 border border-gray-50 dark:border-gray-800">
                                                <div className={`w-8 h-8 rounded-full shrink-0 flex items-center justify-center ${isSick ? 'bg-orange-100 text-orange-600' : 'bg-cyan-100 text-cyan-600'}`}>
                                                    <FileText size={14} />
                                                </div>
                                                <div className="flex-1 min-w-0">
                                                    <div className="text-sm font-bold text-gray-900 dark:text-white truncate">{leave.studentName}</div>
                                                    <div className="text-[11px] text-gray-500 dark:text-gray-400 flex items-center gap-1">
                                                        <span>{leave.className || 'ไม่ระบุห้อง'}</span>
                                                        <span className="w-1 h-1 rounded-full bg-gray-300"></span>
                                                        <span>{ds}</span>
                                                    </div>
                                                </div>
                                                <span className={`text-[10px] px-2.5 py-1 rounded-md font-bold ${isSick ? 'bg-orange-100 dark:bg-orange-900/20 text-orange-600 dark:text-orange-400' : 'bg-cyan-100 dark:bg-cyan-900/20 text-cyan-600 dark:text-cyan-400'}`}>
                                                    {leave.leaveType}
                                                </span>
                                            </div>
                                        );
                                    })
                                ) : (
                                    <div className="text-center text-gray-400 text-sm py-8">ไม่มีรายการลาล่าสุด</div>
                                )}
                            </div>
                        </div>

                        {/* Summary */}
                        <div className="bg-white dark:bg-[#2a2b2f] rounded-2xl p-6 shadow-sm border border-gray-100 dark:border-gray-800 flex flex-col relative overflow-hidden">
                            {/* Decorative background blur */}
                            <div className="absolute top-0 right-0 w-64 h-64 bg-indigo-500/5 rounded-full blur-3xl pointer-events-none"></div>

                            <div className="flex items-center gap-3 mb-6 relative z-10">
                                <div className="p-2.5 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-xl text-white shadow-md">
                                    <TrendingUp size={20} />
                                </div>
                                <div>
                                    <h3 className="text-lg font-black text-gray-900 dark:text-white tracking-tight">สรุปภาพรวมโรงเรียน</h3>
                                    <p className="text-xs text-gray-500 dark:text-gray-400 font-medium mt-0.5">ข้อมูลสถิติสำคัญของสถานศึกษา</p>
                                </div>
                            </div>

                            <div className="grid grid-cols-2 gap-4 flex-1 relative z-10">
                                {/* Students */}
                                <div className="p-5 rounded-2xl bg-white dark:bg-[#2a2b2f] border border-gray-100 dark:border-gray-800 shadow-[0_2px_10px_-4px_rgba(0,0,0,0.05)] hover:shadow-lg hover:-translate-y-1 hover:border-blue-500/30 transition-all duration-300 group flex flex-col justify-center items-center text-center relative overflow-hidden">
                                    <div className="absolute inset-0 bg-blue-500/5 opacity-0 group-hover:opacity-100 transition-opacity"></div>
                                    <div className="w-12 h-12 rounded-xl bg-blue-50 dark:bg-blue-900/20 mb-3 flex items-center justify-center text-blue-600 dark:text-blue-400 group-hover:scale-110 transition-transform shadow-sm">
                                        <GraduationCap size={24} strokeWidth={2.5} />
                                    </div>
                                    <div className="text-3xl font-black text-gray-800 dark:text-gray-100 drop-shadow-sm leading-none mb-1">{studentReport.active || 0}</div>
                                    <div className="text-[11px] font-bold text-gray-400 uppercase tracking-widest">นักเรียนปัจจุบัน (คน)</div>
                                </div>

                                {/* Teachers */}
                                <div className="p-5 rounded-2xl bg-white dark:bg-[#2a2b2f] border border-gray-100 dark:border-gray-800 shadow-[0_2px_10px_-4px_rgba(0,0,0,0.05)] hover:shadow-lg hover:-translate-y-1 hover:border-purple-500/30 transition-all duration-300 group flex flex-col justify-center items-center text-center relative overflow-hidden">
                                    <div className="absolute inset-0 bg-purple-500/5 opacity-0 group-hover:opacity-100 transition-opacity"></div>
                                    <div className="w-12 h-12 rounded-xl bg-purple-50 dark:bg-purple-900/20 mb-3 flex items-center justify-center text-purple-600 dark:text-purple-400 group-hover:scale-110 transition-transform shadow-sm">
                                        <Briefcase size={24} strokeWidth={2.5} />
                                    </div>
                                    <div className="text-3xl font-black text-gray-800 dark:text-gray-100 drop-shadow-sm leading-none mb-1">{teacherReport.total || 0}</div>
                                    <div className="text-[11px] font-bold text-gray-400 uppercase tracking-widest">บุคลากรทั้งหมด (คน)</div>
                                </div>

                                {/* Today's Leave */}
                                <div className="p-5 rounded-2xl bg-white dark:bg-[#2a2b2f] border border-gray-100 dark:border-gray-800 shadow-[0_2px_10px_-4px_rgba(0,0,0,0.05)] hover:shadow-lg hover:-translate-y-1 hover:border-red-500/30 transition-all duration-300 group flex flex-col justify-center items-center text-center relative overflow-hidden">
                                    <div className="absolute inset-0 bg-red-500/5 opacity-0 group-hover:opacity-100 transition-opacity"></div>
                                    <div className="w-12 h-12 rounded-xl bg-red-50 dark:bg-red-900/20 mb-3 flex items-center justify-center text-red-600 dark:text-red-400 group-hover:scale-110 transition-transform shadow-sm">
                                        <Clock size={24} strokeWidth={2.5} />
                                    </div>
                                    <div className="text-3xl font-black text-gray-800 dark:text-gray-100 drop-shadow-sm leading-none mb-1">{todayTeacherLeaves.length || 0}</div>
                                    <div className="text-[11px] font-bold text-gray-400 uppercase tracking-widest">บุคลากรที่ลาวันนี้ (คน)</div>
                                </div>

                                {/* Courses */}
                                <div className="p-5 rounded-2xl bg-white dark:bg-[#2a2b2f] border border-gray-100 dark:border-gray-800 shadow-[0_2px_10px_-4px_rgba(0,0,0,0.05)] hover:shadow-lg hover:-translate-y-1 hover:border-emerald-500/30 transition-all duration-300 group flex flex-col justify-center items-center text-center relative overflow-hidden">
                                    <div className="absolute inset-0 bg-emerald-500/5 opacity-0 group-hover:opacity-100 transition-opacity"></div>
                                    <div className="w-12 h-12 rounded-xl bg-emerald-50 dark:bg-emerald-900/20 mb-3 flex items-center justify-center text-emerald-600 dark:text-emerald-400 group-hover:scale-110 transition-transform shadow-sm">
                                        <BookOpen size={24} strokeWidth={2.5} />
                                    </div>
                                    <div className="text-3xl font-black text-gray-800 dark:text-gray-100 drop-shadow-sm leading-none mb-1">{academicReport.totalCourses || 0}</div>
                                    <div className="text-[11px] font-bold text-gray-400 uppercase tracking-widest">รายวิชาเปิดสอน (วิชา)</div>
                                </div>
                            </div>
                        </div>
                    </div>



                    {/* BOTTOM SECTION */}
                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                        <div className="lg:col-span-2 bg-white dark:bg-[#2a2b2f] rounded-xl shadow-sm border-none outline-none ring-0 flex flex-col">
                            <div className="p-5 border-b border-gray-100 dark:border-gray-700 flex justify-between items-center">
                                <h2 className="text-lg font-semibold">บุคลากรที่ลาในวันนี้</h2>
                                <span className="text-xs font-bold px-3 py-1 bg-indigo-100 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400 rounded-full">
                                    {new Date().toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: 'numeric' })}
                                </span>
                            </div>
                            <div className="p-5 flex-1 overflow-y-auto max-h-[400px] custom-scrollbar">
                                {todayTeacherLeavesLoading ? (
                                    <div className="space-y-4">
                                        {[1, 2, 3].map(i => (
                                            <div key={i} className="flex items-center space-x-3 pb-4 border-b border-gray-100 dark:border-gray-800 last:border-0">
                                                <SkeletonLoader width="40px" height="40px" variant="circle" />
                                                <div className="flex-1 space-y-2">
                                                    <SkeletonLoader width="70%" height="14px" />
                                                    <SkeletonLoader width="40%" height="12px" />
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                ) : todayTeacherLeaves.length > 0 ? (
                                    <ul className="space-y-4">
                                        {todayTeacherLeaves.map((leave, idx) => {
                                            const isSick = leave.leaveType === 'ลาป่วย';
                                            const isTravel = leave.leaveType === 'ไปราชการ';

                                            // Determine badge colors based on status
                                            let statusColor = 'text-yellow-600 bg-yellow-100 dark:text-yellow-400 dark:bg-yellow-900/30';
                                            let statusIcon = <Clock size={12} className="mr-1" />;
                                            let statusText = 'รออนุมัติ';

                                            if (leave.status === 'substitution_assigned') {
                                                statusColor = 'text-emerald-600 bg-emerald-100 dark:text-emerald-400 dark:bg-emerald-900/30';
                                                statusIcon = <Check size={12} className="mr-1" />;
                                                statusText = 'สอนแทนแล้ว';
                                            } else if (leave.status === 'approved') {
                                                statusColor = 'text-indigo-600 bg-indigo-100 dark:text-indigo-400 dark:bg-indigo-900/30';
                                                statusIcon = <CheckCircle size={12} className="mr-1" />;
                                                statusText = 'อนุมัติแล้ว';
                                            }

                                            return (
                                                <li key={idx} className="flex items-center space-x-3 pb-3 border-b border-gray-100 dark:border-gray-800/60 last:border-0 last:pb-0 group hover:bg-gray-50/80 dark:hover:bg-[#1e1f21]/80 p-3 rounded-2xl transition-all duration-300 -mx-3 hover:shadow-[0_2px_10px_-3px_rgba(0,0,0,0.05)] dark:hover:shadow-none border border-transparent hover:border-gray-100 dark:hover:border-gray-700/50">
                                                    <div className="relative shrink-0">
                                                        {leave.profileImageUrl ? (
                                                            <div className="w-12 h-12 rounded-full overflow-hidden border-2 border-white dark:border-[#2a2b2f] shadow-sm transform transition-transform group-hover:scale-105">
                                                                <img src={leave.profileImageUrl} alt={leave.teacherName} className="w-full h-full object-cover" />
                                                            </div>
                                                        ) : (
                                                            <div className={`w-12 h-12 rounded-full flex items-center justify-center shadow-sm border-2 border-white dark:border-[#2a2b2f] transform transition-transform group-hover:scale-105 ${isSick ? 'bg-gradient-to-br from-orange-100 to-orange-200 text-orange-600 dark:from-orange-900/40 dark:to-orange-800/40 dark:text-orange-400' : isTravel ? 'bg-gradient-to-br from-blue-100 to-blue-200 text-blue-600 dark:from-blue-900/40 dark:to-blue-800/40 dark:text-blue-400' : 'bg-gradient-to-br from-cyan-100 to-cyan-200 text-cyan-600 dark:from-cyan-900/40 dark:to-cyan-800/40 dark:text-cyan-400'}`}>
                                                                {isTravel ? <Briefcase size={20} /> : <Users size={20} />}
                                                            </div>
                                                        )}
                                                        {/* Status dot on avatar */}
                                                        <div className={`absolute bottom-0 right-0 w-3.5 h-3.5 rounded-full border-2 border-white dark:border-[#2a2b2f] shadow-sm ${isSick ? 'bg-orange-500' : isTravel ? 'bg-blue-500' : 'bg-cyan-500'}`} title={leave.leaveType}></div>
                                                    </div>

                                                    <div className="flex-1 min-w-0 ml-1">
                                                        <p className="text-sm font-bold text-gray-900 dark:text-white truncate group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition-colors">{leave.teacherName}</p>
                                                        <div className="flex items-center gap-1.5 mt-0.5">
                                                            <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${isSick ? 'bg-orange-400' : isTravel ? 'bg-blue-400' : 'bg-cyan-400'}`}></span>
                                                            <p className="text-xs text-gray-500 dark:text-gray-400 truncate font-medium">{leave.reason}</p>
                                                        </div>
                                                    </div>

                                                    <div className="shrink-0 text-right flex flex-col items-end gap-2">
                                                        <span className={`text-[10px] px-2.5 py-1 rounded-md font-bold inline-block shadow-sm ${isSick ? 'bg-orange-50 text-orange-600 border border-orange-100 dark:bg-orange-900/20 dark:text-orange-400 dark:border-orange-800/30' : isTravel ? 'bg-blue-50 text-blue-600 border border-blue-100 dark:bg-blue-900/20 dark:text-blue-400 dark:border-blue-800/30' : 'bg-cyan-50 text-cyan-600 border border-cyan-100 dark:bg-cyan-900/20 dark:text-cyan-400 dark:border-cyan-800/30'}`}>
                                                            {leave.leaveType}
                                                        </span>
                                                        <div className={`flex items-center px-2 py-0.5 rounded text-[10px] font-bold tracking-wide ${statusColor}`}>
                                                            {statusIcon} {statusText}
                                                        </div>
                                                    </div>
                                                </li>
                                            );
                                        })}
                                    </ul>
                                ) : (
                                    <div className="h-full flex flex-col items-center justify-center text-gray-400 py-12">
                                        <div className="w-16 h-16 rounded-full bg-gray-50 dark:bg-gray-800 flex items-center justify-center mb-4">
                                            <Users size={28} className="text-gray-400/50" />
                                        </div>
                                        <h3 className="text-sm font-bold text-gray-900 dark:text-white mb-1">ไม่มีบุคลากรลาในวันนี้</h3>
                                        <p className="text-xs text-center max-w-[200px]">วันนี้บุคลากรมาปฏิบัติงานครบ</p>
                                    </div>
                                )}
                            </div>
                        </div>
                        <div className="space-y-6">
                            {isLoading ? <SkeletonLoader height="320px" className="rounded-xl" /> : <MiniCalendar events={calendarEvents} />}
                            <div className="bg-white dark:bg-[#2a2b2f] rounded-xl shadow-sm p-5 border-none outline-none ring-0">
                                <h2 className="text-lg font-semibold mb-4">เมนูด่วน</h2>
                                <div className="space-y-3">
                                    <button onClick={() => navigate('/profile')} className="w-full text-left px-4 py-3 rounded-lg bg-gray-50 dark:bg-gray-800 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors flex items-center group"><span className="w-8 h-8 rounded-lg bg-blue-100 dark:bg-blue-900/30 text-blue-600 flex items-center justify-center mr-3 group-hover:bg-blue-200 dark:group-hover:bg-blue-900/50 transition-colors">⚙️</span><span className="font-medium text-sm">ตั้งค่าส่วนตัว</span></button>
                                    <button onClick={() => navigate('/attendance/leave-request')} className="w-full text-left px-4 py-3 rounded-lg bg-gray-50 dark:bg-gray-800 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors flex items-center group"><span className="w-8 h-8 rounded-lg bg-purple-100 dark:bg-purple-900/30 text-purple-600 flex items-center justify-center mr-3 group-hover:bg-purple-200 dark:group-hover:bg-purple-900/50 transition-colors">📝</span><span className="font-medium text-sm">ยื่นใบลา</span></button>
                                </div>
                            </div>
                        </div>
                    </div>

                </div>
            </div >
        </MainLayout >
    );
};

export default HomePage;
