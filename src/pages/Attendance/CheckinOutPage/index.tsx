import React, { useState, useEffect, useRef } from "react";
import { useSelector } from "react-redux";
import { firestore } from "../../../firebase";
import { getTodayString } from "../../../utils/dateUtils";
import { updatePeriodSummaries, getPeriodKeys } from "../../../utils/periodSummaryUtils";
import {
  collection,
  query,
  where,
  getDocs,
  doc,
  setDoc,
  getDoc,
  Timestamp,
  onSnapshot,
  writeBatch,
  increment,
  serverTimestamp,
} from "firebase/firestore";
import Swal from "sweetalert2";
import { RootState } from "../../../store";
import { isNonOfficialHoliday } from "../../../utils/calendarUtils";
import { FoundUser } from "./types";
import { sendLineAttendanceNotification } from "./AttendanceLineNotify";
import { deg2rad, getDistanceFromLatLonInM, isPointInPolygon, getStatusKey } from "./utils";
import HolidayBanner from "./HolidayBanner";
import UserInfoPanel from "./UserInfoPanel";
import SearchPanel from "./SearchPanel";
import LatestUsers from "./LatestUsers";
import AttendanceSpeech from "./AttendanceSpeech";
import {
  calculateAttendanceStatus,
  GateRecord,
  FlagRecord,
  LeaveRecord
} from "../../../utils/attendanceLogic";
import { ROLES } from "../../../constants/roles";
import { applyAttendanceBehaviorScore } from "../../../utils/behaviorScoreUtils";

const CheckinOutPage: React.FC = () => {
  const { user: currentUser } = useSelector((state: RootState) => state.auth);
  const schoolId = currentUser?.schoolId;
  const [schoolName, setSchoolName] = useState<string | null>(null);
  const [schoolSettings, setSchoolSettings] = useState<any>(null);
  const [isAttendanceAdmin, setIsAttendanceAdmin] = useState(false);
  const [canScanStudents, setCanScanStudents] = useState(false);
  const [canScanTeachers, setCanScanTeachers] = useState(false);

  const [searchId, setSearchId] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searchedUser, setSearchedUser] = useState<FoundUser | null>(null);

  const [displayUser, setDisplayUser] = useState<FoundUser | null>(null);
  const displayUserTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const [latestUsers, setLatestUsers] = useState<FoundUser[]>([]);

  const [checkinTime, setCheckinTime] = useState<string | null>(null);
  const [checkoutTime, setCheckoutTime] = useState<string | null>(null);
  const [currentTime, setCurrentTime] = useState<string>("--:--:--");
  const [calendarEvents, setCalendarEvents] = useState<Record<string, any>>({});
  const [currentAcademicYear, setCurrentAcademicYear] = useState<string>("");
  const [isCalendarLoaded, setIsCalendarLoaded] = useState(false);

  const [studentLateTime, setStudentLateTime] = useState("07:50");
  const [teacherLateTime, setTeacherLateTime] = useState("08:40");
  const [studentCheckoutTime, setStudentCheckoutTime] = useState("15:30");
  const [teacherCheckoutTime, setTeacherCheckoutTime] = useState("16:30");
  const [studentCheckinEnd, setStudentCheckinEnd] = useState("08:30");
  const [isHoliday, setIsHoliday] = useState(false);

  const [timeOffset, setTimeOffset] = useState(0);
  const [speechTrigger, setSpeechTrigger] = useState<{
    user: FoundUser | null;
    type: "checkin" | "checkout" | "checkin_and_checkout" | null;
    timestamp: number;
    status: 'success' | 'error';
  }>({
    user: null,
    type: null,
    timestamp: 0,
    status: 'success'
  });
  const [selectedVoiceURI, setSelectedVoiceURI] = useState<string | null>(
    localStorage.getItem("selectedVoiceURI")
  );
  const [availableVoices, setAvailableVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [showVoiceSelect, setShowVoiceSelect] = useState(false);

  // Performance Optimization: Cache for background checks
  const [currentCachedIp, setCurrentCachedIp] = useState<string | undefined>(undefined);
  const [currentLocationCoords, setCurrentLocationCoords] = useState<{
    lat: number;
    lng: number;
  } | null>(null);
  const locationWatchId = useRef<number | null>(null);

  // Use the imported getTodayString from dateUtils

  // Memory Cache for the current session to avoid redundant Firestore reads
  const sessionUserCache = useRef<Map<string, FoundUser>>(new Map());

  useEffect(() => {
    const storedUsers = localStorage.getItem("latestUsers");
    if (storedUsers) {
      setLatestUsers(JSON.parse(storedUsers).slice(0, 8));
    }
  }, []);

  useEffect(() => {
    if (!schoolId) return;

    const schoolDocRef = doc(firestore, "school-settings", schoolId);
    const unsubscribe = onSnapshot(
      schoolDocRef,
      (docSnap) => {
        if (docSnap.exists()) {
          const data = docSnap.data();
          setSchoolName(data.schoolName);
          setSchoolSettings(data);

          if (data.attendanceConfig) {
            if (data.attendanceConfig.studentLateTime)
              setStudentLateTime(data.attendanceConfig.studentLateTime);
            if (data.attendanceConfig.teacherLateTime)
              setTeacherLateTime(data.attendanceConfig.teacherLateTime);
            if (data.attendanceConfig.studentCheckoutTime)
              setStudentCheckoutTime(data.attendanceConfig.studentCheckoutTime);
            if (data.attendanceConfig.teacherCheckoutTime)
              setTeacherCheckoutTime(data.attendanceConfig.teacherCheckoutTime);
            if (data.attendanceConfig.studentCheckinEnd)
              setStudentCheckinEnd(data.attendanceConfig.studentCheckinEnd);
          }
        }
      },
      (error) => {
        console.error("Error listening to school settings:", error);
      }
    );

    return () => unsubscribe();
  }, [schoolId]);

  useEffect(() => {
    const checkUserRole = async () => {
      if (currentUser) {
        const reduxRole = (currentUser as any).role;
        const roles = Array.isArray(reduxRole) ? reduxRole : [reduxRole];
        
        const isFullAdmin = roles.includes(ROLES.SCHOOL_ADMIN) || roles.includes(ROLES.SUPER_ADMIN);
        const isStudentAdmin = roles.includes(ROLES.STUDENT_ATTENDANCE);
        const isTeacherAdmin = roles.includes(ROLES.TEACHER_ATTENDANCE) || roles.includes(ROLES.SCHOOL_ATTENDANCE);

        if (isFullAdmin || isStudentAdmin || isTeacherAdmin) {
          setIsAttendanceAdmin(true);
          setCanScanStudents(isFullAdmin || isStudentAdmin);
          setCanScanTeachers(isFullAdmin || isTeacherAdmin || isStudentAdmin);
          return;
        }

        // 2. FALLBACK: Check from Firestore teachers collection (Role reference)
        if (schoolId) {
          const uid = (currentUser as any).uid || (currentUser as any).id;
          if (!uid) return;
          try {
            const teacherRef = doc(firestore, "school-settings", schoolId, "teachers", uid);
            const teacherSnap = await getDoc(teacherRef);
            if (teacherSnap.exists()) {
              const data = teacherSnap.data();
              const teacherRole = data.role;
              const teacherRoles = Array.isArray(teacherRole) ? teacherRole : [teacherRole];
              
              const isFullAdminT = teacherRoles.includes(ROLES.SCHOOL_ADMIN) || teacherRoles.includes(ROLES.SUPER_ADMIN);
              const isStudentAdminT = teacherRoles.includes(ROLES.STUDENT_ATTENDANCE);
              const isTeacherAdminT = teacherRoles.includes(ROLES.TEACHER_ATTENDANCE) || teacherRoles.includes(ROLES.SCHOOL_ATTENDANCE);

              if (isFullAdminT || isStudentAdminT || isTeacherAdminT) {
                setIsAttendanceAdmin(true);
                setCanScanStudents(isFullAdminT || isStudentAdminT);
                setCanScanTeachers(isFullAdminT || isTeacherAdminT || isStudentAdminT);
              }
            }
          } catch (error) {
            console.error("Error checking user role:", error);
          }
        }
      }
    };
    checkUserRole();
  }, [currentUser, schoolId]);

  useEffect(() => {
    setSearchedUser(null);
    setError(null);
    setCheckinTime(null);
    setCheckoutTime(null);
  }, [searchId]);

  useEffect(() => {
    const syncTime = async () => {
      // 1. Primary: TimeAPI.io (More stable recently)
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 5000);

        const response = await fetch(
          "https://timeapi.io/api/Time/current/zone?timeZone=Asia/Bangkok",
          { signal: controller.signal }
        );
        clearTimeout(timeoutId);

        if (response.ok) {
          const data = await response.json();
          const serverTime = new Date(data.dateTime).getTime();
          const deviceTime = Date.now();
          const offset = serverTime - deviceTime;
          setTimeOffset(offset);
          console.log("⏰ Time synced with TimeAPI.io. Offset:", offset);
          return;
        }
      } catch (error) {
        // Quiet failure for primary
      }

      // 2. Fallback: WorldTimeAPI
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 5000);

        const response = await fetch(
          "https://worldtimeapi.org/api/timezone/Asia/Bangkok",
          { signal: controller.signal }
        );
        clearTimeout(timeoutId);

        if (response.ok) {
          const data = await response.json();
          const serverTime = new Date(data.datetime).getTime();
          const deviceTime = Date.now();
          const offset = serverTime - deviceTime;
          setTimeOffset(offset);
          console.log("⏰ Time synced with WorldTimeAPI. Offset:", offset);
          return;
        }
      } catch (error) {
        console.warn("⚠️ All Time APIs failed. Using device time.", error);
      }
    };

    syncTime();
    const interval = setInterval(syncTime, 10 * 60 * 1000);

    // IP Sync - Pre-fetch and background sync every 5 minutes
    const syncIp = async () => {
      try {
        const response = await fetch("https://api.ipify.org?format=json");
        if (response.ok) {
          const data = await response.json();
          setCurrentCachedIp(data.ip);
          console.log("🌐 IP synced in background:", data.ip);
        }
      } catch (error) {
        console.warn("⚠️ Background IP sync failed.", error);
      }
    };
    syncIp();
    const ipInterval = setInterval(syncIp, 5 * 60 * 1000);

    const handleOnline = () => {
      syncTime();
      syncIp();
      Swal.fire({
        icon: "success",
        title: "เชื่อมต่ออินเทอร์เน็ตแล้ว",
        text: "ระบบกลับมาทำงานออนไลน์",
        toast: true,
        position: "top-end",
        showConfirmButton: false,
        timer: 3000,
      });
    };
    window.addEventListener("online", handleOnline);

    return () => {
      clearInterval(interval);
      clearInterval(ipInterval);
      window.removeEventListener("online", handleOnline);
    };
  }, []);

  // Location Background Sync (Keep tracking to avoid delay when scanning)
  useEffect(() => {
    if (!navigator.geolocation) {
      console.warn("Geolocation not supported");
      return;
    }

    const startWatching = () => {
      locationWatchId.current = navigator.geolocation.watchPosition(
        (position) => {
          const coords = {
            lat: position.coords.latitude,
            lng: position.coords.longitude,
          };
          setCurrentLocationCoords(coords);
          console.log("📍 Location synced in background:", coords);
        },
        (error) => {
          console.warn("📍 Location watch error:", error.message);
        },
        { enableHighAccuracy: true, timeout: 20000, maximumAge: 10000 }
      );
    };

    startWatching();

    return () => {
      if (locationWatchId.current !== null) {
        navigator.geolocation.clearWatch(locationWatchId.current);
      }
    };
  }, []);

  useEffect(() => {
    const updateVoices = () => {
      const voices = window.speechSynthesis.getVoices();
      const thaiVoices = voices.filter((v) => v.lang.startsWith("th"));
      setAvailableVoices(thaiVoices);

      // If no voice selected yet, and there's a thai voice, and we haven't checked before
      if (!selectedVoiceURI && thaiVoices.length > 0) {
        // Try to find a female one as default
        const femaleKeywords = [
          "kanru",
          "pattara",
          "kanya",
          "narisa",
          "female",
          "เคนรุ",
          "ภัทรา",
          "กัญญา",
          "นริศา",
        ];
        const defaultFemale = thaiVoices.find((v) => {
          const name = v.name.toLowerCase();
          return (
            femaleKeywords.some((kw) => name.includes(kw)) && !name.includes("male")
          );
        });
        if (defaultFemale) {
          setSelectedVoiceURI(defaultFemale.voiceURI);
          localStorage.setItem("selectedVoiceURI", defaultFemale.voiceURI);
        } else {
          setSelectedVoiceURI(thaiVoices[0].voiceURI);
          localStorage.setItem("selectedVoiceURI", thaiVoices[0].voiceURI);
        }
      }
    };

    updateVoices();
    window.speechSynthesis.addEventListener("voiceschanged", updateVoices);
    return () =>
      window.speechSynthesis.removeEventListener("voiceschanged", updateVoices);
  }, [selectedVoiceURI]);

  useEffect(() => {
    const updateLocalTime = () => {
      const now = new Date(Date.now() + timeOffset);
      setCurrentTime(
        now.toLocaleTimeString("th-TH", {
          timeZone: "Asia/Bangkok",
          hour: "2-digit",
          minute: "2-digit",
          second: "2-digit",
        })
      );
    };

    updateLocalTime();
    const timerId = setInterval(updateLocalTime, 1000);

    return () => clearInterval(timerId);
  }, [timeOffset]);

  // Auto Reset UI after scanning
  useEffect(() => {
    if (displayUser) {
      if (displayUserTimeoutRef.current) clearTimeout(displayUserTimeoutRef.current);
      displayUserTimeoutRef.current = setTimeout(() => {
        setDisplayUser(null);
        setCheckinTime(null);
        setCheckoutTime(null);
        setSearchedUser(null);
        setError(null);
      }, 1200);
    }
    return () => {
      if (displayUserTimeoutRef.current) clearTimeout(displayUserTimeoutRef.current);
    };
  }, [displayUser]);

  useEffect(() => {
    const handleStatusChange = () => {
      if (!navigator.onLine) {
        Swal.fire({
          icon: "warning",
          title: "ขาดการเชื่อมต่ออินเทอร์เน็ต",
          text: "ระบบกำลังทำงานในโหมดออฟไลน์ ข้อมูลอาจไม่อัปเดตทันที",
          toast: true,
          position: "top-end",
          showConfirmButton: false,
          timer: 5000,
        });
      }
    };

    window.addEventListener("offline", handleStatusChange);
    return () => window.removeEventListener("offline", handleStatusChange);
  }, []);

  useEffect(() => {
    if (!schoolId) return;

    const fetchGoogleCalendar = async (apiKey: string) => {
      try {
        const year = new Date().getFullYear();
        const calendarId = "th.th#holiday@group.v.calendar.google.com";
        const timeMin = `${year}-01-01T00:00:00Z`;
        const timeMax = `${year}-12-31T23:59:59Z`;

        const response = await fetch(
          `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(
            calendarId
          )}/events?key=${apiKey}&timeMin=${timeMin}&timeMax=${timeMax}&singleEvents=true&orderBy=startTime`
        );

        if (response.ok) {
          const data = await response.json();
          const apiEvents: Record<string, any> = {};
          data.items?.forEach((item: any) => {
            if (item.start?.date && !isNonOfficialHoliday(item.summary)) {
              apiEvents[item.start.date] = {
                type: "holiday",
                description: item.summary,
              };
            }
          });
          setCalendarEvents((prev) => ({ ...apiEvents, ...prev }));
        }
      } catch (error) {
        console.error("Error fetching Google Calendar API:", error);
      } finally {
        setIsCalendarLoaded(true);
      }
    };

    const docRef = doc(
      firestore,
      "school-settings",
      schoolId,
      "main_calendar",
      "default"
    );

    const unsubscribe = onSnapshot(
      docRef,
      (docSnap) => {
        let firestoreEvents = {};
        if (docSnap.exists()) {
          const data = docSnap.data();
          if (data.events) {
            firestoreEvents = data.events;
          }
          if (data.academicYear) {
            setCurrentAcademicYear(data.academicYear);
          }
        }
        setCalendarEvents(firestoreEvents);

        const apiKey = import.meta.env.VITE_GOOGLE_CALENDAR_API_KEY;
        if (apiKey) {
          fetchGoogleCalendar(apiKey);
        } else {
          setIsCalendarLoaded(true);
        }
      },
      (error) => {
        console.error("Error listening to calendar:", error);
        if (error.code === "unavailable" || error.message?.includes("offline")) {
          console.warn(
            "Firestore connection issue. Please check your internet or disable CORS extensions."
          );
        }
        setIsCalendarLoaded(true);
      }
    );

    return () => unsubscribe();
  }, [schoolId]);

  useEffect(() => {
    const todayStr = getTodayString();
    const todayEvent = calendarEvents[todayStr];
    const dayOfWeek = new Date().toLocaleString("en-US", {
      timeZone: "Asia/Bangkok",
      weekday: "short",
    });
    const isWeekend = dayOfWeek === "Sat" || dayOfWeek === "Sun";

    if (todayEvent && todayEvent.type === "specialHoliday") {
      Swal.fire({
        icon: "info",
        title: "ประกาศ: วันหยุดกรณีพิเศษ",
        html: `วันนี้: <strong>${todayEvent.description || "ไม่มีรายละเอียด"}</strong>`,
        toast: true,
        position: "top-end",
        showConfirmButton: false,
        timer: 10000,
        timerProgressBar: true,
      });
    } else if (isWeekend && todayEvent?.type !== "schoolDay") {
      Swal.fire({
        icon: "info",
        title: "ประกาศ: วันหยุดประจำสัปดาห์",
        html: `วันนี้: <strong>${dayOfWeek === "Sat" ? "วันเสาร์" : "วันอาทิตย์"}</strong>`,
        toast: true,
        position: "top-end",
        showConfirmButton: false,
        timer: 10000,
        timerProgressBar: true,
      });
    }

    // Update isHoliday state
    if (
      (todayEvent &&
        (todayEvent.type === "holiday" || todayEvent.type === "specialHoliday")) ||
      (isWeekend && todayEvent?.type !== "schoolDay")
    ) {
      setIsHoliday(true);
    } else {
      setIsHoliday(false);
    }
  }, [calendarEvents]);

  const checkIpSecurity = async (
    currentUserId: string,
    currentIp: string | undefined
  ): Promise<{ valid: boolean; reason?: string; ip?: string }> => {
    const reduxRole = (currentUser as any)?.role;
    // Speed Optimization: Bypass for Attendance / Admin
    if (isAttendanceAdmin || reduxRole === "attendance" || reduxRole === "admin") {
      return { valid: true, ip: currentIp };
    }

    const lastSecurity = JSON.parse(
      localStorage.getItem("attendanceSecurity") || "{}"
    );
    const TIME_LIMIT = 5 * 60 * 1000; // 5 นาที

    if (
      currentIp &&
      lastSecurity.ip === currentIp &&
      lastSecurity.userId !== currentUserId &&
      Date.now() - lastSecurity.timestamp < TIME_LIMIT
    ) {
      return {
        valid: false,
        reason: `ไม่อนุญาตให้ลงเวลาแทนกัน! กรุณาใช้อุปกรณ์ของตนเองในการลงเวลา`,
        ip: currentIp,
      };
    }

    return { valid: true, ip: currentIp };
  };

  const validateLocationAndIp = async (
    currentIp: string | undefined
  ): Promise<{ valid: boolean; reason?: string }> => {
    const reduxRole = (currentUser as any)?.role;
    // Speed Optimization: Bypass for Attendance / Admin
    if (isAttendanceAdmin || reduxRole === "attendance" || reduxRole === "admin")
      return { valid: true };

    if (!schoolSettings) return { valid: true };

    const { allowedIpAddresses, latitude, longitude, checkInRadius, boundary } =
      schoolSettings;
    const hasIpConfig = allowedIpAddresses && allowedIpAddresses.length > 0;
    const hasLocationConfig = latitude && longitude;

    if (!hasIpConfig && !hasLocationConfig) return { valid: true };

    // 1. Check IP from Cache (Immediate)
    let ipCheckPassed = false;
    if (hasIpConfig) {
      const ipToUse = currentIp || currentCachedIp;
      if (ipToUse && allowedIpAddresses.includes(ipToUse)) {
        ipCheckPassed = true;
        // If IP matches, we can potentially bypass location for even faster throughput if that was intended,
        // but current logic requires both or either. Let's stick to current rule but use cache.
        if (!hasLocationConfig) return { valid: true };
      }
    }

    // 2. Check Location from Cache (Instant if watchPosition is working)
    if (hasLocationConfig) {
      // If we don't have cached location yet, or if it failed, we must try to get it once
      let coords = currentLocationCoords;

      if (!coords) {
        // Fallback: One-time get if background hasn't triggered yet
        try {
          const position: any = await new Promise((resolve, reject) => {
            navigator.geolocation.getCurrentPosition(resolve, reject, {
              timeout: 2000,
              enableHighAccuracy: true,
            });
          });
          coords = {
            lat: position.coords.latitude,
            lng: position.coords.longitude,
          };
          setCurrentLocationCoords(coords);
        } catch (e) {
          // Continue to error handling below
        }
      }

      if (coords) {
        const { lat, lng } = coords;
        if (boundary && boundary.length > 0) {
          if (isPointInPolygon({ lat, lng }, boundary)) return { valid: true };
        }

        const distance = getDistanceFromLatLonInM(lat, lng, latitude, longitude);
        const radius = checkInRadius || 100;

        if (distance <= radius) return { valid: true };

        // If location check failed but IP check passed, decide based on school policy
        // (Usually matching IP is enough for 'in school' status)
        if (ipCheckPassed) return { valid: true };

        const reason = hasIpConfig
          ? `เครือข่าย IP (${currentIp || currentCachedIp || "ไม่ระบุ"
          }) ไม่ถูกต้อง และอยู่นอกพื้นที่โรงเรียน (ห่าง ${Math.round(
            distance
          )} เมตร)`
          : `อยู่นอกพื้นที่ที่กำหนด (ห่าง ${Math.round(distance)} เมตร)`;
        return { valid: false, reason };
      }

      // If both checks failed or couldn't be performed
      if (ipCheckPassed) return { valid: true };
      return { valid: false, reason: "ไม่สามารถยืนยันตำแหน่งหรือเครือข่ายได้" };
    }

    return ipCheckPassed
      ? { valid: true }
      : { valid: false, reason: "ไม่อยู่ภายใต้เครือข่ายที่กำหนด" };
  };

  // Refactored search logic for reusability(Auto & Manual)
  const performSearch = async (idToSearchRaw: string) => {
    const idToSearch = idToSearchRaw.trim();
    if (!idToSearch || !schoolId || isLoading) return;

    setSearchId(""); // Clear immediately for next scan

    const todayStr = getTodayString();
    const todayEvent = calendarEvents[todayStr];
    const dayOfWeek = new Date().toLocaleString("en-US", {
      timeZone: "Asia/Bangkok",
      weekday: "short",
    });
    const isWeekend = dayOfWeek === "Sat" || dayOfWeek === "Sun";

    // Holiday Check
    if (
      (todayEvent &&
        (todayEvent.type === "holiday" || todayEvent.type === "specialHoliday")) ||
      (isWeekend && todayEvent?.type !== "schoolDay")
    ) {
      const description =
        todayEvent?.description ||
        (isWeekend ? (dayOfWeek === "Sat" ? "วันเสาร์" : "วันอาทิตย์") : "วันหยุด");
      Swal.fire({
        icon: "info",
        title: "วันนี้เป็นวันหยุด",
        html: `<strong>${description}</strong><br>งดการลงเวลาในวันนี้`,
        background: "#2a2b2f",
        color: "#ffffff",
        timer: 3000,
        showConfirmButton: false,
      });
      return;
    }

    setIsLoading(true);
    setError(null);
    setSearchedUser(null);

    try {
      let user: FoundUser | null = null;

      // ⚡ STEP 1: Memory Cache lookup
      if (sessionUserCache.current.has(idToSearch)) {
        user = sessionUserCache.current.get(idToSearch) || null;
      } else {
        // 🔍 STEP 2: Parallel Search with Permission check
        const searchPromises = [];
        if (canScanStudents) {
          searchPromises.push(
            getDocs(query(collection(firestore, "school-settings", schoolId, "students"), where("studentId", "==", idToSearch))),
            getDocs(query(collection(firestore, "school-settings", schoolId, "students"), where("rfid", "==", idToSearch)))
          );
        } else {
          // Push empty results if no permission
          searchPromises.push(Promise.resolve({ empty: true }), Promise.resolve({ empty: true }));
        }

        if (canScanTeachers) {
          searchPromises.push(
            getDocs(query(collection(firestore, "school-settings", schoolId, "teachers"), where("teacherId", "==", idToSearch)))
          );
        } else {
          searchPromises.push(Promise.resolve({ empty: true }));
        }

        const [studentSnap, rfidSnap, teacherSnap] = await Promise.all(searchPromises) as any[];

        if (canScanStudents && !studentSnap.empty) {
          const d = studentSnap.docs[0].data();
          user = {
            id: studentSnap.docs[0].id,
            type: "student",
            name: `${d.title || ""}${d.firstName} ${d.lastName}`,
            nickname: d.nickname || "",
            profileImageUrl: d.profileImageUrl || "",
            displayId: d.studentId,
            grade: String(d.classLevel || d.grade || d.classroom || ""),
            room: String(d.room || ""),
            parentLineUserIds: d.parentLineUserIds || [],
            behaviorScore: d.behaviorScore || 100,
            attendanceStats: {
              present: d.attendanceStats?.present || 0,
              late: d.attendanceStats?.late || 0,
              leave: d.attendanceStats?.leave || 0,
              absent: d.attendanceStats?.absent || 0,
              noCheckout: d.attendanceStats?.noCheckout || 0,
              officialTravel: d.attendanceStats?.officialTravel || 0,
            },
          };
        } else if (canScanTeachers && !teacherSnap.empty) {
          const d = teacherSnap.docs[0].data();
          user = {
            id: teacherSnap.docs[0].id,
            type: "teacher",
            name: `${d.title || ""}${d.firstName} ${d.lastName}`,
            profileImageUrl: d.profileImageUrl || "",
            displayId: d.teacherId,
            nickname: d.nickname || "",
            grade: String(d.homeroomGrade || d.classLevel || d.grade || ""),
            room: String(d.room || d.homeroomRoom || ""),
            position: d.position || "ครู",
          };
        } else if (canScanStudents && !rfidSnap.empty) {
          const d = rfidSnap.docs[0].data();
          user = {
            id: rfidSnap.docs[0].id,
            type: "student",
            name: `${d.title || ""}${d.firstName} ${d.lastName}`,
            nickname: d.nickname || "",
            profileImageUrl: d.profileImageUrl || "",
            displayId: d.studentId,
            grade: String(d.classLevel || d.grade || d.classroom || ""),
            room: String(d.room || ""),
            parentLineUserIds: d.parentLineUserIds || [],
            behaviorScore: d.behaviorScore || 100,
            attendanceStats: {
              present: d.attendanceStats?.present || 0,
              late: d.attendanceStats?.late || 0,
              leave: d.attendanceStats?.leave || 0,
              absent: d.attendanceStats?.absent || 0,
              noCheckout: d.attendanceStats?.noCheckout || 0,
              officialTravel: d.attendanceStats?.officialTravel || 0,
            },
          };
        }

        if (user) {
          sessionUserCache.current.set(idToSearch, user);
          if (user.displayId) sessionUserCache.current.set(user.displayId, user);
        }
      }

      if (user) {
        setSearchedUser(user);
        setDisplayUser(user);

        // Security & Attendance Check(Background)
        const currentIp = currentCachedIp;
        const [ipSecurity, validation, attData] = await Promise.all([
          checkIpSecurity(user.id, currentIp),
          validateLocationAndIp(currentIp),
          fetchAttendance(user),
        ]);

        if (!ipSecurity.valid || !validation.valid) {
          setError(
            ipSecurity.reason || validation.reason || "ไม่สามารถลงเวลาได้"
          );
          setSpeechTrigger(prev => ({ ...prev, timestamp: Date.now(), status: 'error' }));
          return;
        }

        if (!attData.checkinTime) {
          if (attData.leaveData) {
            Swal.fire({
              icon: "info",
              title: `นักเรียนมีสถานะ "${attData.leaveData.type || "ลา"}"`,
              html: `<strong>${user.name}</strong> ได้ลาไว้แล้ว ต้องการลงเวลาหรือไม่?`,
              showCancelButton: true,
              confirmButtonText: "ลงเวลาปกติ",
              cancelButtonText: "ยกเลิก",
              background: "#2a2b2f",
              color: "#ffffff",
            }).then((res) => {
              if (res.isConfirmed)
                updateAttendance("checkin", user!, ipSecurity.ip, attData);
            });
          } else {
            await updateAttendance("checkin", user, ipSecurity.ip, attData);
          }
        } else if (!attData.checkoutTime) {
          await updateAttendance("checkout", user, ipSecurity.ip, attData);
        } else {
          Swal.fire({
            icon: "info",
            title: "ลงเวลาครบแล้ว",
            text: `${user.name} ลงเวลาครบถ้วนแล้ว`,
            background: "#2a2b2f",
            color: "#ffffff",
            timer: 1500,
            showConfirmButton: false,
          });
        }
      } else {
        setError("ไม่พบข้อมูล");
        setSpeechTrigger(prev => ({ ...prev, timestamp: Date.now(), status: 'error' }));
      }
    } catch (err) {
      console.error("Search Error:", err);
      setError("เกิดข้อผิดพลาด");
      setSpeechTrigger(prev => ({ ...prev, timestamp: Date.now(), status: 'error' }));
    } finally {
      setIsLoading(false);
    }
  };

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    performSearch(searchId);
  };

  // Real-time Search Effect
  useEffect(() => {
    const cleanId = searchId.trim();
    if (cleanId.length === 5 || cleanId.length === 10) {
      const timer = setTimeout(() => {
        performSearch(cleanId);
      }, 300);
      return () => clearTimeout(timer);
    }
  }, [searchId]);

  const sendLineNotification = async (
    user: FoundUser,
    status: string,
    time: string
  ) => {
    if (user.type !== "student") return;
    try {
      // ดึงข้อมูลสรุปภาคเรียนล่าสุดสำหรับแจ้งเตือน
      const { semesterKey } = getPeriodKeys(getTodayString(), currentAcademicYear);
      const semesterRef = doc(
        firestore,
        "school-settings",
        schoolId!,
        "students",
        user.id,
        "Semestersummary",
        semesterKey
      );
      const semesterSnap = await getDoc(semesterRef);

      let semesterStats = { present: 0, late: 0, leave: 0, absent: 0, noCheckout: 0, officialTravel: 0 };
      if (semesterSnap.exists()) {
        const data = semesterSnap.data();
        semesterStats = {
          present: data.present || 0,
          late: data.late || 0,
          leave: data.leave || 0,
          absent: data.absent || 0,
          noCheckout: data.noCheckout || 0,
          officialTravel: data.officialTravel || 0,
        };
      } else {
        // ถ้ายังไม่มีข้อมูลสรุปภาคเรียน ให้ใช้ข้อมูลที่มีอยู่บน Student Doc เป็นพื้นฐาน (ถ้ามี)
        semesterStats = user.attendanceStats || semesterStats;
      }

      // สร้าง User object ใหม่พร้อมข้อมูลสถิติภาคเรียน
      const userWithSemesterStats: FoundUser = {
        ...user,
        attendanceStats: semesterStats,
      };

      let finalConfig: any = null;
      if (user.grade) {
        const teacherQuery = query(
          collection(firestore, "school-settings", schoolId!, "teachers"),
          where("homeroomGrade", "==", user.grade),
          where("isHomeroomTeacher", "==", true)
        );

        const teacherSnap = await getDocs(teacherQuery);
        if (!teacherSnap.empty) {
          const teacherData = teacherSnap.docs[0].data();
          if (
            teacherData.lineChannelAccessToken &&
            teacherData.enableNotification !== false
          ) {
            finalConfig = teacherData;
          }
        }
      }

      if (!finalConfig && schoolSettings?.lineOASettings?.school) {
        const schoolConfig = schoolSettings.lineOASettings.school;
        if (
          schoolConfig.lineChannelAccessToken &&
          schoolConfig.enableNotification !== false
        ) {
          finalConfig = schoolConfig;
        }
      }

      if (finalConfig) {
        await sendLineAttendanceNotification(
          userWithSemesterStats,
          status,
          time,
          finalConfig,
          user.parentLineUserIds || []
        );
      }
    } catch (error) {
      console.error("LINE Notify Error:", error);
    }
  };

  const getSummaryKey = (status: string | null | undefined) => {
    if (!status) return null;
    if (["มา", "OnTime", "กลับก่อน"].includes(status)) return "present";
    if (["สาย", "Late"].includes(status)) return "late";
    if (["ลา", "Leave"].includes(status) || status?.includes("ลา")) return "leave";
    if (["ขาด", "Absent"].includes(status)) return "absent";
    if (["ไปราชการ", "OfficialTravel"].includes(status)) return "officialTravel";
    return null;
  };

  const fetchAttendance = async (user: FoundUser) => {
    if (!schoolId)
      return {
        checkinTime: null,
        checkoutTime: null,
        status: null,
        leaveData: null,
        flagData: null,
      };
    const todayStr = getTodayString();
    const collectionName = user.type === "student" ? "students" : "teachers";
    const attendanceRef = doc(
      firestore,
      "school-settings",
      schoolId,
      collectionName,
      user.id,
      "attendance",
      todayStr
    );

    const [attendanceSnap, leaveSnap, flagSnap] = await Promise.all([
      getDoc(attendanceRef),
      user.type === "student"
        ? getDocs(
          query(
            collection(firestore, "school-settings", schoolId, "leave_summary"),
            where("studentId", "==", user.displayId),
            where("status", "==", "approved")
          )
        )
        : Promise.resolve(null),
      user.type === "student"
        ? getDoc(
          doc(
            firestore,
            "school-settings",
            schoolId,
            "students",
            user.id,
            "flag_ceremony_summary",
            todayStr
          )
        )
        : Promise.resolve(null),
    ]);

    let leaveData: LeaveRecord | null = null;
    if (leaveSnap) {
      const validLeave = leaveSnap.docs.find(
        (d) => d.data().startDate <= todayStr && d.data().endDate >= todayStr
      );
      if (validLeave)
        leaveData = { type: validLeave.data().leaveType, id: validLeave.id };
    }

    const checkin = attendanceSnap.exists()
      ? attendanceSnap.data().checkinTime?.toDate().toLocaleTimeString("th-TH")
      : null;
    const checkout = attendanceSnap.exists()
      ? attendanceSnap.data().checkoutTime?.toDate().toLocaleTimeString("th-TH")
      : null;
    const status = attendanceSnap.exists() ? attendanceSnap.data().status : null;
    const flagData = flagSnap?.exists() ? { status: flagSnap.data().status } : null;

    setCheckinTime(checkin);
    setCheckoutTime(checkout);
    return {
      checkinTime: checkin,
      checkoutTime: checkout,
      status,
      leaveData,
      flagData,
    };
  };

  const updateAttendance = async (
    type: "checkin" | "checkout" | "checkin_and_checkout",
    user: FoundUser,
    currentIp?: string,
    existingAttendance?: any
  ) => {
    if (!schoolId) return;

    const now = new Date(Date.now() + timeOffset);
    const todayStr = getTodayString();
    const timeStr = now.toLocaleTimeString("th-TH", {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
    const timeForCompare = now.toLocaleTimeString("en-GB", {
      hour: "2-digit",
      minute: "2-digit",
    });

    const collectionName = user.type === "student" ? "students" : "teachers";
    const attendanceRef = doc(
      firestore,
      "school-settings",
      schoolId,
      collectionName,
      user.id,
      "attendance",
      todayStr
    );

    let status = "";
    let attendanceData: any = {};
    const actionText =
      type === "checkin" ? "เข้า" : type === "checkout" ? "ออก" : "เข้าและออก";
    const lateTime =
      user.type === "student" ? studentLateTime : teacherLateTime;
    const checkoutTimeConfig =
      user.type === "student" ? studentCheckoutTime : teacherCheckoutTime;

    const oldStatus = existingAttendance?.status || null;

    if (type === "checkin" || type === "checkin_and_checkout") {
      let finalStatus = "มา";
      let description = "มาโรงเรียน";
      if (user.type === "student") {
        const gateRecord: GateRecord = {
          checkinTime: timeStr,
          status: timeForCompare > lateTime ? "สาย" : "มา",
        };
        const result = calculateAttendanceStatus(
          gateRecord,
          existingAttendance?.flagData,
          existingAttendance?.leaveData,
          null,
          { studentLateTime: studentLateTime }
        );
        if (result.finalStatus === "present") finalStatus = "มา";
        else if (result.finalStatus === "late") finalStatus = "สาย";
        else if (result.finalStatus === "leave") finalStatus = "ลา";
        else if (result.finalStatus === "officialTravel") finalStatus = "ไปราชการ";
        else finalStatus = "ขาด";
        description = result.description;
      } else {
        finalStatus = timeForCompare > lateTime ? "สาย" : "มา";
      }

      status = finalStatus;
      attendanceData = {
        schoolId,
        date: todayStr,
        userType: user.type,
        classLevel: user.grade || "",
        checkinTime: Timestamp.fromDate(now),
        status,
        checkinIp: currentIp,
        checkinDevice: navigator.userAgent,
        updatedAt: Timestamp.fromDate(now),
        metadata: { description, isGateCheckin: true },
      };
      setCheckinTime(timeStr);
    }

    if (type === "checkout" || type === "checkin_and_checkout") {
      const currentEffectiveStatus =
        type === "checkout" && existingAttendance
          ? existingAttendance.status
          : status;
      status =
        timeForCompare < checkoutTimeConfig ? "กลับก่อน" : currentEffectiveStatus;
      attendanceData = {
        ...attendanceData,
        schoolId,
        date: todayStr,
        userType: user.type,
        classLevel: user.grade || "",
        checkoutTime: Timestamp.fromDate(now),
        status,
        checkoutIp: currentIp,
        checkoutDevice: navigator.userAgent,
        updatedAt: Timestamp.fromDate(now),
      };

      setCheckoutTime(timeStr);
    }

    const batch = writeBatch(firestore);
    batch.set(attendanceRef, attendanceData, { merge: true });
    let behaviorScoreAfterUpdate = user.behaviorScore;

    if (user.type === "student") {
      const studentRef = doc(
        firestore,
        "school-settings",
        schoolId,
        "students",
        user.id
      );
      const behaviorScoreResult = applyAttendanceBehaviorScore({
        batch,
        studentRef,
        currentScore: user.behaviorScore,
        oldStatus,
        newStatus: status,
        config: schoolSettings?.behaviorScoreConfig,
      });
      if (behaviorScoreResult) {
        behaviorScoreAfterUpdate = behaviorScoreResult.nextScore;
      }

      updatePeriodSummaries(
        firestore,
        batch,
        schoolId,
        user.id,
        "students",
        todayStr,
        oldStatus,
        status,
        user.grade || "",
        currentAcademicYear
      );
    } else {
      updatePeriodSummaries(
        firestore,
        batch,
        schoolId,
        user.id,
        "teachers",
        todayStr,
        oldStatus,
        status,
        undefined,
        currentAcademicYear
      );
    }

    setLatestUsers((prev) => {
      const newUserAction: FoundUser = {
        ...user,
        behaviorScore: behaviorScoreAfterUpdate,
        latestActionTime: timeStr,
        status: status,
      };
      const updatedList = [
        newUserAction,
        ...prev.filter((u) => u.id !== user.id),
      ].slice(0, 8);
      localStorage.setItem("latestUsers", JSON.stringify(updatedList));
      return updatedList;
    });

    await batch.commit();

    Swal.fire({
      icon: "success",
      title: `ลงเวลา${actionText}สำเร็จ`,
      html: `<strong>${user.name}</strong>`,
      background: "#2a2b2f",
      color: "#ffffff",
      timer: 800,
      showConfirmButton: false,
      toast: true,
      position: "top-end",
    });

    if (user.type === "student") {
      sendLineNotification({ ...user, behaviorScore: behaviorScoreAfterUpdate }, status, timeStr);
    }
    setSpeechTrigger({ user, type, timestamp: Date.now(), status: 'success' });
  };

  const processAbsencesByType = async (targetType: "student" | "teacher") => {
    if (!schoolId) return;

    const todayStr = getTodayString();
    const collName = targetType === "student" ? "students" : "teachers";

    try {
      const snap = await getDocs(
        collection(firestore, "school-settings", schoolId, collName)
      );
      const batch = writeBatch(firestore);
      let count = 0;

      for (const uDoc of snap.docs) {
        const userData = uDoc.data();
        const attRef = doc(
          firestore,
          "school-settings",
          schoolId,
          collName,
          uDoc.id,
          "attendance",
          todayStr
        );
        const attSnap = await getDoc(attRef);
        if (!attSnap.exists()) {
          batch.set(attRef, {
            status: "ขาด",
            date: todayStr,
            schoolId,
            userType: targetType,
            updatedAt: serverTimestamp(),
          });
          if (targetType === "student") {
            applyAttendanceBehaviorScore({
              batch,
              studentRef: doc(firestore, "school-settings", schoolId, "students", uDoc.id),
              currentScore: userData.behaviorScore,
              oldStatus: null,
              newStatus: "ขาด",
              config: schoolSettings?.behaviorScoreConfig,
            });
          }
          count++;
        }
      }

      if (count > 0) await batch.commit();
    } catch (err) {
      console.error(`Absence processing error (${targetType}):`, err);
    }
  };

  useEffect(() => {
    if (!schoolSettings || !calendarEvents || !isCalendarLoaded || isHoliday)
      return;

    const checkTime = () => {
      const now = new Date(Date.now() + timeOffset);
      const timeStr = now.toLocaleTimeString("en-GB", {
        hour: "2-digit",
        minute: "2-digit",
      });

      if (timeStr === studentCheckinEnd) {
        processAbsencesByType("student");
      }
    };

    const timer = setInterval(checkTime, 60 * 1000);
    return () => clearInterval(timer);
  }, [schoolSettings, calendarEvents, isCalendarLoaded, isHoliday, timeOffset]);

  const userName = (currentUser as any)?.displayName || "ผู้ดูแลระบบ";

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-[#1e1f21] flex flex-col transition-colors duration-300">
      <main className="flex-grow flex items-center justify-center p-6">
        <div className="w-full max-w-screen-2xl">
          <div className="grid grid-cols-1 xl:grid-cols-12 gap-10">
            <div className="xl:col-span-8 flex flex-col gap-10 h-full">
              <div className="bg-white dark:bg-[#2a2b2f] rounded-3xl p-10 text-gray-900 dark:text-white shadow-sm dark:shadow-none">
                <div className="flex items-center gap-5 mb-8">
                  {schoolSettings?.logoUrl && (
                    <img 
                      src={schoolSettings.logoUrl} 
                      alt="School Logo" 
                      className="w-16 h-16 object-contain rounded-xl"
                    />
                  )}
                  <div className="flex flex-col">
                    <h1 className="text-5xl font-extrabold text-gray-900 dark:text-white">
                      ระบบลงเวลา{schoolName ? ` | ${schoolName}` : ""}
                    </h1>
                    {schoolSettings?.affiliation && (
                      <p className="text-xl text-gray-900 dark:text-white font-bold mt-1">
                        สังกัด: {schoolSettings.affiliation}
                      </p>
                    )}
                  </div>
                </div>
                <HolidayBanner
                  calendarEvents={calendarEvents}
                  getTodayString={getTodayString}
                />
                <div>
                  <div className="grid grid-cols-1 lg:grid-cols-5 gap-10 flex-1">
                    <UserInfoPanel
                      displayUser={displayUser}
                      checkinTime={checkinTime}
                      checkoutTime={checkoutTime}
                      affiliation={schoolSettings?.affiliation}
                    />
                    <SearchPanel
                      handleSearch={handleSearch}
                      searchId={searchId}
                      setSearchId={setSearchId}
                      error={error}
                      currentTime={currentTime}
                      calendarEvents={calendarEvents}
                      getTodayString={getTodayString}
                      studentLateTime={studentLateTime}
                      studentCheckoutTime={studentCheckoutTime}
                      teacherLateTime={teacherLateTime}
                      teacherCheckoutTime={teacherCheckoutTime}
                      canScanStudents={canScanStudents}
                      canScanTeachers={canScanStudents && canScanTeachers ? false : canScanTeachers}
                    />
                  </div>
                </div>
              </div>
            </div>
            <div className="xl:col-span-4 h-full">
              <LatestUsers 
                latestUsers={latestUsers.filter(u => 
                  (u.type === 'student' && canScanStudents) || 
                  (u.type !== 'student' && canScanTeachers)
                )} 
                vertical={true} 
              />
            </div>
          </div>
        </div>
      </main>

      <AttendanceSpeech
        user={speechTrigger.user}
        actionType={speechTrigger.type}
        timestamp={speechTrigger.timestamp}
        selectedVoiceURI={selectedVoiceURI}
        enabled={schoolSettings?.attendanceConfig?.enableSpeech !== false}
        status={speechTrigger.status}
      />

      <div className="fixed bottom-6 right-6 z-50">
        <button
          onClick={() => setShowVoiceSelect(!showVoiceSelect)}
          className="bg-white dark:bg-[#2a2b2f] p-3 rounded-full shadow-lg border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300 hover:text-indigo-600 dark:hover:text-indigo-400 transition-all hover:scale-110"
          title="ตั้งค่าเสียงพูด"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            className="h-6 w-6"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z"
            />
          </svg>
        </button>

        {showVoiceSelect && (
          <div className="absolute bottom-16 right-0 w-64 bg-white dark:bg-[#2a2b2f] rounded-xl shadow-2xl border border-gray-200 dark:border-gray-700 p-4 animate-in fade-in slide-in-from-bottom-2 duration-200">
            <h3 className="text-sm font-bold mb-3 text-gray-800 dark:text-gray-200">
              {" "}
              เลือกเสียงพูด(Thai Voices)
            </h3>
            <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
              {availableVoices.length > 0 ? (
                availableVoices.map((voice) => (
                  <button
                    key={voice.voiceURI}
                    onClick={() => {
                      setSelectedVoiceURI(voice.voiceURI);
                      localStorage.setItem("selectedVoiceURI", voice.voiceURI);
                      setShowVoiceSelect(false);
                      const utterance = new SpeechSynthesisUtterance(
                        "ทดสอบเสียงพูดครับ"
                      );
                      utterance.voice = voice;
                      utterance.lang = "th-TH";
                      utterance.rate = 0.95;
                      utterance.pitch = 1.05;
                      window.speechSynthesis.speak(utterance);
                    }}
                    className={`w-full text-left px-3 py-2 rounded-lg text-xs transition-colors ${selectedVoiceURI === voice.voiceURI
                      ? "bg-indigo-600 text-white"
                      : "hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-600 dark:text-gray-400"
                      } `}
                  >
                    <div className="font-semibold truncate">{voice.name}</div>
                    <div className="opacity-70">{voice.lang}</div>
                  </button>
                ))
              ) : (
                <div className="text-xs text-gray-500 py-2">
                  ไม่พบเสียงภาษาไทยในเครื่องของคุณ
                </div>
              )}
            </div>
            <button
              onClick={() => setShowVoiceSelect(false)}
              className="mt-3 w-full py-2 text-xs font-semibold text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 border-t border-gray-100 dark:border-gray-700"
            >
              ปิด
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

export default CheckinOutPage;
