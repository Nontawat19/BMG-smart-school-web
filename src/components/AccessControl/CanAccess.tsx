import React from 'react';
import { usePermissions } from '@/hooks/usePermissions';
import { Role } from '@/constants/roles';

interface CanAccessProps {
    roles?: Role | Role[];
    children: React.ReactNode;
    fallback?: React.ReactNode;
}

/**
 * Component สำหรับควบคุมการแสดงผลตามสิทธิ์ของผู้ใช้งาน
 * @param roles บทบาทที่อนุญาตให้เข้าถึง (เป็นตัวเดียวหรือ Array ก็ได้)
 * @param fallback ส่วนที่จะแสดงหากผู้ใช้ไม่มีสิทธิ์ (ค่าเริ่มต้นคือไม่แสดงอะไรเลย)
 */
const CanAccess: React.FC<CanAccessProps> = ({ roles, children, fallback = null }) => {
    const { hasRole } = usePermissions();

    const rolesArray = Array.isArray(roles) ? roles : roles ? [roles] : [];

    if (rolesArray.length > 0 && !hasRole(rolesArray)) {
        return <>{fallback}</>;
    }

    return <>{children}</>;
};

export default CanAccess;
