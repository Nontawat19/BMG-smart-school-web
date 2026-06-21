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
}

interface BehaviorScoreConfig {
  startingScore?: number;
  minScore?: number;
  maxScore?: number;
  attendanceRules?: AttendanceScoreRule[];
  flagCeremonyRules?: FlagCeremonyScoreRule[];
  classroomAttendanceRules?: ClassroomAttendanceScoreRule[];
}

const DEFAULT_ATTENDANCE_RULES: AttendanceScoreRule[] = [
  { statusKey: "late", points: 5, isActive: true },
  { statusKey: "absent", points: 10, isActive: true },
  { statusKey: "early", points: 5, isActive: true },
  { statusKey: "noCheckout", points: 3, isActive: true },
];

const DEFAULT_FLAG_CEREMONY_RULES: FlagCeremonyScoreRule[] = [
  { statusKey: "normal", points: 0, isActive: false },
  { statusKey: "sickLeave", points: 0, isActive: false },
  { statusKey: "personalLeave", points: 0, isActive: false },
  { statusKey: "cancelFlag", points: 0, isActive: false },
  { statusKey: "noScanPresentNoDeduct", points: 0, isActive: false },
  { statusKey: "noScanPresentDeduct", points: 5, isActive: true },
  { statusKey: "scannedAbsentDeduct", points: 5, isActive: true },
  { statusKey: "cancelFlagKeepGate", points: 0, isActive: false },
];

const DEFAULT_CLASSROOM_ATTENDANCE_RULES: ClassroomAttendanceScoreRule[] = [
  { statusKey: "present", points: 0, isActive: false },
  { statusKey: "late", points: 2, isActive: true },
  { statusKey: "absent", points: 5, isActive: true },
  { statusKey: "escape", points: 10, isActive: true },
  { statusKey: "leave", points: 0, isActive: false },
];

interface ApplyBehaviorScoreParams {
  batch: WriteBatch;
  studentRef: DocumentReference;
  currentScore?: number | null;
  oldStatus?: string | null;
  newStatus?: string | null;
  config?: BehaviorScoreConfig | null;
}

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

export const getRulePoints = (config: BehaviorScoreConfig | null | undefined, status?: string | null, type?: "attendance" | "flag" | "classroom") => {
  if (type === "classroom" || (status && String(status).startsWith("class:"))) {
    const classStatusKey = getBehaviorClassroomAttendanceStatusKey(status);
    if (classStatusKey) {
      const rules = Array.isArray(config?.classroomAttendanceRules) && config.classroomAttendanceRules.length > 0
        ? config.classroomAttendanceRules
        : DEFAULT_CLASSROOM_ATTENDANCE_RULES;
      const rule = rules.find(item => item.statusKey === classStatusKey);
      if (!rule || rule.isActive === false) return 0;
      return Math.max(0, Number(rule.points) || 0);
    }
    return 0;
  }
  const flagStatusKey = getBehaviorFlagCeremonyStatusKey(status);
  if (flagStatusKey) {
    const rules = Array.isArray(config?.flagCeremonyRules) && config.flagCeremonyRules.length > 0
      ? config.flagCeremonyRules
      : DEFAULT_FLAG_CEREMONY_RULES;
    const rule = rules.find(item => item.statusKey === flagStatusKey);
    if (!rule || rule.isActive === false) return 0;
    return Math.max(0, Number(rule.points) || 0);
  }

  const statusKey = getBehaviorAttendanceStatusKey(status);
  if (!statusKey) return 0;

  const rules = Array.isArray(config?.attendanceRules) && config.attendanceRules.length > 0
    ? config.attendanceRules
    : DEFAULT_ATTENDANCE_RULES;
  const rule = rules.find(item => item.statusKey === statusKey);
  if (!rule || rule.isActive === false) return 0;

  return Math.max(0, Number(rule.points) || 0);
};

export const applyAttendanceBehaviorScore = ({
  batch,
  studentRef,
  currentScore,
  oldStatus,
  newStatus,
  config,
}: ApplyBehaviorScoreParams) => {
  const result = calculateAttendanceBehaviorScoreChange({
    currentScore,
    oldStatus,
    newStatus,
    config,
  });

  if (!result) return null;

  batch.set(studentRef, result.update, { merge: true });

  return result.summary;
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
  const minScore = Number(config?.minScore ?? 0);
  const maxScore = Number(config?.maxScore ?? 100);
  const baseScore = Number.isFinite(Number(currentScore)) ? Number(currentScore) : startingScore;
  const nextScore = Math.min(maxScore, Math.max(minScore, baseScore + delta));

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

export const applyClassroomBehaviorScore = ({
  batch,
  studentRef,
  currentScore,
  oldStatus,
  newStatus,
  config,
}: ApplyBehaviorScoreParams) => {
  const oldPenalty = getRulePoints(config, oldStatus, "classroom");
  const newPenalty = getRulePoints(config, newStatus, "classroom");
  const delta = oldPenalty - newPenalty;

  if (delta === 0) return null;

  const startingScore = Number(config?.startingScore ?? 100);
  const minScore = Number(config?.minScore ?? 0);
  const maxScore = Number(config?.maxScore ?? 100);
  const baseScore = Number.isFinite(Number(currentScore)) ? Number(currentScore) : startingScore;
  const nextScore = Math.min(maxScore, Math.max(minScore, baseScore + delta));

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

  batch.set(studentRef, update, { merge: true });

  return { previousScore: baseScore, nextScore, delta: nextScore - baseScore };
};

const DEFAULT_SPECIAL_PERIOD_RULES: ClassroomAttendanceScoreRule[] = [
  { statusKey: "present", points: 0, isActive: false },
  { statusKey: "late", points: 2, isActive: true },
  { statusKey: "absent", points: 5, isActive: true },
  { statusKey: "escape", points: 10, isActive: true },
  { statusKey: "leave", points: 0, isActive: false },
];

export const getSpecialPeriodRulePoints = (config: BehaviorScoreConfig | null | undefined, status?: string | null) => {
  const classStatusKey = getBehaviorClassroomAttendanceStatusKey(status);
  if (!classStatusKey) return 0;
  const rules = Array.isArray((config as any)?.specialPeriodRules) && (config as any).specialPeriodRules.length > 0
    ? (config as any).specialPeriodRules
    : DEFAULT_SPECIAL_PERIOD_RULES;
  const rule = rules.find((item: ClassroomAttendanceScoreRule) => item.statusKey === classStatusKey);
  if (!rule || rule.isActive === false) return 0;
  return Math.max(0, Number(rule.points) || 0);
};

export const applySpecialPeriodBehaviorScore = ({
  batch,
  studentRef,
  currentScore,
  oldStatus,
  newStatus,
  config,
}: ApplyBehaviorScoreParams) => {
  const oldPenalty = getSpecialPeriodRulePoints(config, oldStatus);
  const newPenalty = getSpecialPeriodRulePoints(config, newStatus);
  const delta = oldPenalty - newPenalty;

  if (delta === 0) return null;

  const startingScore = Number(config?.startingScore ?? 100);
  const minScore = Number(config?.minScore ?? 0);
  const maxScore = Number(config?.maxScore ?? 100);
  const baseScore = Number.isFinite(Number(currentScore)) ? Number(currentScore) : startingScore;
  const nextScore = Math.min(maxScore, Math.max(minScore, baseScore + delta));

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

  batch.set(studentRef, update, { merge: true });

  return { previousScore: baseScore, nextScore, delta: nextScore - baseScore };
};
