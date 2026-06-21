import React, { useState, useEffect, useCallback, useMemo } from "react";
import { useSelector, useDispatch } from "react-redux";
import { firestore } from "@/firebase";
import { collection, query, where, getDocs, documentId, doc, getDoc, Timestamp } from "firebase/firestore";
import { RootState, AppDispatch } from "../../store";
import { fetchSchoolSettings } from "@/store/slices/schoolSettingsSlice";
import Navbar from "../../components/Navbar/Navbar";
import LeftSidebar from "../../components/Sidebar/LeftSidebar";
import { fetchTeachersMap } from "@/store/slices/userMapSlice";
import { FaFilePdf, FaSearch, FaUsers, FaAngleLeft, FaAngleRight, FaAngleDoubleLeft, FaAngleDoubleRight, FaCalendarAlt } from "react-icons/fa";
import { Document, Font, Image, Page, StyleSheet, Text, View, pdf } from "@react-pdf/renderer";
import { saveAs } from "file-saver";
import Swal from "sweetalert2";
import defaultProfile from "@/assets/profile.png";
import { getCurrentAcademicYear, getSemesterKey } from "@/utils/academicYearUtils";
import MainLayout from "@/layouts/MainLayout";
import BackButton from "@/components/Shared/BackButton";
import { isActiveStudentStatus } from "@/utils/studentStatusUtils";

Font.register({
  family: "TH Sarabun PSK",
  fonts: [
    { src: "/fonts/THSarabunNew.ttf" },
    { src: "/fonts/THSarabunNew-Bold.ttf", fontWeight: "bold" }
  ]
});

// Interfaces
interface AttendanceRecord {
  id: string;
  userId: string;
  fullName: string;
  checkInTime?: string;
  status?: string;
  date: string;
}

interface StudentStats {
  id: string;
  fullName: string;
  profileUrl?: string;
  present: number;
  late: number;
  leave: number;
  absent: number;
  noCheckout: number;
  official_travel: number; // Added
  total: number;
  percentage: string;
}

interface StudentInfo {
  id: string;
  fullName: string;
  studentNumber?: number;
  profileImageUrl?: string;
  [key: string]: any;
}

interface StudentAttendancePdfDocumentProps {
  chunks: StudentStats[][];
  rowsPerPage: number;
  schoolName: string;
  schoolAffiliation: string;
  schoolLogo?: string;
  directorName: string;
  dateText: string;
  filterType: "daily" | "weekly" | "monthly" | "term" | "yearly" | "custom";
  totalItems: number;
  reportPrintedAt: string;
  classLevel: string;
  room: string;
  specialProgram: string;
  homeroomTeacherName: string;
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
    textAlign: "center",
    marginBottom: 2
  },
  subTitle: {
    fontSize: 18,
    fontWeight: "bold",
    textAlign: "center",
    marginBottom: 2
  },
  infoText: {
    fontSize: 16,
    textAlign: "center"
  },
  table: {
    display: "flex",
    width: "auto",
    borderStyle: "solid",
    borderWidth: 1,
    borderColor: "#000",
    borderBottomWidth: 0,
    borderRightWidth: 0
  },
  tableRow: {
    flexDirection: "row",
    minHeight: 24
  },
  tableCellHeader: {
    backgroundColor: "#f5f5f5",
    borderStyle: "solid",
    borderWidth: 1,
    borderLeftWidth: 0,
    borderTopWidth: 0,
    borderColor: "#000",
    justifyContent: "center",
    alignItems: "center",
    padding: 2,
    fontWeight: "bold"
  },
  tableCell: {
    borderStyle: "solid",
    borderWidth: 1,
    borderLeftWidth: 0,
    borderTopWidth: 0,
    borderColor: "#000",
    justifyContent: "center",
    alignItems: "center",
    padding: 2
  },
  textLeft: {
    textAlign: "left",
    paddingLeft: 6
  },
  footer: {
    marginTop: 60,
    flexDirection: "row",
    justifyContent: "space-between",
    paddingLeft: 30,
    paddingRight: 30
  },
  signatureBlock: {
    width: "45%",
    alignItems: "center"
  },
  signatureLine: {
    borderBottom: "1px dotted #000",
    width: 150,
    marginTop: 15,
    marginBottom: 10
  },
  pageNumber: {
    position: "absolute",
    bottom: 30,
    right: 30,
    fontSize: 12
  }
});

const StudentAttendancePdfDocument: React.FC<StudentAttendancePdfDocumentProps> = ({
  chunks,
  rowsPerPage,
  schoolName,
  schoolAffiliation,
  schoolLogo,
  directorName,
  dateText,
  totalItems,
  reportPrintedAt,
  classLevel,
  room,
  specialProgram,
  homeroomTeacherName
}) => (
  <Document>
    {chunks.map((pageData, pageIndex) => (
      <Page key={pageIndex} size="A4" style={pdfStyles.page}>
        <View style={pdfStyles.header}>
          {schoolLogo && (
            <View style={pdfStyles.logoBox}>
              <Image src={schoolLogo} style={pdfStyles.logo} />
            </View>
          )}
          <View style={pdfStyles.headerTextBlock}>
            <Text style={pdfStyles.title}>สรุปการมาเรียนของนักเรียน ชั้น {classLevel}/{room} {specialProgram ? `(${specialProgram})` : ''}</Text>
            <Text style={pdfStyles.subTitle}>โรงเรียน{schoolName} {schoolAffiliation}</Text>
            <Text style={pdfStyles.infoText}>{dateText}</Text>
          </View>
        </View>

        <View style={pdfStyles.table}>
          <View style={[pdfStyles.tableRow, { backgroundColor: "#f5f5f5" }]}>
            <View style={[pdfStyles.tableCellHeader, { width: "5%" }]}><Text>ที่</Text></View>
            <View style={[pdfStyles.tableCellHeader, { width: "25%" }]}><Text>ชื่อ - นามสกุล</Text></View>
            <View style={[pdfStyles.tableCellHeader, { width: "8%" }]}><Text>มา</Text></View>
            <View style={[pdfStyles.tableCellHeader, { width: "8%" }]}><Text>สาย</Text></View>
            <View style={[pdfStyles.tableCellHeader, { width: "8%" }]}><Text>ลา</Text></View>
            <View style={[pdfStyles.tableCellHeader, { width: "8%" }]}><Text>ขาด</Text></View>
            <View style={[pdfStyles.tableCellHeader, { width: "10%" }]}><Text>ไม่ลงเวลา</Text></View>
            <View style={[pdfStyles.tableCellHeader, { width: "10%" }]}><Text>ราชการ</Text></View>
            <View style={[pdfStyles.tableCellHeader, { width: "8%" }]}><Text>รวม</Text></View>
            <View style={[pdfStyles.tableCellHeader, { width: "10%" }]}><Text>ร้อยละ</Text></View>
          </View>

          {pageData.map((row, rowIndex) => (
            <View key={rowIndex} style={pdfStyles.tableRow}>
              <View style={[pdfStyles.tableCell, { width: "5%" }]}><Text>{(pageIndex * rowsPerPage) + rowIndex + 1}</Text></View>
              <View style={[pdfStyles.tableCell, { width: "25%", alignItems: "flex-start", paddingLeft: 6 }]}><Text>{row.fullName}</Text></View>
              <View style={[pdfStyles.tableCell, { width: "8%" }]}><Text>{row.present}</Text></View>
              <View style={[pdfStyles.tableCell, { width: "8%" }]}><Text>{row.late}</Text></View>
              <View style={[pdfStyles.tableCell, { width: "8%" }]}><Text>{row.leave}</Text></View>
              <View style={[pdfStyles.tableCell, { width: "8%" }]}><Text>{row.absent}</Text></View>
              <View style={[pdfStyles.tableCell, { width: "10%" }]}><Text>{row.noCheckout}</Text></View>
              <View style={[pdfStyles.tableCell, { width: "10%" }]}><Text>{row.official_travel}</Text></View>
              <View style={[pdfStyles.tableCell, { width: "8%" }]}><Text>{row.total}</Text></View>
              <View style={[pdfStyles.tableCell, { width: "10%" }]}><Text>{row.percentage}%</Text></View>
            </View>
          ))}
        </View>

        {pageIndex === chunks.length - 1 && (
          <View style={pdfStyles.footer}>
            <View style={pdfStyles.signatureBlock}>
              <Text style={{ marginBottom: 12 }}>ลงชื่อ..........................................ครูประจำชั้น</Text>
              <View>
                <Text>({homeroomTeacherName || ".........................................."})</Text>
              </View>
            </View>
            <View style={pdfStyles.signatureBlock}>
              <Text style={{ marginBottom: 12 }}>ลงชื่อ..........................................ผู้รับรอง</Text>
              <View>
                <Text>({directorName || ".........................................."})</Text>
              </View>
              <Text style={{ marginTop: 6 }}>ผู้อำนวยการโรงเรียน{schoolName}</Text>
            </View>
          </View>
        )}

        <Text style={pdfStyles.pageNumber} render={({ pageNumber, totalPages }) => `หน้า ${pageNumber} / ${totalPages}`} fixed />
      </Page>
    ))}
  </Document>
);

const StudentsAttendanceSummaryPage: React.FC = () => {
  const { user: currentUser } = useSelector((state: RootState) => state.auth);
  const { teachers: teacherMap } = useSelector((state: RootState) => state.userMap);
  const schoolSettings = useSelector((state: RootState) => state.schoolSettings);
  const dispatch = useDispatch<AppDispatch>();
  const schoolId = currentUser?.schoolId;

  const [loading, setLoading] = useState(false);
  const [students, setStudents] = useState<StudentInfo[]>([]);
  const [summaryData, setSummaryData] = useState<StudentStats[]>([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [logoBase64, setLogoBase64] = useState<string | undefined>(undefined);

  // Pagination States
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage] = useState(20);

  // Filter States
  const [filterType, setFilterType] = useState<"daily" | "weekly" | "monthly" | "term" | "yearly" | "custom">("daily");
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0]);
  const [selectedSpecialProgram, setSelectedSpecialProgram] = useState<string>("");
  const [specialPrograms, setSpecialPrograms] = useState<any[]>([]);
  const [selectedWeek, setSelectedWeek] = useState(() => {
    const date = new Date();
    const year = date.getFullYear();
    const week = Math.ceil((((date.getTime() - new Date(year, 0, 1).getTime()) / 86400000) + new Date(year, 0, 1).getDay() + 1) / 7);
    return `${year}-W${String(week).padStart(2, '0')}`;
  });
  const [selectedMonth, setSelectedMonth] = useState(new Date().toISOString().slice(0, 7)); // YYYY-MM
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [terms, setTerms] = useState<{ term1: { start: string, end: string }, term2: { start: string, end: string } }>({ term1: { start: "", end: "" }, term2: { start: "", end: "" } });
  const [selectedTerm, setSelectedTerm] = useState<"1" | "2">("1");
  const [currentAcademicYear, setCurrentAcademicYear] = useState("");

  // Class filter states
  const [availableLevels, setAvailableLevels] = useState<string[]>([]);
  const [selectedClassLevel, setSelectedClassLevel] = useState<string>("");
  const [selectedRoom, setSelectedRoom] = useState<string>("");

  const [calendarEvents, setCalendarEvents] = useState<Record<string, any>>({});
  const [excludedDates, setExcludedDates] = useState<{ date: string, reason: string }[]>([]);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const [termCounts, setTermCounts] = useState<{ term1: number, term2: number }>({ term1: 0, term2: 0 });

  useEffect(() => {
    if (schoolId) {
      dispatch(fetchTeachersMap(schoolId) as any);
    }
  }, [schoolId, dispatch]);

  useEffect(() => {
    const handleResize = () => {
      setIsMobile(window.innerWidth < 768);
    };
    handleResize();
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  // Fetch available classes
  useEffect(() => {
    const fetchLevels = async () => {
      if (!schoolId) return;
      try {
        const schoolRef = doc(firestore, "school-settings", schoolId);
        const schoolSnap = await getDoc(schoolRef);
        if (schoolSnap.exists()) {
          const data = schoolSnap.data();
          const levelRange = data.opportunityExpansionLevel;

          const primary = ["ป.1", "ป.2", "ป.3", "ป.4", "ป.5", "ป.6"];
          const junior = ["ม.1", "ม.2", "ม.3"];
          const senior = ["ม.4", "ม.5", "ม.6"];

          let levels: string[] = [];
          if (levelRange === 'ป.1-ป.6') levels = primary;
          else if (levelRange === 'ม.1-ม.6') levels = [...junior, ...senior];
          else if (levelRange === 'ป.1-ม.3') levels = [...primary, ...junior];
          else if (levelRange === 'ป.1-ม.6') levels = [...primary, ...junior, ...senior];
          else {
            levels = [...primary, ...junior, ...senior];
          }
          setAvailableLevels(levels);
          if (levels.length > 0) setSelectedClassLevel(levels[0]);
          setSelectedRoom("1");
        }
      } catch (error) {
        console.error("Error fetching classes:", error);
      }
    };
    fetchLevels();

    const fetchSpecialPrograms = async () => {
      if (!schoolId) return;
      try {
        const spRef = collection(firestore, "school-settings", schoolId, "special_programs");
        const spSnap = await getDocs(spRef);
        setSpecialPrograms(spSnap.docs.map(doc => ({ id: doc.id, ...doc.data() })));
      } catch (error) {
        console.error("Error fetching special programs:", error);
      }
    };
    fetchSpecialPrograms();
  }, [schoolId]);

  // Fetch students based on selected class
  useEffect(() => {
    const fetchStudents = async () => {
      if (!schoolId || !selectedClassLevel) {
        setStudents([]);
        return;
      }
      setLoading(true);
      try {
        const studentsRef = collection(firestore, "school-settings", schoolId, "students");
        const classLevel = selectedClassLevel;
        const room = selectedRoom;
        let q;
        if (selectedSpecialProgram) {
          q = query(studentsRef, where("classLevel", "==", classLevel), where("room", "==", room), where("specialProgram", "==", selectedSpecialProgram));
        } else if (room) {
          q = query(studentsRef, where("classLevel", "==", classLevel), where("room", "==", room));
        } else {
          q = query(studentsRef, where("classLevel", "==", classLevel));
        }

        const snapshot = await getDocs(q);
        const studentList = snapshot.docs.map((doc): StudentInfo => {
          const data = doc.data();
          return {
            id: doc.id,
            fullName: `${data.title || ''}${data.firstName || ''} ${data.lastName || ''}`.trim(),
            ...data
          };
        })
        .filter((student) => isActiveStudentStatus(student.status || student.studentStatus || "กำลังศึกษาอยู่"))
        .sort((a, b) => (a.studentNumber || 0) - (b.studentNumber || 0)); // Sort by student number
        setStudents(studentList);
      } catch (error) {
        console.error("Error fetching students:", error);
      } finally {
        setLoading(false);
      }
    };
    fetchStudents();
  }, [schoolId, selectedClassLevel, selectedRoom, selectedSpecialProgram]);

  // Set selectedYear to currentAcademicYear when switching to 'yearly' mode or when data loads
  useEffect(() => {
    if (filterType === 'yearly' && currentAcademicYear) {
      const yearNum = parseInt(currentAcademicYear);
      if (!isNaN(yearNum)) {
        setSelectedYear(yearNum > 2400 ? yearNum - 543 : yearNum);
      }
    }
  }, [filterType, currentAcademicYear]);

  // Fetch Calendar Data (Terms & Events) based on filter
  useEffect(() => {
    const fetchCalendarData = async () => {
      if (!schoolId) return;

      try {
        // Fetch school settings for logo and affiliation
        dispatch(fetchSchoolSettings(schoolId));

        // ใช้ utility function เพื่อดึงข้อมูลปีการศึกษา
        const academicData = await getCurrentAcademicYear(firestore, schoolId);

        setCurrentAcademicYear(academicData.academicYear);
        setTerms({
          term1: {
            start: academicData.terms.term1?.startDate || "",
            end: academicData.terms.term1?.endDate || ""
          },
          term2: {
            start: academicData.terms.term2?.startDate || "",
            end: academicData.terms.term2?.endDate || ""
          }
        });

        // ตั้งค่า default term ถ้ามี
        if (academicData.currentTerm) {
          setSelectedTerm(academicData.currentTerm);
        }

        // ดึง calendar events สำหรับการคำนวณวันเรียน
        const defaultDocRef = doc(firestore, 'school-settings', schoolId, 'main_calendar', 'default');
        const defaultDocSnap = await getDoc(defaultDocRef);

        if (defaultDocSnap.exists()) {
          const data = defaultDocSnap.data();
          if (data.events) {
            setCalendarEvents(data.events);
          }
        }
      } catch (error) {
        console.error("Error fetching calendar data:", error);
      }
    };

    fetchCalendarData();
  }, [schoolId, dispatch]);

  // Handle Logo Base64 conversion
  useEffect(() => {
    if (schoolSettings?.logoUrl) {
      const getImageDataUrl = async (url: string) => {
        try {
          const response = await fetch(url);
          const blob = await response.blob();
          return new Promise<string>((resolve) => {
            const reader = new FileReader();
            reader.onloadend = () => resolve(reader.result as string);
            reader.readAsDataURL(blob);
          });
        } catch (e) {
          console.error("Error converting logo to base64:", e);
          return undefined;
        }
      };
      getImageDataUrl(schoolSettings.logoUrl).then(setLogoBase64);
    }
  }, [schoolSettings?.logoUrl]);

  // Reset page when search or filter changes
  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, filterType, selectedDate, selectedWeek, selectedMonth, selectedTerm, selectedYear, selectedClassLevel, selectedRoom, selectedSpecialProgram]);

  const getWeekDateRange = (weekString: string) => {
    const [year, weekNum] = weekString.split('-W').map(Number);
    const firstDayOfYear = new Date(year, 0, 1);
    const days = (weekNum - 1) * 7;
    const startDate = new Date(firstDayOfYear.getTime() + days * 86400000);
    startDate.setDate(startDate.getDate() - startDate.getDay() + 1); // Monday
    const endDate = new Date(startDate);
    endDate.setDate(startDate.getDate() + 6); // Sunday
    return {
      start: startDate.toISOString().split('T')[0],
      end: endDate.toISOString().split('T')[0]
    };
  };

  const fetchData = useCallback(async () => {
    if (!schoolId || students.length === 0) {
      setSummaryData([]);
      return;
    }

    setLoading(true);
    try {
      let startStr = "", endStr = "";

      switch (filterType) {
        case "daily": startStr = endStr = selectedDate; break;
        case "weekly": {
          const weekRange = getWeekDateRange(selectedWeek); startStr = weekRange.start; endStr = weekRange.end;
          break;
        }
        case "monthly": {
          const [year, month] = selectedMonth.split("-");
          const lastDay = new Date(parseInt(year), parseInt(month), 0).getDate();
          startStr = `${selectedMonth}-01`;
          endStr = `${selectedMonth}-${String(lastDay).padStart(2, '0')}`;
          break;
        }
        case "term": {
          const t = selectedTerm === '1' ? terms.term1 : terms.term2;
          startStr = t.start; endStr = t.end;
          if (!startStr || !endStr) {
            Swal.fire("แจ้งเตือน", "ไม่พบข้อมูลวันที่ของภาคเรียนนี้ กรุณากำหนดในเมนู 'ปฏิทินการศึกษา'", "warning");
            setLoading(false); return;
          }
          break;
        }
        case "yearly":
          if (terms.term1.start && terms.term2.end) {
            startStr = terms.term1.start;
            endStr = terms.term2.end;
          } else {
            startStr = `${selectedYear}-01-01`;
            endStr = `${selectedYear}-12-31`;
          }
          break;
        case "custom":
          if (!startDate || !endDate) {
            Swal.fire("แจ้งเตือน", "กรุณาเลือกวันที่เริ่มต้นและสิ้นสุด", "warning");
            setLoading(false); return;
          }
          startStr = startDate; endStr = endDate; break;
      }

      let newStats: StudentStats[] = [];

      if (filterType === 'custom' || filterType === 'daily') {
        const promises = students.map(async (student) => {
          const ref = collection(firestore, "school-settings", schoolId, "students", student.id, "attendance");
          const q = query(ref, where(documentId(), ">=", startStr), where(documentId(), "<=", endStr));
          const snap = await getDocs(q);
          return snap.docs.map(doc => ({ userId: student.id, date: doc.id, status: doc.data().status }));
        });

        const results = await Promise.all(promises);
        const records = results.flat();

        const workingDates: string[] = [];
        const excluded: { date: string, reason: string }[] = [];

        const checkDate = (dStr: string) => {
          const event = calendarEvents[dStr];
          const d = new Date(dStr);
          const dayOfWeek = d.getUTCDay();
          const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;

          if (event) {
            if (event.type === 'schoolDay') return true;
            if (event.type === 'holiday' || event.type === 'specialHoliday') {
              if (!isWeekend) excluded.push({ date: dStr, reason: event.description || 'วันหยุด' });
              return false;
            }
          }
          if (isWeekend) return false;
          return true;
        };

        let cur = new Date(startStr);
        const last = new Date(endStr);
        while (cur <= last) {
          const dStr = cur.toISOString().split('T')[0];
          if (checkDate(dStr)) workingDates.push(dStr);
          cur.setDate(cur.getDate() + 1);
        }

        const workingDatesSet = new Set(workingDates);

        newStats = students.map(student => {
          const studentRecords = records.filter(r => r.userId === student.id);
          let present = 0, late = 0, leave = 0, noCheckout = 0, explicitAbsent = 0, official_travel = 0;
          const recordedDays = new Set<string>();

          studentRecords.forEach(rec => {
            if (!workingDatesSet.has(rec.date)) return;
            recordedDays.add(rec.date);
            if (rec.status === 'สาย' || rec.status === 'Late') late++;
            else if (rec.status === 'ลา' || rec.status === 'ล' || rec.status === 'Leave') leave++;
            else if (rec.status === 'มา' || rec.status === 'OnTime' || rec.status === 'กลับก่อน') present++;
            else if (rec.status === 'ไม่ลงเวลาออก' || rec.status === 'NoCheckout') noCheckout++;
            else if (rec.status === 'ไปราชการ' || rec.status === 'official_travel' || rec.status === 'OfficialTravel') official_travel++;
            else if (rec.status === 'ขาด' || rec.status === 'Absent') explicitAbsent++;
          });

          const absent = explicitAbsent + workingDates.filter(d => !recordedDays.has(d)).length;
          const attended = present + late + noCheckout + official_travel;
          const percentage = workingDates.length > 0 ? ((attended / workingDates.length) * 100).toFixed(2) : "0.00";

          return {
            id: student.id, fullName: student.fullName, present, late, leave, absent, noCheckout, official_travel,
            profileUrl: student.profileImageUrl,
            total: workingDates.length, percentage
          };
        });
        setExcludedDates(excluded);
      } else {
        let collectionName = "", docId = "";
        if (filterType === 'weekly') { collectionName = 'Weeksummary'; docId = selectedWeek; }
        else if (filterType === 'monthly') { collectionName = 'Monthsummary'; docId = selectedMonth; }
        else if (filterType === 'yearly') { collectionName = 'Yearsummary'; docId = currentAcademicYear; }
        else if (filterType === 'term') {
          collectionName = 'Semestersummary';
          docId = getSemesterKey(currentAcademicYear, selectedTerm);
        }

        const promises = students.map(async (student) => {
          const ref = doc(firestore, "school-settings", schoolId, "students", student.id, collectionName, docId);
          const snap = await getDoc(ref);
          return { student, data: snap.exists() ? snap.data() : {} };
        });
        const results = await Promise.all(promises);

        newStats = results.map(({ student, data }) => {
          const present = data.present || 0;
          const late = data.late || 0;
          const leave = data.leave || 0;
          const absent = data.absent || 0;
          const officialTravel = data.officialTravel || 0;
          const noCheckout = data.noCheckout || 0;
          const total = present + late + leave + absent + officialTravel + noCheckout;
          const attended = present + late + noCheckout + officialTravel;
          const percentage = total > 0 ? ((attended / total) * 100).toFixed(2) : "0.00";
          return {
            id: student.id, fullName: student.fullName,
            present, late, leave, absent, noCheckout, official_travel: officialTravel,
            profileUrl: student.profileImageUrl,
            total, percentage
          };
        });
        setExcludedDates([]);
      }

      setSummaryData(newStats);
    } catch (error) {
      console.error("Error fetching attendance summary:", error);
      Swal.fire("Error", "เกิดข้อผิดพลาดในการดึงข้อมูล", "error");
    } finally {
      setLoading(false);
    }
  }, [schoolId, students, filterType, selectedDate, selectedWeek, selectedMonth, selectedYear, selectedTerm, terms, startDate, endDate, calendarEvents]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const filteredData = useMemo(() => {
    return summaryData.filter(item =>
      item.fullName.toLowerCase().includes(searchTerm.toLowerCase())
    );
  }, [summaryData, searchTerm]);

  // Pagination Logic
  const totalPages = Math.ceil(filteredData.length / itemsPerPage);
  const paginatedData = useMemo(() => {
    const start = (currentPage - 1) * itemsPerPage;
    return filteredData.slice(start, start + itemsPerPage);
  }, [filteredData, currentPage, itemsPerPage]);

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

  const exportPDF = async () => {
    const schoolName = schoolSettings?.schoolName || "";
    const schoolAffiliation = schoolSettings?.affiliation || "";
    const directorName = schoolSettings?.directorName || "";

    const classLevel = selectedClassLevel;
    const room = selectedRoom;
    const academicStandingRank: { [key: string]: number } = {
      "เชี่ยวชาญพิเศษ (คศ.5)": 5,
      "เชี่ยวชาญ (คศ.4)": 4,
      "ชำนาญการพิเศษ (คศ.3)": 3,
      "ชำนาญการ (คศ.2)": 2
    };

    const homeroomTeachers = Object.values(teacherMap || {}).filter(
      (t: any) => t.homeroomGrade === classLevel && t.homeroomRoom === room
    );

    homeroomTeachers.sort((a: any, b: any) => {
      const rankA = academicStandingRank[a.academicStanding] || 0;
      const rankB = academicStandingRank[b.academicStanding] || 0;
      return rankB - rankA;
    });

    const homeroomTeacher = homeroomTeachers.length > 0 ? homeroomTeachers[0] : null;

    let homeroomTeacherName = "";
    if (homeroomTeacher) {
      const t = homeroomTeacher as any;
      homeroomTeacherName = t.firstName && t.lastName ? `${t.title || ''}${t.firstName} ${t.lastName}` : (t.name || "");
    }

    let dateText = "";
    if (filterType === "daily") dateText = `ประจำวันที่ ${new Date(selectedDate).toLocaleDateString('th-TH', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}`;
    else if (filterType === "weekly") {
      const { start, end } = getWeekDateRange(selectedWeek);
      dateText = `ประจำสัปดาห์ (${new Date(start).toLocaleDateString('th-TH')} - ${new Date(end).toLocaleDateString('th-TH')})`;
    } else if (filterType === "monthly") {
      const [y, m] = selectedMonth.split('-');
      dateText = `ประจำเดือน ${new Date(parseInt(y), parseInt(m) - 1, 1).toLocaleDateString('th-TH', { month: 'long', year: 'numeric' })}`;
    } else if (filterType === "term") {
      const t = selectedTerm === '1' ? terms.term1 : terms.term2;
      const s = t.start ? new Date(t.start).toLocaleDateString('th-TH') : '?';
      const e = t.end ? new Date(t.end).toLocaleDateString('th-TH') : '?';
      dateText = `ภาคเรียนที่ ${selectedTerm}${currentAcademicYear ? ` ปีการศึกษา ${currentAcademicYear}` : ''} (${s} - ${e})`;
    } else if (filterType === "yearly") dateText = `ประจำปีการศึกษา ${selectedYear + 543}`;
    else {
      const s = new Date(startDate).toLocaleDateString('th-TH');
      const e = new Date(endDate).toLocaleDateString('th-TH');
      dateText = `ช่วงวันที่ ${s} - ${e}`;
    }

    const rowsPerPage = 20;
    const chunks: StudentStats[][] = [];
    for (let i = 0; i < filteredData.length; i += rowsPerPage) {
      chunks.push(filteredData.slice(i, i + rowsPerPage));
    }

    const doc = (
      <StudentAttendancePdfDocument
        chunks={chunks}
        rowsPerPage={rowsPerPage}
        schoolName={schoolName}
        schoolAffiliation={schoolAffiliation}
        schoolLogo={logoBase64}
        directorName={directorName}
        dateText={dateText}
        filterType={filterType}
        totalItems={filteredData.length}
        reportPrintedAt={new Date().toLocaleString('th-TH')}
        classLevel={selectedClassLevel}
        room={selectedRoom}
        specialProgram={selectedSpecialProgram}
        homeroomTeacherName={homeroomTeacherName}
      />
    );

    const blob = await pdf(doc).toBlob();
    saveAs(blob, `รายงานการมาเรียนนักเรียน_${selectedClassLevel}-${selectedRoom}_${new Date().toISOString().split('T')[0]}.pdf`);
  };

  return (
    <MainLayout>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-8 gap-4 bg-white dark:bg-[#2a2b2f]/60 backdrop-blur-sm p-5 rounded-[1.5rem] border border-gray-200/50 dark:border-white/5 transition-all duration-300">
          <div className="space-y-1 text-left">
            <div className="flex items-center gap-3">
              <BackButton to="/academic/hub/personnel_info" />
              <div className="p-2.5 bg-indigo-50 dark:bg-indigo-500/10 rounded-2xl shadow-sm border border-indigo-100 dark:border-indigo-500/20">
                <FaUsers className="text-indigo-600 dark:text-indigo-400" size={24} />
              </div>
              <div>
                <h1 className="text-2xl font-black text-gray-900 dark:text-white leading-tight tracking-tight">
                  สรุปการมาเรียนนักเรียน
                </h1>
                <p className="text-gray-500 dark:text-gray-400 text-xs font-bold pt-0.5">
                  รายงานสรุป ขาด ลา มา สาย ของนักเรียน (รายห้อง/วัน/สัปดาห์/เดือน/ภาคเรียน)
                </p>
              </div>
            </div>
          </div>
          <div className="flex gap-2">
            <button
              onClick={exportPDF}
              disabled={loading || filteredData.length === 0}
              className="flex items-center gap-2 px-4 py-2 bg-red-600 hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-xl transition-all shadow-sm font-bold"
            >
              <FaFilePdf /> Export PDF
            </button>
          </div>
        </div>

        {/* Filters */}
        <div className="bg-white dark:bg-[#2a2b2f] p-6 rounded-2xl shadow-sm border border-gray-200 dark:border-gray-700 mb-8 transition-all">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-6 items-end">
            <div className="space-y-1.5">
              <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">ชั้นเรียน</label>
              <select
                value={selectedClassLevel}
                onChange={(e) => setSelectedClassLevel(e.target.value)}
                className="w-full px-4 py-2.5 rounded-xl border border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-[#1e1f21] text-gray-900 dark:text-white outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all"
              >
                {availableLevels.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>

            <div className="space-y-1.5">
              <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">ห้อง</label>
              <select
                value={selectedRoom}
                onChange={(e) => setSelectedRoom(e.target.value)}
                className="w-full px-4 py-2.5 rounded-xl border border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-[#1e1f21] text-gray-900 dark:text-white outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all"
              >
                <option value="">ทุกห้อง</option>
                {Array.from({ length: 20 }, (_, i) => i + 1).map(r => <option key={r} value={r}>{r}</option>)}
              </select>
            </div>

            <div className="space-y-1.5">
              <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">รูปแบบรายงาน</label>
              <select
                value={filterType}
                onChange={(e) => setFilterType(e.target.value as any)}
                className="w-full px-4 py-2.5 rounded-xl border border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-[#1e1f21] text-gray-900 dark:text-white outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all"
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
              <div className="space-y-1.5">
                <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">เลือกวันที่</label>
                <input
                  type="date"
                  value={selectedDate}
                  onChange={(e) => setSelectedDate(e.target.value)}
                  className="w-full px-4 py-2.5 rounded-xl border border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-[#1e1f21] text-gray-900 dark:text-white outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all"
                />
              </div>
            )}
            {filterType === "weekly" && (
              <div className="space-y-1.5">
                <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">เลือกสัปดาห์</label>
                <input
                  type="week"
                  value={selectedWeek}
                  onChange={(e) => setSelectedWeek(e.target.value)}
                  className="w-full px-4 py-2.5 rounded-xl border border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-[#1e1f21] text-gray-900 dark:text-white outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all"
                />
              </div>
            )}
            {filterType === "monthly" && (
              <div className="space-y-1.5">
                <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">เลือกเดือน</label>
                <input
                  type="month"
                  value={selectedMonth}
                  onChange={(e) => setSelectedMonth(e.target.value)}
                  className="w-full px-4 py-2.5 rounded-xl border border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-[#1e1f21] text-gray-900 dark:text-white outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all"
                />
              </div>
            )}
            {filterType === "term" && (
              <div className="space-y-1.5">
                <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">เลือกภาคเรียน</label>
                <select
                  value={selectedTerm}
                  onChange={(e) => setSelectedTerm(e.target.value as "1" | "2")}
                  className="w-full px-4 py-2.5 rounded-xl border border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-[#1e1f21] text-gray-900 dark:text-white outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all"
                >
                  <option value="1">ภาคเรียนที่ 1</option>
                  <option value="2">ภาคเรียนที่ 2</option>
                </select>
              </div>
            )}
            {filterType === "yearly" && (
              <div className="space-y-1.5">
                <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">เลือกปีการศึกษา (พ.ศ.)</label>
                <input
                  type="number"
                  value={selectedYear + 543}
                  onChange={(e) => setSelectedYear(Number(e.target.value) - 543)}
                  className="w-full px-4 py-2.5 rounded-xl border border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-[#1e1f21] text-gray-900 dark:text-white outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all"
                />
              </div>
            )}
            {filterType === "custom" && (
              <>
                <div className="space-y-1.5">
                  <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">วันที่เริ่มต้น</label>
                  <input
                    type="date"
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                    className="w-full px-4 py-2.5 rounded-xl border border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-[#1e1f21] text-gray-900 dark:text-white outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">วันที่สิ้นสุด</label>
                  <input
                    type="date"
                    value={endDate}
                    onChange={(e) => setEndDate(e.target.value)}
                    className="w-full px-4 py-2.5 rounded-xl border border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-[#1e1f21] text-gray-900 dark:text-white outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all"
                  />
                </div>
              </>
            )}

            <div className="relative col-start-1 xl:col-start-auto">
              <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1.5">ค้นหา</label>
              <div className="relative">
                <FaSearch className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400" />
                <input
                  type="text"
                  placeholder="ค้นหาชื่อนักเรียน..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-11 pr-4 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-[#1e1f21] text-gray-900 dark:text-white focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none w-full transition-all"
                />
              </div>
            </div>
          </div>
        </div>

        {/* Summary Statistics */}
        {!loading && filteredData.length > 0 && (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-6 mb-8">
            <div className="bg-white dark:bg-[#2a2b2f] p-5 rounded-2xl shadow-sm border-l-4 border-l-green-500 border border-gray-200 dark:border-gray-700 hover:shadow-md transition-all group">
              <div className="text-gray-500 dark:text-gray-400 text-xs font-bold uppercase tracking-wider mb-1 group-hover:text-green-500 transition-colors">มา</div>
              <div className="text-3xl font-black text-gray-900 dark:text-white tracking-tight">
                {filteredData.reduce((sum, item) => sum + item.present, 0)}
              </div>
            </div>
            <div className="bg-white dark:bg-[#2a2b2f] p-5 rounded-2xl shadow-sm border-l-4 border-l-yellow-500 border border-gray-200 dark:border-gray-700 hover:shadow-md transition-all group">
              <div className="text-gray-500 dark:text-gray-400 text-xs font-bold uppercase tracking-wider mb-1 group-hover:text-yellow-500 transition-colors">สาย</div>
              <div className="text-3xl font-black text-gray-900 dark:text-white tracking-tight">
                {filteredData.reduce((sum, item) => sum + item.late, 0)}
              </div>
            </div>
            <div className="bg-white dark:bg-[#2a2b2f] p-5 rounded-2xl shadow-sm border-l-4 border-l-blue-500 border border-gray-200 dark:border-gray-700 hover:shadow-md transition-all group">
              <div className="text-gray-500 dark:text-gray-400 text-xs font-bold uppercase tracking-wider mb-1 group-hover:text-blue-500 transition-colors">ลา</div>
              <div className="text-3xl font-black text-gray-900 dark:text-white tracking-tight">
                {filteredData.reduce((sum, item) => sum + item.leave, 0)}
              </div>
            </div>
            <div className="bg-white dark:bg-[#2a2b2f] p-5 rounded-2xl shadow-sm border-l-4 border-l-red-500 border border-gray-200 dark:border-gray-700 hover:shadow-md transition-all group">
              <div className="text-gray-500 dark:text-gray-400 text-xs font-bold uppercase tracking-wider mb-1 group-hover:text-red-500 transition-colors">ขาด</div>
              <div className="text-3xl font-black text-gray-900 dark:text-white tracking-tight">
                {filteredData.reduce((sum, item) => sum + item.absent, 0)}
              </div>
            </div>
            <div className="bg-white dark:bg-[#2a2b2f] p-5 rounded-2xl shadow-sm border-l-4 border-l-orange-500 border border-gray-200 dark:border-gray-700 hover:shadow-md transition-all group">
              <div className="text-gray-500 dark:text-gray-400 text-xs font-bold uppercase tracking-wider mb-1 group-hover:text-orange-500 transition-colors">ไม่ลงเวลาออก</div>
              <div className="text-3xl font-black text-gray-900 dark:text-white tracking-tight">
                {filteredData.reduce((sum, item) => sum + item.noCheckout, 0)}
              </div>
            </div>
            <div className="bg-white dark:bg-[#2a2b2f] p-5 rounded-2xl shadow-sm border-l-4 border-l-indigo-500 border border-gray-200 dark:border-gray-700 hover:shadow-md transition-all group">
              <div className="text-gray-500 dark:text-gray-400 text-xs font-bold uppercase tracking-wider mb-1 group-hover:text-indigo-500 transition-colors">ไปราชการ</div>
              <div className="text-3xl font-black text-gray-900 dark:text-white tracking-tight">
                {filteredData.reduce((sum, item) => sum + item.official_travel, 0)}
              </div>
            </div>
          </div>
        )}

        <div className="bg-white dark:bg-[#2a2b2f] rounded-2xl shadow-sm border border-gray-200 dark:border-gray-700 overflow-hidden transition-all">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-gray-50/80 dark:bg-[#323338]/50 backdrop-blur-sm border-b border-gray-200 dark:border-gray-700">
                  <th className="px-6 py-5 text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-widest">ชื่อ - นามสกุล</th>
                  <th className="px-6 py-5 text-xs font-bold text-center text-green-600 dark:text-green-400 uppercase tracking-widest">มา</th>
                  <th className="px-6 py-5 text-xs font-bold text-center text-yellow-600 dark:text-yellow-400 uppercase tracking-widest">สาย</th>
                  <th className="px-6 py-5 text-xs font-bold text-center text-blue-600 dark:text-blue-400 uppercase tracking-widest">ลา</th>
                  <th className="px-6 py-5 text-xs font-bold text-center text-red-600 dark:text-red-400 uppercase tracking-widest">ขาด</th>
                  <th className="px-6 py-5 text-xs font-bold text-center text-orange-600 dark:text-orange-400 uppercase tracking-widest">ไม่ลงเวลาออก</th>
                  <th className="px-6 py-5 text-xs font-bold text-center text-indigo-600 dark:text-indigo-400 uppercase tracking-widest">ราชการ</th>
                  <th className="px-6 py-5 text-xs font-bold text-center text-gray-500 dark:text-gray-400 uppercase tracking-widest">รวม</th>
                  <th className="px-6 py-5 text-xs font-bold text-center text-indigo-600 dark:text-indigo-400 uppercase tracking-widest">ร้อยละ</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-gray-700/50">
                {loading ? (
                  <tr>
                    <td colSpan={9} className="px-6 py-20 text-center">
                      <div className="flex flex-col items-center gap-3">
                        <div className="w-10 h-10 border-4 border-indigo-600/20 border-t-indigo-600 rounded-full animate-spin"></div>
                        <p className="text-gray-500 dark:text-gray-400 font-medium tracking-wide">กำลังประมวลผลข้อมูล...</p>
                      </div>
                    </td>
                  </tr>
                ) : paginatedData.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="px-6 py-20 text-center text-gray-500 dark:text-gray-400">
                      <div className="flex flex-col items-center gap-2">
                        <FaSearch size={24} className="opacity-20 mb-2" />
                        <p className="font-medium">ไม่พบข้อมูลในช่วงเวลาที่เลือก</p>
                      </div>
                    </td>
                  </tr>
                ) : (
                  paginatedData.map((record) => (
                    <tr key={record.id} className="hover:bg-gray-50/50 dark:hover:bg-[#323338]/30 transition-colors">
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-4">
                          <div className="relative">
                            <img
                              src={record.profileUrl || defaultProfile}
                              alt={record.fullName}
                              className="w-11 h-11 rounded-xl object-cover ring-2 ring-gray-100 dark:ring-gray-700 shadow-sm"
                              onError={(e) => { (e.target as HTMLImageElement).src = defaultProfile; }}
                            />
                          </div>
                          <div>
                            <p className="font-bold text-gray-900 dark:text-white text-[15px] leading-tight">{record.fullName}</p>
                            <p className="text-[11px] text-gray-400 dark:text-gray-500 uppercase tracking-tighter mt-1 font-semibold">นักเรียน</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4 text-center">
                        <span className="inline-flex items-center justify-center w-9 h-9 rounded-xl bg-green-50 dark:bg-green-900/10 text-green-600 dark:text-green-400 font-bold border border-green-100 dark:border-green-900/20">
                          {record.present}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-center">
                        <span className="inline-flex items-center justify-center w-9 h-9 rounded-xl bg-yellow-50 dark:bg-yellow-900/10 text-yellow-600 dark:text-yellow-400 font-bold border border-yellow-100 dark:border-yellow-900/20">
                          {record.late}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-center">
                        <span className="inline-flex items-center justify-center w-9 h-9 rounded-xl bg-blue-50 dark:bg-blue-900/10 text-blue-600 dark:text-blue-400 font-bold border border-blue-100 dark:border-blue-900/20">
                          {record.leave}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-center">
                        <span className="inline-flex items-center justify-center w-9 h-9 rounded-xl bg-red-50 dark:bg-red-900/10 text-red-600 dark:text-red-400 font-bold border border-red-100 dark:border-red-900/20">
                          {record.absent}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-center">
                        <span className="inline-flex items-center justify-center w-9 h-9 rounded-xl bg-orange-50 dark:bg-orange-900/10 text-orange-600 dark:text-orange-400 font-bold border border-orange-100 dark:border-orange-900/20">
                          {record.noCheckout}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-center">
                        <span className="inline-flex items-center justify-center w-9 h-9 rounded-xl bg-indigo-50 dark:bg-indigo-900/10 text-indigo-600 dark:text-indigo-400 font-bold border border-indigo-100 dark:border-indigo-900/20">
                          {record.official_travel}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-center text-gray-500 dark:text-gray-400 font-medium">
                        {record.total}
                      </td>
                      <td className="px-6 py-4 text-center">
                        <div className="flex flex-col items-center">
                          <span className="text-[15px] font-black text-indigo-600 dark:text-indigo-400 leading-none">{record.percentage}%</span>
                          <div className="w-12 h-1 bg-gray-100 dark:bg-gray-700 rounded-full mt-1.5 overflow-hidden">
                            <div
                              className="h-full bg-indigo-600"
                              style={{ width: `${record.percentage}%` }}
                            />
                          </div>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {/* Pagination UI */}
          {!loading && totalPages > 1 && (
            <div className="px-6 py-4 bg-gray-50/50 dark:bg-[#323338]/30 border-t border-gray-100 dark:border-gray-700/50 flex flex-col sm:flex-row items-center justify-between gap-4">
              <div className="text-sm text-gray-500 dark:text-gray-400 font-medium">
                แสดง {((currentPage - 1) * itemsPerPage) + 1} ถึง {Math.min(currentPage * itemsPerPage, filteredData.length)} จาก {filteredData.length} รายการ
              </div>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => setCurrentPage(1)}
                  disabled={currentPage === 1}
                  className="p-2 rounded-xl hover:bg-white dark:hover:bg-gray-700 disabled:opacity-30 disabled:cursor-not-allowed transition-all text-gray-600 dark:text-gray-300 shadow-sm border border-transparent hover:border-gray-200 dark:hover:border-gray-600"
                  title="หน้าแรก"
                >
                  <FaAngleDoubleLeft size={14} />
                </button>
                <button
                  onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))}
                  disabled={currentPage === 1}
                  className="p-2 rounded-xl hover:bg-white dark:hover:bg-gray-700 disabled:opacity-30 disabled:cursor-not-allowed transition-all text-gray-600 dark:text-gray-300 shadow-sm border border-transparent hover:border-gray-200 dark:hover:border-gray-600"
                  title="ย้อนกลับ"
                >
                  <FaAngleLeft size={14} />
                </button>

                <div className="flex items-center gap-1 mx-2">
                  {getPageNumbers().map(pageNum => (
                    <button
                      key={pageNum}
                      onClick={() => setCurrentPage(pageNum)}
                      className={`w-9 h-9 rounded-xl text-sm font-bold transition-all ${
                        currentPage === pageNum
                          ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-500/30'
                          : 'hover:bg-white dark:hover:bg-gray-700 text-gray-500 dark:text-gray-400 border border-transparent hover:border-gray-200 dark:hover:border-gray-600'
                      }`}
                    >
                      {pageNum}
                    </button>
                  ))}
                </div>

                <button
                  onClick={() => setCurrentPage(prev => Math.min(prev + 1, totalPages))}
                  disabled={currentPage === totalPages}
                  className="p-2 rounded-xl hover:bg-white dark:hover:bg-gray-700 disabled:opacity-30 disabled:cursor-not-allowed transition-all text-gray-600 dark:text-gray-300 shadow-sm border border-transparent hover:border-gray-200 dark:hover:border-gray-600"
                  title="ถัดไป"
                >
                  <FaAngleRight size={14} />
                </button>
                <button
                  onClick={() => setCurrentPage(totalPages)}
                  disabled={currentPage === totalPages}
                  className="p-2 rounded-xl hover:bg-white dark:hover:bg-gray-700 disabled:opacity-30 disabled:cursor-not-allowed transition-all text-gray-600 dark:text-gray-300 shadow-sm border border-transparent hover:border-gray-200 dark:hover:border-gray-600"
                  title="หน้าสุดท้าย"
                >
                  <FaAngleDoubleRight size={14} />
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </MainLayout>
  );
};

export default StudentsAttendanceSummaryPage;