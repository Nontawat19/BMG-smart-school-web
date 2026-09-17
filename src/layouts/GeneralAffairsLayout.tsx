import React, { useEffect, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { useSelector, useDispatch } from "react-redux";
import { RootState } from "../store";
import { useTheme } from "../ThemeContext";
import { useSchoolScope } from "@/hooks/useEffectiveSchool";
import { fetchSchoolSettings } from "@/store/slices/schoolSettingsSlice";
import ProfileAvatar from "@/components/Shared/ProfileAvatar";
import defaultProfile from "@/assets/profile.png";
import AIAssistantWidget from "@/pages/AIAssistant/AIAssistantWidget";
import {
  FaBriefcase,
  FaHome,
  FaFileAlt,
  FaFileSignature,
  FaHistory,
  FaBookOpen,
  FaBullhorn,
  FaSun,
  FaMoon,
  FaArrowLeft,
  FaBars,
  FaTimes,
} from "react-icons/fa";

interface GeneralAffairsLayoutProps {
  children: React.ReactNode;
}

const GeneralAffairsLayout: React.FC<GeneralAffairsLayoutProps> = ({ children }) => {
  const location = useLocation();
  const navigate = useNavigate();
  const dispatch = useDispatch();
  const { isDarkMode, toggleTheme } = useTheme();

  const currentUser = useSelector((state: RootState) => state.auth.user);
  const { schoolId: settingsSchoolId, schoolName, logoUrl, status: schoolSettingsStatus } = useSelector(
    (state: RootState) => state.schoolSettings
  );
  const { effectiveSchoolId } = useSchoolScope();

  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  useEffect(() => {
    if (isDarkMode) {
      document.documentElement.classList.add("dark");
    } else {
      document.documentElement.classList.remove("dark");
    }
  }, [isDarkMode]);

  useEffect(() => {
    if (effectiveSchoolId && settingsSchoolId !== effectiveSchoolId && schoolSettingsStatus !== "loading") {
      dispatch(fetchSchoolSettings(effectiveSchoolId) as any);
    }
  }, [effectiveSchoolId, settingsSchoolId, schoolSettingsStatus, dispatch]);

  useEffect(() => {
    document.title = "ระบบงานธุรการและสารบรรณ | BMG Smart School";
  }, []);

  const navItems = [
    { label: "หน้าหลัก", path: "/general-affairs/home", icon: <FaHome size={14} /> },
    { label: "หนังสือรับ (ประทับตรา)", path: "/general-affairs", icon: <FaFileAlt size={14} /> },
    { label: "เอกสารรอมอบหมาย", path: "/director/assignments", icon: <FaFileSignature size={14} /> },
    { label: "มอบหมายแล้ว", path: "/director/assigned-work", icon: <FaHistory size={14} /> },
    { label: "ทะเบียนหนังสือ", path: "/general-affairs/registry", icon: <FaBookOpen size={14} /> },
    { label: "ข่าวประชาสัมพันธ์", path: "/general-affairs/news", icon: <FaBullhorn size={14} /> },
  ];

  const handleBackToMain = () => {
    if (window.opener && window.history.length <= 1) {
      window.close();
    } else {
      navigate("/home");
    }
  };

  return (
    <div className="min-h-screen bg-[#f9fafb] dark:bg-[#1e1f21] text-gray-900 dark:text-gray-100 flex flex-col transition-colors duration-300">
      {/* ── Standalone General Affairs Top Navbar ── */}
      <header className="sticky top-0 z-50 bg-white/95 dark:bg-[#2a2b2f]/95 backdrop-blur border-b border-slate-200 dark:border-white/10 shadow-sm">
        <div className="w-full px-3 sm:px-6 py-2.5 flex items-center justify-between gap-3">
          {/* Brand & System Title */}
          <div className="flex items-center gap-3 min-w-0">
            {logoUrl ? (
              <img src={logoUrl} alt="Logo" className="w-9 h-9 rounded-full object-cover bg-white flex-shrink-0" />
            ) : (
              <div className="w-9 h-9 rounded-lg bg-indigo-600 text-white flex items-center justify-center flex-shrink-0 shadow">
                <FaBriefcase size={17} />
              </div>
            )}
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span className="text-xs sm:text-sm font-bold text-gray-800 dark:text-white truncate">
                  {schoolName || "โรงเรียน"}
                </span>
                <span className="hidden md:inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-indigo-100 text-indigo-700 dark:bg-indigo-950/60 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800/50">
                  <FaBriefcase size={9} />
                  <span>ระบบงานธุรการ</span>
                </span>
              </div>
              <p className="text-[11px] text-gray-500 dark:text-gray-400 hidden sm:block">
                ระบบงานธุรการและสารบรรณอิเล็กทรอนิกส์
              </p>
            </div>
          </div>

          {/* Desktop Navigation Links */}
          <nav className="hidden xl:flex items-center gap-1 bg-slate-100 dark:bg-white/5 p-1 rounded-xl border border-slate-200/80 dark:border-white/5">
            {navItems.map((item) => {
              const isActive =
                item.path === "/general-affairs"
                  ? location.pathname === "/general-affairs"
                  : location.pathname.startsWith(item.path);
              return (
                <Link
                  key={item.path}
                  to={item.path}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                    isActive
                      ? "bg-white dark:bg-[#212226] text-indigo-600 dark:text-indigo-400 shadow-sm"
                      : "text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white hover:bg-white/50 dark:hover:bg-white/5"
                  }`}
                >
                  <span className={isActive ? "text-indigo-600 dark:text-indigo-400" : "text-gray-400"}>
                    {item.icon}
                  </span>
                  <span>{item.label}</span>
                </Link>
              );
            })}
          </nav>

          {/* Right Actions: Theme + User + Back */}
          <div className="flex items-center gap-2 sm:gap-3 flex-shrink-0">
            {/* Theme Toggle */}
            <button
              type="button"
              onClick={toggleTheme}
              className="w-8 h-8 rounded-lg flex items-center justify-center text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-white hover:bg-gray-100 dark:hover:bg-white/10 transition-colors cursor-pointer"
              title={isDarkMode ? "เปลี่ยนเป็นโหมดสว่าง" : "เปลี่ยนเป็นโหมดมืด"}
            >
              {isDarkMode ? <FaSun size={14} className="text-amber-400" /> : <FaMoon size={14} />}
            </button>

            {/* Profile */}
            <div className="hidden sm:flex items-center gap-2 pl-2 border-l border-gray-200 dark:border-gray-700">
              <ProfileAvatar
                src={(currentUser as any)?.profileUrl || defaultProfile}
                onError={(e) => (e.currentTarget.src = defaultProfile)}
                className="w-8 h-8 cursor-pointer"
                onClick={() => navigate("/profile")}
              />
              <span className="text-xs font-semibold text-gray-700 dark:text-gray-200 max-w-[120px] truncate">
                {(currentUser as any)?.displayName || (currentUser as any)?.fullName || "ผู้ใช้งาน"}
              </span>
            </div>

            {/* Back to main system / Close window button */}
            <button
              type="button"
              onClick={handleBackToMain}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-slate-100 dark:bg-white/10 hover:bg-slate-200 dark:hover:bg-white/15 text-slate-700 dark:text-slate-200 transition-colors cursor-pointer shadow-sm border border-slate-200 dark:border-white/10"
              title="กลับสู่ระบบโรงเรียนหลัก"
            >
              <FaArrowLeft size={11} />
              <span className="hidden sm:inline">กลับระบบหลัก</span>
            </button>

            {/* Mobile Menu Toggle */}
            <button
              type="button"
              onClick={() => setIsMobileMenuOpen((prev) => !prev)}
              className="xl:hidden w-8 h-8 rounded-lg flex items-center justify-center text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-white/10 cursor-pointer"
              title="เปิดเมนูงานธุรการ"
            >
              {isMobileMenuOpen ? <FaTimes size={16} /> : <FaBars size={16} />}
            </button>
          </div>
        </div>

        {/* Mobile Navigation Drawer */}
        {isMobileMenuOpen && (
          <div className="xl:hidden border-t border-slate-200 dark:border-white/10 bg-white dark:bg-[#2a2b2f] px-4 py-3 space-y-1 animate-fade-in shadow-lg">
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2">
              เมนูระบบงานธุรการ
            </p>
            {navItems.map((item) => {
              const isActive =
                item.path === "/general-affairs"
                  ? location.pathname === "/general-affairs"
                  : location.pathname.startsWith(item.path);
              return (
                <Link
                  key={item.path}
                  to={item.path}
                  onClick={() => setIsMobileMenuOpen(false)}
                  className={`flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs font-semibold transition-all ${
                    isActive
                      ? "bg-indigo-600 text-white font-bold shadow"
                      : "text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-white/10"
                  }`}
                >
                  <span className={isActive ? "text-white" : "text-gray-400"}>{item.icon}</span>
                  <span>{item.label}</span>
                </Link>
              );
            })}
          </div>
        )}
      </header>

      {/* ── Main Full-Width Content (No Left Sidebar, completely standalone) ── */}
      <main className="flex-1 w-full flex flex-col">{children}</main>

      <AIAssistantWidget />
    </div>
  );
};

export default GeneralAffairsLayout;
