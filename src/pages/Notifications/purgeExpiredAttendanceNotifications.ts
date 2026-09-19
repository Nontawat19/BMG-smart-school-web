import { firestore } from "@/firebase";
import { doc, writeBatch, Timestamp } from "firebase/firestore";

interface PurgeableDoc {
  path: string;
  type?: string;
  createdAt?: Timestamp;
}

const getBangkokDateString = (date: Date) =>
  date.toLocaleDateString("en-CA", { timeZone: "Asia/Bangkok" });

/**
 * ลบแจ้งเตือนประเภท "attendance" ที่ข้ามวันไปแล้ว (เทียบวันที่ตามเขตเวลาไทย ไม่ใช่แบบ
 * นับ 24 ชม. ย้อนหลัง) ออกจาก Firestore ทันทีที่เจอ — ป้องกันไม่ให้ collection notifications
 * บวมจากเหตุการณ์ลงเวลาที่เกิดขึ้นทุกวันสำหรับนักเรียนทุกคน เรียกจาก onSnapshot ของหน้าที่
 * อ่าน collection นี้อยู่แล้ว (ClassroomChatPage, NotificationsPage) แทนที่จะต้องตั้ง
 * Cloud Function แยกต่างหาก — ทำงานได้ทันทีโดยไม่ต้อง deploy อะไรเพิ่ม แลกกับข้อจำกัดว่า
 * จะลบจริงก็ต่อเมื่อมีคนเปิดหน้านั้นๆ เท่านั้น
 */
export const purgeExpiredAttendanceNotifications = async (docs: PurgeableDoc[]) => {
  const todayStr = getBangkokDateString(new Date());

  const expired = docs.filter((d) => {
    if (d.type !== "attendance" || !d.createdAt) return false;
    return getBangkokDateString(d.createdAt.toDate()) !== todayStr;
  });

  if (expired.length === 0) return;

  const batch = writeBatch(firestore);
  expired.forEach((d) => batch.delete(doc(firestore, d.path)));

  try {
    await batch.commit();
    console.log(`[Notifications] Purged ${expired.length} expired attendance notification(s)`);
  } catch (error) {
    console.error("[Notifications] Error purging expired attendance notifications:", error);
  }
};
