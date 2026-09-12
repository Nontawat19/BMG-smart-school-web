// Auto-flag "มผ" (ไม่ผ่าน) สำหรับกิจกรรมพัฒนาผู้เรียน (ชุมนุม/ลูกเสือ/แนะแนว ฯลฯ) เมื่อเวลาเข้าร่วมสะสมไม่ถึง
// ร้อยละ 80 — ใช้หลักการเดียวกับ attendanceEligibility.ts (มส ของวิชาปกติ) แต่ปรับ 2 จุดให้เข้ากับโมเดลข้อมูล
// ของกิจกรรม: (1) ชุมนุม/กิจกรรมพัฒนาผู้เรียนมีคาบเดียวต่อสัปดาห์ (ผูกกับ special-periods) จึงคำนวณแบบ
// ตารางที่คาดหวังได้เหมือนวิชาปกติ (2) แนะแนวไม่มีตารางสอนที่แน่นอนในระบบนี้ จึงคำนวณจาก "จำนวนครั้งที่เช็คชื่อจริง"
// แทน — ไม่ฟันธงว่าใครติด มผ ถ้ายังไม่เคยเช็คชื่อเลย (กันติดมั่วตอนเปิดเทอมใหม่)
import {
    collection, collectionGroup, getDoc, getDocs, query, setDoc, where,
    CollectionReference, DocumentReference, Firestore, Timestamp,
} from 'firebase/firestore';
import {
    AttendanceStatus,
    AttendanceEligibilityStudent,
    AttendanceEligibilityResult,
    buildAttendancePages,
    buildStudentAttendanceSummaries,
    computeAttendanceEligibility,
    checkIsHolidayLocal,
} from './attendanceEligibility';
import { invalidateStaleResolvedRequests } from './remediationUtils';

export interface ActivityEligibilityWithHistory {
    eligibility: Record<string, AttendanceEligibilityResult>;
    dailyStatus: Record<string, Record<string, AttendanceStatus>>;
}

// ชุมนุม/กิจกรรมพัฒนาผู้เรียน: มีคาบกิจกรรมคงที่สัปดาห์ละ 1 วัน (ผูกกับ special-periods) — คำนวณ "เวลาที่ควรจะ
// เข้าร่วมได้" จากวันนั้นตลอดภาคเรียนที่ผ่านมาแล้ว (เหมือนตารางสอนวิชาปกติที่มีคาบเดียว) ถ้าไม่รู้ว่าคาบกิจกรรม
// ตรงกับวันไหนเลย (weeklyDay ว่าง) จะไม่คำนวณ/ไม่ฟันธงเลย เพื่อกันติด มผ ผิดพลาดจากข้อมูลตารางไม่ครบ
export const computeWeeklyActivityEligibilityForRoster = async (
    attendanceCollectionRef: CollectionReference,
    weeklyDay: string | undefined,
    calendarData: any,
    semester: string,
    rosterStudents: AttendanceEligibilityStudent[]
): Promise<ActivityEligibilityWithHistory> => {
    if (!weeklyDay) return { eligibility: {}, dailyStatus: {} };

    const dailyStatus: Record<string, Record<string, AttendanceStatus>> = {};
    const snap = await getDocs(attendanceCollectionRef);
    snap.forEach(docSnap => {
        const data = docSnap.data() as any;
        const dateStr = String(data.date || '');
        const records = (data.records || {}) as Record<string, AttendanceStatus>;
        if (!dateStr) return;
        Object.entries(records).forEach(([studentId, status]) => {
            if (!dailyStatus[studentId]) dailyStatus[studentId] = {};
            dailyStatus[studentId][dateStr] = status;
        });
    });

    const scheduleMap: Record<string, number[]> = { sun: [], mon: [], tue: [], wed: [], thu: [], fri: [], sat: [] };
    if (scheduleMap[weeklyDay]) scheduleMap[weeklyDay] = [1];

    const attendancePages = buildAttendancePages(calendarData, scheduleMap, semester, 'activity', dailyStatus, checkIsHolidayLocal);
    const summaries = buildStudentAttendanceSummaries(rosterStudents, attendancePages, dailyStatus);
    return { eligibility: computeAttendanceEligibility(summaries), dailyStatus };
};

// แนะแนว: ไม่มีตารางสอน/คาบที่ผูกไว้แน่นอนในระบบนี้ (ครูเลือกวันเช็คชื่อได้อิสระ) จึงคำนวณ % จาก
// "จำนวนครั้งที่เช็คชื่อจริงของห้องนั้น" เป็นตัวหาร แทนจำนวนคาบตามตารางที่คาดไว้แบบวิชาปกติ/ชุมนุม
export const computeGuidanceEligibilityForRoster = async (
    db: Firestore,
    schoolId: string,
    classKey: string,
    room: string,
    academicYear: string,
    semester: string,
    rosterStudents: AttendanceEligibilityStudent[]
): Promise<Record<string, AttendanceEligibilityResult>> => {
    const byStudent: Record<string, { present: number; total: number }> = {};
    const snap = await getDocs(query(
        collectionGroup(db, 'ClassroomAttendance'),
        where('schoolId', '==', schoolId),
        where('subjectCode', '==', 'GUIDANCE'),
        where('classId', '==', classKey),
        where('room', '==', room),
        where('academicYear', '==', academicYear),
        where('semester', '==', semester),
    ));
    snap.forEach(docSnap => {
        const data = docSnap.data() as any;
        const studentId = data.studentId;
        if (!studentId) return;
        if (!byStudent[studentId]) byStudent[studentId] = { present: 0, total: 0 };
        byStudent[studentId].total++;
        if (data.status === 'present' || data.status === 'late' || data.status === 'leave') byStudent[studentId].present++;
    });

    const result: Record<string, AttendanceEligibilityResult> = {};
    rosterStudents.forEach(s => {
        const bucket = byStudent[s.id];
        const total = bucket?.total || 0;
        const present = bucket?.present || 0;
        const percentage = total > 0 ? (present / total) * 100 : 100;
        result[s.id] = {
            percentage,
            presentHours: present,
            totalHours: total,
            belowThreshold: total > 0 && percentage < 80,
        };
    });
    return result;
};

// เขียนผล "มผ" ลง evaluations doc จริง (ใช้ร่วมกันได้ทั้ง clubs/{id}/evaluations, learner-activities/{id}/evaluations
// และ guidance-evaluations) — บังคับทับผลเดิมเสมอถ้าเวลาไม่ถึงเกณฑ์ เหมือนหลักการ มส ของวิชาปกติ และ**ถอน มผ
// อัตโนมัติคืนเป็น "ผ่าน"** เมื่อเวลาเข้าร่วมกลับมาครบ 80% แล้ว (ไม่ใช่ผ่านคำร้องขอแก้ตัว — คำร้องขอแก้ตัวสงวนไว้
// สำหรับกรณีขาดจริงแล้วมาสอบ/ประเมินแก้ตัวเท่านั้น) ตรรกะเดียวกับที่ใช้แก้ มส ของวิชาปกติใน
// ClassroomAttendance/index.tsx — best-effort เสมอ ไม่ throw กันไม่ให้การเช็คชื่อที่บันทึกสำเร็จแล้วถูกมองว่า
// ล้มเหลวไปด้วย
export const applyActivityEligibilityFailFlags = async (
    db: Firestore,
    evalRef: DocumentReference,
    rosterStudents: Array<{ id: string }>,
    eligibility: Record<string, AttendanceEligibilityResult>,
    // ระบุ (schoolId, flagKind, idValue, academicYear, semester) เพื่อยกเลิกคำร้องแก้ตัวเดิมที่ "resolved"
    // ไปแล้วของนักเรียนที่ถูกบังคับติด มผ ซ้ำรอบนี้ — กันไม่ให้สถานะ "แก้ตัวสำเร็จ" ค้างแสดงทั้งที่ผลจริงกลับไป
    // ติดใหม่แล้ว (ดู invalidateStaleResolvedRequests ใน remediationUtils.ts) ไม่ระบุ = ข้ามขั้นตอนนี้
    invalidateContext: { schoolId: string; flagKind: 'club' | 'learner-activity' | 'guidance'; idValue: string; academicYear: string; semester: string } | null,
    // ฟิลด์เสริมที่ต้องมีติดเอกสารเสมอ (เช่น academicYear/semester/classId/room/targetName ของ
    // guidance-evaluations) เผื่อกรณีนี้เป็นการสร้างเอกสารครั้งแรก (ครูยังไม่เคยเปิดหน้าประเมินเลย) — ถ้าไม่ใส่
    // ตรงนี้ ตัวอ่าน flag ของ guidance (ซึ่งอ่านจากฟิลด์บนตัวเอกสารเอง ไม่ได้อิงจาก enrollment เหมือนกิจกรรมอื่น)
    // จะมองไม่เห็นเอกสารนี้เลย
    extraFieldsOnCreate?: Record<string, any>,
    // ประวัติเช็คชื่อรายวัน (studentId -> dateStr -> status) ถ้ามี — ใช้เช็คว่าหลังจากแก้ตัวสำเร็จไปแล้ว มีวันขาด
    // เข้าร่วมใหม่เกิดขึ้นจริงหรือไม่ (ดูคอมเมนต์จุดเช็ค resolved ด้านล่าง) ไม่ระบุ = ไม่มีข้อมูลรายวันให้เทียบ
    // (เช่น แนะแนวที่นับแค่จำนวนครั้งรวม ไม่ได้เก็บวันที่) จะถือว่าผลแก้ตัวเป็นที่สุด ไม่เขียนทับซ้ำ
    dailyStatus?: Record<string, Record<string, AttendanceStatus>>
): Promise<boolean> => {
    const belowThresholdStudents = rosterStudents
        .map(s => ({ id: s.id, ...eligibility[s.id] }))
        .filter((s): s is { id: string; presentHours: number; totalHours: number; percentage: number; belowThreshold: boolean } =>
            Boolean(s?.belowThreshold));
    const recoveredCandidateIds = new Set(
        rosterStudents.filter(s => eligibility[s.id] && !eligibility[s.id].belowThreshold).map(s => s.id)
    );
    if (belowThresholdStudents.length === 0 && recoveredCandidateIds.size === 0) return true;
    try {
        // เวลาเข้าร่วมสะสม "elapsed" นับตั้งแต่ต้นภาค/ปี จึงมักยังต่ำกว่า 80% ต่อไปอีกนานแม้แก้ มผ สำเร็จแล้ว
        // (การแก้ มผ แก้ที่ผลประเมิน ไม่ได้ย้อนแก้เวลาที่ขาดไปแล้วในอดีต) — ถ้าไม่กันจุดนี้ไว้ การเช็คชื่อครั้งถัดไป
        // ครั้งใดก็ตามจะเขียน มผ ทับผลที่แก้ไขไปแล้วทันที ทำให้ฟีเจอร์แก้ มผ ใช้งานจริงไม่ได้เลย (บั๊กเดียวกับที่พบใน
        // มส ของวิชาปกติ — ดู applyAttendanceEligibilityFlags ใน ClassroomAttendance/index.tsx) จึงต้องข้ามคนที่มี
        // คำร้องแก้ตัว "resolved" อยู่แล้วไปก่อน เว้นแต่จะมีวันขาดเข้าร่วมใหม่เกิดขึ้น "หลัง" วันที่แก้ตัวสำเร็จจริง ๆ
        let studentsToApply = belowThresholdStudents;
        if (invalidateContext) {
            const resolvedByStudentId: Record<string, Date | null> = {};
            const idsToCheck = belowThresholdStudents.map(s => s.id);
            for (let i = 0; i < idsToCheck.length; i += 30) {
                const idChunk = idsToCheck.slice(i, i + 30);
                const resolvedSnap = await getDocs(query(
                    collection(db, 'school-settings', invalidateContext.schoolId, 'remediation_requests'),
                    where('studentId', 'in', idChunk),
                    where('flagType', '==', invalidateContext.flagKind),
                    where('activityId', '==', invalidateContext.idValue),
                    where('academicYear', '==', invalidateContext.academicYear),
                    where('semester', '==', invalidateContext.semester),
                    where('status', '==', 'resolved'),
                ));
                resolvedSnap.forEach(d => {
                    const rdata = d.data() as any;
                    resolvedByStudentId[rdata.studentId] = rdata.resolvedAt?.toDate ? rdata.resolvedAt.toDate() : null;
                });
            }

            const toDateKeyLocal = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
            studentsToApply = belowThresholdStudents.filter(student => {
                if (!(student.id in resolvedByStudentId)) return true; // ไม่เคยแก้ตัวมาก่อน — ทำงานตามปกติ
                if (!dailyStatus) return false; // ไม่มีข้อมูลรายวันให้เทียบ — เชื่อผลแก้ตัวเป็นที่สุด ไม่เขียนทับ
                const resolvedAt = resolvedByStudentId[student.id];
                if (!resolvedAt) return true; // ไม่มีวันที่แก้ตัวให้เทียบ — เผื่อไว้ก่อน ทำงานตามปกติ
                const resolvedDateKey = toDateKeyLocal(resolvedAt);
                const statusMap = dailyStatus[student.id] || {};
                return Object.entries(statusMap).some(([dateKey, status]) =>
                    dateKey > resolvedDateKey && (status === 'absent' || status === 'escape')
                );
            });
        }

        if (studentsToApply.length === 0 && recoveredCandidateIds.size === 0) return true;

        const snap = await getDoc(evalRef);
        const data: any = snap.exists() ? snap.data() : {};
        const results: Record<string, any> = { ...(data.results || {}) };
        const changedStudentIds: string[] = [];

        studentsToApply.forEach(info => {
            const note = `เวลาเข้าร่วมไม่ถึงร้อยละ 80 (${info.presentHours}/${info.totalHours} ครั้ง = ${info.percentage.toFixed(1)}%)`;
            const existing = results[info.id];
            if (existing?.status === 'failed' && existing?.note === note) return;
            // เขียนทั้ง note (ฟิลด์ที่ ActivityEvaluationPage ใช้ตอนกรอกด้วยมือ) และ remark (ฟิลด์ที่
            // fetchFlaggedStudents ใน remediationUtils.ts อ่านจริงตอนแสดงหมายเหตุของ มผ ให้นักเรียน/ครูเห็น)
            results[info.id] = { ...(existing || {}), status: 'failed', note, remark: note };
            changedStudentIds.push(info.id);
        });

        // เวลาเข้าร่วมกลับมาครบ 80% แล้ว และเคยติด มผ. อัตโนมัติไว้ (note ขึ้นต้นด้วยข้อความมาตรฐานนี้ — ไม่ใช่
        // ครูตั้งใจกดไม่ผ่านเองด้วยเหตุผลอื่น) — ถอนกลับเป็น "ผ่าน" อัตโนมัติทันที เหมือนที่แก้ให้ มส ของวิชาปกติ
        // ไปแล้วใน ClassroomAttendance/index.tsx (เดิมจุดนี้ไม่มีเลย ทำให้ มผ ค้างตลอดไปแม้เข้าร่วมครบแล้วก็ตาม)
        recoveredCandidateIds.forEach(id => {
            const existing = results[id];
            const isStaleAutoFail = existing?.status === 'failed' && typeof existing?.note === 'string' && existing.note.startsWith('เวลาเข้าร่วมไม่ถึงร้อยละ 80');
            if (!isStaleAutoFail) return;
            const info = eligibility[id];
            const note = info ? `เวลาเข้าร่วมกลับมาครบร้อยละ 80 แล้ว (${info.presentHours}/${info.totalHours} ครั้ง = ${info.percentage.toFixed(1)}%) — ถอน มผ อัตโนมัติ` : 'เวลาเข้าร่วมกลับมาครบร้อยละ 80 แล้ว — ถอน มผ อัตโนมัติ';
            results[id] = { ...existing, status: 'passed', note, remark: note };
            changedStudentIds.push(id);
        });

        if (changedStudentIds.length > 0) {
            const summary = Object.values(results).reduce((acc: any, r: any) => {
                const s = r?.status || 'pending';
                acc[s] = (acc[s] || 0) + 1;
                return acc;
            }, { pending: 0, passed: 0, failed: 0 });

            await setDoc(evalRef, {
                ...(snap.exists() ? {} : (extraFieldsOnCreate || {})),
                results, summary, updatedAt: Timestamp.now(),
            }, { merge: true });
        }

        // เช็คคำร้อง resolved ค้างเก่าให้ "ทุกคน" ใน studentsToApply (ยืนยันแล้วว่ามีวันขาดเข้าร่วมใหม่จริงหลังแก้
        // ตัว หรือไม่เคยแก้ตัวมาก่อน) — ไม่ใช่ belowThresholdStudents ทั้งหมด เพื่อไม่ให้คนที่แก้ตัวสำเร็จแล้วและไม่มี
        // วันขาดใหม่ถูกยกเลิกคำร้องไปด้วย เช็คให้ "ทุกคน" ในกลุ่มนี้ ไม่ใช่แค่คนที่เพิ่งถูกเขียนสถานะใหม่เท่านั้น
        // เพราะถ้าเช็คชื่อซ้ำวันถัดๆ ไปแล้วเปอร์เซ็นต์ไม่เปลี่ยน (สถานะเป็น 'failed' อยู่แล้วเหมือนเดิม จึงไม่เข้า
        // เงื่อนไข changedStudentIds) แต่ยังมีคำร้อง resolved เก่าค้างอยู่ ก็ต้องยกเลิกให้ด้วยเช่นกัน
        if (invalidateContext) {
            await Promise.all(studentsToApply.map(s => invalidateStaleResolvedRequests(
                invalidateContext.schoolId, s.id, invalidateContext.flagKind, invalidateContext.idValue,
                invalidateContext.academicYear, invalidateContext.semester,
            )));
        }

        return true;
    } catch (err) {
        console.error('Error applying activity attendance-eligibility (มผ) flags:', err);
        return false;
    }
};
