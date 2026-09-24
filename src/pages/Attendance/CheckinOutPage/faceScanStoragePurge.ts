import { ref, listAll, deleteObject } from "firebase/storage";
import { storage } from "@/firebase";

/**
 * ลบภาพถ่ายสแกนใบหน้า (face scan snapshots) ทั้งของครูและนักเรียนที่เก่าเกิน 2 วันออกจาก Firebase Storage
 * เพื่อให้สอดคล้องกับ พ.ร.บ. คุ้มครองข้อมูลส่วนบุคคล (PDPA) และป้องกันไม่ให้พื้นที่จัดเก็บ (Storage) โตเกินไป
 *
 * โครงสร้างโฟลเดอร์ใน Storage:
 * school-settings/{schoolId}/face-scan-snapshots/{YYYY-MM-DD}/{safeUserId}-{timestamp}.jpg
 *
 * ฟังก์ชันนี้จะตรวจสอบชื่อโฟลเดอร์ที่เป็นวันที่ (YYYY-MM-DD)
 * หากเก่ากว่า 2 วัน (นับตามเขตเวลาไทย) จะทำการลบไฟล์ทั้งหมดในโฟลเดอร์นั้น
 * และทำงานแบบ throttling ทุกๆ 6 ชั่วโมงต่อเซสชันเพื่อประหยัดจำนวน Storage API Call
 */
export const purgeExpiredFaceScanSnapshots = async (schoolId: string, daysToKeep: number = 2) => {
  if (!schoolId) return;

  const throttleKey = `last_face_scan_storage_purge_2d_${schoolId}`;
  try {
    const lastPurge = localStorage.getItem(throttleKey);
    const now = Date.now();
    // ถ้าเพิ่งรันไปภายใน 6 ชั่วโมงที่ผ่านมา ให้ข้าม
    if (lastPurge && now - Number(lastPurge) < 6 * 60 * 60 * 1000) {
      return;
    }
  } catch {
    // ignore localStorage quota error
  }

  try {
    const parentRef = ref(storage, `school-settings/${schoolId}/face-scan-snapshots`);
    const rootRes = await listAll(parentRef);

    // กำหนดวัน cutoff ย้อนหลัง daysToKeep วัน (ตามมาตรฐาน PDPA 2 วัน เขตเวลาไทย)
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - daysToKeep);
    const cutoffStr = cutoffDate.toLocaleDateString("en-CA", { timeZone: "Asia/Bangkok" });

    let deletedCount = 0;
    for (const folderRef of rootRes.prefixes) {
      const folderDateStr = folderRef.name; // e.g. "2026-09-22"
      // ตรวจสอบว่าชื่อโฟลเดอร์เป็นรูปแบบ YYYY-MM-DD
      if (/^\d{4}-\d{2}-\d{2}$/.test(folderDateStr)) {
        if (folderDateStr < cutoffStr) {
          // โฟลเดอร์นี้เก่ากว่าระยะเวลาที่กำหนด — ลบไฟล์ทั้งหมดในโฟลเดอร์
          try {
            const folderContent = await listAll(folderRef);
            await Promise.all(
              folderContent.items.map(async (fileRef) => {
                try {
                  await deleteObject(fileRef);
                  deletedCount++;
                } catch (delErr) {
                  console.warn(`[FaceScanPurge] Failed to delete file ${fileRef.fullPath}:`, delErr);
                }
              })
            );
          } catch (folderErr) {
            console.warn(`[FaceScanPurge] Failed to list folder ${folderRef.fullPath}:`, folderErr);
          }
        }
      }
    }

    try {
      localStorage.setItem(throttleKey, String(Date.now()));
    } catch {
      // ignore
    }

    if (deletedCount > 0) {
      console.log(`[FaceScanPurge] Purged ${deletedCount} expired face scan snapshot(s) older than ${daysToKeep} days (${cutoffStr}) for school ${schoolId} (PDPA compliance)`);
    }
  } catch (error) {
    console.error("[FaceScanPurge] Error checking/purging expired face scan snapshots:", error);
  }
};
