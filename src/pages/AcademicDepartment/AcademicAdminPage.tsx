<<<<<<< HEAD
import React from "react";
import { Navigate } from "react-router-dom";

const AcademicAdminPage: React.FC = () => {
  return <Navigate to="/academic/hub/registration" replace />;
=======
import React, { useEffect } from "react";
import { useSelector, useDispatch } from "react-redux";
import {
  ChevronRight,
  Home,
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
  Star,
  FileText,
  ListChecks,
  Settings2,
  GitMerge,
  Settings,
  BarChart3,
  Trophy
} from "lucide-react";
import { RootState } from "../../store";
import { fetchUserProfile } from "../../store/slices/profileSlice";
import { Link } from "react-router-dom";
import MainLayout from "@/layouts/MainLayout";

const AcademicAdminPage: React.FC = () => {
  const dispatch = useDispatch();
  const currentUser = useSelector((state: RootState) => state.auth.user);
  const profile = useSelector((state: any) => state.profile);

  useEffect(() => {
    if (currentUser && (currentUser as any).uid && profile?.status === 'idle') {
      dispatch(fetchUserProfile((currentUser as any).uid) as any);
    }
  }, [currentUser, profile?.status, dispatch]);

  const userName = profile?.status === 'succeeded' && profile.firstName
    ? `${profile.position}${profile.title || ''}${profile.firstName} ${profile.lastName}`
    : (currentUser as any)?.displayName || "ผู้ดูแลระบบ";

  const schoolId = (currentUser as any)?.schoolId;

  const featureGroups = [
    {
      category: "การจัดการหลักสูตรและตารางเรียน",
      features: [
        {
          title: "ลงทะเบียนวิชา (ครู/สถานที่)",
          description: "กำหนดครูผู้สอนและห้องเรียนสำหรับแต่ละวิชา",
          icon: <UserCheck size={24} />,
          path: "/academic/course-assignment",
          colorClass: "bg-indigo-100 text-indigo-600 dark:bg-indigo-500/20 dark:text-indigo-400"
        },
        {
          title: "ลงทะเบียนเรียน (นักเรียน)",
          description: "ลงทะเบียนนักเรียนเข้าสู่รายวิชาที่จัดไว้แล้ว",
          icon: <Users size={24} />,
          path: "/academic/course-enrollment",
          colorClass: "bg-emerald-100 text-emerald-600 dark:bg-emerald-500/20 dark:text-emerald-400"
        },
        {
          title: "จัดการหลักสูตร",
          description: "เพิ่ม ลบ และแก้ไขหลักสูตรการสอน",
          icon: <BookOpen size={24} />,
          path: "/academic/course-management",
          colorClass: "bg-blue-100 text-blue-600 dark:bg-blue-500/20 dark:text-blue-400"
        },
        {
          title: "ดูหลักสูตร",
          description: "ดูและแก้ไขข้อมูลหลักสูตรทั้งหมดในระบบ",
          icon: <ClipboardList size={24} />,
          path: "/academic/view-courses",
          colorClass: "bg-lime-100 text-lime-600 dark:bg-lime-500/20 dark:text-lime-400"
        },

        {
          title: "จัดการคาบเรียนพิเศษ",
          description: "กำหนดกิจกรรมพิเศษ เช่น โฮมรูม, พักกลางวัน",
          icon: <Clock size={24} />,
          path: "/academic/special-periods",
          colorClass: "bg-rose-100 text-rose-600 dark:bg-rose-500/20 dark:text-rose-400"
        },
        {
          title: "ตั้งค่าคาบเรียน",
          description: "กำหนดช่วงเวลาของคาบเรียนต่างๆ ในแต่ละวัน",
          icon: <Clock size={24} />,
          path: "/academic/period-settings",
          colorClass: "bg-cyan-100 text-cyan-600 dark:bg-cyan-500/20 dark:text-cyan-400"
        },
        {
          title: "จัดการตารางสอน",
          description: "จัดตารางสอนสำหรับครูและชั้นเรียน",
          icon: <CalendarDays size={24} />,
          path: "/academic/teacher-schedule",
          colorClass: "bg-indigo-100 text-indigo-600 dark:bg-indigo-500/20 dark:text-indigo-400"
        },
        {
          title: "ดูตารางเรียน (นักเรียน)",
          description: "ดูตารางเรียนของแต่ละชั้นเรียน",
          icon: <School size={24} />,
          path: "/academic/student-schedule",
          colorClass: "bg-pink-100 text-pink-600 dark:bg-pink-500/20 dark:text-pink-400"
        },
        {
          title: "ดูตารางสอน (ครู)",
          description: "ดูตารางสอนของครูแต่ละคน",
          icon: <UserCheck size={24} />,
          path: "/academic/teacher-schedule-view",
          colorClass: "bg-orange-100 text-orange-600 dark:bg-orange-500/20 dark:text-orange-400"
        },
        {
          title: "ปฏิทินการศึกษา",
          description: "กำหนดวันเปิด-ปิดภาคเรียนและวันหยุด",
          icon: <Calendar size={24} />,
          path: "/academic/school-calendar",
          colorClass: "bg-green-100 text-green-600 dark:bg-green-500/20 dark:text-green-400"
        },
        {
          title: "จัดการสอนแทน",
          description: "จัดหาครูสอนแทนสำหรับครูที่ลา",
          icon: <ClipboardList size={24} />,
          path: "/academic/substitute-management",
          colorClass: "bg-teal-100 text-teal-600 dark:bg-teal-500/20 dark:text-teal-400"
        },
        {
          title: "จัดการชุมนุม",
          description: "จัดการข้อมูลชุมนุมและครูผู้รับผิดชอบ",
          icon: <Users size={24} />,
          path: "/academic/club-management",
          colorClass: "bg-amber-100 text-amber-600 dark:bg-amber-500/20 dark:text-amber-400"
        },
        {
          title: "สมาชิกชุมนุม",
          description: "จัดการรายชื่อนักเรียนในชุมนุมที่รับผิดชอบ",
          icon: <UserCog size={24} />,
          path: "/academic/club-members",
          colorClass: "bg-violet-100 text-violet-600 dark:bg-violet-500/20 dark:text-violet-400"
        },
        {
          title: "เช็คชื่อชุมนุม",
          description: "บันทึกการเข้าทำกิจกรรมชุมนุมของนักเรียน",
          icon: <ClipboardCheck size={24} />,
          path: "/academic/club-attendance",
          colorClass: "bg-emerald-100 text-emerald-600 dark:bg-emerald-500/20 dark:text-emerald-400"
        },
        {
          title: "จัดการกลุ่มสาระและตัวชี้วัด",
          description: "กำหนดรหัสและรายละเอียดตัวชี้วัดสำหรับรายวิชาต่างๆ",
          icon: <ListChecks size={24} />,
          path: "/academic/subject-groups",
          colorClass: "bg-indigo-100 text-indigo-600 dark:bg-indigo-500/20 dark:text-indigo-400"
        },
      ]
    },
    {
      category: "การจัดการข้อมูล",
      features: [
        {
          title: "ข้อมูลนักเรียน",
          description: "จัดการข้อมูลประวัตินักเรียน",
          icon: <User size={24} />,
          path: `/school/${schoolId}/students`,
          colorClass: "bg-yellow-100 text-yellow-600 dark:bg-yellow-500/20 dark:text-yellow-400"
        },
        {
          title: "ข้อมูลบุคลากร",
          description: "จัดการข้อมูลประวัติครูและบุคลากร",
          icon: <Users size={24} />,
          path: `/school/${schoolId}/teachers`,
          colorClass: "bg-cyan-100 text-cyan-600 dark:bg-cyan-500/20 dark:text-cyan-400"
        },
        {
          title: "จัดการระบบย้ายห้อง",
          description: "ย้ายนักเรียนจากห้องปัจจุบันไปยังห้องใหม่",
          icon: <GitMerge size={24} />,
          path: "/academic/room-transfer",
          colorClass: "bg-emerald-100 text-emerald-600 dark:bg-emerald-500/20 dark:text-emerald-400"
        },
        {
          title: "ระบบสำเร็จการศึกษา",
          description: "อนุมัติรายชื่อและจัดการบันทึกผู้สำเร็จการศึกษา",
          icon: <GraduationCap size={24} />,
          path: "/academic/graduation-management",
          colorClass: "bg-rose-100 text-rose-600 dark:bg-rose-500/20 dark:text-rose-400"
        },
        {
          title: "สรุปการมาเรียน",
          description: "สรุปสถิติการมาเรียน แยกตามรายวิชาและครูผู้สอน",
          icon: <BarChart3 size={24} />,
          path: "/academic/classroom-attendance-summary",
          colorClass: "bg-indigo-100 text-indigo-600 dark:bg-indigo-500/20 dark:text-indigo-400"
        },
        {
          title: "ข้อมูลอาคาร/สถานที่",
          description: "จัดการข้อมูลอาคาร ห้องเรียน และจุดจัดการสอน",
          icon: <School size={24} />,
          path: "/academic/physical-rooms",
          colorClass: "bg-blue-100 text-blue-600 dark:bg-blue-500/20 dark:text-blue-400"
        },
      ]
    },
    {
      category: "การวัดผลและประเมินผล",
      features: [
        {
          title: "ทะเบียนวัดผล (ปพ.5)",
          description: "บันทึกและจัดการผลการเรียนรู้รายวิชา",
          icon: <GraduationCap size={24} />,
          path: "/academic/grade-book",
          colorClass: "bg-purple-100 text-purple-600 dark:bg-purple-500/20 dark:text-purple-400"
        },

        {
          title: "ตั้งค่าคะแนนเต็มรายวิชา",
          description: "กำหนดสัดส่วนคะแนน S1-S18 ของแต่ละวิชา",
          icon: <Settings size={24} />,
          path: "/academic/score-configuration",
          colorClass: "bg-amber-100 text-amber-600 dark:bg-amber-500/20 dark:text-amber-400"
        },
        {
          title: "บันทึกคะแนน (ก่อนกลางภาค)",
          description: "บันทึกคะแนนเก็บและคะแนนกลางภาค",
          icon: <Calculator size={24} />,
          path: "/academic/formative-scores",
          colorClass: "bg-indigo-100 text-indigo-600 dark:bg-indigo-500/20 dark:text-indigo-400"
        },
        {
          title: "บันทึกคะแนน (หลังกลางภาค)",
          description: "บันทึกคะแนนเก็บหลังกลางภาคและปลายภาค",
          icon: <Trophy size={24} />,
          path: "/academic/post-midterm-scores",
          colorClass: "bg-emerald-100 text-emerald-600 dark:bg-emerald-500/20 dark:text-emerald-400"
        },

      ]
    },
    {
      category: "ตั้งค่าระบบวิชาการ",
      features: [
        {
          title: "ตั้งค่าระบบงานวิชาการ",
          description: "จัดการการเปิด-ปิดฟีเจอร์และข้อกำหนดต่างๆ ของงานวิชาการ",
          icon: <Settings size={24} />,
          path: "/academic/settings",
          colorClass: "bg-gray-100 text-gray-600 dark:bg-gray-500/20 dark:text-gray-400"
        },
      ]
    }
  ];

  return (
    <MainLayout>
      <div className="px-3 sm:px-4 md:px-6 lg:px-8 py-4 sm:py-6 lg:py-8 min-h-screen transition-colors duration-300">
        <div className="max-w-7xl mx-auto">
          {/* Header */}
          <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-10 gap-4">
            <div>
              <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-2">บริหารงานวิชาการ</h1>
              <p className="text-gray-500 dark:text-gray-400 text-lg">
                ยินดีต้อนรับ, <span className="text-indigo-600 dark:text-indigo-400 font-semibold">{userName}</span>
              </p>
            </div>
            <Link
              to="/home"
              className="flex items-center gap-2 bg-white dark:bg-[#2a2b2f] px-5 py-2.5 rounded-xl text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-white/5 transition-all shadow-sm border border-gray-200 dark:border-gray-700 font-medium"
            >
              <Home size={20} />
              <span>หน้าหลัก</span>
            </Link>
          </div>

          <div className="space-y-12">
            {featureGroups.map((group, groupIndex) => {
              // กรองฟีเจอร์ตามเงื่อนไข
              const visibleFeatures = group.features;

              if (visibleFeatures.length === 0) return null;

              return (
                <div key={group.category}>
                  <div className="flex items-center gap-3 mb-6">
                    <div className={`w-1.5 h-8 rounded-full ${groupIndex === 0 ? 'bg-blue-500' :
                      groupIndex === 1 ? 'bg-yellow-500' : 'bg-purple-500'
                      }`}></div>
                    <h2 className="text-xl font-bold text-gray-800 dark:text-gray-100">{group.category}</h2>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
                    {visibleFeatures.map((feature) => (
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
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </MainLayout>
  );
>>>>>>> 5f8c7e1 (feat: optimize auto-scheduler and update UI labels)
};

export default AcademicAdminPage;