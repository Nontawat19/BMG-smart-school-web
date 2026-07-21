import { CourseInstance, PeriodSetting, SpecialPeriod, Teacher, Schedule, Course, AssignmentConstraint, AssignmentConstraintMap } from './types';
import { CLASSES } from '@/utils/schoolUtils';

export { CLASSES };

// --- Constants ---
export const DAYS = { mon: 'จันทร์', tue: 'อังคาร', wed: 'พุธ', thu: 'พฤหัสบดี', fri: 'ศุกร์' };

export type ClassKey = keyof typeof CLASSES;

// Helper to format level/class name to Thai (e.g., m2 -> ม.2, p1 -> ป.1, k1 -> อนุบาล 1)
export const thaiFormatClass = (name: string): string => {
    if (!name) return name;
    let formatted = name;
    
    // Convert m/M to ม. (e.g. m1 -> ม.1, M2/1 -> ม.2/1)
    formatted = formatted.replace(/^[mM](?=\d)/, 'ม.');
    // Convert p/P to ป. (e.g. p1 -> ป.1)
    formatted = formatted.replace(/^[pP](?=\d)/, 'ป.');
    // Convert k/K to อ. (e.g. k1 -> อ.1)
    formatted = formatted.replace(/^[kK](?=\d)/, 'อ.');
    
    // Also handle cases where it might already be ม1 (no dot)
    formatted = formatted.replace(/^ม(?=\d)/, 'ม.');
    formatted = formatted.replace(/^ป(?=\d)/, 'ป.');
    
    // If it's "อ." (which is in CLASSES mapping), convert to "อนุบาล "
    if (formatted.startsWith('อ.')) {
        formatted = formatted.replace(/^อ\./, 'อนุบาล ');
    } else if (formatted.startsWith('อ') && !isNaN(Number(formatted.substring(1, 2)))) {
        // Handle "อ1" case
        formatted = formatted.replace(/^อ(?=\d)/, 'อนุบาล ');
    }

    return formatted;
};

// Helper to get display name for class(es)
export const getClassDisplayName = (classId?: string | string[]): string => {
    if (!classId) return '';
    
    const getSingleName = (id: string) => {
        const name = CLASSES[id as ClassKey] || id;
        return thaiFormatClass(name);
    };

    if (Array.isArray(classId)) {
        return classId.map(getSingleName).join(', ');
    }
    return getSingleName(classId);
};

// Helper to format combined classes like "ม.1,2,3"
export const formatClassDisplay = (classIds: string[]) => {
    const groups: Record<string, number[]> = {};
    const others: string[] = [];

    classIds.forEach(id => {
        const rawName = CLASSES[id as ClassKey] || id;
        const name = thaiFormatClass(rawName);
        
        // Handle standard prefixes for grouping
        if (name.includes('.')) {
            const parts = name.split('.'); // Split "ม.1" -> ["ม", "1"]
            if (parts.length === 2 && !isNaN(Number(parts[1]))) {
                const prefix = parts[0] + '.';
                const num = Number(parts[1]);
                if (!groups[prefix]) groups[prefix] = [];
                groups[prefix].push(num);
                return;
            }
        }
        
        // Handle "อนุบาล 1"
        if (name.startsWith('อนุบาล ')) {
            const numPart = name.replace('อนุบาล ', '').split('/')[0]; // Handle "อนุบาล 1/1" -> "1"
            const num = Number(numPart);
            if (!isNaN(num)) {
                const prefix = 'อนุบาล ';
                if (!groups[prefix]) groups[prefix] = [];
                groups[prefix].push(num);
                return;
            }
        }

        others.push(name);
    });

    const formattedGroups = Object.entries(groups).map(([prefix, nums]) => {
        const uniqueNums = Array.from(new Set(nums)).sort((a, b) => a - b);
        return `${prefix}${uniqueNums.join(',')}`;
    });

    return [...formattedGroups, ...others];
};

/**
 * Indexed Timetable for O(1) lookups
 * Maintains multiple indexes for fast queries
 */
export class IndexedTimetable {
    private bySlot = new Map<string, Array<{ teacherId: string; classId: string | string[]; room: string[]; courseId: string; taskId?: number }>>();
    private byTeacher = new Map<string, Set<string>>();
    private byClass = new Map<string, Set<string>>();

    add(slot: string, occupancy: { teacherId: string; classId: string | string[]; room: string[]; courseId: string; taskId?: number }) {
        // Update slot index
        if (!this.bySlot.has(slot)) {
            this.bySlot.set(slot, []);
        }
        this.bySlot.get(slot)!.push(occupancy);

        // Update teacher index
        if (!this.byTeacher.has(occupancy.teacherId)) {
            this.byTeacher.set(occupancy.teacherId, new Set());
        }
        this.byTeacher.get(occupancy.teacherId)!.add(slot);

        // Update class index
        const classIds = Array.isArray(occupancy.classId) ? occupancy.classId : [occupancy.classId];
        classIds.forEach(cId => {
            if (!this.byClass.has(cId)) {
                this.byClass.set(cId, new Set());
            }
            this.byClass.get(cId)!.add(slot);
        });
    }

    getSlotOccupancies(slot: string) {
        return this.bySlot.get(slot) || [];
    }

    getTeacherSlots(teacherId: string): Set<string> {
        return this.byTeacher.get(teacherId) || new Set();
    }

    getClassSlots(classId: string): Set<string> {
        return this.byClass.get(classId) || new Set();
    }

    toRecord(): Record<string, Array<{ teacherId: string; classId: string | string[]; room: string[]; courseId: string; taskId?: number }>> {
        const record: Record<string, Array<{ teacherId: string; classId: string | string[]; room: string[]; courseId: string; taskId?: number }>> = {};
        this.bySlot.forEach((occupancies, slot) => {
            record[slot] = occupancies;
        });
        return record;
    }
}

// Performance constants
export const PERFORMANCE_CONFIG = {
    BATCH_SIZE: 50, // Process tasks in batches
    TOP_SLOTS_LIMIT: 15, // Only try top N slots per task
    PROGRESS_UPDATE_INTERVAL: 25, // Update UI every N tasks
    ENABLE_PARALLEL: true, // Enable parallel processing
};

// --- Logic Helpers ---
// NOTE: subject-category classification lives in engine/schedulerEngine.ts
// (it checks `course.subjectGroup` first and also classifies ACTIVITY, which
// this file's old copy didn't). A second, drifted copy used to live here with
// zero callers anywhere in the codebase — removed rather than kept in sync by hand.

const THAI_DIGITS: Record<string, string> = {
    '๐': '0',
    '๑': '1',
    '๒': '2',
    '๓': '3',
    '๔': '4',
    '๕': '5',
    '๖': '6',
    '๗': '7',
    '๘': '8',
    '๙': '9'
};

const normalizeNumericText = (value: string) => (
    value
        .replace(/[๐-๙]/g, digit => THAI_DIGITS[digit] || digit)
        .replace(/(\d),(\d)/g, '$1.$2')
);

export const parseScheduleNumber = (value: unknown): number => {
    if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
    if (typeof value !== 'string') return 0;

    const normalized = normalizeNumericText(value.trim());
    if (!normalized) return 0;

    const direct = Number(normalized);
    if (Number.isFinite(direct)) return direct;

    const numericParts = normalized.match(/\d+(?:\.\d+)?/g);
    if (!numericParts || numericParts.length === 0) return 0;

    if (/[+＋]/.test(normalized)) {
        return numericParts.reduce((sum, part) => sum + Number(part), 0);
    }

    return Number(numericParts[0]) || 0;
};

export const getRequiredWeeklyPeriods = (
    course: Pick<Course, 'credits' | 'hoursPerWeek'>,
    fallback = 1
) => {
    const hours = Math.round(parseScheduleNumber(course.hoursPerWeek));
    const creditPeriods = Math.round(parseScheduleNumber(course.credits) * 2);
    const requiredPeriods = Math.max(hours, creditPeriods);
    return requiredPeriods > 0 ? requiredPeriods : fallback;
};

export const isProtectedSpecialPeriodSetting = (period?: Pick<PeriodSetting, 'id' | 'label'>) => {
    if (!period) return true;
    const normalizedId = String(period.id || '').trim().toLowerCase();
    const normalizedLabel = String(period.label || '').trim().toLowerCase().replace(/\s+/g, '');

    const protectedIds = new Set([
        'homeroom',
        'lunch',
        'guidance',
        'club',
        'scout',
        'special-activity',
        'integrated'
    ]);

    const protectedLabels = new Set([
        'โฮมรูม',
        'พักกลางวัน',
        'พัก',
        'แนะแนว',
        'ชุมนุม',
        'ลูกเสือ',
        'เนตรนารี',
        'ยุวกาชาด',
        'บูรณาการ'
    ].map(value => value.replace(/\s+/g, '')));

    return protectedIds.has(normalizedId) || protectedLabels.has(normalizedLabel);
};

const normalizeScheduleTime = (value?: string) => String(value || '').trim().replace('.', ':');

export const getMatchingSpecialPeriod = (
    specialPeriods: SpecialPeriod[] = [],
    periodSetting: Pick<PeriodSetting, 'id' | 'startTime' | 'endTime'> | undefined,
    dayKey: string
) => {
    if (!periodSetting) return undefined;
    const periodStart = normalizeScheduleTime(periodSetting.startTime);
    const periodEnd = normalizeScheduleTime(periodSetting.endTime);

    return specialPeriods.find(sp => {
        const dayMatches = !sp.day || sp.day === 'all' || sp.day === dayKey;
        if (!dayMatches) return false;
        if (sp.linkedPeriodId && sp.linkedPeriodId !== 'custom') {
            return sp.linkedPeriodId === periodSetting.id;
        }
        return normalizeScheduleTime(sp.startTime) === periodStart &&
            normalizeScheduleTime(sp.endTime) === periodEnd;
    });
};

const getConstraintLayout = (constraint?: AssignmentConstraint) => {
    const layout = constraint?.layoutPreference;
    if (layout && layout !== 'any') return layout;
    if (constraint?.type === 'double') return 'double_only';
    if (constraint?.type === 'single') return 'single_only';
    if (constraint?.type === 'mixed') return 'mixed';
    return 'any';
};

export const buildPreferredSessionDurations = (
    course: Pick<Course, 'credits' | 'hoursPerWeek'>,
    remainingPeriods: number,
    constraint?: AssignmentConstraint,
    totalWeeklyPeriods = getRequiredWeeklyPeriods(course)
) => {
    let remaining = Math.max(0, Math.round(remainingPeriods));
    const durations: number[] = [];
    const layout = getConstraintLayout(constraint);

    if (layout === 'single_only') {
        return Array.from({ length: remaining }, () => 1);
    }

    if (layout === 'double_only' || layout === 'mixed') {
        while (remaining >= 2) {
            durations.push(2);
            remaining -= 2;
        }
        if (remaining > 0) durations.push(1);
        return durations;
    }

    if (totalWeeklyPeriods >= 5 && remaining >= 2) {
        durations.push(2);
        remaining -= 2;
    }

    while (remaining > 0) {
        durations.push(1);
        remaining--;
    }

    return durations;
};

export const shouldUseDoubleSessionForNextPlacement = (
    course: Pick<Course, 'credits' | 'hoursPerWeek'>,
    alreadyPlacedPeriods: number,
    constraint?: AssignmentConstraint
) => {
    const totalWeeklyPeriods = getRequiredWeeklyPeriods(course);
    const remainingPeriods = Math.max(0, totalWeeklyPeriods - alreadyPlacedPeriods);
    return buildPreferredSessionDurations(course, remainingPeriods, constraint, totalWeeklyPeriods)[0] === 2;
};

export const isDoubleCapableConstraint = (constraint?: AssignmentConstraint) => {
    const layout = getConstraintLayout(constraint);
    return layout === 'double_only' || layout === 'mixed';
};

export const getPartnerIndex = (idx: number): number => {
    // Default fallback when custom period settings are not available:
    // allow doubles on any consecutive teaching periods inside the common
    // pre-lunch and post-lunch teaching runs, e.g. 1-2, 2-3, 3-4 and 6-7.
    const defaultTeachingRuns = [
        [1, 2, 3, 4],
        [6, 7, 8, 9],
    ];

    for (const teachingRun of defaultTeachingRuns) {
        const position = teachingRun.indexOf(idx);
        if (position === -1) continue;

        if (position + 1 < teachingRun.length) return teachingRun[position + 1];
        if (position - 1 >= 0) return teachingRun[position - 1];
        return -1;
    }

    return -1;
};

export const getPartnerIndexForPeriods = (idx: number, periodSettings: Array<PeriodSetting & { index?: number }> = []): number => {
    if (!periodSettings.length) return getPartnerIndex(idx);

    // Always use the array index (which matches the slot key format: {dayKey}-{arrayIndex}).
    // Ignoring custom period.index prevents mismatches when schools set non-sequential index values.
    let currentTeachingRun: number[] = [];
    const teachingRuns: number[][] = [];

    periodSettings.forEach((period, arrayIndex) => {
        if (period.isTeachingPeriod) {
            currentTeachingRun.push(arrayIndex);
            return;
        }
        if (currentTeachingRun.length) {
            teachingRuns.push(currentTeachingRun);
            currentTeachingRun = [];
        }
    });
    if (currentTeachingRun.length) teachingRuns.push(currentTeachingRun);

    for (const teachingIndexes of teachingRuns) {
        const position = teachingIndexes.indexOf(idx);
        if (position === -1) continue;

        // Any two consecutive periods within the same uninterrupted teaching block
        // (i.e. not separated by lunch/homeroom/a non-teaching period) can form a double
        // session — not only the rigid (1,2)/(3,4)/(5,6)/(7,8) blocks. Prefer the next
        // period as the partner so `idx` can act as the start of a pair (e.g. period 2
        // pairs with period 3, period 6 pairs with period 7); fall back to the previous
        // period when `idx` is the last slot in the run (it can then only be a partner,
        // never a start).
        if (position + 1 < teachingIndexes.length) return teachingIndexes[position + 1];
        if (position - 1 >= 0) return teachingIndexes[position - 1];
        return -1;
    }

    return -1;
};

export const isDoublePeriodStart = (
    idx: number,
    periodSettings: Array<PeriodSetting & { index?: number }> = []
): boolean => {
    return getPartnerIndexForPeriods(idx, periodSettings) === idx + 1;
};

export const checkConstraints = (
    course: CourseInstance,
    targetSlotId: string,
    teacher: Teacher | undefined,
    periodSettings: PeriodSetting[],
    specialPeriods: SpecialPeriod[],
    assignmentConstraints: AssignmentConstraintMap = {},
    dynamicUnavailableSlots: string[] = [],
    schoolMasterSchedule: Record<string, { teacherId: string; classId: string | string[]; course: Course | null; groupNumber: number }[]> = {},
    duration: number = 1,
    ignoredInstanceIds: string[] = [],
    isExplicitlyLocked: boolean = false,
    ignoredSlots: string[] = []
): { forbidden: boolean; message: string } => {
    const [dayKey, periodNumberStr] = targetSlotId.split('-');
    const periodIndex = parseInt(periodNumberStr);
    const periodSetting = periodSettings[periodIndex];

    // 0. Get granular assignment constraints
    const asgnCst = assignmentConstraints[course.compositeId];

    // Constraint 1: Non-teaching periods (Lunch, Homeroom, etc.)
    if (!periodSetting || !periodSetting.isTeachingPeriod || isProtectedSpecialPeriodSetting(periodSetting)) {
        return { forbidden: true, message: `ไม่สามารถวางรายวิชาในคาบ '${periodSetting?.label || 'พิเศษ'}' ได้` };
    }

    if (isExplicitlyLocked) {
        // For explicitly locked slots, we only check physical Master Schedule conflicts (Constraint 10)
        // Bypass all other preference-based/soft constraints.
        const currentTeacherIds = course.teacherIds?.length ? course.teacherIds : [teacher?.id || course.teacherId].filter(Boolean) as string[];
        const occupancies = schoolMasterSchedule[targetSlotId] || [];
        const courseClasses = Array.isArray(course.classId) ? course.classId : [course.classId || ''];
        const courseRooms = course.room && course.room.length > 0 ? course.room : ['all'];

        for (const occ of occupancies) {
            // A) Teacher Conflict: Same teacher teaching another course/group in the same slot
            const isSameAssignment = (occ.course?.id === course.id && Number(occ.course?.groupNumber) === Number(course.groupNumber));
            if (currentTeacherIds.includes(occ.teacherId) && !isSameAssignment) {
                return { forbidden: true, message: `ครูมีสอนวิชาอื่น (${occ.course?.title || 'ไม่ทราบชื่อ'}) อยู่แล้วในคาบนี้` };
            }

            // B) Class Conflict: This class group already has another teacher in this slot
            const occClasses = Array.isArray(occ.classId) ? occ.classId : [occ.classId];
            const sharedClass = courseClasses.find(c => c && occClasses.includes(c));
            
            if (sharedClass) {
                if (!currentTeacherIds.includes(occ.teacherId) && !isSameAssignment) {
                    return { forbidden: true, message: `นักเรียนชั้น ${getClassDisplayName(sharedClass)} มีเรียนวิชาอื่นอยู่แล้วในคาบนี้` };
                }
            }

            // C) Room Conflict: Another teacher is using the same room
            const occRooms = occ.course?.room && occ.course.room.length > 0 ? occ.course.room : ['all'];
            const hasSpecificRoomConflict = !courseRooms.includes('all') && !occRooms.includes('all') && courseRooms.some(r => occRooms.includes(r));
            if (hasSpecificRoomConflict && !currentTeacherIds.includes(occ.teacherId) && !isSameAssignment) {
                return { forbidden: true, message: `ห้องปฏิบัติการถูกใช้งานโดยครูท่านอื่นในคาบนี้` };
            }
        }

        return { forbidden: false, message: '' };
    }

    // Constraint 2: Teacher's permanent unavailability
    if (teacher?.preferences?.unavailableDays?.includes(dayKey)) {
        return { forbidden: true, message: `ครู ${teacher.name} ไม่สะดวกสอนในวัน${DAYS[dayKey as keyof typeof DAYS]}` };
    }
    if (teacher?.preferences?.unavailableSlots?.includes(targetSlotId)) {
        return { forbidden: true, message: `ครู ${teacher.name} ไม่สะดวกสอนในคาบนี้` };
    }

    // Constraint 3: Assignment-specific Excluded Days
    if (asgnCst?.excludedDays?.includes(dayKey)) {
        return { forbidden: true, message: `กลุ่มเรียนนี้ถูกกำหนดให้ไม่สอนในวัน${DAYS[dayKey as keyof typeof DAYS]}` };
    }

    // Constraint 4: Assignment-specific Locked Slots
    if (asgnCst?.isLocked && asgnCst.lockedSlots && asgnCst.lockedSlots.length > 0) {
        const isThisSlotLocked = asgnCst.lockedSlots.some((s: { day: string; periodId: string } | string) => {
            if (typeof s === 'string') return s === targetSlotId;
            return s.day === dayKey && s.periodId === periodSetting.id;
        });
        if (!isThisSlotLocked) {
            return { forbidden: true, message: `กลุ่มเรียนนี้ถูกล็อคให้สอนในคาบเฉพาะเจาะจงเท่านั้น` };
        }
    }

    // Constraint 4.5: Morning/Afternoon Preferences
    if (asgnCst) {
        const lunchIdx = periodSettings.findIndex(p => p.id === 'lunch');
        const lunchStartTime = lunchIdx !== -1 ? periodSettings[lunchIdx].startTime : '12:00';
        const currentPeriod = periodSettings[periodIndex];
        const isMorning = currentPeriod.startTime < lunchStartTime;

        // Double Period Preference
        const isDoubleStart = duration === 2; // In our scheduler, doubles are usually duration 2
        if (isDoubleStart && asgnCst.doublePreference && asgnCst.doublePreference !== 'any') {
            if (asgnCst.doublePreference === 'morning' && !isMorning) {
                return { forbidden: true, message: 'วิชานี้ถูกกำหนดให้สอนคาบคู่ในช่วงเช้าเท่านั้น' };
            }
            if (asgnCst.doublePreference === 'afternoon' && isMorning) {
                return { forbidden: true, message: 'วิชานี้ถูกกำหนดให้สอนคาบคู่ในช่วงบ่ายเท่านั้น' };
            }
        }

        // Single Period Preference
        const isSingle = duration === 1;
        if (isSingle && asgnCst.singlePreference && asgnCst.singlePreference !== 'any') {
            if (asgnCst.singlePreference === 'morning' && !isMorning) {
                return { forbidden: true, message: 'วิชานี้ถูกกำหนดให้สอนคาบเดี่ยวในช่วงเช้าเท่านั้น' };
            }
            if (asgnCst.singlePreference === 'afternoon' && isMorning) {
                return { forbidden: true, message: 'วิชานี้ถูกกำหนดให้สอนคาบเดี่ยวในช่วงบ่ายเท่านั้น' };
            }
        }
    }

    // Constraint 5: Double Period Type Check
    if (duration === 2) {
        const partnerIdx = getPartnerIndexForPeriods(periodIndex, periodSettings);
        const orderedDoubleSlots = [periodIndex, partnerIdx].sort((a, b) => a - b);
        if (partnerIdx === -1 || orderedDoubleSlots[0] !== periodIndex) {
            return { forbidden: true, message: 'วิชานี้ต้องจัดเป็นคาบคู่ (2 คาบติดกันในบล็อกที่กำหนด)' };
        }
        const partnerSetting = periodSettings[partnerIdx];
        if (!partnerSetting || !partnerSetting.isTeachingPeriod) {
            return { forbidden: true, message: 'วิชานี้ต้องเป็นคาบคู่ แต่คาบที่ติดกันไม่สามารถสอนได้' };
        }
    }

    // Constraint 6: Course's disallowed days
    if (course.constraints?.disallowedDays?.includes(dayKey)) {
        return { forbidden: true, message: `รายวิชา '${course.title}' ไม่สามารถจัดสอนในวัน${DAYS[dayKey as keyof typeof DAYS]}ได้` };
    }

    // Constraint 7: PE courses on Wednesday
    if (course.title.includes('พละ') && dayKey === 'wed') {
        return { forbidden: true, message: 'ไม่สามารถจัดสอนวิชาพละในวันพุธได้' };
    }

    // Constraint 8: Dynamically marked unavailable slot
    if (dynamicUnavailableSlots.includes(targetSlotId)) {
        return { forbidden: true, message: 'คาบนี้ถูกกำหนดให้เป็นคาบว่างชั่วคราว' };
    }

    // Constraint 9: Special Period (Activity)
    if (periodSetting) {
        const specialPeriod = getMatchingSpecialPeriod(specialPeriods, periodSetting, dayKey);
        if (specialPeriod) {
            return { forbidden: true, message: `ไม่สามารถวางในคาบ '${specialPeriod.title}' ได้` };
        }
    }

    // Constraint 10: Master Schedule Conflicts (Class, Teacher, Room)
    const currentTeacherIds = course.teacherIds?.length ? course.teacherIds : [teacher?.id || course.teacherId].filter(Boolean) as string[];
    const occupancies = schoolMasterSchedule[targetSlotId] || [];
    const courseClasses = Array.isArray(course.classId) ? course.classId : [course.classId || ''];
    const courseRooms = course.room && course.room.length > 0 ? course.room : ['all'];

    for (const occ of occupancies) {
        // A) Teacher Conflict: Same teacher teaching another course/group in the same slot
        const isSameAssignment = (occ.course?.id === course.id && Number(occ.course?.groupNumber) === Number(course.groupNumber));
        if (currentTeacherIds.includes(occ.teacherId) && !isSameAssignment) {
            return { forbidden: true, message: `ครูมีสอนวิชาอื่น (${occ.course?.title || 'ไม่ทราบชื่อ'}) อยู่แล้วในคาบนี้` };
        }

        // B) Class Conflict: This class group already has another teacher in this slot
        const occClasses = Array.isArray(occ.classId) ? occ.classId : [occ.classId];
        const sharedClass = courseClasses.find(c => c && occClasses.includes(c));

        if (sharedClass) {
            const currentGroup = Number(course.groupNumber || 0);
            if (!currentTeacherIds.includes(occ.teacherId) && !isSameAssignment) {
                // Parallel groups of the same course (e.g. English Group 1 ป.3/1 and Group 2 ป.3/2)
                // are taught simultaneously to DIFFERENT student rooms — allow them in the same slot.
                // They share the same classLevel ("ป.3") because classLevels stores level only, not room.
                const isParallelGroupSameCourse =
                    occ.course?.id === course.id &&
                    currentGroup > 0 &&
                    Number(occ.groupNumber ?? occ.course?.groupNumber ?? 0) !== currentGroup;
                if (!isParallelGroupSameCourse) {
                    return { forbidden: true, message: `นักเรียนชั้น ${getClassDisplayName(sharedClass)} มีเรียนวิชาอื่นอยู่แล้วในคาบนี้` };
                }
            }
        }

        // C) Room Conflict: Another teacher is using the same room
        const occRooms = occ.course?.room && occ.course.room.length > 0 ? occ.course.room : ['all'];
        const hasSpecificRoomConflict = !courseRooms.includes('all') && !occRooms.includes('all') && courseRooms.some(r => occRooms.includes(r));
        if (hasSpecificRoomConflict && !currentTeacherIds.includes(occ.teacherId) && !isSameAssignment) {
            return { forbidden: true, message: `ห้องปฏิบัติการถูกใช้งานโดยครูท่านอื่นในคาบนี้` };
        }
    }

    // Constraint 11: Max 2 consecutive periods of the same course on the same day for the same student cohort
    if (periodSetting) {
        const newPeriods = Array.from({ length: duration }, (_, i) => periodIndex + i);
        const currentGroup = Number(course.groupNumber || 0);

        for (const classId of courseClasses) {
            if (!classId) continue;
            const relevantPeriods = new Set<number>();
            newPeriods.forEach(p => relevantPeriods.add(p));

            periodSettings.forEach((ps, pIdx) => {
                if (newPeriods.includes(pIdx)) return;

                const slotId = `${dayKey}-${pIdx}`;
                const slotOccs = schoolMasterSchedule[slotId] || [];

                for (const occ of slotOccs) {
                    if (!occ.course) continue;
                    const occInstanceId = (occ.course as CourseInstance).instanceId;
                    if (occInstanceId && ignoredInstanceIds.includes(occInstanceId)) {
                        continue;
                    }
                    if (occ.course.id !== course.id) continue;

                    const occClasses = Array.isArray(occ.classId) ? occ.classId : [occ.classId];
                    if (occClasses.includes(classId)) {
                        const occGroup = Number(occ.groupNumber || occ.course.groupNumber || 0);
                        const isSameGroup = occGroup === currentGroup;
                        const isEitherAllGroups = occGroup === 0 || currentGroup === 0;

                        // instanceId is stripped on save (see useScheduleActions), so once a
                        // schedule is reloaded from Firestore, occInstanceId above is always
                        // undefined and can never match ignoredInstanceIds. Without this,
                        // the slot(s) this exact move is vacating still count toward the
                        // "3 consecutive periods" total, producing false positives.
                        const isVacatedByThisMove = ignoredSlots.includes(slotId) && (isSameGroup || isEitherAllGroups);
                        if (isVacatedByThisMove) continue;

                        if (isSameGroup || isEitherAllGroups) {
                            relevantPeriods.add(pIdx);
                        }
                    }
                }
            });

            const sortedPeriods = Array.from(relevantPeriods).sort((a, b) => a - b);
            let maxConsecutive = 0;
            if (sortedPeriods.length > 0) {
                let currentConsecutive = 1;
                maxConsecutive = 1;
                for (let i = 1; i < sortedPeriods.length; i++) {
                    if (sortedPeriods[i] === sortedPeriods[i - 1] + 1) {
                        currentConsecutive++;
                        maxConsecutive = Math.max(maxConsecutive, currentConsecutive);
                    } else {
                        currentConsecutive = 1;
                    }
                }
            }

            if (maxConsecutive >= 3) {
                return { forbidden: true, message: `ไม่อนุญาตให้จัดวิชาเดียวกัน (${course.title}) ติดกันตั้งแต่ 3 คาบขึ้นไปในวันเดียวกัน` };
            }
        }
    }

    return { forbidden: false, message: '' };
};

export const findValidSlots = (
    course: CourseInstance,
    teacherId: string,
    currentSchedule: Schedule,
    schoolMasterSchedule: Record<string, { teacherId: string; classId: string | string[]; course: Course | null; groupNumber: number }[]>,
    teacher: Teacher,
    periodSettings: PeriodSetting[],
    specialPeriods: SpecialPeriod[],
    assignmentConstraints: AssignmentConstraintMap = {},
    dynamicUnavailableSlots: string[] = []
): string[] => {
    const validSlots: Array<{ slot: string; score: number }> = [];
    const days = Object.keys(DAYS);

    // Get granular constraints
    const asgnCst = assignmentConstraints[course.compositeId];

    days.forEach(day => {
        periodSettings.forEach((period, periodIndex) => {
            if (!period.isTeachingPeriod || isProtectedSpecialPeriodSetting(period)) return;
            const slot = `${day}-${periodIndex}`;

            // 1. Basic Constraints
            const { forbidden } = checkConstraints(
                course, 
                slot, 
                teacher, 
                periodSettings, 
                specialPeriods, 
                assignmentConstraints, 
                dynamicUnavailableSlots, 
                schoolMasterSchedule,
                1,
                [course.instanceId]
            );
            if (forbidden) return;

            // 2. Check Local Schedule (Self-Conflict)
            if (currentSchedule[slot]) return; 

            // 3. Double Period validation
            if (isDoubleCapableConstraint(asgnCst)) {
                const partnerIdx = getPartnerIndexForPeriods(periodIndex, periodSettings);
                if (partnerIdx !== -1) {
                    const partnerSlot = `${day}-${partnerIdx}`;
                    if (currentSchedule[partnerSlot]) {
                        // If it's a double, both must be free. 
                        // For mixed, we might still allow it as a single if no double partner is found, 
                        // but usually findValidSlots for doubles should prioritize double-able slots.
                        if (getConstraintLayout(asgnCst) === 'double_only') return;
                    }
                } else if (getConstraintLayout(asgnCst) === 'double_only') {
                    return; // Double must be in a double-able slot
                }
            }

            // 4. Check Master Schedule (Class & Room Conflict)
            // (Note: Already checked inside checkConstraints now)
            
            let score = 100;

            if (asgnCst) {
                const isMorning = period.startTime < (periodSettings.find(p => p.id === 'lunch')?.startTime || '12:00');
                const pref = isDoubleCapableConstraint(asgnCst) ? asgnCst.doublePreference : asgnCst.singlePreference;

                if (pref === 'morning' && isMorning) score += 50;
                if (pref === 'afternoon' && !isMorning) score += 50;
                if (pref === 'morning' && !isMorning) score -= 30;
                if (pref === 'afternoon' && isMorning) score -= 30;

                // Extra points for double if the partner slot is also free
                if (isDoubleCapableConstraint(asgnCst)) {
                    const partnerIdx = getPartnerIndexForPeriods(periodIndex, periodSettings);
                    if (partnerIdx !== -1 && !currentSchedule[`${day}-${partnerIdx}`]) {
                        score += 40;
                    }
                }
            }

            validSlots.push({ slot, score });
        });
    });

    return validSlots.sort((a, b) => b.score - a.score).map(s => s.slot);
};

/**
 * Checks if a course is a standard academic course that should be scheduled in the timetable bank.
 * Excludes activities, clubs, and other extracurricular items.
 * IS courses (กลุ่มสาระค้นคว้า / Independent Study) are always considered academic.
 */

/**
 * ตรวจว่าเป็นวิชากิจกรรมพัฒนาผู้เรียน (ลส/ยุว/รด/ชุมนุม ฯลฯ)
 * ใช้สำหรับแยก Mode 2 (ไม่มีคาบพิเศษ) ออกจาก isAcademicCourse
 */
export const isClubCourse = (course: { type?: string; title?: string; name?: string }): boolean => {
    if (!course) return false;
    const type = (course.type || '').toLowerCase();
    const label = ((course.title || '') + ' ' + (course.name || '')).toLowerCase();
    return type === 'ชุมนุม' || label.includes('ชุมนุม');
};

export const isActivityCourse = (course: { type?: string; code?: string; subjectGroup?: string }): boolean => {
    if (!course) return false;
    const sg = (course.subjectGroup || '').toLowerCase();
    const type = (course.type || '').toLowerCase();
    const code = (course.code || '');
    return sg.includes('กิจกรรมพัฒนาผู้เรียน') || sg === '9' ||
           type === 'กิจกรรม' || type.includes('กิจกรรมพัฒนาผู้เรียน') ||
           type === 'ชุมนุม' ||
           /^ก\d/.test(code);
};

export const isAcademicCourse = (course: { title?: string; code?: string; subjectGroup?: string; credits?: string | number }): boolean => {
    if (!course) return false;
    
    const title = (course.title || "").toLowerCase();
    const subjectGroup = (course.subjectGroup || "").toLowerCase();
    const code = (course.code || "").toLowerCase();
    
    // IS courses (กลุ่มสาระค้นคว้า / Independent Study) are always academic — they need scheduling
    const isISCourse = (
        subjectGroup.includes("ค้นคว้า") ||
        subjectGroup === "i" ||
        /^i\d/.test(code) // IS course codes: I30201, I30202, I30203 etc.
    );
    if (isISCourse) return true;

    // If the subject group is "กิจกรรมพัฒนาผู้เรียน", it's non-academic for timetable bank
    // (can still be shown via the "แสดงวิชากิจกรรม" toggle in PeriodConstraintPage)
    if (subjectGroup.includes("กิจกรรมพัฒนาผู้เรียน")) {
        return false;
    }
    
    // Explicit exclusions based on common Thai school subject types and keywords
    const exclusions = [
        'homeroom',
        'โฮมรูม',
        'assembly',
        'ประชุมสาย',
        'สวดมนต์',
        'หน้าเสาธง',
        'พัก',
        'ทัศนศึกษา',
        'เวร'
    ];

    const isExcluded = exclusions.some(keyword => 
        title.includes(keyword) || 
        subjectGroup.includes(keyword) ||
        code.includes(keyword)
    );

    // Filter out items that are clearly not academic courses (usually have 0 credits or are marked as activity)
    if (course.credits === 0 || course.credits === '0') {
        if (isExcluded) return false;
    }

    return !isExcluded;
};
