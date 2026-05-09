import React, { useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useSelector, useDispatch } from 'react-redux';
import { RootState } from '@/store';
import { fetchUserProfile } from '@/store/slices/profileSlice';
import MainLayout from '@/layouts/MainLayout';
import BackButton from '@/components/Shared/BackButton';
import {
  Home,
  ChevronRight,
  Users,
  UserPlus,
  FileText,
  Clock,
  Calendar,
  Settings,
  Award,
  BookOpen,
  TrendingUp,
  AlertCircle,
  Heart,
  FileBarChart,
  Briefcase,
  GraduationCap,
  Archive,
  IdCard
} from 'lucide-react';

const HumanResourcePage: React.FC = () => {
  const dispatch = useDispatch();
  const currentUser = useSelector((state: RootState) => state.auth.user);
  const profile = useSelector((state: any) => state.profile);

  useEffect(() => {
    if (currentUser && (currentUser as any).uid && profile?.status === 'idle') {
      dispatch(fetchUserProfile((currentUser as any).uid) as any);
    }
  }, [currentUser, profile?.status, dispatch]);

  const schoolId = (currentUser as any)?.schoolId;
  const userName = profile?.status === 'succeeded' && profile.firstName
    ? `${profile.position}${profile.title || ''}${profile.firstName} ${profile.lastName}`
    : (currentUser as any)?.displayName || "ผู้ดูแลระบบ";

  const menuGroups = [
    {
      title: "งานทะเบียนและข้อมูลบุคลากร",
      items: [
        {
          name: "ข้อมูลครูและบุคลากร",
          desc: "จัดการฐานข้อมูลทะเบียนประวัติครูและบุคลากร",
          icon: <Users size={24} />,
          path: schoolId ? `/school/${schoolId}/teachers` : "#",
          color: "bg-blue-100 text-blue-600 dark:bg-blue-500/20 dark:text-blue-400"
        },
        {
          name: "เพิ่มบุคลากรใหม่",
          desc: "ลงทะเบียนครูและบุคลากรใหม่เข้าสู่ระบบ",
          icon: <UserPlus size={24} />,
          path: schoolId ? `/school/${schoolId}/teachers/add` : "#",
          color: "bg-indigo-100 text-indigo-600 dark:bg-indigo-500/20 dark:text-indigo-400"
        },
        {
          name: "ทำบัตรประจำตัว",
          desc: "ออกแบบและพิมพ์บัตรประจำตัวสำหรับบุคลากรและนักเรียน",
          icon: <IdCard size={24} />,
          path: "/human-resources/id-card",
          color: "bg-lime-100 text-lime-600 dark:bg-lime-500/20 dark:text-lime-400"
        },
        {
          name: "ทะเบียนประวัติ (ก.พ.7)",
          desc: "บันทึกและแก้ไขประวัติรับราชการ (ก.พ.7)",
          icon: <FileText size={24} />,
          path: `/hr/personnel-records`,
          color: "bg-cyan-100 text-cyan-600 dark:bg-cyan-500/20 dark:text-cyan-400"
        }
      ]
    },
    {
      title: "งานการมาปฏิบัติราชการ",
      items: [
        {
          name: "เช็คเวลาวันนี้",
          desc: "ตรวจสอบการลงเวลาเข้า-ออกงานประจำวัน",
          icon: <Clock size={24} />,
          path: "/human-resources/teacher-attendance-today",
          color: "bg-green-100 text-green-600 dark:bg-green-500/20 dark:text-green-400"
        },
        {
          name: "สรุปวันลา/มาสาย",
          desc: "รายงานสถิติการมาปฏิบัติราชการ",
          icon: <FileBarChart size={24} />,
          path: "/human-resources/teacher-attendance-summary",
          color: "bg-emerald-100 text-emerald-600 dark:bg-emerald-500/20 dark:text-emerald-400"
        },
        {
          name: "สรุปการมาเรียน (นักเรียน)",
          desc: "รายงานสถิติการมาเรียนของนักเรียนรายห้อง",
          icon: <GraduationCap size={24} />,
          path: "/hr/student-attendance-summary",
          color: "bg-sky-100 text-sky-600 dark:bg-sky-500/20 dark:text-sky-400"
        },
        {
          name: "ระบบการลา",
          desc: "ยื่นใบลาและตรวจสอบสถานะการลา",
          icon: <Calendar size={24} />,
          path: "/attendance/teacher-leave-request",
          color: "bg-teal-100 text-teal-600 dark:bg-teal-500/20 dark:text-teal-400"
        },
        {
          name: "ตั้งค่าเวลาเข้างาน",
          desc: "กำหนดช่วงเวลาเข้างาน สาย และเลิกงาน",
          icon: <Settings size={24} />,
          path: "/human-resources/attendance-config",
          color: "bg-slate-100 text-slate-600 dark:bg-slate-500/20 dark:text-slate-400"
        }
      ]
    },
    {
      title: "งานพัฒนาบุคลากร",
      items: [
        {
          name: "บันทึกการอบรม",
          desc: "ประวัติการเข้ารับการอบรมและสัมมนา",
          icon: <BookOpen size={24} />,
          path: "/hr/training-records",
          color: "bg-orange-100 text-orange-600 dark:bg-orange-500/20 dark:text-orange-400"
        },
        {
          name: "แผนพัฒนาตนเอง (ID Plan)",
          desc: "จัดทำแผนพัฒนาตนเองรายบุคคล",
          icon: <TrendingUp size={24} />,
          path: "/hr/id-plan",
          color: "bg-amber-100 text-amber-600 dark:bg-amber-500/20 dark:text-amber-400"
        },
        {
          name: "ชุมชนแห่งการเรียนรู้ (PLC)",
          desc: "บันทึกกิจกรรม PLC ของกลุ่มสาระฯ",
          icon: <Users size={24} />,
          path: "/hr/plc",
          color: "bg-yellow-100 text-yellow-600 dark:bg-yellow-500/20 dark:text-yellow-400"
        }
      ]
    },
    {
      title: "งานประเมินผลและวิทยฐานะ",
      items: [
        {
          name: "ประเมินผลการปฏิบัติงาน",
          desc: "ระบบประเมินผลงานเพื่อเลื่อนขั้นเงินเดือน",
          icon: <Briefcase size={24} />,
          path: "/hr/evaluation",
          color: "bg-pink-100 text-pink-600 dark:bg-pink-500/20 dark:text-pink-400"
        },
        {
          name: "จัดเก็บข้อตกลงฯ (PA)",
          desc: "จัดเก็บและจัดการไฟล์ข้อตกลงในการพัฒนางาน (PA)",
          icon: <Archive size={24} />,
          path: "/hr/pa-storage",
          color: "bg-fuchsia-100 text-fuchsia-600 dark:bg-fuchsia-500/20 dark:text-fuchsia-400"
        },
        {
          name: "ขอมี/เลื่อนวิทยฐานะ",
          desc: "ระบบสนับสนุนการทำวิทยฐานะ (ว.PA)",
          icon: <GraduationCap size={24} />,
          path: "/hr/academic-standing",
          color: "bg-rose-100 text-rose-600 dark:bg-rose-500/20 dark:text-rose-400"
        }
      ]
    },
    {
      title: "งานวินัยและเชิดชูเกียรติ",
      items: [
        {
          name: "ยกย่องเชิดชูเกียรติ",
          desc: "บันทึกรางวัลและความภาคภูมิใจ",
          icon: <Award size={24} />,
          path: "/hr/commendation",
          color: "bg-purple-100 text-purple-600 dark:bg-purple-500/20 dark:text-purple-400"
        },
        {
          name: "งานวินัยและจรรยาบรรณ",
          desc: "บันทึกข้อมูลทางวินัยและการรักษาวินัย",
          icon: <AlertCircle size={24} />,
          path: "/hr/discipline",
          color: "bg-red-100 text-red-600 dark:bg-red-500/20 dark:text-red-400"
        },
        {
          name: "สวัสดิการครู",
          desc: "ข้อมูลสวัสดิการและสิทธิประโยชน์",
          icon: <Heart size={24} />,
          path: "/hr/welfare",
          color: "bg-violet-100 text-violet-600 dark:bg-violet-500/20 dark:text-violet-400"
        }
      ]
    }
  ];

  return (
    <MainLayout>
      <div className="p-4 sm:p-8 min-h-screen transition-colors duration-300">
        <div className="max-w-7xl mx-auto">
          {/* Header */}
          <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-10 gap-4">
            <div className="flex items-center gap-4">
              <BackButton to="/home" />
              <div>
                <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-2">บริหารงานบุคคล</h1>
                <p className="text-gray-500 dark:text-gray-400 text-lg">
                  ยินดีต้อนรับ, <span className="text-indigo-600 dark:text-indigo-400 font-semibold">{userName}</span>
                </p>
              </div>
            </div>
          </div>

          <div className="space-y-12">
            {menuGroups.map((group, index) => (
              <div key={index}>
                <div className="flex items-center gap-3 mb-6">
                  <div className={`w-1.5 h-8 rounded-full ${index === 0 ? 'bg-blue-500' :
                    index === 1 ? 'bg-green-500' :
                      index === 2 ? 'bg-orange-500' :
                        index === 3 ? 'bg-pink-500' : 'bg-purple-500'
                    }`}></div>
                  <h2 className="text-xl font-bold text-gray-800 dark:text-gray-100">{group.title}</h2>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
                  {group.items.map((item, itemIndex) => (
                    <Link
                      key={itemIndex}
                      to={item.path}
                      className="group relative bg-white dark:bg-[#2a2b2f] rounded-2xl p-6 shadow-sm hover:shadow-lg transition-all duration-300 hover:-translate-y-1 flex flex-col h-full border-none outline-none ring-0 hover:no-underline transform-gpu"
                    >


                      <div className="relative z-10 flex flex-col h-full">
                        <div className={`mb-5 inline-flex items-center justify-center w-14 h-14 rounded-2xl ${item.color} transition-transform duration-300 group-hover:scale-110 shadow-sm`}>
                          {item.icon}
                        </div>

                        <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-2 group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition-colors">
                          {item.name}
                        </h3>

                        <p className="text-gray-500 dark:text-gray-400 text-sm leading-relaxed mb-6 flex-grow">
                          {item.desc}
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
            ))}
          </div>
        </div>
      </div>
    </MainLayout>
  );
};

export default HumanResourcePage;