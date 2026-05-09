
import { Timestamp } from "firebase/firestore";

export type AttendanceStatus = 'present' | 'late' | 'leave' | 'absent' | 'officialTravel';

// Interface for different data sources
export interface GateRecord {
    checkinTime?: string; // HH:mm
    status?: string; // 'มา', 'สาย', etc.
}

export interface FlagRecord {
    status?: string; // 'มา', 'ขาด', 'สาย', 'ลา'
}

export interface LeaveRecord {
    type?: string; // e.g. 'ลากิจ', 'ลาป่วย'
    id?: string;
}

export interface TravelRecord {
    id?: string;
    subject?: string;
}

export interface AttendanceStatusResult {
    finalStatus: AttendanceStatus;
    description: string;
    priority: number; // Higher number = Higher priority
}

/**
 * Calculates the final attendance status based on all available data sources.
 * Priority: Travel/Leave > Gate > Flag
 */
export const calculateAttendanceStatus = (
    gate: GateRecord | null,
    flag: FlagRecord | null,
    leave: LeaveRecord | null,
    travel: TravelRecord | null,
    config: { studentLateTime: string } = { studentLateTime: '07:50' }
): AttendanceStatusResult => {

    // 1. Check High Priority (Leave / Official Travel)
    if (travel) {
        return {
            finalStatus: 'officialTravel',
            description: 'ไปราชการ',
            priority: 100
        };
    }

    if (leave) {
        return {
            finalStatus: 'leave',
            description: `ลา (${leave.type || 'ไม่ระบุ'})`,
            priority: 90
        };
    }

    // 2. Check Gate Check-in
    // If Gate says "Present/Late", it confirms physical presence.
    if (gate && gate.status) {
        // Case: Gate = Late
        if (gate.status === 'สาย' || gate.status === 'late') {
            return {
                finalStatus: 'late',
                description: 'มาสาย (ลงเวลา)',
                priority: 80
            };
        }

        // Case: Gate = Present
        if (gate.status === 'มา' || gate.status === 'present') {
            // Check Flag for conflict
            if (flag && (flag.status === 'ขาด' || flag.status === 'absent')) {
                // Gate=Present, Flag=Absent => "Skipped Assembly" but statistically "Present"
                return {
                    finalStatus: 'present',
                    description: 'มา (ไม่เข้าแถว)',
                    priority: 70
                };
            }
            // Gate=Present, Flag=Late => "Present" (Gate time rules)
            return {
                finalStatus: 'present',
                description: 'มาปกติ',
                priority: 70
            };
        }
    }

    // 3. Status based ONLY on Flag Ceremony (No Gate Check-in)
    // "ถ้าเด็กไม่ลงเวลา แต่มาเข้าแถว เราควรเพิ่มฟีเจอร์เป็น มาสายใหม" --> YES
    if (flag) {
        if (flag.status === 'มา' || flag.status === 'present') {
            // Auto-Late Logic
            return {
                finalStatus: 'late',
                description: 'มาสาย (ไม่ลงเวลา)',
                priority: 60
            };
        }
        if (flag.status === 'สาย' || flag.status === 'late') {
            return {
                finalStatus: 'late',
                description: 'มาสาย (เช็คหน้าเสาธง)',
                priority: 60
            };
        }
        // Flag says Absent, and no Gate => Absent
        if (flag.status === 'ขาด' || flag.status === 'absent') {
            return {
                finalStatus: 'absent',
                description: 'ขาด',
                priority: 50
            };
        }
    }

    // 4. No Data
    return {
        finalStatus: 'absent',
        description: 'ขาด (ไม่พบข้อมูล)',
        priority: 0
    };
};

/**
 * Standardizes status string to English key for Aggregation
 */
export const getStatusKey = (status: AttendanceStatus | string): string => {
    const s = status.toLowerCase();
    if (['officialtravel', 'ไปราชการ'].includes(s)) return 'officialTravel';
    if (['leave', 'ลา', 'ลากิจ', 'ลาป่วย'].includes(s)) return 'leave';
    if (['late', 'สาย'].includes(s)) return 'late';
    if (['present', 'มา'].includes(s)) return 'present';
    return 'absent'; // Default
};
