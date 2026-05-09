import React, { useState, useEffect, useRef } from "react";
import { useSelector } from "react-redux";
import { RootState } from "../../store";
import { firestore } from "@/firebase";
import {
  collection,
  query, where,
  getDoc,
  getDocs,
  writeBatch,
  doc,
  Timestamp,
  onSnapshot,
  increment,
  limit,
  serverTimestamp,
} from "firebase/firestore";
import { updatePeriodSummaries } from "@/utils/periodSummaryUtils";
import Swal from "sweetalert2";
import Select, { StylesConfig } from "react-select";
import { useTheme } from "../../ThemeContext";
import MainLayout from "@/layouts/MainLayout";
import BackButton from "@/components/Shared/BackButton";
import { isNonOfficialHoliday } from "../../utils/calendarUtils";

// ... (Interface StudentOption และ CustomStyles ไม่มีการเปลี่ยนแปลง)

interface StudentOption {
  value: string; // student document ID
  label: string; // student name and ID for display
  studentId: string; // student ID (e.g., 48120)
  name: string; // student full name without ID
  class: string; // class level/room (e.g., ม.1/1)
}

const customStyles = (isDarkMode: boolean): StylesConfig<StudentOption, false> => ({
  control: (base) => ({
    ...base,
    backgroundColor: isDarkMode ? '#1e1f21' : '#fff',
    borderColor: isDarkMode ? '#4b5563' : '#d1d5db',
  }),
  menu: (base) => ({ ...base, backgroundColor: isDarkMode ? '#2a2b2f' : '#fff' }),
  option: (base, { isFocused, isSelected }) => ({
    ...base,
    backgroundColor: isSelected ? (isDarkMode ? '#4f46e5' : '#6366f1') : isFocused ? (isDarkMode ? '#374151' : '#eef2ff') : 'transparent',
    color: isSelected ? 'white' : (isDarkMode ? 'white' : '#111827'),
  }),
  singleValue: (base) => ({ ...base, color: isDarkMode ? 'white' : '#111827' }),
  input: (base) => ({ ...base, color: isDarkMode ? 'white' : '#111827' }),
});

const thaiMonths = [
  'มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน',
  'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม'
];

const ThaiDatePicker: React.FC<{
  value: string | null;
  onChange: (value: string) => void;
  placeholder?: string;
  events?: Record<string, any>;
}> = ({ value, onChange, placeholder, events }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [viewDate, setViewDate] = useState(new Date());
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (value) {
      const [y, m, d] = value.split('-').map(Number);
      setViewDate(new Date(y, m - 1, d));
    }
  }, [value, isOpen]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleSelectDate = (day: number) => {
    const year = viewDate.getFullYear();
    const month = viewDate.getMonth() + 1;
    const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    onChange(dateStr);
    setIsOpen(false);
  };

  const changeMonth = (delta: number) => {
    setViewDate(new Date(viewDate.getFullYear(), viewDate.getMonth() + delta, 1));
  };

  const renderDays = () => {
    const year = viewDate.getFullYear();
    const month = viewDate.getMonth();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const firstDayOfWeek = new Date(year, month, 1).getDay();

    const days = [];
    for (let i = 0; i < firstDayOfWeek; i++) {
      days.push(<div key={`empty-${i}`} />);
    }

    for (let d = 1; d <= daysInMonth; d++) {
      const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      const isSelected = value === dateStr;
      const isToday = new Date().toDateString() === new Date(year, month, d).toDateString();
      const event = events?.[dateStr];

      let cellClass = 'hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-200';
      let titleText = '';

      if (isSelected) {
        cellClass = 'bg-indigo-600 text-white';
      } else if (event) {
        if (event.type === 'holiday') {
          cellClass = 'bg-red-100 text-red-600 hover:bg-red-200 dark:bg-red-900/30 dark:text-red-300';
          titleText = event.description || 'วันหยุดราชการ';
        } else if (event.type === 'specialHoliday') {
          cellClass = 'bg-yellow-100 text-yellow-600 hover:bg-yellow-200 dark:bg-yellow-900/30 dark:text-yellow-300';
          titleText = event.description || 'วันหยุดกรณีพิเศษ';
        } else if (event.type === 'schoolDay') {
          cellClass = 'bg-blue-100 text-blue-600 hover:bg-blue-200 dark:bg-blue-900/30 dark:text-blue-300';
          titleText = event.description || 'วันเรียนชดเชย';
        }
      }

      if (isToday && !isSelected) {
        cellClass += ' border border-indigo-500 text-indigo-500';
      }

      days.push(
        <button
          key={d}
          type="button"
          onClick={() => handleSelectDate(d)}
          className={`w-8 h-8 rounded-full flex items-center justify-center text-sm transition-colors ${cellClass}`}
          title={titleText}
        >
          {d}
        </button>
      );
    }
    return days;
  };

  const displayValue = value
    ? (() => {
      const [y, m, d] = value.split('-').map(Number);
      return `${d} ${thaiMonths[m - 1]} ${y + 543}`;
    })()
    : '';

  return (
    <div className="relative w-full" ref={containerRef}>
      <div
        onClick={() => setIsOpen(!isOpen)}
        className="w-full bg-white dark:bg-[#1e1f21] border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 text-gray-900 dark:text-white cursor-pointer flex justify-between items-center focus-within:ring-2 focus-within:ring-indigo-500"
      >
        <span className={!displayValue ? 'text-gray-400' : ''}>{displayValue || placeholder || 'เลือกวันที่'}</span>
        <span className="text-gray-500">📅</span>
      </div>

      {isOpen && (
        <div className="absolute z-50 mt-1 w-72 bg-white dark:bg-gray-800 rounded-lg shadow-xl border border-gray-200 dark:border-gray-700 p-4 left-0 sm:left-auto sm:right-0 md:left-0">
          <div className="flex justify-between items-center mb-4">
            <button type="button" onClick={() => changeMonth(-1)} className="p-1 hover:bg-gray-100 dark:hover:bg-gray-700 rounded text-gray-600 dark:text-gray-300">&lt;</button>
            <span className="font-bold text-gray-900 dark:text-white">
              {thaiMonths[viewDate.getMonth()]} {viewDate.getFullYear() + 543}
            </span>
            <button type="button" onClick={() => changeMonth(1)} className="p-1 hover:bg-gray-100 dark:hover:bg-gray-700 rounded text-gray-600 dark:text-gray-300">&gt;</button>
          </div>

          <div className="grid grid-cols-7 gap-1 mb-2 text-center">
            {['อา', 'จ', 'อ', 'พ', 'พฤ', 'ศ', 'ส'].map(d => (
              <span key={d} className="text-xs font-semibold text-gray-500 dark:text-gray-400">{d}</span>
            ))}
          </div>

          <div className="grid grid-cols-7 gap-1">
            {renderDays()}
          </div>
        </div>
      )}
    </div>
  );
};

const LeaveRequestPage: React.FC = () => {
  const { user } = useSelector((state: RootState) => state.auth);
  const schoolId = user?.schoolId;
  const [students, setStudents] = useState<StudentOption[]>([]);
  const [selectedStudent, setSelectedStudent] = useState<StudentOption | null>(
    null
  );
  const [currentAcademicYear, setCurrentAcademicYear] = useState<string>("");
  const [leaveType, setLeaveType] = useState<"ลากิจ" | "ลาป่วย">("ลาป่วย");
  const [startDate, setStartDate] = useState(
    new Date().toISOString().split("T")[0]
  );
  const [endDate, setEndDate] = useState(
    new Date().toISOString().split("T")[0]
  );
  const [returnDate, setReturnDate] = useState(
    new Date().toISOString().split("T")[0]
  );
  const [reason, setReason] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isFetchingStudents, setIsFetchingStudents] = useState(true);
  const { isDarkMode } = useTheme();
  const [calendarEvents, setCalendarEvents] = useState<Record<string, any>>({});

  useEffect(() => {
    const fetchStudents = async () => {
      // ตรวจสอบรหัสโรงเรียน 
      if (!schoolId) {
        console.error("FATAL: schoolId is missing. Cannot fetch students.");
        setIsFetchingStudents(false);
        return;
      }

      setIsFetchingStudents(true);
      try {
        // Path การดึงข้อมูลนักเรียน: school-settings/{schoolId}/students
        const studentsCollectionPath = `school-settings/${schoolId}/students`;
        const studentsCollectionRef = collection(
          firestore,
          "school-settings",
          schoolId,
          "students"
        );
        console.log("Attempting to fetch students from path:", studentsCollectionPath);

        // ⚡ เพิ่มประสิทธิภาพ: จำกัดจำนวนการดึงข้อมูลนักเรียน (100 คนล่าสุด)
        const q = query(studentsCollectionRef, limit(100));
        const studentsSnapshot = await getDocs(q);

        if (studentsSnapshot.empty) {
          console.warn("Firestore fetch returned 0 student documents from:", studentsCollectionPath);
        }

        const studentList: StudentOption[] = studentsSnapshot.docs.map((doc: any) => {
          const data = doc.data();

          // สร้าง Label/Name 
          const studentData = {
            value: doc.id,
            label: `${data.title || ""}${data.firstName || "???"} ${data.lastName || "???"} (${data.studentId || "N/A"})`,
            name: `${data.title || ""}${data.firstName || "???"} ${data.lastName || "???"}`,
            studentId: data.studentId || "N/A",
            class: `${data.classLevel || ""}/${data.room || ""}`,
          };

          return studentData;
        });

        console.log("Successfully fetched and parsed", studentList.length, "students.");
        setStudents(studentList);
      } catch (error) {
        console.error("Error fetching students:", error);
        Swal.fire({
          icon: "error",
          title: "เกิดข้อผิดพลาด",
          text: "ไม่สามารถโหลดรายชื่อนักเรียนได้",
          background: isDarkMode ? "#2a2b2f" : "#fff",
          color: isDarkMode ? "#ffffff" : "#111827",
        });
      } finally {
        setIsFetchingStudents(false);
      }
    };

    fetchStudents();
  }, [schoolId]);

  // Fetch calendar data (Firestore first, then Google Calendar API fallback)
  useEffect(() => {
    if (!schoolId) return;

    const fetchCalendar = async () => {
      try {
        const docRef = doc(firestore, "school-settings", schoolId, "main_calendar", "default");
        const docSnap = await getDoc(docRef);
        if (docSnap.exists()) {
          const data = docSnap.data();
          if (data.events) {
            setCalendarEvents(data.events);
          }
          if (data.academicYear) {
            setCurrentAcademicYear(data.academicYear);
          }
        }

        // Fallback: Fetch from Google Calendar API if Firestore is empty/missing or no events
        const apiKey = import.meta.env.VITE_GOOGLE_CALENDAR_API_KEY;
        if (apiKey) {
          fetchGoogleCalendar(apiKey);
        }
      } catch (error) {
        console.error("Error fetching calendar:", error);
      }
    };
    fetchCalendar();
  }, [schoolId]);

  const fetchGoogleCalendar = async (apiKey: string) => {
    try {
      const year = new Date().getFullYear();
      const calendarId = 'th.th#holiday@group.v.calendar.google.com';
      const timeMin = `${year}-01-01T00:00:00Z`;
      const timeMax = `${year}-12-31T23:59:59Z`;

      const response = await fetch(
        `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events?key=${apiKey}&timeMin=${timeMin}&timeMax=${timeMax}&singleEvents=true&orderBy=startTime`
      );

      if (response.ok) {
        const data = await response.json();
        const apiEvents: Record<string, any> = {};
        data.items?.forEach((item: any) => {
          if (item.start?.date && !isNonOfficialHoliday(item.summary)) {
            apiEvents[item.start.date] = { type: 'holiday', description: item.summary };
          }
        });
        setCalendarEvents(prev => ({ ...prev, ...apiEvents }));
      }
    } catch (error) {
      console.error("Error fetching Google Calendar API:", error);
    }
  };

  const checkIsHoliday = (dateStr: string) => {
    if (!dateStr) return { isHoliday: false, description: '' };
    const event = calendarEvents[dateStr];
    const d = new Date(dateStr);
    const dayOfWeek = d.getUTCDay();

    // Check weekend
    if (dayOfWeek === 0 || dayOfWeek === 6) {
      // Check if it's a schoolDay override
      if (event?.type === 'schoolDay') return { isHoliday: false, description: event.description || 'วันเรียนชดเชย' };
      // If it's a holiday event on weekend, it's still a holiday
      if (event?.type === 'holiday') return { isHoliday: true, description: event.description || 'วันหยุดราชการ' };
      if (event?.type === 'specialHoliday') return { isHoliday: true, description: event.description || 'วันหยุดกรณีพิเศษ' };

      return { isHoliday: true, description: 'วันหยุดเสาร์-อาทิตย์' };
    }

    // Check calendar events for weekdays
    if (event) {
      if (event.type === 'holiday') return { isHoliday: true, description: event.description || 'วันหยุดราชการ' };
      if (event.type === 'specialHoliday') return { isHoliday: true, description: event.description || 'วันหยุดกรณีพิเศษ' };
      if (event.type === 'schoolDay') return { isHoliday: false, description: event.description || 'วันเรียนชดเชย/กิจกรรม' };
    }

    return { isHoliday: false, description: '' };
  };

  // เมื่อวันที่สิ้นสุดการลาเปลี่ยน, อัปเดตวันที่กลับมาเรียนให้เป็นวันเดียวกัน
  useEffect(() => {
    if (endDate > returnDate) {
      setReturnDate(endDate);
    }
  }, [endDate, returnDate]);

  const handleReturnDateChange = (date: string) => {
    const { isHoliday, description } = checkIsHoliday(date);
    if (isHoliday) {
      Swal.fire({
        icon: "warning",
        title: "ไม่สามารถเลือกวันที่นี้ได้",
        text: `วันที่เลือกเป็น ${description} กรุณาเลือกวันที่เปิดเรียน`,
        background: isDarkMode ? "#2a2b2f" : "#fff",
        color: isDarkMode ? "#ffffff" : "#111827",
      });
      return;
    }
    setReturnDate(date);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedStudent || !startDate || !endDate || !returnDate || !reason.trim()) {
      Swal.fire({
        icon: "warning",
        title: "ข้อมูลไม่ครบถ้วน",
        text: "กรุณากรอกข้อมูลให้ครบทุกช่อง",
        background: isDarkMode ? "#2a2b2f" : "#fff",
        color: isDarkMode ? "#ffffff" : "#111827",
      });
      return;
    }

    if (!schoolId) {
      Swal.fire({
        icon: "error",
        title: "เกิดข้อผิดพลาด",
        text: "ไม่พบข้อมูลรหัสโรงเรียน (schoolId)",
        background: isDarkMode ? "#2a2b2f" : "#fff",
        color: isDarkMode ? "#ffffff" : "#111827",
      });
      return;
    }

    // ตรวจสอบว่าช่วงวันที่ลาเป็นวันหยุดทั้งหมดหรือไม่
    let hasSchoolDay = false;
    const checkStart = new Date(startDate);
    const checkEnd = new Date(endDate);
    const holidayDescriptions = new Set<string>();

    for (let d = new Date(checkStart); d <= checkEnd; d.setDate(d.getDate() + 1)) {
      const dateStr = d.toISOString().split('T')[0];
      const { isHoliday, description } = checkIsHoliday(dateStr);
      const event = calendarEvents[dateStr];

      if (isHoliday) {
        if (event) {
          if (event.type === 'holiday') {
            holidayDescriptions.add(event.description ? `วันหยุดราชการ (${event.description})` : 'วันหยุดราชการ');
          } else if (event.type === 'specialHoliday') {
            holidayDescriptions.add(event.description ? `วันหยุดกรณีพิเศษ (${event.description})` : 'วันหยุดกรณีพิเศษ');
          } else if (description) {
            holidayDescriptions.add(description);
          }
        } else if (description) {
          holidayDescriptions.add(description);
        }
      } else {
        hasSchoolDay = true;
        break;
      }
    }

    if (!hasSchoolDay) {
      const descriptionsText = Array.from(holidayDescriptions).join(', ');
      Swal.fire({
        icon: "warning",
        title: "ไม่สามารถบันทึกการลาได้",
        text: `วันที่เลือกเป็นวันหยุดทั้งหมด ${descriptionsText ? `(${descriptionsText})` : ''} ไม่จำเป็นต้องทำการลา`,
        background: isDarkMode ? "#2a2b2f" : "#fff",
        color: isDarkMode ? "#ffffff" : "#111827",
      });
      return;
    }

    // 📌 Path: students/{id}/leave_summary (same level as Weeksummary, Monthsummary, etc.)
    const leaveRequestCollection = collection(
      firestore,
      "school-settings",
      schoolId,
      "students",
      selectedStudent.value,
      "leave_summary"
    );

    const sDate = new Date(startDate);
    const eDate = new Date(endDate);

    const q = query(
      leaveRequestCollection,
      where("endDate", ">=", Timestamp.fromDate(sDate))
    );

    const querySnapshot = await getDocs(q);
    const overlappingLeave = querySnapshot.docs.find((doc: any) => {
      const data = doc.data();
      const existingStartDate = data.startDate.toDate();
      return existingStartDate <= eDate;
    });

    if (overlappingLeave) {
      Swal.fire({
        icon: "warning",
        title: "ไม่สามารถบันทึกได้",
        text: "มีข้อมูลการลาในช่วงวันที่ที่เลือกอยู่แล้ว กรุณาตรวจสอบอีกครั้ง",
        background: isDarkMode ? "#2a2b2f" : "#fff",
        color: isDarkMode ? "#ffffff" : "#111827",
      });
      setIsLoading(false);
      return;
    }

    setIsLoading(true);

    try {
      const batch = writeBatch(firestore);
      // 1. บันทึกคำขอลาหลัก
      // 📌 Path: students/{id}/leave_summary (same level as Weeksummary, Monthsummary, etc.)
      const leaveRequestRef = doc(collection(
        firestore,
        "school-settings",
        schoolId,
        "students",
        selectedStudent.value,
        "leave_summary"
      ));

      const rDate = new Date(returnDate);

      batch.set(leaveRequestRef, {
        studentId: selectedStudent.studentId,
        studentDocId: selectedStudent.value,
        schoolDocId: schoolId,
        studentName: selectedStudent.name,
        leaveType,
        reason,
        startDate: Timestamp.fromDate(sDate),
        endDate: Timestamp.fromDate(eDate),
        returnDate: Timestamp.fromDate(rDate),
        status: "approved",
        createdAt: Timestamp.now(),
      });

      // 1.5. บันทึกข้อมูลการลาลงใน Global Collection (school-settings/{schoolId}/leave_summary)
      const globalLeaveRef = doc(collection(firestore, "school-settings", schoolId, "leave_summary"));
      batch.set(globalLeaveRef, {
        studentId: selectedStudent.studentId, // ID e.g. 12345
        studentDocId: selectedStudent.value,  // Firestore ID
        studentName: selectedStudent.name,
        leaveType: leaveType,
        startDate: startDate, // Keep string YYYY-MM-DD for consistency with query
        endDate: endDate,   // Keep string YYYY-MM-DD
        returnDate: returnDate, // เพิ่มวันที่กลับมาเรียน
        status: "approved",
        createdAt: Timestamp.now(),
        reason: reason
      });

      // 2. อัปเดต Attendance และ Flag Ceremony Attendance ในแต่ละวัน 
      //    เก็บไว้ใต้โฟลเดอร์โรงเรียน: school-settings/[School ID]/[Collection]/[Date]/students/[Student Doc ID]
      let leaveDaysCount = 0; // ตัวแปรสำหรับนับจำนวนวันลาจริง (ไม่รวมวันหยุด)

      for (let d = new Date(sDate); d <= eDate; d.setDate(d.getDate() + 1)) {
        const dateStr = d.toISOString().split('T')[0]; // YYYY-MM-DD (Safe for UTC dates)

        // ตรวจสอบวันหยุด/วันเรียนชดเชย
        const event = calendarEvents[dateStr];
        const dayOfWeek = d.getUTCDay(); // 0 = Sun, 6 = Sat (Using UTC because d is UTC)
        let isSchoolDay = true;

        // วันเสาร์-อาทิตย์ หยุดปกติ
        if (dayOfWeek === 0 || dayOfWeek === 6) isSchoolDay = false;

        if (event) {
          if (event.type === 'schoolDay') isSchoolDay = true; // วันเรียนชดเชย/กิจกรรม
          else if (event.type === 'holiday' || event.type === 'specialHoliday') isSchoolDay = false; // วันหยุด
        }

        // ถ้าไม่ใช่วันเรียน ให้ข้ามการบันทึกการลาในวันนั้น
        if (!isSchoolDay) continue;

        leaveDaysCount++; // นับจำนวนวันลา

        // **Attendance (การเข้า-ออกทั่วไป)**
        // 📌 แก้ไข: ย้ายไปเก็บใต้ students/{studentId}/attendance/{date}
        const baseAttendanceRef = doc(
          firestore,
          "school-settings",
          schoolId,
          "students",
          selectedStudent.value,
          "attendance",
          dateStr
        );

        batch.set(
          baseAttendanceRef,
          {
            status: "ลา", // 'ลา' หมายถึง ลา
            checkinTime: null,
            checkoutTime: null,
            leaveType: leaveType,
            reason: reason,
            studentId: selectedStudent.studentId,
            studentDocId: selectedStudent.value,
            classId: selectedStudent.class,
            date: dateStr,
            timestamp: Timestamp.now(),
            leaveRequestId: leaveRequestRef.id,
            metadata: {
              description: reason,
              isGateCheckin: false
            }
          },
          { merge: true }
        );



        // **Daily Summary (School-wide)**
        const cls = selectedStudent.class?.split('/')[0] || "ไม่ระบุชั้น";
        const summaryRef = doc(firestore, "school-settings", schoolId, "students", "Attendance", "dyasummary", dateStr);
        batch.set(summaryRef, {
          absent: increment(-1),
          leave: increment(1),
          [`classes.${cls}.absent`]: increment(-1),
          [`classes.${cls}.leave`]: increment(1),
          updatedAt: serverTimestamp()
        }, { merge: true });

        // Update Period Summaries (Week, Month, Year, Semester)
        // From 'absent' to 'leave' (assuming default is absent if not present, but here we are marking leave explicitly)
        // If the student was already marked absent, we decrement absent and increment leave.
        // If they were not marked anything, we just increment leave?
        // Usually, if they request leave, they might not have scanned in suitable time, so they might be 'absent' by default or 'unknown'.
        // However, `dyasummary` logic above decrements `absent` and increments `leave`.
        // So we should reflect that in period summaries too: transition from 'absent' to 'leave'.
        updatePeriodSummaries(firestore, batch, schoolId, selectedStudent.value, 'students', dateStr, 'absent', 'leave', cls, currentAcademicYear);
      }

      // 3. อัปเดตยอดรวมการลาในโปรไฟล์นักเรียน (Aggregation)
      if (leaveDaysCount > 0) {
        const studentRef = doc(firestore, "school-settings", schoolId, "students", selectedStudent.value);
        batch.set(studentRef, {
          attendanceStats: {
            leave: increment(leaveDaysCount)
          }
        }, { merge: true });
      }

      await batch.commit();

      Swal.fire({
        icon: "success",
        title: "บันทึกการลาสำเร็จ",
        text: `ระบบได้บันทึกการลาของ ${selectedStudent.label} เรียบร้อยแล้ว`,
        background: isDarkMode ? "#2a2b2f" : "#fff",
        color: isDarkMode ? "#ffffff" : "#111827",
      });

      // Reset form
      setSelectedStudent(null);
      setReason("");
    } catch (error) {
      console.error("Error submitting leave request:", error);
      Swal.fire({
        icon: "error",
        title: "เกิดข้อผิดพลาด",
        text: "ไม่สามารถบันทึกข้อมูลการลาได้",
        background: isDarkMode ? "#2a2b2f" : "#fff",
        color: isDarkMode ? "#ffffff" : "#111827",
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <MainLayout>
      <div className="p-4 sm:p-6 text-gray-900 dark:text-white transition-colors duration-300">
        <div className="max-w-4xl mx-auto">
          <div className="bg-white dark:bg-[#2a2b2f] rounded-2xl p-6 mb-6 shadow-sm dark:shadow-none">
            <div className="flex items-center gap-4 mb-1">
              <BackButton />
              <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 dark:text-white">
                ยื่นใบลากิจ/ลาป่วย
              </h1>
            </div>
            <p className="text-gray-500 dark:text-gray-400">
              กรอกแบบฟอร์มเพื่อบันทึกการลาของนักเรียน
            </p>
          </div>

          <form
            onSubmit={handleSubmit}
            className="bg-white dark:bg-[#2a2b2f] rounded-2xl p-6 space-y-6 shadow-sm dark:shadow-none"
          >
            <div>
              <label className="block text-sm font-medium mb-2 text-gray-700 dark:text-gray-300">
                เลือกนักเรียน
              </label>
              <Select
                options={students}
                value={selectedStudent}
                onChange={setSelectedStudent}
                isLoading={isFetchingStudents}
                placeholder="ค้นหาชื่อหรือรหัสนักเรียน..."
                isClearable
                styles={customStyles(isDarkMode)}
                aria-label="เลือกนักเรียนสำหรับทำรายการ"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
              <div>
                <label className="block text-sm font-medium mb-2 text-gray-700 dark:text-gray-300">
                  ประเภทการลา
                </label>
                <select
                  value={leaveType}
                  onChange={(e) => setLeaveType(e.target.value as "ลากิจ" | "ลาป่วย")}
                  className="w-full bg-white dark:bg-[#1e1f21] border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 text-gray-900 dark:text-white focus:ring-2 focus:ring-indigo-500"
                  aria-label="เลือกประเภทการลา"
                >
                  <option value="ลาป่วย">ลาป่วย</option>
                  <option value="ลากิจ">ลากิจ</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium mb-2 text-gray-700 dark:text-gray-300">
                  จะกลับมาเรียนวันที่
                </label>
                <ThaiDatePicker
                  value={returnDate}
                  onChange={handleReturnDateChange}
                  events={calendarEvents}
                  placeholder="เลือกวันที่"
                />
                {(() => {
                  const { description } = checkIsHoliday(returnDate);
                  if (description) {
                    return <p className="text-xs mt-1 text-red-500 dark:text-red-400">{description}</p>;
                  }
                  return null;
                })()}
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
              <div>
                <label className="block text-sm font-medium mb-2 text-gray-700 dark:text-gray-300">
                  วันที่เริ่มลา
                </label>
                <ThaiDatePicker
                  value={startDate}
                  onChange={setStartDate}
                  events={calendarEvents}
                  placeholder="เลือกวันที่"
                />
                {(() => {
                  const { description, isHoliday } = checkIsHoliday(startDate);
                  if (description) {
                    return <p className={`text-xs mt-1 ${isHoliday ? 'text-red-500 dark:text-red-400' : 'text-blue-500 dark:text-blue-400'}`}>{description}</p>;
                  }
                  return null;
                })()}
              </div>
              <div>
                <label className="block text-sm font-medium mb-2 text-gray-700 dark:text-gray-300">
                  วันที่สิ้นสุดการลา
                </label>
                <ThaiDatePicker
                  value={endDate}
                  onChange={setEndDate}
                  events={calendarEvents}
                  placeholder="เลือกวันที่"
                />
                {(() => {
                  const { description, isHoliday } = checkIsHoliday(endDate);
                  if (description) {
                    return <p className={`text-xs mt-1 ${isHoliday ? 'text-red-500 dark:text-red-400' : 'text-blue-500 dark:text-blue-400'}`}>{description}</p>;
                  }
                  return null;
                })()}
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium mb-2 text-gray-700 dark:text-gray-300">
                เหตุผลการลา
              </label>
              <textarea
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                rows={4}
                placeholder="ระบุเหตุผลการลา..."
                className="w-full bg-white dark:bg-[#1e1f21] border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 text-gray-900 dark:text-white focus:ring-2 focus:ring-indigo-500"
                aria-label="ระบุเหตุผลการลา"
              ></textarea>
            </div>

            <div className="flex justify-end">
              <button
                type="submit"
                disabled={isLoading}
                className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-2 px-6 rounded-lg transition-colors duration-200 disabled:bg-gray-500 disabled:cursor-not-allowed"
              >
                {isLoading ? "กำลังบันทึก..." : "บันทึกการลา"}
              </button>
            </div>
          </form>

        </div>
      </div>
    </MainLayout>
  );
};

export default LeaveRequestPage;