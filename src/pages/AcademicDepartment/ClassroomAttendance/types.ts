import { Timestamp } from "firebase/firestore";

export interface Student {
    id: string;
    firstName: string;
    lastName: string;
    number: string;
    studentNumber?: string;
    gender?: string;
    prefix?: string;
    profileImageUrl?: string;
    studentId?: string;
    nickname?: string;
    status?: string;
    studentStatus?: string;
    behaviorScore?: number;
}

export interface AttendanceRecord {
    studentId: string;
    status: 'present' | 'absent' | 'late' | 'leave' | 'escape';
    remark?: string;
}

export interface CourseSchedule {
    id: string;
    courseId?: string;
    subjectCode: string;
    subjectName: string;
    period: number;
    startTime: string;
    endTime: string;
    classId: string | string[];
    className: string;
    room?: string;
    roomIds?: string[];
    groupNumber?: number;
    day: string;
    isChecked: boolean;
    isSubstitute?: boolean;
    substitutionId?: string;
    originalTeacherId?: string;
    originalTeacherName?: string;
    isDoublePeriod?: boolean;
    periods?: number[];
    // The calendar day this substitution actually covers (YYYY-MM-DD), taken from the
    // `substitutions` doc itself. Authoritative for saving attendance — must be used
    // instead of the page's `currentDate` navigator, which can drift away from the
    // substitution's real date (e.g. teacher pages forward/back, or reopens the link on
    // a later day to back-fill) and would otherwise write attendance under the wrong date.
    date?: string;
}

