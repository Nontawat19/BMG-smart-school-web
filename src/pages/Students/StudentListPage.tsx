import React, { useState, useEffect, useCallback } from "react";
import { Link, useParams } from "react-router-dom";
import MainLayout from "@/layouts/MainLayout";
import BackButton from "@/components/Shared/BackButton";
import { firestore, storage, auth } from "@/firebase";
import { collection, getDocs, query, orderBy, Timestamp, doc, deleteDoc, getDoc, updateDoc, where } from "firebase/firestore";
import { ref, deleteObject } from "firebase/storage";
import { FaPlus, FaUserEdit, FaTrashAlt, FaSearch, FaUserPlus, FaFileImport, FaIdCard, FaCheck, FaTimes, FaFileExcel, FaFilter, FaEye, FaEyeSlash } from "react-icons/fa";
import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from "lucide-react";
import Swal from 'sweetalert2';
import { getLevelsByRange } from "@/utils/schoolUtils";
import CanAccess from "@/components/AccessControl/CanAccess";
import { usePermissions } from "@/hooks/usePermissions";

// กำหนด Type สำหรับข้อมูลนักเรียน
interface Student {
  id: string;
  profileImageUrl?: string;
  studentId: string;
  title: string;
  firstName: string;
  lastName: string;
  classLevel: string;
  room: string;
  schoolId: string; // เพิ่ม schoolId
  studentStatus: "เรียนอยู่" | "พักการเรียน" | "ย้าย" | "ลาออก";
  contact?: string;
  phoneNumber?: string;
  lineId?: string;
  createdAt: Timestamp;
  behaviorScore?: number;
  rfid?: string;
  role?: string[];
}

const statusColorMap: { [key: string]: string } = {
  "เรียนอยู่": "bg-green-500/20 text-green-400 border-green-500/30",
  "พักการเรียน": "bg-yellow-500/20 text-yellow-400 border-yellow-500/30",
  "ย้าย": "bg-blue-500/20 text-blue-400 border-blue-500/30",
  "ลาออก": "bg-red-500/20 text-red-400 border-red-500/30",
};

// --- Skeleton Loader Component ---
const SkeletonLoader = () => (
  <div className="table-responsive animate-pulse">
    <table className="min-w-full divide-y divide-gray-700">
      <thead className="bg-gray-100 dark:bg-[#2a2b2f]">
        <tr>
          <th scope="col" className="py-3.5 pl-4 pr-3 text-left text-sm font-semibold text-gray-600 dark:text-gray-300 sm:pl-6 w-16">ลำดับ</th>
          <th scope="col" className="py-3.5 pr-3 text-left text-sm font-semibold text-gray-600 dark:text-gray-300">ชื่อ-สกุล</th>
          <th scope="col" className="px-3 py-3.5 text-left text-sm font-semibold text-gray-600 dark:text-gray-300">รหัสนักเรียน</th>
          <th scope="col" className="px-3 py-3.5 text-left text-sm font-semibold text-gray-600 dark:text-gray-300">ชั้น/ห้อง</th>
          <th scope="col" className="px-3 py-3.5 text-left text-sm font-semibold text-gray-600 dark:text-gray-300">เบอร์ติดต่อผู้ปกครอง</th>
          <th scope="col" className="px-3 py-3.5 text-left text-sm font-semibold text-gray-600 dark:text-gray-300">สถานะ</th>
          <th scope="col" className="relative py-3.5 pl-3 pr-4 sm:pr-6"><span className="sr-only">Actions</span></th>
        </tr>
      </thead>
      <tbody className="divide-y divide-gray-200 dark:divide-gray-800 bg-white dark:bg-[#1e1f21]">
        {[...Array(8)].map((_, i) => (
          <tr key={i}>
            <td className="whitespace-nowrap py-4 pl-4 pr-3 text-sm text-center sm:pl-6"><div className="h-4 w-4 mx-auto rounded bg-gray-300 dark:bg-gray-700"></div></td>
            <td className="whitespace-nowrap py-4 pr-3 text-sm">
              <div className="flex items-center">
                <div className="h-10 w-10 rounded-full bg-gray-300 dark:bg-gray-700"></div>
                <div className="ml-4 h-4 w-32 rounded bg-gray-300 dark:bg-gray-700"></div>
              </div>
            </td>
            <td className="whitespace-nowrap px-3 py-4 text-sm"><div className="h-4 w-20 rounded bg-gray-300 dark:bg-gray-700"></div></td>
            <td className="whitespace-nowrap px-3 py-4 text-sm"><div className="h-4 w-12 rounded bg-gray-300 dark:bg-gray-700"></div></td>
            <td className="whitespace-nowrap px-3 py-4 text-sm"><div className="h-4 w-24 rounded bg-gray-300 dark:bg-gray-700"></div></td>
            <td className="whitespace-nowrap px-3 py-4 text-sm"><div className="h-5 w-16 rounded-md bg-gray-300 dark:bg-gray-700"></div></td>
            <td className="whitespace-nowrap px-3 py-4 text-sm"><div className="h-6 w-32 rounded-md bg-gray-300 dark:bg-gray-700"></div></td>
            <td className="relative whitespace-nowrap py-4 pl-3 pr-4 text-right text-sm font-medium sm:pr-6">
              <div className="flex justify-end items-center gap-x-4">
                <div className="h-4 w-4 rounded bg-gray-300 dark:bg-gray-700"></div>
                <div className="h-4 w-4 rounded bg-gray-300 dark:bg-gray-700"></div>
              </div>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  </div>
);

export default function StudentListPage() {
  const { ACADEMIC_ACCESS } = usePermissions();
  const [students, setStudents] = useState<Student[]>([]);
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [schoolId, setSchoolId] = useState<string | null>(null);
  // State for inline editing
  const [editingStudentId, setEditingStudentId] = useState<string | null>(null);
  const [rfidInputValue, setRfidInputValue] = useState<string>('');
  const [isSavingRfid, setIsSavingRfid] = useState(false);
  const [isRfidVisible, setIsRfidVisible] = useState(false); // New state for RFID visibility
  const [selectedClassLevel, setSelectedClassLevel] = useState<string>('');
  const [selectedRoom, setSelectedRoom] = useState<string>('');
  const [availableLevels, setAvailableLevels] = useState<string[]>([]);

  // Pagination State
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage] = useState(20);
  
  // Bulk RFID state
  const [isBulkRfidMode, setIsBulkRfidMode] = useState(false);
  const [bulkRfidData, setBulkRfidData] = useState<Record<string, string>>({});
  const [isSavingBulkRfid, setIsSavingBulkRfid] = useState(false);

  const handleDelete = async (student: Student) => {
    Swal.fire({
      title: 'ยืนยันการลบ',
      text: `คุณแน่ใจหรือไม่ว่าต้องการลบข้อมูลของ ${student.firstName} ${student.lastName}? การกระทำนี้ไม่สามารถย้อนกลับได้`,
      icon: 'warning',
      showCancelButton: true,
      confirmButtonColor: '#d33',
      cancelButtonColor: '#3085d6',
      confirmButtonText: 'ใช่, ลบเลย!',
      cancelButtonText: 'ยกเลิก',
      background: '#2a2b2f',
      color: '#ffffff'
    }).then(async (result) => {
      if (result.isConfirmed) {
        Swal.fire({
          title: 'กำลังลบข้อมูล...',
          text: 'กรุณารอสักครู่',
          allowOutsideClick: false,
          background: '#2a2b2f',
          color: '#ffffff',
          didOpen: () => {
            Swal.showLoading();
          }
        });

        try {
          await deleteDoc(doc(firestore, "school-settings", student.schoolId, "students", student.id));
          if (student.profileImageUrl) {
            const imageRef = ref(storage, student.profileImageUrl);
            await deleteObject(imageRef);
          }
          setStudents(prevStudents => prevStudents.filter(s => s.id !== student.id));
          Swal.fire({ title: 'ลบสำเร็จ!', text: 'ข้อมูลนักเรียนถูกลบเรียบร้อยแล้ว', icon: 'success', background: '#2a2b2f', color: '#ffffff' });
        } catch (err) {
          console.error("Error deleting student: ", err);
          Swal.fire({ title: 'เกิดข้อผิดพลาด!', text: 'ไม่สามารถลบข้อมูลนักเรียนได้', icon: 'error', background: '#2a2b2f', color: '#ffffff' });
        }
      }
    });
  };

  const handleStartEditRfid = (student: Student) => {
    setEditingStudentId(student.id);
    setRfidInputValue(student.rfid || '');
    setIsRfidVisible(false); // Reset visibility on new edit
  };

  const handleCancelEditRfid = () => {
    setEditingStudentId(null);
    setRfidInputValue('');
    setIsRfidVisible(false); // Reset visibility on cancel
  };

  const handleSaveRfidForStudent = async () => {
    if (!editingStudentId || !schoolId) return;

    setIsSavingRfid(true);

    const isDuplicate = students.some(
      student => student.id !== editingStudentId && student.rfid === rfidInputValue && rfidInputValue.trim() !== ''
    );

    if (isDuplicate) {
      Swal.fire('ข้อมูลซ้ำซ้อน', 'รหัส RFID นี้ถูกใช้กับนักเรียนคนอื่นแล้ว', 'warning');
      setIsSavingRfid(false);
      return;
    }

    try {
      const studentRef = doc(firestore, "school-settings", schoolId, "students", editingStudentId);
      await updateDoc(studentRef, { rfid: rfidInputValue });

      setStudents(prevStudents =>
        prevStudents.map(student =>
          student.id === editingStudentId ? { ...student, rfid: rfidInputValue } : student
        )
      );

      Swal.fire({ toast: true, position: 'top-end', icon: 'success', title: 'บันทึก RFID สำเร็จ', showConfirmButton: false, timer: 1500 });
      handleCancelEditRfid();
    } catch (err) {
      console.error("Error saving RFID data: ", err);
      Swal.fire('เกิดข้อผิดพลาด', 'ไม่สามารถบันทึกข้อมูลได้', 'error');
    } finally {
      setIsSavingRfid(false);
    }
  };

  const handleSaveBulkRfid = async () => {
    if (!schoolId) return;
    
    setIsSavingBulkRfid(true);
    
    try {
      const { writeBatch, doc } = await import("firebase/firestore");
      const batch = writeBatch(firestore);
      
      let changedCount = 0;
      Object.entries(bulkRfidData).forEach(([studentId, rfidValue]) => {
        const studentRef = doc(firestore, "school-settings", schoolId, "students", studentId);
        batch.update(studentRef, { rfid: rfidValue });
        changedCount++;
      });
      
      if (changedCount > 0) {
        await batch.commit();
        
        setStudents(prevStudents =>
          prevStudents.map(student =>
            bulkRfidData[student.id] !== undefined ? { ...student, rfid: bulkRfidData[student.id] } : student
          )
        );
        
        Swal.fire({ 
          icon: 'success', 
          title: 'บันทึกสำเร็จ', 
          text: `บันทึกข้อมูล RFID ทั้งหมด ${changedCount} รายการเรียบร้อยแล้ว`,
          timer: 2000,
          showConfirmButton: false,
          background: '#2a2b2f',
          color: '#ffffff'
        });
      }
      
      setIsBulkRfidMode(false);
      setBulkRfidData({});
    } catch (err) {
      console.error("Error saving bulk RFID data: ", err);
      Swal.fire('เกิดข้อผิดพลาด', 'ไม่สามารถบันทึกข้อมูลแบบกลุ่มได้', 'error');
    } finally {
      setIsSavingBulkRfid(false);
    }
  };

  const handleToggleBulkRfidMode = () => {
    if (isBulkRfidMode) {
      setIsBulkRfidMode(false);
      setBulkRfidData({});
    } else {
      setIsBulkRfidMode(true);
      // Initialize bulk data with current values
      const initialData: Record<string, string> = {};
      students.forEach(s => {
        if (s.rfid) initialData[s.id] = s.rfid;
      });
      setBulkRfidData(initialData);
    }
  };

  const fetchStudents = useCallback(async (currentSchoolId: string) => {
    setIsLoading(true);
    setError(null);
    try {
      const studentsCollection = collection(firestore, "school-settings", currentSchoolId, "students");
      // เรียงข้อมูลตามวันที่สร้างล่าสุดมาไว้บนสุด
      const q = query(studentsCollection, orderBy("createdAt", "desc"));
      const querySnapshot = await getDocs(q);
      const studentsData = querySnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data(),
      } as Student));
      setStudents(studentsData);
    } catch (err) {
      console.error("Error fetching students: ", err);
      setError("เกิดข้อผิดพลาดในการดึงข้อมูลนักเรียน");
    } finally {
      setIsLoading(false);
    }
  }, []);



  useEffect(() => {
    const fetchLevels = async () => {
      if (!schoolId) return;
      try {
        const schoolRef = doc(firestore, "school-settings", schoolId);
        const schoolSnap = await getDoc(schoolRef);
        if (schoolSnap.exists()) {
          const data = schoolSnap.data();
          const levels = getLevelsByRange(data.opportunityExpansionLevel);
          setAvailableLevels(levels);
        }
      } catch (error) {
        console.error("Error fetching school levels:", error);
      }
    };
    fetchLevels();
  }, [schoolId]);

  // Reset pagination when filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, selectedClassLevel, selectedRoom]);

  useEffect(() => {
    const unsub = auth.onAuthStateChanged(async (user) => {
      if (user) {
        const userDocRef = doc(firestore, "users", user.uid);
        const userDocSnap = await getDoc(userDocRef);
        if (userDocSnap.exists()) {
          const schoolId = userDocSnap.data().schoolId;
          if (schoolId) {
            setSchoolId(schoolId);
            fetchStudents(schoolId);
          } else {
            setError("ไม่พบข้อมูลโรงเรียนสำหรับบัญชีของคุณ");
            setIsLoading(false);
          }
        }
      }
    });
    return () => unsub();
  }, []);

  const renderContent = () => {
    if (isLoading) {
      return <SkeletonLoader />;
    }

    if (error) {
      return <div className="text-center py-10 text-red-400">{error}</div>;
    }

    if (!selectedClassLevel) {
      return (
        <div className="flex flex-col items-center justify-center py-20 px-4 text-center">
          <div className="w-20 h-20 bg-indigo-100 dark:bg-indigo-900/30 rounded-full flex items-center justify-center mb-4">
            <FaFilter className="text-indigo-600 dark:text-indigo-400 text-3xl" />
          </div>
          <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-2">กรุณาเลือกชั้นเรียน</h3>
          <p className="text-gray-500 dark:text-gray-400 max-w-sm">
            โปรดเลือกชั้นเรียนจากเมนูเลือกด้านบน เพื่อแสดงรายชื่อนักเรียนในชั้นเรียนนั้นๆ
          </p>
        </div>
      );
    }

    const filteredStudents = students.filter(student =>
      `${student.title}${student.firstName} ${student.lastName}`.toLowerCase().includes(searchTerm.toLowerCase()) ||
      student.studentId.toLowerCase().includes(searchTerm.toLowerCase())
    ).filter(student => {
      if (selectedClassLevel === 'ม.ต้น') return ['ม.1', 'ม.2', 'ม.3'].includes(student.classLevel);
      if (selectedClassLevel === 'ม.ปลาย') return ['ม.4', 'ม.5', 'ม.6'].includes(student.classLevel);
      return student.classLevel === selectedClassLevel;
    })
      .filter(student => selectedRoom === '' || student.room === selectedRoom);

    // Pagination Logic
    const totalPages = Math.ceil(filteredStudents.length / itemsPerPage);
    const indexOfLastItem = currentPage * itemsPerPage;
    const indexOfFirstItem = indexOfLastItem - itemsPerPage;
    const currentStudents = filteredStudents.slice(indexOfFirstItem, indexOfLastItem);

    if (filteredStudents.length === 0) {
      return (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <div className="w-16 h-16 bg-gray-100 dark:bg-gray-800 rounded-full flex items-center justify-center mb-4">
            <FaSearch className="text-gray-400 dark:text-gray-500 text-2xl" />
          </div>
          <p className="text-gray-500 dark:text-gray-400 font-medium">ไม่พบข้อมูลนักเรียนในชั้นเรียนนี้</p>
          {searchTerm && <p className="text-sm text-gray-400 dark:text-gray-500 mt-1">สำหรับการค้นหา: "{searchTerm}"</p>}
        </div>
      );
    }


    return (
      <div className="table-responsive">
        <table className="min-w-full divide-y divide-gray-700">
          <thead className="bg-gray-100 dark:bg-[#2a2b2f]">
            <tr>
              <th scope="col" className="py-3 px-2 text-left text-xs font-semibold text-gray-600 dark:text-gray-300 w-12">ลำดับ</th>
              <th scope="col" className="py-3 px-2 text-left text-xs font-semibold text-gray-600 dark:text-gray-300">ชื่อ-สกุล</th>
              <th scope="col" className="px-2 py-3 text-left text-xs font-semibold text-gray-600 dark:text-gray-300">รหัสนักเรียน</th>
              <th scope="col" className="px-2 py-3 text-left text-xs font-semibold text-gray-600 dark:text-gray-300">ชั้น/ห้อง</th>
              <th scope="col" className="hidden lg:table-cell px-2 py-3 text-left text-xs font-semibold text-gray-600 dark:text-gray-300">เบอร์โทรศัพท์</th>
              <th scope="col" className="hidden md:table-cell px-2 py-3 text-left text-xs font-semibold text-gray-600 dark:text-gray-300">สิทธิ์ (Role)</th>
              <th scope="col" className="hidden xl:table-cell px-2 py-3 text-left text-xs font-semibold text-gray-600 dark:text-gray-300">คะแนนความประพฤติ</th>
              <th scope="col" className="px-2 py-3 text-left text-xs font-semibold text-gray-600 dark:text-gray-300">สถานะ</th>
              <th scope="col" className="px-2 py-3 text-left text-xs font-semibold text-gray-600 dark:text-gray-300 w-32 sm:w-40">RFID</th>
              <CanAccess roles={ACADEMIC_ACCESS}>
                <th scope="col" className="py-3 pl-3 pr-4 sm:pr-6 text-right text-xs font-semibold text-gray-600 dark:text-gray-300">
                  ดำเนินการ
                </th>
              </CanAccess>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200 dark:divide-gray-800 bg-white dark:bg-[#1e1f21]">
            {currentStudents.map((student, index) => (
              <tr key={student.id} className="hover:bg-gray-50 dark:hover:bg-[#2a2b2f]/50 transition-colors">
                <td className="whitespace-nowrap py-3 px-2 text-xs text-center font-medium text-gray-500 dark:text-gray-400">{indexOfFirstItem + index + 1}</td>
                <td className="whitespace-nowrap py-3 px-2 text-xs">
                  <Link to={`/school/${student.schoolId}/students/view/${student.id}`} className="flex items-center group">
                    <div className="h-8 w-8 flex-shrink-0">
                      <img
                        className="h-8 w-8 rounded-full object-cover"
                        src={student.profileImageUrl || `https://ui-avatars.com/api/?name=${student.firstName}+${student.lastName}&background=random`}
                        alt={`${student.firstName} ${student.lastName}`}
                      />
                    </div>
                    <div className="ml-3">
                      <div className="font-medium text-gray-900 dark:text-gray-200 group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition-colors">{`${student.title}${student.firstName} ${student.lastName}`}</div>
                    </div>
                  </Link>
                </td>
                <td className="whitespace-nowrap px-2 py-3 text-xs text-gray-500 dark:text-gray-400">{student.studentId}</td>
                <td className="whitespace-nowrap px-2 py-3 text-xs text-gray-500 dark:text-gray-400">
                  {`${student.classLevel}/${student.room}`}
                </td>
                <td className="hidden lg:table-cell whitespace-nowrap px-2 py-3 text-xs text-gray-500 dark:text-gray-400">{student.phoneNumber || student.contact || '-'}</td>
                <td className="hidden md:table-cell whitespace-nowrap px-2 py-3 text-xs">
                  <div className="flex flex-wrap gap-1">
                    {(student.role || ["student"]).map((r, i) => (
                      <span key={i} className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold ${r === 'student' ? 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300' :
                        r === 'parent' ? 'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300' :
                          'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300'
                        }`}>
                        {r === 'student' ? 'นักเรียน' : r === 'parent' ? 'ผู้ปกครอง' : r}
                      </span>
                    ))}
                  </div>
                </td>
                <td className="hidden xl:table-cell whitespace-nowrap px-2 py-3 text-xs">
                  <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium ${(student.behaviorScore ?? 100) >= 50 ? 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200' : 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200'}`}>
                    {student.behaviorScore ?? 100}
                  </span>
                </td>
                <td className="whitespace-nowrap px-2 py-3 text-xs text-gray-300">
                  <span className={`inline-flex items-center rounded-md px-2 py-0.5 text-[10px] font-medium border ${statusColorMap[student.studentStatus] || 'bg-gray-500/20 text-gray-400 border-gray-500/30'}`}>
                    {student.studentStatus}
                  </span>
                </td>
                <td className="whitespace-nowrap px-2 py-3 text-xs">
                  {isBulkRfidMode ? (
                    <div className="flex items-center gap-2 w-full max-w-[150px]">
                      <input
                        type="text"
                        id={`bulk-rfid-student-${index}`}
                        value={bulkRfidData[student.id] || ''}
                        onChange={(e) => setBulkRfidData(prev => ({ ...prev, [student.id]: e.target.value }))}
                        onKeyDown={async (e) => {
                          if (e.key === 'Enter') {
                            const value = bulkRfidData[student.id];
                            if (!value) return;
                            
                            try {
                              const studentRef = doc(firestore, "school-settings", schoolId!, "students", student.id);
                              await updateDoc(studentRef, { rfid: value });
                              
                              setStudents(prevStudents =>
                                prevStudents.map(s => s.id === student.id ? { ...s, rfid: value } : s)
                              );

                              Swal.fire({ 
                                toast: true, 
                                position: 'top-end', 
                                icon: 'success', 
                                title: `บันทึก RFID ของ ${student.firstName} สำเร็จ`, 
                                showConfirmButton: false, 
                                timer: 1000 
                              });

                              // Focus next input
                              const nextInput = document.getElementById(`bulk-rfid-student-${index + 1}`);
                              if (nextInput) {
                                (nextInput as HTMLInputElement).focus();
                              }
                            } catch (err) {
                              console.error(err);
                              Swal.fire('Error', 'ไม่สามารถบันทึก RFID ได้', 'error');
                            }
                          }
                        }}
                        placeholder="สแกน..."
                        className="w-full bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg px-2 py-1 text-[10px] focus:outline-none focus:ring-1 focus:ring-indigo-500 transition"
                      />
                    </div>
                  ) : editingStudentId === student.id ? (
                    <div className="flex items-center gap-2 w-full max-w-[150px]">
                      <div className="relative flex-grow">
                        <input
                          type={isRfidVisible ? "text" : "password"}
                          value={rfidInputValue}
                          onChange={(e) => setRfidInputValue(e.target.value)}
                          className="w-full bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg px-2 pr-6 py-1 text-[10px] focus:outline-none focus:ring-1 focus:ring-indigo-500 transition"
                          autoFocus
                        />
                        <button type="button" onClick={() => setIsRfidVisible(!isRfidVisible)} className="absolute inset-y-0 right-0 flex items-center pr-1.5 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200">
                          {isRfidVisible ? <FaEyeSlash size={10} /> : <FaEye size={10} />}
                        </button>
                      </div>
                      <button onClick={handleSaveRfidForStudent} disabled={isSavingRfid} className="text-green-500 hover:text-green-400"><FaCheck size={12} /></button>
                      <button onClick={handleCancelEditRfid} className="text-red-500 hover:text-red-400"><FaTimes size={12} /></button>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2 group">
                      <span className="text-gray-500 dark:text-gray-400 font-mono text-[10px] tracking-wider">{student.rfid ? '••••••••' : 'ไม่มีข้อมูล'}</span>
                      <CanAccess roles={ACADEMIC_ACCESS}>
                        <button onClick={() => handleStartEditRfid(student)} className="text-gray-400 opacity-0 group-hover:opacity-100 hover:text-indigo-400 transition-all" title="แก้ไข RFID">
                          <FaIdCard size={12} />
                        </button>
                      </CanAccess>
                    </div>
                  )}
                </td>
                <CanAccess roles={ACADEMIC_ACCESS}>
                  <td className="relative whitespace-nowrap py-3 pl-3 pr-4 text-right text-xs font-medium sm:pr-6">
                    <div className="flex justify-end items-center gap-x-3">
                      <Link to={`/school/${student.schoolId}/students/edit/${student.id}`} className="text-indigo-400 hover:text-indigo-300 transition-colors" title="แก้ไข">
                        <FaUserEdit size={14} />
                      </Link>
                      <button onClick={() => handleDelete(student)} className="text-red-500 hover:text-red-400 transition-colors" title="ลบ">
                        <FaTrashAlt size={13} />
                      </button>
                    </div>
                  </td>
                </CanAccess>
              </tr>
            ))}
          </tbody>
        </table>

        {/* Pagination UI */}
        {totalPages > 1 && (
          <div className="px-6 py-4 bg-gray-50 dark:bg-white/5 border-t border-gray-200 dark:border-gray-800">
            <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
              <div className="text-xs text-gray-500 dark:text-gray-400">
                แสดง {indexOfFirstItem + 1} ถึง {Math.min(indexOfLastItem, filteredStudents.length)} จาก {filteredStudents.length} รายการ
              </div>
              <div className="flex flex-wrap items-center justify-center gap-1.5 p-1 bg-gray-50/50 dark:bg-black/20 rounded-xl border border-gray-200/50 dark:border-white/5">
                <button
                  onClick={() => setCurrentPage(1)}
                  disabled={currentPage === 1}
                  className="px-2.5 py-1.5 rounded-lg border border-transparent hover:border-gray-200 dark:hover:border-white/10 hover:bg-white dark:hover:bg-white/5 disabled:opacity-30 disabled:cursor-not-allowed transition-all text-[10px] font-bold text-gray-600 dark:text-gray-400 flex items-center gap-1"
                  title="หน้าแรก"
                >
                  <ChevronsLeft size={14} />
                  <span className="hidden sm:inline text-[9px] uppercase tracking-wider">หน้าแรก</span>
                </button>
                
                <button
                  onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))}
                  disabled={currentPage === 1}
                  className="px-2.5 py-1.5 rounded-lg border border-transparent hover:border-gray-200 dark:hover:border-white/10 hover:bg-white dark:hover:bg-white/5 disabled:opacity-30 disabled:cursor-not-allowed transition-all text-[10px] font-bold text-gray-600 dark:text-gray-400 flex items-center gap-1"
                  title="ย้อนกลับ"
                >
                  <ChevronLeft size={14} />
                  <span className="hidden sm:inline text-[9px] uppercase tracking-wider">ย้อนกลับ</span>
                </button>

                <div className="h-4 w-[1px] bg-gray-200 dark:bg-white/10 mx-1" />

                <div className="flex items-center gap-1">
                  {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                    let pageNum = i + 1;
                    if (totalPages > 5) {
                      const start = Math.max(1, Math.min(currentPage - 2, totalPages - 4));
                      pageNum = start + i;
                    }
                    return (
                      <button
                        key={pageNum}
                        onClick={() => setCurrentPage(pageNum)}
                        className={`w-8 h-8 flex items-center justify-center rounded-lg text-xs font-bold transition-all ${currentPage === pageNum
                          ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-600/20 scale-105'
                          : 'hover:bg-white dark:hover:bg-white/5 text-gray-600 dark:text-gray-400'
                          }`}
                      >
                        {pageNum}
                      </button>
                    );
                  })}
                </div>

                <div className="h-4 w-[1px] bg-gray-200 dark:bg-white/10 mx-1" />

                <button
                  onClick={() => setCurrentPage(prev => Math.min(prev + 1, totalPages))}
                  disabled={currentPage === totalPages}
                  className="px-2.5 py-1.5 rounded-lg border border-transparent hover:border-gray-200 dark:hover:border-white/10 hover:bg-white dark:hover:bg-white/5 disabled:opacity-30 disabled:cursor-not-allowed transition-all text-[10px] font-bold text-gray-600 dark:text-gray-400 flex items-center gap-1"
                  title="ถัดไป"
                >
                  <span className="hidden sm:inline text-[9px] uppercase tracking-wider">ถัดไป</span>
                  <ChevronRight size={14} />
                </button>

                <button
                  onClick={() => setCurrentPage(totalPages)}
                  disabled={currentPage === totalPages}
                  className="px-2.5 py-1.5 rounded-lg border border-transparent hover:border-gray-200 dark:hover:border-white/10 hover:bg-white dark:hover:bg-white/5 disabled:opacity-30 disabled:cursor-not-allowed transition-all text-[10px] font-bold text-gray-600 dark:text-gray-400 flex items-center gap-1"
                  title="หน้าสุดท้าย"
                >
                  <span className="hidden sm:inline text-[9px] uppercase tracking-wider">หน้าสุดท้าย</span>
                  <ChevronsRight size={14} />
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  };

  return (
    <MainLayout>
      <div className="min-h-screen bg-gray-50 dark:bg-[#1e1f21] text-gray-900 dark:text-white overflow-x-hidden">
        <div className="w-full pl-12 pr-2 sm:pl-14 sm:pr-4 md:pl-16 md:pr-6 py-4 sm:py-6 lg:py-8">
          <header className="mb-6 space-y-4">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2">
              <div>
                <div className="flex items-center gap-4">
                  <BackButton />
                  <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">ข้อมูลนักเรียนทั้งหมด</h1>
                </div>
                <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                  แสดง, จัดการ, และเพิ่มข้อมูลนักเรียนในระบบ
                </p>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-3 p-4 bg-white dark:bg-[#2a2b2f]/80 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700/50 backdrop-blur-sm">
              <div className="relative flex-grow min-w-[240px] max-w-md">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <FaSearch className="text-gray-400 text-sm" />
                </div>
                <input
                  type="text"
                  placeholder="ค้นหาชื่อ, รหัสนักเรียน..."
                  className="pl-9 pr-4 py-2 w-full bg-gray-50 dark:bg-[#1e1f21] border border-gray-200 dark:border-gray-700 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none transition-all text-xs text-gray-900 dark:text-white"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                />
              </div>

              <div className="flex items-center gap-2">
                <select
                  value={selectedClassLevel}
                  onChange={(e) => setSelectedClassLevel(e.target.value)}
                  className="pl-3 pr-8 py-2 bg-gray-50 dark:bg-[#1e1f21] border border-gray-200 dark:border-gray-700 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none text-xs text-gray-900 dark:text-white"
                >
                  <option value="">ทุกชั้น</option>
                  {availableLevels.map(level => <option key={level} value={level}>{level}</option>)}
                </select>
                <select
                  value={selectedRoom}
                  onChange={(e) => setSelectedRoom(e.target.value)}
                  className="pl-3 pr-8 py-2 bg-gray-50 dark:bg-[#1e1f21] border border-gray-200 dark:border-gray-700 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none text-xs text-gray-900 dark:text-white"
                >
                  <option value="">ทุกห้อง</option>
                  {Array.from({ length: 20 }, (_, i) => i + 1).map(r => <option key={r} value={r}>{r}</option>)}
                </select>
              </div>

              <div className="flex flex-wrap gap-2 ml-auto">
                <CanAccess roles={ACADEMIC_ACCESS}>
                  {isBulkRfidMode ? (
                    <div className="flex gap-2">
                      <button
                        onClick={handleSaveBulkRfid}
                        disabled={isSavingBulkRfid}
                        className="flex items-center justify-center gap-2 bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-xl font-medium transition-all shadow-sm active:scale-95 text-xs whitespace-nowrap"
                      >
                        {isSavingBulkRfid ? <div className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" /> : <FaCheck size={12} />}
                        <span>บันทึกทั้งหมด</span>
                      </button>
                      <button
                        onClick={handleToggleBulkRfidMode}
                        className="flex items-center justify-center gap-2 bg-gray-500 hover:bg-gray-600 text-white px-4 py-2 rounded-xl font-medium transition-all shadow-sm active:scale-95 text-xs whitespace-nowrap"
                      >
                        <FaTimes size={12} />
                        <span>ยกเลิก</span>
                      </button>
                    </div>
                  ) : (
                    <>
                      <Link
                        to={schoolId ? `/school/${schoolId}/students/add` : '#'}
                        className="flex items-center justify-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-xl font-medium transition-all shadow-sm active:scale-95 text-xs whitespace-nowrap"
                      >
                        <FaPlus size={12} />
                        <span>เพิ่มนักเรียนใหม่</span>
                      </Link>
                      <button
                        onClick={handleToggleBulkRfidMode}
                        className="flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-xl font-medium transition-all shadow-sm active:scale-95 text-xs whitespace-nowrap"
                      >
                        <FaIdCard size={12} />
                        <span>จับคู่ RFID</span>
                      </button>
                      <Link
                        to={schoolId ? `/school/${schoolId}/students/import-dmc` : '#'}
                        className="hidden md:flex items-center justify-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2 rounded-xl font-medium transition-all shadow-sm active:scale-95 text-xs whitespace-nowrap"
                      >
                        <FaFileExcel size={12} />
                        <span>นำเข้า DMC</span>
                      </Link>
                    </>
                  )}
                </CanAccess>
              </div>
            </div>
          </header>

          <main>
            <div className="bg-white dark:bg-[#2a2b2f]/60 rounded-2xl shadow-lg ring-1 ring-black/5 dark:ring-white/5">
              {renderContent()}
            </div>
          </main>
        </div>
      </div>
    </MainLayout>
  );
}