import { ROLES, type Role } from './roles';

export type RoleOption = {
  value: Role;
  label: string;
};

export const ROLE_PRIORITY: Record<Role, number> = {
  [ROLES.SUPER_ADMIN]: 120,
  [ROLES.SCHOOL_ADMIN]: 110,
  [ROLES.DIRECTOR]: 100,
  [ROLES.DEPT_HEAD]: 90,
  [ROLES.ACADEMIC_ADMIN]: 80,
  [ROLES.STUDENT_AFFAIRS]: 70,
  [ROLES.SCHOOL_ATTENDANCE]: 60,
  [ROLES.TEACHER_ATTENDANCE]: 50,
  [ROLES.STUDENT_ATTENDANCE]: 40,
  [ROLES.TEACHER]: 30,
  [ROLES.GENERAL_USER]: 20,
  [ROLES.STUDENT]: 10,
};

const compareRoles = (left: string, right: string) =>
  (ROLE_PRIORITY[right as Role] || 0) - (ROLE_PRIORITY[left as Role] || 0);

export const sortRolesByPriority = <T extends string>(roles: T[]): T[] =>
  [...roles].sort(compareRoles);

export const OWNER_ROLE_OPTIONS: RoleOption[] = [
  { value: ROLES.SUPER_ADMIN, label: 'ผู้ดูแลระบบสูงสุด (Super Admin)' },
  { value: ROLES.SCHOOL_ADMIN, label: 'ผู้ดูแลระบบโรงเรียน (School Admin)' },
  { value: ROLES.ACADEMIC_ADMIN, label: 'ผู้ดูแลระบบงานวิชาการ (Academic Admin)' },
  { value: ROLES.STUDENT_AFFAIRS, label: 'งานกิจการนักเรียน (Student Affairs)' },
  { value: ROLES.SCHOOL_ATTENDANCE, label: 'ลงเวลาทั้งโรงเรียน (School Attendance)' },
  { value: ROLES.TEACHER_ATTENDANCE, label: 'ลงเวลาครู (Teacher Attendance)' },
  { value: ROLES.STUDENT_ATTENDANCE, label: 'ลงเวลานักเรียน (Student Attendance)' },
  { value: ROLES.TEACHER, label: 'ครูผู้สอน (Teacher)' },
  { value: ROLES.GENERAL_USER, label: 'ผู้ใช้ทั่วไป (General User)' },
  { value: ROLES.STUDENT, label: 'นักเรียน (Student)' },
];

export const SCHOOL_USER_ROLE_OPTIONS: RoleOption[] = [
  { value: ROLES.SCHOOL_ADMIN, label: 'ผู้ดูแลระบบโรงเรียน (School Admin)' },
  { value: ROLES.ACADEMIC_ADMIN, label: 'ฝ่ายวิชาการ (Academic Admin)' },
  { value: ROLES.STUDENT_AFFAIRS, label: 'งานกิจการนักเรียน' },
  { value: ROLES.SCHOOL_ATTENDANCE, label: 'เจ้าหน้าที่ลงเวลาทั้งโรงเรียน' },
  { value: ROLES.TEACHER_ATTENDANCE, label: 'เจ้าหน้าที่ลงเวลาครู' },
  { value: ROLES.STUDENT_ATTENDANCE, label: 'เจ้าหน้าที่ลงเวลานักเรียน' },
  { value: ROLES.TEACHER, label: 'ครูผู้สอน (Teacher)' },
  { value: ROLES.GENERAL_USER, label: 'ผู้ใช้ทั่วไป (General User)' },
];

export const SCHOOL_STAFF_USER_ROLE_OPTIONS: RoleOption[] = [
  { value: ROLES.SCHOOL_ADMIN, label: 'ผู้ดูแลระบบโรงเรียน (School Admin)' },
  { value: ROLES.ACADEMIC_ADMIN, label: 'ฝ่ายวิชาการ (Academic Admin)' },
  { value: ROLES.STUDENT_AFFAIRS, label: 'งานกิจการนักเรียน' },
  { value: ROLES.SCHOOL_ATTENDANCE, label: 'เจ้าหน้าที่ลงเวลาทั้งโรงเรียน' },
  { value: ROLES.TEACHER_ATTENDANCE, label: 'เจ้าหน้าที่ลงเวลาครู' },
  { value: ROLES.STUDENT_ATTENDANCE, label: 'เจ้าหน้าที่ลงเวลานักเรียน' },
  { value: ROLES.GENERAL_USER, label: 'ผู้ใช้ทั่วไป (General User)' },
];
