export const ROLES = {
    SUPER_ADMIN: 'super_admin',
    SCHOOL_ADMIN: 'school_admin',
    ACADEMIC_ADMIN: 'academic_admin',
    TEACHER: 'teacher',
    STUDENT_ATTENDANCE: 'student_attendance',
    TEACHER_ATTENDANCE: 'teacher_attendance',
    SCHOOL_ATTENDANCE: 'school_attendance',
    STUDENT: 'student',
} as const;

export type Role = typeof ROLES[keyof typeof ROLES];

export const ROLE_LABELS: Record<Role, string> = {
    [ROLES.SUPER_ADMIN]: 'ผู้ดูแลระบบสูงสุด',
    [ROLES.SCHOOL_ADMIN]: 'ผู้ดูแลระบบโรงเรียน',
    [ROLES.ACADEMIC_ADMIN]: 'ผู้ดูแลระบบงานวิชาการ',
    [ROLES.TEACHER]: 'ครู',
    [ROLES.STUDENT_ATTENDANCE]: 'เจ้าหน้าที่ลงเวลานักเรียน',
    [ROLES.TEACHER_ATTENDANCE]: 'เจ้าหน้าที่ลงเวลาครู',
    [ROLES.SCHOOL_ATTENDANCE]: 'เจ้าหน้าที่ลงเวลาทั้งโรงเรียน',
    [ROLES.STUDENT]: 'นักเรียน',
};
