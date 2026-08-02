import { useMemo } from "react";
import { useParams } from "react-router-dom";
import { useSelector } from "react-redux";
import { RootState } from "@/store";
import { ROLES } from "@/constants/roles";

const normalizeRoles = (role: unknown): string[] => {
  if (Array.isArray(role)) {
    return role.filter((item): item is string => typeof item === "string").map((item) => item.toLowerCase());
  }
  return typeof role === "string" ? [role.toLowerCase()] : [];
};

export const useSchoolScope = () => {
  const params = useParams<{ schoolId?: string }>();
  const user = useSelector((state: RootState) => state.auth.user);
  const { activeSchoolId, activeSchoolName } = useSelector((state: RootState) => state.schoolScope);

  const userRoles = normalizeRoles(user?.role);
  const isSuperAdmin = userRoles.includes(ROLES.SUPER_ADMIN);
  const routeSchoolId = params.schoolId || null;

  const effectiveSchoolId = useMemo(() => {
    if (routeSchoolId) return routeSchoolId;
    if (isSuperAdmin && activeSchoolId) return activeSchoolId;
    return user?.homeSchoolId || user?.schoolId || activeSchoolId || null;
  }, [routeSchoolId, isSuperAdmin, activeSchoolId, user?.homeSchoolId, user?.schoolId]);

  return {
    routeSchoolId,
    activeSchoolId,
    activeSchoolName,
    effectiveSchoolId,
    isSuperAdmin,
    isImpersonatingSchool: isSuperAdmin && !!activeSchoolId,
  };
};

export const useEffectiveSchoolId = () => useSchoolScope().effectiveSchoolId;
