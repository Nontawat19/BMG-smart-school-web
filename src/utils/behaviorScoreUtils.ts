import { DocumentReference, WriteBatch, serverTimestamp } from "firebase/firestore";

type AttendanceStatusKey = "late" | "absent" | "early" | "noCheckout";
type FlagCeremonyStatusKey =
  | "normal"
  | "sickLeave"
  | "personalLeave"
  | "cancelFlag"
  | "noScanPresentNoDeduct"
  | "noScanPresentDeduct"
  | "scannedAbsentDeduct"
  | "cancelFlagKeepGate";

type ClassroomAttendanceStatusKey = "present" | "late" | "absent" | "leave" | "escape";

interface AttendanceScoreRule {
  statusKey: AttendanceStatusKey;
  points?: number;
  isActive?: boolean;
}

interface FlagCeremonyScoreRule {
  statusKey: FlagCeremonyStatusKey;
  points?: number;
  isActive?: boolean;
}

interface ClassroomAttendanceScoreRule {
  statusKey: ClassroomAttendanceStatusKey;
  points?: number;
  isActive?: boolean;
  // Only meaningful for specialPeriodRules — classroomAttendanceRules has no
  // UI to set this and is always treated as a deduction regardless of value.
  type?: 'increase' | 'decrease';
}

export interface BehaviorScoreInterventionTier {
  id: string;
  // คะแนนต่ำกว่าค่านี้ = เข้าเกณฑ์ต้องดำเนินการ
  threshold: number;
  // ข้อความอธิบายสิ่งที่ต้องทำ เช่น "ต้องเข้าร่วมกิจกรรมปรับพฤติกรรมให้คะแนนกลับถึง 100"
  actionLabel: string;
  isActive?: boolean;
}

interface BehaviorScoreConfig {
  startingScore?: number;
  minScore?: number;
  maxScore?: number;
  attendanceRules?: AttendanceScoreRule[];
  flagCeremonyRules?: FlagCeremonyScoreRule[];
  classroomAttendanceRules?: ClassroomAttendanceScoreRule[];
  interventionTiers?: BehaviorScoreInterventionTier[];
}

// เกณฑ์แต่ละช่วงคะแนนกำหนดโดยโรงเรียนเอง (ตั้งค่าได้ที่ /academic/behavior-score-config)
// เป็นแค่ป้ายเตือน/สถานะให้ครูเห็น ไม่ได้ล็อกฟีเจอร์หรือบังคับ workflow ใดๆ ในระบบ
// ถ้าคะแนนต่ำกว่าหลาย threshold พร้อมกัน จะคืนเกณฑ์ที่ "รุนแรงที่สุด" (threshold ต่ำสุดที่ยังเข้าเกณฑ์)
export const getActiveInterventionTier = (
  score: number,
  tiers?: BehaviorScoreInterventionTier[] | null,
): BehaviorScoreInterventionTier | null => {
  const matching = (tiers || [])
    .filter((t) => t.isActive !== false && Number.isFinite(Number(t.threshold)) && score < Number(t.threshold))
    .sort((a, b) => Number(a.threshold) - Number(b.threshold));
  return matching[0] || null;
};

interface BehaviorScoreCalculationParams {
  currentScore?: number | null;
  oldStatus?: string | null;
  newStatus?: string | null;
  config?: BehaviorScoreConfig | null;
}

export const getBehaviorAttendanceStatusKey = (status?: string | null): AttendanceStatusKey | null => {
  if (!status) return null;
  const normalized = String(status).trim().toLowerCase();

  if (["สาย", "late"].includes(normalized)) return "late";
  if (["ขาด", "absent"].includes(normalized)) return "absent";
  if (["กลับก่อน", "early", "earlyreturn"].includes(normalized)) return "early";
  if (["ไม่ลงเวลาออก", "nocheckout", "no_checkout"].includes(normalized)) return "noCheckout";

  return null;
};

export const getBehaviorFlagCeremonyStatusKey = (status?: string | null): FlagCeremonyStatusKey | null => {
  if (!status) return null;
  const normalized = String(status).trim();
  if (!normalized.startsWith("flag:")) return null;

  const key = normalized.replace("flag:", "") as FlagCeremonyStatusKey;
  const validKeys: FlagCeremonyStatusKey[] = [
    "normal",
    "sickLeave",
    "personalLeave",
    "cancelFlag",
    "noScanPresentNoDeduct",
    "noScanPresentDeduct",
    "scannedAbsentDeduct",
    "cancelFlagKeepGate",
  ];

  return validKeys.includes(key) ? key : null;
};

export const getBehaviorClassroomAttendanceStatusKey = (status?: string | null): ClassroomAttendanceStatusKey | null => {
  if (!status) return null;
  const normalized = String(status).trim();
  if (normalized.startsWith("class:")) {
    const key = normalized.replace("class:", "") as ClassroomAttendanceStatusKey;
    const validKeys: ClassroomAttendanceStatusKey[] = ["present", "late", "absent", "leave", "escape"];
    return validKeys.includes(key) ? key : null;
  }
  
  const validKeys: ClassroomAttendanceStatusKey[] = ["present", "late", "absent", "leave", "escape"];
  return validKeys.includes(normalized as any) ? (normalized as ClassroomAttendanceStatusKey) : null;
};

// Deduction points come ONLY from what the school explicitly saved on
// /academic/behavior-score-config. If a rule was never saved there (or the
// school never saved the config at all), no points are deducted — there is
// no hardcoded fallback amount.
// Firestore Timestamp | {seconds} | Date → Date, or null if not present
const toDateOrNull = (v: any): Date | null => {
  if (!v) return null;
  if (typeof v.toDate === "function") return v.toDate();
  if (v instanceof Date) return v;
  if (typeof v.seconds === "number") return new Date(v.seconds * 1000);
  return null;
};

// วันที่ (YYYY-MM-DD) + เวลา (HH:mm) ของกฎเกณฑ์การตัดคะแนน → Date สำหรับแสดงผล
const combineDateAndTime = (dateStr: string, timeStr?: string): Date => {
  const d = new Date(`${dateStr}T00:00:00`);
  const [h, m] = (timeStr || "00:00").split(":").map(Number);
  d.setHours(h || 0, m || 0, 0, 0);
  return d;
};

// เวลาจริงที่ควรแสดงสำหรับรายการหักคะแนนจากการลงเวลา (แทนที่จะ hardcode 12:00 เสมอ):
// - มาสาย/ไม่ลงเวลาออก → เวลาที่สแกนเข้าจริง (checkinTime)
// - กลับก่อนกำหนด        → เวลาที่สแกนออกจริง (checkoutTime)
// - ขาด (ไม่มีการสแกนเลย) → เวลาที่ระบบตัดสินว่าขาด (เวลาปิดรับลงเวลาเข้า ตามการตั้งค่าโรงเรียน)
export const getAttendanceEventDate = (
  data: any,
  statusKey: AttendanceStatusKey | null,
  attendanceConfig?: { studentCheckinEnd?: string; studentCheckoutEnd?: string } | null,
): Date => {
  if (statusKey === "late" || statusKey === "noCheckout") {
    return toDateOrNull(data?.checkinTime) || combineDateAndTime(data?.date, attendanceConfig?.studentCheckinEnd);
  }
  if (statusKey === "early") {
    return toDateOrNull(data?.checkoutTime) || combineDateAndTime(data?.date, attendanceConfig?.studentCheckoutEnd);
  }
  if (statusKey === "absent") {
    return combineDateAndTime(data?.date, attendanceConfig?.studentCheckinEnd);
  }
  return data?.date ? new Date(`${data.date}T12:00:00`) : new Date();
};

export const getRulePoints = (config: BehaviorScoreConfig | null | undefined, status?: string | null, type?: "attendance" | "flag" | "classroom") => {
  if (type === "classroom" || (status && String(status).startsWith("class:"))) {
    const classStatusKey = getBehaviorClassroomAttendanceStatusKey(status);
    if (classStatusKey) {
      const rules = Array.isArray(config?.classroomAttendanceRules) ? config.classroomAttendanceRules : [];
      const rule = rules.find(item => item.statusKey === classStatusKey);
      if (!rule || rule.isActive === false) return 0;
      return Math.max(0, Number(rule.points) || 0);
    }
    return 0;
  }
  const flagStatusKey = getBehaviorFlagCeremonyStatusKey(status);
  if (flagStatusKey) {
    const rules = Array.isArray(config?.flagCeremonyRules) ? config.flagCeremonyRules : [];
    const rule = rules.find(item => item.statusKey === flagStatusKey);
    if (!rule || rule.isActive === false) return 0;
    return Math.max(0, Number(rule.points) || 0);
  }

  const statusKey = getBehaviorAttendanceStatusKey(status);
  if (!statusKey) return 0;

  const rules = Array.isArray(config?.attendanceRules) ? config.attendanceRules : [];
  const rule = rules.find(item => item.statusKey === statusKey);
  if (!rule || rule.isActive === false) return 0;

  return Math.max(0, Number(rule.points) || 0);
};

export const calculateAttendanceBehaviorScoreChange = ({
  currentScore,
  oldStatus,
  newStatus,
  config,
}: BehaviorScoreCalculationParams) => {
  const oldPenalty = getRulePoints(config, oldStatus);
  const newPenalty = getRulePoints(config, newStatus);
  const delta = oldPenalty - newPenalty;

  if (delta === 0) return null;

  const startingScore = Number(config?.startingScore ?? 100);
  const baseScore = Number.isFinite(Number(currentScore)) ? Number(currentScore) : startingScore;
  // ไม่จำกัดทั้งเพดานบนและเพดานล่าง — คะแนนสะท้อนผลรวมจริงเสมอ ทั้งเกิน 100 หรือติดลบ
  const nextScore = baseScore + delta;

  const update = {
    behaviorScore: nextScore,
    behaviorScoreUpdatedAt: serverTimestamp(),
    lastBehaviorScoreChange: {
      delta: nextScore - baseScore,
      oldStatus: oldStatus || null,
      newStatus: newStatus || null,
      updatedAt: serverTimestamp(),
      source: "attendance",
    },
  };

  return {
    update,
    summary: { previousScore: baseScore, nextScore, delta: nextScore - baseScore },
  };
};

export const calculateClassroomBehaviorScoreChange = ({
  currentScore,
  oldStatus,
  newStatus,
  config,
}: BehaviorScoreCalculationParams) => {
  const oldPenalty = getRulePoints(config, oldStatus, "classroom");
  const newPenalty = getRulePoints(config, newStatus, "classroom");
  const delta = oldPenalty - newPenalty;

  if (delta === 0) return null;

  const startingScore = Number(config?.startingScore ?? 100);
  const baseScore = Number.isFinite(Number(currentScore)) ? Number(currentScore) : startingScore;
  // ไม่จำกัดทั้งเพดานบนและเพดานล่าง — คะแนนสะท้อนผลรวมจริงเสมอ ทั้งเกิน 100 หรือติดลบ
  const nextScore = baseScore + delta;

  const update = {
    behaviorScore: nextScore,
    behaviorScoreUpdatedAt: serverTimestamp(),
    lastBehaviorScoreChange: {
      delta: nextScore - baseScore,
      oldStatus: oldStatus || null,
      newStatus: newStatus || null,
      updatedAt: serverTimestamp(),
      source: "classroom_attendance",
    },
  };

  return {
    update,
    summary: { previousScore: baseScore, nextScore, delta: nextScore - baseScore },
  };
};

// ── Per-Activity Behavior Rules ──────────────────────────────────────────────

export interface SpecialPeriodActivityRule {
  statusKey: 'present' | 'late' | 'absent';
  type: 'increase' | 'decrease';
  points: number;
  isActive: boolean;
  label: string;
}

export const DEFAULT_ACTIVITY_BEHAVIOR_RULES: SpecialPeriodActivityRule[] = [
  { statusKey: 'present', type: 'increase', points: 0, isActive: false, label: 'มาร่วมกิจกรรม' },
  { statusKey: 'late',    type: 'decrease', points: 2, isActive: true,  label: 'มาสาย' },
  { statusKey: 'absent',  type: 'decrease', points: 5, isActive: true,  label: 'ขาด' },
];

const getActivityStatusEffect = (
  rules: SpecialPeriodActivityRule[],
  status: string | null | undefined,
): number => {
  const s = String(status || '').toLowerCase().trim();
  const key = (
    s === 'present' ? 'present' :
    s === 'late'    ? 'late'    :
    s === 'absent'  ? 'absent'  : null
  ) as 'present' | 'late' | 'absent' | null;
  if (!key) return 0;
  const rule = rules.find(r => r.statusKey === key);
  if (!rule || !rule.isActive || rule.points <= 0) return 0;
  return rule.type === 'increase' ? rule.points : -rule.points;
};

export const applySpecialPeriodBehaviorScoreWithRules = ({
  batch,
  studentRef,
  currentScore,
  oldStatus,
  newStatus,
  activityRules,
  config,
}: {
  batch: WriteBatch;
  studentRef: DocumentReference;
  currentScore?: number | null;
  oldStatus?: string | null;
  newStatus?: string | null;
  activityRules?: SpecialPeriodActivityRule[] | null;
  config?: BehaviorScoreConfig | null;
}) => {
  const rules = activityRules && activityRules.length > 0 ? activityRules : DEFAULT_ACTIVITY_BEHAVIOR_RULES;
  const oldEffect = getActivityStatusEffect(rules, oldStatus);
  const newEffect = getActivityStatusEffect(rules, newStatus);
  const delta = newEffect - oldEffect;
  if (delta === 0) return null;

  const startingScore = Number(config?.startingScore ?? 100);
  const baseScore = Number.isFinite(Number(currentScore)) ? Number(currentScore) : startingScore;
  // ไม่จำกัดทั้งเพดานบนและเพดานล่าง — คะแนนสะท้อนผลรวมจริงเสมอ ทั้งเกิน 100 หรือติดลบ
  const nextScore = baseScore + delta;

  const update = {
    behaviorScore: nextScore,
    behaviorScoreUpdatedAt: serverTimestamp(),
    lastBehaviorScoreChange: {
      delta: nextScore - baseScore,
      oldStatus: oldStatus || null,
      newStatus: newStatus || null,
      updatedAt: serverTimestamp(),
      source: 'special_period',
    },
  };

  batch.set(studentRef, update, { merge: true });
  return { previousScore: baseScore, nextScore, delta: nextScore - baseScore };
};

// Points come ONLY from what the school explicitly saved on
// /academic/behavior-score-config — no hardcoded fallback amount. The return
// value is SIGNED: positive for a rule marked "เชิงบวก" (increase), negative
// for "เชิงลบ" (decrease, also the default when a rule has no type set) — do
// not re-negate it at call sites, it already carries the correct direction.
export const getSpecialPeriodRulePoints = (config: BehaviorScoreConfig | null | undefined, status?: string | null) => {
  const classStatusKey = getBehaviorClassroomAttendanceStatusKey(status);
  if (!classStatusKey) return 0;
  const rules = Array.isArray((config as any)?.specialPeriodRules) ? (config as any).specialPeriodRules : [];
  const rule = rules.find((item: ClassroomAttendanceScoreRule) => item.statusKey === classStatusKey);
  if (!rule || rule.isActive === false) return 0;
  const magnitude = Math.max(0, Number(rule.points) || 0);
  return rule.type === "increase" ? magnitude : -magnitude;
};

export const calculateSpecialPeriodBehaviorScoreChange = ({
  currentScore,
  oldStatus,
  newStatus,
  config,
}: BehaviorScoreCalculationParams) => {
  const oldEffect = getSpecialPeriodRulePoints(config, oldStatus);
  const newEffect = getSpecialPeriodRulePoints(config, newStatus);
  const delta = newEffect - oldEffect;

  if (delta === 0) return null;

  const startingScore = Number(config?.startingScore ?? 100);
  const baseScore = Number.isFinite(Number(currentScore)) ? Number(currentScore) : startingScore;
  // ไม่จำกัดทั้งเพดานบนและเพดานล่าง — คะแนนสะท้อนผลรวมจริงเสมอ ทั้งเกิน 100 หรือติดลบ
  const nextScore = baseScore + delta;

  const update = {
    behaviorScore: nextScore,
    behaviorScoreUpdatedAt: serverTimestamp(),
    lastBehaviorScoreChange: {
      delta: nextScore - baseScore,
      oldStatus: oldStatus || null,
      newStatus: newStatus || null,
      updatedAt: serverTimestamp(),
      source: "special_period",
    },
  };

  return {
    update,
    summary: { previousScore: baseScore, nextScore, delta: nextScore - baseScore },
  };
};
