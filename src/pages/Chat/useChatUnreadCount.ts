import { useEffect, useState } from "react";
import { useSelector } from "react-redux";
import { RootState } from "@/store";
import { auth, firestore } from "@/firebase";
import { useEffectiveSchoolId } from "@/hooks/useEffectiveSchool";
import { collection, doc, getDoc, getDocs, onSnapshot, query, where } from "firebase/firestore";
import { SCHOOL_CHAT_ROOM_ID, parentRoomId, studentHomeroomRoomId, getChatSchoolId, toMillis } from "./chatConstants";
import { isStudyingStudent } from "@/utils/studentStatusUtils";

export interface RoomMetaState {
  lastMessageText: string | null;
  lastMessageAt: number | null;
  lastMessageSenderUid: string | null;
  readAt: number | null;
  isUnread: boolean;
}

const getParentSession = (): { children: { studentDocId: string }[] } | null => {
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

const toRoomMetaState = (data: any, uid: string, role?: string, stableId?: string): RoomMetaState => {
  const lastMessageAt = toMillis(data?.lastMessageAt) || null;
  const lastMessageSenderUid = data?.lastMessageSenderUid ?? null;

  // อ่านเวลาอ่านล่าสุดจาก uid, role_*, หรือ stable_*
  const readUid = toMillis(data?.readBy?.[uid]);
  const readRole = role ? toMillis(data?.readBy?.[`role_${role}`]) : 0;
  const readStable = stableId ? toMillis(data?.readBy?.[`stable_${stableId}`]) : 0;
  const readAt = Math.max(readUid, readRole, readStable) || null;

  const isSelf = Boolean(
    (uid && lastMessageSenderUid === uid) ||
    (stableId && data?.lastMessageSenderStableId === stableId) ||
    (role && data?.lastMessageSenderRole === role)
  );

  const isUnread = Boolean(
    lastMessageAt &&
    !isSelf &&
    (!readAt || lastMessageAt > readAt)
  );

  return {
    lastMessageText: data?.lastMessageText ?? null,
    lastMessageAt,
    lastMessageSenderUid,
    readAt,
    isUnread,
  };
};

export const useChatRoomStates = (enabled: boolean): { roomStates: Record<string, RoomMetaState>; unreadCount: number } => {
  const currentUser = useSelector((state: RootState) => state.auth.user);
  const schoolId = getChatSchoolId(useEffectiveSchoolId());
  const userType = localStorage.getItem("currentUserType");
  const isParentSession = userType === "parent";
  const isStudentSession = userType === "student";
  const uid = auth.currentUser?.uid || currentUser?.uid || "";

  const [roomStates, setRoomStates] = useState<Record<string, RoomMetaState>>({});

  useEffect(() => {
    // ฟีเจอร์แชทปิดอยู่สำหรับโรงเรียนนี้ — ไม่ต้องเปิด listener อ่าน Firestore เลยสักตัว ประหยัดค่าอ่าน
    if (!enabled || !schoolId || !uid) {
      setRoomStates({});
      return;
    }

    let cancelled = false;
    const unsubs: Array<() => void> = [];

    const userRole = isParentSession ? "parent" : isStudentSession ? "student" : "teacher";
    const userStableId = isParentSession ? "" : isStudentSession ? (getStudentSession()?.studentId || "") : uid;

    const attachRoomListener = (roomId: string, specificStableId?: string) => {
      const ref = doc(firestore, "school-settings", schoolId, "chatRooms", roomId);
      const sId = specificStableId || userStableId;
      const unsub = onSnapshot(ref, (snap) => {
        setRoomStates((prev) => ({ ...prev, [roomId]: toRoomMetaState(snap.data(), uid, userRole, sId) }));
      }, (error) => console.error("Error listening to chat room for unread count:", error));
      unsubs.push(unsub);
    };

    const attachQueryListener = (roomsQuery: ReturnType<typeof query>, specificStableId?: string) => {
      const sId = specificStableId || userStableId;
      const unsub = onSnapshot(roomsQuery, (snap) => {
        setRoomStates((prev) => {
          const next = { ...prev };
          snap.docs.forEach((d) => { next[d.id] = toRoomMetaState(d.data(), uid, userRole, sId); });
          return next;
        });
      }, (error) => console.error("Error listening to chat rooms for unread count:", error));
      unsubs.push(unsub);
    };

    if (isParentSession) {
      const session = getParentSession();
      (session?.children || []).forEach((child) => attachRoomListener(parentRoomId(child.studentDocId), child.studentDocId));
      (session?.children || []).forEach((child) => {
        getDoc(doc(firestore, "school-settings", schoolId, "students", child.studentDocId)).then((snap) => {
          if (cancelled) return;
          const groupChats = (snap.data()?.groupChats || []) as { roomId: string }[];
          groupChats.forEach((g) => attachRoomListener(g.roomId, child.studentDocId));
        }).catch((error) => console.error("Error loading group chats for unread count:", error));
      });
    } else if (isStudentSession) {
      const session = getStudentSession();
      if (session) {
        attachRoomListener(studentHomeroomRoomId(session.studentId), session.studentId);
        const roomsRef = collection(firestore, "school-settings", schoolId, "chatRooms");
        attachQueryListener(
          query(roomsRef, where("type", "==", "student-direct"), where("studentId", "==", session.studentId)),
          session.studentId
        );
      }
    } else {
      attachRoomListener(SCHOOL_CHAT_ROOM_ID);
      const roomsRef = collection(firestore, "school-settings", schoolId, "chatRooms");
      attachQueryListener(query(roomsRef, where("type", "==", "student-direct"), where("teacherUid", "==", uid)));
      attachQueryListener(query(roomsRef, where("type", "==", "group"), where("createdByUid", "==", uid)));

      getDoc(doc(firestore, "school-settings", schoolId, "teachers", uid)).then(async (teacherSnap) => {
        if (cancelled) return;
        const teacherData = teacherSnap.data();
        const deptChatRoomIds = (teacherData?.deptChatRoomIds || []) as string[];
        deptChatRoomIds.forEach((roomId) => attachRoomListener(roomId));

        if (!teacherData?.isHomeroomTeacher || !teacherData?.homeroomGrade) return;
        const studentsRef = collection(firestore, "school-settings", schoolId, "students");
        const gradeVariants = Array.from(new Set([
          String(teacherData.homeroomGrade),
          `${teacherData.homeroomGrade}/${teacherData.homeroomRoom || ""}`,
        ]));
        const snaps = await Promise.all(gradeVariants.map((g) => getDocs(query(studentsRef, where("classLevel", "==", g)))));
        if (cancelled) return;
        const ids = new Set<string>();
        snaps.forEach((snap) => snap.docs.forEach((d) => {
          const data = d.data();
          if (teacherData.homeroomRoom && String(data.room || "") !== String(teacherData.homeroomRoom)) return;
          if (!isStudyingStudent(data)) return;
          ids.add(d.id);
        }));
        ids.forEach((id) => {
          attachRoomListener(parentRoomId(id));
          attachRoomListener(studentHomeroomRoomId(id));
        });
      }).catch((error) => console.error("Error loading homeroom students for unread count:", error));
    }

    return () => {
      cancelled = true;
      unsubs.forEach((unsub) => unsub());
    };
  }, [enabled, schoolId, uid, isParentSession, isStudentSession]);

  const unreadCount = Object.values(roomStates).filter((state) => state.isUnread).length;
  return { roomStates, unreadCount };
};

export const useChatUnreadCount = (enabled: boolean): number => {
  const { unreadCount } = useChatRoomStates(enabled);
  return unreadCount;
};
