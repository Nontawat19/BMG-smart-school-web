import React, { useEffect, useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { collection, getDocs, query, where, doc, getDoc } from 'firebase/firestore';
import { useSelector, useDispatch } from 'react-redux';
import { RootState } from '@/store';
import { firestore as db } from '../../firebase';
import MainLayout from "@/layouts/MainLayout";
import { fetchTeachersMap } from '@/store/slices/userMapSlice';
import { fetchCalendar } from '@/store/slices/calendarSlice';
import { Loader2, FileDown, Calendar, User, Printer, Search, X } from 'lucide-react';
import BackButton from '@/components/Shared/BackButton';
import { Document, Page, Text, View, StyleSheet, Font, Image, PDFViewer } from '@react-pdf/renderer';
import { TeacherSchedulePDF, BulkTeacherSchedulePDF, Teacher, Course, Schedule, ScheduleEntry, SpecialPeriod, PeriodSetting, SchoolInfo, Club } from '@/components/Pdf/TeacherScheduleDocument';
import { pdf } from '@react-pdf/renderer';
import Select, { StylesConfig } from 'react-select';
import { useTheme } from '@/ThemeContext';
import toast from 'react-hot-toast';
import { saveAs } from 'file-saver';
import { CLASSES, CLASS_FULL_NAMES } from '@/utils/schoolUtils';
import { getActiveSortedTeachers } from '@/utils/teacherSortUtils';
import { normalizePeriodSettings } from '@/utils/scheduleDisplayUtils';
import { getScheduleDocId, matchesScheduleTerm, resolveScheduleTeacherId } from './schedule/scheduleSharedUtils';

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

const getAssignmentTeacherIds = (assignment: any): string[] => {
  const ids = Array.isArray(assignment?.teacherIds) && assignment.teacherIds.length > 0
    ? assignment.teacherIds
    : (assignment?.teacherId ? [assignment.teacherId] : []);
  return Array.from(new Set(ids.filter(Boolean)));
};

const assignmentIncludesTeacher = (assignment: any, teacherId: string) => {
  const ids = getAssignmentTeacherIds(assignment);
  return ids.length === 0 || ids.includes(teacherId);
};

const getTeacherPeriodLabel = (assignment: any, teacherId: string) => {
  const periodRange = assignment?.teacherPeriods?.[teacherId];
  if (!periodRange) return '';

  const start = Number(periodRange.start);
  const end = Number(periodRange.end);
  if (!Number.isFinite(start) || !Number.isFinite(end) || start <= 0 || end < start) return '';

  return start === end ? `คาบสอน ${start}` : `คาบสอน ${start}-${end}`;
};

const matchesYearTermValue = (data: any, year: string, term: string): boolean => {
  const dataYear = String(data.academicYear || '');
  const dataTerm = String(data.semester || '');
  const yearMatches = !year || !dataYear || dataYear === String(year);
  const termMatches = !term || !dataTerm || dataTerm === String(term) || dataTerm.startsWith(`${term}/`) || String(term).startsWith(`${dataTerm}/`);
  return yearMatches && termMatches;
};

const getCanonicalScheduleDocs = (
  docs: Array<{ id: string; data: any }>,
  knownTeacherIds: string[],
  year: string,
  term: string
) => {
  const matching = docs
    .map(({ id, data }) => {
      if (!matchesScheduleTerm(data, year, term)) return null;
      const teacherId = resolveScheduleTeacherId(id, data.teacherId, knownTeacherIds);
      const canonicalId = getScheduleDocId(teacherId, String(data.academicYear || year || ''), String(data.semester || term || '1'));
      return { id, data, teacherId, isCanonical: id === canonicalId || id.includes('__') };
    })
    .filter(Boolean) as Array<{ id: string; data: any; teacherId: string; isCanonical: boolean }>;

  const teachersWithCanonicalDocs = new Set(
    matching.filter(item => item.isCanonical).map(item => item.teacherId)
  );

  return matching.filter(item => item.isCanonical || !teachersWithCanonicalDocs.has(item.teacherId));
};

const DEFAULT_PERIODS: PeriodSetting[] = [
  { id: 'homeroom', label: 'โฮมรูม', startTime: '08.30', endTime: '08.40', isTeachingPeriod: false, isFixed: true },
  { id: 'period-1', label: 'คาบที่ 1', startTime: '08.40', endTime: '09.30', isTeachingPeriod: true },
  { id: 'period-2', label: 'คาบที่ 2', startTime: '09.30', endTime: '10.20', isTeachingPeriod: true },
  { id: 'period-3', label: 'คาบที่ 3', startTime: '10.20', endTime: '11.10', isTeachingPeriod: true },
  { id: 'period-4', label: 'คาบที่ 4', startTime: '11.10', endTime: '12.00', isTeachingPeriod: true },
  { id: 'lunch', label: 'พักกลางวัน', startTime: '12.00', endTime: '13.00', isTeachingPeriod: false, isFixed: true },
  { id: 'period-5', label: 'คาบที่ 5', startTime: '13.00', endTime: '13.50', isTeachingPeriod: true },
  { id: 'period-6', label: 'คาบที่ 6', startTime: '13.50', endTime: '14.40', isTeachingPeriod: true },
  { id: 'period-7', label: 'คาบที่ 7', startTime: '14.40', endTime: '15.30', isTeachingPeriod: true },
  { id: 'period-8', label: 'คาบที่ 8', startTime: '15.30', endTime: '16.00', isTeachingPeriod: true },
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
  const [learnerActivities, setLearnerActivities] = useState<any[]>([]);
  const [bulkData, setBulkData] = useState<any[] | null>(null);
  const [isPreparingBulk, setIsPreparingBulk] = useState(false);
  const [showTeacherPdfPreview, setShowTeacherPdfPreview] = useState(false);
  const [isDownloadingTeacherPdf, setIsDownloadingTeacherPdf] = useState(false);
  const [showBulkPdfPreview, setShowBulkPdfPreview] = useState(false);
  const [isDownloadingBulkPdf, setIsDownloadingBulkPdf] = useState(false);

  const currentUser = useSelector((state: RootState) => state.auth.user);
  const { teachers: teacherMap, status: teacherMapStatus } = useSelector((state: RootState) => state.userMap);
  const teachers = useMemo(() => 
    getActiveSortedTeachers(Object.values(teacherMap)),
    [teacherMap]
  );
  const schoolId = (currentUser as any)?.schoolId;
  const { isDarkMode } = useTheme();
  const dispatch = useDispatch();

  const teacherOptions = useMemo(() => 
    teachers.map((t: Teacher) => ({
      value: t.id,
      label: `${t.teacherId ? `${t.teacherId} ` : ''}${t.name}`,
      teacher: t
    })),
    [teachers]
  );

  const selectedOption = useMemo(() => 
    teacherOptions.find(opt => opt.value === selectedTeacher) || null,
    [teacherOptions, selectedTeacher]
  );

  const termOptions = [
    { value: '1', label: 'ภาคเรียนที่ 1' },
    { value: '2', label: 'ภาคเรียนที่ 2' },
  ];

  const selectedTermOption = useMemo(() => 
    termOptions.find(opt => opt.value === currentTerm) || null,
    [currentTerm]
  );

  const selectStyles: StylesConfig<any> = {
    control: (base, state) => ({
      ...base,
      backgroundColor: isDarkMode ? '#1e1f21' : '#f9fafb',
      borderColor: state.isFocused ? '#6366f1' : (isDarkMode ? '#4b5563' : '#d1d5db'),
      borderRadius: '0.75rem',
      paddingLeft: '2.5rem',
      paddingRight: '0.5rem',
      minHeight: '3rem',
      boxShadow: state.isFocused ? (isDarkMode ? '0 0 0 1px #6366f1' : '0 0 0 1px #6366f1') : 'none',
      borderWidth: '1px',
      '&:hover': {
        borderColor: '#6366f1',
      },
      transition: 'all 0.2s',
      cursor: 'pointer',
    }),
    singleValue: (base) => ({
      ...base,
      color: isDarkMode ? '#f3f4f6' : '#111827',
      fontWeight: '500',
    }),
    menu: (base) => ({
      ...base,
      backgroundColor: isDarkMode ? '#2a2b2f' : 'white',
      borderRadius: '1rem',
      border: isDarkMode ? '1px solid #4b5563' : '1px solid #e5e7eb',
      boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.1), 0 8px 10px -6px rgba(0, 0, 0, 0.1)',
      marginTop: '0.5rem',
      overflow: 'hidden',
      zIndex: 50,
    }),
    menuList: (base) => ({
      ...base,
      padding: '0.5rem',
      '::-webkit-scrollbar': {
        width: '6px',
      },
      '::-webkit-scrollbar-track': {
        background: 'transparent',
      },
      '::-webkit-scrollbar-thumb': {
        background: isDarkMode ? '#4b5563' : '#d1d5db',
        borderRadius: '10px',
      },
      '::-webkit-scrollbar-thumb:hover': {
        background: isDarkMode ? '#6b7280' : '#9ca3af',
      },
    }),
    option: (base, { isFocused, isSelected }) => ({
      ...base,
      backgroundColor: isSelected 
        ? '#6366f1' 
        : isFocused 
          ? (isDarkMode ? 'rgba(99, 102, 241, 0.1)' : '#f3f4f6') 
          : 'transparent',
      color: isSelected ? 'white' : (isDarkMode ? '#e5e7eb' : '#374151'),
      padding: '0.75rem 1rem',
      borderRadius: '0.5rem',
      margin: '2px 0',
      cursor: 'pointer',
      fontWeight: isSelected ? '600' : '400',
      '&:active': {
        backgroundColor: '#4f46e5',
      },
    }),
    input: (base) => ({
      ...base,
      color: isDarkMode ? 'white' : 'black',
    }),
    placeholder: (base) => ({
      ...base,
      color: isDarkMode ? '#9ca3af' : '#6b7280',
    }),
    indicatorSeparator: () => ({ display: 'none' }),
    dropdownIndicator: (base) => ({
      ...base,
      color: isDarkMode ? '#9ca3af' : '#6b7280',
      '&:hover': {
        color: isDarkMode ? '#f3f4f6' : '#111827',
      }
    }),
    clearIndicator: (base) => ({
      ...base,
      color: isDarkMode ? '#9ca3af' : '#6b7280',
      '&:hover': {
        color: '#ef4444',
      }
    }),
  };

  const selectedTeacherData = (teacherMap[selectedTeacher] as Teacher) || null;

  const formatClassNames = (classIds: any, groupNum?: number, roomNum?: string | number): string => {
    const ids = Array.isArray(classIds) ? classIds : [classIds].filter(Boolean);
    const groupSuffix = groupNum ? ` (กลุ่ม ${groupNum})` : '';
    const roomSuffix = roomNum ? `/${roomNum}` : '';
    return ids.map(c => {
      const baseName = CLASSES[c as keyof typeof CLASSES] || c;
      return `${baseName}${roomSuffix}${groupSuffix}`;
    }).join(', ');
  };

  const matchesSelectedYearTerm = (data: any): boolean => {
    if (!academicYear || !currentTerm) return false;
    return matchesYearTermValue(data, academicYear, currentTerm);
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
      const data = doc.data() as any;
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
      assignmentIncludesTeacher(a, teacherId) && Number(a.groupNumber || 1) === Number(groupNumber)
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
          setPeriodSettings(normalizePeriodSettings(docSnap.data().periods));
        } else {
          setPeriodSettings(normalizePeriodSettings(DEFAULT_PERIODS));
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
          ...(doc.data() as any)
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
          const data = doc.data() as any;
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
          map[doc.id] = { id: doc.id, ...(doc.data() as any) };
        });
        setCoursesMap(map);
      } catch (error) {
        console.error("Error fetching courses:", error);
      }
    };

    const fetchLearnerActivities = async (currentSchoolId: string) => {
      try {
        const snap = await getDocs(collection(db, 'school-settings', currentSchoolId, 'learner-activities'));
        setLearnerActivities(snap.docs.map(d => ({ id: d.id, ...d.data() })));
      } catch (error) {
        console.error('Error fetching learner activities:', error);
      }
    };

    fetchCalendarSettings();
    fetchSchoolInfo(schoolId);
    fetchSpecialPeriods(schoolId);
    fetchPeriodSettings(schoolId);
    fetchClubs(schoolId);
    fetchPhysicalRooms(schoolId);
    fetchCourses(schoolId);
    fetchLearnerActivities(schoolId);
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
        const assignmentMap = await fetchAssignmentMap();
        const snap = await getDocs(collection(db, 'school-settings', schoolId, 'schedules'));
        const canonicalDocs = getCanonicalScheduleDocs(
          snap.docs.map(scheduleDoc => ({ id: scheduleDoc.id, data: scheduleDoc.data() })),
          teachers.map(t => t.id),
          academicYear,
          currentTerm
        ).filter(item => item.teacherId === selectedTeacher);

        canonicalDocs.forEach(({ data, teacherId }) => {
          if (!matchesSelectedYearTerm(data)) return;

          const scheduleClassName = formatClassNames(data.classId, (Object.values(data.schedule || {})[0] as any)?.groupNumber);

          const sch = data.schedule as Record<string, any>;

          Object.entries(sch).forEach(([slot, courseData]) => {
            if (courseData) {
              const courses = Array.isArray(courseData) ? courseData : [courseData];
              courses.forEach((course: Course) => {
                if (!course || (course as any).isTemporarySchedule) return;

                const groupNum = (course as any).groupNumber || 1;
                const assignment = findAssignment(course, teacherId, groupNum, assignmentMap);
                const courseWithGroup = {
                  ...course,
                  groupNumber: groupNum,
                  teacherPeriodLabel: getTeacherPeriodLabel(assignment, teacherId),
                };

                const roomIds = assignment?.roomIds || course.room || [];
                let roomDisplay = roomIds.length > 0 && !roomIds.includes('all')
                  ? roomIds.map((id: string) => roomMap[id] || id).join(', ')
                  : '';

                // Fallback to group number only if absolutely no room is assigned
                if (!roomDisplay && groupNum) {
                  roomDisplay = String(groupNum);
                }

                const displayClassName = assignment?.classLevels?.length
                  ? formatClassNames(assignment.classLevels, groupNum, assignment.room)
                  : formatClassNames(data.classId, groupNum, (course as any).room); 

                if (merged[slot] && merged[slot]!.course.id === course.id && merged[slot]!.course.groupNumber === groupNum) {
                  // Same slot, same course -> Merge classes
                  const existingClass = merged[slot]!.className;
                  if (!existingClass.includes(displayClassName)) {
                    merged[slot]!.className = `${existingClass}, ${displayClassName}`;
                  }
                } else {
                  merged[slot] = { course: courseWithGroup, className: displayClassName, roomDisplay };
                }
              });
            }
          });
        });

        setSchedule(merged);
        const scheduleCount = Object.values(merged).filter(Boolean).length;
        const teacherClubsCount = clubs.filter(c => c.responsibleTeacherIds.includes(selectedTeacher)).length;

        // Count special period teaching load for activities this teacher is responsible for
        const teacherSpIds = new Set(
          learnerActivities
            .filter(a => Array.isArray(a.responsibleTeacherIds) && a.responsibleTeacherIds.includes(selectedTeacher) && a.specialPeriodId)
            .map(a => a.specialPeriodId)
        );
        const teacherSpecialPeriods = specialPeriods.filter(sp => teacherSpIds.has(sp.id) && sp.countAsTeachingPeriod);
        let specialPeriodsCount = 0;
        const weekdays = ['mon', 'tue', 'wed', 'thu', 'fri'];
        teacherSpecialPeriods.forEach(sp => {
          if (sp.linkedPeriodId && periodSettings.length > 0) {
            weekdays.forEach(day => {
              if ((!sp.day || sp.day === day || sp.day === 'all') &&
                  periodSettings.some(p => p.id === sp.linkedPeriodId)) {
                specialPeriodsCount++;
              }
            });
          } else {
            specialPeriodsCount += (!sp.day || sp.day === 'all')
              ? 5
              : weekdays.includes(sp.day ?? '') ? 1 : 0;
          }
        });

        setTotalPeriods(scheduleCount + teacherClubsCount + specialPeriodsCount);
      } catch {
        alert('ไม่สามารถดึงข้อมูลตารางสอนได้');
      } finally {
        setIsLoading(false);
      }
    };

    fetchSchedule();
  }, [selectedTeacher, schoolId, clubs, academicYear, currentTerm, coursesMap, roomMap, learnerActivities, specialPeriods, periodSettings]);

  const prepareBulkExport = async () => {
    if (!schoolId) return;
    setIsPreparingBulk(true);
    try {
      const assignmentMap = await fetchAssignmentMap();
      const snap = await getDocs(collection(db, 'school-settings', schoolId, 'schedules'));
      const canonicalDocs = getCanonicalScheduleDocs(
        snap.docs.map(scheduleDoc => ({ id: scheduleDoc.id, data: scheduleDoc.data() })),
        teachers.map(t => t.id),
        academicYear,
        currentTerm
      );
      const allSchedules: Record<string, any> = {};

      canonicalDocs.forEach(({ data, teacherId }) => {
        if (!matchesSelectedYearTerm(data)) return;

        if (!allSchedules[teacherId]) allSchedules[teacherId] = {};

        const scheduleClassName = formatClassNames(data.classId);

        const sch = data.schedule;
        Object.entries(sch).forEach(([slot, courseData]: [string, any]) => {
          if (courseData) {
            const courses = Array.isArray(courseData) ? courseData : [courseData];
            courses.forEach((course: Course) => {
              if (!course || (course as any).isTemporarySchedule) return;

              const groupNum = (course as any).groupNumber || 1;
              const assignment = findAssignment(course, teacherId, groupNum, assignmentMap);
              const courseWithGroup = {
                ...course,
                groupNumber: groupNum,
                teacherPeriodLabel: getTeacherPeriodLabel(assignment, teacherId),
              };

              const roomIds = assignment?.roomIds || course.room || [];
              let roomDisplay = roomIds.length > 0 && !roomIds.includes('all')
                ? roomIds.map((id: string) => roomMap[id] || id).join(', ')
                : '';

              // Fallback to group number if room is empty
              if (!roomDisplay && groupNum) {
                roomDisplay = String(groupNum);
              }

              const className = assignment?.classLevels?.length
                ? formatClassNames(assignment.classLevels, groupNum, assignment.room)
                : formatClassNames(data.classId, groupNum, (course as any).room);

              const currentEntry = allSchedules[teacherId][slot];
              if (currentEntry && currentEntry.course.id === course.id && currentEntry.course.groupNumber === groupNum) {
                if (!currentEntry.className.includes(className)) {
                  currentEntry.className = `${currentEntry.className}, ${className}`;
                }
              } else {
                allSchedules[teacherId][slot] = { course: courseWithGroup, className, roomDisplay };
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

  const buildTeacherPdfDocument = () => (
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
  );

  const downloadTeacherPdf = async () => {
    setIsDownloadingTeacherPdf(true);
    try {
      const blob = await pdf(buildTeacherPdfDocument()).toBlob();
      saveAs(blob, `ตารางสอน_${selectedTeacherData?.name || 'teacher'}.pdf`);
    } finally {
      setIsDownloadingTeacherPdf(false);
    }
  };

  const buildBulkPdfDocument = () => (
    <BulkTeacherSchedulePDF
      data={bulkData || []}
      periodSettings={periodSettings}
      schoolInfo={schoolInfo}
      academicYear={academicYear}
      currentTerm={currentTerm}
      specialPeriods={specialPeriods}
      clubs={clubs}
    />
  );

  const downloadBulkPdf = async () => {
    setIsDownloadingBulkPdf(true);
    try {
      const blob = await pdf(buildBulkPdfDocument()).toBlob();
      saveAs(blob, "ตารางสอนครูทั้งหมด.pdf");
    } finally {
      setIsDownloadingBulkPdf(false);
    }
  };

  /* ===================== RENDER ===================== */
  return (
    <MainLayout>
      <div className="px-3 sm:px-4 md:px-6 lg:px-8 py-4 sm:py-6 lg:py-8 min-h-screen bg-gray-50 dark:bg-gray-900 text-gray-900 dark:text-white transition-colors duration-300">
        <div className="max-w-7xl mx-auto">

          {/* Header Section */}
          <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-8 gap-4">
            <div className="flex items-center gap-4">
              <div className="ml-10"> {/* Shift right to avoid sidebar toggle */}
                <BackButton to="/academic/hub/scheduling" />
              </div>
              <div className="flex flex-col">
                <h1 className="text-3xl font-bold text-gray-900 dark:text-white flex items-center gap-3">
                  <Calendar className="text-indigo-600 dark:text-indigo-400" size={32} />
                  ดูตารางสอนครู
                </h1>
                <p className="text-gray-500 dark:text-gray-400 mt-1 text-base">
                  ตรวจสอบและพิมพ์ตารางสอนรายบุคคล หรือพิมพ์รวมทั้งโรงเรียน
                </p>
              </div>
            </div>
          </div>

          {/* Control Bar */}
          <div className="bg-white dark:bg-[#2a2b2f] p-4 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 mb-6 sticky top-[70px] z-30">
            <div className="flex flex-col lg:flex-row gap-6 items-end justify-between">

              <div className="flex flex-col md:flex-row gap-6 w-full lg:w-2/3">
                {/* Teacher Selector */}
                <div className="w-full md:w-3/5 relative">
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    เลือกครูผู้สอน
                  </label>
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                      <User className="h-5 w-5 text-gray-400" />
                    </div>
                    <Select
                      value={selectedOption}
                      onChange={(option: any) => setSelectedTeacher(option?.value || '')}
                      options={teacherOptions}
                      placeholder="-- กรุณาเลือกครู --"
                      isClearable
                      isSearchable
                      maxMenuHeight={400}
                      className="react-select-container"
                      classNamePrefix="react-select"
                      styles={selectStyles}
                      noOptionsMessage={() => "ไม่พบข้อมูลครู"}
                    />
                  </div>
                </div>

                {/* Semester Selector */}
                <div className="w-full md:w-2/5 relative">
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    เลือกภาคเรียน
                  </label>
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                      <Calendar className="h-5 w-5 text-gray-400" />
                    </div>
                    <Select
                      value={selectedTermOption}
                      onChange={(option: any) => setCurrentTerm(option?.value || '1')}
                      options={termOptions}
                      placeholder="-- เลือกภาคเรียน --"
                      className="react-select-container"
                      classNamePrefix="react-select"
                      styles={selectStyles}
                    />
                  </div>
                </div>
              </div>

              {/* Actions */}
              <div className="flex flex-row gap-3 w-full lg:w-auto justify-end mt-4 lg:mt-0">
                {selectedTeacher && (
                  <button
                    type="button"
                    onClick={() => setShowTeacherPdfPreview(true)}
                    className="flex items-center justify-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white px-5 h-12 rounded-xl font-medium transition-all shadow-lg shadow-indigo-200 dark:shadow-none transform hover:-translate-y-0.5 whitespace-nowrap"
                  >
                    <Printer size={20} /> พิมพ์ตารางสอน
                  </button>
                )}

                {!bulkData ? (
                  <button
                    onClick={prepareBulkExport}
                    disabled={isPreparingBulk || teachers.length === 0}
                    className="flex items-center justify-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white px-5 h-12 rounded-xl font-medium transition-all shadow-lg shadow-emerald-200 dark:shadow-none transform hover:-translate-y-0.5 disabled:bg-gray-400 disabled:cursor-not-allowed disabled:transform-none disabled:shadow-none whitespace-nowrap"
                  >
                    {isPreparingBulk ? <><Loader2 className="animate-spin" size={20} /> กำลังเตรียมข้อมูล...</> : <><FileDown size={20} /> โหลดรวมทุกท่าน</>}
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => setShowBulkPdfPreview(true)}
                    className="flex items-center justify-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white px-5 h-12 rounded-xl font-medium transition-all shadow-lg shadow-emerald-200 dark:shadow-none transform hover:-translate-y-0.5 whitespace-nowrap"
                  >
                    <FileDown size={20} /> ดาวน์โหลด PDF รวม
                  </button>
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

      {showTeacherPdfPreview && (
        <div
          className="fixed inset-0 top-[60px] z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
          onClick={() => setShowTeacherPdfPreview(false)}
        >
          <div
            className="flex h-[calc(100vh-100px)] w-full max-w-5xl flex-col rounded-2xl bg-white shadow-2xl dark:bg-[#1e1f21]"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-gray-200 px-5 py-4 dark:border-gray-700">
              <h2 className="text-base font-bold text-gray-900 dark:text-white">
                ตัวอย่างเอกสาร — ตารางสอน {selectedTeacherData?.name || ''}
              </h2>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={downloadTeacherPdf}
                  disabled={isDownloadingTeacherPdf}
                  className="inline-flex h-9 items-center justify-center gap-2 rounded-lg bg-indigo-600 px-4 text-sm font-bold text-white shadow-sm transition hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {isDownloadingTeacherPdf ? <Loader2 size={16} className="animate-spin" /> : <FileDown size={16} />}
                  {isDownloadingTeacherPdf ? "กำลังบันทึก..." : "ดาวน์โหลด"}
                </button>
                <button
                  type="button"
                  onClick={() => setShowTeacherPdfPreview(false)}
                  className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-gray-500 transition hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-700"
                  title="ปิด"
                >
                  <X size={18} />
                </button>
              </div>
            </div>
            <div className="flex-1 overflow-hidden rounded-b-2xl bg-gray-100 dark:bg-gray-900">
              <PDFViewer width="100%" height="100%" className="h-full w-full border-none" showToolbar={true}>
                {buildTeacherPdfDocument()}
              </PDFViewer>
            </div>
          </div>
        </div>
      )}

      {showBulkPdfPreview && bulkData && (
        <div
          className="fixed inset-0 top-[60px] z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
          onClick={() => setShowBulkPdfPreview(false)}
        >
          <div
            className="flex h-[calc(100vh-100px)] w-full max-w-5xl flex-col rounded-2xl bg-white shadow-2xl dark:bg-[#1e1f21]"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-gray-200 px-5 py-4 dark:border-gray-700">
              <h2 className="text-base font-bold text-gray-900 dark:text-white">
                ตัวอย่างเอกสาร — ตารางสอนครูทั้งหมด
              </h2>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={downloadBulkPdf}
                  disabled={isDownloadingBulkPdf}
                  className="inline-flex h-9 items-center justify-center gap-2 rounded-lg bg-emerald-600 px-4 text-sm font-bold text-white shadow-sm transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {isDownloadingBulkPdf ? <Loader2 size={16} className="animate-spin" /> : <FileDown size={16} />}
                  {isDownloadingBulkPdf ? "กำลังบันทึก..." : "ดาวน์โหลด"}
                </button>
                <button
                  type="button"
                  onClick={() => setShowBulkPdfPreview(false)}
                  className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-gray-500 transition hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-700"
                  title="ปิด"
                >
                  <X size={18} />
                </button>
              </div>
            </div>
            <div className="flex-1 overflow-hidden rounded-b-2xl bg-gray-100 dark:bg-gray-900">
              <PDFViewer width="100%" height="100%" className="h-full w-full border-none" showToolbar={true}>
                {buildBulkPdfDocument()}
              </PDFViewer>
            </div>
          </div>
        </div>
      )}
    </MainLayout>
  );
};

export default TeacherScheduleViewPage;
