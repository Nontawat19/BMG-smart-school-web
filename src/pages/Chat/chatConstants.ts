import { collection, doc, serverTimestamp, setDoc } from "firebase/firestore";
import { firestore } from "@/firebase";

// ผู้ปกครอง/นักเรียน login แบบ local session (anonymous auth) ไม่มี user.schoolId/homeSchoolId
// เลย (ตั้งเป็น null ตอน login — ดู authSlice.ts) ทำให้ useEffectiveSchoolId() คืนค่า null เสมอ
// สำหรับ session พวกนี้ ต้อง fallback ไปอ่าน schoolId จาก local session โดยตรงแทน — ใช้แพทเทิร์น
// เดียวกับ getSessionSchoolId() ใน Navbar.tsx
export const getChatSchoolId = (effectiveSchoolId: string | null): string | null => {
  if (effectiveSchoolId) return effectiveSchoolId;
  try {
    const type = localStorage.getItem("currentUserType");
    if (type === "student") {
      const raw = localStorage.getItem("studentSession");
      if (raw) return JSON.parse(raw).schoolId || null;
    } else if (type === "parent") {
      const raw = localStorage.getItem("parentSession");
      if (raw) return JSON.parse(raw).children?.[0]?.schoolId || null;
    }
  } catch {
    // ignore
  }
  return null;
};

export const SCHOOL_CHAT_ROOM_ID = "school-main";

export const DEPARTMENT_CHATS: { key: string; roomId: string; label: string }[] = [
  { key: "academic", roomId: "dept-academic", label: "ฝ่ายวิชาการ" },
  { key: "general", roomId: "dept-general", label: "ฝ่ายบริหารทั่วไป" },
  { key: "budget", roomId: "dept-budget", label: "ฝ่ายงบประมาณ" },
  { key: "personnel", roomId: "dept-personnel", label: "ฝ่ายบุคคล" },
];

export const parentRoomId = (studentId: string) => `parent-${studentId}`;

// ห้องแชทครูประจำชั้น ↔ ตัวนักเรียนเอง เปิดคุยได้เลยไม่ต้องขออนุญาต (คู่กับ parent room แต่ฝั่งนักเรียน
// เข้าเองแทนผู้ปกครอง) ต่างจาก student-direct-* ที่เป็นการขอคุยกับครูที่นักเรียนเลือกเอง (ไม่ใช่ครูประจำชั้น)
export const studentHomeroomRoomId = (studentId: string) => `student-homeroom-${studentId}`;

// ห้องแชทตรงครู ↔ นักเรียนรายบุคคล ต้องขออนุญาตก่อน (ต่างจาก parent room ที่เปิดคุยได้เลย)
export const studentDirectRoomId = (teacherUid: string, studentId: string) => `student-direct-${teacherUid}_${studentId}`;

export const parseStudentDirectRoomId = (roomId: string): { teacherUid: string; studentId: string } | null => {
  const match = roomId.match(/^student-direct-(.+)_([^_]+)$/);
  if (!match) return null;
  return { teacherUid: match[1], studentId: match[2] };
};

// ห้องกลุ่มแชทที่ครูสร้างเอง (เช่น กลุ่มผู้ปกครองของห้องเรียน) ไม่มีรูปแบบ id ตายตัวเหมือนห้องอื่นๆ
// (ไม่ได้อิงจาก studentId/teacherUid) จึงใช้ Firestore auto-id แบบสุ่ม 20 ตัวอักษรแทน แล้วเติม prefix
// "group-" ไว้ให้ getRoomType() จำแนกประเภทได้ ตัว id ที่สุ่มมานี้เดายากอยู่แล้วโดยธรรมชาติ (เหมือนหลักการ
// เดียวกับห้อง parent-*/student-homeroom-* ที่อาศัยความเดายากของ id เป็นตัวควบคุมสิทธิ์การเข้าถึง)
export const createGroupRoomId = () => `group-${doc(collection(firestore, "chatRooms")).id}`;

export type ChatRoomType = "school" | "department" | "parent" | "student-direct" | "student-homeroom" | "group";

export const getRoomType = (roomId: string): ChatRoomType => {
  if (roomId === SCHOOL_CHAT_ROOM_ID) return "school";
  if (roomId.startsWith("dept-")) return "department";
  if (roomId.startsWith("student-direct-")) return "student-direct";
  if (roomId.startsWith("student-homeroom-")) return "student-homeroom";
  if (roomId.startsWith("group-")) return "group";
  return "parent";
};

// บันทึกว่า uid นี้อ่านห้องแชท roomId ล่าสุดเมื่อไหร่ (เก็บเป็น map field เดียวในเอกสารห้อง
// เดิม ไม่ใช่ collection/เอกสารแยกต่อคน) — ใช้ setDoc({merge: true}) บันทึกทั้ง uid และ role
// เพื่อให้ตรวจสอบสถานะ "อ่านแล้ว" ได้อย่างแม่นยำแม้ในเซสชัน Anonymous ของผู้ปกครอง/นักเรียน
export const markRoomRead = async (
  schoolId: string | null,
  roomId: string,
  uid?: string,
  role?: "teacher" | "staff" | "parent" | "student",
  stableId?: string
) => {
  if (!schoolId || !roomId) return;
  const effectiveUid = uid || (role ? `${role}_${stableId || "anon"}` : "anonymous");
  try {
    const updateData: Record<string, any> = {
      readBy: {
        [effectiveUid]: serverTimestamp(),
        ...(role ? { [`role_${role}`]: serverTimestamp() } : {}),
        ...(stableId ? { [`stable_${stableId}`]: serverTimestamp() } : {}),
      },
      [`readBy.${effectiveUid}`]: serverTimestamp(),
    };
    if (role) {
      updateData[`readBy.role_${role}`] = serverTimestamp();
    }
    if (stableId) {
      updateData[`readBy.stable_${stableId}`] = serverTimestamp();
    }
    await setDoc(
      doc(firestore, "school-settings", schoolId, "chatRooms", roomId),
      updateData,
      { merge: true }
    );
  } catch (error) {
    console.error("Error marking chat room as read:", error);
  }
};

/** แปลง Firestore Timestamp / Date / number ให้เป็น milliseconds อย่างปลอดภัย */
export const toMillis = (t: any): number => {
  if (!t) return 0;
  if (typeof t.toMillis === "function") return t.toMillis();
  if (typeof t.toDate === "function") return t.toDate().getTime();
  if (t instanceof Date) return t.getTime();
  if (typeof t.seconds === "number") return t.seconds * 1000 + Math.floor((t.nanoseconds || 0) / 1e6);
  if (typeof t === "number") return t;
  return 0;
};

export interface MessageReadInfo {
  isRead: boolean;
  readCount: number;
  label: string;
}

/**
 * คำนวณสถานะ "อ่านแล้ว" ของข้อความแชท:
 * - แชท 1 ต่อ 1 (parent, student-homeroom, student-direct):
 *   ตรวจสอบว่าอีกฝ่าย (ครู ↔ ผู้ปกครอง/นักเรียน) มีการอ่านห้องนี้หลังเวลาที่ส่งข้อความหรือไม่
 * - แชทกลุ่ม/ฝ่ายงาน (group, department, school):
 *   นับจำนวนสมาชิกคนอื่นที่มีเวลาอ่าน >= เวลาส่งข้อความ (แสดง "อ่านแล้ว" หรือ "อ่านแล้ว n")
 */
export const getMessageReadInfo = (
  msg: { createdAt?: any; senderUid?: string; senderRole?: string; senderStableId?: string; senderName?: string },
  roomReadBy: Record<string, any> | undefined,
  roomType: ChatRoomType,
  currentSenderUid: string,
  myRole?: string,
  myStableId?: string
): MessageReadInfo => {
  if (!msg?.createdAt || !roomReadBy) {
    return { isRead: false, readCount: 0, label: "" };
  }

  const msgTime = toMillis(msg.createdAt);
  if (msgTime <= 0) {
    return { isRead: false, readCount: 0, label: "" };
  }

  // 1-on-1 direct chats: parent, student-homeroom, student-direct
  const isDirect = roomType === "parent" || roomType === "student-homeroom" || roomType === "student-direct";

  if (isDirect) {
    // กำหนดว่าผู้ส่งข้อความเป็นฝั่งโรงเรียน (ครู/เจ้าหน้าที่) หรือฝั่งครอบครัว (นักเรียน/ผู้ปกครอง)
    const senderWasSchool =
      msg.senderRole === "teacher" ||
      msg.senderRole === "staff" ||
      (roomType === "parent" && msg.senderRole !== "parent" && !msg.senderName?.startsWith("ผู้ปกครอง")) ||
      (roomType === "student-homeroom" && msg.senderRole !== "student");

    let otherReadTime = 0;

    for (const [key, val] of Object.entries(roomReadBy)) {
      const t = toMillis(val);
      if (t <= 0) continue;

      if (senderWasSchool) {
        // ฝั่งโรงเรียนส่ง -> หาเวลาอ่านของฝั่งนักเรียน/ผู้ปกครอง
        if (key === "role_parent" || key === "role_student" || key.startsWith("stable_")) {
          if (t > otherReadTime) otherReadTime = t;
        } else if (
          key !== msg.senderUid &&
          key !== currentSenderUid &&
          key !== "role_teacher" &&
          key !== "role_staff" &&
          !key.startsWith("role_teacher") &&
          !key.startsWith("role_staff")
        ) {
          if (t > otherReadTime) otherReadTime = t;
        }
      } else {
        // ฝั่งนักเรียน/ผู้ปกครองส่ง -> หาเวลาอ่านของฝั่งครู/เจ้าหน้าที่
        if (key === "role_teacher" || key === "role_staff") {
          if (t > otherReadTime) otherReadTime = t;
        } else if (
          key !== msg.senderUid &&
          key !== currentSenderUid &&
          !key.startsWith("role_") &&
          !key.startsWith("stable_")
        ) {
          if (t > otherReadTime) otherReadTime = t;
        }
      }
    }

    // เผื่อ Clock skew ระหว่าง client และ server 1500ms
    const isRead = otherReadTime >= (msgTime - 1500);
    return {
      isRead,
      readCount: isRead ? 1 : 0,
      label: isRead ? "อ่านแล้ว" : "",
    };
  }

  // Group / Department / School chats
  let readCount = 0;
  for (const [key, val] of Object.entries(roomReadBy)) {
    if (key.startsWith("role_") || key.startsWith("stable_")) continue;
    if (key === msg.senderUid || key === currentSenderUid) continue;

    const t = toMillis(val);
    if (t >= (msgTime - 1500)) {
      readCount++;
    }
  }

  return {
    isRead: readCount > 0,
    readCount,
    label: readCount > 1 ? `อ่านแล้ว ${readCount}` : readCount === 1 ? "อ่านแล้ว" : "",
  };
};

// ห้อง parent-*/student-direct-* เป็นแชท 1 ต่อ 1 เสมอ — otherPartyName (ที่ useChatMessages.ts
// ประกอบมาให้แล้ว รวม prefix "ผู้ปกครอง" ในกรณีที่ต้องมี) จึงใช้เป็นหัวข้อได้ตรงๆ ไม่ต้องพันด้วยข้อความ
// อธิบายบทบาทซ้ำอีกชั้น เพราะตอนนี้มีรูปโปรไฟล์ประกอบข้าง header อยู่แล้ว
export const getRoomTitle = (roomId: string, otherPartyName?: string): string => {
  if (roomId === SCHOOL_CHAT_ROOM_ID) return otherPartyName || "แชทหลักของโรงเรียน";
  const dept = DEPARTMENT_CHATS.find((d) => d.roomId === roomId);
  if (dept) return `แชท${dept.label}`;
  const roomType = getRoomType(roomId);
  if (roomType === "student-direct") return otherPartyName || "แชทครู-นักเรียน";
  if (roomType === "student-homeroom") return otherPartyName || "แชทครูประจำชั้น";
  if (roomType === "group") return otherPartyName || "แชทกลุ่ม";
  return otherPartyName || "แชทครูประจำชั้น-ผู้ปกครอง";
};

export const formatChatListTime = (timestampMs: number | null): string => {
  if (!timestampMs) return "";
  const now = Date.now();
  const diffSec = Math.floor((now - timestampMs) / 1000);
  if (diffSec < 60) return "เมื่อสักครู่";
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin} นาที`;
  const diffHours = Math.floor(diffMin / 60);
  if (diffHours < 24) {
    const d = new Date(timestampMs);
    const today = new Date();
    if (d.getDate() === today.getDate() && d.getMonth() === today.getMonth() && d.getFullYear() === today.getFullYear()) {
      return d.toLocaleTimeString("th-TH", { hour: "2-digit", minute: "2-digit" });
    }
    return `${diffHours} ชม.`;
  }
  const diffDays = Math.floor(diffHours / 24);
  if (diffDays === 1) return "เมื่อวาน";
  if (diffDays < 7) return `${diffDays} วันที่แล้ว`;
  return new Date(timestampMs).toLocaleDateString("th-TH", { day: "numeric", month: "short" });
};

/**
 * จัดรูปแบบวันที่และเวลาสำหรับแสดงผลใต้ฟองข้อความแชท:
 * - ส่งวันนี้: "วันนี้ HH:mm น."
 * - ส่งเมื่อวาน: "เมื่อวาน HH:mm น."
 * - ปีปัจจุบัน: "D MMM HH:mm น." (เช่น 18 ก.ย. 11:54 น.)
 * - ปีก่อนหน้า: "D MMM YY HH:mm น."
 */
export const formatChatMessageDateTime = (timestamp: any): string => {
  if (!timestamp) return "";
  const date = timestamp?.toDate ? timestamp.toDate() : timestamp instanceof Date ? timestamp : new Date(timestamp);
  if (isNaN(date.getTime())) return "";

  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  const timeStr = `${pad(date.getHours())}:${pad(date.getMinutes())} น.`;

  const isSameDay = (d1: Date, d2: Date) =>
    d1.getFullYear() === d2.getFullYear() &&
    d1.getMonth() === d2.getMonth() &&
    d1.getDate() === d2.getDate();

  if (isSameDay(date, now)) {
    return `วันนี้ ${timeStr}`;
  }

  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  if (isSameDay(date, yesterday)) {
    return `เมื่อวาน ${timeStr}`;
  }

  const thaiMonths = ["ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.", "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค."];
  const day = date.getDate();
  const month = thaiMonths[date.getMonth()];
  const thaiYear = (date.getFullYear() + 543) % 100;

  if (date.getFullYear() === now.getFullYear()) {
    return `${day} ${month} ${timeStr}`;
  }

  return `${day} ${month} ${thaiYear} ${timeStr}`;
};

export interface ChatMessageReplyTo {
  id: string;
  senderName: string;
  text?: string;
  type?: "text" | "sticker" | "gif" | "image" | "attendance" | "document";
}

export const getReplyPreviewText = (msg: { text?: string; type?: string; attendance?: any; documentName?: string }): string => {
  if (msg.type === "attendance") return "[รายงานการมาเรียน]";
  if (msg.type === "document") return msg.documentName ? `[เอกสาร] ${msg.documentName}` : "[เอกสาร]";
  if (msg.type === "image") return "[รูปภาพ]";
  if (msg.type === "sticker") return "[สติกเกอร์]";
  if (msg.type === "gif") return "[GIF]";
  return msg.text || "ข้อความ";
};

