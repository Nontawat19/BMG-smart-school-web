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
      <div className="p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto">

        {/* ===== HEADER ===== */}
        <div className="bg-white dark:bg-[#2a2b2f] rounded-2xl p-4 sm:p-5 mb-4">
          {/* Title row */}
          <div className="flex items-center justify-between gap-4 mb-4">
            <div className="flex items-center gap-3 min-w-0">
              <BackButton to="/academic/hub/activities" />
              <div className="w-10 h-10 bg-indigo-600 rounded-xl flex items-center justify-center flex-shrink-0">
                <Compass size={18} className="text-white" />
              </div>
              <div className="min-w-0">
                <h1 className="text-lg sm:text-xl font-black text-gray-900 dark:text-white tracking-tight leading-tight">ทำเนียบกิจกรรมชุมนุม</h1>
                <p className="text-gray-500 dark:text-gray-400 text-[11px] font-medium hidden sm:block truncate">รายชื่อชุมนุม สถิติ และการลงทะเบียนกิจกรรมชุมนุมทั้งหมดในโรงเรียน</p>
              </div>
            </div>
            {canManage && (
              <div className="flex gap-2 flex-shrink-0">
                <Link to="/academic/club-management" className="flex items-center gap-1.5 bg-indigo-600 hover:bg-indigo-700 text-white px-3 py-2 rounded-xl font-bold text-xs transition-all active:scale-95 whitespace-nowrap">
                  <Settings size={13} />จัดการชุมนุม
                </Link>
                <Link to="/academic/club-members" className="flex items-center gap-1.5 bg-violet-600 hover:bg-violet-700 text-white px-3 py-2 rounded-xl font-bold text-xs transition-all active:scale-95 whitespace-nowrap">
                  <UserCheck size={13} />จัดการสมาชิก
                </Link>
                <Link to="/academic/club-reports" className="flex items-center gap-1.5 bg-sky-600 hover:bg-sky-700 text-white px-3 py-2 rounded-xl font-bold text-xs transition-all active:scale-95 whitespace-nowrap">
                  <FileText size={13} />รายงานชุมนุม
                </Link>
              </div>
            )}
          </div>

          {/* Stats strip */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {[
              { label: 'ชุมนุมทั้งหมด', value: stats.totalClubs, unit: 'ชุมนุม', sub: `เปิดรับสมัคร ${stats.openClubs} ชุมนุม`, icon: <Compass size={15} className="text-white" />, badge: 'bg-indigo-600' },
              { label: 'สมาชิกลงทะเบียน', value: stats.totalMembers, unit: 'คน', sub: `ความจุ ${stats.totalCapacity} ที่นั่ง`, icon: <Users size={15} className="text-white" />, badge: 'bg-sky-600' },
              { label: 'ที่นั่งว่างเหลือ', value: stats.remainingSeats, unit: 'ที่นั่ง', sub: `${stats.totalCapacity > 0 ? Math.round((stats.remainingSeats / stats.totalCapacity) * 100) : 0}% ของความจุ`, icon: <Sparkles size={15} className="text-white" />, badge: 'bg-emerald-600' },
              { label: 'อัตราเข้าร่วม', value: stats.totalCapacity > 0 ? Math.round((stats.totalMembers / stats.totalCapacity) * 100) : 0, unit: '%', sub: allowTransfer ? 'อนุญาตให้ย้ายชุมนุม' : 'ปิดการย้ายชุมนุม', icon: <Layers size={15} className="text-white" />, badge: 'bg-violet-600' },
            ].map((s, i) => (
              <div key={i} className="bg-gray-50 dark:bg-white/5 rounded-xl px-3 py-2.5 flex items-center gap-3">
                <div className={`w-8 h-8 ${s.badge} rounded-lg flex items-center justify-center flex-shrink-0`}>{s.icon}</div>
                <div className="min-w-0">
                  <div className="flex items-baseline gap-1 leading-none">
                    <span className="text-xl font-black tabular-nums text-gray-900 dark:text-white">{s.value}</span>
                    <span className="text-[10px] font-bold text-gray-500 dark:text-gray-400">{s.unit}</span>
                  </div>
                  <p className="text-gray-500 dark:text-gray-400 text-[10px] font-medium truncate mt-0.5">{s.label} · {s.sub}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* ===== REGISTRATION BANNER (compact single row) ===== */}
        {globalStartDate && globalEndDate && (
          <motion.div
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            className="mb-3 flex items-center justify-between gap-3 bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-700/40 rounded-xl px-3.5 py-2.5"
          >
            <div className="flex items-center gap-2.5">
              <Calendar size={15} className="text-amber-500 dark:text-amber-400 flex-shrink-0" />
              <p className="text-xs font-bold text-amber-800 dark:text-amber-200">ช่วงเวลาลงทะเบียนชุมนุม</p>
            </div>
            <div className="flex items-center gap-1.5 text-xs font-bold text-amber-700 dark:text-amber-300 whitespace-nowrap">
              <span>{new Date(globalStartDate).toLocaleDateString('th-TH', { day: 'numeric', month: 'short' })}</span>
              <ArrowRight size={12} className="text-amber-400" />
              <span>{new Date(globalEndDate).toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: 'numeric' })}</span>
            </div>
          </motion.div>
        )}

        {/* ===== FILTER BAR ===== */}
        <div className="bg-white dark:bg-[#2a2b2f]/70 backdrop-blur-sm rounded-xl px-3 py-2.5 border border-gray-200/60 dark:border-white/5 mb-4 flex flex-col sm:flex-row gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={14} />
            <input
              type="text"
              placeholder="ค้นหาชุมนุม..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-9 pr-3 py-2 bg-gray-50 dark:bg-white/5 border border-gray-200 dark:border-white/8 rounded-lg focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-400 dark:focus:border-indigo-500/40 outline-none text-sm font-medium text-gray-800 dark:text-gray-200 placeholder:text-gray-400 transition-all"
            />
          </div>
          <div className="flex gap-2 items-center flex-wrap sm:flex-nowrap">
            <div className="relative">
              <select value={selectedLevelFilter} onChange={(e) => setSelectedLevelFilter(e.target.value)}
                className="appearance-none pl-3 pr-7 py-2 bg-gray-50 dark:bg-white/5 border border-gray-200 dark:border-white/8 rounded-lg text-xs font-semibold text-gray-600 dark:text-gray-300 focus:ring-2 focus:ring-indigo-500/30 outline-none cursor-pointer"
              >
                <option value="all">ระดับชั้น: ทั้งหมด</option>
                <option value="junior">ม.ต้น (ม.1–3)</option>
                <option value="senior">ม.ปลาย (ม.4–6)</option>
                <option disabled>──────</option>
                <option value="ม.1">ม.1</option><option value="ม.2">ม.2</option><option value="ม.3">ม.3</option>
                <option value="ม.4">ม.4</option><option value="ม.5">ม.5</option><option value="ม.6">ม.6</option>
              </select>
              <ChevronRight size={12} className="rotate-90 absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
            </div>
            <div className="relative">
              <select value={selectedTeacherFilter} onChange={(e) => setSelectedTeacherFilter(e.target.value)}
                className="appearance-none pl-3 pr-7 py-2 bg-gray-50 dark:bg-white/5 border border-gray-200 dark:border-white/8 rounded-lg text-xs font-semibold text-gray-600 dark:text-gray-300 focus:ring-2 focus:ring-indigo-500/30 outline-none cursor-pointer"
              >
                <option value="all">ครูผู้ดูแล: ทั้งหมด</option>
                {teachersList.map((teacher: any) => {
                  const teacherName = teacher.name || `${teacher.title || ''}${teacher.firstName || ''} ${teacher.lastName || ''}`.trim();
                  return <option key={teacher.id} value={teacher.id}>{teacherName}</option>;
                })}
              </select>
              <ChevronRight size={12} className="rotate-90 absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
            </div>
            <div className="flex items-center gap-0.5 bg-gray-100 dark:bg-white/5 rounded-lg p-0.5">
              {[
                { value: 'all', label: 'ทั้งหมด' },
                { value: 'open', label: 'เปิด', dot: 'bg-emerald-500' },
                { value: 'full', label: 'เต็ม', dot: 'bg-rose-500' },
                { value: 'closed', label: 'ปิด', dot: 'bg-slate-400' },
              ].map((s) => (
                <button key={s.value} onClick={() => setSelectedStatusFilter(s.value)}
                  className={`flex items-center gap-1 px-2.5 py-1.5 rounded-md text-[11px] font-bold transition-all whitespace-nowrap ${selectedStatusFilter === s.value ? 'bg-indigo-600 text-white' : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'}`}
                >
                  {s.dot && <span className={`w-1.5 h-1.5 rounded-full ${s.dot}`} />}{s.label}
                </button>
              ))}
            </div>
            {(searchTerm || selectedLevelFilter !== 'all' || selectedTeacherFilter !== 'all' || selectedStatusFilter !== 'all') && (
              <span className="text-xs text-gray-500 dark:text-gray-400 whitespace-nowrap">
                <span className="font-black text-indigo-600 dark:text-indigo-400">{filteredClubs.length}</span>/{clubs.length}
                <button onClick={() => { setSearchTerm(''); setSelectedLevelFilter('all'); setSelectedTeacherFilter('all'); setSelectedStatusFilter('all'); }} className="ml-2 text-rose-400 hover:text-rose-500 font-bold">ล้าง</button>
              </span>
            )}
          </div>
        </div>

        {/* ===== CLUB GRID ===== */}
        {loading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {[...Array(6)].map((_, idx) => (
              <div key={idx} className="bg-white dark:bg-[#2a2b2f]/60 border border-gray-200/50 dark:border-white/5 rounded-2xl overflow-hidden animate-pulse">
                <div className="h-24 bg-gray-100 dark:bg-white/5" />
                <div className="p-5 space-y-3">
                  <div className="h-4 bg-gray-100 dark:bg-white/5 rounded-lg w-3/4" />
                  <div className="h-3 bg-gray-100 dark:bg-white/5 rounded-lg w-full" />
                  <div className="h-3 bg-gray-100 dark:bg-white/5 rounded-lg w-2/3" />
                  <div className="h-2 bg-gray-100 dark:bg-white/5 rounded-full mt-4" />
                  <div className="h-9 bg-gray-100 dark:bg-white/5 rounded-xl" />
                </div>
              </div>
            ))}
          </div>
        ) : filteredClubs.length === 0 ? (
          <motion.div
            initial={{ opacity: 0, scale: 0.97 }}
            animate={{ opacity: 1, scale: 1 }}
            className="bg-white dark:bg-[#2a2b2f]/60 border border-dashed border-gray-200 dark:border-white/10 rounded-2xl py-20 text-center"
          >
            <div className="w-16 h-16 bg-gray-100 dark:bg-white/5 rounded-2xl flex items-center justify-center mx-auto mb-4">
              <Compass size={32} className="text-gray-300 dark:text-gray-600" />
            </div>
            <h3 className="text-base font-black text-gray-600 dark:text-gray-300">ไม่พบรายชื่อกิจกรรมชุมนุม</h3>
            <p className="text-gray-400 text-xs mt-1.5 max-w-xs mx-auto font-medium">
              ลองปรับเงื่อนไขตัวกรองหรือล้างการค้นหา
            </p>
            <button
              onClick={() => { setSearchTerm(''); setSelectedLevelFilter('all'); setSelectedTeacherFilter('all'); setSelectedStatusFilter('all'); }}
              className="mt-5 inline-flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white px-5 py-2.5 rounded-xl font-bold text-xs transition-all active:scale-95"
            >
              ล้างตัวกรองทั้งหมด
            </button>
          </motion.div>
        ) : (
          <motion.div layout className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            <AnimatePresence mode="popLayout">
              {filteredClubs.map((club, idx) => {
                const status = getClubStatus(club);
                const percent = Math.min(100, Math.round(((club.memberCount || 0) / (club.capacity || 40)) * 100));

                let progressColor = 'bg-gradient-to-r from-indigo-500 to-blue-500';
                if (percent >= 100) progressColor = 'bg-gradient-to-r from-rose-500 to-red-500';
                else if (percent >= 85) progressColor = 'bg-gradient-to-r from-amber-500 to-orange-400';
                else if (percent >= 50) progressColor = 'bg-gradient-to-r from-emerald-500 to-teal-400';

                const accentColors = [
                  { card: 'from-indigo-500/20 to-indigo-600/5', icon: 'bg-indigo-500/20 text-indigo-400 border-indigo-500/30' },
                  { card: 'from-violet-500/20 to-violet-600/5', icon: 'bg-violet-500/20 text-violet-400 border-violet-500/30' },
                  { card: 'from-emerald-500/20 to-emerald-600/5', icon: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30' },
                  { card: 'from-amber-500/20 to-amber-600/5', icon: 'bg-amber-500/20 text-amber-400 border-amber-500/30' },
                  { card: 'from-rose-500/20 to-rose-600/5', icon: 'bg-rose-500/20 text-rose-400 border-rose-500/30' },
                  { card: 'from-sky-500/20 to-sky-600/5', icon: 'bg-sky-500/20 text-sky-400 border-sky-500/30' },
                ];
                let sum = 0;
                for (let i = 0; i < club.id.length; i++) sum += club.id.charCodeAt(i);
                const accent = accentColors[sum % accentColors.length];
                const IconComp = [Users, Layers, Sparkles, Compass, BookOpen, Clock][sum % 6];

                return (
                  <motion.div
                    layout
                    initial={{ opacity: 0, y: 16 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: 16 }}
                    transition={{ duration: 0.25, delay: idx * 0.03 }}
                    key={club.id}
                    onClick={() => navigate(`/academic/club-list/${club.id}`)}
                    className="bg-white dark:bg-[#2a2b2f]/70 border border-gray-200/60 dark:border-white/5 rounded-xl overflow-hidden hover:shadow-md hover:-translate-y-0.5 transition-all duration-200 cursor-pointer active:scale-[0.99] select-none group"
                  >
                    <div className={`h-1 bg-gradient-to-r ${accent.card} w-full`} />
                    <div className="p-4">
                      {/* Header row */}
                      <div className="flex items-center gap-3 mb-3">
                        <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 border ${accent.icon}`}>
                          <IconComp size={18} />
                        </div>
                        <div className="flex-1 min-w-0">
                          <h3 className="font-black text-gray-900 dark:text-white text-sm leading-tight line-clamp-1 group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition-colors">
                            {club.name}
                          </h3>
                          <p className="text-[11px] text-gray-400 font-medium line-clamp-1 mt-0.5">
                            {club.description || `กิจกรรมชุมนุม ${club.name}`}
                          </p>
                        </div>
                        <div className="flex flex-col items-end gap-1.5 flex-shrink-0">
                          <span className={`flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-black ${status.bg} ${status.color}`}>
                            <span className={`w-1.5 h-1.5 rounded-full ${status.dot}`} />{status.text}
                          </span>
                          <ChevronRight size={14} className="text-gray-300 dark:text-gray-600 group-hover:text-indigo-500 transition-colors" />
                        </div>
                      </div>

                      {/* Capacity bar */}
                      <div className="mb-3">
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-[10px] font-semibold text-gray-400 flex items-center gap-1"><Users size={10} /> สมาชิก</span>
                          <span className="text-[10px] font-black text-gray-600 dark:text-gray-300 tabular-nums">{club.memberCount || 0}/{club.capacity || 40} คน ({percent}%)</span>
                        </div>
                        <div className="h-1.5 bg-gray-100 dark:bg-white/5 rounded-full overflow-hidden">
                          <motion.div
                            initial={{ width: 0 }}
                            animate={{ width: `${percent}%` }}
                            transition={{ duration: 0.5, delay: idx * 0.04 }}
                            className={`h-full rounded-full ${progressColor}`}
                          />
                        </div>
                      </div>

                      {/* Meta row */}
                      <div className="flex items-center justify-between gap-2 text-[11px]">
                        <div className="flex items-center gap-1.5 text-gray-400 min-w-0">
                          <Clock size={11} className="text-indigo-400 flex-shrink-0" />
                          <span className="truncate font-medium">
                            {club.specialPeriodTitle ? `${formatSpecialPeriodDay(club.specialPeriodDay)} ${club.specialPeriodStartTime || ''} – ${club.specialPeriodEndTime || ''}` : 'ยังไม่กำหนดคาบเรียน'}
                          </span>
                        </div>
                        <span className="text-[10px] font-bold text-gray-400 bg-gray-50 dark:bg-white/5 rounded-md px-1.5 py-0.5 border border-gray-100 dark:border-white/5 flex-shrink-0">
                          {formatClassLevelRange(club.allowedClassLevelFrom, club.allowedClassLevelTo) || 'ทุกระดับ'}
                        </span>
                      </div>

                      {/* Teacher */}
                      <div className="mt-2 flex items-center gap-1.5 text-[11px]">
                        <span className="text-gray-400 font-medium flex-shrink-0">ครูผู้ดูแล:</span>
                        <span className="font-bold text-gray-700 dark:text-gray-300 truncate">
                          {(club.responsibleTeacherIds || []).length > 0 ? (
                            <>{teacherMap?.[club.responsibleTeacherIds[0]]?.name || 'ครูผู้ดูแล'}{club.responsibleTeacherIds.length > 1 && ` +${club.responsibleTeacherIds.length - 1}`}</>
                          ) : <span className="italic text-gray-400">ยังไม่ระบุ</span>}
                        </span>
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
