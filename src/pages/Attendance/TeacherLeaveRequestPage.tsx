import React, { useState, useEffect, useRef } from "react";
import { useSelector, useDispatch } from "react-redux";
import { fetchCalendar } from "@/store/slices/calendarSlice";
import { firestore } from "@/firebase";
import { RootState } from "../../store";
import {
  collection,
  getDocs,
  writeBatch,
  doc,
  getDoc,
  collectionGroup,
  Timestamp, onSnapshot,
  query, where, increment, serverTimestamp
} from "firebase/firestore";
import { updatePeriodSummaries } from "@/utils/periodSummaryUtils";
import Swal from "sweetalert2";
import Select, { StylesConfig } from "react-select";
import { useTheme } from "../../ThemeContext";
import MainLayout from "@/layouts/MainLayout";
import BackButton from "@/components/Shared/BackButton";
import { isNonOfficialHoliday } from "../../utils/calendarUtils";
import { getThaiYear, getCurrentThaiYear } from "@/utils/dateUtils";
import { getActiveSortedStaff } from "@/utils/teacherSortUtils";
import { useEffectiveSchoolId } from "@/hooks/useEffectiveSchool";
import { CalendarDays, Sunrise, Sunset } from "lucide-react";

interface TeacherOption {
  value: string; // teacher document ID
  label: string; // teacher name
  teacherId: string;
  name: string; // teacher full name without ID
}

const customStyles = (isDarkMode: boolean): StylesConfig<TeacherOption, false> => ({
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
      const date = new Date(y, m - 1, d);
      return `${d} ${thaiMonths[m - 1]} ${getThaiYear(date)}`;
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
              {thaiMonths[viewDate.getMonth()]} {getThaiYear(viewDate)}
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

const TeacherLeaveRequestPage: React.FC = () => {
  const dispatch = useDispatch();
  const { user } = useSelector((state: RootState) => state.auth);
  const schoolId = useEffectiveSchoolId();

  // Redux Calendar State
  const calendarState = useSelector((state: RootState) => state.calendar);
  const reduxRawData = calendarState.rawData;

  useEffect(() => {
    if (schoolId) {
      dispatch(fetchCalendar(schoolId) as any);
    }
  }, [schoolId, dispatch]);
  const [teachers, setTeachers] = useState<TeacherOption[]>([]);
  const [selectedTeacher, setSelectedTeacher] = useState<TeacherOption | null>(
    null
  );
  const [leaveType, setLeaveType] = useState("ลาป่วย");
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
  const [requiresSubstitute, setRequiresSubstitute] = useState(true); // 📌 เพิ่ม state และตั้งค่าเริ่มต้นเป็น true
  // ช่วงเวลาที่ลา (เต็มวัน/เช้า/บ่าย) — เลือกเช้า/บ่ายได้เฉพาะกรณีลา 1 วัน
  // ส่วนที่จัดสอนแทน (SubstituteManagementPage) จะใช้ค่านี้กรองเฉพาะคาบก่อน/หลังพักเที่ยง
  // โดยอิงตำแหน่งคาบ "lunch" จากหน้าตั้งค่าคาบเรียนโดยอัตโนมัติ
  const [dayPortion, setDayPortion] = useState<"full" | "morning" | "afternoon">("full");
  const [isFetchingTeachers, setIsFetchingTeachers] = useState(true);
  const { isDarkMode } = useTheme();
  const [calendarEvents, setCalendarEvents] = useState<Record<string, any>>({});
  const academicYear = useSelector((state: RootState) => state.calendar.academicYear) || String(getCurrentThaiYear());
  const [docNo, setDocNo] = useState<string>("");
  const [schoolAffiliation, setSchoolAffiliation] = useState<string>(""); // 📌 เพิ่มสังกัดโรงเรียน

  useEffect(() => {
    const fetchTeachers = async () => {
      if (!schoolId) return;
      setIsFetchingTeachers(true);
      try {
        const teachersSnapshot = await getDocs(collection(firestore, "school-settings", schoolId, "teachers"));
        const teacherList: TeacherOption[] = getActiveSortedStaff(teachersSnapshot.docs.map((doc) => ({
          id: doc.id,
          ...doc.data()
        }))).map((teacher: any) => {
          return {
            value: teacher.id,
            label: `[${teacher.teacherId}] ${teacher.title || ""}${teacher.firstName} ${teacher.lastName}`,
            name: `${teacher.title || ""}${teacher.firstName} ${teacher.lastName}`,
            teacherId: teacher.teacherId,
          };
        });
        setTeachers(teacherList);
      } catch (error) {
        console.error("Error fetching teachers:", error);
        Swal.fire({
          icon: "error",
          title: "เกิดข้อผิดพลาด",
          text: "ไม่สามารถโหลดรายชื่อครูได้",
          background: "#2a2b2f",
          color: "#ffffff",
        });
      } finally {
        setIsFetchingTeachers(false);
      }
    };

    fetchTeachers();
  }, [schoolId]);

  // Fetch calendar data (Firestore first, then Google Calendar API fallback)
  useEffect(() => {
    if (!schoolId) return;

    if (calendarState.status === 'succeeded' && reduxRawData.events) {
      setCalendarEvents(reduxRawData.events);
    } else {
      // 1. Real-time listener for Firestore (School Settings)
      const docRef = doc(firestore, 'school-settings', schoolId, 'main_calendar', 'default');

      const unsubscribe = onSnapshot(docRef, (docSnap) => {
        if (docSnap.exists()) {
          const data = docSnap.data();
          if (data.events) {
            setCalendarEvents(data.events);
            return;
          }
        }

        // 2. Fallback: Fetch from Google Calendar API if Firestore is empty/missing
        const apiKey = import.meta.env.VITE_GOOGLE_CALENDAR_API_KEY;
        if (apiKey) {
          fetchGoogleCalendar(apiKey);
        }
      }, (error) => {
        console.error("Error listening to calendar:", error);
      });

      return () => unsubscribe();
    }
  }, [schoolId, calendarState.status, reduxRawData.events]);
  // Fetch Running Number and School Info
  useEffect(() => {
    const fetchDocNoAndAffiliation = async () => {
      if (!schoolId || !academicYear) return;
      try {
        // 1. Fetch Affiliation
        const calendarRef = doc(firestore, 'school-settings', schoolId, 'main_calendar', 'default');
        const calendarSnap = await getDoc(calendarRef);
        if (calendarSnap.exists()) {
          const calendarData = calendarSnap.data();
          if (calendarData.affiliation) {
            setSchoolAffiliation(calendarData.affiliation);
          } else {
            const schoolRef = doc(firestore, 'school-settings', schoolId);
            const schoolSnap = await getDoc(schoolRef);
            if (schoolSnap.exists()) {
              setSchoolAffiliation(schoolSnap.data().affiliation || "");
            }
          }
        }

        // 2. Fetch Running Number
        try {
          const leaveRequestsQuery = query(
            collectionGroup(firestore, "leave_summary"),
            where("schoolId", "==", schoolId),
            where("academicYear", "==", academicYear)
          );
          const snapshot = await getDocs(leaveRequestsQuery);
          const nextNumber = snapshot.size + 1;
          setDocNo(`${nextNumber}/${academicYear}`);
        } catch (err) {
          console.error("Error counting leave requests:", err);
          setDocNo(`1/${academicYear}`);
        }
      } catch (error) {
        console.error("Error fetching academic info:", error);
      }
    };

    fetchDocNoAndAffiliation();
  }, [schoolId, academicYear]);

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

  useEffect(() => {
    if (endDate > returnDate) {
      setReturnDate(endDate);
    }
  }, [endDate, returnDate]);

  // ลาครึ่งวัน (เช้า/บ่าย) มีความหมายเฉพาะกรณีลา 1 วันเท่านั้น — ถ้าเลือกลาหลายวัน
  // ให้บังคับกลับเป็น "เต็มวัน" เสมอ เพื่อไม่ให้ระบบจัดสอนแทนตีความผิดว่าลาครึ่งวันทุกวันในช่วงนั้น
  const isSingleDayLeave = startDate === endDate;
  useEffect(() => {
    if (!isSingleDayLeave && dayPortion !== "full") {
      setDayPortion("full");
    }
  }, [isSingleDayLeave, dayPortion]);

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
    if (!selectedTeacher || !startDate || !endDate || !returnDate || !reason.trim()) {
      Swal.fire({
        icon: "warning",
        title: "ข้อมูลไม่ครบถ้วน",
        text: "กรุณากรอกข้อมูลให้ครบทุกช่อง",
        background: "#2a2b2f",
        color: "#ffffff",
      });
      return;
    }

    if (!schoolId) {
      Swal.fire({
        icon: "error",
        title: "เกิดข้อผิดพลาด",
        text: "ไม่พบข้อมูลรหัสโรงเรียน (schoolId)",
        background: "#2a2b2f",
        color: "#ffffff",
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

    // 📌 Path: teachers/{id}/leave_summary (same level as Weeksummary, Monthsummary, etc.)
    const leaveRequestCollection = collection(
      firestore,
      "school-settings",
      schoolId,
      "teachers",
      selectedTeacher.value,
      "leave_summary"
    );

    const sDate = new Date(startDate);
    const eDate = new Date(endDate);

    const q = query(
      leaveRequestCollection,
      where("endDate", ">=", Timestamp.fromDate(sDate))
    );

    const querySnapshot = await getDocs(q);
    const overlappingLeave = querySnapshot.docs.find(doc => {
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
      // 📌 Path: teachers/{id}/leave_summary (same level as Weeksummary, Monthsummary, etc.)
      const leaveRequestRef = doc(collection(
        firestore,
        "school-settings",
        schoolId,
        "teachers",
        selectedTeacher.value,
        "leave_summary"
      ));

      const rDate = new Date(returnDate);

      // 1. บันทึกคำขอลาหลัก
      batch.set(leaveRequestRef, {
        teacherId: selectedTeacher.teacherId,
        teacherDocId: selectedTeacher.value,
        schoolId: schoolId, // 📌 เพิ่ม schoolId เพื่อให้ query แบบ collectionGroup ได้ง่าย
        teacherName: selectedTeacher.name,
        leaveType,
        reason,
        startDate: Timestamp.fromDate(sDate),
        endDate: Timestamp.fromDate(eDate),
        returnDate: Timestamp.fromDate(rDate),
        status: "pending", // รอฝ่ายบุคคลอนุมัติ
        createdAt: Timestamp.now(),
        requiresSubstitute: requiresSubstitute, // 📌 เพิ่ม field นี้ตอนบันทึกข้อมูล
        // ลาครึ่งวันมีผลเฉพาะตอนลา 1 วัน — กันเหนียวอีกชั้นตอนบันทึกเผื่อ state ยังไม่ทันถูกรีเซ็ต
        dayPortion: isSingleDayLeave ? dayPortion : "full",
        docNo: docNo, // 📌 เพิ่มเลขที่เอกสาร
        academicYear: academicYear, // 📌 เพิ่มปีการศึกษา
        schoolAffiliation: schoolAffiliation, // 📌 เพิ่มสังกัด (อ้างอิงจากหน้าข้อมูลโรงเรียน)
      });

      await batch.commit();

      Swal.fire({
        icon: "success",
        title: "ยื่นคำขอลาสำเร็จ",
        text: `ยื่นคำขอลาของ ${selectedTeacher.label} สำเร็จ (รอฝ่ายบุคคลอนุมัติ)`,
        background: "#2a2b2f",
        color: "#ffffff",
      });

      // Reset form
      setSelectedTeacher(null);
      setReason("");
      setRequiresSubstitute(true); // 📌 รีเซ็ตค่ากลับเป็น true เสมอ
      setDayPortion("full");
    } catch (error) {
      console.error("Error submitting leave request:", error);
      Swal.fire({
        icon: "error",
        title: "เกิดข้อผิดพลาด",
        text: "ไม่สามารถบันทึกข้อมูลการลาได้",
        background: "#2a2b2f",
        color: "#ffffff",
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
                ยื่นใบลากิจ/ลาป่วย (ครูและบุคลากร)
              </h1>
            </div>
            <p className="text-gray-500 dark:text-gray-400">
              กรอกแบบฟอร์มเพื่อบันทึกการลาของครูและบุคลากร
            </p>
          </div>

          <form
            onSubmit={handleSubmit}
            className="bg-white dark:bg-[#2a2b2f] rounded-2xl p-6 space-y-6 shadow-sm dark:shadow-none"
          >
            <div>
              <label className="block text-sm font-medium mb-2 text-gray-700 dark:text-gray-300">
                เลือกครูหรือบุคลากร
              </label>
              <Select
                options={teachers}
                value={selectedTeacher}
                onChange={setSelectedTeacher}
                isLoading={isFetchingTeachers}
                styles={customStyles(isDarkMode)}
                placeholder="ค้นหาชื่อหรือรหัสบุคลากร..."
                isClearable
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
              <div>
                <label className="block text-sm font-medium mb-2 text-gray-700 dark:text-gray-300">
                  ที่ (เลขที่เอกสาร)
                </label>
                <input
                  type="text"
                  value={docNo}
                  onChange={(e) => setDocNo(e.target.value)}
                  placeholder="เช่น 1/2568"
                  className="w-full bg-white dark:bg-[#1e1f21] border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 text-gray-900 dark:text-white focus:ring-2 focus:ring-indigo-500"
                />
                <p className="text-xs mt-1 text-gray-500">ลำดับ/ปีการศึกษา ({academicYear})</p>
              </div>
              <div>
                <label className="block text-sm font-medium mb-2 text-gray-700 dark:text-gray-300">
                  ประเภทการลา
                </label>
                <select
                  value={leaveType}
                  onChange={(e) => setLeaveType(e.target.value)}
                  className="w-full bg-white dark:bg-[#1e1f21] border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 text-gray-900 dark:text-white focus:ring-2 focus:ring-indigo-500"
                >
                  <option value="ลาป่วย">ลาป่วย</option>
                  <option value="ลากิจ">ลากิจ</option>
                  <option value="ลากิจกรรม">ลากิจกรรม</option>
                  <option value="ลาพักร้อน">ลาพักร้อน</option>
                  <option value="ลาอุปสมบท">ลาอุปสมบท</option>
                  <option value="ลาฌาปนกิจ">ลาฌาปนกิจ</option>
                  <option value="ลาฝึกอบรม">ลาฝึกอบรม</option>
                  <option value="ลาสัมมนา">ลาสัมมนา</option>
                  <option value="ลาคลอดบุตร">ลาคลอดบุตร</option>
                  <option value="ไปราชการ">ไปราชการ</option>
                  <option value="ลาประกอบพิธีฮัจย์">ลาประกอบพิธีฮัจย์</option>
                  <option value="ลาเข้ารับการระดมพล">ลาเข้ารับการระดมพล</option>
                  <option value="ลาปฏิบัติงานในองค์กรระหว่างประเทศ">ลาปฏิบัติงานในองค์กรระหว่างประเทศ</option>
                  <option value="ลาไปช่วยภรรยาที่คลอดบุตร">ลาไปช่วยภรรยาที่คลอดบุตร</option>
                </select>
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
                ช่วงเวลาลา
              </label>
              <div className="grid grid-cols-3 gap-2 max-w-md">
                {([
                  { value: 'full', label: 'เต็มวัน', Icon: CalendarDays, activeClass: 'bg-indigo-600 border-indigo-600' },
                  { value: 'morning', label: 'ครึ่งวันเช้า', Icon: Sunrise, activeClass: 'bg-amber-500 border-amber-500' },
                  { value: 'afternoon', label: 'ครึ่งวันบ่าย', Icon: Sunset, activeClass: 'bg-orange-600 border-orange-600' },
                ] as const).map(opt => {
                  const isActive = dayPortion === opt.value;
                  return (
                    <button
                      key={opt.value}
                      type="button"
                      disabled={!isSingleDayLeave}
                      onClick={() => setDayPortion(opt.value)}
                      className={`flex flex-col items-center justify-center gap-1.5 py-3 px-2 rounded-xl text-xs font-bold border transition-all disabled:opacity-40 disabled:cursor-not-allowed ${isActive
                        ? `${opt.activeClass} text-white`
                        : 'bg-white dark:bg-[#1e1f21] text-gray-600 dark:text-gray-300 border-gray-300 dark:border-gray-600 hover:border-indigo-400'
                        }`}
                    >
                      <opt.Icon size={20} strokeWidth={2.25} />
                      {opt.label}
                    </button>
                  );
                })}
              </div>
              <p className="text-xs mt-1.5 text-gray-500 dark:text-gray-400">
                {isSingleDayLeave
                  ? 'เลือกครึ่งวันเช้า (ก่อนพักเที่ยง) หรือบ่าย (หลังพักเที่ยง) ได้เมื่อลา 1 วัน — ระบบจัดสอนแทนจะจัดครูสอนแทนเฉพาะคาบในช่วงที่เลือกเท่านั้น'
                  : 'ลาครึ่งวันเลือกได้เฉพาะกรณีลา 1 วัน — ช่วงที่เลือกวันที่เริ่มลาและสิ้นสุดต่างกันจะถูกบันทึกเป็น "เต็มวัน" เสมอ'}
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
              <div>
                <label className="block text-sm font-medium mb-2 text-gray-700 dark:text-gray-300">
                  จะกลับมาปฏิบัติงานวันที่
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
              ></textarea>
            </div>

            <div className="flex flex-col sm:flex-row justify-end items-center bg-gray-50 dark:bg-[#1e1f21]/50 p-4 rounded-xl gap-6">
              <div className="flex items-center gap-3">
                <span className="text-sm font-medium text-gray-700 dark:text-gray-300">ต้องการครูสอนแทน:</span>
                <button
                  type="button"
                  onClick={() => setRequiresSubstitute(!requiresSubstitute)}
                  className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none ring-offset-2 focus:ring-2 focus:ring-indigo-500 ${requiresSubstitute ? 'bg-indigo-600' : 'bg-gray-300 dark:bg-gray-600'}`}
                >
                  <span
                    className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${requiresSubstitute ? 'translate-x-6' : 'translate-x-1'}`}
                  />
                </button>
                <span className={`text-sm font-bold ${requiresSubstitute ? 'text-indigo-600' : 'text-gray-500'}`}>
                  {requiresSubstitute ? 'ต้องการ' : 'ไม่ต้องการ'}
                </span>
              </div>

              <button
                type="submit"
                disabled={isLoading}
                className="w-full sm:w-auto bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-2.5 px-8 rounded-xl transition-all duration-200 disabled:bg-gray-500 shadow-lg shadow-indigo-500/20 active:scale-95"
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

export default TeacherLeaveRequestPage;
