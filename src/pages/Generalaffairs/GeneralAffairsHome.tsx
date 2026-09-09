import React, { useEffect } from "react";
import { useSelector, useDispatch } from "react-redux";
import { Link } from "react-router-dom";
import { RootState } from "../../store";
import { fetchUserProfile } from "../../store/slices/profileSlice";
import MainLayout from "@/layouts/MainLayout";
import BackButton from "@/components/Shared/BackButton";
import {
  FileText,
  FileSignature,
  History,
  ChevronRight,
  Megaphone,
  BookOpen
} from "lucide-react";

const GeneralAffairsHome: React.FC = () => {
  const dispatch = useDispatch();
  const { user } = useSelector((state: RootState) => state.auth);
  // หมายเหตุ: คุณต้องเพิ่ม profileReducer ลงใน store.ts ก่อน state.profile ถึงจะใช้งานได้สมบูรณ์
  const profile = useSelector((state: any) => state.profile);

  useEffect(() => {
    // ตรวจสอบว่ามี user และสถานะ profile ยังเป็น idle (ยังไม่เคยโหลด) หรือไม่
    if (user && (user as any).uid && profile?.status === 'idle') {
      dispatch(fetchUserProfile((user as any).uid) as any);
    }
  }, [user, profile?.status, dispatch]);

  const displayName = profile?.status === 'succeeded' && profile.firstName
    ? `${profile.position}${profile.title || ''}${profile.firstName} ${profile.lastName}`
    : (user as any)?.displayName || "ผู้ใช้งาน";

  const menuItems = [
    {
      title: "ประทับตรารับเอกสาร",
      description: "ระบบลงรับหนังสือราชการและประทับตราเอกสารเข้า",
      icon: <FileText size={24} />,
      path: "/general-affairs",
      colorClass: "bg-blue-100 text-blue-600 dark:bg-blue-500/20 dark:text-blue-400"
    },
    {
      title: "เอกสารรอมอบหมาย (ผอ.)",
      description: "รายการเอกสารที่รอการพิจารณาและมอบหมายงานจากผู้อำนวยการ",
      icon: <FileSignature size={24} />,
      path: "/director/assignments",
      colorClass: "bg-orange-100 text-orange-600 dark:bg-orange-500/20 dark:text-orange-400"
    },
    {
      title: "ธุรการมอบหมายแล้ว",
      description: "ประวัติและรายการเอกสารที่ได้รับการมอบหมายเรียบร้อยแล้ว",
      icon: <History size={24} />,
      path: "/director/assigned-work",
      colorClass: "bg-green-100 text-green-600 dark:bg-green-500/20 dark:text-green-400"
    },
    {
      title: "จัดการข่าวสารประชาสัมพันธ์",
      description: "จัดการข่าวสาร Popup หน้าแรก (เพิ่ม/ลบ/แก้ไข)",
      icon: <Megaphone size={24} />,
      path: "/general-affairs/news",
      colorClass: "bg-purple-100 text-purple-600 dark:bg-purple-500/20 dark:text-purple-400"
    },
    {
      title: "ทะเบียนหนังสือ",
      description: "ทะเบียนหนังสือรับ / ส่ง / คำสั่ง / ประกาศ ตรวจสอบย้อนหลังได้",
      icon: <BookOpen size={24} />,
      path: "/general-affairs/registry",
      colorClass: "bg-teal-100 text-teal-600 dark:bg-teal-500/20 dark:text-teal-400"
    }
  ];

  return (
    <MainLayout>
      <div className="min-h-screen transition-colors duration-300">
        {/* ── STICKY HEADER ── */}
        <div className="sticky top-0 z-30 bg-white/95 dark:bg-[#111318]/95 backdrop-blur border-b border-slate-200 dark:border-white/5 px-4 py-3 flex items-center justify-between gap-4 shadow-sm">
          <div className="flex items-center gap-3 min-w-0">
            <BackButton to="/home" />
            <div className="h-5 w-px bg-slate-200 dark:bg-white/10" />
            <div className="min-w-0">
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wide">งานธุรการ</p>
              <h1 className="text-sm font-black text-slate-800 dark:text-white truncate">ระบบงานธุรการโรงเรียน</h1>
            </div>
          </div>
        </div>

        <div className="p-4 sm:p-8">
          <div className="max-w-7xl mx-auto">
            <p className="text-gray-500 dark:text-gray-400 text-lg mb-8">
              ยินดีต้อนรับ, <span className="text-indigo-600 dark:text-indigo-400 font-semibold">{displayName}</span>
            </p>

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

                  <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-2 group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition-colors">
                    {item.title}
                  </h3>

                  <p className="text-gray-500 dark:text-gray-400 text-sm leading-relaxed mb-6 flex-grow">
                    {item.description}
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
        </div>
      </div>
    </MainLayout>
  );
};

export default GeneralAffairsHome;