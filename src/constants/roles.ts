export const ROLES = {
    SUPER_ADMIN: 'super_admin',
    SCHOOL_ADMIN: 'school_admin',
    ACADEMIC_ADMIN: 'academic_admin',
    TEACHER: 'teacher',
    STUDENT: 'student',
<<<<<<< HEAD
    SCHOOL_ATTENDANCE: 'school_attendance',
    STUDENT_ATTENDANCE: 'student_attendance',
    TEACHER_ATTENDANCE: 'teacher_attendance',
=======
>>>>>>> 5f8c7e1 (feat: optimize auto-scheduler and update UI labels)
} as const;

export type Role = typeof ROLES[keyof typeof ROLES];

export const ROLE_LABELS: Record<Role, string> = {
    [ROLES.SUPER_ADMIN]: 'ผู้ดูแลระบบสูงสุด',
    [ROLES.SCHOOL_ADMIN]: 'ผู้ดูแลระบบโรงเรียน',
    [ROLES.ACADEMIC_ADMIN]: 'ผู้ดูแลระบบงานวิชาการ',
    [ROLES.TEACHER]: 'ครู',
    [ROLES.STUDENT]: 'นักเรียน',
<<<<<<< HEAD
    [ROLES.SCHOOL_ATTENDANCE]: 'เจ้าหน้าที่ลงเวลาครู (Teacher Attendance)',
    [ROLES.STUDENT_ATTENDANCE]: 'เจ้าหน้าที่ลงเวลา (Student Attendance)',
    [ROLES.TEACHER_ATTENDANCE]: 'เจ้าหน้าที่ลงเวลา (ครู/บุคลากร)',
=======
>>>>>>> 5f8c7e1 (feat: optimize auto-scheduler and update UI labels)
};
