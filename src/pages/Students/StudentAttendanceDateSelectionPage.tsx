import React, { useEffect, useMemo, useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import { collection, doc, getDoc, getDocs } from "firebase/firestore";
import { Document, Font, Image, Page, StyleSheet, Text, View, pdf, PDFViewer } from "@react-pdf/renderer";
import { saveAs } from "file-saver";
import Swal from "sweetalert2";
import { CalendarDays, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, FileDown, RefreshCw, Search, X, Loader2 } from "lucide-react";
import { firestore } from "@/firebase";
import { RootState, AppDispatch } from "@/store";
import { fetchSchoolSettings } from "@/store/slices/schoolSettingsSlice";
import MainLayout from "@/layouts/MainLayout";
import BackButton from "@/components/Shared/BackButton";
import SkeletonLoader from "@/components/SkeletonLoader";
import { isActiveStudentStatus } from "@/utils/studentStatusUtils";
import { CLASSES, getLevelsByRange, dedupeSchoolWord } from "@/utils/schoolUtils";

Font.register({
  family: "TH Sarabun PSK",
  fonts: [
    { src: "/fonts/THSarabunNew.ttf" },
    { src: "/fonts/THSarabunNew-Bold.ttf", fontWeight: "bold" },
  ],
});
Font.registerHyphenationCallback((word) => [word]);

interface StudentRow {
  id: string;
  studentId: string;
  studentNumber: string;
  schoolName: string;
  date: string;
  fullName: string;
  classText: string;
  checkInTime: string;
  checkOutTime: string;
  lateText: string;
  category: string;
  note: string;
  type: string;
}

const getTodayString = () => new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Bangkok" });

const ENRICH_BATCH_SIZE = 60;
const chunkArray = <T,>(arr: T[], size: number): T[][] => {
  const chunks: T[][] = [];
  for (let i = 0; i < arr.length; i += size) chunks.push(arr.slice(i, i + size));
  return chunks;
};

const formatDateDisplay = (dateStr: string) => {
  if (!dateStr) return "-";
  const [year, month, day] = dateStr.split("-");
  return `${day}/${month}/${year}`;
};

const formatTime = (value: any) => {
  if (!value) return "-";
  if (value?.toDate) {
    return value.toDate().toLocaleTimeString("th-TH", {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false,
    });
  }
  if (typeof value === "string") return value;
  return "-";
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

const getClassKey = (classLevel: string) => {
  const cleanLevel = String(classLevel || "").trim();
  return Object.keys(CLASSES).find(
    (key) => key === cleanLevel.toLowerCase() || CLASSES[key as keyof typeof CLASSES] === cleanLevel
  ) || cleanLevel.toLowerCase();
};

const getNumberValue = (value: string | number) => {
  const matched = String(value || "").match(/\d+/);
  return matched ? parseInt(matched[0], 10) : 999999;
};

const getAttendanceCategory = (status?: string, hasAttendance?: boolean) => {
  if (!hasAttendance) return "ขาด";
  if (status === "สาย" || status === "Late") return "สาย";
  if (status === "ลา" || status === "Leave") return "ลา";
  if (status === "ไปราชการ" || status === "OfficialTravel" || status === "officialTravel") return "ไปร่วมกิจกรรม";
  if (status === "กลับก่อน") return "กลับก่อน";
  if (status === "ไม่ลงเวลาออก" || status === "NoCheckout") return "ไม่ลงเวลาออก";
  if (status === "ขาด" || status === "Absent") return "ขาด";
  return "ปกติ";
};

const getScanType = (attendance: any, hasAttendance: boolean) => {
  if (!hasAttendance) return "-";
  const rawDevice = (attendance?.checkinDevice || attendance?.metadata?.checkinDevice || "").toString().toLowerCase().trim();
  const rawFlag = (attendance?.metadata?.flag || attendance?.metadata?.actionLabel || attendance?.metadata?.action || "").toString().toLowerCase().trim();
  if (rawDevice.includes("flagceremony") || rawDevice.includes("flag ceremony") || rawFlag.includes("เข้าแถว") || rawFlag.includes("เช็คแถว") || rawFlag.includes("เคารพธง")) {
    return "เช็คแถว";
  }
  const rawType = (attendance?.scanType || attendance?.checkinType || attendance?.type || "").toString().toLowerCase().trim();
  if (rawType.includes("face") || rawType.includes("ใบหน้า") || rawType.includes("หน้า")) return "สแกนใบหน้า";
  if (rawType.includes("manual") || rawType.includes("พิมพ์") || rawType.includes("key") || rawType === "พิมพ์รหัสเอง") return "พิมพ์รหัสเอง";
  if (rawType.includes("rfid") || rawType.includes("บัตร") || rawType.includes("card") || rawType === "สแกนบัตร") return "สแกนบัตร";
  if (attendance?.metadata?.isGateCheckin) return "สแกนบัตร";
  return "-";
};

const formatThaiDateFull = (isoDate: string) => {
  if (!isoDate) return "";
  const date = new Date(`${isoDate}T12:00:00`);
  return date.toLocaleDateString("th-TH", { day: "numeric", month: "long", year: "numeric" });
};

const sanitizeFlagCeremonyNote = (note: string, scanType: string) => {
  if (scanType !== "เช็คแถว") return note;
  return note.replace(/\s*\([^()]*\)\s*/g, " ").replace(/\s{2,}/g, " ").trim();
};

const pdfStyles = StyleSheet.create({
  page: {
    paddingTop: 30,
    paddingLeft: 44,
    paddingRight: 36,
    paddingBottom: 28,
    fontFamily: "TH Sarabun PSK",
    fontSize: 14,
    color: "#000",
  },
  topBar: {
    flexDirection: "row",
    justifyContent: "space-between",
    borderBottomWidth: 0.8,
    borderBottomColor: "#5f5f5f",
    paddingBottom: 2,
    marginBottom: 4,
  },
  topText: { fontSize: 10.5, fontWeight: "bold" },
  header: {
    position: "relative",
    minHeight: 38,
    marginBottom: 4,
    justifyContent: "center",
  },
  logoBox: {
    position: "absolute",
    left: 0,
    top: -2,
    width: 38,
    height: 38,
    alignItems: "center",
    justifyContent: "center",
  },
  logo: { width: 38, height: 38, objectFit: "contain" },
  titleBlock: { alignItems: "center", paddingLeft: 44, paddingRight: 28, lineHeight: 1.15 },
  reportTitle: { fontSize: 16, fontWeight: "bold", marginBottom: 1, textAlign: "center" },
  reportSubtitle: { fontSize: 12.5, marginBottom: 1, textAlign: "center" },
  table: {
    marginTop: 4,
    borderTopWidth: 1,
    borderLeftWidth: 1,
    borderColor: "#000",
  },
  row: { flexDirection: "row", minHeight: 15.05 },
  headerRow: { backgroundColor: "#e5e5e5", minHeight: 16.6 },
  cell: {
    borderRightWidth: 1,
    borderBottomWidth: 1,
    borderColor: "#000",
    justifyContent: "center",
    paddingHorizontal: 2.25,
    paddingVertical: 1.2,
  },
  centerCell: { alignItems: "center", textAlign: "center" },
  leftCell: { alignItems: "flex-start", textAlign: "left" },
  noteText: { fontSize: 9.7, lineHeight: 1 },
  headerText: { fontSize: 11.2, fontWeight: "bold", textAlign: "center", lineHeight: 1.03 },
  bodyText: { fontSize: 10.95, lineHeight: 1.03 },
  pageNumber: { position: "absolute", bottom: 10, right: 36, fontSize: 9.2 },
});

const PDF_COL_WIDTHS = {
  idx: "6%",
  studentId: "11%",
  name: "19%",
  classText: "9%",
  checkIn: "8.5%",
  checkOut: "8.5%",
  category: "8%",
  note: "21%",
  type: "9%",
};

const PDF_ROWS_PER_PAGE = 40;
interface PdfTableRow extends StudentRow {
  displayNumber: string;
}

const createBlankPdfRow = (displayNumber: number): PdfTableRow => ({
  id: `blank-${displayNumber}`,
  studentId: "",
  studentNumber: "",
  schoolName: "",
  date: "",
  fullName: "",
  classText: "",
  checkInTime: "",
  checkOutTime: "",
  lateText: "",
  category: "",
  note: "",
  type: "",
  displayNumber: String(displayNumber),
});

const getStudentNumberSlot = (value: string | number) => {
  const matched = String(value || "").match(/\d+/);
  if (!matched) return null;
  const number = parseInt(matched[0], 10);
  return Number.isFinite(number) && number > 0 ? number : null;
};

const buildPdfRows = (rows: StudentRow[], startNumber: number): PdfTableRow[] => {
  const rowMap = new Map<number, StudentRow>();
  rows.forEach((row) => {
    const slot = getStudentNumberSlot(row.studentNumber);
    if (slot !== null && slot >= startNumber && slot < startNumber + PDF_ROWS_PER_PAGE && !rowMap.has(slot)) {
      rowMap.set(slot, row);
    }
  });

  return Array.from({ length: PDF_ROWS_PER_PAGE }, (_, index) => {
    const displayNumber = startNumber + index;
    const matchedRow = rowMap.get(displayNumber);
    return matchedRow
      ? { ...matchedRow, displayNumber: String(displayNumber) }
      : createBlankPdfRow(displayNumber);
  });
};

const CLASS_LEVEL_FULL_LABELS: Record<string, string> = {
  "อ.1": "ชั้นอนุบาลปีที่ 1",
  "อ.2": "ชั้นอนุบาลปีที่ 2",
  "อ.3": "ชั้นอนุบาลปีที่ 3",
  "ป.1": "ชั้นประถมศึกษาปีที่ 1",
  "ป.2": "ชั้นประถมศึกษาปีที่ 2",
  "ป.3": "ชั้นประถมศึกษาปีที่ 3",
  "ป.4": "ชั้นประถมศึกษาปีที่ 4",
  "ป.5": "ชั้นประถมศึกษาปีที่ 5",
  "ป.6": "ชั้นประถมศึกษาปีที่ 6",
  "ม.1": "ชั้นมัธยมศึกษาปีที่ 1",
  "ม.2": "ชั้นมัธยมศึกษาปีที่ 2",
  "ม.3": "ชั้นมัธยมศึกษาปีที่ 3",
  "ม.4": "ชั้นมัธยมศึกษาปีที่ 4",
  "ม.5": "ชั้นมัธยมศึกษาปีที่ 5",
  "ม.6": "ชั้นมัธยมศึกษาปีที่ 6",
};

const getFullClassLevelLabel = (classLevel: string) => CLASS_LEVEL_FULL_LABELS[classLevel] || `ชั้น${classLevel}`;

const getFullClassroomLabel = (classText: string) => {
  const [classLevelRaw = "-", roomRaw = ""] = String(classText || "").split("/");
  const classLabel = getFullClassLevelLabel(classLevelRaw || "-");
  const roomLabel = String(roomRaw || "").trim();
  return roomLabel ? `${classLabel} ห้อง ${roomLabel}` : classLabel;
};

interface AttendancePdfPage {
  classText: string;
  chunk: StudentRow[];
  isGroupStart: boolean;
  startNumber: number;
}

const buildAttendancePdfPages = (rows: StudentRow[]): AttendancePdfPage[] => {
  const groups: { classText: string; items: StudentRow[] }[] = [];
  rows.forEach((row) => {
    const classText = row.classText || "-";
    const lastGroup = groups[groups.length - 1];
    if (lastGroup && lastGroup.classText === classText) {
      lastGroup.items.push(row);
    } else {
      groups.push({ classText, items: [row] });
    }
  });

  const pages: AttendancePdfPage[] = [];
  groups.forEach((group) => {
    const validSlots = group.items
      .map((item) => getStudentNumberSlot(item.studentNumber))
      .filter((slot): slot is number => slot !== null);
    const maxSlot = validSlots.length > 0 ? Math.max(...validSlots) : 0;
    const pageCount = Math.max(1, Math.ceil(maxSlot / PDF_ROWS_PER_PAGE));

    for (let pageIndex = 0; pageIndex < pageCount; pageIndex += 1) {
      const startNumber = pageIndex * PDF_ROWS_PER_PAGE + 1;
      const endNumber = startNumber + PDF_ROWS_PER_PAGE - 1;
      pages.push({
        classText: group.classText,
        chunk: group.items.filter((item) => {
          const slot = getStudentNumberSlot(item.studentNumber);
          return slot !== null && slot >= startNumber && slot <= endNumber;
        }),
        isGroupStart: pageIndex === 0,
        startNumber,
      });
    }
  });
  if (pages.length === 0) pages.push({ classText: "-", chunk: [], isGroupStart: true, startNumber: 1 });
  return pages;
};

interface AttendancePdfProps {
  rows: StudentRow[];
  schoolName: string;
  logoBase64?: string;
  dateStr: string;
  filterLabel: string;
}

const StudentAttendanceDatePdfDocument: React.FC<AttendancePdfProps> = ({ rows, schoolName, logoBase64, dateStr, filterLabel }) => {
  const displaySchoolName = dedupeSchoolWord(`โรงเรียน${schoolName}`);
  const pages = buildAttendancePdfPages(rows);

  return (
    <Document>
      {pages.map((pageData, pageIndex) => (
        <Page key={pageIndex} size="A4" orientation="portrait" style={pdfStyles.page}>
          <View style={pdfStyles.topBar} fixed>
            <Text style={pdfStyles.topText}>{displaySchoolName}</Text>
            <Text style={pdfStyles.topText}>รายงานการลงเวลานักเรียน - {getFullClassroomLabel(pageData.classText)}</Text>
          </View>

          {pageData.isGroupStart && (
            <View style={pdfStyles.header}>
              {logoBase64 && (
                <View style={pdfStyles.logoBox}>
                  <Image src={logoBase64} style={pdfStyles.logo} />
                </View>
              )}
              <View style={pdfStyles.titleBlock}>
                <Text style={pdfStyles.reportTitle}>รายงานการลงเวลานักเรียน</Text>
                <Text style={pdfStyles.reportSubtitle}>{displaySchoolName} {getFullClassroomLabel(pageData.classText)}</Text>
                <Text style={pdfStyles.reportSubtitle}>ประจำวันที่ {formatThaiDateFull(dateStr)}{filterLabel ? ` (${filterLabel})` : ""}</Text>
              </View>
            </View>
          )}

          <View style={pdfStyles.table}>
            <View style={[pdfStyles.row, pdfStyles.headerRow]} fixed>
              <View style={[pdfStyles.cell, pdfStyles.centerCell, { width: PDF_COL_WIDTHS.idx }]}><Text style={pdfStyles.headerText}>เลขที่</Text></View>
              <View style={[pdfStyles.cell, pdfStyles.centerCell, { width: PDF_COL_WIDTHS.studentId }]}><Text style={pdfStyles.headerText}>รหัสนักเรียน</Text></View>
              <View style={[pdfStyles.cell, pdfStyles.centerCell, { width: PDF_COL_WIDTHS.name }]}><Text style={pdfStyles.headerText}>ชื่อ-นามสกุล</Text></View>
              <View style={[pdfStyles.cell, pdfStyles.centerCell, { width: PDF_COL_WIDTHS.classText }]}><Text style={pdfStyles.headerText}>ชั้น/ห้อง</Text></View>
              <View style={[pdfStyles.cell, pdfStyles.centerCell, { width: PDF_COL_WIDTHS.checkIn }]}><Text style={pdfStyles.headerText}>เวลาเข้า</Text></View>
              <View style={[pdfStyles.cell, pdfStyles.centerCell, { width: PDF_COL_WIDTHS.checkOut }]}><Text style={pdfStyles.headerText}>เวลาออก</Text></View>
              <View style={[pdfStyles.cell, pdfStyles.centerCell, { width: PDF_COL_WIDTHS.category }]}><Text style={pdfStyles.headerText}>ประเภท</Text></View>
              <View style={[pdfStyles.cell, pdfStyles.centerCell, { width: PDF_COL_WIDTHS.note }]}><Text style={pdfStyles.headerText}>หมายเหตุ</Text></View>
              <View style={[pdfStyles.cell, pdfStyles.centerCell, { width: PDF_COL_WIDTHS.type }]}><Text style={pdfStyles.headerText}>รูปแบบลงเวลา</Text></View>
            </View>

            {buildPdfRows(pageData.chunk, pageData.startNumber).map((row) => (
              <View key={row.id} style={pdfStyles.row}>
                <View style={[pdfStyles.cell, pdfStyles.centerCell, { width: PDF_COL_WIDTHS.idx }]}><Text style={pdfStyles.bodyText}>{row.displayNumber}</Text></View>
                <View style={[pdfStyles.cell, pdfStyles.centerCell, { width: PDF_COL_WIDTHS.studentId }]}><Text style={pdfStyles.bodyText}>{row.studentId || ""}</Text></View>
                <View style={[pdfStyles.cell, pdfStyles.leftCell, { width: PDF_COL_WIDTHS.name }]}><Text style={pdfStyles.bodyText}>{row.fullName || ""}</Text></View>
                <View style={[pdfStyles.cell, pdfStyles.centerCell, { width: PDF_COL_WIDTHS.classText }]}><Text style={pdfStyles.bodyText}>{row.classText || ""}</Text></View>
                <View style={[pdfStyles.cell, pdfStyles.centerCell, { width: PDF_COL_WIDTHS.checkIn }]}><Text style={pdfStyles.bodyText}>{row.checkInTime || ""}</Text></View>
                <View style={[pdfStyles.cell, pdfStyles.centerCell, { width: PDF_COL_WIDTHS.checkOut }]}><Text style={pdfStyles.bodyText}>{row.checkOutTime || ""}</Text></View>
                <View style={[pdfStyles.cell, pdfStyles.centerCell, { width: PDF_COL_WIDTHS.category }]}><Text style={pdfStyles.bodyText}>{row.category || ""}</Text></View>
                <View style={[pdfStyles.cell, pdfStyles.leftCell, { width: PDF_COL_WIDTHS.note }]}><Text style={pdfStyles.noteText} {...({ maxLines: 1 } as any)}>{row.note || ""}</Text></View>
                <View style={[pdfStyles.cell, pdfStyles.centerCell, { width: PDF_COL_WIDTHS.type }]}><Text style={pdfStyles.bodyText}>{row.type || ""}</Text></View>
              </View>
            ))}
          </View>

          <Text style={pdfStyles.pageNumber} render={({ pageNumber, totalPages }) => `หน้า ${pageNumber} / ${totalPages}`} fixed />
        </Page>
      ))}
    </Document>
  );
};

const StudentAttendanceDateSelectionPage: React.FC = () => {
  const { user: currentUser } = useSelector((state: RootState) => state.auth);
  const schoolSettings = useSelector((state: RootState) => state.schoolSettings);
  const dispatch = useDispatch<AppDispatch>();
  const schoolId = currentUser?.schoolId;
  const [selectedDate, setSelectedDate] = useState(getTodayString());
  const [schoolName, setSchoolName] = useState("-");
  const [rows, setRows] = useState<StudentRow[]>([]);
  const [loading, setLoading] = useState(false);
  // จำนวนที่ enrich (ดึงเวลาเข้า-ออก/ลา/ราชการ) เสร็จแล้ว vs ทั้งหมด — ใช้แสดง progress
  // ระหว่างทยอยโหลดทีละชุด แทนที่จะรอครบทั้งโรงเรียนก่อนถึงจะเห็นแถวแรก
  const [enrichProgress, setEnrichProgress] = useState<{ done: number; total: number } | null>(null);
  const isEnriching = !!enrichProgress && enrichProgress.done < enrichProgress.total;
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [refreshKey, setRefreshKey] = useState(0);
  const [logoBase64, setLogoBase64] = useState<string | undefined>(undefined);
  const [exportingPdf, setExportingPdf] = useState(false);
  const [showPdfPreview, setShowPdfPreview] = useState(false);

  const [availableLevels, setAvailableLevels] = useState<string[]>([]);
  const [selectedClassLevel, setSelectedClassLevel] = useState("");
  const [selectedRoom, setSelectedRoom] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 30;

  useEffect(() => {
    if (schoolId) dispatch(fetchSchoolSettings(schoolId));
  }, [schoolId, dispatch]);

  useEffect(() => {
    if (!schoolSettings?.logoUrl) return;
    const convert = async () => {
      try {
        const response = await fetch(schoolSettings.logoUrl);
        const blob = await response.blob();
        const reader = new FileReader();
        reader.onloadend = () => setLogoBase64(reader.result as string);
        reader.readAsDataURL(blob);
      } catch (error) {
        console.error("Error converting logo:", error);
      }
    };
    convert();
  }, [schoolSettings?.logoUrl]);

  useEffect(() => {
    if (!schoolId) return;
    const fetchLevels = async () => {
      try {
        const schoolSnap = await getDoc(doc(firestore, "school-settings", schoolId));
        if (schoolSnap.exists()) {
          const schoolData = schoolSnap.data();
          const levels = getLevelsByRange(schoolData.opportunityExpansionLevel || "");
          setAvailableLevels(levels);
        }
      } catch (error) {
        console.error("Error fetching school levels for dropdown:", error);
      }
    };
    fetchLevels();
  }, [schoolId]);

  const availableRooms = useMemo(() => {
    const rooms = new Set<string>();
    rows.forEach((row) => {
      const [c, r] = row.classText.split("/");
      if (selectedClassLevel) {
        if (c === selectedClassLevel && r) {
          rooms.add(r);
        }
      } else {
        if (r) {
          rooms.add(r);
        }
      }
    });
    return Array.from(rooms).sort((a, b) => {
      const numA = parseInt(a, 10);
      const numB = parseInt(b, 10);
      if (!isNaN(numA) && !isNaN(numB)) return numA - numB;
      return a.localeCompare(b);
    });
  }, [rows, selectedClassLevel]);

  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, selectedClassLevel, selectedRoom, selectedDate]);

  useEffect(() => {
    if (!schoolId) return;
    let cancelled = false;

    const sortRows = (list: StudentRow[]) => {
      const sorted = [...list];
      sorted.sort((a, b) => {
        const [aClass, aRoom] = a.classText.split("/");
        const [bClass, bRoom] = b.classText.split("/");
        const classCompare = getClassKey(aClass).localeCompare(getClassKey(bClass), "en", { numeric: true });
        if (classCompare !== 0) return classCompare;
        const roomCompare = getNumberValue(aRoom).valueOf() - getNumberValue(bRoom).valueOf();
        if (roomCompare !== 0) return roomCompare;
        const numberCompare = getNumberValue(a.studentNumber) - getNumberValue(b.studentNumber);
        if (numberCompare !== 0) return numberCompare;
        return a.fullName.localeCompare(b.fullName, "th", { numeric: true });
      });
      return sorted;
    };

    // ดึงข้อมูลของนักเรียน 1 คน — เหมือนเดิมทุกประการ (เอกสารที่ query ไม่เปลี่ยน) เพียงแต่แยกออกมา
    // เป็นฟังก์ชันเพื่อเรียกเป็นชุดๆ (batch) แทนการยิงพร้อมกันทีเดียวทั้งโรงเรียน
    const enrichStudentRow = async (student: any, currentSchoolName: string): Promise<StudentRow> => {
      const studentRef = doc(firestore, "school-settings", schoolId, "students", student.id);
      const [attendanceSnap, leaveSnap, travelSnap] = await Promise.all([
        getDoc(doc(studentRef, "attendance", selectedDate)),
        getDocs(collection(studentRef, "leave_summary")),
        getDocs(collection(studentRef, "travel_summary")),
      ]);

      const attendance = attendanceSnap.exists() ? attendanceSnap.data() : null;
      const leaveDoc = leaveSnap.docs.find((leave) => {
        const data = leave.data();
        return data.status !== "rejected" && isDateInRange(selectedDate, data.startDate, data.endDate);
      });
      const travelDoc = travelSnap.docs.find((travel) => {
        const data = travel.data();
        return data.status !== "rejected" && isDateInRange(selectedDate, data.startDate, data.endDate);
      });

      const leaveData = leaveDoc?.data();
      const travelData = travelDoc?.data();
      const hasAttendance = Boolean(attendance);
      const isPending = (data: any) => data?.status === "pending";

      const category = travelData
        ? `ไปร่วมกิจกรรม${isPending(travelData) ? " (รออนุมัติ)" : ""}`
        : leaveData
          ? `${leaveData.leaveType || "ลา"}${isPending(leaveData) ? " (รออนุมัติ)" : ""}`
          : getAttendanceCategory(attendance?.status, hasAttendance);

      const rawNote = travelData
        ? `${isPending(travelData) ? "(รออนุมัติ) " : ""}ไปร่วมกิจกรรม: ${travelData.reason || travelData.subject || "ไปร่วมกิจกรรม"}${travelData.location ? ` [สถานที่: ${travelData.location}]` : ""}`
        : leaveData
          ? `${isPending(leaveData) ? "(รออนุมัติ) " : ""}[${leaveData.leaveType || "ลา"}] ${leaveData.reason || "ไม่ได้ระบุเหตุผล"}`
          : hasAttendance
            ? (attendance?.metadata?.description || attendance?.note || getAttendanceCategory(attendance?.status, true))
            : "ยังไม่มีข้อมูลลงเวลา";
      const scanType = getScanType(attendance, hasAttendance);
      const note = sanitizeFlagCeremonyNote(rawNote, scanType);

      const classText = `${student.classLevel || student.level || "-"}${student.room || student.roomNumber ? `/${student.room || student.roomNumber}` : ""}`;

      return {
        id: student.id,
        studentId: student.studentId || "-",
        studentNumber: student.studentNumber || student.number || student.no || "-",
        schoolName: currentSchoolName,
        date: formatDateDisplay(selectedDate),
        fullName: `${student.title || ""}${student.firstName || ""} ${student.lastName || ""}`.trim() || student.name || "-",
        classText,
        checkInTime: formatTime(attendance?.checkinTime || attendance?.time),
        checkOutTime: formatTime(attendance?.checkoutTime),
        lateText: attendance?.status === "สาย" || attendance?.status === "Late" ? "สาย" : "-",
        category,
        note,
        type: scanType,
      };
    };

    const fetchRows = async () => {
      setLoading(true);
      setEnrichProgress(null);
      setSelectedIds(new Set());
      try {
        const schoolSnap = await getDoc(doc(firestore, "school-settings", schoolId));
        const schoolData = schoolSnap.exists() ? schoolSnap.data() : {};
        const currentSchoolName = schoolData.schoolName || schoolData.name || "-";
        if (cancelled) return;
        setSchoolName(currentSchoolName);

        const studentSnap = await getDocs(collection(firestore, "school-settings", schoolId, "students"));
        const activeStudents = studentSnap.docs
          .map((studentDoc) => ({ id: studentDoc.id, ...studentDoc.data() } as any))
          .filter((student) => isActiveStudentStatus(student.status || student.studentStatus));
        if (cancelled) return;

        // ทยอยดึงข้อมูลทีละชุด (แทนที่จะยิง N คน x 3 คำขอพร้อมกันทั้งหมดในทีเดียว ซึ่งเป็นสาเหตุที่
        // หน้านี้ช้ามากในโรงเรียนที่มีนักเรียนเยอะ) แล้วอัปเดตตารางให้เห็นทันทีตั้งแต่ชุดแรก ไม่ต้องรอ
        // ครบทั้งโรงเรียนก่อนถึงจะเห็นอะไรเลย — เอกสารที่ query ยังเหมือนเดิมทุกจุด ไม่กระทบความถูกต้อง
        const batches = chunkArray(activeStudents, ENRICH_BATCH_SIZE);
        let collected: StudentRow[] = [];
        setEnrichProgress({ done: 0, total: activeStudents.length });

        for (const batch of batches) {
          const batchRows = await Promise.all(batch.map((student) => enrichStudentRow(student, currentSchoolName)));
          if (cancelled) return;
          collected = collected.concat(batchRows);
          const sorted = sortRows(collected);
          setRows(sorted);
          setEnrichProgress({ done: collected.length, total: activeStudents.length });
          setLoading(false);
        }

        setEnrichProgress(null);
      } catch (error) {
        console.error("Error fetching student attendance by date:", error);
        if (!cancelled) setRows([]);
      } finally {
        if (!cancelled) {
          setLoading(false);
          setEnrichProgress(null);
        }
      }
    };

    fetchRows();
    return () => {
      cancelled = true;
    };
  }, [schoolId, selectedDate, refreshKey]);

  const filteredRows = useMemo(() => {
    const keyword = searchTerm.trim().toLowerCase();
    let result = rows;

    if (selectedClassLevel) {
      result = result.filter((row) => {
        const [c] = row.classText.split("/");
        return c === selectedClassLevel;
      });
    }

    if (selectedRoom) {
      result = result.filter((row) => {
        const [, r] = row.classText.split("/");
        return r === selectedRoom;
      });
    }

    if (!keyword) return result;
    return result.filter((row) =>
      row.fullName.toLowerCase().includes(keyword) ||
      row.studentId.toLowerCase().includes(keyword) ||
      row.studentNumber.toLowerCase().includes(keyword) ||
      row.classText.toLowerCase().includes(keyword) ||
      row.note.toLowerCase().includes(keyword)
    );
  }, [rows, searchTerm, selectedClassLevel, selectedRoom]);

  const paginatedRows = useMemo(() => {
    const startIndex = (currentPage - 1) * itemsPerPage;
    return filteredRows.slice(startIndex, startIndex + itemsPerPage);
  }, [filteredRows, currentPage]);

  const totalPages = Math.ceil(filteredRows.length / itemsPerPage);

  const allVisibleSelected = paginatedRows.length > 0 && paginatedRows.every((row) => selectedIds.has(row.id));

  const toggleAllVisible = () => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (allVisibleSelected) {
        paginatedRows.forEach((row) => next.delete(row.id));
      } else {
        paginatedRows.forEach((row) => next.add(row.id));
      }
      return next;
    });
  };

  const toggleRow = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const buildAttendanceDatePdfDocument = () => {
    const filterLabelParts = [
      selectedClassLevel || "",
      selectedClassLevel && selectedRoom ? `/${selectedRoom}` : selectedRoom ? `ห้อง ${selectedRoom}` : "",
    ].filter(Boolean);
    const filterLabel = filterLabelParts.join("");

    return (
      <StudentAttendanceDatePdfDocument
        rows={filteredRows}
        schoolName={schoolName !== "-" ? schoolName : schoolSettings?.schoolName || ""}
        logoBase64={logoBase64}
        dateStr={selectedDate}
        filterLabel={filterLabel}
      />
    );
  };

  const openPdfPreview = () => {
    if (filteredRows.length === 0) {
      Swal.fire("ไม่มีข้อมูล", "ไม่พบข้อมูลการลงเวลาตามเงื่อนไขที่เลือก", "info");
      return;
    }
    setShowPdfPreview(true);
  };

  const exportPdf = async () => {
    setExportingPdf(true);
    try {
      const blob = await pdf(buildAttendanceDatePdfDocument()).toBlob();
      saveAs(blob, `รายงานการลงเวลานักเรียน_${selectedDate}.pdf`);
    } catch (error) {
      console.error("Error exporting PDF:", error);
      Swal.fire("เกิดข้อผิดพลาด", "ไม่สามารถสร้างไฟล์ PDF ได้", "error");
    } finally {
      setExportingPdf(false);
    }
  };

  return (
    <MainLayout>
      <div className="min-h-screen bg-slate-50 px-4 py-6 text-slate-900 dark:bg-[#1e1f21] dark:text-white sm:px-6 lg:px-8">
        <div className="mx-auto max-w-7xl">
          <div className="mb-5 flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex items-start gap-4">
              <BackButton to="/academic/hub/students" />
              <div>
                <h1 className="text-2xl font-black text-slate-900 dark:text-white">
                  ดูบันทึกการลงเวลานักเรียนแบบเลือกวัน
                </h1>
                <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                  ตรวจสอบเวลาเข้า-ออกโรงเรียนของนักเรียนทั้งโรงเรียนตามวันที่เลือก
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <div className="flex items-center gap-2 rounded-xl bg-white px-4 py-2 text-sm font-bold text-slate-600 shadow-sm ring-1 ring-slate-200 dark:bg-[#2a2b2f] dark:text-slate-300 dark:ring-slate-700">
                <CalendarDays size={16} className="text-indigo-500" />
                จำนวนทั้งหมด : {filteredRows.length}
                {isEnriching && (
                  <span className="ml-1 inline-flex items-center gap-1 text-xs font-normal text-slate-400 dark:text-slate-500">
                    <Loader2 size={12} className="animate-spin" />
                    กำลังโหลด {enrichProgress!.done}/{enrichProgress!.total}
                  </span>
                )}
              </div>
              <button
                type="button"
                onClick={openPdfPreview}
                disabled={loading || isEnriching || filteredRows.length === 0}
                className="inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-red-600 px-4 text-sm font-bold text-white shadow-sm transition hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <FileDown size={16} />
                ดาวน์โหลด PDF
              </button>
            </div>
          </div>

          <div className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-200 dark:bg-[#2a2b2f] dark:ring-slate-700">
            <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-6 lg:items-end">
              <label className="block">
                <span className="mb-1 block text-xs font-bold text-slate-700 dark:text-slate-300">โรงเรียน</span>
                <select
                  value={schoolId || ""}
                  disabled
                  className="h-10 w-full rounded-lg border border-slate-300 bg-slate-50 px-3 text-sm text-slate-700 outline-none dark:border-slate-700 dark:bg-[#1e1f21] dark:text-slate-200"
                >
                  <option value={schoolId || ""}>{schoolName}</option>
                </select>
              </label>

              <label className="block">
                <span className="mb-1 block text-xs font-bold text-slate-700 dark:text-slate-300">วันที่ต้องการค้นหา</span>
                <input
                  type="date"
                  value={selectedDate}
                  onChange={(event) => setSelectedDate(event.target.value)}
                  className="h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-700 outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 dark:border-slate-700 dark:bg-[#1e1f21] dark:text-slate-200"
                />
              </label>

              <label className="block">
                <span className="mb-1 block text-xs font-bold text-slate-700 dark:text-slate-300">ชั้นเรียน</span>
                <select
                  value={selectedClassLevel}
                  onChange={(e) => setSelectedClassLevel(e.target.value)}
                  className="h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-700 outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 dark:border-slate-700 dark:bg-[#1e1f21] dark:text-slate-200 font-bold"
                >
                  <option value="">ทุกชั้น</option>
                  {availableLevels.map((level) => (
                    <option key={level} value={level}>
                      {level}
                    </option>
                  ))}
                </select>
              </label>

              <label className="block">
                <span className="mb-1 block text-xs font-bold text-slate-700 dark:text-slate-300">ห้องเรียน</span>
                <select
                  value={selectedRoom}
                  onChange={(e) => setSelectedRoom(e.target.value)}
                  className="h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-700 outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 dark:border-slate-700 dark:bg-[#1e1f21] dark:text-slate-200 font-bold"
                >
                  <option value="">ทุกห้อง</option>
                  {availableRooms.map((room) => (
                    <option key={room} value={room}>
                      ห้อง {room}
                    </option>
                  ))}
                </select>
              </label>

              <button
                type="button"
                onClick={() => setRefreshKey((value) => value + 1)}
                className="inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-sky-600 px-4 text-sm font-bold text-white shadow-sm transition hover:bg-sky-700 disabled:opacity-60"
                disabled={loading}
              >
                <RefreshCw size={15} className={loading ? "animate-spin" : ""} />
                ค้นหารายการ
              </button>

              <label className="relative block">
                <span className="sr-only">ค้นหา</span>
                <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  value={searchTerm}
                  onChange={(event) => setSearchTerm(event.target.value)}
                  placeholder="ค้นหาชื่อ/รหัส/หมายเหตุ"
                  className="h-10 w-full rounded-lg border border-slate-300 bg-white pl-9 pr-3 text-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 dark:border-slate-700 dark:bg-[#1e1f21] dark:text-slate-200"
                />
              </label>
            </div>

            <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-700">
              <table className="w-full border-collapse text-left text-sm">
                <thead className="bg-slate-100 text-xs font-bold text-slate-700 dark:bg-[#323338] dark:text-slate-300">
                  <tr>
                    <th className="border-b border-r border-slate-200 px-3 py-3 dark:border-slate-700">
                      <label className="flex items-center gap-1">
                        <span>All</span>
                        <input type="checkbox" checked={allVisibleSelected} onChange={toggleAllVisible} />
                      </label>
                    </th>
                    <th className="border-b border-r border-slate-200 px-3 py-3 text-center dark:border-slate-700">เลขที่</th>
                    <th className="border-b border-r border-slate-200 px-3 py-3 dark:border-slate-700">รหัสนักเรียน</th>
                    <th className="border-b border-r border-slate-200 px-3 py-3 dark:border-slate-700">ชื่อ-นามสกุล</th>
                    <th className="border-b border-r border-slate-200 px-3 py-3 dark:border-slate-700">ชั้น/ห้อง</th>
                    <th className="border-b border-r border-slate-200 px-3 py-3 dark:border-slate-700">เวลาบันทึกเข้า</th>
                    <th className="border-b border-r border-slate-200 px-3 py-3 dark:border-slate-700">เวลาบันทึกออก</th>
                    <th className="border-b border-r border-slate-200 px-3 py-3 dark:border-slate-700">ประเภท</th>
                    <th className="border-b border-r border-slate-200 px-3 py-3 dark:border-slate-700">หมายเหตุ</th>
                    <th className="border-b border-slate-200 px-3 py-3 dark:border-slate-700">type</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 bg-white dark:divide-slate-700 dark:bg-[#1e1f21]">
                  {loading ? (
                    Array.from({ length: 8 }).map((_, index) => (
                      <tr key={index}>
                        <td colSpan={10} className="px-3 py-2">
                          <SkeletonLoader height="24px" />
                        </td>
                      </tr>
                    ))
                  ) : paginatedRows.length === 0 ? (
                    <tr>
                      <td colSpan={10} className="px-4 py-10 text-center text-sm text-slate-500 dark:text-slate-400">
                        ไม่พบข้อมูลการลงเวลาตามเงื่อนไขที่เลือก
                      </td>
                    </tr>
                  ) : (
                    paginatedRows.map((row, index) => (
                      <tr key={row.id} className="hover:bg-slate-50 dark:hover:bg-[#2a2b2f]">
                        <td className="border-r border-slate-200 px-3 py-2 dark:border-slate-700">
                          <input type="checkbox" checked={selectedIds.has(row.id)} onChange={() => toggleRow(row.id)} />
                        </td>
                        <td className="border-r border-slate-200 px-3 py-2 text-center font-bold dark:border-slate-700">
                          {row.studentNumber}
                        </td>
                        <td className="border-r border-slate-200 px-3 py-2 whitespace-nowrap dark:border-slate-700">{row.studentId}</td>
                        <td className="border-r border-slate-200 px-3 py-2 font-semibold whitespace-nowrap dark:border-slate-700">{row.fullName}</td>
                        <td className="border-r border-slate-200 px-3 py-2 whitespace-nowrap dark:border-slate-700">{row.classText}</td>
                        <td className="border-r border-slate-200 px-3 py-2 whitespace-nowrap dark:border-slate-700">{row.checkInTime}</td>
                        <td className="border-r border-slate-200 px-3 py-2 whitespace-nowrap dark:border-slate-700">{row.checkOutTime}</td>
                        <td className="border-r border-slate-200 px-3 py-2 whitespace-nowrap dark:border-slate-700">{row.category}</td>
                        <td className="border-r border-slate-200 px-3 py-2 min-w-[200px] max-w-[400px] break-words dark:border-slate-700">{row.note}</td>
                        <td className="px-3 py-2 whitespace-nowrap">{row.type}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            {/* Pagination Controls */}
            {totalPages > 1 && (
              <div className="mt-4 flex flex-col items-center justify-between gap-4 border-t border-slate-200 pt-4 dark:border-slate-700 sm:flex-row">
                <div className="text-xs font-medium text-slate-500 dark:text-slate-400">
                  แสดง {(currentPage - 1) * itemsPerPage + 1} ถึง{" "}
                  {Math.min(currentPage * itemsPerPage, filteredRows.length)} จาก{" "}
                  {filteredRows.length} รายการ
                </div>
                <div className="flex items-center gap-1.5 rounded-xl bg-slate-50 p-1 dark:bg-black/20">
                  <button
                    onClick={() => setCurrentPage(1)}
                    disabled={currentPage === 1}
                    className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-500 transition-all hover:bg-white hover:text-slate-800 disabled:opacity-30 disabled:hover:bg-transparent dark:text-slate-400 dark:hover:bg-[#1e1f21] dark:hover:text-white"
                    title="หน้าแรก"
                  >
                    <ChevronsLeft size={16} />
                  </button>
                  <button
                    onClick={() => setCurrentPage((prev) => Math.max(prev - 1, 1))}
                    disabled={currentPage === 1}
                    className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-500 transition-all hover:bg-white hover:text-slate-800 disabled:opacity-30 disabled:hover:bg-transparent dark:text-slate-400 dark:hover:bg-[#1e1f21] dark:hover:text-white"
                    title="ย้อนกลับ"
                  >
                    <ChevronLeft size={16} />
                  </button>

                  <div className="flex items-center gap-1">
                    {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                      let pageNum = i + 1;
                      if (totalPages > 5) {
                        const start = Math.max(1, Math.min(currentPage - 2, totalPages - 4));
                        pageNum = start + i;
                      }
                      return (
                        <button
                          key={pageNum}
                          onClick={() => setCurrentPage(pageNum)}
                          className={`h-8 w-8 rounded-lg text-xs font-bold transition-all ${
                            currentPage === pageNum
                              ? "bg-indigo-600 text-white shadow-md shadow-indigo-600/10"
                              : "text-slate-600 hover:bg-white dark:text-slate-400 dark:hover:bg-[#1e1f21]"
                          }`}
                        >
                          {pageNum}
                        </button>
                      );
                    })}
                  </div>

                  <button
                    onClick={() => setCurrentPage((prev) => Math.min(prev + 1, totalPages))}
                    disabled={currentPage === totalPages}
                    className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-500 transition-all hover:bg-white hover:text-slate-800 disabled:opacity-30 disabled:hover:bg-transparent dark:text-slate-400 dark:hover:bg-[#1e1f21] dark:hover:text-white"
                    title="ถัดไป"
                  >
                    <ChevronRight size={16} />
                  </button>
                  <button
                    onClick={() => setCurrentPage(totalPages)}
                    disabled={currentPage === totalPages}
                    className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-500 transition-all hover:bg-white hover:text-slate-800 disabled:opacity-30 disabled:hover:bg-transparent dark:text-slate-400 dark:hover:bg-[#1e1f21] dark:hover:text-white"
                    title="หน้าสุดท้าย"
                  >
                    <ChevronsRight size={16} />
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {showPdfPreview && (
        <div
          className="fixed inset-0 top-[60px] z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
          onClick={() => setShowPdfPreview(false)}
        >
          <div
            className="flex h-[calc(100vh-100px)] w-full max-w-5xl flex-col rounded-2xl bg-white shadow-2xl dark:bg-[#1e1f21]"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4 dark:border-slate-700">
              <h2 className="text-base font-bold text-slate-900 dark:text-white">
                ตัวอย่างเอกสาร — รายงานการลงเวลานักเรียน
              </h2>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={exportPdf}
                  disabled={exportingPdf}
                  className="inline-flex h-9 items-center justify-center gap-2 rounded-lg bg-red-600 px-4 text-sm font-bold text-white shadow-sm transition hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {exportingPdf ? <Loader2 size={16} className="animate-spin" /> : <FileDown size={16} />}
                  {exportingPdf ? "กำลังบันทึก..." : "ดาวน์โหลด"}
                </button>
                <button
                  type="button"
                  onClick={() => setShowPdfPreview(false)}
                  className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-slate-500 transition hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-700"
                  title="ปิด"
                >
                  <X size={18} />
                </button>
              </div>
            </div>
            <div className="flex-1 overflow-hidden rounded-b-2xl bg-slate-100 dark:bg-slate-900">
              <PDFViewer width="100%" height="100%" className="h-full w-full border-none" showToolbar={true}>
                {buildAttendanceDatePdfDocument()}
              </PDFViewer>
            </div>
          </div>
        </div>
      )}
    </MainLayout>
  );
};

export default StudentAttendanceDateSelectionPage;
