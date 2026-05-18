import { doc, getDoc } from 'firebase/firestore';
<<<<<<< HEAD
import { getCurrentThaiYear } from './dateUtils';
=======
>>>>>>> 5f8c7e1 (feat: optimize auto-scheduler and update UI labels)

interface Term {
    startDate: string | null;
    endDate: string | null;
}

interface AcademicYearData {
    academicYear: string;
    currentTerm: '1' | '2' | null;
    terms: {
        term1: Term;
        term2: Term;
    };
}

/**
 * ดึงข้อมูลปีการศึกษาและภาคเรียนปัจจุบันจาก SchoolCalendarPage
 */
export const getCurrentAcademicYear = async (
    firestore: any,
    schoolId: string
): Promise<AcademicYearData> => {
    try {
        const docRef = doc(firestore, 'school-settings', schoolId, 'main_calendar', 'default');
        const docSnap = await getDoc(docRef);

        if (!docSnap.exists()) {
            console.warn('No academic year data found, using fallback');
            return {
<<<<<<< HEAD
                academicYear: String(getCurrentThaiYear()),
=======
                academicYear: String(new Date().getFullYear() + 543),
>>>>>>> 5f8c7e1 (feat: optimize auto-scheduler and update UI labels)
                currentTerm: null,
                terms: {
                    term1: { startDate: null, endDate: null },
                    term2: { startDate: null, endDate: null }
                }
            };
        }

        const data = docSnap.data();
<<<<<<< HEAD
        const academicYear = data.academicYear || String(getCurrentThaiYear());
=======
        const academicYear = data.academicYear || String(new Date().getFullYear() + 543);
>>>>>>> 5f8c7e1 (feat: optimize auto-scheduler and update UI labels)
        const terms = data.terms || {
            term1: { startDate: null, endDate: null },
            term2: { startDate: null, endDate: null }
        };

        // คำนวณว่าตอนนี้อยู่ภาคเรียนไหน
        const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
        let currentTerm: '1' | '2' | null = null;

        if (terms.term1?.startDate && terms.term1?.endDate) {
            if (today >= terms.term1.startDate && today <= terms.term1.endDate) {
                currentTerm = '1';
            }
        }

        if (terms.term2?.startDate && terms.term2?.endDate) {
            if (today >= terms.term2.startDate && today <= terms.term2.endDate) {
                currentTerm = '2';
            }
        }

        return {
            academicYear,
            currentTerm,
            terms
        };
    } catch (error) {
        console.error('Error fetching academic year:', error);
        return {
<<<<<<< HEAD
            academicYear: String(getCurrentThaiYear()),
=======
            academicYear: String(new Date().getFullYear() + 543),
>>>>>>> 5f8c7e1 (feat: optimize auto-scheduler and update UI labels)
            currentTerm: null,
            terms: {
                term1: { startDate: null, endDate: null },
                term2: { startDate: null, endDate: null }
            }
        };
    }
};

/**
 * สร้าง Semester Key สำหรับ Firestore (format: {academicYear}-{term})
 */
export const getSemesterKey = (academicYear: string, term: '1' | '2'): string => {
    return `${academicYear}-${term}`;
};
