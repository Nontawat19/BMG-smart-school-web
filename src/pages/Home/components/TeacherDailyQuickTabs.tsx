import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Flag,
  Calendar,
  Compass,
  BarChart3,
  Award,
  FileText,
  Clock,
  Users,
  ShieldCheck,
  Send,
  CalendarCheck,
  FileSpreadsheet,
  CheckCircle2,
  FileCheck2,
  HelpCircle,
  Tent,
  ArrowUpRight,
  Sparkles,
} from 'lucide-react';

interface QuickActionItem {
  title: string;
  path: string | ((schoolId: string) => string);
  tag?: string;
  icon: React.ComponentType<{ size?: number; className?: string; strokeWidth?: number }>;
  iconBg: string;
  iconColor: string;
  iconBorder: string;
}

interface QuickTab {
  id: string;
  number: string;
  label: string;
  shortLabel?: string;
  icon: React.ComponentType<{ size?: number; className?: string; strokeWidth?: number }>;
  activeGradient: string;
  activeShadow: string;
  accentText: string;
  items: QuickActionItem[];
}

interface Props {
  schoolId?: string | null;
}

export const TeacherDailyQuickTabs: React.FC<Props> = ({ schoolId = '' }) => {
  const navigate = useNavigate();

  const tabs: QuickTab[] = [
    {
      id: 'flag',
      number: '1',
      label: 'กิจกรรมหน้าแถว',
      shortLabel: 'หน้าแถว',
      icon: Flag,
      activeGradient: 'from-amber-500 to-orange-500',
      activeShadow: 'shadow-amber-500/25',
      accentText: 'text-amber-400',
      items: [
        {
          title: 'เช็คชื่อกิจกรรมหน้าแถว',
          path: '/academic/flag-ceremony',
          tag: 'หน้าเสาธง',
          icon: Flag,
          iconBg: 'bg-amber-500/10 dark:bg-amber-500/15',
          iconColor: 'text-amber-600 dark:text-amber-400',
          iconBorder: 'border-amber-500/20 dark:border-amber-500/30',
        },
        {
          title: 'เช็คชื่อลงเขตพื้นที่',
          path: '/academic/daily-attendance-check',
          tag: 'ส่งเขตพื้นที่',
          icon: Send,
          iconBg: 'bg-orange-500/10 dark:bg-orange-500/15',
          iconColor: 'text-orange-600 dark:text-orange-400',
          iconBorder: 'border-orange-500/20 dark:border-orange-500/30',
        },
        {
          title: 'สถิติหน้าแถวย้อนหลัง',
          path: '/academic/student-attendance-date-selection',
          tag: 'ดูย้อนหลัง',
          icon: CalendarCheck,
          iconBg: 'bg-yellow-500/10 dark:bg-yellow-500/15',
          iconColor: 'text-yellow-600 dark:text-yellow-400',
          iconBorder: 'border-yellow-500/20 dark:border-yellow-500/30',
        },
      ],
    },
    {
      id: 'schedule',
      number: '2',
      label: 'ตารางสอน / เช็คชื่อวิชา',
      shortLabel: 'ตารางสอน/วิชา',
      icon: Calendar,
      activeGradient: 'from-blue-600 to-indigo-600',
      activeShadow: 'shadow-indigo-500/25',
      accentText: 'text-indigo-400',
      items: [
        {
          title: 'ตารางสอนของฉัน / เช็คชื่อรายวิชา',
          path: '/my-schedule',
          tag: 'ตารางส่วนตัว',
          icon: Calendar,
          iconBg: 'bg-blue-500/10 dark:bg-blue-500/15',
          iconColor: 'text-blue-600 dark:text-blue-400',
          iconBorder: 'border-blue-500/20 dark:border-blue-500/30',
        },
        {
          title: 'เช็คชื่อรายวิชา (เฉพาะวันนี้)',
          path: '/academic/classroom-attendance',
          tag: 'เฉพาะวันนี้',
          icon: Clock,
          iconBg: 'bg-indigo-500/10 dark:bg-indigo-500/15',
          iconColor: 'text-indigo-600 dark:text-indigo-400',
          iconBorder: 'border-indigo-500/20 dark:border-indigo-500/30',
        },
        {
          title: 'ตารางสอนรวมโรงเรียน',
          path: '/academic/teacher-schedule-view',
          tag: 'ทั้งโรงเรียน',
          icon: Users,
          iconBg: 'bg-sky-500/10 dark:bg-sky-500/15',
          iconColor: 'text-sky-600 dark:text-sky-400',
          iconBorder: 'border-sky-500/20 dark:border-sky-500/30',
        },
      ],
    },
    {
      id: 'activities',
      number: '3',
      label: 'เช็คชื่อกิจกรรม (ยว/ลส/ชุมนุม)',
      shortLabel: 'กิจกรรม (ยว/ลส/ชุมนุม)',
      icon: Compass,
      activeGradient: 'from-emerald-500 to-teal-600',
      activeShadow: 'shadow-emerald-500/25',
      accentText: 'text-emerald-400',
      items: [
        {
          title: 'กิจกรรมพัฒนาผู้เรียน (ยว. / ลส.)',
          path: '/academic/learner-activity-attendance',
          tag: 'ลูกเสือ-ยว.',
          icon: Tent,
          iconBg: 'bg-emerald-500/10 dark:bg-emerald-500/15',
          iconColor: 'text-emerald-600 dark:text-emerald-400',
          iconBorder: 'border-emerald-500/20 dark:border-emerald-500/30',
        },
        {
          title: 'กิจกรรมชุมนุม',
          path: '/academic/club-attendance',
          tag: 'ชุมนุม',
          icon: CheckCircle2,
          iconBg: 'bg-teal-500/10 dark:bg-teal-500/15',
          iconColor: 'text-teal-600 dark:text-teal-400',
          iconBorder: 'border-teal-500/20 dark:border-teal-500/30',
        },
        {
          title: 'กิจกรรมแนะแนว',
          path: '/academic/guidance-attendance',
          tag: 'แนะแนว',
          icon: HelpCircle,
          iconBg: 'bg-cyan-500/10 dark:bg-cyan-500/15',
          iconColor: 'text-cyan-600 dark:text-cyan-400',
          iconBorder: 'border-cyan-500/20 dark:border-cyan-500/30',
        },
        {
          title: 'กิจกรรมโฮมรูม (Homeroom)',
          path: '/academic/homeroom-attendance',
          tag: 'โฮมรูม',
          icon: Users,
          iconBg: 'bg-green-500/10 dark:bg-green-500/15',
          iconColor: 'text-green-600 dark:text-green-400',
          iconBorder: 'border-green-500/20 dark:border-green-500/30',
        },
      ],
    },
    {
      id: 'attendance_reports',
      number: '4',
      label: 'รายงานการมาเรียน',
      shortLabel: 'รายงานมาเรียน',
      icon: BarChart3,
      activeGradient: 'from-purple-600 to-violet-600',
      activeShadow: 'shadow-purple-500/25',
      accentText: 'text-purple-400',
      items: [
        {
          title: 'ประวัติการเช็คชื่อรายวิชา',
          path: '/academic/classroom-attendance-history',
          tag: 'ดูย้อนหลัง',
          icon: CalendarCheck,
          iconBg: 'bg-purple-500/10 dark:bg-purple-500/15',
          iconColor: 'text-purple-600 dark:text-purple-400',
          iconBorder: 'border-purple-500/20 dark:border-purple-500/30',
        },
        {
          title: 'สรุปการเข้าเรียนประจำห้อง',
          path: '/academic/classroom-attendance-summary',
          tag: 'สรุปรายห้อง',
          icon: BarChart3,
          iconBg: 'bg-violet-500/10 dark:bg-violet-500/15',
          iconColor: 'text-violet-600 dark:text-violet-400',
          iconBorder: 'border-violet-500/20 dark:border-violet-500/30',
        },
        {
          title: 'สถิติการมาเรียนนักเรียน',
          path: '/academic/students-attendance-summary',
          tag: 'รายบุคคล',
          icon: FileSpreadsheet,
          iconBg: 'bg-fuchsia-500/10 dark:bg-fuchsia-500/15',
          iconColor: 'text-fuchsia-600 dark:text-fuchsia-400',
          iconBorder: 'border-fuchsia-500/20 dark:border-fuchsia-500/30',
        },
        {
          title: 'รายงานสถิติประจำวัน',
          path: '/academic/daily-classroom-attendance-summary',
          tag: 'ภาพรวม',
          icon: CheckCircle2,
          iconBg: 'bg-indigo-500/10 dark:bg-indigo-500/15',
          iconColor: 'text-indigo-600 dark:text-indigo-400',
          iconBorder: 'border-indigo-500/20 dark:border-indigo-500/30',
        },
      ],
    },
    {
      id: 'behavior',
      number: '5',
      label: 'บันทึกคะแนนพฤติกรรม',
      shortLabel: 'คะแนนพฤติกรรม',
      icon: Award,
      activeGradient: 'from-rose-500 to-pink-600',
      activeShadow: 'shadow-rose-500/25',
      accentText: 'text-rose-400',
      items: [
        {
          title: 'บันทึกคะแนนความประพฤติ',
          path: (sId: string) => (sId ? `/school/${sId}/students/behavior` : '/student-support'),
          tag: 'เพิ่ม/ตัดคะแนน',
          icon: Award,
          iconBg: 'bg-rose-500/10 dark:bg-rose-500/15',
          iconColor: 'text-rose-600 dark:text-rose-400',
          iconBorder: 'border-rose-500/20 dark:border-rose-500/30',
        },
        {
          title: 'รายงานพฤติกรรมรายห้อง',
          path: '/academic/student-behavior-class-report',
          tag: 'รายงานรายห้อง',
          icon: BarChart3,
          iconBg: 'bg-pink-500/10 dark:bg-pink-500/15',
          iconColor: 'text-pink-600 dark:text-pink-400',
          iconBorder: 'border-pink-500/20 dark:border-pink-500/30',
        },
        {
          title: 'วิเคราะห์พฤติกรรมเชิงลึก',
          path: '/student-support/behavior-analysis',
          tag: 'วิเคราะห์เชิงลึก',
          icon: ShieldCheck,
          iconBg: 'bg-red-500/10 dark:bg-red-500/15',
          iconColor: 'text-red-600 dark:text-red-400',
          iconBorder: 'border-red-500/20 dark:border-red-500/30',
        },
      ],
    },
    {
      id: 'reports',
      number: '6',
      label: 'รายงาน',
      shortLabel: 'รายงาน/ปพ.',
      icon: FileText,
      activeGradient: 'from-sky-500 to-blue-600',
      activeShadow: 'shadow-sky-500/25',
      accentText: 'text-sky-400',
      items: [
        {
          title: 'ติดตามการจัดทำ ปพ.5',
          path: '/academic/porbor5-tracking-report',
          tag: 'เล่ม ปพ.5',
          icon: FileCheck2,
          iconBg: 'bg-sky-500/10 dark:bg-sky-500/15',
          iconColor: 'text-sky-600 dark:text-sky-400',
          iconBorder: 'border-sky-500/20 dark:border-sky-500/30',
        },
        {
          title: 'บันทึกข้อความส่ง ปพ.5',
          path: '/academic/porbor5-submission-memo',
          tag: 'บันทึกข้อความ',
          icon: FileText,
          iconBg: 'bg-blue-500/10 dark:bg-blue-500/15',
          iconColor: 'text-blue-600 dark:text-blue-400',
          iconBorder: 'border-blue-500/20 dark:border-blue-500/30',
        },
        {
          title: 'รายงานนักเรียนติด มส.',
          path: '/academic/ms-report',
          tag: 'ติด มส.',
          icon: Clock,
          iconBg: 'bg-indigo-500/10 dark:bg-indigo-500/15',
          iconColor: 'text-indigo-600 dark:text-indigo-400',
          iconBorder: 'border-indigo-500/20 dark:border-indigo-500/30',
        },
        {
          title: 'รายงานผลการเรียน 0 ร มส.',
          path: '/academic/zero-r-ms-report',
          tag: 'แก้ 0 ร มส.',
          icon: FileSpreadsheet,
          iconBg: 'bg-slate-500/10 dark:bg-slate-500/15',
          iconColor: 'text-slate-600 dark:text-slate-400',
          iconBorder: 'border-slate-500/20 dark:border-slate-500/30',
        },
      ],
    },
  ];

  const [activeTabId, setActiveTabId] = useState<string>(() => {
    return localStorage.getItem('teacher_home_quick_tab') || 'flag';
  });

  const handleTabChange = (tabId: string) => {
    setActiveTabId(tabId);
    localStorage.setItem('teacher_home_quick_tab', tabId);
  };

  const currentTab = tabs.find((t) => t.id === activeTabId) || tabs[0];

  const handleNavigate = (path: string | ((sId: string) => string)) => {
    const target = typeof path === 'function' ? path(schoolId || '') : path;
    if (target) {
      navigate(target);
    }
  };

  return (
    <div className="relative overflow-hidden rounded-2xl bg-white/90 dark:bg-[#1a1c22]/95 backdrop-blur-xl border border-gray-200/80 dark:border-white/[0.08] shadow-sm dark:shadow-xl dark:shadow-black/20 p-2 sm:p-2.5 mb-5 transition-all">
      {/* Subtle Ambient Light Effect */}
      <div className="absolute -top-12 left-1/4 w-80 h-16 bg-gradient-to-r from-indigo-500/10 via-purple-500/10 to-pink-500/10 dark:from-indigo-500/20 dark:via-purple-500/15 dark:to-pink-500/15 rounded-full blur-2xl pointer-events-none" />

      {/* Row 1: Segmented Dock Tab Bar */}
      <div className="flex items-center gap-1.5 sm:gap-2 relative z-10">
        {/* Left Badge: Quick Actions Indicator */}
        <div className="hidden sm:flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl bg-gray-100/80 dark:bg-white/[0.05] border border-gray-200/70 dark:border-white/[0.08] text-gray-700 dark:text-gray-300 text-[11px] font-bold tracking-wide shrink-0 select-none shadow-xs">
          <Sparkles size={12} className="text-amber-500 fill-amber-500/30" />
          <span>เมนูลัดประจำวัน</span>
        </div>

        {/* Segmented Pill Track */}
        <div className="flex items-center gap-1 overflow-x-auto scrollbar-none p-1 bg-gray-100/90 dark:bg-black/35 rounded-xl border border-gray-200/60 dark:border-white/[0.05] flex-1 min-w-0">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            const isActive = tab.id === activeTabId;
            return (
              <button
                key={tab.id}
                onClick={() => handleTabChange(tab.id)}
                className={`group flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 rounded-lg text-[11px] sm:text-xs whitespace-nowrap transition-all duration-200 cursor-pointer shrink-0 select-none ${
                  isActive
                    ? `bg-gradient-to-r ${tab.activeGradient} text-white font-bold shadow-md ${tab.activeShadow}`
                    : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white hover:bg-white/60 dark:hover:bg-white/[0.06] font-medium'
                }`}
              >
                <span
                  className={`inline-flex items-center justify-center w-4 h-4 rounded-full text-[10px] font-bold ${
                    isActive
                      ? 'bg-white/20 text-white'
                      : 'bg-gray-200/80 dark:bg-white/10 text-gray-500 dark:text-gray-400 group-hover:text-gray-800 dark:group-hover:text-white'
                  }`}
                >
                  {tab.number}
                </span>
                <Icon size={12} strokeWidth={isActive ? 2.5 : 2} className="shrink-0" />
                <span className="hidden sm:inline">{tab.label}</span>
                <span className="sm:hidden">{tab.shortLabel || tab.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Row 2: Sleek Interactive Action Cards */}
      <div className="mt-2 pt-2 border-t border-gray-100 dark:border-white/[0.06] relative z-10">
        <div
          className={`grid gap-1.5 sm:gap-2 ${
            currentTab.items.length <= 3
              ? 'grid-cols-1 md:grid-cols-3'
              : 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-4'
          }`}
        >
          {currentTab.items.map((item, i) => {
            const ItemIcon = item.icon;
            return (
              <button
                key={i}
                onClick={() => handleNavigate(item.path)}
                className="group flex items-center justify-between gap-2 px-3 py-2 rounded-xl bg-white/70 dark:bg-white/[0.025] hover:bg-gray-50/90 dark:hover:bg-white/[0.06] border border-gray-200/70 dark:border-white/[0.07] hover:border-gray-300 dark:hover:border-white/[0.16] text-left transition-all duration-150 cursor-pointer shadow-xs hover:shadow-sm"
              >
                <div className="flex items-center gap-2 min-w-0 flex-1">
                  <div
                    className={`p-1.5 rounded-lg shrink-0 border transition-transform duration-200 group-hover:scale-105 ${item.iconBg} ${item.iconColor} ${item.iconBorder}`}
                  >
                    <ItemIcon size={13} strokeWidth={2.2} />
                  </div>
                  <span className="text-xs font-semibold text-gray-800 dark:text-gray-200 group-hover:text-gray-950 dark:group-hover:text-white transition-colors leading-snug">
                    {item.title}
                  </span>
                </div>
                <div className="flex items-center gap-1.5 shrink-0 ml-1">
                  {item.tag && (
                    <span className="text-[10px] font-medium px-1.5 py-0.5 rounded-md bg-gray-100 dark:bg-white/[0.05] text-gray-500 dark:text-gray-400 border border-gray-200/50 dark:border-white/[0.05] group-hover:border-gray-300/80 dark:group-hover:border-white/[0.1] transition-colors whitespace-nowrap">
                      {item.tag}
                    </span>
                  )}
                  <ArrowUpRight
                    size={13}
                    className="text-gray-400 dark:text-gray-500 group-hover:text-indigo-500 dark:group-hover:text-indigo-400 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-all duration-200 shrink-0"
                  />
                </div>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
};

export default TeacherDailyQuickTabs;

