import { firestore as db } from '@/firebase';
import {
    collection,
    getDocs,
    doc,
    writeBatch,
    query,
    where,
    limit,
    QueryDocumentSnapshot,
} from 'firebase/firestore';

// Firestore caps a single batch at 500 writes; stay comfortably under it.
const BATCH_LIMIT = 450;

const commitInChunks = async (
    items: { ref: ReturnType<typeof doc>; data: Record<string, any> }[]
) => {
    let committed = 0;
    for (let i = 0; i < items.length; i += BATCH_LIMIT) {
        const chunk = items.slice(i, i + BATCH_LIMIT);
        const batch = writeBatch(db);
        chunk.forEach(({ ref, data }) => batch.set(ref, data, { merge: true }));
        await batch.commit();
        committed += chunk.length;
    }
    return committed;
};

/**
 * ย้ายข้อมูล SDQ จาก root collection 'sdq-assessments' ไปยัง school-settings/{schoolId}
 *
 * หา schoolId โดยไล่ query ทีละโรงเรียนบน students subcollection ปกติ (ไม่ใช้ collectionGroup)
 * เพราะ collectionGroup query บน studentId ต้องมี field override เป็น COLLECTION_GROUP scope
 * ใน firestore.indexes.json ซึ่งยังไม่มี และการเพิ่มแบบไม่ระวังจะไปลบ index เดิมที่หน้าอื่นๆ
 * (AddStudentPage, LineRegisterPage, ฯลฯ) พึ่งพาอยู่สำหรับ query studentId แบบ per-school
 *
 * ถ้า studentId ไปเจอมากกว่า 1 โรงเรียน จะข้าม (ไม่เดา) และรายงานไว้ใน skipped
 */
export const migrateSDQToSchoolSettings = async (options: { dryRun?: boolean } = {}) => {
    const { dryRun = false } = options;
    const skipped: { docId: string; reason: string }[] = [];
    const log: string[] = [];

    console.log("Starting SDQ Migration...");

    try {
        const rootSnap = await getDocs(collection(db, 'sdq-assessments'));
        if (rootSnap.empty) {
            return { success: true, count: 0, skipped, log: ["No root sdq-assessments data found."] };
        }

        const schoolIds = (await getDocs(collection(db, 'school-settings'))).docs.map((d) => d.id);

        const pending: { schoolId: string; sourceDoc: QueryDocumentSnapshot }[] = [];

        for (const sdqDoc of rootSnap.docs) {
            const studentId = sdqDoc.data().studentId;
            if (!studentId) {
                skipped.push({ docId: sdqDoc.id, reason: 'missing studentId' });
                continue;
            }

            const matches: string[] = [];
            for (const schoolId of schoolIds) {
                const q = query(
                    collection(db, 'school-settings', schoolId, 'students'),
                    where('studentId', '==', studentId),
                    limit(1)
                );
                const snap = await getDocs(q);
                if (!snap.empty) matches.push(schoolId);
            }

            if (matches.length === 0) {
                skipped.push({ docId: sdqDoc.id, reason: `studentId ${studentId} not found in any school` });
            } else if (matches.length > 1) {
                skipped.push({ docId: sdqDoc.id, reason: `studentId ${studentId} ambiguous across schools: ${matches.join(', ')}` });
            } else {
                pending.push({ schoolId: matches[0], sourceDoc: sdqDoc });
            }
        }

        log.push(`Resolved ${pending.length}/${rootSnap.size} records, skipped ${skipped.length}.`);

        if (dryRun) {
            return { success: true, count: pending.length, skipped, log, dryRun: true };
        }

        const items = pending.map(({ schoolId, sourceDoc }) => ({
            ref: doc(db, 'school-settings', schoolId, 'sdq-assessments', sourceDoc.id),
            data: { ...sourceDoc.data(), migrated: true },
        }));

        const committed = await commitInChunks(items);
        console.log(`Successfully migrated ${committed} SDQ records.`);

        return { success: true, count: committed, skipped, log };
    } catch (error) {
        console.error("SDQ migration error:", error);
        return { success: false, error, skipped, log };
    }
};

/**
 * ย้ายข้อมูลเกรดจาก root 'grading/{schoolId}/courses/{courseId}/grades/{studentId}'
 * ไปยัง school-settings/{schoolId}/courses/{courseId}/grades/{studentId}
 * (โครงสร้างปัจจุบันที่ GradeBookPage ใช้จริง - src/pages/AcademicDepartment/GradeBookPage/hooks/useGradeBookData.ts)
 *
 * ทำทีละโรงเรียนตาม schoolId ที่ระบุ เพราะข้อมูลเกรดผูกกับโรงเรียนอยู่แล้วในทั้งสองโครงสร้าง
 * จึงไม่มีปัญหาเดาโรงเรียนผิดเหมือนกรณี SDQ
 */
export const migrateGradesToSchoolSettings = async (
    schoolId: string,
    options: { dryRun?: boolean } = {}
) => {
    const { dryRun = false } = options;
    const log: string[] = [];

    console.log(`Starting Grades Migration for school ${schoolId}...`);

    try {
        const coursesSnap = await getDocs(collection(db, 'grading', schoolId, 'courses'));
        const items: { ref: ReturnType<typeof doc>; data: Record<string, any> }[] = [];

        for (const courseDoc of coursesSnap.docs) {
            const gradesSnap = await getDocs(
                collection(db, 'grading', schoolId, 'courses', courseDoc.id, 'grades')
            );
            gradesSnap.docs.forEach((gradeDoc) => {
                items.push({
                    ref: doc(db, 'school-settings', schoolId, 'courses', courseDoc.id, 'grades', gradeDoc.id),
                    data: { ...gradeDoc.data(), migrated: true },
                });
            });
        }

        log.push(`Found ${items.length} grade records across ${coursesSnap.size} courses for school ${schoolId}.`);

        if (dryRun) {
            return { success: true, count: items.length, log, dryRun: true };
        }

        const committed = await commitInChunks(items);
        console.log(`Successfully migrated ${committed} grade records for school ${schoolId}.`);

        return { success: true, count: committed, log };
    } catch (error) {
        console.error("Grades migration error:", error);
        return { success: false, error, log };
    }
};
