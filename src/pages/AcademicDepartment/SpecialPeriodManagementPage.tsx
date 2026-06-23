import React, { useState, useEffect, useMemo } from "react";
import { Link } from "react-router-dom";
import { firestore as db } from "../../firebase";
import { collection, addDoc, getDocs, deleteDoc, doc, getDoc, updateDoc } from "firebase/firestore";
import { useSelector, useDispatch } from "react-redux";
import { RootState } from "../../store";
import { fetchTeachersMap } from "@/store/slices/userMapSlice";
import { getActiveSortedTeachers } from "@/utils/teacherSortUtils";
import MainLayout from "@/layouts/MainLayout";
import Swal from "sweetalert2";
import BackButton from "@/components/Shared/BackButton";
import { CalendarDays, CalendarClock, Clock, Shield, BarChart2, Plus, Pencil, Trash2, Users, Search, ChevronDown, BookOpen } from "lucide-react";

// ─── Types ─────────────────────────────────────────────────────────────────

type PeriodType = 'recurring' | 'oneTime';

interface SpecialPeriod {
  id: string;
  title: string;
  startTime: string;
  endTime: string;
  durationHours?: number;
  periodType?: PeriodType;
  day?: string;            // for recurring
  eventDate?: string;      // for oneTime (YYYY-MM-DD)
  eventEndDate?: string;   // for oneTime range end (YYYY-MM-DD, optional)
  linkedPeriodId?: string;
  isTeachingLoad?: boolean;
  attendanceCloseDate?: string;  // YYYY-MM-DD วันสุดท้ายที่ให้เช็คชื่อในเมนู (oneTime)
  attendanceCloseTime?: string;  // HH:MM เวลาสุดท้ายในวันนั้น (ถ้าไม่กำหนด = 23:59)
  countAsTeachingPeriod?: boolean;
  deductBehaviorDefault?: boolean;
  responsibleTeacherIds?: string[];
}

interface PeriodSetting {
  id: string;
  label: string;
  startTime: string;
  endTime: string;
  isTeachingPeriod: boolean;
  isFixed?: boolean;
}

// ─── Constants ─────────────────────────────────────────────────────────────

const DAY_OPTIONS = [
  { value: 'all', label: 'ทุกวัน' },
  { value: 'mon', label: 'วันจันทร์' },
  { value: 'tue', label: 'วันอังคาร' },
  { value: 'wed', label: 'วันพุธ' },
  { value: 'thu', label: 'วันพฤหัสบดี' },
  { value: 'fri', label: 'วันศุกร์' },
];

const DAY_LABEL: Record<string, string> = {
  all: 'ทุกวัน', mon: 'จันทร์', tue: 'อังคาร', wed: 'พุธ',
  thu: 'พฤหัสบดี', fri: 'ศุกร์', sat: 'เสาร์', sun: 'อาทิตย์',
};

// ─── Helpers ───────────────────────────────────────────────────────────────

const calcDurationHours = (start: string, end: string): number => {
  const toMinutes = (t: string) => {
    const clean = t.replace('.', ':');
    const [h, m] = clean.split(':').map(Number);
    return (h || 0) * 60 + (m || 0);
  };
  const diff = toMinutes(end) - toMinutes(start);
  return diff > 0 ? Math.round((diff / 60) * 10) / 10 : 0;
};

const formatThaiDate = (dateStr?: string) => {
  if (!dateStr) return '';
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString('th-TH', { year: 'numeric', month: 'long', day: 'numeric', weekday: 'long' });
};

// ─── Page ──────────────────────────────────────────────────────────────────

const SpecialPeriodManagementPage: React.FC = () => {
  const dispatch = useDispatch();
  const currentUser = useSelector((state: RootState) => state.auth.user);
  const schoolId = (currentUser as any)?.schoolId;
  const { teachers: teacherMap, status: teacherMapStatus } = useSelector((state: RootState) => state.userMap);

  const [specialPeriods, setSpecialPeriods] = useState<SpecialPeriod[]>([]);
  const [periodSettings, setPeriodSettings] = useState<PeriodSetting[]>([]);
  const [activeTab, setActiveTab] = useState<'all' | 'recurring' | 'oneTime'>('all');

  // ── Form state ────────────────────────────────────────────────────────────
  const [editingPeriodId, setEditingPeriodId] = useState<string | null>(null);
  const [isSubmittingPeriod, setIsSubmittingPeriod] = useState(false);

  const [newPeriodType, setNewPeriodType] = useState<PeriodType>('recurring');
  const [newPeriodTitle, setNewPeriodTitle] = useState('');
  const [newPeriodStartTime, setNewPeriodStartTime] = useState('');
  const [newPeriodEndTime, setNewPeriodEndTime] = useState('');
  const [newPeriodDurationHours, setNewPeriodDurationHours] = useState<string>('');
  const [newPeriodDay, setNewPeriodDay] = useState('all');
  const [newPeriodEventDate, setNewPeriodEventDate] = useState('');
  const [newPeriodEventEndDate, setNewPeriodEventEndDate] = useState('');
  const [selectedPeriodOption, setSelectedPeriodOption] = useState('custom');
  const [newPeriodIsTeachingLoad, setNewPeriodIsTeachingLoad] = useState(false);
  const [newPeriodAttendanceCloseDate, setNewPeriodAttendanceCloseDate] = useState('');
  const [newPeriodAttendanceCloseTime, setNewPeriodAttendanceCloseTime] = useState('');
  const [newPeriodCountAsTeachingPeriod, setNewPeriodCountAsTeachingPeriod] = useState(false);
  const [newPeriodBehaviorEnabled, setNewPeriodBehaviorEnabled] = useState(false);
  const [newPeriodResponsibleTeacherIds, setNewPeriodResponsibleTeacherIds] = useState<string[]>([]);
  const [showTeacherPicker, setShowTeacherPicker] = useState(false);
  const [teacherSearch, setTeacherSearch] = useState('');

  // ── Teacher helpers ───────────────────────────────────────────────────────
  const sortedTeachers = useMemo(() => getActiveSortedTeachers(Object.values(teacherMap || {})), [teacherMap]);
  const filteredTeachers = useMemo(() => {
    if (!teacherSearch) return sortedTeachers;
    const q = teacherSearch.toLowerCase();
    return sortedTeachers.filter(t =>
      (t.name || '').toLowerCase().includes(q) ||
      ((t as any).teacherId || '').toLowerCase().includes(q)
    );
  }, [sortedTeachers, teacherSearch]);

  const toggleTeacher = (id: string) => {
    setNewPeriodResponsibleTeacherIds(prev =>
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
    );
  };

  // Auto-calculate duration when times change
  const autoDuration = useMemo(() =>
    newPeriodStartTime && newPeriodEndTime
      ? calcDurationHours(newPeriodStartTime, newPeriodEndTime)
      : 0,
    [newPeriodStartTime, newPeriodEndTime]
  );

  const PERIOD_OPTIONS = useMemo(() =>
    periodSettings.map(p => ({
      value: p.id,
      label: `${p.label} (${p.startTime}–${p.endTime})`,
      start: p.startTime,
      end: p.endTime,
    })),
    [periodSettings]
  );

  useEffect(() => {
    if (selectedPeriodOption && selectedPeriodOption !== 'custom') {
      const opt = PERIOD_OPTIONS.find(o => o.value === selectedPeriodOption);
      if (opt) { setNewPeriodStartTime(opt.start); setNewPeriodEndTime(opt.end); }
    }
  }, [selectedPeriodOption, PERIOD_OPTIONS]);

  // ── Load data ─────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!schoolId) return;

    getDocs(collection(db, 'school-settings', schoolId, 'special-periods')).then(snap => {
      setSpecialPeriods(snap.docs.map(d => ({ id: d.id, ...d.data() } as SpecialPeriod)));
    });

    getDoc(doc(db, 'school-settings', schoolId, 'configs', 'schedule_settings')).then(snap => {
      if (snap.exists() && snap.data().periods) {
        setPeriodSettings(snap.data().periods);
      }
    });
  }, [schoolId]);

  useEffect(() => {
    if (schoolId && teacherMapStatus === 'idle') dispatch(fetchTeachersMap(schoolId) as any);
  }, [schoolId, teacherMapStatus, dispatch]);

  // ── Form helpers ──────────────────────────────────────────────────────────
  const resetForm = () => {
    setEditingPeriodId(null);
    setNewPeriodType('recurring');
    setNewPeriodTitle('');
    setNewPeriodStartTime('');
    setNewPeriodEndTime('');
    setNewPeriodDurationHours('');
    setNewPeriodDay('all');
    setNewPeriodEventDate('');
    setNewPeriodEventEndDate('');
    setSelectedPeriodOption(PERIOD_OPTIONS.length > 0 ? PERIOD_OPTIONS[0].value : 'custom');
    setNewPeriodIsTeachingLoad(false);
    setNewPeriodAttendanceCloseDate('');
    setNewPeriodAttendanceCloseTime('');
    setNewPeriodCountAsTeachingPeriod(false);
    setNewPeriodBehaviorEnabled(false);
    setNewPeriodResponsibleTeacherIds([]);
    setShowTeacherPicker(false);
    setTeacherSearch('');
  };

  const handleEditClick = (period: SpecialPeriod) => {
    setEditingPeriodId(period.id);
    setNewPeriodType(period.periodType || 'recurring');
    setNewPeriodTitle(period.title);
    setNewPeriodStartTime(period.startTime);
    setNewPeriodEndTime(period.endTime);
    setNewPeriodDurationHours(period.durationHours != null ? String(period.durationHours) : '');
    setNewPeriodDay(period.day || 'all');
    setNewPeriodEventDate(period.eventDate || '');
    setNewPeriodEventEndDate(period.eventEndDate || '');
    setSelectedPeriodOption(period.linkedPeriodId || 'custom');
    setNewPeriodIsTeachingLoad(period.isTeachingLoad || false);
    setNewPeriodAttendanceCloseDate(period.attendanceCloseDate || '');
    setNewPeriodAttendanceCloseTime(period.attendanceCloseTime || '');
    setNewPeriodCountAsTeachingPeriod(period.countAsTeachingPeriod || false);
    setNewPeriodBehaviorEnabled(period.deductBehaviorDefault || false);
    setNewPeriodResponsibleTeacherIds(period.responsibleTeacherIds || []);
    setShowTeacherPicker(false);
    setTeacherSearch('');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleSubmitSpecialPeriod = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSubmittingPeriod) return;
    if (!newPeriodTitle || !newPeriodStartTime || !newPeriodEndTime) {
      Swal.fire({ icon: 'warning', title: 'ข้อมูลไม่ครบถ้วน', text: 'กรุณากรอกชื่อและเวลาให้ครบถ้วน', background: '#2a2b2f', color: '#ffffff' });
      return;
    }
    if (newPeriodType === 'oneTime' && !newPeriodEventDate) {
      Swal.fire({ icon: 'warning', title: 'ข้อมูลไม่ครบถ้วน', text: 'กรุณาระบุวันที่จัดกิจกรรม', background: '#2a2b2f', color: '#ffffff' });
      return;
    }
    setIsSubmittingPeriod(true);

    const durationHours = newPeriodDurationHours !== ''
      ? Number(newPeriodDurationHours)
      : autoDuration;

    const periodData: Omit<SpecialPeriod, 'id'> = {
      title: newPeriodTitle,
      startTime: newPeriodStartTime,
      endTime: newPeriodEndTime,
      durationHours,
      periodType: newPeriodType,
      isTeachingLoad: newPeriodIsTeachingLoad,
      ...(newPeriodType === 'oneTime' && newPeriodAttendanceCloseDate ? { attendanceCloseDate: newPeriodAttendanceCloseDate } : {}),
      ...(newPeriodType === 'oneTime' && newPeriodAttendanceCloseDate && newPeriodAttendanceCloseTime ? { attendanceCloseTime: newPeriodAttendanceCloseTime } : {}),
      countAsTeachingPeriod: newPeriodCountAsTeachingPeriod,
      deductBehaviorDefault: newPeriodBehaviorEnabled,
      responsibleTeacherIds: newPeriodResponsibleTeacherIds,
      ...(newPeriodType === 'recurring'
        ? { day: newPeriodDay, ...(selectedPeriodOption !== 'custom' ? { linkedPeriodId: selectedPeriodOption } : {}) }
        : { eventDate: newPeriodEventDate, ...(newPeriodEventEndDate ? { eventEndDate: newPeriodEventEndDate } : {}) }),
    };

    try {
      if (editingPeriodId) {
        await updateDoc(doc(db, 'school-settings', schoolId, 'special-periods', editingPeriodId), periodData);
        setSpecialPeriods(prev => prev.map(p => p.id === editingPeriodId ? { id: editingPeriodId, ...periodData } : p));
        Swal.fire({ icon: 'success', title: 'บันทึกการแก้ไขสำเร็จ', background: '#2a2b2f', color: '#ffffff', timer: 1500, showConfirmButton: false });
      } else {
        const ref = await addDoc(collection(db, 'school-settings', schoolId, 'special-periods'), periodData);
        setSpecialPeriods(prev => [...prev, { id: ref.id, ...periodData }]);
        Swal.fire({ icon: 'success', title: 'เพิ่มกิจกรรมสำเร็จ', background: '#2a2b2f', color: '#ffffff', timer: 1500, showConfirmButton: false });
      }
      resetForm();
    } catch (err) {
      console.error(err);
      Swal.fire({ icon: 'error', title: 'เกิดข้อผิดพลาด', text: 'ไม่สามารถบันทึกข้อมูลได้', background: '#2a2b2f', color: '#ffffff' });
    } finally {
      setIsSubmittingPeriod(false);
    }
  };

  const handleDelete = async (periodId: string) => {
    if (editingPeriodId === periodId) resetForm();
    const result = await Swal.fire({
      title: 'ต้องการลบกิจกรรมนี้?', text: 'การกระทำนี้ไม่สามารถย้อนกลับได้', icon: 'warning',
      showCancelButton: true, confirmButtonColor: '#d33', cancelButtonColor: '#3085d6',
      confirmButtonText: 'ใช่, ลบเลย!', cancelButtonText: 'ยกเลิก', background: '#2a2b2f', color: '#ffffff',
    });
    if (!result.isConfirmed) return;
    try {
      await deleteDoc(doc(db, 'school-settings', schoolId, 'special-periods', periodId));
      setSpecialPeriods(prev => prev.filter(p => p.id !== periodId));
      Swal.fire({ icon: 'success', title: 'ลบสำเร็จ', background: '#2a2b2f', color: '#ffffff', timer: 1200, showConfirmButton: false });
    } catch {
      Swal.fire({ icon: 'error', title: 'เกิดข้อผิดพลาด', background: '#2a2b2f', color: '#ffffff' });
    }
  };

  // ── Derived ───────────────────────────────────────────────────────────────
  const filteredPeriods = useMemo(() => {
    if (activeTab === 'all') return specialPeriods;
    return specialPeriods.filter(p =>
      activeTab === 'oneTime'
        ? p.periodType === 'oneTime'
        : (p.periodType || 'recurring') === 'recurring'
    );
  }, [specialPeriods, activeTab]);

  const recurringCount = specialPeriods.filter(p => (p.periodType || 'recurring') === 'recurring').length;
  const oneTimeCount = specialPeriods.filter(p => p.periodType === 'oneTime').length;

  // ─── Render ───────────────────────────────────────────────────────────────
  return (
    <MainLayout>
      <div className="px-3 sm:px-4 md:px-6 lg:px-8 py-4 min-h-screen bg-gray-50 dark:bg-gray-900 text-gray-900 dark:text-white">
        <div className="max-w-6xl mx-auto space-y-4">

          {/* Header bar */}
          <div className="flex items-center gap-3">
            <BackButton to="/academic/hub/scheduling" />
            <div className="flex-1 min-w-0">
              <h1 className="text-lg font-extrabold leading-tight truncate">จัดการคาบเรียนพิเศษ</h1>
            </div>
            <Link to="/academic/behavior-score-config"
              className="shrink-0 inline-flex items-center gap-1.5 text-xs font-bold text-violet-600 dark:text-violet-400 hover:underline">
              <Shield size={13} />
              ตั้งค่าหักคะแนนพฤติกรรม
            </Link>
          </div>

          {/* ─ Form ─ */}
          <div className={`bg-white dark:bg-[#2a2b2f] rounded-2xl p-4 shadow-sm border transition-all ${editingPeriodId ? 'border-indigo-500 ring-1 ring-indigo-500' : 'border-gray-100 dark:border-gray-700'}`}>
            <div className="flex justify-between items-center mb-3">
              <h2 className="text-sm font-bold flex items-center gap-2">
                {editingPeriodId ? <><Pencil size={15} className="text-amber-500" /> แก้ไขกิจกรรม</> : <><Plus size={15} className="text-indigo-500" /> เพิ่มกิจกรรมใหม่</>}
              </h2>
              {editingPeriodId && (
                <button onClick={resetForm} className="text-xs text-gray-400 hover:text-gray-600 dark:hover:text-gray-200">
                  ยกเลิก
                </button>
              )}
            </div>

            <form onSubmit={handleSubmitSpecialPeriod} className="space-y-3">

              {/* Type selector */}
              <div className="grid grid-cols-2 gap-2">
                  <button type="button" onClick={() => setNewPeriodType('recurring')}
                    className={`flex items-center gap-2 rounded-xl border-2 p-3 text-left transition-all ${newPeriodType === 'recurring' ? 'border-indigo-500 bg-indigo-50 dark:bg-indigo-500/15' : 'border-gray-200 dark:border-gray-600 hover:border-indigo-300'}`}>
                    <CalendarDays size={18} className={newPeriodType === 'recurring' ? 'text-indigo-600 dark:text-indigo-400' : 'text-gray-400'} />
                    <div>
                      <p className={`text-xs font-bold ${newPeriodType === 'recurring' ? 'text-indigo-700 dark:text-indigo-300' : 'text-gray-700 dark:text-gray-300'}`}>ตลอดเทอม (รายสัปดาห์)</p>
                      <p className="text-[10px] text-gray-500">เช่น โฮมรูม แนะแนว</p>
                    </div>
                  </button>
                  <button type="button" onClick={() => setNewPeriodType('oneTime')}
                    className={`flex items-center gap-2 rounded-xl border-2 p-3 text-left transition-all ${newPeriodType === 'oneTime' ? 'border-violet-500 bg-violet-50 dark:bg-violet-500/15' : 'border-gray-200 dark:border-gray-600 hover:border-violet-300'}`}>
                    <CalendarClock size={18} className={newPeriodType === 'oneTime' ? 'text-violet-600 dark:text-violet-400' : 'text-gray-400'} />
                    <div>
                      <p className={`text-xs font-bold ${newPeriodType === 'oneTime' ? 'text-violet-700 dark:text-violet-300' : 'text-gray-700 dark:text-gray-300'}`}>กิจกรรมครั้งเดียว</p>
                      <p className="text-[10px] text-gray-500">เช่น อบรม ทัศนศึกษา กีฬาสี</p>
                    </div>
                  </button>
                </div>

              {/* Title */}
              <div>
                <label className="block text-[10px] font-black text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1">ชื่อกิจกรรม</label>
                <input type="text" value={newPeriodTitle} onChange={e => setNewPeriodTitle(e.target.value)}
                  placeholder={newPeriodType === 'recurring' ? 'เช่น โฮมรูม, แนะแนว, ชุมนุม' : 'เช่น อบรมคุณธรรม, ทัศนศึกษา, กีฬาสี'}
                  className="w-full bg-white dark:bg-[#1e1f21] border border-gray-300 dark:border-gray-600 rounded-xl px-3 py-2 text-sm font-bold focus:outline-none focus:ring-2 focus:ring-indigo-500" />
              </div>

              <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                {/* Date or Day */}
                {newPeriodType === 'recurring' ? (
                  <div>
                    <label className="block text-[10px] font-black text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1">วันที่เกิดขึ้น</label>
                    <select value={newPeriodDay} onChange={e => setNewPeriodDay(e.target.value)}
                      className="w-full bg-white dark:bg-[#1e1f21] border border-gray-300 dark:border-gray-600 rounded-xl px-3 py-2 text-sm font-bold focus:outline-none focus:ring-2 focus:ring-indigo-500">
                      {DAY_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                    </select>
                  </div>
                ) : (
                  <>
                    <div>
                      <label className="block text-[10px] font-black text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1">วันที่เริ่มกิจกรรม</label>
                      <input type="date" value={newPeriodEventDate} onChange={e => {
                        setNewPeriodEventDate(e.target.value);
                        if (newPeriodEventEndDate && e.target.value > newPeriodEventEndDate) setNewPeriodEventEndDate('');
                      }}
                        className="w-full bg-white dark:bg-[#1e1f21] border border-gray-300 dark:border-gray-600 rounded-xl px-3 py-2 text-sm font-bold focus:outline-none focus:ring-2 focus:ring-violet-500" />
                    </div>
                    <div>
                      <label className="block text-[10px] font-black text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1">
                        วันที่สิ้นสุด <span className="text-gray-400 font-normal normal-case">(ถ้ากิจกรรมหลายวัน)</span>
                      </label>
                      <input type="date" value={newPeriodEventEndDate} min={newPeriodEventDate || undefined}
                        onChange={e => setNewPeriodEventEndDate(e.target.value)}
                        className="w-full bg-white dark:bg-[#1e1f21] border border-gray-300 dark:border-gray-600 rounded-xl px-3 py-2 text-sm font-bold focus:outline-none focus:ring-2 focus:ring-violet-500" />
                    </div>
                  </>
                )}

                {/* Period slot (recurring only) */}
                {newPeriodType === 'recurring' && PERIOD_OPTIONS.length > 0 && (
                  <div>
                    <label className="block text-[10px] font-black text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1">ผูกคาบเรียน</label>
                    <select value={selectedPeriodOption} onChange={e => setSelectedPeriodOption(e.target.value)}
                      className="w-full bg-white dark:bg-[#1e1f21] border border-gray-300 dark:border-gray-600 rounded-xl px-3 py-2 text-sm font-bold focus:outline-none focus:ring-2 focus:ring-indigo-500">
                      <option value="custom">กำหนดเอง</option>
                      {PERIOD_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                    </select>
                    {selectedPeriodOption === 'custom' && (
                      <p className="mt-1 text-[10px] text-amber-500 dark:text-amber-400 font-bold">
                        ⚠ "กำหนดเอง" จะไม่แสดงในตารางสอนครู — ต้องผูกคาบเรียนเพื่อให้แสดงในตาราง PDF
                      </p>
                    )}
                  </div>
                )}

                {/* Start time */}
                <div>
                  <label className="block text-[10px] font-black text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1">เวลาเริ่ม</label>
                  <input type="time" value={newPeriodStartTime.replace('.', ':')} onChange={e => setNewPeriodStartTime(e.target.value)}
                    className="w-full bg-white dark:bg-[#1e1f21] border border-gray-300 dark:border-gray-600 rounded-xl px-3 py-2 text-sm font-bold focus:outline-none focus:ring-2 focus:ring-indigo-500" />
                </div>

                {/* End time */}
                <div>
                  <label className="block text-[10px] font-black text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1">เวลาสิ้นสุด</label>
                  <input type="time" value={newPeriodEndTime.replace('.', ':')} onChange={e => setNewPeriodEndTime(e.target.value)}
                    className="w-full bg-white dark:bg-[#1e1f21] border border-gray-300 dark:border-gray-600 rounded-xl px-3 py-2 text-sm font-bold focus:outline-none focus:ring-2 focus:ring-indigo-500" />
                </div>
              </div>

              {/* Duration + แสดงในเมนูเช็คชื่อ + นับเป็นคาบสอน + คะแนนพฤติกรรม + ครูรับผิดชอบ (single row) */}
              <div className="grid grid-cols-5 gap-2">
                {/* Duration */}
                <div className="flex items-center gap-2 rounded-xl bg-gray-50 dark:bg-[#1e1f21] border border-gray-200 dark:border-gray-700 px-3 py-2 h-full">
                  <Clock size={15} className="text-gray-400 shrink-0" />
                  <label className="text-[10px] font-black text-gray-500 dark:text-gray-400 uppercase tracking-wider shrink-0">ชม.</label>
                  <input type="number" min="0" step="0.5" max="24"
                    value={newPeriodDurationHours}
                    onChange={e => setNewPeriodDurationHours(e.target.value)}
                    placeholder={autoDuration > 0 ? `${autoDuration}` : '0'}
                    className="w-16 bg-white dark:bg-[#2a2b2f] border border-gray-300 dark:border-gray-600 rounded-lg px-2 py-1.5 text-sm font-bold focus:outline-none focus:ring-2 focus:ring-indigo-500" />
                </div>

                {/* Toggle: isTeachingLoad + close deadline (absolute dropdown) */}
                <div className="relative h-full">
                  <label className={`flex items-center gap-2 rounded-xl border-2 px-3 py-2 cursor-pointer transition-all h-full ${newPeriodIsTeachingLoad ? 'border-indigo-400 dark:border-indigo-600 bg-indigo-50/30 dark:bg-indigo-900/10' : 'border-gray-200 dark:border-gray-700 bg-white dark:bg-[#1e1f21] hover:border-indigo-300'}`}>
                    <input type="checkbox" checked={newPeriodIsTeachingLoad}
                      onChange={e => { setNewPeriodIsTeachingLoad(e.target.checked); if (!e.target.checked) { setNewPeriodAttendanceCloseDate(''); setNewPeriodAttendanceCloseTime(''); } }}
                      className="w-4 h-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500 shrink-0" />
                    <BarChart2 size={13} className="text-indigo-500 shrink-0" />
                    <span className="text-xs font-bold text-gray-700 dark:text-gray-300 truncate">แสดงในเมนูเช็คชื่อ</span>
                    {newPeriodIsTeachingLoad && newPeriodType === 'oneTime' && newPeriodAttendanceCloseDate && (
                      <span className="text-[9px] font-black text-indigo-500 bg-indigo-100 dark:bg-indigo-900/40 px-1 py-0.5 rounded shrink-0">
                        ถึง {newPeriodAttendanceCloseDate}
                      </span>
                    )}
                  </label>
                  {newPeriodIsTeachingLoad && newPeriodType === 'oneTime' && (
                    <div className="absolute left-0 top-full mt-1 z-50 w-72 bg-white dark:bg-[#1e1f21] border-2 border-indigo-400 dark:border-indigo-600 rounded-xl shadow-xl px-3 py-2.5 space-y-2">
                      <p className="text-[10px] font-black text-indigo-500 uppercase tracking-wider">ปิดรับเช็คชื่อถึง</p>
                      <div className="flex gap-1.5">
                        <input type="date" value={newPeriodAttendanceCloseDate}
                          min={newPeriodEventDate || undefined}
                          onChange={e => setNewPeriodAttendanceCloseDate(e.target.value)}
                          className="flex-1 min-w-0 bg-gray-50 dark:bg-[#2a2b2f] border border-indigo-200 dark:border-indigo-700 rounded-lg px-2 py-1.5 text-xs font-bold text-gray-700 dark:text-gray-300 focus:outline-none focus:ring-2 focus:ring-indigo-400" />
                        <input type="time" value={newPeriodAttendanceCloseTime}
                          onChange={e => setNewPeriodAttendanceCloseTime(e.target.value)}
                          disabled={!newPeriodAttendanceCloseDate}
                          className="w-24 bg-gray-50 dark:bg-[#2a2b2f] border border-indigo-200 dark:border-indigo-700 rounded-lg px-2 py-1.5 text-xs font-bold text-gray-700 dark:text-gray-300 focus:outline-none focus:ring-2 focus:ring-indigo-400 disabled:opacity-40 disabled:cursor-not-allowed" />
                      </div>
                      {!newPeriodAttendanceCloseDate ? (
                        <p className="text-[10px] text-gray-400">ไม่กำหนด = ปิดหลังกิจกรรมสิ้นสุด +1 ชม. อัตโนมัติ</p>
                      ) : (
                        <button type="button" onClick={() => { setNewPeriodAttendanceCloseDate(''); setNewPeriodAttendanceCloseTime(''); }}
                          className="text-[10px] font-black text-red-400 hover:text-red-600 transition-colors">
                          ✕ ล้างค่า (ใช้ค่าอัตโนมัติ)
                        </button>
                      )}
                    </div>
                  )}
                </div>

                {/* Toggle: countAsTeachingPeriod */}
                <label className={`flex items-center gap-2 rounded-xl border-2 px-3 py-2 cursor-pointer transition-all h-full ${newPeriodCountAsTeachingPeriod ? 'border-emerald-400 dark:border-emerald-600 bg-emerald-50/40 dark:bg-emerald-900/10' : 'border-gray-200 dark:border-gray-700 bg-white dark:bg-[#1e1f21] hover:border-emerald-300'}`}>
                  <input type="checkbox" checked={newPeriodCountAsTeachingPeriod}
                    onChange={e => setNewPeriodCountAsTeachingPeriod(e.target.checked)}
                    className="w-4 h-4 rounded border-gray-300 text-emerald-600 focus:ring-emerald-500 shrink-0" />
                  <BookOpen size={13} className={`shrink-0 ${newPeriodCountAsTeachingPeriod ? 'text-emerald-500' : 'text-gray-400'}`} />
                  <span className={`text-xs font-bold truncate ${newPeriodCountAsTeachingPeriod ? 'text-emerald-700 dark:text-emerald-300' : 'text-gray-700 dark:text-gray-300'}`}>ภาระงานกิจกรรมพิเศษ</span>
                </label>

                {/* คะแนนพฤติกรรม */}
                <label className={`flex items-center gap-2 px-3 py-2 rounded-xl border-2 cursor-pointer select-none transition-all ${newPeriodBehaviorEnabled ? 'border-violet-400 dark:border-violet-600 bg-violet-50/40 dark:bg-violet-900/10' : 'border-gray-200 dark:border-gray-700 bg-white dark:bg-[#1e1f21]'} h-full`}>
                  <input type="checkbox" checked={newPeriodBehaviorEnabled}
                    onChange={e => setNewPeriodBehaviorEnabled(e.target.checked)}
                    className="w-4 h-4 rounded border-gray-300 text-violet-600 focus:ring-violet-500 shrink-0" />
                  <Shield size={13} className={`shrink-0 ${newPeriodBehaviorEnabled ? 'text-violet-500' : 'text-gray-400'}`} />
                  <span className={`text-xs font-bold flex-1 min-w-0 truncate ${newPeriodBehaviorEnabled ? 'text-violet-700 dark:text-violet-300' : 'text-gray-700 dark:text-gray-300'}`}>
                    คะแนนพฤติกรรม
                  </span>
                  {newPeriodBehaviorEnabled && (
                    <span className="text-[9px] font-black text-violet-500 bg-violet-100 dark:bg-violet-900/40 px-1.5 py-0.5 rounded-full shrink-0">เปิด</span>
                  )}
                  <Link to="/academic/behavior-score-config" onClick={e => e.stopPropagation()}
                    className="text-[10px] font-black text-gray-400 hover:text-violet-500 hover:underline shrink-0">
                    ตั้งค่า
                  </Link>
                </label>

                {/* ครูรับผิดชอบ */}
                <div className="relative">
                  <button
                    type="button"
                    onClick={() => setShowTeacherPicker(v => !v)}
                    className={`w-full h-full flex items-center gap-2 px-3 py-2 text-left rounded-xl border-2 transition-all ${showTeacherPicker ? 'border-blue-400 dark:border-blue-600' : 'border-gray-200 dark:border-gray-700'} bg-white dark:bg-[#1e1f21]`}
                  >
                    <Users size={13} className="text-blue-500 shrink-0" />
                    <span className="text-xs font-bold text-gray-700 dark:text-gray-300 flex-1 min-w-0 truncate">ครูรับผิดชอบ</span>
                    <span className={`text-[10px] font-black px-1.5 py-0.5 rounded-full shrink-0 ${newPeriodResponsibleTeacherIds.length > 0 ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300' : 'text-gray-400'}`}>
                      {newPeriodResponsibleTeacherIds.length === 0 ? 'ทุกครู' : `${newPeriodResponsibleTeacherIds.length} คน`}
                    </span>
                    <ChevronDown size={13} className={`text-gray-400 transition-transform shrink-0 ${showTeacherPicker ? 'rotate-180' : ''}`} />
                  </button>

                  {showTeacherPicker && (
                    <div className="absolute right-0 top-full mt-1 z-50 w-72 bg-white dark:bg-[#1e1f21] border-2 border-blue-400 dark:border-blue-600 rounded-xl shadow-xl px-3 pb-3 pt-2.5 space-y-2">
                      <p className="text-[10px] text-gray-400 font-bold">ถ้าไม่เลือกครู = ทุกคนเห็นกิจกรรมนี้ในเมนูเช็คชื่อ</p>
                      <div className="relative">
                        <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
                        <input
                          type="text"
                          placeholder="ค้นหาครู..."
                          value={teacherSearch}
                          onChange={e => setTeacherSearch(e.target.value)}
                          className="w-full pl-8 pr-3 py-1.5 text-xs font-bold bg-gray-50 dark:bg-[#2a2b2f] border border-gray-200 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-400"
                        />
                      </div>
                      <div className="max-h-48 overflow-y-auto space-y-1 pr-1">
                        {filteredTeachers.length === 0 ? (
                          <p className="text-xs text-gray-400 text-center py-2">ไม่พบครู</p>
                        ) : filteredTeachers.map(teacher => {
                          const id = (teacher as any).id || (teacher as any).uid || '';
                          const checked = newPeriodResponsibleTeacherIds.includes(id);
                          return (
                            <label key={id} className={`flex items-center gap-2 px-2 py-1.5 rounded-lg cursor-pointer transition-colors ${checked ? 'bg-blue-50 dark:bg-blue-900/20' : 'hover:bg-gray-50 dark:hover:bg-white/5'}`}>
                              <input
                                type="checkbox"
                                checked={checked}
                                onChange={() => toggleTeacher(id)}
                                className="w-3.5 h-3.5 rounded border-gray-300 text-blue-500 focus:ring-blue-400"
                              />
                              <span className={`text-xs font-bold flex-1 ${checked ? 'text-blue-700 dark:text-blue-300' : 'text-gray-700 dark:text-gray-300'}`}>
                                {(teacher as any).name || id}
                              </span>
                              {(teacher as any).teacherId && (
                                <span className="text-[10px] text-gray-400">{(teacher as any).teacherId}</span>
                              )}
                            </label>
                          );
                        })}
                      </div>
                      {newPeriodResponsibleTeacherIds.length > 0 && (
                        <button
                          type="button"
                          onClick={() => setNewPeriodResponsibleTeacherIds([])}
                          className="text-[10px] font-black text-red-400 hover:text-red-600 transition-colors"
                        >
                          ล้างการเลือกทั้งหมด
                        </button>
                      )}
                    </div>
                  )}
                </div>
              </div>

              {/* Submit */}
              <div className="flex justify-end gap-2">
                {editingPeriodId && (
                  <button type="button" onClick={resetForm}
                    className="px-4 py-2 rounded-xl border border-gray-300 dark:border-gray-600 text-sm font-bold text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors">
                    ยกเลิก
                  </button>
                )}
                <button type="submit" disabled={isSubmittingPeriod}
                  className={`min-w-[120px] px-5 py-2 rounded-xl text-sm font-bold text-white shadow-sm transition-all disabled:opacity-70 flex items-center justify-center gap-2 ${editingPeriodId ? 'bg-amber-500 hover:bg-amber-600' : 'bg-indigo-600 hover:bg-indigo-700'}`}>
                  {isSubmittingPeriod ? (
                    <svg className="animate-spin h-4 w-4 text-white" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                    </svg>
                  ) : editingPeriodId ? <><Pencil size={14} /> บันทึกการแก้ไข</> : <><Plus size={14} /> เพิ่มกิจกรรม</>}
                </button>
              </div>
            </form>
          </div>

          {/* ─ List ─ */}
          <div>
            <div className="flex flex-col gap-2 mb-3 sm:flex-row sm:items-center sm:justify-between">
              <h2 className="text-sm font-bold text-gray-900 dark:text-white">
                รายการกิจกรรมพิเศษ ({specialPeriods.length})
              </h2>
              {/* Tabs */}
              <div className="flex w-full sm:w-auto overflow-x-auto rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-[#2a2b2f] p-0.5 gap-0.5">
                {([['all', 'ทั้งหมด', specialPeriods.length], ['recurring', 'รายสัปดาห์', recurringCount], ['oneTime', 'ครั้งเดียว', oneTimeCount]] as const).map(([tab, label, count]) => (
                  <button key={tab} onClick={() => setActiveTab(tab)}
                    className={`shrink-0 px-2.5 py-1 rounded-lg text-[11px] font-bold whitespace-nowrap transition-colors ${activeTab === tab ? 'bg-indigo-600 text-white' : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'}`}>
                    {label} ({count})
                  </button>
                ))}
              </div>
            </div>

            {filteredPeriods.length === 0 ? (
              <div className="text-center py-12 rounded-2xl border border-dashed border-gray-300 dark:border-gray-700 bg-white dark:bg-[#2a2b2f]">
                <CalendarClock size={40} className="mx-auto mb-3 text-gray-300 dark:text-gray-600" />
                <p className="text-gray-500 dark:text-gray-400 font-bold">
                  {activeTab === 'all' ? 'ยังไม่มีกิจกรรม' : activeTab === 'oneTime' ? 'ยังไม่มีกิจกรรมครั้งเดียว' : 'ยังไม่มีกิจกรรมรายสัปดาห์'}
                </p>
                <p className="text-sm text-gray-400 mt-1">ใช้ฟอร์มด้านบนเพื่อเพิ่มกิจกรรม</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-3">
                {filteredPeriods.map(period => {
                  const isOneTime = period.periodType === 'oneTime';
                  const durationDisplay = period.durationHours
                    ? `${period.durationHours} ชม.`
                    : calcDurationHours(period.startTime, period.endTime) > 0
                      ? `${calcDurationHours(period.startTime, period.endTime)} ชม.`
                      : '';

                  return (
                    <div key={period.id}
                      className={`relative bg-white dark:bg-[#1e1f21] border rounded-xl p-3.5 shadow-sm hover:shadow-md transition-all ${editingPeriodId === period.id ? 'border-indigo-500 ring-1 ring-indigo-500' : 'border-gray-200 dark:border-gray-700'}`}>

                      {/* Type badge */}
                      <div className="flex items-start justify-between gap-3 mb-2.5">
                        <div className="flex-1 min-w-0">
                          <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-black mb-1 ${isOneTime ? 'bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-300' : 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-300'}`}>
                            {isOneTime ? <><CalendarClock size={10} /> ครั้งเดียว</> : <><CalendarDays size={10} /> รายสัปดาห์</>}
                          </span>
                          <h3 className="font-bold text-[15px] leading-snug text-gray-800 dark:text-white line-clamp-2 pr-2">{period.title}</h3>
                        </div>
                        <div className="flex shrink-0 gap-0.5">
                          <button onClick={() => handleEditClick(period)}
                            className="text-gray-400 hover:text-indigo-500 p-1.5 rounded-full hover:bg-indigo-50 dark:hover:bg-indigo-900/20 transition-colors" title="แก้ไข">
                            <Pencil size={14} />
                          </button>
                          <button onClick={() => handleDelete(period.id)}
                            className="text-gray-400 hover:text-red-500 p-1.5 rounded-full hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors" title="ลบ">
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </div>

                      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-gray-500 dark:text-gray-400 mb-2.5">
                        <div className="flex items-center gap-1.5 min-w-0 text-sm text-gray-600 dark:text-gray-300">
                          <Clock size={13} className="shrink-0" />
                          <span className="font-bold truncate">{period.startTime}–{period.endTime} น.</span>
                          {durationDisplay && <span className="text-[11px] text-gray-400">({durationDisplay})</span>}
                        </div>
                        <div className="flex items-center gap-1.5 min-w-0">
                          {isOneTime ? (
                            <><CalendarClock size={12} className="shrink-0" /><span className="truncate">{formatThaiDate(period.eventDate)}{period.eventEndDate ? ` – ${formatThaiDate(period.eventEndDate)}` : ''}</span></>
                          ) : (
                            <><CalendarDays size={12} className="shrink-0" /><span>{DAY_LABEL[period.day || 'all'] || 'ทุกวัน'}</span></>
                          )}
                        </div>
                      </div>

                      {/* Badges */}
                      <div className="flex flex-wrap gap-1">
                        {period.isTeachingLoad && (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-black bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300">
                            <BarChart2 size={10} /> แสดงในเมนูเช็คชื่อ
                            {period.periodType === 'oneTime' && period.attendanceCloseDate && (
                              <span className="font-normal opacity-75">
                                {' '}ถึง {period.attendanceCloseDate}{period.attendanceCloseTime ? ` ${period.attendanceCloseTime}` : ''}
                              </span>
                            )}
                          </span>
                        )}
                        {period.countAsTeachingPeriod && (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-black bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300">
                            <BookOpen size={10} /> ภาระงานกิจกรรมพิเศษ
                          </span>
                        )}
                        {period.deductBehaviorDefault && (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-black bg-violet-100 text-violet-800 dark:bg-violet-900/30 dark:text-violet-300">
                            <Shield size={10} /> คะแนนพฤติกรรม
                          </span>
                        )}
                        {period.responsibleTeacherIds && period.responsibleTeacherIds.length > 0 && (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-black bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300">
                            <Users size={10} />
                            {period.responsibleTeacherIds.length} ครู: {period.responsibleTeacherIds.slice(0, 2).map(id => teacherMap?.[id]?.name || id).join(', ')}{period.responsibleTeacherIds.length > 2 ? ` +${period.responsibleTeacherIds.length - 2}` : ''}
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    </MainLayout>
  );
};

export default SpecialPeriodManagementPage;
