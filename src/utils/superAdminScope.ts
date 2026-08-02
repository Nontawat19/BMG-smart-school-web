import { ROLES } from "@/constants/roles";

export const SUPER_ADMIN_IMPERSONATION_ROLES = [
  ROLES.SCHOOL_ADMIN,
  ROLES.DIRECTOR,
  ROLES.DEPT_HEAD,
  ROLES.ACADEMIC_ADMIN,
  ROLES.STUDENT_AFFAIRS,
  ROLES.TEACHER,
  ROLES.STUDENT_ATTENDANCE,
  ROLES.TEACHER_ATTENDANCE,
  ROLES.SCHOOL_ATTENDANCE,
];

export const expandSuperAdminScopedRoles = (roles: string[], isImpersonatingSchool: boolean) => {
  const normalizedRoles = roles
    .filter((role): role is string => typeof role === "string")
    .map((role) => role.toLowerCase());

  if (!normalizedRoles.includes(ROLES.SUPER_ADMIN) || !isImpersonatingSchool) {
    return Array.from(new Set(normalizedRoles));
  }

  return Array.from(new Set([...normalizedRoles, ...SUPER_ADMIN_IMPERSONATION_ROLES]));
};
