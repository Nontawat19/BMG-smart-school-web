import React, { useEffect, useMemo, useState } from "react";
import { useSelector } from "react-redux";
import {
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  Timestamp,
  where,
} from "firebase/firestore";
import { Calendar, CalendarDays, Printer, RefreshCw } from "lucide-react";
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
  period?: number;
  classId?: string | string[] | null;
  subjectName?: string;
  subjectCode?: string;
}

interface TeacherGroup {
  teacherName: string;
  records: SubstitutionRecord[];
}

const CLASS_NAMES: Record<string, string> = {
  k1: "อ.1", k2: "อ.2", k3: "อ.3",
  p1: "ป.1", p2: "ป.2", p3: "ป.3", p4: "ป.4", p5: "ป.5", p6: "ป.6",
  m1: "ม.1", m2: "ม.2", m3: "ม.3", m4: "ม.4", m5: "ม.5", m6: "ม.6",
};

const formatClassId = (classId: string | string[] | null | undefined): string => {
  if (!classId) return "-";
  const ids = Array.isArray(classId) ? classId : [classId];
  return ids
    .map((id) => {
      const [lvl, rm] = String(id).split("/");
      return CLASS_NAMES[lvl] ? `${CLASS_NAMES[lvl]}${rm ? `/${rm}` : ""}` : String(id);
    })
    .join(", ");
};

const formatThaiDate = (dateStr: string): string => {
  if (!dateStr) return "";
  const d = new Date(dateStr + "T12:00:00");
  const raw = d.toLocaleDateString("th-TH", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
  return raw.replace(/([^\s])ที่/, "$1 ที่");
};

const sanitizeFileName = (v: string) =>
  v.replace(/[\\\/:*?"<>|]/g, "_").replace(/\s+/g, "_");

const todayKey = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

// PDF

const pdfStyles = StyleSheet.create({
  page: {
    fontFamily: "TH Sarabun PSK",
    fontSize: 14,
    paddingHorizontal: 60,
    paddingTop: 24,
    paddingBottom: 50,
    backgroundColor: "#ffffff",
  },

  tableBlock: {
    marginBottom: 16,
  },
  tableTitle: {
    textAlign: "center",
    fontSize: 15,
    fontWeight: "bold",
    marginBottom: 4,
  },
  rowHeader: {
    flexDirection: "row",
    backgroundColor: "#f3f4f6",
    borderTopWidth: 1,
    borderLeftWidth: 1,
    borderColor: "#374151",
  },
  row: {
    flexDirection: "row",
    borderLeftWidth: 1,
    borderColor: "#374151",
  },
  cell: {
    borderRightWidth: 1,
    borderBottomWidth: 1,
    borderColor: "#374151",
    paddingVertical: 4,
    paddingHorizontal: 5,
    fontSize: 13,
    textAlign: "center",
  },
  cellPeriod: { width: "10%" },
  cellCode: { width: "18%" },
  cellClass: { width: "15%" },
  cellTeacher: { width: "32%", textAlign: "left" },
  cellSign: { width: "25%" },
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
  headerBlock: { position: "relative", minHeight: 58, marginBottom: 8 },
  logo: { position: "absolute", left: 0, top: 0, width: 52, height: 52, objectFit: "contain" },
  titleWrap: { alignItems: "center", paddingTop: 2 },
  mainTitle: { fontSize: 18, fontWeight: "bold", textAlign: "center" },
  mainSubtitle: { fontSize: 13, textAlign: "center", marginTop: 1 },
  signSection: {
    marginTop: 40,
    width: "100%",
    alignItems: "center",
  },
  signWrapper: {
    width: 360,
    marginLeft: "auto",
    marginRight: "auto",
  },
  signBlock: {
    marginBottom: 28,
  },
  signRow: {
    flexDirection: "row",
    alignItems: "flex-end",
  },
  signPrefix: { fontSize: 14 },
  signDotsCol: { flex: 1 },
  signDotsLine: {
    borderBottomWidth: 1,
    borderBottomColor: "#000",
    borderBottomStyle: "dotted",
    height: 14,
  },
  signName: { fontSize: 14, marginTop: 3, marginLeft: 38, marginRight: 148, textAlign: "center" },
  signRole: { fontSize: 14, width: 148, textAlign: "left" },
});

const SubstituteSchedulePdf: React.FC<{
  schoolName: string;
  dateLabel: string;
  groups: TeacherGroup[];
  signerName: string;
  academicHeadName: string;
  logoUrl?: string;
}> = ({ schoolName, dateLabel, groups, signerName, academicHeadName, logoUrl }) => (
  <PdfDocument>
    <Page size="A4" style={pdfStyles.page}>
      {/* Running header — fixed on every page */}
      <View style={pdfStyles.topBar} fixed>
        <Text style={pdfStyles.topText}>{schoolName}</Text>
        <Text style={pdfStyles.topText}>ตารางสอนแทน</Text>
      </View>
      {/* Main header: logo + title */}
      <View style={pdfStyles.headerBlock}>
        {logoUrl ? <Image src={logoUrl} style={pdfStyles.logo} /> : null}
        <View style={pdfStyles.titleWrap}>
          <Text style={pdfStyles.mainTitle}>ตารางสอนแทน</Text>
          <Text style={pdfStyles.mainSubtitle}>{dateLabel}</Text>
        </View>
      </View>

      {groups.map((group, gi) => (
        <View key={gi} style={pdfStyles.tableBlock}>
          {/* title + column headers stay together — won't be left orphaned at page bottom */}
          <View wrap={false}>
            <Text style={pdfStyles.tableTitle}>
              {`ตารางสอนแทน ${group.teacherName} ${dateLabel}`}
            </Text>
            <View style={pdfStyles.rowHeader}>
              <Text style={[pdfStyles.cell, pdfStyles.cellPeriod, { fontWeight: "bold" }]}>คาบที่</Text>
              <Text style={[pdfStyles.cell, pdfStyles.cellCode, { fontWeight: "bold" }]}>รหัสวิชา</Text>
              <Text style={[pdfStyles.cell, pdfStyles.cellClass, { fontWeight: "bold" }]}>ระดับชั้น</Text>
              <Text style={[pdfStyles.cell, pdfStyles.cellTeacher, { fontWeight: "bold" }]}>ครูผู้สอนแทน</Text>
              <Text style={[pdfStyles.cell, pdfStyles.cellSign, { fontWeight: "bold" }]}>ลงชื่อ</Text>
            </View>
          </View>
          {group.records.map((rec, ri) => (
            <View key={ri} style={pdfStyles.row} wrap={false}>
              <Text style={[pdfStyles.cell, pdfStyles.cellPeriod]}>{rec.period ?? "-"}</Text>
              <Text style={[pdfStyles.cell, pdfStyles.cellCode]}>{rec.subjectCode || "-"}</Text>
              <Text style={[pdfStyles.cell, pdfStyles.cellClass]}>{formatClassId(rec.classId)}</Text>
              <Text style={[pdfStyles.cell, pdfStyles.cellTeacher]}>{rec.substituteTeacherName || "-"}</Text>
              <Text style={[pdfStyles.cell, pdfStyles.cellSign]}>{""}</Text>
            </View>
          ))}
        </View>
      ))}

      <View style={pdfStyles.signSection}>
        <View style={pdfStyles.signWrapper}>
          <View style={pdfStyles.signBlock}>
            <View style={pdfStyles.signRow}>
              <Text style={pdfStyles.signPrefix}>ลงชื่อ</Text>
              <View style={pdfStyles.signDotsCol}>
                <View style={pdfStyles.signDotsLine} />
              </View>
              <Text style={pdfStyles.signRole}>งานจัดสอนแทน</Text>
            </View>
            <Text style={pdfStyles.signName}>{`(${signerName || "........................................"})`}</Text>
          </View>
          <View style={pdfStyles.signBlock}>
            <View style={pdfStyles.signRow}>
              <Text style={pdfStyles.signPrefix}>ลงชื่อ</Text>
              <View style={pdfStyles.signDotsCol}>
                <View style={pdfStyles.signDotsLine} />
              </View>
              <Text style={pdfStyles.signRole}>หัวหน้ากลุ่มบริหารวิชาการ</Text>
            </View>
            <Text style={pdfStyles.signName}>{`(${academicHeadName || "........................................"})`}</Text>
          </View>
        </View>
      </View>
    </Page>
  </PdfDocument>
);

// Page

const SubstituteSchedulePrintPage: React.FC = () => {
  const currentUser = useSelector((state: RootState) => state.auth.user);
  const schoolId = (currentUser as any)?.schoolId || "";
  const uid = (currentUser as any)?.uid || "";

  const [selectedDate, setSelectedDate] = useState(todayKey());
  const [loading, setLoading] = useState(false);
  const [isGeneratingPdf, setIsGeneratingPdf] = useState(false);
  const [schoolName, setSchoolName] = useState("");
  const [records, setRecords] = useState<SubstitutionRecord[]>([]);
  const [signerName, setSignerName] = useState("");
  const [academicHeadName, setAcademicHeadName] = useState("");
  const [logoUrl, setLogoUrl] = useState<string | undefined>(undefined);

  useEffect(() => {
    if (!schoolId || !uid) return;
    loadSchoolAndSignerInfo();
  }, [schoolId, uid]);

  useEffect(() => {
    if (schoolId && selectedDate) loadRecords(selectedDate);
  }, [schoolId, selectedDate]);

  const loadSchoolAndSignerInfo = async () => {
    const [schoolSnap, teacherSnap] = await Promise.all([
      getDoc(doc(db, "school-settings", schoolId)),
      getDoc(doc(db, "school-settings", schoolId, "teachers", uid)),
    ]);

    if (schoolSnap.exists()) {
      const data = schoolSnap.data();
      setSchoolName(String(data.schoolName || data.name || data.schoolThaiName || ""));
      if (data.logoUrl) setLogoUrl(String(data.logoUrl));
      const headPrefix = String(data.academicHeadPrefix || "").trim();
      const headName = String(data.academicHeadName || "").trim();
      setAcademicHeadName([headPrefix, headName].filter(Boolean).join(""));
    }

    if (teacherSnap.exists()) {
      const td = teacherSnap.data();
      const title = String(td.title || "").trim();
      const firstName = String(td.firstName || "").trim();
      const lastName = String(td.lastName || "").trim();
      const composed = [title, firstName, lastName].filter(Boolean).join("");
      setSignerName(composed || String(currentUser?.fullName || "").trim());
    } else {
      setSignerName(String(currentUser?.fullName || "").trim());
    }
  };

  const loadRecords = async (dateKey: string) => {
    setLoading(true);
    try {
      const start = new Date(dateKey + "T00:00:00");
      const end = new Date(dateKey + "T23:59:59");
      const q = query(
        collection(db, "school-settings", schoolId, "substitutions"),
        where("date", ">=", Timestamp.fromDate(start)),
        where("date", "<=", Timestamp.fromDate(end))
      );
      const snap = await getDocs(q);
      const rows: SubstitutionRecord[] = snap.docs.map(
        (d) => ({ id: d.id, ...d.data() } as SubstitutionRecord)
      );
      rows.sort((a, b) => (a.period ?? 0) - (b.period ?? 0));
      setRecords(rows);
    } catch (e) {
      console.error("Error loading substitutions:", e);
    } finally {
      setLoading(false);
    }
  };

  const groups: TeacherGroup[] = useMemo(() => {
    const map = new Map<string, SubstitutionRecord[]>();
    records.forEach((rec) => {
      const key = rec.originalTeacherName || rec.originalTeacherId || "ไม่ระบุครู";
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(rec);
    });
    return Array.from(map.entries()).map(([teacherName, recs]) => ({
      teacherName,
      records: recs,
    }));
  }, [records]);

  const dateLabel = formatThaiDate(selectedDate);

  const handleGeneratePdf = async () => {
    setIsGeneratingPdf(true);
    try {
      const blob = await pdf(
        <SubstituteSchedulePdf
          schoolName={schoolName}
          dateLabel={dateLabel}
          groups={groups}
          signerName={signerName}
          academicHeadName={academicHeadName}
          logoUrl={logoUrl}
        />
      ).toBlob();
      saveAs(blob, `ตารางสอนแทน_${sanitizeFileName(selectedDate)}.pdf`);
    } finally {
      setIsGeneratingPdf(false);
    }
  };

  return (
    <MainLayout>
      <div className="px-3 sm:px-4 md:px-6 py-4 sm:py-6 min-h-screen bg-gray-50 dark:bg-[#1c1c24]">
        <div className="max-w-5xl mx-auto space-y-5">

          {/* ─── Page Header ─── */}
          <div className="flex flex-col sm:flex-row sm:items-center gap-3">
            <BackButton to="/academic/hub/scheduling" />
            <div className="flex items-center gap-3 flex-1 min-w-0">
              <div className="w-10 h-10 rounded-xl bg-teal-100 dark:bg-teal-500/20 flex items-center justify-center flex-shrink-0">
                <CalendarDays size={20} className="text-teal-600 dark:text-teal-400" />
              </div>
              <div className="min-w-0">
                <h1 className="text-xl font-bold text-gray-900 dark:text-white leading-tight">ตารางสอนแทน</h1>
                <p className="text-xs text-gray-500 dark:text-gray-400">รายงานการจัดสอนแทนรายวัน แยกตามครูผู้ลา</p>
              </div>
            </div>
            <button
              onClick={handleGeneratePdf}
              disabled={isGeneratingPdf || groups.length === 0}
              className="flex-shrink-0 px-5 py-2.5 rounded-xl bg-teal-600 dark:bg-teal-500 text-white text-sm font-semibold hover:bg-teal-700 dark:hover:bg-teal-600 active:scale-95 transition-all flex items-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed shadow-sm shadow-teal-200 dark:shadow-none"
            >
              {isGeneratingPdf ? <RefreshCw size={15} className="animate-spin" /> : <Printer size={15} />}
              ส่งออก PDF
            </button>
          </div>

          {/* ─── Filter Card ─── */}
          <div className="bg-white dark:bg-[#2a2b2f] rounded-2xl shadow-sm border border-gray-100 dark:border-white/5 p-4">
            <div className="flex flex-wrap items-end gap-3">
              <div className="flex-1 min-w-[180px]">
                <label className="block text-xs font-semibold text-gray-400 dark:text-gray-500 mb-1.5 uppercase tracking-wider">
                  เลือกวันที่
                </label>
                <div className="flex gap-2">
                  <div className="relative flex-1">
                    <Calendar size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
                    <input
                      type="date"
                      value={selectedDate}
                      onChange={(e) => setSelectedDate(e.target.value)}
                      className="pl-9 pr-3 py-2.5 w-full rounded-xl border border-gray-200 dark:border-white/10 bg-gray-50 dark:bg-white/5 text-gray-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-teal-500 transition-all"
                    />
                  </div>
                  <button
                    onClick={() => setSelectedDate(todayKey())}
                    className="px-3 py-2.5 rounded-xl text-xs font-semibold bg-gray-100 dark:bg-white/5 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-white/10 transition-all whitespace-nowrap border border-gray-200 dark:border-white/10"
                  >
                    วันนี้
                  </button>
                </div>
              </div>
              <button
                onClick={() => loadRecords(selectedDate)}
                className="px-4 py-2.5 rounded-xl bg-indigo-50 dark:bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 text-sm font-semibold border border-indigo-100 dark:border-indigo-500/20 hover:bg-indigo-100 dark:hover:bg-indigo-500/20 transition-all flex items-center gap-2"
              >
                <RefreshCw size={14} className={loading ? "animate-spin" : ""} />
                โหลดใหม่
              </button>
            </div>

            {/* Summary stats */}
            {!loading && groups.length > 0 && (
              <div className="mt-4 pt-4 border-t border-gray-100 dark:border-white/5 flex flex-wrap gap-5">
                <div className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-teal-500 flex-shrink-0" />
                  <span className="text-sm text-gray-500 dark:text-gray-400">
                    ครูลา <span className="font-bold text-gray-900 dark:text-white">{groups.length}</span> คน
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-indigo-500 flex-shrink-0" />
                  <span className="text-sm text-gray-500 dark:text-gray-400">
                    รวม <span className="font-bold text-gray-900 dark:text-white">{records.length}</span> คาบสอนแทน
                  </span>
                </div>
              </div>
            )}
          </div>

          {/* ─── Content ─── */}
          {loading ? (
            <div className="flex flex-col items-center justify-center py-24 gap-3 text-gray-400 dark:text-gray-500">
              <RefreshCw size={26} className="animate-spin" />
              <span className="text-sm">กำลังโหลดข้อมูล...</span>
            </div>
          ) : groups.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-24 gap-4 text-gray-400 dark:text-gray-500">
              <div className="w-16 h-16 rounded-2xl bg-gray-100 dark:bg-white/5 flex items-center justify-center">
                <CalendarDays size={28} />
              </div>
              <div className="text-center">
                <p className="text-base font-semibold text-gray-500 dark:text-gray-400">ไม่พบข้อมูลการสอนแทน</p>
                <p className="text-sm mt-1">{dateLabel}</p>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              {groups.map((group, gi) => (
                <div key={gi} className="bg-white dark:bg-[#2a2b2f] rounded-2xl shadow-sm border border-gray-100 dark:border-white/5 overflow-hidden">

                  {/* Card header */}
                  <div className="px-5 py-3.5 flex items-center gap-3 border-b border-gray-100 dark:border-white/[0.06]">
                    <div className="w-7 h-7 rounded-lg bg-teal-100 dark:bg-teal-500/20 flex items-center justify-center text-xs font-black text-teal-700 dark:text-teal-300 flex-shrink-0">
                      {gi + 1}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-bold text-gray-900 dark:text-white truncate">ครู{group.teacherName}</p>
                      <p className="text-xs text-gray-400 dark:text-gray-500">{dateLabel}</p>
                    </div>
                    <span className="flex-shrink-0 px-2.5 py-1 rounded-full bg-teal-50 dark:bg-teal-500/10 text-teal-700 dark:text-teal-300 text-xs font-bold">
                      {group.records.length} คาบ
                    </span>
                  </div>

                  {/* Table */}
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="bg-gray-50/80 dark:bg-white/[0.02] text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">
                          <th className="px-4 py-2.5 text-center w-16 border-b border-gray-100 dark:border-white/5">คาบที่</th>
                          <th className="px-4 py-2.5 text-center w-32 border-b border-gray-100 dark:border-white/5">รหัสวิชา</th>
                          <th className="px-4 py-2.5 text-center w-24 border-b border-gray-100 dark:border-white/5">ระดับชั้น</th>
                          <th className="px-4 py-2.5 text-left border-b border-gray-100 dark:border-white/5">ครูผู้สอนแทน</th>
                        </tr>
                      </thead>
                      <tbody>
                        {group.records.map((rec, ri) => (
                          <tr
                            key={ri}
                            className={`border-b border-gray-50 dark:border-white/[0.03] hover:bg-teal-50/30 dark:hover:bg-teal-500/5 transition-colors ${ri % 2 === 1 ? "bg-gray-50/40 dark:bg-white/[0.01]" : ""}`}
                          >
                            <td className="px-4 py-2.5 text-center">
                              <span className="inline-flex items-center justify-center w-7 h-7 rounded-lg bg-indigo-50 dark:bg-indigo-500/10 text-indigo-700 dark:text-indigo-300 text-xs font-bold">
                                {rec.period ?? "-"}
                              </span>
                            </td>
                            <td className="px-4 py-2.5 text-center font-mono text-xs text-gray-500 dark:text-gray-400">{rec.subjectCode || "-"}</td>
                            <td className="px-4 py-2.5 text-center text-gray-700 dark:text-gray-300">{formatClassId(rec.classId)}</td>
                            <td className="px-4 py-2.5 font-medium text-gray-800 dark:text-gray-200">{rec.substituteTeacherName || "-"}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              ))}
            </div>
          )}

        </div>
      </div>
    </MainLayout>
  );
};

export default SubstituteSchedulePrintPage;
