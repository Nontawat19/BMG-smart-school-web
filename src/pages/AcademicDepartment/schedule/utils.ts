import { CourseInstance, PeriodSetting, SpecialPeriod, Teacher, Schedule, Course, AssignmentConstraintMap } from './types';
import { CLASSES } from '@/utils/schoolUtils';

export { CLASSES };

// --- Constants ---
export const DAYS = { mon: 'จันทร์', tue: 'อังคาร', wed: 'พุธ', thu: 'พฤหัสบดี', fri: 'ศุกร์' };

export type ClassKey = keyof typeof CLASSES;

// Helper to get display name for class(es)
export const getClassDisplayName = (classId?: string | string[]): string => {
    if (!classId) return '';
    if (Array.isArray(classId)) {
        return classId.map(id => CLASSES[id as ClassKey] || id).join(', ');
    }
    return CLASSES[classId as ClassKey] || classId;
};

// Helper to format combined classes like "ม.1,2,3"
export const formatClassDisplay = (classIds: string[]) => {
    const groups: Record<string, number[]> = {};
    const others: string[] = [];

    classIds.forEach(id => {
        const name = CLASSES[id as ClassKey] || id;
        const parts = name.split('.'); // Split "ม.1" -> ["ม", "1"]
        if (parts.length === 2 && !isNaN(Number(parts[1]))) {
            const prefix = parts[0] + '.';
            const num = Number(parts[1]);
            if (!groups[prefix]) groups[prefix] = [];
            groups[prefix].push(num);
        } else {
            others.push(name);
        }
    });

    const formattedGroups = Object.entries(groups).map(([prefix, nums]) => {
        nums.sort((a, b) => a - b);
        return `${prefix}${nums.join(',')}`;
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

export const getSubjectCategory = (title: string): 'ACADEMIC' | 'ACTIVITY' | 'GENERAL' => {
    const lowerTitle = title.toLowerCase();
    const academicKeywords = ['คณิต', 'วิทย์', 'วิทยาศาสตร์', 'ฟิสิกส์', 'เคมี', 'ชีวะ', 'ไทย', 'ภาษาไทย', 'อังกฤษ', 'สังคม', 'ประวัติ', 'ศาสนา', 'math', 'sci', 'phy', 'chem', 'bio', 'eng'];
    if (academicKeywords.some(k => lowerTitle.includes(k))) return 'ACADEMIC';
    return 'GENERAL';
};

export const getPartnerIndex = (idx: number): number => {
    // Standard Thai school block pairs: (1,2), (3,4), (6,7), (8,9)
    // index 0=Homeroom, 5=Lunch
    if (idx === 1) return 2;
    if (idx === 2) return 1;
    if (idx === 3) return 4;
    if (idx === 4) return 3;
    if (idx === 6) return 7;
    if (idx === 7) return 6;
    if (idx === 8) return 9;
    if (idx === 9) return 8;
    return -1;
};

export const checkConstraints = (
    course: CourseInstance,
    targetSlotId: string,
    teacher: Teacher | undefined,
    periodSettings: PeriodSetting[],
    specialPeriods: SpecialPeriod[],
    assignmentConstraints: AssignmentConstraintMap = {},
    dynamicUnavailableSlots: string[] = [],
    schoolMasterSchedule: Record<string, { teacherId: string; classId: string | string[]; course: Course | null }[]> = {},
    duration: number = 1
): { forbidden: boolean; message: string } => {
    const [dayKey, periodNumberStr] = targetSlotId.split('-');
    const periodIndex = parseInt(periodNumberStr);
    const periodSetting = periodSettings[periodIndex];

    // 0. Get granular assignment constraints
    const asgnCst = assignmentConstraints[course.compositeId];

    // Constraint 1: Non-teaching periods (Lunch, Homeroom, etc.)
    if (!periodSetting || !periodSetting.isTeachingPeriod) {
        return { forbidden: true, message: `ไม่สามารถวางรายวิชาในคาบ '${periodSetting?.label || 'พิเศษ'}' ได้` };
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
        const isThisSlotLocked = asgnCst.lockedSlots.some((s: any) => {
            if (typeof s === 'string') return s === targetSlotId;
            return s.day === dayKey && s.periodId === `period-${periodNumberStr}`;
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
        if (asgnCst.type === 'double' || asgnCst.type === 'mixed') {
            const isDoubleStart = duration === 2; // In our scheduler, doubles are usually duration 2
            if (isDoubleStart && asgnCst.doublePreference && asgnCst.doublePreference !== 'any') {
                if (asgnCst.doublePreference === 'morning' && !isMorning) {
                    return { forbidden: true, message: 'วิชานี้ถูกกำหนดให้สอนคาบคู่ในช่วงเช้าเท่านั้น' };
                }
                if (asgnCst.doublePreference === 'afternoon' && isMorning) {
                    return { forbidden: true, message: 'วิชานี้ถูกกำหนดให้สอนคาบคู่ในช่วงบ่ายเท่านั้น' };
                }
            }
        }

        // Single Period Preference
        if (asgnCst.type === 'single' || asgnCst.type === 'mixed') {
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
    }

    // Constraint 5: Double Period Type Check
    if (asgnCst?.type === 'double' && duration === 2) {
        const partnerIdx = getPartnerIndex(periodIndex);
        if (partnerIdx === -1) {
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
        const specialPeriod = specialPeriods.find(sp =>
            (sp.linkedPeriodId === periodSetting.id && (!sp.day || sp.day === 'all' || sp.day === dayKey)) ||
            (sp.startTime === periodSetting.startTime && sp.endTime === periodSetting.endTime && (!sp.day || sp.day === 'all' || sp.day === dayKey))
        );
        if (specialPeriod) {
            return { forbidden: true, message: `ไม่สามารถวางในคาบ '${specialPeriod.title}' ได้` };
        }
    }

    // Constraint 10: Master Schedule Conflicts (Class, Teacher, Room)
    const currentTeacherId = teacher?.id || course.teacherId;
    const occupancies = schoolMasterSchedule[targetSlotId] || [];
    const courseClasses = Array.isArray(course.classId) ? course.classId : [course.classId || ''];
    const courseRooms = course.room && course.room.length > 0 ? course.room : ['all'];

    for (const occ of occupancies) {
        // A) Teacher Conflict: Same teacher teaching another course/group in the same slot
        const isSameAssignment = (occ.course?.id === course.id && Number(occ.course?.groupNumber) === Number(course.groupNumber));
        if (occ.teacherId === currentTeacherId && !isSameAssignment) {
            return { forbidden: true, message: `ครู ${teacher?.name || 'ผู้นี้'} มีสอนวิชาอื่น (${occ.course?.title || 'ไม่ทราบชื่อ'}) อยู่แล้วในคาบนี้` };
        }

        // B) Class Conflict: This class group already has another teacher in this slot
        const occClasses = Array.isArray(occ.classId) ? occ.classId : [occ.classId];
        const sharedClass = courseClasses.find(c => c && occClasses.includes(c));
        if (sharedClass && occ.teacherId !== currentTeacherId) {
            return { forbidden: true, message: `นักเรียนชั้น ${CLASSES[sharedClass as ClassKey] || sharedClass} มีเรียนวิชาอื่นอยู่แล้วในคาบนี้` };
        }

        // C) Room Conflict: Another teacher is using the same room
        const occRooms = occ.course?.room && occ.course.room.length > 0 ? occ.course.room : ['all'];
        const hasSpecificRoomConflict = !courseRooms.includes('all') && !occRooms.includes('all') && courseRooms.some(r => occRooms.includes(r));
        if (hasSpecificRoomConflict && occ.teacherId !== currentTeacherId) {
            return { forbidden: true, message: `ห้องปฏิบัติการถูกใช้งานโดยครูท่านอื่นในคาบนี้` };
        }
    }

    return { forbidden: false, message: '' };
};

export const findValidSlots = (
    course: CourseInstance,
    teacherId: string,
    currentSchedule: Schedule,
    schoolMasterSchedule: Record<string, { teacherId: string; classId: string | string[]; course: Course | null }[]>,
    teacher: Teacher,
    periodSettings: PeriodSetting[],
    specialPeriods: SpecialPeriod[],
    assignmentConstraints: AssignmentConstraintMap = {},
    dynamicUnavailableSlots: string[] = []
): string[] => {
    const validSlots: Array<{ slot: string; score: number }> = [];
    const days = Object.keys(DAYS);
    const periods = periodSettings.filter(p => p.isTeachingPeriod);

    // Get granular constraints
    const asgnCst = assignmentConstraints[course.compositeId];

    days.forEach(day => {
        periods.forEach(period => {
            const pNum = parseInt(period.id.replace('period-', ''));
            const slot = `${day}-${pNum}`;

            // 1. Basic Constraints
            const { forbidden } = checkConstraints(course, slot, teacher, periodSettings, specialPeriods, assignmentConstraints, dynamicUnavailableSlots, schoolMasterSchedule);
            if (forbidden) return;

            // 2. Check Local Schedule (Self-Conflict)
            if (currentSchedule[slot]) return; 

            // 3. Double Period validation
            if (asgnCst?.type === 'double' || asgnCst?.type === 'mixed') {
                const partnerIdx = getPartnerIndex(pNum);
                if (partnerIdx !== -1) {
                    const partnerSlot = `${day}-${partnerIdx}`;
                    if (currentSchedule[partnerSlot]) {
                        // If it's a double, both must be free. 
                        // For mixed, we might still allow it as a single if no double partner is found, 
                        // but usually findValidSlots for doubles should prioritize double-able slots.
                        if (asgnCst.type === 'double') return;
                    }
                } else if (asgnCst.type === 'double') {
                    return; // Double must be in a double-able slot
                }
            }

            // 4. Check Master Schedule (Class & Room Conflict)
            // (Note: Already checked inside checkConstraints now)
            
            let score = 100;

            if (asgnCst) {
                const isMorning = pNum <= 4;
                const pref = asgnCst.type === 'double' ? asgnCst.doublePreference : asgnCst.singlePreference;

                if (pref === 'morning' && isMorning) score += 50;
                if (pref === 'afternoon' && !isMorning) score += 50;
                if (pref === 'morning' && !isMorning) score -= 30;
                if (pref === 'afternoon' && isMorning) score -= 30;

                // Extra points for double if the partner slot is also free
                if (asgnCst.type === 'double' || asgnCst.type === 'mixed') {
                    const partnerIdx = getPartnerIndex(pNum);
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
 */
export const isAcademicCourse = (course: { title?: string; code?: string; subjectGroup?: string; credits?: string | number }): boolean => {
    if (!course) return false;
    
    const title = (course.title || "").toLowerCase();
    const subjectGroup = (course.subjectGroup || "").toLowerCase();
    const code = (course.code || "").toLowerCase();
    
    // Explicit exclusions based on common Thai school subject types and keywords
    const exclusions = [
        'กิจกรรม',
        'ชุมนุม',
        'ลดเวลาเรียน',
        'ลูกเสือ',
        'เนตรนารี',
        'ยุวกาชาด',
        'บำเพ็ญประโยชน์',
        'จิตอาสา',
        'homeroom',
        'โฮมรูม',
        'assembly',
        'ประชุมสาย',
        'สวดมนต์',
        'หน้าเสาธง',
        'แนะแนว',
        'เวร',
        'พัก',
        'ทัศนศึกษา'
    ];

    const isExcluded = exclusions.some(keyword => 
        title.includes(keyword) || 
        subjectGroup.includes(keyword) ||
        code.includes(keyword)
    );
    
    // If the subject group is specifically "กิจกรรมพัฒนาผู้เรียน", it's usually non-academic for timetable bank
    if (subjectGroup.includes('พัฒนาผู้เรียน')) return false;

    // Filter out items that are clearly not academic courses (usually have 0 credits or are marked as activity)
    if (course.credits === 0 || course.credits === '0') {
        if (isExcluded) return false;
    }

    return !isExcluded;
};
