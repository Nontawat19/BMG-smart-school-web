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
  updateDoc,
  limit,
} from 'firebase/firestore';
import { FaFilePdf, FaSearch, FaEdit } from 'react-icons/fa';
import { pdf } from '@react-pdf/renderer';
import Swal from 'sweetalert2';
import TeacherLeaveRequestPdfDocument from '@/components/Pdf/leave/TeacherLeaveRequestPdfDocument';
import MainLayout from "@/layouts/MainLayout";
import SkeletonLoader from '@/components/SkeletonLoader';
import BackButton from '@/components/Shared/BackButton';
import ProfileAvatar from '@/components/Shared/ProfileAvatar';
import { getThaiYear } from '@/utils/dateUtils';
import { useEffectiveSchoolId } from '@/hooks/useEffectiveSchool';
import { getGroupPersonnel } from '@/utils/schoolUtils';
import { usePermissions } from '@/hooks/usePermissions';
import { ROLES } from '@/constants/roles';

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
  status?: 'approved' | 'rejected' | 'pending';
  docPath?: string;
}

const LEAVE_TYPE_OPTIONS = [
  'ลาป่วย', 'ลากิจ', 'ลากิจกรรม', 'ลาพักร้อน', 'ลาอุปสมบท', 'ลาฌาปนกิจ',
  'ลาฝึกอบรม', 'ลาสัมมนา', 'ลาคลอดบุตร', 'ไปราชการ', 'ลาประกอบพิธีฮัจย์',
  'ลาเข้ารับการระดมพล', 'ลาปฏิบัติงานในองค์กรระหว่างประเทศ', 'ลาไปช่วยภรรยาที่คลอดบุตร',
];

// yyyy-mm-dd ตามเวลาท้องถิ่น (ห้ามใช้ toISOString ตรงๆ เพราะเป็น UTC อาจได้วันที่คลาดเคลื่อนไป 1 วัน)
const tsToInputDate = (ts?: Timestamp) => {
  if (!ts) return '';
  const d = ts.toDate();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

const inputDateToTimestamp = (value: string) => {
  const [y, m, d] = value.split('-').map(Number);
  return Timestamp.fromDate(new Date(y, m - 1, d));
};

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
  const schoolId = useEffectiveSchoolId();
  const { isSuperAdmin, isSchoolAdmin, hasRole } = usePermissions();
  // "ฝ่ายงานบุคคล" ในระบบนี้ไม่มี role แยกเฉพาะ ใช้ role ชุดเดียวกับที่คุมสิทธิ์เข้าหน้า /attendance/leave-approval
  // (TEACHER_ATTENDANCE/SCHOOL_ATTENDANCE) ตามที่ routeRegistry.ts กำหนดไว้เป็น "ฝ่ายบุคคล" อยู่แล้ว
  const isHR = hasRole([ROLES.TEACHER_ATTENDANCE, ROLES.SCHOOL_ATTENDANCE]);
  const [data, setData] = useState<TeacherLeaveRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [exportingId, setExportingId] = useState<string | null>(null);
  const [ownTeacherDocId, setOwnTeacherDocId] = useState<string | null>(null);

  // แก้ไขรายการลาได้เอง — หา teacherDocId ของผู้ใช้ที่ล็อกอินอยู่ (เจ้าตัวครูที่ลา) เทียบกับ teacherDocId
  // ของแต่ละรายการ เพราะเอกสารการลาไม่ได้เก็บ uid ของผู้ยื่นไว้โดยตรง
  useEffect(() => {
    if (!schoolId || !user?.uid) return;
    (async () => {
      try {
        const byUidSnap = await getDocs(query(
          collection(firestore, 'school-settings', schoolId, 'teachers'),
          where('uid', '==', user.uid),
          limit(1)
        ));
        if (!byUidSnap.empty) { setOwnTeacherDocId(byUidSnap.docs[0].id); return; }
        const directSnap = await getDoc(doc(firestore, 'school-settings', schoolId, 'teachers', user.uid));
        if (directSnap.exists()) setOwnTeacherDocId(directSnap.id);
      } catch (err) {
        console.error('Error resolving own teacher doc id:', err);
      }
    })();
  }, [schoolId, user?.uid]);

  const canEdit = (r: TeacherLeaveRequest) =>
    isSuperAdmin || isSchoolAdmin || isHR || (!!ownTeacherDocId && !!r.teacherDocId && ownTeacherDocId === r.teacherDocId);

  // ── แก้ไขรายการลา (กรณีลงวันที่ผิด) ──
  const [editingRow, setEditingRow] = useState<TeacherLeaveRequest | null>(null);
  const [editLeaveType, setEditLeaveType] = useState('');
  const [editStartDate, setEditStartDate] = useState('');
  const [editEndDate, setEditEndDate] = useState('');
  const [editReason, setEditReason] = useState('');
  const [savingEdit, setSavingEdit] = useState(false);

  const openEditModal = (r: TeacherLeaveRequest) => {
    setEditingRow(r);
    setEditLeaveType(r.leaveType);
    setEditStartDate(tsToInputDate(r.startDate));
    setEditEndDate(tsToInputDate(r.endDate));
    setEditReason(r.reason || '');
  };

  const closeEditModal = () => {
    if (savingEdit) return;
    setEditingRow(null);
  };

  const handleSaveEdit = async () => {
    if (!editingRow || !editingRow.docPath) return;
    if (!editStartDate || !editEndDate) {
      Swal.fire({ icon: 'warning', title: 'กรอกไม่ครบ', text: 'กรุณาระบุวันที่เริ่มลาและวันที่สิ้นสุด' });
      return;
    }
    if (editEndDate < editStartDate) {
      Swal.fire({ icon: 'warning', title: 'วันที่ไม่ถูกต้อง', text: 'วันที่สิ้นสุดต้องไม่ก่อนวันที่เริ่มลา' });
      return;
    }
    setSavingEdit(true);
    try {
      await updateDoc(doc(firestore, editingRow.docPath), {
        leaveType: editLeaveType,
        startDate: inputDateToTimestamp(editStartDate),
        endDate: inputDateToTimestamp(editEndDate),
        reason: editReason,
        updatedAt: Timestamp.now(),
        updatedBy: user?.uid || '',
      });
      Swal.fire({ icon: 'success', title: 'บันทึกการแก้ไขสำเร็จ', timer: 1500, showConfirmButton: false });
      setEditingRow(null);
      await fetchLeaveHistory();
    } catch (err) {
      console.error('Error updating leave record:', err);
      Swal.fire({ icon: 'error', title: 'ผิดพลาด', text: 'ไม่สามารถบันทึกการแก้ไขได้' });
    } finally {
      setSavingEdit(false);
    }
  };

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

        return leavesSnap.docs.map(leaveDoc => ({
          id: leaveDoc.id,
          ...leaveDoc.data(),
          // ใช้รูปภาพจากข้อมูลครูเลย
          profileImageUrl: teacherData.profileImageUrl,
          docPath: leaveDoc.ref.path,
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
      year: getThaiYear(d),
    };
  })();

  /* ---------------- EXPORT PDF ---------------- */
  const handleExportPdf = async (r: TeacherLeaveRequest) => {
    setExportingId(r.id);

    let schoolName = "........................................";
    let directorName = "........................................";
    let supervisorName = "";
    let supervisorLabel = "";
    let logoUrl = "/school-logo.png";

    if (schoolId) {
      try {
        const schoolDoc = await getDoc(doc(firestore, "school-settings", schoolId));
        if (schoolDoc.exists()) {
          const data = schoolDoc.data();
          schoolName = data.schoolName || schoolName;
          logoUrl = data.logoUrl || logoUrl;
          const directorFullName = [data.directorPrefix, data.directorName].filter(Boolean).join(' ');
          if (directorFullName) directorName = directorFullName;
          const supervisorPersonnel = getGroupPersonnel(data, 'personnel');
          supervisorName = supervisorPersonnel.name;
          supervisorLabel = supervisorPersonnel.label;
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
        supervisorName: supervisorName,
        supervisorLabel: supervisorLabel,
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
                  <th className="px-4 py-3 font-semibold text-gray-600 dark:text-gray-300 text-center">สถานะ</th>
                  <th className="px-4 py-3 font-semibold text-gray-600 dark:text-gray-300 text-center">ส่งออก</th>
                  <th className="px-4 py-3 font-semibold text-gray-600 dark:text-gray-300 text-center">แก้ไข</th>
                </tr>
              </thead>
              <tbody>
                {filteredData.map((r, index) => (
                  <tr key={r.id} className="border-b border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-white/5">
                    <td className="px-4 py-3 text-gray-600 dark:text-gray-400 text-center">{index + 1}</td>
                    <td className="px-4 py-3 text-gray-900 dark:text-white">
                      {r.schoolId && r.teacherDocId ? (
                        <Link to={`/school/${r.schoolId}/teachers/view/${r.teacherDocId}`} className="flex items-center gap-3 group">
                          <ProfileAvatar
                            src={r.profileImageUrl || `https://ui-avatars.com/api/?name=${r.teacherName}&background=random`}
                            alt={r.teacherName}
                            className="w-8 h-8"
                          />
                          <span className="text-gray-900 dark:text-white group-hover:text-indigo-500 dark:group-hover:text-indigo-400 transition-colors">{r.teacherName}</span>
                        </Link>
                      ) : (
                        <div className="flex items-center gap-3">
                          <ProfileAvatar src={r.profileImageUrl || `https://ui-avatars.com/api/?name=${r.teacherName}&background=random`} alt={r.teacherName} className="w-8 h-8" />
                          <span className="text-gray-900 dark:text-white">{r.teacherName}</span>
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3 text-gray-600 dark:text-gray-400">{r.leaveType}</td>
                    <td className="px-4 py-3 text-gray-600 dark:text-gray-400">{thaiDate(r.startDate)}</td>
                    <td className="px-4 py-3 text-gray-600 dark:text-gray-400">{thaiDate(r.endDate)}</td>
                    <td className="px-4 py-3 text-center">
                      <span className={`px-2.5 py-1 inline-flex text-xs leading-5 font-semibold rounded-full 
                        ${r.status === 'approved' ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' :
                          r.status === 'rejected' ? 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400' :
                          'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400'}`}>
                        {r.status === 'approved' ? 'อนุมัติ' : r.status === 'rejected' ? 'ไม่อนุมัติ' : 'รอพิจารณา'}
                      </span>
                    </td>
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
                    <td className="text-center px-4 py-3">
                      {canEdit(r) ? (
                        <button
                          onClick={() => openEditModal(r)}
                          className="text-indigo-500 hover:text-indigo-400"
                          title="แก้ไขวันที่/รายละเอียดการลา"
                        >
                          <FaEdit />
                        </button>
                      ) : (
                        <span className="text-gray-300 dark:text-gray-600">-</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {editingRow && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
          onClick={closeEditModal}
        >
          <div
            className="w-full max-w-md rounded-2xl bg-white dark:bg-[#1e1f23] shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="border-b border-gray-100 dark:border-gray-800 px-5 py-4">
              <h2 className="text-base font-bold text-gray-900 dark:text-white">แก้ไขรายการลา</h2>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{editingRow.teacherName}</p>
            </div>
            <div className="px-5 py-4 space-y-4">
              <div>
                <label className="block text-xs font-bold text-gray-600 dark:text-gray-300 mb-1.5">ประเภทการลา</label>
                <select
                  value={editLeaveType}
                  onChange={(e) => setEditLeaveType(e.target.value)}
                  className="w-full h-10 px-3 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-[#151619] text-sm font-bold outline-none focus:ring-2 focus:ring-indigo-500"
                >
                  {LEAVE_TYPE_OPTIONS.map(t => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-gray-600 dark:text-gray-300 mb-1.5">วันที่เริ่มลา</label>
                  <input
                    type="date"
                    value={editStartDate}
                    onChange={(e) => setEditStartDate(e.target.value)}
                    className="w-full h-10 px-3 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-[#151619] text-sm font-bold outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-600 dark:text-gray-300 mb-1.5">วันที่สิ้นสุด</label>
                  <input
                    type="date"
                    value={editEndDate}
                    onChange={(e) => setEditEndDate(e.target.value)}
                    className="w-full h-10 px-3 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-[#151619] text-sm font-bold outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
              </div>
              <div>
                <label className="block text-xs font-bold text-gray-600 dark:text-gray-300 mb-1.5">เหตุผล</label>
                <textarea
                  value={editReason}
                  onChange={(e) => setEditReason(e.target.value)}
                  rows={3}
                  className="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-[#151619] text-sm outline-none focus:ring-2 focus:ring-indigo-500 resize-none"
                />
              </div>
            </div>
            <div className="flex items-center justify-end gap-2 border-t border-gray-100 dark:border-gray-800 px-5 py-4">
              <button
                onClick={closeEditModal}
                disabled={savingEdit}
                className="h-10 px-4 rounded-lg border border-gray-200 dark:border-gray-700 text-sm font-bold text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 disabled:opacity-50"
              >
                ยกเลิก
              </button>
              <button
                onClick={handleSaveEdit}
                disabled={savingEdit}
                className="h-10 px-4 rounded-lg bg-indigo-600 text-white text-sm font-bold hover:bg-indigo-700 disabled:opacity-50"
              >
                {savingEdit ? 'กำลังบันทึก...' : 'บันทึกการแก้ไข'}
              </button>
            </div>
          </div>
        </div>
      )}
    </MainLayout>
  );
};

export default TeacherLeaveHistoryPage;
