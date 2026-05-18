import React, { useEffect, useMemo, useState } from "react";
import { useSelector } from "react-redux";
import { doc, getDoc, serverTimestamp, setDoc } from "firebase/firestore";
import { Clock, Flag, Plus, Save, Settings, ShieldCheck, Trash2 } from "lucide-react";
import Swal from "sweetalert2";
import { firestore } from "@/firebase";
import MainLayout from "@/layouts/MainLayout";
import BackButton from "@/components/Shared/BackButton";
import { RootState } from "@/store";

type ScoreType = "increase" | "decrease";
type AttendanceStatusKey = "late" | "absent" | "early" | "noCheckout";
type FlagCeremonyStatusKey =
  | "normal"
  | "sickLeave"
  | "personalLeave"
  | "cancelFlag"
  | "noScanPresentNoDeduct"
  | "noScanPresentDeduct"
  | "scannedAbsentDeduct"
  | "cancelFlagKeepGate";

interface BehaviorScoreRule {
  id: string;
  title: string;
  category: string;
  type: ScoreType;
  points: number;
  isActive: boolean;
}

interface AttendanceScoreRule {
  statusKey: AttendanceStatusKey;
  statusLabel: string;
  description: string;
  points: number;
  isActive: boolean;
}

interface FlagCeremonyScoreRule {
  statusKey: FlagCeremonyStatusKey;
  statusLabel: string;
  description: string;
  points: number;
  isActive: boolean;
}

interface BehaviorScoreConfig {
  startingScore: number;
  minScore: number;
  maxScore: number;
  attendanceRules: AttendanceScoreRule[];
  flagCeremonyRules: FlagCeremonyScoreRule[];
  rules: BehaviorScoreRule[];
}

interface AttendanceConfig {
  studentLateTime: string;
  studentCheckinEnd: string;
  studentCheckoutTime: string;
  studentCheckoutEnd: string;
}

const DEFAULT_RULES: BehaviorScoreRule[] = [
  {
    id: "late-class",
    title: "เข้าเรียนสาย",
    category: "การมาเรียน",
    type: "decrease",
    points: 5,
    isActive: true
  },
  {
    id: "skip-class",
    title: "ขาดเรียน/หนีเรียน",
    category: "การมาเรียน",
    type: "decrease",
    points: 10,
    isActive: true
  },
  {
    id: "volunteer",
    title: "ช่วยงานโรงเรียน/จิตอาสา",
    category: "ความดี",
    type: "increase",
    points: 10,
    isActive: true
  }
];

const DEFAULT_CONFIG: BehaviorScoreConfig = {
  startingScore: 100,
  minScore: 0,
  maxScore: 100,
  attendanceRules: [
    {
      statusKey: "late",
      statusLabel: "สาย",
      description: "ลงเวลาเข้าหลังเวลาเข้าเรียน",
      points: 5,
      isActive: true
    },
    {
      statusKey: "absent",
      statusLabel: "ขาด",
      description: "ไม่ลงเวลาเข้าภายในเวลาที่กำหนด",
      points: 10,
      isActive: true
    },
    {
      statusKey: "early",
      statusLabel: "กลับก่อน",
      description: "ลงเวลาออกก่อนเวลาเลิกเรียน",
      points: 5,
      isActive: true
    },
    {
      statusKey: "noCheckout",
      statusLabel: "ไม่ลงเวลาออก",
      description: "ลงเวลาเข้าแล้วไม่มีเวลาออกเมื่อประมวลผลประจำวัน",
      points: 3,
      isActive: true
    }
  ],
  flagCeremonyRules: [
    {
      statusKey: "normal",
      statusLabel: "เข้าแถวปกติ",
      description: "มาเข้าแถวตามปกติ ไม่ตัดคะแนน",
      points: 0,
      isActive: false
    },
    {
      statusKey: "sickLeave",
      statusLabel: "ลาป่วย",
      description: "บันทึกลา ไม่ตัดคะแนนจากเช็คแถว",
      points: 0,
      isActive: false
    },
    {
      statusKey: "personalLeave",
      statusLabel: "ลากิจ",
      description: "บันทึกลา ไม่ตัดคะแนนจากเช็คแถว",
      points: 0,
      isActive: false
    },
    {
      statusKey: "cancelFlag",
      statusLabel: "ยกเลิกการเช็คแถว",
      description: "ยกเลิกข้อมูลเช็คแถว ไม่ตัดคะแนน",
      points: 0,
      isActive: false
    },
    {
      statusKey: "noScanPresentNoDeduct",
      statusLabel: "ไม่สแกนแต่มาเข้าแถวไม่หักคะแนน",
      description: "ลงเวลาปกติและไม่ตัดคะแนน",
      points: 0,
      isActive: false
    },
    {
      statusKey: "noScanPresentDeduct",
      statusLabel: "ไม่สแกนแต่มาเข้าแถวและหักคะแนน",
      description: "ไม่ลงเวลา/บัตร Lock แต่ครูยืนยันว่ามาเข้าแถว",
      points: 5,
      isActive: true
    },
    {
      statusKey: "scannedAbsentDeduct",
      statusLabel: "สแกนแต่ไม่มาเข้าแถวหักคะแนน",
      description: "มีเวลาสแกนเข้า แต่ไม่เข้าร่วมกิจกรรมเข้าแถว",
      points: 5,
      isActive: true
    },
    {
      statusKey: "cancelFlagKeepGate",
      statusLabel: "ยกเลิกการเช็คแถว และเวลาสแกนเข้า",
      description: "ยกเลิกข้อมูลเช็คแถวแต่คงเวลาสแกนเข้า ไม่ตัดคะแนน",
      points: 0,
      isActive: false
    }
  ],
  rules: DEFAULT_RULES
};

const DEFAULT_ATTENDANCE_CONFIG: AttendanceConfig = {
  studentLateTime: "07:50",
  studentCheckinEnd: "11:00",
  studentCheckoutTime: "15:30",
  studentCheckoutEnd: "18:00"
};

const createBlankRule = (): BehaviorScoreRule => ({
  id: `rule-${Date.now()}`,
  title: "",
  category: "",
  type: "decrease",
  points: 1,
  isActive: true
});

const BehaviorScoreConfigPage: React.FC = () => {
  const { user: currentUser } = useSelector((state: RootState) => state.auth);
  const schoolId = currentUser?.schoolId;

  const [config, setConfig] = useState<BehaviorScoreConfig>(DEFAULT_CONFIG);
  const [attendanceConfig, setAttendanceConfig] = useState<AttendanceConfig>(DEFAULT_ATTENDANCE_CONFIG);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    const fetchConfig = async () => {
      if (!schoolId) {
        setIsLoading(false);
        return;
      }

      setIsLoading(true);
      try {
        const schoolRef = doc(firestore, "school-settings", schoolId);
        const schoolSnap = await getDoc(schoolRef);
        const schoolData = schoolSnap.exists() ? schoolSnap.data() : null;
        const savedConfig = schoolData?.behaviorScoreConfig;
        const savedAttendanceConfig = schoolData?.attendanceConfig;

        if (savedAttendanceConfig) {
          setAttendanceConfig({
            studentLateTime: savedAttendanceConfig.studentLateTime || DEFAULT_ATTENDANCE_CONFIG.studentLateTime,
            studentCheckinEnd: savedAttendanceConfig.studentCheckinEnd || DEFAULT_ATTENDANCE_CONFIG.studentCheckinEnd,
            studentCheckoutTime: savedAttendanceConfig.studentCheckoutTime || DEFAULT_ATTENDANCE_CONFIG.studentCheckoutTime,
            studentCheckoutEnd: savedAttendanceConfig.studentCheckoutEnd || DEFAULT_ATTENDANCE_CONFIG.studentCheckoutEnd
          });
        }

        if (savedConfig) {
          setConfig({
            startingScore: Number(savedConfig.startingScore ?? DEFAULT_CONFIG.startingScore),
            minScore: Number(savedConfig.minScore ?? DEFAULT_CONFIG.minScore),
            maxScore: Number(savedConfig.maxScore ?? DEFAULT_CONFIG.maxScore),
            attendanceRules: Array.isArray(savedConfig.attendanceRules) && savedConfig.attendanceRules.length > 0
              ? DEFAULT_CONFIG.attendanceRules.map((defaultRule) => {
                  const savedRule = savedConfig.attendanceRules.find((rule: Partial<AttendanceScoreRule>) => rule.statusKey === defaultRule.statusKey);
                  return {
                    ...defaultRule,
                    points: Number(savedRule?.points ?? defaultRule.points),
                    isActive: savedRule?.isActive !== false
                  };
                })
              : DEFAULT_CONFIG.attendanceRules,
            flagCeremonyRules: Array.isArray(savedConfig.flagCeremonyRules) && savedConfig.flagCeremonyRules.length > 0
              ? DEFAULT_CONFIG.flagCeremonyRules.map((defaultRule) => {
                  const savedRule = savedConfig.flagCeremonyRules.find((rule: Partial<FlagCeremonyScoreRule>) => rule.statusKey === defaultRule.statusKey);
                  return {
                    ...defaultRule,
                    points: Number(savedRule?.points ?? defaultRule.points),
                    isActive: savedRule?.isActive !== false
                  };
                })
              : DEFAULT_CONFIG.flagCeremonyRules,
            rules: Array.isArray(savedConfig.rules) && savedConfig.rules.length > 0
              ? savedConfig.rules.map((rule: Partial<BehaviorScoreRule>, index: number) => ({
                  id: rule.id || `rule-${index + 1}`,
                  title: rule.title || "",
                  category: rule.category || "",
                  type: rule.type === "increase" ? "increase" : "decrease",
                  points: Number(rule.points ?? 1),
                  isActive: rule.isActive !== false
                }))
              : DEFAULT_RULES
          });
        }
      } catch (error) {
        console.error("Error fetching behavior score config:", error);
        Swal.fire("Error", "ไม่สามารถโหลดการตั้งค่าคะแนนพฤติกรรมได้", "error");
      } finally {
        setIsLoading(false);
      }
    };

    fetchConfig();
  }, [schoolId]);

  const activeRuleCount = useMemo(
    () => config.rules.filter((rule) => rule.isActive).length
      + config.attendanceRules.filter((rule) => rule.isActive).length
      + config.flagCeremonyRules.filter((rule) => rule.isActive).length,
    [config.attendanceRules, config.flagCeremonyRules, config.rules]
  );

  const totalDecreasePoints = useMemo(
    () => {
      const manualDecrease = config.rules
        .filter((rule) => rule.isActive && rule.type === "decrease")
        .reduce((sum, rule) => sum + (Number(rule.points) || 0), 0);
      const attendanceDecrease = config.attendanceRules
        .filter((rule) => rule.isActive)
        .reduce((sum, rule) => sum + (Number(rule.points) || 0), 0);
      const flagCeremonyDecrease = config.flagCeremonyRules
        .filter((rule) => rule.isActive)
        .reduce((sum, rule) => sum + (Number(rule.points) || 0), 0);
      return manualDecrease + attendanceDecrease + flagCeremonyDecrease;
    },
    [config.attendanceRules, config.flagCeremonyRules, config.rules]
  );

  const totalIncreasePoints = useMemo(
    () => config.rules
      .filter((rule) => rule.isActive && rule.type === "increase")
      .reduce((sum, rule) => sum + (Number(rule.points) || 0), 0),
    [config.rules]
  );

  const updateConfigNumber = (key: keyof Pick<BehaviorScoreConfig, "startingScore" | "minScore" | "maxScore">, value: string) => {
    setConfig((prev) => ({ ...prev, [key]: Number(value) }));
  };

  const updateRule = <K extends keyof BehaviorScoreRule>(id: string, key: K, value: BehaviorScoreRule[K]) => {
    setConfig((prev) => ({
      ...prev,
      rules: prev.rules.map((rule) => rule.id === id ? { ...rule, [key]: value } : rule)
    }));
  };

  const updateAttendanceRule = <K extends keyof AttendanceScoreRule>(statusKey: AttendanceStatusKey, key: K, value: AttendanceScoreRule[K]) => {
    setConfig((prev) => ({
      ...prev,
      attendanceRules: prev.attendanceRules.map((rule) => rule.statusKey === statusKey ? { ...rule, [key]: value } : rule)
    }));
  };

  const updateFlagCeremonyRule = <K extends keyof FlagCeremonyScoreRule>(statusKey: FlagCeremonyStatusKey, key: K, value: FlagCeremonyScoreRule[K]) => {
    setConfig((prev) => ({
      ...prev,
      flagCeremonyRules: prev.flagCeremonyRules.map((rule) => rule.statusKey === statusKey ? { ...rule, [key]: value } : rule)
    }));
  };

  const addRule = () => {
    setConfig((prev) => ({ ...prev, rules: [...prev.rules, createBlankRule()] }));
  };

  const removeRule = (id: string) => {
    setConfig((prev) => ({ ...prev, rules: prev.rules.filter((rule) => rule.id !== id) }));
  };

  const handleSave = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!schoolId) return;

    if (config.minScore > config.maxScore) {
      Swal.fire("ตรวจสอบข้อมูล", "คะแนนต่ำสุดต้องไม่มากกว่าคะแนนสูงสุด", "warning");
      return;
    }

    if (config.startingScore < config.minScore || config.startingScore > config.maxScore) {
      Swal.fire("ตรวจสอบข้อมูล", "คะแนนเริ่มต้นต้องอยู่ระหว่างคะแนนต่ำสุดและคะแนนสูงสุด", "warning");
      return;
    }

    const cleanedRules = config.rules
      .map((rule) => ({
        ...rule,
        title: rule.title.trim(),
        category: rule.category.trim(),
        points: Math.max(1, Number(rule.points) || 1)
      }))
      .filter((rule) => rule.title);

    if (cleanedRules.length === 0) {
      Swal.fire("ตรวจสอบข้อมูล", "กรุณาเพิ่มรายการพฤติกรรมอย่างน้อย 1 รายการ", "warning");
      return;
    }

    const cleanedAttendanceRules = config.attendanceRules.map((rule) => ({
      ...rule,
      points: Math.max(1, Number(rule.points) || 1)
    }));

    const cleanedFlagCeremonyRules = config.flagCeremonyRules.map((rule) => ({
      ...rule,
      points: Math.max(0, Number(rule.points) || 0)
    }));

    setIsSaving(true);
    try {
      await setDoc(doc(firestore, "school-settings", schoolId), {
        behaviorScoreConfig: {
          ...config,
          attendanceRules: cleanedAttendanceRules,
          flagCeremonyRules: cleanedFlagCeremonyRules,
          rules: cleanedRules,
          updatedAt: serverTimestamp()
        }
      }, { merge: true });

      setConfig((prev) => ({
        ...prev,
        attendanceRules: cleanedAttendanceRules,
        flagCeremonyRules: cleanedFlagCeremonyRules,
        rules: cleanedRules
      }));
      Swal.fire({
        icon: "success",
        title: "บันทึกสำเร็จ",
        text: "อัปเดตการตั้งค่าการเพิ่ม-ลดคะแนนพฤติกรรมแล้ว",
        timer: 1800,
        showConfirmButton: false
      });
    } catch (error) {
      console.error("Error saving behavior score config:", error);
      Swal.fire("Error", "เกิดข้อผิดพลาดในการบันทึก", "error");
    } finally {
      setIsSaving(false);
    }
  };

  if (isLoading) {
    return (
      <MainLayout>
        <div className="min-h-screen bg-gray-50 dark:bg-[#1e1f21] p-8 text-center text-gray-500 dark:text-gray-400">
          กำลังโหลดข้อมูล...
        </div>
      </MainLayout>
    );
  }

  return (
    <MainLayout>
      <div className="min-h-screen bg-gray-50 dark:bg-[#1e1f21] transition-colors duration-300 p-4 sm:p-6 lg:p-8">
        <div className="max-w-6xl mx-auto space-y-6">
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div className="flex items-center gap-4">
              <BackButton to="/academic/hub/settings" />
              <div className="p-3 bg-emerald-100 dark:bg-emerald-900/30 rounded-xl">
                <ShieldCheck className="w-7 h-7 text-emerald-600 dark:text-emerald-400" />
              </div>
              <div>
                <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
                  ตั้งค่าคะแนนพฤติกรรม
                </h1>
                <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                  กำหนดรายการเพิ่ม-ลดคะแนนและกรอบคะแนนความประพฤติของนักเรียน
                </p>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="bg-white dark:bg-[#2a2b2f] rounded-xl border border-gray-200 dark:border-gray-700 p-5">
              <p className="text-sm text-gray-500 dark:text-gray-400">รายการที่เปิดใช้</p>
              <p className="text-3xl font-bold text-gray-900 dark:text-white mt-2">{activeRuleCount}</p>
            </div>
            <div className="bg-white dark:bg-[#2a2b2f] rounded-xl border border-gray-200 dark:border-gray-700 p-5">
              <p className="text-sm text-gray-500 dark:text-gray-400">คะแนนเพิ่มรวมตามรายการ</p>
              <p className="text-3xl font-bold text-emerald-600 dark:text-emerald-400 mt-2">+{totalIncreasePoints}</p>
            </div>
            <div className="bg-white dark:bg-[#2a2b2f] rounded-xl border border-gray-200 dark:border-gray-700 p-5">
              <p className="text-sm text-gray-500 dark:text-gray-400">คะแนนลดรวมตามรายการ</p>
              <p className="text-3xl font-bold text-rose-600 dark:text-rose-400 mt-2">-{totalDecreasePoints}</p>
            </div>
          </div>

          <form onSubmit={handleSave} className="bg-white dark:bg-[#2a2b2f] rounded-2xl shadow-sm border border-gray-200 dark:border-gray-700 p-5 sm:p-6 space-y-6">
            <div className="flex items-center gap-3 border-b border-gray-200 dark:border-gray-700 pb-4">
              <div className="p-2 bg-sky-100 dark:bg-sky-900/30 rounded-lg">
                <Settings className="w-5 h-5 text-sky-600 dark:text-sky-400" />
              </div>
              <div>
                <h2 className="text-lg font-bold text-gray-900 dark:text-white">กรอบคะแนน</h2>
                <p className="text-sm text-gray-500 dark:text-gray-400">ใช้เป็นค่าเริ่มต้นและขอบเขตการคำนวณคะแนนพฤติกรรม</p>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">คะแนนเริ่มต้น</label>
                <input
                  type="number"
                  min={0}
                  value={config.startingScore}
                  onChange={(event) => updateConfigNumber("startingScore", event.target.value)}
                  className="w-full px-4 py-2.5 rounded-xl border border-gray-200 dark:border-gray-600 bg-white dark:bg-[#1e1f21] text-gray-900 dark:text-white focus:ring-2 focus:ring-sky-500 outline-none"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">คะแนนต่ำสุด</label>
                <input
                  type="number"
                  min={0}
                  value={config.minScore}
                  onChange={(event) => updateConfigNumber("minScore", event.target.value)}
                  className="w-full px-4 py-2.5 rounded-xl border border-gray-200 dark:border-gray-600 bg-white dark:bg-[#1e1f21] text-gray-900 dark:text-white focus:ring-2 focus:ring-sky-500 outline-none"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">คะแนนสูงสุด</label>
                <input
                  type="number"
                  min={1}
                  value={config.maxScore}
                  onChange={(event) => updateConfigNumber("maxScore", event.target.value)}
                  className="w-full px-4 py-2.5 rounded-xl border border-gray-200 dark:border-gray-600 bg-white dark:bg-[#1e1f21] text-gray-900 dark:text-white focus:ring-2 focus:ring-sky-500 outline-none"
                  required
                />
              </div>
            </div>

            <div className="border-t border-gray-200 dark:border-gray-700 pt-5 space-y-4">
              <div className="flex items-start gap-3">
                <div className="p-2 bg-amber-100 dark:bg-amber-900/30 rounded-lg">
                  <Clock className="w-5 h-5 text-amber-600 dark:text-amber-400" />
                </div>
                <div>
                  <h2 className="text-lg font-bold text-gray-900 dark:text-white">ตัดคะแนนจากการลงเวลา</h2>
                  <p className="text-sm text-gray-500 dark:text-gray-400">
                    ใช้สถานะที่เกิดจากระบบลงเวลา โดยอ้างอิงเวลาจากหน้าตั้งค่าเวลาลงเวลา
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                <div className="rounded-xl bg-amber-50 dark:bg-amber-900/10 border border-amber-100 dark:border-amber-800/30 p-4">
                  <p className="text-xs text-amber-700 dark:text-amber-300">สายหลังเวลา</p>
                  <p className="text-xl font-bold text-gray-900 dark:text-white mt-1">{attendanceConfig.studentLateTime}</p>
                </div>
                <div className="rounded-xl bg-rose-50 dark:bg-rose-900/10 border border-rose-100 dark:border-rose-800/30 p-4">
                  <p className="text-xs text-rose-700 dark:text-rose-300">ขาดเมื่อไม่ลงเวลาก่อน</p>
                  <p className="text-xl font-bold text-gray-900 dark:text-white mt-1">{attendanceConfig.studentCheckinEnd}</p>
                </div>
                <div className="rounded-xl bg-orange-50 dark:bg-orange-900/10 border border-orange-100 dark:border-orange-800/30 p-4">
                  <p className="text-xs text-orange-700 dark:text-orange-300">กลับก่อนเวลา</p>
                  <p className="text-xl font-bold text-gray-900 dark:text-white mt-1">{attendanceConfig.studentCheckoutTime}</p>
                </div>
                <div className="rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 p-4">
                  <p className="text-xs text-slate-600 dark:text-slate-300">ตรวจไม่ลงเวลาออกหลัง</p>
                  <p className="text-xl font-bold text-gray-900 dark:text-white mt-1">{attendanceConfig.studentCheckoutEnd}</p>
                </div>
              </div>

              <div className="space-y-3">
                {config.attendanceRules.map((rule) => (
                  <div key={rule.statusKey} className="grid grid-cols-1 md:grid-cols-[150px_minmax(220px,1fr)_130px_90px] gap-3 items-center bg-gray-50 dark:bg-[#1e1f21] border border-gray-200 dark:border-gray-700 rounded-xl p-4">
                    <div>
                      <p className="font-bold text-gray-900 dark:text-white">{rule.statusLabel}</p>
                      <p className="text-xs text-gray-500 dark:text-gray-400">สถานะลงเวลา</p>
                    </div>
                    <p className="text-sm text-gray-600 dark:text-gray-300">{rule.description}</p>
                    <div>
                      <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">ตัดคะแนน</label>
                      <input
                        type="number"
                        min={1}
                        value={rule.points}
                        onChange={(event) => updateAttendanceRule(rule.statusKey, "points", Number(event.target.value))}
                        className="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-600 bg-white dark:bg-[#2a2b2f] text-gray-900 dark:text-white focus:ring-2 focus:ring-amber-500 outline-none"
                        required
                      />
                    </div>
                    <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
                      <input
                        type="checkbox"
                        checked={rule.isActive}
                        onChange={(event) => updateAttendanceRule(rule.statusKey, "isActive", event.target.checked)}
                        className="w-4 h-4 rounded border-gray-300 text-amber-600 focus:ring-amber-500"
                      />
                      ใช้
                    </label>
                  </div>
                ))}
              </div>
            </div>

            <div className="border-t border-gray-200 dark:border-gray-700 pt-5 space-y-4">
              <div className="flex items-start gap-3">
                <div className="p-2 bg-indigo-100 dark:bg-indigo-900/30 rounded-lg">
                  <Flag className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
                </div>
                <div>
                  <h2 className="text-lg font-bold text-gray-900 dark:text-white">ตัดคะแนนจากการเช็คแถว</h2>
                  <p className="text-sm text-gray-500 dark:text-gray-400">
                    ใช้กับคำสั่งรวมในหน้าเช็คชื่อกิจกรรมเข้าแถว โดยแยกจากกติกาลงเวลาปกติ
                  </p>
                </div>
              </div>

              <div className="space-y-3">
                {config.flagCeremonyRules.map((rule) => (
                  <div key={rule.statusKey} className="grid grid-cols-1 md:grid-cols-[minmax(180px,260px)_minmax(220px,1fr)_130px_90px] gap-3 items-center bg-gray-50 dark:bg-[#1e1f21] border border-gray-200 dark:border-gray-700 rounded-xl p-4">
                    <div>
                      <p className="font-bold text-gray-900 dark:text-white leading-snug">{rule.statusLabel}</p>
                      <p className="text-xs text-gray-500 dark:text-gray-400">คำสั่งเช็คแถว</p>
                    </div>
                    <p className="text-sm text-gray-600 dark:text-gray-300">{rule.description}</p>
                    <div>
                      <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">ตัดคะแนน</label>
                      <input
                        type="number"
                        min={0}
                        value={rule.points}
                        onChange={(event) => updateFlagCeremonyRule(rule.statusKey, "points", Number(event.target.value))}
                        className="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-600 bg-white dark:bg-[#2a2b2f] text-gray-900 dark:text-white focus:ring-2 focus:ring-indigo-500 outline-none"
                        required
                      />
                    </div>
                    <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
                      <input
                        type="checkbox"
                        checked={rule.isActive}
                        onChange={(event) => updateFlagCeremonyRule(rule.statusKey, "isActive", event.target.checked)}
                        className="w-4 h-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                      />
                      ใช้
                    </label>
                  </div>
                ))}
              </div>
            </div>

            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between border-t border-gray-200 dark:border-gray-700 pt-5">
              <div>
                <h2 className="text-lg font-bold text-gray-900 dark:text-white">รายการเพิ่ม-ลดคะแนน</h2>
                <p className="text-sm text-gray-500 dark:text-gray-400">กำหนดชื่อรายการ หมวดหมู่ ประเภท และจำนวนคะแนน</p>
              </div>
              <button
                type="button"
                onClick={addRule}
                className="inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-medium transition-colors"
              >
                <Plus className="w-4 h-4" />
                เพิ่มรายการ
              </button>
            </div>

            <div className="space-y-3">
              {config.rules.map((rule) => (
                <div key={rule.id} className="grid grid-cols-1 lg:grid-cols-[minmax(160px,1fr)_160px_140px_110px_90px_44px] gap-3 items-end bg-gray-50 dark:bg-[#1e1f21] border border-gray-200 dark:border-gray-700 rounded-xl p-4">
                  <div>
                    <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">ชื่อพฤติกรรม</label>
                    <input
                      type="text"
                      value={rule.title}
                      onChange={(event) => updateRule(rule.id, "title", event.target.value)}
                      className="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-600 bg-white dark:bg-[#2a2b2f] text-gray-900 dark:text-white focus:ring-2 focus:ring-sky-500 outline-none"
                      placeholder="เช่น แต่งกายผิดระเบียบ"
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">หมวดหมู่</label>
                    <input
                      type="text"
                      value={rule.category}
                      onChange={(event) => updateRule(rule.id, "category", event.target.value)}
                      className="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-600 bg-white dark:bg-[#2a2b2f] text-gray-900 dark:text-white focus:ring-2 focus:ring-sky-500 outline-none"
                      placeholder="เช่น วินัย"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">ประเภท</label>
                    <select
                      value={rule.type}
                      onChange={(event) => updateRule(rule.id, "type", event.target.value as ScoreType)}
                      className="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-600 bg-white dark:bg-[#2a2b2f] text-gray-900 dark:text-white focus:ring-2 focus:ring-sky-500 outline-none"
                    >
                      <option value="decrease">ลดคะแนน</option>
                      <option value="increase">เพิ่มคะแนน</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">คะแนน</label>
                    <input
                      type="number"
                      min={1}
                      value={rule.points}
                      onChange={(event) => updateRule(rule.id, "points", Number(event.target.value))}
                      className="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-600 bg-white dark:bg-[#2a2b2f] text-gray-900 dark:text-white focus:ring-2 focus:ring-sky-500 outline-none"
                      required
                    />
                  </div>
                  <label className="flex items-center gap-2 h-10 text-sm text-gray-700 dark:text-gray-300">
                    <input
                      type="checkbox"
                      checked={rule.isActive}
                      onChange={(event) => updateRule(rule.id, "isActive", event.target.checked)}
                      className="w-4 h-4 rounded border-gray-300 text-sky-600 focus:ring-sky-500"
                    />
                    ใช้
                  </label>
                  <button
                    type="button"
                    onClick={() => removeRule(rule.id)}
                    className="h-10 w-10 inline-flex items-center justify-center rounded-lg bg-rose-50 hover:bg-rose-100 text-rose-600 dark:bg-rose-900/20 dark:hover:bg-rose-900/30 dark:text-rose-300 transition-colors"
                    title="ลบรายการ"
                    aria-label="ลบรายการ"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>

            <div className="bg-amber-50 dark:bg-amber-900/10 border border-amber-100 dark:border-amber-800/30 rounded-xl p-4 text-sm text-amber-800 dark:text-amber-200">
              ระบบจะบันทึกเฉพาะรายการที่มีชื่อพฤติกรรม และปรับคะแนนแต่ละรายการให้ไม่ต่ำกว่า 1 คะแนน
            </div>

            <div className="flex justify-end">
              <button
                type="submit"
                disabled={isSaving}
                className="inline-flex items-center gap-2 px-6 py-3 bg-sky-600 hover:bg-sky-700 text-white font-medium rounded-xl shadow-lg shadow-sky-500/20 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <Save className="w-5 h-5" />
                {isSaving ? "กำลังบันทึก..." : "บันทึกการตั้งค่า"}
              </button>
            </div>
          </form>
        </div>
      </div>
    </MainLayout>
  );
};

export default BehaviorScoreConfigPage;
