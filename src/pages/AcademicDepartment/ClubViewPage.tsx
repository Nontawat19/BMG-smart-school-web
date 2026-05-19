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
      <div className="p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto text-gray-900 dark:text-white transition-colors duration-300">
        
        {/* Back navigation & Page Header */}
        <div className="mb-6 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <BackButton to="/academic/club-list" />
            <div>
              <h1 className="text-2xl sm:text-3xl font-black tracking-tight flex items-center gap-2">
                <Compass className="text-indigo-500" size={28} />
                รายละเอียดกิจกรรมชุมนุม
              </h1>
              <p className="text-xs sm:text-sm text-gray-500 dark:text-gray-400 font-medium">ดูข้อมูลชุมนุม สมาชิก และจัดการรายละเอียดเบื้องต้น</p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {canManage && (
              <>
                <Link
                  to={`/academic/club-members?clubId=${club.id}`}
                  className="flex items-center gap-1.5 bg-indigo-600 hover:bg-indigo-700 active:scale-95 text-white px-4 py-2.5 rounded-2xl font-black text-xs transition-all shadow-md shadow-indigo-500/20"
                >
                  <UserPlus size={14} />
                  จัดการสมาชิก
                </Link>
                <Link
                  to={`/academic/club-management`}
                  className="flex items-center gap-1.5 bg-gray-100 hover:bg-gray-200 dark:bg-[#1a1b22] dark:hover:bg-gray-800 text-gray-700 dark:text-gray-200 px-4 py-2.5 rounded-2xl font-black text-xs border border-gray-200/55 dark:border-gray-800 transition-all active:scale-95 shadow-sm"
                >
                  <Settings size={14} />
                  แก้ไขข้อมูลชุมนุม
                </Link>
              </>
            )}
          </div>
        </div>

        {/* Club Profile Cover Banner Card */}
        <div className="bg-white dark:bg-[#1a1b22] rounded-3xl overflow-hidden border border-gray-100 dark:border-gray-800 shadow-sm mb-6 flex flex-col md:flex-row">
          {/* Banner cover section */}
          <div className="md:w-1/3 relative h-48 md:h-auto bg-gray-50 dark:bg-gray-800/40 flex items-center justify-center flex-shrink-0">
            {club.imageUrl ? (
              <img src={club.imageUrl} className="absolute inset-0 w-full h-full object-cover" alt={club.name} />
            ) : (
              <div className="absolute inset-0 bg-gradient-to-br from-indigo-500/20 via-sky-500/10 to-transparent dark:from-indigo-500/10 dark:via-sky-500/5 dark:to-transparent" />
            )}
            <div className="relative z-10 w-16 h-16 rounded-2xl bg-white dark:bg-[#1a1b22] border border-gray-100 dark:border-gray-800 flex items-center justify-center shadow-md">
              <Compass size={32} className="text-indigo-500" />
            </div>
            
            {/* Status dynamic overlays */}
            <div className="absolute top-4 left-4 z-10">
              <span className={`px-2.5 py-1 text-[10px] font-black rounded-xl backdrop-blur-md flex items-center gap-1.5 shadow-sm ${clubStatus.bg} ${clubStatus.color}`}>
                <span className={`w-1.5 h-1.5 rounded-full ${clubStatus.dot}`} />
                {clubStatus.text}
              </span>
            </div>
          </div>

          {/* Club core details */}
          <div className="p-6 md:w-2/3 flex flex-col justify-between">
            <div>
              <div className="flex items-center gap-2 mb-2">
                <span className="px-2 py-0.5 bg-indigo-50 text-indigo-700 dark:bg-indigo-500/10 dark:text-indigo-300 text-[10px] font-black rounded-md">
                  รหัสชุมนุม: {clubId ? clubId.slice(0, 6).toUpperCase() : ''}
                </span>
                <span className="px-2 py-0.5 bg-sky-50 text-sky-700 dark:bg-sky-500/10 dark:text-sky-300 text-[10px] font-black rounded-md">
                  ระดับชั้นที่รับสมัคร: {formatClassLevelRange(club.allowedClassLevelFrom, club.allowedClassLevelTo)}
                </span>
              </div>
              <h2 className="text-2xl font-black text-gray-900 dark:text-white leading-tight mb-2">
                {club.name}
              </h2>
              <p className="text-xs sm:text-sm text-gray-500 dark:text-gray-400 font-medium leading-relaxed mb-6">
                {club.description || 'ไม่มีการระบุรายละเอียดกิจกรรมชุมนุม'}
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-4 border-t border-gray-50 dark:border-gray-800/40">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-gray-50 dark:bg-gray-800 flex items-center justify-center text-gray-400">
                  <Users size={18} />
                </div>
                <div>
                  <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider block">สมาชิกร่วมชุมนุม</span>
                  <span className="text-sm font-black tabular-nums">{members.length} / {club.capacity || 40} คน</span>
                </div>
              </div>
              
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-gray-50 dark:bg-gray-800 flex items-center justify-center text-gray-400">
                  <Clock size={18} />
                </div>
                <div>
                  <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider block">คาบเรียนเรียนกิจกรรม</span>
                  <span className="text-sm font-black truncate max-w-[150px] block">
                    {club.specialPeriodTitle
                      ? `${club.specialPeriodTitle} (${formatSpecialPeriodDay(club.specialPeriodDay)})`
                      : 'ยังไม่กำหนด'}
                  </span>
                </div>
              </div>

              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-gray-50 dark:bg-gray-800 flex items-center justify-center text-gray-400">
                  <Calendar size={18} />
                </div>
                <div>
                  <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider block">ช่วงสมัครเรียน</span>
                  <span className="text-sm font-black">
                    {globalStartDate ? new Date(globalStartDate).toLocaleDateString('th-TH', { month: 'short', day: 'numeric' }) : 'ไม่กำหนด'}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Dashboard Grid layouts */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
          
          {/* Column Left (Table of Student Members) */}
          <div className="lg:col-span-2 space-y-6">
            
            <div className="bg-white dark:bg-[#1a1b22] border border-gray-100 dark:border-gray-800 rounded-3xl p-6 shadow-sm">
              
              {/* Header inside the card */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6 pb-4 border-b border-gray-50 dark:border-gray-800">
                <div>
                  <h3 className="text-lg font-black tracking-tight flex items-center gap-2">
                    <Users className="text-indigo-500" size={22} />
                    รายชื่อสมาชิกในชุมนุม
                    <span className="text-xs bg-gray-50 dark:bg-gray-800 text-indigo-500 border border-gray-100 dark:border-gray-800 px-2 py-0.5 rounded-md font-black tabular-nums ml-1">
                      {members.length} คน
                    </span>
                  </h3>
                  <p className="text-[10px] sm:text-xs text-gray-400 font-semibold mt-0.5">รายชื่อนักเรียนทั้งหมดที่มีสถานะและได้เลือกลงทะเบียนเข้าชุมนุมนี้</p>
                </div>

                <div className="flex items-center gap-2 self-start sm:self-auto">
                  <button
                    onClick={exportToCSV}
                    disabled={members.length === 0}
                    className="flex items-center gap-1.5 bg-emerald-50 hover:bg-emerald-100 dark:bg-emerald-500/10 dark:hover:bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 px-3.5 py-2 rounded-2xl font-black text-xs border border-emerald-100 dark:border-emerald-500/20 active:scale-95 transition-all shadow-inner disabled:opacity-50 disabled:pointer-events-none"
                  >
                    <FileSpreadsheet size={14} />
                    ส่งออกรายชื่อ (CSV)
                  </button>
                </div>
              </div>

              {/* Internal search/filter tools */}
              <div className="flex flex-col sm:flex-row items-center gap-3 mb-6">
                <div className="relative w-full sm:flex-1">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={14} />
                  <input
                    type="text"
                    placeholder="ค้นหาตามรหัส รหัสนักเรียน หรือชื่อ-นามสกุล..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="w-full pl-9 pr-4 py-2 bg-gray-50 dark:bg-gray-800/40 border border-gray-100 dark:border-gray-800 rounded-xl focus:ring-2 focus:ring-indigo-500/50 outline-none transition-all text-xs font-bold"
                  />
                </div>

                <div className="relative w-full sm:w-48">
                  <select
                    value={selectedRoomFilter}
                    onChange={(e) => setSelectedRoomFilter(e.target.value)}
                    className="w-full px-3 py-2 bg-gray-50 dark:bg-gray-800/40 border border-gray-100 dark:border-gray-800 rounded-xl focus:ring-2 focus:ring-indigo-500/50 outline-none transition-all text-xs font-bold text-gray-600 dark:text-gray-300 appearance-none cursor-pointer"
                  >
                    <option value="all">กรองตามห้องเรียน: ทั้งหมด</option>
                    {roomOptions.map((roomOpt, idx) => (
                      <option key={idx} value={roomOpt}>ชั้นเรียน {roomOpt}</option>
                    ))}
                  </select>
                  <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-3 text-gray-400">
                    <ChevronLeft size={12} className="-rotate-90" />
                  </div>
                </div>
              </div>

              {/* Members Table */}
              {filteredStudents.length === 0 ? (
                <div className="py-16 text-center border border-dashed border-gray-200 dark:border-gray-800 rounded-2xl bg-gray-50/50 dark:bg-gray-900/10">
                  <Users className="mx-auto text-gray-300 dark:text-gray-700 mb-3 animate-pulse" size={44} />
                  <p className="text-gray-500 text-xs sm:text-sm font-bold">ไม่พบรายชื่อสมาชิก</p>
                  <p className="text-gray-400 text-[10px] sm:text-xs mt-0.5">
                    {members.length === 0 ? 'ยังไม่มีนักเรียนลงทะเบียนในชุมนุมนี้' : 'ลองพิมพ์เพื่อเปลี่ยนเงื่อนไขค้นหา'}
                  </p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="border-b border-gray-50 dark:border-gray-800 text-[10px] font-black text-gray-400 uppercase tracking-wider">
                        <th className="py-3 px-2 w-12 text-center">ลำดับ</th>
                        <th className="py-3 px-2 w-28">รหัสนักเรียน</th>
                        <th className="py-3 px-4">ชื่อ - นามสกุล</th>
                        <th className="py-3 px-2 text-center w-24">ระดับชั้น/ห้อง</th>
                        <th className="py-3 px-3 text-center w-24">สถานะสมัคร</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50 dark:divide-gray-800/40">
                      {filteredStudents.map((student, idx) => {
                        const fullName = `${student.title || ''}${student.firstName || ''} ${student.lastName || ''}`.trim();
                        const isConfirmed = student.status === 'confirmed';
                        
                        return (
                          <tr key={student.id} className="hover:bg-gray-50/50 dark:hover:bg-gray-800/10 group transition-all text-xs font-bold">
                            <td className="py-3.5 px-2 text-center text-gray-400 font-extrabold tabular-nums">
                              {idx + 1}
                            </td>
                            <td className="py-3.5 px-2 font-mono text-gray-500 dark:text-gray-400 tabular-nums">
                              {student.studentId || '-'}
                            </td>
                            <td className="py-3.5 px-4">
                              <div className="flex items-center gap-3">
                                <div className="w-7 h-7 rounded-full overflow-hidden bg-gray-100 dark:bg-gray-800 flex-shrink-0 flex items-center justify-center shadow-inner">
                                  {student.profileImageUrl ? (
                                    <img src={student.profileImageUrl} className="w-full h-full object-cover" alt="" />
                                  ) : (
                                    <span className="text-[10px] text-gray-400 font-black">
                                      {student.firstName.charAt(0)}
                                    </span>
                                  )}
                                </div>
                                <div className="min-w-0">
                                  <span className="text-gray-900 dark:text-gray-200 group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition-colors block truncate">
                                    {fullName}
                                  </span>
                                  {student.nickname && (
                                    <span className="text-[10px] font-black text-gray-400 block mt-0.5">
                                      ชื่อเล่น: {student.nickname}
                                    </span>
                                  )}
                                </div>
                              </div>
                            </td>
                            <td className="py-3.5 px-2 text-center text-gray-600 dark:text-gray-300">
                              <span className="px-2 py-0.5 bg-slate-50 dark:bg-gray-800 border border-slate-100 dark:border-gray-700/30 rounded-md font-black tabular-nums">
                                {student.classLevel}/{student.room}
                              </span>
                            </td>
                            <td className="py-3.5 px-3 text-center">
                              {isConfirmed ? (
                                <span className="inline-flex items-center justify-center gap-1 text-[9px] font-black text-emerald-600 bg-emerald-50 dark:text-emerald-400 dark:bg-emerald-950/20 border border-emerald-100 dark:border-emerald-900/30 px-2 py-0.5 rounded-full">
                                  <span className="w-1 h-1 rounded-full bg-emerald-500" />
                                  อนุมัติแล้ว
                                </span>
                              ) : (
                                <span className="inline-flex items-center justify-center gap-1 text-[9px] font-black text-amber-600 bg-amber-50 dark:text-amber-400 dark:bg-amber-950/20 border border-amber-100 dark:border-amber-900/30 px-2 py-0.5 rounded-full">
                                  <span className="w-1 h-1 rounded-full bg-amber-500 animate-pulse" />
                                  รอตรวจสอบ
                                </span>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>

          {/* Column Right (Teachers Profile & Quick Actions) */}
          <div className="space-y-6">
            
            {/* Responsible Teachers Card */}
            <div className="bg-white dark:bg-[#1a1b22] border border-gray-100 dark:border-gray-800 rounded-3xl p-6 shadow-sm">
              <h3 className="text-base font-black tracking-tight mb-4 flex items-center gap-2">
                <Award className="text-amber-500 animate-bounce-slow" size={20} />
                ครูผู้รับผิดชอบดูแลชุมนุม
              </h3>

              {club.responsibleTeacherIds && club.responsibleTeacherIds.length > 0 ? (
                <div className="space-y-4">
                  {club.responsibleTeacherIds.map((teacherId) => {
                    const teacher = teacherMap?.[teacherId];
                    if (!teacher) {
                      return (
                        <div key={teacherId} className="flex items-center gap-3 p-3 bg-gray-50 dark:bg-gray-800/40 rounded-2xl border border-gray-100 dark:border-gray-800/50">
                          <div className="w-10 h-10 rounded-xl bg-gray-200 dark:bg-gray-700 animate-pulse" />
                          <div className="flex-1 space-y-1.5">
                            <div className="h-3.5 bg-gray-200 dark:bg-gray-700 rounded w-2/3 animate-pulse" />
                            <div className="h-2.5 bg-gray-200 dark:bg-gray-700 rounded w-1/2 animate-pulse" />
                          </div>
                        </div>
                      );
                    }

                    const teacherName = teacher.name || `${teacher.title || ''}${teacher.firstName || ''} ${teacher.lastName || ''}`.trim();
                    return (
                      <div 
                        key={teacherId} 
                        className="flex flex-col gap-3 p-4 bg-gray-50/50 dark:bg-gray-800/10 rounded-2xl border border-gray-100 dark:border-gray-800/50 hover:shadow-sm hover:border-indigo-100 dark:hover:border-indigo-950 transition-all duration-300"
                      >
                        <div className="flex items-center gap-3">
                          <div className="w-11 h-11 rounded-2xl overflow-hidden bg-gray-200 dark:bg-gray-800 border border-white dark:border-[#1a1b22] flex-shrink-0 flex items-center justify-center shadow-sm">
                            {teacher.profileImageUrl ? (
                              <img src={teacher.profileImageUrl} className="w-full h-full object-cover" alt="" />
                            ) : (
                              <span className="text-xs text-gray-500 font-black">ครู</span>
                            )}
                          </div>
                          <div className="min-w-0">
                            <span className="text-xs font-black text-gray-900 dark:text-gray-200 block leading-tight truncate">
                              {teacherName}
                            </span>
                            <span className="text-[10px] font-black text-gray-400 block mt-0.5">
                              รหัสครู: {teacher.teacherId || '-'}
                            </span>
                          </div>
                        </div>

                        {/* Contact information fields */}
                        <div className="text-[10px] font-bold text-gray-500 dark:text-gray-400 space-y-1.5 pt-2 border-t border-gray-100 dark:border-gray-800/50">
                          <div className="flex items-center gap-1.5">
                            <Phone size={11} className="text-gray-400" />
                            <span>เบอร์โทร: {(teacher as any).phone || 'ไม่ระบุ'}</span>
                          </div>
                          <div className="flex items-center gap-1.5">
                            <Mail size={11} className="text-gray-400" />
                            <span className="truncate">อีเมล: {(teacher as any).email || 'ไม่ระบุ'}</span>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="py-8 text-center bg-gray-50/50 dark:bg-gray-900/10 border border-dashed border-gray-100 dark:border-gray-800 rounded-2xl text-xs text-gray-400 italic font-bold">
                  ยังไม่มีการมอบหมายครูผู้ดูแลชุมนุม
                </div>
              )}
            </div>
            
            {/* Quick Action Shortcuts Panel */}
            <div className="bg-white dark:bg-[#1a1b22] border border-gray-100 dark:border-gray-800 rounded-3xl p-6 shadow-sm">
              <h3 className="text-base font-black tracking-tight mb-4 flex items-center gap-2">
                <Bookmark className="text-indigo-500" size={20} />
                เมนูการทำงานอื่นๆ
              </h3>
              
              <div className="space-y-3">
                <Link
                  to="/academic/club-attendance"
                  className="flex items-center justify-between p-3.5 bg-gray-50 hover:bg-indigo-50/50 dark:bg-[#1e1f26]/40 dark:hover:bg-indigo-500/10 rounded-2xl text-xs font-black text-gray-700 dark:text-gray-300 hover:text-indigo-600 dark:hover:text-indigo-400 transition-all border border-transparent hover:border-indigo-100 dark:hover:border-indigo-900/30 group shadow-sm active:scale-98"
                >
                  <span className="flex items-center gap-2">
                    <UserCheck size={16} className="text-indigo-500" />
                    เช็คชื่อเข้าทำกิจกรรมชุมนุม
                  </span>
                  <ArrowUpRight size={14} className="text-gray-400 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-transform" />
                </Link>

                <Link
                  to="/academic/club-reports"
                  className="flex items-center justify-between p-3.5 bg-gray-50 hover:bg-indigo-50/50 dark:bg-[#1e1f26]/40 dark:hover:bg-indigo-500/10 rounded-2xl text-xs font-black text-gray-700 dark:text-gray-300 hover:text-indigo-600 dark:hover:text-indigo-400 transition-all border border-transparent hover:border-indigo-100 dark:hover:border-indigo-900/30 group shadow-sm active:scale-98"
                >
                  <span className="flex items-center gap-2">
                    <FileSpreadsheet size={16} className="text-sky-500" />
                    ออกใบสรุปรายงานชุมนุม
                  </span>
                  <ArrowUpRight size={14} className="text-gray-400 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-transform" />
                </Link>

                <div className="p-4 bg-amber-500/5 rounded-2xl border border-amber-500/10 text-[10px] leading-relaxed text-amber-600/90 dark:text-amber-400/80 font-bold flex items-start gap-2 shadow-inner">
                  <ShieldAlert size={14} className="shrink-0 mt-0.5 text-amber-500" />
                  <div>
                    <h5 className="font-black text-amber-700 dark:text-amber-300 mb-0.5">เงื่อนไขการย้ายชุมนุม</h5>
                    <p>ขณะนี้ระบบ{allowTransfer ? 'เปิดให้' : 'ปิดไม่ให้'}นักเรียนส่งคำร้องขอย้ายชุมนุมด้วยตนเอง ครูวิชาการสามารถจัดการและอนุมัติการย้ายชุมนุมได้ทันทีในระบบสมาชิกชุมนุม</p>
                  </div>
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
