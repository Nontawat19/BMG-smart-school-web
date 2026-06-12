import React, { useEffect, useMemo, useState } from "react";
import { useSelector } from "react-redux";
import { collection, getDocs, orderBy, query } from "firebase/firestore";
import {
  Document as PdfDocument,
  Font,
  Image as PdfImage,
  Page,
  StyleSheet,
  Text,
  View,
  pdf,
} from "@react-pdf/renderer";
import { Download, FileText, RefreshCw, Search, Users } from "lucide-react";
import BackButton from "@/components/Shared/BackButton";
import MainLayout from "@/layouts/MainLayout";
import SkeletonLoader from "@/components/SkeletonLoader";
import { firestore as db } from "@/firebase";
import { RootState } from "@/store";
import { usePermissions } from "@/hooks/usePermissions";
import { CLASSES, getClassLevelRank, isClassLevelInRange } from "@/utils/schoolUtils";
import { getStudentStatus, isStudyingStudent } from "@/utils/studentStatusUtils";

try {
  Font.register({
    family: "TH Sarabun PSK",
    fonts: [
      { src: "/fonts/THSarabunNew.ttf" },
      { src: "/fonts/THSarabunNew-Bold.ttf", fontWeight: "bold" },
    ],
  });
} catch (error) {
  console.warn("Unable to register Thai PDF font", error);
}

interface StudentRow {
  id: string;
  prefix?: string;
  title?: string;
  firstName?: string;
  lastName?: string;
  studentId?: string;
  studentNumber?: string;
  number?: string;
  classLevel?: string;
  room?: string;
  gender?: string;
  status?: string;
  studentStatus?: string;
}

interface TeacherRow {
  id: string;
  title?: string;
  firstName?: string;
  lastName?: string;
  name?: string;
  homeroomGrade?: string;
  homeroomRoom?: string;
  isHomeroomTeacher?: boolean;
  advisorRole?: string;
}

interface CourseRow {
  id: string;
  title?: string;
  name?: string;
  subjectName?: string;
  code?: string;
  courseCode?: string;
  subjectCode?: string;
  classId?: string | string[];
  academicYear?: string;
  year?: string;
  semester?: string;
  term?: string;
}

interface ClubRow {
  id: string;
  name?: string;
  academicYear?: string;
  year?: string;
  semester?: string;
  term?: string;
  allowedClassLevelFrom?: string;
  allowedClassLevelTo?: string;
}

interface LearnerActivityRow {
  id: string;
  courseId?: string;
  courseCode?: string;
  name?: string;
  description?: string;
  academicYear?: string;
  year?: string;
  semester?: string | number;
  term?: string | number;
  classId?: string | string[];
}

interface EnrollmentRow {
  id: string;
  courseId?: string;
  studentId?: string;
  academicYear?: string;
  semester?: string;
}

interface SubjectOption {
  key: string;
  id: string;
  type: "course" | "club" | "activity";
  label: string;
  subject: string;
}

interface PdfData {
  schoolName: string;
  logoUrl?: string;
  academicYear: string;
  semester: string;
  classLevel: string;
  room: string;
  subjectLabel: string;
  subject: string;
  advisorName: string;
  students: StudentRow[];
}

const ROWS_PER_PAGE = 30;
const BLANK_COLUMNS = 8;

const getStudentCode = (student: StudentRow) => student.studentId || student.studentNumber || "";
const getStudentNumber = (student: StudentRow, index: number) => student.number || student.studentNumber || String(index + 1);
const getStudentName = (student: StudentRow) => `${student.prefix || student.title || ""}${student.firstName || ""} ${student.lastName || ""}`.trim();
const getTeacherName = (teacher?: TeacherRow) => {
  if (!teacher) return "";
  return teacher.name || `${teacher.title || ""}${teacher.firstName || ""} ${teacher.lastName || ""}`.trim();
};
const getCourseTitle = (course?: CourseRow) => {
  if (!course) return "";
  const code = course.code || course.courseCode || course.subjectCode || "";
  const name = course.title || course.subjectName || course.name || "";
  return [code, name].filter(Boolean).join(" ").trim();
};
const getClubTitle = (club?: ClubRow) => club?.name || "";
const getActivityTitle = (activity?: LearnerActivityRow) => {
  if (!activity) return "";
  return [activity.courseCode || activity.courseId || "", activity.name || activity.description || ""].filter(Boolean).join(" ").trim();
};

const classLabel = (value?: string) => {
  const raw = String(value || "").trim();
  return CLASSES[raw] || raw;
};

const normalizeClassValue = (value?: string) => {
  const label = classLabel(value);
  const key = Object.entries(CLASSES).find(([classKey, className]) => classKey === value || className === value)?.[0];
  return { key: key || value || "", label };
};

const asArray = (value: unknown) => Array.isArray(value) ? value : [value].filter(Boolean);

const courseMatchesClass = (course: CourseRow, selectedClassLevel: string) => {
  const selected = normalizeClassValue(selectedClassLevel);
  const classIds = asArray(course.classId).map(value => String(value || "").trim()).filter(Boolean);
  if (classIds.length === 0) return true;
  return classIds.some(classId => {
    const normalized = normalizeClassValue(classId.includes("/") ? classId.split("/")[0] : classId);
    return classId === selected.key
      || classId === selected.label
      || classId.startsWith(`${selected.key}/`)
      || classId.startsWith(`${selected.label}/`)
      || normalized.key === selected.key
      || normalized.label === selected.label;
  });
};

const getCourseAcademicYear = (course: CourseRow) => String(course.academicYear || course.year || "").trim();
const getCourseSemester = (course: CourseRow) => String(course.semester || course.term || "").trim();

const courseMatchesAcademicContext = (course: CourseRow, academicYear: string, semester: string) => {
  const courseYear = getCourseAcademicYear(course);
  const courseSemester = getCourseSemester(course);
  const yearMatches = !courseYear || !academicYear || courseYear === academicYear;
  const semesterMatches = !courseSemester
    || !semester
    || courseSemester === semester
    || courseSemester.startsWith(`${semester}/`)
    || semester.startsWith(`${courseSemester}/`)
    || courseSemester.includes(semester);

  return yearMatches && semesterMatches;
};

const valueMatchesAcademicContext = (item: { academicYear?: string; year?: string; semester?: string | number; term?: string | number }, academicYear: string, semester: string) => {
  const itemYear = String(item.academicYear || item.year || "").trim();
  const itemSemester = String(item.semester ?? item.term ?? "").trim();
  const yearMatches = !itemYear || !academicYear || itemYear === academicYear;
  const semesterMatches = !itemSemester
    || itemSemester === "0"
    || itemSemester === "annual"
    || itemSemester === "1-2"
    || itemSemester === "ปีการศึกษา"
    || !semester
    || itemSemester === semester
    || itemSemester.startsWith(`${semester}/`)
    || semester.startsWith(`${itemSemester}/`)
    || itemSemester.includes(semester);

  return yearMatches && semesterMatches;
};

const clubMatchesClass = (club: ClubRow, selectedClassLevel: string) => {
  if (!club.allowedClassLevelFrom && !club.allowedClassLevelTo) return true;
  const selected = normalizeClassValue(selectedClassLevel);
  return isClassLevelInRange(selected.key, club.allowedClassLevelFrom, club.allowedClassLevelTo)
    || isClassLevelInRange(selected.label, club.allowedClassLevelFrom, club.allowedClassLevelTo);
};

const semesterOverlaps = (first?: string | number, second?: string | number) => {
  const a = String(first ?? "").trim() || "0";
  const b = String(second ?? "").trim() || "0";
  return a === b || a === "0" || b === "0";
};

const sortStudents = (a: StudentRow, b: StudentRow) => {
  const aNo = Number(a.number || a.studentNumber);
  const bNo = Number(b.number || b.studentNumber);
  if (Number.isFinite(aNo) && Number.isFinite(bNo) && aNo !== bNo) return aNo - bNo;
  return getStudentCode(a).localeCompare(getStudentCode(b), "th", { numeric: true });
};

const getGenderCounts = (students: StudentRow[]) => {
  return students.reduce(
    (acc, student) => {
      const text = `${student.gender || ""} ${student.prefix || student.title || ""}`.toLowerCase();
      if (text.includes("หญิง") || text.includes("ญ") || text.includes("female")) acc.female += 1;
      else acc.male += 1;
      return acc;
    },
    { male: 0, female: 0 }
  );
};

const resolveSemester = (calendar: RootState["calendar"]) => {
  const today = new Date();
  const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
  const currentTerm = (calendar.terms || []).find(term => term.startDate && term.endDate && todayStr >= term.startDate && todayStr <= term.endDate);
  const term = currentTerm || calendar.terms?.[0];
  if (!term) return "1";
  if (term.id === "term2" || term.name?.includes("2")) return "2";
  return "1";
};

const getSemesterOptions = (calendar: RootState["calendar"]) => {
  const termSemesters = (calendar.terms || []).map(term => {
    const termText = `${term.id || ""} ${term.name || ""}`;
    return termText.includes("2") ? "2" : "1";
  });

  return Array.from(new Set([...termSemesters, "1", "2"]));
};

const pdfStyles = StyleSheet.create({
  page: {
    fontFamily: "TH Sarabun PSK",
    fontSize: 14,
    paddingTop: 42,
    paddingHorizontal: 64,
    color: "#111827",
  },
  header: {
    position: "relative",
    minHeight: 92,
    alignItems: "center",
  },
  logo: {
    position: "absolute",
    left: 8,
    top: 0,
    width: 62,
    height: 62,
    objectFit: "contain",
  },
  schoolName: {
    fontSize: 16,
    fontWeight: "bold",
    lineHeight: 1.15,
  },
  title: {
    fontSize: 15,
    fontWeight: "bold",
    lineHeight: 1.15,
  },
  subjectLine: {
    marginTop: 4,
    fontSize: 14,
    lineHeight: 1.15,
  },
  advisorLine: {
    marginTop: 8,
    marginLeft: 128,
    alignSelf: "stretch",
    fontSize: 14,
  },
  table: {
    borderTopWidth: 1,
    borderLeftWidth: 1,
    borderColor: "#111827",
    alignSelf: "center",
    width: 684,
  },
  row: {
    flexDirection: "row",
    minHeight: 22,
  },
  summaryRow: {
    flexDirection: "row",
    minHeight: 24,
  },
  cell: {
    borderRightWidth: 1,
    borderBottomWidth: 1,
    borderColor: "#111827",
    justifyContent: "center",
    paddingHorizontal: 4,
  },
  headerCell: {
    fontWeight: "bold",
    textAlign: "center",
  },
  center: {
    textAlign: "center",
  },
  bold: {
    fontWeight: "bold",
  },
  noCell: { width: 36 },
  codeCell: { width: 68 },
  nameCell: { width: 252 },
  blankCell: { width: 41 },
  summaryCell: { width: 356 },
  footer: {
    position: "absolute",
    bottom: 22,
    left: 64,
    right: 64,
    textAlign: "right",
    fontSize: 10,
    color: "#4b5563",
  },
});

const StudentListPdfDocument: React.FC<{ data: PdfData }> = ({ data }) => {
  const chunks: StudentRow[][] = [];
  for (let i = 0; i < data.students.length; i += ROWS_PER_PAGE) {
    chunks.push(data.students.slice(i, i + ROWS_PER_PAGE));
  }
  if (chunks.length === 0) chunks.push([]);

  const counts = getGenderCounts(data.students);
  const logoSrc = data.logoUrl || "/Epp5 online.png";

  return (
    <PdfDocument>
      {chunks.map((pageRows, pageIndex) => {
        const isLastPage = pageIndex === chunks.length - 1;
        return (
          <Page key={`student-list-${pageIndex}`} size="A4" orientation="landscape" style={pdfStyles.page}>
            <View style={pdfStyles.header}>
              <PdfImage src={logoSrc} style={pdfStyles.logo} />
              <Text style={pdfStyles.schoolName}>{data.schoolName || "โรงเรียน"}</Text>
              <Text style={pdfStyles.title}>
                รายชื่อนักเรียน ปีการศึกษา {data.academicYear || "........"} ภาคเรียนที่ {data.semester || "...."} ชั้น {data.classLevel || "...."} ห้องที่ {data.room || "...."}
              </Text>
              <Text style={pdfStyles.subjectLine}>{data.subjectLabel || "วิชา"} {data.subject || "........................................................................"}</Text>
              <Text style={pdfStyles.advisorLine}>ครูที่ปรึกษา : {data.advisorName || "........................................................"}</Text>
            </View>

            <View style={pdfStyles.table}>
              <View style={pdfStyles.row}>
                <View style={[pdfStyles.cell, pdfStyles.noCell]}><Text style={[pdfStyles.headerCell, pdfStyles.center]}>เลขที่</Text></View>
                <View style={[pdfStyles.cell, pdfStyles.codeCell]}><Text style={[pdfStyles.headerCell, pdfStyles.center]}>เลขประจำตัว</Text></View>
                <View style={[pdfStyles.cell, pdfStyles.nameCell]}><Text style={pdfStyles.headerCell}>ชื่อ นามสกุล</Text></View>
                {Array.from({ length: BLANK_COLUMNS }).map((_, index) => (
                  <View key={`blank-head-${index}`} style={[pdfStyles.cell, pdfStyles.blankCell]}><Text> </Text></View>
                ))}
              </View>

              {pageRows.map((student, rowIndex) => {
                const absoluteIndex = pageIndex * ROWS_PER_PAGE + rowIndex;
                return (
                  <View key={student.id} style={pdfStyles.row}>
                    <View style={[pdfStyles.cell, pdfStyles.noCell]}><Text style={pdfStyles.center}>{getStudentNumber(student, absoluteIndex)}</Text></View>
                    <View style={[pdfStyles.cell, pdfStyles.codeCell]}><Text style={pdfStyles.center}>{getStudentCode(student)}</Text></View>
                    <View style={[pdfStyles.cell, pdfStyles.nameCell]}><Text>{getStudentName(student)}</Text></View>
                    {Array.from({ length: BLANK_COLUMNS }).map((_, index) => (
                      <View key={`${student.id}-blank-${index}`} style={[pdfStyles.cell, pdfStyles.blankCell]}><Text> </Text></View>
                    ))}
                  </View>
                );
              })}

              {isLastPage && (
                <View style={pdfStyles.summaryRow}>
                  <View style={[pdfStyles.cell, pdfStyles.summaryCell]}>
                    <Text style={pdfStyles.bold}>
                      ห้องที่ {data.room || "-"} รวม {data.students.length} คน ( ช. {counts.male}, ญ. {counts.female} )
                    </Text>
                  </View>
                  {Array.from({ length: BLANK_COLUMNS }).map((_, index) => (
                    <View key={`summary-blank-${index}`} style={[pdfStyles.cell, pdfStyles.blankCell]}><Text> </Text></View>
                  ))}
                </View>
              )}
            </View>

            <Text
              style={pdfStyles.footer}
              render={({ pageNumber, totalPages }) => `หน้า ${pageNumber}/${totalPages}`}
              fixed
            />
          </Page>
        );
      })}
    </PdfDocument>
  );
};

const HomeroomStudentListPage: React.FC = () => {
  const { user: currentUser } = usePermissions();
  const schoolSettings = useSelector((state: RootState) => state.schoolSettings);
  const calendar = useSelector((state: RootState) => state.calendar);
  const schoolId = (currentUser as any)?.schoolId || schoolSettings.schoolId;

  const [students, setStudents] = useState<StudentRow[]>([]);
  const [teachers, setTeachers] = useState<TeacherRow[]>([]);
  const [courses, setCourses] = useState<CourseRow[]>([]);
  const [clubs, setClubs] = useState<ClubRow[]>([]);
  const [learnerActivities, setLearnerActivities] = useState<LearnerActivityRow[]>([]);
  const [enrollments, setEnrollments] = useState<EnrollmentRow[]>([]);
  const [subjectStudentIds, setSubjectStudentIds] = useState<string[] | null>(null);
  const [subjectStudentsLoading, setSubjectStudentsLoading] = useState(false);
  const [selectedClassLevel, setSelectedClassLevel] = useState("");
  const [selectedRoom, setSelectedRoom] = useState("");
  const [selectedSemester, setSelectedSemester] = useState("");
  const [selectedSubjectKey, setSelectedSubjectKey] = useState("");
  const [keyword, setKeyword] = useState("");
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);

  const loadData = async () => {
    if (!schoolId) return;
    setLoading(true);
    try {
      const [studentsSnap, teachersSnap, coursesSnap, clubsSnap, activitiesSnap, enrollmentsSnap] = await Promise.all([
        getDocs(query(collection(db, "school-settings", schoolId, "students"), orderBy("classLevel", "asc"))),
        getDocs(collection(db, "school-settings", schoolId, "teachers")),
        getDocs(collection(db, "school-settings", schoolId, "courses")),
        getDocs(collection(db, "school-settings", schoolId, "clubs")),
        getDocs(collection(db, "school-settings", schoolId, "learner-activities")),
        getDocs(collection(db, "school-settings", schoolId, "enrollments")),
      ]);

      const studentRows = studentsSnap.docs
        .map(studentDoc => ({ id: studentDoc.id, ...studentDoc.data() } as StudentRow))
        .filter(student => isStudyingStudent(student))
        .sort((a, b) => {
          const classDiff = getClassLevelRank(classLabel(a.classLevel)) - getClassLevelRank(classLabel(b.classLevel));
          if (classDiff !== 0) return classDiff;
          const roomDiff = String(a.room || "").localeCompare(String(b.room || ""), "th", { numeric: true });
          if (roomDiff !== 0) return roomDiff;
          return sortStudents(a, b);
        });

      setStudents(studentRows);
      setTeachers(teachersSnap.docs.map(teacherDoc => ({ id: teacherDoc.id, ...teacherDoc.data() } as TeacherRow)));
      setCourses(coursesSnap.docs.map(courseDoc => ({ id: courseDoc.id, ...courseDoc.data() } as CourseRow)));
      setClubs(clubsSnap.docs.map(clubDoc => ({ id: clubDoc.id, ...clubDoc.data() } as ClubRow)));
      setLearnerActivities(activitiesSnap.docs.map(activityDoc => ({ id: activityDoc.id, ...activityDoc.data() } as LearnerActivityRow)));
      setEnrollments(enrollmentsSnap.docs.map(enrollmentDoc => ({ id: enrollmentDoc.id, ...enrollmentDoc.data() } as EnrollmentRow)));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [schoolId]);

  const academicYear = calendar.academicYear || schoolSettings.currentAcademicYear || "";
  const currentSemester = resolveSemester(calendar);
  const semesterOptions = useMemo(() => getSemesterOptions(calendar), [calendar.terms]);

  useEffect(() => {
    if (!selectedSemester) {
      setSelectedSemester(currentSemester);
    }
  }, [currentSemester, selectedSemester]);

  const classOptions = useMemo(() => {
    const fromSettings = schoolSettings.availableClassOptions.map(([, label]) => label);
    const fromStudents = students.map(student => classLabel(student.classLevel)).filter(Boolean);
    return Array.from(new Set([...fromSettings, ...fromStudents]))
      .filter(Boolean)
      .sort((a, b) => getClassLevelRank(a) - getClassLevelRank(b));
  }, [schoolSettings.availableClassOptions, students]);

  useEffect(() => {
    // allow empty
  }, [classOptions, selectedClassLevel]);

  const roomOptions = useMemo(() => {
    return Array.from(new Set(students
      .filter(student => !selectedClassLevel || classLabel(student.classLevel) === selectedClassLevel)
      .map(student => String(student.room || "").trim())
      .filter(Boolean)))
      .sort((a, b) => a.localeCompare(b, "th", { numeric: true }));
  }, [selectedClassLevel, students]);

  useEffect(() => {
    if (selectedRoom && !roomOptions.includes(selectedRoom)) {
      setSelectedRoom("");
    }
  }, [roomOptions, selectedRoom]);

  const subjectOptions = useMemo<SubjectOption[]>(() => {
    const courseOptions = courses
      .filter(course => courseMatchesClass(course, selectedClassLevel))
      .filter(course => courseMatchesAcademicContext(course, academicYear, selectedSemester))
      .filter(course => getCourseTitle(course))
      .map(course => ({
        key: `course:${course.id}`,
        id: course.id,
        type: "course" as const,
        label: `รายวิชา - ${getCourseTitle(course)}`,
        subject: getCourseTitle(course),
      }));

    const clubOptions = clubs
      .filter(club => clubMatchesClass(club, selectedClassLevel))
      .filter(club => valueMatchesAcademicContext(club, academicYear, selectedSemester))
      .filter(club => getClubTitle(club))
      .map(club => ({
        key: `club:${club.id}`,
        id: club.id,
        type: "club" as const,
        label: `ชุมนุม - ${getClubTitle(club)}`,
        subject: getClubTitle(club),
      }));

    const activityOptions = learnerActivities
      .filter(activity => courseMatchesClass(activity as CourseRow, selectedClassLevel))
      .filter(activity => valueMatchesAcademicContext(activity, academicYear, selectedSemester))
      .filter(activity => getActivityTitle(activity))
      .map(activity => ({
        key: `activity:${activity.id}`,
        id: activity.id,
        type: "activity" as const,
        label: `กิจกรรม - ${getActivityTitle(activity)}`,
        subject: getActivityTitle(activity),
      }));

    return [...courseOptions, ...clubOptions, ...activityOptions]
      .sort((a, b) => a.label.localeCompare(b.label, "th", { numeric: true }));
  }, [academicYear, clubs, courses, learnerActivities, selectedClassLevel, selectedSemester]);

  useEffect(() => {
    if (selectedSubjectKey && !subjectOptions.some(option => option.key === selectedSubjectKey)) {
      setSelectedSubjectKey("");
    }
  }, [selectedSubjectKey, subjectOptions]);

  const selectedSubjectOption = subjectOptions.find(option => option.key === selectedSubjectKey);

  useEffect(() => {
    const loadSubjectStudents = async () => {
      if (!schoolId || !selectedSubjectOption) {
        setSubjectStudentIds(null);
        setSubjectStudentsLoading(false);
        return;
      }

      setSubjectStudentsLoading(true);
      try {
        if (selectedSubjectOption.type === "course") {
          const ids = enrollments
            .filter(enrollment =>
              String(enrollment.courseId || "") === selectedSubjectOption.id
              && String(enrollment.academicYear || "").trim() === String(academicYear || "").trim()
              && semesterOverlaps(enrollment.semester, selectedSemester)
            )
            .map(enrollment => String(enrollment.studentId || ""))
            .filter(Boolean);
          setSubjectStudentIds(Array.from(new Set(ids)));
          return;
        }

        if (selectedSubjectOption.type === "club") {
          const membersSnap = await getDocs(collection(db, "school-settings", schoolId, "clubs", selectedSubjectOption.id, "members"));
          setSubjectStudentIds(membersSnap.docs.map(memberDoc => memberDoc.id));
          return;
        }

        const activity = learnerActivities.find(item => item.id === selectedSubjectOption.id);
        const membersSnap = await getDocs(collection(db, "school-settings", schoolId, "learner-activities", selectedSubjectOption.id, "members"));
        const ids = membersSnap.docs
          .map(memberDoc => memberDoc.data() as any)
          .filter(member =>
            String(member.academicYear || "").trim() === String(academicYear || "").trim()
            && semesterOverlaps(member.semester, activity?.semester ?? selectedSemester)
          )
          .map(member => String(member.studentId || ""))
          .filter(Boolean);
        setSubjectStudentIds(Array.from(new Set(ids)));
      } finally {
        setSubjectStudentsLoading(false);
      }
    };

    loadSubjectStudents();
  }, [academicYear, enrollments, learnerActivities, schoolId, selectedSemester, selectedSubjectOption?.id, selectedSubjectOption?.type]);

  const filteredStudents = useMemo(() => {
    const text = keyword.trim().toLowerCase();
    return students
      .filter(student => {
        if (subjectStudentIds) return subjectStudentIds.includes(student.id);
        const matchClass = !selectedClassLevel || classLabel(student.classLevel) === selectedClassLevel;
        const matchRoom = !selectedRoom || String(student.room || "") === selectedRoom;
        return matchClass && matchRoom;
      })
      .filter(student => {
        if (!text) return true;
        return `${getStudentCode(student)} ${getStudentName(student)} ${student.number || ""}`.toLowerCase().includes(text);
      })
      .sort(sortStudents);
  }, [keyword, selectedClassLevel, selectedRoom, students, subjectStudentIds]);

  const advisorName = useMemo(() => {
    const selected = normalizeClassValue(selectedClassLevel);
    const candidates = [
      selectedRoom ? `${selected.label}/${selectedRoom}` : "",
      selectedRoom ? `${selected.key}/${selectedRoom}` : "",
      selected.label,
      selected.key,
    ].filter(Boolean);

    const matched = teachers.find(teacher => {
      const grade = String(teacher.homeroomGrade || "").trim();
      const room = String(teacher.homeroomRoom || "").trim();
      return candidates.includes(grade) || (room && room === selectedRoom && (grade === selected.label || grade === selected.key));
    });

    return getTeacherName(matched);
  }, [selectedClassLevel, selectedRoom, teachers]);

  const counts = getGenderCounts(filteredStudents);
  const selectedSubject = selectedSubjectOption?.subject || "";
  const selectedSubjectLabel = selectedSubjectOption?.type === "club"
    ? "กิจกรรม"
    : selectedSubjectOption?.type === "activity"
      ? "กิจกรรมพัฒนาผู้เรียน"
      : "วิชา";

  const handleExportPdf = async () => {
    setExporting(true);
    try {
      const data: PdfData = {
        schoolName: schoolSettings.schoolName || (currentUser as any)?.schoolName || "โรงเรียน",
        logoUrl: schoolSettings.logoUrl || "/Epp5 online.png",
        academicYear,
        semester: selectedSemester || currentSemester,
        classLevel: selectedClassLevel,
        room: selectedRoom,
        subjectLabel: selectedSubjectLabel,
        subject: selectedSubject,
        advisorName,
        students: filteredStudents,
      };
      const blob = await pdf(<StudentListPdfDocument data={data} />).toBlob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `รายชื่อนักเรียนประจำชั้น_${selectedClassLevel}_${selectedRoom || "ทั้งหมด"}_${academicYear || "ปีการศึกษา"}.pdf`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
    } finally {
      setExporting(false);
    }
  };

  return (
    <MainLayout>
      <div className="min-h-screen bg-gray-50 px-4 py-6 text-gray-900 dark:bg-[#15161a] dark:text-white sm:px-6 lg:px-8">
        <div className="mx-auto max-w-7xl">
          <BackButton to="/academic/hub/students" className="mb-4" />

          <div className="mb-6 flex flex-col gap-4 rounded-2xl border border-gray-100 bg-white p-5 shadow-sm dark:border-gray-800 dark:bg-[#242529] lg:flex-row lg:items-center lg:justify-between">
            <div className="min-w-0">
              <div className="mb-2 inline-flex items-center gap-2 rounded-full bg-indigo-50 px-3 py-1 text-xs font-black text-indigo-600 dark:bg-indigo-500/10 dark:text-indigo-300">
                <FileText size={14} />
                PDF รายชื่อนักเรียน
              </div>
              <h1 className="text-2xl font-black tracking-tight">รายชื่อนักเรียนประจำชั้น</h1>
              <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                เลือกชั้นและห้องเพื่อพิมพ์รายชื่อนักเรียนตามแม่แบบเอกสารโรงเรียน
              </p>
            </div>
            <button
              type="button"
              onClick={handleExportPdf}
              disabled={exporting || loading || subjectStudentsLoading || filteredStudents.length === 0}
              className="inline-flex h-12 items-center justify-center gap-2.5 rounded-xl bg-red-600 px-5 text-sm font-black text-white shadow-lg shadow-red-600/25 transition hover:bg-red-500 disabled:cursor-not-allowed disabled:bg-gray-300 disabled:shadow-none dark:disabled:bg-white/10"
            >
              {exporting ? (
                <RefreshCw size={18} className="animate-spin" />
              ) : (
                <span className="relative inline-flex h-6 w-6 items-center justify-center rounded-md bg-white/15">
                  <FileText size={17} />
                  <Download size={10} className="absolute -bottom-0.5 -right-0.5 rounded-full bg-red-700 text-white" />
                </span>
              )}
              {exporting ? "กำลังสร้าง PDF" : "ส่งออก PDF"}
            </button>
          </div>

          <div className="mb-6 grid grid-cols-1 gap-3 rounded-2xl border border-gray-100 bg-white p-4 shadow-sm dark:border-gray-800 dark:bg-[#242529] md:grid-cols-5">
            <label className="space-y-1">
              <span className="text-xs font-black text-gray-500">ชั้น</span>
              <select value={selectedClassLevel} onChange={event => setSelectedClassLevel(event.target.value)} className="h-11 w-full rounded-xl border border-gray-200 bg-gray-50 px-3 text-sm font-bold outline-none focus:ring-2 focus:ring-indigo-500/20 dark:border-gray-700 dark:bg-[#1e1f21]">
                <option value="">ทุกชั้น</option>
                {classOptions.map(level => <option key={level} value={level}>{level}</option>)}
              </select>
            </label>
            <label className="space-y-1">
              <span className="text-xs font-black text-gray-500">ห้อง</span>
              <select value={selectedRoom} onChange={event => setSelectedRoom(event.target.value)} className="h-11 w-full rounded-xl border border-gray-200 bg-gray-50 px-3 text-sm font-bold outline-none focus:ring-2 focus:ring-indigo-500/20 dark:border-gray-700 dark:bg-[#1e1f21]">
                <option value="">ทุกห้อง</option>
                {roomOptions.map(room => <option key={room} value={room}>{room}</option>)}
              </select>
            </label>
            <label className="space-y-1">
              <span className="text-xs font-black text-gray-500">ภาคเรียน</span>
              <select value={selectedSemester} onChange={event => setSelectedSemester(event.target.value)} className="h-11 w-full rounded-xl border border-gray-200 bg-gray-50 px-3 text-sm font-bold outline-none focus:ring-2 focus:ring-indigo-500/20 dark:border-gray-700 dark:bg-[#1e1f21]">
                {semesterOptions.map(semester => <option key={semester} value={semester}>ภาคเรียนที่ {semester}</option>)}
              </select>
            </label>
            <label className="space-y-1">
              <span className="text-xs font-black text-gray-500">วิชา</span>
              <select value={selectedSubjectKey} onChange={event => setSelectedSubjectKey(event.target.value)} className="h-11 w-full rounded-xl border border-gray-200 bg-gray-50 px-3 text-sm font-bold outline-none focus:ring-2 focus:ring-indigo-500/20 dark:border-gray-700 dark:bg-[#1e1f21]">
                <option value="">เว้นว่าง</option>
                {subjectOptions.map(option => <option key={option.key} value={option.key}>{option.label}</option>)}
              </select>
            </label>
            <label className="space-y-1">
              <span className="text-xs font-black text-gray-500">ค้นหา</span>
              <div className="relative">
                <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                <input value={keyword} onChange={event => setKeyword(event.target.value)} placeholder="ชื่อ/รหัส" className="h-11 w-full rounded-xl border border-gray-200 bg-gray-50 pl-9 pr-3 text-sm outline-none focus:ring-2 focus:ring-indigo-500/20 dark:border-gray-700 dark:bg-[#1e1f21]" />
              </div>
            </label>
          </div>

          <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div className="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm dark:border-gray-800 dark:bg-[#242529]">
              <div className="flex items-center gap-3">
                <div className="rounded-xl bg-indigo-50 p-2 text-indigo-600 dark:bg-indigo-500/10 dark:text-indigo-300"><Users size={20} /></div>
                <div>
                  <p className="text-xs font-bold text-gray-400">นักเรียนทั้งหมด</p>
                  <p className="text-2xl font-black">{filteredStudents.length}</p>
                </div>
              </div>
            </div>
            <div className="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm dark:border-gray-800 dark:bg-[#242529]">
              <p className="text-xs font-bold text-gray-400">แยกเพศ</p>
              <p className="mt-1 text-lg font-black">ช. {counts.male} / ญ. {counts.female}</p>
            </div>
            <div className="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm dark:border-gray-800 dark:bg-[#242529]">
              <p className="text-xs font-bold text-gray-400">ครูที่ปรึกษา</p>
              <p className="mt-1 truncate text-lg font-black">{advisorName || "-"}</p>
            </div>
          </div>

          <div className="overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-sm dark:border-gray-800 dark:bg-[#242529]">
            {loading || subjectStudentsLoading ? (
              <div className="p-6"><SkeletonLoader height="360px" /></div>
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-100 dark:divide-gray-800">
                  <thead className="bg-gray-50 text-xs font-black text-gray-500 dark:bg-[#1e1f21]">
                    <tr>
                      <th className="px-4 py-3 text-center">เลขที่</th>
                      <th className="px-4 py-3 text-left">เลขประจำตัว</th>
                      <th className="px-4 py-3 text-left">ชื่อ-นามสกุล</th>
                      <th className="px-4 py-3 text-center">ชั้น/ห้อง</th>
                      <th className="px-4 py-3 text-center">สถานะ</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100 text-sm dark:divide-gray-800">
                    {filteredStudents.length === 0 ? (
                      <tr>
                        <td colSpan={5} className="px-4 py-12 text-center text-gray-400">ไม่พบนักเรียนตามเงื่อนไข</td>
                      </tr>
                    ) : filteredStudents.map((student, index) => (
                      <tr key={student.id} className="hover:bg-gray-50 dark:hover:bg-white/[0.02]">
                        <td className="px-4 py-3 text-center font-bold text-gray-500">{getStudentNumber(student, index)}</td>
                        <td className="px-4 py-3 font-mono text-gray-500">{getStudentCode(student) || "-"}</td>
                        <td className="px-4 py-3 font-bold">{getStudentName(student) || "-"}</td>
                        <td className="px-4 py-3 text-center">{classLabel(student.classLevel)}/{student.room || "-"}</td>
                        <td className="px-4 py-3 text-center text-xs font-bold text-emerald-600 dark:text-emerald-400">{getStudentStatus(student)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      </div>
    </MainLayout>
  );
};

export default HomeroomStudentListPage;
