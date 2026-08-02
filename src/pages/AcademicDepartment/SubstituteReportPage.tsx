import React, { useEffect, useMemo, useRef, useState } from "react";
import { useSelector } from "react-redux";
import { collection, doc, getDoc, getDocs, Timestamp } from "firebase/firestore";
import { Calendar, ChevronLeft, ChevronRight, FileText, Printer, RefreshCw, Search } from "lucide-react";
import {
  Document as PdfDocument,
  Font,
  Image,
  Page,
  StyleSheet,
  Text,
  View,
  pdf,
} from "@react-pdf/renderer";
import { saveAs } from "file-saver";
import BackButton from "@/components/Shared/BackButton";
import MainLayout from "@/layouts/MainLayout";
import SkeletonLoader from "@/components/SkeletonLoader";
import { firestore as db } from "@/firebase";
import { RootState } from "@/store";
import { Term } from "@/store/slices/calendarSlice";

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

interface SubstitutionRecord {
  id: string;
  originalTeacherId?: string;
  originalTeacherName?: string;
  substituteTeacherId?: string;
  substituteTeacherName?: string;
  date?: Timestamp;
  academicYear?: string;
  period?: number;
  classId?: string | string[] | null;
  subjectName?: string;
  subjectCode?: string;
  roomName?: string;
  startTime?: string;
  endTime?: string;
  leaveRequestId?: string;
  createdAt?: Timestamp;
  dayPortion?: "full" | "morning" | "afternoon";
}

const portionSuffix = (dayPortion?: "full" | "morning" | "afternoon") =>
  dayPortion === "morning" ? " (เช้า)" : dayPortion === "afternoon" ? " (บ่าย)" : "";

interface PdfColumn {
  label: string;
  width: number;
  align?: "left" | "center";
}

interface PdfReportData {
  title: string;
  subtitle: string;
  schoolName: string;
  logoUrl?: string;
  columns: PdfColumn[];
  rows: string[][];
}

interface CalendarTermsByYear {
  [academicYear: string]: Term[];
}

const CLASS_NAMES: Record<string, string> = {
  k1: "อ.1", k2: "อ.2", k3: "อ.3",
  p1: "ป.1", p2: "ป.2", p3: "ป.3", p4: "ป.4", p5: "ป.5", p6: "ป.6",
  m1: "ม.1", m2: "ม.2", m3: "ม.3", m4: "ม.4", m5: "ม.5", m6: "ม.6",
};

const formatClassId = (classId: string | string[] | null | undefined): string => {
  if (!classId) return "-";
  const ids = Array.isArray(classId) ? classId : [classId];
  return ids.map((id) => {
    const [lvl, rm] = String(id).split("/");
    return CLASS_NAMES[lvl] ? `${CLASS_NAMES[lvl]}${rm ? `/${rm}` : ""}` : String(id);
  }).join(", ");
};

const timestampToDate = (ts: Timestamp | undefined): Date | null => {
  if (!ts || typeof ts.toDate !== "function") return null;
  return ts.toDate();
};

const formatShortThaiDate = (ts: Timestamp | undefined): string => {
  const d = timestampToDate(ts);
  if (!d) return "-";
  return d.toLocaleDateString("th-TH", { day: "numeric", month: "short", year: "numeric" });
};

const toDateKey = (ts: Timestamp | undefined): string => {
  const d = timestampToDate(ts);
  if (!d) return "";
  return d.toISOString().slice(0, 10);
};

const getSemesterFromDate = (date: Date | null, terms: Term[] = []) => {
  if (!date) return "";
  const dateKey = date.toISOString().slice(0, 10);
  const matchedTerm = terms.find((term) =>
    term.startDate && term.endDate && dateKey >= term.startDate && dateKey <= term.endDate
  );

  if (matchedTerm?.id === "term1") return "1";
  if (matchedTerm?.id === "term2") return "2";
  if (matchedTerm?.name?.includes("1")) return "1";
  if (matchedTerm?.name?.includes("2")) return "2";
  return "";
};

const formatFullThaiDate = (dateKey: string) => {
  if (!dateKey) return "";
  const date = new Date(dateKey);
  if (!Number.isFinite(date.getTime())) return dateKey;
  return date.toLocaleDateString("th-TH", { day: "numeric", month: "long", year: "numeric" });
};

const PDF_ROWS_FIRST_PAGE = 20;  // หน้าแรก: มี header โรงเรียน+ชื่อรายงาน
const PDF_ROWS_OTHER_PAGES = 25; // หน้าถัดไป: ไม่มี header
const ITEMS_PER_PAGE = 25;
const sanitizeFileName = (v: string) => v.replace(/[\\/:*?"<>|]/g, "_").replace(/\s+/g, "_");

const SubstituteReportPage: React.FC = () => {
  const currentUser = useSelector((state: RootState) => state.auth.user);
  const schoolSettings = useSelector((state: RootState) => state.schoolSettings);
  const calendarState = useSelector((state: RootState) => state.calendar);
  const schoolId = (currentUser as any)?.schoolId || "";

  const defaultYear = String(
    (schoolSettings as any)?.currentAcademicYear || calendarState.academicYear || ""
  );

  const [loading, setLoading] = useState(true);
  const [isGeneratingPdf, setIsGeneratingPdf] = useState(false);
  const [schoolName, setSchoolName] = useState("");
  const [logoUrl, setLogoUrl] = useState<string | undefined>(undefined);
  const [records, setRecords] = useState<SubstitutionRecord[]>([]);
  const [calendarTermsByYear, setCalendarTermsByYear] = useState<CalendarTermsByYear>({});
  const [academicYear, setAcademicYear] = useState(defaultYear);
  const [semester, setSemester] = useState("");
  const [startDateKey, setStartDateKey] = useState("");
  const [endDateKey, setEndDateKey] = useState("");
  const [groupBy, setGroupBy] = useState<"none" | "original" | "substitute">("none");
  const [filterOriginalTeacher, setFilterOriginalTeacher] = useState("all");
  const [filterSubstituteTeacher, setFilterSubstituteTeacher] = useState("all");
  const [search, setSearch] = useState("");
  const [currentPage, setCurrentPage] = useState(1);

  useEffect(() => {
    if (!schoolId) return;
    loadData();
  }, [schoolId]);

  const loadData = async () => {
    setLoading(true);
    try {
      const [schoolSnap, subsSnap] = await Promise.all([
        getDoc(doc(db, "school-settings", schoolId)),
        getDocs(collection(db, "school-settings", schoolId, "substitutions")),
      ]);

      const schoolData = schoolSnap.exists() ? schoolSnap.data() : {};
      setSchoolName(String(schoolData.schoolName || schoolData.name || schoolData.schoolThaiName || ""));
      setLogoUrl(schoolData.logoUrl);

      const rows: SubstitutionRecord[] = subsSnap.docs
        .map((d) => ({ id: d.id, ...(d.data() as any) } as SubstitutionRecord))
        .sort((a, b) => {
          const dateA = toDateKey(a.date);
          const dateB = toDateKey(b.date);
          if (dateA !== dateB) return dateB.localeCompare(dateA);
          return (a.period ?? 0) - (b.period ?? 0);
        });


      setRecords(rows);

      const yearsToLoad = Array.from(new Set(
        [
          ...rows.map((row) => String(row.academicYear || "").trim()),
          String(defaultYear || "").trim(),
        ].filter(Boolean)
      ));

      const calendarEntries = await Promise.all(
        yearsToLoad.map(async (year) => {
          if (!year) return [year, []] as const;
          const yearDoc = await getDoc(doc(db, "school-settings", schoolId, "main_calendar", year));
          if (!yearDoc.exists()) {
            return [year, year === String(defaultYear || "").trim() ? (calendarState.terms || []) : []] as const;
          }
          const data = yearDoc.data();
          const termsData = data.terms || {};
          const terms: Term[] = Array.isArray(termsData)
            ? termsData.map((t: any, i: number) => ({
              id: t.id || `term-${i}`,
              name: t.name || `ภาคเรียนที่ ${i + 1}`,
              startDate: t.startDate || "",
              endDate: t.endDate || "",
            }))
            : Object.entries(termsData).map(([key, t]: [string, any]) => ({
              id: key,
              name: t.name || (key === "term1" ? "ภาคเรียนที่ 1" : key === "term2" ? "ภาคเรียนที่ 2" : key),
              startDate: t.startDate || "",
              endDate: t.endDate || "",
            }));
          return [year, terms] as const;
        })
      );

      setCalendarTermsByYear(Object.fromEntries(calendarEntries));
    } catch (err) {
      console.error("Error loading substitute report data:", err);
    } finally {
      setLoading(false);
    }
  };

  const originalTeacherOptions = useMemo(() => {
    const names = Array.from(new Set(records.map((r) => r.originalTeacherName).filter(Boolean) as string[])).sort((a, b) => a.localeCompare(b, "th"));
    return names;
  }, [records]);

  const substituteTeacherOptions = useMemo(() => {
    const names = Array.from(new Set(records.map((r) => r.substituteTeacherName).filter(Boolean) as string[])).sort((a, b) => a.localeCompare(b, "th"));
    return names;
  }, [records]);

  const keyword = search.trim().toLowerCase();

  const recordsWithDerivedSemester = useMemo(() => {
    return records.map((record) => {
      const year = String(record.academicYear || "").trim();
      const date = timestampToDate(record.date);
      const fallbackTerms = year === String(defaultYear || "").trim() ? (calendarState.terms || []) : [];
      const terms = calendarTermsByYear[year] && calendarTermsByYear[year].length > 0
        ? calendarTermsByYear[year]
        : fallbackTerms;
      const derivedSemester = getSemesterFromDate(date, terms);
      return { ...record, derivedSemester, normalizedAcademicYear: year };
    });
  }, [records, calendarTermsByYear, calendarState.terms, defaultYear]);

  useEffect(() => {
    setCurrentPage(1);
  }, [academicYear, semester, startDateKey, endDateKey, filterOriginalTeacher, filterSubstituteTeacher, keyword, groupBy]);

  useEffect(() => {
    if (!defaultYear) return;
    setAcademicYear((current) => current || defaultYear);
  }, [defaultYear]);

  useEffect(() => {
    if (!recordsWithDerivedSemester.length) return;
    const hasCurrentYearData = recordsWithDerivedSemester.some((record) => record.normalizedAcademicYear === academicYear);
    if (!academicYear || hasCurrentYearData) return;

    const latestAvailableYear = Array.from(new Set(
      recordsWithDerivedSemester.map((record) => record.normalizedAcademicYear).filter(Boolean)
    )).sort((a, b) => Number(b) - Number(a))[0];

    if (latestAvailableYear) {
      setAcademicYear(latestAvailableYear);
    }
  }, [recordsWithDerivedSemester, academicYear]);

  useEffect(() => {
    if (!academicYear) return;
    setSemester("");
  }, [academicYear]);


  const filteredRows = useMemo(() => {
    return recordsWithDerivedSemester.filter((r) => {
      if (academicYear && r.normalizedAcademicYear && r.normalizedAcademicYear !== academicYear) return false;
      if (semester && r.derivedSemester && r.derivedSemester !== semester) return false;
      const dk = toDateKey(r.date);
      if (startDateKey && dk < startDateKey) return false;
      if (endDateKey && dk > endDateKey) return false;
      if (filterOriginalTeacher !== "all" && r.originalTeacherName !== filterOriginalTeacher) return false;
      if (filterSubstituteTeacher !== "all" && r.substituteTeacherName !== filterSubstituteTeacher) return false;
      if (keyword) {
        const text = [r.originalTeacherName, r.substituteTeacherName, r.subjectName, r.subjectCode, formatClassId(r.classId)].join(" ").toLowerCase();
        if (!text.includes(keyword)) return false;
      }
      return true;
    });
  }, [recordsWithDerivedSemester, academicYear, semester, startDateKey, endDateKey, filterOriginalTeacher, filterSubstituteTeacher, keyword]);

  const groupedSections = useMemo(() => {
    if (groupBy === "none") return null;
    const map = new Map<string, typeof filteredRows>();
    filteredRows.forEach(r => {
      const key = groupBy === "original"
        ? (r.originalTeacherName || "ไม่ระบุครูเจ้าของคาบ")
        : (r.substituteTeacherName || "ไม่ระบุครูสอนแทน");
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(r);
    });
    return Array.from(map.entries())
      .map(([key, rows]) => ({ key, label: key, rows }))
      .sort((a, b) => a.label.localeCompare(b.label, "th"));
  }, [filteredRows, groupBy]);

  const totalPages = groupBy === "none" ? Math.max(1, Math.ceil(filteredRows.length / ITEMS_PER_PAGE)) : 1;
  const pagedRows = groupBy === "none" ? filteredRows.slice((currentPage - 1) * ITEMS_PER_PAGE, currentPage * ITEMS_PER_PAGE) : [];

  const dateRangeLabel = startDateKey && endDateKey
    ? ` ช่วง ${formatFullThaiDate(startDateKey)} – ${formatFullThaiDate(endDateKey)}`
    : startDateKey ? ` ตั้งแต่ ${formatFullThaiDate(startDateKey)}` : "";

  const buildPdfData = (): PdfReportData => ({
    title: "รายงานการสอนแทน",
    subtitle: `${schoolName || "โรงเรียน"} ปีการศึกษา ${academicYear || "-"} ${semester ? `ภาคเรียนที่ ${semester}` : "ทุกภาคเรียน"}${dateRangeLabel}`,
    schoolName: schoolName || "โรงเรียน",
    logoUrl,
    columns: [
      { label: "ลำดับ", width: 4, align: "center" },
      { label: "วันที่", width: 13, align: "center" },
      { label: "คาบที่", width: 4, align: "center" },
      { label: "เวลา", width: 9, align: "center" },
      { label: "รหัสวิชา", width: 8, align: "center" },
      { label: "ชื่อวิชา", width: 16, align: "left" },
      { label: "ชั้นเรียน", width: 8, align: "center" },
      { label: "ครูเจ้าของคาบ", width: 17, align: "left" },
      { label: "ครูสอนแทน", width: 17, align: "left" },
      { label: "สถานที่", width: 9, align: "center" },
    ],
    rows: filteredRows.map((r, index) => [
      String(index + 1),
      formatShortThaiDate(r.date),
      `${r.period ?? "-"}${portionSuffix(r.dayPortion)}`,
      r.startTime && r.endTime ? `${r.startTime}-${r.endTime}` : "-",
      r.subjectCode || "-",
      r.subjectName || "-",
      formatClassId(r.classId),
      r.originalTeacherName || "-",
      r.substituteTeacherName || "-",
      (r.roomName && r.roomName !== "all") ? r.roomName : "",
    ]),
  });

  const handleGeneratePdf = async () => {
    if (isGeneratingPdf) return;
    setIsGeneratingPdf(true);
    try {
      const data = buildPdfData();
      const blob = await pdf(<SubstituteReportPdfDocument data={data} />).toBlob();
      saveAs(blob, `${sanitizeFileName("รายงานการสอนแทน")}_ปีการศึกษา_${academicYear || "2568"}.pdf`);
    } catch (err) {
      console.error("Error generating substitute report PDF:", err);
    } finally {
      setIsGeneratingPdf(false);
    }
  };

  const yearOptions = useMemo(() => {
    return Array.from(new Set(
      [defaultYear, ...records.map((record) => String(record.academicYear || "")).filter(Boolean)]
    )).sort((a, b) => Number(b) - Number(a));
  }, [defaultYear, records]);

  return (
    <MainLayout>
      <style>{`
        .report-input { height: 40px; width: 100%; border-radius: 6px; border: 1px solid #d9dee5; background: white; padding: 0 12px; font-size: 14px; color: #334155; outline: none; transition: all 0.2s; }
        .report-input:focus { border-color: #2f86d1; box-shadow: 0 0 0 2px rgba(47,134,209,0.12); }
        .report-input:disabled { background: #f1f5f9; color: #1e293b; cursor: not-allowed; font-weight: 600; border-color: #e2e8f0; }
        .dark .report-input { background: #1c1c24; border-color: rgba(255,255,255,0.1); color: #f8fafc; }
        .dark .report-input:focus { border-color: #3b82f6; box-shadow: 0 0 0 2px rgba(59,130,246,0.2); }
        .dark .report-input:disabled { background: rgba(255,255,255,0.05); color: #ffffff; cursor: not-allowed; font-weight: 600; border-color: rgba(255,255,255,0.1); }
      `}</style>
      <div className="min-h-screen bg-gray-50 px-3 py-4 dark:bg-[#1c1c24] sm:px-4 md:px-6 lg:px-8 lg:py-8">
        <div className="mx-auto max-w-[1500px]">
          <div className="mb-4 flex items-center gap-4 print:hidden">
            <BackButton to="/academic/hub/scheduling" />
            <div className="min-w-0 flex-1">
              <h1 className="truncate text-2xl font-bold text-gray-900 dark:text-white">รายงานการสอนแทน</h1>
              <p className="text-sm text-gray-500 dark:text-gray-400">รายละเอียดการมอบหมายครูสอนแทนในแต่ละคาบ</p>
            </div>
          </div>

          <div className="overflow-hidden rounded-md border border-gray-200 bg-white shadow-sm dark:border-white/10 dark:bg-[#2a2b2f]">
            <div className="flex items-center justify-between border-b border-gray-200 px-4 py-3 dark:border-white/10">
              <h2 className="flex items-center gap-2 text-lg font-bold text-gray-900 dark:text-white">
                <FileText size={20} className="text-teal-500" />
                รายงานการสอนแทน
              </h2>
              <div className="flex gap-2 print:hidden">
                <button onClick={loadData} className="inline-flex h-9 items-center gap-2 rounded-md bg-emerald-500 px-3 text-sm font-bold text-white hover:bg-emerald-600">
                  <RefreshCw size={16} />
                </button>
                <button
                  onClick={handleGeneratePdf}
                  disabled={isGeneratingPdf || loading}
                  className="inline-flex h-9 items-center gap-2 rounded-md bg-emerald-500 px-3 text-sm font-bold text-white hover:bg-emerald-600 disabled:cursor-wait disabled:opacity-60"
                >
                  {isGeneratingPdf ? <RefreshCw size={16} className="animate-spin" /> : <Printer size={16} />}
                  PDF
                </button>
              </div>
            </div>

            {/* Filters */}
            <div className="border-b border-gray-200 p-4 dark:border-white/10 sm:p-5 print:hidden">
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-[1fr_1fr_1.2fr_1fr_1fr_1fr_1.6fr]">
                <ReportField label="ปีการศึกษา">
                  <select className="report-input" value={academicYear} onChange={(e) => setAcademicYear(e.target.value)}>
                    {yearOptions.map((y) => <option key={y} value={y}>ปีการศึกษา {y}</option>)}
                  </select>
                </ReportField>
                <ReportField label="ภาคเรียน">
                  <select className="report-input" value={semester} onChange={(e) => setSemester(e.target.value)}>
                    <option value="">ทุกภาคเรียน</option>
                    <option value="1">ภาคเรียนที่ 1</option>
                    <option value="2">ภาคเรียนที่ 2</option>
                  </select>
                </ReportField>
                <ReportField label="ช่วงวันที่จัดสอนแทน">
                  <DateRangePicker
                    startDate={startDateKey}
                    endDate={endDateKey}
                    onChange={(s, e) => { setStartDateKey(s); setEndDateKey(e); }}
                  />
                </ReportField>
                <ReportField label="จัดกลุ่มตาม">
                  <select className="report-input" value={groupBy} onChange={(e) => setGroupBy(e.target.value as "none" | "original" | "substitute")}>
                    <option value="none">ไม่จัดกลุ่ม</option>
                    <option value="original">แยกตามครูเจ้าของคาบ</option>
                    <option value="substitute">แยกตามครูสอนแทน</option>
                  </select>
                </ReportField>
                <ReportField label="ครูเจ้าของคาบ">
                  <select className="report-input" value={filterOriginalTeacher} onChange={(e) => setFilterOriginalTeacher(e.target.value)}>
                    <option value="all">ทุกคน</option>
                    {originalTeacherOptions.map((name) => <option key={name} value={name}>{name}</option>)}
                  </select>
                </ReportField>
                <ReportField label="ครูสอนแทน">
                  <select className="report-input" value={filterSubstituteTeacher} onChange={(e) => setFilterSubstituteTeacher(e.target.value)}>
                    <option value="all">ทุกคน</option>
                    {substituteTeacherOptions.map((name) => <option key={name} value={name}>{name}</option>)}
                  </select>
                </ReportField>
                <ReportField label="ค้นหา">
                  <div className="flex gap-2">
                    <input className="report-input" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="ชื่อครู / วิชา / ชั้นเรียน" />
                    <button className="inline-flex h-10 min-w-[80px] items-center justify-center gap-1.5 rounded-md bg-blue-600 px-3 text-sm font-bold text-white shadow-sm hover:bg-blue-700">
                      <Search size={15} />ค้นหา
                    </button>
                  </div>
                </ReportField>
              </div>
              <div className="mt-3 text-sm font-medium text-gray-500 dark:text-gray-400">
                พบ {filteredRows.length} รายการ{groupBy !== "none" && ` แบ่งเป็น ${groupedSections?.length ?? 0} กลุ่ม`}
              </div>
            </div>

            {/* Table */}
            <div className="overflow-auto p-4">
              {loading ? (
                <SkeletonLoader height="360px" />
              ) : filteredRows.length > 0 ? (
                <>
                  <table className="min-w-full border-collapse border border-gray-300 bg-white text-[13px] text-gray-800 dark:border-white/10 dark:bg-[#2a2b2f] dark:text-gray-100">
                    <thead>
                      <tr className="bg-gray-200 dark:bg-white/10">
                        {["#", "วันที่", "คาบที่", "เวลา", "รหัสวิชา", "ชื่อวิชา", "ชั้นเรียน", "ครูเจ้าของคาบ", "ครูสอนแทน", "สถานที่"].map((h, index) => (
                          <th key={`${h}-${index}`} className="whitespace-nowrap border border-gray-300 px-2 py-2 text-center font-bold dark:border-white/10">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {groupBy === "none" ? (
                        pagedRows.map((r, index) => (
                          <tr key={r.id} className="hover:bg-gray-50 dark:hover:bg-white/5">
                            <ReportTd className="text-center">{(currentPage - 1) * ITEMS_PER_PAGE + index + 1}</ReportTd>
                            <ReportTd className="whitespace-nowrap text-center">{formatShortThaiDate(r.date)}</ReportTd>
                            <ReportTd className="text-center">{r.period ?? "-"}{portionSuffix(r.dayPortion)}</ReportTd>
                            <ReportTd className="whitespace-nowrap text-center">{r.startTime && r.endTime ? `${r.startTime}-${r.endTime}` : "-"}</ReportTd>
                            <ReportTd className="text-center">{r.subjectCode || "-"}</ReportTd>
                            <ReportTd>{r.subjectName || "-"}</ReportTd>
                            <ReportTd className="text-center">{formatClassId(r.classId)}</ReportTd>
                            <ReportTd>{r.originalTeacherName || "-"}</ReportTd>
                            <ReportTd className="font-semibold text-teal-700 dark:text-teal-400">{r.substituteTeacherName || "-"}</ReportTd>
                            <ReportTd className="text-center">{(r.roomName && r.roomName !== "all") ? r.roomName : "-"}</ReportTd>
                          </tr>
                        ))
                      ) : (
                        groupedSections!.map(section => (
                          <React.Fragment key={section.key}>
                            <tr className="bg-indigo-50 dark:bg-indigo-900/20">
                              <td colSpan={10} className="border border-gray-300 px-3 py-2.5 dark:border-white/10">
                                <span className="font-bold text-indigo-700 dark:text-indigo-300">
                                  {groupBy === "original" ? "ครูเจ้าของคาบ: " : "ครูสอนแทน: "}{section.label}
                                </span>
                                <span className="ml-2 rounded-full bg-indigo-100 px-2 py-0.5 text-xs font-semibold text-indigo-600 dark:bg-indigo-500/20 dark:text-indigo-300">
                                  {section.rows.length} คาบ
                                </span>
                              </td>
                            </tr>
                            {section.rows.map((r, index) => (
                              <tr key={r.id} className="hover:bg-gray-50 dark:hover:bg-white/5">
                                <ReportTd className="text-center text-gray-400">{index + 1}</ReportTd>
                                <ReportTd className="whitespace-nowrap text-center">{formatShortThaiDate(r.date)}</ReportTd>
                                <ReportTd className="text-center">{r.period ?? "-"}{portionSuffix(r.dayPortion)}</ReportTd>
                                <ReportTd className="whitespace-nowrap text-center">{r.startTime && r.endTime ? `${r.startTime}-${r.endTime}` : "-"}</ReportTd>
                                <ReportTd className="text-center">{r.subjectCode || "-"}</ReportTd>
                                <ReportTd>{r.subjectName || "-"}</ReportTd>
                                <ReportTd className="text-center">{formatClassId(r.classId)}</ReportTd>
                                <ReportTd>{r.originalTeacherName || "-"}</ReportTd>
                                <ReportTd className="font-semibold text-teal-700 dark:text-teal-400">{r.substituteTeacherName || "-"}</ReportTd>
                                <ReportTd className="text-center">{(r.roomName && r.roomName !== "all") ? r.roomName : "-"}</ReportTd>
                              </tr>
                            ))}
                          </React.Fragment>
                        ))
                      )}
                    </tbody>
                  </table>
                  {groupBy === "none" && totalPages > 1 && (
                    <div className="mt-4 flex items-center justify-between gap-2 print:hidden">
                      <span className="text-sm text-gray-500 dark:text-gray-400">หน้า {currentPage} / {totalPages} (ทั้งหมด {filteredRows.length} รายการ)</span>
                      <div className="flex items-center gap-1">
                        <button onClick={() => setCurrentPage(1)} disabled={currentPage === 1} className="inline-flex h-8 w-8 items-center justify-center rounded border border-gray-300 text-sm font-bold text-gray-600 hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-40 dark:border-white/10 dark:text-gray-300 dark:hover:bg-white/10">«</button>
                        <button onClick={() => setCurrentPage((p) => Math.max(1, p - 1))} disabled={currentPage === 1} className="inline-flex h-8 w-8 items-center justify-center rounded border border-gray-300 text-gray-600 hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-40 dark:border-white/10 dark:text-gray-300 dark:hover:bg-white/10"><ChevronLeft size={15} /></button>
                        {Array.from({ length: totalPages }, (_, i) => i + 1).filter((p) => p === 1 || p === totalPages || Math.abs(p - currentPage) <= 2).reduce<(number | "...")[]>((acc, p, idx, arr) => { if (idx > 0 && p - (arr[idx - 1] as number) > 1) acc.push("..."); acc.push(p); return acc; }, []).map((item, idx) => item === "..." ? <span key={`e-${idx}`} className="px-1 text-gray-400">…</span> : <button key={item} onClick={() => setCurrentPage(item as number)} className={`inline-flex h-8 min-w-[32px] items-center justify-center rounded border px-2 text-sm font-bold transition ${currentPage === item ? "border-teal-500 bg-teal-500 text-white" : "border-gray-300 text-gray-600 hover:bg-gray-100 dark:border-white/10 dark:text-gray-300 dark:hover:bg-white/10"}`}>{item}</button>)}
                        <button onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))} disabled={currentPage === totalPages} className="inline-flex h-8 w-8 items-center justify-center rounded border border-gray-300 text-gray-600 hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-40 dark:border-white/10 dark:text-gray-300 dark:hover:bg-white/10"><ChevronRight size={15} /></button>
                        <button onClick={() => setCurrentPage(totalPages)} disabled={currentPage === totalPages} className="inline-flex h-8 w-8 items-center justify-center rounded border border-gray-300 text-sm font-bold text-gray-600 hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-40 dark:border-white/10 dark:text-gray-300 dark:hover:bg-white/10">»</button>
                      </div>
                    </div>
                  )}
                </>
              ) : (
                <div className="border border-dashed border-gray-300 py-12 text-center text-sm font-semibold text-gray-400 dark:border-white/10">
                  ไม่พบข้อมูลรายงานการสอนแทน
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </MainLayout>
  );
};

const ReportField: React.FC<{ label: string; children: React.ReactNode }> = ({ label, children }) => (
  <label className="block">
    <span className="mb-2 block text-sm font-bold text-gray-900 dark:text-white">{label}</span>
    {children}
  </label>
);

const ReportTd: React.FC<{ children?: React.ReactNode; className?: string }> = ({ children, className = "" }) => (
  <td className={`border border-gray-300 px-2 py-2 align-middle dark:border-white/10 ${className}`}>{children}</td>
);

// ─── DateRangePicker ─────────────────────────────────────────────────────────

const THAI_MONTHS = ["มกราคม","กุมภาพันธ์","มีนาคม","เมษายน","พฤษภาคม","มิถุนายน","กรกฎาคม","สิงหาคม","กันยายน","ตุลาคม","พฤศจิกายน","ธันวาคม"];
const DAY_LABELS = ["อา","จ","อ","พ","พฤ","ศ","ส"];

const todayKey = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
};

const DateRangePicker: React.FC<{
  startDate: string;
  endDate: string;
  onChange: (start: string, end: string) => void;
}> = ({ startDate, endDate, onChange }) => {
  const ref = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [picking, setPicking] = useState<"start" | "end">("start");
  const [hoverKey, setHoverKey] = useState("");
  const today = new Date();
  const [viewYear, setViewYear] = useState(today.getFullYear());
  const [viewMonth, setViewMonth] = useState(today.getMonth());

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
        setHoverKey("");
      }
    };
    if (open) document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  const fmtShort = (k: string) =>
    k ? new Date(k + "T00:00:00").toLocaleDateString("th-TH", { day: "numeric", month: "short" }) : "—";

  const displayLabel = () => {
    if (!startDate && !endDate) return "ทุกวัน";
    if (startDate && endDate) return startDate === endDate ? fmtShort(startDate) : `${fmtShort(startDate)} – ${fmtShort(endDate)}`;
    if (startDate) return `ตั้งแต่ ${fmtShort(startDate)}`;
    return fmtShort(endDate);
  };

  const prevMonth = () => {
    if (viewMonth === 0) { setViewMonth(11); setViewYear(y => y - 1); }
    else setViewMonth(m => m - 1);
  };
  const nextMonth = () => {
    if (viewMonth === 11) { setViewMonth(0); setViewYear(y => y + 1); }
    else setViewMonth(m => m + 1);
  };

  const makeKey = (y: number, m: number, d: number) =>
    `${y}-${String(m + 1).padStart(2,"0")}-${String(d).padStart(2,"0")}`;

  const handleDayClick = (day: number) => {
    const key = makeKey(viewYear, viewMonth, day);
    if (picking === "start") {
      onChange(key, "");
      setPicking("end");
    } else {
      if (key < startDate) {
        onChange(key, startDate);
      } else {
        onChange(startDate, key);
      }
      setPicking("start");
      setHoverKey("");
      setOpen(false);
    }
  };

  const dispStart = picking === "end" && hoverKey && hoverKey < startDate ? hoverKey : startDate;
  const dispEnd = picking === "end" && hoverKey
    ? (hoverKey >= startDate ? hoverKey : startDate)
    : endDate;

  const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
  const firstDay = new Date(viewYear, viewMonth, 1).getDay();
  const tk = todayKey();

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => { setOpen(o => !o); if (!open) setPicking(startDate && !endDate ? "end" : "start"); }}
        className="report-input flex items-center justify-between gap-2"
      >
        <span className={(startDate || endDate) ? "font-semibold text-gray-900 dark:text-white" : "text-gray-400 dark:text-gray-500"}>
          {displayLabel()}
        </span>
        <Calendar size={15} className="shrink-0 text-gray-400 dark:text-gray-500" />
      </button>

      {open && (
        <div className="absolute left-0 z-50 mt-2 w-80 overflow-hidden rounded-2xl border border-gray-200/80 bg-white shadow-2xl dark:border-white/10 dark:bg-[#252629]">
          {/* Start / End tabs */}
          <div className="flex gap-2 px-4 pt-4 pb-2">
            <button
              onClick={() => setPicking("start")}
              className={`flex-1 rounded-xl border-2 px-2 py-1.5 text-[11px] font-bold transition ${picking === "start" ? "border-teal-500 bg-teal-50 text-teal-600 dark:bg-teal-500/10 dark:text-teal-400" : "border-gray-200 text-gray-400 dark:border-white/10 dark:text-gray-500"}`}
            >
              <div className="mb-0.5 text-[9px] uppercase tracking-widest opacity-60">เริ่มต้น</div>
              {startDate ? fmtShort(startDate) : "—"}
            </button>
            <div className="flex items-center text-gray-300 dark:text-gray-600 text-sm">→</div>
            <button
              onClick={() => { if (startDate) setPicking("end"); }}
              className={`flex-1 rounded-xl border-2 px-2 py-1.5 text-[11px] font-bold transition ${picking === "end" ? "border-teal-500 bg-teal-50 text-teal-600 dark:bg-teal-500/10 dark:text-teal-400" : "border-gray-200 text-gray-400 dark:border-white/10 dark:text-gray-500"}`}
            >
              <div className="mb-0.5 text-[9px] uppercase tracking-widest opacity-60">สิ้นสุด</div>
              {endDate ? fmtShort(endDate) : "—"}
            </button>
          </div>

          {/* Month nav */}
          <div className="flex items-center justify-between px-4 py-2">
            <button onClick={prevMonth} className="flex h-8 w-8 items-center justify-center rounded-full text-gray-500 transition hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-white/10">
              <ChevronLeft size={16} />
            </button>
            <span className="text-sm font-bold text-gray-800 dark:text-white">
              {THAI_MONTHS[viewMonth]} {viewYear + 543}
            </span>
            <button onClick={nextMonth} className="flex h-8 w-8 items-center justify-center rounded-full text-gray-500 transition hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-white/10">
              <ChevronRight size={16} />
            </button>
          </div>

          {/* Day labels */}
          <div className="grid grid-cols-7 px-3">
            {DAY_LABELS.map((d, i) => (
              <div key={d} className={`py-1 text-center text-[10px] font-bold ${i === 0 ? "text-red-400" : i === 6 ? "text-blue-400" : "text-gray-400 dark:text-gray-500"}`}>
                {d}
              </div>
            ))}
          </div>

          {/* Day cells */}
          <div className="grid grid-cols-7 px-2 pb-2">
            {Array.from({ length: firstDay }, (_, i) => <div key={`e${i}`} />)}
            {Array.from({ length: daysInMonth }, (_, i) => {
              const day = i + 1;
              const key = makeKey(viewYear, viewMonth, day);
              const isRangeStart = key === dispStart;
              const isRangeEnd = key === dispEnd;
              const inRange = dispStart && dispEnd && key > dispStart && key < dispEnd;
              const isEndpoint = key === startDate || key === endDate || isRangeStart || isRangeEnd;
              const isToday = key === tk;
              const col = (firstDay + i) % 7;

              return (
                <div
                  key={day}
                  className={[
                    "relative flex h-9 items-center justify-center",
                    inRange ? "bg-teal-50 dark:bg-teal-500/10" : "",
                    isRangeStart && dispEnd ? "rounded-l-full" : "",
                    isRangeEnd && dispStart ? "rounded-r-full" : "",
                  ].filter(Boolean).join(" ")}
                >
                  <button
                    onClick={() => handleDayClick(day)}
                    onMouseEnter={() => picking === "end" && setHoverKey(key)}
                    onMouseLeave={() => picking === "end" && setHoverKey("")}
                    className={[
                      "relative z-10 flex h-8 w-8 items-center justify-center rounded-full text-[13px] font-medium transition",
                      isEndpoint ? "bg-teal-500 text-white shadow-md shadow-teal-500/25" : "",
                      !isEndpoint && isToday ? "ring-2 ring-teal-400 ring-offset-1 text-teal-600 dark:ring-teal-500 dark:text-teal-400 dark:ring-offset-[#252629]" : "",
                      !isEndpoint && !isToday && col === 0 ? "text-red-400 hover:bg-red-50 dark:hover:bg-red-500/10" : "",
                      !isEndpoint && !isToday && col === 6 ? "text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-500/10" : "",
                      !isEndpoint && !isToday && col !== 0 && col !== 6 ? "text-gray-700 hover:bg-teal-50 dark:text-gray-300 dark:hover:bg-teal-500/10" : "",
                    ].filter(Boolean).join(" ")}
                  >
                    {day}
                  </button>
                </div>
              );
            })}
          </div>

          {/* Footer */}
          <div className="flex items-center justify-between border-t border-gray-100 px-5 py-3 dark:border-white/10">
            <button
              onClick={() => { onChange("", ""); setPicking("start"); setHoverKey(""); setOpen(false); }}
              className="text-sm font-semibold text-gray-400 transition hover:text-red-500 dark:text-gray-500 dark:hover:text-red-400"
            >ล้างทั้งหมด</button>
            <button
              onClick={() => { onChange(tk, tk); setPicking("start"); setHoverKey(""); setOpen(false); }}
              className="text-sm font-semibold text-teal-500 transition hover:text-teal-600 dark:hover:text-teal-400"
            >วันนี้</button>
          </div>
        </div>
      )}
    </div>
  );
};

// ─── PDF ─────────────────────────────────────────────────────────────────────

const pdfStyles = StyleSheet.create({
  page: {
    fontFamily: "TH Sarabun PSK",
    paddingTop: 28,
    paddingHorizontal: 28,
    paddingBottom: 24,
    backgroundColor: "#fff",
    color: "#111",
    fontSize: 12,
  },
  topBar: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-end",
    borderBottomWidth: 0.8,
    borderBottomColor: "#777",
    paddingBottom: 4,
    marginBottom: 8,
  },
  topText: { fontSize: 13, fontWeight: "bold" },
  headerBlock: { position: "relative", minHeight: 68, marginBottom: 6 },
  logo: { position: "absolute", left: 0, top: 2, width: 56, height: 56, objectFit: "contain" },
  titleWrap: { alignItems: "center", paddingTop: 6 },
  title: { fontSize: 20, fontWeight: "bold", textAlign: "center" },
  subtitle: { fontSize: 14, textAlign: "center", marginTop: 4 },
  table: { width: "100%", borderTopWidth: 0.8, borderLeftWidth: 0.8, borderColor: "#222" },
  row: { flexDirection: "row", width: "100%", minHeight: 18, borderBottomWidth: 0.8, borderColor: "#222" },
  headerRow: { backgroundColor: "#d4d4d4", minHeight: 24 },
  cell: { borderRightWidth: 0.8, borderColor: "#222", paddingHorizontal: 3, paddingVertical: 2, justifyContent: "center" },
  headerCell: { alignItems: "center" },
  headerText: { fontSize: 12, fontWeight: "bold", textAlign: "center" },
  bodyText: { fontSize: 11, lineHeight: 1 },
  centerText: { textAlign: "center" },
  pageNumber: { position: "absolute", bottom: 10, right: 28, fontSize: 9, color: "#555" },
});

const SubstituteReportPdfDocument: React.FC<{ data: PdfReportData }> = ({ data }) => {
  const logoSrc = data.logoUrl || "/school-logo.png";
  const rowPages = chunkRowsWithHeader(data.rows, PDF_ROWS_FIRST_PAGE, PDF_ROWS_OTHER_PAGES);

  return (
    <PdfDocument>
      {rowPages.map((pageRows, pageIndex) => (
        <Page key={`sub-report-page-${pageIndex}`} size="A4" orientation="landscape" style={pdfStyles.page}>
          {pageIndex === 0 && (
            <>
              <View style={pdfStyles.topBar} fixed>
                <Text style={pdfStyles.topText}>{data.schoolName}</Text>
                <Text style={pdfStyles.topText}>{data.title}</Text>
              </View>
              <View style={pdfStyles.headerBlock}>
                {logoSrc ? <Image src={logoSrc} style={pdfStyles.logo} /> : null}
                <View style={pdfStyles.titleWrap}>
                  <Text style={pdfStyles.title}>{data.title}</Text>
                  <Text style={pdfStyles.subtitle}>{data.subtitle}</Text>
                </View>
              </View>
            </>
          )}

          <View style={pdfStyles.table}>
            <View style={[pdfStyles.row, pdfStyles.headerRow]} wrap={false}>
              {data.columns.map((col) => (
                <View key={col.label} style={[pdfStyles.cell, pdfStyles.headerCell, { width: `${col.width}%` }]}>
                  <Text style={pdfStyles.headerText}>{col.label}</Text>
                </View>
              ))}
            </View>

            {pageRows.map((row, rowIndex) => (
              <View key={`${pageIndex}-${rowIndex}`} style={pdfStyles.row} wrap={false}>
                {data.columns.map((col, colIndex) => (
                  <View
                    key={`${pageIndex}-${rowIndex}-${col.label}`}
                    style={[pdfStyles.cell, { width: `${col.width}%` }, col.align === "center" ? { alignItems: "center" } : {}]}
                  >
                    <Text style={[pdfStyles.bodyText, col.align === "center" ? pdfStyles.centerText : {}]}>
                      {row[colIndex] || ""}
                    </Text>
                  </View>
                ))}
              </View>
            ))}
          </View>

          <Text
            style={pdfStyles.pageNumber}
            render={({ pageNumber, totalPages }) => `หน้า ${pageNumber}/${totalPages}`}
            fixed
          />
        </Page>
      ))}
    </PdfDocument>
  );
};

const chunkRowsWithHeader = (rows: string[][], firstPageSize: number, otherPageSize: number): string[][][] => {
  if (rows.length === 0) return [[]];
  const pages: string[][][] = [];
  pages.push(rows.slice(0, firstPageSize));
  for (let i = firstPageSize; i < rows.length; i += otherPageSize) {
    pages.push(rows.slice(i, i + otherPageSize));
  }
  return pages;
};

export default SubstituteReportPage;
