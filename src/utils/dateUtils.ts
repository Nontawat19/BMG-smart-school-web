/**
 * Returns today's date in YYYY-MM-DD format (local time).
 * Uses 'en-CA' locale which outputs YYYY-MM-DD reliably.
 */
export const getTodayString = (): string => {
    const now = new Date();
    return now.toLocaleDateString("en-CA", { timeZone: "Asia/Bangkok" }); // Ensure consistent timezone
};

/**
 * Returns the current year in Buddhist Era (BE).
 */
export const getCurrentThaiYear = (): number => {
    return getThaiYear(new Date());
};

/**
 * Returns the Buddhist Era (BE) year for a given date.
 */
export const getThaiYear = (date: Date): number => {
    return date.getFullYear() + 543;
};

const THAI_MONTHS_SHORT = [
    "ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.",
    "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค.",
];

const pad2 = (n: number) => String(n).padStart(2, "0");

/**
 * แสดงเวลาการแจ้งเตือนแบบทางการ:
 * - < 1 นาที   → "เมื่อสักครู่"
 * - 1–59 นาที  → "X นาทีที่แล้ว"
 * - 1–23 ชม.   → "X ชั่วโมงที่แล้ว"
 * - วันนี้      → "วันนี้ HH:mm น."
 * - เมื่อวาน   → "เมื่อวาน HH:mm น."
 * - ปีนี้       → "D MMM HH:mm น." (เช่น "17 มิ.ย. 18:16 น.")
 * - ปีอื่น      → "D MMM YYYY" พ.ศ. (เช่น "17 มิ.ย. 2568")
 */
export const formatNotificationTime = (date: Date): string => {
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMin = Math.floor(diffMs / 60_000);
    const diffHour = Math.floor(diffMs / 3_600_000);

    if (diffMin < 1) return "เมื่อสักครู่";
    if (diffMin < 60) return `${diffMin} นาทีที่แล้ว`;
    if (diffHour < 24) return `${diffHour} ชั่วโมงที่แล้ว`;

    const hhmm = `${pad2(date.getHours())}:${pad2(date.getMinutes())} น.`;
    const day = date.getDate();
    const month = THAI_MONTHS_SHORT[date.getMonth()];
    const beYear = date.getFullYear() + 543;
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const yesterdayStart = new Date(todayStart.getTime() - 86_400_000);

    if (date >= todayStart) return `วันนี้ ${hhmm}`;
    if (date >= yesterdayStart) return `เมื่อวาน ${hhmm}`;
    if (date.getFullYear() === now.getFullYear()) return `${day} ${month} ${hhmm}`;
    return `${day} ${month} ${beYear}`;
};
