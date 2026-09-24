import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { useSelector } from 'react-redux';
import { RootState } from '@/store';
import { firestore as db, storage } from '@/firebase';
import {
  collection,
  query,
  where,
  getDocs,
  doc,
  getDoc,
} from 'firebase/firestore';
import { ref, getDownloadURL, listAll } from 'firebase/storage';
import MainLayout from '@/layouts/MainLayout';
import BackButton from '@/components/Shared/BackButton';
import { CLASSES, getGroupPersonnel } from '@/utils/schoolUtils';
import { normalizeSubjectGroupValue } from '@/utils/subjectGroupUtils';
import {
  FileText,
  Search,
  Filter,
  CheckCircle2,
  AlertCircle,
  Eye,
  ExternalLink,
  Loader2,
  Calendar,
  GraduationCap,
  Layers,
  X,
  RefreshCw,
  AlertTriangle,
  ArrowRight,
  Sparkles,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import Swal from 'sweetalert2';
import { PorBor5SubmissionMemoPdfModal } from '@/components/Pdf/PorBor5/PorBor5SubmissionMemoPdfModal';
import {
  PorBor5SubmissionMemoPdfProps,
  AchievementCourseRow,
  GradeBuckets,
  CharacteristicBuckets,
  GRADE_BUCKET_KEYS,
  emptyGradeBuckets,
  emptyCharacteristicBuckets,
} from '@/components/Pdf/PorBor5/PorBor5SubmissionMemoPdfDocument';
import AcademicYearSemesterFilter from '@/components/Shared/AcademicYearSemesterFilter';
import { resolveFinalGradeKey } from '@/utils/porBor5MemoGrades';

interface CourseSectionRow {
  id: string; // sectionKey
  courseId: string;
  courseCode: string;
  courseTitle: string;
  subjectGroup: string;
  classLevel: string;
  room: string;
  classLabel: string;
  groupNumber: number;
  teacherId: string;
  teacherIds?: string[];
  teacherName: string;
  teacherPosition?: string;
  studentCount: number;
  passCount: number;
  failCount: number;
  incompleteCount: number;
  hasPdf: boolean;
  pdfUrl?: string | null;
  pdfStoragePath?: string | null;
  overallPercentage: number;
  sectionSemester?: string;
  enrolledStudentIds: string[];
  includeInGradeTable: boolean; // false สำหรับรายวิชา IS และ หน้าที่พลเมือง (ไม่ต้องกรอกในแบบสรุปผลสัมฤทธิ์ฯ)
}

// รายวิชา IS / หน้าที่พลเมือง ไม่ต้องกรอกในตาราง "แบบสรุปผลสัมฤทธิ์ทางการเรียน" ตามระเบียบของโรงเรียน
const isGradeTableExcludedCourse = (title: string, code: string): boolean => {
  const t = title || '';
  const c = (code || '').toUpperCase();
  return (
    t.includes('หน้าที่พลเมือง') ||
    /\bIS\b/i.test(t) ||
    t.includes('การศึกษาค้นคว้าด้วยตนเอง') ||
    t.includes('การศึกษาค้นคว้าอิสระ') ||
    c.startsWith('IS')
  );
};

const isPrimaryClassValue = (val?: string): boolean => {
  if (!val) return false;
  const s = String(val).toLowerCase().trim();
  return (
    s.startsWith('p') ||
    s.startsWith('ป.') ||
    s.startsWith('ป') ||
    ['1', '2', '3', '4', '5', '6'].includes(s)
  );
};

const normalizeSemester = (val?: string | number): string => {
  if (!val) return '1';
  const s = String(val).trim().toLowerCase();
  if (['1', '2'].includes(s)) return s;
  if (['0', 'annual', 'all', 'ทั้งปี', 'ตลอดปี', 'ตลอดปีการศึกษา'].includes(s)) return 'annual';
  return s;
};

const getAssignmentTeacherIds = (asgn: any): string[] => {
  const ids = Array.isArray(asgn?.teacherIds) && asgn.teacherIds.length > 0
    ? asgn.teacherIds
    : (asgn?.teacherId ? [asgn.teacherId] : []);
  return Array.from(new Set(ids.filter((id: string) => id && id !== 'pending' && !String(id).startsWith('GHOST'))));
};

export const PorBor5SubmissionMemoPage: React.FC = () => {
  const navigate = useNavigate();
  const currentUser = useSelector((state: RootState) => state.auth.user);
  const teacherMap = useSelector((state: RootState) => state.userMap.teachers);
  const schoolYearFromSettings = useSelector((state: RootState) => state.schoolSettings.currentAcademicYear);
  const calendarYear = useSelector((state: RootState) => state.calendar.academicYear);

  const [schoolId, setSchoolId] = useState<string>('');
  // ปีการศึกษาเริ่มต้น: อ้างอิงปฏิทินโรงเรียน > ปีการศึกษาปัจจุบันของโรงเรียน > คำนวณจากปีปัจจุบัน (ห้ามปล่อยว่าง
  // เพราะ fetchData ต้องมีปีการศึกษาถึงจะเริ่มโหลดข้อมูลได้ ไม่เช่นนั้นหน้าจะค้างที่สถานะ "กำลังโหลด" ตลอดไป)
  const [academicYear, setAcademicYear] = useState<string>(
    calendarYear || schoolYearFromSettings || String(new Date().getFullYear() + 543)
  );
  const [semester, setSemester] = useState<string>('1');

  const [loading, setLoading] = useState<boolean>(true);
  const [isRefreshing, setIsRefreshing] = useState<boolean>(false);
  const [sections, setSections] = useState<CourseSectionRow[]>([]);
  const [schoolInfo, setSchoolInfo] = useState<any>(null);

  // Filters
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [selectedTeacherId, setSelectedTeacherId] = useState<string>('my');
  const [statusFilter, setStatusFilter] = useState<'all' | 'saved' | 'pending'>('all');

  // Selection for Memo
  const [selectedSectionIds, setSelectedSectionIds] = useState<Set<string>>(new Set());

  // Modal State
  const [isMemoModalOpen, setIsMemoModalOpen] = useState<boolean>(false);
  const [memoPdfProps, setMemoPdfProps] = useState<PorBor5SubmissionMemoPdfProps | null>(null);
  const [isGeneratingMemo, setIsGeneratingMemo] = useState<boolean>(false);

  // PDF Preview for PorBor 5 booklet
  const [previewPdfUrl, setPreviewPdfUrl] = useState<{ url: string; title: string } | null>(null);
  const [previewLoadingId, setPreviewLoadingId] = useState<string | null>(null);

  // In-memory cache for course grades to make PDF generation instant
  const gradesCacheRef = useRef<Map<string, Record<string, any>>>(new Map());

  // Cache สถานะไฟล์ ปพ.5 ที่เช็คใน Storage แล้ว (courseId -> ชุด path ที่มีอยู่จริง) และ courseId ที่เช็คไปแล้ว
  // เพื่อไม่ให้ยิง listAll ซ้ำรายวิชาเดิมเวลาสลับตัวกรองครู/รีเฟรช
  const courseFilePathsRef = useRef<Map<string, Set<string>>>(new Map());
  const checkedPdfCourseIdsRef = useRef<Set<string>>(new Set());

  const userRoles = useMemo(() => {
    if (!currentUser?.role) return [];
    return Array.isArray(currentUser.role) ? currentUser.role : [currentUser.role];
  }, [currentUser]);

  const isAcademicStaff = useMemo(() => {
    return userRoles.some((r) =>
      ['admin', 'director', 'academic', 'academic_head', 'registrar', 'super_admin'].includes(r)
    );
  }, [userRoles]);

  // Resolve current user teacher ID
  const currentTeacherId = (currentUser as any)?.docId || currentUser?.uid || '';

  // 1. Initial Load - School info
  useEffect(() => {
    const sId = (currentUser as any)?.schoolId;
    if (sId) {
      setSchoolId(sId);
      getDoc(doc(db, 'school-settings', sId)).then((snap) => {
        if (snap.exists()) {
          setSchoolInfo(snap.data());
        }
      });
    }
  }, [currentUser]);

  // Clear grade cache when switching year or school
  useEffect(() => {
    gradesCacheRef.current.clear();
  }, [schoolId, academicYear]);

  // 2. Fetch courses and assignments strictly aligned with /academic/course-assignment
  const fetchData = useCallback(async (isSilent = false) => {
    if (!schoolId || !academicYear) {
      setLoading(false);
      setSections([]);
      return;
    }
    if (!isSilent) setLoading(true);
    else setIsRefreshing(true);

    try {
      // 1. ดึงข้อมูลโครงสร้างวิชา, การมอบหมาย และการลงทะเบียนจาก Firestore พร้อมกันแบบขนาน (Parallel)
      const [coursesSnap, asgnSnap, enrollSnap] = await Promise.all([
        getDocs(collection(db, 'school-settings', schoolId, 'courses')),
        getDocs(query(
          collection(db, 'school-settings', schoolId, 'course_assignments'),
          where('academicYear', '==', String(academicYear))
        )),
        getDocs(query(
          collection(db, 'school-settings', schoolId, 'enrollments'),
          where('academicYear', '==', String(academicYear))
        )),
      ]);

      const coursesMap = new Map<string, any>();
      coursesSnap.docs.forEach((d) => coursesMap.set(d.id, { id: d.id, ...d.data() }));

      const assignmentsByCourse = new Map<string, { semester: string; list: any[] }[]>();
      asgnSnap.docs.forEach((d) => {
        const data = d.data();
        const cId = data.courseId;
        const sem = String(data.semester || '1');
        if (!cId) return;
        if (!assignmentsByCourse.has(cId)) {
          assignmentsByCourse.set(cId, []);
        }
        assignmentsByCourse.get(cId)!.push({
          semester: sem,
          list: data.teacherAssignments || [],
        });
      });

      // การลงทะเบียนบางรายการเก็บเฉพาะ courseCode (ไม่มี courseId) และเก็บกลุ่มเรียนต่างชื่อฟิลด์กัน (groupNumber / group /
      // groupName เช่น "กลุ่ม 1", "ก.1" / room) — จับคู่ให้ครบทุกรูปแบบเหมือนหน้าเช็คชื่อและรายงานแก้ตัว ไม่เช่นนั้นวิชาที่ข้อมูลอยู่
      // รูปแบบอื่นจะนับนักเรียนได้ 0 คน ทำให้ตารางสรุปผลสัมฤทธิ์ผิด
      const courseCodeToId = new Map<string, string>();
      coursesMap.forEach((c, id) => {
        const code = String(c.code || '').trim();
        if (code && !courseCodeToId.has(code)) courseCodeToId.set(code, id);
      });
      const parseGroupNo = (v: unknown): number | null => {
        const t = String(v ?? '').trim().replace(/^กลุ่ม\s*/, '').replace(/^ก\./, '').trim();
        const n = Number(t);
        return t !== '' && Number.isFinite(n) && n > 0 ? n : null;
      };
      const enrollmentGroups = (data: any): number[] => {
        const found = new Set<number>();
        [data.groupNumber, data.group, data.groupName].forEach((v) => {
          const n = parseGroupNo(v);
          if (n) found.add(n);
        });
        if (found.size === 0) {
          [data.room, data.roomNumber].forEach((v) => {
            const n = parseGroupNo(v);
            if (n) found.add(n);
          });
        }
        if (found.size === 0) found.add(1);
        return Array.from(found);
      };

      const enrollmentsBySection = new Map<string, Set<string>>();
      const addEnrollment = (key: string, studentId: string) => {
        if (!enrollmentsBySection.has(key)) enrollmentsBySection.set(key, new Set());
        enrollmentsBySection.get(key)!.add(studentId);
      };
      enrollSnap.docs.forEach((d) => {
        const data = d.data();
        const cId = data.courseId || (data.courseCode ? courseCodeToId.get(String(data.courseCode).trim()) : undefined);
        const sId = data.studentId;
        const sSem = data.semester;
        if (!cId || !sId) return;
        enrollmentGroups(data).forEach((gNum) => {
          addEnrollment(`${cId}_${gNum}`, sId);
          addEnrollment(`${cId}_${gNum}_${sSem}`, sId);
        });
      });

      // 2. สร้างแถวรายการวิชาในหน่วยความจำทันที (In-memory)
      const rows: CourseSectionRow[] = [];
      const normalizedSelectedSem = normalizeSemester(semester);

      for (const [courseId, recordList] of Array.from(assignmentsByCourse.entries())) {
        const course = coursesMap.get(courseId);
        if (!course) continue;

        // Skip non-academic activities (clubs, homeroom, guidance, boy scouts)
        const title = String(course.title || course.name || '').toLowerCase();
        const code = String(course.code || '').toLowerCase();
        const cType = String(course.type || '').toLowerCase();
        if (
          title.includes('ชุมนุม') ||
          title.includes('โฮมรูม') ||
          title.includes('แนะแนว') ||
          title.includes('ลูกเสือ') ||
          code.startsWith('ก') ||
          cType.includes('กิจกรรม')
        ) {
          continue;
        }

        for (const { semester: recSem, list } of recordList) {
          const normRecSem = normalizeSemester(recSem);
          const isPrimary = isPrimaryClassValue(course.classId);

          let matchesSemester = false;
          if (normalizedSelectedSem === 'annual' || isPrimary) {
            matchesSemester = true;
          } else {
            matchesSemester = !normRecSem || normRecSem === 'annual' || normRecSem === normalizedSelectedSem;
          }
          if (!matchesSemester) continue;

          for (const asgn of list) {
            const groupNum = Number(asgn.groupNumber) || 1;
            const assignedTeacherIds = getAssignmentTeacherIds(asgn);
            const tId = assignedTeacherIds[0] || asgn.teacherId || '';
            if (!tId) continue;

            const tName = teacherMap[tId]?.name || asgn.teacherName || tId;
            const primaryRoom = asgn.room ? String(asgn.room).trim() : '1';

            let classLevel = '';
            if (Array.isArray(asgn.classLevels) && asgn.classLevels.length > 0) {
              classLevel = asgn.classLevels[0];
            } else if (asgn.classLevel) {
              classLevel = asgn.classLevel;
            } else if (typeof course.classId === 'string') {
              classLevel = course.classId;
            } else if (Array.isArray(course.classId) && course.classId.length > 0) {
              classLevel = course.classId[0];
            }

            const enrolledStudents = Array.from(
              enrollmentsBySection.get(`${courseId}_${groupNum}_${recSem}`) ||
                enrollmentsBySection.get(`${courseId}_${groupNum}`) ||
                []
            );

            const studentCount = enrolledStudents.length;
            const classLabel = `${CLASSES[classLevel as keyof typeof CLASSES] || classLevel}${primaryRoom ? `/${primaryRoom}` : ''}`;
            const sectionKey = `${courseId}_${classLevel}_${primaryRoom}_${groupNum}_${recSem}`;

            rows.push({
              id: sectionKey,
              courseId,
              courseCode: course.code || '',
              courseTitle: course.title || course.name || 'ไม่ระบุชื่อวิชา',
              subjectGroup: course.subjectGroup || course.learningArea || '',
              classLevel,
              room: primaryRoom,
              classLabel,
              groupNumber: groupNum,
              teacherId: tId,
              teacherIds: assignedTeacherIds,
              teacherName: tName,
              studentCount,
              passCount: studentCount,
              failCount: 0,
              incompleteCount: 0,
              hasPdf: false,
              pdfUrl: null,
              pdfStoragePath: null,
              overallPercentage: studentCount > 0 ? 50 : 0,
              sectionSemester: recSem,
              enrolledStudentIds: enrolledStudents,
              includeInGradeTable: !isGradeTableExcludedCourse(course.title || course.name || '', course.code || ''),
            });
          }
        }
      }

      // แสดงตารางข้อมูลให้ผู้ใช้ทันที (< 500ms) — การเช็คสถานะไฟล์ ปพ.5 ใน Storage ย้ายไปทำแยกใน effect ถัดไป
      // โดยเช็คเฉพาะรายวิชาที่ "อยู่ในขอบเขตที่กำลังแสดงผล" ของครูที่เลือกอยู่เท่านั้น (ไม่ใช่ทั้งโรงเรียน)
      // เพื่อไม่ให้ยิง Storage listAll เป็นร้อยๆ request ทุกครั้งที่โหลดหน้า (ก่อนหน้านี้เช็คทุกวิชาทั้งโรงเรียนแม้ผู้ใช้จะดูแค่วิชาของตัวเอง)
      courseFilePathsRef.current = new Map();
      checkedPdfCourseIdsRef.current = new Set();
      setSections(rows);
      setLoading(false);
      setIsRefreshing(false);
    } catch (err) {
      console.error('Error fetching PorBor5 courses:', err);
      setLoading(false);
      setIsRefreshing(false);
    }
  }, [schoolId, academicYear, semester, teacherMap]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Lazy-load download URL only when user clicks "ดูเล่ม PDF"
  const handleOpenBookletPdf = async (row: CourseSectionRow) => {
    if (row.pdfUrl) {
      setPreviewPdfUrl({ url: row.pdfUrl, title: `ปพ.5 — ${row.courseTitle} (${row.classLabel})` });
      return;
    }
    if (row.pdfStoragePath) {
      setPreviewLoadingId(row.id);
      try {
        const url = await getDownloadURL(ref(storage, row.pdfStoragePath));
        row.pdfUrl = url;
        setPreviewPdfUrl({ url, title: `ปพ.5 — ${row.courseTitle} (${row.classLabel})` });
      } catch (err) {
        console.error('Error fetching booklet PDF URL:', err);
        Swal.fire({
          icon: 'error',
          title: 'ไม่สามารถเปิดไฟล์ได้',
          text: 'เกิดข้อผิดพลาดในการโหลดไฟล์ PDF จากระบบจัดเก็บ',
          confirmButtonColor: '#e11d48',
        });
      } finally {
        setPreviewLoadingId(null);
      }
    }
  };

  // Helper to match a teacher
  const matchTeacher = useCallback(
    (rowTeacherId: string, rowTeacherIds: string[] | undefined, targetId: string): boolean => {
      if (targetId === 'all') return true;
      const allIds = [rowTeacherId, ...(rowTeacherIds || [])].filter(Boolean);

      if (targetId === 'my') {
        const myIds = [
          currentTeacherId,
          currentUser?.uid,
          (currentUser as any)?.docId,
          (currentUser as any)?.teacherId,
        ].filter(Boolean);

        for (const [tId, tObj] of Object.entries(teacherMap || {})) {
          if (tObj.uid === currentUser?.uid || tId === currentUser?.uid || tObj.id === currentTeacherId) {
            myIds.push(tId, tObj.id, tObj.uid || '', tObj.teacherId || '');
          }
        }
        const set = new Set(myIds.filter(Boolean));
        return allIds.some((id) => set.has(id));
      }

      const targetSet = new Set([targetId]);
      const targetObj = teacherMap[targetId];
      if (targetObj) {
        if (targetObj.id) targetSet.add(targetObj.id);
        if (targetObj.uid) targetSet.add(targetObj.uid);
        if (targetObj.teacherId) targetSet.add(targetObj.teacherId);
      }
      return allIds.some((id) => targetSet.has(id));
    },
    [currentTeacherId, currentUser, teacherMap]
  );

  // Sections for the selected teacher (Scope of responsibility)
  const teacherScopeSections = useMemo(() => {
    return sections.filter((row) => matchTeacher(row.teacherId, row.teacherIds, selectedTeacherId));
  }, [sections, matchTeacher, selectedTeacherId]);

  // ตรวจสอบสถานะไฟล์เล่ม ปพ.5 ใน Firebase Storage เฉพาะรายวิชาที่อยู่ใน "ขอบเขตที่กำลังแสดงผล" อยู่ตอนนี้
  // (เช่น ถ้าเลือกดูแค่ "วิชาที่ฉันสอน" จะเช็คแค่ไม่กี่วิชาของครูคนนั้น ไม่ใช่ทุกวิชาทั้งโรงเรียน) และจำผลไว้ใน ref
  // เพื่อไม่เช็คซ้ำรายวิชาเดิมเมื่อสลับตัวกรองไปมา — แก้ปัญหาหน้าโหลดช้าจากการยิง listAll เป็นร้อย request พร้อมกัน
  useEffect(() => {
    if (!schoolId || !academicYear || teacherScopeSections.length === 0) return;

    const courseIdsToCheck = Array.from(
      new Set(teacherScopeSections.map((r) => r.courseId))
    ).filter((cId) => !checkedPdfCourseIdsRef.current.has(cId));
    if (courseIdsToCheck.length === 0) return;

    // จองสิทธิ์เช็ครายวิชาเหล่านี้ทันทีแบบ synchronous (ก่อนเริ่มงาน async ใดๆ) — กัน race condition ที่ effect
    // ถูกเรียกซ้ำก่อนรอบก่อนหน้าจะทันมาร์คว่าเช็คแล้ว (เช่น React.StrictMode ที่จงใจ mount/cleanup/mount ซ้ำตอน dev
    // หรือ teacherScopeSections เปลี่ยน reference จาก re-render อื่นระหว่างที่ยังรอผลอยู่) ซึ่งจะทำให้ยิง listAll ซ้ำวิชาเดิมซ้อนกัน
    courseIdsToCheck.forEach((cId) => checkedPdfCourseIdsRef.current.add(cId));

    const normalizedSelectedSem = normalizeSemester(semester);
    const foldersToScan =
      normalizedSelectedSem === 'annual'
        ? ['semester_annual']
        : normalizedSelectedSem === '2'
        ? ['semester_2', 'semester_annual']
        : ['semester_1', 'semester_annual'];

    let cancelled = false;

    (async () => {
      const BATCH_SIZE = 6;
      for (let i = 0; i < courseIdsToCheck.length; i += BATCH_SIZE) {
        if (cancelled) return;
        const batch = courseIdsToCheck.slice(i, i + BATCH_SIZE);
        await Promise.allSettled(
          batch.flatMap((cId) =>
            foldersToScan.map(async (folder) => {
              try {
                const res = await listAll(
                  ref(storage, `school-settings/${schoolId}/grading/courses/${cId}/year_${academicYear}/${folder}`)
                );
                const set = courseFilePathsRef.current.get(cId) || new Set<string>();
                res.items.forEach((item) => set.add(item.fullPath));
                courseFilePathsRef.current.set(cId, set);
              } catch {
                // โฟลเดอร์นี้อาจยังไม่มี ข้ามไป
              }
            })
          )
        );
      }

      if (cancelled) return;

      // อัปเดตสถานะ hasPdf และ storagePath เฉพาะแถวที่เพิ่งเช็คเสร็จ (ไม่ต้องยิง getDownloadURL ล่วงหน้า)
      setSections((prevRows) =>
        prevRows.map((row) => {
          if (!checkedPdfCourseIdsRef.current.has(row.courseId) || row.hasPdf) return row;

          const isPrimary = isPrimaryClassValue(row.classLevel);
          const roomVariants = [
            row.room ? `_${row.room}` : '',
            row.groupNumber ? `_${row.groupNumber}` : '',
            '',
          ];
          const semPaths = isPrimary
            ? ['semester_annual', 'semester_1', 'semester_2']
            : [`semester_${normalizeSemester(row.sectionSemester) || '1'}`, 'semester_annual', 'semester_1', 'semester_2'];
          const classVariants = [row.classLevel, row.classLevel.toLowerCase(), row.classLevel.toUpperCase()].filter(Boolean);

          const candidatePaths: string[] = [];
          for (const sp of Array.from(new Set(semPaths))) {
            for (const cl of Array.from(new Set(classVariants))) {
              for (const rv of Array.from(new Set(roomVariants))) {
                candidatePaths.push(
                  `school-settings/${schoolId}/grading/courses/${row.courseId}/year_${academicYear}/${sp}/ปพ5_${row.courseId}_${cl}${rv}.pdf`
                );
              }
            }
          }

          const existingFiles = courseFilePathsRef.current.get(row.courseId);
          const matchedPath = existingFiles
            ? candidatePaths.find((p) => existingFiles.has(p))
            : undefined;

          const hasPdf = !!matchedPath;
          return {
            ...row,
            hasPdf,
            pdfStoragePath: matchedPath || null,
            overallPercentage: hasPdf ? 100 : row.studentCount > 0 ? 50 : 0,
          };
        })
      );
    })();

    return () => {
      cancelled = true;
      // ถ้ายกเลิกก่อนเช็คเสร็จจริง (เช่น cleanup จาก React.StrictMode ตอน dev หรือ dependency เปลี่ยนกลางคัน)
      // ให้คืนสิทธิ์รายวิชาที่ยังไม่มีผลจริงใน courseFilePathsRef กลับไปเช็คใหม่ได้ ไม่งั้นแถวนั้นจะค้างสถานะ
      // "ยังไม่บันทึก" ตลอดไปทั้งที่ยังไม่เคยเช็คจริงสำเร็จ
      courseIdsToCheck.forEach((cId) => {
        if (!courseFilePathsRef.current.has(cId)) {
          checkedPdfCourseIdsRef.current.delete(cId);
        }
      });
    };
  }, [teacherScopeSections, schoolId, academicYear, semester]);

  // Progress metrics for the teacher's assigned courses
  const totalAssignedCount = teacherScopeSections.length;
  const completedPdfCount = teacherScopeSections.filter((s) => s.hasPdf).length;
  const missingPdfCount = totalAssignedCount - completedPdfCount;
  const completionPercentage = totalAssignedCount > 0 ? Math.round((completedPdfCount / totalAssignedCount) * 100) : 0;
  
  // Rule: Must save PDF for ALL assigned courses before being able to export memorandum
  const isAllPdfSaved = totalAssignedCount > 0 && completedPdfCount === totalAssignedCount;

  // Filtered rows for the table display
  const filteredSections = useMemo(() => {
    return teacherScopeSections.filter((row) => {
      // Status filter
      if (statusFilter === 'saved' && !row.hasPdf) return false;
      if (statusFilter === 'pending' && row.hasPdf) return false;

      // Search term
      if (searchTerm.trim()) {
        const q = searchTerm.toLowerCase().trim();
        const matchesCode = row.courseCode.toLowerCase().includes(q);
        const matchesTitle = row.courseTitle.toLowerCase().includes(q);
        const matchesClass = row.classLabel.toLowerCase().includes(q);
        const matchesTeacher = row.teacherName.toLowerCase().includes(q);
        if (!matchesCode && !matchesTitle && !matchesClass && !matchesTeacher) return false;
      }

      return true;
    });
  }, [teacherScopeSections, statusFilter, searchTerm]);

  // Unique teachers for dropdown filter — ผู้ใช้ที่ล็อกอินอยู่แสดงเป็นตัวเลือกแรก ("my") ไม่ซ้ำในรายการ,
  // เรียงชื่อตามภาษาไทย และรายการที่หาชื่อไม่เจอ (ชื่อเท่ากับรหัส uid) ไปไว้ท้ายสุดพร้อมป้ายอ่านง่าย
  const availableTeachers = useMemo(() => {
    const map = new Map<string, string>();
    sections.forEach((s) => {
      if (s.teacherId && s.teacherName) {
        map.set(s.teacherId, s.teacherName);
      }
    });
    return Array.from(map.entries())
      .filter(([id]) => !matchTeacher(id, undefined, 'my'))
      .map(([id, rawName]) => {
        const resolvedName = teacherMap[id]?.name;
        const unresolved = !resolvedName && rawName === id;
        return {
          id,
          unresolved,
          name: unresolved ? `ไม่พบชื่อครู (${id.slice(0, 6)}…)` : (resolvedName || rawName),
        };
      })
      .sort((a, b) => Number(a.unresolved) - Number(b.unresolved) || a.name.localeCompare(b.name, 'th'));
  }, [sections, matchTeacher, teacherMap]);

  // Selection handlers
  const handleToggleSelectAll = () => {
    if (selectedSectionIds.size === filteredSections.length && filteredSections.length > 0) {
      setSelectedSectionIds(new Set());
    } else {
      setSelectedSectionIds(new Set(filteredSections.map((s) => s.id)));
    }
  };

  const handleToggleSelectRow = (id: string) => {
    setSelectedSectionIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  // คำนวณระดับคุณภาพเฉลี่ย (0-3) ของนักเรียนคนหนึ่งจาก characteristicsScores — สอดคล้องกับ getOverallQuality ใน useGradeBookCalculations.ts
  const getOverallQualityBucket = (record: any): keyof CharacteristicBuckets | null => {
    const scores = Object.values(record?.characteristicsScores || {}) as number[];
    if (scores.length === 0) return null;
    const avg = Math.round(scores.reduce((a, b) => a + b, 0) / scores.length);
    if (avg < 0 || avg > 3) return null;
    return String(avg) as '3' | '2' | '1' | '0';
  };

  // Open Memo Modal for all teacher's assigned courses (once completed) or selected subset
  const handleGenerateMemo = async (targetRows?: CourseSectionRow[]) => {
    const rowsToInclude =
      targetRows ||
      (selectedSectionIds.size > 0
        ? filteredSections.filter((s) => selectedSectionIds.has(s.id))
        : teacherScopeSections);

    if (rowsToInclude.length === 0) {
      Swal.fire({
        icon: 'info',
        title: 'ไม่พบรายวิชา',
        text: 'กรุณาเลือกรายวิชาที่ต้องการออกบันทึกข้อความอย่างน้อย 1 วิชา',
        confirmButtonText: 'ตกลง',
        confirmButtonColor: '#e11d48',
      });
      return;
    }

    const missingInSelection = rowsToInclude.filter((s) => !s.hasPdf);

    const executeGeneration = async () => {
      setIsGeneratingMemo(true);
      try {
        const primaryTeacher = rowsToInclude[0];
        // ผู้รายงาน ("ข้าพเจ้า") อ้างอิงจากครูที่เข้าสู่ระบบ ไม่ใช่ครูเจ้าของรายวิชาแถวแรก — ใช้ชื่อพร้อมคำนำหน้าจากทะเบียนครู
        // (teacherMap) ก่อน ถ้าไม่พบค่อยใช้ชื่อในบัญชี และสุดท้ายจึงถอยไปใช้ชื่อครูในรายวิชา
        const myTeacher: any = Object.entries(teacherMap || {}).find(
          ([tId, t]: [string, any]) =>
            tId === currentUser?.uid || t.uid === currentUser?.uid || t.id === currentTeacherId
        )?.[1];
        const teacherName =
          myTeacher?.name ||
          currentUser?.fullName ||
          (currentUser as any)?.displayName ||
          primaryTeacher.teacherName;
        const learningArea =
          myTeacher?.subjectGroup || myTeacher?.learningArea || primaryTeacher.subjectGroup;

        // ดึงข้อมูลเกรดจริงของแต่ละรายวิชา (school-settings/{schoolId}/courses/{courseId}/grades)
        // เพื่อนำมาคำนวณ "แบบสรุปผลสัมฤทธิ์ทางการเรียน" และ "แบบสรุปคุณลักษณะอันพึงประสงค์"
        const uniqueCourseIds = Array.from(new Set(rowsToInclude.map((r) => r.courseId)));
        const uncachedCourseIds = uniqueCourseIds.filter((cId) => !gradesCacheRef.current.has(cId));

        if (uncachedCourseIds.length > 0) {
          await Promise.allSettled(
            uncachedCourseIds.map(async (cId) => {
              try {
                const gradesSnap = await getDocs(
                  collection(db, 'school-settings', schoolId, 'courses', cId, 'grades')
                );
                const courseGrades: Record<string, any> = {};
                gradesSnap.docs.forEach((gDoc) => {
                  courseGrades[gDoc.id] = gDoc.data();
                });
                gradesCacheRef.current.set(cId, courseGrades);
              } catch (e) {
                console.warn(`Could not load grades for course ${cId}:`, e);
              }
            })
          );
        }

        // เอกสารรายวิชา (เกณฑ์คะแนนเก็บ formativeAssessments) สำหรับคำนวณเกรดจากคะแนนจริง
        const courseDocById: Record<string, any> = {};
        await Promise.allSettled(
          uniqueCourseIds.map(async (cId) => {
            try {
              const cSnap = await getDoc(doc(db, 'school-settings', schoolId, 'courses', cId));
              if (cSnap.exists()) courseDocById[cId] = cSnap.data();
            } catch (e) {
              console.warn(`Could not load course ${cId}:`, e);
            }
          })
        );

        const courseItems: AchievementCourseRow[] = rowsToInclude.map((r) => {
          const courseGrades = gradesCacheRef.current.get(r.courseId) || {};
          const gradeBuckets = emptyGradeBuckets();
          const charBuckets = emptyCharacteristicBuckets();

          r.enrolledStudentIds.forEach((studentId) => {
            const record = courseGrades[studentId];
            if (!record) return;

            const gradeKey = resolveFinalGradeKey(record, courseDocById[r.courseId]);
            if (gradeKey) {
              gradeBuckets[gradeKey]++;
            }

            const qualityBucket = getOverallQualityBucket(record);
            if (qualityBucket) {
              charBuckets[qualityBucket]++;
            }
          });

          return {
            courseCode: r.courseCode,
            courseTitle: r.courseTitle,
            classLevel: CLASSES[r.classLevel as keyof typeof CLASSES] || r.classLevel,
            room: r.room,
            studentCount: r.studentCount,
            gradeBuckets,
            charBuckets,
            includeInGradeTable: r.includeInGradeTable,
          };
        });

        const academicLeader = getGroupPersonnel(schoolInfo, 'academic');
        const headOfAssessmentLeader =
          Object.values(teacherMap || {}).find((t: any) => t.isHeadOfAssessment)?.name ||
          schoolInfo?.assessmentHeadName ||
          '';

        const props: PorBor5SubmissionMemoPdfProps = {
          schoolName: schoolInfo?.schoolName || 'โรงเรียน',
          schoolAffiliation: schoolInfo?.affiliation || '',
          academicYear: String(academicYear),
          semester: String(semester),
          learningArea,
          teacherName,
          teacherPosition: 'ครูผู้สอน',
          courses: courseItems,
          directorName: schoolInfo?.directorName ? `${schoolInfo.directorPrefix || ''}${schoolInfo.directorName}`.trim() : '',
          reviewerName: headOfAssessmentLeader,
          deputyDirectorName: academicLeader?.name || '',
        };

        setMemoPdfProps(props);
        setIsMemoModalOpen(true);
      } catch (genError) {
        console.error('Error generating memo:', genError);
        Swal.fire({
          icon: 'error',
          title: 'เกิดข้อผิดพลาดในการประมวลผล',
          text: 'ไม่สามารถดึงข้อมูลผลการเรียนได้ กรุณาลองใหม่อีกครั้ง',
          confirmButtonColor: '#e11d48',
        });
      } finally {
        setIsGeneratingMemo(false);
      }
    };

    if (missingInSelection.length > 0) {
      Swal.fire({
        icon: 'warning',
        title: 'ตรวจพบรายวิชาที่ยังไม่ได้ออกเล่ม ปพ.5 (PDF)',
        html: `
          <div class="text-left text-xs space-y-2 mt-2">
            <p>มีจำนวน <b>${missingInSelection.length} รายวิชา</b> ที่ยังไม่มีไฟล์เล่ม ปพ.5 (PDF) ในคลังเอกสาร:</p>
            <ul class="list-disc pl-5 text-gray-600 dark:text-gray-300 max-h-36 overflow-y-auto space-y-1">
              ${missingInSelection
                .slice(0, 10)
                .map((m) => `<li><b>${m.courseCode}</b> ${m.courseTitle} (${m.classLabel})</li>`)
                .join('')}
              ${missingInSelection.length > 10 ? `<li>...และอีก ${missingInSelection.length - 10} รายวิชา</li>` : ''}
            </ul>
            <p class="text-gray-500 pt-2 border-t border-gray-200 dark:border-gray-700">
              * ตามระเบียบงานวัดผลควรบันทึกเล่ม ปพ.5 ให้ครบก่อน แต่หากท่านต้องการพิมพ์บันทึกข้อความนำส่งทันที สามารถกดยืนยันเพื่อดำเนินการได้
            </p>
          </div>
        `,
        showCancelButton: true,
        confirmButtonText: 'ยืนยันออกบันทึกข้อความต่อไป',
        cancelButtonText: 'ยกเลิก (ไปบันทึกเล่ม ปพ.5 ก่อน)',
        confirmButtonColor: '#e11d48',
        cancelButtonColor: '#6b7280',
      }).then((result) => {
        if (result.isConfirmed) {
          executeGeneration();
        }
      });
    } else {
      executeGeneration();
    }
  };

  return (
    <MainLayout>
      <div className="max-w-[1400px] mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-5 text-slate-800 dark:text-slate-200">
        {/* ===== ส่วนหัวเอกสาร ===== */}
        <header className="border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#202125]">
          <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-1 bg-[#1e3a5f] px-5 py-2 text-[11px] tracking-wide text-white">
            <span>กลุ่มบริหารวิชาการ · งานวัดผลและประเมินผล</span>
            <span>
              ปีการศึกษา {academicYear} · {semester === 'annual' ? 'ตลอดปีการศึกษา' : `ภาคเรียนที่ ${semester}`}
            </span>
          </div>
          <div className="flex flex-col gap-4 px-5 py-4 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex items-start gap-3">
              <BackButton to="/academic/hub/evaluation" />
              <div>
                <h1 className="text-xl font-bold text-slate-900 dark:text-white sm:text-2xl">
                  บันทึกข้อความรายงานผลสัมฤทธิ์ทางการเรียน
                </h1>
                {/* ข้อความอธิบายแบบกะทัดรัด 2 บรรทัด — แต่ละรายการไม่ถูกตัดกลางข้อความ */}
                <div className="mt-1.5 space-y-0.5 text-xs leading-relaxed text-slate-600 dark:text-slate-400">
                  <p>
                    <span className="font-bold text-slate-800 dark:text-slate-100">เอกสารที่จัดทำ: </span>
                    {['บันทึกข้อความนำส่งเล่ม ปพ.5', 'แบบสรุปผลสัมฤทธิ์ทางการเรียน', 'แบบสรุปคุณลักษณะอันพึงประสงค์'].map((doc, i) => (
                      <span key={doc} className="mr-3 inline-block whitespace-nowrap">
                        {['๑', '๒', '๓'][i]}) {doc}
                      </span>
                    ))}
                  </p>
                  <p>
                    <span className="font-bold text-slate-800 dark:text-slate-100">เงื่อนไข: </span>
                    ต้องบันทึกเล่ม ปพ.5 (PDF) ของทุกรายวิชาที่ได้รับมอบหมายให้ครบถ้วนก่อนส่งออกเอกสาร
                  </p>
                </div>
              </div>
            </div>
            {/* ปุ่มลัด 3 ปุ่ม: ขนาดเท่ากัน เรียงแถวเดียวบนจอกว้าง / ซ้อนเต็มความกว้างบนจอแคบ */}
            <div className="grid w-full shrink-0 grid-cols-1 gap-2 sm:grid-cols-3 lg:w-auto">
              <button
                onClick={() => fetchData(true)}
                disabled={loading || isRefreshing}
                title="ตรวจสอบสถานะไฟล์ PDF ล่าสุดในระบบ"
                className="inline-flex h-10 items-center justify-center gap-2 whitespace-nowrap border border-slate-300 bg-white px-4 text-xs font-semibold text-slate-700 transition hover:bg-slate-50 disabled:opacity-50 dark:border-slate-600 dark:bg-transparent dark:text-slate-200 dark:hover:bg-slate-800"
              >
                <RefreshCw size={15} className={isRefreshing ? 'animate-spin' : ''} />
                {isRefreshing ? 'กำลังตรวจสอบ...' : 'ตรวจสอบสถานะล่าสุด'}
              </button>
              <button
                onClick={() => navigate('/academic/course-assignment')}
                className="inline-flex h-10 items-center justify-center gap-2 whitespace-nowrap border border-slate-300 bg-white px-4 text-xs font-semibold text-slate-700 transition hover:bg-slate-50 dark:border-slate-600 dark:bg-transparent dark:text-slate-200 dark:hover:bg-slate-800"
              >
                <Layers size={15} />
                ตารางมอบหมายการสอน
              </button>
              <button
                onClick={() => navigate('/academic/grade-book')}
                className="inline-flex h-10 items-center justify-center gap-2 whitespace-nowrap border border-slate-300 bg-white px-4 text-xs font-semibold text-slate-700 transition hover:bg-slate-50 dark:border-slate-600 dark:bg-transparent dark:text-slate-200 dark:hover:bg-slate-800"
              >
                <GraduationCap size={15} />
                ทะเบียนวัดผล (ปพ.5)
              </button>
            </div>
          </div>
        </header>

        {/* ===== ส่วนที่ ๑ สรุปสถานะ ===== */}
        <section className="border border-slate-300 bg-white dark:border-slate-700 dark:bg-[#202125]">
          <div className="border-b border-slate-300 bg-slate-100 px-5 py-2.5 text-sm font-bold text-slate-800 dark:border-slate-700 dark:bg-slate-800/60 dark:text-slate-100">
            ส่วนที่ ๑ สรุปสถานะการจัดทำเล่ม ปพ.5
          </div>
          <dl className="grid grid-cols-2 divide-x divide-y divide-slate-200 dark:divide-slate-700 sm:grid-cols-4 sm:divide-y-0">
            {[
              { label: 'รายวิชาที่ได้รับมอบหมาย', value: totalAssignedCount, tone: 'text-slate-900 dark:text-white' },
              { label: 'บันทึกเล่ม PDF แล้ว', value: completedPdfCount, tone: 'text-emerald-700 dark:text-emerald-400' },
              { label: 'ยังไม่บันทึกเล่ม PDF', value: missingPdfCount, tone: missingPdfCount > 0 ? 'text-red-700 dark:text-red-400' : 'text-slate-400' },
              { label: 'ร้อยละความครบถ้วน', value: `${completionPercentage}%`, tone: isAllPdfSaved ? 'text-emerald-700 dark:text-emerald-400' : 'text-amber-700 dark:text-amber-400' },
            ].map((item) => (
              <div key={item.label} className="px-5 py-3">
                <dt className="text-[11px] text-slate-500 dark:text-slate-400">{item.label}</dt>
                <dd className={`mt-0.5 text-2xl font-bold tabular-nums ${item.tone}`}>{item.value}</dd>
              </div>
            ))}
          </dl>

          {!loading && totalAssignedCount > 0 && (
            <div
              className={`flex flex-col gap-3 border-t border-slate-300 border-l-4 px-5 py-4 dark:border-slate-700 md:flex-row md:items-center md:justify-between ${
                isAllPdfSaved ? 'border-l-emerald-600 bg-emerald-50/50 dark:bg-emerald-950/10' : 'border-l-amber-500 bg-amber-50/50 dark:bg-amber-950/10'
              }`}
            >
              <div className="flex items-start gap-3">
                <span className={`mt-0.5 ${isAllPdfSaved ? 'text-emerald-700 dark:text-emerald-400' : 'text-amber-700 dark:text-amber-400'}`}>
                  {isAllPdfSaved ? <CheckCircle2 size={20} /> : <AlertTriangle size={20} />}
                </span>
                <div>
                  <p className="text-sm font-bold text-slate-900 dark:text-white">
                    {isAllPdfSaved
                      ? 'บันทึกเล่ม ปพ.5 (PDF) ครบทุกรายวิชาที่ได้รับมอบหมาย พร้อมส่งออกบันทึกข้อความ'
                      : `ยังไม่สามารถส่งออกบันทึกข้อความได้ — บันทึกแล้ว ${completedPdfCount} จาก ${totalAssignedCount} รายวิชา`}
                  </p>
                  <p className="mt-0.5 text-xs text-slate-600 dark:text-slate-400">
                    {isAllPdfSaved
                      ? 'ข้อมูลครบถ้วน สามารถจัดทำบันทึกข้อความนำส่งเล่ม ปพ.5 ได้'
                      : `คงเหลือ ${missingPdfCount} รายวิชาที่ต้องบันทึกเล่ม ปพ.5 (PDF) ก่อนส่งออก`}
                  </p>
                  <div className="mt-2 h-2 w-full max-w-sm bg-slate-200 dark:bg-slate-700" role="progressbar" aria-valuenow={completionPercentage} aria-valuemin={0} aria-valuemax={100}>
                    <div
                      className={`h-full transition-all duration-500 ${isAllPdfSaved ? 'bg-emerald-600' : 'bg-amber-500'}`}
                      style={{ width: `${completionPercentage}%` }}
                    />
                  </div>
                </div>
              </div>
              <button
                onClick={() => handleGenerateMemo()}
                disabled={isGeneratingMemo}
                title="พิมพ์และส่งออกบันทึกข้อความรายงานผลสัมฤทธิ์ทางการเรียน"
                className="inline-flex shrink-0 items-center justify-center gap-2 border border-red-700 bg-red-700 px-5 py-2.5 text-sm font-bold text-white transition hover:bg-red-800 disabled:opacity-50"
              >
                {isGeneratingMemo ? <Loader2 size={16} className="animate-spin" /> : <FileText size={16} />}
                {isGeneratingMemo
                  ? 'กำลังประมวลผลข้อมูลเกรด...'
                  : isAllPdfSaved
                  ? 'ส่งออกบันทึกข้อความ'
                  : `ส่งออกบันทึกข้อความ (${completedPdfCount}/${totalAssignedCount})`}
              </button>
            </div>
          )}
        </section>

        {/* ===== ส่วนที่ ๒ เงื่อนไขการเลือกข้อมูล ===== */}
        <section className="border border-slate-300 bg-white dark:border-slate-700 dark:bg-[#202125]">
          <div className="border-b border-slate-300 bg-slate-100 px-5 py-2.5 text-sm font-bold text-slate-800 dark:border-slate-700 dark:bg-slate-800/60 dark:text-slate-100">
            ส่วนที่ ๒ กำหนดขอบเขตข้อมูล
          </div>
          <div className="grid gap-4 px-5 py-4 md:grid-cols-2 xl:grid-cols-4">
            <div>
              <label className="mb-1 block text-[11px] font-semibold text-slate-600 dark:text-slate-400">ปีการศึกษา / ภาคเรียน</label>
              <AcademicYearSemesterFilter
                schoolId={schoolId}
                academicYear={academicYear}
                onAcademicYearChange={setAcademicYear}
                semester={semester}
                onSemesterChange={setSemester}
              />
            </div>

            <div>
              <label htmlFor="porbor5-teacher" className="mb-1 block text-[11px] font-semibold text-slate-600 dark:text-slate-400">
                ครูผู้สอน
              </label>
              <select
                id="porbor5-teacher"
                value={selectedTeacherId}
                onChange={(e) => {
                  setSelectedTeacherId(e.target.value);
                  setSelectedSectionIds(new Set());
                }}
                className="w-full border border-slate-300 bg-white px-3 py-2 text-xs text-slate-800 focus:border-[#1e3a5f] focus:outline-none focus:ring-1 focus:ring-[#1e3a5f] dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
              >
                <option value="my">
                  วิชาที่ฉันสอน ({currentUser?.fullName || 'ครูผู้ใช้ปัจจุบัน'})
                </option>
                {isAcademicStaff && <option value="all">ครูทุกคนในโรงเรียน (ทั้งหมด)</option>}
                {availableTeachers.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <span className="mb-1 block text-[11px] font-semibold text-slate-600 dark:text-slate-400">สถานะเล่ม ปพ.5</span>
              <div className="inline-flex w-full border border-slate-300 dark:border-slate-600" role="group" aria-label="กรองตามสถานะเล่ม ปพ.5">
                {([
                  { key: 'all', label: `ทั้งหมด (${totalAssignedCount})` },
                  { key: 'saved', label: `บันทึกแล้ว (${completedPdfCount})` },
                  { key: 'pending', label: `ค้าง (${missingPdfCount})` },
                ] as const).map((opt, i) => (
                  <button
                    key={opt.key}
                    type="button"
                    onClick={() => setStatusFilter(opt.key)}
                    aria-pressed={statusFilter === opt.key}
                    className={`flex-1 px-2 py-2 text-xs font-semibold transition ${i > 0 ? 'border-l border-slate-300 dark:border-slate-600' : ''} ${
                      statusFilter === opt.key
                        ? 'bg-[#1e3a5f] text-white'
                        : 'bg-white text-slate-700 hover:bg-slate-50 dark:bg-transparent dark:text-slate-300 dark:hover:bg-slate-800'
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label htmlFor="porbor5-search" className="mb-1 block text-[11px] font-semibold text-slate-600 dark:text-slate-400">
                ค้นหา
              </label>
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={14} />
                <input
                  id="porbor5-search"
                  type="text"
                  placeholder="รหัสวิชา / ชื่อวิชา / ชั้น-ห้อง / ชื่อครู"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full border border-slate-300 bg-white py-2 pl-9 pr-3 text-xs text-slate-800 placeholder-slate-400 focus:border-[#1e3a5f] focus:outline-none focus:ring-1 focus:ring-[#1e3a5f] dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
                />
              </div>
            </div>
          </div>
        </section>

        {/* ===== ส่วนที่ ๓ รายการรายวิชา ===== */}
        <section className="border border-slate-300 bg-white dark:border-slate-700 dark:bg-[#202125]">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-300 bg-slate-100 px-5 py-2.5 dark:border-slate-700 dark:bg-slate-800/60">
            <h2 className="text-sm font-bold text-slate-800 dark:text-slate-100">
              ส่วนที่ ๓ รายการรายวิชาที่ได้รับมอบหมาย ({filteredSections.length} รายการ)
            </h2>
            {filteredSections.length > 0 && (
              <button
                onClick={handleToggleSelectAll}
                className="text-xs font-semibold text-[#1e3a5f] underline-offset-2 hover:underline dark:text-sky-300"
              >
                {selectedSectionIds.size === filteredSections.length ? 'ยกเลิกการเลือกทั้งหมด' : 'เลือกทั้งหมด'}
              </button>
            )}
          </div>

          {loading ? (
            <div className="flex flex-col items-center justify-center py-16 text-slate-500">
              <Loader2 size={28} className="mb-2 animate-spin text-[#1e3a5f] dark:text-sky-300" />
              <p className="text-xs">กำลังตรวจสอบสถานะไฟล์ ปพ.5 จากฐานข้อมูล...</p>
            </div>
          ) : filteredSections.length === 0 ? (
            <div className="flex flex-col items-center justify-center px-4 py-14 text-center">
              <AlertCircle size={32} className="mb-2 text-slate-300 dark:text-slate-600" />
              <p className="text-sm font-bold text-slate-700 dark:text-slate-200">ไม่พบรายวิชาที่ได้รับมอบหมายสอน</p>
              <p className="mt-1 max-w-md text-xs text-slate-500">
                หากยังไม่มีการมอบหมายงานสอน กรุณาตรวจสอบที่หน้าระบบมอบหมายงานสอน หรือเปลี่ยนปีการศึกษา/ภาคเรียน
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[960px] border-collapse text-left text-xs">
                <thead>
                  <tr className="bg-[#1e3a5f] text-white">
                    <th className="w-12 border border-[#2c4a72] px-3 py-2.5 text-center font-semibold">
                      <input
                        type="checkbox"
                        aria-label="เลือกทั้งหมด"
                        checked={selectedSectionIds.size === filteredSections.length && filteredSections.length > 0}
                        onChange={handleToggleSelectAll}
                        className="h-4 w-4 accent-amber-500"
                      />
                    </th>
                    <th className="w-12 border border-[#2c4a72] px-3 py-2.5 text-center font-semibold">ที่</th>
                    <th className="w-28 border border-[#2c4a72] px-3 py-2.5 font-semibold">รหัสวิชา</th>
                    <th className="border border-[#2c4a72] px-3 py-2.5 font-semibold">ชื่อรายวิชา</th>
                    <th className="w-24 border border-[#2c4a72] px-3 py-2.5 text-center font-semibold">ชั้น/ห้อง</th>
                    <th className="w-40 border border-[#2c4a72] px-3 py-2.5 font-semibold">ครูผู้สอน</th>
                    <th className="w-24 border border-[#2c4a72] px-3 py-2.5 text-center font-semibold">จำนวน (คน)</th>
                    <th className="w-36 border border-[#2c4a72] px-3 py-2.5 text-center font-semibold">สถานะเล่ม ปพ.5</th>
                    <th className="w-56 border border-[#2c4a72] px-3 py-2.5 text-center font-semibold">การดำเนินการ</th>
                  </tr>
                </thead>
                <tbody className="text-slate-700 dark:text-slate-300">
                  {filteredSections.map((row, idx) => {
                    const isSelected = selectedSectionIds.has(row.id);
                    return (
                      <tr
                        key={row.id}
                        className={`transition-colors hover:bg-sky-50/60 dark:hover:bg-slate-800/50 ${
                          isSelected
                            ? 'bg-sky-50 dark:bg-sky-950/20'
                            : idx % 2 === 1
                            ? 'bg-slate-50/70 dark:bg-slate-800/20'
                            : ''
                        }`}
                      >
                        <td className="border border-slate-200 px-3 py-2.5 text-center dark:border-slate-700">
                          <input
                            type="checkbox"
                            aria-label={`เลือก ${row.courseCode}`}
                            checked={isSelected}
                            onChange={() => handleToggleSelectRow(row.id)}
                            className="h-4 w-4 accent-[#1e3a5f]"
                          />
                        </td>
                        <td className="border border-slate-200 px-3 py-2.5 text-center tabular-nums text-slate-500 dark:border-slate-700">{idx + 1}</td>
                        <td className="border border-slate-200 px-3 py-2.5 font-mono font-semibold text-slate-900 dark:border-slate-700 dark:text-white">
                          {row.courseCode}
                        </td>
                        <td className="border border-slate-200 px-3 py-2.5 dark:border-slate-700">
                          <div className="font-semibold text-slate-900 dark:text-white">{row.courseTitle}</div>
                          {row.subjectGroup && <div className="text-[10px] text-slate-500">{row.subjectGroup}</div>}
                        </td>
                        <td className="border border-slate-200 px-3 py-2.5 text-center font-semibold dark:border-slate-700">{row.classLabel}</td>
                        <td className="max-w-[160px] truncate border border-slate-200 px-3 py-2.5 dark:border-slate-700" title={row.teacherName}>
                          {row.teacherName}
                        </td>
                        <td className="border border-slate-200 px-3 py-2.5 text-center tabular-nums dark:border-slate-700">{row.studentCount}</td>
                        <td className="border border-slate-200 px-3 py-2.5 text-center dark:border-slate-700">
                          {row.hasPdf ? (
                            <span className="inline-flex items-center gap-1 border border-emerald-600 px-2 py-0.5 text-[11px] font-semibold text-emerald-800 dark:border-emerald-500 dark:text-emerald-300">
                              <CheckCircle2 size={12} /> บันทึกแล้ว
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 border border-red-600 px-2 py-0.5 text-[11px] font-semibold text-red-800 dark:border-red-500 dark:text-red-300">
                              <AlertCircle size={12} /> ยังไม่บันทึก
                            </span>
                          )}
                        </td>
                        <td className="border border-slate-200 px-3 py-2.5 dark:border-slate-700">
                          <div className="flex flex-wrap items-center justify-center gap-1.5">
                            {row.hasPdf ? (
                              <button
                                onClick={() => handleOpenBookletPdf(row)}
                                disabled={previewLoadingId === row.id}
                                title="ดูตัวอย่างเล่ม ปพ.5 (PDF)"
                                className="inline-flex items-center gap-1 border border-slate-300 bg-white px-2.5 py-1.5 font-semibold text-slate-700 transition hover:bg-slate-50 disabled:opacity-50 dark:border-slate-600 dark:bg-transparent dark:text-slate-200 dark:hover:bg-slate-800"
                              >
                                {previewLoadingId === row.id ? <Loader2 size={13} className="animate-spin" /> : <Eye size={13} />}
                                ดูเล่ม PDF
                              </button>
                            ) : (
                              <button
                                onClick={() => navigate(`/academic/grade-book?courseId=${row.courseId}&classId=${row.classLevel}&room=${row.room}&semester=${row.sectionSemester || semester}`)}
                                title="เปิดหน้า ปพ.5 เพื่อบันทึกและส่งออกเล่ม PDF"
                                className="inline-flex items-center gap-1 border border-amber-600 bg-amber-50 px-2.5 py-1.5 font-semibold text-amber-900 transition hover:bg-amber-100 dark:border-amber-500 dark:bg-amber-950/20 dark:text-amber-200"
                              >
                                <ExternalLink size={13} />
                                ไปบันทึกเล่ม ปพ.5
                              </button>
                            )}
                            <button
                              onClick={() => handleGenerateMemo([row])}
                              title="พิมพ์บันทึกข้อความเฉพาะรายวิชานี้"
                              className="inline-flex items-center gap-1 border border-[#1e3a5f] bg-white px-2.5 py-1.5 font-semibold text-[#1e3a5f] transition hover:bg-[#1e3a5f] hover:text-white dark:border-sky-400 dark:bg-transparent dark:text-sky-300 dark:hover:bg-sky-400 dark:hover:text-slate-900"
                            >
                              <FileText size={13} />
                              ออกบันทึกข้อความ
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
          <div className="border-t border-slate-200 px-5 py-2.5 text-[11px] text-slate-500 dark:border-slate-700 dark:text-slate-400">
            หมายเหตุ: เลือกรายวิชาในตารางเพื่อออกบันทึกข้อความหลายรายวิชาพร้อมกัน หรือกด "ออกบันทึกข้อความ" ที่แถวเพื่อออกเฉพาะรายวิชานั้น
          </div>
        </section>

        {/* แถบดำเนินการเมื่อเลือกรายวิชา */}
        {selectedSectionIds.size > 0 && (
          <div className="fixed bottom-6 left-1/2 z-40 flex -translate-x-1/2 flex-wrap items-center gap-4 border border-slate-600 bg-[#14273f] px-5 py-3 text-white shadow-2xl animate-slide-up">
            <span className="text-xs font-semibold">
              เลือกแล้ว <span className="tabular-nums text-amber-300">{selectedSectionIds.size}</span> รายวิชา
            </span>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setSelectedSectionIds(new Set())}
                className="border border-slate-500 px-3 py-1.5 text-xs font-semibold transition hover:bg-slate-700"
              >
                ยกเลิกการเลือก
              </button>
              <button
                onClick={() => handleGenerateMemo()}
                disabled={isGeneratingMemo}
                title="พิมพ์บันทึกข้อความรายงานผลสัมฤทธิ์ทางการเรียน"
                className="inline-flex items-center gap-1.5 border border-amber-400 bg-amber-400 px-4 py-1.5 text-xs font-bold text-slate-900 transition hover:bg-amber-300 disabled:opacity-50"
              >
                {isGeneratingMemo ? <Loader2 size={14} className="animate-spin" /> : <FileText size={14} />}
                ออกบันทึกข้อความ ({selectedSectionIds.size} วิชา)
              </button>
            </div>
          </div>
        )}

        {/* Modal บันทึกข้อความรายงานผลสัมฤทธิ์ทางการเรียน */}
        {isMemoModalOpen && memoPdfProps && (
          <PorBor5SubmissionMemoPdfModal
            isOpen={isMemoModalOpen}
            onClose={() => setIsMemoModalOpen(false)}
            pdfProps={memoPdfProps}
            schoolId={schoolId}
            createdBy={currentUser?.fullName || (currentUser as any)?.displayName || currentUser?.email || 'ครูผู้สอน'}
          />
        )}

        {/* PDF Preview Modal สำหรับเล่ม ปพ.5 */}
        {previewPdfUrl && (
          <div className="fixed inset-0 z-50 flex items-start justify-center px-4 pb-4 pt-[76px] bg-black/60 backdrop-blur-sm animate-fade-in">
            <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-2xl flex flex-col w-full max-w-5xl h-full max-h-[calc(100vh-92px)] border border-gray-200 dark:border-gray-800 overflow-hidden">
              <div className="flex items-center justify-between px-5 py-3 border-b border-gray-200 dark:border-gray-800">
                <h3 className="text-sm font-bold text-gray-800 dark:text-white truncate">
                  {previewPdfUrl.title}
                </h3>
                <button
                  onClick={() => setPreviewPdfUrl(null)}
                  className="p-1 rounded-lg text-gray-400 hover:text-gray-600 dark:hover:text-white transition"
                >
                  <X size={18} />
                </button>
              </div>
              <div className="flex-1 bg-gray-100 dark:bg-gray-950 p-2">
                <iframe
                  src={previewPdfUrl.url}
                  className="w-full h-full border-0 rounded-lg shadow-inner"
                  title={previewPdfUrl.title}
                />
              </div>
            </div>
          </div>
        )}
      </div>
    </MainLayout>
  );
};

export default PorBor5SubmissionMemoPage;
