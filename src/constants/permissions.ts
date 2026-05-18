import { ROLES } from "./roles";

// สิทธิ์สำหรับเจ้าของระบบ (Owner/Super Admin) ในระดับมหภาค (ข้ามทุกโรงเรียน)
export const OWNER_ONLY = [ROLES.SUPER_ADMIN];

// สิทธิ์สำหรับแอดมินโรงเรียน (School Admin) เน้นจัดการข้อมูลบุคลากรในโรงเรียนเท่านั้น
<<<<<<< HEAD
export const ADMIN_ACCESS = [ROLES.SCHOOL_ADMIN, ROLES.TEACHER];

// สิทธิ์สำหรับฝ่ายงานวิชาการ (ครูและแอดมินโรงเรียน)
export const ACADEMIC_ACCESS = [ROLES.TEACHER, ROLES.SCHOOL_ADMIN];

// สิทธิ์ระดับบริหารจัดการงานวิชาการ
export const ACADEMIC_MANAGEMENT = [ROLES.SCHOOL_ADMIN, ROLES.TEACHER];
=======
export const ADMIN_ACCESS = [ROLES.SCHOOL_ADMIN];

// สิทธิ์สำหรับฝ่ายงานวิชาการ (ตอนนี้ใช้สิทธิ์ School Admin แทน)
export const ACADEMIC_ACCESS = [ROLES.SCHOOL_ADMIN];

// สิทธิ์ระดับบริหารจัดการงานวิชาการ
export const ACADEMIC_MANAGEMENT = [ROLES.SCHOOL_ADMIN];
>>>>>>> 5f8c7e1 (feat: optimize auto-scheduler and update UI labels)

// สิทธิ์สำหรับงานบุคลากรโรงเรียนที่เข้าใช้งานระบบได้ทั่วไป (ครูและแอดมิน)
export const STAFF_ACCESS = [ROLES.TEACHER, ROLES.SCHOOL_ADMIN];

<<<<<<< HEAD
// สิทธิ์ระดับปฏิบัติการวิชาการ (ครู + แอดมินโรงเรียน + เจ้าหน้าที่ลงเวลาส่วนกลาง) - ใช้สำหรับหน้าบันทึกคะแนน/เช็คชื่อ
export const TEACHER_OPERATIONAL = [ROLES.TEACHER, ROLES.SCHOOL_ADMIN, ROLES.SCHOOL_ATTENDANCE];

// สิทธิ์สำหรับการลงเวลาโดยเฉพาะ (รวมถึงเจ้าหน้าที่แยกส่วน)
export const ATTENDANCE_SCANNER_ACCESS = [ROLES.TEACHER, ROLES.SCHOOL_ADMIN, ROLES.SCHOOL_ATTENDANCE, ROLES.STUDENT_ATTENDANCE, ROLES.TEACHER_ATTENDANCE];
=======
// สิทธิ์ระดับปฏิบัติการวิชาการ (ครู + แอดมินโรงเรียน) - ใช้สำหรับหน้าบันทึกคะแนน/เช็คชื่อ
export const TEACHER_OPERATIONAL = [ROLES.TEACHER, ROLES.SCHOOL_ADMIN];
>>>>>>> 5f8c7e1 (feat: optimize auto-scheduler and update UI labels)

// สิทธิ์สำหรับพนักงานฝ่ายที่เกี่ยวข้องกับงานวิชาการ (เน้นครู)
export const ACADEMIC_STAFF = [ROLES.TEACHER];

<<<<<<< HEAD
export const ALL_USERS = [ROLES.SUPER_ADMIN, ROLES.SCHOOL_ADMIN, ROLES.TEACHER, ROLES.STUDENT, ROLES.SCHOOL_ATTENDANCE, ROLES.STUDENT_ATTENDANCE, ROLES.TEACHER_ATTENDANCE];
=======
export const ALL_USERS = [ROLES.SUPER_ADMIN, ROLES.SCHOOL_ADMIN, ROLES.TEACHER, ROLES.STUDENT];
>>>>>>> 5f8c7e1 (feat: optimize auto-scheduler and update UI labels)
