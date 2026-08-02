import { useSelector } from 'react-redux';
import { RootState } from '@/store';
import { ROLES } from '@/constants/roles';
import { OWNER_ONLY, ADMIN_ACCESS, ACADEMIC_ACCESS, STAFF_ACCESS, ACADEMIC_STAFF, ACADEMIC_MANAGEMENT, TEACHER_OPERATIONAL, STUDENT_AFFAIRS_ACCESS, STUDENT_AFFAIRS_MANAGEMENT, STUDENT_SUPPORT_OPERATIONAL_ACCESS, STUDENT_ATTENDANCE_REPORT_ACCESS, CLUB_MEMBER_MANAGEMENT_ACCESS } from '@/constants/permissions';
import { expandSuperAdminScopedRoles } from '@/utils/superAdminScope';

export const usePermissions = () => {
    const user = useSelector((state: RootState) => state.auth.user);
    const activeSchoolId = useSelector((state: RootState) => state.schoolScope.activeSchoolId);

    const normalizeRoleValue = (role: string) => {
        if (role === 'admin') {
            return ROLES.SCHOOL_ADMIN;
        }
        if (role === 'academic') {
            return ROLES.ACADEMIC_ADMIN;
        }
        return role;
    };

    // Normalize legacy role names while preserving each permission lane.
    const baseNormalizedRoles = Array.isArray(user?.role)
        ? user.role.map(normalizeRoleValue)
        : typeof user?.role === 'string'
            ? [normalizeRoleValue(user.role)]
            : [];

    const normalizedRoles = expandSuperAdminScopedRoles(baseNormalizedRoles, !!activeSchoolId);

    const hasRole = (allowedRoles: string[]) => {
        if (!user || !user.role) return false;
        // Check both original roles and normalized roles for maximum compatibility
        return allowedRoles.some(role =>
            normalizedRoles.includes(role) ||
            (Array.isArray(user.role) ? user.role.includes(role) : user.role === role)
        );
    };

    const isSuperAdmin = normalizedRoles.includes(ROLES.SUPER_ADMIN);
    const isSchoolAdmin = normalizedRoles.includes(ROLES.SCHOOL_ADMIN);
    const isAcademicAdmin = normalizedRoles.includes(ROLES.ACADEMIC_ADMIN);
    const isStudentAffairs = normalizedRoles.includes(ROLES.STUDENT_AFFAIRS);
    const isTeacher = normalizedRoles.includes(ROLES.TEACHER);
    const isStudent = normalizedRoles.includes(ROLES.STUDENT);

    return {
        user,
        roles: normalizedRoles,
        hasRole,
        isSuperAdmin,      // เจ้าของระบบ/Owner
        isSchoolAdmin,     // แอดมินจัดการบุคคลากรระดับโรงเรียน
        isAcademicAdmin,   // ฝ่ายวิชาการระดับโรงเรียน
        isStudentAffairs,  // งานกิจการนักเรียน
        isTeacher,
        isStudent,
        isAdmin: isSchoolAdmin, // แอดมินเน้นบริหารบุคคล (School Admin เท่านั้น)
        isAcademic: isSchoolAdmin || isAcademicAdmin,
        isOwner: isSuperAdmin, // ใช้เรียกแทน Super Admin
        OWNER_ONLY,
        ADMIN_ACCESS,
        ACADEMIC_ACCESS,
        STAFF_ACCESS,
        ACADEMIC_STAFF,
        ACADEMIC_MANAGEMENT,
        TEACHER_OPERATIONAL,
        STUDENT_AFFAIRS_ACCESS,
        STUDENT_AFFAIRS_MANAGEMENT,
        STUDENT_SUPPORT_OPERATIONAL_ACCESS,
        STUDENT_ATTENDANCE_REPORT_ACCESS,
        CLUB_MEMBER_MANAGEMENT_ACCESS
    };
};
