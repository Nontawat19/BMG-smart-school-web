import { Timestamp } from 'firebase/firestore';

export interface ClassroomAttendanceRecord {
    studentId: string;
    date: Timestamp;
    classId: string;
    period: number;
    subjectName: string;
    subjectCode: string;
    teacherId: string;
    status: 'present' | 'absent' | 'late' | 'leave';
    updatedAt: Timestamp;
    className?: string;
    semester?: string;
    academicYear?: string;
    courseId?: string;
}

export interface Student {
    id: string;
    firstName: string;
    lastName: string;
    studentNumber: string;
    title?: string;
    studentId?: string;
    room: string;
    altIds?: string[];
}

export interface GroupAssignment {
    groupNumber: number;
    teacherId: string;
    targetRooms?: string[];
    roomIds?: string[];
    classLevels?: string[];
    teacherName?: string;
    note?: string;
}

export interface Course {
    id: string;
    title: string;
    code: string;
    classId: string | string[];
    room?: string[];
    hoursPerWeek: number;
    teacherId?: string;
    teacherIds?: string[];
    teacherAssignments?: GroupAssignment[];
    subjectGroup?: string;
    learningArea?: string;
    formativeWeight?: number;
    midtermWeight?: number;
    finalWeight?: number;
    formativeAssessments?: { id?: string; name: string; maxScore: number; term?: 'pre-midterm' | 'post-midterm' }[];
    indicators?: string[];
    expectedOutcomes?: string[];
    type?: string;
    isActive?: boolean;
    semester?: string;
}

export interface Teacher {
    id: string;
    name: string;
    department?: string;
    isHeadOfLearningArea?: boolean;
    isHeadOfAssessment?: boolean;
    uid?: string;
}

export interface GradeRecord {
    formative: number;
    midterm: number;
    final: number;
    total: number;
    grade: string;
    status?: string;
    characteristicsScores?: Record<string, number>;
    readingWritingScores?: Record<string, number>;
    formativeDetails?: Record<string, number>;
}

export interface ReadingWritingIndicator {
    text: string;
    rubric: {
        3: string;
        2: string;
        1: string;
        0: string;
    };
}

export interface CharacteristicCriteria {
    id: string;
    title: string;
    indicators: string[];
}

export interface ReadingWritingCriteria {
    id: string;
    standard: string;
    indicators: ReadingWritingIndicator[];
}
