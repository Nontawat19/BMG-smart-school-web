import { useCallback, useEffect, useState } from "react";
import { useSelector } from "react-redux";
import { RootState } from "@/store";
import { auth, firestore } from "@/firebase";
import { useEffectiveSchoolId } from "@/hooks/useEffectiveSchool";
import {
  addDoc,
  collection,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  Timestamp,
} from "firebase/firestore";
import { getRoomType, getRoomTitle, parseStudentDirectRoomId, getChatSchoolId, markRoomRead, ChatMessageReplyTo, getMessageReadInfo, MessageReadInfo, SCHOOL_CHAT_ROOM_ID, toMillis } from "./chatConstants";
import { isAttendanceEntryOnly } from "@/utils/attendanceRoles";

// รูปโปรไฟล์แคชง่ายๆ กันยิง getDoc อ่าน school-settings/{schoolId} ซ้ำทุกครั้งที่เปิดห้องแชทของ
// นักเรียน/ผู้ปกครองคนละคนในเซสชันเดียวกัน (โลโก้โรงเรียนมีค่าเดียวต่อโรงเรียน ไม่เปลี่ยนบ่อย)
const schoolLogoCache = new Map<string, string>();
const getSchoolLogoUrl = async (schoolId: string): Promise<string> => {
  if (schoolLogoCache.has(schoolId)) return schoolLogoCache.get(schoolId)!;
  try {
    let snap = await getDoc(doc(firestore, "school-settings", schoolId));
    let url = snap.exists() ? (snap.data().logoUrl || "") : "";
    if (!url) {
      snap = await getDoc(doc(firestore, "schools", schoolId));
      url = snap.exists() ? (snap.data().logoUrl || "") : "";
    }
    if (url) schoolLogoCache.set(schoolId, url);
    return url;
  } catch (error) {
    console.error("Error loading school logo:", error);
    return "";
  }
};

import { AttendanceNotificationPayload } from "@/pages/Notifications/AttendanceNotificationCard";

export interface ChatMessage {
  id: string;
  senderUid: string;
  senderName: string;
  senderRole: "teacher" | "staff" | "parent" | "student";
  senderPhotoUrl?: string;
  // studentId ที่ผูกกับผู้ส่ง (ของตัวเองถ้าเป็นนักเรียน, ของลูกถ้าเป็นผู้ปกครอง) — ใช้แทน senderUid
  // ตอนเช็คว่า "ข้อความนี้ของฉันไหม" สำหรับผู้ปกครอง/นักเรียน เพราะ senderUid (Firebase anonymous
  // auth) เปลี่ยนทุกครั้งที่ล็อกอินใหม่ แต่ studentId คงที่เสมอ — ดู isMine ด้านล่าง
  senderStableId?: string;
  type?: "text" | "sticker" | "gif" | "image" | "attendance" | "document";
  text?: string;
  stickerId?: string;
  gifUrl?: string;
  imageUrl?: string;
  attendance?: AttendanceNotificationPayload;
  pdfUrl?: string;
  documentName?: string;
  documentNo?: string;
  documentDate?: string;
  documentCategory?: string;
  documentId?: string;
  documentLink?: string;
  replyTo?: ChatMessageReplyTo;
  // path เต็มของไฟล์ใน Firebase Storage (ไม่ใช่ download URL) เก็บไว้เพื่อให้ Cloud Function
  // cleanupExpiredChatImages ลบไฟล์จริงออกจาก Storage ได้ตอนครบอายุ 1 ปีการศึกษา
  storagePath?: string;
  createdAt: Timestamp | null;
}

export type RoomStatus = "pending" | "approved" | "rejected" | null;

interface ParentChild {
  schoolId: string;
  studentDocId: string;
  name: string;
  profileImageUrl?: string;
}

const getParentSession = (): { children: ParentChild[] } | null => {
  try {
    const raw = localStorage.getItem("parentSession");
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
};

const getStudentSession = (): { schoolId: string; studentId: string } | null => {
  try {
    const raw = localStorage.getItem("studentSession");
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
};

const personDisplayName = (data: any) => `${data.title || ""}${data.firstName || ""} ${data.lastName || ""}`.trim();
const personPhotoUrl = (data: any): string => data?.profileImageUrl || data?.profileUrl || "";

/**
 * ตรวจสอบว่าเป็นแอคเคาท์ที่เป็น "เจ้าหน้าที่ลงเวลา" หรือไม่ (เพื่อไม่ให้นับรวมกับครูในแชท)
 * เช่น student_attendance, teacher_attendance, school_attendance, บัญชี kiosk/rfid/cam
 */
export const isAttendanceOfficerAccount = (data: any): boolean => {
  if (!data) return false;
  if (data.personnelType === "user") return true;

  const rawRole = data.role || data.roles;
  const roles: string[] = Array.isArray(rawRole)
    ? rawRole.filter((r): r is string => typeof r === "string").map((r) => r.toLowerCase())
    : typeof rawRole === "string"
    ? [rawRole.toLowerCase()]
    : [];

  if (isAttendanceEntryOnly(roles)) return true;
  if (
    roles.some((r) => r === "student_attendance" || r === "teacher_attendance" || r === "school_attendance") &&
    !roles.includes("teacher")
  ) {
    return true;
  }

  const name = String(data.name || data.fullName || data.displayName || "").toLowerCase();
  const firstName = String(data.firstName || "").toLowerCase();
  const lastName = String(data.lastName || "").toLowerCase();
  const id = String(data.id || data.uid || "").toLowerCase();
  const teacherId = String(data.teacherId || "").toLowerCase();
  const email = String(data.email || "").toLowerCase();

  return (
    /attendance|ลงเวลา|att_cam|att_rfid/.test(name) ||
    /attendance|ลงเวลา/.test(firstName) ||
    /attendance|ลงเวลา/.test(lastName) ||
    /attendance|att_cam|att_rfid/.test(id) ||
    /attendance|att_cam|att_rfid/.test(teacherId) ||
    /attendance/.test(email)
  );
};

/**
 * Logic ของห้องแชท 1 ห้อง (ฟัง realtime + ส่งข้อความ + สถานะขออนุญาต) แยกออกมาเป็น hook กลาง
 * ให้ ChatRoomPage.tsx (แบบเต็มหน้า) และ FloatingChatWindow.tsx (แบบลอยตัว) ใช้ร่วมกัน
 *
 * @param active ห้องนี้กำลังถูกเปิดดูอยู่จริงไหม (false เมื่อหน้าต่างลอยตัวถูกย่อ) — ใช้กำหนดว่า
 * ควรมาร์คว่า "อ่านแล้ว" (เขียน readBy) หรือไม่ ป้องกันไม่ให้ห้องที่ย่ออยู่ถูกนับว่าอ่านแล้วทั้งที่ไม่ได้เห็น
 */
export const useChatMessages = (roomId: string, active: boolean = true) => {
  const currentUser = useSelector((state: RootState) => state.auth.user);
  const schoolId = getChatSchoolId(useEffectiveSchoolId());
  const userType = localStorage.getItem("currentUserType");
  const isParentSession = userType === "parent";
  const isStudentSession = userType === "student";

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [otherPartyName, setOtherPartyName] = useState("");
  const [otherPartyPhotoUrl, setOtherPartyPhotoUrl] = useState("");
  const [groupMemberCount, setGroupMemberCount] = useState(0);
  const [onlineTeacherCount, setOnlineTeacherCount] = useState(1);
  const [totalTeacherCount, setTotalTeacherCount] = useState(0);
  const [isOtherPartyOnline, setIsOtherPartyOnline] = useState(false);
  const [targetPartyUid, setTargetPartyUid] = useState("");
  const [isDeptMember, setIsDeptMember] = useState<boolean | null>(null);
  const [roomStatus, setRoomStatus] = useState<RoomStatus>(null);
  const [isSending, setIsSending] = useState(false);

  const roomType = getRoomType(roomId);
  const parentStudentId = roomType === "parent" ? roomId.replace(/^parent-/, "") : "";
  const homeroomStudentId = roomType === "student-homeroom" ? roomId.replace(/^student-homeroom-/, "") : "";
  const directParts = roomType === "student-direct" ? parseStudentDirectRoomId(roomId) : null;
  const isOneOnOneRoom = roomType === "parent" || roomType === "student-direct" || roomType === "student-homeroom";

  // ข้อมูลฝั่งตรงข้าม (รูป+ชื่อ สำหรับหัวข้อห้อง)
  // - parent-* : ผู้ปกครองเห็น "ครูประจำชั้น [ระดับชั้น]" + โลโก้โรงเรียน (ไม่ระบุชื่อครูคนใดคนหนึ่ง
  //   เพราะห้องนี้อาจมีครูประจำชั้นมากกว่า 1 คนตอบแชท ตัวตนครูแต่ละคนไปโชว์ที่ senderName/senderPhotoUrl
  //   ของแต่ละข้อความแทน) ส่วนครูเห็นรูป+ชื่อนักเรียน ขึ้นต้นด้วย "ผู้ปกครอง" (ผู้ปกครองไม่มีรูปแยกในระบบ)
  // - student-homeroom-* : คู่กับ parent-* แต่ฝั่งนักเรียนเข้าเอง หลักการเดียวกันทุกอย่าง
  // - student-direct-* : แชทเลือกครูเอง แสดงรูป+ชื่อของอีกฝ่ายตรงๆ ไม่มีการ "ปิดบัง" ตัวตน
  useEffect(() => {
    if (!schoolId) return;
    if (roomType === "school" || roomId === SCHOOL_CHAT_ROOM_ID) {
      getSchoolLogoUrl(schoolId).then((url) => {
        if (url) setOtherPartyPhotoUrl(url);
      });
    } else if ((roomType === "parent" && parentStudentId) || (roomType === "student-homeroom" && homeroomStudentId)) {
      const studentId = roomType === "parent" ? parentStudentId : homeroomStudentId;
      const viewerIsFamilySide = isParentSession || isStudentSession;
      if (!viewerIsFamilySide) {
        setTargetPartyUid(studentId);
      }
      getDoc(doc(firestore, "school-settings", schoolId, "students", studentId)).then(async (snap) => {
        if (!snap.exists()) return;
        const student = snap.data();
        if (viewerIsFamilySide) {
          setOtherPartyName(`ครูประจำชั้น${student.classLevel ? ` ${student.classLevel}` : ""}`);
          setOtherPartyPhotoUrl(await getSchoolLogoUrl(schoolId));
          const tUid = student.homeroomTeacherUid || student.advisorUid || student.teacherUid || "";
          if (tUid) setTargetPartyUid(tUid);
        } else {
          setOtherPartyName(roomType === "parent" ? `ผู้ปกครอง${personDisplayName(student)}` : personDisplayName(student));
          setOtherPartyPhotoUrl(personPhotoUrl(student));
        }
      }).catch((error) => console.error("Error loading student name for chat room:", error));
    } else if (roomType === "student-direct" && directParts) {
      const targetId = isStudentSession ? directParts.teacherUid : directParts.studentId;
      setTargetPartyUid(targetId);
      const targetCollection = isStudentSession ? "teachers" : "students";
      getDoc(doc(firestore, "school-settings", schoolId, targetCollection, targetId)).then((snap) => {
        if (!snap.exists()) return;
        const data = snap.data();
        setOtherPartyName(personDisplayName(data));
        setOtherPartyPhotoUrl(personPhotoUrl(data));
      }).catch((error) => console.error("Error loading other party name for chat room:", error));
    }
  }, [roomType, schoolId, roomId, parentStudentId, homeroomStudentId, directParts, isStudentSession, isParentSession]);

  const [roomReadBy, setRoomReadBy] = useState<Record<string, any>>({});
  const [myGroupChildId, setMyGroupChildId] = useState<string | null>(null);

  const currentRole: "teacher" | "staff" | "parent" | "student" = isParentSession
    ? "parent"
    : isStudentSession
    ? "student"
    : (roomType === "parent" || roomType === "student-direct" || roomType === "student-homeroom" ? "teacher" : "staff");

  const currentStableId = isParentSession
    ? (parentStudentId || myGroupChildId || "")
    : isStudentSession
    ? (getStudentSession()?.studentId || "")
    : (currentUser?.uid || "");

  const currentSenderUid = auth.currentUser?.uid || currentUser?.uid || (isParentSession ? `parent_${currentStableId}` : isStudentSession ? `student_${currentStableId}` : "");

  // ฟังเอกสารห้อง chatRooms/{roomId} เพื่อดึงสถานะห้อง, สมาชิก, และข้อมูล readBy สำหรับฟีเจอร์ "อ่านแล้ว"
  useEffect(() => {
    if (!schoolId || !roomId) {
      setRoomStatus(null);
      setRoomReadBy({});
      return;
    }
    if (roomType === "department") setIsDeptMember(null);
    const unsub = onSnapshot(doc(firestore, "school-settings", schoolId, "chatRooms", roomId), (snap) => {
      if (!snap.exists()) {
        setRoomReadBy({});
        return;
      }
      const data = snap.data();
      const rawReadBy: Record<string, any> = data.readBy && typeof data.readBy === "object" ? { ...data.readBy } : {};
      Object.keys(data).forEach((k) => {
        if (k.startsWith("readBy.")) {
          const subKey = k.replace(/^readBy\./, "");
          rawReadBy[subKey] = data[k];
        }
      });
      setRoomReadBy(rawReadBy);
      if (roomType === "school" || roomId === SCHOOL_CHAT_ROOM_ID) {
        if (data.title || data.name || data.roomName) {
          setOtherPartyName(data.title || data.name || data.roomName);
        }
      }
      if (roomType === "department") {
        const memberUids = (data.memberUids || []) as string[];
        setIsDeptMember(memberUids.includes(currentSenderUid));
        setTotalTeacherCount(memberUids.length);
        if (data.title || data.name) {
          setOtherPartyName(data.title || data.name);
        }
        return;
      }
      if (roomType === "student-direct") {
        setRoomStatus(data.status as RoomStatus);
      } else if (roomType === "group") {
        setOtherPartyName(data.groupName || data.title || "แชทกลุ่ม");
        setGroupMemberCount((data.memberStudentIds || []).length);
      }
    }, (error) => {
      console.error("Error listening to room status & readBy:", error);
      if (roomType === "department") setIsDeptMember(false);
    });
    return () => unsub();
  }, [roomType, schoolId, roomId, currentSenderUid]);

  // เช็คว่าผู้ใช้งานปัจจุบันที่เปิดแชทเป็นเจ้าหน้าที่ลงเวลาหรือไม่
  const isCurrentUserAttendanceStaff = isAttendanceOfficerAccount({
    personnelType: currentUser?.personnelType,
    role: currentUser?.role,
    fullName: currentUser?.fullName,
    email: currentUser?.email,
    uid: currentSenderUid,
  });

  // โหลดจำนวนครูทั้งหมดในโรงเรียนสำหรับห้องแชทหลักของโรงเรียน (คัดกรองไม่นับรวมแอคเคาท์เจ้าหน้าที่ลงเวลา)
  useEffect(() => {
    if (!schoolId) return;
    let cancelled = false;
    if (roomType === "school" || roomId === SCHOOL_CHAT_ROOM_ID) {
      getDocs(collection(firestore, "school-settings", schoolId, "teachers")).then((snap) => {
        if (!cancelled) {
          const validTeachers = snap.docs.filter((d) => {
            const data = { id: d.id, ...d.data() };
            return !isAttendanceOfficerAccount(data);
          });
          setTotalTeacherCount(validTeachers.length);
        }
      }).catch((e) => console.error("Error fetching total teachers count:", e));
    }
    return () => { cancelled = true; };
  }, [schoolId, roomType, roomId]);

  // ถ้าเป็นฝั่งผู้ปกครอง/นักเรียน แล้วยังไม่มี targetPartyUid (ครู)
  // ให้ดู senderUid ของข้อความล่าสุดที่ครูส่งในห้องนี้ (ฟรี ไม่เสียค่าอ่านเพิ่ม)
  useEffect(() => {
    if (!targetPartyUid && (isParentSession || isStudentSession) && messages.length > 0) {
      const teacherMsg = [...messages].reverse().find(
        (m) => m.senderRole === "teacher" || m.senderRole === "staff"
      );
      if (teacherMsg?.senderUid) {
        setTargetPartyUid(teacherMsg.senderUid);
      }
    }
  }, [targetPartyUid, isParentSession, isStudentSession, messages]);

  // สำหรับแชท 1-on-1 (ผู้ปกครอง, นักเรียน, ครู): ตรวจสถานะออนไลน์แบบ Multi-Layer ประหยัดค่าอ่านเขียนที่สุด
  // ชั้นที่ 1: ตรวจจาก roomReadBy (0 Read เพิ่มเติม - ฟรียกแผง)
  // ชั้นที่ 2: ตรวจจาก timestamp ข้อความล่าสุดของอีกฝ่าย (0 Read เพิ่มเติม)
  // ชั้นที่ 3: Single-Doc Listener doc("presence", targetPartyUid) เจาะจงเอกสารเดียว
  useEffect(() => {
    if (!schoolId || !isOneOnOneRoom) {
      return;
    }

    let presenceActive = false;
    let unsubPresence: (() => void) | null = null;

    const checkStatus = () => {
      const cutoff = Date.now() - 6 * 60 * 1000; // นับ active ภายใน 6 นาที (สอดคล้องกับรอบ Heartbeat 4 นาที)

      // 1. ตรวจจาก roomReadBy (ที่ได้จาก onSnapshot เอกสารห้องแชทอยู่แล้ว ไม่เสียค่าอ่านเพิ่มแม้แต่ 1 read!)
      let readByActive = false;
      if (roomReadBy && typeof roomReadBy === "object") {
        for (const [key, val] of Object.entries(roomReadBy)) {
          if (
            key === currentSenderUid ||
            key === `stable_${currentStableId}` ||
            key === `role_${currentRole}`
          ) {
            continue;
          }
          const ms = toMillis(val);
          if (ms && ms > cutoff) {
            if (isParentSession || isStudentSession) {
              const isFamilyKey =
                key.startsWith("role_student") ||
                key.startsWith("role_parent") ||
                key.startsWith("student_") ||
                key.startsWith("parent_") ||
                (currentStableId && key.includes(currentStableId));
              if (!isFamilyKey) {
                readByActive = true;
                break;
              }
            } else {
              const isFamilyKey =
                key.startsWith("role_student") ||
                key.startsWith("role_parent") ||
                key.startsWith("student_") ||
                key.startsWith("parent_") ||
                (targetPartyUid && key.includes(targetPartyUid));
              if (isFamilyKey) {
                readByActive = true;
                break;
              }
            }
          }
        }
      }

      // 2. ตรวจจากข้อความล่าสุดที่อีกฝ่ายส่งมา (ได้จาก onSnapshot messages อยู่แล้ว ไม่เสียค่าอ่านเพิ่มแม้แต่ 1 read!)
      let messageActive = false;
      const otherPartyMsg = [...messages].reverse().find((m) => {
        if (isParentSession || isStudentSession) {
          return m.senderRole === "teacher" || m.senderRole === "staff";
        }
        return m.senderRole === "parent" || m.senderRole === "student";
      });
      if (otherPartyMsg?.createdAt) {
        const msgMs = toMillis(otherPartyMsg.createdAt);
        if (msgMs && msgMs > cutoff) {
          messageActive = true;
        }
      }

      setIsOtherPartyOnline(presenceActive || readByActive || messageActive);
    };

    // 3. ฟังเอกสาร presence ของ targetPartyUid เจาะจงเพียงคนเดียว
    if (targetPartyUid) {
      unsubPresence = onSnapshot(doc(firestore, "school-settings", schoolId, "presence", targetPartyUid), (snap) => {
        if (snap.exists()) {
          const data = snap.data();
          const ms = toMillis(data.lastActive);
          const cutoff = Date.now() - 6 * 60 * 1000;
          presenceActive = !!(ms && ms > cutoff);
        } else {
          presenceActive = false;
        }
        checkStatus();
      }, () => {
        presenceActive = false;
        checkStatus();
      });
    }

    checkStatus();
    const timer = setInterval(checkStatus, 30000);

    return () => {
      if (unsubPresence) unsubPresence();
      clearInterval(timer);
    };
  }, [schoolId, isOneOnOneRoom, targetPartyUid, roomReadBy, isParentSession, isStudentSession, currentSenderUid, currentStableId, currentRole, messages]);

  // ตรวจจำนวนครูที่ออนไลน์ในโรงเรียน (ไม่นับรวมแอคเคาท์เจ้าหน้าที่ลงเวลา)
  // OPTIMIZATION ขั้นสูงสุด: ใช้ getDocs ครั้งเดียวตอนเข้าห้อง และรีเฟรชทุก 5 นาที (หลีกเลี่ยง onSnapshot ทั้ง collection ที่เปลือง Reads)
  useEffect(() => {
    if (!schoolId) return;
    const isSchoolOrDeptRoom = roomType === "school" || roomId === SCHOOL_CHAT_ROOM_ID || roomType === "department";
    if (!isSchoolOrDeptRoom) return;

    let cancelled = false;

    const fetchTeacherPresence = () => {
      getDocs(collection(firestore, "school-settings", schoolId, "presence")).then((snap) => {
        if (cancelled) return;
        const cutoff = Date.now() - 6 * 60 * 1000;
        let count = 0;
        snap.docs.forEach((d) => {
          const data = d.data();
          if (isAttendanceOfficerAccount(data)) return;
          if (data.role && data.role !== "teacher") return;

          const lastActiveMs = toMillis(data.lastActive);
          if (lastActiveMs && lastActiveMs > cutoff) {
            count++;
          }
        });
        const effectiveCount = !isCurrentUserAttendanceStaff && !isParentSession && !isStudentSession
          ? Math.max(1, count)
          : count;
        setOnlineTeacherCount(effectiveCount);
      }).catch(() => {
        if (!cancelled) {
          setOnlineTeacherCount(!isCurrentUserAttendanceStaff && !isParentSession && !isStudentSession ? 1 : 0);
        }
      });
    };

    fetchTeacherPresence();
    const interval = setInterval(fetchTeacherPresence, 300000); // รีเฟรชทุก 5 นาที

    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [schoolId, roomType, roomId, isCurrentUserAttendanceStaff, isParentSession, isStudentSession]);

  useEffect(() => {
    if (!schoolId || !roomId) return;
    const q = query(
      collection(firestore, "school-settings", schoolId, "chatRooms", roomId, "messages"),
      orderBy("createdAt", "asc")
    );
    const unsub = onSnapshot(q, (snapshot) => {
      setMessages(snapshot.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<ChatMessage, "id">) })));
    }, (error) => {
      console.error("Error listening to chat messages:", error);
    });
    return () => unsub();
  }, [schoolId, roomId]);

  // มาร์คว่าอ่านแล้วทันทีเมื่อเปิดดูห้องแชท (active) หรือมีข้อความเข้ามา
  useEffect(() => {
    if (!active || !schoolId || !roomId) return;
    markRoomRead(schoolId, roomId, currentSenderUid, currentRole, currentStableId);
  }, [active, schoolId, roomId, messages.length, currentSenderUid, currentRole, currentStableId]);

  // มาร์คเมื่อสลับกลับมาที่แท็บ/หน้าต่างแชท (window focus)
  useEffect(() => {
    if (!active || !schoolId || !roomId) return;
    const handleFocus = () => {
      markRoomRead(schoolId, roomId, currentSenderUid, currentRole, currentStableId);
    };
    window.addEventListener("focus", handleFocus);
    return () => window.removeEventListener("focus", handleFocus);
  }, [active, schoolId, roomId, currentSenderUid, currentRole, currentStableId]);

  // ห้องกลุ่ม (group) ไม่ได้ผูกกับลูกคนใดคนหนึ่งตรงๆ ผ่าน roomId (ต่างจาก parent-{studentId})
  // ผู้ปกครองอาจมีลูกหลายคน แต่ถูกเพิ่มเข้ากลุ่มนี้ผ่านลูกคนใดคนหนึ่งเท่านั้น ต้องหาว่าเป็นคนไหนจาก field
  // groupChats ที่ครูเขียนไว้ในเอกสารนักเรียนตอนเพิ่มเข้ากลุ่ม — แคชไว้เป็น state (ไม่ใช่หาใหม่ทุกครั้งที่
  // ส่งข้อความ) เพราะต้องใช้ทั้งตอนส่ง (resolveSender) และตอนเช็คว่าข้อความไหน "เป็นของฉัน" (isMine)
  useEffect(() => {
    if (!isParentSession || roomType !== "group" || !schoolId) {
      setMyGroupChildId(null);
      return;
    }
    const session = getParentSession();
    if (!session?.children.length) return;
    let cancelled = false;
    (async () => {
      for (const c of session.children) {
        try {
          const snap = await getDoc(doc(firestore, "school-settings", schoolId, "students", c.studentDocId));
          const groupChats = (snap.data()?.groupChats || []) as { roomId: string }[];
          if (groupChats.some((g) => g.roomId === roomId)) {
            if (!cancelled) setMyGroupChildId(c.studentDocId);
            return;
          }
        } catch (error) { console.error("Error resolving parent's child for group chat:", error); }
      }
    })();
    return () => { cancelled = true; };
  }, [isParentSession, roomType, schoolId, roomId]);

  const resolveSender = useCallback(async () => {
    if (isParentSession) {
      const session = getParentSession();
      const child = session?.children.find((c) => c.studentDocId === parentStudentId)
        || (roomType === "group" && myGroupChildId ? session?.children.find((c) => c.studentDocId === myGroupChildId) : undefined);
      return {
        senderUid: auth.currentUser?.uid || "unknown-parent",
        senderStableId: child?.studentDocId || "",
        // ผู้ปกครองไม่มีรูปโปรไฟล์แยกในระบบ ใช้รูป+ชื่อนักเรียนแทนเป็นตัวบอกว่าข้อความนี้มาจากผู้ปกครองของใคร
        senderName: child ? `ผู้ปกครอง${child.name}` : "ผู้ปกครอง",
        senderPhotoUrl: child?.profileImageUrl || "",
        senderRole: "parent" as const,
      };
    }
    if (isStudentSession) {
      const session = getStudentSession();
      let name = "นักเรียน";
      let photoUrl = "";
      if (session && schoolId) {
        try {
          const snap = await getDoc(doc(firestore, "school-settings", schoolId, "students", session.studentId));
          if (snap.exists()) {
            const data = snap.data();
            name = personDisplayName(data);
            photoUrl = personPhotoUrl(data);
          }
        } catch (error) { console.error("Error loading student name:", error); }
      }
      return {
        senderUid: auth.currentUser?.uid || "unknown-student",
        senderStableId: session?.studentId || "",
        senderName: name,
        senderPhotoUrl: photoUrl,
        senderRole: "student" as const,
      };
    }
    return {
      senderUid: currentUser?.uid || "unknown",
      senderStableId: currentUser?.uid || "",
      // state.auth.user เก็บชื่อไว้ที่ field "fullName" ไม่ใช่ "displayName" (ดู authSlice.ts) — ใช้ผิด
      // field มาก่อนหน้านี้ ทำให้ตกไปใช้ fallback "เจ้าหน้าที่" เสมอทั้งที่มีชื่อจริงอยู่แล้ว
      senderName: (currentUser as any)?.fullName || "เจ้าหน้าที่",
      senderPhotoUrl: (currentUser as any)?.profileUrl || "",
      senderRole: (roomType === "parent" || roomType === "student-direct" || roomType === "student-homeroom" ? "teacher" : "staff") as "teacher" | "staff",
    };
  }, [isParentSession, isStudentSession, parentStudentId, currentUser, roomType, schoolId, roomId, myGroupChildId]);

  // เขียนข้อความ + อัพเดตเอกสารห้อง (lastMessageText/At/Sender + readBy ของตัวเอง) ใช้ร่วมกันทั้ง
  // ข้อความตัวหนังสือ/สติกเกอร์/GIF เพื่อไม่ให้ตรรกะการอัพเดตห้องซ้ำกัน 3 ที่
  const writeMessage = useCallback(async (
    payload: Record<string, unknown>,
    lastMessagePreview: string,
    replyTo?: ChatMessageReplyTo | null
  ) => {
    if (!schoolId || !roomId || isSending) return;
    if (roomType === "student-direct" && roomStatus !== "approved") return;
    if (roomType === "department" && !isDeptMember) return;
    setIsSending(true);
    const sender = await resolveSender();
    try {
      const messageData: Record<string, unknown> = {
        ...sender,
        ...payload,
        createdAt: serverTimestamp(),
      };
      if (replyTo) {
        messageData.replyTo = {
          id: replyTo.id || "",
          senderName: replyTo.senderName || "ผู้ใช้งาน",
          text: replyTo.text || "ข้อความ",
          type: replyTo.type || "text",
        };
      }
      await addDoc(collection(firestore, "school-settings", schoolId, "chatRooms", roomId, "messages"), messageData);
      await setDoc(doc(firestore, "school-settings", schoolId, "chatRooms", roomId), {
        lastMessageText: lastMessagePreview,
        lastMessageAt: serverTimestamp(),
        lastMessageSenderUid: sender.senderUid,
        readBy: {
          [sender.senderUid]: serverTimestamp(),
          [`role_${sender.senderRole}`]: serverTimestamp(),
          ...(sender.senderStableId ? { [`stable_${sender.senderStableId}`]: serverTimestamp() } : {}),
        },
      }, { merge: true });
    } catch (error) {
      console.error("Error sending chat message:", error);
    } finally {
      setIsSending(false);
    }
  }, [schoolId, roomId, isSending, resolveSender, roomType, roomStatus, isDeptMember]);

  const sendMessage = useCallback(async (text: string, replyTo?: ChatMessageReplyTo | null) => {
    const trimmed = text.trim();
    if (!trimmed) return;
    await writeMessage({ type: "text", text: trimmed }, trimmed, replyTo);
  }, [writeMessage]);

  const sendSticker = useCallback(async (stickerId: string, replyTo?: ChatMessageReplyTo | null) => {
    await writeMessage({ type: "sticker", stickerId }, "[สติกเกอร์]", replyTo);
  }, [writeMessage]);

  const sendGif = useCallback(async (gifUrl: string, replyTo?: ChatMessageReplyTo | null) => {
    await writeMessage({ type: "gif", gifUrl }, "[GIF]", replyTo);
  }, [writeMessage]);

  const sendImage = useCallback(async (imageUrl: string, storagePath: string, replyTo?: ChatMessageReplyTo | null) => {
    await writeMessage({ type: "image", imageUrl, storagePath }, "[รูปภาพ]", replyTo);
  }, [writeMessage]);

  const sendDocument = useCallback(async (docData: {
    pdfUrl: string;
    documentName: string;
    documentNo?: string;
    documentDate?: string;
    documentCategory?: string;
    documentId?: string;
    documentLink?: string;
  }, replyTo?: ChatMessageReplyTo | null) => {
    await writeMessage({
      type: "document",
      pdfUrl: docData.pdfUrl,
      documentName: docData.documentName,
      documentNo: docData.documentNo || "",
      documentDate: docData.documentDate || "",
      documentCategory: docData.documentCategory || "เอกสาร",
      documentId: docData.documentId || "",
      documentLink: docData.documentLink || "",
    }, `[เอกสาร] ${docData.documentName}`, replyTo);
  }, [writeMessage]);

  // เช็คว่า "ข้อความนี้เป็นของฉันไหม" — ครู/เจ้าหน้าที่ใช้ senderUid ตรงๆ ได้เลย (Firebase Auth จริง
  // uid คงที่ไม่เปลี่ยน) แต่ผู้ปกครอง/นักเรียนใช้ anonymous auth ที่ uid เปลี่ยนได้ทุกครั้งที่ล็อกอินใหม่
  // (ดู comment ที่ LoginPage.tsx) เทียบ uid ตรงๆ เลยไม่น่าเชื่อถือข้ามเซสชัน จึงต้องใช้เกณฑ์อื่นแทน:
  // - ห้อง parent-*/student-homeroom-*/student-direct-* ผูกกับครอบครัวเดียวอยู่แล้ว (มีนักเรียน/
  //   ผู้ปกครองได้แค่ฝั่งเดียวต่อห้อง) เช็คแค่ role ตรงกับฝั่งที่กำลังดูอยู่ก็พอ ถูกเสมอไม่ว่า uid จะเปลี่ยน
  //   กี่รอบ ใช้ได้แม้กับข้อความเก่าที่ส่งไปก่อนจะมี field senderStableId ด้วย
  // - ห้อง group-* มีผู้ปกครองหลายครอบครัวปนกัน ต้องเทียบ senderStableId (studentId ของลูก) แทน
  //   ข้อความเก่าก่อนมี field นี้ fallback ไปเทียบชื่อที่แสดงแทน (แม่นยำน้อยกว่าแต่ดีกว่าไม่เช็คเลย)
  const isMine = useCallback((msg: ChatMessage): boolean => {
    // 📌 เอกสาร/ข้อความที่ ผอ. เกษียณมอบหมายงานส่งมาจากระบบสารบรรณ ให้แสดงอยู่ฝั่งซ้ายเสมอ (งานส่งเข้ามาหาผู้ใช้)
    if (
      msg.documentCategory === "งานมอบหมาย (ผอ.)" ||
      msg.senderUid === "director-official" ||
      msg.senderUid === "director" ||
      (typeof msg.text === "string" && (msg.text.includes("ผอ. มอบหมายงาน") || msg.text.includes("ข้อสั่งการ:"))) ||
      (msg.type === "document" && (msg.senderName?.includes("ผู้อำนวยการ") || msg.senderName?.includes("ผอ.")))
    ) {
      return false;
    }

    if (isParentSession) {
      if (roomType === "parent") return msg.senderRole === "parent";
      if (roomType === "group") {
        if (msg.senderStableId) return msg.senderStableId === myGroupChildId;
        const session = getParentSession();
        const myChild = session?.children.find((c) => c.studentDocId === myGroupChildId);
        return !!myChild && msg.senderName === `ผู้ปกครอง${myChild.name}`;
      }
      return msg.senderUid === currentSenderUid;
    }
    if (isStudentSession) {
      if (roomType === "student-homeroom" || roomType === "student-direct") return msg.senderRole === "student";
      return msg.senderUid === currentSenderUid;
    }
    return (msg.senderUid === currentSenderUid) || (!!msg.senderStableId && msg.senderStableId === currentStableId);
  }, [isParentSession, isStudentSession, roomType, currentSenderUid, currentStableId, myGroupChildId]);

  // คำนวณสถานะ "อ่านแล้ว" ของข้อความ
  const getMessageReadStatus = useCallback((msg: ChatMessage): MessageReadInfo => {
    return getMessageReadInfo(msg, roomReadBy, roomType, currentSenderUid, currentRole, currentStableId);
  }, [roomReadBy, roomType, currentSenderUid, currentRole, currentStableId]);

  // แก้ไขชื่อห้องแชท (เช่น แชทหลักของโรงเรียน หรือกลุ่มแชท)
  const updateRoomTitle = useCallback(async (newTitle: string) => {
    if (!schoolId || !roomId) return;
    const trimmed = newTitle.trim();
    if (!trimmed) return;
    await setDoc(doc(firestore, "school-settings", schoolId, "chatRooms", roomId), {
      title: trimmed,
      name: trimmed,
      updatedAt: serverTimestamp(),
    }, { merge: true });
    setOtherPartyName(trimmed);
  }, [schoolId, roomId]);

  return {
    messages,
    sendMessage,
    sendSticker,
    sendGif,
    sendImage,
    sendDocument,
    isSending,
    currentSenderUid,
    isMine,
    getMessageReadStatus,
    roomReadBy,
    title: getRoomTitle(roomId, otherPartyName),
    otherPartyPhotoUrl,
    otherPartyName,
    groupMemberCount,
    onlineTeacherCount,
    totalTeacherCount,
    isOneOnOneRoom,
    isOtherPartyOnline,
    isDeptMember,
    schoolId,
    roomType,
    roomStatus,
    updateRoomTitle,
  };
};
