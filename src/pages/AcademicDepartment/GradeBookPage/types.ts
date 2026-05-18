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

<<<<<<< HEAD
export interface GroupAssignment {
    groupNumber: number;
    teacherId: string;
    targetRooms?: string[];
    roomIds?: string[];
    classLevels?: string[];
    teacherName?: string;
    note?: string;
}

=======
>>>>>>> 5f8c7e1 (feat: optimize auto-scheduler and update UI labels)
export interface Course {
    id: string;
    title: string;
    code: string;
    classId: string | string[];
    room?: string[];
    hoursPerWeek: number;
    teacherId?: string;
    teacherIds?: string[];
<<<<<<< HEAD
    teacherAssignments?: GroupAssignment[];
=======
    teacherAssignments?: { teacherId: string; classLevels: string[]; roomIds: string[] }[];
>>>>>>> 5f8c7e1 (feat: optimize auto-scheduler and update UI labels)
    subjectGroup?: string;
    learningArea?: string;
    formativeWeight?: number;
    midtermWeight?: number;
<<<<<<< HEAD
    finalWeight?: number;
    formativeAssessments?: { id?: string; name: string; maxScore: number; term?: 'pre-midterm' | 'post-midterm' }[];
=======
    formativeAssessments?: { id: string; name: string; maxScore: number; term?: 'pre-midterm' | 'post-midterm' }[];
>>>>>>> 5f8c7e1 (feat: optimize auto-scheduler and update UI labels)
    indicators?: string[];
    expectedOutcomes?: string[];
    type?: 'พื้นฐาน' | 'เพิ่มเติม';
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
