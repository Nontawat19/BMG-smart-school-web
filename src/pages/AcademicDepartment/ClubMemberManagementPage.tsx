import React, { useState, useEffect, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import BackButton from "@/components/Shared/BackButton";
import ProfileAvatar from "@/components/Shared/ProfileAvatar";
import { firestore as db } from '../../firebase';
import { collection, getDocs, doc, query, where, writeBatch, deleteDoc, onSnapshot, orderBy, getDoc, addDoc, updateDoc } from 'firebase/firestore';
import { useSelector, useDispatch } from 'react-redux';
import { RootState } from '@/store';
import MainLayout from "@/layouts/MainLayout";
import { fetchTeachersMap } from '@/store/slices/userMapSlice';
import Swal from 'sweetalert2';
import { formatClassLevelRange, getLevelsByRange, isClassLevelInRange, getClassLevelRank } from '@/utils/schoolUtils';
import {
  Users,
  UserPlus,
  Trash2,
  Search,
  UserCheck,
  CheckCircle2,
  Bell,
  Check,
  X as XIcon,
  AlertCircle
} from 'lucide-react';
import Select from 'react-select';
import SkeletonLoader from "@/components/SkeletonLoader";
import { thaiFormatClass } from './schedule/utils';

const Toast = Swal.mixin({
  toast: true,
  position: 'top-end',
  showConfirmButton: false,
  timer: 2000,
  timerProgressBar: true,
});

interface Club {
  id: string;
  name: string;
  capacity: number;
  responsibleTeacherIds: string[];
  allowedClassLevelFrom?: string;
  allowedClassLevelTo?: string;
  imageUrl?: string;
  memberCount?: number;
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
  status?: 'pending' | 'confirmed';
}

const ClubMemberManagementPage: React.FC = () => {
  const [myClubs, setMyClubs] = useState<Club[]>([]);
  const [selectedClub, setSelectedClub] = useState<Club | null>(null);
  const [memberMeta, setMemberMeta] = useState<Record<string, { status: string }>>({});
  const [allStudents, setAllStudents] = useState<Student[]>([]);
  const [requests, setRequests] = useState<any[]>([]);
  const [studentClubMap, setStudentClubMap] = useState<Record<string, { clubId: string; clubName: string; status?: string }>>({});
  const [loading, setLoading] = useState(true);
  const [studentsLoading, setStudentsLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [studentSearchTerm, setStudentSearchTerm] = useState('');
  const [selectedStudentIds, setSelectedStudentIds] = useState<string[]>([]);
  const [availableLevels, setAvailableLevels] = useState<string[]>([]);
  const [selectedClassLevel, setSelectedClassLevel] = useState('all');
  const [selectedRoom, setSelectedRoom] = useState('all');
  const [globalStartDate, setGlobalStartDate] = useState('');
  const [globalEndDate, setGlobalEndDate] = useState('');
  const [selectedYear, setSelectedYear] = useState('');
  const [selectedTerm, setSelectedTerm] = useState('');
  const [isDarkMode, setIsDarkMode] = useState(false);

  const currentUser = useSelector((state: RootState) => state.auth.user);
  const schoolId = (currentUser as any)?.schoolId;
  const dispatch = useDispatch();
  const [searchParams] = useSearchParams();

  const { teachers: teacherMap, status: teacherMapStatus } = useSelector((state: RootState) => state.userMap);
  const userRoles = useMemo(() => {
    const role = (currentUser as any)?.role;
    return (Array.isArray(role) ? role : [role]).filter(Boolean).map((r: string) => r === 'admin' ? 'school_admin' : String(r).toLowerCase());
  }, [currentUser]);
  const canManageAllClubs = userRoles.some(role => ['school_admin', 'super_admin', 'academic_admin'].includes(role));

  const currentTeacherId = useMemo(() => {
    if (!teacherMap || !currentUser) return null;
    const teacher = Object.values(teacherMap).find((t: any) => t.uid === currentUser.uid);
    return teacher?.id || null;
  }, [teacherMap, currentUser]);

  useEffect(() => {
    if (schoolId && teacherMapStatus === 'idle') {
      dispatch(fetchTeachersMap(schoolId) as any);
    }
  }, [schoolId, teacherMapStatus, dispatch]);

  useEffect(() => {
    const fetchLevels = async () => {
      if (!schoolId) return;
      try {
        const schoolRef = doc(db, "school-settings", schoolId);
        const schoolSnap = await getDoc(schoolRef);
        if (schoolSnap.exists()) {
          const data = schoolSnap.data();
          const levels = getLevelsByRange(data.opportunityExpansionLevel || "");
          setAvailableLevels(levels);
          setSelectedYear(data.currentAcademicYear || '');
          setSelectedTerm(data.currentTerm || '');
        }
      } catch (error) {
        console.error("Error fetching school levels:", error);
      }
    };
    fetchLevels();
  }, [schoolId]);

  useEffect(() => {
    if (!schoolId || (!canManageAllClubs && !currentTeacherId)) return;

    const fetchMyClubs = async () => {
      setLoading(true);
      try {
        const q = canManageAllClubs
          ? query(collection(db, 'school-settings', schoolId, 'clubs'), orderBy('name'))
          : query(
              collection(db, 'school-settings', schoolId, 'clubs'),
              where('responsibleTeacherIds', 'array-contains', currentTeacherId)
            );
        const snap = await getDocs(q);
        const clubsData = snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as Club));
        setMyClubs(clubsData);
        if (clubsData.length === 1) setSelectedClub(clubsData[0]);
      } catch (error) {
        console.error("Error fetching clubs:", error);
      } finally {
        setLoading(false);
      }
    };

    fetchMyClubs();

    const fetchSettings = async () => {
      if (!schoolId) return;
      try {
        const configRef = doc(db, 'school-settings', schoolId, 'configs', 'club_settings');
        const configSnap = await getDoc(configRef);
        if (configSnap.exists()) {
          const data = configSnap.data();
          setGlobalStartDate(data.registrationStartDate || '');
          setGlobalEndDate(data.registrationEndDate || '');
        }
      } catch (error) {
        console.error("Error fetching club settings:", error);
      }
    };
    fetchSettings();
  }, [schoolId, currentTeacherId, canManageAllClubs]);

  useEffect(() => {
    if (!schoolId || !selectedClub) {
      setMemberMeta({});
      return;
    }

    const unsub = onSnapshot(
      collection(db, 'school-settings', schoolId, 'clubs', selectedClub.id, 'members'),
      (snap) => {
        const meta: Record<string, { status: string }> = {};
        snap.docs.forEach(doc => {
          meta[doc.id] = { status: doc.data().status || 'pending' };
        });
        setMemberMeta(meta);
      }
    );

    return () => unsub();
  }, [schoolId, selectedClub?.id]);

  useEffect(() => {
    const clubIdFromNotification = searchParams.get('clubId');
    if (!clubIdFromNotification || myClubs.length === 0) return;

    const requestedClub = myClubs.find(club => club.id === clubIdFromNotification);
    if (requestedClub && selectedClub?.id !== requestedClub.id) {
      setSelectedClub(requestedClub);
    }
  }, [searchParams, myClubs, selectedClub?.id]);

  useEffect(() => {
    if (!schoolId || myClubs.length === 0) {
      setRequests([]);
      return;
    }

    const q = query(
      collection(db, 'school-settings', schoolId, 'club_requests'),
      where('status', '==', 'pending')
    );

    const unsub = onSnapshot(q, (snap) => {
      const clubIds = new Set(myClubs.map(c => c.id));
      const allReqs = snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as any));

      const filtered = allReqs.filter(req => {
        const isTarget = clubIds.has(req.targetClubId) && req.entryStatus === 'pending';
        const isCurrent = clubIds.has(req.currentClubId) && req.exitStatus === 'pending';
        return isTarget || isCurrent;
      });

      setRequests(filtered);
    });

    return () => unsub();
  }, [schoolId, myClubs]);

  useEffect(() => {
    const checkDark = () => {
      setIsDarkMode(document.documentElement.classList.contains('dark'));
    };
    checkDark();
    const observer = new MutationObserver(checkDark);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!schoolId) return;

    const q = query(collection(db, 'school-settings', schoolId, 'students'), orderBy('studentId'));
    const unsub = onSnapshot(q, (snap) => {
      setAllStudents(snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as Student)));
      setStudentsLoading(false);
    });

    return () => unsub();
  }, [schoolId]);

  const members = useMemo(() => {
    const memberIds = Object.keys(memberMeta);
    return allStudents
      .filter(s => memberIds.includes(s.id))
      .map(s => ({
        ...s,
        status: memberMeta[s.id]?.status
      }))
      .sort((a, b) => {
        const rankA = getClassLevelRank(a.classLevel);
        const rankB = getClassLevelRank(b.classLevel);
        if (rankA !== rankB) return rankA - rankB;
        const roomA = parseInt(a.room) || 0;
        const roomB = parseInt(b.room) || 0;
        if (roomA !== roomB) return roomA - roomB;
        return a.studentId.localeCompare(b.studentId);
      });
  }, [allStudents, memberMeta]);

  useEffect(() => {
    if (!schoolId || myClubs.length === 0) {
      setStudentClubMap({});
      return;
    }

    const fetchMembershipMap = async () => {
      try {
        const map: Record<string, { clubId: string; clubName: string; status: string }> = {};
        await Promise.all(myClubs.map(async (club) => {
          const snap = await getDocs(collection(db, 'school-settings', schoolId, 'clubs', club.id, 'members'));
          snap.docs.forEach(memberDoc => {
            map[memberDoc.id] = { 
              clubId: club.id, 
              clubName: club.name,
              status: memberDoc.data().status || 'pending'
            };
          });
        }));
        setStudentClubMap(map);
      } catch (error) {
        console.error("Error fetching club membership map:", error);
      }
    };

    fetchMembershipMap();
  }, [schoolId, myClubs]);

  const selectStyles = useMemo(() => ({
    control: (base: any) => ({
      ...base,
      minHeight: '38px',
      height: '38px',
      borderRadius: '12px',
      backgroundColor: isDarkMode ? 'rgba(255,255,255,0.03)' : 'rgba(249, 250, 251, 0.8)',
      borderColor: isDarkMode ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)',
      fontWeight: '800',
      fontSize: '12px',
      boxShadow: 'none',
      '&:hover': { borderColor: '#4f46e5' }
    }),
    menuPortal: (base: any) => ({ ...base, zIndex: 9999 }),
    menu: (base: any) => ({
      ...base,
      backgroundColor: isDarkMode ? '#1a1b1e' : 'white',
      border: isDarkMode ? '1px solid rgba(255,255,255,0.1)' : '1px solid rgba(0,0,0,0.1)',
      borderRadius: '16px',
      overflow: 'hidden',
      boxShadow: '0 10px 30px rgba(0,0,0,0.2)',
      zIndex: 100,
      minWidth: '100%',
      width: 'max-content'
    }),
    option: (base: any, { isFocused, isSelected }: any) => ({
      ...base,
      backgroundColor: isSelected
        ? '#4f46e5'
        : isFocused
          ? isDarkMode ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)'
          : 'transparent',
      color: isDarkMode ? 'white' : 'black',
      cursor: 'pointer',
      padding: '8px 12px',
      margin: '2px 8px',
      borderRadius: '8px',
      width: 'calc(100% - 16px)',
      fontSize: '12px',
      fontWeight: '700',
      whiteSpace: 'nowrap',
      overflow: 'hidden',
      textOverflow: 'ellipsis'
    }),
    singleValue: (base: any) => ({ ...base, color: isDarkMode ? 'white' : 'black' }),
    input: (base: any) => ({ ...base, color: isDarkMode ? 'white' : 'black' }),
    placeholder: (base: any) => ({ ...base, color: isDarkMode ? 'rgba(255,255,255,0.4)' : 'rgba(0,0,0,0.4)' }),
  }), [isDarkMode]);

  const getRegistrationStatus = (): { text: string; color: string } => {
    const now = new Date();
    now.setHours(0, 0, 0, 0);
    if (globalStartDate && globalEndDate) {
      const start = new Date(globalStartDate);
      const end = new Date(globalEndDate);
      end.setHours(23, 59, 59, 999);
      if (now >= start && now <= end) return { text: 'เปิดรับสมัคร', color: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300' };
      if (now < start) return { text: 'ยังไม่เปิด', color: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300' };
      return { text: 'ปิดรับสมัคร', color: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300' };
    }
    return { text: '', color: '' };
  };
  const filteredAvailableStudents = useMemo(() => {
    return allStudents.filter(s => {
      if (members.some(m => m.id === s.id)) return false;
      const matchLevel = selectedClassLevel === 'all' || s.classLevel === selectedClassLevel;
      const matchRoom = selectedRoom === 'all' || s.room === selectedRoom;
      const fullName = `${s.title || ''}${s.firstName} ${s.lastName}`.toLowerCase();
      const matchSearch = fullName.includes(studentSearchTerm.toLowerCase()) ||
                          s.studentId.includes(studentSearchTerm);
      return matchLevel && matchRoom && matchSearch;
    })
    .sort((a, b) => {
      const rankA = getClassLevelRank(a.classLevel);
      const rankB = getClassLevelRank(b.classLevel);
      if (rankA !== rankB) return rankA - rankB;
      const roomA = parseInt(a.room) || 0;
      const roomB = parseInt(b.room) || 0;
      if (roomA !== roomB) return roomA - roomB;
      return a.studentId.localeCompare(b.studentId);
    })
    .slice(0, 100);
  }, [allStudents, members, selectedClassLevel, selectedRoom, studentSearchTerm]);

  const handleAddMember = async (student: Student) => {
    if (!selectedClub || !schoolId) return;
    if (!isClassLevelInRange(student.classLevel, selectedClub.allowedClassLevelFrom, selectedClub.allowedClassLevelTo)) {
      Swal.fire('ผิดพลาด', `ระดับชั้นไม่ตรงกับช่วงที่กำหนด (${formatClassLevelRange(selectedClub.allowedClassLevelFrom, selectedClub.allowedClassLevelTo)})`, 'error');
      return;
    }
    if (members.length >= selectedClub.capacity) {
      Swal.fire('ผิดพลาด', 'ชุมนุมนี้เต็มแล้ว', 'error');
      return;
    }
    try {
      const isAlreadyInAnyClub = studentClubMap[student.id];
      if (isAlreadyInAnyClub) {
        if (!canManageAllClubs && isAlreadyInAnyClub.status === 'confirmed') {
          Swal.fire('ไม่อนุญาต', `นักเรียนถูกอนุมัติในชุมนุม "${isAlreadyInAnyClub.clubName}" แล้ว ไม่สามารถย้ายได้ ต้องให้ผู้ดูแลระบบเป็นผู้จัดการเท่านั้น`, 'warning');
          return;
        }

        const result = await Swal.fire({
          title: 'ยืนยันการย้ายชุมนุม',
          text: `นักเรียนอยู่ในชุมนุม "${isAlreadyInAnyClub.clubName}" แล้ว ต้องการย้ายมา "${selectedClub.name}" หรือไม่?`,
          icon: 'warning',
          showCancelButton: true,
          confirmButtonText: 'ย้ายทันที',
          cancelButtonText: 'ยกเลิก'
        });
        if (!result.isConfirmed) return;
        await deleteDoc(doc(db, 'school-settings', schoolId, 'clubs', isAlreadyInAnyClub.clubId, 'members', student.id));
      }
      const batch = writeBatch(db);
      const memberRef = doc(db, 'school-settings', schoolId, 'clubs', selectedClub.id, 'members', student.id);
      batch.set(memberRef, { 
        joinedAt: new Date().toISOString(),
        status: 'confirmed' 
      });
      
      const clubRef = doc(db, 'school-settings', schoolId, 'clubs', selectedClub.id);
      batch.update(clubRef, { memberCount: (selectedClub.memberCount || 0) + 1 });

      await batch.commit();
      Toast.fire({ icon: 'success', title: 'เพิ่มสมาชิกเรียบร้อยแล้ว' });
    } catch (error) {
      console.error("Error adding member:", error);
      Swal.fire('ผิดพลาด', 'ไม่สามารถเพิ่มสมาชิกได้', 'error');
    }
  };

  const handleConfirmMember = async (studentId: string) => {
    if (!selectedClub || !schoolId) return;
    try {
      const memberRef = doc(db, 'school-settings', schoolId, 'clubs', selectedClub.id, 'members', studentId);
      await updateDoc(memberRef, { status: 'confirmed' });
      Toast.fire({ icon: 'success', title: 'อนุมัติสมาชิกเรียบร้อยแล้ว' });
    } catch (error) {
      console.error("Error confirming member:", error);
      Swal.fire('ผิดพลาด', 'ไม่สามารถอนุมัติได้', 'error');
    }
  };

  const handleBulkAdd = async () => {
    if (!selectedClub || !schoolId || selectedStudentIds.length === 0) return;
    const remainingCapacity = selectedClub.capacity - members.length;
    if (selectedStudentIds.length > remainingCapacity) {
      Swal.fire('ผิดพลาด', `ชุมนุมนี้เหลือที่ว่างเพียง ${remainingCapacity} ที่`, 'error');
      return;
    }

    const result = await Swal.fire({
      title: 'ยืนยันการเพิ่มสมาชิก',
      text: `ต้องการเพิ่มนักเรียนที่เลือกทั้ง ${selectedStudentIds.length} คน เข้าสู่ชุมนุมหรือไม่?`,
      icon: 'question',
      showCancelButton: true,
      confirmButtonText: 'เพิ่มสมาชิก',
      cancelButtonText: 'ยกเลิก'
    });
    if (!result.isConfirmed) return;
    try {
      const batch = writeBatch(db);
      const studentsToAdd = filteredAvailableStudents.filter(s => selectedStudentIds.includes(s.id));
      for (const student of studentsToAdd) {
        const isAlreadyInAnyClub = studentClubMap[student.id];
        if (isAlreadyInAnyClub) {
          batch.delete(doc(db, 'school-settings', schoolId, 'clubs', isAlreadyInAnyClub.clubId, 'members', student.id));
        }
        batch.set(doc(db, 'school-settings', schoolId, 'clubs', selectedClub.id, 'members', student.id), {
          joinedAt: new Date().toISOString(),
          status: 'confirmed'
        });
      }
      const clubRef = doc(db, 'school-settings', schoolId, 'clubs', selectedClub.id);
      batch.update(clubRef, { memberCount: (selectedClub.memberCount || 0) + studentsToAdd.length });
      await batch.commit();
      setSelectedStudentIds([]);
      Toast.fire({ icon: 'success', title: `เพิ่มสมาชิก ${studentsToAdd.length} คนเรียบร้อยแล้ว` });
    } catch (error) {
      console.error(error);
      Swal.fire('ผิดพลาด', 'ไม่สามารถเพิ่มสมาชิกแบบกลุ่มได้', 'error');
    }
  };

  const handleRemoveMember = async (studentId: string) => {
    if (!selectedClub || !schoolId) return;
    
    const targetMember = members.find(m => m.id === studentId);
    if (!canManageAllClubs && targetMember?.status === 'confirmed') {
      Swal.fire('ไม่อนุญาต', 'สมาชิกถูกอนุมัติแล้ว ต้องให้ผู้ดูแลระบบเป็นผู้ลบออกเท่านั้น', 'warning');
      return;
    }

    const result = await Swal.fire({
      title: 'ยืนยันการลบ',
      text: 'ต้องการลบนักเรียนออกจากชุมนุมใช่หรือไม่?',
      icon: 'warning',
      showCancelButton: true,
      confirmButtonText: 'ลบออก',
      cancelButtonText: 'ยกเลิก',
      confirmButtonColor: '#ef4444'
    });
    if (!result.isConfirmed) return;

    try {
      const batch = writeBatch(db);
      batch.delete(doc(db, 'school-settings', schoolId, 'clubs', selectedClub.id, 'members', studentId));
      const clubRef = doc(db, 'school-settings', schoolId, 'clubs', selectedClub.id);
      batch.update(clubRef, { memberCount: Math.max(0, (selectedClub.memberCount || 0) - 1) });
      await batch.commit();
      Toast.fire({ icon: 'success', title: 'ลบสมาชิกเรียบร้อยแล้ว' });
    } catch (error) {
      console.error(error);
      Swal.fire('ผิดพลาด', 'ไม่สามารถลบสมาชิกได้', 'error');
    }
  };

  const handleProcessRequest = async (request: any, action: 'approve' | 'reject') => {
    if (!schoolId) return;

    const clubIds = new Set(myClubs.map(c => c.id));
    const isCurrentClubOwner = clubIds.has(request.currentClubId);
    const isTargetClubOwner = clubIds.has(request.targetClubId);
    const targetClub = myClubs.find(c => c.id === request.targetClubId);

    if (
      action === 'approve' &&
      isTargetClubOwner &&
      targetClub &&
      !isClassLevelInRange(request.classLevel, targetClub.allowedClassLevelFrom, targetClub.allowedClassLevelTo)
    ) {
      Swal.fire(
        'ไม่อยู่ในช่วงระดับชั้น',
        `คำขอนี้ไม่ตรงกับช่วง ${formatClassLevelRange(targetClub.allowedClassLevelFrom, targetClub.allowedClassLevelTo)} ของชุมนุม`,
        'warning'
      );
      return;
    }

    const result = await Swal.fire({
      title: action === 'approve' ? 'ยืนยันการอนุมัติ?' : 'ยืนยันการปฏิเสธ?',
      text: `คำขอของ ${request.studentName}`,
      icon: 'question',
      showCancelButton: true,
      confirmButtonText: action === 'approve' ? 'ตกลง' : 'ปฏิเสธ',
      cancelButtonText: 'ยกเลิก',
      confirmButtonColor: action === 'approve' ? '#10b981' : '#ef4444'
    });

    if (!result.isConfirmed) return;

    try {
      const reqRef = doc(db, 'school-settings', schoolId, 'club_requests', request.id);
      const updates: any = { updatedAt: new Date() };

      if (action === 'reject') {
        updates.status = 'rejected';
        await writeBatch(db).update(reqRef, updates).commit();
        Toast.fire({ icon: 'success', title: 'ดำเนินการแล้ว' });
        return;
      }

      let newExitStatus = request.exitStatus;
      let newEntryStatus = request.entryStatus;

      if (isCurrentClubOwner) newExitStatus = 'approved';
      if (isTargetClubOwner) newEntryStatus = 'approved';

      updates.exitStatus = newExitStatus;
      updates.entryStatus = newEntryStatus;

      if (newExitStatus === 'approved' && newEntryStatus === 'approved') {
        updates.status = 'approved';
        const batch = writeBatch(db);
        if (request.currentClubId) {
          const oldMemberRef = doc(db, 'school-settings', schoolId, 'clubs', request.currentClubId, 'members', request.studentId);
          batch.delete(oldMemberRef);
        }
        const newMemberRef = doc(db, 'school-settings', schoolId, 'clubs', request.targetClubId, 'members', request.studentId);
        batch.set(newMemberRef, {
          joinedAt: new Date().toISOString(),
          status: 'confirmed',
          addedBy: currentUser?.uid,
          requestRef: request.id
        });
        batch.update(reqRef, updates);
        await batch.commit();
      } else {
        await writeBatch(db).update(reqRef, updates).commit();
      }
      Toast.fire({ icon: 'success', title: 'ดำเนินการแล้ว' });
    } catch (error) {
      console.error(error);
      Swal.fire('ผิดพลาด', 'ไม่สามารถดำเนินการได้', 'error');
    }
  };

  return (
    <MainLayout>
      <div className="p-4 sm:p-8 w-full h-[calc(100vh-60px)] flex flex-col overflow-hidden text-gray-900 dark:text-white">

        <section className="bg-white/50 dark:bg-[#161a27]/50 backdrop-blur-xl border border-slate-200 dark:border-white/5 rounded-[24px] p-2.5 shadow-sm mb-4 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <BackButton to="/academic/hub/activities" />
            <div className="flex items-center gap-2 pr-4 border-r border-slate-200 dark:border-white/10">
              <div className="p-1.5 bg-violet-600 rounded-lg text-white shadow-sm">
                <Users size={16} />
              </div>
              <h1 className="text-sm font-black tracking-tight text-slate-900 dark:text-white whitespace-nowrap">
                จัดการสมาชิกชุมนุม
              </h1>
            </div>
            
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2 min-w-[260px]">
                <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest">ชุมนุม:</span>
                <Select
                  options={myClubs.map(c => ({ value: c.id, label: c.name, club: c }))}
                  value={selectedClub ? { value: selectedClub.id, label: selectedClub.name } : null}
                  onChange={(opt: any) => setSelectedClub(opt?.club || null)}
                  placeholder="เลือกชุมนุม..."
                  styles={{
                    ...selectStyles,
                    control: (base: any) => ({ ...base, minHeight: '30px', height: '30px', borderRadius: '8px' }),
                    valueContainer: (base: any) => ({ ...base, padding: '0 8px' }),
                    dropdownIndicator: (base: any) => ({ ...base, padding: '2px' }),
                  }}
                  isSearchable
                  menuPortalTarget={document.body}
                />
              </div>
              
              {getRegistrationStatus().text && (
                <div className={`px-2.5 py-1 rounded-lg flex items-center gap-2 border border-current opacity-80 ${getRegistrationStatus().color}`}>
                  <span className="text-[10px] font-black whitespace-nowrap">{getRegistrationStatus().text}</span>
                </div>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2">
            <div className="px-3 py-1 bg-violet-500/10 border border-violet-500/20 rounded-lg">
              <span className="text-[10px] font-black text-violet-600 dark:text-violet-400">
                {selectedClub ? `${members.length} / ${selectedClub.capacity}` : '0 / 0'} คน
              </span>
            </div>
          </div>
        </section>

        {loading ? (
          <div className="grid grid-cols-2 gap-4 h-full flex-1">
            <SkeletonLoader height="100%" borderRadius="24px" /><SkeletonLoader height="100%" borderRadius="24px" />
          </div>
        ) : !selectedClub ? (
          <div className="flex-1 flex items-center justify-center bg-white/50 dark:bg-[#161a27]/50 backdrop-blur-xl rounded-[32px] border-2 border-dashed border-slate-200 dark:border-white/5 m-4">
            <div className="text-center space-y-4">
              <div className="w-24 h-24 bg-violet-500/10 rounded-3xl flex items-center justify-center mx-auto text-violet-500 animate-pulse">
                <Users size={48} strokeWidth={1.5} />
              </div>
              <div className="space-y-2">
                <h3 className="text-xl font-black text-slate-800 dark:text-white">กรุณาเลือกชุมนุม</h3>
                <p className="text-slate-500 dark:text-slate-400 max-w-xs mx-auto text-sm font-medium">เลือกชุมนุมจากเมนูด้านบนเพื่อเริ่มต้นจัดการสมาชิก</p>
              </div>
            </div>
          </div>
        ) : (
          <div className="flex-1 flex flex-col gap-4 overflow-hidden min-h-0">
            {requests.length > 0 && (
              <div className="bg-amber-500/5 dark:bg-amber-500/5 border border-amber-500/20 rounded-[20px] p-3 flex items-center justify-between gap-4 animate-in fade-in slide-in-from-top-4 duration-500">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-amber-500/20 text-amber-600 flex items-center justify-center">
                    <Bell className="animate-bounce" size={20} />
                  </div>
                  <div>
                    <h3 className="text-[12px] font-black text-amber-700 dark:text-amber-400 leading-none">คำขอที่รอดำเนินการ ({requests.length})</h3>
                    <p className="text-[10px] text-amber-600/70 dark:text-amber-500/70 font-bold mt-1 uppercase tracking-tight">กรุณาตรวจสอบและอนุมัติคำขอข้ามชุมนุม</p>
                  </div>
                </div>
                <div className="flex gap-2 overflow-x-auto pb-1 max-w-2xl custom-scrollbar">
                  {requests.map(req => (
                    <div key={req.id} className="flex-shrink-0 bg-white dark:bg-gray-900 border border-amber-500/20 rounded-xl p-2.5 flex items-center gap-4 shadow-sm hover:border-amber-500/40 transition-colors">
                      <div className="min-w-[120px]">
                        <p className="text-[11px] font-black text-slate-800 dark:text-white leading-none truncate">{req.studentName}</p>
                        <p className="text-[9px] font-bold text-amber-600/80 mt-1 truncate">
                          {myClubs.some(c => c.id === req.currentClubId) ? `ย้ายออกจาก: ${req.currentClubName}` : `ขอเข้า: ${req.targetClubName}`}
                        </p>
                      </div>
                      <div className="flex gap-1.5">
                        <button onClick={() => handleProcessRequest(req, 'approve')} className="p-1.5 bg-emerald-500/10 text-emerald-600 hover:bg-emerald-600 hover:text-white rounded-lg transition-all"><Check size={14} /></button>
                        <button onClick={() => handleProcessRequest(req, 'reject')} className="p-1.5 bg-rose-500/10 text-rose-600 hover:bg-rose-600 hover:text-white rounded-lg transition-all"><XIcon size={14} /></button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
            <div className="flex-1 flex flex-col lg:flex-row gap-4 overflow-hidden min-h-0">
              {/* STUDENT LIST (SOURCE POOL) - LEFT */}
              <div className="flex-[0.9] flex flex-col bg-white dark:bg-[#161a27] rounded-[24px] border border-slate-200 dark:border-white/5 overflow-hidden shadow-sm">
                <div className="px-6 py-4 border-b border-slate-100 dark:border-white/5 space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className="p-2 bg-emerald-600 rounded-xl text-white shadow-lg shadow-emerald-600/20"><UserPlus size={16} /></div>
                      <div>
                        <h3 className="text-xs font-black text-slate-900 dark:text-white leading-none">รายชื่อนักเรียน</h3>
                        <p className="text-[10px] text-slate-400 font-bold mt-1 uppercase tracking-wider">
                          เลือกจากชั้น {selectedClassLevel === 'all' ? 'ทุกชั้น' : thaiFormatClass(selectedClassLevel)} / {selectedRoom === 'all' ? 'ทุกห้อง' : `ห้อง ${selectedRoom}`}
                        </p>
                      </div>
                    </div>
                    {selectedStudentIds.length > 0 && (
                      <button 
                        onClick={handleBulkAdd}
                        className="px-3 py-1.5 bg-emerald-500 hover:bg-emerald-600 text-white rounded-lg text-[10px] font-black shadow-lg shadow-emerald-500/20 hover:scale-105 active:scale-95 transition-all"
                      >
                        เพิ่มสมาชิกที่เลือก ({selectedStudentIds.length})
                      </button>
                    )}
                  </div>

                  <div className="flex flex-col sm:flex-row gap-2">
                    <div className="flex-1 grid grid-cols-2 gap-2">
                      <Select
                        options={[{ value: 'all', label: 'ทุกชั้น' }, ...availableLevels.map(l => ({ value: l, label: thaiFormatClass(l) }))]}
                        value={{ value: selectedClassLevel, label: selectedClassLevel === 'all' ? 'ทุกชั้น' : thaiFormatClass(selectedClassLevel) }}
                        onChange={(opt: any) => setSelectedClassLevel(opt.value)}
                        styles={{
                          ...selectStyles,
                          control: (base: any) => ({ ...base, minHeight: '34px', height: '34px', borderRadius: '10px' }),
                          valueContainer: (base: any) => ({ ...base, padding: '0 8px' }),
                          singleValue: (base: any) => ({ ...base, fontSize: '11px', fontWeight: 800 }),
                        }}
                        isSearchable={false}
                        menuPortalTarget={document.body}
                      />
                      <Select
                        options={[{ value: 'all', label: 'ทุกห้อง' }, ...Array.from({ length: 20 }, (_, i) => ({ value: String(i + 1), label: `ห้อง ${i + 1}` }))]}
                        value={{ value: selectedRoom, label: selectedRoom === 'all' ? 'ทุกห้อง' : `ห้อง ${selectedRoom}` }}
                        onChange={(opt: any) => setSelectedRoom(opt.value)}
                        styles={{
                          ...selectStyles,
                          control: (base: any) => ({ ...base, minHeight: '34px', height: '34px', borderRadius: '10px' }),
                          valueContainer: (base: any) => ({ ...base, padding: '0 8px' }),
                          singleValue: (base: any) => ({ ...base, fontSize: '11px', fontWeight: 800 }),
                        }}
                        isSearchable={false}
                        menuPortalTarget={document.body}
                      />
                    </div>
                    <div className="relative flex-1">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={13} />
                      <input 
                        type="text" 
                        placeholder="ค้นหาชื่อ หรือเลขประจำตัว..." 
                        value={studentSearchTerm} 
                        onChange={(e) => setStudentSearchTerm(e.target.value)} 
                        className="w-full pl-9 pr-3 py-2 bg-slate-50 dark:bg-white/5 border border-slate-100 dark:border-white/5 rounded-xl text-[11px] font-bold focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all outline-none" 
                      />
                    </div>
                  </div>
                </div>

                {/* TABLE HEADER */}
                <div className="px-6 py-2 bg-slate-50 dark:bg-white/5 border-b border-slate-100 dark:border-white/5 grid grid-cols-[28px,1fr,110px,55px,36px] items-center text-[9px] font-black text-slate-400 uppercase tracking-widest">
                  <div className="flex justify-center">
                    <input 
                      type="checkbox" 
                      checked={selectedStudentIds.length === filteredAvailableStudents.length && filteredAvailableStudents.length > 0}
                      onChange={(e) => {
                        if (e.target.checked) {
                          setSelectedStudentIds(filteredAvailableStudents.map(s => s.id));
                        } else {
                          setSelectedStudentIds([]);
                        }
                      }}
                      className="w-3 h-3 rounded border-slate-300 text-emerald-500 focus:ring-emerald-500 cursor-pointer"
                    />
                  </div>
                  <span>รหัส / รายชื่อนักเรียน</span>
                  <span className="text-center">สถานะชุมนุม</span>
                  <span className="text-center">ชั้น/ห้อง</span>
                  <span className="text-right">เพิ่ม</span>
                </div>

                <div className="flex-1 overflow-y-auto px-4 py-2 custom-scrollbar">
                  {studentsLoading ? (
                    <div className="p-2 space-y-1">
                      <SkeletonLoader height="50px" borderRadius="12px" />
                      <SkeletonLoader height="50px" borderRadius="12px" />
                      <SkeletonLoader height="50px" borderRadius="12px" />
                    </div>
                  ) : filteredAvailableStudents.length === 0 ? (
                    <div className="h-full flex flex-col items-center justify-center text-slate-400 space-y-2 opacity-40">
                      <Search size={24} strokeWidth={1} />
                      <p className="text-[9px] font-black uppercase tracking-widest">ไม่พบนักเรียน</p>
                    </div>
                  ) : (
                    filteredAvailableStudents.map(student => (
                      <div 
                        key={student.id} 
                        onClick={() => {
                          setSelectedStudentIds(prev => 
                            prev.includes(student.id) ? prev.filter(id => id !== student.id) : [...prev, student.id]
                          );
                        }}
                        className={`group grid grid-cols-[28px,1fr,110px,55px,36px] items-center py-1.5 px-2.5 rounded-xl transition-all border mb-1.5 cursor-pointer ${
                          selectedStudentIds.includes(student.id) 
                            ? 'bg-emerald-500/10 border-emerald-500/20' 
                            : 'bg-transparent border-transparent hover:bg-slate-50 dark:hover:bg-white/5'
                        }`}
                      >
                        <div className="flex justify-center" onClick={(e) => e.stopPropagation()}>
                          <input 
                            type="checkbox" 
                            checked={selectedStudentIds.includes(student.id)}
                            onChange={(e) => {
                              setSelectedStudentIds(prev => 
                                e.target.checked ? [...prev, student.id] : prev.filter(id => id !== student.id)
                              );
                            }}
                            className="w-3.5 h-3.5 rounded border-slate-300 text-emerald-500 focus:ring-emerald-500 cursor-pointer"
                          />
                        </div>

                        <div className="flex items-center gap-3 min-w-0">
                          <ProfileAvatar 
                            src={student.profileImageUrl || `https://ui-avatars.com/api/?name=${student.firstName}&background=6366f1&color=fff`} 
                            className="w-8 h-8 rounded-full shadow-sm border border-slate-100 dark:border-white/5 shrink-0" 
                          />
                          <div className="flex-1 min-w-0 flex items-center gap-2">
                            <span className="text-[10px] text-slate-400 font-bold bg-slate-100 dark:bg-white/10 px-1.5 py-0.5 rounded shrink-0">
                              {student.studentId}
                            </span>
                            <p className="text-[12px] font-black text-slate-900 dark:text-white truncate">
                              {student.title || ''}{student.firstName} {student.lastName}
                            </p>
                          </div>
                        </div>

                        <div className="flex justify-center min-w-0">
                          {studentClubMap[student.id] ? (
                            <span 
                              className="px-2.5 py-1 rounded-full text-[10px] font-black bg-violet-500/10 text-violet-600 dark:bg-violet-500/20 dark:text-violet-400 whitespace-nowrap truncate max-w-[130px] text-center" 
                              title={studentClubMap[student.id].clubName}
                            >
                              {studentClubMap[student.id].clubName}
                            </span>
                          ) : (
                            <span className="px-2.5 py-1 rounded-full text-[10px] font-black bg-slate-100 text-slate-400 dark:bg-white/10 dark:text-slate-500 whitespace-nowrap text-center">
                              ยังไม่มีชุมนุม
                            </span>
                          )}
                        </div>

                        <div className="text-center">
                          <span className="text-[11px] font-black text-slate-500 dark:text-slate-400">
                            {thaiFormatClass(student.classLevel)}/{student.room}
                          </span>
                        </div>

                        <div className="flex justify-end">
                          <button 
                            onClick={(e) => {
                              e.stopPropagation();
                              handleAddMember(student);
                            }} 
                            disabled={members.length >= (selectedClub?.capacity || 0)} 
                            className="p-2 text-emerald-500 hover:bg-emerald-500 hover:text-white disabled:opacity-30 rounded-xl transition-all"
                          >
                            <UserPlus size={16} />
                          </button>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>

              {/* CLUB MEMBER LIST - RIGHT */}
              <div className="flex-[1.1] flex flex-col bg-white dark:bg-[#161a27] rounded-[24px] border border-slate-200 dark:border-white/5 overflow-hidden shadow-sm">
                <div className="px-6 py-4 border-b border-slate-100 dark:border-white/5 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-violet-600 rounded-xl text-white shadow-lg shadow-violet-600/20"><UserCheck size={16} /></div>
                    <div>
                      <h3 className="text-xs font-black text-slate-900 dark:text-white leading-none">นักเรียนในชุมนุม</h3>
                      <p className="text-[10px] text-slate-400 font-bold mt-1 uppercase tracking-wider">{selectedClub.name}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="px-2.5 py-1 bg-violet-500/10 border border-violet-500/20 rounded-full">
                      <span className="text-[10px] font-black text-violet-600 dark:text-violet-400">
                        {members.length} / {selectedClub.capacity} คน
                      </span>
                    </div>
                  </div>
                </div>

                <div className="px-6 py-3 bg-slate-50/50 dark:bg-white/3 border-b border-slate-100 dark:border-white/5">
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={13} />
                    <input 
                      type="text" 
                      placeholder="ค้นหาในชุมนุม..." 
                      value={searchTerm} 
                      onChange={(e) => setSearchTerm(e.target.value)} 
                      className="w-full pl-9 pr-3 py-1.5 bg-slate-50 dark:bg-white/5 border border-slate-100 dark:border-white/5 rounded-xl text-[11px] font-bold focus:ring-2 focus:ring-violet-500/20 focus:border-violet-500 transition-all outline-none" 
                    />
                  </div>
                </div>

                {/* TABLE HEADER */}
                <div className="px-6 py-2 bg-slate-50 dark:bg-white/5 border-b border-slate-100 dark:border-white/5 grid grid-cols-[1fr,70px,44px] items-center text-[9px] font-black text-slate-400 uppercase tracking-widest">
                  <span>รหัส / รายชื่อนักเรียน</span>
                  <span className="text-center">ชั้น/ห้อง</span>
                  <span className="text-right">จัดการ</span>
                </div>

                <div className="flex-1 overflow-y-auto px-4 py-2 custom-scrollbar">
                  {members.filter(m => `${m.title || ''}${m.firstName} ${m.lastName} ${m.studentId}`.toLowerCase().includes(searchTerm.toLowerCase())).length === 0 ? (
                    <div className="h-full flex flex-col items-center justify-center text-slate-400 space-y-2 opacity-40">
                      <Users size={32} strokeWidth={1} />
                      <p className="text-[10px] font-black uppercase tracking-widest">ยังไม่มีสมาชิก</p>
                    </div>
                  ) : (
                    members.filter(m => `${m.title || ''}${m.firstName} ${m.lastName} ${m.studentId}`.toLowerCase().includes(searchTerm.toLowerCase())).map(member => (
                      <div 
                        key={member.id} 
                        className="group grid grid-cols-[1fr,70px,44px] items-center py-1.5 px-2.5 rounded-xl hover:bg-violet-500/5 transition-all border border-transparent hover:border-violet-500/10 mb-1.5"
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <ProfileAvatar 
                            src={member.profileImageUrl || `https://ui-avatars.com/api/?name=${member.firstName}&background=6366f1&color=fff`} 
                            className="w-8 h-8 rounded-full shadow-sm border border-slate-100 dark:border-white/5 shrink-0" 
                          />
                          <div className="flex-1 min-w-0 flex items-center gap-2">
                            <span className="text-[10px] text-slate-400 font-bold bg-slate-100 dark:bg-white/10 px-1.5 py-0.5 rounded shrink-0">
                              {member.studentId}
                            </span>
                            <p className="text-[12px] font-black text-slate-900 dark:text-white truncate">
                              {member.title || ''}{member.firstName} {member.lastName}
                            </p>
                          </div>
                        </div>
                        
                        <div className="text-center flex flex-col items-center gap-1">
                          <span className="text-[11px] font-black text-slate-500 dark:text-slate-400">
                            {thaiFormatClass(member.classLevel)}/{member.room}
                          </span>
                          <div className={`px-2 py-0.5 rounded-full text-[8px] font-black uppercase tracking-tighter ${
                            member.status === 'confirmed' 
                              ? 'bg-emerald-100 text-emerald-600 dark:bg-emerald-500/20 dark:text-emerald-400' 
                              : 'bg-amber-100 text-amber-600 dark:bg-amber-500/20 dark:text-amber-400'
                          }`}>
                            {member.status === 'confirmed' ? 'อนุมัติแล้ว' : 'รออนุมัติ'}
                          </div>
                        </div>
                        
                        <div className="flex items-center justify-end gap-1">
                          {member.status === 'pending' && (
                            <button 
                              onClick={() => handleConfirmMember(member.id)}
                              title="ยืนยันผู้สมัคร"
                              className="p-1.5 text-emerald-500 hover:bg-emerald-500 hover:text-white rounded-lg transition-all shadow-sm shrink-0"
                            >
                              <CheckCircle2 size={15} />
                            </button>
                          )}
                          <button 
                            onClick={() => handleRemoveMember(member.id)} 
                            disabled={!canManageAllClubs && member.status === 'confirmed'}
                            className={`p-1.5 rounded-lg transition-all shadow-sm shrink-0 ${
                              !canManageAllClubs && member.status === 'confirmed'
                              ? 'text-slate-300 dark:text-slate-700 cursor-not-allowed'
                              : 'text-rose-400 hover:bg-rose-500 hover:text-white'
                            }`}
                          >
                            <Trash2 size={15} />
                          </button>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </MainLayout>
  );
};

export default ClubMemberManagementPage;
