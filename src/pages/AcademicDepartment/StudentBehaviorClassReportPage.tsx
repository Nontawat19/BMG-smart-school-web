import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useSelector } from "react-redux";
import { useParams } from "react-router-dom";
import { collection, doc, getDoc, getDocs, orderBy, query } from "firebase/firestore";
import {
  AlertTriangle,
  CheckCircle2,
  Eye,
  FileText,
  Loader2,
  Printer,
  RefreshCw,
  Search,
  ShieldAlert,
  Users,
} from "lucide-react";
import { Document, Font, Image, Page, StyleSheet, Text, View, pdf } from "@react-pdf/renderer";
import { saveAs } from "file-saver";
import Swal from "sweetalert2";
import BackButton from "@/components/Shared/BackButton";
import MainLayout from "@/layouts/MainLayout";
import { firestore } from "@/firebase";
import { RootState } from "@/store";
import { getCurrentThaiYear } from "@/utils/dateUtils";
import { isStudyingStudent } from "@/utils/studentStatusUtils";
import { CLASSES, getClassOptionsBySchoolSettings } from "@/utils/schoolUtils";
import { getRulePoints, getBehaviorAttendanceStatusKey, getBehaviorFlagCeremonyStatusKey } from "@/utils/behaviorScoreUtils";

Font.register({
  family: "TH Sarabun PSK",
  fonts: [
    { src: "/fonts/THSarabunNew.ttf" },
    { src: "/fonts/THSarabunNew-Bold.ttf", fontWeight: "bold" },
  ],
});

interface Student {
  id: string;
  studentId?: string;
  studentNumber?: string;
  title?: string;
  firstName?: string;
  lastName?: string;
  classLevel?: string;
  room?: string | number;
  behaviorScore?: number;
  studentStatus?: string;
  profileImageUrl?: string;
}

interface BehaviorLog {
  id: string;
  type?: string;
  title?: string;
  category?: string;
  action?: string;
  points?: number;
  previousScore?: number;
  nextScore?: number;
  notes?: string;
  ruleId?: string;
  ruleType?: "increase" | "decrease";
  behaviorStatus?: string;
  statusKey?: string;
  oldStatus?: string;
  newStatus?: string;
  createdAt?: any;
  academicYear?: string;
  createdBy?: string;
}

interface ReportRow {
  student: Student;
  logs: BehaviorLog[];
  plusScore: number;
  minusScore: number;
  currentScore: number;
}

interface BehaviorScoreRule {
  id: string;
  title: string;
  category: string;
  type: "increase" | "decrease";
  points: number;
  isActive?: boolean;
}

interface AttendanceScoreRule {
  statusKey: string;
  statusLabel: string;
  description?: string;
  points: number;
  isActive?: boolean;
}

interface FlagCeremonyScoreRule {
  statusKey: string;
  statusLabel: string;
  description?: string;
  points: number;
  isActive?: boolean;
}

type ClassroomAttendanceStatusKey = "present" | "late" | "absent" | "leave" | "escape";

interface ClassroomAttendanceScoreRule {
  statusKey: ClassroomAttendanceStatusKey;
  statusLabel?: string;
  description?: string;
  points: number;
  isActive?: boolean;
}

interface BehaviorScoreConfig {
  rules: BehaviorScoreRule[];
  attendanceRules: AttendanceScoreRule[];
  flagCeremonyRules: FlagCeremonyScoreRule[];
  classroomAttendanceRules: ClassroomAttendanceScoreRule[];
}

const DEFAULT_BEHAVIOR_RULES: BehaviorScoreRule[] = [
  { id: "late-class", title: "เข้าเรียนสาย", category: "การมาเรียน", type: "decrease", points: 5, isActive: true },
  { id: "skip-class", title: "ขาดเรียน/หนีเรียน", category: "การมาเรียน", type: "decrease", points: 10, isActive: true },
  { id: "volunteer", title: "ช่วยงานโรงเรียน/จิตอาสา", category: "ความดี", type: "increase", points: 10, isActive: true },
];

const DEFAULT_ATTENDANCE_RULES: AttendanceScoreRule[] = [
  { statusKey: "late", statusLabel: "สาย", description: "ลงเวลาเข้าหลังเวลาเข้าเรียน", points: 5, isActive: true },
  { statusKey: "absent", statusLabel: "ขาด", description: "ไม่ลงเวลาเข้าภายในเวลาที่กำหนด", points: 10, isActive: true },
  { statusKey: "early", statusLabel: "กลับก่อน", description: "ลงเวลาออกก่อนเวลาเลิกเรียน", points: 5, isActive: true },
  { statusKey: "noCheckout", statusLabel: "ไม่ลงเวลาออก", description: "ลงเวลาเข้าแล้วไม่มีเวลาออกเมื่อประมวลผลประจำวัน", points: 3, isActive: true },
];

const DEFAULT_FLAG_CEREMONY_RULES: FlagCeremonyScoreRule[] = [
  { statusKey: "noScanPresentDeduct", statusLabel: "ไม่สแกนแต่มาเข้าแถวและหักคะแนน", points: 5, isActive: true },
  { statusKey: "scannedAbsentDeduct", statusLabel: "สแกนแต่ไม่มาเข้าแถวหักคะแนน", points: 5, isActive: true },
];

const DEFAULT_CLASSROOM_ATTENDANCE_RULES: ClassroomAttendanceScoreRule[] = [
  { statusKey: "late", statusLabel: "เข้าเรียนสาย", points: 2, isActive: true },
  { statusKey: "absent", statusLabel: "ขาดเรียน", points: 5, isActive: true },
  { statusKey: "escape", statusLabel: "หนีเรียน", points: 10, isActive: true },
];

const DEFAULT_BEHAVIOR_CONFIG: BehaviorScoreConfig = {
  rules: DEFAULT_BEHAVIOR_RULES,
  attendanceRules: DEFAULT_ATTENDANCE_RULES,
  flagCeremonyRules: DEFAULT_FLAG_CEREMONY_RULES,
  classroomAttendanceRules: DEFAULT_CLASSROOM_ATTENDANCE_RULES,
};

const toInputDate = (date: Date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

const toDate = (value: any): Date | null => {
  if (!value) return null;
  const date = value?.toDate ? value.toDate() : value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
};

const normalizeRoom = (value: unknown) => String(value ?? "").trim();

const formatThaiDate = (value: any) => {
  const date = toDate(value);
  if (!date) return "-";
  return date.toLocaleDateString("th-TH", { day: "numeric", month: "short", year: "numeric" });
};

const getStudentName = (student: Student) => {
  return `${student.title || ""}${student.firstName || ""} ${student.lastName || ""}`.trim() || "-";
};

const getClassLabel = (student: Student) => {
  const level = String(student.classLevel || "").trim();
  const room = normalizeRoom(student.room);
  if (!level) return "-";
  return room ? `${level}/${room}` : level;
};

const getClassKey = (value: unknown) => {
  const raw = String(value || "").trim();
  if (!raw) return "";
  if ((CLASSES as Record<string, string>)[raw]) return raw;
  return Object.entries(CLASSES).find(([, label]) => label === raw)?.[0] || raw;
};

const joinThaiName = (...parts: Array<string | undefined>) => parts
  .map((part) => String(part || "").trim())
  .filter(Boolean)
  .join(" ")
  .trim();

const getScoreBadgeClass = (score: number) => {
  if (score >= 90) return "bg-emerald-50 text-emerald-700 ring-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-300 dark:ring-emerald-500/20";
  if (score >= 70) return "bg-sky-50 text-sky-700 ring-sky-200 dark:bg-sky-500/10 dark:text-sky-300 dark:ring-sky-500/20";
  if (score >= 50) return "bg-amber-50 text-amber-700 ring-amber-200 dark:bg-amber-500/10 dark:text-amber-300 dark:ring-amber-500/20";
  return "bg-rose-50 text-rose-700 ring-rose-200 dark:bg-rose-500/10 dark:text-rose-300 dark:ring-rose-500/20";
};

// Deduction rules shown/counted in this report come ONLY from what the school
// explicitly saved on /academic/behavior-score-config — no hardcoded fallback.
const normalizeBehaviorConfig = (rawConfig: any): BehaviorScoreConfig => ({
  rules: Array.isArray(rawConfig?.rules)
    ? rawConfig.rules
        .map((rule: Partial<BehaviorScoreRule>, index: number) => ({
          id: rule.id || `rule-${index + 1}`,
          title: String(rule.title || "").trim(),
          category: String(rule.category || "").trim() || "พฤติกรรมทั่วไป",
          type: rule.type === "increase" ? "increase" : "decrease",
          points: Math.max(1, Number(rule.points) || 1),
          isActive: rule.isActive !== false,
        }))
        .filter((rule: BehaviorScoreRule) => rule.title)
    : [],
  attendanceRules: Array.isArray(rawConfig?.attendanceRules)
    ? rawConfig.attendanceRules.map((rule: Partial<AttendanceScoreRule>) => ({
        statusKey: String(rule.statusKey || ""),
        statusLabel: String(rule.statusLabel || rule.statusKey || ""),
        description: String(rule.description || ""),
        points: Math.max(0, Number(rule.points) || 0),
        isActive: rule.isActive !== false,
      }))
    : [],
  flagCeremonyRules: Array.isArray(rawConfig?.flagCeremonyRules)
    ? rawConfig.flagCeremonyRules.map((rule: Partial<FlagCeremonyScoreRule>) => ({
        statusKey: String(rule.statusKey || ""),
        statusLabel: String(rule.statusLabel || rule.statusKey || ""),
        description: String(rule.description || ""),
        points: Math.max(0, Number(rule.points) || 0),
        isActive: rule.isActive !== false,
      }))
    : [],
  classroomAttendanceRules: Array.isArray(rawConfig?.classroomAttendanceRules)
    ? rawConfig.classroomAttendanceRules.map((rule: Partial<ClassroomAttendanceScoreRule>) => ({
        statusKey: String(rule.statusKey || ""),
        statusLabel: String(rule.statusLabel || rule.statusKey || ""),
        description: String(rule.description || ""),
        points: Math.max(0, Number(rule.points) || 0),
        isActive: rule.isActive !== false,
      }))
    : [],
});

const getLogStatusKey = (log: BehaviorLog) => {
  const raw = String(log.behaviorStatus || log.statusKey || log.newStatus || "").trim();
  if (!raw) return "";
  if (raw.startsWith("flag:")) return raw.replace("flag:", "");
  if (raw.startsWith("class:")) return raw.replace("class:", "");
  return raw;
};

const resolveBehaviorLogDisplay = (log: BehaviorLog, config: BehaviorScoreConfig) => {
  const points = Number(log.points || 0);
  const scoreType = points > 0 ? "increase" : "decrease";
  const absPoints = Math.abs(points);
  const statusKey = getLogStatusKey(log);
  const flagRule = statusKey
    ? config.flagCeremonyRules.find((rule) => rule.statusKey === statusKey)
    : null;
  const attendanceRule = statusKey
    ? config.attendanceRules.find((rule) => rule.statusKey === statusKey)
    : null;
  const classroomRule = statusKey
    ? config.classroomAttendanceRules.find((rule) => rule.statusKey === statusKey)
    : null;
  const manualRule = log.ruleId
    ? config.rules.find((rule) => rule.id === log.ruleId)
    : config.rules.find((rule) => (
        rule.type === scoreType
        && Number(rule.points) === absPoints
        && (!log.category || rule.category === log.category)
      ));

  if (manualRule) {
    return {
      category: manualRule.category,
      topic: manualRule.title,
    };
  }
  if (flagRule) {
    return {
      category: "การเข้าแถว",
      topic: flagRule.statusLabel || flagRule.description || "บันทึกการเข้าแถว",
    };
  }
  if (attendanceRule) {
    return {
      category: "การลงเวลา",
      topic: attendanceRule.statusLabel || attendanceRule.description || "บันทึกการมาเรียน",
    };
  }
  if (classroomRule) {
    return {
      category: "การเข้าเรียนรายวิชา",
      topic: classroomRule.statusLabel || classroomRule.description || "บันทึกการเข้าเรียนรายวิชา",
    };
  }

  return {
    category: log.category || (log.type === "activity_adjust" ? "ความประพฤติ" : "ระบบ"),
    topic: log.title || log.notes || "-",
  };
};

const behaviorPdfStyles = StyleSheet.create({
  page: {
    paddingTop: 36,
    paddingHorizontal: 42,
    paddingBottom: 48,
    fontFamily: "TH Sarabun PSK",
    color: "#111111",
    backgroundColor: "#ffffff",
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-end",
    borderBottomWidth: 0.8,
    borderBottomColor: "#555555",
    paddingBottom: 3,
    marginBottom: 10,
  },
  headerText: {
    fontSize: 11,
    fontWeight: "bold",
  },
  profileSection: {
    flexDirection: "row",
    alignItems: "flex-start",
    marginBottom: 14,
    minHeight: 94,
    position: "relative",
  },
  photoWrap: {
    width: 72,
    marginLeft: 16,
    marginRight: 44,
    position: "absolute",
    left: 0,
    top: 0,
  },
  studentPhoto: {
    width: 64,
    height: 86,
    objectFit: "cover",
  },
  emptyPhoto: {
    width: 64,
    height: 86,
    borderWidth: 1,
    borderColor: "#cbd5e1",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#f1f5f9",
  },
  emptyPhotoText: {
    fontSize: 9,
    color: "#64748b",
  },
  reportInfo: {
    width: "100%",
    alignItems: "center",
    paddingTop: 8,
    paddingHorizontal: 96,
  },
  reportTitle: {
    fontSize: 15,
    fontWeight: "bold",
    marginBottom: 1,
  },
  studentName: {
    fontSize: 12,
    fontWeight: "bold",
    marginBottom: 1,
  },
  metaLine: {
    fontSize: 12,
    fontWeight: "bold",
    lineHeight: 1.25,
  },
  table: {
    width: "100%",
    borderTopWidth: 0.9,
    borderLeftWidth: 0.9,
    borderColor: "#222222",
  },
  tableRow: {
    flexDirection: "row",
  },
  tableHeaderCell: {
    backgroundColor: "#d9d9d9",
    borderRightWidth: 0.9,
    borderBottomWidth: 0.9,
    borderColor: "#222222",
    minHeight: 18,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 4,
    paddingVertical: 2,
  },
  tableCell: {
    borderRightWidth: 0.9,
    borderBottomWidth: 0.9,
    borderColor: "#222222",
    minHeight: 18,
    justifyContent: "center",
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  headerCellText: {
    fontSize: 12,
    fontWeight: "bold",
    textAlign: "center",
  },
  cellText: {
    fontSize: 11,
    lineHeight: 1.15,
  },
  centerText: {
    textAlign: "center",
  },
  colIndex: { width: "10%" },
  colDate: { width: "18%" },
  colType: { width: "25%" },
  colTopic: { width: "33%" },
  colScore: { width: "14%" },
  noData: {
    width: "100%",
    borderRightWidth: 0.9,
    borderBottomWidth: 0.9,
    borderColor: "#222222",
    alignItems: "center",
    paddingVertical: 8,
  },
  signatureSection: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: 34,
    paddingHorizontal: 18,
  },
  signatureBox: {
    width: "42%",
    alignItems: "center",
  },
  signatureLine: {
    fontSize: 12,
    marginBottom: 8,
  },
  signatureNameLine: {
    fontSize: 12,
    marginBottom: 3,
  },
  signaturePosition: {
    fontSize: 12,
    fontWeight: "bold",
  },
  footer: {
    position: "absolute",
    left: 42,
    right: 42,
    bottom: 28,
    borderTopWidth: 0.6,
    borderTopColor: "#777777",
    paddingTop: 6,
    alignItems: "flex-end",
  },
  footerText: {
    fontSize: 10,
    fontWeight: "bold",
  },
});

interface BehaviorReportPdfDocumentProps {
  row: ReportRow;
  academicYear: string;
  startDate: string;
  endDate: string;
  schoolName: string;
  directorName: string;
  behaviorScoreConfig: BehaviorScoreConfig;
}

const BehaviorReportPdfDocument: React.FC<BehaviorReportPdfDocumentProps> = ({
  row,
  academicYear,
  startDate,
  endDate,
  schoolName,
  directorName,
  behaviorScoreConfig,
}) => {
  const studentName = getStudentName(row.student);
  const sortedLogs = [...row.logs].sort((a, b) => {
    const dateA = toDate(a.createdAt)?.getTime() || 0;
    const dateB = toDate(b.createdAt)?.getTime() || 0;
    return dateA - dateB;
  });
  const netScoreChange = row.plusScore + row.minusScore;
  const initialScore = sortedLogs[0]?.previousScore ?? (row.currentScore - netScoreChange);
  const currentScore = sortedLogs[sortedLogs.length - 1]?.nextScore ?? row.currentScore;
  const schoolDisplayName = schoolName?.startsWith("โรงเรียน") ? schoolName : `โรงเรียน${schoolName || "-"}`;
  const directorPosition = schoolName ? `ผู้อำนวยการ${schoolDisplayName}` : "ผู้อำนวยการโรงเรียน";

  return (
    <Document>
      <Page size="A4" orientation="portrait" style={behaviorPdfStyles.page}>
        <View style={behaviorPdfStyles.header}>
          <Text style={behaviorPdfStyles.headerText}>{schoolDisplayName}</Text>
          <Text style={behaviorPdfStyles.headerText}>รายงานความประพฤติ</Text>
        </View>

        <View style={behaviorPdfStyles.profileSection}>
          <View style={behaviorPdfStyles.photoWrap}>
            {row.student.profileImageUrl ? (
              <Image src={row.student.profileImageUrl} style={behaviorPdfStyles.studentPhoto} />
            ) : (
              <View style={behaviorPdfStyles.emptyPhoto}>
                <Text style={behaviorPdfStyles.emptyPhotoText}>ไม่มีรูป</Text>
              </View>
            )}
          </View>

          <View style={behaviorPdfStyles.reportInfo}>
            <Text style={behaviorPdfStyles.reportTitle}>รายงานความประพฤติ</Text>
            <Text style={behaviorPdfStyles.studentName}>{studentName}</Text>
            <Text style={behaviorPdfStyles.metaLine}>
              ปีการศึกษา {academicYear}     ระดับชั้น {getClassLabel(row.student)}
            </Text>
            <Text style={behaviorPdfStyles.metaLine}>
              คะแนนพฤติกรรมช่วงระหว่างวันที่ {formatThaiDate(`${startDate}T12:00:00`)} - {formatThaiDate(`${endDate}T12:00:00`)}
            </Text>
            <Text style={behaviorPdfStyles.metaLine}>
              ผลคะแนนเริ่มต้นคือ {Number(initialScore)} คะแนนปัจจุบันคือ {Number(currentScore)} คะแนน
            </Text>
          </View>
        </View>

        <View style={behaviorPdfStyles.table}>
          <View style={behaviorPdfStyles.tableRow} fixed>
            <View style={[behaviorPdfStyles.tableHeaderCell, behaviorPdfStyles.colIndex]}>
              <Text style={behaviorPdfStyles.headerCellText}>ลำดับที่</Text>
            </View>
            <View style={[behaviorPdfStyles.tableHeaderCell, behaviorPdfStyles.colDate]}>
              <Text style={behaviorPdfStyles.headerCellText}>วันที่</Text>
            </View>
            <View style={[behaviorPdfStyles.tableHeaderCell, behaviorPdfStyles.colType]}>
              <Text style={behaviorPdfStyles.headerCellText}>ประเภท</Text>
            </View>
            <View style={[behaviorPdfStyles.tableHeaderCell, behaviorPdfStyles.colTopic]}>
              <Text style={behaviorPdfStyles.headerCellText}>หัวข้อความผิด</Text>
            </View>
            <View style={[behaviorPdfStyles.tableHeaderCell, behaviorPdfStyles.colScore]}>
              <Text style={behaviorPdfStyles.headerCellText}>คะแนนที่หัก</Text>
            </View>
          </View>

          {sortedLogs.length === 0 ? (
            <View style={behaviorPdfStyles.noData}>
              <Text style={behaviorPdfStyles.cellText}>ไม่พบประวัติในช่วงวันที่นี้</Text>
            </View>
          ) : sortedLogs.map((log, index) => (
            <View key={log.id || `${index}`} style={behaviorPdfStyles.tableRow} wrap={false}>
              <View style={[behaviorPdfStyles.tableCell, behaviorPdfStyles.colIndex]}>
                <Text style={[behaviorPdfStyles.cellText, behaviorPdfStyles.centerText]}>{index + 1}</Text>
              </View>
              <View style={[behaviorPdfStyles.tableCell, behaviorPdfStyles.colDate]}>
                <Text style={[behaviorPdfStyles.cellText, behaviorPdfStyles.centerText]}>{formatThaiDate(log.createdAt)}</Text>
              </View>
              <View style={[behaviorPdfStyles.tableCell, behaviorPdfStyles.colType]}>
                <Text style={behaviorPdfStyles.cellText}>{resolveBehaviorLogDisplay(log, behaviorScoreConfig).category}</Text>
              </View>
              <View style={[behaviorPdfStyles.tableCell, behaviorPdfStyles.colTopic]}>
                <Text style={behaviorPdfStyles.cellText}>{resolveBehaviorLogDisplay(log, behaviorScoreConfig).topic}</Text>
              </View>
              <View style={[behaviorPdfStyles.tableCell, behaviorPdfStyles.colScore]}>
                <Text style={[behaviorPdfStyles.cellText, behaviorPdfStyles.centerText]}>
                  {Number(log.points || 0) > 0 ? "+" : ""}{Number(log.points || 0)}
                </Text>
              </View>
            </View>
          ))}
        </View>

        <View style={behaviorPdfStyles.signatureSection} wrap={false}>
          <View style={behaviorPdfStyles.signatureBox}>
            <Text style={behaviorPdfStyles.signatureLine}>ลงชื่อ..................................................</Text>
            <Text style={behaviorPdfStyles.signatureNameLine}>(..................................................)</Text>
            <Text style={behaviorPdfStyles.signaturePosition}>หัวหน้างานกิจการนักเรียน</Text>
          </View>
          <View style={behaviorPdfStyles.signatureBox}>
            <Text style={behaviorPdfStyles.signatureLine}>ลงชื่อ..................................................</Text>
            <Text style={behaviorPdfStyles.signatureNameLine}>({directorName || ".................................................."})</Text>
            <Text style={behaviorPdfStyles.signaturePosition}>{directorPosition}</Text>
          </View>
        </View>

        <View style={behaviorPdfStyles.footer} fixed>
          <Text
            style={behaviorPdfStyles.footerText}
            render={({ pageNumber }) => `หน้า ${pageNumber}`}
          />
        </View>
      </Page>
    </Document>
  );
};


const classReportPdfStyles = StyleSheet.create({
  page: { paddingTop: 34, paddingHorizontal: 44, paddingBottom: 26, fontFamily: "TH Sarabun PSK", fontSize: 12, color: "#000", backgroundColor: "#fff" },
  topBar: { flexDirection: "row", justifyContent: "space-between", borderBottomWidth: 0.8, borderBottomColor: "#5f5f5f", paddingBottom: 2, marginBottom: 8 },
  topText: { fontSize: 12.5, fontWeight: "bold" },
  logo: { position: "absolute", top: 68, left: 60, width: 45, height: 52, objectFit: "contain" },
  titleBlock: { alignItems: "center", marginTop: 26, marginBottom: 24, lineHeight: 1.2 },
  reportTitle: { fontSize: 19, fontWeight: "bold", marginBottom: 5 },
  reportSubtitle: { fontSize: 14.5, marginBottom: 2 },
  table: { borderTopWidth: 0.9, borderLeftWidth: 0.9, borderColor: "#111" },
  row: { flexDirection: "row", minHeight: 22 },
  headerRow: { minHeight: 28, backgroundColor: "#cfcfcf" },
  cell: { borderRightWidth: 0.75, borderBottomWidth: 0.75, borderColor: "#111", justifyContent: "center", paddingHorizontal: 4, paddingVertical: 2 },
  centerCell: { alignItems: "center", textAlign: "center" },
  leftCell: { alignItems: "flex-start", textAlign: "left", paddingLeft: 6 },
  headerText: { fontSize: 13, fontWeight: "bold" },
  bodyText: { fontSize: 12, lineHeight: 1.15 },
  boldText: { fontSize: 12, fontWeight: "bold" },
});

interface ClassBehaviorReportPdfDocumentProps {
  rows: ReportRow[];
  schoolName: string;
  logoUrl?: string;
  academicYear: string;
  classLabel: string;
  startDate: string;
  endDate: string;
}

const ClassBehaviorReportPdfDocument: React.FC<ClassBehaviorReportPdfDocumentProps> = ({
  rows, schoolName, logoUrl, academicYear, classLabel, startDate, endDate,
}) => {
  const pageContentWidth = 754;
  const colIndex = 40;
  const colId = 70;
  const colClass = 60;
  const colScore1 = 70;
  const colScore2 = 70;
  const colScore3 = 70;
  const colName = pageContentWidth - colIndex - colId - colClass - colScore1 - colScore2 - colScore3;

  return (
    <Document>
      <Page size="A4" orientation="landscape" style={classReportPdfStyles.page}>
        <View style={classReportPdfStyles.topBar} fixed>
          <Text style={classReportPdfStyles.topText}>{schoolName}</Text>
          <Text style={classReportPdfStyles.topText}>รายงานคะแนนความประพฤติรายชั้นเรียน</Text>
        </View>

        {logoUrl ? <Image src={logoUrl} style={classReportPdfStyles.logo} /> : null}

        <View style={classReportPdfStyles.titleBlock}>
          <Text style={classReportPdfStyles.reportTitle}>รายงานคะแนนความประพฤติ</Text>
          <Text style={classReportPdfStyles.reportSubtitle}>{schoolName}</Text>
          <Text style={classReportPdfStyles.reportSubtitle}>ปีการศึกษา {academicYear}     ระดับชั้น {classLabel || "ทั้งหมด"}</Text>
          <Text style={classReportPdfStyles.reportSubtitle}>ช่วงระหว่างวันที่ {formatThaiDate(`${startDate}T12:00:00`)} - {formatThaiDate(`${endDate}T12:00:00`)}</Text>
        </View>

        <View style={classReportPdfStyles.table}>
          <View style={[classReportPdfStyles.row, classReportPdfStyles.headerRow]} fixed>
            <View style={[classReportPdfStyles.cell, classReportPdfStyles.centerCell, { width: colIndex }]}><Text style={classReportPdfStyles.headerText}>ลำดับ</Text></View>
            <View style={[classReportPdfStyles.cell, classReportPdfStyles.centerCell, { width: colId }]}><Text style={classReportPdfStyles.headerText}>รหัสนักเรียน</Text></View>
            <View style={[classReportPdfStyles.cell, classReportPdfStyles.centerCell, { width: colName }]}><Text style={classReportPdfStyles.headerText}>ชื่อ-นามสกุล</Text></View>
            <View style={[classReportPdfStyles.cell, classReportPdfStyles.centerCell, { width: colClass }]}><Text style={classReportPdfStyles.headerText}>ชั้น</Text></View>
            <View style={[classReportPdfStyles.cell, classReportPdfStyles.centerCell, { width: colScore1 }]}><Text style={classReportPdfStyles.headerText}>คะแนนเพิ่ม(+)</Text></View>
            <View style={[classReportPdfStyles.cell, classReportPdfStyles.centerCell, { width: colScore2 }]}><Text style={classReportPdfStyles.headerText}>คะแนนหัก(-)</Text></View>
            <View style={[classReportPdfStyles.cell, classReportPdfStyles.centerCell, { width: colScore3 }]}><Text style={classReportPdfStyles.headerText}>คงเหลือ</Text></View>
          </View>

          {rows.length === 0 ? (
            <View style={[classReportPdfStyles.row, { minHeight: 28 }]}>
              <View style={[classReportPdfStyles.cell, classReportPdfStyles.centerCell, { width: pageContentWidth }]}>
                <Text style={classReportPdfStyles.bodyText}>ไม่พบข้อมูลตามเงื่อนไขที่เลือก</Text>
              </View>
            </View>
          ) : (
            rows.map((row, index) => (
              <View key={row.student.id || index} style={classReportPdfStyles.row} wrap={false}>
                <View style={[classReportPdfStyles.cell, classReportPdfStyles.centerCell, { width: colIndex }]}><Text style={classReportPdfStyles.bodyText}>{index + 1}</Text></View>
                <View style={[classReportPdfStyles.cell, classReportPdfStyles.centerCell, { width: colId }]}><Text style={classReportPdfStyles.bodyText}>{row.student.studentId || "-"}</Text></View>
                <View style={[classReportPdfStyles.cell, classReportPdfStyles.leftCell, { width: colName }]}><Text style={classReportPdfStyles.bodyText}>{getStudentName(row.student)}</Text></View>
                <View style={[classReportPdfStyles.cell, classReportPdfStyles.centerCell, { width: colClass }]}><Text style={classReportPdfStyles.bodyText}>{getClassLabel(row.student)}</Text></View>
                <View style={[classReportPdfStyles.cell, classReportPdfStyles.centerCell, { width: colScore1 }]}><Text style={classReportPdfStyles.bodyText}>+{row.plusScore}</Text></View>
                <View style={[classReportPdfStyles.cell, classReportPdfStyles.centerCell, { width: colScore2 }]}><Text style={classReportPdfStyles.bodyText}>{row.minusScore}</Text></View>
                <View style={[classReportPdfStyles.cell, classReportPdfStyles.centerCell, { width: colScore3 }]}><Text style={classReportPdfStyles.boldText}>{row.currentScore}</Text></View>
              </View>
            ))
          )}
        </View>
      </Page>
    </Document>
  );
};

const StudentBehaviorClassReportPage: React.FC = () => {
  const { schoolId: paramSchoolId } = useParams<{ schoolId: string }>();
  const currentUser = useSelector((state: RootState) => state.auth.user);
  const schoolSettings = useSelector((state: RootState) => state.schoolSettings);
  const schoolId = paramSchoolId || (currentUser as any)?.schoolId || schoolSettings.schoolId;

  const today = useMemo(() => new Date(), []);
  const defaultStartDate = useMemo(() => {
    const date = new Date(today);
    date.setDate(date.getDate() - 14);
    return toInputDate(date);
  }, [today]);

  const [schoolName, setSchoolName] = useState(schoolSettings.schoolName || "");
  const [students, setStudents] = useState<Student[]>([]);
  const [reportRows, setReportRows] = useState<ReportRow[]>([]);
  const [selectedClassLevel, setSelectedClassLevel] = useState("");
  const [selectedRoom, setSelectedRoom] = useState("");
  const [academicYear, setAcademicYear] = useState(String(getCurrentThaiYear()));
  const [startDate, setStartDate] = useState(defaultStartDate);
  const [endDate, setEndDate] = useState(toInputDate(today));
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedStudentIds, setSelectedStudentIds] = useState<string[]>([]);
  const [activeRow, setActiveRow] = useState<ReportRow | null>(null);
  const [behaviorScoreConfig, setBehaviorScoreConfig] = useState<BehaviorScoreConfig>(DEFAULT_BEHAVIOR_CONFIG);
  const [directorName, setDirectorName] = useState(joinThaiName(schoolSettings.directorPrefix, schoolSettings.directorName));
  const [availableClassOptions, setAvailableClassOptions] = useState<[string, string][]>([]);
  const [loadingStudents, setLoadingStudents] = useState(false);
  const [loadingReport, setLoadingReport] = useState(false);
  
  const [printingStudentId, setPrintingStudentId] = useState<string | null>(null);

  // PDF Export State
  const [isPdfModalOpen, setIsPdfModalOpen] = useState(false);
  const [pdfFilterMode, setPdfFilterMode] = useState<"all" | "score" | "rank">("all");
  const [pdfScoreOp, setPdfScoreOp] = useState<">=" | "<=" | "=" | ">" | "<">(">=");
  const [pdfScoreVal, setPdfScoreVal] = useState<number>(80);
  const [pdfRankMode, setPdfRankMode] = useState<"top" | "bottom">("top");
  const [pdfRankCount, setPdfRankCount] = useState<number>(10);
  const [isGeneratingClassPdf, setIsGeneratingClassPdf] = useState(false);


  useEffect(() => {
    const fetchStudents = async () => {
      if (!schoolId) return;
      setLoadingStudents(true);
      try {
        const schoolSnap = await getDoc(doc(firestore, "school-settings", schoolId));
        if (schoolSnap.exists()) {
          const schoolData = schoolSnap.data();
          setSchoolName(schoolData.schoolName || schoolSettings.schoolName || "");
          setDirectorName(
            joinThaiName(schoolData.directorPrefix, schoolData.directorName)
            || joinThaiName(schoolSettings.directorPrefix, schoolSettings.directorName)
          );
          setAvailableClassOptions(
            getClassOptionsBySchoolSettings(schoolData.opportunityExpansionLevel || "", schoolData.schoolType || "")
          );
          setBehaviorScoreConfig(normalizeBehaviorConfig(schoolData.behaviorScoreConfig));
        }

        const studentsSnap = await getDocs(collection(firestore, "school-settings", schoolId, "students"));
        const studentList = studentsSnap.docs
          .map((docSnap) => ({ id: docSnap.id, ...docSnap.data() } as Student))
          .filter(isStudyingStudent)
          .sort((a, b) => {
            const classCompare = getClassLabel(a).localeCompare(getClassLabel(b), "th", { numeric: true });
            if (classCompare !== 0) return classCompare;
            return String(a.studentNumber || a.studentId || "").localeCompare(String(b.studentNumber || b.studentId || ""), "th", { numeric: true });
          });

        setStudents(studentList);
      } catch (error) {
        console.error("Error loading students for behavior report:", error);
        Swal.fire("ดึงข้อมูลล้มเหลว", "ไม่สามารถโหลดข้อมูลนักเรียนได้", "error");
      } finally {
        setLoadingStudents(false);
      }
    };

    fetchStudents();
  }, [schoolId, schoolSettings.directorName, schoolSettings.directorPrefix, schoolSettings.schoolName]);

  const classLevelOptions = useMemo(() => {
    if (availableClassOptions.length > 0) return availableClassOptions;
    const studentClassKeys = Array.from(new Set(students.map((student) => getClassKey(student.classLevel)).filter(Boolean)));
    return Object.entries(CLASSES)
      .filter(([key]) => studentClassKeys.includes(key))
      .concat(studentClassKeys
        .filter((key) => !(CLASSES as Record<string, string>)[key])
        .map((key) => [key, key] as [string, string]));
  }, [availableClassOptions, students]);

  const roomOptions = useMemo(() => {
    return Array.from(new Set(
      students
        .filter((student) => !selectedClassLevel || getClassKey(student.classLevel) === selectedClassLevel)
        .map((student) => normalizeRoom(student.room))
        .filter(Boolean)
    )).sort((a, b) => a.localeCompare(b, "th", { numeric: true }));
  }, [selectedClassLevel, students]);

  useEffect(() => {
    if (!selectedClassLevel && classLevelOptions.length > 0) {
      setSelectedClassLevel(classLevelOptions[0][0]);
    }
  }, [classLevelOptions, selectedClassLevel]);

  useEffect(() => {
    if (selectedRoom && !roomOptions.includes(selectedRoom)) {
      setSelectedRoom("");
    }
  }, [roomOptions, selectedRoom]);

  const targetStudents = useMemo(() => {
    return students.filter((student) => {
      if (selectedClassLevel && getClassKey(student.classLevel) !== selectedClassLevel) return false;
      if (selectedRoom && normalizeRoom(student.room) !== selectedRoom) return false;
      return true;
    });
  }, [selectedClassLevel, selectedRoom, students]);

  const isLogInRange = useCallback((log: BehaviorLog) => {
    const date = toDate(log.createdAt);
    if (!date) return true; // Include logs with missing or invalid dates
    const iso = toInputDate(date);
    if (startDate && iso < startDate) return false;
    if (endDate && iso > endDate) return false;
    if (academicYear && log.academicYear && String(log.academicYear) !== academicYear) return false;
    return true;
  }, [academicYear, endDate, startDate]);

  const buildReport = useCallback(async () => {
    if (!schoolId) return;
    if (!selectedClassLevel) {
      Swal.fire("กรุณาเลือกชั้นเรียน", "เลือกชั้นเรียนก่อนค้นหารายงาน", "warning");
      return;
    }
    if (startDate > endDate) {
      Swal.fire("ช่วงวันที่ไม่ถูกต้อง", "วันที่เริ่มต้นต้องไม่มากกว่าวันที่สิ้นสุด", "warning");
      return;
    }

    setLoadingReport(true);
    setSelectedStudentIds([]);
    try {
      const rows = await Promise.all(targetStudents.map(async (student) => {
        // 1. Fetch Manual Logs
        const logsRef = collection(firestore, "school-settings", schoolId, "students", student.id, "behavior_logs");
        const logsSnap = await getDocs(logsRef);
        const manualLogs = logsSnap.docs.map((docSnap) => ({ id: docSnap.id, ...docSnap.data() } as BehaviorLog));

        // 2. Fetch Attendance Logs
        const attRef = collection(firestore, "school-settings", schoolId, "students", student.id, "attendance");
        const attSnap = await getDocs(attRef);
        const attendanceLogs: BehaviorLog[] = [];

        attSnap.docs.forEach((docSnap) => {
          const data = docSnap.data();
          const logDate = data.date ? new Date(`${data.date}T12:00:00`) : new Date();
          const academicYearStr = academicYear || String(getCurrentThaiYear());

          // Use the reconciled status when the flag-ceremony flow has already
          // voided this day's gate penalty (e.g. noScanPresentDeduct) so we
          // don't double-count it alongside the flag-ceremony deduction below.
          const effectiveAttendanceStatus = data.metadata?.attendanceBehaviorScoreStatus || data.status;
          if (effectiveAttendanceStatus) {
            const attPoints = getRulePoints(behaviorScoreConfig as any, effectiveAttendanceStatus);
            if (attPoints > 0) {
              const mappedStatus = getBehaviorAttendanceStatusKey(effectiveAttendanceStatus);
              attendanceLogs.push({
                id: `att_${docSnap.id}`,
                type: "attendance",
                title: "ระบบเช็คชื่อ",
                category: "การลงเวลา",
                points: -attPoints,
                behaviorStatus: effectiveAttendanceStatus,
                statusKey: mappedStatus || effectiveAttendanceStatus,
                createdAt: { toDate: () => logDate },
                academicYear: academicYearStr,
              });
            }
          }

          const metadata = data.metadata || {};
          const flagStatus = metadata.flagBehaviorScoreStatus || metadata.flag;
          
          if (flagStatus) {
            const flagPoints = getRulePoints(behaviorScoreConfig as any, flagStatus);
            if (flagPoints > 0) {
              const mappedFlagStatus = getBehaviorFlagCeremonyStatusKey(flagStatus);
              attendanceLogs.push({
                id: `flag_${docSnap.id}`,
                type: "flag_ceremony",
                title: "ระบบเข้าแถว",
                category: "การเข้าแถว",
                points: -flagPoints,
                behaviorStatus: flagStatus,
                statusKey: mappedFlagStatus || flagStatus,
                createdAt: { toDate: () => logDate },
                academicYear: academicYearStr,
              });
            }
          }
        });

        // 3. Merge, Filter, and Sort
        const logs = [...manualLogs, ...attendanceLogs]
          .filter(isLogInRange)
          .sort((a, b) => {
            const dateA = toDate(a.createdAt)?.getTime() || 0;
            const dateB = toDate(b.createdAt)?.getTime() || 0;
            return dateB - dateA; // desc
          });

        const plusScore = logs.reduce((sum, log) => sum + Math.max(0, Number(log.points || 0)), 0);
        const minusScore = logs.reduce((sum, log) => sum + Math.min(0, Number(log.points || 0)), 0);

        return {
          student,
          logs,
          plusScore,
          minusScore,
          currentScore: Number(student.behaviorScore ?? 100),
        };
      }));

      setReportRows(rows);
    } catch (error) {
      console.error("Error building behavior class report:", error);
      Swal.fire("ดึงรายงานล้มเหลว", "ไม่สามารถดึงประวัติคะแนนความประพฤติได้", "error");
    } finally {
      setLoadingReport(false);
    }
  }, [endDate, isLogInRange, schoolId, selectedClassLevel, startDate, targetStudents]);

  useEffect(() => {
    if (targetStudents.length > 0 && selectedClassLevel) {
      buildReport();
    }
  }, [buildReport, selectedClassLevel, selectedRoom]);

  const filteredRows = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();
    if (!term) return reportRows;
    return reportRows.filter(({ student }) => {
      const haystack = [
        student.studentId,
        student.studentNumber,
        getStudentName(student),
        getClassLabel(student),
      ].join(" ").toLowerCase();
      return haystack.includes(term);
    });
  }, [reportRows, searchTerm]);

  const summary = useMemo(() => {
    const totalPlus = filteredRows.reduce((sum, row) => sum + row.plusScore, 0);
    const totalMinus = filteredRows.reduce((sum, row) => sum + row.minusScore, 0);
    const average = filteredRows.length
      ? Math.round(filteredRows.reduce((sum, row) => sum + row.currentScore, 0) / filteredRows.length)
      : 0;
    const warningCount = filteredRows.filter((row) => row.currentScore < 70).length;
    return { totalPlus, totalMinus, average, warningCount };
  }, [filteredRows]);

  const allFilteredSelected = filteredRows.length > 0 && filteredRows.every((row) => selectedStudentIds.includes(row.student.id));

  const toggleAll = () => {
    if (allFilteredSelected) {
      setSelectedStudentIds((prev) => prev.filter((id) => !filteredRows.some((row) => row.student.id === id)));
    } else {
      setSelectedStudentIds((prev) => Array.from(new Set([...prev, ...filteredRows.map((row) => row.student.id)])));
    }
  };

  const toggleStudent = (studentId: string) => {
    setSelectedStudentIds((prev) => prev.includes(studentId) ? prev.filter((id) => id !== studentId) : [...prev, studentId]);
  };

  
  const handleGenerateClassPdf = async () => {
    let finalRows = [...filteredRows];

    // Filter by score
    if (pdfFilterMode === "score") {
      finalRows = finalRows.filter((r) => {
        if (pdfScoreOp === ">=") return r.currentScore >= pdfScoreVal;
        if (pdfScoreOp === "<=") return r.currentScore <= pdfScoreVal;
        if (pdfScoreOp === "=") return r.currentScore === pdfScoreVal;
        if (pdfScoreOp === ">") return r.currentScore > pdfScoreVal;
        if (pdfScoreOp === "<") return r.currentScore < pdfScoreVal;
        return true;
      });
    }

    // Filter by rank
    if (pdfFilterMode === "rank") {
      // sort
      finalRows.sort((a, b) => {
        if (pdfRankMode === "top") return b.currentScore - a.currentScore;
        return a.currentScore - b.currentScore;
      });
      finalRows = finalRows.slice(0, pdfRankCount);
    }

    if (finalRows.length === 0) {
      Swal.fire("ไม่พบข้อมูล", "ไม่มีนักเรียนที่ตรงตามเงื่อนไขที่กำหนด", "warning");
      return;
    }

    setIsGeneratingClassPdf(true);
    try {
      let classLabel = "ทุกชั้นเรียน";
      if (selectedClassLevel) {
        classLabel = selectedRoom ? `${selectedClassLevel}/${selectedRoom}` : selectedClassLevel;
      }

      const pdfBlob = await pdf(
        <ClassBehaviorReportPdfDocument
          rows={finalRows}
          schoolName={schoolName}
          logoUrl={schoolSettings.logoUrl}
          academicYear={academicYear}
          classLabel={classLabel}
          startDate={startDate}
          endDate={endDate}
        />
      ).toBlob();
      
      let conditionText = "ทั้งหมด";
      if (pdfFilterMode === "score") conditionText = `คะแนน${pdfScoreOp}${pdfScoreVal}`;
      if (pdfFilterMode === "rank") conditionText = `${pdfRankMode}${pdfRankCount}`;

      const safeName = `สรุปความประพฤติ_${classLabel}_${conditionText}_${startDate}_${endDate}`.replace(/[\\/:*?"<>|]/g, "");
      saveAs(pdfBlob, `${safeName}.pdf`);
      setIsPdfModalOpen(false);
    } catch (error) {
      console.error("Error generating class PDF:", error);
      Swal.fire("สร้าง PDF ไม่สำเร็จ", "ไม่สามารถสร้างรายงานรวมได้", "error");
    } finally {
      setIsGeneratingClassPdf(false);
    }
  };

  const printStudent = async (row: ReportRow) => {
    const studentName = getStudentName(row.student);
    setPrintingStudentId(row.student.id);
    try {
      const pdfBlob = await pdf(
        <BehaviorReportPdfDocument
          row={row}
          academicYear={academicYear}
          startDate={startDate}
          endDate={endDate}
          schoolName={schoolName}
          directorName={directorName}
          behaviorScoreConfig={behaviorScoreConfig}
        />
      ).toBlob();
      const fileSafeName = studentName.replace(/[\\/:*?"<>|]/g, "").replace(/\s+/g, "_") || row.student.studentId || "student";
      saveAs(pdfBlob, `รายงานความประพฤติ_${fileSafeName}_${startDate}_${endDate}.pdf`);
    } catch (error) {
      console.error("Error generating behavior PDF:", error);
      Swal.fire("สร้าง PDF ไม่สำเร็จ", "ไม่สามารถสร้างรายงานความประพฤติได้", "error");
    } finally {
      setPrintingStudentId(null);
    }
  };

  return (
    <MainLayout>
      <div className="min-h-screen bg-slate-50 px-3 py-5 text-slate-900 transition-colors dark:bg-[#1c1c24] dark:text-slate-100 sm:px-5 lg:px-8">
        <div className="mx-auto max-w-7xl">
          <div className="mb-5 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-3">
              <BackButton to="/academic/hub/students" />
              <div>
                <p className="text-xs font-semibold text-indigo-600 dark:text-indigo-400">Student behavior class report</p>
                <h1 className="text-2xl font-bold tracking-tight text-slate-950 dark:text-white">รายงานคะแนนความประพฤติ แบบเลือกห้องเรียน</h1>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={() => setIsPdfModalOpen(true)}
                disabled={loadingReport || loadingStudents || reportRows.length === 0}
                className="inline-flex items-center justify-center gap-2 rounded-lg bg-sky-600 px-4 py-2.5 text-sm font-bold text-white shadow-sm transition hover:bg-sky-700 disabled:cursor-not-allowed disabled:opacity-60"
              >
                <Printer size={16} />
                พิมพ์รายงาน
              </button>
              <button
              onClick={buildReport}
              disabled={loadingReport || loadingStudents}
              className="inline-flex items-center justify-center gap-2 rounded-lg bg-emerald-600 px-4 py-2.5 text-sm font-bold text-white shadow-sm transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-60"
            >
              
              {loadingReport ? <Loader2 className="animate-spin" size={16} /> : <RefreshCw size={16} />}
              รีเฟรชรายงาน
            </button>
            </div>
          </div>

          <section className="rounded-xl border border-slate-200 bg-white shadow-sm dark:border-white/10 dark:bg-[#2a2b2f]">
            <div className="border-b border-slate-200 px-5 py-4 dark:border-white/10">
              <div className="flex items-center gap-2 text-sm font-bold text-slate-700 dark:text-slate-200">
                <ShieldAlert size={18} className="text-indigo-500" />
                ตัวกรองรายงาน
              </div>
            </div>

            <div className="grid gap-4 p-5 md:grid-cols-2 xl:grid-cols-4">
              <div>
                <label className="mb-1.5 block text-xs font-bold text-slate-600 dark:text-slate-300">โรงเรียน</label>
                <input
                  value={schoolName || schoolId || "-"}
                  disabled
                  className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm text-slate-600 dark:border-white/10 dark:bg-white/5 dark:text-slate-300"
                />
              </div>
              <div>
                <label className="mb-1.5 block text-xs font-bold text-slate-600 dark:text-slate-300">ปีการศึกษา</label>
                <input
                  value={academicYear}
                  onChange={(event) => setAcademicYear(event.target.value)}
                  className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm outline-none transition focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 dark:border-white/10 dark:bg-[#1f2024] dark:focus:ring-indigo-500/20"
                />
              </div>
              <div>
                <label className="mb-1.5 block text-xs font-bold text-slate-600 dark:text-slate-300">ชั้นเรียน</label>
                <div className="relative">
                  <Users className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                  <select
                    value={selectedClassLevel}
                    onChange={(event) => setSelectedClassLevel(event.target.value)}
                    className="block w-full appearance-none rounded-xl border border-slate-300 bg-slate-50 py-2.5 pl-9 pr-10 text-sm font-semibold text-slate-900 outline-none transition hover:bg-slate-100 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 dark:border-white/10 dark:bg-[#1f2024] dark:text-white dark:hover:bg-white/10 dark:focus:ring-indigo-500/20"
                  >
                    <option value="">-- กรุณาเลือกชั้นเรียน --</option>
                    {classLevelOptions.map(([key, name]) => <option key={key} value={key}>{name}</option>)}
                  </select>
                  <Search className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                </div>
              </div>
              <div>
                <label className="mb-1.5 block text-xs font-bold text-slate-600 dark:text-slate-300">ห้องเรียน</label>
                <select
                  value={selectedRoom}
                  onChange={(event) => setSelectedRoom(event.target.value)}
                  className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm outline-none transition focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 dark:border-white/10 dark:bg-[#1f2024] dark:focus:ring-indigo-500/20"
                >
                  <option value="">ทุกห้อง</option>
                  {roomOptions.map((room) => <option key={room} value={room}>{room}</option>)}
                </select>
              </div>
              <div>
                <label className="mb-1.5 block text-xs font-bold text-slate-600 dark:text-slate-300">วันที่เริ่มต้น</label>
                <input
                  type="date"
                  value={startDate}
                  onChange={(event) => setStartDate(event.target.value)}
                  className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm outline-none transition focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 dark:border-white/10 dark:bg-[#1f2024] dark:focus:ring-indigo-500/20"
                />
              </div>
              <div>
                <label className="mb-1.5 block text-xs font-bold text-slate-600 dark:text-slate-300">วันที่สิ้นสุด</label>
                <input
                  type="date"
                  value={endDate}
                  onChange={(event) => setEndDate(event.target.value)}
                  className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm outline-none transition focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 dark:border-white/10 dark:bg-[#1f2024] dark:focus:ring-indigo-500/20"
                />
              </div>
              <div className="md:col-span-2">
                <label className="mb-1.5 block text-xs font-bold text-slate-600 dark:text-slate-300">ค้นหารายการ</label>
                <div className="relative">
                  <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
                  <input
                    value={searchTerm}
                    onChange={(event) => setSearchTerm(event.target.value)}
                    placeholder="ค้นหาชื่อ รหัสนักเรียน หรือชั้นเรียน..."
                    className="w-full rounded-lg border border-slate-300 bg-white py-2.5 pl-9 pr-3 text-sm outline-none transition focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 dark:border-white/10 dark:bg-[#1f2024] dark:focus:ring-indigo-500/20"
                  />
                </div>
              </div>
            </div>
          </section>

          <section className="my-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-white/10 dark:bg-[#2a2b2f]">
              <p className="text-xs font-bold text-slate-500 dark:text-slate-400">นักเรียนในรายงาน</p>
              <p className="mt-2 text-2xl font-black">{filteredRows.length}</p>
            </div>
            <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 shadow-sm dark:border-emerald-500/20 dark:bg-emerald-500/10">
              <p className="text-xs font-bold text-emerald-700 dark:text-emerald-300">คะแนนเพิ่มรวม</p>
              <p className="mt-2 text-2xl font-black text-emerald-700 dark:text-emerald-300">+{summary.totalPlus}</p>
            </div>
            <div className="rounded-xl border border-rose-200 bg-rose-50 p-4 shadow-sm dark:border-rose-500/20 dark:bg-rose-500/10">
              <p className="text-xs font-bold text-rose-700 dark:text-rose-300">คะแนนหักรวม</p>
              <p className="mt-2 text-2xl font-black text-rose-700 dark:text-rose-300">{summary.totalMinus}</p>
            </div>
            <div className="rounded-xl border border-sky-200 bg-sky-50 p-4 shadow-sm dark:border-sky-500/20 dark:bg-sky-500/10">
              <p className="text-xs font-bold text-sky-700 dark:text-sky-300">คะแนนเฉลี่ยคงเหลือ</p>
              <p className="mt-2 text-2xl font-black text-sky-700 dark:text-sky-300">{summary.average}</p>
            </div>
          </section>

          <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm dark:border-white/10 dark:bg-[#2a2b2f]">
            <div className="flex flex-col gap-2 border-b border-slate-200 px-5 py-4 dark:border-white/10 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h2 className="font-bold text-slate-950 dark:text-white">รายการคะแนนความประพฤติรายห้อง</h2>
                <p className="text-xs text-slate-500 dark:text-slate-400">เลือกนักเรียนเพื่อเตรียมพิมพ์หรือเปิดรายละเอียดรายคน</p>
              </div>
              <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
                <CheckCircle2 size={14} className="text-emerald-500" />
                เลือกแล้ว {selectedStudentIds.length} คน
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="min-w-[1040px] w-full border-collapse text-sm">
                <thead className="bg-slate-100 text-xs font-bold uppercase tracking-wide text-slate-600 dark:bg-white/5 dark:text-slate-300">
                  <tr>
                    <th className="w-10 border-b border-r border-slate-200 p-3 text-left dark:border-white/10">
                      <input type="checkbox" checked={allFilteredSelected} onChange={toggleAll} />
                    </th>
                    <th className="w-12 border-b border-r border-slate-200 p-3 text-left dark:border-white/10">#</th>
                    <th className="w-28 border-b border-r border-slate-200 p-3 text-left dark:border-white/10">รหัสนักเรียน</th>
                    <th className="border-b border-r border-slate-200 p-3 text-left dark:border-white/10">ชื่อ-นามสกุล</th>
                    <th className="w-36 border-b border-r border-slate-200 p-3 text-left dark:border-white/10">ชั้น</th>
                    <th className="w-28 border-b border-r border-slate-200 p-3 text-left dark:border-white/10">คะแนนเพิ่มบวก</th>
                    <th className="w-28 border-b border-r border-slate-200 p-3 text-left dark:border-white/10">คะแนนหักรวม</th>
                    <th className="w-28 border-b border-r border-slate-200 p-3 text-left dark:border-white/10">คะแนนคงเหลือ</th>
                    <th className="w-56 border-b border-slate-200 p-3 text-left dark:border-white/10">Config</th>
                  </tr>
                </thead>
                <tbody>
                  {(loadingReport || loadingStudents) ? (
                    <tr>
                      <td colSpan={9} className="p-10 text-center text-slate-500 dark:text-slate-400">
                        <Loader2 className="mx-auto mb-3 animate-spin text-indigo-500" size={28} />
                        กำลังโหลดรายงาน...
                      </td>
                    </tr>
                  ) : filteredRows.length === 0 ? (
                    <tr>
                      <td colSpan={9} className="p-10 text-center text-slate-500 dark:text-slate-400">
                        <AlertTriangle className="mx-auto mb-3 text-amber-500" size={28} />
                        ไม่พบข้อมูลตามเงื่อนไขที่เลือก
                      </td>
                    </tr>
                  ) : (
                    filteredRows.map((row, index) => (
                      <tr key={row.student.id} className="border-b border-slate-100 transition hover:bg-indigo-50/50 dark:border-white/5 dark:hover:bg-white/5">
                        <td className="border-r border-slate-100 p-3 dark:border-white/5">
                          <input
                            type="checkbox"
                            checked={selectedStudentIds.includes(row.student.id)}
                            onChange={() => toggleStudent(row.student.id)}
                          />
                        </td>
                        <td className="border-r border-slate-100 p-3 font-semibold dark:border-white/5">{index + 1}</td>
                        <td className="border-r border-slate-100 p-3 font-mono text-xs font-semibold text-indigo-700 dark:border-white/5 dark:text-indigo-300">{row.student.studentId || "-"}</td>
                        <td className="border-r border-slate-100 p-3 font-semibold dark:border-white/5">{getStudentName(row.student)}</td>
                        <td className="border-r border-slate-100 p-3 dark:border-white/5">{getClassLabel(row.student)}</td>
                        <td className="border-r border-slate-100 p-3 text-emerald-600 dark:border-white/5 dark:text-emerald-300">{row.plusScore}</td>
                        <td className="border-r border-slate-100 p-3 text-rose-600 dark:border-white/5 dark:text-rose-300">{row.minusScore}</td>
                        <td className="border-r border-slate-100 p-3 dark:border-white/5">
                          <span className={`inline-flex min-w-14 justify-center rounded-full px-2.5 py-1 text-xs font-black ring-1 ${getScoreBadgeClass(row.currentScore)}`}>
                            {row.currentScore}
                          </span>
                        </td>
                        <td className="p-3">
                          <div className="flex flex-wrap gap-2">
                            <button
                              onClick={() => setActiveRow(row)}
                              className="inline-flex items-center gap-1 rounded-md bg-indigo-50 px-2.5 py-1.5 text-xs font-bold text-indigo-700 transition hover:bg-indigo-100 dark:bg-indigo-500/10 dark:text-indigo-300"
                            >
                              <Eye size={13} /> รายละเอียด
                            </button>
                            <button
                              onClick={() => printStudent(row)}
                              disabled={printingStudentId === row.student.id}
                              className="inline-flex items-center gap-1 rounded-md bg-slate-100 px-2.5 py-1.5 text-xs font-bold text-slate-700 transition hover:bg-slate-200 dark:bg-white/10 dark:text-slate-200"
                            >
                              {printingStudentId === row.student.id ? <Loader2 className="animate-spin" size={13} /> : <Printer size={13} />}
                              print รายคน
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </section>
        </div>
      </div>

      {activeRow && (
        <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/55 px-3 py-5 sm:px-6">
          <div className="mt-0 max-h-[90vh] w-full max-w-5xl overflow-hidden rounded bg-white shadow-2xl dark:bg-white">
            <div className="flex items-center justify-between border-b border-slate-200 px-7 py-5">
              <h3 className="text-xl font-bold text-slate-800">
                ข้อมูลของ {getStudentName(activeRow.student)}
              </h3>
              <button
                onClick={() => setActiveRow(null)}
                className="rounded px-2 py-1 text-3xl font-normal leading-none text-slate-500 transition hover:bg-slate-100 hover:text-slate-800"
                aria-label="ปิดหน้าต่างรายละเอียด"
              >
                ×
              </button>
            </div>

            <div className="border-b border-slate-200 px-7 py-6">
              <div className="mb-4 flex justify-end">
                <button
                  onClick={() => printStudent(activeRow)}
                  disabled={printingStudentId === activeRow.student.id}
                  className="inline-flex items-center gap-1.5 rounded bg-emerald-600 px-4 py-2 text-sm font-bold text-white transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {printingStudentId === activeRow.student.id ? <Loader2 className="animate-spin" size={13} /> : <Printer size={13} />}
                  Print
                </button>
              </div>

              {activeRow.logs.length === 0 ? (
                <div className="rounded border border-dashed border-slate-300 p-10 text-center text-base text-slate-500">
                  <FileText className="mx-auto mb-2" size={24} />
                  ไม่พบประวัติในช่วงวันที่ที่เลือก
                </div>
              ) : (
                <div className="max-h-[52vh] overflow-auto">
                  <table className="w-full min-w-[900px] border-collapse text-base text-slate-800">
                    <thead className="bg-slate-100 text-slate-700">
                      <tr>
                        <th className="w-16 border border-slate-200 px-5 py-5 text-left font-bold">#</th>
                        <th className="w-52 border border-slate-200 px-5 py-5 text-left font-bold">วันที่</th>
                        <th className="w-72 border border-slate-200 px-5 py-5 text-left font-bold">ประเภทความผิด</th>
                        <th className="border border-slate-200 px-5 py-5 text-left font-bold">หัวข้อ</th>
                        <th className="w-32 border border-slate-200 px-5 py-5 text-left font-bold">คะแนน</th>
                      </tr>
                    </thead>
                    <tbody>
                      {[...activeRow.logs].sort((a, b) => {
                        const dateA = toDate(a.createdAt)?.getTime() || 0;
                        const dateB = toDate(b.createdAt)?.getTime() || 0;
                        return dateA - dateB;
                      }).map((log, index) => (
                        <tr key={log.id} className="hover:bg-slate-50">
                          <td className="border border-slate-200 px-5 py-4 font-semibold">{index + 1}</td>
                          <td className="border border-slate-200 px-5 py-4">{formatThaiDate(log.createdAt)}</td>
                          <td className="border border-slate-200 px-5 py-4 font-semibold">{resolveBehaviorLogDisplay(log, behaviorScoreConfig).category}</td>
                          <td className="border border-slate-200 px-5 py-4 font-semibold">{resolveBehaviorLogDisplay(log, behaviorScoreConfig).topic}</td>
                          <td className="border border-slate-200 px-5 py-4">
                            {Number(log.points || 0) > 0 ? "+" : ""}{Number(log.points || 0)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            <div className="flex justify-end bg-white px-7 py-6">
              <button
                onClick={() => setActiveRow(null)}
                className="rounded-md bg-blue-500 px-6 py-3 text-base font-bold text-white transition hover:bg-blue-600"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* PDF Export Modal */}
      {isPdfModalOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 px-4 py-6 backdrop-blur-sm transition-opacity">
          <div className="w-full max-w-md overflow-hidden rounded-2xl bg-white shadow-2xl dark:bg-[#1f2024] dark:ring-1 dark:ring-white/10">
            <div className="flex items-center justify-between border-b border-slate-200 bg-slate-50 px-6 py-4 dark:border-white/10 dark:bg-white/5">
              <h2 className="flex items-center gap-2 text-lg font-bold text-slate-800 dark:text-white">
                <Printer size={18} className="text-sky-500" />
                ตั้งค่าการพิมพ์รายงาน
              </h2>
              <button
                onClick={() => setIsPdfModalOpen(false)}
                className="rounded-lg p-1 text-slate-400 hover:bg-slate-200 hover:text-slate-600 dark:hover:bg-white/10 dark:hover:text-white"
              >
                <span className="sr-only">Close</span>
                <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"></path></svg>
              </button>
            </div>
            
            <div className="p-6">
              <div className="mb-5 space-y-3">
                <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-slate-200 p-3 hover:bg-slate-50 dark:border-white/10 dark:hover:bg-white/5">
                  <input
                    type="radio"
                    name="pdfMode"
                    className="mt-0.5 h-4 w-4 text-sky-600 focus:ring-sky-500"
                    checked={pdfFilterMode === "all"}
                    onChange={() => setPdfFilterMode("all")}
                  />
                  <div>
                    <div className="font-bold text-slate-800 dark:text-white">พิมพ์ข้อมูลทั้งหมด</div>
                    <div className="text-xs text-slate-500 dark:text-slate-400">พิมพ์รายชื่อนักเรียนทั้งหมดตามที่ค้นหาหรือตามห้องที่เลือก</div>
                  </div>
                </label>

                <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-slate-200 p-3 hover:bg-slate-50 dark:border-white/10 dark:hover:bg-white/5">
                  <input
                    type="radio"
                    name="pdfMode"
                    className="mt-0.5 h-4 w-4 text-sky-600 focus:ring-sky-500"
                    checked={pdfFilterMode === "score"}
                    onChange={() => setPdfFilterMode("score")}
                  />
                  <div className="flex-1">
                    <div className="font-bold text-slate-800 dark:text-white">กำหนดช่วงคะแนน</div>
                    <div className="text-xs text-slate-500 dark:text-slate-400">กรองเฉพาะนักเรียนที่มีคะแนนตรงกับเงื่อนไข</div>
                    
                    {pdfFilterMode === "score" && (
                      <div className="mt-3 flex items-center gap-2">
                        <select
                          value={pdfScoreOp}
                          onChange={(e) => setPdfScoreOp(e.target.value as any)}
                          className="rounded-md border border-slate-300 bg-white px-2 py-1.5 text-sm dark:border-white/10 dark:bg-black/20 dark:text-white"
                        >
                          <option value=">=">มากกว่าหรือเท่ากับ</option>
                          <option value="<=">น้อยกว่าหรือเท่ากับ</option>
                          <option value=">">มากกว่า</option>
                          <option value="<">น้อยกว่า</option>
                          <option value="=">เท่ากับ</option>
                        </select>
                        <input
                          type="number"
                          value={pdfScoreVal}
                          onChange={(e) => setPdfScoreVal(Number(e.target.value))}
                          className="w-20 rounded-md border border-slate-300 bg-white px-2 py-1.5 text-sm dark:border-white/10 dark:bg-black/20 dark:text-white"
                        />
                      </div>
                    )}
                  </div>
                </label>

                <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-slate-200 p-3 hover:bg-slate-50 dark:border-white/10 dark:hover:bg-white/5">
                  <input
                    type="radio"
                    name="pdfMode"
                    className="mt-0.5 h-4 w-4 text-sky-600 focus:ring-sky-500"
                    checked={pdfFilterMode === "rank"}
                    onChange={() => setPdfFilterMode("rank")}
                  />
                  <div className="flex-1">
                    <div className="font-bold text-slate-800 dark:text-white">จัดอันดับคะแนน</div>
                    <div className="text-xs text-slate-500 dark:text-slate-400">เลือกพิมพ์เฉพาะนักเรียนที่มีคะแนนสูงสุดหรือต่ำสุด</div>
                    
                    {pdfFilterMode === "rank" && (
                      <div className="mt-3 flex items-center gap-2">
                        <select
                          value={pdfRankMode}
                          onChange={(e) => setPdfRankMode(e.target.value as any)}
                          className="rounded-md border border-slate-300 bg-white px-2 py-1.5 text-sm dark:border-white/10 dark:bg-black/20 dark:text-white"
                        >
                          <option value="top">คะแนนมากที่สุด</option>
                          <option value="bottom">คะแนนน้อยที่สุด</option>
                        </select>
                        <input
                          type="number"
                          value={pdfRankCount}
                          onChange={(e) => setPdfRankCount(Number(e.target.value))}
                          className="w-16 rounded-md border border-slate-300 bg-white px-2 py-1.5 text-sm dark:border-white/10 dark:bg-black/20 dark:text-white"
                        />
                        <span className="text-sm text-slate-600 dark:text-slate-300">อันดับ</span>
                      </div>
                    )}
                  </div>
                </label>
              </div>
            </div>

            <div className="flex items-center justify-end gap-3 border-t border-slate-200 bg-slate-50 px-6 py-4 dark:border-white/10 dark:bg-white/5">
              <button
                onClick={() => setIsPdfModalOpen(false)}
                className="rounded-lg px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-200 dark:text-slate-300 dark:hover:bg-white/10"
              >
                ยกเลิก
              </button>
              <button
                onClick={handleGenerateClassPdf}
                disabled={isGeneratingClassPdf}
                className="inline-flex items-center gap-2 rounded-lg bg-sky-600 px-5 py-2 text-sm font-bold text-white shadow-sm hover:bg-sky-700 disabled:opacity-70"
              >
                {isGeneratingClassPdf ? <Loader2 size={16} className="animate-spin" /> : <Printer size={16} />}
                {isGeneratingClassPdf ? "กำลังสร้าง..." : "ยืนยันและพิมพ์"}
              </button>
            </div>
          </div>
        </div>
      )}

    </MainLayout>
  );
};

export default StudentBehaviorClassReportPage;
