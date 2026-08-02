import React, { useState, useEffect, useCallback, useMemo, useRef, useLayoutEffect } from 'react';
import { doc, setDoc, getDoc, collection, query, getDocs } from 'firebase/firestore';
import { firestore as db } from '../../firebase';
import Swal from 'sweetalert2';
import MainLayout from "@/layouts/MainLayout";
import BackButton from "@/components/Shared/BackButton";
import { useSelector } from 'react-redux';
import { RootState } from '../../store';
import { isNonOfficialHoliday } from '../../utils/calendarUtils';
import { getThaiYear, getCurrentThaiYear } from '@/utils/dateUtils';
import { Calendar } from 'lucide-react';

type DayType = 'schoolDay' | 'holiday' | 'specialHoliday';

interface CalendarEvent {
  type: DayType;
  description?: string;
  scheduleDay?: string;
}

interface Term {
  startDate: string | null;
  endDate: string | null;
}

interface SchoolCalendarData {
  academicYear?: string;
  events: Record<string, CalendarEvent>; // Key: 'YYYY-MM-DD', Value: event object
  terms?: {
    term1: Term;
    term2: Term;
  };
}

const CalendarHeader: React.FC = () => {
  const daysOfWeek = ['อาทิตย์', 'จันทร์', 'อังคาร', 'พุธ', 'พฤหัสบดี', 'ศุกร์', 'เสาร์'];
  return (
    <>
      {daysOfWeek.map(day => (<div key={day} className="min-w-0 text-center font-semibold text-gray-500 dark:text-gray-400 px-1 py-2 text-xs sm:text-sm">{day}</div>))}
    </>
  );
};

const DAY_MAP: Record<string, string> = {
  mon: 'วันจันทร์',
  tue: 'วันอังคาร',
  wed: 'วันพุธ',
  thu: 'วันพฤหัสบดี',
  fri: 'วันศุกร์',
  sat: 'วันเสาร์',
  sun: 'วันอาทิตย์'
};

const thaiMonths = [
  'มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน',
  'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม'
];

const ThaiDatePicker: React.FC<{
  value: string | null;
  onChange: (value: string) => void;
  placeholder?: string;
  events?: Record<string, CalendarEvent>;
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
      const isHoliday = event?.type === 'holiday' || event?.type === 'specialHoliday';

      days.push(
        <button
          key={d}
          onClick={() => handleSelectDate(d)}
          className={`w-8 h-8 rounded-full flex items-center justify-center text-sm transition-colors
            ${isSelected ? 'bg-indigo-600 text-white' : isHoliday ? 'bg-red-100 text-red-600 hover:bg-red-200 dark:bg-red-900/30 dark:text-red-300' : 'hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-200'}
            ${isToday && !isSelected ? 'border border-indigo-500 text-indigo-500' : ''}
          `}
          title={isHoliday ? event?.description : ''}
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
      return `${d} ${thaiMonths[m - 1]} ${getThaiYear(new Date(y, m - 1, d))}`;
    })()
    : '';

  return (
    <div className="relative w-full" ref={containerRef}>
      <div
        onClick={() => setIsOpen(!isOpen)}
        className="w-full bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-md px-3 py-2 text-gray-900 dark:text-white cursor-pointer flex justify-between items-center"
      >
        <span className={!displayValue ? 'text-gray-400' : ''}>{displayValue || placeholder || 'เลือกวันที่'}</span>
        <span className="text-gray-500">📅</span>
      </div>

      {isOpen && (
        <div className="absolute z-50 mt-1 w-72 bg-white dark:bg-gray-800 rounded-lg shadow-xl border border-gray-200 dark:border-gray-700 p-4 left-0 sm:left-auto sm:right-0 md:left-0">
          <div className="flex justify-between items-center mb-4">
            <button onClick={() => changeMonth(-1)} className="p-1 hover:bg-gray-100 dark:hover:bg-gray-700 rounded text-gray-600 dark:text-gray-300">&lt;</button>
            <span className="font-bold text-gray-900 dark:text-white">
              {thaiMonths[viewDate.getMonth()]} {getThaiYear(viewDate)}
            </span>
            <button onClick={() => changeMonth(1)} className="p-1 hover:bg-gray-100 dark:hover:bg-gray-700 rounded text-gray-600 dark:text-gray-300">&gt;</button>
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

const SchoolCalendarPage: React.FC = () => {
  const DESKTOP_FRAME_WIDTH = 1520;
  const DESKTOP_FRAME_HEIGHT = 860;
  const [currentDate, setCurrentDate] = useState(new Date());
  const [events, setEvents] = useState<Record<string, CalendarEvent>>({});
  const [officialHolidays, setOfficialHolidays] = useState<Record<string, CalendarEvent>>({});
  const [isSaving, setIsSaving] = useState(false);
  const [selectedTool, setSelectedTool] = useState<DayType>('schoolDay');
  const [terms, setTerms] = useState<{ term1: Term; term2: Term }>({
    term1: { startDate: null, endDate: null },
    term2: { startDate: null, endDate: null },
  });
  const [academicYear, setAcademicYear] = useState<string>('');
  const [fetchedYears, setFetchedYears] = useState<Set<number>>(new Set());
  const [activeDocId, setActiveDocId] = useState<string>('default');
  const [isDataReady, setIsDataReady] = useState(false);
  const [autoSaveStatus, setAutoSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [desktopScale, setDesktopScale] = useState(1);
  const desktopViewportRef = useRef<HTMLDivElement>(null);
  const currentUser = useSelector((state: RootState) => state.auth.user);
  const schoolId = (currentUser as any)?.schoolId;

  const fetchData = useCallback(async () => {
    if (!schoolId) return;
    const docRef = doc(db, 'school-settings', schoolId, 'main_calendar', 'default');
    const docSnap = await getDoc(docRef);

    let baseEvents: Record<string, CalendarEvent> = {};
    if (docSnap.exists()) {
      const data = docSnap.data() as SchoolCalendarData;
      baseEvents = data.events || {};
      if (data.terms) {
        setTerms(data.terms);
      }
      if (data.academicYear) {
        setAcademicYear(data.academicYear);
      }
    }

    // Now fetch activities and merge them
    try {
      const activitiesQuery = query(collection(db, 'school-settings', schoolId, 'activities'));
      const activitiesSnapshot = await getDocs(activitiesQuery);
      const activityEvents: Record<string, CalendarEvent> = {};

      activitiesSnapshot.forEach(doc => {
        const activity = doc.data();
        if (activity.date) { // date is 'YYYY-MM-DD'
          const dateStr = activity.date;
          const newEventDescription = `กิจกรรม: ${activity.name}`;

          if (activityEvents[dateStr]) {
            if (!activityEvents[dateStr].description?.includes(newEventDescription)) {
              activityEvents[dateStr].description += `\n${newEventDescription}`;
            }
          } else {
            activityEvents[dateStr] = {
              type: 'schoolDay', // Treat as a school day with an event
              description: newEventDescription,
            };
          }
        }
      });

      // Merge baseEvents and activityEvents
      const mergedEvents = { ...baseEvents };
      for (const dateStr in activityEvents) {
        if (mergedEvents[dateStr]) {
          // Update type to schoolDay if there's an activity (makeup class/school event) 
          // to ensure it's counted in the 100-day calculation as per user requirement.
          mergedEvents[dateStr].type = 'schoolDay';

          if (!mergedEvents[dateStr].description?.includes(activityEvents[dateStr].description!)) {
            mergedEvents[dateStr].description = `${mergedEvents[dateStr].description || ''}\n${activityEvents[dateStr].description}`.trim();
          }
        } else {
          mergedEvents[dateStr] = activityEvents[dateStr];
        }
      }
      setEvents(mergedEvents);

    } catch (error) {
      console.error("Error fetching activities for calendar:", error);
      setEvents(baseEvents); // Fallback to just calendar events
    } finally {
      setIsDataReady(true);
    }
  }, [schoolId]);

  useEffect(() => {
    if (schoolId) {
      setActiveDocId('default');
      fetchData();
    }
  }, [fetchData, schoolId]);

  // Auto-save: persist events/terms to the active calendar document shortly after any change,
  // so edits aren't lost if the user navigates away without pressing "บันทึกปฏิทิน".
  useEffect(() => {
    if (!schoolId || !isDataReady) return;

    setAutoSaveStatus('saving');
    const handler = setTimeout(async () => {
      try {
        const docRef = doc(db, 'school-settings', schoolId, 'main_calendar', activeDocId);
        await setDoc(docRef, { events, terms, academicYear }, { merge: true });
        setAutoSaveStatus('saved');
      } catch (error) {
        console.error('Auto-save failed:', error);
        setAutoSaveStatus('error');
      }
    }, 1000);

    return () => clearTimeout(handler);
  }, [events, terms, academicYear, schoolId, activeDocId, isDataReady]);

  useLayoutEffect(() => {
    const updateDesktopScale = () => {
      if (!desktopViewportRef.current) return;

      const viewportWidth = desktopViewportRef.current.clientWidth;
      const viewportHeight = desktopViewportRef.current.clientHeight;

      if (window.innerWidth < 1024 || viewportWidth === 0 || viewportHeight === 0) {
        setDesktopScale(1);
        return;
      }

      const widthScale = viewportWidth / DESKTOP_FRAME_WIDTH;
      const heightScale = viewportHeight / DESKTOP_FRAME_HEIGHT;
      const nextScale = Math.min(widthScale, heightScale, 1);
      setDesktopScale(nextScale);
    };

    updateDesktopScale();

    const resizeObserver = new ResizeObserver(() => {
      updateDesktopScale();
    });

    if (desktopViewportRef.current) {
      resizeObserver.observe(desktopViewportRef.current);
    }

    window.addEventListener('resize', updateDesktopScale);
    return () => {
      resizeObserver.disconnect();
      window.removeEventListener('resize', updateDesktopScale);
    };
  }, []);

  const handleTermDateChange = useCallback((term: 'term1' | 'term2', type: 'startDate' | 'endDate', value: string) => {
    setTerms(prev => ({
      ...prev,
      [term]: {
        ...prev[term],
        [type]: value || null,
      },
    }));
  }, []);

  // Effect to auto-recalculate end date when a holiday is added within a term
  useEffect(() => {
    const recalculateTermEndDate = (term: 'term1' | 'term2', showAlert: boolean) => {
      const termData = terms[term];
      if (!termData.startDate || !termData.endDate) return;

      let schoolDaysCount = 0;
      const [sy, sm, sd] = termData.startDate.split('-').map(Number);
      const currentDate = new Date(sy, sm - 1, sd);
      let newEndDate: Date | null = null;

      // Loop for a reasonable amount of time to avoid infinite loops
      for (let i = 0; i < 365; i++) {
        const dayOfWeek = currentDate.getDay();
        const dateString = `${currentDate.getFullYear()}-${String(currentDate.getMonth() + 1).padStart(2, '0')}-${String(currentDate.getDate()).padStart(2, '0')}`;
        const existingEvent = events[dateString];

        let isSchoolDay = false;
        if (existingEvent?.type === 'schoolDay') {
          isSchoolDay = true;
        } else if (existingEvent?.type === 'holiday' || existingEvent?.type === 'specialHoliday') {
          isSchoolDay = false;
        } else if (dayOfWeek !== 0 && dayOfWeek !== 6) {
          isSchoolDay = true;
        }

        if (isSchoolDay) {
          schoolDaysCount++;
        }

        if (schoolDaysCount === 100) {
          newEndDate = new Date(currentDate);
          break;
        }
        currentDate.setDate(currentDate.getDate() + 1);
      }

      const newEndDateString = newEndDate ? `${newEndDate.getFullYear()}-${String(newEndDate.getMonth() + 1).padStart(2, '0')}-${String(newEndDate.getDate()).padStart(2, '0')}` : null;
      if (newEndDate && newEndDateString !== termData.endDate) {
        handleTermDateChange(term, 'endDate', newEndDateString!);
        if (showAlert) {
          Swal.fire({
            toast: true,
            position: 'top-end',
            icon: 'info',
            title: `วันสิ้นสุดภาคเรียนที่ ${term === 'term1' ? 1 : 2} ถูกปรับอัตโนมัติ`,
            text: `เป็นวันที่ ${newEndDate.getDate()} ${thaiMonths[newEndDate.getMonth()]} ${getThaiYear(newEndDate)} เนื่องจากมีการเปลี่ยนแปลงวันหยุด`,
            showConfirmButton: false,
            timer: 5000,
            timerProgressBar: true,
          });
        }
      }
    };

    const handler = setTimeout(() => {
      recalculateTermEndDate('term1', true);
      recalculateTermEndDate('term2', true);
    }, 500); // Debounce to avoid rapid recalculations

    return () => clearTimeout(handler);

  }, [events, terms, handleTermDateChange]);

  // Effect to automatically fetch public holidays when the year changes
  useEffect(() => {
    const christianYear = currentDate.getFullYear();

    const fetchHolidaysForYear = async (year: number) => {
      if (fetchedYears.has(year)) {
        return; // Already fetched for this year
      }

      const apiKey = import.meta.env.VITE_GOOGLE_CALENDAR_API_KEY;
      if (!apiKey) return;

      try {
        const calendarId = 'th.th#holiday@group.v.calendar.google.com';
        const timeMin = `${year}-01-01T00:00:00Z`;
        const timeMax = `${year}-12-31T23:59:59Z`;

        const response = await fetch(
          `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events?key=${apiKey}&timeMin=${timeMin}&timeMax=${timeMax}&singleEvents=true&orderBy=startTime`
        );

        if (!response.ok) return;

        const data = await response.json();
        const items = data.items || [];

        setEvents(prev => {
          const newEvents = { ...prev };
          const newOfficial: Record<string, CalendarEvent> = {};
          items.forEach((item: any) => {
            if (item.start && item.start.date) {
              const summary = item.summary || '';
              const dateStr = item.start.date;

              if (!isNonOfficialHoliday(summary)) {
                newEvents[dateStr] = { type: 'holiday', description: summary };
                newOfficial[dateStr] = { type: 'holiday', description: summary };

                // วันเข้าพรรษาตกเป็นวันถัดจากวันอาสาฬหบูชาเสมอ แต่ปฏิทินวันหยุดของ Google
                // ไม่มี event นี้แยกให้ จึงต้องคำนวณเพิ่มเองจากวันอาสาฬหบูชาที่ดึงมาได้
                if (summary.includes('วันอาสาฬหบูชา')) {
                  const [ay, am, ad] = dateStr.split('-').map(Number);
                  const khaoPhansa = new Date(ay, am - 1, ad + 1);
                  const khaoPhansaStr = `${khaoPhansa.getFullYear()}-${String(khaoPhansa.getMonth() + 1).padStart(2, '0')}-${String(khaoPhansa.getDate()).padStart(2, '0')}`;
                  newEvents[khaoPhansaStr] = { type: 'holiday', description: 'วันเข้าพรรษา' };
                  newOfficial[khaoPhansaStr] = { type: 'holiday', description: 'วันเข้าพรรษา' };
                }
              } else {
                // ถ้าเจอวันหยุดที่ต้องกรองออก และมีอยู่ในปฏิทินแล้ว ให้ลบออก
                if (newEvents[dateStr] && newEvents[dateStr].type === 'holiday') {
                  delete newEvents[dateStr];
                }
              }
            }
          });
          setOfficialHolidays(prev => ({ ...prev, ...newOfficial }));
          return newEvents;
        });

        setFetchedYears(prev => new Set(prev).add(year));
      } catch (error) {
        console.error("Could not fetch public holidays:", error);
      }
    };

    fetchHolidaysForYear(christianYear);
  }, [currentDate.getFullYear(), fetchedYears]);

  const handleLoadYear = async () => {
    if (!schoolId || !academicYear) return;
    setIsSaving(true);
    try {
      const docRef = doc(db, 'school-settings', schoolId, 'main_calendar', academicYear);
      const docSnap = await getDoc(docRef);
      setActiveDocId(academicYear);
      if (docSnap.exists()) {
        const data = docSnap.data() as SchoolCalendarData;
        setEvents(data.events || {});
        if (data.terms) setTerms(data.terms);
        Swal.fire({
          icon: 'success',
          title: 'โหลดข้อมูลสำเร็จ',
          text: `โหลดข้อมูลปีการศึกษา ${academicYear} เรียบร้อย`,
          timer: 1500,
          showConfirmButton: false
        });
      } else {
        Swal.fire({
          icon: 'info',
          title: 'ไม่พบข้อมูล',
          text: `ไม่พบข้อมูลที่บันทึกไว้ของปี ${academicYear} (คุณสามารถเริ่มกำหนดใหม่ได้เลย)`,
        });
      }
    } catch (error) {
      console.error("Error loading year:", error);
      Swal.fire('ข้อผิดพลาด', 'ไม่สามารถโหลดข้อมูลได้', 'error');
    } finally {
      setIsSaving(false);
    }
  };

  const handleSave = async () => {
    if (!schoolId) return;
    if (!academicYear) {
      Swal.fire('กรุณาระบุปีการศึกษา', 'เช่น 2568', 'warning');
      return;
    }

    setIsSaving(true);
    try {
      // 1. บันทึกข้อมูลลงใน Document ID ที่เป็นปีการศึกษา (เช่น "2569") เพื่อเก็บประวัติแยกกัน
      const yearDocRef = doc(db, 'school-settings', schoolId, 'main_calendar', academicYear);
      await setDoc(yearDocRef, { events, terms, academicYear });
      setActiveDocId(academicYear);

      // 2. ถามผู้ใช้ว่าต้องการตั้งเป็นปีปัจจุบัน (Default) หรือไม่
      const result = await Swal.fire({
        title: 'บันทึกข้อมูลเรียบร้อย',
        text: `ต้องการตั้งปีการศึกษา ${academicYear} เป็นปีปัจจุบัน (Default) หรือไม่?`,
        icon: 'question',
        showCancelButton: true,
        confirmButtonText: 'ใช่, ตั้งเป็นปีปัจจุบัน',
        cancelButtonText: 'ไม่, บันทึกเป็นฉบับร่าง',
        confirmButtonColor: '#3085d6',
        cancelButtonColor: '#d33',
      });

      if (result.isConfirmed) {
        const defaultDocRef = doc(db, 'school-settings', schoolId, 'main_calendar', 'default');
        await setDoc(defaultDocRef, { events, terms, academicYear });
        Swal.fire('สำเร็จ', 'ตั้งค่าเป็นปีการศึกษาปัจจุบันเรียบร้อยแล้ว', 'success');
      } else {
        Swal.fire({
          toast: true,
          position: 'top-end',
          icon: 'success',
          title: `บันทึกข้อมูลปี ${academicYear} แล้ว`,
          showConfirmButton: false,
          timer: 3000,
          timerProgressBar: true,
        });
      }
    } catch (error) {
      console.error("Error saving calendar: ", error);
      Swal.fire({ icon: 'error', title: 'เกิดข้อผิดพลาด', text: 'ไม่สามารถบันทึกข้อมูลปฏิทินได้' });
    } finally {
      setIsSaving(false);
    }
  };

  const clearDayEvent = useCallback((dateString: string) => {
    setEvents(prev => {
      const newEvents = { ...prev };
      // Check if this date was originally an official holiday
      if (officialHolidays[dateString]) {
        newEvents[dateString] = officialHolidays[dateString];
      } else {
        delete newEvents[dateString];
      }
      return newEvents;
    });
  }, [officialHolidays]);

  const handleDayClick = async (date: Date) => {
    const dateString = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
    const existingEvent = events[dateString];

    if (existingEvent && existingEvent.type === selectedTool) {
      // Click again to clear
      clearDayEvent(dateString);
    } else {
      // Add or change event
      if (selectedTool === 'holiday' || selectedTool === 'specialHoliday') {
        if (selectedTool === 'specialHoliday') {
          const dayOfWeek = date.getDay();
          const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
          if (isWeekend) {
            Swal.fire('ไม่สามารถทำรายการได้', 'ไม่สามารถกำหนดวันหยุดพิเศษในวันเสาร์-อาทิตย์ได้', 'warning');
            return;
          }
          if (existingEvent?.type === 'holiday') {
            Swal.fire('ไม่สามารถทำรายการได้', 'ไม่สามารถกำหนดวันหยุดพิเศษทับวันหยุดราชการได้', 'warning');
            return;
          }
        }

        const { value: description } = await Swal.fire({
          title: `กำหนดรายละเอียดสำหรับวัน${selectedTool === 'holiday' ? 'หยุด' : 'หยุดพิเศษ'}`,
          input: 'text',
          inputLabel: 'รายละเอียด (เช่น หยุดแข่งขันศิลหัตกรรมนักเรียน)',
          inputValue: existingEvent?.description || '',
          showCancelButton: true,
          confirmButtonText: 'บันทึก',
          cancelButtonText: 'ยกเลิก',
          inputValidator: (value) => {
            if (!value) {
              return 'กรุณากรอกรายละเอียด!'
            }
          }
        });
        if (description) {
          setEvents(prev => ({ ...prev, [dateString]: { type: selectedTool, description } }));
        }
      } else { // schoolDay
        const dayOfWeek = date.getDay();
        const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
        const isHolidayEvent = existingEvent?.type === 'holiday' || existingEvent?.type === 'specialHoliday';

        if (isWeekend || isHolidayEvent) {
          const { value: formValues } = await Swal.fire({
            title: 'กำหนดรายละเอียดวันเรียนชดเชย',
            html: `
              <div class="flex flex-col gap-4 text-left">
                <div>
                  <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">รายละเอียด</label>
                  <input id="swal-input-desc" class="swal2-input m-0 w-full bg-gray-50 dark:bg-gray-700 text-gray-900 dark:text-white border-gray-300 dark:border-gray-600" placeholder="เช่น สอนชดเชย" value="สอนชดเชย">
                </div>
                <div>
                  <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">ใช้ตารางสอนของวัน</label>
                  <div class="grid grid-cols-3 gap-2">
                    ${[
                { val: '', label: 'ปกติ' },
                { val: 'mon', label: 'จันทร์' },
                { val: 'tue', label: 'อังคาร' },
                { val: 'wed', label: 'พุธ' },
                { val: 'thu', label: 'พฤหัส' },
                { val: 'fri', label: 'ศุกร์' }
              ].map(opt => `
                      <div class="relative">
                        <input type="radio" name="scheduleDay" id="day-${opt.val || 'normal'}" value="${opt.val}" class="peer hidden" ${opt.val === (isWeekend ? 'mon' : '') ? 'checked' : ''}>
                        <label for="day-${opt.val || 'normal'}" class="block cursor-pointer rounded-lg border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-800 p-2 text-center text-sm font-medium text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700 peer-checked:border-indigo-600 peer-checked:bg-indigo-600 peer-checked:text-white transition-all">
                          ${opt.label}
                        </label>
                      </div>
                    `).join('')}
                  </div>
                </div>
              </div>
            `,
            focusConfirm: false,
            showCancelButton: true,
            confirmButtonText: 'บันทึก',
            cancelButtonText: 'ยกเลิก',
            preConfirm: () => {
              const selectedDay = document.querySelector('input[name="scheduleDay"]:checked') as HTMLInputElement;
              if (isWeekend && !selectedDay?.value) {
                Swal.showValidationMessage('วันเสาร์-อาทิตย์ต้องเลือกว่าจะใช้ตารางสอนของวันใด');
                return false;
              }
              return {
                description: (document.getElementById('swal-input-desc') as HTMLInputElement).value,
                scheduleDay: selectedDay ? selectedDay.value : ''
              }
            }
          });
          if (formValues && formValues.description) {
            setEvents(prev => ({
              ...prev,
              [dateString]: {
                type: 'schoolDay',
                description: formValues.description,
                scheduleDay: formValues.scheduleDay || undefined
              }
            }));
          }
        } else {
          setEvents(prev => ({ ...prev, [dateString]: { type: 'schoolDay' } }));
        }
      }
    }
  };

  const handleAutoCalculateEndDate = (term: 'term1' | 'term2') => {
    const termData = terms[term];
    if (!termData.startDate) {
      Swal.fire('ข้อมูลไม่ครบถ้วน', 'กรุณากำหนดวันเริ่มต้นของภาคเรียนก่อน', 'warning');
      return;
    }

    let schoolDaysCount = 0;
    const [sy, sm, sd] = termData.startDate.split('-').map(Number);
    const currentDate = new Date(sy, sm - 1, sd);
    let endDate: Date | null = null;

    // Loop for a reasonable amount of time (e.g., 200 days from start)
    for (let i = 0; i < 200; i++) {
      const dayOfWeek = currentDate.getDay(); // Sunday=0, Saturday=6
      const dateString = `${currentDate.getFullYear()}-${String(currentDate.getMonth() + 1).padStart(2, '0')}-${String(currentDate.getDate()).padStart(2, '0')}`;
      const existingEvent = events[dateString];

      let isSchoolDay = false;
      if (existingEvent?.type === 'schoolDay') {
        isSchoolDay = true;
      } else if (existingEvent?.type === 'holiday' || existingEvent?.type === 'specialHoliday') {
        isSchoolDay = false;
      } else if (dayOfWeek !== 0 && dayOfWeek !== 6) {
        isSchoolDay = true;
      }

      if (isSchoolDay) {
        schoolDaysCount++;
      }

      if (schoolDaysCount === 100) {
        endDate = new Date(currentDate);
        break;
      }

      currentDate.setDate(currentDate.getDate() + 1);
    }

    if (endDate) {
      const endDateString = `${endDate.getFullYear()}-${String(endDate.getMonth() + 1).padStart(2, '0')}-${String(endDate.getDate()).padStart(2, '0')}`;
      handleTermDateChange(term, 'endDate', endDateString);
      Swal.fire('คำนวณสำเร็จ', `วันสิ้นสุดภาคเรียน (100 วันเรียน) คือ ${endDate.getDate()} ${thaiMonths[endDate.getMonth()]} ${getThaiYear(endDate)}`, 'success');
    } else {
      Swal.fire('คำนวณไม่สำเร็จ', 'ไม่สามารถหาวันสิ้นสุด 100 วันเรียนได้ภายใน 200 วันจากวันที่เริ่มต้น', 'error');
    }
  };

  // Official holidays (from Google Calendar) in the visible month that are not currently
  // marked as a holiday in the calendar — usually means a filter or manual edit removed it.
  const monthAnomalies = useMemo(() => {
    const year = currentDate.getFullYear();
    const month = currentDate.getMonth();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const list: { dateString: string; day: number; description?: string }[] = [];

    for (let day = 1; day <= daysInMonth; day++) {
      const dateString = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
      const official = officialHolidays[dateString];
      if (official && events[dateString]?.type !== 'holiday') {
        list.push({ dateString, day, description: official.description });
      }
    }
    return list;
  }, [currentDate, officialHolidays, events]);

  const renderCalendar = () => {
    const year = currentDate.getFullYear();
    const month = currentDate.getMonth();
    const firstDayOfMonth = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const today = new Date();

    const days = [];
    // Add empty cells for days before the 1st
    for (let i = 0; i < firstDayOfMonth; i++) { // Changed to start week on Sunday
      days.push(<div key={`empty-start-${i}`} className="border border-transparent"></div>);
    }

    for (let day = 1; day <= daysInMonth; day++) {
      const date = new Date(year, month, day);
      const dateString = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
      const event = events[dateString];
      const dayOfWeek = date.getDay(); // Sunday is 0, Saturday is 6
      const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
      const isToday = date.getFullYear() === today.getFullYear() && date.getMonth() === today.getMonth() && date.getDate() === today.getDate();
      const isTerm1 = terms.term1.startDate && terms.term1.endDate && dateString >= terms.term1.startDate && dateString <= terms.term1.endDate;
      const isTerm2 = terms.term2.startDate && terms.term2.endDate && dateString >= terms.term2.startDate && dateString <= terms.term2.endDate;

      let cellClass = 'bg-white dark:bg-[#2a2b2f] hover:border-indigo-500';
      if (event?.type === 'schoolDay') {
        cellClass = 'bg-blue-600/20 hover:border-blue-400';
      } else if (event?.type === 'holiday' || event?.type === 'specialHoliday') {
        cellClass = event.type === 'holiday' ? 'bg-red-600/20 hover:border-red-400' : 'bg-yellow-500/20 hover:border-yellow-400';
      } else if (isWeekend) {
        cellClass = 'bg-red-100/50 dark:bg-red-900/30';
      }

      let termIndicator = null;
      if (isTerm1) {
        termIndicator = <div className="absolute top-1.5 right-1.5 w-2 h-2 bg-cyan-400 rounded-full" title="ภาคเรียนที่ 1"></div>;
      } else if (isTerm2) {
        termIndicator = <div className="absolute top-1.5 right-1.5 w-2 h-2 bg-purple-400 rounded-full" title="ภาคเรียนที่ 2"></div>;
      }

      days.push(
        <div
          key={day}
          onClick={() => handleDayClick(date)}
          title={event?.description}
          className={`relative min-w-0 min-h-0 h-full overflow-hidden border border-gray-200 dark:border-gray-700/50 rounded-lg p-1.5 sm:p-2 text-left cursor-pointer transition-all duration-200 ease-in-out flex flex-col ${cellClass}`}
        >
          {termIndicator}
          {event && (
            <button
              onClick={(e) => { e.stopPropagation(); clearDayEvent(dateString); }}
              title="ลบการกำหนดวันนี้"
              className="absolute top-0.5 left-0.5 w-4 h-4 sm:w-5 sm:h-5 flex items-center justify-center rounded-full bg-white/80 dark:bg-black/40 text-gray-500 dark:text-gray-300 hover:bg-red-500 hover:text-white text-xs leading-none z-10 shadow-sm"
            >
              ×
            </button>
          )}
          <div className={`shrink-0 font-semibold mb-1 text-sm sm:text-base ${isToday ? 'bg-indigo-600 text-white rounded-full w-6 h-6 sm:w-7 sm:h-7 flex items-center justify-center' : 'text-gray-700 dark:text-gray-200'}`}>{day}</div>
          {event && (event.type !== 'schoolDay' || event.description || event.scheduleDay) && (
            <div className="text-[10px] sm:text-xs opacity-90 flex-grow overflow-hidden min-h-0">
              <p className="font-medium leading-tight break-words line-clamp-2" style={{ whiteSpace: 'pre-wrap' }}>{event.description || (event.type === 'holiday' ? 'วันหยุด' : 'หยุดพิเศษ')}</p>
              {event.scheduleDay && (
                <p className="text-[9px] sm:text-[10px] mt-0.5 text-indigo-700 dark:text-indigo-300 font-semibold truncate">
                  (ใช้ตาราง{DAY_MAP[event.scheduleDay]})
                </p>
              )}
            </div>
          )}
        </div>
      );
    }

    // Add empty cells to fill the last row
    const totalCells = days.length;
    const remainingCells = (7 - (totalCells % 7)) % 7;
    for (let i = 0; i < remainingCells; i++) {
      days.push(<div key={`empty-end-${i}`} className="border border-transparent"></div>);
    }
    return days;
  };

  const changeMonth = (delta: number) => {
    setCurrentDate(prev => new Date(prev.getFullYear(), prev.getMonth() + delta, 1));
  };

  const toolOptions = [
    { id: 'schoolDay', label: 'กำหนดวันเรียนชดเชย', color: 'bg-blue-600' },
    { id: 'holiday', label: 'กำหนดวันหยุด', color: 'bg-red-600' },
    { id: 'specialHoliday', label: 'กำหนดวันหยุดพิเศษ', color: 'bg-yellow-500' },
  ];

  const autoSaveIndicator = (
    <span className={`text-xs font-medium whitespace-nowrap ${autoSaveStatus === 'error' ? 'text-red-500' : 'text-gray-400 dark:text-gray-500'}`}>
      {autoSaveStatus === 'saving' && 'กำลังบันทึกอัตโนมัติ...'}
      {autoSaveStatus === 'saved' && 'บันทึกอัตโนมัติแล้ว ✓'}
      {autoSaveStatus === 'error' && 'บันทึกอัตโนมัติไม่สำเร็จ'}
    </span>
  );

  const anomalyBadge = monthAnomalies.length > 0 ? (
    <div className="relative group">
      <div className="flex items-center gap-1 px-2 py-1 rounded-md bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300 text-xs font-medium cursor-help whitespace-nowrap">
        <span>⚠</span>
        <span>วันหยุดราชการผิดปกติ {monthAnomalies.length} วัน</span>
      </div>
      <div className="hidden group-hover:block absolute right-0 mt-1 z-50 w-64 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg p-3 text-xs text-gray-700 dark:text-gray-200">
        <p className="font-semibold mb-1">วันหยุดราชการที่ไม่ได้ถูกทำเครื่องหมายเป็นวันหยุดในปฏิทินนี้:</p>
        <ul className="space-y-1">
          {monthAnomalies.map(a => (
            <li key={a.dateString}>{a.day} {thaiMonths[currentDate.getMonth()]} — {a.description}</li>
          ))}
        </ul>
      </div>
    </div>
  ) : null;

  return (
    <MainLayout>
      <div className="px-3 py-3 sm:px-4 sm:py-4 lg:px-4 text-gray-900 dark:text-white transition-colors duration-300 overflow-x-hidden lg:h-[calc(100vh-60px)] lg:overflow-hidden">
        <div className="max-w-[1600px] mx-auto lg:h-full flex flex-col min-h-0">
          <div className="flex items-center gap-4 mb-3 sm:mb-4 shrink-0">
            <BackButton to="/academic/hub/settings" />
            <div className="min-w-0">
              <h1 className="text-xl sm:text-2xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
                <Calendar className="text-indigo-600 dark:text-indigo-400" size={28} />
                ปฏิทินการศึกษา
              </h1>
              <p className="text-gray-500 dark:text-gray-400 mt-1 text-sm">จัดการกำหนดการและวันหยุดของสถานศึกษา</p>
            </div>
          </div>

          <div ref={desktopViewportRef} className="hidden lg:flex lg:flex-1 lg:min-h-0 lg:items-start lg:justify-center lg:overflow-hidden">
            <div
              className="shrink-0"
              style={{
                width: DESKTOP_FRAME_WIDTH * desktopScale,
                height: DESKTOP_FRAME_HEIGHT * desktopScale,
              }}
            >
              <div
                className="bg-white dark:bg-[#2a2b2f] rounded-2xl p-4 shadow-sm dark:shadow-none overflow-x-hidden h-full flex flex-col origin-top-left"
                style={{
                  width: DESKTOP_FRAME_WIDTH,
                  height: DESKTOP_FRAME_HEIGHT,
                  transform: `scale(${desktopScale})`,
                }}
              >
                <div className="flex justify-end items-center mb-3 gap-3 shrink-0">
                  {autoSaveIndicator}
                  <button onClick={handleSave} disabled={isSaving} className="bg-green-600 hover:bg-green-700 text-white font-bold py-2 px-5 rounded-lg transition-colors duration-300 disabled:bg-gray-500 disabled:cursor-not-allowed">
                    {isSaving ? 'กำลังบันทึก...' : 'บันทึกปฏิทิน'}
                  </button>
                </div>

                <div className="grid gap-4 grid-cols-[340px_minmax(0,1fr)] flex-1 min-h-0">
                  <div className="space-y-4 min-w-0 min-h-0">
                    <div className="bg-gray-50 dark:bg-[#1e1f21] p-4 rounded-lg border border-gray-200 dark:border-gray-700">
                      <div className="flex flex-col gap-2.5 mb-3">
                        <h3 className="text-lg font-semibold text-gray-900 dark:text-white">กำหนดปีและภาคเรียน</h3>
                        <div className="flex flex-wrap items-center gap-2">
                          <label htmlFor="academic-year-desktop" className="text-sm text-gray-600 dark:text-gray-400">ปีการศึกษา:</label>
                          <input type="text" id="academic-year-desktop" value={academicYear} onChange={e => setAcademicYear(e.target.value)} placeholder="เช่น 2568" className="bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-md px-3 py-2 text-gray-900 dark:text-white w-28" />
                          <button onClick={handleLoadYear} className="bg-blue-500 hover:bg-blue-600 text-white px-3 py-2 rounded-md text-sm transition-colors" title="โหลดข้อมูลของปีที่ระบุ">
                            โหลดข้อมูล
                          </button>
                        </div>
                      </div>

                      <div className="space-y-3 pt-3 border-t border-gray-200 dark:border-gray-700/50">
                        <div className="space-y-2">
                          <h4 className="font-semibold text-cyan-400">ภาคเรียนที่ 1</h4>
                          <div className="grid grid-cols-[64px_minmax(0,1fr)] gap-2 items-center">
                            <label htmlFor="term1-start-desktop" className="text-sm text-gray-600 dark:text-gray-400">เริ่มต้น</label>
                            <ThaiDatePicker value={terms.term1.startDate} onChange={(val) => handleTermDateChange('term1', 'startDate', val)} events={events} />
                          </div>
                          <div className="grid grid-cols-[64px_minmax(0,1fr)_40px] gap-2 items-center">
                            <label htmlFor="term1-end-desktop" className="text-sm text-gray-600 dark:text-gray-400">สิ้นสุด</label>
                            <ThaiDatePicker value={terms.term1.endDate} onChange={(val) => handleTermDateChange('term1', 'endDate', val)} events={events} />
                            <button onClick={() => handleAutoCalculateEndDate('term1')} title="คำนวณวันสิ้นสุด 100 วันเรียนอัตโนมัติ" className="h-10 flex items-center justify-center text-xs bg-gray-600 hover:bg-gray-500 text-white rounded-md transition-colors">
                              <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M6 2a1 1 0 00-1 1v1H4a2 2 0 00-2 2v10a2 2 0 002 2h12a2 2 0 002-2V6a2 2 0 00-2-2h-1V3a1 1 0 10-2 0v1H7V3a1 1 0 00-1-1zm0 5a1 1 0 000 2h8a1 1 0 100-2H6z" clipRule="evenodd" /></svg>
                            </button>
                          </div>
                        </div>

                        <div className="space-y-2">
                          <h4 className="font-semibold text-purple-400">ภาคเรียนที่ 2</h4>
                          <div className="grid grid-cols-[64px_minmax(0,1fr)] gap-2 items-center">
                            <label htmlFor="term2-start-desktop" className="text-sm text-gray-600 dark:text-gray-400">เริ่มต้น</label>
                            <ThaiDatePicker value={terms.term2.startDate} onChange={(val) => handleTermDateChange('term2', 'startDate', val)} events={events} />
                          </div>
                          <div className="grid grid-cols-[64px_minmax(0,1fr)_40px] gap-2 items-center">
                            <label htmlFor="term2-end-desktop" className="text-sm text-gray-600 dark:text-gray-400">สิ้นสุด</label>
                            <ThaiDatePicker value={terms.term2.endDate} onChange={(val) => handleTermDateChange('term2', 'endDate', val)} events={events} />
                            <button onClick={() => handleAutoCalculateEndDate('term2')} title="คำนวณวันสิ้นสุด 100 วันเรียนอัตโนมัติ" className="h-10 flex items-center justify-center text-xs bg-gray-600 hover:bg-gray-500 text-white rounded-md transition-colors">
                              <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M6 2a1 1 0 00-1 1v1H4a2 2 0 00-2 2v10a2 2 0 002 2h12a2 2 0 002-2V6a2 2 0 00-2-2h-1V3a1 1 0 10-2 0v1H7V3a1 1 0 00-1-1zm0 5a1 1 0 000 2h8a1 1 0 100-2H6z" clipRule="evenodd" /></svg>
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>

                    <div className="bg-gray-50 dark:bg-[#1e1f21] p-4 rounded-lg border border-gray-200 dark:border-gray-700">
                      <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-3">เครื่องมือ</h3>
                      <div className="grid grid-cols-1 gap-2">
                        {toolOptions.map(tool => (
                          <button
                            key={tool.id}
                            onClick={() => setSelectedTool(tool.id as DayType)}
                            className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-all
                            ${selectedTool === tool.id
                                ? `${tool.color} text-white ring-2 ring-offset-2 ring-offset-gray-100 dark:ring-offset-[#1e1f21] ring-gray-500 dark:ring-white`
                                : 'bg-gray-200 dark:bg-gray-600 text-gray-700 dark:text-white hover:bg-gray-300 dark:hover:bg-gray-500'
                              }`}
                          >
                            <span className={`w-3 h-3 rounded-full ${tool.color}`}></span>
                            {tool.label}
                          </button>
                        ))}
                      </div>
                      <p className="text-xs text-gray-500 dark:text-gray-400 mt-3">เลือกเครื่องมือแล้วคลิกบนวันที่ในปฏิทินเพื่อกำหนดประเภทของวัน</p>
                    </div>
                  </div>

                  <div className="min-w-0 bg-gray-50 dark:bg-[#1e1f21] p-3 rounded-lg border border-gray-200 dark:border-gray-700 min-h-0 flex flex-col">
                    <div className="flex justify-between items-center gap-3 mb-3 shrink-0">
                      <button onClick={() => changeMonth(-1)} className="px-3 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-500 shrink-0">&lt;</button>
                      <h2 className="text-xl font-bold text-gray-900 dark:text-white text-center min-w-0">
                        {thaiMonths[currentDate.getMonth()]} {getThaiYear(currentDate)}
                      </h2>
                      <div className="flex items-center gap-2 shrink-0">
                        {anomalyBadge}
                        <button onClick={() => changeMonth(1)} className="px-3 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-500 shrink-0">&gt;</button>
                      </div>
                    </div>

                    <div className="grid grid-cols-7 gap-1 min-w-0 shrink-0">
                      <CalendarHeader />
                    </div>

                    <div className="grid grid-cols-7 gap-1 min-w-0 flex-1 min-h-0 auto-rows-fr">
                      {renderCalendar()}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="lg:hidden bg-white dark:bg-[#2a2b2f] rounded-2xl p-4 sm:p-5 shadow-sm dark:shadow-none overflow-x-hidden flex flex-col">
            <div className="flex flex-col sm:flex-row justify-end items-start sm:items-center mb-3 gap-3 shrink-0">
              {autoSaveIndicator}
              <button onClick={handleSave} disabled={isSaving} className="bg-green-600 hover:bg-green-700 text-white font-bold py-2 px-5 rounded-lg transition-colors duration-300 disabled:bg-gray-500 disabled:cursor-not-allowed">
                {isSaving ? 'กำลังบันทึก...' : 'บันทึกปฏิทิน'}
              </button>
            </div>

            <div className="grid gap-4">
              <div className="space-y-4 min-w-0">
                <div className="bg-gray-50 dark:bg-[#1e1f21] p-4 rounded-lg border border-gray-200 dark:border-gray-700">
                  <div className="flex flex-col gap-2.5 mb-3">
                    <h3 className="text-lg font-semibold text-gray-900 dark:text-white">กำหนดปีและภาคเรียน</h3>
                    <div className="flex flex-wrap items-center gap-2">
                      <label htmlFor="academic-year-mobile" className="text-sm text-gray-600 dark:text-gray-400">ปีการศึกษา:</label>
                      <input type="text" id="academic-year-mobile" value={academicYear} onChange={e => setAcademicYear(e.target.value)} placeholder="เช่น 2568" className="bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-md px-3 py-2 text-gray-900 dark:text-white w-28" />
                      <button onClick={handleLoadYear} className="bg-blue-500 hover:bg-blue-600 text-white px-3 py-2 rounded-md text-sm transition-colors" title="โหลดข้อมูลของปีที่ระบุ">
                        โหลดข้อมูล
                      </button>
                    </div>
                  </div>

                  <div className="space-y-3 pt-3 border-t border-gray-200 dark:border-gray-700/50">
                    <div className="space-y-2">
                      <h4 className="font-semibold text-cyan-400">ภาคเรียนที่ 1</h4>
                      <div className="grid grid-cols-1 sm:grid-cols-[64px_minmax(0,1fr)] gap-2 items-center">
                        <label htmlFor="term1-start-mobile" className="text-sm text-gray-600 dark:text-gray-400">เริ่มต้น</label>
                        <ThaiDatePicker value={terms.term1.startDate} onChange={(val) => handleTermDateChange('term1', 'startDate', val)} events={events} />
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-[64px_minmax(0,1fr)_40px] gap-2 items-center">
                        <label htmlFor="term1-end-mobile" className="text-sm text-gray-600 dark:text-gray-400">สิ้นสุด</label>
                        <ThaiDatePicker value={terms.term1.endDate} onChange={(val) => handleTermDateChange('term1', 'endDate', val)} events={events} />
                        <button onClick={() => handleAutoCalculateEndDate('term1')} title="คำนวณวันสิ้นสุด 100 วันเรียนอัตโนมัติ" className="h-10 flex items-center justify-center text-xs bg-gray-600 hover:bg-gray-500 text-white rounded-md transition-colors">
                          <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M6 2a1 1 0 00-1 1v1H4a2 2 0 00-2 2v10a2 2 0 002 2h12a2 2 0 002-2V6a2 2 0 00-2-2h-1V3a1 1 0 10-2 0v1H7V3a1 1 0 00-1-1zm0 5a1 1 0 000 2h8a1 1 0 100-2H6z" clipRule="evenodd" /></svg>
                        </button>
                      </div>
                    </div>

                    <div className="space-y-2">
                      <h4 className="font-semibold text-purple-400">ภาคเรียนที่ 2</h4>
                      <div className="grid grid-cols-1 sm:grid-cols-[64px_minmax(0,1fr)] gap-2 items-center">
                        <label htmlFor="term2-start-mobile" className="text-sm text-gray-600 dark:text-gray-400">เริ่มต้น</label>
                        <ThaiDatePicker value={terms.term2.startDate} onChange={(val) => handleTermDateChange('term2', 'startDate', val)} events={events} />
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-[64px_minmax(0,1fr)_40px] gap-2 items-center">
                        <label htmlFor="term2-end-mobile" className="text-sm text-gray-600 dark:text-gray-400">สิ้นสุด</label>
                        <ThaiDatePicker value={terms.term2.endDate} onChange={(val) => handleTermDateChange('term2', 'endDate', val)} events={events} />
                        <button onClick={() => handleAutoCalculateEndDate('term2')} title="คำนวณวันสิ้นสุด 100 วันเรียนอัตโนมัติ" className="h-10 flex items-center justify-center text-xs bg-gray-600 hover:bg-gray-500 text-white rounded-md transition-colors">
                          <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M6 2a1 1 0 00-1 1v1H4a2 2 0 00-2 2v10a2 2 0 002 2h12a2 2 0 002-2V6a2 2 0 00-2-2h-1V3a1 1 0 10-2 0v1H7V3a1 1 0 00-1-1zm0 5a1 1 0 000 2h8a1 1 0 100-2H6z" clipRule="evenodd" /></svg>
                        </button>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="bg-gray-50 dark:bg-[#1e1f21] p-4 rounded-lg border border-gray-200 dark:border-gray-700">
                  <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-3">เครื่องมือ</h3>
                  <div className="grid grid-cols-1 gap-2">
                    {toolOptions.map(tool => (
                      <button
                        key={tool.id}
                        onClick={() => setSelectedTool(tool.id as DayType)}
                        className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-all
                        ${selectedTool === tool.id
                            ? `${tool.color} text-white ring-2 ring-offset-2 ring-offset-gray-100 dark:ring-offset-[#1e1f21] ring-gray-500 dark:ring-white`
                            : 'bg-gray-200 dark:bg-gray-600 text-gray-700 dark:text-white hover:bg-gray-300 dark:hover:bg-gray-500'
                          }`}
                      >
                        <span className={`w-3 h-3 rounded-full ${tool.color}`}></span>
                        {tool.label}
                      </button>
                    ))}
                  </div>
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-3">เลือกเครื่องมือแล้วคลิกบนวันที่ในปฏิทินเพื่อกำหนดประเภทของวัน</p>
                </div>
              </div>

              <div className="min-w-0 bg-gray-50 dark:bg-[#1e1f21] p-3 rounded-lg border border-gray-200 dark:border-gray-700 flex flex-col">
                <div className="flex justify-between items-center gap-3 mb-3 shrink-0">
                  <button onClick={() => changeMonth(-1)} className="px-3 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-500 shrink-0">&lt;</button>
                  <h2 className="text-base sm:text-xl font-bold text-gray-900 dark:text-white text-center min-w-0">
                    {thaiMonths[currentDate.getMonth()]} {getThaiYear(currentDate)}
                  </h2>
                  <div className="flex items-center gap-2 shrink-0">
                    {anomalyBadge}
                    <button onClick={() => changeMonth(1)} className="px-3 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-500 shrink-0">&gt;</button>
                  </div>
                </div>

                <div className="grid grid-cols-7 gap-1 sm:gap-1.5 min-w-0 shrink-0">
                  <CalendarHeader />
                </div>

                <div className="grid grid-cols-7 gap-1 sm:gap-1.5 min-w-0">
                  {renderCalendar()}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </MainLayout>
  );
};

export default SchoolCalendarPage;
