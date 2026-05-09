import React, { useState, useEffect } from "react";
import { useSelector } from "react-redux";
import { firestore } from "@/firebase";
import { collection, query, where, getDocs, doc, getDoc } from "firebase/firestore";
import { RootState } from "../../store";
import Navbar from "../../components/Navbar/Navbar";
import LeftSidebar from "../../components/Sidebar/LeftSidebar";
import { FaUserClock, FaSearch, FaAngleLeft, FaAngleRight, FaAngleDoubleLeft, FaAngleDoubleRight } from "react-icons/fa";
import defaultProfile from "@/assets/profile.png";
import MainLayout from "@/layouts/MainLayout";
import BackButton from "@/components/Shared/BackButton";

interface AttendanceRecord {
  id: string;
  userId: string;
  fullName: string;
  profileUrl?: string;
  checkInTime?: string;
  checkOutTime?: string;
  status?: string;
  userType?: string;
}

const TeacherAttendanceTodayPage: React.FC = () => {
  const { user: currentUser } = useSelector((state: RootState) => state.auth);
  const schoolId = currentUser?.schoolId;

  const [attendanceData, setAttendanceData] = useState<AttendanceRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const [todayEvent, setTodayEvent] = useState<{ type: string; name: string } | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 20;

  useEffect(() => {
    const handleResize = () => {
      setIsMobile(window.innerWidth < 768);
    };
    handleResize();
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  const getTodayDateString = () => {
    const date = new Date();
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };

  useEffect(() => {
    const fetchAttendance = async () => {
      if (!schoolId) return;
      setLoading(true);
      try {
        const todayStr = getTodayDateString();
        
        // ตรวจสอบวันหยุดจากปฏิทินโรงเรียน
        const calendarRef = doc(firestore, "school-settings", schoolId, "main_calendar", "default");
        const calendarSnap = await getDoc(calendarRef);
        if (calendarSnap.exists()) {
          const calData = calendarSnap.data();
          if (calData.events && calData.events[todayStr]) {
            setTodayEvent(calData.events[todayStr]);
          } else {
            setTodayEvent(null);
          }
        }

        // 1. ดึงรายชื่อครูทั้งหมดจาก school-settings
        const teachersQuery = query(collection(firestore, "school-settings", schoolId, "teachers"));
        const teachersSnap = await getDocs(teachersQuery);
        
        const records: AttendanceRecord[] = [];
        
        // 2. ดึงข้อมูลการลงเวลาของครูแต่ละคนในวันนี้
        await Promise.all(teachersSnap.docs.map(async (teacherDoc) => {
          const teacherData = teacherDoc.data();
          const attendanceRef = doc(firestore, "school-settings", schoolId, "teachers", teacherDoc.id, "attendance", todayStr);
          const attendanceSnap = await getDoc(attendanceRef);

          let checkInTime = undefined;
          let checkOutTime = undefined;
          let status = undefined;

          if (attendanceSnap.exists()) {
            const attData = attendanceSnap.data();
            if (attData.checkinTime?.toDate) {
              checkInTime = attData.checkinTime.toDate().toLocaleTimeString("th-TH", { hour: '2-digit', minute: '2-digit' });
            }
            if (attData.checkoutTime?.toDate) {
              checkOutTime = attData.checkoutTime.toDate().toLocaleTimeString("th-TH", { hour: '2-digit', minute: '2-digit' });
            }
            status = attData.status === 'สาย' ? 'Late' : (attData.status === 'มา' ? 'OnTime' : attData.status);
          }

          records.push({
            id: teacherDoc.id,
            userId: teacherDoc.id,
            fullName: `${teacherData.title || ''}${teacherData.firstName} ${teacherData.lastName}`.trim(),
            profileUrl: teacherData.profileImageUrl,
            checkInTime,
            checkOutTime,
            status,
            userType: 'teacher'
          });
        }));

        // เรียงลำดับตามเวลาเข้า (มาก่อนขึ้นก่อน)
        records.sort((a, b) => {
            const timeA = a.checkInTime || "99:99";
            const timeB = b.checkInTime || "99:99";
            return timeA.localeCompare(timeB);
        });

        setAttendanceData(records);
      } catch (error) {
        console.error("Error fetching attendance:", error);
      } finally {
        setLoading(false);
      }
    };

    fetchAttendance();
  }, [schoolId]);

  const filteredData = attendanceData.filter(record => 
    record.fullName.toLowerCase().includes(searchTerm.toLowerCase())
  );

  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm]);

  const totalPages = Math.ceil(filteredData.length / itemsPerPage);
  const paginatedData = filteredData.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);

  const getPageNumbers = () => {
    const pages = [];
    const maxVisiblePages = 5;
    let startPage = Math.max(1, currentPage - Math.floor(maxVisiblePages / 2));
    let endPage = Math.min(totalPages, startPage + maxVisiblePages - 1);

    if (endPage - startPage + 1 < maxVisiblePages) {
      startPage = Math.max(1, endPage - maxVisiblePages + 1);
    }

    for (let i = startPage; i <= endPage; i++) {
      pages.push(i);
    }
    return pages;
  };

  return (
    <MainLayout>
      <div className="min-h-screen bg-gray-50 dark:bg-[#1e1f21] transition-colors duration-300 p-4 sm:p-6 lg:p-8">
        <div className="max-w-6xl mx-auto">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
                <div className="flex items-center gap-4">
                    <BackButton to="/academic/hub/personnel_info" />
                    <div>
                        <h1 className="text-2xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
                            <FaUserClock className="text-indigo-600 dark:text-indigo-400" />
                            ข้อมูลการลงเวลาครู (วันนี้)
                        </h1>
                        <div className="flex flex-col">
                            <p className="text-gray-500 dark:text-gray-400 text-sm mt-1">
                                ประจำวันที่ {new Date().toLocaleDateString('th-TH', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
                            </p>
                        {todayEvent && (todayEvent.type === 'holiday' || todayEvent.type === 'specialHoliday') && (
                            <p className="text-red-500 dark:text-red-400 text-sm font-semibold mt-1">
                                * วันนี้เป็น{todayEvent.name} ({todayEvent.type === 'holiday' ? 'วันหยุดราชการ' : 'วันหยุดกรณีพิเศษ'})
                            </p>
                        )}
                    </div>
                    </div>
                </div>
                
                <div className="relative w-full md:w-64">
                    <FaSearch className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                    <input 
                        type="text" 
                        placeholder="ค้นหาชื่อครู..." 
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className="pl-10 pr-4 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-[#2a2b2f] text-gray-900 dark:text-white focus:ring-2 focus:ring-indigo-500 outline-none w-full"
                    />
                </div>
            </div>

            <div className="bg-white dark:bg-[#2a2b2f] rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 overflow-hidden">
                <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse">
                        <thead>
                            <tr className="bg-gray-50 dark:bg-[#323338] border-b border-gray-200 dark:border-gray-700">
                                <th className="px-6 py-4 text-sm font-semibold text-gray-600 dark:text-gray-300">ชื่อ - นามสกุล</th>
                                <th className="px-6 py-4 text-sm font-semibold text-gray-600 dark:text-gray-300 text-center">เวลาเข้า</th>
                                <th className="px-6 py-4 text-sm font-semibold text-gray-600 dark:text-gray-300 text-center">เวลาออก</th>
                                <th className="px-6 py-4 text-sm font-semibold text-gray-600 dark:text-gray-300 text-center">สถานะ</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                            {loading ? (
                                <tr>
                                    <td colSpan={4} className="px-6 py-8 text-center text-gray-500 dark:text-gray-400">
                                        กำลังโหลดข้อมูล...
                                    </td>
                                </tr>
                            ) : filteredData.length === 0 ? (
                                <tr>
                                    <td colSpan={4} className="px-6 py-8 text-center text-gray-500 dark:text-gray-400">
                                        ไม่พบข้อมูลการลงเวลาในวันนี้
                                    </td>
                                </tr>
                            ) : (
                                paginatedData.map((record) => (
                                    <tr key={record.id} className="hover:bg-gray-50 dark:hover:bg-[#323338]/50 transition-colors">
                                        <td className="px-6 py-4">
                                            <div className="flex items-center gap-3">
                                                <img 
                                                    src={record.profileUrl || defaultProfile} 
                                                    alt={record.fullName}
                                                    className="w-10 h-10 rounded-full object-cover border border-gray-200 dark:border-gray-600"
                                                    onError={(e) => { e.currentTarget.src = defaultProfile; }}
                                                />
                                                <span className="font-medium text-gray-900 dark:text-white">{record.fullName}</span>
                                            </div>
                                        </td>
                                        <td className="px-6 py-4 text-center">
                                            {record.checkInTime ? (
                                                <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-medium bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400">
                                                    {record.checkInTime} น.
                                                </span>
                                            ) : (
                                                <span className="text-gray-400">-</span>
                                            )}
                                        </td>
                                        <td className="px-6 py-4 text-center">
                                            {record.checkOutTime ? (
                                                <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-medium bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400">
                                                    {record.checkOutTime} น.
                                                </span>
                                            ) : (
                                                <span className="text-gray-400">-</span>
                                            )}
                                        </td>
                                        <td className="px-6 py-4 text-center">
                                            {record.status === 'Late' ? (
                                                <span className="text-red-500 text-sm font-medium">สาย</span>
                                            ) : record.status === 'OnTime' ? (
                                                <span className="text-green-500 text-sm font-medium">ปกติ</span>
                                            ) : (
                                                <span className="text-gray-500 text-sm">-</span>
                                            )}
                                        </td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>

                {/* Pagination UI */}
                {!loading && totalPages > 1 && (
                    <div className="px-6 py-4 bg-gray-50 dark:bg-[#323338]/30 border-t border-gray-200 dark:border-gray-700 flex flex-col sm:flex-row items-center justify-between gap-4">
                        <div className="text-sm text-gray-500 dark:text-gray-400">
                            แสดง {((currentPage - 1) * itemsPerPage) + 1} ถึง {Math.min(currentPage * itemsPerPage, filteredData.length)} จาก {filteredData.length} รายการ
                        </div>
                        <div className="flex items-center gap-1">
                            <button 
                                onClick={() => setCurrentPage(1)}
                                disabled={currentPage === 1}
                                className="p-2 rounded-md hover:bg-gray-200 dark:hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors text-gray-600 dark:text-gray-300"
                                title="หน้าแรก"
                            >
                                <FaAngleDoubleLeft size={14} />
                            </button>
                            <button 
                                onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))}
                                disabled={currentPage === 1}
                                className="p-2 rounded-md hover:bg-gray-200 dark:hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors text-gray-600 dark:text-gray-300"
                                title="ย้อนกลับ"
                            >
                                <FaAngleLeft size={14} />
                            </button>
                            
                            <div className="flex items-center gap-1 mx-2">
                                {getPageNumbers().map(pageNum => (
                                    <button
                                        key={pageNum}
                                        onClick={() => setCurrentPage(pageNum)}
                                        className={`w-8 h-8 rounded-md text-sm font-medium transition-colors ${
                                            currentPage === pageNum 
                                            ? 'bg-indigo-600 text-white' 
                                            : 'hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-600 dark:text-gray-300'
                                        }`}
                                    >
                                        {pageNum}
                                    </button>
                                ))}
                            </div>

                            <button 
                                onClick={() => setCurrentPage(prev => Math.min(prev + 1, totalPages))}
                                disabled={currentPage === totalPages}
                                className="p-2 rounded-md hover:bg-gray-200 dark:hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors text-gray-600 dark:text-gray-300"
                                title="ถัดไป"
                            >
                                <FaAngleRight size={14} />
                            </button>
                            <button 
                                onClick={() => setCurrentPage(totalPages)}
                                disabled={currentPage === totalPages}
                                className="p-2 rounded-md hover:bg-gray-200 dark:hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors text-gray-600 dark:text-gray-300"
                                title="หน้าสุดท้าย"
                            >
                                <FaAngleDoubleRight size={14} />
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

export default TeacherAttendanceTodayPage;