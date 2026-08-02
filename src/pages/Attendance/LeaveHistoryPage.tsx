import React, { useEffect, useState } from 'react';
import { useSelector } from 'react-redux';
import { Link } from 'react-router-dom';
import { RootState } from '../../store';
import { firestore } from '@/firebase';
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
  limit,
} from 'firebase/firestore';
import { FaFilePdf, FaSearch, FaPhone, FaLine, FaFilter } from 'react-icons/fa';
import { pdf } from '@react-pdf/renderer';
import LeaveRequestPdfDocument from '@/components/Pdf/leave/LeaveRequestPdfDocument';
import MainLayout from "@/layouts/MainLayout";
import BackButton from "@/components/Shared/BackButton";
import ProfileAvatar from "@/components/Shared/ProfileAvatar";
import SkeletonLoader from '@/components/SkeletonLoader';
import { getThaiYear } from '@/utils/dateUtils';
import { useEffectiveSchoolId } from '@/hooks/useEffectiveSchool';

interface LeaveRequest {
  id: string;
  studentName: string;
  studentId?: string;
  studentDocId?: string;
  schoolDocId?: string;
  leaveType: 'ลากิจ' | 'ลาป่วย';
  startDate: Timestamp | string;
  endDate: Timestamp | string;
  returnDate?: Timestamp | string;
  reason: string;
  createdAt: Timestamp;
  profileImageUrl?: string;
  phoneNumber?: string;
  lineId?: string;
  classLevel?: string;
  room?: string;
}

const LeaveHistoryPageSkeleton: React.FC = () => {
  return (
    <div className="table-responsive bg-white dark:bg-[#2a2b2f] rounded-xl shadow-sm dark:shadow-none animate-pulse">
      <table className="w-full min-w-[600px] text-sm text-left">
        <thead>
          <tr className="border-b border-gray-200 dark:border-gray-600">
            <th className="px-4 py-3 w-16 text-center"><SkeletonLoader className="h-5 w-10 mx-auto rounded" /></th>
            <th className="px-4 py-3"><SkeletonLoader className="h-5 w-32 rounded" /></th>
            <th className="px-4 py-3"><SkeletonLoader className="h-5 w-16 rounded" /></th>
            <th className="px-4 py-3"><SkeletonLoader className="h-5 w-24 rounded" /></th>
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
              <td className="px-4 py-3"><SkeletonLoader className="h-5 w-16 rounded" /></td>
              <td className="px-4 py-3"><SkeletonLoader className="h-5 w-24 rounded" /></td>
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

const LeaveHistoryPage: React.FC = () => {
  const { user } = useSelector((state: RootState) => state.auth);
  const schoolId = useEffectiveSchoolId();
  const [data, setData] = useState<LeaveRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [exportingId, setExportingId] = useState<string | null>(null);
  const [selectedClass, setSelectedClass] = useState<string>('');

  /* ---------------- LOAD DATA ---------------- */
  /* ---------------- LOAD DATA ---------------- */
  const fetchLeaveHistory = async () => {
    if (!schoolId) return;
    setLoading(true);
    setError(null);
    try {
      // 📌 Fix: Query specific collection instead of collectionGroup to avoid composite index
      const q = query(
        collection(firestore, 'school-settings', schoolId, 'leave_summary'),
        // where('schoolDocId', '==', schoolId), // No longer needed
        orderBy('createdAt', 'desc'),
        limit(50) // ⚡ เพิ่มประสิทธิภาพ: จำกัดจำนวนการดึงข้อมูล
      );
      const snap = await getDocs(q);
      const leaveRequests = snap.docs.map(
        (d) => ({ id: d.id, ...d.data() } as LeaveRequest)
      );

      // ⚡ OPTIMIZATION: ดึงข้อมูลนักเรียนแบบ Parallel และป้องกัน N+1 Query
      // 1. รวบรวมรหัสนักเรียนที่ไม่ซ้ำกัน (Unique IDs)
      const uniqueStudentIds = Array.from(new Set(leaveRequests.map(r => r.studentDocId).filter(Boolean))) as string[];

      // 2. ดึงข้อมูลนักเรียนทุกคนพร้อมกัน (Parallel Fetching)
      // เราใช้ Promise.all เพื่อรอให้ดึงครบทุกคนก่อน
      const studentPromises = uniqueStudentIds.map(studentId =>
        getDoc(doc(firestore, "school-settings", schoolId, "students", studentId))
      );

      const studentSnapshots = await Promise.all(studentPromises);

      // 3. สร้าง Map สำหรับค้นหาข้อมูลนักเรียนอย่างรวดเร็ว (Lookup Map)
      const studentMap: Record<string, any> = {};
      studentSnapshots.forEach(snap => {
        if (snap.exists()) {
          studentMap[snap.id] = snap.data();
        }
      });

      // 4. นำข้อมูลนักเรียนมารวมกับรายการลา
      const enhancedData = leaveRequests.map(req => {
        if (req.studentDocId && studentMap[req.studentDocId]) {
          const sData = studentMap[req.studentDocId];
          return {
            ...req,
            profileImageUrl: sData.profileImageUrl,
            phoneNumber: sData.phoneNumber,
            lineId: sData.contact,
            classLevel: sData.classLevel,
            room: sData.room
          };
        }
        return req;
      });

      setData(enhancedData);
    } catch (err: any) {
      console.error("Error fetching leave history:", err);
      setError(err.message || "เกิดข้อผิดพลาดในการโหลดข้อมูล");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchLeaveHistory();
  }, [schoolId]);

  /* ---------------- DATE ---------------- */
  /* ---------------- DATE ---------------- */
  const thaiDate = (ts?: Timestamp | string) => {
    if (!ts) return '-';
    let date: Date;

    if (typeof ts === 'string') {
      date = new Date(ts);
    } else if (ts && typeof ts.toDate === 'function') {
      date = ts.toDate();
    } else {
      return '-';
    }

    return date.toLocaleDateString('th-TH', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    });
  };

  const today = (() => {
    const d = new Date();
    return {
      day: d.getDate(),
      month: d.toLocaleDateString('th-TH', { month: 'long' }),
      year: getThaiYear(d),
    };
  })();

  /* ---------------- EXPORT PDF ---------------- */
  const handleExportPdf = async (r: LeaveRequest) => {
    setExportingId(r.id);

    let guardianName = "........................................";
    let teacherName = "........................................";
    let schoolName = "........................................";
    let logoUrl = "/school-logo.png";

    if (schoolId) {
      try {
        const schoolDoc = await getDoc(doc(firestore, "school-settings", schoolId));
        if (schoolDoc.exists()) {
          const schoolData = schoolDoc.data();
          schoolName = schoolData.schoolName || schoolName;
          logoUrl = schoolData.logoUrl || logoUrl;
        }
      } catch (err) {
        console.error("Error fetching school name for PDF:", err);
      }
    }

    const targetSchoolId = r.schoolDocId || schoolId;

    if (targetSchoolId && r.studentDocId) {
      try {
        const studentRef = doc(firestore, "school-settings", targetSchoolId, "students", r.studentDocId);
        const studentSnap = await getDoc(studentRef);

        if (studentSnap.exists()) {
          const sData = studentSnap.data();
          if (sData.guardianFirstName) {
            const gTitle = (sData.guardianTitle || "").trim();
            const gFirst = (sData.guardianFirstName || "").trim();
            const gLast = (sData.guardianLastName || "").trim();

            // ป้องกันคำนำหน้าซ้ำซ้อน
            const commonTitles = ["นาย", "นาง", "นางสาว", "ด.ช.", "ด.ญ.", "น.ส.", "สามเณร", "พระ", "พระสามเณร", "พระมหา", "พระครู", "พระใบฎีกา", "หลวงพ่อ", "พระอาจารย์"];
            const startsWithTitle = commonTitles.some(t => gFirst.startsWith(t)) || (gTitle && gFirst.startsWith(gTitle));

            if (startsWithTitle) {
              guardianName = `${gFirst} ${gLast}`.trim();
            } else {
              const titlePart = gTitle ? `${gTitle} ` : "";
              guardianName = `${titlePart}${gFirst} ${gLast}`.trim();
            }
          } else if (sData.guardian) {
            guardianName = sData.guardian;
          }

          const gradesToCheck = [];
          if (sData.classLevel) gradesToCheck.push(sData.classLevel);
          if (sData.classLevel && sData.room) gradesToCheck.push(`${sData.classLevel}/${sData.room}`);

          if (gradesToCheck.length > 0) {
            const teachersRef = collection(firestore, "school-settings", targetSchoolId, "teachers");
            const q = query(
              teachersRef,
              where("isHomeroomTeacher", "==", true),
              where("homeroomGrade", "in", gradesToCheck)
            );
            const tSnap = await getDocs(q);
            if (!tSnap.empty) {
              const teachers = tSnap.docs.map(d => {
                const t = d.data();
                return `${t.title || ''}${t.firstName} ${t.lastName}`;
              });
              teacherName = teachers[Math.floor(Math.random() * teachers.length)];
            }
          }
        }
      } catch (err) {
        console.error("Error fetching PDF details:", err);
      }
    }

    try {
      const dataForPdf = {
        studentName: r.studentName,
        studentId: r.studentId,
        leaveType: r.leaveType,
        reason: r.reason,
        startDate: thaiDate(r.startDate),
        endDate: thaiDate(r.endDate),
        returnDate: thaiDate(r.returnDate),
        guardianName: guardianName,
        teacherName: teacherName,
        schoolName: schoolName,
        logoUrl: logoUrl,
      };

      const docToRender = <LeaveRequestPdfDocument data={dataForPdf} today={today} />;
      const blob = await pdf(docToRender).toBlob();
      const url = URL.createObjectURL(blob);

      const link = document.createElement('a');
      link.href = url;
      link.download = `ใบลา-${r.studentName}.pdf`;
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

  const availableClasses = Array.from(new Set(data.map(r => r.classLevel && r.room ? `${r.classLevel}/${r.room}` : '').filter(Boolean))).sort();

  const filteredData = data.filter(r => {
    const matchesSearch = r.studentName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      r.leaveType.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesClass = selectedClass === '' || `${r.classLevel}/${r.room}` === selectedClass;
    return matchesSearch && matchesClass;
  });

  /* ---------------- RENDER ---------------- */
  return (
    <MainLayout>
      <div className="p-6 text-gray-900 dark:text-white transition-colors duration-300">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-6 gap-4">
          <div className="flex items-center gap-4">
            <BackButton />
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white">ประวัติการลา</h1>
          </div>
          <div className="flex flex-col sm:flex-row gap-3 w-full md:w-auto">
            <div className="relative min-w-[150px]">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                <FaFilter className="text-gray-400" />
              </div>
              <select
                value={selectedClass}
                onChange={(e) => setSelectedClass(e.target.value)}
                className="pl-10 pr-8 py-2.5 w-full bg-white dark:bg-[#2a2b2f] border border-gray-200 dark:border-gray-700 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none transition-all shadow-sm text-sm text-gray-900 dark:text-white appearance-none cursor-pointer"
              >
                <option value="">ทุกห้อง</option>
                {availableClasses.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div className="relative w-full md:w-64">
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
        </div>

        {loading && <LeaveHistoryPageSkeleton />}

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
                  <th className="px-4 py-3 font-semibold text-gray-600 dark:text-gray-300">ชื่อ-นามสกุลนักเรียน</th>
                  <th className="px-4 py-3 font-semibold text-gray-600 dark:text-gray-300">ชั้น/ห้อง</th>
                  <th className="px-4 py-3 font-semibold text-gray-600 dark:text-gray-300">การติดต่อ</th>
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
                      {(r.schoolDocId || schoolId) && r.studentDocId ? (
                        <Link to={`/school/${r.schoolDocId || schoolId}/students/view/${r.studentDocId}`} className="flex items-center gap-3 group">
                          <ProfileAvatar
                            src={r.profileImageUrl || `https://ui-avatars.com/api/?name=${r.studentName}&background=random`}
                            alt={r.studentName}
                            className="w-8 h-8"
                          />
                          <span className="text-gray-900 dark:text-white group-hover:text-indigo-600 transition-colors font-medium">{r.studentName}</span>
                        </Link>
                      ) : (
                        <div className="flex items-center gap-3">
                          <ProfileAvatar src={r.profileImageUrl || `https://ui-avatars.com/api/?name=${r.studentName}&background=random`} alt={r.studentName} className="w-8 h-8" />
                          <span>{r.studentName}</span>
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3 text-gray-600 dark:text-gray-400">{r.classLevel && r.room ? `${r.classLevel}/${r.room}` : '-'}</td>
                    <td className="px-4 py-3 text-gray-600 dark:text-gray-400">
                      <div className="flex flex-col gap-1 text-sm">
                        {r.phoneNumber && (
                          <div className="flex items-center gap-2">
                            <FaPhone className="text-gray-400" size={12} />
                            <span>{r.phoneNumber}</span>
                          </div>
                        )}
                        {r.lineId && (
                          <div className="flex items-center gap-2">
                            <FaLine className="text-green-500" size={12} />
                            <span>{r.lineId}</span>
                          </div>
                        )}
                        {!r.phoneNumber && !r.lineId && <span className="text-gray-400">-</span>}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-gray-600 dark:text-gray-400">{r.leaveType}</td>
                    <td className="px-4 py-3 text-gray-600 dark:text-gray-400">{thaiDate(r.startDate)}</td>
                    <td className="px-4 py-3 text-gray-600 dark:text-gray-400">{thaiDate(r.endDate)}</td>
                    <td className="text-center px-4 py-3">
                      <button
                        onClick={() => handleExportPdf(r)}
                        disabled={exportingId === r.id}
                        className="text-red-500 hover:text-red-400 disabled:text-gray-500 disabled:cursor-wait"
                        title="ส่งออกเป็น PDF"
                        aria-label={`ส่งออก PDF ใบลาของ ${r.studentName}`}
                      >
                        <FaFilePdf aria-hidden="true" />
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

export default LeaveHistoryPage;
