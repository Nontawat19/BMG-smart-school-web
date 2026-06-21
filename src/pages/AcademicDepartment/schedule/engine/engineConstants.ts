/**
 * Named scoring constants for the scheduling engine.
 * Centralised here so callers read intent, not raw numbers.
 */

// ─── Slot scoring base ────────────────────────────────────────────────────────
export const SCORE_BASE = 500;

// ─── Preference bonuses / penalties ──────────────────────────────────────────
export const SCORE_PREF_MATCH_BONUS = 2000;
export const SCORE_PREF_MISMATCH_PENALTY = 500;
export const SCORE_CATEGORY_HALF_BONUS = 50;

// ─── Teacher daily-load thresholds ───────────────────────────────────────────
export const TEACHER_HEAVY_DAY_LOAD = 6;
export const TEACHER_HEAVY_DAY_PENALTY = 800;
export const TEACHER_MODERATE_DAY_LOAD = 4;
export const TEACHER_MODERATE_DAY_PENALTY = 200;
export const TEACHER_LIGHT_DAY_LOAD = 2;
export const TEACHER_LIGHT_DAY_BONUS = 300;

// ─── Class daily-load thresholds ─────────────────────────────────────────────
export const CLASS_VERY_HEAVY_DAY_LOAD = 7;
export const CLASS_VERY_HEAVY_DAY_PENALTY = 1200;
export const CLASS_HEAVY_DAY_LOAD = 6;
export const CLASS_HEAVY_DAY_PENALTY = 700;
export const CLASS_MODERATE_DAY_LOAD = 5;
export const CLASS_MODERATE_DAY_PENALTY = 300;
export const CLASS_LIGHT_DAY_LOAD = 3;
export const CLASS_LIGHT_DAY_BONUS = 250;

// ─── Half-day balance ────────────────────────────────────────────────────────
export const HALF_DAY_BALANCE_WEIGHT = 180;
export const HALF_DAY_IMBALANCE_THRESHOLD = 2;
export const HALF_DAY_IMBALANCE_PENALTY = 220;

// ─── Previous slot avoidance ─────────────────────────────────────────────────
export const PREV_SLOT_PENALTY_DOUBLE = 2200;
export const PREV_SLOT_PENALTY_SINGLE = 1400;

// ─── Gap / consecutive penalties ─────────────────────────────────────────────
export const GAP_WEIGHT_PER_PERIOD = 180;
export const CONSECUTIVE_VERY_HIGH_THRESHOLD = 6;
export const CONSECUTIVE_VERY_HIGH_PENALTY = 800;
export const CONSECUTIVE_HIGH_THRESHOLD = 5;
export const CONSECUTIVE_HIGH_PENALTY = 400;

// ─── Room daily-load ─────────────────────────────────────────────────────────
export const ROOM_HEAVY_DAY_LOAD = 6;
export const ROOM_HEAVY_DAY_PENALTY = 500;
export const ROOM_MODERATE_DAY_LOAD = 4;
export const ROOM_MODERATE_DAY_PENALTY = 200;
export const ROOM_LIGHT_DAY_LOAD = 1;
export const ROOM_LIGHT_DAY_BONUS = 150;

// ─── Period-load weights ─────────────────────────────────────────────────────
export const CLASS_PERIOD_LOAD_WEIGHT = 260;
export const TEACHER_PERIOD_LOAD_WEIGHT = 80;

// ─── Last-morning-period bonus ────────────────────────────────────────────────
export const LAST_MORNING_PERIOD_BONUS = 80;

// ─── Teacher consecutive stream ──────────────────────────────────────────────
export const TEACHER_STREAM_HEAVY_THRESHOLD = 3;
export const TEACHER_STREAM_HEAVY_PENALTY = 1500;
export const TEACHER_STREAM_MODERATE_THRESHOLD = 2;
export const TEACHER_STREAM_MODERATE_PENALTY = 300;

// ─── Continuity / fragmentation ──────────────────────────────────────────────
export const CONTINUITY_BONUS = 800;
export const GAP_AVOIDANCE_PENALTY = 1500;
export const FRAGMENTATION_PENALTY = 1000;

// ─── Subject spreading across days ───────────────────────────────────────────
export const SUBJECT_REPEAT_PENALTY_HIGH_FREQ = 1500;
export const SUBJECT_REPEAT_PENALTY_LOW_FREQ = 3000;
export const NEW_DAY_BONUS = 1000;
export const REPEAT_HALF_DAY_NUDGE = 120;

// ─── Category time-slot bonus (small nudge, not a hard preference) ────────────
export const CATEGORY_TIME_BONUS = 25;
export const CATEGORY_TIME_WEAK_BONUS = 5;

// ─── BBL (Brain-Based Learning) core-subject morning placement ───────────────
// Stronger and more specific than the generic ACADEMIC category bonus above:
// applies only to the 4 core subjects (Thai/Math/Science/Social) that
// `calculateBBLCompliance` actually measures, so the engine optimizes for the
// same metric that is reported to users.
export const CORE_SUBJECT_MORNING_BONUS = 900;
export const CORE_SUBJECT_AFTERNOON_PENALTY = 250;

// ─── Jitter (ensures diversity across runs when scores tie) ──────────────────
export const JITTER_RANGE = 80;

// ─── Quality evaluation weights ──────────────────────────────────────────────
export const QUALITY_PLACED_WEIGHT = 10_000;
export const QUALITY_UNPLACED_PENALTY = 1_000_000;
export const QUALITY_TEACHER_BALANCE_WEIGHT = 220;
export const QUALITY_TEACHER_HALF_BALANCE_WEIGHT = 140;
export const QUALITY_CLASS_BALANCE_WEIGHT = 420;
export const QUALITY_CLASS_GAP_WEIGHT = 260;
export const QUALITY_CLASS_CONSECUTIVE_THRESHOLD = 6;
export const QUALITY_CLASS_CONSECUTIVE_WEIGHT = 900;
export const QUALITY_CLASS_HALF_BALANCE_WEIGHT = 220;
export const QUALITY_ROOM_BALANCE_WEIGHT = 120;
export const QUALITY_SUBJECT_OVER_REPEAT_PENALTY = 5000;
export const QUALITY_SUBJECT_BALANCED_BONUS = 250;
// Weight applied to the BBL compliance ratio (0..1) so multi-run selection
// favors the run with the best core-subject morning placement, not just
// unplaced-count and the balance/gap terms above.
export const QUALITY_BBL_COMPLIANCE_WEIGHT = 4000;

// ─── Repair phase ────────────────────────────────────────────────────────────
// ─── Repair phase & Backtracking ─────────────────────────────────────────────
export const REPAIR_STRICT_PHASE_RATIO = 0.6;
export const MAX_EJECT_BLOCKERS = 3; // Allow ejecting up to 3 blockers
export const EJECT_DOUBLE_BLOCKER_WEIGHT = 10;
export const MAX_BACKTRACK_DEPTH = 3; // Recursive backtracking max depth
export const MAX_BACKTRACK_BRANCHES = 4; // Max slots to try per backtracking step
