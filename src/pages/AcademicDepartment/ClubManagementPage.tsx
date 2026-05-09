import React, { useState, useEffect, useMemo } from 'react';
import { Link } from 'react-router-dom';
import BackButton from "@/components/Shared/BackButton";
import { firestore as db, storage } from '../../firebase';
import { collection, addDoc, getDocs, deleteDoc, doc, serverTimestamp, query, orderBy, getDoc, setDoc, updateDoc } from 'firebase/firestore';
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
  Database
} from 'lucide-react';
import { compressImage } from "@/utils/imageUtils";

interface Club {
  id: string;
  name: string;
  description: string;
  capacity: number;
  responsibleTeacherIds: string[];
  imageUrl?: string;
  createdAt: any;
  memberCount?: number;
}

const ClubManagementPage: React.FC = () => {
  const [clubs, setClubs] = useState<Club[]>([]);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [capacity, setCapacity] = useState<string>('40');
  const [selectedTeachers, setSelectedTeachers] = useState<string[]>([]);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [teacherSearchTerm, setTeacherSearchTerm] = useState('');
  const [isTransferEnabled, setIsTransferEnabled] = useState(false);
  const [isSettingsSaving, setIsSettingsSaving] = useState(false);
  const [globalStartDate, setGlobalStartDate] = useState('');
  const [globalEndDate, setGlobalEndDate] = useState('');
  const [editingClub, setEditingClub] = useState<Club | null>(null);

  // New States for Pull
  const [isPullModalOpen, setIsPullModalOpen] = useState(false);
  const [pullableCourses, setPullableCourses] = useState<any[]>([]);
  const [isPulling, setIsPulling] = useState(false);

  const currentUser = useSelector((state: RootState) => state.auth.user);
  const schoolId = (currentUser as any)?.schoolId;
  const dispatch = useDispatch();

  const { teachers: teacherMap, status: teacherMapStatus } = useSelector((state: RootState) => state.userMap);
  const teachersList = useMemo(() => {
    let list = Object.values(teacherMap || {});
    if (teacherSearchTerm) {
      list = list.filter(t => t.name.toLowerCase().includes(teacherSearchTerm.toLowerCase()));
    }
    return list.sort((a, b) => a.name.localeCompare(b.name, 'th'));
  }, [teacherMap]);

  useEffect(() => {
    if (schoolId) {
      if (teacherMapStatus === 'idle') {
        dispatch(fetchTeachersMap(schoolId) as any);
      }
      const init = async () => {
        await fetchClubs();
        // ดึงการตั้งค่าการย้ายชุมนุม
        try {
          const configRef = doc(db, 'school-settings', schoolId, 'configs', 'club_settings');
          const configSnap = await getDoc(configRef);
          if (configSnap.exists()) {
            const data = configSnap.data();
            setIsTransferEnabled(data.allowTransfer || false);
            setGlobalStartDate(data.registrationStartDate || '');
            setGlobalEndDate(data.registrationEndDate || '');
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
      const q = query(collection(db, 'school-settings', schoolId, 'clubs'), orderBy('createdAt', 'desc'));
      const snap = await getDocs(q);
      const clubsData = await Promise.all(snap.docs.map(async (doc) => {
        const club = { id: doc.id, ...doc.data() } as Club;
        const membersCollection = collection(db, 'school-settings', schoolId, 'clubs', doc.id, 'members');
        const membersSnap = await getDocs(membersCollection);
        return { ...club, memberCount: membersSnap.size };
      }));
      setClubs(clubsData);
    } catch (error) {
      console.error("Error fetching clubs:", error);
    } finally {
      setLoading(false);
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

      setPullableCourses(filtered);
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
      for (const course of selectedCourses) {
        const isDuplicate = clubs.some(c => c.name === course.title);
        if (isDuplicate) continue;

        const clubData = {
          name: course.title,
          description: course.description || `กิจกรรมชุมนุม ${course.title}`,
          capacity: 40,
          responsibleTeacherIds: Array.isArray(course.teacherId)
            ? course.teacherId.filter((id: string) => id && id !== 'pending')
            : (course.teacherId && course.teacherId !== 'pending' ? [course.teacherId] : []),
          imageUrl: '',
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        };
        await addDoc(collection(db, 'school-settings', schoolId, 'clubs'), clubData);
        importedCount++;
      }

      Swal.fire({
        icon: 'success',
        title: 'นำเข้าสำเร็จ',
        text: `นำเข้าชุมนุมใหม่ ${importedCount} รายการ`,
        timer: 2000,
        background: '#2a2b2f',
        color: '#fff'
      });
      fetchClubs();
      setIsPullModalOpen(false);
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

    if (!name || selectedTeachers.length === 0 || !capacity) {
      Swal.fire({
        icon: 'warning',
        title: 'ข้อมูลไม่ครบ',
        text: 'กรุณาระบุชื่อชุมนุม, จำนวนที่รับ และเลือกครูผู้รับผิดชอบอย่างน้อย 1 ท่าน',
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
        name,
        description,
        capacity: parseInt(capacity) || 0,
        responsibleTeacherIds: selectedTeachers,
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

      Swal.fire({
        icon: 'success',
        title: editingClub ? 'อัปเดตสำเร็จ' : 'บันทึกสำเร็จ',
        timer: 1500,
        showConfirmButton: false,
        background: '#2a2b2f',
        color: '#fff'
      });
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
        Swal.fire({
          icon: 'success',
          title: 'ลบสำเร็จ',
          timer: 1500,
          showConfirmButton: false,
          background: '#2a2b2f',
          color: '#fff'
        });
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
        allowTransfer: isTransferEnabled,
        registrationStartDate: globalStartDate,
        registrationEndDate: globalEndDate
      }, { merge: true });
      Swal.fire({
        icon: 'success',
        title: 'บันทึกการตั้งค่าสำเร็จ',
        showConfirmButton: false,
        toast: true,
        position: 'top-end'
      });
    } catch (error) {
      console.error("Error saving club settings:", error);
      Swal.fire('ผิดพลาด', 'ไม่สามารถบันทึกการตั้งค่าได้', 'error');
    } finally {
      setIsSettingsSaving(false);
    }
  };

  const getClubStatus = (club: Club): { text: string; color: string } => {
    const now = new Date();
    now.setHours(0, 0, 0, 0);
    if (globalStartDate && globalEndDate) {
      const start = new Date(globalStartDate);
      const end = new Date(globalEndDate);
      end.setHours(23, 59, 59, 999);

      if (now >= start && now <= end) return { text: 'เปิดรับสมัคร', color: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300' };
      if (now < start) return { text: 'ยังไม่เปิด', color: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300' };
      return { text: 'ปิดรับสมัคร', color: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300' };
    }
    return { text: 'ไม่ระบุเวลา', color: 'bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300' };
  };

  return (
    <MainLayout>
      <div className="p-4 sm:p-8 max-w-7xl mx-auto text-gray-900 dark:text-white transition-colors duration-300">

        {/* Page Header */}
        <div className="mb-8 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <BackButton to="/academic/hub/activities" className="mb-2" />
            <h1 className="text-3xl font-bold tracking-tight flex items-center gap-3">
              <Users className="text-indigo-500" size={32} />
              จัดการข้อมูลชุมนุม
            </h1>
            <p className="text-gray-500 dark:text-gray-400 mt-1">เพิ่มและจัดการรายชื่อชุมนุมสำหรับนักเรียน</p>
            <div className="flex flex-wrap items-center gap-3 mt-4">
              <button
                onClick={fetchPullableCourses}
                disabled={isPulling}
                className="flex items-center gap-2 bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400 px-4 py-2.5 rounded-xl font-bold text-sm transition-all hover:bg-indigo-100 dark:hover:bg-indigo-900/50 border border-indigo-100 dark:border-indigo-800"
              >
                {isPulling ? <RefreshCw size={18} className="animate-spin" /> : <Database size={18} />}
                ดึงจากโครงสร้างหลักสูตร
              </button>
            </div>
          </div>

          <div className="relative w-full md:w-80">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
            <input
              type="text"
              placeholder="ค้นหาชื่อชุมนุม..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-2.5 bg-white dark:bg-[#2a2b2f] border border-gray-200 dark:border-gray-700 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none transition-all shadow-sm"
            />
          </div>
        </div>

        {/* ส่วนการตั้งค่าระบบชุมนุม */}
        <div className="mb-6 bg-white dark:bg-[#2a2b2f] rounded-2xl p-6 shadow-sm border border-gray-100 dark:border-gray-700 animate-in fade-in slide-in-from-top-2">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-bold flex items-center gap-2">
              <Settings size={20} className="text-gray-500" />
              ตั้งค่าระบบชุมนุม
            </h3>
            <button
              onClick={handleSaveSettings}
              disabled={isSettingsSaving}
              className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2 rounded-lg font-medium text-sm transition-all disabled:opacity-50"
            >
              {isSettingsSaving ? <RefreshCw size={16} className="animate-spin" /> : <Save size={16} />}
              บันทึกการตั้งค่า
            </button>
          </div>
          <div className="space-y-4 pt-4 border-t border-gray-200 dark:border-gray-700">
            <div className="flex items-center justify-between">
              <div>
                <h4 className="font-bold text-sm">อนุญาตให้นักเรียนย้ายชุมนุม</h4>
                <p className="text-xs text-gray-500 dark:text-gray-400">เปิดเพื่อให้นักเรียนสามารถส่งคำขอย้ายชุมนุมได้ด้วยตนเอง</p>
              </div>
              <button onClick={() => setIsTransferEnabled(!isTransferEnabled)} className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none ${isTransferEnabled ? 'bg-indigo-600' : 'bg-gray-300 dark:bg-gray-600'}`}>
                <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${isTransferEnabled ? 'translate-x-6' : 'translate-x-1'}`} />
              </button>
            </div>

            <div className="pt-4 border-t border-gray-100 dark:border-gray-700 grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-bold text-gray-700 dark:text-gray-300 mb-1.5">วันที่เปิดรับสมัคร (ทุกชุมนุม)</label>
                <input
                  type="date"
                  value={globalStartDate}
                  onChange={(e) => setGlobalStartDate(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 outline-none focus:ring-2 focus:ring-indigo-500 transition-all text-sm"
                />
              </div>
              <div>
                <label className="block text-sm font-bold text-gray-700 dark:text-gray-300 mb-1.5">วันที่ปิดรับสมัคร (ทุกชุมนุม)</label>
                <input
                  type="date"
                  value={globalEndDate}
                  onChange={(e) => setGlobalEndDate(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 outline-none focus:ring-2 focus:ring-indigo-500 transition-all text-sm"
                />
              </div>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
          {/* Form Section */}
          <div className="lg:col-span-4">
            <div className="bg-white dark:bg-[#2a2b2f] rounded-2xl p-6 shadow-sm border border-gray-100 dark:border-gray-700 sticky top-24" id="club-form">
              <h2 className="text-xl font-bold mb-6 flex items-center gap-2">
                {editingClub ? <Edit3 className="text-amber-500" size={22} /> : <PlusCircle className="text-emerald-500" size={22} />}
                {editingClub ? 'แก้ไขข้อมูลชุมนุม' : 'เพิ่มชุมนุมใหม่'}
              </h2>
              <form onSubmit={handleSubmit} className="space-y-5">
                <div>
                  <label className="block text-sm font-bold text-gray-700 dark:text-gray-300 mb-1.5">ชื่อชุมนุม</label>
                  <input
                    type="text"
                    value={name}
                    onChange={e => setName(e.target.value)}
                    className="w-full px-4 py-2.5 rounded-xl border border-gray-300 dark:border-gray-600 bg-gray-50 dark:bg-gray-800 outline-none focus:ring-2 focus:ring-indigo-500 transition-all"
                    placeholder="เช่น ชุมนุมหุ่นยนต์ระดับโลก"
                  />
                </div>
                <div>
                  <label className="block text-sm font-bold text-gray-700 dark:text-gray-300 mb-1.5">รายละเอียดชุมนุม</label>
                  <textarea value={description} onChange={e => setDescription(e.target.value)} rows={3} className="w-full px-4 py-2.5 rounded-xl border border-gray-300 dark:border-gray-600 bg-gray-50 dark:bg-gray-800 outline-none focus:ring-2 focus:ring-indigo-500 resize-none transition-all" placeholder="อธิบายกิจกรรมหรือเป้าหมายของชุมนุม..." />
                </div>
                <div>
                  <label className="block text-sm font-bold text-gray-700 dark:text-gray-300 mb-1.5">จำนวนที่รับสมัคร (คน)</label>
                  <input
                    type="number"
                    value={capacity}
                    onChange={e => setCapacity(e.target.value)}
                    className="w-full px-4 py-2.5 rounded-xl border border-gray-300 dark:border-gray-600 bg-gray-50 dark:bg-gray-800 outline-none focus:ring-2 focus:ring-indigo-500 transition-all"
                    placeholder="เช่น 40"
                    min="1"
                  />
                </div>
                <div>
                  <label className="block text-sm font-bold text-gray-700 dark:text-gray-300 mb-2">รูปภาพชุมนุม</label>
                  <div className="flex items-center gap-4">
                    <div onClick={() => document.getElementById('club-image-input')?.click()} className="w-24 h-24 rounded-2xl border-2 border-dashed border-gray-300 dark:border-gray-600 flex flex-col items-center justify-center cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800 transition-all overflow-hidden relative group">
                      {imagePreview ? (
                        <img src={imagePreview} className="w-full h-full object-cover" alt="Preview" />
                      ) : (
                        <ImageIcon className="text-gray-400" size={24} />
                      )}
                      <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity">
                        <PlusCircle className="text-white" size={20} />
                      </div>
                    </div>
                    <input type="file" id="club-image-input" hidden accept="image/*" onChange={handleImageChange} />
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-bold text-gray-700 dark:text-gray-300 mb-2">ครูผู้รับผิดชอบ (เพิ่มได้ไม่จำกัด)</label>

                  {/* Search Teacher */}
                  <div className="relative mb-2">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={14} />
                    <input
                      type="text"
                      placeholder="ค้นหาชื่อครู..."
                      value={teacherSearchTerm}
                      onChange={(e) => setTeacherSearchTerm(e.target.value)}
                      className="w-full pl-9 pr-4 py-2 text-xs bg-gray-100 dark:bg-gray-700 border-none rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none"
                    />
                  </div>

                  <div className="max-h-44 overflow-y-auto border border-gray-200 dark:border-gray-700 rounded-xl p-1 space-y-1 bg-gray-50 dark:bg-gray-800 custom-scrollbar">
                    {teachersList.length > 0 ? (
                      teachersList.map(t => (
                        <label key={t.id} className={`flex items-center gap-3 p-2 rounded-lg cursor-pointer transition-all ${selectedTeachers.includes(t.id) ? 'bg-indigo-50 dark:bg-indigo-900/30 border-indigo-100 dark:border-indigo-800' : 'hover:bg-white dark:hover:bg-gray-700'}`}>
                          <input type="checkbox" checked={selectedTeachers.includes(t.id)} onChange={() => toggleTeacher(t.id)} className="w-4 h-4 text-indigo-600 rounded focus:ring-indigo-500" />
                          <span className={`text-sm ${selectedTeachers.includes(t.id) ? 'font-bold text-indigo-700 dark:text-indigo-300' : 'text-gray-600 dark:text-gray-400'}`}>{t.name}</span>
                        </label>
                      ))
                    ) : (
                      <div className="p-4 text-center text-xs text-gray-400">ไม่พบรายชื่อครู</div>
                    )}
                  </div>
                </div>
                <div className="flex gap-3 pt-2">
                  {editingClub && (
                    <button type="button" onClick={resetForm} className="w-full py-3 bg-gray-200 hover:bg-gray-300 text-gray-800 font-bold rounded-xl transition-all flex items-center justify-center gap-2">
                      <X size={20} /> ยกเลิก
                    </button>
                  )}
                  <button type="submit" disabled={isSubmitting} className={`w-full py-3 ${editingClub ? 'bg-amber-600 hover:bg-amber-700' : 'bg-indigo-600 hover:bg-indigo-700'} text-white font-bold rounded-xl shadow-lg shadow-indigo-200 dark:shadow-none transition-all flex items-center justify-center gap-2`}>
                    <Save size={20} /> {isSubmitting ? (editingClub ? 'กำลังอัปเดต...' : 'กำลังบันทึก...') : (editingClub ? 'อัปเดตข้อมูล' : 'บันทึกข้อมูลชุมนุม')}
                  </button>
                </div>
              </form>
            </div>
          </div>

          {/* List Section */}
          <div className="lg:col-span-7">
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
              <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
                {filteredClubs.map(club => {
                  const status = getClubStatus(club);
                  return (
                    <div key={club.id} className="bg-white dark:bg-[#2a2b2f] rounded-2xl p-4 shadow-sm border border-gray-100 dark:border-gray-700 flex gap-4 group hover:shadow-md transition-all">
                      <div className="w-24 h-24 sm:w-32 sm:h-32 rounded-xl overflow-hidden bg-gray-100 dark:bg-gray-800 flex-shrink-0">
                        {club.imageUrl ? (
                          <img src={club.imageUrl} className="w-full h-full object-cover" alt={club.name} />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center text-gray-400"><ImageIcon size={32} /></div>
                        )}
                      </div>
                      <div className="flex-grow flex flex-col">
                        <div className="flex-grow">
                          <div className="flex justify-between items-start">
                            <h3 className="text-lg font-bold text-indigo-600 dark:text-indigo-400 pr-2 line-clamp-1">{club.name}</h3>
                            <div className="flex items-center flex-shrink-0">
                              <button onClick={() => handleEdit(club)} className="p-2 text-gray-400 hover:text-amber-500 transition-colors"><Edit3 size={18} /></button>
                              <button onClick={() => handleDelete(club.id)} className="p-2 text-gray-400 hover:text-red-500 transition-colors"><Trash2 size={18} /></button>
                            </div>
                          </div>
                          <p className="text-sm text-gray-500 dark:text-gray-400 line-clamp-1 mt-1 mb-2">{club.description || 'ไม่มีรายละเอียด'}</p>
                          <div className="flex flex-wrap gap-2 text-xs font-bold">
                            <div className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg ${status.color}`}>
                              {status.text}
                            </div>
                            <div className="flex items-center gap-1.5 px-2.5 py-1 bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 rounded-lg">
                              <Users size={14} />
                              {club.memberCount || 0} / {club.capacity || 0} คน
                            </div>
                          </div>
                          <div className="mt-2 text-xs text-gray-500 dark:text-gray-400">
                            {globalStartDate && globalEndDate ? (
                              <span>เปิดรับสมัคร: {new Date(globalStartDate).toLocaleDateString('th-TH')} - {new Date(globalEndDate).toLocaleDateString('th-TH')}</span>
                            ) : (
                              <span>ไม่จำกัดเวลา</span>
                            )}
                          </div>
                        </div>
                        <div className="pt-2 mt-2 border-t border-gray-100 dark:border-gray-700">
                          <h4 className="text-xs font-bold text-gray-400 mb-1.5">ครูผู้รับผิดชอบ</h4>
                          <div className="flex flex-wrap gap-1.5">
                            {club.responsibleTeacherIds?.map(tid => (
                              <span key={tid} className="px-2 py-0.5 bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300 rounded-full text-[10px] font-medium">
                                {teacherMap?.[tid]?.name || 'ไม่พบข้อมูล'}
                              </span>
                            ))}
                          </div>
                        </div>
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
          <div className="bg-white dark:bg-[#2a2b2f] w-full max-w-2xl rounded-3xl shadow-2xl overflow-hidden border border-gray-100 dark:border-gray-700">
            <div className="p-6 border-b border-gray-100 dark:border-gray-700 flex items-center justify-between">
              <div>
                <h3 className="text-xl font-bold flex items-center gap-2">
                  <Database className="text-indigo-500" />
                  ดึงข้อมูลจากรายวิชา
                </h3>
                <p className="text-sm text-gray-500 mt-1">พบรายวิชาที่น่าจะเป็นกิจกรรมชุมนุม {pullableCourses.length} รายการ</p>
              </div>
              <button onClick={() => setIsPullModalOpen(false)} className="p-2 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-full transition-colors text-gray-400">
                <X size={20} />
              </button>
            </div>
            <div className="p-6 max-h-[60vh] overflow-y-auto custom-scrollbar">
              <div className="space-y-3">
                {pullableCourses.map(course => (
                  <div key={course.id} className="flex items-center justify-between p-4 bg-gray-50 dark:bg-gray-800/50 rounded-2xl border border-gray-100 dark:border-gray-700 hover:border-indigo-300 dark:hover:border-indigo-500/50 transition-all group">
                    <div className="flex-grow">
                      <div className="font-bold text-gray-900 dark:text-white">{course.title}</div>
                      <div className="text-xs text-gray-500 dark:text-gray-400 flex items-center gap-2 mt-1">
                        <span className="px-2 py-0.5 bg-gray-200 dark:bg-gray-700 rounded-md">{course.code || 'ไม่มีรหัส'}</span>
                        <span>•</span>
                        <span>{course.subjectGroup}</span>
                      </div>
                    </div>
                    <button
                      onClick={() => handleSavePulledCourses([course])}
                      disabled={isSubmitting}
                      className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-xl text-sm font-bold transition-all transform hover:scale-105"
                    >
                      <Copy size={16} />
                      ดึงข้อมูล
                    </button>
                  </div>
                ))}
                {pullableCourses.length === 0 && (
                  <div className="text-center py-10">
                    <div className="bg-gray-100 dark:bg-gray-800 w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4">
                      <Database className="text-gray-400" size={32} />
                    </div>
                    <p className="text-gray-500">ไม่พบรายวิชาที่เกี่ยวข้องกับชุมนุม</p>
                  </div>
                )}
              </div>
            </div>
            <div className="p-6 bg-gray-50 dark:bg-gray-800/30 border-t border-gray-100 dark:border-gray-700 flex justify-end gap-3">
              <button
                onClick={() => handleSavePulledCourses(pullableCourses)}
                disabled={isSubmitting || pullableCourses.length === 0}
                className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white px-6 py-2.5 rounded-xl font-bold transition-all disabled:opacity-50"
              >
                {isSubmitting ? <RefreshCw size={20} className="animate-spin" /> : <Database size={20} />}
                ดึงข้อมูลทั้งหมดเข้าสู่ระบบ
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