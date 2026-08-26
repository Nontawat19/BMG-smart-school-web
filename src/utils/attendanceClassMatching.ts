import { CLASSES, CLASS_FULL_NAMES } from '@/utils/schoolUtils';

// Shared class/room matching helpers used by both the live classroom-attendance
// check-in page and the historical (retroactive) attendance editor, so their
// docId derivation and roster matching stay in sync.

export const getClassVariants = (classValue: unknown): string[] => {
    if (Array.isArray(classValue)) {
        return Array.from(new Set(classValue.flatMap(getClassVariants)));
    }

    const value = String(classValue || '').trim();
    if (!value) return [];

    // Handle room-level codes like 'm1/1' or 'ม.1/2' — generate both Thai and English variants
    if (value.includes('/')) {
        const slashIdx = value.indexOf('/');
        const levelPart = value.substring(0, slashIdx);
        const roomPart = value.substring(slashIdx + 1);
        const fromLabel = Object.entries(CLASSES).find(([, label]) => label === levelPart)?.[0];
        const levelKey = fromLabel || levelPart;
        const thaiLevel = CLASSES[levelKey] || levelPart;
        return Array.from(new Set([
            `${levelKey}/${roomPart}`,
            `${thaiLevel}/${roomPart}`,
            value,
        ].filter(Boolean).map(String)));
    }

    const fromLabel = Object.entries(CLASSES).find(([, label]) => label === value)?.[0];
    const classKey = fromLabel || value;

    return Array.from(new Set([
        classKey,
        CLASSES[classKey],
        CLASS_FULL_NAMES[classKey],
        value
    ].filter(Boolean).map(String)));
};

// Matches a record's class/level value against a selected class.
// Matches exactly, or as a prefix segment clearly delimited by "_" or "/" — in either
// direction, so a grade-wide record like "m1" (a whole-grade course with no specific room)
// still matches a room-specific selection like "m1/2", and vice versa. It never matches as
// a raw substring, which would incorrectly match "m1" against "m11" or "m1" against "m1/12".
export const matchesClassValue = (recordClass: unknown, selectedClass: unknown): boolean => {
    if (!selectedClass) return true;
    if (!recordClass) return false;

    if (Array.isArray(recordClass)) {
        return recordClass.some(item => matchesClassValue(item, selectedClass));
    }

    const variants = getClassVariants(selectedClass);
    const normalizedVariants = variants.map(v => v.toLowerCase().replace(/\s/g, ''));
    const raw = String(recordClass || '').trim();
    const normalized = raw.toLowerCase().replace(/\s/g, '');

    const isDelimitedPrefix = (longer: string, shorter: string) =>
        longer.startsWith(`${shorter}_`) || longer.startsWith(`${shorter}/`);

    return normalizedVariants.includes(normalized) ||
        normalizedVariants.some(v => isDelimitedPrefix(normalized, v)) ||
        normalizedVariants.some(v => isDelimitedPrefix(v, normalized));
};

// Strict class matching used specifically for substitute classes.
// Unlike matchesClassValue, this does NOT allow a grade-only variant (e.g. "m1") to match
// room-specific students (e.g. "m1/1", "m1/2"), preventing multi-room pull when the
// substitution classId has no room number or was set to the teacher's full class list.
export const matchesClassValueStrict = (recordClass: unknown, classId: unknown): boolean => {
    if (classId === null || classId === undefined) return true;
    const ids = (Array.isArray(classId) ? classId : [classId]).filter(Boolean).map(String);
    // Empty array means classId data is corrupt/missing — return false to show no students
    // (safer than returning true which would incorrectly match all enrolled students)
    if (ids.length === 0) return false;

    if (Array.isArray(recordClass)) {
        return (recordClass as unknown[]).some(item => matchesClassValueStrict(item, classId));
    }

    const allVariants = Array.from(new Set(ids.flatMap(id => getClassVariants(id))))
        .map(v => v.toLowerCase().replace(/\s/g, ''));
    const normalized = String(recordClass || '').toLowerCase().replace(/\s/g, '');

    return allVariants.some(v =>
        v === normalized ||
        normalized.startsWith(`${v}_`) ||
        // Only allow prefix matching when the variant itself has a room number (e.g. "m1/1")
        // — this prevents grade-only "m1" from matching "m1/1" or "m1/2"
        (v.includes('/') && normalized.startsWith(`${v}/`))
    );
};

export const formatClassDisplay = (value: unknown) => {
    const values = Array.isArray(value) ? value : [value];
    const labels = values
        .flatMap(getClassVariants)
        .filter(Boolean)
        .map(v => CLASSES[v] || v);

    return Array.from(new Set(labels)).join(', ') || 'ไม่ระบุชั้น';
};

// A stable, deterministic key for a class/classId value used to build attendance
// document IDs. Arrays (combined-class courses) are joined so both the live and
// historical pages derive the exact same key for the same course.
export const getStableClassKey = (value: unknown) => {
    if (Array.isArray(value)) return value.map(String).filter(Boolean).join('-');
    return String(value || '');
};

export const hasRoomSpecificClass = (value: unknown) => {
    const values = Array.isArray(value) ? value : [value];
    return values.some(item => String(item || '').includes('/'));
};

const normalizeRoomForGroupMatch = (value: unknown): string => {
    const raw = String(value ?? '').trim();
    if (!raw) return '';
    const numeric = Number(raw);
    return Number.isFinite(numeric) ? String(numeric) : raw.toLowerCase();
};

// Whether a specific scheduled slot instance — identified by its `groupNumber` on a combined
// course (one course doc taught separately to several class-groups/rooms by the same
// teacher, e.g. English taught to both ม.5/1 and ม.5/2) — actually belongs to the room
// currently being viewed. Used by both GradeBookPage.tsx and HistoricalClassroomAttendancePage.tsx
// when deriving "which periods/days does this room meet" from a teacher's weekly `schedules` doc.
//
// groupNumber is a sequential group INDEX (1, 2, 3...), not a room label — it must never be
// compared directly against a room string (e.g. group index "2" happening to equal room "2"
// is coincidence, not identity). This only ever compares an assignment's own room fields
// (`room`, `roomNumber`, `roomIds`, `targetRooms`) against the selected room.
//
// Permissive by design: when there's no group info, no matching assignment, or the matching
// assignment has no room info at all, this returns true (can't disambiguate further, so don't
// exclude data — matches the pre-fix behavior for ordinary non-combined courses).
export const matchesAssignmentGroupRoom = (
    teacherAssignments: Array<{ groupNumber?: number | string; room?: unknown; roomNumber?: unknown; roomIds?: unknown[]; targetRooms?: unknown[] }> | undefined,
    slotGroupNumber: number | string | undefined | null,
    selectedRoom: unknown,
): boolean => {
    if (slotGroupNumber === undefined || slotGroupNumber === null || slotGroupNumber === '') return true;
    if (!teacherAssignments || teacherAssignments.length === 0) return true;

    const assignment = teacherAssignments.find(a => Number(a.groupNumber) === Number(slotGroupNumber));
    if (!assignment) return true;

    const assignmentRooms = [
        assignment.room,
        assignment.roomNumber,
        ...(Array.isArray(assignment.roomIds) ? assignment.roomIds : []),
        ...(Array.isArray(assignment.targetRooms) ? assignment.targetRooms : []),
    ]
        .filter((r): r is NonNullable<typeof r> => r !== undefined && r !== null && r !== '')
        .map(normalizeRoomForGroupMatch);

    if (assignmentRooms.length === 0) return true;

    const normalizedSelected = normalizeRoomForGroupMatch(selectedRoom);
    if (!normalizedSelected || normalizedSelected === 'all') return true;

    return assignmentRooms.includes('all') || assignmentRooms.includes(normalizedSelected);
};
