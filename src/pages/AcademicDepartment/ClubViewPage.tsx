import React, { useState, useEffect, useMemo } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import BackButton from "@/components/Shared/BackButton";
import ProfileAvatar from "@/components/Shared/ProfileAvatar";
import { firestore as db } from '../../firebase';
import { collection, doc, getDoc, getDocs, onSnapshot, query, orderBy } from 'firebase/firestore';
import { useSelector, useDispatch } from 'react-redux';
import { RootState } from '@/store';
import MainLayout from "@/layouts/MainLayout";
import { fetchTeachersMap } from '@/store/slices/userMapSlice';
import { usePermissions } from '@/hooks/usePermissions';
import { motion, AnimatePresence } from 'framer-motion';
import Swal from 'sweetalert2';
import {
  Users,
  Clock,
  Sparkles,
  BookOpen,
  Calendar,
  Layers,
  ChevronLeft,
  Settings,
  UserCheck,
  FileSpreadsheet,
  Search,
  ArrowUpRight,
  ShieldAlert,
  UserPlus,
  Mail,
  Phone,
  Bookmark,
  Award,
  Compass
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
  createdAt: any;
}

interface Student {
  id: string;
  title?: string;
  firstName: string;
  lastName: string;
  studentId: string;
  classLevel: string;
  room: string;
  profileImageUrl?: string;
  nickname?: string;
  status?: string;
  joinedAt?: any;
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

const ClubViewPage: React.FC = () => {
  const { clubId } = useParams<{ clubId: string }>();
  const navigate = useNavigate();
  const dispatch = useDispatch();

  const [club, setClub] = useState<Club | null>(null);
  const [memberMeta, setMemberMeta] = useState<Record<string, { status: string; joinedAt?: any }>>({});
  const [allStudents, setAllStudents] = useState<Student[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedRoomFilter, setSelectedRoomFilter] = useState('all');

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

  // Fetch Club details, Settings, and Members
  useEffect(() => {
    if (!schoolId || !clubId) return;

    const fetchClubAndSettings = async () => {
      setLoading(true);
      try {
        // 1. Fetch Club doc
        const clubRef = doc(db, 'school-settings', schoolId, 'clubs', clubId);
        const clubSnap = await getDoc(clubRef);
        if (clubSnap.exists()) {
          setClub({ id: clubSnap.id, ...clubSnap.data() } as Club);
        } else {
          Swal.fire({
            icon: 'error',
            title: 'ไม่พบข้อมูล',
            text: 'ไม่พบกิจกรรมชุมนุมที่ระบุในระบบ',
            confirmButtonText: 'ตกลง',
            background: '#1a1b22',
            color: '#fff'
          }).then(() => {
            navigate('/academic/club-list');
          });
          return;
        }

        // 2. Fetch Registration settings
        const configRef = doc(db, 'school-settings', schoolId, 'configs', 'club_settings');
        const configSnap = await getDoc(configRef);
        if (configSnap.exists()) {
          const data = configSnap.data();
          setGlobalStartDate(data.registrationStartDate || '');
          setGlobalEndDate(data.registrationEndDate || '');
          setAllowTransfer(data.allowTransfer || false);
        }
      } catch (error) {
        console.error("Error fetching club details/settings:", error);
      } finally {
        setLoading(false);
      }
    };

    fetchClubAndSettings();

    // 3. Listen to members subcollection
    const membersCol = collection(db, 'school-settings', schoolId, 'clubs', clubId, 'members');
    const unsubMembers = onSnapshot(membersCol, (snap) => {
      const meta: Record<string, { status: string; joinedAt?: any }> = {};
      snap.docs.forEach(doc => {
        const data = doc.data();
        meta[doc.id] = { 
          status: data.status || 'pending',
          joinedAt: data.joinedAt?.toDate ? data.joinedAt.toDate() : data.joinedAt || null
        };
      });
      setMemberMeta(meta);
    });

    // 4. Listen to all students in school
    const studentsCol = query(collection(db, 'school-settings', schoolId, 'students'), orderBy('studentId'));
    const unsubStudents = onSnapshot(studentsCol, (snap) => {
      setAllStudents(snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as Student)));
    });

    return () => {
      unsubMembers();
      unsubStudents();
    };
  }, [schoolId, clubId, navigate]);

  // Combine metadata with student profile
  const members = useMemo(() => {
    const memberIds = Object.keys(memberMeta);
    return allStudents
      .filter(s => memberIds.includes(s.id))
      .map(s => ({
        ...s,
        status: memberMeta[s.id]?.status,
        joinedAt: memberMeta[s.id]?.joinedAt
      }))
      .sort((a, b) => {
        // Sort by class level & room then student ID
        const classComp = (a.classLevel || '').localeCompare(b.classLevel || '', 'th');
        if (classComp !== 0) return classComp;
        const roomComp = (parseInt(a.room) || 0) - (parseInt(b.room) || 0);
        if (roomComp !== 0) return roomComp;
        return (a.studentId || '').localeCompare(b.studentId || '');
      });
  }, [allStudents, memberMeta]);

  // Club capacity percentage
  const percent = useMemo(() => {
    if (!club) return 0;
    return Math.min(100, Math.round((members.length / (club.capacity || 40)) * 100));
  }, [club, members]);

  // Registration Status text
  const clubStatus = useMemo(() => {
    if (!club) return { text: '', color: '', bg: '', dot: '' };
    
    const isFull = members.length >= (club.capacity || 40);
    if (isFull) {
      return { 
        text: 'เต็มแล้ว', 
        color: 'text-rose-600 dark:text-rose-400', 
        bg: 'bg-rose-50 dark:bg-rose-950/20 border border-rose-100 dark:border-rose-900/30',
        dot: 'bg-rose-500'
      };
    }

    const now = new Date();
    now.setHours(0, 0, 0, 0);

    if (globalStartDate && globalEndDate) {
      const start = new Date(globalStartDate);
      const end = new Date(globalEndDate);
      end.setHours(23, 59, 59, 999);

      if (now >= start && now <= end) {
        return { 
          text: 'เปิดรับสมัคร', 
          color: 'text-emerald-600 dark:text-emerald-400', 
          bg: 'bg-emerald-50 dark:bg-emerald-950/20 border border-emerald-100 dark:border-emerald-900/30',
          dot: 'bg-emerald-500 animate-pulse'
        };
      }
      if (now < start) {
        return { 
          text: 'ยังไม่เปิด', 
          color: 'text-amber-600 dark:text-amber-400', 
          bg: 'bg-amber-50 dark:bg-amber-950/20 border border-amber-100 dark:border-amber-900/30',
          dot: 'bg-amber-500'
        };
      }
      return { 
        text: 'ปิดรับสมัคร', 
        color: 'text-slate-600 dark:text-slate-400', 
        bg: 'bg-slate-50 dark:bg-slate-900/30 border border-slate-200 dark:border-slate-800',
        dot: 'bg-slate-500'
      };
    }

    return { 
      text: 'ไม่มีข้อมูล', 
      color: 'text-gray-500', 
      bg: 'bg-gray-50 dark:bg-gray-900/30 border border-gray-200 dark:border-gray-800',
      dot: 'bg-gray-400' 
    };
  }, [club, members, globalStartDate, globalEndDate]);

  // List of rooms for filtering students list
  const roomOptions = useMemo(() => {
    const roomsSet = new Set(members.map(m => `${m.classLevel}/${m.room}`).filter(Boolean));
    return Array.from(roomsSet).sort((a, b) => a.localeCompare(b, 'th'));
  }, [members]);

  // Filter students in the table
  const filteredStudents = useMemo(() => {
    return members.filter(student => {
      const fullName = `${student.title || ''}${student.firstName || ''} ${student.lastName || ''}`.toLowerCase();
      const matchesSearch = fullName.includes(searchTerm.toLowerCase()) ||
                            (student.studentId || '').includes(searchTerm) ||
                            (student.nickname || '').toLowerCase().includes(searchTerm.toLowerCase());

      const classRoom = `${student.classLevel}/${student.room}`;
      const matchesRoom = selectedRoomFilter === 'all' || classRoom === selectedRoomFilter;

      return matchesSearch && matchesRoom;
    });
  }, [members, searchTerm, selectedRoomFilter]);

  // CSV Exporter
  const exportToCSV = () => {
    if (members.length === 0 || !club) return;
    
    const headers = ['ลำดับ', 'รหัสนักเรียน', 'ชื่อ-นามสกุล', 'ชื่อเล่น', 'ระดับชั้น/ห้อง', 'สถานะสมาชิก', 'วันที่เข้าร่วม'];
    
    const rows = members.map((student, index) => [
      index + 1,
      student.studentId || '',
      `${student.title || ''}${student.firstName || ''} ${student.lastName || ''}`.trim(),
      student.nickname || '',
      `${student.classLevel}/${student.room}`,
      student.status === 'confirmed' ? 'อนุมัติแล้ว' : 'รอการตรวจสอบ',
      student.joinedAt ? new Date(student.joinedAt).toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: 'numeric' }) : '-'
    ]);
    
    // Add UTF-8 BOM so Excel opens Thai fonts correctly
    const csvContent = "\uFEFF" + [headers.join(','), ...rows.map(row => row.map(val => `"${String(val).replace(/"/g, '""')}"`).join(','))].join('\n');
    
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `รายชื่อสมาชิกชุมนุม_${club.name}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    // Toast feedback
    Swal.fire({
      toast: true,
      position: 'top-end',
      icon: 'success',
      title: 'ส่งออกไฟล์ CSV สำเร็จ',
      showConfirmButton: false,
      timer: 1800,
      timerProgressBar: true,
      background: '#1a1b22',
      color: '#fff'
    });
  };

  if (loading) {
    return (
      <MainLayout>
        <div className="p-8 max-w-7xl mx-auto space-y-6">
          <div className="h-6 bg-gray-200 dark:bg-gray-800 rounded w-24 animate-pulse" />
          <div className="h-40 bg-gray-200 dark:bg-gray-800 rounded-3xl animate-pulse" />
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="md:col-span-2 h-96 bg-gray-200 dark:bg-gray-800 rounded-3xl animate-pulse" />
            <div className="h-96 bg-gray-200 dark:bg-gray-800 rounded-3xl animate-pulse" />
          </div>
        </div>
      </MainLayout>
    );
  }

  if (!club) return null;

  return (
    <MainLayout>
      <div className="p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto">

        {/* ===== HEADER ===== */}
        <div className="bg-white dark:bg-[#2a2b2f] rounded-2xl p-4 sm:p-5 mb-4">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-3 min-w-0">
              <BackButton to="/academic/club-list" />
              <div className="w-10 h-10 bg-indigo-600 rounded-xl flex items-center justify-center flex-shrink-0">
                <Compass size={18} className="text-white" />
              </div>
              <div className="min-w-0">
                <h1 className="text-lg sm:text-xl font-black text-gray-900 dark:text-white tracking-tight leading-tight">รายละเอียดกิจกรรมชุมนุม</h1>
                <p className="text-gray-500 dark:text-gray-400 text-[11px] font-medium hidden sm:block">ดูข้อมูลชุมนุม สมาชิก และจัดการรายละเอียดเบื้องต้น</p>
              </div>
            </div>
            {canManage && (
              <div className="flex gap-2 flex-shrink-0">
                <Link to={`/academic/club-members?clubId=${club.id}`} className="flex items-center gap-1.5 bg-indigo-600 hover:bg-indigo-700 text-white px-3 py-2 rounded-xl font-bold text-xs transition-all active:scale-95 whitespace-nowrap">
                  <UserPlus size={13} />จัดการสมาชิก
                </Link>
                <Link to="/academic/club-management" className="flex items-center gap-1.5 bg-gray-500 hover:bg-gray-600 dark:bg-gray-600 dark:hover:bg-gray-500 text-white px-3 py-2 rounded-xl font-bold text-xs transition-all active:scale-95 whitespace-nowrap">
                  <Settings size={13} />แก้ไขข้อมูล
                </Link>
              </div>
            )}
          </div>
        </div>

        {/* ===== CLUB INFO CARD ===== */}
        <div className="bg-white dark:bg-[#2a2b2f] rounded-2xl p-5 mb-4">
          <div className="flex items-start gap-4">
            {/* Icon */}
            <div className="w-14 h-14 rounded-2xl bg-indigo-600 flex items-center justify-center flex-shrink-0">
              {club.imageUrl
                ? <img src={club.imageUrl} className="w-full h-full object-cover rounded-2xl" alt={club.name} />
                : <Compass size={26} className="text-white" />
              }
            </div>
            {/* Title + meta */}
            <div className="flex-1 min-w-0">
              <div className="flex flex-wrap items-center gap-2 mb-1">
                <h2 className="text-xl font-black text-gray-900 dark:text-white leading-tight">{club.name}</h2>
                <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-black ${clubStatus.bg} ${clubStatus.color}`}>
                  <span className={`w-1.5 h-1.5 rounded-full ${clubStatus.dot}`} />{clubStatus.text}
                </span>
              </div>
              <p className="text-xs text-gray-500 dark:text-gray-400 font-medium mb-3 line-clamp-2">
                {club.description || 'ไม่มีการระบุรายละเอียดกิจกรรมชุมนุม'}
              </p>
              <div className="flex flex-wrap gap-2">
                <span className="px-2.5 py-1 bg-sky-50 dark:bg-sky-500/10 text-sky-700 dark:text-sky-300 text-[10px] font-bold rounded-lg">
                  {formatClassLevelRange(club.allowedClassLevelFrom, club.allowedClassLevelTo) || 'ทุกระดับชั้น'}
                </span>
              </div>
            </div>
          </div>

          {/* Stats row */}
          <div className="grid grid-cols-3 gap-3 mt-4 pt-4 border-t border-gray-100 dark:border-white/5">
            {[
              { icon: <Users size={14} />, label: 'สมาชิก', value: `${members.length} / ${club.capacity || 40} คน`, color: 'text-indigo-600 dark:text-indigo-400', bg: 'bg-indigo-50 dark:bg-indigo-500/10' },
              { icon: <Clock size={14} />, label: 'คาบเรียน', value: club.specialPeriodTitle ? `${formatSpecialPeriodDay(club.specialPeriodDay)} ${club.specialPeriodStartTime || ''} – ${club.specialPeriodEndTime || ''}` : 'ยังไม่กำหนด', color: 'text-sky-600 dark:text-sky-400', bg: 'bg-sky-50 dark:bg-sky-500/10' },
              { icon: <Calendar size={14} />, label: 'ช่วงลงทะเบียน', value: globalStartDate ? `${new Date(globalStartDate).toLocaleDateString('th-TH', { day: 'numeric', month: 'short' })} – ${new Date(globalEndDate).toLocaleDateString('th-TH', { day: 'numeric', month: 'short' })}` : 'ไม่กำหนด', color: 'text-emerald-600 dark:text-emerald-400', bg: 'bg-emerald-50 dark:bg-emerald-500/10' },
            ].map((s, i) => (
              <div key={i} className="flex items-center gap-2.5 p-3 bg-gray-50 dark:bg-white/5 rounded-xl">
                <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${s.bg} ${s.color}`}>{s.icon}</div>
                <div className="min-w-0">
                  <p className="text-[10px] text-gray-400 font-medium">{s.label}</p>
                  <p className="text-xs font-black text-gray-800 dark:text-gray-200 truncate">{s.value}</p>
                </div>
              </div>
            ))}
          </div>

          {/* Capacity bar */}
          <div className="mt-3">
            <div className="flex justify-between text-[10px] font-semibold text-gray-400 mb-1">
              <span>ความจุ</span>
              <span className="tabular-nums">{percent}%</span>
            </div>
            <div className="h-1.5 bg-gray-100 dark:bg-white/5 rounded-full overflow-hidden">
              <motion.div initial={{ width: 0 }} animate={{ width: `${percent}%` }} transition={{ duration: 0.6 }}
                className={`h-full rounded-full ${percent >= 100 ? 'bg-rose-500' : percent >= 80 ? 'bg-amber-500' : 'bg-indigo-500'}`}
              />
            </div>
          </div>
        </div>

        {/* ===== MAIN GRID ===== */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 items-start">

          {/* Members Table */}
          <div className="lg:col-span-2 bg-white dark:bg-[#2a2b2f] rounded-2xl p-5">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
              <div>
                <h3 className="text-base font-black text-gray-900 dark:text-white flex items-center gap-2">
                  <Users size={16} className="text-indigo-500" />
                  รายชื่อสมาชิก
                  <span className="text-xs bg-indigo-600 text-white px-2 py-0.5 rounded-md font-bold tabular-nums">{members.length} คน</span>
                </h3>
                <p className="text-[10px] text-gray-400 font-medium mt-0.5">นักเรียนที่ลงทะเบียนเข้าชุมนุมนี้</p>
              </div>
              <button onClick={exportToCSV} disabled={members.length === 0}
                className="flex items-center gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white px-3 py-2 rounded-xl font-bold text-xs transition-all active:scale-95 disabled:opacity-40 disabled:pointer-events-none self-start sm:self-auto"
              >
                <FileSpreadsheet size={13} />ส่งออก CSV
              </button>
            </div>

            {/* Search + filter */}
            <div className="flex gap-2 mb-4">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={13} />
                <input type="text" placeholder="ค้นหารหัสนักเรียน หรือชื่อ..." value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full pl-8 pr-3 py-2 bg-gray-100 dark:bg-gray-700/60 border border-gray-200 dark:border-gray-600/40 rounded-xl text-xs font-medium text-gray-800 dark:text-gray-200 placeholder:text-gray-400 dark:placeholder:text-gray-500 outline-none focus:ring-2 focus:ring-indigo-500/30 transition-all"
                />
              </div>
              <div className="relative">
                <select value={selectedRoomFilter} onChange={(e) => setSelectedRoomFilter(e.target.value)}
                  className="appearance-none pl-3 pr-7 py-2 bg-gray-100 dark:bg-gray-700/60 border border-gray-200 dark:border-gray-600/40 rounded-xl text-xs font-semibold text-gray-700 dark:text-gray-200 outline-none focus:ring-2 focus:ring-indigo-500/30 cursor-pointer"
                >
                  <option value="all">ห้อง: ทั้งหมด</option>
                  {roomOptions.map((r, i) => <option key={i} value={r}>{r}</option>)}
                </select>
                <ChevronLeft size={11} className="-rotate-90 absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
              </div>
            </div>

            {filteredStudents.length === 0 ? (
              <div className="py-14 text-center bg-gray-100 dark:bg-gray-700/30 rounded-xl border border-gray-200 dark:border-gray-600/20">
                <Users size={36} className="mx-auto text-gray-300 dark:text-gray-600 mb-2" />
                <p className="text-sm font-bold text-gray-500 dark:text-gray-400">ไม่พบรายชื่อสมาชิก</p>
                <p className="text-[11px] text-gray-400 dark:text-gray-500 mt-0.5">{members.length === 0 ? 'ยังไม่มีนักเรียนลงทะเบียน' : 'ลองปรับเงื่อนไขการค้นหา'}</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left">
                  <thead>
                    <tr className="border-b border-gray-200 dark:border-gray-600/30 text-[10px] font-bold text-gray-400 uppercase tracking-wider">
                      <th className="pb-2.5 px-2 w-10 text-center">#</th>
                      <th className="pb-2.5 px-2">รหัส</th>
                      <th className="pb-2.5 px-3">ชื่อ - นามสกุล</th>
                      <th className="pb-2.5 px-2 text-center">ห้อง</th>
                      <th className="pb-2.5 px-2 text-center">สถานะ</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100 dark:divide-gray-600/20">
                    {filteredStudents.map((student, idx) => {
                      const fullName = `${student.title || ''}${student.firstName || ''} ${student.lastName || ''}`.trim();
                      const isConfirmed = student.status === 'confirmed';
                      return (
                        <tr key={student.id} className="hover:bg-gray-50 dark:hover:bg-gray-700/30 transition-colors group text-xs">
                          <td className="py-3 px-2 text-center text-gray-400 font-bold tabular-nums">{idx + 1}</td>
                          <td className="py-3 px-2 font-mono text-gray-500 dark:text-gray-400 text-[11px] tabular-nums">{student.studentId || '-'}</td>
                          <td className="py-3 px-3">
                            <div className="flex items-center gap-2.5">
                              <div className="w-7 h-7 rounded-full bg-gray-200 dark:bg-gray-600/60 flex-shrink-0 flex items-center justify-center overflow-hidden">
                                {student.profileImageUrl
                                  ? <img src={student.profileImageUrl} className="w-full h-full object-cover" alt="" />
                                  : <span className="text-[10px] font-bold text-gray-500 dark:text-gray-300">{student.firstName.charAt(0)}</span>
                                }
                              </div>
                              <div className="min-w-0">
                                <span className="font-bold text-gray-900 dark:text-gray-100 group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition-colors block truncate">{fullName}</span>
                                {student.nickname && <span className="text-[10px] text-gray-400">({student.nickname})</span>}
                              </div>
                            </div>
                          </td>
                          <td className="py-3 px-2 text-center">
                            <span className="px-2 py-0.5 bg-gray-100 dark:bg-gray-700/60 text-gray-600 dark:text-gray-300 rounded-md font-bold text-[11px] tabular-nums">{student.classLevel}/{student.room}</span>
                          </td>
                          <td className="py-3 px-2 text-center">
                            {isConfirmed
                              ? <span className="inline-flex items-center gap-1 text-[10px] font-bold text-emerald-700 dark:text-emerald-400 bg-emerald-100 dark:bg-emerald-500/15 px-2 py-0.5 rounded-full"><span className="w-1 h-1 rounded-full bg-emerald-500" />อนุมัติแล้ว</span>
                              : <span className="inline-flex items-center gap-1 text-[10px] font-bold text-amber-700 dark:text-amber-400 bg-amber-100 dark:bg-amber-500/15 px-2 py-0.5 rounded-full"><span className="w-1 h-1 rounded-full bg-amber-500 animate-pulse" />รอตรวจสอบ</span>
                            }
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Sidebar */}
          <div className="space-y-4">

            {/* Teachers */}
            <div className="bg-white dark:bg-[#2a2b2f] rounded-2xl p-5">
              <h3 className="text-sm font-black text-gray-900 dark:text-white flex items-center gap-2 mb-4">
                <Award size={15} className="text-amber-500" />ครูผู้รับผิดชอบ
              </h3>
              {club.responsibleTeacherIds && club.responsibleTeacherIds.length > 0 ? (
                <div className="space-y-3">
                  {club.responsibleTeacherIds.map((teacherId) => {
                    const teacher = teacherMap?.[teacherId];
                    if (!teacher) return (
                      <div key={teacherId} className="flex items-center gap-3 p-3 bg-gray-100 dark:bg-gray-700/40 rounded-xl animate-pulse">
                        <div className="w-10 h-10 bg-gray-200 dark:bg-gray-600/50 rounded-xl" />
                        <div className="flex-1 space-y-1.5"><div className="h-3 bg-gray-200 dark:bg-gray-600/50 rounded w-2/3" /><div className="h-2.5 bg-gray-200 dark:bg-gray-600/50 rounded w-1/2" /></div>
                      </div>
                    );
                    const teacherName = teacher.name || `${teacher.title || ''}${teacher.firstName || ''} ${teacher.lastName || ''}`.trim();
                    return (
                      <div key={teacherId} className="p-3 bg-gray-100 dark:bg-gray-700/40 rounded-xl">
                        <div className="flex items-center gap-3 mb-2.5">
                          <div className="w-10 h-10 rounded-xl bg-gray-200 dark:bg-gray-600/60 overflow-hidden flex-shrink-0 flex items-center justify-center">
                            {teacher.profileImageUrl
                              ? <img src={teacher.profileImageUrl} className="w-full h-full object-cover" alt="" />
                              : <span className="text-xs font-bold text-gray-500 dark:text-gray-300">ครู</span>
                            }
                          </div>
                          <div className="min-w-0">
                            <p className="text-xs font-black text-gray-900 dark:text-white truncate">{teacherName}</p>
                            <p className="text-[10px] text-gray-400 dark:text-gray-500 font-medium">รหัสครู: {teacher.teacherId || '-'}</p>
                          </div>
                        </div>
                        <div className="space-y-1 border-t border-gray-200 dark:border-gray-600/30 pt-2.5">
                          <div className="flex items-center gap-1.5 text-[10px] text-gray-500 dark:text-gray-400">
                            <Phone size={10} /><span>{(teacher as any).phone || 'ไม่ระบุเบอร์โทร'}</span>
                          </div>
                          <div className="flex items-center gap-1.5 text-[10px] text-gray-500 dark:text-gray-400">
                            <Mail size={10} /><span className="truncate">{(teacher as any).email || 'ไม่ระบุอีเมล'}</span>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="py-8 text-center bg-gray-100 dark:bg-gray-700/30 rounded-xl text-xs text-gray-400 dark:text-gray-500 italic border border-gray-200 dark:border-gray-600/20">ยังไม่มีการมอบหมายครูผู้ดูแล</div>
              )}
            </div>

            {/* Quick Actions */}
            <div className="bg-white dark:bg-[#2a2b2f] rounded-2xl p-5">
              <h3 className="text-sm font-black text-gray-900 dark:text-white flex items-center gap-2 mb-3">
                <Bookmark size={15} className="text-indigo-500" />เมนูที่เกี่ยวข้อง
              </h3>
              <div className="space-y-2">
                <Link to="/academic/club-attendance"
                  className="flex items-center justify-between p-3 bg-gray-100 dark:bg-gray-700/40 hover:bg-indigo-100 dark:hover:bg-indigo-500/20 rounded-xl text-xs font-bold text-gray-700 dark:text-gray-200 hover:text-indigo-700 dark:hover:text-indigo-300 transition-all group"
                >
                  <span className="flex items-center gap-2"><UserCheck size={14} className="text-indigo-500" />เช็คชื่อกิจกรรมชุมนุม</span>
                  <ArrowUpRight size={13} className="text-gray-400 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-transform" />
                </Link>
                <Link to="/academic/club-reports"
                  className="flex items-center justify-between p-3 bg-gray-100 dark:bg-gray-700/40 hover:bg-indigo-100 dark:hover:bg-indigo-500/20 rounded-xl text-xs font-bold text-gray-700 dark:text-gray-200 hover:text-indigo-700 dark:hover:text-indigo-300 transition-all group"
                >
                  <span className="flex items-center gap-2"><FileSpreadsheet size={14} className="text-sky-500" />รายงานชุมนุม</span>
                  <ArrowUpRight size={13} className="text-gray-400 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-transform" />
                </Link>
                <div className="p-3 bg-amber-50 dark:bg-amber-950/40 rounded-xl border border-amber-200 dark:border-amber-700/30 flex gap-2 items-start">
                  <ShieldAlert size={13} className="text-amber-500 flex-shrink-0 mt-0.5" />
                  <p className="text-[10px] font-medium text-amber-700 dark:text-amber-300 leading-relaxed">
                    ขณะนี้ระบบ<span className="font-black">{allowTransfer ? 'เปิด' : 'ปิด'}</span>การย้ายชุมนุม ครูวิชาการสามารถอนุมัติผ่านระบบสมาชิกได้
                  </p>
                </div>
              </div>
            </div>

          </div>
        </div>

      </div>
    </MainLayout>
  );
};

export default ClubViewPage;
