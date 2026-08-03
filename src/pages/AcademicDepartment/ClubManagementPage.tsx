import React, { useState, useEffect, useMemo } from 'react';
import { Link } from 'react-router-dom';
import BackButton from "@/components/Shared/BackButton";
import { firestore as db, storage } from '../../firebase';
import { collection, addDoc, getDocs, deleteDoc, doc, serverTimestamp, query, getDoc, setDoc, updateDoc } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { useSelector, useDispatch } from 'react-redux';
import { RootState } from '@/store';
import MainLayout from "@/layouts/MainLayout";
import { fetchTeachersMap } from '@/store/slices/userMapSlice';
import Swal from 'sweetalert2';
import {
  Users,
  PlusCircle,
  Trash2,
  Image as ImageIcon,
  Save,
  UserCheck,
  FileText,
  X,
  LayoutGrid,
  Search,
  Edit3,
  RefreshCw,
  Settings,
  Copy,
  Database,
  Clock,
  CalendarDays,
  ArrowLeftRight
} from 'lucide-react';
import { compressImage } from "@/utils/imageUtils";
import { getActiveSortedTeachers } from "@/utils/teacherSortUtils";
import { CLASS_LEVEL_ORDER, formatClassLevelRange, getClassLevelRank } from "@/utils/schoolUtils";

interface Club {
  id: string;
  name: string;
  description: string;
  capacity: number;
  responsibleTeacherIds: string[];
  specialPeriodId?: string;
  specialPeriodTitle?: string;
  specialPeriodDay?: string;
  specialPeriodStartTime?: string;
  specialPeriodEndTime?: string;
  allowedClassLevelFrom?: string;
  allowedClassLevelTo?: string;
  imageUrl?: string;
  createdAt: any;
  memberCount?: number;
}

interface SpecialPeriod {
  id: string;
  title: string;
  startTime: string;
  endTime: string;
  day?: string;
}

const formatSpecialPeriodDay = (day?: string) => {
  const labels: Record<string, string> = {
    all: 'ทุกวัน',
    mon: 'วันจันทร์',
    tue: 'วันอังคาร',
    wed: 'วันพุธ',
    thu: 'วันพฤหัสบดี',
    fri: 'วันศุกร์',
    sat: 'วันเสาร์',
    sun: 'วันอาทิตย์',
  };
  return labels[day || 'all'] || day || 'ทุกวัน';
};

const isSelectableClubPeriod = (period: SpecialPeriod) => {
  const title = String(period.title || '').trim().toLowerCase();
  return !['โฮมรูม', 'พักกลางวัน', 'พักเที่ยง'].some(keyword => title.includes(keyword));
};

const sortSpecialPeriods = (a: SpecialPeriod, b: SpecialPeriod) => {
  const timeCompare = normalizeTimeForSort(a.startTime).localeCompare(normalizeTimeForSort(b.startTime));
  if (timeCompare !== 0) return timeCompare;
  return String(a.title || '').localeCompare(String(b.title || ''), 'th');
};

const normalizeTimeForSort = (time?: string) => String(time || '').replace(':', '.').padStart(5, '0');

const normalizeClubCourseTitle = (title?: string) => String(title || '').replace(/\s+/g, '').trim().toLowerCase();

const normalizeTeacherIds = (teacherId: any) => {
  if (Array.isArray(teacherId)) return teacherId.filter((id: string) => id && id !== 'pending');
  return teacherId && teacherId !== 'pending' ? [teacherId] : [];
};

const showSuccessAlert = (title: string, text?: string) => {
  return Swal.fire({
    icon: 'success',
    title,
    text,
    timer: 1600,
    timerProgressBar: true,
    showConfirmButton: false,
    background: '#2a2b2f',
    color: '#fff'
  });
};

const ClubManagementPage: React.FC = () => {
  const [clubs, setClubs] = useState<Club[]>([]);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [capacity, setCapacity] = useState<string>('40');
  const [selectedTeachers, setSelectedTeachers] = useState<string[]>([]);
  const [allowedClassLevelFrom, setAllowedClassLevelFrom] = useState('');
  const [allowedClassLevelTo, setAllowedClassLevelTo] = useState('');
  const [specialPeriods, setSpecialPeriods] = useState<SpecialPeriod[]>([]);
  const [selectedSpecialPeriodId, setSelectedSpecialPeriodId] = useState('');
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [teacherSearchTerm, setTeacherSearchTerm] = useState('');
  const [isRegistrationEnabled, setIsRegistrationEnabled] = useState(false);
  const [globalStartDate, setGlobalStartDate] = useState('');
  const [globalEndDate, setGlobalEndDate] = useState('');
  const [regStartTime, setRegStartTime] = useState('07:00');
  const [regEndTime, setRegEndTime] = useState('16:30');
  const [isTransferEnabled, setIsTransferEnabled] = useState(false);
  const [transferStartDate, setTransferStartDate] = useState('');
  const [transferEndDate, setTransferEndDate] = useState('');
  const [transferStartTime, setTransferStartTime] = useState('07:00');
  const [transferEndTime, setTransferEndTime] = useState('16:30');
  const [isSettingsSaving, setIsSettingsSaving] = useState(false);
  const [editingClub, setEditingClub] = useState<Club | null>(null);

  // New States for Pull
  const [isPullModalOpen, setIsPullModalOpen] = useState(false);
  const [pullableCourses, setPullableCourses] = useState<any[]>([]);
  const [selectedPullCourseIds, setSelectedPullCourseIds] = useState<string[]>([]);
  const [pullCourseSearchTerm, setPullCourseSearchTerm] = useState('');
  const [isPulling, setIsPulling] = useState(false);

  const currentUser = useSelector((state: RootState) => state.auth.user);
  const schoolId = (currentUser as any)?.schoolId;
  const dispatch = useDispatch();

  const { teachers: teacherMap, status: teacherMapStatus } = useSelector((state: RootState) => state.userMap);
  const availableClassOptions = useSelector((state: RootState) => state.schoolSettings.availableClassOptions);
  const classLevelOptions = useMemo(() => {
    const levels = availableClassOptions.map(([, name]: [string, string]) => name).filter(Boolean);
    return levels.length > 0 ? levels : CLASS_LEVEL_ORDER;
  }, [availableClassOptions]);
  const teachersList = useMemo(() => {
    let list = getActiveSortedTeachers(Object.values(teacherMap || {}));
    if (teacherSearchTerm) {
      const term = teacherSearchTerm.toLowerCase();
      list = list.filter((t: any) => {
        const teacherName = t.name || `${t.title || ''}${t.firstName || ''} ${t.lastName || ''}`.trim();
        return teacherName.toLowerCase().includes(term) || String(t.teacherId || '').toLowerCase().includes(term);
      });
    }
    return list;
  }, [teacherMap, teacherSearchTerm]);

  useEffect(() => {
    if (schoolId) {
      if (teacherMapStatus === 'idle') {
        dispatch(fetchTeachersMap(schoolId) as any);
      }
      const init = async () => {
        await fetchClubs();
        await fetchSpecialPeriods();
        // ดึงการตั้งค่าการย้ายชุมนุม
        try {
          const configRef = doc(db, 'school-settings', schoolId, 'configs', 'club_settings');
          const configSnap = await getDoc(configRef);
          if (configSnap.exists()) {
            const data = configSnap.data();
            setIsRegistrationEnabled(data.registrationEnabled ?? false);
            setGlobalStartDate(data.registrationStartDate || '');
            setGlobalEndDate(data.registrationEndDate || '');
            setRegStartTime(data.registrationStartTime || '07:00');
            setRegEndTime(data.registrationEndTime || '16:30');
            setIsTransferEnabled(data.allowTransfer || false);
            setTransferStartDate(data.transferStartDate || '');
            setTransferEndDate(data.transferEndDate || '');
            setTransferStartTime(data.transferStartTime || '07:00');
            setTransferEndTime(data.transferEndTime || '16:30');
          }
        } catch (error) {
          console.error("Error fetching club settings:", error);
        }
      };
      init();
    }
  }, [schoolId, teacherMapStatus, dispatch]);

  const fetchClubs = async () => {
    if (!schoolId) return;
    setLoading(true);
    try {
      // No orderBy('createdAt') here on purpose — Firestore silently omits any document
      // missing the ordered field, and clubs synced in from the course-based assignment/
      // enrollment flow (CourseAssignmentPage.tsx, CourseEnrollmentPage.tsx) never set
      // createdAt, so they were vanishing entirely from this admin list (while still showing
      // on ClubListPage, which orders by 'name' instead). Sort client-side so every club doc
      // is included regardless of which field(s) it happens to have.
      const snap = await getDocs(collection(db, 'school-settings', schoolId, 'clubs'));
      const clubsData = await Promise.all(snap.docs.map(async (doc) => {
        const club = { id: doc.id, ...doc.data() } as Club;
        const membersCollection = collection(db, 'school-settings', schoolId, 'clubs', doc.id, 'members');
        const membersSnap = await getDocs(membersCollection);
        return { ...club, memberCount: membersSnap.size };
      }));
      clubsData.sort((a, b) => (b.createdAt?.toMillis?.() || 0) - (a.createdAt?.toMillis?.() || 0));
      setClubs(clubsData);
    } catch (error) {
      console.error("Error fetching clubs:", error);
    } finally {
      setLoading(false);
    }
  };

  const fetchSpecialPeriods = async () => {
    if (!schoolId) return;
    try {
      const periodsSnap = await getDocs(collection(db, 'school-settings', schoolId, 'special-periods'));
      const periods = periodsSnap.docs
        .map(periodDoc => ({ id: periodDoc.id, ...periodDoc.data() } as SpecialPeriod))
        .filter(isSelectableClubPeriod)
        .sort(sortSpecialPeriods);
      setSpecialPeriods(periods);
      setSelectedSpecialPeriodId(prev => prev || periods.find(period => String(period.title || '').includes('ชุมนุม'))?.id || '');
    } catch (error) {
      console.error("Error fetching special periods:", error);
    }
  };

  const fetchPullableCourses = async () => {
    if (!schoolId) return;
    setIsPulling(true);
    try {
      const q = query(collection(db, 'school-settings', schoolId, 'courses'));
      const snap = await getDocs(q);
      const coursesData = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));

      const filtered = coursesData.filter((c: any) => {
        const title = (c.title || '').toLowerCase();
        const group = (c.subjectGroup || '').toLowerCase();
        return title.includes('ชุมนุม') || title.includes('กิจกรรม') || group.includes('กิจกรรม') || group.includes('พัฒนาผู้เรียน');
      });

      const dedupedByTitle = Array.from(filtered.reduce((courseMap: Map<string, any>, course: any) => {
        const titleKey = normalizeClubCourseTitle(course.title);
        if (!titleKey) return courseMap;

        const existing = courseMap.get(titleKey);
        if (!existing) {
          courseMap.set(titleKey, {
            ...course,
            sourceCourseIds: [course.id],
            sourceCourseCodes: course.code ? [course.code] : [],
            duplicateCount: 1,
            teacherId: normalizeTeacherIds(course.teacherId),
          });
          return courseMap;
        }

        const sourceCourseIds = Array.from(new Set([...(existing.sourceCourseIds || []), course.id]));
        const sourceCourseCodes = Array.from(new Set([...(existing.sourceCourseCodes || []), course.code].filter(Boolean)));
        const teacherIds = Array.from(new Set([...normalizeTeacherIds(existing.teacherId), ...normalizeTeacherIds(course.teacherId)]));

        courseMap.set(titleKey, {
          ...existing,
          sourceCourseIds,
          sourceCourseCodes,
          duplicateCount: sourceCourseIds.length,
          teacherId: teacherIds,
        });
        return courseMap;
      }, new Map<string, any>()).values());

      setPullableCourses(dedupedByTitle);
      setSelectedPullCourseIds([]);
      setPullCourseSearchTerm('');
      setIsPullModalOpen(true);
    } catch (error) {
      console.error("Error fetching pullable courses:", error);
      Swal.fire('ผิดพลาด', 'ไม่สามารถดึงข้อมูลรายวิชาได้', 'error');
    } finally {
      setIsPulling(false);
    }
  };

  const handleSavePulledCourses = async (selectedCourses: any[]) => {
    if (!schoolId || selectedCourses.length === 0) return;

    setIsSubmitting(true);
    Swal.fire({
      title: 'กำลังนำเข้าข้อมูล...',
      allowOutsideClick: false,
      background: '#2a2b2f',
      color: '#fff',
      didOpen: () => Swal.showLoading()
    });

    try {
      let importedCount = 0;
      const importedClubNames = new Set(clubs.map(club => normalizeClubCourseTitle(club.name)));
      for (const course of selectedCourses) {
        const normalizedClubName = normalizeClubCourseTitle(course.title);
        const isDuplicate = importedClubNames.has(normalizedClubName);
        if (isDuplicate) continue;
        importedClubNames.add(normalizedClubName);

        const clubData = {
          name: course.title,
          description: course.description || `กิจกรรมชุมนุม ${course.title}`,
          capacity: 40,
          responsibleTeacherIds: normalizeTeacherIds(course.teacherId),
          specialPeriodId: defaultClubPeriod?.id || '',
          specialPeriodTitle: defaultClubPeriod?.title || '',
          specialPeriodDay: defaultClubPeriod?.day || 'all',
          specialPeriodStartTime: defaultClubPeriod?.startTime || '',
          specialPeriodEndTime: defaultClubPeriod?.endTime || '',
          allowedClassLevelFrom: '',
          allowedClassLevelTo: '',
          imageUrl: '',
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        };
        await addDoc(collection(db, 'school-settings', schoolId, 'clubs'), clubData);
        importedCount++;
      }

      showSuccessAlert(
        'นำเข้าสำเร็จ',
        `นำเข้าชุมนุมใหม่ ${importedCount} รายการ รายการที่ชื่อซ้ำกับชุมนุมเดิมจะถูกข้าม`
      );
      fetchClubs();
      setIsPullModalOpen(false);
      setSelectedPullCourseIds([]);
      setPullCourseSearchTerm('');
    } catch (error) {
      console.error("Error saving pulled clubs:", error);
      Swal.fire('ผิดพลาด', 'ไม่สามารถบันทึกข้อมูลได้', 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  const filteredClubs = useMemo(() => {
    return clubs.filter(club =>
      club.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      club.description.toLowerCase().includes(searchTerm.toLowerCase())
    );
  }, [clubs, searchTerm]);

  const selectedSpecialPeriod = useMemo(() => (
    specialPeriods.find(period => period.id === selectedSpecialPeriodId) || null
  ), [specialPeriods, selectedSpecialPeriodId]);

  const defaultClubPeriod = useMemo(() => (
    specialPeriods.find(period => String(period.title || '').includes('ชุมนุม')) || specialPeriods[0] || null
  ), [specialPeriods]);

  const selectedPullCourses = useMemo(() => {
    const selectedIds = new Set(selectedPullCourseIds);
    return pullableCourses.filter(course => selectedIds.has(course.id));
  }, [pullableCourses, selectedPullCourseIds]);

  const filteredPullableCourses = useMemo(() => {
    const term = pullCourseSearchTerm.trim().toLowerCase();
    if (!term) return pullableCourses;

    return pullableCourses.filter(course => {
      const searchableText = [
        course.title,
        course.code,
        course.subjectGroup,
        course.description,
        ...(course.sourceCourseCodes || []),
      ].filter(Boolean).join(' ').toLowerCase();

      return searchableText.includes(term);
    });
  }, [pullableCourses, pullCourseSearchTerm]);

  const selectedVisiblePullCourseCount = useMemo(() => {
    return filteredPullableCourses.filter(course => selectedPullCourseIds.includes(course.id)).length;
  }, [filteredPullableCourses, selectedPullCourseIds]);

  const togglePullCourse = (courseId: string) => {
    setSelectedPullCourseIds(prev =>
      prev.includes(courseId) ? prev.filter(id => id !== courseId) : [...prev, courseId]
    );
  };

  const toggleAllPullCourses = () => {
    const visibleIds = filteredPullableCourses.map(course => course.id);
    const allVisibleSelected = visibleIds.length > 0 && visibleIds.every(id => selectedPullCourseIds.includes(id));

    setSelectedPullCourseIds(prev => {
      if (allVisibleSelected) return prev.filter(id => !visibleIds.includes(id));
      return Array.from(new Set([...prev, ...visibleIds]));
    });
  };

  const handleImageChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      try {
        const compressed = await compressImage(file);
        setImageFile(compressed);
        setImagePreview(URL.createObjectURL(compressed));
      } catch (error) {
        setImageFile(file);
        setImagePreview(URL.createObjectURL(file));
      }
    }
  };

  const handleEdit = (club: Club) => {
    setEditingClub(club);
    setName(club.name);
    setDescription(club.description);
    setCapacity(String(club.capacity));
    setSelectedTeachers(club.responsibleTeacherIds || []);
    setAllowedClassLevelFrom(club.allowedClassLevelFrom || '');
    setAllowedClassLevelTo(club.allowedClassLevelTo || '');
    setSelectedSpecialPeriodId(club.specialPeriodId || defaultClubPeriod?.id || '');
    setImagePreview(club.imageUrl || null);
    setImageFile(null); // Reset image file on edit start
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const resetForm = () => {
    setEditingClub(null);
    setName('');
    setDescription('');
    setCapacity('40');
    setSelectedTeachers([]);
    setAllowedClassLevelFrom('');
    setAllowedClassLevelTo('');
    setSelectedSpecialPeriodId(defaultClubPeriod?.id || '');
    setImageFile(null);
    setImagePreview(null);
  };

  const toggleTeacher = (teacherId: string) => {
    setSelectedTeachers(prev =>
      prev.includes(teacherId) ? prev.filter(id => id !== teacherId) : [...prev, teacherId]
    );
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSubmitting || !schoolId) return;

    if (!name || selectedTeachers.length === 0 || !capacity || !selectedSpecialPeriod) {
      Swal.fire({
        icon: 'warning',
        title: 'ข้อมูลไม่ครบ',
        text: 'กรุณาระบุชื่อชุมนุม, จำนวนที่รับ, เลือกครูผู้รับผิดชอบ และเลือกคาบชุมนุมที่ใช้เช็คชื่อ',
        background: '#2a2b2f',
        color: '#fff'
      });
      return;
    }

    if (allowedClassLevelFrom && allowedClassLevelTo && getClassLevelRank(allowedClassLevelFrom) > getClassLevelRank(allowedClassLevelTo)) {
      Swal.fire({
        icon: 'warning',
        title: 'ช่วงระดับชั้นไม่ถูกต้อง',
        text: 'กรุณาเลือกระดับชั้นเริ่มต้นให้อยู่ก่อนหรือเท่ากับระดับชั้นสิ้นสุด',
        background: '#2a2b2f',
        color: '#fff'
      });
      return;
    }

    const normalizedClubName = normalizeClubCourseTitle(name);
    const duplicateClub = clubs.find(club =>
      club.id !== editingClub?.id && normalizeClubCourseTitle(club.name) === normalizedClubName
    );

    if (duplicateClub) {
      Swal.fire({
        icon: 'warning',
        title: 'มีชุมนุมนี้อยู่แล้ว',
        text: 'ชุมนุมเดียวกันสามารถรับนักเรียนได้หลายชั้นหลายห้อง ไม่จำเป็นต้องสร้างชื่อซ้ำ',
        background: '#2a2b2f',
        color: '#fff'
      });
      return;
    }

    setIsSubmitting(true);
    Swal.fire({
      title: editingClub ? 'กำลังอัปเดต...' : 'กำลังบันทึก...',
      allowOutsideClick: false,
      background: '#2a2b2f',
      color: '#fff',
      didOpen: () => Swal.showLoading()
    });

    try {
      let imageUrl = editingClub?.imageUrl || "";
      if (imageFile) {
        const storageRef = ref(storage, `clubs/${schoolId}/${Date.now()}_${imageFile.name}`);
        const uploadSnap = await uploadBytes(storageRef, imageFile);
        imageUrl = await getDownloadURL(uploadSnap.ref);
      }

      const clubData = {
        name: name.trim(),
        description,
        capacity: parseInt(capacity) || 0,
        responsibleTeacherIds: selectedTeachers,
        specialPeriodId: selectedSpecialPeriod.id,
        specialPeriodTitle: selectedSpecialPeriod.title,
        specialPeriodDay: selectedSpecialPeriod.day || 'all',
        specialPeriodStartTime: selectedSpecialPeriod.startTime,
        specialPeriodEndTime: selectedSpecialPeriod.endTime,
        allowedClassLevelFrom,
        allowedClassLevelTo,
        imageUrl,
        updatedAt: serverTimestamp(),
      };

      if (editingClub) {
        const clubRef = doc(db, 'school-settings', schoolId, 'clubs', editingClub.id);
        await updateDoc(clubRef, clubData);
      } else {
        await addDoc(collection(db, 'school-settings', schoolId, 'clubs'), {
          ...clubData,
          createdAt: serverTimestamp(),
        });
      }

      showSuccessAlert(editingClub ? 'อัปเดตสำเร็จ' : 'บันทึกสำเร็จ');
      resetForm();
      fetchClubs();
    } catch (error) {
      console.error("Error adding club:", error);
      Swal.fire({
        icon: 'error',
        title: 'เกิดข้อผิดพลาด',
        text: 'ไม่สามารถบันทึกข้อมูลได้',
        background: '#2a2b2f',
        color: '#fff'
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async (clubId: string) => {
    const result = await Swal.fire({
      title: 'ยืนยันการลบ',
      text: "คุณต้องการลบข้อมูลชุมนุมนี้ใช่หรือไม่?",
      icon: 'warning',
      showCancelButton: true,
      confirmButtonColor: '#ef4444',
      cancelButtonColor: '#6b7280',
      confirmButtonText: 'ลบข้อมูล',
      cancelButtonText: 'ยกเลิก',
      background: '#2a2b2f',
      color: '#fff'
    });

    if (result.isConfirmed && schoolId) {
      try {
        await deleteDoc(doc(db, 'school-settings', schoolId, 'clubs', clubId));
        setClubs(prev => prev.filter(c => c.id !== clubId));
        showSuccessAlert('ลบสำเร็จ');
      } catch (error) {
        Swal.fire({
          icon: 'error',
          title: 'ผิดพลาด',
          text: 'ไม่สามารถลบได้',
          background: '#2a2b2f',
          color: '#fff'
        });
      }
    }
  };

  const handleSaveSettings = async () => {
    if (!schoolId) return;
    setIsSettingsSaving(true);
    try {
      const configRef = doc(db, 'school-settings', schoolId, 'configs', 'club_settings');
      await setDoc(configRef, {
        registrationEnabled: isRegistrationEnabled,
        registrationStartDate: globalStartDate,
        registrationEndDate: globalEndDate,
        registrationStartTime: regStartTime,
        registrationEndTime: regEndTime,
        allowTransfer: isTransferEnabled,
        transferStartDate,
        transferEndDate,
        transferStartTime,
        transferEndTime,
      }, { merge: true });
      showSuccessAlert('บันทึกการตั้งค่าสำเร็จ');
    } catch (error) {
      console.error("Error saving club settings:", error);
      Swal.fire('ผิดพลาด', 'ไม่สามารถบันทึกการตั้งค่าได้', 'error');
    } finally {
      setIsSettingsSaving(false);
    }
  };

  const checkTimeAllowed = (startTime: string, endTime: string): boolean => {
    if (!startTime || !endTime) return true;
    const now = new Date();
    const cur = now.getHours() * 60 + now.getMinutes();
    const [sh, sm] = startTime.split(':').map(Number);
    const [eh, em] = endTime.split(':').map(Number);
    return cur >= sh * 60 + sm && cur <= eh * 60 + em;
  };

  const getClubStatus = (_club: Club): { text: string; color: string } => {
    if (!isRegistrationEnabled) return { text: 'ปิดรับสมัคร', color: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300' };
    const now = new Date();
    const todayOnly = new Date(now); todayOnly.setHours(0, 0, 0, 0);
    if (globalStartDate && globalEndDate) {
      const start = new Date(globalStartDate);
      const end = new Date(globalEndDate);
      end.setHours(23, 59, 59, 999);
      if (todayOnly < start) return { text: 'ยังไม่เปิด', color: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300' };
      if (now > end) return { text: 'ปิดรับสมัคร', color: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300' };
    }
    if (!checkTimeAllowed(regStartTime, regEndTime)) return { text: 'นอกเวลารับสมัคร', color: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300' };
    return { text: 'เปิดรับสมัคร', color: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300' };
  };

  return (
    <MainLayout>
      <div className="p-4 sm:p-8 max-w-7xl mx-auto text-gray-900 dark:text-white transition-colors duration-300">

        {/* Page Header */}
        <div className="mb-8 flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="flex items-center gap-4">
            <BackButton to="/academic/hub/activities" />
            <div>
              <h1 className="text-2xl font-black tracking-tight flex items-center gap-3">
                <Users className="text-indigo-500" size={28} />
                จัดการข้อมูลชุมนุม
              </h1>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5 font-medium">เพิ่มและจัดการรายชื่อชุมนุมสำหรับนักเรียน</p>
            </div>
          </div>

          <div className="relative w-full md:w-72">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400" size={16} />
            <input
              type="text"
              placeholder="ค้นหาชื่อชุมนุม..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-2.5 bg-white dark:bg-[#2a2b2f] border border-gray-200 dark:border-gray-700 rounded-2xl focus:ring-2 focus:ring-indigo-500 outline-none transition-all shadow-sm text-sm font-medium"
            />
          </div>
        </div>

        {/* ส่วนการตั้งค่าระบบชุมนุม */}
        <div className="mb-6 bg-white dark:bg-[#2a2b2f] rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 overflow-hidden animate-in fade-in slide-in-from-top-2">
          {/* Header */}
          <div className="flex items-center justify-between px-5 py-3.5 border-b border-gray-100 dark:border-gray-700 bg-gray-50/70 dark:bg-gray-800/40">
            <h3 className="text-sm font-bold flex items-center gap-2 text-gray-600 dark:text-gray-300">
              <Settings size={15} />
              ตั้งค่าระบบชุมนุม
            </h3>
            <button
              onClick={handleSaveSettings}
              disabled={isSettingsSaving}
              className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white px-3 py-1.5 rounded-lg font-bold text-xs transition-all disabled:opacity-50 shadow-sm"
            >
              {isSettingsSaving ? <RefreshCw size={13} className="animate-spin" /> : <Save size={13} />}
              บันทึกการตั้งค่า
            </button>
          </div>

          {/* Two setting cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 divide-y md:divide-y-0 md:divide-x divide-gray-100 dark:divide-gray-700/60">

            {/* Card 1: Registration */}
            <div className="p-5 space-y-4">
              {/* Toggle row */}
              <div className="flex items-start justify-between gap-4">
                <div className="flex items-start gap-3">
                  <div className={`mt-0.5 p-2 rounded-xl flex-shrink-0 ${isRegistrationEnabled ? 'bg-emerald-100 dark:bg-emerald-500/20' : 'bg-gray-100 dark:bg-gray-700/50'}`}>
                    <CalendarDays size={16} className={isRegistrationEnabled ? 'text-emerald-600 dark:text-emerald-400' : 'text-gray-400'} />
                  </div>
                  <div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <h4 className="font-bold text-sm text-gray-800 dark:text-gray-100">การรับสมัครชุมนุม</h4>
                      <span className={`text-[10px] font-black px-2 py-0.5 rounded-full ${isRegistrationEnabled ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-300' : 'bg-red-100 text-red-600 dark:bg-red-500/20 dark:text-red-400'}`}>
                        {isRegistrationEnabled ? '● เปิดรับสมัคร' : '● ปิดรับสมัคร'}
                      </span>
                    </div>
                    <p className="text-[11px] text-gray-400 mt-0.5">เปิด/ปิดให้นักเรียนสมัครเข้าชุมนุม</p>
                  </div>
                </div>
                <button
                  onClick={() => setIsRegistrationEnabled(!isRegistrationEnabled)}
                  className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none flex-shrink-0 ${isRegistrationEnabled ? 'bg-emerald-500' : 'bg-gray-300 dark:bg-gray-600'}`}
                >
                  <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform duration-200 ease-in-out ${isRegistrationEnabled ? 'translate-x-6' : 'translate-x-1'}`} />
                </button>
              </div>

              {/* Date + Time range — dimmed when off */}
              <div className={`transition-opacity duration-200 ${isRegistrationEnabled ? 'opacity-100' : 'opacity-40 pointer-events-none'}`}>
                <div className="grid grid-cols-4 gap-2">
                  <div>
                    <label className="block text-[10px] font-bold text-gray-400 dark:text-gray-500 mb-1 uppercase tracking-wider">วันเปิด</label>
                    <input type="date" value={globalStartDate} onChange={(e) => setGlobalStartDate(e.target.value)}
                      className="w-full px-2 py-1.5 rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 outline-none focus:ring-2 focus:ring-emerald-500 transition-all text-xs font-bold" />
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-gray-400 dark:text-gray-500 mb-1 uppercase tracking-wider">วันปิด</label>
                    <input type="date" value={globalEndDate} onChange={(e) => setGlobalEndDate(e.target.value)}
                      className="w-full px-2 py-1.5 rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 outline-none focus:ring-2 focus:ring-red-400 transition-all text-xs font-bold" />
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-gray-400 dark:text-gray-500 mb-1 uppercase tracking-wider flex items-center gap-1"><Clock size={9} /> เวลาเริ่ม</label>
                    <input type="time" value={regStartTime} onChange={(e) => setRegStartTime(e.target.value)}
                      className="w-full px-2 py-1.5 rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 outline-none focus:ring-2 focus:ring-emerald-500 transition-all text-xs font-bold" />
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-gray-400 dark:text-gray-500 mb-1 uppercase tracking-wider flex items-center gap-1"><Clock size={9} /> เวลาปิด</label>
                    <input type="time" value={regEndTime} onChange={(e) => setRegEndTime(e.target.value)}
                      className="w-full px-2 py-1.5 rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 outline-none focus:ring-2 focus:ring-red-400 transition-all text-xs font-bold" />
                  </div>
                </div>
              </div>
            </div>

            {/* Card 2: Transfer */}
            <div className="p-5 space-y-4">
              {/* Toggle row */}
              <div className="flex items-start justify-between gap-4">
                <div className="flex items-start gap-3">
                  <div className={`mt-0.5 p-2 rounded-xl flex-shrink-0 ${isTransferEnabled ? 'bg-indigo-100 dark:bg-indigo-500/20' : 'bg-gray-100 dark:bg-gray-700/50'}`}>
                    <ArrowLeftRight size={16} className={isTransferEnabled ? 'text-indigo-600 dark:text-indigo-400' : 'text-gray-400'} />
                  </div>
                  <div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <h4 className="font-bold text-sm text-gray-800 dark:text-gray-100">การย้ายชุมนุม</h4>
                      <span className={`text-[10px] font-black px-2 py-0.5 rounded-full ${isTransferEnabled ? 'bg-indigo-100 text-indigo-700 dark:bg-indigo-500/20 dark:text-indigo-300' : 'bg-red-100 text-red-600 dark:bg-red-500/20 dark:text-red-400'}`}>
                        {isTransferEnabled ? '● อนุญาต' : '● ไม่อนุญาต'}
                      </span>
                    </div>
                    <p className="text-[11px] text-gray-400 mt-0.5">อนุญาตให้นักเรียนส่งคำขอย้ายชุมนุมด้วยตนเอง</p>
                  </div>
                </div>
                <button
                  onClick={() => setIsTransferEnabled(!isTransferEnabled)}
                  className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none flex-shrink-0 ${isTransferEnabled ? 'bg-indigo-600' : 'bg-gray-300 dark:bg-gray-600'}`}
                >
                  <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform duration-200 ease-in-out ${isTransferEnabled ? 'translate-x-6' : 'translate-x-1'}`} />
                </button>
              </div>

              {/* Date + Time range — dimmed when off */}
              <div className={`transition-opacity duration-200 ${isTransferEnabled ? 'opacity-100' : 'opacity-40 pointer-events-none'}`}>
                <div className="grid grid-cols-4 gap-2">
                  <div>
                    <label className="block text-[10px] font-bold text-gray-400 dark:text-gray-500 mb-1 uppercase tracking-wider">วันเปิด</label>
                    <input type="date" value={transferStartDate} onChange={(e) => setTransferStartDate(e.target.value)}
                      className="w-full px-2 py-1.5 rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 outline-none focus:ring-2 focus:ring-indigo-500 transition-all text-xs font-bold" />
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-gray-400 dark:text-gray-500 mb-1 uppercase tracking-wider">วันปิด</label>
                    <input type="date" value={transferEndDate} onChange={(e) => setTransferEndDate(e.target.value)}
                      className="w-full px-2 py-1.5 rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 outline-none focus:ring-2 focus:ring-red-400 transition-all text-xs font-bold" />
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-gray-400 dark:text-gray-500 mb-1 uppercase tracking-wider flex items-center gap-1"><Clock size={9} /> เวลาเริ่ม</label>
                    <input type="time" value={transferStartTime} onChange={(e) => setTransferStartTime(e.target.value)}
                      className="w-full px-2 py-1.5 rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 outline-none focus:ring-2 focus:ring-indigo-500 transition-all text-xs font-bold" />
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-gray-400 dark:text-gray-500 mb-1 uppercase tracking-wider flex items-center gap-1"><Clock size={9} /> เวลาปิด</label>
                    <input type="time" value={transferEndTime} onChange={(e) => setTransferEndTime(e.target.value)}
                      className="w-full px-2 py-1.5 rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 outline-none focus:ring-2 focus:ring-red-400 transition-all text-xs font-bold" />
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
          {/* Form Section */}
          <div className="lg:col-span-4">
            <div className="bg-white dark:bg-[#2a2b2f] rounded-2xl p-6 shadow-sm border border-gray-100 dark:border-gray-700 sticky top-24" id="club-form">
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-xl font-black flex items-center gap-2">
                  {editingClub ? <Edit3 className="text-amber-500" size={22} /> : <PlusCircle className="text-emerald-500" size={22} />}
                  {editingClub ? 'แก้ไขข้อมูล' : 'เพิ่มชุมนุมใหม่'}
                </h2>
                {!editingClub && (
                  <button
                    onClick={fetchPullableCourses}
                    disabled={isPulling}
                    className="flex items-center gap-1.5 bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400 px-3 py-1.5 rounded-lg font-bold text-[10px] transition-all hover:bg-indigo-100 dark:hover:bg-indigo-900/50 border border-indigo-100 dark:border-indigo-800 uppercase tracking-tight"
                  >
                    {isPulling ? <RefreshCw size={12} className="animate-spin" /> : <Database size={12} />}
                    ดึงจากโครงสร้างหลักสูตร
                  </button>
                )}
              </div>
              <form onSubmit={handleSubmit} className="space-y-4">
                {/* Row 1: Name & Capacity */}
                <div className="grid grid-cols-4 gap-3">
                  <div className="col-span-3">
                    <label className="block text-[10px] font-bold text-gray-400 dark:text-gray-500 mb-1 uppercase tracking-wider">ชื่อชุมนุม</label>
                    <input
                      type="text"
                      value={name}
                      onChange={e => setName(e.target.value)}
                      className="w-full px-3 py-2 rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 outline-none focus:ring-2 focus:ring-indigo-500 transition-all text-sm font-medium"
                      placeholder="ระบุชื่อชุมนุม..."
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-gray-400 dark:text-gray-500 mb-1 uppercase tracking-wider">รับ (คน)</label>
                    <input
                      type="number"
                      value={capacity}
                      onChange={e => setCapacity(e.target.value)}
                      className="w-full px-3 py-2 rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 outline-none focus:ring-2 focus:ring-indigo-500 transition-all text-sm font-bold text-center"
                      placeholder="40"
                      min="1"
                    />
                  </div>
                </div>

                {/* Row 2: Description */}
                <div>
                  <label className="block text-[10px] font-bold text-gray-400 dark:text-gray-500 mb-1 uppercase tracking-wider">รายละเอียดกิจกรรม</label>
                  <textarea 
                    value={description} 
                    onChange={e => setDescription(e.target.value)} 
                    rows={2} 
                    className="w-full px-3 py-2 rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 outline-none focus:ring-2 focus:ring-indigo-500 resize-none transition-all text-xs" 
                    placeholder="อธิบายกิจกรรมโดยย่อ..." 
                  />
                </div>

                {/* Row 3: Period & Image */}
                <div className="flex items-end gap-3">
                  <div className="flex-grow">
                    <label className="text-[10px] font-bold text-gray-400 dark:text-gray-500 mb-1 uppercase tracking-wider flex items-center gap-1">
                      <Clock size={10} /> คาบเช็คชื่อ
                    </label>
                    <select
                      value={selectedSpecialPeriodId}
                      onChange={e => setSelectedSpecialPeriodId(e.target.value)}
                      className="w-full px-3 py-2 rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 outline-none focus:ring-2 focus:ring-indigo-500 transition-all text-xs font-bold"
                    >
                      <option value="">เลือกคาบเรียนพิเศษ...</option>
                      {specialPeriods.map(period => (
                        <option key={period.id} value={period.id}>
                          {period.title} ({formatSpecialPeriodDay(period.day)})
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="flex-shrink-0">
                    <div 
                      onClick={() => document.getElementById('club-image-input')?.click()} 
                      className="w-9 h-9 rounded-xl border-2 border-dashed border-gray-200 dark:border-gray-700 flex items-center justify-center cursor-pointer hover:bg-indigo-50 dark:hover:bg-indigo-900/30 transition-all overflow-hidden relative group shadow-sm"
                    >
                      {imagePreview ? (
                        <img src={imagePreview} className="w-full h-full object-cover" alt="Preview" />
                      ) : (
                        <ImageIcon className="text-gray-300" size={16} />
                      )}
                      <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity">
                        <PlusCircle className="text-white" size={14} />
                      </div>
                    </div>
                    <input type="file" id="club-image-input" hidden accept="image/jpeg,image/png" onChange={handleImageChange} />
                  </div>
                </div>

                {/* Row 4: Class Level Range */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[10px] font-bold text-gray-400 dark:text-gray-500 mb-1 uppercase tracking-wider">รับตั้งแต่ระดับชั้น</label>
                    <select
                      value={allowedClassLevelFrom}
                      onChange={e => setAllowedClassLevelFrom(e.target.value)}
                      className="w-full px-3 py-2 rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 outline-none focus:ring-2 focus:ring-indigo-500 transition-all text-xs font-bold"
                    >
                      <option value="">ทุกระดับชั้น</option>
                      {classLevelOptions.map(level => (
                        <option key={level} value={level}>{level}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-gray-400 dark:text-gray-500 mb-1 uppercase tracking-wider">ถึงระดับชั้น</label>
                    <select
                      value={allowedClassLevelTo}
                      onChange={e => setAllowedClassLevelTo(e.target.value)}
                      className="w-full px-3 py-2 rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 outline-none focus:ring-2 focus:ring-indigo-500 transition-all text-xs font-bold"
                    >
                      <option value="">ทุกระดับชั้น</option>
                      {classLevelOptions.map(level => (
                        <option key={level} value={level}>{level}</option>
                      ))}
                    </select>
                  </div>
                </div>

                {/* Row 4: Teachers */}
                <div className="pt-3 border-t border-gray-100 dark:border-gray-800">
                  <div className="mb-2 flex items-center justify-between gap-2">
                    <label className="block text-[10px] font-bold text-gray-400 dark:text-gray-500 uppercase tracking-wider">ครูผู้รับผิดชอบ</label>
                    <span className="text-[9px] font-bold text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-500/10 px-2 py-0.5 rounded-full border border-emerald-100 dark:border-emerald-500/20">
                      เฉพาะสถานะอยู่
                    </span>
                  </div>
                  
                  <div className="relative mb-2">
                    <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" size={12} />
                    <input
                      type="text"
                      placeholder="ค้นหาครูที่กำลังปฏิบัติหน้าที่..."
                      value={teacherSearchTerm}
                      onChange={(e) => setTeacherSearchTerm(e.target.value)}
                      className="w-full pl-8 pr-3 py-1.5 text-[11px] bg-gray-100 dark:bg-gray-800/50 border-none rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none"
                    />
                  </div>

                  <div className="max-h-72 overflow-y-auto border border-gray-100 dark:border-gray-800 rounded-xl p-1.5 space-y-0.5 bg-gray-50/50 dark:bg-gray-900/40 custom-scrollbar">
                    {teachersList.length > 0 ? (
                      teachersList.slice(0, 30).map(t => {
                        const teacherName = t.name || `${t.title || ''}${t.firstName || ''} ${t.lastName || ''}`.trim() || 'ไม่ระบุชื่อครู';
                        return (
                          <label key={t.id} className={`flex items-center gap-2.5 p-2 rounded-lg cursor-pointer transition-all ${selectedTeachers.includes(t.id) ? 'bg-white dark:bg-gray-800 shadow-sm border border-indigo-100 dark:border-indigo-900/50' : 'hover:bg-white/50 dark:hover:bg-gray-800/50'}`}>
                            <input type="checkbox" checked={selectedTeachers.includes(t.id)} onChange={() => toggleTeacher(t.id)} className="w-4 h-4 text-indigo-600 rounded focus:ring-indigo-500 border-gray-300 dark:border-gray-600" />
                            <div className="flex items-center gap-1.5 min-w-0">
                              <span className={`text-[11px] truncate ${selectedTeachers.includes(t.id) ? 'font-bold text-indigo-600 dark:text-indigo-400' : 'text-gray-700 dark:text-gray-300'}`}>
                                {t.teacherId && <span>{t.teacherId} </span>}
                                {teacherName}
                              </span>
                            </div>
                          </label>
                        );
                      })
                    ) : (
                      <div className="p-6 text-center">
                        <div className="text-[11px] text-gray-400">ไม่พบรายชื่อครูที่กำลังปฏิบัติหน้าที่</div>
                        <div className="text-[9px] text-gray-300 mt-1">ลองพิมพ์ค้นหาชื่อเพื่อระบุตัวตน</div>
                      </div>
                    )}
                    {teachersList.length > 30 && (
                      <div className="p-2 text-center text-[9px] text-gray-400 border-t border-gray-100 dark:border-gray-800 mt-1 italic">
                        แสดง 30 รายชื่อแรก กรุณาใช้ช่องค้นหาเพื่อหาครูท่านอื่น
                      </div>
                    )}
                  </div>
                </div>

                <div className="flex gap-2 pt-1">
                  {editingClub && (
                    <button type="button" onClick={resetForm} className="flex-1 py-2 bg-gray-100 hover:bg-gray-200 text-gray-600 font-bold rounded-xl text-xs transition-all flex items-center justify-center gap-1.5">
                      <X size={14} /> ยกเลิก
                    </button>
                  )}
                  <button type="submit" disabled={isSubmitting} className={`flex-[2] py-2.5 ${editingClub ? 'bg-amber-600 hover:bg-amber-700' : 'bg-indigo-600 hover:bg-indigo-700'} text-white font-black rounded-xl shadow-lg shadow-indigo-100 dark:shadow-none transition-all flex items-center justify-center gap-1.5 text-xs`}>
                    <Save size={16} /> {isSubmitting ? (editingClub ? 'กำลังอัปเดต...' : 'กำลังบันทึก...') : (editingClub ? 'อัปเดตข้อมูล' : 'บันทึกชุมนุม')}
                  </button>
                </div>
              </form>
            </div>
          </div>

          {/* List Section */}
          <div className="lg:col-span-8">
            <h2 className="text-xl font-bold mb-6 flex items-center gap-2">
              <FileText className="text-amber-500" /> รายการชุมนุมทั้งหมด ({clubs.length})
            </h2>

            {loading ? (
              <div className="text-center py-20 text-gray-500">กำลังโหลดข้อมูล...</div>
            ) : clubs.length === 0 ? (
              <div className="bg-white dark:bg-[#2a2b2f] rounded-2xl p-16 text-center border border-dashed border-gray-300 dark:border-gray-700">
                <Users className="mx-auto text-gray-300 mb-4" size={48} />
                <p className="text-gray-500">ยังไม่มีข้อมูลชุมนุมในระบบ</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-2.5">
                {filteredClubs.map(club => {
                  const status = getClubStatus(club);
                  return (
                    <div key={club.id} className="bg-white dark:bg-[#2a2b2f] rounded-xl p-2.5 shadow-sm border border-gray-100 dark:border-gray-700 flex flex-col md:flex-row md:items-center gap-4 group hover:shadow-md transition-all relative overflow-hidden">
                      <div className={`absolute left-0 top-0 bottom-0 w-1 ${status.color.split(' ')[0]}`} />
                      
                      {/* 1. Image & Basic Info */}
                      <div className="flex items-center gap-3 flex-[1.5] min-w-0">
                        <div className="w-14 h-14 rounded-lg overflow-hidden bg-gray-100 dark:bg-gray-800 flex-shrink-0 shadow-inner">
                          {club.imageUrl ? (
                            <img src={club.imageUrl} className="w-full h-full object-cover" alt={club.name} />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center text-gray-400"><ImageIcon size={24} /></div>
                          )}
                        </div>
                        <div className="min-w-0">
                          <h3 className="font-bold text-indigo-600 dark:text-indigo-400 truncate text-sm">{club.name}</h3>
                          <p className="text-[11px] text-gray-500 dark:text-gray-400 line-clamp-1">{club.description || 'ไม่มีรายละเอียด'}</p>
                        </div>
                      </div>

                      {/* 2. Status & Capacity */}
                      <div className="flex items-center gap-4 flex-1">
                        {status.text && (
                          <div className={`px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-tight whitespace-nowrap ${status.color}`}>
                            {status.text}
                          </div>
                        )}
                        <div className="flex items-center gap-1.5 text-[11px] font-bold text-gray-600 dark:text-gray-300">
                          <Users size={12} className="text-gray-400" />
                          <span className="tabular-nums">{club.memberCount || 0}</span>
                          <span className="text-gray-400">/</span>
                          <span className="tabular-nums">{club.capacity || 0}</span>
                        </div>
                        <div className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-sky-50 text-sky-700 dark:bg-sky-500/10 dark:text-sky-300 whitespace-nowrap">
                          {formatClassLevelRange(club.allowedClassLevelFrom, club.allowedClassLevelTo)}
                        </div>
                      </div>

                      {/* 3. Schedule & Time */}
                      <div className="hidden lg:flex flex-col gap-0.5 flex-1 border-l border-gray-100 dark:border-gray-700 pl-4">
                        <span className="text-[9px] font-bold text-gray-400 uppercase tracking-wider">เวลาเรียน</span>
                        <div className="flex items-center gap-1.5 text-[11px] font-black text-indigo-600 dark:text-indigo-300 truncate">
                          <Clock size={11} />
                          {club.specialPeriodTitle
                            ? `${club.specialPeriodTitle} (${formatSpecialPeriodDay(club.specialPeriodDay)})`
                            : '-'}
                        </div>
                      </div>

                      {/* 4. Responsible Teachers */}
                      <div className="hidden xl:flex flex-col gap-1 flex-1 border-l border-gray-100 dark:border-gray-700 pl-4 min-w-0">
                        <span className="text-[9px] font-bold text-gray-400 uppercase tracking-wider">ครูผู้รับผิดชอบ</span>
                        <div className="flex items-center gap-1.5 min-w-0">
                          {club.responsibleTeacherIds && club.responsibleTeacherIds.length > 0 ? (
                            <>
                              <div className="text-[11px] font-bold text-gray-700 dark:text-gray-200 truncate">
                                {teacherMap?.[club.responsibleTeacherIds[0]]?.name || 'ไม่พบข้อมูล'}
                              </div>
                              {club.responsibleTeacherIds.length > 1 && (
                                <span className="flex-shrink-0 px-1.5 py-0.5 bg-indigo-50 dark:bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 text-[10px] font-black rounded-md border border-indigo-100 dark:border-indigo-500/20">
                                  +{club.responsibleTeacherIds.length - 1}
                                </span>
                              )}
                            </>
                          ) : (
                            <span className="text-[11px] text-gray-400 italic">ไม่ระบุครู</span>
                          )}
                        </div>
                      </div>

                      {/* 5. Actions */}
                      <div className="flex items-center justify-end gap-1 md:border-l border-gray-100 dark:border-gray-700 md:pl-2 shrink-0">
                        <button onClick={() => handleEdit(club)} className="p-2 text-gray-400 hover:text-amber-500 hover:bg-amber-50 dark:hover:bg-amber-500/10 rounded-lg transition-all"><Edit3 size={16} /></button>
                        <button onClick={() => handleDelete(club.id)} className="p-2 text-gray-400 hover:text-red-500 hover:bg-rose-50 dark:hover:bg-rose-500/10 rounded-lg transition-all"><Trash2 size={16} /></button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>
      {/* Course Pull Modal */}
      {isPullModalOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white dark:bg-[#2a2b2f] w-full max-w-3xl rounded-3xl shadow-2xl overflow-hidden border border-gray-100 dark:border-gray-700">
            <div className="p-6 border-b border-gray-100 dark:border-gray-700 flex items-center justify-between">
              <div>
                <h3 className="text-xl font-bold flex items-center gap-2">
                  <Database className="text-indigo-500" />
                  ดึงข้อมูลจากรายวิชา
                </h3>
                <p className="text-sm text-gray-500 mt-1">
                  พบรายวิชาที่น่าจะเป็นกิจกรรมชุมนุม {pullableCourses.length} รายการ เลือกเฉพาะรายวิชาที่ต้องการนำเข้า
                </p>
              </div>
              <button
                onClick={() => {
                  setIsPullModalOpen(false);
                  setSelectedPullCourseIds([]);
                  setPullCourseSearchTerm('');
                }}
                className="p-2 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-full transition-colors text-gray-400"
              >
                <X size={20} />
              </button>
            </div>
            {pullableCourses.length > 0 && (
              <div className="px-6 py-4 border-b border-gray-100 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/30 space-y-3">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={16} />
                  <input
                    type="text"
                    value={pullCourseSearchTerm}
                    onChange={(event) => setPullCourseSearchTerm(event.target.value)}
                    placeholder="ค้นหาชื่อรายวิชา รหัสวิชา หรือกลุ่มสาระ..."
                    className="w-full pl-10 pr-10 py-2.5 text-sm bg-white dark:bg-gray-900/70 border border-gray-200 dark:border-gray-700 rounded-2xl focus:ring-2 focus:ring-indigo-500 outline-none text-gray-900 dark:text-white"
                  />
                  {pullCourseSearchTerm && (
                    <button
                      type="button"
                      onClick={() => setPullCourseSearchTerm('')}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-red-500 transition-colors"
                    >
                      <X size={16} />
                    </button>
                  )}
                </div>

                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                  <label className={`flex items-center gap-3 select-none ${filteredPullableCourses.length === 0 ? 'cursor-not-allowed opacity-50' : 'cursor-pointer'}`}>
                    <input
                      type="checkbox"
                      checked={filteredPullableCourses.length > 0 && selectedVisiblePullCourseCount === filteredPullableCourses.length}
                      ref={input => {
                        if (input) input.indeterminate = selectedVisiblePullCourseCount > 0 && selectedVisiblePullCourseCount < filteredPullableCourses.length;
                      }}
                      onChange={toggleAllPullCourses}
                      disabled={filteredPullableCourses.length === 0}
                      className="w-5 h-5 text-indigo-600 rounded focus:ring-indigo-500 border-gray-300 dark:border-gray-600 disabled:opacity-50"
                    />
                    <span className="text-sm font-bold text-gray-700 dark:text-gray-200">
                      เลือกรายการที่แสดง
                    </span>
                    <span className="text-xs text-gray-400">
                      ({filteredPullableCourses.length} รายการ)
                    </span>
                  </label>
                  <div className="flex items-center gap-3">
                    <span className="text-xs font-bold text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-500/10 px-3 py-1 rounded-full border border-indigo-100 dark:border-indigo-500/20">
                      เลือกแล้ว {selectedPullCourseIds.length} รายการ
                    </span>
                    {selectedPullCourseIds.length > 0 && (
                      <button
                        type="button"
                        onClick={() => setSelectedPullCourseIds([])}
                        className="text-xs font-bold text-gray-500 hover:text-red-500 transition-colors"
                      >
                        ล้างการเลือก
                      </button>
                    )}
                  </div>
                </div>
              </div>
            )}
            <div className="p-6 max-h-[60vh] overflow-y-auto custom-scrollbar">
              <div className="space-y-3">
                {filteredPullableCourses.map(course => (
                  <label
                    key={course.id}
                    className={`flex items-center gap-4 p-4 rounded-2xl border transition-all group cursor-pointer ${selectedPullCourseIds.includes(course.id)
                      ? 'bg-indigo-50 dark:bg-indigo-500/10 border-indigo-300 dark:border-indigo-500/50 shadow-sm'
                      : 'bg-gray-50 dark:bg-gray-800/50 border-gray-100 dark:border-gray-700 hover:border-indigo-300 dark:hover:border-indigo-500/50'
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={selectedPullCourseIds.includes(course.id)}
                      onChange={() => togglePullCourse(course.id)}
                      className="w-5 h-5 text-indigo-600 rounded focus:ring-indigo-500 border-gray-300 dark:border-gray-600"
                    />
                    <div className="flex-grow min-w-0">
                      <div className="font-bold text-gray-900 dark:text-white truncate">{course.title}</div>
                      <div className="text-xs text-gray-500 dark:text-gray-400 flex flex-wrap items-center gap-2 mt-1">
                        <span className="px-2 py-0.5 bg-gray-200 dark:bg-gray-700 rounded-md">{course.code || 'ไม่มีรหัส'}</span>
                        <span>•</span>
                        <span>{course.subjectGroup || 'ไม่ระบุกลุ่มสาระ'}</span>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={(event) => {
                        event.preventDefault();
                        event.stopPropagation();
                        handleSavePulledCourses([course]);
                      }}
                      disabled={isSubmitting}
                      className="hidden sm:flex items-center gap-2 bg-white dark:bg-gray-900 hover:bg-indigo-600 dark:hover:bg-indigo-600 text-indigo-600 dark:text-indigo-300 hover:text-white px-4 py-2 rounded-xl text-sm font-bold transition-all border border-indigo-200 dark:border-indigo-500/30"
                    >
                      <Copy size={16} />
                      ดึงข้อมูล
                    </button>
                  </label>
                ))}
                {pullableCourses.length === 0 && (
                  <div className="text-center py-10">
                    <div className="bg-gray-100 dark:bg-gray-800 w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4">
                      <Database className="text-gray-400" size={32} />
                    </div>
                    <p className="text-gray-500">ไม่พบรายวิชาที่เกี่ยวข้องกับชุมนุม</p>
                  </div>
                )}
                {pullableCourses.length > 0 && filteredPullableCourses.length === 0 && (
                  <div className="text-center py-10">
                    <div className="bg-gray-100 dark:bg-gray-800 w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4">
                      <Search className="text-gray-400" size={32} />
                    </div>
                    <p className="font-bold text-gray-600 dark:text-gray-300">ไม่พบรายวิชาตามคำค้นหา</p>
                    <p className="text-xs text-gray-400 mt-1">ลองค้นหาด้วยชื่อรายวิชา รหัสวิชา หรือกลุ่มสาระอื่น</p>
                  </div>
                )}
              </div>
            </div>
            <div className="p-6 bg-gray-50 dark:bg-gray-800/30 border-t border-gray-100 dark:border-gray-700 flex justify-end gap-3">
              <button
                onClick={() => handleSavePulledCourses(selectedPullCourses)}
                disabled={isSubmitting || selectedPullCourses.length === 0}
                className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white px-6 py-2.5 rounded-xl font-bold transition-all disabled:opacity-50"
              >
                {isSubmitting ? <RefreshCw size={20} className="animate-spin" /> : <Database size={20} />}
                ดึงข้อมูลที่เลือกเข้าสู่ระบบ
              </button>
            </div>
          </div>
        </div>
      )}

      <style>{`
        .custom-scrollbar::-webkit-scrollbar { width: 4px; }
        .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: #cbd5e1; border-radius: 10px; }
        .dark .custom-scrollbar::-webkit-scrollbar-thumb { background: #475569; }
      `}</style>
    </MainLayout>
  );
};

export default ClubManagementPage;
