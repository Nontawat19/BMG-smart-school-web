export const ROLES = {
    SUPER_ADMIN: 'super_admin',
    SCHOOL_ADMIN: 'school_admin',
    DIRECTOR: 'director',
    DEPT_HEAD: 'dept_head',
    ACADEMIC_ADMIN: 'academic_admin',
    STUDENT_AFFAIRS: 'student_affairs',
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
    [ROLES.DIRECTOR]: 'ผู้อำนวยการ',
    [ROLES.DEPT_HEAD]: 'หัวหน้าฝ่ายงาน',
    [ROLES.ACADEMIC_ADMIN]: 'ผู้ดูแลระบบงานวิชาการ',
    [ROLES.STUDENT_AFFAIRS]: 'งานกิจการนักเรียน',
    [ROLES.TEACHER]: 'ครู',
    [ROLES.STUDENT_ATTENDANCE]: 'เจ้าหน้าที่ลงเวลานักเรียน',
    [ROLES.TEACHER_ATTENDANCE]: 'เจ้าหน้าที่ลงเวลาครู',
    [ROLES.SCHOOL_ATTENDANCE]: 'เจ้าหน้าที่ลงเวลาทั้งโรงเรียน',
    [ROLES.STUDENT]: 'นักเรียน',
};
