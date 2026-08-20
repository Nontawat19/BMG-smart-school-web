import React, { useEffect, useState } from 'react';
import { useSelector } from 'react-redux';
import { doc, onSnapshot, setDoc } from 'firebase/firestore';
import { firestore as db } from '@/firebase';
import { RootState } from '@/store';
import MainLayout from '@/layouts/MainLayout';
import BackButton from '@/components/Shared/BackButton';
import {
  AlertTriangle,
  CalendarDays,
  Check,
  CheckCircle2,
  GraduationCap,
  Loader2,
  Lock,
  Sparkles,
  Zap,
} from 'lucide-react';
import Swal from 'sweetalert2';

interface ActivityHubSettings {
  // undefined = the school hasn't chosen yet. Every other page that reads this setting treats
  // an unset value as 'special-period' (see src/hooks/useActivityHubSettings.ts) — this page
  // must not silently pick a "default" of its own, or it would show a mode as active that the
  // admin never actually chose.
  activityMode?: 'special-period' | 'course-based';
  disabledActivityIds: string[];
  clubMode: 'legacy' | 'course-based';
}

const DEFAULT_SETTINGS: ActivityHubSettings = {
  activityMode: undefined,
  disabledActivityIds: [],
  clubMode: 'legacy',
};

const CLUB_MODES = [
  {
    id: 'legacy' as const,
    label: 'ระบบหน้าชุมนุมเท่านั้น',
    sublabel: 'Club Hub Mode',
    pros: ['สมัครสมาชิก/เช็คชื่อ/รายงานผ่านหน้าชุมนุมโดยเฉพาะ'],
  },
  {
    id: 'course-based' as const,
    label: 'ลงทะเบียนแบบรายวิชา',
    sublabel: 'Course-Based Mode',
    pros: ['มอบหมายครูดูแลชุมนุมผ่านหน้ามอบหมายครูรายวิชา', 'ลงทะเบียนนักเรียนเข้าชุมนุมผ่านหน้าลงทะเบียนรายวิชา'],
  },
];

const SETTINGS_FIELD = 'activityHubSettings';

const MODES = [
  {
    id: 'special-period' as const,
    label: 'แบบคาบเรียนพิเศษ',
    sublabel: 'Special Period Mode',
    icon: CalendarDays,
    color: 'violet',
    gradient: 'from-violet-500 to-purple-600',
    activeBg: 'bg-violet-50 dark:bg-violet-500/10',
    activeBorder: 'border-violet-500',
    activeText: 'text-violet-600 dark:text-violet-400',
    activeDot: 'bg-violet-500',
    hoverBorder: 'hover:border-violet-300 dark:hover:border-violet-600',
    checkColor: 'text-violet-500',
    pros: [
      'กำหนดเวลาคาบกิจกรรมแบบระบุคาบทุกสัปดาห์',
      'นับชั่วโมงสอนของครูและแสดงใน PDF ตารางสอน',
      'จัดกลุ่มนักเรียนตามรายกิจกรรมได้',
    ],
    cons: [
      'ต้องสร้างคาบเรียนพิเศษในระบบก่อนใช้งาน',
    ],
  },
  {
    id: 'course-based' as const,
    label: 'แบบรายวิชาทั่วไป',
    sublabel: 'Course-Based Mode',
    icon: GraduationCap,
    color: 'teal',
    gradient: 'from-teal-500 to-emerald-600',
    activeBg: 'bg-teal-50 dark:bg-teal-500/10',
    activeBorder: 'border-teal-500',
    activeText: 'text-teal-600 dark:text-teal-400',
    activeDot: 'bg-teal-500',
    hoverBorder: 'hover:border-teal-300 dark:hover:border-teal-600',
    checkColor: 'text-teal-500',
    pros: [
      'มอบหมายวิชาและจัดตารางสอนได้เหมือนวิชาปกติ',
      'นับชั่วโมงสอนของครูในตารางสอน',
      'เช็คชื่อนักเรียนรายคาบได้',
    ],
    cons: [
      'ต้องมอบหมายครูประจำกิจกรรมก่อนใช้งาน',
    ],
  },
];

// Shown in the hero/summary areas when the school hasn't chosen a mode yet — deliberately
// neutral (gray, no icon-brand color) so it can never be mistaken for either real mode being
// "active" by default.
const UNSET_MODE = {
  id: undefined as unknown as 'special-period' | 'course-based',
  label: 'ยังไม่ได้เลือกโหมด',
  sublabel: 'Not Configured',
  icon: AlertTriangle,
  color: 'gray',
  gradient: 'from-gray-400 to-gray-500',
  activeBg: 'bg-gray-50 dark:bg-gray-500/10',
  activeBorder: 'border-gray-300 dark:border-gray-600',
  activeText: 'text-gray-500 dark:text-gray-400',
  activeDot: 'bg-gray-400',
  hoverBorder: 'hover:border-gray-300 dark:hover:border-gray-600',
  checkColor: 'text-gray-400',
  pros: [] as string[],
  cons: [] as string[],
};

const ActivityHubSettingsPage: React.FC = () => {
  const currentUser = useSelector((state: RootState) => state.auth.user);
  const schoolId = (currentUser as any)?.schoolId;

  const [settings, setSettings] = useState<ActivityHubSettings>(DEFAULT_SETTINGS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (!schoolId) return;
    const unsub = onSnapshot(doc(db, 'school-settings', schoolId), (snap) => {
      if (snap.exists()) {
        const data = snap.data();
        if (data?.[SETTINGS_FIELD]) {
          setSettings({ ...DEFAULT_SETTINGS, ...data[SETTINGS_FIELD] });
        }
      }
      setLoading(false);
    });
    return unsub;
  }, [schoolId]);

  const saveSettings = async (newSettings: ActivityHubSettings) => {
    if (!schoolId) return;
    setSaving(true);
    setSaved(false);
    try {
      await setDoc(
        doc(db, 'school-settings', schoolId),
        { [SETTINGS_FIELD]: newSettings },
        { merge: true }
      );
      setSettings(newSettings);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (err) {
      console.error(err);
      Swal.fire('เกิดข้อผิดพลาด', 'ไม่สามารถบันทึกการตั้งค่าได้', 'error');
    } finally {
      setSaving(false);
    }
  };

  const activeMode = MODES.find((m) => m.id === settings.activityMode) ?? UNSET_MODE;

  if (loading) {
    return (
      <MainLayout>
        <div className="min-h-screen bg-gray-50 dark:bg-[#18191d] p-4 sm:p-6">
          <div className="max-w-4xl mx-auto space-y-6">
            <div className="h-40 w-full rounded-2xl bg-gray-200 dark:bg-gray-700 animate-pulse"></div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {[...Array(4)].map((_, i) => (
                <div key={`skeleton-${i}`} className="h-28 w-full rounded-2xl bg-gray-200 dark:bg-gray-700 animate-pulse"></div>
              ))}
            </div>
          </div>
        </div>
      </MainLayout>
    );
  }

  return (
    <MainLayout>
      <div className="min-h-screen bg-gray-50 dark:bg-[#18191d] text-gray-900 dark:text-white">

        {/* Hero Header */}
        <div className="relative overflow-hidden bg-white dark:bg-[#1e1f23] border-b border-gray-200 dark:border-gray-800">
          <div className="absolute inset-0 pointer-events-none">
            <div className={`absolute -top-20 -right-20 w-72 h-72 rounded-full opacity-10 bg-gradient-to-br ${activeMode.gradient} blur-3xl transition-all duration-700`} />
            <div className="absolute -bottom-10 -left-10 w-48 h-48 rounded-full opacity-5 bg-gradient-to-br from-slate-400 to-slate-600 blur-2xl" />
          </div>
          <div className="relative mx-auto max-w-4xl px-4 sm:px-6 py-8">
            <BackButton to="/academic/hub/settings" className="mb-4" />
            <div className="flex items-start justify-between gap-4 flex-wrap">
              <div>
                <div className="flex items-center gap-2 mb-2">
                  <span className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-bold bg-gradient-to-r ${activeMode.gradient} text-white shadow`}>
                    <Sparkles size={11} />
                    {activeMode.sublabel}
                  </span>
                </div>
                <h1 className="text-2xl sm:text-3xl font-black tracking-tight">
                  ตั้งค่ากิจกรรมพัฒนาผู้เรียน
                </h1>
                <p className="mt-1.5 text-sm text-gray-500 dark:text-gray-400 max-w-md">
                  เลือกวิธีที่โรงเรียนใช้จัดการกิจกรรม ลูกเสือ / ยุวกาชาด / รด / บำเพ็ญประโยชน์
                </p>
              </div>
              {/* Save indicator */}
              <div className="flex items-center gap-2 self-end pb-1">
                {saving && (
                  <span className="flex items-center gap-1.5 text-xs text-gray-400">
                    <Loader2 size={13} className="animate-spin" />
                    กำลังบันทึก...
                  </span>
                )}
                {saved && !saving && (
                  <span className="flex items-center gap-1.5 text-xs text-teal-500 font-semibold">
                    <CheckCircle2 size={13} />
                    บันทึกแล้ว
                  </span>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Content */}
        <div className="mx-auto max-w-4xl px-4 sm:px-6 py-8 space-y-6">

          {/* Mode Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {MODES.map((mode) => {
              const isActive = settings.activityMode === mode.id;
              const Icon = mode.icon;
              return (
                <button
                  key={mode.id}
                  onClick={() => saveSettings({ ...settings, activityMode: mode.id })}
                  disabled={saving}
                  className={`group relative text-left rounded-2xl border-2 p-5 transition-all duration-200 disabled:opacity-60 ${
                    isActive
                      ? `${mode.activeBorder} ${mode.activeBg} shadow-md`
                      : `border-gray-200 dark:border-gray-700 bg-white dark:bg-[#1e1f23] ${mode.hoverBorder} hover:shadow-md`
                  }`}
                >
                  {/* Active checkmark */}
                  <div className={`absolute top-4 right-4 flex items-center justify-center w-6 h-6 rounded-full transition-all duration-200 ${
                    isActive
                      ? `bg-gradient-to-br ${mode.gradient} shadow`
                      : 'border-2 border-gray-200 dark:border-gray-700'
                  }`}>
                    {isActive && <Check size={13} strokeWidth={3} className="text-white" />}
                  </div>

                  {/* Icon */}
                  <div className={`inline-flex items-center justify-center w-11 h-11 rounded-xl mb-4 bg-gradient-to-br ${mode.gradient} shadow-md`}>
                    <Icon size={22} className="text-white" />
                  </div>

                  {/* Title */}
                  <div className="pr-8 mb-1">
                    <div className={`font-black text-base ${isActive ? mode.activeText : ''}`}>
                      {mode.label}
                    </div>
                    <div className="text-xs text-gray-400 font-medium">{mode.sublabel}</div>
                  </div>

                  {/* Divider */}
                  <div className="my-3 h-px bg-gray-100 dark:bg-gray-700/60" />

                  {/* Pros */}
                  <ul className="space-y-1.5 mb-3">
                    {mode.pros.map((p) => (
                      <li key={p} className="flex items-start gap-2 text-xs text-gray-600 dark:text-gray-300">
                        <Check size={13} strokeWidth={2.5} className={`mt-0.5 shrink-0 ${mode.checkColor}`} />
                        {p}
                      </li>
                    ))}
                  </ul>

                  {/* Cons */}
                  {mode.cons.length > 0 && (
                    <ul className="space-y-1.5">
                      {mode.cons.map((c) => (
                        <li key={c} className="flex items-start gap-2 text-xs text-amber-500 dark:text-amber-400">
                          <AlertTriangle size={13} strokeWidth={2.5} className="mt-0.5 shrink-0 text-amber-400 dark:text-amber-400" />
                          {c}
                        </li>
                      ))}
                    </ul>
                  )}
                </button>
              );
            })}
          </div>

          {/* Club Mode Section */}
          <div className="rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-[#1e1f23] p-5">
            <div className="flex items-center gap-2 mb-3">
              <div className="flex items-center justify-center w-8 h-8 rounded-xl bg-amber-100 dark:bg-amber-500/20 shrink-0">
                <Lock size={15} className="text-amber-500" />
              </div>
              <div>
                <div className="text-sm font-black">โหมดชุมนุม</div>
                <div className="text-xs text-gray-400">เลือกวิธีที่โรงเรียนจัดการมอบหมายครู/ลงทะเบียนนักเรียนเข้าชุมนุม</div>
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {CLUB_MODES.map((mode) => {
                const isActive = settings.clubMode === mode.id;
                return (
                  <button
                    key={mode.id}
                    onClick={() => saveSettings({ ...settings, clubMode: mode.id })}
                    disabled={saving}
                    className={`text-left rounded-xl border-2 p-3.5 transition-all duration-200 disabled:opacity-60 ${
                      isActive
                        ? 'border-amber-500 bg-amber-50 dark:bg-amber-500/10 shadow-md'
                        : 'border-gray-200 dark:border-gray-700 hover:border-amber-300 dark:hover:border-amber-600'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <span className={`text-sm font-bold ${isActive ? 'text-amber-600 dark:text-amber-400' : ''}`}>{mode.label}</span>
                      {isActive && <Check size={14} strokeWidth={3} className="text-amber-500" />}
                    </div>
                    <ul className="space-y-1">
                      {mode.pros.map((p) => (
                        <li key={p} className="text-xs text-gray-500 dark:text-gray-400">{p}</li>
                      ))}
                    </ul>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Info row */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {/* Current mode summary */}
            <div className={`flex items-start gap-3 rounded-2xl border px-4 py-3.5 ${activeMode.activeBorder} ${activeMode.activeBg}`}>
              <div className={`flex items-center justify-center w-8 h-8 rounded-xl bg-gradient-to-br ${activeMode.gradient} shrink-0 shadow`}>
                <Zap size={15} className="text-white" />
              </div>
              <div>
                <div className={`text-sm font-bold ${activeMode.activeText}`}>โหมดที่ใช้งานอยู่</div>
                <div className="text-xs text-gray-500 dark:text-gray-400 mt-0.5 leading-relaxed">
                  {activeMode.label}
                </div>
              </div>
            </div>
          </div>

        </div>
      </div>
    </MainLayout>
  );
};

export default ActivityHubSettingsPage;
