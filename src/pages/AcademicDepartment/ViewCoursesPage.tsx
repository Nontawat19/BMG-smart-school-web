import React, { useState, useEffect, useMemo } from 'react';
import { Link } from 'react-router-dom';
import Select from 'react-select';
import { firestore as db } from '../../firebase';
import { collection, getDocs, doc, updateDoc, deleteDoc, getDoc } from 'firebase/firestore';
import { useSelector, useDispatch } from 'react-redux';
import { RootState } from '@/store';
import MainLayout from "@/layouts/MainLayout";
import { fetchTeachersMap } from '@/store/slices/userMapSlice';
import Swal from 'sweetalert2';
import BackButton from "@/components/Shared/BackButton";
import {
  Search,
  Filter,
  Trash2,
  BookOpen,
  GraduationCap,
  Clock,
  Calendar,
  Users,
  MoreHorizontal,
  LayoutGrid,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  Lock,
  Tag,

  Plus,
  X,
  Check,
  Edit2
} from 'lucide-react';
import { motion } from 'framer-motion';
import { EditCourseModal } from './components/EditCourseModal';
import SkeletonLoader from '@/components/SkeletonLoader';
import { CLASSES, getLevelsByRange } from '@/utils/schoolUtils';
import { usePermissions } from '@/hooks/usePermissions';
import { getActiveSortedTeachers } from '@/utils/teacherSortUtils';

// Interfaces
interface Course {
  id: string;
  title: string;
  code: string;
  classId?: string | string[];
  classLevels?: string[];
  room?: string[];
  roomIds?: string[];
  hoursPerWeek?: number;
  teacherId?: string;
  teacherIds?: string[];
  type?: 'พื้นฐาน' | 'เพิ่มเติม';
  formativeWeight?: number;
  midtermWeight?: number;
  indicators?: string[];
  expectedOutcomes?: string[];
  constraints?: {
    disallowedDays?: string[];
    lockedSlots?: { day: string; periodId: string }[];
  };
  subjectGroup?: string;
  semester?: string;
  isCombined?: boolean;
  isActive?: boolean;
  credits?: number;
  teacherAssignments?: { teacherId: string; roomIds: string[]; classLevels: string[] }[];
}

interface Teacher {
  id: string;
  name: string;
  profileImageUrl?: string;
}


const DAYS_OF_WEEK: Record<string, string> = { mon: 'จันทร์', tue: 'อังคาร', wed: 'พุธ', thu: 'พฤหัสบดี', fri: 'ศุกร์' };


const ViewCoursesPage: React.FC = () => {
  const [courses, setCourses] = useState<Course[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedClassFilter, setSelectedClassFilter] = useState<string>('all');
  const [selectedTeacherFilter, setSelectedTeacherFilter] = useState<string>('all');
  const [selectedRoomFilter, setSelectedRoomFilter] = useState<string>('all');
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(20);
  const [selectedSemester, setSelectedSemester] = useState<string>("1");
  const [availableClassOptions, setAvailableClassOptions] = useState<[string, string][]>([]);
  const [selectedActiveFilter, setSelectedActiveFilter] = useState<string>('all'); // 'all', 'active', 'inactive'
  const [selectedSubjectGroupFilter, setSelectedSubjectGroupFilter] = useState<string>('all');
  const [periodSettings, setPeriodSettings] = useState<any[]>([]);

  // Modal State
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [editingCourse, setEditingCourse] = useState<Course | null>(null);
  const [subjectGroupMap, setSubjectGroupMap] = useState<Record<string, string>>({});
  const [subjectGroupsList, setSubjectGroupsList] = useState<any[]>([]);
  const [editingTeacherCourseId, setEditingTeacherCourseId] = useState<string | null>(null);
  const [teacherSearch, setTeacherSearch] = useState("");

  const [isUpdatingTeacher, setIsUpdatingTeacher] = useState(false);

  const currentUser = useSelector((state: RootState) => state.auth.user);
  const schoolId = (currentUser as any)?.schoolId;
  const dispatch = useDispatch();
  const { hasRole, ACADEMIC_MANAGEMENT } = usePermissions();
  const canManage = hasRole(ACADEMIC_MANAGEMENT);

  const isDark = document.documentElement.classList.contains('dark');

  const handleToggleActive = async (courseId: string, isActive: boolean) => {
    if (!schoolId) return;
    try {
      await updateDoc(doc(db, 'school-settings', schoolId, 'courses', courseId), { isActive });
      setCourses(prev => prev.map(c => c.id === courseId ? { ...c, isActive } : c));

      Swal.fire({
        icon: 'success', title: isActive ? 'เปิดใช้งานวิชา' : 'ปิดใช้งานวิชา', timer: 1000, showConfirmButton: false,
        toast: true, position: 'top-end', background: '#2a2b2f', color: '#ffffff'
      });
    } catch (error) {
      console.error(error);
      Swal.fire('Error', 'ไม่สามารถปรับปรุงสถานะวิชาได้', 'error');
    }
  };
  const premiumStyles = {
    control: (base: any, state: any) => ({
      ...base,
      backgroundColor: isDark ? 'rgba(30, 31, 33, 0.5)' : 'rgba(255, 255, 255, 0.5)',
      backdropFilter: 'blur(8px)',
      borderColor: state.isFocused ? '#4f46e5' : isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)',
      borderRadius: '12px',
      fontSize: '9px',
      minHeight: '26px',
      boxShadow: state.isFocused ? '0 0 0 2px rgba(79, 70, 229, 0.1)' : 'none',
      transition: 'all 0.2s ease',
      '&:hover': {
        borderColor: '#4f46e5',
        backgroundColor: isDark ? 'rgba(30, 31, 33, 0.8)' : 'rgba(255, 255, 255, 0.8)',
      }
    }),
    menu: (base: any) => ({
      backdropFilter: 'blur(12px)',
      border: isDark ? '1px solid rgba(255,255,255,0.1)' : '1px solid rgba(0,0,0,0.05)',
      borderRadius: '14px',
      overflow: 'hidden',
      zIndex: 100,
      fontSize: '9px',
      minWidth: '120px',
      boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.15), 0 10px 10px -5px rgba(0, 0, 0, 0.1)',
      padding: '2px'
    }),
    menuPortal: (base: any) => ({
      ...base,
      zIndex: 9999
    }),
    option: (base: any, state: any) => ({
      ...base,
      backgroundColor: state.isSelected ? '#4f46e5' : state.isFocused ? isDark ? 'rgba(255, 255, 255, 0.05)' : 'rgba(79, 70, 229, 0.05)' : 'transparent',
      color: state.isSelected ? 'white' : isDark ? '#d1d5db' : '#374151',
      fontSize: '9px',
      padding: '6px 10px',
      borderRadius: '8px',
      margin: '1px 0',
      transition: 'all 0.15s ease',
      fontWeight: state.isSelected ? '700' : '500',
      '&:active': { backgroundColor: '#4f46e5' }
    }),
    multiValue: (base: any) => ({
      ...base,
      backgroundColor: isDark ? 'rgba(79, 70, 229, 0.15)' : 'rgba(79, 70, 229, 0.1)',
      borderRadius: '6px',
      padding: '0px 4px',
      margin: '1px',
      border: 'none',
      display: 'inline-flex',
      alignItems: 'center'
    }),
    multiValueLabel: (base: any) => ({
      ...base,
      color: '#6366f1',
      fontSize: '8px',
      fontWeight: '800',
      padding: '1px 2px',
      letterSpacing: '0.02em'
    }),
    multiValueRemove: (base: any) => ({
      ...base,
      color: '#9ca3af',
      ':hover': { backgroundColor: '#ef4444', color: 'white', borderRadius: '4px' },
    }),
    placeholder: (base: any) => ({ ...base, color: isDark ? 'rgba(255,255,255,0.3)' : 'rgba(0,0,0,0.3)' }),
    input: (base: any) => ({ ...base, color: isDark ? 'white' : 'black' }),
    singleValue: (base: any) => ({ ...base, color: isDark ? 'white' : 'black' })
  };

  // Use teachers map from Redux store
  const { teachers: teacherMap, status: teacherMapStatus } = useSelector((state: RootState) => state.userMap);

  // ✅ ดึง subject groups จาก Redux
  const reduxSubjectGroups = useSelector((state: RootState) => state.subjectGroups.groups);
  useEffect(() => {
    if (reduxSubjectGroups.length > 0) {
      const mapping: Record<string, string> = {};
      reduxSubjectGroups.forEach(g => {
        if (g.code) mapping[g.code] = g.name;
        mapping[g.id] = g.name;
      });
      setSubjectGroupMap(mapping);
      setSubjectGroupsList(reduxSubjectGroups);
    }
  }, [reduxSubjectGroups]);

  // ✅ ดึง period settings จาก Redux
  const reduxPeriodSettings = useSelector((state: RootState) => state.periodSettings);
  useEffect(() => {
    if (reduxPeriodSettings.status === 'succeeded') {
      const teaching = reduxPeriodSettings.periods.filter((p: any) => p.isTeaching || p.isTeachingPeriod);
      setPeriodSettings(teaching.length > 0 ? teaching : reduxPeriodSettings.periods);
    }
  }, [reduxPeriodSettings.status, reduxPeriodSettings.periods]);

  // ✅ ดึง school settings (availableClassOptions) จาก Redux
  const reduxSchoolSettings = useSelector((state: RootState) => state.schoolSettings);
  useEffect(() => {
    if (reduxSchoolSettings.status === 'succeeded' && reduxSchoolSettings.availableClassOptions.length > 0) {
      setAvailableClassOptions(reduxSchoolSettings.availableClassOptions);
    }
  }, [reduxSchoolSettings.status, reduxSchoolSettings.availableClassOptions]);

  // ✅ ดึง calendar (ภาคเรียนปัจจุบัน) จาก Redux
  const reduxCalendar = useSelector((state: RootState) => state.calendar);
  useEffect(() => {
    if (reduxCalendar.status === 'succeeded' && reduxCalendar.terms.length > 0) {
      const today = new Date().toISOString().split('T')[0];
      const currentTerm = reduxCalendar.terms.find(t => 
        t.startDate && t.endDate && today >= t.startDate && today <= t.endDate
      );
      if (currentTerm) {
        setSelectedSemester(currentTerm.id === 'term1' ? '1' : '2');
      }
    }
  }, [reduxCalendar.status, reduxCalendar.rawData]);

  // Sync Teacher Processing Logic from CourseEnrollmentPage.tsx
  const teachers = useMemo(() => getActiveSortedTeachers(Object.values(teacherMap || {})).map(t => {
    const anyT = t as any;
    let groupName = anyT.subjectGroup || anyT.learningArea || "ทั่วไป"; // Check learningArea as fallback

    // Try to resolve from ID if name isn't directly available or to Ensure consistency
    if (anyT.subjectGroupId && subjectGroupsList.length > 0) {
      const found = subjectGroupsList.find((g: any) => g.id === anyT.subjectGroupId);
      if (found) groupName = found.name;
    }

    // Shorten long names
    if (groupName === "วิทยาศาสตร์และเทคโนโลยี") groupName = "วิทย์ฯ";
    else if (groupName === "สังคมศึกษา ศาสนา และวัฒนธรรม") groupName = "สังคมฯ";
    else if (groupName === "การงานอาชีพ") groupName = "การงานฯ";
    else if (groupName === "สุขศึกษาและพลศึกษา") groupName = "สุขศึกษาฯ";
    else if (groupName === "ภาษาต่างประเทศ") groupName = "ตปท.";
    else if (groupName === "กิจกรรมพัฒนาผู้เรียน") groupName = "กิจกรรมฯ";

    return {
      id: t.id,
      teacherId: t.teacherId || "", // Ensure string
      name: t.name,
      subjectGroup: groupName,
      department: anyT.department, // Pass department if available
      profileImageUrl: t.profileImageUrl
    };
  }), [teacherMap, subjectGroupsList]);

  useEffect(() => {
    if (!schoolId) return;

    const fetchData = async () => {
      setLoading(true);
      try {
        const coursesCollectionRef = collection(db, 'school-settings', schoolId, 'courses');
        const coursesSnapshot = await getDocs(coursesCollectionRef);
        const coursesData = coursesSnapshot.docs.map(doc => ({
          id: doc.id,
          isActive: doc.data().isActive ?? true, // Default to true if not present
          ...doc.data()
        } as Course));

        coursesData.sort((a, b) => {
          const classA = Array.isArray(a.classId) ? (a.classId[0] || '') : (a.classId || '');
          const classB = Array.isArray(b.classId) ? (b.classId[0] || '') : (b.classId || '');
          const classCompare = classA.localeCompare(classB);
          if (classCompare !== 0) return classCompare;
          return a.title.localeCompare(b.title);
        });

        setCourses(coursesData);
      } catch (error) {
        console.error("Error fetching data: ", error);
        Swal.fire('เกิดข้อผิดพลาด', 'ไม่สามารถดึงข้อมูลหลักสูตรได้', 'error');
      } finally {
        setLoading(false);
      }
    };

    const fetchPeriodSettings = async () => {
      try {
        const docRef = doc(db, 'school-settings', schoolId, 'configs', 'schedule_settings');
        const docSnap = await getDoc(docRef);
        if (docSnap.exists() && docSnap.data().periods) {
          setPeriodSettings(docSnap.data().periods.filter((p: any) => p.isTeachingPeriod));
        } else {
          const defaultPeriods = [
            { id: 'period-1', label: 'คาบที่ 1', startTime: '08.40', endTime: '09.30', isTeachingPeriod: true },
            { id: 'period-2', label: 'คาบที่ 2', startTime: '09.30', endTime: '10.20', isTeachingPeriod: true },
            { id: 'period-3', label: 'คาบที่ 3', startTime: '10.20', endTime: '11.10', isTeachingPeriod: true },
            { id: 'period-4', label: 'คาบที่ 4', startTime: '11.10', endTime: '12.00', isTeachingPeriod: true },
            { id: 'period-5', label: 'คาบที่ 5', startTime: '13.00', endTime: '13.50', isTeachingPeriod: true },
            { id: 'period-6', label: 'คาบที่ 6', startTime: '13.50', endTime: '14.40', isTeachingPeriod: true },
            { id: 'period-7', label: 'คาบที่ 7', startTime: '14.40', endTime: '15.30', isTeachingPeriod: true },
            { id: 'period-8', label: 'คาบที่ 8', startTime: '15.30', endTime: '16.00', isTeachingPeriod: true },
          ];
          setPeriodSettings(defaultPeriods);
        }
      } catch (error) {
        console.error("Error fetching period settings:", error);
      }
    };

    if (selectedClassFilter && selectedClassFilter !== '') {
      fetchData();
    } else {
      setCourses([]);
      setLoading(false);
    }
  }, [schoolId, dispatch, teacherMapStatus, selectedClassFilter]);

  // Reset pagination when filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, selectedClassFilter, selectedTeacherFilter, selectedRoomFilter, selectedSemester, selectedSubjectGroupFilter]);

  const handleEdit = (course: Course) => {
    setEditingCourse(course);
    setIsEditModalOpen(true);
  };

  const handleSaveCourse = async (updatedCourse: Course) => {
    if (!schoolId || !updatedCourse.id) return;

    try {
      const courseRef = doc(db, 'school-settings', schoolId, 'courses', updatedCourse.id);

      // Clean up data based on type
      const dataToUpdate: any = { ...updatedCourse };
      if (dataToUpdate.type === 'พื้นฐาน') {
        delete dataToUpdate.expectedOutcomes;
      } else {
        delete dataToUpdate.indicators;
      }

      await updateDoc(courseRef, dataToUpdate);
      setCourses(courses.map(c => c.id === updatedCourse.id ? { ...c, ...dataToUpdate } : c));
      Swal.fire({
        icon: 'success',
        title: 'บันทึกสำเร็จ!',
        text: 'ข้อมูลหลักสูตรถูกอัปเดตแล้ว',
        timer: 1500,
        showConfirmButton: false
      });
    } catch (error) {
      console.error("Error updating course: ", error);
      Swal.fire('เกิดข้อผิดพลาด', 'ไม่สามารถอัปเดตข้อมูลได้', 'error');
    }
  };

  const handleDelete = async (courseId: string) => {
    const result = await Swal.fire({
      title: 'ต้องการลบหลักสูตรนี้?', text: "การกระทำนี้ไม่สามารถย้อนกลับได้!", icon: 'warning', showCancelButton: true,
      confirmButtonColor: '#d33', cancelButtonColor: '#3085d6', confirmButtonText: 'ใช่, ลบเลย!', cancelButtonText: 'ยกเลิก',
      background: '#2a2b2f', color: '#ffffff'
    });

    if (result.isConfirmed) {
      try {
        await deleteDoc(doc(db, 'school-settings', schoolId!, 'courses', courseId));
        setCourses(courses.filter(c => c.id !== courseId));
        Swal.fire('ลบสำเร็จ!', 'หลักสูตรถูกลบออกจากระบบแล้ว', 'success');
      } catch (error) {
        console.error("Error deleting course: ", error);
        Swal.fire('เกิดข้อผิดพลาด', 'ไม่สามารถลบข้อมูลได้', 'error');
      }
    }
  };

  const handleTeacherChange = async (courseId: string, newTeacherIds: any) => {
    if (!schoolId) return;
    setIsUpdatingTeacher(true);
    try {
      const ids = Array.isArray(newTeacherIds) ? newTeacherIds.map((o: any) => o.value) : (newTeacherIds ? [newTeacherIds.value] : []);
      const primaryTeacherId = ids.length > 0 ? ids[0] : "";

      const courseRef = doc(db, 'school-settings', schoolId, 'courses', courseId);

      const course = courses.find(c => c.id === courseId);
      let updates: any = {
        teacherIds: ids,
        teacherId: primaryTeacherId
      };

      // Sync teacherAssignments if they exist
      if (course?.teacherAssignments) {
        const newAssignments = ids.map((tid: string) => {
          const existing = course.teacherAssignments?.find(a => a.teacherId === tid);
          return existing || { teacherId: tid, roomIds: [], classLevels: [] };
        });
        updates.teacherAssignments = newAssignments;
      }

      await updateDoc(courseRef, updates);

      setCourses(prev => prev.map(c => c.id === courseId ? { ...c, ...updates } : c));
      setEditingTeacherCourseId(null);

      Swal.fire({
        icon: 'success',
        title: 'อัปเดตครูผู้สอนสำเร็จ',
        toast: true,
        position: 'top-end',
        showConfirmButton: false,
        timer: 1500,
        background: '#2a2b2f',
        color: '#ffffff'
      });
    } catch (error) {
      console.error("Error updating teacher:", error);
      Swal.fire('เกิดข้อผิดพลาด', 'ไม่สามารถอัปเดตรายชื่อครูได้', 'error');
    } finally {
      setIsUpdatingTeacher(false);
    }
  };

  const handleUpdateCourseRooms = async (courseId: string, roomIds: string[], teacherId?: string) => {
    if (!schoolId) return;
    try {
      const course = courses.find(c => c.id === courseId);
      if (!course) return;

      let updates: any = {};

      if (teacherId) {
        const currentAssignments = course.teacherAssignments || [];
        const targetIdx = currentAssignments.findIndex(a => a.teacherId === teacherId);
        let newAssignments = [...currentAssignments];

        if (targetIdx >= 0) {
          newAssignments[targetIdx] = { ...newAssignments[targetIdx], roomIds };
        } else {
          newAssignments.push({ teacherId, roomIds, classLevels: [] });
        }

        updates.teacherAssignments = newAssignments;
        const allRooms = new Set<string>();
        newAssignments.forEach(a => a.roomIds.forEach(r => allRooms.add(r)));
        updates.roomIds = Array.from(allRooms);
        updates.room = updates.roomIds; // Backwards compatibility with the 'room' field in some parts
      } else {
        updates.room = roomIds;
        updates.roomIds = roomIds;

        // Sync all existing teacher assignments to match global
        if (course.teacherAssignments && course.teacherAssignments.length > 0) {
          const newAssignments = course.teacherAssignments.map(a => ({
            ...a,
            roomIds: roomIds // Force sync
          }));
          updates.teacherAssignments = newAssignments;
        }
      }

      await updateDoc(doc(db, 'school-settings', schoolId, 'courses', courseId), updates);

      setCourses(prev => prev.map(c =>
        c.id === courseId ? { ...c, ...updates } : c
      ));

      Swal.fire({
        icon: 'success', title: 'อัปเดตห้องเรียนสำเร็จ', timer: 1000, showConfirmButton: false,
        toast: true, position: 'top-end', background: '#2a2b2f', color: '#ffffff'
      });
    } catch (error) {
      console.error(error);
      Swal.fire('Error', 'ไม่สามารถอัปเดตห้องเรียนได้', 'error');
    }
  };

  const handleUpdateCourseLevels = async (courseId: string, classLevels: string[], teacherId?: string) => {
    if (!schoolId) return;
    try {
      const course = courses.find(c => c.id === courseId);
      if (!course) return;

      let updates: any = {};

      if (teacherId) {
        const currentAssignments = course.teacherAssignments || [];
        const targetIdx = currentAssignments.findIndex(a => a.teacherId === teacherId);
        let newAssignments = [...currentAssignments];

        if (targetIdx >= 0) {
          newAssignments[targetIdx] = { ...newAssignments[targetIdx], classLevels };
        } else {
          newAssignments.push({ teacherId, classLevels, roomIds: [] });
        }

        updates.teacherAssignments = newAssignments;
        const allLevels = new Set<string>();
        newAssignments.forEach(a => a.classLevels.forEach(l => allLevels.add(l)));
        updates.classLevels = Array.from(allLevels);
        updates.classId = updates.classLevels; // Sync with classId for filtering
      } else {
        updates.classId = classLevels;
        updates.classLevels = classLevels;

        // Sync all existing assignments
        if (course.teacherAssignments && course.teacherAssignments.length > 0) {
          const newAssignments = course.teacherAssignments.map(a => ({
            ...a,
            classLevels: classLevels
          }));
          updates.teacherAssignments = newAssignments;
        }
      }

      await updateDoc(doc(db, 'school-settings', schoolId, 'courses', courseId), updates);

      setCourses(prev => prev.map(c =>
        c.id === courseId ? { ...c, ...updates } : c
      ));

      Swal.fire({
        icon: 'success', title: 'อัปเดตชั้นเรียนสำเร็จ', timer: 1000, showConfirmButton: false,
        toast: true, position: 'top-end', background: '#2a2b2f', color: '#ffffff'
      });
    } catch (error) {
      console.error(error);
      Swal.fire('Error', 'ไม่สามารถอัปเดตชั้นเรียนได้', 'error');
    }
  };

  const handleToggleCombined = async (courseId: string, isCombined: boolean) => {
    if (!schoolId) return;
    try {
      await updateDoc(doc(db, 'school-settings', schoolId, 'courses', courseId), { isCombined });
      setCourses(prev => prev.map(c => c.id === courseId ? { ...c, isCombined } : c));

      Swal.fire({
        icon: 'success', title: isCombined ? 'เปิดโหมดสอนรวม' : 'โหมดสอนปกติ', timer: 1000, showConfirmButton: false,
        toast: true, position: 'top-end', background: '#2a2b2f', color: '#ffffff'
      });
    } catch (error) {
      console.error(error);
      Swal.fire('Error', 'ไม่สามารถปรับปรุงการตั้งค่าสอนรวมห้องได้', 'error');
    }
  };



  const handleTeacherToggle = async (courseId: string, teacherId: string, currentIds: string[]) => {
    if (!schoolId) return;
    setIsUpdatingTeacher(true);
    try {
      let newIds;
      if (currentIds.includes(teacherId)) {
        newIds = currentIds.filter(id => id !== teacherId);
      } else {
        newIds = [...currentIds, teacherId];
      }

      const courseRef = doc(db, 'school-settings', schoolId, 'courses', courseId);
      const updateData: any = { teacherIds: newIds };
      if (newIds.length > 0) updateData.teacherId = newIds[0];
      else updateData.teacherId = "";

      // Sync teacherAssignments
      const course = courses.find(c => c.id === courseId);
      if (course) {
        let newAssignments = [...(course.teacherAssignments || [])];
        if (currentIds.includes(teacherId)) {
          // Remove
          newAssignments = newAssignments.filter(a => a.teacherId !== teacherId);
        } else {
          // Add default
          newAssignments.push({
            teacherId: teacherId,
            classLevels: Array.isArray(course.classId) ? course.classId : (course.classId ? [course.classId] : []),
            roomIds: course.room || []
          });
        }
        updateData.teacherAssignments = newAssignments;
      }

      await updateDoc(courseRef, updateData);
      setCourses(prev => prev.map(c => c.id === courseId ? { ...c, ...updateData } : c));
    } catch (error) {
      console.error("Error toggling teacher:", error);
    } finally {
      setIsUpdatingTeacher(false);
    }
  };

  const teacherOptions = useMemo(() => {
    return teachers.map(t => ({
      value: t.id,
      label: `[${t.teacherId || 'N/A'}] ${t.name}`,
      teacher: t
    }));
  }, [teachers]);

  const filteredCourses = useMemo(() => {
    return courses.filter(course => {
      const searchLower = searchTerm.toLowerCase();
      const matchesSearch =
        course.title.toLowerCase().includes(searchLower) ||
        course.code.toLowerCase().includes(searchLower) ||
        (teacherMap[course.teacherId || '']?.name || '').toLowerCase().includes(searchLower);

      const matchesClass = selectedClassFilter === 'all' ||
        (() => {
          const courseClasses = Array.isArray(course.classId) ? course.classId : (course.classId ? [course.classId] : []);
          if (selectedClassFilter === 'junior_high') {
            return courseClasses.some(c => ['m1', 'm2', 'm3'].includes(c));
          }
          if (selectedClassFilter === 'senior_high') {
            return courseClasses.some(c => ['m4', 'm5', 'm6'].includes(c));
          }
          return courseClasses.includes(selectedClassFilter);
        })();

      const matchesTeacher = selectedTeacherFilter === 'all' ||
        course.teacherId === selectedTeacherFilter ||
        course.teacherIds?.includes(selectedTeacherFilter) ||
        course.teacherAssignments?.some(a => a.teacherId === selectedTeacherFilter);

      const matchesRoom = selectedRoomFilter === 'all' ||
        (course.room && (course.room.includes(selectedRoomFilter) || course.room.includes('all')));

      const matchesSemester = course.semester === selectedSemester || !course.semester; // Filter by semester

      const matchesSubjectGroup = selectedSubjectGroupFilter === 'all' ||
        course.subjectGroup === selectedSubjectGroupFilter ||
        (course.subjectGroup && subjectGroupMap[course.subjectGroup] === selectedSubjectGroupFilter) ||
        (subjectGroupMap[selectedSubjectGroupFilter] === (subjectGroupMap[course.subjectGroup || ''] || course.subjectGroup));

      const matchesActive = selectedActiveFilter === 'all' || 
        (selectedActiveFilter === 'active' && course.isActive) ||
        (selectedActiveFilter === 'inactive' && !course.isActive);

      return matchesSearch && matchesClass && matchesTeacher && matchesRoom && matchesSemester && matchesSubjectGroup && matchesActive;
    });
  }, [courses, searchTerm, selectedClassFilter, selectedTeacherFilter, teacherMap, selectedRoomFilter, selectedSemester, selectedSubjectGroupFilter, subjectGroupMap, selectedActiveFilter]);

  // Statistics Analysis
  const { totalCourses, totalHours, totalCredits, uniqueTeachers } = useMemo(() => {
    let hoursSum = 0;
    let creditsSum = 0;
    let academicCoursesCount = 0;
    const teachersSet = new Set();

    filteredCourses.forEach(course => {
      // ตรวจสอบว่าเป็นกิจกรรมพัฒนาผู้เรียนหรือไม่ (มักไม่มีหน่วยกิต และอยู่ในกลุ่มกิจกรรม)
      const group = course.subjectGroup || "";
      const groupName = (subjectGroupMap[group] || group).toLowerCase();
      
      const isActivity = 
        groupName.includes("กิจกรรม") || 
        groupName.includes("แนะแนว") || 
        groupName.includes("ชุมนุม") ||
        groupName.includes("homeroom") ||
        groupName.includes("act") ||
        course.title.includes("กิจกรรม") ||
        course.title.includes("ชุมนุม");

      // ถ้าเป็นกิจกรรม ไม่นำมานับรวมในภาระงานสอนและหน่วยกิตหลัก
      if (isActivity) return;

      const c = Number(course.credits || 0);
      const h = course.credits ? Math.round(c * 2) : Number(course.hoursPerWeek || 0);
      
      creditsSum += c;
      hoursSum += h;
      academicCoursesCount++;
      if (course.teacherId) teachersSet.add(course.teacherId);
    });

    return {
      totalCourses: academicCoursesCount,
      totalHours: hoursSum,
      totalCredits: creditsSum,
      uniqueTeachers: teachersSet.size
    };
  }, [filteredCourses, subjectGroupMap]);

  // Pagination Logic
  const indexOfLastItem = currentPage * itemsPerPage;
  const indexOfFirstItem = indexOfLastItem - itemsPerPage;
  const currentCourses = filteredCourses.slice(indexOfFirstItem, indexOfLastItem);
  const totalPages = Math.ceil(filteredCourses.length / itemsPerPage);

  return (
    <MainLayout>
      <div className="px-3 sm:px-4 md:px-6 lg:px-8 py-4 sm:py-6 lg:py-8 min-h-screen bg-gray-50 dark:bg-gray-900 text-gray-900 dark:text-white transition-colors duration-300">
        <div className="page-container">

          {/* Header Section */}
          <div className="flex items-center gap-4 mb-8">
            <BackButton to="/academic/hub/registration" />
            <div>
              <h1 className="text-2xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
                <BookOpen className="text-indigo-600 dark:text-indigo-400" size={28} />
                ทำเนียบหลักสูตร
              </h1>
              <p className="text-gray-500 dark:text-gray-400 mt-1 text-sm">จัดการและตรวจสอบรายวิชาทั้งหมดในโรงเรียน</p>
            </div>
          </div>

          {/* Stats Cards */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
            <div className="group bg-white dark:bg-[#2a2b2f] rounded-xl p-4 shadow-sm border border-gray-100 dark:border-gray-700 flex items-center gap-4 transition-all duration-300 hover:-translate-y-1 hover:shadow-md">
              <div className="p-2.5 rounded-lg bg-blue-100 text-blue-600 dark:bg-blue-500/20 dark:text-blue-400 transition-transform duration-300 group-hover:scale-110 group-hover:rotate-[-6deg]">
                <LayoutGrid size={20} />
              </div>
              <div>
                <p className="text-[10px] uppercase tracking-wider text-gray-500 dark:text-gray-400 font-bold">รายวิชาทั้งหมด</p>
                <h3 className="text-xl font-black text-gray-900 dark:text-white leading-none mt-1">{totalCourses.toLocaleString()} <span className="text-[10px] font-medium text-gray-400 uppercase">วิชา</span></h3>
              </div>
            </div>

            <div className="group bg-white dark:bg-[#2a2b2f] rounded-xl p-4 shadow-sm border border-gray-100 dark:border-gray-700 flex items-center gap-4 transition-all duration-300 hover:-translate-y-1 hover:shadow-md">
              <div className="p-2.5 rounded-lg bg-amber-100 text-amber-600 dark:bg-amber-500/20 dark:text-amber-400 transition-transform duration-300 group-hover:scale-110 group-hover:rotate-[-6deg]">
                <GraduationCap size={20} />
              </div>
              <div>
                <p className="text-[10px] uppercase tracking-wider text-gray-500 dark:text-gray-400 font-bold">หน่วยกิตรวม</p>
                <h3 className="text-xl font-black text-gray-900 dark:text-white leading-none mt-1">{totalCredits.toFixed(1)} <span className="text-[10px] font-medium text-gray-400 uppercase">นก.</span></h3>
              </div>
            </div>

            <div className="group bg-white dark:bg-[#2a2b2f] rounded-xl p-4 shadow-sm border border-gray-100 dark:border-gray-700 flex items-center gap-4 transition-all duration-300 hover:-translate-y-1 hover:shadow-md">
              <div className="p-2.5 rounded-lg bg-emerald-100 text-emerald-600 dark:bg-emerald-500/20 dark:text-emerald-400 transition-transform duration-300 group-hover:scale-110 group-hover:rotate-[-6deg]">
                <Clock size={20} />
              </div>
              <div>
                <p className="text-[10px] uppercase tracking-wider text-gray-500 dark:text-gray-400 font-bold">ภาระการสอนรวม</p>
                <h3 className="text-xl font-black text-gray-900 dark:text-white leading-none mt-1">{totalHours.toLocaleString()} <span className="text-[10px] font-medium text-gray-400 uppercase">คาบ/สัปดาห์</span></h3>
              </div>
            </div>

            <div className="group bg-white dark:bg-[#2a2b2f] rounded-xl p-4 shadow-sm border border-gray-100 dark:border-gray-700 flex items-center gap-4 transition-all duration-300 hover:-translate-y-1 hover:shadow-md">
              <div className="p-2.5 rounded-lg bg-purple-100 text-purple-600 dark:bg-purple-500/20 dark:text-purple-400 transition-transform duration-300 group-hover:scale-110 group-hover:rotate-[-6deg]">
                <Users size={20} />
              </div>
              <div>
                <p className="text-[10px] uppercase tracking-wider text-gray-500 dark:text-gray-400 font-bold">บุคลากรผู้สอน</p>
                <h3 className="text-xl font-black text-gray-900 dark:text-white leading-none mt-1">{uniqueTeachers} <span className="text-[10px] font-medium text-gray-400 uppercase">คน</span></h3>
              </div>
            </div>
          </div>

          {/* Filters & Search */}
          <div className="sticky top-[60px] z-30 bg-white/95 dark:bg-[#2a2b2f]/95 backdrop-blur-sm rounded-xl p-4 shadow-sm border border-gray-100 dark:border-gray-700 mb-6">
            <div className="flex flex-col xl:flex-row gap-4">
              <div className="flex-1 relative min-w-full xl:min-w-0">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={16} />
                <input
                  type="text"
                  placeholder="ค้นหาชื่อวิชา, รหัสวิชา, ครู..."
                  value={searchTerm}
                  onChange={e => setSearchTerm(e.target.value)}
                  className="pl-9 pr-4 py-2.5 w-full text-sm bg-gray-50 dark:bg-[#1e1f21] border border-gray-200 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none transition-all font-medium"
                />
              </div>
              
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 xl:flex xl:flex-row gap-3 w-full xl:w-auto">
                <div className="relative">
                  <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={16} />
                  <select
                    value={selectedSemester}
                    onChange={(e) => setSelectedSemester(e.target.value)}
                    className="pl-9 pr-8 py-2 w-full text-[11px] bg-gray-50 dark:bg-[#1e1f21] border border-gray-200 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none appearance-none cursor-pointer font-bold"
                  >
                    <option value="1">ภาคเรียนที่ 1</option>
                    <option value="2">ภาคเรียนที่ 2</option>
                  </select>
                  <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" size={12} />
                </div>

                <div className="relative">
                  <Filter className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={16} />
                  <select
                    value={selectedClassFilter}
                    onChange={(e) => setSelectedClassFilter(e.target.value)}
                    className="pl-9 pr-8 py-2 w-full text-[11px] bg-gray-50 dark:bg-[#1e1f21] border border-gray-200 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none appearance-none cursor-pointer font-bold"
                  >
                    <option value="all">ทุกระดับชั้น</option>
                    {availableClassOptions.map(([key, name]: [string, string]) => (
                      <option key={key} value={key}>{name}</option>
                    ))}
                  </select>
                  <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" size={12} />
                </div>



                <div className="relative">
                  <Users className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={16} />
                  <select
                    value={selectedTeacherFilter}
                    onChange={(e) => setSelectedTeacherFilter(e.target.value)}
                    className="pl-9 pr-8 py-2 w-full text-[11px] bg-gray-50 dark:bg-[#1e1f21] border border-gray-200 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none appearance-none cursor-pointer font-bold"
                  >
                    <option value="all">ครูทุกคน</option>
                    {teachers.map(t => (
                      <option key={t.id} value={t.id}>{t.name}</option>
                    ))}
                  </select>
                  <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" size={12} />
                </div>

                <div className="relative col-span-2 md:col-span-1 xl:min-w-[180px]">
                  <Tag className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={16} />
                  <select
                    value={selectedSubjectGroupFilter}
                    onChange={(e) => setSelectedSubjectGroupFilter(e.target.value)}
                    className="pl-9 pr-8 py-2 w-full text-[11px] bg-gray-50 dark:bg-[#1e1f21] border border-gray-200 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none appearance-none cursor-pointer font-bold"
                  >
                    <option value="all">ทุกกลุ่มสาระฯ</option>
                    {subjectGroupsList.map(group => (
                      <option key={group.id} value={group.code || group.id}>
                        {group.name.replace("กลุ่มสาระการเรียนรู้", "").trim()}
                      </option>
                    ))}
                  </select>
                  <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" size={12} />
                </div>

                <div className="relative">
                  <Filter className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={16} />
                  <select
                    value={selectedActiveFilter}
                    onChange={(e) => setSelectedActiveFilter(e.target.value)}
                    className="pl-9 pr-8 py-2 w-full text-[11px] bg-gray-50 dark:bg-[#1e1f21] border border-gray-200 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none appearance-none cursor-pointer font-bold"
                  >
                    <option value="all">ทุกสถานะ</option>
                    <option value="active">เปิดใช้งาน</option>
                    <option value="inactive">ปิดใช้งาน</option>
                  </select>
                  <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" size={12} />
                </div>

              </div>
            </div>
          </div>

          <div className="bg-white dark:bg-[#2a2b2f] rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 overflow-hidden">
            {loading ? (
              <div className="table-responsive border-b border-gray-100 dark:border-gray-700">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-gray-50/50 dark:bg-white/5 border-b border-gray-100 dark:border-gray-700">
                      {[...Array(9)].map((_, i) => (
                        <th key={i} className="px-6 py-4 text-xs font-semibold">
                          <SkeletonLoader height="1rem" width="80%" className="opacity-50" />
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
                    {[...Array(8)].map((_, i) => (
                      <tr key={i} className="hover:bg-gray-50 dark:hover:bg-white/5 transition-colors">
                        <td className="px-4 py-3"><SkeletonLoader width="1.5rem" /></td>
                        <td className="px-4 py-3"><SkeletonLoader width="10rem" /></td>
                        <td className="px-4 py-3"><SkeletonLoader width="5rem" /></td>
                        <td className="px-4 py-3"><SkeletonLoader width="7rem" /></td>
                        <td className="px-4 py-3"><SkeletonLoader width="3rem" /></td>
                        <td className="px-4 py-3"><SkeletonLoader width="3rem" /></td>
                        <td className="px-4 py-3"><SkeletonLoader width="3rem" /></td>
                        <td className="px-4 py-3"><SkeletonLoader width="2rem" /></td>
                        <td className="px-4 py-3 text-right"><SkeletonLoader width="4rem" /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <>
                <div className="table-responsive border-b border-gray-100 dark:border-gray-700">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="bg-gray-50/50 dark:bg-white/5 border-b border-gray-100 dark:border-gray-700">
                        <th className="px-4 py-3 font-semibold text-gray-600 dark:text-gray-300 text-xs">ลำดับที่</th>
                        <th className="px-4 py-3 font-semibold text-gray-600 dark:text-gray-300 text-xs">ชื่อวิชา</th>
                        <th className="px-4 py-3 font-semibold text-gray-600 dark:text-gray-300 text-xs">รหัสวิชา</th>
                        <th className="px-4 py-3 font-semibold text-gray-600 dark:text-gray-300 text-xs">กลุ่มสาระฯ</th>
                        <th className="px-4 py-3 font-semibold text-gray-600 dark:text-gray-300 text-xs">ระดับชั้น</th>

                        <th className="px-4 py-3 font-semibold text-gray-600 dark:text-gray-300 text-xs">ประเภท</th>
                        <th className="px-4 py-3 font-semibold text-gray-600 dark:text-gray-300 text-xs text-center">หน่วยกิต</th>
                        <th className="px-4 py-3 font-semibold text-gray-600 dark:text-gray-300 text-xs text-center">คาบ/สัปดาห์</th>
                        <th className="px-4 py-3 font-semibold text-gray-600 dark:text-gray-300 text-xs text-center whitespace-nowrap">สถานะ</th>
                        <th className="px-4 py-3 font-semibold text-gray-600 dark:text-gray-300 text-xs text-right">จัดการ</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
                      {currentCourses.length > 0 ? (
                        currentCourses.map((course) => (
                          <tr key={course.id} className="hover:bg-gray-50 dark:hover:bg-white/5 transition-colors group">
                            <td className="px-4 py-3">
                              <span className="text-xs font-bold text-gray-500 dark:text-gray-400">
                                {(currentPage - 1) * itemsPerPage + filteredCourses.indexOf(course) + 1}
                              </span>
                            </td>
                            <td className="px-4 py-3">
                              <div className="flex items-center gap-2">
                                <div className="font-medium text-gray-900 dark:text-white text-sm">{course.title}</div>

                                {course.constraints?.lockedSlots && course.constraints.lockedSlots.length > 0 && (
                                  <div className="bg-emerald-100 text-emerald-600 dark:bg-emerald-500/10 dark:text-emerald-400 p-0.5 rounded-md" title="กำหนดล็อคคาบสอน">
                                    <Lock size={12} />
                                  </div>
                                )}
                              </div>
                            </td>
                            <td className="px-4 py-3">
                              <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-medium bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300 font-mono">
                                {course.code || '-'}
                              </span>
                            </td>
                            <td className="px-4 py-3">
                              <div className="text-xs text-gray-500 font-medium">
                                {subjectGroupMap[course.subjectGroup || ''] || course.subjectGroup || '-'}
                              </div>
                            </td>
                            <td className="px-4 py-3">
                              <div className="flex flex-wrap gap-1">
                                {Array.isArray(course.classId) ? (
                                  (() => {
                                    const classes = course.classId;
                                    if (classes.length === 0) return null;
                                    return (
                                      <span title={classes.map(c => CLASSES[c] || c).join(', ')} className="inline-flex items-center px-1.5 py-0.5 rounded-full text-[10px] font-medium bg-indigo-50 text-indigo-700 dark:bg-indigo-500/10 dark:text-indigo-400 cursor-help">
                                        {CLASSES[classes[0]] || classes[0]}
                                        {classes.length > 1 && ` (+${classes.length - 1})`}
                                      </span>
                                    );
                                  })()
                                ) : (
                                  <span className="inline-flex items-center px-1.5 py-0.5 rounded-full text-[10px] font-medium bg-indigo-50 text-indigo-700 dark:bg-indigo-500/10 dark:text-indigo-400">
                                    {CLASSES[course.classId || ''] || course.classId}
                                  </span>
                                )}
                              </div>
                              {course.room && course.room.length > 0 && !course.room.includes('all') && (
                                <div className="text-[10px] text-gray-500 mt-1 cursor-help" title={`ห้อง: ${course.room.join(', ')}`}>
                                  ห้อง: {course.room[0]}
                                  {course.room.length > 1 && ` (+${course.room.length - 1})`}
                                </div>
                              )}
                            </td>

                            <td className="px-4 py-3">
                              <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium ${course.type === 'เพิ่มเติม'
                                ? 'bg-orange-50 text-orange-700 dark:bg-orange-500/10 dark:text-orange-400'
                                : 'bg-blue-50 text-blue-700 dark:bg-blue-500/10 dark:text-blue-400'
                                }`}>
                                {course.type || 'พื้นฐาน'}
                              </span>
                            </td>
                            <td className="px-4 py-3 text-center">
                              <span className="font-bold text-indigo-600 dark:text-indigo-400 text-sm">
                                {course.credits !== undefined ? course.credits : (course.hoursPerWeek ? (course.hoursPerWeek / 2) : 0)}
                              </span>
                            </td>
                            <td className="px-4 py-3 text-center">
                              <span className="font-medium text-sm text-gray-900 dark:text-white">
                                {course.credits ? Math.round(Number(course.credits) * 2) : (course.hoursPerWeek || 0)}
                              </span>
                            </td>
                            <td className="px-4 py-3 text-center">
                              <div className="flex items-center justify-center gap-2">
                                <div
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    if (canManage) {
                                      handleToggleActive(course.id, !course.isActive);
                                    }
                                  }}
                                  className={`relative w-9 h-5 rounded-full ${canManage ? 'cursor-pointer' : 'cursor-not-allowed opacity-60'} transition-all duration-300 ease-in-out border ${course.isActive
                                    ? 'bg-emerald-500 border-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.4)]'
                                    : 'bg-gray-200 dark:bg-gray-700 border-gray-300 dark:border-gray-600'
                                    }`}
                                >
                                  <div
                                    className={`absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full transition-transform duration-300 shadow-sm ${course.isActive ? 'translate-x-[16px]' : 'translate-x-0'
                                      }`}
                                  />
                                </div>
                                <span className={`text-[10px] font-bold ${course.isActive ? "text-emerald-600 dark:text-emerald-400" : "text-gray-400"}`}>
                                  {course.isActive ? "เปิด" : "ปิด"}
                                </span>
                              </div>
                            </td>
                            <td className="px-4 py-3 text-right">
                              <div className="flex items-center justify-end gap-2">

                                {canManage && (
                                  <>
                                    <button
                                      onClick={() => handleEdit(course)}
                                      className="p-1.5 text-indigo-600 bg-indigo-50 hover:bg-indigo-100 dark:text-indigo-400 dark:bg-indigo-500/10 dark:hover:bg-indigo-500/20 rounded-lg transition-all shadow-sm transform hover:scale-110"
                                      title="แก้ไข"
                                    >
                                      <Edit2 size={16} />
                                    </button>
                                    <button
                                      onClick={() => handleDelete(course.id)}
                                      className="p-1.5 text-red-600 bg-red-50 hover:bg-red-100 dark:text-red-400 dark:bg-red-500/10 dark:hover:bg-red-500/20 rounded-lg transition-all shadow-sm transform hover:scale-110"
                                      title="ลบ"
                                    >
                                      <Trash2 size={16} />
                                    </button>
                                  </>
                                )}
                              </div>
                            </td>
                          </tr>
                        ))
                      ) : (
                        <tr>
                          <td colSpan={9} className="px-6 py-12 text-center text-gray-500 dark:text-gray-400">
                            <div className="flex flex-col items-center justify-center">
                              <div className="w-16 h-16 bg-gray-100 dark:bg-gray-800 rounded-full flex items-center justify-center mb-4">
                                <Search size={24} className="text-gray-400" />
                              </div>
                              <p className="text-lg font-medium">ไม่พบข้อมูลหลักสูตร</p>
                              <p className="text-sm mt-1">ลองปรับตัวกรองหรือคำค้นหาใหม่</p>
                            </div>
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>

                {/* Pagination Controls */}
                <div className="p-4 flex flex-col sm:flex-row justify-between items-center gap-4 bg-white dark:bg-[#2a2b2f]">
                  <div className="text-sm text-gray-500 dark:text-gray-400">
                    แสดง {filteredCourses.length > 0 ? indexOfFirstItem + 1 : 0} ถึง {Math.min(indexOfLastItem, filteredCourses.length)} จาก {filteredCourses.length} รายการ
                  </div>
                  <div className="flex items-center gap-3">
                    <select
                      value={itemsPerPage}
                      onChange={(e) => {
                        setItemsPerPage(Number(e.target.value));
                        setCurrentPage(1);
                      }}
                      className="bg-gray-50 dark:bg-[#1e1f21] border border-gray-200 dark:border-gray-600 text-gray-700 dark:text-gray-300 text-sm rounded-lg focus:ring-indigo-500 focus:border-indigo-500 block p-2 outline-none cursor-pointer"
                    >
                      <option value={10}>10 รายการ</option>
                      <option value={20}>20 รายการ</option>
                      <option value={50}>50 รายการ</option>
                      <option value={100}>100 รายการ</option>
                    </select>

                    <div className="flex flex-wrap items-center justify-center gap-1.5 p-1 bg-gray-50/50 dark:bg-black/20 rounded-xl border border-gray-200/50 dark:border-white/5">
                      <button
                        onClick={() => setCurrentPage(1)}
                        disabled={currentPage === 1}
                        className="px-2.5 py-1.5 rounded-lg border border-transparent hover:border-gray-200 dark:hover:border-white/10 hover:bg-white dark:hover:bg-white/5 disabled:opacity-30 disabled:cursor-not-allowed transition-all text-[10px] font-bold text-gray-600 dark:text-gray-400 flex items-center gap-1"
                        title="หน้าแรก"
                      >
                        <ChevronsLeft size={14} />
                        <span className="hidden sm:inline text-[9px] uppercase tracking-wider">หน้าแรก</span>
                      </button>
                      
                      <button
                        onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))}
                        disabled={currentPage === 1}
                        className="px-2.5 py-1.5 rounded-lg border border-transparent hover:border-gray-200 dark:hover:border-white/10 hover:bg-white dark:hover:bg-white/5 disabled:opacity-30 disabled:cursor-not-allowed transition-all text-[10px] font-bold text-gray-600 dark:text-gray-400 flex items-center gap-1"
                        title="ย้อนกลับ"
                      >
                        <ChevronLeft size={14} />
                        <span className="hidden sm:inline text-[9px] uppercase tracking-wider">ย้อนกลับ</span>
                      </button>

                      <div className="h-4 w-[1px] bg-gray-200 dark:bg-white/10 mx-1" />

                      <div className="flex items-center gap-1">
                        {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                          let pageNum = i + 1;
                          if (totalPages > 5) {
                            const start = Math.max(1, Math.min(currentPage - 2, totalPages - 4));
                            pageNum = start + i;
                          }
                          return (
                            <button
                              key={pageNum}
                              onClick={() => setCurrentPage(pageNum)}
                              className={`w-8 h-8 flex items-center justify-center rounded-lg text-xs font-bold transition-all ${currentPage === pageNum
                                ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-600/20 scale-105'
                                : 'hover:bg-white dark:hover:bg-white/5 text-gray-600 dark:text-gray-400'
                                }`}
                            >
                              {pageNum}
                            </button>
                          );
                        })}
                      </div>

                      <div className="h-4 w-[1px] bg-gray-200 dark:bg-white/10 mx-1" />

                      <button
                        onClick={() => setCurrentPage(prev => Math.min(prev + 1, totalPages))}
                        disabled={currentPage === totalPages || totalPages === 0}
                        className="px-2.5 py-1.5 rounded-lg border border-transparent hover:border-gray-200 dark:hover:border-white/10 hover:bg-white dark:hover:bg-white/5 disabled:opacity-30 disabled:cursor-not-allowed transition-all text-[10px] font-bold text-gray-600 dark:text-gray-400 flex items-center gap-1"
                        title="ถัดไป"
                      >
                        <span className="hidden sm:inline text-[9px] uppercase tracking-wider">ถัดไป</span>
                        <ChevronRight size={14} />
                      </button>

                      <button
                        onClick={() => setCurrentPage(totalPages)}
                        disabled={currentPage === totalPages || totalPages === 0}
                        className="px-2.5 py-1.5 rounded-lg border border-transparent hover:border-gray-200 dark:hover:border-white/10 hover:bg-white dark:hover:bg-white/5 disabled:opacity-30 disabled:cursor-not-allowed transition-all text-[10px] font-bold text-gray-600 dark:text-gray-400 flex items-center gap-1"
                        title="หน้าสุดท้าย"
                      >
                        <span className="hidden sm:inline text-[9px] uppercase tracking-wider">หน้าสุดท้าย</span>
                        <ChevronsRight size={14} />
                      </button>
                    </div>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
      {/* Edit Course Modal */}
      <EditCourseModal
        isOpen={isEditModalOpen}
        onClose={() => setIsEditModalOpen(false)}
        course={editingCourse}
        onSave={handleSaveCourse}
        teachers={teachers}
        availableClassOptions={availableClassOptions}
        periodSettings={periodSettings}
        schoolId={schoolId}
      />

      {/* Indicator Management Modal */}

    </MainLayout >
  );
};

export default ViewCoursesPage;
