import React, { useState } from "react";
import { useSelector } from "react-redux";
import { RootState } from "@/store";
import { Link, NavLink, useLocation } from "react-router-dom";
import { doc, onSnapshot } from "firebase/firestore";
import { firestore as db } from "../../firebase";
import LogoutButton from "@/components/LogoutButton";
import {
  FaChalkboardTeacher,
  FaUserGraduate,
  FaUsers,
  FaUsersCog,
  FaUserPlus,
  FaFileAlt,
  FaUserClock,
  FaTasks,
  FaHistory,
  FaClock,
  FaBook,
  FaFlag,
  FaFileMedicalAlt,
  FaListAlt,
  FaCog, // 📌 เพิ่มไอคอน
  FaIdCard,
  FaUserCheck,
  FaSchool,
  FaChevronDown,
  FaUserTie,
  FaChevronRight,
  FaAngleDoubleLeft,
  FaAngleDoubleRight,
  FaBriefcase,
  FaHandHoldingHeart,
  FaMoneyBillWave,
  FaCommentDots,
  FaPlane,
  FaFileExcel,
  FaBookOpen,
  FaExchangeAlt,
  FaGraduationCap,
  FaChartBar,
  FaShieldAlt
} from "react-icons/fa";

import defaultProfile from "@/assets/profile.png";

interface LeftSidebarProps {
  isMobile?: boolean;
  onClose?: () => void;
  isCollapsed?: boolean;
  toggleSidebar?: () => void;
}

import CanAccess from "../AccessControl/CanAccess";
import { ROLES, ROLE_LABELS, Role } from "@/constants/roles";
import { usePermissions } from "@/hooks/usePermissions";
import { isAttendanceEntryOnly } from "@/utils/attendanceRoles";
import { usePwaMode } from "@/hooks/usePwaMode";
import { PWA_ATTENDANCE_HUB_PATH, PWA_MY_SCHEDULE_PATH } from "@/utils/pwaMode";

const LeftSidebar: React.FC<LeftSidebarProps> = ({ isMobile, onClose, isCollapsed = false, toggleSidebar }) => {
  const location = useLocation();
  const { user: currentUser, roles: normalizedRoles, OWNER_ONLY, ADMIN_ACCESS, ACADEMIC_ACCESS, STAFF_ACCESS, ACADEMIC_STAFF, ACADEMIC_MANAGEMENT, TEACHER_OPERATIONAL, STUDENT_AFFAIRS_MANAGEMENT, STUDENT_SUPPORT_OPERATIONAL_ACCESS } = usePermissions();
  const isLoading = useSelector((state: RootState) => state.auth.loading);
  const schoolId = currentUser?.schoolId;
  const isOwnerRoute = location.pathname.startsWith("/owner/");
  const isPwaMode = usePwaMode();

  // ฟังก์ชันสำหรับสร้าง className ของ NavLink
  const navLinkClasses = ({ isActive }: { isActive: boolean }) =>
    `flex items-center gap-4 px-4 py-2.5 rounded-lg transition-colors duration-200 text-sm font-medium ${isActive
      ? "bg-sky-50 dark:bg-sky-500/20 text-sky-600 dark:text-sky-400 border-l-4 border-sky-500 dark:border-sky-400"
      : "text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-white/10 hover:text-gray-900 dark:hover:text-white"
    }`;

  const handleLinkClick = () => {
    if (isMobile && onClose) {
      onClose();
    }
  };

  const [features, setFeatures] = useState<any>({});

  React.useEffect(() => {
    if (schoolId && !isOwnerRoute) {
      const unsub = onSnapshot(doc(db, 'school-settings', schoolId), (doc) => {
        if (doc.exists()) {
          const data = doc.data();
          setFeatures({
            ...(data?.features || {}),
            ...(data?.academicSettings || {})
          });
        }
      });
      return () => unsub();
    }
    setFeatures({});
  }, [isOwnerRoute, schoolId]);

  const isEnabled = (key: string) => features[key] ?? true;

  // State สำหรับเปิด/ปิดหมวดหมู่เมนู
  const [openSections, setOpenSections] = useState<Record<string, boolean>>({
    admin: true,
    attendance: true,
    director: true,
    academic: true,
    data: true,
    add: true,
    owner: true,
    hr: true,
    support: true,
  });

  const toggleSection = (section: string) => {
    setOpenSections((prev) => ({ ...prev, [section]: !prev[section] }));
  };

  const renderSectionHeader = (title: string, sectionKey: string) => {
    return (
      <button
        type="button"
        className="flex items-center justify-between w-full px-4 mb-2 cursor-pointer text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 transition-colors bg-transparent border-0 p-0"
        onClick={() => toggleSection(sectionKey)}
        aria-expanded={openSections[sectionKey]}
        aria-label={`${title} ${openSections[sectionKey] ? 'ยุบ' : 'ขยาย'}`}
      >
        <span className="text-xs font-semibold tracking-wider uppercase select-none">{title}</span>
        {openSections[sectionKey] ? <FaChevronDown size={10} aria-hidden="true" /> : <FaChevronRight size={10} aria-hidden="true" />}
      </button>
    );
  };

  return (
    <>
      {/* Backdrop สำหรับ Mobile */}
      {isMobile && !isCollapsed && (
        <div
          className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[45] lg:hidden transition-opacity duration-300"
          onClick={onClose}
          aria-hidden="true"
        />
      )}

      <aside className={`fixed top-[60px] left-0 h-[calc(100vh-60px)] bg-white dark:bg-[#1c1c24] text-gray-900 dark:text-[#e4e6eb] transition-all duration-300 ${isMobile
        ? `z-50 shadow-2xl w-[280px] flex ${isCollapsed ? "-translate-x-full" : "translate-x-0"}`
        : `${isCollapsed ? "w-0" : "w-[280px]"} hidden lg:flex z-40`
        } overflow-hidden`}>
        <div className="w-[280px] h-full flex flex-col gap-6 p-4 overflow-y-auto scrollbar-thin scrollbar-thumb-gray-300 dark:scrollbar-thumb-gray-700 scrollbar-track-gray-100 dark:scrollbar-track-gray-900">

          {/* โปรไฟล์ผู้ใช้ */}
          {isPwaMode || isAttendanceEntryOnly(currentUser?.role) ? (
            <div
              className="flex items-center gap-3 p-2 rounded-xl text-inherit no-underline select-none"
            >
              {isLoading ? (
                <>
                  <div className="w-10 h-10 rounded-full bg-gray-200 dark:bg-gray-700 animate-pulse"></div>
                  <div className="flex-1">
                    <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-3/4 animate-pulse"></div>
                  </div>
                </>
              ) : (
                <>
                  <div className="w-11 h-11 min-w-[44px] min-h-[44px] shrink-0 rounded-full overflow-hidden border-2 border-gray-200 dark:border-gray-600 flex items-center justify-center bg-gray-100 dark:bg-gray-800">
                    <img
                      src={currentUser?.profileUrl || defaultProfile}
                      alt="Profile"
                      className="w-full h-full object-cover object-[center_20%] aspect-square"
                      onError={(e) => {
                        e.currentTarget.src = defaultProfile;
                      }}
                    />
                  </div>
                  <div className="flex flex-col min-w-0">
                    <span className="font-semibold text-base truncate">{currentUser?.fullName || "ไม่พบข้อมูล"}</span>
                    <span className="text-[10px] text-gray-500 truncate">
                      {normalizedRoles.map(r => ROLE_LABELS[r as Role] || r).join(', ')}
                    </span>
                  </div>
                </>
              )}
            </div>
          ) : (
            <Link
              to="/profile"
              className="flex items-center gap-3 p-2 rounded-xl hover:bg-gray-100 dark:hover:bg-white/5 transition-colors duration-200 text-inherit no-underline"
              onClick={handleLinkClick}
            >
              {isLoading ? (
                <>
                  <div className="w-10 h-10 rounded-full bg-gray-200 dark:bg-gray-700 animate-pulse"></div>
                  <div className="flex-1">
                    <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-3/4 animate-pulse"></div>
                  </div>
                </>
              ) : (
                <>
                  <div className="w-11 h-11 min-w-[44px] min-h-[44px] shrink-0 rounded-full overflow-hidden border-2 border-gray-200 dark:border-gray-600 flex items-center justify-center bg-gray-100 dark:bg-gray-800">
                    <img
                      src={currentUser?.profileUrl || defaultProfile}
                      alt="Profile"
                      className="w-full h-full object-cover object-[center_20%] aspect-square"
                      onError={(e) => {
                        e.currentTarget.src = defaultProfile;
                      }}
                    />
                  </div>
                  <div className="flex flex-col min-w-0">
                    <span className="font-semibold text-base truncate">{currentUser?.fullName || "ไม่พบข้อมูล"}</span>
                    <span className="text-[10px] text-gray-500 truncate">
                      {normalizedRoles.map(r => ROLE_LABELS[r as Role] || r).join(', ')}
                    </span>
                  </div>
                </>
              )}
            </Link>
          )}



          {/* เมนู */}
          <nav className="flex flex-col gap-4" onClick={(e) => { if ((e.target as HTMLElement).closest('a')) handleLinkClick() }}>
            {isPwaMode ? (
              <div className="flex flex-col gap-1">
                <NavLink to={PWA_ATTENDANCE_HUB_PATH} className={navLinkClasses}>
                  <FaUserCheck className="text-lg min-w-[18px]" />
                  <span>ระบบเช็คชื่อ</span>
                </NavLink>
                <NavLink to={PWA_MY_SCHEDULE_PATH} className={navLinkClasses}>
                  <FaChalkboardTeacher className="text-lg min-w-[18px]" />
                  <span>ตารางสอน</span>
                </NavLink>
              </div>
            ) : isAttendanceEntryOnly(currentUser?.role) ? (
              <div className="flex flex-col gap-1">
                <NavLink to="/attendance/checkin-out" className={navLinkClasses}>
                  <FaUserCheck className="text-lg min-w-[18px]" />
                  <span>ลงเวลาเข้า-ออก</span>
                </NavLink>
                <CanAccess roles={STUDENT_SUPPORT_OPERATIONAL_ACCESS}>
                  <NavLink to="/student-support/hub" className={navLinkClasses}>
                    <FaHandHoldingHeart className="text-lg min-w-[18px]" />
                    <span>ระบบดูแลช่วยเหลือนักเรียน</span>
                  </NavLink>
                </CanAccess>
                <CanAccess roles={STUDENT_AFFAIRS_MANAGEMENT}>
                  {isEnabled('studentAffairs') && (
                    <>
                      <NavLink to="/academic/hub/attendance" className={navLinkClasses}>
                        <FaChartBar className="text-lg min-w-[18px]" />
                        <span>รายงานกิจการนักเรียน</span>
                      </NavLink>
                      <NavLink to="/academic/hub/settings" className={navLinkClasses}>
                        <FaCog className="text-lg min-w-[18px]" />
                        <span>ตั้งค่าคะแนนพฤติกรรม</span>
                      </NavLink>
                    </>
                  )}
                </CanAccess>
              </div>
            ) : (
              <>
                {/* --- งานวิชาการ --- */}
                {isEnabled('academic') && (
                  <CanAccess roles={STAFF_ACCESS}>
                    <div className="flex flex-col gap-1">
                      <CanAccess roles={ACADEMIC_MANAGEMENT}>
                        <NavLink to="/academic/hub/registration" className={navLinkClasses}>
                          <FaIdCard className="text-lg min-w-[18px]" />
                          <span>งานทะเบียน</span>
                        </NavLink>
                      </CanAccess>
                      <NavLink to="/academic/hub/scheduling" className={navLinkClasses}>
                        <FaClock className="text-lg min-w-[18px]" />
                        <span>ตารางสอน</span>
                      </NavLink>
                      <NavLink to="/academic/hub/students" className={navLinkClasses}>
                        <FaUserGraduate className="text-lg min-w-[18px]" />
                        <span>ข้อมูลนักเรียน</span>
                      </NavLink>
                      <NavLink to="/academic/hub/personnel_info" className={navLinkClasses}>
                        <FaUserTie className="text-lg min-w-[18px]" />
                        <span>งานบุคลากร</span>
                      </NavLink>
                      <NavLink to="/academic/hub/attendance" className={navLinkClasses}>
                        <FaUserCheck className="text-lg min-w-[18px]" />
                        <span>ระบบเช็คชื่อ</span>
                      </NavLink>
                      <NavLink to="/academic/hub/activities" className={navLinkClasses}>
                        <FaFlag className="text-lg min-w-[18px]" />
                        <span>กิจกรรมและชุมนุม</span>
                      </NavLink>
                      <CanAccess roles={STUDENT_SUPPORT_OPERATIONAL_ACCESS}>
                        <NavLink to="/student-support/hub" className={navLinkClasses}>
                          <FaHandHoldingHeart className="text-lg min-w-[18px]" />
                          <span>ระบบดูแลช่วยเหลือนักเรียน</span>
                        </NavLink>
                      </CanAccess>
                      <NavLink to="/academic/hub/evaluation" className={navLinkClasses}>
                        <FaGraduationCap className="text-lg min-w-[18px]" />
                        <span>วัดผลและประเมินผล</span>
                      </NavLink>
                      <CanAccess roles={ACADEMIC_MANAGEMENT}>
                        <NavLink to="/academic/alumni-management" className={navLinkClasses}>
                          <FaHistory className="text-lg min-w-[18px]" />
                          <span>ทำเนียบศิษย์เก่า</span>
                        </NavLink>
                      </CanAccess>
                      <CanAccess roles={ACADEMIC_MANAGEMENT}>
                        <NavLink to="/academic/hub/settings" className={navLinkClasses}>
                          <FaCog className="text-lg min-w-[18px]" />
                          <span>การตั้งค่าระบบ</span>
                        </NavLink>
                      </CanAccess>
                      <CanAccess roles={[ROLES.STUDENT_AFFAIRS]}>
                        {isEnabled('studentAffairs') && (
                          <NavLink to="/academic/hub/settings" className={navLinkClasses}>
                            <FaCog className="text-lg min-w-[18px]" />
                            <span>ตั้งค่าคะแนนพฤติกรรม</span>
                          </NavLink>
                        )}
                      </CanAccess>
                    </div>
                  </CanAccess>
                )}
              </>
            )}
          </nav>

          {/* Owner Menu */}
          {!isPwaMode && (
            <CanAccess roles={OWNER_ONLY}>
              <div>
                {renderSectionHeader("เจ้าของระบบ", "owner")}
                <div className={!openSections["owner"] ? "hidden" : "block"}>
                  <NavLink to="/owner/hub" className={navLinkClasses}>
                    <FaShieldAlt className="text-lg min-w-[18px]" />
                    <span>จัดการระบบ (Owner)</span>
                  </NavLink>
                </div>
              </div>
            </CanAccess>
          )}

          <div className="mt-auto pt-4 border-t border-gray-200 dark:border-gray-700/50 flex flex-col gap-2">
            <LogoutButton className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-rose-50 dark:bg-rose-500/10 text-rose-600 dark:text-rose-400 rounded-lg hover:bg-rose-100 dark:hover:bg-rose-500/20 transition-colors duration-200 text-sm font-medium" />
            <p className="text-[10px] text-gray-400 dark:text-gray-500 px-4 mt-1 leading-relaxed text-center">
              © 2025-{new Date().getFullYear()} BMG Smart School. All rights reserved.
            </p>
          </div>
        </div>
      </aside >

      {/* ปุ่มพับ Sidebar (แสดงเฉพาะ Desktop) */}
      {
        !isMobile && toggleSidebar && (
          <button
            onClick={toggleSidebar}
            className={`hidden lg:block fixed top-[180px] z-[45] bg-white dark:bg-[#2a2b2f] border border-gray-200 dark:border-gray-600 rounded-r-md p-2 text-gray-500 hover:text-indigo-600 shadow-md transition-all duration-300 ${isCollapsed ? 'left-0' : 'left-[280px]'}`}
            aria-label={isCollapsed ? "แสดงเมนูนำทาง" : "ซ่อนเมนูนำทาง"}
            title={isCollapsed ? "แสดงเมนู" : "ซ่อนเมนู"}
          >
            {isCollapsed ? <FaAngleDoubleRight size={14} aria-hidden="true" /> : <FaAngleDoubleLeft size={14} aria-hidden="true" />}
          </button>
        )
      }
    </>
  );
};

export default LeftSidebar;
