import React, { useState, useEffect, useMemo } from 'react';
import { Link } from 'react-router-dom';
import BackButton from "@/components/Shared/BackButton";
import { firestore as db } from '../../firebase';
import { collection, getDocs, doc, getDoc, setDoc, query, where, Timestamp } from 'firebase/firestore';
import { useSelector, useDispatch } from 'react-redux';
import { RootState } from '@/store';
import MainLayout from "@/layouts/MainLayout";
import { fetchTeachersMap } from '@/store/slices/userMapSlice';
import { fetchCalendar } from '@/store/slices/calendarSlice';
import Swal from 'sweetalert2';
import {
  Users,
  ClipboardCheck,
  Calendar,
  Clock,
  ChevronLeft,
  Save,
  AlertCircle,
  CheckCircle2,
  LayoutGrid,
  RefreshCw
} from 'lucide-react';
import SkeletonLoader from "@/components/SkeletonLoader";

interface Club {
  id: string;
  name: string;
  responsibleTeacherIds: string[];
  specialPeriodId?: string;
  specialPeriodTitle?: string;
  specialPeriodDay?: string;
  specialPeriodStartTime?: string;
  specialPeriodEndTime?: string;
}

interface Student {
  id: string;
  firstName: string;
  lastName: string;
  studentId: string;
  classLevel: string;
  room: string;
  profileImageUrl?: string;
}

interface SpecialPeriod {
  id: string;
  title: string;
  startTime: string;
  endTime: string;
  day?: string;
}

const DAY_MAP: Record<string, string> = {
  mon: 'จันทร์',
  tue: 'อังคาร',
  wed: 'พุธ',
  thu: 'พฤหัสบดี',
  fri: 'ศุกร์',
  sat: 'เสาร์',
  sun: 'อาทิตย์'
};

const toIsoDate = (date: Date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const getAttendanceDocId = (dateStr: string, specialPeriodId?: string) => {
  return specialPeriodId ? `${dateStr}_${sanitizeDocId(specialPeriodId)}` : dateStr;
};

const sanitizeDocId = (value: string) => String(value || '').replace(/[\/#?[\]]/g, '_');

const ClubAttendancePage: React.FC = () => {
  const [myClubs, setMyClubs] = useState<Club[]>([]);
  const [selectedClub, setSelectedClub] = useState<Club | null>(null);
  const [specialPeriods, setSpecialPeriods] = useState<SpecialPeriod[]>([]);
  const [students, setStudents] = useState<Student[]>([]);
  const [attendance, setAttendance] = useState<Record<string, 'present' | 'absent' | 'late' | 'leave'>>({});
  const [currentDate, setCurrentDate] = useState(new Date());
  const [loading, setLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isSubmitted, setIsSubmitted] = useState(false);

  const currentUser = useSelector((state: RootState) => state.auth.user);
  const schoolId = (currentUser as any)?.schoolId;
  const dispatch = useDispatch();

  const { teachers: teacherMap, status: teacherMapStatus } = useSelector((state: RootState) => state.userMap);
  const calendarState = useSelector((state: RootState) => state.calendar);

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
    if (schoolId && calendarState.status === 'idle') {
      dispatch(fetchCalendar(schoolId) as any);
    }
  }, [schoolId, calendarState.status, dispatch]);

  useEffect(() => {
    if (!schoolId || !currentTeacherId) return;

    const fetchData = async () => {
      setLoading(true);
      try {
        const clubsQ = query(
          collection(db, 'school-settings', schoolId, 'clubs'),
          where('responsibleTeacherIds', 'array-contains', currentTeacherId)
        );
        const clubsSnap = await getDocs(clubsQ);
        const clubsData = clubsSnap.docs.map(doc => ({ id: doc.id, ...doc.data() } as Club));
        setMyClubs(clubsData);
        if (clubsData.length === 1) setSelectedClub(clubsData[0]);

        const periodsSnap = await getDocs(collection(db, 'school-settings', schoolId, 'special-periods'));
        const periods = periodsSnap.docs.map(doc => ({ id: doc.id, ...doc.data() } as SpecialPeriod));
        setSpecialPeriods(periods);

      } catch (error) {
        console.error("Error fetching initial data:", error);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [schoolId, currentTeacherId]);

  const clubSpecialPeriod = useMemo(() => {
    if (!selectedClub) return null;
    return specialPeriods.find(period => period.id === selectedClub.specialPeriodId) ||
      specialPeriods.find(period => String(period.title || '').includes('ชุมนุม')) ||
      null;
  }, [selectedClub, specialPeriods]);

  useEffect(() => {
    if (!schoolId || !selectedClub) {
      setStudents([]);
      return;
    }

    const fetchMembers = async () => {
      try {
        const membersSnap = await getDocs(collection(db, 'school-settings', schoolId, 'clubs', selectedClub.id, 'members'));
        const memberIds = membersSnap.docs.map(doc => doc.id);

        if (memberIds.length === 0) {
          setStudents([]);
          return;
        }

        const studentsRef = collection(db, 'school-settings', schoolId, 'students');
        const studentSnap = await getDocs(studentsRef);
        const memberList = studentSnap.docs
          .filter(doc => memberIds.includes(doc.id))
          .map(doc => ({ id: doc.id, ...doc.data() } as Student));

        setStudents(memberList);

        const initialAtt: Record<string, any> = {};
        memberList.forEach(s => initialAtt[s.id] = 'present');

        const dateStr = toIsoDate(currentDate);
        const attDocRef = doc(db, 'school-settings', schoolId, 'clubs', selectedClub.id, 'attendance', getAttendanceDocId(dateStr, clubSpecialPeriod?.id));
        const legacyAttDocRef = doc(db, 'school-settings', schoolId, 'clubs', selectedClub.id, 'attendance', dateStr);
        const attSnap = await getDoc(attDocRef);
        const legacyAttSnap = attSnap.exists() ? null : await getDoc(legacyAttDocRef);

        if (attSnap.exists() || legacyAttSnap?.exists()) {
          const data = (attSnap.exists() ? attSnap.data() : legacyAttSnap?.data()) || {};
          setAttendance(data.records || initialAtt);
          setIsSubmitted(true);
        } else {
          setAttendance(initialAtt);
          setIsSubmitted(false);
        }

      } catch (error) {
        console.error("Error fetching members/attendance:", error);
      }
    };

    fetchMembers();
  }, [schoolId, selectedClub, currentDate, clubSpecialPeriod?.id]);

  const handleSaveAttendance = async () => {
    if (!schoolId || !selectedClub || isSaving) return;

    setIsSaving(true);
    try {
      const dateStr = toIsoDate(currentDate);
      const attDocRef = doc(db, 'school-settings', schoolId, 'clubs', selectedClub.id, 'attendance', getAttendanceDocId(dateStr, clubSpecialPeriod?.id));

      await setDoc(attDocRef, {
        records: attendance,
        updatedAt: Timestamp.now(),
        updatedBy: currentUser?.uid,
        clubName: selectedClub.name,
        date: dateStr,
        specialPeriodId: clubSpecialPeriod?.id || '',
        specialPeriodTitle: clubSpecialPeriod?.title || '',
        specialPeriodDay: clubSpecialPeriod?.day || 'all',
        startTime: clubSpecialPeriod?.startTime || '',
        endTime: clubSpecialPeriod?.endTime || ''
      });

      Swal.fire({
        icon: 'success',
        title: 'บันทึกสำเร็จ',
        timer: 1500,
        showConfirmButton: false,
        toast: true,
        position: 'top-end'
      });
      setIsSubmitted(true);
    } catch (error) {
      console.error("Error saving attendance:", error);
      Swal.fire('ผิดพลาด', 'ไม่สามารถบันทึกข้อมูลได้', 'error');
    } finally {
      setIsSaving(false);
    }
  };

  const toggleStatus = (studentId: string, status: 'present' | 'absent' | 'late' | 'leave') => {
    setAttendance(prev => ({ ...prev, [studentId]: status }));
  };

  const currentDateEvent = useMemo(() => {
    return calendarState.rawData?.events?.[toIsoDate(currentDate)];
  }, [calendarState.rawData, currentDate]);

  const effectiveDayKey = useMemo(() => {
    return currentDateEvent?.type === 'schoolDay' && currentDateEvent.scheduleDay
      ? currentDateEvent.scheduleDay
      : ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'][currentDate.getDay()];
  }, [currentDate, currentDateEvent]);

  const isCompensationScheduleDay = currentDateEvent?.type === 'schoolDay' && Boolean(currentDateEvent.scheduleDay);
  const isClubDay = clubSpecialPeriod ? (!clubSpecialPeriod.day || clubSpecialPeriod.day === 'all' || clubSpecialPeriod.day === effectiveDayKey) : false;

  return (
    <MainLayout>
      <div className="p-4 sm:p-8 max-w-7xl mx-auto text-gray-900 dark:text-white">
        <div className="mb-8 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <BackButton to="/academic/hub/attendance" className="mb-2" />
            <h1 className="text-3xl font-bold tracking-tight flex items-center gap-3">
              <ClipboardCheck className="text-emerald-500" size={32} />
              เช็คชื่อเข้าชุมนุม
            </h1>
          </div>

          <div className="flex items-center gap-3 bg-white dark:bg-[#2a2b2f] p-2 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700">
            <button onClick={() => setCurrentDate(new Date(currentDate.setDate(currentDate.getDate() - 1)))} className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg"><ChevronLeft size={20} /></button>
            <div className="flex items-center gap-2 px-2">
              <Calendar size={18} className="text-gray-500" />
              <span className="font-medium">
                {currentDate.toLocaleDateString('th-TH', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
              </span>
            </div>
            <button onClick={() => setCurrentDate(new Date(currentDate.setDate(currentDate.getDate() + 1)))} className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg rotate-180"><ChevronLeft size={20} /></button>
          </div>
        </div>

        {loading ? (
          <SkeletonLoader height="400px" />
        ) : myClubs.length === 0 ? (
          <div className="bg-white dark:bg-[#2a2b2f] rounded-3xl p-16 text-center border border-dashed border-gray-300 dark:border-gray-700">
            <AlertCircle className="mx-auto text-amber-500 mb-4" size={48} />
            <h3 className="text-xl font-bold">ไม่พบข้อมูลชุมนุม</h3>
            <p className="text-gray-500 mt-2">คุณยังไม่ได้ถูกกำหนดให้เป็นผู้รับผิดชอบชุมนุมใดๆ</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
            <div className="lg:col-span-4 space-y-6">
              <div className="bg-white dark:bg-[#2a2b2f] rounded-2xl p-6 shadow-sm border border-gray-100 dark:border-gray-700">
                <label className="block text-sm font-bold text-gray-700 dark:text-gray-300 mb-3">เลือกชุมนุม</label>
                <div className="space-y-2">
                  {myClubs.map(club => (
                    <button
                      key={club.id}
                      onClick={() => setSelectedClub(club)}
                      className={`w-full flex items-center justify-between p-4 rounded-xl border-2 transition-all ${selectedClub?.id === club.id ? 'border-emerald-500 bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-300' : 'border-gray-100 dark:border-gray-700 hover:border-emerald-200'}`}
                    >
                      <div className="flex items-center gap-3">
                        <LayoutGrid size={20} />
                        <span className="font-bold">{club.name}</span>
                      </div>
                      {selectedClub?.id === club.id && <CheckCircle2 size={20} />}
                    </button>
                  ))}
                </div>
              </div>

              {clubSpecialPeriod && (
                <div className={`bg-white dark:bg-[#2a2b2f] rounded-2xl p-6 shadow-sm border-2 ${isClubDay ? 'border-emerald-100 dark:border-emerald-900/30' : 'border-red-100 dark:border-red-900/30'}`}>
                  <h3 className="text-lg font-bold mb-4 flex items-center gap-2">
                    <Clock className={isClubDay ? 'text-emerald-500' : 'text-red-500'} size={20} />
                    ข้อมูลเวลาทำกิจกรรม
                  </h3>
                  <div className="space-y-3">
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-500">วันทำกิจกรรม:</span>
                      <span className="font-bold">{clubSpecialPeriod.day === 'all' || !clubSpecialPeriod.day ? 'ทุกวัน' : `วัน${DAY_MAP[clubSpecialPeriod.day] || clubSpecialPeriod.day}`}</span>
                    </div>
                    {isCompensationScheduleDay && (
                      <div className="rounded-xl bg-indigo-50 px-3 py-2 text-xs font-bold text-indigo-600 dark:bg-indigo-500/10 dark:text-indigo-300">
                        วันนี้เป็นวันเรียนชดเชย ใช้ตารางวัน{DAY_MAP[effectiveDayKey] || effectiveDayKey} จากปฏิทินโรงเรียน
                      </div>
                    )}
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-500">ช่วงเวลา:</span>
                      <span className="font-bold">{clubSpecialPeriod.startTime} - {clubSpecialPeriod.endTime} น.</span>
                    </div>
                    {!isClubDay && (
                      <div className="mt-4 p-3 bg-red-50 dark:bg-red-900/20 rounded-xl border border-red-100 dark:border-red-800 text-red-600 dark:text-red-400 text-xs flex items-center gap-2">
                        <AlertCircle size={14} />
                        วันนี้ไม่ใช่กำหนดการทำกิจกรรมชุมนุม
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>

            <div className="lg:col-span-8">
              {!selectedClub ? (
                <div className="h-full flex flex-col items-center justify-center text-gray-400 bg-gray-50 dark:bg-gray-800/20 rounded-3xl border-2 border-dashed border-gray-200 dark:border-gray-700 p-12">
                  <Users size={48} className="mb-4 opacity-20" />
                  <p>กรุณาเลือกชุมนุมเพื่อเริ่มเช็คชื่อ</p>
                </div>
              ) : (
                <div className="bg-white dark:bg-[#2a2b2f] rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 overflow-hidden flex flex-col h-full">
                  <div className="p-6 border-b border-gray-100 dark:border-gray-700 bg-emerald-50/30 dark:bg-emerald-900/10 flex justify-between items-center">
                    <div>
                      <h2 className="text-xl font-bold text-emerald-700 dark:text-emerald-400">{selectedClub.name}</h2>
                      <p className="text-xs text-gray-500 font-bold">นักเรียนทั้งหมด: {students.length} คน</p>
                    </div>
                    <button
                      onClick={handleSaveAttendance}
                      disabled={isSaving}
                      className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white px-6 py-2.5 rounded-xl font-bold transition-all shadow-lg shadow-emerald-200 dark:shadow-none disabled:opacity-50"
                    >
                      {isSaving ? <RefreshCw className="animate-spin" size={18} /> : <Save size={18} />}
                      {isSubmitted ? 'อัปเดตข้อมูล' : 'บันทึกการเช็คชื่อ'}
                    </button>
                  </div>

                  <div className="flex-1 overflow-y-auto p-6 custom-scrollbar">
                    {students.length === 0 ? (
                      <div className="text-center py-20 text-gray-400">
                        <p>ยังไม่มีนักเรียนในชุมนุมนี้</p>
                      </div>
                    ) : (
                      <div className="grid grid-cols-1 gap-4">
                        {students.map((student, idx) => (
                          <div key={student.id} className="flex flex-col sm:flex-row items-center justify-between p-4 bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700 rounded-2xl hover:shadow-md transition-all group gap-4">
                            <div className="flex items-center gap-4 w-full sm:w-auto">
                              <span className="text-xs font-bold text-gray-400 w-4">{idx + 1}</span>
                              <img src={student.profileImageUrl || `https://ui-avatars.com/api/?name=${student.firstName}&background=random`} className="w-12 h-12 rounded-full object-cover" alt="" />
                              <div>
                                <p className="font-bold text-gray-900 dark:text-white">{student.firstName} {student.lastName}</p>
                                <p className="text-xs text-gray-500">รหัส: {student.studentId} | ชั้น {student.classLevel}/{student.room}</p>
                              </div>
                            </div>

                            <div className="flex items-center gap-2 bg-gray-50 dark:bg-gray-900 p-1 rounded-xl border border-gray-100 dark:border-gray-700">
                              {[
                                { id: 'present', label: 'มา', color: 'bg-emerald-500' },
                                { id: 'late', label: 'สาย', color: 'bg-amber-500' },
                                { id: 'leave', label: 'ลา', color: 'bg-blue-500' },
                                { id: 'absent', label: 'ขาด', color: 'bg-red-500' }
                              ].map(status => (
                                <button
                                  key={status.id}
                                  onClick={() => toggleStatus(student.id, status.id as any)}
                                  className={`px-4 py-2 rounded-lg text-xs font-bold transition-all ${attendance[student.id] === status.id ? `${status.color} text-white shadow-sm scale-105` : 'text-gray-400 hover:bg-white dark:hover:bg-gray-700'}`}
                                >
                                  {status.label}
                                </button>
                              ))}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
      <style>{`
        .custom-scrollbar::-webkit-scrollbar { width: 4px; }
        .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: #cbd5e1; border-radius: 10px; }
        .dark .custom-scrollbar::-webkit-scrollbar-thumb { background: #475569; }
      `}</style>
    </MainLayout>
  );
};

export default ClubAttendancePage;
