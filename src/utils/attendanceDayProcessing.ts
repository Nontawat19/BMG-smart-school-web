import {
  doc,
  getDoc,
  increment,
  runTransaction,
  serverTimestamp,
  Timestamp,
  type DocumentData,
  type QueryDocumentSnapshot,
} from "firebase/firestore";
import { firestore } from "@/firebase";
import { getStatusKey as getPeriodStatusKey, updatePeriodSummaries } from "@/utils/periodSummaryUtils";
import { calculateAttendanceBehaviorScoreChange } from "@/utils/behaviorScoreUtils";
import { isAttendanceEntryOnly } from "@/utils/attendanceRoles";
import { isStudyingStudent } from "@/utils/studentStatusUtils";
import { isActiveTeacherSummaryStatus } from "@/utils/ownerStatsUtils";

// key ของ attendanceStats ในเอกสารผู้ใช้ (ตัวนับเก่าของฝั่งนักเรียน)
const getStatsKey = (status: string) => {
  switch (status) {
    case "มา": return "present";
    case "สาย": return "late";
    case "ลา": return "leave";
    case "ขาด": return "absent";
    case "กลับก่อน": return "early";
    case "ไม่ลงเวลาออก": return "noCheckout";
    default: return null;
  }
};

const BANGKOK_DATE = { timeZone: "Asia/Bangkok" } as const;

/** แปลง Timestamp/Date/สตริงวันที่ เป็น YYYY-MM-DD (เวลาไทย) — คืน null ถ้าอ่านไม่ได้ */
const toBangkokDateString = (value: unknown): string | null => {
  if (!value) return null;
  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}/.test(value)) return value.slice(0, 10);
  const date =
    typeof (value as any)?.toDate === "function" ? (value as any).toDate()
      : value instanceof Date ? value
        : typeof value === "string" ? new Date(value)
          : null;
  if (!date || Number.isNaN(date.getTime())) return null;
  return date.toLocaleDateString("en-CA", BANGKOK_DATE);
};

/** วันแรกที่ผู้ใช้ "เริ่มอยู่ในระบบ" — ครูใช้วันที่เริ่มงาน/บรรจุถ้ามี ไม่งั้นใช้วันที่สร้างบัญชี */
const getJoinDateString = (collectionName: "students" | "teachers", data: DocumentData): string | null => {
  if (collectionName === "teachers") {
    const start = toBangkokDateString(data.startDate);
    if (start) return start;
  }
  return toBangkokDateString(data.createdAt);
};

// สถานะที่ไม่ต้องเปลี่ยนเป็น "ไม่ลงเวลาออก" อีก
const NO_CHECKOUT_EXEMPT_STATUSES = ["ลา", "ขาด", "ไม่ลงเวลาออก", "ไปราชการ"];

export interface ProcessDayOptions {
  schoolId: string;
  dateStr: string; // YYYY-MM-DD
  collectionName: "students" | "teachers";
  users: QueryDocumentSnapshot<DocumentData>[];
  behaviorScoreConfig: any;
  academicYear?: string;
  /** ข้ามวันที่ก่อนผู้ใช้จะเริ่มอยู่ในระบบ (ใช้ตอนประมวลผลย้อนหลังหลายวัน) */
  skipBeforeJoinDate?: boolean;
  /**
   * ปรับคนที่สแกนเข้าแล้วแต่ไม่สแกนออกเป็น "ไม่ลงเวลาออก" ด้วยหรือไม่ (ค่าเริ่มต้น: ไม่ปรับ — ตัดเฉพาะ "ขาด")
   * ต้องเปิดโดยผู้ใช้ตั้งใจเท่านั้น เพราะเปลี่ยนสถานะเดิม (มา/สาย → ไม่ลงเวลาออก) ของบันทึกที่มีอยู่แล้ว
   */
  includeNoCheckout?: boolean;
}

export interface ProcessDayResult {
  absent: number;
  noCheckout: number;
  /** จำนวนคนที่ผ่านเงื่อนไขและถูกตรวจสอบจริง */
  checked: number;
  /** คนที่มีบันทึกลงเวลาของวันนั้นอยู่แล้ว นับตามสถานะ (เช่น { มา: 30, ลา: 1 }) */
  existingByStatus: Record<string, number>;
  /** คนที่ถูกข้ามก่อนตรวจ พร้อมเหตุผล (เช่น สถานะไม่ใช่ "อยู่") — ไว้ให้ผู้ดูแลตรวจว่าใครหลุดไปเพราะอะไร */
  filteredOut: { name: string; reason: string }[];
  /** ชื่อคนที่ถูกตัดเป็น "ขาด" ในรอบนี้ */
  absentNames: string[];
}

const getDisplayName = (docSnap: QueryDocumentSnapshot<DocumentData>): string => {
  const d = docSnap.data();
  const name = `${d.title || ""}${d.firstName || ""} ${d.lastName || ""}`.trim();
  return name || d.displayName || docSnap.id;
};

/**
 * ประมวลผลการลงเวลาของ "หนึ่งวัน" สำหรับผู้ใช้กลุ่มหนึ่ง (นักเรียนหรือครู):
 *  - ไม่มีเอกสารลงเวลาเลย → ตัดเป็น "ขาด"
 *  - (เฉพาะเมื่อเปิด includeNoCheckout) สแกนเข้าแล้วแต่ไม่สแกนออก (และไม่ได้ลา/ไปราชการ) → "ไม่ลงเวลาออก"
 * ทำเป็นทรานแซกชันต่อคน (อ่านเอกสารล่าสุดก่อนเขียนเสมอ) จึงรันซ้ำกี่ครั้งก็ไม่บวก/ลบตัวนับซ้ำ
 * ใช้ร่วมกันทั้งปุ่มประมวลผลประจำวัน (วันนี้/ย้อนหลัง) — เอกสารที่มีอยู่แล้วจะถูกข้ามไป
 */
export const processDailyAttendanceGroup = async ({
  schoolId,
  dateStr,
  collectionName,
  users,
  behaviorScoreConfig,
  academicYear,
  skipBeforeJoinDate = false,
  includeNoCheckout = false,
}: ProcessDayOptions): Promise<ProcessDayResult> => {
  const result: ProcessDayResult = { absent: 0, noCheckout: 0, checked: 0, existingByStatus: {}, filteredOut: [], absentNames: [] };
  const summaryRef = doc(firestore, "school-settings", schoolId, "students", "Attendance", "dyasummary", dateStr);

  // กรองคนที่ไม่เกี่ยวข้องก่อน (ไม่ใช่ผู้ถูกลงเวลา/ไม่ได้อยู่ในสถานะปฏิบัติงาน/ยังไม่เริ่มอยู่ในระบบ ณ วันนั้น)
  const eligibleUsers = users.filter((docSnap) => {
    const data = docSnap.data();
    // ครูที่ถูกข้าม จดเหตุผลไว้ให้ผู้ดูแลเห็น (นักเรียนมีจำนวนมาก ไม่จดรายคน)
    const skip = (reason: string) => {
      if (collectionName === "teachers") result.filteredOut.push({ name: getDisplayName(docSnap), reason });
      return false;
    };
    if (collectionName === "teachers" && isAttendanceEntryOnly(data.role)) return skip("บัญชีเจ้าหน้าที่ลงเวลา");
    // สำคัญ: ต้องข้ามคนที่ไม่ได้ "กำลังศึกษาอยู่"/"อยู่" (ย้าย/ลาออก/จบ/แขวนลอย ฯลฯ) ไม่งั้นจะสร้างสถานะ "ขาด"
    // ให้คนที่ไม่ได้เรียน/ทำงานที่นี่แล้ว ทำให้ยอดขาดและยอดรวมเพี้ยนเกินจำนวนคนจริง
    if (collectionName === "students" && !isStudyingStudent(data)) return false;
    if (collectionName === "teachers" && !isActiveTeacherSummaryStatus(data.status || "อยู่")) return skip(`สถานะ "${data.status}" (ต้องเป็น "อยู่")`);
    if (skipBeforeJoinDate) {
      const joined = getJoinDateString(collectionName, data);
      if (joined && dateStr < joined) return skip(`เริ่มอยู่ในระบบวันที่ ${joined} (หลังวันที่ประมวลผล)`);
    }
    return true;
  });
  result.checked = eligibleUsers.length;

  // อ่านเอกสารลงเวลาของวันนั้นแบบขนานก่อน แล้วค่อยทำทรานแซกชันเฉพาะคนที่ต้องเปลี่ยนจริง (ลดเวลาเมื่อย้อนหลังหลายวัน)
  const CHUNK = 20;
  const needsWork: QueryDocumentSnapshot<DocumentData>[] = [];
  for (let i = 0; i < eligibleUsers.length; i += CHUNK) {
    const chunk = eligibleUsers.slice(i, i + CHUNK);
    const snaps = await Promise.all(
      chunk.map((u) => getDoc(doc(firestore, "school-settings", schoolId, collectionName, u.id, "attendance", dateStr)))
    );
    snaps.forEach((snap, idx) => {
      if (!snap.exists()) {
        needsWork.push(chunk[idx]);
        return;
      }
      const att = snap.data();
      const statusLabel = att.status || "(ไม่มีสถานะ)";
      result.existingByStatus[statusLabel] = (result.existingByStatus[statusLabel] || 0) + 1;
      if (includeNoCheckout && att.checkinTime && !att.checkoutTime && !NO_CHECKOUT_EXEMPT_STATUSES.includes(att.status)) {
        needsWork.push(chunk[idx]);
      }
    });
  }

  for (const docSnap of needsWork) {
    const data = docSnap.data();
    const attendanceRef = doc(firestore, "school-settings", schoolId, collectionName, docSnap.id, "attendance", dateStr);
    const userRef = doc(firestore, "school-settings", schoolId, collectionName, docSnap.id);
    const classKey = collectionName === "students" ? (data.classLevel?.trim() || "ไม่ระบุชั้น") : undefined;

    const outcome = await runTransaction(firestore, async (transaction) => {
      // สำคัญ: Firestore transaction ต้องอ่านให้ครบ (transaction.get) ก่อนเขียนทุกจุดเสมอ
      const attendanceSnap = await transaction.get(attendanceRef);
      const studentSnap = collectionName === "students" ? await transaction.get(userRef) : null;

      if (!attendanceSnap.exists()) {
        transaction.set(attendanceRef, {
          status: "ขาด",
          // ใส่ schoolId/date/userType เหมือนเอกสารที่เกิดจากการสแกนจริง ให้ query รวมทั้งโรงเรียนเจอ
          schoolId,
          date: dateStr,
          userType: collectionName === "students" ? "student" : "teacher",
          checkinTime: null,
          checkoutTime: null,
          timestamp: Timestamp.now(),
          remark: "Auto-Absent by Admin",
        });

        if (collectionName === "students") {
          transaction.set(summaryRef, {
            absent: increment(1),
            [`classes.${classKey}.absent`]: increment(1),
            updatedAt: serverTimestamp(),
          }, { merge: true });

          const freshScore = studentSnap?.exists() ? Number(studentSnap.data().behaviorScore ?? data.behaviorScore ?? 100) : (data.behaviorScore ?? 100);
          const scoreResult = calculateAttendanceBehaviorScoreChange({
            currentScore: freshScore,
            oldStatus: null,
            newStatus: "ขาด",
            config: behaviorScoreConfig,
          });
          if (scoreResult) {
            transaction.set(userRef, scoreResult.update, { merge: true });
          }
        }

        // Update Period Summaries (Week, Month, Year, Semester) — ก่อนหน้านี้ไม่มีเอกสาร จึงไม่มีสถานะเดิม
        updatePeriodSummaries(firestore, transaction, schoolId, docSnap.id, collectionName, dateStr, null, "ขาด", classKey, academicYear);
        return "absent" as const;
      }

      // มีเอกสารแล้ว → ตรวจว่าลืมลงเวลาออกหรือไม่
      const attData = attendanceSnap.data();
      // เงื่อนไข: มีเวลาเข้า + ไม่มีเวลาออก + สถานะไม่ใช่ ลา/ขาด/ไม่ลงเวลาออก/ไปราชการ
      if (includeNoCheckout && attData.checkinTime && !attData.checkoutTime && !NO_CHECKOUT_EXEMPT_STATUSES.includes(attData.status)) {
        const oldStatus = attData.status;
        const newStatus = "ไม่ลงเวลาออก";

        transaction.update(attendanceRef, {
          status: newStatus,
          remark: "Auto-update: ไม่ลงเวลาออก",
        });

        const oldKey = getStatsKey(oldStatus);
        const newKey = getStatsKey(newStatus);
        const statsUpdate: Record<string, any> = {};
        if (oldKey) statsUpdate[`attendanceStats.${oldKey}`] = increment(-1);
        if (newKey) statsUpdate[`attendanceStats.${newKey}`] = increment(1);
        if (Object.keys(statsUpdate).length > 0) {
          transaction.update(userRef, statsUpdate);
        }

        if (collectionName === "students") {
          const freshScore = studentSnap?.exists() ? Number(studentSnap.data().behaviorScore ?? data.behaviorScore ?? 100) : (data.behaviorScore ?? 100);
          const scoreChange = calculateAttendanceBehaviorScoreChange({
            currentScore: freshScore,
            oldStatus,
            newStatus,
            config: behaviorScoreConfig,
          });
          if (scoreChange) {
            transaction.set(userRef, scoreChange.update, { merge: true });
          }

          const oldSummaryKey = getPeriodStatusKey(oldStatus);
          const newSummaryKey = getPeriodStatusKey(newStatus);
          if (oldSummaryKey !== newSummaryKey) {
            const summaryUpdates: Record<string, any> = { updatedAt: serverTimestamp() };
            if (oldSummaryKey) {
              summaryUpdates[oldSummaryKey] = increment(-1);
              summaryUpdates[`classes.${classKey}.${oldSummaryKey}`] = increment(-1);
            }
            if (newSummaryKey) {
              summaryUpdates[newSummaryKey] = increment(1);
              summaryUpdates[`classes.${classKey}.${newSummaryKey}`] = increment(1);
            }
            transaction.set(summaryRef, summaryUpdates, { merge: true });
          }
        }

        updatePeriodSummaries(firestore, transaction, schoolId, docSnap.id, collectionName, dateStr, oldStatus, newStatus, classKey, academicYear);
        return "noCheckout" as const;
      }

      return null;
    });

    if (outcome === "absent") {
      result.absent++;
      result.absentNames.push(getDisplayName(docSnap));
    }
    else if (outcome === "noCheckout") result.noCheckout++;
  }

  return result;
};

/**
 * รวมยอด "การสแกนจริง" ของวันนั้นจากสรุปประจำวัน (Todaysummary): มา/สาย/ไม่ลงเวลาออก
 * ไม่นับ "ขาด" (อาจเกิดจากการตัดรอบเอง) และไม่นับ ลา/ไปราชการ (ใบอนุมัติเขียนเอกสารไว้ล่วงหน้า ไม่ใช่การสแกน)
 * ผลเป็น 0 แปลว่าวันนั้นไม่มีใครสแกนเลย (เช่น ไฟดับ/ระบบใช้ไม่ได้/ยังไม่ได้ใช้ระบบ) — ตรงกับที่ Cloud Function
 * ตัดขาดอัตโนมัติ (functions/autoAbsence.js getScanActivity) ใช้ตัดสินใจข้ามกลุ่ม
 */
export const getDailySummaryTotal = async (
  schoolId: string,
  userType: "students" | "teachers",
  dateStr: string
): Promise<number> => {
  const snap = await getDoc(doc(firestore, "school-settings", schoolId, "Todaysummary", `${userType}_${dateStr}`));
  if (!snap.exists()) return 0;
  const data = snap.data();
  return ["present", "late", "noCheckout"].reduce(
    (sum, key) => sum + Math.max(0, Number(data[key]) || 0),
    0
  );
};
