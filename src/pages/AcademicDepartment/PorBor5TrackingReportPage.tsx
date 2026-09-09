import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useSelector, useDispatch } from 'react-redux';
import { RootState, AppDispatch } from '@/store';
import MainLayout from "@/layouts/MainLayout";
import { firestore as db, storage } from '@/firebase';
import {
  collection,
  query,
  where,
  getDocs,
  doc,
  getDoc,
  collectionGroup,
} from 'firebase/firestore';
import { ref, getDownloadURL } from 'firebase/storage';
import * as XLSX from 'xlsx';
import { saveAs } from 'file-saver';
import {
  ClipboardCheck,
  CheckCircle2,
  Clock,
  AlertCircle,
  FileSpreadsheet,
  Search,
  Filter,
  ExternalLink,
  FileDown,
  GraduationCap,
  Users,
  BookOpen,
  Award,
  Sparkles,
  RefreshCw,
  FileText,
  ChevronDown,
  ChevronUp,
  Layers,
  ArrowUpDown,
  FileWarning,
  X,
} from 'lucide-react';
import BackButton from "@/components/Shared/BackButton";
import AcademicYearSemesterFilter from "@/components/Shared/AcademicYearSemesterFilter";
import SkeletonLoader from '@/components/SkeletonLoader';
import { CLASSES, CLASS_FULL_NAMES } from '@/utils/schoolUtils';
import Swal from 'sweetalert2';
import { usePermissions } from '@/hooks/usePermissions';
import { fetchTeachersMap } from '@/store/slices/userMapSlice';
import { fetchCalendar } from '@/store/slices/calendarSlice';
import { getSubjectGroupName } from '@/utils/subjectGroupUtils';
import PorBor5IncompleteMemoPdfModal from '@/components/Pdf/PorBor5/PorBor5IncompleteMemoPdfModal';
import { matchesClassValue } from '@/utils/attendanceClassMatching';

// ─── Helpers ───
export const isPrimaryClassValue = (classValue: string | string[] | undefined): boolean => {
  if (Array.isArray(classValue)) {
    return classValue.some((c) => isPrimaryClassValue(c));
  }
  const value = String(classValue || '').trim().toLowerCase();
  const label = CLASSES[classValue as string] || classValue || '';
  return /^p[1-6]$/.test(value) || label.includes('ป.') || label.includes('ประถม');
};

export const isAllYearSemester = (sem?: string): boolean => {
  const s = String(sem || '').trim().toLowerCase();
  return !s || s === '0' || s === 'all' || s === 'full' || s === 'annual' || s === 'ตลอดปีการศึกษา';
};

export const normalizeSemester = (sem?: string): string => {
  const s = String(sem || '').trim().toLowerCase();
  if (isAllYearSemester(s)) return '';
  if (s === '1' || s === 'term1' || s === 'เทอม1') return '1';
  if (s === '2' || s === 'term2' || s === 'เทอม2') return '2';
  return s;
};

// ตรวจสอบว่าเป็นวิชากิจกรรมพัฒนาผู้เรียน หรือรหัส ก (เช่น ชุมนุม, โฮมรูม, แนะแนว, ลูกเสือ ฯลฯ) หรือไม่
export const isActivityOrNonAcademicCourse = (course?: {
  code?: string;
  courseCode?: string;
  title?: string;
  courseTitle?: string;
  name?: string;
  courseName?: string;
  subjectGroup?: string;
  learningArea?: string;
  type?: string;
} | null): boolean => {
  if (!course) return false;

  const code = String(course.code || course.courseCode || '').trim();
  const title = String(course.title || course.courseTitle || course.name || course.courseName || '').trim().toLowerCase();
  const sg = String(course.subjectGroup || course.learningArea || '').trim().toLowerCase();
  const type = String(course.type || '').trim().toLowerCase();

  // 1. รหัสวิชาขึ้นต้นด้วย 'ก' หรือ 'k' ตามด้วยตัวเลข (เช่น ก20903, ก11101, k20903) หรือรหัส ก ใดๆ
  if (/^[ก]/u.test(code) || /^[kK]\d/.test(code)) {
    return true;
  }

  // 2. กลุ่มสาระการเรียนรู้ที่เป็นกิจกรรมพัฒนาผู้เรียน (หรือรหัส 9 หรือกิจกรรม)
  if (
    sg.includes('กิจกรรมพัฒนาผู้เรียน') ||
    sg === '9' ||
    sg === 'กิจกรรม' ||
    sg.includes('กิจกรรม')
  ) {
    return true;
  }

  // 3. ประเภทวิชา (type) ที่ระบุว่าเป็นกิจกรรม หรือ ชุมนุม
  if (
    type === 'กิจกรรม' ||
    type.includes('กิจกรรม') ||
    type === 'ชุมนุม' ||
    type.includes('ชุมนุม') ||
    type === 'activity'
  ) {
    return true;
  }

  // 4. ชื่อวิชาหรือรหัสมีคำบ่งบอกกิจกรรม เช่น ชุมนุม, โฮมรูม, แนะแนว, ลูกเสือ, เนตรนารี, ยุวกาชาด, ผู้บำเพ็ญประโยชน์ ฯลฯ
  const activityKeywords = [
    'ชุมนุม',
    'โฮมรูม',
    'homeroom',
    'แนะแนว',
    'ลูกเสือ',
    'เนตรนารี',
    'ยุวกาชาด',
    'บำเพ็ญประโยชน์',
    'ผู้บำเพ็ญประโยชน์',
    'กิจกรรมพัฒนาผู้เรียน',
    'กิจกรรมเพื่อสังคม',
    'สาธารณประโยชน์',
    'ลดเวลาเรียน',
    'สวดมนต์',
    'หน้าเสาธง',
    'ประชุมสาย',
  ];

  if (activityKeywords.some((kw) => title.includes(kw) || code.toLowerCase().includes(kw))) {
    return true;
  }

  return false;
};

export const cleanDuplicateTitle = (name: string): string => {
  if (!name) return '';
  const titles = [
    'ว่าที่ร.ต.หญิง',
    'ว่าที่ ร.ต.หญิง',
    'ว่าที่ร.ต.',
    'ว่าที่ ร.ต.',
    'นางสาว',
    'น.ส.',
    'นาย',
    'นาง',
    'ดร.',
    'ครู',
  ];
  let cleaned = name.trim();
  for (const t of titles) {
    const escaped = t.replace(/\./g, '\\.');
    const doubleRegex = new RegExp(`^(${escaped})\\s*(${escaped})`, 'i');
    if (doubleRegex.test(cleaned)) {
      cleaned = cleaned.replace(doubleRegex, '$1');
    }
  }
  return cleaned;
};

export const formatTeacherName = (
  teacherProfile?: { title?: string; name?: string; firstName?: string; lastName?: string } | null,
  fallbackName?: string
): string => {
  if (!teacherProfile) return cleanDuplicateTitle(fallbackName || 'ไม่ระบุผู้สอน');

  const title = (teacherProfile.title || '').trim();
  const rawName = (teacherProfile.name || '').trim();
  const firstName = (teacherProfile.firstName || '').trim();
  const lastName = (teacherProfile.lastName || '').trim();

  let resolved = '';
  if (firstName || lastName) {
    const fullName = `${firstName} ${lastName}`.trim();
    if (title && !fullName.startsWith(title)) {
      resolved = `${title}${fullName}`;
    } else {
      resolved = fullName || title;
    }
  } else if (rawName) {
    if (title && !rawName.startsWith(title)) {
      resolved = `${title}${rawName}`;
    } else {
      resolved = rawName;
    }
  } else {
    resolved = fallbackName || 'ไม่ระบุผู้สอน';
  }

  return cleanDuplicateTitle(resolved);
};

// ─── Interfaces ───
export interface ActiveSectionRow {
  id: string; // unique key: `${courseId}_${groupNumber}`
  courseId: string;
  courseCode: string;
  courseTitle: string;
  courseType?: string;
  subjectGroup?: string;
  credits?: number | string;
  hoursPerWeek?: number;

  groupNumber: number;
  groupLabel: string;
  classLevel: string;
  classLabel: string;
  rooms: string[];
  roomLabel: string;

  sectionSemester?: string;
  isPrimary?: boolean;
  primaryRoom?: string;

  teacherId: string;
  teacherName: string;
  teacherPrefix?: string;
  teacherAvatar?: string;
  teacherDepartment?: string;

  enrolledCount: number;
  enrolledStudentIds: string[];

  // Completeness metrics
  gradesFilledCount: number;
  percentGrades: number;

  charFilledCount: number;
  percentChar: number;

  rwFilledCount: number;
  percentRW: number;

  attendanceSessionsCount: number;
  attendanceChecked: boolean;
  percentAttendance: number;

  overallPercentage: number;
  status: 'complete' | 'in_progress' | 'not_started';

  pdfUrl?: string | null;
  hasPdf: boolean;
}

const PorBor5TrackingReportPage: React.FC = () => {
  const navigate = useNavigate();
  const dispatch = useDispatch<AppDispatch>();
  const [searchParams, setSearchParams] = useSearchParams();

  const { user: currentUser } = usePermissions();
  const schoolId = (currentUser as any)?.schoolId;

  const { teachers: teacherMap } = useSelector((state: RootState) => state.userMap);
  const {
    currentAcademicYear: schoolYear,
    schoolName,
    logoUrl,
    directorName,
    directorPrefix,
    academicHeadName,
    academicHeadPrefix,
    affiliation,
  } = useSelector((state: RootState) => state.schoolSettings);
  const { academicYear: calYearRaw } = useSelector(
    (state: RootState) => state.calendar
  );

  // ปีการศึกษาอ้างอิงจากปฏิทินโรงเรียน (/academic/school-calendar)
  const defaultYear = calYearRaw || schoolYear || (new Date().getFullYear() + 543).toString();

  const initialYear = searchParams.get('academicYear') || searchParams.get('year') || defaultYear;
  // ถ้ามีค่า semester ใน URL ให้นำมาแปลงค่า ถ้าไม่มีให้เป็น '' (ตลอดปีการศึกษา)
  const rawSemParam = searchParams.get('semester');
  const initialSemester = rawSemParam !== null ? normalizeSemester(rawSemParam) : '';

  const [academicYear, setAcademicYear] = useState<string>(initialYear);
  const [semester, setSemester] = useState<string>(initialSemester);

  // Sync if URL query params change
  useEffect(() => {
    const urlYear = searchParams.get('academicYear') || searchParams.get('year');
    if (urlYear && urlYear !== academicYear) {
      setAcademicYear(urlYear);
    }
    const urlSem = searchParams.has('semester') ? searchParams.get('semester')! : '';
    const normUrlSem = normalizeSemester(urlSem);
    if (normUrlSem !== semester) {
      setSemester(normUrlSem);
    }
  }, [searchParams]);

  // Sync if redux loads late and no URL param was present
  useEffect(() => {
    if (!searchParams.get('academicYear') && !searchParams.get('year') && defaultYear && academicYear !== defaultYear) {
      setAcademicYear(defaultYear);
    }
  }, [defaultYear]);

  // Filters
  const [subjectGroupFilter, setSubjectGroupFilter] = useState<string>('ทั้งหมด');
  const [classLevelFilter, setClassLevelFilter] = useState<string>('ทั้งหมด');
  const [statusFilter, setStatusFilter] = useState<string>('ทั้งหมด');
  const [searchTerm, setSearchTerm] = useState<string>('');

  // Data State
  const [loading, setLoading] = useState<boolean>(true);
  const [sections, setSections] = useState<ActiveSectionRow[]>([]);
  const [isExportingExcel, setIsExportingExcel] = useState<boolean>(false);
  const [isPdfModalOpen, setIsPdfModalOpen] = useState<boolean>(false);
  const [pdfPreview, setPdfPreview] = useState<{ url: string; label: string } | null>(null);

  // Ensure calendar and teacher map loaded
  useEffect(() => {
    if (schoolId) {
      dispatch(fetchCalendar(schoolId));
      dispatch(fetchTeachersMap(schoolId));
    }
  }, [dispatch, schoolId]);

  // ─── Data Loading: Course Assignments + Enrollments ───
  // ─── Data Loading: Course Assignments + Enrollments ───
  const loadTrackingData = useCallback(async () => {
    if (!schoolId || !academicYear) {
      setSections([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      // 1. Fetch Courses
      const coursesSnap = await getDocs(collection(db, 'school-settings', schoolId, 'courses'));
      const coursesMap = new Map<string, any>();
      coursesSnap.docs.forEach((doc) => {
        coursesMap.set(doc.id, { id: doc.id, ...doc.data() });
      });

      // 2. Fetch Students for classroom fallback (when course-enrollment is not individually registered)
      const studentsSnap = await getDocs(collection(db, 'school-settings', schoolId, 'students'));
      const studentsByRoom = new Map<string, string[]>();
      studentsSnap.docs.forEach((doc) => {
        const sData = doc.data();
        const sId = doc.id;
        const cls = String(sData.classLevel || '').trim();
        const rm = String(sData.room || '').trim();
        if (cls && rm) {
          const keys = [
            `${cls}_${rm}`,
            `${cls.replace(/\s+/g, '')}_${rm}`,
            `${CLASSES[cls] || cls}_${rm}`,
          ];
          keys.forEach((k) => {
            if (!studentsByRoom.has(k)) studentsByRoom.set(k, []);
            studentsByRoom.get(k)!.push(sId);
          });
        }
      });

      // 3. Fetch Course Assignments for selected academic year
      // ดึงข้อมูลการมอบหมายทั้งหมดในปีการศึกษานั้น เพื่อรองรับทั้งการดูตลอดปีการศึกษา
      // และรองรับระดับประถมศึกษาที่เรียนต่อเนื่องทั้งปีการศึกษา (ไม่แยก 1, 2)
      const assignConstraints: any[] = [where('academicYear', '==', academicYear)];
      const assignQuery = query(
        collection(db, 'school-settings', schoolId, 'course_assignments'),
        ...assignConstraints
      );
      const assignSnap = await getDocs(assignQuery);

      // Map courseId -> GroupAssignment[]
      const assignmentsByCourse = new Map<string, { semester?: string; list: any[] }[]>();
      assignSnap.docs.forEach((doc) => {
        const data = doc.data();
        const courseId = data.courseId || doc.id;
        const list = Array.isArray(data.teacherAssignments) ? data.teacherAssignments : [];
        if (!assignmentsByCourse.has(courseId)) {
          assignmentsByCourse.set(courseId, []);
        }
        assignmentsByCourse.get(courseId)!.push({
          semester: data.semester,
          list,
        });
      });

      // 4. Fetch Course Enrollments for selected academic year
      const enrollConstraints: any[] = [where('academicYear', '==', academicYear)];
      const enrollQuery = query(
        collection(db, 'school-settings', schoolId, 'enrollments'),
        ...enrollConstraints
      );
      const enrollSnap = await getDocs(enrollQuery);

      // Map `${courseId}_${groupNumber}` or `${courseId}_${groupNumber}_${semester}` -> studentId[]
      const enrollmentsBySection = new Map<string, string[]>();
      enrollSnap.docs.forEach((doc) => {
        const data = doc.data();
        const cId = data.courseId;
        const gNum = Number(data.groupNumber) || 1;
        const sId = data.studentId;
        const sSem = data.semester;
        if (!cId || !sId) return;

        const key1 = `${cId}_${gNum}`;
        const key2 = `${cId}_${gNum}_${sSem}`;
        [key1, key2].forEach((k) => {
          if (!enrollmentsBySection.has(k)) {
            enrollmentsBySection.set(k, []);
          }
          enrollmentsBySection.get(k)!.push(sId);
        });
      });

      // 5. Build ACTIVE SECTIONS:
      const rawActiveSections: {
        id: string;
        course: any;
        assignment: any;
        groupNumber: number;
        enrolledStudentIds: string[];
        sectionSemester?: string;
        isPrimary: boolean;
      }[] = [];

      const isAllYear = isAllYearSemester(semester);

      assignmentsByCourse.forEach((recordList, courseId) => {
        const course = coursesMap.get(courseId);
        if (!course) return;

        // ไม่แสดงวิชาที่เป็นกิจกรรม หรือรหัส ก เช่น ชุมนุม, โฮมรูม, แนะแนว, ลูกเสือ ฯลฯ
        if (isActivityOrNonAcademicCourse(course)) return;

        recordList.forEach(({ semester: recSem, list }) => {
          list.forEach((asgn: any) => {
            if (isActivityOrNonAcademicCourse(asgn)) return;

            const groupNumber = Number(asgn.groupNumber) || 1;
            const sectionKey = recSem ? `${courseId}_${groupNumber}_${recSem}` : `${courseId}_${groupNumber}`;

            // มีครูผู้สอนที่ได้รับมอบหมายจริง
            const hasTeacher = !!(
              asgn.teacherId ||
              (Array.isArray(asgn.teacherIds) && asgn.teacherIds.length > 0)
            );

            if (!hasTeacher) return;

            // Class level
            let classLevel = '';
            if (Array.isArray(asgn.classLevels) && asgn.classLevels.length > 0) {
              classLevel = asgn.classLevels[0];
            } else if (asgn.classLevel) {
              classLevel = asgn.classLevel;
            } else if (Array.isArray(course.classId) && course.classId.length > 0) {
              classLevel = course.classId[0];
            } else if (typeof course.classId === 'string') {
              classLevel = course.classId;
            }

            const isPrimary = isPrimaryClassValue(classLevel) || isPrimaryClassValue(course.classId);

            // Semester inclusion logic:
            // 1. ถ้าเลือก "ตลอดปีการศึกษา" (isAllYear): แสดงทุกวิชา ทุกระดับชั้น ทั้งหมด
            // 2. ถ้าเป็นระดับประถมศึกษา (isPrimary): แสดงทุกเทอมเสมอ เพราะประถมเรียนทั้งปี ไม่แยก 1 2
            // 3. ถ้าเป็นวิชารายปี (annual หรือ 0): แสดงทุกเทอมเสมอ
            // 4. ถ้าเลือกภาคเรียนที่ 1 หรือ 2: แสดงวิชาที่ภาคเรียนตรงกัน หรือวิชาประถม/รายปี
            let matchesSemester = false;
            if (isAllYear) {
              matchesSemester = true;
            } else if (isPrimary) {
              matchesSemester = true; // ประถมเรียนทั้งปี ไม่แยก 1 2
            } else {
              const normRecSem = normalizeSemester(recSem);
              const normSelectedSem = normalizeSemester(semester);
              matchesSemester =
                !normRecSem ||
                normRecSem === 'annual' ||
                normRecSem === '0' ||
                normRecSem === normSelectedSem;
            }

            if (!matchesSemester) return;

            // Enrolled students
            let enrolledStudents =
              enrollmentsBySection.get(sectionKey) ||
              enrollmentsBySection.get(`${courseId}_${groupNumber}`) ||
              [];

            const primaryRoom = asgn.room ? String(asgn.room).trim() : '';

            if (enrolledStudents.length === 0 && classLevel) {
              const roomCandidates = [
                primaryRoom,
                String(groupNumber),
              ].filter(Boolean);

              const roomStudents: string[] = [];
              roomCandidates.forEach((rm) => {
                const keys = [
                  `${classLevel}_${rm}`,
                  `${classLevel.replace(/\s+/g, '')}_${rm}`,
                  `${CLASSES[classLevel] || classLevel}_${rm}`,
                  `ป.${classLevel.replace(/^p/i, '')}_${rm}`,
                  `ม.${classLevel.replace(/^m/i, '')}_${rm}`,
                ];
                for (const k of keys) {
                  const found = studentsByRoom.get(k);
                  if (found && found.length > 0) {
                    roomStudents.push(...found);
                    break;
                  }
                }
              });

              if (roomStudents.length > 0) {
                enrolledStudents = Array.from(new Set(roomStudents));
              }
            }

            rawActiveSections.push({
              id: `${sectionKey}_${primaryRoom || ''}`,
              course,
              assignment: asgn,
              groupNumber,
              enrolledStudentIds: enrolledStudents,
              sectionSemester: recSem,
              isPrimary,
            });
          });
        });
      });

      // 6. Fetch Grades for each unique course involved (batch chunks of 25)
      const uniqueCourseIds = Array.from(new Set(rawActiveSections.map((s) => s.course.id)));
      const gradesByCourse = new Map<string, Record<string, any>>();

      const CHUNK_SIZE = 25;
      for (let i = 0; i < uniqueCourseIds.length; i += CHUNK_SIZE) {
        const chunk = uniqueCourseIds.slice(i, i + CHUNK_SIZE);
        await Promise.allSettled(
          chunk.map(async (cId) => {
            try {
              const gradesSnap = await getDocs(
                collection(db, 'school-settings', schoolId, 'courses', cId, 'grades')
              );
              const courseGrades: Record<string, any> = {};
              gradesSnap.docs.forEach((gDoc) => {
                courseGrades[gDoc.id] = gDoc.data();
              });
              gradesByCourse.set(cId, courseGrades);
            } catch (e) {
              console.warn(`Could not load grades for course ${cId}:`, e);
            }
          })
        );
      }

      // 7. Check Classroom Attendance submission for each course
      // Maps normalized subject codes (e.g. "ว21101", courseId) to list of attendance records
      const attendanceRecordsBySubject = new Map<string, any[]>();
      try {
        const allSubjectCodes = Array.from(
          new Set(
            rawActiveSections.flatMap(({ course }) => [
              course.code ? String(course.code).trim() : '',
              course.code ? String(course.code).replace(/\s/g, '') : '',
              course.id ? String(course.id).trim() : '',
            ]).filter(Boolean)
          )
        ) as string[];

        const CHUNK_SIZE = 30;
        const codeChunks: string[][] = [];
        for (let i = 0; i < allSubjectCodes.length; i += CHUNK_SIZE) {
          codeChunks.push(allSubjectCodes.slice(i, i + CHUNK_SIZE));
        }

        const attRef = collectionGroup(db, 'ClassroomAttendance');
        const chunkPromises = codeChunks.map(async (chunk) => {
          // Attempt 1: Try with academicYear + schoolId + subjectCode (uses index CICAgJiUpoMJ)
          try {
            const qWithYear = query(
              attRef,
              where('academicYear', '==', String(academicYear)),
              where('schoolId', '==', schoolId),
              where('subjectCode', 'in', chunk)
            );
            const snap = await getDocs(qWithYear);
            if (!snap.empty) return snap.docs;
          } catch (e) {
            // Index or permission fallback
          }

          // Attempt 2: Try with schoolId + subjectCode (uses index CICAgNi47oMK)
          try {
            const qFallback = query(
              attRef,
              where('schoolId', '==', schoolId),
              where('subjectCode', 'in', chunk)
            );
            const snapFallback = await getDocs(qFallback);
            return snapFallback.docs;
          } catch (errFallback) {
            console.warn('Fallback attendance query error:', errFallback);
            return [];
          }
        });

        const allChunksDocs = await Promise.all(chunkPromises);
        allChunksDocs.flat().forEach((docSnap) => {
          const d = docSnap.data();
          const cleanSubj = String(d.subjectCode || d.courseId || '').replace(/\s/g, '');
          const rawSubj = String(d.subjectCode || d.courseId || '').trim();
          if (!cleanSubj && !rawSubj) return;

          const rec = {
            academicYear: String(d.academicYear || '').trim(),
            semester: String(d.semester || '').trim(),
            classId: String(d.classId || '').trim(),
            className: String(d.className || '').trim(),
            room: d.room ? String(d.room).trim() : '',
            roomIds: Array.isArray(d.roomIds) ? d.roomIds.map(String) : [],
            groupNumber: d.groupNumber !== undefined && d.groupNumber !== null ? Number(d.groupNumber) : null,
            date: d.date,
          };

          const keysToAdd = Array.from(new Set([cleanSubj, rawSubj, d.courseId].filter(Boolean)));
          keysToAdd.forEach((k) => {
            const existing = attendanceRecordsBySubject.get(k) || [];
            existing.push(rec);
            attendanceRecordsBySubject.set(k, existing);
          });
        });
      } catch (attErr) {
        console.warn('Could not query bulk ClassroomAttendance:', attErr);
      }

      // 8. Evaluate Rows and check PDF status
      const evaluatedRows: ActiveSectionRow[] = await Promise.all(
        rawActiveSections.map(async ({ id, course, assignment, groupNumber, enrolledStudentIds, sectionSemester, isPrimary }) => {
          const teacherId =
            assignment.teacherId ||
            (assignment.teacherIds && assignment.teacherIds[0]) ||
            '';
          const teacherProfile = teacherId ? teacherMap[teacherId] : null;
          const teacherName = formatTeacherName(teacherProfile, assignment.teacherName);

          // Class level and rooms
          let classLevel = '';
          if (Array.isArray(assignment.classLevels) && assignment.classLevels.length > 0) {
            classLevel = assignment.classLevels[0];
          } else if (assignment.classLevel) {
            classLevel = assignment.classLevel;
          } else if (Array.isArray(course.classId) && course.classId.length > 0) {
            classLevel = course.classId[0];
          } else if (typeof course.classId === 'string') {
            classLevel = course.classId;
          }

          const primaryRoom = assignment.room ? String(assignment.room).trim() : '';
          const rooms: string[] = primaryRoom
            ? [primaryRoom]
            : Array.isArray(assignment.roomIds) && assignment.roomIds.length > 0
            ? assignment.roomIds
            : [];

          const classLabel = CLASSES[classLevel] || classLevel || 'ทุกระดับชั้น';
          const roomLabel = primaryRoom ? `ห้อง ${primaryRoom}` : rooms.length > 0 ? `ห้อง ${rooms.join(', ')}` : '';
          const groupLabel = `กลุ่ม ${groupNumber}`;

          const courseGrades = gradesByCourse.get(course.id) || {};
          const totalEnrolled = enrolledStudentIds.length;

          // Metrics calculation
          let gradesFilled = 0;
          let charFilled = 0;
          let rwFilled = 0;

          enrolledStudentIds.forEach((sId) => {
            const record = courseGrades[sId];
            if (record) {
              // Check grades
              const hasTotal = typeof record.total === 'number' && !isNaN(record.total);
              const hasGrade = record.grade !== undefined && record.grade !== '';
              const hasFormative = record.formative !== undefined || record.midterm !== undefined;
              if (hasTotal || hasGrade || hasFormative) {
                gradesFilled++;
              }

              // Check characteristics
              if (
                record.characteristicsScores &&
                Object.keys(record.characteristicsScores).length > 0
              ) {
                charFilled++;
              }

              // Check reading & writing
              if (
                record.readingWritingScores &&
                Object.keys(record.readingWritingScores).length > 0
              ) {
                rwFilled++;
              }
            }
          });

          const percentGrades = totalEnrolled > 0 ? Math.round((gradesFilled / totalEnrolled) * 100) : 0;
          const percentChar = totalEnrolled > 0 ? Math.round((charFilled / totalEnrolled) * 100) : 0;
          const percentRW = totalEnrolled > 0 ? Math.round((rwFilled / totalEnrolled) * 100) : 0;

          // Attendance check from ClassroomAttendance
          const cleanCode = String(course.code || '').replace(/\s/g, '');
          const rawCode = String(course.code || '').trim();
          const candidateRecords = [
            ...(cleanCode ? (attendanceRecordsBySubject.get(cleanCode) || []) : []),
            ...(rawCode && rawCode !== cleanCode ? (attendanceRecordsBySubject.get(rawCode) || []) : []),
            ...(course.id ? (attendanceRecordsBySubject.get(course.id) || []) : []),
          ];

          // Match records to this specific section (grade, room, semester, year)
          const matchingAttendance = candidateRecords.filter((rec) => {
            // 1. Year check (if record has academicYear specified)
            if (rec.academicYear && rec.academicYear !== String(academicYear)) {
              return false;
            }

            // 2. Semester check
            if (!isAllYearSemester(semester) && !isPrimary) {
              const targetSem = normalizeSemester(sectionSemester) || normalizeSemester(semester);
              const recSem = normalizeSemester(rec.semester);
              if (recSem && targetSem && recSem !== targetSem && rec.semester !== 'annual') {
                return false;
              }
            }

            // 3. Class level check
            if (classLevel && rec.classId) {
              const classMatches =
                matchesClassValue(rec.classId, classLevel) ||
                matchesClassValue(rec.className, classLevel);
              if (!classMatches) return false;
            }

            // 4. Room / Group check
            if (primaryRoom && rec.room) {
              const roomMatches =
                rec.room === primaryRoom ||
                rec.roomIds.includes(primaryRoom) ||
                (rec.groupNumber !== null && rec.groupNumber === groupNumber);
              if (!roomMatches) return false;
            }

            return true;
          });

          // Distinct check sessions/dates
          const distinctDates = new Set<string>();
          matchingAttendance.forEach((rec) => {
            if (rec.date?.toDate) {
              const d = rec.date.toDate();
              distinctDates.add(`${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`);
            } else {
              distinctDates.add(String(rec.date || 'has_record'));
            }
          });

          const attCount = distinctDates.size;
          const attendanceChecked = attCount > 0;
          const percentAttendance = attendanceChecked ? 100 : 0;

          // Check if PDF exists in Storage only if grades are filled
          let hasPdf = false;
          let pdfUrl: string | null = null;
          if (gradesFilled > 0) {
            const roomSlug = primaryRoom ? `_${primaryRoom}` : '';
            const candidateSemPaths = isPrimary
              ? ['semester_annual', 'semester_1', 'semester_2']
              : [
                  `semester_${normalizeSemester(sectionSemester) || normalizeSemester(semester) || '1'}`,
                  'semester_annual',
                  'semester_1',
                  'semester_2',
                ];

            for (const semPath of Array.from(new Set(candidateSemPaths))) {
              const filePath = `school-settings/${schoolId}/grading/courses/${course.id}/year_${academicYear}/${semPath}/ปพ5_${course.id}_${classLevel}${roomSlug}.pdf`;
              try {
                pdfUrl = await getDownloadURL(ref(storage, filePath));
                if (pdfUrl) {
                  hasPdf = true;
                  break;
                }
              } catch {
                // Continue searching
              }
            }
          }

          // Overall Percentage
          // คะแนน (40%), คุณลักษณะฯ (20%), อ่านคิดเขียน (20%), เวลาเรียน (20%)
          const weightedScore =
            percentGrades * 0.4 +
            percentChar * 0.2 +
            percentRW * 0.2 +
            percentAttendance * 0.2;
          const overallPercentage = Math.round(weightedScore);

          let status: 'complete' | 'in_progress' | 'not_started' = 'not_started';
          if (overallPercentage === 100 || hasPdf) {
            status = 'complete';
          } else if (overallPercentage > 0) {
            status = 'in_progress';
          } else {
            status = 'not_started';
          }

          return {
            id,
            courseId: course.id,
            courseCode: course.code || '-',
            courseTitle: course.title || 'ไม่ระบุชื่อวิชา',
            courseType: course.type || 'พื้นฐาน',
            subjectGroup: course.subjectGroup || 'ทั่วไป',
            credits: course.credits || '-',
            hoursPerWeek: course.hoursPerWeek,

            groupNumber,
            groupLabel,
            classLevel,
            classLabel,
            rooms,
            roomLabel,
            primaryRoom,

            sectionSemester,
            isPrimary,

            teacherId,
            teacherName,
            teacherPrefix: teacherProfile?.title || '',
            teacherAvatar: teacherProfile?.profileImageUrl,
            teacherDepartment: teacherProfile?.subjectGroup || course.subjectGroup,

            enrolledCount: totalEnrolled,
            enrolledStudentIds,

            gradesFilledCount: gradesFilled,
            percentGrades,

            charFilledCount: charFilled,
            percentChar,

            rwFilledCount: rwFilled,
            percentRW,

            attendanceSessionsCount: attCount,
            attendanceChecked,
            percentAttendance,

            overallPercentage,
            status,

            pdfUrl,
            hasPdf,
          };
        })
      );

      // Sort by classLevel -> courseCode -> groupNumber
      evaluatedRows.sort((a, b) => {
        if (a.classLevel !== b.classLevel) return a.classLevel.localeCompare(b.classLevel);
        if (a.courseCode !== b.courseCode) return a.courseCode.localeCompare(b.courseCode);
        return a.groupNumber - b.groupNumber;
      });

      setSections(evaluatedRows);
    } catch (err) {
      console.error('Error loading PorBor5 tracking data:', err);
      Swal.fire({
        icon: 'error',
        title: 'เกิดข้อผิดพลาดในการโหลดข้อมูล',
        text: 'ไม่สามารถดึงข้อมูลทะเบียนวิชาและคะแนนได้ กรุณาลองใหม่อีกครั้ง',
        confirmButtonColor: '#4f46e5',
      });
    } finally {
      setLoading(false);
    }
  }, [schoolId, academicYear, semester, teacherMap]);

  useEffect(() => {
    loadTrackingData();
  }, [loadTrackingData]);

  // ─── Filtered Data ───
  const filteredSections = useMemo(() => {
    return sections.filter((s) => {
      // Filter subjectGroup
      if (subjectGroupFilter !== 'ทั้งหมด' && s.subjectGroup !== subjectGroupFilter) {
        return false;
      }

      // Filter classLevel
      if (classLevelFilter !== 'ทั้งหมด' && s.classLevel !== classLevelFilter) {
        return false;
      }

      // Filter status
      if (statusFilter === 'complete' && s.status !== 'complete') return false;
      if (statusFilter === 'in_progress' && s.status !== 'in_progress') return false;
      if (statusFilter === 'not_started' && s.status !== 'not_started') return false;

      // Filter search
      if (searchTerm.trim()) {
        const term = searchTerm.toLowerCase().trim();
        const matchCode = s.courseCode.toLowerCase().includes(term);
        const matchTitle = s.courseTitle.toLowerCase().includes(term);
        const matchTeacher = s.teacherName.toLowerCase().includes(term);
        const matchRoom = s.roomLabel.toLowerCase().includes(term);
        if (!matchCode && !matchTitle && !matchTeacher && !matchRoom) {
          return false;
        }
      }

      return true;
    });
  }, [sections, subjectGroupFilter, classLevelFilter, statusFilter, searchTerm]);

  // ─── KPI Stats ───
  const stats = useMemo(() => {
    const total = sections.length;
    const complete = sections.filter((s) => s.status === 'complete').length;
    const inProgress = sections.filter((s) => s.status === 'in_progress').length;
    const notStarted = sections.filter((s) => s.status === 'not_started').length;
    const totalStudents = sections.reduce((sum, s) => sum + s.enrolledCount, 0);

    const completePct = total > 0 ? Math.round((complete / total) * 100) : 0;
    const inProgressPct = total > 0 ? Math.round((inProgress / total) * 100) : 0;
    const notStartedPct = total > 0 ? Math.round((notStarted / total) * 100) : 0;

    return {
      total,
      complete,
      completePct,
      inProgress,
      inProgressPct,
      notStarted,
      notStartedPct,
      totalStudents,
    };
  }, [sections]);

  // ─── Unique Filter Options ───
  const subjectGroupOptions = useMemo(() => {
    const groups = Array.from(new Set(sections.map((s) => s.subjectGroup || 'ทั่วไป'))).filter(Boolean);
    return ['ทั้งหมด', ...groups];
  }, [sections]);

  const classLevelOptions = useMemo(() => {
    const classes = Array.from(new Set(sections.map((s) => s.classLevel))).filter(Boolean);
    return ['ทั้งหมด', ...classes];
  }, [sections]);

  // รายวิชาที่ยังไม่ดำเนินการ หรือกำลังดำเนินการ (ไม่ครบ 100%) สำหรับรายงานบันทึกข้อความราชการ
  const incompleteSections = useMemo(() => {
    return filteredSections
      .filter((s) => s.status !== 'complete')
      .map((s) => ({
        courseCode: s.courseCode,
        courseTitle: s.courseTitle,
        classLabel: s.classLabel,
        roomLabel: s.roomLabel,
        teacherName: s.teacherName,
        subjectGroup: s.subjectGroup || '-',
        overallPercentage: s.overallPercentage,
        status: s.status,
      }));
  }, [filteredSections]);

  const fullDirectorName = directorName
    ? cleanDuplicateTitle(
        directorName.startsWith(directorPrefix || '')
          ? directorName
          : `${directorPrefix || ''}${directorName}`.trim()
      )
    : '';
  const fullAcademicHeadName = academicHeadName
    ? cleanDuplicateTitle(
        academicHeadName.startsWith(academicHeadPrefix || '')
          ? academicHeadName
          : `${academicHeadPrefix || ''}${academicHeadName}`.trim()
      )
    : '';

  // ─── Export to Excel ───
  const handleExportExcel = () => {
    if (filteredSections.length === 0) {
      Swal.fire({
        icon: 'warning',
        title: 'ไม่มีข้อมูลสำหรับส่งออก',
        text: 'ไม่พบรายการรายวิชาตามเงื่อนไขที่เลือก',
        confirmButtonColor: '#4f46e5',
      });
      return;
    }

    setIsExportingExcel(true);
    try {
      const headerRows = [
        [`รายงานติดตามการจัดทำเอกสาร ปพ.5 (สมุดบันทึกผลการเรียนรู้รายวิชา)`],
        [`โรงเรียน: ${schoolName || '-'} | ปีการศึกษา ${academicYear} ภาคเรียนที่ ${semester}`],
        [`ข้อมูล ณ วันที่: ${new Date().toLocaleDateString('th-TH')} เวลา ${new Date().toLocaleTimeString('th-TH')}`],
        [
          `สรุปภาพรวม: ทั้งหมด ${stats.total} รายวิชา/กลุ่ม | เสร็จสมบูรณ์ ${stats.complete} (${stats.completePct}%) | กำลังดำเนินการ ${stats.inProgress} (${stats.inProgressPct}%) | ยังไม่เริ่มทำ ${stats.notStarted} (${stats.notStartedPct}%)`,
        ],
        [], // empty row
      ];

      const dataHeaders = [
        'ลำดับ',
        'กลุ่มสาระการเรียนรู้',
        'รหัสวิชา',
        'ชื่อรายวิชา',
        'ระดับชั้น',
        'ห้อง/กลุ่ม',
        'ครูผู้สอน',
        'จำนวนนักเรียน',
        'คะแนน (Grades)',
        'คุณลักษณะฯ (8 ข้อ)',
        'อ่านคิดเขียน (5 ข้อ)',
        'เวลาเรียน (Attendance)',
        'ความคืบหน้ารวม (%)',
        'สถานะ',
        'สถานะเล่ม ปพ.5 (PDF)',
      ];

      const dataRows = filteredSections.map((s, index) => {
        const statusLabel =
          s.status === 'complete'
            ? 'เสร็จสมบูรณ์ 100%'
            : s.status === 'in_progress'
            ? 'อยู่ระหว่างดำเนินการ'
            : 'ยังไม่เริ่มทำ (0%)';

        return [
          index + 1,
          getSubjectGroupName(s.subjectGroup),
          s.courseCode,
          s.courseTitle,
          s.classLabel,
          `${s.roomLabel} (${s.groupLabel})`.trim(),
          s.teacherName,
          s.enrolledCount,
          `${s.gradesFilledCount}/${s.enrolledCount} (${s.percentGrades}%)`,
          `${s.charFilledCount}/${s.enrolledCount} (${s.percentChar}%)`,
          `${s.rwFilledCount}/${s.enrolledCount} (${s.percentRW}%)`,
          s.attendanceChecked ? 'เช็คเวลาเรียนแล้ว' : 'ยังไม่เช็คเวลาเรียน',
          `${s.overallPercentage}%`,
          statusLabel,
          s.hasPdf ? 'ออกเล่ม PDF แล้ว' : 'ยังไม่ออกเล่ม',
        ];
      });

      const worksheet = XLSX.utils.aoa_to_sheet([...headerRows, dataHeaders, ...dataRows]);

      // Set column widths
      worksheet['!cols'] = [
        { wch: 6 }, // ลำดับ
        { wch: 18 }, // กลุ่มสาระ
        { wch: 12 }, // รหัสวิชา
        { wch: 28 }, // ชื่อวิชา
        { wch: 14 }, // ระดับชั้น
        { wch: 18 }, // ห้อง/กลุ่ม
        { wch: 24 }, // ครูผู้สอน
        { wch: 12 }, // จำนวน นร.
        { wch: 18 }, // คะแนน
        { wch: 18 }, // คุณลักษณะ
        { wch: 18 }, // อ่านคิดเขียน
        { wch: 22 }, // เวลาเรียน
        { wch: 18 }, // ความคืบหน้ารวม
        { wch: 22 }, // สถานะ
        { wch: 20 }, // เล่ม ปพ.5
      ];

      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, 'รายงานติดตาม ปพ.5');

      const excelBuffer = XLSX.write(workbook, { bookType: 'xlsx', type: 'array' });
      const fileData = new Blob([excelBuffer], {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet;charset=UTF-8',
      });
      saveAs(fileData, `รายงานติดตาม_ปพ5_ปี${academicYear}_เทอม${semester}.xlsx`);

      Swal.fire({
        icon: 'success',
        title: 'ส่งออกไฟล์ Excel สำเร็จ',
        toast: true,
        position: 'top-end',
        showConfirmButton: false,
        timer: 2000,
      });
    } catch (exportErr) {
      console.error('Export Excel failed:', exportErr);
      Swal.fire({
        icon: 'error',
        title: 'เกิดข้อผิดพลาด',
        text: 'ไม่สามารถส่งออกไฟล์ Excel ได้',
        confirmButtonColor: '#4f46e5',
      });
    } finally {
      setIsExportingExcel(false);
    }
  };

  return (
    <MainLayout>
      <div className="w-full max-w-full min-w-0 px-4 sm:px-6 lg:px-8 py-6 space-y-6 pb-16">
        {/* ─── Top Header ─── */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white dark:bg-[#1e1f21] p-5 rounded-2xl border border-gray-100 dark:border-white/5 shadow-sm">
          <div className="flex items-start gap-3">
            <BackButton />
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-xl font-bold text-gray-800 dark:text-white flex items-center gap-2">
                  <ClipboardCheck className="text-indigo-600 dark:text-indigo-400" size={24} />
                  รายงานติดตามการส่งเอกสาร ปพ.5
                </h1>
                <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-indigo-50 dark:bg-indigo-950/50 text-indigo-600 dark:text-indigo-400 border border-indigo-200/50 dark:border-indigo-800/50">
                  สำหรับผู้บริหารและงานวิชาการ
                </span>
              </div>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                สรุปภาพรวมและติดตามความคืบหน้าการจัดทำสมุด ปพ.5 เฉพาะรายวิชาที่มีการมอบหมายครูผู้สอนและลงทะเบียนนักเรียนแล้ว
              </p>
            </div>
          </div>

          {/* Action buttons */}
          <div className="flex items-center gap-2.5 self-end md:self-auto">
            <button
              onClick={() => loadTrackingData()}
              disabled={loading}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold rounded-xl border border-gray-200 dark:border-white/10 text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-white/5 transition-all shadow-sm"
              title="รีเฟรชข้อมูล"
            >
              <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
              รีเฟรช
            </button>
            <button
              onClick={handleExportExcel}
              disabled={loading || isExportingExcel || filteredSections.length === 0}
              className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white transition-all shadow-sm shadow-emerald-600/20 disabled:opacity-50"
            >
              <FileSpreadsheet size={15} />
              {isExportingExcel ? 'กำลังส่งออก...' : 'ส่งออก Excel'}
            </button>
            <button
              onClick={() => setIsPdfModalOpen(true)}
              disabled={loading || incompleteSections.length === 0}
              className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold rounded-xl bg-rose-600 hover:bg-rose-700 text-white transition-all shadow-sm shadow-rose-600/20 disabled:opacity-50"
              title="พิมพ์แบบบันทึกข้อความรายงานผู้ที่ยังไม่ทำ ปพ.5 ตามระเบียบงานสารบรรณ"
            >
              <FileText size={15} />
              <span>บันทึกข้อความ (PDF)</span>
              {incompleteSections.length > 0 && (
                <span className="px-1.5 py-0.5 text-[10px] bg-white/20 rounded-full font-bold">
                  {incompleteSections.length}
                </span>
              )}
            </button>
          </div>
        </div>

        {/* ─── Filter Bar ─── */}
        <div className="bg-white dark:bg-[#1e1f21] p-4 rounded-2xl border border-gray-100 dark:border-white/5 shadow-sm space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            {/* Year & Semester Filter (Sourced from /academic/school-calendar) */}
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold text-gray-500 dark:text-gray-400">ปฏิทินการศึกษา:</span>
              <AcademicYearSemesterFilter
                schoolId={schoolId || ''}
                academicYear={academicYear}
                onAcademicYearChange={(val) => {
                  setAcademicYear(val);
                  const next: Record<string, string> = {};
                  if (val) next.academicYear = val;
                  if (semester) next.semester = semester;
                  setSearchParams(next);
                }}
                semester={semester}
                onSemesterChange={(val) => {
                  const norm = normalizeSemester(val);
                  setSemester(norm);
                  const next: Record<string, string> = {};
                  if (academicYear) next.academicYear = academicYear;
                  if (norm) next.semester = norm;
                  setSearchParams(next);
                }}
              />
            </div>

            {/* Search Box */}
            <div className="relative flex-1 min-w-[240px] max-w-md">
              <Search size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                type="text"
                placeholder="ค้นหาชื่อครู, รหัสวิชา, ชื่อวิชา..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-9 pr-3.5 py-2 text-xs rounded-xl border border-gray-200 dark:border-white/10 bg-gray-50 dark:bg-black/20 text-gray-800 dark:text-gray-200 outline-none focus:ring-2 focus:ring-indigo-500 transition-all"
              />
              {searchTerm && (
                <button
                  onClick={() => setSearchTerm('')}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 text-xs"
                >
                  ✕
                </button>
              )}
            </div>
          </div>

          {/* Secondary Filters */}
          <div className="flex flex-wrap items-center gap-3 pt-2 border-t border-gray-100 dark:border-white/5 text-xs">
            {/* Subject Group */}
            <div className="flex items-center gap-1.5">
              <span className="text-gray-500 font-medium">กลุ่มสาระฯ:</span>
              <select
                value={subjectGroupFilter}
                onChange={(e) => setSubjectGroupFilter(e.target.value)}
                className="px-2.5 py-1.5 rounded-lg border border-gray-200 dark:border-white/10 bg-white dark:bg-[#25272a] text-gray-800 dark:text-gray-200 outline-none focus:ring-2 focus:ring-indigo-500 font-medium"
              >
                {subjectGroupOptions.map((g) => (
                  <option key={g} value={g}>
                    {getSubjectGroupName(g)}
                  </option>
                ))}
              </select>
            </div>

            {/* Class Level */}
            <div className="flex items-center gap-1.5">
              <span className="text-gray-500 font-medium">ระดับชั้น:</span>
              <select
                value={classLevelFilter}
                onChange={(e) => setClassLevelFilter(e.target.value)}
                className="px-2.5 py-1.5 rounded-lg border border-gray-200 dark:border-white/10 bg-white dark:bg-[#25272a] text-gray-800 dark:text-gray-200 outline-none focus:ring-2 focus:ring-indigo-500 font-medium"
              >
                {classLevelOptions.map((c) => (
                  <option key={c} value={c}>
                    {c === 'ทั้งหมด' ? 'ทั้งหมด' : CLASSES[c] || c}
                  </option>
                ))}
              </select>
            </div>

            {/* Status */}
            <div className="flex items-center gap-1.5">
              <span className="text-gray-500 font-medium">สถานะ:</span>
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="px-2.5 py-1.5 rounded-lg border border-gray-200 dark:border-white/10 bg-white dark:bg-[#25272a] text-gray-800 dark:text-gray-200 outline-none focus:ring-2 focus:ring-indigo-500 font-medium"
              >
                <option value="ทั้งหมด">ทั้งหมด ({stats.total})</option>
                <option value="complete">เสร็จสมบูรณ์ 100% ({stats.complete})</option>
                <option value="in_progress">อยู่ระหว่างดำเนินการ ({stats.inProgress})</option>
                <option value="not_started">ยังไม่เริ่มทำ 0% ({stats.notStarted})</option>
              </select>
            </div>

            {/* Reset Filters */}
            {(subjectGroupFilter !== 'ทั้งหมด' || classLevelFilter !== 'ทั้งหมด' || statusFilter !== 'ทั้งหมด' || searchTerm) && (
              <button
                onClick={() => {
                  setSubjectGroupFilter('ทั้งหมด');
                  setClassLevelFilter('ทั้งหมด');
                  setStatusFilter('ทั้งหมด');
                  setSearchTerm('');
                }}
                className="text-xs text-indigo-600 dark:text-indigo-400 hover:underline font-semibold ml-auto"
              >
                ล้างตัวกรองทั้งหมด
              </button>
            )}
          </div>
        </div>

        {/* ─── Executive KPI Cards ─── */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {/* Card 1: Total Sections */}
          <div className="bg-white dark:bg-[#1e1f21] p-5 rounded-2xl border border-gray-100 dark:border-white/5 shadow-sm relative overflow-hidden">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-semibold text-gray-500 dark:text-gray-400">วิชาที่เปิดสอนจริง</p>
                <h3 className="text-2xl font-black text-gray-800 dark:text-white mt-1">
                  {stats.total} <span className="text-xs font-normal text-gray-400">กลุ่ม</span>
                </h3>
              </div>
              <div className="w-12 h-12 rounded-xl bg-indigo-50 dark:bg-indigo-950/40 text-indigo-600 dark:text-indigo-400 flex items-center justify-center">
                <BookOpen size={24} />
              </div>
            </div>
            <div className="mt-3 flex items-center gap-1.5 text-xs text-gray-500 dark:text-gray-400">
              <Users size={13} className="text-indigo-500" />
              <span>นักเรียนลงทะเบียนรวม: <b>{stats.totalStudents}</b> คน</span>
            </div>
          </div>

          {/* Card 2: Completed */}
          <div className="bg-white dark:bg-[#1e1f21] p-5 rounded-2xl border border-emerald-100 dark:border-emerald-950/30 shadow-sm relative overflow-hidden">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-semibold text-emerald-600 dark:text-emerald-400">เสร็จสมบูรณ์ (100%)</p>
                <h3 className="text-2xl font-black text-emerald-700 dark:text-emerald-400 mt-1">
                  {stats.complete} <span className="text-xs font-normal text-emerald-600/70">กลุ่ม</span>
                </h3>
              </div>
              <div className="w-12 h-12 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400 flex items-center justify-center">
                <CheckCircle2 size={24} />
              </div>
            </div>
            <div className="mt-3">
              <div className="flex justify-between text-xs mb-1">
                <span className="text-gray-400">คิดเป็น</span>
                <span className="font-bold text-emerald-600 dark:text-emerald-400">{stats.completePct}%</span>
              </div>
              <div className="w-full h-1.5 bg-gray-100 dark:bg-white/10 rounded-full overflow-hidden">
                <div className="h-full bg-emerald-500 rounded-full" style={{ width: `${stats.completePct}%` }} />
              </div>
            </div>
          </div>

          {/* Card 3: In Progress */}
          <div className="bg-white dark:bg-[#1e1f21] p-5 rounded-2xl border border-amber-100 dark:border-amber-950/30 shadow-sm relative overflow-hidden">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-semibold text-amber-600 dark:text-amber-400">อยู่ระหว่างทำ (ไม่ครบ)</p>
                <h3 className="text-2xl font-black text-amber-700 dark:text-amber-400 mt-1">
                  {stats.inProgress} <span className="text-xs font-normal text-amber-600/70">กลุ่ม</span>
                </h3>
              </div>
              <div className="w-12 h-12 rounded-xl bg-amber-50 dark:bg-amber-950/40 text-amber-600 dark:text-amber-400 flex items-center justify-center">
                <Clock size={24} />
              </div>
            </div>
            <div className="mt-3">
              <div className="flex justify-between text-xs mb-1">
                <span className="text-gray-400">คิดเป็น</span>
                <span className="font-bold text-amber-600 dark:text-amber-400">{stats.inProgressPct}%</span>
              </div>
              <div className="w-full h-1.5 bg-gray-100 dark:bg-white/10 rounded-full overflow-hidden">
                <div className="h-full bg-amber-500 rounded-full" style={{ width: `${stats.inProgressPct}%` }} />
              </div>
            </div>
          </div>

          {/* Card 4: Not Started */}
          <div className="bg-white dark:bg-[#1e1f21] p-5 rounded-2xl border border-rose-100 dark:border-rose-950/30 shadow-sm relative overflow-hidden">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-semibold text-rose-600 dark:text-rose-400">ยังไม่เริ่มทำ (0%)</p>
                <h3 className="text-2xl font-black text-rose-700 dark:text-rose-400 mt-1">
                  {stats.notStarted} <span className="text-xs font-normal text-rose-600/70">กลุ่ม</span>
                </h3>
              </div>
              <div className="w-12 h-12 rounded-xl bg-rose-50 dark:bg-rose-950/40 text-rose-600 dark:text-rose-400 flex items-center justify-center">
                <AlertCircle size={24} />
              </div>
            </div>
            <div className="mt-3">
              <div className="flex justify-between text-xs mb-1">
                <span className="text-gray-400">คิดเป็น</span>
                <span className="font-bold text-rose-600 dark:text-rose-400">{stats.notStartedPct}%</span>
              </div>
              <div className="w-full h-1.5 bg-gray-100 dark:bg-white/10 rounded-full overflow-hidden">
                <div className="h-full bg-rose-500 rounded-full" style={{ width: `${stats.notStartedPct}%` }} />
              </div>
            </div>
          </div>
        </div>

        {/* ─── Main Content Table ─── */}
        <div className="w-full min-w-0 bg-white dark:bg-[#1e1f21] rounded-2xl border border-gray-100 dark:border-white/5 shadow-sm overflow-hidden">
          <div className="p-4 border-b border-gray-100 dark:border-white/5 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <h2 className="text-sm font-bold text-gray-800 dark:text-white flex items-center gap-2">
                <Layers size={18} className="text-indigo-600 dark:text-indigo-400" />
                รายการรายวิชาและสถานะการจัดทำ ปพ.5
              </h2>
              <span className="text-xs font-semibold text-gray-400">
                (แสดง {filteredSections.length} จากทั้งหมด {sections.length} รายการ)
              </span>
            </div>
          </div>

          {loading ? (
            <div className="p-8">
              <SkeletonLoader />
            </div>
          ) : filteredSections.length === 0 ? (
            <div className="py-16 text-center text-gray-400">
              <BookOpen size={40} className="mx-auto mb-3 opacity-30" />
              <p className="text-sm font-semibold text-gray-600 dark:text-gray-300">ไม่พบรายวิชาที่ตรงตามเงื่อนไข</p>
              <p className="text-xs text-gray-400 mt-1">
                เฉพาะรายวิชาที่ถูกมอบหมายครู (course-assignment) และมีนักเรียนลงทะเบียน (course-enrollment) ในปี/ภาคเรียนนี้เท่านั้นที่จะแสดง
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto w-full">
              <table className="w-full text-left text-xs min-w-[1100px]">
                <thead>
                  <tr className="bg-gray-50/80 dark:bg-white/[0.02] text-gray-500 dark:text-gray-400 font-semibold border-b border-gray-100 dark:border-white/5">
                    <th className="py-3 px-3 text-center w-10 min-w-[36px]">#</th>
                    <th className="py-3 px-3 min-w-[170px]">ครูผู้สอน</th>
                    <th className="py-3 px-3 min-w-[180px]">รหัส - ชื่อวิชา</th>
                    <th className="py-3 px-3 min-w-[125px]">ชั้น / ห้อง / กลุ่ม</th>
                    <th className="py-3 px-2 text-center min-w-[50px]">นร.</th>
                    <th className="py-3 px-2 text-center min-w-[100px]" title="คะแนนเก็บ / กลางภาค / ปลายภาค">
                      คะแนน (Grades)
                    </th>
                    <th className="py-3 px-2 text-center min-w-[85px]" title="คุณลักษณะอันพึงประสงค์ 8 ข้อ">
                      คุณลักษณะฯ
                    </th>
                    <th className="py-3 px-2 text-center min-w-[85px]" title="การอ่าน คิดวิเคราะห์ และเขียน 5 ข้อ">
                      อ่าน คิด เขียน
                    </th>
                    <th className="py-3 px-2 text-center min-w-[105px]" title="การเช็คเวลาเรียนตามตารางสอน">
                      เวลาเรียน
                    </th>
                    <th className="py-3 px-3 text-center min-w-[120px]">ความคืบหน้ารวม</th>
                    <th className="py-3 px-2 text-center min-w-[85px]">เล่ม ปพ.5</th>
                    <th className="py-3 px-2 text-center min-w-[85px]">การจัดการ</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 dark:divide-white/5">
                  {filteredSections.map((row, index) => {
                    const isComplete = row.status === 'complete';
                    const isInProgress = row.status === 'in_progress';

                    return (
                      <tr
                        key={row.id}
                        className="hover:bg-gray-50/60 dark:hover:bg-white/[0.02] transition-colors"
                      >
                        {/* Index */}
                        <td className="py-3 px-3 text-center text-gray-400 font-medium">{index + 1}</td>

                        {/* Teacher */}
                        <td className="py-3 px-3">
                          <div className="flex items-center gap-2.5">
                            {row.teacherAvatar ? (
                              <img
                                src={row.teacherAvatar}
                                alt={row.teacherName}
                                className="w-8 h-8 rounded-full object-cover border border-gray-200 dark:border-white/10 shrink-0"
                              />
                            ) : (
                              <div className="w-8 h-8 rounded-full bg-indigo-100 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400 flex items-center justify-center font-bold text-xs shrink-0">
                                {row.teacherName.slice(0, 1)}
                              </div>
                            )}
                            <div className="min-w-0">
                              <p className="font-semibold text-gray-800 dark:text-white leading-tight">
                                {row.teacherName}
                              </p>
                              <span className="text-[11px] text-gray-400 block mt-0.5 truncate">
                                {getSubjectGroupName(row.teacherDepartment || row.subjectGroup)}
                              </span>
                            </div>
                          </div>
                        </td>

                        {/* Course */}
                        <td className="py-3 px-3">
                          <div className="flex items-baseline gap-1.5 flex-wrap">
                            <span className="font-bold text-indigo-600 dark:text-indigo-400">
                              {row.courseCode}
                            </span>
                            <span className="font-semibold text-gray-800 dark:text-gray-200">
                              {row.courseTitle}
                            </span>
                          </div>
                          <div className="flex items-center gap-2 text-[11px] text-gray-400 mt-0.5">
                            <span>{row.courseType}</span>
                            <span>•</span>
                            <span>{row.credits} นก.</span>
                          </div>
                        </td>

                        {/* Class / Room / Group */}
                        <td className="py-3 px-3">
                          <span className="font-semibold text-gray-800 dark:text-gray-200 block">
                            {row.classLabel} {row.roomLabel}
                          </span>
                          <div className="flex items-center gap-1 flex-wrap mt-0.5">
                            <span className="text-[11px] px-2 py-0.5 rounded-md bg-gray-100 dark:bg-white/5 text-gray-600 dark:text-gray-400 inline-block">
                              {row.groupLabel}
                            </span>
                            <span className="text-[10px] px-1.5 py-0.5 rounded-md bg-indigo-50 dark:bg-indigo-950/40 text-indigo-600 dark:text-indigo-400 font-medium">
                              {row.isPrimary ? 'ตลอดปี (ประถม)' : row.sectionSemester ? `ภาคเรียนที่ ${row.sectionSemester}` : 'ตลอดปี'}
                            </span>
                          </div>
                        </td>

                        {/* Enrolled Students Count */}
                        <td className="py-3 px-2 text-center">
                          <span className="font-bold text-gray-800 dark:text-white">
                            {row.enrolledCount}
                          </span>
                        </td>

                        {/* Metric 1: Grades */}
                        <td className="py-3 px-2 text-center">
                          <span
                            className={`px-2 py-1 rounded-lg font-bold text-[11px] inline-block whitespace-nowrap ${
                              row.percentGrades === 100
                                ? 'bg-emerald-50 text-emerald-600 dark:bg-emerald-950/40 dark:text-emerald-400'
                                : row.percentGrades > 0
                                ? 'bg-amber-50 text-amber-600 dark:bg-amber-950/40 dark:text-amber-400'
                                : 'bg-gray-100 text-gray-400 dark:bg-white/5 dark:text-gray-500'
                            }`}
                          >
                            {row.gradesFilledCount}/{row.enrolledCount} ({row.percentGrades}%)
                          </span>
                        </td>

                        {/* Metric 2: Characteristics */}
                        <td className="py-3 px-2 text-center">
                          <span
                            className={`px-2 py-1 rounded-lg font-bold text-[11px] inline-block whitespace-nowrap ${
                              row.percentChar === 100
                                ? 'bg-emerald-50 text-emerald-600 dark:bg-emerald-950/40 dark:text-emerald-400'
                                : row.percentChar > 0
                                ? 'bg-amber-50 text-amber-600 dark:bg-amber-950/40 dark:text-amber-400'
                                : 'bg-gray-100 text-gray-400 dark:bg-white/5 dark:text-gray-500'
                            }`}
                          >
                            {row.percentChar === 100 ? 'ครบ 100%' : `${row.charFilledCount}/${row.enrolledCount}`}
                          </span>
                        </td>

                        {/* Metric 3: Reading & Writing */}
                        <td className="py-3 px-2 text-center">
                          <span
                            className={`px-2 py-1 rounded-lg font-bold text-[11px] inline-block whitespace-nowrap ${
                              row.percentRW === 100
                                ? 'bg-emerald-50 text-emerald-600 dark:bg-emerald-950/40 dark:text-emerald-400'
                                : row.percentRW > 0
                                ? 'bg-amber-50 text-amber-600 dark:bg-amber-950/40 dark:text-amber-400'
                                : 'bg-gray-100 text-gray-400 dark:bg-white/5 dark:text-gray-500'
                            }`}
                          >
                            {row.percentRW === 100 ? 'ครบ 100%' : `${row.rwFilledCount}/${row.enrolledCount}`}
                          </span>
                        </td>

                        {/* Metric 4: Attendance (เชื่อมโยง classroom-attendance) */}
                        <td className="py-3 px-2 text-center">
                          <button
                            type="button"
                            onClick={() => {
                              const targetSem = normalizeSemester(row.sectionSemester) || normalizeSemester(semester) || '1';
                              const roomNum = row.primaryRoom || (row.roomLabel ? row.roomLabel.replace(/[^0-9]/g, '') : '1');
                              navigate(`/academic/classroom-attendance-history?classId=${row.classLevel}&room=${roomNum}&courseId=${row.courseId}&academicYear=${academicYear}&semester=${targetSem}`);
                            }}
                            title="คลิกเพื่อเปิดดูประวัติการเช็คชื่อรายวิชา (Classroom Attendance)"
                            className={`px-2 py-1 rounded-lg font-bold text-[11px] inline-flex items-center gap-1 transition-all hover:scale-105 active:scale-95 shadow-sm cursor-pointer whitespace-nowrap ${
                              row.attendanceChecked
                                ? 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100 border border-emerald-200/70 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-800/40'
                                : 'bg-rose-50 text-rose-700 hover:bg-rose-100 border border-rose-200/70 dark:bg-rose-950/40 dark:text-rose-300 dark:border-rose-800/40'
                            }`}
                          >
                            {row.attendanceChecked ? (
                              <>
                                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400 shrink-0" />
                                <span>เช็คแล้ว{row.attendanceSessionsCount > 0 ? ` (${row.attendanceSessionsCount} วัน)` : ''}</span>
                              </>
                            ) : (
                              <>
                                <Clock className="w-3.5 h-3.5 text-rose-500 dark:text-rose-400 shrink-0" />
                                <span>ยังไม่เช็ค</span>
                              </>
                            )}
                          </button>
                        </td>

                        {/* Overall Progress */}
                        <td className="py-3 px-3">
                          <div className="space-y-1">
                            <div className="flex justify-between items-center text-[11px]">
                              <span
                                className={`font-bold ${
                                  isComplete
                                    ? 'text-emerald-600 dark:text-emerald-400'
                                    : isInProgress
                                    ? 'text-amber-600 dark:text-amber-400'
                                    : 'text-gray-400'
                                }`}
                              >
                                {row.overallPercentage}%
                              </span>
                              <span className="text-gray-400 text-[10px]">
                                {isComplete ? 'เสร็จสมบูรณ์' : isInProgress ? 'กำลังทำ' : 'ยังไม่เริ่ม'}
                              </span>
                            </div>
                            <div className="w-full h-1.5 bg-gray-100 dark:bg-white/10 rounded-full overflow-hidden">
                              <div
                                className={`h-full rounded-full transition-all ${
                                  isComplete ? 'bg-emerald-500' : isInProgress ? 'bg-amber-500' : 'bg-gray-300'
                                }`}
                                style={{ width: `${row.overallPercentage}%` }}
                              />
                            </div>
                          </div>
                        </td>

                        {/* PDF status */}
                        <td className="py-3 px-2 text-center">
                          {row.hasPdf && row.pdfUrl ? (
                            <button
                              type="button"
                              onClick={() =>
                                setPdfPreview({
                                  url: row.pdfUrl as string,
                                  label: `ปพ.5 — ${row.classLabel || ''}${row.rooms[0] ? '/' + row.rooms[0] : ''} ${row.courseTitle || ''}`.trim(),
                                })
                              }
                              className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-emerald-50 hover:bg-emerald-100 text-emerald-700 dark:bg-emerald-950/50 dark:hover:bg-emerald-900/50 dark:text-emerald-300 font-semibold text-[11px] transition-all whitespace-nowrap"
                              title="ดูไฟล์ ปพ.5 PDF"
                            >
                              <FileText size={13} />
                              ดู ปพ.5
                            </button>
                          ) : (
                            <span className="text-[11px] text-gray-400 whitespace-nowrap">ยังไม่ออกเล่ม</span>
                          )}
                        </td>

                        {/* Quick Navigation to GradeBook */}
                        <td className="py-3 px-2 text-center">
                          <button
                            onClick={() => {
                              const p = new URLSearchParams();
                              if (row.classLevel) p.set('classId', row.classLevel);
                              if (row.rooms[0]) p.set('room', row.rooms[0]);
                              if (semester) p.set('semester', semester);
                              if (row.courseId) p.set('courseId', row.courseId);
                              navigate(`/academic/grade-book?${p.toString()}`);
                            }}
                            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border border-gray-200 dark:border-white/10 hover:bg-indigo-50 dark:hover:bg-indigo-950/30 text-indigo-600 dark:text-indigo-400 font-semibold text-[11px] transition-all whitespace-nowrap"
                            title="เปิดสมุดคะแนนรายวิชานี้"
                          >
                            <span>เปิดสมุด</span>
                            <ExternalLink size={12} />
                          </button>
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

      {/* Official Saraban Memo PDF Modal */}
      <PorBor5IncompleteMemoPdfModal
        isOpen={isPdfModalOpen}
        onClose={() => setIsPdfModalOpen(false)}
        schoolId={schoolId}
        createdBy={(currentUser as any)?.displayName || (currentUser as any)?.email || 'ผู้ใช้งาน'}
        pdfProps={{
          schoolName: schoolName || 'โรงเรียน',
          schoolAffiliation: affiliation,
          academicYear,
          semester,
          academicHeadName:
            fullAcademicHeadName ||
            (currentUser as any)?.displayName ||
            'หัวหน้ากลุ่มบริหารงานวิชาการ',
          directorName: fullDirectorName || 'ผู้อำนวยการโรงเรียน',
          items: incompleteSections,
        }}
      />

      {/* PDF Preview Modal — เปิดดูไฟล์ ปพ.5 ที่อัปโหลดไว้แบบพรีวิวในหน้า ไม่เปิดแท็บใหม่ */}
      {pdfPreview && (
        <div
          className="fixed inset-0 top-[60px] z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
          onClick={() => setPdfPreview(null)}
        >
          <div
            className="flex h-[calc(100vh-100px)] w-full max-w-5xl flex-col rounded-2xl bg-white shadow-2xl dark:bg-[#1e1f21]"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4 dark:border-slate-700">
              <h2 className="text-base font-bold text-slate-900 dark:text-white truncate pr-4">
                {pdfPreview.label}
              </h2>
              <div className="flex items-center gap-2 shrink-0">
                <a
                  href={pdfPreview.url}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex h-9 items-center justify-center gap-2 rounded-lg bg-red-600 px-4 text-sm font-bold text-white shadow-sm transition hover:bg-red-700"
                >
                  <FileDown size={16} />
                  เปิดในแท็บใหม่
                </a>
                <button
                  type="button"
                  onClick={() => setPdfPreview(null)}
                  className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-slate-500 transition hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-700"
                  title="ปิด"
                >
                  <X size={18} />
                </button>
              </div>
            </div>
            <div className="flex-1 overflow-hidden rounded-b-2xl bg-slate-100 dark:bg-slate-900">
              <iframe src={pdfPreview.url} title={pdfPreview.label} className="h-full w-full border-none" />
            </div>
          </div>
        </div>
      )}
    </MainLayout>
  );
};

export default PorBor5TrackingReportPage;
