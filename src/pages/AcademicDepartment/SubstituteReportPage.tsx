import React, { useEffect, useMemo, useState } from "react";
import { useSelector } from "react-redux";
import { collection, doc, getDoc, getDocs, query, Timestamp, where } from "firebase/firestore";
import { ChevronLeft, ChevronRight, FileText, Printer, RefreshCw, Search } from "lucide-react";
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
}

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
  const [academicYear, setAcademicYear] = useState(defaultYear);
  const [filterOriginalTeacher, setFilterOriginalTeacher] = useState("all");
  const [filterSubstituteTeacher, setFilterSubstituteTeacher] = useState("all");
  const [search, setSearch] = useState("");
  const [currentPage, setCurrentPage] = useState(1);

  useEffect(() => {
    if (!schoolId) return;
    loadData();
  }, [schoolId, academicYear]);

  const loadData = async () => {
    setLoading(true);
    try {
      const [schoolSnap, subsSnap] = await Promise.all([
        getDoc(doc(db, "school-settings", schoolId)),
        academicYear
          ? getDocs(query(collection(db, "school-settings", schoolId, "substitutions"), where("academicYear", "==", academicYear)))
          : getDocs(collection(db, "school-settings", schoolId, "substitutions")),
      ]);

      const schoolData = schoolSnap.exists() ? schoolSnap.data() : {};
      setSchoolName(String(schoolData.schoolName || schoolData.name || schoolData.schoolThaiName || ""));
      setLogoUrl(schoolData.logoUrl);

      const rows: SubstitutionRecord[] = subsSnap.docs
        .map((d) => ({ id: d.id, ...(d.data() as any) } as SubstitutionRecord))
        .sort((a, b) => {
          const dateA = toDateKey(a.date);
          const dateB = toDateKey(b.date);
          if (dateA !== dateB) return dateA.localeCompare(dateB);
          return (a.period ?? 0) - (b.period ?? 0);
        });

      setRecords(rows);
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

  const filteredRows = useMemo(() => {
    setCurrentPage(1);
    return records.filter((r) => {
      if (filterOriginalTeacher !== "all" && r.originalTeacherName !== filterOriginalTeacher) return false;
      if (filterSubstituteTeacher !== "all" && r.substituteTeacherName !== filterSubstituteTeacher) return false;
      if (keyword) {
        const text = [
          r.originalTeacherName,
          r.substituteTeacherName,
          r.subjectName,
          r.subjectCode,
          formatClassId(r.classId),
        ].join(" ").toLowerCase();
        if (!text.includes(keyword)) return false;
      }
      return true;
    });
  }, [records, filterOriginalTeacher, filterSubstituteTeacher, keyword]);

  const totalPages = Math.max(1, Math.ceil(filteredRows.length / ITEMS_PER_PAGE));
  const pagedRows = filteredRows.slice((currentPage - 1) * ITEMS_PER_PAGE, currentPage * ITEMS_PER_PAGE);

  const buildPdfData = (): PdfReportData => ({
    title: "รายงานการสอนแทน",
    subtitle: `${schoolName || "โรงเรียน"} ปีการศึกษา ${academicYear || "2568"}`,
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
      String(r.period ?? "-"),
      r.startTime && r.endTime ? `${r.startTime}-${r.endTime}` : "-",
      r.subjectCode || "-",
      r.subjectName || "-",
      formatClassId(r.classId),
      r.originalTeacherName || "-",
      r.substituteTeacherName || "-",
      r.roomName || "-",
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
    const currentYear = Number(defaultYear) || 2568;
    return [currentYear - 1, currentYear, currentYear + 1].map(String);
  }, [defaultYear]);

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
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-[1fr_1fr_1fr_1fr_200px]">
                <ReportField label="ปีการศึกษา">
                  <select className="report-input" value={academicYear} onChange={(e) => setAcademicYear(e.target.value)}>
                    {yearOptions.map((y) => <option key={y} value={y}>ปีการศึกษา {y}</option>)}
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
                    <input
                      className="report-input"
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                      placeholder="ชื่อครู / วิชา / ชั้นเรียน"
                    />
                    <button className="inline-flex h-10 min-w-[100px] items-center justify-center gap-2 rounded-md bg-blue-600 px-4 text-sm font-bold text-white shadow-sm hover:bg-blue-700">
                      <Search size={16} />
                      ค้นหา
                    </button>
                  </div>
                </ReportField>
              </div>
              <div className="mt-2 text-sm font-medium text-gray-500 dark:text-gray-400">
                พบ {filteredRows.length} รายการ
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
                        {["#", "วันที่", "คาบที่", "เวลา", "รหัสวิชา", "ชื่อวิชา", "ชั้นเรียน", "ครูเจ้าของคาบ", "ครูสอนแทน", "สถานที่"].map((h) => (
                          <th key={h} className="whitespace-nowrap border border-gray-300 px-2 py-2 text-center font-bold dark:border-white/10">
                            {h}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {pagedRows.map((r, index) => (
                        <tr key={r.id} className="hover:bg-gray-50 dark:hover:bg-white/5">
                          <ReportTd className="text-center">{(currentPage - 1) * ITEMS_PER_PAGE + index + 1}</ReportTd>
                          <ReportTd className="whitespace-nowrap text-center">{formatShortThaiDate(r.date)}</ReportTd>
                          <ReportTd className="text-center">{r.period ?? "-"}</ReportTd>
                          <ReportTd className="whitespace-nowrap text-center">
                            {r.startTime && r.endTime ? `${r.startTime}-${r.endTime}` : "-"}
                          </ReportTd>
                          <ReportTd className="text-center">{r.subjectCode || "-"}</ReportTd>
                          <ReportTd>{r.subjectName || "-"}</ReportTd>
                          <ReportTd className="text-center">{formatClassId(r.classId)}</ReportTd>
                          <ReportTd>{r.originalTeacherName || "-"}</ReportTd>
                          <ReportTd className="font-semibold text-teal-700 dark:text-teal-400">{r.substituteTeacherName || "-"}</ReportTd>
                          <ReportTd className="text-center">{r.roomName || "-"}</ReportTd>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {totalPages > 1 && (
                    <div className="mt-4 flex items-center justify-between gap-2 print:hidden">
                      <span className="text-sm text-gray-500 dark:text-gray-400">
                        หน้า {currentPage} / {totalPages} (ทั้งหมด {filteredRows.length} รายการ)
                      </span>
                      <div className="flex items-center gap-1">
                        <button onClick={() => setCurrentPage(1)} disabled={currentPage === 1} className="inline-flex h-8 w-8 items-center justify-center rounded border border-gray-300 text-sm font-bold text-gray-600 hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-40 dark:border-white/10 dark:text-gray-300 dark:hover:bg-white/10">«</button>
                        <button onClick={() => setCurrentPage((p) => Math.max(1, p - 1))} disabled={currentPage === 1} className="inline-flex h-8 w-8 items-center justify-center rounded border border-gray-300 text-gray-600 hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-40 dark:border-white/10 dark:text-gray-300 dark:hover:bg-white/10">
                          <ChevronLeft size={15} />
                        </button>
                        {Array.from({ length: totalPages }, (_, i) => i + 1)
                          .filter((p) => p === 1 || p === totalPages || Math.abs(p - currentPage) <= 2)
                          .reduce<(number | "...")[]>((acc, p, idx, arr) => {
                            if (idx > 0 && p - (arr[idx - 1] as number) > 1) acc.push("...");
                            acc.push(p);
                            return acc;
                          }, [])
                          .map((item, idx) =>
                            item === "..." ? (
                              <span key={`ellipsis-${idx}`} className="px-1 text-gray-400">…</span>
                            ) : (
                              <button key={item} onClick={() => setCurrentPage(item as number)}
                                className={`inline-flex h-8 min-w-[32px] items-center justify-center rounded border px-2 text-sm font-bold transition ${currentPage === item ? "border-teal-500 bg-teal-500 text-white" : "border-gray-300 text-gray-600 hover:bg-gray-100 dark:border-white/10 dark:text-gray-300 dark:hover:bg-white/10"}`}>
                                {item}
                              </button>
                            )
                          )}
                        <button onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))} disabled={currentPage === totalPages} className="inline-flex h-8 w-8 items-center justify-center rounded border border-gray-300 text-gray-600 hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-40 dark:border-white/10 dark:text-gray-300 dark:hover:bg-white/10">
                          <ChevronRight size={15} />
                        </button>
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
