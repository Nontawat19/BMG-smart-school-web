import { doc, increment, WriteBatch, Transaction, serverTimestamp, collectionGroup, query, where, getDocs, setDoc, writeBatch } from "firebase/firestore";

// WriteBatch และ Transaction ของ Firestore มี .set()/.update() ที่ทำงานเหมือนกันตอน runtime แต่ TypeScript
// ไม่ยอมให้เรียก method ผ่าน union ของ overloaded function ตรงๆ (TS2349) จึงต้อง type เป็น any ตรงนี้
// เพื่อให้ฟังก์ชันกลุ่มนี้ใช้แทนกันได้ทั้งสองแบบ — เรียกผ่าน transaction ได้เพื่ออ่านสดแล้วเขียนแบบ atomic
// (ป้องกัน TOCTOU/double-fire) โดยไม่ต้องแตกฟังก์ชันซ้ำ
export type SummaryWriter = WriteBatch | Transaction | any;

/**
 * Calculates the ISO week number for a given date.
 */
export const getWeekNumber = (date: Date): string => {
    const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
    const dayNum = d.getUTCDay() || 7;
    d.setUTCDate(d.getUTCDate() + 4 - dayNum);
    const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
    const weekNo = Math.ceil((((d.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
    return `${d.getUTCFullYear()}-W${String(weekNo).padStart(2, '0')}`;
};

/**
 * Determines the academic year and semester based on the date.
 * This is a simplified logic and might need adjustment based on school's specific term dates.
 * Currently assumes:
 * Term 1: May - Sep
 * Term 2: Oct - Mar
 * (April is break/summer, usually part of previous academic year or special)
 * 
 * For now, we'll rely on the caller or use a standard Thai academic year logic if not provided.
 */
const getAcademicYearAndTerm = (date: Date): { year: string, term: string } => {
    const month = date.getMonth() + 1; // 1-12
    const year = date.getFullYear(); // AD

    // Convert to BE if it's currently AD
    let beYear = year < 2500 ? year + 543 : year;
    let academicYear = beYear;
    let term = "1";

    // Thai Academic Year Logic (Approximate)
    // Term 1: May - Oct
    // Term 2: Nov - Apr
    if (month >= 5 && month <= 10) {
        term = "1";
        academicYear = beYear;
    } else if (month >= 11) {
        term = "2";
        academicYear = beYear;
    } else if (month <= 4) {
        term = "2";
        academicYear = beYear - 1; // Ends in (e.g.) March 2569, but belongs to academic year 2568
    }

    return { year: String(academicYear), term };
};

export const getPeriodKeys = (dateStr: string, academicYearOverride?: string) => {
    const date = new Date(dateStr);
    const weekKey = getWeekNumber(date);
    const monthKey = dateStr.substring(0, 7); // YYYY-MM

    const { year: acYear, term } = getAcademicYearAndTerm(date);
    const yearKey = academicYearOverride || acYear; // Use provided academic year or fallback
    const semesterKey = `${yearKey}-${term}`;

    return { weekKey, monthKey, yearKey, semesterKey };
};

export const getStatusKey = (status: string): string | null => {
    if (!status) return null;
    const s = status.toLowerCase();
    if (['มา', 'ontime', 'present'].includes(s)) return 'present';
    if (['สาย', 'late'].includes(s)) return 'late';
    if (['ไม่ลงเวลาออก', 'nocheckout'].includes(s)) return 'noCheckout';
    // startsWith (not includes) — a plain `includes('ลา')` also matches "ไม่ลงเวลาออก" because
    // "เวลา" contains the substring "ลา", silently miscounting no-checkout as leave. Catches leave
    // sub-types like "ลาป่วย"/"ลากิจ" (which always start with ลา) without that false match.
    if (['ลา', 'leave'].includes(s) || s.startsWith('ลา')) return 'leave';
    if (['ขาด', 'absent'].includes(s)) return 'absent';
    if (['ไปราชการ', 'officialtravel'].includes(s)) return 'officialTravel'; // Updated key
    // NoCheckout, EarlyReturn usually counted as present in summary but tracked separately if needed
    // For standard summary:
    if (['กลับก่อน', 'earlyreturn'].includes(s)) return 'early'; // Return early for logic check if needed, but map to present/late for calculation
    return null;
};

// Helper for mapping status to Daily Summary Fields
const getDailySummaryField = (status: string): string | null => {
    if (!status) return null;
    const s = status.toLowerCase();

    // Exact mapping to fields in Daily Summary
    if (['มา', 'ontime', 'present', 'earlyreturn', 'กลับก่อน', 'early'].includes(s)) return 'present';
    if (['สาย', 'late'].includes(s)) return 'late';
    if (['ไม่ลงเวลาออก', 'nocheckout'].includes(s)) return 'noCheckout';
    // startsWith (not includes) — see getStatusKey above for why plain `includes('ลา')` is wrong here.
    if (['ลา', 'leave'].includes(s) || s.startsWith('ลา')) return 'leave';
    if (['ขาด', 'absent'].includes(s)) return 'absent';
    if (['ไปราชการ', 'officialtravel'].includes(s)) return 'officialTravel';

    return null;
};

/**
 * แยกประเภทวันลาจากข้อความ leaveType (เช่น "ลาป่วย" / "ลากิจ") ให้เป็น sub-type เดียวกัน
 * ทุกจุดที่ต้องแยกลาป่วย/ลากิจ ต้องเรียกใช้ฟังก์ชันนี้ตัวเดียว ห้ามเขียน substring check ซ้ำที่อื่น
 * เพื่อกันไม่ให้การนับเพี้ยนไม่ตรงกันระหว่างจุดที่แสดงผลต่างๆ
 */
export const classifyLeaveSubType = (leaveTypeText: string | null | undefined): 'sick' | 'personal' | 'other' => {
    const text = leaveTypeText || "";
    if (text.includes("ป่วย")) return 'sick';
    if (text.includes("กิจ")) return 'personal';
    return 'other';
};

/**
 * Updates period summaries (Week, Month, Year, Semester) for a student or teacher.
 */
export const updatePeriodSummaries = (
    firestore: any,
    batch: SummaryWriter,
    schoolId: string,
    userId: string,
    userType: 'students' | 'teachers',
    dateStr: string,
    oldStatus: string | null,
    newStatus: string | null,
    classId?: string, // Optional class/grade for breakdown
    academicYear?: string // Optional override from Firestore settings
) => {
    const { weekKey, monthKey, yearKey, semesterKey } = getPeriodKeys(dateStr, academicYear);

    // Map status for Period Summary (which groups early return into present)
    const getPeriodStatusMapping = (st: string | null) => {
        if (!st) return null;
        const key = getStatusKey(st);
        if (key === 'early') return 'present'; // Standardize early return as present for summary
        return key;
    };

    const oldKey = getPeriodStatusMapping(oldStatus);
    const newKey = getPeriodStatusMapping(newStatus);

    if (oldKey !== newKey) {
        const updates: any = {};
        if (oldKey) updates[oldKey] = increment(-1);
        if (newKey) updates[newKey] = increment(1);

        if (Object.keys(updates).length > 0) {
            // 1. Weekly
            const weekRef = doc(firestore, 'school-settings', schoolId, userType, userId, 'Weeksummary', weekKey);
            batch.set(weekRef, updates, { merge: true });

            // 2. Monthly
            const monthRef = doc(firestore, 'school-settings', schoolId, userType, userId, 'Monthsummary', monthKey);
            batch.set(monthRef, updates, { merge: true });

            // 3. Yearly
            const yearRef = doc(firestore, 'school-settings', schoolId, userType, userId, 'Yearsummary', yearKey);
            batch.set(yearRef, updates, { merge: true });

            // 4. Semester
            const termRef = doc(firestore, 'school-settings', schoolId, userType, userId, 'Semestersummary', semesterKey);
            batch.set(termRef, updates, { merge: true });
        }
    }

    // --- Update Daily Summary (Todaysummary) ---
    updateDailySummary(firestore, batch, schoolId, userType, dateStr, oldStatus, newStatus, classId);
};

/**
 * Updates Daily Summary (Todaysummary/{students|teachers}/{date})
 * This summary counts TOTAL users in each status for the WHOLE SCHOOL for that day.
 */
export const updateDailySummary = (
    firestore: any,
    batch: SummaryWriter,
    schoolId: string,
    userType: 'students' | 'teachers',
    dateStr: string,
    oldStatus: string | null,
    newStatus: string | null,
    classId?: string
) => {
    const oldField = oldStatus ? getDailySummaryField(oldStatus) : null;
    const newField = newStatus ? getDailySummaryField(newStatus) : null;

    console.log(`[updateDailySummary] UserType: ${userType}, Date: ${dateStr}, Old: ${oldStatus}(${oldField}), New: ${newStatus}(${newField})`);

    if (oldField === newField) {
        console.log(`[updateDailySummary] Fields are same, skipping update.`);
        return;
    }

    // Use Todaysummary collection with userType_dateStr as document ID
    const summaryRef = doc(firestore, 'school-settings', schoolId, 'Todaysummary', `${userType}_${dateStr}`);
    const updates: any = { updatedAt: serverTimestamp(), type: userType, date: dateStr }; // Store type and date for easier query

    if (oldField) {
        updates[oldField] = increment(-1);
        if (classId) {
            updates[`classes.${classId}.${oldField}`] = increment(-1);
        }
    }
    if (newField) {
        updates[newField] = increment(1);
        if (classId) {
            updates[`classes.${classId}.${newField}`] = increment(1);
        }
    }

    if (Object.keys(updates).length > 1) { // > 1 because updatedAt is always there
        batch.set(summaryRef, updates, { merge: true });
    }
};

/**
 * Manually syncs Daily Summary (Todaysummary) from existing attendance records for a specific date.
 * Useful for initializing data or correcting discrepancies.
 */
export const syncDailySummary = async (firestore: any, schoolId: string, dateStr: string) => {
    try {
        console.log(`[syncDailySummary] Starting sync for ${dateStr}...`);

        // 1. Fetch ALL attendance records for the date across the school
        const q = query(
            collectionGroup(firestore, 'attendance'),
            where('schoolId', '==', schoolId),
            where('date', '==', dateStr)
        );
        const snapshot = await getDocs(q);

        if (snapshot.empty) {
            console.log(`[syncDailySummary] No attendance records found for ${dateStr}.`);
            return;
        }

        // 2. Aggregate counts locally
        const studentsSummary: any = { type: 'students', date: dateStr, updatedAt: serverTimestamp() };
        const teachersSummary: any = { type: 'teachers', date: dateStr, updatedAt: serverTimestamp() };
        const studentClasses: any = {};

        snapshot.forEach(doc => {
            const data = doc.data();
            const userType = data.userType || (doc.ref.path.includes('students') ? 'students' : 'teachers');
            const status = data.status;
            const field = getDailySummaryField(status);
            const classLevel = data.classLevel; // Only for students

            if (field) {
                if (userType === 'student' || userType === 'students') {
                    studentsSummary[field] = (studentsSummary[field] || 0) + 1;
                    if (classLevel) {
                        const cls = classLevel.trim();
                        if (!studentClasses[cls]) studentClasses[cls] = {};
                        studentClasses[cls][field] = (studentClasses[cls][field] || 0) + 1;
                    }
                } else if (userType === 'teacher' || userType === 'teachers') {
                    teachersSummary[field] = (teachersSummary[field] || 0) + 1;
                }
            }
        });

        // 3. Update Firestore
        // writeBatch imported from firebase/firestore
        const batch = writeBatch(firestore);

        const studentsRef = doc(firestore, 'school-settings', schoolId, 'Todaysummary', `students_${dateStr}`);
        const teachersRef = doc(firestore, 'school-settings', schoolId, 'Todaysummary', `teachers_${dateStr}`);

        // Construct update object with nested class data
        const studentUpdates = { ...studentsSummary, classes: studentClasses };

        batch.set(studentsRef, studentUpdates);
        batch.set(teachersRef, teachersSummary);

        await batch.commit();
        console.log(`[syncDailySummary] Sync complete for ${dateStr}.`);
        console.log(`[syncDailySummary] Students:`, studentUpdates);
        console.log(`[syncDailySummary] Teachers:`, teachersSummary);
    } catch (error) {
        console.error("[syncDailySummary] Error:", error);
        throw error;
    }
};

