import React, { useState, useEffect, useMemo } from "react";
import { collection, doc, getDoc, getDocs, query, where } from "firebase/firestore";
import { firestore } from "@/firebase";
import {
  Award,
  CheckCircle2,
  XCircle,
  Clock,
  Calendar,
  Compass,
  Users,
  Search,
  BookOpen,
  HelpCircle,
  Sparkles,
  Info,
  Check,
  X,
  AlertTriangle,
  UserCheck
} from "lucide-react";
import SkeletonLoader from "@/components/SkeletonLoader";
import { getCurrentThaiYear } from "@/utils/dateUtils";
import { CLASSES } from "@/utils/schoolUtils";

interface Props {
  schoolId: string;
  studentId: string;
  studentData?: any;
}

export type EvaluationCategory = "all" | "club" | "learner" | "guidance";
export type ActivityEvalStatus = "passed" | "failed" | "pending";

export interface ActivityEvaluationItem {
  id: string;
  category: "club" | "learner" | "guidance";
  categoryLabel: string;
  title: string;
  code?: string;
  description?: string;
  teacherName: string;
  status: ActivityEvalStatus;
  note?: string;
  academicYear: string;
  semester: string;
  updatedAt?: any;
}

export const StudentActivitiesEvaluationTab: React.FC<Props> = ({
  schoolId,
  studentId,
  studentData,
}) => {
  const currentThaiYear = String(getCurrentThaiYear());
  const [academicYear, setAcademicYear] = useState<string>(currentThaiYear);
  const [semester, setSemester] = useState<string>("1");
  const [availableYears, setAvailableYears] = useState<string[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [activities, setActivities] = useState<ActivityEvaluationItem[]>([]);
  const [categoryFilter, setCategoryFilter] = useState<EvaluationCategory>("all");
  const [searchQuery, setSearchQuery] = useState<string>("");

  // 1. ดึงปีการศึกษาที่นักเรียนมีประวัติ
  useEffect(() => {
    if (!schoolId || !studentId) return;

    let isMounted = true;
    const fetchYears = async () => {
      try {
        // 1. ดึงปีการศึกษาปัจจุบันจากปฏิทินโรงเรียน (/academic/school-calendar)
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

        // 2. ดึงปีการศึกษาเท่าที่นักเรียนได้ลงทะเบียนเรียนจริง (Course Enrollment)
        const enrollQuery = query(
          collection(firestore, "school-settings", schoolId, "enrollments"),
          where("studentId", "==", studentId)
        );
        const enrollSnap = await getDocs(enrollQuery);
        const enrolledYearsSet = new Set<string>();

        enrollSnap.docs.forEach((d) => {
          const y = d.data()?.academicYear;
          if (y) enrolledYearsSet.add(String(y).trim());
        });

        // ดึงจาก guidance-evaluations ถ้ามีผลประเมินแนะแนว
        try {
          const guidanceSnap = await getDocs(
            collection(firestore, "school-settings", schoolId, "guidance-evaluations")
          );
          guidanceSnap.docs.forEach((d) => {
            const data = d.data();
            if (data.results && data.results[studentId] && data.academicYear) {
              enrolledYearsSet.add(String(data.academicYear).trim());
            }
          });
        } catch (_) {}

        const sorted = Array.from(enrolledYearsSet).sort((a, b) => Number(b) - Number(a));
        const finalYears =
          sorted.length > 0
            ? sorted
            : defaultCalendarYear
            ? [defaultCalendarYear]
            : [currentThaiYear];

        if (isMounted) {
          setAvailableYears(finalYears);
          if (defaultCalendarYear && finalYears.includes(defaultCalendarYear)) {
            setAcademicYear((prev) => prev || defaultCalendarYear);
          } else if (finalYears.length > 0) {
            setAcademicYear((prev) => prev || finalYears[0]);
          }

          if (defaultCalendarSemester && (defaultCalendarSemester === "1" || defaultCalendarSemester === "2")) {
            setSemester((prev) => prev || defaultCalendarSemester);
          }
        }
      } catch (err) {
        console.error("Error fetching activity years:", err);
      }
    };

    fetchYears();
    return () => {
      isMounted = false;
    };
  }, [schoolId, studentId, currentThaiYear]);

  // 2. ดึงข้อมูลการประเมินกิจกรรมทั้ง 3 ส่วน: ชุมนุม (Clubs), กิจกรรมพัฒนาผู้เรียน (Learner), และ แนะแนว (Guidance)
  useEffect(() => {
    if (!schoolId || !studentId || !academicYear || !semester) return;

    let isMounted = true;
    setLoading(true);

    const fetchAllEvaluations = async () => {
      try {
        const items: ActivityEvaluationItem[] = [];

        // 2.0 โหลดแผนที่ครู (Teacher Map) เพื่อแสดงชื่อครูผู้รับผิดชอบ
        const teacherMap: Record<string, string> = {};
        try {
          const teacherSnap = await getDocs(
            collection(firestore, "school-settings", schoolId, "teachers")
          );
          teacherSnap.docs.forEach((d) => {
            const t = d.data();
            const fullName = `${t.prefix || t.title || ""}${t.firstName || ""} ${t.lastName || ""}`.trim() || t.name || t.displayName || "-";
            teacherMap[d.id] = fullName;
            if (t.uid) teacherMap[t.uid] = fullName;
          });
        } catch (e) {
          console.warn("Could not load teachers map:", e);
        }

        const getTeacherNames = (teacherIds?: string[], fallback?: string): string => {
          if (Array.isArray(teacherIds) && teacherIds.length > 0) {
            const names = teacherIds
              .map((id) => teacherMap[id])
              .filter(Boolean);
            if (names.length > 0) return names.join(", ");
          }
          if (fallback) return fallback;
          return "-";
        };

        // -------------------------------------------------------------
        // 2.1 ดึงกิจกรรมแนะแนว (Guidance)
        // -------------------------------------------------------------
        try {
          const studentClass = studentData?.classLevel || "";
          const studentRoom = String(studentData?.room || "");

          const guidanceSnap = await getDocs(
            collection(firestore, "school-settings", schoolId, "guidance-evaluations")
          );

          let guidanceEvaluated = false;

          guidanceSnap.docs.forEach((gDoc) => {
            const gData = gDoc.data();
            if (
              String(gData.academicYear || "") === academicYear &&
              String(gData.semester || "") === semester
            ) {
              const res = gData.results?.[studentId];
              const docClassId = String(gData.classId || "");
              const docRoom = String(gData.room || "");

              const isMatchRoom =
                Boolean(docClassId && (docClassId === studentClass || CLASSES[docClassId] === studentClass)) &&
                Boolean(docRoom && docRoom === studentRoom);

              if (res || isMatchRoom) {
                guidanceEvaluated = true;
                const rawStatus = res?.status || "pending";
                const status: ActivityEvalStatus =
                  rawStatus === "passed" ? "passed" : rawStatus === "failed" ? "failed" : "pending";

                const classNameText = CLASSES[studentClass] || studentClass;
                const targetTitle = gData.targetName || (classNameText ? `กิจกรรมแนะแนว (${classNameText}/${studentRoom})` : "กิจกรรมแนะแนว");

                items.push({
                  id: `guidance_${gDoc.id}`,
                  category: "guidance",
                  categoryLabel: "กิจกรรมแนะแนว",
                  title: targetTitle,
                  description: "การประเมินผลกิจกรรมแนะแนวประจำห้องเรียน",
                  teacherName: getTeacherNames(gData.teacherIds, gData.teacherName),
                  status,
                  note: res?.note || (status === "pending" ? "รอคุณครูบันทึกการประเมิน" : undefined),
                  academicYear,
                  semester,
                  updatedAt: gData.updatedAt,
                });
              }
            }
          });

          // ถ้านักเรียนมีข้อมูลห้องเรียน แต่ยังไม่มีเอกสารประเมินแนะแนวในเทอมนี้ ให้แสดงเป็น "รอประเมิน"
          if (!guidanceEvaluated && studentClass && studentRoom) {
            const classNameText = CLASSES[studentClass] || studentClass;
            items.push({
              id: `guidance_placeholder_${academicYear}_${semester}`,
              category: "guidance",
              categoryLabel: "กิจกรรมแนะแนว",
              title: `กิจกรรมแนะแนว (${classNameText}/${studentRoom})`,
              description: "การประเมินผลกิจกรรมแนะแนวประจำห้องเรียน",
              teacherName: "ครูประจำชั้น / ครูแนะแนว",
              status: "pending",
              note: "รอการประเมินจากครูผู้สอน",
              academicYear,
              semester,
            });
          }
        } catch (err) {
          console.error("Error fetching guidance evaluations:", err);
        }

        // -------------------------------------------------------------
        // 2.2 ดึงกิจกรรมชุมนุม (Clubs)
        // -------------------------------------------------------------
        try {
          const clubSnap = await getDocs(
            collection(firestore, "school-settings", schoolId, "clubs")
          );

          await Promise.all(
            clubSnap.docs.map(async (cDoc) => {
              const cData = cDoc.data();
              const clubId = cDoc.id;

              // เช็คการประเมินของชุมนุมในเทอมนี้
              const evalRef = doc(
                firestore,
                "school-settings",
                schoolId,
                "clubs",
                clubId,
                "evaluations",
                `${academicYear}_${semester}`
              );
              const evalSnap = await getDoc(evalRef);

              let evalResult: any = null;
              if (evalSnap.exists()) {
                const evalData = evalSnap.data();
                evalResult = evalData.results?.[studentId] || null;
              }

              // เช็คว่าเป็นสมาชิกในชุมนุมนี้หรือไม่ (หรือมีผลประเมิน)
              let isMember = Boolean(evalResult);
              if (!isMember) {
                const memberDoc = await getDoc(
                  doc(firestore, "school-settings", schoolId, "clubs", clubId, "members", studentId)
                );
                if (memberDoc.exists()) {
                  isMember = true;
                }
              }

              if (isMember) {
                const rawStatus = evalResult?.status || "pending";
                const status: ActivityEvalStatus =
                  rawStatus === "passed" ? "passed" : rawStatus === "failed" ? "failed" : "pending";

                const teachers = getTeacherNames(
                  cData.responsibleTeacherIds || cData.teacherIds,
                  cData.teacherName || cData.advisorName
                );

                items.push({
                  id: `club_${clubId}`,
                  category: "club",
                  categoryLabel: "กิจกรรมชุมนุม",
                  title: cData.name || cData.title || "กิจกรรมชุมนุม",
                  code: cData.code || cData.specialPeriodTitle,
                  description: cData.description || "กิจกรรมพัฒนาผู้เรียน ด้านชุมนุม/ชมรม",
                  teacherName: teachers,
                  status,
                  note: evalResult?.note || (status === "pending" ? "รอผลการประเมินชุมนุม" : undefined),
                  academicYear,
                  semester,
                  updatedAt: evalSnap.exists() ? evalSnap.data()?.updatedAt : undefined,
                });
              }
            })
          );
        } catch (err) {
          console.error("Error fetching club evaluations:", err);
        }

        // -------------------------------------------------------------
        // 2.3 ดึงกิจกรรมพัฒนาผู้เรียน (Learner Activities: ลูกเสือ, บำเพ็ญ, ยุวกาชาด ฯลฯ)
        // -------------------------------------------------------------
        try {
          const learnerSnap = await getDocs(
            collection(firestore, "school-settings", schoolId, "learner-activities")
          );

          await Promise.all(
            learnerSnap.docs.map(async (lDoc) => {
              const lData = lDoc.data();
              const actId = lDoc.id;

              // ตรวจสอบ evaluations subcollection
              const evalsSnap = await getDocs(
                collection(firestore, "school-settings", schoolId, "learner-activities", actId, "evaluations")
              );

              let evalResult: any = null;
              let evalUpdatedAt: any = null;

              evalsSnap.docs.forEach((eDoc) => {
                // เช็ค doc id ที่ขึ้นต้นด้วย `${academicYear}_${semester}`
                if (eDoc.id.startsWith(`${academicYear}_${semester}`)) {
                  const eData = eDoc.data();
                  if (eData.results && eData.results[studentId]) {
                    evalResult = eData.results[studentId];
                    evalUpdatedAt = eData.updatedAt;
                  }
                }
              });

              // เช็คสมาชิกภาพ
              let isMember = Boolean(evalResult);
              if (!isMember) {
                // เช็คใน members subcollection
                const memDoc = await getDoc(
                  doc(firestore, "school-settings", schoolId, "learner-activities", actId, "members", studentId)
                );
                if (memDoc.exists()) {
                  isMember = true;
                } else if (lData.classId) {
                  // เช็คระดับชั้น
                  const studentClass = studentData?.classLevel;
                  if (studentClass) {
                    const classList = Array.isArray(lData.classId) ? lData.classId : [lData.classId];
                    if (classList.includes(studentClass) || classList.some((c: string) => CLASSES[c] === studentClass)) {
                      isMember = true;
                    }
                  }
                }
              }

              if (isMember) {
                const rawStatus = evalResult?.status || "pending";
                const status: ActivityEvalStatus =
                  rawStatus === "passed" ? "passed" : rawStatus === "failed" ? "failed" : "pending";

                const teachers = getTeacherNames(
                  lData.responsibleTeacherIds || lData.teacherIds,
                  lData.teacherName
                );

                items.push({
                  id: `learner_${actId}`,
                  category: "learner",
                  categoryLabel: "กิจกรรมพัฒนาผู้เรียน",
                  title: lData.name || lData.title || "กิจกรรมพัฒนาผู้เรียน",
                  code: lData.code,
                  description: lData.description || "กิจกรรมลูกเสือ/เนตรนารี/ยุวกาชาด/เพื่อสังคม",
                  teacherName: teachers,
                  status,
                  note: evalResult?.note || (status === "pending" ? "รอผลการประเมินกิจกรรม" : undefined),
                  academicYear,
                  semester,
                  updatedAt: evalUpdatedAt,
                });
              }
            })
          );
        } catch (err) {
          console.error("Error fetching learner activity evaluations:", err);
        }

        if (isMounted) {
          // เรียงลำดับ: กิจกรรมพัฒนาผู้เรียน -> ชุมนุม -> แนะแนว
          const categoryOrder: Record<string, number> = {
            learner: 1,
            club: 2,
            guidance: 3,
          };
          items.sort((a, b) => (categoryOrder[a.category] || 99) - (categoryOrder[b.category] || 99));

          setActivities(items);
          setLoading(false);
        }
      } catch (error) {
        console.error("Error fetching all activity evaluations:", error);
        if (isMounted) setLoading(false);
      }
    };

    fetchAllEvaluations();
    return () => {
      isMounted = false;
    };
  }, [schoolId, studentId, academicYear, semester, studentData]);

  // สถิติสรุปผลการประเมิน
  const stats = useMemo(() => {
    const total = activities.length;
    const passed = activities.filter((a) => a.status === "passed").length;
    const failed = activities.filter((a) => a.status === "failed").length;
    const pending = activities.filter((a) => a.status === "pending").length;

    const passRate = total > 0 ? Math.round((passed / total) * 100) : 0;
    const isAllPassed = total > 0 && passed === total;

    return { total, passed, failed, pending, passRate, isAllPassed };
  }, [activities]);

  // กรองตามหมวดหมู่และค้นหา
  const filteredActivities = useMemo(() => {
    return activities.filter((act) => {
      if (categoryFilter !== "all" && act.category !== categoryFilter) return false;
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const matchTitle = act.title.toLowerCase().includes(q);
        const matchCode = act.code?.toLowerCase().includes(q);
        const matchTeacher = act.teacherName.toLowerCase().includes(q);
        const matchCat = act.categoryLabel.toLowerCase().includes(q);
        if (!matchTitle && !matchCode && !matchTeacher && !matchCat) return false;
      }
      return true;
    });
  }, [activities, categoryFilter, searchQuery]);

  return (
    <div className="space-y-6">
      {/* ── HEADER & CONTROLS ── */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white dark:bg-[#161a27] p-5 rounded-2xl border border-slate-200 dark:border-white/5 shadow-sm">
        <div className="flex items-center gap-3.5">
          <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-amber-500 to-orange-400 flex items-center justify-center text-white shadow-lg shadow-amber-500/20">
            <Award size={24} className="stroke-[2.2]" />
          </div>
          <div>
            <h2 className="text-lg font-black text-slate-900 dark:text-white flex items-center gap-2">
              กิจกรรมพัฒนาผู้เรียน
              <span className="text-xs font-bold px-2.5 py-0.5 rounded-full bg-amber-50 dark:bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-200 dark:border-amber-500/20">
                ผ / มผ
              </span>
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              ผลการประเมินกิจกรรมชุมนุม, กิจกรรมพัฒนาผู้เรียน และกิจกรรมแนะแนว
            </p>
          </div>
        </div>

        {/* ตัวเลือกปีการศึกษา & ภาคเรียนแบบกะทัดรัด (Compact & Modern Segmented Toolbar) */}
        <div className="flex items-center gap-1.5 p-1 rounded-xl bg-slate-100 dark:bg-black/30 border border-slate-200/80 dark:border-white/10 shrink-0">
          {/* เลือกปีการศึกษา */}
          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-white dark:bg-[#1a1d28] border border-slate-200/60 dark:border-white/10 shadow-2xs">
            <Calendar size={13} className="text-amber-500 dark:text-amber-400 shrink-0" />
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
                  ? "bg-white dark:bg-amber-600 text-amber-600 dark:text-white shadow-2xs"
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
                  ? "bg-white dark:bg-amber-600 text-amber-600 dark:text-white shadow-2xs"
                  : "text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-white"
              }`}
            >
              เทอม 2
            </button>
          </div>
        </div>
      </div>

      {/* ── KPI SUMMARY CARDS ── */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3.5">
        {/* ทั้งหมด */}
        <div className="p-4 rounded-2xl bg-white dark:bg-[#161a27] border border-slate-200 dark:border-white/5 shadow-sm flex items-center justify-between">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
              กิจกรรมทั้งหมด
            </p>
            <p className="text-2xl font-black text-slate-800 dark:text-white mt-1">
              {stats.total}
            </p>
            <p className="text-[10px] text-slate-400 mt-0.5">ในภาคเรียนนี้</p>
          </div>
          <div className="w-11 h-11 rounded-xl bg-slate-100 dark:bg-white/5 flex items-center justify-center text-slate-600 dark:text-slate-300">
            <BookOpen size={20} />
          </div>
        </div>

        {/* ผ่านเกณฑ์ (ผ) */}
        <div className="p-4 rounded-2xl bg-white dark:bg-[#161a27] border border-emerald-200/50 dark:border-emerald-500/20 shadow-sm flex items-center justify-between">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-wider text-emerald-600 dark:text-emerald-400">
              ผ่านเกณฑ์ (ผ)
            </p>
            <p className="text-2xl font-black text-emerald-600 dark:text-emerald-400 mt-1">
              {stats.passed}
            </p>
            <p className="text-[10px] text-slate-400 mt-0.5">
              คิดเป็น {stats.passRate}% ของทั้งหมด
            </p>
          </div>
          <div className="w-11 h-11 rounded-xl bg-emerald-50 dark:bg-emerald-500/10 flex items-center justify-center text-emerald-600 dark:text-emerald-400">
            <CheckCircle2 size={20} />
          </div>
        </div>

        {/* ไม่ผ่านเกณฑ์ (มผ) */}
        <div className="p-4 rounded-2xl bg-white dark:bg-[#161a27] border border-rose-200/50 dark:border-rose-500/20 shadow-sm flex items-center justify-between">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-wider text-rose-600 dark:text-rose-400">
              ไม่ผ่าน (มผ)
            </p>
            <p className="text-2xl font-black text-rose-600 dark:text-rose-400 mt-1">
              {stats.failed}
            </p>
            <p className="text-[10px] text-slate-400 mt-0.5">
              {stats.failed > 0 ? "ต้องดำเนินการซ่อมเสริม" : "ไม่มีกิจกรรมติด มผ"}
            </p>
          </div>
          <div className="w-11 h-11 rounded-xl bg-rose-50 dark:bg-rose-500/10 flex items-center justify-center text-rose-600 dark:text-rose-400">
            <XCircle size={20} />
          </div>
        </div>

        {/* รอการประเมิน */}
        <div className="p-4 rounded-2xl bg-white dark:bg-[#161a27] border border-amber-200/50 dark:border-amber-500/20 shadow-sm flex items-center justify-between">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-wider text-amber-600 dark:text-amber-400">
              รอการประเมิน
            </p>
            <p className="text-2xl font-black text-amber-600 dark:text-amber-400 mt-1">
              {stats.pending}
            </p>
            <p className="text-[10px] text-slate-400 mt-0.5">อยู่ระหว่างภาคการเรียน</p>
          </div>
          <div className="w-11 h-11 rounded-xl bg-amber-50 dark:bg-amber-500/10 flex items-center justify-center text-amber-600 dark:text-amber-400">
            <Clock size={20} />
          </div>
        </div>
      </div>

      {/* ── ALL PASSED BANNER (ถ้าผ่านครบทุกกิจกรรม) ── */}
      {stats.isAllPassed && (
        <div className="p-4 rounded-2xl bg-gradient-to-r from-emerald-500/10 via-teal-500/10 to-transparent border border-emerald-500/20 flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-emerald-500 text-white flex items-center justify-center shrink-0 shadow-md shadow-emerald-500/20">
            <Sparkles size={18} />
          </div>
          <div>
            <p className="text-sm font-black text-emerald-700 dark:text-emerald-300">
              ยอดเยี่ยม! ผ่านการประเมินกิจกรรมพัฒนาผู้เรียนครบถ้วนทุกรายการ
            </p>
            <p className="text-xs text-emerald-600/80 dark:text-emerald-400/80">
              มีผลการประเมินระดับ &quot;ผ่าน (ผ)&quot; ในภาคเรียนที่ {semester} ปีการศึกษา {academicYear}
            </p>
          </div>
        </div>
      )}

      {/* ── FAILED NOTICE (ถ้ามีไม่ผ่าน) ── */}
      {stats.failed > 0 && (
        <div className="p-4 rounded-2xl bg-rose-50 dark:bg-rose-500/10 border border-rose-200 dark:border-rose-500/30 flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-rose-500 text-white flex items-center justify-center shrink-0 shadow-md shadow-rose-500/20">
            <AlertTriangle size={18} />
          </div>
          <div>
            <p className="text-sm font-black text-rose-700 dark:text-rose-300">
              มีกิจกรรมที่ไม่ผ่านเกณฑ์การประเมิน ({stats.failed} กิจกรรม)
            </p>
            <p className="text-xs text-rose-600/80 dark:text-rose-400/80">
              กรุณาติดต่อครูผู้รับผิดชอบกิจกรรมเพื่อดำเนินการซ่อมเสริมและแก้ผลการประเมินให้เรียบร้อย
            </p>
          </div>
        </div>
      )}

      {/* ── CATEGORY FILTERS & SEARCH ── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        {/* Pills */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0 scrollbar-none">
          {[
            { id: "all", label: "ทั้งหมด", count: activities.length },
            { id: "learner", label: "กิจกรรมพัฒนาผู้เรียน", count: activities.filter((a) => a.category === "learner").length },
            { id: "club", label: "กิจกรรมชุมนุม", count: activities.filter((a) => a.category === "club").length },
            { id: "guidance", label: "กิจกรรมแนะแนว", count: activities.filter((a) => a.category === "guidance").length },
          ].map((cat) => (
            <button
              key={cat.id}
              onClick={() => setCategoryFilter(cat.id as EvaluationCategory)}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all whitespace-nowrap flex items-center gap-1.5 ${
                categoryFilter === cat.id
                  ? "bg-slate-900 dark:bg-white text-white dark:text-slate-900 shadow-sm"
                  : "bg-white dark:bg-[#161a27] text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-white/5 border border-slate-200 dark:border-white/5"
              }`}
            >
              <span>{cat.label}</span>
              <span
                className={`text-[10px] px-1.5 py-0.2 rounded-md ${
                  categoryFilter === cat.id
                    ? "bg-white/20 dark:bg-black/10 text-white dark:text-slate-900"
                    : "bg-slate-100 dark:bg-white/10 text-slate-500 dark:text-slate-400"
                }`}
              >
                {cat.count}
              </span>
            </button>
          ))}
        </div>

        {/* ค้นหา */}
        <div className="relative min-w-[200px] sm:w-64">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="ค้นหากิจกรรม, ครูผู้สอน..."
            className="w-full pl-8 pr-3 py-1.5 text-xs rounded-xl bg-white dark:bg-[#161a27] border border-slate-200 dark:border-white/10 text-slate-800 dark:text-slate-200 placeholder:text-slate-400 focus:outline-none focus:border-indigo-500"
          />
        </div>
      </div>

      {/* ── ACTIVITIES TABLE / LIST ── */}
      {loading ? (
        <div className="space-y-3">
          <SkeletonLoader className="h-12 w-full rounded-2xl" />
          <SkeletonLoader className="h-20 w-full rounded-2xl" />
          <SkeletonLoader className="h-20 w-full rounded-2xl" />
          <SkeletonLoader className="h-20 w-full rounded-2xl" />
        </div>
      ) : filteredActivities.length === 0 ? (
        <div className="py-16 text-center bg-white dark:bg-[#161a27] rounded-2xl border border-slate-200 dark:border-white/5 p-8">
          <div className="w-14 h-14 mx-auto rounded-2xl bg-amber-50 dark:bg-amber-500/10 flex items-center justify-center text-amber-500 dark:text-amber-400 mb-3">
            <Award size={28} />
          </div>
          <p className="text-sm font-black text-slate-800 dark:text-white">
            ไม่พบข้อมูลกิจกรรมพัฒนาผู้เรียน
          </p>
          <p className="text-xs text-slate-400 mt-1 max-w-sm mx-auto">
            {searchQuery
              ? `ไม่พบกิจกรรมที่ตรงกับคำค้นหา "${searchQuery}"`
              : `ไม่มีการลงทะเบียนหรือประเมินกิจกรรมในภาคเรียนที่ ${semester} ปีการศึกษา ${academicYear}`}
          </p>
        </div>
      ) : (
        <div className="bg-white dark:bg-[#161a27] rounded-2xl border border-slate-200 dark:border-white/10 overflow-hidden shadow-xs">
          {/* Table on tablet and desktop */}
          <div className="overflow-x-auto scrollbar-none [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="bg-slate-50/90 dark:bg-white/[0.03] border-b border-slate-200 dark:border-white/10 text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                  <th className="py-3.5 pl-4 pr-1 w-9 text-center border-r border-slate-200/50 dark:border-white/5">#</th>
                  <th className="py-3.5 px-3.5 w-40 whitespace-nowrap border-r border-slate-200/50 dark:border-white/5">ประเภทกิจกรรม</th>
                  <th className="py-3.5 px-4 min-w-[180px] border-r border-slate-200/50 dark:border-white/5">ชื่อกิจกรรม</th>
                  <th className="py-3.5 px-3.5 w-44 whitespace-nowrap border-r border-slate-200/50 dark:border-white/5">ครูผู้รับผิดชอบ</th>
                  <th className="py-3.5 px-3.5 min-w-[160px] border-r border-slate-200/50 dark:border-white/5">หมายเหตุ / เกณฑ์</th>
                  <th className="py-3.5 px-4 w-36 whitespace-nowrap text-center">ผลการประเมิน</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-white/5">
                {filteredActivities.map((act, idx) => {
                  // Badge styling by category
                  const categoryBadgeConfig = {
                    club: {
                      bg: "bg-indigo-50 dark:bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border-indigo-200 dark:border-indigo-500/20",
                      icon: <Users size={12} className="inline mr-1" />,
                    },
                    learner: {
                      bg: "bg-emerald-50 dark:bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-200 dark:border-emerald-500/20",
                      icon: <Compass size={12} className="inline mr-1" />,
                    },
                    guidance: {
                      bg: "bg-sky-50 dark:bg-sky-500/10 text-sky-600 dark:text-sky-400 border-sky-200 dark:border-sky-500/20",
                      icon: <BookOpen size={12} className="inline mr-1" />,
                    },
                  }[act.category];

                  // Status badge styling
                  const statusBadge = {
                    passed: {
                      label: "ผ่าน (ผ)",
                      bg: "bg-emerald-50 dark:bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-500/30",
                      icon: <Check size={14} className="stroke-[3]" />,
                    },
                    failed: {
                      label: "ไม่ผ่าน (มผ)",
                      bg: "bg-rose-50 dark:bg-rose-500/15 text-rose-700 dark:text-rose-300 border border-rose-200 dark:border-rose-500/30 animate-pulse",
                      icon: <X size={14} className="stroke-[3]" />,
                    },
                    pending: {
                      label: "รอการประเมิน",
                      bg: "bg-amber-50 dark:bg-amber-500/15 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-500/30",
                      icon: <Clock size={13} />,
                    },
                  }[act.status];

                  return (
                    <tr
                      key={act.id}
                      className="hover:bg-slate-50/60 dark:hover:bg-white/5 transition-colors"
                    >
                      {/* # ลำดับ */}
                      <td className="py-3.5 pl-4 pr-1 text-center font-medium text-slate-400 border-r border-slate-100/60 dark:border-white/[0.02]">
                        {idx + 1}
                      </td>

                      {/* ประเภท */}
                      <td className="py-3.5 px-3.5 whitespace-nowrap border-r border-slate-100/60 dark:border-white/[0.02]">
                        <span
                          className={`inline-flex items-center px-2.5 py-1 rounded-lg text-[11px] font-bold border whitespace-nowrap ${categoryBadgeConfig.bg}`}
                        >
                          {categoryBadgeConfig.icon}
                          {act.categoryLabel}
                        </span>
                      </td>

                      {/* ชื่อกิจกรรม */}
                      <td className="py-3.5 px-4 border-r border-slate-100/60 dark:border-white/[0.02]">
                        <div>
                          <p className="font-bold text-slate-900 dark:text-white text-xs">
                            {act.title}
                          </p>
                          {act.code && (
                            <p className="text-[10px] text-slate-400 font-mono mt-0.5">
                              รหัส: {act.code}
                            </p>
                          )}
                          {act.description && act.description !== act.title && (
                            <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5 leading-relaxed">
                              {act.description}
                            </p>
                          )}
                        </div>
                      </td>

                      {/* ครูผู้รับผิดชอบ */}
                      <td className="py-3.5 px-3.5 text-slate-700 dark:text-slate-300 border-r border-slate-100/60 dark:border-white/[0.02]" title={act.teacherName}>
                        <div className="font-medium text-xs whitespace-nowrap truncate max-w-[190px]">
                          {act.teacherName}
                        </div>
                      </td>

                      {/* หมายเหตุ */}
                      <td className="py-3.5 px-3.5 border-r border-slate-100/60 dark:border-white/[0.02]">
                        {act.note ? (
                          <span className="inline-flex items-center text-[11px] text-slate-600 dark:text-slate-300 bg-slate-100/80 dark:bg-white/5 px-2.5 py-1 rounded-lg whitespace-nowrap">
                            {act.note}
                          </span>
                        ) : (
                          <span className="text-slate-400 text-xs">-</span>
                        )}
                      </td>

                      {/* ผลการประเมิน (Badge ผ/มผ/รอประเมิน) */}
                      <td className="py-3.5 px-4 text-center whitespace-nowrap">
                        <span
                          className={`inline-flex items-center justify-center gap-1.5 px-3.5 py-1 rounded-xl text-xs font-black shadow-2xs whitespace-nowrap ${statusBadge.bg}`}
                        >
                          {statusBadge.icon}
                          <span>{statusBadge.label}</span>
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── FOOTER GUIDELINES ── */}
      <div className="p-4 rounded-2xl bg-slate-50 dark:bg-[#111318] border border-slate-200 dark:border-white/5 text-xs text-slate-500 dark:text-slate-400 flex items-start gap-3">
        <Info size={16} className="text-indigo-500 shrink-0 mt-0.5" />
        <div className="space-y-1">
          <p className="font-bold text-slate-700 dark:text-slate-300">
            เกณฑ์การประเมินกิจกรรมพัฒนาผู้เรียนตามหลักสูตรแกนกลาง:
          </p>
          <ul className="list-disc list-inside space-y-0.5 text-[11px]">
            <li>
              <strong>ผ่าน (ผ):</strong> ผู้เรียนมีเวลาเข้าร่วมกิจกรรมไม่น้อยกว่า 80% ปฏิบัติกิจกรรมและมีผลงาน/ชิ้นงานผ่านตามเกณฑ์ที่สถานศึกษากำหนด
            </li>
            <li>
              <strong>ไม่ผ่าน (มผ):</strong> มีเวลาเข้าร่วมไม่ถึง 80% หรือไม่ผ่านเกณฑ์การประเมิน ต้องติดต่อครูผู้สอนเพื่อเข้ารับการซ่อมเสริมตามระยะเวลาที่กำหนด
            </li>
          </ul>
        </div>
      </div>
    </div>
  );
};

export default StudentActivitiesEvaluationTab;
