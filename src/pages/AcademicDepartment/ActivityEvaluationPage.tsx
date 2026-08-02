import React, { useEffect, useMemo, useRef, useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import { collection, doc, getDoc, getDocs, query, serverTimestamp, setDoc, where } from "firebase/firestore";
import {
  BookOpenCheck,
  CheckCircle2,
  ChevronDown,
  GraduationCap,
  HelpCircle,
  RefreshCw,
  Save,
  Search,
  Users,
  XCircle,
  Check,
  X,
  ClipboardList,
} from "lucide-react";
import Swal from "sweetalert2";
import BackButton from "@/components/Shared/BackButton";
import MainLayout from "@/layouts/MainLayout";
import ProfileAvatar from "@/components/Shared/ProfileAvatar";
import { firestore as db } from "@/firebase";
import { RootState } from "@/store";
import { fetchTeachersMap } from "@/store/slices/userMapSlice";
import { CLASSES } from "@/utils/schoolUtils";
import { getCurrentThaiYear } from "@/utils/dateUtils";
import { useActivityHubSettings } from "@/hooks/useActivityHubSettings";
import {
  LearnerActivityTeacherScope,
  buildLearnerActivityEvaluationDocId,
  deriveTeacherScopesFromCourse,
  formatTeacherScopeLabel,
  scopeIncludesTeacher,
} from "@/utils/learnerActivityUtils";

type EvaluationMode = "learner" | "club" | "guidance";
type EvaluationStatus = "pending" | "passed" | "failed";

interface ActivityEvaluationPageProps {
  mode: EvaluationMode;
}

interface OptionItem {
  id: string;
  name: string;
  description?: string;
  memberCount?: number;
  courseId?: string;
  teacherScopes?: LearnerActivityTeacherScope[];
  responsibleTeacherIds?: string[];
  classId?: string | string[];
}

interface CourseItem {
  id: string;
  classId?: string | string[];
  teacherAssignments?: any[];
}

interface StudentItem {
  id: string;
  title?: string;
  firstName?: string;
  lastName?: string;
  studentId?: string;
  studentCode?: string;
  studentName?: string;
  classLevel?: string;
  room?: string;
  profileImageUrl?: string;
  studentNumber?: string;
  number?: string;
}

interface EvaluationResult {
  status: EvaluationStatus;
  note?: string;
}

const modeConfig: Record<EvaluationMode, {
  title: string;
  itemLabel: string;
  emptyText: string;
  collectionName?: string;
  color: string;
}> = {
  learner: {
    title: "ประเมินกิจกรรมพัฒนาผู้เรียน",
    itemLabel: "เลือกกิจกรรม",
    emptyText: "ยังไม่มีกิจกรรมพัฒนาผู้เรียนในขณะนี้",
    collectionName: "learner-activities",
    color: "emerald",
  },
  club: {
    title: "ประเมินกิจกรรมชุมนุม",
    itemLabel: "เลือกชุมนุม",
    emptyText: "ยังไม่มีกิจกรรมชุมนุมในระบบ",
    collectionName: "clubs",
    color: "indigo",
  },
  guidance: {
    title: "ประเมินกิจกรรมแนะแนว",
    itemLabel: "ห้องเรียน",
    emptyText: "กรุณาเลือกชั้นและห้องที่ต้องการประเมิน",
    color: "sky",
  },
};

const getStudentName = (student: StudentItem) =>
  student.studentName ||
  `${student.title || ""}${student.firstName || ""} ${student.lastName || ""}`.trim() ||
  "ไม่ระบุชื่อ";

const ActivityEvaluationPage: React.FC<ActivityEvaluationPageProps> = ({ mode }) => {
  const config = modeConfig[mode];
  const currentUser = useSelector((state: RootState) => state.auth.user);
  const { availableClassOptions } = useSelector((state: RootState) => state.schoolSettings);
  const academicYear =
    useSelector((state: RootState) => state.calendar.academicYear) || String(getCurrentThaiYear());
  const schoolId = (currentUser as any)?.schoolId || "";
  // undefined = school hasn't chosen a mode yet; treated the same as 'special-period' below.
  const { activityMode: rawActivityMode, loading: activityModeLoading } = useActivityHubSettings(schoolId);
  const activityMode = rawActivityMode ?? 'special-period';
  const { teachers: teacherMap, status: teacherMapStatus } = useSelector(
    (state: RootState) => state.userMap
  );
  const currentTeacher = useMemo(
    () =>
      Object.values(teacherMap || {}).find(
        (t: any) => t.uid === (currentUser as any)?.uid || t.id === (currentUser as any)?.uid
      ) as any,
    [teacherMap, currentUser]
  );
  const currentTeacherId = currentTeacher?.id || (currentUser as any)?.uid || "";
  const dispatch = useDispatch();

  const [semester, setSemester] = useState("1");
  const [options, setOptions] = useState<OptionItem[]>([]);
  const [courses, setCourses] = useState<CourseItem[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [selectedTeacherScopeKey, setSelectedTeacherScopeKey] = useState("");
  const [selectedClassKey, setSelectedClassKey] = useState("");
  const [selectedRoom, setSelectedRoom] = useState("1");
  const [students, setStudents] = useState<StudentItem[]>([]);
  const [results, setResults] = useState<Record<string, EvaluationResult>>({});
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [studentsLoading, setStudentsLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [courseBasedEmptyWarning, setCourseBasedEmptyWarning] = useState(false);
  const optionsLoadedForRef = useRef("");

  const selectedOption = useMemo(
    () => options.find((o) => o.id === selectedId) || null,
    [options, selectedId]
  );
  const selectedCourse = useMemo(
    () => courses.find((c) => c.id === selectedOption?.courseId) || null,
    [courses, selectedOption?.courseId]
  );
  const teacherScopes = useMemo(() => {
    if (mode !== "learner" || !selectedOption) return [];
    const scopes = deriveTeacherScopesFromCourse(selectedOption, selectedCourse, teacherMap as any);
    return currentTeacherId
      ? scopes.filter((s) => scopeIncludesTeacher(s, currentTeacherId))
      : scopes;
  }, [mode, selectedOption, selectedCourse, teacherMap, currentTeacherId]);
  const selectedTeacherScope = useMemo(
    () => teacherScopes.find((s) => s.key === selectedTeacherScopeKey) || null,
    [teacherScopes, selectedTeacherScopeKey]
  );

  useEffect(() => {
    if (schoolId && teacherMapStatus === "idle") dispatch(fetchTeachersMap(schoolId) as any);
  }, [schoolId, teacherMapStatus, dispatch]);


  useEffect(() => {
    if (!teacherScopes.some((s) => s.key === selectedTeacherScopeKey)) {
      setSelectedTeacherScopeKey(teacherScopes[0]?.key || "");
    }
  }, [teacherScopes, selectedTeacherScopeKey]);

  // Guidance mode: initialize class key from availableClassOptions
  useEffect(() => {
    if (mode !== "guidance" || availableClassOptions.length === 0) return;
    setLoading(false);
    setSelectedClassKey((prev) => prev || availableClassOptions[0][0]);
  }, [mode, availableClassOptions]);

  // Learner/club mode: load options list
  useEffect(() => {
    if (mode === "guidance") return;
    const cacheKey = `${schoolId}_${mode}`;
    const loadOptions = async () => {
      if (!schoolId || !config.collectionName) return;
      setLoading(true);
      try {
        const [snap, courseSnap] = await Promise.all([
          getDocs(collection(db, "school-settings", schoolId, config.collectionName)),
          mode === "learner"
            ? getDocs(collection(db, "school-settings", schoolId, "courses"))
            : Promise.resolve(null),
        ]);
        const data = snap.docs
          .map((d) => {
            const raw = d.data() as any;
            return {
              id: d.id,
              name: raw.name || raw.title || "ไม่ระบุชื่อ",
              description: raw.description || raw.teacherName || "",
              memberCount: raw.memberCount,
              courseId: raw.courseId,
              teacherScopes: raw.teacherScopes || [],
              responsibleTeacherIds: raw.responsibleTeacherIds || [],
              classId: raw.classId,
              createdAt: raw.createdAt,
            };
          })
          .sort((a, b) => (b.createdAt?.toMillis?.() ?? 0) - (a.createdAt?.toMillis?.() ?? 0));
        if (courseSnap)
          setCourses(courseSnap.docs.map((d) => ({ id: d.id, ...(d.data() as any) })));
        setOptions(data);
        // Auto-select first item only when loading for a new school/mode combination
        if (data.length > 0 && optionsLoadedForRef.current !== cacheKey) {
          setSelectedId(data[0].id);
          optionsLoadedForRef.current = cacheKey;
        }
      } catch (err) {
        console.error(err);
        Swal.fire("เกิดข้อผิดพลาด", `ไม่สามารถโหลด${config.itemLabel}ได้`, "error");
      } finally {
        setLoading(false);
      }
    };
    loadOptions();
  }, [schoolId, mode, config.collectionName, config.itemLabel]);

  useEffect(() => {
    const load = async () => {
      if (!schoolId) return;
      if (activityModeLoading) return;
      if (mode !== "guidance" && !selectedId) return;
      if (mode === "guidance" && (!selectedClassKey || !selectedRoom)) return;
      setStudentsLoading(true);
      setCourseBasedEmptyWarning(false);
      try {
        let roster: StudentItem[] =
          mode === "guidance"
            ? await fetchGuidanceStudents(schoolId, selectedClassKey, selectedRoom)
            : await fetchActivityMembers(
                schoolId,
                config.collectionName!,
                selectedId,
                selectedTeacherScope
              );

        // Mode 2 fallback: members subcollection is empty — derive students from class levels
        if (roster.length === 0 && mode === "learner" && activityMode === 'course-based') {
          const classLevels: string[] = selectedTeacherScope?.classLevels?.length
            ? selectedTeacherScope.classLevels
            : Array.isArray(selectedOption?.classId)
              ? selectedOption!.classId as string[]
              : selectedOption?.classId
                ? [selectedOption.classId as string]
                : [];
          const roomIds: string[] = selectedTeacherScope?.roomIds || [];
          if (classLevels.length > 0) {
            roster = await fetchStudentsByClassLevels(schoolId, classLevels, roomIds);
          } else {
            setCourseBasedEmptyWarning(true);
          }
        }

        setStudents(roster);
        const initial = roster.reduce((acc, s) => {
          acc[s.id] = { status: "pending" };
          return acc;
        }, {} as Record<string, EvaluationResult>);
        const evalSnap = await getDoc(getEvaluationRef());
        const saved = evalSnap.exists()
          ? ((evalSnap.data().results || {}) as Record<string, EvaluationResult>)
          : {};
        setResults({ ...initial, ...saved });
      } catch (err) {
        console.error(err);
        Swal.fire("เกิดข้อผิดพลาด", "ไม่สามารถโหลดรายชื่อนักเรียนได้", "error");
      } finally {
        setStudentsLoading(false);
      }
    };
    load();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [schoolId, mode, selectedId, selectedClassKey, selectedRoom, semester, academicYear, selectedTeacherScope, activityMode, activityModeLoading]);

  const getEvaluationRef = () => {
    const baseId = `${academicYear}_${semester}`;
    if (mode === "guidance")
      return doc(db, "school-settings", schoolId, "guidance-evaluations", `${baseId}_${selectedClassKey}_${selectedRoom}`);
    return doc(
      db,
      "school-settings",
      schoolId,
      config.collectionName!,
      selectedId,
      "evaluations",
      mode === "learner"
        ? buildLearnerActivityEvaluationDocId(academicYear, semester, selectedTeacherScope?.key)
        : baseId
    );
  };

  const summary = useMemo(
    () =>
      students.reduce(
        (acc, s) => {
          acc[results[s.id]?.status || "pending"] += 1;
          return acc;
        },
        { pending: 0, passed: 0, failed: 0 } as Record<EvaluationStatus, number>
      ),
    [students, results]
  );

  const filteredStudents = useMemo(() => {
    const kw = search.trim().toLowerCase();
    if (!kw) return students;
    return students.filter((s) =>
      `${s.studentId || s.studentCode || ""} ${getStudentName(s)} ${s.classLevel || ""}/${s.room || ""}`.toLowerCase().includes(kw)
    );
  }, [students, search]);

  const displaySummary = useMemo(
    () =>
      filteredStudents.reduce(
        (acc, s) => {
          acc[results[s.id]?.status || "pending"] += 1;
          return acc;
        },
        { pending: 0, passed: 0, failed: 0 } as Record<EvaluationStatus, number>
      ),
    [filteredStudents, results]
  );

  const setAllStatus = (status: EvaluationStatus) => {
    const next = { ...results };
    students.forEach((s) => { next[s.id] = { ...(next[s.id] || {}), status }; });
    setResults(next);
  };

  const updateResult = (studentId: string, patch: Partial<EvaluationResult>) => {
    setResults((prev) => ({
      ...prev,
      [studentId]: { status: prev[studentId]?.status || "pending", note: prev[studentId]?.note || "", ...patch },
    }));
  };

  const handleSave = async () => {
    if (!schoolId || students.length === 0) return;
    if (mode === "learner" && teacherScopes.length > 0 && !selectedTeacherScope) {
      Swal.fire("กรุณาเลือกครู/ห้องรับผิดชอบ", "ต้องเลือกชุดครูก่อนบันทึก", "warning");
      return;
    }
    const allPending = students.every((s) => (results[s.id]?.status ?? "pending") === "pending");
    if (allPending) {
      const confirm = await Swal.fire({
        icon: "warning",
        title: "ยังไม่ได้ประเมินนักเรียน",
        text: `นักเรียน ${students.length} คน ยังอยู่ในสถานะ "รอตรวจ" ทั้งหมด ต้องการบันทึกหรือไม่?`,
        showCancelButton: true,
        confirmButtonText: "บันทึกต่อ",
        cancelButtonText: "ยกเลิก",
        confirmButtonColor: "#6366f1",
      });
      if (!confirm.isConfirmed) return;
    }
    setSaving(true);
    try {
      await setDoc(
        getEvaluationRef(),
        {
          schoolId,
          type: mode,
          academicYear,
          semester,
          targetId: mode === "guidance" ? `${selectedClassKey}/${selectedRoom}` : selectedId,
          targetName:
            mode === "guidance"
              ? `${CLASSES[selectedClassKey] || selectedClassKey}/${selectedRoom}`
              : selectedOption?.name || "",
          classId: mode === "guidance" ? selectedClassKey : null,
          room: mode === "guidance" ? selectedRoom : null,
          teacherScopeKey: mode === "learner" ? selectedTeacherScope?.key || "" : null,
          teacherScopeLabel:
            mode === "learner" && selectedTeacherScope
              ? formatTeacherScopeLabel(selectedTeacherScope, teacherMap as any)
              : null,
          results,
          summary,
          updatedAt: serverTimestamp(),
          updatedBy: (currentUser as any)?.uid || "",
        },
        { merge: true }
      );
      Swal.fire({
        icon: "success",
        title: "บันทึกเรียบร้อย",
        html: `<p class="text-sm text-gray-500">บันทึกผลการประเมิน ${students.length} รายการ</p>`,
        timer: 1500,
        showConfirmButton: false,
        background: document.documentElement.classList.contains("dark") ? "#1e2025" : "#fff",
        color: document.documentElement.classList.contains("dark") ? "#fff" : "#000",
      });
    } catch (err) {
      console.error(err);
      Swal.fire("เกิดข้อผิดพลาด", "ไม่สามารถบันทึกผลประเมินได้", "error");
    } finally {
      setSaving(false);
    }
  };

  const pendingCount = displaySummary.pending;
  const passedCount = displaySummary.passed;
  const failedCount = displaySummary.failed;
  const total = filteredStudents.length;

  return (
    <MainLayout>
      <div className="min-h-screen bg-slate-50 dark:bg-[#0b0d14] text-slate-800 dark:text-slate-200 pb-20">

        {/* ── STICKY HEADER ── */}
        <div className="sticky top-0 z-30 bg-white/95 dark:bg-[#111318]/95 backdrop-blur border-b border-slate-200 dark:border-white/5 px-4 py-3 flex items-center justify-between gap-4 shadow-sm">
          <div className="flex items-center gap-3 min-w-0">
            <BackButton to="/academic/hub/evaluation" />
            <div className="h-5 w-px bg-slate-200 dark:bg-white/10" />
            <div className="min-w-0">
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wide">ฝ่ายวิชาการ · ระบบประเมินผล</p>
              <h1 className="text-sm font-black text-slate-800 dark:text-white truncate">{config.title}</h1>
            </div>
          </div>
          <button
            onClick={handleSave}
            disabled={saving || students.length === 0}
            className="inline-flex h-10 shrink-0 items-center gap-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 px-5 text-xs font-black text-white shadow-lg shadow-indigo-600/20 transition-all active:scale-95"
          >
            {saving ? <RefreshCw size={14} className="animate-spin" /> : <Save size={14} />}
            บันทึกผลการประเมิน
          </button>
        </div>

        <div className="mx-auto max-w-6xl px-4 py-5 space-y-4">

          {/* ── SUMMARY STATS ROW ── */}
          <div className="grid grid-cols-3 gap-3">
            <div className="rounded-2xl bg-white dark:bg-[#161a27] border border-slate-200 dark:border-white/5 p-4 flex items-center gap-3 shadow-sm">
              <div className="w-10 h-10 rounded-xl bg-emerald-50 dark:bg-emerald-500/10 flex items-center justify-center shrink-0">
                <CheckCircle2 size={20} className="text-emerald-600 dark:text-emerald-400" />
              </div>
              <div>
                <p className="text-[10px] font-bold text-slate-400 uppercase">ผ่านเกณฑ์</p>
                <p className="text-2xl font-black text-emerald-600 dark:text-emerald-400 leading-none mt-0.5">{passedCount}</p>
                <p className="text-[10px] text-slate-400 mt-0.5">{total > 0 ? Math.round((passedCount / total) * 100) : 0}% จาก {total} คน</p>
              </div>
            </div>
            <div className="rounded-2xl bg-white dark:bg-[#161a27] border border-slate-200 dark:border-white/5 p-4 flex items-center gap-3 shadow-sm">
              <div className="w-10 h-10 rounded-xl bg-rose-50 dark:bg-rose-500/10 flex items-center justify-center shrink-0">
                <XCircle size={20} className="text-rose-600 dark:text-rose-400" />
              </div>
              <div>
                <p className="text-[10px] font-bold text-slate-400 uppercase">ไม่ผ่านเกณฑ์</p>
                <p className="text-2xl font-black text-rose-600 dark:text-rose-400 leading-none mt-0.5">{failedCount}</p>
                <p className="text-[10px] text-slate-400 mt-0.5">{total > 0 ? Math.round((failedCount / total) * 100) : 0}% จาก {total} คน</p>
              </div>
            </div>
            <div className="rounded-2xl bg-white dark:bg-[#161a27] border border-slate-200 dark:border-white/5 p-4 flex items-center gap-3 shadow-sm">
              <div className="w-10 h-10 rounded-xl bg-amber-50 dark:bg-amber-500/10 flex items-center justify-center shrink-0">
                <HelpCircle size={20} className="text-amber-600 dark:text-amber-400" />
              </div>
              <div>
                <p className="text-[10px] font-bold text-slate-400 uppercase">ค้างประเมิน</p>
                <p className="text-2xl font-black text-amber-600 dark:text-amber-400 leading-none mt-0.5">{pendingCount}</p>
                <p className="text-[10px] text-slate-400 mt-0.5">{total > 0 ? Math.round((pendingCount / total) * 100) : 0}% จาก {total} คน</p>
              </div>
            </div>
          </div>

          {/* ── CONTROL PANEL ── */}
          <div className="rounded-2xl bg-white dark:bg-[#161a27] border border-slate-200 dark:border-white/5 p-4 shadow-sm space-y-4">
            {/* Filters row */}
            <div className="flex flex-wrap items-end gap-3">
              {/* ปีการศึกษา (read-only) */}
              <div className="flex flex-col gap-1 min-w-[120px]">
                <label className="text-[10px] font-black uppercase text-slate-400 tracking-wide">ปีการศึกษา</label>
                <div className="h-10 flex items-center px-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/60 text-xs font-bold text-slate-500 dark:text-slate-400">
                  {academicYear}
                </div>
              </div>

              {/* ภาคเรียน */}
              <div className="flex flex-col gap-1 min-w-[140px]">
                <label className="text-[10px] font-black uppercase text-slate-400 tracking-wide">ภาคเรียน</label>
                <div className="relative">
                  <select value={semester} onChange={(e) => setSemester(e.target.value)} className="ctrl-select">
                    <option value="1">ภาคเรียนที่ 1</option>
                    <option value="2">ภาคเรียนที่ 2</option>
                  </select>
                  <ChevronDown size={13} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                </div>
              </div>

              {mode === "guidance" ? (
                <>
                  <div className="flex flex-col gap-1 min-w-[160px]">
                    <label className="text-[10px] font-black uppercase text-slate-400 tracking-wide">ระดับชั้น</label>
                    <div className="relative">
                      <select value={selectedClassKey} onChange={(e) => setSelectedClassKey(e.target.value)} className="ctrl-select">
                        {availableClassOptions.map(([key, label]) => (
                          <option key={key} value={key}>{label}</option>
                        ))}
                      </select>
                      <ChevronDown size={13} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                    </div>
                  </div>
                  <div className="flex flex-col gap-1 min-w-[120px]">
                    <label className="text-[10px] font-black uppercase text-slate-400 tracking-wide">ห้องเรียน</label>
                    <div className="relative">
                      <select value={selectedRoom} onChange={(e) => setSelectedRoom(e.target.value)} className="ctrl-select">
                        {Array.from({ length: 20 }, (_, i) => String(i + 1)).map((r) => (
                          <option key={r} value={r}>ห้อง {r}</option>
                        ))}
                      </select>
                      <ChevronDown size={13} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                    </div>
                  </div>
                </>
              ) : (
                <>
                  <div className="flex flex-col gap-1 flex-1 min-w-[220px]">
                    <label className="text-[10px] font-black uppercase text-slate-400 tracking-wide flex items-center gap-1">
                      <BookOpenCheck size={11} /> {config.itemLabel}
                    </label>
                    <div className="relative">
                      <select value={selectedId} onChange={(e) => setSelectedId(e.target.value)} className="ctrl-select">
                        {options.length > 0 ? (
                          options.map((item) => (
                            <option key={item.id} value={item.id}>
                              {item.name}{item.memberCount ? ` (${item.memberCount} คน)` : ""}
                            </option>
                          ))
                        ) : (
                          <option value="">— ไม่มีกิจกรรม —</option>
                        )}
                      </select>
                      <ChevronDown size={13} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                    </div>
                  </div>
                  {mode === "learner" && teacherScopes.length > 0 && (
                    <div className="flex flex-col gap-1 flex-1 min-w-[220px]">
                      <label className="text-[10px] font-black uppercase text-slate-400 tracking-wide flex items-center gap-1">
                        <Users size={11} /> ครู/ห้องรับผิดชอบ
                      </label>
                      <div className="relative">
                        <select value={selectedTeacherScopeKey} onChange={(e) => setSelectedTeacherScopeKey(e.target.value)} className="ctrl-select">
                          {teacherScopes.map((scope) => (
                            <option key={scope.key} value={scope.key}>
                              {formatTeacherScopeLabel(scope, teacherMap as any)}
                            </option>
                          ))}
                        </select>
                        <ChevronDown size={13} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>

            {/* Divider */}
            <div className="h-px bg-slate-100 dark:bg-white/5" />

            {/* Search + bulk actions */}
            <div className="flex flex-wrap items-center gap-3">
              <div className="relative flex-1 min-w-[200px] max-w-sm">
                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="ค้นหาชื่อ หรือรหัสนักเรียน..."
                  className="h-10 w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800/60 pl-9 pr-4 text-xs font-bold text-slate-800 dark:text-slate-100 outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500/30 transition-all"
                />
              </div>

              <div className="flex items-center gap-2">
                <span className="text-[10px] font-bold text-slate-400 hidden sm:block">ตั้งทุกคนเป็น:</span>
                <button
                  onClick={() => setAllStatus("passed")}
                  className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-emerald-50 hover:bg-emerald-100 dark:bg-emerald-500/10 dark:hover:bg-emerald-500/20 text-emerald-700 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-500/20 px-3 text-xs font-black transition-all"
                >
                  <Check size={12} strokeWidth={3} /> ผ่านทั้งหมด
                </button>
                <button
                  onClick={() => setAllStatus("failed")}
                  className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-rose-50 hover:bg-rose-100 dark:bg-rose-500/10 dark:hover:bg-rose-500/20 text-rose-700 dark:text-rose-400 border border-rose-200 dark:border-rose-500/20 px-3 text-xs font-black transition-all"
                >
                  <X size={12} strokeWidth={3} /> ไม่ผ่านทั้งหมด
                </button>
                <button
                  onClick={() => setAllStatus("pending")}
                  className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 dark:bg-slate-700/40 dark:hover:bg-slate-700/70 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700 px-3 text-xs font-black transition-all"
                >
                  <RefreshCw size={11} /> ล้าง
                </button>
              </div>
            </div>
          </div>

          {/* ── STUDENT TABLE ── */}
          <div className="rounded-2xl bg-white dark:bg-[#161a27] border border-slate-200 dark:border-white/5 overflow-hidden shadow-sm">

            {/* Table header bar */}
            <div className="flex items-center justify-between px-5 py-3 border-b border-slate-100 dark:border-white/5 bg-slate-50/50 dark:bg-white/[0.02]">
              <div className="flex items-center gap-2 text-xs font-black text-slate-500 dark:text-slate-400">
                <ClipboardList size={15} className="text-indigo-500" />
                <span>รายชื่อนักเรียน</span>
                {selectedOption && (
                  <span className="text-indigo-600 dark:text-indigo-400">— {selectedOption.name}</span>
                )}
              </div>
              <span className="text-[10px] font-black px-2.5 py-1 rounded-lg bg-indigo-50 dark:bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border border-indigo-100 dark:border-indigo-500/20">
                {filteredStudents.length} คน
              </span>
            </div>

            {/* Column headers (desktop) */}
            {!loading && !studentsLoading && filteredStudents.length > 0 && (
              <div className="hidden md:grid grid-cols-[56px_1fr_240px_180px] gap-4 px-5 py-2.5 bg-slate-50 dark:bg-white/[0.015] border-b border-slate-100 dark:border-white/5">
                {["เลขที่", "ข้อมูลนักเรียน", "ผลการประเมิน", "หมายเหตุ"].map((h, i) => (
                  <span key={h} className={`text-[10px] font-black uppercase text-slate-400 tracking-wider ${i === 0 ? "text-center" : ""}`}>{h}</span>
                ))}
              </div>
            )}

            {/* Body */}
            {loading || studentsLoading ? (
              <div className="flex flex-col items-center justify-center py-20 text-slate-400">
                <RefreshCw size={32} className="animate-spin text-indigo-500 mb-3" />
                <p className="text-sm font-bold">กำลังโหลดรายชื่อนักเรียน...</p>
              </div>
            ) : filteredStudents.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-20 text-slate-400">
                <div className="w-14 h-14 rounded-full bg-slate-100 dark:bg-white/5 flex items-center justify-center mb-3">
                  <Users size={26} className="text-slate-300 dark:text-slate-600" />
                </div>
                <p className="font-bold text-sm">{search ? "ไม่พบนักเรียนที่ค้นหา" : config.emptyText}</p>
                {courseBasedEmptyWarning ? (
                  <p className="text-xs mt-2 text-amber-500 font-bold text-center max-w-xs">
                    ไม่พบการกำหนดระดับชั้น (classId) สำหรับกิจกรรมนี้<br />กรุณาตั้งค่า ActivityHub ให้ครบก่อนประเมิน
                  </p>
                ) : (
                  <p className="text-xs mt-1 text-slate-400/70">ไม่พบข้อมูลตามเงื่อนไขที่เลือก</p>
                )}
              </div>
            ) : (
              <div className="divide-y divide-slate-100 dark:divide-white/[0.04]">
                {filteredStudents.map((student, idx) => {
                  const result = results[student.id] || { status: "pending" as EvaluationStatus };
                  const studentNo = student.studentNumber || student.number || String(idx + 1);

                  const rowBg = {
                    passed: "border-l-4 border-l-emerald-500 bg-emerald-50/30 dark:bg-emerald-500/[0.03]",
                    failed: "border-l-4 border-l-rose-500 bg-rose-50/30 dark:bg-rose-500/[0.03]",
                    pending: "border-l-4 border-l-slate-200 dark:border-l-slate-700",
                  }[result.status];

                  return (
                    <div
                      key={student.id}
                      className={`grid grid-cols-1 md:grid-cols-[56px_1fr_240px_180px] gap-3 md:gap-4 px-4 md:px-5 py-3.5 items-center transition-colors ${rowBg} hover:bg-slate-50/60 dark:hover:bg-white/[0.02]`}
                    >
                      {/* เลขที่ */}
                      <div className="flex items-center gap-2 md:justify-center">
                        <span className="md:hidden text-[9px] font-black uppercase text-slate-400">เลขที่</span>
                        <span className="w-8 h-8 rounded-lg bg-slate-100 dark:bg-slate-700/60 flex items-center justify-center text-xs font-black text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700">
                          {studentNo}
                        </span>
                      </div>

                      {/* ข้อมูลนักเรียน */}
                      <div className="flex items-center gap-3 min-w-0">
                        <ProfileAvatar
                          src={student.profileImageUrl || `https://ui-avatars.com/api/?name=${encodeURIComponent(getStudentName(student))}&background=random&color=fff&bold=true`}
                          alt={getStudentName(student)}
                          className="h-10 w-10 shrink-0"
                        />
                        <div className="min-w-0">
                          <p className="font-black text-sm text-slate-900 dark:text-white truncate leading-tight">
                            {getStudentName(student)}
                          </p>
                          <div className="flex flex-wrap items-center gap-1.5 mt-1">
                            <span className="inline-flex items-center px-2 py-0.5 rounded-md bg-indigo-50 dark:bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border border-indigo-100 dark:border-indigo-500/20 text-[10px] font-black">
                              {student.studentId || student.studentCode || "-"}
                            </span>
                            <span className="inline-flex items-center px-2 py-0.5 rounded-md bg-slate-100 dark:bg-slate-700/60 text-slate-500 dark:text-slate-400 text-[10px] font-bold">
                              ชั้น {CLASSES[student.classLevel || ""] || student.classLevel || "-"}/{student.room || "-"}
                            </span>
                          </div>
                        </div>
                      </div>

                      {/* ผลการประเมิน */}
                      <div className="flex flex-col gap-1 md:items-stretch">
                        <span className="md:hidden text-[9px] font-black uppercase text-slate-400">ผลการประเมิน</span>
                        <StatusToggle value={result.status} onChange={(status) => updateResult(student.id, { status })} />
                      </div>

                      {/* หมายเหตุ */}
                      <div className="flex flex-col gap-1">
                        <span className="md:hidden text-[9px] font-black uppercase text-slate-400">หมายเหตุ</span>
                        <input
                          value={result.note || ""}
                          onChange={(e) => updateResult(student.id, { note: e.target.value })}
                          placeholder="หมายเหตุ / สาเหตุ..."
                          className="h-10 w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800/60 px-3 text-xs font-bold text-slate-800 dark:text-slate-100 outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500/30 transition-all placeholder:text-slate-400 dark:placeholder:text-slate-600"
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

        </div>
      </div>

      <style dangerouslySetInnerHTML={{ __html: `
        .ctrl-select {
          width: 100%;
          height: 40px;
          border-radius: 0.75rem;
          border: 1px solid rgb(226 232 240);
          background: rgb(249 250 251);
          padding: 0 2.2rem 0 0.875rem;
          font-size: 0.75rem;
          font-weight: 700;
          outline: none;
          appearance: none;
          cursor: pointer;
          transition: all 0.15s;
          color: rgb(30 41 59);
        }
        .dark .ctrl-select {
          border-color: rgb(51 65 85);
          background: rgba(30, 41, 59, 0.6);
          color: rgb(226 232 240);
        }
        .ctrl-select:focus {
          border-color: #6366f1;
          box-shadow: 0 0 0 2px rgba(99,102,241,0.15);
        }
      `}} />
    </MainLayout>
  );
};

/* ── StatusToggle: 3 states in one row ── */
const StatusToggle: React.FC<{ value: EvaluationStatus; onChange: (v: EvaluationStatus) => void }> = ({ value, onChange }) => (
  <div className="flex rounded-xl overflow-hidden border border-slate-200 dark:border-slate-700 divide-x divide-slate-200 dark:divide-slate-700 h-10">
    <button
      onClick={() => onChange("pending")}
      className={`flex-1 flex items-center justify-center gap-1 text-[11px] font-black transition-all ${
        value === "pending"
          ? "bg-amber-50 dark:bg-amber-500/15 text-amber-700 dark:text-amber-300"
          : "bg-white dark:bg-slate-800/50 text-slate-400 dark:text-slate-500 hover:bg-slate-50 dark:hover:bg-slate-700/60"
      }`}
    >
      <span className={`w-1.5 h-1.5 rounded-full ${value === "pending" ? "bg-amber-500 animate-pulse" : "bg-slate-300 dark:bg-slate-700"}`} />
      รอตรวจ
    </button>
    <button
      onClick={() => onChange("passed")}
      className={`flex-1 flex items-center justify-center gap-1 text-[11px] font-black transition-all ${
        value === "passed"
          ? "bg-emerald-500 text-white"
          : "bg-white dark:bg-slate-800/50 text-slate-400 dark:text-slate-500 hover:bg-emerald-50 dark:hover:bg-emerald-500/10 hover:text-emerald-600 dark:hover:text-emerald-400"
      }`}
    >
      <Check size={12} strokeWidth={3} />
      ผ่าน
    </button>
    <button
      onClick={() => onChange("failed")}
      className={`flex-1 flex items-center justify-center gap-1 text-[11px] font-black transition-all ${
        value === "failed"
          ? "bg-rose-500 text-white"
          : "bg-white dark:bg-slate-800/50 text-slate-400 dark:text-slate-500 hover:bg-rose-50 dark:hover:bg-rose-500/10 hover:text-rose-600 dark:hover:text-rose-400"
      }`}
    >
      <X size={12} strokeWidth={3} />
      ไม่ผ่าน
    </button>
  </div>
);

/* ── Data fetchers ── */
const BATCH_SIZE = 30;
const fetchActivityMembers = async (
  schoolId: string,
  collectionName: string,
  activityId: string,
  teacherScope?: LearnerActivityTeacherScope | null
) => {
  const snap = await getDocs(collection(db, "school-settings", schoolId, collectionName, activityId, "members"));
  const rows = snap.docs
    .map((d) => ({ id: d.id, ...d.data() } as any))
    .filter(
      (m) =>
        !teacherScope ||
        String(m.teacherScopeKey || "") === teacherScope.key ||
        scopeIncludesTeacher(teacherScope, m.teacherId) ||
        (Array.isArray(m.teacherIds) && m.teacherIds.some((id: string) => teacherScope.teacherIds.includes(String(id))))
    );
  const ids = Array.from(new Set(rows.map((m) => String(m.studentId || m.id || "").trim()).filter(Boolean)));
  const studentMap = await fetchStudentsByIds(schoolId, ids);
  return rows
    .map((m) => {
      const sid = String(m.studentId || m.id || "").trim();
      const s = studentMap[sid] || {};
      return { ...s, id: sid, studentName: m.studentName, studentCode: m.studentCode, classLevel: m.classLevel || s.classLevel, room: m.room || s.room };
    })
    .filter((s) => s.id);
};

const fetchStudentsByIds = async (schoolId: string, ids: string[]) => {
  const result: Record<string, StudentItem> = {};
  for (let i = 0; i < ids.length; i += BATCH_SIZE) {
    const chunk = ids.slice(i, i + BATCH_SIZE);
    const snap = await getDocs(query(collection(db, "school-settings", schoolId, "students"), where("__name__", "in", chunk)));
    snap.docs.forEach((d) => { result[d.id] = { id: d.id, ...(d.data() as any) }; });
  }
  return result;
};

const fetchGuidanceStudents = async (schoolId: string, classKey: string, room: string) => {
  const snap = await getDocs(collection(db, "school-settings", schoolId, "students"));
  const classValues = new Set([classKey, CLASSES[classKey]].filter(Boolean));
  const roomValues = new Set([room, String(Number(room)), String(Number(room)).padStart(2, "0")]);
  return snap.docs
    .map((d) => ({ ...(d.data() as any), id: d.id }))
    .filter((s: any) => classValues.has(String(s.classLevel || "")) && roomValues.has(String(s.room || "")))
    .sort((a: any, b: any) => Number(a.studentNumber || a.number || 0) - Number(b.studentNumber || b.number || 0));
};

const fetchStudentsByClassLevels = async (schoolId: string, classLevels: string[], roomIds: string[]) => {
  const snap = await getDocs(collection(db, "school-settings", schoolId, "students"));
  return snap.docs
    .map((d) => ({ ...(d.data() as any), id: d.id } as StudentItem))
    .filter((s: any) => {
      if (!classLevels.includes(String(s.classLevel || ""))) return false;
      if (roomIds.length > 0 && !roomIds.some((r) => String(r) === String(s.room || ""))) return false;
      return true;
    })
    .sort((a: any, b: any) => Number(a.studentNumber || a.number || 0) - Number(b.studentNumber || b.number || 0));
};

export default ActivityEvaluationPage;
