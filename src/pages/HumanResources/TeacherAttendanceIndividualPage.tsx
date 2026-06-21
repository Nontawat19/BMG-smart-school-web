import React, { useState, useEffect, useMemo } from "react";
import { useSelector } from "react-redux";
import { firestore } from "@/firebase";
import { collection, query, where, getDocs, doc, getDoc, documentId } from "firebase/firestore";
import { RootState } from "../../store";
import { FaUserCheck, FaSearch, FaCalendarAlt, FaFilePdf, FaAngleLeft, FaAngleRight, FaAngleDoubleLeft, FaAngleDoubleRight, FaClock } from "react-icons/fa";
import { Document, Font, Image, Page, StyleSheet, Text, View, pdf } from "@react-pdf/renderer";
import { saveAs } from "file-saver";
import Swal from "sweetalert2";
import defaultProfile from "@/assets/profile.png";
import MainLayout from "@/layouts/MainLayout";
import BackButton from "@/components/Shared/BackButton";
import Select from "react-select";
import { useTheme } from "@/ThemeContext";
import { getCurrentAcademicYear } from "@/utils/academicYearUtils";

// Register TH Sarabun Font for PDF
Font.register({
  family: "TH Sarabun PSK",
  fonts: [
    { src: "/fonts/THSarabunNew.ttf" },
    { src: "/fonts/THSarabunNew-Bold.ttf", fontWeight: "bold" }
  ]
});

// PDF Styles
const pdfStyles = StyleSheet.create({
  page: {
    paddingTop: 30,
    paddingRight: 40,
    paddingBottom: 40,
    paddingLeft: 40,
    fontFamily: "TH Sarabun PSK",
    fontSize: 14,
    color: "#000"
  },
  topHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-end",
    borderBottomWidth: 1.5,
    borderBottomColor: "#000",
    paddingBottom: 4,
    marginBottom: 10
  },
  topHeaderLeftContainer: {
    flexDirection: "row",
    alignItems: "center"
  },
  topHeaderLogo: {
    width: 22,
    height: 22,
    marginRight: 6
  },
  topHeaderLeft: {
    fontSize: 12,
    fontWeight: "bold"
  },
  topHeaderRight: {
    fontSize: 12,
    fontWeight: "bold"
  },
  mainTitle: {
    fontSize: 15,
    fontWeight: "bold",
    textAlign: "center",
    marginTop: 4,
    marginBottom: 8
  },
  profileSection: {
    flexDirection: "row",
    marginBottom: 10,
    alignItems: "flex-start"
  },
  profilePhotoBox: {
    width: 75,
    height: 90,
    borderWidth: 1,
    borderColor: "#000",
    marginRight: 15,
    backgroundColor: "#fff"
  },
  profilePhoto: {
    width: "100%",
    height: "100%",
    objectFit: "cover"
  },
  profileDetails: {
    flex: 1,
    justifyContent: "flex-start",
    paddingTop: 2
  },
  profileRow: {
    flexDirection: "row",
    marginBottom: 4,
    fontSize: 13,
    lineHeight: 1.2
  },
  profileLabel: {
    fontWeight: "bold",
    width: 80
  },
  profileValue: {
    flex: 1
  },
  sectionTitleCenter: {
    fontSize: 12,
    fontWeight: "bold",
    textAlign: "center",
    marginBottom: 4,
    marginTop: 4
  },
  sectionTitleLeft: {
    fontSize: 12,
    fontWeight: "bold",
    textAlign: "left",
    marginBottom: 4,
    marginTop: 8
  },
  table: {
    borderWidth: 1,
    borderColor: "#000",
    width: "100%",
    marginBottom: 6
  },
  row: {
    flexDirection: "row"
  },
  tableHeaderRow: {
    flexDirection: "row",
    height: 24
  },
  tableDataRow: {
    flexDirection: "row",
    height: 21
  },
  firstPageTableHeaderRow: {
    flexDirection: "row",
    height: 24
  },
  firstPageTableDataRow: {
    flexDirection: "row",
    height: 21
  },
  th: {
    borderRightWidth: 1,
    borderBottomWidth: 1,
    borderColor: "#000",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#f2f2f2",
    paddingVertical: 3
  },
  td: {
    borderRightWidth: 1,
    borderBottomWidth: 1,
    borderColor: "#000",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 2
  },
  lastCol: {
    borderRightWidth: 0
  },
  lastRowCell: {
    borderBottomWidth: 0
  },
  headerText: {
    fontSize: 11,
    fontWeight: "bold",
    textAlign: "center"
  },
  cellText: {
    fontSize: 11,
    textAlign: "center"
  },
  footerSignatures: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: 20,
    fontSize: 12
  },
  signBox: {
    width: "45%",
    alignItems: "center"
  },
  signName: {
    marginTop: 15,
    marginBottom: 2
  },
  pageNumber: {
    position: "absolute",
    right: 40,
    bottom: 20,
    fontSize: 10
  }
});

const PDF_RECORDS_PER_PAGE = 25;

interface Teacher {
  id: string;
  teacherId?: string;
  title?: string;
  firstName: string;
  lastName: string;
  profileImageUrl?: string;
  position?: string;
  role?: string | string[];
  fullName: string;
  learningArea?: string;
  subjectGroup?: string;
  department?: string;
}

const getTeacherPosition = (teacherData: any, userData?: any) => {
  const teacherPosition =
    teacherData?.position ||
    teacherData?.jobPosition ||
    teacherData?.workPosition ||
    "";

  if (teacherPosition) return teacherPosition;

  const userPosition =
    userData?.position ||
    userData?.jobPosition ||
    userData?.workPosition ||
    "";

  if (userPosition) return userPosition;

  return "ครู";
};

interface DailyRecord {
  date: string;
  formattedDate: string;
  checkInTime?: string;
  checkOutTime?: string;
  status: "Normal" | "Late" | "Leave" | "Absent" | "OfficialTravel" | "NoCheckout";
  statusThai: string;
  note?: string;
  lateMinutes?: string;
}

// Individual PDF Report Component
interface PDFProps {
  records: DailyRecord[];
  teacher: Teacher;
  stats: {
    present: number;
    late: number;
    leave: number;
    leaveSick: number;
    leavePersonal: number;
    leaveOther: number;
    absent: number;
    noCheckout: number;
    officialTravel: number;
    total: number;
    percentage: string;
  };
  schoolName: string;
  schoolAffiliation: string;
  schoolLogo?: string;
  teacherProfileImage?: string;
  directorName: string;
  personnelHeadName?: string;
  dateText: string;
  reportPrintedAt: string;
  academicYearTerm: string;
}

const IndividualAttendancePdfDocument: React.FC<PDFProps> = ({
  records,
  teacher,
  stats,
  schoolName,
  schoolAffiliation,
  schoolLogo,
  teacherProfileImage,
  directorName,
  personnelHeadName,
  dateText,
  reportPrintedAt,
  academicYearTerm
}) => {
  const chunks: DailyRecord[][] = records.length > 0
    ? Array.from(
      { length: Math.ceil(records.length / PDF_RECORDS_PER_PAGE) },
      (_, index) => records.slice(index * PDF_RECORDS_PER_PAGE, (index + 1) * PDF_RECORDS_PER_PAGE)
    )
    : [[]];

  const getStatusText = (status: string, note?: string) => {
    switch (status) {
      case "Normal": return "ปกติ";
      case "Late": return "สาย";
      case "Leave": return note || "ลา";
      case "Absent": return "ขาด";
      case "OfficialTravel": return "ไปราชการ";
      case "NoCheckout": return "ไม่ลงเวลากลับ";
      default: return "-";
    }
  };

  return (
    <Document>
      {chunks.map((chunk, pageIndex) => (
        <Page key={pageIndex} size="A4" style={pdfStyles.page}>
          {/* Header */}
          <View style={pdfStyles.topHeader}>
            <View style={pdfStyles.topHeaderLeftContainer}>
              {schoolLogo ? (
                <Image src={schoolLogo} style={pdfStyles.topHeaderLogo} />
              ) : null}
              <Text style={pdfStyles.topHeaderLeft}>{schoolName}</Text>
            </View>
            <Text style={pdfStyles.topHeaderRight}>รายงานบันทึกเข้า-ออก</Text>
          </View>

          {/* Main Centered Title */}
          <Text style={pdfStyles.mainTitle}>รายงานบันทึกเข้า-ออก บุคลากร</Text>

          {/* Profile Card (First page only) */}
          {pageIndex === 0 && (
            <View style={pdfStyles.profileSection}>
              {/* Profile image box */}
              <View style={pdfStyles.profilePhotoBox}>
                {teacherProfileImage ? (
                  <Image src={teacherProfileImage} style={pdfStyles.profilePhoto} />
                ) : null}
              </View>

              {/* Profile Details text list */}
              <View style={pdfStyles.profileDetails}>
                <View style={pdfStyles.profileRow}>
                  <Text style={pdfStyles.profileLabel}>ชื่อ-นามสกุล</Text>
                  <Text style={pdfStyles.profileValue}>{teacher.fullName}</Text>
                </View>
                <View style={pdfStyles.profileRow}>
                  <Text style={pdfStyles.profileLabel}>ตำแหน่ง</Text>
                  <Text style={pdfStyles.profileValue}>{teacher.position || "-"}</Text>
                </View>
                <View style={pdfStyles.profileRow}>
                  <Text style={pdfStyles.profileLabel}>รหัสบุคลากร</Text>
                  <Text style={pdfStyles.profileValue}>{teacher.teacherId || "-"}</Text>
                </View>
                <View style={pdfStyles.profileRow}>
                  <Text style={pdfStyles.profileLabel}>ปีการศึกษา</Text>
                  <Text style={pdfStyles.profileValue}>{academicYearTerm}</Text>
                </View>
              </View>
            </View>
          )}

          {/* Table 1 Subtitle */}
          <Text style={pdfStyles.sectionTitleCenter}>ผลการค้นหาช่วงระหว่างวันที่ {dateText}</Text>

          {/* Table 1: Detailed Ledger Table */}
          <View style={pdfStyles.table}>
            {/* Table 1 Headers */}
            <View style={pageIndex === 0 ? pdfStyles.firstPageTableHeaderRow : pdfStyles.tableHeaderRow} wrap={false}>
              <View style={[pdfStyles.th, { width: "8%" }]}><Text style={pdfStyles.headerText}>ลำดับที่</Text></View>
              <View style={[pdfStyles.th, { width: "27%" }]}><Text style={pdfStyles.headerText}>วันที่</Text></View>
              <View style={[pdfStyles.th, { width: "20%" }]}><Text style={pdfStyles.headerText}>เวลามา</Text></View>
              <View style={[pdfStyles.th, { width: "20%" }]}><Text style={pdfStyles.headerText}>เวลากลับ</Text></View>
              <View style={[pdfStyles.th, { width: "10%" }]}><Text style={pdfStyles.headerText}>สาย(นาที)</Text></View>
              <View style={[pdfStyles.th, { width: "15%", borderRightWidth: 0 }]}><Text style={pdfStyles.headerText}>หมายเหตุ</Text></View>
            </View>

            {/* Table 1 Rows */}
            {chunk.map((rec, rowIndex) => {
              const recordIndex = pageIndex * PDF_RECORDS_PER_PAGE + rowIndex + 1;
              const isLastRow = rowIndex === chunk.length - 1;
              return (
                <View key={rec.date} style={pageIndex === 0 ? pdfStyles.firstPageTableDataRow : pdfStyles.tableDataRow} wrap={false}>
                  <View style={[pdfStyles.td, { width: "8%" }, isLastRow ? pdfStyles.lastRowCell : {}]}>
                    <Text style={pdfStyles.cellText}>{recordIndex}</Text>
                  </View>
                  <View style={[pdfStyles.td, { width: "27%" }, isLastRow ? pdfStyles.lastRowCell : {}]}>
                    <Text style={pdfStyles.cellText}>{rec.formattedDate}</Text>
                  </View>
                  <View style={[pdfStyles.td, { width: "20%" }, isLastRow ? pdfStyles.lastRowCell : {}]}>
                    <Text style={pdfStyles.cellText}>{rec.checkInTime ? `${rec.checkInTime}` : "-"}</Text>
                  </View>
                  <View style={[pdfStyles.td, { width: "20%" }, isLastRow ? pdfStyles.lastRowCell : {}]}>
                    <Text style={pdfStyles.cellText}>{rec.checkOutTime ? `${rec.checkOutTime}` : "-"}</Text>
                  </View>
                  <View style={[pdfStyles.td, { width: "10%" }, isLastRow ? pdfStyles.lastRowCell : {}]}>
                    <Text style={pdfStyles.cellText}>{rec.lateMinutes || "-"}</Text>
                  </View>
                  <View style={[pdfStyles.td, { width: "15%", borderRightWidth: 0 }, isLastRow ? pdfStyles.lastRowCell : {}]}>
                    <Text style={pdfStyles.cellText}>{getStatusText(rec.status, rec.note)}</Text>
                  </View>
                </View>
              );
            })}
          </View>

          {/* Table 2: Statistical Summary (Only on the last page) */}
          {pageIndex === chunks.length - 1 && (
            <>
              <Text style={pdfStyles.sectionTitleLeft}>สรุปรายงานช่วงระหว่างวันที่ {dateText}</Text>
              <View style={pdfStyles.table}>
                {/* Table 2 Headers */}
                <View style={pdfStyles.row}>
                  <View style={[pdfStyles.th, { width: "12%" }]}><Text style={pdfStyles.headerText}>จำนวนวันทั้งหมด</Text></View>
                  <View style={[pdfStyles.th, { width: "15%" }]}><Text style={pdfStyles.headerText}>จำนวนวันที่สแกนเข้า</Text></View>
                  <View style={[pdfStyles.th, { width: "16%" }]}><Text style={pdfStyles.headerText}>จำนวนวันที่ไม่สแกนเข้า</Text></View>
                  <View style={[pdfStyles.th, { width: "11%" }]}><Text style={pdfStyles.headerText}>จำนวนวันที่สาย</Text></View>
                  <View style={[pdfStyles.th, { width: "12%" }]}><Text style={pdfStyles.headerText}>จำนวนวันที่ลาป่วย</Text></View>
                  <View style={[pdfStyles.th, { width: "12%" }]}><Text style={pdfStyles.headerText}>จำนวนวันที่ลากิจ</Text></View>
                  <View style={[pdfStyles.th, { width: "14%" }]}><Text style={pdfStyles.headerText}>จำนวนวันที่ลาราชการ</Text></View>
                  <View style={[pdfStyles.th, { width: "8%", borderRightWidth: 0 }]}><Text style={pdfStyles.headerText}>อื่นๆ</Text></View>
                </View>
                {/* Table 2 Row values */}
                <View style={pdfStyles.row}>
                  <View style={[pdfStyles.td, { width: "12%", borderBottomWidth: 0 }]}><Text style={pdfStyles.cellText}>{stats.total}</Text></View>
                  <View style={[pdfStyles.td, { width: "15%", borderBottomWidth: 0 }]}><Text style={pdfStyles.cellText}>{stats.present + stats.late + stats.noCheckout}</Text></View>
                  <View style={[pdfStyles.td, { width: "16%", borderBottomWidth: 0 }]}><Text style={pdfStyles.cellText}>{stats.absent}</Text></View>
                  <View style={[pdfStyles.td, { width: "11%", borderBottomWidth: 0 }]}><Text style={pdfStyles.cellText}>{stats.late}</Text></View>
                  <View style={[pdfStyles.td, { width: "12%", borderBottomWidth: 0 }]}><Text style={pdfStyles.cellText}>{stats.leaveSick}</Text></View>
                  <View style={[pdfStyles.td, { width: "12%", borderBottomWidth: 0 }]}><Text style={pdfStyles.cellText}>{stats.leavePersonal}</Text></View>
                  <View style={[pdfStyles.td, { width: "14%", borderBottomWidth: 0 }]}><Text style={pdfStyles.cellText}>{stats.officialTravel}</Text></View>
                  <View style={[pdfStyles.td, { width: "8%", borderRightWidth: 0, borderBottomWidth: 0 }]}><Text style={pdfStyles.cellText}>{stats.leaveOther + stats.noCheckout}</Text></View>
                </View>
              </View>
            </>
          )}

          {/* Footer Signatures (Only on the last page) */}
          {pageIndex === chunks.length - 1 && (
            <View style={pdfStyles.footerSignatures}>
              <View style={pdfStyles.signBox}>
                <Text>ลงชื่อ..................................................ผู้เสนอรายงาน</Text>
                <Text style={pdfStyles.signName}>({personnelHeadName || ".................................................."})</Text>
                <Text>ตำแหน่ง หัวหน้าฝ่ายบริหารงานบุคคล</Text>
              </View>
              <View style={pdfStyles.signBox}>
                <Text>ลงชื่อ..................................................ผู้รับรองรายงาน</Text>
                <Text style={pdfStyles.signName}>({directorName || ".................................................."})</Text>
                <Text>ตำแหน่ง ผู้อำนวยการโรงเรียน</Text>
              </View>
            </View>
          )}

          <Text style={pdfStyles.pageNumber}>หน้า {pageIndex + 1} / {chunks.length}</Text>
        </Page>
      ))}
    </Document>
  );
};

const TeacherAttendanceIndividualPage: React.FC = () => {
  const { isDarkMode } = useTheme();
  const { user: currentUser } = useSelector((state: RootState) => state.auth);
  const schoolId = currentUser?.schoolId;

  // Teachers State
  const [teachers, setTeachers] = useState<Teacher[]>([]);
  const [selectedTeacherId, setSelectedTeacherId] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const [fetchingTeachers, setFetchingTeachers] = useState(true);

  // Filters State
  const [filterRange, setFilterRange] = useState<"today" | "daily" | "thisMonth" | "lastMonth" | "term1" | "term2" | "custom">("thisMonth");
  const [startDate, setStartDate] = useState<string>("");
  const [endDate, setEndDate] = useState<string>("");

  // Academic Settings & Calendar Holidays
  const [academicYear, setAcademicYear] = useState<string>("");
  const [teacherLateTime, setTeacherLateTime] = useState<string>("08:40");
  const [terms, setTerms] = useState({
    term1: { start: "", end: "" },
    term2: { start: "", end: "" }
  });
  const [calendarEvents, setCalendarEvents] = useState<Record<string, any>>({});

  // Ledger Data
  const [ledgerData, setLedgerData] = useState<DailyRecord[]>([]);

  // Pagination
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 20;

  // Format Helper for React-Select Option
  const teacherOptions = useMemo(() => {
    return teachers.map((teacher) => ({
      value: teacher.id,
      label: `[${teacher.teacherId || "ไม่มีรหัส"}] ${teacher.fullName}`,
      teacher
    }));
  }, [teachers]);

  const selectedTeacher = useMemo(() => {
    return teachers.find(t => t.id === selectedTeacherId) || null;
  }, [teachers, selectedTeacherId]);

  // Fetch all teachers in the school
  useEffect(() => {
    const fetchTeachersList = async () => {
      if (!schoolId) return;
      setFetchingTeachers(true);
      try {
        const q = query(
          collection(firestore, "school-settings", schoolId, "teachers"),
          where("status", "==", "อยู่")
        );
        const snap = await getDocs(q);
        const list = await Promise.all(snap.docs.map(async (docSnap) => {
          const data = docSnap.data();
          let userData: any = null;
          try {
            const userSnap = await getDoc(doc(firestore, "users", data.uid || docSnap.id));
            userData = userSnap.exists() ? userSnap.data() : null;
          } catch (error) {
            console.warn("Error fetching linked user for teacher position:", error);
          }

          const fullName = `${data.title || ''}${data.firstName || ''} ${data.lastName || ''}`.trim();
          return {
            id: docSnap.id,
            fullName,
            teacherId: data.teacherId || userData?.teacherId || "",
            title: data.title || userData?.title || "",
            firstName: data.firstName || userData?.firstName || "",
            lastName: data.lastName || userData?.lastName || "",
            profileImageUrl: data.profileImageUrl || userData?.profileImageUrl || userData?.profileUrl || "",
            role: userData?.role || data.role || [],
            position: getTeacherPosition(data, userData),
            learningArea: data.learningArea || data.subjectGroup || userData?.learningArea || userData?.subjectGroup || "",
            subjectGroup: data.subjectGroup || data.learningArea || userData?.subjectGroup || userData?.learningArea || "",
            department: data.department || userData?.department || ""
          } as Teacher;
        }));

        // Sort by subject group (กลุ่มสาระ - learningArea/subjectGroup), then alphabetically by first name
        list.sort((a, b) => {
          const groupA = a.learningArea || a.subjectGroup || "";
          const groupB = b.learningArea || b.subjectGroup || "";

          // Put empty groups at the bottom
          if (groupA === "" && groupB !== "") return 1;
          if (groupA !== "" && groupB === "") return -1;

          const groupCompare = groupA.localeCompare(groupB, "th");
          if (groupCompare !== 0) return groupCompare;
          return a.firstName.localeCompare(b.firstName, "th");
        });

        setTeachers(list);

        // Pre-select first teacher if available
        if (list.length > 0) {
          setSelectedTeacherId(list[0].id);
        }
      } catch (err) {
        console.error("Error fetching teachers:", err);
      } finally {
        setFetchingTeachers(false);
      }
    };
    fetchTeachersList();
  }, [schoolId]);

  // Fetch Academic Calendar & Holidays
  useEffect(() => {
    const fetchCalendarAndTerms = async () => {
      if (!schoolId) return;
      try {
        // Terms & Academic Year
        const acadData = await getCurrentAcademicYear(firestore, schoolId);
        setAcademicYear(acadData.academicYear);
        setTerms({
          term1: { start: acadData.terms.term1?.startDate || "", end: acadData.terms.term1?.endDate || "" },
          term2: { start: acadData.terms.term2?.startDate || "", end: acadData.terms.term2?.endDate || "" }
        });

        // Load teacher late time threshold from config
        const schoolDoc = await getDoc(doc(firestore, "school-settings", schoolId));
        if (schoolDoc.exists()) {
          const data = schoolDoc.data();
          if (data.attendanceConfig?.teacherLateTime) {
            setTeacherLateTime(data.attendanceConfig.teacherLateTime);
          }
        }

        // Holidays
        const calendarRef = doc(firestore, "school-settings", schoolId, "main_calendar", "default");
        const calendarSnap = await getDoc(calendarRef);
        if (calendarSnap.exists()) {
          setCalendarEvents(calendarSnap.data().events || {});
        }
      } catch (err) {
        console.warn("Error fetching calendar data:", err);
      }
    };
    fetchCalendarAndTerms();
  }, [schoolId]);

  // Quick range dates calculations
  useEffect(() => {
    const today = new Date();
    // Use local timezone formatting instead of UTC to avoid date shifting
    const todayStr = new Date(today.getTime() - today.getTimezoneOffset() * 60000).toISOString().split("T")[0];

    if (filterRange === "today") {
      setStartDate(todayStr);
      setEndDate(todayStr);
    } else if (filterRange === "daily") {
      const targetDate = startDate === endDate ? (startDate || todayStr) : todayStr;
      setStartDate(targetDate);
      setEndDate(targetDate);
    } else if (filterRange === "thisMonth") {
      const start = new Date(today.getFullYear(), today.getMonth(), 1);
      const end = new Date(today.getFullYear(), today.getMonth() + 1, 0);
      setStartDate(start.toISOString().split("T")[0]);
      setEndDate(end.toISOString().split("T")[0]);
    } else if (filterRange === "lastMonth") {
      const start = new Date(today.getFullYear(), today.getMonth() - 1, 1);
      const end = new Date(today.getFullYear(), today.getMonth(), 0);
      setStartDate(start.toISOString().split("T")[0]);
      setEndDate(end.toISOString().split("T")[0]);
    } else if (filterRange === "term1") {
      if (terms.term1.start && terms.term1.end) {
        setStartDate(terms.term1.start);
        setEndDate(terms.term1.end);
      } else {
        // Fallback
        setStartDate(`${today.getFullYear()}-05-15`);
        setEndDate(`${today.getFullYear()}-10-15`);
      }
    } else if (filterRange === "term2") {
      if (terms.term2.start && terms.term2.end) {
        setStartDate(terms.term2.start);
        setEndDate(terms.term2.end);
      } else {
        // Fallback
        setStartDate(`${today.getFullYear()}-11-01`);
        setEndDate(`${today.getFullYear() + 1}-03-15`);
      }
    }
  }, [filterRange, terms]);

  // Determine if a date is a school working day
  const isSchoolWorkingDay = (dateStr: string) => {
    const event = calendarEvents[dateStr];
    const d = new Date(dateStr);
    const dayOfWeek = d.getUTCDay();

    // Weekend check
    if (dayOfWeek === 0 || dayOfWeek === 6) {
      if (event?.type === "schoolDay") return true;
      return false; // Weekend and no school override
    }

    // Holiday check
    if (event) {
      if (event.type === "holiday" || event.type === "specialHoliday") return false;
    }

    return true;
  };

  // Query and compute attendance logs
  const fetchIndividualAttendance = async () => {
    if (!schoolId || !selectedTeacherId || !startDate || !endDate) return;
    setLoading(true);
    try {
      // Fetch teacher attendance collection sub-collection
      const ref = collection(firestore, "school-settings", schoolId, "teachers", selectedTeacherId, "attendance");
      const q = query(ref, where(documentId(), ">=", startDate), where(documentId(), "<=", endDate));
      const snap = await getDocs(q);

      const rawRecords: Record<string, any> = {};
      snap.docs.forEach(doc => {
        rawRecords[doc.id] = doc.data();
      });

      // Construct dates in range
      const list: DailyRecord[] = [];
      const cur = new Date(startDate);
      const last = new Date(endDate);

      while (cur <= last) {
        const dateStr = cur.toISOString().split("T")[0];
        const isWorking = isSchoolWorkingDay(dateStr);

        if (isWorking) {
          const raw = rawRecords[dateStr];
          let checkInTime = undefined;
          let checkOutTime = undefined;
          let status: DailyRecord["status"] = "Absent";
          let statusThai = "ขาด";
          let note = "";
          let lateMinutes = "";

          if (raw) {
            let checkinDate: Date | null = null;
            if (raw.checkinTime?.toDate) {
              const d = raw.checkinTime.toDate();
              checkinDate = d;
              checkInTime = d.toLocaleTimeString("th-TH", { hour: "2-digit", minute: "2-digit" });
            }
            if (raw.checkoutTime?.toDate) {
              checkOutTime = raw.checkoutTime.toDate().toLocaleTimeString("th-TH", { hour: "2-digit", minute: "2-digit" });
            }

            // Map status
            const s = raw.status;
            if (s === "สาย" || s === "Late") {
              status = "Late";
              statusThai = "สาย";
            } else if (s === "ลา" || s === "ล" || s === "Leave") {
              status = "Leave";
              statusThai = "ลา";
              note = raw.leaveType || "ลากิจ/ลาป่วย";
            } else if (s === "ไปราชการ" || s === "OfficialTravel" || s === "officialTravel") {
              status = "OfficialTravel";
              statusThai = "ไปราชการ";
              note = raw.travelLocation || "ปฏิบัติงานนอกสถานที่";
            } else if (s === "ไม่ลงเวลาออก" || s === "NoCheckout") {
              status = "NoCheckout";
              statusThai = "ไม่ลงเวลากลับ";
            } else if (s === "มา" || s === "OnTime" || s === "Normal" || s === "กลับก่อน") {
              status = "Normal";
              statusThai = "ปกติ";
            }

            // Calculate dynamic late minutes if checkinTime is after teacherLateTime threshold
            if (checkinDate) {
              const [lateHour, lateMinute] = teacherLateTime.split(":").map(Number);
              const checkinHour = checkinDate.getHours();
              const checkinMin = checkinDate.getMinutes();

              const thresholdMin = lateHour * 60 + lateMinute;
              const checkinTotalMin = checkinHour * 60 + checkinMin;

              if (checkinTotalMin > thresholdMin) {
                const diff = checkinTotalMin - thresholdMin;
                lateMinutes = String(diff);
                if (status === "Normal") {
                  status = "Late";
                  statusThai = "สาย";
                }
              }
            }
          }

          // Format Date to Thai Ledger
          const thaiDateText = cur.toLocaleDateString("th-TH", {
            weekday: "long",
            day: "numeric",
            month: "long",
            year: "numeric"
          });

          list.push({
            date: dateStr,
            formattedDate: thaiDateText,
            checkInTime,
            checkOutTime,
            status,
            statusThai,
            note,
            lateMinutes
          });
        }

        // Increment day
        cur.setDate(cur.getDate() + 1);
      }

      // Sort descending by date (newest first) for visual feed
      list.sort((a, b) => b.date.localeCompare(a.date));
      setLedgerData(list);
      setCurrentPage(1);
    } catch (err) {
      console.error("Error calculating individual stats:", err);
      Swal.fire("ข้อผิดพลาด", "ไม่สามารถคำนวณข้อมูลสถิติได้", "error");
    } finally {
      setLoading(false);
    }
  };

  // Re-fetch when selector, range filters, or bounds change
  useEffect(() => {
    if (selectedTeacherId && startDate && endDate) {
      fetchIndividualAttendance();
    }
  }, [selectedTeacherId, startDate, endDate]);

  // Compute Statistics
  const computedStats = useMemo(() => {
    let present = 0;
    let late = 0;
    let leave = 0;
    let leaveSick = 0;
    let leavePersonal = 0;
    let leaveOther = 0;
    let absent = 0;
    let noCheckout = 0;
    let officialTravel = 0;

    ledgerData.forEach(r => {
      if (r.status === "Normal") present++;
      else if (r.status === "Late") late++;
      else if (r.status === "Leave") {
        leave++;
        const noteText = r.note || "";
        if (noteText.includes("ป่วย")) {
          leaveSick++;
        } else if (noteText.includes("กิจ")) {
          leavePersonal++;
        } else {
          leaveOther++;
        }
      }
      else if (r.status === "Absent") absent++;
      else if (r.status === "NoCheckout") noCheckout++;
      else if (r.status === "OfficialTravel") officialTravel++;
    });

    const total = ledgerData.length;
    const attended = present + late + noCheckout + officialTravel;
    const percentage = total > 0 ? ((attended / total) * 100).toFixed(2) : "0.00";

    return {
      present,
      late,
      leave,
      leaveSick,
      leavePersonal,
      leaveOther,
      absent,
      noCheckout,
      officialTravel,
      total,
      percentage
    };
  }, [ledgerData]);

  // Pagination calculation
  const totalPages = Math.ceil(ledgerData.length / itemsPerPage);
  const paginatedData = useMemo(() => {
    return ledgerData.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);
  }, [ledgerData, currentPage]);

  const getPageNumbers = () => {
    const pages = [];
    const maxVisible = 5;
    let start = Math.max(1, currentPage - Math.floor(maxVisible / 2));
    let end = Math.min(totalPages, start + maxVisible - 1);

    if (end - start + 1 < maxVisible) {
      start = Math.max(1, end - maxVisible + 1);
    }
    for (let i = start; i <= end; i++) pages.push(i);
    return pages;
  };

  // Dynamic PDF Export function
  const exportIndividualPDF = async () => {
    if (!selectedTeacher) {
      Swal.fire("ข้อผิดพลาด", "กรุณาเลือกครูและบุคลากรก่อน", "warning");
      return;
    }
    if (ledgerData.length === 0) {
      Swal.fire("ไม่มีข้อมูล", "ไม่พบข้อมูลสถิติสำหรับการลงเวลาในช่วงนี้", "info");
      return;
    }

    const getImageDataUrl = async (url: string): Promise<string> => {
      try {
        const response = await fetch(url, { mode: "cors" });
        if (!response.ok) return "";
        const blob = await response.blob();
        return await new Promise((resolve) => {
          const reader = new FileReader();
          reader.onloadend = () => resolve(reader.result as string);
          reader.readAsDataURL(blob);
        });
      } catch (error) {
        console.warn("Unable to convert image for PDF:", error);
        return "";
      }
    };

    // Load fresh school configurations
    let schoolName = "โรงเรียนปอเนาะวิทยา";
    let directorName = "";
    let personnelHeadName = "นายนนทวัฒน์ สุวรรณบุผา";
    let logoUrl = "";
    let affiliation = "";

    if (schoolId) {
      try {
        const schoolDoc = await getDoc(doc(firestore, "school-settings", schoolId));
        if (schoolDoc.exists()) {
          const d = schoolDoc.data();
          schoolName = d.schoolName || schoolName;
          directorName = d.directorName || "";
          personnelHeadName = [d.personnelHeadPrefix, d.personnelHeadName].filter(Boolean).join(' ') || d.personnelHeadName || "นายนนทวัฒน์ สุวรรณบุผา";
          logoUrl = d.logoUrl || "";
          affiliation = d.affiliation || "";
        }
      } catch (err) {
        console.warn("Error grabbing school logo settings:", err);
      }
    }

    let schoolLogo = logoUrl ? await getImageDataUrl(logoUrl) : "";
    if (logoUrl && !schoolLogo) {
      schoolLogo = logoUrl;
    }
    
    // Fetch and convert teacher profile image
    let teacherProfileImage = "";
    if (selectedTeacher.profileImageUrl) {
      teacherProfileImage = await getImageDataUrl(selectedTeacher.profileImageUrl);
      if (!teacherProfileImage) {
        teacherProfileImage = selectedTeacher.profileImageUrl;
      }
    }
    if (!teacherProfileImage) {
      teacherProfileImage = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=";
    }

    const reportPrintedAt = new Date().toLocaleDateString("th-TH", {
      day: "numeric",
      month: "long",
      year: "numeric"
    });

    const displaySchoolName = schoolName.startsWith("โรงเรียน") ? schoolName : `โรงเรียน${schoolName}`;
    
    // Sort ascending for PDF ledger
    const sortedAscRecords = [...ledgerData].reverse();

    const startThai = new Date(startDate).toLocaleDateString("th-TH", { day: "numeric", month: "short", year: "2-digit" });
    const endThai = new Date(endDate).toLocaleDateString("th-TH", { day: "numeric", month: "short", year: "2-digit" });
    const dateText = `${startThai} - ${endThai}`;

    // Determine academicYearTerm e.g. "1/2569"
    let academicYearTerm = `ปีการศึกษา ${academicYear || "-"}`;
    if (academicYear) {
      const midTime = (new Date(startDate).getTime() + new Date(endDate).getTime()) / 2;
      const midDateStr = new Date(midTime).toISOString().split("T")[0];
      
      let termStr = "1";
      if (terms.term2.start && midDateStr >= terms.term2.start) {
        termStr = "2";
      } else if (terms.term1.end && midDateStr > terms.term1.end) {
        termStr = "2";
      }
      academicYearTerm = `${termStr}/${academicYear}`;
    }

    try {
      Swal.fire({
        title: "กำลังเตรียมจัดทำรายงาน...",
        text: "กรุณารอสักครู่ขณะระบบกำลังสร้างไฟล์ PDF",
        allowOutsideClick: false,
        didOpen: () => Swal.showLoading()
      });

      const pdfBlob = await pdf(
        <IndividualAttendancePdfDocument
          records={sortedAscRecords}
          teacher={selectedTeacher}
          stats={computedStats}
          schoolName={displaySchoolName}
          schoolAffiliation={affiliation}
          schoolLogo={schoolLogo}
          teacherProfileImage={teacherProfileImage}
          directorName={directorName}
          personnelHeadName={personnelHeadName}
          dateText={dateText}
          reportPrintedAt={reportPrintedAt}
          academicYearTerm={academicYearTerm}
        />
      ).toBlob();

      Swal.close();
      saveAs(pdfBlob, `สถิติการลงเวลา_${selectedTeacher.fullName}_${dateText}.pdf`);
    } catch (err) {
      Swal.close();
      console.error("PDF Render Error:", err);
      Swal.fire("ข้อผิดพลาด", "ไม่สามารถสร้างและบันทึกรายงาน PDF ได้", "error");
    }
  };

  return (
    <MainLayout>
      <div className="min-h-screen bg-gray-50 dark:bg-[#1e1f21] transition-colors duration-300 p-4 sm:p-6 lg:p-8">
        <div className="max-w-7xl mx-auto">
          {/* Header */}
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
            <div className="flex items-center gap-4">
              <BackButton to="/academic/hub/personnel_info" />
              <div>
                <h1 className="text-2xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
                  <FaUserCheck className="text-indigo-600 dark:text-indigo-400" />
                  การลงเวลารายบุคคล
                </h1>
                <p className="text-gray-500 dark:text-gray-400 text-sm mt-1">
                  ตรวจสอบสถิติเวลา ขาด ลา มา สาย และจัดทำรายงานรายครูและบุคลากรรายบุคคล
                </p>
              </div>
            </div>

            <div className="flex gap-2">
              <button
                onClick={exportIndividualPDF}
                disabled={loading || ledgerData.length === 0}
                className="flex items-center gap-2 px-4 py-2 bg-red-600 hover:bg-red-700 disabled:bg-gray-400 disabled:cursor-not-allowed text-white rounded-lg transition-colors shadow-sm font-semibold"
              >
                <FaFilePdf /> พิมพ์รายงาน (PDF)
              </button>
            </div>
          </div>

          {/* Search controls & Filters */}
          <div className="bg-white dark:bg-[#2a2b2f] p-6 rounded-2xl shadow-sm border border-gray-200/80 dark:border-gray-700/50 mb-6">
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-end">
              {/* Teacher Select */}
              <div className="lg:col-span-1">
                <label className="block text-sm font-bold text-gray-700 dark:text-gray-300 mb-2">เลือกครูและบุคลากร</label>
                {fetchingTeachers ? (
                  <div className="h-10 flex items-center px-3 border border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-[#1e1f21] rounded-xl text-gray-500 text-xs">
                    กำลังโหลดรายชื่อ...
                  </div>
                ) : (
                  <Select
                    options={teacherOptions}
                    value={teacherOptions.find(o => o.value === selectedTeacherId)}
                    onChange={(opt: any) => setSelectedTeacherId(opt?.value || "")}
                    placeholder="ค้นหาชื่อครู..."
                    className="react-select-container"
                    classNamePrefix="react-select"
                    styles={{
                      control: (base, state) => ({
                        ...base,
                        borderRadius: "12px",
                        height: "42px",
                        backgroundColor: isDarkMode ? "#1e1f21" : "#ffffff",
                        borderColor: state.isFocused ? "#4f46e5" : isDarkMode ? "#374151" : "#e5e7eb",
                        boxShadow: state.isFocused ? "0 0 0 1px #4f46e5" : "none",
                        "&:hover": { borderColor: "#4f46e5" }
                      }),
                      menu: (base) => ({
                        ...base,
                        backgroundColor: isDarkMode ? "#2a2b2f" : "#ffffff",
                        borderColor: isDarkMode ? "#374151" : "#e5e7eb",
                        borderRadius: "12px",
                        zIndex: 50
                      }),
                      option: (base, state) => ({
                        ...base,
                        backgroundColor: state.isSelected
                          ? "#4f46e5"
                          : state.isFocused ? (isDarkMode ? "#374151" : "#f3f4f6") : "transparent",
                        color: state.isSelected ? "#ffffff" : (isDarkMode ? "#e5e7eb" : "#1f2937"),
                        cursor: "pointer"
                      }),
                      singleValue: (base) => ({
                        ...base,
                        color: isDarkMode ? "#ffffff" : "#1f2937"
                      }),
                      placeholder: (base) => ({
                        ...base,
                        color: isDarkMode ? "#9ca3af" : "#9ca3af"
                      })
                    }}
                  />
                )}
              </div>

              {/* Range Filters */}
              <div className="lg:col-span-2 flex flex-col md:flex-row gap-4 items-end w-full">
                <div className="w-full md:w-1/3">
                  <label className="block text-sm font-bold text-gray-700 dark:text-gray-300 mb-2">ช่วงเวลาสถิติ</label>
                  <select
                    value={filterRange}
                    onChange={(e) => setFilterRange(e.target.value as any)}
                    className="w-full h-[42px] px-3 rounded-xl border border-gray-200 dark:border-gray-600 bg-white dark:bg-[#1e1f21] text-gray-900 dark:text-white outline-none focus:ring-2 focus:ring-indigo-500 font-medium"
                  >
                    <option value="today">วันนี้</option>
                    <option value="daily">รายวัน (ระบุวันที่)</option>
                    <option value="thisMonth">เดือนนี้</option>
                    <option value="lastMonth">เดือนที่แล้ว</option>
                    <option value="term1">ภาคเรียนที่ 1</option>
                    <option value="term2">ภาคเรียนที่ 2</option>
                    <option value="custom">กำหนดเอง (ระบุช่วงวันที่)</option>
                  </select>
                </div>

                {filterRange === "daily" && (
                  <div className="w-full md:w-2/3">
                    <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 mb-1.5">เลือกวันที่ปฏิบัติงาน</label>
                    <input
                      type="date"
                      value={startDate}
                      onChange={(e) => {
                        setStartDate(e.target.value);
                        setEndDate(e.target.value);
                      }}
                      className="w-full h-[42px] px-3 rounded-xl border border-gray-200 dark:border-gray-600 bg-white dark:bg-[#1e1f21] text-gray-900 dark:text-white outline-none focus:ring-2 focus:ring-indigo-500"
                    />
                  </div>
                )}

                {filterRange === "custom" && (
                  <div className="flex gap-3 w-full md:w-2/3">
                    <div className="w-1/2">
                      <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 mb-1.5">วันที่เริ่มต้น</label>
                      <input
                        type="date"
                        value={startDate}
                        onChange={(e) => setStartDate(e.target.value)}
                        className="w-full h-[42px] px-3 rounded-xl border border-gray-200 dark:border-gray-600 bg-white dark:bg-[#1e1f21] text-gray-900 dark:text-white outline-none focus:ring-2 focus:ring-indigo-500"
                      />
                    </div>
                    <div className="w-1/2">
                      <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 mb-1.5">วันที่สิ้นสุด</label>
                      <input
                        type="date"
                        value={endDate}
                        onChange={(e) => setEndDate(e.target.value)}
                        className="w-full h-[42px] px-3 rounded-xl border border-gray-200 dark:border-gray-600 bg-white dark:bg-[#1e1f21] text-gray-900 dark:text-white outline-none focus:ring-2 focus:ring-indigo-500"
                      />
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Teacher Profile Info Block */}
          {selectedTeacher && (
            <div className="bg-gradient-to-r from-indigo-500/10 to-purple-500/10 dark:from-indigo-500/5 dark:to-purple-500/5 border border-indigo-100 dark:border-indigo-500/20 p-5 rounded-2xl flex flex-col md:flex-row items-center gap-5 mb-6">
              <img
                src={selectedTeacher.profileImageUrl || defaultProfile}
                alt={selectedTeacher.fullName}
                className="w-20 h-20 rounded-full object-cover border-2 border-white dark:border-gray-700 shadow-md flex-shrink-0"
                onError={(e) => { e.currentTarget.src = defaultProfile; }}
              />
              <div className="text-center md:text-left">
                <div className="flex flex-col md:flex-row items-center gap-2">
                  <h2 className="text-xl font-bold text-gray-900 dark:text-white">{selectedTeacher.fullName}</h2>
                  <span className="text-xs font-bold text-indigo-600 dark:text-indigo-400 bg-indigo-500/10 dark:bg-indigo-500/20 px-2 py-0.5 rounded-full border border-indigo-500/20">
                    รหัสครู: {selectedTeacher.teacherId || "ไม่มีข้อมูลรหัส"}
                  </span>
                </div>
                <p className="text-gray-600 dark:text-gray-400 text-sm mt-1">ตำแหน่ง: {selectedTeacher.position || "ครู"}</p>
                <div className="flex gap-4 mt-2 justify-center md:justify-start">
                  <span className="text-xs text-gray-500 dark:text-gray-400 flex items-center gap-1 font-semibold">
                    <FaCalendarAlt /> ช่วงประวัติ: {new Date(startDate).toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: 'numeric' })} - {new Date(endDate).toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: 'numeric' })}
                  </span>
                </div>
              </div>
            </div>
          )}

          {/* Stats Summary Grid Cards */}
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-6">
            <div className="bg-white dark:bg-[#2a2b2f] p-4 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 text-center">
              <span className="text-gray-400 dark:text-gray-500 text-xs font-semibold block mb-1">ปฏิบัติงานปกติ</span>
              <span className="text-2xl font-black text-green-600 dark:text-green-400 block">{computedStats.present}</span>
              <span className="text-gray-400 text-[10px] font-medium block">วัน</span>
            </div>

            <div className="bg-white dark:bg-[#2a2b2f] p-4 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 text-center">
              <span className="text-gray-400 dark:text-gray-500 text-xs font-semibold block mb-1">สาย</span>
              <span className="text-2xl font-black text-amber-500 dark:text-amber-400 block">{computedStats.late}</span>
              <span className="text-gray-400 text-[10px] font-medium block">วัน</span>
            </div>

            <div className="bg-white dark:bg-[#2a2b2f] p-4 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 text-center">
              <span className="text-gray-400 dark:text-gray-500 text-xs font-semibold block mb-1">การลา</span>
              <span className="text-2xl font-black text-purple-600 dark:text-purple-400 block">{computedStats.leave}</span>
              <span className="text-gray-400 text-[10px] font-medium block">วัน</span>
            </div>

            <div className="bg-white dark:bg-[#2a2b2f] p-4 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 text-center">
              <span className="text-gray-400 dark:text-gray-500 text-xs font-semibold block mb-1">ขาดงาน</span>
              <span className="text-2xl font-black text-rose-500 dark:text-rose-400 block">{computedStats.absent}</span>
              <span className="text-gray-400 text-[10px] font-medium block">วัน</span>
            </div>

            <div className="col-span-2 md:col-span-1 bg-gradient-to-br from-indigo-50 to-indigo-100/50 dark:from-indigo-950/20 dark:to-indigo-900/10 p-4 rounded-xl shadow-sm border border-indigo-100 dark:border-indigo-500/20 text-center flex flex-col justify-center">
              <span className="text-indigo-600 dark:text-indigo-400 text-xs font-bold block mb-1">ร้อยละการเข้างาน</span>
              <span className="text-2xl font-black text-indigo-700 dark:text-indigo-400 block">{computedStats.percentage}%</span>
              <span className="text-gray-400 text-[9px] font-medium block mt-0.5">จากรวมวันงาน {computedStats.total} วัน</span>
            </div>
          </div>

          {/* Daily Ledger List Table */}
          <div className="bg-white dark:bg-[#2a2b2f] rounded-2xl shadow-sm border border-gray-200/80 dark:border-gray-700/50 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-gray-50/80 dark:bg-[#323338]/60 border-b border-gray-200 dark:border-gray-700">
                    <th className="px-6 py-4 text-xs font-extrabold text-gray-600 dark:text-gray-300 text-center w-16">ลำดับ</th>
                    <th className="px-6 py-4 text-xs font-extrabold text-gray-600 dark:text-gray-300 w-[30%]">วันที่ปฏิบัติงาน</th>
                    <th className="px-6 py-4 text-xs font-extrabold text-gray-600 dark:text-gray-300 text-center">เวลาเข้างาน</th>
                    <th className="px-6 py-4 text-xs font-extrabold text-gray-600 dark:text-gray-300 text-center">เวลาออกงาน</th>
                    <th className="px-6 py-4 text-xs font-extrabold text-gray-600 dark:text-gray-300 text-center">สถานะ</th>
                    <th className="px-6 py-4 text-xs font-extrabold text-gray-600 dark:text-gray-300">หมายเหตุ / ข้อมูลเพิ่มเติม</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 dark:divide-gray-700/50">
                  {loading ? (
                    <tr>
                      <td colSpan={6} className="px-6 py-12 text-center text-gray-500 dark:text-gray-400 font-semibold">
                        <div className="flex flex-col items-center gap-3">
                          <FaClock className="animate-spin text-indigo-600 w-6 h-6" />
                          กำลังรวบรวมและวิเคราะห์ข้อมูล...
                        </div>
                      </td>
                    </tr>
                  ) : ledgerData.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="px-6 py-12 text-center text-gray-400 dark:text-gray-500 font-semibold">
                        ไม่พบสถิติหรือเวลาลงงานในช่วงวันที่เลือก
                      </td>
                    </tr>
                  ) : (
                    paginatedData.map((rec, idx) => {
                      const absoluteIdx = (currentPage - 1) * itemsPerPage + idx + 1;
                      return (
                        <tr key={rec.date} className="hover:bg-gray-50/50 dark:hover:bg-[#323338]/30 transition-colors">
                          <td className="px-6 py-3 text-center text-sm font-semibold text-gray-400 dark:text-gray-500">
                            {absoluteIdx}
                          </td>
                          <td className="px-6 py-3 text-sm font-semibold text-gray-800 dark:text-gray-200">
                            {rec.formattedDate}
                          </td>
                          <td className="px-6 py-3 text-center">
                            {rec.checkInTime ? (
                              <span className="inline-flex items-center px-2.5 py-1 rounded-lg text-xs font-semibold bg-emerald-50 dark:bg-emerald-950/20 text-emerald-700 dark:text-emerald-400 border border-emerald-100 dark:border-emerald-900/40">
                                {rec.checkInTime} น.
                              </span>
                            ) : (
                              <span className="text-gray-300 dark:text-gray-600 font-semibold">-</span>
                            )}
                          </td>
                          <td className="px-6 py-3 text-center">
                            {rec.checkOutTime ? (
                              <span className="inline-flex items-center px-2.5 py-1 rounded-lg text-xs font-semibold bg-blue-50 dark:bg-blue-950/20 text-blue-700 dark:text-blue-400 border border-blue-100 dark:border-blue-900/40">
                                {rec.checkOutTime} น.
                              </span>
                            ) : (
                              <span className="text-gray-300 dark:text-gray-600 font-semibold">-</span>
                            )}
                          </td>
                          <td className="px-6 py-3 text-center">
                            {rec.status === "Normal" && (
                              <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold bg-green-100 dark:bg-green-950/30 text-green-800 dark:text-green-400 border border-green-200 dark:border-green-800">
                                ปกติ
                              </span>
                            )}
                            {rec.status === "Late" && (
                              <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold bg-amber-100 dark:bg-amber-950/30 text-amber-800 dark:text-amber-400 border border-amber-200 dark:border-amber-800">
                                สาย
                              </span>
                            )}
                            {rec.status === "Leave" && (
                              <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold bg-purple-100 dark:bg-purple-950/30 text-purple-800 dark:text-purple-400 border border-purple-200 dark:border-purple-800">
                                ลา
                              </span>
                            )}
                            {rec.status === "Absent" && (
                              <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold bg-red-100 dark:bg-red-950/30 text-red-800 dark:text-red-400 border border-red-200 dark:border-red-800">
                                ขาด
                              </span>
                            )}
                            {rec.status === "OfficialTravel" && (
                              <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold bg-teal-100 dark:bg-teal-950/30 text-teal-800 dark:text-teal-400 border border-teal-200 dark:border-teal-800">
                                ไปราชการ
                              </span>
                            )}
                            {rec.status === "NoCheckout" && (
                              <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold bg-slate-100 dark:bg-slate-900/50 text-slate-700 dark:text-slate-400 border border-slate-200 dark:border-slate-800">
                                ไม่ลงเวลากลับ
                              </span>
                            )}
                          </td>
                          <td className="px-6 py-3 text-xs text-gray-500 dark:text-gray-400 font-semibold truncate max-w-xs">
                            {rec.lateMinutes ? (
                              <span className="text-amber-600 dark:text-amber-400 font-bold">
                                {(() => {
                                  const total = parseInt(rec.lateMinutes);
                                  const h = Math.floor(total / 60);
                                  const m = total % 60;
                                  return h > 0 ? `สาย ${h} ชั่วโมง ${m} นาที` : `สาย ${m} นาที`;
                                })()}
                              </span>
                            ) : (
                              rec.note || (rec.status === "Normal" ? "ปฏิบัติราชการปกติ" : "-")
                            )}
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>

            {/* Pagination Controls */}
            {!loading && totalPages > 1 && (
              <div className="px-6 py-4 bg-gray-50/50 dark:bg-[#323338]/30 border-t border-gray-100 dark:border-gray-700 flex flex-col sm:flex-row items-center justify-between gap-4">
                <div className="text-xs font-semibold text-gray-500 dark:text-gray-400">
                  แสดง {((currentPage - 1) * itemsPerPage) + 1} ถึง {Math.min(currentPage * itemsPerPage, ledgerData.length)} จาก {ledgerData.length} วันทำการ
                </div>
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => setCurrentPage(1)}
                    disabled={currentPage === 1}
                    className="p-2 rounded-md hover:bg-gray-200 dark:hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors text-gray-600 dark:text-gray-300"
                    title="หน้าแรก"
                  >
                    <FaAngleDoubleLeft size={12} />
                  </button>
                  <button
                    onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))}
                    disabled={currentPage === 1}
                    className="p-2 rounded-md hover:bg-gray-200 dark:hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors text-gray-600 dark:text-gray-300"
                    title="ย้อนกลับ"
                  >
                    <FaAngleLeft size={12} />
                  </button>

                  <div className="flex items-center gap-1 mx-2">
                    {getPageNumbers().map(pageNum => (
                      <button
                        key={pageNum}
                        onClick={() => setCurrentPage(pageNum)}
                        className={`w-7 h-7 rounded-md text-xs font-bold transition-colors ${
                          currentPage === pageNum
                            ? 'bg-indigo-600 text-white'
                            : 'hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-600 dark:text-gray-300'
                        }`}
                      >
                        {pageNum}
                      </button>
                    ))}
                  </div>

                  <button
                    onClick={() => setCurrentPage(prev => Math.min(prev + 1, totalPages))}
                    disabled={currentPage === totalPages}
                    className="p-2 rounded-md hover:bg-gray-200 dark:hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors text-gray-600 dark:text-gray-300"
                    title="ถัดไป"
                  >
                    <FaAngleRight size={12} />
                  </button>
                  <button
                    onClick={() => setCurrentPage(totalPages)}
                    disabled={currentPage === totalPages}
                    className="p-2 rounded-md hover:bg-gray-200 dark:hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors text-gray-600 dark:text-gray-300"
                    title="หน้าสุดท้าย"
                  >
                    <FaAngleDoubleRight size={12} />
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </MainLayout>
  );
};

export default TeacherAttendanceIndividualPage;
