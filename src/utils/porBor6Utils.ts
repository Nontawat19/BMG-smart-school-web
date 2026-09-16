// ─────────────────────────────────────────────────────────────────────────
// ข้อมูลสำหรับรายงานผลการเรียนรายบุคคล (ปพ.6) — ใช้ fetchStudentTranscript
// (remediationUtils.ts) เป็นแหล่งข้อมูลหลักสำหรับรายวิชา/เกรด/แก้ตัว/กิจกรรม
// ของนักเรียนคนเดียว (ห้ามคำนวณเกรด/แก้ตัวซ้ำเองที่นี่ — ใช้ผลจาก fetchStudentTranscript
// ตรงๆ เพื่อไม่ให้ข้อมูลเพี้ยนไปจากหน้าคำร้องแก้ตัว) แล้วเสริมเฉพาะส่วนที่ไม่มีใน
// TranscriptRow: คะแนนเต็ม/คะแนนที่ได้ดิบ, คุณลักษณะ, คิดวิเคราะห์, และหมวดวิชา
// (พื้นฐาน/เพิ่มเติม/กิจกรรม) — ส่วนอันดับที่ของห้อง/ระดับ เป็นของใหม่ที่ไม่เคยมีมาก่อน
// ในระบบ คำนวณจากเกรดเฉลี่ยภาคเรียนปัจจุบันของเพื่อนร่วมชั้น/ระดับ
// ─────────────────────────────────────────────────────────────────────────

import { collection, doc, getDoc, getDocs, query, where } from 'firebase/firestore';
import { firestore as db } from '@/firebase';
import { fetchStudentTranscript, TranscriptRow, isActivityCourseCode } from '@/utils/remediationUtils';

export type SubjectSection = 'พื้นฐาน' | 'เพิ่มเติม' | 'กิจกรรม';

export interface PorBor6SubjectRow {
    courseCode: string;
    courseTitle: string;
    credits: number;
    section: SubjectSection;
    maxScore: number | null;
    totalScore: number | null;
    grade: string;
    remedialGrade: string;
    characteristics: number | null;
    thinking: number | null;
    teacherName: string;
}

export interface PorBor6CreditSummary {
    basicStudied: number;
    basicEarned: number;
    additionalStudied: number;
    additionalEarned: number;
    totalStudied: number;
    totalEarned: number;
    gpa: number | null;
}

export interface PorBor6ReportData {
    subjects: PorBor6SubjectRow[];
    currentSummary: PorBor6CreditSummary;
    cumulativeSummary: PorBor6CreditSummary;
}

interface CourseLite {
    id: string;
    type?: string;
    formativeAssessments?: { maxScore?: number }[];
    midtermWeight?: number;
    finalWeight?: number;
}

const sectionOrder: Record<SubjectSection, number> = { 'พื้นฐาน': 0, 'เพิ่มเติม': 1, 'กิจกรรม': 2 };

export const getSubjectSection = (courseType: string | undefined, courseCode: string, flagKind: TranscriptRow['flagKind']): SubjectSection => {
    if (flagKind !== 'course' || isActivityCourseCode(courseCode)) return 'กิจกรรม';
    const raw = String(courseType || '').trim();
    const lower = raw.toLowerCase();
    if (raw.includes('เพิ่มเติม') || lower === 'additional') return 'เพิ่มเติม';
    return 'พื้นฐาน';
};

const computeMaxScore = (course?: CourseLite): number | null => {
    if (!course) return null;
    const formativeMax = (course.formativeAssessments || []).reduce((s, a) => s + (Number(a.maxScore) || 0), 0);
    const total = formativeMax + (Number(course.midtermWeight) || 0) + (Number(course.finalWeight) || 0);
    return total > 0 ? total : 100;
};

const avgScore = (scores?: Record<string, number>): number | null => {
    if (!scores) return null;
    const values = Object.values(scores);
    if (values.length === 0) return null;
    return Math.round(values.reduce((a, b) => a + b, 0) / values.length);
};

const toNumber = (value: string | number | undefined | null): number | null => {
    if (value === undefined || value === null || value === '') return null;
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
};

export const weightedAverage = (items: { credits: number; grade: string | number }[]): number | null => {
    let weighted = 0;
    let credits = 0;
    items.forEach(item => {
        const g = toNumber(item.grade);
        if (g === null) return;
        weighted += (item.credits || 0) * g;
        credits += (item.credits || 0);
    });
    return credits > 0 ? weighted / credits : null;
};

const isTermUpTo = (row: TranscriptRow, academicYear: string, semester: string): boolean => {
    const y = Number(row.academicYear);
    const s = Number(row.semester);
    const cy = Number(academicYear);
    const cs = Number(semester);
    if (!Number.isFinite(y) || !Number.isFinite(s) || !Number.isFinite(cy) || !Number.isFinite(cs)) return false;
    return y < cy || (y === cy && s <= cs);
};

export const fetchPorBor6ReportData = async (
    schoolId: string,
    teacherMap: Record<string, any>,
    studentId: string,
    classLevel: string,
    academicYear: string,
    semester: string,
): Promise<PorBor6ReportData> => {
    const [allRows, courseSnap] = await Promise.all([
        fetchStudentTranscript(schoolId, teacherMap, studentId, classLevel),
        getDocs(collection(db, 'school-settings', schoolId, 'courses')),
    ]);

    const courseByCode: Record<string, CourseLite> = {};
    courseSnap.docs.forEach(d => {
        const data: any = d.data();
        if (data.code && !courseByCode[data.code]) {
            courseByCode[data.code] = {
                id: d.id,
                type: data.type || data.courseType,
                formativeAssessments: data.formativeAssessments,
                midtermWeight: data.midtermWeight,
                finalWeight: data.finalWeight,
            };
        }
    });

    const classify = (row: TranscriptRow): SubjectSection => getSubjectSection(courseByCode[row.courseCode]?.type, row.courseCode, row.flagKind);

    const currentRows = allRows.filter(r => r.academicYear === academicYear && String(r.semester) === String(semester));
    const cumulativeRows = allRows.filter(r => isTermUpTo(r, academicYear, semester));

    const currentCourseRows = currentRows.filter(r => r.flagKind === 'course');
    const gradeDocSnaps = await Promise.all(
        currentCourseRows.map(r => {
            const courseId = courseByCode[r.courseCode]?.id;
            return courseId ? getDoc(doc(db, 'school-settings', schoolId, 'courses', courseId, 'grades', studentId)) : null;
        })
    );

    const subjects: PorBor6SubjectRow[] = currentRows
        .map(r => {
            const section = classify(r);
            if (r.flagKind !== 'course') {
                return {
                    courseCode: r.courseCode, courseTitle: r.courseTitle, credits: r.credits, section,
                    maxScore: null, totalScore: null, grade: r.finalGrade || r.grade || 'ผ', remedialGrade: r.passMark || '',
                    characteristics: null, thinking: null, teacherName: r.teacherName,
                };
            }
            const idx = currentCourseRows.indexOf(r);
            const snap = idx >= 0 ? gradeDocSnaps[idx] : null;
            const gradeData: any = snap && snap.exists() ? snap.data() : null;
            const course = courseByCode[r.courseCode];
            return {
                courseCode: r.courseCode, courseTitle: r.courseTitle, credits: r.credits, section,
                maxScore: computeMaxScore(course),
                totalScore: gradeData?.total !== undefined ? Number(gradeData.total) : null,
                grade: r.grade, remedialGrade: r.passMark || '',
                characteristics: avgScore(gradeData?.characteristicsScores),
                thinking: avgScore(gradeData?.readingWritingScores),
                teacherName: r.teacherName,
            };
        })
        .sort((a, b) => sectionOrder[a.section] - sectionOrder[b.section]);

    const summarize = (rows: TranscriptRow[]): PorBor6CreditSummary => {
        const courseRows = rows.filter(r => r.flagKind === 'course');
        const basic = courseRows.filter(r => classify(r) === 'พื้นฐาน');
        const additional = courseRows.filter(r => classify(r) === 'เพิ่มเติม');
        const isEarned = (r: TranscriptRow) => {
            const g = toNumber(r.finalGrade || r.grade);
            return g !== null && g > 0;
        };
        const sumCredits = (items: TranscriptRow[]) => items.reduce((s, r) => s + (r.credits || 0), 0);
        const basicStudied = sumCredits(basic);
        const basicEarned = sumCredits(basic.filter(isEarned));
        const additionalStudied = sumCredits(additional);
        const additionalEarned = sumCredits(additional.filter(isEarned));
        const gpaItems = [...basic, ...additional].map(r => ({ credits: r.credits, grade: r.finalGrade || r.grade }));
        return {
            basicStudied, basicEarned, additionalStudied, additionalEarned,
            totalStudied: basicStudied + additionalStudied, totalEarned: basicEarned + additionalEarned,
            gpa: weightedAverage(gpaItems),
        };
    };

    return {
        subjects,
        currentSummary: summarize(currentRows),
        cumulativeSummary: summarize(cumulativeRows),
    };
};

// ── อันดับที่ของห้อง/ระดับ — คำนวณจากเกรดเฉลี่ยภาคเรียนปัจจุบันของนักเรียนทุกคนในระดับชั้น
// เดียวกัน (ทุกห้อง) โดยอ่าน grades ของทุกวิชาที่เปิดสอนในระดับชั้นนั้นครั้งเดียว (ไม่ query ทีละคน)
// ไม่รวมวิชากิจกรรม (ก...) เพราะไม่มีเกรดตัวเลข — ใช้อันดับแบบ competition ranking (เท่ากัน = อันดับเดียวกัน)
export interface ClassLevelRankEntry {
    studentId: string;
    room: string;
    gpa: number | null;
    classRank: number | null;
    gradeLevelRank: number | null;
}

export const computeClassLevelRanks = async (
    schoolId: string,
    classLevel: string,
    academicYear: string,
    semester: string,
): Promise<Record<string, ClassLevelRankEntry>> => {
    const [studentSnap, enrollSnap, courseSnap] = await Promise.all([
        getDocs(query(collection(db, 'school-settings', schoolId, 'students'), where('classLevel', '==', classLevel))),
        getDocs(query(
            collection(db, 'school-settings', schoolId, 'enrollments'),
            where('classLevel', '==', classLevel),
            where('academicYear', '==', academicYear),
            where('semester', '==', semester),
        )),
        getDocs(collection(db, 'school-settings', schoolId, 'courses')),
    ]);

    const roomByStudentId: Record<string, string> = {};
    const activeStudentIds = new Set<string>();
    studentSnap.docs.forEach(d => {
        const data: any = d.data();
        const status = String(data.studentStatus || data.status || '').trim();
        const isActive = !status || status === 'กำลังศึกษา' || status.includes('กำลังศึกษา');
        if (!isActive) return;
        roomByStudentId[d.id] = String(data.room || '');
        activeStudentIds.add(d.id);
    });

    const courseById: Record<string, { code: string; credits: number }> = {};
    courseSnap.docs.forEach(d => {
        const data: any = d.data();
        courseById[d.id] = { code: data.code || '', credits: Number(data.credits) || 0 };
    });

    const enrollByCourse: Record<string, { studentId: string; courseId: string }[]> = {};
    enrollSnap.docs.forEach(d => {
        const data: any = d.data();
        if (!data.courseId || !data.studentId) return;
        if (!activeStudentIds.has(data.studentId)) return;
        const course = courseById[data.courseId];
        if (!course || isActivityCourseCode(course.code)) return;
        if (!enrollByCourse[data.courseId]) enrollByCourse[data.courseId] = [];
        enrollByCourse[data.courseId].push({ studentId: data.studentId, courseId: data.courseId });
    });

    const courseIds = Object.keys(enrollByCourse);
    const gradeSnaps = await Promise.all(
        courseIds.map(cid => getDocs(collection(db, 'school-settings', schoolId, 'courses', cid, 'grades')))
    );

    const gpaItemsByStudent: Record<string, { credits: number; grade: string }[]> = {};
    courseIds.forEach((cid, idx) => {
        const credits = courseById[cid]?.credits || 0;
        gradeSnaps[idx].docs.forEach(gDoc => {
            const studentId = gDoc.id;
            if (!activeStudentIds.has(studentId)) return;
            const data: any = gDoc.data();
            const grade = data.grade !== undefined ? String(data.grade) : '';
            if (!gpaItemsByStudent[studentId]) gpaItemsByStudent[studentId] = [];
            gpaItemsByStudent[studentId].push({ credits, grade });
        });
    });

    const gpaByStudent: Record<string, number | null> = {};
    Array.from(activeStudentIds).forEach(sid => {
        gpaByStudent[sid] = weightedAverage(gpaItemsByStudent[sid] || []);
    });

    const rankGroup = (studentIds: string[]): Record<string, number> => {
        const withGpa = studentIds
            .map(sid => ({ sid, gpa: gpaByStudent[sid] }))
            .filter((x): x is { sid: string; gpa: number } => x.gpa !== null)
            .sort((a, b) => b.gpa - a.gpa);
        const ranks: Record<string, number> = {};
        let rank = 0;
        let lastGpa: number | null = null;
        withGpa.forEach((item, index) => {
            if (lastGpa === null || item.gpa < lastGpa) {
                rank = index + 1;
                lastGpa = item.gpa;
            }
            ranks[item.sid] = rank;
        });
        return ranks;
    };

    const gradeLevelRanks = rankGroup(Array.from(activeStudentIds));
    const roomGroups: Record<string, string[]> = {};
    Array.from(activeStudentIds).forEach(sid => {
        const room = roomByStudentId[sid] || '';
        if (!roomGroups[room]) roomGroups[room] = [];
        roomGroups[room].push(sid);
    });
    const classRanksByRoom: Record<string, Record<string, number>> = {};
    Object.entries(roomGroups).forEach(([room, ids]) => {
        classRanksByRoom[room] = rankGroup(ids);
    });

    const result: Record<string, ClassLevelRankEntry> = {};
    Array.from(activeStudentIds).forEach(sid => {
        const room = roomByStudentId[sid] || '';
        result[sid] = {
            studentId: sid,
            room,
            gpa: gpaByStudent[sid],
            classRank: classRanksByRoom[room]?.[sid] ?? null,
            gradeLevelRank: gradeLevelRanks[sid] ?? null,
        };
    });
    return result;
};
