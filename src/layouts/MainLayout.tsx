import React, { useEffect } from 'react';
import Navbar from "../components/Navbar/Navbar";
import LeftSidebar from "../components/Sidebar/LeftSidebar";
import { useSelector } from 'react-redux';
import { RootState } from '../store'; // 💡 ปรับ path ไปยัง store ของคุณให้ถูกต้อง
import { useTheme } from "../ThemeContext";
import { useSidebar } from "../SidebarContext";
import { useEffectiveSchoolId } from "@/hooks/useEffectiveSchool";

interface MainLayoutProps {
  children: React.ReactNode;
}

const MainLayout: React.FC<MainLayoutProps> = ({ children }) => {
  const { user } = useSelector((state: RootState) => state.auth);
  const schoolId = useEffectiveSchoolId();
  const { isDarkMode } = useTheme();
  const { isCollapsed: isSidebarCollapsed, toggleSidebar } = useSidebar();

  // จัดการ Dynamic Document Title และ Dark Mode
  useEffect(() => {
    // 🎨 จัดการ Dark Mode
    if (isDarkMode) {
      document.documentElement.classList.add("dark");
    } else {
      document.documentElement.classList.remove("dark");
    }

    // 🏷️ จัดการ Dynamic Title ตาม Path
    const path = window.location.pathname;
    let pageName = "";
    
    // ตั้งชื่อหน้าตาม Path
    if (path === "/" || path.includes("home")) pageName = "หน้าแรก";
    else if (path.includes("academic-admin") || path.includes("owner/hub")) pageName = "เมนูหลักผู้บริหาร";
    else if (path.includes("academic/schedule")) pageName = "จัดตารางสอน";
    else if (path.includes("academic/courses")) pageName = "หลักสูตร";
    else if (path.includes("academic/gradebook")) pageName = "ระบบวัดผล";
    else if (path.includes("attendance")) pageName = "ระบบเช็คชื่อ";
    else if (path.includes("human-resources")) pageName = "บริหารงานบุคคล";
    else if (path.includes("official-travel-request")) pageName = "สร้างคำขอไปราชการ";
    else if (path.includes("official-travel-history")) pageName = "ประวัติการไปราชการ";
    else if (path.includes("academic/enrollment-list")) pageName = "สรุปการลงทะเบียนรายวิชา";
    else if (path.includes("profile")) pageName = "โปรไฟล์ส่วนตัว";
    
    // กำหนด Title
    if (pageName) {
      document.title = `${pageName} | BMG Smart School`;
    } else {
      document.title = "BMG Smart School";
    }
  }, [isDarkMode, window.location.pathname]);

  return (
    <div className="relative min-h-screen bg-[#f9fafb] dark:bg-[#1e1f21] transition-colors duration-300 flex flex-col">
      <Navbar schoolId={schoolId} />

      <LeftSidebar
        isCollapsed={isSidebarCollapsed}
        toggleSidebar={toggleSidebar}
      />

      <div
        className={`flex-1 flex flex-col pt-[60px] transition-all duration-300 ${isSidebarCollapsed ? 'lg:pl-0' : 'lg:pl-[280px]'} min-h-[calc(100vh-60px)] bg-[#f9fafb] dark:bg-[#1e1f21] w-full`}
      >
        {children}
      </div>
    </div>
  );
};

export default MainLayout;
