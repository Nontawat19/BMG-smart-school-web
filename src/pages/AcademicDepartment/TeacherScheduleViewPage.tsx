import React, { useEffect, useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { collection, getDocs, query, where, doc, getDoc } from 'firebase/firestore';
import { useSelector, useDispatch } from 'react-redux';
import { RootState } from '@/store';
import { firestore as db } from '../../firebase';
import MainLayout from "@/layouts/MainLayout";
import { fetchTeachersMap } from '@/store/slices/userMapSlice';
<<<<<<< HEAD
import { fetchCalendar } from '@/store/slices/calendarSlice';
import { Loader2, FileDown, Calendar, User, Printer, Search } from 'lucide-react';
import BackButton from '@/components/Shared/BackButton';
=======
import { Loader2, FileDown, Calendar, User, Printer, ArrowLeft, Search } from 'lucide-react';
>>>>>>> 5f8c7e1 (feat: optimize auto-scheduler and update UI labels)
import { Document, Page, Text, View, StyleSheet, Font, Image, PDFViewer, PDFDownloadLink } from '@react-pdf/renderer';
import { TeacherSchedulePDF, BulkTeacherSchedulePDF, Teacher, Course, Schedule, ScheduleEntry, SpecialPeriod, PeriodSetting, SchoolInfo, Club } from '@/components/Pdf/TeacherScheduleDocument';
import { pdf } from '@react-pdf/renderer';
import toast from 'react-hot-toast';
import { saveAs } from 'file-saver';
import { CLASSES, CLASS_FULL_NAMES } from '@/utils/schoolUtils';

// Types imported from @/components/pdf/TeacherScheduleDocument

/* ===================== CONSTANTS ===================== */
const DAYS: Record<string, string> = {
  mon: 'จันทร์',
  tue: 'อังคาร',
  wed: 'พุธ',
  thu: 'พฤหัสบดี',
  fri: 'ศุกร์',
};
const FULL_CLASS_NAMES = CLASS_FULL_NAMES;

const DEFAULT_PERIODS: PeriodSetting[] = [
  { id: 'homeroom', label: 'โฮมรูม', startTime: '08:30', endTime: '08:40', isTeachingPeriod: false, isFixed: true },
  { id: 'period-1', label: 'คาบที่ 1', startTime: '08:40', endTime: '09:30', isTeachingPeriod: true },
  { id: 'period-2', label: 'คาบที่ 2', startTime: '09:30', endTime: '10:20', isTeachingPeriod: true },
  { id: 'period-3', label: 'คาบที่ 3', startTime: '10:20', endTime: '11:10', isTeachingPeriod: true },
  { id: 'period-4', label: 'คาบที่ 4', startTime: '11:10', endTime: '12:00', isTeachingPeriod: true },
  { id: 'lunch', label: 'พักกลางวัน', startTime: '12:00', endTime: '13:00', isTeachingPeriod: false, isFixed: true },
  { id: 'period-5', label: 'คาบที่ 5', startTime: '13:00', endTime: '13:50', isTeachingPeriod: true },
  { id: 'period-6', label: 'คาบที่ 6', startTime: '13:50', endTime: '14:40', isTeachingPeriod: true },
  { id: 'period-7', label: 'คาบที่ 7', startTime: '14:40', endTime: '15:30', isTeachingPeriod: true },
  { id: 'period-8', label: 'คาบที่ 8', startTime: '15:30', endTime: '16:00', isTeachingPeriod: true },
];

/* ===================== PDF STYLES & COMPONENT ===================== */
// Moved to src/components/pdf/TeacherScheduleDocument.tsx


/* ===================== COMPONENT ===================== */
const TeacherScheduleViewPage: React.FC = () => {
  const [selectedTeacher, setSelectedTeacher] = useState('');
  const [schedule, setSchedule] = useState<Schedule>({});
  const [specialPeriods, setSpecialPeriods] = useState<SpecialPeriod[]>([]);
  const [periodSettings, setPeriodSettings] = useState<PeriodSetting[]>(DEFAULT_PERIODS);
  const [totalPeriods, setTotalPeriods] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const [academicYear, setAcademicYear] = useState('');
  const [currentTerm, setCurrentTerm] = useState('');
  const [schoolInfo, setSchoolInfo] = useState<SchoolInfo>({});
  const [clubs, setClubs] = useState<Club[]>([]);
  const [roomMap, setRoomMap] = useState<Record<string, string>>({});
  const [coursesMap, setCoursesMap] = useState<Record<string, any>>({});

  // Bulk Export State
  const [bulkData, setBulkData] = useState<any[] | null>(null);
  const [isPreparingBulk, setIsPreparingBulk] = useState(false);

  const currentUser = useSelector((state: RootState) => state.auth.user);
  const { teachers: teacherMap, status: teacherMapStatus } = useSelector((state: RootState) => state.userMap);
  const teachers = useMemo(() => Object.values(teacherMap || {}), [teacherMap]);
  const schoolId = (currentUser as any)?.schoolId;
  const dispatch = useDispatch();

  const selectedTeacherData = (teacherMap[selectedTeacher] as Teacher) || null;

<<<<<<< HEAD
  const formatClassNames = (classIds: any): string => {
    const ids = Array.isArray(classIds) ? classIds : [classIds].filter(Boolean);
    return ids.map(c => CLASSES[c as keyof typeof CLASSES] || c).join(', ');
  };

  const matchesSelectedYearTerm = (data: any): boolean => {
    if (!academicYear || !currentTerm) return false;
    return String(data.academicYear || '') === String(academicYear) && String(data.semester || '') === String(currentTerm);
  };

  const fetchAssignmentMap = async (): Promise<Record<string, any>> => {
    if (!schoolId || !academicYear || !currentTerm) return {};
    const assignmentQuery = query(
      collection(db, 'school-settings', schoolId, 'course_assignments'),
      where('academicYear', '==', academicYear),
      where('semester', '==', currentTerm)
    );
    const assignmentSnap = await getDocs(assignmentQuery);
    const assignmentMap: Record<string, any> = {};
    assignmentSnap.forEach(doc => {
      const data = doc.data();
      if (data.courseId) {
        assignmentMap[data.courseId] = data;
      }
    });
    return assignmentMap;
  };

  const findAssignment = (course: Course, teacherId: string, groupNumber: number, assignmentMap: Record<string, any>) => {
    const semesterAssignment = assignmentMap[course.id]?.teacherAssignments || [];
    const courseAssignment = coursesMap[course.id]?.teacherAssignments || [];
    return [...semesterAssignment, ...courseAssignment].find((a: any) =>
      a.teacherId === teacherId && Number(a.groupNumber || 1) === Number(groupNumber)
    );
  };

  // Redux Calendar State
  const calendarState = useSelector((state: RootState) => state.calendar);
  const reduxRawData = calendarState.rawData;

  useEffect(() => {
    if (schoolId) {
      dispatch(fetchCalendar(schoolId) as any);
    }
  }, [schoolId, dispatch]);

=======
>>>>>>> 5f8c7e1 (feat: optimize auto-scheduler and update UI labels)
  /* ===================== FETCH DATA ===================== */
  useEffect(() => {
    if (!schoolId) return;

    if (teacherMapStatus === 'idle') {
      dispatch(fetchTeachersMap(schoolId) as any);
    }

    const fetchSchoolInfo = async (currentSchoolId: string) => {
      const docRef = doc(db, 'school-settings', currentSchoolId);
      const docSnap = await getDoc(docRef);
      if (docSnap.exists()) {
        setSchoolInfo(docSnap.data() as SchoolInfo);
      }
    };

    const fetchCalendarSettings = async () => {
<<<<<<< HEAD
      if (calendarState.status === 'succeeded' && calendarState.academicYear) {
        setAcademicYear(calendarState.academicYear);
        
        // Auto-select term based on current date
        const terms = calendarState.terms;
        if (terms && terms.length > 0) {
          const today = new Date().toISOString().split('T')[0];
          const found = terms.find(t => today >= t.startDate && today <= t.endDate);
          if (found) {
            const termId = found.name.includes('2') ? '2' : '1';
            setCurrentTerm(termId);
            return;
          }
        }
        setCurrentTerm('1'); // Fallback
      } else if (calendarState.status === 'idle' && schoolId) {
        dispatch(fetchCalendar(schoolId) as any);
=======
      const calendarDocRef = doc(db, 'school-settings', schoolId, 'main_calendar', 'default');
      const docSnap = await getDoc(calendarDocRef);
      if (docSnap.exists()) {
        const data = docSnap.data();
        setAcademicYear(data.academicYear || '');

        const today = new Date().toISOString().split('T')[0];
        const term1 = data.terms?.term1;
        const term2 = data.terms?.term2;

        if (term1 && term1.startDate && term1.endDate) {
          if (today >= term1.startDate && today <= term1.endDate) {
            setCurrentTerm('1');
            return;
          }
        }
        if (term2 && term2.startDate && term2.endDate) {
          if (today >= term2.startDate && today <= term2.endDate) {
            setCurrentTerm('2');
            return;
          }
        }
        setCurrentTerm('');
>>>>>>> 5f8c7e1 (feat: optimize auto-scheduler and update UI labels)
      }
    };

    const fetchSpecialPeriods = async (currentSchoolId: string) => {
      try {
        const periodsCollectionRef = collection(db, 'school-settings', currentSchoolId, 'special-periods');
        const querySnapshot = await getDocs(periodsCollectionRef);
        const periodsData = querySnapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        } as SpecialPeriod));
        setSpecialPeriods(periodsData);
      } catch (error) {
        console.error("Error fetching special periods: ", error);
      }
    };

    const fetchPeriodSettings = async (currentSchoolId: string) => {
      try {
        const docRef = doc(db, 'school-settings', currentSchoolId, 'configs', 'schedule_settings');
        const docSnap = await getDoc(docRef);
        if (docSnap.exists() && docSnap.data().periods) {
          setPeriodSettings(docSnap.data().periods);
        } else {
          setPeriodSettings(DEFAULT_PERIODS);
        }
      } catch (error) {
        console.error("Error fetching period settings: ", error);
      }
    };

    const fetchClubs = async (currentSchoolId: string) => {
      try {
        const q = query(collection(db, 'school-settings', currentSchoolId, 'clubs'));
        const snap = await getDocs(q);
        const clubsData = snap.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        } as Club));
        setClubs(clubsData);
      } catch (error) {
        console.error("Error fetching clubs:", error);
      }
    };

    const fetchPhysicalRooms = async (currentSchoolId: string) => {
      try {
        const q = query(collection(db, 'school-settings', currentSchoolId, 'physical-rooms'));
        const snap = await getDocs(q);
        const map: Record<string, string> = {};
        snap.forEach(doc => {
          const data = doc.data();
          map[doc.id] = data.roomCode || data.roomName || doc.id;
        });
        setRoomMap(map);
      } catch (error) {
        console.error("Error fetching physical rooms:", error);
      }
    };

    const fetchCourses = async (currentSchoolId: string) => {
      try {
        const q = query(collection(db, 'school-settings', currentSchoolId, 'courses'));
        const snap = await getDocs(q);
        const map: Record<string, any> = {};
        snap.forEach(doc => {
          map[doc.id] = { id: doc.id, ...doc.data() };
        });
        setCoursesMap(map);
      } catch (error) {
        console.error("Error fetching courses:", error);
      }
    };

    fetchCalendarSettings();
    fetchSchoolInfo(schoolId);
    fetchSpecialPeriods(schoolId);
    fetchPeriodSettings(schoolId);
    fetchClubs(schoolId);
    fetchPhysicalRooms(schoolId);
    fetchCourses(schoolId);
  }, [schoolId, dispatch, teacherMapStatus]);

  /* ===================== FETCH SCHEDULE ===================== */
  useEffect(() => {
    const fetchSchedule = async () => {
      if (!selectedTeacher || !schoolId) {
        setSchedule({});
        setTotalPeriods(0);
        return;
      }

      setIsLoading(true);
      const merged: Schedule = {};

      try {
<<<<<<< HEAD
        const assignmentMap = await fetchAssignmentMap();
=======
>>>>>>> 5f8c7e1 (feat: optimize auto-scheduler and update UI labels)
        const q = query(
          collection(db, 'school-settings', schoolId, 'schedules'),
          where('teacherId', '==', selectedTeacher)
        );
        const snap = await getDocs(q);

        snap.forEach(doc => {
          const data = doc.data();
<<<<<<< HEAD
          if (!matchesSelectedYearTerm(data)) return;

          const scheduleClassName = formatClassNames(data.classId);
=======
          const classIds = Array.isArray(data.classId) ? data.classId : [data.classId];
          const className = classIds.map(c => CLASSES[c as keyof typeof CLASSES] || c).join(', ');
>>>>>>> 5f8c7e1 (feat: optimize auto-scheduler and update UI labels)

          const sch = data.schedule as Record<string, any>;

          Object.entries(sch).forEach(([slot, courseData]) => {
            if (courseData) {
              const courses = Array.isArray(courseData) ? courseData : [courseData];
              courses.forEach((course: Course) => {
                if (!course) return;

<<<<<<< HEAD
                const groupNum = (course as any).groupNumber || 1;
                const assignment = findAssignment(course, data.teacherId, groupNum, assignmentMap);
                const courseWithGroup = { ...course, groupNumber: groupNum };
=======
                const latestCourse = coursesMap[course.id];
                const groupNum = (course as any).groupNumber || 1;
                const assignment = latestCourse?.teacherAssignments?.find((a: any) => 
                  a.teacherId === data.teacherId && (a.groupNumber === groupNum)
                );
>>>>>>> 5f8c7e1 (feat: optimize auto-scheduler and update UI labels)

                const roomIds = assignment?.roomIds || course.room || [];
                let roomDisplay = roomIds.length > 0 && !roomIds.includes('all')
                  ? roomIds.map((id: string) => roomMap[id] || id).join(', ')
                  : '';

                // Fallback to group number only if absolutely no room is assigned
                if (!roomDisplay && groupNum) {
                  roomDisplay = String(groupNum);
                }

<<<<<<< HEAD
                const displayClassName = assignment?.classLevels?.length
                  ? formatClassNames(assignment.classLevels)
                  : scheduleClassName; 

                if (merged[slot] && merged[slot]!.course.id === course.id && merged[slot]!.course.groupNumber === groupNum) {
=======
                const displayClassName = className; 

                if (merged[slot] && merged[slot]!.course.code === course.code) {
>>>>>>> 5f8c7e1 (feat: optimize auto-scheduler and update UI labels)
                  // Same slot, same course -> Merge classes
                  const existingClass = merged[slot]!.className;
                  if (!existingClass.includes(displayClassName)) {
                    merged[slot]!.className = `${existingClass}, ${displayClassName}`;
                  }
                } else {
<<<<<<< HEAD
                  merged[slot] = { course: courseWithGroup, className: displayClassName, roomDisplay };
=======
                  merged[slot] = { course, className: displayClassName, roomDisplay };
>>>>>>> 5f8c7e1 (feat: optimize auto-scheduler and update UI labels)
                }
              });
            }
          });
        });

        setSchedule(merged);
        const scheduleCount = Object.values(merged).filter(Boolean).length;
        const teacherClubsCount = clubs.filter(c => c.responsibleTeacherIds.includes(selectedTeacher)).length;
        setTotalPeriods(scheduleCount + teacherClubsCount);
      } catch {
        alert('ไม่สามารถดึงข้อมูลตารางสอนได้');
      } finally {
        setIsLoading(false);
      }
    };

    fetchSchedule();
<<<<<<< HEAD
  }, [selectedTeacher, schoolId, clubs, academicYear, currentTerm, coursesMap, roomMap]);
=======
  }, [selectedTeacher, schoolId, clubs]);
>>>>>>> 5f8c7e1 (feat: optimize auto-scheduler and update UI labels)

  const prepareBulkExport = async () => {
    if (!schoolId) return;
    setIsPreparingBulk(true);
    try {
<<<<<<< HEAD
      const assignmentMap = await fetchAssignmentMap();
=======
>>>>>>> 5f8c7e1 (feat: optimize auto-scheduler and update UI labels)
      const q = query(collection(db, 'school-settings', schoolId, 'schedules'));
      const snap = await getDocs(q);
      const allSchedules: Record<string, any> = {};

      snap.forEach(doc => {
        const data = doc.data();
<<<<<<< HEAD
        if (!matchesSelectedYearTerm(data)) return;

        if (!allSchedules[data.teacherId]) allSchedules[data.teacherId] = {};

        const scheduleClassName = formatClassNames(data.classId);
=======
        if (!allSchedules[data.teacherId]) allSchedules[data.teacherId] = {};

        const classIds = Array.isArray(data.classId) ? data.classId : [data.classId];
        const className = classIds.map((c: any) => CLASSES[c as keyof typeof CLASSES] || c).join(', ');
>>>>>>> 5f8c7e1 (feat: optimize auto-scheduler and update UI labels)

        const sch = data.schedule;
        Object.entries(sch).forEach(([slot, courseData]: [string, any]) => {
          if (courseData) {
            const courses = Array.isArray(courseData) ? courseData : [courseData];
            courses.forEach((course: Course) => {
              if (!course) return;

<<<<<<< HEAD
              const groupNum = (course as any).groupNumber || 1;
              const assignment = findAssignment(course, data.teacherId, groupNum, assignmentMap);
              const courseWithGroup = { ...course, groupNumber: groupNum };
=======
              const latestCourse = coursesMap[course.id];
              const groupNum = (course as any).groupNumber || 1;
              const assignment = latestCourse?.teacherAssignments?.find((a: any) => 
                a.teacherId === data.teacherId && (a.groupNumber === groupNum)
              );
>>>>>>> 5f8c7e1 (feat: optimize auto-scheduler and update UI labels)

              const roomIds = assignment?.roomIds || course.room || [];
              let roomDisplay = roomIds.length > 0 && !roomIds.includes('all')
                ? roomIds.map((id: string) => roomMap[id] || id).join(', ')
                : '';

              // Fallback to group number if room is empty
              if (!roomDisplay && groupNum) {
                roomDisplay = String(groupNum);
              }

<<<<<<< HEAD
              const className = assignment?.classLevels?.length
                ? formatClassNames(assignment.classLevels)
                : scheduleClassName;

              const currentEntry = allSchedules[data.teacherId][slot];
              if (currentEntry && currentEntry.course.id === course.id && currentEntry.course.groupNumber === groupNum) {
=======
              const currentEntry = allSchedules[data.teacherId][slot];
              if (currentEntry && currentEntry.course.code === course.code) {
>>>>>>> 5f8c7e1 (feat: optimize auto-scheduler and update UI labels)
                if (!currentEntry.className.includes(className)) {
                  currentEntry.className = `${currentEntry.className}, ${className}`;
                }
              } else {
<<<<<<< HEAD
                allSchedules[data.teacherId][slot] = { course: courseWithGroup, className, roomDisplay };
=======
                allSchedules[data.teacherId][slot] = { course, className, roomDisplay };
>>>>>>> 5f8c7e1 (feat: optimize auto-scheduler and update UI labels)
              }
            });
          }
        });
      });

      const data = teachers.map(teacher => {
        const schedule = allSchedules[teacher.id] || {};
        const scheduleCount = Object.values(schedule).filter(Boolean).length;
        const teacherClubsCount = clubs.filter(c => c.responsibleTeacherIds.includes(teacher.id)).length;
        return { teacher, schedule, totalPeriods: scheduleCount + teacherClubsCount };
      });
      setBulkData(data);
    } catch (e) {
      console.error(e);
      alert('เกิดข้อผิดพลาดในการเตรียมข้อมูลสำหรับ PDF รวม');
    } finally {
      setIsPreparingBulk(false);
    }
  };

  /* ===================== RENDER ===================== */
  return (
    <MainLayout>
      <div className="px-3 sm:px-4 md:px-6 lg:px-8 py-4 sm:py-6 lg:py-8 min-h-screen bg-gray-50 dark:bg-gray-900 text-gray-900 dark:text-white transition-colors duration-300">
        <div className="max-w-7xl mx-auto">

          {/* Header Section */}
          <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-8 gap-4">
            <div>
<<<<<<< HEAD
              <BackButton to="/academic/hub/scheduling" />
=======
              <Link to="/academic-admin" className="inline-flex items-center text-indigo-600 dark:text-indigo-400 hover:text-indigo-700 dark:hover:text-indigo-300 mb-2 transition-colors font-medium">
                <ArrowLeft size={20} className="mr-1" /> กลับหน้าบริหารงานวิชาการ
              </Link>
>>>>>>> 5f8c7e1 (feat: optimize auto-scheduler and update UI labels)
              <h1 className="text-3xl font-bold text-gray-900 dark:text-white flex items-center gap-3 mt-2">
                <Calendar className="text-indigo-600 dark:text-indigo-400" size={32} />
                ดูตารางสอนครู
              </h1>
              <p className="text-gray-500 dark:text-gray-400 mt-1 text-base">
                ตรวจสอบและพิมพ์ตารางสอนรายบุคคล หรือพิมพ์รวมทั้งโรงเรียน
              </p>
            </div>
          </div>

          {/* Control Bar */}
          <div className="bg-white dark:bg-[#2a2b2f] p-6 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 mb-6 sticky top-[70px] z-30">
            <div className="flex flex-col lg:flex-row gap-6 items-center justify-between">

              {/* Teacher Selector */}
              <div className="w-full lg:w-1/3 relative">
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  เลือกครูผู้สอน
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                    <User className="h-5 w-5 text-gray-400" />
                  </div>
                  <select
                    value={selectedTeacher}
                    onChange={e => setSelectedTeacher(e.target.value)}
                    className="block w-full pl-10 pr-10 py-3 text-base border-gray-300 dark:border-gray-600 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm rounded-xl bg-gray-50 dark:bg-[#1e1f21] text-gray-900 dark:text-white transition-all hover:bg-gray-100 dark:hover:bg-gray-800 cursor-pointer appearance-none"
                  >
                    <option value="">-- กรุณาเลือกครู --</option>
                    {teachers.map((t: Teacher) => (
                      <option key={t.id} value={t.id}>{t.name}</option>
                    ))}
                  </select>
                  <div className="absolute inset-y-0 right-0 pr-3 flex items-center pointer-events-none">
                    <Search className="h-4 w-4 text-gray-400" />
                  </div>
                </div>
              </div>

              {/* Actions */}
              <div className="flex flex-wrap gap-3 w-full lg:w-auto justify-end">
                {selectedTeacher && (
                  <PDFDownloadLink
                    document={
                      <TeacherSchedulePDF
                        schedule={schedule}
                        periodSettings={periodSettings}
                        schoolInfo={schoolInfo}
                        teacher={selectedTeacherData}
                        academicYear={academicYear}
                        currentTerm={currentTerm}
                        specialPeriods={specialPeriods}
                        totalPeriods={totalPeriods}
                        clubs={clubs}
                      />
                    }
                    fileName={`ตารางสอน_${selectedTeacherData?.name || 'teacher'}.pdf`}
                    className="flex items-center justify-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white px-6 py-3 rounded-xl font-medium transition-all shadow-lg shadow-indigo-200 dark:shadow-none transform hover:-translate-y-0.5"
                  >
                    {/* @ts-ignore */}
                    {({ loading }) => loading ? <><Loader2 className="animate-spin" size={20} /> กำลังสร้าง PDF...</> : <><Printer size={20} /> พิมพ์ตารางสอน</>}
                  </PDFDownloadLink>
                )}

                {!bulkData ? (
                  <button
                    onClick={prepareBulkExport}
                    disabled={isPreparingBulk || teachers.length === 0}
                    className="flex items-center justify-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white px-6 py-3 rounded-xl font-medium transition-all shadow-lg shadow-emerald-200 dark:shadow-none transform hover:-translate-y-0.5 disabled:bg-gray-400 disabled:cursor-not-allowed disabled:transform-none disabled:shadow-none"
                  >
                    {isPreparingBulk ? <><Loader2 className="animate-spin" size={20} /> กำลังเตรียมข้อมูล...</> : <><FileDown size={20} /> โหลดรวมทุกท่าน</>}
                  </button>
                ) : (
                  <PDFDownloadLink
                    document={
                      <BulkTeacherSchedulePDF
                        data={bulkData}
                        periodSettings={periodSettings}
                        schoolInfo={schoolInfo}
                        academicYear={academicYear}
                        currentTerm={currentTerm}
                        specialPeriods={specialPeriods}
                        clubs={clubs}
                      />
                    }
                    fileName="ตารางสอนครูทั้งหมด.pdf"
                    className="flex items-center justify-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white px-6 py-3 rounded-xl font-medium transition-all shadow-lg shadow-emerald-200 dark:shadow-none transform hover:-translate-y-0.5"
                  >
                    {/* @ts-ignore */}
                    {({ loading }) => loading ? <><Loader2 className="animate-spin" size={20} /> กำลังสร้าง PDF รวม...</> : <><FileDown size={20} /> ดาวน์โหลด PDF รวม</>}
                  </PDFDownloadLink>
                )}
              </div>
            </div>
          </div>

          {/* Content Area */}
          <div className="bg-white dark:bg-[#2a2b2f] rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 overflow-hidden min-h-[600px]">
            {isLoading ? (
              <div className="flex flex-col justify-center items-center h-[600px] bg-gray-50 dark:bg-[#202125]">
                <Loader2 className="animate-spin text-indigo-600 mb-4" size={48} />
                <p className="text-gray-500 font-medium">กำลังโหลดข้อมูลตารางสอน...</p>
              </div>
            ) : !selectedTeacher ? (
              <div className="flex flex-col justify-center items-center h-[600px] bg-gray-50 dark:bg-[#202125] text-center p-8">
                <div className="w-24 h-24 bg-indigo-100 dark:bg-indigo-900/30 rounded-full flex items-center justify-center mb-6">
                  <Calendar className="text-indigo-600 dark:text-indigo-400" size={48} />
                </div>
                <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-2">ยังไม่ได้เลือกครูผู้สอน</h3>
                <p className="text-gray-500 dark:text-gray-400 max-w-md">
                  กรุณาเลือกครูจากรายการด้านบนเพื่อดูตารางสอน หรือกดปุ่ม "โหลดรวมทุกท่าน" เพื่อดาวน์โหลดตารางสอนของครูทุกคนในโรงเรียน
                </p>
              </div>
            ) : (
              <div className="w-full h-[85vh] bg-gray-100 dark:bg-gray-900">
                <PDFViewer width="100%" height="100%" className="w-full h-full border-none" showToolbar={true}>
                  <TeacherSchedulePDF
                    schedule={schedule}
                    periodSettings={periodSettings}
                    schoolInfo={schoolInfo}
                    teacher={selectedTeacherData}
                    academicYear={academicYear}
                    currentTerm={currentTerm}
                    specialPeriods={specialPeriods}
                    totalPeriods={totalPeriods}
                    clubs={clubs}
                  />
                </PDFViewer>
              </div>
            )}
          </div>

        </div>
      </div>
    </MainLayout>
  );
};

<<<<<<< HEAD
export default TeacherScheduleViewPage;
=======
export default TeacherScheduleViewPage;
>>>>>>> 5f8c7e1 (feat: optimize auto-scheduler and update UI labels)
