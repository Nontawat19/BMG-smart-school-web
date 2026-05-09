import React, { useEffect, useMemo, useState } from 'react';
import BackButton from '@/components/Shared/BackButton';
import MainLayout from '@/layouts/MainLayout';
import { firestore as db } from '@/firebase';
import { RootState } from '@/store';
import { fetchCalendar } from '@/store/slices/calendarSlice';
import { fetchTeachersMap } from '@/store/slices/userMapSlice';
import { addDoc, collection, deleteDoc, doc, getDocs, orderBy, query, serverTimestamp, updateDoc, writeBatch } from 'firebase/firestore';
import { getCurrentThaiYear } from '@/utils/dateUtils';
import { BookOpenCheck, Calendar, ChevronLeft, ChevronRight, ClipboardList, Clock, Database, RefreshCw, Save, Search, Trash2, UserCheck, Users, X } from 'lucide-react';
import { useDispatch, useSelector } from 'react-redux';
import Swal from 'sweetalert2';

interface Course {
  id: string;
  code?: string;
  title?: string;
  subjectGroup?: string;
  type?: string;
  semester?: string | number;
  classId?: string | string[];
  teacherAssignments?: { teacherId?: string; groupNumber?: number }[];
}

interface LearnerActivity {
  id: string;
  courseId: string;
  courseCode?: string;
  name: string;
  description?: string;
  subjectGroup?: string;
  semester?: string | number;
  classId?: string | string[];
  specialPeriodId?: string;
  specialPeriodTitle?: string;
  specialPeriodDay?: string;
  specialPeriodStartTime?: string;
  specialPeriodEndTime?: string;
  responsibleTeacherIds: string[];
  createdAt?: any;
  updatedAt?: any;
}

interface SpecialPeriod {
  id: string;
  title: string;
  startTime: string;
  endTime: string;
  day?: string;
}

interface Student {
  id: string;
  title?: string;
  prefix?: string;
  firstName?: string;
  lastName?: string;
  studentId?: string;
  studentNumber?: string;
  number?: string;
  classLevel?: string;
  room?: string;
  status?: string;
}

const isClubText = (text: string) => {
  const normalized = text.toLowerCase();
  return normalized.includes('ชุมนุม') || normalized.includes('club');
};

const normalizeSemester = (semester?: string | number) => String(semester ?? '').trim() || '0';

const formatSemester = (semester?: string | number) => {
  const normalized = normalizeSemester(semester);
  return normalized === '0' ? 'ทั้งสองภาคเรียน' : normalized;
};

const semesterOverlaps = (a?: string | number, b?: string | number) => {
  const first = normalizeSemester(a);
  const second = normalizeSemester(b);
  return first === second || first === '0' || second === '0';
};

const getTeacherDisplayName = (teacher: any) => {
  const rawName = String(teacher?.name || `${teacher?.firstName || ''} ${teacher?.lastName || ''}`.trim() || '').trim();
  const cleanName = rawName.replace(/^(นาย|นาง|นางสาว|น\.ส\.|ว่าที่\s?ร\.ต\.|ว่าที่ร้อยตรี|อาจารย์|อ\.|ครู)\s*/i, '').trim();
  return cleanName ? `ครู${cleanName}` : 'ไม่พบข้อมูลครู';
};

const isActiveStudent = (student: Student) => {
  const status = String(student.status || 'เรียนอยู่').trim();
  return !['ย้าย', 'ลาออก', 'จำหน่าย', 'สำเร็จการศึกษา', 'ศิษย์เก่า'].includes(status);
};

const sortStudents = (a: Student, b: Student) => {
  const classCompare = String(a.classLevel || '').localeCompare(String(b.classLevel || ''), 'th', { numeric: true });
  if (classCompare !== 0) return classCompare;
  const roomCompare = String(a.room || '').localeCompare(String(b.room || ''), 'th', { numeric: true });
  if (roomCompare !== 0) return roomCompare;
  return (Number(a.studentNumber || a.number || 0) || 0) - (Number(b.studentNumber || b.number || 0) || 0);
};

const getVisiblePages = (currentPage: number, totalPages: number) => {
  const start = Math.max(1, Math.min(currentPage - 2, Math.max(1, totalPages - 4)));
  return Array.from({ length: Math.min(5, totalPages) }, (_, index) => start + index);
};

const formatSpecialPeriodDay = (day?: string) => {
  const labels: Record<string, string> = {
    all: 'ทุกวัน',
    mon: 'จันทร์',
    tue: 'อังคาร',
    wed: 'พุธ',
    thu: 'พฤหัสบดี',
    fri: 'ศุกร์',
    sat: 'เสาร์',
    sun: 'อาทิตย์',
  };
  return labels[day || 'all'] || day || 'ทุกวัน';
};

const isSelectableActivityPeriod = (period: SpecialPeriod) => {
  const title = String(period.title || '').toLowerCase();
  return !['ชุมนุม', 'โฮมรูม', 'พักกลางวัน', 'พักเที่ยง'].some(keyword => title.includes(keyword));
};

const sortSpecialPeriods = (a: SpecialPeriod, b: SpecialPeriod) => {
  const timeCompare = normalizeTimeForSort(a.startTime).localeCompare(normalizeTimeForSort(b.startTime));
  if (timeCompare !== 0) return timeCompare;
  return String(a.title || '').localeCompare(String(b.title || ''), 'th');
};

const normalizeTimeForSort = (time?: string) => {
  return String(time || '').replace(':', '.').padStart(5, '0');
};

const LearnerActivityManagementPage: React.FC = () => {
  const currentUser = useSelector((state: RootState) => state.auth.user);
  const schoolId = (currentUser as any)?.schoolId;
  const dispatch = useDispatch();
  const { teachers: teacherMap, status: teacherMapStatus } = useSelector((state: RootState) => state.userMap);
  const calendarState = useSelector((state: RootState) => state.calendar);

  const [activities, setActivities] = useState<LearnerActivity[]>([]);
  const [courses, setCourses] = useState<Course[]>([]);
  const [specialPeriods, setSpecialPeriods] = useState<SpecialPeriod[]>([]);
  const [allStudents, setAllStudents] = useState<Student[]>([]);
  const [selectedCourseId, setSelectedCourseId] = useState('');
  const [selectedSpecialPeriodId, setSelectedSpecialPeriodId] = useState('');
  const [selectedTeachers, setSelectedTeachers] = useState<string[]>([]);
  const [selectedStudents, setSelectedStudents] = useState<string[]>([]);
  const [description, setDescription] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [courseSearch, setCourseSearch] = useState('');
  const [teacherSearch, setTeacherSearch] = useState('');
  const [studentSearch, setStudentSearch] = useState('');
  const [activeYear, setActiveYear] = useState(String(getCurrentThaiYear()));
  const [selectedClassLevel, setSelectedClassLevel] = useState('ALL');
  const [selectedRoom, setSelectedRoom] = useState('ALL');
  const [selectedAvailableTeacherIds, setSelectedAvailableTeacherIds] = useState<string[]>([]);
  const [selectedAssignedTeacherIds, setSelectedAssignedTeacherIds] = useState<string[]>([]);
  const [selectedAvailableStudentIds, setSelectedAvailableStudentIds] = useState<string[]>([]);
  const [selectedAssignedStudentIds, setSelectedAssignedStudentIds] = useState<string[]>([]);
  const [teacherPage, setTeacherPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [studentsLoading, setStudentsLoading] = useState(false);
  const [saving, setSaving] = useState(false);

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
    if (calendarState.academicYear) {
      setActiveYear(calendarState.academicYear);
    }
  }, [calendarState.academicYear]);

  useEffect(() => {
    if (!schoolId) return;
    fetchData();
  }, [schoolId]);

  const fetchData = async () => {
    if (!schoolId) return;
    setLoading(true);
    try {
      const [activitySnap, courseSnap, periodSnap] = await Promise.all([
        getDocs(query(collection(db, 'school-settings', schoolId, 'learner-activities'), orderBy('createdAt', 'desc'))),
        getDocs(query(collection(db, 'school-settings', schoolId, 'courses'), orderBy('code', 'asc'))),
        getDocs(collection(db, 'school-settings', schoolId, 'special-periods')),
      ]);
      setActivities(activitySnap.docs.map(d => ({ id: d.id, ...d.data() } as LearnerActivity)));
      setCourses(courseSnap.docs.map(d => ({ id: d.id, ...d.data() } as Course)));
      setSpecialPeriods(periodSnap.docs
        .map(d => ({ id: d.id, ...d.data() } as SpecialPeriod))
        .filter(isSelectableActivityPeriod)
        .sort(sortSpecialPeriods)
      );
      const studentSnap = await getDocs(query(collection(db, 'school-settings', schoolId, 'students'), orderBy('firstName', 'asc')));
      setAllStudents(studentSnap.docs.map(d => ({ id: d.id, ...d.data() } as Student)).filter(isActiveStudent));
    } catch (error) {
      console.error('Error fetching learner activities:', error);
      Swal.fire('เกิดข้อผิดพลาด', 'ไม่สามารถโหลดข้อมูลกิจกรรมได้', 'error');
    } finally {
      setLoading(false);
    }
  };

  const activityCourses = useMemo(() => {
    return courses.filter(course => {
      const text = `${course.code || ''} ${course.title || ''} ${course.subjectGroup || ''} ${course.type || ''}`.toLowerCase();
      if (isClubText(text)) return false;
      const alreadyAssigned = activities.some(activity =>
        activity.courseId === course.id &&
        semesterOverlaps(activity.semester, course.semester)
      );
      if (alreadyAssigned) return false;
      const isLearnerActivity =
        text.includes('กิจกรรมพัฒนาผู้เรียน') ||
        text.includes('แนะแนว') ||
        text.includes('ลูกเสือ') ||
        text.includes('เนตรนารี') ||
        text.includes('ยุวกาชาด') ||
        text.includes('ผู้บำเพ็ญประโยชน์') ||
        text.includes('กิจกรรม') ||
        course.subjectGroup === '9';
      const matchesSearch = !courseSearch || text.includes(courseSearch.toLowerCase());
      return isLearnerActivity && matchesSearch;
    });
  }, [activities, courses, courseSearch]);

  const selectedCourse = useMemo(
    () => courses.find(course => course.id === selectedCourseId),
    [courses, selectedCourseId]
  );

  const selectedSemester = normalizeSemester(selectedCourse?.semester);
  const selectedSpecialPeriod = useMemo(() => (
    specialPeriods.find(period => period.id === selectedSpecialPeriodId) || null
  ), [specialPeriods, selectedSpecialPeriodId]);

  const activeActivity = useMemo(() => {
    if (!selectedCourse) return null;
    return activities.find(activity =>
      activity.courseId === selectedCourse.id &&
      semesterOverlaps(activity.semester, selectedCourse.semester)
    ) || null;
  }, [activities, selectedCourse]);

  const teachersList = useMemo(() => {
    return Object.values(teacherMap || {})
      .filter((teacher: any) => !teacherSearch || String(teacher.name || '').toLowerCase().includes(teacherSearch.toLowerCase()))
      .sort((a: any, b: any) => String(a.name || '').localeCompare(String(b.name || ''), 'th')) as any[];
  }, [teacherMap, teacherSearch]);

  const assignedTeachers = useMemo(() => {
    return selectedTeachers
      .map(teacherId => (teacherMap as any)?.[teacherId] || Object.values(teacherMap || {}).find((teacher: any) => teacher.id === teacherId))
      .filter(Boolean) as any[];
  }, [selectedTeachers, teacherMap]);

  const availableTeachers = useMemo(() => {
    const assignedSet = new Set(selectedTeachers);
    return teachersList.filter((teacher: any) => !assignedSet.has(teacher.id));
  }, [teachersList, selectedTeachers]);

  useEffect(() => {
    setTeacherPage(1);
  }, [teacherSearch, selectedTeachers]);

  const teacherItemsPerPage = 20;
  const teacherTotalPages = Math.max(1, Math.ceil(availableTeachers.length / teacherItemsPerPage));
  const paginatedAvailableTeachers = useMemo(() => {
    const start = (teacherPage - 1) * teacherItemsPerPage;
    return availableTeachers.slice(start, start + teacherItemsPerPage);
  }, [availableTeachers, teacherPage]);

  const assignedStudents = useMemo(() => {
    const selectedSet = new Set(selectedStudents);
    return allStudents.filter(student => selectedSet.has(student.id)).sort(sortStudents);
  }, [allStudents, selectedStudents]);

  const classOptions = useMemo(() => {
    return Array.from(new Set(allStudents.map(student => student.classLevel).filter(Boolean) as string[]))
      .sort((a, b) => a.localeCompare(b, 'th', { numeric: true }));
  }, [allStudents]);

  const roomOptions = useMemo(() => {
    return Array.from(new Set(allStudents
      .filter(student => selectedClassLevel === 'ALL' || student.classLevel === selectedClassLevel)
      .map(student => student.room)
      .filter(Boolean) as string[]))
      .sort((a, b) => a.localeCompare(b, 'th', { numeric: true }));
  }, [allStudents, selectedClassLevel]);

  const availableStudents = useMemo(() => {
    const selectedSet = new Set(selectedStudents);
    const term = studentSearch.toLowerCase();
    return allStudents
      .filter(student => !selectedSet.has(student.id))
      .filter(student => selectedClassLevel === 'ALL' || student.classLevel === selectedClassLevel)
      .filter(student => selectedRoom === 'ALL' || String(student.room || '') === selectedRoom)
      .filter(student => {
        const text = `${student.studentId || ''} ${student.firstName || ''} ${student.lastName || ''} ${student.classLevel || ''}/${student.room || ''}`.toLowerCase();
        return !term || text.includes(term);
      })
      .sort(sortStudents);
  }, [allStudents, selectedStudents, selectedClassLevel, selectedRoom, studentSearch]);

  const academicYearOptions = useMemo(() => {
    const base = Number(calendarState.academicYear || activeYear || getCurrentThaiYear());
    return Array.from({ length: 5 }, (_, index) => String(base - index));
  }, [calendarState.academicYear, activeYear]);

  const filteredActivities = useMemo(() => {
    const term = searchTerm.toLowerCase();
    return activities.filter(activity => {
      const text = `${activity.courseCode || ''} ${activity.name || ''} ${activity.description || ''}`.toLowerCase();
      if (isClubText(text)) return false;
      return !term || text.includes(term);
    });
  }, [activities, searchTerm]);

  const toggleTeacher = (teacherId: string) => {
    setSelectedTeachers(prev => prev.includes(teacherId) ? prev.filter(id => id !== teacherId) : [...prev, teacherId]);
  };

  const resetForm = () => {
    setSelectedCourseId('');
    setSelectedSpecialPeriodId('');
    setSelectedTeachers([]);
    setSelectedStudents([]);
    setDescription('');
    setCourseSearch('');
    setTeacherSearch('');
    setStudentSearch('');
    setSelectedAvailableTeacherIds([]);
    setSelectedAssignedTeacherIds([]);
    setSelectedAvailableStudentIds([]);
    setSelectedAssignedStudentIds([]);
  };

  const loadActivityMembers = async (activity: LearnerActivity | null, courseSemester: string) => {
    if (!schoolId || !activity) {
      setSelectedStudents([]);
      return;
    }
    setStudentsLoading(true);
    try {
      const membersSnap = await getDocs(collection(db, 'school-settings', schoolId, 'learner-activities', activity.id, 'members'));
      const memberIds = membersSnap.docs
        .map(memberDoc => memberDoc.data() as any)
        .filter(member =>
          String(member.academicYear || '') === activeYear &&
          semesterOverlaps(member.semester, courseSemester)
        )
        .map(member => String(member.studentId || ''))
        .filter(Boolean);
      setSelectedStudents(Array.from(new Set(memberIds)));
    } catch (error) {
      console.error('Error loading learner activity members:', error);
      Swal.fire('เกิดข้อผิดพลาด', 'ไม่สามารถโหลดรายชื่อนักเรียนในกิจกรรมได้', 'error');
    } finally {
      setStudentsLoading(false);
    }
  };

  const handleCourseSelect = async (course: Course) => {
    setSelectedCourseId(course.id);
    setSelectedAvailableTeacherIds([]);
    setSelectedAssignedTeacherIds([]);
    setSelectedAvailableStudentIds([]);
    setSelectedAssignedStudentIds([]);
    const courseSemester = normalizeSemester(course.semester);
    const existingActivity = activities.find(activity =>
      activity.courseId === course.id &&
      semesterOverlaps(activity.semester, course.semester)
    );
    if (existingActivity) {
      setDescription(existingActivity.description || '');
      setSelectedSpecialPeriodId(existingActivity.specialPeriodId || '');
      setSelectedTeachers(existingActivity.responsibleTeacherIds || []);
      await loadActivityMembers(existingActivity, courseSemester);
      return;
    }
    setDescription('');
    setSelectedSpecialPeriodId('');
    setSelectedStudents([]);
    const teacherIds = (course.teacherAssignments || [])
      .map(assignment => assignment.teacherId)
      .filter((id): id is string => Boolean(id && id !== 'pending'));
    setSelectedTeachers(Array.from(new Set(teacherIds)));
  };

  const handleEdit = async (activity: LearnerActivity) => {
    setSelectedCourseId(activity.courseId);
    setDescription(activity.description || '');
    setSelectedSpecialPeriodId(activity.specialPeriodId || '');
    setSelectedTeachers(activity.responsibleTeacherIds || []);
    setSelectedAvailableTeacherIds([]);
    setSelectedAssignedTeacherIds([]);
    setSelectedAvailableStudentIds([]);
    setSelectedAssignedStudentIds([]);
    await loadActivityMembers(activity, normalizeSemester(activity.semester));
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  useEffect(() => {
    if (activeActivity) {
      loadActivityMembers(activeActivity, selectedSemester);
    } else {
      setSelectedStudents([]);
    }
  }, [activeActivity?.id, activeYear, selectedSemester]);

  const toggleAvailableTeacher = (teacherId: string) => {
    setSelectedAvailableTeacherIds(prev => prev.includes(teacherId) ? prev.filter(id => id !== teacherId) : [...prev, teacherId]);
  };

  const toggleAssignedTeacher = (teacherId: string) => {
    setSelectedAssignedTeacherIds(prev => prev.includes(teacherId) ? prev.filter(id => id !== teacherId) : [...prev, teacherId]);
  };

  const addSelectedTeachers = () => {
    if (selectedAvailableTeacherIds.length === 0) return;
    setSelectedTeachers(prev => Array.from(new Set([...prev, ...selectedAvailableTeacherIds])));
    setSelectedAvailableTeacherIds([]);
  };

  const removeSelectedTeachers = () => {
    if (selectedAssignedTeacherIds.length === 0) return;
    setSelectedTeachers(prev => prev.filter(id => !selectedAssignedTeacherIds.includes(id)));
    setSelectedAssignedTeacherIds([]);
  };

  const toggleAvailableStudent = (studentId: string) => {
    setSelectedAvailableStudentIds(prev => prev.includes(studentId) ? prev.filter(id => id !== studentId) : [...prev, studentId]);
  };

  const toggleAssignedStudent = (studentId: string) => {
    setSelectedAssignedStudentIds(prev => prev.includes(studentId) ? prev.filter(id => id !== studentId) : [...prev, studentId]);
  };

  const addSelectedStudents = () => {
    if (selectedAvailableStudentIds.length === 0) return;
    setSelectedStudents(prev => Array.from(new Set([...prev, ...selectedAvailableStudentIds])));
    setSelectedAvailableStudentIds([]);
  };

  const removeSelectedStudents = () => {
    if (selectedAssignedStudentIds.length === 0) return;
    setSelectedStudents(prev => prev.filter(id => !selectedAssignedStudentIds.includes(id)));
    setSelectedAssignedStudentIds([]);
  };

  const handleSubmit = async (event?: React.FormEvent | React.MouseEvent) => {
    event?.preventDefault();
    if (!schoolId || saving) return;
    if (!selectedCourse) {
      Swal.fire('ข้อมูลไม่ครบ', 'กรุณาเลือกกิจกรรมจากหลักสูตร', 'warning');
      return;
    }
    const selectedCourseText = `${selectedCourse.code || ''} ${selectedCourse.title || ''} ${selectedCourse.subjectGroup || ''} ${selectedCourse.type || ''}`;
    if (isClubText(selectedCourseText)) {
      Swal.fire('ไม่สามารถเพิ่มได้', 'ชุมนุมให้จัดการในเมนูจัดการชุมนุม ไม่ต้องนำมาใส่ในกิจกรรมพัฒนาผู้เรียน', 'warning');
      return;
    }
    if (selectedTeachers.length === 0) {
      Swal.fire('ข้อมูลไม่ครบ', 'กรุณาเลือกครูผู้ดูแลอย่างน้อย 1 คน', 'warning');
      return;
    }
    if (!selectedSpecialPeriod) {
      Swal.fire('ข้อมูลไม่ครบ', 'กรุณาเลือกคาบกิจกรรมที่ใช้เช็คชื่อ', 'warning');
      return;
    }

    const activitySemester = normalizeSemester(selectedCourse.semester);
    const duplicate = activities.find(activity =>
      activity.courseId === selectedCourse.id &&
      semesterOverlaps(activity.semester, activitySemester) &&
      activity.id !== activeActivity?.id
    );
    if (duplicate) {
      Swal.fire('พบข้อมูลซ้ำ', 'กิจกรรมนี้ถูกเพิ่มไว้แล้ว สามารถแก้ไขครูผู้ดูแลจากรายการเดิมได้', 'warning');
      return;
    }

    setSaving(true);
    try {
      const payload = {
        courseId: selectedCourse.id,
        courseCode: selectedCourse.code || '',
        name: selectedCourse.title || 'กิจกรรมพัฒนาผู้เรียน',
        description,
        subjectGroup: selectedCourse.subjectGroup || '',
        semester: activitySemester,
        classId: selectedCourse.classId || '',
        specialPeriodId: selectedSpecialPeriod.id,
        specialPeriodTitle: selectedSpecialPeriod.title,
        specialPeriodDay: selectedSpecialPeriod.day || 'all',
        specialPeriodStartTime: selectedSpecialPeriod.startTime,
        specialPeriodEndTime: selectedSpecialPeriod.endTime,
        responsibleTeacherIds: selectedTeachers,
        updatedAt: serverTimestamp(),
      };

      if (activeActivity) {
        await updateDoc(doc(db, 'school-settings', schoolId, 'learner-activities', activeActivity.id), payload);
      } else {
        await addDoc(collection(db, 'school-settings', schoolId, 'learner-activities'), {
          ...payload,
          createdAt: serverTimestamp(),
        });
      }

      Swal.fire({ icon: 'success', title: activeActivity ? 'อัปเดตสำเร็จ' : 'เพิ่มกิจกรรมสำเร็จ', timer: 1400, showConfirmButton: false });
      resetForm();
      fetchData();
    } catch (error) {
      console.error('Error saving learner activity:', error);
      Swal.fire('เกิดข้อผิดพลาด', 'ไม่สามารถบันทึกข้อมูลได้', 'error');
    } finally {
      setSaving(false);
    }
  };

  const syncActivityMembers = async (activityId: string, activitySemester: string) => {
    if (!schoolId || !activityId) return;
    const membersRef = collection(db, 'school-settings', schoolId, 'learner-activities', activityId, 'members');
    const existingSnap = await getDocs(membersRef);
    const batch = writeBatch(db);
    existingSnap.docs.forEach(memberDoc => {
      const member = memberDoc.data() as any;
      if (String(member.academicYear || '') === activeYear && semesterOverlaps(member.semester, activitySemester)) {
        batch.delete(memberDoc.ref);
      }
    });
    selectedStudents.forEach(studentId => {
      const student = allStudents.find(item => item.id === studentId);
      const memberDocId = `${activeYear}_${activitySemester}_${studentId}`;
      batch.set(doc(db, 'school-settings', schoolId, 'learner-activities', activityId, 'members', memberDocId), {
        studentId,
        studentName: student ? `${student.firstName || ''} ${student.lastName || ''}`.trim() : '',
        studentCode: student?.studentId || '',
        classLevel: student?.classLevel || '',
        room: student?.room || '',
        academicYear: activeYear,
        semester: activitySemester,
        addedAt: serverTimestamp(),
        addedBy: (currentUser as any)?.uid || '',
      });
    });
    await batch.commit();
  };

  const handleDelete = async (activity: LearnerActivity) => {
    if (!schoolId) return;
    const confirm = await Swal.fire({
      icon: 'warning',
      title: 'ยืนยันการลบ',
      text: `ต้องการลบกิจกรรม "${activity.name}" ใช่หรือไม่?`,
      showCancelButton: true,
      confirmButtonText: 'ลบ',
      cancelButtonText: 'ยกเลิก',
      confirmButtonColor: '#ef4444',
    });
    if (!confirm.isConfirmed) return;

    try {
      await deleteDoc(doc(db, 'school-settings', schoolId, 'learner-activities', activity.id));
      setActivities(prev => prev.filter(item => item.id !== activity.id));
      Swal.fire({ icon: 'success', title: 'ลบสำเร็จ', timer: 1200, showConfirmButton: false });
    } catch (error) {
      console.error('Error deleting learner activity:', error);
      Swal.fire('เกิดข้อผิดพลาด', 'ไม่สามารถลบข้อมูลได้', 'error');
    }
  };

  return (
    <MainLayout>
      <div className="min-h-screen bg-slate-50 text-gray-900 dark:bg-[#0b0e14] dark:text-white">
        <header className="pl-14 pr-6 py-4 bg-slate-100 dark:bg-[#11141d] border-b-2 border-indigo-500/30 flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between shadow-lg">
          <div className="flex items-center gap-6">
            <BackButton to="/academic/hub/activities" className="mr-2" />
            <div className="flex items-center gap-3">
              <div className="p-2 bg-indigo-600 rounded-lg shadow-lg shadow-indigo-600/20">
                <BookOpenCheck size={20} className="text-white" />
              </div>
              <div>
                <h1 className="text-lg font-black leading-none text-black dark:text-white">กิจกรรมพัฒนาผู้เรียน</h1>
                <p className="mt-1 text-[9px] font-bold uppercase tracking-wider text-black/60 dark:text-white/60">
                  มอบหมายครูผู้ดูแลกิจกรรมจากหลักสูตร
                </p>
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3 lg:justify-end">
            <div className="flex items-center gap-0 overflow-hidden rounded-xl border border-slate-200 bg-slate-100 p-0.5 shadow-inner dark:border-white/5 dark:bg-white/5">
              <div className="group flex items-center gap-2 px-3.5 py-1.5 transition-colors hover:bg-black/[0.02] dark:hover:bg-white/[0.02]">
                <Calendar size={13} className="text-slate-400 transition-colors group-hover:text-indigo-400 dark:text-slate-500" />
                <span className="text-[9px] font-bold uppercase tracking-tight text-black dark:text-white">ปีการศึกษา</span>
                <select
                  value={activeYear}
                  onChange={(e) => setActiveYear(e.target.value)}
                  className="cursor-pointer border-none bg-transparent p-0 pr-4 text-xs font-black text-slate-900 outline-none focus:ring-0 dark:text-white"
                >
                  {academicYearOptions.map(year => (
                    <option key={year} value={year} className="bg-white text-slate-900 dark:bg-[#161a27] dark:text-white">{year}</option>
                  ))}
                </select>
              </div>
            </div>

            <button
              type="button"
              onClick={handleSubmit}
              disabled={saving || !selectedCourse || selectedTeachers.length === 0 || !selectedSpecialPeriod}
              className={`flex shrink-0 items-center gap-2 rounded-xl border px-6 py-2.5 text-sm font-black shadow-lg transition-all disabled:shadow-none disabled:opacity-50 ${
                saving
                  ? 'cursor-wait border-white/10 bg-slate-700 text-white'
                  : selectedCourse && selectedTeachers.length > 0 && selectedSpecialPeriod
                    ? 'border-emerald-500/30 bg-emerald-600 text-white shadow-emerald-600/40 hover:-translate-y-0.5 hover:bg-emerald-500'
                    : 'border-slate-300 bg-slate-200 text-slate-500 dark:border-white/5 dark:bg-white/5 dark:text-slate-400'
              }`}
            >
              {saving ? <RefreshCw size={18} className="animate-spin" /> : <Save size={18} className={selectedCourse && selectedTeachers.length > 0 && selectedSpecialPeriod ? 'animate-bounce' : ''} />}
              {selectedCourse && selectedTeachers.length > 0 && selectedSpecialPeriod ? (activeActivity ? 'อัปเดตการมอบหมาย' : 'บันทึกการมอบหมาย') : 'เลือกกิจกรรม ครู และคาบ'}
            </button>
          </div>
        </header>

        <div className="mx-auto max-w-7xl p-4 sm:p-6">
          <div className="grid grid-cols-1 gap-4 xl:grid-cols-[320px_1fr_70px_360px]">
            <section className="rounded-3xl border border-gray-100 bg-white shadow-sm dark:border-gray-700 dark:bg-[#2a2b2f] overflow-hidden">
              <div className="border-b border-gray-100 p-4 dark:border-gray-700">
                <h2 className="flex items-center gap-2 text-sm font-black">
                  <ClipboardList className="text-indigo-500" size={18} />
                  กิจกรรมจากหลักสูตร
                </h2>
                <div className="relative mt-3">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={16} />
                  <input
                    value={courseSearch}
                    onChange={e => setCourseSearch(e.target.value)}
                    placeholder="ค้นหารหัส/ชื่อกิจกรรม..."
                    className="h-11 w-full rounded-xl border border-gray-200 bg-gray-50 pl-10 pr-4 text-sm outline-none focus:ring-2 focus:ring-indigo-500/20 dark:border-gray-700 dark:bg-[#1e1f21]"
                  />
                </div>
              </div>
              <div className="max-h-[620px] overflow-y-auto p-3">
                {activityCourses.map(course => {
                  const isSelected = selectedCourseId === course.id;
                  return (
                    <button
                      key={course.id}
                      type="button"
                      onClick={() => handleCourseSelect(course)}
                      className={`mb-2 flex w-full items-start gap-3 rounded-2xl border p-3 text-left transition ${isSelected ? 'border-indigo-500 bg-indigo-600 text-white shadow-lg shadow-indigo-500/20' : 'border-gray-100 bg-gray-50 hover:border-indigo-200 dark:border-gray-700 dark:bg-[#1e1f21]'}`}
                    >
                      <ClipboardList size={18} className="mt-0.5 shrink-0" />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-black">{course.code ? `${course.code} ` : ''}{course.title}</span>
                        <span className={`block truncate text-xs ${isSelected ? 'text-indigo-100' : 'text-gray-500 dark:text-gray-400'}`}>
                          ภาคเรียน {formatSemester(course.semester)}
                        </span>
                      </span>
                    </button>
                  );
                })}
                {activityCourses.length === 0 && (
                  <div className="p-8 text-center text-sm text-gray-500">ไม่พบกิจกรรมที่ยังไม่ได้มอบหมายครู</div>
                )}
              </div>
            </section>

            <section className="rounded-3xl border border-gray-100 bg-white shadow-sm dark:border-gray-700 dark:bg-[#2a2b2f] overflow-hidden">
              <div className="border-b border-gray-100 bg-indigo-50/60 p-4 dark:border-gray-700 dark:bg-indigo-500/10">
                <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                  <div className="min-w-0">
                    <h2 className="truncate text-lg font-black text-indigo-700 dark:text-indigo-300">
                      {selectedCourse ? selectedCourse.title : 'เลือกกิจกรรมเพื่อกำหนดครูผู้ดูแล'}
                    </h2>
                    <p className="mt-1 text-xs font-bold text-gray-500 dark:text-gray-400">
                      {selectedCourse ? `${selectedCourse.code || 'ไม่มีรหัส'} • ภาคเรียน ${formatSemester(selectedCourse.semester)} • ครูผู้ดูแล ${selectedTeachers.length} คน` : 'เลือกรายการจากคอลัมน์ซ้ายก่อน'}
                    </p>
                  </div>
                  <div className="flex shrink-0 gap-2">
                    <button
                      type="button"
                      onClick={resetForm}
                      disabled={!selectedCourse}
                      className="inline-flex h-10 items-center gap-2 rounded-xl bg-white px-3 text-xs font-black text-gray-600 shadow-sm transition hover:bg-gray-50 disabled:opacity-40 dark:bg-white/10 dark:text-gray-300"
                    >
                      <X size={15} /> ล้าง
                    </button>
                    {activeActivity && (
                      <button
                        type="button"
                        onClick={() => handleDelete(activeActivity)}
                        className="inline-flex h-10 items-center gap-2 rounded-xl bg-red-500 px-3 text-xs font-black text-white shadow-sm transition hover:bg-red-400"
                      >
                        <Trash2 size={15} /> ลบกิจกรรม
                      </button>
                    )}
                  </div>
                </div>
              </div>

              <div className="p-4">
                <div className="mb-4 rounded-2xl border border-gray-100 bg-gray-50 p-4 dark:border-gray-700 dark:bg-[#1e1f21]">
                  <label className="mb-2 flex items-center gap-2 text-sm font-black text-gray-700 dark:text-gray-200">
                    <Clock className="text-teal-500" size={18} />
                    คาบที่ใช้เช็คชื่อกิจกรรม
                  </label>
                  <select
                    value={selectedSpecialPeriodId}
                    onChange={e => setSelectedSpecialPeriodId(e.target.value)}
                    disabled={!selectedCourse}
                    className="h-11 w-full rounded-xl border border-gray-200 bg-white px-3 text-sm font-bold outline-none transition focus:ring-2 focus:ring-teal-500/20 disabled:opacity-50 dark:border-gray-700 dark:bg-[#2a2b2f]"
                  >
                    <option value="">เลือกคาบจากหน้าคาบเรียนพิเศษ</option>
                    {specialPeriods.map(period => (
                      <option key={period.id} value={period.id}>
                        {period.title} ({formatSpecialPeriodDay(period.day)} {period.startTime}-{period.endTime})
                      </option>
                    ))}
                  </select>
                  {selectedSpecialPeriod ? (
                    <p className="mt-2 text-xs font-bold text-teal-600 dark:text-teal-300">
                      จะเปิดให้เช็คชื่อในคาบ {selectedSpecialPeriod.title} เวลา {selectedSpecialPeriod.startTime}-{selectedSpecialPeriod.endTime} น.
                    </p>
                  ) : (
                    <p className="mt-2 text-xs font-bold text-gray-500">
                      เช่น กิจกรรมลูกเสือ เลือกคาบ “กิจกรรม” ที่กำหนดไว้ในหน้าคาบเรียนพิเศษ
                    </p>
                  )}
                </div>

                <div className="mb-3 flex items-center justify-between">
                  <h3 className="flex items-center gap-2 text-sm font-black">
                    <UserCheck className="text-emerald-500" size={18} />
                    ครูผู้ดูแลกิจกรรม
                  </h3>
                </div>
                <div className="max-h-[350px] overflow-y-auto rounded-2xl border border-gray-100 bg-gray-50 p-2 dark:border-gray-700 dark:bg-[#1e1f21]">
                  {assignedTeachers.map((teacher: any) => (
                    <button
                      key={teacher.id}
                      type="button"
                      onClick={() => toggleAssignedTeacher(teacher.id)}
                      className={`mb-2 flex w-full items-center gap-3 rounded-xl border p-3 text-left transition ${selectedAssignedTeacherIds.includes(teacher.id) ? 'border-indigo-500 bg-indigo-50 text-indigo-700 dark:bg-indigo-500/15 dark:text-indigo-300' : 'border-transparent bg-white hover:border-indigo-200 dark:bg-white/5'}`}
                    >
                      <div className={`h-5 w-5 rounded-full border-2 ${selectedAssignedTeacherIds.includes(teacher.id) ? 'border-indigo-500 bg-indigo-500' : 'border-gray-300 dark:border-gray-600'}`} />
                      <div className="min-w-0">
                        <p className="truncate text-sm font-black">{teacher.name}</p>
                        <p className="truncate text-xs text-gray-500">รหัสครู: {teacher.teacherId || teacher.id}</p>
                      </div>
                    </button>
                  ))}
                  {assignedTeachers.length === 0 && (
                    <div className="p-10 text-center text-sm text-gray-500">ยังไม่มีครูผู้ดูแลในกิจกรรมนี้</div>
                  )}
                </div>
              </div>
            </section>

            <div className="flex items-center justify-center xl:flex-col gap-3">
              <button
                type="button"
                onClick={addSelectedTeachers}
                disabled={!selectedCourse || selectedAvailableTeacherIds.length === 0}
                className="inline-flex h-12 w-12 items-center justify-center rounded-2xl border border-indigo-400 bg-indigo-600 text-white shadow-lg shadow-indigo-500/20 transition hover:bg-indigo-500 disabled:border-gray-200 disabled:bg-gray-100 disabled:text-gray-300 disabled:shadow-none dark:disabled:border-white/5 dark:disabled:bg-white/5"
                title="เพิ่มครูเข้ากิจกรรม"
              >
                <ChevronLeft size={24} strokeWidth={3} className="hidden xl:block" />
                <ChevronLeft size={24} strokeWidth={3} className="block rotate-90 xl:hidden" />
              </button>
              <button
                type="button"
                onClick={removeSelectedTeachers}
                disabled={!selectedCourse || selectedAssignedTeacherIds.length === 0}
                className="inline-flex h-12 w-12 items-center justify-center rounded-2xl border border-rose-400 bg-rose-500 text-white shadow-lg shadow-rose-500/20 transition hover:bg-rose-400 disabled:border-gray-200 disabled:bg-gray-100 disabled:text-gray-300 disabled:shadow-none dark:disabled:border-white/5 dark:disabled:bg-white/5"
                title="นำครูออกจากกิจกรรม"
              >
                <ChevronRight size={24} strokeWidth={3} className="hidden xl:block" />
                <ChevronRight size={24} strokeWidth={3} className="block rotate-90 xl:hidden" />
              </button>
            </div>

            <section className="rounded-3xl border border-gray-100 bg-white shadow-sm dark:border-gray-700 dark:bg-[#2a2b2f] overflow-hidden">
              <div className="border-b border-gray-100 p-4 dark:border-gray-700">
                <h2 className="flex items-center gap-2 text-sm font-black">
                  <Users className="text-blue-500" size={18} />
                  รายชื่อครูทั้งหมด
                </h2>
                <div className="relative mt-3">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={16} />
                  <input
                    value={teacherSearch}
                    onChange={e => setTeacherSearch(e.target.value)}
                    placeholder="ค้นหาชื่อครู..."
                    className="h-11 w-full rounded-xl border border-gray-200 bg-gray-50 pl-10 pr-4 text-sm outline-none focus:ring-2 focus:ring-indigo-500/20 dark:border-gray-700 dark:bg-[#1e1f21]"
                  />
                </div>
              </div>
              <div className="max-h-[620px] overflow-y-auto p-3">
                {paginatedAvailableTeachers.map((teacher: any) => (
                  <button
                    key={teacher.id}
                    type="button"
                    onClick={() => toggleAvailableTeacher(teacher.id)}
                    disabled={!selectedCourse}
                    className={`mb-2 flex w-full items-center gap-3 rounded-2xl border p-3 text-left transition disabled:opacity-50 ${selectedAvailableTeacherIds.includes(teacher.id) ? 'border-indigo-500 bg-indigo-50 text-indigo-700 dark:bg-indigo-500/15 dark:text-indigo-300' : 'border-gray-100 bg-gray-50 hover:border-indigo-200 dark:border-gray-700 dark:bg-[#1e1f21]'}`}
                  >
                    <div className={`h-5 w-5 rounded-full border-2 ${selectedAvailableTeacherIds.includes(teacher.id) ? 'border-indigo-500 bg-indigo-500' : 'border-gray-300 dark:border-gray-600'}`} />
                    <div className="min-w-0">
                      <p className="truncate text-sm font-black">{teacher.name}</p>
                      <p className="truncate text-xs text-gray-500">รหัสครู: {teacher.teacherId || teacher.id}</p>
                    </div>
                  </button>
                ))}
                {availableTeachers.length === 0 && (
                  <div className="p-10 text-center text-sm text-gray-500">ไม่พบครูที่สามารถเพิ่มได้</div>
                )}
              </div>
              {teacherTotalPages > 1 && (
                <div className="flex flex-wrap items-center justify-center gap-1.5 border-t border-gray-100 bg-gray-50 p-3 dark:border-gray-700 dark:bg-white/5">
                  {getVisiblePages(teacherPage, teacherTotalPages).map(page => (
                    <button
                      key={page}
                      type="button"
                      onClick={() => setTeacherPage(page)}
                      className={`h-9 min-w-9 rounded-xl px-3 text-xs font-black transition ${
                        teacherPage === page
                          ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-500/20'
                          : 'bg-white text-gray-500 hover:bg-indigo-50 hover:text-indigo-600 dark:bg-white/5 dark:text-gray-400 dark:hover:bg-indigo-500/10 dark:hover:text-indigo-300'
                      }`}
                    >
                      {page}
                    </button>
                  ))}
                </div>
              )}
            </section>
          </div>

          <section className="mt-6 rounded-3xl border border-gray-100 bg-white shadow-sm dark:border-gray-700 dark:bg-[#2a2b2f]">
            <div className="flex flex-col gap-3 border-b border-gray-100 p-4 sm:p-5 md:flex-row md:items-center md:justify-between dark:border-gray-700">
              <h2 className="flex items-center gap-2 text-lg font-black">
                <Database className="text-amber-500" />
                รายการกิจกรรมที่เปิดเช็คชื่อ ({filteredActivities.length})
              </h2>
              <div className="relative w-full md:w-80">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
                <input
                  value={searchTerm}
                  onChange={e => setSearchTerm(e.target.value)}
                  placeholder="ค้นหากิจกรรม..."
                  className="h-11 w-full rounded-2xl border border-gray-200 bg-gray-50 pl-10 pr-4 text-sm font-bold outline-none focus:ring-2 focus:ring-indigo-500/20 dark:border-gray-700 dark:bg-[#1e1f21]"
                />
              </div>
            </div>
            {loading ? (
              <div className="p-10 text-center text-gray-500">กำลังโหลดข้อมูล...</div>
            ) : filteredActivities.length === 0 ? (
              <div className="p-10 text-center text-gray-500">ยังไม่มีกิจกรรมพัฒนาผู้เรียน</div>
            ) : (
              <div className="grid grid-cols-1 gap-3 p-4 sm:grid-cols-2 xl:grid-cols-3 sm:p-5">
                {filteredActivities.map(activity => (
                  <article key={activity.id} className="rounded-2xl border border-gray-100 bg-gray-50 p-4 dark:border-gray-700 dark:bg-[#1e1f21]">
                    <div className="mb-2 flex flex-wrap items-center gap-2">
                      <span className="rounded-lg bg-indigo-600 px-2 py-1 text-xs font-black text-white">{activity.courseCode || 'ไม่มีรหัส'}</span>
                      <span className="rounded-lg bg-white px-2 py-1 text-xs font-bold text-gray-500 dark:bg-white/5 dark:text-gray-300">ภาคเรียน {formatSemester(activity.semester)}</span>
                    </div>
                    <h3 className="text-base font-black text-gray-900 dark:text-white">{activity.name}</h3>
                    <div className="mt-3 flex items-center gap-2 rounded-xl bg-white px-3 py-2 text-xs font-bold text-gray-500 dark:bg-white/5 dark:text-gray-300">
                      <Clock size={14} className="text-teal-500" />
                      {activity.specialPeriodTitle
                        ? `${activity.specialPeriodTitle} (${formatSpecialPeriodDay(activity.specialPeriodDay)} ${activity.specialPeriodStartTime || '-'}-${activity.specialPeriodEndTime || '-'})`
                        : 'ยังไม่ได้ระบุคาบเช็คชื่อ'}
                    </div>
                    <div className="mt-3 border-t border-gray-200 pt-3 dark:border-gray-700">
                      <div className="mb-2 flex items-center gap-2 text-xs font-black uppercase tracking-widest text-gray-500 dark:text-gray-400">
                        <UserCheck size={14} /> ครูผู้ดูแล
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {(() => {
                          const teacherIds = activity.responsibleTeacherIds || [];
                          const [firstTeacherId, ...otherTeacherIds] = teacherIds;
                          if (!firstTeacherId) {
                            return (
                              <span className="rounded-full bg-white px-3 py-1 text-xs font-bold text-gray-500 dark:bg-white/5 dark:text-gray-400">
                                ยังไม่ได้ระบุครูผู้ดูแล
                              </span>
                            );
                          }

                          return (
                            <>
                              <span className="rounded-full bg-white px-3 py-1 text-xs font-bold text-gray-600 dark:bg-white/5 dark:text-gray-300">
                                {getTeacherDisplayName((teacherMap as any)?.[firstTeacherId])}
                              </span>
                              {otherTeacherIds.length > 0 && (
                                <span className="rounded-full bg-indigo-600 px-3 py-1 text-xs font-black text-white">
                                  ครูท่านอื่นๆ อีก +{otherTeacherIds.length}
                                </span>
                              )}
                            </>
                          );
                        })()}
                      </div>
                    </div>
                    <div className="mt-4 flex justify-end gap-2">
                      <button onClick={() => handleEdit(activity)} className="inline-flex h-10 items-center gap-2 rounded-xl bg-amber-100 px-3 text-xs font-black text-amber-600 hover:bg-amber-200 dark:bg-amber-500/15 dark:text-amber-300">
                        <UserCheck size={16} /> จัดครู
                      </button>
                      <button onClick={() => handleDelete(activity)} className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-red-100 text-red-600 hover:bg-red-200 dark:bg-red-500/15 dark:text-red-300">
                        <Trash2 size={18} />
                      </button>
                    </div>
                  </article>
                ))}
              </div>
            )}
          </section>
        </div>
      </div>
    </MainLayout>
  );
};

export default LearnerActivityManagementPage;
