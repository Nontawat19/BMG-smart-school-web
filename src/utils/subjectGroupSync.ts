import { firestore as db } from '@/firebase';
import { collection, getDocs, query, where, writeBatch, doc } from 'firebase/firestore';

/**
 * ทำหน้าที่ Sync ข้อมูลหัวหน้ากลุ่มสาระระหว่าง teachers collection กับ subject_groups collection
 * เรียกใช้เมื่อ:
 * 1. เพิ่มครูใหม่ที่มี isHeadOfLearningArea = true (AddTeacherPage)
 * 2. แก้ไขข้อมูลครูแล้วเปลี่ยน isHeadOfLearningArea (EditTeacherPage)
 * 3. แต่งตั้งหัวหน้ากลุ่มสาระจากหน้าจัดการกลุ่มสาระ (SubjectGroupManagementPage)
 * 
 * ข้อมูลจะ sync ไปยัง subject_groups collection: headId, headName
 */
export async function syncHeadOfLearningArea(
    schoolId: string,
    teacherDocId: string,
    teacherFullName: string,
    learningArea: string,
    isHead: boolean
): Promise<void> {
    if (!schoolId || !learningArea) return;

    try {
        const batch = writeBatch(db);
        const sgRef = collection(db, 'school-settings', schoolId, 'subject_groups');
        const sgSnap = await getDocs(sgRef);

        // Find the matching subject group
        const matchedDoc = sgSnap.docs.find(d => {
            const data = d.data();
            const groupName = (data.name || '').trim();
            return groupName === learningArea.trim() ||
                groupName.toLowerCase() === learningArea.trim().toLowerCase();
        });

        if (matchedDoc) {
            if (isHead) {
                // Setting as new head: update subject_groups with new head info
                // First, check if there was a previous head and clear their teacher profile
                const prevData = matchedDoc.data();
<<<<<<< HEAD
                const previousHeadId = prevData.headId || prevData.headTeacherId;
                if (previousHeadId && previousHeadId !== teacherDocId) {
                    try {
                        const prevTeacherRef = doc(db, 'school-settings', schoolId, 'teachers', previousHeadId);
=======
                if (prevData.headId && prevData.headId !== teacherDocId) {
                    try {
                        const prevTeacherRef = doc(db, 'school-settings', schoolId, 'teachers', prevData.headId);
>>>>>>> 5f8c7e1 (feat: optimize auto-scheduler and update UI labels)
                        batch.update(prevTeacherRef, {
                            isHeadOfLearningArea: false
                        });
                    } catch (e) {
                        console.warn('Could not clear previous head:', e);
                    }
                }

                // Update the subject_group document
                batch.update(doc(db, 'school-settings', schoolId, 'subject_groups', matchedDoc.id), {
                    headId: teacherDocId,
<<<<<<< HEAD
                    headName: teacherFullName,
                    headTeacherId: teacherDocId,
                    headTeacherName: teacherFullName
=======
                    headName: teacherFullName
>>>>>>> 5f8c7e1 (feat: optimize auto-scheduler and update UI labels)
                });
            } else {
                // Removing as head: clear the subject_groups headId/headName only if this teacher IS the current head
                const currentData = matchedDoc.data();
<<<<<<< HEAD
                const currentHeadId = currentData.headId || currentData.headTeacherId;
                if (currentHeadId === teacherDocId) {
                    batch.update(doc(db, 'school-settings', schoolId, 'subject_groups', matchedDoc.id), {
                        headId: '',
                        headName: '',
                        headTeacherId: '',
                        headTeacherName: ''
=======
                if (currentData.headId === teacherDocId) {
                    batch.update(doc(db, 'school-settings', schoolId, 'subject_groups', matchedDoc.id), {
                        headId: '',
                        headName: ''
>>>>>>> 5f8c7e1 (feat: optimize auto-scheduler and update UI labels)
                    });
                }
            }
        }

        await batch.commit();
    } catch (error) {
        console.error('Error syncing head of learning area to subject_groups:', error);
    }
}
