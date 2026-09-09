import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, Link } from 'react-router-dom';
import {
  collection, doc, getDocs, getDoc, addDoc, setDoc, deleteDoc,
  query, orderBy, limit, startAfter, QueryDocumentSnapshot, writeBatch,
} from 'firebase/firestore';
import { firestore as db } from '../../firebase';
import MainLayout from '@/layouts/MainLayout';
import Swal from 'sweetalert2';
import {
  FaDatabase, FaPlus, FaEdit, FaTrashAlt, FaChevronDown, FaChevronRight,
  FaSync, FaSearch, FaCopy, FaEye, FaTimes, FaChevronLeft,
  FaChevronRight as FaChevronRightIcon, FaTag, FaToggleOn, FaToggleOff,
  FaKey, FaCalendarAlt,
} from 'react-icons/fa';

// ═══════════════════════════════════════════════════════════════
// CATEGORIES
// ═══════════════════════════════════════════════════════════════
interface SubcollectionDef { key: string; label: string; }
interface CollectionDef { key: string; label: string; subcollections?: SubcollectionDef[]; }
interface Category { key: string; label: string; collections: CollectionDef[]; }

const CATEGORIES: Category[] = [
  { key: 'personnel', label: 'บุคลากร', collections: [
    { key: 'teachers', label: 'ครู / บุคลากร' },
    { key: 'director_assignments', label: 'การมอบหมายงาน ผอ.' },
  ]},
  { key: 'students', label: 'นักเรียน', collections: [
    { key: 'students', label: 'ข้อมูลนักเรียน' },
  ]},
  { key: 'academic', label: 'วิชาการ', collections: [
    { key: 'courses', label: 'รายวิชา', subcollections: [
      { key: 'grades', label: 'คะแนน/เกรด นักเรียน (รวม 0/ร/มส)' },
    ]},
    { key: 'course_assignments', label: 'มอบหมายรายวิชา' },
    { key: 'enrollments', label: 'การลงทะเบียน' },
    { key: 'subject_groups', label: 'กลุ่มสาระ' },
    { key: 'physical-rooms', label: 'ห้องเรียน' },
    { key: 'schedules', label: 'ตารางสอน' },
    { key: 'special-periods', label: 'คาบพิเศษ' },
    { key: 'configs', label: 'การตั้งค่า' },
    { key: 'special_programs', label: 'โปรแกรมพิเศษ' },
    { key: 'remediation_requests', label: 'คำร้องขอแก้ตัว 0/ร/มส/มผ' },
  ]},
  { key: 'activities', label: 'กิจกรรมและชุมนุม', collections: [
    { key: 'clubs', label: 'ชุมนุม', subcollections: [
      { key: 'evaluations', label: 'ผลประเมิน (มผ)' },
      { key: 'members', label: 'สมาชิกชุมนุม' },
    ]},
    { key: 'club_requests', label: 'คำขอสมัครชุมนุม' },
    { key: 'learner-activities', label: 'กิจกรรมผู้เรียน', subcollections: [
      { key: 'evaluations', label: 'ผลประเมิน (มผ)' },
    ]},
  ]},
  { key: 'calendar', label: 'ปฏิทินและข่าวสาร', collections: [
    { key: 'main_calendar', label: 'ปฏิทินโรงเรียน' },
    { key: 'news', label: 'ข่าวสาร' },
    { key: 'notifications', label: 'การแจ้งเตือน' },
  ]},
  { key: 'attendance', label: 'การลาและเช็คชื่อ', collections: [
    { key: 'leave_summary', label: 'สรุปการลา' },
    { key: 'class_attendance_summary', label: 'สรุปการมาเรียน' },
    { key: 'special-period-attendance', label: 'เช็คชื่อคาบพิเศษ' },
  ]},
  { key: 'substitution', label: 'การแทนครู', collections: [
    { key: 'substitutions', label: 'บันทึกการแทนครู' },
    { key: 'manual_substitute_requests', label: 'คำขอแทนครู' },
  ]},
  { key: 'support', label: 'ระบบดูแลช่วยเหลือ', collections: [
    { key: 'screening_assessments', label: 'แบบคัดกรอง' },
    { key: 'sdq-assessments', label: 'แบบประเมิน SDQ' },
    { key: 'guidance-evaluations', label: 'การประเมินแนะแนว' },
  ]},
  { key: 'system', label: 'ระบบและสรุป', collections: [
    { key: 'summaries', label: 'สรุปข้อมูล' },
    { key: 'route_permissions', label: 'สิทธิ์การเข้าถึง' },
  ]},
];

// ═══════════════════════════════════════════════════════════════
// SCHEMA DEFINITIONS (field label + type per collection)
// ═══════════════════════════════════════════════════════════════
type FieldType = 'text' | 'email' | 'tel' | 'number' | 'date' | 'time' | 'boolean'
  | 'select' | 'tags' | 'json' | 'textarea' | 'readonly' | 'url';

interface FieldDef {
  key: string;
  label: string;
  type: FieldType;
  options?: string[];
  hint?: string;
  placeholder?: string;
  readonly?: boolean;
}
interface GroupDef { label: string; fields: FieldDef[]; }
type Schema = GroupDef[];

const SCHEMAS: Record<string, Schema> = {
  teachers: [
    { label: 'ข้อมูลส่วนตัว', fields: [
      { key: 'title', label: 'คำนำหน้า', type: 'select', options: ['นาย', 'นาง', 'นางสาว', 'ดร.', 'รศ.ดร.', 'ผศ.ดร.', 'รศ.', 'ผศ.'] },
      { key: 'firstName', label: 'ชื่อ', type: 'text' },
      { key: 'lastName', label: 'นามสกุล', type: 'text' },
      { key: 'gender', label: 'เพศ', type: 'select', options: ['ชาย', 'หญิง', 'อื่นๆ'] },
      { key: 'dob', label: 'วันเกิด', type: 'date' },
      { key: 'idCardNumber', label: 'เลขบัตรประชาชน', type: 'text' },
      { key: 'nickname', label: 'ชื่อเล่น', type: 'text' },
    ]},
    { label: 'ข้อมูลการทำงาน', fields: [
      { key: 'teacherId', label: 'รหัสประจำตัวครู', type: 'text' },
      { key: 'position', label: 'ตำแหน่ง', type: 'text', hint: 'เช่น ครูชำนาญการพิเศษ' },
      { key: 'personnelType', label: 'ประเภทบุคลากร', type: 'select', options: ['ข้าราชการครู', 'พนักงานราชการ', 'ครูอัตราจ้าง', 'ลูกจ้างประจำ', 'ลูกจ้างชั่วคราว'] },
      { key: 'department', label: 'ฝ่าย/แผนก', type: 'text' },
      { key: 'subjectGroup', label: 'กลุ่มสาระการเรียนรู้', type: 'text' },
      { key: 'learningArea', label: 'สาขาวิชา', type: 'text' },
      { key: 'startDate', label: 'วันที่เริ่มงาน/บรรจุ', type: 'date' },
      { key: 'status', label: 'สถานะ', type: 'select', options: ['อยู่', 'ลาออก', 'โอน', 'เกษียณ'] },
    ]},
    { label: 'การศึกษาและใบอนุญาต', fields: [
      { key: 'educationLevel', label: 'วุฒิการศึกษา', type: 'select', options: ['ปริญญาตรี', 'ปริญญาโท', 'ปริญญาเอก', 'อนุปริญญา', 'ม.6 หรือต่ำกว่า'] },
      { key: 'major', label: 'วิชาเอก', type: 'text' },
      { key: 'licenseNumber', label: 'เลขที่ใบอนุญาตประกอบวิชาชีพ', type: 'text' },
    ]},
    { label: 'ห้องเรียนที่ดูแล', fields: [
      { key: 'isHomeroomTeacher', label: 'เป็นครูประจำชั้น', type: 'boolean' },
      { key: 'homeroomGrade', label: 'ระดับชั้น (ครูประจำชั้น)', type: 'text', hint: 'เช่น ม.1' },
      { key: 'homeroomRoom', label: 'ห้อง (ครูประจำชั้น)', type: 'text', hint: 'เช่น ห้อง 1' },
      { key: 'advisorRole', label: 'บทบาทที่ปรึกษา', type: 'text' },
      { key: 'isHeadOfLearningArea', label: 'หัวหน้ากลุ่มสาระ', type: 'boolean' },
      { key: 'isHeadOfAssessment', label: 'หัวหน้างานวัดผล', type: 'boolean' },
      { key: 'isGuidanceTeacher', label: 'ครูแนะแนว', type: 'boolean' },
    ]},
    { label: 'ข้อมูลติดต่อ', fields: [
      { key: 'email', label: 'อีเมล', type: 'email' },
      { key: 'contact', label: 'เบอร์โทรศัพท์', type: 'tel' },
      { key: 'lineId', label: 'Line ID', type: 'text' },
      { key: 'address', label: 'ที่อยู่', type: 'textarea' },
      { key: 'profileImageUrl', label: 'URL รูปโปรไฟล์', type: 'url' },
    ]},
    { label: 'ข้อมูลระบบ (อย่าแก้ไขถ้าไม่แน่ใจ)', fields: [
      { key: 'uid', label: 'Firebase Auth UID', type: 'readonly' },
      { key: 'role', label: 'สิทธิ์การใช้งาน', type: 'tags' },
      { key: 'createdAt', label: 'วันที่สร้าง', type: 'readonly' },
    ]},
  ],

  students: [
    { label: 'ข้อมูลส่วนตัว', fields: [
      { key: 'title', label: 'คำนำหน้า', type: 'select', options: ['เด็กชาย', 'เด็กหญิง', 'นาย', 'นางสาว', 'นาง'] },
      { key: 'firstName', label: 'ชื่อ', type: 'text' },
      { key: 'lastName', label: 'นามสกุล', type: 'text' },
      { key: 'firstNameEn', label: 'ชื่อ (ภาษาอังกฤษ)', type: 'text' },
      { key: 'lastNameEn', label: 'นามสกุล (ภาษาอังกฤษ)', type: 'text' },
      { key: 'nickname', label: 'ชื่อเล่น', type: 'text' },
      { key: 'gender', label: 'เพศ', type: 'select', options: ['ชาย', 'หญิง', 'อื่นๆ'] },
      { key: 'birthDate', label: 'วันเกิด', type: 'date' },
      { key: 'idCardNumber', label: 'เลขบัตรประชาชน', type: 'text' },
    ]},
    { label: 'ข้อมูลการเรียน', fields: [
      { key: 'studentId', label: 'รหัสนักเรียน', type: 'text' },
      { key: 'studentNumber', label: 'เลขที่ในห้อง', type: 'number' },
      { key: 'classLevel', label: 'ระดับชั้น', type: 'text', hint: 'เช่น ม.1, ป.6' },
      { key: 'room', label: 'ห้องเรียน', type: 'text', hint: 'เช่น 1, 2, 3' },
      { key: 'studentStatus', label: 'สถานะนักเรียน', type: 'select', options: ['อยู่', 'จำหน่าย', 'ย้าย', 'จบการศึกษา', 'ลาออก', 'ขาดการติดต่อ'] },
      { key: 'gpa', label: 'GPA ปัจจุบัน', type: 'number' },
      { key: 'gpax', label: 'GPAX สะสม', type: 'number' },
    ]},
    { label: 'ข้อมูลสุขภาพและสวัสดิการ', fields: [
      { key: 'weight', label: 'น้ำหนัก (กก.)', type: 'number' },
      { key: 'height', label: 'ส่วนสูง (ซม.)', type: 'number' },
      { key: 'disabilityType', label: 'ประเภทความพิการ', type: 'text' },
      { key: 'disadvantageType', label: 'ประเภทความด้อยโอกาส', type: 'text' },
      { key: 'lacksUniform', label: 'ขาดแคลนเครื่องแบบ', type: 'boolean' },
      { key: 'lacksStationery', label: 'ขาดแคลนอุปกรณ์การเรียน', type: 'boolean' },
      { key: 'lacksTextbook', label: 'ขาดแคลนหนังสือเรียน', type: 'boolean' },
      { key: 'lacksLunch', label: 'ขาดแคลนอาหารกลางวัน', type: 'boolean' },
      { key: 'staysAtSchool', label: 'พักอาศัยที่โรงเรียน', type: 'boolean' },
    ]},
    { label: 'การเดินทาง', fields: [
      { key: 'travelMethod', label: 'วิธีการเดินทาง', type: 'select', options: ['เดิน', 'จักรยาน', 'รถยนต์', 'รถรับส่ง', 'รถโดยสาร', 'รถจักรยานยนต์'] },
      { key: 'travelMonthlyCost', label: 'ค่าใช้จ่ายการเดินทาง/เดือน (บาท)', type: 'number' },
    ]},
    { label: 'ข้อมูลระบบ (อย่าแก้ไขถ้าไม่แน่ใจ)', fields: [
      { key: 'uid', label: 'Firebase Auth UID', type: 'readonly' },
      { key: 'role', label: 'สิทธิ์การใช้งาน', type: 'tags' },
      { key: 'profileImageUrl', label: 'URL รูปโปรไฟล์', type: 'url' },
      { key: 'createdAt', label: 'วันที่สร้าง', type: 'readonly' },
    ]},
  ],

  courses: [
    { label: 'ข้อมูลรายวิชา', fields: [
      { key: 'title', label: 'ชื่อวิชา (ภาษาไทย)', type: 'text' },
      { key: 'titleEn', label: 'ชื่อวิชา (ภาษาอังกฤษ)', type: 'text' },
      { key: 'code', label: 'รหัสวิชา (ไทย)', type: 'text', hint: 'เช่น อ21101' },
      { key: 'codeEn', label: 'รหัสวิชา (อังกฤษ)', type: 'text' },
      { key: 'subjectGroup', label: 'กลุ่มสาระการเรียนรู้', type: 'text' },
      { key: 'type', label: 'ประเภทวิชา', type: 'select', options: ['พื้นฐาน', 'เพิ่มเติม', 'กิจกรรม'] },
      { key: 'credits', label: 'หน่วยกิต', type: 'number' },
      { key: 'hoursPerWeek', label: 'ชั่วโมง / สัปดาห์', type: 'number' },
      { key: 'semester', label: 'ภาคเรียน', type: 'select', options: ['1', '2'] },
      { key: 'isElective', label: 'วิชาเลือก', type: 'boolean' },
      { key: 'isCombined', label: 'รวมชั้น', type: 'boolean' },
    ]},
    { label: 'ห้องเรียนและครูผู้สอน', fields: [
      { key: 'classId', label: 'ห้องเรียนที่เปิดสอน', type: 'tags', hint: 'รหัสห้อง เช่น m1, m2/1' },
      { key: 'room', label: 'ห้องที่ใช้สอน', type: 'tags', hint: 'รหัสห้องกายภาพ' },
      { key: 'teacherId', label: 'รหัสครูผู้สอน (หลัก)', type: 'text' },
      { key: 'teacherIds', label: 'รหัสครูผู้สอน (ทั้งหมด)', type: 'tags' },
    ]},
    { label: 'การวัดผล', fields: [
      { key: 'formativeWeight', label: 'น้ำหนักคะแนนระหว่างเรียน (%)', type: 'number' },
      { key: 'midtermWeight', label: 'น้ำหนักคะแนนปลายภาค (%)', type: 'number' },
      { key: 'expectedOutcomes', label: 'ผลการเรียนรู้ที่คาดหวัง', type: 'tags' },
      { key: 'indicators', label: 'ตัวชี้วัด', type: 'tags' },
    ]},
  ],

  clubs: [
    { label: 'ข้อมูลชุมนุม', fields: [
      { key: 'name', label: 'ชื่อชุมนุม', type: 'text' },
      { key: 'description', label: 'คำอธิบาย', type: 'textarea' },
      { key: 'capacity', label: 'จำนวนรับสมาชิก (คน)', type: 'number' },
      { key: 'imageUrl', label: 'URL รูปภาพ', type: 'url' },
    ]},
    { label: 'ครูที่ปรึกษา', fields: [
      { key: 'responsibleTeacherIds', label: 'รหัส UID ครูที่ปรึกษา', type: 'tags' },
    ]},
    { label: 'คาบพิเศษที่เชื่อม', fields: [
      { key: 'specialPeriodId', label: 'รหัสคาบพิเศษ', type: 'text' },
      { key: 'specialPeriodTitle', label: 'ชื่อคาบพิเศษ', type: 'text' },
      { key: 'specialPeriodDay', label: 'วัน', type: 'select', options: ['จันทร์', 'อังคาร', 'พุธ', 'พฤหัสบดี', 'ศุกร์', 'เสาร์', 'อาทิตย์'] },
      { key: 'specialPeriodStartTime', label: 'เวลาเริ่ม', type: 'time' },
      { key: 'specialPeriodEndTime', label: 'เวลาสิ้นสุด', type: 'time' },
    ]},
    { label: 'เงื่อนไขการรับสมัคร', fields: [
      { key: 'allowedClassLevelFrom', label: 'รับตั้งแต่ชั้น', type: 'text' },
      { key: 'allowedClassLevelTo', label: 'รับถึงชั้น', type: 'text' },
    ]},
  ],

  'subject_groups': [
    { label: 'ข้อมูลกลุ่มสาระ', fields: [
      { key: 'name', label: 'ชื่อกลุ่มสาระ', type: 'text' },
      { key: 'code', label: 'รหัสกลุ่มสาระ', type: 'text' },
    ]},
    { label: 'หัวหน้ากลุ่มสาระ', fields: [
      { key: 'headTeacherName', label: 'ชื่อหัวหน้ากลุ่มสาระ', type: 'text' },
      { key: 'headTeacherId', label: 'รหัสครู (Document ID)', type: 'text' },
      { key: 'headId', label: 'รหัส (headId)', type: 'text' },
      { key: 'headName', label: 'ชื่อ (headName)', type: 'text' },
    ]},
  ],

  'physical-rooms': [
    { label: 'ข้อมูลห้อง', fields: [
      { key: 'roomName', label: 'ชื่อห้อง', type: 'text', hint: 'เช่น ห้องเรียน ม.1/1, ห้องคอมพิวเตอร์' },
      { key: 'roomCode', label: 'รหัสห้อง', type: 'text', hint: 'เช่น R101' },
      { key: 'roomType', label: 'ประเภทห้อง', type: 'select', options: ['ห้องเรียนปกติ', 'ห้องปฏิบัติการ', 'ห้องพักครู', 'อาคารกีฬา', 'หอประชุม', 'อื่นๆ'] },
      { key: 'building', label: 'อาคาร', type: 'text' },
      { key: 'floor', label: 'ชั้น', type: 'number' },
      { key: 'capacity', label: 'ความจุ (คน)', type: 'number' },
      { key: 'isActive', label: 'ใช้งานอยู่', type: 'boolean' },
    ]},
  ],

  'special-periods': [
    { label: 'ข้อมูลคาบพิเศษ', fields: [
      { key: 'title', label: 'ชื่อคาบพิเศษ', type: 'text' },
      { key: 'periodType', label: 'ประเภทคาบ', type: 'select', options: ['ชุมนุม', 'กิจกรรมพัฒนาผู้เรียน', 'แนะแนว', 'ลูกเสือ', 'อื่นๆ'] },
      { key: 'day', label: 'วันที่จัด', type: 'select', options: ['จันทร์', 'อังคาร', 'พุธ', 'พฤหัสบดี', 'ศุกร์'] },
      { key: 'startTime', label: 'เวลาเริ่ม', type: 'time' },
      { key: 'endTime', label: 'เวลาสิ้นสุด', type: 'time' },
      { key: 'durationHours', label: 'ระยะเวลา (ชั่วโมง)', type: 'number' },
      { key: 'eventDate', label: 'วันที่กิจกรรม', type: 'date' },
      { key: 'eventEndDate', label: 'วันที่สิ้นสุดกิจกรรม', type: 'date' },
    ]},
    { label: 'การตั้งค่า', fields: [
      { key: 'isTeachingLoad', label: 'นับเป็นภาระงานสอน', type: 'boolean' },
      { key: 'countAsTeachingPeriod', label: 'นับเป็นคาบสอน', type: 'boolean' },
      { key: 'deductBehaviorDefault', label: 'หักคะแนนพฤติกรรมเริ่มต้น', type: 'boolean' },
      { key: 'attendanceCloseDate', label: 'วันปิดรับเช็คชื่อ', type: 'date' },
      { key: 'attendanceCloseTime', label: 'เวลาปิดรับเช็คชื่อ', type: 'time' },
      { key: 'responsibleTeacherIds', label: 'รหัสครูรับผิดชอบ', type: 'tags' },
    ]},
  ],

  remediation_requests: [
    { label: 'ข้อมูลนักเรียน', fields: [
      { key: 'studentName', label: 'ชื่อนักเรียน', type: 'text' },
      { key: 'studentCode', label: 'รหัสนักเรียน', type: 'text' },
      { key: 'classLevel', label: 'ระดับชั้น', type: 'text' },
      { key: 'room', label: 'ห้อง', type: 'text' },
    ]},
    { label: 'รายวิชา/กิจกรรมที่ติด', fields: [
      { key: 'flagType', label: 'ประเภท', type: 'select', options: ['course', 'club', 'learner-activity', 'guidance'] },
      { key: 'originalGrade', label: 'ผลเดิมที่ติด', type: 'text', hint: '0 / ร / มส / มผ' },
      { key: 'courseTitle', label: 'ชื่อวิชา', type: 'text' },
      { key: 'activityName', label: 'ชื่อกิจกรรม', type: 'text' },
      { key: 'academicYear', label: 'ปีการศึกษา', type: 'text' },
      { key: 'semester', label: 'ภาคเรียน', type: 'select', options: ['1', '2'] },
    ]},
    { label: 'สถานะคำร้อง', fields: [
      { key: 'status', label: 'สถานะ', type: 'select', options: ['pending', 'resolved', 'cancelled'] },
      { key: 'newResult', label: 'ผลใหม่ที่บันทึก', type: 'text' },
      { key: 'requestedAt', label: 'วันที่ยื่นคำร้อง', type: 'readonly' },
      { key: 'resolvedAt', label: 'วันที่บันทึกผล', type: 'readonly' },
      { key: 'resolvedByName', label: 'ผู้บันทึกผล', type: 'text' },
    ]},
  ],

  'learner-activities': [
    { label: 'ข้อมูลกิจกรรม', fields: [
      { key: 'name', label: 'ชื่อกิจกรรม', type: 'text' },
      { key: 'description', label: 'คำอธิบาย', type: 'textarea' },
      { key: 'subjectGroup', label: 'กลุ่มกิจกรรม', type: 'text' },
      { key: 'semester', label: 'ภาคเรียน', type: 'select', options: ['1', '2'] },
      { key: 'classId', label: 'ห้องที่เข้าร่วม', type: 'tags' },
    ]},
    { label: 'เชื่อมกับรายวิชา', fields: [
      { key: 'courseId', label: 'รหัสรายวิชาที่เชื่อม', type: 'text' },
      { key: 'courseCode', label: 'รหัสวิชา', type: 'text' },
    ]},
    { label: 'ครูผู้รับผิดชอบ', fields: [
      { key: 'responsibleTeacherIds', label: 'รหัสครูผู้รับผิดชอบ', type: 'tags' },
    ]},
  ],
};

// ═══════════════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════════════
const PAGE_SIZE = 25;

const getDisplayName = (data: Record<string, any>, fallbackId: string): string => {
  if (data.studentName) return String(data.studentName);
  if (data.fullName) return String(data.fullName);
  const title = data.title ? String(data.title) : '';
  if (data.firstName && data.lastName) return `${title}${data.firstName} ${data.lastName}`.trim();
  if (data.firstName) return `${title}${data.firstName}`.trim();
  if (data.name) return String(data.name);
  if (data.courseName) return String(data.courseName);
  if (data.clubName) return String(data.clubName);
  if (data.activityName) return String(data.activityName);
  if (data.roomName) return String(data.roomName);
  if (data.title) return String(data.title);
  if (data.subject) return String(data.subject);
  if (data.label) return String(data.label);
  if (data.code && data.name) return `${data.code} ${data.name}`;
  if (data.date) return `วันที่ ${data.date}`;
  if (data.type) return String(data.type);
  return fallbackId;
};

const getDisplaySubtitle = (data: Record<string, any>, colKey: string): string => {
  const parts: string[] = [];
  if (colKey === 'teachers') {
    if (data.position) parts.push(data.position);
    if (data.subjectGroup) parts.push(data.subjectGroup);
    if (data.status) parts.push(`สถานะ: ${data.status}`);
  } else if (colKey === 'students') {
    if (data.classLevel || data.room) parts.push(`ชั้น ${[data.classLevel, data.room].filter(Boolean).join('/')}`);
    if (data.studentId) parts.push(`รหัส: ${data.studentId}`);
    if (data.studentStatus) parts.push(data.studentStatus);
  } else if (colKey === 'courses') {
    if (data.code) parts.push(data.code);
    if (data.subjectGroup) parts.push(data.subjectGroup);
    if (data.credits !== undefined) parts.push(`${data.credits} หน่วยกิต`);
    if (data.type) parts.push(data.type);
  } else if (colKey === 'clubs') {
    if (data.capacity !== undefined) parts.push(`รับ ${data.capacity} คน`);
    if (data.specialPeriodDay) parts.push(`วัน${data.specialPeriodDay}`);
  } else if (colKey === 'physical-rooms') {
    if (data.building) parts.push(`อาคาร ${data.building}`);
    if (data.floor !== undefined) parts.push(`ชั้น ${data.floor}`);
    if (data.capacity !== undefined) parts.push(`จุ ${data.capacity} คน`);
    if (data.isActive === false) parts.push('ปิดใช้งาน');
  } else if (colKey === 'subject_groups') {
    if (data.code) parts.push(`รหัส: ${data.code}`);
    if (data.headTeacherName || data.headName) parts.push(`หัวหน้า: ${data.headTeacherName || data.headName}`);
  } else if (colKey === 'remediation_requests') {
    if (data.studentCode) parts.push(data.studentCode);
    if (data.courseTitle || data.activityName) parts.push(data.courseTitle || data.activityName);
    if (data.originalGrade) parts.push(`ติด: ${data.originalGrade}`);
    if (data.status) parts.push(`สถานะ: ${data.status}`);
  } else if (colKey === 'grades') {
    if (data.grade) parts.push(`เกรด: ${data.grade}`);
    if (data.remark) parts.push(`หมายเหตุ: ${data.remark}`);
    if (data.status) parts.push(`สถานะ: ${data.status}`);
  } else if (colKey === 'evaluations') {
    if (data.summary) parts.push(`ผ่าน ${data.summary.passed ?? 0} · ไม่ผ่าน ${data.summary.failed ?? 0} · รอ ${data.summary.pending ?? 0}`);
  }
  return parts.join('  ·  ');
};

const AVATAR_COLORS: Record<string, string> = {
  teachers: 'bg-indigo-100 dark:bg-indigo-500/20 text-indigo-600 dark:text-indigo-400',
  students: 'bg-emerald-100 dark:bg-emerald-500/20 text-emerald-600 dark:text-emerald-400',
  courses: 'bg-amber-100 dark:bg-amber-500/20 text-amber-600 dark:text-amber-400',
  clubs: 'bg-purple-100 dark:bg-purple-500/20 text-purple-600 dark:text-purple-400',
  'learner-activities': 'bg-purple-100 dark:bg-purple-500/20 text-purple-600 dark:text-purple-400',
  'subject_groups': 'bg-rose-100 dark:bg-rose-500/20 text-rose-600 dark:text-rose-400',
  'physical-rooms': 'bg-sky-100 dark:bg-sky-500/20 text-sky-600 dark:text-sky-400',
  'special-periods': 'bg-orange-100 dark:bg-orange-500/20 text-orange-600 dark:text-orange-400',
  'remediation_requests': 'bg-rose-100 dark:bg-rose-500/20 text-rose-600 dark:text-rose-400',
  'grades': 'bg-rose-100 dark:bg-rose-500/20 text-rose-600 dark:text-rose-400',
  'evaluations': 'bg-teal-100 dark:bg-teal-500/20 text-teal-600 dark:text-teal-400',
};

const getInitials = (name: string): string => {
  const words = name.replace(/^[ดรนส]\./g, '').trim().split(/\s+/);
  if (words.length >= 2) return `${words[0][0]}${words[1][0]}`.toUpperCase();
  return name.slice(0, 2).toUpperCase();
};

const formatTimestamp = (v: any): string => {
  if (!v) return '';
  if (v?.seconds) return new Date(v.seconds * 1000).toLocaleDateString('th-TH');
  if (typeof v === 'string') return v;
  return String(v);
};

// auto-detect type for unknown fields
const autoDetectType = (key: string, value: unknown): FieldType => {
  if (typeof value === 'boolean') return 'boolean';
  if (typeof value === 'number') return 'number';
  if (Array.isArray(value)) {
    if (value.every(x => typeof x === 'string' || typeof x === 'number')) return 'tags';
    return 'json';
  }
  if (typeof value === 'object' && value !== null) return 'json';
  // string heuristics
  if (/email/i.test(key)) return 'email';
  if (/phone|contact|tel/i.test(key)) return 'tel';
  if (/url|image|photo|logo|avatar/i.test(key)) return 'url';
  if (/date|born|birth/i.test(key) || key === 'dob') return 'date';
  if (/time|Time/i.test(key)) return 'time';
  if (/uid|Id$/i.test(key)) return 'readonly';
  if (/At$/i.test(key)) return 'readonly';
  if (typeof value === 'string' && value.length > 120) return 'textarea';
  return 'text';
};

// ═══════════════════════════════════════════════════════════════
// SMART FIELD COMPONENTS
// ═══════════════════════════════════════════════════════════════
interface FieldProps {
  def: FieldDef;
  value: unknown;
  onChange: (key: string, value: unknown) => void;
}

const TagsInput: React.FC<{ value: string[]; onChange: (v: string[]) => void; hint?: string }> = ({ value, onChange, hint }) => {
  const [input, setInput] = useState('');
  const addTag = () => {
    const trimmed = input.trim();
    if (!trimmed) return;
    onChange([...value, trimmed]);
    setInput('');
  };
  return (
    <div>
      <div className="flex flex-wrap gap-1.5 mb-2 min-h-[32px]">
        {value.map((tag, i) => (
          <span key={i} className="flex items-center gap-1 px-2.5 py-1 bg-indigo-50 dark:bg-indigo-500/20 text-indigo-700 dark:text-indigo-300 rounded-full text-xs font-medium">
            {String(tag)}
            <button type="button" onClick={() => onChange(value.filter((_, j) => j !== i))} className="text-indigo-400 hover:text-red-500 ml-0.5 leading-none">&times;</button>
          </span>
        ))}
        {value.length === 0 && <span className="text-xs text-gray-400 italic py-1">ยังไม่มีข้อมูล</span>}
      </div>
      <div className="flex gap-2">
        <input
          type="text"
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addTag(); } }}
          placeholder={hint || 'พิมพ์แล้วกด Enter หรือ +'}
          className="flex-1 px-3 py-1.5 text-sm rounded-lg border border-gray-200 dark:border-gray-600 bg-white dark:bg-[#1e1f21] text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-400"
        />
        <button type="button" onClick={addTag} className="px-3 py-1.5 text-sm bg-indigo-100 dark:bg-indigo-500/20 text-indigo-600 dark:text-indigo-400 rounded-lg hover:bg-indigo-200 dark:hover:bg-indigo-500/30 transition-colors">
          + เพิ่ม
        </button>
      </div>
    </div>
  );
};

const BooleanToggle: React.FC<{ value: boolean; onChange: (v: boolean) => void }> = ({ value, onChange }) => (
  <button
    type="button"
    onClick={() => onChange(!value)}
    className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${value ? 'bg-emerald-100 dark:bg-emerald-500/20 text-emerald-700 dark:text-emerald-400' : 'bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400'}`}
  >
    {value ? <FaToggleOn size={18} /> : <FaToggleOff size={18} />}
    {value ? 'ใช่ / เปิดใช้งาน' : 'ไม่ใช่ / ปิด'}
  </button>
);

const JsonField: React.FC<{ value: unknown; onChange: (v: unknown) => void }> = ({ value, onChange }) => {
  const [str, setStr] = useState(() => JSON.stringify(value, null, 2));
  const [err, setErr] = useState('');
  const handleBlur = () => {
    try { onChange(JSON.parse(str)); setErr(''); } catch { setErr('JSON ไม่ถูกต้อง'); }
  };
  return (
    <div>
      <textarea
        value={str}
        onChange={e => setStr(e.target.value)}
        onBlur={handleBlur}
        rows={4}
        spellCheck={false}
        className="w-full px-3 py-2 text-xs font-mono rounded-lg border border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-[#1a1b1e] text-gray-800 dark:text-gray-200 focus:outline-none focus:ring-2 focus:ring-indigo-400 resize-y"
      />
      {err && <p className="text-xs text-red-500 mt-1">{err}</p>}
    </div>
  );
};

const SmartField: React.FC<FieldProps> = ({ def, value, onChange }) => {
  const baseInput = 'w-full px-3 py-2 text-sm rounded-lg border border-gray-200 dark:border-gray-600 bg-white dark:bg-[#1e1f21] text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-400';

  if (def.type === 'readonly') {
    return (
      <div className="flex items-center gap-2 px-3 py-2 bg-gray-50 dark:bg-[#1a1b1e] rounded-lg border border-dashed border-gray-200 dark:border-gray-700">
        <FaKey size={11} className="text-gray-400 flex-shrink-0" />
        <span className="text-xs font-mono text-gray-500 break-all">
          {value && typeof value === 'object' && 'seconds' in (value as any)
            ? formatTimestamp(value)
            : formatTimestamp(value) || String(value ?? '-')}
        </span>
      </div>
    );
  }
  if (def.type === 'boolean') return <BooleanToggle value={Boolean(value)} onChange={v => onChange(def.key, v)} />;
  if (def.type === 'tags') return <TagsInput value={Array.isArray(value) ? value.map(String) : []} onChange={v => onChange(def.key, v)} hint={def.hint} />;
  if (def.type === 'json') return <JsonField value={value ?? {}} onChange={v => onChange(def.key, v)} />;
  if (def.type === 'textarea') return (
    <textarea
      value={String(value ?? '')}
      onChange={e => onChange(def.key, e.target.value)}
      placeholder={def.hint || def.placeholder}
      rows={3}
      className={`${baseInput} resize-y`}
    />
  );
  if (def.type === 'select') return (
    <select value={String(value ?? '')} onChange={e => onChange(def.key, e.target.value)} className={baseInput}>
      <option value="">-- เลือก --</option>
      {def.options?.map(o => <option key={o} value={o}>{o}</option>)}
      {value != null && !def.options?.includes(String(value)) ? <option value={String(value)}>{String(value)} (ค่าปัจจุบัน)</option> : null}
    </select>
  );

  const inputType = def.type === 'text' ? 'text'
    : def.type === 'email' ? 'email'
    : def.type === 'tel' ? 'tel'
    : def.type === 'url' ? 'url'
    : def.type === 'number' ? 'number'
    : def.type === 'date' ? 'date'
    : def.type === 'time' ? 'time'
    : 'text';

  return (
    <div>
      <input
        type={inputType}
        value={def.type === 'number' ? (value === null || value === undefined ? '' : String(value)) : String(value ?? '')}
        onChange={e => {
          const v = def.type === 'number' ? (e.target.value === '' ? '' : Number(e.target.value)) : e.target.value;
          onChange(def.key, v);
        }}
        placeholder={def.hint || def.placeholder}
        className={baseInput}
      />
      {def.type === 'url' && value != null ? (
        <a href={String(value)} target="_blank" rel="noreferrer" className="text-xs text-indigo-500 hover:underline mt-1 block truncate">{String(value)}</a>
      ) : null}
    </div>
  );
};

// ═══════════════════════════════════════════════════════════════
// SMART FORM MODAL
// ═══════════════════════════════════════════════════════════════
interface SmartFormProps {
  colKey: string;
  docItem: { id: string; data: Record<string, unknown> } | null;
  mode: 'add' | 'edit';
  colLabel: string;
  onSave: (data: Record<string, unknown>, customId: string) => Promise<void>;
  onClose: () => void;
}

const SmartFormModal: React.FC<SmartFormProps> = ({ colKey, docItem, mode, colLabel, onSave, onClose }) => {
  const schema: Schema | null = SCHEMAS[colKey] ?? null;
  const [formData, setFormData] = useState<Record<string, unknown>>(() => docItem?.data ?? {});
  const [customId, setCustomId] = useState(mode === 'edit' ? (docItem?.id ?? '') : '');
  const [saving, setSaving] = useState(false);
  const [newFieldKey, setNewFieldKey] = useState('');
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>(() => {
    const init: Record<string, boolean> = {};
    (schema ?? []).forEach((g, i) => { init[g.label] = i === 0; });
    return init;
  });

  const updateField = (key: string, value: unknown) => setFormData(prev => ({ ...prev, [key]: value }));

  // Fields in schema
  const schemaKeys = new Set(schema?.flatMap(g => g.fields.map(f => f.key)) ?? []);
  // Extra fields in doc but not in schema
  const extraEntries = Object.entries(formData).filter(([k]) => !schemaKeys.has(k));

  const handleSave = async () => {
    setSaving(true);
    try {
      await onSave(formData, customId);
      onClose();
    } catch (e: any) {
      Swal.fire('ข้อผิดพลาด', e?.message || 'บันทึกไม่ได้', 'error');
    } finally {
      setSaving(false);
    }
  };

  const addNewField = () => {
    const key = newFieldKey.trim();
    if (!key || key in formData) return;
    setFormData(prev => ({ ...prev, [key]: '' }));
    setNewFieldKey('');
  };

  const displayName = mode === 'edit' && docItem ? getDisplayName(docItem.data, docItem.id) : `เพิ่มข้อมูลใหม่`;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-3">
      <div className="bg-white dark:bg-[#2a2b2f] rounded-2xl shadow-2xl w-full max-w-2xl max-h-[92vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200 dark:border-gray-700 flex-shrink-0">
          <div>
            <p className="text-xs text-gray-400 dark:text-gray-500">{colLabel}</p>
            <h2 className="text-base font-bold text-gray-900 dark:text-white">{displayName}</h2>
            {mode === 'edit' && docItem && (
              <p className="text-[10px] font-mono text-gray-400 mt-0.5">ID: {docItem.id}</p>
            )}
          </div>
          <button onClick={onClose} className="p-2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-white/5 rounded-lg transition-colors">
            <FaTimes size={16} />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          {/* Document ID (add mode only) */}
          {mode === 'add' && (
            <div className="bg-amber-50 dark:bg-amber-500/10 rounded-xl p-3">
              <label className="block text-xs font-semibold text-amber-700 dark:text-amber-400 mb-1.5">
                Document ID <span className="font-normal">(เว้นว่างให้ระบบสร้างให้อัตโนมัติ)</span>
              </label>
              <input
                type="text"
                value={customId}
                onChange={e => setCustomId(e.target.value)}
                placeholder="เว้นว่าง = auto"
                className="w-full px-3 py-2 text-sm rounded-lg border border-amber-200 dark:border-amber-700/50 bg-white dark:bg-[#1e1f21] text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-amber-400"
              />
            </div>
          )}

          {/* Schema-based fields */}
          {schema ? (
            schema.map(group => (
              <div key={group.label} className="rounded-xl border border-gray-100 dark:border-gray-700/50 overflow-hidden">
                <button
                  type="button"
                  onClick={() => setOpenGroups(prev => ({ ...prev, [group.label]: !prev[group.label] }))}
                  className="flex items-center justify-between w-full px-4 py-2.5 bg-gray-50 dark:bg-white/[0.03] text-left hover:bg-gray-100 dark:hover:bg-white/[0.05] transition-colors"
                >
                  <span className="text-xs font-semibold text-gray-600 dark:text-gray-300 uppercase tracking-wider">{group.label}</span>
                  {openGroups[group.label] ? <FaChevronDown size={10} className="text-gray-400" /> : <FaChevronRight size={10} className="text-gray-400" />}
                </button>
                {openGroups[group.label] && (
                  <div className="divide-y divide-gray-100 dark:divide-gray-700/30">
                    {group.fields.map(field => {
                      const val = formData[field.key];
                      if (mode === 'edit' && val === undefined && field.type === 'readonly') return null;
                      const effectiveDef: FieldDef = val !== undefined
                        ? field
                        : { ...field, type: field.type === 'readonly' ? 'readonly' : field.type };
                      return (
                        <div key={field.key} className="px-4 py-3">
                          <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1.5">
                            {field.label}
                            <span className="ml-1.5 text-[10px] font-mono text-gray-400">({field.key})</span>
                          </label>
                          <SmartField
                            def={effectiveDef}
                            value={val ?? (field.type === 'boolean' ? false : field.type === 'tags' ? [] : '')}
                            onChange={updateField}
                          />
                          {field.hint && field.type !== 'tags' && (
                            <p className="text-[11px] text-gray-400 mt-1">{field.hint}</p>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            ))
          ) : (
            // Auto-detect all fields
            <div className="rounded-xl border border-gray-100 dark:border-gray-700/50 divide-y divide-gray-100 dark:divide-gray-700/30">
              {Object.entries(formData).map(([key, val]) => {
                const detectedType = autoDetectType(key, val);
                const def: FieldDef = { key, label: key, type: detectedType };
                return (
                  <div key={key} className="px-4 py-3">
                    <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1.5 font-mono">{key}</label>
                    <SmartField def={def} value={val} onChange={updateField} />
                  </div>
                );
              })}
            </div>
          )}

          {/* Extra fields not in schema */}
          {schema && extraEntries.length > 0 && (
            <div className="rounded-xl border border-gray-100 dark:border-gray-700/50 overflow-hidden">
              <div className="px-4 py-2.5 bg-gray-50 dark:bg-white/[0.03]">
                <span className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">ฟิลด์อื่นๆ ในเอกสาร</span>
              </div>
              <div className="divide-y divide-gray-100 dark:divide-gray-700/30">
                {extraEntries.map(([key, val]) => {
                  const detectedType = autoDetectType(key, val);
                  const def: FieldDef = { key, label: key, type: detectedType };
                  return (
                    <div key={key} className="px-4 py-3 flex items-start gap-3">
                      <div className="flex-1">
                        <label className="block text-xs font-mono font-medium text-gray-500 dark:text-gray-400 mb-1.5">{key}</label>
                        <SmartField def={def} value={val} onChange={updateField} />
                      </div>
                      <button
                        type="button"
                        title="ลบฟิลด์นี้"
                        onClick={() => setFormData(prev => { const next = { ...prev }; delete next[key]; return next; })}
                        className="mt-6 p-1.5 text-gray-300 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-500/10 rounded-lg transition-colors"
                      >
                        <FaTrashAlt size={11} />
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Add new field */}
          <div className="flex gap-2 items-center bg-gray-50 dark:bg-white/[0.02] rounded-xl px-4 py-3 border border-dashed border-gray-200 dark:border-gray-700">
            <FaPlus size={11} className="text-gray-400 flex-shrink-0" />
            <input
              type="text"
              value={newFieldKey}
              onChange={e => setNewFieldKey(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addNewField(); } }}
              placeholder="ชื่อฟิลด์ใหม่ (เช่น note, extraInfo)"
              className="flex-1 bg-transparent text-xs text-gray-700 dark:text-gray-300 placeholder-gray-400 focus:outline-none"
            />
            <button type="button" onClick={addNewField} className="text-xs px-2.5 py-1 bg-gray-200 dark:bg-gray-600 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-indigo-100 dark:hover:bg-indigo-500/20 hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors">
              เพิ่มฟิลด์
            </button>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 px-5 py-4 border-t border-gray-200 dark:border-gray-700 flex-shrink-0">
          <button onClick={onClose} className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-700 rounded-xl hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors">
            ยกเลิก
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="px-5 py-2 text-sm font-medium text-white bg-indigo-600 rounded-xl hover:bg-indigo-700 disabled:opacity-60 transition-colors"
          >
            {saving ? 'กำลังบันทึก...' : mode === 'add' ? 'เพิ่มข้อมูล' : 'บันทึกการแก้ไข'}
          </button>
        </div>
      </div>
    </div>
  );
};

// ═══════════════════════════════════════════════════════════════
// VIEW MODAL (full JSON read-only)
// ═══════════════════════════════════════════════════════════════
const ViewModal: React.FC<{ docItem: { id: string; data: Record<string, unknown> }; displayName: string; onClose: () => void }> = ({ docItem, displayName, onClose }) => {
  const json = JSON.stringify(docItem.data, null, 2);
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="bg-white dark:bg-[#2a2b2f] rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between p-5 border-b border-gray-200 dark:border-gray-700">
          <div>
            <h2 className="font-bold text-gray-900 dark:text-white">{displayName}</h2>
            <p className="text-[10px] font-mono text-gray-400 mt-0.5">ID: {docItem.id}</p>
          </div>
          <div className="flex gap-2">
            <button onClick={() => { navigator.clipboard.writeText(json); Swal.fire({ icon: 'success', title: 'คัดลอกแล้ว', timer: 800, showConfirmButton: false }); }} className="p-2 text-gray-400 hover:text-indigo-500 hover:bg-indigo-50 dark:hover:bg-indigo-500/10 rounded-lg transition-colors">
              <FaCopy size={14} />
            </button>
            <button onClick={onClose} className="p-2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-white/5 rounded-lg transition-colors">
              <FaTimes size={16} />
            </button>
          </div>
        </div>
        <div className="flex-1 overflow-y-auto p-5">
          <pre className="text-xs font-mono text-gray-800 dark:text-gray-200 whitespace-pre-wrap break-all bg-gray-50 dark:bg-[#1e1f21] p-4 rounded-xl">{json}</pre>
        </div>
      </div>
    </div>
  );
};

// ═══════════════════════════════════════════════════════════════
// DOC ROW
// ═══════════════════════════════════════════════════════════════
interface DocRowProps {
  docItem: { id: string; data: Record<string, unknown> };
  colKey: string;
  checked: boolean;
  onToggle: () => void;
  onView: () => void;
  onEdit: () => void;
  onDelete: () => void;
  subcollections?: SubcollectionDef[];
  onDrill?: (sub: SubcollectionDef) => void;
}

const DocRow: React.FC<DocRowProps> = ({ docItem, colKey, checked, onToggle, onView, onEdit, onDelete, subcollections, onDrill }) => {
  const displayName = getDisplayName(docItem.data, docItem.id);
  const subtitle = getDisplaySubtitle(docItem.data, colKey);
  const isNameSameAsId = displayName === docItem.id;
  const avatarColor = AVATAR_COLORS[colKey] || 'bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400';
  const initials = isNameSameAsId ? '#' : getInitials(displayName);

  return (
    <div
      className={`flex items-center gap-3 px-4 py-3 transition-colors border-b border-gray-100 dark:border-gray-700/40 last:border-0 group cursor-pointer select-none
        ${checked ? 'bg-indigo-50 dark:bg-indigo-500/10' : 'hover:bg-gray-50 dark:hover:bg-white/[0.02]'}`}
      onClick={onToggle}
    >
      {/* Checkbox */}
      <div className="flex-shrink-0" onClick={e => e.stopPropagation()}>
        <input
          type="checkbox"
          checked={checked}
          onChange={onToggle}
          className="w-4 h-4 rounded border-gray-300 dark:border-gray-600 text-indigo-500 accent-indigo-500 cursor-pointer"
        />
      </div>

      {/* Avatar */}
      <div className={`w-9 h-9 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 ${avatarColor}`}>
        {initials}
      </div>

      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-gray-900 dark:text-white truncate leading-tight">{displayName}</p>
        {subtitle && <p className="text-xs text-gray-500 dark:text-gray-400 truncate mt-0.5">{subtitle}</p>}
        <p className="text-[10px] text-gray-400 dark:text-gray-600 font-mono mt-0.5 truncate">ID: {docItem.id}</p>
      </div>

      <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity" onClick={e => e.stopPropagation()}>
        {subcollections && subcollections.length > 0 && onDrill && (
          subcollections.length === 1 ? (
            <button onClick={() => onDrill(subcollections[0])} title={`ดู${subcollections[0].label}`} className="p-1.5 rounded-lg text-gray-400 hover:text-violet-500 hover:bg-violet-50 dark:hover:bg-violet-500/10 transition-colors">
              <FaChevronRight size={12} />
            </button>
          ) : (
            <div className="relative group/sub">
              <button title="ดูข้อมูลย่อย" className="p-1.5 rounded-lg text-gray-400 hover:text-violet-500 hover:bg-violet-50 dark:hover:bg-violet-500/10 transition-colors">
                <FaChevronRight size={12} />
              </button>
              <div className="hidden group-hover/sub:block absolute right-0 top-full mt-1 z-10 bg-white dark:bg-[#2a2b2f] rounded-lg shadow-lg border border-gray-100 dark:border-gray-700 py-1 min-w-[160px]">
                {subcollections.map(sub => (
                  <button key={sub.key} onClick={() => onDrill(sub)} className="block w-full text-left px-3 py-1.5 text-xs text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-white/5 whitespace-nowrap">
                    {sub.label}
                  </button>
                ))}
              </div>
            </div>
          )
        )}
        <button onClick={onView} title="ดู JSON" className="p-1.5 rounded-lg text-gray-400 hover:text-sky-500 hover:bg-sky-50 dark:hover:bg-sky-500/10 transition-colors">
          <FaEye size={12} />
        </button>
        <button onClick={onEdit} title="แก้ไข" className="p-1.5 rounded-lg text-gray-400 hover:text-amber-500 hover:bg-amber-50 dark:hover:bg-amber-500/10 transition-colors">
          <FaEdit size={12} />
        </button>
        <button onClick={onDelete} title="ลบ" className="p-1.5 rounded-lg text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-500/10 transition-colors">
          <FaTrashAlt size={12} />
        </button>
      </div>
    </div>
  );
};

// ═══════════════════════════════════════════════════════════════
// MAIN PAGE
// ═══════════════════════════════════════════════════════════════
interface DrillState { parentDocId: string; parentLabel: string; subCol: SubcollectionDef; }

const SchoolDataExplorerPage: React.FC = () => {
  const { schoolId } = useParams<{ schoolId: string }>();
  const [selectedCollection, setSelectedCollection] = useState<CollectionDef | null>(null);
  const [drill, setDrill] = useState<DrillState | null>(null);
  const [openCategories, setOpenCategories] = useState<Record<string, boolean>>({
    personnel: true, students: true, academic: false, activities: false,
    calendar: false, attendance: false, substitution: false, support: false, system: false,
  });
  const [docs, setDocs] = useState<{ id: string; data: Record<string, unknown> }[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [lastVisible, setLastVisible] = useState<QueryDocumentSnapshot | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [pageStack, setPageStack] = useState<(QueryDocumentSnapshot | null)[]>([null]);
  const [currentPage, setCurrentPage] = useState(0);
  const [viewDocItem, setViewDocItem] = useState<{ id: string; data: Record<string, unknown> } | null>(null);
  const [editDoc, setEditDoc] = useState<{ doc: { id: string; data: Record<string, unknown> } | null; mode: 'add' | 'edit' } | null>(null);
  const [schoolName, setSchoolName] = useState('');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkDeleting, setBulkDeleting] = useState(false);
  const selectAllRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!schoolId) return;
    getDoc(doc(db, 'school-settings', schoolId)).then(s => {
      if (s.exists()) setSchoolName(s.data()?.schoolName || schoolId);
    });
  }, [schoolId]);

  // Path segments ของ collection ที่กำลังดูอยู่ตอนนี้ — ปกติคือ [selectedCollection.key] เดียว
  // แต่ถ้าไดรลลงไปดู subcollection ซ้อน (เช่น courses/{id}/grades) จะเป็น 3 segments
  const getPathArgs = useCallback((col: CollectionDef | null, d: DrillState | null): string[] => {
    if (!col) return [];
    return d ? [col.key, d.parentDocId, d.subCol.key] : [col.key];
  }, []);

  const effectiveColKey = drill ? drill.subCol.key : (selectedCollection?.key ?? '');

  const loadPage = useCallback(async (pathArgs: string[], cursor: QueryDocumentSnapshot | null) => {
    if (!schoolId || pathArgs.length === 0) return;
    setLoading(true);
    try {
      const colRef = collection(db, 'school-settings', schoolId, ...pathArgs);
      const q = cursor
        ? query(colRef, orderBy('__name__'), startAfter(cursor), limit(PAGE_SIZE + 1))
        : query(colRef, orderBy('__name__'), limit(PAGE_SIZE + 1));
      const snap = await getDocs(q);
      const fetched = snap.docs.slice(0, PAGE_SIZE).map(d => ({ id: d.id, data: d.data() as Record<string, unknown> }));
      setDocs(fetched);
      setHasMore(snap.docs.length > PAGE_SIZE);
      setLastVisible(snap.docs.length > PAGE_SIZE ? snap.docs[PAGE_SIZE - 1] : null);
    } catch (err: any) {
      Swal.fire('ข้อผิดพลาด', err?.message || 'โหลดไม่ได้', 'error');
      setDocs([]);
    } finally { setLoading(false); }
  }, [schoolId]);

  useEffect(() => {
    if (!selectedCollection) return;
    setPageStack([null]); setCurrentPage(0);
    setSelectedIds(new Set());
    loadPage(getPathArgs(selectedCollection, drill), null);
  }, [selectedCollection, drill, loadPage, getPathArgs]);

  const handleDrillInto = (docItem: { id: string; data: Record<string, unknown> }, sub: SubcollectionDef) => {
    setDrill({ parentDocId: docItem.id, parentLabel: getDisplayName(docItem.data, docItem.id), subCol: sub });
  };
  const exitDrill = () => setDrill(null);

  const toggleSelect = (id: string) =>
    setSelectedIds(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });

  const toggleSelectAll = () => {
    const allIds = filteredDocs.map(d => d.id);
    const allSelected = allIds.length > 0 && allIds.every(id => selectedIds.has(id));
    if (allSelected) {
      setSelectedIds(prev => { const next = new Set(prev); allIds.forEach(id => next.delete(id)); return next; });
    } else {
      setSelectedIds(prev => { const next = new Set(prev); allIds.forEach(id => next.add(id)); return next; });
    }
  };

  const handleBulkDelete = async () => {
    if (!schoolId || !selectedCollection || selectedIds.size === 0) return;
    const count = selectedIds.size;
    const res = await Swal.fire({
      title: `ลบ ${count} รายการ?`,
      html: `<p style="font-size:14px;color:#6b7280;margin-bottom:8px">เลือก <b style="color:#111827">${count} รายการ</b> จาก <b>${selectedCollection.label}</b></p><p style="font-size:13px;color:#ef4444;font-weight:600">การลบนี้ไม่สามารถย้อนกลับได้</p>`,
      icon: 'warning', showCancelButton: true,
      confirmButtonText: `ลบ ${count} รายการ`, cancelButtonText: 'ยกเลิก', confirmButtonColor: '#ef4444',
    });
    if (!res.isConfirmed) return;
    setBulkDeleting(true);
    try {
      const pathArgs = getPathArgs(selectedCollection, drill);
      const ids = Array.from(selectedIds);
      const CHUNK = 400;
      for (let i = 0; i < ids.length; i += CHUNK) {
        const batch = writeBatch(db);
        ids.slice(i, i + CHUNK).forEach(id => {
          batch.delete(doc(db, 'school-settings', schoolId, ...pathArgs, id));
        });
        await batch.commit();
      }
      setSelectedIds(new Set());
      Swal.fire({ icon: 'success', title: 'ลบสำเร็จ', html: `<p>ลบ <b>${count} รายการ</b> ออกจากระบบแล้ว</p>`, timer: 2000, showConfirmButton: false });
      loadPage(pathArgs, pageStack[currentPage]);
    } catch (err: any) {
      Swal.fire('เกิดข้อผิดพลาด', err?.message || 'ลบไม่สำเร็จ', 'error');
    } finally {
      setBulkDeleting(false);
    }
  };

  const handleNextPage = () => {
    if (!selectedCollection || !lastVisible) return;
    const ns = [...pageStack, lastVisible]; setPageStack(ns); setCurrentPage(p => p + 1);
    loadPage(getPathArgs(selectedCollection, drill), lastVisible);
  };
  const handlePrevPage = () => {
    if (!selectedCollection || currentPage === 0) return;
    const ns = pageStack.slice(0, -1); setPageStack(ns); setCurrentPage(p => p - 1);
    loadPage(getPathArgs(selectedCollection, drill), ns[ns.length - 1]);
  };

  const filteredDocs = searchTerm.trim()
    ? docs.filter(d => {
        const lo = searchTerm.toLowerCase();
        return d.id.toLowerCase().includes(lo)
          || getDisplayName(d.data, d.id).toLowerCase().includes(lo)
          || JSON.stringify(d.data).toLowerCase().includes(lo);
      })
    : docs;

  const handleSave = async (data: Record<string, unknown>, customId: string) => {
    if (!schoolId || !selectedCollection) return;
    const pathArgs = getPathArgs(selectedCollection, drill);
    if (editDoc?.mode === 'edit' && editDoc.doc) {
      await setDoc(doc(db, 'school-settings', schoolId, ...pathArgs, editDoc.doc.id), data, { merge: false });
      Swal.fire({ icon: 'success', title: 'บันทึกสำเร็จ', timer: 1200, showConfirmButton: false });
    } else {
      if (customId.trim()) await setDoc(doc(db, 'school-settings', schoolId, ...pathArgs, customId.trim()), data);
      else await addDoc(collection(db, 'school-settings', schoolId, ...pathArgs), data);
      Swal.fire({ icon: 'success', title: 'เพิ่มข้อมูลสำเร็จ', timer: 1200, showConfirmButton: false });
    }
    loadPage(pathArgs, pageStack[currentPage]);
  };

  const handleDelete = async (docItem: { id: string; data: Record<string, unknown> }) => {
    if (!schoolId || !selectedCollection) return;
    const pathArgs = getPathArgs(selectedCollection, drill);
    const name = getDisplayName(docItem.data, docItem.id);
    const res = await Swal.fire({
      title: 'ยืนยันการลบ',
      html: `<p style="font-size:15px;font-weight:600;margin-bottom:4px">${name}</p><p style="font-size:11px;color:#9ca3af;font-family:monospace;margin-bottom:10px">ID: ${docItem.id}</p><p style="font-size:13px;color:#ef4444">เอกสารทั้งหมดรวมถึง UID จะถูกลบถาวร</p>`,
      icon: 'warning', showCancelButton: true,
      confirmButtonText: 'ลบออกเลย', cancelButtonText: 'ยกเลิก', confirmButtonColor: '#ef4444',
    });
    if (!res.isConfirmed) return;
    try {
      await deleteDoc(doc(db, 'school-settings', schoolId, ...pathArgs, docItem.id));
      Swal.fire({ icon: 'success', title: 'ลบสำเร็จ', html: `<p>ลบ <b>${name}</b> ออกแล้ว</p>`, timer: 1500, showConfirmButton: false });
      loadPage(pathArgs, pageStack[currentPage]);
    } catch (err: any) { Swal.fire('ข้อผิดพลาด', err?.message, 'error'); }
  };

  return (
    <MainLayout>
      <div className="p-4 sm:p-6 text-gray-900 dark:text-white transition-colors duration-300 min-h-full">
        {/* Header */}
        <div className="mb-5 flex flex-wrap items-center gap-3 justify-between">
          <div className="flex items-center gap-3">
            <Link to={`/owner/schools/${schoolId}`} className="text-indigo-600 dark:text-indigo-400 hover:text-indigo-500 text-sm flex items-center gap-1">
              <FaChevronLeft size={11} /> กลับ
            </Link>
            <span className="text-gray-300 dark:text-gray-600">|</span>
            <div className="flex items-center gap-2">
              <FaDatabase className="text-indigo-500" size={17} />
              <div>
                <h1 className="text-base font-bold leading-tight">ดูข้อมูลทั้งหมดในโรงเรียน</h1>
                {schoolName && <p className="text-xs text-gray-500 dark:text-gray-400">{schoolName}</p>}
              </div>
            </div>
          </div>
          {selectedCollection && (
            <button onClick={() => setEditDoc({ doc: null, mode: 'add' })} className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 rounded-xl transition-colors">
              <FaPlus size={12} /> เพิ่มข้อมูลใหม่
            </button>
          )}
        </div>

        <div className="flex gap-4 h-[calc(100vh-155px)]">
          {/* Sidebar */}
          <aside className="w-56 flex-shrink-0 bg-white dark:bg-[#2a2b2f] rounded-2xl shadow-sm overflow-y-auto">
            <div className="p-3">
              {CATEGORIES.map(cat => (
                <div key={cat.key} className="mb-1">
                  <button onClick={() => setOpenCategories(p => ({ ...p, [cat.key]: !p[cat.key] }))} className="flex items-center justify-between w-full px-3 py-2 rounded-lg text-[11px] font-semibold text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-white/5 transition-colors uppercase tracking-wider">
                    <span>{cat.label}</span>
                    {openCategories[cat.key] ? <FaChevronDown size={8} /> : <FaChevronRight size={8} />}
                  </button>
                  {openCategories[cat.key] && (
                    <div className="ml-1 mt-0.5 flex flex-col gap-0.5">
                      {cat.collections.map(col => (
                        <button key={col.key} onClick={() => { setSelectedCollection(col); setDrill(null); setSearchTerm(''); }}
                          className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs text-left transition-colors w-full ${selectedCollection?.key === col.key ? 'bg-indigo-50 dark:bg-indigo-500/20 text-indigo-600 dark:text-indigo-400 font-semibold border-l-2 border-indigo-500' : 'text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-white/5'}`}>
                          <FaDatabase size={8} className="flex-shrink-0 opacity-50" />
                          <span className="truncate">{col.label}</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </aside>

          {/* Main */}
          <div className="flex-1 flex flex-col bg-white dark:bg-[#2a2b2f] rounded-2xl shadow-sm overflow-hidden">
            {!selectedCollection ? (
              <div className="flex-1 flex flex-col items-center justify-center text-center gap-3">
                <FaDatabase size={40} className="text-gray-300 dark:text-gray-600" />
                <p className="text-gray-400 dark:text-gray-500 text-sm">เลือก Collection ด้านซ้ายเพื่อดูข้อมูล</p>
              </div>
            ) : (
              <>
                <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 dark:border-gray-700/50 flex-shrink-0">
                  <div className="flex items-center gap-3">
                    <input
                      ref={el => {
                        selectAllRef.current = el;
                        if (el) {
                          const selectedCount = filteredDocs.filter(d => selectedIds.has(d.id)).length;
                          el.indeterminate = selectedCount > 0 && selectedCount < filteredDocs.length;
                        }
                      }}
                      type="checkbox"
                      checked={filteredDocs.length > 0 && filteredDocs.every(d => selectedIds.has(d.id))}
                      onChange={toggleSelectAll}
                      title="เลือก/ยกเลิกทั้งหมด"
                      className="w-4 h-4 rounded accent-indigo-500 cursor-pointer"
                    />
                    <div>
                      {drill ? (
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <button onClick={exitDrill} className="text-xs text-indigo-500 hover:underline font-semibold flex items-center gap-1">
                            <FaChevronLeft size={9} /> {selectedCollection.label}
                          </button>
                          <span className="text-gray-300 dark:text-gray-600 text-xs">›</span>
                          <span className="text-xs text-gray-500 dark:text-gray-400 truncate max-w-[140px]">{drill.parentLabel}</span>
                          <span className="text-gray-300 dark:text-gray-600 text-xs">›</span>
                          <h2 className="font-bold text-sm text-gray-900 dark:text-white">{drill.subCol.label}</h2>
                        </div>
                      ) : (
                        <h2 className="font-bold text-sm text-gray-900 dark:text-white">{selectedCollection.label}</h2>
                      )}
                      <p className="text-[10px] text-gray-400 font-mono mt-0.5">…/{getPathArgs(selectedCollection, drill).join('/')}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="relative">
                      <FaSearch size={11} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                      <input type="text" value={searchTerm} onChange={e => setSearchTerm(e.target.value)} placeholder="ค้นหา..." className="pl-8 pr-3 py-1.5 text-xs rounded-lg border border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-[#1e1f21] text-gray-800 dark:text-gray-200 focus:outline-none focus:ring-2 focus:ring-indigo-400 w-40" />
                    </div>
                    <button onClick={() => loadPage(getPathArgs(selectedCollection, drill), pageStack[currentPage])} className="p-2 rounded-lg text-gray-400 hover:text-indigo-500 hover:bg-gray-50 dark:hover:bg-white/5 transition-colors">
                      <FaSync size={12} className={loading ? 'animate-spin' : ''} />
                    </button>
                  </div>
                </div>

                {selectedIds.size > 0 && (
                  <div className="flex items-center justify-between px-4 py-2 bg-indigo-50 dark:bg-indigo-500/10 border-b border-indigo-100 dark:border-indigo-500/20 flex-shrink-0">
                    <span className="text-xs font-medium text-indigo-700 dark:text-indigo-300">
                      เลือก {selectedIds.size} รายการ
                    </span>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => setSelectedIds(new Set())}
                        className="text-xs text-indigo-600 dark:text-indigo-400 hover:underline"
                      >
                        ยกเลิกทั้งหมด
                      </button>
                      <button
                        onClick={handleBulkDelete}
                        disabled={bulkDeleting}
                        className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold bg-red-500 hover:bg-red-600 disabled:opacity-50 text-white rounded-lg transition-colors"
                      >
                        <FaTrashAlt size={10} />
                        {bulkDeleting ? 'กำลังลบ...' : `ลบ ${selectedIds.size} รายการ`}
                      </button>
                    </div>
                  </div>
                )}

                <div className="flex-1 overflow-y-auto">
                  {loading ? (
                    <div className="p-3 space-y-2">
                      {[...Array(8)].map((_, i) => (
                        <div key={`skeleton-${i}`} className="h-10 w-full rounded-lg bg-gray-200 dark:bg-gray-700 animate-pulse"></div>
                      ))}
                    </div>
                  ) : filteredDocs.length === 0 ? (
                    <div className="flex flex-col items-center justify-center h-32 text-gray-400 dark:text-gray-500 gap-2">
                      <FaDatabase size={28} className="opacity-40" />
                      <p className="text-sm">{searchTerm ? 'ไม่พบ' : 'ยังไม่มีข้อมูล'}</p>
                    </div>
                  ) : (
                    filteredDocs.map(d => (
                      <DocRow key={d.id} docItem={d} colKey={effectiveColKey}
                        checked={selectedIds.has(d.id)}
                        onToggle={() => toggleSelect(d.id)}
                        onView={() => setViewDocItem(d)}
                        onEdit={() => setEditDoc({ doc: d, mode: 'edit' })}
                        onDelete={() => handleDelete(d)}
                        subcollections={!drill ? selectedCollection.subcollections : undefined}
                        onDrill={sub => handleDrillInto(d, sub)}
                      />
                    ))
                  )}
                </div>

                {!searchTerm && (
                  <div className="flex items-center justify-between px-4 py-2.5 border-t border-gray-100 dark:border-gray-700/50 text-xs text-gray-400 flex-shrink-0">
                    <span>หน้า {currentPage + 1} · {filteredDocs.length} รายการ</span>
                    <div className="flex gap-2">
                      <button onClick={handlePrevPage} disabled={currentPage === 0 || loading} className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-gray-100 dark:bg-gray-700 disabled:opacity-40 hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors disabled:cursor-not-allowed">
                        <FaChevronLeft size={9} /> ก่อนหน้า
                      </button>
                      <button onClick={handleNextPage} disabled={!hasMore || loading} className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-gray-100 dark:bg-gray-700 disabled:opacity-40 hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors disabled:cursor-not-allowed">
                        ถัดไป <FaChevronRightIcon size={9} />
                      </button>
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      </div>

      {viewDocItem && (
        <ViewModal docItem={viewDocItem} displayName={getDisplayName(viewDocItem.data, viewDocItem.id)} onClose={() => setViewDocItem(null)} />
      )}

      {editDoc && selectedCollection && (
        <SmartFormModal
          colKey={effectiveColKey}
          colLabel={drill ? `${selectedCollection.label} › ${drill.parentLabel} › ${drill.subCol.label}` : selectedCollection.label}
          docItem={editDoc.doc}
          mode={editDoc.mode}
          onSave={handleSave}
          onClose={() => setEditDoc(null)}
        />
      )}
    </MainLayout>
  );
};

export default SchoolDataExplorerPage;
