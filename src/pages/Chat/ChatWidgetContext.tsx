import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { useSelector } from "react-redux";
import { RootState } from "@/store";
import { auth, firestore } from "@/firebase";
import { doc, setDoc, serverTimestamp } from "firebase/firestore";
import { useEffectiveSchoolId } from "@/hooks/useEffectiveSchool";
import { useChatRoomStates, RoomMetaState } from "./useChatUnreadCount";
import { useChatFeatureEnabled } from "./useChatFeatureEnabled";
import { getChatSchoolId, getRoomType, markRoomRead } from "./chatConstants";
import { isAttendanceOfficerAccount } from "./useChatMessages";

interface OpenChatWindow {
  roomId: string;
  minimized: boolean;
}

// เก็บหน้าต่างแชทลอยตัวที่เปิดอยู่ไว้ใน localStorage เพื่อให้รอดตอนรีโหลดหน้าเว็บ (F5)
const STORAGE_KEY = "chat.openWindows";

const loadStoredWindows = (): OpenChatWindow[] => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((w): w is OpenChatWindow => typeof w?.roomId === "string" && typeof w?.minimized === "boolean");
  } catch {
    return [];
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

const getParentSession = (): { children: { studentDocId: string; name?: string }[] } | null => {
  try {
    const raw = localStorage.getItem("parentSession");
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
};

export interface ChatWidgetContextValue {
  openWindows: OpenChatWindow[];
  openChat: (roomId: string) => void;
  closeChat: (roomId: string) => void;
  toggleMinimize: (roomId: string) => void;
  unreadCount: number;
  roomStates: Record<string, RoomMetaState>;
  chatEnabled: boolean;
}

const ChatWidgetContext = createContext<ChatWidgetContextValue | undefined>(undefined);

// จำนวนหน้าต่างแชทลอยตัวที่เปิดพร้อมกันได้สูงสุด
const MAX_OPEN_WINDOWS = 3;

export const ChatWidgetProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [openWindows, setOpenWindows] = useState<OpenChatWindow[]>(loadStoredWindows);
  const currentUser = useSelector((state: RootState) => state.auth.user);
  const schoolId = getChatSchoolId(useEffectiveSchoolId());
  const userType = localStorage.getItem("currentUserType");
  const isParentSession = userType === "parent";
  const isStudentSession = userType === "student";

  const chatFeatureState = useChatFeatureEnabled();
  const chatEnabled = chatFeatureState === true;
  const { roomStates, unreadCount } = useChatRoomStates(chatEnabled);

  useEffect(() => {
    try {
      if (openWindows.length === 0) {
        localStorage.removeItem(STORAGE_KEY);
      } else {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(openWindows));
      }
    } catch {
      // ignore
    }
  }, [openWindows]);

  useEffect(() => {
    if (chatFeatureState === false) setOpenWindows([]);
  }, [chatFeatureState]);

  // Heartbeat อัปเดตสถานะออนไลน์ระดับทั้งแอปพลิเคชัน (ครู, ผู้ปกครอง, นักเรียน)
  // ประหยัดค่าเขียน (Writes) สูงสุด: ส่งทุก 2.5 นาที (150,000 ms) เฉพาะเมื่อแท็บเปิดอยู่ (document.visibilityState === "visible")
  useEffect(() => {
    if (!schoolId) return;

    let lastSent = 0;

    const sendHeartbeat = () => {
      if (typeof document !== "undefined" && document.visibilityState !== "visible") return;
      const now = Date.now();
      if (now - lastSent < 60000) return; // ไม่ส่งซ้ำถ้าเพิ่งส่งไปไม่ถึง 1 นาที
      lastSent = now;

      if (isParentSession) {
        const pSession = getParentSession();
        (pSession?.children || []).forEach((c) => {
          if (c.studentDocId) {
            setDoc(doc(firestore, "school-settings", schoolId, "presence", c.studentDocId), {
              uid: c.studentDocId,
              senderUid: `parent_${c.studentDocId}`,
              name: c.name ? `ผู้ปกครอง${c.name}` : "ผู้ปกครอง",
              role: "parent",
              lastActive: serverTimestamp(),
            }, { merge: true }).catch(() => {});
          }
        });
      } else if (isStudentSession) {
        const sSession = getStudentSession();
        if (sSession?.studentId) {
          setDoc(doc(firestore, "school-settings", schoolId, "presence", sSession.studentId), {
            uid: sSession.studentId,
            senderUid: `student_${sSession.studentId}`,
            name: "นักเรียน",
            role: "student",
            lastActive: serverTimestamp(),
          }, { merge: true }).catch(() => {});
        }
      } else if (currentUser?.uid) {
        if (!isAttendanceOfficerAccount({
          personnelType: currentUser.personnelType,
          role: currentUser.role,
          fullName: currentUser.fullName,
          email: currentUser.email,
          uid: currentUser.uid,
        })) {
          setDoc(doc(firestore, "school-settings", schoolId, "presence", currentUser.uid), {
            uid: currentUser.uid,
            senderUid: currentUser.uid,
            name: currentUser.fullName || "ครู",
            role: "teacher",
            lastActive: serverTimestamp(),
          }, { merge: true }).catch(() => {});
        }
      }
    };

    sendHeartbeat();
    const timer = setInterval(sendHeartbeat, 240000); // 4 นาที เพื่อความประหยัดขั้นสูงสุด

    const handleVisibilityOrFocus = () => {
      if (typeof document !== "undefined" && document.visibilityState === "visible") {
        const now = Date.now();
        if (now - lastSent >= 180000) { // ต้องเกิน 3 นาทีถึงจะส่งซ้ำ
          sendHeartbeat();
        }
      }
    };

    document.addEventListener("visibilitychange", handleVisibilityOrFocus);
    window.addEventListener("focus", handleVisibilityOrFocus);

    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", handleVisibilityOrFocus);
      window.removeEventListener("focus", handleVisibilityOrFocus);
    };
  }, [schoolId, isParentSession, isStudentSession, currentUser]);

  // ฟังก์ชันช่วยมาร์คว่าอ่านแล้วทันทีเมื่อผู้ใช้คลิกเปิดแชทจากรายชื่อหรือแถบลอยตัว
  const markCurrentRoomAsRead = useCallback((roomId: string) => {
    if (!schoolId || !roomId) return;
    const roomType = getRoomType(roomId);
    const role: "teacher" | "staff" | "parent" | "student" = isParentSession
      ? "parent"
      : isStudentSession
      ? "student"
      : (roomType === "parent" || roomType === "student-direct" || roomType === "student-homeroom" ? "teacher" : "staff");

    const stableId = isParentSession
      ? (roomType === "parent" ? roomId.replace(/^parent-/, "") : "")
      : isStudentSession
      ? (getStudentSession()?.studentId || "")
      : (currentUser?.uid || "");

    const senderUid = auth.currentUser?.uid || currentUser?.uid || (isParentSession ? `parent_${stableId}` : isStudentSession ? `student_${stableId}` : "");

    markRoomRead(schoolId, roomId, senderUid, role, stableId);
  }, [schoolId, isParentSession, isStudentSession, currentUser]);

  const openChat = useCallback((roomId: string) => {
    if (!chatEnabled) return;
    // มาร์คว่าอ่านแล้วทันทีที่กดเปิด
    markCurrentRoomAsRead(roomId);

    setOpenWindows((prev) => {
      const existing = prev.find((w) => w.roomId === roomId);
      if (existing) {
        return prev.map((w) => (w.roomId === roomId ? { ...w, minimized: false } : w));
      }
      const next = [...prev, { roomId, minimized: false }];
      return next.length > MAX_OPEN_WINDOWS ? next.slice(next.length - MAX_OPEN_WINDOWS) : next;
    });
  }, [chatEnabled, markCurrentRoomAsRead]);

  const closeChat = useCallback((roomId: string) => {
    setOpenWindows((prev) => prev.filter((w) => w.roomId !== roomId));
  }, []);

  const toggleMinimize = useCallback((roomId: string) => {
    setOpenWindows((prev) => prev.map((w) => {
      if (w.roomId === roomId) {
        const nextMin = !w.minimized;
        if (!nextMin) {
          // ขยายหน้าต่างที่เคยย่อไว้ -> มาร์คอ่านแล้วทันที
          markCurrentRoomAsRead(roomId);
        }
        return { ...w, minimized: nextMin };
      }
      return w;
    }));
  }, [markCurrentRoomAsRead]);

  const value = useMemo(
    () => ({ openWindows, openChat, closeChat, toggleMinimize, unreadCount, roomStates, chatEnabled }),
    [openWindows, openChat, closeChat, toggleMinimize, unreadCount, roomStates, chatEnabled]
  );

  return <ChatWidgetContext.Provider value={value}>{children}</ChatWidgetContext.Provider>;
};

export const useChatWidget = () => {
  const ctx = useContext(ChatWidgetContext);
  if (!ctx) throw new Error("useChatWidget must be used within a ChatWidgetProvider");
  return ctx;
};
