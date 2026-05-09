import { isNonOfficialHoliday } from '@/utils/calendarUtils';

/**
 * ฟังก์ชันสำหรับแปลง Date object เป็น String รูปแบบ YYYY-MM-DD (Local Time)
 */
export const formatDateToLocalISO = (date: Date): string => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
};

/**
 * ฟังก์ชันสำหรับวิเคราะห์ว่าเป็นวันหยุดหรือไม่ โดยเช็คจาก:
 * 1. ข้อมูลปฏิทินที่รวบรวมมาจาก Firestore (mergedEvents)
 * 2. วันเสาร์-อาทิตย์ (ยกเว้นมีระบุว่าเป็นวันเรียนชดเชย)
 */
export const checkIsHolidayLocal = (
    date: Date,
    calendarEvents: Record<string, any>
): { isHoliday: boolean; reason: 'holiday' | 'weekend' | 'term_break' | 'none'; description: string } => {
    const dateStr = formatDateToLocalISO(date);
    const event = calendarEvents[dateStr];
    const dayOfWeek = date.getDay(); // 0 = Sunday, 6 = Saturday

    // 1. เช็คจากปฏิทินโรงเรียนใน Firestore
    if (event) {
        if (event.type === 'schoolDay') {
            return { isHoliday: false, reason: 'none', description: event.description || 'วันเรียนชดเชย/กิจกรรม' };
        }
        if (event.type === 'holiday' || event.type === 'specialHoliday') {
            return { isHoliday: true, reason: 'holiday', description: event.description || 'วันหยุด' };
        }
    }

    // 2. เช็ควันเสาร์-อาทิตย์
    if (dayOfWeek === 0 || dayOfWeek === 6) {
        return { isHoliday: true, reason: 'weekend', description: 'วันหยุดเสาร์-อาทิตย์' };
    }

    return { isHoliday: false, reason: 'none', description: '' };
};
