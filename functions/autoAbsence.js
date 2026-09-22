"use strict";

// ตัดสถานะ "ขาด" อัตโนมัติฝั่งเซิร์ฟเวอร์ — ไม่ต้องรอให้มีเครื่องเปิดหน้าลงเวลาค้างไว้
//
// กติกา:
//  - คำนวณ "ครั้งเดียวต่อวัน" หลังสิ้นสุดการลงเวลาออกของทั้งนักเรียนและครู (ใช้เวลาที่ช้ากว่าระหว่าง
//    attendanceConfig.studentCheckoutEnd กับ teacherCheckoutEnd)
//  - ทั้งนักเรียนและครู: คนที่ไม่มีบันทึกลงเวลาเลย (ไม่ลงเวลาเข้าและไม่ลงเวลาออก) → "ขาด"
//  - ข้ามวันหยุด/เสาร์อาทิตย์ (ยกเว้นวันสอนชดเชย) และช่วงปิดภาคเรียนตามปฏิทินโรงเรียน
//  - ข้ามกลุ่มที่ "ทั้งวันไม่มีใครสแกนเลย" (เช่น ไฟดับ/ระบบใช้ไม่ได้) — ไม่ตัดขาดทั้งกลุ่มโดยอัตโนมัติ
//  - เปิดใช้เป็นรายโรงเรียนด้วย attendanceConfig.autoMarkAbsent === true (ปิดไว้เป็นค่าเริ่มต้น)
//  - ทำเป็นทรานแซกชันต่อคน (อ่านเอกสารล่าสุดก่อนเขียน) รันซ้ำกี่ครั้งก็ไม่ตัด/บวกตัวนับซ้ำ
//
// ตัวนับสรุป (Week/Month/Year/Semester/Todaysummary) และการหักคะแนนพฤติกรรมของนักเรียนเขียนให้เหมือนกับที่
// ฝั่งหน้าเว็บทำ (src/utils/periodSummaryUtils.ts, src/utils/behaviorScoreUtils.ts) — ถ้าแก้ตรงนั้น ต้องแก้ที่นี่ด้วย

const admin = require("firebase-admin");

const ATTENDANCE_ENTRY_ROLES = ["student_attendance", "teacher_attendance", "school_attendance"];
const ACTIVE_STUDENT_STATUS = "กำลังศึกษาอยู่";
const ACTIVE_STUDENT_ALIASES = ["กำลังศึกษา", "กำลังศึกษาอยู่", "เรียนอยู่", "active", "ปกติ"];
const ACTIVE_TEACHER_STATUS = "อยู่";

// ควบคุมค่าอ่าน/เขียนและเวลาทำงาน
const MAX_ATTEMPTS_PER_GROUP = 3;        // ลองตัดขาดกลุ่มเดียวกันได้ไม่เกินกี่ครั้งต่อวัน (กันอ่านข้อมูลทั้งโรงเรียนซ้ำวนไม่จบเมื่อมีข้อผิดพลาดถาวร)
const SCHOOL_CONCURRENCY = 4;            // ประมวลผลกี่โรงเรียนพร้อมกัน
const RUN_TIME_BUDGET_MS = 8 * 60 * 1000; // หยุดเริ่มโรงเรียนใหม่เมื่อเกินเวลานี้ (ฟังก์ชันมี timeout 9 นาที) — ที่เหลือรอบหน้าทำต่อ

const pad2 = (n) => String(n).padStart(2, "0");

// เวลาตัดรอบของแต่ละโรงเรียนอ่านจาก attendanceConfig ของโรงเรียนนั้นเอง (เวลาไทย) — ต้องเป็นรูปแบบ HH:mm
// (เทียบเป็นสตริงได้) ถ้าค่าเสียหรือว่างใช้ค่าเริ่มต้น; รอบสุดท้ายของวันที่ Cloud Scheduler เรียกคือ 23:45
// จึงจำกัดเวลาตัดรอบไม่เกินนั้น (ไม่งั้นโรงเรียนที่ตั้งไว้ 23:50–23:59 จะไม่ถูกประมวลผลเลยในวันนั้น)
const LAST_RUN_TIME = "23:45";
const normalizeTime = (value, fallback) => {
    const text = String(value || "").trim();
    return /^([01]\d|2[0-3]):[0-5]\d$/.test(text) ? text : fallback;
};
const getRunAfterTime = (attendanceConfig) => {
    const cfg = attendanceConfig || {};
    const studentEnd = normalizeTime(cfg.studentCheckoutEnd, "18:00");
    const teacherEnd = normalizeTime(cfg.teacherCheckoutEnd, "18:00");
    const later = studentEnd > teacherEnd ? studentEnd : teacherEnd;
    return later > LAST_RUN_TIME ? LAST_RUN_TIME : later;
};

/** วัน/เวลาปัจจุบันตามเวลาไทย: { dateStr: 'YYYY-MM-DD', timeStr: 'HH:mm', weekday: 'Mon'..'Sun' } */
const getBangkokNow = (nowMs = Date.now()) => {
    const parts = new Intl.DateTimeFormat("en-GB", {
        timeZone: "Asia/Bangkok",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        hourCycle: "h23",
        weekday: "short",
    }).formatToParts(new Date(nowMs));
    const get = (type) => parts.find((p) => p.type === type)?.value || "";
    return {
        dateStr: `${get("year")}-${get("month")}-${get("day")}`,
        timeStr: `${get("hour")}:${get("minute")}`,
        weekday: get("weekday"),
    };
};

// ── ตัวช่วยเลือกคนที่ต้องนับ (พอร์ตจาก src/utils) ─────────────────────────────

const isAttendanceEntryOnly = (role) => {
    const roles = Array.isArray(role)
        ? role.filter((r) => typeof r === "string")
        : typeof role === "string" ? [role] : [];
    if (roles.length === 0) return false;
    return roles.every((r) => ATTENDANCE_ENTRY_ROLES.includes(r.toLowerCase()));
};

const isActiveTeacher = (data) => String(data.status || ACTIVE_TEACHER_STATUS).trim() === ACTIVE_TEACHER_STATUS;

const normalizeStudentStatus = (status) => {
    const normalized = String(status || "").trim();
    const lower = normalized.toLowerCase();
    return ACTIVE_STUDENT_ALIASES.some((s) => s.toLowerCase() === lower) ? ACTIVE_STUDENT_STATUS : normalized;
};

const isStudyingStudent = (data) => {
    const rawStatus = data.status || data.studentStatus;
    if (!rawStatus) return false;
    return normalizeStudentStatus(rawStatus) === ACTIVE_STUDENT_STATUS;
};

/** แปลง Timestamp/Date/สตริงวันที่ เป็น YYYY-MM-DD (เวลาไทย) — null ถ้าอ่านไม่ได้ */
const toBangkokDateString = (value) => {
    if (!value) return null;
    if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}/.test(value)) return value.slice(0, 10);
    const date = typeof value.toDate === "function" ? value.toDate()
        : value instanceof Date ? value
            : typeof value === "string" ? new Date(value) : null;
    if (!date || Number.isNaN(date.getTime())) return null;
    return getBangkokNow(date.getTime()).dateStr;
};

/** วันแรกที่ผู้ใช้ "เริ่มอยู่ในระบบ" — ครูใช้วันที่เริ่มงาน/บรรจุถ้ามี ไม่งั้นใช้วันที่สร้างบัญชี */
const getJoinDateString = (collName, data) => {
    if (collName === "teachers") {
        const start = toBangkokDateString(data.startDate);
        if (start) return start;
    }
    return toBangkokDateString(data.createdAt);
};

// ── คีย์ช่วงเวลาของตัวนับสรุป (พอร์ตจาก periodSummaryUtils.getPeriodKeys) ───────────

const getWeekKey = (y, m, d) => {
    const dt = new Date(Date.UTC(y, m - 1, d));
    const dayNum = dt.getUTCDay() || 7;
    dt.setUTCDate(dt.getUTCDate() + 4 - dayNum);
    const yearStart = new Date(Date.UTC(dt.getUTCFullYear(), 0, 1));
    const weekNo = Math.ceil((((dt.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
    return `${dt.getUTCFullYear()}-W${pad2(weekNo)}`;
};

const getPeriodKeys = (dateStr, academicYearOverride) => {
    const [y, m, d] = dateStr.split("-").map(Number);
    const beYear = y < 2500 ? y + 543 : y;
    let acYear = beYear;
    let term = "1";
    if (m >= 5 && m <= 10) {
        term = "1";
    } else if (m >= 11) {
        term = "2";
    } else {
        term = "2";
        acYear = beYear - 1; // ม.ค.–เม.ย. อยู่ในปีการศึกษาก่อนหน้า
    }
    const yearKey = academicYearOverride ? String(academicYearOverride) : String(acYear);
    return {
        weekKey: getWeekKey(y, m, d),
        monthKey: dateStr.substring(0, 7),
        yearKey,
        semesterKey: `${yearKey}-${term}`,
    };
};

// ── ปฏิทิน: วันนี้ควรตัดขาดหรือไม่ ────────────────────────────────────────────

/** คืน null ถ้าเป็นวันเรียน (ควรตัดขาดได้) ไม่งั้นคืนเหตุผลที่ข้าม */
const getSkipReasonForDate = (dateStr, weekday, calendar) => {
    const events = (calendar && calendar.events) || {};
    const event = events[dateStr];
    const isWeekend = weekday === "Sat" || weekday === "Sun";

    if (event && (event.type === "holiday" || event.type === "specialHoliday")) {
        return `วันหยุด (${event.description || event.type})`;
    }
    if (isWeekend && (!event || event.type !== "schoolDay")) {
        return "วันหยุดประจำสัปดาห์";
    }
    const terms = (calendar && calendar.terms) || {};
    const ranges = [terms.term1, terms.term2].filter((t) => t && t.startDate && t.endDate);
    if (ranges.length > 0 && (!event || event.type !== "schoolDay")) {
        const inTerm = ranges.some((t) => dateStr >= t.startDate && dateStr <= t.endDate);
        if (!inTerm) return "อยู่นอกช่วงภาคเรียน";
    }
    return null;
};

// ── ตัดขาดรายกลุ่ม ────────────────────────────────────────────────────────────

/** ยอดการ "สแกนจริง" ของวันนั้น (มา/สาย/ไม่ลงเวลาออก) — ไม่นับ ขาด/ลา/ไปราชการ ที่ระบบหรือใบอนุมัติเขียนไว้ล่วงหน้า */
const getScanActivity = async (db, schoolId, collName, dateStr) => {
    const snap = await db.doc(`school-settings/${schoolId}/Todaysummary/${collName}_${dateStr}`).get();
    if (!snap.exists) return 0;
    const data = snap.data();
    return ["present", "late", "noCheckout"].reduce((sum, k) => sum + Math.max(0, Number(data[k]) || 0), 0);
};

const getAbsentPenaltyPoints = (behaviorScoreConfig) => {
    const rules = Array.isArray(behaviorScoreConfig && behaviorScoreConfig.attendanceRules) ? behaviorScoreConfig.attendanceRules : [];
    const rule = rules.find((r) => r.statusKey === "absent");
    if (!rule || rule.isActive === false) return 0;
    return Math.max(0, Number(rule.points) || 0);
};

/**
 * ตัด "ขาด" ให้ผู้ใช้กลุ่มหนึ่ง (students | teachers) ของวันนั้น คืนจำนวนที่ถูกตัดใหม่
 * คนที่มีเอกสารลงเวลาของวันนั้นอยู่แล้ว (สแกนจริง/ลา/ไปราชการ/เคยถูกตัดไปแล้ว) จะถูกข้ามเสมอ
 */
const markAbsentForGroup = async ({ db, schoolId, dateStr, collName, behaviorScoreConfig, academicYear }) => {
    const usersSnap = await db.collection(`school-settings/${schoolId}/${collName}`).get();
    const FieldValue = admin.firestore.FieldValue;

    const eligible = usersSnap.docs.filter((docSnap) => {
        const data = docSnap.data();
        if (collName === "teachers") {
            if (isAttendanceEntryOnly(data.role)) return false;
            if (!isActiveTeacher(data)) return false;
        } else if (!isStudyingStudent(data)) {
            return false;
        }
        const joined = getJoinDateString(collName, data);
        if (joined && dateStr < joined) return false; // ยังไม่เริ่มอยู่ในระบบ ณ วันนั้น
        return true;
    });

    // หาคนที่ยังไม่มีเอกสารลงเวลาวันนี้ (อ่านเป็นก้อน) แล้วค่อยทำทรานแซกชันเฉพาะคนเหล่านั้น
    const missing = [];
    const CHUNK = 200;
    for (let i = 0; i < eligible.length; i += CHUNK) {
        const chunk = eligible.slice(i, i + CHUNK);
        const refs = chunk.map((u) => db.doc(`school-settings/${schoolId}/${collName}/${u.id}/attendance/${dateStr}`));
        const snaps = await db.getAll(...refs);
        snaps.forEach((snap, idx) => {
            if (!snap.exists) missing.push(chunk[idx]);
        });
    }

    const { weekKey, monthKey, yearKey, semesterKey } = getPeriodKeys(dateStr, academicYear);
    const penalty = collName === "students" ? getAbsentPenaltyPoints(behaviorScoreConfig) : 0;
    let marked = 0;

    for (const docSnap of missing) {
        const data = docSnap.data();
        const userRef = db.doc(`school-settings/${schoolId}/${collName}/${docSnap.id}`);
        const attRef = userRef.collection("attendance").doc(dateStr);
        const classKey = collName === "students"
            ? (String(data.classLevel || "").trim() || "ไม่ระบุชั้น")
            : null;

        const didMark = await db.runTransaction(async (tx) => {
            const attSnap = await tx.get(attRef);
            if (attSnap.exists) return false; // มีคนสแกนเข้ามาระหว่างนี้ หรือรอบอื่นตัดไปแล้ว
            const freshUserSnap = collName === "students" ? await tx.get(userRef) : null;

            tx.set(attRef, {
                status: "ขาด",
                // ใส่ schoolId/date/userType เหมือนเอกสารที่เกิดจากการสแกนจริง ให้ query รวมทั้งโรงเรียนเจอ
                schoolId,
                date: dateStr,
                userType: collName === "students" ? "student" : "teacher",
                checkinTime: null,
                checkoutTime: null,
                timestamp: admin.firestore.Timestamp.now(),
                updatedAt: FieldValue.serverTimestamp(),
                remark: "Auto-Absent (ระบบตัดขาดอัตโนมัติ)",
            });

            // ตัวนับสรุปช่วงเวลา (สัปดาห์/เดือน/ปี/ภาคเรียน) — เหมือน updatePeriodSummaries(null → "ขาด")
            const periodUpdate = { absent: FieldValue.increment(1) };
            tx.set(userRef.collection("Weeksummary").doc(weekKey), periodUpdate, { merge: true });
            tx.set(userRef.collection("Monthsummary").doc(monthKey), periodUpdate, { merge: true });
            tx.set(userRef.collection("Yearsummary").doc(yearKey), periodUpdate, { merge: true });
            tx.set(userRef.collection("Semestersummary").doc(semesterKey), periodUpdate, { merge: true });

            // สรุปประจำวันทั้งโรงเรียน (Todaysummary/{students|teachers}_{date}) — เหมือน updateDailySummary
            // หมายเหตุ: key "classes.<ชั้น>.absent" เขียนเป็นชื่อฟิลด์ตรงตัว (ไม่ใช่ path) ให้ตรงกับที่ฝั่งหน้าเว็บเขียนด้วย set()
            const dailyUpdate = {
                updatedAt: FieldValue.serverTimestamp(),
                type: collName,
                date: dateStr,
                absent: FieldValue.increment(1),
            };
            if (classKey) dailyUpdate[`classes.${classKey}.absent`] = FieldValue.increment(1);
            tx.set(db.doc(`school-settings/${schoolId}/Todaysummary/${collName}_${dateStr}`), dailyUpdate, { merge: true });

            // หักคะแนนพฤติกรรมนักเรียนตามกติกา "ขาด" ที่โรงเรียนตั้งไว้ (ถ้าไม่ได้ตั้งไว้ = ไม่หัก)
            if (penalty > 0) {
                const freshData = freshUserSnap && freshUserSnap.exists ? freshUserSnap.data() : {};
                let base = Number(freshData.behaviorScore ?? data.behaviorScore ?? 100);
                if (!Number.isFinite(base)) base = Number((behaviorScoreConfig && behaviorScoreConfig.startingScore) ?? 100);
                tx.set(userRef, {
                    behaviorScore: base - penalty,
                    behaviorScoreUpdatedAt: FieldValue.serverTimestamp(),
                    lastBehaviorScoreChange: {
                        delta: -penalty,
                        oldStatus: null,
                        newStatus: "ขาด",
                        updatedAt: FieldValue.serverTimestamp(),
                        source: "attendance",
                    },
                }, { merge: true });
            }
            return true;
        });

        if (didMark) marked++;
    }

    return { eligible: eligible.length, marked };
};

// ── ต่อโรงเรียน ───────────────────────────────────────────────────────────────

/**
 * ตรวจและตัดขาดของ "วันนี้" ให้หนึ่งโรงเรียน (เรียกซ้ำได้ — จดผลของแต่ละกลุ่มไว้ที่
 * school-settings/{id}/attendance_auto_runs/{date} เพื่อไม่ต้องอ่านข้อมูลทั้งโรงเรียนซ้ำทุกรอบ)
 */
const processSchool = async (db, schoolDoc, now) => {
    const schoolId = schoolDoc.id;
    const settings = schoolDoc.data() || {};
    const attendanceConfig = settings.attendanceConfig || {};
    if (attendanceConfig.autoMarkAbsent !== true) return { schoolId, skipped: "ไม่ได้เปิดใช้" };

    // เวลาตัดรอบเดียวของวัน: หลังสิ้นสุดลงเวลาออกของทั้งสองกลุ่ม = เวลาที่ช้ากว่า (สตริง HH:mm เทียบตรงๆ ได้)
    const runAfter = getRunAfterTime(attendanceConfig);

    // ยังไม่ถึงเวลาตัดรอบ → ไม่ต้องอ่านอะไรเพิ่ม (ประหยัดค่าอ่านในรอบก่อนเวลา)
    if (now.timeStr < runAfter) return { schoolId, skipped: `ยังไม่ถึงเวลาตัดรอบ ${runAfter}` };

    const runRef = db.doc(`school-settings/${schoolId}/attendance_auto_runs/${now.dateStr}`);
    const runSnap = await runRef.get();
    const run = runSnap.exists ? runSnap.data() : {};

    const dueGroups = [
        { collName: "students", label: "นักเรียน" },
        { collName: "teachers", label: "ครู" },
    ].filter((g) => {
        const state = run[g.collName] || {};
        if (state.done) return false;
        if ((state.attempts || 0) >= MAX_ATTEMPTS_PER_GROUP) return false; // ล้มเหลวซ้ำเกินกำหนดแล้ว — หยุดลอง รอผู้ดูแลตรวจ
        return true;
    });

    if (dueGroups.length === 0) return { schoolId, skipped: "ยังไม่ถึงเวลา/ประมวลผลครบแล้ว" };

    const calendarSnap = await db.doc(`school-settings/${schoolId}/main_calendar/default`).get();
    const calendar = calendarSnap.exists ? calendarSnap.data() : {};
    const skipReason = getSkipReasonForDate(now.dateStr, now.weekday, calendar);
    const academicYear = calendar && calendar.academicYear ? String(calendar.academicYear) : undefined;

    const update = { date: now.dateStr, updatedAt: admin.firestore.FieldValue.serverTimestamp() };
    const summary = { schoolId, groups: {} };

    for (const group of dueGroups) {
        const base = { done: true, at: admin.firestore.FieldValue.serverTimestamp() };
        if (skipReason) {
            update[group.collName] = { ...base, skipped: skipReason };
            summary.groups[group.collName] = { skipped: skipReason };
            continue;
        }
        const activity = await getScanActivity(db, schoolId, group.collName, now.dateStr);
        if (activity <= 0) {
            update[group.collName] = { ...base, skipped: "ทั้งวันไม่มีการสแกนของกลุ่มนี้เลย (ไม่ตัดขาดอัตโนมัติ)" };
            summary.groups[group.collName] = { skipped: "no-scan-day" };
            continue;
        }
        // จดจำนวนครั้งที่ลอง "ก่อน" เริ่มงานหนัก — ถ้าฟังก์ชันถูกตัดกลางคัน (timeout) ก็ยังนับเป็นหนึ่งครั้ง
        await runRef.set({
            date: now.dateStr,
            [group.collName]: { attempts: admin.firestore.FieldValue.increment(1), lastStartedAt: admin.firestore.FieldValue.serverTimestamp() },
        }, { merge: true });
        try {
            const result = await markAbsentForGroup({
                db,
                schoolId,
                dateStr: now.dateStr,
                collName: group.collName,
                behaviorScoreConfig: settings.behaviorScoreConfig || null,
                academicYear,
            });
            update[group.collName] = { ...base, checked: result.eligible, marked: result.marked };
            summary.groups[group.collName] = { checked: result.eligible, marked: result.marked };
        } catch (error) {
            console.error(`[autoMarkAbsences] ${schoolId}/${group.collName} failed:`, error);
            update[group.collName] = { lastError: String((error && error.message) || error) };
            summary.groups[group.collName] = { error: String((error && error.message) || error) };
        }
    }

    await runRef.set(update, { merge: true });
    return summary;
};

/** รอบตรวจของทุกโรงเรียนที่เปิดใช้ — เรียกจาก Cloud Scheduler */
const runAutoMarkAbsences = async (nowMs = Date.now()) => {
    const db = admin.firestore();
    const now = getBangkokNow(nowMs);
    // ตารางเวลาเรียกฟังก์ชันนี้ตั้งไว้ช่วงบ่าย–ค่ำอยู่แล้ว (ดู functions/index.js) กันไว้อีกชั้นเผื่อเรียกมือ
    if (now.timeStr < "12:00") return { skipped: "ก่อน 12:00" };

    const schoolsSnap = await db
        .collection("school-settings")
        .where("attendanceConfig.autoMarkAbsent", "==", true)
        .get();

    const results = [];
    const deadline = Date.now() + RUN_TIME_BUDGET_MS;
    const queue = [...schoolsSnap.docs];
    const worker = async () => {
        while (queue.length > 0) {
            if (Date.now() > deadline) return; // ที่เหลือรอรอบถัดไป (15 นาที)
            const schoolDoc = queue.shift();
            try {
                results.push(await processSchool(db, schoolDoc, now));
            } catch (error) {
                // โรงเรียนหนึ่งล้มเหลวต้องไม่ทำให้โรงเรียนอื่นหยุดตาม
                console.error(`[autoMarkAbsences] ${schoolDoc.id} failed:`, error);
                results.push({ schoolId: schoolDoc.id, error: String((error && error.message) || error) });
            }
        }
    };
    await Promise.all(Array.from({ length: SCHOOL_CONCURRENCY }, worker));
    if (queue.length > 0) console.warn(`[autoMarkAbsences] หมดเวลา เหลืออีก ${queue.length} โรงเรียน รอรอบถัดไป`);
    console.log("[autoMarkAbsences]", now.dateStr, now.timeStr, JSON.stringify(results));
    return results;
};

module.exports = {
    runAutoMarkAbsences,
    // export ไว้ให้ทดสอบ
    __test: { getRunAfterTime, getBangkokNow, getPeriodKeys, getSkipReasonForDate, isAttendanceEntryOnly, isStudyingStudent, isActiveTeacher, getAbsentPenaltyPoints, toBangkokDateString, getJoinDateString },
};
