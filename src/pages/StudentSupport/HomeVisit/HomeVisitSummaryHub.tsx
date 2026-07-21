import React from "react";
import { useNavigate } from "react-router-dom";
import MainLayout from "@/layouts/MainLayout";
import { BarChart3, Users, FileText, TrendingUp, ChevronLeft, ArrowRight, MapPin, Layers, User } from "lucide-react";
import { motion } from "framer-motion";

const menus = [
    {
        num: "01",
        title: "สรุปรายห้อง",
        description: "ดูสถิติการเยี่ยมบ้านเฉพาะห้องเรียนที่เลือก พร้อมกราฟวงกลมและตารางกลุ่มเสี่ยง",
        icon: BarChart3,
        gradient: "from-indigo-500 to-blue-600",
        lightGradient: "from-indigo-50 to-blue-50",
        darkGradient: "from-indigo-950/40 to-blue-950/30",
        accent: "bg-indigo-500",
        textColor: "text-indigo-600 dark:text-indigo-400",
        badgeColor: "bg-indigo-100 dark:bg-indigo-900/50 text-indigo-700 dark:text-indigo-300",
        badgeText: "รายห้อง",
        route: "/student-support/home-visit/summary/classroom",
    },
    {
        num: "02",
        title: "รายงานรายคน",
        description: "ค้นหา/กรองนักเรียนรายบุคคล ดูสถานะการเยี่ยม และพิมพ์แบบฟอร์มรายคนได้ทันที",
        icon: User,
        gradient: "from-cyan-500 to-sky-600",
        lightGradient: "from-cyan-50 to-sky-50",
        darkGradient: "from-cyan-950/40 to-sky-950/30",
        accent: "bg-cyan-500",
        textColor: "text-cyan-600 dark:text-cyan-400",
        badgeColor: "bg-cyan-100 dark:bg-cyan-900/50 text-cyan-700 dark:text-cyan-300",
        badgeText: "รายคน",
        route: "/student-support/home-visit/summary/individual",
    },
    {
        num: "03",
        title: "สรุปทั้งหมดทุกห้อง",
        description: "ภาพรวมการเยี่ยมบ้านของทุกห้องเรียนในโรงเรียน เปรียบเทียบสถิติระหว่างห้อง",
        icon: Users,
        gradient: "from-violet-500 to-purple-600",
        lightGradient: "from-violet-50 to-purple-50",
        darkGradient: "from-violet-950/40 to-purple-950/30",
        accent: "bg-violet-500",
        textColor: "text-violet-600 dark:text-violet-400",
        badgeColor: "bg-violet-100 dark:bg-violet-900/50 text-violet-700 dark:text-violet-300",
        badgeText: "ทุกห้อง",
        route: "/student-support/home-visit/summary/all",
    },
    {
        num: "04",
        title: "สรุปแบบช่วงชั้น",
        description: "รวมสถิติการเยี่ยมบ้านตามช่วงชั้น เช่น ประถมต้น ประถมปลาย มัธยมต้น มัธยมปลาย",
        icon: Layers,
        gradient: "from-orange-500 to-amber-600",
        lightGradient: "from-orange-50 to-amber-50",
        darkGradient: "from-orange-950/40 to-amber-950/30",
        accent: "bg-orange-500",
        textColor: "text-orange-600 dark:text-orange-400",
        badgeColor: "bg-orange-100 dark:bg-orange-900/50 text-orange-700 dark:text-orange-300",
        badgeText: "ช่วงชั้น",
        route: "/student-support/home-visit/summary/level-range",
    },
    {
        num: "05",
        title: "สรุป สพฐ.",
        description: "รายงานสรุปตามแบบฟอร์มมาตรฐาน สพฐ. พร้อมส่งออกเป็น PDF ได้ทันที",
        icon: FileText,
        gradient: "from-emerald-500 to-teal-600",
        lightGradient: "from-emerald-50 to-teal-50",
        darkGradient: "from-emerald-950/40 to-teal-950/30",
        accent: "bg-emerald-500",
        textColor: "text-emerald-600 dark:text-emerald-400",
        badgeColor: "bg-emerald-100 dark:bg-emerald-900/50 text-emerald-700 dark:text-emerald-300",
        badgeText: "สพฐ.",
        route: "/student-support/home-visit/summary/obec",
    },
    {
        num: "06",
        title: "ติดตามการเยี่ยมบ้าน",
        description: "แสดงความคืบหน้าเป็นเปอร์เซ็นต์และกราฟแท่ง แยกรายห้องและภาพรวมทั้งโรงเรียน",
        icon: TrendingUp,
        gradient: "from-rose-500 to-pink-600",
        lightGradient: "from-rose-50 to-pink-50",
        darkGradient: "from-rose-950/40 to-pink-950/30",
        accent: "bg-rose-500",
        textColor: "text-rose-600 dark:text-rose-400",
        badgeColor: "bg-rose-100 dark:bg-rose-900/50 text-rose-700 dark:text-rose-300",
        badgeText: "ติดตาม",
        route: "/student-support/home-visit/summary/tracking",
    },
];

const HomeVisitSummaryHub: React.FC = () => {
    const navigate = useNavigate();

    return (
        <MainLayout>
            <div className="min-h-screen bg-gray-50 dark:bg-[#1a1b1e]">

                {/* Hero Header */}
                <div className="bg-white dark:bg-[#212326] border-b border-gray-100 dark:border-gray-800">
                    <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
                        <div className="flex items-center gap-4">
                            <button
                                onClick={() => navigate("/student-support/home-visit")}
                                className="flex-shrink-0 p-2.5 bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-600 dark:text-gray-400 rounded-xl transition-all active:scale-95"
                            >
                                <ChevronLeft size={20} />
                            </button>
                            <div className="flex items-center gap-3 min-w-0">
                                <div className="flex-shrink-0 w-10 h-10 bg-gradient-to-br from-pink-500 to-rose-600 rounded-xl flex items-center justify-center shadow-lg shadow-pink-500/25">
                                    <MapPin size={18} className="text-white" />
                                </div>
                                <div className="min-w-0">
                                    <h1 className="text-xl font-black text-gray-900 dark:text-white leading-tight">
                                        รายงานสรุปการเยี่ยมบ้าน
                                    </h1>
                                    <p className="text-sm text-gray-400 dark:text-gray-500 font-medium">เลือกประเภทรายงานที่ต้องการดู</p>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Menu Cards */}
                <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        {menus.map((menu, idx) => {
                            const Icon = menu.icon;
                            return (
                                <motion.button
                                    key={idx}
                                    initial={{ opacity: 0, y: 16 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    transition={{ delay: idx * 0.07, ease: "easeOut" }}
                                    onClick={() => navigate(menu.route)}
                                    className="group relative bg-white dark:bg-[#25262a] rounded-2xl border border-gray-100 dark:border-gray-800 hover:border-gray-200 dark:hover:border-gray-600 shadow-sm hover:shadow-lg dark:hover:shadow-black/30 transition-all duration-200 text-left overflow-hidden active:scale-[0.985]"
                                >
                                    {/* Colored top-bar accent */}
                                    <div className={`absolute top-0 left-0 right-0 h-0.5 bg-gradient-to-r ${menu.gradient} opacity-0 group-hover:opacity-100 transition-opacity duration-200`} />

                                    <div className="p-6">
                                        <div className="flex items-start justify-between mb-5">
                                            {/* Icon */}
                                            <div className={`w-12 h-12 rounded-xl bg-gradient-to-br ${menu.gradient} flex items-center justify-center shadow-md`}>
                                                <Icon size={22} className="text-white" />
                                            </div>
                                            {/* Number + Badge */}
                                            <div className="flex items-center gap-2">
                                                <span className={`text-[10px] font-black px-2.5 py-1 rounded-lg tracking-wider ${menu.badgeColor}`}>
                                                    {menu.badgeText}
                                                </span>
                                                <span className="text-[11px] font-black text-gray-200 dark:text-gray-700 tabular-nums">
                                                    {menu.num}
                                                </span>
                                            </div>
                                        </div>

                                        <h2 className="text-[17px] font-black text-gray-900 dark:text-white mb-2 leading-snug">
                                            {menu.title}
                                        </h2>
                                        <p className="text-[13px] text-gray-500 dark:text-gray-400 leading-relaxed mb-5">
                                            {menu.description}
                                        </p>

                                        {/* Footer link */}
                                        <div className={`flex items-center gap-1.5 text-[12px] font-bold ${menu.textColor} group-hover:gap-2.5 transition-all duration-150`}>
                                            <span>เปิดรายงาน</span>
                                            <ArrowRight size={13} className="group-hover:translate-x-0.5 transition-transform duration-150" />
                                        </div>
                                    </div>
                                </motion.button>
                            );
                        })}
                    </div>

                    {/* Bottom hint */}
                    <motion.p
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        transition={{ delay: 0.4 }}
                        className="text-center text-xs text-gray-400 dark:text-gray-600 font-medium mt-8"
                    >
                        ข้อมูลอัปเดตแบบ Real-time จาก Firebase
                    </motion.p>
                </div>
            </div>
        </MainLayout>
    );
};

export default HomeVisitSummaryHub;
