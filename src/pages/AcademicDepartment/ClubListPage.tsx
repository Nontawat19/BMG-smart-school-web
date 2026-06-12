import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import BackButton from "@/components/Shared/BackButton";
import ProfileAvatar from "@/components/Shared/ProfileAvatar";
import { firestore as db } from '../../firebase';
import { collection, getDocs, doc, getDoc, query, orderBy, onSnapshot } from 'firebase/firestore';
import { useSelector, useDispatch } from 'react-redux';
import { RootState } from '@/store';
import MainLayout from "@/layouts/MainLayout";
import { fetchTeachersMap } from '@/store/slices/userMapSlice';
import { usePermissions } from '@/hooks/usePermissions';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Users,
  Search,
  Filter,
  Clock,
  Compass,
  ArrowRight,
  Layers,
  ChevronRight,
  Settings,
  FileText,
  UserCheck,
  Calendar,
  Image as ImageIcon,
  Sparkles,
  Info,
  BookOpen
} from 'lucide-react';
import { formatClassLevelRange } from '@/utils/schoolUtils';

interface Club {
  id: string;
  name: string;
  description: string;
  capacity: number;
  responsibleTeacherIds: string[];
  specialPeriodId?: string;
  specialPeriodTitle?: string;
  specialPeriodDay?: string;
  specialPeriodStartTime?: string;
  specialPeriodEndTime?: string;
  allowedClassLevelFrom?: string;
  allowedClassLevelTo?: string;
  imageUrl?: string;
  memberCount?: number;
  createdAt: any;
}

const formatSpecialPeriodDay = (day?: string) => {
  const labels: Record<string, string> = {
    all: 'ทุกวัน',
    mon: 'วันจันทร์',
    tue: 'วันอังคาร',
    wed: 'วันพุธ',
    thu: 'วันพฤหัสบดี',
    fri: 'วันศุกร์',
    sat: 'วันเสาร์',
    sun: 'วันอาทิตย์',
  };
  return labels[day || 'all'] || day || 'ทุกวัน';
};

const ClubListPage: React.FC = () => {
  const navigate = useNavigate();
  const dispatch = useDispatch();

  const [clubs, setClubs] = useState<Club[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedLevelFilter, setSelectedLevelFilter] = useState('all');
  const [selectedTeacherFilter, setSelectedTeacherFilter] = useState('all');
  const [selectedStatusFilter, setSelectedStatusFilter] = useState('all');

  const [isRegistrationEnabled, setIsRegistrationEnabled] = useState(false);
  const [globalStartDate, setGlobalStartDate] = useState('');
  const [globalEndDate, setGlobalEndDate] = useState('');
  const [allowTransfer, setAllowTransfer] = useState(false);

  const { user: currentUser, hasRole, ACADEMIC_MANAGEMENT } = usePermissions();
  const schoolId = (currentUser as any)?.schoolId;
  const canManage = hasRole(ACADEMIC_MANAGEMENT);

  const { teachers: teacherMap, status: teacherMapStatus } = useSelector((state: RootState) => state.userMap);

  useEffect(() => {
    if (schoolId && teacherMapStatus === 'idle') {
      dispatch(fetchTeachersMap(schoolId) as any);
    }
  }, [schoolId, teacherMapStatus, dispatch]);

  useEffect(() => {
    if (!schoolId) return;

    // Fetch club settings
    const fetchSettings = async () => {
      try {
        const configRef = doc(db, 'school-settings', schoolId, 'configs', 'club_settings');
        const configSnap = await getDoc(configRef);
        if (configSnap.exists()) {
          const data = configSnap.data();
          setIsRegistrationEnabled(data.registrationEnabled ?? false);
          setGlobalStartDate(data.registrationStartDate || '');
          setGlobalEndDate(data.registrationEndDate || '');
          setAllowTransfer(data.allowTransfer || false);
        } else {
          setIsRegistrationEnabled(false);
        }
      } catch (error) {
        console.error("Error fetching club settings:", error);
      }
    };

    fetchSettings();

    // Setup snapshot listener for clubs
    const clubsCollection = collection(db, 'school-settings', schoolId, 'clubs');
    const q = query(clubsCollection, orderBy('name'));

    const unsubscribe = onSnapshot(q, async (snap) => {
      try {
        const clubsData = await Promise.all(snap.docs.map(async (doc) => {
          const club = { id: doc.id, ...doc.data() } as Club;
          // Fetch members count
          const membersCollection = collection(db, 'school-settings', schoolId, 'clubs', doc.id, 'members');
          const membersSnap = await getDocs(membersCollection);
          return { ...club, memberCount: membersSnap.size };
        }));
        setClubs(clubsData);
      } catch (error) {
        console.error("Error updates on clubs snapshot:", error);
      } finally {
        setLoading(false);
      }
    }, (error) => {
      console.error("Error in clubs snapshot listener:", error);
      setLoading(false);
    });

    return () => unsubscribe();
  }, [schoolId]);

  const getClubStatus = (club: Club): { text: string; color: string; bg: string; dot: string } => {
    const isFull = (club.memberCount || 0) >= (club.capacity || 40);
    if (isFull) {
      return { text: 'เต็มแล้ว', color: 'text-rose-600 dark:text-rose-400', bg: 'bg-rose-50 dark:bg-rose-950/20 border border-rose-100 dark:border-rose-900/30', dot: 'bg-rose-500' };
    }

    if (!isRegistrationEnabled) {
      return { text: 'ปิดรับสมัคร', color: 'text-slate-600 dark:text-slate-400', bg: 'bg-slate-50 dark:bg-slate-900/30 border border-slate-200 dark:border-slate-800', dot: 'bg-slate-500' };
    }

    const now = new Date();
    const todayOnly = new Date(now); todayOnly.setHours(0, 0, 0, 0);

    if (globalStartDate && globalEndDate) {
      const start = new Date(globalStartDate + 'T00:00:00');
      const end = new Date(globalEndDate + 'T23:59:59');
      if (todayOnly < start) {
        return { text: 'ยังไม่เปิด', color: 'text-amber-600 dark:text-amber-400', bg: 'bg-amber-50 dark:bg-amber-950/20 border border-amber-100 dark:border-amber-900/30', dot: 'bg-amber-500' };
      }
      if (now > end) {
        return { text: 'ปิดรับสมัคร', color: 'text-slate-600 dark:text-slate-400', bg: 'bg-slate-50 dark:bg-slate-900/30 border border-slate-200 dark:border-slate-800', dot: 'bg-slate-500' };
      }
    }

    return { text: 'เปิดรับสมัคร', color: 'text-emerald-600 dark:text-emerald-400', bg: 'bg-emerald-50 dark:bg-emerald-950/20 border border-emerald-100 dark:border-emerald-900/30', dot: 'bg-emerald-500 animate-pulse' };
  };

  const teachersList = useMemo(() => {
    if (!teacherMap) return [];
    return Object.values(teacherMap).sort((a: any, b: any) => {
      const nameA = a.name || `${a.title || ''}${a.firstName || ''} ${a.lastName || ''}`.trim();
      const nameB = b.name || `${b.title || ''}${b.firstName || ''} ${b.lastName || ''}`.trim();
      return nameA.localeCompare(nameB, 'th');
    });
  }, [teacherMap]);

  // Statistics calculations
  const stats = useMemo(() => {
    const totalClubs = clubs.length;
    const totalCapacity = clubs.reduce((acc, club) => acc + (club.capacity || 0), 0);
    const totalMembers = clubs.reduce((acc, club) => acc + (club.memberCount || 0), 0);
    const remainingSeats = Math.max(0, totalCapacity - totalMembers);
    const openClubs = clubs.filter(club => {
      const status = getClubStatus(club);
      return status.text === 'เปิดรับสมัคร';
    }).length;

    return { totalClubs, totalCapacity, totalMembers, remainingSeats, openClubs };
  }, [clubs, globalStartDate, globalEndDate]);

  // Filter logic
  const filteredClubs = useMemo(() => {
    return clubs.filter(club => {
      // 1. Search term match
      const matchesSearch = club.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                            (club.description || '').toLowerCase().includes(searchTerm.toLowerCase());

      // 2. Class Level filter
      let matchesLevel = true;
      if (selectedLevelFilter !== 'all') {
        const from = club.allowedClassLevelFrom || '';
        const to = club.allowedClassLevelTo || '';
        
        if (selectedLevelFilter === 'junior') {
          // Check if any allow levels fall in ม.1 - ม.3
          matchesLevel = ['ม.1', 'ม.2', 'ม.3'].some(lvl => {
            if (!from && !to) return true;
            return lvl >= from && lvl <= to;
          });
        } else if (selectedLevelFilter === 'senior') {
          // Check if any allow levels fall in ม.4 - ม.6
          matchesLevel = ['ม.4', 'ม.5', 'ม.6'].some(lvl => {
            if (!from && !to) return true;
            return lvl >= from && lvl <= to;
          });
        } else {
          // Specific level (e.g. "ม.1")
          if (from || to) {
            matchesLevel = selectedLevelFilter >= from && selectedLevelFilter <= to;
          }
        }
      }

      // 3. Teacher filter
      const matchesTeacher = selectedTeacherFilter === 'all' || 
                             (club.responsibleTeacherIds || []).includes(selectedTeacherFilter);

      // 4. Status filter
      let matchesStatus = true;
      if (selectedStatusFilter !== 'all') {
        const status = getClubStatus(club);
        if (selectedStatusFilter === 'open') {
          matchesStatus = status.text === 'เปิดรับสมัคร';
        } else if (selectedStatusFilter === 'closed') {
          matchesStatus = status.text === 'ปิดรับสมัคร';
        } else if (selectedStatusFilter === 'full') {
          matchesStatus = status.text === 'เต็มแล้ว';
        }
      }

      return matchesSearch && matchesLevel && matchesTeacher && matchesStatus;
    });
  }, [clubs, searchTerm, selectedLevelFilter, selectedTeacherFilter, selectedStatusFilter, globalStartDate, globalEndDate]);

  // Premium aesthetic gradients for cards matching user's mockup image
  const getGradientByCode = (id: string) => {
    const gradients = [
      'from-[#fcf0e4] to-[#f5dbc2] dark:from-[#3a2c1d] dark:to-[#1a1b22]',
      'from-[#e6f4ea] to-[#c2e7cd] dark:from-[#1b3422] dark:to-[#1a1b22]',
      'from-[#e8f0fe] to-[#d2e3fc] dark:from-[#1c2d42] dark:to-[#1a1b22]',
      'from-[#f3e8ff] to-[#e9d5ff] dark:from-[#2e1d3e] dark:to-[#1a1b22]',
      'from-[#ffe4e6] to-[#fecdd3] dark:from-[#3e1b24] dark:to-[#1a1b22]',
      'from-[#e0f7fa] to-[#b2ebf2] dark:from-[#153438] dark:to-[#1a1b22]'
    ];
    let sum = 0;
    for (let i = 0; i < id.length; i++) sum += id.charCodeAt(i);
    return gradients[sum % gradients.length];
  };

  const getAccentColor = (id: string) => {
    const colors = [
      'text-amber-600 bg-amber-100/90 border-amber-200/50 dark:text-amber-400 dark:bg-amber-950/40 dark:border-amber-900/30',
      'text-emerald-600 bg-emerald-100/90 border-emerald-200/50 dark:text-emerald-400 dark:bg-emerald-950/40 dark:border-emerald-900/30',
      'text-blue-600 bg-blue-100/90 border-blue-200/50 dark:text-blue-400 dark:bg-blue-950/40 dark:border-blue-900/30',
      'text-purple-600 bg-purple-100/90 border-purple-200/50 dark:text-purple-400 dark:bg-purple-950/40 dark:border-purple-900/30',
      'text-rose-600 bg-rose-100/90 border-rose-200/50 dark:text-rose-400 dark:bg-rose-950/40 dark:border-rose-900/30',
      'text-sky-600 bg-sky-100/90 border-sky-200/50 dark:text-sky-400 dark:bg-sky-950/40 dark:border-sky-900/30'
    ];
    let sum = 0;
    for (let i = 0; i < id.length; i++) sum += id.charCodeAt(i);
    return colors[sum % colors.length];
  };

  const getCategoryIcon = (id: string) => {
    const icons = [Users, Layers, Sparkles, Compass, BookOpen, Clock];
    let sum = 0;
    for (let i = 0; i < id.length; i++) sum += id.charCodeAt(i);
    const IconComponent = icons[sum % icons.length];
    return <IconComponent size={24} className="opacity-90" />;
  };

  return (
    <MainLayout>
      <div className="p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto text-gray-900 dark:text-white transition-colors duration-300">
        
        {/* Header Section */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 mb-8">
          <div className="flex items-center gap-4">
            <BackButton to="/academic/hub/activities" />
            <div>
              <h1 className="text-3xl font-black tracking-tight flex items-center gap-3">
                <Compass className="text-indigo-500 animate-spin-slow" size={32} />
                ทำเนียบกิจกรรมชุมนุม
              </h1>
              <p className="text-xs sm:text-sm text-gray-500 dark:text-gray-400 mt-1 font-medium flex items-center gap-1.5">
                <Info size={14} className="text-gray-400" />
                รายชื่อข้อมูลชุมนุม สถิติ และการลงทะเบียนเรียนกิจกรรมชุมนุมทั้งหมดในโรงเรียน
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            {canManage && (
              <>
                <Link
                  to="/academic/club-management"
                  className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 active:scale-95 text-white px-4 py-2.5 rounded-2xl font-bold text-xs sm:text-sm transition-all shadow-lg shadow-indigo-500/20 dark:shadow-none"
                >
                  <Settings size={16} />
                  จัดการชุมนุม
                </Link>
                <Link
                  to="/academic/club-members"
                  className="flex items-center gap-2 bg-violet-600 hover:bg-violet-700 active:scale-95 text-white px-4 py-2.5 rounded-2xl font-bold text-xs sm:text-sm transition-all shadow-lg shadow-violet-500/20 dark:shadow-none"
                >
                  <UserCheck size={16} />
                  จัดการสมาชิก
                </Link>
                <Link
                  to="/academic/club-reports"
                  className="flex items-center gap-2 bg-sky-600 hover:bg-sky-700 active:scale-95 text-white px-4 py-2.5 rounded-2xl font-bold text-xs sm:text-sm transition-all shadow-lg shadow-sky-500/20 dark:shadow-none"
                >
                  <FileText size={16} />
                  รายงานชุมนุม
                </Link>
              </>
            )}
          </div>
        </div>

        {/* Global Registration Dates Banner */}
        {globalStartDate && globalEndDate && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            className="mb-8 p-4 bg-gradient-to-r from-indigo-50 to-sky-50 dark:from-indigo-950/20 dark:to-sky-950/20 border border-indigo-100/50 dark:border-indigo-900/30 rounded-2xl flex flex-col sm:flex-row sm:items-center justify-between gap-4"
          >
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-indigo-100 dark:bg-indigo-500/10 flex items-center justify-center text-indigo-600 dark:text-indigo-400">
                <Calendar size={20} />
              </div>
              <div>
                <h4 className="text-sm font-black text-indigo-950 dark:text-indigo-200">ช่วงเวลาสมัครลงทะเบียนกิจกรรมชุมนุม</h4>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                  ระบบจะเปิดให้นักเรียนเลือกลงทะเบียนชุมนุมตามช่วงเวลาที่กำหนดนี้เท่านั้น
                </p>
              </div>
            </div>
            <div className="flex items-center gap-3 text-xs sm:text-sm font-bold text-indigo-700 dark:text-indigo-300 bg-white dark:bg-[#1a1b22] px-4 py-2 rounded-xl border border-indigo-100/50 dark:border-indigo-900/30 shadow-sm">
              <span>{new Date(globalStartDate).toLocaleDateString('th-TH', { day: 'numeric', month: 'long', year: 'numeric' })}</span>
              <ArrowRight size={14} className="text-indigo-400" />
              <span>{new Date(globalEndDate).toLocaleDateString('th-TH', { day: 'numeric', month: 'long', year: 'numeric' })}</span>
            </div>
          </motion.div>
        )}

        {/* Statistics Cards Dashboard */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6 mb-8">
          {[
            {
              title: 'ชุมนุมทั้งหมด',
              value: stats.totalClubs,
              unit: 'ชุมนุม',
              desc: `เปิดรับสมัครอยู่ ${stats.openClubs} ชุมนุม`,
              icon: <Compass size={22} className="text-indigo-500" />,
              bg: 'from-indigo-500/5 to-indigo-500/0',
              border: 'hover:border-indigo-500/30'
            },
            {
              title: 'สมาชิกลงทะเบียนแล้ว',
              value: stats.totalMembers,
              unit: 'คน',
              desc: `ความจุทั้งหมด ${stats.totalCapacity} ที่นั่ง`,
              icon: <Users size={22} className="text-violet-500" />,
              bg: 'from-violet-500/5 to-violet-500/0',
              border: 'hover:border-violet-500/30'
            },
            {
              title: 'ที่นั่งว่างคงเหลือ',
              value: stats.remainingSeats,
              unit: 'ที่นั่ง',
              desc: `คิดเป็น ${stats.totalCapacity > 0 ? Math.round((stats.remainingSeats / stats.totalCapacity) * 100) : 0}% ของความจุ`,
              icon: <Sparkles size={22} className="text-emerald-500" />,
              bg: 'from-emerald-500/5 to-emerald-500/0',
              border: 'hover:border-emerald-500/30'
            },
            {
              title: 'อัตราการเข้าร่วม',
              value: stats.totalCapacity > 0 ? Math.round((stats.totalMembers / stats.totalCapacity) * 100) : 0,
              unit: '%',
              desc: allowTransfer ? 'อนุญาตให้นักเรียนย้ายชุมนุม' : 'ปิดการย้ายชุมนุมชั่วคราว',
              icon: <Layers size={22} className="text-sky-500" />,
              bg: 'from-sky-500/5 to-sky-500/0',
              border: 'hover:border-sky-500/30'
            }
          ].map((card, idx) => (
            <motion.div
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: idx * 0.05 }}
              key={idx}
              className={`bg-white dark:bg-[#1a1b22] border border-gray-100 dark:border-gray-800 rounded-3xl p-5 shadow-sm hover:shadow-md transition-all duration-300 relative overflow-hidden flex flex-col justify-between group ${card.border}`}
            >
              <div className={`absolute top-0 right-0 w-32 h-32 bg-gradient-to-b ${card.bg} rounded-bl-full -mr-8 -mt-8 -z-0 transition-all duration-300 group-hover:scale-110`} />
              
              <div className="relative z-10">
                <div className="flex items-center justify-between mb-4">
                  <span className="text-xs sm:text-sm font-bold text-gray-400 uppercase tracking-wider">{card.title}</span>
                  <div className="w-9 h-9 rounded-xl bg-gray-50 dark:bg-gray-800/50 flex items-center justify-center shadow-inner">
                    {card.icon}
                  </div>
                </div>
                
                <div className="flex items-baseline gap-1.5">
                  <span className="text-2xl sm:text-3xl font-black tracking-tight tabular-nums">{card.value}</span>
                  <span className="text-xs sm:text-sm font-extrabold text-gray-400">{card.unit}</span>
                </div>
              </div>
              
              <div className="relative z-10 border-t border-gray-50 dark:border-gray-800/40 mt-4 pt-3 text-[10px] sm:text-xs font-bold text-gray-500 dark:text-gray-400 line-clamp-1">
                {card.desc}
              </div>
            </motion.div>
          ))}
        </div>

        {/* Filter Controls Row */}
        <div className="bg-white dark:bg-[#1a1b22] rounded-3xl p-5 border border-gray-100 dark:border-gray-800 shadow-sm mb-8">
          <div className="flex items-center gap-2 mb-4 border-b border-gray-50 dark:border-gray-800 pb-3">
            <Filter size={16} className="text-indigo-500" />
            <h3 className="text-sm font-black text-gray-500 dark:text-gray-400">ตัวกรองและการค้นหาข้อมูล</h3>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            
            {/* Search Input */}
            <div className="relative">
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400" size={16} />
              <input
                type="text"
                placeholder="ค้นหาชื่อ หรือรายละเอียดชุมนุม..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-10 pr-4 py-2.5 bg-gray-50 dark:bg-gray-800/30 border border-gray-100 dark:border-gray-800 rounded-2xl focus:ring-2 focus:ring-indigo-500/50 outline-none transition-all text-xs sm:text-sm font-semibold"
              />
            </div>

            {/* Allowed Class Filter */}
            <div className="relative">
              <select
                value={selectedLevelFilter}
                onChange={(e) => setSelectedLevelFilter(e.target.value)}
                className="w-full px-4 py-2.5 bg-gray-50 dark:bg-gray-800/30 border border-gray-100 dark:border-gray-800 rounded-2xl focus:ring-2 focus:ring-indigo-500/50 outline-none transition-all text-xs sm:text-sm font-semibold text-gray-600 dark:text-gray-300 appearance-none cursor-pointer"
              >
                <option value="all">ระดับชั้นที่รับสมัคร: ทั้งหมด</option>
                <option value="junior">เฉพาะระดับ มัธยมศึกษาตอนต้น</option>
                <option value="senior">เฉพาะระดับ มัธยมศึกษาตอนปลาย</option>
                <option disabled className="text-gray-400">--- รายระดับชั้น ---</option>
                <option value="ม.1">มัธยมศึกษาปีที่ 1</option>
                <option value="ม.2">มัธยมศึกษาปีที่ 2</option>
                <option value="ม.3">มัธยมศึกษาปีที่ 3</option>
                <option value="ม.4">มัธยมศึกษาปีที่ 4</option>
                <option value="ม.5">มัธยมศึกษาปีที่ 5</option>
                <option value="ม.6">มัธยมศึกษาปีที่ 6</option>
              </select>
              <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-4 text-gray-400">
                <ChevronRight size={14} className="rotate-90" />
              </div>
            </div>

            {/* Responsible Teacher Filter */}
            <div className="relative">
              <select
                value={selectedTeacherFilter}
                onChange={(e) => setSelectedTeacherFilter(e.target.value)}
                className="w-full px-4 py-2.5 bg-gray-50 dark:bg-gray-800/30 border border-gray-100 dark:border-gray-800 rounded-2xl focus:ring-2 focus:ring-indigo-500/50 outline-none transition-all text-xs sm:text-sm font-semibold text-gray-600 dark:text-gray-300 appearance-none cursor-pointer"
              >
                <option value="all">ครูผู้ดูแลชุมนุม: ทั้งหมด</option>
                {teachersList.map((teacher: any) => {
                  const teacherName = teacher.name || `${teacher.title || ''}${teacher.firstName || ''} ${teacher.lastName || ''}`.trim();
                  return (
                    <option key={teacher.id} value={teacher.id}>{teacherName}</option>
                  );
                })}
              </select>
              <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-4 text-gray-400">
                <ChevronRight size={14} className="rotate-90" />
              </div>
            </div>

            {/* Registration Status Filter */}
            <div className="relative">
              <select
                value={selectedStatusFilter}
                onChange={(e) => setSelectedStatusFilter(e.target.value)}
                className="w-full px-4 py-2.5 bg-gray-50 dark:bg-gray-800/30 border border-gray-100 dark:border-gray-800 rounded-2xl focus:ring-2 focus:ring-indigo-500/50 outline-none transition-all text-xs sm:text-sm font-semibold text-gray-600 dark:text-gray-300 appearance-none cursor-pointer"
              >
                <option value="all">สถานะลงทะเบียน: ทั้งหมด</option>
                <option value="open">เปิดรับสมัคร (มีที่ว่าง)</option>
                <option value="full">เต็มแล้ว (ความจุเต็ม)</option>
                <option value="closed">ปิดรับสมัคร</option>
              </select>
              <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-4 text-gray-400">
                <ChevronRight size={14} className="rotate-90" />
              </div>
            </div>

          </div>
        </div>

        {/* Club Grid Section */}
        {loading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {[...Array(6)].map((_, idx) => (
              <div key={idx} className="bg-white dark:bg-[#1a1b22] border border-gray-100 dark:border-gray-800 rounded-3xl p-6 h-72 animate-pulse flex flex-col justify-between">
                <div className="flex items-center gap-4">
                  <div className="w-14 h-14 rounded-2xl bg-gray-200 dark:bg-gray-800" />
                  <div className="flex-1 space-y-2">
                    <div className="h-4 bg-gray-200 dark:bg-gray-800 rounded-md w-2/3" />
                    <div className="h-3 bg-gray-200 dark:bg-gray-800 rounded-md w-1/2" />
                  </div>
                </div>
                <div className="space-y-2">
                  <div className="h-2 bg-gray-200 dark:bg-gray-800 rounded-full" />
                  <div className="h-3 bg-gray-200 dark:bg-gray-800 rounded-md w-1/4" />
                </div>
                <div className="h-10 bg-gray-200 dark:bg-gray-800 rounded-xl" />
              </div>
            ))}
          </div>
        ) : filteredClubs.length === 0 ? (
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="bg-white dark:bg-[#1a1b22] border border-dashed border-gray-200 dark:border-gray-800 rounded-3xl p-16 text-center shadow-sm"
          >
            <Compass className="mx-auto text-gray-300 dark:text-gray-700 mb-4 animate-bounce-slow" size={64} />
            <h3 className="text-lg font-black text-gray-700 dark:text-gray-300">ไม่พบรายชื่อกิจกรรมชุมนุม</h3>
            <p className="text-gray-400 text-xs sm:text-sm mt-1 max-w-sm mx-auto font-medium">
              ไม่พบข้อมูลชุมนุมตามที่ค้นหาหรือไม่มีข้อมูลการกรอง ลองปรับปรุงเงื่อนไขตัวกรองของคุณหรือล้างการค้นหา
            </p>
            <button
              onClick={() => {
                setSearchTerm('');
                setSelectedLevelFilter('all');
                setSelectedTeacherFilter('all');
                setSelectedStatusFilter('all');
              }}
              className="mt-5 bg-indigo-50 hover:bg-indigo-100 dark:bg-indigo-500/10 dark:hover:bg-indigo-500/20 text-indigo-600 dark:text-indigo-400 px-5 py-2 rounded-2xl font-bold text-xs transition-all active:scale-95"
            >
              ล้างค่าตัวกรองทั้งหมด
            </button>
          </motion.div>
        ) : (
          <motion.div
            layout
            className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6"
          >
            <AnimatePresence mode="popLayout">
              {filteredClubs.map((club, idx) => {
                const status = getClubStatus(club);
                const percent = Math.min(100, Math.round(((club.memberCount || 0) / (club.capacity || 40)) * 100));
                
                // Dynamic colors for progress bar based on capacity level
                let progressColor = 'bg-gradient-to-r from-blue-500 to-indigo-500';
                if (percent >= 100) {
                  progressColor = 'bg-gradient-to-r from-rose-500 to-red-500';
                } else if (percent >= 85) {
                  progressColor = 'bg-gradient-to-r from-amber-500 to-orange-500';
                } else if (percent >= 50) {
                  progressColor = 'bg-gradient-to-r from-emerald-500 to-teal-500';
                }

                return (
                  <motion.div
                    layout
                    initial={{ opacity: 0, scale: 0.9, y: 20 }}
                    animate={{ opacity: 1, scale: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.9, y: 20 }}
                    transition={{ duration: 0.35, delay: idx * 0.02 }}
                    key={club.id}
                    onClick={() => navigate(`/academic/club-list/${club.id}`)}
                    className="bg-white dark:bg-[#1a1b22] border border-gray-100 dark:border-gray-800/80 rounded-[32px] shadow-sm hover:shadow-xl hover:-translate-y-2 transition-all duration-300 flex flex-col justify-between overflow-hidden group relative cursor-pointer active:scale-[0.99] select-none"
                  >
                    {/* Cover Header and category graphics matching mockup */}
                    <div className="relative h-28 overflow-hidden bg-gray-50 dark:bg-gray-850/50 flex-shrink-0 flex items-center justify-center">
                      <div className={`absolute inset-0 bg-gradient-to-b ${getGradientByCode(club.id)} transition-all duration-300 group-hover:scale-105`} />
                      
                      {/* Floating Category Badge (Top-Left) */}
                      <div className="absolute top-4 left-4 z-10">
                        <span className="px-3 py-1 bg-white/95 dark:bg-[#1a1b22]/95 border border-white/20 shadow-sm rounded-full text-[10px] font-black text-gray-700 dark:text-indigo-300">
                          {formatClassLevelRange(club.allowedClassLevelFrom, club.allowedClassLevelTo) || 'ทุกระดับชั้น'}
                        </span>
                      </div>

                      {/* Floating Registration Status Badge (Top-Right) */}
                      <div className="absolute top-4 right-4 z-10">
                        <span className={`px-3 py-1 text-[10px] font-black rounded-full backdrop-blur-md flex items-center gap-1.5 shadow-sm ${status.bg} ${status.color}`}>
                          <span className={`w-1.5 h-1.5 rounded-full ${status.dot}`} />
                          {status.text}
                        </span>
                      </div>

                      {/* Center Floating Custom Icon Container */}
                      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-10">
                        <div className={`w-14 h-14 rounded-2xl flex items-center justify-center shadow-md relative z-10 border transition-all duration-300 group-hover:scale-110 ${getAccentColor(club.id)}`}>
                          {getCategoryIcon(club.id)}
                        </div>
                      </div>
                    </div>

                    {/* Content Body */}
                    <div className="p-6 pt-5 flex-1 flex flex-col justify-between">
                      <div>
                        {/* Club Title - Highlighted on hover with dynamic accent */}
                        <h3 className="font-extrabold text-gray-900 dark:text-white group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition-colors text-base line-clamp-1 mb-1">
                          {club.name}
                        </h3>
                        {/* Club Description - Left-aligned */}
                        <p className="text-[11px] sm:text-xs text-gray-400 dark:text-gray-400 line-clamp-2 leading-relaxed font-semibold mb-5 h-8">
                          {club.description || `กิจกรรมชุมนุม ${club.name}`}
                        </p>
                      </div>

                      <div className="space-y-4">
                        {/* Members Capacity Section */}
                        <div>
                          <div className="flex items-center justify-between text-[11px] font-black text-gray-500 dark:text-gray-400 mb-1.5">
                            <span className="flex items-center gap-1">
                              <Users size={12} className="text-gray-400" />
                              จำนวนสมาชิกร่วมชุมนุม
                            </span>
                            <span className="tabular-nums font-black text-gray-700 dark:text-gray-200">
                              {club.memberCount || 0} / {club.capacity || 40} คน ({percent}%)
                            </span>
                          </div>
                          {/* Sleek Dynamic Progress Bar */}
                          <div className="w-full h-1.5 bg-gray-50 dark:bg-gray-800 rounded-full overflow-hidden shadow-inner flex border border-gray-100/30 dark:border-gray-800">
                            <motion.div 
                              initial={{ width: 0 }}
                              animate={{ width: `${percent}%` }}
                              transition={{ duration: 0.5, delay: idx * 0.05 }}
                              className={`h-full rounded-full transition-all duration-300 ${progressColor}`}
                            />
                          </div>
                        </div>

                        {/* Learning Time Period Pill (Full Width) */}
                        <div className="flex items-center justify-center gap-2 text-xs font-bold text-indigo-600 dark:text-indigo-300 bg-indigo-50/60 dark:bg-indigo-950/20 border border-indigo-100/50 dark:border-indigo-900/30 px-3 py-2.5 rounded-full w-full">
                          <Clock size={14} className="text-indigo-500" />
                          <span className="truncate">
                            {club.specialPeriodTitle
                              ? `ชุมนุม (${formatSpecialPeriodDay(club.specialPeriodDay)} ${club.specialPeriodStartTime || ''} - ${club.specialPeriodEndTime || ''})`
                              : 'ชุมนุม (ยังไม่กำหนดช่วงคาบเรียน)'}
                          </span>
                        </div>

                        {/* Subtle Footer for Responsible Teacher and arrow */}
                        <div className="border-t border-gray-50 dark:border-gray-850/40 pt-4 flex items-center justify-between">
                          <div className="flex items-center gap-1.5 min-w-0">
                            <span className="text-[11px] font-black text-gray-400 dark:text-gray-500 uppercase tracking-wider flex-shrink-0">
                              ครูผู้ดูแล:
                            </span>
                            <span className="text-[11px] font-bold text-gray-650 dark:text-gray-300 truncate">
                              {(club.responsibleTeacherIds || []).length > 0 ? (
                                <>
                                  {teacherMap?.[club.responsibleTeacherIds[0]]?.name || 'ครูผู้ดูแล'}
                                  {(club.responsibleTeacherIds || []).length > 1 && ` (+${club.responsibleTeacherIds.length - 1})`}
                                </>
                              ) : (
                                <span className="italic text-gray-400 text-[10px]">ยังไม่ระบุครูผู้ดูแล</span>
                              )}
                            </span>
                          </div>
                          
                          {/* Tiny subtle indicator arrow */}
                          <div className="w-7 h-7 rounded-full bg-gray-50 dark:bg-gray-800 flex items-center justify-center text-gray-400 group-hover:bg-indigo-50 group-hover:text-indigo-600 dark:group-hover:bg-indigo-500/10 dark:group-hover:text-indigo-400 transition-all">
                            <ChevronRight size={14} className="group-hover:translate-x-0.5 transition-transform" />
                          </div>
                        </div>
                      </div>
                    </div>
                  </motion.div>
                );
              })}
            </AnimatePresence>
          </motion.div>
        )}

      </div>
    </MainLayout>
  );
};

export default ClubListPage;
