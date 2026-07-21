import React, { useEffect, useMemo, useState } from "react";
import { useSelector } from "react-redux";
import { collection, doc, documentId, getDoc, getDocs, query, where } from "firebase/firestore";
import { Document, Font, Image, Page, StyleSheet, Text, View, pdf } from "@react-pdf/renderer";
import { saveAs } from "file-saver";
import Swal from "sweetalert2";
import { AlertTriangle, CalendarDays, CheckCircle, FileDown, RefreshCw, Search } from "lucide-react";
import MainLayout from "@/layouts/MainLayout";
import BackButton from "@/components/Shared/BackButton";
import SkeletonLoader from "@/components/SkeletonLoader";
import { firestore } from "@/firebase";
import { RootState } from "@/store";
import { CLASSES, getClassLevelRank } from "@/utils/schoolUtils";
import { isActiveStudentStatus } from "@/utils/studentStatusUtils";

Font.register({
  family: "TH Sarabun PSK",
  fonts: [
    { src: "/fonts/THSarabunNew.ttf" },
    { src: "/fonts/THSarabunNew-Bold.ttf", fontWeight: "bold" },
  ],
});

// ป้องกัน @react-pdf/renderer แทรกเครื่องหมาย "-" ตอนตัดบรรทัด (ตัดคำได้เฉพาะที่ช่องว่างจริง 1 ตัวเป๊ะ ๆ
// ถ้าไม่ใช่ช่องว่างจริง หรือช่องว่างซ้ำกันมากกว่า 1 ตัว จะแทรก "-" ให้เสมอ)
Font.registerHyphenationCallback((word) => [word]);

interface CalendarEvent {
  type?: string;
  description?: string;
}

interface RiskRecord {
  id: string;
  studentId: string;
  studentNumber: string;
  fullName: string;
  classLevel: string;
  room: string;
  lateCount: number;
  absentCount: number;
  totalRiskDays: number;
  maxConsecutiveDays: number;
  maxConsecutiveRange: string;
  riskDates: string[];
  criteria: string;
  parentName?: string;
  parentPhone?: string;
}

interface SchoolInfo {
  schoolName: string;
  directorName: string;
  directorPrefix: string;
  documentCode: string;
  addressLine1: string;
  addressLine2: string;
  postalCode: string;
}

const pdfStyles = StyleSheet.create({
  page: {
    paddingTop: 42,
    paddingHorizontal: 36,
    paddingBottom: 36,
    fontFamily: "TH Sarabun PSK",
    fontSize: 12,
    color: "#111",
  },
  title: {
    fontSize: 22,
    fontWeight: "bold",
    textAlign: "center",
  },
  subtitle: {
    fontSize: 15,
    textAlign: "center",
    marginTop: 2,
    marginBottom: 10,
  },
  meta: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 8,
    fontSize: 12,
  },
  table: {
    borderTopWidth: 1,
    borderLeftWidth: 1,
    borderColor: "#222",
  },
  row: {
    flexDirection: "row",
    minHeight: 24,
  },
  th: {
    backgroundColor: "#f1f5f9",
    fontWeight: "bold",
  },
  cell: {
    borderRightWidth: 1,
    borderBottomWidth: 1,
    borderColor: "#222",
    padding: 3,
    justifyContent: "center",
  },
  center: {
    textAlign: "center",
  },
  footer: {
    marginTop: 30,
    flexDirection: "row",
    justifyContent: "space-between",
  },
  sign: {
    width: "45%",
    textAlign: "center",
  },
  pageNumber: {
    position: "absolute",
    bottom: 18,
    right: 30,
    fontSize: 10,
  },
});

const noticeStyles = StyleSheet.create({
  page: {
    paddingTop: 30,
    paddingHorizontal: 60,
    paddingBottom: 20,
    fontFamily: "TH Sarabun PSK",
    fontSize: 15,
    color: "#000",
    lineHeight: 1.25,
  },
  topCodeBlock: { width: "100%", alignItems: "flex-end", marginBottom: 5 },
  topCodeText: { fontSize: 15, fontWeight: "bold" },
  titleBlock: { width: "100%", alignItems: "center", marginBottom: 8 },
  titleText: { fontSize: 16.5, fontWeight: "bold" },
  headerRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-end", marginBottom: 0 },
  headerLeft: { width: "35%", alignItems: "flex-start" },
  headerCenter: { width: "30%", alignItems: "center" },
  headerRight: { width: "35%", alignItems: "flex-start" },
  addressRemainingRow: { flexDirection: "row", justifyContent: "flex-end", marginBottom: 10 },
  addressRemainingBlock: { width: "35%", alignItems: "flex-start" },
  garuda: { width: 60, height: 68, objectFit: "contain" },
  docNoText: { fontSize: 15 },
  schoolAddressText: { fontSize: 15, lineHeight: 1.2 },
  dateRow: { flexDirection: "row", justifyContent: "center", marginBottom: 10 },
  dateText: { fontSize: 15 },
  formBlock: { width: "100%" },
  subjectBlock: { marginBottom: 6 },
  subjectText: { fontSize: 15, marginBottom: 3 },
  textParagraph: { fontSize: 15, lineHeight: 1.25, textAlign: "justify", marginBottom: 8, textIndent: 32 },
  signBlockRow: { flexDirection: "row", justifyContent: "flex-end", paddingRight: 40, marginTop: 8, marginBottom: 10 },
  signBlock: { width: 240, alignItems: "center" },
  signText: { fontSize: 15, lineHeight: 1.25, textAlign: "center" },
  dividerBlock: { marginVertical: 10, alignItems: "center" },
  dividerLine: { width: "100%", borderBottomWidth: 0.75, borderBottomColor: "#000", borderStyle: "dashed" },
  receiptHeader: { fontSize: 14.5, fontWeight: "bold", marginBottom: 4 },
  receiptTextParagraph: { fontSize: 14.5, lineHeight: 1.2, textAlign: "justify", marginBottom: 8, textIndent: 32 },
  receiptSignBlockRow: { flexDirection: "row", justifyContent: "flex-end", marginRight: 10, marginTop: 6 },
  receiptSignBlock: { width: 240, alignItems: "center" },
  receiptSignText: { fontSize: 14.5, lineHeight: 1.25, textAlign: "center" },
});

// ─── Helpers ───────────────────────────────────────────────────────────────

const getCurrentMonth = () => new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Bangkok" }).slice(0, 7);

const formatDateDisplay = (dateStr: string) => {
  if (!dateStr) return "-";
  const [year, month, day] = dateStr.split("-");
  return `${day}/${month}/${year}`;
};

const formatMonthDisplay = (monthStr: string) => {
  if (!monthStr) return "-";
  const [year, month] = monthStr.split("-");
  return `${month}/${year}`;
};

const getMonthRange = (monthStr: string) => {
  const [year, month] = monthStr.split("-").map(Number);
  const lastDay = new Date(year, month, 0).getDate();
  return {
    startDate: `${year}-${String(month).padStart(2, "0")}-01`,
    endDate: `${year}-${String(month).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`,
  };
};

const getDatesBetween = (startDate: string, endDate: string) => {
  const dates: string[] = [];
  const current = new Date(`${startDate}T00:00:00`);
  const end = new Date(`${endDate}T00:00:00`);
  while (current <= end) {
    dates.push(current.toLocaleDateString("en-CA", { timeZone: "Asia/Bangkok" }));
    current.setDate(current.getDate() + 1);
  }
  return dates;
};

const isWorkingDate = (dateStr: string, events: Record<string, CalendarEvent>) => {
  const event = events[dateStr];
  const date = new Date(`${dateStr}T00:00:00`);
  const day = date.getDay();
  const isWeekend = day === 0 || day === 6;
  if (event?.type === "schoolDay") return true;
  if (event?.type === "holiday" || event?.type === "specialHoliday") return false;
  return !isWeekend;
};

const getDateValue = (value: any) => {
  if (!value) return "";
  if (value?.toDate) return value.toDate().toLocaleDateString("en-CA", { timeZone: "Asia/Bangkok" });
  if (typeof value === "string") return value.slice(0, 10);
  return "";
};

const isDateInRange = (dateStr: string, start: any, end: any) => {
  const startStr = getDateValue(start);
  const endStr = getDateValue(end);
  return Boolean(startStr && endStr && startStr <= dateStr && endStr >= dateStr);
};

const getClassLabel = (classLevel: string) => {
  const clean = String(classLevel || "").trim();
  return CLASSES[clean as keyof typeof CLASSES] || clean || "-";
};

const getStatusKind = (status: string | undefined) => {
  const normalized = String(status || "").trim().toLowerCase();
  if (["สาย", "late"].includes(normalized)) return "late";
  if (["ขาด", "absent"].includes(normalized)) return "absent";
  return "";
};

const getMaxConsecutive = (riskDates: string[]) => {
  if (riskDates.length === 0) return { count: 0, start: "", end: "" };
  const sorted = [...riskDates].sort();
  let bestCount = 1;
  let bestStart = sorted[0];
  let bestEnd = sorted[0];
  let currentCount = 1;
  let currentStart = sorted[0];
  for (let index = 1; index < sorted.length; index += 1) {
    const previous = new Date(`${sorted[index - 1]}T00:00:00`);
    const current = new Date(`${sorted[index]}T00:00:00`);
    const diffDays = Math.round((current.getTime() - previous.getTime()) / 86400000);
    if (diffDays === 1) {
      currentCount += 1;
    } else {
      currentCount = 1;
      currentStart = sorted[index];
    }
    if (currentCount > bestCount) {
      bestCount = currentCount;
      bestStart = currentStart;
      bestEnd = sorted[index];
    }
  }
  return { count: bestCount, start: bestStart, end: bestEnd };
};

const chunkRows = <T,>(rows: T[], size: number) => {
  const chunks: T[][] = [];
  for (let index = 0; index < rows.length; index += size) chunks.push(rows.slice(index, index + size));
  return chunks;
};

const getReportedStorageKey = (schoolId: string | null | undefined, month: string) =>
  `bk14_reported_${schoolId || "unknown"}_${month}`;

const getRowReportKey = (month: string, row: RiskRecord) => `${month}:${row.id}`;

const getThaiMonthName = (monthStr: string) => {
  const monthNames = ["มกราคม", "กุมภาพันธ์", "มีนาคม", "เมษายน", "พฤษภาคม", "มิถุนายน", "กรกฎาคม", "สิงหาคม", "กันยายน", "ตุลาคม", "พฤศจิกายน", "ธันวาคม"];
  const [, month] = monthStr.split("-").map(Number);
  return monthNames[(month || 1) - 1] || "";
};

const getThaiYearFromMonth = (monthStr: string) => {
  const [year] = monthStr.split("-").map(Number);
  return Number.isFinite(year) ? String(year + 543) : "........";
};

const normalizeSchoolName = (schoolName: string) => {
  if (!schoolName || schoolName === "-") return "โรงเรียน........................................";
  return schoolName.startsWith("โรงเรียน") ? schoolName : `โรงเรียน${schoolName}`;
};

const getDirectorDisplayName = (schoolInfo: SchoolInfo) => {
  const name = `${schoolInfo.directorPrefix || ""}${schoolInfo.directorName || ""}`.trim();
  return name || "........................................";
};

const getMiddleSchoolClassText = (classLevel: string, room: string) => {
  const level = String(classLevel || "").replace("มัธยมศึกษาปีที่", "").replace("ม.", "").trim();
  return `${level || "........"}/${room || "........"}`;
};

const getParentName = (student: any) => {
  if (student.parentFirstName)
    return `${student.parentTitle || ""}${student.parentFirstName} ${student.parentLastName || ""}`.trim();
  if (student.guardianFirstName)
    return `${student.guardianTitle || ""}${student.guardianFirstName} ${student.guardianLastName || ""}`.trim();
  if (student.parentName && student.parentName !== "-") return student.parentName.trim();
  if (student.guardianName && student.guardianName !== "-") return student.guardianName.trim();
  if (student.fatherFirstName)
    return `${student.fatherTitle || ""}${student.fatherFirstName} ${student.fatherLastName || ""}`.trim();
  if (student.motherFirstName)
    return `${student.motherTitle || ""}${student.motherFirstName} ${student.motherLastName || ""}`.trim();
  return "";
};

const getParentPhone = (student: any) =>
  student.parentPhone || student.guardianPhone || student.parentTelephone ||
  student.guardianTelephone || student.telephone || student.phone || "";

// ─── PDF Components ─────────────────────────────────────────────────────────

const Bk14PdfDocument: React.FC<{
  rows: RiskRecord[];
  schoolName: string;
  month: string;
  printedAt: string;
}> = ({ rows, schoolName, month, printedAt }) => {
  const chunks = chunkRows(rows, 20);
  return (
    <Document>
      {(chunks.length ? chunks : [[]]).map((pageRows, pageIndex) => (
        <Page key={pageIndex} size="A4" style={pdfStyles.page}>
          <Text style={pdfStyles.title}>รายงานข้อมูลประกอบ บค.14</Text>
          <Text style={pdfStyles.subtitle}>
            นักเรียนที่มาสายหรือขาดเรียนติดต่อกันตั้งแต่ 5 วัน หรือรวมเกิน 7 วัน ประจำเดือน {formatMonthDisplay(month)}
          </Text>
          <View style={pdfStyles.meta}>
            <Text>โรงเรียน: {schoolName}</Text>
            <Text>พิมพ์เมื่อ: {printedAt}</Text>
          </View>
          <View style={pdfStyles.table}>
            <View style={[pdfStyles.row, pdfStyles.th]}>
              <View style={[pdfStyles.cell, { width: "6%" }]}><Text style={pdfStyles.center}>ที่</Text></View>
              <View style={[pdfStyles.cell, { width: "13%" }]}><Text style={pdfStyles.center}>รหัส</Text></View>
              <View style={[pdfStyles.cell, { width: "24%" }]}><Text>ชื่อ-นามสกุล</Text></View>
              <View style={[pdfStyles.cell, { width: "10%" }]}><Text style={pdfStyles.center}>ชั้น</Text></View>
              <View style={[pdfStyles.cell, { width: "8%" }]}><Text style={pdfStyles.center}>สาย</Text></View>
              <View style={[pdfStyles.cell, { width: "8%" }]}><Text style={pdfStyles.center}>ขาด</Text></View>
              <View style={[pdfStyles.cell, { width: "10%" }]}><Text style={pdfStyles.center}>รวม</Text></View>
              <View style={[pdfStyles.cell, { width: "21%" }]}><Text>เข้าเกณฑ์</Text></View>
            </View>
            {pageRows.map((row, index) => (
              <View key={row.id} style={pdfStyles.row}>
                <View style={[pdfStyles.cell, { width: "6%" }]}><Text style={pdfStyles.center}>{pageIndex * 20 + index + 1}</Text></View>
                <View style={[pdfStyles.cell, { width: "13%" }]}><Text style={pdfStyles.center}>{row.studentId}</Text></View>
                <View style={[pdfStyles.cell, { width: "24%" }]}><Text>{row.fullName}</Text></View>
                <View style={[pdfStyles.cell, { width: "10%" }]}><Text style={pdfStyles.center}>{row.classLevel}/{row.room}</Text></View>
                <View style={[pdfStyles.cell, { width: "8%" }]}><Text style={pdfStyles.center}>{row.lateCount}</Text></View>
                <View style={[pdfStyles.cell, { width: "8%" }]}><Text style={pdfStyles.center}>{row.absentCount}</Text></View>
                <View style={[pdfStyles.cell, { width: "10%" }]}><Text style={pdfStyles.center}>{row.totalRiskDays}</Text></View>
                <View style={[pdfStyles.cell, { width: "21%" }]}><Text>{row.criteria}</Text></View>
              </View>
            ))}
          </View>
          <View style={pdfStyles.footer}>
            <Text style={pdfStyles.sign}>ลงชื่อ........................................ผู้จัดทำรายงาน</Text>
            <Text style={pdfStyles.sign}>ลงชื่อ........................................ผู้รับรองรายงาน</Text>
          </View>
          <Text style={pdfStyles.pageNumber}>หน้า {pageIndex + 1}/{Math.max(chunks.length, 1)}</Text>
        </Page>
      ))}
    </Document>
  );
};

const Bk14NoticePdfDocument: React.FC<{
  row: RiskRecord;
  schoolInfo: SchoolInfo;
  month: string;
}> = ({ row, schoolInfo, month }) => {
  const today = new Date();
  const currentDay = String(today.getDate());
  const currentThaiMonth = getThaiMonthName(`${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}`);
  const currentThaiYear = String(today.getFullYear() + 543);
  const thaiYear = getThaiYearFromMonth(month);
  const schoolName = normalizeSchoolName(schoolInfo.schoolName);
  const directorName = getDirectorDisplayName(schoolInfo);
  const classText = getMiddleSchoolClassText(row.classLevel, row.room);
  const addressLine1 = schoolInfo.addressLine1 || "ต........................ อ........................";
  const addressLine2 = [
    schoolInfo.addressLine2 || "จ........................",
    schoolInfo.postalCode || "............",
  ].filter(Boolean).join(" ");

  return (
    <Document>
      <Page size="A4" style={noticeStyles.page}>
        <View style={noticeStyles.topCodeBlock}>
          <Text style={noticeStyles.topCodeText}>แบบ บค.14</Text>
        </View>

        <View style={noticeStyles.titleBlock}>
          <Text style={noticeStyles.titleText}>หนังสือเตือนให้ผู้ปกครองส่งนักเรียนเข้าเรียน</Text>
        </View>

        <View style={noticeStyles.headerRow}>
          <View style={noticeStyles.headerLeft}>
            <Text style={noticeStyles.docNoText}>ที่ {schoolInfo.documentCode || "ศธ ................../"}</Text>
          </View>
          <View style={noticeStyles.headerCenter}>
            <Image src="/assets/images/garuda_official.jpg" style={noticeStyles.garuda} />
          </View>
          <View style={noticeStyles.headerRight}>
            <Text style={[noticeStyles.schoolAddressText, { fontWeight: "bold" }]}>{schoolName}</Text>
          </View>
        </View>

        <View style={noticeStyles.addressRemainingRow}>
          <View style={noticeStyles.addressRemainingBlock}>
            <Text style={noticeStyles.schoolAddressText}>{addressLine1}</Text>
            <Text style={noticeStyles.schoolAddressText}>{addressLine2}</Text>
          </View>
        </View>

        <View style={noticeStyles.dateRow}>
          <Text style={noticeStyles.dateText}>
            วันที่ {currentDay} เดือน {currentThaiMonth} พ.ศ. {currentThaiYear}
          </Text>
        </View>

        <View style={noticeStyles.formBlock}>
          <View style={noticeStyles.subjectBlock}>
            <Text style={noticeStyles.subjectText}>เรื่อง นักเรียนขาดเรียน ครั้งที่ ............</Text>
            <Text style={noticeStyles.subjectText}>
              เรียน ผู้ปกครอง(ด.ช./ด.ญ./นาย/นางสาว){" "}
              <Text style={{ fontWeight: "bold" }}>{row.parentName || "..........................................................................."}</Text>
            </Text>
          </View>

          <Text style={noticeStyles.textParagraph}>
            ด้วย(ด.ช./ด.ญ./นาย/นางสาว){" "}
            <Text style={{ fontWeight: "bold" }}>{row.fullName}</Text>{" "}นักเรียน ชั้น ม.{" "}
            <Text style={{ fontWeight: "bold" }}>{classText}</Text>{" "}ปีการศึกษา{" "}
            <Text style={{ fontWeight: "bold" }}>{thaiYear}</Text>{" "}เลขประจำตัว{" "}
            <Text style={{ fontWeight: "bold" }}>{row.studentId}</Text>
            {" "}ซึ่งอยู่ในความปกครองของท่านหยุดเรียนมาแล้วในเดือนนี้ รวม{" "}
            <Text style={{ fontWeight: "bold" }}>{row.absentCount}</Text>
            {" "}วัน (เกิน 5 วัน ติดต่อกัน และเกินกว่า 7 วัน ในรอบ 1 เดือน) โดยไม่ได้รับอนุญาตและไม่แจ้งเหตุให้โรงเรียนทราบ ซึ่งก่อให้เกิดผลเสียต่อการเรียนของนักเรียนเป็นอย่างยิ่ง โรงเรียนจึงขอเตือนให้ท่านส่งนักเรียนไปเข้าเรียนตามปกติโดยด่วน หากฝ่าฝืนโดยปราศจากเหตุผลอันสมควรจะมีความผิดตามมาตรา 15 แห่งพระราชบัญญัติการศึกษา ภาคบังคับ พ.ศ. 2545 ต้องระวางโทษปรับไม่เกิน 10,000 บาท (หนึ่งหมื่นบาทถ้วน)
          </Text>

          <Text style={noticeStyles.textParagraph}>
            จึงเรียนมาเพื่อทราบและดำเนินการต่อไป
          </Text>

          <View style={noticeStyles.signBlockRow}>
            <View style={noticeStyles.signBlock}>
              <Text style={noticeStyles.signText}>ขอแสดงความนับถือ</Text>
              <Text style={[noticeStyles.signText, { marginTop: 24, fontWeight: "bold" }]}>({directorName})</Text>
              <Text style={noticeStyles.signText}>ผู้อำนวยการ{schoolName}</Text>
            </View>
          </View>

          <View style={noticeStyles.dividerBlock}>
            <View style={noticeStyles.dividerLine} />
          </View>

          <Text style={noticeStyles.receiptHeader}>เรียน ผู้อำนวยการ{schoolName}</Text>

          <Text style={noticeStyles.receiptTextParagraph}>
            ข้าพเจ้า{" "}
            <Text style={{ fontWeight: "bold" }}>{row.parentName || "............................................................"}</Text>
            {" "}ผู้ปกครองของ{" "}
            <Text style={{ fontWeight: "bold" }}>{row.fullName}</Text>{" "}ชั้น ม.{" "}
            <Text style={{ fontWeight: "bold" }}>{classText}</Text>
            {" "}ได้รับทราบว่านักเรียนขาดเรียน ครั้งที่ ............ ซึ่งนักเรียนอาจไม่จบหลักสูตร ข้าพเจ้าขอตอบรับการนัดหมายการติดต่อครูที่ปรึกษา ภายในวันที่ ....... เดือน ............................ พ.ศ. ................. เวลา ................. น.
          </Text>

          <View style={noticeStyles.receiptSignBlockRow}>
            <View style={noticeStyles.receiptSignBlock}>
              <Text style={[noticeStyles.receiptSignText, { marginBottom: 4 }]}>
                ลงชื่อ ............................................................ผู้ปกครอง
              </Text>
              <Text style={[noticeStyles.receiptSignText, { marginBottom: 4 }]}>
                ( {row.parentName || "............................................................"} )
              </Text>
              <Text style={noticeStyles.receiptSignText}>
                หมายเลขโทรศัพท์ {row.parentPhone || "............................................................"}
              </Text>
            </View>
          </View>
        </View>
      </Page>
    </Document>
  );
};

// ─── Page ────────────────────────────────────────────────────────────────────

const StudentBK14ReportPage: React.FC = () => {
  const { user: currentUser } = useSelector((state: RootState) => state.auth);
  const schoolId = currentUser?.schoolId;

  const defaultSchoolInfo: SchoolInfo = {
    schoolName: "-",
    directorName: "",
    directorPrefix: "",
    documentCode: "ศธ ............/",
    addressLine1: "",
    addressLine2: "",
    postalCode: "",
  };

  const [selectedMonth, setSelectedMonth] = useState(getCurrentMonth());
  const [searchTerm, setSearchTerm] = useState("");
  const [loading, setLoading] = useState(false);
  const [schoolName, setSchoolName] = useState("-");
  const [schoolInfo, setSchoolInfo] = useState<SchoolInfo>(defaultSchoolInfo);
  const [rows, setRows] = useState<RiskRecord[]>([]);
  const [reportedKeys, setReportedKeys] = useState<Set<string>>(new Set());

  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(getReportedStorageKey(schoolId, selectedMonth)) || "[]");
      setReportedKeys(new Set(Array.isArray(saved) ? saved : []));
    } catch {
      setReportedKeys(new Set());
    }
  }, [schoolId, selectedMonth]);

  const filteredRows = useMemo(() => {
    const keyword = searchTerm.trim().toLowerCase();
    if (!keyword) return rows;
    return rows.filter((row) =>
      row.fullName.toLowerCase().includes(keyword) ||
      row.studentId.toLowerCase().includes(keyword) ||
      `${row.classLevel}/${row.room}`.toLowerCase().includes(keyword)
    );
  }, [rows, searchTerm]);

  const fetchReport = async () => {
    if (!schoolId) return;
    setLoading(true);
    try {
      const { startDate, endDate } = getMonthRange(selectedMonth);
      const [schoolSnap, calendarSnap, studentSnap] = await Promise.all([
        getDoc(doc(firestore, "school-settings", schoolId)),
        getDoc(doc(firestore, "school-settings", schoolId, "calendar", "events")),
        getDocs(collection(firestore, "school-settings", schoolId, "students")),
      ]);

      const schoolData = schoolSnap.exists() ? schoolSnap.data() : {};
      const currentSchoolName = schoolData.schoolName || schoolData.name || "-";
      setSchoolName(currentSchoolName);
      setSchoolInfo({
        schoolName: currentSchoolName,
        directorName: schoolData.directorName || "",
        directorPrefix: schoolData.directorPrefix || "",
        documentCode: schoolData.documentCode || schoolData.schoolDocumentCode || "ศธ ............/",
        addressLine1: [
          schoolData.subDistrict ? `ต.${schoolData.subDistrict}` : "",
          schoolData.district ? `อ.${schoolData.district}` : "",
        ].filter(Boolean).join(" "),
        addressLine2: schoolData.province ? `จ.${schoolData.province}` : "",
        postalCode: schoolData.postalCode || schoolData.zipCode || "",
      });

      const calendarEvents = calendarSnap.exists() ? (calendarSnap.data().events || {}) : {};
      const workingDates = getDatesBetween(startDate, endDate).filter((date) => isWorkingDate(date, calendarEvents));

      const students = studentSnap.docs
        .map((studentDoc) => ({ id: studentDoc.id, ...studentDoc.data() } as any))
        .filter((student) => isActiveStudentStatus(student.status || student.studentStatus || "กำลังศึกษาอยู่"));

      const result = await Promise.all(students.map(async (student) => {
        const studentRef = doc(firestore, "school-settings", schoolId, "students", student.id);
        const [attendanceSnap, leaveSnap, travelSnap] = await Promise.all([
          getDocs(query(collection(studentRef, "attendance"), where(documentId(), ">=", startDate), where(documentId(), "<=", endDate))),
          getDocs(collection(studentRef, "leave_summary")),
          getDocs(collection(studentRef, "travel_summary")),
        ]);

        const attendanceByDate = new Map<string, any>();
        attendanceSnap.docs.forEach((attendanceDoc) => {
          attendanceByDate.set(attendanceDoc.id, attendanceDoc.data());
        });

        let lateCount = 0;
        let absentCount = 0;
        const riskDates: string[] = [];

        workingDates.forEach((date) => {
          const leave = leaveSnap.docs.some((leaveDoc) => {
            const data = leaveDoc.data();
            return data.status !== "rejected" && isDateInRange(date, data.startDate, data.endDate);
          });
          const travel = travelSnap.docs.some((travelDoc) => {
            const data = travelDoc.data();
            return data.status !== "rejected" && isDateInRange(date, data.startDate, data.endDate);
          });
          if (leave || travel) return;

          const attendance = attendanceByDate.get(date);
          const statusKind = getStatusKind(attendance?.status);
          if (statusKind === "late") {
            lateCount += 1;
            riskDates.push(date);
          } else if (statusKind === "absent" || !attendance) {
            absentCount += 1;
            riskDates.push(date);
          }
        });

        const streak = getMaxConsecutive(riskDates);
        const totalRiskDays = lateCount + absentCount;
        const criteriaParts: string[] = [];
        if (streak.count >= 5) {
          criteriaParts.push(`ติดต่อกัน ${streak.count} วัน (${formatDateDisplay(streak.start)}-${formatDateDisplay(streak.end)})`);
        }
        if (totalRiskDays > 7) {
          criteriaParts.push(`รวม ${totalRiskDays} วันในเดือน`);
        }
        if (criteriaParts.length === 0) return null;

        return {
          id: student.id,
          studentId: student.studentId || "-",
          studentNumber: student.studentNumber || student.number || student.no || "-",
          fullName: `${student.title || ""}${student.firstName || ""} ${student.lastName || ""}`.trim() || student.name || "-",
          classLevel: getClassLabel(student.classLevel || student.level || ""),
          room: String(student.room || student.roomNumber || "-"),
          lateCount,
          absentCount,
          totalRiskDays,
          maxConsecutiveDays: streak.count,
          maxConsecutiveRange: streak.start ? `${formatDateDisplay(streak.start)}-${formatDateDisplay(streak.end)}` : "-",
          riskDates,
          criteria: criteriaParts.join(" / "),
          parentName: getParentName(student),
          parentPhone: getParentPhone(student),
        } as RiskRecord;
      }));

      const nextRows = result.filter(Boolean) as RiskRecord[];
      nextRows.sort((a, b) => {
        const classCompare = getClassLevelRank(a.classLevel) - getClassLevelRank(b.classLevel);
        if (classCompare !== 0) return classCompare;
        const roomCompare = (parseInt(a.room, 10) || 999) - (parseInt(b.room, 10) || 999);
        if (roomCompare !== 0) return roomCompare;
        return (parseInt(a.studentNumber, 10) || 999999) - (parseInt(b.studentNumber, 10) || 999999);
      });

      setRows(nextRows);
    } catch (error) {
      console.error("Error fetching BK14 report:", error);
      Swal.fire("เกิดข้อผิดพลาด", "ไม่สามารถดึงข้อมูลรายงาน บค.14 ได้", "error");
      setRows([]);
    } finally {
      setLoading(false);
    }
  };

  const exportPdf = async () => {
    if (filteredRows.length === 0) {
      Swal.fire("ไม่มีข้อมูล", "ไม่พบรายการสำหรับส่งออก PDF", "info");
      return;
    }
    const printedAt = new Date().toLocaleString("th-TH");
    const blob = await pdf(
      <Bk14PdfDocument rows={filteredRows} schoolName={schoolName} month={selectedMonth} printedAt={printedAt} />
    ).toBlob();
    saveAs(blob, `รายงาน_BK14_${selectedMonth}.pdf`);
  };

  const markRowReported = (row: RiskRecord) => {
    const reportKey = getRowReportKey(selectedMonth, row);
    setReportedKeys((prev) => {
      const next = new Set(prev);
      next.add(reportKey);
      localStorage.setItem(getReportedStorageKey(schoolId, selectedMonth), JSON.stringify(Array.from(next)));
      return next;
    });
  };

  const exportStudentPdf = async (row: RiskRecord) => {
    const blob = await pdf(
      <Bk14NoticePdfDocument row={row} schoolInfo={schoolInfo} month={selectedMonth} />
    ).toBlob();
    saveAs(blob, `บค14_${row.studentId}_${selectedMonth}.pdf`);
    markRowReported(row);
  };

  return (
    <MainLayout>
      <div className="min-h-screen bg-slate-50 px-4 py-6 text-slate-900 dark:bg-[#1e1f21] dark:text-white sm:px-6 lg:px-8">
        <div className="mx-auto max-w-7xl">
          <div className="mb-6 flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex items-start gap-4">
              <BackButton to="/academic/hub/students" />
              <div>
                <h1 className="text-2xl font-black text-slate-900 dark:text-white">
                  รายงานนักเรียนมาสาย/ขาดเรียน สำหรับ บค.14
                </h1>
                <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                  คัดกรองนักเรียนที่มาสายหรือขาดเรียนติดต่อกันตั้งแต่ 5 วัน หรือรวมเกิน 7 วันในรอบหนึ่งเดือน
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={exportPdf}
              disabled={loading || filteredRows.length === 0}
              className="inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-red-600 px-4 text-sm font-bold text-white shadow-sm transition hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <FileDown size={16} />
              ดาวน์โหลด PDF รวม
            </button>
          </div>

          <div className="mb-5 rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-200 dark:bg-[#2a2b2f] dark:ring-slate-700">
            <div className="grid grid-cols-1 gap-3 lg:grid-cols-[1fr_auto_1fr] lg:items-end">
              <label className="block">
                <span className="mb-1 block text-xs font-bold text-slate-700 dark:text-slate-300">เดือนที่ต้องการตรวจสอบ</span>
                <div className="relative">
                  <CalendarDays size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input
                    type="month"
                    value={selectedMonth}
                    onChange={(event) => setSelectedMonth(event.target.value)}
                    className="h-10 w-full rounded-lg border border-slate-300 bg-white pl-9 pr-3 text-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 dark:border-slate-700 dark:bg-[#1e1f21] dark:text-slate-200"
                  />
                </div>
              </label>

              <button
                type="button"
                onClick={fetchReport}
                disabled={loading}
                className="inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-sky-600 px-4 text-sm font-bold text-white shadow-sm transition hover:bg-sky-700 disabled:opacity-60"
              >
                <RefreshCw size={15} className={loading ? "animate-spin" : ""} />
                ค้นหารายงาน
              </button>

              <label className="relative block">
                <span className="mb-1 block text-xs font-bold text-slate-700 dark:text-slate-300">ค้นหาในรายงาน</span>
                <Search size={15} className="absolute left-3 bottom-3 text-slate-400" />
                <input
                  type="text"
                  value={searchTerm}
                  onChange={(event) => setSearchTerm(event.target.value)}
                  placeholder="ชื่อ/รหัส/ชั้น"
                  className="h-10 w-full rounded-lg border border-slate-300 bg-white pl-9 pr-3 text-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 dark:border-slate-700 dark:bg-[#1e1f21] dark:text-slate-200"
                />
              </label>
            </div>
          </div>

          <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div className="rounded-xl bg-white p-4 shadow-sm ring-1 ring-slate-200 dark:bg-[#2a2b2f] dark:ring-slate-700">
              <p className="text-xs font-bold text-slate-500 dark:text-slate-400">นักเรียนเข้าเกณฑ์</p>
              <p className="mt-1 text-3xl font-black text-rose-600 dark:text-rose-400">{filteredRows.length}</p>
            </div>
            <div className="rounded-xl bg-white p-4 shadow-sm ring-1 ring-slate-200 dark:bg-[#2a2b2f] dark:ring-slate-700">
              <p className="text-xs font-bold text-slate-500 dark:text-slate-400">เข้าเกณฑ์ติดต่อกัน 5 วันขึ้นไป</p>
              <p className="mt-1 text-3xl font-black text-amber-600 dark:text-amber-400">{filteredRows.filter((row) => row.maxConsecutiveDays >= 5).length}</p>
            </div>
            <div className="rounded-xl bg-white p-4 shadow-sm ring-1 ring-slate-200 dark:bg-[#2a2b2f] dark:ring-slate-700">
              <p className="text-xs font-bold text-slate-500 dark:text-slate-400">เข้าเกณฑ์รวมเกิน 7 วัน</p>
              <p className="mt-1 text-3xl font-black text-indigo-600 dark:text-indigo-400">{filteredRows.filter((row) => row.totalRiskDays > 7).length}</p>
            </div>
          </div>

          <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-700 dark:bg-[#2a2b2f]">
            <table className="w-full border-collapse text-left text-sm">
              <thead className="bg-slate-100 text-xs font-bold text-slate-700 dark:bg-[#323338] dark:text-slate-300">
                <tr>
                  <th className="border-b border-r border-slate-200 px-3 py-3 text-center dark:border-slate-700">#</th>
                  <th className="border-b border-r border-slate-200 px-3 py-3 dark:border-slate-700">รหัสนักเรียน</th>
                  <th className="border-b border-r border-slate-200 px-3 py-3 dark:border-slate-700">ชื่อ-นามสกุล</th>
                  <th className="border-b border-r border-slate-200 px-3 py-3 dark:border-slate-700">ชั้น/ห้อง</th>
                  <th className="border-b border-r border-slate-200 px-3 py-3 text-center dark:border-slate-700">สาย</th>
                  <th className="border-b border-r border-slate-200 px-3 py-3 text-center dark:border-slate-700">ขาด</th>
                  <th className="border-b border-r border-slate-200 px-3 py-3 text-center dark:border-slate-700">รวม</th>
                  <th className="border-b border-r border-slate-200 px-3 py-3 text-center dark:border-slate-700">ติดต่อกันสูงสุด</th>
                  <th className="border-b border-r border-slate-200 px-3 py-3 dark:border-slate-700">เกณฑ์ที่พบ</th>
                  <th className="border-b border-slate-200 px-3 py-3 text-center dark:border-slate-700">PDF รายคน</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 dark:divide-slate-700">
                {loading ? (
                  Array.from({ length: 8 }).map((_, index) => (
                    <tr key={index}>
                      <td colSpan={10} className="px-3 py-2">
                        <SkeletonLoader height="28px" />
                      </td>
                    </tr>
                  ))
                ) : filteredRows.length === 0 ? (
                  <tr>
                    <td colSpan={10} className="px-4 py-12 text-center text-sm text-slate-500 dark:text-slate-400">
                      ยังไม่มีข้อมูลรายงาน หรือไม่พบนักเรียนที่เข้าเกณฑ์ในเดือนที่เลือก
                    </td>
                  </tr>
                ) : (
                  filteredRows.map((row, index) => {
                    const isReported = reportedKeys.has(getRowReportKey(selectedMonth, row));
                    return (
                      <tr key={row.id} className="hover:bg-slate-50 dark:hover:bg-[#1e1f21]">
                        <td className="border-r border-slate-200 px-3 py-2 text-center font-bold dark:border-slate-700">{index + 1}</td>
                        <td className="border-r border-slate-200 px-3 py-2 whitespace-nowrap dark:border-slate-700">{row.studentId}</td>
                        <td className="border-r border-slate-200 px-3 py-2 font-semibold whitespace-nowrap dark:border-slate-700">{row.fullName}</td>
                        <td className="border-r border-slate-200 px-3 py-2 whitespace-nowrap dark:border-slate-700">{row.classLevel}/{row.room}</td>
                        <td className="border-r border-slate-200 px-3 py-2 text-center dark:border-slate-700">{row.lateCount}</td>
                        <td className="border-r border-slate-200 px-3 py-2 text-center dark:border-slate-700">{row.absentCount}</td>
                        <td className="border-r border-slate-200 px-3 py-2 text-center font-black text-rose-600 dark:border-slate-700 dark:text-rose-400">{row.totalRiskDays}</td>
                        <td className="border-r border-slate-200 px-3 py-2 text-center dark:border-slate-700">
                          {row.maxConsecutiveDays} วัน
                          <div className="text-[11px] text-slate-400">{row.maxConsecutiveRange}</div>
                        </td>
                        <td className="border-r border-slate-200 px-3 py-2 min-w-[220px] dark:border-slate-700">{row.criteria}</td>
                        <td className="px-3 py-2 text-center">
                          <div className="flex flex-col items-center gap-1">
                            {isReported && (
                              <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-bold text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300">
                                <CheckCircle size={12} />
                                พิมพ์แล้ว
                              </span>
                            )}
                            <button
                              type="button"
                              onClick={() => exportStudentPdf(row)}
                              className="inline-flex h-8 items-center justify-center gap-1 rounded-lg bg-red-600 px-3 text-xs font-bold text-white shadow-sm transition hover:bg-red-700"
                            >
                              <FileDown size={13} />
                              {isReported ? "พิมพ์ซ้ำ" : "PDF บค.14"}
                            </button>
                          </div>
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

export default StudentBK14ReportPage;
