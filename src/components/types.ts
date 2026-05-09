export interface Student {
  id: string;
  firstName: string;
  lastName: string;
  studentNumber: string;
  title?: string;
  studentId?: string;
}

export interface GradeRecord {
  formative?: number;
  midterm?: number;
  final?: number;
  total?: number;
  grade?: string;
  status?: string;
  characteristicsScores?: Record<string, number>;
  readingWritingScores?: Record<string, number>;
  formativeDetails?: Record<string, number>;
}

export interface CharacteristicCriteria {
  id: string;
  title: string;
  indicators: string[];
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