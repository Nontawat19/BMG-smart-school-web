import { firestore } from "../../../firebase";
import { addDoc, collection, deleteDoc, doc, getDocs, setDoc, Timestamp } from "firebase/firestore";
import { getFunctions, httpsCallable } from "firebase/functions";
import { FoundUser } from "./types";
import { isActiveStudentStatus } from "../../../utils/studentStatusUtils";

const getBangkokDateString = (date: Date) => date.toLocaleDateString("en-CA", { timeZone: "Asia/Bangkok" });

const buildAttendancePayload = (student: FoundUser, status: string, actionType: string, time: string) => {
  const rawStats = student.attendanceStats || { present: 0, late: 0, leave: 0, absent: 0, noCheckout: 0, officialTravel: 0 };
  return {
    studentId: student.id,
    studentStatus: student.studentStatus || student.status || "กำลังศึกษาอยู่",
    name: student.name,
    displayId: student.displayId || "",
    grade: student.grade || "",
    room: student.room || "",
    profileImageUrl: student.profileImageUrl || "",
    status,
    actionType,
    time,
    scanMethod: student.scanMethod || "",
    faceScanImageUrl: student.scanMethod === "สแกนใบหน้า" && student.faceScanImageUrl?.startsWith("https://")
      ? student.faceScanImageUrl
      : "",
    faceConfidence: typeof student.faceConfidence === "number" ? student.faceConfidence : null,
    behaviorScore: student.behaviorScore ?? 100,
    stats: {
      present: Math.max(0, rawStats.present || 0),
      late: Math.max(0, rawStats.late || 0),
      leave: Math.max(0, rawStats.leave || 0),
      absent: Math.max(0, rawStats.absent || 0),
      noCheckout: Math.max(0, rawStats.noCheckout || 0),
      officialTravel: Math.max(0, rawStats.officialTravel || 0),
    },
  };
};

/**
 * บันทึกแจ้งเตือนการลงเวลาของนักเรียนเข้าระบบแจ้งเตือนในแอป (กระดิ่งที่ Navbar + /notifications)
 * ให้ครูประจำชั้น — กรองเฉพาะสถานะ "กำลังศึกษาอยู่" เท่านั้น
 */
export const notifyHomeroomTeachersInApp = async (
  schoolId: string | null | undefined,
  teacherUids: string[],
  student: FoundUser,
  status: string,
  time: string,
  actionType: string = "checkin"
) => {
  if (!schoolId) return;

  // กรองเฉพาะนักเรียนสถานะกำลังศึกษาอยู่เท่านั้น
  const studentStatus = student.studentStatus || student.status || "กำลังศึกษาอยู่";
  if (!isActiveStudentStatus(studentStatus)) {
    console.log(`[InAppNotify] Skipped teacher notification: student ${student.name} (${student.displayId}) is not active (${studentStatus})`);
    return;
  }

  const uniqueUids = Array.from(new Set((teacherUids || []).filter(Boolean)));
  if (uniqueUids.length === 0) return;

  const isCheckout = actionType === "checkout" || actionType === "checkin_and_checkout";
  const displayStatusText = isCheckout && status !== "กลับก่อน" ? "ลงเวลากลับ" : status;
  const message = `${student.name} (${student.displayId}) ${displayStatusText}แล้วเวลา ${time} น.`;
  const link = `/notifications/classroom-chat`;

  const attendancePayload = buildAttendancePayload(student, status, actionType, time);

  await Promise.all(
    uniqueUids.map(async (uid) => {
      try {
        const notiRef = await addDoc(collection(firestore, "school-settings", schoolId, "notifications"), {
          userId: uid,
          message,
          createdAt: Timestamp.now(),
          isRead: false,
          link,
          type: "attendance",
          attendance: attendancePayload,
        });

        try {
          const functions = getFunctions(undefined, "us-central1");
          const processPushNotification = httpsCallable(functions, "processPushNotification");
          await processPushNotification({
            userId: uid,
            message,
            link,
            source: "attendance",
            schoolId,
            notificationId: notiRef.id,
          });
        } catch (pushErr) {
          console.error("[InAppNotify] processPushNotification error:", pushErr);
        }
      } catch (err) {
        console.error("[InAppNotify] Error writing notification for teacher uid:", uid, err);
      }
    })
  );
};

/**
 * บันทึกแจ้งเตือนการลงเวลาให้ "ผู้ปกครอง" เห็นในแอป
 * กรองเฉพาะสถานะ "กำลังศึกษาอยู่" เท่านั้น
 */
export const notifyParentInApp = async (
  schoolId: string | null | undefined,
  student: FoundUser,
  status: string,
  time: string,
  actionType: string = "checkin"
) => {
  if (!schoolId || !student.id) return;

  // กรองเฉพาะนักเรียนสถานะกำลังศึกษาอยู่เท่านั้น
  const studentStatus = student.studentStatus || student.status || "กำลังศึกษาอยู่";
  if (!isActiveStudentStatus(studentStatus)) {
    console.log(`[InAppNotify] Skipped parent in-app notification: student ${student.name} (${student.displayId}) is not active (${studentStatus})`);
    return;
  }

  const isCheckout = actionType === "checkout" || actionType === "checkin_and_checkout";
  const displayStatusText = isCheckout && status !== "กลับก่อน" ? "ลงเวลากลับ" : status;
  const message = `${student.name} (${student.displayId}) ${displayStatusText}แล้วเวลา ${time} น.`;
  const attendancePayload = buildAttendancePayload(student, status, actionType, time);
  const parentNotifRef = collection(firestore, "school-settings", schoolId, "students", student.id, "parentNotifications");

  try {
    const todayStr = getBangkokDateString(new Date());
    const existingSnap = await getDocs(parentNotifRef);
    const staleDocs = existingSnap.docs.filter((d) => {
      const createdAt = d.data().createdAt as Timestamp | undefined;
      return !createdAt || getBangkokDateString(createdAt.toDate()) !== todayStr;
    });
    await Promise.all(staleDocs.map((d) => deleteDoc(d.ref)));
  } catch (error) {
    console.error("[InAppNotify] Error purging expired parent notifications:", error);
  }

  try {
    await addDoc(parentNotifRef, {
      message,
      createdAt: Timestamp.now(),
      type: "attendance",
      attendance: attendancePayload,
    });
  } catch (error) {
    console.error("[InAppNotify] Error writing parent notification:", error);
  }
};

/**
 * ส่งแจ้งเตือนการลงเวลา (พร้อมภาพถ่ายสแกนใบหน้า, กราฟสถิติ, สถานะ, คะแนนพฤติกรรม)
 * เข้าไปในห้องแชทของผู้ปกครอง (parent-${studentId}) และห้องแชทนักเรียนกับครูประจำชั้น (student-homeroom-${studentId})
 * กรองเฉพาะสถานะ "กำลังศึกษาอยู่" เท่านั้น
 */
export const notifyParentInChat = async (
  schoolId: string | null | undefined,
  student: FoundUser,
  status: string,
  time: string,
  actionType: string = "checkin"
) => {
  if (!schoolId || !student.id) return;

  // กรองเฉพาะนักเรียนสถานะกำลังศึกษาอยู่เท่านั้น
  const studentStatus = student.studentStatus || student.status || "กำลังศึกษาอยู่";
  if (!isActiveStudentStatus(studentStatus)) {
    console.log(`[InChatNotify] Skipped chat notification: student ${student.name} (${student.displayId}) is not active (${studentStatus})`);
    return;
  }

  const isCheckout = actionType === "checkout" || actionType === "checkin_and_checkout";
  const displayStatusText = isCheckout && status !== "กลับก่อน" ? "ลงเวลากลับ" : status;
  const message = `${student.name} (${student.displayId}) ${displayStatusText}แล้วเวลา ${time} น.`;
  const attendancePayload = buildAttendancePayload(student, status, actionType, time);

  // ส่งแจ้งเตือนเข้าห้องแชทผู้ปกครอง และห้องแชทนักเรียนกับครูประจำชั้น
  const roomTargets = [
    { roomId: `parent-${student.id}`, type: "parent" as const },
    { roomId: `student-homeroom-${student.id}`, type: "student-homeroom" as const },
  ];

  const now = Timestamp.now();
  const reportTitle = (isCheckout || status === "กลับก่อน") ? "รายงานการกลับบ้าน" : "รายงานการมาเรียน";

  await Promise.all(
    roomTargets.map(async ({ roomId, type }) => {
      try {
        const messagesRef = collection(firestore, "school-settings", schoolId, "chatRooms", roomId, "messages");
        const roomDocRef = doc(firestore, "school-settings", schoolId, "chatRooms", roomId);

        await addDoc(messagesRef, {
          senderUid: "system-attendance",
          senderName: "ระบบลงเวลาเรียน",
          senderRole: "staff",
          senderPhotoUrl: student.profileImageUrl || "",
          type: "attendance",
          text: message,
          attendance: attendancePayload,
          createdAt: now,
        });

        await setDoc(roomDocRef, {
          type,
          studentId: student.id,
          studentName: student.name,
          lastMessageText: `[${reportTitle}] ${student.name} ${displayStatusText}เวลา ${time} น.`,
          lastMessageAt: now,
          lastMessageSenderUid: "system-attendance",
        }, { merge: true });
      } catch (error) {
        console.error(`[InChatNotify] Error sending attendance notification to ${roomId}:`, error);
      }
    })
  );
};

