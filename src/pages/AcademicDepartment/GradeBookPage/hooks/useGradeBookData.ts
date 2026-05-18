import { useState, useEffect } from 'react';
import { collection, query, where, getDocs, collectionGroup, onSnapshot, QuerySnapshot, DocumentData, doc, getDoc } from 'firebase/firestore';
import { firestore as db } from '@/firebase';
import { Student, Course, GradeRecord, ClassroomAttendanceRecord } from '../types';
import { CLASSES } from "@/utils/schoolUtils";
import { AllStudentAttendanceSummaries, StudentAttendanceSummary } from '@/components/Pdf/gradebook/types';
import { getLatestSDQForStudents, SDQAssessment } from '@/services/sdqService';

<<<<<<< HEAD
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

=======
>>>>>>> 5f8c7e1 (feat: optimize auto-scheduler and update UI labels)
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
    const [studentCourseDailyStatus, setStudentCourseDailyStatus] = useState<Record<string, Record<string, 'present' | 'absent' | 'late' | 'leave'>>>({});
    const [sdqMap, setSdqMap] = useState<Record<string, SDQAssessment>>({});

    // 1. Fetch Students & Grades
    useEffect(() => {
        const fetchStudentsAndGrades = async () => {
            if (!schoolId) {
                setStudents([]);
                setGrades({});
                return;
            }

<<<<<<< HEAD
            // Prioritize Enrollment data if a course is selected
            const hasCourseSelected = !!selectedCourse;
            const hasClassFilter = !!selectedClass;

            if (!hasCourseSelected && !hasClassFilter) {
=======
            // Requirement: Must have either (Class + Room) OR (Course + Group)
            // If we have selectedCourse and selectedGroup, we prioritize Enrollment data
            const hasEnrollmentFilter = selectedCourse && selectedGroup;
            const hasClassFilter = selectedClass;

            if (!hasEnrollmentFilter && !hasClassFilter) {
>>>>>>> 5f8c7e1 (feat: optimize auto-scheduler and update UI labels)
                setStudents([]);
                setGrades({});
                return;
            }

            setLoading(true);
            try {
                const classTitle = CLASSES[selectedClass] || selectedClass;
                let studentList: Student[] = [];

<<<<<<< HEAD
                if (hasCourseSelected) {
=======
                if (hasEnrollmentFilter) {
>>>>>>> 5f8c7e1 (feat: optimize auto-scheduler and update UI labels)
                    // --- CASE A: Fetch from Enrollments (Course Groups) ---
                    const enrollmentsRef = collection(db, 'school-settings', schoolId, 'enrollments');
                    const constraints = [
                        where('courseId', '==', selectedCourse),
<<<<<<< HEAD
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
=======
                        where('groupName', '==', selectedGroup),
                        where('academicYear', '==', academicYear)
                    ];
                    
                    // Optional: If course is not annual, filter by semester
                    if (currentCourse?.semester && currentCourse.semester !== '1-2' && currentCourse.semester !== 'annual') {
                        constraints.push(where('semester', '==', selectedSemester));
>>>>>>> 5f8c7e1 (feat: optimize auto-scheduler and update UI labels)
                    }

                    const enrollSnap = await getDocs(query(enrollmentsRef, ...constraints));
                    
                    if (!enrollSnap.empty) {
                        const enrolledStudentIds = enrollSnap.docs.map(d => d.data().studentId as string);
                        
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
<<<<<<< HEAD
                                    studentNumber: String(data.number ?? data.classNumber ?? data.no ?? data.studentNumber ?? ""),
                                    studentId: String(data.studentCode ?? data.studentId ?? snap.id ?? ""),
=======
                                    studentNumber: String(data.number || data.classNumber || data.no || data.studentNumber || ""),
                                    studentId: String(data.studentCode || data.studentId || snap.id || ""),
>>>>>>> 5f8c7e1 (feat: optimize auto-scheduler and update UI labels)
                                    room: data.room || ""
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
                        const commonPrefixes = ['เด็กชาย', 'เด็กหญิง', 'นาย', 'นางสาว', 'นาง'];
                        const foundPrefix = commonPrefixes.find(p => fName.startsWith(p));

                        return {
                            ...s,
                            title: foundPrefix ? "" : (s.title || ""),
                            studentNumber: s.studentNumber?.toString().trim() || ""
                        };
                    })
<<<<<<< HEAD
                    .filter(s => !selectedRoom || selectedRoom === 'all' || String(s.room) === String(selectedRoom))
                    .sort((a, b) => {
                        const numA = a.studentNumber ? parseInt(a.studentNumber, 10) : 9999;
                        const numB = b.studentNumber ? parseInt(b.studentNumber, 10) : 9999;
                        if (numA !== numB) return numA - numB;

=======
                    .sort((a, b) => {
>>>>>>> 5f8c7e1 (feat: optimize auto-scheduler and update UI labels)
                        const roomA = parseInt(a.room) || 0;
                        const roomB = parseInt(b.room) || 0;
                        if (roomA !== roomB) return roomA - roomB;

<<<<<<< HEAD
=======
                        const numA = a.studentNumber ? parseInt(a.studentNumber, 10) : 9999;
                        const numB = b.studentNumber ? parseInt(b.studentNumber, 10) : 9999;
                        if (numA !== numB) return numA - numB;

>>>>>>> 5f8c7e1 (feat: optimize auto-scheduler and update UI labels)
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

<<<<<<< HEAD
            setGrades(() => {
                const newGrades: Record<string, GradeRecord> = {};
=======
            setGrades(prev => {
                const newGrades = { ...prev };
>>>>>>> 5f8c7e1 (feat: optimize auto-scheduler and update UI labels)

                Object.entries(studentDataGroups).forEach(([targetId, records]) => {
                    const primaryRecord = records.find(r => r.id === targetId);
                    const bestRecord = primaryRecord || records.reduce((best, cur) => {
<<<<<<< HEAD
                        const bestTotal = getConfiguredFormativeTotal(best, currentCourse) + Number(best.midterm || 0) + Number(best.final || 0);
                        const curTotal = getConfiguredFormativeTotal(cur, currentCourse) + Number(cur.midterm || 0) + Number(cur.final || 0);
=======
                        const bestTotal = (Number(best.formative || 0) + Number(best.midterm || 0) + Number(best.final || 0));
                        const curTotal = (Number(cur.formative || 0) + Number(cur.midterm || 0) + Number(cur.final || 0));
>>>>>>> 5f8c7e1 (feat: optimize auto-scheduler and update UI labels)
                        return curTotal > bestTotal ? cur : best;
                    }, records[0]);

                    if (bestRecord) {
<<<<<<< HEAD
                        let combinedDetails = { ...(bestRecord.formativeDetails || {}) };
                        records.forEach(r => {
                            if (r.formativeDetails) {
                                combinedDetails = { ...combinedDetails, ...r.formativeDetails };
                            }
                        });

                        const normalizedRecord = { ...bestRecord, formativeDetails: combinedDetails };
                        const f = getConfiguredFormativeTotal(normalizedRecord, currentCourse);
=======
                        const f = Number(bestRecord.formative || 0);
>>>>>>> 5f8c7e1 (feat: optimize auto-scheduler and update UI labels)
                        const m = Number(bestRecord.midterm || 0);
                        const fn = Number(bestRecord.final || 0);
                        const total = f + m + fn;

                        newGrades[targetId] = {
                            ...bestRecord,
                            formative: f,
                            midterm: m,
                            final: fn,
                            total: total,
<<<<<<< HEAD
                            grade: bestRecord.status || calculateGrade(total),
                            formativeDetails: combinedDetails
                        };
=======
                            grade: bestRecord.status || calculateGrade(total)
                        };

                        if (records.length > 1) {
                            let combinedDetails = { ...(bestRecord.formativeDetails || {}) };
                            records.forEach(r => {
                                if (r.formativeDetails) {
                                    combinedDetails = { ...combinedDetails, ...r.formativeDetails };
                                }
                            });
                            newGrades[targetId].formativeDetails = combinedDetails;
                        }
>>>>>>> 5f8c7e1 (feat: optimize auto-scheduler and update UI labels)
                    }
                });

                return newGrades;
            });
        }, (error: Error) => {
            console.error("Error listening to grades:", error);
        });

        return () => unsubscribe();
<<<<<<< HEAD
    }, [schoolId, selectedCourse, students, calculateGrade, currentCourse]);
=======
    }, [schoolId, selectedCourse, students, calculateGrade]);
>>>>>>> 5f8c7e1 (feat: optimize auto-scheduler and update UI labels)

    // Fetch Detailed Attendance
    useEffect(() => {
        const fetchDetailedAttendance = async () => {
            if (!schoolId || !selectedCourse || students.length === 0) {
                setStudentCourseDailyStatus({});
                return;
            }

            const newDailyStatus: Record<string, Record<string, 'present' | 'absent' | 'late' | 'leave'>> = {};
            const allAttendanceRecords: ClassroomAttendanceRecord[] = [];

            const attendanceRef = collectionGroup(db, 'ClassroomAttendance');
            const validSubjectCodes = Array.from(new Set([
                selectedCourse,
                (currentCourse?.code || "").trim(),
                (currentCourse?.code || "").replace(/\s/g, ''),
                currentCourse?.id
            ])).filter(Boolean).slice(0, 10) as string[];

            try {
                // If we have selectedGroup, we might want to filter attendance by group too if possible,
                // but usually attendance is keyed by student and subject.
                const qSubj = query(attendanceRef, where('schoolId', '==', schoolId), where('subjectCode', 'in', validSubjectCodes));
                const snap = await getDocs(qSubj);
                snap.forEach(doc => {
                    const data = doc.data() as ClassroomAttendanceRecord;
                    allAttendanceRecords.push(data);
                });
            } catch (err) { console.error("Attendance query error:", err); }

            const idToStudentDocId: Record<string, string> = {};
            students.forEach(s => {
                idToStudentDocId[s.id] = s.id;
                if (s.studentId) idToStudentDocId[s.studentId] = s.id;
            });

            students.forEach(student => {
                newDailyStatus[student.id] = {};
            });

            allAttendanceRecords.forEach(rec => {
                if (!rec.date) return;
                const targetStudentId = idToStudentDocId[rec.studentId];
                if (!targetStudentId) return;

                const d = rec.date.toDate();
                const dateStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
                const status = rec.status as any;

                const current = newDailyStatus[targetStudentId][dateStr];
                if (!current || status === 'absent' || (status === 'leave' && current !== 'absent') || (status === 'late' && current !== 'absent' && current !== 'leave')) {
                    newDailyStatus[targetStudentId][dateStr] = status;
                }
            });

            setStudentCourseDailyStatus(newDailyStatus);
        };

        fetchDetailedAttendance();
    }, [schoolId, students, selectedCourse, currentCourse]);

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

    return { students, grades, setGrades, loading, studentCourseDailyStatus, sdqMap };
};
