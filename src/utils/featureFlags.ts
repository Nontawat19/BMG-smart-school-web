// Feature flags ส่วนใหญ่ในระบบ (เก็บที่ school-settings/{schoolId}.features) มีค่าเริ่มต้น = "เปิดใช้งาน"
// ถ้ายังไม่เคยตั้งค่า (undefined) — โรงเรียนเดิมที่มีอยู่แล้วจึงไม่ถูกกระทบตอนเพิ่ม flag ใหม่เข้าไปในโค้ด
// แต่ฟีเจอร์บางตัวที่เพิ่มทีหลังต้องการให้ "ปิด" เป็นค่าเริ่มต้นแทน (ให้ owner/school_admin ต้องมาเปิดเอง
// อย่างจงใจที่ /owner/school-info) — ใส่ key ไว้ในลิสต์นี้ที่เดียว แล้วใช้ isFeatureFlagEnabled ทุกจุดที่เช็ค
// แทนการเทียบ === false / ?? true ตรงๆ กระจายไปหลายไฟล์
const DEFAULT_DISABLED_FEATURE_FLAGS = new Set<string>(["dailyAttendanceCheck"]);

export const isFeatureFlagEnabled = (
  features: Record<string, any> | null | undefined,
  flagKey: string
): boolean => {
  const value = features?.[flagKey];
  if (value === true) return true;
  if (value === false) return false;
  return !DEFAULT_DISABLED_FEATURE_FLAGS.has(flagKey);
};
