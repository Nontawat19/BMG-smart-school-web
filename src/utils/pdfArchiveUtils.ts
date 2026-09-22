import { ref, uploadBytes, getDownloadURL } from "firebase/storage";
import { storage } from "@/firebase";

/**
 * อัปโหลดสำเนา PDF ของเอกสารทางการ (ใบลา, หนังสือรับรอง, คำร้อง ฯลฯ) ขึ้น Firebase Storage
 * เก็บไว้ "ตามสภาพ ณ เวลาที่ออก" — ไม่ใช้ path คงที่ที่เขียนทับกันได้ (ต่างจากแคช PDF ที่แก้ไขได้ เช่น ปพ.5)
 * เพราะถ้าข้อมูลต้นทาง (เช่น เกรด, สถานะอนุมัติ) ถูกแก้ไขภายหลัง การ generate ใหม่จะได้ไฟล์ไม่ตรงกับฉบับที่
 * เคยออก/เซ็นชื่อไปจริง — แต่ละครั้งที่ออกเอกสารจึงได้ path ใหม่เสมอ (กันชื่อไฟล์ชนกันด้วย timestamp)
 *
 * category ตัวอย่าง: "certificates" (ปพ.7), "student-report-cards" (ปพ.6), "behavior-records" (บ.ค.14),
 * "official-travel", "grade-incomplete-notices" (0/ร/มส), "grade-announcements", "student-leaves",
 * "teacher-leaves", "home-visits", "teaching-assignments", "remediation-requests"
 */
export const archiveGeneratedPdf = async (
  schoolId: string,
  category: string,
  blob: Blob,
  fileNameHint: string
): Promise<{ url: string; storagePath: string }> => {
  // กันชื่อไฟล์มีอักขระที่ใช้เป็น path ของ Storage ไม่ได้ (/, ช่องว่างเยอะๆ) และกันชนกันด้วย timestamp นำหน้า
  const safeName = fileNameHint.replace(/[^\p{L}\p{N}._-]+/gu, "_").replace(/_+/g, "_").slice(0, 150);
  const storagePath = `school-settings/${schoolId}/generated-documents/${category}/${Date.now()}_${safeName || "document.pdf"}`;
  const storageRef = ref(storage, storagePath);
  await uploadBytes(storageRef, blob, { contentType: "application/pdf" });
  const url = await getDownloadURL(storageRef);
  return { url, storagePath };
};
