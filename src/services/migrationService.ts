import { firestore as db } from '@/firebase';
import {
    collection,
    getDocs,
    doc,
    writeBatch,
    query,
    where,
    collectionGroup
} from 'firebase/firestore';

/**
 * ฟังก์ชันสำหรับย้ายข้อมูล SDQ จาก root collection ไปยัง school-settings/${schoolId}
 * หมายเหตุ: ฟังก์ชันนี้จะทำงานได้สมบูรณ์หากใน document ของ SDQ มีข้อมูลที่ระบุโรงเรียนได้ 
 * หรือต้องทำการค้นหาจากรหัสนักเรียนในทุกโรงเรียน
 */
export const migrateSDQToSchoolSettings = async () => {
    console.log("Starting SDQ Migration...");
    const batch = writeBatch(db);
    let count = 0;

    try {
        // 1. ดึงข้อมูลจาก root 'sdq-assessments' (ถ้ามี)
        const rootRef = collection(db, 'sdq-assessments');
        const rootSnap = await getDocs(rootRef);

        if (rootSnap.empty) {
            console.log("No SDQ data found at root. Checking other patterns...");
            return { success: true, count: 0, message: "No root data found." };
        }

        for (const sdqDoc of rootSnap.docs) {
            const data = sdqDoc.data();
            const studentId = data.studentId;

            // ค้นหา schoolId ของนักเรียนคนนี้จาก collectionGroup students (อาจจะช้าถ้าข้อมูลเยอะ)
            const studentQuery = query(
                collectionGroup(db, 'students'),
                where('studentId', '==', studentId)
            );
            const studentSnap = await getDocs(studentQuery);

            if (!studentSnap.empty) {
                // สมมติว่านักเรียนอยู่โรงเรียนแรกที่เจอ (ปกติควรมีที่เดียว)
                // ดึง schoolId จาก path: school-settings/{schoolId}/students/{docId}
                const pathParts = studentSnap.docs[0].ref.path.split('/');
                const schoolId = pathParts[1]; // index 0: school-settings, index 1: {schoolId}

                if (schoolId) {
                    const newRef = doc(db, 'school-settings', schoolId, 'sdq-assessments', sdqDoc.id);
                    batch.set(newRef, { ...data, migrated: true }, { merge: true });
                    count++;
                }
            }
        }

        if (count > 0) {
            await batch.commit();
            console.log(`Successfully migrated ${count} SDQ records.`);
        }

        return { success: true, count };
    } catch (error) {
        console.error("Migration error:", error);
        return { success: false, error };
    }
};

/**
 * ย้ายข้อมูลเกรดจาก root 'grading' ไปยัง school-settings/${schoolId}
 */
export const migrateGradesToSchoolSettings = async () => {
    console.log("Starting Grades Migration...");
    // โครงสร้างเดิม: grading/{schoolId}/courses/{courseId}/grades/{studentId}
    // โครงสร้างใหม่: school-settings/{schoolId}/courses/{courseId}/grades/${studentId}

    // เนื่องจากการใช้ getDocs กับ root 'grading' อาจจะดึงข้อมูลมหาศาล 
    // ในขั้นต้นเราจะแนะนำให้ทำผ่าน UI โดยระบุ schoolId หรือทำเป็นรายโรงเรียน
};
