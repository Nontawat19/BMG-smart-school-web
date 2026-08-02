import { useState, useCallback } from 'react';
import Swal from 'sweetalert2';
import { doc, writeBatch, Timestamp, collection, getDocs, deleteField } from 'firebase/firestore';
import { firestore as db } from '@/firebase';
import { GradeRecord, CharacteristicCriteria, ReadingWritingCriteria, Student, Course } from '../types';
import { CLASSES } from '@/utils/schoolUtils';
import { mapSDQToCharacteristics } from '@/services/sdqService';
import { getSDQCharacteristicType } from '../sdqCriteria';

export const useGradeBookActions = (
    schoolId: string | undefined,
    selectedCourse: string,
    selectedClass: string,
    activeTab: 'grades' | 'characteristics' | 'readingWriting',
    grades: Record<string, GradeRecord>,
    setGrades: React.Dispatch<React.SetStateAction<Record<string, GradeRecord>>>,
    students: Student[],
    characteristicsCriteria: CharacteristicCriteria[],
    readingWritingCriteria: ReadingWritingCriteria[],
    maxScores: { formative: number; midterm: number; final: number },
    currentCourse: Course | undefined,
    courses: Course[],
    sdqMap: Record<string, any>
) => {
    const [isSaving, setIsSaving] = useState(false);
    const [loading, setLoading] = useState(false); // Can be managed externally too
    const [modifiedStudentIds, setModifiedStudentIds] = useState<Set<string>>(new Set());

    const calculateGrade = (total: number): string => {
        if (total >= 80) return '4';
        if (total >= 75) return '3.5';
        if (total >= 70) return '3';
        if (total >= 65) return '2.5';
        if (total >= 60) return '2';
        if (total >= 55) return '1.5';
        if (total >= 50) return '1';
        return '0';
    };

    const getAssessmentKey = (assessment: { id?: string; name?: string }) => assessment.id || assessment.name || '';

    const applySDQToCriteria = (
        prevGrades: Record<string, GradeRecord>,
        criteriaList: CharacteristicCriteria[],
        studentsList: Student[],
        sdqSource: Record<string, any>
    ) => {
        const newGrades = { ...prevGrades };
        const updatedStudentIds = new Set<string>();

        studentsList.forEach(student => {
            const sdq = sdqSource[student.id];
            if (!sdq) return;
            const mapped = mapSDQToCharacteristics(sdq);

            criteriaList.forEach(criteriaObj => {
                const type = getSDQCharacteristicType(criteriaObj.id, criteriaObj.title);
                const sdqValue = type ? mapped[type] : undefined;
                if (sdqValue === undefined) return;

                const current = newGrades[student.id] || { formative: 0, midterm: 0, final: 0, total: 0, grade: '0', characteristicsScores: {} };
                const scores = { ...(current.characteristicsScores || {}) };
                (criteriaObj.indicators || []).forEach((_, idx) => {
                    scores[`${criteriaObj.id}_${idx}`] = sdqValue;
                });
                newGrades[student.id] = { ...current, characteristicsScores: scores };
                updatedStudentIds.add(student.id);
            });
        });

        return { newGrades, updatedStudentIds };
    };

    const distributeFormativeScore = (score: number, existingDetails: Record<string, number> = {}) => {
        const assessments = currentCourse?.formativeAssessments?.filter(a => (a.maxScore || 0) > 0) || [];
        if (assessments.length === 0) return existingDetails;

        const nextDetails: Record<string, number> = { ...existingDetails };
        assessments.forEach(a => {
            nextDetails[getAssessmentKey(a)] = 0;
        });

        let remaining = Math.min(Math.max(0, score), assessments.reduce((sum, a) => sum + (a.maxScore || 0), 0));

        while (remaining > 0) {
            const available = assessments.filter(a => (nextDetails[getAssessmentKey(a)] || 0) < (a.maxScore || 0));
            if (available.length === 0) break;

            const amountPerSlot = Math.floor(remaining / available.length);
            if (amountPerSlot === 0) {
                for (let i = 0; i < remaining && i < available.length; i++) {
                    const assessment = available[i];
                    if (!assessment) continue;
                    const key = getAssessmentKey(assessment);
                    nextDetails[key] = (nextDetails[key] || 0) + 1;
                }
                remaining = 0;
            } else {
                let assigned = 0;
                available.forEach(a => {
                    const key = getAssessmentKey(a);
                    const capacity = (a.maxScore || 0) - (nextDetails[key] || 0);
                    const amount = Math.min(amountPerSlot, capacity);
                    nextDetails[key] = (nextDetails[key] || 0) + amount;
                    assigned += amount;
                });
                if (assigned === 0) break;
                remaining -= assigned;
            }
        }

        return nextDetails;
    };

    const handleScoreChange = useCallback((studentId: string, field: string, value: string, criteriaId?: string) => {
        let numValue = field === 'status' ? 0 : (parseFloat(value) || 0);

        // Validation logic
        if (field === 'formative') numValue = Math.min(Math.max(0, numValue), maxScores.formative);
        else if (field === 'midterm') numValue = Math.min(Math.max(0, numValue), maxScores.midterm);
        else if (field === 'final') numValue = Math.min(Math.max(0, numValue), maxScores.final);
        else if (['characteristics', 'readingWriting'].includes(field)) numValue = Math.min(Math.max(0, numValue), 3);

        setGrades(prev => {
            const current = prev[studentId] || { formative: 0, midterm: 0, final: 0, total: 0, grade: '0' };
            let updated = { ...current };

            if (field === 'characteristics' && criteriaId) {
                updated.characteristicsScores = { ...(current.characteristicsScores || {}), [criteriaId]: numValue };
            } else if (field === 'readingWriting' && criteriaId) {
                updated.readingWritingScores = { ...(current.readingWritingScores || {}), [criteriaId]: numValue };
            } else if (field === 'status') {
                updated.status = value || undefined;
            } else if (field === 'formative') {
                updated.formative = numValue;
                updated.formativeDetails = distributeFormativeScore(numValue, current.formativeDetails || {});
            } else {
                (updated as any)[field] = numValue;
            }

            if (['formative', 'midterm', 'final', 'status'].includes(field)) {
                updated.total = (updated.formative || 0) + (updated.midterm || 0) + (updated.final || 0);
                updated.grade = updated.status || calculateGrade(updated.total);
            }
            setModifiedStudentIds(prev => new Set(prev).add(studentId));
            return { ...prev, [studentId]: updated };
        });
    }, [maxScores, setGrades, currentCourse]);

    const handleBulkFill = useCallback((value: number) => {
        setGrades(prev => {
            const newGrades = { ...prev };
            students.forEach(student => {
                const current = newGrades[student.id] || { formative: 0, midterm: 0, final: 0, total: 0, grade: '0' };
                let updated = { ...current };

                if (activeTab === 'characteristics') {
                    const scores = { ...(updated.characteristicsScores || {}) };
                    characteristicsCriteria.forEach(c => (c.indicators || []).forEach((_, i) => scores[`${c.id}_${i}`] = value));
                    updated.characteristicsScores = scores;
                } else if (activeTab === 'readingWriting') {
                    const scores = { ...(updated.readingWritingScores || {}) };
                    readingWritingCriteria.forEach(c => (c.indicators || []).forEach((_, i) => scores[`${c.id}_${i}`] = value));
                    updated.readingWritingScores = scores;
                }
                newGrades[student.id] = updated;
            });
            setModifiedStudentIds(prev => {
                const updated = new Set(prev);
                students.forEach(s => updated.add(s.id));
                return updated;
            });
            return newGrades;
        });
        Swal.fire({ icon: 'success', title: `เติมคะแนน ${value} ให้ทุกคนแล้ว`, timer: 1000, showConfirmButton: false, position: 'top-end', toast: true });
    }, [activeTab, students, characteristicsCriteria, readingWritingCriteria, setGrades]);

    const handleBulkFillColumn = useCallback((value: string, key: string, isCharOrRW: boolean = false, criteriaId?: string) => {
        let numValue = (parseInt(value) || 0);

        if (isCharOrRW) numValue = Math.min(Math.max(0, numValue), 3);
        else if (key === 'formative') numValue = Math.min(Math.max(0, numValue), maxScores.formative);
        else if (key === 'midterm') numValue = Math.min(Math.max(0, numValue), maxScores.midterm);
        else if (key === 'final') numValue = Math.min(Math.max(0, numValue), maxScores.final);

        if (value === '') return;

        setGrades(prev => {
            const newGrades = { ...prev };
            students.forEach(student => {
                const current = newGrades[student.id] || { formative: 0, midterm: 0, final: 0, total: 0, grade: '0' };
                let updated = { ...current };

                if (isCharOrRW && criteriaId) {
                    const field = activeTab === 'characteristics' ? 'characteristicsScores' : 'readingWritingScores';
                    updated[field] = { ...(current[field] || {}), [criteriaId]: numValue };
                } else if (key === 'formative') {
                    updated.formative = numValue;
                    updated.formativeDetails = distributeFormativeScore(numValue, current.formativeDetails || {});
                } else {
                    (updated as any)[key] = numValue;
                }

                if (['formative', 'midterm', 'final'].includes(key)) {
                    updated.total = (updated.formative || 0) + (updated.midterm || 0) + (updated.final || 0);
                    updated.grade = calculateGrade(updated.total);
                }

                newGrades[student.id] = updated;
            });
            setModifiedStudentIds(prev => {
                const updated = new Set(prev);
                students.forEach(s => updated.add(s.id));
                return updated;
            });
            return newGrades;
        });
    }, [activeTab, maxScores, students, setGrades, currentCourse]);

    const handleSyncSDQColumn = useCallback(async (criteriaTitle: string, criteriaId: string) => {
        if (!selectedClass || !selectedCourse) return;

        if (Object.keys(sdqMap).length === 0) {
            await Swal.fire({ icon: 'warning', title: 'ไม่พบข้อมูล SDQ', text: 'กรุณารอสักครู่ระบบกำลังดึงข้อมูล หรือไม่มีข้อมูล SDQ สำหรับนักเรียนกลุ่มนี้' });
            return;
        }

        const criteriaObj = characteristicsCriteria.find(c => c.id === criteriaId);
        if (!criteriaObj) return;

        const result = await Swal.fire({
            title: `Sync ${criteriaTitle}?`,
            text: "คะแนนในคอลัมน์นี้จะถูกแทนที่ด้วยผลประเมินจาก SDQ",
            icon: 'question',
            showCancelButton: true,
            confirmButtonText: 'Sync เลย',
            cancelButtonText: 'ยกเลิก'
        });

        if (!result.isConfirmed) return;

        let updateCount = 0;
        setGrades(prev => {
            const { newGrades, updatedStudentIds } = applySDQToCriteria(prev, [criteriaObj], students, sdqMap);
            updateCount = updatedStudentIds.size;
            setModifiedStudentIds(prevIds => new Set([...prevIds, ...updatedStudentIds]));
            return newGrades;
        });
        Swal.fire({ icon: 'success', title: `อัปเดตข้อมูลแล้ว ${updateCount} คน`, toast: true, position: 'top-end', showConfirmButton: false, timer: 1500 });
    }, [sdqMap, selectedClass, selectedCourse, students, characteristicsCriteria, setGrades]);

    const handleSyncSDQAll = useCallback(async () => {
        if (!selectedClass || !selectedCourse) return;

        if (Object.keys(sdqMap).length === 0) {
            await Swal.fire({ icon: 'warning', title: 'ไม่พบข้อมูล SDQ', text: 'กรุณารอสักครู่ระบบกำลังดึงข้อมูล หรือไม่มีข้อมูล SDQ สำหรับนักเรียนกลุ่มนี้' });
            return;
        }

        const sdqCriteria = characteristicsCriteria.filter(c => getSDQCharacteristicType(c.id, c.title) !== undefined);
        if (sdqCriteria.length === 0) {
            await Swal.fire({ icon: 'info', title: 'ไม่มีคอลัมน์ที่เชื่อมกับ SDQ', text: 'ไม่พบคุณลักษณะที่เชื่อมกับผลประเมิน SDQ (ซื่อสัตย์สุจริต / มีวินัย / มีจิตสาธารณะ)' });
            return;
        }

        const result = await Swal.fire({
            title: 'นำคะแนนจาก SDQ มาใส่ทั้งหมด?',
            text: `คะแนนคุณลักษณะฯ ${sdqCriteria.length} หัวข้อ (${sdqCriteria.map(c => c.title).join(', ')}) จะถูกแทนที่ด้วยผลประเมินจาก SDQ`,
            icon: 'question',
            showCancelButton: true,
            confirmButtonText: 'Sync เลย',
            cancelButtonText: 'ยกเลิก'
        });

        if (!result.isConfirmed) return;

        let updateCount = 0;
        setGrades(prev => {
            const { newGrades, updatedStudentIds } = applySDQToCriteria(prev, sdqCriteria, students, sdqMap);
            updateCount = updatedStudentIds.size;
            setModifiedStudentIds(prevIds => new Set([...prevIds, ...updatedStudentIds]));
            return newGrades;
        });
        Swal.fire({ icon: 'success', title: `อัปเดตข้อมูลแล้ว ${updateCount} คน`, toast: true, position: 'top-end', showConfirmButton: false, timer: 1500 });
    }, [sdqMap, selectedClass, selectedCourse, students, characteristicsCriteria, setGrades]);

    const handleClearScores = useCallback(() => {
        Swal.fire({
            title: 'ยืนยันการล้างคะแนน',
            text: `คุณต้องการล้างคะแนนทั้งหมดในแท็บ ${activeTab === 'characteristics' ? 'คุณลักษณะฯ' : 'อ่าน/คิด/เขียน'} ใช่หรือไม่?`,
            icon: 'warning',
            showCancelButton: true,
            confirmButtonColor: '#d33',
            confirmButtonText: 'ล้างคะแนน',
            cancelButtonText: 'ยกเลิก',
            background: document.documentElement.classList.contains('dark') ? '#2a2b2f' : '#ffffff',
            color: document.documentElement.classList.contains('dark') ? '#ffffff' : '#1f2937'
        }).then((result) => {
            if (result.isConfirmed) {
                setGrades(prev => {
                    const newGrades = { ...prev };
                    students.forEach(student => {
                        const current = newGrades[student.id] || { formative: 0, midterm: 0, final: 0, total: 0, grade: '0' };
                        let updated = { ...current };
                        if (activeTab === 'characteristics') updated.characteristicsScores = {};
                        else if (activeTab === 'readingWriting') updated.readingWritingScores = {};
                        newGrades[student.id] = updated;
                    });
                    setModifiedStudentIds(prev => {
                        const updated = new Set(prev);
                        students.forEach(s => updated.add(s.id));
                        return updated;
                    });
                    return newGrades;
                });
                Swal.fire({ icon: 'success', title: 'ล้างคะแนนเรียบร้อยแล้ว', timer: 1000, showConfirmButton: false, position: 'top-end', toast: true });
            }
        });
    }, [activeTab, students, setGrades]);

    const handleSave = useCallback(async () => {
        if (!selectedCourse || !schoolId) return;

        if (modifiedStudentIds.size === 0) {
            Swal.fire({
                icon: 'info',
                title: 'ไม่มีข้อมูลเปลี่ยนแปลง',
                text: 'คุณยังไม่ได้แก้ไขคะแนนของนักเรียนคนใดเลย',
                timer: 2000,
                showConfirmButton: false,
                toast: true,
                position: 'top-end'
            });
            return;
        }

        setIsSaving(true);
        const currentModifiedIds = Array.from(modifiedStudentIds);

        try {
            const batch = writeBatch(db);
            currentModifiedIds.forEach((studentId) => {
                const record = grades[studentId];
                if (!record) return;

                const ref = doc(db, 'school-settings', schoolId, 'courses', selectedCourse, 'grades', studentId);

                // Sanitize score data
                const sanitizedRecord = {
                    ...record,
                    formative: Number(record.formative || 0),
                    midterm: Number(record.midterm || 0),
                    final: Number(record.final || 0),
                    total: Number(record.total || 0),
                    updatedAt: Timestamp.now()
                };

                const dataToSave: any = { ...sanitizedRecord };
                Object.keys(dataToSave).forEach(key => {
                    if (dataToSave[key] === undefined || (typeof dataToSave[key] === 'number' && isNaN(dataToSave[key]))) {
                        delete dataToSave[key];
                    }
                });
                if (!record.status) {
                    dataToSave.status = deleteField();
                    dataToSave.grade = calculateGrade(Number(record.total || 0));
                }

                batch.set(ref, dataToSave, { merge: true });
            });

            await batch.commit();

            // Clear modified IDs after successful save
            setModifiedStudentIds(prev => {
                const updated = new Set(prev);
                currentModifiedIds.forEach(id => updated.delete(id));
                return updated;
            });

            Swal.fire({
                icon: 'success',
                title: 'บันทึกข้อมูลเรียบร้อยแล้ว',
                text: `อัปเดตข้อมูลนักเรียน ${currentModifiedIds.length} คน สำเร็จ`,
                timer: 2000,
                showConfirmButton: false,
                position: 'center'
            });
        } catch (error) {
            console.error("Error saving grades:", error);
            Swal.fire('เกิดข้อผิดพลาด', 'ไม่สามารถบันทึกข้อมูลได้', 'error');
        } finally {
            setIsSaving(false);
        }
    }, [grades, schoolId, selectedCourse, modifiedStudentIds]);

    const handleImportFromOtherCourse = useCallback(async () => {
        if (!selectedClass || !selectedCourse || !schoolId) return;

        const otherCourses = courses.filter(c => {
            const classIds = Array.isArray(c.classId) ? c.classId : [c.classId];
            return classIds.includes(selectedClass) && c.id !== selectedCourse;
        });

        if (otherCourses.length === 0) {
            Swal.fire({
                icon: 'info',
                title: 'ไม่พบวิชาอื่น',
                text: 'ไม่พบวิชาอื่นในชั้นเรียนนี้ที่สามารถนำเข้าคะแนนมาได้',
                background: document.documentElement.classList.contains('dark') ? '#2a2b2f' : '#ffffff',
                color: document.documentElement.classList.contains('dark') ? '#ffffff' : '#1f2937'
            });
            return;
        }

        const { value: sourceCourseId } = await Swal.fire({
            title: 'นำเข้าคะแนนจากวิชาอื่น',
            text: `เลือกวิชาต้นทางในชั้น ${CLASSES[selectedClass]} เพื่อนำเข้าคะแนน${activeTab === 'characteristics' ? 'คุณลักษณะฯ' : 'อ่าน/คิด/เขียน'} มายังวิชานี้`,
            input: 'select',
            inputOptions: Object.fromEntries(otherCourses.map(c => [c.id, `${c.code} ${c.title}`])),
            inputPlaceholder: '-- เลือกวิชาต้นทาง --',
            showCancelButton: true,
            confirmButtonText: 'นำเข้าข้อมูล',
            cancelButtonText: 'ยกเลิก',
            background: document.documentElement.classList.contains('dark') ? '#2a2b2f' : '#ffffff',
            color: document.documentElement.classList.contains('dark') ? '#ffffff' : '#1f2937',
            inputValidator: (value) => {
                if (!value) return 'กรุณาเลือกวิชาต้นทาง';
            }
        });

        if (sourceCourseId) {
            setLoading(true);
            try {
                const sourceGradesRef = collection(db, 'school-settings', schoolId, 'courses', sourceCourseId, 'grades');
                const snap = await getDocs(sourceGradesRef);

                if (snap.empty) {
                    Swal.fire({
                        icon: 'warning',
                        title: 'ไม่พบข้อมูล',
                        text: 'วิชาที่เลือกยังไม่มีการบันทึกคะแนน',
                        background: document.documentElement.classList.contains('dark') ? '#2a2b2f' : '#ffffff',
                        color: document.documentElement.classList.contains('dark') ? '#ffffff' : '#1f2937'
                    });
                    return;
                }

                const field = activeTab === 'characteristics' ? 'characteristicsScores' : 'readingWritingScores';

                setGrades(prev => {
                    const newGrades = { ...prev };
                    snap.forEach(doc => {
                        const studentId = doc.id;
                        const sourceData = doc.data() as GradeRecord;
                        const sourceScores = sourceData[field as keyof GradeRecord];

                        if (sourceScores) {
                            const current = newGrades[studentId] || { formative: 0, midterm: 0, final: 0, total: 0, grade: '0' };
                            newGrades[studentId] = {
                                ...current,
                                [field]: sourceScores
                            };
                            setModifiedStudentIds(prev => new Set(prev).add(studentId));
                        }
                    });
                    return newGrades;
                });

                Swal.fire({ icon: 'success', title: 'นำเข้าคะแนนสำเร็จ', timer: 1500, showConfirmButton: false, toast: true, position: 'top-end' });
            } catch (error) {
                console.error("Error importing grades:", error);
                Swal.fire('เกิดข้อผิดพลาด', 'ไม่สามารถนำเข้าข้อมูลได้', 'error');
            } finally {
                setLoading(false);
            }
        }
    }, [activeTab, courses, schoolId, selectedClass, selectedCourse, setGrades]);

    return {
        isSaving,
        loading,
        handleScoreChange,
        handleBulkFill,
        handleBulkFillColumn,
        handleSyncSDQColumn,
        handleSyncSDQAll,
        handleClearScores,
        handleSave,
        handleImportFromOtherCourse
    };
};
