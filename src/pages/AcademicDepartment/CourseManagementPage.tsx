import React, { useState, useRef, useLayoutEffect, useCallback, useEffect, useMemo } from "react";
import { Link } from "react-router-dom";
import { firestore as db } from "../../firebase";
import { collection, addDoc, getDocs, doc, getDoc } from "firebase/firestore";
import { useSelector, useDispatch } from "react-redux";
import Select from 'react-select'; // Import react-select
import { RootState } from "../../store";
import MainLayout from "@/layouts/MainLayout";
import {
  PlusCircle,
  BookOpen,
  Users,
  Clock,
  ListChecks,
  FileText,
  CalendarX2,
  Save,
  Lock,
} from "lucide-react";
import Swal from "sweetalert2";
import BackButton from "@/components/Shared/BackButton";
import { fetchTeachersMap } from '@/store/slices/userMapSlice';
import { getClassKeysByRange, CLASS_FULL_NAMES } from "@/utils/schoolUtils";
import { useSubjectGroups } from "@/hooks/useSubjectGroups";
import { getActiveSortedTeachers } from "@/utils/teacherSortUtils";

interface Teacher {
  id: string;
  name: string;
  teacherId?: string;
}

const DAYS_OF_WEEK = { mon: 'จันทร์', tue: 'อังคาร', wed: 'พุธ', thu: 'พฤหัสบดี', fri: 'ศุกร์' };

const ASSIGNMENT_COLORS = [
  { bg: 'bg-indigo-600', border: 'border-indigo-600', text: 'text-white' },
  { bg: 'bg-emerald-600', border: 'border-emerald-600', text: 'text-white' },
  { bg: 'bg-rose-600', border: 'border-rose-600', text: 'text-white' },
  { bg: 'bg-amber-600', border: 'border-amber-600', text: 'text-white' },
  { bg: 'bg-cyan-600', border: 'border-cyan-600', text: 'text-white' },
  { bg: 'bg-violet-600', border: 'border-violet-600', text: 'text-white' },
  { bg: 'bg-orange-600', border: 'border-orange-600', text: 'text-white' },
  { bg: 'bg-teal-600', border: 'border-teal-600', text: 'text-white' },
];




const CLASSES = {
  p1: 'ประถมศึกษาปีที่ 1', p2: 'ประถมศึกษาปีที่ 2', p3: 'ประถมศึกษาปีที่ 3',
  p4: 'ประถมศึกษาปีที่ 4', p5: 'ประถมศึกษาปีที่ 5', p6: 'ประถมศึกษาปีที่ 6',
  m1: 'มัธยมศึกษาปีที่ 1', m2: 'มัธยมศึกษาปีที่ 2', m3: 'มัธยมศึกษาปีที่ 3',
  m4: 'มัธยมศึกษาปีที่ 4', m5: 'มัธยมศึกษาปีที่ 5', m6: 'มัธยมศึกษาปีที่ 6',
};

// CSS สำหรับซ่อนสกอร์บาร์แต่ยังเลื่อนได้
const scrollbarHideStyle = `
  .hide-scrollbar::-webkit-scrollbar { display: none; }
  .hide-scrollbar { -ms-overflow-style: none; scrollbar-width: none; }
`;

// สร้างคอมโพเนนต์ NumberedTextarea เพื่อแสดงหมายเลขบรรทัด
const NumberedTextarea: React.FC<{
  id: string;
  value: string;
  onChange: (e: React.ChangeEvent<HTMLTextAreaElement>) => void;
  rows: number;
  className?: string;
  containerClassName?: string;
}> = ({ id, value, onChange, rows, className = "", containerClassName = "" }) => {
  const lineNumbersRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [lineCount, setLineCount] = useState(1);

  const syncScroll = useCallback(() => {
    if (lineNumbersRef.current && textareaRef.current) {
      lineNumbersRef.current.scrollTop = textareaRef.current.scrollTop;
    }
  }, []);

  useLayoutEffect(() => {
    const count = value.split("\n").length || 1;
    setLineCount(count);
    syncScroll();
  }, [value, syncScroll]);

  const handleTextareaChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    onChange(e);
  };

  const handleTextareaScroll = () => {
    syncScroll();
  };

  return (
    <div className={`flex w-full bg-white dark:bg-[#1e1f21] border border-gray-300 dark:border-gray-600 rounded-lg focus-within:ring-2 focus-within:ring-indigo-500 ${containerClassName}`}>
      <style dangerouslySetInnerHTML={{ __html: scrollbarHideStyle }} />
      <div ref={lineNumbersRef} className="text-right pr-2 pl-3 py-2 text-gray-500 select-none bg-gray-100 dark:bg-[#2a2b2f] font-mono leading-relaxed overflow-y-hidden rounded-l-lg">
        {Array.from({ length: lineCount }, (_, i) => (
          <div key={i}>{i + 1}</div>
        ))}
      </div>
      <textarea
        ref={textareaRef}
        id={id}
        value={value}
        onChange={handleTextareaChange}
        onScroll={handleTextareaScroll}
        rows={rows}
        className={`w-full bg-transparent px-2 py-2 focus:outline-none resize-y font-mono leading-relaxed text-gray-900 dark:text-white ${className}`}
      ></textarea>
    </div>
  );
};

const CourseManagementPage: React.FC = () => {
  const [courseTitle, setCourseTitle] = useState("");
  const [courseCode, setCourseCode] = useState("");
  const [subjectGroup, setSubjectGroup] = useState("");
  const [courseType, setCourseType] = useState("พื้นฐาน");
  const [formativeWeight, setFormativeWeight] = useState(0); // New state for formative score weight
  const [midtermWeight, setMidtermWeight] = useState(0);   // New state for midterm score weight
  const [indicators, setIndicators] = useState("");
  const [expectedOutcomes, setExpectedOutcomes] = useState("");
  const [targetClasses, setTargetClasses] = useState<string[]>([]);
  const [targetRooms, setTargetRooms] = useState<string[]>([]);
  const [hoursPerWeek, setHoursPerWeek] = useState(1);
  const [disallowedDays, setDisallowedDays] = useState<string[]>([]);
  const [lockedSlots, setLockedSlots] = useState<{ day: string; periodId: string }[]>([]);
  const [periodSettings, setPeriodSettings] = useState<any[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [availableClassOptions, setAvailableClassOptions] = useState<[string, string][]>([]);
  const [semester, setSemester] = useState("1"); // เพิ่ม state สำหรับภาคเรียน
  const [credits, setCredits] = useState(1); // เพิ่ม state สำหรับหน่วยกิต

  // New fields for alignment
  const [codeEn, setCodeEn] = useState("");
  const [titleEn, setTitleEn] = useState("");
  const [room, setRoom] = useState("");
  const [teacherId, setTeacherId] = useState("");
  const [isCombined, setIsCombined] = useState(false); // เพิ่ม state สำหรับเรียนรวม
  const [isElective, setIsElective] = useState(false); // เพิ่ม state สำหรับวิชาเลือกเสรี


  const currentUser = useSelector((state: RootState) => state.auth.user);



  // Dark Mode Detection
  const [isDark, setIsDark] = useState(document.documentElement.classList.contains('dark'));
  useEffect(() => {
    const observer = new MutationObserver((mutations) => {
      mutations.forEach((mutation) => {
        if (mutation.attributeName === 'class') {
          setIsDark(document.documentElement.classList.contains('dark'));
        }
      });
    });
    observer.observe(document.documentElement, { attributes: true });
    return () => observer.disconnect();
  }, []);

  const premiumStyles = {
    control: (base: any, state: any) => ({
      ...base,
      backgroundColor: isDark ? '#1e1f21' : '#f9fafb',
      borderColor: state.isFocused ? '#4f46e5' : isDark ? '#4b5563' : '#e5e7eb',
      borderRadius: '0.75rem', // rounded-xl
      padding: '2px',
      boxShadow: state.isFocused ? '0 0 0 2px rgba(79, 70, 229, 0.2)' : 'none',
      '&:hover': {
        borderColor: '#4f46e5',
      }
    }),
    menu: (base: any) => ({
      ...base,
      backgroundColor: isDark ? '#2a2b2f' : '#ffffff',
      border: isDark ? '1px solid #374151' : '1px solid #e5e7eb',
      borderRadius: '0.75rem',
      overflow: 'hidden',
      zIndex: 9999
    }),
    singleValue: (base: any) => ({
      ...base,
      color: isDark ? '#e5e7eb' : '#374151',
    }),
    input: (base: any) => ({
      ...base,
      color: isDark ? '#e5e7eb' : '#374151',
    }),
    option: (base: any, state: any) => ({
      ...base,
      backgroundColor: state.isSelected ? '#4f46e5' : state.isFocused ? (isDark ? '#374151' : '#f3f4f6') : 'transparent',
      color: state.isSelected ? 'white' : (isDark ? '#e5e7eb' : '#374151'),
      cursor: 'pointer',
      '&:active': {
        backgroundColor: '#4338ca',
      }
    })
  };

  const schoolId = (currentUser as any)?.schoolId;

  // ดึงข้อมูลกลุ่มสาระจาก Firebase (อ้างอิง SubjectGroupManagementPage)
  const { subjectGroups } = useSubjectGroups(schoolId);
  const subjectGroupOptions = useMemo(() =>
    subjectGroups.map(g => ({ value: g.name, label: g.name })),
    [subjectGroups]
  );
  const courseTypeOptions = [
    { value: 'พื้นฐาน', label: 'วิชาพื้นฐาน' },
    { value: 'เพิ่มเติม', label: 'วิชาเพิ่มเติม' }
  ];
  const { teachers: teacherMap, status: teacherMapStatus } = useSelector((state: RootState) => state.userMap);
  const teachers = useMemo(() => getActiveSortedTeachers(Object.values(teacherMap || {})), [teacherMap]);
  const teacherOptions = useMemo(() => {
    const list = [{ value: '', label: '-- ไม่ระบุ (Pending) --' }];
    if (teachers) {
      list.push(...teachers.map(t => ({ value: t.id, label: `${t.teacherId ? `${t.teacherId} ` : ''}${t.name}` })));
    }
    return list;
  }, [teachers]);
  const dispatch = useDispatch();

  // ✅ ดึงข้อมูล schoolSettings และ periodSettings จาก Redux (fetch ครั้งเดียวตอน login)
  const reduxSchoolSettings = useSelector((state: RootState) => state.schoolSettings);
  const reduxPeriodSettings = useSelector((state: RootState) => state.periodSettings);

  // Sync Redux → local state (backward compatible กับโค้ดเดิมที่ใช้ local state)
  useEffect(() => {
    if (reduxSchoolSettings.status === 'succeeded' && reduxSchoolSettings.availableClassOptions.length > 0) {
      setAvailableClassOptions(reduxSchoolSettings.availableClassOptions);
    }
  }, [reduxSchoolSettings.status, reduxSchoolSettings.availableClassOptions]);

  useEffect(() => {
    if (reduxPeriodSettings.status === 'succeeded') {
      // แสดงทุกคาบเพื่อให้เหมือนหน้าตารางสอนหลัก
      setPeriodSettings(reduxPeriodSettings.periods);
    }
  }, [reduxPeriodSettings.status, reduxPeriodSettings.periods]);





  const handleDisallowedDaysChange = (dayKey: string) => {
    setDisallowedDays(prev =>
      prev.includes(dayKey)
        ? prev.filter(d => d !== dayKey)
        : [...prev, dayKey]
    );
  };

  const toggleLockedSlot = (day: string, periodId: string) => {
    setLockedSlots(prev => {
      const exists = prev.find(s => s.day === day && s.periodId === periodId);
      if (exists) {
        return prev.filter(s => !(s.day === day && s.periodId === periodId));
      } else {
        // Validation: Limit by hoursPerWeek
        if (prev.length >= Math.ceil(hoursPerWeek)) {
          Swal.fire({
            icon: 'warning',
            title: 'เกินจำนวนคาบที่กำหนด',
            text: `คุณสามารถล็อคคาบเรียนได้ไม่เกิน ${Math.ceil(hoursPerWeek)} คาบต่อสัปดาห์ตามที่ระบุไว้`,
            confirmButtonColor: '#4f46e5'
          });
          return prev;
        }
        return [...prev, { day, periodId }];
      }
    });
  };

  const handleClassChange = (classKey: string) => {
    setTargetClasses(prev =>
      prev.includes(classKey)
        ? prev.filter(c => c !== classKey)
        : [...prev, classKey]
    );
  };

  const toggleAllClasses = () => {
    if (targetClasses.length === availableClassOptions.length) {
      setTargetClasses([]);
    } else {
      setTargetClasses(availableClassOptions.map(([key]) => key));
    }
  };



  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSubmitting) return;

    if (!courseTitle || targetClasses.length === 0 || !subjectGroup) {
      Swal.fire({
        icon: 'warning',
        title: 'ข้อมูลไม่ครบถ้วน',
        text: 'กรุณากรอกข้อมูลที่จำเป็นให้ครบ (ชื่อหลักสูตร, กลุ่มสาระฯ, ชั้นเรียน)',
        background: '#2a2b2f',
        color: '#ffffff'
      });
      return;
    }

    if (lockedSlots.length > Math.ceil(hoursPerWeek)) {
      Swal.fire({
        icon: 'warning',
        title: 'จำนวนคาบที่ล็อคเกินกำหนด',
        text: `คุณล็อคคาบเรียนไว้ ${lockedSlots.length} คาบ แต่กำหนดจำนวนคาบต่อสัปดาห์ไว้เพียง ${hoursPerWeek} คาบ`,
        confirmButtonColor: '#4f46e5',
        background: '#2a2b2f',
        color: '#ffffff'
      });
      return;
    }

    const finalWeight = 100 - formativeWeight - midtermWeight;
    if (formativeWeight + midtermWeight + finalWeight !== 100) {
      Swal.fire({
        icon: 'warning',
        title: 'สัดส่วนคะแนนไม่ถูกต้อง',
        text: 'คะแนนเก็บ + กลางภาค + ปลายภาค ต้องรวมกันได้ 100%',
        background: '#2a2b2f', color: '#ffffff'
      });
      return;
    }
    setIsSubmitting(true);

    Swal.fire({
      title: "กำลังบันทึกข้อมูล...",
      text: "กรุณารอสักครู่",
      allowOutsideClick: false,
      background: "#2a2b2f",
      color: "#ffffff",
      didOpen: () => {
        Swal.showLoading();
      },
    });

    const schoolId = (currentUser as any)?.schoolId;

    if (!schoolId) {
      Swal.fire({ icon: "error", title: "เกิดข้อผิดพลาด", text: "ไม่พบรหัสโรงเรียน ไม่สามารถบันทึกข้อมูลได้", background: "#2a2b2f", color: "#ffffff" });
      setIsSubmitting(false);
      return;
    }

    try {
      const coursesCollectionRef = collection(db, 'school-settings', schoolId, 'courses');

      const courseData = {
        title: courseTitle,
        code: courseCode,
        subjectGroup: subjectGroup,
        type: courseType,
        formativeWeight,
        midtermWeight,
        classId: targetClasses,
        hoursPerWeek: Number(hoursPerWeek),
        constraints: {
          disallowedDays: disallowedDays,
          lockedSlots: lockedSlots,
        },
        indicators: courseType === "พื้นฐาน" ? indicators.split('\n').map(line => line.trim()).filter(line => line) : [],
        expectedOutcomes: courseType === "เพิ่มเติม" ? expectedOutcomes.split('\n').map(line => line.trim()).filter(line => line) : [],
        semester: semester, // เพิ่มฟิลด์ภาคเรียน
        isCombined: isCombined, // เรียนรวม
        isElective: isElective, // เพิ่มสถานะวิชาเลือกเสรี
        // New fields aligned with ImportCoursePage
        titleEn: titleEn,
        codeEn: codeEn,
        room: room ? [room] : ['all'], // Store as array to match import structure
        teacherId: teacherId || 'pending',
        teacherIds: [teacherId || 'pending'], // Added teacherIds array for alignment
        credits: String(credits), // Store as string if that matches import, or number? Import interface says string? checking... MappedCourse allows string. Let's keep it consistent.
        createdAt: new Date(),
      };
      await addDoc(coursesCollectionRef, courseData);
      Swal.fire({
        icon: "success",
        title: "บันทึกสำเร็จ!",
        text: "บันทึกข้อมูลหลักสูตรสำเร็จ!",
        background: "#2a2b2f",
        color: "#ffffff",
        timer: 2000,
        showConfirmButton: false,
      });

      // Reset form fields
      setCourseTitle("");
      setCourseCode("");
      setSubjectGroup("");
      setCourseType("พื้นฐาน");
      setFormativeWeight(0);
      setMidtermWeight(0);
      setIndicators("");
      setExpectedOutcomes("");
      setTargetClasses([]);
      // Reset new fields
      setCodeEn("");
      setTitleEn("");
      setRoom("");
      setTeacherId("");

      setTargetRooms([]);
      setHoursPerWeek(1);
      setDisallowedDays([]);
      setLockedSlots([]);
      setIsCombined(false);
      setIsElective(false);

    } catch (error) {
      console.error("Error adding document: ", error);
      Swal.fire({ icon: "error", title: "เกิดข้อผิดพลาด", text: "เกิดข้อผิดพลาดในการบันทึกข้อมูล", background: "#2a2b2f", color: "#ffffff" });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <MainLayout>
      <div className="px-3 sm:px-4 md:px-6 lg:px-8 py-4 sm:py-6 lg:py-8 min-h-screen bg-gray-50 dark:bg-gray-900 text-gray-900 dark:text-white transition-colors duration-300">
        <div className="max-w-7xl mx-auto w-full">
          {/* Header */}
          <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-8 gap-4">
            <div>
              <div className="flex items-center gap-4 mb-2">
                <BackButton to="/academic/hub/registration" />
                <span className="text-gray-500 dark:text-gray-400 font-medium">กลับไปหน้าบริหารงานวิชาการ</span>
              </div>
              <h1 className="text-3xl font-bold text-gray-900 dark:text-white flex items-center gap-3">
                <PlusCircle className="text-indigo-600 dark:text-indigo-400" size={32} />
                เพิ่มหลักสูตรใหม่
              </h1>
              <p className="text-gray-500 dark:text-gray-400 mt-1">กรอกข้อมูลเพื่อสร้างรายวิชาใหม่ในระบบการศึกษา</p>
            </div>
            <div className="flex gap-3">
              <Link
                to="/academic/import-courses"
                className="inline-flex items-center gap-2 px-4 py-2 bg-green-600 hover:bg-green-700 text-white font-medium rounded-xl transition-all duration-300 shadow-lg shadow-green-500/20 hover:shadow-green-500/40"
              >
                <FileText size={18} />
                นำเข้าจาก Excel
              </Link>
              <Link
                to="/academic/view-courses"
                className="inline-flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-medium rounded-xl transition-all duration-300 shadow-lg shadow-indigo-500/20 hover:shadow-indigo-500/40"
              >
                ดูหลักสูตรทั้งหมด
              </Link>
            </div>
          </div>

          <form onSubmit={handleSubmit}>
            <div className="grid grid-cols-1 lg:grid-cols-5 gap-8 items-stretch">
              {/* 1. Core Info Section (Left Top) */}
              <div className="lg:col-span-3">
                <div className="bg-white dark:bg-[#2a2b2f] p-6 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 h-full">
                  <h3 className="text-lg font-bold mb-6 flex items-center gap-2 text-gray-800 dark:text-gray-200"><BookOpen size={20} className="text-indigo-500" />ข้อมูลหลักสูตร</h3>
                  <div className="space-y-6">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      <div>
                        <label htmlFor="courseTitle" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">ชื่อหลักสูตร/รายวิชา</label>
                        <input type="text" id="courseTitle" value={courseTitle} onChange={(e) => setCourseTitle(e.target.value)} className="w-full bg-gray-50 dark:bg-[#1e1f21] border border-gray-200 dark:border-gray-600 rounded-xl px-4 py-2.5 focus:outline-none focus:ring-2 focus:ring-indigo-500" required />
                      </div>
                      <div>
                        <label htmlFor="courseCode" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">รหัสวิชา</label>
                        <input type="text" id="courseCode" value={courseCode} onChange={(e) => setCourseCode(e.target.value)} className="w-full bg-gray-50 dark:bg-[#1e1f21] border border-gray-200 dark:border-gray-600 rounded-xl px-4 py-2.5 focus:outline-none focus:ring-2 focus:ring-indigo-500" />
                      </div>
                    </div>

                    {/* English Fields */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      <div>
                        <label htmlFor="titleEn" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">ชื่อวิชา (ภาษาอังกฤษ)</label>
                        <input type="text" id="titleEn" value={titleEn} onChange={(e) => setTitleEn(e.target.value)} className="w-full bg-gray-50 dark:bg-[#1e1f21] border border-gray-200 dark:border-gray-600 rounded-xl px-4 py-2.5 focus:outline-none focus:ring-2 focus:ring-indigo-500" placeholder="Optional" />
                      </div>
                      <div>
                        <label htmlFor="codeEn" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">รหัสวิชา (ภาษาอังกฤษ)</label>
                        <input type="text" id="codeEn" value={codeEn} onChange={(e) => setCodeEn(e.target.value)} className="w-full bg-gray-50 dark:bg-[#1e1f21] border border-gray-200 dark:border-gray-600 rounded-xl px-4 py-2.5 focus:outline-none focus:ring-2 focus:ring-indigo-500" placeholder="Optional" />
                      </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      <div>
                        <label htmlFor="courseType" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">ประเภทวิชา</label>
                        <Select
                          id="courseType"
                          value={courseTypeOptions.find(opt => opt.value === courseType)}
                          onChange={(opt: any) => setCourseType(opt?.value || 'พื้นฐาน')}
                          options={courseTypeOptions}
                          styles={premiumStyles}
                          placeholder="เลือกประเภทวิชา..."
                        />
                      </div>
                      <div>
                        <label htmlFor="subjectGroup" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">กลุ่มสาระการเรียนรู้</label>
                        <Select
                          id="subjectGroup"
                          value={subjectGroupOptions.find(opt => opt.value === subjectGroup)}
                          onChange={(opt: any) => setSubjectGroup(opt?.value || '')}
                          options={subjectGroupOptions}
                          styles={premiumStyles}
                          placeholder="-- เลือกกลุ่มสาระฯ --"
                          required
                        />
                      </div>
                    </div>



                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      {/* ภาคเรียน */}
                      <div>
                        <label htmlFor="semester" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">📅 ภาคเรียน</label>
                        <select
                          id="semester"
                          value={semester}
                          onChange={(e) => setSemester(e.target.value)}
                          className="w-full bg-gray-50 dark:bg-[#1e1f21] border border-gray-200 dark:border-gray-600 rounded-xl px-4 py-2.5 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                          required
                        >
                          <option value="1">ภาคเรียนที่ 1</option>
                          <option value="2">ภาคเรียนที่ 2</option>
                        </select>
                      </div>

                      {/* ห้อง/หมู่เรียน */}
                      <div>
                        <label htmlFor="room" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">ห้อง / หมู่เรียน</label>
                        <input
                          type="text"
                          id="room"
                          value={room}
                          onChange={(e) => setRoom(e.target.value)}
                          className="w-full bg-gray-50 dark:bg-[#1e1f21] border border-gray-200 dark:border-gray-600 rounded-xl px-4 py-2.5 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                          placeholder="เช่น 1, 2, A, B (ใส่ 'all' หากเรียนทุกห้อง)"
                        />
                      </div>
                    </div>

                    {/* ครูผู้สอน */}
                    <div>
                      <label htmlFor="teacherId" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">👨‍🏫 ครูผู้สอน</label>
                      <Select
                        id="teacherId"
                        value={teacherOptions.find(opt => opt.value === teacherId)}
                        onChange={(opt: any) => setTeacherId(opt?.value || '')}
                        options={teacherOptions}
                        styles={premiumStyles}
                        placeholder="ค้นหาชื่อครู..."
                        isSearchable
                        isClearable
                      />
                    </div>

                    <div className="space-y-4">
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">สัดส่วนคะแนนรวม 100%</label>
                      <div className="grid grid-cols-3 gap-4">
                        <div>
                          <label htmlFor="formativeWeight" className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">คะแนนเก็บ (%)</label>
                          <input
                            type="number"
                            id="formativeWeight"
                            value={formativeWeight}
                            onChange={(e) => setFormativeWeight(Number(e.target.value))}
                            min="0"
                            max="100"
                            className="w-full bg-gray-50 dark:bg-[#1e1f21] border border-gray-200 dark:border-gray-600 rounded-xl px-4 py-2.5 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                          />
                        </div>
                        <div>
                          <label htmlFor="midtermWeight" className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">กลางภาค (%)</label>
                          <input
                            type="number"
                            id="midtermWeight"
                            value={midtermWeight}
                            onChange={(e) => setMidtermWeight(Number(e.target.value))}
                            min="0"
                            max="100"
                            className="w-full bg-gray-50 dark:bg-[#1e1f21] border border-gray-200 dark:border-gray-600 rounded-xl px-4 py-2.5 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                          />
                        </div>
                        <div>
                          <label htmlFor="finalWeight" className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">ปลายภาค (%)</label>
                          <input
                            type="number"
                            id="finalWeight"
                            value={100 - formativeWeight - midtermWeight}
                            readOnly
                            className="w-full bg-gray-50 dark:bg-[#1e1f21] border border-gray-200 dark:border-gray-600 rounded-xl px-4 py-2.5 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                          />
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* 2. Details Section (Right Top) */}
              <div className="lg:col-span-2">
                <div className="bg-white dark:bg-[#2a2b2f] p-6 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 h-full flex flex-col">
                  <h3 className="text-lg font-bold mb-6 flex items-center gap-2 text-gray-800 dark:text-gray-200">
                    {courseType === "พื้นฐาน" ? <ListChecks size={20} className="text-indigo-500" /> : <FileText size={20} className="text-indigo-500" />}
                    {courseType === "พื้นฐาน" ? "ตัวชี้วัด" : "ผลการเรียนรู้"}
                  </h3>
                  <div className="flex-1 flex flex-col">
                    {courseType === "พื้นฐาน" ? (
                      <div className="flex-1 flex flex-col">
                        <label htmlFor="indicators" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">ตัวชี้วัด (แต่ละข้อขึ้นบรรทัดใหม่)</label>
                        <NumberedTextarea id="indicators" value={indicators} onChange={(e) => setIndicators(e.target.value)} rows={8} containerClassName="flex-1 min-h-[250px]" className="h-full" />
                      </div>
                    ) : (
                      <div className="flex-1 flex flex-col">
                        <label htmlFor="expectedOutcomes" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">ผลการเรียนรู้ที่คาดหวัง (แต่ละข้อขึ้นบรรทัดใหม่)</label>
                        <NumberedTextarea id="expectedOutcomes" value={expectedOutcomes} onChange={(e) => setExpectedOutcomes(e.target.value)} rows={8} containerClassName="flex-1 min-h-[250px]" className="h-full" />
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* 3. Target Classes Section (Left Bottom) */}
              <div className="lg:col-span-3">
                <div className="bg-white dark:bg-[#2a2b2f] p-6 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 h-full">
                  <h3 className="text-lg font-bold mb-6 flex items-center gap-2 text-gray-800 dark:text-gray-200"><Users size={20} className="text-indigo-500" />กลุ่มเป้าหมาย</h3>
                  <div className="space-y-6">
                    <div className="flex flex-col sm:flex-row gap-6 mb-4">
                      <div className="flex items-center gap-2">
                        <label className="relative inline-flex items-center cursor-pointer">
                          <input type="checkbox" checked={isCombined} onChange={(e) => setIsCombined(e.target.checked)} className="sr-only peer" />
                          <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-indigo-300 dark:peer-focus:ring-indigo-800 rounded-full peer dark:bg-gray-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all dark:border-gray-600 peer-checked:bg-indigo-600"></div>
                          <span className="ml-3 text-sm font-medium text-gray-900 dark:text-gray-300">เรียนรวม</span>
                        </label>
                      </div>
                      <div className="flex items-center gap-2">
                        <label className="relative inline-flex items-center cursor-pointer">
                          <input type="checkbox" checked={isElective} onChange={(e) => {
                            const val = e.target.checked;
                            setIsElective(val);
                            if (val) {
                              setCourseType("เพิ่มเติม"); // วิชาเลือกมักเป็นวิชาเพิ่มเติม
                            }
                          }} className="sr-only peer" />
                          <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-rose-300 dark:peer-focus:ring-rose-800 rounded-full peer dark:bg-gray-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all dark:border-gray-600 peer-checked:bg-rose-600"></div>
                          <span className="ml-3 text-sm font-medium text-gray-900 dark:text-gray-300">วิชาเลือกเสรี (Elective Course)</span>
                        </label>
                      </div>
                    </div>



                    <div className="space-y-3">
                      <div className="flex justify-between items-center">
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                          ชั้นเรียนที่เปิดสอน (เลือกได้มากกว่า 1)
                        </label>
                        <button
                          type="button"
                          onClick={toggleAllClasses}
                          className="text-xs font-medium text-indigo-600 dark:text-indigo-400 hover:text-indigo-800 dark:hover:text-indigo-300 transition-colors bg-indigo-50 dark:bg-indigo-900/30 px-3 py-1 rounded-lg"
                        >
                          {targetClasses.length === availableClassOptions.length && availableClassOptions.length > 0 ? 'ยกเลิกทั้งหมด' : 'เลือกทั้งหมด'}
                        </button>
                      </div>
                      <div className="flex flex-wrap gap-2 p-4 bg-gray-50 dark:bg-[#1e1f21] border border-gray-200 dark:border-gray-600 rounded-xl max-h-60 overflow-y-auto custom-scrollbar">
                        {availableClassOptions.length > 0 ? (
                          availableClassOptions.map(([key, name]) => {
                            const isSelected = targetClasses.includes(key);
                            return (
                              <button
                                key={key}
                                type="button"
                                onClick={() => handleClassChange(key)}
                                className={`px-4 py-2 rounded-lg text-sm font-medium transition-all duration-200 border ${isSelected
                                  ? 'bg-indigo-600 text-white border-indigo-600 shadow-md transform scale-105'
                                  : 'bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 border-gray-200 dark:border-gray-700 hover:border-indigo-300 dark:hover:border-indigo-700 hover:bg-indigo-50 dark:hover:bg-indigo-900/20'
                                  }`}
                              >
                                {name}
                              </button>
                            );
                          })
                        ) : (
                          <p className="text-sm text-gray-500 w-full text-center py-2">ไม่พบข้อมูลชั้นเรียน</p>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
              {/* หน่วยกิตและจำนวนคาบ */}
              <div className="lg:col-span-2">
                <div className="bg-white dark:bg-[#2a2b2f] p-6 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 h-full flex flex-col">
                  <h3 className="text-lg font-bold mb-6 flex items-center gap-2 text-gray-800 dark:text-gray-200">
                    <Clock size={20} className="text-indigo-500" /> หน่วยกิตและเวลาเรียน
                  </h3>
                  <div className="space-y-4">
                    <div>
                      <label htmlFor="credits" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                        📚 หน่วยกิต
                      </label>
                      <select
                        id="credits"
                        value={credits}
                        onChange={(e) => {
                          const newCredits = Number(e.target.value);
                          setCredits(newCredits);
                          setHoursPerWeek(Math.round(newCredits * 2));
                        }}
                        className="w-full bg-gray-50 dark:bg-[#1e1f21] border border-gray-200 dark:border-gray-600 rounded-xl px-4 py-2.5 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                      >
                        {[0.5, 1.0, 1.5, 2.0, 2.5, 3.0, 3.5, 4.0].map((val) => (
                          <option key={val} value={val}>
                            {val} หน่วยกิต
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label htmlFor="hoursPerWeek" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                        ⏰ จำนวนคาบ/สัปดาห์
                      </label>
                      <input
                        type="number"
                        id="hoursPerWeek"
                        value={hoursPerWeek}
                        onChange={(e) => {
                          const newHours = Number(e.target.value);
                          setHoursPerWeek(newHours);
                          setCredits(newHours / 2);
                        }}
                        min="0.5"
                        step="0.5"
                        className="w-full bg-gray-50 dark:bg-[#1e1f21] border border-gray-200 dark:border-gray-600 rounded-xl px-4 py-2.5 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                      />
                    </div>
                  </div>
                </div>
              </div>

              {/* 4. Constraints Section */}
              <div className="lg:col-span-5">
                <div className="bg-white dark:bg-[#2a2b2f] p-6 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700">
                  <h3 className="text-lg font-bold mb-6 flex items-center gap-2 text-gray-800 dark:text-gray-200">
                    <CalendarX2 size={20} className="text-emerald-500" /> เงื่อนไขการจัดวันเรียน (ไม่บังคับ)
                  </h3>
                  <div className="space-y-6">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">วันที่ไม่สะดวกสอน (จะพยายามหลีกเลี่ยง)</label>
                      <div className="flex flex-nowrap gap-2 items-center table-responsive pb-1 hide-scrollbar">
                        {Object.entries(DAYS_OF_WEEK).map(([key, name]) => (
                          <button
                            type="button"
                            key={key}
                            onClick={() => handleDisallowedDaysChange(key)}
                            className={`px-4 py-2 rounded-full text-sm font-semibold border-2 transition-all duration-200 ${disallowedDays.includes(key)
                              ? 'bg-red-500 border-red-500 text-white'
                              : 'bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300'
                              }`}
                          >
                            {name}
                          </button>
                        ))}
                      </div>
                    </div>

                    <div>
                      <label className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-4 flex items-center gap-2">
                        ล็อคตำแหน่งคาบ (เลือกคาบที่ต้องสอนแน่นอน)
                        <span className="text-xs font-normal text-gray-500">(คลิกเพื่อล็อคคาบเฉพาะ)</span>
                      </label>
                      <div className="w-full overflow-x-auto border border-gray-200 dark:border-gray-700 rounded-xl shadow-sm hide-scrollbar">
                        <table className="w-full text-xs border-collapse" style={{ minWidth: 'max-content' }}>
                          <thead>
                            <tr className="bg-gray-50 dark:bg-gray-800/50">
                              <th className="p-2 md:p-3 border-b border-r dark:border-gray-700 sticky left-0 z-20 bg-gray-50 dark:bg-[#25262b] w-14 md:w-20 text-gray-500 font-medium">วัน</th>
                              {periodSettings.map((p) => (
                                <th key={p.id} className="p-1 md:p-2 border-b border-l dark:border-gray-700 text-gray-500 text-center min-w-[80px] md:min-w-[100px]">
                                  <div className="font-semibold text-indigo-600 dark:text-indigo-400 text-[10px] md:text-xs">{p.label}</div>
                                  <div className="text-[9px] font-normal opacity-70 hidden xs:block">{p.startTime}-{p.endTime}</div>
                                </th>
                              ))}
                            </tr>
                          </thead>
                          <tbody>
                            {Object.entries(DAYS_OF_WEEK).map(([dayKey, dayName]) => (
                              <tr key={dayKey} className="group hover:bg-gray-50/50 dark:hover:bg-gray-800/20 transition-colors">
                                <td className="p-2 md:p-3 border-b border-r dark:border-gray-700 font-bold text-center sticky left-0 z-10 bg-white dark:bg-[#25262b] text-gray-700 dark:text-gray-300 group-hover:bg-gray-50 dark:group-hover:bg-[#2a2b2f] text-[10px] md:text-xs">
                                  {dayName}
                                </td>
                                {periodSettings.map((p) => {
                                  const isSelected = lockedSlots.some(s => s.day === dayKey && s.periodId === p.id);
                                  const isTeaching = p.isTeaching || p.isTeachingPeriod;

                                  if (!isTeaching) {
                                    return (
                                      <td key={p.id} className="p-0 border-b border-l dark:border-gray-700 h-12 md:h-16 bg-gray-100/50 dark:bg-gray-800/30 text-gray-400 dark:text-gray-500 text-[10px] text-center align-middle cursor-not-allowed italic">
                                        -
                                      </td>
                                    );
                                  }

                                  return (
                                    <td key={p.id} className="p-0 border-b border-l dark:border-gray-700 h-12 md:h-16 group/cell">
                                      <button
                                        type="button"
                                        onClick={() => toggleLockedSlot(dayKey, p.id)}
                                        className={`w-full h-full transition-all duration-300 flex flex-col items-center justify-center gap-0.5 ${isSelected
                                          ? 'bg-emerald-600 dark:bg-emerald-500 text-white shadow-[inset_0_2px_4px_rgba(0,0,0,0.1)]'
                                          : 'bg-white dark:bg-[#1e1f21] hover:bg-emerald-50 dark:hover:bg-emerald-900/10'
                                          }`}
                                      >
                                        {isSelected ? (
                                          <>
                                            <Lock size={14} className="text-white drop-shadow-sm" />
                                            <span className="text-[7px] md:text-[8px] uppercase font-bold tracking-wider hidden xs:block">Locked</span>
                                          </>
                                        ) : (
                                          <div className="opacity-0 group-hover/cell:opacity-100 flex flex-col items-center gap-1 transition-all duration-200 transform scale-90 group-hover/cell:scale-100">
                                            <PlusCircle size={14} className="text-emerald-500/50" />
                                          </div>
                                        )}
                                      </button>
                                    </td>
                                  );
                                })}
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Submit Button */}
            <div className="mt-8 flex justify-end">
              <button
                type="submit"
                disabled={isSubmitting}
                className="w-full md:w-auto bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-3 px-12 rounded-2xl transition-all duration-300 disabled:bg-gray-500 flex items-center justify-center gap-2 shadow-lg shadow-indigo-500/30"
              >
                <Save size={20} />
                {isSubmitting ? "กำลังบันทึก..." : "บันทึกรายวิชา"}
              </button>
            </div>
          </form>
        </div>
      </div >
    </MainLayout >
  );
};

export default CourseManagementPage;
