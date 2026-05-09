import { firestore as db } from '@/firebase';
import { collection, addDoc, query, where, getDocs, updateDoc, doc, Timestamp, serverTimestamp, getDoc } from 'firebase/firestore';
import { DOMAIN_MAP, REVERSE_ITEMS, CUTOFFS } from '@/data/sdqData';

export interface SDQScore {
    emotional: number;
    conduct: number;
    hyperactivity: number;
    peer: number;
    prosocial: number;
}

export interface SDQAssessment {
    id?: string;
    studentId: string;
    evaluatorType: 'student' | 'teacher' | 'parent';
    evaluatorId?: string;
    academicYear: string;
    term: string;
    answers: Record<number, number>; // Item ID -> Score (0,1,2)
    scores: SDQScore; // Calculated Scores
    totalDifficultyScore: number;
    interpretation: {
        emotional: string;
        conduct: string;
        hyperactivity: string;
        peer: string;
        prosocial: string;
        total: string;
    };
    createdAt?: any;
    updatedAt?: any;
}

export const calculateSDQResult = (
    answers: Record<number, number>,
    evaluatorType: 'student' | 'teacher' | 'parent'
) => {
    const scores: any = { emotional: 0, conduct: 0, hyperactivity: 0, peer: 0, prosocial: 0 };

    // Calculate Domain Scores
    Object.entries(DOMAIN_MAP).forEach(([domain, items]) => {
        let sum = 0;
        items.forEach(itemId => {
            let val = answers[itemId] || 0;
            // Handle Reverse Items
            if (REVERSE_ITEMS.includes(itemId)) {
                if (val === 0) val = 2;
                else if (val === 1) val = 1;
                else if (val === 2) val = 0;
            }
            sum += val;
        });
        scores[domain] = sum;
    });

    const totalDifficultyScore = scores.emotional + scores.conduct + scores.hyperactivity + scores.peer;

    // Interpret
    const cutoff = CUTOFFS[evaluatorType];
    const interpretation: any = {};

    // Standard Domains (Normal < Borderline < Abnormal)
    ['emotional', 'conduct', 'hyperactivity', 'peer'].forEach((d) => {
        const s = scores[d];
        const c = (cutoff as any)[d]; // [NormalMax, BorderlineMax]
        if (s <= c[0]) interpretation[d] = 'ปกติ';
        else if (s <= c[1]) interpretation[d] = 'เสี่ยง';
        else interpretation[d] = 'มีปัญหา';
    });

    // Total
    if (totalDifficultyScore <= cutoff.totalDifficulty[0]) interpretation.total = 'ปกติ';
    else if (totalDifficultyScore <= cutoff.totalDifficulty[1]) interpretation.total = 'เสี่ยง';
    else interpretation.total = 'มีปัญหา';

    // Prosocial (Strength: High is Good) - Logic Reversed
    const pScore = scores.prosocial;
    const pCut = cutoff.prosocial; // [NormalMin, BorderlineMin] -> Actually config is [NormalMax?? No, usually defined as Normal 6-10, Borderline 5, Abnormal 0-4]
    // Let's check config: prosocial: [6, 5] -> >6 is Normal? No wait using ranges usually easiest.
    // Standard DMH: Normal 6-10, Borderline 5, Abnormal 0-4.
    // My Config [6, 5] implies: If score >= 6 Normal. If score == 5 Borderline. If < 5 Abnormal.

    // Let's stick to standard reversed logic:
    // If val < BorderlineThreshold -> Abnormal
    // Let's use the explicit logic here for clarity
    if (pScore >= 6) interpretation.prosocial = 'ปกติ'; // Strengths are normal
    else if (pScore === 5) interpretation.prosocial = 'เสี่ยง'; // Weakness risk
    else interpretation.prosocial = 'มีปัญหา'; // Weakness (Low Prosocial)

    return { scores: scores as SDQScore, totalDifficultyScore, interpretation };
};

export const saveSDQAssessment = async (schoolId: string, assessment: Omit<SDQAssessment, 'id' | 'createdAt' | 'updatedAt' | 'scores' | 'totalDifficultyScore' | 'interpretation'>) => {
    try {
        // Calculate before save
        const results = calculateSDQResult(assessment.answers, assessment.evaluatorType);

        const data = {
            ...assessment,
            ...results,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
        };

        // Check if exists to update instead of add (Optional but good practice)
        const q = query(
            collection(db, 'school-settings', schoolId, 'sdq-assessments'),
            where('studentId', '==', assessment.studentId),
            where('evaluatorType', '==', assessment.evaluatorType),
            where('academicYear', '==', assessment.academicYear)
        );
        const snap = await getDocs(q);

        if (!snap.empty) {
            // Update existing
            const docId = snap.docs[0].id;
            const docRef = doc(db, 'school-settings', schoolId, 'sdq-assessments', docId);
            await updateDoc(docRef, { ...results, updatedAt: serverTimestamp() });
        } else {
            // Create new
            const colRef = collection(db, 'school-settings', schoolId, 'sdq-assessments');
            await addDoc(colRef, data);
        }
        return true;
    } catch (error) {
        console.error("Error saving SDQ assessment:", error);
        throw error;
    }
};

export const getSDQAssessments = async (schoolId: string, studentId: string, academicYear: string) => {
    try {
        const q = query(
            collection(db, 'school-settings', schoolId, 'sdq-assessments'),
            where('studentId', '==', studentId),
            where('academicYear', '==', academicYear)
        );
        const snap = await getDocs(q);
        return snap.docs.map(d => ({ id: d.id, ...d.data() } as SDQAssessment));
    } catch (error) {
        console.error("Error fetching SDQ assessments:", error);
        return [];
    }
};

// Map SDQ result to Characteristics (0-3 scale)
// Char 2: Honest (Conduct), Char 3: Discipline (Hyper), Char 8: Public Mind (Prosocial)
export const mapSDQToCharacteristics = (assessment: SDQAssessment): Record<number, number> => {
    const { scores, interpretation } = assessment;
    const mapped: Record<number, number> = {};

    // Helper: text to score
    const mapStatusToScore = (status: string, isReverse = false) => {
        // SDQ: ปกติ(Normal), เสี่ยง(Borderline), มีปัญหา(Abnormal)
        // Gradebook: 3(Good), 2(Fair), 1(Pass), 0(Fail)
        if (isReverse) {
            // For Prosocial: Normal=Good(3), Risk=Fair(2), Problem=Fail(1)
            if (status === 'ปกติ') return 3;
            if (status === 'เสี่ยง') return 2;
            return 1;
        } else {
            // For Problems: Normal=Good(3), Risk=Fair(2), Problem=Fail(1)
            // Actually same logic: "Normal" means "Good" state for the child.
            // "Problem" means "Bad" state.
            if (status === 'ปกติ') return 3;
            if (status === 'เสี่ยง') return 2;
            return 1;
        }
    };

    // 2. ซื่อสัตย์สุจริต -> Conduct
    if (interpretation?.conduct) mapped[2] = mapStatusToScore(interpretation.conduct); // ID 2

    // 3. มีวินัย -> Hyperactivity
    if (interpretation?.hyperactivity) mapped[3] = mapStatusToScore(interpretation.hyperactivity); // ID 3

    // 8. มีจิตสาธารณะ -> Prosocial
    if (interpretation?.prosocial) mapped[8] = mapStatusToScore(interpretation.prosocial, true); // ID 8

    return mapped;
};

// Bulk fetch latest SDQ for a list of student IDs
export const getLatestSDQForStudents = async (schoolId: string, studentIds: string[], academicYear: string) => {
    // Note: Firestore 'in' query limited to 10. Better to fetch broadly or individually if list is long.
    // Given school size assumptions, fetching all for year might be cheaper than 50 individual calls.
    // Or fetch by class if collection structure allowed. 
    // Since we store in 'sdq-assessments' as flat list, query by year + studentId is best.
    // Optimization: Query all SDQ for this school/year, then filter in memory (if < 1000 docs).
    try {
        const q = query(
            collection(db, 'school-settings', schoolId, 'sdq-assessments'),
            where('academicYear', '==', academicYear)
        );
        const snap = await getDocs(q);
        const map: Record<string, SDQAssessment> = {};

        const PRIORITY = { 'teacher': 3, 'parent': 2, 'student': 1 };

        snap.docs.forEach(doc => {
            const data = doc.data() as SDQAssessment;
            const current = map[data.studentId];

            const newPriority = PRIORITY[data.evaluatorType] || 0;
            const currentPriority = current ? (PRIORITY[current.evaluatorType] || 0) : 0;

            if (newPriority > currentPriority) {
                map[data.studentId] = { id: doc.id, ...data };
            } else if (newPriority === currentPriority) {
                // If same priority (e.g. multiple parent records), take the latest one?
                // Current query doesn't sort by createdAt. Let's assume arbitrary or add sort if needed.
                // Ideally we prefer latest.
                const newTime = data.createdAt?.seconds || 0;
                const curTime = current?.createdAt?.seconds || 0;
                if (newTime > curTime) {
                    map[data.studentId] = { id: doc.id, ...data };
                }
            }
        });
        return map; // Returns Record<studentId, BestAssessment>
    } catch (error) {
        console.error("Error fetching bulk SDQ:", error);
        return {};
    }
};

// Placeholder for syncing
export const syncSDQToGradebook = async (schoolId: string, studentId: string, assessmentId: string) => {
    console.log("Syncing SDQ to Gradebook...");
    // Implementation depends on Gradebook schema
};

// Helper to expand level range (e.g., "ป.1-ป.6")
export const getSchoolLevels = async (schoolId: string): Promise<string[]> => {
    try {
        const docRef = doc(db, 'school-settings', schoolId);
        const docSnap = await getDoc(docRef);

        if (docSnap.exists()) {
            const data = docSnap.data();
            const levelRange = data.opportunityExpansionLevel || '';
            const schoolType = data.schoolType || '';

            // Default lists
            const prathom = ['ป.1', 'ป.2', 'ป.3', 'ป.4', 'ป.5', 'ป.6'];
            const mattayom = ['ม.1', 'ม.2', 'ม.3', 'ม.4', 'ม.5', 'ม.6'];
            const anuban = ['อ.1', 'อ.2', 'อ.3']; // Often implicit

            if (schoolType === 'ประถม') {
                return [...anuban, ...prathom];
            } else if (schoolType === 'มัธยมศึกษา') {
                return mattayom;
            } else if (schoolType === 'ขยายโอกาส') {
                // Check range
                if (levelRange === 'ป.1-ม.6') return [...anuban, ...prathom, ...mattayom];
                if (levelRange === 'ป.1-ม.3') return [...anuban, ...prathom, ...mattayom.slice(0, 3)];
                // Default fallback for expansion
                return [...anuban, ...prathom, ...mattayom.slice(0, 3)];
            }

            // Fallback if no specific type set but has range string logic?
            // For now return full set if unknown to be safe, or empty?
            // Let's return standard full set to avoid empty dropdowns if config missing
            return [...anuban, ...prathom, ...mattayom];
        }
        return ['อ.1', 'อ.2', 'อ.3', 'ป.1', 'ป.2', 'ป.3', 'ป.4', 'ป.5', 'ป.6', 'ม.1', 'ม.2', 'ม.3', 'ม.4', 'ม.5', 'ม.6'];
    } catch (error) {
        console.error("Error fetching school levels:", error);
        return ['อ.1', 'อ.2', 'อ.3', 'ป.1', 'ป.2', 'ป.3', 'ป.4', 'ป.5', 'ป.6', 'ม.1', 'ม.2', 'ม.3', 'ม.4', 'ม.5', 'ม.6'];
    }
};
