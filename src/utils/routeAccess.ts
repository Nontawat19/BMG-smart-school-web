// Single source of truth for "does this user have access to route X", shared by ProtectedRoute
// (guards direct navigation/URL access) and HubPage (decides which menu tiles to render).
// Before this existed, each one had its own separate copy of this logic — ProtectedRoute
// consulted the Firestore `route_permissions` override that the school permission-management
// page (/academic/permission-management) writes to, but HubPage's tile visibility checked only
// the hardcoded `allowedRoles` constant and never looked at the override at all. Result: an
// admin could grant a teacher access to a report there, the report page became reachable by
// direct URL, but its menu tile stayed invisible — looking exactly like the grant did nothing.
// Keeping this in one place means that class of bug can't recur for a future route.

export interface RoutePermissionOverride {
    allowedRoles: string[];
    allowedDepartments?: string[];
    allowedSpecialRoles?: string[];
    allowedPersonnelTypes?: string[];
}

export interface EffectiveRouteAccess {
    effectiveRoles?: string[];
    effectiveDepts: string[];
    effectiveSpecialRoles: string[];
    effectivePersonnelTypes: string[];
}

// เว็บนี้เก็บ role บางค่าเป็นชื่อเก่า ("admin"/"academic") ปนกับชื่อใหม่ ("school_admin"/"academic_admin")
// ต้อง normalize ทั้งสองฝั่ง (role ของ user และ allowedRoles ที่มาเทียบ) ก่อนเทียบเสมอ
export const normalizeRouteRole = (role: unknown): string => {
    if (typeof role !== 'string') return '';
    const lowerRole = role.toLowerCase();
    if (lowerRole === 'admin') return 'school_admin';
    if (lowerRole === 'academic') return 'academic_admin';
    return lowerRole;
};

// ถ้ามี override สำหรับ routeKey นี้ใน Firestore route_permissions (เขียนโดยหน้าตั้งค่าสิทธิ์) ให้ใช้ค่านั้น
// แทนค่าเริ่มต้น (allowedRoles ที่ hardcode ไว้ในโค้ด) เสมอ — แผนกอื่นๆ (dept/specialRole/personnelType)
// มาจาก override เท่านั้น เพราะ allowedRoles เริ่มต้นที่ hardcode ไว้ไม่เคยมีสามอย่างนี้อยู่แล้ว
export const resolveEffectiveRouteAccess = (
    routeKey: string | undefined,
    fallbackAllowedRoles: string[] | undefined,
    routePermissions: Record<string, RoutePermissionOverride | undefined>
): EffectiveRouteAccess => {
    const override = routeKey ? routePermissions[routeKey] : undefined;
    if (override) {
        return {
            effectiveRoles: override.allowedRoles,
            effectiveDepts: override.allowedDepartments || [],
            effectiveSpecialRoles: override.allowedSpecialRoles || [],
            effectivePersonnelTypes: override.allowedPersonnelTypes || [],
        };
    }
    return {
        effectiveRoles: fallbackAllowedRoles,
        effectiveDepts: [],
        effectiveSpecialRoles: [],
        effectivePersonnelTypes: [],
    };
};

// ผ่านได้ถ้าตรงเงื่อนไขข้อใดข้อหนึ่ง (role, แผนก, บทบาทพิเศษ, หรือประเภทบุคลากร) — Super Admin ผ่านเสมอ
// ไม่ถูกจำกัดด้วย route_permissions ที่ตั้งค่าต่อโรงเรียนเลย (กันไม่ให้ตัวเองถูกล็อกออกจากระบบตัวเอง)
export const userHasRouteAccess = (user: any, access: EffectiveRouteAccess): boolean => {
    if (!user) return false;

    const rawRoles = Array.isArray(user.role) ? user.role : [user.role];
    const userRoles = rawRoles.map(normalizeRouteRole).filter(Boolean);

    if (userRoles.includes('super_admin')) return true;

    const hasRoleAccess = !access.effectiveRoles || access.effectiveRoles.length === 0 ||
        access.effectiveRoles.some(r => userRoles.includes(normalizeRouteRole(r)));

    const hasDeptAccess = access.effectiveDepts.length > 0 &&
        !!user.department && access.effectiveDepts.includes(user.department);

    const hasSpecialRoleAccess = access.effectiveSpecialRoles.length > 0 &&
        access.effectiveSpecialRoles.some(sr => {
            if (sr === 'isSubjectGroupHead') return user.isSubjectGroupHead === true || user.isHeadOfLearningArea === true;
            if (sr === 'isAssessmentHead') return user.isAssessmentHead === true || user.isHeadOfAssessment === true;
            return user[sr] === true;
        });

    const hasPersonnelTypeAccess = access.effectivePersonnelTypes.length > 0 &&
        !!user.personnelType && access.effectivePersonnelTypes.includes(user.personnelType);

    return hasRoleAccess || hasDeptAccess || hasSpecialRoleAccess || hasPersonnelTypeAccess;
};
