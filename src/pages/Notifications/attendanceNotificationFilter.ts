import { firestore } from "@/firebase";
import { doc, getDoc, deleteDoc } from "firebase/firestore";
import { isActiveStudentStatus } from "@/utils/studentStatusUtils";

// Cache in-memory for student active status: key is `${schoolId}_${studentId}`
const studentStatusCache = new Map<string, boolean>();

export const checkStudentIsActive = async (
  schoolId: string,
  studentId: string,
  embeddedStatus?: string
): Promise<boolean> => {
  if (embeddedStatus) {
    const active = isActiveStudentStatus(embeddedStatus);
    studentStatusCache.set(`${schoolId}_${studentId}`, active);
    return active;
  }

  const cacheKey = `${schoolId}_${studentId}`;
  if (studentStatusCache.has(cacheKey)) {
    return studentStatusCache.get(cacheKey)!;
  }

  try {
    const studentDocRef = doc(firestore, "school-settings", schoolId, "students", studentId);
    const snap = await getDoc(studentDocRef);
    if (!snap.exists()) {
      studentStatusCache.set(cacheKey, false);
      return false;
    }
    const data = snap.data();
    const status = data.status || data.studentStatus || "กำลังศึกษาอยู่";
    const active = isActiveStudentStatus(status);
    studentStatusCache.set(cacheKey, active);
    return active;
  } catch (error) {
    console.error(`[attendanceNotificationFilter] Error checking student status for ${studentId}:`, error);
    return true; // Fallback so we don't accidentally hide valid records on network error
  }
};

/**
 * กรองแจ้งเตือนการลงเวลา (type: "attendance") ให้แสดงเฉพาะนักเรียนสถานะ "กำลังศึกษาอยู่" เท่านั้น
 * หากพบรายการของนักเรียนที่สถานะไม่ใช่กำลังศึกษา (เช่น จำหน่าย, ลาออก, ย้าย, สำเร็จการศึกษา ฯลฯ)
 * จะทำการลบเอกสารแจ้งเตือนนั้นออกจาก Firestore ทันที เพื่อไม่ให้ค้างอยู่ในระบบและไม่นับเป็นตัวเลขแจ้งเตือนที่ยังไม่ได้อ่าน
 */
export const filterAndPurgeInactiveAttendanceNotifications = async <T extends {
  id: string;
  path?: string;
  type?: string;
  attendance?: { studentId?: string; studentStatus?: string; [key: string]: any };
}>(
  notifications: T[],
  defaultSchoolId?: string | null
): Promise<T[]> => {
  const results: (T | null)[] = await Promise.all(
    notifications.map(async (noti): Promise<T | null> => {
      if (noti.type !== "attendance" || !noti.attendance) {
        return noti;
      }

      const pathSegments = noti.path ? noti.path.split("/") : [];
      const schoolId = (pathSegments.length >= 2 && pathSegments[0] === "school-settings" ? pathSegments[1] : "") || defaultSchoolId;
      const studentId = noti.attendance.studentId;

      if (!schoolId || !studentId) {
        // ถ้าไม่มี studentId ให้เช็ค embeddedStatus ถ้ามี
        if (noti.attendance.studentStatus && !isActiveStudentStatus(noti.attendance.studentStatus)) {
          if (noti.path) {
            deleteDoc(doc(firestore, noti.path)).catch(() => {});
          }
          return null;
        }
        return noti;
      }

      const isActive = await checkStudentIsActive(
        schoolId,
        studentId,
        noti.attendance.studentStatus
      );

      if (!isActive) {
        // ลบเอกสารแจ้งเตือนที่ไม่ได้เป็นสถานะกำลังศึกษาออกจาก Firestore
        if (noti.path) {
          deleteDoc(doc(firestore, noti.path)).catch((err) =>
            console.error(`[attendanceNotificationFilter] Error deleting inactive student noti at ${noti.path}:`, err)
          );
        }
        return null;
      }

      return noti;
    })
  );

  return results.filter((item): item is T => item !== null);
};
