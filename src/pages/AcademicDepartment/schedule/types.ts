export interface Teacher {
    id: string;
    teacherId?: string;
    name: string;
    firstName?: string;
    lastName?: string;
    title?: string;
    homeroomGrade?: string;
    position?: string;
    department?: string;
    email?: string;
    phone?: string;
    role?: string;
    profileImageUrl?: string;
    avatar?: string;
    status?: string;
    learningArea?: string;
    subjectGroup?: string;
    preferences?: {
        unavailableSlots?: string[];
        unavailableDays?: string[];
    };
}

export interface Course {
    id: string;
    title: string;
    code: string;
    classId?: string | string[];
    room?: string[];
    hoursPerWeek?: number;
    credits?: string | number;
    teacherId?: string;
    teacherIds?: string[];
    type?: 'พื้นฐาน' | 'เพิ่มเติม';
    isElective?: boolean;
    formativeWeight?: number;
    midtermWeight?: number;
    indicators?: string[];
    expectedOutcomes?: string[];
    constraints?: {
        disallowedDays?: string[];
        lockedSlots?: ({ day: string; periodId: string } | string)[];
    };
    subjectGroup?: string;
    semester?: string;
    isCombined?: boolean;
    locked?: boolean;
    teacherAssignments?: { teacherId: string; teacherIds?: string[]; roomIds: string[]; classLevels: string[]; groupNumber?: number; room?: string }[];
    isActive?: boolean;
    groupNumber?: number;
}

export interface SpecialPeriod {
    id: string;
    title: string;
    startTime: string;
    endTime: string;
    day?: string;
    linkedPeriodId?: string;
}

export interface PeriodSetting {
    id: string; // e.g., 'homeroom', 'period-1', 'lunch'
    label: string;
    startTime: string;
    endTime: string;
    isTeachingPeriod: boolean;
}

export interface SchoolSettings {
    schoolType: string;
    opportunityExpansionLevel: string;
    availableClasses: string[];
}

export interface SchedulingMetrics {
    totalTasks: number;
    placedTasks: number;
    unplacedTasks: number;
    processingTimeMs: number;
    averageConsecutivePeriods: number;
    averageGapsPerDay: number;
    bblComplianceRate: number;
}

export interface CourseInstance extends Course {
    instanceId: string;
    compositeId: string; // courseId_groupNumber
    groupNumber: number;
    locked?: boolean;
    isTemporarySchedule?: boolean;
    scheduleWarning?: string;
    className?: string;
    room?: string[];
    roomDisplay?: string;
}

export const getAssignmentTeacherIds = (assignment: { teacherId?: string; teacherIds?: string[] } | any): string[] => {
    const ids = Array.isArray(assignment?.teacherIds) && assignment.teacherIds.length > 0
        ? assignment.teacherIds
        : (assignment?.teacherId ? [assignment.teacherId] : []);
    return Array.from(new Set(ids.filter((id: string) => id && id !== 'pending' && !String(id).startsWith('GHOST'))));
};

export interface AssignmentConstraint {
    type?: 'any' | 'single' | 'double' | 'mixed';
    isLocked?: boolean;
    lockedSlots?: ({ day: string; periodId: string } | string)[];
    excludedDays?: string[];
    layoutPreference?: 'any' | 'double_only' | 'single_only' | 'mixed';
    singlePreference?: 'any' | 'morning' | 'afternoon';
    doublePreference?: 'any' | 'morning' | 'afternoon';
}

export type AssignmentConstraintMap = Record<string, AssignmentConstraint>;

export type Schedule = Record<string, CourseInstance[]>; // Key: "day-period", e.g., "mon-1", holds multiple courses if needed
