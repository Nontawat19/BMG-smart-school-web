import React, { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { firestore as db } from "../../firebase";
import { motion } from "framer-motion";
import { collection, query, doc, getDocs, updateDoc, writeBatch, serverTimestamp, deleteDoc, setDoc, orderBy } from "firebase/firestore";
import { useSelector, useDispatch } from "react-redux";
import { RootState } from "../../store";
import { fetchCalendar } from "@/store/slices/calendarSlice";
import { fetchTeachersMap } from "@/store/slices/userMapSlice";
import { getCurrentThaiYear } from "@/utils/dateUtils";
import MainLayout from "@/layouts/MainLayout";
import BackButton from "@/components/Shared/BackButton";
import {
    Users, BookOpen, Search, Check, School,
    Save, Trash2, Loader2, RefreshCw, ChevronRight, Database, BookOpenCheck,
    ClipboardList, Clock, Calendar
} from "lucide-react";
import Swal from "sweetalert2";
import { getActiveSortedTeachers, compareTeachersByGroupAndId } from "@/utils/teacherSortUtils";
import { formatSemesterLabel, normalizeSemesterValue, semestersOverlap } from "@/utils/semesterUtils";
import { LearnerActivityTeacherScope, dedupeTeacherScopes, deriveTeacherScopesFromCourse, formatTeacherScopeLabel } from "@/utils/learnerActivityUtils";

// --- Types ---
interface Course {
  id: string;
  code?: string;
  title?: string;
  subjectGroup?: string;
  type?: string;
  semester?: string | number;
  classId?: string | string[];
  teacherAssignments?: { teacherId?: string; teacherIds?: string[]; groupNumber?: number; roomIds?: string[]; classLevels?: string[] }[];
  sourceCourseIds?: string[];
  sourceCourseCodes?: string[];
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
  teacherScopes?: LearnerActivityTeacherScope[];
  createdAt?: any;
  updatedAt?: any;
  isPending?: boolean;
}

interface SpecialPeriod {
  id: string;
  title: string;
  startTime: string;
  endTime: string;
  day?: string;
}

const CLASS_LEVEL_NAMES: Record<string, string> = {
  k1: 'อ.1', k2: 'อ.2', k3: 'อ.3',
  p1: 'ป.1', p2: 'ป.2', p3: 'ป.3', p4: 'ป.4', p5: 'ป.5', p6: 'ป.6',
  m1: 'ม.1', m2: 'ม.2', m3: 'ม.3', m4: 'ม.4', m5: 'ม.5', m6: 'ม.6',
};

const CLASS_LEVEL_ORDER = ['k1','k2','k3','p1','p2','p3','p4','p5','p6','m1','m2','m3','m4','m5','m6'];

const extractClassLevels = (classId?: string | string[]): string[] => {
  const ids = Array.isArray(classId) ? classId : classId ? [classId] : [];
  return Array.from(new Set(ids.map(id => String(id).split('/')[0].toLowerCase()).filter(Boolean)));
};

const isClubText = (text: string) => {
  const normalized = text.toLowerCase();
  return normalized.includes('ชุมนุม') || normalized.includes('club');
};

const normalizeActivityTitle = (title?: string) => String(title || '').replace(/\s+/g, '').trim().toLowerCase();

const isLearnerActivityCourse = (course: Course) => {
  const subjectGroupText = String(course.subjectGroup || '').trim().toLowerCase();
  const typeText = String(course.type || '').trim().toLowerCase();
  const fullText = `${course.code || ''} ${course.title || ''} ${subjectGroupText} ${typeText}`;
  if (isClubText(fullText)) return false;

  return (
    subjectGroupText === '9' ||
    subjectGroupText.includes('กิจกรรมพัฒนาผู้เรียน') ||
    subjectGroupText.includes('พัฒนาผู้เรียน') ||
    typeText === 'กิจกรรม' ||
    typeText.includes('กิจกรรมพัฒนาผู้เรียน')
  );
};

const formatSpecialPeriodDay = (day?: string) => {
  const labels: Record<string, string> = {
    all: 'ทุกวัน', mon: 'จันทร์', tue: 'อังคาร', wed: 'พุธ', thu: 'พฤหัสบดี', fri: 'ศุกร์', sat: 'เสาร์', sun: 'อาทิตย์',
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

const removeUndefinedFields = <T,>(value: T): T => {
    if (Array.isArray(value)) return value.map(item => removeUndefinedFields(item)) as T;
    if (value && typeof value === 'object') {
        return Object.entries(value as Record<string, any>).reduce((acc, [key, item]) => {
            if (item !== undefined) acc[key] = removeUndefinedFields(item);
            return acc;
        }, {} as Record<string, any>) as T;
    }
    return value;
};

// --- Shared Components ---
const PanelHeader = ({ title, icon: Icon, count, compact = false, extra }: { title: string, icon: any, count?: number, compact?: boolean, extra?: React.ReactNode }) => (
    <div className={`flex items-center justify-between ${compact ? 'px-3 py-1.5' : 'px-4 py-2'} border-b border-slate-200 dark:border-white/5 bg-slate-50/50 dark:bg-white/[0.02]`}>
        <div className="flex items-center gap-2">
            <div className="flex items-center gap-2">
                <Icon size={14} className="text-indigo-600 dark:text-indigo-400" />
                <h3 className={`font-bold text-slate-800 dark:text-white tracking-wide uppercase ${compact ? 'text-[9px]' : 'text-[11px]'}`}>{title}</h3>
            </div>
            {extra}
        </div>
        {count !== undefined && (
            <span className="text-[10px] font-black text-slate-400 dark:text-slate-500">({count})</span>
        )}
    </div>
);

const FloatingButton = ({ icon: Icon, color, onClick, label, disabled = false }: { icon: any, color: string, onClick: () => void, label?: string, disabled?: boolean }) => (
    <motion.button
        whileHover={disabled ? {} : { scale: 1.1, x: 2 }}
        whileTap={disabled ? {} : { scale: 0.9 }}
        onClick={disabled ? undefined : onClick}
        title={label}
        className={`w-9 h-9 ${color} text-white rounded-xl flex items-center justify-center shadow-lg transition-all border border-white/10 ${disabled ? 'opacity-30 cursor-not-allowed' : 'cursor-pointer hover:shadow-xl hover:-translate-y-0.5'}`}
    >
        <Icon size={18} strokeWidth={2.5} />
    </motion.button>
);

const LearnerActivityManagementPage: React.FC = () => {
  const currentUser = useSelector((state: RootState) => state.auth.user);
  const schoolId = (currentUser as any)?.schoolId;
  const dispatch = useDispatch();
  const { teachers: teacherMap, status: teacherMapStatus } = useSelector((state: RootState) => state.userMap);
  const calendarState = useSelector((state: RootState) => state.calendar);

  // States
  const [activities, setActivities] = useState<LearnerActivity[]>([]);
  const [courses, setCourses] = useState<Course[]>([]);
  const [specialPeriods, setSpecialPeriods] = useState<SpecialPeriod[]>([]);
  const [pendingQueue, setPendingQueue] = useState<LearnerActivity[]>([]);

  // Selection States
  const [selectedCourses, setSelectedCourses] = useState<Course[]>([]);
  const [selectedTeacherIds, setSelectedTeacherIds] = useState<string[]>([]);
  const [selectedSpecialPeriodId, setSelectedSpecialPeriodId] = useState<string | null>(null);
  const [selectedAssignments, setSelectedAssignments] = useState<LearnerActivity[]>([]);

  const [courseSearch, setCourseSearch] = useState('');
  const [classLevelFilter, setClassLevelFilter] = useState('all');
  const [teacherSearch, setTeacherSearch] = useState('');
  const [activeYear, setActiveYear] = useState(String(getCurrentThaiYear()));
  const [activeSemester, setActiveSemester] = useState('1');
  const [teacherGroupFilter, setTeacherGroupFilter] = useState("ครูกลุ่มสาระ");
  const [subjectGroupsList, setSubjectGroupsList] = useState<{id: string, name: string, code: string}[]>([]);

  const [loading, setLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const autoSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const saveInFlightRef = useRef(false);

  useEffect(() => {
    if (schoolId && teacherMapStatus === 'idle') dispatch(fetchTeachersMap(schoolId) as any);
  }, [schoolId, teacherMapStatus, dispatch]);

  useEffect(() => {
    if (schoolId && calendarState.status === 'idle') dispatch(fetchCalendar(schoolId) as any);
  }, [schoolId, calendarState.status, dispatch]);

  useEffect(() => {
    if (calendarState.academicYear) setActiveYear(calendarState.academicYear);
    if (calendarState.rawData?.currentTerm) setActiveSemester(String(calendarState.rawData.currentTerm));
  }, [calendarState.academicYear, calendarState.rawData]);

  useEffect(() => {
    if (!schoolId) return;
    const fetchInitialSettings = async () => {
      setLoading(true);
      try {
        const [activitySnap, courseSnap, periodSnap, groupSnap] = await Promise.all([
          getDocs(collection(db, 'school-settings', schoolId, 'learner-activities')),
          getDocs(query(collection(db, 'school-settings', schoolId, 'courses'), orderBy('code', 'asc'))),
          getDocs(collection(db, 'school-settings', schoolId, 'special-periods')),
          getDocs(collection(db, 'school-settings', schoolId, 'subject_groups')),
        ]);
        setActivities(
          activitySnap.docs
            .map(d => ({ id: d.id, ...d.data() } as LearnerActivity))
            .sort((a, b) => {
              const ta = a.createdAt?.toMillis?.() ?? 0;
              const tb = b.createdAt?.toMillis?.() ?? 0;
              return tb - ta;
            })
        );
        setCourses(courseSnap.docs.map(d => ({ id: d.id, ...d.data() } as Course)));
        setSpecialPeriods(periodSnap.docs
          .map(d => ({ id: d.id, ...d.data() } as SpecialPeriod))
          .filter(isSelectableActivityPeriod)
          .sort(sortSpecialPeriods)
        );
        const groupData = groupSnap.docs.map(d => ({ id: d.id, ...(d.data() as { name: string, code: string }) }));
        groupData.sort((a, b) => (a.code || '999').localeCompare(b.code || '999', undefined, { numeric: true, sensitivity: 'base' }));
        const seenNames = new Set<string>();
        setSubjectGroupsList(groupData.filter(g => g.name && !seenNames.has(g.name) && seenNames.add(g.name)));
      } catch (error) {
        console.error('Error fetching data:', error);
      } finally {
        setLoading(false);
      }
    };
    fetchInitialSettings();
  }, [schoolId]);

  const academicYearOptions = useMemo(() => {
    const base = Number(calendarState.academicYear || activeYear || getCurrentThaiYear());
    return Array.from({ length: 5 }, (_, index) => String(base - index));
  }, [calendarState.academicYear, activeYear]);

  // Derived Data
  const allActivityCourses = useMemo(() => {
    // Each unique course code = one separate entry (no merging by title)
    const seen = new Set<string>();
    return courses
      .filter(course => {
        const text = `${course.code || ''} ${course.title || ''} ${course.subjectGroup || ''} ${course.type || ''}`.toLowerCase();
        if (!semestersOverlap(course.semester, activeSemester)) return false;
        const matchesSearch = !courseSearch || text.includes(courseSearch.toLowerCase());
        if (!isLearnerActivityCourse(course) || !matchesSearch) return false;
        // Deduplicate only by exact course code
        const dedupeKey = course.code ? String(course.code).trim().toLowerCase() : course.id;
        if (seen.has(dedupeKey)) return false;
        seen.add(dedupeKey);
        return true;
      })
      .map(course => ({
        ...course,
        sourceCourseIds: [course.id],
        sourceCourseCodes: course.code ? [course.code] : [],
        teacherAssignments: course.teacherAssignments || [],
      }))
      .sort((a, b) => {
        const aLevels = extractClassLevels(a.classId);
        const bLevels = extractClassLevels(b.classId);
        const aRank = aLevels.length ? CLASS_LEVEL_ORDER.indexOf(aLevels[0]) : 999;
        const bRank = bLevels.length ? CLASS_LEVEL_ORDER.indexOf(bLevels[0]) : 999;
        if (aRank !== bRank) return aRank - bRank;
        return String(a.code || '').localeCompare(String(b.code || ''), 'th');
      });
  }, [courses, courseSearch, activeSemester]);

  const classLevelOptions = useMemo(() => {
    const levels = new Set<string>();
    allActivityCourses.forEach(c => extractClassLevels(c.classId).forEach(l => levels.add(l)));
    return Array.from(levels).sort((a, b) => CLASS_LEVEL_ORDER.indexOf(a) - CLASS_LEVEL_ORDER.indexOf(b));
  }, [allActivityCourses]);

  const activityCourses = useMemo(() => {
    if (classLevelFilter === 'all') return allActivityCourses;
    return allActivityCourses.filter(c => extractClassLevels(c.classId).includes(classLevelFilter));
  }, [allActivityCourses, classLevelFilter]);

  const teachersList = useMemo(() => {
    const term = teacherSearch.toLowerCase();
    const sorted = getActiveSortedTeachers(Object.values(teacherMap || {}));
    return sorted.filter((teacher: any) => {
        const matchesSearch = !term || String(teacher.name || '').toLowerCase().includes(term) || String(teacher.teacherId || '').toLowerCase().includes(term);
        const matchesGroup = teacherGroupFilter === "ครูกลุ่มสาระ" || teacher.subjectGroup === teacherGroupFilter || teacher.learningArea === teacherGroupFilter;
        return matchesSearch && matchesGroup;
    }).sort(compareTeachersByGroupAndId) as any[];
  }, [teacherMap, teacherSearch, teacherGroupFilter]);


  // Actions
  const handleAddToQueue = () => {
      if (!selectedCourses.length || !selectedTeacherIds.length || !selectedSpecialPeriodId || !schoolId) {
          Swal.fire({
              icon: 'warning', title: 'ข้อมูลไม่ครบถ้วน', text: 'กรุณาเลือกวิชา ครูผู้สอน และคาบเช็คชื่อให้ครบ', confirmButtonColor: '#4f46e5'
          });
          return;
      }

      const period = specialPeriods.find(p => p.id === selectedSpecialPeriodId);
      const newItems: LearnerActivity[] = selectedCourses.map(course => {
          const selectedSet = new Set(selectedTeacherIds);
          const derivedScopes = deriveTeacherScopesFromCourse(
            { responsibleTeacherIds: selectedTeacherIds, classId: course.classId },
            course,
            teacherMap as any
          ).filter(scope => scope.teacherIds.some(id => selectedSet.has(id)));
          const teacherScopes = dedupeTeacherScopes(
            derivedScopes.length > 0
              ? derivedScopes
              : selectedTeacherIds.map(teacherId => ({
                  key: `${course.id}__${teacherId}`,
                  teacherId,
                  teacherIds: [teacherId],
                  classLevels: Array.isArray(course.classId) ? course.classId : [course.classId || ''].filter(Boolean),
                  roomIds: [],
                })),
            teacherMap as any
          );
          const responsibleTeacherIds = Array.from(new Set(teacherScopes.flatMap(scope => scope.teacherIds)));
          return {
            id: `draft_${Date.now()}_${course.id}`,
            courseId: course.id,
            courseCode: course.code,
            name: course.title || '',
            description: '',
            subjectGroup: course.subjectGroup,
            semester: activeSemester,
            classId: course.classId,
            specialPeriodId: period?.id,
            specialPeriodTitle: period?.title,
            specialPeriodDay: period?.day || 'all',
            specialPeriodStartTime: period?.startTime,
            specialPeriodEndTime: period?.endTime,
            responsibleTeacherIds,
            teacherScopes,
            isPending: true
          };
      });

      setPendingQueue(prev => [...prev, ...newItems]);
      setSelectedCourses([]);
      setSelectedTeacherIds([]);
      setSelectedSpecialPeriodId(null);
      
      Swal.fire({
          icon: 'info', title: 'เพิ่มรายการแล้ว', text: `ระบบจะบันทึกอัตโนมัติในอีกสักครู่ (${newItems.length} รายการ)`,
          toast: true, position: 'top-end', timer: 1800, showConfirmButton: false, background: '#161a27', color: '#fff'
      });
  };

  const commitPendingQueue = useCallback(async (
      queueSnapshot = pendingQueue,
      options: { confirm?: boolean; silent?: boolean } = {}
  ) => {
      if (!queueSnapshot.length || !schoolId || saveInFlightRef.current) return;

      if (options.confirm) {
          const confirmResult = await Swal.fire({
              title: 'ยืนยันการบันทึกลงระบบ?', text: `คุณกำลังจะบันทึกการมอบหมายจำนวน ${queueSnapshot.length} รายการ ลงในฐานข้อมูลจริง ใช่หรือไม่?`,
              icon: 'warning', showCancelButton: true, confirmButtonColor: '#4f46e5', cancelButtonColor: '#64748b',
              confirmButtonText: 'ตกลง, บันทึกเลย', cancelButtonText: 'ตรวจสอบอีกครั้ง'
          });
          if (!confirmResult.isConfirmed) return;
      }

      saveInFlightRef.current = true;
      setIsSaving(true);
      if (!options.silent) Swal.fire({ title: 'กำลังบันทึกลงฐานข้อมูล...', allowOutsideClick: false, didOpen: () => Swal.showLoading() });

      try {
          const batch = writeBatch(db);
          const newActivities: LearnerActivity[] = [];

          queueSnapshot.forEach(item => {
              const docRef = doc(collection(db, 'school-settings', schoolId, 'learner-activities'));
              const payload = removeUndefinedFields({
                  ...item,
                  id: docRef.id,
                  createdAt: serverTimestamp(),
                  updatedAt: serverTimestamp(),
              });
              delete (payload as any).isPending;
              batch.set(docRef, payload);
              newActivities.push(payload as unknown as LearnerActivity);
          });

          await batch.commit();

          if (!options.silent) {
              Swal.fire({ icon: 'success', title: 'บันทึกข้อมูลเรียบร้อย', text: 'ข้อมูลถูกเขียนลงฐานข้อมูลและพร้อมใช้งานแล้ว', timer: 2000, showConfirmButton: false });
          } else {
              Swal.fire({ icon: 'success', title: `บันทึกอัตโนมัติแล้ว (${queueSnapshot.length})`, toast: true, position: 'top-end', timer: 1300, showConfirmButton: false });
          }
          setPendingQueue(prev => prev.filter(item => !queueSnapshot.includes(item)));
          setActivities(prev => [...newActivities, ...prev]);
          setSelectedAssignments([]);
      } catch (error) {
          console.error(error);
          Swal.fire({ icon: 'error', title: options.silent ? 'บันทึกอัตโนมัติไม่สำเร็จ' : 'เกิดข้อผิดพลาด', text: 'ไม่สามารถบันทึกข้อมูลได้ กรุณาลองใหม่อีกครั้ง' });
      } finally {
          saveInFlightRef.current = false;
          setIsSaving(false);
      }
  }, [pendingQueue, schoolId]);

  const handleCommitAll = useCallback(async () => {
      await commitPendingQueue(pendingQueue, { confirm: true });
  }, [commitPendingQueue, pendingQueue]);

  useEffect(() => {
      if (!pendingQueue.length || !schoolId || loading) return;
      if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current);
      
      const queueSnapshot = [...pendingQueue];
      autoSaveTimerRef.current = setTimeout(() => {
          commitPendingQueue(queueSnapshot, { silent: true });
      }, 1800);

      return () => { if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current); };
  }, [commitPendingQueue, loading, pendingQueue, schoolId]);

  const handleResetSelections = () => {
      setSelectedCourses([]);
      setSelectedTeacherIds([]);
      setSelectedSpecialPeriodId(null);
      setSelectedAssignments([]);
  };

  const handleBulkRemoveAssignments = async () => {
      if (!selectedAssignments.length) return;
      
      const hasPending = selectedAssignments.some(a => a.isPending);
      const hasSaved = selectedAssignments.some(a => !a.isPending);

      const confirmResult = await Swal.fire({
          title: 'ยืนยันการลบ?',
          text: `คุณต้องการยกเลิกการมอบหมายที่เลือกจำนวน ${selectedAssignments.length} รายการ ใช่หรือไม่?`,
          icon: 'warning',
          showCancelButton: true,
          confirmButtonColor: '#ef4444',
          cancelButtonColor: '#64748b',
          confirmButtonText: 'ลบรายการที่เลือก',
          cancelButtonText: 'ยกเลิก'
      });

      if (!confirmResult.isConfirmed) return;

      try {
          if (hasPending) {
              setPendingQueue(prev => prev.filter(item => !selectedAssignments.some(sa => sa.isPending && sa.id === item.id)));
          }

          if (hasSaved && schoolId) {
              const batch = writeBatch(db);
              selectedAssignments.filter(a => !a.isPending).forEach(item => {
                  batch.delete(doc(db, 'school-settings', schoolId, 'learner-activities', item.id));
              });
              await batch.commit();
              setActivities(prev => prev.filter(item => !selectedAssignments.some(sa => !sa.isPending && sa.id === item.id)));
          }

          Swal.fire({ icon: 'success', title: 'ลบข้อมูลสำเร็จ', toast: true, position: 'top-end', timer: 1500, showConfirmButton: false });
          setSelectedAssignments([]);
      } catch (error) {
          console.error(error);
          Swal.fire({ icon: 'error', title: 'เกิดข้อผิดพลาด', text: 'ไม่สามารถลบข้อมูลได้' });
      }
  };

  // Button Props Logic
  const canAssign = selectedCourses.length > 0 && selectedTeacherIds.length > 0 && selectedSpecialPeriodId;
  const canUpdate = selectedAssignments.length > 0 && selectedTeacherIds.length > 0;
  const canDelete = selectedAssignments.length > 0;

  const assignButtonProps = {
      color: canAssign ? 'bg-indigo-600' : 'bg-slate-200 dark:bg-white/5 text-slate-400 dark:text-slate-600',
      disabled: !canAssign,
      label: 'โอนข้อมูล (มอบหมายงาน)'
  };
  
  const middleButtonProps = {
      icon: canUpdate ? Save : RefreshCw,
      color: canUpdate ? 'bg-amber-500' : (selectedCourses.length > 0 || selectedTeacherIds.length > 0 || selectedAssignments.length > 0) ? 'bg-slate-400 dark:bg-white/10' : 'bg-slate-200 dark:bg-white/5 text-slate-400 dark:text-slate-600',
      action: canUpdate ? 'update' : 'reset',
      disabled: !(canUpdate || selectedCourses.length > 0 || selectedTeacherIds.length > 0 || selectedAssignments.length > 0),
      label: canUpdate ? 'อัปเดตครูผู้สอน' : 'รีเซ็ตการเลือก'
  };

  const deleteButtonProps = {
      icon: Trash2,
      color: canDelete ? 'bg-rose-500' : 'bg-slate-200 dark:bg-white/5 text-slate-400 dark:text-slate-600',
      disabled: !canDelete,
      label: 'ลบรายการที่เลือก'
  };

  return (
      <MainLayout>
          <div className="min-h-screen bg-slate-50 dark:bg-[#0b0e14] text-slate-800 dark:text-slate-300 font-sans flex flex-col overflow-hidden h-screen select-none transition-colors duration-300">
              
              {/* --- Header --- */}
              <header className="px-6 py-3 bg-white dark:bg-[#161a27] border-b border-slate-200 dark:border-white/5 flex items-center justify-between shrink-0 shadow-sm z-30 transition-colors duration-300">
                  <div className="flex items-center gap-6 pl-12">
                      <div className="flex items-center gap-4">
                          <React.Suspense fallback={<div className="w-10 h-10 rounded-full bg-slate-200 dark:bg-white/5 animate-pulse" />}>
                              <BackButton to="/academic/hub/activities" />
                          </React.Suspense>
                          <div className="flex items-center gap-3">
                              <div className="p-2 bg-indigo-600 rounded-xl shadow-lg shadow-indigo-600/20">
                                  <BookOpenCheck size={20} className="text-white" />
                              </div>
                              <div>
                                  <h1 className="text-lg font-black text-slate-900 dark:text-white leading-none">กิจกรรมพัฒนาผู้เรียน</h1>
                                  <p className="text-[9px] text-slate-500 dark:text-slate-400 font-bold mt-1 uppercase tracking-wider">กำหนดครูและคาบเช็คชื่อกิจกรรม</p>
                              </div>
                          </div>
                      </div>
                  </div>

                  <div className="flex items-center gap-3">
                      <div className="flex items-center gap-1 bg-slate-100 dark:bg-white/5 px-2 py-1 rounded-xl border border-slate-200 dark:border-white/5 shadow-inner">
                          <div className="flex items-center gap-1.5 border-r border-slate-200 dark:border-white/10 pr-2 ml-1">
                              <span className="text-[8px] font-bold text-slate-400 dark:text-slate-500 uppercase">ปีการศึกษา</span>
                              <select 
                                  value={activeYear} 
                                  onChange={(e) => setActiveYear(e.target.value)}
                                  className="bg-transparent border-none text-[11px] font-bold text-slate-900 dark:text-white outline-none cursor-pointer focus:ring-0 p-0 pr-3"
                              >
                                  {academicYearOptions.map(year => (
                                      <option key={year} value={year} className="bg-white dark:bg-[#161a27] text-slate-900 dark:text-white font-bold">{year}</option>
                                  ))}
                              </select>
                          </div>
                          <div className="flex items-center gap-1.5 px-2">
                              <span className="text-[8px] font-bold text-slate-400 dark:text-slate-500 uppercase">ภาคเรียน</span>
                              <select 
                                  value={activeSemester} 
                                  onChange={(e) => setActiveSemester(e.target.value)}
                                  className="bg-transparent border-none text-[11px] font-bold text-slate-900 dark:text-white outline-none cursor-pointer focus:ring-0 p-0 pr-3"
                              >
                                  <option value="1" className="bg-white dark:bg-[#161a27] text-slate-900 dark:text-white font-bold">ภาคเรียนที่ 1</option>
                                  <option value="2" className="bg-white dark:bg-[#161a27] text-slate-900 dark:text-white font-bold">ภาคเรียนที่ 2</option>
                                  <option value="0" className="bg-white dark:bg-[#161a27] text-slate-900 dark:text-white font-bold">ทั้งปีการศึกษา (0)</option>
                              </select>
                          </div>
                      </div>
                      <button 
                          onClick={handleCommitAll}
                          disabled={!pendingQueue.length || isSaving}
                          className={`px-5 py-2.5 bg-indigo-600 hover:bg-indigo-500 disabled:bg-slate-300 dark:disabled:bg-white/5 disabled:text-slate-500 text-white rounded-xl font-black text-xs transition-all shadow-lg shadow-indigo-600/20 flex items-center gap-2 border border-white/10 ${isSaving ? 'opacity-70 cursor-wait' : ''}`}
                      >
                          {isSaving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
                          {pendingQueue.length > 0 ? `บันทึกตอนนี้ (${pendingQueue.length})` : 'บันทึกอัตโนมัติแล้ว'}
                      </button>
                  </div>
              </header>

              {/* --- Main Content --- */}
              <main className="flex-1 px-8 py-3 flex gap-2 overflow-hidden h-full items-stretch">
                  
                  {/* --- BLOCK 1: Courses, Teachers, Periods --- */}
                  <div className="flex-[2] min-w-0 bg-white dark:bg-[#161a27] rounded-xl border border-slate-200 dark:border-white/5 flex flex-col overflow-hidden shadow-sm dark:shadow-2xl relative transition-all duration-300">
                      <div className="flex-1 flex overflow-hidden h-full">
                          
                          {/* Activities List */}
                          <div className="flex-[1.2] min-w-0 flex flex-col border-r border-slate-200 dark:border-white/5">
                              <PanelHeader title="กิจกรรม" icon={ClipboardList} count={activityCourses.length} compact />
                              <div className="p-2 space-y-1.5">
                                  <div className="relative">
                                      <School className="absolute left-2 top-1/2 -translate-y-1/2 text-slate-400" size={10} />
                                      <select
                                          value={classLevelFilter}
                                          onChange={e => setClassLevelFilter(e.target.value)}
                                          className="w-full pl-6 pr-1 py-1.5 bg-slate-100 dark:bg-white/5 rounded-md text-[9px] font-bold outline-none border border-slate-200 dark:border-white/5 text-slate-700 dark:text-white transition-all focus:ring-2 focus:ring-indigo-500/20"
                                      >
                                          <option value="all">ทุกระดับชั้น</option>
                                          {classLevelOptions.map(lvl => (
                                              <option key={lvl} value={lvl}>{CLASS_LEVEL_NAMES[lvl] || lvl}</option>
                                          ))}
                                      </select>
                                  </div>
                                  <div className="relative">
                                      <Search className="absolute left-2 top-1/2 -translate-y-1/2 text-slate-400" size={10} />
                                      <input type="text" placeholder="ค้นหากิจกรรม..." value={courseSearch} onChange={e=>setCourseSearch(e.target.value)} className="w-full pl-6 pr-2 py-1.5 bg-slate-100 dark:bg-white/5 rounded-md text-[9px] outline-none border border-slate-200 dark:border-white/5 text-slate-900 dark:text-white shadow-inner" />
                                  </div>
                              </div>
                              <div className="flex-1 overflow-y-auto custom-scrollbar px-1 space-y-0.5">
                                  {activityCourses.map(course => {
                                      const isSel = selectedCourses.some(c => c.id === course.id);
                                      return (
                                          <div 
                                              key={course.id}
                                              onClick={() => setSelectedCourses(prev => prev.some(c => c.id === course.id) ? prev.filter(c => c.id !== course.id) : [...prev, course])} 
                                              className={`flex items-center gap-3 px-3 py-1.5 cursor-pointer transition-all border-b border-slate-100 dark:border-white/5 ${isSel ? 'bg-indigo-50/50 dark:bg-indigo-500/5' : 'bg-white dark:bg-transparent hover:bg-slate-50 dark:hover:bg-white/[0.02]'}`}
                                          >
                                              <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0 transition-all ${isSel ? 'border-indigo-500 bg-white dark:bg-slate-900' : 'border-slate-300 dark:border-white/10 bg-slate-50 dark:bg-white/5'}`}>
                                                  {isSel && <div className="w-2.5 h-2.5 rounded-full bg-indigo-500 shadow-sm" />}
                                              </div>
                                              <div className="flex flex-col gap-0.5 overflow-hidden">
                                                  <div className="flex items-center gap-2 text-[11px] font-medium overflow-hidden">
                                                      <div className={`shrink-0 px-1.5 py-0.5 rounded text-[9px] font-black tracking-wider ${isSel ? 'bg-indigo-500/20 text-indigo-700 dark:text-indigo-200' : 'bg-slate-200 dark:bg-white/10 text-slate-500 dark:text-slate-400'}`}>
                                                          {String(course.semester) === '1' ? 'เทอม 1' : String(course.semester) === '2' ? 'เทอม 2' : 'ตลอดปี'}
                                                      </div>
                                                      <span className="text-slate-900 dark:text-white font-black shrink-0">{course.code}</span>
                                                      <span className="text-slate-600 dark:text-slate-300 truncate font-bold text-[11px] whitespace-nowrap">{course.title}</span>
                                                  </div>
                                                  {(() => {
                                                      const rawIds = Array.isArray(course.classId) ? course.classId : course.classId ? [course.classId] : [];
                                                      if (rawIds.length === 0) return null;
                                                      return (
                                                          <div className="flex flex-wrap gap-1 pl-0.5">
                                                              {rawIds.map(cid => {
                                                                  const [lvl, room] = String(cid).split('/');
                                                                  const lvlName = CLASS_LEVEL_NAMES[lvl.toLowerCase()] || lvl;
                                                                  return (
                                                                      <span key={cid} className={`text-[9px] font-bold px-1 py-0 rounded ${isSel ? 'bg-indigo-400/30 text-indigo-100' : 'bg-emerald-100 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-400'}`}>
                                                                          {room ? `${lvlName}/${room}` : lvlName}
                                                                      </span>
                                                                  );
                                                              })}
                                                          </div>
                                                      );
                                                  })()}
                                              </div>
                                          </div>
                                      );
                                  })}
                              </div>
                          </div>

                          {/* Teachers List */}
                          <div className="flex-[1.1] min-w-0 flex flex-col border-r border-slate-200 dark:border-white/5">
                              <PanelHeader title="ครูผู้ดูแล" icon={Users} count={teachersList.length} compact />
                              <div className="p-2 space-y-1.5">
                                  <div className="relative">
                                      <School className="absolute left-2 top-1/2 -translate-y-1/2 text-slate-400" size={10} />
                                      <select 
                                          value={teacherGroupFilter} 
                                          onChange={e => setTeacherGroupFilter(e.target.value)} 
                                          className="w-full pl-6 pr-1 py-1.5 bg-slate-100 dark:bg-white/5 rounded-md text-[9px] font-bold outline-none border border-slate-200 dark:border-white/5 text-slate-700 dark:text-white transition-all focus:ring-2 focus:ring-indigo-500/20"
                                      >
                                          <option value="ครูกลุ่มสาระ" className="bg-white dark:bg-[#161a27] text-slate-900 dark:text-white">ครูกลุ่มสาระ</option>
                                          {subjectGroupsList.map(g => <option key={g.id} value={g.name} className="bg-white dark:bg-[#161a27] text-slate-900 dark:text-white">{g.name}</option>)}
                                      </select>
                                  </div>
                                  <div className="relative">
                                      <Search className="absolute left-2 top-1/2 -translate-y-1/2 text-slate-400" size={10} />
                                      <input type="text" placeholder="ค้นชื่อ..." value={teacherSearch} onChange={e=>setTeacherSearch(e.target.value)} className="w-full pl-6 pr-2 py-1.5 bg-slate-100 dark:bg-white/5 rounded-md text-[9px] outline-none border border-slate-200 dark:border-white/5 text-slate-900 dark:text-white shadow-inner" />
                                  </div>
                              </div>
                              <div className="flex-1 overflow-y-auto custom-scrollbar px-1 space-y-0.5">
                                  {teachersList.map(teacher => (
                                      <div 
                                          key={teacher.id} 
                                          onClick={() => setSelectedTeacherIds(prev => prev.includes(teacher.id) ? prev.filter(id => id !== teacher.id) : [...prev, teacher.id])} 
                                          className={`px-3 py-1.5 rounded-xl cursor-pointer flex items-center justify-between gap-3 border transition-all ${selectedTeacherIds.includes(teacher.id) ? 'bg-indigo-600 border-indigo-500 shadow-lg shadow-indigo-600/20' : 'border-transparent bg-slate-50 dark:bg-white/[0.02] hover:bg-slate-100 dark:hover:bg-white/[0.05]'}`}
                                      >
                                          <div className="flex items-center gap-2 min-w-0">
                                              <div className={`w-3.5 h-3.5 rounded-md border flex items-center justify-center shrink-0 transition-all ${selectedTeacherIds.includes(teacher.id) ? 'bg-white border-white' : 'bg-transparent border-slate-300 dark:border-white/20'}`}>
                                                  {selectedTeacherIds.includes(teacher.id) && <Check size={10} className="text-indigo-600" strokeWidth={4} />}
                                              </div>
                                              <span className={`text-[9px] font-black shrink-0 px-1.5 py-0.5 rounded-md ${selectedTeacherIds.includes(teacher.id) ? 'bg-white/20 text-white' : 'bg-slate-200 dark:bg-white/5 text-slate-500 dark:text-slate-400'}`}>
                                                  {teacher.teacherId || "—"}
                                              </span>
                                              <h4 className={`text-[11px] font-bold truncate whitespace-nowrap ${selectedTeacherIds.includes(teacher.id) ? 'text-white' : 'text-slate-700 dark:text-slate-200'}`}>
                                                  {teacher.name}
                                              </h4>
                                          </div>
                                      </div>
                                  ))}
                              </div>
                          </div>

                          {/* Special Periods List */}
                          <div className="w-48 shrink-0 flex flex-col bg-slate-50/50 dark:bg-black/20">
                              <PanelHeader title="คาบเช็คชื่อ" icon={Clock} count={specialPeriods.length} compact />
                              <div className="flex-1 flex flex-col overflow-y-auto custom-scrollbar p-1">
                                  {specialPeriods.map(period => {
                                      const isActive = selectedSpecialPeriodId === period.id;
                                      return (
                                          <button 
                                              key={period.id} 
                                              onClick={() => setSelectedSpecialPeriodId(isActive ? null : period.id)} 
                                              className={`w-full text-left p-2.5 shrink-0 rounded-xl transition-all border mb-1.5 flex flex-col gap-1.5
                                                  ${isActive 
                                                      ? 'bg-indigo-600 border-indigo-500 shadow-md shadow-indigo-600/20' 
                                                      : 'bg-white dark:bg-[#1e2332] border-slate-200 dark:border-white/10 hover:border-indigo-400 hover:shadow-sm'
                                                  }`}
                                          >
                                              <div className="flex items-center justify-between w-full">
                                                  <span className={`text-[11px] font-black truncate ${isActive ? 'text-white' : 'text-slate-700 dark:text-slate-200'}`}>
                                                      {period.title}
                                                  </span>
                                                  <div className={`w-4 h-4 rounded-full flex items-center justify-center shrink-0 border transition-colors ${isActive ? 'border-white/30 bg-white/20 text-white' : 'border-slate-200 dark:border-white/10 text-slate-400'}`}>
                                                      {isActive && <Check size={10} strokeWidth={4} />}
                                                  </div>
                                              </div>
                                              <div className={`flex flex-wrap items-center gap-1.5 text-[9px] font-bold ${isActive ? 'text-indigo-100' : 'text-slate-500 dark:text-slate-400'}`}>
                                                  <span className={`px-1.5 py-0.5 rounded flex items-center gap-1 ${isActive ? 'bg-indigo-500/50' : 'bg-slate-100 dark:bg-white/5'}`}>
                                                      <Calendar size={10} />
                                                      {formatSpecialPeriodDay(period.day)}
                                                  </span>
                                                  <span className={`px-1.5 py-0.5 rounded flex items-center gap-1 ${isActive ? 'bg-indigo-500/50' : 'bg-slate-100 dark:bg-white/5'}`}>
                                                      <Clock size={10} />
                                                      {period.startTime}-{period.endTime}
                                                  </span>
                                              </div>
                                          </button>
                                      );
                                  })}
                              </div>
                          </div>
                      </div>
                  </div>

                  {/* --- BLOCK 2: Action Buttons --- */}
                  <div className="flex flex-col justify-center gap-2 px-1 shrink-0">
                      <FloatingButton 
                          icon={ChevronRight} 
                          color={assignButtonProps.color} 
                          onClick={handleAddToQueue} 
                          label={assignButtonProps.label}
                          disabled={assignButtonProps.disabled} 
                      />
                      <FloatingButton 
                          icon={middleButtonProps.icon} 
                          color={middleButtonProps.color}
                          onClick={() => {
                              if (middleButtonProps.action === 'update') {
                                  // Update logic is a bit complex for this quick UI mirror, could be implemented if needed.
                                  // For now, it just resets.
                                  handleResetSelections();
                              } else {
                                  handleResetSelections();
                              }
                          }}
                          label={middleButtonProps.label}
                          disabled={middleButtonProps.disabled}
                      />
                      <FloatingButton 
                          icon={deleteButtonProps.icon} 
                          color={deleteButtonProps.color}
                          onClick={handleBulkRemoveAssignments}
                          label={deleteButtonProps.label}
                          disabled={deleteButtonProps.disabled}
                      />
                  </div>

                  {/* --- BLOCK 3: Assigned Activities --- */}
                  <div className="flex-1 min-w-0 bg-white dark:bg-[#161a27] rounded-xl border border-slate-200 dark:border-white/5 flex flex-col overflow-hidden shadow-sm dark:shadow-2xl">
                      <PanelHeader title="กิจกรรมที่ตั้งค่าแล้ว" icon={Database} count={activities.length + pendingQueue.length} compact />
                      <div className="flex-1 overflow-y-auto custom-scrollbar p-2 space-y-1">
                          {(activities.length > 0 || pendingQueue.length > 0) ? (
                              <>
                                  {pendingQueue.length > 0 && (
                                      <div className="mb-4">
                                          <div className="flex items-center gap-2 px-2 py-1 mb-2 bg-amber-500/10 rounded-lg">
                                              <div className="w-2 h-2 rounded-full bg-amber-500 animate-pulse" />
                                              <span className="text-[10px] font-black text-amber-600 uppercase">รอบันทึกอัตโนมัติ ({pendingQueue.length})</span>
                                          </div>
                                          <div className="space-y-0.5">
                                              {pendingQueue.map((item) => {
                                                  const isSelected = selectedAssignments.some(a => a.id === item.id && a.isPending);
                                                  return (
                                                      <div key={item.id}
                                                          onClick={() => setSelectedAssignments(prev => prev.some(a => a.id === item.id) ? prev.filter(a => a.id !== item.id) : [...prev, item])}
                                                          className={`ml-2 px-2.5 py-1.5 rounded-lg flex items-start gap-2 cursor-pointer transition-all border ${isSelected ? 'bg-amber-500/20 border-amber-500/40' : 'bg-amber-50/50 dark:bg-amber-500/5 border-amber-500/10 hover:bg-amber-100/50'}`}
                                                      >
                                                          <div className={`mt-0.5 w-4 h-4 rounded-full border flex items-center justify-center shrink-0 ${isSelected ? 'border-amber-500 bg-white dark:bg-slate-900' : 'border-amber-300 dark:border-white/10'}`}>
                                                              {isSelected && <div className="w-2 h-2 rounded-full bg-amber-500" />}
                                                          </div>
                                                          <div className="flex-1 min-w-0 flex flex-col gap-0.5">
                                                              <div className="flex items-center gap-1.5">
                                                                  <span className="text-amber-600 dark:text-amber-400 font-mono text-[9px] font-black shrink-0 bg-amber-500/5 px-1.5 py-0.5 rounded border border-amber-500/10">
                                                                      {item.responsibleTeacherIds.map(id => teacherMap?.[id]?.teacherId || "N/A").join(", ")}
                                                                  </span>
                                                                  <span className="text-[11px] font-black text-slate-800 dark:text-white truncate">
                                                                      {item.responsibleTeacherIds.map(id => teacherMap?.[id]?.name || id).join(", ") || "ไม่ระบุครู"}
                                                                  </span>
                                                              </div>
                                                              <div className="flex items-center gap-1.5 flex-wrap">
                                                                  <span className="text-[9px] font-bold text-slate-500 dark:text-slate-400 flex items-center gap-1"><BookOpen size={9} /> {item.courseCode} {item.name}</span>
                                                                  {extractClassLevels(item.classId).map(lvl => (
                                                                      <span key={lvl} className="text-[8px] font-black px-1.5 py-0.5 rounded bg-emerald-100 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-400">{CLASS_LEVEL_NAMES[lvl] || lvl}</span>
                                                                  ))}
                                                                  <span className="text-[9px] font-bold text-slate-400 flex items-center gap-0.5"><Clock size={9} /> {item.specialPeriodTitle}</span>
                                                              </div>
                                                          </div>
                                                      </div>
                                                  );
                                              })}
                                          </div>
                                      </div>
                                  )}

                                  <div className="space-y-0.5">
                                      {activities.map((item) => {
                                          const isSelected = selectedAssignments.some(a => a.id === item.id && !a.isPending);
                                          return (
                                              <div key={item.id}
                                                  onClick={() => setSelectedAssignments(prev => prev.some(a => a.id === item.id) ? prev.filter(a => a.id !== item.id) : [...prev, item])}
                                                  className={`px-2.5 py-1.5 rounded-lg flex items-start gap-2 cursor-pointer transition-all border ${isSelected ? 'bg-indigo-600 border-indigo-500 shadow-lg shadow-indigo-600/20' : 'bg-slate-50 dark:bg-white/[0.02] border-transparent hover:bg-slate-100 dark:hover:bg-white/[0.05]'}`}
                                              >
                                                  <div className={`mt-0.5 w-4 h-4 rounded-full border flex items-center justify-center shrink-0 transition-all ${isSelected ? 'border-white bg-white/20' : 'border-slate-300 dark:border-white/10 bg-white dark:bg-white/5'}`}>
                                                      {isSelected && <Check size={8} className="text-white" strokeWidth={4} />}
                                                  </div>
                                                  <div className="flex-1 min-w-0 flex flex-col gap-0.5">
                                                      {/* Row 1: teacher ID + name */}
                                                      <div className="flex items-center gap-1.5">
                                                          <span className={`font-mono text-[9px] font-black shrink-0 px-1.5 py-0.5 rounded ${isSelected ? 'bg-white/20 text-white' : 'bg-slate-200 dark:bg-white/5 text-slate-500 dark:text-slate-400'}`}>
                                                              {item.responsibleTeacherIds.map(id => teacherMap?.[id]?.teacherId || "N/A").join(", ")}
                                                          </span>
                                                          <span className={`text-[11px] font-black truncate ${isSelected ? 'text-white' : 'text-slate-800 dark:text-white'}`}>
                                                              {item.responsibleTeacherIds.map(id => teacherMap?.[id]?.name || id).join(", ") || "ไม่ระบุครู"}
                                                          </span>
                                                      </div>
                                                      {/* Row 2: course + classLevels + period + scope */}
                                                      <div className="flex items-center gap-1.5 flex-wrap">
                                                          <span className={`text-[9px] font-bold flex items-center gap-1 ${isSelected ? 'text-indigo-100' : 'text-slate-500 dark:text-slate-400'}`}>
                                                              <BookOpen size={9} /> {item.courseCode} {item.name}
                                                          </span>
                                                          {extractClassLevels(item.classId).map(lvl => (
                                                              <span key={lvl} className={`text-[8px] font-black px-1.5 py-0.5 rounded ${isSelected ? 'bg-white/20 text-white' : 'bg-emerald-100 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-400'}`}>{CLASS_LEVEL_NAMES[lvl] || lvl}</span>
                                                          ))}
                                                          <span className={`text-[9px] font-bold flex items-center gap-0.5 ${isSelected ? 'text-indigo-200' : 'text-teal-600 dark:text-teal-400'}`}>
                                                              <Clock size={9} /> {item.specialPeriodTitle}
                                                          </span>
                                                      </div>
                                                  </div>
                                              </div>
                                          );
                                      })}
                                  </div>
                              </>
                          ) : (
                              <div className="h-full flex flex-col items-center justify-center text-slate-400 dark:text-slate-500 space-y-2">
                                  <Database size={32} strokeWidth={1} />
                                  <p className="text-[11px] font-bold">ยังไม่มีข้อมูลการมอบหมาย</p>
                              </div>
                          )}
                      </div>
                  </div>
              </main>
          </div>
      </MainLayout>
  );
};

export default LearnerActivityManagementPage;
