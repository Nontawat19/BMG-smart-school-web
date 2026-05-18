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

  return roles.length > 0 && roles.every((item) => ATTENDANCE_ENTRY_ROLES.includes(item));
};
