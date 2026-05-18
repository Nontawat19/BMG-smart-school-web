import { ROLES } from "./roles";

// สิทธิ์สำหรับเจ้าของระบบ (Owner/Super Admin) ในระดับมหภาค (ข้ามทุกโรงเรียน)
export const OWNER_ONLY = [ROLES.SUPER_ADMIN];

// สิทธิ์สำหรับแอดมินโรงเรียน (School Admin) เน้นจัดการข้อมูลบุคลากรในโรงเรียนเท่านั้น
export const ADMIN_ACCESS = [ROLES.SCHOOL_ADMIN, ROLES.TEACHER];

// สิทธิ์สำหรับฝ่ายงานวิชาการ (ตอนนี้ใช้สิทธิ์ School Admin แทน)
export const ACADEMIC_ACCESS = [ROLES.SCHOOL_ADMIN];

// สิทธิ์ระดับบริหารจัดการงานวิชาการ
export const ACADEMIC_MANAGEMENT = [ROLES.SCHOOL_ADMIN, ROLES.TEACHER];

// สิทธิ์สำหรับงานบุคลากรโรงเรียนที่เข้าใช้งานระบบได้ทั่วไป (ครูและแอดมิน)
export const STAFF_ACCESS = [ROLES.TEACHER, ROLES.SCHOOL_ADMIN];

// สิทธิ์ระดับปฏิบัติการวิชาการ (ครู + แอดมินโรงเรียน) - ใช้สำหรับหน้าบันทึกคะแนน/เช็คชื่อ
export const TEACHER_OPERATIONAL = [ROLES.TEACHER, ROLES.SCHOOL_ADMIN];

// สิทธิ์สำหรับพนักงานฝ่ายที่เกี่ยวข้องกับงานวิชาการ (เน้นครู)
export const ACADEMIC_STAFF = [ROLES.TEACHER];

export const ALL_USERS = [ROLES.SUPER_ADMIN, ROLES.SCHOOL_ADMIN, ROLES.TEACHER, ROLES.STUDENT];
