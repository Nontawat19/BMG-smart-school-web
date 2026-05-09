import React from "react";
import { useParams, Link, Navigate, useLocation } from "react-router-dom";
import { doc, onSnapshot } from "firebase/firestore";
import { firestore as db } from "@/firebase";
import BackButton from "@/components/Shared/BackButton";
import { usePermissions } from "@/hooks/usePermissions";
import MainLayout from "@/layouts/MainLayout";
import {
  ChevronRight,
  BookOpen,
  CalendarDays,
  School,
  UserCheck,
  Calendar,
  Users,
  User,
  GraduationCap,
  UserCog,
  ClipboardCheck,
  ClipboardList,
  Clock,
  Calculator,
  Trophy,
  BarChart3,
  GitMerge,
  Settings,
  ListChecks,
  FileText,
  Home,
  ShieldCheck,
  Search,
  HeartPulse,
  MapPin,
  ArrowRight,
  History
} from "lucide-react";
import { ROLES } from "@/constants/roles";

interface HubItem {
  title: string;
  description: string;
  icon: React.ReactNode;
  path: string;
  colorClass: string;
  allowedRoles?: string[];
  featureKey?: string;
}

interface HubConfig {
  id: string;
  title: string;
  description: string;
  items: HubItem[];
}

const HubPage: React.FC = () => {
  const { hubType: paramHubType } = useParams<{ hubType: string }>();
  const location = useLocation();
  const { user: currentUser, roles: userRoles, hasRole, STAFF_ACCESS, ACADEMIC_MANAGEMENT, TEACHER_OPERATIONAL, OWNER_ONLY } = usePermissions();
  const [settings, setSettings] = React.useState<any>({});
  
  // Handle static routes and "all" mode
  let hubType = paramHubType;
  const isMasterHub = location.pathname === "/academic-admin" || location.pathname.includes("/academic/hub/all");
  
  if (!hubType && !isMasterHub) {
    if (location.pathname.includes('/student-support/hub')) hubType = 'support';
    if (location.pathname.includes('/owner/hub')) hubType = 'owner';
  }

  const schoolId = (currentUser as any)?.schoolId;

  React.useEffect(() => {
    if (schoolId) {
      const unsub = onSnapshot(doc(db, "school-settings", schoolId), (docSnap) => {
        if (docSnap.exists()) {
          const data = docSnap.data();
          setSettings(data.academicSettings || {});
        }
      });
      return () => unsub();
    }
  }, [schoolId]);

  const isEnabled = (featureKey?: string) => {
    if (!featureKey) return true;
    return settings[featureKey] !== false;
  };

  const checkAccess = (item: HubItem) => {
    if (item.featureKey && !isEnabled(item.featureKey)) return false;
    if (!item.allowedRoles) return true;
    return hasRole(item.allowedRoles);
  };

  const hubConfigs: Record<string, HubConfig> = {
    registration: {
      id: "registration",
      title: "ทะเบียน",
      description: "จัดการข้อมูลหลักสูตร การลงทะเบียน และสรุปข้อมูลนักเรียน",
      items: [
        {
          title: "จัดการหลักสูตร",
          description: "เพิ่ม ลบ และแก้ไขหลักสูตรการสอน",
          icon: <BookOpen size={24} />,
          path: "/academic/course-management",
          colorClass: "bg-blue-100 text-blue-600 dark:bg-blue-500/20 dark:text-blue-400",
          allowedRoles: ACADEMIC_MANAGEMENT
        },
        {
          title: "หลักสูตร",
          description: "ดูและแก้ไขข้อมูลหลักสูตรทั้งหมดในระบบ",
          icon: <ClipboardList size={24} />,
          path: "/academic/view-courses",
          colorClass: "bg-lime-100 text-lime-600 dark:bg-lime-500/20 dark:text-lime-400",
          allowedRoles: STAFF_ACCESS
        },
        {
          title: "นำเข้าหลักสูตร (Excel)",
          description: "นำข้อมูลวิชาเข้าสู่ระบบผ่านไฟล์ Excel",
          icon: <FileText size={24} />,
          path: "/academic/import-courses",
          colorClass: "bg-emerald-100 text-emerald-600 dark:bg-emerald-500/20 dark:text-emerald-400",
          allowedRoles: ACADEMIC_MANAGEMENT
        },
        {
          title: "จัดการกลุ่มสาระและตัวชี้วัด",
          description: "กำหนดรหัสและรายละเอียดตัวชี้วัดสำหรับรายวิชา",
          icon: <ListChecks size={24} />,
          path: "/academic/subject-groups",
          colorClass: "bg-indigo-100 text-indigo-600 dark:bg-indigo-500/20 dark:text-indigo-400",
          allowedRoles: ACADEMIC_MANAGEMENT
        },
        {
          title: "ลงทะเบียนวิชา (ครู/สถานที่)",
          description: "กำหนดครูผู้สอนและห้องเรียนสำหรับแต่ละวิชา",
          icon: <UserCheck size={24} />,
          path: "/academic/course-assignment",
          colorClass: "bg-indigo-100 text-indigo-600 dark:bg-indigo-500/20 dark:text-indigo-400",
          allowedRoles: ACADEMIC_MANAGEMENT
        },
        {
          title: "ลงทะเบียนเรียน (นักเรียน)",
          description: "ลงทะเบียนนักเรียนเข้าสู่รายวิชา",
          icon: <Users size={24} />,
          path: "/academic/course-enrollment",
          colorClass: "bg-emerald-100 text-emerald-600 dark:bg-emerald-500/20 dark:text-emerald-400",
          allowedRoles: ACADEMIC_MANAGEMENT
        },
        {
          title: "สรุปการลงทะเบียน",
          description: "ดูสถิติและรายชื่อการลงทะเบียนวิชาเรียน",
          icon: <ClipboardList size={24} />,
          path: "/academic/enrollment-list",
          colorClass: "bg-blue-100 text-blue-600 dark:bg-blue-500/20 dark:text-blue-400",
          allowedRoles: ACADEMIC_MANAGEMENT
        },
        {
          title: "จัดการระบบย้ายห้อง",
          description: "ย้ายนักเรียนจากห้องปัจจุบันไปยังห้องใหม่",
          icon: <GitMerge size={24} />,
          path: "/academic/room-transfer",
          colorClass: "bg-emerald-100 text-emerald-600 dark:bg-emerald-500/20 dark:text-emerald-400",
          allowedRoles: ACADEMIC_MANAGEMENT
        },
        {
          title: "ระบบเลื่อนชั้นและจบการศึกษา",
          description: "จัดการการเลื่อนชั้น, ซ้ำชั้น, จำหน่ายออก และอนุมัติจบการศึกษา",
          icon: <GraduationCap size={24} />,
          path: "/academic/graduation-management",
          colorClass: "bg-rose-100 text-rose-600 dark:bg-rose-500/20 dark:text-rose-400",
          allowedRoles: ACADEMIC_MANAGEMENT
        }
      ]
    },
    scheduling: {
      id: "scheduling",
      title: "ตารางสอน",
      description: "จัดการตารางเรียนตารางสอนสำหรับครูและนักเรียน",
      items: [
        {
          title: "จัดการตารางสอน",
          description: "จัดตารางสอนสำหรับครูและชั้นเรียน",
          icon: <CalendarDays size={24} />,
          path: "/academic/teacher-schedule",
          colorClass: "bg-indigo-100 text-indigo-600 dark:bg-indigo-500/20 dark:text-indigo-400",
          allowedRoles: ACADEMIC_MANAGEMENT
        },
        {
          title: "ตารางเรียน (นักเรียน)",
          description: "ดูตารางเรียนของแต่ละชั้นเรียน",
          icon: <School size={24} />,
          path: "/academic/student-schedule",
          colorClass: "bg-pink-100 text-pink-600 dark:bg-pink-500/20 dark:text-pink-400",
          allowedRoles: STAFF_ACCESS
        },
        {
          title: "ตารางสอน (ครู)",
          description: "ดูตารางสอนของครูแต่ละคน",
          icon: <UserCheck size={24} />,
          path: "/academic/teacher-schedule-view",
          colorClass: "bg-orange-100 text-orange-600 dark:bg-orange-500/20 dark:text-orange-400",
          allowedRoles: STAFF_ACCESS
        },
        {
          title: "จัดการสอนแทน",
          description: "จัดหาครูสอนแทนสำหรับครูที่ลา",
          icon: <ClipboardList size={24} />,
          path: "/academic/substitute-management",
          colorClass: "bg-teal-100 text-teal-600 dark:bg-teal-500/20 dark:text-teal-400",
          allowedRoles: ACADEMIC_MANAGEMENT
        }
      ]
    },
    students: {
      id: "students",
      title: "ข้อมูลนักเรียน",
      description: "จัดการข้อมูลประวัติและสถานะนักเรียน",
      items: [
        {
          title: "ข้อมูลนักเรียน",
          description: "จัดการข้อมูลประวัตินักเรียนรายบุคคล",
          icon: <User size={24} />,
          path: schoolId ? `/school/${schoolId}/students` : "/students",
          colorClass: "bg-yellow-100 text-yellow-600 dark:bg-yellow-500/20 dark:text-yellow-400",
          allowedRoles: STAFF_ACCESS
        },
        {
          title: "ใบลานักเรียน",
          description: "ยื่นคำขอลาและดูประวัติการลาของนักเรียน",
          icon: <FileText size={24} />,
          path: "/attendance/leave-request",
          colorClass: "bg-rose-100 text-rose-600 dark:bg-rose-500/20 dark:text-rose-400",
          allowedRoles: STAFF_ACCESS
        }
      ]
    },
    personnel_info: {
      id: "personnel_info",
      title: "ข้อมูลบุคลากร",
      description: "จัดการข้อมูลประวัติครูและบุคลากรในโรงเรียน",
      items: [
        {
          title: "ข้อมูลบุคลากร",
          description: "จัดการข้อมูลประวัติครูและบุคลากร",
          icon: <Users size={24} />,
          path: schoolId ? `/school/${schoolId}/teachers` : "/teachers",
          colorClass: "bg-cyan-100 text-cyan-600 dark:bg-cyan-500/20 dark:text-cyan-400",
          allowedRoles: STAFF_ACCESS
        },
        {
          title: "ใบลาครู",
          description: "ยื่นคำขอลาและดูประวัติการลาของครู",
          icon: <UserCog size={24} />,
          path: "/attendance/teacher-leave-request",
          colorClass: "bg-violet-100 text-violet-600 dark:bg-violet-500/20 dark:text-violet-400",
          allowedRoles: STAFF_ACCESS
        },
        {
          title: "ใบขอไปราชการ",
          description: "ยื่นคำขอไปราชการและดูประวัติ",
          icon: <ClipboardCheck size={24} />,
          path: schoolId ? `/school/${schoolId}/official-travel-request` : "#",
          colorClass: "bg-emerald-100 text-emerald-600 dark:bg-emerald-500/20 dark:text-emerald-400",
          allowedRoles: STAFF_ACCESS
        },
        {
          title: "เช็คเวลาวันนี้ (ครู)",
          description: "ตรวจสอบการลงเวลาเข้า-ออกงานประจำวันของบุคลากร",
          icon: <UserCheck size={24} />,
          path: "/human-resources/teacher-attendance-today",
          colorClass: "bg-green-100 text-green-600 dark:bg-green-500/20 dark:text-green-400",
          allowedRoles: STAFF_ACCESS
        },
        {
          title: "สรุปการลงเวลาครู",
          description: "รายงานสถิติการลงเวลาเข้า-ออกงานของบุคลากร",
          icon: <Clock size={24} />,
          path: "/human-resources/teacher-attendance-summary",
          colorClass: "bg-indigo-100 text-indigo-600 dark:bg-indigo-500/20 dark:text-indigo-400",
          allowedRoles: STAFF_ACCESS
        }
      ]
    },

    attendance: {
      id: "attendance",
      title: "ระบบเช็คชื่อ",
      description: "เช็คชื่อรายวิชา และจัดการข้อมูลการลาของนักเรียน/ครู",
      items: [
        {
          title: "เช็คชื่อโฮมรูม",
          description: "บันทึกการเข้าโฮมรูมของนักเรียนในชั้นประจำ",
          icon: <Home size={24} />,
          path: "/academic/homeroom-attendance",
          colorClass: "bg-sky-100 text-sky-600 dark:bg-sky-500/20 dark:text-sky-400",
          allowedRoles: TEACHER_OPERATIONAL
        },
        {
          title: "เช็คแถว (หน้าเสาธง)",
          description: "บันทึกการเข้าแถวเคารพธงชาติและกิจกรรมหน้าเสาธง",
          icon: <ListChecks size={24} />,
          path: "/academic/flag-ceremony",
          colorClass: "bg-indigo-100 text-indigo-600 dark:bg-indigo-500/20 dark:text-indigo-400",
          allowedRoles: TEACHER_OPERATIONAL
        },
        {
          title: "เช็คชื่อรายวิชา",
          description: "บันทึกการเข้าเรียนของนักเรียนในแต่ละคาบ",
          icon: <UserCheck size={24} />,
          path: "/academic/classroom-attendance",
          colorClass: "bg-blue-100 text-blue-600 dark:bg-blue-500/20 dark:text-blue-400",
          allowedRoles: TEACHER_OPERATIONAL
        },
        {
          title: "เช็คชื่อย้อนหลัง",
          description: "จัดการข้อมูลการเช็คชื่อที่ผ่านมา",
          icon: <Clock size={24} />,
          path: "/academic/classroom-attendance-history",
          colorClass: "bg-amber-100 text-amber-600 dark:bg-amber-500/20 dark:text-amber-400",
          allowedRoles: TEACHER_OPERATIONAL,
          featureKey: "allowHistoricalAttendance"
        },
        {
          title: "เช็คชื่อชุมนุม",
          description: "บันทึกการเข้าทำกิจกรรมชุมนุม",
          icon: <ClipboardCheck size={24} />,
          path: "/academic/club-attendance",
          colorClass: "bg-emerald-100 text-emerald-600 dark:bg-emerald-500/20 dark:text-emerald-400",
          allowedRoles: TEACHER_OPERATIONAL
        },
        {
          title: "สรุปการมาเรียนรายวิชา",
          description: "ดูสถิติการมาเรียนแยกตามวิชาและชั้นเรียน",
          icon: <BarChart3 size={24} />,
          path: "/academic/classroom-attendance-summary",
          colorClass: "bg-indigo-100 text-indigo-600 dark:bg-indigo-500/20 dark:text-indigo-400",
          allowedRoles: ACADEMIC_MANAGEMENT
        },

      ]
    },
    support: {
      id: "support",
      title: "ระบบดูแลช่วยเหลือนักเรียน",
      description: "ระบบคัดกรอง SDQ และการเยี่ยมบ้านเพื่อช่วยเหลือนักเรียน",
      items: [
        {
          title: "Dashboard ดูแลช่วยเหลือฯ",
          description: "ภาพรวมและสถิติงานดูแลช่วยเหลือนักเรียน",
          icon: <BarChart3 size={24} />,
          path: "/student-support",
          colorClass: "bg-indigo-100 text-indigo-600 dark:bg-indigo-500/20 dark:text-indigo-400",
          allowedRoles: STAFF_ACCESS
        },
        {
          title: "ระบบคัดกรองนักเรียน",
          description: "คัดกรองนักเรียน 4 ด้านตามเกณฑ์",
          icon: <Search size={24} />,
          path: "/student-support/screening",
          colorClass: "bg-blue-100 text-blue-600 dark:bg-blue-500/20 dark:text-blue-400",
          allowedRoles: STAFF_ACCESS
        },
        {
          title: "แบบประเมิน SDQ",
          description: "ประเมินพฤติกรรมเด็ก (ครู/นักเรียน/ผู้ปกครอง)",
          icon: <HeartPulse size={24} />,
          path: "/student-support/sdq",
          colorClass: "bg-rose-100 text-rose-600 dark:bg-rose-500/20 dark:text-rose-400",
          allowedRoles: STAFF_ACCESS
        },
        {
          title: "ระบบเยี่ยมบ้าน",
          description: "บันทึกและสรุปข้อมูลการเยี่ยมบ้านนักเรียน",
          icon: <MapPin size={24} />,
          path: "/student-support/home-visit",
          colorClass: "bg-emerald-100 text-emerald-600 dark:bg-emerald-500/20 dark:text-emerald-400",
          allowedRoles: STAFF_ACCESS
        }
      ]
    },
    activities: {
      id: "activities",
      title: "กิจกรรมและชุมนุม",
      description: "จัดการข้อมูลชุมนุมและการเข้าทำกิจกรรม",
      items: [
        {
          title: "จัดการชุมนุม",
          description: "เพิ่ม ลบ และแก้ไขข้อมูลกิจกรรมชุมนุม",
          icon: <Users size={24} />,
          path: "/academic/club-management",
          colorClass: "bg-amber-100 text-amber-600 dark:bg-amber-500/20 dark:text-amber-400",
          allowedRoles: ACADEMIC_MANAGEMENT
        },
        {
          title: "สมาชิกชุมนุม",
          description: "จัดการรายชื่อนักเรียนในแต่ละชุมนุม",
          icon: <UserCog size={24} />,
          path: "/academic/club-members",
          colorClass: "bg-violet-100 text-violet-600 dark:bg-violet-500/20 dark:text-violet-400",
          allowedRoles: ACADEMIC_MANAGEMENT
        }
      ]
    },
    evaluation: {
      id: "evaluation",
      title: "วัดผลและประเมินผล",
      description: "บันทึกคะแนนและสมุดบันทึกผลการเรียนรายวิชา",
      items: [
        {
          title: "ทะเบียนวัดผล (ปพ.5)",
          description: "บันทึกและจัดการผลการเรียนรู้รายวิชา",
          icon: <GraduationCap size={24} />,
          path: "/academic/grade-book",
          colorClass: "bg-purple-100 text-purple-600 dark:bg-purple-500/20 dark:text-purple-400",
          allowedRoles: TEACHER_OPERATIONAL,
          featureKey: "showGradeBookMenu"
        },
        {
          title: "บันทึกคะแนน (ก่อนกลางภาค)",
          description: "บันทึกคะแนนเก็บและคะแนนกลางภาค",
          icon: <Calculator size={24} />,
          path: "/academic/formative-scores",
          colorClass: "bg-indigo-100 text-indigo-600 dark:bg-indigo-500/20 dark:text-indigo-400",
          allowedRoles: TEACHER_OPERATIONAL
        },
        {
          title: "บันทึกคะแนน (หลังกลางภาค)",
          description: "บันทึกคะแนนเก็บหลังกลางภาคและปลายภาค",
          icon: <Trophy size={24} />,
          path: "/academic/post-midterm-scores",
          colorClass: "bg-emerald-100 text-emerald-600 dark:bg-emerald-500/20 dark:text-emerald-400",
          allowedRoles: TEACHER_OPERATIONAL
        },
        {
          title: "ตั้งค่าคะแนนเต็มรายวิชา",
          description: "กำหนดสัดส่วนคะแนน S1-S18 ของแต่ละวิชา",
          icon: <Settings size={24} />,
          path: "/academic/score-configuration",
          colorClass: "bg-amber-100 text-amber-600 dark:bg-amber-500/20 dark:text-amber-400",
          allowedRoles: ACADEMIC_MANAGEMENT
        }
      ]
    },
    settings: {
      id: "settings",
      title: "การตั้งค่าระบบ",
      description: "จัดการการเปิด-ปิดฟีเจอร์และข้อกำหนดต่างๆ",
      items: [
        {
          title: "ตั้งค่าระบบงานวิชาการ",
          description: "จัดการข้อกำหนดทั่วไปของงานวิชาการ",
          icon: <Settings size={24} />,
          path: "/academic/settings",
          colorClass: "bg-gray-100 text-gray-600 dark:bg-gray-500/20 dark:text-gray-400",
          allowedRoles: ACADEMIC_MANAGEMENT
        },
        {
          title: "ตั้งค่าระบบลงเวลา",
          description: "กำหนดช่วงเวลาการลงเวลาเข้า-ออก และการตั้งค่าอื่นๆ",
          icon: <Clock size={24} />,
          path: "/academic/attendance-config",
          colorClass: "bg-indigo-100 text-indigo-600 dark:bg-indigo-500/20 dark:text-indigo-400",
          allowedRoles: ACADEMIC_MANAGEMENT
        },
        {
          title: "ตั้งค่าคาบเรียน",
          description: "กำหนดช่วงเวลาของแต่ละคาบเรียน",
          icon: <Clock size={24} />,
          path: "/academic/period-settings",
          colorClass: "bg-cyan-100 text-cyan-600 dark:bg-cyan-500/20 dark:text-cyan-400",
          allowedRoles: ACADEMIC_MANAGEMENT
        },
        {
          title: "จัดการคาบเรียนพิเศษ",
          description: "กำหนดกิจกรรมพิเศษ เช่น โฮมรูม, พักเที่ยง",
          icon: <Clock size={24} />,
          path: "/academic/special-periods",
          colorClass: "bg-rose-100 text-rose-600 dark:bg-rose-500/20 dark:text-rose-400",
          allowedRoles: ACADEMIC_MANAGEMENT
        },
        {
          title: "ปฏิทินการศึกษา",
          description: "กำหนดวันเปิด-ปิดภาคเรียนและวันหยุด",
          icon: <Calendar size={24} />,
          path: "/academic/school-calendar",
          colorClass: "bg-green-100 text-green-600 dark:bg-green-500/20 dark:text-green-400",
          allowedRoles: STAFF_ACCESS
        },
        {
          title: "ข้อมูลอาคาร/สถานที่",
          description: "จัดการข้อมูลอาคาร ห้องเรียน และจุดจัดการสอน",
          icon: <School size={24} />,
          path: "/academic/physical-rooms",
          colorClass: "bg-blue-100 text-blue-600 dark:bg-blue-500/20 dark:text-blue-400",
          allowedRoles: ACADEMIC_MANAGEMENT
        },
        {
          title: "ข้อมูลโรงเรียน",
          description: "แก้ไขข้อมูลพื้นฐาน ตราสัญลักษณ์ และพิกัดที่ตั้งของโรงเรียน",
          icon: <School size={24} />,
          path: schoolId ? `/owner/school-info/${schoolId}` : "/owner/school-info",
          colorClass: "bg-indigo-100 text-indigo-600 dark:bg-indigo-500/20 dark:text-indigo-400",
          allowedRoles: ACADEMIC_MANAGEMENT
        },
        {
          title: "จัดการผู้ใช้งาน",
          description: "จัดการบัญชีรายชื่อครูและบุคลากรในโรงเรียน",
          icon: <Users size={24} />,
          path: "/owner/users",
          colorClass: "bg-orange-100 text-orange-600 dark:bg-orange-500/20 dark:text-orange-400",
          allowedRoles: ACADEMIC_MANAGEMENT
        }
      ]
    },
    owner: {
      id: "owner",
      title: "เจ้าของระบบ (Superadmin)",
      description: "จัดการข้อมูลโรงเรียนและผู้ใช้งานในระดับแพลตฟอร์ม",
      items: [
        {
          title: "จัดการข้อมูลโรงเรียน",
          description: "เพิ่ม ลบ และแก้ไขข้อมูลโรงเรียนทั้งหมด",
          icon: <School size={24} />,
          path: "/owner/schools",
          colorClass: "bg-blue-100 text-blue-600 dark:bg-blue-500/20 dark:text-blue-400",
          allowedRoles: OWNER_ONLY
        },
        {
          title: "ผู้ใช้งานระบบ",
          description: "ดูและแก้ไขข้อมูลผู้ใช้งานทั้งหมดในระบบ",
          icon: <Users size={24} />,
          path: "/owner/users",
          colorClass: "bg-indigo-100 text-indigo-600 dark:bg-indigo-500/20 dark:text-indigo-400",
          allowedRoles: OWNER_ONLY
        },
        {
          title: "เพิ่มผู้ใช้งานใหม่",
          description: "ลงทะเบียนบัญชีผู้ใช้งานใหม่เข้าสู่ระบบ",
          icon: <UserCog size={24} />,
          path: "/owner/users/add",
          colorClass: "bg-emerald-100 text-emerald-600 dark:bg-emerald-500/20 dark:text-emerald-400",
          allowedRoles: OWNER_ONLY
        }
      ]
    }
  };

  const renderFeatureCard = (feature: HubItem) => (
    <Link
      key={feature.path}
      to={feature.path}
      className="group relative bg-white dark:bg-[#2a2b2f] rounded-2xl p-6 shadow-sm hover:shadow-lg transition-all duration-300 hover:-translate-y-1 flex flex-col h-full border-none outline-none ring-0 hover:no-underline transform-gpu"
    >
      <div className="relative z-10 flex flex-col h-full">
        <div className={`mb-5 inline-flex items-center justify-center w-14 h-14 rounded-2xl ${feature.colorClass} transition-transform duration-300 group-hover:scale-110 shadow-sm`}>
          {feature.icon}
        </div>

        <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-2 group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition-colors">
          {feature.title}
        </h3>

        <p className="text-gray-500 dark:text-gray-400 text-sm leading-relaxed mb-6 flex-grow">
          {feature.description}
        </p>

        <div className="flex items-center text-sm font-semibold text-indigo-600 dark:text-indigo-400 mt-auto group-hover:translate-x-1 transition-transform duration-200">
          <span>เข้าใช้งาน</span>
          <ChevronRight className="w-4 h-4 ml-1" />
        </div>
      </div>
    </Link>
  );

  const renderHubSection = (hub: HubConfig) => {
    const visibleItems = hub.items.filter(item => checkAccess(item));
    if (visibleItems.length === 0) return null;

    return (
      <div key={hub.id} className="mb-16">
        {isMasterHub && (
          <div className="flex items-center justify-between mb-8">
            <div className="flex items-center gap-3">
              <div className="w-1.5 h-8 rounded-full bg-indigo-500"></div>
              <div>
                <h2 className="text-2xl font-bold text-gray-900 dark:text-white">{hub.title}</h2>
                <p className="text-gray-500 dark:text-gray-400">{hub.description}</p>
              </div>
            </div>
          </div>
        )}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {visibleItems.map(renderFeatureCard)}
        </div>
      </div>
    );
  };

  const currentHub = hubType ? hubConfigs[hubType] : null;

  // Final access check
  if (hubType === 'owner' && !hasRole(OWNER_ONLY)) {
    return <Navigate to="/home" replace />;
  }

  if (!currentHub && !isMasterHub) {
    return <Navigate to="/home" replace />;
  }

  return (
    <MainLayout>
      <div className="px-3 sm:px-4 md:px-6 lg:px-8 py-4 sm:py-6 lg:py-8 min-h-screen transition-colors duration-300 bg-gray-50 dark:bg-[#1c1c24]">
        <div className="max-w-7xl mx-auto">
          {/* Header */}
          <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-10 gap-4">
            <div className="flex items-center gap-4">
              {isMasterHub ? (
                <Link 
                  to="/home"
                  className="w-10 h-10 rounded-full bg-white dark:bg-white/[0.03] border border-gray-200 dark:border-white/5 flex items-center justify-center text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-white/[0.08] hover:text-gray-900 dark:hover:text-white transition-all shadow-sm"
                >
                  <Home size={20} />
                </Link>
              ) : (
                <BackButton to="/home" />
              )}
              <div>
                <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-2">
                  {isMasterHub ? "หน้าหลักงานวิชาการ" : currentHub?.title}
                </h1>
                <p className="text-gray-500 dark:text-gray-400 text-lg">
                  {isMasterHub ? "เลือกหมวดหมู่ที่ต้องการจัดการเพื่อเข้าสู่เมนูย่อย" : currentHub?.description}
                </p>
              </div>
            </div>

            {!isMasterHub && (
              <Link to="/academic-admin" className="px-5 py-2.5 bg-indigo-50 dark:bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 rounded-xl text-sm font-bold border border-indigo-100 dark:border-indigo-500/20 hover:bg-indigo-100 dark:hover:bg-indigo-500/20 transition-all flex items-center gap-2 group">
                <ArrowRight size={18} className="group-hover:translate-x-0.5 transition-transform" />
                ดูหมวดหมู่ทั้งหมด
              </Link>
            )}
          </div>

          {/* Content */}
          {isMasterHub ? (
            // Show all hubs (excluding owner if not superadmin)
            Object.values(hubConfigs)
              .filter(hub => hub.id !== 'owner' || hasRole(OWNER_ONLY))
              .map(renderHubSection)
          ) : (
            // Show single hub
            currentHub && renderHubSection(currentHub)
          )}
        </div>
      </div>
    </MainLayout>
  );
};

export default HubPage;
