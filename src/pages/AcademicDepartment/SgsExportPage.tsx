import React, { useState, useEffect, useMemo, useRef } from "react";
import { useSearchParams } from "react-router-dom";
import { useDispatch, useSelector } from "react-redux";
import { fetchCalendar } from "@/store/slices/calendarSlice";
import { fetchTeachersMap } from "@/store/slices/userMapSlice";
import BackButton from "@/components/Shared/BackButton";
import { RootState } from "@/store";
import { usePermissions } from "@/hooks/usePermissions";
import { ROLES } from "@/constants/roles";
import { firestore as db } from "@/firebase";
import { collection, query, where, getDocs, doc, getDoc, addDoc, writeBatch, serverTimestamp } from "firebase/firestore";
import MainLayout from "@/layouts/MainLayout";
import * as XLSX from "xlsx";
import {
    FileSpreadsheet,
    Building2,
    Download,
    Search,
    Info,
    AlertCircle,
    Loader2,
    Users,
    ChevronDown,
    FlaskConical,
    Save,
    Eraser,
} from "lucide-react";
import { CLASSES, CLASS_FULL_NAMES, getClassOptionsBySchoolSettings } from "@/utils/schoolUtils";
import { getStudentStatus, ACTIVE_STUDENT_STATUS } from "@/utils/studentStatusUtils";
import Swal from "sweetalert2";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface Student {
    id: string;
    firstName: string;
    lastName: string;
    studentNumber: string;
    room: string;
    studentId?: string;
    title?: string;
}

interface AssessmentItem {
    id?: string;
    name: string;
    maxScore: number;
    term: "pre-midterm" | "post-midterm";
}

interface TeacherAssignment {
    teacherId?: string;
    groupNumber?: number;
}

interface Course {
    id: string;
    code: string;
    title: string;
    classId: string | string[];
    room?: string[];
    formativeAssessments?: AssessmentItem[];
    midtermWeight?: number;
    finalWeight?: number;
    semester?: string;
    teacherId?: string | string[];
    teacherIds?: string[];
    teacherAssignments?: TeacherAssignment[];
}

interface GradeRecord {
    midterm?: number | string;
    final?: number | string;
    status?: string;
    formativeDetails?: Record<string, number | string>;
}

type ResultStatus = "ปกติ" | "แก้ตัว" | "เรียนซ้ำ";

// ---------------------------------------------------------------------------
// SGS column headers (columns 1-38, exact order)
// ---------------------------------------------------------------------------

const SGS_HEADERS: string[] = [
    "วิชา",
    "กลุ่ม",
    "เลขประจำตัว ชื่อ-นามสกุล",
    "1", "2", "3", "4", "5", "6", "7", "8", "9",
    "ก่อนกลางภาค",
    "10", "11", "12", "13", "14", "15", "16", "17", "18",
    "หลังกลางภาค",
    "รวมตลอดภาค",
    "กลางภาค",
    "ปลายภาค",
    "Total",
    "%",
    "ปกติ",
    "แก้ตัว",
    "เรียนซ้ำ",
    "Grade",
    "Remark",
    "เลขประจำตัว",
    "ชื่อ-นามสกุล",
    "ห้อง",
    "เลขที่",
    "ผู้สอน",
];

const SGS_COL_WIDTHS: number[] = [
    10, 10, 32,
    5, 5, 5, 5, 5, 5, 5, 5, 5,
    11,
    5, 5, 5, 5, 5, 5, 5, 5, 5,
    11, 12, 10, 10, 9, 8,
    8, 8, 10,
    8, 24,
    14, 26, 10, 8, 22,
];

// ---------------------------------------------------------------------------
// Helpers (mirrors FormativeScoreEntryPage / PostMidtermScoreEntryPage conventions)
// ---------------------------------------------------------------------------

// Matches StudentListPage's own local `isStudying` check exactly
// (/school/{schoolId}/students) — a blank/missing status field defaults to
// ACTIVE_STUDENT_STATUS via getStudentStatus, so it counts as "studying".
const isCurrentlyStudying = (student: unknown): boolean => getStudentStatus(student as any) === ACTIVE_STUDENT_STATUS;

const normalizeRoom = (room: unknown) => {
    const value = String(room ?? "").trim();
    if (!value) return "";
    const numeric = Number(value);
    return Number.isFinite(numeric) ? String(numeric) : value.toLowerCase();
};

const courseMatchesRoom = (courseRooms: unknown, selectedRoom: string) => {
    if (!selectedRoom || selectedRoom === "all") return true;
    if (!Array.isArray(courseRooms) || courseRooms.length === 0) return true;
    const normalizedRooms = courseRooms.map((room) => normalizeRoom(room));
    return normalizedRooms.includes("all") || normalizedRooms.includes(normalizeRoom(selectedRoom));
};

const matchesLevel = (courseClassId: any, selectedLevel: any): boolean => {
    if (!selectedLevel || selectedLevel === "ทั้งหมด") return true;
    if (!courseClassId) return false;
    if (Array.isArray(courseClassId)) {
        return courseClassId.some((level) => matchesLevel(level, selectedLevel));
    }
    const normalizedId = String(courseClassId).toLowerCase().trim();
    const normalizedSelected = String(selectedLevel || "").toLowerCase().trim();
    if (normalizedId === normalizedSelected) return true;
    const gradeMap: Record<string, string[]> = {
        k1: ["k1", "อนุบาล 1", "อ.1"], k2: ["k2", "อนุบาล 2", "อ.2"], k3: ["k3", "อนุบาล 3", "อ.3"],
        p1: ["p1", "ป.1"], p2: ["p2", "ป.2"], p3: ["p3", "ป.3"],
        p4: ["p4", "ป.4"], p5: ["p5", "ป.5"], p6: ["p6", "ป.6"],
        m1: ["m1", "ม.1"], m2: ["m2", "ม.2"], m3: ["m3", "ม.3"],
        m4: ["m4", "ม.4"], m5: ["m5", "ม.5"], m6: ["m6", "ม.6"],
    };
    for (const [id, labels] of Object.entries(gradeMap)) {
        if (id === normalizedSelected || labels.includes(normalizedSelected)) {
            return labels.includes(normalizedId) || id === normalizedId;
        }
    }
    return false;
};

const allClassOptions = Object.entries(CLASSES) as [string, string][];

const calculateGrade = (total: number): string => {
    if (total >= 80) return "4";
    if (total >= 75) return "3.5";
    if (total >= 70) return "3";
    if (total >= 65) return "2.5";
    if (total >= 60) return "2";
    if (total >= 55) return "1.5";
    if (total >= 50) return "1";
    return "0";
};

const getDefaultResultStatus = (status: string | undefined, grade: string): ResultStatus => {
    if (status === "มส" || status === "ร") return "แก้ตัว";
    if (grade === "0") return "แก้ตัว";
    return "ปกติ";
};

const getRemark = (status: string | undefined): string => {
    if (status === "ร") return "อยู่ระหว่างดำเนินการ (ร)";
    if (status === "มส") return "ไม่มีสิทธิ์สอบ (มส)";
    return "";
};

// ---------------------------------------------------------------------------
// School MIS grade-report import/export
// ---------------------------------------------------------------------------
// File format reverse-engineered from a real exported sample
// ("คะแนน_ป.1_ห้อง_1_ปี2569.csv"): UTF-8 with BOM, comma-delimited, unquoted
// fields, one file per classroom+academicYear. Header: #, รหัสนักเรียน,
// ชื่อ-สกุล, then one column per subject formatted as "{code} {title}"
// (e.g. "ท11101 ภาษาไทย1"). Name field uses the SPELLED-OUT honorific
// ("เด็กชาย"/"เด็กหญิง"/"นางสาว"), not our DB's abbreviated form ("ด.ช./ด.ญ./น.ส.").

interface MisCourse {
    id: string;
    code: string;
    title: string;
    classId: string | string[];
    semester?: string;
}

interface MisStudent {
    id: string;
    studentCode: string;
    studentNumber: string;
    title?: string;
    firstName: string;
    lastName: string;
    room: string;
}

// Thai MOE subject codes follow {consonant}{stage}{year}{seq3} — e.g. "ท11101":
// ท=Thai, stage=1, year=1 (ป.1), seq="101". The year digit changes across grade
// levels (ท12101 for ป.2) but consonant+seq stays stable, so that pair gives a
// year-independent sort key matching the ministry's standard subject ordering.
const SUBJECT_TYPE_ORDER: Record<string, number> = {
    "ท101": 1, "ค101": 2, "ว101": 3, "ส101": 4, "ส102": 5,
    "พ101": 6, "ศ101": 7, "ง101": 8, "อ101": 9, "ส221": 10,
};

const getSubjectSortKey = (code: string): string => {
    const match = /^(\S)(\d)(\d)(\d{3})$/.exec(code.trim());
    if (!match) return code.trim();
    const [, consonant, , , seq] = match;
    return `${consonant}${seq}`;
};

const getSubjectPriority = (code: string): number => SUBJECT_TYPE_ORDER[getSubjectSortKey(code)] ?? 999;

const sortMisCourses = (courses: MisCourse[]): MisCourse[] =>
    [...courses].sort((a, b) => {
        const diff = getSubjectPriority(a.code) - getSubjectPriority(b.code);
        return diff !== 0 ? diff : a.code.localeCompare(b.code);
    });

const FULL_TITLE_MAP: Record<string, string> = {
    "ด.ช.": "เด็กชาย",
    "ด.ญ.": "เด็กหญิง",
    "นาย": "นาย",
    "น.ส.": "นางสาว",
    "สามเณร": "สามเณร",
};

const getFullTitle = (title?: string) => FULL_TITLE_MAP[String(title || "").trim()] || String(title || "").trim();

const buildMisFullName = (title?: string, firstName?: string, lastName?: string) =>
    `${getFullTitle(title)}${(firstName || "").trim()} ${(lastName || "").trim()}`.replace(/\s+/g, " ").trim();

const CSV_BOM = "﻿";

const csvEscapeField = (value: unknown): string => {
    const str = String(value ?? "");
    if (/[",\n\r]/.test(str)) return `"${str.replace(/"/g, '""')}"`;
    return str;
};

const buildCsv = (headers: string[], rows: (string | number)[][]): string => {
    const lines = [headers, ...rows].map((row) => row.map(csvEscapeField).join(","));
    return CSV_BOM + lines.join("\r\n");
};

const downloadCsv = (filename: string, csvContent: string) => {
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
};

interface ExportRow {
    studentId: string;
    weeklyPre: (number | "")[];
    weeklyPost: (number | "")[];
    preMidtermSubtotal: number;
    postMidtermSubtotal: number;
    grandTotalFormative: number;
    midterm: number;
    final: number;
    total: number;
    percent: number | "";
    grade: string;
    remark: string;
    studentCode: string;
    fullName: string;
    room: string;
    studentNumber: string;
    groupLabel: string;
    teacherName: string;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

const SgsExportPage: React.FC = () => {
    const [activeMenu, setActiveMenu] = useState<"sgs" | "mis">("sgs");
    const [searchParams, setSearchParams] = useSearchParams();
    const currentUser = useSelector((state: RootState) => state.auth.user);
    const schoolId = (currentUser as any)?.schoolId;
    const dispatch = useDispatch();

    const { isSchoolAdmin, isAcademicAdmin, isSuperAdmin, hasRole } = usePermissions();
    const { teachers: teacherMap, status: teacherMapStatus } = useSelector((state: RootState) => state.userMap);
    const isSchoolLeadership = hasRole([ROLES.DIRECTOR, ROLES.DEPT_HEAD]);

    const userPrivileges = useMemo(() => {
        const teacherProfiles = Object.values(teacherMap || {}).filter((t: any) => t.uid === currentUser?.uid);
        const teacherProfile = teacherProfiles[0] as any;
        const isHead = teacherProfile?.isHeadOfLearningArea || teacherProfile?.isHeadOfAssessment;
        const isAdmin = isSchoolAdmin || isSuperAdmin || isAcademicAdmin || isSchoolLeadership;
        return {
            canSeeAll: isAdmin || isHead,
            myTeacherIds: teacherProfiles.map((t: any) => t.id),
        };
    }, [currentUser, teacherMap, isSchoolAdmin, isSuperAdmin, isAcademicAdmin, isSchoolLeadership]);

    const { academicYear: calYear, status: calendarStatus } = useSelector((state: RootState) => state.calendar);
    const [academicYear, setAcademicYear] = useState<string>("");

    useEffect(() => {
        if (schoolId && calendarStatus === "idle") dispatch(fetchCalendar(schoolId) as any);
        if (schoolId && teacherMapStatus === "idle") dispatch(fetchTeachersMap(schoolId) as any);
    }, [schoolId, calendarStatus, teacherMapStatus, dispatch]);

    useEffect(() => {
        if (calendarStatus === "succeeded" && calYear) setAcademicYear(calYear);
    }, [calendarStatus, calYear]);

    // Filters
    const [selectedLevel, setSelectedLevel] = useState(searchParams.get("level") || "");
    const [selectedRoom, setSelectedRoom] = useState(searchParams.get("room") || "");
    const [selectedSemester, setSelectedSemester] = useState(searchParams.get("semester") || "");
    const [selectedCourseId, setSelectedCourseId] = useState(searchParams.get("courseId") || "");
    const [selectedGroup, setSelectedGroup] = useState(searchParams.get("groupId") || "");
    const [searchTerm, setSearchTerm] = useState("");
    const [availableClassOptions, setAvailableClassOptions] = useState<[string, string][]>(allClassOptions);

    const [courses, setCourses] = useState<Course[]>([]);
    const [registeredCourseIds, setRegisteredCourseIds] = useState<Set<string> | null>(null);
    const [semesterAssignments, setSemesterAssignments] = useState<Record<string, TeacherAssignment[]>>({});
    const [availableGroups, setAvailableGroups] = useState<{ id: string; label: string }[]>([]);
    const [students, setStudents] = useState<Student[]>([]);
    const [grades, setGrades] = useState<Record<string, GradeRecord>>({});
    const [studentGroupMap, setStudentGroupMap] = useState<Record<string, string>>({});
    const [isLoading, setIsLoading] = useState(false);
    const [isExporting, setIsExporting] = useState(false);
    const [resultOverrides, setResultOverrides] = useState<Record<string, ResultStatus>>({});
    const fetchRequestRef = useRef(0);

    // School MIS grade-report state — sourced the same way as the ปพ.5 Grade Book
    // (/academic/grade-book?semester=...): courses scoped by classLevel + semester.
    const [misLevel, setMisLevel] = useState(searchParams.get("misLevel") || "");
    const [misRoom, setMisRoom] = useState(searchParams.get("misRoom") || "");
    const [misSemester, setMisSemester] = useState(searchParams.get("misSemester") || "1");
    const [misCourses, setMisCourses] = useState<MisCourse[]>([]);
    const [misStudents, setMisStudents] = useState<MisStudent[]>([]);
    const [misGrades, setMisGrades] = useState<Record<string, Record<string, string>>>({});
    const [misEdits, setMisEdits] = useState<Record<string, string>>({});
    const [isMisLoading, setIsMisLoading] = useState(false);
    const [isMisSaving, setIsMisSaving] = useState(false);

    useEffect(() => {
        if (!schoolId) return;
        const fetchSchoolClassOptions = async () => {
            try {
                const schoolSnap = await getDoc(doc(db, "school-settings", schoolId));
                if (!schoolSnap.exists()) {
                    setAvailableClassOptions(allClassOptions);
                    return;
                }
                const data = schoolSnap.data();
                const options = getClassOptionsBySchoolSettings(data.opportunityExpansionLevel || "", data.schoolType || "");
                setAvailableClassOptions(options.length > 0 ? options : allClassOptions);
            } catch (err) {
                console.error("Error fetching school class options:", err);
                setAvailableClassOptions(allClassOptions);
            }
        };
        fetchSchoolClassOptions();
    }, [schoolId]);

    // Fetch courses
    useEffect(() => {
        if (!schoolId) return;
        const fetchCourses = async () => {
            const coursesRef = collection(db, "school-settings", schoolId, "courses");
            const snap = await getDocs(query(coursesRef));
            setCourses(
                snap.docs
                    .map((d) => ({ id: d.id, ...d.data() } as Course))
                    .filter((course) => (course as any).isActive !== false)
            );
        };
        fetchCourses();
    }, [schoolId]);

    // A course only counts as "registered" (and is shown in SGS/School MIS subject lists) if it
    // has actually gone through /academic/course-assignment, /academic/course-assignment-2
    // (both write school-settings/{schoolId}/course_assignments/{courseId}_{year}_{semester},
    // with teacherAssignments left as an empty array rather than the doc being deleted when
    // unassigned — so existence alone isn't enough, teacherAssignments must be non-empty), or
    // /academic/course-enrollment (school-settings/{schoolId}/enrollments). Scoped only by
    // academicYear (not semester) so annual-vs-termed courses both resolve correctly.
    useEffect(() => {
        if (!schoolId || !academicYear) {
            setRegisteredCourseIds(null);
            return;
        }
        let cancelled = false;
        const fetchRegisteredCourseIds = async () => {
            try {
                const [assignmentSnap, enrollmentSnap] = await Promise.all([
                    getDocs(query(collection(db, "school-settings", schoolId, "course_assignments"), where("academicYear", "==", String(academicYear)))),
                    getDocs(query(collection(db, "school-settings", schoolId, "enrollments"), where("academicYear", "==", String(academicYear)))),
                ]);
                const ids = new Set<string>();
                assignmentSnap.docs.forEach((d) => {
                    const data = d.data();
                    if (Array.isArray(data.teacherAssignments) && data.teacherAssignments.length > 0 && data.courseId) ids.add(data.courseId);
                });
                enrollmentSnap.docs.forEach((d) => {
                    const courseId = d.data().courseId;
                    if (courseId) ids.add(courseId);
                });
                if (!cancelled) setRegisteredCourseIds(ids);
            } catch (err) {
                console.error(err);
                if (!cancelled) setRegisteredCourseIds(new Set());
            }
        };
        fetchRegisteredCourseIds();
        return () => { cancelled = true; };
    }, [schoolId, academicYear]);

    // Fetch semester-scoped teacher assignments (source of truth for current-term teacher-of-record)
    useEffect(() => {
        if (!schoolId || !academicYear) {
            setSemesterAssignments({});
            return;
        }
        const fetchAssignments = async () => {
            const assignmentsRef = collection(db, "school-settings", schoolId, "course_assignments");
            const constraints = [
                where("academicYear", "==", String(academicYear)),
                ...(selectedSemester && selectedSemester !== "annual" ? [where("semester", "==", String(selectedSemester))] : []),
            ];
            const snap = await getDocs(query(assignmentsRef, ...constraints));
            const mapping: Record<string, TeacherAssignment[]> = {};
            snap.docs.forEach((d) => {
                const data = d.data();
                mapping[data.courseId] = [...(mapping[data.courseId] || []), ...(data.teacherAssignments || [])];
            });
            setSemesterAssignments(mapping);
        };
        fetchAssignments();
    }, [schoolId, academicYear, selectedSemester]);

    const currentCourse = useMemo(() => courses.find((c) => c.id === selectedCourseId), [courses, selectedCourseId]);

    const filteredCourses = useMemo(() => {
        if (!registeredCourseIds) return [];
        return courses.filter((c) => {
            if (!registeredCourseIds.has(c.id)) return false;
            if (selectedLevel && !matchesLevel(c.classId, selectedLevel)) return false;
            if (!courseMatchesRoom(c.room, selectedRoom)) return false;
            if (selectedSemester) {
                const isAnnualCourse = c.semester === "1-2" || c.semester === "annual" || c.semester === "0" || !c.semester;
                if (!isAnnualCourse && c.semester !== selectedSemester) return false;
            }

            const courseTeacherIds = new Set<string>();
            const structuredAssignments = (semesterAssignments[c.id]?.length ? semesterAssignments[c.id] : c.teacherAssignments) || [];
            if (structuredAssignments.length > 0) {
                structuredAssignments.forEach((a) => { if (a.teacherId) courseTeacherIds.add(a.teacherId); });
            } else {
                [
                    ...(Array.isArray(c.teacherId) ? c.teacherId : c.teacherId ? [c.teacherId] : []),
                    ...(c.teacherIds || []),
                ]
                    .filter((id) => id.toLowerCase() !== "pending")
                    .forEach((id) => courseTeacherIds.add(id));
            }

            const myIds = userPrivileges.myTeacherIds || [];
            if (!userPrivileges.canSeeAll) {
                const isMyCourse = myIds.length > 0 && myIds.some((id: string) => courseTeacherIds.has(id));
                if (!isMyCourse) return false;
            }

            if (searchTerm.trim()) {
                const term = searchTerm.toLowerCase().trim();
                return c.code.toLowerCase().includes(term) || c.title.toLowerCase().includes(term);
            }
            return true;
        });
    }, [courses, selectedLevel, selectedRoom, selectedSemester, searchTerm, userPrivileges, semesterAssignments, registeredCourseIds]);

    // Fetch groups for the selected course
    useEffect(() => {
        const fetchGroups = async () => {
            if (!schoolId || !selectedCourseId || !academicYear) {
                setAvailableGroups([]);
                return;
            }
            const constraints = [where("courseId", "==", selectedCourseId), where("academicYear", "==", academicYear)];
            if (selectedSemester && selectedSemester !== "annual" && selectedSemester !== "0") {
                constraints.push(where("semester", "==", selectedSemester));
            }
            const snap = await getDocs(query(collection(db, "school-settings", schoolId, "enrollments"), ...constraints));
            const groupNames = Array.from(new Set(snap.docs.map((d) => d.data().groupName as string).filter(Boolean)));
            setAvailableGroups(groupNames.sort().map((name) => ({ id: name, label: name })));
        };
        fetchGroups();
    }, [schoolId, selectedCourseId, selectedSemester, academicYear]);

    // Sync filters to URL
    useEffect(() => {
        const params = new URLSearchParams();
        if (selectedLevel) params.set("level", selectedLevel);
        if (selectedRoom) params.set("room", selectedRoom);
        if (selectedSemester) params.set("semester", selectedSemester);
        if (selectedCourseId) params.set("courseId", selectedCourseId);
        if (selectedGroup) params.set("groupId", selectedGroup);
        if (misLevel) params.set("misLevel", misLevel);
        if (misRoom) params.set("misRoom", misRoom);
        if (misSemester) params.set("misSemester", misSemester);
        const newStr = params.toString();
        if (newStr !== searchParams.toString()) setSearchParams(params, { replace: true });
    }, [selectedLevel, selectedRoom, selectedSemester, selectedCourseId, selectedGroup, misLevel, misRoom, misSemester, searchParams, setSearchParams]);

    // Fetch students, grades and enrollment group labels
    useEffect(() => {
        const requestId = ++fetchRequestRef.current;
        if (!schoolId || !selectedLevel || !selectedCourseId) {
            setStudents([]);
            setGrades({});
            setStudentGroupMap({});
            setIsLoading(false);
            return;
        }

        setIsLoading(true);
        const fetchAll = async () => {
            try {
                const studentsRef = collection(db, "school-settings", schoolId, "students");
                const enrollmentsRef = collection(db, "school-settings", schoolId, "enrollments");
                const enrollmentConstraints = [where("courseId", "==", selectedCourseId), where("academicYear", "==", academicYear)];
                if (selectedGroup && selectedGroup !== "all") enrollmentConstraints.push(where("groupName", "==", selectedGroup));
                if (selectedSemester && selectedSemester !== "annual" && selectedSemester !== "0") {
                    const isAnnualCourse = currentCourse?.semester === "1-2" || currentCourse?.semester === "annual" || currentCourse?.semester === "0";
                    if (!isAnnualCourse && currentCourse?.semester) enrollmentConstraints.push(where("semester", "==", selectedSemester));
                }

                const [enrollSnap, gradeSnap] = await Promise.all([
                    getDocs(query(enrollmentsRef, ...enrollmentConstraints)),
                    getDocs(collection(db, "school-settings", schoolId, "courses", selectedCourseId, "grades")),
                ]);

                const groupMap: Record<string, string> = {};
                enrollSnap.docs.forEach((d) => {
                    const data = d.data();
                    if (data.studentId) groupMap[data.studentId] = data.groupName || "";
                });

                let studentList: Student[] = [];
                const enrolledStudentIds = Array.from(new Set(enrollSnap.docs.map((d) => d.data().studentId as string).filter(Boolean)));

                for (let i = 0; i < enrolledStudentIds.length; i += 30) {
                    const batchIds = enrolledStudentIds.slice(i, i + 30);
                    if (batchIds.length === 0) continue;
                    const batchSnap = await getDocs(query(studentsRef, where("__name__", "in", batchIds)));
                    batchSnap.forEach((d) => {
                        const data = d.data();
                        studentList.push({
                            id: d.id,
                            ...data,
                            studentNumber: String(data.number || data.classNumber || data.no || data.studentNumber || ""),
                            studentId: String(data.studentCode || data.studentId || d.id || ""),
                            room: data.room || "",
                        } as Student);
                    });
                }

                if (selectedRoom && selectedRoom !== "all") {
                    studentList = studentList.filter((s) => normalizeRoom(s.room) === normalizeRoom(selectedRoom));
                }

                studentList = studentList.filter(isCurrentlyStudying);
                studentList.sort((a, b) => (parseInt(a.studentNumber) || 0) - (parseInt(b.studentNumber) || 0));

                const gradeMap: Record<string, GradeRecord> = {};
                gradeSnap.forEach((d) => { gradeMap[d.id] = d.data() as GradeRecord; });

                if (requestId !== fetchRequestRef.current) return;
                setStudents(studentList);
                setGrades(gradeMap);
                setStudentGroupMap(groupMap);
            } catch (err) {
                console.error(err);
            } finally {
                if (requestId === fetchRequestRef.current) setIsLoading(false);
            }
        };

        fetchAll();
    }, [schoolId, selectedLevel, selectedRoom, selectedSemester, selectedCourseId, selectedGroup, academicYear, currentCourse]);

    // Fetch School MIS grade report: subject list for the level + roster for the room + saved grades.
    // Course scoping mirrors /academic/grade-book (useGradeBookData): a course is included
    // if its classLevel matches AND (it's an annual course OR its semester matches misSemester) —
    // same isAnnualCourse rule used across FormativeScoreEntryPage / GradeBookPage.
    // Also waits on `academicYear` (sourced from /academic/school-calendar via fetchCalendar)
    // so enrollment records created on save are never stamped with a blank/wrong year.
    useEffect(() => {
        if (!schoolId || !misLevel || !misRoom || !academicYear || !registeredCourseIds) {
            setMisCourses([]);
            setMisStudents([]);
            setMisGrades({});
            setMisEdits({});
            return;
        }

        let cancelled = false;
        setIsMisLoading(true);
        const fetchMisData = async () => {
            try {
                const [courseSnap, studentSnap] = await Promise.all([
                    getDocs(query(collection(db, "school-settings", schoolId, "courses"))),
                    getDocs(query(
                        collection(db, "school-settings", schoolId, "students"),
                        where("classLevel", "in", Array.from(new Set([misLevel, CLASSES[misLevel], CLASS_FULL_NAMES[misLevel]].filter(Boolean))))
                    )),
                ]);

                const levelCourses = sortMisCourses(
                    courseSnap.docs
                        .map((d) => ({ id: d.id, ...d.data() } as MisCourse & { isActive?: boolean }))
                        .filter((c) => {
                            if (!registeredCourseIds.has(c.id)) return false;
                            if (c.isActive === false || !matchesLevel(c.classId, misLevel)) return false;
                            const isAnnualCourse = c.semester === "1-2" || c.semester === "annual" || c.semester === "0" || !c.semester;
                            if (isAnnualCourse) return true;
                            return !misSemester || misSemester === "annual" || c.semester === misSemester;
                        })
                );

                // Roster logic mirrors /academic/course-enrollment (CourseEnrollmentPage's
                // "sourceStudents"): all students currently studying (isStudyingStudent)
                // whose live classLevel/room match — that page has no per-year student
                // history either, so "current" is the only roster it can produce too.
                let roster: MisStudent[] = studentSnap.docs
                    .filter((d) => isCurrentlyStudying(d.data()))
                    .map((d) => {
                        const data = d.data();
                        return {
                            id: d.id,
                            studentCode: String(data.studentCode || data.studentId || d.id || ""),
                            studentNumber: String(data.number || data.classNumber || data.no || data.studentNumber || ""),
                            title: data.title || "",
                            firstName: data.firstName || "",
                            lastName: data.lastName || "",
                            room: data.room || "",
                        } as MisStudent;
                    })
                    .filter((s) => normalizeRoom(s.room) === normalizeRoom(misRoom));
                roster.sort((a, b) => (parseInt(a.studentNumber) || 0) - (parseInt(b.studentNumber) || 0));

                const gradeSnaps = await Promise.all(
                    levelCourses.map((c) => getDocs(collection(db, "school-settings", schoolId, "courses", c.id, "grades")))
                );
                const gradesByCourse: Record<string, Record<string, string>> = {};
                levelCourses.forEach((c, idx) => {
                    const map: Record<string, string> = {};
                    gradeSnaps[idx].forEach((d) => {
                        const value = d.data().grade;
                        if (value !== undefined && value !== null && value !== "") map[d.id] = String(value);
                    });
                    gradesByCourse[c.id] = map;
                });

                if (cancelled) return;
                setMisCourses(levelCourses);
                setMisStudents(roster);
                setMisGrades(gradesByCourse);
                setMisEdits({});
            } catch (err) {
                console.error(err);
            } finally {
                if (!cancelled) setIsMisLoading(false);
            }
        };

        fetchMisData();
        return () => { cancelled = true; };
    }, [schoolId, misLevel, misRoom, misSemester, academicYear, registeredCourseIds]);

    const getMisCellValue = (courseId: string, studentId: string): string => {
        const key = `${courseId}__${studentId}`;
        if (key in misEdits) return misEdits[key];
        return misGrades[courseId]?.[studentId] || "";
    };

    const handleMisCellChange = (courseId: string, studentId: string, value: string) => {
        setMisEdits((prev) => ({ ...prev, [`${courseId}__${studentId}`]: value }));
    };

    const handleMisClearEdits = () => {
        if (Object.keys(misEdits).length === 0) return;
        Swal.fire({
            icon: "warning",
            title: "ล้างการแก้ไขที่ยังไม่บันทึก?",
            text: "ข้อมูลที่พิมพ์ไว้แต่ยังไม่ได้กดบันทึกจะถูกล้างทั้งหมด (ข้อมูลที่บันทึกแล้วจะไม่หาย)",
            showCancelButton: true,
            confirmButtonText: "ล้างข้อมูล",
            cancelButtonText: "ยกเลิก",
            confirmButtonColor: "#dc2626",
            background: "#1e2235",
            color: "#fff",
        }).then((result) => {
            if (result.isConfirmed) {
                setMisEdits({});
            }
        });
    };

    const handleMisSave = async () => {
        const changedKeys = Object.keys(misEdits);
        if (changedKeys.length === 0) {
            Swal.fire({ icon: "info", title: "ไม่มีการเปลี่ยนแปลงที่ต้องบันทึก", background: "#1e2235", color: "#fff" });
            return;
        }

        setIsMisSaving(true);
        try {
            const courseIdsInvolved = Array.from(new Set(changedKeys.map((k) => k.split("__")[0])));
            const existingEnrollmentsByCourse: Record<string, Set<string>> = {};
            await Promise.all(courseIdsInvolved.map(async (courseId) => {
                const snap = await getDocs(query(
                    collection(db, "school-settings", schoolId, "enrollments"),
                    where("courseId", "==", courseId),
                    where("academicYear", "==", academicYear)
                ));
                existingEnrollmentsByCourse[courseId] = new Set(snap.docs.map((d) => d.data().studentId));
            }));

            const enrollmentsToCreate = changedKeys
                .map((key) => key.split("__"))
                .filter(([courseId, studentId]) => !existingEnrollmentsByCourse[courseId]?.has(studentId));

            await Promise.all(enrollmentsToCreate.map(([courseId, studentId]) => {
                const course = misCourses.find((c) => c.id === courseId);
                const student = misStudents.find((s) => s.id === studentId);
                if (!course || !student) return Promise.resolve();
                return addDoc(collection(db, "school-settings", schoolId, "enrollments"), {
                    studentId,
                    courseId,
                    courseCode: course.code,
                    courseTitle: course.title,
                    academicYear,
                    classLevel: misLevel,
                    room: misRoom,
                    createdAt: serverTimestamp(),
                });
            }));

            for (let i = 0; i < changedKeys.length; i += 400) {
                const chunk = changedKeys.slice(i, i + 400);
                const batch = writeBatch(db);
                chunk.forEach((key) => {
                    const [courseId, studentId] = key.split("__");
                    const ref = doc(db, "school-settings", schoolId, "courses", courseId, "grades", studentId);
                    batch.set(ref, {
                        grade: misEdits[key],
                        updatedAt: serverTimestamp(),
                        updatedBy: (currentUser as any)?.displayName || (currentUser as any)?.email,
                    }, { merge: true });
                });
                await batch.commit();
            }

            setMisGrades((prev) => {
                const next = { ...prev };
                changedKeys.forEach((key) => {
                    const [courseId, studentId] = key.split("__");
                    next[courseId] = { ...(next[courseId] || {}), [studentId]: misEdits[key] };
                });
                return next;
            });
            setMisEdits({});
            Swal.fire({ icon: "success", title: "บันทึกผลการเรียนสำเร็จ", text: `บันทึก ${changedKeys.length} รายการ`, background: "#1e2235", color: "#fff", timer: 1800, showConfirmButton: false });
        } catch (err) {
            console.error(err);
            Swal.fire({ icon: "error", title: "เกิดข้อผิดพลาดในการบันทึก", background: "#1e2235", color: "#fff" });
        } finally {
            setIsMisSaving(false);
        }
    };

    const handleMisDownloadCsv = () => {
        if (misStudents.length === 0 || misCourses.length === 0) {
            Swal.fire({ icon: "warning", title: "ไม่มีข้อมูลสำหรับดาวน์โหลด", text: "กรุณาเลือกชั้นและห้องที่มีรายชื่อนักเรียน", background: "#1e2235", color: "#fff" });
            return;
        }
        const headers = ["#", "รหัสนักเรียน", "ชื่อ-สกุล", ...misCourses.map((c) => `${c.code} ${c.title}`)];
        const rows = misStudents.map((s, idx) => [
            String(idx + 1),
            s.studentCode,
            buildMisFullName(s.title, s.firstName, s.lastName),
            ...misCourses.map((c) => getMisCellValue(c.id, s.id)),
        ]);
        const csv = buildCsv(headers, rows);
        const levelLabel = CLASSES[misLevel] || misLevel;
        const fileName = `คะแนน_${levelLabel}_ห้อง_${misRoom || "all"}_ปี${academicYear || ""}.csv`.replace(/[\\/:*?"<>|]/g, "-");
        downloadCsv(fileName, csv);
    };

    // Demo export uses the exact header/column structure confirmed from a real
    // School MIS sample file ("คะแนน_ป.1_ห้อง_1_ปี2569.csv") — always available
    // regardless of ชั้น/ห้อง selection, so headers can be checked without live data.
    const handleMisDemoExport = () => {
        const demoHeaders = [
            "#", "รหัสนักเรียน", "ชื่อ-สกุล",
            "ท11101 ภาษาไทย1", "ค11101 คณิตศาสตร์1", "ว11101 วิทยาศาสตร์และเทคโนโลยี1",
            "ส11101 สังคมศึกษาศาสนาและวัฒนธรรม1", "ส11102 ประวัติศาสตร์1",
            "พ11101 สุขศึกษาและพลศึกษา1", "ศ11101 ศิลปะ1", "ง11101 การงานอาชีพ1",
            "อ11101 ภาษาอังกฤษ1", "ส11221 ด้านทุจริตศึกษา1",
        ];
        const demoRows = [
            ["1", "1006", "เด็กชายจักรภพ กุราราช", "4", "4", "4", "3", "4", "4", "3", "4", "4", "4"],
            ["2", "1007", "เด็กชายชยธร หนูป้อง", "4", "4", "4", "2", "3", "4", "4", "3", "4", "4"],
            ["3", "1010", "เด็กหญิงศิยฑิลา โสมโยธี", "3", "3", "4", "4", "4", "3", "4", "4", "3", "4"],
        ];
        const csv = buildCsv(demoHeaders, demoRows);
        downloadCsv("SchoolMIS_Demo.csv", csv);
    };

    // Weekly assessment config lookup (S1..S18), keyed by week number
    const assessmentByWeek = useMemo(() => {
        const map: Record<number, AssessmentItem> = {};
        (currentCourse?.formativeAssessments || []).forEach((a) => {
            const key = a.id || a.name;
            const match = /^S(\d{1,2})$/.exec(key || "");
            if (match) map[Number(match[1])] = a;
        });
        return map;
    }, [currentCourse]);

    const maxTotal = useMemo(() => {
        const formativeMax = (currentCourse?.formativeAssessments || []).reduce((sum, a) => sum + (Number(a.maxScore) || 0), 0);
        const total = formativeMax + (Number(currentCourse?.midtermWeight) || 0) + (Number(currentCourse?.finalWeight) || 0);
        return total > 0 ? total : 100;
    }, [currentCourse]);

    const resolveTeacherName = useMemo(() => {
        return (groupName?: string) => {
            if (!currentCourse) return "";
            const ids = new Set<string>();
            const groupDigits = String(groupName || "").replace(/\D/g, "");
            const structuredAssignments = (semesterAssignments[currentCourse.id]?.length
                ? semesterAssignments[currentCourse.id]
                : currentCourse.teacherAssignments) || [];

            if (structuredAssignments.length > 0) {
                const matched = groupDigits
                    ? structuredAssignments.filter((a) => String(a.groupNumber || "") === groupDigits)
                    : structuredAssignments;
                (matched.length > 0 ? matched : structuredAssignments).forEach((a) => { if (a.teacherId) ids.add(a.teacherId); });
            } else {
                [
                    ...(Array.isArray(currentCourse.teacherId) ? currentCourse.teacherId : currentCourse.teacherId ? [currentCourse.teacherId] : []),
                    ...(currentCourse.teacherIds || []),
                ].forEach((id) => ids.add(id));
            }

            return Array.from(ids)
                .map((id) => (teacherMap as any)?.[id]?.name || (teacherMap as any)?.[id]?.displayName)
                .filter(Boolean)
                .join(", ");
        };
    }, [currentCourse, semesterAssignments, teacherMap]);

    // Build export rows
    const rows: ExportRow[] = useMemo(() => {
        const term = searchTerm.toLowerCase().trim();
        return students
            .filter((s) => {
                if (!term) return true;
                const fullName = `${s.firstName} ${s.lastName}`.toLowerCase();
                return fullName.includes(term) || String(s.studentNumber).includes(term) || String(s.studentId || "").includes(term);
            })
            .map((s) => {
                const record = grades[s.id] || {};
                const details = record.formativeDetails || {};

                const weekValue = (n: number): number | "" => {
                    const assessment = assessmentByWeek[n];
                    if (!assessment || !(Number(assessment.maxScore) > 0)) return "";
                    const raw = details[`S${n}`];
                    return raw === undefined || raw === "" ? 0 : Number(raw) || 0;
                };

                const weeklyPre = Array.from({ length: 9 }, (_, i) => weekValue(i + 1));
                const weeklyPost = Array.from({ length: 9 }, (_, i) => weekValue(i + 10));
                const preMidtermSubtotal = weeklyPre.reduce((sum: number, v) => sum + (v === "" ? 0 : v), 0);
                const postMidtermSubtotal = weeklyPost.reduce((sum: number, v) => sum + (v === "" ? 0 : v), 0);
                const grandTotalFormative = preMidtermSubtotal + postMidtermSubtotal;
                const midterm = Number(record.midterm) || 0;
                const final = Number(record.final) || 0;
                const total = grandTotalFormative + midterm + final;
                const percent = maxTotal > 0 ? Math.round((total / maxTotal) * 10000) / 100 : "";
                const grade = record.status || calculateGrade(total);
                const remark = getRemark(record.status);
                const groupLabel = studentGroupMap[s.studentId || s.id] || selectedGroup || "-";

                return {
                    studentId: s.id,
                    weeklyPre,
                    weeklyPost,
                    preMidtermSubtotal,
                    postMidtermSubtotal,
                    grandTotalFormative,
                    midterm,
                    final,
                    total,
                    percent,
                    grade,
                    remark,
                    studentCode: s.studentId || s.id,
                    fullName: `${s.title || ""}${s.firstName} ${s.lastName}`,
                    room: `${CLASSES[selectedLevel] || selectedLevel}/${s.room}`,
                    studentNumber: s.studentNumber,
                    groupLabel,
                    teacherName: resolveTeacherName(groupLabel),
                } as ExportRow;
            });
    }, [students, grades, assessmentByWeek, maxTotal, studentGroupMap, selectedGroup, selectedLevel, searchTerm, resolveTeacherName]);

    const handleResultStatusChange = (studentId: string, value: ResultStatus) => {
        setResultOverrides((prev) => ({ ...prev, [studentId]: value }));
    };

    const getResultStatus = (row: ExportRow): ResultStatus => resultOverrides[row.studentId] || getDefaultResultStatus(grades[row.studentId]?.status, row.grade);

    const handleExport = async () => {
        if (!currentCourse || rows.length === 0) {
            Swal.fire({ icon: "warning", title: "ไม่มีข้อมูลสำหรับส่งออก", text: "กรุณาเลือกวิชาและตรวจสอบว่ามีรายชื่อนักเรียน", background: "#1e2235", color: "#fff" });
            return;
        }

        setIsExporting(true);
        try {
            const dataRows = rows.map((r) => {
                const resultStatus = getResultStatus(r);
                return [
                    currentCourse.code || currentCourse.title,
                    r.groupLabel,
                    `${r.studentCode}  ${r.fullName}`,
                    ...r.weeklyPre,
                    r.preMidtermSubtotal,
                    ...r.weeklyPost,
                    r.postMidtermSubtotal,
                    r.grandTotalFormative,
                    r.midterm,
                    r.final,
                    r.total,
                    r.percent,
                    resultStatus === "ปกติ" ? r.total : "",
                    resultStatus === "แก้ตัว" ? r.total : "",
                    resultStatus === "เรียนซ้ำ" ? r.total : "",
                    r.grade,
                    r.remark,
                    r.studentCode,
                    r.fullName,
                    r.room,
                    r.studentNumber,
                    r.teacherName,
                ];
            });

            const ws = XLSX.utils.aoa_to_sheet([SGS_HEADERS, ...dataRows]);
            ws["!cols"] = SGS_COL_WIDTHS.map((wch) => ({ wch }));

            const wb = XLSX.utils.book_new();
            XLSX.utils.book_append_sheet(wb, ws, "SGS");

            const groupSuffix = selectedGroup ? `_${selectedGroup}` : "";
            const fileName = `SGS_${currentCourse.code || currentCourse.title}${groupSuffix}.xlsx`.replace(/[\\/:*?"<>|]/g, "-");
            XLSX.writeFile(wb, fileName);

            Swal.fire({ icon: "success", title: "ส่งออกไฟล์สำเร็จ", text: fileName, background: "#1e2235", color: "#fff", timer: 1800, showConfirmButton: false });
        } catch (err) {
            console.error(err);
            Swal.fire({ icon: "error", title: "เกิดข้อผิดพลาดในการส่งออก", background: "#1e2235", color: "#fff" });
        } finally {
            setIsExporting(false);
        }
    };

    const handleSgsDemoExport = () => {
        const demoRows = [
            [
                "ท21101", "1", "12345  เด็กชายสมชาย ใจดี",
                5, 5, 5, 5, 5, 5, 5, 5, 5,
                45,
                5, 5, 5, 5, 5, 5, 5, 5, 5,
                45,
                90,
                5,
                5,
                100,
                100,
                100, "", "",
                "4", "",
                "12345", "เด็กชายสมชาย ใจดี", "ม.1/1", "1", "ครูสมหญิง รักเรียน",
            ],
            [
                "ท21101", "1", "12346  เด็กหญิงสมหญิง ดีใจ",
                2, 2, 2, 2, 2, 2, 2, 2, 2,
                18,
                2, 2, 2, 2, 2, 2, 2, 2, 2,
                18,
                36,
                5,
                5,
                46,
                46,
                "", 46, "",
                "0", "",
                "12346", "เด็กหญิงสมหญิง ดีใจ", "ม.1/1", "2", "ครูสมหญิง รักเรียน",
            ],
        ];

        const ws = XLSX.utils.aoa_to_sheet([SGS_HEADERS, ...demoRows]);
        ws["!cols"] = SGS_COL_WIDTHS.map((wch) => ({ wch }));
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, "SGS (Demo)");
        XLSX.writeFile(wb, "SGS_Demo.xlsx");
    };

    const selectClass = "bg-transparent border-none text-[12px] font-black text-slate-900 dark:text-white outline-none cursor-pointer hover:text-indigo-400 transition-colors";
    const optionClass = "bg-white dark:bg-[#1e2235] text-slate-900 dark:text-white";

    return (
        <MainLayout>
            <div className="min-h-screen bg-slate-50 dark:bg-[#0b0e14] text-slate-600 dark:text-slate-300 font-sans flex flex-col">
                {/* Header */}
                <div className="sticky top-[60px] z-40 px-4 lg:pl-16 py-3 bg-white/90 dark:bg-[#0b0e14]/80 backdrop-blur-xl border-b border-slate-200 dark:border-white/5">
                    <div className="max-w-[1600px] mx-auto flex flex-col gap-3">
                        <div className="flex items-center gap-3">
                            <BackButton to="/academic/hub/evaluation" />
                            <div className="flex flex-col min-w-0">
                                <div className="flex items-center gap-2">
                                    <h1 className="text-lg font-black text-slate-900 dark:text-white tracking-tight">ส่งออกข้อมูลคะแนน</h1>
                                    <span
                                        title="ปีการศึกษาปัจจุบัน อ้างอิงจากปฏิทินการศึกษา (/academic/school-calendar)"
                                        className="flex items-center gap-1 px-2 py-0.5 bg-indigo-500/10 dark:bg-indigo-500/20 text-indigo-600 dark:text-indigo-400 text-[10px] font-black rounded-md border border-indigo-500/20 whitespace-nowrap"
                                    >
                                        {calendarStatus === "loading" || !academicYear ? (
                                            <Loader2 size={10} className="animate-spin" />
                                        ) : (
                                            <>ปีการศึกษา {academicYear}</>
                                        )}
                                    </span>
                                </div>
                                <div className="flex items-center gap-2 text-[11px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest">
                                    <div className="w-1.5 h-1.5 rounded-full bg-indigo-500 shadow-[0_0_8px_rgba(99,102,241,0.5)]" />
                                    {currentCourse ? <span className="text-slate-600 dark:text-slate-400 truncate">{currentCourse.code} • {currentCourse.title}</span> : "โปรดเลือกรายวิชา"}
                                </div>
                            </div>
                        </div>

                        {/* Menu Tabs */}
                        <div className="flex items-center gap-2 bg-slate-100 dark:bg-white/5 p-1 rounded-2xl border border-slate-200 dark:border-white/5 w-fit">
                            <button
                                onClick={() => setActiveMenu("sgs")}
                                className={`flex items-center gap-2 px-4 py-2 rounded-xl text-[12px] font-black transition-all ${
                                    activeMenu === "sgs" ? "bg-indigo-600 text-white shadow-lg shadow-indigo-600/20" : "text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white"
                                }`}
                            >
                                <FileSpreadsheet size={16} /> ไฟล์ Excel
                            </button>
                            <button
                                onClick={() => setActiveMenu("mis")}
                                className={`flex items-center gap-2 px-4 py-2 rounded-xl text-[12px] font-black transition-all ${
                                    activeMenu === "mis" ? "bg-indigo-600 text-white shadow-lg shadow-indigo-600/20" : "text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white"
                                }`}
                            >
                                <Building2 size={16} /> ไฟล์ CSV
                            </button>
                        </div>

                        {activeMenu === "sgs" && (
                            <div className="flex flex-wrap items-center gap-3">
                                <div className="flex flex-1 min-w-[600px] flex-wrap items-center bg-slate-100 dark:bg-white/5 p-1 rounded-2xl border border-slate-200 dark:border-white/5 shadow-inner">
                                    <div className="flex items-center gap-1 px-3 py-1.5 border-r border-slate-200 dark:border-white/5">
                                        <span className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-tighter">ชั้น</span>
                                        <select
                                            value={selectedLevel}
                                            onChange={(e) => { setSelectedLevel(e.target.value); setSelectedCourseId(""); setSelectedGroup(""); }}
                                            className={selectClass}
                                        >
                                            <option value="" className={optionClass}>เลือก</option>
                                            {availableClassOptions.map(([id, name]) => (
                                                <option key={id} value={id} className={optionClass}>{name}</option>
                                            ))}
                                        </select>
                                    </div>
                                    <div className="flex items-center gap-1 px-3 py-1.5 border-r border-slate-200 dark:border-white/5">
                                        <span className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-tighter">ห้อง</span>
                                        <select value={selectedRoom} onChange={(e) => setSelectedRoom(e.target.value)} className={selectClass}>
                                            <option value="" className={optionClass}>ทั้งหมด</option>
                                            {Array.from({ length: 20 }, (_, i) => i + 1).map((r) => (
                                                <option key={r} value={String(r)} className={optionClass}>{r}</option>
                                            ))}
                                        </select>
                                    </div>
                                    <div className="flex items-center gap-1 px-3 py-1.5 border-r border-slate-200 dark:border-white/5">
                                        <span className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-tighter">ภาค</span>
                                        <select
                                            value={selectedSemester}
                                            onChange={(e) => { setSelectedSemester(e.target.value); setSelectedCourseId(""); setSelectedGroup(""); }}
                                            className={selectClass}
                                        >
                                            <option value="" className={optionClass}>ทั้งหมด</option>
                                            <option value="1" className={optionClass}>1</option>
                                            <option value="2" className={optionClass}>2</option>
                                            <option value="annual" className={optionClass}>รายปี</option>
                                        </select>
                                    </div>
                                    <div className="flex flex-1 items-center gap-1 px-3 py-1.5 min-w-[180px] border-r border-slate-200 dark:border-white/5">
                                        <span className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-tighter">วิชา</span>
                                        <select
                                            value={selectedCourseId}
                                            onChange={(e) => { setSelectedCourseId(e.target.value); setSelectedGroup(""); }}
                                            className={`${selectClass} w-full`}
                                            disabled={!selectedLevel}
                                        >
                                            <option value="" className={optionClass}>เลือกวิชา</option>
                                            {filteredCourses.map((c) => (
                                                <option key={c.id} value={c.id} className={optionClass}>{c.code} - {c.title}</option>
                                            ))}
                                        </select>
                                    </div>
                                    <div className="flex items-center gap-1 px-3 py-1.5 min-w-0 w-[140px]">
                                        <span className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-tighter">กลุ่ม</span>
                                        <select
                                            value={selectedGroup}
                                            onChange={(e) => setSelectedGroup(e.target.value)}
                                            className={`${selectClass} w-full disabled:opacity-40`}
                                            disabled={!selectedCourseId || availableGroups.length === 0}
                                        >
                                            <option value="" className={optionClass}>ทุกกลุ่ม</option>
                                            {availableGroups.map((g) => (
                                                <option key={g.id} value={g.id} className={optionClass}>{g.label}</option>
                                            ))}
                                        </select>
                                    </div>
                                </div>

                                <div className="relative group w-[220px] shrink-0">
                                    <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 dark:text-slate-500 group-focus-within:text-indigo-400 transition-colors" size={14} />
                                    <input
                                        type="text"
                                        placeholder="ค้นหานักเรียน..."
                                        value={searchTerm}
                                        onChange={(e) => setSearchTerm(e.target.value)}
                                        className="w-full bg-slate-100 dark:bg-white/5 border border-slate-200 dark:border-white/5 rounded-2xl py-2 pl-10 pr-4 text-[12px] font-bold text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500/40 transition-all placeholder:text-slate-400 dark:placeholder:text-slate-600"
                                    />
                                </div>

                                <button
                                    onClick={handleExport}
                                    disabled={isExporting || !selectedCourseId || rows.length === 0}
                                    className="flex items-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-500 disabled:bg-slate-800/50 disabled:text-slate-500 text-white rounded-xl text-[12px] font-black shadow-lg shadow-emerald-600/20 transition-all border border-emerald-400/20 active:scale-95 whitespace-nowrap"
                                >
                                    {isExporting ? <Loader2 size={16} className="animate-spin" /> : <Download size={16} />}
                                    ดาวน์โหลด Excel (SGS)
                                </button>

                                <button
                                    onClick={handleSgsDemoExport}
                                    title="ดาวน์โหลดไฟล์ตัวอย่าง (หัวตาราง + ข้อมูลจำลอง 2 แถว) เพื่อตรวจสอบว่าหัวตารางตรงกับระบบ SGS หรือไม่"
                                    className="flex items-center gap-2 px-4 py-2 bg-amber-50 dark:bg-amber-500/10 hover:bg-amber-100 dark:hover:bg-amber-500/20 text-amber-700 dark:text-amber-400 rounded-xl text-[12px] font-black border border-amber-200 dark:border-amber-500/20 border-dashed transition-all active:scale-95 whitespace-nowrap"
                                >
                                    <FlaskConical size={16} />
                                    ดาวน์โหลดตัวอย่าง (Demo)
                                </button>
                            </div>
                        )}

                        {activeMenu === "mis" && (
                            <div className="flex flex-wrap items-center gap-3">
                                <div className="flex flex-wrap items-center bg-slate-100 dark:bg-white/5 p-1 rounded-2xl border border-slate-200 dark:border-white/5 shadow-inner">
                                    <div className="flex items-center gap-1 px-3 py-1.5 border-r border-slate-200 dark:border-white/5">
                                        <span className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-tighter">ชั้น</span>
                                        <select value={misLevel} onChange={(e) => setMisLevel(e.target.value)} className={selectClass}>
                                            <option value="" className={optionClass}>เลือก</option>
                                            {availableClassOptions.map(([id, name]) => (
                                                <option key={id} value={id} className={optionClass}>{name}</option>
                                            ))}
                                        </select>
                                    </div>
                                    <div className="flex items-center gap-1 px-3 py-1.5 border-r border-slate-200 dark:border-white/5">
                                        <span className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-tighter">ห้อง</span>
                                        <select value={misRoom} onChange={(e) => setMisRoom(e.target.value)} className={selectClass}>
                                            <option value="" className={optionClass}>เลือก</option>
                                            {Array.from({ length: 20 }, (_, i) => i + 1).map((r) => (
                                                <option key={r} value={String(r)} className={optionClass}>{r}</option>
                                            ))}
                                        </select>
                                    </div>
                                    <div className="flex items-center gap-1 px-3 py-1.5">
                                        <span className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-tighter">ภาค</span>
                                        <select value={misSemester} onChange={(e) => setMisSemester(e.target.value)} className={selectClass}>
                                            <option value="1" className={optionClass}>1</option>
                                            <option value="2" className={optionClass}>2</option>
                                            <option value="annual" className={optionClass}>รายปี</option>
                                        </select>
                                    </div>
                                </div>

                                <button
                                    onClick={handleMisDownloadCsv}
                                    disabled={!misLevel || !misRoom || misStudents.length === 0}
                                    className="flex items-center gap-2 px-4 py-2 bg-sky-600 hover:bg-sky-500 disabled:bg-slate-800/50 disabled:text-slate-500 text-white rounded-xl text-[12px] font-black shadow-lg shadow-sky-600/20 transition-all border border-sky-400/20 active:scale-95 whitespace-nowrap"
                                >
                                    <Download size={16} />
                                    ดาวน์โหลดไฟล์ผลการเรียน
                                </button>

                                <button
                                    onClick={handleMisDemoExport}
                                    title="ดาวน์โหลดไฟล์ตัวอย่าง (หัวตาราง + ข้อมูลจำลอง 3 แถว จากไฟล์ School MIS จริง) เพื่อตรวจสอบรูปแบบโดยไม่ต้องเลือกชั้น/ห้อง"
                                    className="flex items-center gap-2 px-4 py-2 bg-amber-50 dark:bg-amber-500/10 hover:bg-amber-100 dark:hover:bg-amber-500/20 text-amber-700 dark:text-amber-400 rounded-xl text-[12px] font-black border border-amber-200 dark:border-amber-500/20 border-dashed transition-all active:scale-95 whitespace-nowrap"
                                >
                                    <FlaskConical size={16} />
                                    ดาวน์โหลดตัวอย่าง (Demo)
                                </button>

                                <button
                                    onClick={handleMisSave}
                                    disabled={isMisSaving || Object.keys(misEdits).length === 0}
                                    className="flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-500 disabled:bg-slate-800/50 disabled:text-slate-500 text-white rounded-xl text-[12px] font-black shadow-lg shadow-indigo-600/20 transition-all border border-indigo-400/20 active:scale-95 whitespace-nowrap"
                                >
                                    {isMisSaving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
                                    บันทึก{Object.keys(misEdits).length > 0 ? ` (${Object.keys(misEdits).length})` : ""}
                                </button>

                                <button
                                    onClick={handleMisClearEdits}
                                    disabled={Object.keys(misEdits).length === 0}
                                    title="ล้างการแก้ไข/นำเข้าที่ยังไม่ได้บันทึก"
                                    className="flex items-center gap-2 px-3 py-2 bg-white dark:bg-white/5 hover:bg-slate-50 dark:hover:bg-white/10 disabled:opacity-40 text-slate-500 dark:text-slate-400 rounded-xl text-[12px] font-black border border-slate-200 dark:border-white/10 transition-all active:scale-95 whitespace-nowrap"
                                >
                                    <Eraser size={16} />
                                    ล้างแบบฟอร์ม
                                </button>
                            </div>
                        )}
                    </div>
                </div>

                {/* Body */}
                <div className="flex-1 p-4 sm:p-6 overflow-hidden">
                    <div className="max-w-[1600px] mx-auto h-full flex flex-col bg-white dark:bg-[#161a27] rounded-3xl border border-slate-200 dark:border-white/5 shadow-2xl overflow-hidden">
                        {activeMenu === "mis" ? (
                            !misLevel || !misRoom ? (
                                <div className="h-full flex items-center justify-center p-12">
                                    <div className="max-w-md text-center bg-slate-100 dark:bg-[#1e2235]/40 p-10 rounded-3xl border border-slate-200 dark:border-white/5">
                                        <div className="w-20 h-20 bg-sky-500/10 rounded-3xl flex items-center justify-center mx-auto mb-6 border border-sky-500/10">
                                            <Building2 size={32} className="text-sky-600 dark:text-sky-400" />
                                        </div>
                                        <h3 className="text-lg font-bold text-slate-900 dark:text-white mb-2">บันทึกผลการเรียน School MIS</h3>
                                        <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-relaxed font-bold uppercase tracking-wider">กรุณาเลือกชั้น ห้อง และภาคเรียน เพื่อดูและดาวน์โหลดไฟล์ผลการเรียนรายห้อง</p>
                                    </div>
                                </div>
                            ) : !academicYear || !registeredCourseIds ? (
                                <div className="h-full flex items-center justify-center p-12">
                                    <div className="flex flex-col items-center gap-3 text-slate-400 dark:text-slate-500">
                                        <Loader2 size={28} className="animate-spin text-indigo-500" />
                                        <span className="text-[11px] font-bold uppercase tracking-wider">
                                            {!academicYear ? "กำลังโหลดปีการศึกษาปัจจุบันจากปฏิทินการศึกษา..." : "กำลังตรวจสอบวิชาที่ลงทะเบียน..."}
                                        </span>
                                    </div>
                                </div>
                            ) : isMisLoading ? (
                                <div className="p-6 space-y-2">
                                    {[...Array(8)].map((_, i) => (
                                        <div key={`skeleton-${i}`} className="h-8 w-full rounded bg-slate-200 dark:bg-white/10 animate-pulse"></div>
                                    ))}
                                </div>
                            ) : misCourses.length === 0 ? (
                                <div className="h-full flex items-center justify-center p-12">
                                    <div className="max-w-md text-center bg-amber-500/5 p-10 rounded-3xl border border-amber-500/20">
                                        <div className="w-20 h-20 bg-amber-500/10 rounded-3xl flex items-center justify-center mx-auto mb-6 border border-amber-500/10">
                                            <AlertCircle size={32} className="text-amber-500" />
                                        </div>
                                        <h3 className="text-lg font-bold text-slate-900 dark:text-white mb-2">ไม่พบรายวิชาที่ลงทะเบียนของชั้นนี้</h3>
                                        <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-relaxed font-bold uppercase tracking-wider">วิชาจะแสดงเมื่อผ่านการมอบหมายครูผู้สอน (course-assignment) หรือมีนักเรียนลงทะเบียนแล้ว (course-enrollment) สำหรับปีการศึกษานี้</p>
                                    </div>
                                </div>
                            ) : misStudents.length === 0 ? (
                                <div className="h-full flex items-center justify-center p-12">
                                    <div className="max-w-md text-center bg-amber-500/5 p-10 rounded-3xl border border-amber-500/20">
                                        <div className="w-20 h-20 bg-amber-500/10 rounded-3xl flex items-center justify-center mx-auto mb-6 border border-amber-500/10">
                                            <AlertCircle size={32} className="text-amber-500" />
                                        </div>
                                        <h3 className="text-lg font-bold text-slate-900 dark:text-white mb-2">ไม่พบรายชื่อนักเรียนในห้องนี้</h3>
                                        <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-relaxed font-bold uppercase tracking-wider">ตรวจสอบชั้น/ห้องของนักเรียนในระบบ</p>
                                    </div>
                                </div>
                            ) : (
                                <>
                                    <div className="px-6 py-3 bg-slate-50 dark:bg-[#1e2235]/40 border-b border-slate-200 dark:border-white/5 flex items-center gap-2 text-[11px] font-bold text-slate-500 dark:text-slate-400">
                                        <Info size={14} className="text-sky-500 shrink-0" />
                                        ข้อมูลผลการเรียนดึงมาจากระบบเดียวกับทะเบียนวัดผล (ปพ.5) — แก้ไขค่าในตารางได้โดยตรง แล้วกด "บันทึก" เพื่อยืนยันลงฐานข้อมูล ไฟล์ CSV ที่ดาวน์โหลดตรงตามรูปแบบ School MIS (UTF-8, คั่นด้วยจุลภาค)
                                    </div>
                                    <div className="flex-1 overflow-auto custom-scrollbar">
                                        <table className="w-full border-collapse text-left">
                                            <thead className="sticky top-0 z-30 bg-slate-100 dark:bg-[#1e2235]">
                                                <tr className="text-[9px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest border-b border-slate-200 dark:border-white/5">
                                                    <th className="px-3 py-3 w-[44px] text-center sticky left-0 z-40 bg-slate-100 dark:bg-[#1e2235] border-r border-slate-200 dark:border-white/5">#</th>
                                                    <th className="px-3 py-3 w-[80px] text-center sticky left-[44px] z-40 bg-slate-100 dark:bg-[#1e2235] border-r border-slate-200 dark:border-white/5">รหัส นร.</th>
                                                    <th className="px-4 py-3 min-w-[170px] sticky left-[124px] z-40 bg-slate-100 dark:bg-[#1e2235] border-r border-slate-200 dark:border-white/5">ชื่อ-สกุล</th>
                                                    {misCourses.map((c) => (
                                                        <th key={c.id} className="px-1 py-2 w-[64px] text-center border-r border-slate-200 dark:border-white/5">
                                                            <div className="flex flex-col items-center gap-0.5" title={`${c.code} ${c.title}`}>
                                                                <span className="text-slate-600 dark:text-white/80">{c.code}</span>
                                                                <span className="text-slate-400 dark:text-slate-500 font-bold normal-case text-[8px] max-w-[60px] truncate">{c.title}</span>
                                                            </div>
                                                        </th>
                                                    ))}
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {misStudents.map((s, idx) => (
                                                    <tr key={s.id} className="border-b border-slate-200 dark:border-white/5 hover:bg-slate-50 dark:hover:bg-white/[0.02] transition-colors group">
                                                        <td className="px-3 py-2 text-center font-black text-[11px] text-slate-400 dark:text-slate-500 sticky left-0 z-10 bg-white dark:bg-[#161a27] group-hover:bg-slate-50 dark:group-hover:bg-[#1c2132] border-r border-slate-200 dark:border-white/5">
                                                            {idx + 1}
                                                        </td>
                                                        <td className="px-3 py-2 text-center text-[11px] font-bold text-slate-500 dark:text-slate-400 sticky left-[44px] z-10 bg-white dark:bg-[#161a27] group-hover:bg-slate-50 dark:group-hover:bg-[#1c2132] border-r border-slate-200 dark:border-white/5">
                                                            {s.studentCode}
                                                        </td>
                                                        <td className="px-4 py-2 text-[12px] font-bold text-slate-900 dark:text-white sticky left-[124px] z-10 bg-white dark:bg-[#161a27] group-hover:bg-slate-50 dark:group-hover:bg-[#1c2132] border-r border-slate-200 dark:border-white/5 whitespace-nowrap">
                                                            {buildMisFullName(s.title, s.firstName, s.lastName)}
                                                        </td>
                                                        {misCourses.map((c) => {
                                                            const key = `${c.id}__${s.id}`;
                                                            const isEdited = key in misEdits;
                                                            return (
                                                                <td key={c.id} className={`px-1 py-1 border-r border-slate-200 dark:border-white/5 ${isEdited ? "bg-amber-500/10" : ""}`}>
                                                                    <input
                                                                        type="text"
                                                                        value={getMisCellValue(c.id, s.id)}
                                                                        onChange={(e) => handleMisCellChange(c.id, s.id, e.target.value)}
                                                                        className={`w-full bg-transparent text-center text-[12px] font-black focus:outline-none focus:bg-sky-500/10 rounded transition-all py-1 ${isEdited ? "text-amber-600 dark:text-amber-400" : "text-slate-900 dark:text-white"}`}
                                                                        placeholder="-"
                                                                    />
                                                                </td>
                                                            );
                                                        })}
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>
                                    <div className="bg-slate-50 dark:bg-[#1e2235]/40 border-t border-slate-200 dark:border-white/10 px-8 py-3 flex items-center justify-between">
                                        <div className="flex items-center gap-2 text-slate-500 dark:text-slate-400">
                                            <Users size={14} />
                                            <span className="text-[11px] font-bold">{misStudents.length} รายชื่อ • {misCourses.length} รายวิชา</span>
                                        </div>
                                        {Object.keys(misEdits).length > 0 && (
                                            <span className="text-[10px] font-bold text-amber-500">มีการแก้ไข {Object.keys(misEdits).length} ช่องที่ยังไม่บันทึก</span>
                                        )}
                                    </div>
                                </>
                            )
                        ) : !selectedCourseId ? (
                            <div className="h-full flex items-center justify-center p-12">
                                <div className="max-w-md text-center bg-slate-100 dark:bg-[#1e2235]/40 p-10 rounded-3xl border border-slate-200 dark:border-white/5">
                                    <div className="w-20 h-20 bg-indigo-500/10 rounded-3xl flex items-center justify-center mx-auto mb-6 border border-indigo-500/10">
                                        <FileSpreadsheet size={32} className="text-indigo-600 dark:text-indigo-400" />
                                    </div>
                                    <h3 className="text-lg font-bold text-slate-900 dark:text-white mb-2">พร้อมสำหรับส่งออกข้อมูล</h3>
                                    <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-relaxed font-bold uppercase tracking-wider">กรุณาเลือกระดับชั้นและรายวิชา เพื่อดูตัวอย่างข้อมูลก่อนส่งออก</p>
                                </div>
                            </div>
                        ) : isLoading ? (
                            <div className="p-6 space-y-2">
                                {[...Array(8)].map((_, i) => (
                                    <div key={`skeleton-${i}`} className="h-8 w-full rounded bg-slate-200 dark:bg-white/10 animate-pulse"></div>
                                ))}
                            </div>
                        ) : rows.length === 0 ? (
                            <div className="h-full flex items-center justify-center p-12">
                                <div className="max-w-md text-center bg-amber-500/5 p-10 rounded-3xl border border-amber-500/20">
                                    <div className="w-20 h-20 bg-amber-500/10 rounded-3xl flex items-center justify-center mx-auto mb-6 border border-amber-500/10">
                                        <AlertCircle size={32} className="text-amber-500" />
                                    </div>
                                    <h3 className="text-lg font-bold text-slate-900 dark:text-white mb-2">ไม่พบรายชื่อนักเรียน</h3>
                                    <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-relaxed font-bold uppercase tracking-wider">ตรวจสอบการลงทะเบียนเรียน (Enrollment) ของวิชานี้</p>
                                </div>
                            </div>
                        ) : (
                            <>
                                <div className="px-6 py-3 bg-slate-50 dark:bg-[#1e2235]/40 border-b border-slate-200 dark:border-white/5 flex items-center gap-2 text-[11px] font-bold text-slate-500 dark:text-slate-400">
                                    <Info size={14} className="text-indigo-500 shrink-0" />
                                    ตัวอย่างข้อมูลด้านล่างแสดงคอลัมน์หลักเท่านั้น ไฟล์ Excel ที่ดาวน์โหลดจะมีครบทั้ง 38 คอลัมน์ตามรูปแบบ SGS — ปรับ "ผลการเรียน" รายบุคคลได้ก่อนส่งออก (ค่าเริ่มต้นคำนวณจากเกรด)
                                </div>
                                <div className="flex-1 overflow-auto custom-scrollbar">
                                    <table className="w-full border-collapse text-left">
                                        <thead className="sticky top-0 z-30 bg-slate-100 dark:bg-[#1e2235]">
                                            <tr className="text-[9px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest border-b border-slate-200 dark:border-white/5">
                                                <th className="px-4 py-3 w-[60px] text-center sticky left-0 z-40 bg-slate-100 dark:bg-[#1e2235] border-r border-slate-200 dark:border-white/5">เลขที่</th>
                                                <th className="px-6 py-3 min-w-[180px] sticky left-[60px] z-40 bg-slate-100 dark:bg-[#1e2235] border-r border-slate-200 dark:border-white/5">ชื่อ-นามสกุล</th>
                                                <th className="px-2 py-3 w-[70px] text-center">กลุ่ม</th>
                                                <th className="px-2 py-3 w-[80px] text-center">ก่อนกลางภาค</th>
                                                <th className="px-2 py-3 w-[80px] text-center">หลังกลางภาค</th>
                                                <th className="px-2 py-3 w-[70px] text-center">กลางภาค</th>
                                                <th className="px-2 py-3 w-[70px] text-center">ปลายภาค</th>
                                                <th className="px-2 py-3 w-[70px] text-center">Total</th>
                                                <th className="px-2 py-3 w-[60px] text-center">%</th>
                                                <th className="px-2 py-3 w-[60px] text-center">Grade</th>
                                                <th className="px-2 py-3 w-[130px] text-center">ผลการเรียน</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {rows.map((r, idx) => (
                                                <tr key={r.studentId} className="border-b border-slate-200 dark:border-white/5 hover:bg-slate-50 dark:hover:bg-white/[0.02] transition-colors group">
                                                    <td className="px-4 py-2.5 text-center font-black text-[11px] text-slate-400 dark:text-slate-500 sticky left-0 z-10 bg-white dark:bg-[#161a27] group-hover:bg-slate-50 dark:group-hover:bg-[#1c2132] border-r border-slate-200 dark:border-white/5">
                                                        {r.studentNumber || idx + 1}
                                                    </td>
                                                    <td className="px-6 py-2.5 sticky left-[60px] z-10 bg-white dark:bg-[#161a27] group-hover:bg-slate-50 dark:group-hover:bg-[#1c2132] border-r border-slate-200 dark:border-white/5">
                                                        <div className="flex flex-col">
                                                            <span className="text-[12px] font-bold text-slate-900 dark:text-white">{r.fullName}</span>
                                                            <span className="text-[9px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-tighter">{r.studentCode}</span>
                                                        </div>
                                                    </td>
                                                    <td className="px-2 py-2.5 text-center text-[11px] font-bold text-slate-500 dark:text-slate-400">{r.groupLabel}</td>
                                                    <td className="px-2 py-2.5 text-center text-[12px] font-black text-slate-600 dark:text-slate-300">{r.preMidtermSubtotal}</td>
                                                    <td className="px-2 py-2.5 text-center text-[12px] font-black text-slate-600 dark:text-slate-300">{r.postMidtermSubtotal}</td>
                                                    <td className="px-2 py-2.5 text-center text-[12px] font-black text-emerald-600 dark:text-emerald-400">{r.midterm}</td>
                                                    <td className="px-2 py-2.5 text-center text-[12px] font-black text-emerald-600 dark:text-emerald-400">{r.final}</td>
                                                    <td className="px-2 py-2.5 text-center text-[13px] font-black text-indigo-900 dark:text-white bg-indigo-500/5">{r.total}</td>
                                                    <td className="px-2 py-2.5 text-center text-[11px] font-bold text-slate-500 dark:text-slate-400">{r.percent}</td>
                                                    <td className="px-2 py-2.5 text-center text-[12px] font-black text-slate-900 dark:text-white">{r.grade}</td>
                                                    <td className="px-2 py-1.5 text-center">
                                                        <div className="relative inline-block">
                                                            <select
                                                                value={getResultStatus(r)}
                                                                onChange={(e) => handleResultStatusChange(r.studentId, e.target.value as ResultStatus)}
                                                                className="appearance-none bg-slate-100 dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-lg pl-2.5 pr-6 py-1 text-[10px] font-black text-slate-700 dark:text-slate-300 outline-none cursor-pointer"
                                                            >
                                                                <option value="ปกติ">ปกติ</option>
                                                                <option value="แก้ตัว">แก้ตัว</option>
                                                                <option value="เรียนซ้ำ">เรียนซ้ำ</option>
                                                            </select>
                                                            <ChevronDown size={11} className="pointer-events-none absolute right-1.5 top-1/2 -translate-y-1/2 text-slate-400" />
                                                        </div>
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                                <div className="bg-slate-50 dark:bg-[#1e2235]/40 border-t border-slate-200 dark:border-white/10 px-8 py-3 flex items-center justify-between">
                                    <div className="flex items-center gap-2 text-slate-500 dark:text-slate-400">
                                        <Users size={14} />
                                        <span className="text-[11px] font-bold">{rows.length} รายชื่อ</span>
                                    </div>
                                    {currentCourse && (
                                        <span className="text-[10px] font-bold text-slate-400 dark:text-slate-500">คะแนนเต็มรวม: {maxTotal}</span>
                                    )}
                                </div>
                            </>
                        )}
                    </div>
                </div>

                <style>{`
                    .custom-scrollbar::-webkit-scrollbar { width: 6px; height: 6px; }
                    .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
                    .custom-scrollbar::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.05); border-radius: 10px; }
                    .custom-scrollbar::-webkit-scrollbar-thumb:hover { background: rgba(255,255,255,0.1); }
                `}</style>
            </div>
        </MainLayout>
    );
};

export default SgsExportPage;
