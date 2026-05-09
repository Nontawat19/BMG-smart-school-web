import React from "react";
import { useSelector } from "react-redux";
import { Link } from "react-router-dom";
import { RootState } from "../../store";
import BackButton from "@/components/Shared/BackButton";
import MainLayout from "@/layouts/MainLayout";
import {
  Home,
  HeartHandshake,
  ClipboardList,
  Home as HomeIcon,
  GraduationCap,
  UserCheck,
  AlertCircle,
  ChevronRight
} from "lucide-react";

const StudentSupportPage: React.FC = () => {
  const { user } = useSelector((state: RootState) => state.auth);
  const userName = (user as any)?.displayName || "ผู้ใช้งาน";

  const menuItems = [
    {
      title: "คัดกรองนักเรียน (SDQ/EQ)",
      description: "แบบประเมินจุดแข็งและจุดอ่อน (SDQ) และความฉลาดทางอารมณ์ (EQ)",
      icon: <ClipboardList size={24} />,
      path: "/student-support/sdq",
      colorClass: "bg-blue-100 text-blue-600 dark:bg-blue-500/20 dark:text-blue-400"
    },
    {
      title: "เยี่ยมบ้านนักเรียน",
      description: "บันทึกข้อมูลการเยี่ยมบ้านและสภาพความเป็นอยู่ของนักเรียน",
      icon: <HomeIcon size={24} />,
      path: "/student-support/home-visit",
      colorClass: "bg-green-100 text-green-600 dark:bg-green-500/20 dark:text-green-400"
    },
    {
      title: "ทุนการศึกษา",
      description: "บริหารจัดการทุนการศึกษาและนักเรียนยากจน",
      icon: <GraduationCap size={24} />,
      path: "/student-support/scholarships",
      colorClass: "bg-yellow-100 text-yellow-600 dark:bg-yellow-500/20 dark:text-yellow-400"
    },
    {
      title: "ระบบดูแลรายบุคคล",
      description: "ระเบียนสะสมและข้อมูลรายบุคคลเพื่อการดูแลช่วยเหลือ",
      icon: <UserCheck size={24} />,
      path: "/student-support/individual",
      colorClass: "bg-purple-100 text-purple-600 dark:bg-purple-500/20 dark:text-purple-400"
    },
    {
      title: "แจ้งเหตุนักเรียน",
      description: "ระบบแจ้งเหตุและติดตามพฤติกรรมนักเรียนกลุ่มเสี่ยง",
      icon: <AlertCircle size={24} />,
      path: "/student-support/alerts",
      colorClass: "bg-red-100 text-red-600 dark:bg-red-500/20 dark:text-red-400"
    }
  ];

  return (
    <MainLayout>
      <div className="px-3 sm:px-4 md:px-6 lg:px-8 py-4 sm:py-6 lg:py-8 min-h-screen transition-colors duration-300">
        <div className="max-w-7xl mx-auto">
          {/* Header */}
          <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-10 gap-4">
            <div>
              <div className="flex items-center gap-4 mb-2">
                <BackButton />
                <h1 className="text-3xl font-bold text-gray-900 dark:text-white flex items-center gap-3">
                  <HeartHandshake className="text-pink-600 dark:text-pink-400" size={32} />
                  ระบบดูแลช่วยเหลือนักเรียน
                </h1>
              </div>
              <p className="text-gray-500 dark:text-gray-400 text-lg">
                ยินดีต้อนรับ, <span className="text-pink-600 dark:text-pink-400 font-semibold">{userName}</span>
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

          {/* Menu Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {menuItems.map((item, index) => (
              <Link
                key={index}
                to={item.path}
                className="group relative bg-white dark:bg-[#2a2b2f] rounded-2xl p-6 shadow-sm hover:shadow-lg transition-all duration-300 hover:-translate-y-1 flex flex-col h-full border-none outline-none ring-0 hover:no-underline transform-gpu"
              >


                <div className="relative z-10 flex flex-col h-full">
                  <div className={`mb-5 inline-flex items-center justify-center w-14 h-14 rounded-2xl ${item.colorClass} transition-transform duration-300 group-hover:scale-110 shadow-sm`}>
                    {item.icon}
                  </div>

                  <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-2 group-hover:text-pink-600 dark:group-hover:text-pink-400 transition-colors">
                    {item.title}
                  </h3>

                  <p className="text-gray-500 dark:text-gray-400 text-sm leading-relaxed mb-6 flex-grow">
                    {item.description}
                  </p>

                  <div className="flex items-center text-sm font-semibold text-pink-600 dark:text-pink-400 mt-auto group-hover:translate-x-1 transition-transform duration-200">
                    <span>เข้าใช้งาน</span>
                    <ChevronRight className="w-4 h-4 ml-1" />
                  </div>
                </div>
              </Link>
            ))}
          </div>
        </div>
      </div>
    </MainLayout>
  );
};

export default StudentSupportPage;