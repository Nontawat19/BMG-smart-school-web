import React, { useEffect, useMemo, useState } from "react";
import { useSelector, useDispatch } from "react-redux";
import { Link } from "react-router-dom";
import { collection, getDocs } from "firebase/firestore";
import Select, { StylesConfig } from "react-select";
import { Eye, Printer, Loader2 } from "lucide-react";
import { pdf } from "@react-pdf/renderer";
import { saveAs } from "file-saver";
import MainLayout from "@/layouts/MainLayout";
import BackButton from "@/components/Shared/BackButton";
import { firestore } from "@/firebase";
import { RootState, AppDispatch } from "@/store";
import { fetchSchoolSettings } from "@/store/slices/schoolSettingsSlice";
import { getCurrentAcademicYear } from "@/utils/academicYearUtils";
import { CLASS_MAPPING, CLASS_FULL_NAMES } from "@/utils/schoolUtils";
import { getStudentStatus, isCurrentStudent } from "@/utils/studentStatusUtils";
import { useTheme } from "@/ThemeContext";
import StudentDataReportDocument from "@/components/Pdf/studentdata/StudentDataReportDocument";
import { prepareStudentsWithSmartPhotos } from "@/utils/studentPhotoUtils";

interface StudentRow {
  id: string;
  studentId?: string;
  title?: string;
  firstName: string;
  lastName: string;
  idCardNumber?: string;
  bloodType?: string;
  phoneNumber?: string;
  classLevel?: string;
  room?: string;
  status?: string;
  studentStatus?: string;
  [key: string]: any;
}

interface StudentOption {
  value: string;
  label: string;
}

const getClassFullLabel = (classLevel?: string, room?: string): string => {
  if (!classLevel) return "-";
  const code = Object.entries(CLASS_MAPPING).find(([, v]) => v === classLevel)?.[0];
  const base = code ? CLASS_FULL_NAMES[code] : classLevel;
  return room ? `${base}/${room}` : base;
};

const statusColorMap: Record<string, string> = {
  "กำลังศึกษาอยู่": "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-400",
  "พักการเรียน": "bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-400",
  "แขวนลอย": "bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-400",
  "ย้าย": "bg-sky-100 text-sky-700 dark:bg-sky-500/15 dark:text-sky-400",
  "ลาออก": "bg-rose-100 text-rose-700 dark:bg-rose-500/15 dark:text-rose-400",
  "จำหน่าย": "bg-orange-100 text-orange-700 dark:bg-orange-500/15 dark:text-orange-400",
  "สำเร็จการศึกษา": "bg-purple-100 text-purple-700 dark:bg-purple-500/15 dark:text-purple-400",
};

const StudentDataReportPage: React.FC = () => {
  const dispatch = useDispatch<AppDispatch>();
  const { user: currentUser } = useSelector((state: RootState) => state.auth);
  const schoolSettings = useSelector((state: RootState) => state.schoolSettings);
  const { isDarkMode } = useTheme();
  const schoolId = currentUser?.schoolId;

  const [academicYear, setAcademicYear] = useState("");
  const [term, setTerm] = useState<"1" | "2">("1");
  const [allStudents, setAllStudents] = useState<StudentRow[]>([]);
  const [loadingStudents, setLoadingStudents] = useState(true);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [isGeneratingPdf, setIsGeneratingPdf] = useState(false);
  const [pdfStatusText, setPdfStatusText] = useState("");

  useEffect(() => {
    if (schoolId) dispatch(fetchSchoolSettings(schoolId));
  }, [schoolId, dispatch]);

  useEffect(() => {
    if (!schoolId) return;
    getCurrentAcademicYear(firestore, schoolId).then((data) => {
      setAcademicYear(data.academicYear);
      if (data.currentTerm) setTerm(data.currentTerm);
    });
  }, [schoolId]);

  useEffect(() => {
    if (!schoolId) return;
    setLoadingStudents(true);
    const studentsRef = collection(firestore, "school-settings", schoolId, "students");
    getDocs(studentsRef)
      .then((snap) => {
        const rows = snap.docs
          .map((d) => ({ id: d.id, ...(d.data() as any) } as StudentRow))
          .filter(isCurrentStudent)
          .sort((a, b) => String(a.studentId || "").localeCompare(String(b.studentId || "")));
        setAllStudents(rows);
      })
      .catch((err) => console.error("Error fetching students:", err))
      .finally(() => setLoadingStudents(false));
  }, [schoolId]);

  const studentOptions: StudentOption[] = useMemo(
    () =>
      allStudents.map((s) => ({
        value: s.id,
        label: `${s.studentId || "-"}-${s.title || ""}${s.firstName} ${s.lastName}`,
      })),
    [allStudents]
  );

  const selectedOptions = useMemo(
    () => studentOptions.filter((o) => selectedIds.includes(o.value)),
    [studentOptions, selectedIds]
  );

  const selectedStudents = useMemo(
    () => allStudents.filter((s) => selectedIds.includes(s.id)),
    [allStudents, selectedIds]
  );

  const termOptions = useMemo(
    () => [
      { value: "1", label: `${schoolSettings?.schoolName || ""}-1/${academicYear}` },
      { value: "2", label: `${schoolSettings?.schoolName || ""}-2/${academicYear}` },
    ],
    [schoolSettings?.schoolName, academicYear]
  );

  const selectStyles: StylesConfig<StudentOption, true> = {
    control: (base) => ({
      ...base,
      minHeight: "42px",
      backgroundColor: isDarkMode ? "#1e1f21" : "#fff",
      borderColor: isDarkMode ? "#3f3f46" : "#d1d5db",
      boxShadow: "none",
      "&:hover": { borderColor: "#6366f1" },
    }),
    menu: (base) => ({
      ...base,
      backgroundColor: isDarkMode ? "#2a2b2f" : "#fff",
      zIndex: 50,
    }),
    option: (base, state) => ({
      ...base,
      backgroundColor: state.isSelected ? "#4f46e5" : state.isFocused ? (isDarkMode ? "rgba(255,255,255,0.06)" : "#eef2ff") : "transparent",
      color: state.isSelected ? "#fff" : isDarkMode ? "#e5e7eb" : "#374151",
      cursor: "pointer",
    }),
    multiValue: (base) => ({
      ...base,
      backgroundColor: isDarkMode ? "rgba(16,185,129,0.15)" : "#d1fae5",
      borderRadius: "9999px",
      paddingLeft: "4px",
    }),
    multiValueLabel: (base) => ({
      ...base,
      color: isDarkMode ? "#34d399" : "#047857",
      fontWeight: 600,
    }),
    multiValueRemove: (base) => ({
      ...base,
      color: isDarkMode ? "#34d399" : "#047857",
      borderRadius: "9999px",
      "&:hover": { backgroundColor: "#10b981", color: "#fff" },
    }),
    placeholder: (base) => ({ ...base, color: "#9ca3af" }),
    input: (base) => ({ ...base, color: isDarkMode ? "#fff" : "#111827" }),
  };

  const handleSelectAll = () => setSelectedIds(allStudents.map((s) => s.id));
  const handleClear = () => setSelectedIds([]);
  const handleGeneratePdf = async () => {
    if (!selectedStudents.length || isGeneratingPdf) return;
    setIsGeneratingPdf(true);
    setPdfStatusText("กำลังเตรียมรูปถ่ายนักเรียน...");
    try {
      const preparedStudents = await prepareStudentsWithSmartPhotos(
        selectedStudents,
        (current, total) => {
          setPdfStatusText(`กำลังวิเคราะห์จัดรูปถ่าย (${current}/${total})...`);
        }
      );

      setPdfStatusText("กำลังสร้างเอกสาร PDF...");
      const blob = await pdf(
        <StudentDataReportDocument
          schoolName={schoolSettings?.schoolName || ""}
          academicYear={academicYear}
          term={term}
          students={preparedStudents}
        />
      ).toBlob();
      const suffix = selectedStudents.length === 1
        ? `${selectedStudents[0].studentId || selectedStudents[0].firstName}`
        : `${selectedStudents.length}คน`;
      saveAs(blob, `รายงานข้อมูลนักเรียน_${suffix}.pdf`);
    } catch (error) {
      console.error("Unable to generate student data report PDF:", error);
    } finally {
      setIsGeneratingPdf(false);
      setPdfStatusText("");
    }
  };

  return (
    <MainLayout>
      <div className="min-h-screen bg-slate-50 px-4 py-6 text-slate-900 dark:bg-[#1e1f21] dark:text-white sm:px-6 lg:px-8">
        <div className="mx-auto max-w-7xl">
          <div className="mb-6 flex flex-col gap-4 rounded-2xl border border-slate-100 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-[#2a2b2f] lg:flex-row lg:items-center lg:justify-between print:hidden">
            <div className="flex min-w-0 flex-1 items-center gap-4">
              <BackButton to="/academic/hub/students" />
              <div className="min-w-0">
                <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-slate-900 dark:text-white">รายงานข้อมูลนักเรียน</h1>
                <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                  ค้นหาและออกรายงานข้อมูลนักเรียนรายบุคคล
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={handleGeneratePdf}
              disabled={selectedStudents.length === 0 || isGeneratingPdf}
              className="inline-flex h-12 items-center justify-center gap-2.5 rounded-xl bg-indigo-600 px-5 text-sm font-black text-white shadow-lg shadow-indigo-600/25 transition hover:bg-indigo-500 disabled:cursor-not-allowed disabled:bg-gray-300 disabled:shadow-none dark:disabled:bg-white/10"
            >
              {isGeneratingPdf ? <Loader2 size={16} className="animate-spin" /> : <Printer size={16} />}
              {isGeneratingPdf ? (pdfStatusText || "กำลังสร้าง PDF...") : `พิมพ์รายงาน PDF${selectedStudents.length > 1 ? ` (${selectedStudents.length} คน)` : ""}`}
            </button>
          </div>

          <div className="mb-5 rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-200 dark:bg-[#2a2b2f] dark:ring-slate-700 print:hidden">
            <h2 className="mb-4 text-sm font-bold text-slate-700 dark:text-slate-200">รายการนักเรียนที่ต้องการ</h2>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <label className="block">
                <span className="mb-1 block text-xs font-bold text-slate-700 dark:text-slate-300">โรงเรียน</span>
                <div className="flex h-[42px] items-center rounded-lg border border-slate-300 bg-slate-50 px-3 text-sm text-slate-700 dark:border-slate-700 dark:bg-[#1e1f21] dark:text-slate-200">
                  {schoolSettings?.schoolName || "-"}
                </div>
              </label>
              <label className="block">
                <span className="mb-1 block text-xs font-bold text-slate-700 dark:text-slate-300">ภาคเรียน</span>
                <select
                  value={term}
                  onChange={(e) => setTerm(e.target.value as "1" | "2")}
                  className="h-[42px] w-full rounded-lg border border-slate-300 bg-white px-3 text-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 dark:border-slate-700 dark:bg-[#1e1f21] dark:text-slate-200"
                >
                  {termOptions.map((opt) => (
                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                  ))}
                </select>
              </label>
            </div>

            <div className="mt-4">
              <div className="mb-1 flex items-center justify-between">
                <span className="block text-xs font-bold text-slate-700 dark:text-slate-300">รายชื่อนักเรียน</span>
                <div className="flex gap-3 text-xs font-bold">
                  <button type="button" onClick={handleSelectAll} className="text-indigo-600 hover:underline dark:text-indigo-400">เลือกทั้งหมด</button>
                  <button type="button" onClick={handleClear} className="text-slate-500 hover:underline dark:text-slate-400">ล้างรายการ</button>
                </div>
              </div>
              <Select<StudentOption, true>
                isMulti
                isLoading={loadingStudents}
                options={studentOptions}
                value={selectedOptions}
                onChange={(vals) => setSelectedIds((vals || []).map((v) => v.value))}
                placeholder="ค้นหาชื่อ หรือรหัสนักเรียน..."
                noOptionsMessage={() => "ไม่พบนักเรียน"}
                styles={selectStyles}
                classNamePrefix="student-select"
              />
            </div>
          </div>

          <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-700 dark:bg-[#2a2b2f]">
            <table className="w-full border-collapse text-left text-sm">
              <thead className="bg-slate-100 text-xs font-bold text-slate-700 dark:bg-[#323338] dark:text-slate-300">
                <tr>
                  <th className="border-b border-r border-slate-200 px-3 py-3 text-center dark:border-slate-700">#</th>
                  <th className="border-b border-r border-slate-200 px-3 py-3 dark:border-slate-700">โรงเรียน</th>
                  <th className="border-b border-r border-slate-200 px-3 py-3 dark:border-slate-700">รหัสนักเรียน</th>
                  <th className="border-b border-r border-slate-200 px-3 py-3 dark:border-slate-700">ชื่อ-นามสกุล</th>
                  <th className="border-b border-r border-slate-200 px-3 py-3 dark:border-slate-700">บัตรประชาชน</th>
                  <th className="border-b border-r border-slate-200 px-3 py-3 text-center dark:border-slate-700">กรุ๊ปเลือด</th>
                  <th className="border-b border-r border-slate-200 px-3 py-3 dark:border-slate-700">หมายเลขโทรศัพท์</th>
                  <th className="border-b border-r border-slate-200 px-3 py-3 dark:border-slate-700">ขั้นเรียน</th>
                  <th className="border-b border-r border-slate-200 px-3 py-3 text-center dark:border-slate-700">Status</th>
                  <th className="border-b border-slate-200 px-3 py-3 text-center dark:border-slate-700 print:hidden">Config</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 dark:divide-slate-700">
                {selectedStudents.length === 0 ? (
                  <tr>
                    <td colSpan={10} className="px-4 py-12 text-center text-sm text-slate-500 dark:text-slate-400">
                      กรุณาเลือกรายชื่อนักเรียนที่ต้องการดูรายงาน
                    </td>
                  </tr>
                ) : (
                  selectedStudents.map((s, index) => {
                    const status = getStudentStatus(s);
                    return (
                      <tr key={s.id} className="hover:bg-slate-50 dark:hover:bg-[#1e1f21]">
                        <td className="border-r border-slate-200 px-3 py-2 text-center font-bold dark:border-slate-700">{index + 1}</td>
                        <td className="border-r border-slate-200 px-3 py-2 whitespace-nowrap dark:border-slate-700">{schoolSettings?.schoolName || "-"}</td>
                        <td className="border-r border-slate-200 px-3 py-2 whitespace-nowrap dark:border-slate-700">{s.studentId || "-"}</td>
                        <td className="border-r border-slate-200 px-3 py-2 whitespace-nowrap dark:border-slate-700">{s.title}{s.firstName} {s.lastName}</td>
                        <td className="border-r border-slate-200 px-3 py-2 whitespace-nowrap dark:border-slate-700">{s.idCardNumber || "-"}</td>
                        <td className="border-r border-slate-200 px-3 py-2 text-center dark:border-slate-700">{s.bloodType || "-"}</td>
                        <td className="border-r border-slate-200 px-3 py-2 whitespace-nowrap dark:border-slate-700">{s.phoneNumber || "-"}</td>
                        <td className="border-r border-slate-200 px-3 py-2 whitespace-nowrap dark:border-slate-700">{getClassFullLabel(s.classLevel, s.room)}</td>
                        <td className="border-r border-slate-200 px-3 py-2 text-center dark:border-slate-700">
                          <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-bold ${statusColorMap[status] || "bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-300"}`}>
                            {status}
                          </span>
                        </td>
                        <td className="px-3 py-2 text-center print:hidden">
                          <Link
                            to={`/school/${schoolId}/students/view/${s.id}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-indigo-600 hover:bg-indigo-50 dark:text-indigo-400 dark:hover:bg-indigo-500/10"
                            title="ดูข้อมูลนักเรียน"
                          >
                            <Eye size={16} />
                          </Link>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </MainLayout>
  );
};

export default StudentDataReportPage;
