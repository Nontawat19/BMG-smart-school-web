import React, { useState, useEffect } from "react";
import { useSelector } from "react-redux";
import { firestore } from "@/firebase";
import { collection, query, where, getDocs, documentId, doc, getDoc, Timestamp } from "firebase/firestore";
import { RootState } from "../../store";
import Navbar from "../../components/Navbar/Navbar";
import LeftSidebar from "../../components/Sidebar/LeftSidebar";
import { FaFilePdf, FaSearch, FaCalendarAlt } from "react-icons/fa";
import jsPDF from "jspdf";
import html2canvas from "html2canvas";
import Swal from "sweetalert2";
import defaultProfile from "@/assets/profile.png";
import { getCurrentAcademicYear, getSemesterKey } from "@/utils/academicYearUtils";
import MainLayout from "@/layouts/MainLayout";
import BackButton from "@/components/Shared/BackButton";

interface AttendanceRecord {
  id: string;
  userId: string;
  fullName: string;
  checkInTime?: string;
  status?: string; // 'OnTime', 'Late', 'Leave'
  date: string;
}

interface TeacherStats {
  id: string;
  fullName: string;
  profileUrl?: string;
  present: number;
  late: number;
  leave: number;
  absent: number;
  noCheckout: number;
  officialTravel: number;
  total: number;
  percentage: string;
}

const TeacherAttendanceSummaryPage: React.FC = () => {
  const { user: currentUser } = useSelector((state: RootState) => state.auth);
  const schoolId = currentUser?.schoolId;

  const [loading, setLoading] = useState(false);
  const [teachers, setTeachers] = useState<any[]>([]);
  const [summaryData, setSummaryData] = useState<TeacherStats[]>([]);
  const [searchTerm, setSearchTerm] = useState("");

  // Filter States
  const [filterType, setFilterType] = useState<"daily" | "weekly" | "monthly" | "term" | "yearly" | "custom">("daily");
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0]);
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
        const q = query(collection(firestore, "school-settings", schoolId, "teachers"));
        const snapshot = await getDocs(q);
        const teacherList = snapshot.docs.map(doc => {
          const data = doc.data();
          return {
            id: doc.id,
            fullName: `${data.title || ''}${data.firstName || ''} ${data.lastName || ''}`.trim(),
            ...data
          };
        });
        setTeachers(teacherList);
      } catch (error) {
        console.error("Error fetching teachers:", error);
      }
    };
    fetchTeachers();
  }, [schoolId]);


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

  const fetchData = async () => {
    if (!schoolId) return;
    // รอให้โหลดข้อมูลครูเสร็จก่อน
    if (teachers.length === 0) return;

    setLoading(true);
    try {
      let startStr = "";
      let endStr = "";

      if (filterType === "daily") {
        startStr = selectedDate;
        endStr = selectedDate;
      } else if (filterType === "custom") {
        if (!startDate || !endDate) {
          Swal.fire("แจ้งเตือน", "กรุณาเลือกวันที่เริ่มต้นและสิ้นสุด", "warning");
          setLoading(false);
          return;
        }
        startStr = startDate;
        endStr = endDate;
      }

      if (filterType === 'daily' || filterType === 'custom') {
        const promises = teachers.map(async (teacher) => {
          const ref = collection(firestore, "school-settings", schoolId, "teachers", teacher.id, "attendance");
          const q = query(ref, where(documentId(), ">=", startStr), where(documentId(), "<=", endStr));
          const snap = await getDocs(q);
          return snap.docs.map(doc => {
            const data = doc.data();
            let timeStr = "";
            if (data.checkinTime && data.checkinTime.toDate) {
              timeStr = data.checkinTime.toDate().toLocaleTimeString("th-TH", { hour: '2-digit', minute: '2-digit' });
            }
            return {
              id: doc.id,
              userId: teacher.id,
              fullName: teacher.fullName || `${teacher.firstName} ${teacher.lastName}`.trim(),
              checkInTime: timeStr,
              status: data.status,
              date: doc.id
            } as AttendanceRecord;
          });
        });

        const results = await Promise.all(promises);
        const records = results.flat();

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

        const baseList = teachers.length > 0 ? teachers :
          Array.from(new Set(records.map(r => r.userId))).map(id => {
            const r = records.find(rec => rec.userId === id);
            return { id, fullName: r?.fullName || "Unknown" };
          });

        const stats: TeacherStats[] = baseList.map(teacher => {
          const teacherRecords = records.filter(r => r.userId === teacher.id);
          const uniqueDays = new Set(teacherRecords.map(r => r.date));
          let present = 0, late = 0, leave = 0, noCheckout = 0, officialTravel = 0, explicitAbsent = 0;

          uniqueDays.forEach(day => {
            const rec = teacherRecords.find(r => r.date === day);
            if (rec) {
              if (rec.status === 'สาย' || rec.status === 'Late') late++;
              else if (rec.status === 'ลา' || rec.status === 'ล' || rec.status === 'Leave') leave++;
              else if (rec.status === 'มา' || rec.status === 'OnTime' || rec.status === 'Normal' || rec.status === 'กลับก่อน') present++;
              else if (rec.status === 'ไม่ลงเวลาออก' || rec.status === 'NoCheckout') noCheckout++;
              else if (rec.status === 'ไปราชการ' || rec.status === 'officialTravel' || rec.status === 'OfficialTravel') officialTravel++;
              else if (rec.status === 'ขาด' || rec.status === 'Absent') explicitAbsent++;
            }
          });

          const missingRecordDays = workingDates.filter(d => !teacherRecords.find(r => r.date === d)).length;
          const absent = explicitAbsent + missingRecordDays;
          const attended = present + late + noCheckout + officialTravel;
          const percentage = workingDates.length > 0 ? ((attended / workingDates.length) * 100).toFixed(2) : "0.00";

          return {
            id: teacher.id, fullName: teacher.fullName || `${teacher.firstName || ''} ${teacher.lastName || ''}`.trim() || "ไม่ระบุชื่อ",
            profileUrl: teacher.profileImageUrl,
            present, late, leave, absent, noCheckout, officialTravel,
            total: workingDates.length, percentage
          };
        });
        setSummaryData(stats);
      } else {
        // Period Summary Logic
        let collectionName = "", docId = "";
        if (filterType === 'weekly') { collectionName = 'Weeksummary'; docId = selectedWeek; }
        else if (filterType === 'monthly') { collectionName = 'Monthsummary'; docId = selectedMonth; }
        else if (filterType === 'term') {
          collectionName = 'Semestersummary';
          docId = getSemesterKey(currentAcademicYear, selectedTerm);
        }
        else if (filterType === 'yearly') { collectionName = 'Yearsummary'; docId = currentAcademicYear; }

        console.log(`[Teacher Summary] Fetching from collection: ${collectionName}, docId: ${docId}`);

        const promises = teachers.map(async (teacher) => {
          const ref = doc(firestore, "school-settings", schoolId, "teachers", teacher.id, collectionName, docId);
          const snap = await getDoc(ref);
          return { teacher, data: snap.exists() ? snap.data() : {} };
        });
        const results = await Promise.all(promises);

        const stats: TeacherStats[] = results.map(({ teacher, data }) => {
          const present = data.present || 0;
          const late = data.late || 0;
          const leave = data.leave || 0;
          const absent = data.absent || 0;
          const noCheckout = data.noCheckout || 0;
          const officialTravel = data.officialTravel || 0;

          const total = present + late + leave + absent + noCheckout + officialTravel;
          const attended = present + late + noCheckout + officialTravel;
          const percentage = total > 0 ? ((attended / total) * 100).toFixed(2) : "0.00";

          return {
            id: teacher.id,
            fullName: teacher.fullName || `${teacher.firstName || ''} ${teacher.lastName || ''}`.trim() || "ไม่ระบุชื่อ",
            profileUrl: teacher.profileImageUrl,
            present, late, leave, absent, noCheckout, officialTravel,
            total, percentage
          };
        });
        console.log(`[Teacher Summary] Fetched ${stats.length} records:`, stats);
        setSummaryData(stats);
      }

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
  }, [filterType, selectedDate, selectedMonth, teachers, calendarEvents, selectedTerm, terms]); // Auto fetch on simple filters, manual for custom

  const filteredData = summaryData.filter(item =>
    item.fullName.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const exportPDF = async () => {
    // ดึงข้อมูลโรงเรียนเพื่อนำมาแสดงในหัวกระดาษ
    let schoolName = "";
    let directorName = "";
    if (schoolId) {
      try {
        const schoolDoc = await getDoc(doc(firestore, "school-settings", schoolId));
        if (schoolDoc.exists()) {
          const data = schoolDoc.data();
          schoolName = data.schoolName || "";
          directorName = data.directorName || "";
        }
      } catch (e) {
        console.error("Error fetching school info:", e);
      }
    }

    const el = document.createElement('div');
    el.style.position = 'absolute';
    el.style.left = '-9999px';
    el.style.top = '0';
    el.style.width = '800px';
    el.style.background = '#fff';
    el.style.padding = '40px 50px';

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

    el.innerHTML = `
      <style>
        @import url('https://fonts.googleapis.com/css2?family=Sarabun:wght@400;700&family=TH+Sarabun+New:wght@400;700&display=swap');
        * { font-family: 'TH Sarabun New', 'Sarabun', sans-serif; box-sizing: border-box; color: #000; }
        .header { text-align: center; margin-bottom: 20px; }
        .title { font-size: 24px; font-weight: bold; margin-bottom: 5px; }
        .subtitle { font-size: 20px; font-weight: bold; margin-bottom: 5px; }
        .info { font-size: 18px; margin-bottom: 20px; }
        table { width: 100%; border-collapse: collapse; margin-bottom: 20px; }
        th, td { border: 1px solid #000; padding: 8px 5px; font-size: 16px; line-height: 1.2; vertical-align: middle; }
        th { background-color: #f5f5f5; text-align: center; font-weight: bold; height: 35px; }
        td.center { text-align: center; }
        td.left { text-align: left; padding-left: 8px; }
        .footer { display: flex; justify-content: space-between; margin-top: 40px; page-break-inside: avoid; }
        .sign-box { text-align: center; width: 32%; }
        .sign-name { margin-top: 15px; }
        .sign-pos { margin-top: 5px; }
      </style>
      
      <div class="header">
        <div class="title">สรุปการลงเวลาปฏิบัติราชการข้าราชการครูและบุคลากรทางการศึกษา</div>
        <div class="subtitle">${schoolName ? `โรงเรียน${schoolName}` : 'โรงเรียน................................................'}</div>
        <div class="info">ประจำ${filterType === 'daily' ? 'วันที่' : (filterType === 'monthly' ? 'เดือน' : filterType === 'term' ? '' : 'ช่วงวันที่')} ${dateText}</div>
      </div>

      <table>
        <thead>
          <tr>
            <th style="width: 40px;">ที่</th>
            <th>ชื่อ - นามสกุล</th>
            <th style="width: 50px;">มา</th>
            <th style="width: 50px;">สาย</th>
            <th style="width: 50px;">ลา</th>
            <th style="width: 50px;">ขาด</th>
            <th style="width: 60px;">ไปราชการ</th>
            <th style="width: 70px;">ไม่ลงเวลาออก</th>
            <th style="width: 60px;">รวมวัน</th>
            <th style="width: 60px;">ร้อยละ</th>
            <th style="width: 80px;">หมายเหตุ</th>
          </tr>
        </thead>
        <tbody>
          ${filteredData.map((r, index) => `
            <tr>
              <td class="center">${index + 1}</td>
              <td class="left" style="display: flex; align-items: center; gap: 8px;">
                <img src="${r.profileUrl || defaultProfile}" style="width: 24px; height: 24px; border-radius: 50%; object-fit: cover;" crossorigin="anonymous" />
                <span>${r.fullName}</span>
              </td>
              <td class="center">${r.present}</td>
              <td class="center">${r.late}</td>
              <td class="center">${r.leave}</td>
              <td class="center">${r.absent}</td>
              <td class="center">${r.officialTravel}</td>
              <td class="center">${r.noCheckout}</td>
              <td class="center">${r.total}</td>
              <td class="center">${r.percentage}%</td>
              <td></td>
            </tr>
          `).join('')}
        </tbody>
      </table>

      <div class="footer">
        <div class="sign-box">
            <div>ลงชื่อ..........................................ผู้สรุป</div>
            <div class="sign-name">(..........................................)</div>
            <div class="sign-pos">ตำแหน่ง..........................................</div>
        </div>
        <div class="sign-box">
            <div>ลงชื่อ..........................................ผู้ตรวจเสนอ</div>
            <div class="sign-name">(..........................................)</div>
            <div class="sign-pos">หัวหน้าฝ่ายบริหารงานบุคคล</div>
        </div>
        <div class="sign-box">
            <div>ลงชื่อ..........................................ผู้รับรอง</div>
            <div class="sign-name">(${directorName ? directorName : '..........................................'})</div>
            <div class="sign-pos">ผู้อำนวยการโรงเรียน${schoolName}</div>
        </div>
      </div>
    `;

    document.body.appendChild(el);

    try {
      const canvas = await html2canvas(el, { scale: 2, useCORS: true });
      const imgData = canvas.toDataURL('image/png');

      const pdf = new jsPDF('p', 'mm', 'a4');
      const pdfWidth = pdf.internal.pageSize.getWidth();
      const pdfHeight = pdf.internal.pageSize.getHeight();

      const imgProps = pdf.getImageProperties(imgData);
      const imgHeight = (imgProps.height * pdfWidth) / imgProps.width;

      let heightLeft = imgHeight;
      let position = 0;

      pdf.addImage(imgData, 'PNG', 0, position, pdfWidth, imgHeight);
      heightLeft -= pdfHeight;

      while (heightLeft >= 0) {
        position = heightLeft - imgHeight;
        pdf.addPage();
        pdf.addImage(imgData, 'PNG', 0, position, pdfWidth, imgHeight);
        heightLeft -= pdfHeight;
      }

      pdf.save(`attendance_summary_${new Date().toISOString().split('T')[0]}.pdf`);
    } catch (err) {
      console.error("PDF Export Error:", err);
      Swal.fire("Error", "ไม่สามารถส่งออก PDF ได้", "error");
    } finally {
      document.body.removeChild(el);
    }
  };

  return (
    <MainLayout>
      <div className="min-h-screen bg-gray-50 dark:bg-[#1e1f21] transition-colors duration-300 p-4 sm:p-6 lg:p-8">
        <div className="max-w-7xl mx-auto">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
            <div className="flex items-center gap-4">
              <BackButton to="/human-resources/hub" />
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
                onClick={exportPDF}
                className="flex items-center gap-2 px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg transition-colors shadow-sm"
              >
                <FaFilePdf /> Export PDF
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
                  placeholder="ค้นหาชื่อครู..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10 pr-4 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-[#1e1f21] text-gray-900 dark:text-white focus:ring-2 focus:ring-indigo-500 outline-none w-full"
                />
              </div>
            </div>
          </div>

          {/* Summary Statistics */}
          {!loading && summaryData.length > 0 && (
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4 mb-6">
              <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-700/50 rounded-xl p-4">
                <div className="text-green-600 dark:text-green-400 text-sm font-medium mb-1">มา (ปกติ)</div>
                <div className="text-2xl font-bold text-green-700 dark:text-green-300">
                  {summaryData.reduce((sum, item) => sum + item.present, 0)}
                </div>
              </div>
              <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-700/50 rounded-xl p-4">
                <div className="text-yellow-600 dark:text-yellow-400 text-sm font-medium mb-1">สาย</div>
                <div className="text-2xl font-bold text-yellow-700 dark:text-yellow-300">
                  {summaryData.reduce((sum, item) => sum + item.late, 0)}
                </div>
              </div>
              <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-700/50 rounded-xl p-4">
                <div className="text-blue-600 dark:text-blue-400 text-sm font-medium mb-1">ลา</div>
                <div className="text-2xl font-bold text-blue-700 dark:text-blue-300">
                  {summaryData.reduce((sum, item) => sum + item.leave, 0)}
                </div>
              </div>
              <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-700/50 rounded-xl p-4">
                <div className="text-red-600 dark:text-red-400 text-sm font-medium mb-1">ขาด</div>
                <div className="text-2xl font-bold text-red-700 dark:text-red-300">
                  {summaryData.reduce((sum, item) => sum + item.absent, 0)}
                </div>
              </div>
              <div className="bg-purple-50 dark:bg-purple-900/20 border border-purple-200 dark:border-purple-700/50 rounded-xl p-4">
                <div className="text-purple-600 dark:text-purple-400 text-sm font-medium mb-1">ไปราชการ</div>
                <div className="text-2xl font-bold text-purple-700 dark:text-purple-300">
                  {summaryData.reduce((sum, item) => sum + item.officialTravel, 0)}
                </div>
              </div>
              <div className="bg-orange-50 dark:bg-orange-900/20 border border-orange-200 dark:border-orange-700/50 rounded-xl p-4">
                <div className="text-orange-600 dark:text-orange-400 text-sm font-medium mb-1">ไม่ลงเวลาออก</div>
                <div className="text-2xl font-bold text-orange-700 dark:text-orange-300">
                  {summaryData.reduce((sum, item) => sum + item.noCheckout, 0)}
                </div>
              </div>
            </div>
          )}

          {/* Table */}
          <div className="bg-white dark:bg-[#2a2b2f] rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-gray-50 dark:bg-[#323338] border-b border-gray-200 dark:border-gray-700">
                    <th className="px-6 py-4 text-sm font-semibold text-gray-600 dark:text-gray-300">ชื่อ - นามสกุล</th>
                    <th className="px-6 py-4 text-sm font-semibold text-center text-green-600 dark:text-green-400">มา (ปกติ)</th>
                    <th className="px-6 py-4 text-sm font-semibold text-center text-yellow-600 dark:text-yellow-400">สาย</th>
                    <th className="px-6 py-4 text-sm font-semibold text-center text-blue-600 dark:text-blue-400">ลา</th>
                    <th className="px-6 py-4 text-sm font-semibold text-center text-red-600 dark:text-red-400">ขาด</th>
                    <th className="px-6 py-4 text-sm font-semibold text-center text-purple-600 dark:text-purple-400">ไปราชการ</th>
                    <th className="px-6 py-4 text-sm font-semibold text-center text-orange-600 dark:text-orange-400">ไม่ลงเวลาออก</th>
                    <th className="px-6 py-4 text-sm font-semibold text-gray-600 dark:text-gray-300 text-center">รวมวันทำการ</th>
                    <th className="px-6 py-4 text-sm font-semibold text-indigo-600 dark:text-indigo-400 text-center">ร้อยละ</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                  {loading ? (
                    <tr>
                      <td colSpan={9} className="px-6 py-8 text-center text-gray-500 dark:text-gray-400">
                        กำลังประมวลผลข้อมูล...
                      </td>
                    </tr>
                  ) : filteredData.length === 0 ? (
                    <tr>
                      <td colSpan={9} className="px-6 py-8 text-center text-gray-500 dark:text-gray-400">
                        ไม่พบข้อมูลในช่วงเวลาที่เลือก
                      </td>
                    </tr>
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
                        <td className="px-6 py-4 text-center font-medium text-green-600 dark:text-green-400">
                          {record.present}
                        </td>
                        <td className="px-6 py-4 text-center font-medium text-yellow-600 dark:text-yellow-400">
                          {record.late}
                        </td>
                        <td className="px-6 py-4 text-center font-medium text-blue-600 dark:text-blue-400">
                          {record.leave}
                        </td>
                        <td className="px-6 py-4 text-center font-medium text-red-600 dark:text-red-400">
                          {record.absent}
                        </td>
                        <td className="px-6 py-4 text-center font-medium text-purple-600 dark:text-purple-400">
                          {record.officialTravel}
                        </td>
                        <td className="px-6 py-4 text-center font-medium text-orange-600 dark:text-orange-400">
                          {record.noCheckout}
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
    </MainLayout>
  );
};

export default TeacherAttendanceSummaryPage;