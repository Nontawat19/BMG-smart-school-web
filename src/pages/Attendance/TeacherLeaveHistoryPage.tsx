import React, { useEffect, useState } from 'react';
import { useSelector } from 'react-redux';
import { Link } from 'react-router-dom';
import { firestore } from '@/firebase';
import { RootState } from '../../store';
import {
  collection,
  getDocs,
  orderBy,
  query,
  where,
  collectionGroup,
  Timestamp,
  doc,
  getDoc,
} from 'firebase/firestore';
import { FaFilePdf, FaSearch } from 'react-icons/fa';
import { pdf } from '@react-pdf/renderer';
import TeacherLeaveRequestPdfDocument from '@/components/Pdf/leave/TeacherLeaveRequestPdfDocument';
import MainLayout from "@/layouts/MainLayout";
import SkeletonLoader from '@/components/SkeletonLoader';
import BackButton from '@/components/Shared/BackButton';

interface TeacherLeaveRequest {
  id: string;
  teacherName: string;
  teacherId?: string;
  teacherDocId?: string;
  schoolId?: string;
  leaveType: string;
  startDate: Timestamp;
  endDate: Timestamp;
  returnDate?: Timestamp;
  reason: string;
  createdAt: Timestamp;
  profileImageUrl?: string;
}

const TeacherLeaveHistoryPageSkeleton: React.FC = () => {
  return (
    <div className="table-responsive bg-white dark:bg-[#2a2b2f] rounded-xl shadow-sm dark:shadow-none animate-pulse">
      <table className="w-full min-w-[600px] text-sm text-left">
        <thead>
          <tr className="border-b border-gray-200 dark:border-gray-600">
            <th className="px-4 py-3 w-16 text-center"><SkeletonLoader className="h-5 w-10 mx-auto rounded" /></th>
            <th className="px-4 py-3"><SkeletonLoader className="h-5 w-32 rounded" /></th>
            <th className="px-4 py-3"><SkeletonLoader className="h-5 w-24 rounded" /></th>
            <th className="px-4 py-3"><SkeletonLoader className="h-5 w-28 rounded" /></th>
            <th className="px-4 py-3"><SkeletonLoader className="h-5 w-28 rounded" /></th>
            <th className="px-4 py-3 text-center"><SkeletonLoader className="h-5 w-16 mx-auto rounded" /></th>
          </tr>
        </thead>
        <tbody>
          {[...Array(8)].map((_, i) => (
            <tr key={i} className="border-b border-gray-200 dark:border-gray-700">
              <td className="px-4 py-3 text-center"><SkeletonLoader className="h-5 w-5 mx-auto rounded" /></td>
              <td className="px-4 py-3">
                <div className="flex items-center gap-3">
                  <SkeletonLoader className="h-8 w-8 rounded-full" />
                  <SkeletonLoader className="h-5 w-32 rounded" />
                </div>
              </td>
              <td className="px-4 py-3"><SkeletonLoader className="h-5 w-20 rounded" /></td>
              <td className="px-4 py-3"><SkeletonLoader className="h-5 w-32 rounded" /></td>
              <td className="px-4 py-3"><SkeletonLoader className="h-5 w-32 rounded" /></td>
              <td className="text-center px-4 py-3">
                <div className="flex justify-center">
                  <SkeletonLoader className="h-6 w-6 rounded-md" />
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

const TeacherLeaveHistoryPage: React.FC = () => {
  const { user } = useSelector((state: RootState) => state.auth);
  const schoolId = user?.schoolId;
  const [data, setData] = useState<TeacherLeaveRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [exportingId, setExportingId] = useState<string | null>(null);

  /* ---------------- LOAD DATA ---------------- */
  const fetchLeaveHistory = async () => {
    if (!schoolId) return;
    setLoading(true);
    setError(null);
    try {
      // 📌 วิธีใหม่: ดึงข้อมูลครูทุกคนก่อน แล้วค่อยดึงประวัติการลาของแต่ละคน
      // วิธีนี้ช่วยแก้ปัญหาเรื่อง Index ของ Firestore ที่ซับซ้อน และรับรองว่าข้อมูลแสดงผลแน่นอน
      const teachersRef = collection(firestore, 'school-settings', schoolId, 'teachers');
      const teachersSnap = await getDocs(teachersRef);

      const promises = teachersSnap.docs.map(async (teacherDoc) => {
        const teacherData = teacherDoc.data();
        const leavesRef = collection(firestore, 'school-settings', schoolId, 'teachers', teacherDoc.id, 'leave_summary');
        // Query ในระดับ Subcollection (มี Index อัตโนมัติอยู่แล้ว ไม่ต้องสร้างเพิ่ม)
        const q = query(leavesRef, orderBy('startDate', 'desc'));
        const leavesSnap = await getDocs(q);

        return leavesSnap.docs.map(doc => ({
          id: doc.id,
          ...doc.data(),
          // ใช้รูปภาพจากข้อมูลครูเลย
          profileImageUrl: teacherData.profileImageUrl
        } as TeacherLeaveRequest));
      });

      const results = await Promise.all(promises);
      const leaveRequests = results.flat();

      // เรียงลำดับข้อมูลทั้งหมดตามวันที่ล่าสุดอีกครั้ง (Client-side sort)
      leaveRequests.sort((a, b) => b.startDate.toMillis() - a.startDate.toMillis());

      setData(leaveRequests);
    } catch (err: any) {
      console.error("Error fetching teacher leave history:", err);
      setError(err.message || "เกิดข้อผิดพลาดในการโหลดข้อมูล");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchLeaveHistory();
  }, [schoolId]);

  /* ---------------- DATE ---------------- */
  const thaiDate = (ts?: Timestamp) =>
    ts
      ? ts.toDate().toLocaleDateString('th-TH', {
        day: 'numeric',
        month: 'long',
        year: 'numeric',
      })
      : '-';

  const today = (() => {
    const d = new Date();
    return {
      day: d.getDate(),
      month: d.toLocaleDateString('th-TH', { month: 'long' }),
      year: d.getFullYear() + 543,
    };
  })();

  /* ---------------- EXPORT PDF ---------------- */
  const handleExportPdf = async (r: TeacherLeaveRequest) => {
    setExportingId(r.id);

    let schoolName = "........................................";
    let directorName = "........................................";
    let logoUrl = "/school-logo.png";

    if (schoolId) {
      try {
        const schoolDoc = await getDoc(doc(firestore, "school-settings", schoolId));
        if (schoolDoc.exists()) {
          const data = schoolDoc.data();
          schoolName = data.schoolName || schoolName;
          logoUrl = data.logoUrl || logoUrl;
          if (data.directorName) directorName = data.directorName;
        }
      } catch (err) {
        console.error("Error fetching school info:", err);
      }
    }

    try {
      const dataForPdf = {
        teacherName: r.teacherName,
        leaveType: r.leaveType,
        reason: r.reason,
        startDate: thaiDate(r.startDate),
        endDate: thaiDate(r.endDate),
        returnDate: thaiDate(r.returnDate),
        schoolName: schoolName,
        directorName: directorName,
        logoUrl: logoUrl,
      };

      const docToRender = <TeacherLeaveRequestPdfDocument data={dataForPdf} today={today} />;
      const blob = await pdf(docToRender).toBlob();
      const url = URL.createObjectURL(blob);

      const link = document.createElement('a');
      link.href = url;
      link.download = `ใบลา-${r.teacherName}.pdf`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } catch (error) {
      console.error("Failed to generate PDF:", error);
    } finally {
      setExportingId(null);
    }
  };

  const filteredData = data.filter(r =>
    r.teacherName.toLowerCase().includes(searchTerm.toLowerCase()) ||
    r.leaveType.toLowerCase().includes(searchTerm.toLowerCase())
  );

  /* ---------------- RENDER ---------------- */
  return (
    <MainLayout>
      <div className="p-6 text-gray-900 dark:text-white transition-colors duration-300">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-6 gap-4">
          <div className="flex items-center gap-4">
            <BackButton />
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white">ประวัติการลา (ครูและบุคลากร)</h1>
          </div>
          <div className="relative w-full md:w-72">
            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
              <FaSearch className="text-gray-400" />
            </div>
            <input
              type="text"
              placeholder="ค้นหาชื่อ, ประเภทการลา..."
              className="pl-10 pr-4 py-2.5 w-full bg-white dark:bg-[#2a2b2f] border border-gray-200 dark:border-gray-700 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none transition-all shadow-sm text-sm text-gray-900 dark:text-white placeholder-gray-400"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
        </div>

        {loading && <TeacherLeaveHistoryPageSkeleton />}

        {error && (
          <div className="p-4 mb-4 text-sm text-red-800 rounded-lg bg-red-50 dark:bg-red-900/20 dark:text-red-400 border border-red-200 dark:border-red-800 flex flex-col sm:flex-row justify-between items-center gap-4">
            <div>
              <span className="font-bold">เกิดข้อผิดพลาด:</span> {error.includes("requires an index") ? "ระบบต้องการ Index สำหรับการค้นหานี้ กรุณาเปิด Console (F12) แล้วคลิกลิงก์ที่ Firebase แจ้งเตือนเพื่อสร้าง Index" : error}
            </div>
            <button
              onClick={fetchLeaveHistory}
              className="px-4 py-2 bg-red-100 hover:bg-red-200 dark:bg-red-800 dark:hover:bg-red-700 text-red-800 dark:text-red-100 rounded-lg transition-colors whitespace-nowrap"
            >
              ลองใหม่
            </button>
          </div>
        )}

        {!loading && !error && (
          <div className="table-responsive bg-white dark:bg-[#2a2b2f] rounded-xl shadow-sm dark:shadow-none">
            <table className="w-full min-w-[600px] text-sm text-left">
              <thead>
                <tr className="border-b border-gray-200 dark:border-gray-600">
                  <th className="px-4 py-3 font-semibold text-gray-600 dark:text-gray-300 w-16 text-center">ลำดับ</th>
                  <th className="px-4 py-3 font-semibold text-gray-600 dark:text-gray-300">ชื่อ-สกุล</th>
                  <th className="px-4 py-3 font-semibold text-gray-600 dark:text-gray-300">ประเภทการลา</th>
                  <th className="px-4 py-3 font-semibold text-gray-600 dark:text-gray-300">วันที่เริ่มลา</th>
                  <th className="px-4 py-3 font-semibold text-gray-600 dark:text-gray-300">วันที่สิ้นสุด</th>
                  <th className="px-4 py-3 font-semibold text-gray-600 dark:text-gray-300 text-center">ส่งออก</th>
                </tr>
              </thead>
              <tbody>
                {filteredData.map((r, index) => (
                  <tr key={r.id} className="border-b border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-white/5">
                    <td className="px-4 py-3 text-gray-600 dark:text-gray-400 text-center">{index + 1}</td>
                    <td className="px-4 py-3 text-gray-900 dark:text-white">
                      {r.schoolId && r.teacherDocId ? (
                        <Link to={`/school/${r.schoolId}/teachers/view/${r.teacherDocId}`} className="flex items-center gap-3 group">
                          <img
                            src={r.profileImageUrl || `https://ui-avatars.com/api/?name=${r.teacherName}&background=random`}
                            alt={r.teacherName}
                            className="w-8 h-8 rounded-full object-cover"
                          />
                          <span className="group-hover:text-indigo-500 dark:group-hover:text-indigo-400 transition-colors">{r.teacherName}</span>
                        </Link>
                      ) : (
                        <div className="flex items-center gap-3">
                          <img src={r.profileImageUrl || `https://ui-avatars.com/api/?name=${r.teacherName}&background=random`} alt={r.teacherName} className="w-8 h-8 rounded-full object-cover" />
                          <span>{r.teacherName}</span>
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3 text-gray-600 dark:text-gray-400">{r.leaveType}</td>
                    <td className="px-4 py-3 text-gray-600 dark:text-gray-400">{thaiDate(r.startDate)}</td>
                    <td className="px-4 py-3 text-gray-600 dark:text-gray-400">{thaiDate(r.endDate)}</td>
                    <td className="text-center px-4 py-3">
                      <button
                        onClick={() => handleExportPdf(r)}
                        disabled={exportingId === r.id}
                        className="text-red-400 hover:text-red-300 disabled:text-gray-500 disabled:cursor-wait"
                        title="ส่งออกเป็น PDF"
                      >
                        <FaFilePdf />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </MainLayout>
  );
};

export default TeacherLeaveHistoryPage;