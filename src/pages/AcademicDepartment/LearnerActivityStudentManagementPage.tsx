import React, { useEffect, useMemo, useState } from 'react';
import BackButton from '@/components/Shared/BackButton';
import MainLayout from '@/layouts/MainLayout';
import { firestore as db } from '@/firebase';
import { RootState } from '@/store';
import { fetchCalendar } from '@/store/slices/calendarSlice';
import { collection, doc, getDoc, getDocs, orderBy, query, serverTimestamp, updateDoc, writeBatch } from 'firebase/firestore';
import { getCurrentThaiYear } from '@/utils/dateUtils';
import { getClassOptionsBySchoolSettings } from '@/utils/schoolUtils';
import { BookOpenCheck, CheckCircle2, ChevronLeft, ChevronRight, ClipboardList, RefreshCw, Save, Search, Users } from 'lucide-react';
import { useDispatch, useSelector } from 'react-redux';
import Swal from 'sweetalert2';

interface LearnerActivity {
  id: string;
  courseId: string;
  courseCode?: string;
  name: string;
  description?: string;
  subjectGroup?: string;
  semester?: string | number;
  classId?: string | string[];
  responsibleTeacherIds?: string[];
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

interface SchoolSettings {
  schoolType?: string;
  opportunityExpansionLevel?: string;
}

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

const LearnerActivityStudentManagementPage: React.FC = () => {
  const currentUser = useSelector((state: RootState) => state.auth.user);
  const schoolId = (currentUser as any)?.schoolId;
  const calendarState = useSelector((state: RootState) => state.calendar);
  const dispatch = useDispatch();

  const [activities, setActivities] = useState<LearnerActivity[]>([]);
  const [students, setStudents] = useState<Student[]>([]);
  const [schoolSettings, setSchoolSettings] = useState<SchoolSettings | null>(null);
  const [selectedActivityId, setSelectedActivityId] = useState('');
  const [selectedStudents, setSelectedStudents] = useState<string[]>([]);
  const [selectedAssignedIds, setSelectedAssignedIds] = useState<string[]>([]);
  const [selectedAvailableIds, setSelectedAvailableIds] = useState<string[]>([]);
  const [activitySearch, setActivitySearch] = useState('');
  const [studentSearch, setStudentSearch] = useState('');
  const [activeYear, setActiveYear] = useState(String(getCurrentThaiYear()));
  const [selectedClassLevel, setSelectedClassLevel] = useState('ALL');
  const [selectedRoom, setSelectedRoom] = useState('ALL');
  const [loading, setLoading] = useState(true);
  const [membersLoading, setMembersLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (schoolId && calendarState.status === 'idle') {
      dispatch(fetchCalendar(schoolId) as any);
    }
  }, [schoolId, calendarState.status, dispatch]);

  useEffect(() => {
    if (calendarState.academicYear) setActiveYear(calendarState.academicYear);
  }, [calendarState.academicYear]);

  useEffect(() => {
    if (!schoolId) return;
    const fetchData = async () => {
      setLoading(true);
      try {
        const [activitySnap, studentSnap, schoolSnap] = await Promise.all([
          getDocs(query(collection(db, 'school-settings', schoolId, 'learner-activities'), orderBy('createdAt', 'desc'))),
          getDocs(query(collection(db, 'school-settings', schoolId, 'students'), orderBy('firstName', 'asc'))),
          getDoc(doc(db, 'school-settings', schoolId)),
        ]);
        setActivities(activitySnap.docs.map(d => ({ id: d.id, ...d.data() } as LearnerActivity)));
        setStudents(studentSnap.docs.map(d => ({ id: d.id, ...d.data() } as Student)).filter(isActiveStudent));
        setSchoolSettings(schoolSnap.exists() ? (schoolSnap.data() as SchoolSettings) : null);
      } catch (error) {
        console.error('Error loading learner activity students page:', error);
        Swal.fire('เกิดข้อผิดพลาด', 'ไม่สามารถโหลดข้อมูลได้', 'error');
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, [schoolId]);

  const selectedActivity = useMemo(
    () => activities.find(activity => activity.id === selectedActivityId) || null,
    [activities, selectedActivityId]
  );
  const selectedSemester = normalizeSemester(selectedActivity?.semester);

  const academicYearOptions = useMemo(() => {
    const base = Number(calendarState.academicYear || activeYear || getCurrentThaiYear());
    return Array.from({ length: 5 }, (_, index) => String(base - index));
  }, [calendarState.academicYear, activeYear]);

  const filteredActivities = useMemo(() => {
    const term = activitySearch.toLowerCase();
    return activities.filter(activity => {
      const text = `${activity.courseCode || ''} ${activity.name || ''} ${activity.description || ''}`.toLowerCase();
      return !term || text.includes(term);
    });
  }, [activities, activitySearch]);

  const assignedStudents = useMemo(() => {
    const selectedSet = new Set(selectedStudents);
    return students.filter(student => selectedSet.has(student.id)).sort(sortStudents);
  }, [students, selectedStudents]);

  const classOptions = useMemo(() => {
    return getClassOptionsBySchoolSettings(
      schoolSettings?.opportunityExpansionLevel,
      schoolSettings?.schoolType
    ).map(([, label]) => label);
  }, [schoolSettings?.opportunityExpansionLevel, schoolSettings?.schoolType]);

  useEffect(() => {
    if (selectedClassLevel !== 'ALL' && classOptions.length > 0 && !classOptions.includes(selectedClassLevel)) {
      setSelectedClassLevel('ALL');
      setSelectedRoom('ALL');
    }
  }, [classOptions, selectedClassLevel]);

  const roomOptions = useMemo(() => {
    return Array.from(new Set(students
      .filter(student => selectedClassLevel === 'ALL' || student.classLevel === selectedClassLevel)
      .map(student => student.room)
      .filter(Boolean) as string[]))
      .sort((a, b) => a.localeCompare(b, 'th', { numeric: true }));
  }, [students, selectedClassLevel]);

  const availableStudents = useMemo(() => {
    const selectedSet = new Set(selectedStudents);
    const term = studentSearch.toLowerCase();
    return students
      .filter(student => !selectedSet.has(student.id))
      .filter(student => selectedClassLevel === 'ALL' || student.classLevel === selectedClassLevel)
      .filter(student => selectedRoom === 'ALL' || String(student.room || '') === selectedRoom)
      .filter(student => {
        const text = `${student.studentId || ''} ${student.firstName || ''} ${student.lastName || ''} ${student.classLevel || ''}/${student.room || ''}`.toLowerCase();
        return !term || text.includes(term);
      })
      .sort(sortStudents);
  }, [students, selectedStudents, selectedClassLevel, selectedRoom, studentSearch]);

  const loadMembers = async (activity: LearnerActivity | null, year = activeYear) => {
    if (!schoolId || !activity) {
      setSelectedStudents([]);
      return;
    }
    setMembersLoading(true);
    try {
      const membersSnap = await getDocs(collection(db, 'school-settings', schoolId, 'learner-activities', activity.id, 'members'));
      const ids = membersSnap.docs
        .map(memberDoc => memberDoc.data() as any)
        .filter(member =>
          String(member.academicYear || '') === year &&
          semesterOverlaps(member.semester, activity.semester)
        )
        .map(member => String(member.studentId || ''))
        .filter(Boolean);
      setSelectedStudents(Array.from(new Set(ids)));
      setSelectedAssignedIds([]);
      setSelectedAvailableIds([]);
    } catch (error) {
      console.error('Error loading learner activity members:', error);
      Swal.fire('เกิดข้อผิดพลาด', 'ไม่สามารถโหลดรายชื่อนักเรียนในกิจกรรมได้', 'error');
    } finally {
      setMembersLoading(false);
    }
  };

  const handleActivitySelect = async (activity: LearnerActivity) => {
    setSelectedActivityId(activity.id);
    await loadMembers(activity);
  };

  useEffect(() => {
    if (selectedActivity) loadMembers(selectedActivity, activeYear);
  }, [activeYear]);

  const toggleAssigned = (studentId: string) => {
    setSelectedAssignedIds(prev => prev.includes(studentId) ? prev.filter(id => id !== studentId) : [...prev, studentId]);
  };

  const toggleAvailable = (studentId: string) => {
    setSelectedAvailableIds(prev => prev.includes(studentId) ? prev.filter(id => id !== studentId) : [...prev, studentId]);
  };

  const addSelectedStudents = () => {
    setSelectedStudents(prev => Array.from(new Set([...prev, ...selectedAvailableIds])));
    setSelectedAvailableIds([]);
  };

  const removeSelectedStudents = () => {
    setSelectedStudents(prev => prev.filter(id => !selectedAssignedIds.includes(id)));
    setSelectedAssignedIds([]);
  };

  const handleSave = async () => {
    if (!schoolId || !selectedActivity || saving) return;
    setSaving(true);
    try {
      const activitySemester = selectedSemester;
      const membersRef = collection(db, 'school-settings', schoolId, 'learner-activities', selectedActivity.id, 'members');
      const existingSnap = await getDocs(membersRef);
      const batch = writeBatch(db);
      existingSnap.docs.forEach(memberDoc => {
        const member = memberDoc.data() as any;
        if (String(member.academicYear || '') === activeYear && semesterOverlaps(member.semester, activitySemester)) {
          batch.delete(memberDoc.ref);
        }
      });
      selectedStudents.forEach(studentId => {
        const student = students.find(item => item.id === studentId);
        const memberDocId = `${activeYear}_${activitySemester}_${studentId}`;
        batch.set(doc(db, 'school-settings', schoolId, 'learner-activities', selectedActivity.id, 'members', memberDocId), {
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
      batch.update(doc(db, 'school-settings', schoolId, 'learner-activities', selectedActivity.id), {
        memberCountByYear: { [activeYear]: selectedStudents.length },
        updatedAt: serverTimestamp(),
      });
      await batch.commit();
      Swal.fire({ icon: 'success', title: 'บันทึกรายชื่อนักเรียนสำเร็จ', timer: 1400, showConfirmButton: false });
    } catch (error) {
      console.error('Error saving learner activity members:', error);
      Swal.fire('เกิดข้อผิดพลาด', 'ไม่สามารถบันทึกรายชื่อนักเรียนได้', 'error');
    } finally {
      setSaving(false);
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
                <BookOpenCheck className="text-emerald-500" size={32} />
                จัดรายชื่อนักเรียนกิจกรรมพัฒนาผู้เรียน
              </h1>
              <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">เลือกปีการศึกษา ชั้น ห้อง และย้ายนักเรียนเข้าออกกิจกรรม</p>
            </div>
            <button
              onClick={handleSave}
              disabled={!selectedActivity || saving}
              className="inline-flex h-12 items-center justify-center gap-2 rounded-2xl bg-emerald-600 px-5 text-sm font-black text-white shadow-lg shadow-emerald-500/20 transition hover:bg-emerald-500 disabled:opacity-50"
            >
              {saving ? <RefreshCw className="animate-spin" size={18} /> : <Save size={18} />}
              บันทึกรายชื่อนักเรียน
            </button>
          </div>

          <div className="grid grid-cols-1 gap-4 xl:grid-cols-[330px_1fr]">
            <section className="rounded-3xl border border-gray-100 bg-white shadow-sm dark:border-gray-700 dark:bg-[#2a2b2f] overflow-hidden">
              <div className="border-b border-gray-100 p-4 dark:border-gray-700">
                <h2 className="flex items-center gap-2 text-sm font-black"><ClipboardList className="text-emerald-500" size={18} /> กิจกรรมที่เปิดเช็คชื่อ</h2>
                <div className="relative mt-3">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={16} />
                  <input value={activitySearch} onChange={e => setActivitySearch(e.target.value)} placeholder="ค้นหากิจกรรม..." className="h-11 w-full rounded-xl border border-gray-200 bg-gray-50 pl-10 pr-4 text-sm outline-none focus:ring-2 focus:ring-emerald-500/20 dark:border-gray-700 dark:bg-[#1e1f21]" />
                </div>
              </div>
              <div className="max-h-[700px] overflow-y-auto p-3">
                {loading ? <div className="p-8 text-center text-sm text-gray-500">กำลังโหลด...</div> : filteredActivities.map(activity => {
                  const isSelected = selectedActivityId === activity.id;
                  return (
                    <button key={activity.id} type="button" onClick={() => handleActivitySelect(activity)} className={`mb-2 flex w-full items-start gap-3 rounded-2xl border p-3 text-left transition ${isSelected ? 'border-emerald-500 bg-emerald-600 text-white shadow-lg shadow-emerald-500/20' : 'border-gray-100 bg-gray-50 hover:border-emerald-200 dark:border-gray-700 dark:bg-[#1e1f21]'}`}>
                      <ClipboardList size={18} className="mt-0.5 shrink-0" />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-black">{activity.courseCode ? `${activity.courseCode} ` : ''}{activity.name}</span>
                        <span className={`block truncate text-xs ${isSelected ? 'text-emerald-100' : 'text-gray-500 dark:text-gray-400'}`}>ภาคเรียน {formatSemester(activity.semester)}</span>
                        {isSelected && <span className="mt-2 inline-flex items-center gap-1 rounded-full bg-white/20 px-2 py-1 text-[10px] font-black text-white"><CheckCircle2 size={12} /> กำลังจัดรายชื่อ</span>}
                      </span>
                    </button>
                  );
                })}
                {!loading && filteredActivities.length === 0 && <div className="p-8 text-center text-sm text-gray-500">ยังไม่มีกิจกรรมที่เปิดเช็คชื่อ</div>}
              </div>
            </section>

            <section className="rounded-3xl border border-gray-100 bg-white shadow-sm dark:border-gray-700 dark:bg-[#2a2b2f] overflow-hidden">
              <div className="border-b border-gray-100 bg-emerald-50/60 p-4 dark:border-gray-700 dark:bg-emerald-500/10">
                <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
                  <div>
                    <h2 className="flex items-center gap-2 text-lg font-black text-emerald-700 dark:text-emerald-300"><Users size={20} /> {selectedActivity?.name || 'เลือกกิจกรรมก่อน'}</h2>
                    <p className="mt-1 text-xs font-bold text-gray-500 dark:text-gray-400">นักเรียนที่เลือกแล้ว {selectedStudents.length} คน | ภาคเรียน {selectedActivity ? formatSemester(selectedActivity.semester) : '-'}</p>
                  </div>
                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-3 lg:w-[520px]">
                    <select value={activeYear} onChange={e => setActiveYear(e.target.value)} className="h-11 rounded-xl border border-gray-200 bg-white px-3 text-sm font-bold outline-none focus:ring-2 focus:ring-emerald-500/20 dark:border-gray-700 dark:bg-[#1e1f21]">
                      {academicYearOptions.map(year => <option key={year} value={year}>ปีการศึกษา {year}</option>)}
                    </select>
                    <select value={selectedClassLevel} onChange={e => { setSelectedClassLevel(e.target.value); setSelectedRoom('ALL'); }} className="h-11 rounded-xl border border-gray-200 bg-white px-3 text-sm font-bold outline-none focus:ring-2 focus:ring-emerald-500/20 dark:border-gray-700 dark:bg-[#1e1f21]">
                      <option value="ALL">ทุกชั้น</option>
                      {classOptions.map(level => <option key={level} value={level}>{level}</option>)}
                    </select>
                    <select value={selectedRoom} onChange={e => setSelectedRoom(e.target.value)} className="h-11 rounded-xl border border-gray-200 bg-white px-3 text-sm font-bold outline-none focus:ring-2 focus:ring-emerald-500/20 dark:border-gray-700 dark:bg-[#1e1f21]">
                      <option value="ALL">ทุกห้อง</option>
                      {roomOptions.map(room => <option key={room} value={room}>ห้อง {room}</option>)}
                    </select>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 gap-4 p-4 xl:grid-cols-[1fr_70px_1fr]">
                <StudentList title="นักเรียนในกิจกรรม" count={assignedStudents.length} students={assignedStudents} selectedIds={selectedAssignedIds} loading={membersLoading} onToggle={toggleAssigned} emptyText="ยังไม่มีนักเรียนในกิจกรรมนี้" />
                <div className="flex items-center justify-center gap-3 xl:flex-col">
                  <ArrowButton direction="right" onClick={removeSelectedStudents} disabled={!selectedActivity || selectedAssignedIds.length === 0} />
                  <ArrowButton direction="left" onClick={addSelectedStudents} disabled={!selectedActivity || selectedAvailableIds.length === 0} />
                </div>
                <div className="rounded-2xl border border-gray-100 bg-gray-50 dark:border-gray-700 dark:bg-[#1e1f21] overflow-hidden">
                  <div className="border-b border-gray-100 bg-white p-3 dark:border-gray-700 dark:bg-white/5">
                    <div className="relative">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={16} />
                      <input value={studentSearch} onChange={e => setStudentSearch(e.target.value)} placeholder="ค้นหาชื่อ/รหัสนักเรียน..." className="h-10 w-full rounded-xl border border-gray-200 bg-gray-50 pl-10 pr-4 text-sm outline-none focus:ring-2 focus:ring-emerald-500/20 dark:border-gray-700 dark:bg-[#1e1f21]" />
                    </div>
                  </div>
                  <StudentListBody students={availableStudents} selectedIds={selectedAvailableIds} disabled={!selectedActivity} onToggle={toggleAvailable} emptyText="ไม่พบนักเรียนตามเงื่อนไข" />
                </div>
              </div>
            </section>
          </div>
        </div>
      </div>
    </MainLayout>
  );
};

const StudentList = ({ title, count, students, selectedIds, loading, onToggle, emptyText }: {
  title: string; count: number; students: Student[]; selectedIds: string[]; loading?: boolean; onToggle: (id: string) => void; emptyText: string;
}) => (
  <div className="rounded-2xl border border-gray-100 bg-gray-50 dark:border-gray-700 dark:bg-[#1e1f21] overflow-hidden">
    <div className="flex items-center justify-between border-b border-gray-100 bg-white p-3 dark:border-gray-700 dark:bg-white/5">
      <h3 className="text-sm font-black">{title}</h3>
      <span className="rounded-full bg-emerald-500/10 px-3 py-1 text-xs font-black text-emerald-600 dark:text-emerald-300">{count} คน</span>
    </div>
    {loading ? <div className="p-10 text-center text-sm text-gray-500">กำลังโหลดรายชื่อ...</div> : <StudentListBody students={students} selectedIds={selectedIds} onToggle={onToggle} emptyText={emptyText} />}
  </div>
);

const StudentListBody = ({ students, selectedIds, disabled, onToggle, emptyText }: {
  students: Student[]; selectedIds: string[]; disabled?: boolean; onToggle: (id: string) => void; emptyText: string;
}) => {
  const [page, setPage] = React.useState(1);
  const itemsPerPage = 20;
  const totalPages = Math.max(1, Math.ceil(students.length / itemsPerPage));

  React.useEffect(() => {
    setPage(1);
  }, [students]);

  const paginatedStudents = React.useMemo(() => {
    const start = (page - 1) * itemsPerPage;
    return students.slice(start, start + itemsPerPage);
  }, [students, page]);

  return (
    <>
      <div className="max-h-[470px] overflow-y-auto p-2">
        {students.length === 0 ? <div className="p-10 text-center text-sm text-gray-500">{emptyText}</div> : paginatedStudents.map(student => (
          <button key={student.id} type="button" disabled={disabled} onClick={() => onToggle(student.id)} className={`mb-2 grid w-full grid-cols-[28px_1fr_auto] items-center gap-3 rounded-xl border p-3 text-left transition disabled:opacity-50 ${selectedIds.includes(student.id) ? 'border-emerald-500 bg-emerald-50 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300' : 'border-gray-100 bg-white hover:border-emerald-200 dark:border-gray-700 dark:bg-white/5'}`}>
            <div className={`h-5 w-5 rounded-full border-2 ${selectedIds.includes(student.id) ? 'border-emerald-500 bg-emerald-500' : 'border-gray-300 dark:border-gray-600'}`} />
            <div className="min-w-0">
              <p className="truncate text-sm font-black">{student.title || student.prefix || ''}{student.firstName || ''} {student.lastName || ''}</p>
              <p className="truncate text-xs text-gray-500">รหัส: {student.studentId || '-'} | ชั้น {student.classLevel || '-'}/{student.room || '-'}</p>
            </div>
            <span className="text-xs font-black text-gray-400">{student.studentNumber || student.number || '-'}</span>
          </button>
        ))}
      </div>
      {totalPages > 1 && (
        <div className="flex flex-wrap items-center justify-center gap-1.5 border-t border-gray-100 bg-white p-3 dark:border-gray-700 dark:bg-white/5">
          {getVisiblePages(page, totalPages).map(pageNum => (
            <button
              key={pageNum}
              type="button"
              onClick={() => setPage(pageNum)}
              className={`h-9 min-w-9 rounded-xl px-3 text-xs font-black transition ${
                page === pageNum
                  ? 'bg-emerald-600 text-white shadow-lg shadow-emerald-500/20'
                  : 'bg-gray-50 text-gray-500 hover:bg-emerald-50 hover:text-emerald-600 dark:bg-white/5 dark:text-gray-400 dark:hover:bg-emerald-500/10 dark:hover:text-emerald-300'
              }`}
            >
              {pageNum}
            </button>
          ))}
        </div>
      )}
    </>
  );
};

const ArrowButton = ({ direction, onClick, disabled }: { direction: 'left' | 'right'; onClick: () => void; disabled?: boolean }) => {
  const Icon = direction === 'left' ? ChevronLeft : ChevronRight;
  return (
    <button type="button" onClick={onClick} disabled={disabled} className="inline-flex h-12 w-12 items-center justify-center rounded-2xl border border-emerald-400 bg-emerald-600 text-white shadow-lg shadow-emerald-500/20 transition hover:bg-emerald-500 disabled:border-gray-200 disabled:bg-gray-100 disabled:text-gray-300 disabled:shadow-none dark:disabled:border-white/5 dark:disabled:bg-white/5">
      <Icon size={24} strokeWidth={3} className="hidden xl:block" />
      <Icon size={24} strokeWidth={3} className="block rotate-90 xl:hidden" />
    </button>
  );
};

export default LearnerActivityStudentManagementPage;
