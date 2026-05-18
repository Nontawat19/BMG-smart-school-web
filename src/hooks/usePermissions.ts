import { useSelector } from 'react-redux';
import { RootState } from '@/store';
import { ROLES } from '@/constants/roles';
<<<<<<< HEAD
import { OWNER_ONLY, ADMIN_ACCESS, ACADEMIC_ACCESS, STAFF_ACCESS, ACADEMIC_STAFF, ACADEMIC_MANAGEMENT, TEACHER_OPERATIONAL, ATTENDANCE_SCANNER_ACCESS } from '@/constants/permissions';
=======
import { OWNER_ONLY, ADMIN_ACCESS, ACADEMIC_ACCESS, STAFF_ACCESS, ACADEMIC_STAFF, ACADEMIC_MANAGEMENT, TEACHER_OPERATIONAL } from '@/constants/permissions';
>>>>>>> 5f8c7e1 (feat: optimize auto-scheduler and update UI labels)

export const usePermissions = () => {
    const user = useSelector((state: RootState) => state.auth.user);

<<<<<<< HEAD
    const normalizeRoleValue = (role: string) => {
        if (role === 'admin' || role === 'academic' || role === ROLES.ACADEMIC_ADMIN) {
            return ROLES.SCHOOL_ADMIN;
        }
        return role;
    };

    // Normalize roles: legacy academic/admin permissions now collapse into School Admin
    const normalizedRoles = Array.isArray(user?.role)
        ? user.role.map(normalizeRoleValue)
        : typeof user?.role === 'string'
            ? [normalizeRoleValue(user.role)]
=======
    // Normalize roles (handle string or array, map legacy 'admin'/'academic' to constants)
    const normalizedRoles = Array.isArray(user?.role)
        ? user.role.map(r => r === 'admin' ? ROLES.SCHOOL_ADMIN : r === 'academic' ? ROLES.ACADEMIC_ADMIN : r)
        : typeof user?.role === 'string'
            ? [user.role === 'admin' ? ROLES.SCHOOL_ADMIN : user.role === 'academic' ? ROLES.ACADEMIC_ADMIN : user.role]
>>>>>>> 5f8c7e1 (feat: optimize auto-scheduler and update UI labels)
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
<<<<<<< HEAD
    const isAcademicAdmin = isSchoolAdmin || normalizedRoles.includes(ROLES.ACADEMIC_ADMIN);
    const isTeacher = normalizedRoles.includes(ROLES.TEACHER);
    const isStudent = normalizedRoles.includes(ROLES.STUDENT);

    const isAttendanceOnly = !isSuperAdmin && !isSchoolAdmin && !isTeacher && !isStudent && 
        (normalizedRoles.includes(ROLES.STUDENT_ATTENDANCE) || normalizedRoles.includes(ROLES.TEACHER_ATTENDANCE) || normalizedRoles.includes(ROLES.SCHOOL_ATTENDANCE));

=======
    const isAcademicAdmin = normalizedRoles.includes(ROLES.ACADEMIC_ADMIN);
    const isTeacher = normalizedRoles.includes(ROLES.TEACHER);
    const isStudent = normalizedRoles.includes(ROLES.STUDENT);

>>>>>>> 5f8c7e1 (feat: optimize auto-scheduler and update UI labels)
    return {
        user,
        roles: normalizedRoles,
        hasRole,
        isSuperAdmin,      // เจ้าของระบบ/Owner
        isSchoolAdmin,     // แอดมินจัดการบุคคลากรระดับโรงเรียน
        isAcademicAdmin,   // ฝ่ายวิชาการระดับโรงเรียน
        isTeacher,
        isStudent,
<<<<<<< HEAD
        isAttendanceOnly,  // เจ้าหน้าที่ลงเวลาโดยเฉพาะ (ไม่มีสิทธิ์อื่น)
        isAdmin: isSchoolAdmin, // แอดมินเน้นบริหารบุคคล (School Admin เท่านั้น)
        isAcademic: isSchoolAdmin, // งานวิชาการใช้สิทธิ์ School Admin
=======
        isAdmin: isSchoolAdmin, // แอดมินเน้นบริหารบุคคล (School Admin เท่านั้น)
        isAcademic: isAcademicAdmin, // ฝ่ายวิชาการเท่านั้น
>>>>>>> 5f8c7e1 (feat: optimize auto-scheduler and update UI labels)
        isOwner: isSuperAdmin, // ใช้เรียกแทน Super Admin
        OWNER_ONLY,
        ADMIN_ACCESS,
        ACADEMIC_ACCESS,
        STAFF_ACCESS,
        ACADEMIC_STAFF,
        ACADEMIC_MANAGEMENT,
<<<<<<< HEAD
        TEACHER_OPERATIONAL,
        ATTENDANCE_SCANNER_ACCESS
=======
        TEACHER_OPERATIONAL
>>>>>>> 5f8c7e1 (feat: optimize auto-scheduler and update UI labels)
    };
};
