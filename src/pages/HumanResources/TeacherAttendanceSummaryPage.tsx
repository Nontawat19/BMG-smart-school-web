import React, { useState, useEffect } from "react";
import { useSelector, useDispatch } from "react-redux";
import { firestore } from "@/firebase";
import { collection, query, where, getDocs, documentId, doc, getDoc, Timestamp } from "firebase/firestore";
import { RootState, AppDispatch } from "../../store";
import { fetchSchoolSettings } from "@/store/slices/schoolSettingsSlice";
import Navbar from "../../components/Navbar/Navbar";
import LeftSidebar from "../../components/Sidebar/LeftSidebar";
import { FaFilePdf, FaSearch, FaCalendarAlt, FaTimes, FaSpinner } from "react-icons/fa";
import { Document, Font, Image, Page, PDFViewer, StyleSheet, Text, View, pdf } from "@react-pdf/renderer";
import { saveAs } from "file-saver";
import Swal from "sweetalert2";
import defaultProfile from "@/assets/profile.png";
import { getCurrentAcademicYear } from "@/utils/academicYearUtils";
import { getWeekNumber, classifyLeaveSubType } from "@/utils/periodSummaryUtils";
import MainLayout from "@/layouts/MainLayout";
import BackButton from "@/components/Shared/BackButton";
import ProfileAvatar from "@/components/Shared/ProfileAvatar";
import { isAttendanceEntryOnly } from "@/utils/attendanceRoles";
import { getGroupPersonnel } from "@/utils/schoolUtils";
import { useEffectiveSchoolId } from "@/hooks/useEffectiveSchool";

Font.register({
  family: "TH Sarabun PSK",
  fonts: [
    { src: "/fonts/THSarabunNew.ttf" },
    { src: "/fonts/THSarabunNew-Bold.ttf", fontWeight: "bold" }
  ]
});

// เหมือนกับ TeacherAttendanceDateSelectionPage — ต้องใช้ตัวเดียวกันในการอ่านช่วงวันที่ของคำขอลา/
// ไปราชการ (leave_summary/travel_summary) ที่ startDate/endDate อาจเป็นได้ทั้ง Firestore Timestamp
// หรือ string ก็ได้ ให้สองหน้านี้ตีความช่วงวันที่ตรงกันเป๊ะ ไม่งั้นตัวเลขจะไม่ตรงกันอีก
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

// แปลงรหัสสัปดาห์แบบ ISO 8601 ("YYYY-Www" จาก getWeekNumber) กลับเป็นช่วงวันที่จันทร์-อาทิตย์
// ต้องใช้อัลกอริทึมกลับด้านของ getWeekNumber เป๊ะๆ (สัปดาห์ที่ 1 = สัปดาห์ที่มีวันพฤหัสแรกของปี)
// ไม่งั้นวันที่ที่ได้จะไม่ตรงกับสัปดาห์ที่ผู้ใช้เลือกจริง
const isoWeekToDateRange = (weekStr: string): { start: string; end: string } => {
  const [yearPart, weekPart] = weekStr.split("-W");
  const year = parseInt(yearPart, 10);
  const week = parseInt(weekPart, 10);
  const jan4 = new Date(Date.UTC(year, 0, 4));
  const jan4DayOfWeek = jan4.getUTCDay() || 7; // Mon=1..Sun=7
  const week1Monday = new Date(jan4);
  week1Monday.setUTCDate(jan4.getUTCDate() - jan4DayOfWeek + 1);
  const monday = new Date(week1Monday);
  monday.setUTCDate(week1Monday.getUTCDate() + (week - 1) * 7);
  const sunday = new Date(monday);
  sunday.setUTCDate(monday.getUTCDate() + 6);
  const toStr = (d: Date) => d.toISOString().split("T")[0];
  return { start: toStr(monday), end: toStr(sunday) };
};

const getMonthDateRange = (monthStr: string): { start: string; end: string } => {
  const [y, m] = monthStr.split("-").map(Number);
  const lastDay = new Date(y, m, 0).getDate();
  return { start: `${monthStr}-01`, end: `${monthStr}-${String(lastDay).padStart(2, "0")}` };
};

// รายการวันที่ที่เข้าหมวดหนึ่งๆ ของครูคนหนึ่ง — ใช้แสดงตอนคลิกดูรายละเอียด (วัน/เดือน/ปี) ของแต่ละหมวด
interface DetailEntry {
  date: string;
  teacherName?: string;
  label?: string;
}

interface TeacherStats {
  id: string;
  fullName: string;
  profileUrl?: string;
  present: number;
  late: number;
  leave: number; // รวม sickLeave + personalLeave + otherLeave — คงไว้เพื่อความเข้ากันได้กับ PDF/โค้ดเดิม
  sickLeave: number;
  personalLeave: number;
  otherLeave: number;
  absent: number;
  noCheckout: number;
  officialTravel: number;
  total: number;
  percentage: string;
  teacherId?: string;
  // รายวันที่จริงของแต่ละหมวด สำหรับ modal ดูรายละเอียด
  details: {
    present: DetailEntry[];
    late: DetailEntry[];
    sickLeave: DetailEntry[];
    personalLeave: DetailEntry[];
    otherLeave: DetailEntry[];
    absent: DetailEntry[];
    noCheckout: DetailEntry[];
    officialTravel: DetailEntry[];
  };
}

const emptyDetails = (): TeacherStats["details"] => ({
  present: [], late: [], sickLeave: [], personalLeave: [], otherLeave: [], absent: [], noCheckout: [], officialTravel: []
});

interface TeacherAttendancePdfDocumentProps {
  chunks: TeacherStats[][];
  rowsPerPage: number;
  schoolName: string;
  schoolAffiliation: string;
  schoolLogo?: string;
  directorName: string;
  personnelHeadName?: string;
  personnelHeadRoleLabel?: string;
  dateText: string;
  filterType: "daily" | "weekly" | "monthly" | "term" | "yearly" | "custom";
  totalItems: number;
  reportPrintedAt: string;
}

const pdfStyles = StyleSheet.create({
  page: {
    paddingTop: 70,
    paddingRight: 56,
    paddingBottom: 56,
    paddingLeft: 85,
    fontFamily: "TH Sarabun PSK",
    fontSize: 13,
    color: "#000"
  },
  header: {
    position: "relative",
    minHeight: 64,
    marginBottom: 14,
    justifyContent: "center"
  },
  headerTextBlock: {
    alignItems: "center",
    paddingLeft: 64,
    paddingRight: 64
  },
  logoBox: {
    position: "absolute",
    left: 0,
    top: -34,
    width: 58,
    height: 58,
    alignItems: "center",
    justifyContent: "center"
  },
  logo: {
    width: 58,
    height: 58,
    objectFit: "contain"
  },
  title: {
    fontSize: 22,
    fontWeight: "bold",
    lineHeight: 1.1
  },
  subtitle: {
    fontSize: 16,
    fontWeight: "bold",
    lineHeight: 1.15,
    textAlign: "center",
    marginTop: 2
  },
  period: {
    fontSize: 14,
    lineHeight: 1.15,
    marginTop: 2
  },
  metaRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 5,
    fontSize: 12
  },
  table: {
    borderWidth: 1,
    borderColor: "#000",
    width: "100%"
  },
  row: {
    flexDirection: "row"
  },
  th: {
    height: 36,
    borderRightWidth: 1,
    borderBottomWidth: 1,
    borderColor: "#000",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#f4f4f4",
    paddingHorizontal: 1
  },
  td: {
    height: 24,
    borderRightWidth: 1,
    borderBottomWidth: 1,
    borderColor: "#000",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 1
  },
  lastCol: {
    borderRightWidth: 0
  },
  lastRowCell: {
    borderBottomWidth: 0
  },
  headerText: {
    fontSize: 13,
    fontWeight: "bold",
    textAlign: "center",
    lineHeight: 1.05
  },
  cellText: {
    fontSize: 13,
    textAlign: "center",
    lineHeight: 1
  },
  nameText: {
    fontSize: 13,
    lineHeight: 1,
    textAlign: "left"
  },
  nameCell: {
    alignItems: "flex-start",
    paddingLeft: 4
  },
  footer: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 15,
    marginTop: 40,
    fontSize: 13
  },
  signBox: {
    width: "30%",
    alignItems: "center"
  },
  signName: {
    marginTop: 15,
    marginBottom: 2
  },
  pageNumber: {
    position: "absolute",
    right: 56,
    bottom: 32,
    fontSize: 11
  }
});

const colDefs = [
  { key: "index", label: "ที่", width: 20 },
  { key: "teacherId", label: "รหัสครู", width: 35 },
  { key: "fullName", label: "ชื่อ - นามสกุล", width: 120 },
  { key: "present", label: "มา", width: 22 },
  { key: "late", label: "สาย", width: 22 },
  { key: "leave", label: "ลา", width: 22 },
  { key: "absent", label: "ขาด", width: 22 },
  { key: "officialTravel", label: "ไป\nราชการ", width: 35 },
  { key: "noCheckout", label: "ไม่ลงเวลา\nออก", width: 45 },
  { key: "total", label: "รวม", width: 25 },
  { key: "percentage", label: "ร้อยละ", width: 35 },
  { key: "note", label: "หมายเหตุ", width: 47 }
] as const;

const TeacherAttendancePdfDocument: React.FC<TeacherAttendancePdfDocumentProps> = ({
  chunks,
  rowsPerPage,
  schoolName,
  schoolAffiliation,
  schoolLogo,
  directorName,
  personnelHeadName,
  personnelHeadRoleLabel,
  dateText,
  filterType,
  totalItems,
  reportPrintedAt
}) => {
  const periodPrefix = filterType === "daily" ? "วันที่" : filterType === "monthly" ? "เดือน" : filterType === "term" ? "" : "ช่วงวันที่";

  const getValue = (row: TeacherStats, key: typeof colDefs[number]["key"], index: number) => {
    if (key === "index") return String(index);
    if (key === "teacherId") return row.teacherId || "-";
    if (key === "fullName") return row.fullName;
    if (key === "percentage") return `${row.percentage}%`;
    if (key === "note") return "";
    return String(row[key] ?? "");
  };

  return (
    <Document>
      {chunks.map((chunk, pageIndex) => {
        const isLastPage = pageIndex === chunks.length - 1;
        return (
          <Page key={pageIndex} size="A4" style={pdfStyles.page}>
            <View style={pdfStyles.header}>
              {schoolLogo ? (
                <View style={pdfStyles.logoBox}>
                  <Image src={schoolLogo} style={pdfStyles.logo} />
                </View>
              ) : null}
              <View style={pdfStyles.headerTextBlock}>
                <Text style={pdfStyles.title}>รายงานสรุปการลงเวลาปฏิบัติราชการ</Text>
                <Text style={pdfStyles.subtitle}>
                  ข้าราชการครูและบุคลากรทางการศึกษา {schoolName}{schoolAffiliation ? ` ${schoolAffiliation}` : ""}
                </Text>
                <Text style={pdfStyles.period}>ประจำ{periodPrefix} {dateText}</Text>
              </View>
            </View>

            <View style={pdfStyles.metaRow}>
              <Text>จำนวนรายการทั้งหมด {totalItems} รายการ</Text>
              <Text>พิมพ์วันที่ {reportPrintedAt}</Text>
            </View>

            <View style={pdfStyles.table}>
              <View style={pdfStyles.row}>
                {colDefs.map((col, colIndex) => (
                  <View
                    key={col.key}
                    style={[pdfStyles.th, { width: col.width }, colIndex === colDefs.length - 1 ? pdfStyles.lastCol : {}]}
                  >
                    <Text style={pdfStyles.headerText}>{col.label}</Text>
                  </View>
                ))}
              </View>
              {chunk.map((row, rowIndex) => {
                const absoluteIndex = pageIndex * rowsPerPage + rowIndex + 1;
                const isLastRow = rowIndex === chunk.length - 1;
                return (
                  <View key={row.id || absoluteIndex} style={pdfStyles.row}>
                    {colDefs.map((col, colIndex) => (
                      <View
                        key={col.key}
                        style={[
                          pdfStyles.td,
                          { width: col.width },
                          col.key === "fullName" ? pdfStyles.nameCell : {},
                          colIndex === colDefs.length - 1 ? pdfStyles.lastCol : {},
                          isLastRow ? pdfStyles.lastRowCell : {}
                        ]}
                      >
                        <Text style={col.key === "fullName" ? pdfStyles.nameText : pdfStyles.cellText}>
                          {getValue(row, col.key, absoluteIndex)}
                        </Text>
                      </View>
                    ))}
                  </View>
                );
              })}
            </View>

            {isLastPage ? (
              <View style={pdfStyles.footer}>
                <View style={pdfStyles.signBox}>
                  <Text>ลงชื่อ..........................................ผู้จัดทำรายงาน</Text>
                  <Text style={pdfStyles.signName}>(..........................................)</Text>
                  <Text>ตำแหน่ง..........................................</Text>
                </View>
                <View style={pdfStyles.signBox}>
                  <Text>ลงชื่อ..........................................ผู้ตรวจสอบ</Text>
                  <Text style={pdfStyles.signName}>({personnelHeadName || ".........................................."})</Text>
                  <Text>{personnelHeadRoleLabel || "หัวหน้าฝ่ายบริหารงานบุคคล"}</Text>
                </View>
                <View style={pdfStyles.signBox}>
                  <Text>ลงชื่อ..........................................ผู้รับรอง</Text>
                  <Text style={pdfStyles.signName}>({directorName || ".........................................."})</Text>
                  <Text>ผู้อำนวยการ{schoolName || ".........................................."}</Text>
                </View>
              </View>
            ) : null}

            <Text style={pdfStyles.pageNumber}>หน้า {pageIndex + 1} / {chunks.length}</Text>
          </Page>
        );
      })}
    </Document>
  );
};

const TeacherAttendanceSummaryPage: React.FC = () => {
  const dispatch = useDispatch<AppDispatch>();
  const { user: currentUser } = useSelector((state: RootState) => state.auth);
  const schoolSettings = useSelector((state: RootState) => state.schoolSettings);
  const schoolId = useEffectiveSchoolId();

  const [loading, setLoading] = useState(false);
  const [teachers, setTeachers] = useState<any[]>([]);
  const [summaryData, setSummaryData] = useState<TeacherStats[]>([]);
  const [searchTerm, setSearchTerm] = useState("");

  // Filter States
  const [filterType, setFilterType] = useState<"daily" | "weekly" | "monthly" | "term" | "yearly" | "custom">("daily");
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0]);
  const [selectedWeek, setSelectedWeek] = useState(() => getWeekNumber(new Date()));
  const [selectedMonth, setSelectedMonth] = useState(new Date().toISOString().slice(0, 7)); // YYYY-MM
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [terms, setTerms] = useState<{ term1: { start: string, end: string }, term2: { start: string, end: string } }>({ term1: { start: "", end: "" }, term2: { start: "", end: "" } });
  const [selectedTerm, setSelectedTerm] = useState<"1" | "2">("1");
  const [currentAcademicYear, setCurrentAcademicYear] = useState("");

  const [calendarEvents, setCalendarEvents] = useState<Record<string, any>>({});
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const handleResize = () => {
      setIsMobile(window.innerWidth < 768);
    };
    handleResize();
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  // Fetch all teachers first to calculate "Absent" correctly
  useEffect(() => {
    const fetchTeachers = async () => {
      if (!schoolId) return;
      try {
        // 📌 แก้ไข: ดึงข้อมูลจาก school-settings/teachers แทน users เพื่อให้ได้ ID ที่ถูกต้องตรงกับที่บันทึกเวลา
        const q = query(
          collection(firestore, "school-settings", schoolId, "teachers"),
          where("status", "==", "อยู่")
        );
        const snapshot = await getDocs(q);
        const teacherList = (await Promise.all(snapshot.docs.map(async (docSnap) => {
          const data = docSnap.data();
          let linkedUserData: any = null;

          try {
            const userSnap = await getDoc(doc(firestore, "users", data.uid || docSnap.id));
            linkedUserData = userSnap.exists() ? userSnap.data() : null;
          } catch (error) {
            console.warn("Error fetching linked user for attendance summary:", error);
          }

          const role = linkedUserData?.role || data.role || [];
          if (isAttendanceEntryOnly(role)) return null;

          return {
            id: docSnap.id,
            fullName: `${data.title || ''}${data.firstName || ''} ${data.lastName || ''}`.trim(),
            ...data,
            role
          };
        }))).filter(Boolean);
        setTeachers(teacherList);
      } catch (error) {
        console.error("Error fetching teachers:", error);
      }
    };
    fetchTeachers();
  }, [schoolId]);


  // Fetch School Settings if not already loaded
  useEffect(() => {
    if (schoolId && schoolSettings.status === 'idle') {
      dispatch(fetchSchoolSettings(schoolId));
    }
  }, [schoolId, schoolSettings.status, dispatch]);

  // Fetch Academic Year and Terms from School Calendar
  useEffect(() => {
    if (!schoolId) return;
    const fetchAcademicData = async () => {
      try {
        const data = await getCurrentAcademicYear(firestore, schoolId);
        setCurrentAcademicYear(data.academicYear);
        setTerms({
          term1: { start: data.terms.term1?.startDate || "", end: data.terms.term1?.endDate || "" },
          term2: { start: data.terms.term2?.startDate || "", end: data.terms.term2?.endDate || "" }
        });

        // ตั้งค่า default term ถ้ามี
        if (data.currentTerm) {
          setSelectedTerm(data.currentTerm);
        }
      } catch (error) {
        console.error("Error fetching academic year data:", error);
      }
    };
    fetchAcademicData();
  }, [schoolId]);

  // Fetch Calendar Events (Firestore + Google Calendar)
  useEffect(() => {
    const fetchCalendarData = async () => {
      if (!schoolId) return;

      // Determine date range for fetching calendar
      let sYear = new Date().getFullYear();
      let eYear = new Date().getFullYear();

      if (filterType === 'custom' && startDate && endDate) {
        sYear = new Date(startDate).getFullYear();
        eYear = new Date(endDate).getFullYear();
      } else if (filterType === 'term') {
        const t = selectedTerm === '1' ? terms.term1 : terms.term2;
        if (t.start && t.end) {
          sYear = new Date(t.start).getFullYear();
          eYear = new Date(t.end).getFullYear();
        }
      } else if (filterType === 'monthly') {
        sYear = parseInt(selectedMonth.split('-')[0]);
        eYear = sYear;
      } else if (filterType === 'daily') {
        sYear = new Date(selectedDate).getFullYear();
        eYear = sYear;
      }

      try {
        // 1. Firestore (School Calendar)
        const docRef = doc(firestore, 'school-settings', schoolId, 'main_calendar', 'default');
        const docSnap = await getDoc(docRef);
        let events: Record<string, any> = {};
        if (docSnap.exists()) {
          const data = docSnap.data();
          if (data.events) {
            events = { ...data.events };
          }
        }

        setCalendarEvents(events);
      } catch (error) {
        console.error("Error fetching calendar:", error);
      }
    };

    fetchCalendarData();
  }, [schoolId, filterType, selectedDate, selectedMonth, startDate, endDate, selectedTerm, terms]);

  const isWorkingDay = (dateStr: string) => {
    const event = calendarEvents[dateStr];
    const d = new Date(dateStr);
    const dayOfWeek = d.getUTCDay();

    // Check weekend
    if (dayOfWeek === 0 || dayOfWeek === 6) {
      // Check if it's a schoolDay override
      if (event?.type === 'schoolDay') return true;
      return false; // Weekend and not a schoolDay
    }

    // Check calendar events for weekdays
    if (event) {
      if (event.type === 'holiday' || event.type === 'specialHoliday') return false;
    }

    return true;
  };

  // ทุกรูปแบบรายงาน (รายวัน/สัปดาห์/เดือน/ภาคเรียน/ปี/กำหนดเอง) คำนวณจากข้อมูลดิบระดับวันเหมือนกันหมด
  // (attendance/{date} + leave_summary/travel_summary ต่อครู) แทนที่จะอ่านเอกสารสรุปสำเร็จรูป
  // (Weeksummary/Monthsummary/...) เหมือนเดิม เพราะเอกสารสรุปเหล่านั้นเก็บแค่ "ตัวเลขรวม" ไม่มีวันที่
  // จริงและไม่ได้แยกลาป่วย/ลากิจ — ไม่มีทางรองรับการคลิกดูรายละเอียดวันที่ หรือแยกประเภทการลาได้เลย
  // ถ้าไม่อ่านข้อมูลดิบ ต้นทุนที่แลกมาคือมุมมองรายภาค/รายปีจะอ่านเอกสารเยอะขึ้น (หลักร้อยแทนที่จะเป็น 1
  // เอกสารต่อครู) แต่เป็นทางเดียวที่ให้ผลลัพธ์ถูกต้องและรองรับฟีเจอร์ที่ขอมา
  const fetchData = async () => {
    if (!schoolId) return;
    // รอให้โหลดข้อมูลครูเสร็จก่อน
    if (teachers.length === 0) return;

    let startStr = "";
    let endStr = "";

    if (filterType === "daily") {
      startStr = selectedDate;
      endStr = selectedDate;
    } else if (filterType === "custom") {
      if (!startDate || !endDate) {
        Swal.fire("แจ้งเตือน", "กรุณาเลือกวันที่เริ่มต้นและสิ้นสุด", "warning");
        return;
      }
      startStr = startDate;
      endStr = endDate;
    } else if (filterType === "weekly") {
      const range = isoWeekToDateRange(selectedWeek);
      startStr = range.start;
      endStr = range.end;
    } else if (filterType === "monthly") {
      const range = getMonthDateRange(selectedMonth);
      startStr = range.start;
      endStr = range.end;
    } else if (filterType === "term") {
      const t = selectedTerm === "1" ? terms.term1 : terms.term2;
      if (!t.start || !t.end) return; // ปฏิทินยังไม่ได้ตั้งค่าภาคเรียนนี้ — รอข้อมูลก่อน ไม่ต้องเตือน
      startStr = t.start;
      endStr = t.end;
    } else if (filterType === "yearly") {
      if (!terms.term1.start || !terms.term2.end) return; // รอปฏิทินโหลดก่อน
      startStr = terms.term1.start;
      endStr = terms.term2.end;
    }

    if (!startStr || !endStr) return;

    setLoading(true);
    try {
      const promises = teachers.map(async (teacher) => {
        const teacherRef = doc(firestore, "school-settings", schoolId, "teachers", teacher.id);
        const attRef = collection(teacherRef, "attendance");
        const q = query(attRef, where(documentId(), ">=", startStr), where(documentId(), "<=", endStr));
        const [attSnap, leaveSnap, travelSnap] = await Promise.all([
          getDocs(q),
          getDocs(collection(teacherRef, "leave_summary")),
          getDocs(collection(teacherRef, "travel_summary")),
        ]);

        const attendanceByDate: Record<string, any> = {};
        attSnap.docs.forEach(docSnap => { attendanceByDate[docSnap.id] = docSnap.data(); });

        // กรอง rejected ทิ้ง เหมือน DateSelectionPage — คำขอที่ยัง pending ก็ยังนับเป็นหมวดนั้นได้
        const leaveRanges = leaveSnap.docs.map(d => d.data()).filter(data => data.status !== "rejected");
        const travelRanges = travelSnap.docs.map(d => d.data()).filter(data => data.status !== "rejected");

        return { teacherId: teacher.id, attendanceByDate, leaveRanges, travelRanges };
      });

      const perTeacherData = await Promise.all(promises);
      const dataByTeacher = new Map(perTeacherData.map(d => [d.teacherId, d]));

      // Calculate Working Dates
      const workingDates: string[] = [];
      const cur = new Date(startStr);
      const last = new Date(endStr);
      while (cur <= last) {
        const dStr = cur.toISOString().split('T')[0];
        if (isWorkingDay(dStr)) {
          workingDates.push(dStr);
        }
        cur.setDate(cur.getDate() + 1);
      }

      const stats: TeacherStats[] = teachers.map(teacher => {
        const data = dataByTeacher.get(teacher.id);
        let present = 0, late = 0, sickLeave = 0, personalLeave = 0, otherLeave = 0,
          noCheckout = 0, officialTravel = 0, explicitAbsent = 0, missing = 0;
        const details = emptyDetails();

        workingDates.forEach(dateStr => {
          // ลำดับความสำคัญเดียวกับ DateSelectionPage: ไปราชการ > ลา > สถานะเช็คชื่อดิบ
          const travelHit = data?.travelRanges.find(r => isDateInRange(dateStr, r.startDate, r.endDate));
          if (travelHit) { officialTravel++; details.officialTravel.push({ date: dateStr }); return; }

          const leaveHit = data?.leaveRanges.find(r => isDateInRange(dateStr, r.startDate, r.endDate));
          if (leaveHit) {
            const subType = classifyLeaveSubType(leaveHit.leaveType);
            const entry = { date: dateStr, label: leaveHit.leaveType || undefined };
            if (subType === 'sick') { sickLeave++; details.sickLeave.push(entry); }
            else if (subType === 'personal') { personalLeave++; details.personalLeave.push(entry); }
            else { otherLeave++; details.otherLeave.push(entry); }
            return;
          }

          const rec = data?.attendanceByDate[dateStr];
          if (!rec) { missing++; details.absent.push({ date: dateStr, label: "ไม่มีบันทึก" }); return; }

          if (rec.status === 'สาย' || rec.status === 'Late') { late++; details.late.push({ date: dateStr }); }
          else if (rec.status === 'ลา' || rec.status === 'ล' || rec.status === 'Leave') { otherLeave++; details.otherLeave.push({ date: dateStr }); }
          else if (rec.status === 'มา' || rec.status === 'OnTime' || rec.status === 'Normal' || rec.status === 'กลับก่อน') { present++; details.present.push({ date: dateStr }); }
          else if (rec.status === 'ไม่ลงเวลาออก' || rec.status === 'NoCheckout') { noCheckout++; details.noCheckout.push({ date: dateStr }); }
          else if (rec.status === 'ไปราชการ' || rec.status === 'officialTravel' || rec.status === 'OfficialTravel') { officialTravel++; details.officialTravel.push({ date: dateStr }); }
          else if (rec.status === 'ขาด' || rec.status === 'Absent') { explicitAbsent++; details.absent.push({ date: dateStr }); }
          else { missing++; details.absent.push({ date: dateStr, label: "ไม่มีบันทึก" }); }
        });

        const absent = explicitAbsent + missing;
        const leave = sickLeave + personalLeave + otherLeave;
        const attended = present + late + noCheckout + officialTravel;
        const percentage = workingDates.length > 0 ? ((attended / workingDates.length) * 100).toFixed(2) : "0.00";

        return {
          id: teacher.id, fullName: teacher.fullName || `${teacher.firstName || ''} ${teacher.lastName || ''}`.trim() || "ไม่ระบุชื่อ",
          profileUrl: teacher.profileImageUrl,
          present, late, leave, sickLeave, personalLeave, otherLeave, absent, noCheckout, officialTravel,
          total: workingDates.length, percentage,
          teacherId: teacher.teacherId || "",
          details,
        };
      });
      setSummaryData(stats);
    } catch (error) {
      console.error("Error fetching attendance summary:", error);
      Swal.fire("Error", "เกิดข้อผิดพลาดในการดึงข้อมูล", "error");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (filterType !== 'custom') {
      fetchData();
    }
  }, [filterType, selectedDate, selectedWeek, selectedMonth, teachers, calendarEvents, selectedTerm, terms]); // Auto fetch on simple filters, manual for custom

  const filteredData = summaryData.filter(item => {
    const kw = searchTerm.trim().toLowerCase();
    if (!kw) return true;
    return item.fullName.toLowerCase().includes(kw) || (item.teacherId || "").toLowerCase().includes(kw);
  });

  // Modal แสดงรายละเอียดวัน/เดือน/ปี ของหมวดที่คลิก — ใช้ทั้งตอนคลิกที่การ์ดสรุปด้านบน (รวมทุกคนที่กรองอยู่
  // จึงมี teacherName กำกับแต่ละแถว) และตอนคลิกที่ช่องตัวเลขของครูรายคนในตาราง (ไม่ต้องกำกับชื่อซ้ำ)
  const [detailModal, setDetailModal] = useState<{ title: string; entries: DetailEntry[] } | null>(null);

  const openTeacherDetail = (teacherName: string, category: keyof TeacherStats["details"], entries: DetailEntry[], label: string) => {
    if (entries.length === 0) return;
    setDetailModal({ title: `${label} — ${teacherName}`, entries });
  };

  const openAggregateDetail = (category: keyof TeacherStats["details"], label: string) => {
    const entries: DetailEntry[] = [];
    filteredData.forEach(row => {
      row.details[category].forEach(e => entries.push({ ...e, teacherName: row.fullName }));
    });
    if (entries.length === 0) return;
    setDetailModal({ title: label, entries });
  };

  const formatDetailDate = (dateStr: string) => {
    try {
      return new Date(dateStr).toLocaleDateString('th-TH', { weekday: 'short', day: 'numeric', month: 'long', year: 'numeric' });
    } catch {
      return dateStr;
    }
  };

  const [showPdfPreview, setShowPdfPreview] = useState(false);
  const [isPreparingPdf, setIsPreparingPdf] = useState(false);
  const [isDownloadingPdf, setIsDownloadingPdf] = useState(false);
  const [pdfDocProps, setPdfDocProps] = useState<TeacherAttendancePdfDocumentProps | null>(null);

  const buildPdfDocProps = async (): Promise<TeacherAttendancePdfDocumentProps> => {
    const getImageDataUrl = async (url: string): Promise<string> => {
      try {
        const response = await fetch(url, { mode: "cors" });
        if (!response.ok) return url;
        const blob = await response.blob();
        return await new Promise((resolve) => {
          const reader = new FileReader();
          reader.onloadend = () => resolve(reader.result as string);
          reader.readAsDataURL(blob);
        });
      } catch (error) {
        console.warn("Unable to convert school logo for PDF:", error);
        return url;
      }
    };

    let freshSchoolSettings: any = schoolSettings;
    if (schoolId) {
      try {
        const schoolDoc = await getDoc(doc(firestore, "school-settings", schoolId));
        if (schoolDoc.exists()) {
          freshSchoolSettings = { ...schoolSettings, ...schoolDoc.data() };
        }
      } catch (error) {
        console.warn("Unable to fetch latest school settings for PDF:", error);
      }
    }

    const schoolName = freshSchoolSettings.schoolName || "";
    const directorName = freshSchoolSettings.directorName || "";
    const personnelPersonnel = getGroupPersonnel(freshSchoolSettings, 'personnel');
    const personnelHeadName = personnelPersonnel.name;
    const personnelHeadRoleLabel = personnelPersonnel.label;
    const schoolLogoUrl = freshSchoolSettings.logoUrl || "";
    const schoolLogo = schoolLogoUrl ? await getImageDataUrl(schoolLogoUrl) : "";
    const schoolAffiliation = freshSchoolSettings.affiliation || "";

    const displaySchoolName = schoolName ? (schoolName.startsWith("โรงเรียน") ? schoolName : `โรงเรียน${schoolName}`) : "";
    const displayAffiliation = schoolAffiliation || "";

    let dateText = "";
    if (filterType === "daily") {
      dateText = new Date(selectedDate).toLocaleDateString('th-TH', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
    } else if (filterType === "term") {
      const t = selectedTerm === '1' ? terms.term1 : terms.term2;
      const s = t.start ? new Date(t.start).toLocaleDateString('th-TH', { day: 'numeric', month: 'long', year: 'numeric' }) : '?';
      const e = t.end ? new Date(t.end).toLocaleDateString('th-TH', { day: 'numeric', month: 'long', year: 'numeric' }) : '?';
      dateText = `ภาคเรียนที่ ${selectedTerm}${currentAcademicYear ? ` ปีการศึกษา ${currentAcademicYear}` : ''} (${s} - ${e})`;
    } else if (filterType === "monthly") {
      const [y, m] = selectedMonth.split('-');
      const d = new Date(parseInt(y), parseInt(m) - 1, 1);
      dateText = d.toLocaleDateString('th-TH', { month: 'long', year: 'numeric' });
    } else {
      const s = new Date(startDate).toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: '2-digit' });
      const e = new Date(endDate).toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: '2-digit' });
      dateText = `${s} - ${e}`;
    }

    const rowsPerPage = 20;
    const chunks: TeacherStats[][] = [];
    for (let i = 0; i < filteredData.length; i += rowsPerPage) {
      chunks.push(filteredData.slice(i, i + rowsPerPage));
    }

    const reportPrintedAt = new Date().toLocaleDateString('th-TH', {
      day: 'numeric',
      month: 'long',
      year: 'numeric'
    });

    return {
      chunks,
      rowsPerPage,
      schoolName: displaySchoolName,
      schoolAffiliation: displayAffiliation,
      schoolLogo,
      directorName,
      personnelHeadName,
      personnelHeadRoleLabel,
      dateText,
      filterType,
      totalItems: filteredData.length,
      reportPrintedAt,
    };
  };

  const handleOpenPdfPreview = async () => {
    if (filteredData.length === 0) {
      Swal.fire("ไม่มีข้อมูล", "ไม่พบข้อมูลสำหรับส่งออก PDF", "info");
      return;
    }
    setIsPreparingPdf(true);
    try {
      const props = await buildPdfDocProps();
      setPdfDocProps(props);
      setShowPdfPreview(true);
    } catch (err) {
      console.error("PDF Prepare Error:", err);
      Swal.fire("Error", "ไม่สามารถเตรียม PDF ได้", "error");
    } finally {
      setIsPreparingPdf(false);
    }
  };

  const handleDownloadPdf = async () => {
    if (!pdfDocProps) return;
    setIsDownloadingPdf(true);
    try {
      const pdfBlob = await pdf(<TeacherAttendancePdfDocument {...pdfDocProps} />).toBlob();
      saveAs(pdfBlob, `attendance_summary_${new Date().toISOString().split('T')[0]}.pdf`);
    } catch (err) {
      console.error("PDF Export Error:", err);
      Swal.fire("Error", "ไม่สามารถส่งออก PDF ได้", "error");
    } finally {
      setIsDownloadingPdf(false);
    }
  };

  return (
    <MainLayout>
      <div className="min-h-screen bg-gray-50 dark:bg-[#1e1f21] transition-colors duration-300 p-4 sm:p-6 lg:p-8">
        <div className="max-w-7xl mx-auto">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
            <div className="flex items-center gap-4">
              <BackButton to="/academic/hub/personnel_info" />
              <div>
                <h1 className="text-2xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
                  <FaCalendarAlt className="text-indigo-600 dark:text-indigo-400" />
                  สรุปการลงเวลาครู
                </h1>
                <p className="text-gray-500 dark:text-gray-400 text-sm mt-1">
                  รายงานสรุป ขาด ลา มา สาย (รายวัน/เดือน/ภาคเรียน)
                </p>
              </div>
            </div>

            <div className="flex gap-2">
              <button
                onClick={handleOpenPdfPreview}
                disabled={isPreparingPdf}
                className="flex items-center gap-2 px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg transition-colors shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isPreparingPdf ? <FaSpinner className="animate-spin" /> : <FaFilePdf />}
                {isPreparingPdf ? "กำลังเตรียม PDF..." : "Export PDF"}
              </button>
            </div>
          </div>

          {/* Filters */}
          <div className="bg-white dark:bg-[#2a2b2f] p-4 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 mb-6">
            <div className="flex flex-col md:flex-row gap-4 items-end">
              <div className="w-full md:w-auto">
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">รูปแบบรายงาน</label>
                <select
                  value={filterType}
                  onChange={(e) => setFilterType(e.target.value as any)}
                  className="w-full md:w-40 px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-[#1e1f21] text-gray-900 dark:text-white outline-none focus:ring-2 focus:ring-indigo-500"
                >
                  <option value="daily">รายวัน</option>
                  <option value="weekly">รายสัปดาห์</option>
                  <option value="monthly">รายเดือน</option>
                  <option value="term">ภาคเรียน</option>
                  <option value="yearly">รายปี</option>
                  <option value="custom">กำหนดเอง</option>
                </select>
              </div>

              {filterType === "daily" && (
                <div className="w-full md:w-auto">
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">เลือกวันที่</label>
                  <input
                    type="date"
                    value={selectedDate}
                    onChange={(e) => setSelectedDate(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-[#1e1f21] text-gray-900 dark:text-white outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
              )}

              {filterType === "weekly" && (
                <div className="w-full md:w-auto">
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">เลือกสัปดาห์</label>
                  <input
                    type="week"
                    value={selectedWeek}
                    onChange={(e) => setSelectedWeek(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-[#1e1f21] text-gray-900 dark:text-white outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
              )}

              {filterType === "monthly" && (
                <div className="w-full md:w-auto">
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">เลือกเดือน</label>
                  <input
                    type="month"
                    value={selectedMonth}
                    onChange={(e) => setSelectedMonth(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-[#1e1f21] text-gray-900 dark:text-white outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
              )}

              {filterType === "yearly" && (
                <div className="w-full md:w-auto">
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">เลือกปี</label>
                  <input
                    type="number"
                    value={selectedYear}
                    onChange={(e) => setSelectedYear(parseInt(e.target.value))}
                    min="2020"
                    max="2030"
                    className="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-[#1e1f21] text-gray-900 dark:text-white outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
              )}

              {filterType === "term" && (
                <div className="w-full md:w-auto">
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">เลือกภาคเรียน</label>
                  <select
                    value={selectedTerm}
                    onChange={(e) => setSelectedTerm(e.target.value as "1" | "2")}
                    className="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-[#1e1f21] text-gray-900 dark:text-white outline-none focus:ring-2 focus:ring-indigo-500"
                  >
                    <option value="1">ภาคเรียนที่ 1</option>
                    <option value="2">ภาคเรียนที่ 2</option>
                  </select>
                </div>
              )}

              {filterType === "custom" && (
                <>
                  <div className="w-full md:w-auto">
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">วันที่เริ่มต้น</label>
                    <input
                      type="date"
                      value={startDate}
                      onChange={(e) => setStartDate(e.target.value)}
                      className="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-[#1e1f21] text-gray-900 dark:text-white outline-none focus:ring-2 focus:ring-indigo-500"
                    />
                  </div>
                  <div className="w-full md:w-auto">
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">วันที่สิ้นสุด</label>
                    <input
                      type="date"
                      value={endDate}
                      onChange={(e) => setEndDate(e.target.value)}
                      className="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-[#1e1f21] text-gray-900 dark:text-white outline-none focus:ring-2 focus:ring-indigo-500"
                    />
                  </div>
                  <button
                    onClick={fetchData}
                    className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg transition-colors shadow-sm h-[42px]"
                  >
                    <FaSearch />
                  </button>
                </>
              )}

              <div className="flex-grow"></div>

              <div className="w-full md:w-64 relative">
                <FaSearch className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                <input
                  type="text"
                  placeholder="ค้นหาชื่อครู หรือรหัสครู..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10 pr-4 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-[#1e1f21] text-gray-900 dark:text-white focus:ring-2 focus:ring-indigo-500 outline-none w-full"
                />
              </div>
            </div>
          </div>

          {/* Summary Statistics — คำนวณจาก filteredData เสมอ ถ้าค้นหา/เลือกครูคนใดคนหนึ่งอยู่ ตัวเลข
              การ์ดจะเป็นของคนนั้นเท่านั้น ไม่ใช่ยอดรวมทั้งโรงเรียนเหมือนเดิม — คลิกที่การ์ดเพื่อดูรายละเอียด
              วัน/เดือน/ปี ของทุกคนที่กำลังกรองอยู่ในหมวดนั้น */}
          {!loading && summaryData.length > 0 && (
            <>
              {searchTerm.trim() && (
                <p className="text-xs text-gray-500 dark:text-gray-400 mb-2">
                  กำลังแสดงผลรวมเฉพาะ {filteredData.length} คนที่ตรงกับ "{searchTerm}"
                </p>
              )}
              <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-4 mb-6">
                {([
                  { key: 'present', label: 'มา (ปกติ)', cardClass: 'bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-700/50', labelClass: 'text-green-600 dark:text-green-400', valueClass: 'text-green-700 dark:text-green-300' },
                  { key: 'late', label: 'สาย', cardClass: 'bg-yellow-50 dark:bg-yellow-900/20 border-yellow-200 dark:border-yellow-700/50', labelClass: 'text-yellow-600 dark:text-yellow-400', valueClass: 'text-yellow-700 dark:text-yellow-300' },
                  { key: 'sickLeave', label: 'ลาป่วย', cardClass: 'bg-sky-50 dark:bg-sky-900/20 border-sky-200 dark:border-sky-700/50', labelClass: 'text-sky-600 dark:text-sky-400', valueClass: 'text-sky-700 dark:text-sky-300' },
                  { key: 'personalLeave', label: 'ลากิจ', cardClass: 'bg-cyan-50 dark:bg-cyan-900/20 border-cyan-200 dark:border-cyan-700/50', labelClass: 'text-cyan-600 dark:text-cyan-400', valueClass: 'text-cyan-700 dark:text-cyan-300' },
                  { key: 'absent', label: 'ขาด', cardClass: 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-700/50', labelClass: 'text-red-600 dark:text-red-400', valueClass: 'text-red-700 dark:text-red-300' },
                  { key: 'officialTravel', label: 'ไปราชการ', cardClass: 'bg-purple-50 dark:bg-purple-900/20 border-purple-200 dark:border-purple-700/50', labelClass: 'text-purple-600 dark:text-purple-400', valueClass: 'text-purple-700 dark:text-purple-300' },
                  { key: 'noCheckout', label: 'ไม่ลงเวลาออก', cardClass: 'bg-orange-50 dark:bg-orange-900/20 border-orange-200 dark:border-orange-700/50', labelClass: 'text-orange-600 dark:text-orange-400', valueClass: 'text-orange-700 dark:text-orange-300' },
                ] as const).map(({ key, label, cardClass, labelClass, valueClass }) => {
                  const total = filteredData.reduce((sum, item) => sum + (item[key] as number), 0);
                  const hasDetail = filteredData.some(item => item.details[key as keyof TeacherStats["details"]]?.length > 0);
                  return (
                    <button
                      type="button"
                      key={key}
                      onClick={() => openAggregateDetail(key as keyof TeacherStats["details"], label)}
                      disabled={!hasDetail}
                      title={hasDetail ? "คลิกเพื่อดูรายละเอียดวันที่" : undefined}
                      className={`text-left border rounded-xl p-4 transition-transform ${cardClass} ${hasDetail ? 'hover:scale-[1.02] cursor-pointer' : 'cursor-default'}`}
                    >
                      <div className={`text-sm font-medium mb-1 ${labelClass}`}>{label}</div>
                      <div className={`text-2xl font-bold ${valueClass}`}>{total}</div>
                    </button>
                  );
                })}
              </div>
            </>
          )}

          {/* Table */}
          <div className="bg-white dark:bg-[#2a2b2f] rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full min-w-max text-left border-collapse">
                <thead>
                  <tr className="bg-gray-50 dark:bg-[#323338] border-b border-gray-200 dark:border-gray-700">
                    <th className="px-6 py-4 text-sm font-semibold text-gray-600 dark:text-gray-300 text-center">ลำดับ</th>
                    <th className="px-6 py-4 text-sm font-semibold text-gray-600 dark:text-gray-300">รหัสครู</th>
                    <th className="px-6 py-4 text-sm font-semibold text-gray-600 dark:text-gray-300 min-w-[320px] whitespace-nowrap">ชื่อ - นามสกุล</th>
                    <th className="px-6 py-4 text-sm font-semibold text-center text-green-600 dark:text-green-400">มา (ปกติ)</th>
                    <th className="px-6 py-4 text-sm font-semibold text-center text-yellow-600 dark:text-yellow-400">สาย</th>
                    <th className="px-6 py-4 text-sm font-semibold text-center text-sky-600 dark:text-sky-400">ลาป่วย</th>
                    <th className="px-6 py-4 text-sm font-semibold text-center text-cyan-600 dark:text-cyan-400">ลากิจ</th>
                    <th className="px-6 py-4 text-sm font-semibold text-center text-red-600 dark:text-red-400">ขาด</th>
                    <th className="px-6 py-4 text-sm font-semibold text-center text-purple-600 dark:text-purple-400">ไปราชการ</th>
                    <th className="px-6 py-4 text-sm font-semibold text-center text-orange-600 dark:text-orange-400">ไม่ลงเวลาออก</th>
                    <th className="px-6 py-4 text-sm font-semibold text-gray-600 dark:text-gray-300 text-center">รวมวันทำการ</th>
                    <th className="px-6 py-4 text-sm font-semibold text-indigo-600 dark:text-indigo-400 text-center">ร้อยละ</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                  {loading ? (
                    [...Array(8)].map((_, i) => (
                      <tr key={`skeleton-${i}`}>
                        <td className="px-6 py-4 text-center"><div className="h-3.5 w-6 mx-auto rounded bg-gray-200 dark:bg-gray-700 animate-pulse"></div></td>
                        <td className="px-6 py-4"><div className="h-3.5 w-16 rounded bg-gray-200 dark:bg-gray-700 animate-pulse"></div></td>
                        <td className="px-6 py-4"><div className="h-3.5 w-36 rounded bg-gray-200 dark:bg-gray-700 animate-pulse"></div></td>
                        <td className="px-6 py-4 text-center"><div className="h-3.5 w-8 mx-auto rounded bg-gray-200 dark:bg-gray-700 animate-pulse"></div></td>
                        <td className="px-6 py-4 text-center"><div className="h-3.5 w-8 mx-auto rounded bg-gray-200 dark:bg-gray-700 animate-pulse"></div></td>
                        <td className="px-6 py-4 text-center"><div className="h-3.5 w-8 mx-auto rounded bg-gray-200 dark:bg-gray-700 animate-pulse"></div></td>
                        <td className="px-6 py-4 text-center"><div className="h-3.5 w-8 mx-auto rounded bg-gray-200 dark:bg-gray-700 animate-pulse"></div></td>
                        <td className="px-6 py-4 text-center"><div className="h-3.5 w-8 mx-auto rounded bg-gray-200 dark:bg-gray-700 animate-pulse"></div></td>
                        <td className="px-6 py-4 text-center"><div className="h-3.5 w-8 mx-auto rounded bg-gray-200 dark:bg-gray-700 animate-pulse"></div></td>
                        <td className="px-6 py-4 text-center"><div className="h-3.5 w-8 mx-auto rounded bg-gray-200 dark:bg-gray-700 animate-pulse"></div></td>
                        <td className="px-6 py-4 text-center"><div className="h-3.5 w-10 mx-auto rounded bg-gray-200 dark:bg-gray-700 animate-pulse"></div></td>
                        <td className="px-6 py-4 text-center"><div className="h-3.5 w-10 mx-auto rounded bg-gray-200 dark:bg-gray-700 animate-pulse"></div></td>
                      </tr>
                    ))
                  ) : filteredData.length === 0 ? (
                    <tr>
                      <td colSpan={12} className="px-6 py-8 text-center text-gray-500 dark:text-gray-400">
                        ไม่พบข้อมูลในช่วงเวลาที่เลือก
                      </td>
                    </tr>
                  ) : (
                    filteredData.map((record, index) => (
                      <tr key={record.id} className="hover:bg-gray-50 dark:hover:bg-[#323338]/50 transition-colors">
                        <td className="px-6 py-4 text-center text-sm text-gray-500 dark:text-gray-400 font-medium">
                          {index + 1}
                        </td>
                        <td className="px-6 py-4 text-sm text-gray-600 dark:text-gray-300 font-medium">
                          {record.teacherId || "-"}
                        </td>
                        <td className="px-6 py-4 min-w-[320px] whitespace-nowrap">
                          <div className="flex items-center gap-3 whitespace-nowrap">
                            <ProfileAvatar
                              src={record.profileUrl || defaultProfile}
                              alt={record.fullName}
                              className="w-10 h-10 border border-gray-200 dark:border-gray-600"
                              onError={(e) => { (e.target as HTMLImageElement).src = defaultProfile; }}
                            />
                            <span className="font-medium text-gray-900 dark:text-white whitespace-nowrap">{record.fullName}</span>
                          </div>
                        </td>
                        <td className="px-6 py-4 text-center font-medium text-green-600 dark:text-green-400">
                          <button
                            type="button"
                            disabled={record.details.present.length === 0}
                            onClick={() => openTeacherDetail(record.fullName, 'present', record.details.present, 'มา (ปกติ)')}
                            className={record.details.present.length > 0 ? "hover:underline cursor-pointer" : "cursor-default"}
                          >
                            {record.present}
                          </button>
                        </td>
                        <td className="px-6 py-4 text-center font-medium text-yellow-600 dark:text-yellow-400">
                          <button
                            type="button"
                            disabled={record.details.late.length === 0}
                            onClick={() => openTeacherDetail(record.fullName, 'late', record.details.late, 'สาย')}
                            className={record.details.late.length > 0 ? "hover:underline cursor-pointer" : "cursor-default"}
                          >
                            {record.late}
                          </button>
                        </td>
                        <td className="px-6 py-4 text-center font-medium text-sky-600 dark:text-sky-400">
                          <button
                            type="button"
                            disabled={record.details.sickLeave.length === 0}
                            onClick={() => openTeacherDetail(record.fullName, 'sickLeave', record.details.sickLeave, 'ลาป่วย')}
                            className={record.details.sickLeave.length > 0 ? "hover:underline cursor-pointer" : "cursor-default"}
                          >
                            {record.sickLeave}
                          </button>
                        </td>
                        <td className="px-6 py-4 text-center font-medium text-cyan-600 dark:text-cyan-400">
                          <button
                            type="button"
                            disabled={record.details.personalLeave.length === 0}
                            onClick={() => openTeacherDetail(record.fullName, 'personalLeave', record.details.personalLeave, 'ลากิจ')}
                            className={record.details.personalLeave.length > 0 ? "hover:underline cursor-pointer" : "cursor-default"}
                          >
                            {record.personalLeave}
                          </button>
                        </td>
                        <td className="px-6 py-4 text-center font-medium text-red-600 dark:text-red-400">
                          <button
                            type="button"
                            disabled={record.details.absent.length === 0}
                            onClick={() => openTeacherDetail(record.fullName, 'absent', record.details.absent, 'ขาด')}
                            className={record.details.absent.length > 0 ? "hover:underline cursor-pointer" : "cursor-default"}
                          >
                            {record.absent}
                          </button>
                        </td>
                        <td className="px-6 py-4 text-center font-medium text-purple-600 dark:text-purple-400">
                          <button
                            type="button"
                            disabled={record.details.officialTravel.length === 0}
                            onClick={() => openTeacherDetail(record.fullName, 'officialTravel', record.details.officialTravel, 'ไปราชการ')}
                            className={record.details.officialTravel.length > 0 ? "hover:underline cursor-pointer" : "cursor-default"}
                          >
                            {record.officialTravel}
                          </button>
                        </td>
                        <td className="px-6 py-4 text-center font-medium text-orange-600 dark:text-orange-400">
                          <button
                            type="button"
                            disabled={record.details.noCheckout.length === 0}
                            onClick={() => openTeacherDetail(record.fullName, 'noCheckout', record.details.noCheckout, 'ไม่ลงเวลาออก')}
                            className={record.details.noCheckout.length > 0 ? "hover:underline cursor-pointer" : "cursor-default"}
                          >
                            {record.noCheckout}
                          </button>
                        </td>
                        <td className="px-6 py-4 text-center text-gray-500 dark:text-gray-400">
                          {record.total}
                        </td>
                        <td className="px-6 py-4 text-center font-bold text-indigo-600 dark:text-indigo-400">
                          {record.percentage}%
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>

      {showPdfPreview && pdfDocProps && (
        <div
          className="fixed inset-0 top-[60px] z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
          onClick={() => setShowPdfPreview(false)}
        >
          <div
            className="flex h-[calc(100vh-100px)] w-full max-w-5xl flex-col rounded-2xl bg-white shadow-2xl dark:bg-[#1e1f21]"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-gray-200 px-5 py-4 dark:border-white/10">
              <h2 className="text-base font-bold text-gray-900 dark:text-white">
                ตัวอย่างเอกสาร — สรุปการลงเวลาครู
              </h2>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleDownloadPdf}
                  disabled={isDownloadingPdf}
                  className="inline-flex h-9 items-center justify-center gap-2 rounded-lg bg-emerald-500 px-4 text-sm font-bold text-white shadow-sm transition hover:bg-emerald-600 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {isDownloadingPdf ? <FaSpinner className="animate-spin" /> : <FaFilePdf />}
                  {isDownloadingPdf ? "กำลังบันทึก..." : "ดาวน์โหลด"}
                </button>
                <button
                  type="button"
                  onClick={() => setShowPdfPreview(false)}
                  className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-gray-500 transition hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-white/10"
                  title="ปิด"
                >
                  <FaTimes size={18} />
                </button>
              </div>
            </div>
            <div className="flex-1 overflow-hidden rounded-b-2xl bg-gray-100 dark:bg-gray-900">
              <PDFViewer width="100%" height="100%" className="h-full w-full border-none" showToolbar={true}>
                <TeacherAttendancePdfDocument {...pdfDocProps} />
              </PDFViewer>
            </div>
          </div>
        </div>
      )}

      {detailModal && (
        <div
          className="fixed inset-0 top-[60px] z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
          onClick={() => setDetailModal(null)}
        >
          <div
            className="flex max-h-[calc(100vh-100px)] w-full max-w-lg flex-col rounded-2xl bg-white shadow-2xl dark:bg-[#1e1f21]"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-gray-200 px-5 py-4 dark:border-white/10">
              <h2 className="text-base font-bold text-gray-900 dark:text-white truncate pr-4">{detailModal.title}</h2>
              <button
                type="button"
                onClick={() => setDetailModal(null)}
                className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-gray-500 transition hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-white/10"
                title="ปิด"
              >
                <FaTimes size={18} />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto px-5 py-3">
              <ul className="divide-y divide-gray-100 dark:divide-gray-800">
                {[...detailModal.entries]
                  .sort((a, b) => a.date.localeCompare(b.date))
                  .map((entry, idx) => (
                    <li key={`${entry.date}-${entry.teacherName || ''}-${idx}`} className="py-2.5 flex items-center justify-between gap-3 text-sm">
                      <span className="text-gray-700 dark:text-gray-300">{formatDetailDate(entry.date)}</span>
                      <span className="text-right">
                        {entry.teacherName && <span className="font-medium text-gray-900 dark:text-white mr-2">{entry.teacherName}</span>}
                        {entry.label && <span className="text-xs text-gray-400 dark:text-gray-500">{entry.label}</span>}
                      </span>
                    </li>
                  ))}
              </ul>
            </div>
            <div className="border-t border-gray-100 dark:border-gray-800 px-5 py-3 text-xs text-gray-400 dark:text-gray-500">
              ทั้งหมด {detailModal.entries.length} รายการ
            </div>
          </div>
        </div>
      )}
    </MainLayout>
  );
};

export default TeacherAttendanceSummaryPage;
