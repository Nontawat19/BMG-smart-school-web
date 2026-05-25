import React, { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useDispatch, useSelector } from 'react-redux';
import BackButton from '@/components/Shared/BackButton';
import ProfileAvatar from '@/components/Shared/ProfileAvatar';
import MainLayout from '@/layouts/MainLayout';
import { firestore as db } from '@/firebase';
import { RootState } from '@/store';
import { fetchCalendar } from '@/store/slices/calendarSlice';
import { fetchSchoolSettings } from '@/store/slices/schoolSettingsSlice';
import { CLASSES } from '@/utils/schoolUtils';
import { fetchTeachersMap } from '@/store/slices/userMapSlice';
import { getCurrentThaiYear } from '@/utils/dateUtils';
import { collection, doc, getDoc, getDocs, query, Timestamp, where, writeBatch } from 'firebase/firestore';
import { AlertCircle, BookOpen, Calendar, CheckCircle2, ChevronLeft, ClipboardCheck, Clock, Home, Info, LayoutGrid, RefreshCw, Save, Search, Users } from 'lucide-react';
import Swal from 'sweetalert2';
import { useResponsivePwaMode as usePwaMode } from '@/hooks/useResponsivePwaMode';
interface Student {
  id: string;
  firstName?: string;
  lastName?: string;
  title?: string;
  prefix?: string;
  studentId?: string;
  studentNumber?: string;
  number?: string;
  classLevel?: string;
  room?: string;
  profileImageUrl?: string;
  status?: string;
  nickname?: string;
}

const ATTENDANCE_OPTIONS = [
  { id: 'present', label: 'มาเรียน', color: 'bg-emerald-500 hover:bg-emerald-600', textColor: 'text-emerald-600 dark:text-emerald-400', badgeClass: 'bg-emerald-500/10 text-emerald-600 dark:bg-emerald-500/20 dark:text-emerald-400' },
  { id: 'late', label: 'สาย', color: 'bg-amber-500 hover:bg-amber-600', textColor: 'text-amber-600 dark:text-amber-400', badgeClass: 'bg-amber-500/10 text-amber-600 dark:bg-amber-500/20 dark:text-amber-400' },
  { id: 'leave', label: 'ลา', color: 'bg-blue-500 hover:bg-blue-600', textColor: 'text-blue-600 dark:text-blue-400', badgeClass: 'bg-blue-500/10 text-blue-600 dark:bg-blue-500/20 dark:text-blue-400' },
  { id: 'absent', label: 'ขาดเรียน', color: 'bg-red-500 hover:bg-red-600', textColor: 'text-red-600 dark:text-red-400', badgeClass: 'bg-red-500/10 text-red-600 dark:bg-red-500/20 dark:text-red-400' },
] as const;

const GuidanceAttendancePage: React.FC = () => {
  const navigate = useNavigate();
  const dispatch = useDispatch();
  const isPwaMode = usePwaMode();

  const currentUser = useSelector((state: RootState) => state.auth.user);
  const schoolId = (currentUser as any)?.schoolId;
  const { teachers: teacherMap, status: teacherMapStatus } = useSelector((state: RootState) => state.userMap);
  const calendarState = useSelector((state: RootState) => state.calendar);
  const schoolSettingsState = useSelector((state: RootState) => state.schoolSettings);

  // Core Filters & Selections
  const [currentDate, setCurrentDate] = useState<Date>(new Date());
  const [selectedClassKey, setSelectedClassKey] = useState<string>('');
  const [selectedRoom, setSelectedRoom] = useState<string>('');
  
  // Roster & Attendance State
  const [students, setStudents] = useState<Student[]>([]);
  const [attendance, setAttendance] = useState<Record<string, 'present' | 'absent' | 'late' | 'leave'>>({});
  const [studentLeaves, setStudentLeaves] = useState<Record<string, { isLeave: boolean; leaveType?: string }>>({});
  const [guidanceTopic, setGuidanceTopic] = useState<string>('');
  const [guidanceNote, setGuidanceNote] = useState<string>('');
  
  // Page UI Statuses
  const [loading, setLoading] = useState<boolean>(true);
  const [studentsLoading, setStudentsLoading] = useState<boolean>(false);
  const [isSubmitted, setIsSubmitted] = useState<boolean>(false);
  const [isHoliday, setIsHoliday] = useState<boolean>(false);
  const [holidayName, setHolidayName] = useState<string>('');
  const [studentSearch, setStudentSearch] = useState<string>('');
  const [currentTeacherProfile, setCurrentTeacherProfile] = useState<any | null>(null);
  const [teacherProfileLoading, setTeacherProfileLoading] = useState<boolean>(true);

  const currentTeacher = useMemo(() => {
    const teachersArr = Object.values(teacherMap || {}) as any[];
    const uid = String((currentUser as any)?.uid || '');
    const email = String((currentUser as any)?.email || '').toLowerCase();
    const matchedFromMap = teachersArr.find((t: any) =>
      String(t.uid || '') === uid ||
      String(t.id || '') === uid ||
      (email && String(t.email || '').toLowerCase() === email)
    );
    
    if (matchedFromMap && currentTeacherProfile) {
      return { ...matchedFromMap, ...currentTeacherProfile };
    }
    return matchedFromMap || currentTeacherProfile;
  }, [teacherMap, currentUser, currentTeacherProfile]);

  // Load School Settings, Calendar, and Teachers Map on load
  useEffect(() => {
    if (schoolId) {
      dispatch(fetchSchoolSettings(schoolId) as any);
      dispatch(fetchCalendar(schoolId) as any);
      dispatch(fetchTeachersMap(schoolId) as any);
    }
  }, [schoolId, dispatch]);

  useEffect(() => {
    let cancelled = false;

    const fetchCurrentTeacherProfile = async () => {
      if (!schoolId || !currentUser?.uid) {
        setTeacherProfileLoading(false);
        return;
      }

      setTeacherProfileLoading(true);
      try {
        const userSnap = await getDoc(doc(db, 'users', currentUser.uid));
        const userData = userSnap.exists() ? userSnap.data() : {};
        const teachersRef = collection(db, 'school-settings', schoolId, 'teachers');

        let teacherSnap = await getDoc(doc(db, 'school-settings', schoolId, 'teachers', currentUser.uid));

        if (!teacherSnap.exists()) {
          const byUid = await getDocs(query(teachersRef, where('uid', '==', currentUser.uid)));
          teacherSnap = byUid.docs[0] || teacherSnap;
        }

        const email = String((currentUser as any)?.email || userData.email || '').trim();
        if (!teacherSnap.exists() && email) {
          const byEmail = await getDocs(query(teachersRef, where('email', '==', email)));
          teacherSnap = byEmail.docs[0] || teacherSnap;
        }

        if (!teacherSnap.exists() && userData.teacherId) {
          const byTeacherId = await getDocs(query(teachersRef, where('teacherId', '==', userData.teacherId)));
          teacherSnap = byTeacherId.docs[0] || teacherSnap;
        }

        if (!cancelled) {
          if (teacherSnap.exists()) {
            const data = teacherSnap.data() as any;
            const firstName = data.firstName || userData.firstName || '';
            const lastName = data.lastName || userData.lastName || '';
            const title = data.title || userData.title || '';
            setCurrentTeacherProfile({
              ...userData,
              ...data,
              id: teacherSnap.id,
              uid: data.uid || currentUser.uid,
              name: data.name || `${title}${firstName} ${lastName}`.trim() || (currentUser as any)?.fullName || '',
            });
          } else {
            setCurrentTeacherProfile(null);
          }
        }
      } catch (error) {
        console.error('Error loading current guidance teacher profile:', error);
        if (!cancelled) setCurrentTeacherProfile(null);
      } finally {
        if (!cancelled) setTeacherProfileLoading(false);
      }
    };

    fetchCurrentTeacherProfile();

    return () => {
      cancelled = true;
    };
  }, [schoolId, currentUser?.uid, (currentUser as any)?.email]);

  const activeAcademicYear = String(calendarState.academicYear || getCurrentThaiYear());
  
  const activeSemester = useMemo(() => {
    const dateStr = toIsoDate(currentDate);
    const matchedTerm = calendarState.terms.find(term => term.startDate && term.endDate && dateStr >= term.startDate && dateStr <= term.endDate);
    return matchedTerm?.id === 'term2' ? '2' : '1';
  }, [currentDate, calendarState.terms]);

  // Check Holiday / Weekend
  useEffect(() => {
    if (!schoolId) return;
    setIsHoliday(false);
    setHolidayName('');

    const dateStr = toIsoDate(currentDate);
    if (calendarState.status === 'succeeded') {
      const events = calendarState.rawData?.events || {};
      const event = events[dateStr];

      if (event?.type === 'schoolDay') return;

      const isWithinTerm = calendarState.terms.some(t => t.startDate && t.endDate && dateStr >= t.startDate && dateStr <= t.endDate);
      if (!isWithinTerm) {
        setIsHoliday(true);
        setHolidayName('อยู่นอกภาคเรียน (ไม่อยู่ในช่วงวันเรียน 100 วัน)');
        return;
      }

      const dayOfWeek = currentDate.getDay();
      if (dayOfWeek === 0 || dayOfWeek === 6) {
        setIsHoliday(true);
        setHolidayName(dayOfWeek === 0 ? 'วันอาทิตย์' : 'วันเสาร์');
        return;
      }

      if (event?.type === 'holiday' || event?.type === 'specialHoliday') {
        setIsHoliday(true);
        setHolidayName(event.description || 'วันหยุดโรงเรียน');
      }
    }
  }, [currentDate, schoolId, calendarState.status, calendarState.rawData, calendarState.terms]);

  // Determine if the logged-in user is a guidance teacher or has administrative access.
  const isGuidanceOrAdmin = useMemo(() => {
    if (!currentUser) return false;
    
    // If explicitly marked as a guidance teacher or has other special teacher roles, they see all classes
    if (
      currentTeacher?.isGuidanceTeacher ||
      currentTeacher?.isHeadOfLearningArea ||
      currentTeacher?.isHeadOfAssessment
    ) {
      return true;
    }
    
    // Check if user is admin
    const roles = Array.isArray(currentUser.role) 
      ? currentUser.role 
      : (typeof currentUser.role === 'string' ? [currentUser.role] : []);
    const isAdmin = roles.some((r: string) => 
      ['school_admin', 'academic_admin', 'super_admin', 'academic', 'admin', 'academic_department'].includes(r.toLowerCase())
    );
    
    if (isAdmin) {
      return true;
    }
    
    return false;
  }, [currentUser, currentTeacher]);

  // Identify the homeroom class key of the current teacher
  const homeroomClassKey = useMemo(() => {
    if (!currentTeacher || !schoolSettingsState.availableClassOptions) return '';
    return resolveClassKeyFromTeacher(currentTeacher, schoolSettingsState.availableClassOptions);
  }, [currentTeacher, schoolSettingsState.availableClassOptions]);

  // Filtered Class Options
  const classOptions = useMemo(() => {
    if (schoolSettingsState.status !== 'succeeded') return [];
    if (isGuidanceOrAdmin) {
      return schoolSettingsState.availableClassOptions;
    }
    // For regular teachers, they must be a homeroom teacher to have access
    if (homeroomClassKey) {
      return schoolSettingsState.availableClassOptions.filter(([key]) => key === homeroomClassKey);
    }
    return [];
  }, [isGuidanceOrAdmin, homeroomClassKey, schoolSettingsState.availableClassOptions, schoolSettingsState.status]);

  // Filtered Room Options
  const roomOptions = useMemo(() => {
    if (isGuidanceOrAdmin) {
      return Array.from({ length: 15 }, (_, i) => (i + 1).toString());
    }
    const teacherRoom = getTeacherHomeroomRoom(currentTeacher);
    if (teacherRoom) {
      return [teacherRoom];
    }
    return [];
  }, [isGuidanceOrAdmin, currentTeacher]);

  // Set initial level & room from teacher's homeroom
  useEffect(() => {
    const teacherReady = teacherMapStatus === 'succeeded' || teacherMapStatus === 'failed';
    if (schoolSettingsState.status === 'succeeded' && teacherReady && !teacherProfileLoading) {
      const teacherRoom = getTeacherHomeroomRoom(currentTeacher);
      if (isGuidanceOrAdmin) {
        if (homeroomClassKey) {
          setSelectedClassKey(homeroomClassKey);
          setSelectedRoom(teacherRoom || '1');
        } else if (schoolSettingsState.availableClassOptions.length > 0) {
          setSelectedClassKey(schoolSettingsState.availableClassOptions[0][0]);
          setSelectedRoom('1');
        }
      } else {
        if (homeroomClassKey) {
          setSelectedClassKey(homeroomClassKey);
          setSelectedRoom(teacherRoom || '1');
        } else {
          setSelectedClassKey('');
          setSelectedRoom('');
        }
      }
      setLoading(false);
    }
  }, [schoolSettingsState.status, teacherMapStatus, teacherProfileLoading, isGuidanceOrAdmin, homeroomClassKey, currentTeacher]);

  // Fetch Student Roster & Approved Leaves
  const fetchRosterAndAttendance = async () => {
    if (!schoolId || !selectedClassKey || !selectedRoom) return;
    setStudentsLoading(true);
    setIsSubmitted(false);

    const className = CLASSES[selectedClassKey] || selectedClassKey;

    try {
      const studentsRef = collection(db, 'school-settings', schoolId, 'students');
      const classVariants = getClassLevelVariants(selectedClassKey);
      const roomVariants = getRoomVariants(selectedRoom);
      const studentQuery = query(studentsRef, where('classLevel', 'in', classVariants.slice(0, 30)));
      const snapshot = await getDocs(studentQuery);
      const studentList = snapshot.docs
        .map(docSnap => {
          const data = docSnap.data() as any;
          return {
            id: docSnap.id,
            ...data,
            number: data.studentNumber || data.number || '',
            studentId: data.studentId || '',
            studentNumber: data.studentNumber || data.number || '',
            prefix: data.title || data.prefix || '',
            nickname: data.nickname || '',
          } as Student;
        })
        .filter(student => {
          const status = String(student.status || (student as any).studentStatus || '').trim();
          const activeStatus = !status || status === 'กำลังศึกษา' || status === 'active';
          return activeStatus &&
            classVariants.includes(String(student.classLevel || '').trim()) &&
            roomVariants.includes(String(student.room || '').trim());
        })
        .sort((a, b) => (parseInt(a.number || '0', 10) || 0) - (parseInt(b.number || '0', 10) || 0));

      setStudents(studentList);

      // Pre-populate standard attendance mapping as 'present'
      const initialAttendance: Record<string, 'present' | 'absent' | 'late' | 'leave'> = {};
      const initialLeaves: Record<string, { isLeave: boolean; leaveType?: string }> = {};
      studentList.forEach(student => {
        initialAttendance[student.id] = 'present';
      });

      // Fetch Student Leaves dynamically
      const todayStr = toIsoDate(currentDate);
      await Promise.all(studentList.map(async (student) => {
        try {
          const leaveQ = query(
            collection(db, 'school-settings', schoolId, 'students', student.id, 'leave_summary'), 
            where('status', '==', 'approved')
          );
          const leaveSnap = await getDocs(leaveQ);
          const validLeave = leaveSnap.docs.find(leaveDoc => {
            const data = leaveDoc.data();
            const start = normalizeDateValue(data.startDate);
            const end = normalizeDateValue(data.endDate);
            return start && end && start <= todayStr && end >= todayStr;
          });

          if (validLeave) {
            const lType = validLeave.data().leaveType;
            initialAttendance[student.id] = lType === 'ไปราชการ/กิจกรรม' ? 'present' : 'leave';
            initialLeaves[student.id] = { isLeave: true, leaveType: lType };
          }
        } catch (err) {
          console.error(`Error loading leave for student ${student.id}:`, err);
        }
      }));

      setStudentLeaves(initialLeaves);

      // Load Saved Attendance if it exists
      const dateId = toThaiDateId(currentDate);
      const attendanceId = `${dateId}_GUIDANCE_${selectedClassKey}_P0`;
      
      const existingResults = await Promise.all(studentList.map(async (student) => {
        const attendanceRef = doc(db, 'school-settings', schoolId, 'students', student.id, 'ClassroomAttendance', attendanceId);
        const attendanceSnap = await getDoc(attendanceRef);
        return attendanceSnap.exists() ? { id: student.id, status: attendanceSnap.data().status } : null;
      }));

      let hasRecord = false;
      const loadedAttendance = { ...initialAttendance };
      existingResults.forEach(res => {
        if (res) {
          loadedAttendance[res.id] = res.status;
          hasRecord = true;
        }
      });
      setAttendance(loadedAttendance);

      // Fetch daily topic & notes summary
      const dailyRef = doc(db, 'school-settings', schoolId, 'guidance-attendance', `${dateId}_${selectedClassKey}_${selectedRoom}`);
      const dailySnap = await getDoc(dailyRef);
      if (dailySnap.exists()) {
        const dailyData = dailySnap.data();
        setGuidanceTopic(dailyData.topic || '');
        setGuidanceNote(dailyData.note || '');
      } else {
        setGuidanceTopic('');
        setGuidanceNote('');
      }

      if (hasRecord) {
        setIsSubmitted(true);
        Swal.fire({
          icon: 'info',
          title: 'ตรวจพบการเช็คชื่อเดิม',
          text: 'พบข้อมูลที่บันทึกไว้แล้วในวันนี้ คุณสามารถกดแก้ไขเพื่อปรับปรุงข้อมูลได้',
          timer: 1800,
          showConfirmButton: false
        });
      }
    } catch (error) {
      console.error('Error fetching guidance roster:', error);
      Swal.fire('เกิดข้อผิดพลาด', 'ไม่สามารถดึงข้อมูลรายชื่อนักเรียนได้', 'error');
    } finally {
      setStudentsLoading(false);
    }
  };

  useEffect(() => {
    fetchRosterAndAttendance();
  }, [selectedClassKey, selectedRoom, currentDate, schoolId]);

  // Bulk set all to 'present'
  const handleSelectAllPresent = () => {
    if (isSubmitted && !isHoliday) return;
    const updated = { ...attendance };
    students.forEach(st => {
      // Don't override if student has approved leave (that isn't 'ไปราชการ')
      const stLeave = studentLeaves[st.id];
      if (stLeave && stLeave.leaveType !== 'ไปราชการ/กิจกรรม') {
        updated[st.id] = 'leave';
      } else {
        updated[st.id] = 'present';
      }
    });
    setAttendance(updated);
    Swal.fire({
      icon: 'success',
      title: 'ปรับเป็นมาเรียนทั้งหมด',
      text: 'ปรับสถานะของนักเรียนทุกคน (ยกเว้นผู้ที่ได้รับอนุมัติลาก่อนหน้านี้) เป็นมาเรียนเรียบร้อย',
      timer: 1200,
      showConfirmButton: false
    });
  };

  // Toggle status for individual student
  const handleToggleStatus = (studentId: string, status: 'present' | 'absent' | 'late' | 'leave') => {
    if (isSubmitted) return;
    setAttendance(prev => ({
      ...prev,
      [studentId]: status
    }));
  };

  // Save Attendance to Firestore
  const handleSaveAttendance = async () => {
    if (!schoolId || !selectedClassKey || !selectedRoom) return;

    try {
      const dateId = toThaiDateId(currentDate);
      const normalizedDateObj = new Date(currentDate.getFullYear(), currentDate.getMonth(), currentDate.getDate(), 12, 0, 0);
      const className = CLASSES[selectedClassKey] || selectedClassKey;
      const attendanceId = `${dateId}_GUIDANCE_${selectedClassKey}_P0`;
      
      const batch = writeBatch(db);

      // Write student specific documents
      students.forEach(student => {
        const studentRef = doc(db, 'school-settings', schoolId, 'students', student.id, 'ClassroomAttendance', attendanceId);
        batch.set(studentRef, {
          schoolId,
          studentId: student.id,
          date: Timestamp.fromDate(normalizedDateObj),
          classId: selectedClassKey,
          className: className,
          room: selectedRoom || null,
          period: 0,
          subjectName: 'กิจกรรมแนะแนว',
          subjectCode: 'GUIDANCE',
          courseId: 'guidance',
          teacherId: currentTeacher?.id || currentUser?.uid || 'unknown',
          teacherName: currentTeacher?.name || currentUser?.fullName || 'unknown',
          status: attendance[student.id] || 'present',
          academicYear: activeAcademicYear,
          semester: activeSemester,
          guidanceTopic,
          guidanceNote,
          attendanceType: 'guidance',
          updatedAt: Timestamp.now(),
        }, { merge: true });
      });

      // Write daily summary document
      const dailyRef = doc(db, 'school-settings', schoolId, 'guidance-attendance', `${dateId}_${selectedClassKey}_${selectedRoom}`);
      batch.set(dailyRef, {
        schoolId,
        date: Timestamp.fromDate(normalizedDateObj),
        classId: selectedClassKey,
        className: className,
        room: selectedRoom || null,
        teacherId: currentTeacher?.id || currentUser?.uid || 'unknown',
        teacherName: currentTeacher?.name || currentUser?.fullName || 'unknown',
        topic: guidanceTopic,
        note: guidanceNote,
        academicYear: activeAcademicYear,
        semester: activeSemester,
        updatedAt: Timestamp.now(),
      }, { merge: true });

      await batch.commit();
      
      Swal.fire({
        icon: 'success',
        title: 'บันทึกสำเร็จ',
        text: 'บันทึกข้อมูลการเช็คชื่อแนะแนวเรียบร้อยแล้ว',
        timer: 1500,
        showConfirmButton: false
      });
      setIsSubmitted(true);
    } catch (error) {
      console.error('Error saving guidance attendance:', error);
      Swal.fire('เกิดข้อผิดพลาด', 'ไม่สามารถบันทึกข้อมูลการเช็คชื่อได้', 'error');
    }
  };

  // Dynamic Statistics
  const stats = useMemo(() => {
    const counts = { present: 0, late: 0, leave: 0, absent: 0 };
    students.forEach(st => {
      const status = attendance[st.id] || 'present';
      counts[status]++;
    });
    return counts;
  }, [students, attendance]);

  // Filter students based on search string
  const filteredStudents = useMemo(() => {
    const search = studentSearch.trim().toLowerCase();
    if (!search) return students;
    return students.filter(st => {
      const fullName = `${st.prefix || ''}${st.firstName || ''} ${st.lastName || ''}`.toLowerCase();
      const code = String(st.studentId || '').toLowerCase();
      const num = String(st.number || '').toLowerCase();
      return fullName.includes(search) || code.includes(search) || num.includes(search);
    });
  }, [students, studentSearch]);

  if (loading) {
    return (
      <MainLayout>
        <div className="flex flex-col items-center justify-center min-h-[60vh] space-y-4">
          <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-indigo-600"></div>
          <p className="text-gray-500 dark:text-gray-400 font-bold">กำลังโหลดข้อมูลระบบ...</p>
        </div>
      </MainLayout>
    );
  }

  return (
    <MainLayout>
      <div className={`text-gray-900 dark:text-white transition-colors duration-300 min-h-screen overflow-x-hidden ${isPwaMode ? 'px-2.5 py-3 pb-6' : 'p-4 sm:p-6 space-y-6'}`}>
        <div className={`${isPwaMode ? 'max-w-full' : 'max-w-7xl'} mx-auto min-w-0 ${isPwaMode ? 'space-y-4' : 'space-y-6'}`}>
          
          {/* Top Header Card with Back Button */}
          {!isPwaMode && <BackButton to="/academic/hub/attendance" className="mb-4" />}
          
          <div className={`flex ${isPwaMode ? 'flex-col p-4 rounded-2xl gap-3' : 'flex-col sm:flex-row sm:items-center justify-between gap-4 p-6 rounded-3xl'} bg-gradient-to-r from-indigo-600 via-indigo-700 to-violet-800 shadow-xl text-white`}>
            <div className="flex items-center gap-4">
              {isPwaMode && <BackButton to="/academic/hub/attendance" className="text-white bg-white/10 hover:bg-white/20 p-2 rounded-xl" />}
              <div>
                <h1 className={`font-extrabold tracking-tight flex items-center gap-2 ${isPwaMode ? 'text-lg' : 'text-2xl sm:text-3xl'}`}>
                  <BookOpen className={isPwaMode ? 'h-5 w-5' : 'h-8 w-8'} />
                  ระบบเช็คชื่อแนะแนว
                </h1>
                <p className={`text-indigo-100 font-medium ${isPwaMode ? 'text-xs mt-0.5' : 'text-sm sm:text-base mt-1'}`}>
                  ปีการศึกษา {activeAcademicYear} | ภาคเรียนที่ {activeSemester}
                </p>
              </div>
            </div>
            
            <div className={`flex items-center gap-2 self-start ${isPwaMode ? 'w-full justify-between' : 'sm:self-center'} bg-white/10 backdrop-blur-md px-4 py-2 rounded-2xl border border-white/10 shadow-inner`}>
              <Calendar className="h-5 w-5 text-indigo-200" />
              <input
                type="date"
                value={toIsoDate(currentDate)}
                onChange={(e) => setCurrentDate(new Date(e.target.value))}
                className="bg-transparent text-white focus:outline-none font-bold text-sm"
              />
            </div>
          </div>

        {/* Holiday Warning Banner */}
        {isHoliday && (
          <div className="bg-amber-500/10 border-2 border-amber-500/30 rounded-2xl p-5 flex items-start gap-3.5 text-amber-800 dark:text-amber-400 shadow-sm animate-pulse">
            <AlertCircle className="h-6 w-6 text-amber-500 shrink-0 mt-0.5" />
            <div>
              <h3 className="font-extrabold text-base">วันนี้เป็นวันหยุด ({holidayName})</h3>
              <p className="text-sm font-medium mt-0.5 opacity-90">
                คุณยังสามารถดูประวัติการเช็คชื่อย้อนหลังได้ แต่จะไม่สามารถแก้ไขหรือบันทึกข้อมูลการเช็คชื่อใหม่ได้ในวันหยุดนี้
              </p>
            </div>
          </div>
        )}

        {/* Two Column Section: Inputs & Controls + Student Roster or Warning Card */}
        {!isGuidanceOrAdmin && !homeroomClassKey ? (
          <div className="bg-white dark:bg-[#1e1f23] rounded-3xl p-8 shadow-md border border-gray-100 dark:border-gray-800 text-center max-w-2xl mx-auto my-12 space-y-5">
            <div className="mx-auto w-16 h-16 rounded-full bg-red-100 dark:bg-red-950/30 flex items-center justify-center text-red-600 dark:text-red-400">
              <AlertCircle size={32} />
            </div>
            <h2 className="text-xl font-extrabold text-gray-800 dark:text-white">ไม่สามารถเข้าใช้งานหน้านี้ได้</h2>
            <p className="text-gray-500 dark:text-gray-400 text-sm leading-relaxed font-semibold">
              ขออภัย เฉพาะครูแนะแนวหรือครูประจำชั้นเท่านั้นที่สามารถบันทึกหรือตรวจสอบข้อมูลการลงเวลาเรียนกิจกรรมแนะแนวได้ หากคุณปฏิบัติหน้าที่ดังกล่าว กรุณาติดต่อฝ่ายวิชาการเพื่อเปิดใช้งานสิทธิ์ในข้อมูลประวัติส่วนตัวของคุณ
            </p>
            <div className="pt-2">
              <button
                onClick={() => navigate('/academic/hub/attendance')}
                className="px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-bold shadow-md transition active:scale-95 flex items-center justify-center gap-2 mx-auto"
              >
                <Home size={16} />
                กลับสู่หน้าเมนู
              </button>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          
          {/* Left Column: Filter and Summary Config Card (4 cols) */}
          <div className="lg:col-span-4 space-y-6">
            
            {/* Filter Glass Card */}
            <div className={`bg-white dark:bg-[#1e1f23] shadow-md border border-gray-100 dark:border-gray-800 space-y-5 transition-all ${isPwaMode ? 'p-4 rounded-2xl' : 'p-6 rounded-3xl'}`}>
              <h2 className="text-lg font-extrabold text-gray-800 dark:text-white flex items-center gap-2 border-b border-gray-100 dark:border-gray-800 pb-3">
                <LayoutGrid className="h-5 w-5 text-indigo-500" />
                ระบุระดับชั้นและห้องเรียน
              </h2>

              <div className="space-y-4">
                {/* Level selection */}
                <div>
                  <label className="block text-xs font-black text-gray-400 uppercase tracking-wider mb-2">ระดับชั้น</label>
                  <select
                    value={selectedClassKey}
                    onChange={(e) => setSelectedClassKey(e.target.value)}
                    disabled={studentsLoading}
                    className="w-full h-12 px-4 rounded-xl border border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-white/5 text-gray-800 dark:text-gray-200 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none font-bold transition"
                  >
                    {classOptions.map(([key, label]) => (
                      <option key={key} value={key} className="dark:bg-[#1e1f23]">{label}</option>
                    ))}
                  </select>
                </div>

                {/* Room selection */}
                <div>
                  <label className="block text-xs font-black text-gray-400 uppercase tracking-wider mb-2">ห้องเรียน</label>
                  <select
                    value={selectedRoom}
                    onChange={(e) => setSelectedRoom(e.target.value)}
                    disabled={studentsLoading}
                    className="w-full h-12 px-4 rounded-xl border border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-white/5 text-gray-800 dark:text-gray-200 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none font-bold transition"
                  >
                    {roomOptions.map(r => (
                      <option key={r} value={r} className="dark:bg-[#1e1f23]">ห้อง {r}</option>
                    ))}
                  </select>
                </div>
              </div>
            </div>

            {/* Daily Details Glass Card */}
            <div className={`bg-white dark:bg-[#1e1f23] shadow-md border border-gray-100 dark:border-gray-800 space-y-5 transition-all ${isPwaMode ? 'p-4 rounded-2xl' : 'p-6 rounded-3xl'}`}>
              <h2 className="text-lg font-extrabold text-gray-800 dark:text-white flex items-center gap-2 border-b border-gray-100 dark:border-gray-800 pb-3">
                <ClipboardCheck className="h-5 w-5 text-indigo-500" />
                รายละเอียดแนะแนววันนี้
              </h2>

              <div className="space-y-4">
                {/* Guidance Topic */}
                <div>
                  <label className="block text-xs font-black text-gray-400 uppercase tracking-wider mb-2">เรื่องที่แนะแนว (หัวข้อหลัก)</label>
                  <input
                    type="text"
                    value={guidanceTopic}
                    onChange={(e) => setGuidanceTopic(e.target.value)}
                    disabled={isSubmitted || isHoliday}
                    placeholder="เช่น แนะนำหลักสูตรศึกษาต่อ ม.ปลาย"
                    className="w-full h-12 px-4 rounded-xl border border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-white/5 text-gray-800 dark:text-gray-200 placeholder-gray-400 focus:ring-2 focus:ring-indigo-500 outline-none font-bold transition"
                  />
                </div>

                {/* Additional Notes */}
                <div>
                  <label className="block text-xs font-black text-gray-400 uppercase tracking-wider mb-2">บันทึกเพิ่มเติม</label>
                  <textarea
                    rows={4}
                    value={guidanceNote}
                    onChange={(e) => setGuidanceNote(e.target.value)}
                    disabled={isSubmitted || isHoliday}
                    placeholder="ระบุพฤติกรรม ข้อสังเกต หรือรายละเอียดการจัดกิจกรรมเพิ่มเติม..."
                    className="w-full p-4 rounded-xl border border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-white/5 text-gray-800 dark:text-gray-200 placeholder-gray-400 focus:ring-2 focus:ring-indigo-500 outline-none font-bold transition resize-none"
                  />
                </div>
              </div>
            </div>

          </div>

          {/* Right Column: Attendance Grid & Save Controls (8 cols) */}
          <div className="lg:col-span-8 space-y-6">

            {/* Attendance Roster Summary Cards */}
            <div className={`grid ${isPwaMode ? 'grid-cols-2 gap-2.5' : 'grid-cols-2 sm:grid-cols-5 gap-3.5'}`}>
              
              {/* Present Box */}
              <div className={`bg-emerald-50 dark:bg-emerald-500/10 border border-emerald-100 dark:border-emerald-500/20 rounded-2xl text-center transition-all duration-300 ${isPwaMode ? 'p-3' : 'p-4'}`}>
                <span className="block text-xs font-black text-emerald-600 dark:text-emerald-400 tracking-wider">มาเรียน</span>
                <span className="block text-3xl font-black text-emerald-700 dark:text-emerald-300 mt-1">{stats.present}</span>
              </div>

              {/* Late Box */}
              <div className={`bg-amber-50 dark:bg-amber-500/10 border border-amber-100 dark:border-amber-500/20 rounded-2xl text-center transition-all duration-300 ${isPwaMode ? 'p-3' : 'p-4'}`}>
                <span className="block text-xs font-black text-amber-600 dark:text-amber-400 tracking-wider">สาย</span>
                <span className="block text-3xl font-black text-amber-700 dark:text-amber-300 mt-1">{stats.late}</span>
              </div>

              {/* Leave Box */}
              <div className={`bg-blue-50 dark:bg-blue-500/10 border border-blue-100 dark:border-blue-500/20 rounded-2xl text-center transition-all duration-300 ${isPwaMode ? 'p-3' : 'p-4'}`}>
                <span className="block text-xs font-black text-blue-600 dark:text-blue-400 tracking-wider">ลา</span>
                <span className="block text-3xl font-black text-blue-700 dark:text-blue-300 mt-1">{stats.leave}</span>
              </div>

              {/* Absent Box */}
              <div className={`bg-red-50 dark:bg-red-500/10 border border-red-100 dark:border-red-500/20 rounded-2xl text-center transition-all duration-300 ${isPwaMode ? 'p-3' : 'p-4'}`}>
                <span className="block text-xs font-black text-red-600 dark:text-red-400 tracking-wider">ขาดเรียน</span>
                <span className="block text-3xl font-black text-red-700 dark:text-red-300 mt-1">{stats.absent}</span>
              </div>

              {/* Total Box */}
              <div className={`bg-gray-50 dark:bg-white/5 border border-gray-200 dark:border-gray-800 rounded-2xl text-center transition-all duration-300 ${isPwaMode ? 'col-span-2 p-3' : 'col-span-2 sm:col-span-1 p-4'}`}>
                <span className="block text-xs font-black text-gray-500 dark:text-gray-400 tracking-wider">ทั้งหมด</span>
                <span className="block text-3xl font-black text-gray-700 dark:text-gray-200 mt-1">{students.length}</span>
              </div>

            </div>

            {/* Master Roster Renders */}
            <div className={`bg-white dark:bg-[#1e1f23] rounded-3xl shadow-md border border-gray-100 dark:border-gray-800 overflow-hidden ${isPwaMode ? 'p-0 bg-transparent dark:bg-transparent border-none shadow-none' : ''}`}>
              
              {/* Roster Header Panel */}
              <div className={`border-b border-gray-100 dark:border-gray-800 bg-gray-50/50 dark:bg-white/[0.02] flex flex-col sm:flex-row justify-between gap-4 items-center ${isPwaMode ? 'p-2.5 bg-transparent dark:bg-transparent border-none' : 'p-5'}`}>
                <div className="relative w-full sm:w-80">
                  <span className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-gray-400">
                    <Search size={18} />
                  </span>
                  <input
                    type="text"
                    value={studentSearch}
                    onChange={(e) => setStudentSearch(e.target.value)}
                    placeholder="ค้นหาชื่อ เลขที่ หรือ รหัสประจำตัว..."
                    className="w-full h-10 pl-10 pr-4 rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-[#151619] text-gray-800 dark:text-gray-200 placeholder-gray-400 focus:ring-2 focus:ring-indigo-500 outline-none text-sm font-bold transition"
                  />
                </div>

                <div className={`flex gap-2 w-full sm:w-auto ${isPwaMode ? 'flex-col sm:flex-row' : ''}`}>
                  <button
                    onClick={handleSelectAllPresent}
                    disabled={isSubmitted || isHoliday || students.length === 0}
                    className="w-full sm:w-auto px-4 h-10 rounded-xl bg-indigo-50 text-indigo-600 dark:bg-indigo-500/10 dark:text-indigo-400 border border-indigo-200 dark:border-indigo-800/40 hover:bg-indigo-100 dark:hover:bg-indigo-500/20 text-xs font-black transition active:scale-95 disabled:opacity-50 disabled:pointer-events-none flex items-center justify-center gap-1.5"
                  >
                    <CheckCircle2 size={16} />
                    ทั้งหมด มาเรียน
                  </button>

                  {isSubmitted ? (
                    <button
                      onClick={() => setIsSubmitted(false)}
                      disabled={isHoliday}
                      className="w-full sm:w-auto px-5 h-10 rounded-xl bg-amber-500 hover:bg-amber-600 text-white text-xs font-black shadow-md transition active:scale-95 disabled:opacity-50 disabled:pointer-events-none flex items-center justify-center gap-1.5"
                    >
                      <RefreshCw size={15} />
                      แก้ไข
                    </button>
                  ) : (
                    <button
                      onClick={handleSaveAttendance}
                      disabled={isHoliday || students.length === 0}
                      className="w-full sm:w-auto px-5 h-10 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-black shadow-md shadow-indigo-600/20 transition active:scale-95 disabled:opacity-50 disabled:pointer-events-none flex items-center justify-center gap-1.5"
                    >
                      <Save size={15} />
                      บันทึกเช็คชื่อ
                    </button>
                  )}
                </div>
              </div>

              {/* Roster Listing */}
              {studentsLoading ? (
                <div className="flex flex-col items-center justify-center py-20 space-y-3">
                  <div className="animate-spin rounded-full h-10 w-10 border-t-2 border-b-2 border-indigo-500"></div>
                  <p className="text-gray-400 dark:text-gray-500 text-sm font-bold">กำลังค้นหารายชื่อนักเรียน...</p>
                </div>
              ) : filteredStudents.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-20 text-center px-4">
                  <Users className="h-14 w-14 text-gray-300 dark:text-gray-700 mb-3" />
                  <h3 className="font-extrabold text-gray-700 dark:text-gray-300 text-lg">ไม่พบข้อมูลรายชื่อนักเรียน</h3>
                  <p className="text-gray-400 dark:text-gray-500 text-sm mt-1 max-w-sm">
                    {studentSearch ? 'ไม่มีรายชื่อที่ตรงกับข้อความที่พิมพ์ค้นหา' : 'ไม่มีนักเรียนในระดับชั้นและห้องเรียนนี้'}
                  </p>
                </div>
              ) : isPwaMode ? (
                <div className="grid grid-cols-1 gap-3">
                  {filteredStudents.map((st) => {
                    const stStatus = attendance[st.id] || 'present';
                    const leaveData = studentLeaves[st.id];

                    return (
                      <div
                        key={st.id}
                        className={`relative group rounded-2xl p-4 border-2 transition-all duration-300 hover:shadow-lg ${
                          stStatus === 'present' ? 'border-green-200 dark:border-green-900 bg-green-50/30 dark:bg-green-900/5' :
                          stStatus === 'late' ? 'border-yellow-200 dark:border-yellow-900 bg-yellow-50/30 dark:bg-yellow-900/5' :
                          stStatus === 'leave' ? 'border-blue-200 dark:border-blue-900 bg-blue-50/30 dark:bg-blue-900/5' :
                          'border-red-200 dark:border-red-900 bg-red-50/30 dark:bg-red-900/5'
                        }`}
                      >
                        <div className="flex flex-col gap-3.5">
                          <div className="flex items-center gap-3.5">
                            <div className="h-8 w-8 rounded-full bg-gray-100 dark:bg-white/5 border border-gray-200/50 dark:border-gray-800 flex items-center justify-center text-xs font-black text-gray-500 dark:text-gray-400 shrink-0">
                              {st.number || '-'}
                            </div>
                            <Link to={`/school/${schoolId}/students/view/${st.id}`} className="flex items-center group gap-3">
                              <ProfileAvatar
                                src={st.profileImageUrl || `https://ui-avatars.com/api/?name=${st.firstName}+${st.lastName}&background=random`}
                                alt={`${st.prefix || st.title || ''}${st.firstName || ''} ${st.lastName || ''}`}
                                className="h-11 w-11 border border-gray-100 dark:border-gray-800 shrink-0"
                              />
                              <div className="min-w-0">
                                <h4 className="font-bold text-gray-800 dark:text-gray-200 text-sm truncate">
                                  {st.studentId ? `${st.studentId} ` : ''}{st.prefix || st.title || ''}{st.firstName || ''} {st.lastName || ''}
                                </h4>
                                <p className="text-gray-400 text-[11px] font-medium truncate">
                                  เลขประจำตัว: {st.studentId || '-'}
                                </p>
                              </div>
                            </Link>
                          </div>

                          {leaveData?.isLeave && (
                            <div className="bg-blue-500/10 text-blue-500 dark:bg-blue-500/20 text-[10px] px-3 py-1 rounded-xl border border-blue-500/20 font-black flex items-center gap-1.5 w-fit">
                              <Info size={12} /> อนุมัติลา ({leaveData.leaveType})
                            </div>
                          )}

                          <div className="grid grid-cols-4 gap-1.5 w-full select-none">
                            {ATTENDANCE_OPTIONS.map((opt) => {
                              const active = stStatus === opt.id;
                              return (
                                <button
                                  key={opt.id}
                                  type="button"
                                  disabled={isSubmitted}
                                  onClick={() => handleToggleStatus(st.id, opt.id)}
                                  className={`h-9 px-1.5 rounded-xl border text-[11px] font-black transition-all ${
                                    active
                                      ? `${opt.color} border-transparent text-white shadow-sm active:scale-95`
                                      : 'bg-white dark:bg-[#1e1f23] border-gray-200 dark:border-gray-800 text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-white/5'
                                  } ${isSubmitted ? 'cursor-not-allowed opacity-90' : ''}`}
                                >
                                  {opt.label === 'ขาดเรียน' ? 'ขาด' : opt.label === 'มาเรียน' ? 'มา' : opt.label}
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="border border-gray-100 dark:border-gray-800 rounded-xl overflow-hidden bg-white dark:bg-[#1e1f21] shadow-sm">
                  {/* Table Header */}
                  <div className="px-4 sm:px-5 py-3 border-b border-gray-100 dark:border-gray-800 bg-gray-50/50 dark:bg-white/[0.02] flex justify-between items-center text-xs font-black text-gray-400 dark:text-gray-500 uppercase tracking-wider select-none">
                    <div className="flex items-center gap-3.5">
                      <div className="w-8 text-center shrink-0">เลขที่</div>
                      <div className="pl-14">ชื่อ-นามสกุล</div>
                    </div>
                    <div className="hidden sm:block w-[320px] text-center shrink-0">สถานะ</div>
                  </div>

                  <div className="divide-y divide-gray-100 dark:divide-gray-800 bg-white dark:bg-[#1e1f21]">
                    {filteredStudents.map((st) => {
                      const stStatus = attendance[st.id] || 'present';
                      const leaveData = studentLeaves[st.id];

                      return (
                        <div
                          key={st.id}
                          className="p-4 sm:p-5 flex flex-col sm:flex-row justify-between sm:items-center gap-4 hover:bg-gray-50/50 dark:hover:bg-white/[0.01] transition-all"
                        >
                          {/* Student profile details */}
                          <div className="flex items-center gap-3.5">
                            {/* Student Number Badge */}
                            <div className="h-8 w-8 rounded-full bg-gray-100 dark:bg-white/5 border border-gray-200/50 dark:border-gray-800 flex items-center justify-center text-xs font-black text-gray-500 dark:text-gray-400 shrink-0">
                              {st.number || '-'}
                            </div>

                            <Link to={`/school/${schoolId}/students/view/${st.id}`} className="flex items-center group gap-3.5">
                              <ProfileAvatar
                                src={st.profileImageUrl || `https://ui-avatars.com/api/?name=${st.firstName}+${st.lastName}&background=random`}
                                alt={`${st.prefix || st.title || ''}${st.firstName || ''} ${st.lastName || ''}`}
                                className="h-10 w-10 border border-gray-100 dark:border-gray-800 shrink-0"
                              />

                              <div>
                                <h4 className="font-bold text-gray-800 dark:text-gray-200 text-sm sm:text-base group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition-colors">
                                  {st.studentId ? `${st.studentId} ` : ''}{st.prefix || st.title || ''}{st.firstName || ''} {st.lastName || ''}
                                  {st.nickname && (
                                    <span className="text-gray-400 dark:text-gray-500 text-xs sm:text-sm font-medium ml-1.5">
                                      ({st.nickname})
                                    </span>
                                  )}
                                </h4>
                                {leaveData?.isLeave && (
                                  <div className="flex flex-wrap items-center gap-2 mt-1">
                                    <span className="inline-flex items-center gap-1 bg-blue-500/10 text-blue-500 dark:bg-blue-500/20 text-[10px] px-2 py-0.5 rounded-full border border-blue-500/20 font-black">
                                      <Info size={11} /> อนุมัติลา ({leaveData.leaveType})
                                    </span>
                                  </div>
                                )}
                              </div>
                            </Link>
                          </div>

                          {/* Status selection toggles */}
                          <div className="flex gap-1.5 w-full sm:w-auto shrink-0 select-none">
                            {ATTENDANCE_OPTIONS.map((opt) => {
                              const active = stStatus === opt.id;
                              return (
                                <button
                                  key={opt.id}
                                  type="button"
                                  disabled={isSubmitted}
                                  onClick={() => handleToggleStatus(st.id, opt.id)}
                                  className={`flex-1 sm:flex-initial h-10 px-3 sm:px-4 rounded-xl border text-xs font-black transition-all ${
                                    active
                                      ? `${opt.color} border-transparent text-white shadow-md active:scale-95`
                                      : 'bg-white dark:bg-[#1e1f23] border-gray-200 dark:border-gray-800 text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-white/5 hover:text-gray-700 dark:hover:text-gray-200'
                                  } ${isSubmitted ? 'cursor-not-allowed opacity-90' : ''}`}
                                >
                                  {opt.label}
                                </button>
                              );
                            })}
                          </div>

                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>


          </div>

        </div>
        )}
      </div>
    </div>
  </MainLayout>
  );
};

const CLASS_FULL_LABELS: Record<string, string> = {
  k1: 'อนุบาล 1',
  k2: 'อนุบาล 2',
  k3: 'อนุบาล 3',
  p1: 'ประถมศึกษาปีที่ 1',
  p2: 'ประถมศึกษาปีที่ 2',
  p3: 'ประถมศึกษาปีที่ 3',
  p4: 'ประถมศึกษาปีที่ 4',
  p5: 'ประถมศึกษาปีที่ 5',
  p6: 'ประถมศึกษาปีที่ 6',
  m1: 'มัธยมศึกษาปีที่ 1',
  m2: 'มัธยมศึกษาปีที่ 2',
  m3: 'มัธยมศึกษาปีที่ 3',
  m4: 'มัธยมศึกษาปีที่ 4',
  m5: 'มัธยมศึกษาปีที่ 5',
  m6: 'มัธยมศึกษาปีที่ 6',
};

const normalizeText = (value: any) => String(value || '').replace(/\s+/g, '').trim().toLowerCase();

const getClassLevelVariants = (classKey: string) => {
  const shortLabel = CLASSES[classKey] || classKey;
  return Array.from(new Set([
    classKey,
    shortLabel,
    CLASS_FULL_LABELS[classKey],
    shortLabel.replace('ป.', 'ประถมศึกษาปีที่ '),
    shortLabel.replace('ม.', 'มัธยมศึกษาปีที่ '),
    shortLabel.replace('อ.', 'อนุบาล '),
  ].filter(Boolean).map(String)));
};

const getRoomVariants = (room: string) => {
  const raw = String(room || '').trim();
  const numeric = Number(raw);
  return Array.from(new Set([
    raw,
    Number.isFinite(numeric) && numeric > 0 ? String(numeric) : '',
    Number.isFinite(numeric) && numeric > 0 ? String(numeric).padStart(2, '0') : '',
    raw.replace(/^0+/, '') || raw,
  ].filter(Boolean)));
};

const getTeacherHomeroomRoom = (teacher: any) => {
  if (!teacher) return '';
  const candidates = [
    teacher.homeroomRoom,
    teacher.room,
    teacher.roomNumber,
    teacher.classroom,
    teacher.homeroomClassroom,
    teacher.section,
    teacher.homeroomGrade?.toString().includes('/') ? teacher.homeroomGrade.toString().split('/')[1] : '',
  ];
  return String(candidates.find(value => String(value || '').trim()) || '').trim();
};

const resolveClassKeyFromTeacher = (teacher: any, classOptions: [string, string][]) => {
  const rawGrade = String(
    teacher?.homeroomGrade ||
    teacher?.classLevel ||
    teacher?.advisorClass ||
    teacher?.homeroomClass ||
    ''
  ).trim();
  if (!rawGrade) return '';

  const gradeOnly = rawGrade.includes('/') ? rawGrade.split('/')[0]?.trim() : rawGrade;
  const normalizedGrade = normalizeText(gradeOnly);

  const matched = classOptions.find(([key, label]) => {
    const variants = getClassLevelVariants(key);
    return variants.some(variant => normalizeText(variant) === normalizedGrade) ||
      normalizeText(label) === normalizedGrade ||
      normalizeText(label).includes(normalizedGrade) ||
      normalizedGrade.includes(normalizeText(label));
  });

  return matched ? matched[0] : '';
};

const toIsoDate = (date: Date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const toThaiDateId = (date: Date) => {
  const year = date.getFullYear();
  return `${String(date.getDate()).padStart(2, '0')}-${String(date.getMonth() + 1).padStart(2, '0')}-${year}`;
};

const normalizeDateValue = (value: any) => {
  if (value?.toDate) return value.toDate().toISOString().split('T')[0];
  if (typeof value === 'string') return value;
  return '';
};

export default GuidanceAttendancePage;
