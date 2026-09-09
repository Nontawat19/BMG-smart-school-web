import { ROLES } from "./roles";

// สิทธิ์สำหรับเจ้าของระบบ (Owner/Super Admin) ในระดับมหภาค (ข้ามทุกโรงเรียน)
export const OWNER_ONLY = [ROLES.SUPER_ADMIN];

// สิทธิ์สำหรับแอดมินโรงเรียน (School Admin) เน้นจัดการข้อมูลบุคลากรในโรงเรียนเท่านั้น
export const ADMIN_ACCESS = [ROLES.SCHOOL_ADMIN];

// สิทธิ์สำหรับฝ่ายงานวิชาการ
export const ACADEMIC_ACCESS = [ROLES.SCHOOL_ADMIN, ROLES.DIRECTOR, ROLES.DEPT_HEAD, ROLES.ACADEMIC_ADMIN];

// สิทธิ์ระดับบริหารจัดการงานวิชาการ
export const ACADEMIC_MANAGEMENT = [ROLES.SCHOOL_ADMIN, ROLES.DIRECTOR, ROLES.DEPT_HEAD, ROLES.ACADEMIC_ADMIN];

// สิทธิ์สำหรับงานกิจการนักเรียน: ระบบดูแลช่วยเหลือฯ คะแนนพฤติกรรม และรายงานที่เกี่ยวข้อง
export const STUDENT_AFFAIRS_ACCESS = [
    ROLES.SCHOOL_ADMIN,
    ROLES.DIRECTOR,
    ROLES.STUDENT_AFFAIRS,
    ROLES.STUDENT_ATTENDANCE,
    ROLES.TEACHER_ATTENDANCE,
    ROLES.SCHOOL_ATTENDANCE,
];
export const STUDENT_AFFAIRS_MANAGEMENT = [
    ROLES.SCHOOL_ADMIN,
    ROLES.DIRECTOR,
    ROLES.STUDENT_AFFAIRS,
];

// สิทธิ์ปฏิบัติการระบบดูแลช่วยเหลือนักเรียน: ทุกสิทธิ์เจ้าหน้าที่เข้าเมนูได้
export const STUDENT_SUPPORT_OPERATIONAL_ACCESS = [
    ROLES.SCHOOL_ADMIN,
    ROLES.DIRECTOR,
    ROLES.ACADEMIC_ADMIN,
    ROLES.DEPT_HEAD,
    ROLES.STUDENT_AFFAIRS,
    ROLES.TEACHER,
    ROLES.STUDENT_ATTENDANCE,
    ROLES.TEACHER_ATTENDANCE,
    ROLES.SCHOOL_ATTENDANCE,
];

// สิทธิ์สำหรับรายงานการมาเรียน/พฤติกรรมของนักเรียน
export const STUDENT_ATTENDANCE_REPORT_ACCESS = [
    ROLES.SCHOOL_ADMIN,
    ROLES.DIRECTOR,
    ROLES.ACADEMIC_ADMIN,
    ROLES.DEPT_HEAD,
    ROLES.STUDENT_AFFAIRS,
    ROLES.STUDENT_ATTENDANCE,
    ROLES.TEACHER_ATTENDANCE,
    ROLES.SCHOOL_ATTENDANCE,
];

// สิทธิ์สำหรับจัดการสมาชิก/อนุมัติคำขอชุมนุม
export const CLUB_MEMBER_MANAGEMENT_ACCESS = [ROLES.SCHOOL_ADMIN, ROLES.DIRECTOR, ROLES.DEPT_HEAD, ROLES.ACADEMIC_ADMIN, ROLES.TEACHER];

// สิทธิ์สำหรับบุคลากรโรงเรียนที่เข้าใช้งานระบบได้ทั่วไป
export const STAFF_ACCESS = [ROLES.TEACHER, ROLES.SCHOOL_ADMIN, ROLES.DIRECTOR, ROLES.DEPT_HEAD, ROLES.ACADEMIC_ADMIN, ROLES.STUDENT_AFFAIRS];

// สิทธิ์สำหรับงานธุรการและสารบรรณ (งานบริหารทั่วไป)
export const GENERAL_AFFAIRS_ACCESS = [
    ROLES.SCHOOL_ADMIN,
    ROLES.DIRECTOR,
    ROLES.DEPT_HEAD,
    ROLES.GENERAL_USER,
];

// สิทธิ์สำหรับงานมอบหมาย/ติดตามงานที่ได้รับมอบหมาย (ธุรการ + ผู้บริหาร + บุคลากรที่ได้รับมอบหมาย)
export const GENERAL_AFFAIRS_WORK_ACCESS = [
    ROLES.SCHOOL_ADMIN,
    ROLES.DIRECTOR,
    ROLES.DEPT_HEAD,
    ROLES.TEACHER,
    ROLES.GENERAL_USER,
];

// สิทธิ์ระดับปฏิบัติการแบบครู - ใช้สำหรับหน้าบันทึกคะแนน/เช็คชื่อ/งานประจำชั้น
export const TEACHER_OPERATIONAL = [ROLES.TEACHER, ROLES.STUDENT_AFFAIRS, ROLES.SCHOOL_ADMIN, ROLES.DIRECTOR, ROLES.DEPT_HEAD, ROLES.ACADEMIC_ADMIN];

// สิทธิ์สำหรับพนักงานฝ่ายที่เกี่ยวข้องกับงานวิชาการ (เน้นครู)
export const ACADEMIC_STAFF = [ROLES.TEACHER];

export const ALL_USERS = [ROLES.SUPER_ADMIN, ROLES.SCHOOL_ADMIN, ROLES.DIRECTOR, ROLES.DEPT_HEAD, ROLES.ACADEMIC_ADMIN, ROLES.TEACHER, ROLES.STUDENT_AFFAIRS, ROLES.STUDENT];
