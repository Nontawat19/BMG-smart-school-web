// Mirrors the access check in ProtectedRoute.tsx (roles/departments/specialRoles/personnelTypes,
// with route_permissions overrides taking precedence over a route's defaultRoles) so features like
// the sidebar page search only ever surface pages a user could actually open.
// ⚠️ If the access rule changes, update ProtectedRoute.tsx too — kept separate rather than shared
// to avoid touching the auth gate itself for a search-only feature.
import { RouteDefinition } from '@/constants/routeRegistry';
import { RoutePermissionEntry } from '@/contexts/PermissionContext';

const normalizeRole = (role: unknown): string => {
  if (typeof role !== 'string') return '';
  const lowerRole = role.toLowerCase();
  if (lowerRole === 'admin') return 'school_admin';
  if (lowerRole === 'academic') return 'academic_admin';
  return lowerRole;
};

export const canAccessRoute = (
  route: RouteDefinition,
  userInput: unknown,
  routePermissions: Record<string, RoutePermissionEntry>
): boolean => {
  if (!userInput) return false;
  const user = userInput as Record<string, unknown>;

  const rawRoles = Array.isArray(user.role) ? user.role : [user.role];
  const userRoles = rawRoles.map(normalizeRole).filter(Boolean);

  // Super Admin must never be locked out by custom route_permissions.
  if (userRoles.includes('super_admin')) return true;

  const entry = routePermissions[route.key];
  const effectiveRoles = entry ? entry.allowedRoles : route.defaultRoles;
  const effectiveDepts = entry ? entry.allowedDepartments : [];
  const effectiveSpecialRoles = entry ? entry.allowedSpecialRoles : [];
  const effectivePersonnelTypes = entry ? (entry.allowedPersonnelTypes ?? []) : [];

  const hasRoleAccess = !effectiveRoles || effectiveRoles.length === 0 ||
    effectiveRoles.some(r => userRoles.includes(normalizeRole(r)));

  const hasDeptAccess = effectiveDepts.length > 0 &&
    !!user.department && effectiveDepts.includes(user.department as string);

  const hasSpecialRoleAccess = effectiveSpecialRoles.length > 0 &&
    effectiveSpecialRoles.some(sr => user[sr] === true);

  const hasPersonnelTypeAccess = effectivePersonnelTypes.length > 0 &&
    !!user.personnelType && effectivePersonnelTypes.includes(user.personnelType as string);

  return hasRoleAccess || hasDeptAccess || hasSpecialRoleAccess || hasPersonnelTypeAccess;
};

// Resolves the only dynamic segment a generic page-search result can safely fill in (:schoolId).
// Any other remaining :param (e.g. :studentId, :teacherId) means the route is a detail page for a
// specific record, not a generic destination — returns null so it's excluded from page search.
export const resolveSearchableRoutePath = (route: RouteDefinition, schoolId?: string | null): string | null => {
  const resolved = route.path.replace(/:schoolId\??/g, schoolId || '');
  if (resolved.includes(':')) return null;
  return resolved;
};
