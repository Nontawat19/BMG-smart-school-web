import { useState, useCallback } from 'react';
import Swal from 'sweetalert2';
import { doc, writeBatch, Timestamp, collection, getDoc, getDocs, deleteField } from 'firebase/firestore';
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
    sdqMap: Record<string, any>,
    attendanceEligibility: Record<string, { percentage: number; presentHours: number; totalHours: number; belowThreshold: boolean }>
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

        // ลำดับการตัดสินผล: 1) เช็คเวลาเรียน (จากระบบเช็คชื่อรายวิชา) ก่อนเสมอ — ถ้าต่ำกว่าร้อยละ 80
        // ติด "มส" ทันที ไม่ว่าคะแนนจะได้เท่าไหร่ก็ตาม 2) ถ้าเวลาเรียนผ่านเกณฑ์แล้วค่อยดูคะแนน (ต่ำกว่า
        // 50 = "0" ตามที่คำนวณอัตโนมัติอยู่แล้วใน calculateGrade) — เวลาเรียนไม่พอ "ทับ" เกรด/สถานะเดิม
        // ที่ครูใส่ไว้เสมอ จึงต้องรวมนักเรียนกลุ่มนี้เข้าไปในชุดที่บันทึก แม้ครูจะไม่ได้แก้คะแนนของเขาเลยก็ตาม
        const attendanceFlaggedIds = students
            .filter(s => attendanceEligibility[s.id]?.belowThreshold)
            .map(s => s.id);

        // อ่านเอกสารเดิมของ "ทุกคนในวิชานี้" ก่อนเสมอ (ไม่ใช่แค่คนที่ครูแก้คะแนน) — เพื่อตรวจหาใครที่เคย
        // ติด มส. อัตโนมัติไว้ (เวลาเรียนต่ำกว่า 80% ตอนนั้น) แต่ตอนนี้เวลาเรียนกลับมาครบ 80% แล้ว โดยที่ครู
        // ไม่ได้แก้คะแนนของเขาเลย — ถ้าไม่เช็คตรงนี้ทุกครั้งที่กด "บันทึก" มส. เดิมจะค้างอยู่ตลอดไปแม้เวลาเรียน
        // จะฟื้นแล้วก็ตาม (เหมือนที่แก้ไปแล้วในหน้าเช็คชื่อรายวิชา/เช็คชื่อย้อนหลัง — ต้องทำงานสอดคล้องกันทั้ง
        // 3 หน้า ไม่งั้นผลตัดสินจะขัดแย้งกันขึ้นอยู่กับว่าครูบันทึกจากหน้าไหนล่าสุด)
        const allExistingSnaps = await Promise.all(
            students.map(s => getDoc(doc(db, 'school-settings', schoolId, 'courses', selectedCourse, 'grades', s.id)))
        );
        const existingDataById: Record<string, any> = {};
        students.forEach((s, idx) => {
            const snap = allExistingSnaps[idx];
            if (snap.exists()) existingDataById[s.id] = snap.data();
        });

        const unflagCandidateIds = students
            .filter(s => {
                if (attendanceEligibility[s.id]?.belowThreshold) return false; // ยังติดอยู่จริง ไม่ใช่ผู้สมัครถอน มส.
                const existing = existingDataById[s.id];
                return existing?.status === 'มส' && typeof existing?.remark === 'string' && existing.remark.startsWith('เวลาเรียนไม่ถึงร้อยละ 80');
            })
            .map(s => s.id);

        const currentModifiedIds = Array.from(new Set([...modifiedStudentIds, ...attendanceFlaggedIds, ...unflagCandidateIds]));

        if (currentModifiedIds.length === 0) {
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

        try {
            // ใช้เอกสารเดิมที่อ่านไปแล้วด้านบน (ครอบคลุมทั้งวิชาอยู่แล้ว) เพื่อรู้ว่าใครเพิ่ง "หลุด ร" จากการ
            // แก้คะแนน (ต้องเทียบกับ grade เดิมที่บันทึกไว้จริงใน Firestore ไม่ใช่ state ในเครื่องที่อาจถูก
            // คำนวณเป็นเกรดใหม่ไปแล้วตั้งแต่ตอนแก้คะแนน) — ใช้ทำ remark อัตโนมัติอธิบายว่านักเรียนแก้ไขคะแนน
            // จนได้เกรดนี้แล้ว
            const existingGradeById: Record<string, string> = {};
            currentModifiedIds.forEach((studentId) => {
                const existing = existingDataById[studentId];
                if (existing) existingGradeById[studentId] = String(existing.grade || '').trim();
            });

            const unflagCandidateIdSet = new Set(unflagCandidateIds);
            const batch = writeBatch(db);
            currentModifiedIds.forEach((studentId) => {
                const baseRecord = grades[studentId] || { formative: 0, midterm: 0, final: 0, total: 0, grade: '0' };
                const attendanceInfo = attendanceEligibility[studentId];
                const ref = doc(db, 'school-settings', schoolId, 'courses', selectedCourse, 'grades', studentId);

                // เวลาเรียนกลับมาครบ 80% แล้ว และเคยติด มส. อัตโนมัติไว้ (ไม่ใช่ครูตั้งใจกดเอง) — ถอน มส.
                // คืนเป็นเกรดจริงจากคะแนนที่มีอยู่ ถ้ายังไม่เคยมีคะแนนใดๆ เลย (เอกสารที่ถูกสร้างไว้เพื่อ มส.
                // อย่างเดียว) ให้ลบทิ้งแทนเพื่อไม่ให้นักเรียนติด "0" หลอกๆ — ตรรกะเดียวกับหน้าเช็คชื่อรายวิชา/
                // เช็คชื่อย้อนหลัง
                if (unflagCandidateIdSet.has(studentId) && !attendanceInfo?.belowThreshold) {
                    const existing = existingDataById[studentId] || {};
                    const totalScore = Number(existing.total ?? 0);
                    const hasAnyScores = (existing.formativeDetails && Object.keys(existing.formativeDetails).length > 0) ||
                        Number(existing.formative ?? 0) > 0 ||
                        Number(existing.midterm ?? 0) > 0 ||
                        Number(existing.final ?? 0) > 0 ||
                        totalScore > 0;
                    if (hasAnyScores) {
                        // เวลาเรียนผ่านเกณฑ์แล้ว แต่ถ้ายังมีช่องคะแนนที่ครูพิมพ์ "ร" ค้างไว้ (incompleteFields จาก
                        // FormativeScoreEntryPage/PostMidtermScoreEntryPage) ต้องคืนเป็น "ร" ไม่ใช่คำนวณเกรดจาก
                        // total ตรงๆ — total ที่นับ "ร" เป็น 0 ไปแล้วจะให้เกรดผิดเพี้ยน (เช่น "0" ทั้งที่ยังรอครูให้
                        // คะแนนจริงอยู่) ตรงกับลำดับการตัดสินผลที่ใช้ทั้งระบบ: เวลาเรียนก่อน แล้วค่อย ร แล้วค่อยคะแนน
                        const stillIncomplete = (existing.incompleteFields || []).length > 0;
                        batch.set(ref, {
                            ...existing,
                            status: stillIncomplete ? 'ร' : deleteField(),
                            grade: stillIncomplete ? 'ร' : calculateGrade(totalScore),
                            remark: deleteField(),
                            updatedAt: Timestamp.now(),
                        }, { merge: true });
                    } else {
                        batch.delete(ref);
                    }
                    return;
                }

                // เวลาเรียนไม่ถึงร้อยละ 80 → บังคับ "มส" เสมอ ทับสถานะ/เกรดใดๆ ที่ครูใส่ไว้
                const record: GradeRecord = attendanceInfo?.belowThreshold
                    ? {
                        ...baseRecord,
                        status: 'มส',
                        grade: 'มส',
                        remark: `เวลาเรียนไม่ถึงร้อยละ 80 (${attendanceInfo.presentHours}/${attendanceInfo.totalHours} คาบ = ${attendanceInfo.percentage.toFixed(1)}%)`,
                    }
                    : baseRecord;

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
                    // เวลาเรียนผ่านเกณฑ์แล้ว จึงมาถึงขั้นดูคะแนน — calculateGrade คืน "0" อัตโนมัติถ้าคะแนนรวม < 50
                    const resolvedGrade = calculateGrade(Number(record.total || 0));
                    dataToSave.grade = resolvedGrade;
                    // เพิ่งหลุดจาก "ร" ด้วยการแก้คะแนน (ไม่ใช่ครูกดปุ่ม 0/ร/มส เอง) — ใส่ remark อธิบายไว้ให้
                    // อัตโนมัติ เพื่อให้หน้า remediation-record/zero-r-ms-report เห็นเหตุผลตรงกัน
                    if (existingGradeById[studentId] === 'ร' && resolvedGrade !== 'ร') {
                        dataToSave.remark = `นักเรียนแก้ไขคะแนนแล้ว ได้เกรด ${resolvedGrade}`;
                    }
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
                toast: true,
                position: 'top-end'
            });
        } catch (error) {
            console.error("Error saving grades:", error);
            Swal.fire('เกิดข้อผิดพลาด', 'ไม่สามารถบันทึกข้อมูลได้', 'error');
        } finally {
            setIsSaving(false);
        }
    }, [grades, schoolId, selectedCourse, modifiedStudentIds, students, attendanceEligibility]);

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
