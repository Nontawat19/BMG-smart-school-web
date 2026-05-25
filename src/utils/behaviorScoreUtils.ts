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

interface BehaviorScoreConfig {
  startingScore?: number;
  minScore?: number;
  maxScore?: number;
  attendanceRules?: AttendanceScoreRule[];
  flagCeremonyRules?: FlagCeremonyScoreRule[];
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

const getBehaviorFlagCeremonyStatusKey = (status?: string | null): FlagCeremonyStatusKey | null => {
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

export const getRulePoints = (config: BehaviorScoreConfig | null | undefined, status?: string | null) => {
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
