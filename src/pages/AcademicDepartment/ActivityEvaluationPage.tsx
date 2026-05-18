import React, { useEffect, useMemo, useState } from "react";
import { useSelector } from "react-redux";
import { collection, doc, getDoc, getDocs, orderBy, query, serverTimestamp, setDoc, where } from "firebase/firestore";
import { 
  Award, 
  BookOpenCheck, 
  CheckCircle2, 
  ClipboardCheck, 
  FileText, 
  RefreshCw, 
  Save, 
  Search, 
  Sparkles, 
  Users, 
  XCircle,
  TrendingUp,
  BarChart3,
  Check,
  X,
  HelpCircle,
  Filter,
  GraduationCap,
  Calendar,
  Layers,
  ChevronDown
} from "lucide-react";
import Swal from "sweetalert2";
import BackButton from "@/components/Shared/BackButton";
import MainLayout from "@/layouts/MainLayout";
import ProfileAvatar from "@/components/Shared/ProfileAvatar";
import { firestore as db } from "@/firebase";
import { RootState } from "@/store";
import { CLASSES } from "@/utils/schoolUtils";
import { getCurrentThaiYear } from "@/utils/dateUtils";

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
  subtitle: string;
  collectionName?: string;
  itemLabel: string;
  emptyText: string;
  accent: string;
  themeColor: string;
  glowColor: string;
  bannerImage: string;
}> = {
  learner: {
    title: "ประเมินกิจกรรมพัฒนาผู้เรียน",
    subtitle: "บันทึกผลการประเมิน กิจกรรมบังคับ/กิจกรรมร่วมของสถานศึกษา",
    collectionName: "learner-activities",
    itemLabel: "เลือกกิจกรรมพัฒนาผู้เรียน",
    emptyText: "ยังไม่มีกิจกรรมพัฒนาผู้เรียนในขณะนี้",
    accent: "from-teal-600 via-emerald-600 to-emerald-500 dark:from-teal-950/80 dark:via-emerald-950/50 dark:to-emerald-900/30",
    themeColor: "emerald",
    glowColor: "shadow-emerald-500/20 dark:shadow-emerald-500/5",
    bannerImage: "url('data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 width=%22100%25%22 height=%22100%25%22 viewBox=%220 0 1600 800%22%3E%3Cg %3E%3Cpath fill=%22%230d9488%22 d=%22M486 377.2c-59.7-58.5-121.2-120.2-200.7-124-78.5-3.8-156.4 51.5-224.2 108.4H0v359.8h1600V136.2l-334.8 54.4c-68.5 11.1-137.9 33.7-208.2 46.1-70.3 12.3-141.5 14.3-207.8 7.3-66.2-7-127.4-23.1-188.5-39.2-61-16.1-122-32.2-187.3-33-65.3-.8-135 13.7-200 37.3-65 23.6-125.3 56.4-187.6 98.1z%22/%3E%3C/g%3E%3C/svg%3E')",
  },
  club: {
    title: "ประเมินกิจกรรมชุมนุม",
    subtitle: "ประเมินประวัติการเข้าร่วม ความตั้งใจ และผลงานชุมนุมรายปี",
    collectionName: "clubs",
    itemLabel: "เลือกกิจกรรมชุมนุม",
    emptyText: "ยังไม่มีกิจกรรมชุมนุมในระบบ",
    accent: "from-indigo-600 via-violet-600 to-purple-500 dark:from-indigo-950/80 dark:via-violet-950/50 dark:to-purple-900/30",
    themeColor: "indigo",
    glowColor: "shadow-indigo-500/20 dark:shadow-indigo-500/5",
    bannerImage: "url('data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 width=%22100%25%22 height=%22100%25%22 viewBox=%220 0 1600 800%22%3E%3Cg %3E%3Cpath fill=%22%234f46e5%22 d=%22M486 377.2c-59.7-58.5-121.2-120.2-200.7-124-78.5-3.8-156.4 51.5-224.2 108.4H0v359.8h1600V136.2l-334.8 54.4c-68.5 11.1-137.9 33.7-208.2 46.1-70.3 12.3-141.5 14.3-207.8 7.3-66.2-7-127.4-23.1-188.5-39.2-61-16.1-122-32.2-187.3-33-65.3-.8-135 13.7-200 37.3-65 23.6-125.3 56.4-187.6 98.1z%22/%3E%3C/g%3E%3C/svg%3E')",
  },
  guidance: {
    title: "ประเมินกิจกรรมแนะแนว",
    subtitle: "บันทึกผลการพัฒนาทักษะชีวิต การแนะแนววิชาการ และอาชีพ",
    itemLabel: "ห้องเรียน",
    emptyText: "กรุณาเลือกชั้นและห้องที่ต้องการทำการประเมิน",
    accent: "from-sky-600 via-cyan-600 to-cyan-500 dark:from-sky-950/80 dark:via-cyan-950/50 dark:to-cyan-900/30",
    themeColor: "sky",
    glowColor: "shadow-sky-500/20 dark:shadow-sky-500/5",
    bannerImage: "url('data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 width=%22100%25%22 height=%22100%25%22 viewBox=%220 0 1600 800%22%3E%3Cg %3E%3Cpath fill=%22%230284c7%22 d=%22M486 377.2c-59.7-58.5-121.2-120.2-200.7-124-78.5-3.8-156.4 51.5-224.2 108.4H0v359.8h1600V136.2l-334.8 54.4c-68.5 11.1-137.9 33.7-208.2 46.1-70.3 12.3-141.5 14.3-207.8 7.3-66.2-7-127.4-23.1-188.5-39.2-61-16.1-122-32.2-187.3-33-65.3-.8-135 13.7-200 37.3-65 23.6-125.3 56.4-187.6 98.1z%22/%3E%3C/g%3E%3C/svg%3E')",
  },
};

const ActivityEvaluationPage: React.FC<ActivityEvaluationPageProps> = ({ mode }) => {
  const config = modeConfig[mode];
  const currentUser = useSelector((state: RootState) => state.auth.user);
  const { availableClassOptions } = useSelector((state: RootState) => state.schoolSettings);
  const academicYear = useSelector((state: RootState) => state.calendar.academicYear) || String(getCurrentThaiYear());
  const schoolId = (currentUser as any)?.schoolId || "";

  const [semester, setSemester] = useState("1");
  const [options, setOptions] = useState<OptionItem[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [selectedClassKey, setSelectedClassKey] = useState("");
  const [selectedRoom, setSelectedRoom] = useState("1");
  const [students, setStudents] = useState<StudentItem[]>([]);
  const [results, setResults] = useState<Record<string, EvaluationResult>>({});
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [studentsLoading, setStudentsLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (mode === "guidance") {
      setLoading(false);
      if (!selectedClassKey && availableClassOptions.length > 0) {
        setSelectedClassKey(availableClassOptions[0][0]);
      }
      return;
    }

    const loadOptions = async () => {
      if (!schoolId || !config.collectionName) return;
      setLoading(true);
      try {
        const snap = await getDocs(query(collection(db, "school-settings", schoolId, config.collectionName), orderBy("createdAt", "desc")));
        const data = snap.docs.map(item => {
          const raw = item.data() as any;
          return {
            id: item.id,
            name: raw.name || raw.title || "ไม่ระบุชื่อ",
            description: raw.description || raw.teacherName || "",
            memberCount: raw.memberCount,
          };
        });
        setOptions(data);
        if (!selectedId && data.length > 0) setSelectedId(data[0].id);
      } catch (error) {
        console.error("Error loading evaluation options:", error);
        Swal.fire("เกิดข้อผิดพลาด", `ไม่สามารถโหลด${config.itemLabel}ได้`, "error");
      } finally {
        setLoading(false);
      }
    };

    loadOptions();
  }, [schoolId, mode, config.collectionName, config.itemLabel, selectedId, availableClassOptions]);

  useEffect(() => {
    const loadStudentsAndEvaluation = async () => {
      if (!schoolId) return;
      if (mode !== "guidance" && !selectedId) return;
      if (mode === "guidance" && (!selectedClassKey || !selectedRoom)) return;

      setStudentsLoading(true);
      try {
        const roster = mode === "guidance"
          ? await fetchGuidanceStudents(schoolId, selectedClassKey, selectedRoom)
          : await fetchActivityMembers(schoolId, config.collectionName!, selectedId);

        setStudents(roster);
        const initial = roster.reduce((acc, student) => {
          acc[student.id] = { status: "pending" };
          return acc;
        }, {} as Record<string, EvaluationResult>);

        const evalRef = getEvaluationRef();
        const evalSnap = await getDoc(evalRef);
        const savedResults = evalSnap.exists() ? ((evalSnap.data().results || {}) as Record<string, EvaluationResult>) : {};
        setResults({ ...initial, ...savedResults });
      } catch (error) {
        console.error("Error loading evaluation students:", error);
        Swal.fire("เกิดข้อผิดพลาด", "ไม่สามารถโหลดรายชื่อนักเรียนได้", "error");
      } finally {
        setStudentsLoading(false);
      }
    };

    loadStudentsAndEvaluation();
  }, [schoolId, mode, selectedId, selectedClassKey, selectedRoom, semester, academicYear]);

  const getEvaluationRef = () => {
    const baseId = `${academicYear}_${semester}`;
    if (mode === "guidance") {
      return doc(db, "school-settings", schoolId, "guidance-evaluations", `${baseId}_${selectedClassKey}_${selectedRoom}`);
    }
    return doc(db, "school-settings", schoolId, config.collectionName!, selectedId, "evaluations", baseId);
  };

  const summary = useMemo(() => {
    return students.reduce((acc, student) => {
      const status = results[student.id]?.status || "pending";
      acc[status] += 1;
      return acc;
    }, { pending: 0, passed: 0, failed: 0 } as Record<EvaluationStatus, number>);
  }, [students, results]);

  const filteredStudents = useMemo(() => {
    const keyword = search.trim().toLowerCase();
    if (!keyword) return students;
    return students.filter(student => {
      const text = `${student.studentId || student.studentCode || ""} ${getStudentName(student)} ${student.classLevel || ""}/${student.room || ""}`.toLowerCase();
      return text.includes(keyword);
    });
  }, [students, search]);

  const setAllStatus = (status: EvaluationStatus) => {
    const next = { ...results };
    students.forEach(student => {
      next[student.id] = { ...(next[student.id] || {}), status };
    });
    setResults(next);
  };

  const updateStudentResult = (studentId: string, patch: Partial<EvaluationResult>) => {
    setResults(prev => ({
      ...prev,
      [studentId]: {
        status: prev[studentId]?.status || "pending",
        note: prev[studentId]?.note || "",
        ...patch,
      },
    }));
  };

  const handleSave = async () => {
    if (!schoolId || students.length === 0) return;

    setSaving(true);
    try {
      const selectedOption = options.find(item => item.id === selectedId);
      await setDoc(getEvaluationRef(), {
        schoolId,
        type: mode,
        academicYear,
        semester,
        targetId: mode === "guidance" ? `${selectedClassKey}/${selectedRoom}` : selectedId,
        targetName: mode === "guidance"
          ? `${CLASSES[selectedClassKey] || selectedClassKey}/${selectedRoom}`
          : selectedOption?.name || "",
        classId: mode === "guidance" ? selectedClassKey : null,
        room: mode === "guidance" ? selectedRoom : null,
        results,
        summary,
        updatedAt: serverTimestamp(),
        updatedBy: (currentUser as any)?.uid || "",
      }, { merge: true });

      Swal.fire({ 
        icon: "success", 
        title: "บันทึกผลการประเมินเรียบร้อยแล้ว", 
        html: `<p class="text-sm text-gray-500 font-bold">บันทึกข้อมูลเรียบร้อย ${students.length} รายการ</p>`,
        timer: 1500, 
        showConfirmButton: false,
        background: document.documentElement.classList.contains('dark') ? '#1e2025' : '#ffffff',
        color: document.documentElement.classList.contains('dark') ? '#ffffff' : '#000000',
      });
    } catch (error) {
      console.error("Error saving activity evaluation:", error);
      Swal.fire("เกิดข้อผิดพลาด", "ไม่สามารถบันทึกผลประเมินได้", "error");
    } finally {
      setSaving(false);
    }
  };

  const statsGauges = useMemo(() => {
    const total = students.length || 1;
    return {
      passedPercent: Math.round((summary.passed / total) * 100),
      failedPercent: Math.round((summary.failed / total) * 100),
      pendingPercent: Math.round((summary.pending / total) * 100),
    };
  }, [students, summary]);

  const activeOptionLabel = useMemo(() => {
    if (mode === "guidance") {
      return `${CLASSES[selectedClassKey] || selectedClassKey}/${selectedRoom}`;
    }
    const currentAct = options.find(o => o.id === selectedId);
    return currentAct ? currentAct.name : "กรุณาเลือกกิจกรรม";
  }, [mode, selectedId, selectedClassKey, selectedRoom, options]);

  return (
    <MainLayout>
      <div className="min-h-screen bg-slate-50/50 dark:bg-[#080a0f] text-slate-800 dark:text-slate-200 transition-colors duration-300 pb-16">
        <div className="mx-auto max-w-7xl px-4 py-8 space-y-6">
          
          {/* ================= 1. BREADCRUMBS & TOP NAVIGATION ================= */}
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <BackButton to="/academic/hub/evaluation" />
              <div className="h-4 w-px bg-slate-300 dark:bg-slate-800" />
              <div className="flex items-center gap-1.5 text-xs font-bold text-slate-400">
                <span>ฝ่ายวิชาการ</span>
                <span>/</span>
                <span>ระบบประเมินผล</span>
                <span>/</span>
                <span className="text-slate-600 dark:text-slate-300 font-extrabold">{config.title}</span>
              </div>
            </div>
            
            <button 
              onClick={handleSave} 
              disabled={saving || students.length === 0} 
              className="inline-flex h-11 items-center gap-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-xs font-black text-white px-6 shadow-lg shadow-indigo-600/10 hover:shadow-indigo-600/25 active:scale-[0.98] transition-all disabled:opacity-50"
            >
              {saving ? <RefreshCw size={14} className="animate-spin" /> : <Save size={14} />}
              บันทึกการประเมินทั้งหมด
            </button>
          </div>

          {/* ================= 2. EXECUTIVE HERO BANNER ================= */}
          <header className={`relative overflow-hidden rounded-3xl bg-gradient-to-r ${config.accent} p-6 md:p-8 text-white shadow-xl ${config.glowColor} border border-white/10 dark:border-white/5`}>
            {/* Fancy pattern background overlay */}
            <div className="absolute inset-0 opacity-10 bg-no-repeat bg-cover pointer-events-none mix-blend-overlay" style={{ backgroundImage: config.bannerImage }}></div>
            <div className="absolute -right-20 -top-20 w-96 h-96 rounded-full bg-white/5 blur-3xl pointer-events-none"></div>
            
            <div className="relative flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between z-10">
              <div>
                <div className="mb-2.5 inline-flex items-center gap-1.5 rounded-full bg-white/25 dark:bg-white/10 px-3.5 py-1 text-[10px] font-black uppercase tracking-wider backdrop-blur-md border border-white/10">
                  <Sparkles size={11} className="text-amber-300 animate-pulse" />
                  Academic Evaluation Room
                </div>
                <h1 className="text-2xl md:text-3xl font-black tracking-tight drop-shadow-sm flex items-center gap-3">
                  <GraduationCap size={32} className="text-white/90" />
                  {config.title}
                </h1>
                <p className="mt-1.5 text-xs md:text-sm font-bold text-white/80 dark:text-gray-300 max-w-xl leading-relaxed">
                  {config.subtitle} คัดกรองและประเมินผลสัมฤทธิ์ตามเกณฑ์การประเมินมาตรฐานกระทรวงศึกษาธิการ
                </p>
              </div>

              {/* STATS GUAGES ROW */}
              <div className="grid grid-cols-3 gap-3 md:gap-4 shrink-0 bg-black/10 dark:bg-black/20 p-4 rounded-2xl border border-white/10 backdrop-blur-md w-full lg:w-auto">
                <SummaryGaugeCard 
                  label="ผ่านเกณฑ์" 
                  value={summary.passed} 
                  percent={statsGauges.passedPercent}
                  tone="emerald" 
                  icon={<CheckCircle2 size={15} />}
                />
                <SummaryGaugeCard 
                  label="ไม่ผ่านเกณฑ์" 
                  value={summary.failed} 
                  percent={statsGauges.failedPercent}
                  tone="rose" 
                  icon={<XCircle size={15} />}
                />
                <SummaryGaugeCard 
                  label="ค้างประเมิน" 
                  value={summary.pending} 
                  percent={statsGauges.pendingPercent}
                  tone="amber" 
                  icon={<HelpCircle size={15} />}
                />
              </div>
            </div>
          </header>

          {/* ================= 3. UNIFIED HORIZONTAL CONTROL PANEL ================= */}
          <div className="rounded-2xl bg-white dark:bg-[#121520] p-4 md:p-5 shadow-sm border border-slate-100 dark:border-gray-800/80 transition-all duration-300 flex flex-col gap-4">
            
            {/* ROW 1: PRIMARY SELECTION FILTERS */}
            <div className="flex flex-wrap items-end gap-4 w-full">
              <div className="flex-1 min-w-[120px] md:max-w-[160px]">
                <InlineField label="ปีการศึกษา" icon={<Calendar size={13} />}>
                  <div className="h-11 flex items-center px-4 rounded-xl border border-slate-200 dark:border-slate-800/80 bg-slate-50/50 dark:bg-slate-900/30 text-slate-500 font-bold text-xs">
                    ปีการศึกษา {academicYear}
                  </div>
                </InlineField>
              </div>

              <div className="flex-1 min-w-[140px] md:max-w-[180px]">
                <InlineField label="ภาคเรียน" icon={<Layers size={13} />}>
                  <div className="relative">
                    <select 
                      value={semester} 
                      onChange={(e) => setSemester(e.target.value)} 
                      className="input-select"
                    >
                      <option value="1">ภาคเรียนที่ 1</option>
                      <option value="2">ภาคเรียนที่ 2</option>
                    </select>
                    <ChevronDown size={14} className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                  </div>
                </InlineField>
              </div>

              {mode === "guidance" ? (
                <>
                  <div className="flex-1 min-w-[160px] md:max-w-[200px]">
                    <InlineField label="ระดับชั้น" icon={<GraduationCap size={13} />}>
                      <div className="relative">
                        <select 
                          value={selectedClassKey} 
                          onChange={(e) => setSelectedClassKey(e.target.value)} 
                          className="input-select"
                        >
                          {availableClassOptions.map(([key, label]) => (
                            <option key={key} value={key}>{label}</option>
                          ))}
                        </select>
                        <ChevronDown size={14} className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                      </div>
                    </InlineField>
                  </div>
                  
                  <div className="flex-1 min-w-[120px] md:max-w-[160px]">
                    <InlineField label="ห้องเรียน" icon={<Users size={13} />}>
                      <div className="relative">
                        <select 
                          value={selectedRoom} 
                          onChange={(e) => setSelectedRoom(e.target.value)} 
                          className="input-select"
                        >
                          {Array.from({ length: 15 }, (_, i) => String(i + 1)).map(room => (
                            <option key={room} value={room}>ห้อง {room}</option>
                          ))}
                        </select>
                        <ChevronDown size={14} className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                      </div>
                    </InlineField>
                  </div>
                </>
              ) : (
                <div className="flex-1 min-w-[260px]">
                  <InlineField label={config.itemLabel} icon={<BookOpenCheck size={13} />}>
                    <div className="relative">
                      <select 
                        value={selectedId} 
                        onChange={(e) => setSelectedId(e.target.value)} 
                        className="input-select"
                      >
                        {options.length > 0 ? (
                          options.map(item => (
                            <option key={item.id} value={item.id}>
                              {item.name} {item.memberCount ? `(${item.memberCount} คน)` : ""}
                            </option>
                          ))
                        ) : (
                          <option value="">ไม่มีตัวเลือกกิจกรรม</option>
                        )}
                      </select>
                      <ChevronDown size={14} className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                    </div>
                  </InlineField>
                </div>
              )}
            </div>

            {/* DIVIDER LINE */}
            <div className="h-px bg-slate-100 dark:bg-slate-800/60 w-full" />

            {/* ROW 2: SEARCH & BATCH COMMANDS */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
              
              {/* SEARCH BAR */}
              <div className="relative flex-1 max-w-md">
                <Search size={14} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
                <input 
                  value={search} 
                  onChange={(e) => setSearch(e.target.value)} 
                  placeholder="ค้นหาชื่อ รหัสนักเรียน หรือห้องเรียน..." 
                  className="h-10 w-full rounded-xl border border-slate-200 dark:border-slate-800/80 bg-slate-50/50 dark:bg-[#0f121a] pl-10 pr-4 text-xs font-bold outline-none focus:border-indigo-500 focus:bg-white dark:focus:bg-[#0f121a] focus:ring-1 focus:ring-indigo-500 transition duration-200" 
                />
              </div>

              {/* COMPACT BATCH ACTIONS PANEL */}
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-[10px] font-black uppercase text-slate-400 dark:text-slate-500 mr-2 flex items-center gap-1">
                  <Award size={13} className="text-amber-500" />
                  ประเมินด่วนแบบกลุ่ม:
                </span>
                
                <button 
                  onClick={() => setAllStatus("passed")} 
                  className="flex h-9 items-center gap-1.5 rounded-lg px-3 text-[11px] font-black bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200/50 dark:bg-emerald-950/20 dark:hover:bg-emerald-950/30 dark:text-emerald-400 dark:border-emerald-900/30 transition-all hover:scale-[1.02]"
                >
                  <Check size={11} strokeWidth={3} />
                  ผ่านทั้งหมด
                </button>

                <button 
                  onClick={() => setAllStatus("failed")} 
                  className="flex h-9 items-center gap-1.5 rounded-lg px-3 text-[11px] font-black bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200/50 dark:bg-rose-950/20 dark:hover:bg-rose-950/30 dark:text-rose-400 dark:border-rose-900/30 transition-all hover:scale-[1.02]"
                >
                  <X size={11} strokeWidth={3} />
                  ไม่ผ่านทั้งหมด
                </button>

                <button 
                  onClick={() => setAllStatus("pending")} 
                  className="flex h-9 items-center gap-1.5 rounded-lg px-3 text-[11px] font-black bg-slate-50 hover:bg-slate-100 text-slate-700 border border-slate-200 dark:bg-slate-900/30 dark:hover:bg-slate-900/50 dark:text-slate-400 dark:border-slate-800 transition-all hover:scale-[1.02]"
                >
                  <RefreshCw size={11} />
                  ล้างเป็นรอตรวจ
                </button>
              </div>

            </div>

          </div>

          {/* ================= 4. ROSTER CONTAINER (FULL-WIDTH 12-COLS) ================= */}
          <div className="rounded-2xl bg-white dark:bg-[#121520] shadow-sm border border-slate-100 dark:border-gray-800/80 overflow-hidden transition-all duration-300">
            
            {/* TABLE SUMMARY BAR */}
            <div className="border-b border-slate-100 dark:border-slate-800/80 px-6 py-4 flex items-center justify-between bg-slate-50/50 dark:bg-[#161a27]/30">
              <div className="flex items-center gap-2">
                <Users size={16} className="text-indigo-500" />
                <span className="text-xs font-black text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                  เป้าหมาย: <span className="text-slate-800 dark:text-white font-extrabold">{activeOptionLabel}</span>
                </span>
              </div>
              <span className="bg-indigo-50 dark:bg-indigo-950/40 text-indigo-600 dark:text-indigo-400 px-2.5 py-1 rounded-lg font-black text-[10px] border border-indigo-100 dark:border-indigo-900/30">
                พบนักเรียนทั้งหมด {filteredStudents.length} คน
              </span>
            </div>

            {/* MAIN LIST LOADER & CONTENTS */}
            {loading || studentsLoading ? (
              <div className="flex flex-col items-center justify-center py-24 text-slate-400">
                <RefreshCw className="mb-4 animate-spin text-indigo-500" size={40} />
                <p className="font-extrabold text-sm">กำลังโหลดบัญชีรายชื่อนักเรียน...</p>
                <p className="text-xs text-slate-400/80 mt-1">กรุณารอสักครู่ ระบบกำลังจัดเตรียมข้อมูล</p>
              </div>
            ) : filteredStudents.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-24 text-center text-slate-400">
                <div className="w-16 h-16 rounded-full bg-slate-50 dark:bg-slate-900 flex items-center justify-center mb-4 text-slate-300 dark:text-slate-700">
                  <Users size={32} />
                </div>
                <p className="font-black text-base">{config.emptyText}</p>
                <p className="text-xs text-slate-400/80 mt-1.5">ไม่พบข้อมูลที่ตรงกับเงื่อนไขการค้นหาของคุณในระบบ</p>
              </div>
            ) : (
              <div className="divide-y divide-slate-100 dark:divide-slate-800/80">
                
                {/* TABLE GRID HEADER (DESKTOP) */}
                <div className="hidden md:grid grid-cols-[80px_1fr_280px_200px] gap-4 px-6 py-3.5 bg-slate-50/20 dark:bg-[#1a1f2b]/10 text-[10px] font-black uppercase text-slate-400 dark:text-slate-500 tracking-wider border-b border-slate-100 dark:border-slate-800/50">
                  <span className="text-center">เลขที่</span>
                  <span>ข้อมูลนักเรียน</span>
                  <span className="text-center">ผลการประเมินพัฒนาการ</span>
                  <span>หมายเหตุ / ความคิดเห็นเพิ่มเติม</span>
                </div>

                {/* STUDENTS LIST ROWS */}
                {filteredStudents.map((student, idx) => {
                  const result = results[student.id] || { status: "pending" };
                  const studentNo = student.studentNumber || student.number || String(idx + 1);
                  
                  // Style configurations based on status
                  const statusColors = {
                    passed: "border-l-4 border-l-emerald-500 dark:bg-emerald-950/5 hover:bg-emerald-500/[0.03] dark:hover:bg-emerald-500/[0.02]",
                    failed: "border-l-4 border-l-rose-500 dark:bg-rose-950/5 hover:bg-rose-500/[0.03] dark:hover:bg-rose-500/[0.02]",
                    pending: "border-l-4 border-l-amber-500/80 hover:bg-slate-50 dark:hover:bg-[#1a1e2b]/20"
                  }[result.status];

                  return (
                    <div 
                      key={student.id} 
                      className={`grid grid-cols-1 md:grid-cols-[80px_1fr_280px_200px] gap-3 md:gap-4 p-5 items-center transition-all duration-300 ${statusColors}`}
                    >
                      {/* NO. BADGE */}
                      <div className="flex items-center gap-3 md:justify-center">
                        <span className="md:hidden text-[10px] font-black uppercase text-slate-400">เลขที่:</span>
                        <span className="w-8 h-8 rounded-lg bg-slate-100 dark:bg-slate-800/80 flex items-center justify-center text-xs font-black text-slate-600 dark:text-slate-400 border border-slate-200/20">
                          {studentNo}
                        </span>
                      </div>

                      {/* STUDENT BIO CARD */}
                      <div className="flex items-center gap-3.5 min-w-0">
                        <ProfileAvatar 
                          src={student.profileImageUrl || ""} 
                          alt={getStudentName(student)} 
                          className="h-10 w-10 shrink-0 border border-slate-200/50 dark:border-slate-800" 
                        />
                        <div className="min-w-0">
                          <p className="font-extrabold text-sm text-slate-900 dark:text-white truncate">
                            {getStudentName(student)}
                          </p>
                          
                          <div className="text-[11px] font-bold text-slate-400 dark:text-slate-500 mt-1 flex flex-wrap items-center gap-1.5">
                            <span className="bg-indigo-50 dark:bg-indigo-950/50 text-indigo-600 dark:text-indigo-400 px-2 py-0.5 rounded font-black text-[9px] border border-indigo-100/30">
                              รหัส {student.studentId || student.studentCode || "-"}
                            </span>
                            <span>•</span>
                            <span className="bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded text-[10px]">
                              ชั้น {CLASSES[student.classLevel || ""] || student.classLevel || "-"}/{student.room || "-"}
                            </span>
                          </div>
                        </div>
                      </div>

                      {/* SEGMENTED SLIDER STATUS */}
                      <div className="flex flex-col items-center justify-center mt-2 md:mt-0">
                        <span className="md:hidden text-[10px] font-black uppercase text-slate-400 mb-1.5">ผลการประเมิน:</span>
                        <SegmentedStatusToggle 
                          value={result.status} 
                          onChange={(status) => updateStudentResult(student.id, { status })} 
                        />
                      </div>

                      {/* NOTE TEXT FIELD */}
                      <div className="flex flex-col mt-2 md:mt-0">
                        <span className="md:hidden text-[10px] font-black uppercase text-slate-400 mb-1.5">หมายเหตุ:</span>
                        <input
                          value={result.note || ""}
                          onChange={(e) => updateStudentResult(student.id, { note: e.target.value })}
                          placeholder="ความคิดเห็น / สาเหตุ..."
                          className="h-10 w-full rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/30 px-3 text-xs font-bold outline-none focus:border-indigo-500 focus:bg-white dark:focus:bg-[#0f121a] transition-all"
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
        .input-select { 
          width: 100%; 
          height: 44px; 
          border-radius: 0.75rem; 
          border: 1px solid rgb(226 232 240); 
          background: rgb(255 255 255); 
          padding: 0 2.5rem 0 1rem; 
          font-size: 0.8rem; 
          font-weight: 700; 
          outline: none; 
          appearance: none;
          cursor: pointer;
          transition: all 0.2s;
        }
        .dark .input-select { 
          border-color: rgba(255,255,255,0.08); 
          background: rgba(255,255,255,0.03); 
          color: white; 
        }
        .input-select:focus {
          border-color: #6366f1;
          box-shadow: 0 0 0 1px rgba(99, 102, 241, 0.2);
        }
      `}} />
    </MainLayout>
  );
};

/* ================= COMPONENT: INLINE LABEL FIELD ================= */
interface InlineFieldProps {
  label: string;
  icon: React.ReactNode;
  children: React.ReactNode;
}

const InlineField: React.FC<InlineFieldProps> = ({ label, icon, children }) => (
  <div className="flex flex-col w-full gap-1.5">
    <div className="flex items-center gap-1 text-[10px] font-black uppercase text-slate-400 dark:text-slate-500 tracking-wider">
      {icon}
      <span>{label}</span>
    </div>
    {children}
  </div>
);

/* ================= COMPONENT: PROGRESS SVG RING ================= */
interface ProgressRingProps {
  percent: number;
  colorClass: string;
  trailColorClass: string;
}

const ProgressRing: React.FC<ProgressRingProps> = ({ percent, colorClass, trailColorClass }) => {
  const radius = 20;
  const stroke = 3;
  const normalizedRadius = radius - stroke;
  const circumference = normalizedRadius * 2 * Math.PI;
  const strokeDashoffset = circumference - (percent / 100) * circumference;

  return (
    <div className="relative flex items-center justify-center shrink-0">
      <svg height={radius * 2} width={radius * 2} className="transform -rotate-90">
        <circle
          stroke="currentColor"
          fill="transparent"
          strokeWidth={stroke}
          r={normalizedRadius}
          cx={radius}
          cy={radius}
          className={trailColorClass}
        />
        <circle
          stroke="currentColor"
          fill="transparent"
          strokeWidth={stroke}
          strokeDasharray={circumference + ' ' + circumference}
          style={{ strokeDashoffset }}
          r={normalizedRadius}
          cx={radius}
          cy={radius}
          className={`${colorClass} transition-all duration-500 ease-out`}
        />
      </svg>
      <span className="absolute text-[8px] font-black text-white">{percent}%</span>
    </div>
  );
};

/* ================= COMPONENT: SUMMARY GAUGE CARD ================= */
interface SummaryGaugeCardProps {
  label: string;
  value: number;
  percent: number;
  tone: "emerald" | "rose" | "amber";
  icon: React.ReactNode;
}

const SummaryGaugeCard: React.FC<SummaryGaugeCardProps> = ({ label, value, percent, tone, icon }) => {
  const styles = {
    emerald: {
      bg: "bg-emerald-500/15 text-emerald-100 border-emerald-500/20",
      colorClass: "text-emerald-400",
      trailColorClass: "text-emerald-950/65"
    },
    rose: {
      bg: "bg-rose-500/15 text-rose-100 border-rose-500/20",
      colorClass: "text-rose-400",
      trailColorClass: "text-rose-950/65"
    },
    amber: {
      bg: "bg-amber-500/15 text-amber-100 border-amber-500/20",
      colorClass: "text-amber-400",
      trailColorClass: "text-amber-950/65"
    }
  }[tone];

  return (
    <div className={`rounded-xl border p-3 flex items-center justify-between gap-4 ${styles.bg} min-w-[110px] md:min-w-[140px] transition-all hover:scale-[1.02]`}>
      <div className="min-w-0">
        <div className="flex items-center gap-1.5 opacity-75">
          {icon}
          <span className="text-[9px] md:text-[10px] font-black uppercase tracking-wider truncate">{label}</span>
        </div>
        <p className="text-lg md:text-xl font-black mt-0.5 leading-none">{value.toLocaleString("th-TH")}</p>
      </div>
      
      {/* Dynamic SVG Circular Progress Ring */}
      <ProgressRing 
        percent={percent} 
        colorClass={styles.colorClass} 
        trailColorClass={styles.trailColorClass} 
      />
    </div>
  );
};

/* ================= COMPONENT: SEGMENTED STATUS TOGGLE ================= */
interface SegmentedStatusToggleProps {
  value: EvaluationStatus;
  onChange: (value: EvaluationStatus) => void;
}

const SegmentedStatusToggle: React.FC<SegmentedStatusToggleProps> = ({ value, onChange }) => {
  return (
    <div className="flex w-full md:w-auto bg-slate-100 dark:bg-slate-900/60 p-0.5 rounded-xl border border-slate-200/50 dark:border-slate-800/80 shadow-inner">
      <button
        onClick={() => onChange("pending")}
        className={`flex-1 md:flex-none px-4 py-1.5 text-xs font-black rounded-lg transition-all duration-300 flex items-center justify-center gap-1.5 ${
          value === "pending"
            ? "bg-white dark:bg-[#161a27] text-amber-600 dark:text-amber-400 shadow-sm border border-slate-200/20"
            : "text-slate-400 dark:text-slate-500 hover:text-slate-700 dark:hover:text-slate-300"
        }`}
      >
        <span className={`w-1.5 h-1.5 rounded-full ${value === "pending" ? "bg-amber-500 animate-pulse" : "bg-slate-300 dark:bg-slate-700"}`}></span>
        รอตรวจ
      </button>
      
      <button
        onClick={() => onChange("passed")}
        className={`flex-1 md:flex-none px-4 py-1.5 text-xs font-black rounded-lg transition-all duration-300 flex items-center justify-center gap-1.5 ${
          value === "passed"
            ? "bg-emerald-500 text-white shadow-md shadow-emerald-500/20"
            : "text-slate-400 dark:text-slate-500 hover:text-slate-700 dark:hover:text-slate-300"
        }`}
      >
        <Check size={11} strokeWidth={3} className={value === "passed" ? "opacity-100" : "opacity-40"} />
        ผ่าน
      </button>
      
      <button
        onClick={() => onChange("failed")}
        className={`flex-1 md:flex-none px-4 py-1.5 text-xs font-black rounded-lg transition-all duration-300 flex items-center justify-center gap-1.5 ${
          value === "failed"
            ? "bg-rose-500 text-white shadow-md shadow-rose-500/20"
            : "text-slate-400 dark:text-slate-500 hover:text-slate-700 dark:hover:text-slate-300"
        }`}
      >
        <X size={11} strokeWidth={3} className={value === "failed" ? "opacity-100" : "opacity-40"} />
        ไม่ผ่าน
      </button>
    </div>
  );
};

/* ================= COMPONENT: HELPER FETCHING LOGIC ================= */
const fetchActivityMembers = async (schoolId: string, collectionName: string, activityId: string) => {
  const membersSnap = await getDocs(collection(db, "school-settings", schoolId, collectionName, activityId, "members"));
  const memberRows = membersSnap.docs.map(memberDoc => ({ id: memberDoc.id, ...memberDoc.data() } as any));
  const studentIds = Array.from(new Set(memberRows.map(member => String(member.studentId || member.id || "").trim()).filter(Boolean)));
  const studentMap = await fetchStudentsByIds(schoolId, studentIds);

  return memberRows.map(member => {
    const studentId = String(member.studentId || member.id || "").trim();
    const student = studentMap[studentId] || {};
    return {
      ...student,
      id: studentId,
      studentName: member.studentName,
      studentCode: member.studentCode,
      classLevel: member.classLevel || student.classLevel,
      room: member.room || student.room,
    };
  }).filter(student => student.id);
};

const fetchStudentsByIds = async (schoolId: string, studentIds: string[]) => {
  const result: Record<string, StudentItem> = {};
  for (let i = 0; i < studentIds.length; i += 30) {
    const ids = studentIds.slice(i, i + 30);
    const snap = await getDocs(query(collection(db, "school-settings", schoolId, "students"), where("__name__", "in", ids)));
    snap.docs.forEach(studentDoc => {
      result[studentDoc.id] = { id: studentDoc.id, ...(studentDoc.data() as any) };
    });
  }
  return result;
};

const fetchGuidanceStudents = async (schoolId: string, classKey: string, room: string) => {
  const snap = await getDocs(collection(db, "school-settings", schoolId, "students"));
  const classValues = new Set([classKey, CLASSES[classKey]].filter(Boolean));
  const roomValues = new Set([room, String(Number(room)), String(Number(room)).padStart(2, "0")]);

  return snap.docs
    .map(studentDoc => ({ ...(studentDoc.data() as any), id: studentDoc.id }))
    .filter((student: any) => classValues.has(String(student.classLevel || "")) && roomValues.has(String(student.room || "")))
    .sort((a: any, b: any) => Number(a.studentNumber || a.number || 0) - Number(b.studentNumber || b.number || 0));
};

const getStudentName = (student: StudentItem) => {
  return student.studentName || `${student.title || ""}${student.firstName || ""} ${student.lastName || ""}`.trim() || "ไม่ระบุชื่อ";
};

export default ActivityEvaluationPage;
