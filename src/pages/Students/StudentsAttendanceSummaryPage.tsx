import React, { useState, useEffect, useCallback } from "react";
import { useSelector, useDispatch } from "react-redux";
import { firestore } from "@/firebase";
import { collection, query, where, getDocs, documentId, doc, getDoc, Timestamp } from "firebase/firestore";
import { RootState } from "../../store";
import { fetchTeachersMap } from "@/store/slices/userMapSlice";
import { FaFilePdf, FaSearch, FaUsers } from "react-icons/fa";
import { ChevronLeft } from "lucide-react";
import MainLayout from "@/layouts/MainLayout";
import BackButton from "@/components/Shared/BackButton";
import jsPDF from "jspdf";
import html2canvas from "html2canvas";
import Swal from "sweetalert2";
import defaultProfile from "@/assets/profile.png";
import { getCurrentAcademicYear, getSemesterKey } from "@/utils/academicYearUtils";

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
  [key: string]: any;
}

const StudentsAttendanceSummaryPage: React.FC = () => {
  const { user: currentUser } = useSelector((state: RootState) => state.auth);
  const { teachers: teacherMap } = useSelector((state: RootState) => state.userMap);
  const dispatch = useDispatch();
  const schoolId = currentUser?.schoolId;

  const [loading, setLoading] = useState(false);
  const [students, setStudents] = useState<StudentInfo[]>([]);
  const [summaryData, setSummaryData] = useState<StudentStats[]>([]);
  const [searchTerm, setSearchTerm] = useState("");

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
        }).sort((a, b) => (a.studentNumber || 0) - (b.studentNumber || 0)); // Sort by student number
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

        console.log("Loaded Academic Year:", academicData.academicYear);
        console.log("Loaded Terms:", academicData.terms);
      } catch (error) {
        console.error("Error fetching calendar data:", error);
      }
    };

    fetchCalendarData();
  }, [schoolId]);

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
        let t1Count = 0;
        let t2Count = 0;

        // Helper function to check date and track exclusion reason
        const checkDate = (dStr: string, termLabel: string = "") => {
          const event = calendarEvents[dStr];
          const d = new Date(dStr);
          const dayOfWeek = d.getUTCDay();
          const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;

          // 1. ตรวจสอบจากระบบ (Manual Override)
          if (event) {
            if (event.type === 'schoolDay') return true;
            if (event.type === 'holiday' || event.type === 'specialHoliday') {
              if (!isWeekend) excluded.push({ date: dStr, reason: `${event.description || (event.type === 'holiday' ? 'วันหยุดราชการ (ระบบ)' : 'วันหยุดพิเศษ')} ${termLabel ? `(${termLabel})` : ''}` });
              return false;
            }
          }

          // 3. ตรวจสอบวันเสาร์-อาทิตย์
          if (isWeekend) return false;

          return true;
        };

        // Use loop to populate workingDates
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

          // คำนวณเปอร์เซ็นต์การมาเรียน (มา + สาย + ไม่ลงเวลาออก + ไปราชการ) / วันเรียนทั้งหมด
          const attended = present + late + noCheckout + official_travel;
          const percentage = workingDates.length > 0 ? ((attended / workingDates.length) * 100).toFixed(2) : "0.00";

          return {
            id: student.id, fullName: student.fullName, present, late, leave, absent, noCheckout, official_travel,
            profileUrl: student.profileImageUrl,
            total: workingDates.length, percentage
          };
        });
      } else {
        // Period Summary Logic
        let collectionName = "", docId = "";
        if (filterType === 'weekly') { collectionName = 'Weeksummary'; docId = selectedWeek; }
        else if (filterType === 'monthly') { collectionName = 'Monthsummary'; docId = selectedMonth; }
        else if (filterType === 'yearly') { collectionName = 'Yearsummary'; docId = currentAcademicYear; }
        else if (filterType === 'term') {
          collectionName = 'Semestersummary';
          docId = getSemesterKey(currentAcademicYear, selectedTerm);
        }

        console.log(`[Student Summary] Fetching from collection: ${collectionName}, docId: ${docId}`);

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
        console.log(`[Student Summary] Fetched ${newStats.length} records:`, newStats);
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
    if (filterType !== 'custom') fetchData();
  }, [fetchData, filterType]);

  const filteredData = summaryData.filter(item => item.fullName.toLowerCase().includes(searchTerm.toLowerCase()));

  const exportPDF = async () => {
    let schoolName = "", directorName = "";
    if (schoolId) {
      try {
        const schoolDoc = await getDoc(doc(firestore, "school-settings", schoolId));
        if (schoolDoc.exists()) {
          const data = schoolDoc.data();
          schoolName = data.schoolName || "";
          directorName = data.directorName || "";
        }
      } catch (e) { console.error("Error fetching school info:", e); }
    }

    const classLevel = selectedClassLevel;
    const homeroomTeacher = Object.values(teacherMap || {}).find((t: any) => t.homeroomGrade === classLevel);
    let homeroomTeacherName = "";
    if (homeroomTeacher) {
      const t = homeroomTeacher as any;
      if (t.firstName && t.lastName) {
        homeroomTeacherName = `${t.title || ''}${t.firstName} ${t.lastName}`;
      } else {
        homeroomTeacherName = t.name || "";
      }
    }

    const el = document.createElement('div');
    el.style.position = 'absolute'; el.style.left = '-9999px'; el.style.top = '0';
    el.style.width = '800px'; el.style.background = '#fff'; el.style.padding = '40px 50px';

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

    el.innerHTML = `
      <style> @import url('https://fonts.googleapis.com/css2?family=Sarabun:wght@400;700&family=TH+Sarabun+New:wght@400;700&display=swap'); * { font-family: 'TH Sarabun New', 'Sarabun', sans-serif; box-sizing: border-box; color: #000; } .header { text-align: center; margin-bottom: 20px; } .title { font-size: 24px; font-weight: bold; } .subtitle { font-size: 20px; font-weight: bold; } .info { font-size: 18px; margin-bottom: 20px; } table { width: 100%; border-collapse: collapse; margin-bottom: 20px; } th, td { border: 1px solid #000; padding: 8px 5px; font-size: 16px; text-align: center; } th { background-color: #f5f5f5; font-weight: bold; } td.left { text-align: left; padding-left: 8px; } .footer { display: flex; justify-content: space-between; margin-top: 40px; page-break-inside: avoid; } .sign-box { text-align: center; width: 45%; } </style>
      <div class="header"> <div class="title">สรุปการมาเรียนของนักเรียน ชั้น ${selectedClassLevel}/${selectedRoom} ${selectedSpecialProgram ? `(${selectedSpecialProgram})` : ''}</div> <div class="subtitle">${schoolName ? `โรงเรียน${schoolName}` : ''}</div> <div class="info">${dateText}</div> </div>
      <table> <thead> <tr> <th style="width: 30px;">ที่</th> <th>ชื่อ - นามสกุล</th> <th style="width: 40px;">มา</th> <th style="width: 40px;">สาย</th> <th style="width: 40px;">ลา</th> <th style="width: 40px;">ขาด</th> <th style="width: 60px;">ไม่ลงเวลา</th> <th style="width: 50px;">ไปราชการ</th> <th style="width: 50px;">รวมวัน</th> <th style="width: 50px;">ร้อยละ</th> </tr> </thead>
        <tbody> ${filteredData.map((r, index) => `
          <tr> 
            <td>${index + 1}</td> 
            <td class="left" style="text-align: left; padding-left: 8px;"><span>${r.fullName}</span></td> 
            <td>${r.present}</td> <td>${r.late}</td> <td>${r.leave}</td> <td>${r.absent}</td> <td>${r.noCheckout}</td> <td>${r.official_travel}</td> <td>${r.total}</td> <td>${r.percentage}%</td> 
          </tr>`).join('')} </tbody>
      </table>
      <div class="footer"> <div class="sign-box"> <div>ลงชื่อ..........................................ครูประจำชั้น</div> <div style="margin-top: 15px;">(${homeroomTeacherName || '..........................................'})</div> </div> <div class="sign-box"> <div>ลงชื่อ..........................................ผู้รับรอง</div> <div style="margin-top: 15px;">(${directorName ? directorName : '..........................................'})</div> <div style="margin-top: 5px;">ผู้อำนวยการโรงเรียน${schoolName}</div> </div> </div>
    `;

    document.body.appendChild(el);
    try {
      const canvas = await html2canvas(el, { scale: 2, useCORS: true });
      const pdf = new jsPDF('p', 'mm', 'a4');
      pdf.addImage(canvas.toDataURL('image/png'), 'PNG', 0, 0, pdf.internal.pageSize.getWidth(), (canvas.height * pdf.internal.pageSize.getWidth()) / canvas.width);
      pdf.save(`student_attendance_summary_${selectedClassLevel}-${selectedRoom}_${new Date().toISOString().split('T')[0]}.pdf`);
    } catch (err) {
      Swal.fire("Error", "ไม่สามารถส่งออก PDF ได้", "error");
    } finally {
      document.body.removeChild(el);
    }
  };

  return (
    <MainLayout>
      <div className="min-h-screen bg-gray-50 dark:bg-[#1e1f21] transition-colors duration-300 p-4 sm:p-6 lg:p-8">
        <div className="max-w-7xl mx-auto">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
            <div className="flex items-center gap-4">
              <BackButton to="/human-resources/hub" />
              <div>
                <h1 className="text-2xl font-bold text-gray-900 dark:text-white flex items-center gap-2"> 
                  <FaUsers className="text-indigo-600 dark:text-indigo-400" /> 
                  สรุปการมาเรียนนักเรียน 
                </h1>
                <p className="text-gray-500 dark:text-gray-400 text-sm mt-1">รายงานสรุป ขาด ลา มา สาย ของนักเรียน (รายห้อง/วัน/สัปดาห์/เดือน/ภาคเรียน)</p>
              </div>
            </div>
            <div className="flex gap-2"> 
              <button onClick={exportPDF} className="flex items-center gap-2 px-5 py-2.5 bg-red-600 hover:bg-red-700 text-white rounded-xl transition-all shadow-md hover:shadow-lg active:scale-95 font-bold"> 
                <FaFilePdf /> Export PDF 
              </button> 
            </div>
          </div>

          <div className="bg-white dark:bg-[#2a2b2f] p-4 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 mb-6">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-4 items-end">
              <div> <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">ชั้นเรียน</label> <select value={selectedClassLevel} onChange={(e) => setSelectedClassLevel(e.target.value)} className="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-[#1e1f21] text-gray-900 dark:text-white outline-none focus:ring-2 focus:ring-indigo-500"> {availableLevels.map(c => <option key={c} value={c}>{c}</option>)} </select> </div>
              <div> <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">ห้อง</label> <select value={selectedRoom} onChange={(e) => setSelectedRoom(e.target.value)} className="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-[#1e1f21] text-gray-900 dark:text-white outline-none focus:ring-2 focus:ring-indigo-500"> <option value="">ทุกห้อง</option> {Array.from({ length: 20 }, (_, i) => i + 1).map(r => <option key={r} value={r}>{r}</option>)} </select> </div>
              {specialPrograms.length > 0 && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">ห้องเรียนพิเศษ</label>
                  <select value={selectedSpecialProgram} onChange={(e) => setSelectedSpecialProgram(e.target.value)} className="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-[#1e1f21] text-gray-900 dark:text-white outline-none focus:ring-2 focus:ring-indigo-500">
                    <option value="">ทั้งหมด</option>
                    {specialPrograms.map(sp => <option key={sp.id} value={sp.name}>{sp.name}</option>)}
                  </select>
                </div>
              )}
              <div> <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">รูปแบบรายงาน</label> <select value={filterType} onChange={(e) => setFilterType(e.target.value as any)} className="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-[#1e1f21] text-gray-900 dark:text-white outline-none focus:ring-2 focus:ring-indigo-500"> <option value="daily">รายวัน</option> <option value="weekly">รายสัปดาห์</option> <option value="monthly">รายเดือน</option> <option value="term">ภาคเรียน</option> <option value="yearly">รายปี</option> <option value="custom">กำหนดเอง</option> </select> </div>
              {filterType === "daily" && (<div> <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">เลือกวันที่</label> <input type="date" value={selectedDate} onChange={(e) => setSelectedDate(e.target.value)} className="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-[#1e1f21] text-gray-900 dark:text-white outline-none focus:ring-2 focus:ring-indigo-500" /> </div>)}
              {filterType === "weekly" && (<div> <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">เลือกสัปดาห์</label> <input type="week" value={selectedWeek} onChange={(e) => setSelectedWeek(e.target.value)} className="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-[#1e1f21] text-gray-900 dark:text-white outline-none focus:ring-2 focus:ring-indigo-500" /> </div>)}
              {filterType === "monthly" && (<div> <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">เลือกเดือน</label> <input type="month" value={selectedMonth} onChange={(e) => setSelectedMonth(e.target.value)} className="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-[#1e1f21] text-gray-900 dark:text-white outline-none focus:ring-2 focus:ring-indigo-500" /> </div>)}
              {filterType === "term" && (<div> <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">เลือกภาคเรียน</label> <select value={selectedTerm} onChange={(e) => setSelectedTerm(e.target.value as "1" | "2")} className="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-[#1e1f21] text-gray-900 dark:text-white outline-none focus:ring-2 focus:ring-indigo-500"> <option value="1">ภาคเรียนที่ 1</option> <option value="2">ภาคเรียนที่ 2</option> </select> </div>)}
              {filterType === "yearly" && (<div> <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">เลือกปีการศึกษา (พ.ศ.)</label> <input type="number" value={selectedYear + 543} onChange={(e) => setSelectedYear(Number(e.target.value) - 543)} className="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-[#1e1f21] text-gray-900 dark:text-white outline-none focus:ring-2 focus:ring-indigo-500" /> </div>)}
              {filterType === "custom" && (<> <div> <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">วันที่เริ่มต้น</label> <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-[#1e1f21] text-gray-900 dark:text-white outline-none focus:ring-2 focus:ring-indigo-500" /> </div> <div> <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">วันที่สิ้นสุด</label> <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} className="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-[#1e1f21] text-gray-900 dark:text-white outline-none focus:ring-2 focus:ring-indigo-500" /> </div> <button onClick={fetchData} className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg transition-colors shadow-sm h-[42px]"><FaSearch /></button> </>)}
              <div className="relative col-start-1 xl:col-start-auto"> <FaSearch className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" /> <input type="text" placeholder="ค้นหาชื่อนักเรียน..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="pl-10 pr-4 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-[#1e1f21] text-gray-900 dark:text-white focus:ring-2 focus:ring-indigo-500 outline-none w-full" /> </div>
            </div>
          </div>

          {/* Term Summary Info (Only for Yearly) */}
          {filterType === 'yearly' && (
            <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-700/50 rounded-xl p-4 mb-6 flex flex-wrap gap-6">
              <div className="text-blue-800 dark:text-blue-200 font-semibold">📅 สรุปวันเรียนปีการศึกษา {selectedYear + 543}</div>
              <div className="text-sm text-blue-700 dark:text-blue-300">ภาคเรียนที่ 1: <span className="font-bold">{termCounts.term1}</span> วัน</div>
              <div className="text-sm text-blue-700 dark:text-blue-300">ภาคเรียนที่ 2: <span className="font-bold">{termCounts.term2}</span> วัน</div>
              <div className="text-sm text-blue-700 dark:text-blue-300">รวมทั้งสิ้น: <span className="font-bold">{termCounts.term1 + termCounts.term2}</span> วัน</div>
            </div>
          )}

          {/* Excluded Holidays Info */}
          {excludedDates.length > 0 && (
            <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-700/50 rounded-xl p-4 mb-6">
              <h3 className="text-sm font-bold text-yellow-800 dark:text-yellow-200 mb-2 flex items-center gap-2">
                <span className="w-2 h-2 bg-yellow-500 rounded-full"></span>
                วันหยุดที่ไม่ได้นับรวมในวันเรียน ({excludedDates.length} วัน)
              </h3>
              <div className="flex flex-wrap gap-2">
                {excludedDates.map((item, idx) => (
                  <span key={idx} className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-yellow-100 text-yellow-800 dark:bg-yellow-800 dark:text-yellow-100">
                    {new Date(item.date).toLocaleDateString('th-TH', { day: 'numeric', month: 'short' })}: {item.reason}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Summary Statistics */}
          {!loading && filteredData.length > 0 && (
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4 mb-6">
              <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-700/50 rounded-xl p-4">
                <div className="text-green-600 dark:text-green-400 text-sm font-medium mb-1">มา</div>
                <div className="text-2xl font-bold text-green-700 dark:text-green-300">
                  {filteredData.reduce((sum, item) => sum + item.present, 0)}
                </div>
              </div>
              <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-700/50 rounded-xl p-4">
                <div className="text-yellow-600 dark:text-yellow-400 text-sm font-medium mb-1">สาย</div>
                <div className="text-2xl font-bold text-yellow-700 dark:text-yellow-300">
                  {filteredData.reduce((sum, item) => sum + item.late, 0)}
                </div>
              </div>
              <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-700/50 rounded-xl p-4">
                <div className="text-blue-600 dark:text-blue-400 text-sm font-medium mb-1">ลา</div>
                <div className="text-2xl font-bold text-blue-700 dark:text-blue-300">
                  {filteredData.reduce((sum, item) => sum + item.leave, 0)}
                </div>
              </div>
              <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-700/50 rounded-xl p-4">
                <div className="text-red-600 dark:text-red-400 text-sm font-medium mb-1">ขาด</div>
                <div className="text-2xl font-bold text-red-700 dark:text-red-300">
                  {filteredData.reduce((sum, item) => sum + item.absent, 0)}
                </div>
              </div>
              <div className="bg-orange-50 dark:bg-orange-900/20 border border-orange-200 dark:border-orange-700/50 rounded-xl p-4">
                <div className="text-orange-600 dark:text-orange-400 text-sm font-medium mb-1">ไม่ลงเวลาออก</div>
                <div className="text-2xl font-bold text-orange-700 dark:text-orange-300">
                  {filteredData.reduce((sum, item) => sum + item.noCheckout, 0)}
                </div>
              </div>
              <div className="bg-indigo-50 dark:bg-indigo-900/20 border border-indigo-200 dark:border-indigo-700/50 rounded-xl p-4">
                <div className="text-indigo-600 dark:text-indigo-400 text-sm font-medium mb-1">ไปราชการ</div>
                <div className="text-2xl font-bold text-indigo-700 dark:text-indigo-300">
                  {filteredData.reduce((sum, item) => sum + item.official_travel, 0)}
                </div>
              </div>
            </div>
          )}

          <div className="bg-white dark:bg-[#2a2b2f] rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-gray-50 dark:bg-[#323338] border-b border-gray-200 dark:border-gray-700">
                    <th className="px-6 py-4 text-sm font-semibold text-gray-600 dark:text-gray-300">ชื่อ - นามสกุล</th>
                    <th className="px-6 py-4 text-sm font-semibold text-center text-green-600 dark:text-green-400">มา</th>
                    <th className="px-6 py-4 text-sm font-semibold text-center text-yellow-600 dark:text-yellow-400">สาย</th>
                    <th className="px-6 py-4 text-sm font-semibold text-center text-blue-600 dark:text-blue-400">ลา</th>
                    <th className="px-6 py-4 text-sm font-semibold text-center text-red-600 dark:text-red-400">ขาด</th>
                    <th className="px-6 py-4 text-sm font-semibold text-center text-orange-600 dark:text-orange-400">ไม่ลงเวลาออก</th>
                    <th className="px-6 py-4 text-sm font-semibold text-center text-indigo-600 dark:text-indigo-400">ไปราชการ</th>
                    <th className="px-6 py-4 text-sm font-semibold text-gray-600 dark:text-gray-300 text-center">รวมวันเรียน</th>
                    <th className="px-6 py-4 text-sm font-semibold text-indigo-600 dark:text-indigo-400 text-center">ร้อยละ</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                  {loading ? (<tr><td colSpan={8} className="px-6 py-8 text-center text-gray-500 dark:text-gray-400">กำลังประมวลผลข้อมูล...</td></tr>
                  ) : filteredData.length === 0 ? (<tr><td colSpan={8} className="px-6 py-8 text-center text-gray-500 dark:text-gray-400">ไม่พบข้อมูลในช่วงเวลาที่เลือก</td></tr>
                  ) : (
                    filteredData.map((record) => (
                      <tr key={record.id} className="hover:bg-gray-50 dark:hover:bg-[#323338]/50 transition-colors">
                        <td className="px-6 py-4">
                          <div className="flex items-center gap-3">
                            <img
                              src={record.profileUrl || defaultProfile}
                              alt={record.fullName}
                              className="w-10 h-10 rounded-full object-cover border border-gray-200 dark:border-gray-600"
                              onError={(e) => { (e.target as HTMLImageElement).src = defaultProfile; }}
                            />
                            <span className="font-medium text-gray-900 dark:text-white">{record.fullName}</span>
                          </div>
                        </td>
                        <td className="px-6 py-4 text-center font-medium text-green-600 dark:text-green-400">{record.present}</td>
                        <td className="px-6 py-4 text-center font-medium text-yellow-600 dark:text-yellow-400">{record.late}</td>
                        <td className="px-6 py-4 text-center font-medium text-blue-600 dark:text-blue-400">{record.leave}</td>
                        <td className="px-6 py-4 text-center font-medium text-red-600 dark:text-red-400">{record.absent}</td>
                        <td className="px-6 py-4 text-center font-medium text-orange-600 dark:text-orange-400">{record.noCheckout}</td>
                        <td className="px-6 py-4 text-center font-medium text-indigo-600 dark:text-indigo-400">{record.official_travel}</td>
                        <td className="px-6 py-4 text-center text-gray-500 dark:text-gray-400">{record.total}</td>
                        <td className="px-6 py-4 text-center font-bold text-indigo-600 dark:text-indigo-400">{record.percentage}%</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    </MainLayout>
  );
};

export default StudentsAttendanceSummaryPage;