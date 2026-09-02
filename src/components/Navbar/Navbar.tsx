import React, { useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useSelector, useDispatch } from "react-redux";
import { RootState } from "@/store";
import { firestore } from "@/firebase";
import { fetchSchoolSettings } from "@/store/slices/schoolSettingsSlice";
import ProfileAvatar from "@/components/Shared/ProfileAvatar";

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
  limit,
} from "firebase/firestore";

import { formatNotificationTime } from "@/utils/dateUtils";

import { FaBell, FaBars, FaBookOpen, FaSun, FaMoon, FaHome, FaUserCheck, FaChalkboardTeacher } from "react-icons/fa";
import { FiSearch } from "react-icons/fi";
// import liff from "@line/liff"; // 📌 นำ LIFF ออกตามคำขอ

import defaultProfile from "@/assets/profile.png";
import SearchSidebar from "@/components/SearchSidebar/SearchSidebar";
import LeftSidebar from "../Sidebar/LeftSidebar";
import SkeletonLoader from "@/components/SkeletonLoader";
import { useTheme } from "@/ThemeContext";
import Swal from "sweetalert2";
import { isAttendanceEntryOnly } from "@/utils/attendanceRoles";
import { usePwaMode } from "@/hooks/usePwaMode";
import { PWA_ATTENDANCE_HUB_PATH, PWA_MY_SCHEDULE_PATH } from "@/utils/pwaMode";
import { useSchoolScope } from "@/hooks/useEffectiveSchool";

/* -------------------- types -------------------- */
interface Notification {
  id: string;
  path?: string; // 📌 เพิ่ม path เพื่อให้สามารถอัปเดตเอกสารได้ถูกต้อง
  message: string;
  isRead: boolean;
  createdAt: Timestamp;
  link?: string;
  source?: "system" | "club-request";
  clubRequest?: {
    requestId: string;
    approvalSide: "exit" | "entry";
    approvalClubId: string;
  };
}

/* -------------------- component -------------------- */
interface NavbarProps {
  schoolId?: string | null;
}

// ดึง schoolId สำหรับนักเรียน/ผู้ปกครองจาก local session (ไม่มีใน user.schoolId เพราะ login แบบ anonymous)
const getSessionSchoolId = () => {
  try {
    const type = localStorage.getItem('currentUserType');
    if (type === 'student') {
      const studentSessionRaw = localStorage.getItem('studentSession');
      if (studentSessionRaw) {
        const session = JSON.parse(studentSessionRaw);
        return session.schoolId || "";
      }
    } else if (type === 'parent') {
      const parentSessionRaw = localStorage.getItem('parentSession');
      if (parentSessionRaw) {
        const session = JSON.parse(parentSessionRaw);
        return session.children?.[0]?.schoolId || "";
      }
    }
  } catch (_) {}
  return "";
};

const Navbar: React.FC<NavbarProps> = ({ schoolId }) => {
  const navigate = useNavigate();
  const location = useLocation();
  const dispatch = useDispatch();
  const notificationRef = useRef<HTMLDivElement>(null);
  const { isDarkMode, toggleTheme } = useTheme();

  const currentUser = useSelector((state: RootState) => state.auth.user);
  const { schoolId: settingsSchoolId, schoolName, logoUrl, status: schoolSettingsStatus } = useSelector((state: RootState) => state.schoolSettings);
  const { effectiveSchoolId, isImpersonatingSchool, activeSchoolName } = useSchoolScope();
  const profileUrl = currentUser?.profileUrl || defaultProfile;
  const isPwaMode = usePwaMode();

  const [activeIcon, setActiveIcon] = useState("");
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [isOpenNoti, setIsOpenNoti] = useState(false);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [clubRequestNotifications, setClubRequestNotifications] = useState<Notification[]>([]);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isLoadingNoti, setIsLoadingNoti] = useState(true);
  const [processingNotificationId, setProcessingNotificationId] = useState<string | null>(null);

  const resolvedSchoolId = schoolId || effectiveSchoolId || getSessionSchoolId() || null;
  const isOwnerRoute = location.pathname.startsWith("/owner/");
  const schoolDisplayName = settingsSchoolId === resolvedSchoolId ? schoolName : "";
  const schoolLogoUrl = settingsSchoolId === resolvedSchoolId ? logoUrl : "";

  // นักเรียน/ผู้ปกครอง login แบบ anonymous จึงไม่มี user.schoolId ทำให้ useInitializeStore
  // ไม่เคย dispatch fetchSchoolSettings ให้ — ดึงเองที่นี่เมื่อยังไม่มีข้อมูลของโรงเรียนนี้ใน store
  useEffect(() => {
    if (!resolvedSchoolId) return;
    if (settingsSchoolId === resolvedSchoolId) return;
    if (schoolSettingsStatus === "loading") return;
    dispatch(fetchSchoolSettings(resolvedSchoolId) as any);
  }, [resolvedSchoolId, settingsSchoolId, schoolSettingsStatus, dispatch]);

  /* -------------------- realtime notification ----โ---------------- */
  useEffect(() => {
    const userType = localStorage.getItem('currentUserType');
    if (!currentUser?.uid || isOwnerRoute || userType === 'student' || userType === 'parent') {
      setNotifications([]);
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

    const unsub = onSnapshot(
      q,
      (snapshot) => {
        const data = snapshot.docs.map((doc) => {
          return {
            id: doc.id,
            path: doc.ref.path,
            ...(doc.data() as Omit<Notification, 'id' | 'path'>),
          } as Notification;
        });
        setNotifications(data);
        setIsLoadingNoti(false);
      },
      (error) => {
        console.error("Error listening to notifications:", error);
        setNotifications([]);
        setIsLoadingNoti(false);
      }
    );

    return () => unsub();
  }, [currentUser?.uid, isOwnerRoute]);

  useEffect(() => {
    const userType = localStorage.getItem('currentUserType');
    if (!currentUser?.uid || !resolvedSchoolId || isOwnerRoute || userType === 'student' || userType === 'parent') {
      setClubRequestNotifications([]);
      return;
    }

    let unsubClubs: (() => void) | undefined;
    let unsubRequests: (() => void) | undefined;
    let cancelled = false;

    const subscribeClubRequests = async () => {
      const teacherSnap = await getDocs(query(
        collection(firestore, "school-settings", resolvedSchoolId, "teachers"),
        where("uid", "==", currentUser.uid),
        limit(1)
      ));
      const currentTeacherId = teacherSnap.docs[0]?.id || null;
      if (!currentTeacherId) {
        setClubRequestNotifications([]);
        return;
      }

      if (cancelled) return;

      const clubsQuery = query(
        collection(firestore, "school-settings", resolvedSchoolId, "clubs"),
        where("responsibleTeacherIds", "array-contains", currentTeacherId)
      );

      unsubClubs = onSnapshot(clubsQuery, (clubSnap) => {
        const clubMap = new Map<string, string>();
        clubSnap.docs.forEach((clubDoc) => {
          clubMap.set(clubDoc.id, String(clubDoc.data().name || "ไม่ระบุชื่อชุมนุม"));
        });

        if (unsubRequests) {
          unsubRequests();
          unsubRequests = undefined;
        }

        if (clubMap.size === 0) {
          setClubRequestNotifications([]);
          return;
        }

        const clubIdsList = [...clubMap.keys()].slice(0, 30);
        let entryItems: Notification[] = [];
        let exitItems: Notification[] = [];
        let entryUnsub: (() => void) | undefined;
        let exitUnsub: (() => void) | undefined;

        const mergeAndSet = () => {
          const seen = new Set<string>();
          const all: Notification[] = [];
          [...entryItems, ...exitItems].forEach((item) => {
            if (!seen.has(item.id)) { seen.add(item.id); all.push(item); }
          });
          setClubRequestNotifications(all);
        };

        const makeNotification = (
          requestDoc: any, req: any,
          approvalSide: "exit" | "entry", approvalClubId: string, text: string
        ): Notification => ({
          id: `club-request-${requestDoc.id}-${approvalSide}-${approvalClubId}`,
          message: `${req.studentName || "นักเรียน"} ${text}`,
          isRead: false,
          createdAt: req.createdAt instanceof Timestamp ? req.createdAt : Timestamp.now(),
          link: `/academic/club-members?clubId=${approvalClubId}&requestId=${requestDoc.id}`,
          source: "club-request",
          clubRequest: { requestId: requestDoc.id, approvalSide, approvalClubId },
        });

        // Entry approvals: สมัครใหม่ + ปลายทางของการย้าย
        entryUnsub = onSnapshot(
          query(
            collection(firestore, "school-settings", resolvedSchoolId, "club_requests"),
            where("targetClubId", "in", clubIdsList),
            where("status", "==", "pending")
          ),
          (snap) => {
            entryItems = [];
            snap.docs.forEach((requestDoc) => {
              const req = requestDoc.data() as any;
              if (!clubMap.has(req.targetClubId) || req.entryStatus !== "pending") return;
              entryItems.push(makeNotification(
                requestDoc, req, "entry", req.targetClubId,
                req.type === "transfer"
                  ? `ขอย้ายเข้า ${req.targetClubName || clubMap.get(req.targetClubId) || "ชุมนุมปลายทาง"}`
                  : `ขอสมัครเข้า ${req.targetClubName || clubMap.get(req.targetClubId) || "ชุมนุม"}`
              ));
            });
            mergeAndSet();
          },
          (error) => { console.error("Error listening to club entry requests:", error); }
        );

        // Exit approvals: ต้นทางของการย้าย
        exitUnsub = onSnapshot(
          query(
            collection(firestore, "school-settings", resolvedSchoolId, "club_requests"),
            where("currentClubId", "in", clubIdsList),
            where("status", "==", "pending"),
            where("exitStatus", "==", "pending")
          ),
          (snap) => {
            exitItems = [];
            snap.docs.forEach((requestDoc) => {
              const req = requestDoc.data() as any;
              if (!clubMap.has(req.currentClubId)) return;
              exitItems.push(makeNotification(
                requestDoc, req, "exit", req.currentClubId,
                `ขอย้ายออกจาก ${req.currentClubName || clubMap.get(req.currentClubId) || "ชุมนุมเดิม"}`
              ));
            });
            mergeAndSet();
          },
          (error) => { console.error("Error listening to club exit requests:", error); }
        );

        unsubRequests = () => {
          if (entryUnsub) entryUnsub();
          if (exitUnsub) exitUnsub();
        };
      }, (error) => {
        console.error("Error listening to clubs for notifications:", error);
        setClubRequestNotifications([]);
      });
    };

    subscribeClubRequests();

    return () => {
      cancelled = true;
      if (unsubRequests) unsubRequests();
      if (unsubClubs) unsubClubs();
    };
  }, [currentUser, resolvedSchoolId, isOwnerRoute]);

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

  /* -------------------- handlers -------------------- */
  const visibleNotifications = useMemo(() => {
    return [...clubRequestNotifications, ...notifications].sort((a, b) => {
      const aTime = a.createdAt?.toMillis?.() || 0;
      const bTime = b.createdAt?.toMillis?.() || 0;
      return bTime - aTime;
    });
  }, [clubRequestNotifications, notifications]);

  const unreadCount = visibleNotifications.filter((n) => !n.isRead).length;

  const handleReadOne = async (noti: Notification) => {
    if (!noti.isRead && noti.path) {
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
      if (!n.isRead && n.path) {
        batch.update(doc(firestore, n.path), { isRead: true }); // 📌 แก้ไข: ใช้ path ที่เก็บไว้
      }
    });
    await batch.commit();
  };

  const handleClubRequestAction = async (
    e: React.MouseEvent,
    noti: Notification,
    action: "approve" | "reject"
  ) => {
    e.stopPropagation();
    if (!resolvedSchoolId || !noti.clubRequest || processingNotificationId) return;

    const result = await Swal.fire({
      title: action === "approve" ? "ยืนยันอนุมัติคำขอ?" : "ยืนยันปฏิเสธคำขอ?",
      text: noti.message,
      icon: "question",
      showCancelButton: true,
      confirmButtonText: action === "approve" ? "อนุมัติ" : "ปฏิเสธ",
      cancelButtonText: "ยกเลิก",
      confirmButtonColor: action === "approve" ? "#10b981" : "#ef4444",
      background: isDarkMode ? "#2a2b2f" : "#fff",
      color: isDarkMode ? "#fff" : "#111827",
    });
    if (!result.isConfirmed) return;

    setProcessingNotificationId(noti.id);
    try {
      const requestRef = doc(firestore, "school-settings", resolvedSchoolId, "club_requests", noti.clubRequest.requestId);
      const requestSnap = await getDoc(requestRef);
      if (!requestSnap.exists()) {
        Swal.fire("ไม่พบคำขอ", "คำขอนี้อาจถูกดำเนินการไปแล้ว", "info");
        return;
      }

      const request = { id: requestSnap.id, ...requestSnap.data() } as any;
      if (request.status !== "pending") {
        Swal.fire("ดำเนินการแล้ว", "คำขอนี้ไม่อยู่ในสถานะรอดำเนินการแล้ว", "info");
        return;
      }

      if (action === "reject") {
        const batch = writeBatch(firestore);
        batch.delete(requestRef);
        await batch.commit();
        await Swal.fire({
          icon: "success",
          title: "ปฏิเสธคำขอแล้ว",
          timer: 1400,
          showConfirmButton: false,
          background: isDarkMode ? "#2a2b2f" : "#fff",
          color: isDarkMode ? "#fff" : "#111827",
        });
        return;
      }

      const newExitStatus = noti.clubRequest.approvalSide === "exit" ? "approved" : request.exitStatus;
      const newEntryStatus = noti.clubRequest.approvalSide === "entry" ? "approved" : request.entryStatus;
      const updates: Record<string, any> = {
        exitStatus: newExitStatus,
        entryStatus: newEntryStatus,
        updatedAt: new Date(),
      };

      if (newExitStatus === "approved" && newEntryStatus === "approved") {
        const batch = writeBatch(firestore);
        if (request.currentClubId) {
          batch.delete(doc(firestore, "school-settings", resolvedSchoolId, "clubs", request.currentClubId, "members", request.studentId));
        }
        batch.set(doc(firestore, "school-settings", resolvedSchoolId, "clubs", request.targetClubId, "members", request.studentId), {
          addedAt: new Date(),
          addedBy: currentUser?.uid || null,
          requestRef: request.id,
          status: "confirmed",
        });
        batch.delete(requestRef);
        await batch.commit();
      } else {
        await updateDoc(requestRef, updates);
      }

      await Swal.fire({
        icon: "success",
        title: "อนุมัติคำขอแล้ว",
        timer: 1400,
        showConfirmButton: false,
        background: isDarkMode ? "#2a2b2f" : "#fff",
        color: isDarkMode ? "#fff" : "#111827",
      });
    } catch (error) {
      console.error("Error processing club request notification:", error);
      Swal.fire("ผิดพลาด", "ไม่สามารถดำเนินการคำขอได้", "error");
    } finally {
      setProcessingNotificationId(null);
    }
  };

  const iconClass = (name: string) =>
    `w-11 h-11 flex items-center justify-center rounded-full cursor-pointer transition-transform transition-colors ${
      activeIcon === name
        ? "text-sky-500 dark:text-sky-400 scale-110"
        : "text-gray-500 dark:text-gray-400 hover:text-sky-600 dark:hover:text-gray-200"
    }`;

  const navIconSizeClass = "w-7 h-7";

  /* -------------------- render -------------------- */
  return (
    <>
      <nav className="fixed top-0 left-0 right-0 h-[60px] bg-white/90 dark:bg-[#18191a]/95 backdrop-blur-md z-[9999] px-4 shadow-sm">
        <div className="max-w-[1440px] mx-auto h-full flex justify-between items-center">

          {/* Left */}
          <div className="flex items-center gap-4">
            <button
              type="button"
              className="flex items-center gap-2 cursor-pointer bg-transparent border-0 p-0"
              aria-label={`${schoolDisplayName || "BMG Smart School"} - กลับหน้าแรก`}
              onClick={() => {
                if (isPwaMode) {
                  navigate(PWA_ATTENDANCE_HUB_PATH);
                } else if (isAttendanceEntryOnly(currentUser?.role)) {
                  navigate("/attendance/checkin-out");
                } else {
                  navigate("/home");
                }
              }}
            >
              {schoolLogoUrl ? (
                <img
                  src={schoolLogoUrl}
                  alt={schoolDisplayName || "โลโก้โรงเรียน"}
                  className="w-8 h-8 rounded-full object-cover bg-white"
                  loading="eager"
                />
              ) : (
                <FaBookOpen className="w-7 h-7 text-sky-500 dark:text-sky-400" aria-hidden="true" />
              )}
              <div className="hidden sm:flex flex-col min-w-0">
                <span className="font-bold text-lg text-gray-800 dark:text-white whitespace-nowrap">
                  {schoolDisplayName || "BMG Smart School"}
                </span>
                {isImpersonatingSchool && (
                  <span className="text-[11px] text-amber-600 dark:text-amber-300 truncate">
                    กำลังดูแลแทน: {activeSchoolName || schoolDisplayName || "โรงเรียนที่เลือก"}
                  </span>
                )}
              </div>
            </button>

            {/* Search Icon Only */}
            {!isPwaMode && !isAttendanceEntryOnly(currentUser?.role) && (
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
            )}
          </div>

          {/* Center */}
          {isPwaMode ? (
            <div className="hidden md:flex items-center gap-6">
              <button type="button" className={`${iconClass("attendance")} bg-transparent border-0 p-0`} title="ระบบเช็คชื่อ" aria-label="ระบบเช็คชื่อ" onClick={() => navigate(PWA_ATTENDANCE_HUB_PATH)}>
                <FaUserCheck className={navIconSizeClass} aria-hidden="true" />
              </button>
              <button type="button" className={`${iconClass("schedule")} bg-transparent border-0 p-0`} title="ตารางสอน" aria-label="ตารางสอน" onClick={() => navigate(PWA_MY_SCHEDULE_PATH)}>
                <FaChalkboardTeacher className={navIconSizeClass} aria-hidden="true" />
              </button>
            </div>
          ) : !isAttendanceEntryOnly(currentUser?.role) && (
            <div className="hidden md:flex items-center gap-6">
              <button type="button" className={`${iconClass("home")} bg-transparent border-0 p-0`} title="หน้าแรก" aria-label="หน้าแรก" onClick={() => navigate("/home")}>
                <FaHome className={navIconSizeClass} aria-hidden="true" />
              </button>
              <button type="button" className={`${iconClass("attendance")} bg-transparent border-0 p-0`} title="ระบบเช็คชื่อ" aria-label="ระบบเช็คชื่อ" onClick={() => navigate("/academic/hub/attendance")}>
                <FaUserCheck className={navIconSizeClass} aria-hidden="true" />
              </button>
            </div>
          )}

          {/* Right */}
          <div className="flex items-center gap-3">
            {/* Notification */}
            {!isAttendanceEntryOnly(currentUser?.role) && (
              <div className="relative" ref={notificationRef}>
              <button
                type="button"
                className={`${iconClass('notify')} bg-transparent border-0 p-0`}
                onClick={() => {
                  setIsOpenNoti((p) => !p);
                  setIsMobileMenuOpen(false);
                  setIsSearchOpen(false);
                }}
                aria-label={`การแจ้งเตือน${unreadCount > 0 ? ` (${unreadCount} รายการใหม่)` : ''}`}
                title="การแจ้งเตือน"
              >
                <FaBell className={navIconSizeClass} aria-hidden="true" />
              </button>
              {unreadCount > 0 && (
                <span className="absolute -top-1 -right-2 bg-red-600 text-white text-[10px] w-4 h-4 rounded-full flex items-center justify-center">
                  {unreadCount}
                </span>
              )}

              {isOpenNoti && (
                <div className="fixed left-4 right-4 top-[65px] z-[9999] sm:absolute sm:top-full sm:right-0 sm:left-auto sm:w-[640px] sm:max-w-[calc(100vw-2rem)] sm:mt-2 bg-white dark:bg-[#242526] rounded-2xl shadow-2xl border border-gray-200 dark:border-gray-700/80 overflow-hidden flex flex-col">
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
                    ) : visibleNotifications.length === 0 ? (
                      <div className="text-center py-16 px-6">
                        <svg className="mx-auto h-16 w-16 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
                        </svg>
                        <h4 className="mt-4 text-lg font-semibold text-gray-800 dark:text-gray-200">ไม่มีการแจ้งเตือน</h4>
                        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">ทุกอย่างดูเรียบร้อยดี</p>
                      </div>
                    ) : (
                      <ul className="divide-y divide-gray-200 dark:divide-gray-700">
                        {visibleNotifications.map((n) => (
                          <li
                            key={n.id}
                            onClick={() => handleReadOne(n)}
                            className="p-4 cursor-pointer hover:bg-gray-50 dark:hover:bg-white/5 transition-colors duration-150"
                          >
                            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-4">
                              {/* Dot for unread status */}
                              <div className="hidden flex-shrink-0 sm:block">
                                {!n.isRead ? (
                                  <span className="w-2.5 h-2.5 bg-indigo-500 rounded-full block" title="ยังไม่ได้อ่าน"></span>
                                ) : (
                                  <span className="w-2.5 h-2.5 bg-transparent rounded-full block"></span>
                                )}
                              </div>
                              {/* Message content */}
                              <div className="min-w-0 flex-grow">
                                <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
                                  {!n.isRead && (
                                    <span className="h-2.5 w-2.5 rounded-full bg-indigo-500 sm:hidden" title="ยังไม่ได้อ่าน"></span>
                                  )}
                                  {n.source === "club-request" && (
                                    <span className="inline-flex shrink-0 items-center rounded-full bg-amber-100 px-2.5 py-1 text-[10px] font-bold text-amber-700 dark:bg-amber-900/30 dark:text-amber-300">
                                      ชุมนุม
                                    </span>
                                  )}
                                  <p className={`min-w-0 flex-1 text-sm leading-6 sm:truncate ${!n.isRead ? 'text-gray-800 dark:text-gray-100 font-semibold' : 'text-gray-600 dark:text-gray-400'}`}>
                                    {n.message}
                                  </p>
                                </div>
                                <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                                  {formatNotificationTime(n.createdAt.toDate())}
                                </p>
                              </div>
                              {n.source === "club-request" && n.clubRequest && (
                                <div className="flex shrink-0 flex-wrap gap-2 sm:justify-end">
                                    <button
                                      type="button"
                                      disabled={processingNotificationId === n.id}
                                      onClick={(e) => handleClubRequestAction(e, n, "approve")}
                                      className="rounded-lg bg-emerald-500 px-3.5 py-2 text-xs font-bold text-white shadow-sm transition hover:bg-emerald-600 disabled:cursor-wait disabled:opacity-60"
                                    >
                                      อนุมัติ
                                    </button>
                                    <button
                                      type="button"
                                      disabled={processingNotificationId === n.id}
                                      onClick={(e) => handleClubRequestAction(e, n, "reject")}
                                      className="rounded-lg bg-rose-50 px-3.5 py-2 text-xs font-bold text-rose-600 transition hover:bg-rose-500 hover:text-white disabled:cursor-wait disabled:opacity-60 dark:bg-rose-500/10 dark:text-rose-300 dark:hover:bg-rose-500 dark:hover:text-white"
                                    >
                                      ปฏิเสธ
                                    </button>
                              </div>
                              )}
                            </div>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                  {/* Footer */}
                  {visibleNotifications.length > 0 && (
                    <div className="p-2 bg-gray-50 dark:bg-[#1e1f21] border-t border-gray-200 dark:border-gray-700 text-center">
                      <button onClick={() => { navigate('/notifications'); setIsOpenNoti(false); }} className="text-sm font-medium text-indigo-600 dark:text-indigo-400 hover:underline">
                        ดูการแจ้งเตือนทั้งหมด
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
            )}
            {isAttendanceEntryOnly(currentUser?.role) ? (
              <ProfileAvatar
                src={profileUrl}
                onError={(e) => (e.currentTarget.src = defaultProfile)}
                className="w-9 h-9 select-none"
                alt={`รูปโปรไฟล์ของ ${currentUser?.fullName || 'ผู้ใช้'}`}
              />
            ) : (
              <ProfileAvatar
                src={profileUrl}
                onError={(e) => (e.currentTarget.src = defaultProfile)}
                className="w-9 h-9 cursor-pointer"
                onClick={() => navigate("/profile")}
                alt={`รูปโปรไฟล์ของ ${currentUser?.fullName || 'ผู้ใช้'}`}
                title="ดูโปรไฟล์"
              />
            )}

            {/* Theme Toggle */}
            <button
              type="button"
              onClick={toggleTheme}
              className="p-2 rounded-full text-gray-500 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-800 transition-colors"
              aria-label={isDarkMode ? "สลับเป็นโหมดสว่าง" : "สลับเป็นโหมดมืด"}
              title={isDarkMode ? "สลับเป็นโหมดสว่าง" : "สลับเป็นโหมดมืด"}
            >
              {isDarkMode ? <FaSun className="w-5 h-5 text-yellow-500" aria-hidden="true" /> : <FaMoon className="w-5 h-5" aria-hidden="true" />}
            </button>

            {/* Hamburger Menu (Mobile/Tablet) */}
            <button
              type="button"
              className="lg:hidden p-1 bg-transparent border-0"
              onClick={() => {
                setIsMobileMenuOpen(true);
                setIsOpenNoti(false);
                setIsSearchOpen(false);
              }}
              aria-label="เปิดเมนูนำทาง"
              title="เมนู"
            >
              <FaBars className="w-6 h-6 text-gray-600 dark:text-gray-300 hover:text-sky-500 transition-colors" aria-hidden="true" />
            </button>
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
