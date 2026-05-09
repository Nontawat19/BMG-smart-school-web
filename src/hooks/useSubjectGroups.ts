import { useSelector } from "react-redux";
import { RootState } from "@/store";

/**
 * ข้อมูลกลุ่มสาระการเรียนรู้
 */
export interface SubjectGroupOption {
    id: string;
    name: string;
    code?: string;
}

/**
 * Custom Hook สำหรับดึงข้อมูลกลุ่มสาระการเรียนรู้
 * 
 * ⚡ ปรับปรุง: อ่านจาก Redux Store แทนการ fetch จาก Firebase ทุกครั้ง
 * - ข้อมูลถูก fetch ครั้งเดียวตอน login ผ่าน useInitializeStore
 * - ทุกหน้าที่ใช้ hook นี้จะได้ข้อมูลทันทีจาก cache
 * - เมื่อ SubjectGroupManagementPage แก้ไขข้อมูล → dispatch update → ทุกหน้า sync อัตโนมัติ
 * 
 * @param _schoolId - รหัสโรงเรียน (ไม่ใช้แล้ว แต่คง parameter ไว้เพื่อ backward compatibility)
 * @returns { subjectGroups, loading } - รายชื่อกลุ่มสาระและสถานะการโหลด
 */
export function useSubjectGroups(_schoolId?: string) {
    const groups = useSelector((state: RootState) => state.subjectGroups.groups);
    const status = useSelector((state: RootState) => state.subjectGroups.status);

    // แปลง SubjectGroup → SubjectGroupOption (backward compatible)
    const subjectGroups: SubjectGroupOption[] = groups.map(g => ({
        id: g.id,
        name: g.name,
        code: g.code,
    }));

    return {
        subjectGroups,
        loading: status === "loading" || status === "idle",
    };
}
