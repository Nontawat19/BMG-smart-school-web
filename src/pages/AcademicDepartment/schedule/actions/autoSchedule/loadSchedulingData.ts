import { Course } from '../../types';

export interface CourseAssignmentDocData {
    id: string;
    courseId: string;
    academicYear?: string;
    semester?: string;
    teacherAssignments?: Course['teacherAssignments'];
}
