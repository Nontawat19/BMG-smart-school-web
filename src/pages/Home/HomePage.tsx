import React, { useEffect, useState, useRef } from "react";
import { useSelector, useDispatch } from "react-redux";
import { fetchCalendar } from "@/store/slices/calendarSlice";
import { useNavigate } from "react-router-dom";
import { RootState } from "@/store";
import MainLayout from "@/layouts/MainLayout";
import SkeletonLoader from "@/components/SkeletonLoader";
import ProfileAvatar from "@/components/Shared/ProfileAvatar";
import { collection, limit, orderBy, query, where, getDocs, doc, onSnapshot, getDoc, updateDoc, increment } from 'firebase/firestore';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip as RechartsTooltip } from 'recharts';
import { firestore as db } from "../../firebase";

import { X, ChevronLeft, ChevronRight, Award, CalendarX, RefreshCw, CalendarCheck, Table as TableIcon, BarChart3, Users, GraduationCap, BookOpen, ClipboardList, FileText, Clock, TrendingUp, Activity, Check, CheckCircle, MapPin, Briefcase } from "lucide-react";

const thaiMonths = ['มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน', 'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม'];
const DAY_MAP: Record<string, string> = { mon: 'จันทร์', tue: 'อังคาร', wed: 'พุธ', thu: 'พฤหัส', fri: 'ศุกร์', sat: 'เสาร์', sun: 'อาทิตย์' };
import { CLASSES } from "@/utils/schoolUtils";
import CanAccess from "@/components/AccessControl/CanAccess";
import { usePermissions } from "@/hooks/usePermissions";
import { getThaiYear } from "@/utils/dateUtils";
import { isAttendanceEntryOnly } from "@/utils/attendanceRoles";
import { fetchStudentReportSummary, syncStudentReportSummary, normalizeStudentReportLevel } from "@/utils/studentReportSummaryUtils";
import { isArchivedStudentStatus, normalizeStudentStatus } from "@/utils/studentStatusUtils";
import { fetchSchoolDashboardSummary } from "@/utils/ownerStatsUtils";

interface CalendarEvent { type?: string; description?: string; scheduleDay?: string; }
interface NewsItem { id: string; title?: string; content?: string; imageUrl?: string; linkUrl?: string; linkText?: string; isActive?: boolean; createdAt?: any; viewCount?: number; }
interface ActivityItem { id: string; name: string; date: string; }
interface ScheduleItem {
    id?: string;
    period: string;
    subject: string;
    class: string;
    room: string;
    startTime?: string;
    endTime?: string;
    subjectCode?: string;
    courseId?: string;
    classId?: string | string[];
    className?: string;
    groupNumber?: number;
    roomIds?: string[];
    day?: string;
    actionPath?: string;
    actionLabel?: string;
    type?: 'classroom' | 'homeroom' | 'club' | 'learnerActivity' | 'substitute';
    isSubstitute?: boolean;
    substitutionId?: string;
    originalTeacherId?: string;
    originalTeacherName?: string;
    isDoublePeriod?: boolean;
    periods?: number[];
    _sortIndex?: number;
    _startMinutes?: number;
}

const timeToMinutes = (time?: string) => {
    const [hour, minute] = String(time || '').replace('.', ':').split(':').map(Number);
    if (!Number.isFinite(hour) || !Number.isFinite(minute)) return 9999;
    return hour * 60 + minute;
};

const normalizeTeachingPeriod = (period: unknown) => {
    const parsed = Number(period);
    if (!Number.isFinite(parsed)) return null;
    return parsed === 0 ? 1 : parsed;
};

const isSpecialPeriodForDay = (period: any, dayKey: string) => {
    return !period?.day || period.day === 'all' || period.day === dayKey;
};

const includesAnyKeyword = (value: string, keywords: string[]) => {
    const normalized = value.toLowerCase();
    return keywords.some(keyword => normalized.includes(keyword.toLowerCase()));
};

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
                <h3 className="text-lg font-semibold">{thaiMonths[viewDate.getMonth()]} {getThaiYear(viewDate)}</h3>
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

const formatThaiDayOfWeek = (dateObj: Date) => {
    const dayNames = ['อาทิตย์', 'จันทร์', 'อังคาร', 'พุธ', 'พฤหัสบดี', 'ศุกร์', 'เสาร์'];
    return dayNames[dateObj.getDay()];
};

const formatThaiShortMonth = (monthIndex: number) => {
    const shortMonths = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'];
    return shortMonths[monthIndex];
};

const SchoolCalendarEventsList: React.FC<{ events: Record<string, CalendarEvent>, academicYear?: string }> = ({ events, academicYear }) => {
    const navigate = useNavigate();
    const upcomingEvents = React.useMemo(() => {
        const today = new Date();
        const todayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate());
        
        const list: any[] = [];
        Object.entries(events || {}).forEach(([dateStr, ev]) => {
            const [y, m, d] = dateStr.split('-').map(Number);
            if (!y || !m || !d) return;
            const dateObj = new Date(y, m - 1, d);
            if (dateObj >= todayStart) {
                list.push({
                    dateStr,
                    type: ev.type || 'schoolDay',
                    description: ev.description || '',
                    scheduleDay: ev.scheduleDay,
                    dateObj
                });
            }
        });
        return list.sort((a, b) => a.dateObj.getTime() - b.dateObj.getTime()).slice(0, 6);
    }, [events]);

    const getEventBadge = (type: string, scheduleDay?: string) => {
        if (type === 'holiday') {
            return {
                label: 'วันหยุดราชการ',
                badgeClass: 'bg-red-50 text-red-600 dark:bg-red-950/30 dark:text-red-400 border border-red-100/50 dark:border-red-900/30',
                bgClass: 'bg-gradient-to-br from-red-50 to-red-100 dark:from-red-950/20 dark:to-red-900/20 text-red-600 dark:text-red-400',
                icon: <CalendarX size={14} />
            };
        }
        if (type === 'specialHoliday') {
            return {
                label: 'วันหยุดพิเศษ',
                badgeClass: 'bg-amber-50 text-amber-600 dark:bg-amber-950/30 dark:text-amber-400 border border-amber-100/50 dark:border-amber-900/30',
                bgClass: 'bg-gradient-to-br from-amber-50 to-amber-100 dark:from-amber-950/20 dark:to-amber-900/20 text-amber-600 dark:text-amber-400',
                icon: <Award size={14} />
            };
        }
        if (scheduleDay) {
            return {
                label: 'เรียนชดเชย',
                badgeClass: 'bg-indigo-50 text-indigo-600 dark:bg-indigo-950/30 dark:text-indigo-400 border border-indigo-100/50 dark:border-indigo-900/30',
                bgClass: 'bg-gradient-to-br from-indigo-50 to-indigo-100 dark:from-indigo-950/20 dark:to-indigo-900/20 text-indigo-600 dark:text-indigo-400',
                icon: <RefreshCw size={14} />
            };
        }
        return {
            label: 'กิจกรรมโรงเรียน',
            badgeClass: 'bg-emerald-50 text-emerald-600 dark:bg-emerald-950/30 dark:text-emerald-400 border border-emerald-100/50 dark:border-emerald-900/30',
            bgClass: 'bg-gradient-to-br from-emerald-50 to-emerald-100 dark:from-emerald-950/20 dark:to-emerald-900/20 text-emerald-600 dark:text-emerald-400',
            icon: <CalendarCheck size={14} />
        };
    };

    return (
        <div className="bg-white dark:bg-[#2a2b2f] rounded-xl shadow-sm p-5 border-none outline-none ring-0">
            <div className="flex justify-between items-center mb-4 pb-3 border-b border-gray-100 dark:border-gray-800">
                <div>
                    <h2 className="text-lg font-bold text-gray-900 dark:text-white flex items-center gap-2">
                        <span className="p-1.5 bg-indigo-50 dark:bg-indigo-950/50 rounded-lg text-indigo-600 dark:text-indigo-400">
                            📅
                        </span>
                        ปฏิทินกิจกรรม & วันหยุด
                    </h2>
                    {academicYear && (
                        <p className="text-xs text-gray-400 mt-0.5">ปีการศึกษา {academicYear}</p>
                    )}
                </div>
                <button
                    onClick={() => navigate('/academic/school-calendar')}
                    className="text-xs font-bold text-indigo-600 dark:text-indigo-400 hover:text-indigo-800 dark:hover:text-indigo-300 transition-colors"
                >
                    ดูทั้งหมด
                </button>
            </div>
            
            <div className="space-y-4 max-h-[380px] overflow-y-auto pr-1 custom-scrollbar">
                {upcomingEvents.length > 0 ? (
                    upcomingEvents.map((ev, idx) => {
                        const { label, badgeClass, bgClass, icon } = getEventBadge(ev.type, ev.scheduleDay);
                        const day = ev.dateObj.getDate();
                        const month = formatThaiShortMonth(ev.dateObj.getMonth());
                        const dayOfWeek = formatThaiDayOfWeek(ev.dateObj);
                        
                        return (
                            <div 
                                key={idx} 
                                className="flex items-start gap-3 p-3 rounded-xl border border-gray-50 dark:border-gray-800 bg-gray-50/50 dark:bg-[#252629]/50 hover:bg-gray-100/50 dark:hover:bg-[#2e2f34]/50 transition-all duration-300 transform hover:translate-x-1"
                            >
                                {/* Date badge (square block) */}
                                <div className={`w-12 h-12 rounded-lg flex flex-col items-center justify-center shrink-0 shadow-sm ${bgClass}`}>
                                    <span className="text-lg font-extrabold leading-none">{day}</span>
                                    <span className="text-[10px] font-bold mt-1 uppercase tracking-wider">{month}</span>
                                </div>
                                
                                {/* Info */}
                                <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-2 mb-1">
                                        <span className={`text-[10px] px-2 py-0.5 rounded font-bold ${badgeClass} flex items-center gap-1`}>
                                            {icon}
                                            {label}
                                        </span>
                                        <span className="text-[10px] text-gray-400 dark:text-gray-500 font-medium">
                                            วัน{dayOfWeek}
                                        </span>
                                    </div>
                                    <p className="text-sm font-bold text-gray-900 dark:text-white truncate" title={ev.description}>
                                        {ev.description.replace(/^กิจกรรม:\s*/, '') || 'กิจกรรมพิเศษ'}
                                    </p>
                                    {ev.scheduleDay && (
                                        <p className="text-xs text-indigo-600 dark:text-indigo-400 font-bold mt-1 flex items-center gap-1">
                                            🔄 ใช้ตารางสอนวัน{DAY_MAP[ev.scheduleDay] || ev.scheduleDay}
                                        </p>
                                    )}
                                </div>
                            </div>
                        );
                    })
                ) : (
                    <div className="flex flex-col items-center justify-center py-8 text-gray-400">
                        <div className="w-12 h-12 rounded-full bg-gray-100 dark:bg-gray-800 flex items-center justify-center mb-3 text-gray-300 dark:text-gray-600">
                            📅
                        </div>
                        <p className="text-xs font-bold">ไม่มีกิจกรรมหรือวันหยุดเร็วๆ นี้</p>
                        <p className="text-[10px] text-gray-400 dark:text-gray-500 mt-1">สามารถกำหนดกิจกรรมที่หน้าระบบงานทะเบียน</p>
                    </div>
                )}
            </div>
        </div>
    );
};

// ==================== MAIN COMPONENT ====================
const HomePage = () => {
    const { user: currentUser, ACADEMIC_ACCESS, isSuperAdmin } = usePermissions();
    const navigate = useNavigate();
    const [userProfile, setUserProfile] = useState<any>(null);

    useEffect(() => {
        if (isAttendanceEntryOnly(currentUser?.role)) {
            navigate("/attendance/checkin-out", { replace: true });
            return;
        }

        if (isSuperAdmin) {
            navigate("/owner/hub", { replace: true });
        }
    }, [currentUser?.role, isSuperAdmin, navigate]);

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
    const [studentReport, setStudentReport] = useState<any>({ total: 0, active: 0, paused: 0, suspended: 0, transferred: 0, resigned: 0, byLevel: {} });
    const [teacherReport, setTeacherReport] = useState<any>({ total: 0, byDepartment: {} });
    const [activeTeachersCount, setActiveTeachersCount] = useState<number | null>(null);
    const [leaveReport, setLeaveReport] = useState<any>({ 
        studentLeaves: 0, 
        teacherLeaves: 0, 
        studentSick: 0, 
        studentPersonal: 0, 
        teacherSick: 0, 
        teacherPersonal: 0, 
        officialTravel: 0,
        recentLeaves: [] 
    });
    const [academicReport, setAcademicReport] = useState<any>({ totalCourses: 0, totalClubs: 0, totalEnrollments: 0, todaySchedules: [], compensationScheduleDay: '' });
    const [studentTodaySummary, setStudentTodaySummary] = useState<any>(null);
    const [teacherTodaySummary, setTeacherTodaySummary] = useState<any>(null);

    const [todayTeacherLeaves, setTodayTeacherLeaves] = useState<any[]>([]);
    const [todayTeacherLeavesLoading, setTodayTeacherLeavesLoading] = useState(true);

    // === EFFECT: Teacher Leaves Today ===
    useEffect(() => {
        const schoolId = currentUser?.schoolId;
        if (!schoolId) return;

        const fetchTodayTeacherLeaves = async () => {
            setTodayTeacherLeavesLoading(true);
            try {
                const now = new Date();
                const nowMillis = now.getTime();

                const teachersRef = collection(db, 'school-settings', schoolId, 'teachers');
                const teachersSnap = await getDocs(teachersRef);

                // Count active teachers (status === 'อยู่') and not attendant/attendance role
                const activeTeachers = teachersSnap.docs.filter((doc) => {
                    const data = doc.data();
                    const isActive = data.status === 'อยู่';
                    const isAttendant = isAttendanceEntryOnly(data.role);
                    return isActive && !isAttendant;
                });
                setActiveTeachersCount(activeTeachers.length);

                const promises = teachersSnap.docs
                    .filter((doc) => !isAttendanceEntryOnly(doc.data().role))
                    .map(async (teacherDoc) => {
                        const teacherData = teacherDoc.data();
                        const profileImageUrl = teacherData.profileImageUrl || teacherData.photoURL || null;

                        const leavesRef = collection(db, 'school-settings', schoolId, 'teachers', teacherDoc.id, 'leave_summary');
                        const leavesSnap = await getDocs(leavesRef);
                        const leavesData = leavesSnap.docs.map(doc => ({ id: doc.id, teacherDocId: teacherDoc.id, profileImageUrl, collection: 'leave_summary', ...doc.data() } as any));

                        const travelsRef = collection(db, 'school-settings', schoolId, 'teachers', teacherDoc.id, 'travel_summary');
                        const travelsSnap = await getDocs(travelsRef);
                        const travelsData = travelsSnap.docs.map(doc => ({ id: doc.id, teacherDocId: teacherDoc.id, profileImageUrl, collection: 'travel_summary', ...doc.data() } as any));

                        return [...leavesData, ...travelsData];
                    });

                const results = await Promise.all(promises);
                const allLeaves = results.flat();

                const todayLeaves = allLeaves.filter(data => {
                    if (data.status === 'rejected') return false;

                    if (!data.startDate || !data.endDate) return false;
                    const startDateObj = data.startDate?.toDate ? data.startDate.toDate() : new Date(data.startDate);
                    const endDateObj = data.endDate?.toDate ? data.endDate.toDate() : new Date(data.endDate);

                    if (isNaN(startDateObj.getTime()) || isNaN(endDateObj.getTime())) return false;

                    const startDay = new Date(startDateObj.getFullYear(), startDateObj.getMonth(), startDateObj.getDate()).getTime();
                    const endDay = new Date(endDateObj.getFullYear(), endDateObj.getMonth(), endDateObj.getDate(), 23, 59, 59, 999).getTime();

                    return nowMillis >= startDay && nowMillis <= endDay;
                });

                const processedLeaves = todayLeaves.map(data => ({
                    id: data.id,
                    teacherName: data.teacherName || data.requesterName || "ไม่ระบุชื่อ",
                    leaveType: data.leaveType || (data.collection === 'travel_summary' ? 'ไปราชการ' : 'ลา'),
                    reason: data.reason || '-',
                    status: data.status,
                    startDate: data.startDate,
                    endDate: data.endDate,
                    profileImageUrl: data.profileImageUrl || null
                }));

                setTodayTeacherLeaves(processedLeaves);

                // Update leaveReport for teachers
                let tSick = 0, tPersonal = 0, tOfficial = 0;
                processedLeaves.forEach((l: any) => {
                    if (l.leaveType === 'ลาป่วย') tSick++;
                    else if (l.leaveType === 'ลากิจ') tPersonal++;
                    else if (l.leaveType === 'ไปราชการ') tOfficial++;
                });

                setLeaveReport((prev: any) => ({
                    ...prev,
                    teacherLeaves: processedLeaves.length,
                    teacherSick: tSick,
                    teacherPersonal: tPersonal,
                    teacherOfficial: tOfficial
                }));
            } catch (e) {
                console.error("Error fetching today teacher leaves", e);
            } finally {
                setTodayTeacherLeavesLoading(false);
            }
        };

        fetchTodayTeacherLeaves();
    }, [currentUser]);



    const dispatch = useDispatch();
    const calendarState = useSelector((state: RootState) => state.calendar);
    const reduxRawData = calendarState.rawData;

    useEffect(() => {
        const schoolId = currentUser?.schoolId;
        if (schoolId) {
            dispatch(fetchCalendar(schoolId) as any);
        }
    }, [currentUser, dispatch]);

    // === EFFECT 1: Fetch Activities & Sync from Redux Calendar ===
    useEffect(() => {
        const schoolId = currentUser?.schoolId;
        if (!schoolId) return;

        let active = true;

        if (calendarState.status === 'succeeded') {
            const syncData = async () => {
                try {
                    const now = new Date();
                    const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
                    
                    const baseEvents = reduxRawData.events || {};
                    
                    // Fetch Activities
                    const activitiesSnapshot = await getDocs(query(collection(db, 'school-settings', schoolId, 'activities')));
                    const activityEvents: Record<string, CalendarEvent> = {};
                    activitiesSnapshot.forEach(d => { 
                        const act = d.data(); 
                        if (act.date) activityEvents[act.date] = { type: 'schoolDay', description: `กิจกรรม: ${act.name}` }; 
                    });
                    
                    const mergedEvents = { ...baseEvents, ...activityEvents };
                    if (active) {
                        setCalendarEvents(mergedEvents);
                        
                        const { isWorking, reason } = checkIsWorkingDay(todayStr, mergedEvents);
                        setIsTodayWorkingDay(isWorking);
                        setHolidayReason(reason);
                        setIsLoading(false);
                    }
                } catch (err) {
                    console.error("Error syncing calendar data:", err);
                    if (active) setIsLoading(false);
                }
            };
            syncData();
        } else if (calendarState.status === 'failed') {
            setIsLoading(false);
        }

        const today = new Date().toISOString().split('T')[0];
        const q = query(collection(db, "school-settings", schoolId, "activities"), where("date", ">=", today), orderBy("date", "asc"), limit(5));
        const unsubActivities = onSnapshot(q, (snapshot) => {
            const upcoming = snapshot.docs.map(d => ({ id: d.id, ...d.data() } as ActivityItem));
            if (active) {
                if (upcoming.length > 0) setActivities(upcoming);
                else setActivities([{ id: 'demo1', name: "วันไหว้ครู", date: "2024-06-13" }, { id: 'demo2', name: "สอบกลางภาคเรียนที่ 1", date: "2024-07-20" }, { id: 'demo3', name: "กิจกรรมวันแม่แห่งชาติ", date: "2024-08-11" }]);
            }
        });
        return () => {
            active = false;
            unsubActivities();
        };
    }, [currentUser, calendarState.status, reduxRawData]);



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
                const activeAcademicYear = calendarState.academicYear || String(getThaiYear(new Date()));
                
                // Fetch directly to match the exact "กำลังศึกษาอยู่" criteria for the current academic year
                const studentsCollectionRef = collection(db, "school-settings", schoolId, "students");
                const studentsSnapshot = await getDocs(studentsCollectionRef);
                
                let activeCount = 0;
                const byLevel: Record<string, number> = {};
                
                studentsSnapshot.docs.forEach(studentDoc => {
                    const studentData = studentDoc.data();
                    
                    if (isArchivedStudentStatus(studentData.status || studentData.studentStatus)) return;
                    
                    const status = normalizeStudentStatus(studentData.status || studentData.studentStatus);
                    if (status !== 'กำลังศึกษาอยู่') return;
                    
                    const studentYear = String(
                        studentData.academicYear || 
                        studentData.currentAcademicYear || 
                        studentData.schoolYear || 
                        studentData.enrollmentAcademicYear || 
                        studentData.admissionAcademicYear || 
                        studentData.academic?.year || 
                        ""
                    ).trim();
                    
                    if (studentYear && studentYear !== activeAcademicYear) return;
                    
                    activeCount++;
                    const level = normalizeStudentReportLevel(studentData.classLevel || studentData.level);
                    byLevel[level] = (byLevel[level] || 0) + 1;
                });
                
                setStudentReport({
                    total: activeCount,
                    active: activeCount,
                    byLevel: byLevel
                });
                
                const schoolSummary = await fetchSchoolDashboardSummary(db, schoolId);
                setTeacherReport({ total: schoolSummary.teacherCount || 0, byDepartment: {} });
                try {
                    const todayStr = new Date().toISOString().split('T')[0];
                    const studentLeaveSnap = await getDocs(query(collection(db, "school-settings", schoolId, "leave_summary"), orderBy("createdAt", "desc"), limit(50)));
                    const rawStudentLeaveList = studentLeaveSnap.docs.map(d => {
                        const data = d.data();
                        return {
                            id: d.id,
                            studentName: data.studentName || 'ไม่ระบุชื่อ',
                            profileImageUrl: data.profileImageUrl || null,
                            classLevel: data.classLevel || '',
                            room: data.room || '',
                            studentNumber: data.studentNumber || '',
                            studentId: data.studentId || '',
                            studentDocId: data.studentDocId || '',
                            ...data
                        };
                    });

                    const studentsRef = collection(db, "school-settings", schoolId, "students");
                    const studentMap: Record<string, any> = {};
                    const uniqueDocIds = Array.from(new Set(
                        rawStudentLeaveList
                            .flatMap((leave: any) => [leave.studentDocId, leave.studentId])
                            .map((value: any) => String(value || '').trim())
                            .filter(Boolean)
                    ));

                    const studentDocs = await Promise.all(uniqueDocIds.map(async (studentDocId) => {
                        const snap = await getDoc(doc(db, "school-settings", schoolId, "students", studentDocId));
                        return snap.exists() ? { id: snap.id, data: snap.data() } : null;
                    }));

                    studentDocs.forEach((studentDoc) => {
                        if (!studentDoc) return;
                        studentMap[studentDoc.id] = studentDoc.data;
                        const studentCode = String(studentDoc.data.studentId || '').trim();
                        if (studentCode) studentMap[studentCode] = studentDoc.data;
                    });

                    const missingStudentCodes = Array.from(new Set(
                        rawStudentLeaveList
                            .map((leave: any) => String(leave.studentId || '').trim())
                            .filter((studentId: string) => studentId && !studentMap[studentId])
                    ));

                    const fallbackStudentDocs = await Promise.all(missingStudentCodes.map(async (studentId) => {
                        const snap = await getDocs(query(studentsRef, where("studentId", "==", studentId), limit(1)));
                        const match = snap.docs[0];
                        return match ? { id: match.id, data: match.data() } : null;
                    }));

                    fallbackStudentDocs.forEach((studentDoc) => {
                        if (!studentDoc) return;
                        studentMap[studentDoc.id] = studentDoc.data;
                        const studentCode = String(studentDoc.data.studentId || '').trim();
                        if (studentCode) studentMap[studentCode] = studentDoc.data;
                    });

                    const studentLeaveList = rawStudentLeaveList.map((leave: any) => {
                        const studentData = studentMap[String(leave.studentDocId || '').trim()] || studentMap[String(leave.studentId || '').trim()] || {};
                        const fullName = `${studentData.title || ''}${studentData.firstName || ''} ${studentData.lastName || ''}`.trim();

                        return {
                            ...leave,
                            studentName: leave.studentName && leave.studentName !== 'ไม่ระบุชื่อ' ? leave.studentName : (fullName || 'ไม่ระบุชื่อ'),
                            profileImageUrl: leave.profileImageUrl || studentData.profileImageUrl || studentData.photoURL || studentData.imageUrl || null,
                            classLevel: leave.classLevel || studentData.classLevel || studentData.level || '',
                            room: leave.room || studentData.room || studentData.roomNumber || '',
                            studentNumber: leave.studentNumber || studentData.studentNumber || studentData.number || studentData.classNumber || studentData.no || studentData['เลขที่'] || '',
                            studentId: leave.studentId || studentData.studentId || ''
                        };
                    });
                    
                    let sSick = 0, sPersonal = 0, sOfficial = 0;
                    studentLeaveList.forEach((l: any) => {
                        const isToday = l.startDate <= todayStr && l.endDate >= todayStr;
                        if (isToday) {
                            if (l.leaveType === 'ลาป่วย') sSick++;
                            else if (l.leaveType === 'ลากิจ') sPersonal++;
                            else if (l.leaveType === 'ไปราชการ' || l.leaveType === 'ไปราชการ/กิจกรรม') sOfficial++;
                        }
                    });

                    setLeaveReport((prev: any) => ({
                        ...prev,
                        studentLeaves: sSick + sPersonal + sOfficial,
                        studentSick: sSick,
                        studentPersonal: sPersonal,
                        studentOfficial: sOfficial,
                        recentLeaves: studentLeaveList.slice(0, 5)
                    }));
                } catch (e) { console.warn("Leave report fetch (partial):", e); }

                try {
                    const now = new Date();
                    const todayStr2 = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
                    const [stSnap, tSnap] = await Promise.all([
                        getDoc(doc(db, 'school-settings', schoolId, 'Todaysummary', `students_${todayStr2}`)),
                        getDoc(doc(db, 'school-settings', schoolId, 'Todaysummary', `teachers_${todayStr2}`))
                    ]);
                    setStudentTodaySummary(stSnap.exists() ? stSnap.data() : null);
                    setTeacherTodaySummary(tSnap.exists() ? tSnap.data() : null);
                } catch (e) { console.warn("TodaySummary fetch error:", e); }

                try {
                    const [coursesSnap, clubsSnap, enrollmentsSnap, assignmentSnap] = await Promise.all([
                        getDocs(collection(db, "school-settings", schoolId, "courses")),
                        getDocs(collection(db, "school-settings", schoolId, "clubs")),
                        getDocs(collection(db, "school-settings", schoolId, "enrollments")),
                        getDocs(collection(db, "school-settings", schoolId, "course_assignments"))
                    ]);

                    let totalOpenCourses = 0;
                    try {
                        const now = new Date();
                        const academicYear = calendarState.academicYear || String(getThaiYear(now));
                        const todayDateStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
                        const currentTerm = (calendarState.terms || []).find((t: any) =>
                            t.startDate && t.endDate && todayDateStr >= t.startDate && todayDateStr <= t.endDate
                        ) || calendarState.terms?.[0];
                        const semester = currentTerm?.id === 'term2' || String(currentTerm?.name || '').includes('2') ? "2" : "1";

                        const activeCourses = coursesSnap.docs.map(doc => ({ id: doc.id, ...doc.data() } as any)).filter((c: any) => c.isActive !== false);
                        
                        const assignments = assignmentSnap.docs.map(doc => doc.data()).filter((a: any) => {
                            const dataYear = String(a.academicYear || "");
                            const dataSemester = String(a.semester || a.term || "");
                            const yearMatches = !academicYear || !dataYear || dataYear === academicYear;
                            const semesterMatches = !semester || !dataSemester || dataSemester === semester || dataSemester.startsWith(`${semester}/`) || semester.startsWith(`${dataSemester}/`) || dataSemester.includes(semester);
                            return yearMatches && semesterMatches;
                        });

                        activeCourses.forEach((c: any) => {
                            const assignment = assignments.find((a: any) => a.courseId === c.id);
                            const teacherAssignments = assignment ? assignment.teacherAssignments : [];
                            if (teacherAssignments && teacherAssignments.length > 0) {
                                totalOpenCourses++;
                            }
                        });
                    } catch (e) {
                        console.error("Error computing totalOpenCourses:", e);
                        totalOpenCourses = coursesSnap.size;
                    }
                    let todaySchedules: ScheduleItem[] = [];
                    let compensationScheduleDay = '';
                    const uid = currentUser?.uid;
                    if (uid) {
                        // 1. Determine standard Day Key
                        const dayNames = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
                        const now = new Date();
                        let dayKey = dayNames[now.getDay()];

                        // 2. Check for "Compensation Day" Override
                        try {
                            const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
                            
                            let todayEvent: CalendarEvent | undefined;
                            const defaultEvents = (reduxRawData?.events || {}) as Record<string, CalendarEvent>;
                            const academicYear = calendarState.academicYear || reduxRawData?.academicYear;

                            if (calendarState.status === 'succeeded') {
                                let yearEvents: Record<string, CalendarEvent> = {};
                                if (academicYear) {
                                    const yearDocRef = doc(db, 'school-settings', schoolId, 'main_calendar', String(academicYear));
                                    const yearDocSnap = await getDoc(yearDocRef);
                                    if (yearDocSnap.exists()) {
                                        yearEvents = (yearDocSnap.data().events || {}) as Record<string, CalendarEvent>;
                                    }
                                }
                                todayEvent = { ...defaultEvents, ...yearEvents }[todayStr];
                            } else {
                                const [defaultDocSnap, yearDocSnap] = await Promise.all([
                                    getDoc(doc(db, 'school-settings', schoolId, 'main_calendar', 'default')),
                                    calendarState.academicYear
                                        ? getDoc(doc(db, 'school-settings', schoolId, 'main_calendar', String(calendarState.academicYear)))
                                        : Promise.resolve(null)
                                ]);
                                const fallbackDefaultEvents = defaultDocSnap.exists() ? ((defaultDocSnap.data().events || {}) as Record<string, CalendarEvent>) : {};
                                const fallbackYearEvents = yearDocSnap && yearDocSnap.exists() ? ((yearDocSnap.data().events || {}) as Record<string, CalendarEvent>) : {};
                                todayEvent = { ...fallbackDefaultEvents, ...fallbackYearEvents }[todayStr];
                            }

                            if (todayEvent) {
                                // If today is marked as a school day AND has a specific scheduleDay override (e.g., 'mon')
                                if (todayEvent?.type === 'schoolDay' && todayEvent?.scheduleDay) {
                                    dayKey = todayEvent.scheduleDay;
                                    compensationScheduleDay = todayEvent.scheduleDay;
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
                            const teacherData = teacherSnap.docs[0].data();

                            // 3. Fetch period settings & courses & rooms to enrich schedule data
                            let periodSettings: Record<string, { startTime: string, endTime: string }> = {};
                            const [periodSnap, coursesSnap, assignmentSnap, roomsSnap, specialPeriodsSnap, learnerActivitiesSnap] = await Promise.all([
                                getDoc(doc(db, 'school-settings', schoolId, 'configs', 'schedule_settings')),
                                getDocs(collection(db, 'school-settings', schoolId, 'courses')),
                                getDocs(collection(db, 'school-settings', schoolId, 'course_assignments')),
                                getDocs(collection(db, 'school-settings', schoolId, 'physical-rooms')),
                                getDocs(collection(db, 'school-settings', schoolId, 'special-periods')),
                                getDocs(collection(db, 'school-settings', schoolId, 'learner-activities'))
                            ]);

                            // 3.1 Map Periods
                            let activePeriods: any[] = [];
                            if (periodSnap.exists()) {
                                const data = periodSnap.data();
                                if (data.periods && Array.isArray(data.periods)) {
                                    activePeriods = data.periods.map((p: any, arrIdx: number) => {
                                        const stableIndex = typeof p.index !== 'undefined'
                                            ? p.index
                                            : (typeof p.order !== 'undefined' ? p.order : arrIdx);
                                        return {
                                            ...p,
                                            id: p.id || `period-${stableIndex}`,
                                            index: stableIndex,
                                        };
                                    }).sort((a: any, b: any) => (a.index ?? 0) - (b.index ?? 0));

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
                                if (cdoc.data().courseCode) courseDataMap[cdoc.data().courseCode] = cdoc.data();
                                if (cdoc.data().subjectCode) courseDataMap[cdoc.data().subjectCode] = cdoc.data();
                            });

                            // 3.3 Map Rooms for Display Names & Codes
                            const roomDataMap: Record<string, { name: string, code: string }> = {};
                            roomsSnap.forEach(rdoc => {
                                const rdata = rdoc.data();
                                roomDataMap[rdoc.id] = {
                                    name: rdata.name || rdata.roomName || rdoc.id,
                                    code: rdata.roomCode || ''
                                };
                            });

                            const formatDisplayTime = (time?: string) => String(time || '').replace(':', '.');
                            const getPeriodNumberFromSlotKey = (slotKey: string, dayKeyVal: string) => {
                                const periodId = slotKey.replace(`${dayKeyVal}-`, '');
                                if (periodId === 'homeroom' || periodId === 'lunch') return null;
                                if (periodId.startsWith('period-')) return Number(periodId.replace('period-', '')) || null;

                                const index = Number(periodId);
                                if (Number.isFinite(index) && activePeriods.length > 0) {
                                    const setting = activePeriods.find((p: any) => p.index === index);
                                    if (setting) {
                                        if (setting.id === 'homeroom' || setting.id === 'lunch') return null;
                                        const match = String(setting.id || '').match(/^period-(\d+)$/);
                                        if (match) return Number(match[1]);
                                    }
                                }

                                const parsed = Number(periodId);
                                return Number.isFinite(parsed) ? (parsed === 0 ? 1 : parsed) : null;
                            };
                            const getClassVariants = (classValue: unknown): string[] => {
                                if (Array.isArray(classValue)) return Array.from(new Set(classValue.flatMap(getClassVariants)));
                                const value = String(classValue || '').trim();
                                if (!value) return [];
                                const fromLabel = Object.entries(CLASSES).find(([, label]) => label === value)?.[0];
                                const classKey = fromLabel || value;
                                return Array.from(new Set([classKey, CLASSES[classKey], value].filter(Boolean).map(String)));
                            };
                            const formatClassDisplay = (classValue: unknown) => {
                                const values = Array.isArray(classValue) ? classValue : [classValue];
                                const labels = values
                                    .flatMap(getClassVariants)
                                    .filter(Boolean)
                                    .map(v => CLASSES[v] || v);
                                return Array.from(new Set(labels)).join(', ') || 'ไม่ระบุชั้น';
                            };
                            const formatClassNameWithGroup = (classValue: unknown, groupNumber?: number) => {
                                const classIdStr = String(Array.isArray(classValue) ? classValue[0] : (classValue || '')).trim();
                                if (CLASSES[classIdStr]) return `${CLASSES[classIdStr]}${groupNumber ? `/${groupNumber}` : ''}`;
                                if (classIdStr.includes('/')) {
                                    const parts = classIdStr.split('/');
                                    const levelKey = parts[0];
                                    const roomNum = parts[parts.length - 1];
                                    if (CLASSES[levelKey]) return `${CLASSES[levelKey]}/${roomNum}`;
                                }
                                return `${formatClassDisplay(classValue)}${groupNumber ? `/${groupNumber}` : ''}`;
                            };
                            const normalizeRoomIds = (value: unknown): string[] => {
                                const values = Array.isArray(value) ? value : [value];
                                return values.map(v => String(v ?? '').trim()).filter(v => v && v.toLowerCase() !== 'all' && v !== 'ทุกห้อง');
                            };
                            const getStableClassKey = (value: unknown) => Array.isArray(value) ? value.map(String).filter(Boolean).join('-') : String(value || '');
                            const academicYear = calendarState.academicYear || String(getThaiYear(new Date()));
                            const todayDateStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
                            const currentTerm = (calendarState.terms || []).find((t: any) =>
                                t.startDate && t.endDate && todayDateStr >= t.startDate && todayDateStr <= t.endDate
                            ) || calendarState.terms?.[0];
                            const semester = currentTerm?.id === 'term2' || String(currentTerm?.name || '').includes('2') ? "2" : "1";
                            const assignmentMap: Record<string, any> = {};
                            assignmentSnap.forEach(assignmentDoc => {
                                const data = assignmentDoc.data();
                                const courseId = String(data.courseId || '').trim();
                                if (!courseId) return;
                                const dataYear = String(data.academicYear || "");
                                const dataSemester = String(data.semester || data.term || "");
                                const yearMatches = !academicYear || !dataYear || dataYear === academicYear;
                                const semesterMatches = !semester || !dataSemester || dataSemester === semester || dataSemester.startsWith(`${semester}/`) || semester.startsWith(`${dataSemester}/`) || dataSemester.includes(semester);
                                if (yearMatches && semesterMatches) assignmentMap[courseId] = data;
                            });

                            let schedQuery = query(collection(db, "school-settings", schoolId, "schedules"));
                            if (academicYear) schedQuery = query(schedQuery, where("academicYear", "==", academicYear));
                            const schedSnap = await getDocs(schedQuery);
                            schedSnap.forEach(sdoc => {
                                const data = sdoc.data();
                                const docTeacherId = data.teacherId || sdoc.id.split('__')[0];
                                if (String(docTeacherId) !== String(teacherDocId)) return;

                                const dataYear = String(data.academicYear || "");
                                const dataSemester = String(data.semester || data.term || "");
                                const yearMatches = !academicYear || !dataYear || dataYear === academicYear;
                                const semesterMatches = !semester || !dataSemester || dataSemester === semester || dataSemester.startsWith(`${semester}/`) || semester.startsWith(`${dataSemester}/`) || dataSemester.includes(semester);
                                if (!yearMatches || !semesterMatches) return;

                                const sch = data.schedule || {};
                                Object.keys(sch).forEach(key => {
                                    if (key.startsWith(dayKey + '-') && sch[key]) {
                                        const periodNumber = getPeriodNumberFromSlotKey(key, dayKey);
                                        if (!periodNumber) return;
                                        const periodTime = periodSettings[`period-${periodNumber}`] || periodSettings[String(periodNumber)] || {};
                                        const rawCourse = sch[key];
                                        const coursesArray = Array.isArray(rawCourse) ? rawCourse : [rawCourse];

                                        coursesArray.forEach((course: any) => {
                                            if (!course || course === '-') return;
                                            const courseId = course.id || course.courseId || '';
                                            const subjectCode = course.code || course.courseCode || course.subjectCode || '';
                                            const fullCourseData = courseId ? courseDataMap[courseId] : (subjectCode ? courseDataMap[subjectCode] : null);
                                            const assignments = [
                                                ...(Array.isArray(assignmentMap[courseId]?.teacherAssignments) ? assignmentMap[courseId].teacherAssignments : []),
                                                ...(Array.isArray(fullCourseData?.teacherAssignments) ? fullCourseData.teacherAssignments : []),
                                                ...(Array.isArray(course.teacherAssignments) ? course.teacherAssignments : [])
                                            ];
                                            const myAssignment = assignments.find((assignment: any) =>
                                                String(assignment.teacherId) === String(teacherDocId) ||
                                                (Array.isArray(assignment.teacherIds) && assignment.teacherIds.map(String).includes(String(teacherDocId)))
                                            );
                                            const isMyCourse = String(course.teacherId) === String(teacherDocId) ||
                                                String(data.teacherId) === String(teacherDocId) ||
                                                (Array.isArray(course.teacherIds) && course.teacherIds.map(String).includes(String(teacherDocId))) ||
                                                Boolean(myAssignment);
                                            if (!isMyCourse) return;

                                            const courseClassId = (myAssignment?.classLevels && myAssignment.classLevels.length > 0)
                                                ? myAssignment.classLevels
                                                : (course.classId || fullCourseData?.classId || data.classId);
                                            const groupNumber = Number(course.groupNumber || course.group || 1) || 1;
                                            const roomIds = normalizeRoomIds(myAssignment?.roomIds || course.room || course.roomIds || course.roomNumber || data.room || data.roomNumber);
                                            const displayRoom = roomIds.length > 0
                                                ? roomIds.map((rid: string) => {
                                                    const r = roomDataMap[rid];
                                                    if (!r) return rid;
                                                    return r.code ? `${r.name} (${r.code})` : r.name;
                                                }).join(', ')
                                                : String(groupNumber);
                                            const subjectName = course.title || course.subjectName || course.name || fullCourseData?.title || fullCourseData?.subjectName || "ไม่ระบุชื่อวิชา";
                                            const className = formatClassNameWithGroup(courseClassId, groupNumber);
                                            const startTime = formatDisplayTime(periodTime.startTime);
                                            const endTime = formatDisplayTime(periodTime.endTime);

                                            todaySchedules.push({
                                                id: `${sdoc.id}-${key}-${courseId || subjectCode || 'course'}-${groupNumber}`,
                                                courseId,
                                                subjectCode,
                                                period: `คาบ ${periodNumber}`,
                                                subject: subjectName,
                                                classId: courseClassId,
                                                class: className,
                                                className,
                                                room: displayRoom,
                                                roomIds,
                                                groupNumber,
                                                day: dayKey,
                                                startTime,
                                                endTime,
                                                actionPath: '/academic/classroom-attendance',
                                                actionLabel: 'เช็คชื่อ',
                                                type: 'classroom',
                                                isSubstitute: false,
                                                _sortIndex: periodNumber,
                                                _startMinutes: timeToMinutes(startTime)
                                            });
                                        });
                                    }
                                });
                            });

                            const specialPeriods = specialPeriodsSnap.docs.map(periodDoc => ({ id: periodDoc.id, ...periodDoc.data() } as any));
                            const periodsForToday = specialPeriods.filter(period => isSpecialPeriodForDay(period, dayKey));
                            const findSpecialPeriod = (keywords: string[]) => periodsForToday.find(period => includesAnyKeyword(String(period.title || ''), keywords));

                            const homeroomPeriod = findSpecialPeriod(['โฮมรูม', 'homeroom']);
                            const homeroomGrade = String(teacherData.homeroomGrade || '').trim();
                            const homeroomRoom = String(
                                teacherData.homeroomRoom ||
                                (homeroomGrade.includes('/') ? homeroomGrade.split('/')[1]?.trim() : '') ||
                                ''
                            ).trim();
                            const gradeOnly = homeroomGrade.includes('/') ? homeroomGrade.split('/')[0]?.trim() : homeroomGrade;
                            const classKey = Object.keys(CLASSES).find(key => key === gradeOnly || CLASSES[key] === gradeOnly) || gradeOnly;
                            if (homeroomPeriod && classKey) {
                                const startTime = homeroomPeriod.startTime || periodSettings.homeroom?.startTime || '08:30';
                                const endTime = homeroomPeriod.endTime || periodSettings.homeroom?.endTime || '08:40';
                                todaySchedules.push({
                                    period: 'โฮมรูม',
                                    subject: 'เช็คชื่อโฮมรูม',
                                    subjectCode: '',
                                    class: `${CLASSES[classKey] || classKey}${homeroomRoom ? `/${homeroomRoom}` : ''}`,
                                    room: '-',
                                    startTime,
                                    endTime,
                                    actionPath: '/academic/homeroom-attendance',
                                    actionLabel: 'เช็คโฮมรูม',
                                    type: 'homeroom',
                                    _sortIndex: 0,
                                    _startMinutes: timeToMinutes(startTime)
                                });
                            }

                            const myClubs = clubsSnap.docs
                                .map(clubDoc => ({ id: clubDoc.id, ...clubDoc.data() } as any))
                                .filter(club => Array.isArray(club.responsibleTeacherIds) && (
                                    club.responsibleTeacherIds.includes(teacherDocId) ||
                                    club.responsibleTeacherIds.includes(uid)
                                ));
                            const fallbackClubPeriod = findSpecialPeriod(['ชุมนุม', 'club']);
                            
                            // Group clubs by specialPeriodId (or fallback if empty)
                            const clubsByPeriodMap: Record<string, typeof myClubs> = {};
                            myClubs.forEach(club => {
                                const periodId = club.specialPeriodId || fallbackClubPeriod?.id || 'fallback';
                                if (!clubsByPeriodMap[periodId]) {
                                    clubsByPeriodMap[periodId] = [];
                                }
                                clubsByPeriodMap[periodId].push(club);
                            });

                            Object.entries(clubsByPeriodMap).forEach(([periodId, clubsList]) => {
                                const clubPeriod = periodsForToday.find(period => period.id === periodId) || fallbackClubPeriod;
                                if (!clubPeriod) return;

                                // Join the club names nicely
                                const firstClubName = clubsList[0]?.name || '';
                                const displayClubName = clubsList.length > 1
                                    ? `${firstClubName} +${clubsList.length - 1}`
                                    : firstClubName;
                                todaySchedules.push({
                                    period: 'ชุมนุม',
                                    subject: `ชุมนุม${displayClubName ? `: ${displayClubName}` : ''}`,
                                    subjectCode: '',
                                    class: 'ครูผู้ดูแล',
                                    room: '-',
                                    startTime: clubPeriod.startTime,
                                    endTime: clubPeriod.endTime,
                                    actionPath: '/academic/club-attendance',
                                    actionLabel: 'เช็คชุมนุม',
                                    type: 'club',
                                    _sortIndex: 90,
                                    _startMinutes: timeToMinutes(clubPeriod.startTime)
                                });
                            });

                            const learnerActivities = learnerActivitiesSnap.docs
                                .map(activityDoc => ({ id: activityDoc.id, ...activityDoc.data() } as any))
                                .filter(activity => Array.isArray(activity.responsibleTeacherIds) && (
                                    activity.responsibleTeacherIds.includes(teacherDocId) ||
                                    activity.responsibleTeacherIds.includes(uid)
                                ));

                            // Group learner activities by specialPeriodId
                            const activitiesByPeriodMap: Record<string, typeof learnerActivities> = {};
                            learnerActivities.forEach(activity => {
                                const periodId = activity.specialPeriodId || 'unknown';
                                if (!activitiesByPeriodMap[periodId]) {
                                    activitiesByPeriodMap[periodId] = [];
                                }
                                activitiesByPeriodMap[periodId].push(activity);
                            });

                            Object.entries(activitiesByPeriodMap).forEach(([periodId, activitiesList]) => {
                                const activityPeriod = periodsForToday.find(period => period.id === periodId);
                                if (!activityPeriod) return;

                                // Join names of activities
                                const firstActivityName = activitiesList[0]?.name || 'กิจกรรมพัฒนาผู้เรียน';
                                const displayActivityName = activitiesList.length > 1
                                    ? `${firstActivityName} +${activitiesList.length - 1}`
                                    : firstActivityName;
                                todaySchedules.push({
                                    period: activityPeriod.title || 'กิจกรรม',
                                    subject: displayActivityName,
                                    subjectCode: activitiesList[0]?.courseCode || '',
                                    class: 'กิจกรรมพัฒนาผู้เรียน',
                                    room: '-',
                                    startTime: activityPeriod.startTime,
                                    endTime: activityPeriod.endTime,
                                    actionPath: '/academic/learner-activity-attendance',
                                    actionLabel: 'เช็คกิจกรรม',
                                    type: 'learnerActivity',
                                    _sortIndex: 95,
                                    _startMinutes: timeToMinutes(activityPeriod.startTime)
                                });
                            });

                            const formatScheduleClassName = (classId: any, groupNumber?: string | number) => {
                                const classIdStr = String(Array.isArray(classId) ? classId[0] : (classId || '')).trim();
                                const groupSuffix = groupNumber ? `/${groupNumber}` : '';
                                if (!classIdStr) return 'ไม่ระบุชั้น';
                                if (CLASSES[classIdStr]) return `${CLASSES[classIdStr]}${groupSuffix}`;
                                if (classIdStr.includes('/')) {
                                    const parts = classIdStr.split('/');
                                    const levelKey = parts[0];
                                    const roomNum = parts[parts.length - 1];
                                    if (CLASSES[levelKey]) return `${CLASSES[levelKey]}/${roomNum}`;
                                }
                                return `${classIdStr}${groupSuffix}`;
                            };

                            const formatRoomDisplay = (rawRoom: any) => {
                                if (typeof rawRoom === 'string' && rawRoom.trim()) return rawRoom;
                                const roomIds = Array.isArray(rawRoom) ? rawRoom : (rawRoom ? [rawRoom] : []);
                                const roomDisplays = roomIds
                                    .filter((rid: any) => rid && String(rid).toLowerCase() !== 'all' && rid !== 'ทุกห้อง')
                                    .map((rid: any) => {
                                        const r = roomDataMap[String(rid)];
                                        if (!r) return String(rid);
                                        return r.code ? `${r.name} (${r.code})` : r.name;
                                    });
                                return roomDisplays.join(', ') || '-';
                            };

                            const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
                            const todayEnd = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);
                            const substitutionsSnap = await getDocs(query(
                                collection(db, 'school-settings', schoolId, 'substitutions'),
                                where('substituteTeacherId', '==', teacherDocId)
                            ));

                            substitutionsSnap.forEach(subDoc => {
                                const data = subDoc.data();
                                const subDate = data.date?.toDate ? data.date.toDate() : (data.date ? new Date(data.date) : null);
                                if (!subDate || subDate < todayStart || subDate > todayEnd) return;

                                const periodNumber = normalizeTeachingPeriod(data.period);
                                const periodKey = periodNumber ? `period-${periodNumber}` : String(data.period || '');
                                const periodTime = periodSettings[periodKey] || periodSettings[String(periodNumber)] || {};
                                const startTime = formatDisplayTime(data.startTime) || formatDisplayTime(periodTime.startTime) || '';
                                const endTime = formatDisplayTime(data.endTime) || formatDisplayTime(periodTime.endTime) || '';
                                const roomDisplay = formatRoomDisplay(data.roomName || data.room || data.roomIds || data.classroom);
                                const subClassName = formatScheduleClassName(data.classId, data.groupNumber || data.group);

                                todaySchedules.push({
                                    id: `sub-${subDoc.id}`,
                                    substitutionId: subDoc.id,
                                    courseId: data.courseId || data.originalCourseId || '',
                                    period: periodNumber ? `คาบ ${periodNumber}` : 'สอนแทน',
                                    subject: data.subjectName || 'สอนแทน',
                                    subjectCode: data.subjectCode || '',
                                    classId: data.classId,
                                    class: subClassName,
                                    className: subClassName,
                                    room: roomDisplay,
                                    roomIds: normalizeRoomIds(data.room || data.roomIds || data.classroom),
                                    groupNumber: Number(data.groupNumber || data.group || 1) || 1,
                                    day: dayKey,
                                    startTime,
                                    endTime,
                                    actionPath: '/academic/classroom-attendance',
                                    actionLabel: 'เช็คสอนแทน',
                                    type: 'substitute',
                                    isSubstitute: true,
                                    originalTeacherId: data.originalTeacherId || '',
                                    originalTeacherName: data.originalTeacherName || 'ไม่ระบุ',
                                    _sortIndex: periodNumber ? periodNumber + 0.1 : 98,
                                    _startMinutes: timeToMinutes(startTime)
                                });
                            });

                            // Deduplicate schedules to prevent duplicate entries for the same slot
                            const uniqueSchedulesMap = new Map<string, ScheduleItem>();
                            todaySchedules.forEach(item => {
                                const periodKey = item.period || `period-${item._sortIndex}`;
                                const classKey = Array.isArray(item.classId) ? item.classId.join('-') : String(item.classId || '');
                                const courseKey = item.courseId || item.subjectCode || item.subject;
                                const subKey = item.isSubstitute ? `sub-${item.substitutionId}` : 'normal';
                                const key = `${item.type}-${periodKey}-${classKey}-${courseKey}-${subKey}`;
                                uniqueSchedulesMap.set(key, item);
                            });
                            todaySchedules = Array.from(uniqueSchedulesMap.values());

                            todaySchedules.sort((a: any, b: any) => (a._startMinutes ?? 9999) - (b._startMinutes ?? 9999) || (a._sortIndex ?? 999) - (b._sortIndex ?? 999));
                            const groupedSchedules: ScheduleItem[] = [];
                            for (let i = 0; i < todaySchedules.length; i++) {
                                const current = { ...todaySchedules[i] };
                                const currentPeriod = Number(current._sortIndex);
                                const periods = Number.isFinite(currentPeriod) ? [Math.floor(currentPeriod)] : [];

                                while (periods.length > 0 && i + 1 < todaySchedules.length) {
                                    const next = todaySchedules[i + 1];
                                    const nextPeriod = Number(next._sortIndex);
                                    const expectedPeriod = periods[0] + periods.length;
                                    const isConsecutive = Number.isFinite(nextPeriod) && Math.floor(nextPeriod) === expectedPeriod;
                                    const sameCourse = next.courseId === current.courseId && next.subjectCode === current.subjectCode;
                                    const sameClass = getStableClassKey(next.classId) === getStableClassKey(current.classId) && next.className === current.className;
                                    const sameGroup = next.groupNumber === current.groupNumber;
                                    const sameRoom = next.room === current.room;
                                    const sameType = next.type === current.type && next.isSubstitute === current.isSubstitute && next.originalTeacherId === current.originalTeacherId;

                                    if (current.type === 'classroom' && isConsecutive && sameCourse && sameClass && sameGroup && sameRoom && sameType) {
                                        periods.push(Math.floor(nextPeriod));
                                        current.endTime = next.endTime;
                                        i++;
                                    } else {
                                        break;
                                    }
                                }

                                if (periods.length > 1) {
                                    current.isDoublePeriod = true;
                                    current.periods = periods;
                                    current.period = `คาบ ${periods.join('-')}`;
                                } else if (periods.length === 1 && current.type === 'classroom') {
                                    current.period = `คาบ ${periods[0]}`;
                                }
                                groupedSchedules.push(current);
                            }
                            todaySchedules = groupedSchedules;
                        }
                    }
                    setAcademicReport({ totalCourses: totalOpenCourses, totalClubs: clubsSnap.size, totalEnrollments: enrollmentsSnap.size, todaySchedules, compensationScheduleDay });
                } catch (e) { console.warn("Academic report fetch:", e); }
            } catch (error) { console.error("Error fetching report data:", error); }
            finally { setReportLoading(false); }
        };
        fetchReportData();
    }, [currentUser, calendarState.academicYear]);

    // --- News handlers ---
    const closeNewsPopup = () => { newsList.forEach(news => sessionStorage.setItem(`seen_news_${news.id}`, 'true')); setShowNewsModal(false); };
    const handleNextNews = () => setCurrentNewsIndex(prev => (prev + 1) % newsList.length);
    const handlePrevNews = () => setCurrentNewsIndex(prev => (prev - 1 + newsList.length) % newsList.length);
    useEffect(() => { if (!showNewsModal || newsList.length <= 1) return; const iv = setInterval(() => setCurrentNewsIndex(prev => (prev + 1) % newsList.length), 5000); return () => clearInterval(iv); }, [showNewsModal, newsList.length]);
    const currentNews = newsList[currentNewsIndex];
    const incrementViewCount = async (id: string) => { const schoolId = currentUser?.schoolId; if (!schoolId || !id) return; try { await updateDoc(doc(db, "school-settings", schoolId, "news", id), { viewCount: increment(1) }); } catch (error) { console.error("Error incrementing view count:", error); } };
    useEffect(() => { if (showNewsModal && currentNews && !viewedNewsIds.current.has(currentNews.id)) { incrementViewCount(currentNews.id); viewedNewsIds.current.add(currentNews.id); } }, [currentNews, showNewsModal]);

    // === DERIVED STATS FOR BMG SMART SCHOOL STYLE REPORT ===
    const totalStudents = studentReport.active || 0; // count only studying students (กำลังศึกษาอยู่)
    const stSummary = studentTodaySummary || {};
    const sPresent = stSummary.present || 0;
    const sLate = stSummary.late || 0;
    const sLeave = stSummary.leave || 0;
    const sOfficial = stSummary.officialTravel || 0;
    const sAbsent = stSummary.absent || 0;
    
    // Total scans recorded
    const sTotalScans = sPresent + sLate + sLeave + sOfficial + sAbsent;
    
    const studentAttendanceStats = {
        present: sPresent,
        late: sLate,
        leave: sLeave,
        officialTravel: sOfficial,
        absent: sAbsent + Math.max(0, totalStudents - sTotalScans),
        total: Math.max(totalStudents, sTotalScans)
    };

    const totalTeachers = activeTeachersCount !== null ? activeTeachersCount : (teacherReport.total || 0);
    const tSummary = teacherTodaySummary || {};
    const tPresent = tSummary.present || 0;
    const tLate = tSummary.late || 0;
    const tLeave = Math.max(tSummary.leave || 0, (leaveReport.teacherSick || 0) + (leaveReport.teacherPersonal || 0));
    const tOfficial = Math.max(tSummary.officialTravel || 0, leaveReport.teacherOfficial || 0);
    const tAbsent = tSummary.absent || 0;
    
    const tTotalScans = tPresent + tLate + tLeave + tOfficial + tAbsent;
    
    const teacherAttendanceStats = {
        present: tPresent,
        late: tLate,
        leave: tLeave,
        officialTravel: tOfficial,
        absent: tAbsent + Math.max(0, totalTeachers - tTotalScans),
        total: Math.max(totalTeachers, tTotalScans)
    };

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

    const CustomTooltip = ({ active, payload, isPie }: any) => {
        if (active && payload && payload.length) {
            if (isPie) {
                const data = payload[0].payload;
                return (
                    <div className="relative bg-white/95 dark:bg-[#1a1b1e]/95 backdrop-blur-md p-3.5 border border-gray-200/80 dark:border-gray-800 shadow-[0_10px_25px_-5px_rgba(0,0,0,0.1),0_8px_10px_-6px_rgba(0,0,0,0.1)] dark:shadow-none rounded-xl text-xs z-50 min-w-[170px] pointer-events-none transition-all duration-200">
                        {/* Status Header */}
                        <div className="flex items-center gap-2 mb-2.5 pb-2 border-b border-gray-100 dark:border-white/5">
                            <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: data.actualColor, boxShadow: `0 0 8px ${data.actualColor}` }} />
                            <p className="font-extrabold text-gray-800 dark:text-gray-200 text-[13px] tracking-tight">{data.name}</p>
                        </div>
                        {/* Metrics */}
                        <div className="space-y-1.5 font-medium">
                            <div className="flex justify-between items-center">
                                <span className="text-gray-400 dark:text-gray-500 font-semibold">จำนวน:</span>
                                <span className="font-extrabold text-gray-900 dark:text-white text-right">{data.value} คน</span>
                            </div>
                            <div className="flex justify-between items-center">
                                <span className="text-gray-400 dark:text-gray-500 font-semibold">คิดเป็น:</span>
                                <span className="font-extrabold text-indigo-600 dark:text-indigo-400 text-right">{data.percent}%</span>
                            </div>
                        </div>
                        {/* Micro Progress Bar */}
                        <div className="mt-2.5 h-1 bg-gray-100 dark:bg-white/5 rounded-full overflow-hidden">
                            <div className="h-full rounded-full transition-all duration-500" style={{ width: `${data.percent}%`, backgroundColor: data.actualColor }} />
                        </div>
                    </div>
                );
            }
        }
        return null;
    };

    const getPieData = (stats: any, isTeacher: boolean = false) => {
        if (!stats || !stats.total) return [];
        return [
            { name: isTeacher ? 'มาปฏิบัติงาน' : 'มาเรียน', value: stats.present, color: '#10B981', actualColor: '#10B981', percent: Math.round((stats.present / stats.total) * 100) || 0 },
            { name: 'สาย', value: stats.late, color: '#F59E0B', actualColor: '#F59E0B', percent: Math.round((stats.late / stats.total) * 100) || 0 },
            { name: 'ลา', value: stats.leave, color: '#8B5CF6', actualColor: '#8B5CF6', percent: Math.round((stats.leave / stats.total) * 100) || 0 },
            { name: 'ไปราชการ', value: stats.officialTravel, color: '#6366F1', actualColor: '#6366F1', percent: Math.round((stats.officialTravel / stats.total) * 100) || 0 },
            { name: isTeacher ? 'ขาดงาน' : 'ขาดเรียน', value: stats.absent, color: '#EF4444', actualColor: '#EF4444', percent: Math.round((stats.absent / stats.total) * 100) || 0 }
        ].filter(d => d.value > 0);
    };

    const presentStudentCount = studentAttendanceStats.present + studentAttendanceStats.late + studentAttendanceStats.officialTravel;
    const presentTeacherCount = teacherAttendanceStats.present + teacherAttendanceStats.late + teacherAttendanceStats.officialTravel;

    const stats = [
        { title: "มาเรียนวันนี้", value: `${presentStudentCount}/${totalStudents}`, change: renderStudentStats(studentAttendanceStats), color: "bg-blue-500" },
        { title: "ครูปฏิบัติงาน", value: `${presentTeacherCount}/${totalTeachers}`, change: renderTeacherStats(teacherAttendanceStats), color: "bg-green-500" },
        { title: "รอการอนุมัติ", value: "0", change: renderPendingDocs({ normal: 0, urgent: 0, very_urgent: 0, most_urgent: 0 }), color: "bg-yellow-500" }
    ];



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
                    <div className="bg-white dark:bg-[#2a2b2f] rounded-[24px] p-4 sm:p-5 mb-8 border border-gray-100 dark:border-gray-800 shadow-sm transition-all duration-300 relative overflow-hidden group">
                        {/* Decorative Background Elements */}
                        <div className="absolute top-0 right-0 w-48 h-48 bg-indigo-500/5 rounded-full -mr-24 -mt-24 blur-3xl pointer-events-none"></div>

                        <div className="relative flex flex-row justify-between items-center gap-3 sm:gap-6">
                            {/* Left Side: Welcome Info */}
                            <div className="flex flex-col min-w-0 flex-1">
                                <div className="flex items-center gap-1.5 text-[9px] sm:text-xs font-black uppercase tracking-wider text-indigo-600 dark:text-indigo-400 mb-1">
                                    <Activity size={12} className="animate-pulse flex-shrink-0" />
                                    <span className="truncate">ยินดีต้อนรับ</span>
                                </div>
                                <h1 className="text-lg sm:text-2xl font-black text-gray-900 dark:text-white flex items-center gap-2 min-w-0 leading-tight">
                                    <span className="opacity-90 flex-shrink-0 hidden xs:inline">สวัสดี,</span>
                                    <span className="truncate">
                                        {user?.fullName || userName}
                                    </span>
                                    <span className="hover:rotate-12 transition-transform cursor-default flex-shrink-0 font-normal">👋</span>
                                </h1>
                                <div className="mt-1 flex items-center gap-1.5">
                                    <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse flex-shrink-0"></div>
                                    <span className="text-[10px] sm:text-xs font-bold text-gray-700 dark:text-gray-200 truncate">BMG Smart School</span>
                                </div>
                            </div>

                            {/* Right Side: Compact Premium Date Badge */}
                            <div className="flex-shrink-0">
                                <div className="flex items-center gap-2 sm:gap-3.5 px-3 sm:px-4 py-2 bg-gray-50/80 dark:bg-white/[0.03] rounded-[18px] border border-gray-100 dark:border-white/5 shadow-inner backdrop-blur-sm">
                                    <div className="text-right">
                                        <p className="text-[9px] text-gray-400 dark:text-gray-500 font-bold uppercase tracking-wider leading-none mb-0.5 sm:mb-1">
                                            วันที่ปัจจุบัน
                                        </p>
                                        {/* Desktop Date */}
                                        <p className="hidden sm:block text-xs sm:text-sm font-black text-gray-800 dark:text-gray-100 whitespace-nowrap">
                                            {new Date().toLocaleDateString('th-TH', {
                                                day: 'numeric',
                                                month: 'long',
                                                year: 'numeric'
                                            })}
                                        </p>
                                        {/* Mobile Date */}
                                        <p className="sm:hidden text-xs font-black text-gray-800 dark:text-gray-100 whitespace-nowrap">
                                            {new Date().getDate()} {thaiMonths[new Date().getMonth()]} {new Date().getFullYear() + 543}
                                        </p>
                                    </div>
                                    <div className="p-1.5 sm:p-2 bg-gradient-to-tr from-indigo-500 to-indigo-600 rounded-xl text-white shadow-lg shadow-indigo-500/20 group-hover:scale-105 transition-transform flex-shrink-0">
                                        <CalendarCheck size={18} className="sm:w-5 sm:h-5" strokeWidth={2.5} />
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>







                    {/* SYSTEM REPORT - For all roles except Super Admin */}
                    {!isSuperAdmin && (
                        <div className="mb-8">
                            <div className="flex items-center gap-2 mb-5"><div className="w-1 h-6 bg-gradient-to-b from-indigo-500 to-purple-500 rounded-full" /><h2 className="text-lg font-bold tracking-tight">สรุปรายงานระบบ</h2><span className="text-xs px-2 py-0.5 bg-indigo-100 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400 rounded-full font-semibold">Real-time</span></div>
                            {
                                reportLoading ? <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">{Array.from({ length: 3 }).map((_, i) => <div key={i} className="bg-white dark:bg-[#2a2b2f] rounded-2xl p-5 shadow-sm"><SkeletonLoader height="120px" className="rounded-xl" /></div>)}</div> : (<>
                                    <div className="grid grid-cols-3 gap-2 mb-6">
                                        {stats.map((s, i) => (
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
                                        ))}
                                    </div></>)}
                        </div>
                    )}

                    {!isSuperAdmin && (
                        <div className="grid grid-cols-2 gap-2 sm:gap-4 lg:gap-6 mb-8">
                            {/* Student Attendance Donut */}
                            <div className="bg-white dark:bg-[#2a2b2f] p-2 sm:p-4 rounded-2xl sm:rounded-3xl shadow-sm border border-gray-100 dark:border-white/5 relative overflow-hidden group hover:shadow-xl hover:shadow-indigo-500/5 transition-all duration-500">
                                <div className="absolute top-0 right-0 w-32 h-32 bg-indigo-500/5 rounded-full blur-3xl -mr-16 -mt-16 group-hover:bg-indigo-500/10 transition-colors"></div>
                                <div className="flex justify-between items-start mb-6">
                                    <div>
                                        <div className="flex items-center gap-2 mb-1">
                                            <div className="w-1.5 h-4 sm:h-6 bg-indigo-500 rounded-full"></div>
                                            <h3 className="text-base sm:text-xl font-black tracking-tight text-gray-900 dark:text-white uppercase">นักเรียน</h3>
                                        </div>
                                        <p className="text-[6px] sm:text-[8px] lg:text-[10px] font-bold text-gray-400 uppercase tracking-tight sm:tracking-widest ml-2 sm:ml-3">Student Stats</p>
                                    </div>
                                    <div className="flex items-center gap-1 sm:gap-1.5 bg-indigo-50 dark:bg-indigo-900/20 px-1 sm:px-2 py-0.5 sm:py-1 rounded-lg border border-indigo-100 dark:border-indigo-500/20">
                                        <Users size={8} className="text-indigo-600 dark:text-indigo-400 sm:w-[12px] sm:h-[12px]" />
                                        <span className="text-[8px] sm:text-[10px] font-black text-indigo-600 dark:text-indigo-400">วันนี้</span>
                                    </div>
                                </div>
                                <div className="grid grid-cols-2 lg:grid-cols-5 gap-1.5 sm:gap-4 items-center">
                                    <div className="col-span-1 lg:col-span-3 h-[80px] xs:h-[120px] sm:h-[180px] lg:h-[240px] relative">
                                        {reportLoading ? (
                                            <div className="absolute inset-0 flex items-center justify-center">
                                                <SkeletonLoader variant="circle" className="h-full w-auto max-w-full aspect-square" />
                                            </div>
                                        ) : (
                                            <ResponsiveContainer width="100%" height="100%">
                                                <PieChart>
                                                    <Pie
                                                        data={getPieData(studentAttendanceStats)}
                                                        cx="50%" cy="50%" innerRadius="65%" outerRadius="85%" paddingAngle={2} dataKey="value" stroke="none" startAngle={90} endAngle={450}
                                                    >
                                                        {getPieData(studentAttendanceStats).map((entry, index) => <Cell key={`cell-${index}`} fill={entry.color} />)}
                                                    </Pie>
                                                    <RechartsTooltip content={<CustomTooltip isPie={true} />} wrapperStyle={{ zIndex: 50 }} />
                                                </PieChart>
                                            </ResponsiveContainer>
                                        )}
                                        <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none z-0">
                                            <span className="text-xs xs:text-base sm:text-2xl lg:text-4xl font-black text-indigo-600 dark:text-indigo-400 leading-none tracking-tighter">
                                                {studentAttendanceStats?.total ? Math.round(((studentAttendanceStats.present + studentAttendanceStats.late + studentAttendanceStats.officialTravel) / studentAttendanceStats.total) * 100) : 0}%
                                            </span>
                                            <span className="text-[6px] sm:text-[8px] lg:text-[10px] font-black text-gray-400 uppercase tracking-widest mt-0.5 sm:mt-1">มาเรียน</span>
                                        </div>
                                    </div>
                                    <div className="col-span-1 lg:col-span-2 space-y-1 sm:space-y-2">
                                        {[
                                            { label: 'มาเรียน', val: studentAttendanceStats?.present || 0, color: 'bg-emerald-500', text: 'text-emerald-500' },
                                            { label: 'สาย', val: studentAttendanceStats?.late || 0, color: 'bg-amber-500', text: 'text-amber-500' },
                                            { label: 'ลา', val: studentAttendanceStats?.leave || 0, color: 'bg-purple-500', text: 'text-purple-500' },
                                            { label: 'ไปราชการ', val: studentAttendanceStats?.officialTravel || 0, color: 'bg-indigo-500', text: 'text-indigo-500' },
                                            { label: 'ขาดเรียน', val: studentAttendanceStats?.absent || 0, color: 'bg-red-500', text: 'text-red-500' }
                                        ].map(item => (
                                            <div key={item.label} className="flex items-center justify-between p-1 sm:p-2 rounded-lg bg-gray-50 dark:bg-white/[0.02] border border-gray-100 dark:border-white/5">
                                                <div className="flex items-center gap-1">
                                                    <div className={`w-1 h-1 sm:w-1.5 sm:h-1.5 rounded-full ${item.color}`}></div>
                                                    <span className="text-[6px] xs:text-[7px] sm:text-[9px] lg:text-[11px] font-bold text-gray-500 dark:text-gray-400 uppercase tracking-tight">{item.label}</span>
                                                </div>
                                                <span className={`text-[7px] sm:text-xs font-black ${item.text}`}>{item.val}</span>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            </div>
                            {/* Teacher Attendance Donut */}
                            <div className="bg-white dark:bg-[#2a2b2f] p-2 sm:p-4 rounded-2xl sm:rounded-3xl shadow-sm border border-gray-100 dark:border-white/5 relative overflow-hidden group hover:shadow-xl hover:shadow-emerald-500/5 transition-all duration-500">
                                <div className="absolute top-0 right-0 w-32 h-32 bg-emerald-500/5 rounded-full blur-3xl -mr-16 -mt-16 group-hover:bg-emerald-500/10 transition-colors"></div>
                                <div className="flex justify-between items-start mb-6">
                                    <div>
                                        <div className="flex items-center gap-2 mb-1">
                                            <div className="w-1.5 h-4 sm:h-6 bg-emerald-500 rounded-full"></div>
                                            <h3 className="text-base sm:text-xl font-black tracking-tight text-gray-900 dark:text-white uppercase">บุคลากร</h3>
                                        </div>
                                        <p className="text-[6px] sm:text-[8px] lg:text-[10px] font-bold text-gray-400 uppercase tracking-tight sm:tracking-widest ml-2 sm:ml-3">Staff Stats</p>
                                    </div>
                                    <div className="flex items-center gap-1 sm:gap-1.5 bg-emerald-50 dark:bg-emerald-900/20 px-1 sm:px-2 py-0.5 sm:py-1 rounded-lg border border-emerald-100 dark:border-emerald-500/20">
                                        <Briefcase size={8} className="text-emerald-600 dark:text-emerald-400 sm:w-[12px] sm:h-[12px]" />
                                        <span className="text-[8px] sm:text-[10px] font-black text-emerald-600 dark:text-emerald-400">วันนี้</span>
                                    </div>
                                </div>
                                <div className="grid grid-cols-2 lg:grid-cols-5 gap-1.5 sm:gap-4 items-center">
                                    <div className="col-span-1 lg:col-span-3 h-[80px] xs:h-[120px] sm:h-[180px] lg:h-[240px] relative">
                                        {reportLoading ? (
                                            <div className="absolute inset-0 flex items-center justify-center">
                                                <SkeletonLoader variant="circle" className="h-full w-auto max-w-full aspect-square" />
                                            </div>
                                        ) : (
                                            <ResponsiveContainer width="100%" height="100%">
                                                <PieChart>
                                                    <Pie
                                                        data={getPieData(teacherAttendanceStats, true)}
                                                        cx="50%" cy="50%" innerRadius="65%" outerRadius="85%" paddingAngle={2} dataKey="value" stroke="none" startAngle={90} endAngle={450}
                                                    >
                                                        {getPieData(teacherAttendanceStats, true).map((entry, index) => <Cell key={`cell-${index}`} fill={entry.color} />)}
                                                    </Pie>
                                                    <RechartsTooltip content={<CustomTooltip isPie={true} />} wrapperStyle={{ zIndex: 50 }} />
                                                </PieChart>
                                            </ResponsiveContainer>
                                        )}
                                        <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none z-0">
                                            <span className="text-xs xs:text-base sm:text-2xl lg:text-4xl font-black text-emerald-600 dark:text-emerald-400 leading-none tracking-tighter">
                                                {teacherAttendanceStats?.total ? Math.round(((teacherAttendanceStats.present + teacherAttendanceStats.late + teacherAttendanceStats.officialTravel) / teacherAttendanceStats.total) * 100) : 0}%
                                            </span>
                                            <span className="text-[6px] sm:text-[8px] lg:text-[10px] font-black text-gray-400 uppercase tracking-widest mt-0.5 sm:mt-1">ปฏิบัติงาน</span>
                                        </div>
                                    </div>
                                    <div className="col-span-1 lg:col-span-2 space-y-1 sm:space-y-2">
                                        {[
                                            { label: 'มาปฏิบัติงาน', val: teacherAttendanceStats?.present || 0, color: 'bg-emerald-500', text: 'text-emerald-500' },
                                            { label: 'สาย', val: teacherAttendanceStats?.late || 0, color: 'bg-amber-500', text: 'text-amber-500' },
                                            { label: 'ลา', val: teacherAttendanceStats?.leave || 0, color: 'bg-purple-500', text: 'text-purple-500' },
                                            { label: 'ไปราชการ', val: teacherAttendanceStats?.officialTravel || 0, color: 'bg-indigo-500', text: 'text-indigo-500' },
                                            { label: 'ขาดงาน', val: teacherAttendanceStats?.absent || 0, color: 'bg-red-500', text: 'text-red-500' }
                                        ].map(item => (
                                            <div key={item.label} className="flex items-center justify-between p-1 sm:p-2 rounded-lg bg-gray-50 dark:bg-white/[0.02] border border-gray-100 dark:border-white/5">
                                                <div className="flex items-center gap-1">
                                                    <div className={`w-1 h-1 sm:w-1.5 sm:h-1.5 rounded-full ${item.color}`}></div>
                                                    <span className="text-[6px] xs:text-[7px] sm:text-[9px] lg:text-[11px] font-bold text-gray-500 dark:text-gray-400 uppercase tracking-tight">{item.label}</span>
                                                </div>
                                                <span className={`text-[7px] sm:text-xs font-black ${item.text}`}>{item.val}</span>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}

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
                                    {academicReport.compensationScheduleDay && (
                                        <span> (สอนชดเชยตารางวัน{DAY_MAP[academicReport.compensationScheduleDay] || academicReport.compensationScheduleDay})</span>
                                    )}
                                </span>
                            </div>

                            <div className="flex-1 overflow-y-auto max-h-[300px] pr-1 custom-scrollbar">
                                {academicReport.todaySchedules.length > 0 ? (
                                    <div className="space-y-4">
                                        {academicReport.todaySchedules.map((s: ScheduleItem, idx: number) => {
                                            const isSubstitute = s.type === 'substitute';
                                            return (
                                            <div key={idx} className={`relative flex items-center gap-1.5 py-1.5 px-2 rounded-md bg-white dark:bg-[#1e1f21] border shadow-sm hover:bg-gray-50 dark:hover:bg-[#252629] transition-all duration-200 group overflow-hidden ${isSubstitute ? 'border-amber-200/80 dark:border-amber-800/40' : 'border-gray-100 dark:border-gray-800/60'}`}>
                                                <div className={`absolute left-0 top-0 bottom-0 w-0.5 opacity-0 group-hover:opacity-100 transition-opacity ${isSubstitute ? 'bg-amber-500' : 'bg-indigo-500'}`}></div>

                                                <div className="w-7 flex flex-col items-center justify-center shrink-0 border-r border-gray-100 dark:border-gray-800/80 pr-1.5">
                                                    <span className="text-[12px] font-black text-gray-800 dark:text-gray-100 leading-none">{s.period.replace('คาบ ', '')}</span>
                                                </div>

                                                <div className="flex-1 min-w-0 flex items-center justify-between gap-1.5">
                                                    <div className="min-w-0 flex-1">
                                                        <div className="flex items-center gap-1">
                                                            <span className="text-[12px] font-bold text-gray-900 dark:text-white truncate" title={s.subject}>{s.subject}</span>
                                                            {s.subjectCode && <span className="text-[8px] font-medium text-gray-400 dark:text-gray-500 truncate">({s.subjectCode})</span>}
                                                            {isSubstitute && (
                                                                <span className="text-[8px] font-black px-1.5 py-0.5 rounded bg-amber-100 dark:bg-amber-900/20 text-amber-700 dark:text-amber-400 border border-amber-200/60 dark:border-amber-800/40">
                                                                    สอนแทน
                                                                </span>
                                                            )}
                                                        </div>
                                                        <div className="flex items-center gap-1.5 mt-0">
                                                            <span className={`text-[8px] font-semibold px-1 py-0 rounded border ${
                                                                s.type === 'club'
                                                                    ? 'text-emerald-600 dark:text-emerald-400 bg-emerald-50/50 dark:bg-emerald-900/10 border-emerald-100/20 dark:border-emerald-800/10'
                                                                    : s.type === 'learnerActivity'
                                                                        ? 'text-teal-600 dark:text-teal-400 bg-teal-50/50 dark:bg-teal-900/10 border-teal-100/20 dark:border-teal-800/10'
                                                                        : s.type === 'homeroom'
                                                                            ? 'text-purple-600 dark:text-purple-400 bg-purple-50/50 dark:bg-purple-900/10 border-purple-100/20 dark:border-purple-800/10'
                                                                            : isSubstitute
                                                                                ? 'text-amber-700 dark:text-amber-400 bg-amber-50/70 dark:bg-amber-900/10 border-amber-100/40 dark:border-amber-800/20'
                                                                                : 'text-blue-600 dark:text-blue-400 bg-blue-50/50 dark:bg-blue-900/10 border-blue-100/20 dark:border-blue-800/10'
                                                            }`}>{s.class}</span>
                                                            {s.room !== '-' && (
                                                                <span className="inline-flex items-center gap-0.5 text-[8px] font-semibold text-emerald-600 dark:text-emerald-400 bg-emerald-50/50 dark:bg-emerald-900/10 px-1 py-0 rounded border border-emerald-100/20 dark:border-emerald-800/10">
                                                                    <MapPin size={8} /> {s.room}
                                                                </span>
                                                            )}
                                                            {(s.startTime || s.endTime) && (
                                                                <span className="text-[8px] font-medium text-gray-500 dark:text-gray-400">{s.startTime || '-'}-{s.endTime || '-'}</span>
                                                            )}
                                                        </div>
                                                        {isSubstitute && (
                                                            <div className="mt-0.5 text-[8px] font-semibold text-gray-500 dark:text-gray-400 truncate">
                                                                สอนแทน: {s.originalTeacherName || 'ไม่ระบุ'}
                                                            </div>
                                                        )}
                                                    </div>

                                                    <button
                                                        onClick={() => {
                                                            if (s.type === 'classroom' || s.type === 'substitute') {
                                                                const courseSchedule = {
                                                                    id: s.id || '',
                                                                    courseId: s.courseId || '',
                                                                    subjectCode: s.subjectCode || '',
                                                                    subjectName: s.subject || '',
                                                                    period: s.isDoublePeriod && s.periods ? s.periods[0] : (Math.floor(Number(s._sortIndex)) || 0),
                                                                    startTime: s.startTime || '',
                                                                    endTime: s.endTime || '',
                                                                    classId: s.classId || '',
                                                                    className: s.className || s.class || '',
                                                                    room: s.room || '',
                                                                    roomIds: s.roomIds || [],
                                                                    groupNumber: s.groupNumber || 1,
                                                                    day: s.day || '',
                                                                    isChecked: false,
                                                                    isSubstitute: s.isSubstitute || false,
                                                                    substitutionId: s.substitutionId || '',
                                                                    originalTeacherId: s.originalTeacherId || '',
                                                                    originalTeacherName: s.originalTeacherName || '',
                                                                    isDoublePeriod: s.isDoublePeriod || false,
                                                                    periods: s.periods || []
                                                                };
                                                                sessionStorage.setItem('attendance_selected_class', JSON.stringify(courseSchedule));
                                                            }
                                                            navigate(s.actionPath || '/academic/classroom-attendance');
                                                        }}
                                                        className={`shrink-0 px-3 py-1 text-white text-[10px] font-bold rounded-md transition-colors shadow-sm flex items-center gap-1.5 ${isSubstitute ? 'bg-amber-600 hover:bg-amber-700 shadow-amber-500/20' : 'bg-indigo-600 hover:bg-indigo-700 shadow-indigo-500/20'}`}
                                                    >
                                                        <CheckCircle size={12} /> {s.actionLabel || 'เช็คชื่อ'}
                                                    </button>
                                                </div>
                                            </div>
                                            );
                                        })}
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
                                        const isPersonal = leave.leaveType === 'ลากิจ';
                                        const isOfficial = leave.leaveType === 'ไปราชการ' || leave.leaveType === 'ไปราชการ/กิจกรรม';

                                        // Determine badge color
                                        let leaveBadgeColor = '';
                                        if (isSick) {
                                            leaveBadgeColor = 'bg-orange-50 text-orange-600 border border-orange-100 dark:bg-orange-900/20 dark:text-orange-400 dark:border-orange-800/30';
                                        } else if (isPersonal) {
                                            leaveBadgeColor = 'bg-cyan-50 text-cyan-600 border border-cyan-100 dark:bg-cyan-900/20 dark:text-cyan-400 dark:border-cyan-800/30';
                                        } else {
                                            leaveBadgeColor = 'bg-blue-50 text-blue-600 border border-blue-100 dark:bg-blue-900/20 dark:text-blue-400 dark:border-blue-800/30';
                                        }

                                        // Build class, room, number display
                                        const classLevelDisplay = CLASSES[String(leave.classLevel || '') as keyof typeof CLASSES] || leave.classLevel || '';
                                        const classDisplay = classLevelDisplay && leave.room ? `${classLevelDisplay}/${leave.room}` : (leave.className || 'ไม่ระบุห้อง');
                                        const numberDisplay = leave.studentNumber ? ` เลขที่ ${leave.studentNumber}` : '';
                                        const idDisplay = leave.studentId ? ` (รหัส: ${leave.studentId})` : '';

                                        return (
                                            <div key={idx} className="flex items-center gap-3 p-3 rounded-2xl bg-gray-50/80 dark:bg-[#1e1f21]/80 border border-transparent hover:border-gray-100 dark:hover:border-gray-700/50 hover:shadow-[0_2px_10px_-3px_rgba(0,0,0,0.05)] dark:hover:shadow-none transition-all duration-300 group">
                                                <div className="relative shrink-0">
                                                    {leave.profileImageUrl ? (
                                                        <ProfileAvatar
                                                            src={leave.profileImageUrl}
                                                            alt={leave.studentName}
                                                            className="w-12 h-12 border-2 border-white dark:border-[#2a2b2f] shadow-sm transform transition-transform group-hover:scale-105"
                                                        />
                                                    ) : (
                                                        <div className={`w-12 h-12 rounded-full flex items-center justify-center shadow-sm border-2 border-white dark:border-[#2a2b2f] transform transition-transform group-hover:scale-105 ${isSick ? 'bg-gradient-to-br from-orange-100 to-orange-200 text-orange-600 dark:from-orange-900/40 dark:to-orange-800/40 dark:text-orange-400' : isPersonal ? 'bg-gradient-to-br from-cyan-100 to-cyan-200 text-cyan-600 dark:from-cyan-900/40 dark:to-cyan-800/40 dark:text-cyan-400' : 'bg-gradient-to-br from-blue-100 to-blue-200 text-blue-600 dark:from-blue-900/40 dark:to-blue-800/40 dark:text-blue-400'}`}>
                                                            <Users size={20} />
                                                        </div>
                                                    )}
                                                    <div className={`absolute bottom-0 right-0 w-3.5 h-3.5 rounded-full border-2 border-white dark:border-[#2a2b2f] shadow-sm ${isSick ? 'bg-orange-500' : isPersonal ? 'bg-cyan-500' : 'bg-blue-500'}`} title={leave.leaveType}></div>
                                                </div>

                                                <div className="flex-1 min-w-0 ml-1">
                                                    <div className="text-sm font-bold text-gray-900 dark:text-white truncate group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition-colors">
                                                        {leave.studentName}
                                                        <span className="text-[10px] text-gray-400 dark:text-gray-500 font-normal ml-1">
                                                            {idDisplay}
                                                        </span>
                                                    </div>
                                                    <div className="text-[11px] text-gray-500 dark:text-gray-400 flex items-center gap-1 mt-0.5 font-medium">
                                                        <span>{classDisplay}{numberDisplay}</span>
                                                        <span className="w-1 h-1 rounded-full bg-gray-300"></span>
                                                        <span>{ds}</span>
                                                    </div>
                                                </div>

                                                <div className="shrink-0 text-right flex flex-col items-end gap-1.5">
                                                    <span className={`text-[10px] px-2.5 py-1 rounded-md font-bold inline-block shadow-sm ${leaveBadgeColor}`}>
                                                        {leave.leaveType}
                                                    </span>
                                                </div>
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
                                    <div className="text-3xl font-black text-gray-800 dark:text-gray-100 drop-shadow-sm leading-none mb-1">{totalTeachers}</div>
                                    <div className="text-[11px] font-bold text-gray-400 uppercase tracking-widest">บุคลากรทั้งหมด (คน)</div>
                                </div>

                                <div className="p-5 rounded-2xl bg-white dark:bg-[#2a2b2f] border border-gray-100 dark:border-gray-800 shadow-[0_2px_10px_-4px_rgba(0,0,0,0.05)] hover:shadow-lg hover:-translate-y-1 hover:border-red-500/30 transition-all duration-300 group flex flex-col justify-center items-center text-center relative overflow-hidden">
                                    <div className="absolute inset-0 bg-red-500/5 opacity-0 group-hover:opacity-100 transition-opacity"></div>
                                    <div className="w-12 h-12 rounded-xl bg-red-50 dark:bg-red-900/20 mb-3 flex items-center justify-center text-red-600 dark:text-red-400 group-hover:scale-110 transition-transform shadow-sm">
                                        <Clock size={24} strokeWidth={2.5} />
                                    </div>
                                    <div className="text-3xl font-black text-gray-800 dark:text-gray-100 drop-shadow-sm leading-none mb-1">{(tLeave + tOfficial) || 0}</div>
                                    <div className="text-[11px] font-bold text-gray-400 uppercase tracking-widest">บุคลากรที่ลาวันนี้ (คน)</div>
                                </div>

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

                                            // Determine Approval Status
                                            const isApproved = leave.status === 'approved' || !!leave.approvedBy;
                                            let approvalBadgeColor = '';
                                            let approvalIcon = null;
                                            let approvalText = '';

                                            if (isApproved) {
                                                approvalBadgeColor = 'text-emerald-600 bg-emerald-50 border-emerald-100 dark:text-emerald-400 dark:bg-emerald-950/40 dark:border-emerald-900/30';
                                                approvalIcon = <CheckCircle size={10} className="mr-1" />;
                                                approvalText = 'อนุมัติแล้ว';
                                            } else {
                                                approvalBadgeColor = 'text-amber-600 bg-amber-50 border-amber-100 dark:text-amber-400 dark:bg-amber-950/40 dark:border-amber-900/30';
                                                approvalIcon = <Clock size={10} className="mr-1" />;
                                                approvalText = 'ยังไม่อนุมัติ';
                                            }

                                            // Determine Substitution Status
                                            const hasSubstitute = leave.status === 'substitution_assigned';

                                            return (
                                                <li key={idx} className="flex items-center space-x-3 pb-3 border-b border-gray-100 dark:border-gray-800/60 last:border-0 last:pb-0 group hover:bg-gray-50/80 dark:hover:bg-[#1e1f21]/80 p-3 rounded-2xl transition-all duration-300 -mx-3 hover:shadow-[0_2px_10px_-3px_rgba(0,0,0,0.05)] dark:hover:shadow-none border border-transparent hover:border-gray-100 dark:hover:border-gray-700/50">
                                                    <div className="relative shrink-0">
                                                        {leave.profileImageUrl ? (
                                                            <ProfileAvatar
                                                                src={leave.profileImageUrl}
                                                                alt={leave.teacherName}
                                                                className="w-12 h-12 border-2 border-white dark:border-[#2a2b2f] shadow-sm transform transition-transform group-hover:scale-105"
                                                            />
                                                        ) : (
                                                            <div className={`w-12 h-12 rounded-full flex items-center justify-center shadow-sm border-2 border-white dark:border-[#2a2b2f] transform transition-transform group-hover:scale-105 ${isSick ? 'bg-gradient-to-br from-orange-100 to-orange-200 text-orange-600 dark:from-orange-900/40 dark:to-orange-800/40 dark:text-orange-400' : isTravel ? 'bg-gradient-to-br from-blue-100 to-blue-200 text-blue-600 dark:from-blue-900/40 dark:to-blue-800/40 dark:text-blue-400' : 'bg-gradient-to-br from-cyan-100 to-cyan-200 text-cyan-600 dark:from-cyan-900/40 dark:to-cyan-800/40 dark:text-cyan-400'}`}>
                                                                {isTravel ? <Briefcase size={20} /> : <Users size={20} />}
                                                            </div>
                                                        )}
                                                        <div className={`absolute bottom-0 right-0 w-3.5 h-3.5 rounded-full border-2 border-white dark:border-[#2a2b2f] shadow-sm ${isSick ? 'bg-orange-500' : isTravel ? 'bg-blue-500' : 'bg-cyan-500'}`} title={leave.leaveType}></div>
                                                    </div>

                                                    <div className="flex-1 min-w-0 ml-1">
                                                        <p className="text-sm font-bold text-gray-900 dark:text-white truncate group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition-colors">{leave.teacherName}</p>
                                                        <div className="flex items-center gap-1.5 mt-0.5">
                                                            <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${isSick ? 'bg-orange-400' : isTravel ? 'bg-blue-400' : 'bg-cyan-400'}`}></span>
                                                            <p className="text-xs text-gray-500 dark:text-gray-400 truncate font-medium">{leave.reason}</p>
                                                        </div>
                                                    </div>

                                                    <div className="shrink-0 text-right flex flex-col items-end gap-1.5">
                                                        <span className={`text-[10px] px-2.5 py-1 rounded-md font-bold inline-block shadow-sm ${isSick ? 'bg-orange-50 text-orange-600 border border-orange-100 dark:bg-orange-900/20 dark:text-orange-400 dark:border-orange-800/30' : isTravel ? 'bg-blue-50 text-blue-600 border border-blue-100 dark:bg-blue-900/20 dark:text-blue-400 dark:border-blue-800/30' : 'bg-cyan-50 text-cyan-600 border border-cyan-100 dark:bg-cyan-900/20 dark:text-cyan-400 dark:border-cyan-800/30'}`}>
                                                            {leave.leaveType}
                                                        </span>
                                                        <div className={`flex items-center px-2 py-0.5 rounded text-[10px] font-bold tracking-wide border ${approvalBadgeColor}`}>
                                                            {approvalIcon} {approvalText}
                                                        </div>
                                                        {hasSubstitute && (
                                                            <div className="flex items-center px-2 py-0.5 rounded text-[10px] font-bold tracking-wide border border-indigo-100 text-indigo-600 bg-indigo-50 dark:text-indigo-400 dark:bg-indigo-950/40 dark:border-indigo-900/30">
                                                                <Check size={10} className="mr-1" /> สอนแทนแล้ว
                                                            </div>
                                                        )}
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
                            {isLoading ? <SkeletonLoader height="380px" className="rounded-xl" /> : <SchoolCalendarEventsList events={calendarEvents} academicYear={calendarState.academicYear} />}
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
