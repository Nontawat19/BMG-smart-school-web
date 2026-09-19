import { firestore } from "../../../firebase";
import { addDoc, collection, deleteDoc, doc, getDocs, setDoc, Timestamp } from "firebase/firestore";
import { getFunctions, httpsCallable } from "firebase/functions";
import { FoundUser } from "./types";

const getBangkokDateString = (date: Date) => date.toLocaleDateString("en-CA", { timeZone: "Asia/Bangkok" });

const buildAttendancePayload = (student: FoundUser, status: string, actionType: string, time: string) => {
  const rawStats = student.attendanceStats || { present: 0, late: 0, leave: 0, absent: 0, noCheckout: 0, officialTravel: 0 };
  return {
    studentId: student.id,
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
 * ให้ครูประจำชั้น — ใช้ collection/schema เดียวกับที่ SubstituteManagementPage.tsx และ
 * DirectorAssignmentPage.tsx ใช้อยู่แล้ว (school-settings/{schoolId}/notifications, keyed by userId)
 * เพื่อให้ Navbar ดึงมาแสดงได้ทันทีโดยไม่ต้องแก้ Navbar/NotificationsPage เลย
 *
 * เพิ่ม field `type: "attendance"` + `attendance: {...}` แนบไปด้วย (นอกเหนือจาก `message` แบบข้อความล้วน
 * ที่ใช้แสดงในดรอปดาวน์กระดิ่งแบบย่อ) เพื่อให้หน้า /notifications เรนเดอร์เป็นการ์ดข้อมูลเต็มรูปแบบ
 * (รูปโปรไฟล์ + สถิติ + กราฟ + สถานะ + คะแนนพฤติกรรม + ภาพสแกนใบหน้า) เหมือนข้อความที่ส่งใน LINE
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

  const uniqueUids = Array.from(new Set((teacherUids || []).filter(Boolean)));
  if (uniqueUids.length === 0) return;

  const isCheckout = actionType === "checkout" || actionType === "checkin_and_checkout";
  const displayStatusText = isCheckout && status !== "กลับก่อน" ? "ลงเวลากลับ" : status;
  const message = `${student.name} (${student.displayId}) ${displayStatusText}แล้วเวลา ${time} น.`;
  // ลิงก์ชี้ไปห้องแชทรายชั้น (รวมนักเรียนทุกคนในห้องที่ครูคนนี้เป็นครูประจำชั้น)
  // แทนที่จะไปหน้าโปรไฟล์นักเรียนรายคนเดียว — ตรงกับที่ครูขอให้ดูภาพรวมทั้งห้องได้
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
 * บันทึกแจ้งเตือนการลงเวลาให้ "ผู้ปกครอง" เห็นในแอป (คนละจุดกับ notifyHomeroomTeachersInApp
 * ด้านบนที่แจ้งครู) — เก็บไว้ที่ school-settings/{schoolId}/students/{studentId}/parentNotifications
 * แทนที่จะใช้ collection "notifications" แบบเดียวกับครู เพราะครูมี uid จริงจาก Firebase Auth ให้
 * เทียบ (userId == uid) แต่ผู้ปกครองเป็น anonymous session ไม่มี uid ที่คงที่/รู้ล่วงหน้าได้ตอนลงเวลา
 * เลย ต้องผูกกับ studentId แทน (ผู้ปกครองรู้ studentId ของลูกตัวเองจาก local session อยู่แล้ว)
 * เอกสารนักเรียนมี rule "allow read: if true" ครอบคลุมทุก subcollection ข้างใต้อยู่แล้ว
 * (match /students/{id}/{studentSubPath=**}) จึงไม่ต้องแก้ firestore.rules เพิ่มเลย
 *
 * เขียนจากฝั่งเจ้าหน้าที่ที่กำลังลงเวลาอยู่แล้ว (isRealAuth) จึงถือโอกาสเก็บกวาดของเก่าที่ข้ามวัน
 * ไปแล้วทิ้งไปด้วยในตัว (ผู้ปกครองเองลบไม่ได้เพราะเป็น anonymous — allow write เฉพาะ isRealAuth())
 */
export const notifyParentInApp = async (
  schoolId: string | null | undefined,
  student: FoundUser,
  status: string,
  time: string,
  actionType: string = "checkin"
) => {
  if (!schoolId || !student.id) return;

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
 * เข้าไปในห้องแชทของผู้ปกครอง (parent-${studentId}) โดยตรง
 * เพื่อให้แสดงเป็นการ์ดรายงานเหมือนกับที่ส่งใน LINE OA
 * พร้อมอัปเดตสถานะห้องแชทให้แจ้งเตือนและขึ้น badge ตัวเลขข้อความใหม่อัตโนมัติ
 */
export const notifyParentInChat = async (
  schoolId: string | null | undefined,
  student: FoundUser,
  status: string,
  time: string,
  actionType: string = "checkin"
) => {
  if (!schoolId || !student.id) return;

  const isCheckout = actionType === "checkout" || actionType === "checkin_and_checkout";
  const displayStatusText = isCheckout && status !== "กลับก่อน" ? "ลงเวลากลับ" : status;
  const message = `${student.name} (${student.displayId}) ${displayStatusText}แล้วเวลา ${time} น.`;
  const attendancePayload = buildAttendancePayload(student, status, actionType, time);

  const roomId = `parent-${student.id}`;
  const messagesRef = collection(firestore, "school-settings", schoolId, "chatRooms", roomId, "messages");
  const roomDocRef = doc(firestore, "school-settings", schoolId, "chatRooms", roomId);

  try {
    const now = Timestamp.now();
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

    const reportTitle = (isCheckout || status === "กลับก่อน") ? "รายงานการกลับบ้าน" : "รายงานการมาเรียน";
    await setDoc(roomDocRef, {
      type: "parent",
      studentId: student.id,
      studentName: student.name,
      lastMessageText: `[${reportTitle}] ${student.name} ${displayStatusText}เวลา ${time} น.`,
      lastMessageAt: now,
      lastMessageSenderUid: "system-attendance",
    }, { merge: true });
  } catch (error) {
    console.error("[InChatNotify] Error sending attendance notification to parent chat room:", error);
  }
};

