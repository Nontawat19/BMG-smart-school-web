export interface Student {
  id: string;
  firstName: string;
  lastName: string;
  studentNumber: string;
  title?: string;
  studentId?: string;
}

export interface Course {
  id: string;
  title: string;
  code: string;
  classId: string;
  hoursPerWeek: number;
  teacherId?: string;
  formativeWeight?: number;
  midtermWeight?: number;
  formativeAssessments?: { id: string; name: string; maxScore: number; term?: 'pre-midterm' | 'post-midterm' }[];
  indicators?: string[];
  expectedOutcomes?: string[];
  type?: 'พื้นฐาน' | 'เพิ่มเติม';
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

export interface AttendanceDay {
    date: Date;
    dateStr: string;
    dayOfMonth: number;
    monthIndex: number;
    weekdayLabel: string;
    isHoliday: boolean;
    holidayName: string;
    hourLabel: string;
    eventType?: string;
}

export interface StudentAttendanceSummary {
  term1: {
    present: number;
    absent: number;
    late: number;
    leave: number;
    totalPossibleHours: number;
  };
  term2: {
    present: number;
    absent: number;
    late: number;
    leave: number;
    totalPossibleHours: number;
  };
  annual: {
    present: number;
    absent: number;
    late: number;
    leave: number;
    percentage: number;
    evaluation: string;
    totalPossibleHours: number;
  };
}

export type AllStudentAttendanceSummaries = Record<string, StudentAttendanceSummary>;