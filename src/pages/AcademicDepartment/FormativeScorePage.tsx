import React, { useState, useEffect, useMemo } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import MainLayout from "@/layouts/MainLayout";
import { useSelector } from 'react-redux';
import { RootState } from '@/store';
import { firestore as db } from '@/firebase';
import { collection, query, where, getDocs, doc, writeBatch, Timestamp, updateDoc, getDoc } from 'firebase/firestore';
import {
  BookOpen,
  Save,
  ChevronLeft,
  Search,
  Filter,
  Plus,
  Trash2,
  Calculator,
  AlertTriangle,
  ClipboardCheck,
  Info,
  CheckCircle2
} from 'lucide-react';
import Swal from 'sweetalert2';
import SkeletonLoader from "@/components/SkeletonLoader";
import { CLASSES, getLevelsByRange } from '@/utils/schoolUtils';

interface Student {
  id: string;
  firstName: string;
  lastName: string;
  studentNumber: string;
  title?: string;
}

interface AssessmentItem {
  id: string;
  name: string;
  maxScore: number;
  linkedIndicator?: string;
  term?: 'pre-midterm' | 'post-midterm';
}

interface Course {
  id: string;
  title: string;
  code: string;
  classId: string | string[];
  room?: string[];
  type?: 'พื้นฐาน' | 'เพิ่มเติม';
  formativeWeight?: number;
  midtermWeight?: number;
  formativeAssessments?: AssessmentItem[];
  indicators?: string[];
  expectedOutcomes?: string[];
}

interface GradeRecord {
  formative: number;
  formativeDetails?: Record<string, number>;
}


const FormativeScorePage: React.FC = () => {
  const [searchParams] = useSearchParams();
  const [selectedClass, setSelectedClass] = useState<string>(searchParams.get('classId') || '');
  const [selectedRoom, setSelectedRoom] = useState<string>('');
  const [selectedCourse, setSelectedCourse] = useState<string>(searchParams.get('courseId') || '');

  const [courses, setCourses] = useState<Course[]>([]);
  const [students, setStudents] = useState<Student[]>([]);
  const [assessments, setAssessments] = useState<AssessmentItem[]>([]);
  const [scores, setScores] = useState<Record<string, Record<string, number>>>({});
  const [loading, setLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [maxFormativeScore, setMaxFormativeScore] = useState(60);
  const [availableClassOptions, setAvailableClassOptions] = useState<[string, string][]>([]);

  const currentUser = useSelector((state: RootState) => state.auth.user);
  const schoolId = (currentUser as any)?.schoolId;

  // 1. Load Courses
  useEffect(() => {
    const fetchCourses = async () => {
      if (!schoolId) return;
      try {
        const coursesRef = collection(db, 'school-settings', schoolId, 'courses');
        const q = query(coursesRef);
        const snap = await getDocs(q);
        setCourses(snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as Course)));
      } catch (error) {
        console.error("Error fetching courses:", error);
      }
    };
    fetchCourses();
  }, [schoolId]);

  useEffect(() => {
    const fetchSchoolSettings = async () => {
      if (!schoolId) return;
      try {
        const schoolRef = doc(db, "school-settings", schoolId);
        const schoolSnap = await getDoc(schoolRef);
        if (schoolSnap.exists()) {
          const data = schoolSnap.data();
          const levels = getLevelsByRange(data.opportunityExpansionLevel);
          const filteredLevels: [string, string][] = Object.entries(CLASSES).filter(([key, val]) => levels.includes(val)) as [string, string][];

          setAvailableClassOptions(filteredLevels);
        } else {
          setAvailableClassOptions(Object.entries(CLASSES));
        }
      } catch (error) {
        console.error("Error fetching school settings:", error);
        setAvailableClassOptions(Object.entries(CLASSES));
      }
    };
    fetchSchoolSettings();
  }, [schoolId]);

  // 2. Load Course Data & Students
  useEffect(() => {
    const fetchData = async () => {
      if (!schoolId || !selectedCourse) {
        setStudents([]);
        setAssessments([]);
        setScores({});
        return;
      }
      setLoading(true);
      try {
        const course = courses.find(c => c.id === selectedCourse);
        if (course) {
          setAssessments(course.formativeAssessments || []);
          // Use new weights if available, otherwise fallback to old logic
          const formativeMax = course?.formativeWeight ?? 60; // Default to 60
          setMaxFormativeScore(formativeMax);
        }

        const studentsRef = collection(db, 'school-settings', schoolId, 'students');
        const className = CLASSES[selectedClass];
        if (className) {
          let q = query(studentsRef, where('classLevel', '==', className));
          if (selectedRoom) {
            q = query(studentsRef, where('classLevel', '==', className), where('room', '==', selectedRoom));
          }

          const snap = await getDocs(q);
          const studentList = snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as Student));
          studentList.sort((a, b) => parseInt(a.studentNumber) - parseInt(b.studentNumber));
          setStudents(studentList);
        }

        const gradesRef = collection(db, 'school-settings', schoolId, 'courses', selectedCourse, 'grades');
        const gradeSnap = await getDocs(gradesRef);
        const scoreMap: Record<string, Record<string, number>> = {};
        gradeSnap.forEach(doc => {
          const data = doc.data() as GradeRecord;
          if (data.formativeDetails) {
            scoreMap[doc.id] = data.formativeDetails;
          }
        });
        setScores(scoreMap);

      } catch (error) {
        console.error("Error fetching data:", error);
      } finally {
        setLoading(false);
      }
    };

    if (courses.length > 0) {
      fetchData();
    }
  }, [selectedCourse, selectedClass, selectedRoom, schoolId, courses]);

  const handleAddAssessment = async () => {
    const currentTotalMax = assessments.reduce((sum, a) => sum + a.maxScore, 0);
    const remainingPoints = maxFormativeScore - currentTotalMax;

    const course = courses.find(c => c.id === selectedCourse);
    const isAdditional = course?.type === 'เพิ่มเติม';
    const indicatorLabel = isAdditional ? 'ผลการเรียนรู้ที่คาดหวัง' : 'ตัวชี้วัด';
    const items = isAdditional ? course?.expectedOutcomes : course?.indicators;

    if (remainingPoints <= 0) {
      Swal.fire({
        icon: 'warning',
        title: 'คะแนนเต็มแล้ว',
        text: 'คะแนนรวมช่องย่อยครบตามจำนวนคะแนนเก็บเต็มแล้ว ไม่สามารถเพิ่มได้อีก',
        background: '#2a2b2f',
        color: '#ffffff'
      });
      return;
    }

    const { value: formValues } = await Swal.fire({
      title: '<div class="flex items-center gap-2 text-xl font-bold"><span class="p-2 bg-indigo-100 dark:bg-indigo-900/30 rounded-lg text-indigo-600"><svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 5v14M5 12h14"/></svg></span> เพิ่มช่องคะแนนเก็บ</div>',
      html: `
        <div class="text-left mt-4 space-y-4">
          <div class="p-4 bg-gray-50 dark:bg-gray-800/50 rounded-2xl border border-gray-100 dark:border-gray-700">
            <div class="flex justify-between items-center mb-2">
              <span class="text-sm text-gray-500 dark:text-gray-400">สัดส่วนคะแนนเก็บรวม:</span>
              <span class="font-bold text-gray-700 dark:text-gray-200">${maxFormativeScore} คะแนน</span>
            </div>
            <div class="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2 mb-4">
              <div class="bg-indigo-500 h-2 rounded-full transition-all" style="width: ${(currentTotalMax / maxFormativeScore) * 100}%"></div>
            </div>
            <div class="flex justify-between text-xs">
              <span class="text-indigo-600 dark:text-indigo-400 font-bold">ใช้ไปแล้ว: ${currentTotalMax}</span>
              <span class="text-emerald-600 dark:text-emerald-400 font-bold">เหลือพื้นที่: ${remainingPoints}</span>
            </div>
          </div>
          
          <div class="space-y-1">
            <label class="text-xs font-bold text-gray-400 uppercase ml-1">ชื่อรายการ / ชิ้นงาน</label>
            <input id="swal-input1" class="w-full px-4 py-3 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none transition-all" placeholder="เช่น สอบย่อยครั้งที่ 1, ใบงานที่ 2">
          </div>
          
          <div class="space-y-1">
            <label class="text-xs font-bold text-gray-400 uppercase ml-1">ช่วงเวลา</label>
            <div class="flex gap-4 mt-1">
              <label class="flex items-center gap-2 cursor-pointer">
                <input type="radio" name="term" value="pre-midterm" checked class="w-4 h-4 text-indigo-600 focus:ring-indigo-500 border-gray-300">
                <span class="text-sm text-gray-700 dark:text-gray-300">ก่อนกลางภาค</span>
              </label>
              <label class="flex items-center gap-2 cursor-pointer">
                <input type="radio" name="term" value="post-midterm" class="w-4 h-4 text-indigo-600 focus:ring-indigo-500 border-gray-300">
                <span class="text-sm text-gray-700 dark:text-gray-300">หลังกลางภาค</span>
              </label>
            </div>
          </div>
          
          <div class="space-y-1">
            <label class="text-xs font-bold text-gray-400 uppercase ml-1">อ้างอิง${indicatorLabel}</label>
            <select id="swal-input3" class="w-full px-4 py-3 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none transition-all text-sm">
              <option value="">-- ไม่ระบุ --</option>
              ${items?.map((item, idx) => `
                <option value="${item}">${idx + 1}. ${item.length > 60 ? item.substring(0, 60) + '...' : item}</option>
              `).join('') || ''}
            </select>
          </div>
          
          <div class="space-y-1">
            <label class="text-xs font-bold text-gray-400 uppercase ml-1">คะแนนเต็ม (สูงสุด ${remainingPoints})</label>
            <input id="swal-input2" type="number" class="w-full px-4 py-3 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none transition-all" placeholder="ระบุคะแนนเต็ม" min="1" max="${remainingPoints}">
          </div>
        </div>
      `,
      background: document.documentElement.classList.contains('dark') ? '#2a2b2f' : '#ffffff',
      color: document.documentElement.classList.contains('dark') ? '#ffffff' : '#1f2937',
      showCancelButton: true,
      confirmButtonText: 'บันทึกรายการ',
      cancelButtonText: 'ยกเลิก',
      confirmButtonColor: '#4f46e5',
      focusConfirm: false,
      preConfirm: () => {
        const name = (document.getElementById('swal-input1') as HTMLInputElement).value;
        const scoreStr = (document.getElementById('swal-input2') as HTMLInputElement).value;
        const indicator = (document.getElementById('swal-input3') as HTMLSelectElement).value;
        const term = (document.querySelector('input[name="term"]:checked') as HTMLInputElement)?.value;
        const score = parseInt(scoreStr);

        if (!name) {
          Swal.showValidationMessage('กรุณาระบุชื่อรายการ');
          return false;
        }
        if (!scoreStr || isNaN(score) || score <= 0) {
          Swal.showValidationMessage('กรุณาระบุคะแนนเต็มที่มากกว่า 0');
          return false;
        }
        if (score > remainingPoints) {
          Swal.showValidationMessage(`คะแนนต้องไม่เกินพื้นที่ที่เหลือ (${remainingPoints})`);
          return false;
        }
        return [name, scoreStr, indicator, term];
      }
    });

    if (formValues) {
      const [name, maxScoreStr, linkedIndicator, term] = formValues;
      const newMaxScore = parseInt(maxScoreStr);

      const newAssessment: AssessmentItem = {
        id: Date.now().toString(),
        name,
        maxScore: newMaxScore,
        linkedIndicator,
        term: term as 'pre-midterm' | 'post-midterm'
      };

      const updatedAssessments = [...assessments, newAssessment];
      setAssessments(updatedAssessments);

      // บันทึกโครงสร้างช่องคะแนนลง Firestore ทันที
      if (selectedCourse && schoolId) {
        try {
          const courseRef = doc(db, 'school-settings', schoolId, 'courses', selectedCourse);
          await updateDoc(courseRef, { formativeAssessments: updatedAssessments });
          Swal.fire({
            icon: 'success',
            title: 'เพิ่มช่องคะแนนและบันทึกสำเร็จ',
            timer: 1500,
            showConfirmButton: false,
            toast: true,
            position: 'top-end'
          });
        } catch (error) {
          console.error("Error auto-saving assessment:", error);
          Swal.fire('เกิดข้อผิดพลาด', 'ไม่สามารถบันทึกข้อมูลได้', 'error');
        }
      }
    }
  };

  const handleRemoveAssessment = async (id: string) => {
    Swal.fire({
      title: 'ยืนยันการลบ',
      text: "คะแนนในช่องนี้จะหายไปทั้งหมด",
      icon: 'warning',
      showCancelButton: true,
      confirmButtonColor: '#d33',
      confirmButtonText: 'ลบ',
      cancelButtonText: 'ยกเลิก'
    }).then(async (result) => {
      if (result.isConfirmed) {
        const updatedAssessments = assessments.filter(a => a.id !== id);
        setAssessments(updatedAssessments);
        setScores(prev => {
          const newScores = { ...prev };
          Object.keys(newScores).forEach(studentId => {
            if (newScores[studentId][id]) delete newScores[studentId][id];
          });
          return newScores;
        });

        // บันทึกการเปลี่ยนแปลงลง Firestore ทันที
        if (selectedCourse && schoolId) {
          try {
            const courseRef = doc(db, 'school-settings', schoolId, 'courses', selectedCourse);
            await updateDoc(courseRef, { formativeAssessments: updatedAssessments });
            Swal.fire({
              icon: 'success',
              title: 'ลบช่องคะแนนและบันทึกสำเร็จ',
              timer: 1500,
              showConfirmButton: false,
              toast: true,
              position: 'top-end'
            });
          } catch (error) {
            console.error("Error auto-saving after removal:", error);
          }
        }
      }
    });
  };

  const handleScoreChange = (studentId: string, assessmentId: string, value: string) => {
    const numValue = Math.max(0, parseFloat(value) || 0);
    const assessment = assessments.find(a => a.id === assessmentId);

    if (assessment && numValue > assessment.maxScore) return;

    setScores(prev => ({
      ...prev,
      [studentId]: {
        ...(prev[studentId] || {}),
        [assessmentId]: numValue
      }
    }));
  };

  const handleSave = async () => {
    if (!selectedCourse || !schoolId) return;
    setIsSaving(true);
    try {
      const batch = writeBatch(db);

      const courseRef = doc(db, 'school-settings', schoolId, 'courses', selectedCourse);
      batch.update(courseRef, { formativeAssessments: assessments });

      students.forEach(student => {
        const studentScores = scores[student.id] || {};

        let totalFormative = 0;
        assessments.forEach(a => {
          totalFormative += (studentScores[a.id] || 0);
        });

        totalFormative = Math.min(totalFormative, maxFormativeScore);

        const gradeRef = doc(db, 'school-settings', schoolId, 'courses', selectedCourse, 'grades', student.id);

        batch.set(gradeRef, {
          formative: totalFormative,
          formativeDetails: studentScores,
          updatedAt: Timestamp.now(),
        }, { merge: true });
      });

      await batch.commit();
      Swal.fire({ icon: 'success', title: 'บันทึกข้อมูลสำเร็จ', text: 'คะแนนถูกส่งไปยังทะเบียนวัดผลแล้ว', timer: 1500, showConfirmButton: false });
    } catch (error) {
      console.error("Error saving:", error);
      Swal.fire('เกิดข้อผิดพลาด', 'ไม่สามารถบันทึกข้อมูลได้', 'error');
    } finally {
      setIsSaving(false);
    }
  };

  const filteredStudents = students.filter(s =>
    `${s.firstName} ${s.lastName}`.toLowerCase().includes(searchTerm.toLowerCase()) ||
    s.studentNumber.includes(searchTerm)
  );

  const filteredCourses = useMemo(() => {
    return courses.filter((c: Course) => {
      // ตรวจสอบชั้นเรียน (รองรับทั้งแบบ string และ array)
      const matchClass = !selectedClass || (
        Array.isArray(c.classId)
          ? c.classId.includes(selectedClass)
          : c.classId === selectedClass
      );

      // ตรวจสอบห้องเรียน (รองรับ 'all' หรือห้องที่ระบุเจาะจง)
      const matchRoom = !selectedRoom || !c.room || (
        Array.isArray(c.room)
          ? (c.room.includes(selectedRoom) || c.room.includes('all'))
          : true
      );

      return matchClass && matchRoom;
    });
  }, [courses, selectedClass, selectedRoom]);

  const totalAssessmentScore = assessments.reduce((sum, a) => sum + a.maxScore, 0);

  // Group assessments by term
  const preMidtermAssessments = assessments.filter(a => a.term === 'pre-midterm' || !a.term);
  const postMidtermAssessments = assessments.filter(a => a.term === 'post-midterm');

  return (
    <MainLayout>
      <div className="p-4 sm:p-8 text-gray-900 dark:text-white transition-colors duration-300">
        <div className="max-w-7xl mx-auto">
          <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-8 gap-4">
            <div>
              <Link to={`/academic/grade-book?classId=${selectedClass}&courseId=${selectedCourse}`} className="inline-flex items-center text-indigo-600 dark:text-indigo-400 hover:underline mb-2">
                <ChevronLeft size={18} /> กลับหน้าทะเบียนวัดผล
              </Link>
              <h1 className="text-3xl font-bold flex items-center gap-3">
                <ClipboardCheck className="text-indigo-600" size={36} />
                บันทึกคะแนนเก็บ
              </h1>
              <p className="text-gray-500 dark:text-gray-400">จัดการคะแนนย่อยรายจุดประสงค์/ชิ้นงาน</p>
            </div>

            <div className="flex gap-3">
              <button
                onClick={handleSave}
                disabled={isSaving || !selectedCourse}
                className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white px-6 py-2.5 rounded-xl font-semibold transition-all shadow-lg shadow-indigo-200 dark:shadow-none disabled:opacity-50"
              >
                {isSaving ? "กำลังบันทึก..." : <><Save size={18} /> บันทึกคะแนน</>}
              </button>
            </div>

          </div>

          <div className="grid grid-cols-1 md:grid-cols-5 gap-4 mb-6 bg-white dark:bg-[#2a2b2f] p-6 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700">
            <div>
              <label className="block text-sm font-semibold text-gray-500 mb-2 uppercase tracking-wider">ชั้นเรียน</label>
              <div className="relative">
                <Filter className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
                <select
                  value={selectedClass}
                  onChange={(e) => { setSelectedClass(e.target.value); setSelectedCourse(''); }}
                  className="w-full pl-10 pr-4 py-2.5 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-600 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none transition-all"
                >
                  <option value="">-- เลือกชั้นเรียน --</option>
                  {availableClassOptions.map(([id, name]) => <option key={id} value={id}>{name}</option>)}
                </select>
              </div>
            </div>

            <div>
              <label className="block text-sm font-semibold text-gray-500 mb-2 uppercase tracking-wider">ห้อง</label>
              <div className="relative">
                <select
                  value={selectedRoom}
                  onChange={(e) => setSelectedRoom(e.target.value)}
                  className="w-full px-4 py-2.5 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-600 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none transition-all"
                >
                  <option value="">ทุกห้อง</option>
                  {Array.from({ length: 20 }, (_, i) => i + 1).map(r => <option key={r} value={r}>{r}</option>)}
                </select>
              </div>
            </div>

            <div>
              <label className="block text-sm font-semibold text-gray-500 mb-2 uppercase tracking-wider">รายวิชา</label>
              <div className="relative">
                <BookOpen className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
                <select
                  value={selectedCourse}
                  onChange={(e) => setSelectedCourse(e.target.value)}
                  disabled={!selectedClass}
                  className="w-full pl-10 pr-4 py-2.5 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-600 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none transition-all disabled:opacity-50"
                >
                  <option value="">-- เลือกวิชา --</option>
                  {filteredCourses.map(c => <option key={c.id} value={c.id}>{c.code} {c.title}</option>)}
                </select>
              </div>
            </div>

            <div className="md:col-span-2">
              <label className="block text-sm font-semibold text-gray-500 mb-2 uppercase tracking-wider">ค้นหานักเรียน</label>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
                <input
                  type="text"
                  placeholder="ค้นหาชื่อ หรือ เลขประจำตัว..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full pl-10 pr-4 py-2.5 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-600 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none transition-all"
                />
              </div>
            </div>
          </div>

          <div className="bg-white dark:bg-[#2a2b2f] rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 overflow-hidden">
            {!selectedCourse ? (
              <div className="p-20 text-center">
                <div className="w-20 h-20 bg-teal-50 dark:bg-teal-900/20 rounded-full flex items-center justify-center mx-auto mb-4">
                  <ClipboardCheck className="text-indigo-600" size={32} />
                </div>
                <h3 className="text-xl font-bold text-gray-400">กรุณาเลือกชั้นเรียนและรายวิชาเพื่อเริ่มบันทึกคะแนน</h3>
              </div>
            ) : loading ? (
              <div className="p-8 space-y-4">
                {[...Array(5)].map((_, i) => <SkeletonLoader key={i} height="50px" />)}
              </div>
            ) : (
              <>
                <div className="p-5 border-b border-gray-100 dark:border-gray-700 bg-gray-50/30 dark:bg-gray-800/30 flex flex-wrap items-center justify-between gap-4">
                  <div className="flex items-center gap-4">
                    <h3 className="font-bold text-gray-700 dark:text-gray-200 flex items-center gap-2">
                      <Calculator size={18} className="text-indigo-500" /> รายการคะแนนเก็บ:
                    </h3>
                    <button onClick={handleAddAssessment} className="flex items-center gap-2 text-sm bg-indigo-600 hover:bg-indigo-700 text-white px-5 py-2.5 rounded-2xl transition-all shadow-lg shadow-indigo-200 dark:shadow-none font-bold">
                      <Plus size={18} /> เพิ่มช่องคะแนนใหม่
                    </button>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className={`flex items-center gap-3 px-4 py-2 rounded-2xl border ${totalAssessmentScore > maxFormativeScore ? 'bg-red-50 border-red-100 dark:bg-red-900/10 dark:border-red-800' : 'bg-emerald-50 border-emerald-100 dark:bg-emerald-900/10 dark:border-emerald-800'}`}>
                      <div className="flex flex-col">
                        <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">คะแนนรวมช่องย่อย</span>
                        <div className="flex items-center gap-1">
                          <span className={`text-lg font-black ${totalAssessmentScore > maxFormativeScore ? 'text-red-600' : 'text-emerald-600'}`}>{totalAssessmentScore}</span>
                          <span className="text-gray-400 font-bold">/ {maxFormativeScore}</span>
                        </div>
                      </div>
                      {totalAssessmentScore > maxFormativeScore ? <AlertTriangle className="text-red-500" size={20} /> : <CheckCircle2 className="text-emerald-500" size={20} />}
                    </div>
                  </div>
                </div>

                <div className="table-responsive">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="bg-gray-50 dark:bg-gray-800/50 border-b border-gray-100 dark:border-gray-700">
                        <th rowSpan={2} className="px-2 py-4 font-bold text-sm text-gray-600 dark:text-gray-300 w-14 sticky left-0 bg-gray-50 dark:bg-gray-800 z-10 text-center">เลขที่</th>
                        <th rowSpan={2} className="px-6 py-4 font-bold text-sm text-gray-600 dark:text-gray-300 min-w-[200px] sticky left-14 bg-gray-50 dark:bg-gray-800 z-10">ชื่อ-นามสกุล</th>

                        {preMidtermAssessments.length > 0 && (
                          <th colSpan={preMidtermAssessments.length} className="px-2 py-2 font-bold text-xs text-center text-blue-600 dark:text-blue-400 bg-blue-50/30 dark:bg-blue-900/10 border-b border-blue-100 dark:border-blue-800">
                            ก่อนกลางภาค
                          </th>
                        )}

                        {postMidtermAssessments.length > 0 && (
                          <th colSpan={postMidtermAssessments.length} className="px-2 py-2 font-bold text-xs text-center text-purple-600 dark:text-purple-400 bg-purple-50/30 dark:bg-purple-900/10 border-b border-purple-100 dark:border-purple-800">
                            หลังกลางภาค
                          </th>
                        )}

                        <th rowSpan={2} className="px-4 py-4 font-bold text-sm text-center text-indigo-600 dark:text-indigo-400 bg-indigo-50/30 dark:bg-indigo-900/10 sticky right-0 z-10">รวม ({maxFormativeScore})</th>
                      </tr>
                      <tr className="bg-gray-50 dark:bg-gray-800/50 border-b border-gray-100 dark:border-gray-700">
                        {preMidtermAssessments.map((assessment) => (
                          <th key={assessment.id} className="px-2 py-4 font-bold text-sm text-center text-gray-600 dark:text-gray-300 min-w-[100px] group relative bg-blue-50/10 dark:bg-blue-900/5">
                            <div className="flex flex-col items-center gap-1">
                              <span className="truncate max-w-[140px] leading-tight text-indigo-600 dark:text-indigo-400">{assessment.name}</span>
                              <div className="flex items-center justify-center gap-1.5">
                                <span className="text-xs text-gray-400 font-normal">({assessment.maxScore})</span>
                                {assessment.linkedIndicator && (
                                  <div className="flex items-center justify-center w-5 h-5 text-amber-500 bg-amber-50 dark:bg-amber-900/20 rounded-full border border-amber-100 dark:border-amber-800 cursor-help transition-all hover:bg-amber-100 dark:hover:bg-amber-900/40" title={assessment.linkedIndicator}>
                                    <span className="text-[10px] font-black">!</span>
                                  </div>
                                )}
                              </div>
                              <button
                                onClick={() => handleRemoveAssessment(assessment.id)}
                                className="absolute -top-1 -right-1 p-1 text-gray-300 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity"
                              >
                                <Trash2 size={14} />
                              </button>
                            </div>
                          </th>
                        ))}
                        {postMidtermAssessments.map((assessment) => (
                          <th key={assessment.id} className="px-2 py-4 font-bold text-sm text-center text-gray-600 dark:text-gray-300 min-w-[100px] group relative bg-purple-50/10 dark:bg-purple-900/5">
                            <div className="flex flex-col items-center gap-1">
                              <span className="truncate max-w-[140px] leading-tight text-indigo-600 dark:text-indigo-400">{assessment.name}</span>
                              <div className="flex items-center justify-center gap-1.5">
                                <span className="text-xs text-gray-400 font-normal">({assessment.maxScore})</span>
                                {assessment.linkedIndicator && (
                                  <div className="flex items-center justify-center w-5 h-5 text-amber-500 bg-amber-50 dark:bg-amber-900/20 rounded-full border border-amber-100 dark:border-amber-800 cursor-help transition-all hover:bg-amber-100 dark:hover:bg-amber-900/40" title={assessment.linkedIndicator}>
                                    <span className="text-[10px] font-black">!</span>
                                  </div>
                                )}
                              </div>
                              <button
                                onClick={() => handleRemoveAssessment(assessment.id)}
                                className="absolute -top-1 -right-1 p-1 text-gray-300 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity"
                              >
                                <Trash2 size={14} />
                              </button>
                            </div>
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
                      {filteredStudents.map((student) => {
                        const studentScores = scores[student.id] || {};
                        const total = assessments.reduce((sum, a) => sum + (studentScores[a.id] || 0), 0);
                        const cappedTotal = Math.min(total, maxFormativeScore);

                        return (
                          <tr key={student.id} className="hover:bg-gray-50 dark:hover:bg-white/5 transition-colors group">
                            <td className="px-2 py-4 font-mono text-gray-500 sticky left-0 bg-white dark:bg-[#2a2b2f] group-hover:bg-gray-50 dark:group-hover:bg-white/5 text-center w-14 min-w-[3.5rem]">{student.studentNumber}</td>
                            <td className="px-6 py-4 sticky left-14 bg-white dark:bg-[#2a2b2f] group-hover:bg-gray-50 dark:group-hover:bg-white/5">
                              <div className="font-semibold text-gray-900 dark:text-white whitespace-nowrap">
                                {student.title}{student.firstName} {student.lastName}
                              </div>
                            </td>
                            {preMidtermAssessments.map((assessment) => (
                              <td key={assessment.id} className="px-2 py-4 text-center bg-blue-50/5 dark:bg-blue-900/5">
                                <input
                                  type="number"
                                  value={studentScores[assessment.id] ?? ''}
                                  onChange={(e) => handleScoreChange(student.id, assessment.id, e.target.value)}
                                  className="w-16 text-center py-1.5 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none font-bold transition-all"
                                  placeholder="0"
                                />
                              </td>
                            ))}
                            {postMidtermAssessments.map((assessment) => (
                              <td key={assessment.id} className="px-2 py-4 text-center bg-purple-50/5 dark:bg-purple-900/5">
                                <input
                                  type="number"
                                  value={studentScores[assessment.id] ?? ''}
                                  onChange={(e) => handleScoreChange(student.id, assessment.id, e.target.value)}
                                  className="w-16 text-center py-1.5 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none font-bold transition-all"
                                  placeholder="0"
                                />
                              </td>
                            ))}
                            <td className="px-4 py-4 text-center sticky right-0 bg-indigo-50/10 dark:bg-indigo-900/5 backdrop-blur-sm">
                              <span className={`text-lg font-black ${total > maxFormativeScore ? 'text-red-500' : 'text-indigo-600'}`}>
                                {cappedTotal}
                              </span>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                  {assessments.length === 0 && (
                    <div className="p-10 text-center text-gray-400">
                      ยังไม่มีช่องคะแนน คลิก "เพิ่มช่องคะแนน" เพื่อเริ่มบันทึก
                    </div>
                  )}
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </MainLayout>
  );
};

export default FormativeScorePage;