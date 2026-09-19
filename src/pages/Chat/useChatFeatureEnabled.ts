import { useEffect, useState } from "react";
import { doc, onSnapshot } from "firebase/firestore";
import { firestore } from "@/firebase";
import { useEffectiveSchoolId } from "@/hooks/useEffectiveSchool";
import { isFeatureFlagEnabled } from "@/utils/featureFlags";
import { getChatSchoolId } from "./chatConstants";

/**
 * เช็คว่าโรงเรียนนี้เปิดใช้งานฟีเจอร์แชทหรือยัง (ตั้งค่าได้ที่ /owner/school-info/{schoolId} —
 * ฟีเจอร์นี้อยู่ใน DEFAULT_DISABLED_FEATURE_FLAGS ของ featureFlags.ts จึงเริ่มต้น "ปิด" ไว้ก่อนทุก
 * โรงเรียน ต้องให้ owner/school_admin มาเปิดเองอย่างจงใจ) — ฟัง realtime เพราะถ้า admin เปิด/ปิดระหว่าง
 * ที่มีคนใช้งานอยู่ อยากให้ไอคอนแชท/หน้าต่างแชทหายไปทันทีโดยไม่ต้องรีเฟรชหน้า
 *
 * คืนค่า null ระหว่างที่ยังไม่รู้ผลจริง (รอบแรกก่อน onSnapshot ตอบกลับ) แยกจาก false (รู้ผลแล้วว่าปิด)
 * เพราะ ChatWidgetProvider ต้องแยกให้ออกว่า "ยังไม่รู้" กับ "ปิดจริง" ไม่งั้นหน้าต่างแชทที่ restore
 * มาจาก localStorage ตอนโหลดหน้าจะถูกเคลียร์ทิ้งไปทุกครั้งเพราะเข้าใจผิดว่าฟีเจอร์ปิดอยู่
 */
export const useChatFeatureEnabled = (): boolean | null => {
  const schoolId = getChatSchoolId(useEffectiveSchoolId());
  const [enabled, setEnabled] = useState<boolean | null>(null);

  useEffect(() => {
    if (!schoolId) {
      setEnabled(null);
      return;
    }
    const unsub = onSnapshot(doc(firestore, "school-settings", schoolId), (snap) => {
      setEnabled(isFeatureFlagEnabled(snap.exists() ? snap.data().features : null, "chat"));
    }, (error) => {
      console.error("Error checking chat feature flag:", error);
      setEnabled(false);
    });
    return () => unsub();
  }, [schoolId]);

  return enabled;
};
