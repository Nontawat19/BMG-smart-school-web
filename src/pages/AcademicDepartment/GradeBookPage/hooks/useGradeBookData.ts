import { useState, useEffect, useRef } from 'react';
import { collection, query, where, getDocs, collectionGroup, onSnapshot, QuerySnapshot, DocumentData, doc, getDoc, Timestamp } from 'firebase/firestore';
import { firestore as db } from '@/firebase';
import { Student, Course, GradeRecord, ClassroomAttendanceRecord } from '../types';
import { CLASSES } from "@/utils/schoolUtils";
import { AllStudentAttendanceSummaries, StudentAttendanceSummary } from '@/components/Pdf/gradebook/types';
import { getLatestSDQForStudents, SDQAssessment } from '@/services/sdqService';

const getAssessmentKey = (assessment: { id?: string; name?: string }) => assessment.id || assessment.name || '';

const getConfiguredFormativeTotal = (record: any, currentCourse?: Course) => {
    const assessments = currentCourse?.formativeAssessments || [];
    const details = record.formativeDetails || {};

    if (assessments.length === 0) {
        return Number(record.formative || 0);
    }

    return assessments.reduce((sum, assessment) => {
        const key = getAssessmentKey(assessment);
        return sum + Number(details[key] || 0);
    }, 0);
};

export const useGradeBookData = (
    schoolId: string | undefined,
    selectedClass: string,
    selectedRoom: string,
    selectedSemester: string,
    selectedCourse: string,
    selectedGroup: string,
    currentCourse: Course | undefined,
    academicYear: string,
    attendancePages: any[],
    calculateGrade: (total: number) => string
) => {
    const [students, setStudents] = useState<Student[]>([]);
    const [grades, setGrades] = useState<Record<string, GradeRecord>>({});
    const [loading, setLoading] = useState(false);
    const [studentCourseDailyStatus, setStudentCourseDailyStatus] = useState<Record<string, Record<string, 'present' | 'absent' | 'late' | 'leave' | 'escape'>>>({});
    const [sdqMap, setSdqMap] = useState<Record<string, SDQAssessment>>({});
    // When true, the next onSnapshot update from Firestore is suppressed.
    // Set this before a batch write to avoid the full-table re-render that
    // would otherwise cause a visible "flash" right after saving.
    const suppressSnapshotRef = useRef(false);

    // 1. Fetch Students & Grades
    useEffect(() => {
        const fetchStudentsAndGrades = async () => {
            if (!schoolId) {
                setStudents([]);
                setGrades({});
                return;
            }

            // Prioritize Enrollment data if a course is selected
            const hasCourseSelected = !!selectedCourse;
            const hasClassFilter = !!selectedClass;

            if (!hasCourseSelected && !hasClassFilter) {
                setStudents([]);
                setGrades({});
                return;
            }

            setLoading(true);
            try {
                const classTitle = CLASSES[selectedClass] || selectedClass;
                let studentList: Student[] = [];

                if (hasCourseSelected) {
                    // --- CASE A: Fetch from Enrollments (Course Groups) ---
                    const enrollmentsRef = collection(db, 'school-settings', schoolId, 'enrollments');
                    const constraints = [
                        where('courseId', '==', selectedCourse),
                        where('academicYear', '==', academicYear)
                    ];
                    
                    if (selectedGroup) {
                        constraints.push(where('groupName', '==', selectedGroup));
                    }

                    // Semester Filter Logic: Only filter if a specific semester is selected and course is not annual
                    if (selectedSemester && selectedSemester !== 'annual' && selectedSemester !== '0') {
                        const isAnnualCourse = currentCourse?.semester === '1-2' || currentCourse?.semester === 'annual' || currentCourse?.semester === '0';
                        if (!isAnnualCourse && currentCourse?.semester) {
                            constraints.push(where('semester', '==', selectedSemester));
                        }
                    }

                    const enrollSnap = await getDocs(query(enrollmentsRef, ...constraints));

                    if (!enrollSnap.empty) {
                        const enrolledStudentIds = enrollSnap.docs.map(d => d.data().studentId as string);

                        // Track when each student joined this course (enrollment doc's own
                        // createdAt) so attendance % can exclude days before they enrolled —
                        // e.g. a student who transferred in mid-term. Legacy enrollments made
                        // before this field existed simply have no enrolledAt (falls back to
                        // counting the whole term, the previous behavior).
                        //
                        // createdAt isn't consistently written the same way across every
                        // enrollment-creation flow in the app — CourseEnrollmentPage writes
                        // `new Date().toISOString()` (a string) but SgsExportPage writes
                        // `serverTimestamp()` (a Firestore Timestamp) — so normalize both shapes
                        // to an ISO string here rather than assuming the field is always a string.
                        const toISODateString = (value: unknown): string | undefined => {
                            if (!value) return undefined;
                            if (typeof value === 'string') return value;
                            if (value instanceof Timestamp) return value.toDate().toISOString();
                            if (value instanceof Date) return value.toISOString();
                            return undefined;
                        };
                        const enrolledAtMap: Record<string, string | undefined> = {};
                        enrollSnap.docs.forEach(d => {
                            const data = d.data();
                            const sid = data.studentId as string;
                            // Only use explicit enrolledDate / enrolledAt (e.g. transfer-in date).
                            // Generic database document `createdAt` must NOT be used as academic enrollment date,
                            // otherwise classes enrolled mid/late-semester would have their total course hours
                            // incorrectly reduced to just the remaining sessions.
                            const explicitEnrolledAt = toISODateString(data.enrolledDate || data.enrolledAt);
                            if (!sid || !explicitEnrolledAt) return;
                            if (!enrolledAtMap[sid] || explicitEnrolledAt < enrolledAtMap[sid]!) {
                                enrolledAtMap[sid] = explicitEnrolledAt;
                            }
                        });

                        const studentsRef = collection(db, 'school-settings', schoolId, 'students');
                        const batchSize = 30;
                        const studentDetails: Student[] = [];

                        for (let i = 0; i < enrolledStudentIds.length; i += batchSize) {
                            const batchIds = enrolledStudentIds.slice(i, i + batchSize);
                            if (batchIds.length === 0) continue;

                            // Use documentId() 'in' query to fetch up to 30 students at once
                            const qBatch = query(studentsRef, where('__name__', 'in', batchIds));
                            const batchSnap = await getDocs(qBatch);
                            batchSnap.forEach(snap => {
                                const data = snap.data();
                                studentDetails.push({
                                    id: snap.id,
                                    ...data,
                                    studentNumber: String(data.number ?? data.classNumber ?? data.no ?? data.studentNumber ?? ""),
                                    studentId: String(data.studentCode ?? data.studentId ?? snap.id ?? ""),
                                    room: data.room || "",
                                    enrolledAt: enrolledAtMap[snap.id]
                                } as Student);
                            });
                        }
                        studentList = studentDetails;
                    }
                } else if (hasClassFilter) {
                    // --- CASE B: Fetch from Room (Original Logic) ---
                    const studentsRef = collection(db, 'school-settings', schoolId, 'students');
                    let qStudents = query(studentsRef, where('classLevel', '==', classTitle));
                    if (selectedRoom && selectedRoom !== 'all') {
                        qStudents = query(studentsRef, where('classLevel', '==', classTitle), where('room', '==', selectedRoom));
                    }
                    const studentSnap = await getDocs(qStudents);
                    studentList = studentSnap.docs.map(doc => ({
                        id: doc.id,
                        ...doc.data(),
                        studentNumber: String(doc.data().number || doc.data().classNumber || doc.data().no || doc.data().studentNumber || ""),
                        studentId: String(doc.data().studentCode || doc.data().studentId || doc.id || ""),
                        room: doc.data().room || ""
                    } as Student));
                }

                // Processing names and sorting
                const processedList = studentList
                    .map(s => {
                        let fName = s.firstName || "";
                        const commonPrefixes = ['เด็กชาย', 'เด็กหญิง', 'นาย', 'นางสาว', 'นาง', 'สามเณร', 'พระ', 'พระสามเณร', 'พระมหา', 'พระครู', 'พระใบฎีกา', 'หลวงพ่อ', 'พระอาจารย์'];
                        const foundPrefix = commonPrefixes.find(p => fName.startsWith(p));

                        return {
                            ...s,
                            title: foundPrefix ? "" : (s.title || ""),
                            studentNumber: s.studentNumber?.toString().trim() || ""
                        };
                    })
                    .filter(s => !selectedRoom || selectedRoom === 'all' || String(s.room) === String(selectedRoom))
                    .sort((a, b) => {
                        const numA = a.studentNumber ? parseInt(a.studentNumber, 10) : 9999;
                        const numB = b.studentNumber ? parseInt(b.studentNumber, 10) : 9999;
                        if (numA !== numB) return numA - numB;

                        const roomA = parseInt(a.room) || 0;
                        const roomB = parseInt(b.room) || 0;
                        if (roomA !== roomB) return roomA - roomB;

                        return (a.firstName || "").localeCompare(b.firstName || "", 'th');
                    });

                setStudents(processedList);
            } catch (error) {
                console.error("Error fetching students/grades:", error);
            } finally {
                setLoading(false);
            }
        };

        fetchStudentsAndGrades();
    }, [selectedClass, selectedCourse, selectedGroup, schoolId, selectedRoom, academicYear, selectedSemester, currentCourse]);

    // Clear grades when switching course or class
    useEffect(() => {
        setGrades({});
    }, [selectedCourse, selectedGroup, selectedClass, selectedRoom, schoolId]);

    // Real-time Grades Listener
    useEffect(() => {
        if (!schoolId || !selectedCourse || students.length === 0) {
            return;
        }

        const gradesRef = collection(db, 'school-settings', schoolId, 'courses', selectedCourse, 'grades');
        const unsubscribe = onSnapshot(gradesRef, (gradeSnap: QuerySnapshot<DocumentData>) => {
            // Skip snapshot updates triggered by our own batch write — the local state
            // already reflects the saved data, so re-applying the snapshot would only
            // cause an unnecessary full re-render (the visible "flash").
            if (suppressSnapshotRef.current) {
                suppressSnapshotRef.current = false;
                return;
            }
            const idToStudentDocId: Record<string, string> = {};
            students.forEach(s => {
                idToStudentDocId[s.id] = s.id;
                if (s.studentId) idToStudentDocId[s.studentId] = s.id;
            });

            const studentDataGroups: Record<string, any[]> = {};
            gradeSnap.forEach(doc => {
                const targetId = idToStudentDocId[doc.id];
                if (targetId) {
                    if (!studentDataGroups[targetId]) studentDataGroups[targetId] = [];
                    studentDataGroups[targetId].push({ id: doc.id, ...doc.data() });
                }
            });

            setGrades(() => {
                const newGrades: Record<string, GradeRecord> = {};

                Object.entries(studentDataGroups).forEach(([targetId, records]) => {
                    const primaryRecord = records.find(r => r.id === targetId);
                    const bestRecord = primaryRecord || records.reduce((best, cur) => {
                        const bestTotal = getConfiguredFormativeTotal(best, currentCourse) + Number(best.midterm || 0) + Number(best.final || 0);
                        const curTotal = getConfiguredFormativeTotal(cur, currentCourse) + Number(cur.midterm || 0) + Number(cur.final || 0);
                        return curTotal > bestTotal ? cur : best;
                    }, records[0]);

                    if (bestRecord) {
                        let combinedDetails = { ...(bestRecord.formativeDetails || {}) };
                        records.forEach(r => {
                            if (r.formativeDetails) {
                                combinedDetails = { ...combinedDetails, ...r.formativeDetails };
                            }
                        });

                        const normalizedRecord = { ...bestRecord, formativeDetails: combinedDetails };
                        const f = getConfiguredFormativeTotal(normalizedRecord, currentCourse);
                        const m = Number(bestRecord.midterm || 0);
                        const fn = Number(bestRecord.final || 0);
                        const total = f + m + fn;
                        // ครูพิมพ์ "ร" ไว้ในช่องคะแนนช่องไหนก็ได้ ต้องเคารพค่านี้ก่อนเสมอ ไม่งั้นตรงนี้จะคำนวณเกรด
                        // จาก total ทับ "ร" ที่ครูตั้งใจกรอกไว้ทุกครั้ง (เคารพ มส เดิมก่อนสุด เหมือนหน้าบันทึก
                        // คะแนนทุกหน้า) — เช็คจาก grade ปัจจุบันเท่านั้น ห้ามใช้ incompleteFields ที่นี่ เพราะเป็น
                        // ประวัติถาวร (เก็บไว้ให้หน้าบันทึกคะแนนใช้ระบายสีเหลือง/เขียวย้อนหลัง) ไม่ใช่สถานะปัจจุบัน
                        // ถ้าครูแก้ "ร" เป็นคะแนนจริงแล้ว incompleteFields ในเอกสารจะยังมีชื่อฟิลด์นั้นค้างอยู่
                        // เสมอ ถ้าเอามาเช็คตรงนี้ด้วยจะทำให้เกรดติด "ร" ค้างตลอดไปแม้แก้ไขเสร็จแล้วก็ตาม
                        const isIncomplete = bestRecord.grade === 'ร';
                        const naturalGrade = calculateGrade(total);
                        // แก้ "0" สำเร็จผ่านหน้าคำร้องขอแก้ตัว (เช่น ตามระเบียบ ศธ. ได้เกรดสูงสุดไม่เกิน "1" แม้
                        // คะแนนสอบซ่อมจริงจะไม่ได้ไปบวกเข้าคะแนนดิบในสมุดคะแนนเลย) — grade ที่บันทึกไว้จะไม่ตรงกับ
                        // total ที่คำนวณสดอีกต่อไป ถ้า bestRecord.grade ต่างจาก naturalGrade (และไม่ใช่ "ร" ที่
                        // จัดการแยกไปแล้ว) ถือว่าเป็นผลแก้ตัวที่ตั้งใจบันทึกไว้ ให้เชื่อค่านั้นแทนการคำนวณทับ
                        const isResolvedOverride = !isIncomplete && !!bestRecord.grade && bestRecord.grade !== naturalGrade;

                        newGrades[targetId] = {
                            ...bestRecord,
                            formative: f,
                            midterm: m,
                            final: fn,
                            total: total,
                            grade: bestRecord.status || (isIncomplete ? 'ร' : (isResolvedOverride ? bestRecord.grade : naturalGrade)),
                            formativeDetails: combinedDetails
                        };
                    }
                });

                return newGrades;
            });
        }, (error: Error) => {
            console.error("Error listening to grades:", error);
        });

        return () => unsubscribe();
    }, [schoolId, selectedCourse, students, calculateGrade, currentCourse]);

    // Detailed Attendance — real-time listener (not a one-time fetch) so edits made from
    // the historical attendance editor (or another tab/teacher) while this page stays open
    // are reflected immediately instead of requiring a remount to pick up.
    useEffect(() => {
        if (!schoolId || !selectedCourse || students.length === 0) {
            setStudentCourseDailyStatus({});
            return;
        }

        const attendanceRef = collectionGroup(db, 'ClassroomAttendance');
        const validSubjectCodes = Array.from(new Set([
            selectedCourse,
            (currentCourse?.code || "").trim(),
            (currentCourse?.code || "").replace(/\s/g, ''),
            currentCourse?.id
        ])).filter(Boolean).slice(0, 10) as string[];

        const attendanceConstraints = [
            where('schoolId', '==', schoolId),
            where('subjectCode', 'in', validSubjectCodes),
            where('academicYear', '==', academicYear),
            ...(selectedSemester && selectedSemester !== 'annual' && selectedSemester !== '0'
                ? [where('semester', '==', selectedSemester)]
                : [])
        ];
        const qSubj = query(attendanceRef, ...attendanceConstraints);

        const idToStudentDocId: Record<string, string> = {};
        students.forEach(s => {
            idToStudentDocId[s.id] = s.id;
            if (s.studentId) idToStudentDocId[s.studentId] = s.id;
        });

        // Worst-status-wins when multiple periods on the same day disagree:
        // absent/escape (truancy, treated as at least as severe as absent) > leave > late > present.
        const STATUS_SEVERITY: Record<string, number> = { absent: 4, escape: 4, leave: 3, late: 2, present: 1 };

        const unsubscribe = onSnapshot(qSubj, (snap: QuerySnapshot<DocumentData>) => {
            const newDailyStatus: Record<string, Record<string, ClassroomAttendanceRecord['status']>> = {};
            students.forEach(student => {
                newDailyStatus[student.id] = {};
            });

            snap.forEach(docSnap => {
                const rec = docSnap.data() as ClassroomAttendanceRecord;
                if (!rec.date) return;
                const targetStudentId = idToStudentDocId[rec.studentId];
                if (!targetStudentId) return;

                const d = rec.date.toDate();
                const dateStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
                const status = rec.status;

                const current = newDailyStatus[targetStudentId][dateStr];
                if (!current || (STATUS_SEVERITY[status] ?? 0) >= (STATUS_SEVERITY[current] ?? 0)) {
                    newDailyStatus[targetStudentId][dateStr] = status;
                }
            });

            setStudentCourseDailyStatus(newDailyStatus);
        }, (err) => {
            console.error("Attendance listener error:", err);
            // Firestore doesn't auto-resubscribe a listener after it errors (e.g. a
            // transient permission/rule issue), so without resetting here the page would be
            // stuck showing stale attendance indefinitely with no visible error. Reset to
            // empty — the same effective result the old one-time getDocs() had on failure
            // (its try/catch swallowed the error and fell through to an empty result set).
            setStudentCourseDailyStatus({});
        });

        return () => unsubscribe();
    }, [schoolId, students, selectedCourse, currentCourse, academicYear, selectedSemester]);

    // Fetch SDQ Map
    useEffect(() => {
        const fetchSDQ = async () => {
            if (!schoolId || students.length === 0) {
                setSdqMap({});
                return;
            }
            try {
                const map = await getLatestSDQForStudents(schoolId, students.map(s => s.id), academicYear);
                setSdqMap(map);
            } catch (err) { console.error("SDQ fetch error:", err); }
        };
        fetchSDQ();
    }, [schoolId, students, academicYear]);

    return { students, grades, setGrades, loading, studentCourseDailyStatus, sdqMap, suppressSnapshotRef };
};
