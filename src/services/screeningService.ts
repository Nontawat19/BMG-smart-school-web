import { firestore as db } from '@/firebase';
import { collection, doc, setDoc, getDoc, getDocs, query, where, Timestamp } from 'firebase/firestore';

export interface ScreeningAssessment {
    id?: string;
    studentId: string;
    evaluatorType: 'teacher' | 'student' | 'parent'; // Standard SDQ pattern
    academicYear: string;
    term: string;

    // 1. ด้านความสามารถ (การเรียน)
    academic: {
        readWrite: string; // 'good' | 'fair' | 'poor'
        talents: string;
        other: string;
        status: 'normal' | 'risk' | 'problem';
    };

    // 2. ด้านสุขภาพ
    health: {
        weight: number;
        height: number;
        bmi: number;
        congenitalDisease: string; // โรคประจำตัว
        disabilities: string;      // ความพิการ
        mentalHealth: string;      // Based on SDQ or observation
        status: 'normal' | 'risk' | 'problem';
    };

    // 3. ด้านครอบครัว
    family: {
        parentsStatus: string; // 'together' | 'separated' | 'divorced' | 'deceased'
        economy: string;       // 'sufficient' | 'poor' | 'debt'
        security: string;      // ความปลอดภัย
        relationship: string;  // ความสัมพันธ์
        status: 'normal' | 'risk' | 'problem';
    };

    // 4. ด้านอื่นๆ
    other: {
        behavior: string;  // พฤติกรรมเสี่ยง
        sexual: string;    // พฤติกรรมทางเพศ
        drugs: string;     // สารเสพติด
        games: string;     // ติดเกม
        status: 'normal' | 'risk' | 'problem';
    };

    summary: 'normal' | 'risk' | 'problem';
    assessedAt: any;
    assessedBy: string; // Name/ID of evaluator
}

// Save Assessment
export const saveScreeningAssessment = async (schoolId: string, assessment: Omit<ScreeningAssessment, 'id' | 'assessedAt'>) => {
    try {
        const assessmentsRef = collection(db, 'school-settings', schoolId, 'screening_assessments');
        // Unique ID: studentId_year_term_evaluatorType
        const docId = `${assessment.studentId}_${assessment.academicYear}_${assessment.term}_${assessment.evaluatorType}`;
        const docRef = doc(assessmentsRef, docId);

        await setDoc(docRef, {
            ...assessment,
            assessedAt: Timestamp.now()
        }, { merge: true });

        console.log("Screening assessment saved:", docId);
        return docId;
    } catch (error) {
        console.error("Error saving screening assessment:", error);
        throw error;
    }
};

// Get Assessment (Single)
export const getScreeningAssessment = async (schoolId: string, studentId: string, year: string, type: string) => {
    try {
        const docRef = doc(db, 'school-settings', schoolId, 'screening_assessments', `${studentId}_${year}_1_${type}`); // Default term 1 for now
        const snap = await getDoc(docRef);
        if (snap.exists()) {
            return { id: snap.id, ...snap.data() } as ScreeningAssessment;
        }
        return null;
    } catch (error) {
        console.error("Error fetching screening assessment:", error);
        return null;
    }
};

// Get All Assessments For Student (History)
export const getAllScreeningAssessments = async (schoolId: string, studentId: string) => {
    try {
        const assessmentsRef = collection(db, 'school-settings', schoolId, 'screening_assessments');
        const q = query(assessmentsRef, where('studentId', '==', studentId)); // Simple query
        const snap = await getDocs(q);
        return snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as ScreeningAssessment));
    } catch (error) {
        console.error("Error fetching all screening assessments:", error);
        return [];
    }
};
