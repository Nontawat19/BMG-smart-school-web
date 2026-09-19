import React, { useState, useEffect, useMemo } from "react";
import { collection, doc, getDoc, getDocs, query, where } from "firebase/firestore";
import { firestore } from "@/firebase";
import {
  GraduationCap,
  BookOpen,
  Award,
  Calendar,
  Layers,
  AlertCircle,
  Clock,
  Sparkles,
  TrendingUp,
  User,
  CheckCircle2,
  FileSpreadsheet
} from "lucide-react";
import SkeletonLoader from "@/components/SkeletonLoader";
import { calculateGradeFromTotal } from "@/utils/remediationUtils";
import { getCurrentThaiYear } from "@/utils/dateUtils";

interface Props {
  schoolId: string;
  studentId: string;
  studentData?: any;
}

interface EnrolledCourseGrade {
  enrollmentId: string;
  courseId: string;
  courseCode: string;
  courseTitle: string;
  courseType: string;
  credits: number;
  teacherName: string;
  groupName: string;
  formativeScore: number | null;
  midtermScore: number | null;
  finalScore: number | null;
  totalScore: number | null;
  grade: string;
  isPassed: boolean;
}

export const StudentAcademicGradesTab: React.FC<Props> = ({
  schoolId,
  studentId,
  studentData,
}) => {
  const [academicYear, setAcademicYear] = useState<string>("");
  const [semester, setSemester] = useState<string>("1");
  const [availableYears, setAvailableYears] = useState<string[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [coursesGrades, setCoursesGrades] = useState<EnrolledCourseGrade[]>([]);

  // 1. ดึงปีการศึกษาจากปฏิทินโรงเรียน (/academic/school-calendar) และจำกัดตัวเลือกเฉพาะปีที่นักเรียนลงทะเบียนจริง
  useEffect(() => {
    if (!schoolId || !studentId) return;

    let isMounted = true;
    const fetchEnrollmentYears = async () => {
      try {
        // 1.1 ดึงปีการศึกษาปัจจุบันจากปฏิทินโรงเรียน (school-calendar -> main_calendar/default)
        let defaultCalendarYear = "";
        let defaultCalendarSemester = "";
        try {
          const calSnap = await getDoc(
            doc(firestore, "school-settings", schoolId, "main_calendar", "default")
          );
          if (calSnap.exists()) {
            const calData = calSnap.data();
            defaultCalendarYear = String(calData?.academicYear || calData?.currentYear || "").trim();
            defaultCalendarSemester = String(calData?.semester || calData?.currentSemester || "").trim();
          }
        } catch (e) {
          console.warn("Could not fetch school calendar default:", e);
        }

        // 1.2 ดึงปีการศึกษาเท่าที่นักเรียนได้ลงทะเบียนเรียนจริง (Course Enrollment)
        const enrollQuery = query(
          collection(firestore, "school-settings", schoolId, "enrollments"),
          where("studentId", "==", studentId)
        );
        const snap = await getDocs(enrollQuery);
        const enrolledYearsSet = new Set<string>();

        snap.docs.forEach((d) => {
          const data = d.data();
          if (data.academicYear) enrolledYearsSet.add(String(data.academicYear).trim());
        });

        // จัดลำดับปีการศึกษาที่นักเรียนลงทะเบียนเรียนจากปีล่าสุดลงไป
        const sortedEnrolledYears = Array.from(enrolledYearsSet).sort(
          (a, b) => Number(b) - Number(a)
        );

        // ตัวเลือกปีการศึกษา: แสดงเท่าจำนวนปีการศึกษาที่ลงทะเบียนเรียน
        // (กรณีเป็นนักเรียนใหม่ยังไม่มีข้อมูล ให้ใช้ปีปัจจุบันจากปฏิทินโรงเรียนเป็นค่าเริ่มต้น)
        const finalYears =
          sortedEnrolledYears.length > 0
            ? sortedEnrolledYears
            : defaultCalendarYear
            ? [defaultCalendarYear]
            : [String(getCurrentThaiYear())];

        if (isMounted) {
          setAvailableYears(finalYears);

          // ตั้งค่าปีเริ่มต้น:
          // ถ้าปีปัจจุบันของปฏิทินโรงเรียนอยู่ในรายการที่ลงทะเบียน ให้เลือกปีนั้นเป็นค่าเริ่มต้น
          // ถ้าไม่อยู่ ให้เลือกปีล่าสุดที่ลงทะเบียนเรียน
          if (defaultCalendarYear && finalYears.includes(defaultCalendarYear)) {
            setAcademicYear((prev) => prev || defaultCalendarYear);
          } else if (finalYears.length > 0) {
            setAcademicYear((prev) => prev || finalYears[0]);
          }

          // ตั้งค่าภาคเรียนเริ่มต้นจากปฏิทินโรงเรียน (ถ้ามี)
          if (defaultCalendarSemester && (defaultCalendarSemester === "1" || defaultCalendarSemester === "2")) {
            setSemester((prev) => prev || defaultCalendarSemester);
          }
        }
      } catch (err) {
        console.error("Error loading enrollment years:", err);
      }
    };

    fetchEnrollmentYears();
    return () => {
      isMounted = false;
    };
  }, [schoolId, studentId]);

  // 2. ดึงรายวิชาที่ลงทะเบียน และคะแนน/เกรดจาก /courses/{courseId}/grades/{studentId}
  useEffect(() => {
    if (!schoolId || !studentId || !academicYear || !semester) return;

    let isMounted = true;
    setLoading(true);

    const fetchGrades = async () => {
      try {
        // 2.1 ดึงการลงทะเบียนของนักเรียนในเทอมและปีนี้
        const enrollQuery = query(
          collection(firestore, "school-settings", schoolId, "enrollments"),
          where("studentId", "==", studentId),
          where("academicYear", "==", academicYear),
          where("semester", "==", semester)
        );
        const enrollSnap = await getDocs(enrollQuery);

        if (enrollSnap.empty) {
          if (isMounted) {
            setCoursesGrades([]);
            setLoading(false);
          }
          return;
        }

        // รวบรวม courseId
        const enrollments = enrollSnap.docs.map((d) => ({
          id: d.id,
          ...d.data(),
        })) as any[];

        // 2.2 โหลดรายชื่อครู (Teachers Map) และการมอบหมายครูผู้สอน (Course Assignments) จาก /academic/course-assignment
        const [teacherSnap, assignmentsSnap] = await Promise.all([
          getDocs(collection(firestore, "school-settings", schoolId, "teachers")).catch(() => null),
          getDocs(
            query(
              collection(firestore, "school-settings", schoolId, "course_assignments"),
              where("academicYear", "==", String(academicYear))
            )
          ).catch(() => null),
        ]);

        const teacherMap: Record<string, string> = {};
        if (teacherSnap) {
          teacherSnap.docs.forEach((d) => {
            const t = d.data();
            const prefix = t.prefix || t.title || "";
            const firstName = t.firstName || "";
            const lastName = t.lastName || "";
            const fullName = `${prefix}${firstName} ${lastName}`.trim() || t.name || t.displayName || "";
            if (fullName) {
              teacherMap[d.id] = fullName;
              if (t.uid) teacherMap[t.uid] = fullName;
              if (t.id) teacherMap[t.id] = fullName;
              if (t.teacherId) teacherMap[t.teacherId] = fullName;
            }
          });
        }

        // จัดกลุ่ม assignments ตาม courseId
        const assignmentsMap: Record<string, any[]> = {};
        if (assignmentsSnap) {
          assignmentsSnap.docs.forEach((d) => {
            const data = d.data();
            const assignSem = String(data.semester || "").trim();
            if (
              !assignSem ||
              assignSem === String(semester) ||
              assignSem === "1-2" ||
              assignSem === "annual" ||
              assignSem === "0"
            ) {
              const cId = data.courseId || d.id.split("_")[0];
              if (cId) {
                if (!assignmentsMap[cId]) assignmentsMap[cId] = [];
                if (Array.isArray(data.teacherAssignments)) {
                  assignmentsMap[cId].push(...data.teacherAssignments);
                }
              }
            }
          });
        }

        // 2.3 ดึงข้อมูล Course, Grade และ Direct Assignment (ถ้ามี) ของแต่ละวิชา
        const items = await Promise.all(
          enrollments.map(async (enr) => {
            const courseId = enr.courseId;
            let courseData: any = {};
            let gradeData: any = {};
            let directAssignDocData: any = null;

            if (courseId) {
              try {
                const [courseDoc, gradeDoc] = await Promise.all([
                  getDoc(doc(firestore, "school-settings", schoolId, "courses", courseId)),
                  getDoc(doc(firestore, "school-settings", schoolId, "courses", courseId, "grades", studentId)),
                ]);

                if (courseDoc.exists()) {
                  courseData = courseDoc.data();
                }
                if (gradeDoc.exists()) {
                  gradeData = gradeDoc.data();
                }

                // หากยังไม่มี assignment ของวิชานี้ ให้ลองดึงตรงจาก doc id: `${courseId}_${academicYear}_${semester}`
                if (!assignmentsMap[courseId] || assignmentsMap[courseId].length === 0) {
                  const directDoc = await getDoc(
                    doc(firestore, "school-settings", schoolId, "course_assignments", `${courseId}_${academicYear}_${semester}`)
                  ).catch(() => null);
                  if (directDoc && directDoc.exists()) {
                    directAssignDocData = directDoc.data();
                  }
                }
              } catch (e) {
                console.warn(`Error loading grade/details for course ${courseId}:`, e);
              }
            }

            // คำนวณคะแนนและเกรด
            let formative: number | null = null;
            let midterm: number | null = null;
            let final: number | null = null;
            let total: number | null = null;
            let gradeStr = "-";

            if (gradeData) {
              if (gradeData.formative !== undefined) formative = Number(gradeData.formative);
              else if (gradeData.formativeDetails) {
                formative = Object.values(gradeData.formativeDetails).reduce(
                  (sum: number, val: any) => sum + (Number(val) || 0),
                  0
                );
              }

              if (gradeData.midterm !== undefined && gradeData.midterm !== null) {
                midterm = Number(gradeData.midterm);
              }
              if (gradeData.final !== undefined && gradeData.final !== null) {
                final = Number(gradeData.final);
              }

              if (gradeData.total !== undefined && gradeData.total !== null) {
                total = Number(gradeData.total);
              } else if (formative !== null || midterm !== null || final !== null) {
                total = (formative || 0) + (midterm || 0) + (final || 0);
              }

              if (gradeData.grade !== undefined && gradeData.grade !== "") {
                gradeStr = String(gradeData.grade);
              } else if (total !== null) {
                gradeStr = calculateGradeFromTotal(total);
              } else if (gradeData.status) {
                gradeStr = String(gradeData.status);
              }
            }

            // 2.4 ค้นหาชื่อครูผู้สอนจาก /academic/course-assignment
            let teacherAssignments: any[] = [];
            if (assignmentsMap[courseId] && assignmentsMap[courseId].length > 0) {
              teacherAssignments = assignmentsMap[courseId];
            } else if (directAssignDocData && Array.isArray(directAssignDocData.teacherAssignments)) {
              teacherAssignments = directAssignDocData.teacherAssignments;
            } else if (Array.isArray(courseData.teacherAssignments) && courseData.teacherAssignments.length > 0) {
              teacherAssignments = courseData.teacherAssignments;
            }

            let teacherName = "-";
            if (teacherAssignments.length > 0) {
              const studentGroupNum = enr.groupName ? String(enr.groupName).replace(/\D/g, "") : "";

              let matched = teacherAssignments.filter((a: any) => {
                if (!studentGroupNum) return true;
                const aGroup = String(a.groupNumber || "").replace(/\D/g, "");
                const aRoom = String(a.room || "").replace(/\D/g, "");
                return aGroup === studentGroupNum || aRoom === studentGroupNum;
              });

              if (matched.length === 0) {
                matched = teacherAssignments;
              }

              const teacherNamesSet = new Set<string>();
              matched.forEach((a: any) => {
                if (a.teacherId && teacherMap[a.teacherId]) {
                  teacherNamesSet.add(teacherMap[a.teacherId]);
                }
                if (Array.isArray(a.teacherIds)) {
                  a.teacherIds.forEach((id: string) => {
                    if (teacherMap[id]) teacherNamesSet.add(teacherMap[id]);
                  });
                }
                if (a.teacherName && a.teacherName.trim() !== "" && a.teacherName !== "-") {
                  teacherNamesSet.add(a.teacherName.trim());
                }
              });

              if (teacherNamesSet.size > 0) {
                teacherName = Array.from(teacherNamesSet).join(", ");
              }
            }

            // Fallback 1: ตรวจสอบ teacherId / teacherIds บน courseData
            if (teacherName === "-") {
              const directIds: string[] = [];
              if (courseData.teacherId) directIds.push(courseData.teacherId);
              if (Array.isArray(courseData.teacherIds)) directIds.push(...courseData.teacherIds);

              const directNames = directIds
                .map((id) => teacherMap[id])
                .filter(Boolean);

              if (directNames.length > 0) {
                teacherName = Array.from(new Set(directNames)).join(", ");
              }
            }

            // Fallback 2: ตรวจสอบ teacherName ที่ระบุไว้ใน courseData
            if (
              teacherName === "-" &&
              courseData.teacherName &&
              courseData.teacherName.trim() !== "" &&
              courseData.teacherName !== "-"
            ) {
              teacherName = courseData.teacherName.trim();
            }

            const credits = Number(courseData.credits) || 0;
            const isPassed =
              gradeStr !== "0" &&
              gradeStr !== "ร" &&
              gradeStr !== "มส" &&
              gradeStr !== "มผ" &&
              gradeStr !== "-";

            return {
              enrollmentId: enr.id,
              courseId: courseId || "",
              courseCode: courseData.code || enr.courseCode || "-",
              courseTitle: courseData.title || enr.courseTitle || "ไม่ระบุชื่อวิชา",
              courseType: courseData.type || "พื้นฐาน",
              credits,
              teacherName,
              groupName: enr.groupName || "กลุ่ม 1",
              formativeScore: formative,
              midtermScore: midterm,
              finalScore: final,
              totalScore: total,
              grade: gradeStr,
              isPassed,
            };
          })
        );

        if (isMounted) {
          // เรียงตามรหัสวิชา
          items.sort((a, b) => a.courseCode.localeCompare(b.courseCode));
          setCoursesGrades(items);
          setLoading(false);
        }
      } catch (err) {
        console.error("Error loading academic course grades:", err);
        if (isMounted) setLoading(false);
      }
    };

    fetchGrades();
    return () => {
      isMounted = false;
    };
  }, [schoolId, studentId, academicYear, semester]);

  // สรุปภาพรวมผลการเรียน (GPA, Credits)
  const summary = useMemo(() => {
    let totalCredits = 0;
    let earnedCredits = 0;
    let totalScoreSum = 0;
    let scoredCoursesCount = 0;
    let weightedGradeSum = 0;
    let validGradedCredits = 0;

    coursesGrades.forEach((c) => {
      totalCredits += c.credits;
      if (c.isPassed) {
        earnedCredits += c.credits;
      }

      if (c.totalScore !== null) {
        totalScoreSum += c.totalScore;
        scoredCoursesCount += 1;
      }

      const numGrade = parseFloat(c.grade);
      if (!isNaN(numGrade) && c.credits > 0) {
        weightedGradeSum += numGrade * c.credits;
        validGradedCredits += c.credits;
      }
    });

    const gpa = validGradedCredits > 0 ? (weightedGradeSum / validGradedCredits).toFixed(2) : "-";
    const avgScore = scoredCoursesCount > 0 ? (totalScoreSum / scoredCoursesCount).toFixed(1) : "-";

    return {
      totalCourses: coursesGrades.length,
      totalCredits,
      earnedCredits,
      gpa,
      avgScore,
    };
  }, [coursesGrades]);

  // ฟังก์ชันตกแต่งสี Badge เกรด
  const getGradeBadgeStyle = (grade: string) => {
    if (grade === "4" || grade === "3.5") {
      return "bg-emerald-50 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300 border-emerald-200 dark:border-emerald-500/30";
    }
    if (grade === "3" || grade === "2.5") {
      return "bg-indigo-50 text-indigo-700 dark:bg-indigo-500/15 dark:text-indigo-300 border-indigo-200 dark:border-indigo-500/30";
    }
    if (grade === "2" || grade === "1.5") {
      return "bg-sky-50 text-sky-700 dark:bg-sky-500/15 dark:text-sky-300 border-sky-200 dark:border-sky-500/30";
    }
    if (grade === "1") {
      return "bg-amber-50 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300 border-amber-200 dark:border-amber-500/30";
    }
    if (grade === "0" || grade === "ร" || grade === "มส" || grade === "มผ") {
      return "bg-rose-50 text-rose-700 dark:bg-rose-500/15 dark:text-rose-300 border-rose-200 dark:border-rose-500/30";
    }
    return "bg-gray-50 text-gray-700 dark:bg-gray-800 dark:text-gray-300 border-gray-200 dark:border-gray-700";
  };

  return (
    <div className="space-y-6">
      {/* Header & Term Selector */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between rounded-2xl bg-white p-5 shadow-xs border border-slate-200 dark:border-white/10 dark:bg-[#161a27]">
        <div className="flex items-center gap-3.5">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-tr from-indigo-600 to-indigo-500 text-white shadow-lg shadow-indigo-500/20">
            <GraduationCap size={24} />
          </div>
          <div>
            <h2 className="text-lg font-black tracking-tight text-slate-900 dark:text-white">
              ผลการเรียนรายวิชา
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              อ้างอิงจากรายวิชาที่ลงทะเบียนและคะแนนประเมินในระบบงานวิชาการ
            </p>
          </div>
        </div>

        {/* ตัวเลือกปีการศึกษา & ภาคเรียนแบบกะทัดรัด (Compact & Modern Segmented Toolbar) */}
        <div className="flex items-center gap-1.5 p-1 rounded-xl bg-slate-100 dark:bg-black/30 border border-slate-200/80 dark:border-white/10 shrink-0">
          {/* เลือกปีการศึกษา */}
          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-white dark:bg-[#1a1d28] border border-slate-200/60 dark:border-white/10 shadow-2xs">
            <Calendar size={13} className="text-indigo-500 dark:text-indigo-400 shrink-0" />
            <span className="text-[11px] font-bold text-slate-400">ปี</span>
            <select
              value={academicYear}
              onChange={(e) => setAcademicYear(e.target.value)}
              className="bg-transparent text-xs font-black text-slate-800 dark:text-white border-0 outline-none ring-0 focus:outline-none focus:ring-0 focus:border-0 focus-visible:outline-none focus-visible:ring-0 cursor-pointer pr-1"
              style={{ outline: "none", boxShadow: "none", border: "none" }}
            >
              {availableYears.map((yr) => (
                <option key={yr} value={yr} className="bg-white dark:bg-[#161a27] text-slate-900 dark:text-white">
                  {yr}
                </option>
              ))}
            </select>
          </div>

          <div className="h-4 w-px bg-slate-200 dark:bg-white/10 mx-0.5" />

          {/* เลือกภาคเรียนแบบ Segmented Buttons */}
          <div className="flex items-center gap-0.5">
            <button
              type="button"
              onClick={() => setSemester("1")}
              className={`px-3 py-1 text-xs font-black rounded-lg transition-all ${
                semester === "1"
                  ? "bg-white dark:bg-indigo-600 text-indigo-600 dark:text-white shadow-2xs"
                  : "text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-white"
              }`}
            >
              เทอม 1
            </button>
            <button
              type="button"
              onClick={() => setSemester("2")}
              className={`px-3 py-1 text-xs font-black rounded-lg transition-all ${
                semester === "2"
                  ? "bg-white dark:bg-indigo-600 text-indigo-600 dark:text-white shadow-2xs"
                  : "text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-white"
              }`}
            >
              เทอม 2
            </button>
          </div>
        </div>
      </div>

      {/* KPI Cards สรุปภาพรวมแบบทางการ (Official Academic Summary) */}
      <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2 lg:grid-cols-4">
        {/* GPA */}
        <div className="relative overflow-hidden rounded-2xl bg-white dark:bg-[#161a27] border border-slate-200 dark:border-white/10 p-5 shadow-xs transition-all hover:shadow-md">
          <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-indigo-600 via-indigo-500 to-indigo-400" />
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold tracking-wider text-slate-500 dark:text-slate-400 uppercase">
              เกรดเฉลี่ยประจำภาค (GPA)
            </span>
            <div className="w-9 h-9 rounded-xl bg-indigo-50 dark:bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 flex items-center justify-center shadow-xs">
              <Award size={18} />
            </div>
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <span className={`text-3xl font-black tracking-tight ${summary.gpa !== "-" ? "text-indigo-600 dark:text-indigo-400" : "text-slate-700 dark:text-slate-300"}`}>
              {loading ? "..." : summary.gpa}
            </span>
            {summary.gpa !== "-" && (
              <span className="text-xs font-bold text-slate-400">/ 4.00</span>
            )}
          </div>
          <div className="mt-3 pt-3 border-t border-slate-100 dark:border-white/5 flex items-center justify-between text-[11px] text-slate-500 dark:text-slate-400">
            <span>ภาคเรียนที่ {semester}/{academicYear}</span>
            <span className={`px-2 py-0.5 rounded-md text-[10px] font-bold ${
              summary.gpa !== "-"
                ? "bg-indigo-50 text-indigo-700 dark:bg-indigo-500/15 dark:text-indigo-300"
                : "bg-slate-100 text-slate-600 dark:bg-white/5 dark:text-slate-400"
            }`}>
              {summary.gpa !== "-" ? "ประมวลผลแล้ว" : "รอผลสอบสมบูรณ์"}
            </span>
          </div>
        </div>

        {/* หน่วยกิตที่ได้รับ */}
        <div className="relative overflow-hidden rounded-2xl bg-white dark:bg-[#161a27] border border-slate-200 dark:border-white/10 p-5 shadow-xs transition-all hover:shadow-md">
          <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-emerald-600 via-emerald-500 to-teal-400" />
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold tracking-wider text-slate-500 dark:text-slate-400 uppercase">
              หน่วยกิตที่สอบได้
            </span>
            <div className="w-9 h-9 rounded-xl bg-emerald-50 dark:bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 flex items-center justify-center shadow-xs">
              <CheckCircle2 size={18} />
            </div>
          </div>
          <div className="mt-3 flex items-baseline gap-1.5">
            <span className="text-3xl font-black text-slate-900 dark:text-white tracking-tight">
              {loading ? "..." : summary.earnedCredits}
            </span>
            <span className="text-sm font-bold text-slate-400">
              / {summary.totalCredits} หน่วยกิต
            </span>
          </div>
          <div className="mt-3 pt-3 border-t border-slate-100 dark:border-white/5 flex items-center justify-between text-[11px] text-slate-500 dark:text-slate-400">
            <span>หน่วยกิตลงทะเบียน</span>
            <span className="font-bold text-emerald-600 dark:text-emerald-400">
              {summary.totalCredits > 0 ? Math.round((summary.earnedCredits / summary.totalCredits) * 100) : 0}% ผ่านเกณฑ์
            </span>
          </div>
        </div>

        {/* คะแนนเฉลี่ยรวม */}
        <div className="relative overflow-hidden rounded-2xl bg-white dark:bg-[#161a27] border border-slate-200 dark:border-white/10 p-5 shadow-xs transition-all hover:shadow-md">
          <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-sky-600 via-sky-500 to-blue-400" />
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold tracking-wider text-slate-500 dark:text-slate-400 uppercase">
              คะแนนเฉลี่ยรวม
            </span>
            <div className="w-9 h-9 rounded-xl bg-sky-50 dark:bg-sky-500/10 text-sky-600 dark:text-sky-400 flex items-center justify-center shadow-xs">
              <TrendingUp size={18} />
            </div>
          </div>
          <div className="mt-3 flex items-baseline gap-1.5">
            <span className="text-3xl font-black text-slate-900 dark:text-white tracking-tight">
              {loading ? "..." : summary.avgScore}
            </span>
            <span className="text-xs font-bold text-slate-400">/ 100 คะแนน</span>
          </div>
          <div className="mt-3 pt-3 border-t border-slate-100 dark:border-white/5 flex items-center justify-between text-[11px] text-slate-500 dark:text-slate-400">
            <span>ฐานคะแนนมาตรฐาน</span>
            <span className="font-semibold text-sky-600 dark:text-sky-400">
              {summary.avgScore !== "-" ? `เฉลี่ย ${summary.avgScore}%` : "ยังไม่มีคะแนน"}
            </span>
          </div>
        </div>

        {/* จำนวนวิชา */}
        <div className="relative overflow-hidden rounded-2xl bg-white dark:bg-[#161a27] border border-slate-200 dark:border-white/10 p-5 shadow-xs transition-all hover:shadow-md">
          <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-slate-500 via-slate-400 to-slate-300 dark:from-slate-600 dark:to-slate-400" />
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold tracking-wider text-slate-500 dark:text-slate-400 uppercase">
              รายวิชาที่ลงทะเบียน
            </span>
            <div className="w-9 h-9 rounded-xl bg-slate-100 dark:bg-white/5 text-slate-600 dark:text-slate-300 flex items-center justify-center shadow-xs">
              <BookOpen size={18} />
            </div>
          </div>
          <div className="mt-3 flex items-baseline gap-1.5">
            <span className="text-3xl font-black text-slate-900 dark:text-white tracking-tight">
              {loading ? "..." : summary.totalCourses}
            </span>
            <span className="text-sm font-bold text-slate-400">รายวิชา</span>
          </div>
          <div className="mt-3 pt-3 border-t border-slate-100 dark:border-white/5 flex items-center justify-between text-[11px] text-slate-500 dark:text-slate-400">
            <span>หลักสูตรสถานศึกษา</span>
            <span className="font-semibold text-slate-700 dark:text-slate-300">
              {summary.totalCourses > 0 ? "ลงทะเบียนสำเร็จ" : "ไม่มีรายวิชา"}
            </span>
          </div>
        </div>
      </div>

      {/* ตารางแสดงผลการเรียน */}
      <div className="rounded-2xl border border-slate-200 bg-white shadow-xs overflow-hidden dark:border-white/10 dark:bg-[#161a27]">
        <div className="border-b border-slate-200 px-5 py-4 dark:border-white/10 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <FileSpreadsheet size={16} className="text-indigo-500" />
            <h3 className="font-bold text-sm text-slate-900 dark:text-white">
              ตารางคะแนนและผลการเรียน (ปพ.5 / ปพ.6)
            </h3>
          </div>
          <span className="text-xs text-slate-400">
            ทั้งหมด {coursesGrades.length} รายวิชา
          </span>
        </div>

        {loading ? (
          <div className="p-6 space-y-3">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="flex items-center justify-between gap-4 animate-pulse">
                <SkeletonLoader className="h-5 w-1/4 rounded-lg" />
                <SkeletonLoader className="h-5 w-1/6 rounded-lg" />
                <SkeletonLoader className="h-5 w-1/8 rounded-lg" />
                <SkeletonLoader className="h-5 w-1/12 rounded-lg" />
              </div>
            ))}
          </div>
        ) : coursesGrades.length === 0 ? (
          <div className="p-12 text-center">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-100 text-slate-400 dark:bg-white/5">
              <BookOpen size={24} />
            </div>
            <p className="mt-3 text-sm font-bold text-slate-700 dark:text-slate-200">
              ไม่พบข้อมูลรายวิชาที่ลงทะเบียน
            </p>
            <p className="mt-1 text-xs text-slate-400">
              ไม่มีการลงทะเบียนรายวิชาสำหรับภาคเรียนที่ {semester} ปีการศึกษา {academicYear}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto scrollbar-none [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden">
            <table className="w-full text-left text-xs text-slate-600 dark:text-slate-300">
              <thead className="bg-slate-50/90 text-[11px] font-bold text-slate-500 dark:bg-white/[0.03] dark:text-slate-400 border-b border-slate-200 dark:border-white/10">
                <tr>
                  <th rowSpan={2} className="py-2.5 pl-4 pr-1 w-8 text-center border-r border-slate-200/50 dark:border-white/5">#</th>
                  <th rowSpan={2} className="py-2.5 px-2.5 whitespace-nowrap border-r border-slate-200/50 dark:border-white/5">รหัสวิชา</th>
                  <th rowSpan={2} className="py-2.5 px-3 min-w-[130px] border-r border-slate-200/50 dark:border-white/5">ชื่อรายวิชา</th>
                  <th rowSpan={2} className="py-2.5 px-1.5 text-center w-14 border-r border-slate-200/50 dark:border-white/5">ประเภท</th>
                  <th rowSpan={2} className="py-2.5 px-1.5 text-center w-12 border-r border-slate-200/50 dark:border-white/5">หน่วยกิต</th>
                  <th rowSpan={2} className="py-2.5 px-2.5 min-w-[110px] max-w-[130px] border-r border-slate-200/50 dark:border-white/5">ครูผู้สอน</th>
                  <th colSpan={4} className="py-1.5 px-1 text-center font-bold border-b border-r border-slate-200/60 dark:border-white/10 bg-slate-100/50 dark:bg-white/[0.01]">
                    คะแนนประเมิน (100)
                  </th>
                  <th rowSpan={2} className="py-2.5 pl-1.5 pr-4 text-center w-14 font-black text-slate-900 dark:text-white">เกรด</th>
                </tr>
                <tr className="bg-slate-50/50 dark:bg-white/[0.01] text-[10px] font-semibold text-slate-400 dark:text-slate-400">
                  <th className="py-1.5 px-1 text-center w-11 border-r border-slate-200/40 dark:border-white/5">เก็บ</th>
                  <th className="py-1.5 px-1 text-center w-11 border-r border-slate-200/40 dark:border-white/5">กลาง</th>
                  <th className="py-1.5 px-1 text-center w-11 border-r border-slate-200/40 dark:border-white/5">ปลาย</th>
                  <th className="py-1.5 px-1 text-center w-12 font-black text-slate-700 dark:text-slate-200 border-r border-slate-200/50 dark:border-white/5">รวม</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-white/5">
                {coursesGrades.map((course, idx) => (
                  <tr
                    key={course.enrollmentId}
                    className="hover:bg-slate-50/60 dark:hover:bg-white/5 transition-colors"
                  >
                    <td className="py-3 pl-4 pr-1 text-center font-medium text-slate-400 border-r border-slate-100/60 dark:border-white/[0.02]">
                      {idx + 1}
                    </td>
                    <td className="py-3 px-2.5 font-mono font-bold text-slate-900 dark:text-white whitespace-nowrap border-r border-slate-100/60 dark:border-white/[0.02]">
                      {course.courseCode}
                    </td>
                    <td className="py-3 px-3 font-semibold text-slate-900 dark:text-white border-r border-slate-100/60 dark:border-white/[0.02]">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span>{course.courseTitle}</span>
                        {course.groupName && (
                          <span className="text-[10px] font-normal px-1.5 py-0.5 rounded bg-slate-100 dark:bg-white/5 text-slate-500 dark:text-slate-400">
                            {course.groupName}
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="py-3 px-1.5 text-center border-r border-slate-100/60 dark:border-white/[0.02]">
                      <span className="inline-block rounded-md bg-slate-100 dark:bg-white/10 px-1.5 py-0.5 text-[10px] font-bold text-slate-600 dark:text-slate-300 whitespace-nowrap">
                        {course.courseType}
                      </span>
                    </td>
                    <td className="py-3 px-1.5 text-center font-bold text-slate-800 dark:text-slate-200 border-r border-slate-100/60 dark:border-white/[0.02]">
                      {course.credits.toFixed(1)}
                    </td>
                    <td className="py-3 px-2.5 text-slate-700 dark:text-slate-300 border-r border-slate-100/60 dark:border-white/[0.02]" title={course.teacherName}>
                      <div className="truncate max-w-[130px] font-medium">
                        {course.teacherName}
                      </div>
                    </td>
                    <td className="py-3 px-1 text-center font-medium tabular-nums text-slate-600 dark:text-slate-300 border-r border-slate-100/60 dark:border-white/[0.02]">
                      {course.formativeScore !== null ? course.formativeScore : "-"}
                    </td>
                    <td className="py-3 px-1 text-center font-medium tabular-nums text-slate-600 dark:text-slate-300 border-r border-slate-100/60 dark:border-white/[0.02]">
                      {course.midtermScore !== null ? course.midtermScore : "-"}
                    </td>
                    <td className="py-3 px-1 text-center font-medium tabular-nums text-slate-600 dark:text-slate-300 border-r border-slate-100/60 dark:border-white/[0.02]">
                      {course.finalScore !== null ? course.finalScore : "-"}
                    </td>
                    <td className="py-3 px-1 text-center font-black tabular-nums text-slate-900 dark:text-white border-r border-slate-100/60 dark:border-white/[0.02]">
                      {course.totalScore !== null ? course.totalScore : "-"}
                    </td>
                    <td className="py-3 pl-1.5 pr-4 text-center">
                      <span
                        className={`inline-flex min-w-[32px] items-center justify-center rounded-lg px-2 py-0.5 text-xs font-black border ${getGradeBadgeStyle(
                          course.grade
                        )}`}
                      >
                        {course.grade}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};

export default StudentAcademicGradesTab;
