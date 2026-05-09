import React, { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useSelector } from "react-redux";
import { RootState } from "@/store";
import { firestore } from "@/firebase";

import {
  collection,
  query,
  where,
  orderBy,
  onSnapshot,
  doc,
  updateDoc,
  collectionGroup,
  writeBatch,
  Timestamp,
  getDoc,
  getDocs,
} from "firebase/firestore";

import { formatDistanceToNow } from "date-fns";
import { th } from "date-fns/locale";

import { FaBell, FaBars, FaBookOpen, FaBook, FaChartPie, FaUsers, FaBuilding, FaLine, FaSun, FaMoon } from "react-icons/fa";
import { BsChatDotsFill } from "react-icons/bs";
import { FiSearch } from "react-icons/fi";
// import liff from "@line/liff"; // 📌 นำ LIFF ออกตามคำขอ

import defaultProfile from "@/assets/profile.png";
import SearchSidebar from "@/components/SearchSidebar/SearchSidebar";
import LeftSidebar from "../Sidebar/LeftSidebar";
import SkeletonLoader from "@/components/SkeletonLoader";
import { useTheme } from "@/ThemeContext";

/* -------------------- types -------------------- */
interface Notification {
  id: string;
  path: string; // 📌 เพิ่ม path เพื่อให้สามารถอัปเดตเอกสารได้ถูกต้อง
  message: string;
  isRead: boolean;
  createdAt: Timestamp;
  link?: string;
}

/* -------------------- component -------------------- */
interface NavbarProps {
  schoolId?: string | null;
}

const Navbar: React.FC<NavbarProps> = ({ schoolId }) => {
  const navigate = useNavigate();
  const notificationRef = useRef<HTMLDivElement>(null);
  const { isDarkMode, toggleTheme } = useTheme();

  const currentUser = useSelector((state: RootState) => state.auth.user);
  const profileUrl = currentUser?.profileUrl || defaultProfile;

  const [activeIcon, setActiveIcon] = useState("");
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [isOpenNoti, setIsOpenNoti] = useState(false);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isLoadingNoti, setIsLoadingNoti] = useState(true);
  const [isLineChatOpen, setIsLineChatOpen] = useState(false);
  const [lineChatUsers, setLineChatUsers] = useState<any[]>([]);
  const [isLineChatLoading, setIsLineChatLoading] = useState(false);
  const [isLineLoggedIn, setIsLineLoggedIn] = useState(true);
  const [isLiffInitialized, setIsLiffInitialized] = useState(true);
  const lineChatRef = useRef<HTMLDivElement>(null);
  const [schoolLineId, setSchoolLineId] = useState("");

  /* -------------------- realtime notification ----โ---------------- */
  useEffect(() => {
    if (!currentUser?.uid) {
      setIsLoadingNoti(false);
      return;
    }
    setIsLoadingNoti(true);

    // 📌 แก้ไข: ใช้ collectionGroup เพื่อดึงข้อมูลการแจ้งเตือนจากทุกโรงเรียน
    const q = query(
      collectionGroup(firestore, "notifications"),
      where("userId", "==", currentUser.uid),
      orderBy("createdAt", "desc")
    );

    const unsub = onSnapshot(q, (snapshot) => {
      const data = snapshot.docs.map((doc) => {
        return {
          id: doc.id,
          path: doc.ref.path, // 📌 เก็บ path ของเอกสารไว้
          ...(doc.data() as Omit<Notification, 'id' | 'path'>),
        } as Notification;
      });
      setNotifications(data);
      setIsLoadingNoti(false);
    });

    return () => unsub();
  }, [currentUser?.uid]);

  /* -------------------- click outside -------------------- */
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (notificationRef.current && !notificationRef.current.contains(e.target as Node)) {
        setIsOpenNoti(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  /* -------------------- click outside line chat -------------------- */
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (lineChatRef.current && !lineChatRef.current.contains(e.target as Node)) {
        setIsLineChatOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  /* -------------------- keyboard shortcut (Ctrl+K) -------------------- */
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setIsSearchOpen((prev) => !prev);
        setIsOpenNoti(false);
        setIsMobileMenuOpen(false);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  // 📌 นำส่วน init LIFF ออกเนื่องจากไม่ได้ใช้งาน ID จริงและเพื่อลดข้อความแจ้งเตือนใน Console

  /* -------------------- fetch school line oa id -------------------- */
  useEffect(() => {
    if (schoolId) {
      const fetchSchoolSettings = async () => {
        try {
          const docRef = doc(firestore, "school-settings", schoolId);
          const docSnap = await getDoc(docRef);
          if (docSnap.exists()) {
            const data = docSnap.data();
            const basicId = data.lineOASettings?.school?.lineOABasicId;
            if (basicId) setSchoolLineId(basicId);
          }
        } catch (error) {
          console.error("Error fetching school settings:", error);
        }
      };
      fetchSchoolSettings();
    }
  }, [schoolId]);

  /* -------------------- fetch users for line chat -------------------- */
  useEffect(() => {
    if (isLineChatOpen && isLineLoggedIn && schoolId && lineChatUsers.length === 0) {
      const fetchTeachers = async () => {
        setIsLineChatLoading(true);
        try {
          const teachersRef = collection(firestore, "school-settings", schoolId, "teachers");
          const q = query(teachersRef, orderBy("firstName"));
          const querySnapshot = await getDocs(q);
          const teachersData = querySnapshot.docs
            .map(doc => ({ id: doc.id, ...doc.data() } as any))
            .filter(teacher => teacher.id !== currentUser?.uid && teacher.lineId);
          setLineChatUsers(teachersData);
        } catch (error) {
          console.error("Error fetching teachers for Line chat:", error);
        } finally {
          setIsLineChatLoading(false);
        }
      };
      fetchTeachers();
    }
  }, [isLineChatOpen, isLineLoggedIn, schoolId, currentUser?.uid, lineChatUsers.length]);

  /* -------------------- handlers -------------------- */
  const unreadCount = notifications.filter((n) => !n.isRead).length;

  const handleReadOne = async (noti: Notification) => {
    if (!noti.isRead) {
      await updateDoc(doc(firestore, noti.path), { // 📌 แก้ไข: ใช้ path ที่เก็บไว้
        isRead: true,
      });
    }
    if (noti.link) navigate(noti.link);
    setIsOpenNoti(false);
  };

  const handleReadAll = async () => {
    const batch = writeBatch(firestore);
    notifications.forEach((n) => {
      if (!n.isRead) {
        batch.update(doc(firestore, n.path), { isRead: true }); // 📌 แก้ไข: ใช้ path ที่เก็บไว้
      }
    });
    await batch.commit();
  };

  const iconClass = (name: string) =>
    `w-[26px] h-[26px] cursor-pointer transition ${activeIcon === name ? "text-sky-500 dark:text-sky-400 scale-125" : "text-gray-500 dark:text-gray-400 hover:text-sky-600 dark:hover:text-gray-200"
    }`;

  /* -------------------- render -------------------- */
  return (
    <>
      <nav className="fixed top-0 left-0 right-0 h-[60px] bg-white/90 dark:bg-[#18191a]/95 backdrop-blur-md z-50 px-4 shadow-sm">
        <div className="max-w-[1440px] mx-auto h-full flex justify-between items-center">

          {/* Left */}
          <div className="flex items-center gap-4">
            <div
              className="flex items-center gap-2 cursor-pointer"
              onClick={() => {
                const roles = Array.isArray(currentUser?.role) ? currentUser.role : [currentUser?.role];
                const attendanceRoles = ['school_attendance', 'student_attendance', 'teacher_attendance'];
                if (roles.some(role => attendanceRoles.includes(role as string))) {
                  navigate("/attendance/checkin-out");
                } else {
                  navigate("/home");
                }
              }}
            >
              <FaBookOpen className="w-7 h-7 text-sky-500 dark:text-sky-400" />
              <span className="font-bold text-lg text-gray-800 dark:text-white hidden sm:block whitespace-nowrap">
                EPP.5 Online
              </span>
            </div>

            {/* Search Icon Only */}
            <button
              className="p-2 rounded-full text-gray-500 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-800 transition-colors"
              onClick={() => {
                setIsSearchOpen(true);
                setIsOpenNoti(false);
                setIsMobileMenuOpen(false);
              }}
              aria-label="เปิดส่วนค้นหา (Ctrl + K หรือ Cmd + K)"
              title="ค้นหา (Ctrl + K)"
            >
              <FiSearch className="w-6 h-6" aria-hidden="true" />
            </button>
          </div>

          {/* Center */}
          <div className="hidden md:flex items-center gap-6">
            <FaBook
              className={iconClass("academic")}
              title="ฝ่ายบริหารงานวิชาการ"
              onClick={() => navigate("/academic-admin")}
            />



            <div className="relative" ref={lineChatRef}>
              <FaLine
                className={iconClass("line")}
                title="Line Chat"
                onClick={() => {
                  setIsLineChatOpen(p => !p);
                  setIsOpenNoti(false);
                  setIsMobileMenuOpen(false);
                }}
              />
              {isLineChatOpen && (
                <div className="fixed left-4 right-4 top-[65px] z-50 sm:absolute sm:top-full sm:right-0 sm:left-auto sm:w-80 sm:mt-2 bg-white dark:bg-[#242526] rounded-2xl shadow-2xl border border-gray-200 dark:border-gray-700/80 overflow-hidden flex flex-col">
                  <div className="p-4 border-b border-gray-200 dark:border-gray-700">
                    <h3 className="font-bold text-lg text-gray-900 dark:text-white text-center">
                      รายชื่อสำหรับแชท (LINE)
                    </h3>
                  </div>
                  <div className="flex-grow max-h-[70vh] overflow-y-auto min-h-0">
                    {/* 📌 ปรับให้แสดงรายชื่อครูได้เลยโดยไม่ต้องผ่าน Line Login (Bypass LIFF) */}
                    {isLineChatLoading ? (
                      <div className="p-4 text-center text-gray-500">กำลังโหลด...</div>
                    ) : (
                      <ul className="divide-y divide-gray-200 dark:divide-gray-700">
                        {/* 🆕 ส่วนติดต่อ Line OA ของโรงเรียน */}
                        <li
                          onClick={() => window.open(`https://line.me/R/ti/p/${schoolLineId || '@YOUR_LINE_OA_ID'}`, '_blank')}
                          className="p-3 flex items-center gap-3 cursor-pointer hover:bg-indigo-50 dark:hover:bg-indigo-900/20 transition-colors bg-gray-50 dark:bg-white/5"
                        >
                          <div className="w-9 h-9 rounded-full bg-[#06c755] flex items-center justify-center text-white shadow-sm">
                            <FaLine size={20} />
                          </div>
                          <div className="flex-grow overflow-hidden">
                            <p className="text-sm font-bold text-gray-800 dark:text-gray-100 truncate">ติดต่อโรงเรียน (Line OA)</p>
                            <p className="text-xs text-gray-500 dark:text-gray-400">สอบถามข้อมูล/แจ้งปัญหา</p>
                          </div>
                          <FaLine className="text-[#06c755] flex-shrink-0" />
                        </li>

                        {lineChatUsers.length === 0 ? (
                          <div className="p-8 text-center text-gray-500">ไม่พบรายชื่อครูที่มี Line ID</div>
                        ) : (
                          lineChatUsers.map(user => (
                            <li key={user.id}
                              onClick={() => window.open(`https://line.me/ti/p/~${user.lineId}`, '_blank')}
                              className="p-3 flex items-center gap-3 cursor-pointer hover:bg-gray-50 dark:hover:bg-white/5 transition-colors"
                            >
                              <img src={user.profileImageUrl || defaultProfile} alt={user.firstName} className="w-9 h-9 rounded-full object-cover" />
                              <div className="flex-grow overflow-hidden">
                                <p className="text-sm font-semibold text-gray-800 dark:text-gray-100 truncate">{user.title}{user.firstName} {user.lastName}</p>
                                <p className="text-xs text-gray-500 dark:text-gray-400">ID: {user.lineId}</p>
                              </div>
                              <FaLine className="text-green-500 flex-shrink-0" />
                            </li>
                          ))
                        )}
                      </ul>
                    )}
                  </div>
                </div>
              )}
            </div>
            <BsChatDotsFill
              className={iconClass("messages")}
              onClick={() => navigate("/messages")}
            />
          </div>

          {/* Right */}
          <div className="flex items-center gap-3">
            {/* Notification */}
            <div className="relative" ref={notificationRef}>
              <FaBell
                className={iconClass('notify')}
                onClick={() => {
                  setIsOpenNoti((p) => !p);
                  setIsMobileMenuOpen(false); // Close other panels
                  setIsSearchOpen(false);
                }}
                aria-label={`การแจ้งเตือน (${unreadCount} รายการใหม่)`}
                title="การแจ้งเตือน"
              />
              {unreadCount > 0 && (
                <span className="absolute -top-1 -right-2 bg-red-600 text-white text-[10px] w-4 h-4 rounded-full flex items-center justify-center">
                  {unreadCount}
                </span>
              )}

              {isOpenNoti && (
                <div className="fixed left-4 right-4 top-[65px] z-50 sm:absolute sm:top-full sm:right-0 sm:left-auto sm:w-96 sm:mt-2 bg-white dark:bg-[#242526] rounded-2xl shadow-2xl border border-gray-200 dark:border-gray-700/80 overflow-hidden flex flex-col">
                  {/* Header */}
                  <div className="p-4 flex justify-between items-center border-b border-gray-200 dark:border-gray-700">
                    <h3 className="font-bold text-lg text-gray-900 dark:text-white">การแจ้งเตือน</h3>
                    {unreadCount > 0 && (
                      <button
                        onClick={handleReadAll}
                        className="text-sm font-medium text-indigo-600 dark:text-indigo-400 hover:underline"
                      >
                        ทำเครื่องหมายว่าอ่านทั้งหมด
                      </button>
                    )}
                  </div>

                  {/* Body */}
                  <div className="flex-grow max-h-[70vh] overflow-y-auto min-h-0">
                    {isLoadingNoti ? (
                      <div className="divide-y divide-gray-200 dark:divide-gray-700">
                        {[...Array(5)].map((_, i) => (
                          <div key={i} className="p-4 flex items-start gap-4 animate-pulse">
                            <div className="flex-shrink-0 mt-1">
                              <SkeletonLoader className="w-2.5 h-2.5 rounded-full" />
                            </div>
                            <div className="flex-grow space-y-2">
                              <SkeletonLoader className="h-4 w-3/4 rounded" />
                              <SkeletonLoader className="h-3 w-1/4 rounded" />
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : notifications.length === 0 ? (
                      <div className="text-center py-16 px-6">
                        <svg className="mx-auto h-16 w-16 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
                        </svg>
                        <h4 className="mt-4 text-lg font-semibold text-gray-800 dark:text-gray-200">ไม่มีการแจ้งเตือน</h4>
                        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">ทุกอย่างดูเรียบร้อยดี</p>
                      </div>
                    ) : (
                      <ul className="divide-y divide-gray-200 dark:divide-gray-700">
                        {notifications.map((n) => (
                          <li
                            key={n.id}
                            onClick={() => handleReadOne(n)}
                            className="p-4 cursor-pointer hover:bg-gray-50 dark:hover:bg-white/5 transition-colors duration-150"
                          >
                            <div className="flex items-start gap-4">
                              {/* Dot for unread status */}
                              <div className="flex-shrink-0 mt-1">
                                {!n.isRead ? (
                                  <span className="w-2.5 h-2.5 bg-indigo-500 rounded-full block" title="ยังไม่ได้อ่าน"></span>
                                ) : (
                                  <span className="w-2.5 h-2.5 bg-transparent rounded-full block"></span>
                                )}
                              </div>
                              {/* Message content */}
                              <div className="flex-grow">
                                <p className={`text-sm ${!n.isRead ? 'text-gray-800 dark:text-gray-100 font-semibold' : 'text-gray-600 dark:text-gray-400'}`}>
                                  {n.message}
                                </p>
                                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1.5">
                                  {formatDistanceToNow(n.createdAt.toDate(), {
                                    addSuffix: true,
                                    locale: th,
                                  })}
                                </p>
                              </div>
                            </div>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                  {/* Footer */}
                  {notifications.length > 0 && (
                    <div className="p-2 bg-gray-50 dark:bg-[#1e1f21] border-t border-gray-200 dark:border-gray-700 text-center">
                      <button onClick={() => { navigate('/notifications'); setIsOpenNoti(false); }} className="text-sm font-medium text-indigo-600 dark:text-indigo-400 hover:underline">
                        ดูการแจ้งเตือนทั้งหมด
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
            <img
              src={profileUrl}
              onError={(e) => (e.currentTarget.src = defaultProfile)}
              className="w-9 h-9 rounded-full object-cover cursor-pointer"
              onClick={() => navigate("/profile")}
              alt={`รูปโปรไฟล์ของ ${currentUser?.fullName || 'ผู้ใช้'}`}
              title="ไปที่โปรไฟล์"
            />

            {/* Theme Toggle */}
            <button
              onClick={toggleTheme}
              className="p-2 rounded-full text-gray-500 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-800 transition-colors"
              title={isDarkMode ? "สลับเป็นโหมดสว่าง" : "สลับเป็นโหมดมืด"}
            >
              {isDarkMode ? <FaSun className="w-5 h-5 text-yellow-500" /> : <FaMoon className="w-5 h-5" />}
            </button>

            {/* Hamburger Menu (Mobile/Tablet) */}
            <FaBars
              className="lg:hidden w-6 h-6 text-gray-600 dark:text-gray-300 cursor-pointer hover:text-sky-500 transition-colors"
              onClick={() => {
                setIsMobileMenuOpen(true);
                setIsOpenNoti(false); // Close other panels
                setIsSearchOpen(false);
              }}
              aria-label="เปิดเมนูนำทาง"
              title="เมนู"
            />
          </div>
        </div>
      </nav>

      {isSearchOpen && <SearchSidebar onClose={() => setIsSearchOpen(false)} history={[]} schoolId={schoolId} />}

      {/* Mobile Sidebar */}
      {isMobileMenuOpen && (
        <LeftSidebar
          isMobile={true}
          onClose={() => setIsMobileMenuOpen(false)}
        />
      )}
    </>
  );
};

export default Navbar;