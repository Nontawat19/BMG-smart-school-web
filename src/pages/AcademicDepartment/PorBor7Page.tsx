import React, { useState, useEffect, useCallback } from "react";
import { Link } from "react-router-dom";
import MainLayout from "@/layouts/MainLayout";
import BackButton from "@/components/Shared/BackButton";
import ProfileAvatar from "@/components/Shared/ProfileAvatar";
import { firestore, auth, storage } from "@/firebase";
import { collection, getDocs, query, orderBy, doc, getDoc, where } from "firebase/firestore";
import { getBlob, ref as storageRef } from "firebase/storage";
import { FaSearch, FaFilter, FaFileAlt, FaPrint } from "react-icons/fa";
import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, FileText } from "lucide-react";
import { getLevelsByRange } from "@/utils/schoolUtils";
import { usePermissions } from "@/hooks/usePermissions";
import { isCurrentStudent } from "@/utils/studentStatusUtils";
import { pdf } from "@react-pdf/renderer";
import { PorBor7Document, PorBor7GradeDocument } from "@/components/Pdf/porbor7";
import { getThaiYear } from "@/utils/dateUtils";
import { compressImage } from "@/utils/imageUtils";
import { useSelector } from "react-redux";
import { RootState } from "@/store";
import { CLASSES } from "@/utils/schoolUtils";
import Select from 'react-select';
import Swal from 'sweetalert2';

// Premium Dark mode styles for react-select (Same as other pages)
const compactSelectStyles = {
    control: (base: any, state: any) => ({
        ...base,
        backgroundColor: 'var(--select-bg, #ffffff)',
        borderColor: state.isFocused ? '#6366f1' : 'var(--select-border, #e5e7eb)',
        boxShadow: state.isFocused ? '0 0 0 2px rgba(99, 102, 241, 0.2)' : 'none',
        borderRadius: '0.75rem',
        padding: '2px 4px',
        fontSize: '14px',
        minHeight: '44px',
        '&:hover': {
            borderColor: '#6366f1'
        }
    }),
    menu: (base: any) => ({
        ...base,
        backgroundColor: 'var(--select-menu-bg, #ffffff)',
        borderRadius: '1rem',
        boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.1), 0 8px 10px -6px rgba(0, 0, 0, 0.1)',
        padding: '8px',
        border: '1px solid var(--select-border, #f3f4f6)',
        zIndex: 50
    }),
    option: (base: any, state: any) => ({
        ...base,
        backgroundColor: state.isSelected 
            ? '#6366f1' 
            : state.isFocused 
                ? 'rgba(99, 102, 241, 0.1)' 
                : 'transparent',
        color: state.isSelected ? '#ffffff' : 'var(--select-text, #1f2937)',
        borderRadius: '0.5rem',
        margin: '2px 0',
        cursor: 'pointer',
        fontSize: '14px',
        fontWeight: state.isSelected ? '700' : '500',
        '&:active': {
            backgroundColor: '#6366f1'
        }
    }),
    singleValue: (base: any) => ({ 
        ...base, 
        color: 'var(--select-text, #1f2937)', 
        fontWeight: '600',
        display: 'flex',
        alignItems: 'center',
        gap: '8px'
    }),
    menuList: (base: any) => ({
        ...base,
        maxHeight: '600px', // No scrollbar for configured levels
        padding: '4px'
    }),
    placeholder: (base: any) => ({ ...base, color: '#9ca3af' })
};
interface Student {
  id: string;
  profileImageUrl?: string;
  studentId: string;
  firstName: string;
  lastName: string;
  title: string;
  classLevel: string;
  room: string;
  schoolId: string;
  studentStatus: string;
  citizenId?: string;
  birthDate?: any;
  fatherFirstName?: string;
  fatherLastName?: string;
  fatherTitle?: string;
  motherFirstName?: string;
  motherLastName?: string;
  motherTitle?: string;
  classLevelKey?: string;
  profileImageDataUrl?: string;
}

const fileToDataUrl = (file: File): Promise<string> => (
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  })
);

const blobToDataUrl = (blob: Blob): Promise<string> => (
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  })
);

const loadStudentPhotoBlob = async (photoUrl: string): Promise<Blob> => {
  try {
    return await getBlob(storageRef(storage, photoUrl));
  } catch (storageError) {
    console.warn('Unable to load profile image via Firebase Storage SDK, falling back to fetch:', storageError);
    const response = await fetch(photoUrl);
    if (!response.ok) throw new Error(`Unable to fetch profile image: ${response.status}`);
    return response.blob();
  }
};

const inferImageMimeType = (photoUrl: string, blobType: string): 'image/jpeg' | 'image/png' | 'image/webp' | null => {
  if (blobType === 'image/jpeg' || blobType === 'image/png' || blobType === 'image/webp') {
    return blobType;
  }

  const decodedUrl = decodeURIComponent(photoUrl).toLowerCase();
  if (decodedUrl.includes('.png')) return 'image/png';
  if (decodedUrl.includes('.webp')) return 'image/webp';
  if (decodedUrl.includes('.jpg') || decodedUrl.includes('.jpeg')) return 'image/jpeg';

  return 'image/jpeg';
};

const prepareStudentPhotoForPdf = async (student: Student): Promise<Student> => {
  if (!student.profileImageUrl) return student;

  try {
    const loadedBlob = await loadStudentPhotoBlob(student.profileImageUrl);
    const imageMimeType = inferImageMimeType(student.profileImageUrl, loadedBlob.type);
    if (!imageMimeType) return student;

    const blob = loadedBlob.type === imageMimeType
      ? loadedBlob
      : new Blob([loadedBlob], { type: imageMimeType });

    if (imageMimeType === 'image/jpeg' || imageMimeType === 'image/png') {
      const profileImageDataUrl = await blobToDataUrl(blob);
      return { ...student, profileImageDataUrl };
    }

    const sourceFile = new File([blob], `${student.studentId || student.id}.jpg`, {
      type: imageMimeType,
    });
    const compressedPhoto = await compressImage(sourceFile, 480, 0.82, 'image/jpeg');
    const profileImageDataUrl = await fileToDataUrl(compressedPhoto);

    return { ...student, profileImageDataUrl };
  } catch (error) {
    console.warn('Unable to prepare student photo for PorBor7 PDF:', error);
    return student;
  }
};

const getAssessmentKey = (assessment: { id?: string; name?: string }) => assessment.id || assessment.name || '';

const calculateGradeFromTotal = (total: number): string => {
  if (total >= 80) return "4";
  if (total >= 75) return "3.5";
  if (total >= 70) return "3";
  if (total >= 65) return "2.5";
  if (total >= 60) return "2";
  if (total >= 55) return "1.5";
  if (total >= 50) return "1";
  return "0";
};

const getConfiguredFormativeTotal = (record: any, courseData: any) => {
  const assessments = courseData?.formativeAssessments || [];
  const details = record.formativeDetails || {};

  if (assessments.length === 0) {
    return Number(record.formative || 0);
  }

  return assessments.reduce((sum: number, assessment: any) => {
    const key = getAssessmentKey(assessment);
    return sum + Number(details[key] || 0);
  }, 0);
};

const getGradeBookResult = async (schoolId: string, courseId: string, student: Student, courseData: any) => {
  const gradeIds = Array.from(new Set([student.id, student.studentId].filter(Boolean) as string[]));
  const gradeRecords: any[] = [];

  for (const gradeId of gradeIds) {
    const gradeDoc = await getDoc(doc(firestore, 'school-settings', schoolId, 'courses', courseId, 'grades', gradeId));
    if (gradeDoc.exists()) {
      gradeRecords.push({ id: gradeDoc.id, ...gradeDoc.data() });
    }
  }

  if (gradeRecords.length === 0) return '-';

  const primaryRecord = gradeRecords.find(record => record.id === student.id);
  const bestRecord = primaryRecord || gradeRecords.reduce((best, current) => {
    const bestTotal = getConfiguredFormativeTotal(best, courseData) + Number(best.midterm || 0) + Number(best.final || 0);
    const currentTotal = getConfiguredFormativeTotal(current, courseData) + Number(current.midterm || 0) + Number(current.final || 0);
    return currentTotal > bestTotal ? current : best;
  }, gradeRecords[0]);

  if (bestRecord.status) return bestRecord.status;
  if (bestRecord.grade) return String(bestRecord.grade);

  const formative = getConfiguredFormativeTotal(bestRecord, courseData);
  const total = formative + Number(bestRecord.midterm || 0) + Number(bestRecord.final || 0);
  return calculateGradeFromTotal(total);
};

const PorBor7Page: React.FC = () => {
  const { ACADEMIC_MANAGEMENT } = usePermissions();
  const [students, setStudents] = useState<Student[]>([]);
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [isLoading, setIsLoading] = useState(true);
  const [schoolId, setSchoolId] = useState<string | null>(null);
  const [schoolInfo, setSchoolInfo] = useState<any>(null);
  const [selectedClassLevel, setSelectedClassLevel] = useState<string>('');
  const [selectedRoom, setSelectedRoom] = useState<string>('');
  const [availableLevels, setAvailableLevels] = useState<string[]>([]);
  const [isExporting, setIsExporting] = useState<string | null>(null);

  // Get school info from Redux
  const { availableClassOptions, classKeys, schoolName, schoolId: reduxSchoolId } = useSelector((state: RootState) => state.schoolSettings);

  // Pagination
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage] = useState(15);

  const fetchStudents = useCallback(async (currentSchoolId: string) => {
    setIsLoading(true);
    try {
      const studentsCollection = collection(firestore, "school-settings", currentSchoolId, "students");
      const q = query(studentsCollection, orderBy("studentId", "asc"));
      const querySnapshot = await getDocs(q);
      const studentsData = querySnapshot.docs.map(doc => {
        const data = doc.data() as Student;
        const levelKey = Object.keys(CLASSES).find(k => k === data.classLevel?.toLowerCase() || CLASSES[k as keyof typeof CLASSES] === data.classLevel);
        return {
          ...data,
          id: doc.id,
          classLevelKey: levelKey || data.classLevel
        } as Student;
      }).filter(s => {
        const isCurrent = isCurrentStudent(s);
        const isInRange = s.classLevelKey ? classKeys.includes(s.classLevelKey) : false;
        return isCurrent && isInRange;
      });
      setStudents(studentsData);
    } catch (err) {
      console.error("Error fetching students: ", err);
      Swal.fire({
        icon: 'error',
        title: 'เกิดข้อผิดพลาด',
        text: 'ไม่สามารถดึงข้อมูลนักเรียนได้',
        background: '#2a2b2f',
        color: '#ffffff'
      });
    } finally {
      setIsLoading(false);
    }
  }, [classKeys]);

  useEffect(() => {
    if (reduxSchoolId) {
      fetchStudents(reduxSchoolId);
      setAvailableLevels(availableClassOptions.map(([, label]) => label));
    }
  }, [reduxSchoolId, availableClassOptions, fetchStudents]);

  useEffect(() => {
    const fetchSchoolInfo = async () => {
      if (!reduxSchoolId) return;
      try {
        const schoolDoc = await getDoc(doc(firestore, "school-settings", reduxSchoolId));
        if (schoolDoc.exists()) {
          setSchoolInfo(schoolDoc.data());
          setSchoolId(reduxSchoolId);
        }
      } catch (error) {
        console.error("Error fetching school info:", error);
      }
    };
    fetchSchoolInfo();
  }, [reduxSchoolId]);

  const handleIssueCertificate = async (student: Student) => {
    const directorFullName = [schoolInfo?.directorPrefix, schoolInfo?.directorName].filter(Boolean).join(' ');
    const generalHeadFullName = [schoolInfo?.generalHeadPrefix, schoolInfo?.generalHeadName].filter(Boolean).join(' ');
    const defaultPrincipal = directorFullName || "นายศัตราวุธ ศรีชนะ";
    const defaultHead = generalHeadFullName || "นางรุ่งทิพย์ นามมีฤทธิ์";

    const result = await Swal.fire({
      title: 'ออกใบรับรอง (ปพ.7)',
      html: `
        <div class="text-left space-y-4">
          <p class="mb-4">ต้องการออกใบรับรองสถานภาพนักเรียนให้แก่ <b>${student.title}${student.firstName} ${student.lastName}</b> ใช่หรือไม่?</p>
          
          <div class="space-y-3">
            <div>
              <label class="block text-xs font-bold text-gray-500 uppercase mb-1">เลขที่หนังสือ (ถ้ามี)</label>
              <input id="refNo" type="text" class="w-full px-4 py-2.5 bg-gray-100 dark:bg-[#1e1f21] border border-gray-200 dark:border-white/10 rounded-xl outline-none focus:ring-2 focus:ring-indigo-500" placeholder="ตัวอย่าง: ว 123/2567">
            </div>
            
            <div>
              <label class="block text-xs font-bold text-gray-500 uppercase mb-1">ชื่อผู้อำนวยการ</label>
              <input id="principalName" type="text" class="w-full px-4 py-2.5 bg-gray-100 dark:bg-[#1e1f21] border border-gray-200 dark:border-white/10 rounded-xl outline-none focus:ring-2 focus:ring-indigo-500" value="${defaultPrincipal}">
            </div>
            
            <div>
              <label class="block text-xs font-bold text-gray-500 uppercase mb-1">ชื่อหัวหน้าฝ่ายงาน</label>
              <input id="headOfDeptName" type="text" class="w-full px-4 py-2.5 bg-gray-100 dark:bg-[#1e1f21] border border-gray-200 dark:border-white/10 rounded-xl outline-none focus:ring-2 focus:ring-indigo-500" value="${defaultHead}">
            </div>
          </div>
        </div>
      `,
      icon: 'info',
      showCancelButton: true,
      confirmButtonText: 'ยืนยัน',
      cancelButtonText: 'ยกเลิก',
      background: '#2a2b2f',
      color: '#ffffff',
      confirmButtonColor: '#4f46e5',
      preConfirm: () => {
        return {
          refNo: (document.getElementById('refNo') as HTMLInputElement).value,
          principalName: (document.getElementById('principalName') as HTMLInputElement).value,
          headOfDeptName: (document.getElementById('headOfDeptName') as HTMLInputElement).value
        };
      }
    });

    if (result.isConfirmed) {
      handleExportPdf(student, result.value);
    }
  };

  const handleIssueGradeCertificate = async (student: Student) => {
    const directorFullName = [schoolInfo?.directorPrefix, schoolInfo?.directorName].filter(Boolean).join(' ');
    const generalHeadFullName = [schoolInfo?.generalHeadPrefix, schoolInfo?.generalHeadName].filter(Boolean).join(' ');
    const defaultPrincipal = directorFullName || "นายศัตราวุธ ศรีชนะ";
    const defaultHead = generalHeadFullName || "นางรุ่งทิพย์ นามมีฤทธิ์";

    const result = await Swal.fire({
      title: 'ออกใบรับรองที่มีเกรด (ปพ.7)',
      html: `
        <div class="text-left space-y-4">
          <p class="mb-4">ต้องการออกใบรับรองที่มีเกรดให้แก่ <b>${student.title}${student.firstName} ${student.lastName}</b> ใช่หรือไม่?</p>
          
          <div class="space-y-3">
            <div class="grid grid-cols-2 gap-3">
              <div>
                <label class="block text-xs font-bold text-gray-500 uppercase mb-1">ปีการศึกษา</label>
                <input id="academicYear" type="text" class="w-full px-4 py-2.5 bg-gray-100 dark:bg-[#1e1f21] border border-gray-200 dark:border-white/10 rounded-xl outline-none focus:ring-2 focus:ring-indigo-500" value="${schoolInfo?.currentAcademicYear || getThaiYear(new Date())}">
              </div>
              <div>
                <label class="block text-xs font-bold text-gray-500 uppercase mb-1">ภาคเรียน</label>
                <select id="semester" class="w-full px-4 py-2.5 bg-gray-100 dark:bg-[#1e1f21] border border-gray-200 dark:border-white/10 rounded-xl outline-none focus:ring-2 focus:ring-indigo-500">
                  <option value="1">1</option>
                  <option value="2">2</option>
                </select>
              </div>
            </div>

            <div>
              <label class="block text-xs font-bold text-gray-500 uppercase mb-1">เลขที่หนังสือ (ถ้ามี)</label>
              <input id="refNo" type="text" class="w-full px-4 py-2.5 bg-gray-100 dark:bg-[#1e1f21] border border-gray-200 dark:border-white/10 rounded-xl outline-none focus:ring-2 focus:ring-indigo-500" placeholder="ตัวอย่าง: ว 123/2567">
            </div>
            
            <div>
              <label class="block text-xs font-bold text-gray-500 uppercase mb-1">ชื่อผู้อำนวยการ</label>
              <input id="principalName" type="text" class="w-full px-4 py-2.5 bg-gray-100 dark:bg-[#1e1f21] border border-gray-200 dark:border-white/10 rounded-xl outline-none focus:ring-2 focus:ring-indigo-500" value="${defaultPrincipal}">
            </div>
            
            <div>
              <label class="block text-xs font-bold text-gray-500 uppercase mb-1">ชื่อหัวหน้าฝ่ายงาน</label>
              <input id="headOfDeptName" type="text" class="w-full px-4 py-2.5 bg-gray-100 dark:bg-[#1e1f21] border border-gray-200 dark:border-white/10 rounded-xl outline-none focus:ring-2 focus:ring-indigo-500" value="${defaultHead}">
            </div>
          </div>
        </div>
      `,
      icon: 'info',
      showCancelButton: true,
      confirmButtonText: 'ยืนยัน',
      cancelButtonText: 'ยกเลิก',
      background: '#2a2b2f',
      color: '#ffffff',
      confirmButtonColor: '#4f46e5',
      preConfirm: () => {
        return {
          academicYear: (document.getElementById('academicYear') as HTMLInputElement).value,
          semester: (document.getElementById('semester') as HTMLSelectElement).value,
          refNo: (document.getElementById('refNo') as HTMLInputElement).value,
          principalName: (document.getElementById('principalName') as HTMLInputElement).value,
          headOfDeptName: (document.getElementById('headOfDeptName') as HTMLInputElement).value
        };
      }
    });

    if (result.isConfirmed) {
      handleExportGradePdf(student, result.value);
    }
  };

  const handleExportGradePdf = async (student: Student, config: any) => {
    if (!schoolId || !schoolInfo) {
      Swal.fire({
        icon: 'warning',
        title: 'ไม่พบข้อมูลโรงเรียน',
        text: 'กรุณาตรวจสอบการตั้งค่าข้อมูลโรงเรียนก่อนออกเอกสาร',
        background: '#2a2b2f',
        color: '#ffffff'
      });
      return;
    }

    setIsExporting(student.id);

    try {
      Swal.fire({
        title: 'กำลังเตรียมข้อมูลเกรด...',
        text: 'กรุณารอสักครู่',
        allowOutsideClick: false,
        background: '#2a2b2f',
        color: '#ffffff',
        didOpen: () => {
          Swal.showLoading();
        }
      });

      // 1. Fetch Enrollments
      const enrollmentsRef = collection(firestore, 'school-settings', schoolId, 'enrollments');
      const q = query(
        enrollmentsRef,
        where('studentId', '==', student.id)
      );
      const enrollSnap = await getDocs(q);
      
      const gradeItems: any[] = [];

      // 2. Fetch Grades for each enrollment
      for (const enrollDoc of enrollSnap.docs) {
        const enrollData = enrollDoc.data();
        const courseId = enrollData.courseId;
        let courseData: any = null;

        // Fetch course details for credits if not in enrollment
        let credits = enrollData.credits || 0;
        const courseDoc = courseId ? await getDoc(doc(firestore, 'school-settings', schoolId, 'courses', courseId)) : null;
        if (courseDoc?.exists()) {
          courseData = courseDoc.data();
          if (!credits) {
            credits = courseData.credits || 0;
          }
        }

        const gradeStr = courseId
          ? await getGradeBookResult(schoolId, courseId, student, courseData)
          : (enrollData.grade || enrollData.finalGrade || enrollData.status || '-');

        gradeItems.push({
          courseCode: enrollData.courseCode || courseData?.code || '',
          courseTitle: enrollData.courseTitle || courseData?.title || '',
          credit: Number(credits),
          grade: gradeStr,
          academicYear: enrollData.academicYear,
          semester: enrollData.semester,
          classLevel: enrollData.classLevel || enrollData.level || courseData?.classId || student.classLevel,
          subjectGroup: enrollData.subjectGroup || enrollData.learningArea || courseData?.subjectGroup || courseData?.learningArea || enrollData.groupName,
          type: enrollData.type || enrollData.courseType || courseData?.type || courseData?.courseType || '',
        });
      }

      // Sort by course code
      gradeItems.sort((a, b) => {
        const yearCompare = String(a.academicYear || '').localeCompare(String(b.academicYear || ''));
        if (yearCompare !== 0) return yearCompare;
        const semesterCompare = String(a.semester || '').localeCompare(String(b.semester || ''));
        if (semesterCompare !== 0) return semesterCompare;
        return String(a.courseCode || '').localeCompare(String(b.courseCode || ''));
      });

      const today = new Date();
      const issueDate = {
        day: today.getDate(),
        month: today.toLocaleDateString('th-TH', { month: 'long' }),
        year: getThaiYear(today),
      };

      const principalPosition = schoolInfo.principalPosition || "ผู้อำนวยการโรงเรียน";
      const headOfDeptPosition = schoolInfo.headOfDeptPosition || "หัวหน้าฝ่ายงานบริหารทั่วไป";
      const studentForPdf = await prepareStudentPhotoForPdf(student);

      const blob = await pdf(
        <PorBor7GradeDocument
          student={studentForPdf}
          schoolInfo={schoolInfo}
          academicYear={config.academicYear}
          semester={config.semester}
          grades={gradeItems}
          issueDate={issueDate}
          principalName={config.principalName}
          principalPosition={principalPosition}
          headOfDeptName={config.headOfDeptName}
          headOfDeptPosition={headOfDeptPosition}
          refNo={config.refNo}
        />
      ).toBlob();

      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `ใบรับรองเกรด_${student.firstName}_${student.lastName}.pdf`;
      link.click();
      URL.revokeObjectURL(url);

      Swal.close();
    } catch (error) {
      console.error("Error exporting grade PDF:", error);
      Swal.fire({
        icon: 'error',
        title: 'เกิดข้อผิดพลาด',
        text: 'ไม่สามารถสร้างใบรับรองได้ กรุณาลองใหม่อีกครั้ง',
        background: '#2a2b2f',
        color: '#ffffff'
      });
    } finally {
      setIsExporting(null);
    }
  };

  const handleExportPdf = async (student: Student, data: any) => {
    if (!schoolId || !schoolInfo) {
      Swal.fire({
        icon: 'warning',
        title: 'ไม่พบข้อมูลโรงเรียน',
        text: 'กรุณาตรวจสอบการตั้งค่าข้อมูลโรงเรียนก่อนออกเอกสาร',
        background: '#2a2b2f',
        color: '#ffffff'
      });
      return;
    }
    setIsExporting(student.id);

    try {
      const today = new Date();
      const issueDate = {
        day: today.getDate(),
        month: today.toLocaleDateString('th-TH', { month: 'long' }),
        year: getThaiYear(today),
      };

      const academicYear = schoolInfo.currentAcademicYear || getThaiYear(today).toString();
      const principalPosition = schoolInfo.principalPosition || "ผู้อำนวยการโรงเรียน";
      const headOfDeptPosition = schoolInfo.headOfDeptPosition || "หัวหน้าฝ่ายงานบริหารทั่วไป";
      const studentForPdf = await prepareStudentPhotoForPdf(student);

      const docToRender = (
        <PorBor7Document 
          student={studentForPdf} 
          schoolInfo={schoolInfo} 
          academicYear={academicYear} 
          issueDate={issueDate}
          principalName={data.principalName}
          principalPosition={principalPosition}
          headOfDeptName={data.headOfDeptName}
          headOfDeptPosition={headOfDeptPosition}
          refNo={data.refNo || undefined}
        />
      );

      const blob = await pdf(docToRender).toBlob();
      const url = URL.createObjectURL(blob);

      const link = document.createElement('a');
      link.href = url;
      link.download = `ปพ7_${student.firstName}_${student.lastName}.pdf`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);

      Swal.fire({
        icon: 'success',
        title: 'สำเร็จ',
        text: 'ออกใบรับรองเรียบร้อยแล้ว',
        timer: 2000,
        showConfirmButton: false,
        background: '#2a2b2f',
        color: '#ffffff'
      });
    } catch (error) {
      console.error("Failed to generate PDF:", error);
      Swal.fire({
        icon: 'error',
        title: 'เกิดข้อผิดพลาด',
        text: 'ไม่สามารถสร้างไฟล์ PDF ได้',
        background: '#2a2b2f',
        color: '#ffffff'
      });
    } finally {
      setIsExporting(null);
    }
  };

  const filteredStudents = students.filter(student =>
    `${student.title}${student.firstName} ${student.lastName}`.toLowerCase().includes(searchTerm.toLowerCase()) ||
    student.studentId.toLowerCase().includes(searchTerm.toLowerCase())
  ).filter(student => !selectedClassLevel || student.classLevelKey === selectedClassLevel)
   .filter(student => !selectedRoom || student.room === selectedRoom);

  const totalPages = Math.ceil(filteredStudents.length / itemsPerPage);
  const indexOfLastItem = currentPage * itemsPerPage;
  const indexOfFirstItem = indexOfLastItem - itemsPerPage;
  const currentStudents = filteredStudents.slice(indexOfFirstItem, indexOfLastItem);

  return (
    <MainLayout>
      <div className="min-h-screen bg-gray-50 dark:bg-[#1c1c24] text-gray-900 dark:text-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          {/* Header */}
          <div className="mb-8">
            <div className="flex items-center gap-4 mb-4">
              <BackButton to="/academic/hub/registration" />
              <div>
                <h1 className="text-3xl font-bold tracking-tight">ออกใบรับรองสถานภาพ (ปพ.7)</h1>
                <p className="text-gray-500 dark:text-gray-400 mt-1">
                  ค้นหารายชื่อนักเรียนเพื่อพิมพ์ใบรับรองการเป็นนักเรียนหรือใบรับรองผลการเรียน
                </p>
              </div>
            </div>

            {/* Filters */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4 bg-white dark:bg-[#2a2b2f] p-4 rounded-2xl shadow-sm border border-gray-100 dark:border-white/5">
              <div className="relative md:col-span-2">
                <FaSearch className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                <input
                  type="text"
                  placeholder="ค้นหาชื่อ หรือ รหัสนักเรียน..."
                  className="w-full pl-10 pr-4 py-2.5 bg-gray-50 dark:bg-[#1e1f21] border border-gray-200 dark:border-white/10 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none transition-all"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                />
              </div>
              <div className="w-full">
                <Select
                  options={[
                    { value: '', label: 'ทุกระดับชั้น' },
                    ...availableClassOptions.map(([key, label]) => ({ value: key, label: label }))
                  ]}
                  value={selectedClassLevel ? { value: selectedClassLevel, label: CLASSES[selectedClassLevel as keyof typeof CLASSES] || selectedClassLevel } : { value: '', label: 'ทุกระดับชั้น' }}
                  onChange={(option: any) => setSelectedClassLevel(option?.value || '')}
                  styles={compactSelectStyles}
                  placeholder="เลือกชั้น..."
                  isSearchable={false}
                />
              </div>
              <div className="w-full">
                <Select
                  options={[
                    { value: '', label: 'ทุกห้องเรียน' },
                    ...Array.from({ length: 15 }, (_, i) => ({ value: (i + 1).toString(), label: `ห้อง ${i + 1}` }))
                  ]}
                  value={selectedRoom ? { value: selectedRoom, label: `ห้อง ${selectedRoom}` } : { value: '', label: 'ทุกห้องเรียน' }}
                  onChange={(option: any) => setSelectedRoom(option?.value || '')}
                  styles={compactSelectStyles}
                  placeholder="เลือกห้อง..."
                  isSearchable={false}
                />
              </div>
            </div>
          </div>

          {/* Table */}
          <div className="bg-white dark:bg-[#2a2b2f] rounded-2xl shadow-xl border border-gray-100 dark:border-white/5 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead className="bg-gray-50 dark:bg-white/5">
                  <tr>
                    <th className="px-6 py-4 text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider w-16 text-center">ลำดับ</th>
                    <th className="px-6 py-4 text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">ชื่อ-นามสกุล</th>
                    <th className="px-6 py-4 text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">รหัสนักเรียน</th>
                    <th className="px-6 py-4 text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">ชั้น / ห้อง</th>
                    <th className="px-6 py-4 text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider text-right">ดำเนินการ</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 dark:divide-white/5">
                  {isLoading ? (
                    Array.from({ length: 5 }).map((_, i) => (
                      <tr key={i} className="animate-pulse">
                        <td className="px-6 py-4"><div className="h-4 bg-gray-200 dark:bg-white/10 rounded w-8 mx-auto"></div></td>
                        <td className="px-6 py-4"><div className="h-4 bg-gray-200 dark:bg-white/10 rounded w-48"></div></td>
                        <td className="px-6 py-4"><div className="h-4 bg-gray-200 dark:bg-white/10 rounded w-24"></div></td>
                        <td className="px-6 py-4"><div className="h-4 bg-gray-200 dark:bg-white/10 rounded w-16"></div></td>
                        <td className="px-6 py-4"><div className="h-8 bg-gray-200 dark:bg-white/10 rounded w-20 ml-auto"></div></td>
                      </tr>
                    ))
                  ) : currentStudents.length > 0 ? (
                    currentStudents.map((student, index) => (
                      <tr key={student.id} className="hover:bg-gray-50 dark:hover:bg-white/[0.02] transition-colors group">
                        <td className="px-6 py-4 text-sm text-gray-500 dark:text-gray-400 text-center font-medium">
                          {indexOfFirstItem + index + 1}
                        </td>
                        <td className="px-6 py-4">
                          <div className="flex items-center gap-3">
                            <ProfileAvatar
                              src={student.profileImageUrl || `https://ui-avatars.com/api/?name=${student.firstName}+${student.lastName}&background=random`}
                              alt=""
                              className="w-10 h-10 border border-gray-200 dark:border-white/10"
                            />
                            <div>
                              <div className="text-sm font-bold text-gray-900 dark:text-white">
                                {`${student.title}${student.firstName} ${student.lastName}`}
                              </div>
                              <div className="text-xs text-gray-500 dark:text-gray-400">
                                {student.studentStatus}
                              </div>
                            </div>
                          </div>
                        </td>
                        <td className="px-6 py-4 text-sm text-gray-600 dark:text-gray-300 font-mono">
                          {student.studentId}
                        </td>
                        <td className="px-6 py-4 text-sm text-gray-600 dark:text-gray-300">
                          {`${student.classLevel} / ${student.room}`}
                        </td>
                        <td className="px-6 py-4 text-right">
                          <div className="flex items-center justify-end gap-2">
                            <button
                              onClick={() => handleIssueCertificate(student)}
                              disabled={isExporting === student.id}
                              className="inline-flex items-center gap-2 px-4 py-2 bg-indigo-500 hover:bg-indigo-600 disabled:bg-gray-500 text-white rounded-xl transition-all font-medium shadow-lg shadow-indigo-500/20 active:scale-95 whitespace-nowrap text-sm"
                            >
                              {isExporting === student.id ? (
                                <div className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent" />
                              ) : (
                                <FaPrint size={14} />
                              )}
                              ออกใบรับรอง
                            </button>
                            <button
                              onClick={() => handleIssueGradeCertificate(student)}
                              disabled={isExporting === student.id}
                              className="inline-flex items-center gap-2 px-4 py-2 bg-emerald-500 hover:bg-emerald-600 disabled:bg-gray-500 text-white rounded-xl transition-all font-medium shadow-lg shadow-emerald-500/20 active:scale-95 whitespace-nowrap text-sm"
                            >
                              {isExporting === student.id ? (
                                <div className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent" />
                              ) : (
                                <FaFileAlt size={14} />
                              )}
                              ออกใบรับรอง (มีเกรด)
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={5} className="px-6 py-20 text-center">
                        <div className="flex flex-col items-center justify-center">
                          <div className="w-16 h-16 bg-gray-100 dark:bg-white/5 rounded-full flex items-center justify-center mb-4">
                            <FaFileAlt className="text-gray-400 text-2xl" />
                          </div>
                          <p className="text-gray-500 dark:text-gray-400 font-medium">ไม่พบข้อมูลนักเรียน</p>
                        </div>
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            {!isLoading && totalPages > 1 && (
              <div className="px-6 py-4 bg-gray-50 dark:bg-white/5 border-t border-gray-100 dark:border-white/5 flex items-center justify-between">
                <div className="text-xs text-gray-500 dark:text-gray-400 font-medium">
                  แสดง {indexOfFirstItem + 1} ถึง {Math.min(indexOfLastItem, filteredStudents.length)} จาก {filteredStudents.length} รายการ
                </div>
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => setCurrentPage(1)}
                    disabled={currentPage === 1}
                    className="p-2 rounded-lg hover:bg-white dark:hover:bg-white/10 disabled:opacity-30 transition-all"
                  >
                    <ChevronsLeft size={18} />
                  </button>
                  <button
                    onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                    disabled={currentPage === 1}
                    className="p-2 rounded-lg hover:bg-white dark:hover:bg-white/10 disabled:opacity-30 transition-all"
                  >
                    <ChevronLeft size={18} />
                  </button>
                  <div className="px-4 text-sm font-bold">
                    {currentPage} / {totalPages}
                  </div>
                  <button
                    onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                    disabled={currentPage === totalPages}
                    className="p-2 rounded-lg hover:bg-white dark:hover:bg-white/10 disabled:opacity-30 transition-all"
                  >
                    <ChevronRight size={18} />
                  </button>
                  <button
                    onClick={() => setCurrentPage(totalPages)}
                    disabled={currentPage === totalPages}
                    className="p-2 rounded-lg hover:bg-white dark:hover:bg-white/10 disabled:opacity-30 transition-all"
                  >
                    <ChevronsRight size={18} />
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

export default PorBor7Page;
