import React, { useState, useEffect } from "react";
import { useSelector } from "react-redux";
import { firestore } from "@/firebase";
import { RootState } from "../../store";
import {
  collection,
  query,
  where,
  getDocs,
  doc,
  setDoc,
  getDoc,
  Timestamp,
  writeBatch,
  onSnapshot,
  collectionGroup,
  increment,
  serverTimestamp,
} from "firebase/firestore";
import { updatePeriodSummaries } from "@/utils/periodSummaryUtils";
import {
  calculateAttendanceStatus,
  GateRecord,
  FlagRecord,
  LeaveRecord,
  TravelRecord
} from "@/utils/attendanceLogic";
import Swal from "sweetalert2";
import { FaCheck, FaTimes, FaClock, FaUserSlash, FaUserGraduate, FaLock } from "react-icons/fa";
import { CalendarOff, Sparkles, School } from "lucide-react";
import MainLayout from "@/layouts/MainLayout";
import SkeletonLoader from "@/components/SkeletonLoader";
import { isNonOfficialHoliday } from "../../utils/calendarUtils";
import { Link } from "react-router-dom";

interface Student {
  id: string;
  name: string;
  profileImageUrl: string;
  studentId: string;
  class: string;
  attendanceStatus?: "มา" | "สาย" | "ลา" | "ขาด";
  isLeave: boolean; // 📌 เพิ่ม: property สำหรับตรวจสอบว่านักเรียนลาหรือไม่
  parentLineUserIds?: string[]; // 📌 เพิ่ม: เก็บ ID ผู้ปกครองเพื่อลดการ Query ซ้ำ
}

interface FoundUser {
  id: string;
  type: "student" | "teacher";
  name: string;
  profileImageUrl: string;
  displayId: string;
  latestActionTime?: string;
  status?: string;
  grade?: string;
}

const ATTENDANCE_STATUS = {
  PRESENT: "มา",
  LATE: "สาย",
  LEAVE: "ลา",
  ABSENT: "ขาด",
} as const;

type AttendanceStatus = (typeof ATTENDANCE_STATUS)[keyof typeof ATTENDANCE_STATUS];

// Helper: แปลงสถานะเป็น Key ภาษาอังกฤษสำหรับ Aggregation
const getFlagStatusKey = (status?: AttendanceStatus | null) => {
  if (!status) return null;
  switch (status) {
    case ATTENDANCE_STATUS.PRESENT: return 'present';
    case ATTENDANCE_STATUS.LATE: return 'late';
    case ATTENDANCE_STATUS.LEAVE: return 'leave';
    case ATTENDANCE_STATUS.ABSENT: return 'absent';
    default: return null;
  }
};

const StudentCardSkeleton: React.FC = () => (
  <div className="relative group rounded-2xl p-4 sm:p-6 border-2 border-gray-200 dark:border-gray-700 bg-white dark:bg-[#2a2b2f]">
    <div className="flex flex-row sm:flex-col items-center gap-4 animate-pulse">
      <div className="relative flex-shrink-0">
        <SkeletonLoader className="w-16 h-16 sm:w-24 sm:h-24 rounded-full" />
      </div>
      <div className="flex-grow min-w-0 w-full text-left sm:text-center space-y-2 sm:mt-2">
        <SkeletonLoader className="h-5 w-3/4 mx-auto rounded-md" />
        <SkeletonLoader className="h-4 w-1/2 mx-auto rounded-md" />
      </div>
      <div className="w-full grid grid-cols-4 gap-2 mt-4 sm:mt-2">
        <SkeletonLoader className="h-9 rounded-xl" />
        <SkeletonLoader className="h-9 rounded-xl" />
        <SkeletonLoader className="h-9 rounded-xl" />
        <SkeletonLoader className="h-9 rounded-xl" />
      </div>
    </div>
  </div>
);

const FlagCeremonyPageSkeleton: React.FC = () => (
  <>
    {/* Summary Cards Skeleton */}
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
      {[...Array(4)].map((_, i) => (
        <div key={i} className="bg-white dark:bg-[#2a2b2f] rounded-2xl p-4 border border-gray-100 dark:border-gray-700 shadow-sm flex items-center justify-between animate-pulse">
          <div className="space-y-2">
            <SkeletonLoader className="h-4 w-16 rounded" />
            <SkeletonLoader className="h-8 w-10 rounded" />
          </div>
          <SkeletonLoader className="w-12 h-12 rounded-xl" />
        </div>
      ))}
    </div>

    {/* Sticky Action Bar Skeleton */}
    <div className="flex justify-between items-center bg-white dark:bg-[#2a2b2f] p-4 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 sticky top-[70px] z-10 animate-pulse">
      <div className="flex items-center gap-2">
        <SkeletonLoader className="w-10 h-10 rounded-lg" />
        <SkeletonLoader className="h-6 w-40 rounded-md" />
      </div>
      <SkeletonLoader className="h-11 w-36 rounded-xl" />
    </div>

    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 sm:gap-6">
      {[...Array(8)].map((_, i) => <StudentCardSkeleton key={i} />)}
    </div>
  </>
);

const FlagCeremonyPage: React.FC = () => {
  const { user } = useSelector((state: RootState) => state.auth);
  const schoolId = user?.schoolId;
  const [selectedClass, setSelectedClass] = useState<string>("");
  const [students, setStudents] = useState<Student[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isAlreadySaved, setIsAlreadySaved] = useState(false); // 📌 เพิ่ม: state สำหรับตรวจสอบว่าบันทึกข้อมูลไปแล้วหรือยัง
  const [originalAttendanceMap, setOriginalAttendanceMap] = useState<Map<string, AttendanceStatus>>(new Map());
  const [isHomeroom, setIsHomeroom] = useState(false);
  const [calendarEvents, setCalendarEvents] = useState<Record<string, any>>({});
  const getTodayString = () => new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Bangkok" });
  const [availableLevels, setAvailableLevels] = useState<string[]>([]);
  const [selectedClassLevel, setSelectedClassLevel] = useState<string>('');
  const [selectedRoom, setSelectedRoom] = useState<string>('');
  const todayStr = getTodayString();
  const todayEvent = calendarEvents[todayStr];
  const [studentCheckinEnd, setStudentCheckinEnd] = useState("08:00"); // Default fallback
  const [currentAcademicYear, setCurrentAcademicYear] = useState<string>("");

  const dayOfWeek = new Date().toLocaleString('en-US', { timeZone: 'Asia/Bangkok', weekday: 'short' });
  const isWeekend = dayOfWeek === 'Sat' || dayOfWeek === 'Sun';

  let isHoliday = false;
  let holidayDescription = "";

  if (todayEvent?.type === 'schoolDay') {
    isHoliday = false; // มีการเรียนการสอน (เช่น ชดเชย)
  } else if (todayEvent?.type === 'holiday') {
    isHoliday = true;
    holidayDescription = todayEvent.description || "วันหยุดราชการ";
  } else if (todayEvent?.type === 'specialHoliday') {
    isHoliday = true;
    holidayDescription = todayEvent.description || "วันหยุดกรณีพิเศษ";
  } else if (isWeekend) {
    isHoliday = true;
    holidayDescription = "วันหยุดประจำสัปดาห์";
  }

  // ตรวจสอบว่าเป็นครูประจำชั้นหรือไม่
  useEffect(() => {
    const checkTeacherStatus = async () => {
      if (user?.uid && schoolId) {
        try {
          const teacherRef = doc(firestore, "school-settings", schoolId, "teachers", user.uid);
          const snap = await getDoc(teacherRef);
          if (snap.exists()) {
            const data = snap.data();
            if (data.isHomeroomTeacher && data.homeroomGrade) {
              if (data.homeroomRoom) {
                setSelectedClass(`${data.homeroomGrade}/${data.homeroomRoom}`);
              } else {
                setSelectedClass(data.homeroomGrade);
              }
              setIsHomeroom(true);
            }
          }
        } catch (error) {
          console.error("Error checking teacher status:", error);
        }
      }
    };
    checkTeacherStatus();
  }, [user, schoolId]);

  useEffect(() => {
    const fetchLevels = async () => {
      if (!schoolId) return;
      try {
        const schoolRef = doc(firestore, "school-settings", schoolId);
        const schoolSnap = await getDoc(schoolRef);
        if (schoolSnap.exists()) {
          const data = schoolSnap.data();
          const levelRange = data.opportunityExpansionLevel;

          const primary = ["ป.1", "ป.2", "ป.3", "ป.4", "ป.5", "ป.6"];
          const junior = ["ม.1", "ม.2", "ม.3"];
          const senior = ["ม.4", "ม.5", "ม.6"];

          let levels: string[] = [];
          if (levelRange === 'ป.1-ป.6') levels = primary;
          else if (levelRange === 'ม.1-ม.6') levels = [...junior, ...senior];
          else if (levelRange === 'ป.1-ม.3') levels = [...primary, ...junior];
          else if (levelRange === 'ป.1-ม.6') levels = [...primary, ...junior, ...senior];
          else {
            levels = [...primary, ...junior, ...senior];
          }
          setAvailableLevels(levels);
        }
      } catch (error) {
        console.error("Error fetching school levels:", error);
      }
    };
    fetchLevels();
    if (!schoolId) return;
    const calendarRef = doc(firestore, "school-settings", schoolId as string, "main_calendar", "default");
    const unsubscribeCalendar = onSnapshot(calendarRef, (docSnap) => {
      if (docSnap.exists()) {
        const data = docSnap.data();
        setCalendarEvents(data.events || {});
        if (data.academicYear) {
          setCurrentAcademicYear(data.academicYear);
        }
      }
    });

    const configRef = doc(firestore, "school-settings", schoolId as string);
    const unsubscribeConfig = onSnapshot(configRef, (docSnap) => {
      if (docSnap.exists()) {
        const data = docSnap.data();
        if (data.attendanceConfig?.studentLateTime) {
          setStudentCheckinEnd(data.attendanceConfig.studentLateTime);
        }
      }
    });

    return () => {
      unsubscribeCalendar();
      unsubscribeConfig();
    };
  }, [schoolId]);

  useEffect(() => {
    if (!schoolId) return;

    const fetchCalendarData = async () => {
      // 1. Real-time listener for Firestore (School Settings)
      const docRef = doc(firestore, 'school-settings', schoolId, 'main_calendar', 'default');

      const unsubscribe = onSnapshot(docRef, (docSnap) => {
        if (docSnap.exists()) {
          const data = docSnap.data();
          if (data.events) {
            setCalendarEvents(data.events);
            return;
          }
        }

        // 2. Fallback: Fetch from Google Calendar API if Firestore is empty/missing
        const apiKey = import.meta.env.VITE_GOOGLE_CALENDAR_API_KEY;
        if (apiKey) {
          fetchGoogleCalendar(apiKey);
        }
      }, (error) => {
        console.error("Error listening to calendar:", error);
      });

      return () => unsubscribe();
    };

    fetchCalendarData();
  }, [schoolId]);

  const fetchGoogleCalendar = async (apiKey: string) => {
    try {
      const year = new Date().getFullYear();
      const calendarId = 'th.th#holiday@group.v.calendar.google.com';
      const timeMin = `${year}-01-01T00:00:00Z`;
      const timeMax = `${year}-12-31T23:59:59Z`;
      const response = await fetch(
        `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events?key=${apiKey}&timeMin=${timeMin}&timeMax=${timeMax}&singleEvents=true&orderBy=startTime`
      );
      if (response.ok) {
        const data = await response.json();
        const apiEvents: Record<string, any> = {};
        data.items?.forEach((item: any) => {
          if (item.start?.date && !isNonOfficialHoliday(item.summary)) {
            apiEvents[item.start.date] = { type: 'holiday', description: item.summary };
          }
        });
        setCalendarEvents(prev => ({ ...prev, ...apiEvents }));
      }
    } catch (error) {
      console.error("Error fetching Google Calendar API:", error);
    }
  };

  useEffect(() => {
    if (!selectedClass || !schoolId) {
      setStudents([]);
      setIsAlreadySaved(false);
      return;
    }

    const fetchClassData = async () => {
      setIsLoading(true);
      setError(null);
      setIsAlreadySaved(false);
      setOriginalAttendanceMap(new Map());
      try {
        // 1. ดึงข้อมูลนักเรียนเฉพาะห้องที่เลือก (ยังคงจำเป็นเพื่อแสดงรายชื่อทั้งหมด)
        // 1. ดึงข้อมูลนักเรียน
        let studentsQuery;
        const primaryLevels = ["ป.1", "ป.2", "ป.3", "ป.4", "ป.5", "ป.6"];
        const juniorLevels = ["ม.1", "ม.2", "ม.3"];
        const seniorLevels = ["ม.4", "ม.5", "ม.6"];

        if (selectedClass.includes('/')) {
          const [classLevel, room] = selectedClass.split('/');
          studentsQuery = query(
            collection(firestore, "school-settings", schoolId, "students"),
            where("classLevel", "==", classLevel),
            where("room", "==", room)
          );
        } else if (selectedClass === "ประถมศึกษา" || selectedClass === "ชั้นประถมศึกษา") {
          studentsQuery = query(
            collection(firestore, "school-settings", schoolId, "students"),
            where("classLevel", "in", primaryLevels)
          );
        } else if (selectedClass === "มัธยมศึกษาตอนต้น" || selectedClass === "ชั้นมัธยมศึกษาตอนต้น") {
          studentsQuery = query(
            collection(firestore, "school-settings", schoolId, "students"),
            where("classLevel", "in", juniorLevels)
          );
        } else if (selectedClass === "มัธยมศึกษาตอนปลาย" || selectedClass === "ชั้นมัธยมศึกษาตอนปลาย") {
          studentsQuery = query(
            collection(firestore, "school-settings", schoolId, "students"),
            where("classLevel", "in", seniorLevels)
          );
        } else {
          studentsQuery = query(
            collection(firestore, "school-settings", schoolId, "students"),
            where("classLevel", "==", selectedClass)
          );
        }

        const studentsSnapshot = await getDocs(studentsQuery);
        const classStudents: Student[] = studentsSnapshot.docs.map((doc) => ({
          id: doc.id,
          name: `${doc.data().title || ''}${doc.data().firstName} ${doc.data().lastName}`.trim(),
          profileImageUrl: doc.data().profileImageUrl || "",
          studentId: doc.data().studentId,
          class: `${doc.data().classLevel}/${doc.data().room}`,
          attendanceStatus: ATTENDANCE_STATUS.PRESENT,
          isLeave: false,
          parentLineUserIds: doc.data().parentLineUserIds || [],
        }));

        // 2. ดึงข้อมูลการเข้าแถวของนักเรียนทีละคน (วิธีนี้ไม่ต้องสร้าง Index ใน Firebase)
        let hasBeenSaved = false;
        const attendanceMapForOriginals = new Map<string, AttendanceStatus>();
        const attendancePromises = classStudents.map(async (student) => {
          const attendanceRef = doc(firestore, "school-settings", schoolId, "students", student.id, "flag_ceremony_summary", todayStr);
          const attendanceSnap = await getDoc(attendanceRef);
          if (attendanceSnap.exists()) {
            hasBeenSaved = true;
            const status = attendanceSnap.data().status;
            if (status) {
              attendanceMapForOriginals.set(student.id, status);
              return { ...student, attendanceStatus: status, isLeave: status === ATTENDANCE_STATUS.LEAVE };
            }
          }
          return student;
        });

        const studentsWithAttendance = await Promise.all(attendancePromises);
        // Pass to additional fetcher
        fetchAdditionalData(studentsWithAttendance);

      } catch (err: any) {
        console.error("Error fetching students:", err);
        let errorMessage = "เกิดข้อผิดพลาดในการโหลดข้อมูลนักเรียน";
        if (err.message?.includes('requires an index')) {
          errorMessage = "ระบบต้องการ Index สำหรับการค้นหาข้อมูล กรุณาเปิด Console (F12) และคลิกลิงก์ที่ Firebase แจ้งเตือนเพื่อสร้าง Index";
        }
        setError(errorMessage);
      } finally {
        setIsLoading(false);
      }
    };

    const fetchAdditionalData = async (students: Student[]) => {
      // Fetch Gate Attendance & Leave Data
      const enrichedStudents = await Promise.all(students.map(async (student) => {
        // 1. Get Flag Status (Existing)
        let flagRecord: FlagRecord | null = null;
        let originalStatus = undefined;

        const flagRef = doc(firestore, "school-settings", schoolId, "students", student.id, "flag_ceremony_summary", todayStr);
        const flagSnap = await getDoc(flagRef);
        if (flagSnap.exists()) {
          flagRecord = { status: flagSnap.data().status };
          originalStatus = flagSnap.data().status;
        }

        // 2. Get Gate Attendance
        let gateRecord: GateRecord | null = null;
        const paramDate = todayStr; // Or use date picker
        const gateRef = doc(firestore, "school-settings", schoolId, "students", student.id, "attendance", paramDate);
        const gateSnap = await getDoc(gateRef);
        if (gateSnap.exists()) {
          const d = gateSnap.data();
          gateRecord = { checkinTime: d.time || "", status: d.status }; // Adjust based on actual field names
        }

        // 4. Get Leave Data
        let leaveRecord: LeaveRecord | null = null;
        // 📌 Fix: Query the STUDENT's sub-collection, not the global one.
        // This ensures we find the data saved by LeaveRequestPage (which saves to sub-collection).
        const leaveQuery = query(
          collection(firestore, "school-settings", schoolId, "students", student.id, "leave_summary"),
          where("status", "==", "approved")
          // No need for studentId filter here, and no need for endDate filter (handled manually)
        );
        const leaveSnap = await getDocs(leaveQuery);

        // Manual Filter for Date Range (Firestore requires index for multiple fields)
        const validLeaveDoc = leaveSnap.docs.find(doc => {
          const data = doc.data();
          const getDateStr = (val: any) => {
            if (val?.toDate) return val.toDate().toISOString().split('T')[0];
            if (typeof val === 'string') return val;
            return '';
          };
          const s = getDateStr(data.startDate);
          const e = getDateStr(data.endDate);
          return s && e && s <= paramDate && e >= paramDate;
        });

        if (validLeaveDoc) {
          leaveRecord = { type: validLeaveDoc.data().leaveType, id: validLeaveDoc.id };
        }

        // 4. Get Travel Data
        // Implementation for travel query if needed...

        // Calculate Initial Status for Display
        // Ideally we should use the calculated status, but for Flag Ceremony we might want to show what was *selected* previously
        // or auto-suggest based on logic.

        // If already saved in Flag, use that.
        // If not, use Logic to suggest.

        let displayStatus = originalStatus || ATTENDANCE_STATUS.PRESENT; // 📌 Default to PRESENT (Checking "Present" first)

        // 📌 Force Status to LEAVE if leave request exists (Overwrite original status)
        if (leaveRecord) {
          if (leaveRecord.type === 'ไปราชการ/กิจกรรม') {
            displayStatus = ATTENDANCE_STATUS.PRESENT;
          } else {
            displayStatus = ATTENDANCE_STATUS.LEAVE;
          }
        } else if (!originalStatus) {
          const suggestion = calculateAttendanceStatus(gateRecord, null, leaveRecord, null, { studentLateTime: studentCheckinEnd });
          // Map suggestion back to Thai status for Dropdown
          if (suggestion.finalStatus === 'present') displayStatus = ATTENDANCE_STATUS.PRESENT;
          else if (suggestion.finalStatus === 'late') displayStatus = ATTENDANCE_STATUS.LATE;
          else if (suggestion.finalStatus === 'leave') displayStatus = ATTENDANCE_STATUS.LEAVE;
          else if (suggestion.finalStatus === 'officialTravel') displayStatus = ATTENDANCE_STATUS.PRESENT;
          // else displayStatus = ATTENDANCE_STATUS.ABSENT; // No need, default is PRESENT
        }

        // Update local map for change tracking
        if (originalStatus) {
          setOriginalAttendanceMap(prev => new Map(prev).set(student.id, originalStatus));
          setIsAlreadySaved(true);
        }

        return {
          ...student,
          attendanceStatus: displayStatus,
          // Attach extra data for Save Logic
          _gateData: gateRecord,
          _leaveData: leaveRecord,
          _travelData: null,
          isLeave: !!leaveRecord // 📌 Critical: Pass this flag to UI to lock buttons
        };
      }));

      setStudents(enrichedStudents);
    };

    fetchClassData();
  }, [selectedClass, todayStr, schoolId]);

  // 📌 เพิ่ม: ฟังก์ชันสำหรับส่งแจ้งเตือน LINE OA (คัดลอกจาก CheckinOutPage.tsx)
  // 📌 ปรับปรุง: รับ teacherConfig และ parentUserIds เข้ามาโดยตรง เพื่อไม่ต้อง Query Firestore ซ้ำ
  const sendLineNotification = async (
    user: FoundUser,
    status: string,
    time: string,
    teacherConfig: any,
    parentUserIds: string[]
  ) => {
    console.log("🚀 เริ่มต้นกระบวนการส่ง LINE Notify สำหรับการเข้าแถว");

    if (!teacherConfig) {
      console.warn("❌ ไม่พบข้อมูลการตั้งค่า LINE OA ของครูประจำชั้น");
      return;
    }

    const { lineChannelAccessToken, enableNotification } = teacherConfig;
    const isEnabled = enableNotification === undefined ? true : enableNotification;

    if (!isEnabled || !lineChannelAccessToken) {
      console.warn("❌ ระบบแจ้งเตือน LINE ถูกปิดอยู่ หรือไม่มี Access Token");
      return;
    }

    try {
      console.log("📤 กำลังส่ง Request ไปยัง LINE API...");

      // สร้างเนื้อหา Flex Message
      const flexContents: any[] = [
        {
          type: "box",
          layout: "baseline",
          spacing: "sm",
          contents: [
            { type: "text", text: "ชื่อ", color: "#aaaaaa", size: "sm", flex: 1 },
            { type: "text", text: user.name, wrap: true, color: "#666666", size: "sm", flex: 4 }
          ]
        },
        {
          type: "box",
          layout: "baseline",
          spacing: "sm",
          contents: [
            { type: "text", text: "ชั้น", color: "#aaaaaa", size: "sm", flex: 1 },
            { type: "text", text: user.grade || "-", wrap: true, color: "#666666", size: "sm", flex: 4 }
          ]
        },
        {
          type: "box",
          layout: "baseline",
          spacing: "sm",
          contents: [
            { type: "text", text: "สถานะ", color: "#aaaaaa", size: "sm", flex: 1 },
            { type: "text", text: status, wrap: true, color: status === 'มา' ? '#1DB446' : '#FF5722', weight: "bold", size: "sm", flex: 4 }
          ]
        },
        {
          type: "box",
          layout: "baseline",
          spacing: "sm",
          contents: [
            { type: "text", text: "เวลา", color: "#aaaaaa", size: "sm", flex: 1 },
            { type: "text", text: time, wrap: true, color: "#666666", size: "sm", flex: 4 }
          ]
        }
      ];

      const flexMessage = {
        type: "flex",
        altText: `แจ้งเตือนกิจกรรมเข้าแถว: ${user.name}`,
        contents: {
          type: "bubble",
          hero: user.profileImageUrl ? {
            type: "image",
            url: user.profileImageUrl,
            size: "full",
            aspectRatio: "20:13",
            aspectMode: "cover",
          } : undefined,
          body: {
            type: "box",
            layout: "vertical",
            contents: [
              {
                type: "text",
                text: "🔔 แจ้งเตือนกิจกรรมเข้าแถว",
                weight: "bold",
                size: "lg",
                color: "#1DB446"
              },
              {
                type: "box",
                layout: "vertical",
                margin: "lg",
                spacing: "sm",
                contents: flexContents
              }
            ]
          }
        }
      };

      const isLocalhost = window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1";

      // 📌 ปรับปรุง: เลือกส่งแบบ Multicast (เฉพาะเจาะจง) หรือ Broadcast (ทุกคน)
      let targetUrl = "https://api.line.me/v2/bot/message/broadcast";
      let bodyPayload: any = { messages: [flexMessage] };

      if (parentUserIds.length > 0) {
        targetUrl = "https://api.line.me/v2/bot/message/multicast";
        bodyPayload = {
          to: parentUserIds,
          messages: [flexMessage]
        };
        console.log(`🎯 ส่งข้อความแบบ Multicast ไปยังผู้ปกครอง ${parentUserIds.length} ท่าน`);
      } else {
        console.log("⚠️ ไม่พบข้อมูลผู้ปกครอง (ส่งแบบ Broadcast ไปยังทุกคนที่ติดตาม LINE OA)");
      }

      const url = isLocalhost ? `https://corsproxy.io/?${encodeURIComponent(targetUrl)}` : targetUrl;

      const response = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${lineChannelAccessToken}`
        },
        body: JSON.stringify(bodyPayload)
      });

      if (response.ok) {
        console.log("✅ ส่งข้อความ LINE สำเร็จ!");
      } else {
        const errorText = await response.text();
        console.error("❌ ส่งข้อความ LINE ไม่สำเร็จ:", response.status, errorText);
      }
    } catch (error: any) {
      console.error("Error sending LINE notification:", error);
    }
  };

  const handleStatusChange = async (studentId: string, newStatus: AttendanceStatus) => {
    // อัปเดตสถานะในหน้าจอทันที แต่ยังไม่บันทึกลง Firestore
    setStudents((prevStudents) =>
      prevStudents.map((s) =>
        s.id === studentId ? { ...s, attendanceStatus: newStatus } : s
      )
    );
  };

  // 📌 เพิ่ม: ฟังก์ชันสำหรับบันทึกข้อมูลทั้งหมด
  const handleSaveAll = async () => {
    if (!schoolId) return;
    setIsLoading(true);
    try {
      const batch = writeBatch(firestore);
      // 📌 เพิ่ม: สร้าง list ของนักเรียนที่ต้องแจ้งเตือน
      const studentsToNotify: { student: Student, status: AttendanceStatus }[] = [];

      // 📌 เพิ่ม: ดึงข้อมูลครูประจำชั้น (LINE Config) เพียงครั้งเดียว
      let teacherConfig = null;
      try {
        // 1. ลองดึงจาก User ปัจจุบันก่อน (แม่นยำที่สุดสำหรับครูที่ login อยู่)
        if (user?.uid) {
          const currentUserRef = doc(firestore, "school-settings", schoolId, "teachers", user.uid);
          const currentUserSnap = await getDoc(currentUserRef);
          if (currentUserSnap.exists()) {
            teacherConfig = currentUserSnap.data();
          }
        }

        // 2. ถ้าไม่พบ (เช่น Admin ทำแทน) ให้ค้นหาจากชั้น/ห้อง
        if (!teacherConfig) {
          const teachersRef = collection(firestore, "school-settings", schoolId, "teachers");
          let q = query(teachersRef, where("homeroomGrade", "==", selectedClass));
          let snapshot = await getDocs(q);

          if (snapshot.empty && selectedClass.includes('/')) {
            const [level, room] = selectedClass.split('/');
            q = query(teachersRef, where("homeroomGrade", "==", level), where("homeroomRoom", "==", room));
            snapshot = await getDocs(q);
          }

          if (!snapshot.empty) {
            teacherConfig = snapshot.docs[0].data();
          }
        }
      } catch (e) {
        console.error("Error fetching teacher config:", e);
      }

      // 📌 Prepare Loop for Async Operations
      const promises = students.map(async (student) => {

        // 1. Calculate Logic-based Status
        const gateData = (student as any)._gateData;
        const leaveData = (student as any)._leaveData;
        const travelData = (student as any)._travelData;

        const flagRecord: FlagRecord = { status: student.attendanceStatus };

        const result = calculateAttendanceStatus(gateData, flagRecord, leaveData, travelData, { studentLateTime: studentCheckinEnd });
        const finalStatusKey = result.finalStatus; // 'present' | 'late' | 'leave' | ...

        // 2. Save Flag Ceremony Record (What the teacher selected)
        // 📌 Path: students/{id}/flag_ceremony_summary/{date} 
        const attendanceRef = doc(
          firestore,
          "school-settings",
          schoolId,
          "students",
          student.id,
          "flag_ceremony_summary",
          todayStr
        );
        const attendanceData = {
          studentId: student.studentId,
          studentDocId: student.id,
          status: student.attendanceStatus, // Keep what teacher explicitly selected
          date: todayStr,
          timestamp: Timestamp.now(),
        };
        batch.set(attendanceRef, attendanceData, { merge: true });

        // --- START: Aggregation Logic ---
        const studentRef = doc(firestore, "school-settings", schoolId, "students", student.id);
        const newStatus = student.attendanceStatus; // Flag status for stats
        const newStatusKey = getFlagStatusKey(newStatus);
        const classKey = selectedClass.split('/')[0] || "ไม่ระบุชั้น";

        if (isAlreadySaved) {
          const oldFlagStatus = originalAttendanceMap.get(student.id);

          // Re-calculate OLD Final Status to decrement correctly
          // We need the OLD Gate/Leave/Travel data. 
          // Assuming Gate/Leave/Travel didn't change *during* this session, 
          // we can use the same `gateData`, `leaveData` with `oldFlagStatus`.
          const oldFlagRecord: FlagRecord = { status: oldFlagStatus };
          const oldResult = calculateAttendanceStatus(gateData, oldFlagRecord, leaveData, travelData, { studentLateTime: studentCheckinEnd });
          const oldFinalStatusKey = oldResult.finalStatus;

          // Only update if status has changed
          if (finalStatusKey !== oldFinalStatusKey) {
            const oldStatusKey = getFlagStatusKey(oldFlagStatus); // For FlagStats
            const statsUpdate: any = {};

            // Decrement old status if it existed (Flag Stats)
            if (oldStatusKey) {
              statsUpdate[`flagCeremonyStats.${oldStatusKey}`] = increment(-1);
            }
            // Increment new status (Flag Stats)
            if (newStatusKey) {
              statsUpdate[`flagCeremonyStats.${newStatusKey}`] = increment(1);
            }

            if (Object.keys(statsUpdate).length > 0) {
              batch.update(studentRef, statsUpdate);
            }

            // Update Period Summaries using FINAL STATUS
            updatePeriodSummaries(
              firestore,
              batch,
              schoolId,
              student.id,
              'students',
              todayStr,
              oldFinalStatusKey, // Decrement the calculated OLD final status
              finalStatusKey,    // Increment the NEW final status
              undefined,
              currentAcademicYear
            );
          }
        } else { // First save
          if (newStatusKey) {
            batch.update(studentRef, { [`flagCeremonyStats.${newStatusKey}`]: increment(1) });
          }
          // Bulk Update Summaries
          updatePeriodSummaries(
            firestore,
            batch,
            schoolId,
            student.id,
            'students',
            todayStr,
            null,
            finalStatusKey,
            undefined,
            currentAcademicYear
          );
        }
        // --- END: Aggregation Logic ---

        // 📌 เพิ่ม: เก็บข้อมูลนักเรียนที่ต้องแจ้งเตือน
        // Logic ใหม่ (2025-02-08):
        // 1. ถ้าลงเวลาที่ประตูแล้ว (gateData.checkinTime มีค่า) -> ไม่ต้องแจ้งเตือนซ้ำ (ถือว่าแจ้งตอนเช้าแล้ว)
        // 2. ถ้ายังไม่ลงเวลาที่ประตู -> ให้แจ้งเตือนสถานะจากหน้าเสาธง (มา/สาย/ลา/ขาด)
        if (!gateData?.checkinTime && student.attendanceStatus) {
          // แจ้งเตือนทุกกรณีหากยังไม่ได้ลงเวลาที่ประตู รวมถึง "มา" (เช็คหน้าเสาธง)
          studentsToNotify.push({ student, status: student.attendanceStatus });
        }

        // 📌 Create/Update Daily Attendance (Unified Record)
        const dailyAttendanceRef = doc(firestore, "school-settings", schoolId, "students", student.id, "attendance", todayStr);
        // We always overwrite/merge with the Calculated Final Status

        batch.set(dailyAttendanceRef, {
          schoolId,
          date: todayStr,
          userType: 'student',
          classLevel: student.class?.split('/')[0] || "",

          // Mapping:
          status: finalStatusKey === 'present' ? 'มา' :
            finalStatusKey === 'late' ? 'สาย' :
              finalStatusKey === 'leave' ? 'ลา' :
                finalStatusKey === 'officialTravel' ? 'ไปราชการ' : 'ขาด',

          checkinTime: gateData?.checkinTime || (finalStatusKey === 'present' || finalStatusKey === 'late' ? Timestamp.now() : null),
          checkinDevice: gateData?.checkinTime ? undefined : 'FlagCeremony', // Only set if not from Gate
          updatedAt: serverTimestamp(),
          // Add metadata
          metadata: {
            gate: gateData?.status || 'none',
            flag: student.attendanceStatus,
            leave: leaveData?.type || 'none',
            description: result.description
          }
        }, { merge: true });

      });

      await Promise.all(promises);
      await batch.commit();

      // 📌 เพิ่ม: ส่งแจ้งเตือนหลังจากบันทึกข้อมูลสำเร็จ
      const notificationPromises = studentsToNotify.map(item => {
        const now = new Date();
        const timeStr = now.toLocaleTimeString("th-TH", { hour: '2-digit', minute: '2-digit' });

        let notificationStatus: string = item.status;
        if (item.status === ATTENDANCE_STATUS.ABSENT) { notificationStatus = 'ขาดเรียน(ไม่ลงเวลา,ไม่มาเข้าแถวเคารพธงชาติ)'; }

        const userForNotification: FoundUser = {
          id: item.student.id,
          type: "student",
          name: item.student.name,
          profileImageUrl: item.student.profileImageUrl,
          displayId: item.student.studentId,
          grade: item.student.class,
        };

        return sendLineNotification(
          userForNotification,
          notificationStatus,
          timeStr,
          teacherConfig,
          item.student.parentLineUserIds || []
        );
      });

      // รอให้การแจ้งเตือนทั้งหมดถูกส่ง (ไม่ต้องบล็อก UI หลัก)
      Promise.all(notificationPromises).catch(err => console.error("Error sending notifications:", err));

      Swal.fire({
        icon: 'success',
        title: 'บันทึกข้อมูลสำเร็จ',
        text: 'ระบบได้บันทึกข้อมูลการเข้าแถวของนักเรียนทุกคนแล้ว',
        background: '#2a2b2f',
        color: '#ffffff',
        timer: 2000,
        showConfirmButton: false,
      });
      setIsAlreadySaved(true);
      setOriginalAttendanceMap(new Map(students.map(s => [s.id, s.attendanceStatus!]))); // Update original map to current state
    } catch (error) {
      console.error("Error saving all attendance:", error);
      Swal.fire({
        icon: 'error',
        title: 'เกิดข้อผิดพลาด',
        text: 'ไม่สามารถบันทึกข้อมูลทั้งหมดได้',
        background: '#2a2b2f',
        color: '#ffffff'
      });
    } finally {
      setIsLoading(false);
    }
  };

  const attendanceSummary = students.reduce(
    (acc, student) => {
      acc[student.attendanceStatus || ATTENDANCE_STATUS.ABSENT]++;
      return acc;
    },
    { "มา": 0, "สาย": 0, "ลา": 0, "ขาด": 0 } as Record<AttendanceStatus, number>
  );

  const getStatusStyle = (status?: AttendanceStatus) => {
    switch (status) {
      case ATTENDANCE_STATUS.PRESENT: return 'border-emerald-500/50 bg-emerald-50/50 dark:bg-emerald-500/10 shadow-[0_0_15px_rgba(16,185,129,0.1)]';
      case ATTENDANCE_STATUS.LATE: return 'border-amber-500/50 bg-amber-50/50 dark:bg-amber-500/10 shadow-[0_0_15px_rgba(245,158,11,0.1)]';
      case ATTENDANCE_STATUS.LEAVE: return 'border-blue-500/50 bg-blue-50/50 dark:bg-blue-500/10 shadow-[0_0_15px_rgba(59,130,246,0.1)]';
      case ATTENDANCE_STATUS.ABSENT: return 'border-rose-500/50 bg-rose-50/50 dark:bg-rose-500/10 shadow-[0_0_15px_rgba(244,63,94,0.1)]';
      default: return 'border-gray-200 dark:border-gray-700 bg-white dark:bg-[#2a2b2f]';
    }
  };

  const statusOptions = [
    {
      status: ATTENDANCE_STATUS.PRESENT,
      label: 'มา',
      colorClass: 'text-emerald-600 dark:text-emerald-400',
      bgClass: 'bg-emerald-100 dark:bg-emerald-900/30',
      activeClass: 'bg-gradient-to-br from-emerald-500 to-green-600 text-white shadow-lg shadow-emerald-500/30 ring-2 ring-emerald-200 dark:ring-emerald-900 transform scale-105'
    },
    {
      status: ATTENDANCE_STATUS.LATE,
      label: 'สาย',
      colorClass: 'text-amber-600 dark:text-amber-400',
      bgClass: 'bg-amber-100 dark:bg-amber-900/30',
      activeClass: 'bg-gradient-to-br from-amber-500 to-orange-600 text-white shadow-lg shadow-amber-500/30 ring-2 ring-amber-200 dark:ring-amber-900 transform scale-105'
    },
    {
      status: ATTENDANCE_STATUS.LEAVE,
      label: 'ลา',
      colorClass: 'text-blue-600 dark:text-blue-400',
      bgClass: 'bg-blue-100 dark:bg-blue-900/30',
      activeClass: 'bg-gradient-to-br from-blue-500 to-indigo-600 text-white shadow-lg shadow-blue-500/30 ring-2 ring-blue-200 dark:ring-blue-900 transform scale-105'
    },
    {
      status: ATTENDANCE_STATUS.ABSENT,
      label: 'ขาด',
      colorClass: 'text-rose-600 dark:text-rose-400',
      bgClass: 'bg-rose-100 dark:bg-rose-900/30',
      activeClass: 'bg-gradient-to-br from-rose-500 to-red-600 text-white shadow-lg shadow-rose-500/30 ring-2 ring-rose-200 dark:ring-rose-900 transform scale-105'
    },
  ];

  return (
    <MainLayout>
      <div className="min-h-screen bg-gray-50/50 dark:bg-[#1e1f21] p-4 sm:p-6 transition-colors duration-300">
        <div className="max-w-7xl mx-auto space-y-6">

          {/* Header Section */}
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white dark:bg-[#2a2b2f] rounded-2xl p-6 shadow-sm border border-gray-100 dark:border-gray-700">
            <div>
              <h1 className="text-2xl sm:text-3xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-indigo-600 to-violet-600 dark:from-indigo-400 dark:to-violet-400">
                เช็คชื่อกิจกรรมเข้าแถว
              </h1>
              <div className="flex items-center gap-2 mt-2 text-gray-500 dark:text-gray-400">
                <FaClock className="text-indigo-500" />
                <span>{new Date().toLocaleDateString("th-TH", { dateStyle: 'long' })}</span>
              </div>
            </div>

            <div className="w-full md:w-72">
              {isHomeroom ? (
                <div className="w-full bg-indigo-50 dark:bg-indigo-900/20 border border-indigo-200 dark:border-indigo-800 rounded-xl px-4 py-2.5 text-indigo-900 dark:text-indigo-100 font-semibold text-center">
                  ชั้น {selectedClass}
                </div>
              ) : (
                <div className="flex gap-2">
                  <select
                    value={selectedClassLevel}
                    onChange={(e) => setSelectedClassLevel(e.target.value)}
                    className="w-full px-3 py-2.5 bg-white dark:bg-[#2a2b2f] border border-gray-200 dark:border-gray-700 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none text-sm text-gray-900 dark:text-white"
                  >
                    <option value="">ชั้น</option>
                    {availableLevels.map(level => <option key={level} value={level}>{level}</option>)}
                  </select>
                  <select
                    value={selectedRoom}
                    onChange={(e) => setSelectedRoom(e.target.value)}
                    className="w-full px-3 py-2.5 bg-white dark:bg-[#2a2b2f] border border-gray-200 dark:border-gray-700 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none text-sm text-gray-900 dark:text-white"
                  >
                    <option value="">ห้อง</option>
                    {Array.from({ length: 20 }, (_, i) => i + 1).map(r => <option key={r} value={r}>{r}</option>)}
                  </select>
                </div>
              )}
            </div>
          </div>

          {/* แสดงแถบแจ้งเตือนวันหยุดกรณีพิเศษ / วันหยุดราชการ / วันเรียนชดเชย */}
          {(() => {
            if (!todayEvent) return null;

            if (todayEvent.type === 'specialHoliday') {
              return (
                <div className="relative overflow-hidden rounded-xl bg-gradient-to-r from-amber-500/90 to-orange-500/90 p-1 shadow-lg backdrop-blur-sm transform transition-all hover:scale-[1.01]">
                  <div className="absolute top-0 right-0 -mt-8 -mr-8 w-32 h-32 bg-white opacity-10 rounded-full blur-xl"></div>
                  <div className="relative bg-black/10 rounded-lg p-4 flex items-center gap-4">
                    <div className="flex-shrink-0">
                      <Sparkles className="w-6 h-6 text-white opacity-90" />
                    </div>
                    <div className="flex-grow">
                      <h3 className="text-lg font-bold text-white leading-tight drop-shadow">
                        {todayEvent.description}
                      </h3>
                      <p className="text-amber-100 text-sm font-medium opacity-90">วันหยุดกรณีพิเศษ</p>
                    </div>
                  </div>
                </div>
              );
            } else if (todayEvent.type === 'holiday') {
              return (
                <div className="relative overflow-hidden rounded-xl bg-gradient-to-r from-red-500/90 to-rose-500/90 p-1 shadow-lg backdrop-blur-sm transform transition-all hover:scale-[1.01]">
                  <div className="absolute top-0 right-0 -mt-8 -mr-8 w-32 h-32 bg-white opacity-10 rounded-full blur-xl"></div>
                  <div className="relative bg-black/10 rounded-lg p-4 flex items-center gap-4">
                    <div className="flex-shrink-0">
                      <CalendarOff className="w-6 h-6 text-white opacity-90" />
                    </div>
                    <div className="flex-grow">
                      <h3 className="text-lg font-bold text-white leading-tight drop-shadow">
                        {todayEvent.description}
                      </h3>
                      <p className="text-red-100 text-sm font-medium opacity-90">วันหยุดราชการ</p>
                    </div>
                  </div>
                </div>
              );
            } else if (todayEvent.type === 'schoolDay' && todayEvent.description) {
              return (
                <div className="relative overflow-hidden rounded-xl bg-gradient-to-r from-blue-500/90 to-indigo-500/90 p-1 shadow-lg backdrop-blur-sm transform transition-all hover:scale-[1.01]">
                  <div className="absolute top-0 right-0 -mt-8 -mr-8 w-32 h-32 bg-white opacity-10 rounded-full blur-xl"></div>
                  <div className="relative bg-black/10 rounded-lg p-4 flex items-center gap-4">
                    <div className="flex-shrink-0">
                      <School className="w-6 h-6 text-white opacity-90" />
                    </div>
                    <div className="flex-grow">
                      <h3 className="text-lg font-bold text-white leading-tight drop-shadow">
                        {todayEvent.description}
                      </h3>
                      <p className="text-blue-100 text-sm font-medium opacity-90">กิจกรรม / เรียนชดเชย</p>
                    </div>
                  </div>
                </div>
              );
            }
            return null;
          })()}

          {isHoliday ? (
            <div className="text-center py-20 bg-white dark:bg-[#2a2b2f] rounded-2xl shadow-sm dark:shadow-none border border-dashed border-gray-300 dark:border-gray-700">
              <h2 className="text-2xl font-bold text-gray-400 dark:text-gray-500">วันนี้เป็นวันหยุด</h2>
              <p className="text-xl text-indigo-500 dark:text-indigo-400 mt-2 font-semibold">{holidayDescription}</p>
              <p className="text-gray-400 dark:text-gray-500 mt-2">งดการตรวจเช็คกิจกรรมเข้าแถว</p>
            </div>
          ) : (
            <>
              {isLoading && selectedClass && <FlagCeremonyPageSkeleton />}

              {!isLoading && selectedClass && (
                <>
                  {/* Summary Cards */}
                  <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                    <div className="bg-white dark:bg-[#2a2b2f] rounded-2xl p-4 border border-gray-100 dark:border-gray-700 shadow-sm flex items-center justify-between relative group">

                      <div>
                        <p className="text-sm font-medium text-gray-500 dark:text-gray-400">มาเรียน</p>
                        <p className="text-3xl font-bold text-gray-900 dark:text-white mt-1">{attendanceSummary.มา}</p>
                      </div>
                      <div className="w-12 h-12 rounded-xl bg-green-100 dark:bg-green-500/20 flex items-center justify-center text-green-600 dark:text-green-400">
                        <FaCheck className="text-xl" />
                      </div>
                    </div>

                    <div className="bg-white dark:bg-[#2a2b2f] rounded-2xl p-4 border border-gray-100 dark:border-gray-700 shadow-sm flex items-center justify-between relative group">

                      <div>
                        <p className="text-sm font-medium text-gray-500 dark:text-gray-400">มาสาย</p>
                        <p className="text-3xl font-bold text-gray-900 dark:text-white mt-1">{attendanceSummary.สาย}</p>
                      </div>
                      <div className="w-12 h-12 rounded-xl bg-yellow-100 dark:bg-yellow-500/20 flex items-center justify-center text-yellow-600 dark:text-yellow-400">
                        <FaClock className="text-xl" />
                      </div>
                    </div>

                    <div className="bg-white dark:bg-[#2a2b2f] rounded-2xl p-4 border border-gray-100 dark:border-gray-700 shadow-sm flex items-center justify-between relative group">

                      <div>
                        <p className="text-sm font-medium text-gray-500 dark:text-gray-400">ลา</p>
                        <p className="text-3xl font-bold text-gray-900 dark:text-white mt-1">{attendanceSummary.ลา}</p>
                      </div>
                      <div className="w-12 h-12 rounded-xl bg-blue-100 dark:bg-blue-500/20 flex items-center justify-center text-blue-600 dark:text-blue-400">
                        <FaUserSlash className="text-xl" />
                      </div>
                    </div>

                    <div className="bg-white dark:bg-[#2a2b2f] rounded-2xl p-4 border border-gray-100 dark:border-gray-700 shadow-sm flex items-center justify-between relative group">
                      <div className="absolute right-0 top-0 w-24 h-24 bg-red-500/5 rounded-full -mr-6 -mt-6 transition-transform group-hover:scale-110"></div>
                      <div>
                        <p className="text-sm font-medium text-gray-500 dark:text-gray-400">ขาดเรียน</p>
                        <p className="text-3xl font-bold text-gray-900 dark:text-white mt-1">{attendanceSummary.ขาด}</p>
                      </div>
                      <div className="w-12 h-12 rounded-xl bg-red-100 dark:bg-red-500/20 flex items-center justify-center text-red-600 dark:text-red-400">
                        <FaTimes className="text-xl" />
                      </div>
                    </div>
                  </div>

                  {/* Sticky Action Bar */}
                  <div className="flex justify-between items-center bg-white dark:bg-[#2a2b2f] p-4 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 sticky top-[70px] z-10 backdrop-blur-md bg-white/90 dark:bg-[#2a2b2f]/90">
                    <div className="flex items-center gap-2">
                      <div className="bg-indigo-100 dark:bg-indigo-900/30 p-2 rounded-lg text-indigo-600 dark:text-indigo-400">
                        <FaUserGraduate />
                      </div>
                      <span className="text-gray-600 dark:text-gray-300 font-medium">
                        นักเรียนทั้งหมด <span className="text-indigo-600 dark:text-indigo-400 font-bold text-lg">{students.length}</span> คน
                      </span>
                    </div>

                    {/* Right: Actions */}
                    <div className="flex items-center gap-2">
                      <button
                        onClick={handleSaveAll}
                        disabled={isLoading}
                        className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-2.5 px-6 rounded-xl shadow-lg shadow-indigo-500/30 hover:shadow-indigo-500/50 transition-all duration-200 flex items-center gap-2 disabled:bg-gray-400 disabled:shadow-none transform active:scale-95"
                      >
                        <FaCheck /> {isAlreadySaved ? 'อัปเดตข้อมูล' : 'บันทึกข้อมูล'}
                      </button>
                    </div>
                  </div>

                  {/* Student Grid */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 sm:gap-6">
                    {students.map((student) => (
                      <div
                        key={student.id}
                        className={`relative group rounded-2xl p-4 sm:p-6 border-2 transition-all duration-300 hover:shadow-lg ${getStatusStyle(student.attendanceStatus)}`}
                      >
                        <div className="flex flex-row sm:flex-col items-center gap-4">
                          {/* Avatar with Status Dot */}
                          <div className="relative flex-shrink-0">
                            <Link to={`/school/${schoolId}/students/view/${student.id}`} className="block relative">
                              <div className="absolute -inset-1 bg-gradient-to-br from-indigo-500 to-purple-500 rounded-full opacity-0 group-hover:opacity-20 transition-opacity blur"></div>
                              <img
                                src={student.profileImageUrl || `https://ui-avatars.com/api/?name=${student.name}&background=random`}
                                alt={student.name}
                                className="relative w-16 h-16 sm:w-24 sm:h-24 rounded-full object-cover border-4 border-white dark:border-[#2a2b2f] shadow-sm transition-transform group-hover:scale-105"
                              />
                            </Link>
                            <div className={`absolute bottom-0 right-0 sm:bottom-1 sm:right-1 w-5 h-5 sm:w-6 sm:h-6 rounded-full border-2 sm:border-4 border-white dark:border-[#2a2b2f] shadow-sm ${student.attendanceStatus === 'มา' ? 'bg-green-500' :
                              student.attendanceStatus === 'สาย' ? 'bg-yellow-500' :
                                student.attendanceStatus === 'ลา' ? 'bg-blue-500' : 'bg-red-500'
                              }`}></div>
                          </div>

                          {/* Info */}
                          <div className="flex-grow min-w-0 text-left sm:text-center">
                            <Link to={`/school/${schoolId}/students/view/${student.id}`} className="block hover:text-indigo-500 dark:hover:text-indigo-400 transition-colors">
                              <h3 className="font-bold text-lg sm:text-xl text-gray-900 dark:text-white truncate" title={student.name}>
                                {student.name}
                              </h3>
                            </Link>
                            <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5 sm:mt-2">
                              <span className="inline-block bg-white/50 dark:bg-black/20 px-2 py-0.5 rounded-md font-mono text-xs sm:text-sm">
                                {student.studentId}
                              </span>
                            </p>
                          </div>

                          {/* Controls */}
                          <div className="w-full grid grid-cols-4 gap-2 mt-4 sm:mt-2">
                            {statusOptions.map(opt => {
                              // Logic for locking:
                              // If student is on leave (from LeaveRequestPage), lock everything to 'Leave'.
                              const isLocked = student.isLeave;

                              return (
                                <button
                                  key={opt.status}
                                  onClick={() => !isLocked && handleStatusChange(student.id, opt.status)}
                                  disabled={isLocked}
                                  className={`
                                flex flex-col items-center justify-center py-2 rounded-xl text-xs sm:text-sm font-bold transition-all duration-200 relative
                                ${student.attendanceStatus === opt.status
                                      ? `${opt.activeClass} ring-2 ring-offset-1 ring-offset-white dark:ring-offset-[#2a2b2f] transform scale-105 shadow-md`
                                      : 'bg-white/50 dark:bg-black/20 text-gray-400 hover:bg-white dark:hover:bg-gray-700 hover:text-gray-600 dark:hover:text-gray-300'
                                    }
                                disabled:opacity-50 disabled:cursor-not-allowed
                              `}
                                >
                                  {opt.label}
                                  {isLocked && student.attendanceStatus === opt.status && (
                                    <FaLock className="absolute top-0.5 right-1 w-3 h-3 text-current opacity-70" />
                                  )}
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </>
              )}

              {error && (
                <div className="text-center py-10 bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500 rounded-xl">
                  <p className="text-lg text-red-400">{error}</p>
                </div>
              )}

              {!selectedClass && !isLoading && (
                <div className="text-center py-20 bg-white dark:bg-[#2a2b2f] rounded-2xl shadow-sm dark:shadow-none border border-dashed border-gray-300 dark:border-gray-700">
                  <h2 className="text-2xl font-bold text-gray-400 dark:text-gray-500">กรุณาเลือกห้องเรียน</h2>
                  <p className="text-gray-400 dark:text-gray-500 mt-2">เพื่อเริ่มการเช็คชื่อกิจกรรมเข้าแถว</p>
                </div>
              )}
            </>
          )}

        </div>
      </div>
    </MainLayout>
  );
};

export default FlagCeremonyPage;