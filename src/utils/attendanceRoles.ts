import { ROLES } from "@/constants/roles";

export const ATTENDANCE_ENTRY_ROLES = [
  ROLES.STUDENT_ATTENDANCE,
  ROLES.TEACHER_ATTENDANCE,
  ROLES.SCHOOL_ATTENDANCE,
] as string[];

export const isAttendanceEntryOnly = (role: unknown) => {
  const roles = Array.isArray(role)
    ? role.filter((item): item is string => typeof item === "string")
    : typeof role === "string"
      ? [role]
      : [];

  if (roles.length === 0) return false;

  const targetRoles = [
    'student_attendance',
    'teacher_attendance',
    'school_attendance'
  ];

  return roles.every((item) => targetRoles.includes(item.toLowerCase()));
};
