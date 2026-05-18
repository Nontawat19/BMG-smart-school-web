import React, { useState, useEffect, useMemo } from 'react';
import { Link } from 'react-router-dom';
import BackButton from "@/components/Shared/BackButton";
import ProfileAvatar from "@/components/Shared/ProfileAvatar";
import { firestore as db } from '../../firebase';
import { collection, getDocs, doc, getDoc, setDoc, Timestamp } from 'firebase/firestore';
import { useSelector, useDispatch } from 'react-redux';
import { RootState } from '@/store';
import MainLayout from "@/layouts/MainLayout";
import { fetchTeachersMap } from '@/store/slices/userMapSlice';
import { fetchCalendar } from '@/store/slices/calendarSlice';
import Swal from 'sweetalert2';
import {
  ClipboardCheck,
  Calendar,
  Clock,
  ChevronLeft,
  Save,
  AlertCircle,
  LayoutGrid,
  RefreshCw
} from 'lucide-react';
import SkeletonLoader from "@/components/SkeletonLoader";

interface Club {
  id: string;
  name: string;
  responsibleTeacherIds: string[];
  ownerTeacherId?: string;
  teacherId?: string;
  teacherIds?: string[];
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

interface CalendarEvent {
  type?: string;
  description?: string;
  scheduleDay?: string;
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
  const [calendarEvents, setCalendarEvents] = useState<Record<string, CalendarEvent>>({});

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

  const currentTeacher = useMemo(() => {
    if (!teacherMap || !currentUser) return null;
    return Object.values(teacherMap).find((t: any) => t.uid === currentUser.uid || t.id === currentUser.uid) as any;
  }, [teacherMap, currentUser]);

  const teacherName = useMemo(() => {
    if (!currentTeacher) return 'กำลังโหลด...';
    return currentTeacher.name || `${currentTeacher.title || ''}${currentTeacher.firstName || ''} ${currentTeacher.lastName || ''}`.trim() || 'ไม่ระบุชื่อครู';
  }, [currentTeacher]);

  const currentTeacherKeys = useMemo(() => {
    const keys = new Set<string>();
    if ((currentUser as any)?.uid) keys.add(String((currentUser as any).uid));
    if ((currentUser as any)?.id) keys.add(String((currentUser as any).id));
    if ((currentUser as any)?.teacherId) keys.add(String((currentUser as any).teacherId));

    const teacher = teacherMap && currentUser
      ? Object.values(teacherMap).find((t: any) => t.uid === currentUser.uid)
      : null;

    if (teacher) {
      if ((teacher as any).id) keys.add(String((teacher as any).id));
      if ((teacher as any).uid) keys.add(String((teacher as any).uid));
      if ((teacher as any).teacherId) keys.add(String((teacher as any).teacherId));
    }

    return keys;
  }, [teacherMap, currentUser]);

  const isClubManagedByCurrentTeacher = (club: Club) => {
    const responsibleIds = [
      ...(Array.isArray(club.responsibleTeacherIds) ? club.responsibleTeacherIds : []),
      ...(Array.isArray(club.teacherIds) ? club.teacherIds : []),
      club.ownerTeacherId,
      club.teacherId,
    ].filter(Boolean).map(String);

    return responsibleIds.some(id => currentTeacherKeys.has(id));
  };

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
    if (!schoolId || calendarState.status === 'loading') return;

    const fetchCalendarEvents = async () => {
      const defaultEvents = (calendarState.rawData?.events || {}) as Record<string, CalendarEvent>;
      const academicYear = calendarState.academicYear || calendarState.rawData?.academicYear;

      if (!academicYear) {
        setCalendarEvents(defaultEvents);
        return;
      }

      try {
        const yearDocRef = doc(db, 'school-settings', schoolId, 'main_calendar', String(academicYear));
        const yearSnap = await getDoc(yearDocRef);
        const yearEvents = yearSnap.exists()
          ? ((yearSnap.data()?.events || {}) as Record<string, CalendarEvent>)
          : {};

        setCalendarEvents({ ...defaultEvents, ...yearEvents });
      } catch (error) {
        console.error("Error fetching academic year calendar events:", error);
        setCalendarEvents(defaultEvents);
      }
    };

    fetchCalendarEvents();
  }, [schoolId, calendarState.status, calendarState.academicYear, calendarState.rawData]);

  useEffect(() => {
    if (!schoolId || currentTeacherKeys.size === 0) return;

    const fetchData = async () => {
      setLoading(true);
      try {
        const clubsSnap = await getDocs(collection(db, 'school-settings', schoolId, 'clubs'));
        const clubsData = clubsSnap.docs
          .map(doc => ({ id: doc.id, ...doc.data() } as Club))
          .filter(isClubManagedByCurrentTeacher)
          .sort((a, b) => a.name.localeCompare(b.name, 'th'));
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
  }, [schoolId, currentTeacherId, currentTeacherKeys]);

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
        updatedByTeacherId: currentTeacherId || '',
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
    return calendarEvents[toIsoDate(currentDate)];
  }, [calendarEvents, currentDate]);

  const effectiveDayKey = useMemo(() => {
    return currentDateEvent?.type === 'schoolDay' && currentDateEvent.scheduleDay
      ? currentDateEvent.scheduleDay
      : ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'][currentDate.getDay()];
  }, [currentDate, currentDateEvent]);

  const isCompensationScheduleDay = currentDateEvent?.type === 'schoolDay' && Boolean(currentDateEvent.scheduleDay);
  const isClubDay = clubSpecialPeriod ? (!clubSpecialPeriod.day || clubSpecialPeriod.day === 'all' || clubSpecialPeriod.day === effectiveDayKey) : false;
  const attendanceSummary = useMemo(() => {
    return students.reduce((acc, student) => {
      const status = attendance[student.id] || 'present';
      if (status === 'present') acc.present += 1;
      if (status === 'late') acc.late += 1;
      if (status === 'leave') acc.leave += 1;
      if (status === 'absent') acc.absent += 1;
      return acc;
    }, { present: 0, late: 0, leave: 0, absent: 0 });
  }, [students, attendance]);

  return (
    <MainLayout>
      <div className="w-full max-w-[1600px] mx-auto px-4 py-4 sm:px-6 lg:px-8 xl:px-10 sm:py-8 text-gray-900 dark:text-white">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-8 gap-4 bg-white dark:bg-[#2a2b2f]/60 backdrop-blur-sm p-5 rounded-[1.5rem] border border-gray-200/50 dark:border-white/5 transition-all duration-300">
          <div className="space-y-1 text-left">
            <div className="flex items-center gap-3">
              <BackButton to="/academic/hub/attendance" />
              <div className="p-2.5 bg-emerald-50 dark:bg-emerald-500/10 rounded-2xl shadow-sm border border-emerald-100 dark:border-emerald-500/20">
                <ClipboardCheck className="text-emerald-600 dark:text-emerald-400" size={24} />
              </div>
              <div>
                <h1 className="text-2xl font-black text-gray-900 dark:text-white leading-tight tracking-tight">
                  ระบบเช็คชื่อชุมนุม
                </h1>
                <p className="text-gray-500 dark:text-gray-400 text-xs font-bold flex items-center gap-1.5 pt-0.5">
                  <span className="opacity-60">ครูผู้ดูแล:</span>
                  <span className="text-emerald-600 dark:text-emerald-400 font-extrabold">{teacherName}</span>
                </p>
              </div>
            </div>
          </div>

          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 w-full md:w-auto">
            <div className="flex bg-gray-50 dark:bg-white/5 p-1 rounded-xl border border-gray-200 dark:border-gray-800 items-center px-4 shadow-inner">
              <div className="flex items-baseline gap-1 py-1">
                <span className="text-[10px] font-bold text-gray-400 uppercase tracking-tighter">ชุมนุม</span>
                <span className="text-[13px] font-black text-gray-900 dark:text-white">{myClubs.length}</span>
              </div>
              <div className="w-[1.5px] h-3 bg-gray-200 dark:bg-gray-700 mx-3"></div>
              <div className="flex items-baseline gap-1 py-1">
                <span className="text-[10px] font-bold text-gray-400 uppercase tracking-tighter">สมาชิก</span>
                <span className="text-[13px] font-black text-gray-900 dark:text-white">{students.length || '-'}</span>
              </div>
            </div>

            <div className="flex items-center gap-2 bg-white dark:bg-[#1a1b1e] p-1 rounded-xl shadow-lg shadow-emerald-500/5 border border-gray-100 dark:border-gray-800 ring-1 ring-gray-100 dark:ring-gray-700/30">
              <button
                onClick={() => {
                  const d = new Date(currentDate);
                  d.setDate(d.getDate() - 1);
                  setCurrentDate(d);
                }}
                className="p-2 hover:bg-gray-100 dark:hover:bg-white/10 rounded-lg transition-all text-gray-400 hover:text-emerald-600 active:scale-90"
              >
                <ChevronLeft size={20} />
              </button>
              <div className="flex items-center gap-2 px-1 min-w-[170px] justify-center">
                <Calendar size={16} className="text-emerald-500/70" />
                <span className="font-black text-xs text-gray-800 dark:text-gray-100 tracking-tight">
                  {currentDate.toLocaleDateString('th-TH', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
                </span>
              </div>
              <button
                onClick={() => {
                  const d = new Date(currentDate);
                  d.setDate(d.getDate() + 1);
                  setCurrentDate(d);
                }}
                className="p-2 hover:bg-gray-100 dark:hover:bg-white/10 rounded-lg transition-all text-gray-400 hover:text-emerald-600 rotate-180 active:scale-90"
              >
                <ChevronLeft size={20} />
              </button>
            </div>
          </div>
        </div>

        {isCompensationScheduleDay && (
          <div className="mb-6 rounded-2xl border border-indigo-200 bg-indigo-50 px-5 py-4 text-indigo-700 shadow-sm dark:border-indigo-500/30 dark:bg-indigo-500/10 dark:text-indigo-200">
            <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-start gap-3">
                <Calendar className="mt-0.5 shrink-0 text-indigo-500 dark:text-indigo-300" size={20} />
                <div>
                  <p className="text-sm font-black">วันนี้เป็นวันสอนชดเชย</p>
                  <p className="text-xs font-bold opacity-80">
                    ใช้ตาราง{DAY_MAP[effectiveDayKey] || effectiveDayKey} สำหรับการเช็คชื่อชุมนุม
                    {currentDateEvent?.description ? ` • ${currentDateEvent.description}` : ''}
                  </p>
                </div>
              </div>
            </div>
          </div>
        )}

        {loading ? (
          <SkeletonLoader height="400px" />
        ) : myClubs.length === 0 ? (
          <div className="bg-white dark:bg-[#2a2b2f] rounded-3xl p-16 text-center border border-dashed border-gray-300 dark:border-gray-700">
            <AlertCircle className="mx-auto text-amber-500 mb-4" size={48} />
            <h3 className="text-xl font-bold">ไม่พบข้อมูลชุมนุม</h3>
            <p className="text-gray-500 mt-2">คุณยังไม่ได้ถูกกำหนดให้เป็นผู้รับผิดชอบชุมนุมใดๆ</p>
          </div>
        ) : !selectedClub ? (
          <div className="grid grid-cols-1 gap-4">
            {myClubs.map(club => {
              const selectedPeriod = specialPeriods.find(period => period.id === club.specialPeriodId) ||
                specialPeriods.find(period => String(period.title || '').includes('ชุมนุม'));
              return (
                <button
                  key={club.id}
                  onClick={() => setSelectedClub(club)}
                  className="relative p-5 rounded-2xl shadow-sm border transition-all cursor-pointer hover:shadow-md flex justify-between items-center overflow-hidden bg-white dark:bg-[#2a2b2f] border-gray-100 dark:border-gray-700 hover:border-emerald-300 dark:hover:border-emerald-700 text-left"
                >
                  <div className="flex items-center gap-4">
                    <div className="w-12 h-12 rounded-xl flex items-center justify-center font-bold text-lg bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300">
                      <LayoutGrid size={22} />
                    </div>
                    <div>
                      <h3 className="font-bold text-lg text-gray-900 dark:text-white">
                        {club.name}
                      </h3>
                      <p className="text-gray-500 dark:text-gray-400 flex items-center gap-2 text-sm">
                        <Clock size={14} />
                        {selectedPeriod
                          ? `${selectedPeriod.day === 'all' || !selectedPeriod.day ? 'ทุกวัน' : `วัน${DAY_MAP[selectedPeriod.day] || selectedPeriod.day}`} • ${selectedPeriod.startTime || '-'} - ${selectedPeriod.endTime || '-'}`
                          : 'ยังไม่กำหนดคาบชุมนุม'}
                      </p>
                    </div>
                  </div>
                  <div className="text-emerald-600 dark:text-emerald-400">
                    <ChevronLeft size={24} className="rotate-180" />
                  </div>
                </button>
              );
            })}
          </div>
        ) : (
          <div className="space-y-6">
            <div className="sticky top-[60px] z-40 bg-white/98 dark:bg-[#1e1f23]/98 backdrop-blur-md shadow-lg border-b border-gray-100 dark:border-gray-800 p-3 sm:p-5 md:rounded-2xl transition-all duration-300">
              <div className="flex items-center justify-between w-full gap-3">
                <button
                  onClick={() => setSelectedClub(null)}
                  className="flex items-center justify-center p-2.5 sm:px-5 sm:py-2.5 text-gray-600 dark:text-gray-300 hover:text-emerald-600 dark:hover:text-emerald-400 transition-colors bg-gray-100 dark:bg-white/5 rounded-xl border border-transparent hover:border-emerald-200 dark:hover:border-emerald-800 shadow-sm"
                >
                  <ChevronLeft size={22} />
                  <span className="hidden sm:inline ml-1.5 font-bold">กลับ</span>
                </button>

                <div className="flex-1 text-center min-w-0 px-2">
                  <h2 className="font-extrabold text-base sm:text-xl text-gray-800 dark:text-white truncate leading-tight">
                    {selectedClub.name}
                    <span className="ml-1.5 text-emerald-600 dark:text-emerald-400">
                      ชุมนุม
                    </span>
                  </h2>
                  <div className="flex items-center justify-center gap-2 mt-1">
                    <p className="text-[11px] sm:text-sm text-gray-500 dark:text-gray-400 font-bold whitespace-nowrap bg-gray-100 dark:bg-white/5 px-2 py-0.5 rounded-full">
                      {clubSpecialPeriod
                        ? `${clubSpecialPeriod.day === 'all' || !clubSpecialPeriod.day ? 'ทุกวัน' : `วัน${DAY_MAP[clubSpecialPeriod.day] || clubSpecialPeriod.day}`} (${clubSpecialPeriod.startTime || '-'}-${clubSpecialPeriod.endTime || '-'})`
                        : 'ยังไม่พบคาบชุมนุม'}
                    </p>
                    {!isClubDay && (
                      <span className="bg-red-500/20 text-red-600 dark:text-red-400 text-[10px] sm:text-[11px] px-2 py-0.5 rounded-md border border-red-500/30 font-black uppercase">
                        ไม่ใช่วันชุมนุม
                      </span>
                    )}
                  </div>
                </div>

                <div className="flex-shrink-0">
                  <button
                    onClick={handleSaveAttendance}
                    disabled={isSaving}
                    className="flex items-center justify-center p-2.5 sm:px-7 sm:py-2.5 rounded-xl text-xs sm:text-base font-black transition-all shadow-md bg-emerald-600 hover:bg-emerald-700 text-white active:scale-95 disabled:opacity-50 disabled:cursor-wait"
                    title="บันทึก"
                  >
                    {isSaving ? <RefreshCw className="animate-spin" size={20} /> : <Save size={20} />}
                    <span className="hidden sm:inline ml-2.5">{isSubmitted ? 'อัปเดต' : 'บันทึก'}</span>
                  </button>
                </div>
              </div>
            </div>

            {isCompensationScheduleDay && (
              <div className="rounded-2xl border border-indigo-100 bg-indigo-50 px-4 py-3 text-xs font-bold text-indigo-600 dark:border-indigo-500/20 dark:bg-indigo-500/10 dark:text-indigo-300">
                วันนี้เป็นวันสอนชดเชย ใช้ตารางวัน{DAY_MAP[effectiveDayKey] || effectiveDayKey} จากปฏิทินโรงเรียน
              </div>
            )}

            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {[
                { label: 'มา', value: attendanceSummary.present, className: 'bg-green-50 text-green-700 dark:bg-green-500/10 dark:text-green-300 border-green-100 dark:border-green-500/20' },
                { label: 'สาย', value: attendanceSummary.late, className: 'bg-yellow-50 text-yellow-700 dark:bg-yellow-500/10 dark:text-yellow-300 border-yellow-100 dark:border-yellow-500/20' },
                { label: 'ลา', value: attendanceSummary.leave, className: 'bg-blue-50 text-blue-700 dark:bg-blue-500/10 dark:text-blue-300 border-blue-100 dark:border-blue-500/20' },
                { label: 'ขาด', value: attendanceSummary.absent, className: 'bg-red-50 text-red-700 dark:bg-red-500/10 dark:text-red-300 border-red-100 dark:border-red-500/20' },
              ].map(item => (
                <div key={item.label} className={`rounded-2xl border p-4 ${item.className}`}>
                  <p className="text-[11px] font-black uppercase opacity-70">{item.label}</p>
                  <p className="text-2xl font-black">{item.value}</p>
                </div>
              ))}
            </div>

            {students.length === 0 ? (
              <div className="col-span-full text-center py-10 text-gray-500 bg-white dark:bg-[#2a2b2f] rounded-2xl border border-dashed border-gray-300 dark:border-gray-700">
                ไม่พบรายชื่อนักเรียนในชุมนุมนี้
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 sm:gap-6">
                {students.map((student) => {
                  const status = attendance[student.id] || 'present';
                  const statusStyle =
                    status === 'present' ? 'border-green-200 dark:border-green-900 bg-green-50/30 dark:bg-green-900/5' :
                      status === 'late' ? 'border-yellow-200 dark:border-yellow-900 bg-yellow-50/30 dark:bg-yellow-900/5' :
                        status === 'leave' ? 'border-blue-200 dark:border-blue-900 bg-blue-50/30 dark:bg-blue-900/5' :
                          'border-red-200 dark:border-red-900 bg-red-50/30 dark:bg-red-900/5';

                  return (
                    <div
                      key={student.id}
                      className={`relative group rounded-2xl p-4 sm:p-6 border-2 transition-all duration-300 hover:shadow-lg ${statusStyle}`}
                    >
                      <div className="flex flex-row sm:flex-col items-center gap-4">
                        <div className="relative flex-shrink-0">
                          <Link to={`/school/${schoolId}/students/view/${student.id}`} className="block relative">
                            <div className="absolute -inset-1 bg-gradient-to-br from-emerald-500 to-teal-500 rounded-full opacity-0 group-hover:opacity-20 transition-opacity blur"></div>
                            <ProfileAvatar
                              src={student.profileImageUrl || `https://ui-avatars.com/api/?name=${encodeURIComponent(`${student.firstName} ${student.lastName || ''}`.trim())}&background=random&color=fff&rounded=true&size=128&length=2`}
                              alt={student.firstName}
                              className="relative w-16 h-16 sm:w-24 sm:h-24 border-4 border-white dark:border-[#2a2b2f] shadow-sm"
                              imageClassName="transition-transform group-hover:scale-105"
                            />
                          </Link>
                          <div className={`absolute bottom-0 right-0 sm:bottom-1 sm:right-1 w-5 h-5 sm:w-6 sm:h-6 rounded-full border-2 sm:border-4 border-white dark:border-[#2a2b2f] shadow-sm ${status === 'present' ? 'bg-green-500' :
                            status === 'late' ? 'bg-yellow-500' :
                              status === 'leave' ? 'bg-blue-500' : 'bg-red-500'
                            }`} />
                        </div>

                        <div className="flex-grow min-w-0 text-left sm:text-center overflow-hidden w-full space-y-0.5">
                          <Link to={`/school/${schoolId}/students/view/${student.id}`} className="block transition-colors">
                            <h3 className="text-gray-900 dark:text-white font-bold mb-0.5 mt-2 sm:mt-0 text-sm sm:text-base truncate group-hover:text-emerald-600 dark:group-hover:text-emerald-400 transition-colors">
                              {student.firstName} {student.lastName}
                            </h3>
                          </Link>
                          <div className="text-gray-500 dark:text-gray-400 mt-1 sm:mt-1.5 w-full truncate">
                            <span className="inline-block bg-white/50 dark:bg-black/20 px-2 py-0.5 rounded-md font-mono text-[10px] sm:text-[11px]">
                              รหัส {student.studentId || '-'} | ชั้น {student.classLevel}/{student.room}
                            </span>
                          </div>
                        </div>

                        <div className="w-full grid grid-cols-4 gap-2 mt-4 sm:mt-2">
                          {[
                            { id: 'present', label: 'มา', activeClass: 'bg-white dark:bg-gray-700 text-green-600 shadow-sm ring-1 ring-green-200' },
                            { id: 'late', label: 'สาย', activeClass: 'bg-white dark:bg-gray-700 text-yellow-600 shadow-sm ring-1 ring-yellow-200' },
                            { id: 'leave', label: 'ลา', activeClass: 'bg-white dark:bg-gray-700 text-blue-600 shadow-sm ring-1 ring-blue-200' },
                            { id: 'absent', label: 'ขาด', activeClass: 'bg-white dark:bg-gray-700 text-red-600 shadow-sm ring-1 ring-red-200' },
                          ].map(option => (
                            <button
                              key={option.id}
                              onClick={() => toggleStatus(student.id, option.id as any)}
                              className={`flex flex-col items-center justify-center py-2 rounded-xl text-xs sm:text-sm font-bold transition-all duration-200 ${status === option.id
                                ? `${option.activeClass} ring-2 ring-offset-1 ring-offset-white dark:ring-offset-[#2a2b2f] transform scale-105 shadow-md`
                                : 'bg-white/50 dark:bg-black/20 text-gray-400 hover:bg-white dark:hover:bg-gray-700 hover:text-gray-600 dark:hover:text-gray-300'
                                }`}
                            >
                              {option.label}
                            </button>
                          ))}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
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
