import { ROLES } from './roles';
import {
  OWNER_ONLY,
  ADMIN_ACCESS,
  ACADEMIC_ACCESS,
  STAFF_ACCESS,
  ACADEMIC_MANAGEMENT,
  TEACHER_OPERATIONAL,
  STUDENT_AFFAIRS_ACCESS,
  STUDENT_AFFAIRS_MANAGEMENT,
  STUDENT_SUPPORT_OPERATIONAL_ACCESS,
  STUDENT_ATTENDANCE_REPORT_ACCESS,
  CLUB_MEMBER_MANAGEMENT_ACCESS,
  ALL_USERS,
} from './permissions';

export interface RouteDefinition {
  key: string;
  path: string;
  label: string;
  category: string;
  defaultRoles: string[];
}

export const ROUTE_CATEGORIES = [
  'ทั่วไป',
  'ลางานและเวลา',
  'ข้อมูลนักเรียน',
  'ข้อมูลบุคลากร',
  'ดูแลช่วยเหลือนักเรียน',
  'วิชาการ - ทะเบียน',
  'วิชาการ - ตารางสอน',
  'วิชาการ - เช็คชื่อ',
  'วิชาการ - คะแนนและประเมิน',
  'วิชาการ - กิจกรรมและชุมนุม',
  'วิชาการ - รายงาน',
  'วิชาการ - ตั้งค่า',
  'ผู้ดูแลระบบ',
] as const;

const ALL_ROLES = Object.values(ROLES) as string[];
const TEACHER_LEAVE_HISTORY_ACCESS = [...STAFF_ACCESS, ROLES.TEACHER_ATTENDANCE, ROLES.SCHOOL_ATTENDANCE];
const TEACHER_ATTENDANCE_TODAY_ACCESS = [ROLES.SCHOOL_ADMIN, ...STAFF_ACCESS, ROLES.TEACHER_ATTENDANCE, ROLES.SCHOOL_ATTENDANCE];

export const ROUTE_REGISTRY: RouteDefinition[] = [
  // ──────────────────────────────── ทั่วไป ────────────────────────────────
  { key: 'home',          path: '/home',          label: 'หน้าหลัก',        category: 'ทั่วไป', defaultRoles: ALL_ROLES },
  { key: 'notifications', path: '/notifications', label: 'การแจ้งเตือน',    category: 'ทั่วไป', defaultRoles: ALL_ROLES },
  { key: 'profile',       path: '/profile',       label: 'โปรไฟล์',         category: 'ทั่วไป', defaultRoles: ALL_ROLES },
  { key: 'my_schedule',   path: '/my-schedule',   label: 'ตารางงานของฉัน',  category: 'ทั่วไป', defaultRoles: [...STAFF_ACCESS, ROLES.STUDENT] },

  // ──────────────────────────────── ลางานและเวลา ────────────────────────────────
  { key: 'leave_request',              path: '/attendance/leave-request',              label: 'ใบลานักเรียน',                  category: 'ลางานและเวลา', defaultRoles: STAFF_ACCESS },
  { key: 'teacher_leave_request',      path: '/attendance/teacher-leave-request',      label: 'ใบลาครู',                       category: 'ลางานและเวลา', defaultRoles: STAFF_ACCESS },
  { key: 'leave_history',              path: '/attendance/leave-history',              label: 'ประวัติใบลานักเรียน',            category: 'ลางานและเวลา', defaultRoles: STAFF_ACCESS },
  { key: 'teacher_leave_history',      path: '/attendance/teacher-leave-history',      label: 'ประวัติใบลาครู',                 category: 'ลางานและเวลา', defaultRoles: TEACHER_LEAVE_HISTORY_ACCESS },
  { key: 'leave_approval',             path: '/attendance/leave-approval',             label: 'อนุมัติใบลา',                   category: 'ลางานและเวลา', defaultRoles: [ROLES.SCHOOL_ADMIN, ROLES.TEACHER_ATTENDANCE, ROLES.SCHOOL_ATTENDANCE] },
  { key: 'checkin_out',                path: '/attendance/checkin-out',                label: 'เช็คอิน/เช็คเอาท์',             category: 'ลางานและเวลา', defaultRoles: [ROLES.SUPER_ADMIN, ROLES.SCHOOL_ADMIN, ROLES.STUDENT_ATTENDANCE, ROLES.TEACHER_ATTENDANCE, ROLES.SCHOOL_ATTENDANCE] },
  { key: 'official_travel_request',    path: '/school/:schoolId/official-travel-request',  label: 'ใบขอไปราชการ',             category: 'ลางานและเวลา', defaultRoles: [...STAFF_ACCESS, ROLES.TEACHER_ATTENDANCE, ROLES.SCHOOL_ATTENDANCE] },
  { key: 'official_travel_history',    path: '/school/:schoolId/official-travel-history',  label: 'ประวัติใบไปราชการ',         category: 'ลางานและเวลา', defaultRoles: [...STAFF_ACCESS, ROLES.TEACHER_ATTENDANCE, ROLES.SCHOOL_ATTENDANCE] },

  // ──────────────────────────────── ข้อมูลนักเรียน ────────────────────────────────
  { key: 'student_list',        path: '/school/:schoolId/students',                    label: 'รายชื่อนักเรียน',               category: 'ข้อมูลนักเรียน', defaultRoles: STAFF_ACCESS },
  { key: 'student_add',         path: '/school/:schoolId/students/add',                label: 'เพิ่มนักเรียน',                 category: 'ข้อมูลนักเรียน', defaultRoles: ACADEMIC_ACCESS },
  { key: 'student_quick_add',   path: '/school/:schoolId/students/quick-add',          label: 'เพิ่มนักเรียนด่วน',             category: 'ข้อมูลนักเรียน', defaultRoles: ACADEMIC_ACCESS },
  { key: 'student_edit',        path: '/school/:schoolId/students/edit/:studentId',    label: 'แก้ไขข้อมูลนักเรียน',          category: 'ข้อมูลนักเรียน', defaultRoles: ACADEMIC_ACCESS },
  { key: 'student_view',        path: '/school/:schoolId/students/view/:studentId',    label: 'ดูข้อมูลนักเรียน',             category: 'ข้อมูลนักเรียน', defaultRoles: [...STAFF_ACCESS, ROLES.STUDENT] },
  { key: 'student_behavior',    path: '/school/:schoolId/students/behavior',           label: 'คะแนนพฤติกรรมนักเรียน',        category: 'ข้อมูลนักเรียน', defaultRoles: STUDENT_AFFAIRS_ACCESS },
  { key: 'student_import',      path: '/school/:schoolId/students/import',             label: 'นำเข้าข้อมูลนักเรียน',         category: 'ข้อมูลนักเรียน', defaultRoles: ACADEMIC_ACCESS },
  { key: 'student_import_dmc',  path: '/school/:schoolId/students/import-dmc',         label: 'นำเข้าข้อมูลจาก DMC',          category: 'ข้อมูลนักเรียน', defaultRoles: ACADEMIC_ACCESS },
  { key: 'student_bulk_upload', path: '/school/:schoolId/students/bulk-upload',        label: 'อัปโหลดรูปนักเรียน (Bulk)',     category: 'ข้อมูลนักเรียน', defaultRoles: ACADEMIC_ACCESS },
  { key: 'map_rfid',            path: '/school/:schoolId/map-rfid/:type',              label: 'ลงทะเบียนบัตร RFID',            category: 'ข้อมูลนักเรียน', defaultRoles: ACADEMIC_ACCESS },
  { key: 'student_photo_download', path: '/academic/student-photo-download',           label: 'ดาวน์โหลดรูปภาพนักเรียน',       category: 'ข้อมูลนักเรียน', defaultRoles: STAFF_ACCESS },

  // ──────────────────────────────── ข้อมูลบุคลากร ────────────────────────────────
  { key: 'teacher_list',             path: '/school/:schoolId/teachers',                         label: 'รายชื่อครู',                    category: 'ข้อมูลบุคลากร', defaultRoles: [...ADMIN_ACCESS, ...ACADEMIC_ACCESS] },
  { key: 'teacher_add',              path: '/school/:schoolId/teachers/add',                     label: 'เพิ่มครู',                      category: 'ข้อมูลบุคลากร', defaultRoles: ADMIN_ACCESS },
  { key: 'teacher_quick_add',        path: '/school/:schoolId/teachers/quick-add',               label: 'เพิ่มครูด่วน',                  category: 'ข้อมูลบุคลากร', defaultRoles: ADMIN_ACCESS },
  { key: 'teacher_edit',             path: '/school/:schoolId/teachers/edit/:teacherId',         label: 'แก้ไขข้อมูลครู',               category: 'ข้อมูลบุคลากร', defaultRoles: ADMIN_ACCESS },
  { key: 'teacher_view',             path: '/school/:schoolId/teachers/view/:teacherId',         label: 'ดูข้อมูลครู',                  category: 'ข้อมูลบุคลากร', defaultRoles: STAFF_ACCESS },
  { key: 'teacher_import',           path: '/school/:schoolId/teachers/import',                  label: 'นำเข้าข้อมูลครู',              category: 'ข้อมูลบุคลากร', defaultRoles: ADMIN_ACCESS },
  { key: 'teacher_bulk_upload',      path: '/school/:schoolId/teachers/bulk-upload-images',      label: 'อัปโหลดรูปครู (Bulk)',          category: 'ข้อมูลบุคลากร', defaultRoles: ADMIN_ACCESS },
  { key: 'teacher_advisor_mgmt',     path: '/school/:schoolId/teachers/advisor-management',      label: 'จัดการครูที่ปรึกษา',            category: 'ข้อมูลบุคลากร', defaultRoles: ADMIN_ACCESS },
  { key: 'user_management',          path: '/administrator/user-management',                     label: 'จัดการผู้ใช้งาน (โรงเรียน)',   category: 'ข้อมูลบุคลากร', defaultRoles: ADMIN_ACCESS },

  // ──────────────────────────────── ดูแลช่วยเหลือนักเรียน ────────────────────────────────
  { key: 'student_support',          path: '/student-support',              label: 'Dashboard ดูแลช่วยเหลือฯ',  category: 'ดูแลช่วยเหลือนักเรียน', defaultRoles: STUDENT_SUPPORT_OPERATIONAL_ACCESS },
  { key: 'student_support_sdq',      path: '/student-support/sdq',          label: 'แบบประเมิน SDQ',             category: 'ดูแลช่วยเหลือนักเรียน', defaultRoles: STUDENT_SUPPORT_OPERATIONAL_ACCESS },
  { key: 'student_support_screen',   path: '/student-support/screening',    label: 'คัดกรองนักเรียน',            category: 'ดูแลช่วยเหลือนักเรียน', defaultRoles: STUDENT_SUPPORT_OPERATIONAL_ACCESS },
  { key: 'student_support_visit',         path: '/student-support/home-visit',                   label: 'เยี่ยมบ้าน',                      category: 'ดูแลช่วยเหลือนักเรียน', defaultRoles: STUDENT_SUPPORT_OPERATIONAL_ACCESS },
  { key: 'home_visit_summary',            path: '/student-support/home-visit/summary',           label: 'รายงานสรุปการเยี่ยมบ้าน (Hub)',  category: 'ดูแลช่วยเหลือนักเรียน', defaultRoles: STUDENT_AFFAIRS_ACCESS },
  { key: 'home_visit_summary_classroom',  path: '/student-support/home-visit/summary/classroom', label: 'รายงานสรุปเยี่ยมบ้าน - รายห้อง', category: 'ดูแลช่วยเหลือนักเรียน', defaultRoles: STUDENT_AFFAIRS_ACCESS },
  { key: 'home_visit_summary_all',        path: '/student-support/home-visit/summary/all',       label: 'รายงานสรุปเยี่ยมบ้าน - ทุกห้อง', category: 'ดูแลช่วยเหลือนักเรียน', defaultRoles: STUDENT_AFFAIRS_ACCESS },
  { key: 'home_visit_summary_obec',       path: '/student-support/home-visit/summary/obec',      label: 'รายงานสรุปเยี่ยมบ้าน - สพฐ.',    category: 'ดูแลช่วยเหลือนักเรียน', defaultRoles: STUDENT_AFFAIRS_ACCESS },
  { key: 'home_visit_summary_level_range', path: '/student-support/home-visit/summary/level-range', label: 'รายงานสรุปเยี่ยมบ้าน - ช่วงชั้น', category: 'ดูแลช่วยเหลือนักเรียน', defaultRoles: STUDENT_AFFAIRS_ACCESS },
  { key: 'home_visit_summary_individual', path: '/student-support/home-visit/summary/individual', label: 'รายงานสรุปเยี่ยมบ้าน - รายคน',   category: 'ดูแลช่วยเหลือนักเรียน', defaultRoles: STUDENT_AFFAIRS_ACCESS },
  { key: 'home_visit_tracking',           path: '/student-support/home-visit/summary/tracking',  label: 'ติดตามการเยี่ยมบ้าน',             category: 'ดูแลช่วยเหลือนักเรียน', defaultRoles: STUDENT_AFFAIRS_ACCESS },

  // ──────────────────────────────── วิชาการ - ทะเบียน ────────────────────────────────
  { key: 'course_management',    path: '/academic/course-management',    label: 'จัดการหลักสูตร',               category: 'วิชาการ - ทะเบียน', defaultRoles: ACADEMIC_MANAGEMENT },
  { key: 'course_enrollment',    path: '/academic/course-enrollment',    label: 'ลงทะเบียนรายวิชา (นักเรียน)',  category: 'วิชาการ - ทะเบียน', defaultRoles: ACADEMIC_MANAGEMENT },
  { key: 'enrollment_list',      path: '/academic/enrollment-list',      label: 'สรุปการลงทะเบียน',             category: 'วิชาการ - ทะเบียน', defaultRoles: ACADEMIC_MANAGEMENT },
  { key: 'import_courses',       path: '/academic/import-courses',       label: 'นำเข้าหลักสูตร (Excel)',       category: 'วิชาการ - ทะเบียน', defaultRoles: ACADEMIC_MANAGEMENT },
  { key: 'subject_groups',       path: '/academic/subject-groups',       label: 'จัดการกลุ่มสาระและตัวชี้วัด', category: 'วิชาการ - ทะเบียน', defaultRoles: ACADEMIC_MANAGEMENT },
  { key: 'view_courses',         path: '/academic/view-courses',         label: 'ดูหลักสูตร',                   category: 'วิชาการ - ทะเบียน', defaultRoles: TEACHER_OPERATIONAL },
  { key: 'room_transfer',        path: '/academic/room-transfer',        label: 'ย้ายห้องเรียน',                category: 'วิชาการ - ทะเบียน', defaultRoles: ACADEMIC_MANAGEMENT },
  { key: 'grade_transfer',       path: '/academic/grade-transfer',       label: 'ย้ายชั้นนักเรียน',             category: 'วิชาการ - ทะเบียน', defaultRoles: ACADEMIC_MANAGEMENT },
  { key: 'graduation_mgmt',      path: '/academic/graduation-management',label: 'จัดการจบการศึกษา',             category: 'วิชาการ - ทะเบียน', defaultRoles: ACADEMIC_MANAGEMENT },
  { key: 'graduation_pending',   path: '/academic/graduation-pending',   label: 'รอดำเนินการจบการศึกษา',       category: 'วิชาการ - ทะเบียน', defaultRoles: ACADEMIC_MANAGEMENT },
  { key: 'alumni_management',    path: '/academic/alumni-management',    label: 'ทำเนียบศิษย์เก่า',             category: 'วิชาการ - ทะเบียน', defaultRoles: ACADEMIC_MANAGEMENT },
  { key: 'porbor7',              path: '/academic/porbor-7',             label: 'ออกใบรับรอง (ปพ.7)',           category: 'วิชาการ - ทะเบียน', defaultRoles: ACADEMIC_MANAGEMENT },

  // ──────────────────────────────── วิชาการ - ตารางสอน ────────────────────────────────
  { key: 'special_periods',       path: '/academic/special-periods',        label: 'จัดการคาบเรียนพิเศษ',        category: 'วิชาการ - ตารางสอน', defaultRoles: ACADEMIC_MANAGEMENT },
  { key: 'special_period_reports', path: '/academic/special-period-reports', label: 'รายงานกิจกรรมพิเศษ',          category: 'วิชาการ - ตารางสอน', defaultRoles: ACADEMIC_MANAGEMENT },
  { key: 'course_assignment',     path: '/academic/course-assignment',      label: 'ลงทะเบียนวิชา (ครู/สถานที่)',category: 'วิชาการ - ตารางสอน', defaultRoles: ACADEMIC_MANAGEMENT },
  { key: 'course_assignment_2',   path: '/academic/course-assignment-2',    label: 'มอบหมายรายวิชา 2',           category: 'วิชาการ - ตารางสอน', defaultRoles: ACADEMIC_MANAGEMENT },
  { key: 'period_constraints',    path: '/academic/period-constraints',     label: 'ตั้งค่าคาบคู่/เดี่ยว',      category: 'วิชาการ - ตารางสอน', defaultRoles: ACADEMIC_MANAGEMENT },
  { key: 'teacher_schedule',      path: '/academic/teacher-schedule',       label: 'จัดการตารางสอน',             category: 'วิชาการ - ตารางสอน', defaultRoles: ACADEMIC_MANAGEMENT },
  { key: 'teacher_schedule_view', path: '/academic/teacher-schedule-view',  label: 'ตารางสอน (ครู)',             category: 'วิชาการ - ตารางสอน', defaultRoles: TEACHER_OPERATIONAL },
  { key: 'student_schedule',      path: '/academic/student-schedule',       label: 'ตารางเรียน (นักเรียน)',      category: 'วิชาการ - ตารางสอน', defaultRoles: [...TEACHER_OPERATIONAL, ROLES.STUDENT] },
  { key: 'academic_my_schedule',  path: '/academic/my-schedule',            label: 'ตารางของฉัน',                category: 'วิชาการ - ตารางสอน', defaultRoles: [...STAFF_ACCESS, ROLES.STUDENT] },
  { key: 'substitute_mgmt',            path: '/academic/substitute-management',       label: 'จัดการสอนแทน',              category: 'วิชาการ - ตารางสอน', defaultRoles: ACADEMIC_MANAGEMENT },
  { key: 'substitute_report',         path: '/academic/substitute-report',            label: 'รายงานการสอนแทน',            category: 'วิชาการ - ตารางสอน', defaultRoles: ACADEMIC_MANAGEMENT },
  { key: 'substitute_schedule_print', path: '/academic/substitute-schedule-print',    label: 'ตารางสอนแทน',               category: 'วิชาการ - ตารางสอน', defaultRoles: ACADEMIC_MANAGEMENT },

  // ──────────────────────────────── วิชาการ - เช็คชื่อ ────────────────────────────────
  { key: 'flag_ceremony',             path: '/academic/flag-ceremony',                label: 'เช็คชื่อเข้าแถว',             category: 'วิชาการ - เช็คชื่อ', defaultRoles: TEACHER_OPERATIONAL },
  { key: 'homeroom_attendance',       path: '/academic/homeroom-attendance',           label: 'เช็คชื่อโฮมรูม',              category: 'วิชาการ - เช็คชื่อ', defaultRoles: TEACHER_OPERATIONAL },
  { key: 'classroom_attendance',      path: '/academic/classroom-attendance',          label: 'เช็คชื่อรายวิชา',             category: 'วิชาการ - เช็คชื่อ', defaultRoles: TEACHER_OPERATIONAL },
  { key: 'guidance_attendance',       path: '/academic/guidance-attendance',           label: 'เช็คชื่อแนะแนว',              category: 'วิชาการ - เช็คชื่อ', defaultRoles: TEACHER_OPERATIONAL },
  { key: 'classroom_att_history',     path: '/academic/classroom-attendance-history',  label: 'เช็คชื่อย้อนหลัง',           category: 'วิชาการ - เช็คชื่อ', defaultRoles: TEACHER_OPERATIONAL },
  { key: 'club_attendance',           path: '/academic/club-attendance',               label: 'เช็คชื่อชุมนุม',              category: 'วิชาการ - เช็คชื่อ', defaultRoles: TEACHER_OPERATIONAL },
  { key: 'learner_activity_att',      path: '/academic/learner-activity-attendance',   label: 'เช็คชื่อกิจกรรมผู้เรียน',    category: 'วิชาการ - เช็คชื่อ', defaultRoles: TEACHER_OPERATIONAL },
  { key: 'homeroom_student_list',     path: '/academic/homeroom-student-list',         label: 'รายชื่อนักเรียนประจำชั้น',   category: 'วิชาการ - เช็คชื่อ', defaultRoles: STAFF_ACCESS },

  // ──────────────────────────────── วิชาการ - คะแนนและประเมิน ────────────────────────────────
  { key: 'formative_scores',       path: '/academic/formative-scores',              label: 'บันทึกคะแนน (ก่อนกลางภาค)',  category: 'วิชาการ - คะแนนและประเมิน', defaultRoles: TEACHER_OPERATIONAL },
  { key: 'post_midterm_scores',    path: '/academic/post-midterm-scores',           label: 'บันทึกคะแนน (หลังกลางภาค)',  category: 'วิชาการ - คะแนนและประเมิน', defaultRoles: TEACHER_OPERATIONAL },
  { key: 'grade_book',             path: '/academic/grade-book',                   label: 'ทะเบียนวัดผล (ปพ.5)',         category: 'วิชาการ - คะแนนและประเมิน', defaultRoles: TEACHER_OPERATIONAL },
  { key: 'score_configuration',    path: '/academic/score-configuration',          label: 'ตั้งค่าคะแนนเต็มรายวิชา',    category: 'วิชาการ - คะแนนและประเมิน', defaultRoles: ACADEMIC_MANAGEMENT },
  { key: 'eval_learner_activities',path: '/academic/evaluation/learner-activities',label: 'ประเมินกิจกรรมผู้เรียน',      category: 'วิชาการ - คะแนนและประเมิน', defaultRoles: TEACHER_OPERATIONAL },
  { key: 'eval_clubs',             path: '/academic/evaluation/clubs',             label: 'ประเมินชุมนุม',               category: 'วิชาการ - คะแนนและประเมิน', defaultRoles: TEACHER_OPERATIONAL },
  { key: 'eval_guidance',          path: '/academic/evaluation/guidance',          label: 'ประเมินแนะแนว',               category: 'วิชาการ - คะแนนและประเมิน', defaultRoles: TEACHER_OPERATIONAL },

  // ──────────────────────────────── วิชาการ - กิจกรรมและชุมนุม ────────────────────────────────
  { key: 'club_management',          path: '/academic/club-management',           label: 'จัดการชุมนุม',                  category: 'วิชาการ - กิจกรรมและชุมนุม', defaultRoles: ACADEMIC_MANAGEMENT },
  { key: 'club_members',             path: '/academic/club-members',              label: 'สมาชิกชุมนุม',                  category: 'วิชาการ - กิจกรรมและชุมนุม', defaultRoles: CLUB_MEMBER_MANAGEMENT_ACCESS },
  { key: 'club_reports',             path: '/academic/club-reports',              label: 'รายงานชุมนุม',                  category: 'วิชาการ - กิจกรรมและชุมนุม', defaultRoles: ACADEMIC_MANAGEMENT },
  { key: 'club_list',                path: '/academic/club-list',                 label: 'ทำเนียบชุมนุม',                 category: 'วิชาการ - กิจกรรมและชุมนุม', defaultRoles: STAFF_ACCESS },
  { key: 'learner_activities',       path: '/academic/learner-activities',        label: 'มอบหมายครูกิจกรรมผู้เรียน',    category: 'วิชาการ - กิจกรรมและชุมนุม', defaultRoles: ACADEMIC_MANAGEMENT },
  { key: 'learner_activity_students',path: '/academic/learner-activity-students', label: 'เพิ่มนักเรียนเข้ากิจกรรม',     category: 'วิชาการ - กิจกรรมและชุมนุม', defaultRoles: ACADEMIC_MANAGEMENT },

  // ──────────────────────────────── วิชาการ - รายงาน ────────────────────────────────
  { key: 'classroom_att_summary',    path: '/academic/classroom-attendance-summary',     label: 'สรุปการมาเรียนรายวิชา',        category: 'วิชาการ - รายงาน', defaultRoles: STUDENT_ATTENDANCE_REPORT_ACCESS },
  { key: 'ms_report',                path: '/academic/ms-report',                       label: 'รายงาน มส.',                    category: 'วิชาการ - รายงาน', defaultRoles: STUDENT_ATTENDANCE_REPORT_ACCESS },
  { key: 'classroom_att_audit',      path: '/academic/classroom-attendance-audit',       label: 'ตรวจเช็คการเข้าสอนของครู',    category: 'วิชาการ - รายงาน', defaultRoles: ACADEMIC_MANAGEMENT },
  { key: 'escape_summary',           path: '/academic/escape-summary',                  label: 'สรุปยอดการหนีเรียน',           category: 'วิชาการ - รายงาน', defaultRoles: STUDENT_AFFAIRS_ACCESS },
  { key: 'time_range_attendance',    path: '/academic/time-range-attendance-summary',   label: 'สรุปมาเรียนตามช่วงเวลา',       category: 'วิชาการ - รายงาน', defaultRoles: STUDENT_AFFAIRS_ACCESS },
  { key: 'student_att_date',         path: '/academic/student-attendance-date-selection',label: 'ลงเวลานักเรียน (เลือกวัน)',    category: 'วิชาการ - รายงาน', defaultRoles: STUDENT_AFFAIRS_ACCESS },
  { key: 'student_bk14',             path: '/academic/student-bk14-report',             label: 'รายงาน บค.14',                 category: 'วิชาการ - รายงาน', defaultRoles: STUDENT_AFFAIRS_ACCESS },
  { key: 'students_att_summary',     path: '/academic/students-attendance-summary',     label: 'รายงานการมาเรียน (นักเรียน)', category: 'วิชาการ - รายงาน', defaultRoles: STUDENT_AFFAIRS_ACCESS },
  { key: 'daily_classroom_att_summary', path: '/academic/daily-classroom-attendance-summary', label: 'รายงานยอดรวมรายวัน รายห้องเรียน', category: 'วิชาการ - รายงาน', defaultRoles: STUDENT_AFFAIRS_ACCESS },
  { key: 'teacher_att_today',        path: '/academic/teacher-attendance-today',        label: 'การลงเวลาวันนี้ (ครู)',        category: 'วิชาการ - รายงาน', defaultRoles: TEACHER_ATTENDANCE_TODAY_ACCESS },
  { key: 'teacher_att_date',         path: '/academic/teacher-attendance-date-selection',label: 'บันทึกลงเวลาครู (เลือกวัน)',  category: 'วิชาการ - รายงาน', defaultRoles: [ROLES.SCHOOL_ADMIN] },
  { key: 'teacher_att_summary',      path: '/academic/teacher-attendance-summary',      label: 'รายงานลงเวลา (ครู)',           category: 'วิชาการ - รายงาน', defaultRoles: STUDENT_AFFAIRS_ACCESS },
  { key: 'teacher_att_individual',   path: '/academic/teacher-attendance-individual',   label: 'การลงเวลารายบุคคล',            category: 'วิชาการ - รายงาน', defaultRoles: STUDENT_AFFAIRS_ACCESS },
  { key: 'personnel_time_reg',       path: '/academic/personnel-time-registration',     label: 'ลงเวลาบุคลากร',                category: 'วิชาการ - รายงาน', defaultRoles: [ROLES.SCHOOL_ADMIN, ROLES.TEACHER_ATTENDANCE, ROLES.SCHOOL_ATTENDANCE] },
  { key: 'behavior_class_report',    path: '/academic/student-behavior-class-report',   label: 'รายงานคะแนนความประพฤติ',       category: 'วิชาการ - รายงาน', defaultRoles: STUDENT_AFFAIRS_ACCESS },

  // ──────────────────────────────── วิชาการ - ตั้งค่า ────────────────────────────────
  { key: 'academic_settings',        path: '/academic/settings',              label: 'ตั้งค่าระบบงานวิชาการ',   category: 'วิชาการ - ตั้งค่า', defaultRoles: ACADEMIC_MANAGEMENT },
  { key: 'period_settings',          path: '/academic/period-settings',       label: 'ตั้งค่าคาบเรียน',         category: 'วิชาการ - ตั้งค่า', defaultRoles: ACADEMIC_MANAGEMENT },
  { key: 'attendance_config',        path: '/academic/attendance-config',     label: 'ตั้งค่าเวลาลงเวลา',       category: 'วิชาการ - ตั้งค่า', defaultRoles: ACADEMIC_MANAGEMENT },
  { key: 'behavior_score_config',    path: '/academic/behavior-score-config', label: 'ตั้งค่าคะแนนความประพฤติ', category: 'วิชาการ - ตั้งค่า', defaultRoles: STUDENT_AFFAIRS_MANAGEMENT },
  { key: 'school_calendar',          path: '/academic/school-calendar',       label: 'ปฏิทินการศึกษา',          category: 'วิชาการ - ตั้งค่า', defaultRoles: TEACHER_OPERATIONAL },
  { key: 'physical_rooms',           path: '/academic/physical-rooms',        label: 'ข้อมูลอาคาร/สถานที่',     category: 'วิชาการ - ตั้งค่า', defaultRoles: ACADEMIC_MANAGEMENT },
  { key: 'line_oa_settings',         path: '/academic/settings/line-oa',      label: 'จัดการ LINE OA',          category: 'วิชาการ - ตั้งค่า', defaultRoles: ACADEMIC_MANAGEMENT },
  { key: 'telegram_settings',        path: '/academic/settings/telegram',     label: 'จัดการ Telegram',         category: 'วิชาการ - ตั้งค่า', defaultRoles: ACADEMIC_MANAGEMENT },
  { key: 'school_permission_mgmt',   path: '/academic/permission-management', label: 'จัดการสิทธิ์การเข้าถึง (โรงเรียน)', category: 'วิชาการ - ตั้งค่า', defaultRoles: ADMIN_ACCESS },
  { key: 'activity_hub_settings',   path: '/academic/activity-settings',     label: 'ตั้งค่ากิจกรรมพัฒนาผู้เรียน',      category: 'วิชาการ - ตั้งค่า', defaultRoles: ACADEMIC_MANAGEMENT },

  // ──────────────────────────────── ผู้ดูแลระบบ ────────────────────────────────
  { key: 'owner_schools',             path: '/owner/schools',                    label: 'จัดการข้อมูลโรงเรียน',     category: 'ผู้ดูแลระบบ', defaultRoles: OWNER_ONLY },
  { key: 'owner_users',               path: '/owner/users',                      label: 'ผู้ใช้งานระบบ',             category: 'ผู้ดูแลระบบ', defaultRoles: [ROLES.SUPER_ADMIN, ...ADMIN_ACCESS] },
  { key: 'owner_users_add',           path: '/owner/users/add',                  label: 'เพิ่มผู้ใช้งานใหม่',       category: 'ผู้ดูแลระบบ', defaultRoles: [ROLES.SUPER_ADMIN, ...ADMIN_ACCESS] },
  { key: 'owner_school_info',         path: '/owner/school-info/:schoolId?',     label: 'ข้อมูลโรงเรียน',            category: 'ผู้ดูแลระบบ', defaultRoles: [ROLES.SUPER_ADMIN, ROLES.SCHOOL_ADMIN] },
  { key: 'owner_permission_mgmt',     path: '/owner/permission-management',      label: 'จัดการสิทธิ์การเข้าถึง',   category: 'ผู้ดูแลระบบ', defaultRoles: OWNER_ONLY },
];
