import React, { useState, useEffect, useCallback } from "react";
import { useSelector } from "react-redux";
import { RootState } from "@/store";
import { Link, useParams } from "react-router-dom";
import MainLayout from "@/layouts/MainLayout";
<<<<<<< HEAD
import BackButton from "@/components/Shared/BackButton";
import { firestore, storage, auth } from "@/firebase";
import { collection, getDocs, query, orderBy, Timestamp, doc, deleteDoc, getDoc, updateDoc } from "firebase/firestore";
=======
import { firestore, storage, auth } from "@/firebase";
import { collection, getDocs, query, orderBy, Timestamp, doc, deleteDoc, getDoc } from "firebase/firestore";
>>>>>>> 5f8c7e1 (feat: optimize auto-scheduler and update UI labels)
import { ref, deleteObject } from "firebase/storage";
import { FaPlus, FaUserEdit, FaTrashAlt, FaSearch, FaUserPlus, FaCloudUploadAlt, FaCheck, FaTimes, FaEye, FaEyeSlash, FaIdCard, FaFileExcel } from "react-icons/fa";
import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from "lucide-react";
import Swal from 'sweetalert2';
import CanAccess from "@/components/AccessControl/CanAccess";
import { usePermissions } from "@/hooks/usePermissions";

// กำหนด Type สำหรับข้อมูลครู
interface Teacher {
  id: string;
  profileImageUrl?: string;
  teacherId: string;
  title: string;
  firstName: string;
  lastName: string;
  department?: string;
  contact?: string;
  schoolId: string; // 📌 เพิ่ม schoolId
  createdAt: Timestamp;
  subject?: string; // 📌 เพิ่มวิชาที่สอนหลัก
  subjects?: string[];
  academicStanding?: string;
  rfid?: string;
<<<<<<< HEAD
  status?: string;
=======
>>>>>>> 5f8c7e1 (feat: optimize auto-scheduler and update UI labels)
}


// --- Skeleton Loader Component ---
const SkeletonLoader = () => (
  <div className="table-responsive animate-pulse">
    <table className="min-w-full divide-y divide-gray-700">
      <thead className="bg-gray-100 dark:bg-[#2a2b2f]">
        <tr>
          <th scope="col" className="py-3.5 pl-4 pr-3 text-left text-sm font-semibold text-gray-600 dark:text-gray-300 sm:pl-6 w-16">ลำดับ</th>
          <th scope="col" className="py-3.5 pl-4 pr-3 text-left text-sm font-semibold text-gray-600 dark:text-gray-300 sm:pl-6">ชื่อ-สกุล</th>
          <th scope="col" className="px-3 py-3.5 text-left text-sm font-semibold text-gray-600 dark:text-gray-300">วิทยฐานะ</th>
          <th scope="col" className="px-3 py-3.5 text-left text-sm font-semibold text-gray-600 dark:text-gray-300">รหัสครู</th>
          <th scope="col" className="px-3 py-3.5 text-left text-sm font-semibold text-gray-600 dark:text-gray-300">ฝ่ายงาน</th>
          <th scope="col" className="px-3 py-3.5 text-left text-sm font-semibold text-gray-600 dark:text-gray-300">เบอร์ติดต่อ</th>
          <th scope="col" className="relative py-3.5 pl-3 pr-4 sm:pr-6"><span className="sr-only">Actions</span></th>
        </tr>
      </thead>
      <tbody className="divide-y divide-gray-200 dark:divide-gray-800 bg-white dark:bg-[#1e1f21]">
        {[...Array(8)].map((_, i) => (
          <tr key={i}>
            <td className="whitespace-nowrap py-4 pl-4 pr-3 text-sm text-center sm:pl-6"><div className="h-4 w-4 mx-auto rounded bg-gray-300 dark:bg-gray-700"></div></td>
            <td className="whitespace-nowrap py-4 pl-4 pr-3 text-sm sm:pl-6">
              <div className="flex items-center">
                <div className="h-10 w-10 rounded-full bg-gray-300 dark:bg-gray-700"></div>
                <div className="ml-4 h-4 w-32 rounded bg-gray-300 dark:bg-gray-700"></div>
              </div>
            </td>
            <td className="whitespace-nowrap px-3 py-4 text-sm"><div className="h-4 w-24 rounded bg-gray-300 dark:bg-gray-700"></div></td>
            <td className="whitespace-nowrap px-3 py-4 text-sm"><div className="h-4 w-20 rounded bg-gray-300 dark:bg-gray-700"></div></td>
            <td className="whitespace-nowrap px-3 py-4 text-sm"><div className="h-4 w-24 rounded bg-gray-300 dark:bg-gray-700"></div></td>
            <td className="whitespace-nowrap px-3 py-4 text-sm"><div className="h-4 w-24 rounded bg-gray-300 dark:bg-gray-700"></div></td>
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
export default function TeacherListPage() {
  const [teachers, setTeachers] = useState<Teacher[]>([]);
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [schoolId, setSchoolId] = useState<string | null>(null);
  const { ADMIN_ACCESS } = usePermissions();
  const profile = useSelector((state: RootState) => state.profile);

<<<<<<< HEAD
=======
  // RFID Edit State
  const [editingTeacherId, setEditingTeacherId] = useState<string | null>(null);
  const [rfidInputValue, setRfidInputValue] = useState<string>('');
  const [isSavingRfid, setIsSavingRfid] = useState(false);
  const [isRfidVisible, setIsRfidVisible] = useState(false);

  // Bulk RFID state
  const [isBulkRfidMode, setIsBulkRfidMode] = useState(false);
  const [bulkRfidData, setBulkRfidData] = useState<Record<string, string>>({});
  const [isSavingBulkRfid, setIsSavingBulkRfid] = useState(false);
>>>>>>> 5f8c7e1 (feat: optimize auto-scheduler and update UI labels)

  // Pagination State
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage] = useState(20);

  const handleDelete = async (teacher: Teacher) => {
    Swal.fire({
      title: 'ยืนยันการลบ',
      text: `คุณแน่ใจหรือไม่ว่าต้องการลบข้อมูลของ ${teacher.firstName} ${teacher.lastName}? การกระทำนี้ไม่สามารถย้อนกลับได้`,
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
          didOpen: () => Swal.showLoading()
        });

        try {
          await deleteDoc(doc(firestore, "school-settings", teacher.schoolId, "teachers", teacher.id));
          if (teacher.profileImageUrl) {
            const imageRef = ref(storage, teacher.profileImageUrl);
            await deleteObject(imageRef);
          }
          setTeachers(prevTeachers => prevTeachers.filter(t => t.id !== teacher.id));
          Swal.fire({ title: 'ลบสำเร็จ!', text: 'ข้อมูลครูถูกลบเรียบร้อยแล้ว', icon: 'success', background: '#2a2b2f', color: '#ffffff' });
        } catch (err) {
          console.error("Error deleting teacher: ", err);
          Swal.fire({ title: 'เกิดข้อผิดพลาด!', text: 'ไม่สามารถลบข้อมูลครูได้', icon: 'error', background: '#2a2b2f', color: '#ffffff' });
        }
      }
    });
  };

<<<<<<< HEAD
=======
  const handleStartEditRfid = (teacher: Teacher) => {
    setEditingTeacherId(teacher.id);
    setRfidInputValue(teacher.rfid || '');
    setIsRfidVisible(false);
  };

  const handleCancelEditRfid = () => {
    setEditingTeacherId(null);
    setRfidInputValue('');
  };

  const handleSaveRfidForTeacher = async () => {
    if (!editingTeacherId || !schoolId) return;
    setIsSavingRfid(true);
    try {
      const { doc, updateDoc } = await import("firebase/firestore");
      const teacherRef = doc(firestore, "school-settings", schoolId, "teachers", editingTeacherId);
      await updateDoc(teacherRef, { rfid: rfidInputValue });

      setTeachers(prevTeachers =>
        prevTeachers.map(t => t.id === editingTeacherId ? { ...t, rfid: rfidInputValue } : t)
      );

      setEditingTeacherId(null);
      setRfidInputValue('');
      Swal.fire({ 
        icon: 'success', 
        title: 'บันทึกสำเร็จ', 
        timer: 1500, 
        showConfirmButton: false,
        background: '#2a2b2f',
        color: '#ffffff'
      });
    } catch (err) {
      console.error("Error updating teacher RFID: ", err);
      Swal.fire('เกิดข้อผิดพลาด', 'ไม่สามารถอัปเดตข้อมูล RFID ได้', 'error');
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

      Object.entries(bulkRfidData).forEach(([teacherId, rfidValue]) => {
        const teacherRef = doc(firestore, "school-settings", schoolId, "teachers", teacherId);
        batch.update(teacherRef, { rfid: rfidValue });
        changedCount++;
      });

      if (changedCount > 0) {
        await batch.commit();
        setTeachers(prevTeachers =>
          prevTeachers.map(t => bulkRfidData[t.id] !== undefined ? { ...t, rfid: bulkRfidData[t.id] } : t)
        );
        Swal.fire({
          icon: 'success',
          title: 'บันทึกสำเร็จ',
          text: `บันทึกข้อมูล RFID ครูทั้งหมด ${changedCount} รายการเรียบร้อยแล้ว`,
          timer: 2000,
          showConfirmButton: false,
          background: '#2a2b2f',
          color: '#ffffff'
        });
      }
      setIsBulkRfidMode(false);
      setBulkRfidData({});
    } catch (err) {
      console.error("Error saving bulk teacher RFID: ", err);
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
      const initialData: Record<string, string> = {};
      teachers.forEach(t => {
        if (t.rfid) initialData[t.id] = t.rfid;
      });
      setBulkRfidData(initialData);
    }
  };
>>>>>>> 5f8c7e1 (feat: optimize auto-scheduler and update UI labels)

  const fetchTeachers = useCallback(async (currentSchoolId: string) => {
    setIsLoading(true);
    setError(null);
    try {
      const teachersCollection = collection(firestore, "school-settings", currentSchoolId, "teachers");
      // เรียงข้อมูลตามวันที่สร้างล่าสุดมาไว้บนสุด
      const q = query(teachersCollection, orderBy("createdAt", "desc"));
      const querySnapshot = await getDocs(q);

      const teachersData = querySnapshot.docs.map(doc => ({
        id: doc.id,
        schoolId: currentSchoolId, // 📌 เพิ่ม schoolId เข้าไปใน object
        ...doc.data(),
      })) as Teacher[];
      setTeachers(teachersData);
    } catch (err) {
      console.error("Error fetching teachers: ", err);
      setError("เกิดข้อผิดพลาดในการดึงข้อมูลครูของโรงเรียนนี้");
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    const unsub = auth.onAuthStateChanged(async (user) => {
      if (user) {
        const userDocRef = doc(firestore, "users", user.uid);
        const userDocSnap = await getDoc(userDocRef);
        if (userDocSnap.exists()) {
          const userSchoolId = userDocSnap.data().schoolId;
          if (userSchoolId) {
            setSchoolId(userSchoolId);
            fetchTeachers(userSchoolId);


          } else {
            setError("ไม่พบข้อมูลโรงเรียนสำหรับบัญชีของคุณ");
            setIsLoading(false);
          }
        }
      }
    });
    return () => unsub();
  }, [fetchTeachers]);

  // Reset pagination when search term changes
  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm]);

  const renderContent = () => {
    if (isLoading) {
      return <SkeletonLoader />;
    }

    if (error) {
      return <div className="text-center py-10 text-red-400">{error}</div>;
    }

    if (!isLoading && teachers.length === 0) {
      return <div className="text-center py-10 text-gray-500">ไม่พบข้อมูลครู</div>;
    }

    const filteredTeachers = teachers.filter(teacher => {
      const matchesSearch = `${teacher.title}${teacher.firstName} ${teacher.lastName}`.toLowerCase().includes(searchTerm.toLowerCase()) ||
        teacher.teacherId.toLowerCase().includes(searchTerm.toLowerCase());
      return matchesSearch;
    });

    // Pagination Logic
    const totalPages = Math.ceil(filteredTeachers.length / itemsPerPage);
    const indexOfLastItem = currentPage * itemsPerPage;
    const indexOfFirstItem = indexOfLastItem - itemsPerPage;
    const currentTeachers = filteredTeachers.slice(indexOfFirstItem, indexOfLastItem);
    return (
      <div className="table-responsive">
        <table className="min-w-full divide-y divide-gray-700">
          <thead className="bg-gray-100 dark:bg-[#2a2b2f]">
            <tr>
<<<<<<< HEAD
              <th scope="col" className="px-2 py-3 text-left text-xs font-semibold text-gray-600 dark:text-gray-300">รหัสครู</th>
              <th scope="col" className="py-3 px-2 text-xs font-semibold text-gray-600 dark:text-gray-300 w-12 text-center">ลำดับ</th>
              <th scope="col" className="py-3 px-2 text-left text-xs font-semibold text-gray-600 dark:text-gray-300">ชื่อ-สกุล</th>
              <th scope="col" className="hidden lg:table-cell px-2 py-3 text-left text-xs font-semibold text-gray-600 dark:text-gray-300">วิทยฐานะ</th>
              <th scope="col" className="hidden md:table-cell px-2 py-3 text-left text-xs font-semibold text-gray-600 dark:text-gray-300">ฝ่ายงาน</th>
              <th scope="col" className="hidden xl:table-cell px-2 py-3 text-left text-xs font-semibold text-gray-600 dark:text-gray-300">เบอร์ติดต่อ</th>
              <th scope="col" className="px-2 py-3 text-left text-xs font-semibold text-gray-600 dark:text-gray-300">RFID</th>
              <th scope="col" className="px-2 py-3 text-left text-xs font-semibold text-gray-600 dark:text-gray-300">สถานะ</th>
=======
              <th scope="col" className="py-3 px-2 text-left text-xs font-semibold text-gray-600 dark:text-gray-300 w-12 text-center">ลำดับ</th>
              <th scope="col" className="py-3 px-2 text-left text-xs font-semibold text-gray-600 dark:text-gray-300">ชื่อ-สกุล</th>
              <th scope="col" className="hidden lg:table-cell px-2 py-3 text-left text-xs font-semibold text-gray-600 dark:text-gray-300">วิทยฐานะ</th>
              <th scope="col" className="px-2 py-3 text-left text-xs font-semibold text-gray-600 dark:text-gray-300">รหัสครู</th>
              <th scope="col" className="hidden md:table-cell px-2 py-3 text-left text-xs font-semibold text-gray-600 dark:text-gray-300">ฝ่ายงาน</th>
              <th scope="col" className="hidden xl:table-cell px-2 py-3 text-left text-xs font-semibold text-gray-600 dark:text-gray-300">เบอร์ติดต่อ</th>
              <th scope="col" className="px-2 py-3 text-left text-xs font-semibold text-gray-600 dark:text-gray-300 w-32 sm:w-40">RFID</th>
>>>>>>> 5f8c7e1 (feat: optimize auto-scheduler and update UI labels)
              <CanAccess roles={ADMIN_ACCESS}>
                <th scope="col" className="py-3 pl-3 pr-4 sm:pr-6 text-right text-xs font-semibold text-gray-600 dark:text-gray-300">
                  ดำเนินการ
                </th>
              </CanAccess>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200 dark:divide-gray-800 bg-white dark:bg-[#1e1f21]">
            {currentTeachers.map((teacher, index) => (
              <tr key={teacher.id} className="hover:bg-gray-50 dark:hover:bg-[#2a2b2f]/50 transition-colors">
<<<<<<< HEAD
                <td className="whitespace-nowrap px-2 py-3 text-xs text-gray-500 dark:text-gray-400 font-medium">{teacher.teacherId}</td>
=======
>>>>>>> 5f8c7e1 (feat: optimize auto-scheduler and update UI labels)
                <td className="whitespace-nowrap py-3 px-2 text-xs text-center font-medium text-gray-500 dark:text-gray-400">{indexOfFirstItem + index + 1}</td>
                <td className="whitespace-nowrap py-3 px-2 text-xs">
                  <Link to={`/school/${teacher.schoolId}/teachers/view/${teacher.id}`} className="flex items-center group">
                    <div className="h-8 w-8 flex-shrink-0">
                      <img
                        className="h-8 w-8 rounded-full object-cover"
                        src={teacher.profileImageUrl || `https://ui-avatars.com/api/?name=${teacher.firstName}+${teacher.lastName}&background=random`}
                        alt={`${teacher.firstName} ${teacher.lastName}`}
                      />
                    </div>
<<<<<<< HEAD
                    <div className="ml-3 font-medium text-gray-900 dark:text-gray-200 group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition-colors">
                      {`${teacher.title || ''}${teacher.firstName} ${teacher.lastName}`}
=======
                    <div className="ml-3">
                      <div className="font-medium text-gray-900 dark:text-gray-200 group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition-colors">
                        {`${teacher.title || ''}${teacher.firstName} ${teacher.lastName}`}
                      </div>
>>>>>>> 5f8c7e1 (feat: optimize auto-scheduler and update UI labels)
                    </div>
                  </Link>
                </td>
                <td className="hidden lg:table-cell whitespace-nowrap px-2 py-3 text-xs text-gray-500 dark:text-gray-400">{teacher.academicStanding || '-'}</td>
<<<<<<< HEAD
                <td className="hidden md:table-cell whitespace-nowrap px-2 py-3 text-xs text-gray-500 dark:text-gray-400">{teacher.department || '-'}</td>
                <td className="hidden xl:table-cell whitespace-nowrap px-2 py-3 text-xs text-gray-500 dark:text-gray-400">{teacher.contact}</td>
                <td className="whitespace-nowrap px-2 py-3 text-xs">
                  <span className="text-gray-500 dark:text-gray-400 font-mono text-[10px] tracking-wider">{teacher.rfid ? '••••••••' : 'ไม่มีข้อมูล'}</span>
                </td>
                <td className="whitespace-nowrap px-2 py-3 text-xs">
                    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium ${
                      teacher.status === 'ย้าย' ? 'bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-300' :
                      teacher.status === 'เกษียณ' ? 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-300' :
                      teacher.status === 'ลาศึกษาต่อ' ? 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300' :
                      teacher.status === 'ช่วยราชการ' ? 'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300' :
                      teacher.status === 'ออก' ? 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300' :
                      teacher.status === 'ถึงแก่กรรม' ? 'bg-black text-white' :
                      'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300'
                    }`}>
                      {teacher.status || 'อยู่'}
                    </span>
                  </td>
                  <CanAccess roles={ADMIN_ACCESS}>
=======
                <td className="whitespace-nowrap px-2 py-3 text-xs text-gray-500 dark:text-gray-400">{teacher.teacherId}</td>
                <td className="hidden md:table-cell whitespace-nowrap px-2 py-3 text-xs text-gray-500 dark:text-gray-400">{teacher.department || '-'}</td>
                <td className="hidden xl:table-cell whitespace-nowrap px-2 py-3 text-xs text-gray-500 dark:text-gray-400">{teacher.contact}</td>
                <td className="whitespace-nowrap px-2 py-3 text-xs">
                  {isBulkRfidMode ? (
                    <div className="flex items-center gap-2 w-full max-w-[150px]">
                      <input
                        type="text"
                        value={bulkRfidData[teacher.id] || ''}
                        onChange={(e) => setBulkRfidData(prev => ({ ...prev, [teacher.id]: e.target.value }))}
                        placeholder="สแกน..."
                        className="w-full bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg px-2 py-1 text-[10px] focus:outline-none focus:ring-1 focus:ring-indigo-500 transition"
                      />
                    </div>
                  ) : editingTeacherId === teacher.id ? (
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
                      <button onClick={handleSaveRfidForTeacher} disabled={isSavingRfid} className="text-green-500 hover:text-green-400"><FaCheck size={12} /></button>
                      <button onClick={handleCancelEditRfid} className="text-red-500 hover:text-red-400"><FaTimes size={12} /></button>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2 group">
                      <span className="text-gray-500 dark:text-gray-400 font-mono text-[10px] tracking-wider">{teacher.rfid ? '••••••••' : 'ไม่มีข้อมูล'}</span>
                      <CanAccess roles={ADMIN_ACCESS}>
                        <button onClick={() => handleStartEditRfid(teacher)} className="text-gray-400 opacity-0 group-hover:opacity-100 hover:text-indigo-400 transition-all" title="แก้ไข RFID">
                          <FaIdCard size={12} />
                        </button>
                      </CanAccess>
                    </div>
                  )}
                </td>
                <CanAccess roles={ADMIN_ACCESS}>
>>>>>>> 5f8c7e1 (feat: optimize auto-scheduler and update UI labels)
                  <td className="relative whitespace-nowrap py-3 pl-3 pr-4 text-right text-xs font-medium sm:pr-6">
                    <div className="flex justify-end items-center gap-x-3">
                      <Link to={`/school/${teacher.schoolId}/teachers/edit/${teacher.id}`} className="text-indigo-400 hover:text-indigo-300 transition-colors" title="แก้ไข">
                        <FaUserEdit size={14} />
                      </Link>
                      <button onClick={() => handleDelete(teacher)} className="text-red-500 hover:text-red-400 transition-colors" title="ลบ">
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
                แสดง {indexOfFirstItem + 1} ถึง {Math.min(indexOfLastItem, filteredTeachers.length)} จาก {filteredTeachers.length} รายการ
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
<<<<<<< HEAD
                <div className="flex items-center gap-4">
                  <BackButton to="/academic/hub/personnel_info" />
                  <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">ข้อมูลครูทั้งหมด</h1>
                </div>
=======
                <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">ข้อมูลครูทั้งหมด</h1>
>>>>>>> 5f8c7e1 (feat: optimize auto-scheduler and update UI labels)
                <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                  แสดง, จัดการ, และเพิ่มข้อมูลครูในระบบ
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
                  placeholder="ค้นหาชื่อ, รหัสครู..."
                  className="pl-9 pr-4 py-2 w-full bg-gray-50 dark:bg-[#1e1f21] border border-gray-200 dark:border-gray-700 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none transition-all text-xs text-gray-900 dark:text-white"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                />
              </div>

              <div className="flex flex-wrap gap-2 ml-auto">
                <CanAccess roles={ADMIN_ACCESS}>
<<<<<<< HEAD
                  <Link
                    to={schoolId ? `/school/${schoolId}/teachers/add` : '#'}
                    className="flex items-center justify-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-xl font-medium transition-all shadow-sm active:scale-95 text-xs whitespace-nowrap"
                  >
                    <FaPlus size={12} />
                    <span>เพิ่มครู</span>
                  </Link>
                  <Link
                    to={schoolId ? `/school/${schoolId}/map-rfid/teachers` : '#'}
                    className="flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-xl font-medium transition-all shadow-sm active:scale-95 text-xs whitespace-nowrap"
                  >
                    <FaIdCard size={12} />
                    <span>จับคู่ RFID</span>
                  </Link>
                  <Link
                    to={schoolId ? `/school/${schoolId}/teachers/quick-add` : '#'}
                    className="flex items-center justify-center gap-2 bg-amber-500 hover:bg-amber-600 text-white px-4 py-2 rounded-xl font-medium transition-all shadow-sm active:scale-95 text-xs whitespace-nowrap"
                  >
                    <FaUserPlus size={12} />
                    <span>เพิ่มด่วน</span>
                  </Link>
                  <Link
                    to={schoolId ? `/school/${schoolId}/teachers/import` : '#'}
                    className="flex items-center justify-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2 rounded-xl font-medium transition-all shadow-sm active:scale-95 text-xs whitespace-nowrap"
                  >
                    <FaFileExcel size={12} />
                    <span>นำเข้า Excel</span>
                  </Link>
                  <Link
                    to={schoolId ? `/school/${schoolId}/teachers/bulk-upload-images` : '#'}
                    className="hidden md:flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-xl font-medium transition-all shadow-sm active:scale-95 text-xs whitespace-nowrap"
                  >
                    <FaCloudUploadAlt size={14} />
                    <span>อัปโหลดรูป</span>
                  </Link>
=======
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
                        to={schoolId ? `/school/${schoolId}/teachers/add` : '#'}
                        className="flex items-center justify-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-xl font-medium transition-all shadow-sm active:scale-95 text-xs whitespace-nowrap"
                      >
                        <FaPlus size={12} />
                        <span>เพิ่มครู</span>
                      </Link>
                      <button
                        onClick={handleToggleBulkRfidMode}
                        className="flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-xl font-medium transition-all shadow-sm active:scale-95 text-xs whitespace-nowrap"
                      >
                        <FaIdCard size={12} />
                        <span>จับคู่ RFID</span>
                      </button>
                      <Link
                        to={schoolId ? `/school/${schoolId}/teachers/quick-add` : '#'}
                        className="flex items-center justify-center gap-2 bg-amber-500 hover:bg-amber-600 text-white px-4 py-2 rounded-xl font-medium transition-all shadow-sm active:scale-95 text-xs whitespace-nowrap"
                      >
                        <FaUserPlus size={12} />
                        <span>เพิ่มด่วน</span>
                      </Link>
                      <Link
                        to={schoolId ? `/school/${schoolId}/teachers/bulk-upload-images` : '#'}
                        className="hidden md:flex items-center justify-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2 rounded-xl font-medium transition-all shadow-sm active:scale-95 text-xs whitespace-nowrap"
                      >
                        <FaCloudUploadAlt size={14} />
                        <span>อัปโหลดรูป</span>
                      </Link>
                    </>
                  )}
>>>>>>> 5f8c7e1 (feat: optimize auto-scheduler and update UI labels)
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