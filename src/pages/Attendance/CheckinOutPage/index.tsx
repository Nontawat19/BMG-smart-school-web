import React, { useState, useEffect, useRef, useCallback } from "react";
import { useSelector } from "react-redux";
import { useLocation } from "react-router-dom";
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
  runTransaction,
  limit,
} from "firebase/firestore";
import { getDownloadURL, ref, uploadBytes } from "firebase/storage";
import { getFunctions, httpsCallable } from "firebase/functions";
import Swal from "sweetalert2";
import { RootState } from "../../../store";
import { isNonOfficialHoliday } from "../../../utils/calendarUtils";
import { FoundUser } from "./types";
import { sendLineAttendanceNotification, sendTeacherLineAttendanceNotification } from "./AttendanceLineNotify";
import { deg2rad, getDistanceFromLatLonInM, isPointInPolygon, getStatusKey } from "./utils";
import HolidayBanner from "./HolidayBanner";
import AutoFitHeading from "./AutoFitHeading";
import UserInfoPanel from "./UserInfoPanel";
import SearchPanel from "./SearchPanel";
import FaceScanPanel from "./FaceScanPanel";
import LatestUsers from "./LatestUsers";
import AttendanceSpeech, { getPreferredThaiVoice } from "./AttendanceSpeech";
import {
  calculateAttendanceStatus,
  GateRecord,
  FlagRecord,
  LeaveRecord
} from "../../../utils/attendanceLogic";
import { ROLES } from "../../../constants/roles";
import { STAFF_ACCESS } from "../../../constants/permissions";
import { calculateAttendanceBehaviorScoreChange } from "../../../utils/behaviorScoreUtils";
import { isAttendanceEntryOnly } from "../../../utils/attendanceRoles";
import { isStudyingStudent } from "../../../utils/studentStatusUtils";
import { isActiveTeacherSummaryStatus } from "../../../utils/ownerStatsUtils";

// Imports for collapsible right settings panel
import { createPortal } from "react-dom";
import { Settings, Sun, Moon, ChevronsLeft, ChevronsRight, ScanFace, ShieldCheck, Radio } from "lucide-react";
import LogoutButton from "@/components/LogoutButton";
import { useTheme } from "@/ThemeContext";
import MainLayout from "@/layouts/MainLayout";
import { useEffectiveSchoolId } from "@/hooks/useEffectiveSchool";

const LOCAL_FACE_BRIDGE_URL = "http://127.0.0.1:18188/findface";
const FACE_SCAN_DEBUG = import.meta.env.VITE_FACE_SCAN_DEBUG === "true";
const USER_CACHE_TTL_MS = 6 * 60 * 60 * 1000;

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

const parseUserCache = (raw: string | null) => {
  if (!raw) return { records: [], cachedAt: 0 };

  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) return { records: parsed, cachedAt: 0 };
    if (Array.isArray(parsed?.records)) {
      return {
        records: parsed.records,
        cachedAt: Number(parsed.cachedAt || 0),
      };
    }
  } catch (e) {
    console.error("Error parsing cached users:", e);
  }

  return { records: [], cachedAt: 0 };
};

const expandStudentIdCandidates = (value?: string | number | null) => {
  const raw = String(value ?? "").trim();
  if (!raw) return [];

  const candidates = [raw];
  if (/^\d{1,5}$/.test(raw)) {
    candidates.push(raw.padStart(5, "0"));
    candidates.push(String(Number(raw)));
  }

  return uniq(candidates);
};

const normalizeRoleList = (role: unknown) => {
  const roles = Array.isArray(role) ? role : role ? [role] : [];
  return roles
    .filter((item): item is string => typeof item === "string")
    .map((item) => {
      const lowerRole = item.toLowerCase();
      if (lowerRole === "admin") return ROLES.SCHOOL_ADMIN;
      if (lowerRole === "academic") return ROLES.ACADEMIC_ADMIN;
      return lowerRole;
    });
};

const isSameHomeroom = (teacherData: any, studentGrade?: string, studentRoom?: string) => {
  const student = splitHomeroom(studentGrade, studentRoom);
  const teacher = splitHomeroom(teacherData?.homeroomGrade, teacherData?.homeroomRoom);

  if (!student.grade || !teacher.grade || student.grade !== teacher.grade) return false;
  if (student.room && teacher.room && student.room !== teacher.room) return false;
  if (student.room && !teacher.room && teacher.gradeWithRoom !== student.gradeWithRoom) return false;
  return true;
};

const isSameLineRegistrationContext = (context: any, studentGrade?: string, studentRoom?: string, lineConfig?: any) => {
  // ไม่มี context = ลงทะเบียนแบบเก่าหรือไม่ได้เก็บข้อมูลห้อง → ส่งแจ้งเตือนทุกชั้น
  if (!context) return true;
  // context มีอยู่แต่ไม่ระบุห้องเรียน → ถือว่าผ่าน (สมัครแบบไม่ระบุชั้น)
  if (!context.classLevel && !context.room) return true;

  const student = splitHomeroom(studentGrade, studentRoom);
  const registered = splitHomeroom(context.classLevel, context.room);

  if (!student.grade || !registered.grade || student.grade !== registered.grade) return false;
  if (student.room && registered.room && student.room !== registered.room) return false;
  if (lineConfig?.liffId && context.liffId && String(lineConfig.liffId).trim() !== String(context.liffId).trim()) return false;
  return true;
};

const getEligibleParentLineRecipients = (user: FoundUser, lineConfig?: any) => {
  const parentIds = uniq(user.parentLineUserIds || []);
  const contexts = user.parentLineRegistrationContexts || {};

  return parentIds.filter((lineUserId) =>
    isSameLineRegistrationContext(contexts[lineUserId], user.grade, user.room, lineConfig)
  );
};

const SELF_CHECKIN_DEVICE_LOCK_PREFIX = "selfCheckinDeviceLock_";

const CheckinOutPage: React.FC = () => {
  const { user: currentUser } = useSelector((state: RootState) => state.auth);
  const schoolId = useEffectiveSchoolId();
  const location = useLocation();
  // โหมดลงเวลาด้วยตนเอง (เข้าจากเมนู "ลงเวลา" ของครู/แอดมิน): บังคับใช้รหัสเท่านั้น ไม่มีสแกนใบหน้า
  // และจำกัด 1 คนต่ออุปกรณ์ต่อวัน (คนเดิมยังเข้า-ออกได้ตามปกติ)
  const isSelfServiceMode = new URLSearchParams(location.search).get("mode") === "self";
  const { isDarkMode, toggleTheme } = useTheme();
  const [isThemePanelOpen, setIsThemePanelOpen] = useState(false);
  // ใช้ layout แบบกระชับ (compact) เมื่อจอเป็นสี่เหลี่ยมจัตุรัส/แนวนอนแบบคีออสก์ (aspect ratio)
  // หรือเมื่อจอแคบแบบมือถือ (portrait) ซึ่ง aspect ratio อย่างเดียวตรวจไม่เจอ
  const [isSquareScreen, setIsSquareScreen] = useState(() => {
    if (typeof window === 'undefined') return false;
    return window.innerWidth <= 768 || window.innerWidth / window.innerHeight <= 1.15;
  });
  const [schoolName, setSchoolName] = useState<string | null>(null);
  const [schoolSettings, setSchoolSettings] = useState<any>(null);
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
  // ตัวจุดชนวนให้ effect คำนวณ isHoliday รันซ้ำเมื่อ "วันที่" เปลี่ยน (ข้ามเที่ยงคืน)
  // ไม่ใช่แค่ตอน calendarEvents เปลี่ยน — ป้องกัน isHoliday ค้างค่าของเมื่อวานข้ามเข้าสู่วันหยุด/วันเสาร์-อาทิตย์
  const [todayTick, setTodayTick] = useState(getTodayString());

  const [timeOffset, setTimeOffset] = useState(() => {
    const stored = localStorage.getItem("timeSyncOffset");
    return stored ? Number(JSON.parse(stored).offset) || 0 : 0;
  });
  const [timeSyncStatus, setTimeSyncStatus] = useState<"synced" | "stale" | "unverified">(
    "unverified"
  );
  const lastTimeSyncAtRef = useRef<number | null>(
    (() => {
      const stored = localStorage.getItem("timeSyncOffset");
      return stored ? Number(JSON.parse(stored).syncedAt) || null : null;
    })()
  );
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
  const activeSearchKeysRef = useRef<Set<string>>(new Set());
  const activeAttendanceKeysRef = useRef<Set<string>>(new Set());
  const faceScanFailSpeechAtRef = useRef<number>(0);
  const attendanceFetchCacheRef = useRef<Map<string, { data: any; cachedAt: number }>>(new Map());
  const adminTeacherLineIdsRef = useRef<string[]>([]);
  // Consecutive accumulator: สะสมการจับคู่ที่ confidence ต่ำกว่า threshold เล็กน้อย
  // ถ้า cardId เดิมปรากฏซ้ำ ≥3 ครั้งติดกันในช่วง 3 วินาที → ถือว่าผ่าน
  const lowConfAccRef = useRef<Map<string, { count: number; totalConf: number; lastSeenAt: number }>>(new Map());

  // Use the imported getTodayString from dateUtils

  // Memory Cache for the current session to avoid redundant Firestore reads
  const sessionUserCache = useRef<Map<string, FoundUser>>(new Map());

  useEffect(() => {
    const storedUsers = localStorage.getItem("latestUsers");
    if (storedUsers) {
      setLatestUsers(JSON.parse(storedUsers).slice(0, 8));
    }
  }, []);

  // ล้าง localStorage attendance ของวันเก่าทุกครั้งที่เปิดหน้า
  useEffect(() => {
    const today = getTodayString();
    const keysToRemove: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.startsWith("att_") && !key.includes(`_${today}_`)) {
        keysToRemove.push(key);
      }
    }
    keysToRemove.forEach((key) => localStorage.removeItem(key));
  }, []);

  // Midnight watchdog: ตรวจทุก 1 นาที ถ้าวันเปลี่ยนให้ล้าง cache เก่าทันที
  // รองรับ kiosk ที่เปิดหน้าทิ้งไว้ข้ามคืน 24/7
  useEffect(() => {
    let lastKnownDate = getTodayString();

    const midnightCheck = () => {
      const today = getTodayString();
      if (today === lastKnownDate) return;
      lastKnownDate = today;

      // ล้าง att_* keys ของวันก่อนหน้าออกจาก localStorage
      const keysToRemove: string[] = [];
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && key.startsWith("att_") && !key.includes(`_${today}_`)) {
          keysToRemove.push(key);
        }
      }
      keysToRemove.forEach((key) => localStorage.removeItem(key));

      // ล้าง in-memory cache (attendance fetch + face scan cooldowns)
      attendanceFetchCacheRef.current.clear();
      faceScanCooldownRef.current.clear();

      // แจ้ง effect คำนวณ isHoliday ให้รันใหม่ทันทีที่วันเปลี่ยน (ไม่ใช่รอ calendarEvents เปลี่ยน)
      setTodayTick(today);

      console.log(`[Cleanup] วันใหม่ ${today} — ล้าง att_* ${keysToRemove.length} keys, memory cache, cooldowns`);
    };

    const timer = setInterval(midnightCheck, 60_000);
    return () => clearInterval(timer);
  }, []);

  // Pre-load and cache all students to avoid Firestore reads during scanning
  useEffect(() => {
    if (!schoolId) return;

    const loadAndCacheStudents = async () => {
      try {
        const cacheKey = `students_cache_${schoolId}`;
        const cachedData = localStorage.getItem(cacheKey);
        const cached = parseUserCache(cachedData);
        if (cached.records.length > 0) {
          cached.records.forEach((studentDoc: any) => {
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
          if (FACE_SCAN_DEBUG) console.log(`Loaded ${cached.records.length} students from localStorage cache.`);
        }

        if (cached.cachedAt && Date.now() - cached.cachedAt < USER_CACHE_TTL_MS) return;

        // Refresh stale or legacy cache so newly imported/updated students can scan.
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

        localStorage.setItem(cacheKey, JSON.stringify({ cachedAt: Date.now(), records: toCache }));
        if (FACE_SCAN_DEBUG) console.log(`Cached ${toCache.length} students successfully!`);
      } catch (err) {
        console.error("Error caching students:", err);
      }
    };

    loadAndCacheStudents();
  }, [schoolId]);

  // โหลด LINE user IDs ของผู้บริหาร/แอดมิน เพื่อส่งแจ้งเตือนการลงเวลาครู
  useEffect(() => {
    if (!schoolId) return;

    const loadAdminTeacherLineIds = async () => {
      try {
        const teacherRef = collection(firestore, "school-settings", schoolId, "teachers");
        const [arrayRoleSnap, stringRoleSnap] = await Promise.all([
          getDocs(query(teacherRef, where("role", "array-contains-any", ["super_admin", "school_admin"]), limit(20))),
          getDocs(query(teacherRef, where("role", "in", ["super_admin", "school_admin"]), limit(20))),
        ]);
        const lineIds = new Set<string>();
        [...arrayRoleSnap.docs, ...stringRoleSnap.docs].forEach((d) => {
          const id = d.data().lineUserId?.trim();
          if (id) lineIds.add(id);
        });
        adminTeacherLineIdsRef.current = Array.from(lineIds);
      } catch (err) {
        console.error("Error loading admin teacher LINE IDs:", err);
      }
    };

    loadAdminTeacherLineIds();
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
      setCanScanStudents(false);
      setCanScanTeachers(false);

      if (currentUser) {
        const roles = normalizeRoleList((currentUser as any).role);

        // โหมดลงเวลาด้วยตนเอง (mode=self): ไม่ว่า role จะเป็นบุคลากรตำแหน่งใด (ครู/ผู้บริหาร/ฝ่ายงาน ฯลฯ)
        // ก็ลงเวลาได้เฉพาะบัญชีตัวเองเท่านั้น (บังคับที่ performSearch อีกชั้น) — ไม่ให้สิทธิ์คีออสก์เต็มรูปแบบ
        // แม้แอดมินโรงเรียนก็ตาม เพื่อไม่ให้ bypass การเช็ค IP/ตำแหน่ง และไม่ให้ค้นหา/ลงเวลาแทนคนอื่นได้
        // ต้องเปิดสวิตช์ allowTeacherSelfCheckin ที่หน้า /owner/school-info ก่อน (super admin เป็นคนกำหนดรายโรงเรียน)
        // ฟีเจอร์นี้ถึงจะใช้งานได้ — ถ้าปิดอยู่ ถือว่าโรงเรียนไม่เปิดใช้ ไม่ว่า role จะเป็นอะไรก็ตาม
        if (isSelfServiceMode) {
          const isEligibleForSelfCheckin = roles.some((r) => STAFF_ACCESS.includes(r as typeof STAFF_ACCESS[number]));
          const isSelfCheckinEnabledForSchool = schoolSettings?.allowTeacherSelfCheckin === true;
          if (isEligibleForSelfCheckin && isSelfCheckinEnabledForSchool) {
            setCanScanTeachers(true);
          }
          return;
        }

        const isFullAdmin = roles.includes(ROLES.SCHOOL_ADMIN) || roles.includes(ROLES.SUPER_ADMIN);
        const isStudentAdmin = roles.includes(ROLES.STUDENT_ATTENDANCE) || roles.includes(ROLES.SCHOOL_ATTENDANCE);
        const isTeacherAdmin = roles.includes(ROLES.TEACHER_ATTENDANCE) || roles.includes(ROLES.SCHOOL_ATTENDANCE) || roles.includes(ROLES.STUDENT_ATTENDANCE);

        if (isFullAdmin || isStudentAdmin || isTeacherAdmin) {
          setCanScanStudents(isFullAdmin || isStudentAdmin);
          setCanScanTeachers(isFullAdmin || isTeacherAdmin);
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
              const teacherRoles = normalizeRoleList(data.role);
              
              const isFullAdminT = teacherRoles.includes(ROLES.SCHOOL_ADMIN) || teacherRoles.includes(ROLES.SUPER_ADMIN);
              const isStudentAdminT = teacherRoles.includes(ROLES.STUDENT_ATTENDANCE) || teacherRoles.includes(ROLES.SCHOOL_ATTENDANCE);
              const isTeacherAdminT = teacherRoles.includes(ROLES.TEACHER_ATTENDANCE) || teacherRoles.includes(ROLES.SCHOOL_ATTENDANCE) || teacherRoles.includes(ROLES.STUDENT_ATTENDANCE);

              if (isFullAdminT || isStudentAdminT || isTeacherAdminT) {
                setCanScanStudents(isFullAdminT || isStudentAdminT);
                setCanScanTeachers(isFullAdminT || isTeacherAdminT);
              }
            }
          } catch (error) {
            console.error("Error checking user role:", error);
          }
        }
      }
    };
    checkUserRole();
  }, [currentUser, schoolId, isSelfServiceMode, schoolSettings?.allowTeacherSelfCheckin]);

  useEffect(() => {
    setSearchedUser(null);
    setError(null);
    setCheckinTime(null);
    setCheckoutTime(null);
  }, [searchId]);

  useEffect(() => {
    let cancelled = false;
    let timeoutId: ReturnType<typeof setTimeout> | null = null;

    const SYNC_INTERVAL_MS = 3 * 60 * 1000; // resync every 3 min once healthy
    const RETRY_INTERVAL_MS = 15 * 1000; // retry quickly while failing
    const STALE_AFTER_MS = 30 * 60 * 1000; // offset older than this can no longer be trusted

    const scheduleNext = (delay: number) => {
      if (cancelled) return;
      timeoutId = setTimeout(syncTime, delay);
    };

    // เวลาแท้จริงมาจาก Cloud Function `getServerTime` เท่านั้น (นาฬิกาเซิร์ฟเวอร์ Google, ไม่ใช่นาฬิกาเครื่อง kiosk)
    // ถ้า sync ล้มเหลว จะไม่ fallback ไปใช้นาฬิกาเครื่องดิบเด็ดขาด — ใช้ offset ล่าสุดที่เคยยืนยันได้ต่อไปแทน
    const syncTime = async () => {
      try {
        const t0 = Date.now();
        const getServerTime = httpsCallable(getFunctions(undefined, "us-central1"), "getServerTime");
        const result = await getServerTime();
        const t2 = Date.now();
        const serverNow = Number((result.data as { now?: number })?.now);
        if (!Number.isFinite(serverNow)) throw new Error("Invalid getServerTime response");

        // NTP-style midpoint estimate เพื่อชดเชย network latency ของ round trip
        const offset = serverNow - (t0 + t2) / 2;
        const syncedAt = Date.now();

        if (cancelled) return;
        lastTimeSyncAtRef.current = syncedAt;
        setTimeOffset(offset);
        setTimeSyncStatus("synced");
        localStorage.setItem("timeSyncOffset", JSON.stringify({ offset, syncedAt }));
        console.log("⏰ Time synced with getServerTime. Offset:", offset);
        scheduleNext(SYNC_INTERVAL_MS);
      } catch (error) {
        console.warn("⚠️ Time sync failed, keeping last verified offset.", error);
        if (cancelled) return;
        const staleFor = lastTimeSyncAtRef.current ? Date.now() - lastTimeSyncAtRef.current : Infinity;
        setTimeSyncStatus(staleFor < STALE_AFTER_MS ? "stale" : "unverified");
        scheduleNext(RETRY_INTERVAL_MS);
      }
    };

    syncTime();

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

    // Resync ทันทีเมื่อ kiosk tab กลับมา focus (เผื่อเครื่อง sleep/สลับแท็บทิ้งไว้นาน)
    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        syncTime();
      }
    };
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      cancelled = true;
      if (timeoutId) clearTimeout(timeoutId);
      clearInterval(ipInterval);
      window.removeEventListener("online", handleOnline);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, []);

  useEffect(() => {
    const updateAspect = () => {
      setIsSquareScreen(window.innerWidth <= 768 || window.innerWidth / window.innerHeight <= 1.15);
    };
    window.addEventListener('resize', updateAspect);
    return () => window.removeEventListener('resize', updateAspect);
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

      if (!selectedVoiceURI && thaiVoices.length > 0) {
        const preferredVoice = getPreferredThaiVoice(voices);
        if (preferredVoice) {
          setSelectedVoiceURI(preferredVoice.voiceURI);
          localStorage.setItem("selectedVoiceURI", preferredVoice.voiceURI);
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
  }, [calendarEvents, todayTick]);

  // แอดมินโรงเรียนก็เป็นครูคนหนึ่งในโรงเรียน: ตอน "ลงเวลาให้ตัวเอง" ต้องผ่านการเช็ค GPS/IP
  // เหมือนครูทั่วไป ไม่ bypass พิเศษ — แต่ตอนสแกน/ค้นหาให้ "คนอื่น" ที่หน้าคีออสก์ ยัง bypass ตามเดิม
  const isSelfCheckinTarget = useCallback((targetUserId?: string) => {
    if (!targetUserId) return false;
    const myOwnId = (currentUser as any)?.uid || (currentUser as any)?.id;
    return Boolean(myOwnId) && targetUserId === myOwnId;
  }, [currentUser]);

  const getSecurityBypass = useCallback((targetUserId?: string) => {
    const roles = normalizeRoleList((currentUser as any)?.role);
    const isSuperAdminRole = roles.includes(ROLES.SUPER_ADMIN);
    const isAttendanceClerkRole =
      roles.includes(ROLES.STUDENT_ATTENDANCE) ||
      roles.includes(ROLES.TEACHER_ATTENDANCE) ||
      roles.includes(ROLES.SCHOOL_ATTENDANCE);
    const isSchoolAdminRole = roles.includes(ROLES.SCHOOL_ADMIN);
    const isSelf = isSelfCheckinTarget(targetUserId);

    return isSuperAdminRole || isAttendanceClerkRole || (isSchoolAdminRole && !isSelf);
  }, [currentUser, isSelfCheckinTarget]);

  // โหมดลงเวลาด้วยตนเอง: 1 คนต่ออุปกรณ์ต่อวัน (คนเดิมลงเวลาเข้า/ออกซ้ำได้ตามปกติ)
  // คนละคนบนอุปกรณ์เดียวกันในวันเดียวกัน จะถูกกันไว้ ต้องให้แต่ละคนใช้อุปกรณ์ของตัวเอง
  const checkSelfCheckinDeviceLock = useCallback((targetUserId: string): { valid: boolean; reason?: string } => {
    if (!isSelfServiceMode || !schoolId) return { valid: true };

    const key = `${SELF_CHECKIN_DEVICE_LOCK_PREFIX}${schoolId}_${getTodayString()}`;
    const lockedUserId = localStorage.getItem(key);

    if (lockedUserId && lockedUserId !== targetUserId) {
      return {
        valid: false,
        reason: "อุปกรณ์นี้ถูกใช้ลงเวลาแทนบุคคลอื่นไปแล้ววันนี้ กรุณาใช้อุปกรณ์ส่วนตัวของคุณเองในการลงเวลา",
      };
    }

    return { valid: true };
  }, [isSelfServiceMode, schoolId]);

  const lockSelfCheckinDevice = useCallback((targetUserId: string) => {
    if (!isSelfServiceMode || !schoolId) return;
    const key = `${SELF_CHECKIN_DEVICE_LOCK_PREFIX}${schoolId}_${getTodayString()}`;
    localStorage.setItem(key, targetUserId);
  }, [isSelfServiceMode, schoolId]);

  const checkIpSecurity = async (
    currentUserId: string,
    currentIp: string | undefined
  ): Promise<{ valid: boolean; reason?: string; ip?: string }> => {
    // Speed Optimization: Bypass for Attendance / Admin (ยกเว้นแอดมินลงเวลาให้ตัวเอง)
    if (getSecurityBypass(currentUserId)) {
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
    currentIp: string | undefined,
    targetUserId?: string
  ): Promise<{ valid: boolean; reason?: string }> => {
    // Speed Optimization: Bypass for Attendance / Admin (ยกเว้นแอดมินลงเวลาให้ตัวเอง)
    if (getSecurityBypass(targetUserId))
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
        parentLineRegistrationContexts: d.parentLineRegistrationContexts || {},
        lineRegistrationReviewRequired: Boolean(d.lineRegistrationReviewRequired),
        behaviorScore: d.behaviorScore ?? 100,
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
      advisorRole: d.advisorRole || "",
      isHomeroomTeacher: Boolean(d.isHomeroomTeacher || d.homeroomGrade),
      role: d.role,
      rfid: d.rfid || "",
      scanMethod,
      faceConfidence,
      findfaceCardId: findfaceCardId || d.findfaceCardId || d.faceExternalId || "",
    };
  }, []);

  // Pre-load and keep teachers in sync so latest check-in cards follow profile updates immediately.
  useEffect(() => {
    if (!schoolId) return;

    let isMounted = true;

    const syncTeacherRecord = (teacherDoc: { id: string; data: any }) => {
      const user = buildFoundUser("teacher", teacherDoc.id, teacherDoc.data, "สแกนใบหน้า");
      sessionUserCache.current.set(user.id, user);
      if (user.displayId) sessionUserCache.current.set(user.displayId, user);
      if (user.rfid) sessionUserCache.current.set(user.rfid, user);
      if (user.findfaceCardId) sessionUserCache.current.set(String(user.findfaceCardId), user);
      if (user.name) {
        sessionUserCache.current.set(user.name, user);
        sessionUserCache.current.set(user.name.replace(/\s+/g, ""), user);
      }

      setLatestUsers((prev) => {
        let changed = false;
        const next = prev.map((existingUser) => {
          if (existingUser.type !== "teacher" || existingUser.id !== user.id) return existingUser;
          changed = true;
          return {
            ...existingUser,
            ...user,
            latestActionTime: existingUser.latestActionTime,
            status: existingUser.status,
            lastAction: existingUser.lastAction,
            checkinTime: existingUser.checkinTime,
            checkoutTime: existingUser.checkoutTime,
          };
        });
        if (changed) {
          try {
            localStorage.setItem("latestUsers", JSON.stringify(next));
          } catch {
            // localStorage quota exceeded — state still updates
          }
        }
        return changed ? next : prev;
      });
    };

    const loadAndCacheTeachers = async () => {
      try {
        const cacheKey = `teachers_cache_${schoolId}`;
        const cachedData = localStorage.getItem(cacheKey);
        const cached = parseUserCache(cachedData);
        if (cached.records.length > 0) {
          cached.records.forEach((teacherDoc: any) => {
            syncTeacherRecord(teacherDoc);
          });
          if (FACE_SCAN_DEBUG) console.log(`Loaded ${cached.records.length} teachers from localStorage cache.`);
        }
      } catch (err) {
        console.error("Error caching teachers:", err);
      }
    };

    loadAndCacheTeachers();

    const teachersRef = collection(firestore, "school-settings", schoolId, "teachers");
    const unsubscribe = onSnapshot(
      teachersRef,
      (teachersSnap) => {
        if (!isMounted) return;

        const toCache: any[] = [];
        teachersSnap.forEach((docSnap) => {
          const data = docSnap.data();
          const teacherDoc = { id: docSnap.id, data };
          toCache.push(teacherDoc);
          syncTeacherRecord(teacherDoc);
        });

        try {
          localStorage.setItem(`teachers_cache_${schoolId}`, JSON.stringify({ cachedAt: Date.now(), records: toCache }));
        } catch {
          // localStorage quota exceeded — session cache still updates
        }

        if (FACE_SCAN_DEBUG) console.log(`Synced ${toCache.length} teachers from Firestore.`);
      },
      (err) => {
        console.error("Error syncing teachers:", err);
      }
    );

    return () => {
      isMounted = false;
      unsubscribe();
    };
  }, [buildFoundUser, schoolId]);

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
      ? attendanceSnap.data().checkinTime?.toDate().toLocaleTimeString("th-TH", { timeZone: "Asia/Bangkok" })
      : null;
    const checkout = attendanceSnap.exists()
      ? attendanceSnap.data().checkoutTime?.toDate().toLocaleTimeString("th-TH", { timeZone: "Asia/Bangkok" })
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

  const ATTENDANCE_FETCH_CACHE_TTL_MS = 12_000;
  const getAttLsKey = useCallback((user: FoundUser) =>
    `att_${schoolId}_${getTodayString()}_${user.type}_${user.id}`, [schoolId]);

  const fetchAttendanceCached = useCallback(async (user: FoundUser) => {
    const memKey = `${user.type}:${user.id}:${getTodayString()}`;

    // 1. ตรวจ in-memory cache (12 วินาที)
    const memEntry = attendanceFetchCacheRef.current.get(memKey);
    if (memEntry && Date.now() - memEntry.cachedAt < ATTENDANCE_FETCH_CACHE_TTL_MS) {
      return memEntry.data;
    }

    // 2. ตรวจ localStorage (เก็บไว้ตลอดวัน ไม่ต้องถาม Firebase ซ้ำหลังรีเฟรช)
    try {
      const lsRaw = localStorage.getItem(getAttLsKey(user));
      if (lsRaw) {
        const lsData = JSON.parse(lsRaw);
        attendanceFetchCacheRef.current.set(memKey, { data: lsData, cachedAt: Date.now() });
        return lsData;
      }
    } catch { /* ignore */ }

    // 3. Firebase (fallback สุดท้าย)
    const data = await fetchAttendance(user);
    attendanceFetchCacheRef.current.set(memKey, { data, cachedAt: Date.now() });
    try { localStorage.setItem(getAttLsKey(user), JSON.stringify(data)); } catch { /* quota */ }
    return data;
  }, [fetchAttendance, getAttLsKey]);

  const uploadFaceScanSnapshot = useCallback(async (
    image: Blob,
    user: FoundUser,
    confidence?: number
  ): Promise<string | null> => {
    // Default to saving snapshots unless the school explicitly disables it.
    if (schoolSettings?.faceScanConfig?.saveSnapshots === false) return null;
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
  }, [schoolId, schoolSettings]);

  const sendLineNotification = useCallback(async (
    user: FoundUser,
    status: string,
    time: string,
    actionType: string
  ) => {
    if (user.type !== "student") return;
    console.log(`[LINE] sendLineNotification called — actionType: ${actionType}, student: ${user.displayId}, hasSchoolSettings: ${Boolean(schoolSettings?.lineOASettings?.school)}`);
    try {
      // ดึงข้อมูลสรุปภาคเรียนล่าสุดและ behaviorScore ปัจจุบันจาก Firestore พร้อมกัน
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
      const studentDocRef = doc(firestore, "school-settings", schoolId!, "students", user.id);
      const [semesterSnap, studentSnap] = await Promise.all([
        getDoc(semesterRef),
        getDoc(studentDocRef),
      ]);

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

      // อ่าน behaviorScore ล่าสุดตรงจาก Firestore (เหมือนที่หน้า Profile แสดงผล)
      const liveBehaviorScore = studentSnap.exists()
        ? (studentSnap.data().behaviorScore ?? user.behaviorScore ?? 100)
        : (user.behaviorScore ?? 100);
      // สร้าง User object ใหม่พร้อมข้อมูลสถิติภาคเรียนและคะแนนพฤติกรรมล่าสุด
      const userWithSemesterStats: FoundUser = {
        ...user,
        attendanceStats: semesterStats,
        behaviorScore: liveBehaviorScore,
      };

      let finalConfig: any = null;
      const teacherRecipientUserIds: string[] = [];

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

        // Fallback: ถ้าหาครูด้วย isHomeroomTeacher=true ไม่เจอ
        // ให้ค้นหาด้วย homeroomGrade อย่างเดียว (รองรับโรงเรียนที่ยังไม่ได้ set field นี้)
        if (homeroomTeachers.size === 0) {
          const fallbackSnaps = await Promise.all(
            gradeCandidates.map((gradeCandidate) =>
              getDocs(query(teacherRef, where("homeroomGrade", "==", gradeCandidate), limit(10)))
            )
          );
          fallbackSnaps.forEach((snap) => {
            snap.docs.forEach((teacherDoc) => {
              if (homeroomTeachers.has(teacherDoc.id)) return;
              const teacherData = teacherDoc.data();
              if (isSameHomeroom(teacherData, user.grade, user.room)) {
                homeroomTeachers.set(teacherDoc.id, teacherData);
              }
            });
          });
        }

        homeroomTeachers.forEach((teacherData) => {
          // ดึง lineUserId ของครูประจำชั้นทุกคนในห้องมาใส่ร่วมกับกลุ่มรับข้อความแจ้งเตือน
          if (teacherData.lineUserId) {
            teacherRecipientUserIds.push(teacherData.lineUserId);
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
            parentRecipientCount: (user.parentLineUserIds || []).length,
            teacherRecipientCount: teacherRecipientUserIds.length,
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

      console.log(`[LINE] finalConfig resolved: ${finalConfig ? "YES (token:" + Boolean(finalConfig.lineChannelAccessToken) + ")" : "NULL — notification will be skipped"}`);
      if (finalConfig) {
        const parentRecipientUserIds = getEligibleParentLineRecipients(user, finalConfig);

        // Safety net: ถ้ากรองแล้วไม่เหลือผู้ปกครองเลย แต่มี parentLineUserIds อยู่จริง
        // → ส่งให้ parentLineUserIds ทั้งหมดตรงๆ โดยไม่กรอง context (รองรับผู้ปกครองลูกหลายคน)
        const rawParentIds = uniq((user.parentLineUserIds || []).filter(Boolean));
        const finalParentIds = parentRecipientUserIds.length > 0
          ? parentRecipientUserIds
          : rawParentIds;

        const recipientUserIds = uniq([...finalParentIds, ...teacherRecipientUserIds]);

        if (parentRecipientUserIds.length === 0 && rawParentIds.length > 0) {
          console.warn("[LINE] Context filter removed all parents — falling back to raw parentLineUserIds:", {
            studentId: user.displayId,
            classLevel: user.grade,
            room: user.room,
            rawParentCount: rawParentIds.length,
          });
        }

        console.log("[LINE] Sending attendance notification:", {
          actionType,
          studentId: user.displayId,
          name: user.name,
          scanMethod: user.scanMethod,
          status,
          recipientCount: recipientUserIds.filter(Boolean).length,
          parentCount: parentRecipientUserIds.length,
          teacherCount: teacherRecipientUserIds.length,
          hasToken: Boolean(finalConfig.lineChannelAccessToken),
        });
        await sendLineAttendanceNotification(
          userWithSemesterStats,
          status,
          time,
          finalConfig,
          recipientUserIds,
          actionType
        );
      } else {
        console.warn("[LINE] No active LINE config found for attendance notification:", {
          studentId: user.displayId,
          name: user.name,
          scanMethod: user.scanMethod,
          parentRecipientCount: (user.parentLineUserIds || []).filter(Boolean).length,
          teacherRecipientCount: teacherRecipientUserIds.filter(Boolean).length,
        });
      }
    } catch (error) {
      console.error("LINE Notify Error:", error);
    }
  }, [schoolId, currentAcademicYear, schoolSettings]);

  const sendTeacherLineNotification = useCallback(async (
    user: FoundUser,
    status: string,
    time: string,
    actionType: string
  ) => {
    if (user.type !== "teacher") return;
    try {
      const config = schoolSettings?.lineOASettings?.school;
      if (!config?.lineChannelAccessToken || config?.enableNotification === false) return;
      const recipientUserIds = adminTeacherLineIdsRef.current;
      if (recipientUserIds.length === 0) return;
      await sendTeacherLineAttendanceNotification(user, status, time, config, recipientUserIds, actionType);
    } catch (error) {
      console.error("[LINE] Teacher notification error:", error);
    }
  }, [schoolSettings]);

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
      timeZone: "Asia/Bangkok",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
    const timeForCompare = now.toLocaleTimeString("en-GB", {
      timeZone: "Asia/Bangkok",
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

    let oldStatus = existingAttendance?.status || null;

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
        ...(user.scanMethod === "สแกนใบหน้า"
          ? {
              metadata: {
                ...(attendanceData.metadata || {}),
                faceConfidence: user.faceConfidence ?? null,
                findfaceCardId: user.findfaceCardId || null,
              }
            }
          : attendanceData.metadata !== undefined
          ? { metadata: attendanceData.metadata }
          : {}),
      };

      setCheckoutTime(timeStr);
    }

    const transactionResult = await runTransaction(firestore, async (transaction) => {
      const freshSnap = await transaction.get(attendanceRef);
      const freshData = freshSnap.exists() ? freshSnap.data() : null;
      const hasFreshCheckin = Boolean(freshData?.checkinTime);
      const hasFreshCheckout = Boolean(freshData?.checkoutTime);

      if ((type === "checkin" && hasFreshCheckin) || (type === "checkout" && hasFreshCheckout)) {
        return {
          saved: false,
          reason: type === "checkin" ? "already_checked_in" : "already_checked_out",
          data: freshData,
        };
      }

      if (type === "checkin_and_checkout") {
        if (hasFreshCheckout) {
          return { saved: false, reason: "already_checked_out", data: freshData };
        }

        if (hasFreshCheckin) {
          delete attendanceData.checkinTime;
          delete attendanceData.checkinIp;
          delete attendanceData.checkinDevice;
          status = timeForCompare < checkoutTimeConfig ? "กลับก่อน" : freshData?.status || status;
          attendanceData.status = status;
        }
      }

      // "checkout" เดี่ยวๆ (ไม่ใช่ checkin_and_checkout): ตอน build attendanceData ด้านบนใช้
      // existingAttendance.status (prop จากตอนค้นหา/สแกนครั้งก่อน) ซึ่งอาจไม่ทันสมัยแล้วถ้ามีจุดอื่น
      // (เช่น เช็คแถว, แอดมินแก้ไข) เปลี่ยนสถานะไปแล้วระหว่างที่ค้างอยู่ในมือ ต้อง recompute จาก freshData
      // ในทรานแซกชันนี้เสมอ ไม่งั้นจะเขียนทับสถานะที่ถูกต้องล่าสุดด้วยค่าเก่า
      if (type === "checkout" && freshData) {
        const freshEffectiveStatus = freshData.status || status;
        status = timeForCompare < checkoutTimeConfig ? "กลับก่อน" : freshEffectiveStatus;
        attendanceData.status = status;
      }

      oldStatus = freshData?.status || null;
      transaction.set(attendanceRef, attendanceData, { merge: true });
      return { saved: true, reason: null, data: freshData };
    });

    if (!transactionResult.saved) {
      console.info("[Attendance] Skipped by transaction guard:", {
        userId: user.id,
        displayId: user.displayId,
        name: user.name,
        action: type,
        reason: transactionResult.reason,
      });
      if (transactionResult.reason === "already_checked_in" && transactionResult.data?.checkinTime) {
        setCheckinTime(transactionResult.data.checkinTime.toDate().toLocaleTimeString("th-TH", { timeZone: "Asia/Bangkok" }));
      }
      if (transactionResult.reason === "already_checked_out" && transactionResult.data?.checkoutTime) {
        setCheckoutTime(transactionResult.data.checkoutTime.toDate().toLocaleTimeString("th-TH", { timeZone: "Asia/Bangkok" }));
      }
      return;
    }

    if (user.type === "teacher") {
      lockSelfCheckinDevice(user.id);
    }

    const batch = writeBatch(firestore);
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
      // Read the live score fresh inside a transaction so a concurrent write
      // (another gate scanner, manual adjustment, flag ceremony, etc.) can never
      // be silently overwritten by this check-in/out update.
      const behaviorScoreResult = await runTransaction(firestore, async (transaction) => {
        const snap = await transaction.get(studentRef);
        const freshScore = snap.exists() ? Number(snap.data().behaviorScore ?? user.behaviorScore ?? 100) : (user.behaviorScore ?? 100);
        const result = calculateAttendanceBehaviorScoreChange({
          currentScore: freshScore,
          oldStatus,
          newStatus: status,
          config: schoolSettings?.behaviorScoreConfig,
        });
        if (result) {
          transaction.set(studentRef, result.update, { merge: true });
        }
        return result;
      });
      if (behaviorScoreResult) {
        behaviorScoreAfterUpdate = behaviorScoreResult.summary.nextScore;
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

    await batch.commit();

    // Update latest users list — runs after commit regardless of subsequent errors
    const newUserAction: FoundUser = {
      ...user,
      behaviorScore: behaviorScoreAfterUpdate,
      latestActionTime: timeStr,
      status: status,
      lastAction: type,
    };
    setLatestUsers((prev) => {
      const updatedList = [
        newUserAction,
        ...prev.filter((u) => u.id !== user.id),
      ].slice(0, 8);
      try {
        localStorage.setItem("latestUsers", JSON.stringify(updatedList));
      } catch {
        // localStorage quota exceeded — state still updates
      }
      return updatedList;
    });
    console.log("[Attendance] Saved attendance successfully:", {
      userId: user.id,
      displayId: user.displayId,
      name: user.name,
      status,
      scanType: attendanceData.scanType,
    });
    setSpeechTrigger({ user, type, timestamp: Date.now(), status: 'success' });

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
      console.log(`[LINE] Triggering ${type} notification for`, user.displayId, user.name, "status:", status);
      await sendLineNotification({ ...user, behaviorScore: behaviorScoreAfterUpdate }, status, timeStr, type);
    } else if (user.type === "teacher") {
      console.log(`[LINE] Triggering ${type} notification for teacher`, user.displayId, user.name, "status:", status);
      await sendTeacherLineNotification(user, status, timeStr, type);
    }
  }, [schoolId, timeOffset, studentLateTime, teacherLateTime, studentCheckoutTime, teacherCheckoutTime, schoolSettings, currentAcademicYear, sendLineNotification, sendTeacherLineNotification, lockSelfCheckinDevice]);

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
      const titles = ["พระสามเณร", "พระมหา", "พระครู", "พระใบฎีกา", "หลวงพ่อ", "พระอาจารย์", "พระ", "สามเณร", "นาย", "นางสาว", "นาง", "เด็กชาย", "ด.ช.", "เด็กหญิง", "ด.ญ.", "ดร.", "ครู"];
      for (const title of titles) {
        if (clean.startsWith(title)) {
          clean = clean.substring(title.length).trim();
          break;
        }
      }
      return clean;
    };

    const cacheResolvedUser = (user: FoundUser | null) => {
      if (!user) return user;
      sessionUserCache.current.set(user.id, user);
      if (user.displayId) sessionUserCache.current.set(user.displayId, user);
      if (user.rfid) sessionUserCache.current.set(user.rfid, user);
      if (cardId) sessionUserCache.current.set(String(cardId), user);
      if (user.findfaceCardId) sessionUserCache.current.set(String(user.findfaceCardId), user);
      if (user.name) {
        sessionUserCache.current.set(user.name, user);
        sessionUserCache.current.set(user.name.replace(/\s+/g, ""), user);
        sessionUserCache.current.set(cleanName(user.name), user);
        sessionUserCache.current.set(cleanName(user.name).replace(/\s+/g, ""), user);
      }
      return user;
    };

    const tryDoc = async (collectionName: "students" | "teachers", docId: string) => {
      const snap = await getDoc(doc(firestore, "school-settings", schoolId, collectionName, docId));
      if (!snap.exists()) return null;
      return cacheResolvedUser(
        buildFoundUser(collectionName === "students" ? "student" : "teacher", snap.id, snap.data(), "สแกนใบหน้า", confidence, cardId)
      );
    };

    const findFirstByField = async (
      collectionName: "students" | "teachers",
      field: string,
      values: string[]
    ) => {
      for (const value of values) {
        const snap = await getDocs(
          query(
            collection(firestore, "school-settings", schoolId, collectionName),
            where(field, "==", value)
          )
        );
        if (!snap.empty) {
          const validDoc = snap.docs.find(doc => {
            const data = doc.data();
            if (collectionName === "students") {
              return isStudyingStudent(data);
            } else {
              return isActiveTeacherSummaryStatus(data.status || "อยู่");
            }
          });
          if (validDoc) {
            return cacheResolvedUser(
              buildFoundUser(collectionName === "students" ? "student" : "teacher", validDoc.id, validDoc.data(), "สแกนใบหน้า", confidence, cardId)
            );
          }
        }
      }
      return null;
    };

    // 1. ตรวจสอบใน Local In-Memory Cache ก่อนเพื่อประหยัดการอ่าน Firebase
    const lookupKeys = uniqueKeys(userId, ...displayCandidates, ...cardCandidates);
    console.log("[FaceScan] 🔍 ค้นหาใน sessionUserCache ด้วย keys:", lookupKeys);
    for (const lookupKey of lookupKeys) {
      if (sessionUserCache.current.has(lookupKey)) {
        const cached = sessionUserCache.current.get(lookupKey)!;
        console.log("[FaceScan] ✅ พบใน cache:", cached.name, "(key:", lookupKey, ")");
        return { ...cached, faceConfidence: confidence, findfaceCardId: cardId ? String(cardId) : cached.findfaceCardId };
      }
    }
    console.warn("[FaceScan] ❌ ไม่พบใน cache — cache size:", sessionUserCache.current.size, "| cardId:", cardId, "| displayId:", displayId);

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

    if (userId && (type === "student" || type === "students") && canScanStudents) {
      const user = await tryDoc("students", userId);
      if (user) return user;
    }
    if (userId && (type === "teacher" || type === "teachers") && canScanTeachers) {
      const user = await tryDoc("teachers", userId);
      if (user) return user;
    }
    if (userId && !type) {
      if (canScanStudents) {
        const user = await tryDoc("students", userId);
        if (user) return user;
      }
      if (canScanTeachers) {
        const user = await tryDoc("teachers", userId);
        if (user) return user;
      }
    }

    const studentSearches: Array<Promise<FoundUser | null>> = [];
    const teacherSearches: Array<Promise<FoundUser | null>> = [];

    if (canScanStudents) {
      studentSearches.push(
        findFirstByField("students", "studentId", displayCandidates.flatMap(expandStudentIdCandidates)),
        findFirstByField("students", "findfaceCardId", cardCandidates),
        findFirstByField("students", "faceExternalId", cardCandidates)
      );
    }

    if (canScanTeachers) {
      teacherSearches.push(
        findFirstByField("teachers", "teacherId", displayCandidates.flatMap(expandStudentIdCandidates)),
        findFirstByField("teachers", "idCardNumber", displayCandidates),
        findFirstByField("teachers", "findfaceCardId", cardCandidates),
        findFirstByField("teachers", "faceExternalId", cardCandidates)
      );
    }

    const fieldMatches = await Promise.all([...studentSearches, ...teacherSearches]);
    const fieldMatch = fieldMatches.find(Boolean);
    if (fieldMatch) return fieldMatch;

    if (nameToMatch) {
      const cleanPayloadName = cleanName(nameToMatch);
      const parts = cleanPayloadName.split(/\s+/).filter(Boolean);
      const nameSearches: Array<Promise<FoundUser | null>> = [];

      if (parts.length >= 2) {
        const firstName = parts[0];
        const lastName = parts.slice(1).join(" ");
        if (canScanStudents) {
          nameSearches.push(
            findFirstByField("students", "name", [nameToMatch, cleanPayloadName]),
            (async () => {
              const snap = await getDocs(
                query(
                  collection(firestore, "school-settings", schoolId, "students"),
                  where("firstName", "==", firstName),
                  where("lastName", "==", lastName),
                  limit(1)
                )
              );
              if (snap.empty) return null;
              const docSnap = snap.docs[0];
              return cacheResolvedUser(buildFoundUser("student", docSnap.id, docSnap.data(), "สแกนใบหน้า", confidence, cardId));
            })()
          );
        }
        if (canScanTeachers) {
          nameSearches.push(
            findFirstByField("teachers", "name", [nameToMatch, cleanPayloadName]),
            (async () => {
              const snap = await getDocs(
                query(
                  collection(firestore, "school-settings", schoolId, "teachers"),
                  where("firstName", "==", firstName),
                  where("lastName", "==", lastName),
                  limit(1)
                )
              );
              if (snap.empty) return null;
              const docSnap = snap.docs[0];
              return cacheResolvedUser(buildFoundUser("teacher", docSnap.id, docSnap.data(), "สแกนใบหน้า", confidence, cardId));
            })()
          );
        }
      } else {
        if (canScanStudents) nameSearches.push(findFirstByField("students", "name", [nameToMatch, cleanPayloadName]));
        if (canScanTeachers) nameSearches.push(findFirstByField("teachers", "name", [nameToMatch, cleanPayloadName]));
      }

      const nameMatches = await Promise.all(nameSearches);
      const nameMatch = nameMatches.find(Boolean);
      if (nameMatch) return nameMatch;
    }

    console.warn("[FaceScan] ❌ ค้นหาใน Firebase แล้วก็ไม่เจอ:", {
      canScanTeachers,
      canScanStudents,
      cardCandidates,
      displayCandidates,
      name: payload.name || payload.cardName || payload.comment || payload.description,
      hint: canScanTeachers
        ? "ตรวจสอบว่า teacher document มี field findfaceCardId หรือ idCardNumber ที่ตรงกับ cardCandidates ไหม"
        : "canScanTeachers=false — ผู้ใช้ที่ login อาจไม่มี role SCHOOL_ADMIN / TEACHER_ATTENDANCE",
    });

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

    const attendanceKey = `${user.type}:${user.id}:${getTodayString()}`;
    if (activeAttendanceKeysRef.current.has(attendanceKey)) {
      console.info("[Attendance] Skipped: attendance request already in progress:", {
        displayId: user.displayId,
        name: user.name,
        scanMethod: user.scanMethod,
      });
      return;
    }
    activeAttendanceKeysRef.current.add(attendanceKey);

    try {
      const currentIp = currentCachedIp;
      const [ipSecurity, validation, attData] = await Promise.all([
      isIpCameraScan
        ? Promise.resolve<{ valid: boolean; reason?: string; ip?: string }>({ valid: true, ip: currentIp })
        : checkIpSecurity(user.id, currentIp),
      isIpCameraScan
        ? Promise.resolve<{ valid: boolean; reason?: string }>({ valid: true })
        : validateLocationAndIp(currentIp, user.id),
      fetchAttendance(user),
      ]);

    const deviceLock = isIpCameraScan
      ? { valid: true }
      : checkSelfCheckinDeviceLock(user.id);

    if (!ipSecurity.valid || !validation.valid || !deviceLock.valid) {
      console.warn("[Attendance] Blocked by IP/location/device validation:", {
        userId: user.id,
        displayId: user.displayId,
        name: user.name,
        ipSecurity,
        validation,
        deviceLock,
      });
      setError(ipSecurity.reason || validation.reason || deviceLock.reason || "ไม่สามารถลงเวลาได้");
      setSpeechTrigger(prev => ({ ...prev, timestamp: Date.now(), status: 'error' }));
      return;
    }

    const isFaceScan = user.scanMethod === "สแกนใบหน้า";

    const now = new Date(Date.now() + timeOffset);
    const timeForCompare = now.toLocaleTimeString("en-GB", {
      timeZone: "Asia/Bangkok",
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
        if (isFaceScan) {
          setSpeechTrigger({ user, type: null, timestamp: Date.now(), status: 'success' });
          // Update latestUsers so the checkout appears in the panel even if processed earlier
          setLatestUsers(prev => {
            const existing = prev.find(u => u.id === user.id);
            const alreadyCheckout = existing?.lastAction === 'checkout' || existing?.lastAction === 'checkin_and_checkout';
            if (alreadyCheckout) return prev;
            const entry: FoundUser = {
              ...(existing || user),
              latestActionTime: attData.checkoutTime!,
              status: attData.status || existing?.status || user.status,
              lastAction: 'checkout',
            };
            const next = [entry, ...prev.filter(u => u.id !== user.id)].slice(0, 8);
            try { localStorage.setItem("latestUsers", JSON.stringify(next)); } catch { /* quota */ }
            return next;
          });
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
    } finally {
      activeAttendanceKeysRef.current.delete(attendanceKey);
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

    if (timeSyncStatus === "unverified") {
      setSearchId("");
      Swal.fire({
        icon: "warning",
        title: "ยังไม่สามารถยืนยันเวลาที่ถูกต้องได้",
        text: "กรุณารอสักครู่ ระบบกำลังเชื่อมต่อเซิร์ฟเวอร์เวลา แล้วลองสแกนใหม่อีกครั้ง",
        toast: true,
        position: "top-end",
        showConfirmButton: false,
        timer: 3000,
      });
      return;
    }

    const idCandidates = expandStudentIdCandidates(idToSearch);
    const rfidCandidates = uniq([idToSearch]);

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

    if (activeSearchKeysRef.current.has(idToSearch)) return;
    activeSearchKeysRef.current.add(idToSearch);
    setIsLoading(true);
    setError(null);
    setSearchedUser(null);

    try {
      let user: FoundUser | null = null;

      // ⚡ STEP 1: Memory Cache lookup
      const cacheKey = uniq([...idCandidates, ...rfidCandidates]).find((candidate) =>
        sessionUserCache.current.has(candidate)
      );
      if (cacheKey) {
        user = sessionUserCache.current.get(cacheKey) || null;
        if (user) {
          user = {
            ...user,
            scanMethod: (user.rfid && rfidCandidates.includes(cacheKey)) ? "สแกนบัตร" : "พิมพ์รหัสเอง"
          };
        }
      } else {
        // 🔍 STEP 2: Parallel Search with Permission check
        const findFirstByField = async (
          collectionName: "students" | "teachers",
          field: string,
          values: string[]
        ) => {
          for (const value of values) {
            const snap = await getDocs(
              query(
                collection(firestore, "school-settings", schoolId, collectionName),
                where(field, "==", value)
              )
            );
            
            if (!snap.empty) {
              const validDoc = snap.docs.find(doc => {
                const data = doc.data();
                if (collectionName === "students") {
                  return isStudyingStudent(data);
                } else {
                  return isActiveTeacherSummaryStatus(data.status || "อยู่");
                }
              });
              
              if (validDoc) {
                return { docs: [validDoc], empty: false };
              }
            }
          }
          return null;
        };

        const searchPromises = [];
        if (canScanStudents) {
          searchPromises.push(
            findFirstByField("students", "studentId", idCandidates),
            findFirstByField("students", "rfid", rfidCandidates)
          );
        } else {
          // Push empty results if no permission
          searchPromises.push(Promise.resolve(null), Promise.resolve(null));
        }

        if (canScanTeachers) {
          searchPromises.push(
            findFirstByField("teachers", "teacherId", idCandidates),
            findFirstByField("teachers", "rfid", rfidCandidates)
          );
        } else {
          searchPromises.push(Promise.resolve(null), Promise.resolve(null));
        }

        const [studentSnap, rfidSnap, teacherSnap, teacherRfidSnap] = await Promise.all(searchPromises) as any[];

        if (canScanStudents && studentSnap && !studentSnap.empty) {
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
            parentLineRegistrationContexts: d.parentLineRegistrationContexts || {},
            lineRegistrationReviewRequired: Boolean(d.lineRegistrationReviewRequired),
            behaviorScore: d.behaviorScore ?? 100,
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
        } else if (canScanTeachers && teacherSnap && !teacherSnap.empty) {
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
            advisorRole: d.advisorRole || "",
            isHomeroomTeacher: Boolean(d.isHomeroomTeacher || d.homeroomGrade),
            role: d.role,
            rfid: d.rfid || "",
            scanMethod: "พิมพ์รหัสเอง",
          };
        } else if (canScanStudents && rfidSnap && !rfidSnap.empty) {
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
            parentLineRegistrationContexts: d.parentLineRegistrationContexts || {},
            lineRegistrationReviewRequired: Boolean(d.lineRegistrationReviewRequired),
            behaviorScore: d.behaviorScore ?? 100,
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
            advisorRole: d.advisorRole || "",
            isHomeroomTeacher: Boolean(d.isHomeroomTeacher || d.homeroomGrade),
            role: d.role,
            rfid: d.rfid || "",
            scanMethod: "สแกนบัตร",
          };
        }

        if (user) {
          sessionUserCache.current.set(idToSearch, user);
          if (user.displayId) sessionUserCache.current.set(user.displayId, user);
          if (user.rfid) sessionUserCache.current.set(user.rfid, user);
        }
      }

      if (user) {
        // โหมดลงเวลาด้วยตนเอง: ลงเวลาได้เฉพาะบัญชีของตัวเองเท่านั้น ห้ามค้นหา/ลงเวลาแทนคนอื่น
        if (isSelfServiceMode) {
          const myOwnId = (currentUser as any)?.uid || (currentUser as any)?.id;
          if (user.type !== "teacher" || !myOwnId || user.id !== myOwnId) {
            setError("คุณสามารถลงเวลาให้ตัวเองได้เท่านั้น กรุณากรอกรหัสของคุณเอง");
            setSpeechTrigger(prev => ({ ...prev, timestamp: Date.now(), status: 'error' }));
            return;
          }
        }
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
      activeSearchKeysRef.current.delete(idToSearch);
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
      let count = 0;

      // เดิมฟังก์ชันนี้อ่านสถานะทุกคนก่อน แล้วค่อย commit batch เดียวรวมท้ายสุด (อาจกินเวลาหลายวินาที/นาที
      // สำหรับโรงเรียนที่มีคนเยอะ) ทำให้มีช่วงเวลาที่การสแกนบัตรจริงระหว่างนั้นอาจถูกเขียนทับกลับเป็น "ขาด"
      // ตอน commit ท้ายสุด (TOCTOU) และถ้าฟังก์ชันนี้ถูกเรียกซ้ำ (เปิดหลายแท็บ/เครื่องคีออสก์พร้อมกันตอนถึงเวลา
      // ตัดรอบพอดี) ก็จะบวกตัวนับ "ขาด" ซ้ำสองไม่มีอะไรกันเลย ย้ายมาเป็นทรานแซกชันต่อคน ให้ทั้งการเช็คว่า
      // "ยังไม่มีบันทึกวันนี้" กับการเขียนสถานะ "ขาด" + อัปเดตตัวนับ เกิดขึ้นแบบ atomic จุดเดียวกัน — ถ้ามีคน
      // สแกนจริงหรือมีการรันฟังก์ชันนี้ซ้ำแทรกเข้ามา ทรานแซกชันจะอ่านเห็นเอกสารล่าสุดเสมอและข้ามคนนั้นไปเอง
      // (ไม่มีทางเขียนทับหรือบวกซ้ำ) ตรงกับพฤติกรรม idempotent ที่ต้องการ
      for (const uDoc of snap.docs) {
        const userData = uDoc.data();
        if (targetType === "teacher" && isAttendanceEntryOnly(userData.role)) continue;
        // สำคัญ: ต้องข้ามคนที่ไม่ได้ "กำลังศึกษาอยู่"/"อยู่" (ย้าย/ลาออก/จบ/แขวนลอย ฯลฯ) ก่อนเสมอ
        // ไม่งั้น sweep นี้จะไปสร้างสถานะ "ขาด" ให้คนที่ไม่ได้เรียน/ทำงานที่นี่แล้วด้วย ทำให้ยอดขาด
        // และยอดรวมเพี้ยนเกินจำนวนคนที่ยังศึกษา/ปฏิบัติงานอยู่จริง (บั๊กที่เจอวันนี้)
        if (targetType === "student" && !isStudyingStudent(userData)) continue;
        if (targetType === "teacher" && !isActiveTeacherSummaryStatus(userData.status || "อยู่")) continue;

        const attRef = doc(
          firestore,
          "school-settings",
          schoolId,
          collName,
          uDoc.id,
          "attendance",
          todayStr
        );
        const studentRef = targetType === "student"
          ? doc(firestore, "school-settings", schoolId, "students", uDoc.id)
          : null;

        const wasMarkedAbsent = await runTransaction(firestore, async (transaction) => {
          const freshAttSnap = await transaction.get(attRef);
          if (freshAttSnap.exists()) return false; // มีบันทึกแล้ว (สแกนจริงหรือรอบก่อนหน้าประมวลผลไปแล้ว) ข้าม

          transaction.set(attRef, {
            status: "ขาด",
            date: todayStr,
            schoolId,
            userType: targetType,
            updatedAt: serverTimestamp(),
          });

          if (studentRef) {
            const studentSnap = await transaction.get(studentRef);
            const freshScore = studentSnap.exists() ? Number(studentSnap.data().behaviorScore ?? userData.behaviorScore ?? 100) : (userData.behaviorScore ?? 100);
            const result = calculateAttendanceBehaviorScoreChange({
              currentScore: freshScore,
              oldStatus: null,
              newStatus: "ขาด",
              config: schoolSettings?.behaviorScoreConfig,
            });
            if (result) {
              transaction.set(studentRef, result.update, { merge: true });
            }
          }

          updatePeriodSummaries(
            firestore,
            transaction,
            schoolId,
            uDoc.id,
            collName,
            todayStr,
            null,
            "ขาด",
            targetType === "student" ? (userData.classLevel || userData.grade || userData.classroom || "").toString().trim() || "ไม่ระบุชั้น" : undefined,
            currentAcademicYear
          );

          return true;
        });

        if (wasMarkedAbsent) count++;
      }

      console.log(`[processAbsencesByType:${targetType}] Marked ${count} as absent (idempotent, transaction-per-user).`);
    } catch (err) {
      console.error(`Absence processing error (${targetType}):`, err);
    }
  };

  const processNoCheckout = async () => {
    if (!schoolId) return;
    const todayStr = getTodayString();
    try {
      const snap = await getDocs(
        collection(firestore, "school-settings", schoolId, "students")
      );
      let count = 0;

      // เหมือนกับ processAbsencesByType: เดิมอ่านสถานะทุกคนก่อนแล้ว batch เดียวรวมท้ายสุด ทำให้ถ้านักเรียน
      // สแกนบัตรออกจริง (checkoutTime ถูกเขียน) แทรกเข้ามาระหว่างรอบนี้ ตอน commit ท้ายสุดจะเขียนทับสถานะ
      // เป็น "ไม่ลงเวลาออก" ทั้งที่จริงๆ เขาสแกนออกแล้ว — ย้ายมาเป็นทรานแซกชันต่อคน อ่าน-ตรวจเงื่อนไข-เขียน
      // แบบ atomic ให้เห็นข้อมูลล่าสุดเสมอ และรันซ้ำกี่ครั้งก็ไม่บวก/ลบตัวนับซ้ำ (idempotent)
      for (const uDoc of snap.docs) {
        const userData = uDoc.data();
        const attRef = doc(firestore, "school-settings", schoolId, "students", uDoc.id, "attendance", todayStr);
        const studentRef = doc(firestore, "school-settings", schoolId, "students", uDoc.id);
        const summaryRef = doc(firestore, "school-settings", schoolId, "students", "Attendance", "dyasummary", todayStr);

        const wasFlagged = await runTransaction(firestore, async (transaction) => {
          const freshAttSnap = await transaction.get(attRef);
          if (!freshAttSnap.exists()) return false;
          const attData = freshAttSnap.data();

          if (
            !attData.checkinTime ||
            attData.checkoutTime ||
            attData.status === "ลา" ||
            attData.status === "ขาด" ||
            attData.status === "ไม่ลงเวลาออก"
          ) {
            return false;
          }

          const oldStatus = attData.status as string;
          const newStatus = "ไม่ลงเวลาออก";

          transaction.update(attRef, { status: newStatus, remark: "Auto: ไม่ลงเวลาออก" });

          const studentSnap = await transaction.get(studentRef);
          const oldKey = getStatusKey(oldStatus);
          const newKey = getStatusKey(newStatus);
          const statsUpdate: Record<string, any> = {};
          if (oldKey) statsUpdate[`attendanceStats.${oldKey}`] = increment(-1);
          if (newKey) statsUpdate[`attendanceStats.${newKey}`] = increment(1);
          if (Object.keys(statsUpdate).length > 0) transaction.update(studentRef, statsUpdate);

          const freshScore = studentSnap.exists() ? Number(studentSnap.data().behaviorScore ?? userData.behaviorScore ?? 100) : (userData.behaviorScore ?? 100);
          const scoreChange = calculateAttendanceBehaviorScoreChange({
            currentScore: freshScore,
            oldStatus,
            newStatus,
            config: schoolSettings?.behaviorScoreConfig,
          });
          if (scoreChange) {
            transaction.set(studentRef, scoreChange.update, { merge: true });
          }

          const classKey = userData.classLevel?.trim() || "ไม่ระบุชั้น";
          const oldSummaryKey = getStatusKey(oldStatus);
          const newSummaryKey = getStatusKey(newStatus);
          if (oldSummaryKey !== newSummaryKey) {
            const summaryUpdates: Record<string, any> = { updatedAt: serverTimestamp() };
            if (oldSummaryKey) {
              summaryUpdates[oldSummaryKey] = increment(-1);
              summaryUpdates[`classes.${classKey}.${oldSummaryKey}`] = increment(-1);
            }
            if (newSummaryKey) {
              summaryUpdates[newSummaryKey] = increment(1);
              summaryUpdates[`classes.${classKey}.${newSummaryKey}`] = increment(1);
            }
            transaction.set(summaryRef, summaryUpdates, { merge: true });
          }

          updatePeriodSummaries(firestore, transaction, schoolId, uDoc.id, "students", todayStr, oldStatus, newStatus, classKey, currentAcademicYear);
          return true;
        });

        if (wasFlagged) count++;
      }

      console.log(`[processNoCheckout] Flagged ${count} as no-checkout (idempotent, transaction-per-user).`);
    } catch (err) {
      console.error("No-checkout processing error:", err);
    }
  };

  useEffect(() => {
    if (!schoolSettings || !calendarEvents || !isCalendarLoaded || isHoliday)
      return;

    const checkTime = () => {
      const now = new Date(Date.now() + timeOffset);
      const timeStr = now.toLocaleTimeString("en-GB", {
        timeZone: "Asia/Bangkok",
        hour: "2-digit",
        minute: "2-digit",
      });

      if (timeStr === studentCheckinEnd) {
        processAbsencesByType("student");
      }
      if (timeStr === studentCheckoutEnd) {
        processNoCheckout();
      }
    };

    const timer = setInterval(checkTime, 60 * 1000);
    return () => clearInterval(timer);
  }, [schoolSettings, calendarEvents, isCalendarLoaded, isHoliday, timeOffset, studentCheckinEnd, studentCheckoutEnd]);

  const userName = (currentUser as any)?.displayName || "ผู้ดูแลระบบ";
  const currentUserIdForCamera = (currentUser as any)?.uid || (currentUser as any)?.id || "";
  const configuredCameras: any[] = Array.isArray(schoolSettings?.faceScanConfig?.cameras)
    ? schoolSettings.faceScanConfig.cameras
    : [];
  const pairedCamera = currentUserIdForCamera
    ? configuredCameras.find((c: any) => c.pairedUserId === currentUserIdForCamera) ?? null
    : null;
  // โหมดลงเวลาด้วยตนเอง (ครู/แอดมินลงเวลาให้ตัวเองผ่านเมนู "ลงเวลา"): บังคับใช้รหัสเท่านั้น
  // เจ้าหน้าที่ลงเวลา (student_attendance/teacher_attendance/school_attendance) ที่คีออสก์ยังใช้สแกนหน้า/RFID ตามปกติ ไม่กระทบ
  const isFaceScanModeEnabled = isSelfServiceMode
    ? false
    : pairedCamera !== null
      ? pairedCamera.enableFaceScan === true
      : schoolSettings?.useFaceScanMode === true;
  const recommendedVoiceURI = getPreferredThaiVoice(availableVoices)?.voiceURI || null;
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
    const withFailSpeech = <T extends { matched: false }>(result: T) => {
      const now = Date.now();
      if (now - faceScanFailSpeechAtRef.current > 5_000) {
        faceScanFailSpeechAtRef.current = now;
        setSpeechTrigger({ user: null, type: null, timestamp: now, status: 'error' });
      }
      return result;
    };

    if (liveness?.isFake) {
      console.warn("🚨 [FaceScan] Client-side liveness check blocked identification:", liveness.message);
      return withFailSpeech({
        matched: false, 
        message: liveness.message || "ตรวจพบการใช้อุปกรณ์จำลอง/ภาพถ่าย (Anti-Spoofing)" 
      });
    }

    if (!schoolId || !faceScanEndpoint) {
      return { matched: false, message: "ยังไม่ได้ตั้งค่า endpoint" };
    }

    if (timeSyncStatus === "unverified") {
      return { matched: false, message: "ยังไม่สามารถยืนยันเวลาที่ถูกต้องได้ กรุณารอสักครู่" };
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
          return withFailSpeech({ matched: false, message: "ไม่สามารถส่งภาพไปประมวลผลได้" });
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
                console.warn("[FaceScan] ⚠️ FindFace พบใบหน้าแต่ไม่มี card ตรงกันเลย (ยังไม่ได้ลงทะเบียนใบหน้าในระบบ FindFace?):", searchResult);
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
              console.log(`⚙️ [FaceScan] ใบหน้า #${faceIdx}: cardId=${matchedCard.id}, name="${matchedCard.name || "-"}", ความมั่นใจ=${(confidence * 100).toFixed(1)}%, เกณฑ์=${(effectiveFaceScanThreshold * 100).toFixed(1)}%`);

              // Consecutive Accumulator: นักเรียนบางคน confidence ต่ำกว่า threshold เล็กน้อยแต่สม่ำเสมอ
              // ถ้า cardId เดิมปรากฏซ้ำกัน ≥3 ครั้งใน 3 วินาที → ถือว่าผ่านด้วยค่าเฉลี่ย
              const LOW_CONF_FLOOR = Math.max(0, effectiveFaceScanThreshold - 0.12); // ต่ำสุดที่ยอมรับ (threshold - 12%)
              const LOW_CONF_HITS  = 3;   // ต้องเจอซ้ำกี่ครั้ง
              const LOW_CONF_WIN   = 3000; // ภายในกี่ ms

              let effectiveConfidence = confidence;

              if (confidence < effectiveFaceScanThreshold) {
                if (confidence >= LOW_CONF_FLOOR) {
                  const acc   = lowConfAccRef.current;
                  const key   = String(matchedCard.id);
                  const now   = Date.now();
                  const entry = acc.get(key);

                  // เก็บ entry ที่หมดอายุแล้วทิ้งเป็นระยะ (กันแมพโตไม่จำกัดตอนสแกนคนจำนวนมาก)
                  acc.forEach((v, k) => {
                    if (k !== key && now - v.lastSeenAt >= LOW_CONF_WIN) acc.delete(k);
                  });

                  // เก็บสะสมแยกตาม cardId เพื่อไม่ให้คนที่เดินผ่านพร้อมกันหลายคนล้างความคืบหน้าของกันเอง
                  if (entry && now - entry.lastSeenAt < LOW_CONF_WIN) {
                    entry.count++;
                    entry.totalConf += confidence;
                    entry.lastSeenAt = now;
                  } else {
                    acc.set(key, { count: 1, totalConf: confidence, lastSeenAt: now });
                  }

                  const current = acc.get(key)!;
                  if (current.count < LOW_CONF_HITS) {
                    console.warn(`[FaceScan] 🔄 สะสม: ${(confidence * 100).toFixed(1)}% (${current.count}/${LOW_CONF_HITS} ครั้ง, cardId=${key})`);
                    return;
                  }

                  // ผ่านด้วยการสะสม → ใช้ค่าเฉลี่ย
                  effectiveConfidence = current.totalConf / current.count;
                  console.log(`[FaceScan] ✅ สะสมครบ ${LOW_CONF_HITS} ครั้ง → avg ${(effectiveConfidence * 100).toFixed(1)}% ผ่าน (cardId=${key})`);
                  acc.delete(key);
                } else {
                  lowConfAccRef.current.delete(String(matchedCard.id));
                  console.warn(`[FaceScan] ⚠️ ความมั่นใจต่ำเกินไป: ${(confidence * 100).toFixed(1)}% < ${(LOW_CONF_FLOOR * 100).toFixed(1)}% — ข้ามการจับคู่`);
                  return;
                }
              } else {
                // ผ่าน threshold ปกติ → ล้าง accumulator ทิ้ง
                lowConfAccRef.current.delete(String(matchedCard.id));
              }

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
                looks_like_confidence: effectiveConfidence,
                confidence: effectiveConfidence,
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
                faceResults[faceIdx].user = { ...user, faceConfidence: effectiveConfidence };
              } else {
                console.warn("[FaceScan] ⚠️ FindFace จับคู่ card ได้แต่ไม่พบข้อมูลใน Firestore:", {
                  cardId: facePayload.findfaceCardId,
                  cardName: facePayload.cardName,
                  teacherId: facePayload.teacherId,
                  studentId: facePayload.studentId,
                  displayId: facePayload.displayId,
                  confidence: `${(confidence * 100).toFixed(1)}%`,
                  hint: "ตรวจสอบว่า field findfaceCardId ใน Firestore ตรงกับ card ID นี้ไหม",
                });
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
          return withFailSpeech({ matched: false, message: errMsg, faceBoxes });
        }

        // Process attendance for each detected user
        const updatedUsers: FoundUser[] = [];
        for (const user of uniqueUsers) {
          const lastScanAt = faceScanCooldownRef.current.get(user.id) || 0;

          if (Date.now() - lastScanAt < 30_000) {
            try {
              const attData = await fetchAttendanceCached(user);
              updatedUsers.push({
                ...user,
                checkinTime: attData.checkinTime || undefined,
                checkoutTime: attData.checkoutTime || undefined,
              });
              // Sync latestUsers if checkout already happened but panel not updated yet
              if (attData.checkoutTime) {
                setLatestUsers(prev => {
                  const existing = prev.find(u => u.id === user.id);
                  const alreadyCheckout = existing?.lastAction === 'checkout' || existing?.lastAction === 'checkin_and_checkout';
                  if (alreadyCheckout) return prev;
                  const entry: FoundUser = {
                    ...(existing || user),
                    latestActionTime: attData.checkoutTime!,
                    status: attData.status || existing?.status || user.status,
                    lastAction: 'checkout',
                  };
                  const next = [entry, ...prev.filter(u => u.id !== user.id)].slice(0, 8);
                  try { localStorage.setItem("latestUsers", JSON.stringify(next)); } catch { /* quota */ }
                  return next;
                });
              }
            } catch (err) {
              updatedUsers.push(user);
            }
          } else {
            faceScanCooldownRef.current.set(user.id, Date.now());
            attendanceFetchCacheRef.current.delete(`${user.type}:${user.id}:${getTodayString()}`);
            try { localStorage.removeItem(getAttLsKey(user)); } catch { /* ignore */ }
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
              attendanceFetchCacheRef.current.set(`${user.type}:${user.id}:${getTodayString()}`, { data: attData, cachedAt: Date.now() });
              try { localStorage.setItem(getAttLsKey(user), JSON.stringify(attData)); } catch { /* quota */ }
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
          return withFailSpeech({ matched: false, message: errMsg, faceBoxes: finalBoxes });
        }

      } catch (err: any) {
        console.error("FindFace API error:", err);
        return withFailSpeech({ matched: false, message: "เกิดข้อผิดพลาดในการเชื่อมต่อเซิร์ฟเวอร์สแกนใบหน้า" });
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
          return withFailSpeech({ matched: false, message: "ระบบประมวลผลใบหน้าไม่ตอบสนอง" });
        }

        payload = await response.json();
      } catch (err: any) {
        console.error("Webhook scan error:", err);
        return withFailSpeech({ matched: false, message: "เกิดข้อผิดพลาดในการส่งข้อมูลใบหน้า" });
      }
    }

    const matched = payload.matched !== false && (payload.userId || payload.docId || payload.displayId || payload.studentId || payload.teacherId || payload.description || payload.findfaceCardId || payload.cardId || payload.card_id || payload.name);
    if (!matched) {
      return { matched: false, message: payload.message || "รอใบหน้า..." };
    }

    const confidence = Number(payload.confidence ?? payload.similarity ?? payload.score ?? payload.looks_like_confidence ?? 0);
    if (confidence && confidence < effectiveFaceScanThreshold) {
      return withFailSpeech({
        matched: false,
        confidence,
        message: `ความมั่นใจต่ำ ${Math.round(confidence * 100)}%`,
      });
    }

    const user = await resolveFaceMatchedUser(payload);
    if (!user) {
      return withFailSpeech({ matched: false, confidence, message: "พบใบหน้าแต่ยังไม่ผูกกับข้อมูลโรงเรียน" });
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
        const attData = await fetchAttendanceCached(user);
        checkinTimeStr = attData.checkinTime || undefined;
        checkoutTimeStr = attData.checkoutTime || undefined;
        setCheckinTime(checkinTimeStr || null);
        setCheckoutTime(checkoutTimeStr || null);
      } catch (err) {}
    } else {
      faceScanCooldownRef.current.set(user.id, Date.now());
      attendanceFetchCacheRef.current.delete(`${user.type}:${user.id}:${getTodayString()}`);
      try { localStorage.removeItem(getAttLsKey(user)); } catch { /* ignore */ }
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
        attendanceFetchCacheRef.current.set(`${user.type}:${user.id}:${getTodayString()}`, { data: attData, cachedAt: Date.now() });
        try { localStorage.setItem(getAttLsKey(user), JSON.stringify(attData)); } catch { /* quota */ }
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
  }, [calendarEvents, faceScanEndpoint, faceScanThreshold, schoolId, schoolSettings, timeSyncStatus, resolveFaceMatchedUser, processAttendanceForUser, uploadFaceScanSnapshot]);

  // เมื่อ super_admin ตั้งค่าเปิดใช้ระบบนี้แล้วปิดสวิตช์ "เปิดโหมดการลงเวลา" (useFaceScanMode === false)
  // ให้บล็อกหน้าจอลงเวลาทั้งหมด ไม่ว่าจะเป็นสแกนหน้า, RFID, หรือกรอกรหัส
  // ค่า undefined (โรงเรียนยังไม่เคยตั้งค่าฟีเจอร์นี้เลย) ไม่ถือว่าปิด — ให้ลงเวลาได้ตามปกติ
  if (schoolSettings?.useFaceScanMode === false) {
    return (
      <div className="min-h-dvh bg-[#edf0f4] dark:bg-[#1e1f21] flex flex-col items-center justify-center gap-4 p-6 text-center transition-colors duration-300">
        <div className="w-20 h-20 rounded-3xl bg-red-100 dark:bg-red-500/10 flex items-center justify-center text-4xl">
          🔒
        </div>
        <h1 className="text-2xl font-extrabold text-gray-900 dark:text-white">ระบบลงเวลาปิดใช้งาน</h1>
        <p className="text-gray-500 dark:text-gray-400 max-w-md">
          โรงเรียนนี้ปิดโหมดการลงเวลาไว้ชั่วคราว กรุณาติดต่อผู้ดูแลระบบเพื่อเปิดใช้งานอีกครั้ง
        </p>
      </div>
    );
  }

  // จอคีออสก์ปกติ (ไม่ใช่มือถือ/แท็บเล็ตแนวตั้ง และไม่ใช่โหมดลงเวลาด้วยตนเอง)
  // ให้ขยายเนื้อหาเต็มความสูง/กว้างของจอจริง แทนที่จะลอยกึ่งกลางแบบมีขอบขาวเหลือเยอะ
  const useFullBleedKioskLayout = !isSquareScreen && !isSelfServiceMode;

  const content = (
    <div className={`bg-[#edf0f4] dark:bg-[#1e1f21] flex flex-col transition-colors duration-300 ${useFullBleedKioskLayout ? 'h-dvh overflow-hidden' : 'min-h-dvh'}`}>
      <main className={`flex-grow flex overflow-x-hidden min-h-0 ${isSelfServiceMode ? 'items-start' : useFullBleedKioskLayout ? 'items-stretch' : 'items-center'} justify-center ${isSquareScreen ? 'p-2' : 'p-3 sm:p-6'}`}>
        <div className={`w-full min-w-0 min-h-0 ${useFullBleedKioskLayout ? '' : isSquareScreen ? '' : 'lg:max-w-screen-2xl'}`}>
          <div className={`grid grid-cols-1 lg:grid-cols-12 ${isSquareScreen ? 'gap-3' : 'gap-6 lg:gap-10'} ${useFullBleedKioskLayout ? 'h-full min-h-0' : ''}`}>
            <div className={`min-w-0 min-h-0 lg:col-span-8 flex flex-col ${isSquareScreen ? 'gap-3' : 'gap-6 lg:gap-10'} ${isSelfServiceMode ? '' : 'h-full'}`}>
              <div className={`min-w-0 min-h-0 overflow-hidden bg-[#fafbfc] dark:bg-[#2a2b2f] rounded-3xl ${isSquareScreen ? 'p-4' : 'p-4 sm:p-10'} text-gray-900 dark:text-white shadow-sm dark:shadow-none border border-gray-200/50 dark:border-none ${isSelfServiceMode ? '' : 'h-full'} flex flex-col`}>
                <div className={`flex items-center gap-3 sm:gap-5 min-w-0 shrink-0 ${isSquareScreen ? 'mb-3' : 'mb-4 sm:mb-8'}`}>
                  {schoolSettings?.logoUrl && (
                    <img
                      src={schoolSettings.logoUrl}
                      alt="School Logo"
                      className={`shrink-0 ${isSquareScreen ? 'w-10 h-10' : 'w-10 h-10 sm:w-16 sm:h-16'} object-cover rounded-full bg-white p-1 shadow-sm border border-gray-200 dark:border-white/10`}
                    />
                  )}
                  <div className="flex flex-col min-w-0">
                    <AutoFitHeading className={`${isSquareScreen ? 'text-xl' : 'text-xl sm:text-4xl'} font-extrabold text-gray-900 dark:text-white`}>
                      ระบบลงเวลา{schoolName ? ` | ${schoolName}` : ""}
                    </AutoFitHeading>
                    {schoolSettings?.affiliation && (
                      <p className={`truncate ${isSquareScreen ? 'text-xs' : 'text-xs sm:text-lg'} text-gray-900 dark:text-white font-bold mt-1`}>
                        สังกัด: {schoolSettings.affiliation}
                      </p>
                    )}
                  </div>
                </div>
                <HolidayBanner
                  calendarEvents={calendarEvents}
                  getTodayString={getTodayString}
                />

                {timeSyncStatus === "stale" && (
                  <div className="mb-3 rounded-xl bg-amber-50 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-500/30 px-4 py-2 text-sm text-amber-700 dark:text-amber-300 text-center">
                    ⚠️ กำลังใช้เวลาที่ซิงค์ไว้ล่าสุด (เชื่อมต่อเซิร์ฟเวอร์เวลาไม่ได้ชั่วคราว)
                  </div>
                )}
                {timeSyncStatus === "unverified" && (
                  <div className="mb-3 rounded-xl bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/30 px-4 py-2 text-sm text-red-700 dark:text-red-300 text-center">
                    ⏳ กำลังตรวจสอบเวลาที่ถูกต้อง ระบบจะยังไม่บันทึกการลงเวลาจนกว่าจะเชื่อมต่อสำเร็จ
                  </div>
                )}

                <div className="flex-1 flex min-w-0 min-h-0">
                  <div className={`grid grid-cols-1 sm:grid-cols-5 ${isSquareScreen ? 'gap-4' : 'gap-4 lg:gap-10'} flex-1 min-w-0 min-h-0`}>
                    {isFaceScanModeEnabled ? (
                      <FaceScanPanel
                        enabled={isFaceScanModeEnabled}
                        endpointConfigured={!!faceScanEndpoint}
                        displayUser={displayUser}
                        displayUsers={displayUsers}
                        checkinTime={checkinTime}
                        checkoutTime={checkoutTime}
                        onIdentifyFrame={handleIdentifyFaceFrame}
                        className="sm:col-span-5"
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
                          isCompact={isSquareScreen || isSelfServiceMode}
                        />
                        <SearchPanel
                          handleSearch={handleSearch}
                          searchId={searchId}
                          setSearchId={setSearchId}
                          error={error}
                          currentTime={currentTime}
                          hideInput={isFaceScanModeEnabled}
                          className="sm:col-span-3"
                          isCompact={isSquareScreen || isSelfServiceMode}
                        />
                      </>
                    )}
                  </div>
                </div>
              </div>
            </div>
            <div className={`min-w-0 min-h-0 lg:col-span-4 ${isSelfServiceMode ? '' : 'h-full'}`}>
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

      {/* ปุ่มตั้งค่าเสียงพูด/กล้อง: ซ่อนในโหมดลงเวลาด้วยตนเอง (mode=self) เพราะไม่เกี่ยวกับผู้ใช้ทั่วไป
          และอาจซ้อนทับกับคีย์บอร์ดบนหน้าจอมือถือ */}
      {!isSelfServiceMode && (
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
                        "ผ่านค่ะ ไม่ผ่านค่ะ"
                      );
                      utterance.voice = voice;
                      utterance.lang = "th-TH";
                      utterance.rate = 1.08;
                      utterance.pitch = 1.26;
                      window.speechSynthesis.speak(utterance);
                    }}
                    className={`w-full text-left px-3 py-2 rounded-lg text-xs transition-colors ${selectedVoiceURI === voice.voiceURI
                      ? "bg-indigo-600 text-white"
                      : "hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-600 dark:text-gray-400"
                      } `}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-semibold truncate">{voice.name}</span>
                      {voice.voiceURI === recommendedVoiceURI && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-600 dark:text-emerald-300">
                          แนะนำ
                        </span>
                      )}
                    </div>
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
      )}

      {/* ส่วนควบคุมแบบพับเก็บได้ด้านขวา (Collapsible Right Panel): ซ่อนในโหมดลงเวลาด้วยตนเอง เช่นกัน */}
      {!isSelfServiceMode && createPortal(
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

  return isSelfServiceMode ? <MainLayout>{content}</MainLayout> : content;
};

export default CheckinOutPage;
