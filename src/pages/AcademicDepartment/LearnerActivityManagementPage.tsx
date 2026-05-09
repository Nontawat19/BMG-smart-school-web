import React, { useEffect, useMemo, useState } from 'react';
import BackButton from '@/components/Shared/BackButton';
import MainLayout from '@/layouts/MainLayout';
import { firestore as db } from '@/firebase';
import { RootState } from '@/store';
import { fetchTeachersMap } from '@/store/slices/userMapSlice';
import { addDoc, collection, deleteDoc, doc, getDocs, orderBy, query, serverTimestamp, updateDoc } from 'firebase/firestore';
import { BookOpenCheck, ClipboardList, Database, Edit3, Plus, RefreshCw, Save, Search, Trash2, UserCheck, X } from 'lucide-react';
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
  responsibleTeacherIds: string[];
  createdAt?: any;
  updatedAt?: any;
}

const LearnerActivityManagementPage: React.FC = () => {
  const currentUser = useSelector((state: RootState) => state.auth.user);
  const schoolId = (currentUser as any)?.schoolId;
  const dispatch = useDispatch();
  const { teachers: teacherMap, status: teacherMapStatus } = useSelector((state: RootState) => state.userMap);

  const [activities, setActivities] = useState<LearnerActivity[]>([]);
  const [courses, setCourses] = useState<Course[]>([]);
  const [selectedCourseId, setSelectedCourseId] = useState('');
  const [selectedTeachers, setSelectedTeachers] = useState<string[]>([]);
  const [description, setDescription] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [courseSearch, setCourseSearch] = useState('');
  const [teacherSearch, setTeacherSearch] = useState('');
  const [editingActivity, setEditingActivity] = useState<LearnerActivity | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (schoolId && teacherMapStatus === 'idle') {
      dispatch(fetchTeachersMap(schoolId) as any);
    }
  }, [schoolId, teacherMapStatus, dispatch]);

  useEffect(() => {
    if (!schoolId) return;
    fetchData();
  }, [schoolId]);

  const fetchData = async () => {
    if (!schoolId) return;
    setLoading(true);
    try {
      const [activitySnap, courseSnap] = await Promise.all([
        getDocs(query(collection(db, 'school-settings', schoolId, 'learner-activities'), orderBy('createdAt', 'desc'))),
        getDocs(query(collection(db, 'school-settings', schoolId, 'courses'), orderBy('code', 'asc'))),
      ]);
      setActivities(activitySnap.docs.map(d => ({ id: d.id, ...d.data() } as LearnerActivity)));
      setCourses(courseSnap.docs.map(d => ({ id: d.id, ...d.data() } as Course)));
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
  }, [courses, courseSearch]);

  const selectedCourse = useMemo(
    () => courses.find(course => course.id === selectedCourseId),
    [courses, selectedCourseId]
  );

  const teachersList = useMemo(() => {
    return Object.values(teacherMap || {})
      .filter((teacher: any) => !teacherSearch || String(teacher.name || '').toLowerCase().includes(teacherSearch.toLowerCase()))
      .sort((a: any, b: any) => String(a.name || '').localeCompare(String(b.name || ''), 'th')) as any[];
  }, [teacherMap, teacherSearch]);

  const filteredActivities = useMemo(() => {
    const term = searchTerm.toLowerCase();
    return activities.filter(activity => {
      const text = `${activity.courseCode || ''} ${activity.name || ''} ${activity.description || ''}`.toLowerCase();
      return !term || text.includes(term);
    });
  }, [activities, searchTerm]);

  const toggleTeacher = (teacherId: string) => {
    setSelectedTeachers(prev => prev.includes(teacherId) ? prev.filter(id => id !== teacherId) : [...prev, teacherId]);
  };

  const resetForm = () => {
    setEditingActivity(null);
    setSelectedCourseId('');
    setSelectedTeachers([]);
    setDescription('');
    setCourseSearch('');
    setTeacherSearch('');
  };

  const handleCourseSelect = (course: Course) => {
    setSelectedCourseId(course.id);
    setDescription('');
    const teacherIds = (course.teacherAssignments || [])
      .map(assignment => assignment.teacherId)
      .filter((id): id is string => Boolean(id && id !== 'pending'));
    setSelectedTeachers(Array.from(new Set(teacherIds)));
  };

  const handleEdit = (activity: LearnerActivity) => {
    setEditingActivity(activity);
    setSelectedCourseId(activity.courseId);
    setDescription(activity.description || '');
    setSelectedTeachers(activity.responsibleTeacherIds || []);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!schoolId || saving) return;
    if (!selectedCourse) {
      Swal.fire('ข้อมูลไม่ครบ', 'กรุณาเลือกกิจกรรมจากหลักสูตร', 'warning');
      return;
    }
    if (selectedTeachers.length === 0) {
      Swal.fire('ข้อมูลไม่ครบ', 'กรุณาเลือกครูผู้ดูแลอย่างน้อย 1 คน', 'warning');
      return;
    }

    const duplicate = activities.find(activity => activity.courseId === selectedCourse.id && activity.id !== editingActivity?.id);
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
        semester: selectedCourse.semester || '',
        classId: selectedCourse.classId || '',
        responsibleTeacherIds: selectedTeachers,
        updatedAt: serverTimestamp(),
      };

      if (editingActivity) {
        await updateDoc(doc(db, 'school-settings', schoolId, 'learner-activities', editingActivity.id), payload);
      } else {
        await addDoc(collection(db, 'school-settings', schoolId, 'learner-activities'), {
          ...payload,
          createdAt: serverTimestamp(),
        });
      }

      Swal.fire({ icon: 'success', title: editingActivity ? 'อัปเดตสำเร็จ' : 'เพิ่มกิจกรรมสำเร็จ', timer: 1400, showConfirmButton: false });
      resetForm();
      fetchData();
    } catch (error) {
      console.error('Error saving learner activity:', error);
      Swal.fire('เกิดข้อผิดพลาด', 'ไม่สามารถบันทึกข้อมูลได้', 'error');
    } finally {
      setSaving(false);
    }
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
      <div className="min-h-screen p-4 sm:p-8 text-gray-900 dark:text-white">
        <div className="mx-auto max-w-7xl">
          <div className="mb-6 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <BackButton to="/academic/hub/activities" className="mb-3" />
              <h1 className="flex items-center gap-3 text-2xl sm:text-3xl font-black">
                <BookOpenCheck className="text-indigo-500" size={32} />
                จัดการกิจกรรมพัฒนาผู้เรียน
              </h1>
              <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                เลือกกิจกรรมจากหลักสูตร และกำหนดครูผู้ดูแลสำหรับการเช็คชื่อ
              </p>
            </div>
            <div className="relative w-full lg:w-80">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
              <input
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
                placeholder="ค้นหากิจกรรม..."
                className="h-12 w-full rounded-2xl border border-gray-200 bg-white pl-10 pr-4 text-sm font-bold outline-none focus:ring-2 focus:ring-indigo-500/20 dark:border-gray-700 dark:bg-[#2a2b2f]"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 gap-6 xl:grid-cols-12">
            <section className="xl:col-span-5">
              <form onSubmit={handleSubmit} className="rounded-3xl border border-gray-100 bg-white p-4 sm:p-6 shadow-sm dark:border-gray-700 dark:bg-[#2a2b2f]">
                <div className="mb-5 flex items-center justify-between gap-3">
                  <h2 className="flex items-center gap-2 text-lg font-black">
                    {editingActivity ? <Edit3 className="text-amber-500" /> : <Plus className="text-emerald-500" />}
                    {editingActivity ? 'แก้ไขกิจกรรม' : 'เพิ่มกิจกรรมจากหลักสูตร'}
                  </h2>
                  {editingActivity && (
                    <button type="button" onClick={resetForm} className="inline-flex h-9 items-center gap-1 rounded-xl bg-gray-100 px-3 text-xs font-black text-gray-600 dark:bg-white/10 dark:text-gray-300">
                      <X size={15} /> ยกเลิก
                    </button>
                  )}
                </div>

                <div className="space-y-5">
                  <div>
                    <label className="mb-2 block text-xs font-black uppercase tracking-widest text-gray-500 dark:text-gray-400">กิจกรรมจากหลักสูตร</label>
                    <div className="relative mb-3">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={16} />
                      <input
                        value={courseSearch}
                        onChange={e => setCourseSearch(e.target.value)}
                        placeholder="ค้นหารหัส/ชื่อกิจกรรม..."
                        className="h-11 w-full rounded-xl border border-gray-200 bg-gray-50 pl-10 pr-4 text-sm outline-none focus:ring-2 focus:ring-indigo-500/20 dark:border-gray-700 dark:bg-[#1e1f21]"
                      />
                    </div>
                    <div className="max-h-64 overflow-y-auto rounded-2xl border border-gray-200 bg-gray-50 p-1 dark:border-gray-700 dark:bg-[#1e1f21]">
                      {activityCourses.map(course => (
                        <button
                          key={course.id}
                          type="button"
                          onClick={() => handleCourseSelect(course)}
                          className={`mb-1 flex w-full items-start gap-3 rounded-xl p-3 text-left transition ${selectedCourseId === course.id ? 'bg-indigo-600 text-white' : 'hover:bg-white dark:hover:bg-white/5'}`}
                        >
                          <ClipboardList size={18} className="mt-0.5 shrink-0" />
                          <span className="min-w-0">
                            <span className="block truncate text-sm font-black">{course.code ? `${course.code} ` : ''}{course.title}</span>
                            <span className={`block truncate text-xs ${selectedCourseId === course.id ? 'text-indigo-100' : 'text-gray-500 dark:text-gray-400'}`}>{course.subjectGroup || 'ไม่ระบุกลุ่มสาระ'} • ภาคเรียน {String(course.semester || 'ไม่ระบุ')}</span>
                          </span>
                        </button>
                      ))}
                      {activityCourses.length === 0 && (
                        <div className="p-6 text-center text-sm text-gray-500">ไม่พบกิจกรรมจากหลักสูตร</div>
                      )}
                    </div>
                  </div>

                  <div>
                    <label className="mb-2 block text-xs font-black uppercase tracking-widest text-gray-500 dark:text-gray-400">รายละเอียดเพิ่มเติม</label>
                    <textarea
                      value={description}
                      onChange={e => setDescription(e.target.value)}
                      rows={3}
                      placeholder="ระบุรายละเอียด/หมายเหตุเพิ่มเติม"
                      className="w-full resize-none rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-indigo-500/20 dark:border-gray-700 dark:bg-[#1e1f21]"
                    />
                  </div>

                  <div>
                    <label className="mb-2 block text-xs font-black uppercase tracking-widest text-gray-500 dark:text-gray-400">ครูผู้ดูแล</label>
                    <div className="relative mb-3">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={16} />
                      <input
                        value={teacherSearch}
                        onChange={e => setTeacherSearch(e.target.value)}
                        placeholder="ค้นหาชื่อครู..."
                        className="h-11 w-full rounded-xl border border-gray-200 bg-gray-50 pl-10 pr-4 text-sm outline-none focus:ring-2 focus:ring-indigo-500/20 dark:border-gray-700 dark:bg-[#1e1f21]"
                      />
                    </div>
                    <div className="max-h-52 overflow-y-auto rounded-2xl border border-gray-200 bg-gray-50 p-1 dark:border-gray-700 dark:bg-[#1e1f21]">
                      {teachersList.map((teacher: any) => (
                        <label key={teacher.id} className={`mb-1 flex cursor-pointer items-center gap-3 rounded-xl p-3 transition ${selectedTeachers.includes(teacher.id) ? 'bg-indigo-50 text-indigo-700 dark:bg-indigo-500/15 dark:text-indigo-300' : 'hover:bg-white dark:hover:bg-white/5'}`}>
                          <input type="checkbox" checked={selectedTeachers.includes(teacher.id)} onChange={() => toggleTeacher(teacher.id)} className="h-4 w-4 rounded text-indigo-600" />
                          <span className="text-sm font-bold">{teacher.name}</span>
                        </label>
                      ))}
                    </div>
                  </div>

                  <button type="submit" disabled={saving} className="flex h-12 w-full items-center justify-center gap-2 rounded-2xl bg-indigo-600 text-sm font-black text-white shadow-lg shadow-indigo-500/20 transition hover:bg-indigo-500 disabled:opacity-60">
                    {saving ? <RefreshCw className="animate-spin" size={18} /> : <Save size={18} />}
                    {editingActivity ? 'อัปเดตกิจกรรม' : 'บันทึกกิจกรรม'}
                  </button>
                </div>
              </form>
            </section>

            <section className="xl:col-span-7">
              <div className="rounded-3xl border border-gray-100 bg-white shadow-sm dark:border-gray-700 dark:bg-[#2a2b2f]">
                <div className="border-b border-gray-100 p-4 sm:p-5 dark:border-gray-700">
                  <h2 className="flex items-center gap-2 text-lg font-black">
                    <Database className="text-amber-500" />
                    รายการกิจกรรมที่เปิดเช็คชื่อ ({filteredActivities.length})
                  </h2>
                </div>
                {loading ? (
                  <div className="p-10 text-center text-gray-500">กำลังโหลดข้อมูล...</div>
                ) : filteredActivities.length === 0 ? (
                  <div className="p-10 text-center text-gray-500">ยังไม่มีกิจกรรมพัฒนาผู้เรียน</div>
                ) : (
                  <div className="grid grid-cols-1 gap-3 p-4 sm:p-5">
                    {filteredActivities.map(activity => (
                      <article key={activity.id} className="rounded-2xl border border-gray-100 bg-gray-50 p-4 dark:border-gray-700 dark:bg-[#1e1f21]">
                        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                          <div className="min-w-0">
                            <div className="mb-2 flex flex-wrap items-center gap-2">
                              <span className="rounded-lg bg-indigo-600 px-2 py-1 text-xs font-black text-white">{activity.courseCode || 'ไม่มีรหัส'}</span>
                              <span className="rounded-lg bg-white px-2 py-1 text-xs font-bold text-gray-500 dark:bg-white/5 dark:text-gray-300">{activity.subjectGroup || 'กิจกรรมพัฒนาผู้เรียน'}</span>
                            </div>
                            <h3 className="text-base font-black text-gray-900 dark:text-white">{activity.name}</h3>
                            {activity.description && <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">{activity.description}</p>}
                          </div>
                          <div className="flex shrink-0 gap-2">
                            <button onClick={() => handleEdit(activity)} className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-amber-100 text-amber-600 hover:bg-amber-200 dark:bg-amber-500/15 dark:text-amber-300">
                              <Edit3 size={18} />
                            </button>
                            <button onClick={() => handleDelete(activity)} className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-red-100 text-red-600 hover:bg-red-200 dark:bg-red-500/15 dark:text-red-300">
                              <Trash2 size={18} />
                            </button>
                          </div>
                        </div>
                        <div className="mt-3 border-t border-gray-200 pt-3 dark:border-gray-700">
                          <div className="mb-2 flex items-center gap-2 text-xs font-black uppercase tracking-widest text-gray-500 dark:text-gray-400">
                            <UserCheck size={14} /> ครูผู้ดูแล
                          </div>
                          <div className="flex flex-wrap gap-2">
                            {(activity.responsibleTeacherIds || []).map(teacherId => (
                              <span key={teacherId} className="rounded-full bg-white px-3 py-1 text-xs font-bold text-gray-600 dark:bg-white/5 dark:text-gray-300">
                                {(teacherMap as any)?.[teacherId]?.name || 'ไม่พบข้อมูลครู'}
                              </span>
                            ))}
                          </div>
                        </div>
                      </article>
                    ))}
                  </div>
                )}
              </div>
            </section>
          </div>
        </div>
      </div>
    </MainLayout>
  );
};

export default LearnerActivityManagementPage;
