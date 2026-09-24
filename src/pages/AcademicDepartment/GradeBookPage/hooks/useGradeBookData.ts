import { useState, useEffect, useRef, useCallback } from 'react';
import { collection, query, where, getDocs, collectionGroup, onSnapshot, QuerySnapshot, DocumentData, Timestamp } from 'firebase/firestore';
import { firestore as db } from '@/firebase';
import { Student, Course, GradeRecord, ClassroomAttendanceRecord } from '../types';
import { CLASSES } from "@/utils/schoolUtils";
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

const getConfiguredPreMidtermTotal = (record: any, currentCourse?: Course) => {
    const assessments = currentCourse?.formativeAssessments || [];
    const details = record.formativeDetails || {};
    const preAssessments = assessments.filter(a => a.term === 'pre-midterm' || !a.term);

    if (assessments.length === 0) {
        if (record.preMidterm !== undefined) return Number(record.preMidterm || 0);
        return Number(record.formative || 0);
    }

    return preAssessments.reduce((sum, assessment) => {
        const key = getAssessmentKey(assessment);
        return sum + Number(details[key] || 0);
    }, 0);
};

const getConfiguredPostMidtermTotal = (record: any, currentCourse?: Course) => {
    const assessments = currentCourse?.formativeAssessments || [];
    const details = record.formativeDetails || {};
    const postAssessments = assessments.filter(a => a.term === 'post-midterm');

    if (assessments.length === 0) {
        if (record.postMidterm !== undefined) return Number(record.postMidterm || 0);
        return 0;
    }

    return postAssessments.reduce((sum, assessment) => {
        const key = getAssessmentKey(assessment);
        return sum + Number(details[key] || 0);
    }, 0);
};

const toISODateString = (value: unknown): string | undefined => {
    if (!value) return undefined;
    if (typeof value === 'string') return value;
    if (value instanceof Timestamp) return value.toDate().toISOString();
    if (value instanceof Date) return value.toISOString();
    return undefined;
};

const processAndSortStudents = (studentList: Student[], selectedRoom: string): Student[] => {
    const commonPrefixes = ['เด็กชาย', 'เด็กหญิง', 'นาย', 'นางสาว', 'นาง', 'สามเณร', 'พระ', 'พระสามเณร', 'พระมหา', 'พระครู', 'พระใบฎีกา', 'หลวงพ่อ', 'พระอาจารย์'];

    return studentList
        .map(s => {
            const fName = s.firstName || "";
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
};

const processGradesSnapshot = (
    serverDocs: { id: string; data: any }[],
    students: Student[],
    currentCourse: Course | undefined,
    calculateGrade: (total: number) => string
): Record<string, GradeRecord> => {
    const idToStudentDocId: Record<string, string> = {};
    students.forEach(s => {
        idToStudentDocId[s.id] = s.id;
        if (s.studentId) idToStudentDocId[s.studentId] = s.id;
    });

    const studentDataGroups: Record<string, any[]> = {};
    serverDocs.forEach(doc => {
        const targetId = idToStudentDocId[doc.id];
        if (targetId) {
            if (!studentDataGroups[targetId]) studentDataGroups[targetId] = [];
            studentDataGroups[targetId].push({ id: doc.id, ...doc.data });
        }
    });

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
            const preM = getConfiguredPreMidtermTotal(normalizedRecord, currentCourse);
            const postM = getConfiguredPostMidtermTotal(normalizedRecord, currentCourse);
            const f = preM + postM;
            const m = Number(bestRecord.midterm || 0);
            const fn = Number(bestRecord.final || 0);
            const total = f + m + fn;
            const isIncomplete = bestRecord.status === 'ร' || bestRecord.grade === 'ร';
            const naturalGrade = calculateGrade(total);
            // ให้เคารพเกรดที่ต่างจาก naturalGrade เฉพาะกรณีที่เป็นผลการแก้ตัวเดิมจริง (มี originalGrade บันทึกไว้จากระบบแก้ตัว)
            // เท่านั้น — ป้องกันไม่ให้เกรดเก่าค้าง (เช่น เดิมมีคะแนนเก็บ 58 = เกรด 1.5 แต่เมื่อเพิ่มคะแนนกลางภาคเป็น 73 แล้ว
            // ยังติดเกรด 1.5 เพราะ 1.5 !== 3)
            const isResolvedRemediation = Boolean(bestRecord.originalGrade && bestRecord.grade && bestRecord.grade !== naturalGrade);

            newGrades[targetId] = {
                ...bestRecord,
                preMidterm: preM,
                postMidterm: postM,
                formative: f,
                midterm: m,
                final: fn,
                total: total,
                grade: bestRecord.status || (isIncomplete ? 'ร' : (isResolvedRemediation ? bestRecord.grade : naturalGrade)),
                formativeDetails: combinedDetails
            };
        }
    });

    return newGrades;
};

const STATUS_SEVERITY: Record<string, number> = { absent: 4, escape: 4, leave: 3, late: 2, present: 1 };

const processAttendanceRecords = (
    records: ClassroomAttendanceRecord[],
    students: Student[]
): Record<string, Record<string, 'present' | 'absent' | 'late' | 'leave' | 'escape'>> => {
    const idToStudentDocId: Record<string, string> = {};
    students.forEach(s => {
        idToStudentDocId[s.id] = s.id;
        if (s.studentId) idToStudentDocId[s.studentId] = s.id;
    });

    const newDailyStatus: Record<string, Record<string, ClassroomAttendanceRecord['status']>> = {};
    students.forEach(student => {
        newDailyStatus[student.id] = {};
    });

    records.forEach(rec => {
        if (!rec.date) return;
        const targetStudentId = idToStudentDocId[rec.studentId];
        if (!targetStudentId) return;

        let dateStr = '';
        const idMatch = (rec as any).id?.match?.(/^(\d{2})-(\d{2})-(\d{4})/);
        if (idMatch) {
            dateStr = `${idMatch[3]}-${idMatch[2]}-${idMatch[1]}`;
        } else {
            const d = typeof (rec.date as any)?.toDate === 'function' ? (rec.date as any).toDate() : new Date(rec.date as any);
            const bangkokTime = new Date(d.getTime() + 7 * 3600 * 1000);
            dateStr = `${bangkokTime.getUTCFullYear()}-${String(bangkokTime.getUTCMonth() + 1).padStart(2, '0')}-${String(bangkokTime.getUTCDate()).padStart(2, '0')}`;
        }
        const status = rec.status;

        const current = newDailyStatus[targetStudentId][dateStr];
        if (!current || (STATUS_SEVERITY[status] ?? 0) >= (STATUS_SEVERITY[current] ?? 0)) {
            newDailyStatus[targetStudentId][dateStr] = status;
        }
    });

    return newDailyStatus;
};

// Global memory cache for SDQ to prevent refetching across tab/filter toggles
const sdqGlobalCache: Record<string, Record<string, SDQAssessment>> = {};

export const useGradeBookData = (
    schoolId: string | undefined,
    selectedClass: string,
    selectedRoom: string,
    selectedSemester: string,
    selectedCourse: string,
    selectedGroup: string,
    currentCourse: Course | undefined,
    academicYear: string,
    _attendancePages: any[],
    calculateGrade: (total: number) => string,
    activeTab?: 'grades' | 'characteristics' | 'readingWriting',
    modifiedStudentIds?: Set<string>
) => {
    const [students, setStudents] = useState<Student[]>([]);
    const [grades, setGrades] = useState<Record<string, GradeRecord>>({});
    const [loading, setLoading] = useState(false);
    const [studentCourseDailyStatus, setStudentCourseDailyStatus] = useState<Record<string, Record<string, 'present' | 'absent' | 'late' | 'leave' | 'escape'>>>({});
    const [sdqMap, setSdqMap] = useState<Record<string, SDQAssessment>>({});
    const [isRealTimeConnected, setIsRealTimeConnected] = useState(false);

    // References for stable listeners without causing listener unmount/re-subscription churn
    const suppressSnapshotRef = useRef(false);
    const lastServerGradesRef = useRef<Record<string, any>>({});
    const lastAttendanceRecordsRef = useRef<ClassroomAttendanceRecord[]>([]);
    const studentProfileCacheRef = useRef<Map<string, Student>>(new Map());

    const studentsRef = useRef<Student[]>(students);
    studentsRef.current = students;

    const currentCourseRef = useRef<Course | undefined>(currentCourse);
    currentCourseRef.current = currentCourse;

    const calculateGradeRef = useRef(calculateGrade);
    calculateGradeRef.current = calculateGrade;

    const modifiedStudentIdsRef = useRef<Set<string>>(modifiedStudentIds || new Set());
    modifiedStudentIdsRef.current = modifiedStudentIds || new Set();

    // Helper: Recompute grades from in-memory server snapshot cache without Firestore reads
    const recomputeGradesFromMemory = useCallback(() => {
        const rawDocs = Object.entries(lastServerGradesRef.current).map(([id, data]) => ({ id, data }));
        if (rawDocs.length === 0 || studentsRef.current.length === 0) return;

        const processed = processGradesSnapshot(rawDocs, studentsRef.current, currentCourseRef.current, calculateGradeRef.current);
        setGrades(prev => {
            const next = { ...prev };
            const modified = modifiedStudentIdsRef.current;
            Object.entries(processed).forEach(([studentId, record]) => {
                if (!modified.has(studentId)) {
                    next[studentId] = record;
                }
            });
            return next;
        });
    }, []);

    // Helper: Recompute daily attendance from in-memory records without Firestore reads
    const recomputeDailyStatusFromMemory = useCallback(() => {
        if (lastAttendanceRecordsRef.current.length === 0 || studentsRef.current.length === 0) return;
        const statusMap = processAttendanceRecords(lastAttendanceRecordsRef.current, studentsRef.current);
        setStudentCourseDailyStatus(statusMap);
    }, []);

    // 1. Real-time Student & Enrollment synchronization
    useEffect(() => {
        if (!schoolId) {
            setStudents([]);
            setGrades({});
            return;
        }

        const hasCourseSelected = !!selectedCourse;
        const hasClassFilter = !!selectedClass;

        if (!hasCourseSelected && !hasClassFilter) {
            setStudents([]);
            setGrades({});
            return;
        }

        setLoading(true);

        // CASE A: Course is selected -> Real-time listener on enrollments for this course
        if (hasCourseSelected) {
            const enrollmentsRef = collection(db, 'school-settings', schoolId, 'enrollments');
            const constraints = [
                where('courseId', '==', selectedCourse),
                where('academicYear', '==', String(academicYear || ''))
            ];

            if (selectedGroup) {
                constraints.push(where('groupName', '==', selectedGroup));
            }

            const isAnnualCourse = currentCourse?.semester === '1-2' || currentCourse?.semester === 'annual' || currentCourse?.semester === '0';
            if (!isAnnualCourse && selectedSemester && selectedSemester !== 'annual' && selectedSemester !== '0') {
                constraints.push(where('semester', '==', selectedSemester));
            }

            const qEnrollments = query(enrollmentsRef, ...constraints);

            const unsubscribeEnrollments = onSnapshot(qEnrollments, async (enrollSnap) => {
                if (enrollSnap.empty) {
                    setStudents([]);
                    setLoading(false);
                    return;
                }

                const enrolledStudentIds = Array.from(new Set(enrollSnap.docs.map(d => d.data().studentId as string).filter(Boolean)));
                const enrolledAtMap: Record<string, string | undefined> = {};

                enrollSnap.docs.forEach(d => {
                    const data = d.data();
                    const sid = data.studentId as string;
                    const explicitEnrolledAt = toISODateString(data.enrolledDate || data.enrolledAt);
                    if (!sid || !explicitEnrolledAt) return;
                    if (!enrolledAtMap[sid] || explicitEnrolledAt < enrolledAtMap[sid]!) {
                        enrolledAtMap[sid] = explicitEnrolledAt;
                    }
                });

                // Check in-memory cache for existing student profiles to save Firestore reads
                const missingIds = enrolledStudentIds.filter(id => !studentProfileCacheRef.current.has(id));

                if (missingIds.length > 0) {
                    const studentsRefCol = collection(db, 'school-settings', schoolId, 'students');
                    const batchSize = 30;

                    for (let i = 0; i < missingIds.length; i += batchSize) {
                        const batchIds = missingIds.slice(i, i + batchSize);
                        if (batchIds.length === 0) continue;

                        const qBatch = query(studentsRefCol, where('__name__', 'in', batchIds));
                        const batchSnap = await getDocs(qBatch);
                        batchSnap.forEach(snap => {
                            const data = snap.data();
                            const studentObj: Student = {
                                id: snap.id,
                                ...data,
                                studentNumber: String(data.number ?? data.classNumber ?? data.no ?? data.studentNumber ?? ""),
                                studentId: String(data.studentCode ?? data.studentId ?? snap.id ?? ""),
                                room: data.room || "",
                            } as Student;
                            studentProfileCacheRef.current.set(snap.id, studentObj);
                        });
                    }
                }

                // Build student list using cached profiles + live enrollment metadata
                const studentList: Student[] = enrolledStudentIds.map(id => {
                    const cached = studentProfileCacheRef.current.get(id);
                    if (!cached) return null;
                    return {
                        ...cached,
                        enrolledAt: enrolledAtMap[id]
                    };
                }).filter(Boolean) as Student[];

                const processed = processAndSortStudents(studentList, selectedRoom);
                setStudents(processed);
                setLoading(false);
            }, (err) => {
                console.error("Error subscribing to enrollments:", err);
                setLoading(false);
            });

            return () => unsubscribeEnrollments();
        }

        // CASE B: No course selected yet, but class filter selected -> fetch from room
        const classTitle = CLASSES[selectedClass] || selectedClass;
        const studentsRefCol = collection(db, 'school-settings', schoolId, 'students');
        let qStudents = query(studentsRefCol, where('classLevel', '==', classTitle));
        if (selectedRoom && selectedRoom !== 'all') {
            qStudents = query(studentsRefCol, where('classLevel', '==', classTitle), where('room', '==', selectedRoom));
        }

        getDocs(qStudents).then(studentSnap => {
            const studentList = studentSnap.docs.map(docSnap => {
                const data = docSnap.data();
                const studentObj: Student = {
                    id: docSnap.id,
                    ...data,
                    studentNumber: String(data.number || data.classNumber || data.no || data.studentNumber || ""),
                    studentId: String(data.studentCode || data.studentId || docSnap.id || ""),
                    room: data.room || ""
                } as Student;
                studentProfileCacheRef.current.set(docSnap.id, studentObj);
                return studentObj;
            });
            setStudents(processAndSortStudents(studentList, selectedRoom));
            setLoading(false);
        }).catch(err => {
            console.error("Error fetching class students:", err);
            setLoading(false);
        });

    }, [schoolId, selectedClass, selectedCourse, selectedGroup, selectedRoom, academicYear, selectedSemester, currentCourse?.semester]);

    // When students list changes, immediately recompute grades & attendance from existing cache (0 reads)
    useEffect(() => {
        recomputeGradesFromMemory();
        recomputeDailyStatusFromMemory();
    }, [students, recomputeGradesFromMemory, recomputeDailyStatusFromMemory]);

    // Clear grades and caches when switching course
    useEffect(() => {
        setGrades({});
        lastServerGradesRef.current = {};
    }, [selectedCourse, selectedGroup, selectedClass, selectedRoom, schoolId]);

    // 2. Stable Real-time Grades Listener
    // Note: Depends strictly on [schoolId, selectedCourse].
    // Does NOT tear down when students or currentCourse references change!
    useEffect(() => {
        if (!schoolId || !selectedCourse) {
            setIsRealTimeConnected(false);
            return;
        }

        const gradesRef = collection(db, 'school-settings', schoolId, 'courses', selectedCourse, 'grades');
        setIsRealTimeConnected(true);

        const unsubscribe = onSnapshot(gradesRef, (gradeSnap: QuerySnapshot<DocumentData>) => {
            // Ignore snapshot if explicitly suppressed or if it originates from local uncommitted writes
            if (suppressSnapshotRef.current) {
                suppressSnapshotRef.current = false;
                return;
            }
            if (gradeSnap.metadata.hasPendingWrites) {
                return;
            }

            // Update in-memory server snapshot cache
            const newServerGrades: Record<string, any> = {};
            const rawDocs: { id: string; data: any }[] = [];
            gradeSnap.forEach(docSnap => {
                const data = docSnap.data();
                newServerGrades[docSnap.id] = data;
                rawDocs.push({ id: docSnap.id, data });
            });
            lastServerGradesRef.current = newServerGrades;

            // Process scores with latest references
            const currentStudents = studentsRef.current;
            if (currentStudents.length === 0) return;

            const processedGrades = processGradesSnapshot(
                rawDocs,
                currentStudents,
                currentCourseRef.current,
                calculateGradeRef.current
            );

            // Merge with local state, preserving any student currently actively being edited
            setGrades(prev => {
                const next = { ...prev };
                const modifiedSet = modifiedStudentIdsRef.current;
                Object.entries(processedGrades).forEach(([studentId, gradeRec]) => {
                    if (!modifiedSet.has(studentId)) {
                        next[studentId] = gradeRec;
                    }
                });
                return next;
            });
        }, (error: Error) => {
            console.error("Error listening to real-time grades:", error);
            setIsRealTimeConnected(false);
        });

        return () => {
            unsubscribe();
            setIsRealTimeConnected(false);
        };
    }, [schoolId, selectedCourse]);

    // 3. Stable Real-time Detailed Attendance Listener
    // Note: Depends strictly on [schoolId, selectedCourse, currentCourse?.code, academicYear, selectedSemester].
    // Does NOT tear down when students array reference changes!
    useEffect(() => {
        if (!schoolId || !selectedCourse) {
            setStudentCourseDailyStatus({});
            lastAttendanceRecordsRef.current = [];
            return;
        }

        const validSubjectCodes = Array.from(new Set([
            selectedCourse,
            (currentCourse?.code || "").trim(),
            (currentCourse?.code || "").replace(/\s/g, ''),
            currentCourse?.id
        ])).filter(Boolean).slice(0, 10) as string[];

        if (validSubjectCodes.length === 0) return;

        const attendanceRef = collectionGroup(db, 'ClassroomAttendance');
        const attendanceConstraints = [
            where('schoolId', '==', schoolId),
            where('subjectCode', 'in', validSubjectCodes),
            where('academicYear', '==', String(academicYear || '')),
            ...(selectedSemester && selectedSemester !== 'annual' && selectedSemester !== '0'
                ? [where('semester', '==', selectedSemester)]
                : [])
        ];
        const qSubj = query(attendanceRef, ...attendanceConstraints);

        const unsubscribe = onSnapshot(qSubj, (snap: QuerySnapshot<DocumentData>) => {
            if (snap.metadata.hasPendingWrites) return;

            const attendanceRecords: ClassroomAttendanceRecord[] = [];
            snap.forEach(docSnap => {
                attendanceRecords.push({ ...(docSnap.data() as ClassroomAttendanceRecord), id: docSnap.id });
            });
            lastAttendanceRecordsRef.current = attendanceRecords;

            // Recompute status for students
            const currentStudents = studentsRef.current;
            if (currentStudents.length > 0) {
                const statusMap = processAttendanceRecords(attendanceRecords, currentStudents);
                setStudentCourseDailyStatus(statusMap);
            }
        }, (err) => {
            console.error("Attendance listener error:", err);
            setStudentCourseDailyStatus({});
            lastAttendanceRecordsRef.current = [];
        });

        return () => unsubscribe();
    }, [schoolId, selectedCourse, currentCourse?.code, academicYear, selectedSemester]);

    // 4. Lazy & Cached SDQ Map
    // Only loads when user is in the 'characteristics' tab or when already cached
    useEffect(() => {
        if (!schoolId || students.length === 0 || !academicYear) {
            setSdqMap({});
            return;
        }

        const cacheKey = `${schoolId}_${academicYear}`;
        if (sdqGlobalCache[cacheKey]) {
            setSdqMap(sdqGlobalCache[cacheKey]);
            return;
        }

        // Only query Firestore if user is actively on the characteristics tab
        if (activeTab && activeTab !== 'characteristics') {
            return;
        }

        let isCancelled = false;
        const fetchSDQ = async () => {
            try {
                const map = await getLatestSDQForStudents(schoolId, students.map(s => s.id), academicYear);
                sdqGlobalCache[cacheKey] = map;
                if (!isCancelled) {
                    setSdqMap(map);
                }
            } catch (err) {
                console.error("SDQ fetch error:", err);
            }
        };

        fetchSDQ();
        return () => { isCancelled = true; };
    }, [schoolId, students, academicYear, activeTab]);

    return {
        students,
        grades,
        setGrades,
        loading,
        studentCourseDailyStatus,
        sdqMap,
        suppressSnapshotRef,
        lastServerGradesRef,
        isRealTimeConnected
    };
};
