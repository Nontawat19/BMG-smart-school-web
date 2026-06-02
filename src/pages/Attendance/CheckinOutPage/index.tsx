import React, { useState, useEffect, useRef, useCallback } from "react";
import { useSelector } from "react-redux";
import { firestore, storage } from "../../../firebase";
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
import { getDownloadURL, ref, uploadBytes } from "firebase/storage";
import Swal from "sweetalert2";
import { RootState } from "../../../store";
import { isNonOfficialHoliday } from "../../../utils/calendarUtils";
import { FoundUser } from "./types";
import { sendLineAttendanceNotification } from "./AttendanceLineNotify";
import { deg2rad, getDistanceFromLatLonInM, isPointInPolygon, getStatusKey } from "./utils";
import HolidayBanner from "./HolidayBanner";
import UserInfoPanel from "./UserInfoPanel";
import SearchPanel from "./SearchPanel";
import FaceScanPanel from "./FaceScanPanel";
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
import { isAttendanceEntryOnly } from "../../../utils/attendanceRoles";

// Imports for collapsible right settings panel
import { createPortal } from "react-dom";
import { Settings, Sun, Moon, ChevronsLeft, ChevronsRight, ScanFace, ShieldCheck, Radio } from "lucide-react";
import LogoutButton from "@/components/LogoutButton";
import { useTheme } from "@/ThemeContext";

const LOCAL_FACE_BRIDGE_URL = "http://127.0.0.1:18188/findface";
const FACE_SCAN_DEBUG = import.meta.env.VITE_FACE_SCAN_DEBUG === "true";

const isLoopbackHost = (hostname: string) =>
  hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1";

const shouldProxyInsecureFaceEndpoint = (targetUrl: string) => {
  if (!targetUrl.startsWith("http://")) return false;
  if (typeof window === "undefined") return false;
  if (window.location.protocol !== "https:") return false;

  try {
    const parsed = new URL(targetUrl);
    return !isLoopbackHost(parsed.hostname);
  } catch {
    return false;
  }
};

const resolveFaceFetchUrl = (targetUrl: string) => {
  if (shouldProxyInsecureFaceEndpoint(targetUrl)) {
    return `${LOCAL_FACE_BRIDGE_URL}?url=${encodeURIComponent(targetUrl)}`;
  }
  return targetUrl;
};

const normalizeFaceBox = (face: any, sentW: number, sentH: number) => {
  const b = face?.bbox || face?.bounding_box || face?.boundingBox || face?.rect || face?.rectangle || face;
  if (!b || !sentW || !sentH) return null;

  let left = 0;
  let top = 0;
  let right = 0;
  let bottom = 0;

  if (Array.isArray(b)) {
    left = Number(b[0] ?? 0);
    top = Number(b[1] ?? 0);
    right = Number(b[2] ?? 0);
    bottom = Number(b[3] ?? 0);
  } else {
    left = Number(b.left ?? b.x ?? b.x1 ?? b.originX ?? b.origin_x ?? 0);
    top = Number(b.top ?? b.y ?? b.y1 ?? b.originY ?? b.origin_y ?? 0);
    const width = Number(b.width ?? b.w ?? 0);
    const height = Number(b.height ?? b.h ?? 0);
    right = Number(b.right ?? b.x2 ?? (width ? left + width : 0));
    bottom = Number(b.bottom ?? b.y2 ?? (height ? top + height : 0));
  }

  if (!Number.isFinite(left) || !Number.isFinite(top) || !Number.isFinite(right) || !Number.isFinite(bottom)) {
    return null;
  }

  // Some APIs return [x, y, width, height] rather than [left, top, right, bottom].
  if (right <= left && Number(b?.width ?? b?.w) > 0) right = left + Number(b.width ?? b.w);
  if (bottom <= top && Number(b?.height ?? b?.h) > 0) bottom = top + Number(b.height ?? b.h);

  const x = Math.max(0, Math.min(1, left / sentW));
  const y = Math.max(0, Math.min(1, top / sentH));
  const width = Math.max(0, Math.min(1 - x, (right - left) / sentW));
  const height = Math.max(0, Math.min(1 - y, (bottom - top) / sentH));

  if (width <= 0 || height <= 0) return null;
  return { x, y, width, height };
};

const getEventYear = (dateKey: string) => {
  const year = Number(dateKey.slice(0, 4));
  return Number.isFinite(year) ? year : null;
};

const hasOfficialHolidayForYear = (events: Record<string, any>, year: number) =>
  Object.entries(events).some(([dateKey, event]) => {
    if (getEventYear(dateKey) !== year) return false;
    return event?.type === "holiday" || event?.type === "specialHoliday";
  });

const normalizeHomeroomValue = (value?: string | number | null) =>
  String(value ?? "").trim().replace(/\s+/g, "");

const splitHomeroom = (grade?: string | number | null, room?: string | number | null) => {
  const rawGrade = normalizeHomeroomValue(grade);
  const rawRoom = normalizeHomeroomValue(room);
  const [gradePart, roomPart = ""] = rawGrade.split("/");
  const normalizedGrade = gradePart || rawGrade;
  const normalizedRoom = rawRoom || roomPart;

  return {
    grade: normalizedGrade,
    room: normalizedRoom,
    gradeWithRoom: normalizedGrade && normalizedRoom ? `${normalizedGrade}/${normalizedRoom}` : rawGrade,
  };
};

const uniq = <T,>(values: T[]) => Array.from(new Set(values.filter(Boolean)));

const expandStudentIdCandidates = (value?: string | number | null) => {
  const raw = String(value ?? "").trim();
  if (!raw) return [];

  const candidates = [raw];
  if (/^\d{1,5}$/.test(raw)) {
    candidates.push(raw.padStart(5, "0"));
  }

  return uniq(candidates);
};

const isSameHomeroom = (teacherData: any, studentGrade?: string, studentRoom?: string) => {
  const student = splitHomeroom(studentGrade, studentRoom);
  const teacher = splitHomeroom(teacherData?.homeroomGrade, teacherData?.homeroomRoom);

  if (!student.grade || !teacher.grade || student.grade !== teacher.grade) return false;
  if (student.room && teacher.room && student.room !== teacher.room) return false;
  if (student.room && !teacher.room && teacher.gradeWithRoom !== student.gradeWithRoom) return false;
  return true;
};

const CheckinOutPage: React.FC = () => {
  const { user: currentUser } = useSelector((state: RootState) => state.auth);
  const schoolId = currentUser?.schoolId;
  const { isDarkMode, toggleTheme } = useTheme();
  const [isThemePanelOpen, setIsThemePanelOpen] = useState(false);
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
  const [displayUsers, setDisplayUsers] = useState<FoundUser[]>([]);
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
  const [studentCheckinStart, setStudentCheckinStart] = useState("06:00");
  const [studentCheckinEnd, setStudentCheckinEnd] = useState("11:00");
  const [studentCheckoutStart, setStudentCheckoutStart] = useState("14:00");
  const [studentCheckoutEnd, setStudentCheckoutEnd] = useState("18:00");
  const [teacherCheckinStart, setTeacherCheckinStart] = useState("06:00");
  const [teacherCheckinEnd, setTeacherCheckinEnd] = useState("11:00");
  const [teacherCheckoutStart, setTeacherCheckoutStart] = useState("14:00");
  const [teacherCheckoutEnd, setTeacherCheckoutEnd] = useState("18:00");
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
  const faceScanCooldownRef = useRef<Map<string, number>>(new Map());

  // Use the imported getTodayString from dateUtils

  // Memory Cache for the current session to avoid redundant Firestore reads
  const sessionUserCache = useRef<Map<string, FoundUser>>(new Map());

  useEffect(() => {
    const storedUsers = localStorage.getItem("latestUsers");
    if (storedUsers) {
      setLatestUsers(JSON.parse(storedUsers).slice(0, 8));
    }
  }, []);

  // Pre-load and cache all teachers to avoid Firestore reads during scanning
  useEffect(() => {
    if (!schoolId) return;

    const loadAndCacheTeachers = async () => {
      try {
        const cacheKey = `teachers_cache_${schoolId}`;
        const cachedData = localStorage.getItem(cacheKey);
        if (cachedData) {
          try {
            const parsed = JSON.parse(cachedData);
            if (Array.isArray(parsed)) {
              parsed.forEach((teacherDoc: any) => {
                const user = buildFoundUser("teacher", teacherDoc.id, teacherDoc.data, "สแกนใบหน้า");
                sessionUserCache.current.set(user.id, user);
                if (user.displayId) sessionUserCache.current.set(user.displayId, user);
                if (user.rfid) sessionUserCache.current.set(user.rfid, user);
                if (user.findfaceCardId) sessionUserCache.current.set(String(user.findfaceCardId), user);
                if (user.name) {
                  sessionUserCache.current.set(user.name, user);
                  sessionUserCache.current.set(user.name.replace(/\s+/g, ""), user);
                }
              });
              if (FACE_SCAN_DEBUG) console.log(`Loaded ${parsed.length} teachers from localStorage cache.`);
            }
          } catch (e) {
            console.error("Error parsing cached teachers:", e);
          }
        }

        // Fetch fresh list from Firestore in the background
        const teachersSnap = await getDocs(
          collection(firestore, "school-settings", schoolId, "teachers")
        );
        
        const toCache: any[] = [];
        teachersSnap.forEach((docSnap) => {
          const data = docSnap.data();
          const docId = docSnap.id;
          toCache.push({ id: docId, data });

          const user = buildFoundUser("teacher", docId, data, "สแกนใบหน้า");
          sessionUserCache.current.set(user.id, user);
          if (user.displayId) sessionUserCache.current.set(user.displayId, user);
          if (user.rfid) sessionUserCache.current.set(user.rfid, user);
          if (user.findfaceCardId) sessionUserCache.current.set(String(user.findfaceCardId), user);
          if (user.name) {
            sessionUserCache.current.set(user.name, user);
            sessionUserCache.current.set(user.name.replace(/\s+/g, ""), user);
          }
        });

        localStorage.setItem(cacheKey, JSON.stringify(toCache));
        if (FACE_SCAN_DEBUG) console.log(`Cached ${toCache.length} teachers successfully!`);
      } catch (err) {
        console.error("Error caching teachers:", err);
      }
    };

    loadAndCacheTeachers();
  }, [schoolId]);

  // Pre-load and cache all students to avoid Firestore reads during scanning
  useEffect(() => {
    if (!schoolId) return;

    const loadAndCacheStudents = async () => {
      try {
        const cacheKey = `students_cache_${schoolId}`;
        const cachedData = localStorage.getItem(cacheKey);
        if (cachedData) {
          try {
            const parsed = JSON.parse(cachedData);
            if (Array.isArray(parsed)) {
              parsed.forEach((studentDoc: any) => {
                const user = buildFoundUser("student", studentDoc.id, studentDoc.data, "สแกนใบหน้า");
                sessionUserCache.current.set(user.id, user);
                if (user.displayId) sessionUserCache.current.set(user.displayId, user);
                if (user.rfid) sessionUserCache.current.set(user.rfid, user);
                if (user.findfaceCardId) sessionUserCache.current.set(String(user.findfaceCardId), user);
                if (user.name) {
                  sessionUserCache.current.set(user.name, user);
                  sessionUserCache.current.set(user.name.replace(/\s+/g, ""), user);
                }
              });
              if (FACE_SCAN_DEBUG) console.log(`Loaded ${parsed.length} students from localStorage cache.`);
            }
          } catch (e) {
            console.error("Error parsing cached students:", e);
          }
        }

        // Fetch fresh list from Firestore in the background
        const studentsSnap = await getDocs(
          collection(firestore, "school-settings", schoolId, "students")
        );
        
        const toCache: any[] = [];
        studentsSnap.forEach((docSnap) => {
          const data = docSnap.data();
          const docId = docSnap.id;
          toCache.push({ id: docId, data });

          const user = buildFoundUser("student", docId, data, "สแกนใบหน้า");
          sessionUserCache.current.set(user.id, user);
          if (user.displayId) sessionUserCache.current.set(user.displayId, user);
          if (user.rfid) sessionUserCache.current.set(user.rfid, user);
          if (user.findfaceCardId) sessionUserCache.current.set(String(user.findfaceCardId), user);
          if (user.name) {
            sessionUserCache.current.set(user.name, user);
            sessionUserCache.current.set(user.name.replace(/\s+/g, ""), user);
          }
        });

        localStorage.setItem(cacheKey, JSON.stringify(toCache));
        if (FACE_SCAN_DEBUG) console.log(`Cached ${toCache.length} students successfully!`);
      } catch (err) {
        console.error("Error caching students:", err);
      }
    };

    loadAndCacheStudents();
  }, [schoolId]);

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
            if (data.attendanceConfig.studentCheckinStart)
              setStudentCheckinStart(data.attendanceConfig.studentCheckinStart);
            if (data.attendanceConfig.studentCheckinEnd)
              setStudentCheckinEnd(data.attendanceConfig.studentCheckinEnd);
            if (data.attendanceConfig.studentCheckoutStart)
              setStudentCheckoutStart(data.attendanceConfig.studentCheckoutStart);
            if (data.attendanceConfig.studentCheckoutEnd)
              setStudentCheckoutEnd(data.attendanceConfig.studentCheckoutEnd);
            if (data.attendanceConfig.teacherCheckinStart)
              setTeacherCheckinStart(data.attendanceConfig.teacherCheckinStart);
            if (data.attendanceConfig.teacherCheckinEnd)
              setTeacherCheckinEnd(data.attendanceConfig.teacherCheckinEnd);
            if (data.attendanceConfig.teacherCheckoutStart)
              setTeacherCheckoutStart(data.attendanceConfig.teacherCheckoutStart);
            if (data.attendanceConfig.teacherCheckoutEnd)
              setTeacherCheckoutEnd(data.attendanceConfig.teacherCheckoutEnd);
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

    let locationLoggedOnce = false;
    const startWatching = () => {
      locationWatchId.current = navigator.geolocation.watchPosition(
        (position) => {
          const coords = {
            lat: position.coords.latitude,
            lng: position.coords.longitude,
          };
          setCurrentLocationCoords(coords);
          if (!locationLoggedOnce) {
            console.log("📍 Location synced in background:", coords);
            locationLoggedOnce = true;
          }
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
    if (displayUser || displayUsers.length > 0) {
      if (displayUserTimeoutRef.current) clearTimeout(displayUserTimeoutRef.current);
      displayUserTimeoutRef.current = setTimeout(() => {
        setDisplayUser(null);
        setDisplayUsers([]);
        setCheckinTime(null);
        setCheckoutTime(null);
        setSearchedUser(null);
        setError(null);
      }, 3000);
    }
    return () => {
      if (displayUserTimeoutRef.current) clearTimeout(displayUserTimeoutRef.current);
    };
  }, [displayUser, displayUsers]);

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

    const fetchGoogleCalendar = async (apiKey: string, firestoreEvents: Record<string, any>) => {
      try {
        const year = new Date().getFullYear();
        if (hasOfficialHolidayForYear(firestoreEvents, year)) {
          setIsCalendarLoaded(true);
          return;
        }

        const calendarId = "th.th#holiday@group.v.calendar.google.com";
        const timeMin = `${year}-01-01T00:00:00Z`;
        const timeMax = `${year}-12-31T23:59:59Z`;

        const response = await fetch(
          `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(
            calendarId
          )}/events?key=${apiKey}&timeMin=${timeMin}&timeMax=${timeMax}&singleEvents=true&orderBy=startTime`
        );

        if (!response.ok) {
          console.warn(
            `Google Calendar holidays unavailable (${response.status}). Using school calendar saved in Firestore.`
          );
          setIsCalendarLoaded(true);
          return;
        }

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

        setCalendarEvents((prev) => {
          const mergedEvents = { ...apiEvents, ...prev };
          if (Object.keys(apiEvents).length > 0) {
            const todayStr = getTodayString();
            const todayEvent = mergedEvents[todayStr];
            if (todayEvent?.type === "holiday" || todayEvent?.type === "specialHoliday") {
              console.log("📅 Holiday loaded from Google Calendar fallback:", todayEvent.description || todayStr);
            }
          }
          return mergedEvents;
        });
      } catch (error) {
        console.warn("Google Calendar holidays unavailable. Using school calendar saved in Firestore.", error);
      } finally {
        setIsCalendarLoaded(true);
      }
    };

    const loadSavedCalendar = () => {
      const docRef = doc(
        firestore,
        "school-settings",
        schoolId,
        "main_calendar",
        "default"
      );

      const unsubscribe = onSnapshot(
        docRef,
        async (docSnap) => {
          let firestoreEvents: Record<string, any> = {};
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
            await fetchGoogleCalendar(apiKey, firestoreEvents);
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

      return unsubscribe;
    };

    const unsubscribeCalendar = loadSavedCalendar();

    return () => {
      unsubscribeCalendar();
    };
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

  const buildFoundUser = useCallback((
    type: "student" | "teacher",
    id: string,
    d: any,
    scanMethod: string,
    faceConfidence?: number,
    findfaceCardId?: string
  ): FoundUser => {
    const rawFirstName = d.firstName || d.firstname || d.first_name || "";
    const rawLastName = d.lastName || d.lastname || d.last_name || "";
    const rawName = d.name || d.fullName || d.fullname || d.displayName || d.display_name || "";
    
    let resolvedName = "";
    if (rawFirstName || rawLastName) {
      resolvedName = `${d.title || ""}${rawFirstName} ${rawLastName}`.trim();
    } else {
      resolvedName = rawName || "-";
    }

    if (type === "student") {
      return {
        id,
        type,
        name: resolvedName,
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
        rfid: d.rfid || "",
        scanMethod,
        faceConfidence,
        findfaceCardId: findfaceCardId || d.findfaceCardId || d.faceExternalId || "",
      };
    }

    return {
      id,
      type,
      name: resolvedName,
      profileImageUrl: d.profileImageUrl || "",
      displayId: d.teacherId,
      nickname: d.nickname || "",
      grade: String(d.homeroomGrade || d.classLevel || d.grade || ""),
      room: String(d.room || d.homeroomRoom || ""),
      position: d.position || "ครู",
      role: d.role,
      rfid: d.rfid || "",
      scanMethod,
      faceConfidence,
      findfaceCardId: findfaceCardId || d.findfaceCardId || d.faceExternalId || "",
    };
  }, []);

  const fetchAttendance = useCallback(async (user: FoundUser) => {
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
  }, [schoolId]);

  const uploadFaceScanSnapshot = useCallback(async (
    image: Blob,
    user: FoundUser,
    confidence?: number
  ): Promise<string | null> => {
    if (!schoolId || !image || image.size === 0) return null;

    try {
      const todayStr = getTodayString();
      const safeUserId = String(user.id || user.displayId || "unknown").replace(/[^a-zA-Z0-9_-]/g, "_");
      const timestamp = Date.now();
      const imageRef = ref(
        storage,
        `school-settings/${schoolId}/face-scan-snapshots/${todayStr}/${safeUserId}-${timestamp}.jpg`
      );
      const snapshot = await uploadBytes(imageRef, image, {
        contentType: image.type || "image/jpeg",
        customMetadata: {
          userId: user.id,
          userType: user.type,
          scanMethod: "สแกนใบหน้า",
          confidence: confidence !== undefined ? String(confidence) : "",
          capturedAt: new Date(timestamp).toISOString(),
        },
      });
      return await getDownloadURL(snapshot.ref);
    } catch (error) {
      console.error("Face scan snapshot upload failed:", error);
      return null;
    }
  }, [schoolId]);

  const sendLineNotification = useCallback(async (
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
      let recipientUserIds: string[] = [...(user.parentLineUserIds || [])];

      if (user.grade) {
        const homeroom = splitHomeroom(user.grade, user.room);
        const gradeCandidates = uniq([
          normalizeHomeroomValue(user.grade),
          homeroom.grade,
          homeroom.gradeWithRoom,
        ]);
        const teacherRef = collection(firestore, "school-settings", schoolId!, "teachers");
        const teacherSnaps = await Promise.all(
          gradeCandidates.map((gradeCandidate) =>
            getDocs(query(
              teacherRef,
              where("homeroomGrade", "==", gradeCandidate),
              where("isHomeroomTeacher", "==", true)
            ))
          )
        );

        const homeroomTeachers = new Map<string, any>();
        teacherSnaps.forEach((teacherSnap) => {
          teacherSnap.docs.forEach((teacherDoc) => {
            const teacherData = teacherDoc.data();
            if (isSameHomeroom(teacherData, user.grade, user.room)) {
              homeroomTeachers.set(teacherDoc.id, teacherData);
            }
          });
        });

        homeroomTeachers.forEach((teacherData) => {
          // ดึง lineUserId ของครูประจำชั้นทุกคนในห้องมาใส่ร่วมกับกลุ่มรับข้อความแจ้งเตือน
          if (teacherData.lineUserId) {
            recipientUserIds.push(teacherData.lineUserId);
          }

          if (
            !finalConfig &&
            teacherData.lineChannelAccessToken &&
            teacherData.enableNotification !== false
          ) {
            finalConfig = teacherData;
          }
        });

        if (FACE_SCAN_DEBUG) {
          console.log("[LINE] Homeroom lookup:", {
            student: `${homeroom.grade}${homeroom.room ? `/${homeroom.room}` : ""}`,
            gradeCandidates,
            teacherCount: homeroomTeachers.size,
            recipientCount: recipientUserIds.length,
          });
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
        console.log("[LINE] Sending attendance notification:", {
          studentId: user.displayId,
          name: user.name,
          scanMethod: user.scanMethod,
          status,
          recipientCount: recipientUserIds.filter(Boolean).length,
          hasToken: Boolean(finalConfig.lineChannelAccessToken),
        });
        await sendLineAttendanceNotification(
          userWithSemesterStats,
          status,
          time,
          finalConfig,
          recipientUserIds
        );
      } else {
        console.warn("[LINE] No active LINE config found for attendance notification:", {
          studentId: user.displayId,
          name: user.name,
          scanMethod: user.scanMethod,
          recipientCount: recipientUserIds.filter(Boolean).length,
        });
      }
    } catch (error) {
      console.error("LINE Notify Error:", error);
    }
  }, [schoolId, currentAcademicYear, schoolSettings]);

  const updateAttendance = useCallback(async (
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
        scanType: user.scanMethod || "สแกนบัตร",
        updatedAt: Timestamp.fromDate(now),
        metadata: {
          description,
          isGateCheckin: true,
          faceConfidence: user.scanMethod === "สแกนใบหน้า" ? user.faceConfidence ?? null : null,
          findfaceCardId: user.scanMethod === "สแกนใบหน้า" ? user.findfaceCardId || null : null,
        },
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
        scanType: user.scanMethod || "สแกนบัตร",
        updatedAt: Timestamp.fromDate(now),
        metadata: user.scanMethod === "สแกนใบหน้า"
          ? {
              ...(attendanceData.metadata || {}),
              faceConfidence: user.faceConfidence ?? null,
              findfaceCardId: user.findfaceCardId || null,
            }
          : attendanceData.metadata,
      };

      setCheckoutTime(timeStr);
    }

    const batch = writeBatch(firestore);
    batch.set(attendanceRef, attendanceData, { merge: true });
    console.log("[Attendance] Saving attendance:", {
      userId: user.id,
      displayId: user.displayId,
      name: user.name,
      type: user.type,
      action: type,
      status,
      scanType: attendanceData.scanType,
      hasFaceScanImage: Boolean(user.faceScanImageUrl),
    });
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
      if (!isAttendanceEntryOnly(user.role)) {
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
    console.log("[Attendance] Saved attendance successfully:", {
      userId: user.id,
      displayId: user.displayId,
      name: user.name,
      status,
      scanType: attendanceData.scanType,
    });

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
      await sendLineNotification({ ...user, behaviorScore: behaviorScoreAfterUpdate }, status, timeStr);
    }
    setSpeechTrigger({ user, type, timestamp: Date.now(), status: 'success' });
  }, [schoolId, timeOffset, studentLateTime, teacherLateTime, studentCheckoutTime, teacherCheckoutTime, schoolSettings, currentAcademicYear, sendLineNotification]);

  const resolveFaceMatchedUser = useCallback(async (payload: any): Promise<FoundUser | null> => {
    if (!schoolId) return null;
    const confidence = Number(payload.confidence ?? payload.similarity ?? payload.score ?? payload.looks_like_confidence ?? 0);
    const type = (payload.userType || payload.type || "").toString().toLowerCase();
    const userId = payload.userId || payload.docId || payload.firebaseId;
    const toKey = (value: any) => (value === undefined || value === null ? "" : String(value).trim());
    const uniqueKeys = (...values: any[]) => Array.from(new Set(values.map(toKey).filter(Boolean)));
    const displayCandidates = uniqueKeys(
      payload.displayId,
      payload.studentId,
      payload.student_id,
      payload.teacherId,
      payload.teacher_id,
      payload.description,
      payload.externalId,
      payload.external_id,
      payload.cardName,
      payload.name,
      payload.comment
    );
    const cardCandidates = uniqueKeys(
      payload.findfaceCardId,
      payload.cardId,
      payload.card_id,
      payload.id,
      payload.cardName,
      payload.name,
      payload.comment
    );
    const displayId = displayCandidates[0];
    const cardId = cardCandidates[0];

    // ฟังก์ชันช่วยจัดการลบคำนำหน้าชื่อภาษาไทย
    const cleanName = (fullName: string) => {
      let clean = fullName.trim();
      const titles = ["นาย", "นางสาว", "นาง", "เด็กชาย", "ด.ช.", "เด็กหญิง", "ด.ญ.", "ดร.", "ครู"];
      for (const title of titles) {
        if (clean.startsWith(title)) {
          clean = clean.substring(title.length).trim();
          break;
        }
      }
      return clean;
    };

    // 1. ตรวจสอบใน Local In-Memory Cache ก่อนเพื่อประหยัดการอ่าน Firebase
    for (const lookupKey of uniqueKeys(userId, ...displayCandidates, ...cardCandidates)) {
      if (sessionUserCache.current.has(lookupKey)) {
        const cached = sessionUserCache.current.get(lookupKey)!;
        return { ...cached, faceConfidence: confidence, findfaceCardId: cardId ? String(cardId) : cached.findfaceCardId };
      }
    }

    // เพิ่มการจับคู่ด้วยชื่อใน Cache เพิ่มเติมแบบทนทาน (Robust Name Caching)
    const nameToMatch = payload.name || payload.cardName || displayCandidates.find((value) => value.includes(" ")) || null;
    if (nameToMatch) {
      const cleanPayloadName = cleanName(nameToMatch);
      const cleanPayloadNameNoSpace = cleanPayloadName.replace(/\s+/g, "");
      if (sessionUserCache.current.has(nameToMatch)) {
        const cached = sessionUserCache.current.get(nameToMatch)!;
        return { ...cached, faceConfidence: confidence, findfaceCardId: cardId ? String(cardId) : cached.findfaceCardId };
      }
      if (sessionUserCache.current.has(cleanPayloadName)) {
        const cached = sessionUserCache.current.get(cleanPayloadName)!;
        return { ...cached, faceConfidence: confidence, findfaceCardId: cardId ? String(cardId) : cached.findfaceCardId };
      }
      if (sessionUserCache.current.has(cleanPayloadNameNoSpace)) {
        const cached = sessionUserCache.current.get(cleanPayloadNameNoSpace)!;
        return { ...cached, faceConfidence: confidence, findfaceCardId: cardId ? String(cardId) : cached.findfaceCardId };
      }
    }

    const tryDoc = async (collectionName: "students" | "teachers", docId: string) => {
      // ตรวจสอบใน Cache อีกครั้ง
      if (sessionUserCache.current.has(docId)) {
        const cached = sessionUserCache.current.get(docId)!;
        return { ...cached, faceConfidence: confidence, findfaceCardId: cardId ? String(cardId) : cached.findfaceCardId };
      }

      const snap = await getDoc(doc(firestore, "school-settings", schoolId, collectionName, docId));
      if (!snap.exists()) return null;

      const user = buildFoundUser(collectionName === "students" ? "student" : "teacher", snap.id, snap.data(), "สแกนใบหน้า", confidence, cardId);
      if (user) {
        // บันทึกใส่ Cache เพื่อใช้ในการสแกนครั้งถัดไปทันที
        sessionUserCache.current.set(user.id, user);
        if (user.displayId) sessionUserCache.current.set(user.displayId, user);
        if (cardId) sessionUserCache.current.set(String(cardId), user);
        if (user.findfaceCardId) sessionUserCache.current.set(String(user.findfaceCardId), user);
        if (user.name) {
          sessionUserCache.current.set(user.name, user);
          sessionUserCache.current.set(user.name.replace(/\s+/g, ""), user);
        }
      }
      return user;
    };

    if (userId && (type === "student" || type === "students")) {
      const user = await tryDoc("students", userId);
      if (user) return user;
    }
    if (userId && (type === "teacher" || type === "teachers")) {
      const user = await tryDoc("teachers", userId);
      if (user) return user;
    }

    const searches = [];
    if (canScanStudents) {
      for (const candidate of displayCandidates) {
        searches.push(getDocs(query(collection(firestore, "school-settings", schoolId, "students"), where("studentId", "==", candidate))));
      }
      for (const candidate of cardCandidates) {
        searches.push(getDocs(query(collection(firestore, "school-settings", schoolId, "students"), where("findfaceCardId", "==", candidate))));
      }
      
      // การค้นหาจากชื่อ-นามสกุล ใน Firestore ของนักเรียน
      if (nameToMatch) {
        const normalized = cleanName(nameToMatch);
        const parts = normalized.split(/\s+/);
        if (parts.length >= 2) {
          const fName = parts[0];
          const lName = parts.slice(1).join(" ");
          searches.push(getDocs(query(collection(firestore, "school-settings", schoolId, "students"), where("firstName", "==", fName), where("lastName", "==", lName))));
        }
        searches.push(getDocs(query(collection(firestore, "school-settings", schoolId, "students"), where("name", "==", nameToMatch))));
      }
    }
    if (canScanTeachers) {
      for (const candidate of displayCandidates) {
        searches.push(getDocs(query(collection(firestore, "school-settings", schoolId, "teachers"), where("teacherId", "==", candidate))));
        searches.push(getDocs(query(collection(firestore, "school-settings", schoolId, "teachers"), where("idCardNumber", "==", candidate))));
      }
      for (const candidate of cardCandidates) {
        searches.push(getDocs(query(collection(firestore, "school-settings", schoolId, "teachers"), where("findfaceCardId", "==", candidate))));
      }

      // การค้นหาจากชื่อ-นามสกุล ใน Firestore ของครู
      if (nameToMatch) {
        const normalized = cleanName(nameToMatch);
        const parts = normalized.split(/\s+/);
        if (parts.length >= 2) {
          const fName = parts[0];
          const lName = parts.slice(1).join(" ");
          searches.push(getDocs(query(collection(firestore, "school-settings", schoolId, "teachers"), where("firstName", "==", fName), where("lastName", "==", lName))));
        }
        searches.push(getDocs(query(collection(firestore, "school-settings", schoolId, "teachers"), where("name", "==", nameToMatch))));
      }
    }

    const results = await Promise.all(searches);
    for (const snap of results) {
      if (!snap.empty) {
        const docSnap = snap.docs[0];
        const pathSegments = docSnap.ref.path.split("/");
        const collectionName = pathSegments[pathSegments.length - 2];
        const user = buildFoundUser(collectionName === "students" ? "student" : "teacher", docSnap.id, docSnap.data(), "สแกนใบหน้า", confidence, cardId);
        if (user) {
          // บันทึกใส่ Cache เพื่อใช้ในการสแกนครั้งถัดไปทันที
          sessionUserCache.current.set(user.id, user);
          if (user.displayId) sessionUserCache.current.set(user.displayId, user);
          if (cardId) sessionUserCache.current.set(String(cardId), user);
          if (user.findfaceCardId) sessionUserCache.current.set(String(user.findfaceCardId), user);
          if (user.name) {
            sessionUserCache.current.set(user.name, user);
            sessionUserCache.current.set(user.name.replace(/\s+/g, ""), user);
          }
        }
        return user;
      }
    }

    if (FACE_SCAN_DEBUG) {
      console.warn("[FaceScan] FindFace returned a face, but no matching Firestore user was found:", {
        userId,
        displayCandidates,
        cardCandidates,
        name: payload.name || payload.cardName || payload.comment || payload.description,
      });
    }

    return null;
  }, [schoolId, canScanStudents, canScanTeachers, buildFoundUser]);

  const processAttendanceForUser = useCallback(async (user: FoundUser, isIpCameraScan?: boolean) => {
    console.log("[Attendance] Processing scanned user:", {
      userId: user.id,
      displayId: user.displayId,
      name: user.name,
      type: user.type,
      scanMethod: user.scanMethod,
      faceConfidence: user.faceConfidence,
      isIpCameraScan: Boolean(isIpCameraScan),
    });
    setSearchedUser(user);
    setDisplayUser(user);

    const currentIp = currentCachedIp;
    const [ipSecurity, validation, attData] = await Promise.all([
      isIpCameraScan
        ? Promise.resolve<{ valid: boolean; reason?: string; ip?: string }>({ valid: true, ip: currentIp })
        : checkIpSecurity(user.id, currentIp),
      isIpCameraScan
        ? Promise.resolve<{ valid: boolean; reason?: string }>({ valid: true })
        : validateLocationAndIp(currentIp),
      fetchAttendance(user),
    ]);

    if (!ipSecurity.valid || !validation.valid) {
      console.warn("[Attendance] Blocked by IP/location validation:", {
        userId: user.id,
        displayId: user.displayId,
        name: user.name,
        ipSecurity,
        validation,
      });
      setError(ipSecurity.reason || validation.reason || "ไม่สามารถลงเวลาได้");
      setSpeechTrigger(prev => ({ ...prev, timestamp: Date.now(), status: 'error' }));
      return;
    }

    const isFaceScan = user.scanMethod === "สแกนใบหน้า";

    const now = new Date(Date.now() + timeOffset);
    const timeForCompare = now.toLocaleTimeString("en-GB", {
      hour: "2-digit",
      minute: "2-digit",
    });

    const isStudent = user.type === "student";
    const checkinStart = isStudent ? studentCheckinStart : teacherCheckinStart;
    const checkinEnd = isStudent ? studentCheckinEnd : teacherCheckinEnd;
    const checkoutStart = isStudent ? studentCheckoutStart : teacherCheckoutStart;
    const checkoutEnd = isStudent ? studentCheckoutEnd : teacherCheckoutEnd;

    // Check-in Attempt (before check-out window starts)
    if (timeForCompare < checkoutStart) {
      if (timeForCompare < checkinStart) {
        console.warn("[Attendance] Blocked: before check-in window:", {
          displayId: user.displayId,
          name: user.name,
          now: timeForCompare,
          checkinStart,
        });
        if (!isFaceScan) {
          Swal.fire({
            icon: "warning",
            title: "ยังไม่ถึงเวลาลงเวลาเข้า",
            text: `เวลาเริ่มลงเวลาเข้าคือ ${checkinStart} (ขณะนี้เวลา ${timeForCompare})`,
            background: "#2a2b2f",
            color: "#ffffff",
            timer: 2500,
            showConfirmButton: false,
          });
        }
        setError(`ยังไม่ถึงเวลาลงเวลาเข้า (เริ่ม ${checkinStart})`);
        return;
      }

      if (timeForCompare > checkinEnd) {
        if (attData.checkinTime) {
          console.info("[Attendance] Skipped: already checked in and checkout window has not started:", {
            displayId: user.displayId,
            name: user.name,
            checkinTime: attData.checkinTime,
            checkoutStart,
          });
          if (!isFaceScan) {
            Swal.fire({
              icon: "info",
              title: "ลงเวลาเข้าเรียนไว้แล้ว",
              text: `${user.name} ได้ลงเวลาเข้าไว้แล้ว (ยังไม่ถึงเวลาลงเวลากลับบ้าน: ${checkoutStart})`,
              background: "#2a2b2f",
              color: "#ffffff",
              timer: 2000,
              showConfirmButton: false,
            });
          }
          return;
        }
        if (!isFaceScan) {
          Swal.fire({
            icon: "warning",
            title: "หมดเวลาลงเวลาเข้าแล้ว",
            text: `ช่วงเวลาลงเวลาเข้าคือ ${checkinStart} - ${checkinEnd} (ขณะนี้เวลา ${timeForCompare})`,
            background: "#2a2b2f",
            color: "#ffffff",
            timer: 2500,
            showConfirmButton: false,
          });
        }
        setError(`หมดเวลาลงเวลาเข้าแล้ว (สิ้นสุด ${checkinEnd})`);
        console.warn("[Attendance] Blocked: check-in window ended:", {
          displayId: user.displayId,
          name: user.name,
          now: timeForCompare,
          checkinEnd,
          hasCheckinTime: Boolean(attData.checkinTime),
        });
        return;
      }

      // Valid check-in window
      if (attData.checkinTime) {
        console.info("[Attendance] Skipped: already checked in:", {
          displayId: user.displayId,
          name: user.name,
          checkinTime: attData.checkinTime,
          scanMethod: user.scanMethod,
        });
        if (!isFaceScan) {
          Swal.fire({
            icon: "info",
            title: "ลงเวลาเข้าเรียนไว้แล้ว",
            text: `${user.name} ได้ลงเวลาเข้าเรียนเรียบร้อยแล้ว`,
            background: "#2a2b2f",
            color: "#ffffff",
            timer: 2000,
            showConfirmButton: false,
          });
        }
        return;
      }

      // Proceed with checkin
      if (attData.leaveData) {
        if (isFaceScan) {
          await updateAttendance("checkin", user, ipSecurity.ip, attData);
        } else {
          const result = await Swal.fire({
            icon: "info",
            title: `นักเรียนมีสถานะ "${attData.leaveData.type || "ลา"}"`,
            html: `<strong>${user.name}</strong> ได้ลาไว้แล้ว ต้องการลงเวลาหรือไม่?`,
            showCancelButton: true,
            confirmButtonText: "ลงเวลาปกติ",
            cancelButtonText: "ยกเลิก",
            background: "#2a2b2f",
            color: "#ffffff",
          });
          if (result.isConfirmed) await updateAttendance("checkin", user, ipSecurity.ip, attData);
        }
      } else {
        await updateAttendance("checkin", user, ipSecurity.ip, attData);
      }
    }
    // Check-out Attempt (after check-out window starts)
    else {
      if (timeForCompare > checkoutEnd) {
        console.warn("[Attendance] Blocked: checkout window ended:", {
          displayId: user.displayId,
          name: user.name,
          now: timeForCompare,
          checkoutEnd,
        });
        if (!isFaceScan) {
          Swal.fire({
            icon: "warning",
            title: "หมดเวลาลงเวลากลับแล้ว",
            text: `ช่วงเวลาลงเวลากลับคือ ${checkoutStart} - ${checkoutEnd} (ขณะนี้เวลา ${timeForCompare})`,
            background: "#2a2b2f",
            color: "#ffffff",
            timer: 2500,
            showConfirmButton: false,
          });
        }
        setError(`หมดเวลาลงเวลากลับแล้ว (สิ้นสุด ${checkoutEnd})`);
        return;
      }

      if (attData.checkoutTime) {
        console.info("[Attendance] Skipped: already checked out:", {
          displayId: user.displayId,
          name: user.name,
          checkoutTime: attData.checkoutTime,
          scanMethod: user.scanMethod,
        });
        if (!isFaceScan) {
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
        return;
      }

      // Proceed with checkout / checkin-and-checkout
      if (!attData.checkinTime) {
        // Did not check-in in the morning, perform both checkin and checkout
        await updateAttendance("checkin_and_checkout", user, ipSecurity.ip, attData);
      } else {
        await updateAttendance("checkout", user, ipSecurity.ip, attData);
      }
    }
  }, [
    currentCachedIp,
    checkIpSecurity,
    validateLocationAndIp,
    fetchAttendance,
    timeOffset,
    updateAttendance,
    studentCheckinStart,
    studentCheckinEnd,
    studentCheckoutStart,
    studentCheckoutEnd,
    teacherCheckinStart,
    teacherCheckinEnd,
    teacherCheckoutStart,
    teacherCheckoutEnd
  ]);

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
        if (user) {
          user = {
            ...user,
            scanMethod: (user.rfid && idToSearch === user.rfid) ? "สแกนบัตร" : "พิมพ์รหัสเอง"
          };
        }
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
            getDocs(query(collection(firestore, "school-settings", schoolId, "teachers"), where("teacherId", "==", idToSearch))),
            getDocs(query(collection(firestore, "school-settings", schoolId, "teachers"), where("rfid", "==", idToSearch)))
          );
        } else {
          searchPromises.push(Promise.resolve({ empty: true }), Promise.resolve({ empty: true }));
        }

        const [studentSnap, rfidSnap, teacherSnap, teacherRfidSnap] = await Promise.all(searchPromises) as any[];

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
            rfid: d.rfid || "",
            scanMethod: "พิมพ์รหัสเอง",
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
            role: d.role,
            rfid: d.rfid || "",
            scanMethod: "พิมพ์รหัสเอง",
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
            rfid: d.rfid || "",
            scanMethod: "สแกนบัตร",
          };
        } else if (canScanTeachers && teacherRfidSnap && !teacherRfidSnap.empty) {
          const d = teacherRfidSnap.docs[0].data();
          user = {
            id: teacherRfidSnap.docs[0].id,
            type: "teacher",
            name: `${d.title || ""}${d.firstName} ${d.lastName}`,
            profileImageUrl: d.profileImageUrl || "",
            displayId: d.teacherId,
            nickname: d.nickname || "",
            grade: String(d.homeroomGrade || d.classLevel || d.grade || ""),
            room: String(d.room || d.homeroomRoom || ""),
            position: d.position || "ครู",
            role: d.role,
            rfid: d.rfid || "",
            scanMethod: "สแกนบัตร",
          };
        }

        if (user) {
          sessionUserCache.current.set(idToSearch, user);
          if (user.displayId) sessionUserCache.current.set(user.displayId, user);
        }
      }

      if (user) {
        await processAttendanceForUser(user);
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

  const getSummaryKey = (status: string | null | undefined) => {
    if (!status) return null;
    if (["มา", "OnTime", "กลับก่อน"].includes(status)) return "present";
    if (["สาย", "Late"].includes(status)) return "late";
    if (["ลา", "Leave"].includes(status) || status?.includes("ลา")) return "leave";
    if (["ขาด", "Absent"].includes(status)) return "absent";
    if (["ไปราชการ", "OfficialTravel"].includes(status)) return "officialTravel";
    return null;
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
  const isFaceScanModeEnabled = schoolSettings?.useFaceScanMode === true;
  let faceScanEndpoint =
    schoolSettings?.faceScanConfig?.endpoint ||
    schoolSettings?.findFaceEndpoint ||
    import.meta.env.VITE_FACE_SCAN_ENDPOINT ||
    "";
  
  // ✅ ระบบ Proxy อัตโนมัติ: หากรันใน localhost และ endpoint ชี้ไปที่ IP เซิร์ฟเวอร์ FindFace 
  // จะทำการสลับมาใช้สะพานเชื่อม Proxy (http://localhost:5173/findface-api/) อัตโนมัติเพื่อเลี่ยง CORS
  if (window.location.hostname === "localhost" && faceScanEndpoint.includes("118.172.43.186")) {
    faceScanEndpoint = "http://localhost:5173/findface-api/";
  }
  const faceScanThreshold = Number(schoolSettings?.faceScanConfig?.confidenceThreshold ?? 0.85);

  useEffect(() => {
    if (!isFaceScanModeEnabled) {
      faceScanCooldownRef.current.clear();
    }
  }, [isFaceScanModeEnabled]);

  const handleIdentifyFaceFrame = useCallback(async (
    image: Blob,
    liveness?: { isFake: boolean; isScreen: boolean; isPaper: boolean; message?: string; isIpCamera?: boolean }
  ) => {
    const isIpCamera = !!liveness?.isIpCamera;
    const effectiveFaceScanThreshold = faceScanThreshold;
    if (liveness?.isFake) {
      console.warn("🚨 [FaceScan] Client-side liveness check blocked identification:", liveness.message);
      return { 
        matched: false, 
        message: liveness.message || "ตรวจพบการใช้อุปกรณ์จำลอง/ภาพถ่าย (Anti-Spoofing)" 
      };
    }

    if (!schoolId || !faceScanEndpoint) {
      return { matched: false, message: "ยังไม่ได้ตั้งค่า endpoint" };
    }

    const todayStr = getTodayString();
    const todayEvent = calendarEvents[todayStr];
    const dayOfWeek = new Date().toLocaleString("en-US", {
      timeZone: "Asia/Bangkok",
      weekday: "short",
    });
    const isWeekend = dayOfWeek === "Sat" || dayOfWeek === "Sun";
    if (
      (todayEvent && (todayEvent.type === "holiday" || todayEvent.type === "specialHoliday")) ||
      (isWeekend && todayEvent?.type !== "schoolDay")
    ) {
      return { matched: false, message: "วันนี้เป็นวันหยุด" };
    }

    let payload: any = null;
    let isFindFaceDirect = false;
    const token = schoolSettings?.faceScanConfig?.token || import.meta.env.VITE_FACE_SCAN_TOKEN || "";

    // ตรวจสอบว่าเป็นการเชื่อมต่อตรงกับเซิร์ฟเวอร์ FindFace Multi หรือไม่
    if (
      token ||
      faceScanEndpoint.includes("findface-api") ||
      faceScanEndpoint.includes("118.172.43.186") ||
      faceScanEndpoint.includes("8356")
    ) {
      isFindFaceDirect = true;
    }

    if (isFindFaceDirect) {
      try {
        const baseUrl = faceScanEndpoint.endsWith("/") ? faceScanEndpoint.slice(0, -1) : faceScanEndpoint;
        
        // 1. แนบ ?extract_liveness=true ใน URL Query String (สำหรับ FindFace Multi v4+)
        const detectUrl = `${baseUrl}/detect?extract_liveness=true`;

        if (FACE_SCAN_DEBUG) console.log("📸 [FaceScan] กำลังจับภาพใบหน้าส่งไปยัง FindFace Direct (Liveness Enabled)...");

        // ขั้นตอนที่ 1: ตรวจจับใบหน้าและดึง Object ID พร้อมเปิดการตรวจสอบ Liveness (Anti-Spoofing)
        const detectFormData = new FormData();
        detectFormData.append("photo", image, `face-${Date.now()}.jpg`);
        
        // 2. แนบพารามิเตอร์ตรวจสอบ Liveness ในทุกรูปแบบที่ FindFace SDK / Server รองรับ
        detectFormData.append("extract_liveness", "true");
        detectFormData.append("liveness", "true");
        detectFormData.append("extract_attributes", "liveness");
        detectFormData.append("attributes", JSON.stringify({ face: { liveness: true } }));

        const headers: Record<string, string> = {};
        if (token) {
          headers["Authorization"] = token.startsWith("Token ") ? token : `Token ${token}`;
        }

        const detectResponse = await fetch(resolveFaceFetchUrl(detectUrl), {
          method: "POST",
          body: detectFormData,
          headers,
        });

        if (!detectResponse.ok) {
          console.error("FindFace detection failed:", detectResponse.statusText);
          return { matched: false, message: "ไม่สามารถส่งภาพไปประมวลผลได้" };
        }

        const detectResult = await detectResponse.json();
        const faceObjects = detectResult.objects?.face || [];
        if (FACE_SCAN_DEBUG) console.log("👤 [FaceScan] ตรวจพบใบหน้าในเฟรม:", faceObjects.length, "ใบหน้า");
        
        if (faceObjects.length === 0) {
          return { matched: false, message: "ไม่พบใบหน้า", faceBoxes: [] };
        }

        // Get sent image dimensions for bbox normalization
        const imageBitmap = await createImageBitmap(image);
        const sentW = imageBitmap.width;
        const sentH = imageBitmap.height;
        imageBitmap.close();

        // Parallelize for up to 15 faces — track bbox + user + liveness per face
        const targetFaces = faceObjects.slice(0, 15);
        
        // Log detailed face attributes to diagnose FindFace liveness structure
        if (FACE_SCAN_DEBUG) {
          targetFaces.forEach((f: any, idx: number) => {
            console.log(`🔍 [FaceScan] Face #${idx} Attributes:`, JSON.stringify(f.attributes || {}));
          });
        }

        const faceResults: { bbox: any; user: FoundUser | null; isFake: boolean }[] = targetFaces.map((f: any) => {
          const liveness = f.attributes?.liveness || f.liveness || {};
          const status = liveness.status || liveness.value || f.liveness_status;
          
          let isFake = status === "fake";
          
          // ตรวจสอบคะแนนความเชื่อมั่น (Confidence) ของ Liveness ถ้าส่งกลับมาเป็นคะแนนทศนิยม
          const livenessScore = liveness.confidence ?? liveness.score ?? liveness.value;
          if (typeof livenessScore === "number") {
            // ใน FindFace, ถ้าค่า Liveness ต่ำกว่า 0.70 ถือว่ามีความเป็นไปได้สูงที่จะเป็นกระดาษ/หน้าจอ
            if (livenessScore < 0.70) {
              isFake = true;
            }
          }

          // If this is an IP camera / CCTV feed, bypass the server-side liveness check
          // because high-mounted security cameras are extremely prone to false-positive spoofing errors
          if (isIpCamera) {
            isFake = false;
          }
          
          return {
            bbox: f.bbox,
            user: null,
            isFake,
          };
        });

        // Track if any of the faces are detected as spoofing attempts
        let detectedSpoof = false;

        await Promise.all(
          targetFaces.map(async (faceObj: any, faceIdx: number) => {
            const isFakeFace = faceResults[faceIdx].isFake;
            if (isFakeFace) {
              detectedSpoof = true;
              console.warn(`🚨 [FaceScan] ตรวจพบความพยายามหลอกระบบใบหน้า #${faceIdx} (Liveness Status: fake, Confidence: ${faceObj.attributes?.liveness?.confidence ?? 0})`);
              return; // Skip database search for fake face
            }

            const faceId = faceObj.id.toString().startsWith("detection:")
              ? faceObj.id
              : `detection:${faceObj.id}`;
              
            const searchUrl = `${baseUrl}/cards/humans/?looks_like=${encodeURIComponent(faceId)}&limit=1&ordering=looks_like_confidence`;
            
            try {
              const searchResponse = await fetch(resolveFaceFetchUrl(searchUrl), {
                method: "GET",
                headers,
              });

              if (!searchResponse.ok) {
                if (FACE_SCAN_DEBUG) {
                  const errorText = await searchResponse.text().catch(() => "");
                  console.warn("[FaceScan] FindFace search failed:", searchResponse.status, errorText);
                }
                return;
              }

              const searchResult = await searchResponse.json();
              const matchedCard = searchResult.results?.[0];
              if (!matchedCard) {
                if (FACE_SCAN_DEBUG) console.log("[FaceScan] FindFace search returned no matched card:", searchResult);
                return;
              }

              const confidence = Number(
                matchedCard.looks_like_confidence ??
                matchedCard.looks_like_similarity ??
                matchedCard.confidence ??
                matchedCard.similarity ??
                matchedCard.score ??
                0
              );
              if (FACE_SCAN_DEBUG) console.log(`⚙️ [FaceScan] ใบหน้า #${faceIdx}: ${matchedCard.name || "ไม่มีชื่อ"}, ความมั่นใจ=${(confidence * 100).toFixed(1)}%, เกณฑ์=${(effectiveFaceScanThreshold * 100).toFixed(1)}%`);
              
              if (confidence < effectiveFaceScanThreshold) return;

              const matchedMeta = matchedCard.meta || {};
              const matchedDisplayId =
                matchedMeta.studentId ||
                matchedMeta.student_id ||
                matchedMeta.teacherId ||
                matchedMeta.teacher_id ||
                matchedMeta.externalId ||
                matchedMeta.external_id ||
                matchedCard.name ||
                matchedCard.comment ||
                matchedCard.id;

              const facePayload = {
                matched: true,
                looks_like_confidence: confidence,
                confidence: confidence,
                id: matchedCard.id,
                findfaceCardId: matchedCard.id,
                cardId: matchedCard.id,
                cardName: matchedCard.name,
                name: matchedCard.name,
                comment: matchedCard.comment,
                externalId: matchedMeta.externalId || matchedMeta.external_id || matchedMeta.studentId || matchedMeta.teacherId,
                external_id: matchedMeta.external_id,
                studentId: matchedMeta.studentId || matchedMeta.student_id,
                student_id: matchedMeta.student_id,
                teacherId: matchedMeta.teacherId || matchedMeta.teacher_id,
                teacher_id: matchedMeta.teacher_id,
                displayId: matchedDisplayId,
              };

              const user = await resolveFaceMatchedUser(facePayload);
              if (user) {
                faceResults[faceIdx].user = { ...user, faceConfidence: confidence };
              } else if (FACE_SCAN_DEBUG) {
                console.log("[FaceScan] FindFace card matched but no school user resolved:", facePayload);
              }
            } catch (err) {
              console.error("Error searching face object:", faceObj.id, err);
            }
          })
        );

        // Build normalized faceBoxes (0-1) for real-time bounding box display
        const faceBoxes = faceResults
          .map((r, idx) => {
            const normalized = normalizeFaceBox(targetFaces[idx], sentW, sentH);
            if (!normalized) return null;
            return { ...normalized, user: r.user, isFake: r.isFake };
          })
          .filter(Boolean) as { x: number; y: number; width: number; height: number; user: FoundUser | null; isFake: boolean }[];

        // Collect unique matched users for attendance processing
        const uniqueUsers: FoundUser[] = [];
        const seenIds = new Set<string>();
        for (const r of faceResults) {
          if (r.user && !seenIds.has(r.user.id)) {
            seenIds.add(r.user.id);
            uniqueUsers.push(r.user);
          }
        }

        if (FACE_SCAN_DEBUG) console.log("👥 [FaceScan] ผลลัพธ์:", faceObjects.length, "ใบหน้า,", uniqueUsers.length, "แมตช์:", uniqueUsers.map(u => u.name));
        if (uniqueUsers.length > 0) {
          console.log("[FaceScan] Matched Firestore users:", uniqueUsers.map((user) => ({
            userId: user.id,
            displayId: user.displayId,
            name: user.name,
            type: user.type,
            confidence: user.faceConfidence,
          })));
        }

        if (uniqueUsers.length === 0) {
          const errMsg = detectedSpoof 
            ? "ตรวจพบการใช้อุปกรณ์จำลอง/ภาพถ่าย (Anti-Spoofing)" 
            : "พบใบหน้าแต่ยังไม่ผูกกับข้อมูลโรงเรียนหรือความมั่นใจต่ำ";
          return { matched: false, message: errMsg, faceBoxes };
        }

        // Process attendance for each detected user
        const updatedUsers: FoundUser[] = [];
        for (const user of uniqueUsers) {
          const lastScanAt = faceScanCooldownRef.current.get(user.id) || 0;

          if (Date.now() - lastScanAt < 30_000) {
            try {
              const attData = await fetchAttendance(user);
              updatedUsers.push({
                ...user,
                checkinTime: attData.checkinTime || undefined,
                checkoutTime: attData.checkoutTime || undefined,
              });
            } catch (err) {
              updatedUsers.push(user);
            }
          } else {
            faceScanCooldownRef.current.set(user.id, Date.now());
            setError(null);
            const faceScanImageUrl = await uploadFaceScanSnapshot(image, user, user.faceConfidence);
            
            const processedUser = {
              ...user,
              scanMethod: "สแกนใบหน้า",
              faceConfidence: user.faceConfidence,
              faceScanImageUrl: faceScanImageUrl || user.faceScanImageUrl,
            };

            await processAttendanceForUser(processedUser, isIpCamera);

            try {
              const attData = await fetchAttendance(user);
              updatedUsers.push({
                ...processedUser,
                checkinTime: attData.checkinTime || undefined,
                checkoutTime: attData.checkoutTime || undefined,
              });
            } catch (err) {
              updatedUsers.push(processedUser);
            }
          }
        }

        // Update faceBoxes with final processed user data (checkinTime etc.)
        const finalBoxes = faceBoxes.map(box => {
          if (box.user) {
            const updated = updatedUsers.find(u => u.id === box.user!.id);
            return { ...box, user: updated || box.user };
          }
          return box;
        });

        if (updatedUsers.length > 0) {
          setDisplayUsers(updatedUsers);
          setDisplayUser(updatedUsers[0]);
          if (updatedUsers[0].checkinTime) setCheckinTime(updatedUsers[0].checkinTime);
          if (updatedUsers[0].checkoutTime) setCheckoutTime(updatedUsers[0].checkoutTime);
          return { matched: true, users: updatedUsers, confidence: updatedUsers[0].faceConfidence, message: "สแกนผ่าน", faceBoxes: finalBoxes };
        } else {
          const errMsg = detectedSpoof 
            ? "ตรวจพบการใช้อุปกรณ์จำลอง/ภาพถ่าย (Anti-Spoofing)" 
            : "พบใบหน้าแต่ยังไม่ผูกกับข้อมูลโรงเรียนหรือความมั่นใจต่ำ";
          return { matched: false, message: errMsg, faceBoxes: finalBoxes };
        }

      } catch (err: any) {
        console.error("FindFace API error:", err);
        return { matched: false, message: "เกิดข้อผิดพลาดในการเชื่อมต่อเซิร์ฟเวอร์สแกนใบหน้า" };
      }
    } else {
      // สำหรับ Webhook / API ทั่วไป
      try {
        const formData = new FormData();
        formData.append("image", image, `face-${Date.now()}.jpg`);
        formData.append("schoolId", schoolId);

        const response = await fetch(resolveFaceFetchUrl(faceScanEndpoint), {
          method: "POST",
          body: formData,
          headers: {
            "X-School-Id": schoolId,
          },
        });

        if (!response.ok) {
          return { matched: false, message: "ระบบประมวลผลใบหน้าไม่ตอบสนอง" };
        }

        payload = await response.json();
      } catch (err: any) {
        console.error("Webhook scan error:", err);
        return { matched: false, message: "เกิดข้อผิดพลาดในการส่งข้อมูลใบหน้า" };
      }
    }

    const matched = payload.matched !== false && (payload.userId || payload.docId || payload.displayId || payload.studentId || payload.teacherId || payload.description || payload.findfaceCardId || payload.cardId || payload.card_id || payload.name);
    if (!matched) {
      return { matched: false, message: payload.message || "รอใบหน้า..." };
    }

    const confidence = Number(payload.confidence ?? payload.similarity ?? payload.score ?? payload.looks_like_confidence ?? 0);
    if (confidence && confidence < effectiveFaceScanThreshold) {
      return {
        matched: false,
        confidence,
        message: `ความมั่นใจต่ำ ${Math.round(confidence * 100)}%`,
      };
    }

    const user = await resolveFaceMatchedUser(payload);
    if (!user) {
      return { matched: false, confidence, message: "พบใบหน้าแต่ยังไม่ผูกกับข้อมูลโรงเรียน" };
    }
    console.log("[FaceScan] Matched Firestore user:", {
      userId: user.id,
      displayId: user.displayId,
      name: user.name,
      type: user.type,
      confidence,
    });

    const lastScanAt = faceScanCooldownRef.current.get(user.id) || 0;
    let checkinTimeStr: string | undefined;
    let checkoutTimeStr: string | undefined;
    let uploadedFaceScanImageUrl = user.faceScanImageUrl;

    if (Date.now() - lastScanAt < 30_000) {
      setDisplayUser(user);
      setDisplayUsers([user]);
      try {
        const attData = await fetchAttendance(user);
        checkinTimeStr = attData.checkinTime || undefined;
        checkoutTimeStr = attData.checkoutTime || undefined;
        setCheckinTime(checkinTimeStr || null);
        setCheckoutTime(checkoutTimeStr || null);
      } catch (err) {}
    } else {
      faceScanCooldownRef.current.set(user.id, Date.now());
      setError(null);
      const faceScanImageUrl = await uploadFaceScanSnapshot(image, user, confidence || user.faceConfidence);
      uploadedFaceScanImageUrl = faceScanImageUrl || user.faceScanImageUrl;
      await processAttendanceForUser({
        ...user,
        scanMethod: "สแกนใบหน้า",
        faceConfidence: confidence || user.faceConfidence,
        faceScanImageUrl: uploadedFaceScanImageUrl,
      }, isIpCamera);
      try {
        const attData = await fetchAttendance(user);
        checkinTimeStr = attData.checkinTime || undefined;
        checkoutTimeStr = attData.checkoutTime || undefined;
      } catch (err) {}
    }

    const returnUser: FoundUser = {
      ...user,
      checkinTime: checkinTimeStr,
      checkoutTime: checkoutTimeStr,
      faceConfidence: confidence,
      faceScanImageUrl: uploadedFaceScanImageUrl,
    };

    setDisplayUsers([returnUser]);
    setDisplayUser(returnUser);

    return { matched: true, user: returnUser, users: [returnUser], confidence, message: "สแกนผ่าน" };
  }, [calendarEvents, faceScanEndpoint, faceScanThreshold, schoolId, schoolSettings, resolveFaceMatchedUser, processAttendanceForUser, uploadFaceScanSnapshot]);

  return (
    <div className="min-h-screen bg-[#edf0f4] dark:bg-[#1e1f21] flex flex-col transition-colors duration-300">
      <main className="flex-grow flex items-center justify-center p-6">
        <div className="w-full max-w-screen-2xl">
          <div className="grid grid-cols-1 xl:grid-cols-12 gap-10">
            <div className="xl:col-span-8 flex flex-col gap-10 h-full">
              <div className="bg-[#fafbfc] dark:bg-[#2a2b2f] rounded-3xl p-10 text-gray-900 dark:text-white shadow-sm dark:shadow-none border border-gray-200/50 dark:border-none h-full flex flex-col">
                <div className="flex items-center gap-5 mb-8">
                  {schoolSettings?.logoUrl && (
                    <img 
                      src={schoolSettings.logoUrl} 
                      alt="School Logo" 
                      className="w-16 h-16 object-cover rounded-full bg-white p-1 shadow-sm border border-gray-200 dark:border-white/10"
                    />
                  )}
                  <div className="flex flex-col">
                    <h1 className="text-4xl font-extrabold text-gray-900 dark:text-white">
                      ระบบลงเวลา{schoolName ? ` | ${schoolName}` : ""}
                    </h1>
                    {schoolSettings?.affiliation && (
                      <p className="text-lg text-gray-900 dark:text-white font-bold mt-1">
                        สังกัด: {schoolSettings.affiliation}
                      </p>
                    )}
                  </div>
                </div>
                <HolidayBanner
                  calendarEvents={calendarEvents}
                  getTodayString={getTodayString}
                />

                <div className="flex-1 flex">
                  <div className="grid grid-cols-1 lg:grid-cols-5 gap-10 flex-1">
                    {isFaceScanModeEnabled ? (
                      <FaceScanPanel
                        enabled={isFaceScanModeEnabled}
                        endpointConfigured={!!faceScanEndpoint}
                        displayUser={displayUser}
                        displayUsers={displayUsers}
                        checkinTime={checkinTime}
                        checkoutTime={checkoutTime}
                        onIdentifyFrame={handleIdentifyFaceFrame}
                        className="lg:col-span-5"
                        currentTime={currentTime}
                        isHoliday={isHoliday}
                        studentLateTime={studentLateTime}
                        studentCheckoutTime={studentCheckoutTime}
                        teacherLateTime={teacherLateTime}
                        teacherCheckoutTime={teacherCheckoutTime}
                        canScanStudents={canScanStudents}
                        canScanTeachers={canScanStudents && canScanTeachers ? false : canScanTeachers}
                        schoolSettings={schoolSettings}
                        currentUserId={(currentUser as any)?.uid || (currentUser as any)?.id || ""}
                      />
                    ) : (
                      <>
                        <UserInfoPanel
                          displayUser={displayUser}
                          checkinTime={checkinTime}
                          checkoutTime={checkoutTime}
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
                          hideInput={isFaceScanModeEnabled}
                          className="lg:col-span-3"
                        />
                      </>
                    )}
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

      {/* ส่วนควบคุมแบบพับเก็บได้ด้านขวา (Collapsible Right Panel) */}
      {createPortal(
        <div 
          className={`fixed z-[9999] flex items-start transition-transform duration-300 ${
            isThemePanelOpen ? 'translate-x-0' : 'translate-x-[256px]'
          }`}
          style={{ right: 0, top: 'calc(22% + 5px)' }}
        >
          {/* ปุ่มดึง/พับเก็บรูปทรงแบบในภาพตัวอย่าง */}
          <button
            onClick={() => setIsThemePanelOpen(!isThemePanelOpen)}
            className={`bg-white dark:bg-[#2a2b2f] border border-r-0 border-gray-200 dark:border-gray-700 text-gray-500 hover:text-indigo-600 dark:text-gray-300 dark:hover:text-indigo-400 p-2.5 shadow-lg transition-all duration-300 ${
              isThemePanelOpen 
                ? 'rounded-l-xl' 
                : 'rounded-l-xl hover:pl-4'
            }`}
            style={{ marginRight: '-1px' }}
            title={isThemePanelOpen ? "ซ่อนเมนูตั้งค่า" : "แสดงเมนูตั้งค่า"}
          >
            {isThemePanelOpen ? (
              <ChevronsRight size={18} className="animate-pulse" />
            ) : (
              <div className="flex flex-col items-center gap-1">
                <ChevronsLeft size={18} />
                {isDarkMode ? (
                  <Moon size={14} className="text-yellow-400" />
                ) : (
                  <Sun size={14} className="text-amber-500" />
                )}
              </div>
            )}
          </button>

          {/* ตัวพาเนลควบคุมการแสดงผล (Collapsible Drawer Panel) */}
          <div
            className="h-auto w-64 bg-white/95 dark:bg-[#2a2b2f]/95 backdrop-blur-md border border-r-0 border-gray-200 dark:border-gray-700 rounded-l-2xl shadow-2xl p-5 flex flex-col gap-5"
            style={{
              maxHeight: '300px'
            }}
          >
            <div className="flex items-center gap-2 border-b border-gray-100 dark:border-gray-700 pb-3">
              <Settings size={16} className="text-indigo-600 dark:text-indigo-400 animate-spin" style={{ animationDuration: '6s' }} />
              <h4 className="text-sm font-bold text-gray-800 dark:text-gray-200">ตั้งค่าการแสดงผล</h4>
            </div>

            {/* สวิตช์สลับโหมด มืด/สว่าง */}
            <div className="flex flex-col gap-2">
              <span className="text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider">โหมดสีหน้าจอ</span>
              <button
                onClick={toggleTheme}
                className="w-full flex items-center justify-between p-3 rounded-xl bg-gray-50 dark:bg-[#1e1f21] hover:bg-gray-100 dark:hover:bg-[#151618] border border-gray-100 dark:border-gray-800 transition-all duration-200 group"
              >
                <div className="flex items-center gap-3">
                  {isDarkMode ? (
                    <div className="p-2 bg-yellow-400/10 text-yellow-400 rounded-lg group-hover:scale-110 transition-transform">
                      <Moon size={16} />
                    </div>
                  ) : (
                    <div className="p-2 bg-amber-500/10 text-amber-500 rounded-lg group-hover:scale-110 transition-transform">
                      <Sun size={16} />
                    </div>
                  )}
                  <span className="text-xs font-bold text-gray-700 dark:text-gray-200">
                    {isDarkMode ? "โหมดกลางคืน (มืด)" : "โหมดกลางวัน (สว่าง)"}
                  </span>
                </div>
                
                {/* แอนิเมชันปุ่ม Toggle pill */}
                <div className={`w-10 h-6 flex items-center rounded-full p-1 transition-colors duration-300 ${
                  isDarkMode ? 'bg-indigo-600 justify-end' : 'bg-gray-300 justify-start'
                }`}>
                  <div className="bg-white w-4 h-4 rounded-full shadow-md transform transition-transform duration-300"></div>
                </div>
              </button>
            </div>

            {/* ปุ่มออกจากระบบ (สำหรับสิทธิ์สแกนที่ไม่มี Sidebar ทั่วไป) */}
            <div className="flex flex-col gap-2 mt-auto border-t border-gray-100 dark:border-gray-700 pt-3">
              <LogoutButton className="w-full flex items-center justify-center gap-2.5 px-4 py-3 bg-rose-50 dark:bg-rose-500/10 text-rose-600 dark:text-rose-400 rounded-xl hover:bg-rose-100 dark:hover:bg-rose-500/20 active:scale-95 transition-all text-xs font-bold shadow-sm" />
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
};

export default CheckinOutPage;
