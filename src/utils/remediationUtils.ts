// ─────────────────────────────────────────────────────────────────────────
// Logic กลางสำหรับตรวจจับสถานะ 0/ร/มส/มผ ของนักเรียน — ดึงมาจาก
// ZeroRMsGradeReportPage.tsx (ของเดิม) แล้ว generalize ให้:
// 1) ใช้ได้ทั้งแบบ "ทั้งโรงเรียน/กรองตามชั้น" (รายงานเดิม) และ "นักเรียนคนเดียว" (หน้านักเรียนยื่นคำร้อง)
// 2) คืนค่า "address" ที่ resolve ไว้แล้วสำหรับ มผ (clubs/learner-activities evaluations doc + scope key)
//    เพื่อให้ระบบยื่นคำร้องแก้ตัวบันทึก address นี้ไว้ตอนสร้างคำร้อง แล้วฝั่งครูเปิดเอกสารได้ตรงจุดทันที
//    ไม่ต้อง derive scope ซ้ำ (ซึ่งซับซ้อนและมีโอกาสผิดพลาดถ้าทำสองที่)
//
// ⚠️ ถ้าจะแก้ logic การตรวจจับ flag ให้แก้ที่นี่ที่เดียว — ห้ามแก้ไข logic คู่ขนานใน
// ZeroRMsGradeReportPage.tsx อีก เพราะจะทำให้รายงานกับระบบยื่นคำร้องเห็นข้อมูลไม่ตรงกัน
// ─────────────────────────────────────────────────────────────────────────

import { collection, doc, getDoc, getDocs, query, where } from 'firebase/firestore';
import { firestore as db } from '@/firebase';
import {
    LearnerActivityTeacherScope,
    buildLearnerActivityEvaluationDocId,
    deriveTeacherScopesFromCourse,
} from '@/utils/learnerActivityUtils';

export type FlagType = '0' | 'ร' | 'มส' | 'มผ';
export const FLAG_TYPES: FlagType[] = ['0', 'ร', 'มส', 'มผ'];

// รหัสรายวิชาที่ขึ้นต้นด้วย "ก" คือกิจกรรมพัฒนาผู้เรียน (ชุมนุม, ลูกเสือ-เนตรนารี, แนะแนว, สาธารณประโยชน์ ฯลฯ)
// ซึ่งประเมินผ่าน/ไม่ผ่าน (มผ) ผ่านระบบ "ประเมินกิจกรรมพัฒนาผู้เรียน" ไม่ใช่เกรด 0/ร/มส เหมือนรายวิชาปกติ
export const isActivityCourseCode = (code?: string) => String(code || '').trim().charAt(0) === 'ก';

// สูตรตัดเกรดจากคะแนนรวม — ใช้ตรงกับ SgsExportPage.tsx/PostMidtermScoreEntryPage.tsx/GradeBookPage.tsx/
// ZeroRMsGradeReportPage.tsx (คัดลอกตามธรรมเนียมเดิมของโปรเจกต์ ไม่ได้รวมศูนย์เป็นจุดเดียว)
export const calculateGradeFromTotal = (total: number): string => {
    if (total >= 80) return '4';
    if (total >= 75) return '3.5';
    if (total >= 70) return '3';
    if (total >= 65) return '2.5';
    if (total >= 60) return '2';
    if (total >= 55) return '1.5';
    if (total >= 50) return '1';
    return '0';
};

/**
 * คำนวณเกรดใหม่จากการแก้ตัวตามระเบียบกระทรวงศึกษาธิการ (ศธ./สพฐ.):
 * - แก้ตัว "0": ได้ผลการเรียนสูงสุดไม่เกิน "1" (หากคะแนนรวม >= 50 ได้ "1", < 50 ได้ "0")
 * - แก้ตัว "มส": ได้ผลการเรียนสูงสุดไม่เกิน "1" (หากแก้ผ่านได้ "1", ไม่ผ่านได้ "0")
 * - แก้ตัว "ร": คำนวณเกรดตามคะแนนรวมสะสมจริง (>= 50 ได้ 1-4 ตามคะแนน, < 50 ได้ "0")
 */
export const calculateRemediationGrade = (originalGrade: string, freshTotal: number, selectedValue?: string): string => {
    const orig = String(originalGrade || '').trim();
    if (selectedValue) return selectedValue;

    const baseGrade = calculateGradeFromTotal(freshTotal);
    if (orig === '0' || orig === 'มส') {
        // ตามระเบียบ ศธ. แก้ตัว 0/มส เมื่อคะแนนผ่านเกณฑ์ (>= 50) ได้เกรดสูงสุด 1
        return freshTotal >= 50 || baseGrade !== '0' ? '1' : '0';
    }
    // กรณีติด 'ร' ได้เกรดจริงตามคะแนนสะสมรวม
    return baseGrade;
};

/**
 * ตัวเลือกเกรดใหม่สำหรับ Swal Select ตามระเบียบกระทรวงศึกษาธิการ:
 * - ติด 0 / มส: ตัวเลือกเกรดผ่านคือ "1" (สูงสุดไม่เกิน 1) หรือ "0" (ไม่ผ่าน)
 * - ติด ร: ตัวเลือกเกรด 1 - 4 หรือ 0
 */
export const getMinistryRemediationGradeOptions = (originalGrade: string): Record<string, string> => {
    const orig = String(originalGrade || '').trim();
    if (orig === '0') {
        return {
            '1': '1 (ผ่านการแก้ตัว 0 — ตามระเบียบ ศธ. ได้ไม่เกินเกรด 1)',
            '0': '0 (ไม่ผ่านการแก้ตัว)',
        };
    }
    if (orig === 'มส') {
        return {
            '1': '1 (ผ่านการแก้ตัว มส — ตามระเบียบ ศธ. ได้ไม่เกินเกรด 1)',
            '0': '0 (ไม่ผ่านการแก้ตัว)',
        };
    }
    return {
        '4': '4 (80 - 100 คะแนน)',
        '3.5': '3.5 (75 - 79 คะแนน)',
        '3': '3 (70 - 74 คะแนน)',
        '2.5': '2.5 (65 - 69 คะแนน)',
        '2': '2 (60 - 64 คะแนน)',
        '1.5': '1.5 (55 - 59 คะแนน)',
        '1': '1 (50 - 54 คะแนน)',
        '0': '0 (ต่ำกว่า 50 คะแนน)',
    };
};

const JUNIOR_HIGH_IDS =['m1', 'm2', 'm3', 'junior_high', 'ม.ต้น', 'ม.1', 'ม.2', 'ม.3'];
const SENIOR_HIGH_IDS = ['m4', 'm5', 'm6', 'senior_high', 'ม.ปลาย', 'ม.4', 'ม.5', 'ม.6'];
const THAI_LEVEL_MAPPING: Record<string, string[]> = {
    m1: ['ม.1'], m2: ['ม.2'], m3: ['ม.3'], m4: ['ม.4'], m5: ['ม.5'], m6: ['ม.6'],
    p1: ['ป.1'], p2: ['ป.2'], p3: ['ป.3'], p4: ['ป.4'], p5: ['ป.5'], p6: ['ป.6'],
    k1: ['อ.1', 'อนุบาล 1'], k2: ['อ.2', 'อนุบาล 2'], k3: ['อ.3', 'อนุบาล 3']
};

export const matchesClassLevel = (studentClassLevel: string | undefined, selectedValue: string): boolean => {
    if (selectedValue === 'all') return true;
    if (!studentClassLevel) return false;
    const cid = String(studentClassLevel).toLowerCase().trim();
    const sid = selectedValue.toLowerCase().trim();
    if (cid === sid) return true;
    if (THAI_LEVEL_MAPPING[sid]?.some(label => label.toLowerCase() === cid)) return true;
    if (sid === 'junior_high' || sid === 'ม.ต้น') return JUNIOR_HIGH_IDS.some(v => v.toLowerCase() === cid);
    if (sid === 'senior_high' || sid === 'ม.ปลาย') return SENIOR_HIGH_IDS.some(v => v.toLowerCase() === cid);
    return false;
};

// เผื่อกรณีมีวิชารหัสเดียวกันซ้ำหลายเอกสารในคอลเลกชัน courses (เช่น ข้อมูลนำเข้าซ้ำ) — การลงทะเบียน
// ของนักเรียนอาจผูกกับ courseId คนละเอกสารกับที่ครูถูกมอบหมายไว้ ทั้งที่จอแสดงรหัส/ชื่อวิชาเหมือนกันเป๊ะ
// (เช่น "ค21101 คณิตศาสตร์พื้นฐาน" ทั้งคู่) ทำให้ getTeacherForAssignment หาชื่อครูไม่เจอทั้งที่มอบหมายไว้แล้ว
// จริง — ฟังก์ชันนี้ mutate assignmentsByCourse ให้ courseId ทุกตัวที่ใช้รหัสวิชาเดียวกัน "มองเห็น" รายการ
// มอบหมายของกันและกัน โดยไม่กระทบกรณีปกติ (รหัสวิชาไม่ซ้ำ = ไม่มีผลอะไรเลย)
const mergeAssignmentsAcrossDuplicateCourseCodes = (
    courseMap: Record<string, { code: string }>,
    assignmentsByCourse: Record<string, any[]>
) => {
    const courseIdsByCode: Record<string, string[]> = {};
    Object.entries(courseMap).forEach(([id, c]) => {
        if (!c.code) return;
        if (!courseIdsByCode[c.code]) courseIdsByCode[c.code] = [];
        courseIdsByCode[c.code].push(id);
    });
    Object.values(courseIdsByCode).forEach(ids => {
        if (ids.length < 2) return;
        const merged = ids.flatMap(id => assignmentsByCourse[id] || []);
        if (merged.length === 0) return;
        ids.forEach(id => { assignmentsByCourse[id] = merged; });
    });
};

export const getTeacherDisplayName = (teacherMap: Record<string, any>, teacherId?: string, fallbackName?: string) => {
    if (fallbackName) return `ครู${fallbackName}`;
    const t = teacherId ? teacherMap[teacherId] : null;
    if (t?.firstName) return `ครู${t.firstName}`;
    if (t?.name) return t.name;
    return '-';
};

interface Course {
    id: string;
    code: string;
    title: string;
    isActive?: boolean;
    classId?: string | string[];
    credits?: number;
    formativeAssessments?: { id?: string; name?: string; maxScore?: number }[];
}

interface EnrollmentRecord {
    studentId: string;
    courseId: string;
    academicYear: string;
    semester: string;
}

export interface FlaggedCourse {
    courseId: string;
    courseCode: string;
    courseTitle: string;
    credits: number;
    grade: FlagType;
    academicYear: string;
    semester: string;
    teacherName: string;

    // ── เพิ่มสำหรับระบบยื่นคำร้องแก้ตัว: address ที่ resolve ไว้แล้ว สำหรับเขียนผลใหม่กลับที่ถูกจุด ──
    // 'guidance' = กิจกรรมแนะแนว ไม่มีคอร์ส/กิจกรรมผูกเลย ประเมินตรงตามชั้น/ห้อง เก็บที่ guidance-evaluations
    // ซึ่งเป็น collection ระดับบนสุด (ไม่ใช่ subcollection ของ activityDocId เหมือน clubs/learner-activities)
    // จึงต้องเช็ค activityCollectionName === 'guidance-evaluations' ก่อนต่อ path เสมอ (ดู evalDocId เป็น doc id ตรงๆ)
    flagKind: 'course' | 'club' | 'learner-activity' | 'guidance';
    activityCollectionName?: 'clubs' | 'learner-activities' | 'guidance-evaluations';
    activityDocId?: string;      // clubDocId หรือ learner-activity docId (ไม่ใช้กับ guidance)
    evalDocId?: string;          // เอกสาร evaluations ที่แน่นอน (รวม teacherScopeKey แล้วถ้ามี) — guidance = doc id ใน guidance-evaluations ตรงๆ
    teacherScopeKey?: string;
    responsibleTeacherIds: string[];
    // หมายเหตุประกอบผล มส/ร/มผ ที่ครูใส่ไว้ (หน้า "บันทึก 0 ร มส") — มีค่า = ซ่อนการแสดงเกรดไว้ในตาราง
    // จนกว่าจะลบหมายเหตุออก ไม่กระทบสถานะ "ติดผลการเรียน" หรือการนับจำนวนใดๆ
    remark?: string;
}

export interface StudentFlagRow {
    id: string;
    studentCode: string;
    number: string;
    name: string;
    classLevel: string;
    room: string;
    flags: FlaggedCourse[];
}

export interface RemediationWindowConfig {
    enabled?: boolean;
    startDate?: string;
    endDate?: string;
    startTime?: string;
    endTime?: string;
}

// ตรรกะเดียวกับที่ใช้ในหน้าตั้งค่า (RemediationSettingsPage.tsx) — แยกมาไว้ที่นี่เพื่อให้หน้านักเรียน/
// ครู/งานวัดผลฯ เช็ค "ตอนนี้ยื่นคำร้องได้ไหม" ด้วยกฎเดียวกันเป๊ะๆ ไม่ implement ซ้ำคนละที่
export const isRemediationWindowOpen = (config: RemediationWindowConfig | null | undefined): boolean => {
    if (!config?.enabled) return false;
    const now = new Date();
    const todayOnly = new Date(now); todayOnly.setHours(0, 0, 0, 0);
    if (config.startDate && config.endDate) {
        const start = new Date(config.startDate);
        const end = new Date(config.endDate);
        end.setHours(23, 59, 59, 999);
        if (todayOnly < start || now > end) return false;
    }
    if (config.startTime && config.endTime) {
        const cur = now.getHours() * 60 + now.getMinutes();
        const [sh, sm] = config.startTime.split(':').map(Number);
        const [eh, em] = config.endTime.split(':').map(Number);
        if (cur < sh * 60 + sm || cur > eh * 60 + em) return false;
    }
    return true;
};

export interface FetchFlaggedStudentsOptions {
    // กรองระดับชั้นก่อนสแกน (ใช้กับรายงานทั้งโรงเรียน) — ค่าเริ่มต้น 'all' = ไม่กรอง
    classLevelFilter?: string;
    // ถ้าระบุ จะสแกนเฉพาะนักเรียนกลุ่มนี้เท่านั้น (ใช้กับหน้านักเรียนคนเดียวดูของตัวเอง) — ถ้าไม่ระบุ สแกนทั้งโรงเรียน
    studentIds?: string[];
    // กรองปีการศึกษา/ภาคเรียนของ "การลงทะเบียน" (enrollment) ที่จะนำมาตรวจจับ flag — ไม่ระบุ = ทุกปี/ทุกภาคเรียน
    // (พฤติกรรมเดิม สะสมทุกภาคเรียนที่ผ่านมา) ระบุ academicYear อย่างเดียว = ทั้งปีนั้น (ทั้ง 2 ภาคเรียน)
    academicYear?: string;
    semester?: string;
}

/**
 * ตรวจจับสถานะ 0/ร/มส/มผ ของนักเรียน พร้อม address สำหรับเขียนผลใหม่กลับ (ใช้โดยระบบยื่นคำร้องแก้ตัว)
 * เป็น "ตัวเดียวที่ทำหน้าที่นี้" — ZeroRMsGradeReportPage.tsx และหน้านักเรียนดูสถานะของตัวเอง เรียกใช้ร่วมกัน
 */
export const fetchFlaggedStudents = async (
    schoolId: string,
    teacherMap: Record<string, any>,
    options: FetchFlaggedStudentsOptions = {}
): Promise<StudentFlagRow[]> => {
    const { classLevelFilter = 'all', studentIds: explicitStudentIds, academicYear: termAcademicYear, semester: termSemester } = options;

    // 1. รายชื่อนักเรียนเป้าหมาย
    let studentInfoMap: Record<string, { code: string; name: string; number: string; classLevel: string; room: string }> = {};

    if (explicitStudentIds && explicitStudentIds.length > 0) {
        const snaps = await Promise.all(explicitStudentIds.map(sid => getDoc(doc(db, 'school-settings', schoolId, 'students', sid))));
        snaps.forEach((sSnap, idx) => {
            if (!sSnap.exists()) return;
            const sData: any = sSnap.data();
            const name = sData.firstName
                ? `${sData.title || sData.prefix || ''}${sData.firstName} ${sData.lastName || ''}`.trim()
                : (sData.name || 'ไม่พบข้อมูลนักเรียน');
            studentInfoMap[explicitStudentIds[idx]] = {
                code: String(sData.studentCode || sData.studentId || sData.code || sData['รหัสนักเรียน'] || '-'),
                name,
                number: String(sData.studentNumber || sData.number || sData.no || sData['เลขที่'] || '').trim(),
                classLevel: sData.classLevel || '',
                room: sData.room || '',
            };
        });
    } else {
        // ดึงนักเรียนทั้งหมดแล้วกรองระดับชั้นฝั่ง client ด้วย matchesClassLevel (classLevel ใน DB เป็นป้ายไทย
        // ไม่ใช่ "รหัส" เช่น "m2" ที่ตัวกรองใช้ — เทียบแบบ equality ตรงๆ จะได้ผลลัพธ์ว่างเปล่าเสมอ)
        const studentsRef = collection(db, 'school-settings', schoolId, 'students');
        const studentSnap = await getDocs(studentsRef);
        studentSnap.docs.forEach(sDoc => {
            const sData: any = sDoc.data();
            if (!matchesClassLevel(sData.classLevel, classLevelFilter)) return;
            const name = sData.firstName
                ? `${sData.title || sData.prefix || ''}${sData.firstName} ${sData.lastName || ''}`.trim()
                : (sData.name || 'ไม่พบข้อมูลนักเรียน');
            studentInfoMap[sDoc.id] = {
                code: String(sData.studentCode || sData.studentId || sData.code || sData['รหัสนักเรียน'] || '-'),
                name,
                number: String(sData.studentNumber || sData.number || sData.no || sData['เลขที่'] || '').trim(),
                classLevel: sData.classLevel || '',
                room: sData.room || '',
            };
        });
    }

    const studentIds = Object.keys(studentInfoMap);
    if (studentIds.length === 0) return [];

    // 2. ข้อมูลอ้างอิง: รายวิชา, มอบหมายครู, ชุมนุม, กิจกรรมพัฒนาผู้เรียน (ดึงทั้งหมดครั้งเดียว)
    const [courseSnap, assignmentSnap, clubSnap, learnerActivitySnap] = await Promise.all([
        getDocs(collection(db, 'school-settings', schoolId, 'courses')),
        getDocs(collection(db, 'school-settings', schoolId, 'course_assignments')),
        getDocs(collection(db, 'school-settings', schoolId, 'clubs')),
        getDocs(collection(db, 'school-settings', schoolId, 'learner-activities')),
    ]);

    const courseMap: Record<string, Course> = {};
    const courseCodeToId: Record<string, string> = {};
    courseSnap.docs.forEach(d => {
        const data: any = d.data();
        courseMap[d.id] = { id: d.id, code: data.code || '', title: data.title || '', classId: data.classId, credits: data.credits, isActive: data.isActive ?? true, formativeAssessments: data.formativeAssessments };
        if (data.code) courseCodeToId[data.code] = d.id;
    });

    const assignmentsByCourse: Record<string, any[]> = {};
    assignmentSnap.docs.forEach(d => {
        const data: any = d.data();
        if (!data.courseId) return;
        if (!assignmentsByCourse[data.courseId]) assignmentsByCourse[data.courseId] = [];
        assignmentsByCourse[data.courseId].push(data);
    });
    mergeAssignmentsAcrossDuplicateCourseCodes(courseMap, assignmentsByCourse);

    const clubDocByCourseId: Record<string, string> = {};
    clubSnap.docs.forEach(d => {
        const data: any = d.data();
        const linked = data.linkedCourseId || data.courseId;
        if (linked) clubDocByCourseId[linked] = d.id;
        if (courseMap[d.id]) clubDocByCourseId[d.id] = d.id; // course-based: doc id === course id
    });

    const activityDocByCourseId: Record<string, string> = {};
    learnerActivitySnap.docs.forEach(d => {
        const data: any = d.data();
        const linked = data.courseId;
        if (linked) activityDocByCourseId[linked] = d.id;
        if (courseMap[d.id]) activityDocByCourseId[d.id] = d.id; // course-based: doc id === course id
    });

    // 3. ดึงประวัติการลงทะเบียนทั้งหมดของนักเรียนกลุ่มเป้าหมาย (ทุกปี/ทุกเทอมที่เคยเรียนมา)
    const enrollRef = collection(db, 'school-settings', schoolId, 'enrollments');
    const enrollments: EnrollmentRecord[] = [];
    const batchSize = 30;
    for (let i = 0; i < studentIds.length; i += batchSize) {
        const batchIds = studentIds.slice(i, i + batchSize);
        const eSnap = await getDocs(query(enrollRef, where('studentId', 'in', batchIds)));
        eSnap.forEach(eDoc => {
            const data: any = eDoc.data();
            const courseId = data.courseId || (data.courseCode ? courseCodeToId[data.courseCode] : undefined);
            if (!courseId || !courseMap[courseId]) return;
            if (!data.academicYear || !data.semester) return;
            enrollments.push({ studentId: data.studentId, courseId, academicYear: String(data.academicYear), semester: String(data.semester) });
        });
    }

    // กรองตามปีการศึกษา/ภาคเรียนที่ระบุ (ถ้ามี) — ไม่ระบุ = ไม่กรอง (สะสมทุกภาคเรียนที่ผ่านมา ตามพฤติกรรมเดิม)
    const termFilteredEnrollments = enrollments.filter(e => {
        if (termAcademicYear && e.academicYear !== termAcademicYear) return false;
        if (termAcademicYear && termSemester && e.semester !== termSemester) return false;
        return true;
    });

    const regularEnrollments = termFilteredEnrollments.filter(e => !isActivityCourseCode(courseMap[e.courseId]?.code));
    const activityEnrollments = termFilteredEnrollments.filter(e => isActivityCourseCode(courseMap[e.courseId]?.code));

    // 4. เกรด 0/ร/มส ของวิชาปกติ — อ่าน grades subcollection ของทุกวิชาที่เกี่ยวข้องเพียงครั้งเดียว
    const uniqueRegularCourseIds = Array.from(new Set(regularEnrollments.map(e => e.courseId)));
    const regularGradeSnaps = await Promise.all(
        uniqueRegularCourseIds.map(cid => getDocs(collection(db, 'school-settings', schoolId, 'courses', cid, 'grades')))
    );
    const gradesByCourse: Record<string, Record<string, string>> = {};
    // Remark ประกอบผล มส/ร ที่ครูใส่ไว้ (courses/{courseId}/grades/{studentId}.remark) — ใช้ที่หน้า "บันทึก 0 ร มส"
    // เพื่อซ่อนการแสดงเกรดไว้จนกว่าจะลบหมายเหตุออก
    const remarksByCourse: Record<string, Record<string, string>> = {};
    uniqueRegularCourseIds.forEach((cid, idx) => {
        const map: Record<string, string> = {};
        const remarkMap: Record<string, string> = {};
        regularGradeSnaps[idx].forEach(gDoc => {
            const data: any = gDoc.data();
            const value = String(data.grade || '').trim();
            if (value) map[gDoc.id] = value;
            const remark = String(data.remark || '').trim();
            if (remark) remarkMap[gDoc.id] = remark;
        });
        gradesByCourse[cid] = map;
        remarksByCourse[cid] = remarkMap;
    });

    const getTeacherForAssignment = (courseId: string, academicYear: string, semester: string) => {
        const matches = (assignmentsByCourse[courseId] || []).filter(a => String(a.academicYear) === academicYear && String(a.semester) === semester);
        const firstAssignment = matches[0]?.teacherAssignments?.[0];
        if (!firstAssignment) return { name: '-', ids: [] as string[] };
        const ids = matches.flatMap(m => (m.teacherAssignments || []).map((ta: any) => ta.teacherId).filter(Boolean));
        return { name: getTeacherDisplayName(teacherMap, firstAssignment.teacherId, firstAssignment.teacherName), ids: Array.from(new Set(ids)) };
    };

    const flaggedByStudent: Record<string, FlaggedCourse[]> = {};
    const addFlag = (studentId: string, flag: FlaggedCourse) => {
        if (!flaggedByStudent[studentId]) flaggedByStudent[studentId] = [];
        flaggedByStudent[studentId].push(flag);
    };

    regularEnrollments.forEach(e => {
        const grade = gradesByCourse[e.courseId]?.[e.studentId];
        if (grade !== '0' && grade !== 'ร' && grade !== 'มส') return;
        const course = courseMap[e.courseId];
        const teacher = getTeacherForAssignment(e.courseId, e.academicYear, e.semester);
        addFlag(e.studentId, {
            courseId: e.courseId,
            courseCode: course.code,
            courseTitle: course.title,
            credits: course.credits ?? 0,
            grade: grade as FlagType,
            academicYear: e.academicYear,
            semester: e.semester,
            teacherName: teacher.name,
            flagKind: 'course',
            responsibleTeacherIds: teacher.ids,
            remark: remarksByCourse[e.courseId]?.[e.studentId] || '',
        });
    });

    // 5. ผลประเมิน "มผ" ของวิชากิจกรรมพัฒนาผู้เรียน — รวบรวม path เอกสารประเมินที่ต้องอ่านแบบไม่ซ้ำก่อน แล้วค่อยอ่านพร้อมกัน
    const evalDocPaths = new Map<string, { collectionName: 'clubs' | 'learner-activities'; activityDocId: string; evalDocId: string }>();
    const activityTermKey = (courseId: string, year: string, semester: string) => `${courseId}|${year}|${semester}`;
    const scopesByTermKey: Record<string, LearnerActivityTeacherScope[]> = {};

    activityEnrollments.forEach(e => {
        const courseId = e.courseId;
        const clubDocId = clubDocByCourseId[courseId];
        const activityDocId = activityDocByCourseId[courseId];

        if (clubDocId) {
            const evalDocId = `${e.academicYear}_${e.semester}`;
            evalDocPaths.set(`clubs/${clubDocId}/${evalDocId}`, { collectionName: 'clubs', activityDocId: clubDocId, evalDocId });
        } else if (activityDocId) {
            const termKey = activityTermKey(courseId, e.academicYear, e.semester);
            if (!scopesByTermKey[termKey]) {
                const assignment = (assignmentsByCourse[courseId] || []).find(a => String(a.academicYear) === e.academicYear && String(a.semester) === e.semester);
                scopesByTermKey[termKey] = deriveTeacherScopesFromCourse({}, { id: courseId, classId: courseMap[courseId]?.classId, teacherAssignments: assignment?.teacherAssignments || [] }, teacherMap);
            }
            const scopes = scopesByTermKey[termKey];
            const candidateKeys = scopes.length > 0 ? scopes.map(s => s.key) : [undefined];
            candidateKeys.forEach(scopeKey => {
                const evalDocId = buildLearnerActivityEvaluationDocId(e.academicYear, e.semester, scopeKey);
                evalDocPaths.set(`learner-activities/${activityDocId}/${evalDocId}`, { collectionName: 'learner-activities', activityDocId, evalDocId });
            });
        }
    });

    const evalPathList = Array.from(evalDocPaths.entries());
    const evalDocs = await Promise.all(
        evalPathList.map(([, info]) => getDoc(doc(db, 'school-settings', schoolId, info.collectionName, info.activityDocId, 'evaluations', info.evalDocId)))
    );
    const evalResultsByPath: Record<string, Record<string, { status: string; remark?: string }>> = {};
    evalPathList.forEach(([pathKey], idx) => {
        const snap = evalDocs[idx];
        if (snap.exists()) evalResultsByPath[pathKey] = (snap.data() as any).results || {};
    });

    activityEnrollments.forEach(e => {
        const courseId = e.courseId;
        const course = courseMap[courseId];
        const clubDocId = clubDocByCourseId[courseId];
        const activityDocId = activityDocByCourseId[courseId];
        let failed = false;
        let teacherName = '-';
        let responsibleTeacherIds: string[] = [];
        let flagKind: 'club' | 'learner-activity' = 'club';
        let activityCollectionName: 'clubs' | 'learner-activities' = 'clubs';
        let resolvedActivityDocId = '';
        let resolvedEvalDocId = '';
        let resolvedScopeKey: string | undefined;
        let resolvedRemark = '';

        if (clubDocId) {
            const evalDocId = `${e.academicYear}_${e.semester}`;
            const results = evalResultsByPath[`clubs/${clubDocId}/${evalDocId}`];
            failed = results?.[e.studentId]?.status === 'failed';
            resolvedRemark = results?.[e.studentId]?.remark || '';
            const teacher = getTeacherForAssignment(courseId, e.academicYear, e.semester);
            teacherName = teacher.name;
            responsibleTeacherIds = teacher.ids;
            flagKind = 'club';
            activityCollectionName = 'clubs';
            resolvedActivityDocId = clubDocId;
            resolvedEvalDocId = evalDocId;
        } else if (activityDocId) {
            const termKey = activityTermKey(courseId, e.academicYear, e.semester);
            const scopes = scopesByTermKey[termKey] || [];
            const candidateKeys = scopes.length > 0 ? scopes.map(s => s.key) : [undefined];
            for (const scopeKey of candidateKeys) {
                const evalDocId = buildLearnerActivityEvaluationDocId(e.academicYear, e.semester, scopeKey);
                const results = evalResultsByPath[`learner-activities/${activityDocId}/${evalDocId}`];
                if (results?.[e.studentId]) {
                    failed = results[e.studentId].status === 'failed';
                    resolvedRemark = results[e.studentId].remark || '';
                    const matchedScope = scopes.find(s => s.key === scopeKey);
                    const scopeTeacherName = getTeacherDisplayName(teacherMap, matchedScope?.teacherId, matchedScope?.teacherName);
                    const fallback = getTeacherForAssignment(courseId, e.academicYear, e.semester);
                    teacherName = scopeTeacherName !== '-' ? scopeTeacherName : fallback.name;
                    responsibleTeacherIds = matchedScope?.teacherIds && matchedScope.teacherIds.length > 0 ? matchedScope.teacherIds : fallback.ids;
                    flagKind = 'learner-activity';
                    activityCollectionName = 'learner-activities';
                    resolvedActivityDocId = activityDocId;
                    resolvedEvalDocId = evalDocId;
                    resolvedScopeKey = scopeKey;
                    break;
                }
            }
        } else {
            return; // ไม่พบระบบประเมินที่เชื่อมโยงกับวิชานี้ — ข้าม (ไม่สร้างข้อมูลเดา)
        }

        if (!failed || !course) return;
        addFlag(e.studentId, {
            courseId,
            courseCode: course.code,
            courseTitle: course.title,
            credits: course.credits ?? 0,
            grade: 'มผ',
            academicYear: e.academicYear,
            semester: e.semester,
            teacherName,
            flagKind,
            activityCollectionName,
            activityDocId: resolvedActivityDocId,
            evalDocId: resolvedEvalDocId,
            teacherScopeKey: resolvedScopeKey,
            responsibleTeacherIds,
            remark: resolvedRemark,
        });
    });

    // 6. ชุมนุมโหมด "legacy" — โรงเรียนที่ยังไม่ได้เปลี่ยนเป็นโหมด course-based (ActivityHubSettingsPage) จะไม่มี
    // enrollments/linkedCourseId ให้ resolve เลย (ClubMemberManagementPage เขียนแค่ clubs/{id}/members) จึงต้องอ่าน
    // ผลประเมิน "มผ" ของชุมนุมกลุ่มนี้ตรงจาก evaluations subcollection เอง โดยไม่พึ่ง enrollments/clubDocByCourseId
    const linkedClubDocIds = new Set(Object.values(clubDocByCourseId));
    const legacyClubDocs = clubSnap.docs.filter(d => !linkedClubDocIds.has(d.id));
    if (legacyClubDocs.length > 0) {
        const [legacyEvalSnaps, legacyMemberSnaps] = await Promise.all([
            Promise.all(legacyClubDocs.map(d => getDocs(collection(db, 'school-settings', schoolId, 'clubs', d.id, 'evaluations')))),
            Promise.all(legacyClubDocs.map(d => getDocs(collection(db, 'school-settings', schoolId, 'clubs', d.id, 'members')))),
        ]);
        legacyClubDocs.forEach((clubDoc, idx) => {
            const clubData: any = clubDoc.data();
            const teacherIds: string[] = clubData.responsibleTeacherIds || [];
            const teacherNames = teacherIds.map(tid => getTeacherDisplayName(teacherMap, tid)).filter(n => n !== '-');
            const teacherName = teacherNames.length > 0 ? teacherNames.join(', ') : '-';
            // เทียบกับสมาชิกปัจจุบันของชุมนุม (clubs/{id}/members) เหมือนที่ ActivityEvaluationPage (mode="club")
            // ใช้ขึ้นรายชื่อให้ครูประเมิน — กันไม่ให้นักเรียนที่ออกจากชุมนุมไปแล้วยังค้างโผล่เป็น "มผ" ที่นี่
            // ทั้งที่หน้าประเมินจริงไม่แสดงให้เห็นแล้ว (ข้อมูลไม่ตรงกันระหว่าง 2 หน้า)
            const currentMemberIds = new Set(legacyMemberSnaps[idx].docs.map(m => m.id));

            legacyEvalSnaps[idx].forEach(evalDoc => {
                const [evalYear, evalSemester] = evalDoc.id.split('_');
                if (!evalYear || !evalSemester) return;
                if (termAcademicYear && evalYear !== termAcademicYear) return;
                if (termAcademicYear && termSemester && evalSemester !== termSemester) return;
                const results = (evalDoc.data() as any).results || {};
                Object.entries(results).forEach(([studentId, r]: [string, any]) => {
                    if (!studentInfoMap[studentId]) return;
                    if (!currentMemberIds.has(studentId)) return;
                    if (r?.status !== 'failed') return;
                    addFlag(studentId, {
                        courseId: `legacy-club:${clubDoc.id}`,
                        courseCode: clubData.specialPeriodTitle || 'ชุมนุม',
                        courseTitle: clubData.name || clubData.title || 'ชุมนุม',
                        credits: 0,
                        grade: 'มผ',
                        academicYear: evalYear,
                        semester: evalSemester,
                        teacherName,
                        flagKind: 'club',
                        activityCollectionName: 'clubs',
                        activityDocId: clubDoc.id,
                        evalDocId: evalDoc.id,
                        responsibleTeacherIds: teacherIds,
                        remark: String(r?.remark || '').trim(),
                    });
                });
            });
        });
    }

    // 7. กิจกรรมแนะแนว (guidance) — ไม่มีคอร์ส/กิจกรรมผูกอยู่เลย ประเมินตรงตามชั้น/ห้อง (ActivityEvaluationPage
    // mode="guidance") เก็บผลที่ guidance-evaluations ซึ่งเป็น collection ระดับบนสุด (ไม่ใช่ subcollection ของ
    // activity doc เหมือน clubs/learner-activities) — ผู้รับผิดชอบใช้ครูที่ปรึกษา/ครูประจำชั้น (homeroomGrade/
    // homeroomRoom บน teacherMap จาก fetchTeachersMap) เทียบกับ classId/room ของเอกสารประเมิน
    const guidanceSnap = await getDocs(collection(db, 'school-settings', schoolId, 'guidance-evaluations'));
    guidanceSnap.docs.forEach(gDoc => {
        const data: any = gDoc.data();
        const gYear = String(data.academicYear || '');
        const gSemester = String(data.semester || '');
        if (!gYear || !gSemester) return;
        if (termAcademicYear && gYear !== termAcademicYear) return;
        if (termAcademicYear && termSemester && gSemester !== termSemester) return;

        const classId = String(data.classId || '');
        const room = String(data.room || '');
        // teachers.homeroomGrade เก็บเป็นป้ายไทย (เช่น "ม.3") แต่ classId ของ guidance-evaluations เป็นรหัสคีย์
        // (เช่น "m3" จาก availableClassOptions) — ต้องเทียบผ่าน matchesClassLevel เหมือนตอนกรองนักเรียน ห้ามเทียบตรงๆ
        const homeroomTeachers = Object.values(teacherMap || {}).filter((t: any) =>
            matchesClassLevel(t.homeroomGrade, classId) && String(t.homeroomRoom || '') === room
        ) as any[];
        const responsibleTeacherIds = homeroomTeachers.map((t: any) => t.uid || t.id).filter(Boolean);
        const teacherNames = homeroomTeachers.map((t: any) => getTeacherDisplayName(teacherMap, t.id)).filter(n => n !== '-');
        const teacherName = teacherNames.length > 0 ? teacherNames.join(', ') : '-';

        const results = data.results || {};
        Object.entries(results).forEach(([studentId, r]: [string, any]) => {
            if (!studentInfoMap[studentId]) return;
            if (r?.status !== 'failed') return;
            addFlag(studentId, {
                courseId: `guidance:${classId}:${room}`,
                courseCode: 'แนะแนว',
                courseTitle: data.targetName || `แนะแนว ${classId}/${room}`,
                credits: 0,
                grade: 'มผ',
                academicYear: gYear,
                semester: gSemester,
                teacherName,
                flagKind: 'guidance',
                activityCollectionName: 'guidance-evaluations',
                activityDocId: gDoc.id,
                evalDocId: gDoc.id,
                responsibleTeacherIds,
                remark: String(r?.remark || '').trim(),
            });
        });
    });

    return Object.keys(flaggedByStudent).map(sid => {
        const info = studentInfoMap[sid];
        const flags = [...flaggedByStudent[sid]].sort((a, b) => {
            if (a.academicYear !== b.academicYear) return a.academicYear.localeCompare(b.academicYear);
            if (a.semester !== b.semester) return a.semester.localeCompare(b.semester);
            return a.courseCode.localeCompare(b.courseCode, 'th', { numeric: true });
        });
        return {
            id: sid,
            studentCode: info?.code || '-',
            number: info?.number || '',
            name: info?.name || 'ไม่พบข้อมูลนักเรียน',
            classLevel: info?.classLevel || '',
            room: info?.room || '',
            flags,
        };
    });
};

// รายชื่อปีการศึกษาที่โรงเรียนตั้งค่าไว้แล้ว (school-calendar) — ใช้ทำ dropdown ย้อนหลังได้หลายปี
// เอกสารเก็บที่ main_calendar/{ปีการศึกษา} (doc id = ปี) ยกเว้น main_calendar/default ซึ่งเป็นแค่ตัวชี้ปีปัจจุบัน
// จำกัดไว้ไม่เกิน 10 ปีการศึกษาล่าสุด (เผื่อกรณีย้อนหลังมาแก้ 0/ร/มส/มผ หรือเรียนซ้ำชั้น) เพื่อไม่ให้
// ดรอปดาวน์ยาวเกินไปเมื่อโรงเรียนตั้งค่าปฏิทินสะสมไว้หลายสิบปี
const MAX_ACADEMIC_YEAR_OPTIONS = 10;

export const fetchAvailableAcademicYears = async (schoolId: string): Promise<string[]> => {
    const snap = await getDocs(collection(db, 'school-settings', schoolId, 'main_calendar'));
    return snap.docs
        .map(d => d.id)
        .filter(id => id !== 'default')
        .sort((a, b) => Number(b) - Number(a))
        .slice(0, MAX_ACADEMIC_YEAR_OPTIONS);
};

// เช็คว่าเอกสารที่มี academicYear/semester ของตัวเอง (เช่น remediation_requests) ตรงกับตัวกรองปี/ภาคเรียน
// ที่ผู้ใช้เลือกไว้หรือไม่ — filterYear ว่าง = ไม่กรองปี, filterSemester ว่าง = ทั้งปี (ทั้ง 2 ภาคเรียน)
// สำคัญ: ต้องเลือกปีการศึกษาไว้ก่อนเท่านั้น ตัวกรองภาคเรียนจึงจะมีผล — ถ้า filterYear ว่าง (ทุกปีการศึกษา)
// filterSemester ต้องไม่ถูกนำมาใช้กรอง ไม่งั้นจะกลายเป็น "ภาคเรียนนี้ทุกปี" ซึ่งไม่ตรงกับสิ่งที่ผู้ใช้เลือกในหน้าจอ
export const matchesAcademicTerm = (
    recordYear: string | undefined,
    recordSemester: string | undefined,
    filterYear: string,
    filterSemester: string
): boolean => {
    if (filterYear && recordYear !== filterYear) return false;
    if (filterYear && filterSemester && recordSemester !== filterSemester) return false;
    return true;
};

export interface AssessmentItemLite {
    id?: string;
    name?: string;
    maxScore?: number;
}

export interface FullRosterRow {
    key: string;
    studentId: string;
    studentCode: string;
    name: string;
    classLevel: string;
    room: string;
    number: string;
    courseId: string;
    courseCode: string;
    courseTitle: string;
    groupName: string;
    academicYear: string;
    semester: string;
    flagKind: 'course' | 'club' | 'learner-activity' | 'guidance';
    teacherName: string;
    responsibleTeacherIds: string[];
    grade: string; // วิชาปกติ: ตัวเลขเกรด (0/1/1.5/.../4) หรือ '0'/'ร'/'มส'; กิจกรรม: 'ผ'/'มผ' เท่านั้น, '-' เมื่อไม่มีผลการเรียน
    percent?: number;
    status: 'flag' | 'normal' | 'none'; // ติดผลการเรียน / ปกติ / ไม่มีผลการเรียน
    activityCollectionName?: 'clubs' | 'learner-activities' | 'guidance-evaluations';
    activityDocId?: string;
    evalDocId?: string;
    teacherScopeKey?: string;
}

export interface FetchFullRosterOptions {
    academicYear?: string;
    semester?: string;
}

/**
 * รายชื่อ "ทุก enrollment" ทั้งโรงเรียน (ไม่เฉพาะคนติด 0/ร/มส/มผ) พร้อมจัดสถานะ flag/normal/none —
 * ใช้โดยหน้าภาพรวม (RemediationOverviewPage.tsx) แบบตาราง SGS เต็มรูป
 * ใช้ฐานข้อมูลอ้างอิงชุดเดียวกับ fetchFlaggedStudents (courses/course_assignments/clubs/learner-activities)
 * เพื่อไม่ให้สองหน้านี้เห็นข้อมูลไม่ตรงกัน
 */
export const fetchFullRoster = async (
    schoolId: string,
    teacherMap: Record<string, any>,
    options: FetchFullRosterOptions = {}
): Promise<FullRosterRow[]> => {
    const { academicYear: termAcademicYear, semester: termSemester } = options;

    const [studentSnap, courseSnap, assignmentSnap, clubSnap, learnerActivitySnap] = await Promise.all([
        getDocs(collection(db, 'school-settings', schoolId, 'students')),
        getDocs(collection(db, 'school-settings', schoolId, 'courses')),
        getDocs(collection(db, 'school-settings', schoolId, 'course_assignments')),
        getDocs(collection(db, 'school-settings', schoolId, 'clubs')),
        getDocs(collection(db, 'school-settings', schoolId, 'learner-activities')),
    ]);

    const studentInfoMap: Record<string, { code: string; name: string; number: string; classLevel: string; room: string }> = {};
    studentSnap.docs.forEach(sDoc => {
        const sData: any = sDoc.data();
        const name = sData.firstName
            ? `${sData.title || sData.prefix || ''}${sData.firstName} ${sData.lastName || ''}`.trim()
            : (sData.name || 'ไม่พบข้อมูลนักเรียน');
        studentInfoMap[sDoc.id] = {
            code: String(sData.studentCode || sData.studentId || sData.code || sData['รหัสนักเรียน'] || '-'),
            name,
            number: String(sData.studentNumber || sData.number || sData.no || sData['เลขที่'] || '').trim(),
            classLevel: sData.classLevel || '',
            room: String(sData.room || ''),
        };
    });

    interface CourseFull {
        id: string; code: string; title: string; classId?: string | string[]; credits?: number;
        formativeAssessments?: AssessmentItemLite[]; midtermWeight?: number; finalWeight?: number;
    }
    const courseMap: Record<string, CourseFull> = {};
    const courseCodeToId: Record<string, string> = {};
    courseSnap.docs.forEach(d => {
        const data: any = d.data();
        courseMap[d.id] = {
            id: d.id, code: data.code || '', title: data.title || '', classId: data.classId, credits: data.credits,
            formativeAssessments: data.formativeAssessments, midtermWeight: data.midtermWeight, finalWeight: data.finalWeight,
        };
        if (data.code) courseCodeToId[data.code] = d.id;
    });

    const assignmentsByCourse: Record<string, any[]> = {};
    assignmentSnap.docs.forEach(d => {
        const data: any = d.data();
        if (!data.courseId) return;
        if (!assignmentsByCourse[data.courseId]) assignmentsByCourse[data.courseId] = [];
        assignmentsByCourse[data.courseId].push(data);
    });
    mergeAssignmentsAcrossDuplicateCourseCodes(courseMap, assignmentsByCourse);

    const clubDocByCourseId: Record<string, string> = {};
    clubSnap.docs.forEach(d => {
        const data: any = d.data();
        const linked = data.linkedCourseId || data.courseId;
        if (linked) clubDocByCourseId[linked] = d.id;
        if (courseMap[d.id]) clubDocByCourseId[d.id] = d.id;
    });

    const activityDocByCourseId: Record<string, string> = {};
    learnerActivitySnap.docs.forEach(d => {
        const data: any = d.data();
        const linked = data.courseId;
        if (linked) activityDocByCourseId[linked] = d.id;
        if (courseMap[d.id]) activityDocByCourseId[d.id] = d.id;
    });

    // ดึง enrollment ทั้งโรงเรียน — กรองปี/เทอมด้วย Firestore query ตรงๆ ถ้าระบุ เพื่อไม่ต้องโหลดทุก record
    const enrollRef = collection(db, 'school-settings', schoolId, 'enrollments');
    const enrollConstraints = [];
    if (termAcademicYear) enrollConstraints.push(where('academicYear', '==', termAcademicYear));
    if (termAcademicYear && termSemester) enrollConstraints.push(where('semester', '==', termSemester));
    const enrollSnap = await getDocs(enrollConstraints.length > 0 ? query(enrollRef, ...enrollConstraints) : enrollRef);

    interface EnrollmentFull { studentId: string; courseId: string; academicYear: string; semester: string; groupName: string }
    const enrollments: EnrollmentFull[] = [];
    enrollSnap.forEach(eDoc => {
        const data: any = eDoc.data();
        const courseId = data.courseId || (data.courseCode ? courseCodeToId[data.courseCode] : undefined);
        if (!courseId || !courseMap[courseId]) return;
        if (!data.studentId || !studentInfoMap[data.studentId]) return;
        if (!data.academicYear || !data.semester) return;
        enrollments.push({
            studentId: data.studentId, courseId, academicYear: String(data.academicYear), semester: String(data.semester),
            groupName: String(data.groupName || data.group || '-'),
        });
    });

    const regularEnrollments = enrollments.filter(e => !isActivityCourseCode(courseMap[e.courseId]?.code));
    const activityEnrollments = enrollments.filter(e => isActivityCourseCode(courseMap[e.courseId]?.code));

    const getTeacherForAssignment = (courseId: string, academicYear: string, semester: string) => {
        const matches = (assignmentsByCourse[courseId] || []).filter(a => String(a.academicYear) === academicYear && String(a.semester) === semester);
        const firstAssignment = matches[0]?.teacherAssignments?.[0];
        if (!firstAssignment) return { name: '-', ids: [] as string[] };
        const ids = matches.flatMap(m => (m.teacherAssignments || []).map((ta: any) => ta.teacherId).filter(Boolean));
        return { name: getTeacherDisplayName(teacherMap, firstAssignment.teacherId, firstAssignment.teacherName), ids: Array.from(new Set(ids)) };
    };

    const rows: FullRosterRow[] = [];

    // ── วิชาปกติ: อ่าน grades subcollection ของทุกวิชาที่เกี่ยวข้องครั้งเดียว แล้วคำนวณ Total/%/Grade ──
    const uniqueRegularCourseIds = Array.from(new Set(regularEnrollments.map(e => e.courseId)));
    const regularGradeSnaps = await Promise.all(
        uniqueRegularCourseIds.map(cid => getDocs(collection(db, 'school-settings', schoolId, 'courses', cid, 'grades')))
    );
    const gradesByCourse: Record<string, Record<string, any>> = {};
    uniqueRegularCourseIds.forEach((cid, idx) => {
        const map: Record<string, any> = {};
        regularGradeSnaps[idx].forEach(gDoc => { map[gDoc.id] = gDoc.data(); });
        gradesByCourse[cid] = map;
    });

    regularEnrollments.forEach(e => {
        const course = courseMap[e.courseId];
        const sInfo = studentInfoMap[e.studentId];
        const teacher = getTeacherForAssignment(e.courseId, e.academicYear, e.semester);
        const record: any = gradesByCourse[e.courseId]?.[e.studentId];

        let status: 'flag' | 'normal' | 'none' = 'none';
        let grade = '-';
        let percent: number | undefined;

        if (record && (record.grade !== undefined || record.status !== undefined || record.formativeDetails || record.midterm !== undefined || record.final !== undefined)) {
            const maxTotal = (() => {
                const formativeMax = (course.formativeAssessments || []).reduce((sum, a) => sum + (Number(a.maxScore) || 0), 0);
                const t = formativeMax + (Number(course.midtermWeight) || 0) + (Number(course.finalWeight) || 0);
                return t > 0 ? t : 100;
            })();
            const details = record.formativeDetails || {};
            const detailSum = Object.values(details).reduce((sum: number, v) => sum + (Number(v) || 0), 0);
            const midterm = Number(record.midterm) || 0;
            const final = Number(record.final) || 0;
            const total = detailSum + midterm + final;
            percent = Math.round((total / maxTotal) * 10000) / 100;
            grade = String(record.grade || record.status || calculateGradeFromTotal(total));
            status = (grade === '0' || grade === 'ร' || grade === 'มส') ? 'flag' : 'normal';
        }

        rows.push({
            key: `${e.studentId}|${e.courseId}|${e.academicYear}|${e.semester}`,
            studentId: e.studentId,
            studentCode: sInfo.code,
            name: sInfo.name,
            classLevel: sInfo.classLevel,
            room: sInfo.room,
            number: sInfo.number,
            courseId: e.courseId,
            courseCode: course.code,
            courseTitle: course.title,
            groupName: e.groupName,
            academicYear: e.academicYear,
            semester: e.semester,
            flagKind: 'course',
            teacherName: teacher.name,
            responsibleTeacherIds: teacher.ids,
            grade, percent, status,
        });
    });

    // ── วิชากิจกรรม: resolve evalDocId เหมือน fetchFlaggedStudents ทุกประการ แต่คืนค่าทุกสถานะ (pending/passed/failed) ──
    const evalDocPaths = new Map<string, { collectionName: 'clubs' | 'learner-activities'; activityDocId: string; evalDocId: string }>();
    const activityTermKey = (courseId: string, year: string, semester: string) => `${courseId}|${year}|${semester}`;
    const scopesByTermKey: Record<string, LearnerActivityTeacherScope[]> = {};

    activityEnrollments.forEach(e => {
        const courseId = e.courseId;
        const clubDocId = clubDocByCourseId[courseId];
        const activityDocId = activityDocByCourseId[courseId];

        if (clubDocId) {
            const evalDocId = `${e.academicYear}_${e.semester}`;
            evalDocPaths.set(`clubs/${clubDocId}/${evalDocId}`, { collectionName: 'clubs', activityDocId: clubDocId, evalDocId });
        } else if (activityDocId) {
            const termKey = activityTermKey(courseId, e.academicYear, e.semester);
            if (!scopesByTermKey[termKey]) {
                const assignment = (assignmentsByCourse[courseId] || []).find(a => String(a.academicYear) === e.academicYear && String(a.semester) === e.semester);
                scopesByTermKey[termKey] = deriveTeacherScopesFromCourse({}, { id: courseId, classId: courseMap[courseId]?.classId, teacherAssignments: assignment?.teacherAssignments || [] }, teacherMap);
            }
            const scopes = scopesByTermKey[termKey];
            const candidateKeys = scopes.length > 0 ? scopes.map(s => s.key) : [undefined];
            candidateKeys.forEach(scopeKey => {
                const evalDocId = buildLearnerActivityEvaluationDocId(e.academicYear, e.semester, scopeKey);
                evalDocPaths.set(`learner-activities/${activityDocId}/${evalDocId}`, { collectionName: 'learner-activities', activityDocId, evalDocId });
            });
        }
    });

    const evalPathList = Array.from(evalDocPaths.entries());
    const evalDocs = await Promise.all(
        evalPathList.map(([, info]) => getDoc(doc(db, 'school-settings', schoolId, info.collectionName, info.activityDocId, 'evaluations', info.evalDocId)))
    );
    const evalResultsByPath: Record<string, Record<string, { status: string }>> = {};
    evalPathList.forEach(([pathKey], idx) => {
        const snap = evalDocs[idx];
        if (snap.exists()) evalResultsByPath[pathKey] = (snap.data() as any).results || {};
    });

    activityEnrollments.forEach(e => {
        const courseId = e.courseId;
        const course = courseMap[courseId];
        const sInfo = studentInfoMap[e.studentId];
        const clubDocId = clubDocByCourseId[courseId];
        const activityDocId = activityDocByCourseId[courseId];

        let resultStatus: string | undefined;
        let teacherName = '-';
        let responsibleTeacherIds: string[] = [];
        let flagKind: 'club' | 'learner-activity' = 'club';
        let activityCollectionName: 'clubs' | 'learner-activities' = 'clubs';
        let resolvedActivityDocId = '';
        let resolvedEvalDocId = '';
        let resolvedScopeKey: string | undefined;

        if (clubDocId) {
            const evalDocId = `${e.academicYear}_${e.semester}`;
            const results = evalResultsByPath[`clubs/${clubDocId}/${evalDocId}`];
            resultStatus = results?.[e.studentId]?.status;
            const teacher = getTeacherForAssignment(courseId, e.academicYear, e.semester);
            teacherName = teacher.name;
            responsibleTeacherIds = teacher.ids;
            flagKind = 'club';
            activityCollectionName = 'clubs';
            resolvedActivityDocId = clubDocId;
            resolvedEvalDocId = evalDocId;
        } else if (activityDocId) {
            const termKey = activityTermKey(courseId, e.academicYear, e.semester);
            const scopes = scopesByTermKey[termKey] || [];
            const candidateKeys = scopes.length > 0 ? scopes.map(s => s.key) : [undefined];
            for (const scopeKey of candidateKeys) {
                const evalDocId = buildLearnerActivityEvaluationDocId(e.academicYear, e.semester, scopeKey);
                const results = evalResultsByPath[`learner-activities/${activityDocId}/${evalDocId}`];
                if (results?.[e.studentId]) {
                    resultStatus = results[e.studentId].status;
                    const matchedScope = scopes.find(s => s.key === scopeKey);
                    const scopeTeacherName = getTeacherDisplayName(teacherMap, matchedScope?.teacherId, matchedScope?.teacherName);
                    const fallback = getTeacherForAssignment(courseId, e.academicYear, e.semester);
                    teacherName = scopeTeacherName !== '-' ? scopeTeacherName : fallback.name;
                    responsibleTeacherIds = matchedScope?.teacherIds && matchedScope.teacherIds.length > 0 ? matchedScope.teacherIds : fallback.ids;
                    flagKind = 'learner-activity';
                    activityCollectionName = 'learner-activities';
                    resolvedActivityDocId = activityDocId;
                    resolvedEvalDocId = evalDocId;
                    resolvedScopeKey = scopeKey;
                    break;
                }
            }
        } else {
            return;
        }

        if (!course) return;
        const status: 'flag' | 'normal' | 'none' = resultStatus === 'failed' ? 'flag' : resultStatus === 'passed' ? 'normal' : 'none';
        // กิจกรรม (รหัส ก) ประเมินผ่าน/ไม่ผ่าน ใช้ตัวย่อ "ผ"/"มผ" ตามธรรมเนียมเดียวกับ 0/ร/มส (ไม่ใช้ตัวเลขเกรด)
        const grade = resultStatus === 'failed' ? 'มผ' : resultStatus === 'passed' ? 'ผ' : '-';

        rows.push({
            key: `${e.studentId}|${resolvedActivityDocId || courseId}|${e.academicYear}|${e.semester}`,
            studentId: e.studentId,
            studentCode: sInfo.code,
            name: sInfo.name,
            classLevel: sInfo.classLevel,
            room: sInfo.room,
            number: sInfo.number,
            courseId,
            courseCode: course.code,
            courseTitle: course.title,
            groupName: e.groupName,
            academicYear: e.academicYear,
            semester: e.semester,
            flagKind,
            teacherName,
            responsibleTeacherIds,
            grade, status,
            activityCollectionName,
            activityDocId: resolvedActivityDocId,
            evalDocId: resolvedEvalDocId,
            teacherScopeKey: resolvedScopeKey,
        });
    });

    // ── กิจกรรมแนะแนว (guidance) — ไม่มีคอร์ส/กิจกรรมผูกเลย ประเมินตรงตามชั้น/ห้อง เก็บที่ guidance-evaluations
    // (collection ระดับบนสุด ไม่ใช่ subcollection ของ activity doc เหมือน clubs/learner-activities) แสดงได้เฉพาะ
    // ตอนเลือกปีการศึกษาที่แน่นอน (ต้องมีขอบเขตปี/เทอมชัดเจนถึงจะไล่แจกแจงนักเรียนทุกคนในชั้น/ห้องนั้นได้ รวมถึง
    // คนที่ยังไม่ถูกประเมิน = status 'none') — ถ้าเลือก "ทุกปีการศึกษา" (ไม่ระบุปี) จะข้ามส่วนนี้ไป
    if (termAcademicYear) {
        const guidanceSemesters = termSemester ? [termSemester] : ['1', '2'];
        const guidanceSnap = await getDocs(collection(db, 'school-settings', schoolId, 'guidance-evaluations'));
        const guidanceDocs = guidanceSnap.docs
            .map(d => ({ docId: d.id, ...(d.data() as any) }))
            .filter(g => String(g.academicYear || '') === termAcademicYear && guidanceSemesters.includes(String(g.semester || '')));

        if (guidanceDocs.length > 0) {
            const classRoomPairs = Array.from(new Set(
                Object.values(studentInfoMap).map(s => `${s.classLevel}|${s.room}`)
            ));

            guidanceDocs.forEach(gDoc => {
                const classId = String(gDoc.classId || '');
                const room = String(gDoc.room || '');
                const semester = String(gDoc.semester || '');
                const matchingPairs = classRoomPairs.filter(pair => {
                    const [cl, rm] = pair.split('|');
                    return matchesClassLevel(cl, classId) && String(rm) === room;
                });
                if (matchingPairs.length === 0) return;

                const homeroomTeachers = Object.values(teacherMap || {}).filter((t: any) =>
                    String(t.homeroomGrade || '') === classId && String(t.homeroomRoom || '') === room
                ) as any[];
                const responsibleTeacherIds = homeroomTeachers.map((t: any) => t.uid || t.id).filter(Boolean);
                const teacherNames = homeroomTeachers.map((t: any) => getTeacherDisplayName(teacherMap, t.id)).filter(n => n !== '-');
                const teacherName = teacherNames.length > 0 ? teacherNames.join(', ') : '-';
                const results = gDoc.results || {};

                Object.entries(studentInfoMap).forEach(([studentId, sInfo]) => {
                    const pairKey = `${sInfo.classLevel}|${sInfo.room}`;
                    if (!matchingPairs.includes(pairKey)) return;
                    const r = results[studentId];
                    const status: 'flag' | 'normal' | 'none' = r?.status === 'failed' ? 'flag' : r?.status === 'passed' ? 'normal' : 'none';
                    const grade = r?.status === 'failed' ? 'มผ' : r?.status === 'passed' ? 'ผ' : '-';
                    rows.push({
                        key: `${studentId}|guidance:${classId}:${room}|${termAcademicYear}|${semester}`,
                        studentId,
                        studentCode: sInfo.code,
                        name: sInfo.name,
                        classLevel: sInfo.classLevel,
                        room: sInfo.room,
                        number: sInfo.number,
                        courseId: `guidance:${classId}:${room}`,
                        courseCode: 'แนะแนว',
                        courseTitle: gDoc.targetName || `แนะแนว ${classId}/${room}`,
                        groupName: '-',
                        academicYear: termAcademicYear,
                        semester,
                        flagKind: 'guidance',
                        teacherName,
                        responsibleTeacherIds,
                        grade, status,
                        activityCollectionName: 'guidance-evaluations',
                        activityDocId: gDoc.docId,
                        evalDocId: gDoc.docId,
                    });
                });
            });
        }
    }

    rows.sort((a, b) => {
        if (a.academicYear !== b.academicYear) return b.academicYear.localeCompare(a.academicYear);
        if (a.semester !== b.semester) return b.semester.localeCompare(a.semester);
        const roomA = Number(a.room) || 999, roomB = Number(b.room) || 999;
        if (roomA !== roomB) return roomA - roomB;
        const numA = parseInt(a.number) || 999, numB = parseInt(b.number) || 999;
        if (numA !== numB) return numA - numB;
        return a.courseCode.localeCompare(b.courseCode, 'th', { numeric: true });
    });

    return rows;
};

export interface TranscriptRow {
    key: string;
    academicYear: string;
    semester: string;
    classLevel: string;
    courseCode: string;
    courseTitle: string;
    credits: number;
    grade: string;       // "ปกติ" — ผลตอนยื่นคำร้อง (originalGrade) ถ้ามีคำร้อง มิฉะนั้นผลปัจจุบัน
    finalGrade: string;  // "เกรด" — ผลใหม่หลัง resolved (newResult) ถ้ามี มิฉะนั้นเท่ากับ grade
    teacherName: string;
    flagKind: 'course' | 'club' | 'learner-activity' | 'guidance';
}

/**
 * ประวัติผลการเรียนทั้งหมดของนักเรียนคนเดียว (ทุกวิชา ทุกภาคเรียนที่เคยเรียนมา — ไม่ใช่แค่วิชาที่ติด)
 * พร้อมทำเครื่องหมายแก้ตัว/เรียนซ้ำตามคำร้อง remediation_requests ที่มีอยู่จริงเท่านั้น — ใช้พิมพ์ใบ
 * "คำร้องขอสอบแก้ตัว" (RemediationRequestsPage.tsx) ให้เห็นทุกวิชาในใบเดียวเหมือนแบบฟอร์มกระดาษเดิม
 * currentClassLevel: ใช้เป็น fallback ระดับชั้นสำหรับชุมนุมโหมด legacy ที่ไม่มีปี/ชั้นผูกกับสมาชิกภาพ
 */
export const fetchStudentTranscript = async (
    schoolId: string,
    teacherMap: Record<string, any>,
    studentId: string,
    currentClassLevel?: string
): Promise<TranscriptRow[]> => {
    const [enrollSnap, courseSnap, assignmentSnap, clubSnap, learnerActivitySnap, requestSnap] = await Promise.all([
        getDocs(query(collection(db, 'school-settings', schoolId, 'enrollments'), where('studentId', '==', studentId))),
        getDocs(collection(db, 'school-settings', schoolId, 'courses')),
        getDocs(collection(db, 'school-settings', schoolId, 'course_assignments')),
        getDocs(collection(db, 'school-settings', schoolId, 'clubs')),
        getDocs(collection(db, 'school-settings', schoolId, 'learner-activities')),
        getDocs(collection(db, 'school-settings', schoolId, 'remediation_requests')),
    ]);

    interface CourseFull {
        id: string; code: string; title: string; classId?: string | string[]; credits: number;
        formativeAssessments?: AssessmentItemLite[]; midtermWeight?: number; finalWeight?: number;
    }
    const courseMap: Record<string, CourseFull> = {};
    const courseCodeToId: Record<string, string> = {};
    courseSnap.docs.forEach(d => {
        const data: any = d.data();
        courseMap[d.id] = {
            id: d.id, code: data.code || '', title: data.title || '', classId: data.classId, credits: Number(data.credits) || 0,
            formativeAssessments: data.formativeAssessments, midtermWeight: data.midtermWeight, finalWeight: data.finalWeight,
        };
        if (data.code) courseCodeToId[data.code] = d.id;
    });

    const assignmentsByCourse: Record<string, any[]> = {};
    assignmentSnap.docs.forEach(d => {
        const data: any = d.data();
        if (!data.courseId) return;
        if (!assignmentsByCourse[data.courseId]) assignmentsByCourse[data.courseId] = [];
        assignmentsByCourse[data.courseId].push(data);
    });
    mergeAssignmentsAcrossDuplicateCourseCodes(courseMap, assignmentsByCourse);

    const clubDocByCourseId: Record<string, string> = {};
    clubSnap.docs.forEach(d => {
        const data: any = d.data();
        const linked = data.linkedCourseId || data.courseId;
        if (linked) clubDocByCourseId[linked] = d.id;
        if (courseMap[d.id]) clubDocByCourseId[d.id] = d.id;
    });

    const activityDocByCourseId: Record<string, string> = {};
    learnerActivitySnap.docs.forEach(d => {
        const data: any = d.data();
        const linked = data.courseId;
        if (linked) activityDocByCourseId[linked] = d.id;
        if (courseMap[d.id]) activityDocByCourseId[d.id] = d.id;
    });

    const getTeacherForAssignment = (courseId: string, academicYear: string, semester: string) => {
        const matches = (assignmentsByCourse[courseId] || []).filter(a => String(a.academicYear) === academicYear && String(a.semester) === semester);
        const firstAssignment = matches[0]?.teacherAssignments?.[0];
        if (!firstAssignment) return '-';
        return getTeacherDisplayName(teacherMap, firstAssignment.teacherId, firstAssignment.teacherName);
    };

    interface EnrollmentFull { courseId: string; academicYear: string; semester: string; classLevel: string }
    const enrollments: EnrollmentFull[] = [];
    enrollSnap.forEach(eDoc => {
        const data: any = eDoc.data();
        const courseId = data.courseId || (data.courseCode ? courseCodeToId[data.courseCode] : undefined);
        if (!courseId || !courseMap[courseId]) return;
        if (!data.academicYear || !data.semester) return;
        enrollments.push({ courseId, academicYear: String(data.academicYear), semester: String(data.semester), classLevel: data.classLevel || currentClassLevel || '' });
    });

    // remediation_requests ของนักเรียนคนนี้ — lookup ด้วย idValue (courseId หรือ activityId) + ปี/เทอม
    // (ต้องตรงกับ idForKey/idValue ที่หน้าอื่นๆ ใช้สร้าง dedup key ทุกประการ — courseId สำหรับ flagType==='course',
    // activityId (ซึ่งคือ clubDocId/learnerActivityDocId/guidanceEvalDocId ที่ resolve ไว้แล้ว) สำหรับที่เหลือ)
    interface ReqInfo { status: string; newResult?: string; originalGrade?: string }
    const requestByKey: Record<string, ReqInfo> = {};
    requestSnap.docs.forEach(d => {
        const data: any = d.data();
        if (data.studentId !== studentId) return;
        if (data.status === 'cancelled') return;
        const idValue = data.flagType === 'course' ? data.courseId : data.activityId;
        if (!idValue) return;
        const key = `${idValue}|${data.academicYear}|${data.semester}`;
        if (!requestByKey[key] || data.status === 'resolved') {
            requestByKey[key] = { status: data.status, newResult: data.newResult, originalGrade: data.originalGrade };
        }
    });
    // newResult ที่หน้าอื่นๆ เขียนไว้บางเส้นทางเป็นข้อความเต็ม เช่น "ผ่าน (แก้ตัวสำเร็จ)"/"ไม่ผ่าน (เรียนซ้ำ)"
    // (RemediationRecordPage) — ต้องย่อเป็นรหัสสั้นแบบเดียวกับคอลัมน์ "ปกติ" (0/ร/มส/มผ/ผ) ไม่งั้นล้นช่องตาราง
    const shortenResult = (text: string): string => {
        if (/ไม่ผ่าน|เรียนซ้ำ/.test(text)) return 'มผ';
        if (/ผ่าน/.test(text)) return 'ผ';
        return text;
    };
    const markRow = (reqKey: string, liveGrade: string) => {
        const req = requestByKey[reqKey];
        const grade = req?.originalGrade || liveGrade;
        const finalGrade = req?.status === 'resolved' ? shortenResult(req.newResult || liveGrade) : grade;
        return { grade, finalGrade };
    };

    const rows: TranscriptRow[] = [];
    const regularEnrollments = enrollments.filter(e => !isActivityCourseCode(courseMap[e.courseId]?.code));
    const activityEnrollments = enrollments.filter(e => isActivityCourseCode(courseMap[e.courseId]?.code));

    // ── วิชาปกติ ──
    const uniqueRegularCourseIds = Array.from(new Set(regularEnrollments.map(e => e.courseId)));
    const regularGradeSnaps = await Promise.all(
        uniqueRegularCourseIds.map(cid => getDoc(doc(db, 'school-settings', schoolId, 'courses', cid, 'grades', studentId)))
    );
    const gradeByCourse: Record<string, any> = {};
    uniqueRegularCourseIds.forEach((cid, idx) => {
        if (regularGradeSnaps[idx].exists()) gradeByCourse[cid] = regularGradeSnaps[idx].data();
    });

    regularEnrollments.forEach(e => {
        const course = courseMap[e.courseId];
        const record: any = gradeByCourse[e.courseId];
        const teacherName = getTeacherForAssignment(e.courseId, e.academicYear, e.semester);
        let liveGrade = '-';
        if (record) {
            if (record.grade !== undefined) liveGrade = String(record.grade);
            else if (record.status !== undefined) liveGrade = String(record.status);
            else if (record.formativeDetails || record.midterm !== undefined || record.final !== undefined) {
                const formativeMax = (course.formativeAssessments || []).reduce((s, a) => s + (Number(a.maxScore) || 0), 0);
                const maxTotal = (() => { const t = formativeMax + (Number(course.midtermWeight) || 0) + (Number(course.finalWeight) || 0); return t > 0 ? t : 100; })();
                const details = record.formativeDetails || {};
                const detailSum = Object.values(details).reduce((s: number, v) => s + (Number(v) || 0), 0);
                const total = detailSum + (Number(record.midterm) || 0) + (Number(record.final) || 0);
                liveGrade = calculateGradeFromTotal((total / maxTotal) * 100);
            }
        }
        const mark = markRow(`${e.courseId}|${e.academicYear}|${e.semester}`, liveGrade);
        rows.push({
            key: `${e.courseId}|${e.academicYear}|${e.semester}`,
            academicYear: e.academicYear, semester: e.semester, classLevel: e.classLevel,
            courseCode: course.code, courseTitle: course.title, credits: course.credits,
            teacherName, flagKind: 'course', ...mark,
        });
    });

    // ── กิจกรรมที่ผูกกับคอร์ส (ชุมนุม/กิจกรรมพัฒนาผู้เรียนโหมด course-based) ──
    const evalDocPaths = new Map<string, { collectionName: 'clubs' | 'learner-activities'; activityDocId: string; evalDocId: string }>();
    const activityTermKey = (courseId: string, year: string, semester: string) => `${courseId}|${year}|${semester}`;
    const scopesByTermKey: Record<string, LearnerActivityTeacherScope[]> = {};

    activityEnrollments.forEach(e => {
        const courseId = e.courseId;
        const clubDocId = clubDocByCourseId[courseId];
        const activityDocId = activityDocByCourseId[courseId];
        if (clubDocId) {
            const evalDocId = `${e.academicYear}_${e.semester}`;
            evalDocPaths.set(`clubs/${clubDocId}/${evalDocId}`, { collectionName: 'clubs', activityDocId: clubDocId, evalDocId });
        } else if (activityDocId) {
            const termKey = activityTermKey(courseId, e.academicYear, e.semester);
            if (!scopesByTermKey[termKey]) {
                const assignment = (assignmentsByCourse[courseId] || []).find(a => String(a.academicYear) === e.academicYear && String(a.semester) === e.semester);
                scopesByTermKey[termKey] = deriveTeacherScopesFromCourse({}, { id: courseId, classId: courseMap[courseId]?.classId, teacherAssignments: assignment?.teacherAssignments || [] }, teacherMap);
            }
            const scopes = scopesByTermKey[termKey];
            const candidateKeys = scopes.length > 0 ? scopes.map(s => s.key) : [undefined];
            candidateKeys.forEach(scopeKey => {
                const evalDocId = buildLearnerActivityEvaluationDocId(e.academicYear, e.semester, scopeKey);
                evalDocPaths.set(`learner-activities/${activityDocId}/${evalDocId}`, { collectionName: 'learner-activities', activityDocId, evalDocId });
            });
        }
    });

    const evalPathList = Array.from(evalDocPaths.entries());
    const evalDocs = await Promise.all(
        evalPathList.map(([, info]) => getDoc(doc(db, 'school-settings', schoolId, info.collectionName, info.activityDocId, 'evaluations', info.evalDocId)))
    );
    const evalResultsByPath: Record<string, Record<string, { status: string }>> = {};
    evalPathList.forEach(([pathKey], idx) => {
        const snap = evalDocs[idx];
        if (snap.exists()) evalResultsByPath[pathKey] = (snap.data() as any).results || {};
    });

    activityEnrollments.forEach(e => {
        const courseId = e.courseId;
        const course = courseMap[courseId];
        const clubDocId = clubDocByCourseId[courseId];
        const activityDocId = activityDocByCourseId[courseId];
        let resultStatus: string | undefined;
        let teacherName = '-';
        let flagKind: 'club' | 'learner-activity' = 'club';
        let resolvedId = '';

        if (clubDocId) {
            const evalDocId = `${e.academicYear}_${e.semester}`;
            const results = evalResultsByPath[`clubs/${clubDocId}/${evalDocId}`];
            resultStatus = results?.[studentId]?.status;
            teacherName = getTeacherForAssignment(courseId, e.academicYear, e.semester);
            flagKind = 'club';
            resolvedId = clubDocId;
        } else if (activityDocId) {
            const termKey = activityTermKey(courseId, e.academicYear, e.semester);
            const scopes = scopesByTermKey[termKey] || [];
            const candidateKeys = scopes.length > 0 ? scopes.map(s => s.key) : [undefined];
            for (const scopeKey of candidateKeys) {
                const evalDocId = buildLearnerActivityEvaluationDocId(e.academicYear, e.semester, scopeKey);
                const results = evalResultsByPath[`learner-activities/${activityDocId}/${evalDocId}`];
                if (results?.[studentId]) {
                    resultStatus = results[studentId].status;
                    const matchedScope = scopes.find(s => s.key === scopeKey);
                    const scopeTeacherName = getTeacherDisplayName(teacherMap, matchedScope?.teacherId, matchedScope?.teacherName);
                    teacherName = scopeTeacherName !== '-' ? scopeTeacherName : getTeacherForAssignment(courseId, e.academicYear, e.semester);
                    flagKind = 'learner-activity';
                    resolvedId = activityDocId;
                    break;
                }
            }
        } else {
            return;
        }

        if (!course) return;
        const liveGrade = resultStatus === 'failed' ? 'มผ' : resultStatus === 'passed' ? 'ผ' : '-';
        const mark = markRow(`${resolvedId}|${e.academicYear}|${e.semester}`, liveGrade);
        rows.push({
            key: `${courseId}|${e.academicYear}|${e.semester}`,
            academicYear: e.academicYear, semester: e.semester, classLevel: e.classLevel,
            courseCode: course.code, courseTitle: course.title, credits: course.credits,
            teacherName, flagKind, ...mark,
        });
    });

    // ── ชุมนุมโหมด legacy (ไม่มี enrollments/linkedCourseId) — เช็คสมาชิกภาพ+ผลประเมินตรงจาก clubs/{id} ──
    const linkedClubDocIds = new Set(Object.values(clubDocByCourseId));
    const legacyClubDocs = clubSnap.docs.filter(d => !linkedClubDocIds.has(d.id));
    if (legacyClubDocs.length > 0) {
        const [memberSnaps, legacyEvalSnaps] = await Promise.all([
            Promise.all(legacyClubDocs.map(d => getDoc(doc(db, 'school-settings', schoolId, 'clubs', d.id, 'members', studentId)))),
            Promise.all(legacyClubDocs.map(d => getDocs(collection(db, 'school-settings', schoolId, 'clubs', d.id, 'evaluations')))),
        ]);
        legacyClubDocs.forEach((clubDoc, idx) => {
            if (!memberSnaps[idx].exists()) return;
            const clubData: any = clubDoc.data();
            const teacherIds: string[] = clubData.responsibleTeacherIds || [];
            const teacherNames = teacherIds.map(tid => getTeacherDisplayName(teacherMap, tid)).filter(n => n !== '-');
            const teacherName = teacherNames.length > 0 ? teacherNames.join(', ') : '-';

            legacyEvalSnaps[idx].forEach(evalDoc => {
                const [evalYear, evalSemester] = evalDoc.id.split('_');
                if (!evalYear || !evalSemester) return;
                const results = (evalDoc.data() as any).results || {};
                const r = results[studentId];
                if (!r) return;
                const liveGrade = r.status === 'failed' ? 'มผ' : r.status === 'passed' ? 'ผ' : '-';
                const mark = markRow(`${clubDoc.id}|${evalYear}|${evalSemester}`, liveGrade);
                rows.push({
                    key: `legacy-club:${clubDoc.id}|${evalYear}|${evalSemester}`,
                    academicYear: evalYear, semester: evalSemester, classLevel: currentClassLevel || '',
                    courseCode: clubData.specialPeriodTitle || 'ชุมนุม', courseTitle: clubData.name || clubData.title || 'ชุมนุม', credits: 0,
                    teacherName, flagKind: 'club', ...mark,
                });
            });
        });
    }

    // ── กิจกรรมแนะแนว (guidance) — เช็คตรงจาก guidance-evaluations โดยดู results[studentId] ตรงๆ (ไม่ต้อง
    // รู้ชั้น/ห้องล่วงหน้าเหมือน fetchFullRoster เพราะค้นหาด้วย studentId ตรงๆ ในเอกสารเดียว ไม่ใช่ไล่ทั้งโรงเรียน) ──
    const guidanceSnap = await getDocs(collection(db, 'school-settings', schoolId, 'guidance-evaluations'));
    guidanceSnap.docs.forEach(gDoc => {
        const data: any = gDoc.data();
        const r = (data.results || {})[studentId];
        if (!r) return;
        const gYear = String(data.academicYear || '');
        const gSemester = String(data.semester || '');
        if (!gYear || !gSemester) return;
        const classId = String(data.classId || '');
        const room = String(data.room || '');
        const homeroomTeachers = Object.values(teacherMap || {}).filter((t: any) =>
            matchesClassLevel(t.homeroomGrade, classId) && String(t.homeroomRoom || '') === room
        ) as any[];
        const teacherNames = homeroomTeachers.map((t: any) => getTeacherDisplayName(teacherMap, t.id)).filter(n => n !== '-');
        const teacherName = teacherNames.length > 0 ? teacherNames.join(', ') : '-';
        const liveGrade = r.status === 'failed' ? 'มผ' : r.status === 'passed' ? 'ผ' : '-';
        const guidanceClassLevel = String(data.targetName || '').split('/')[0] || currentClassLevel || '';
        const mark = markRow(`${gDoc.id}|${gYear}|${gSemester}`, liveGrade);
        rows.push({
            key: `guidance:${gDoc.id}|${gYear}|${gSemester}`,
            academicYear: gYear, semester: gSemester, classLevel: guidanceClassLevel,
            courseCode: 'แนะแนว', courseTitle: data.targetName || `แนะแนว ${classId}/${room}`, credits: 0,
            teacherName, flagKind: 'guidance', ...mark,
        });
    });

    rows.sort((a, b) => {
        if (a.academicYear !== b.academicYear) return a.academicYear.localeCompare(b.academicYear);
        if (a.semester !== b.semester) return a.semester.localeCompare(b.semester);
        return a.courseCode.localeCompare(b.courseCode, 'th', { numeric: true });
    });

    return rows;
};
