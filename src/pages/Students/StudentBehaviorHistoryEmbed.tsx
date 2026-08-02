import React, { useState, useEffect, useCallback } from 'react';
import { collection, getDocs, query, orderBy, limit, doc, getDoc } from 'firebase/firestore';
import { firestore as db } from '@/firebase';
import {
  getRulePoints,
  getBehaviorAttendanceStatusKey,
  getBehaviorFlagCeremonyStatusKey,
  getBehaviorClassroomAttendanceStatusKey,
  getSpecialPeriodRulePoints,
  getAttendanceEventDate,
  getActiveInterventionTier,
} from '@/utils/behaviorScoreUtils';
import { Loader2, ShieldCheck, TrendingUp, TrendingDown, Minus, Clock, AlertTriangle, Star, Calendar } from 'lucide-react';

// ─── Types ────────────────────────────────────────────────────────────────────

interface BehaviorLog {
  id: string;
  type: string;
  title: string;
  category: string;
  action: string;
  points: number;
  previousScore: number;
  nextScore: number;
  notes?: string;
  createdBy?: string;
  createdAt: any;
  academicYear?: string;
  behaviorStatus?: string;
}

interface Props {
  schoolId: string;
  studentId: string;
  studentName?: string;
  currentScore?: number;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const getLogDate = (log: BehaviorLog): Date => {
  try {
    if (log.createdAt?.toDate) return log.createdAt.toDate();
    if (log.createdAt instanceof Date) return log.createdAt;
    if (typeof log.createdAt === 'string') return new Date(log.createdAt);
  } catch { /* ignore */ }
  return new Date(0);
};

const formatDate = (d: Date) =>
  d.toLocaleDateString('th-TH', { year: 'numeric', month: 'short', day: 'numeric', weekday: 'short' });

const formatTime = (d: Date) =>
  d.toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' });

const TYPE_LABELS: Record<string, string> = {
  attendance: 'ลงเวลา',
  flag_ceremony: 'เข้าแถว',
  classroom: 'ในชั้นเรียน',
  special_period: 'กิจกรรมพิเศษ',
  activity_adjust: 'ปรับด้วยตนเอง',
  direct_edit: 'ผู้ดูแลระบบ',
  manual: 'บันทึกด้วยตนเอง',
};

const TYPE_COLORS: Record<string, string> = {
  attendance: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300',
  flag_ceremony: 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300',
  classroom: 'bg-teal-100 text-teal-700 dark:bg-teal-900/30 dark:text-teal-300',
  special_period: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300',
  activity_adjust: 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-300',
  direct_edit: 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400',
  manual: 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-300',
};

const scoreColor = (score: number) => {
  if (score >= 80) return 'text-emerald-600 dark:text-emerald-400';
  if (score >= 50) return 'text-amber-600 dark:text-amber-400';
  return 'text-red-600 dark:text-red-400';
};

const scoreBg = (score: number) => {
  if (score >= 80) return 'from-emerald-500 to-emerald-600';
  if (score >= 50) return 'from-amber-500 to-amber-600';
  return 'from-red-500 to-red-600';
};

// ─── Component ────────────────────────────────────────────────────────────────

const StudentBehaviorHistoryEmbed: React.FC<Props> = ({
  schoolId, studentId, studentName, currentScore = 100,
}) => {
  const [logs, setLogs] = useState<BehaviorLog[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [filter, setFilter] = useState<'all' | 'decrease' | 'increase'>('all');
  const [typeFilter, setTypeFilter] = useState<string>('all');
  const [behaviorConfig, setBehaviorConfig] = useState<any>(null);

  const fetchLogs = useCallback(async () => {
    if (!schoolId || !studentId) return;
    setIsLoading(true);
    try {
      // 1. Load behaviorScoreConfig + attendanceConfig (best-effort)
      let config: any = null;
      let attendanceConfig: any = null;
      try {
        const schoolSnap = await getDoc(doc(db, 'school-settings', schoolId));
        if (schoolSnap.exists()) {
          config = schoolSnap.data().behaviorScoreConfig ?? null;
          attendanceConfig = schoolSnap.data().attendanceConfig ?? null;
        }
        setBehaviorConfig(config);
      } catch { /* no config */ }

      // 2. Manual behavior_logs
      const logsSnap = await getDocs(
        query(collection(db, 'school-settings', schoolId, 'students', studentId, 'behavior_logs'),
          orderBy('createdAt', 'desc'), limit(200))
      );
      const manualLogs: BehaviorLog[] = logsSnap.docs.map(d => ({ id: d.id, ...d.data() } as BehaviorLog));

      // 3. Attendance → auto deduction logs
      const attSnap = await getDocs(
        collection(db, 'school-settings', schoolId, 'students', studentId, 'attendance')
      );
      const autoLogs: BehaviorLog[] = [];

      attSnap.docs.forEach(docSnap => {
        const data = docSnap.data();
        const fallbackDate = data.date ? new Date(`${data.date}T12:00:00`) : new Date();

        // Gate attendance (สาย / ขาด / กลับก่อน / ไม่ลงเวลาออก)
        if (data.status) {
          const pts = getRulePoints(config, data.status);
          if (pts > 0) {
            const statusKey = getBehaviorAttendanceStatusKey(data.status);
            const title =
              statusKey === 'late' ? 'มาสาย' :
              statusKey === 'absent' ? 'ขาดเรียน (ไม่ลงเวลาเข้า)' :
              statusKey === 'early' ? 'กลับก่อนกำหนด' :
              statusKey === 'noCheckout' ? 'ไม่ลงเวลาออก' : data.status;
            const note =
              statusKey === 'late' ? 'ลงเวลาเข้าหลังเวลาที่กำหนด' :
              statusKey === 'absent' ? 'ไม่มีการลงเวลาเข้าภายในเวลาที่กำหนด' :
              statusKey === 'early' ? 'ลงเวลาออกก่อนเวลาเลิกเรียน' :
              statusKey === 'noCheckout' ? 'ลงเวลาเข้าแล้วไม่มีเวลาออกเมื่อสิ้นวัน' : '';
            const eventDate = getAttendanceEventDate(data, statusKey, attendanceConfig);
            autoLogs.push({
              id: `att_${docSnap.id}`,
              type: 'attendance',
              title,
              category: 'ลงเวลา',
              action: 'deduct',
              points: -pts,
              previousScore: 0,
              nextScore: 0,
              notes: data.remark || note,
              createdBy: 'ระบบอัตโนมัติ',
              createdAt: { toDate: () => eventDate },
              academicYear: '',
            });
          }
        }

        // Flag ceremony (เข้าแถวเช้า)
        const metadata = data.metadata || {};
        const flagStatus = metadata.flagBehaviorScoreStatus || metadata.flag;
        if (flagStatus && String(flagStatus).startsWith('flag:')) {
          const pts = getRulePoints(config, flagStatus);
          if (pts > 0) {
            const flagKey = getBehaviorFlagCeremonyStatusKey(flagStatus);
            const title =
              flagKey === 'noScanPresentDeduct' ? 'ไม่สแกนบัตรเข้าแถว' :
              flagKey === 'scannedAbsentDeduct' ? 'โดดแถว (ไม่เข้าแถว)' :
              String(flagStatus).replace('flag:', '');
            const note =
              flagKey === 'noScanPresentDeduct' ? 'ครูยืนยันว่ามาเข้าแถว แต่ไม่ได้สแกนบัตร/บัตร Lock' :
              flagKey === 'scannedAbsentDeduct' ? 'มีเวลาสแกนบัตรเข้าโรงเรียน แต่ไม่ได้เข้าร่วมกิจกรรมเข้าแถว' : '';
            autoLogs.push({
              id: `flag_${docSnap.id}`,
              type: 'flag_ceremony',
              title,
              category: 'เข้าแถว',
              action: 'deduct',
              points: -pts,
              previousScore: 0,
              nextScore: 0,
              notes: note,
              createdBy: 'ระบบอัตโนมัติ',
              createdAt: { toDate: () => fallbackDate },
              academicYear: '',
            });
          }
        }
      });

      // 4. ClassroomAttendance → เช็คชื่อรายวิชา + กิจกรรมพิเศษ
      const classSnap = await getDocs(
        collection(db, 'school-settings', schoolId, 'students', studentId, 'ClassroomAttendance')
      );

      classSnap.docs.forEach(docSnap => {
        const data = docSnap.data();
        const logDate = data.date?.toDate ? data.date.toDate() : new Date();

        if (data.attendanceType === 'special_period') {
          // กิจกรรมพิเศษ — เฉพาะที่เปิดหักคะแนน
          if (!data.deductBehavior) return;
          const spPoints = getSpecialPeriodRulePoints(config, data.status);
          if (spPoints !== 0) {
            const title =
              data.status === 'late' ? 'เข้าร่วมสาย' :
              data.status === 'absent' ? 'ไม่เข้าร่วมกิจกรรม' :
              data.status === 'escape' ? 'หลีกเลี่ยงกิจกรรม' : data.status;
            autoLogs.push({
              id: `sp_${docSnap.id}`,
              type: 'special_period',
              title,
              category: 'กิจกรรมพิเศษ',
              action: spPoints > 0 ? 'add' : 'deduct',
              points: spPoints,
              previousScore: 0,
              nextScore: 0,
              notes: [data.specialPeriodTitle || data.subjectName, data.className ? `ชั้น ${data.className}` : ''].filter(Boolean).join(' · '),
              createdBy: data.teacherName || 'ระบบอัตโนมัติ',
              createdAt: { toDate: () => logDate },
              academicYear: data.academicYear || '',
            });
          }
        } else {
          // เช็คชื่อรายวิชาปกติ (สาย / ขาด / หนีเรียน)
          const classStatus = `class:${data.status}`;
          const classPoints = getRulePoints(config, classStatus);
          if (classPoints > 0) {
            const classKey = getBehaviorClassroomAttendanceStatusKey(data.status);
            const title =
              classKey === 'late' ? 'เข้าเรียนสาย' :
              classKey === 'absent' ? 'ขาดเรียน' :
              classKey === 'escape' ? 'หนีเรียน' : data.status;
            const note =
              classKey === 'late' ? 'เข้าเรียนหลังเวลาที่ครูเช็คชื่อ' :
              classKey === 'absent' ? 'ไม่มาเรียนวิชานี้' :
              classKey === 'escape' ? 'เข้าเรียนตอนเช็คชื่อ แต่ออกจากห้องเรียนกลางคาบ' : '';
            autoLogs.push({
              id: `cls_${docSnap.id}`,
              type: 'classroom',
              title,
              category: 'เช็คชื่อรายวิชา',
              action: 'deduct',
              points: -classPoints,
              previousScore: 0,
              nextScore: 0,
              notes: [note, data.subjectName, data.period ? `คาบที่ ${data.period}` : ''].filter(Boolean).join(' · '),
              createdBy: data.teacherName || 'ระบบอัตโนมัติ',
              createdAt: { toDate: () => logDate },
              academicYear: data.academicYear || '',
            });
          }
        }
      });

      // 5. Merge + sort
      const combined = [...manualLogs, ...autoLogs].sort(
        (a, b) => getLogDate(b).getTime() - getLogDate(a).getTime()
      );
      setLogs(combined);
    } catch (err) {
      console.error('StudentBehaviorHistoryEmbed:', err);
    } finally {
      setIsLoading(false);
    }
  }, [schoolId, studentId]);

  useEffect(() => { fetchLogs(); }, [fetchLogs]);

  const visibleLogs = logs.filter(log => {
    if (filter === 'decrease' && log.points >= 0) return false;
    if (filter === 'increase' && log.points <= 0) return false;
    if (typeFilter !== 'all' && log.type !== typeFilter) return false;
    return true;
  });

  const deductCount  = logs.filter(l => l.points < 0).length;
  const addCount     = logs.filter(l => l.points > 0).length;
  const totalDeduct  = logs.filter(l => l.points < 0).reduce((s, l) => s + l.points, 0);
  const totalAdd     = logs.filter(l => l.points > 0).reduce((s, l) => s + l.points, 0);

  const typesPresent = [...new Set(logs.map(l => l.type))];

  // ป้ายเตือนตามเกณฑ์ที่โรงเรียนตั้งไว้เอง (ตั้งค่าได้ที่ /academic/behavior-score-config)
  const activeTier = getActiveInterventionTier(currentScore, behaviorConfig?.interventionTiers);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="animate-spin text-indigo-500 mr-3" size={22} />
        <span className="text-gray-500 dark:text-gray-400 text-sm">กำลังโหลดประวัติคะแนน...</span>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Score summary */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {/* Current score */}
        <div className={`col-span-2 sm:col-span-1 bg-gradient-to-br ${scoreBg(currentScore)} rounded-2xl p-4 text-white`}>
          <div className="text-xs font-medium opacity-80 mb-1 flex items-center gap-1">
            <ShieldCheck size={12} /> คะแนนปัจจุบัน
          </div>
          <div className="text-4xl font-bold">{currentScore}</div>
          <div className="text-xs opacity-70 mt-0.5">จาก 100 คะแนน</div>
        </div>
        {/* Total deduct */}
        <div className="bg-red-50 dark:bg-red-900/10 rounded-2xl p-4 border border-red-100 dark:border-red-900/20">
          <div className="text-xs text-red-500 font-medium mb-1 flex items-center gap-1">
            <TrendingDown size={12} /> คะแนนที่หัก
          </div>
          <div className="text-2xl font-bold text-red-600 dark:text-red-400">{totalDeduct}</div>
          <div className="text-xs text-red-400 dark:text-red-500 mt-0.5">{deductCount} รายการ</div>
        </div>
        {/* Total add */}
        <div className="bg-emerald-50 dark:bg-emerald-900/10 rounded-2xl p-4 border border-emerald-100 dark:border-emerald-900/20">
          <div className="text-xs text-emerald-600 font-medium mb-1 flex items-center gap-1">
            <TrendingUp size={12} /> คะแนนที่เพิ่ม
          </div>
          <div className="text-2xl font-bold text-emerald-600 dark:text-emerald-400">+{totalAdd}</div>
          <div className="text-xs text-emerald-500 dark:text-emerald-600 mt-0.5">{addCount} รายการ</div>
        </div>
        {/* Total entries */}
        <div className="bg-indigo-50 dark:bg-indigo-900/10 rounded-2xl p-4 border border-indigo-100 dark:border-indigo-900/20">
          <div className="text-xs text-indigo-600 font-medium mb-1 flex items-center gap-1">
            <Calendar size={12} /> รายการทั้งหมด
          </div>
          <div className="text-2xl font-bold text-indigo-600 dark:text-indigo-400">{logs.length}</div>
          <div className="text-xs text-indigo-400 dark:text-indigo-500 mt-0.5">ตลอดปีการศึกษา</div>
        </div>
      </div>

      {/* Intervention tier warning banner */}
      {activeTier && (
        <div className="flex items-start gap-2.5 bg-orange-50 dark:bg-orange-900/10 border border-orange-200 dark:border-orange-900/30 rounded-xl p-3.5">
          <AlertTriangle size={16} className="text-orange-500 dark:text-orange-400 shrink-0 mt-0.5" />
          <div className="text-sm text-orange-700 dark:text-orange-300 font-medium">{activeTier.actionLabel}</div>
        </div>
      )}

      {/* Filters */}
      <div className="flex flex-wrap gap-2">
        {/* Direction filter */}
        {(['all', 'decrease', 'increase'] as const).map(f => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
              filter === f
                ? 'bg-indigo-600 text-white'
                : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700'
            }`}
          >
            {f === 'all' ? 'ทั้งหมด' : f === 'decrease' ? '🔻 ถูกหักคะแนน' : '⭐ ได้คะแนนเพิ่ม'}
          </button>
        ))}

        {/* Type filter */}
        {typesPresent.length > 1 && (
          <div className="flex gap-1.5 flex-wrap">
            <button
              onClick={() => setTypeFilter('all')}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                typeFilter === 'all'
                  ? 'bg-gray-700 text-white dark:bg-gray-200 dark:text-gray-900'
                  : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400'
              }`}
            >
              ทุกประเภท
            </button>
            {typesPresent.map(t => (
              <button
                key={t}
                onClick={() => setTypeFilter(t)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                  typeFilter === t
                    ? 'bg-gray-700 text-white dark:bg-gray-200 dark:text-gray-900'
                    : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400'
                }`}
              >
                {TYPE_LABELS[t] || t}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Log list */}
      {visibleLogs.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <div className="w-14 h-14 bg-indigo-50 dark:bg-indigo-900/20 rounded-full flex items-center justify-center mb-3">
            <ShieldCheck className="text-indigo-400" size={26} />
          </div>
          <p className="text-gray-500 dark:text-gray-400 font-medium text-sm">ไม่มีประวัติคะแนนพฤติกรรม</p>
          <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">ยังไม่มีรายการที่ตรงกับตัวกรองที่เลือก</p>
        </div>
      ) : (
        <div className="space-y-2">
          {visibleLogs.map((log, i) => {
            const date = getLogDate(log);
            const isDeduct = log.points < 0 || log.action === 'deduct';
            const isIncrease = log.points > 0;
            const absPoints = Math.abs(log.points);

            return (
              <div
                key={log.id}
                className={`flex items-start gap-3 p-3 rounded-xl border transition-colors ${
                  isDeduct
                    ? 'bg-red-50/50 dark:bg-red-900/5 border-red-100 dark:border-red-900/20'
                    : isIncrease
                    ? 'bg-emerald-50/50 dark:bg-emerald-900/5 border-emerald-100 dark:border-emerald-900/20'
                    : 'bg-gray-50 dark:bg-gray-800/40 border-gray-200 dark:border-gray-700/50'
                }`}
              >
                {/* Icon */}
                <div className={`shrink-0 w-9 h-9 rounded-xl flex items-center justify-center mt-0.5 ${
                  isDeduct
                    ? 'bg-red-100 dark:bg-red-900/30'
                    : isIncrease
                    ? 'bg-emerald-100 dark:bg-emerald-900/30'
                    : 'bg-gray-100 dark:bg-gray-800'
                }`}>
                  {isDeduct
                    ? <TrendingDown size={16} className="text-red-500 dark:text-red-400" />
                    : isIncrease
                    ? <Star size={16} className="text-emerald-500 dark:text-emerald-400" />
                    : <Minus size={16} className="text-gray-400" />
                  }
                </div>

                {/* Content */}
                <div className="flex-1 min-w-0">
                  <div className="flex flex-wrap items-start justify-between gap-x-2 gap-y-1">
                    <div className="min-w-0">
                      <span className="font-semibold text-sm text-gray-800 dark:text-gray-100">
                        {log.title}
                      </span>
                      <span className={`ml-2 inline-block text-[10px] font-medium px-1.5 py-0.5 rounded-md ${TYPE_COLORS[log.type] || 'bg-gray-100 text-gray-500'}`}>
                        {TYPE_LABELS[log.type] || log.type}
                      </span>
                    </div>
                    {/* Points badge */}
                    <div className={`shrink-0 text-sm font-bold px-2 py-0.5 rounded-lg ${
                      isDeduct
                        ? 'bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400'
                        : isIncrease
                        ? 'bg-emerald-100 text-emerald-600 dark:bg-emerald-900/30 dark:text-emerald-400'
                        : 'bg-gray-100 text-gray-500 dark:bg-gray-700 dark:text-gray-400'
                    }`}>
                      {isDeduct ? `-${absPoints}` : isIncrease ? `+${absPoints}` : '0'}
                    </div>
                  </div>

                  {/* Category & score trail */}
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 mt-1">
                    <span className="text-xs text-gray-500 dark:text-gray-400">{log.category}</span>
                    {log.nextScore > 0 && (
                      <span className="text-xs text-gray-400 dark:text-gray-500">
                        {log.previousScore} → <span className={`font-semibold ${scoreColor(log.nextScore)}`}>{log.nextScore}</span>
                      </span>
                    )}
                  </div>

                  {/* Reason for the deduction/addition */}
                  {log.notes && (
                    <div className="text-xs text-gray-500 dark:text-gray-400 italic mt-0.5">
                      {log.notes}
                    </div>
                  )}

                  {/* Date & creator */}
                  <div className="flex items-center gap-2 mt-1">
                    <Clock size={10} className="text-gray-300 dark:text-gray-600 shrink-0" />
                    <span className="text-[11px] text-gray-400 dark:text-gray-500">
                      {formatDate(date)}
                      {date.getTime() > 0 && ` · ${formatTime(date)}`}
                    </span>
                    {log.createdBy && log.createdBy !== 'ระบบอัตโนมัติ' && (
                      <span className="text-[11px] text-gray-300 dark:text-gray-600">· {log.createdBy}</span>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default StudentBehaviorHistoryEmbed;
