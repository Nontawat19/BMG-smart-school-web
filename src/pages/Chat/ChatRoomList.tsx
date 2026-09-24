import React, { Suspense, lazy, useEffect, useMemo, useState } from "react";
import { useSelector } from "react-redux";
import { RootState } from "@/store";
import { firestore } from "@/firebase";
import { useEffectiveSchoolId } from "@/hooks/useEffectiveSchool";
import { collection, doc, getDoc, getDocs, onSnapshot, query, serverTimestamp, setDoc, where } from "firebase/firestore";
import { School, Briefcase, Users, Search, Check, X, Clock, UsersRound, Plus, MessageSquare } from "lucide-react";
import { SCHOOL_CHAT_ROOM_ID, STAFF_ATTENDANCE_CHAT_ROOM_ID, STAFF_ATTENDANCE_CHAT_TITLE, DEPARTMENT_CHATS, parentRoomId, studentDirectRoomId, studentHomeroomRoomId, staffDirectRoomId, getChatSchoolId, formatChatListTime } from "./chatConstants";
import { useChatWidget } from "./ChatWidgetContext";
const GroupChatCreator = lazy(() => import("./GroupChatCreator"));
const JoinDeptChatModal = lazy(() => import("./JoinDeptChatModal"));
const StaffChatPickerModal = lazy(() => import("./StaffChatPickerModal"));
import { isAttendanceOfficerAccount } from "./useChatMessages";
import { isAttendanceEntryOnly } from "@/utils/attendanceRoles";
import { isStudyingStudent } from "@/utils/studentStatusUtils";

interface ParentChild {
  schoolId: string;
  studentDocId: string;
  name: string;
  classLevel: string;
  room: string;
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

interface RoomEntry {
  roomId: string;
  icon: React.ReactNode;
  title: string;
  subtitle?: string;
  colorClass: string;
}

// อวาตาร์รูปโปรไฟล์จริง (นักเรียน/ครู) แทนไอคอนคนทั่วไป — เยื้องจุด crop ขึ้นบน (center 20%) เหมือนที่
// ทำไว้ใน FloatingChatWindow เพราะรูปหน้าตรงส่วนใหญ่มีพื้นที่ว่างใต้คางมากกว่าบนหัว ถ้า crop กลางเป๊ะ
// จะตัดหัวขาด ไม่มีรูปก็ fallback ไปสร้างอวาตาร์จากชื่อแทน (ui-avatars.com เหมือนหน้าอื่นๆ ในระบบ)
const PersonAvatar: React.FC<{ name: string; photoUrl?: string }> = ({ name, photoUrl }) => (
  <img
    src={photoUrl || `https://ui-avatars.com/api/?name=${encodeURIComponent(name)}&background=random`}
    alt={name}
    className="h-full w-full rounded-full object-cover object-[center_20%]"
  />
);

interface RoomRowProps extends RoomEntry {
  onClick: () => void;
  isUnread?: boolean;
  lastMessageText?: string | null;
  timeStr?: string;
  trailing?: React.ReactNode;
}

const RoomRow: React.FC<RoomRowProps> = ({
  icon,
  title,
  subtitle,
  onClick,
  colorClass,
  isUnread = false,
  lastMessageText,
  timeStr,
  trailing,
}) => {
  const displaySubtitle = lastMessageText || subtitle;

  return (
    <button
      onClick={onClick}
      className={`group relative flex w-full items-center gap-3 rounded-2xl p-2.5 text-left transition-all ${
        isUnread
          ? "bg-indigo-50/90 dark:bg-[#32353b] border border-indigo-200/80 dark:border-indigo-500/30 shadow-sm mb-1"
          : "hover:bg-gray-100 dark:hover:bg-white/5"
      }`}
    >
      <div className={`relative flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-full text-white ${colorClass}`}>
        {icon}
        {isUnread && (
          <span className="absolute -bottom-0.5 -right-0.5 h-3.5 w-3.5 rounded-full border-2 border-white bg-blue-600 dark:border-[#32353b] dark:bg-blue-400" />
        )}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between gap-1.5">
          <p className={`truncate text-sm ${isUnread ? "font-black text-gray-950 dark:text-white" : "font-bold text-gray-900 dark:text-white"}`}>
            {title}
          </p>
          {timeStr && (
            <span className={`shrink-0 text-[11px] ${isUnread ? "font-bold text-indigo-600 dark:text-indigo-400" : "text-gray-400"}`}>
              {timeStr}
            </span>
          )}
        </div>
        <div className="flex items-center justify-between gap-2 mt-0.5">
          {displaySubtitle && (
            <p className={`truncate text-xs ${isUnread ? "font-bold text-gray-900 dark:text-gray-100" : "text-gray-500 dark:text-gray-400"}`}>
              {displaySubtitle}
            </p>
          )}
          {isUnread && (
            <span className="h-2.5 w-2.5 shrink-0 rounded-full bg-blue-600 dark:bg-blue-400 shadow-sm" />
          )}
        </div>
      </div>
      {trailing}
    </button>
  );
};

interface PendingRequest {
  roomId: string;
  studentId: string;
  studentName: string;
}

/**
 * รายการห้องแชท (เนื้อหาล้วนๆ ไม่มี layout ของหน้า) — ใช้ร่วมกันทั้งใน ChatListPage.tsx (แบบเต็มหน้า)
 * และดรอปดาวน์ที่ Navbar (แบบ Facebook Messenger) กันโค้ดซ้ำ
 */
const ChatRoomList: React.FC<{ onSelectRoom: (roomId: string) => void }> = ({ onSelectRoom }) => {
  const currentUser = useSelector((state: RootState) => state.auth.user);
  const schoolLogoUrl = useSelector((state: RootState) => (state as any).schoolSettings?.logoUrl || (state as any).profile?.schoolLogoUrl || "");
  const schoolId = getChatSchoolId(useEffectiveSchoolId());
  const userType = localStorage.getItem("currentUserType");
  const isParentSession = userType === "parent";
  const isStudentSession = userType === "student";

  const [searchTerm, setSearchTerm] = useState("");
  const { roomStates } = useChatWidget();
  const [schoolChatTitle, setSchoolChatTitle] = useState("แชทหลักของโรงเรียน");
  const [homeroomStudents, setHomeroomStudents] = useState<{ id: string; name: string; profileImageUrl?: string }[]>([]);
  const [pendingRequests, setPendingRequests] = useState<PendingRequest[]>([]);
  const [approvedStudentChats, setApprovedStudentChats] = useState<{ roomId: string; studentName: string }[]>([]);
  const [allTeachers, setAllTeachers] = useState<{ id: string; name: string }[]>([]);
  const [myRequestStatus, setMyRequestStatus] = useState<Record<string, "pending" | "approved" | "rejected">>({});
  const [processingRoomId, setProcessingRoomId] = useState<string | null>(null);
  const [myGroups, setMyGroups] = useState<{ roomId: string; groupName: string }[]>([]);
  const [parentGroups, setParentGroups] = useState<{ roomId: string; groupName: string }[]>([]);
  const [showGroupCreator, setShowGroupCreator] = useState(false);
  const [staffDirectRooms, setStaffDirectRooms] = useState<{ roomId: string; otherUid: string }[]>([]);
  const [staffMap, setStaffMap] = useState<Record<string, { name: string; profileImageUrl?: string; position?: string; department?: string }>>({});
  const [showStaffPicker, setShowStaffPicker] = useState(false);

  useEffect(() => {
    if (!schoolId) return;
    const unsub = onSnapshot(doc(firestore, "school-settings", schoolId, "chatRooms", SCHOOL_CHAT_ROOM_ID), (snap) => {
      if (snap.exists() && (snap.data().title || snap.data().name)) {
        setSchoolChatTitle(snap.data().title || snap.data().name);
      }
    });
    return () => unsub();
  }, [schoolId]);
  const [deptChatRoomIds, setDeptChatRoomIds] = useState<string[]>([]);
  const [showJoinDeptChat, setShowJoinDeptChat] = useState(false);
  const parentSession = isParentSession ? getParentSession() : null;
  const studentSession = isStudentSession ? getStudentSession() : null;

  // ครู/เจ้าหน้าที่: ห้องแชทฝ่ายงานที่ตัวเองเป็นสมาชิกอยู่แล้ว — อ่านจาก field บนเอกสารครูของตัวเอง
  // (deptChatRoomIds เขียนไว้ตอนถูกเพิ่ม/เข้าร่วมห้อง — ดู DeptChatMemberPicker.tsx/JoinDeptChatModal.tsx)
  // แทนที่จะ query ห้องแชททุกห้องโดยตรง เพราะห้องที่ยังไม่ได้เป็นสมาชิกอ่านไม่ได้อยู่แล้วตาม
  // isDeptChatMember ใน firestore.rules — ใช้เอกสารตัวเองเป็นตัวบอกแทน (เหมือน groupChats ของนักเรียน)
  useEffect(() => {
    if (isParentSession || isStudentSession || !schoolId || !currentUser?.uid) return;
    const unsub = onSnapshot(doc(firestore, "school-settings", schoolId, "teachers", currentUser.uid), (snap) => {
      setDeptChatRoomIds((snap.exists() ? snap.data().deptChatRoomIds : []) || []);
    }, (error) => console.error("Error loading my dept chat memberships:", error));
    return () => unsub();
  }, [isParentSession, isStudentSession, schoolId, currentUser?.uid]);

  // ครูประจำชั้น: หานักเรียนในห้องที่ปรึกษา (สำหรับแชทกับผู้ปกครอง)
  useEffect(() => {
    if (isParentSession || isStudentSession || !schoolId || !currentUser?.uid) return;

    const teacherDocRef = doc(firestore, "school-settings", schoolId, "teachers", currentUser.uid);
    getDoc(teacherDocRef).then(async (teacherDocSnap) => {
      const teacherData = teacherDocSnap.data();
      if (!teacherData?.isHomeroomTeacher || !teacherData?.homeroomGrade) return;

      const studentsRef = collection(firestore, "school-settings", schoolId, "students");
      const gradeVariants = Array.from(new Set([
        String(teacherData.homeroomGrade),
        `${teacherData.homeroomGrade}/${teacherData.homeroomRoom || ""}`,
      ]));
      const snaps = await Promise.all(
        gradeVariants.map((g) => getDocs(query(studentsRef, where("classLevel", "==", g))))
      );
      const seen = new Map<string, { name: string; profileImageUrl?: string }>();
      snaps.forEach((snap) => {
        snap.docs.forEach((d) => {
          const data = d.data();
          if (teacherData.homeroomRoom && String(data.room || "") !== String(teacherData.homeroomRoom)) return;
          // แสดงเฉพาะนักเรียนที่สถานะ "กำลังศึกษาอยู่" เท่านั้น ตัดคนที่ย้าย/ลาออก/จบการศึกษาไปแล้วออก
          if (!isStudyingStudent(data)) return;
          seen.set(d.id, {
            name: `${data.title || ""}${data.firstName || ""} ${data.lastName || ""}`.trim(),
            profileImageUrl: data.profileImageUrl || data.profileUrl || "",
          });
        });
      });
      setHomeroomStudents(Array.from(seen.entries()).map(([id, info]) => ({ id, ...info })));
    }).catch((error) => console.error("Error loading homeroom students for chat list:", error));
  }, [isParentSession, isStudentSession, schoolId, currentUser?.uid]);

  // ครู (ทุกคน): คำขอสนทนาที่รอตอบรับ + แชทนักเรียนที่อนุมัติแล้ว — ฟังแบบเรียลไทม์ (onSnapshot)
  // แทน getDocs ครั้งเดียว เพื่อให้คำขอใหม่จากนักเรียนขึ้นในดรอปดาวน์ทันทีโดยไม่ต้องปิด-เปิดใหม่
  // (ยังคงเป็นการอ่านชุดเดียวกับก่อนหน้านี้ แค่เปลี่ยนจาก "อ่านครั้งเดียว" เป็น "ฟังการเปลี่ยนแปลง")
  useEffect(() => {
    if (isParentSession || isStudentSession || !schoolId || !currentUser?.uid) return;

    const roomsRef = collection(firestore, "school-settings", schoolId, "chatRooms");
    const unsub = onSnapshot(
      query(roomsRef, where("type", "==", "student-direct"), where("teacherUid", "==", currentUser.uid)),
      (snap) => {
        const pending: PendingRequest[] = [];
        const approved: { roomId: string; studentName: string }[] = [];
        snap.docs.forEach((d) => {
          const data = d.data();
          if (data.status === "pending") {
            pending.push({ roomId: d.id, studentId: data.studentId, studentName: data.studentName || "นักเรียน" });
          } else if (data.status === "approved") {
            approved.push({ roomId: d.id, studentName: data.studentName || "นักเรียน" });
          }
        });
        setPendingRequests(pending);
        setApprovedStudentChats(approved);
      },
      (error) => console.error("Error loading student chat requests:", error)
    );
    return () => unsub();
  }, [isParentSession, isStudentSession, schoolId, currentUser?.uid]);

  // นักเรียน: รายชื่อครูทั้งโรงเรียน (ดึงครั้งเดียว รายชื่อครูเปลี่ยนไม่บ่อย) + สถานะคำขอของตัวเอง
  // ต่อครูแต่ละคน (ฟังแบบเรียลไทม์ เพื่อให้เห็นทันทีเมื่อครูอนุมัติ/ปฏิเสธคำขอ)
  useEffect(() => {
    if (!isStudentSession || !schoolId || !studentSession) return;

    const teachersRef = collection(firestore, "school-settings", schoolId, "teachers");
    getDocs(teachersRef).then((teacherSnap) => {
      setAllTeachers(
        teacherSnap.docs
          .filter((d) => {
            const data = d.data();
            if (isAttendanceOfficerAccount(data)) return false;
            if (isAttendanceEntryOnly(data.role)) return false;
            if (data.status && data.status !== "อยู่" && data.status !== "active") return false;
            return true;
          })
          .map((d) => {
            const data = d.data();
            return { id: d.id, name: `${data.title || ""}${data.firstName || ""} ${data.lastName || ""}`.trim() };
          })
      );
    }).catch((error) => console.error("Error loading teacher list for student chat:", error));

    const roomsRef = collection(firestore, "school-settings", schoolId, "chatRooms");
    const unsub = onSnapshot(
      query(roomsRef, where("type", "==", "student-direct"), where("studentId", "==", studentSession.studentId)),
      (roomSnap) => {
        const statusMap: Record<string, "pending" | "approved" | "rejected"> = {};
        roomSnap.docs.forEach((d) => {
          const data = d.data();
          if (data.teacherUid) statusMap[data.teacherUid] = data.status;
        });
        setMyRequestStatus(statusMap);
      },
      (error) => console.error("Error listening to my chat requests:", error)
    );
    return () => unsub();
  }, [isStudentSession, schoolId, studentSession]);

  // ครู/บุคลากร: โหลดข้อมูลครูและบุคลากรทั้งหมดในโรงเรียน (ยกเว้นเจ้าหน้าที่ลงเวลา) ไว้สำหรับจับคู่ห้องแชทและค้นหา
  useEffect(() => {
    if (isParentSession || isStudentSession || !schoolId) return;
    const teachersRef = collection(firestore, "school-settings", schoolId, "teachers");
    getDocs(teachersRef).then((snap) => {
      const map: Record<string, { name: string; profileImageUrl?: string; position?: string; department?: string }> = {};
      snap.docs.forEach((d) => {
        const data = d.data();
        if (isAttendanceOfficerAccount(data)) return;
        if (isAttendanceEntryOnly(data.role)) return;
        if (data.status && data.status !== "อยู่" && data.status !== "active") return;
        const name = `${data.title || ""}${data.firstName || ""} ${data.lastName || ""}`.trim() || data.fullName || "ครู/บุคลากร";
        map[d.id] = {
          name,
          profileImageUrl: data.profileImageUrl || data.profileUrl || "",
          position: data.position || "",
          department: data.department || "",
        };
      });
      setStaffMap(map);
    }).catch((e) => console.error("Error loading staff map:", e));
  }, [isParentSession, isStudentSession, schoolId]);

  // ครู/บุคลากร: ห้องแชท 1 ต่อ 1 ที่คุยกับเพื่อนร่วมงาน (staff-direct) — ฟังแบบเรียลไทม์
  useEffect(() => {
    if (isParentSession || isStudentSession || !schoolId || !currentUser?.uid) return;
    const roomsRef = collection(firestore, "school-settings", schoolId, "chatRooms");
    const unsub = onSnapshot(
      query(roomsRef, where("type", "==", "staff-direct"), where("memberUids", "array-contains", currentUser.uid)),
      (snap) => {
        const rooms = snap.docs.map((d) => {
          const data = d.data();
          const members = (data.memberUids || []) as string[];
          const otherUid = members.find((id) => id !== currentUser.uid) || "";
          return {
            roomId: d.id,
            otherUid,
          };
        }).filter((r) => r.otherUid);
        setStaffDirectRooms(rooms);
      },
      (error) => console.error("Error loading staff direct chats:", error)
    );
    return () => unsub();
  }, [isParentSession, isStudentSession, schoolId, currentUser?.uid]);

  // ครู: กลุ่มแชทที่ตัวเองสร้าง (เช่น กลุ่มผู้ปกครองของห้องเรียน) — ฟังแบบเรียลไทม์เพื่อให้กลุ่มที่
  // เพิ่งสร้างขึ้นในดรอปดาวน์ทันที
  useEffect(() => {
    if (isParentSession || isStudentSession || !schoolId || !currentUser?.uid) return;
    const roomsRef = collection(firestore, "school-settings", schoolId, "chatRooms");
    const unsub = onSnapshot(
      query(roomsRef, where("type", "==", "group"), where("createdByUid", "==", currentUser.uid)),
      (snap) => {
        setMyGroups(snap.docs.map((d) => ({ roomId: d.id, groupName: d.data().groupName || "แชทกลุ่ม" })));
      },
      (error) => console.error("Error loading my group chats:", error)
    );
    return () => unsub();
  }, [isParentSession, isStudentSession, schoolId, currentUser?.uid]);

  // ผู้ปกครอง: กลุ่มแชทที่ลูกแต่ละคนถูกครูเพิ่มเข้ามา — เก็บอ้างอิงไว้ที่ field "groupChats" ของ
  // เอกสารนักเรียนเอง (ครูเป็นคนเขียนตอนสร้าง/เพิ่มสมาชิก) เพราะผู้ปกครอง (anonymous session) ไม่มี
  // สิทธิ์ query ห้องแชทโดยตรง แต่อ่านเอกสารนักเรียนของลูกตัวเองได้อยู่แล้ว (allow get: if true)
  useEffect(() => {
    if (!isParentSession || !schoolId || !parentSession?.children.length) return;
    Promise.all(parentSession.children.map((child) =>
      getDoc(doc(firestore, "school-settings", schoolId, "students", child.studentDocId))
    )).then((snaps) => {
      const groups = new Map<string, { roomId: string; groupName: string }>();
      snaps.forEach((snap) => {
        const list = (snap.exists() ? snap.data().groupChats : []) as { roomId: string; groupName: string }[] | undefined;
        (list || []).forEach((g) => groups.set(g.roomId, g));
      });
      setParentGroups(Array.from(groups.values()));
    }).catch((error) => console.error("Error loading parent group chats:", error));
  }, [isParentSession, schoolId, parentSession]);

  const requestChatWithTeacher = async (teacherUid: string, teacherName: string) => {
    if (!schoolId || !studentSession || processingRoomId) return;
    const roomId = studentDirectRoomId(teacherUid, studentSession.studentId);
    setProcessingRoomId(roomId);
    try {
      const studentSnap = await getDoc(doc(firestore, "school-settings", schoolId, "students", studentSession.studentId));
      const sd = studentSnap.exists() ? studentSnap.data() : null;
      const studentName = sd ? `${sd.title || ""}${sd.firstName || ""} ${sd.lastName || ""}`.trim() : "นักเรียน";

      await setDoc(doc(firestore, "school-settings", schoolId, "chatRooms", roomId), {
        type: "student-direct",
        studentId: studentSession.studentId,
        studentName,
        teacherUid,
        teacherName,
        status: "pending",
        requestedAt: serverTimestamp(),
      }, { merge: true });
      setMyRequestStatus((prev) => ({ ...prev, [teacherUid]: "pending" }));
    } catch (error) {
      console.error("Error requesting chat with teacher:", error);
    } finally {
      setProcessingRoomId(null);
    }
  };

  const respondToRequest = async (roomId: string, action: "approve" | "reject") => {
    if (!schoolId || processingRoomId) return;
    setProcessingRoomId(roomId);
    try {
      await setDoc(doc(firestore, "school-settings", schoolId, "chatRooms", roomId), {
        status: action === "approve" ? "approved" : "rejected",
        respondedAt: serverTimestamp(),
      }, { merge: true });
      setPendingRequests((prev) => prev.filter((r) => r.roomId !== roomId));
      if (action === "approve") {
        const request = pendingRequests.find((r) => r.roomId === roomId);
        if (request) setApprovedStudentChats((prev) => [...prev, { roomId, studentName: request.studentName }]);
      }
    } catch (error) {
      console.error("Error responding to chat request:", error);
    } finally {
      setProcessingRoomId(null);
    }
  };

  const allRooms: RoomEntry[] = useMemo(() => {
    if (isStudentSession) return [];
    if (isParentSession) {
      return [
        ...(parentSession?.children || []).map((child) => ({
          roomId: parentRoomId(child.studentDocId),
          icon: <Users size={20} />,
          title: `ครูประจำชั้นของ ${child.name}`,
          subtitle: `${child.classLevel}${child.room ? `/${child.room}` : ""}`,
          colorClass: "bg-emerald-500",
        })),
        ...parentGroups.map((g) => ({
          roomId: g.roomId,
          icon: <UsersRound size={18} />,
          title: g.groupName,
          subtitle: "กลุ่มแชท",
          colorClass: "bg-amber-500",
        })),
      ];
    }
    return [
      {
        roomId: SCHOOL_CHAT_ROOM_ID,
        icon: schoolLogoUrl ? (
          <img src={schoolLogoUrl} alt="Logo" className="h-full w-full rounded-full object-cover bg-white p-0.5" />
        ) : (
          <School size={20} />
        ),
        title: schoolChatTitle,
        subtitle: "แชทหลัก",
        colorClass: "bg-indigo-600",
      },
      {
        roomId: STAFF_ATTENDANCE_CHAT_ROOM_ID,
        icon: <Clock size={20} />,
        title: STAFF_ATTENDANCE_CHAT_TITLE,
        subtitle: "แจ้งเตือนอัตโนมัติ",
        colorClass: "bg-teal-600",
      },
      // แสดงเฉพาะฝ่ายงานที่ตัวเองเป็นสมาชิกอยู่แล้ว (ไม่ใช่ทุกฝ่ายเหมือนเดิม) — ฝ่ายอื่นที่ยังไม่ได้
      // เข้าร่วม เข้าถึงผ่านปุ่ม "เข้าร่วมฝ่ายงานอื่น" ด้านล่างแทน
      ...DEPARTMENT_CHATS.filter((dept) => deptChatRoomIds.includes(dept.roomId)).map((dept) => ({
        roomId: dept.roomId,
        icon: <Briefcase size={18} />,
        title: `แชท${dept.label}`,
        subtitle: "แชทฝ่ายงาน",
        colorClass: "bg-sky-600",
      })),
      ...homeroomStudents.flatMap((student) => [
        {
          roomId: parentRoomId(student.id),
          icon: <PersonAvatar name={student.name} photoUrl={student.profileImageUrl} />,
          title: `ผู้ปกครองของ ${student.name}`,
          subtitle: "แชทกับผู้ปกครอง",
          colorClass: "bg-emerald-500",
        },
        {
          roomId: studentHomeroomRoomId(student.id),
          icon: <PersonAvatar name={student.name} photoUrl={student.profileImageUrl} />,
          title: student.name,
          subtitle: "แชทกับนักเรียน",
          colorClass: "bg-cyan-600",
        },
      ]),
      ...approvedStudentChats.map((c) => ({
        roomId: c.roomId,
        icon: <Users size={18} />,
        title: c.studentName,
        subtitle: "แชทนักเรียน",
        colorClass: "bg-violet-500",
      })),
      ...myGroups.map((g) => ({
        roomId: g.roomId,
        icon: <UsersRound size={18} />,
        title: g.groupName,
        subtitle: "กลุ่มแชทที่สร้างเอง",
        colorClass: "bg-amber-500",
      })),
      ...staffDirectRooms.map((r) => {
        const staff = staffMap[r.otherUid];
        const name = staff?.name || "ครู/บุคลากร";
        return {
          roomId: r.roomId,
          icon: <PersonAvatar name={name} photoUrl={staff?.profileImageUrl} />,
          title: name,
          subtitle: staff?.position || staff?.department || "แชทส่วนตัว",
          colorClass: "bg-blue-600",
        };
      }),
    ];
  }, [isParentSession, isStudentSession, parentSession, parentGroups, homeroomStudents, approvedStudentChats, myGroups, deptChatRoomIds, staffDirectRooms, staffMap, schoolLogoUrl, schoolChatTitle]);

  const filteredRooms = searchTerm.trim()
    ? allRooms.filter((r) => r.title.toLowerCase().includes(searchTerm.trim().toLowerCase()))
    : allRooms;

  // ค้นหาครูและบุคลากรที่ยังไม่มีห้องแชทในรายการ เพื่อให้สามารถคลิกเริ่มแชทจากช่องค้นหาได้ทันที
  const searchMatchedStaff = useMemo(() => {
    if (isParentSession || isStudentSession || !searchTerm.trim() || !currentUser?.uid) return [];
    const term = searchTerm.trim().toLowerCase();
    const existingRoomOtherUids = new Set(staffDirectRooms.map((r) => r.otherUid));
    return Object.entries(staffMap)
      .filter(([id, staff]) => {
        if (id === currentUser.uid) return false;
        if (existingRoomOtherUids.has(id)) return false;
        return (
          staff.name.toLowerCase().includes(term) ||
          (staff.position && staff.position.toLowerCase().includes(term)) ||
          (staff.department && staff.department.toLowerCase().includes(term))
        );
      })
      .map(([id, staff]) => ({ id, ...staff }));
  }, [isParentSession, isStudentSession, searchTerm, staffMap, staffDirectRooms, currentUser?.uid]);

  // เรียงลำดับห้องแชท: ห้องที่มีแชทใหม่ที่ยังไม่อ่าน หรือมีข้อความเข้ามาล่าสุด จะขึ้นมาอยู่บนสุดเสมอ
  const sortedRooms = useMemo(() => {
    return [...filteredRooms].sort((a, b) => {
      const stateA = roomStates?.[a.roomId];
      const stateB = roomStates?.[b.roomId];

      // 1. แชทที่ยังไม่อ่าน (isUnread) นำขึ้นก่อน
      const unreadA = stateA?.isUnread ? 1 : 0;
      const unreadB = stateB?.isUnread ? 1 : 0;
      if (unreadA !== unreadB) return unreadB - unreadA;

      // 2. เรียงตามเวลาข้อความล่าสุด (ใหม่สุดขึ้นบนสุดเสมอ)
      const timeA = stateA?.lastMessageAt ?? 0;
      const timeB = stateB?.lastMessageAt ?? 0;
      if (timeA !== timeB) return timeB - timeA;

      return 0;
    });
  }, [filteredRooms, roomStates]);

  const filteredTeachers = (searchTerm.trim()
    ? allTeachers.filter((t) => t.name.toLowerCase().includes(searchTerm.trim().toLowerCase()))
    : allTeachers
  );

  return (
    <div className="flex flex-col">
      <div className="flex items-center gap-2 p-2">
        <div className="relative flex-1">
          <Search size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder={isStudentSession ? "ค้นหาคุณครู" : "ค้นหาแชท หรือชื่อเพื่อนร่วมงาน"}
            className="w-full rounded-full bg-gray-100 py-2 pl-9 pr-3 text-sm outline-none dark:bg-white/5 dark:text-white"
          />
        </div>
        {!isParentSession && !isStudentSession && (
          <button
            onClick={() => setShowStaffPicker(true)}
            title="แชทกับครูและบุคลากร / สร้างกลุ่ม"
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-indigo-600 text-white transition hover:bg-indigo-700 shadow-sm"
          >
            <Plus size={18} />
          </button>
        )}
      </div>

      {showGroupCreator && schoolId && currentUser?.uid && (
        <Suspense fallback={null}>
          <GroupChatCreator
            schoolId={schoolId}
            teacherUid={currentUser.uid}
            teacherName={(currentUser as any)?.fullName || "เจ้าหน้าที่"}
            onClose={() => setShowGroupCreator(false)}
            onCreated={(roomId) => {
              setShowGroupCreator(false);
              onSelectRoom(roomId);
            }}
          />
        </Suspense>
      )}

      <div className="max-h-[420px] overflow-y-auto px-1.5 pb-2">
        {isStudentSession ? (
          <>
            {studentSession && (() => {
              const homeroomRoomId = studentHomeroomRoomId(studentSession.studentId);
              const meta = roomStates?.[homeroomRoomId];
              const timeStr = meta?.lastMessageAt ? formatChatListTime(meta.lastMessageAt) : "";
              return (
                <RoomRow
                  roomId={homeroomRoomId}
                  icon={<Users size={18} />}
                  title="ครูประจำชั้น"
                  subtitle="คุยกับครูประจำชั้นได้เลย ไม่ต้องขออนุญาต"
                  colorClass="bg-cyan-600"
                  isUnread={meta?.isUnread}
                  lastMessageText={meta?.lastMessageText}
                  timeStr={timeStr}
                  onClick={() => onSelectRoom(homeroomRoomId)}
                />
              );
            })()}
            {filteredTeachers.length === 0 ? (
            <p className="py-10 text-center text-sm text-gray-400">ไม่พบรายชื่อคุณครู</p>
          ) : (
            filteredTeachers.map((teacher) => {
              const status = myRequestStatus[teacher.id];
              const roomId = studentSession ? studentDirectRoomId(teacher.id, studentSession.studentId) : "";
              return (
                <div key={teacher.id} className="flex items-center gap-3 rounded-xl p-2.5">
                  <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-violet-500 text-white">
                    <Users size={18} />
                  </div>
                  <p className="min-w-0 flex-1 truncate text-sm font-bold text-gray-900 dark:text-white">{teacher.name}</p>
                  {status === "approved" ? (
                    <button onClick={() => onSelectRoom(roomId)} className="shrink-0 rounded-full bg-indigo-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-indigo-700">
                      เปิดแชท
                    </button>
                  ) : status === "pending" ? (
                    <span className="flex shrink-0 items-center gap-1 rounded-full bg-amber-50 px-3 py-1.5 text-xs font-bold text-amber-700 dark:bg-amber-500/10 dark:text-amber-300">
                      <Clock size={12} /> รออนุมัติ
                    </span>
                  ) : (
                    <button
                      disabled={processingRoomId === roomId}
                      onClick={() => requestChatWithTeacher(teacher.id, teacher.name)}
                      className="shrink-0 rounded-full bg-gray-100 px-3 py-1.5 text-xs font-bold text-gray-600 hover:bg-indigo-600 hover:text-white disabled:opacity-50 dark:bg-white/10 dark:text-gray-300"
                    >
                      {status === "rejected" ? "ขอใหม่อีกครั้ง" : "ขออนุญาตสนทนา"}
                    </button>
                  )}
                </div>
              );
            })
            )}
          </>
        ) : (
          <>
            {pendingRequests.length > 0 && (
              <div className="mb-2">
                <p className="px-2.5 py-1.5 text-xs font-bold uppercase tracking-wider text-gray-400">คำขอสนทนาจากนักเรียน</p>
                {pendingRequests.map((req) => (
                  <div key={req.roomId} className="flex items-center gap-3 rounded-xl p-2.5">
                    <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-violet-500 text-white">
                      <Users size={18} />
                    </div>
                    <p className="min-w-0 flex-1 truncate text-sm font-bold text-gray-900 dark:text-white">{req.studentName}</p>
                    <div className="flex shrink-0 items-center gap-1.5">
                      <button
                        disabled={processingRoomId === req.roomId}
                        onClick={() => respondToRequest(req.roomId, "approve")}
                        className="flex h-7 w-7 items-center justify-center rounded-full bg-emerald-500 text-white hover:bg-emerald-600 disabled:opacity-50"
                      >
                        <Check size={14} />
                      </button>
                      <button
                        disabled={processingRoomId === req.roomId}
                        onClick={() => respondToRequest(req.roomId, "reject")}
                        className="flex h-7 w-7 items-center justify-center rounded-full bg-rose-50 text-rose-600 hover:bg-rose-500 hover:text-white disabled:opacity-50 dark:bg-rose-500/10"
                      >
                        <X size={14} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
            {sortedRooms.length === 0 && searchMatchedStaff.length === 0 ? (
              <p className="py-10 text-center text-sm text-gray-400">
                {isParentSession ? "ไม่พบข้อมูลบุตรหลานในระบบ" : "ไม่พบห้องแชท"}
              </p>
            ) : (
              sortedRooms.map((room) => {
                const meta = roomStates?.[room.roomId];
                const timeStr = meta?.lastMessageAt ? formatChatListTime(meta.lastMessageAt) : "";
                return (
                  <RoomRow
                    key={room.roomId}
                    {...room}
                    isUnread={meta?.isUnread}
                    lastMessageText={meta?.lastMessageText}
                    timeStr={timeStr}
                    onClick={() => onSelectRoom(room.roomId)}
                  />
                );
              })
            )}

            {searchMatchedStaff.length > 0 && (
              <div className="mt-2 border-t border-gray-100 pt-2 dark:border-gray-800">
                <p className="px-2.5 py-1 text-xs font-bold uppercase tracking-wider text-gray-400">
                  ครูและบุคลากร ({searchMatchedStaff.length})
                </p>
                {searchMatchedStaff.map((staff) => {
                  const roomId = staffDirectRoomId(currentUser!.uid, staff.id);
                  return (
                    <button
                      key={staff.id}
                      onClick={() => onSelectRoom(roomId)}
                      className="flex w-full items-center gap-3 rounded-xl p-2.5 text-left transition hover:bg-indigo-50/70 dark:hover:bg-white/5"
                    >
                      <div className="h-11 w-11 shrink-0 overflow-hidden rounded-full bg-indigo-500">
                        <PersonAvatar name={staff.name} photoUrl={staff.profileImageUrl} />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-bold text-gray-900 dark:text-white">{staff.name}</p>
                        <p className="truncate text-xs text-gray-500 dark:text-gray-400">
                          {staff.position || staff.department || "ครู/บุคลากร"}
                        </p>
                      </div>
                      <span className="shrink-0 rounded-full bg-indigo-50 px-2.5 py-1 text-xs font-bold text-indigo-600 dark:bg-indigo-500/10 dark:text-indigo-400">
                        เริ่มแชท
                      </span>
                    </button>
                  );
                })}
              </div>
            )}

            {!isParentSession && !isStudentSession && (
              <button
                onClick={() => setShowStaffPicker(true)}
                className="mt-1 flex w-full items-center gap-3 rounded-xl border border-dashed border-indigo-200 bg-indigo-50/50 p-2.5 text-left text-sm font-bold text-indigo-700 transition hover:bg-indigo-100/70 dark:border-indigo-500/30 dark:bg-indigo-500/10 dark:text-indigo-300 dark:hover:bg-indigo-500/20"
              >
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-indigo-600 text-white shadow-sm">
                  <MessageSquare size={18} />
                </span>
                แชทกับครูและบุคลากร
              </button>
            )}

            {!isParentSession && (
              <button
                onClick={() => setShowJoinDeptChat(true)}
                className="mt-1 flex w-full items-center gap-3 rounded-xl border border-dashed border-gray-300 p-2.5 text-left text-sm font-bold text-gray-500 transition hover:bg-gray-100 dark:border-gray-600 dark:text-gray-400 dark:hover:bg-white/5"
              >
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-gray-100 dark:bg-white/10">
                  <Plus size={18} />
                </span>
                เข้าร่วมแชทฝ่ายงานอื่น
              </button>
            )}
          </>
        )}
      </div>

      {showStaffPicker && schoolId && currentUser?.uid && (
        <Suspense fallback={null}>
          <StaffChatPickerModal
            schoolId={schoolId}
            currentUid={currentUser.uid}
            onClose={() => setShowStaffPicker(false)}
            onSelectUser={(targetUid) => {
              setShowStaffPicker(false);
              onSelectRoom(staffDirectRoomId(currentUser.uid, targetUid));
            }}
            onOpenGroupCreator={() => {
              setShowStaffPicker(false);
              setShowGroupCreator(true);
            }}
          />
        </Suspense>
      )}

      {showJoinDeptChat && schoolId && currentUser?.uid && (
        <Suspense fallback={null}>
          <JoinDeptChatModal
            schoolId={schoolId}
            currentUid={currentUser.uid}
            alreadyJoinedRoomIds={deptChatRoomIds}
            onClose={() => setShowJoinDeptChat(false)}
            onJoined={(roomId) => {
              setShowJoinDeptChat(false);
              onSelectRoom(roomId);
            }}
          />
        </Suspense>
      )}
    </div>
  );
};

export default ChatRoomList;
