import { useSelector } from 'react-redux';
import { RootState } from '@/store';
import { ROLES } from '@/constants/roles';
import { OWNER_ONLY, ADMIN_ACCESS, ACADEMIC_ACCESS, STAFF_ACCESS, ACADEMIC_STAFF, ACADEMIC_MANAGEMENT, TEACHER_OPERATIONAL, ATTENDANCE_SCANNER_ACCESS } from '@/constants/permissions';

export const usePermissions = () => {
    const user = useSelector((state: RootState) => state.auth.user);

    // Normalize roles (handle string or array, map legacy 'admin'/'academic' to constants)
    const normalizedRoles = Array.isArray(user?.role)
        ? user.role.map(r => r === 'admin' ? ROLES.SCHOOL_ADMIN : r === 'academic' ? ROLES.ACADEMIC_ADMIN : r)
        : typeof user?.role === 'string'
            ? [user.role === 'admin' ? ROLES.SCHOOL_ADMIN : user.role === 'academic' ? ROLES.ACADEMIC_ADMIN : user.role]
            : [];

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
    const isTeacher = normalizedRoles.includes(ROLES.TEACHER);
    const isStudent = normalizedRoles.includes(ROLES.STUDENT);

    return {
        user,
        roles: normalizedRoles,
        hasRole,
        isSuperAdmin,      // เจ้าของระบบ/Owner
        isSchoolAdmin,     // แอดมินจัดการบุคคลากรระดับโรงเรียน
        isAcademicAdmin,   // ฝ่ายวิชาการระดับโรงเรียน
        isTeacher,
        isStudent,
        isAdmin: isSchoolAdmin, // แอดมินเน้นบริหารบุคคล (School Admin เท่านั้น)
        isAcademic: isAcademicAdmin, // ฝ่ายวิชาการเท่านั้น
        isOwner: isSuperAdmin, // ใช้เรียกแทน Super Admin
        OWNER_ONLY,
        ADMIN_ACCESS,
        ACADEMIC_ACCESS,
        STAFF_ACCESS,
        ACADEMIC_STAFF,
        ACADEMIC_MANAGEMENT,
        TEACHER_OPERATIONAL,
        ATTENDANCE_SCANNER_ACCESS
    };
};
