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
}

export interface AttendanceRecord {
    studentId: string;
    status: 'present' | 'absent' | 'late' | 'leave';
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
}

